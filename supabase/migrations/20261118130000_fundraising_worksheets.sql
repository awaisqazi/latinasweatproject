-- Fundraising board worksheets: each subcommittee's getting-started worksheet
-- (take stock, research, size your share, what you need), stored per cycle.
--
--   public.fundraising_worksheet_rows          one row per worksheet line
--   public.fundraising_worksheet_save(jsonb)   the save path (upsert one row)
--   public.fundraising_goal_rollup(text)       subcommittee numbers vs the goal
--
-- Row model:
--   fixed rows  carry a stable row_key (e.g. 'low', 'gala-2026'), unique per
--               (cycle, subcommittee, section); saved by key.
--   added rows  have row_key null and are saved by id.
--
-- Why an RPC for saving: the unique index on row_key is partial (row_key is
-- not null). PostgREST's upsert emits ON CONFLICT (cols) without the index
-- predicate, which Postgres cannot match to a partial index, so
-- supabase-js .upsert(..., { onConflict }) fails with 42P10.
--
-- Access: dashboard users with the fundraising module read and write
-- everything; nobody else sees anything. Additive only.

-- ── Table ───────────────────────────────────────────────────────

create table if not exists public.fundraising_worksheet_rows (
  id uuid primary key default gen_random_uuid(),
  cycle text not null default '2027',
  subcommittee text not null check (subcommittee in ('events', 'grants', 'donors', 'upskilling')),
  section text not null,
  row_key text,
  position integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists fundraising_worksheet_rows_key_uidx
  on public.fundraising_worksheet_rows (cycle, subcommittee, section, row_key)
  where row_key is not null;

create index if not exists fundraising_worksheet_rows_order_idx
  on public.fundraising_worksheet_rows (cycle, subcommittee, section, position);

create index if not exists fundraising_worksheet_rows_created_by_idx
  on public.fundraising_worksheet_rows (created_by);
create index if not exists fundraising_worksheet_rows_updated_by_idx
  on public.fundraising_worksheet_rows (updated_by);

-- ── Triggers ────────────────────────────────────────────────────

create or replace function app_private.fundraising_worksheet_stamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.created_by := v_uid;
      new.updated_by := v_uid;
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if v_uid is not null then
      new.updated_by := v_uid;
    end if;
  end if;
  return new;
end;
$fn$;

revoke all on function app_private.fundraising_worksheet_stamp() from public;

drop trigger if exists fundraising_worksheet_rows_stamp on public.fundraising_worksheet_rows;
create trigger fundraising_worksheet_rows_stamp
before insert or update on public.fundraising_worksheet_rows
for each row execute function app_private.fundraising_worksheet_stamp();

drop trigger if exists set_fundraising_worksheet_rows_updated_at on public.fundraising_worksheet_rows;
create trigger set_fundraising_worksheet_rows_updated_at
before update on public.fundraising_worksheet_rows
for each row execute function public.set_updated_at();

-- ── Grants + RLS ────────────────────────────────────────────────

alter table public.fundraising_worksheet_rows enable row level security;

revoke all on table public.fundraising_worksheet_rows from anon, authenticated;
grant select, insert, update, delete on table public.fundraising_worksheet_rows to authenticated;
grant all on table public.fundraising_worksheet_rows to service_role;

drop policy if exists "Fundraising module can read worksheets" on public.fundraising_worksheet_rows;
create policy "Fundraising module can read worksheets"
on public.fundraising_worksheet_rows for select to authenticated
using ((select app_private.has_module('fundraising')));

drop policy if exists "Fundraising module can add worksheet rows" on public.fundraising_worksheet_rows;
create policy "Fundraising module can add worksheet rows"
on public.fundraising_worksheet_rows for insert to authenticated
with check ((select app_private.has_module('fundraising')));

drop policy if exists "Fundraising module can edit worksheet rows" on public.fundraising_worksheet_rows;
create policy "Fundraising module can edit worksheet rows"
on public.fundraising_worksheet_rows for update to authenticated
using ((select app_private.has_module('fundraising')))
with check ((select app_private.has_module('fundraising')));

drop policy if exists "Fundraising module can delete worksheet rows" on public.fundraising_worksheet_rows;
create policy "Fundraising module can delete worksheet rows"
on public.fundraising_worksheet_rows for delete to authenticated
using ((select app_private.has_module('fundraising')));

-- ── Realtime ────────────────────────────────────────────────────
-- Full replica identity so UPDATE events carry the old row too. With RLS on,
-- DELETE events still carry only the primary key (Supabase Realtime rule).

alter table public.fundraising_worksheet_rows replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fundraising_worksheet_rows'
  ) then
    alter publication supabase_realtime add table public.fundraising_worksheet_rows;
  end if;
end $$;

-- ── Save RPC ────────────────────────────────────────────────────
-- p_row keys: id, cycle, subcommittee, section, row_key, position, data.
--   id given          update that row (data shallow-merged, position if given);
--                     if no row has that id, insert it with that id.
--   row_key given     upsert the fixed row by (cycle, subcommittee, section, row_key).
--   neither           insert an added row (position defaults to the end of the section).
-- data is shallow-merged into the stored object (send a key as null to clear it).
-- Runs as the caller: RLS decides; without the module it raises 42501.

create or replace function public.fundraising_worksheet_save(p_row jsonb)
returns public.fundraising_worksheet_rows
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
  v_cycle text := coalesce(nullif(btrim(p_row->>'cycle'), ''), '2027');
  v_sub text := nullif(btrim(p_row->>'subcommittee'), '');
  v_section text := nullif(btrim(p_row->>'section'), '');
  v_key text := nullif(btrim(p_row->>'row_key'), '');
  v_pos integer;
  v_data jsonb := coalesce(p_row->'data', '{}'::jsonb);
  v_out public.fundraising_worksheet_rows;
begin
  if not coalesce((select app_private.has_module('fundraising')), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if jsonb_typeof(v_data) <> 'object' then
    raise exception 'data must be a JSON object' using errcode = '22023';
  end if;

  if p_row ? 'position' and jsonb_typeof(p_row->'position') = 'number' then
    v_pos := (p_row->>'position')::numeric::integer;
  end if;

  if nullif(btrim(p_row->>'id'), '') is not null then
    v_id := (p_row->>'id')::uuid;
    update public.fundraising_worksheet_rows t
       set data = t.data || v_data,
           position = coalesce(v_pos, t.position)
     where t.id = v_id
    returning * into v_out;
    if found then
      return v_out;
    end if;
  end if;

  if v_sub is null or v_section is null then
    raise exception 'subcommittee and section are required' using errcode = '22023';
  end if;

  if v_key is not null then
    insert into public.fundraising_worksheet_rows as t
      (id, cycle, subcommittee, section, row_key, position, data)
    values
      (coalesce(v_id, gen_random_uuid()), v_cycle, v_sub, v_section, v_key, coalesce(v_pos, 0), v_data)
    on conflict (cycle, subcommittee, section, row_key) where row_key is not null
    do update set
      data = t.data || excluded.data,
      position = coalesce(v_pos, t.position)
    returning * into v_out;
    return v_out;
  end if;

  if v_pos is null then
    select coalesce(max(r.position) + 1, 0) into v_pos
    from public.fundraising_worksheet_rows r
    where r.cycle = v_cycle and r.subcommittee = v_sub and r.section = v_section;
  end if;

  insert into public.fundraising_worksheet_rows
    (id, cycle, subcommittee, section, row_key, position, data)
  values
    (coalesce(v_id, gen_random_uuid()), v_cycle, v_sub, v_section, null, v_pos, v_data)
  returning * into v_out;
  return v_out;
end;
$fn$;

revoke all on function public.fundraising_worksheet_save(jsonb) from public, anon;
grant execute on function public.fundraising_worksheet_save(jsonb) to authenticated, service_role;

-- ── Number parsing (never raises) ───────────────────────────────
-- '$12,500' -> 12500, '12500.50' -> 12500.50, '' / null / 'abc' -> null.

create or replace function app_private.fundraising_parse_number(p text)
returns numeric
language plpgsql
immutable
set search_path = pg_temp
as $fn$
declare
  v text := regexp_replace(coalesce(p, ''), '[\s$,]', '', 'g');
begin
  if v !~ '^-?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' or length(v) > 30 then
    return null;
  end if;
  return v::numeric;
exception when others then
  return null;
end;
$fn$;

revoke all on function app_private.fundraising_parse_number(text) from public;
grant execute on function app_private.fundraising_parse_number(text) to authenticated, service_role;

-- ── Goal rollup ─────────────────────────────────────────────────

create or replace function public.fundraising_goal_rollup(p_cycle text default '2027')
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_cycle text := coalesce(nullif(btrim(p_cycle), ''), '2027');
  v_goals jsonb;
  v_goal_cents bigint;
  v_subs jsonb;
  v_totals jsonb;
  v_people jsonb;
begin
  if not coalesce((select app_private.has_module('fundraising')), false) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  -- app_settings.fundraising_goals: {"2027": 100000000} (cents by year).
  -- Tolerate a JSON string holding that object, and string or number values.
  select s.value into v_goals from public.app_settings s where s.key = 'fundraising_goals';
  begin
    if jsonb_typeof(v_goals) = 'string' then
      v_goals := (v_goals #>> '{}')::jsonb;
    end if;
    if jsonb_typeof(v_goals) = 'object' then
      v_goal_cents := round(app_private.fundraising_parse_number(v_goals->>v_cycle))::bigint;
    end if;
  exception when others then
    v_goal_cents := null;
  end;

  with subs(id, ord) as (
    values ('events', 1), ('grants', 2), ('donors', 3), ('upskilling', 4)
  ),
  wr as (
    select r.* from public.fundraising_worksheet_rows r where r.cycle = v_cycle
  ),
  per_sub as (
    select r.subcommittee,
      max(round(100 * app_private.fundraising_parse_number(r.data->>'amount'))) filter (where r.row_key = 'low')::bigint as low_cents,
      max(round(100 * app_private.fundraising_parse_number(r.data->>'amount'))) filter (where r.row_key = 'realistic')::bigint as realistic_cents,
      max(round(100 * app_private.fundraising_parse_number(r.data->>'amount'))) filter (where r.row_key = 'stretch')::bigint as stretch_cents
    from wr r
    where r.section = 'size_share'
      and r.row_key in ('low', 'realistic', 'stretch')
      and r.subcommittee in ('events', 'grants', 'donors')
    group by r.subcommittee
  ),
  people_filled as (
    select bool_or(app_private.fundraising_parse_number(r.data->>'realistic') is not null) as filled
    from wr r
    where r.subcommittee = 'upskilling' and r.section = 'size_share'
      and r.row_key in ('people_trained', 'made_ask', 'introductions', 'employer_matches')
  ),
  last_change as (
    select r.subcommittee, max(r.updated_at) as updated_at from wr r group by r.subcommittee
  ),
  so as (
    select s.ord,
      jsonb_build_object(
        'id', s.id,
        'low_cents', p.low_cents,
        'realistic_cents', p.realistic_cents,
        'stretch_cents', p.stretch_cents,
        'filled', case when s.id = 'upskilling'
                       then coalesce((select pf.filled from people_filled pf), false)
                       else p.realistic_cents is not null end,
        'updated_at', l.updated_at
      ) as j,
      p.low_cents, p.realistic_cents, p.stretch_cents
    from subs s
    left join per_sub p on p.subcommittee = s.id
    left join last_change l on l.subcommittee = s.id
  )
  select
    jsonb_agg(o.j order by o.ord),
    jsonb_build_object(
      'low_cents', coalesce(sum(o.low_cents), 0)::bigint,
      'realistic_cents', coalesce(sum(o.realistic_cents), 0)::bigint,
      'stretch_cents', coalesce(sum(o.stretch_cents), 0)::bigint
    )
  into v_subs, v_totals
  from so o;

  with measures(k, ord) as (
    values ('people_trained', 1), ('made_ask', 2), ('introductions', 3), ('employer_matches', 4)
  ),
  m as (
    select r.row_key,
      app_private.fundraising_parse_number(r.data->>'low') as low,
      app_private.fundraising_parse_number(r.data->>'realistic') as realistic,
      app_private.fundraising_parse_number(r.data->>'stretch') as stretch
    from public.fundraising_worksheet_rows r
    where r.cycle = v_cycle and r.subcommittee = 'upskilling' and r.section = 'size_share'
      and r.row_key in ('people_trained', 'made_ask', 'introductions', 'employer_matches')
  )
  select jsonb_object_agg(ms.k, jsonb_build_object(
    'low', m.low, 'realistic', m.realistic, 'stretch', m.stretch))
  into v_people
  from measures ms left join m on m.row_key = ms.k;

  return jsonb_build_object(
    'ok', true,
    'cycle', v_cycle,
    'goal_cents', v_goal_cents,
    'subcommittees', v_subs,
    'totals', v_totals,
    'people', v_people
  );
end;
$fn$;

revoke all on function public.fundraising_goal_rollup(text) from public, anon;
grant execute on function public.fundraising_goal_rollup(text) to authenticated, service_role;
