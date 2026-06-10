-- Split global user-access control from operational admin access.
-- Superusers manage users and have implicit module access. Admins and members
-- must be granted each operational module explicitly.

do $$
declare
  role_constraint record;
  module_constraint record;
  superuser_profile_id uuid;
begin
  select id
    into superuser_profile_id
  from public.profiles
  where lower(email) = 'awais.a.qazi@gmail.com';

  if superuser_profile_id is null then
    raise exception 'Cannot seed superuser: awais.a.qazi@gmail.com was not found in public.profiles.'
      using errcode = '23514';
  end if;

  for role_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
      and pg_get_constraintdef(oid) ilike '%admin%'
      and pg_get_constraintdef(oid) ilike '%member%'
  loop
    execute format('alter table public.profiles drop constraint %I', role_constraint.conname);
  end loop;

  alter table public.profiles
    add constraint profiles_role_check
    check (role in ('superuser', 'admin', 'member'));

  update public.profiles
  set role = 'superuser'
  where id = superuser_profile_id;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'superuser')
  where id = superuser_profile_id;

  delete from public.profile_modules
  where module = 'users';

  for module_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.profile_modules'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%module%'
  loop
    execute format('alter table public.profile_modules drop constraint %I', module_constraint.conname);
  end loop;

  alter table public.profile_modules
    add constraint profile_modules_module_check
    check (
      module in (
        'marketing',
        'board_projects',
        'volunteers',
        'subs',
        'events',
        'elections',
        'gala'
      )
    );
end $$;

create or replace function app_private.is_superuser()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'superuser'
  );
$$;

revoke all on function app_private.is_superuser() from public;
grant execute on function app_private.is_superuser() to authenticated, service_role;

-- Legacy callers should no longer treat the admin role as a global bypass.
create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (select app_private.is_superuser());
$$;

revoke all on function app_private.is_admin() from public;
grant execute on function app_private.is_admin() to authenticated, service_role;

create or replace function app_private.has_module(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select (select app_private.is_superuser())
    or exists (
      select 1
      from public.profile_modules
      where profile_id = (select auth.uid())
        and module = p_module
    );
$$;

revoke all on function app_private.has_module(text) from public;
grant execute on function app_private.has_module(text) to authenticated, service_role;

create or replace function app_private.has_admin_module(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select (select app_private.is_superuser())
    or exists (
      select 1
      from public.profiles
      join public.profile_modules
        on profile_modules.profile_id = profiles.id
       and profile_modules.module = p_module
      where profiles.id = (select auth.uid())
        and profiles.role = 'admin'
    );
$$;

revoke all on function app_private.has_admin_module(text) from public;
grant execute on function app_private.has_admin_module(text) to authenticated, service_role;

drop policy if exists "Authenticated users can read module grants" on public.profile_modules;
create policy "Users can read own grants and superusers can read all grants"
on public.profile_modules
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or (select app_private.is_superuser())
);

drop policy if exists "Admins can grant modules" on public.profile_modules;
drop policy if exists "Superusers can grant modules" on public.profile_modules;
create policy "Superusers can grant modules"
on public.profile_modules
for insert
to authenticated
with check ((select app_private.is_superuser()));

drop policy if exists "Admins can revoke modules" on public.profile_modules;
drop policy if exists "Superusers can revoke modules" on public.profile_modules;
create policy "Superusers can revoke modules"
on public.profile_modules
for delete
to authenticated
using ((select app_private.is_superuser()));

create or replace function app_private.enforce_project_status_moves()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  member_statuses constant text[] := array[
    'Ready for Production',
    'In Production',
    'Ready for Copy',
    'Ready for Review',
    'Stuck'
  ];
  actor_id uuid := (select auth.uid());
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if current_user = 'service_role' then
    return new;
  end if;

  if not (select app_private.has_admin_module('marketing'))
     and not (
       old.status = any(member_statuses)
       and new.status = any(member_statuses)
     ) then
    raise exception 'Only admins can move projects outside the production review workflow.'
      using errcode = '42501';
  end if;

  if actor_id is not null then
    insert into public.project_comments (
      project_id,
      author_id,
      author_name,
      author_email,
      body
    )
    values (
      new.id,
      actor_id,
      '',
      '',
      format('Moved this project from %s to %s.', old.status, new.status)
    );
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_project_status_moves() from public;

create or replace function app_private.enforce_project_assignment_removals()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  current_profile_email text;
  removed_email text;
  old_assigned text[];
  new_assigned text[];
begin
  if current_user = 'service_role' then
    return new;
  end if;

  if tg_op <> 'UPDATE'
     or old.assigned_to is not distinct from new.assigned_to then
    return new;
  end if;

  if (select app_private.has_admin_module('marketing')) then
    return new;
  end if;

  select lower(btrim(email))
    into current_profile_email
  from public.profiles
  where id = (select auth.uid());

  if current_profile_email is null or current_profile_email = '' then
    raise exception 'A profile email is required to update assignments.'
      using errcode = '42501';
  end if;

  old_assigned = coalesce(old.assigned_to, '{}'::text[]);
  new_assigned = coalesce(new.assigned_to, '{}'::text[]);

  for removed_email in
    select lower(btrim(value))
    from unnest(old_assigned) as value
    where btrim(value) <> ''
    except
    select lower(btrim(value))
    from unnest(new_assigned) as value
    where btrim(value) <> ''
  loop
    if removed_email <> current_profile_email then
      raise exception 'Only admins can remove assignments for other team members.'
        using errcode = '42501';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function app_private.enforce_project_assignment_removals() from public;

create or replace function app_private.enforce_project_priority_changes()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if current_user = 'service_role' then
    return new;
  end if;

  if old.priority is distinct from new.priority
     and not (select app_private.has_admin_module('marketing')) then
    raise exception 'Only admins can change project priority.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_project_priority_changes() from public;

create or replace function app_private.enforce_project_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if current_user = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT'
     and new.copy_approved is true
     and not (select app_private.has_admin_module('marketing')) then
    raise exception 'Only admins can create already-approved projects.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and old.copy_approved is distinct from new.copy_approved
     and not (select app_private.has_admin_module('marketing')) then
    raise exception 'Only admins can change copy approval.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and old.intake_reviewed is distinct from new.intake_reviewed
     and not (select app_private.has_admin_module('marketing')) then
    raise exception 'Only admins can change intake review state.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_project_admin_fields() from public;

drop policy if exists "Admins can delete projects" on public.projects;
create policy "Marketing admins can delete projects"
on public.projects
for delete
to authenticated
using ((select app_private.has_admin_module('marketing')));

drop policy if exists "Authors and admins can delete project comments" on public.project_comments;
create policy "Authors and marketing admins can delete project comments"
on public.project_comments
for delete
to authenticated
using (
  author_id = (select auth.uid())
  or (select app_private.has_admin_module('marketing'))
);

drop policy if exists "Admins can delete board projects" on public.board_projects;
create policy "Board admins can delete board projects"
on public.board_projects
for delete
to authenticated
using ((select app_private.has_admin_module('board_projects')));

drop policy if exists "Authors and admins can delete board comments" on public.board_project_comments;
create policy "Authors and board admins can delete board comments"
on public.board_project_comments
for delete
to authenticated
using (
  author_id = (select auth.uid())
  or (select app_private.has_admin_module('board_projects'))
);

drop policy if exists "Admins can delete events" on public.events;
create policy "Event admins can delete events"
on public.events
for delete
to authenticated
using ((select app_private.has_admin_module('events')));

drop policy if exists "Admins can delete votes" on public.election_votes;
create policy "Election admins can delete votes"
on public.election_votes
for delete
to authenticated
using ((select app_private.has_admin_module('elections')));

drop policy if exists "Admins can delete donations" on public.gala_donations;
create policy "Gala admins can delete donations"
on public.gala_donations
for delete
to authenticated
using ((select app_private.has_admin_module('gala')));

notify pgrst, 'reload schema';
