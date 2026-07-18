-- 1. Prospect action log: stage moves, owner changes, and completed
--    engagement-plan steps are logged automatically into the prospect's
--    contact log as kind 'status' (visible in ProspectDrawer alongside manual
--    notes). Status entries do NOT bump last_contact_at: a pipeline edit is
--    not donor contact.
-- 2. Seeds the "Sweat Fest call to action" email template used by the donor
--    task preset.

alter table public.fundraising_interactions
  drop constraint if exists fundraising_interactions_kind_check;
alter table public.fundraising_interactions
  add constraint fundraising_interactions_kind_check
  check (kind in ('note', 'email', 'call', 'meeting', 'event', 'ask', 'thanks', 'status'));

-- Same author-stamping as before, but only real contact (non-status) rolls
-- the prospect's last_contact_at forward.
create or replace function app_private.on_fundraising_interaction()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  profile_record record;
begin
  if (select auth.uid()) is not null then
    new.created_by = (select auth.uid());
  end if;

  select full_name, email into profile_record
  from public.profiles
  where id = new.created_by;

  new.author_name = coalesce(
    nullif(btrim(profile_record.full_name), ''),
    profile_record.email,
    nullif(btrim(new.author_name), ''),
    'Team member'
  );

  if new.prospect_id is not null and new.kind <> 'status' then
    update public.fundraising_prospects
      set last_contact_at = greatest(coalesce(last_contact_at, new.occurred_at), new.occurred_at)
      where id = new.prospect_id;
  end if;

  return new;
end;
$$;

revoke all on function app_private.on_fundraising_interaction() from public;

create or replace function app_private.log_fundraising_prospect_activity()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  entries text[] := '{}';
  owner_label text;
  step jsonb;
  old_plan jsonb;
  entry text;
begin
  if new.stage is distinct from old.stage then
    entries := entries || ('Moved from ' || old.stage || ' to ' || new.stage || '.');
  end if;

  if new.owner_id is distinct from old.owner_id then
    if new.owner_id is null then
      entries := entries || 'Cleared the owner.'::text;
    else
      select coalesce(nullif(btrim(full_name), ''), email) into owner_label
      from public.profiles where id = new.owner_id;
      entries := entries || ('Owner set to ' || coalesce(owner_label, 'a teammate') || '.');
    end if;
  end if;

  if new.engagement_plan is distinct from old.engagement_plan
     and jsonb_typeof(new.engagement_plan) = 'array' then
    old_plan := case
      when jsonb_typeof(old.engagement_plan) = 'array' then old.engagement_plan
      else '[]'::jsonb
    end;
    for step in select value from jsonb_array_elements(new.engagement_plan) loop
      if coalesce((step ->> 'done')::boolean, false) and not exists (
        select 1 from jsonb_array_elements(old_plan) as previous(value)
        where previous.value ->> 'step' = step ->> 'step'
          and coalesce((previous.value ->> 'done')::boolean, false)
      ) then
        entries := entries
          || ('Completed engagement step: ' || coalesce(step ->> 'step', '(unnamed step)') || '.');
      end if;
    end loop;
  end if;

  foreach entry in array entries loop
    insert into public.fundraising_interactions (prospect_id, kind, body)
    values (new.id, 'status', entry);
  end loop;

  return new;
end;
$$;

revoke all on function app_private.log_fundraising_prospect_activity() from public;

drop trigger if exists log_fundraising_prospect_activity on public.fundraising_prospects;
create trigger log_fundraising_prospect_activity
after update on public.fundraising_prospects
for each row execute function app_private.log_fundraising_prospect_activity();

-- ── Sweat Fest call to action ───────────────────────────────────

insert into public.fundraising_templates (category, title, kind, subject, body, sort_order, image_urls)
values
(
  'Donor Relations', 'Sweat Fest call to action', 'email',
  $$You're invited: Sweat Fest, our first all-day movement festival · August 22$$,
  $tpl$Hi [First Name],

We're bringing something brand new to Chicago this summer, and we want you there. On Saturday, August 22, Latina Sweat Project hosts our first-ever Sweat Fest: an all-day movement festival celebrating wellness, cultura, and connection. Movement is ours.

The day runs from 7:00 AM to 9:00 PM: a sunrise 5K to start us off together, 45-minute sweat sessions with LSP instructors all day, wellbeing practices to slow down and reset, a market of local makers and community organizations, food and drink, and the closing Pachanga to dance it out with your comunidad. All paces and all bodies welcome. The location will be announced soon, and the day stays right here in Chicago.

[Add a personal line about their connection to LSP.]

As one of our supporters, you're part of why a day like this can exist. Here's how to get involved:
- Grab tickets: https://www.zeffy.com/en-US/ticketing/sweat-fest-2026-movement-is-ours
- Bring your crew: forward this to friends and family who want to move with us
- Vendor, volunteer, or sponsor: reply here or reach out at rut@latinasweatproject.com

We'd love to see you there.

Con cariño,
[Your Name]
The Latina Sweat Project$tpl$,
  17,
  array['/images/sweatfest/sweatfest-poster-v2.webp', '/images/sweatfest/sweatfest-calendar-v2.jpg']
)
on conflict (category, title) do nothing;
