-- Baseline for the original marketing dashboard schema.
--
-- The linked Supabase project already had these objects before migration
-- history started at 20260603210659. Local database resets replay migrations
-- from an empty database, so keep this baseline idempotent and non-overwriting.

create extension if not exists pgcrypto;
create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema public to authenticated;
grant usage on schema app_private to authenticated, service_role;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null unique,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  priority text check (priority is null or priority in ('P0', 'P1', 'P2')),
  status text not null default 'Ready for Production' check (
    status in (
      'Ready for Production',
      'In Production',
      'Ready for Copy',
      'Ready to Publish',
      'Published',
      'Stuck',
      'Archived'
    )
  ),
  deadline date,
  publish_date date,
  details_url text,
  copy_approved boolean not null default false,
  files_url text,
  deliverables_url text,
  assigned_to text[] not null default '{}',
  edit_notes text,
  channel_tags text[] not null default '{}',
  source text not null default 'manual' check (source in ('manual', 'google_form')),
  intake_response_id text unique,
  intake_submitted_at timestamptz,
  intake_respondent_email text,
  intake_contact_name text,
  intake_urgency smallint check (intake_urgency between 1 and 5),
  intake_reviewed boolean not null default true,
  intake_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_deadline_idx on public.projects(deadline);
create index if not exists projects_publish_date_idx on public.projects(publish_date);
create index if not exists projects_assigned_to_gin_idx on public.projects using gin(assigned_to);
create index if not exists projects_channel_tags_gin_idx on public.projects using gin(channel_tags);
create index if not exists projects_intake_review_idx
  on public.projects(source, intake_reviewed, intake_submitted_at);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.projects from anon;

grant select on table public.profiles to authenticated;
grant insert (id, full_name, email) on table public.profiles to authenticated;
grant update (full_name, email) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;

grant all on table public.profiles to service_role;
grant all on table public.projects to service_role;

do $$
begin
  if to_regprocedure('app_private.is_admin()') is null then
    execute $fn$
      create function app_private.is_admin()
      returns boolean
      language sql
      stable
      security definer
      set search_path = public, pg_temp
      as $body$
        select exists (
          select 1
          from public.profiles
          where id = (select auth.uid())
            and role = 'admin'
        );
      $body$;
    $fn$;
  end if;
end $$;

revoke all on function app_private.is_admin() from public;
grant execute on function app_private.is_admin() to authenticated, service_role;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is null then
    execute $fn$
      create function public.set_updated_at()
      returns trigger
      language plpgsql
      set search_path = public, pg_temp
      as $body$
      begin
        new.updated_at = now();
        return new;
      end;
      $body$;
    $fn$;
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.handle_new_user()') is null then
    execute $fn$
      create function public.handle_new_user()
      returns trigger
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      begin
        insert into public.profiles (id, full_name, email)
        values (
          new.id,
          coalesce(
            new.raw_user_meta_data ->> 'full_name',
            new.raw_user_meta_data ->> 'name',
            split_part(new.email, '@', 1)
          ),
          new.email
        )
        on conflict (id) do update
          set email = excluded.email,
              full_name = coalesce(public.profiles.full_name, excluded.full_name),
              updated_at = now();

        return new;
      end;
      $body$;
    $fn$;
  end if;
end $$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

do $$
begin
  if to_regprocedure('app_private.enforce_project_admin_fields()') is null then
    execute $fn$
      create function app_private.enforce_project_admin_fields()
      returns trigger
      language plpgsql
      security definer
      set search_path = public, app_private, pg_temp
      as $body$
      begin
        if current_user = 'service_role' then
          return new;
        end if;

        if tg_op = 'INSERT'
           and new.copy_approved is true
           and not (select app_private.is_admin()) then
          raise exception 'Only admins can create already-approved projects.'
            using errcode = '42501';
        end if;

        if tg_op = 'UPDATE'
           and old.copy_approved is distinct from new.copy_approved
           and not (select app_private.is_admin()) then
          raise exception 'Only admins can change copy approval.'
            using errcode = '42501';
        end if;

        if tg_op = 'UPDATE'
           and old.intake_reviewed is distinct from new.intake_reviewed
           and not (select app_private.is_admin()) then
          raise exception 'Only admins can change intake review state.'
            using errcode = '42501';
        end if;

        return new;
      end;
      $body$;
    $fn$;
  end if;
end $$;

revoke all on function app_private.enforce_project_admin_fields() from public;
revoke all on function app_private.enforce_project_admin_fields() from anon;
revoke all on function app_private.enforce_project_admin_fields() from authenticated;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists lsp_on_auth_user_created on auth.users;
create trigger lsp_on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists enforce_project_admin_fields_insert on public.projects;
create trigger enforce_project_admin_fields_insert
before insert on public.projects
for each row execute function app_private.enforce_project_admin_fields();

drop trigger if exists enforce_project_admin_fields_update on public.projects;
create trigger enforce_project_admin_fields_update
before update of copy_approved, intake_reviewed on public.projects
for each row execute function app_private.enforce_project_admin_fields();
