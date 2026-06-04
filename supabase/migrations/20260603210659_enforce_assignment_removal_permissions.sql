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

  if (select app_private.is_admin()) then
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

drop trigger if exists enforce_project_assignment_removals on public.projects;
create trigger enforce_project_assignment_removals
before update of assigned_to on public.projects
for each row execute function app_private.enforce_project_assignment_removals();
