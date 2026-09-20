-- Gala seating planner (/galaseating): ONE shared live plan, edited by several
-- planners at once, behind a passcode.
--
-- The planner page is a static, unlisted page in a PUBLIC repo, so it cannot keep
-- a secret. The gate is therefore enforced in Postgres, not in JavaScript: every
-- table here has RLS on, zero grants and zero policies, and the only way in is a
-- set of SECURITY DEFINER RPCs that check the submitted passcode against a bcrypt
-- hash held in a private table.
--
-- The passcode and its hash are NEVER committed. This migration creates the
-- machinery only; the hash is written out of band (see "Rotating the passcode" at
-- the bottom of this file).
--
-- Failed attempts are recorded and throttled. Note the deliberate shape of the
-- RPCs: they RETURN a jsonb error object instead of raising, because a function
-- that raises rolls back its own attempt row and the throttle would never fire.
--
-- Collaboration is op based, not document based. src/lib/galaSeating/ops.js is the
-- reference implementation of the op vocabulary and gala_seating_apply_op below
-- mirrors it statement for statement: both sides apply identical rules, so the
-- clients converge on exactly what this database holds and there is no conflict
-- dialog anywhere in the UI. Because the tables are unreadable by anon, Realtime
-- postgres_changes is unusable; the client uses a Broadcast channel as a doorbell
-- and calls gala_seating_since to fetch what it missed.
--
-- pgcrypto lives in the `extensions` schema on this project, so crypt/gen_salt are
-- schema-qualified and every function pins search_path.

-- 1) Tables ------------------------------------------------------------------

-- The passcode hash. One row per planning slug (the gala is 'gala-2026').
create table if not exists public.gala_seating_access (
  slug text primary key,
  pass_hash text not null,
  updated_at timestamptz not null default now(),
  constraint gala_seating_access_slug_check
    check (char_length(slug) between 1 and 80)
);

-- The live plan. `plan` is the Plan object from src/lib/galaSeating/model.js and
-- holds guest names, emails, phones, meals and notes: it never leaves this table
-- except through the RPCs below.
create table if not exists public.gala_seating_plans (
  slug text primary key,
  plan jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  constraint gala_seating_plans_slug_check
    check (char_length(slug) between 1 and 80),
  constraint gala_seating_plans_version_check
    check (version >= 0)
);

-- The op log: one row per applied batch. A client that was away replays the rows
-- after its base version instead of re-downloading the whole plan.
create table if not exists public.gala_seating_ops (
  slug text not null,
  version integer not null,
  client text not null default '',
  editor text not null default '',
  ops jsonb not null,
  at timestamptz not null default now(),
  primary key (slug, version)
);

create index if not exists gala_seating_ops_slug_version_idx
  on public.gala_seating_ops (slug, version desc);

-- Snapshots: automatic ones (before every whole-plan `replace`, and at most one
-- per 10 minutes of editing) plus named ones a planner asks for.
create table if not exists public.gala_seating_history (
  slug text not null,
  version integer not null,
  plan jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  guest_count integer not null default 0,
  seated_count integer not null default 0,
  primary key (slug, version)
);

alter table public.gala_seating_history add column if not exists label text;
alter table public.gala_seating_history add column if not exists auto boolean not null default true;

create index if not exists gala_seating_history_slug_version_idx
  on public.gala_seating_history (slug, version desc);

-- Throttle ledger. Only failures are recorded (a poll from each open tab would
-- otherwise write a row a second); `ok` is kept for shape and future auditing.
create table if not exists public.gala_seating_attempts (
  id bigserial primary key,
  slug text,
  ok boolean not null default false,
  at timestamptz not null default now()
);

create index if not exists gala_seating_attempts_slug_at_idx
  on public.gala_seating_attempts (slug, at desc);

-- 2) RLS + grants ------------------------------------------------------------
-- RLS on, zero grants, zero policies: deny by default for every Data API role.
-- Supabase's default privileges grant new public tables to anon/authenticated, so
-- the explicit REVOKE below is load bearing, not decorative. All access is through
-- the SECURITY DEFINER functions, which run as the owner and so are unaffected.

alter table public.gala_seating_access enable row level security;
alter table public.gala_seating_plans enable row level security;
alter table public.gala_seating_ops enable row level security;
alter table public.gala_seating_history enable row level security;
alter table public.gala_seating_attempts enable row level security;

revoke all on table public.gala_seating_access from anon, authenticated, service_role;
revoke all on table public.gala_seating_plans from anon, authenticated, service_role;
revoke all on table public.gala_seating_ops from anon, authenticated, service_role;
revoke all on table public.gala_seating_history from anon, authenticated, service_role;
revoke all on table public.gala_seating_attempts from anon, authenticated, service_role;

revoke all on sequence public.gala_seating_attempts_id_seq from anon, authenticated, service_role;

-- 3) Guard -------------------------------------------------------------------
-- Single place where a passcode is checked. Returns 'ok' | 'bad-passcode' |
-- 'locked'. Never granted to a Data API role: only the RPCs below call it.

create or replace function public.gala_seating_guard(p_slug text, p_pass text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_hash text;
  v_fails integer;
begin
  if v_slug = '' or char_length(v_slug) > 80 then
    return 'bad-passcode';
  end if;

  -- Opportunistic prune, roughly one call in twenty.
  if random() < 0.05 then
    delete from public.gala_seating_attempts where at < now() - interval '1 day';
  end if;

  select count(*) into v_fails
  from public.gala_seating_attempts
  where slug = v_slug
    and not ok
    and at > now() - interval '10 minutes';

  -- Eight recent failures locks the slug for everyone, without so much as looking
  -- at the submitted passcode.
  if v_fails >= 8 then
    return 'locked';
  end if;

  select pass_hash into v_hash from public.gala_seating_access where slug = v_slug;

  if v_hash is null then
    -- Unknown slug: indistinguishable from a wrong passcode, but not logged, so
    -- random slugs cannot be used to grow the attempts table.
    perform pg_catalog.pg_sleep(0.4);
    return 'bad-passcode';
  end if;

  if p_pass is null or p_pass = '' or extensions.crypt(p_pass, v_hash) <> v_hash then
    insert into public.gala_seating_attempts (slug, ok) values (v_slug, false);
    perform pg_catalog.pg_sleep(0.4);
    return 'bad-passcode';
  end if;

  -- A planner who mistyped once and then got in should not leave the slug one
  -- typo away from a lockout.
  if v_fails > 0 then
    delete from public.gala_seating_attempts where slug = v_slug and not ok;
  end if;

  return 'ok';
end;
$fn$;

revoke all on function public.gala_seating_guard(text, text) from public, anon, authenticated, service_role;

-- 4) Op application ----------------------------------------------------------
-- Mirrors src/lib/galaSeating/ops.js. Read the two side by side before changing
-- either: a divergence here shows up as two planners seeing different rooms.

-- JavaScript's Number() coercion, as far as the ops need it: numbers and numeric
-- strings become integers, null becomes 0, everything non-integral is rejected.
create or replace function public.gala_seating_to_int(p_value jsonb)
returns integer
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_num numeric;
begin
  if p_value is null then
    return null;
  end if;

  case jsonb_typeof(p_value)
    when 'null' then return 0;
    when 'boolean' then return case when p_value = 'true'::jsonb then 1 else 0 end;
    when 'number' then v_num := p_value::text::numeric;
    when 'string' then
      begin
        if btrim(p_value #>> '{}') = '' then
          return 0;
        end if;
        v_num := btrim(p_value #>> '{}')::numeric;
      exception when others then
        return null;
      end;
    else return null;
  end case;

  if v_num is null or v_num <> trunc(v_num) then
    return null;
  end if;

  return v_num::integer;
exception when others then
  return null;
end;
$fn$;

revoke all on function public.gala_seating_to_int(jsonb) from public, anon, authenticated, service_role;

create or replace function public.gala_seating_apply_op(p_plan jsonb, p_op jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
declare
  v_kind text;
  v_g text;
  v_t text;
  v_id text;
  v_coll text;
  v_seat integer;
  v_max integer;
  v_idx integer;
  v_table jsonb;
  v_guest jsonb;
  v_patch jsonb;
  v_item jsonb;
  v_list jsonb;
  v_seating jsonb;
  v_next jsonb;
begin
  if p_op is null or jsonb_typeof(p_op) <> 'object' then
    return p_plan;
  end if;

  v_kind := p_op ->> 'op';

  -- { op: "seat", g, t, s }
  if v_kind = 'seat' then
    v_g := p_op ->> 'g';
    v_t := p_op ->> 't';
    if v_g is null then
      return p_plan;
    end if;

    v_guest := p_plan -> 'guests' -> v_g;
    if v_guest is null or jsonb_typeof(v_guest) = 'null' then
      return p_plan;
    end if;

    select e into v_table
    from jsonb_array_elements(coalesce(p_plan -> 'tables', '[]'::jsonb)) e
    where (e ->> 'id') is not distinct from v_t
    limit 1;

    if v_table is null then
      return p_plan;
    end if;

    v_seat := public.gala_seating_to_int(p_op -> 's');
    if v_seat is null or v_seat < 0 then
      return p_plan;
    end if;

    -- JS compares `seat >= table.seats`; a non-numeric `seats` makes that false,
    -- so an unusable table shape must not silently reject the op here either.
    v_max := public.gala_seating_to_int(v_table -> 'seats');
    if v_max is not null and v_seat >= v_max then
      return p_plan;
    end if;

    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_seating
    from jsonb_each(coalesce(p_plan -> 'seating', '{}'::jsonb)) as s(k, v)
    where k <> v_g
      and not (
        (v ->> 'tableId') is not distinct from v_t
        and public.gala_seating_to_int(v -> 'seat') is not distinct from v_seat
      );

    return p_plan || jsonb_build_object(
      'seating',
      v_seating || jsonb_build_object(
        v_g, jsonb_build_object('tableId', to_jsonb(v_t), 'seat', to_jsonb(v_seat))
      )
    );

  -- { op: "unseat", g }
  elsif v_kind = 'unseat' then
    v_g := p_op ->> 'g';
    if v_g is null then
      return p_plan;
    end if;
    v_next := p_plan -> 'seating' -> v_g;
    if v_next is null or jsonb_typeof(v_next) = 'null' then
      return p_plan;
    end if;
    return p_plan || jsonb_build_object(
      'seating', coalesce(p_plan -> 'seating', '{}'::jsonb) - v_g
    );

  -- { op: "clear_seats", t? }
  elsif v_kind = 'clear_seats' then
    v_t := p_op ->> 't';
    if v_t is null or v_t = '' then
      return p_plan || jsonb_build_object('seating', '{}'::jsonb);
    end if;

    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_seating
    from jsonb_each(coalesce(p_plan -> 'seating', '{}'::jsonb)) as s(k, v)
    where (v ->> 'tableId') is distinct from v_t;

    return p_plan || jsonb_build_object('seating', v_seating);

  -- { op: "guest_put", guest }
  elsif v_kind = 'guest_put' then
    v_guest := p_op -> 'guest';
    if v_guest is null or jsonb_typeof(v_guest) <> 'object'
       or coalesce(v_guest ->> 'id', '') = '' then
      return p_plan;
    end if;
    return p_plan || jsonb_build_object(
      'guests',
      coalesce(p_plan -> 'guests', '{}'::jsonb) || jsonb_build_object(v_guest ->> 'id', v_guest)
    );

  -- { op: "guest_patch", g, patch }
  elsif v_kind = 'guest_patch' then
    v_g := p_op ->> 'g';
    v_patch := p_op -> 'patch';
    if v_g is null or v_patch is null or jsonb_typeof(v_patch) <> 'object' then
      return p_plan;
    end if;
    v_guest := p_plan -> 'guests' -> v_g;
    if v_guest is null or jsonb_typeof(v_guest) <> 'object' then
      return p_plan;
    end if;

    v_next := v_guest || v_patch;
    -- `{ ...g, ...patch, id: g.id }`: the original id always wins, and a guest
    -- with no id at all ends up with none (JSON drops an undefined value).
    if v_guest ? 'id' then
      v_next := v_next || jsonb_build_object('id', v_guest -> 'id');
    else
      v_next := v_next - 'id';
    end if;

    return p_plan || jsonb_build_object(
      'guests', coalesce(p_plan -> 'guests', '{}'::jsonb) || jsonb_build_object(v_g, v_next)
    );

  -- { op: "guest_del", g }
  elsif v_kind = 'guest_del' then
    v_g := p_op ->> 'g';
    if v_g is null then
      return p_plan;
    end if;
    v_guest := p_plan -> 'guests' -> v_g;
    if v_guest is null or jsonb_typeof(v_guest) = 'null' then
      return p_plan;
    end if;

    -- Note the JS semantics being mirrored: EVERY constraint is rebuilt, so any
    -- constraint left with fewer than two guests is dropped, not only the ones
    -- this guest appeared in.
    select coalesce(jsonb_agg(c2 order by ord), '[]'::jsonb) into v_list
    from (
      select
        o as ord,
        c || jsonb_build_object(
          'guestIds',
          coalesce((
            select jsonb_agg(x order by xo)
            from jsonb_array_elements(coalesce(c -> 'guestIds', '[]'::jsonb)) with ordinality as gi(x, xo)
            where x <> to_jsonb(v_g)
          ), '[]'::jsonb)
        ) as c2
      from jsonb_array_elements(coalesce(p_plan -> 'constraints', '[]'::jsonb)) with ordinality as cs(c, o)
    ) t
    where jsonb_array_length(c2 -> 'guestIds') >= 2;

    return p_plan || jsonb_build_object(
      'guests', coalesce(p_plan -> 'guests', '{}'::jsonb) - v_g,
      'seating', coalesce(p_plan -> 'seating', '{}'::jsonb) - v_g,
      'constraints', v_list
    );

  -- { op: "item_put", coll, item }
  elsif v_kind = 'item_put' then
    v_coll := p_op ->> 'coll';
    if v_coll is null or v_coll not in ('tables', 'fixtures', 'constraints') then
      return p_plan;
    end if;
    v_item := p_op -> 'item';
    if v_item is null or jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'id', '') = '' then
      return p_plan;
    end if;

    v_list := coalesce(p_plan -> v_coll, '[]'::jsonb);
    v_id := v_item ->> 'id';

    select min(o) into v_idx
    from jsonb_array_elements(v_list) with ordinality as t(x, o)
    where (x ->> 'id') = v_id;

    if v_idx is null then
      v_list := v_list || jsonb_build_array(v_item);
    else
      -- findIndex + map: only the FIRST match is replaced.
      select coalesce(jsonb_agg(case when o = v_idx then v_item else x end order by o), '[]'::jsonb)
      into v_list
      from jsonb_array_elements(v_list) with ordinality as t(x, o);
    end if;

    return p_plan || jsonb_build_object(v_coll, v_list);

  -- { op: "item_patch", coll, id, patch }
  elsif v_kind = 'item_patch' then
    v_coll := p_op ->> 'coll';
    v_patch := p_op -> 'patch';
    if v_coll is null or v_coll not in ('tables', 'fixtures', 'constraints')
       or v_patch is null or jsonb_typeof(v_patch) <> 'object' then
      return p_plan;
    end if;

    v_list := coalesce(p_plan -> v_coll, '[]'::jsonb);
    v_id := p_op ->> 'id';

    if not exists (
      select 1 from jsonb_array_elements(v_list) x
      where jsonb_typeof(x) = 'object' and (x ->> 'id') is not distinct from v_id
    ) then
      return p_plan;
    end if;

    select coalesce(jsonb_agg(
      case
        when jsonb_typeof(x) = 'object' and (x ->> 'id') is not distinct from v_id then
          case when x ? 'id'
            then (x || v_patch) || jsonb_build_object('id', x -> 'id')
            else (x || v_patch) - 'id'
          end
        else x
      end order by o), '[]'::jsonb)
    into v_list
    from jsonb_array_elements(v_list) with ordinality as t(x, o);

    return p_plan || jsonb_build_object(v_coll, v_list);

  -- { op: "item_del", coll, id }
  elsif v_kind = 'item_del' then
    v_coll := p_op ->> 'coll';
    if v_coll is null or v_coll not in ('tables', 'fixtures', 'constraints') then
      return p_plan;
    end if;

    v_id := p_op ->> 'id';

    select coalesce(jsonb_agg(x order by o), '[]'::jsonb) into v_list
    from jsonb_array_elements(coalesce(p_plan -> v_coll, '[]'::jsonb)) with ordinality as t(x, o)
    where (x ->> 'id') is distinct from v_id;

    v_next := p_plan || jsonb_build_object(v_coll, v_list);

    if v_coll = 'tables' then
      select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_seating
      from jsonb_each(coalesce(p_plan -> 'seating', '{}'::jsonb)) as s(k, v)
      where (v ->> 'tableId') is distinct from v_id;

      v_next := v_next || jsonb_build_object('seating', v_seating);
    end if;

    return v_next;

  -- { op: "meta_patch", patch }
  elsif v_kind = 'meta_patch' then
    v_patch := p_op -> 'patch';
    if v_patch is null or jsonb_typeof(v_patch) <> 'object' then
      return p_plan;
    end if;
    return p_plan || jsonb_build_object(
      'meta', coalesce(p_plan -> 'meta', '{}'::jsonb) || v_patch
    );

  -- { op: "dismiss", key, on }
  elsif v_kind = 'dismiss' then
    v_id := p_op ->> 'key';
    if v_id is null or v_id = '' then
      return p_plan;
    end if;
    if p_op -> 'on' = 'false'::jsonb then
      return p_plan || jsonb_build_object(
        'dismissed', coalesce(p_plan -> 'dismissed', '{}'::jsonb) - v_id
      );
    end if;
    return p_plan || jsonb_build_object(
      'dismissed',
      coalesce(p_plan -> 'dismissed', '{}'::jsonb) || jsonb_build_object(v_id, true)
    );

  -- { op: "replace", plan }
  elsif v_kind = 'replace' then
    v_next := p_op -> 'plan';
    if v_next is null or jsonb_typeof(v_next) not in ('object', 'array') then
      return p_plan;
    end if;
    return v_next;
  end if;

  -- Unknown ops are ignored, exactly as in ops.js.
  return p_plan;
end;
$fn$;

revoke all on function public.gala_seating_apply_op(jsonb, jsonb) from public, anon, authenticated, service_role;

create or replace function public.gala_seating_apply_ops(p_plan jsonb, p_ops jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
declare
  v_plan jsonb := p_plan;
  v_op jsonb;
begin
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    return v_plan;
  end if;

  for v_op in select e from jsonb_array_elements(p_ops) e loop
    v_plan := public.gala_seating_apply_op(v_plan, v_op);
  end loop;

  return v_plan;
end;
$fn$;

revoke all on function public.gala_seating_apply_ops(jsonb, jsonb) from public, anon, authenticated, service_role;

-- Key counts for the snapshot list: how many guests the plan holds and how many
-- of them have a seat.
create or replace function public.gala_seating_counts(p_plan jsonb, p_key text)
returns integer
language sql
immutable
set search_path = pg_catalog, pg_temp
as $fn$
  select case
    when jsonb_typeof(p_plan -> p_key) = 'object'
      then (select count(*)::integer from jsonb_object_keys(p_plan -> p_key))
    else 0
  end
$fn$;

revoke all on function public.gala_seating_counts(jsonb, text) from public, anon, authenticated, service_role;

-- Snapshot writer. Automatic snapshots are pruned to the newest 100 per slug;
-- named ones (label set) are never pruned.
create or replace function public.gala_seating_write_snapshot(
  p_slug text,
  p_version integer,
  p_plan jsonb,
  p_editor text,
  p_label text,
  p_auto boolean
)
returns void
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    return;
  end if;

  insert into public.gala_seating_history (
    slug, version, plan, updated_at, updated_by, guest_count, seated_count, label, auto
  )
  values (
    p_slug, p_version, p_plan, now(), coalesce(p_editor, ''),
    public.gala_seating_counts(p_plan, 'guests'),
    public.gala_seating_counts(p_plan, 'seating'),
    nullif(btrim(coalesce(p_label, '')), ''),
    p_auto
  )
  on conflict (slug, version) do update
    set plan = excluded.plan,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by,
        guest_count = excluded.guest_count,
        seated_count = excluded.seated_count,
        label = coalesce(excluded.label, gala_seating_history.label),
        auto = gala_seating_history.auto and excluded.auto;

  delete from public.gala_seating_history h
  where h.slug = p_slug
    and h.auto
    and h.version not in (
      select version
      from public.gala_seating_history
      where slug = p_slug and auto
      order by version desc
      limit 100
    );
end;
$fn$;

revoke all on function public.gala_seating_write_snapshot(text, integer, jsonb, text, text, boolean)
  from public, anon, authenticated, service_role;

-- 5) Public RPCs -------------------------------------------------------------

create or replace function public.gala_seating_verify(p_slug text, p_pass text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_guard text := public.gala_seating_guard(p_slug, p_pass);
begin
  if v_guard <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_guard);
  end if;

  return jsonb_build_object('ok', true);
end;
$fn$;

create or replace function public.gala_seating_load(p_slug text, p_pass text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_guard text := public.gala_seating_guard(v_slug, p_pass);
  v_row public.gala_seating_plans%rowtype;
begin
  if v_guard <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_guard);
  end if;

  select * into v_row from public.gala_seating_plans where slug = v_slug;

  return jsonb_build_object(
    'ok', true,
    'plan', v_row.plan,
    'version', coalesce(v_row.version, 0),
    'updated_at', v_row.updated_at,
    'updated_by', coalesce(v_row.updated_by, '')
  );
end;
$fn$;

create or replace function public.gala_seating_check(p_slug text, p_pass text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_guard text := public.gala_seating_guard(v_slug, p_pass);
  v_row public.gala_seating_plans%rowtype;
begin
  if v_guard <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_guard);
  end if;

  select * into v_row from public.gala_seating_plans where slug = v_slug;

  return jsonb_build_object(
    'ok', true,
    'version', coalesce(v_row.version, 0),
    'updated_at', v_row.updated_at,
    'updated_by', coalesce(v_row.updated_by, '')
  );
end;
$fn$;

-- The heart of it. Applies a batch of ops under a row lock and tells the caller
-- what it missed while it was composing them.
create or replace function public.gala_seating_apply(
  p_slug text,
  p_pass text,
  p_client text,
  p_base_version integer,
  p_ops jsonb,
  p_editor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_guard text;
  v_client text := left(btrim(coalesce(p_client, '')), 60);
  v_editor text := left(btrim(coalesce(p_editor, '')), 60);
  v_base integer := coalesce(p_base_version, 0);
  v_row public.gala_seating_plans%rowtype;
  v_current integer;
  v_next integer;
  v_plan jsonb;
  v_before jsonb;
  v_now timestamptz := now();
  v_has_replace boolean;
  v_reset boolean := false;
  v_oldest integer;
  v_last_snap timestamptz;
  v_missed jsonb;
begin
  v_guard := public.gala_seating_guard(v_slug, p_pass);
  if v_guard <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_guard);
  end if;

  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-ops');
  end if;

  if jsonb_array_length(p_ops) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'too-many-ops');
  end if;

  if octet_length(p_ops::text) > 2097152 then
    return jsonb_build_object('ok', false, 'reason', 'too-large');
  end if;

  v_has_replace := p_ops @> '[{"op": "replace"}]'::jsonb;

  -- Serialize writers of the same slug: FOR UPDATE locks nothing when the row
  -- does not exist yet, so two first writers could otherwise race the insert.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('gala_seating:' || v_slug));

  select * into v_row from public.gala_seating_plans where slug = v_slug for update;
  v_current := coalesce(v_row.version, 0);

  if v_row.slug is null then
    -- First use: the plan may only be brought into existence by seeding it whole.
    if jsonb_array_length(p_ops) <> 1 or not v_has_replace then
      return jsonb_build_object('ok', false, 'reason', 'no-plan');
    end if;
    v_before := '{}'::jsonb;
  else
    v_before := v_row.plan;
  end if;

  if jsonb_array_length(p_ops) = 0 then
    return jsonb_build_object('ok', true, 'version', v_current, 'missed', '[]'::jsonb);
  end if;

  v_plan := public.gala_seating_apply_ops(v_before, p_ops);

  if v_plan is null or jsonb_typeof(v_plan) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-plan');
  end if;

  if octet_length(v_plan::text) > 2097152 then
    return jsonb_build_object('ok', false, 'reason', 'too-large');
  end if;

  v_next := v_current + 1;

  -- A whole-plan swap is the one edit worth keeping a "before" picture of.
  if v_has_replace and v_row.slug is not null then
    perform public.gala_seating_write_snapshot(
      v_slug, v_current, v_before, coalesce(v_row.updated_by, ''), null, true
    );
  end if;

  insert into public.gala_seating_plans (slug, plan, version, updated_at, updated_by)
  values (v_slug, v_plan, v_next, v_now, v_editor)
  on conflict (slug) do update
    set plan = excluded.plan,
        version = excluded.version,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  insert into public.gala_seating_ops (slug, version, client, editor, ops, at)
  values (v_slug, v_next, v_client, v_editor, p_ops, v_now)
  on conflict (slug, version) do update
    set client = excluded.client,
        editor = excluded.editor,
        ops = excluded.ops,
        at = excluded.at;

  -- Versions only ever advance by one here, so this keeps exactly the newest 3000.
  delete from public.gala_seating_ops
  where slug = v_slug and version <= v_next - 3000;

  -- A heartbeat snapshot at most every ten minutes of editing.
  select max(updated_at) into v_last_snap
  from public.gala_seating_history where slug = v_slug;

  if v_last_snap is null or v_last_snap < v_now - interval '10 minutes' then
    perform public.gala_seating_write_snapshot(v_slug, v_next, v_plan, v_editor, null, true);
  end if;

  -- What this client missed: everyone else's batches since its base version.
  if v_base < v_current then
    select min(version) into v_oldest from public.gala_seating_ops where slug = v_slug;

    if v_oldest is null or v_oldest > v_base + 1 then
      v_reset := true;   -- the log no longer reaches back that far
    elsif exists (
      select 1 from public.gala_seating_ops
      where slug = v_slug and version > v_base and version <= v_current
        and ops @> '[{"op": "replace"}]'::jsonb
    ) then
      v_reset := true;   -- an op-by-op replay cannot express a whole-plan swap
    end if;
  end if;

  if v_reset then
    return jsonb_build_object(
      'ok', true,
      'version', v_next,
      'reset', jsonb_build_object('plan', v_plan)
    );
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'version', o.version, 'client', o.client, 'editor', o.editor,
      'at', o.at, 'ops', o.ops
    ) order by o.version
  ), '[]'::jsonb)
  into v_missed
  from public.gala_seating_ops o
  where o.slug = v_slug
    and o.version > v_base
    and o.version < v_next
    and o.client is distinct from v_client;

  return jsonb_build_object('ok', true, 'version', v_next, 'missed', v_missed);
end;
$fn$;

-- Catch-up poll: every batch after p_version, from every client.
create or replace function public.gala_seating_since(
  p_slug text,
  p_pass text,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_guard text := public.gala_seating_guard(v_slug, p_pass);
  v_base integer := coalesce(p_version, 0);
  v_row public.gala_seating_plans%rowtype;
  v_current integer;
  v_oldest integer;
  v_reset boolean := false;
  v_batches jsonb;
begin
  if v_guard <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_guard);
  end if;

  select * into v_row from public.gala_seating_plans where slug = v_slug;
  v_current := coalesce(v_row.version, 0);

  if v_base >= v_current then
    return jsonb_build_object('ok', true, 'version', v_current, 'batches', '[]'::jsonb);
  end if;

  select min(version) into v_oldest from public.gala_seating_ops where slug = v_slug;

  if v_oldest is null or v_oldest > v_base + 1 then
    v_reset := true;
  elsif exists (
    select 1 from public.gala_seating_ops
    where slug = v_slug and version > v_base and version <= v_current
      and ops @> '[{"op": "replace"}]'::jsonb
  ) then
    v_reset := true;
  end if;

  if v_reset then
    return jsonb_build_object(
      'ok', true,
      'version', v_current,
      'reset', jsonb_build_object('plan', v_row.plan)
    );
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'version', o.version, 'client', o.client, 'editor', o.editor,
      'at', o.at, 'ops', o.ops
    ) order by o.version
  ), '[]'::jsonb)
  into v_batches
  from public.gala_seating_ops o
  where o.slug = v_slug and o.version > v_base and o.version <= v_current;

  return jsonb_build_object('ok', true, 'version', v_current, 'batches', v_batches);
end;
$fn$;

-- A named version the planners can come back to.
create or replace function public.gala_seating_snapshot(
  p_slug text,
  p_pass text,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_guard text := public.gala_seating_guard(v_slug, p_pass);
  v_row public.gala_seating_plans%rowtype;
  v_label text := left(nullif(btrim(coalesce(p_label, '')), ''), 80);
begin
  if v_guard <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_guard);
  end if;

  select * into v_row from public.gala_seating_plans where slug = v_slug;

  if v_row.slug is null then
    return jsonb_build_object('ok', false, 'reason', 'no-plan');
  end if;

  perform public.gala_seating_write_snapshot(
    v_slug, v_row.version, v_row.plan, coalesce(v_row.updated_by, ''),
    coalesce(v_label, 'Saved version'), false
  );

  return jsonb_build_object('ok', true, 'version', v_row.version);
end;
$fn$;

create or replace function public.gala_seating_history_list(p_slug text, p_pass text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_guard text := public.gala_seating_guard(v_slug, p_pass);
  v_items jsonb;
begin
  if v_guard <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_guard);
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'version', h.version,
      'at', h.updated_at,
      'editor', h.updated_by,
      'guest_count', h.guest_count,
      'seated_count', h.seated_count,
      'label', h.label
    ) order by h.version desc
  ), '[]'::jsonb)
  into v_items
  from (
    select version, updated_at, updated_by, guest_count, seated_count, label
    from public.gala_seating_history
    where slug = v_slug
    order by version desc
    limit 50
  ) h;

  return jsonb_build_object('ok', true, 'items', v_items);
end;
$fn$;

create or replace function public.gala_seating_history_get(
  p_slug text,
  p_pass text,
  p_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_guard text := public.gala_seating_guard(v_slug, p_pass);
  v_plan jsonb;
begin
  if v_guard <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_guard);
  end if;

  select plan into v_plan
  from public.gala_seating_history
  where slug = v_slug and version = p_version;

  return jsonb_build_object('ok', true, 'plan', v_plan);
end;
$fn$;

-- 6) Owner-only passcode setter ----------------------------------------------
-- Deliberately NOT callable from the Data API. The owner runs it from the SQL
-- editor (or the Management API) so the passcode never appears in this repo.

create or replace function public.gala_seating_set_passcode(p_slug text, p_new_pass text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_pass text := coalesce(p_new_pass, '');
begin
  if v_slug = '' or char_length(v_slug) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-slug');
  end if;

  if char_length(v_pass) < 6 then
    return jsonb_build_object('ok', false, 'reason', 'passcode-too-short');
  end if;

  insert into public.gala_seating_access (slug, pass_hash, updated_at)
  values (v_slug, extensions.crypt(v_pass, extensions.gen_salt('bf', 10)), now())
  on conflict (slug) do update
    set pass_hash = excluded.pass_hash,
        updated_at = excluded.updated_at;

  -- A rotation should not inherit an old lockout.
  delete from public.gala_seating_attempts where slug = v_slug;

  return jsonb_build_object('ok', true, 'slug', v_slug);
end;
$fn$;

-- 7) Grants ------------------------------------------------------------------

-- Retired: the document-at-a-time save this file used to ship, replaced by
-- gala_seating_apply. Dropped rather than left dangling so nothing can call it.
drop function if exists public.gala_seating_save(text, text, jsonb, integer, text);

revoke all on function public.gala_seating_verify(text, text) from public;
grant execute on function public.gala_seating_verify(text, text) to anon, authenticated;

revoke all on function public.gala_seating_load(text, text) from public;
grant execute on function public.gala_seating_load(text, text) to anon, authenticated;

revoke all on function public.gala_seating_check(text, text) from public;
grant execute on function public.gala_seating_check(text, text) to anon, authenticated;

revoke all on function public.gala_seating_apply(text, text, text, integer, jsonb, text) from public;
grant execute on function public.gala_seating_apply(text, text, text, integer, jsonb, text) to anon, authenticated;

revoke all on function public.gala_seating_since(text, text, integer) from public;
grant execute on function public.gala_seating_since(text, text, integer) to anon, authenticated;

revoke all on function public.gala_seating_snapshot(text, text, text) from public;
grant execute on function public.gala_seating_snapshot(text, text, text) to anon, authenticated;

revoke all on function public.gala_seating_history_list(text, text) from public;
grant execute on function public.gala_seating_history_list(text, text) to anon, authenticated;

revoke all on function public.gala_seating_history_get(text, text, integer) from public;
grant execute on function public.gala_seating_history_get(text, text, integer) to anon, authenticated;

-- No grant here, on purpose.
revoke all on function public.gala_seating_set_passcode(text, text) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- Rotating the passcode ------------------------------------------------------
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor), substituting the
-- new passcode. Never commit the value, and never paste it into a page URL.
--
--   select public.gala_seating_set_passcode('gala-2026', '<new passcode>');
--
-- To clear a lockout without rotating:
--
--   delete from public.gala_seating_attempts where slug = 'gala-2026';
--
-- To retire the planner after the gala (guest data removal):
--
--   delete from public.gala_seating_ops where slug = 'gala-2026';
--   delete from public.gala_seating_history where slug = 'gala-2026';
--   delete from public.gala_seating_plans where slug = 'gala-2026';
--   delete from public.gala_seating_access where slug = 'gala-2026';
