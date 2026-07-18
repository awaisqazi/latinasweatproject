-- Review fixups for the fundraising workspace sync triggers:
--   1. Moving an outreach item to a different campaign now recalcs BOTH
--      campaigns' rollup cards (before, the old campaign's card went stale).
--   2. Changing a donor profile's email (its primary key) now cleans up the
--      old ref's card and re-creates one under the new ref.

create or replace function app_private.sync_fundraising_outreach_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform app_private.recalc_outreach_workspace(old.campaign_id, old.assignee_id, false);
    return old;
  end if;

  if tg_op = 'INSERT' then
    perform app_private.recalc_outreach_workspace(
      new.campaign_id, new.assignee_id, new.status = 'to_contact');
    return new;
  end if;

  if old.campaign_id is distinct from new.campaign_id
     or old.assignee_id is distinct from new.assignee_id then
    perform app_private.recalc_outreach_workspace(old.campaign_id, old.assignee_id, false);
    perform app_private.recalc_outreach_workspace(
      new.campaign_id, new.assignee_id, new.status = 'to_contact');
  else
    perform app_private.recalc_outreach_workspace(
      new.campaign_id, new.assignee_id,
      new.status = 'to_contact' and old.status <> 'to_contact');
  end if;

  return new;
end;
$$;

revoke all on function app_private.sync_fundraising_outreach_workspace() from public;

create or replace function app_private.sync_fundraising_donor_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  ref text := 'fundraising_donor:' || coalesce(new.email, old.email);
  donor_label text;
  card_note text;
  should_create boolean;
  carried_over integer := 0;
begin
  if tg_op = 'DELETE' then
    delete from public.workspace_tasks where source_ref = ref and status = 'open';
    return old;
  end if;

  -- Email is the primary key; if it changes, the old ref's card is orphaned.
  -- Only an OPEN old card carries over to the new ref; a card the owner
  -- already cleared must stay cleared (a data fix is not new work).
  if tg_op = 'UPDATE' and new.email is distinct from old.email then
    delete from public.workspace_tasks
    where source_ref = 'fundraising_donor:' || old.email and status = 'open';
    get diagnostics carried_over = row_count;
  end if;

  donor_label := coalesce(nullif(btrim(new.display_name), ''), new.email);
  card_note := coalesce(
    'Next action: ' || nullif(btrim(new.next_action), ''),
    'You own this donor relationship. Review giving history and next steps in the Fundraising hub.');

  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    delete from public.workspace_tasks
    where source_ref = ref
      and status = 'open'
      and (new.owner_id is null or assignee_id is distinct from new.owner_id);
  end if;

  if new.owner_id is not null then
    if exists (
      select 1 from public.workspace_tasks
      where source_ref = ref and status = 'open' and assignee_id = new.owner_id
    ) then
      update public.workspace_tasks
        set title = 'Steward donor: ' || donor_label,
            note = card_note,
            due_date = new.next_action_date
        where source_ref = ref and status = 'open' and assignee_id = new.owner_id;
    else
      if tg_op = 'INSERT' then
        should_create := true;
      else
        should_create :=
          new.owner_id is distinct from old.owner_id
          or carried_over > 0;
      end if;

      if should_create then
        insert into public.workspace_tasks
          (title, note, assignee_id, assigned_by, due_date, priority, status,
           source_module, source_label, source_link, source_ref)
        values
          ('Steward donor: ' || donor_label,
           card_note,
           new.owner_id,
           auth.uid(),
           new.next_action_date,
           'P2',
           'open',
           'fundraising',
           'Donor relationship',
           '#fundraising',
           ref);
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.sync_fundraising_donor_workspace() from public;
