-- Per-module access grants for the unified admin dashboard.
-- Grants live in a separate table (not on profiles) so the existing
-- "Users can update their own profile" policy cannot be used to self-grant.

create table if not exists public.profile_modules (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  module text not null check (
    module in (
      'marketing',
      'board_projects',
      'volunteers',
      'subs',
      'events',
      'elections',
      'gala',
      'users'
    )
  ),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (profile_id, module)
);

alter table public.profile_modules enable row level security;

revoke all on table public.profile_modules from anon;
grant select, insert, delete on table public.profile_modules to authenticated;
grant all on table public.profile_modules to service_role;

create or replace function app_private.has_module(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
  select (select app_private.is_admin())
    or exists (
      select 1
      from public.profile_modules
      where profile_id = (select auth.uid())
        and module = p_module
    );
$$;

revoke all on function app_private.has_module(text) from public;
grant execute on function app_private.has_module(text) to authenticated, service_role;

drop policy if exists "Authenticated users can read module grants" on public.profile_modules;
create policy "Authenticated users can read module grants"
on public.profile_modules
for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "Admins can grant modules" on public.profile_modules;
create policy "Admins can grant modules"
on public.profile_modules
for insert
to authenticated
with check ((select app_private.is_admin()));

drop policy if exists "Admins can revoke modules" on public.profile_modules;
create policy "Admins can revoke modules"
on public.profile_modules
for delete
to authenticated
using ((select app_private.is_admin()));

-- Everyone with a dashboard login today is a marketing user; preserve that.
insert into public.profile_modules (profile_id, module)
select id, 'marketing'
from public.profiles
on conflict do nothing;

-- Marketing projects are now gated by the marketing module instead of
-- "any authenticated user".
drop policy if exists "Authenticated users can read projects" on public.projects;
create policy "Authenticated users can read projects"
on public.projects
for select
to authenticated
using ((select app_private.has_module('marketing')));

drop policy if exists "Authenticated users can insert projects" on public.projects;
create policy "Authenticated users can insert projects"
on public.projects
for insert
to authenticated
with check ((select app_private.has_module('marketing')));

drop policy if exists "Authenticated users can update projects" on public.projects;
create policy "Authenticated users can update projects"
on public.projects
for update
to authenticated
using ((select app_private.has_module('marketing')))
with check ((select app_private.has_module('marketing')));

drop policy if exists "Authenticated users can read project comments" on public.project_comments;
create policy "Authenticated users can read project comments"
on public.project_comments
for select
to authenticated
using ((select app_private.has_module('marketing')));

drop policy if exists "Authenticated users can add project comments" on public.project_comments;
create policy "Authenticated users can add project comments"
on public.project_comments
for insert
to authenticated
with check (
  (select auth.uid()) = author_id
  and (select app_private.has_module('marketing'))
  and exists (
    select 1
    from public.projects
    where projects.id = project_comments.project_id
  )
);

comment on table public.projects is
  'Marketing projects (content production workflow). Board/admin projects live in public.board_projects.';

notify pgrst, 'reload schema';
