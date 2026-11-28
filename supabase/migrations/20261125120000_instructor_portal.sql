-- Instructor portal (/instructors): a passcode-gated page for LSP instructors and
-- studio coordinators. Contract: src/lib/instructorPortal/README.md.
--
-- PRIVACY RULE. The repo is PUBLIC and the page ships EMPTY. All portal content
-- (internal policy, staff contacts, schedules) is one jsonb document per slug in
-- public.instructor_portal_content, and it leaves Postgres only after the
-- passcode has been checked here. A client-side check is not a gate.
-- The passcode and its hash are NEVER written in this file, in a script, in a
-- test or in a commit message.
--
-- HOUSE PATTERN (same as 20260920120000_gala_seating.sql and
-- 20260921120000_gala_event_checkin.sql): every table has RLS on, zero grants and
-- zero policies, so the Data API cannot read or write them at all. The only way
-- in is three SECURITY DEFINER RPCs:
--   instructor_portal_unlock  passcode in, once, exchanged for a random session
--                             token (32 bytes, hex). Only sha256(token) is stored.
--   instructor_portal_fetch   token in, content out. Nothing slides: a session
--                             simply ends at expires_at (12 h, or 30 days when
--                             "remember this device" is ticked).
--   instructor_portal_lock    token in, that one session deleted.
--
-- The RPCs RETURN jsonb {ok, reason} instead of raising, because a function that
-- raises rolls back its own attempt row and the throttle would never fire.
--
-- Throttle: 20 wrong passcodes for a slug inside 10 minutes locks that slug for
-- everyone until the window clears. Loose on purpose: one person mistyping must
-- not lock the whole team out. Every wrong try sleeps 0.4 s. A wrong passcode and
-- a slug with no access row take the same path (a bcrypt compare, an attempt row,
-- the sleep, 'bad-passcode'), so unlock cannot be used to discover which slugs
-- exist. 'no-portal' (access row but no content row) is only ever returned AFTER
-- the passcode checks out.
--
-- Slugs: 'instructors' is the real portal; 'instructors-dev' is a throwaway copy
-- with a throwaway passcode for browser testing.
--
-- SETTING THE PASSCODE AND CONTENT, out of band. Both owner-only functions are
-- revoked from every Data API role. Run them from the Supabase SQL editor, or let
-- scripts/instructor-portal.mjs do it through the Management API:
--
--   node scripts/instructor-portal.mjs set-passcode --slug instructors-dev
--   node scripts/instructor-portal.mjs push --slug instructors-dev
--   node scripts/instructor-portal.mjs status --slug instructors-dev
--
-- or by hand in the SQL editor (never commit the value, never put it in a URL):
--
--   select public.instructor_portal_set_passcode('instructors', '<new passcode>');
--   select public.instructor_portal_set_content('instructors', '<json>'::jsonb);
--
-- Rotating the passcode signs everyone out (all sessions for the slug are
-- deleted) and clears the slug's lockout.
--
-- pgcrypto lives in the `extensions` schema on this project, so crypt, gen_salt,
-- gen_random_bytes and digest are schema-qualified and every function pins
-- search_path.

-- 1) Tables ------------------------------------------------------------------

-- The passcode hash (bcrypt). One row per slug.
create table if not exists public.instructor_portal_access (
  slug text primary key,
  pass_hash text not null,
  updated_at timestamptz not null default now(),
  constraint instructor_portal_access_slug_check
    check (slug ~ '^[a-z0-9-]{3,40}$')
);

-- The content document (schema 1, see the README). The copy of record.
create table if not exists public.instructor_portal_content (
  slug text primary key,
  content jsonb not null,
  updated_at timestamptz not null default now(),
  constraint instructor_portal_content_slug_check
    check (slug ~ '^[a-z0-9-]{3,40}$'),
  constraint instructor_portal_content_object_check
    check (jsonb_typeof(content) = 'object')
);

-- Live sessions. token_hash = sha256 of the hex token the browser holds.
create table if not exists public.instructor_portal_sessions (
  token_hash bytea primary key,
  slug text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint instructor_portal_sessions_slug_check
    check (slug ~ '^[a-z0-9-]{3,40}$')
);

create index if not exists instructor_portal_sessions_slug_idx
  on public.instructor_portal_sessions (slug);
create index if not exists instructor_portal_sessions_expires_idx
  on public.instructor_portal_sessions (expires_at);

-- Throttle ledger. One row per WRONG passcode (successes are not recorded).
create table if not exists public.instructor_portal_attempts (
  id bigint generated always as identity primary key,
  slug text not null,
  attempted_at timestamptz not null default now(),
  constraint instructor_portal_attempts_slug_check
    check (slug ~ '^[a-z0-9-]{3,40}$')
);

create index if not exists instructor_portal_attempts_slug_at_idx
  on public.instructor_portal_attempts (slug, attempted_at desc);
create index if not exists instructor_portal_attempts_at_idx
  on public.instructor_portal_attempts (attempted_at);

-- 2) RLS + grants ------------------------------------------------------------
-- RLS on, zero grants, zero policies: deny by default for every Data API role.
-- Supabase's default privileges grant new public tables (and their sequences) to
-- anon/authenticated, so these REVOKEs are load bearing, not decorative. The
-- SECURITY DEFINER functions run as the owner and are unaffected.

alter table public.instructor_portal_access enable row level security;
alter table public.instructor_portal_content enable row level security;
alter table public.instructor_portal_sessions enable row level security;
alter table public.instructor_portal_attempts enable row level security;

revoke all on table public.instructor_portal_access from public, anon, authenticated, service_role;
revoke all on table public.instructor_portal_content from public, anon, authenticated, service_role;
revoke all on table public.instructor_portal_sessions from public, anon, authenticated, service_role;
revoke all on table public.instructor_portal_attempts from public, anon, authenticated, service_role;

revoke all on sequence public.instructor_portal_attempts_id_seq from public, anon, authenticated, service_role;

-- 3) Public RPCs -------------------------------------------------------------

create or replace function public.instructor_portal_unlock(
  p_slug text,
  p_pass text,
  p_remember boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  -- bcrypt only reads the first 72 bytes; the cap just keeps huge bodies out.
  v_pass text := left(coalesce(p_pass, ''), 200);
  v_slug_ok boolean;
  v_hash text;
  v_match boolean;
  v_fails integer;
  v_oldest timestamptz;
  v_retry integer;
  v_token text;
  v_expires timestamptz;
  v_content jsonb;
  v_content_at timestamptz;
begin
  v_slug_ok := v_slug ~ '^[a-z0-9-]{3,40}$';

  -- Opportunistic housekeeping, every call (both deletes are index range scans).
  delete from public.instructor_portal_sessions where expires_at < now();
  delete from public.instructor_portal_attempts where attempted_at < now() - interval '1 day';

  -- Count BEFORE looking at the passcode: a locked slug is never compared.
  if v_slug_ok then
    select count(*) into v_fails
    from public.instructor_portal_attempts
    where slug = v_slug
      and attempted_at > now() - interval '10 minutes';

    if v_fails >= 20 then
      -- The lock lifts when the window holds 19 rows again, i.e. when the
      -- (v_fails - 19)th oldest row in it turns 10 minutes old.
      select attempted_at into v_oldest
      from public.instructor_portal_attempts
      where slug = v_slug
        and attempted_at > now() - interval '10 minutes'
      order by attempted_at asc
      offset (v_fails - 20)
      limit 1;

      v_retry := greatest(1, ceil(extract(epoch from (v_oldest + interval '10 minutes' - now())))::integer);
      return jsonb_build_object('ok', false, 'reason', 'locked', 'retry_after_seconds', v_retry);
    end if;

    select a.pass_hash into v_hash
    from public.instructor_portal_access a
    where a.slug = v_slug;
  end if;

  -- One timing path for every miss. With no access row the compare runs against
  -- a freshly generated salt (never a stored or committed hash), so it costs the
  -- same bcrypt work as a real compare and can never match.
  -- Exactly one bcrypt compare runs on every path.
  v_match := extensions.crypt(v_pass, coalesce(v_hash, extensions.gen_salt('bf', 10))) = v_hash;

  if v_hash is null or v_pass = '' or not coalesce(v_match, false) then
    if v_slug_ok then
      insert into public.instructor_portal_attempts (slug) values (v_slug);
    end if;
    perform pg_catalog.pg_sleep(0.4);
    return jsonb_build_object('ok', false, 'reason', 'bad-passcode');
  end if;

  -- Passcode is right from here on.
  select c.content, c.updated_at into v_content, v_content_at
  from public.instructor_portal_content c
  where c.slug = v_slug;

  if v_content is null then
    return jsonb_build_object('ok', false, 'reason', 'no-portal');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + case when coalesce(p_remember, false)
                            then interval '30 days'
                            else interval '12 hours' end;

  insert into public.instructor_portal_sessions (token_hash, slug, expires_at)
  values (extensions.digest(v_token, 'sha256'), v_slug, v_expires);

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_expires,
    'content', v_content,
    'content_updated_at', v_content_at
  );
end;
$fn$;

create or replace function public.instructor_portal_fetch(p_slug text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_token text := coalesce(p_token, '');
  v_expires timestamptz;
  v_content jsonb;
  v_content_at timestamptz;
begin
  if v_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select s.expires_at into v_expires
  from public.instructor_portal_sessions s
  where s.token_hash = extensions.digest(v_token, 'sha256')
    and s.slug = v_slug
    and s.expires_at > now();

  if v_expires is null then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select c.content, c.updated_at into v_content, v_content_at
  from public.instructor_portal_content c
  where c.slug = v_slug;

  -- The content row was removed under a live session (teardown): treat the
  -- session as over, the contract's only failure reason here.
  if v_content is null then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  return jsonb_build_object(
    'ok', true,
    'content', v_content,
    'content_updated_at', v_content_at,
    'expires_at', v_expires
  );
end;
$fn$;

create or replace function public.instructor_portal_lock(p_slug text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
begin
  delete from public.instructor_portal_sessions s
  where s.token_hash = extensions.digest(coalesce(p_token, ''), 'sha256')
    and s.slug = btrim(coalesce(p_slug, ''));
  return jsonb_build_object('ok', true);
end;
$fn$;

-- 4) Owner-only functions ----------------------------------------------------
-- Deliberately NOT callable from the Data API. Run from the SQL editor or the
-- Management API (scripts/instructor-portal.mjs), so the passcode never appears
-- in this repo.

create or replace function public.instructor_portal_set_passcode(p_slug text, p_new_pass text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_pass text := coalesce(p_new_pass, '');
  v_ended integer;
begin
  if v_slug !~ '^[a-z0-9-]{3,40}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-slug');
  end if;
  if char_length(v_pass) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'passcode-too-short');
  end if;
  -- bcrypt ignores everything after 72 bytes; refuse rather than truncate quietly.
  if octet_length(v_pass) > 72 then
    return jsonb_build_object('ok', false, 'reason', 'passcode-too-long');
  end if;

  insert into public.instructor_portal_access (slug, pass_hash, updated_at)
  values (v_slug, extensions.crypt(v_pass, extensions.gen_salt('bf', 10)), now())
  on conflict (slug) do update
    set pass_hash = excluded.pass_hash,
        updated_at = excluded.updated_at;

  -- Rotating the passcode signs everyone out.
  delete from public.instructor_portal_sessions where slug = v_slug;
  get diagnostics v_ended = row_count;

  -- A rotation should not inherit an old lockout.
  delete from public.instructor_portal_attempts where slug = v_slug;

  return jsonb_build_object('ok', true, 'slug', v_slug, 'sessions_ended', v_ended);
end;
$fn$;

create or replace function public.instructor_portal_set_content(p_slug text, p_content jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_at timestamptz := now();
begin
  if v_slug !~ '^[a-z0-9-]{3,40}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-slug');
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'not-an-object');
  end if;
  -- Two plain IFs: a CASE inside an IF condition would end the condition at the
  -- CASE's own THEN, and jsonb equality needs no cast, so order does not matter.
  if jsonb_typeof(p_content -> 'schema') is distinct from 'number' then
    return jsonb_build_object('ok', false, 'reason', 'bad-schema');
  end if;
  if (p_content -> 'schema') <> '1'::jsonb then
    return jsonb_build_object('ok', false, 'reason', 'bad-schema');
  end if;
  -- A sanity cap; the real document is tens of kilobytes.
  if octet_length(p_content::text) > 1000000 then
    return jsonb_build_object('ok', false, 'reason', 'too-large');
  end if;

  insert into public.instructor_portal_content (slug, content, updated_at)
  values (v_slug, p_content, v_at)
  on conflict (slug) do update
    set content = excluded.content,
        updated_at = excluded.updated_at;

  return jsonb_build_object(
    'ok', true,
    'slug', v_slug,
    'updated_at', v_at,
    'bytes', octet_length(p_content::text)
  );
end;
$fn$;

-- 5) Function grants ---------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase's default
-- privileges add anon/authenticated, so revoke from everyone first, then grant
-- the Data API roles the three public RPCs only.

revoke all on function public.instructor_portal_unlock(text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.instructor_portal_fetch(text, text) from public, anon, authenticated, service_role;
revoke all on function public.instructor_portal_lock(text, text) from public, anon, authenticated, service_role;

grant execute on function public.instructor_portal_unlock(text, text, boolean) to anon, authenticated;
grant execute on function public.instructor_portal_fetch(text, text) to anon, authenticated;
grant execute on function public.instructor_portal_lock(text, text) to anon, authenticated;

-- No grant here, on purpose.
revoke all on function public.instructor_portal_set_passcode(text, text) from public, anon, authenticated, service_role;
revoke all on function public.instructor_portal_set_content(text, jsonb) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- Runbook --------------------------------------------------------------------
-- Clear a lockout without rotating:
--   delete from public.instructor_portal_attempts where slug = 'instructors';
-- Sign everyone out without rotating:
--   delete from public.instructor_portal_sessions where slug = 'instructors';
-- Retire the throwaway test copy:
--   delete from public.instructor_portal_sessions where slug = 'instructors-dev';
--   delete from public.instructor_portal_attempts where slug = 'instructors-dev';
--   delete from public.instructor_portal_content where slug = 'instructors-dev';
--   delete from public.instructor_portal_access where slug = 'instructors-dev';
--
-- Teardown (removes the portal entirely; run by hand, in this order):
--   drop function if exists public.instructor_portal_unlock(text, text, boolean);
--   drop function if exists public.instructor_portal_fetch(text, text);
--   drop function if exists public.instructor_portal_lock(text, text);
--   drop function if exists public.instructor_portal_set_passcode(text, text);
--   drop function if exists public.instructor_portal_set_content(text, jsonb);
--   drop table if exists public.instructor_portal_sessions;
--   drop table if exists public.instructor_portal_attempts;
--   drop table if exists public.instructor_portal_content;
--   drop table if exists public.instructor_portal_access;
--   notify pgrst, 'reload schema';
