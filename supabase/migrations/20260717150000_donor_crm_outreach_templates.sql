-- Donor relationship layer for the fundraising module:
--   1. fundraising_donor_profiles  — durable per-donor CRM record (relationship
--      owner + the "Questions for Outreach" fields) layered over the read-only
--      fundraising_donor_summary rollups.
--   2. fundraising_outreach_campaigns / fundraising_outreach_items — shared
--      call lists (e.g. gala invites) with per-donor status and assignees.
--   3. fundraising_templates — the LSP Templates & Master CRM library, editable
--      in the dashboard.
-- Workspace cards mirror the hardened prospect pattern: completing a card is an
-- acknowledgment, and unrelated edits never resurrect a cleared card.

-- ── Donor profiles ──────────────────────────────────────────────

create table if not exists public.fundraising_donor_profiles (
  email text primary key check (email = lower(btrim(email)) and email <> ''),
  -- Snapshot of the donor's display name so DB triggers can title workspace
  -- cards without re-aggregating donations.
  display_name text,
  owner_id uuid references public.profiles(id) on delete set null,
  next_action text,
  next_action_date date,
  preferred_contact_method text check (
    preferred_contact_method in ('email', 'phone', 'text', 'in_person', 'social')),
  areas_of_interest text,
  capacity_estimate text check (capacity_estimate in ('small', 'medium', 'major')),
  warm_intro_source text,
  board_connection text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fundraising_donor_profiles_owner_idx
  on public.fundraising_donor_profiles (owner_id);

drop trigger if exists set_fundraising_donor_profiles_updated_at
  on public.fundraising_donor_profiles;
create trigger set_fundraising_donor_profiles_updated_at
before update on public.fundraising_donor_profiles
for each row execute function public.set_updated_at();

-- ── Outreach campaigns + items ──────────────────────────────────

create table if not exists public.fundraising_outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  description text,
  due_date date,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_fundraising_outreach_campaigns_updated_at
  on public.fundraising_outreach_campaigns;
create trigger set_fundraising_outreach_campaigns_updated_at
before update on public.fundraising_outreach_campaigns
for each row execute function public.set_updated_at();

create table if not exists public.fundraising_outreach_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    references public.fundraising_outreach_campaigns(id) on delete cascade,
  donor_email text not null check (donor_email = lower(btrim(donor_email)) and donor_email <> ''),
  -- Snapshot label so lists render without joining the donations rollup.
  donor_name text,
  assignee_id uuid references public.profiles(id) on delete set null,
  status text not null default 'to_contact' check (
    status in ('to_contact', 'contacted', 'no_response', 'attending', 'declined')),
  status_changed_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, donor_email)
);

create index if not exists fundraising_outreach_items_campaign_idx
  on public.fundraising_outreach_items (campaign_id, status);
create index if not exists fundraising_outreach_items_assignee_idx
  on public.fundraising_outreach_items (assignee_id);

drop trigger if exists set_fundraising_outreach_items_updated_at
  on public.fundraising_outreach_items;
create trigger set_fundraising_outreach_items_updated_at
before update on public.fundraising_outreach_items
for each row execute function public.set_updated_at();

create or replace function app_private.touch_outreach_item_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at = now();
  end if;
  return new;
end;
$$;

revoke all on function app_private.touch_outreach_item_status() from public;

drop trigger if exists touch_outreach_item_status on public.fundraising_outreach_items;
create trigger touch_outreach_item_status
before update on public.fundraising_outreach_items
for each row execute function app_private.touch_outreach_item_status();

-- ── Template library ────────────────────────────────────────────

create table if not exists public.fundraising_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null check (char_length(btrim(category)) > 0),
  title text not null check (char_length(btrim(title)) > 0),
  kind text not null default 'email' check (kind in ('email', 'reference')),
  subject text,
  body text not null check (char_length(btrim(body)) > 0),
  sort_order integer not null default 100,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets the seed migration stay idempotent without a surrogate natural key.
  unique (category, title)
);

drop trigger if exists set_fundraising_templates_updated_at
  on public.fundraising_templates;
create trigger set_fundraising_templates_updated_at
before update on public.fundraising_templates
for each row execute function public.set_updated_at();

-- ── Workspace sync: donor relationship owners ───────────────────
-- Mirrors sync_fundraising_prospect_workspace: the owner gets one open card
-- per donor; plain edits refresh the card in place, and a card the owner has
-- cleared is only re-created when ownership actually changes.

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
begin
  if tg_op = 'DELETE' then
    delete from public.workspace_tasks where source_ref = ref and status = 'open';
    return old;
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
        should_create := new.owner_id is distinct from old.owner_id;
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

drop trigger if exists sync_fundraising_donor_workspace on public.fundraising_donor_profiles;
create trigger sync_fundraising_donor_workspace
after insert or update or delete on public.fundraising_donor_profiles
for each row execute function app_private.sync_fundraising_donor_workspace();

-- ── Workspace sync: outreach rollup cards ───────────────────────
-- One card per (campaign, assignee) — "3 of 12 contacts handled" — instead of
-- one card per donor, so a 50-donor call list doesn't flood the Workspace.
-- p_bump marks changes that hand the assignee NEW work (fresh items or an item
-- flipped back to to_contact); only those may reopen or re-create a card the
-- assignee already cleared.

create or replace function app_private.recalc_outreach_workspace(
  p_campaign uuid, p_assignee uuid, p_bump boolean
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  camp record;
  ref text;
  total integer;
  remaining integer;
  card_title text;
  card_note text;
begin
  if p_campaign is null or p_assignee is null then
    return;
  end if;

  ref := 'fundraising_outreach:' || p_campaign::text || ':' || p_assignee::text;

  select id, name, due_date, status into camp
  from public.fundraising_outreach_campaigns
  where id = p_campaign;

  -- Campaign deleted: open cards are noise, drop them.
  if camp.id is null then
    delete from public.workspace_tasks where source_ref = ref and status = 'open';
    return;
  end if;

  -- Archived: close cards but keep the history trace.
  if camp.status = 'archived' then
    update public.workspace_tasks
      set status = 'done', completed_at = now()
      where source_ref = ref and status = 'open';
    return;
  end if;

  select count(*), count(*) filter (where status = 'to_contact')
    into total, remaining
  from public.fundraising_outreach_items
  where campaign_id = p_campaign and assignee_id = p_assignee;

  if total = 0 then
    delete from public.workspace_tasks where source_ref = ref and status = 'open';
    return;
  end if;

  card_title := 'Outreach: ' || camp.name;
  card_note := (total - remaining)::text || ' of ' || total::text
    || ' contacts handled. Work your queue in the Fundraising hub.';

  if remaining = 0 then
    update public.workspace_tasks
      set status = 'done', completed_at = now(), note = card_note
      where source_ref = ref and status = 'open';
    return;
  end if;

  update public.workspace_tasks
    set title = card_title, note = card_note, due_date = camp.due_date
    where source_ref = ref and status = 'open';

  if not found and p_bump then
    -- Reopen the assignee's most recent cleared card rather than stacking a
    -- duplicate; create one only if none has ever existed.
    update public.workspace_tasks
      set status = 'open', completed_at = null,
          title = card_title, note = card_note, due_date = camp.due_date
      where id = (
        select id from public.workspace_tasks
        where source_ref = ref and assignee_id = p_assignee
        order by created_at desc
        limit 1
      );

    if not found then
      insert into public.workspace_tasks
        (title, note, assignee_id, assigned_by, due_date, priority, status,
         source_module, source_label, source_link, source_ref)
      values
        (card_title, card_note, p_assignee, coalesce(auth.uid(), p_assignee),
         camp.due_date, 'P2', 'open', 'fundraising', 'Donor outreach',
         '#fundraising', ref);
    end if;
  end if;
end;
$$;

revoke all on function app_private.recalc_outreach_workspace(uuid, uuid, boolean) from public;

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

  if old.assignee_id is distinct from new.assignee_id then
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

drop trigger if exists sync_fundraising_outreach_workspace on public.fundraising_outreach_items;
create trigger sync_fundraising_outreach_workspace
after insert or update or delete on public.fundraising_outreach_items
for each row execute function app_private.sync_fundraising_outreach_workspace();

-- Campaign edits (rename, due date, archive/unarchive) refresh every
-- assignee's card.
create or replace function app_private.sync_fundraising_outreach_campaign_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  member uuid;
begin
  for member in
    select distinct assignee_id
    from public.fundraising_outreach_items
    where campaign_id = new.id and assignee_id is not null
  loop
    perform app_private.recalc_outreach_workspace(
      new.id, member,
      old.status = 'archived' and new.status = 'active');
  end loop;
  return new;
end;
$$;

revoke all on function app_private.sync_fundraising_outreach_campaign_workspace() from public;

drop trigger if exists sync_fundraising_outreach_campaign_workspace
  on public.fundraising_outreach_campaigns;
create trigger sync_fundraising_outreach_campaign_workspace
after update on public.fundraising_outreach_campaigns
for each row execute function app_private.sync_fundraising_outreach_campaign_workspace();

-- ── Grants + RLS ────────────────────────────────────────────────

alter table public.fundraising_donor_profiles enable row level security;
alter table public.fundraising_outreach_campaigns enable row level security;
alter table public.fundraising_outreach_items enable row level security;
alter table public.fundraising_templates enable row level security;

revoke all on table public.fundraising_donor_profiles from anon;
revoke all on table public.fundraising_outreach_campaigns from anon;
revoke all on table public.fundraising_outreach_items from anon;
revoke all on table public.fundraising_templates from anon;

-- Tighten the Supabase default ALL grant to exactly what the UI needs.
revoke all on table public.fundraising_donor_profiles from authenticated;
revoke all on table public.fundraising_outreach_campaigns from authenticated;
revoke all on table public.fundraising_outreach_items from authenticated;
revoke all on table public.fundraising_templates from authenticated;

grant select, insert, update on table public.fundraising_donor_profiles to authenticated;
grant select, insert, update, delete on table public.fundraising_outreach_campaigns to authenticated;
grant select, insert, update, delete on table public.fundraising_outreach_items to authenticated;
grant select, insert, update, delete on table public.fundraising_templates to authenticated;

grant all on table public.fundraising_donor_profiles to service_role;
grant all on table public.fundraising_outreach_campaigns to service_role;
grant all on table public.fundraising_outreach_items to service_role;
grant all on table public.fundraising_templates to service_role;

create policy "Fundraising module can read donor profiles"
on public.fundraising_donor_profiles for select to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can insert donor profiles"
on public.fundraising_donor_profiles for insert to authenticated
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can update donor profiles"
on public.fundraising_donor_profiles for update to authenticated
using ((select app_private.has_module('fundraising')))
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can read outreach campaigns"
on public.fundraising_outreach_campaigns for select to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can insert outreach campaigns"
on public.fundraising_outreach_campaigns for insert to authenticated
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can update outreach campaigns"
on public.fundraising_outreach_campaigns for update to authenticated
using ((select app_private.has_module('fundraising')))
with check ((select app_private.has_module('fundraising')));

create policy "Admins can delete outreach campaigns"
on public.fundraising_outreach_campaigns for delete to authenticated
using ((select app_private.is_admin()));

create policy "Fundraising module can read outreach items"
on public.fundraising_outreach_items for select to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can insert outreach items"
on public.fundraising_outreach_items for insert to authenticated
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can update outreach items"
on public.fundraising_outreach_items for update to authenticated
using ((select app_private.has_module('fundraising')))
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can remove outreach items"
on public.fundraising_outreach_items for delete to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can read templates"
on public.fundraising_templates for select to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can add templates"
on public.fundraising_templates for insert to authenticated
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can edit templates"
on public.fundraising_templates for update to authenticated
using ((select app_private.has_module('fundraising')))
with check ((select app_private.has_module('fundraising')));

create policy "Admins can delete templates"
on public.fundraising_templates for delete to authenticated
using ((select app_private.is_admin()));

-- ── Realtime ────────────────────────────────────────────────────
-- All four tables are collaborative and low-volume (unlike donations).

do $$
declare
  t text;
begin
  foreach t in array array[
    'fundraising_donor_profiles',
    'fundraising_outreach_campaigns',
    'fundraising_outreach_items',
    'fundraising_templates'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
