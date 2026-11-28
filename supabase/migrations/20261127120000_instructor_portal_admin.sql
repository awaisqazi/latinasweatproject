-- Instructor portal, staff editing from the dashboard (/admin#instructor-portal).
-- Contract: src/lib/instructorPortal/README.md ("Editing content").
-- Builds on 20261125120000_instructor_portal.sql and rewrites nothing in it:
-- additive only (one new table, one trigger on the content table, four new
-- functions, one module key).
--
-- WHY. The portal's "This week" note changes every week and the people who write
-- it do not have this repo or the owner's Supabase CLI token. This lets a
-- dashboard user who holds the new `instructor_portal` module read the content
-- document and save an edited one, from the browser, with their own login.
--
-- WHO CAN CALL WHAT.
--   instructor_portal_admin_get   authenticated + app_private.has_module('instructor_portal')
--   instructor_portal_admin_save  the same
--   instructor_portal_restore_version   owner only (SQL editor), like set_content
-- Superusers pass has_module implicitly, as everywhere else in the dashboard.
-- `anon` has no EXECUTE on any of them. Granting the module therefore means
-- "may read the whole portal without the passcode and edit it": grant it to the
-- people who run the portal, nobody else.
--
-- WHAT STAYS SHUT.
--   * The four portal tables keep RLS on, zero grants and zero policies. Nothing
--     here grants a table or adds a policy; the new history table gets the same
--     treatment. The only way in is still SECURITY DEFINER functions.
--   * These functions never read public.instructor_portal_access. The passcode
--     hash is not selected, compared or returned anywhere in this file.
--   * A save may change ONLY the top-level keys `updated`, `week`, `dates` and
--     `faq`. Every other key (handbook, contacts, coordinators, ...) must come
--     back exactly as stored or the save is refused ('locked-sections'), so a
--     browser bug or a hand-made request cannot wipe the handbook. To open up
--     another section later, add its key to v_editable in a new migration and
--     to EDITABLE_KEYS in src/lib/instructorPortal/editor.js.
--   * A save cannot create a portal: the slug's content row must already exist
--     (created by the owner with instructor_portal_set_content).
--
-- TWO PEOPLE EDITING. The editor sends back the updated_at it loaded
-- (p_expected_updated_at). If the row has moved since, someone else saved first
-- and the save is refused with reason 'conflict' and nothing is written. The
-- row is locked FOR UPDATE while this is checked, so two saves cannot both win.
-- The client must pass the string back untouched: timestamptz carries
-- microseconds and a JavaScript Date would round them off.
--
-- HISTORY. A trigger on public.instructor_portal_content copies the document
-- that is about to be replaced into public.instructor_portal_content_history,
-- with who replaced it and when, whenever the content actually changes. It is
-- a trigger, not a line in the save function, so it also covers the owner's
-- script: a `push` of a stale working copy over this week's notes can be put
-- back. instructor_portal_set_content itself is not edited. The newest 50
-- versions per slug are kept. To put one back, see the runbook at the end.
--
-- Like the other portal RPCs, these RETURN jsonb {ok, reason} instead of raising.
--
-- NOT APPLIED BY THE AUTHOR. Review, then apply, before the dashboard change
-- that adds the module ships: until the constraint below is in, User Access
-- cannot grant `instructor_portal`, and until the functions exist the module
-- only says it is not switched on yet.

-- 1) Register the module so User Access can grant it -------------------------
-- Same list as 20260801120000_time_clock_module.sql plus the new key.

alter table public.profile_modules
  drop constraint if exists profile_modules_module_check;

alter table public.profile_modules
  add constraint profile_modules_module_check
  check (
    module in (
      'marketing', 'board_projects', 'volunteers', 'subs', 'events',
      'elections', 'gala', 'users', 'spaces', 'fundraising', 'inventory',
      'time_clock', 'instructor_portal'
    )
  );

-- 2) History table -----------------------------------------------------------
-- One row per replaced document. `content` is the document that WAS live from
-- content_updated_at until replaced_at. replaced_by is the dashboard user who
-- saved over it; it is null for the owner's script or SQL editor (source
-- 'owner'), or if that profile is later deleted.

create table if not exists public.instructor_portal_content_history (
  id bigint generated always as identity primary key,
  slug text not null,
  content jsonb not null,
  content_updated_at timestamptz not null,
  replaced_at timestamptz not null default now(),
  replaced_by uuid references public.profiles(id) on delete set null,
  source text not null default 'dashboard',
  constraint instructor_portal_content_history_slug_check
    check (slug ~ '^[a-z0-9-]{3,40}$'),
  constraint instructor_portal_content_history_object_check
    check (jsonb_typeof(content) = 'object'),
  constraint instructor_portal_content_history_source_check
    check (source in ('dashboard', 'owner'))
);

create index if not exists instructor_portal_content_history_slug_id_idx
  on public.instructor_portal_content_history (slug, id desc);
create index if not exists instructor_portal_content_history_replaced_by_idx
  on public.instructor_portal_content_history (replaced_by);

-- RLS on, zero grants, zero policies: the same deny-by-default as the other
-- portal tables. Supabase's default privileges would otherwise hand a new
-- public table (and its sequence) to anon/authenticated, so the REVOKEs matter.
alter table public.instructor_portal_content_history enable row level security;

revoke all on table public.instructor_portal_content_history from public, anon, authenticated, service_role;
revoke all on sequence public.instructor_portal_content_history_id_seq from public, anon, authenticated, service_role;

-- 3) Keep history on every replacement ---------------------------------------
-- Fires for the dashboard save, the owner's set_content and the owner's
-- restore alike. auth.uid() is the signed-in dashboard user on a Data API
-- call and null from the SQL editor or the Management API.

create or replace function app_private.instructor_portal_keep_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_keep constant integer := 50;
begin
  if new.content is not distinct from old.content then
    return new;
  end if;

  insert into public.instructor_portal_content_history
    (slug, content, content_updated_at, replaced_at, replaced_by, source)
  values (
    old.slug, old.content, old.updated_at, new.updated_at, v_uid,
    case when v_uid is null then 'owner' else 'dashboard' end
  );

  delete from public.instructor_portal_content_history h
  where h.slug = old.slug
    and h.id not in (
      select k.id
      from public.instructor_portal_content_history k
      where k.slug = old.slug
      order by k.id desc
      limit v_keep
    );

  return new;
end;
$fn$;

revoke all on function app_private.instructor_portal_keep_history() from public;

drop trigger if exists instructor_portal_content_keep_history on public.instructor_portal_content;
create trigger instructor_portal_content_keep_history
before update on public.instructor_portal_content
for each row execute function app_private.instructor_portal_keep_history();

-- 4) Dashboard RPCs ----------------------------------------------------------

create or replace function public.instructor_portal_admin_get(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_content jsonb;
  v_content_at timestamptz;
  v_by text;
begin
  if (select auth.uid()) is null
     or not coalesce((select app_private.has_module('instructor_portal')), false) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if v_slug !~ '^[a-z0-9-]{3,40}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-slug');
  end if;

  select c.content, c.updated_at into v_content, v_content_at
  from public.instructor_portal_content c
  where c.slug = v_slug;

  if v_content is null then
    return jsonb_build_object('ok', false, 'reason', 'no-portal');
  end if;

  -- Who saved the version that is live now: the history row written when it
  -- went live carries its timestamp. The owner's script or SQL editor leaves
  -- no name (null), and the editor then shows the time alone.
  select nullif(btrim(p.full_name), '') into v_by
  from public.instructor_portal_content_history h
  left join public.profiles p on p.id = h.replaced_by
  where h.slug = v_slug
    and h.replaced_at = v_content_at
  order by h.id desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'slug', v_slug,
    'content', v_content,
    'updated_at', v_content_at,
    'updated_by', v_by
  );
end;
$fn$;

create or replace function public.instructor_portal_admin_save(
  p_slug text,
  p_content jsonb,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_uid uuid := (select auth.uid());
  -- The only top-level keys a dashboard save may change. Keep in step with
  -- EDITABLE_KEYS in src/lib/instructorPortal/editor.js.
  v_editable constant text[] := array['updated', 'week', 'dates', 'faq'];
  v_old jsonb;
  v_old_at timestamptz;
  v_at timestamptz;
begin
  if v_uid is null
     or not coalesce((select app_private.has_module('instructor_portal')), false) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  -- The same checks as instructor_portal_set_content, in the same order.
  if v_slug !~ '^[a-z0-9-]{3,40}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-slug');
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'not-an-object');
  end if;
  if jsonb_typeof(p_content -> 'schema') is distinct from 'number' then
    return jsonb_build_object('ok', false, 'reason', 'bad-schema');
  end if;
  if (p_content -> 'schema') <> '1'::jsonb then
    return jsonb_build_object('ok', false, 'reason', 'bad-schema');
  end if;
  if octet_length(p_content::text) > 1000000 then
    return jsonb_build_object('ok', false, 'reason', 'too-large');
  end if;

  if p_expected_updated_at is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-version');
  end if;

  -- Lock the row: a second save for this slug waits here, then sees the new
  -- updated_at and is refused as a conflict.
  select c.content, c.updated_at into v_old, v_old_at
  from public.instructor_portal_content c
  where c.slug = v_slug
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-portal');
  end if;

  if v_old_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok', false, 'reason', 'conflict', 'updated_at', v_old_at);
  end if;

  -- jsonb equality ignores key order and whitespace, so this compares meaning.
  if (p_content - v_editable) is distinct from (v_old - v_editable) then
    return jsonb_build_object('ok', false, 'reason', 'locked-sections');
  end if;

  if p_content = v_old then
    return jsonb_build_object(
      'ok', true, 'slug', v_slug, 'updated_at', v_old_at, 'unchanged', true
    );
  end if;

  -- Strictly later than the version it replaces, whatever the clock says.
  v_at := greatest(clock_timestamp(), v_old_at + interval '1 microsecond');

  -- The keep_history trigger files v_old before this lands.
  update public.instructor_portal_content
  set content = p_content,
      updated_at = v_at
  where slug = v_slug;

  return jsonb_build_object(
    'ok', true,
    'slug', v_slug,
    'updated_at', v_at,
    'unchanged', false,
    'bytes', octet_length(p_content::text)
  );
end;
$fn$;

-- 5) Owner-only restore ------------------------------------------------------
-- Deliberately NOT callable from the Data API, like instructor_portal_set_content.
-- Puts one history version back as the live document. The trigger files the
-- document it replaces, so a restore can itself be undone. Anyone with the
-- editor open gets a 'conflict' on their next save and reloads.

create or replace function public.instructor_portal_restore_version(
  p_slug text,
  p_history_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_slug text := btrim(coalesce(p_slug, ''));
  v_doc jsonb;
  v_doc_at timestamptz;
  v_old jsonb;
  v_old_at timestamptz;
  v_at timestamptz;
begin
  if v_slug !~ '^[a-z0-9-]{3,40}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-slug');
  end if;

  select h.content, h.content_updated_at into v_doc, v_doc_at
  from public.instructor_portal_content_history h
  where h.id = p_history_id
    and h.slug = v_slug;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-version');
  end if;

  select c.content, c.updated_at into v_old, v_old_at
  from public.instructor_portal_content c
  where c.slug = v_slug
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-portal');
  end if;

  v_at := greatest(clock_timestamp(), v_old_at + interval '1 microsecond');

  update public.instructor_portal_content
  set content = v_doc,
      updated_at = v_at
  where slug = v_slug;

  return jsonb_build_object(
    'ok', true,
    'slug', v_slug,
    'updated_at', v_at,
    'restored_history_id', p_history_id,
    'restored_version_from', v_doc_at
  );
end;
$fn$;

-- 6) Function grants ---------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase's default
-- privileges add anon/authenticated, so revoke from everyone first. Then the two
-- dashboard RPCs go to `authenticated` only (never anon); each one still checks
-- the module inside.

revoke all on function public.instructor_portal_admin_get(text) from public, anon, authenticated, service_role;
revoke all on function public.instructor_portal_admin_save(text, jsonb, timestamptz) from public, anon, authenticated, service_role;

grant execute on function public.instructor_portal_admin_get(text) to authenticated;
grant execute on function public.instructor_portal_admin_save(text, jsonb, timestamptz) to authenticated;

-- No grant here, on purpose.
revoke all on function public.instructor_portal_restore_version(text, bigint) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- Runbook --------------------------------------------------------------------
-- See the recent versions of a slug (sizes only, no content printed):
--   select h.id, h.content_updated_at as live_from, h.replaced_at as live_until,
--          h.source, p.full_name as replaced_by, octet_length(h.content::text) as bytes
--   from public.instructor_portal_content_history h
--   left join public.profiles p on p.id = h.replaced_by
--   where h.slug = 'instructors'
--   order by h.id desc
--   limit 10;
-- Put a version back (the newest row is what the last save or push replaced):
--   select public.instructor_portal_restore_version('instructors', <id from the list>);
-- Check the grants are what this file says (expect the two admin RPCs for
-- `authenticated` only, and no row at all for the history table):
--   select routine_name, grantee from information_schema.routine_privileges
--   where routine_schema = 'public' and routine_name like 'instructor_portal_%'
--   order by 1, 2;
--   select grantee, privilege_type from information_schema.table_privileges
--   where table_schema = 'public' and table_name = 'instructor_portal_content_history'
--     and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC');
--
-- Teardown of this file only (run by hand, in this order):
--   drop function if exists public.instructor_portal_admin_get(text);
--   drop function if exists public.instructor_portal_admin_save(text, jsonb, timestamptz);
--   drop function if exists public.instructor_portal_restore_version(text, bigint);
--   drop trigger if exists instructor_portal_content_keep_history on public.instructor_portal_content;
--   drop function if exists app_private.instructor_portal_keep_history();
--   drop table if exists public.instructor_portal_content_history;
--   delete from public.profile_modules where module = 'instructor_portal';
--   (then re-add profile_modules_module_check without 'instructor_portal')
--   notify pgrst, 'reload schema';
