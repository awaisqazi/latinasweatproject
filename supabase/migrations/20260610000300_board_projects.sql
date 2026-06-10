-- Board / administrative project tracker, separate from the marketing
-- content-production workflow in public.projects.

create table if not exists public.board_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) > 0),
  description text,
  status text not null default 'Planning' check (
    status in ('Planning', 'In Progress', 'Blocked', 'Done')
  ),
  owner_id uuid references public.profiles(id) on delete set null,
  due_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_projects_status_idx on public.board_projects(status, due_date);
create index if not exists board_projects_due_date_idx on public.board_projects(due_date);

create table if not exists public.board_project_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.board_projects(id) on delete cascade,
  title text not null check (char_length(btrim(title)) > 0),
  done boolean not null default false,
  done_at timestamptz,
  assignee_id uuid references public.profiles(id) on delete set null,
  due_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_project_tasks_project_idx
  on public.board_project_tasks(project_id, sort_order);

create table if not exists public.board_project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.board_projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_email text not null,
  body text not null check (char_length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists board_project_comments_project_created_idx
  on public.board_project_comments(project_id, created_at);

alter table public.board_projects enable row level security;
alter table public.board_project_tasks enable row level security;
alter table public.board_project_comments enable row level security;

revoke all on table public.board_projects from anon;
revoke all on table public.board_project_tasks from anon;
revoke all on table public.board_project_comments from anon;

grant select, insert, update, delete on table public.board_projects to authenticated;
grant select, insert, update, delete on table public.board_project_tasks to authenticated;
grant select, insert, delete on table public.board_project_comments to authenticated;

grant all on table public.board_projects to service_role;
grant all on table public.board_project_tasks to service_role;
grant all on table public.board_project_comments to service_role;

drop trigger if exists set_board_projects_updated_at on public.board_projects;
create trigger set_board_projects_updated_at
before update on public.board_projects
for each row execute function public.set_updated_at();

drop trigger if exists set_board_project_tasks_updated_at on public.board_project_tasks;
create trigger set_board_project_tasks_updated_at
before update on public.board_project_tasks
for each row execute function public.set_updated_at();

-- Reuse the marketing comment author trigger pattern (same body, board table).
create or replace function app_private.set_board_project_comment_author()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  profile_record record;
begin
  new.body = btrim(new.body);

  if (select auth.uid()) is not null then
    new.author_id = (select auth.uid());
  end if;

  if new.author_id is null then
    raise exception 'Comment author is required.'
      using errcode = '23502';
  end if;

  select full_name, email
    into profile_record
  from public.profiles
  where id = new.author_id;

  new.author_name = coalesce(
    nullif(btrim(profile_record.full_name), ''),
    profile_record.email,
    nullif(btrim(new.author_name), ''),
    'Team member'
  );
  new.author_email = coalesce(
    nullif(btrim(profile_record.email), ''),
    nullif(btrim(new.author_email), ''),
    ''
  );

  return new;
end;
$$;

revoke all on function app_private.set_board_project_comment_author() from public;

drop trigger if exists set_board_project_comment_author on public.board_project_comments;
create trigger set_board_project_comment_author
before insert on public.board_project_comments
for each row execute function app_private.set_board_project_comment_author();

drop policy if exists "Board module can read board projects" on public.board_projects;
create policy "Board module can read board projects"
on public.board_projects
for select
to authenticated
using ((select app_private.has_module('board_projects')));

drop policy if exists "Board module can insert board projects" on public.board_projects;
create policy "Board module can insert board projects"
on public.board_projects
for insert
to authenticated
with check ((select app_private.has_module('board_projects')));

drop policy if exists "Board module can update board projects" on public.board_projects;
create policy "Board module can update board projects"
on public.board_projects
for update
to authenticated
using ((select app_private.has_module('board_projects')))
with check ((select app_private.has_module('board_projects')));

drop policy if exists "Admins can delete board projects" on public.board_projects;
create policy "Admins can delete board projects"
on public.board_projects
for delete
to authenticated
using ((select app_private.is_admin()));

drop policy if exists "Board module can read board tasks" on public.board_project_tasks;
create policy "Board module can read board tasks"
on public.board_project_tasks
for select
to authenticated
using ((select app_private.has_module('board_projects')));

drop policy if exists "Board module can insert board tasks" on public.board_project_tasks;
create policy "Board module can insert board tasks"
on public.board_project_tasks
for insert
to authenticated
with check ((select app_private.has_module('board_projects')));

drop policy if exists "Board module can update board tasks" on public.board_project_tasks;
create policy "Board module can update board tasks"
on public.board_project_tasks
for update
to authenticated
using ((select app_private.has_module('board_projects')))
with check ((select app_private.has_module('board_projects')));

drop policy if exists "Board module can delete board tasks" on public.board_project_tasks;
create policy "Board module can delete board tasks"
on public.board_project_tasks
for delete
to authenticated
using ((select app_private.has_module('board_projects')));

drop policy if exists "Board module can read board comments" on public.board_project_comments;
create policy "Board module can read board comments"
on public.board_project_comments
for select
to authenticated
using ((select app_private.has_module('board_projects')));

drop policy if exists "Board module can add board comments" on public.board_project_comments;
create policy "Board module can add board comments"
on public.board_project_comments
for insert
to authenticated
with check (
  (select auth.uid()) = author_id
  and (select app_private.has_module('board_projects'))
  and exists (
    select 1
    from public.board_projects
    where board_projects.id = board_project_comments.project_id
  )
);

drop policy if exists "Authors and admins can delete board comments" on public.board_project_comments;
create policy "Authors and admins can delete board comments"
on public.board_project_comments
for delete
to authenticated
using (
  author_id = (select auth.uid())
  or (select app_private.is_admin())
);

-- Unified project calendar: marketing deadlines/publish dates + board due dates.
-- security_invoker so each caller only sees rows their module grants allow.
create or replace view public.calendar_items
with (security_invoker = on) as
  select
    'marketing'::text as source,
    id,
    title,
    deadline as item_date,
    'deadline'::text as item_type,
    status
  from public.projects
  where deadline is not null
  union all
  select
    'marketing'::text as source,
    id,
    title,
    publish_date as item_date,
    'publish'::text as item_type,
    status
  from public.projects
  where publish_date is not null
  union all
  select
    'board'::text as source,
    id,
    title,
    due_date as item_date,
    'due'::text as item_type,
    status
  from public.board_projects
  where due_date is not null;

revoke all on table public.calendar_items from anon;
grant select on table public.calendar_items to authenticated;
grant select on table public.calendar_items to service_role;

notify pgrst, 'reload schema';
