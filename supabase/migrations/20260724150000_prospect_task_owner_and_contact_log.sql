-- Extends the donor-task behaviour from 20260724120000 / 20260724130000 to
-- prospect tasks: a task assigned about a prospect (source_ref
-- 'open:fundraising_prospect:<uuid>', set by ProspectDrawer) now makes the
-- assignee the prospect's owner and logs the assignment and completion in the
-- prospect's contact log.
--
-- This stays as ONE function with two branches rather than a second trigger on
-- workspace_tasks: two triggers firing on the same row would both have to
-- re-derive the ref and would be easy to leave in an inconsistent state. The
-- function keeps its original name so the existing trigger keeps working; only
-- its body grows a prospect branch.
--
-- Prospect ownership OVERWRITES an existing owner (with an anti-churn guard),
-- matching the outreach behaviour. Note that migration 20260718110000 already
-- logs prospect owner changes as their own kind 'status' entry, so flipping
-- ownership produces two log lines: "Owner set to X." from that trigger and
-- our "Task assigned to X: ..." here. They say different things (who owns the
-- relationship vs. what work was handed over) and only co-occur when ownership
-- actually changes, so both are kept.
--
-- Re-entrancy: the prospect update fires sync_fundraising_prospect_workspace,
-- which writes a workspace_tasks card under the BARE 'fundraising_prospect:'
-- ref. That does not match either '^open:' pattern below, so this function
-- no-ops on it and nothing loops.

create or replace function app_private.sync_donor_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  donor_email text;
  prospect_ref text;
  prospect_uuid uuid;
  assignee_name text;
  donor_display text;
begin
  donor_email := lower(
    substring(coalesce(new.source_ref, '') from '^open:fundraising_donor:(.+)$'));
  prospect_ref :=
    substring(coalesce(new.source_ref, '') from '^open:fundraising_prospect:(.+)$');

  -- ── Donor tasks ────────────────────────────────────────────────
  if donor_email is not null and btrim(donor_email) <> '' then
    if tg_op = 'INSERT' and new.status = 'open' and new.assignee_id is not null then
      select coalesce(nullif(btrim(full_name), ''), email, 'a teammate')
        into assignee_name
        from public.profiles
        where id = new.assignee_id;

      assignee_name := coalesce(assignee_name, 'a teammate');

      select s.donor_name
        into donor_display
        from public.fundraising_donor_summary s
        where s.email = donor_email;

      donor_display := coalesce(
        nullif(btrim(donor_display), ''),
        nullif(btrim(regexp_replace(coalesce(new.source_label, ''), '^Donor:\s*', '')), ''));

      insert into public.fundraising_donor_profiles (email, owner_id, display_name)
      values (donor_email, new.assignee_id, donor_display)
      on conflict (email) do update
        set owner_id = excluded.owner_id,
            display_name = coalesce(
              nullif(btrim(public.fundraising_donor_profiles.display_name), ''),
              excluded.display_name)
        where public.fundraising_donor_profiles.owner_id is distinct from excluded.owner_id
           or (nullif(btrim(public.fundraising_donor_profiles.display_name), '') is null
               and excluded.display_name is not null);

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
  end if;

  -- ── Prospect tasks ─────────────────────────────────────────────
  if prospect_ref is not null and btrim(prospect_ref) <> '' then
    -- A malformed ref must not abort the caller's task insert.
    begin
      prospect_uuid := btrim(prospect_ref)::uuid;
    exception when invalid_text_representation then
      return new;
    end;

    if not exists (select 1 from public.fundraising_prospects where id = prospect_uuid) then
      return new;
    end if;

    if tg_op = 'INSERT' and new.status = 'open' and new.assignee_id is not null then
      select coalesce(nullif(btrim(full_name), ''), email, 'a teammate')
        into assignee_name
        from public.profiles
        where id = new.assignee_id;

      assignee_name := coalesce(assignee_name, 'a teammate');

      update public.fundraising_prospects
        set owner_id = new.assignee_id
        where id = prospect_uuid
          and owner_id is distinct from new.assignee_id;

      insert into public.fundraising_interactions (prospect_id, kind, body)
      values (prospect_uuid, 'status',
              'Task assigned to ' || assignee_name || ': "' || new.title || '"');

      return new;
    end if;

    if tg_op = 'UPDATE' and old.status = 'open' and new.status = 'done' then
      insert into public.fundraising_interactions (prospect_id, kind, body)
      values (prospect_uuid, 'status', 'Task completed: "' || new.title || '"');
    end if;

    return new;
  end if;

  return new;
end;
$$;

revoke all on function app_private.sync_donor_task_activity() from public;

drop trigger if exists sync_donor_task_activity on public.workspace_tasks;
create trigger sync_donor_task_activity
after insert or update of status on public.workspace_tasks
for each row execute function app_private.sync_donor_task_activity();
