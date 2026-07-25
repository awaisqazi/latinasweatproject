-- Assigning a donor in an outreach campaign queue now also makes that person
-- the donor's relationship owner, and logs the assignment in the donor's
-- contact log. This mirrors the donor-task behaviour added in
-- 20260724120000 / 20260724130000, with one deliberate difference: outreach
-- assignment ALWAYS takes ownership, overwriting an existing owner even if it
-- was hand-picked. The most recent outreach assignment wins.
--
-- Unassigning (assignee_id set to null) deliberately does nothing: clearing a
-- queue slot is not a statement about who owns the relationship, and silently
-- dropping the owner would lose information.
--
-- display_name follows the same rule as the task trigger: sourced from
-- fundraising_donor_summary.donor_name, falling back here to the item's own
-- donor_name column, and never overwriting a non-blank existing snapshot.
--
-- Re-entrancy: the profile upsert fires app_private.sync_fundraising_donor_workspace,
-- which creates/retitles the assignee's "Steward donor" card (expected). That
-- card carries the bare `fundraising_donor:` source_ref, which does not match
-- the `^open:` pattern in sync_donor_task_activity, so nothing loops back here.
-- Outreach items already have their own rollup trigger
-- (sync_fundraising_outreach_workspace); this trigger is purely additive and
-- writes to different tables, so the two do not interfere.

create or replace function app_private.sync_outreach_assignment_owner()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  donor_email text;
  assignee_name text;
  campaign_name text;
  donor_display text;
begin
  if new.assignee_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.assignee_id is not distinct from new.assignee_id then
    return new;
  end if;

  donor_email := lower(btrim(coalesce(new.donor_email, '')));
  if donor_email = '' then
    return new;
  end if;

  select coalesce(nullif(btrim(full_name), ''), email, 'a teammate')
    into assignee_name
    from public.profiles
    where id = new.assignee_id;

  assignee_name := coalesce(assignee_name, 'a teammate');

  select c.name into campaign_name
    from public.fundraising_outreach_campaigns c
    where c.id = new.campaign_id;

  campaign_name := coalesce(nullif(btrim(campaign_name), ''), 'unnamed campaign');

  select s.donor_name
    into donor_display
    from public.fundraising_donor_summary s
    where s.email = donor_email;

  donor_display := coalesce(
    nullif(btrim(donor_display), ''),
    nullif(btrim(coalesce(new.donor_name, '')), ''));

  -- owner_id is overwritten unconditionally; the WHERE only skips a write
  -- that would change nothing, to avoid churning the steward-card sync.
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
          'Outreach assigned to ' || assignee_name || ' (campaign: ' || campaign_name || ')');

  return new;
end;
$$;

revoke all on function app_private.sync_outreach_assignment_owner() from public;

drop trigger if exists sync_outreach_assignment_owner on public.fundraising_outreach_items;
create trigger sync_outreach_assignment_owner
after insert or update of assignee_id on public.fundraising_outreach_items
for each row execute function app_private.sync_outreach_assignment_owner();
