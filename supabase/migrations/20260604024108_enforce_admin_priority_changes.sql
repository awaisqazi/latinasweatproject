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
     and not (select app_private.is_admin()) then
    raise exception 'Only admins can change project priority.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_project_priority_changes() from public;

drop trigger if exists enforce_project_priority_changes on public.projects;
create trigger enforce_project_priority_changes
before update of priority on public.projects
for each row execute function app_private.enforce_project_priority_changes();
