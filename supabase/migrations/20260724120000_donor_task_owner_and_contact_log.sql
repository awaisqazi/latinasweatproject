-- Donor task activity: a task assigned about a donor now keeps the donor
-- record in sync with who is actually working it.
--   1. Assigning a donor task sets that donor's relationship owner to the
--      assignee (setting owner_id intentionally fires the existing donor sync
--      trigger, so the assignee also gets a "Steward donor" card).
--   2. The assignment is logged in the donor's contact log as kind 'status',
--      the same auto-activity style as prospect stage/owner changes.
--   3. Marking the task done logs a completion entry in the same log.
--
-- Only manual donor tasks are in scope: those carry the `open:` prefixed ref
-- (`open:fundraising_donor:<email>`). The bare `fundraising_donor:` ref is
-- owned by app_private.sync_fundraising_donor_workspace, so the steward cards
-- that trigger creates do not match our pattern and cannot recurse.

create or replace function app_private.sync_donor_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  donor_email text;
  assignee_name text;
begin
  donor_email := lower(
    substring(coalesce(new.source_ref, '') from '^open:fundraising_donor:(.+)$'));

  if donor_email is null or btrim(donor_email) = '' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'open' and new.assignee_id is not null then
    select coalesce(nullif(btrim(full_name), ''), email, 'a teammate')
      into assignee_name
      from public.profiles
      where id = new.assignee_id;

    assignee_name := coalesce(assignee_name, 'a teammate');

    -- The WHERE clause keeps a re-assignment to the same owner from churning
    -- the steward-card sync trigger.
    insert into public.fundraising_donor_profiles (email, owner_id)
    values (donor_email, new.assignee_id)
    on conflict (email) do update
      set owner_id = excluded.owner_id
      where public.fundraising_donor_profiles.owner_id is distinct from excluded.owner_id;

    insert into public.fundraising_interactions (donor_email, kind, body)
    values (donor_email, 'status',
            'Task assigned to ' || assignee_name || ': "' || new.title || '"');

    return new;
  end if;

  if tg_op = 'UPDATE' and old.status = 'open' and new.status = 'done' then
    insert into public.fundraising_interactions (donor_email, kind, body)
    values (donor_email, 'status', 'Task completed: "' || new.title || '"');
  end if;

  return new;
end;
$$;

revoke all on function app_private.sync_donor_task_activity() from public;

drop trigger if exists sync_donor_task_activity on public.workspace_tasks;
create trigger sync_donor_task_activity
after insert or update of status on public.workspace_tasks
for each row execute function app_private.sync_donor_task_activity();
