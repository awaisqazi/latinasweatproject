alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check check (
    status in (
      'Ready for Production',
      'In Production',
      'Ready for Copy',
      'Ready for Review',
      'Ready to Publish',
      'Published',
      'Stuck',
      'Archived'
    )
  );

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
    'Ready for Review'
  ];
  actor_id uuid := (select auth.uid());
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if current_user = 'service_role' then
    return new;
  end if;

  if not (select app_private.is_admin())
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

drop trigger if exists enforce_project_status_moves on public.projects;
create trigger enforce_project_status_moves
before update of status on public.projects
for each row execute function app_private.enforce_project_status_moves();
