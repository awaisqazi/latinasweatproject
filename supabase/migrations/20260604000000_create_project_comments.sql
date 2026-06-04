create extension if not exists pgcrypto;

create schema if not exists app_private;

revoke all on schema app_private from public;

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_email text not null,
  body text not null check (char_length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists project_comments_project_created_idx
  on public.project_comments(project_id, created_at);

alter table public.project_comments enable row level security;

revoke all on table public.project_comments from anon;
grant select, insert, delete on table public.project_comments to authenticated;
grant all on table public.project_comments to service_role;

create or replace function app_private.set_project_comment_author()
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
    raise exception 'Project comment author is required.'
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

drop trigger if exists set_project_comment_author on public.project_comments;
create trigger set_project_comment_author
before insert on public.project_comments
for each row execute function app_private.set_project_comment_author();

drop policy if exists "Authenticated users can read project comments" on public.project_comments;
create policy "Authenticated users can read project comments"
on public.project_comments
for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "Authenticated users can add project comments" on public.project_comments;
create policy "Authenticated users can add project comments"
on public.project_comments
for insert
to authenticated
with check (
  (select auth.uid()) = author_id
  and exists (
    select 1
    from public.projects
    where projects.id = project_comments.project_id
  )
);

drop policy if exists "Authors and admins can delete project comments" on public.project_comments;
create policy "Authors and admins can delete project comments"
on public.project_comments
for delete
to authenticated
using (
  author_id = (select auth.uid())
  or (select app_private.is_admin())
);
