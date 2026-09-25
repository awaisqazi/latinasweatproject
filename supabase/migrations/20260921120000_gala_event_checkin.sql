-- Gala check-in + paddle assignment, event scoped (first used by 'gala-2026').
--
-- WHY THIS EXISTS. In 2025 several volunteers checked guests in at once and two
-- devices handed out the SAME new paddle number: the browser computed
-- "next paddle = max(paddle) + 1" from a list it had polled up to 20 s earlier.
-- Here the number is chosen by Postgres, inside one transaction, under a lock,
-- with unique constraints underneath, so a duplicate is unrepresentable.
--
-- HOUSE PATTERN (same as 20260920120000_gala_seating.sql): every table has RLS
-- on, zero grants and zero policies. The page is static and the repo is PUBLIC,
-- so the only way in is a set of SECURITY DEFINER RPCs. Differences from the
-- seating planner, all deliberate:
--   * the passcode is checked ONCE (gala_checkin_unlock) and exchanged for a
--     random session token. Later calls present the token, which is a sha256
--     lookup instead of a bcrypt compare. That keeps the 4 s poll cheap, lets
--     one device be revoked without rotating the passcode mid-event, and means
--     an attacker who trips the passcode lockout cannot freeze devices that are
--     already unlocked at the door.
--   * the Realtime channel name comes from a random channel_key stored here,
--     not from the passcode, because clients do not keep the passcode.
--   * state is rows + a per-event version counter, not an op log: the server
--     is authoritative and clients just upsert the rows it returns.
--
-- The 2025 tables public.gala_guests / public.gala_donations are NOT touched:
-- they stay as the 2025 archive behind the dashboard login.
--
-- RPCs return jsonb {ok, reason} instead of raising, because a function that
-- raises rolls back its own throttle row.

-- 1) Tables ------------------------------------------------------------------

create table if not exists public.gala_event_access (
  event_slug text primary key,
  door_hash text not null,
  admin_hash text,
  channel_key text not null default replace(gen_random_uuid()::text, '-', ''),
  server_ping boolean not null default false,
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint gala_event_access_slug_check check (char_length(event_slug) between 1 and 80)
);

create table if not exists public.gala_event_state (
  event_slug text primary key,
  version bigint not null default 0,
  seating_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint gala_event_state_version_check check (version >= 0)
);

create table if not exists public.gala_event_attempts (
  id bigint generated always as identity primary key,
  event_slug text not null,
  ip_hash text not null default '',
  at timestamptz not null default now()
);

create index if not exists gala_event_attempts_slug_at_idx
  on public.gala_event_attempts (event_slug, at desc);

create table if not exists public.gala_event_sessions (
  id bigint generated always as identity primary key,
  event_slug text not null,
  token_hash bytea not null unique,
  role text not null check (role in ('door', 'admin')),
  display_name text not null check (char_length(display_name) between 1 and 40),
  device text not null default '',
  profile_id uuid,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists gala_event_sessions_event_idx
  on public.gala_event_sessions (event_slug, last_seen_at desc);

-- One row per person expected (or walked in). `id` is the seating planner's
-- guest id wherever the guest came from the seating plan, so the two systems
-- talk about the same person. party_id can be a buyer email: it never leaves
-- this table except through an authorised RPC, and never goes over Realtime.
create table if not exists public.gala_event_guests (
  event_slug text not null,
  id text not null,
  name text not null,
  party_id text not null,
  party_label text not null default '',
  paddle_group text not null,
  buyer_name text not null default '',
  buyer_email text not null default '',
  email text not null default '',
  phone text not null default '',
  ticket_type text not null default 'unknown',
  has_dinner boolean not null default true,
  table_number integer,
  table_name text not null default '',
  seat integer,
  meal text,
  tags text[] not null default '{}',
  notes text not null default '',
  door_note text not null default '',
  placeholder boolean not null default false,
  source text not null default 'seating' check (source in ('seating', 'manual', 'walkin')),
  door_edited text[] not null default '{}',
  checked_in_at timestamptz,
  checked_in_by text,
  checked_in_session bigint,
  checkin_op uuid,
  removed_at timestamptz,
  row_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_slug, id),
  constraint gala_event_guests_id_check check (char_length(id) between 1 and 80),
  constraint gala_event_guests_name_check check (char_length(name) between 1 and 160),
  constraint gala_event_guests_group_check check (char_length(paddle_group) between 1 and 200)
);

create index if not exists gala_event_guests_version_idx
  on public.gala_event_guests (event_slug, row_version);
create index if not exists gala_event_guests_group_idx
  on public.gala_event_guests (event_slug, paddle_group);

-- The paddle pool: one row per PHYSICAL paddle in the box. The number lives
-- here and nowhere else; a guest's paddle is whatever row carries the guest's
-- paddle_group. Two constraints make duplicates unrepresentable:
--   primary key (event_slug, paddle_number)      one row per number
--   unique (event_slug, paddle_group) if assigned  one paddle per household
create table if not exists public.gala_event_paddles (
  event_slug text not null,
  paddle_number integer not null,
  status text not null default 'free' check (status in ('free', 'held', 'assigned', 'void')),
  paddle_group text,
  prev_group text,
  preassigned boolean not null default false,
  assigned_at timestamptz,
  assigned_by text,
  note text not null default '',
  row_version bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (event_slug, paddle_number),
  constraint gala_event_paddles_number_check check (paddle_number between 1 and 9999),
  constraint gala_event_paddles_holder_check check ((status = 'assigned') = (paddle_group is not null))
);

create unique index if not exists gala_event_paddles_one_per_group_idx
  on public.gala_event_paddles (event_slug, paddle_group)
  where paddle_group is not null;
create index if not exists gala_event_paddles_free_idx
  on public.gala_event_paddles (event_slug, paddle_number)
  where status = 'free';
create index if not exists gala_event_paddles_version_idx
  on public.gala_event_paddles (event_slug, row_version);

-- Append-only audit log. `detail` never holds guest PII (ids, numbers and field
-- NAMES only), so the activity feed can be shown freely to anyone unlocked.
create table if not exists public.gala_event_log (
  id bigint generated always as identity primary key,
  event_slug text not null,
  version bigint not null default 0,
  op_id uuid,
  kind text not null,
  guest_ids text[] not null default '{}',
  paddle_number integer,
  actor text not null default '',
  session_id bigint,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

create unique index if not exists gala_event_log_op_idx
  on public.gala_event_log (event_slug, op_id)
  where op_id is not null;
create index if not exists gala_event_log_event_id_idx
  on public.gala_event_log (event_slug, id desc);

-- Donations / pledges. Owned jointly with the live-display work: this file
-- defines the table and the paddle resolution contract only.
create table if not exists public.gala_event_donations (
  id bigint generated always as identity primary key,
  event_slug text not null,
  op_id uuid not null,
  kind text not null default 'pledge'
    check (kind in ('pledge', 'cash', 'card', 'online', 'ticket', 'other')),
  amount numeric(10, 2) not null check (amount > 0 and amount <= 1000000),
  round_key text,
  paddle_number integer,
  called_number integer,
  paddle_group text,
  guest_id text,
  donor_name text check (donor_name is null or char_length(donor_name) <= 200),
  hidden boolean not null default false,
  needs_review boolean not null default false,
  note text not null default '',
  entered_by text not null default '',
  session_id bigint,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by text,
  constraint gala_event_donations_paddle_fk
    foreign key (event_slug, paddle_number)
    references public.gala_event_paddles (event_slug, paddle_number)
);

create unique index if not exists gala_event_donations_op_idx
  on public.gala_event_donations (event_slug, op_id);
-- One live gift per paddle per raise level: two spotters keying the same raise
-- converge on one row instead of doubling the thermometer.
create unique index if not exists gala_event_donations_round_idx
  on public.gala_event_donations (event_slug, round_key, paddle_number)
  where round_key is not null and paddle_number is not null and voided_at is null;
create index if not exists gala_event_donations_created_idx
  on public.gala_event_donations (event_slug, created_at desc);
create index if not exists gala_event_donations_paddle_idx
  on public.gala_event_donations (event_slug, paddle_number);

-- What survives the PII purge: numbers only.
create table if not exists public.gala_event_archive (
  event_slug text primary key,
  stats jsonb not null,
  archived_at timestamptz not null default now()
);

-- 2) RLS + grants ------------------------------------------------------------
-- Supabase's default privileges grant new public tables to anon/authenticated,
-- so the REVOKEs are load bearing.

alter table public.gala_event_access enable row level security;
alter table public.gala_event_state enable row level security;
alter table public.gala_event_attempts enable row level security;
alter table public.gala_event_sessions enable row level security;
alter table public.gala_event_guests enable row level security;
alter table public.gala_event_paddles enable row level security;
alter table public.gala_event_log enable row level security;
alter table public.gala_event_donations enable row level security;
alter table public.gala_event_archive enable row level security;

revoke all on table public.gala_event_access from anon, authenticated, service_role;
revoke all on table public.gala_event_state from anon, authenticated, service_role;
revoke all on table public.gala_event_attempts from anon, authenticated, service_role;
revoke all on table public.gala_event_sessions from anon, authenticated, service_role;
revoke all on table public.gala_event_guests from anon, authenticated, service_role;
revoke all on table public.gala_event_paddles from anon, authenticated, service_role;
revoke all on table public.gala_event_log from anon, authenticated, service_role;
revoke all on table public.gala_event_donations from anon, authenticated, service_role;
revoke all on table public.gala_event_archive from anon, authenticated, service_role;

-- The archive holds no PII; gala-module dashboard users may read it.
grant select on table public.gala_event_archive to authenticated;
drop policy if exists "Gala module can read event archive" on public.gala_event_archive;
create policy "Gala module can read event archive"
  on public.gala_event_archive for select to authenticated
  using ((select app_private.has_module('gala')));

-- Append-only guard. The purge function flips a transaction-local switch.
create or replace function public.gala_event_log_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if coalesce(current_setting('gala.purge', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'gala_event_log is append-only';
end;
$fn$;

drop trigger if exists gala_event_log_append_only on public.gala_event_log;
create trigger gala_event_log_append_only
  before update or delete on public.gala_event_log
  for each row execute function public.gala_event_log_guard();

-- Optional server-side doorbell. OFF by default (gala_event_access.server_ping):
-- the clients ring the bell themselves after every write, which is the path this
-- project has proven. When switched on, every version bump also rings from inside
-- Postgres, so a change made by a device that drops off the network right after
-- its write (or by hand in the SQL editor) still reaches everyone at once. It can
-- never fail a check-in: any error is swallowed. Payload = version only.
create or replace function public.gala_event_state_ping()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_key text;
  v_on boolean;
begin
  if tg_op = 'UPDATE' and new.version is not distinct from old.version then
    return null;
  end if;

  select a.channel_key, a.server_ping into v_key, v_on
  from public.gala_event_access a where a.event_slug = new.event_slug;

  if coalesce(v_on, false) then
    begin
      perform realtime.send(
        jsonb_build_object('v', new.version, 'c', 'db'),
        'ping',
        'gala-checkin:' || v_key,
        false
      );
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$fn$;

drop trigger if exists gala_event_state_ping on public.gala_event_state;
create trigger gala_event_state_ping
  after insert or update on public.gala_event_state
  for each row execute function public.gala_event_state_ping();

-- 3) Internal helpers (never granted to a Data API role) ---------------------

create or replace function public.gala_checkin_client_ip()
returns text
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_headers jsonb;
  v_ip text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  v_ip := coalesce(
    nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), ''),
    'unknown'
  );
  -- Hashed: the throttle needs equality, not the address itself.
  return left(md5('gala-ip:' || v_ip), 16);
end;
$fn$;

-- THE serializer. Every mutating RPC takes this first (after auth, never
-- before: a bcrypt compare or a throttle sleep must not run under it).
create or replace function public.gala_checkin_lock(p_event text)
returns void
language sql
set search_path = pg_catalog, pg_temp
as $fn$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gala_event:' || p_event, 0))
$fn$;

create or replace function public.gala_checkin_bump(p_event text)
returns bigint
language sql
set search_path = public, pg_temp
as $fn$
  insert into public.gala_event_state (event_slug, version)
  values (p_event, 1)
  on conflict (event_slug) do update
    set version = public.gala_event_state.version + 1,
        updated_at = now()
  returning version
$fn$;

-- Session check. status: ok | bad-session | revoked | expired | closed
create or replace function public.gala_checkin_auth(
  p_event text,
  p_token text,
  out status text,
  out session_id bigint,
  out actor text,
  out role text
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_row public.gala_event_sessions%rowtype;
  v_closed timestamptz;
begin
  status := 'bad-session';
  if p_token is null or char_length(p_token) not between 32 and 128 then
    return;
  end if;

  select s.* into v_row
  from public.gala_event_sessions s
  where s.token_hash = extensions.digest(p_token, 'sha256')
    and s.event_slug = btrim(coalesce(p_event, ''));

  if not found then
    return;
  end if;
  if v_row.revoked_at is not null then
    status := 'revoked';
    return;
  end if;
  if v_row.expires_at <= now() then
    status := 'expired';
    return;
  end if;

  select a.closed_at into v_closed from public.gala_event_access a where a.event_slug = v_row.event_slug;
  if v_closed is not null and v_row.role <> 'admin' then
    status := 'closed';
    return;
  end if;

  -- At most one write a minute, so a 4 s poll is not a write per poll.
  if v_row.last_seen_at < now() - interval '60 seconds' then
    update public.gala_event_sessions set last_seen_at = now() where id = v_row.id;
  end if;

  status := 'ok';
  session_id := v_row.id;
  actor := v_row.display_name;
  role := v_row.role;
end;
$fn$;

create or replace function public.gala_checkin_new_session(
  p_event text,
  p_role text,
  p_name text,
  p_device text,
  p_profile uuid
)
returns jsonb
language plpgsql
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires timestamptz := now() + interval '18 hours';
  v_channel text;
begin
  insert into public.gala_event_sessions (event_slug, token_hash, role, display_name, device, profile_id, expires_at)
  values (p_event, extensions.digest(v_token, 'sha256'), p_role, p_name, left(coalesce(p_device, ''), 80), p_profile, v_expires);

  -- Keep the table small: expired sessions older than a week go.
  delete from public.gala_event_sessions where expires_at < now() - interval '7 days';

  select 'gala-checkin:' || a.channel_key into v_channel
  from public.gala_event_access a where a.event_slug = p_event;

  return jsonb_build_object(
    'ok', true, 'token', v_token, 'role', p_role, 'actor', p_name,
    'channel', v_channel, 'expires_at', v_expires
  );
end;
$fn$;

create or replace function public.gala_checkin_guests_json(p_event text, p_ids text[], p_since bigint)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'party_id', g.party_id,
    'party_label', g.party_label,
    'paddle_group', g.paddle_group,
    'paddle_number', p.paddle_number,
    'paddle_preassigned', coalesce(p.preassigned, false),
    'buyer_name', g.buyer_name,
    'buyer_email', g.buyer_email,
    'email', g.email,
    'phone', g.phone,
    'ticket_type', g.ticket_type,
    'has_dinner', g.has_dinner,
    'table_number', g.table_number,
    'table_name', g.table_name,
    'seat', g.seat,
    'meal', g.meal,
    'tags', to_jsonb(g.tags),
    'notes', g.notes,
    'door_note', g.door_note,
    'placeholder', g.placeholder,
    'source', g.source,
    'checked_in_at', g.checked_in_at,
    'checked_in_by', g.checked_in_by,
    'removed_at', g.removed_at,
    'row_version', g.row_version
  ) order by g.id), '[]'::jsonb)
  from public.gala_event_guests g
  left join public.gala_event_paddles p
    on p.event_slug = g.event_slug
   and p.paddle_group = g.paddle_group
  where g.event_slug = p_event
    and (p_ids is null or g.id = any (p_ids))
    and (p_since is null or g.row_version > p_since)
$fn$;

create or replace function public.gala_checkin_paddles_json(p_event text, p_since bigint)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'paddle_number', p.paddle_number,
    'status', p.status,
    'paddle_group', p.paddle_group,
    'preassigned', p.preassigned,
    'assigned_at', p.assigned_at,
    'assigned_by', p.assigned_by,
    'note', p.note,
    'row_version', p.row_version
  ) order by p.paddle_number), '[]'::jsonb)
  from public.gala_event_paddles p
  where p.event_slug = p_event
    and (p_since is null or p.row_version > p_since)
$fn$;

create or replace function public.gala_checkin_log_json(p_event text, p_after_id bigint, p_limit integer)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'version', l.version, 'kind', l.kind, 'guest_ids', to_jsonb(l.guest_ids),
    'paddle_number', l.paddle_number, 'actor', l.actor, 'at', l.at, 'detail', l.detail
  ) order by l.id), '[]'::jsonb)
  from (
    select * from public.gala_event_log
    where event_slug = p_event and id > coalesce(p_after_id, 0)
    order by id desc
    limit greatest(1, least(coalesce(p_limit, 50), 500))
  ) l
$fn$;

-- Up to three names, for "paddle 42 belongs to ..." messages.
create or replace function public.gala_checkin_group_label(p_event text, p_group text)
returns text
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(string_agg(s.name, ', ' order by s.name), '')
  from (
    select g.name from public.gala_event_guests g
    where g.event_slug = p_event and g.paddle_group = p_group and g.removed_at is null
    order by g.name limit 3
  ) s
$fn$;

create or replace function public.gala_checkin_next_free(p_event text, p_min integer, p_max integer)
returns integer
language sql
stable
set search_path = public, pg_temp
as $fn$
  select min(p.paddle_number)
  from public.gala_event_paddles p
  where p.event_slug = p_event and p.status = 'free'
    and (p_min is null or p.paddle_number >= p_min)
    and (p_max is null or p.paddle_number <= p_max)
$fn$;

-- { "paddle": "auto" | "none" | 42, "min": 80, "max": 99 }  ->  mode / number / range
create or replace function public.gala_checkin_paddle_opt(
  p_opts jsonb,
  out mode text,
  out number integer,
  out lo integer,
  out hi integer
)
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_pad jsonb := coalesce(p_opts, '{}'::jsonb) -> 'paddle';
  v_txt text;
begin
  mode := 'auto';
  if v_pad is not null and jsonb_typeof(v_pad) in ('number', 'string') then
    v_txt := btrim(v_pad #>> '{}');
    if v_txt = 'none' then
      mode := 'none';
    elsif v_txt ~ '^[0-9]{1,4}$' then
      mode := 'number';
      number := v_txt::integer;
    elsif v_txt <> 'auto' and v_txt <> '' then
      mode := 'invalid';
    end if;
  end if;

  v_txt := btrim(coalesce(p_opts ->> 'min', ''));
  if v_txt ~ '^[0-9]{1,4}$' then lo := v_txt::integer; end if;
  v_txt := btrim(coalesce(p_opts ->> 'max', ''));
  if v_txt ~ '^[0-9]{1,4}$' then hi := v_txt::integer; end if;
end;
$fn$;

-- Give p_group a paddle. Caller holds the event lock and has bumped the version.
-- Returns the number, or NULL when nothing could be claimed. Idempotent: a group
-- that already holds a paddle gets that same number back, always.
create or replace function public.gala_checkin_claim_paddle(
  p_event text,
  p_group text,
  p_number integer,
  p_min integer,
  p_max integer,
  p_actor text,
  p_preassigned boolean,
  p_ver bigint
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_got integer;
  v_now timestamptz := clock_timestamp();
begin
  select p.paddle_number into v_got
  from public.gala_event_paddles p
  where p.event_slug = p_event and p.paddle_group = p_group;
  if found then
    return v_got;
  end if;

  if p_number is not null then
    update public.gala_event_paddles p
       set status = 'assigned', paddle_group = p_group, preassigned = p_preassigned,
           assigned_at = v_now, assigned_by = p_actor, row_version = p_ver, updated_at = v_now
     where p.event_slug = p_event and p.paddle_number = p_number and p.status in ('free', 'held')
    returning p.paddle_number into v_got;
  else
    update public.gala_event_paddles p
       set status = 'assigned', paddle_group = p_group, preassigned = p_preassigned,
           assigned_at = v_now, assigned_by = p_actor, row_version = p_ver, updated_at = v_now
     where p.event_slug = p_event
       and p.paddle_number = (
         select f.paddle_number
         from public.gala_event_paddles f
         where f.event_slug = p_event and f.status = 'free'
           and (p_min is null or f.paddle_number >= p_min)
           and (p_max is null or f.paddle_number <= p_max)
         order by f.paddle_number
         limit 1
         for update skip locked
       )
    returning p.paddle_number into v_got;
  end if;

  if v_got is not null then
    -- Everyone in the household now shows this number: re-ship their rows.
    update public.gala_event_guests g
       set row_version = p_ver
     where g.event_slug = p_event and g.paddle_group = p_group;
  end if;

  return v_got;
end;
$fn$;

-- Why a specific number cannot be claimed, as a ready-to-return error object.
create or replace function public.gala_checkin_paddle_conflict(p_event text, p_number integer, p_min integer, p_max integer)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_row public.gala_event_paddles%rowtype;
begin
  select * into v_row from public.gala_event_paddles p
  where p.event_slug = p_event and p.paddle_number = p_number;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown-paddle', 'paddle_number', p_number,
      'next_free', public.gala_checkin_next_free(p_event, p_min, p_max));
  elsif v_row.status = 'assigned' then
    return jsonb_build_object('ok', false, 'reason', 'paddle-taken', 'paddle_number', p_number,
      'held_by', public.gala_checkin_group_label(p_event, v_row.paddle_group),
      'assigned_by', v_row.assigned_by, 'assigned_at', v_row.assigned_at,
      'next_free', public.gala_checkin_next_free(p_event, p_min, p_max));
  elsif v_row.status = 'void' then
    return jsonb_build_object('ok', false, 'reason', 'paddle-void', 'paddle_number', p_number,
      'next_free', public.gala_checkin_next_free(p_event, p_min, p_max));
  end if;
  return null;
end;
$fn$;

-- The heart of it. Caller has authenticated, taken the event lock and ruled out
-- an op_id replay. Checks guests in and resolves ONE paddle per paddle_group.
create or replace function public.gala_checkin_apply(
  p_event text,
  p_ids text[],
  p_opts jsonb,
  p_actor text,
  p_session bigint,
  p_op_id uuid,
  p_kind text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_opt record;
  v_now timestamptz := clock_timestamp();
  v_found integer;
  v_newly text[];
  v_already text[];
  v_groups text[];
  v_group text;
  v_cur integer;
  v_got integer;
  v_need integer;
  v_free integer;
  v_ver bigint;
  v_conflict jsonb;
  v_numbers integer[] := '{}';
begin
  select * into v_opt from public.gala_checkin_paddle_opt(p_opts);
  if v_opt.mode = 'invalid' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-options');
  end if;

  -- Row locks in id order. Redundant under the event lock; kept so a hand-run
  -- UPDATE in the SQL editor on gala night still cannot interleave.
  select count(*) into v_found
  from (
    select 1 from public.gala_event_guests g
    where g.event_slug = p_event and g.id = any (p_ids) and g.removed_at is null
    order by g.id
    for update
  ) locked;

  if v_found <> cardinality(p_ids) then
    return jsonb_build_object('ok', false, 'reason', 'unknown-guest');
  end if;

  select array_agg(g.id order by g.id) filter (where g.checked_in_at is null),
         array_agg(g.id order by g.id) filter (where g.checked_in_at is not null)
    into v_newly, v_already
  from public.gala_event_guests g
  where g.event_slug = p_event and g.id = any (p_ids);

  -- Everyone was already in: a friendly state, not an error, and not a change.
  if v_newly is null then
    insert into public.gala_event_log (event_slug, version, kind, guest_ids, actor, session_id, detail)
    values (p_event, 0, 'checkin_noop', p_ids, p_actor, p_session, jsonb_build_object('attempted_op', p_op_id));

    return jsonb_build_object(
      'ok', true, 'outcome', 'already', 'replayed', false,
      'version', (select s.version from public.gala_event_state s where s.event_slug = p_event),
      'newly', '[]'::jsonb, 'already', to_jsonb(v_already),
      'guests', public.gala_checkin_guests_json(p_event, p_ids, null),
      'paddles', '[]'::jsonb
    );
  end if;

  select array_agg(distinct g.paddle_group order by g.paddle_group) into v_groups
  from public.gala_event_guests g
  where g.event_slug = p_event and g.id = any (v_newly);

  -- Everything that can say "no" is decided BEFORE the first write.
  if v_opt.mode = 'number' then
    if cardinality(v_groups) > 1 then
      return jsonb_build_object('ok', false, 'reason', 'mixed-groups');
    end if;

    select p.paddle_number into v_cur
    from public.gala_event_paddles p
    where p.event_slug = p_event and p.paddle_group = v_groups[1];

    if found and v_cur <> v_opt.number then
      return jsonb_build_object('ok', false, 'reason', 'group-has-paddle', 'paddle_number', v_cur);
    elsif not found then
      v_conflict := public.gala_checkin_paddle_conflict(p_event, v_opt.number, v_opt.lo, v_opt.hi);
      if v_conflict is not null then
        return v_conflict;
      end if;
    end if;
  elsif v_opt.mode = 'auto' then
    select count(*) into v_need
    from unnest(v_groups) grp
    where not exists (
      select 1 from public.gala_event_paddles p
      where p.event_slug = p_event and p.paddle_group = grp
    );

    select count(*) into v_free
    from public.gala_event_paddles p
    where p.event_slug = p_event and p.status = 'free'
      and (v_opt.lo is null or p.paddle_number >= v_opt.lo)
      and (v_opt.hi is null or p.paddle_number <= v_opt.hi);

    if v_need > v_free then
      return jsonb_build_object('ok', false, 'reason', 'pool-empty', 'needed', v_need, 'free', v_free);
    end if;
  end if;

  -- Writes. The block is a savepoint: if a constraint ever fires (it cannot
  -- under the event lock; this is the backstop) nothing of this op survives and
  -- the client simply retries with the same op_id.
  begin
    v_ver := public.gala_checkin_bump(p_event);

    if v_opt.mode <> 'none' then
      foreach v_group in array v_groups loop
        v_got := public.gala_checkin_claim_paddle(
          p_event, v_group, v_opt.number, v_opt.lo, v_opt.hi, p_actor, false, v_ver
        );
        if v_got is null then
          raise exception using errcode = 'GC001', message = 'no paddle could be claimed';
        end if;
        v_numbers := v_numbers || v_got;
      end loop;
    end if;

    update public.gala_event_guests g
       set checked_in_at = v_now, checked_in_by = p_actor, checked_in_session = p_session,
           checkin_op = p_op_id, row_version = v_ver, updated_at = v_now
     where g.event_slug = p_event and g.id = any (v_newly);

    insert into public.gala_event_log (event_slug, version, op_id, kind, guest_ids, paddle_number, actor, session_id, detail)
    values (
      p_event, v_ver, p_op_id, p_kind, p_ids,
      case when cardinality(v_numbers) = 1 then v_numbers[1] end,
      p_actor, p_session,
      jsonb_build_object(
        'newly', to_jsonb(v_newly),
        'already', to_jsonb(coalesce(v_already, '{}'::text[])),
        'paddles', to_jsonb(v_numbers),
        'paddle_mode', v_opt.mode
      )
    );
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'retry', 'detail', 'unique-backstop');
    when sqlstate 'GC001' then
      return jsonb_build_object('ok', false, 'reason', 'pool-empty');
  end;

  return jsonb_build_object(
    'ok', true,
    'outcome', case when v_already is null then 'checked_in' else 'partial' end,
    'replayed', false,
    'version', v_ver,
    'newly', to_jsonb(v_newly),
    'already', to_jsonb(coalesce(v_already, '{}'::text[])),
    'guests', public.gala_checkin_guests_json(p_event, null, v_ver - 1),
    'paddles', public.gala_checkin_paddles_json(p_event, v_ver - 1)
  );
end;
$fn$;

-- What a replayed op answers: the CURRENT rows of the guests it touched.
create or replace function public.gala_checkin_replay(p_event text, p_log public.gala_event_log)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'ok', true,
    'outcome', coalesce(p_log.detail ->> 'outcome', case p_log.kind when 'undo' then 'undone' else 'checked_in' end),
    'replayed', true,
    'version', (select s.version from public.gala_event_state s where s.event_slug = p_event),
    'newly', coalesce(p_log.detail -> 'newly', '[]'::jsonb),
    'already', coalesce(p_log.detail -> 'already', '[]'::jsonb),
    'guests', public.gala_checkin_guests_json(p_event, p_log.guest_ids, null),
    'paddles', '[]'::jsonb
  )
$fn$;

-- Upsert guests from a JSON array. Plan-owned fields are refreshed; door-owned
-- fields (check-in state, paddle_group once it matters, anything edited at the
-- door) are never clobbered.
create or replace function public.gala_checkin_upsert_guests(
  p_event text,
  p_rows jsonb,
  p_ver bigint,
  p_max_group integer
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_count integer;
begin
  with src as (
    select
      left(btrim(r ->> 'id'), 80) as id,
      left(coalesce(nullif(btrim(r ->> 'name'), ''), 'Guest'), 160) as name,
      left(coalesce(nullif(btrim(r ->> 'party_id'), ''), 'solo:' || btrim(r ->> 'id')), 200) as party_id,
      left(coalesce(r ->> 'party_label', ''), 160) as party_label,
      left(coalesce(r ->> 'buyer_name', ''), 160) as buyer_name,
      left(coalesce(r ->> 'buyer_email', ''), 200) as buyer_email,
      left(coalesce(r ->> 'email', ''), 200) as email,
      left(coalesce(r ->> 'phone', ''), 40) as phone,
      left(coalesce(nullif(btrim(r ->> 'ticket_type'), ''), 'unknown'), 40) as ticket_type,
      coalesce((r ->> 'has_dinner')::boolean, true) as has_dinner,
      case when (r ->> 'table_number') ~ '^[0-9]{1,3}$' then (r ->> 'table_number')::integer end as table_number,
      left(coalesce(r ->> 'table_name', ''), 80) as table_name,
      case when (r ->> 'seat') ~ '^[0-9]{1,3}$' then (r ->> 'seat')::integer end as seat,
      nullif(left(coalesce(r ->> 'meal', ''), 40), '') as meal,
      coalesce((
        select array_agg(left(t, 40)) from jsonb_array_elements_text(
          case when jsonb_typeof(r -> 'tags') = 'array' then r -> 'tags' else '[]'::jsonb end
        ) t
      ), '{}'::text[]) as tags,
      left(coalesce(r ->> 'notes', ''), 600) as notes,
      coalesce((r ->> 'placeholder')::boolean, false) as placeholder,
      case when r ->> 'source' in ('seating', 'manual', 'walkin') then r ->> 'source' else 'manual' end as source
    from jsonb_array_elements(p_rows) r
    where jsonb_typeof(r) = 'object' and coalesce(btrim(r ->> 'id'), '') <> ''
  ),
  sized as (
    select s.*, count(*) over (partition by s.party_id) as party_size
    from src s
  ),
  up as (
    insert into public.gala_event_guests as g (
      event_slug, id, name, party_id, party_label, paddle_group, buyer_name, buyer_email,
      email, phone, ticket_type, has_dinner, table_number, table_name, seat, meal, tags,
      notes, placeholder, source, row_version
    )
    select
      p_event, s.id, s.name, s.party_id, s.party_label,
      -- Households share a paddle; a sponsor table of ten does not.
      case when s.party_size > p_max_group then 'g:' || s.id else s.party_id end,
      s.buyer_name, s.buyer_email, s.email, s.phone, s.ticket_type, s.has_dinner,
      s.table_number, s.table_name, s.seat, s.meal, s.tags, s.notes, s.placeholder, s.source, p_ver
    from sized s
    on conflict (event_slug, id) do update set
      name = case when 'name' = any (g.door_edited) then g.name else excluded.name end,
      email = case when 'email' = any (g.door_edited) then g.email else excluded.email end,
      phone = case when 'phone' = any (g.door_edited) then g.phone else excluded.phone end,
      meal = case when 'meal' = any (g.door_edited) then g.meal else excluded.meal end,
      table_number = case when 'table_number' = any (g.door_edited) then g.table_number else excluded.table_number end,
      table_name = excluded.table_name,
      seat = excluded.seat,
      party_id = excluded.party_id,
      party_label = excluded.party_label,
      buyer_name = excluded.buyer_name,
      buyer_email = excluded.buyer_email,
      ticket_type = excluded.ticket_type,
      has_dinner = excluded.has_dinner,
      tags = excluded.tags,
      notes = excluded.notes,
      placeholder = case when 'name' = any (g.door_edited) then g.placeholder else excluded.placeholder end,
      removed_at = null,
      row_version = p_ver,
      updated_at = now()
    returning 1
  )
  select count(*) into v_count from up;

  return v_count;
end;
$fn$;

create or replace function public.gala_checkin_stats_json(p_event text)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  with g as (
    select * from public.gala_event_guests where event_slug = p_event and removed_at is null
  ),
  grp as (
    select g.paddle_group,
           bool_or(g.checked_in_at is not null) as arrived,
           exists (
             select 1 from public.gala_event_paddles p
             where p.event_slug = p_event and p.paddle_group = g.paddle_group
           ) as has_paddle
    from g group by g.paddle_group
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'guests', count(*),
        'checked_in', count(*) filter (where checked_in_at is not null),
        'dinner', count(*) filter (where has_dinner),
        'dinner_checked_in', count(*) filter (where has_dinner and checked_in_at is not null),
        'late_night', count(*) filter (where not has_dinner),
        'late_night_checked_in', count(*) filter (where not has_dinner and checked_in_at is not null),
        'walkins', count(*) filter (where source = 'walkin'),
        'placeholders_open', count(*) filter (where placeholder and checked_in_at is null),
        'parties', count(distinct party_id),
        'parties_arrived', count(distinct party_id) filter (where checked_in_at is not null)
      ) from g
    ),
    'by_table', (
      select coalesce(jsonb_agg(t order by t.table_number nulls last), '[]'::jsonb) from (
        select table_number, max(table_name) as table_name, count(*) as total,
               count(*) filter (where checked_in_at is not null) as checked_in
        from g group by table_number
      ) t
    ),
    'by_ticket_type', (
      select coalesce(jsonb_agg(t order by t.ticket_type), '[]'::jsonb) from (
        select ticket_type, count(*) as total,
               count(*) filter (where checked_in_at is not null) as checked_in
        from g group by ticket_type
      ) t
    ),
    'arrivals_5min', (
      select coalesce(jsonb_agg(t order by t.t), '[]'::jsonb) from (
        select date_bin('5 minutes', checked_in_at, timestamptz '2000-01-01 00:00:00+00') as t, count(*) as n
        from g where checked_in_at is not null group by 1
      ) t
    ),
    'paddles', (
      select jsonb_build_object(
        'pool', count(*),
        'free', count(*) filter (where status = 'free'),
        'held', count(*) filter (where status = 'held'),
        'assigned', count(*) filter (where status = 'assigned'),
        'void', count(*) filter (where status = 'void'),
        'groups_without_paddle', (select count(*) from grp where not has_paddle),
        'arrived_without_paddle', (select count(*) from grp where arrived and not has_paddle)
      ) from public.gala_event_paddles where event_slug = p_event
    ),
    'generated_at', now()
  )
$fn$;

-- 4) Public RPCs: sessions ---------------------------------------------------

create or replace function public.gala_checkin_unlock(
  p_event text,
  p_pass text,
  p_name text,
  p_device text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_name text := left(btrim(coalesce(p_name, '')), 40);
  v_ip text := public.gala_checkin_client_ip();
  v_acc public.gala_event_access%rowtype;
  v_fail_ip integer;
  v_fail_all integer;
  v_role text;
begin
  if v_event = '' or char_length(v_event) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'bad-passcode');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing-name');
  end if;

  if random() < 0.05 then
    delete from public.gala_event_attempts where at < now() - interval '1 day';
  end if;

  select count(*) filter (where a.ip_hash = v_ip), count(*)
    into v_fail_ip, v_fail_all
  from public.gala_event_attempts a
  where a.event_slug = v_event and a.at > now() - interval '10 minutes';

  -- Per address first, so one noisy client cannot shut the door on the venue;
  -- the global cap bounds guessing from rotating addresses. Devices that are
  -- ALREADY unlocked never come through here, so a lockout cannot stop the desk.
  if v_fail_ip >= 10 or v_fail_all >= 60 then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  select * into v_acc from public.gala_event_access a where a.event_slug = v_event;
  if not found then
    perform pg_catalog.pg_sleep(0.4);
    return jsonb_build_object('ok', false, 'reason', 'bad-passcode');
  end if;

  if coalesce(p_pass, '') = '' then
    v_role := null;
  elsif v_acc.admin_hash is not null and extensions.crypt(p_pass, v_acc.admin_hash) = v_acc.admin_hash then
    v_role := 'admin';
  elsif extensions.crypt(p_pass, v_acc.door_hash) = v_acc.door_hash then
    v_role := 'door';
  end if;

  if v_role is null then
    insert into public.gala_event_attempts (event_slug, ip_hash) values (v_event, v_ip);
    perform pg_catalog.pg_sleep(0.4);
    return jsonb_build_object('ok', false, 'reason', 'bad-passcode');
  end if;

  if v_acc.closed_at is not null and v_role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  delete from public.gala_event_attempts a where a.event_slug = v_event and a.ip_hash = v_ip;

  return public.gala_checkin_new_session(v_event, v_role, v_name, p_device, null);
end;
$fn$;

-- Break-glass and dashboard path: a signed-in dashboard user with the gala
-- module mints an admin session without the passcode. Works during a lockout.
create or replace function public.gala_checkin_admin_session(
  p_event text,
  p_name text,
  p_device text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, extensions, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_name text := left(btrim(coalesce(p_name, '')), 40);
begin
  if (select auth.uid()) is null or not (select app_private.has_module('gala')) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if not exists (select 1 from public.gala_event_access a where a.event_slug = v_event) then
    return jsonb_build_object('ok', false, 'reason', 'no-event');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing-name');
  end if;

  return public.gala_checkin_new_session(v_event, 'admin', v_name, p_device, (select auth.uid()));
end;
$fn$;

create or replace function public.gala_checkin_logout(p_event text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
begin
  update public.gala_event_sessions s
     set revoked_at = now()
   where s.token_hash = extensions.digest(coalesce(p_token, ''), 'sha256')
     and s.event_slug = btrim(coalesce(p_event, ''))
     and s.revoked_at is null;
  return jsonb_build_object('ok', true);
end;
$fn$;

-- 5) Public RPCs: reads ------------------------------------------------------

create or replace function public.gala_checkin_load(p_event text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_ver bigint;
  v_log_id bigint;
  v_acc public.gala_event_access%rowtype;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;

  -- Version FIRST, rows after: the other order can skip a commit for ever.
  select coalesce(max(s.version), 0) into v_ver from public.gala_event_state s where s.event_slug = v_event;
  select coalesce(max(l.id), 0) into v_log_id from public.gala_event_log l where l.event_slug = v_event;
  select * into v_acc from public.gala_event_access a where a.event_slug = v_event;

  return jsonb_build_object(
    'ok', true,
    'version', v_ver,
    'log_id', v_log_id,
    'server_time', clock_timestamp(),
    'me', jsonb_build_object('actor', v_auth.actor, 'role', v_auth.role, 'session_id', v_auth.session_id),
    'channel', 'gala-checkin:' || v_acc.channel_key,
    'closed', v_acc.closed_at is not null,
    'seating_synced_at', (select s.seating_synced_at from public.gala_event_state s where s.event_slug = v_event),
    'guests', public.gala_checkin_guests_json(v_event, null, null),
    'paddles', public.gala_checkin_paddles_json(v_event, null),
    'log', public.gala_checkin_log_json(v_event, 0, 50)
  );
end;
$fn$;

create or replace function public.gala_checkin_since(
  p_event text,
  p_token text,
  p_version bigint,
  p_log_id bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_ver bigint;
  v_log_id bigint;
  v_base bigint := coalesce(p_version, 0);
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;

  select coalesce(max(s.version), 0) into v_ver from public.gala_event_state s where s.event_slug = v_event;
  select coalesce(max(l.id), 0) into v_log_id from public.gala_event_log l where l.event_slug = v_event;

  if v_ver <= v_base and v_log_id <= coalesce(p_log_id, 0) then
    return jsonb_build_object('ok', true, 'version', v_ver, 'log_id', v_log_id,
      'guests', '[]'::jsonb, 'paddles', '[]'::jsonb, 'log', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'ok', true,
    'version', v_ver,
    'log_id', v_log_id,
    'guests', public.gala_checkin_guests_json(v_event, null, v_base),
    'paddles', public.gala_checkin_paddles_json(v_event, v_base),
    'log', public.gala_checkin_log_json(v_event, p_log_id, 100)
  );
end;
$fn$;

create or replace function public.gala_checkin_stats(p_event text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;

  return jsonb_build_object(
    'ok', true,
    'stats', public.gala_checkin_stats_json(v_event),
    'recent', public.gala_checkin_log_json(v_event, 0, 30),
    'devices', case when v_auth.role = 'admin' then (
      select coalesce(jsonb_agg(jsonb_build_object(
        'session_id', s.id, 'actor', s.display_name, 'role', s.role, 'device', s.device,
        'last_seen_at', s.last_seen_at, 'created_at', s.created_at
      ) order by s.last_seen_at desc), '[]'::jsonb)
      from public.gala_event_sessions s
      where s.event_slug = v_event and s.revoked_at is null and s.expires_at > now()
    ) else '[]'::jsonb end
  );
end;
$fn$;

-- 6) Public RPCs: the door ---------------------------------------------------

create or replace function public.gala_checkin(
  p_event text,
  p_token text,
  p_guest_ids text[],
  p_op_id uuid,
  p_opts jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_ids text[];
  v_prior public.gala_event_log%rowtype;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;

  select array_agg(distinct x order by x) into v_ids
  from unnest(coalesce(p_guest_ids, '{}'::text[])) x
  where x is not null and x <> '';

  if v_ids is null then
    return jsonb_build_object('ok', false, 'reason', 'no-guests');
  end if;
  if cardinality(v_ids) > 24 then
    return jsonb_build_object('ok', false, 'reason', 'too-many-guests');
  end if;

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return public.gala_checkin_replay(v_event, v_prior);
  end if;

  return public.gala_checkin_apply(v_event, v_ids, p_opts, v_auth.actor, v_auth.session_id, p_op_id, 'checkin');
end;
$fn$;

create or replace function public.gala_checkin_undo(
  p_event text,
  p_token text,
  p_guest_id text,
  p_op_id uuid,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_g public.gala_event_guests%rowtype;
  v_ver bigint;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return public.gala_checkin_replay(v_event, v_prior);
  end if;

  select * into v_g from public.gala_event_guests g
  where g.event_slug = v_event and g.id = p_guest_id and g.removed_at is null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown-guest');
  end if;

  if v_g.checked_in_at is null then
    return jsonb_build_object('ok', true, 'outcome', 'not-checked-in', 'replayed', false,
      'version', (select s.version from public.gala_event_state s where s.event_slug = v_event),
      'guests', public.gala_checkin_guests_json(v_event, array[p_guest_id], null), 'paddles', '[]'::jsonb);
  end if;

  v_ver := public.gala_checkin_bump(v_event);

  -- The paddle is NOT released: it is probably in the guest's hand. Returning a
  -- paddle to the box is its own, explicit action (gala_checkin_paddle_release).
  update public.gala_event_guests g
     set checked_in_at = null, checked_in_by = null, checked_in_session = null, checkin_op = null,
         row_version = v_ver, updated_at = now()
   where g.event_slug = v_event and g.id = p_guest_id;

  insert into public.gala_event_log (event_slug, version, op_id, kind, guest_ids, actor, session_id, detail)
  values (v_event, v_ver, p_op_id, 'undo', array[p_guest_id], v_auth.actor, v_auth.session_id,
    jsonb_build_object('outcome', 'undone', 'was_at', v_g.checked_in_at, 'was_by', v_g.checked_in_by,
      'reason', left(coalesce(p_reason, ''), 200)));

  return jsonb_build_object('ok', true, 'outcome', 'undone', 'replayed', false, 'version', v_ver,
    'guests', public.gala_checkin_guests_json(v_event, array[p_guest_id], null), 'paddles', '[]'::jsonb);
end;
$fn$;

-- Walk-in: create the guest AND check them in AND resolve the paddle, or none
-- of it. The guest id is derived from the op id, so a retry cannot make twins.
create or replace function public.gala_checkin_walkin(
  p_event text,
  p_token text,
  p_op_id uuid,
  p_guest jsonb,
  p_opts jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_name text := left(btrim(coalesce(p_guest ->> 'name', '')), 160);
  v_id text;
  v_host public.gala_event_guests%rowtype;
  v_res jsonb;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;
  if v_name = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing-name');
  end if;

  v_id := 'w_' || replace(p_op_id::text, '-', '');

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return public.gala_checkin_replay(v_event, v_prior);
  end if;

  if coalesce(p_guest ->> 'join_guest_id', '') <> '' then
    select * into v_host from public.gala_event_guests g
    where g.event_slug = v_event and g.id = p_guest ->> 'join_guest_id' and g.removed_at is null;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'unknown-guest');
    end if;
  end if;

  begin
    insert into public.gala_event_guests (
      event_slug, id, name, party_id, party_label, paddle_group, email, phone,
      ticket_type, has_dinner, table_number, door_note, source, row_version
    )
    values (
      v_event, v_id, v_name,
      coalesce(v_host.party_id, 'walkin:' || v_id),
      coalesce(v_host.party_label, v_name),
      coalesce(v_host.paddle_group, 'walkin:' || v_id),
      left(coalesce(p_guest ->> 'email', ''), 200),
      left(coalesce(p_guest ->> 'phone', ''), 40),
      left(coalesce(nullif(btrim(p_guest ->> 'ticket_type'), ''), 'walkin'), 40),
      coalesce((p_guest ->> 'has_dinner')::boolean, false),
      case when (p_guest ->> 'table_number') ~ '^[0-9]{1,3}$' then (p_guest ->> 'table_number')::integer end,
      left(coalesce(p_guest ->> 'door_note', ''), 300),
      'walkin', 0
    );

    v_res := public.gala_checkin_apply(v_event, array[v_id], p_opts, v_auth.actor, v_auth.session_id, p_op_id, 'walkin');

    if not coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception using errcode = 'GC002', message = 'walk-in rejected';
    end if;
  exception
    when sqlstate 'GC002' then
      return v_res;   -- the insert above is rolled back with the block
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'retry', 'detail', 'unique-backstop');
  end;

  return v_res;
end;
$fn$;

-- Door edits. Field NAMES go to the log, values do not.
create or replace function public.gala_checkin_guest_update(
  p_event text,
  p_token text,
  p_guest_id text,
  p_op_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_allowed text[];
  v_fields text[];
  v_ver bigint;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-patch');
  end if;

  v_allowed := case when v_auth.role = 'admin'
    then array['name', 'email', 'phone', 'door_note', 'meal', 'table_number', 'removed']
    else array['name', 'email', 'phone', 'door_note'] end;

  select array_agg(k order by k) into v_fields
  from jsonb_object_keys(p_patch) k where k = any (v_allowed);

  if v_fields is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing-to-change');
  end if;
  if p_patch ? 'name' and btrim(coalesce(p_patch ->> 'name', '')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing-name');
  end if;

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return public.gala_checkin_replay(v_event, v_prior);
  end if;

  perform 1 from public.gala_event_guests g
  where g.event_slug = v_event and g.id = p_guest_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown-guest');
  end if;

  v_ver := public.gala_checkin_bump(v_event);

  update public.gala_event_guests g set
    name = case when p_patch ? 'name' then left(btrim(p_patch ->> 'name'), 160) else g.name end,
    placeholder = case when p_patch ? 'name' then false else g.placeholder end,
    email = case when p_patch ? 'email' then left(coalesce(p_patch ->> 'email', ''), 200) else g.email end,
    phone = case when p_patch ? 'phone' then left(coalesce(p_patch ->> 'phone', ''), 40) else g.phone end,
    door_note = case when p_patch ? 'door_note' then left(coalesce(p_patch ->> 'door_note', ''), 300) else g.door_note end,
    meal = case when 'meal' = any (v_fields) then nullif(left(coalesce(p_patch ->> 'meal', ''), 40), '') else g.meal end,
    table_number = case when 'table_number' = any (v_fields) then
      case when (p_patch ->> 'table_number') ~ '^[0-9]{1,3}$' then (p_patch ->> 'table_number')::integer end
      else g.table_number end,
    removed_at = case when 'removed' = any (v_fields) then
      case when coalesce((p_patch ->> 'removed')::boolean, false) then now() end
      else g.removed_at end,
    door_edited = (select array_agg(distinct f) from unnest(g.door_edited || v_fields) f),
    row_version = v_ver,
    updated_at = now()
  where g.event_slug = v_event and g.id = p_guest_id;

  insert into public.gala_event_log (event_slug, version, op_id, kind, guest_ids, actor, session_id, detail)
  values (v_event, v_ver, p_op_id, 'guest_update', array[p_guest_id], v_auth.actor, v_auth.session_id,
    jsonb_build_object('outcome', 'updated', 'fields', to_jsonb(v_fields)));

  return jsonb_build_object('ok', true, 'outcome', 'updated', 'replayed', false, 'version', v_ver,
    'guests', public.gala_checkin_guests_json(v_event, array[p_guest_id], null), 'paddles', '[]'::jsonb);
end;
$fn$;

-- 7) Public RPCs: paddles ----------------------------------------------------

-- Assign a paddle WITHOUT checking anyone in: pre-assignment days before, or a
-- party that arrived earlier without one. p_number null = next free.
create or replace function public.gala_checkin_paddle_assign(
  p_event text,
  p_token text,
  p_guest_id text,
  p_op_id uuid,
  p_number integer default null,
  p_opts jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_opt record;
  v_group text;
  v_cur integer;
  v_got integer;
  v_ver bigint;
  v_conflict jsonb;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;
  if p_number is not null and p_number not between 1 and 9999 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-options');
  end if;
  select * into v_opt from public.gala_checkin_paddle_opt(p_opts);

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return public.gala_checkin_replay(v_event, v_prior);
  end if;

  select g.paddle_group into v_group from public.gala_event_guests g
  where g.event_slug = v_event and g.id = p_guest_id and g.removed_at is null
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown-guest');
  end if;

  select p.paddle_number into v_cur from public.gala_event_paddles p
  where p.event_slug = v_event and p.paddle_group = v_group;

  if found then
    if p_number is not null and p_number <> v_cur then
      return jsonb_build_object('ok', false, 'reason', 'group-has-paddle', 'paddle_number', v_cur);
    end if;
    return jsonb_build_object('ok', true, 'outcome', 'already', 'replayed', false, 'paddle_number', v_cur,
      'version', (select s.version from public.gala_event_state s where s.event_slug = v_event),
      'guests', public.gala_checkin_guests_json(v_event, array[p_guest_id], null), 'paddles', '[]'::jsonb);
  end if;

  if p_number is not null then
    v_conflict := public.gala_checkin_paddle_conflict(v_event, p_number, v_opt.lo, v_opt.hi);
    if v_conflict is not null then
      return v_conflict;
    end if;
  elsif public.gala_checkin_next_free(v_event, v_opt.lo, v_opt.hi) is null then
    return jsonb_build_object('ok', false, 'reason', 'pool-empty');
  end if;

  begin
    v_ver := public.gala_checkin_bump(v_event);
    v_got := public.gala_checkin_claim_paddle(v_event, v_group, p_number, v_opt.lo, v_opt.hi, v_auth.actor, true, v_ver);
    if v_got is null then
      raise exception using errcode = 'GC001', message = 'no paddle could be claimed';
    end if;

    insert into public.gala_event_log (event_slug, version, op_id, kind, guest_ids, paddle_number, actor, session_id, detail)
    values (v_event, v_ver, p_op_id, 'paddle_assign', array[p_guest_id], v_got, v_auth.actor, v_auth.session_id,
      jsonb_build_object('outcome', 'assigned', 'paddles', jsonb_build_array(v_got)));
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'retry', 'detail', 'unique-backstop');
    when sqlstate 'GC001' then
      return jsonb_build_object('ok', false, 'reason', 'pool-empty');
  end;

  return jsonb_build_object('ok', true, 'outcome', 'assigned', 'replayed', false, 'paddle_number', v_got,
    'version', v_ver,
    'guests', public.gala_checkin_guests_json(v_event, null, v_ver - 1),
    'paddles', public.gala_checkin_paddles_json(v_event, v_ver - 1));
end;
$fn$;

-- Lost or wrong paddle: retire (or return) the old one and give the household a
-- new one, atomically. Donations stay attached: they carry paddle_group.
create or replace function public.gala_checkin_paddle_swap(
  p_event text,
  p_token text,
  p_guest_id text,
  p_op_id uuid,
  p_number integer default null,
  p_old_status text default 'void',
  p_opts jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_opt record;
  v_group text;
  v_old integer;
  v_got integer;
  v_ver bigint;
  v_conflict jsonb;
  v_old_status text := case when p_old_status = 'free' then 'free' else 'void' end;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;
  select * into v_opt from public.gala_checkin_paddle_opt(p_opts);

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return public.gala_checkin_replay(v_event, v_prior);
  end if;

  select g.paddle_group into v_group from public.gala_event_guests g
  where g.event_slug = v_event and g.id = p_guest_id and g.removed_at is null
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown-guest');
  end if;

  select p.paddle_number into v_old from public.gala_event_paddles p
  where p.event_slug = v_event and p.paddle_group = v_group
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-paddle');
  end if;
  if p_number is not null and p_number = v_old then
    return jsonb_build_object('ok', false, 'reason', 'same-paddle');
  end if;

  -- A paddle that has gifts recorded against it must never go back in the box.
  if v_old_status = 'free' and exists (
    select 1 from public.gala_event_donations d
    where d.event_slug = v_event and d.paddle_number = v_old and d.voided_at is null
  ) then
    v_old_status := 'void';
  end if;

  if p_number is not null then
    v_conflict := public.gala_checkin_paddle_conflict(v_event, p_number, v_opt.lo, v_opt.hi);
    if v_conflict is not null then
      return v_conflict;
    end if;
  elsif public.gala_checkin_next_free(v_event, v_opt.lo, v_opt.hi) is null then
    return jsonb_build_object('ok', false, 'reason', 'pool-empty');
  end if;

  begin
    v_ver := public.gala_checkin_bump(v_event);

    -- Old one first: the one-paddle-per-group index is checked per statement.
    update public.gala_event_paddles p
       set status = v_old_status, paddle_group = null, prev_group = v_group, preassigned = false,
           row_version = v_ver, updated_at = now()
     where p.event_slug = v_event and p.paddle_number = v_old;

    v_got := public.gala_checkin_claim_paddle(v_event, v_group, p_number, v_opt.lo, v_opt.hi, v_auth.actor, false, v_ver);
    if v_got is null then
      raise exception using errcode = 'GC001', message = 'no paddle could be claimed';
    end if;

    insert into public.gala_event_log (event_slug, version, op_id, kind, guest_ids, paddle_number, actor, session_id, detail)
    values (v_event, v_ver, p_op_id, 'paddle_swap', array[p_guest_id], v_got, v_auth.actor, v_auth.session_id,
      jsonb_build_object('outcome', 'swapped', 'from', v_old, 'to', v_got, 'old_status', v_old_status));
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'retry', 'detail', 'unique-backstop');
    when sqlstate 'GC001' then
      return jsonb_build_object('ok', false, 'reason', 'pool-empty');
  end;

  return jsonb_build_object('ok', true, 'outcome', 'swapped', 'replayed', false,
    'from', v_old, 'paddle_number', v_got, 'version', v_ver,
    'guests', public.gala_checkin_guests_json(v_event, null, v_ver - 1),
    'paddles', public.gala_checkin_paddles_json(v_event, v_ver - 1));
end;
$fn$;

-- Return a paddle to the box. The volunteer must physically hold it. Refused
-- while anyone in the household is checked in (unless an admin forces it), and
-- always refused once a gift has been recorded against the number.
create or replace function public.gala_checkin_paddle_release(
  p_event text,
  p_token text,
  p_paddle_number integer,
  p_op_id uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_row public.gala_event_paddles%rowtype;
  v_ver bigint;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return public.gala_checkin_replay(v_event, v_prior);
  end if;

  select * into v_row from public.gala_event_paddles p
  where p.event_slug = v_event and p.paddle_number = p_paddle_number
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown-paddle');
  end if;
  if v_row.status <> 'assigned' then
    return jsonb_build_object('ok', true, 'outcome', 'not-assigned', 'replayed', false,
      'version', (select s.version from public.gala_event_state s where s.event_slug = v_event),
      'guests', '[]'::jsonb, 'paddles', '[]'::jsonb);
  end if;

  if exists (
    select 1 from public.gala_event_donations d
    where d.event_slug = v_event and d.paddle_number = p_paddle_number and d.voided_at is null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'paddle-has-donations');
  end if;

  if exists (
    select 1 from public.gala_event_guests g
    where g.event_slug = v_event and g.paddle_group = v_row.paddle_group
      and g.removed_at is null and g.checked_in_at is not null
  ) and not (coalesce(p_force, false) and v_auth.role = 'admin') then
    return jsonb_build_object('ok', false, 'reason', 'group-checked-in',
      'held_by', public.gala_checkin_group_label(v_event, v_row.paddle_group));
  end if;

  v_ver := public.gala_checkin_bump(v_event);

  update public.gala_event_paddles p
     set status = 'free', paddle_group = null, prev_group = v_row.paddle_group, preassigned = false,
         row_version = v_ver, updated_at = now()
   where p.event_slug = v_event and p.paddle_number = p_paddle_number;

  update public.gala_event_guests g set row_version = v_ver
   where g.event_slug = v_event and g.paddle_group = v_row.paddle_group;

  insert into public.gala_event_log (event_slug, version, op_id, kind, paddle_number, actor, session_id, detail)
  values (v_event, v_ver, p_op_id, 'paddle_release', p_paddle_number, v_auth.actor, v_auth.session_id,
    jsonb_build_object('outcome', 'released', 'forced', coalesce(p_force, false)));

  return jsonb_build_object('ok', true, 'outcome', 'released', 'replayed', false, 'version', v_ver,
    'guests', public.gala_checkin_guests_json(v_event, null, v_ver - 1),
    'paddles', public.gala_checkin_paddles_json(v_event, v_ver - 1));
end;
$fn$;

-- Split / merge who shares a paddle. p_join_guest_id null = these guests leave
-- their household and form a new paddle group; otherwise they join that guest's.
create or replace function public.gala_checkin_group_set(
  p_event text,
  p_token text,
  p_guest_ids text[],
  p_op_id uuid,
  p_join_guest_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_ids text[];
  v_found integer;
  v_target text;
  v_ver bigint;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;

  select array_agg(distinct x order by x) into v_ids
  from unnest(coalesce(p_guest_ids, '{}'::text[])) x where x is not null and x <> '';
  if v_ids is null or cardinality(v_ids) > 24 then
    return jsonb_build_object('ok', false, 'reason', 'no-guests');
  end if;

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return public.gala_checkin_replay(v_event, v_prior);
  end if;

  select count(*) into v_found from (
    select 1 from public.gala_event_guests g
    where g.event_slug = v_event and g.id = any (v_ids) and g.removed_at is null
    order by g.id for update
  ) locked;
  if v_found <> cardinality(v_ids) then
    return jsonb_build_object('ok', false, 'reason', 'unknown-guest');
  end if;

  if p_join_guest_id is null then
    v_target := 'split:' || v_ids[1] || ':' || left(replace(p_op_id::text, '-', ''), 8);
  else
    select g.paddle_group into v_target from public.gala_event_guests g
    where g.event_slug = v_event and g.id = p_join_guest_id and g.removed_at is null;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'unknown-guest');
    end if;
  end if;

  -- Never strand a paddle on a group with nobody in it.
  if exists (
    select 1
    from public.gala_event_paddles p
    where p.event_slug = v_event
      and p.paddle_group in (
        select g.paddle_group from public.gala_event_guests g
        where g.event_slug = v_event and g.id = any (v_ids) and g.paddle_group <> v_target
      )
      and not exists (
        select 1 from public.gala_event_guests r
        where r.event_slug = v_event and r.paddle_group = p.paddle_group
          and r.removed_at is null and not (r.id = any (v_ids))
      )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'would-orphan-paddle');
  end if;

  v_ver := public.gala_checkin_bump(v_event);

  -- Re-ship both the households they leave and the one they join.
  update public.gala_event_guests g set row_version = v_ver
   where g.event_slug = v_event
     and (g.paddle_group = v_target or g.paddle_group in (
       select x.paddle_group from public.gala_event_guests x
       where x.event_slug = v_event and x.id = any (v_ids)
     ));

  update public.gala_event_guests g
     set paddle_group = v_target, row_version = v_ver, updated_at = now(),
         door_edited = (select array_agg(distinct f) from unnest(g.door_edited || array['paddle_group']) f)
   where g.event_slug = v_event and g.id = any (v_ids);

  insert into public.gala_event_log (event_slug, version, op_id, kind, guest_ids, actor, session_id, detail)
  values (v_event, v_ver, p_op_id, 'group_set', v_ids, v_auth.actor, v_auth.session_id,
    jsonb_build_object('outcome', case when p_join_guest_id is null then 'split' else 'joined' end));

  return jsonb_build_object('ok', true, 'outcome', case when p_join_guest_id is null then 'split' else 'joined' end,
    'replayed', false, 'version', v_ver,
    'guests', public.gala_checkin_guests_json(v_event, null, v_ver - 1), 'paddles', '[]'::jsonb);
end;
$fn$;

-- 8) Public RPCs: admin ------------------------------------------------------

-- Describe the box of printed paddles. Re-runnable: extends, never shrinks.
create or replace function public.gala_checkin_pool_init(
  p_event text,
  p_token text,
  p_lo integer,
  p_hi integer,
  p_held integer[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_ver bigint;
  v_added integer;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if v_auth.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_lo is null or p_hi is null or p_lo < 1 or p_hi > 9999 or p_hi < p_lo or p_hi - p_lo > 2000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-range');
  end if;

  perform public.gala_checkin_lock(v_event);
  v_ver := public.gala_checkin_bump(v_event);

  insert into public.gala_event_paddles (event_slug, paddle_number, row_version)
  select v_event, n, v_ver from generate_series(p_lo, p_hi) n
  on conflict (event_slug, paddle_number) do nothing;
  get diagnostics v_added = row_count;

  -- The offline reserve: never auto-allocated, only claimed by typing the number.
  update public.gala_event_paddles p
     set status = 'held', row_version = v_ver, updated_at = now()
   where p.event_slug = v_event and p.status = 'free' and p.paddle_number = any (coalesce(p_held, '{}'));

  insert into public.gala_event_log (event_slug, version, kind, actor, session_id, detail)
  values (v_event, v_ver, 'pool', v_auth.actor, v_auth.session_id,
    jsonb_build_object('lo', p_lo, 'hi', p_hi, 'added', v_added, 'held', to_jsonb(coalesce(p_held, '{}'))));

  return jsonb_build_object('ok', true, 'added', v_added, 'version', v_ver,
    'paddles', public.gala_checkin_paddles_json(v_event, v_ver - 1));
end;
$fn$;

-- free <-> held, or retire unassigned numbers (a paddle that never arrived from
-- the printer). Assigned paddles are changed through swap / release only.
create or replace function public.gala_checkin_pool_mark(
  p_event text,
  p_token text,
  p_numbers integer[],
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_ver bigint;
  v_changed integer;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if v_auth.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_status is null or p_status not in ('free', 'held', 'void') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-status');
  end if;

  perform public.gala_checkin_lock(v_event);
  v_ver := public.gala_checkin_bump(v_event);

  update public.gala_event_paddles p
     set status = p_status, row_version = v_ver, updated_at = now()
   where p.event_slug = v_event and p.paddle_number = any (coalesce(p_numbers, '{}'))
     and p.status in ('free', 'held', 'void') and p.status <> p_status;
  get diagnostics v_changed = row_count;

  insert into public.gala_event_log (event_slug, version, kind, actor, session_id, detail)
  values (v_event, v_ver, 'pool', v_auth.actor, v_auth.session_id,
    jsonb_build_object('marked', p_status, 'numbers', to_jsonb(p_numbers), 'changed', v_changed));

  return jsonb_build_object('ok', true, 'changed', v_changed, 'version', v_ver,
    'paddles', public.gala_checkin_paddles_json(v_event, v_ver - 1));
end;
$fn$;

-- Give every household that lacks one the next free paddle, in table order.
-- Run the day before; the door then only allocates for walk-ins and splits.
create or replace function public.gala_checkin_preassign_all(
  p_event text,
  p_token text,
  p_op_id uuid,
  p_dinner_only boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_ver bigint;
  v_done integer;
  v_left integer;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if v_auth.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'assigned', v_prior.detail -> 'assigned');
  end if;

  v_ver := public.gala_checkin_bump(v_event);

  with need as (
    select g.paddle_group,
           row_number() over (
             order by min(g.table_number) nulls last, min(g.party_label), g.paddle_group
           ) as rn
    from public.gala_event_guests g
    where g.event_slug = v_event and g.removed_at is null
      and (not coalesce(p_dinner_only, true) or g.has_dinner)
      and not exists (
        select 1 from public.gala_event_paddles p
        where p.event_slug = v_event and p.paddle_group = g.paddle_group
      )
    group by g.paddle_group
  ),
  free as (
    select p.paddle_number, row_number() over (order by p.paddle_number) as rn
    from public.gala_event_paddles p
    where p.event_slug = v_event and p.status = 'free'
  )
  update public.gala_event_paddles p
     set status = 'assigned', paddle_group = need.paddle_group, preassigned = true,
         assigned_at = now(), assigned_by = v_auth.actor, row_version = v_ver, updated_at = now()
    from need join free using (rn)
   where p.event_slug = v_event and p.paddle_number = free.paddle_number;
  get diagnostics v_done = row_count;

  update public.gala_event_guests g set row_version = v_ver
   where g.event_slug = v_event
     and g.paddle_group in (
       select p.paddle_group from public.gala_event_paddles p
       where p.event_slug = v_event and p.row_version = v_ver and p.paddle_group is not null
     );

  select count(distinct g.paddle_group) into v_left
  from public.gala_event_guests g
  where g.event_slug = v_event and g.removed_at is null
    and (not coalesce(p_dinner_only, true) or g.has_dinner)
    and not exists (
      select 1 from public.gala_event_paddles p
      where p.event_slug = v_event and p.paddle_group = g.paddle_group
    );

  insert into public.gala_event_log (event_slug, version, op_id, kind, actor, session_id, detail)
  values (v_event, v_ver, p_op_id, 'preassign', v_auth.actor, v_auth.session_id,
    jsonb_build_object('assigned', v_done, 'left_without', v_left));

  return jsonb_build_object('ok', true, 'replayed', false, 'assigned', v_done, 'left_without', v_left, 'version', v_ver);
end;
$fn$;

-- Generic guest upsert (comps, staff, a late CSV; also what the test seeds with).
create or replace function public.gala_checkin_import(
  p_event text,
  p_token text,
  p_guests jsonb,
  p_max_group integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_ver bigint;
  v_count integer;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if v_auth.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_guests is null or jsonb_typeof(p_guests) <> 'array' or jsonb_array_length(p_guests) > 2000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-guests');
  end if;

  perform public.gala_checkin_lock(v_event);
  v_ver := public.gala_checkin_bump(v_event);
  v_count := public.gala_checkin_upsert_guests(v_event, p_guests, v_ver, greatest(1, coalesce(p_max_group, 4)));

  insert into public.gala_event_log (event_slug, version, kind, actor, session_id, detail)
  values (v_event, v_ver, 'import', v_auth.actor, v_auth.session_id, jsonb_build_object('rows', v_count));

  return jsonb_build_object('ok', true, 'rows', v_count, 'version', v_ver);
end;
$fn$;

-- Pull names, parties, tables, seats and meals straight from the live seating
-- plan, inside Postgres: no guest data crosses a browser to get here.
create or replace function public.gala_checkin_sync_seating(
  p_event text,
  p_token text,
  p_seating_slug text default null,
  p_max_group integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_slug text := btrim(coalesce(p_seating_slug, p_event, ''));
  v_auth record;
  v_plan jsonb;
  v_rows jsonb;
  v_ver bigint;
  v_count integer;
  v_missing integer;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if v_auth.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select s.plan into v_plan from public.gala_seating_plans s where s.slug = v_slug;
  if v_plan is null or jsonb_typeof(v_plan -> 'guests') <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'no-plan');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.key,
    'name', e.value ->> 'name',
    'party_id', e.value ->> 'partyId',
    'party_label', e.value ->> 'partyLabel',
    'buyer_name', e.value ->> 'buyerName',
    'buyer_email', e.value ->> 'buyerEmail',
    'email', e.value ->> 'email',
    'phone', e.value ->> 'phone',
    'ticket_type', e.value ->> 'ticketType',
    'has_dinner', coalesce(e.value -> 'hasDinner', 'true'::jsonb),
    'table_number', t.tbl ->> 'number',
    'table_name', t.tbl ->> 'name',
    'seat', v_plan -> 'seating' -> e.key ->> 'seat',
    'meal', e.value ->> 'meal',
    'tags', coalesce(e.value -> 'tags', '[]'::jsonb),
    'notes', e.value ->> 'plannerNote',
    'placeholder', coalesce(e.value -> 'placeholder', 'false'::jsonb),
    'source', 'seating'
  )), '[]'::jsonb)
  into v_rows
  from jsonb_each(v_plan -> 'guests') e
  left join lateral (
    select x as tbl
    from jsonb_array_elements(coalesce(v_plan -> 'tables', '[]'::jsonb)) x
    where x ->> 'id' = v_plan -> 'seating' -> e.key ->> 'tableId'
    limit 1
  ) t on true
  where jsonb_typeof(e.value) = 'object';

  perform public.gala_checkin_lock(v_event);
  v_ver := public.gala_checkin_bump(v_event);
  v_count := public.gala_checkin_upsert_guests(v_event, v_rows, v_ver, greatest(1, coalesce(p_max_group, 4)));

  -- Reported, never deleted: the planner decides what a vanished guest means.
  select count(*) into v_missing
  from public.gala_event_guests g
  where g.event_slug = v_event and g.source = 'seating' and g.removed_at is null
    and not (v_plan -> 'guests' ? g.id);

  update public.gala_event_state s set seating_synced_at = now() where s.event_slug = v_event;

  insert into public.gala_event_log (event_slug, version, kind, actor, session_id, detail)
  values (v_event, v_ver, 'sync', v_auth.actor, v_auth.session_id,
    jsonb_build_object('rows', v_count, 'missing_from_plan', v_missing, 'seating_slug', v_slug));

  return jsonb_build_object('ok', true, 'rows', v_count, 'missing_from_plan', v_missing, 'version', v_ver);
end;
$fn$;

create or replace function public.gala_checkin_session_revoke(
  p_event text,
  p_token text,
  p_session_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if v_auth.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  update public.gala_event_sessions s set revoked_at = now()
   where s.event_slug = v_event and s.id = p_session_id and s.revoked_at is null;

  return jsonb_build_object('ok', true, 'revoked', found);
end;
$fn$;

-- 9) Donations contract (shared with the live-display work) ------------------
-- "Paddle 42, $500" resolves to a household AT ENTRY TIME and the answer is
-- frozen on the row, so a later swap or release never re-attributes a gift.
-- A number nobody holds is still recorded (money first), flagged needs_review.
create or replace function public.gala_donation_add(
  p_event text,
  p_token text,
  p_op_id uuid,
  p_amount numeric,
  p_paddle_number integer default null,
  p_round_key text default null,
  p_kind text default 'pledge',
  p_donor_name text default null,
  p_note text default '',
  p_hidden boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_pad public.gala_event_paddles%rowtype;
  v_guest text;
  v_prior public.gala_event_donations%rowtype;
  v_row public.gala_event_donations%rowtype;
  v_round text := nullif(left(btrim(coalesce(p_round_key, '')), 40), '');
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-amount');
  end if;
  if coalesce(p_kind, '') not in ('pledge', 'cash', 'card', 'online', 'ticket', 'other') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-kind');
  end if;

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_donations d where d.event_slug = v_event and d.op_id = p_op_id;
  if found then
    return jsonb_build_object('ok', true, 'outcome', 'recorded', 'replayed', true, 'donation_id', v_prior.id,
      'needs_review', v_prior.needs_review);
  end if;

  if p_paddle_number is not null then
    select * into v_pad from public.gala_event_paddles p
    where p.event_slug = v_event and p.paddle_number = p_paddle_number;

    if v_pad.paddle_group is not null then
      select g.id into v_guest from public.gala_event_guests g
      where g.event_slug = v_event and g.paddle_group = v_pad.paddle_group and g.removed_at is null
      order by (g.name = g.buyer_name) desc, g.checked_in_at nulls last, g.id
      limit 1;
    end if;

    -- Same paddle, same raise level, already keyed by another spotter.
    if v_round is not null and v_pad.paddle_number is not null then
      select * into v_prior from public.gala_event_donations d
      where d.event_slug = v_event and d.round_key = v_round
        and d.paddle_number = p_paddle_number and d.voided_at is null;
      if found then
        return jsonb_build_object('ok', true, 'outcome', 'already-recorded', 'replayed', false,
          'donation_id', v_prior.id, 'entered_by', v_prior.entered_by, 'amount', v_prior.amount);
      end if;
    end if;
  end if;

  insert into public.gala_event_donations (
    event_slug, op_id, kind, amount, round_key, paddle_number, called_number, paddle_group, guest_id,
    donor_name, hidden, needs_review, note, entered_by, session_id
  )
  values (
    v_event, p_op_id, p_kind, p_amount, v_round,
    v_pad.paddle_number,            -- null when the number is not in the pool (keeps the FK honest)
    p_paddle_number,
    v_pad.paddle_group, v_guest,
    nullif(left(btrim(coalesce(p_donor_name, '')), 200), ''),
    coalesce(p_hidden, false),
    p_paddle_number is not null and v_pad.paddle_group is null,
    left(coalesce(p_note, ''), 300), v_auth.actor, v_auth.session_id
  )
  returning * into v_row;

  return jsonb_build_object('ok', true, 'outcome', 'recorded', 'replayed', false, 'donation_id', v_row.id,
    'needs_review', v_row.needs_review,
    'held_by', case when v_pad.paddle_group is not null
      then public.gala_checkin_group_label(v_event, v_pad.paddle_group) end,
    'paddle_status', v_pad.status);
end;
$fn$;

-- 10) Owner-only functions (SQL editor / Management API; never the Data API) ---

create or replace function public.gala_checkin_set_passcode(
  p_event text,
  p_door_pass text,
  p_admin_pass text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
begin
  if v_event = '' or char_length(v_event) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-slug');
  end if;
  if char_length(coalesce(p_door_pass, '')) < 6 then
    return jsonb_build_object('ok', false, 'reason', 'passcode-too-short');
  end if;
  if p_admin_pass is not null and (char_length(p_admin_pass) < 10 or p_admin_pass = p_door_pass) then
    return jsonb_build_object('ok', false, 'reason', 'admin-passcode-weak');
  end if;

  insert into public.gala_event_access (event_slug, door_hash, admin_hash)
  values (
    v_event,
    extensions.crypt(p_door_pass, extensions.gen_salt('bf', 10)),
    case when p_admin_pass is not null then extensions.crypt(p_admin_pass, extensions.gen_salt('bf', 10)) end
  )
  on conflict (event_slug) do update
    set door_hash = excluded.door_hash,
        admin_hash = coalesce(excluded.admin_hash, public.gala_event_access.admin_hash),
        channel_key = replace(gen_random_uuid()::text, '-', ''),
        updated_at = now();

  insert into public.gala_event_state (event_slug) values (v_event)
  on conflict (event_slug) do nothing;

  -- A rotation ends every door session and clears any lockout.
  update public.gala_event_sessions set revoked_at = now()
   where event_slug = v_event and role = 'door' and revoked_at is null;
  delete from public.gala_event_attempts where event_slug = v_event;

  return jsonb_build_object('ok', true, 'event', v_event);
end;
$fn$;

-- After the gala: keep the numbers, drop the people.
create or replace function public.gala_checkin_archive_and_purge(p_event text, p_confirm text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_stats jsonb;
begin
  if v_event = '' or p_confirm is distinct from 'PURGE ' || v_event then
    return jsonb_build_object('ok', false, 'reason', 'confirm-mismatch');
  end if;

  perform public.gala_checkin_lock(v_event);

  v_stats := public.gala_checkin_stats_json(v_event) || jsonb_build_object(
    'donations', (
      select jsonb_build_object(
        'count', count(*), 'total', coalesce(sum(amount), 0),
        'by_kind', coalesce((
          select jsonb_object_agg(k.kind, k.total) from (
            select kind, sum(amount) as total from public.gala_event_donations
            where event_slug = v_event and voided_at is null and not hidden group by kind
          ) k), '{}'::jsonb),
        'by_round', coalesce((
          select jsonb_object_agg(r.round_key, jsonb_build_object('gifts', r.n, 'total', r.total)) from (
            select round_key, count(*) as n, sum(amount) as total from public.gala_event_donations
            where event_slug = v_event and voided_at is null and round_key is not null group by round_key
          ) r), '{}'::jsonb)
      )
      from public.gala_event_donations where event_slug = v_event and voided_at is null and not hidden
    ),
    'ops', (
      select coalesce(jsonb_object_agg(o.kind, o.n), '{}'::jsonb) from (
        select kind, count(*) as n from public.gala_event_log where event_slug = v_event group by kind
      ) o
    )
  );

  insert into public.gala_event_archive (event_slug, stats)
  values (v_event, v_stats)
  on conflict (event_slug) do update set stats = excluded.stats, archived_at = now();

  perform set_config('gala.purge', 'on', true);

  delete from public.gala_event_donations where event_slug = v_event;
  delete from public.gala_event_log where event_slug = v_event;
  delete from public.gala_event_paddles where event_slug = v_event;
  delete from public.gala_event_guests where event_slug = v_event;
  delete from public.gala_event_sessions where event_slug = v_event;
  delete from public.gala_event_attempts where event_slug = v_event;
  delete from public.gala_event_access where event_slug = v_event;
  delete from public.gala_event_state where event_slug = v_event;

  perform set_config('gala.purge', '', true);

  return jsonb_build_object('ok', true, 'event', v_event, 'archived', v_stats -> 'totals');
end;
$fn$;

-- 11) Grants -----------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on every new function, so: revoke from
-- everyone first, then grant the Data API roles only the public RPCs.

do $grants$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'gala\_checkin%' or p.proname in ('gala_donation_add', 'gala_event_log_guard', 'gala_event_state_ping'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.sig);

    if r.proname in (
      'gala_checkin_unlock', 'gala_checkin_logout', 'gala_checkin_load', 'gala_checkin_since',
      'gala_checkin_stats', 'gala_checkin', 'gala_checkin_undo', 'gala_checkin_walkin',
      'gala_checkin_guest_update', 'gala_checkin_paddle_assign', 'gala_checkin_paddle_swap',
      'gala_checkin_paddle_release', 'gala_checkin_group_set', 'gala_checkin_pool_init',
      'gala_checkin_pool_mark', 'gala_checkin_preassign_all', 'gala_checkin_import',
      'gala_checkin_sync_seating', 'gala_checkin_session_revoke', 'gala_donation_add'
    ) then
      execute format('grant execute on function %s to anon, authenticated', r.sig);
    elsif r.proname = 'gala_checkin_admin_session' then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end
$grants$;

notify pgrst, 'reload schema';

-- Runbook --------------------------------------------------------------------
-- Create / rotate (SQL editor; never commit the values):
--   select public.gala_checkin_set_passcode('gala-2026', '<door passcode>', '<admin passcode>');
-- Clear a lockout:
--   delete from public.gala_event_attempts where event_slug = 'gala-2026';
-- Close the door for the night (door sessions stop working, admins keep access):
--   update public.gala_event_access set closed_at = now() where event_slug = 'gala-2026';
-- After the gala, once pledges are exported to the finance folder:
--   select public.gala_checkin_archive_and_purge('gala-2026', 'PURGE gala-2026');
