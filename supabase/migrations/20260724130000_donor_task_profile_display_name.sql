-- Fixup for 20260724120000: when a donor task creates or claims a donor
-- profile, also fill the display_name snapshot. Without it the profile row is
-- created with display_name null, and the steward card that the donor sync
-- trigger builds falls back to titling itself with the bare email address
-- ("Steward donor: vjaimes308@yahoo.com" instead of "Steward donor: Vanessa
-- Jaimes").
--
-- Name source: public.fundraising_donor_summary.donor_name, the same rollup
-- the donor drawer displays, so the card matches what staff see in the UI.
-- The view aggregates fundraising_donations (a few thousand rows) grouped by
-- lower(email), and the lookup is a single equality on that grouping key, so
-- it costs one cheap scan on a manual, low-frequency action. If the donor has
-- no donations yet the view returns nothing, so we fall back to the task's
-- own source_label, which the donor drawer sets to 'Donor: <name>'.
--
-- An existing non-blank display_name is never overwritten: the snapshot may
-- have been corrected by hand, and a donations-derived name should not clobber
-- that.

create or replace function app_private.sync_donor_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  donor_email text;
  assignee_name text;
  donor_display text;
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

    select s.donor_name
      into donor_display
      from public.fundraising_donor_summary s
      where s.email = donor_email;

    donor_display := coalesce(
      nullif(btrim(donor_display), ''),
      nullif(btrim(regexp_replace(coalesce(new.source_label, ''), '^Donor:\s*', '')), ''));

    -- The WHERE keeps a re-assignment to the same owner from churning the
    -- steward-card sync trigger, but still lets a missing display_name get
    -- filled in when we have a name to offer.
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
end;
$$;

revoke all on function app_private.sync_donor_task_activity() from public;
