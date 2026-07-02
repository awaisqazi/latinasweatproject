-- Fundraising hub module: donation history imported from Zeffy exports
-- (content-hash deduped so re-uploading a full export only adds new rows),
-- a researched prospect pipeline (foundations / grants / major donors) with
-- per-prospect engagement plans, and a contact log ("last contact") covering
-- both prospects and individual donors. Prospect ownership syncs into the
-- owner's Workspace using the same hardened pattern as board projects.

-- ── Module key ──────────────────────────────────────────────────

alter table public.profile_modules drop constraint profile_modules_module_check;
alter table public.profile_modules add constraint profile_modules_module_check check (
  module = any (array[
    'marketing', 'board_projects', 'volunteers', 'subs', 'events',
    'elections', 'gala', 'users', 'spaces', 'fundraising'
  ])
);

-- ── Imports + donations ─────────────────────────────────────────

create table if not exists public.fundraising_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  total_rows integer not null default 0,
  inserted_rows integer not null default 0,
  skipped_rows integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.fundraising_donations (
  id uuid primary key default gen_random_uuid(),
  -- Stable content hash of the source row (plus an occurrence index for
  -- genuinely identical rows) so full-export re-uploads are idempotent.
  import_hash text not null unique,
  email text,
  first_name text,
  last_name text,
  company_name text,
  phone text,
  address text,
  city text,
  state text,
  postal_code text,
  country text,
  payment_date date,
  payment_time text,
  total_amount numeric(12,2) not null default 0,
  item_amount numeric(12,2),
  eligible_amount numeric(12,2),
  refund_amount numeric(12,2) not null default 0,
  payment_method text,
  payment_status text,
  campaign_title text,
  campaign_link text,
  rate_title text,
  ticket_number text,
  fund text,
  note text,
  in_honor_of text,
  extra jsonb,
  import_id uuid references public.fundraising_imports(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists fundraising_donations_email_idx
  on public.fundraising_donations (lower(email));
create index if not exists fundraising_donations_date_idx
  on public.fundraising_donations (payment_date desc);
create index if not exists fundraising_donations_campaign_idx
  on public.fundraising_donations (campaign_title);
create index if not exists fundraising_donations_import_idx
  on public.fundraising_donations (import_id);

-- ── Prospects (foundations, grants, corporate, major donors) ────

create table if not exists public.fundraising_prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  kind text not null default 'foundation' check (
    kind in ('foundation', 'corporate', 'government', 'individual', 'other')
  ),
  stage text not null default 'Research' check (
    stage in ('Research', 'Outreach', 'In Conversation', 'Application',
              'Committed', 'Stewardship', 'Declined')
  ),
  fit_score text check (fit_score in ('high', 'medium', 'low')),
  priority text not null default 'P2' check (priority in ('P0', 'P1', 'P2')),
  website text,
  focus_areas text[],
  geography text,
  typical_grant_range text,
  annual_giving text,
  application_process text,
  deadlines text,
  contact_info text,
  key_people text,
  recent_relevant_giving text,
  fit_rationale text,
  suggested_ask text,
  research_notes text,
  -- [{step, detail, done, done_at}]: the tailored engagement checklist.
  engagement_plan jsonb not null default '[]'::jsonb,
  owner_id uuid references public.profiles(id) on delete set null,
  next_action text,
  next_action_date date,
  last_contact_at timestamptz,
  source text not null default 'manual',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fundraising_prospects_stage_idx
  on public.fundraising_prospects (stage, priority);
create index if not exists fundraising_prospects_owner_idx
  on public.fundraising_prospects (owner_id);

drop trigger if exists set_fundraising_prospects_updated_at on public.fundraising_prospects;
create trigger set_fundraising_prospects_updated_at
before update on public.fundraising_prospects
for each row execute function public.set_updated_at();

-- ── Contact log (prospects AND individual donors) ───────────────

create table if not exists public.fundraising_interactions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.fundraising_prospects(id) on delete cascade,
  donor_email text,
  kind text not null default 'note' check (
    kind in ('note', 'email', 'call', 'meeting', 'event', 'ask', 'thanks')
  ),
  body text not null check (char_length(btrim(body)) > 0),
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  author_name text,
  created_at timestamptz not null default now(),
  check (prospect_id is not null or donor_email is not null)
);

create index if not exists fundraising_interactions_prospect_idx
  on public.fundraising_interactions (prospect_id, occurred_at desc);
create index if not exists fundraising_interactions_donor_idx
  on public.fundraising_interactions (lower(donor_email), occurred_at desc);

-- Stamp the author name + roll the prospect's last_contact_at forward.
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

  if new.prospect_id is not null then
    update public.fundraising_prospects
      set last_contact_at = greatest(coalesce(last_contact_at, new.occurred_at), new.occurred_at)
      where id = new.prospect_id;
  end if;

  return new;
end;
$$;

revoke all on function app_private.on_fundraising_interaction() from public;

drop trigger if exists on_fundraising_interaction on public.fundraising_interactions;
create trigger on_fundraising_interaction
before insert on public.fundraising_interactions
for each row execute function app_private.on_fundraising_interaction();

-- ── Rollup views (security_invoker: RLS of the caller applies) ──

create or replace view public.fundraising_donor_summary
with (security_invoker = on) as
select
  lower(email) as email,
  (array_remove(array_agg(
    nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
    order by payment_date desc nulls last), null))[1] as donor_name,
  (array_remove(array_agg(nullif(btrim(company_name), '')
    order by payment_date desc nulls last), null))[1] as company_name,
  (array_remove(array_agg(nullif(btrim(phone), '')
    order by payment_date desc nulls last), null))[1] as phone,
  sum(total_amount - refund_amount)
    filter (where payment_status = 'Succeeded') as total_given,
  count(*) filter (where payment_status = 'Succeeded' and total_amount > 0) as gift_count,
  min(payment_date) filter (where payment_status = 'Succeeded' and total_amount > 0) as first_gift_date,
  max(payment_date) filter (where payment_status = 'Succeeded' and total_amount > 0) as last_gift_date,
  max(payment_date) as last_activity_date,
  count(distinct campaign_title) as campaign_count,
  count(*) as row_count
from public.fundraising_donations
where email is not null and btrim(email) <> ''
group by lower(email);

create or replace view public.fundraising_campaign_summary
with (security_invoker = on) as
select
  campaign_title,
  sum(total_amount - refund_amount)
    filter (where payment_status = 'Succeeded') as total_raised,
  count(*) filter (where payment_status = 'Succeeded' and total_amount > 0) as gift_count,
  count(distinct lower(email))
    filter (where payment_status = 'Succeeded') as participant_count,
  min(payment_date) as first_date,
  max(payment_date) as last_date
from public.fundraising_donations
group by campaign_title;

-- ── Grants + RLS ────────────────────────────────────────────────

alter table public.fundraising_imports enable row level security;
alter table public.fundraising_donations enable row level security;
alter table public.fundraising_prospects enable row level security;
alter table public.fundraising_interactions enable row level security;

revoke all on table public.fundraising_imports from anon;
revoke all on table public.fundraising_donations from anon;
revoke all on table public.fundraising_prospects from anon;
revoke all on table public.fundraising_interactions from anon;
revoke all on table public.fundraising_donor_summary from anon;
revoke all on table public.fundraising_campaign_summary from anon;

grant select, insert on table public.fundraising_imports to authenticated;
grant select, insert, delete on table public.fundraising_donations to authenticated;
grant select, insert, update, delete on table public.fundraising_prospects to authenticated;
grant select, insert, delete on table public.fundraising_interactions to authenticated;
grant select on table public.fundraising_donor_summary to authenticated;
grant select on table public.fundraising_campaign_summary to authenticated;

grant all on table public.fundraising_imports to service_role;
grant all on table public.fundraising_donations to service_role;
grant all on table public.fundraising_prospects to service_role;
grant all on table public.fundraising_interactions to service_role;
grant select on table public.fundraising_donor_summary to service_role;
grant select on table public.fundraising_campaign_summary to service_role;

create policy "Fundraising module can read imports"
on public.fundraising_imports for select to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can record imports"
on public.fundraising_imports for insert to authenticated
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can read donations"
on public.fundraising_donations for select to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can insert donations"
on public.fundraising_donations for insert to authenticated
with check ((select app_private.has_module('fundraising')));

create policy "Admins can delete donations"
on public.fundraising_donations for delete to authenticated
using ((select app_private.is_admin()));

create policy "Fundraising module can read prospects"
on public.fundraising_prospects for select to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can insert prospects"
on public.fundraising_prospects for insert to authenticated
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can update prospects"
on public.fundraising_prospects for update to authenticated
using ((select app_private.has_module('fundraising')))
with check ((select app_private.has_module('fundraising')));

create policy "Admins can delete prospects"
on public.fundraising_prospects for delete to authenticated
using ((select app_private.is_admin()));

create policy "Fundraising module can read interactions"
on public.fundraising_interactions for select to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can log interactions"
on public.fundraising_interactions for insert to authenticated
with check ((select app_private.has_module('fundraising')));

create policy "Authors and admins can delete interactions"
on public.fundraising_interactions for delete to authenticated
using (created_by = (select auth.uid()) or (select app_private.is_admin()));

-- ── Workspace sync: prospect owners get an action-pending card ──
-- Mirrors the hardened board-project pattern: cards are only (re)created when
-- ownership actually changes or the prospect leaves Declined, so an owner who
-- clears the card isn't nagged by unrelated edits. Completing the card is an
-- acknowledgment; it does not change the prospect (no reverse sync).

create or replace function app_private.sync_fundraising_prospect_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  ref text := 'fundraising_prospect:' || coalesce(new.id, old.id)::text;
  should_create boolean;
begin
  if tg_op = 'DELETE' then
    delete from public.workspace_tasks where source_ref = ref and status = 'open';
    return old;
  end if;

  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    delete from public.workspace_tasks
    where source_ref = ref
      and status = 'open'
      and (new.owner_id is null or assignee_id is distinct from new.owner_id);
  end if;

  if new.stage = 'Declined' then
    update public.workspace_tasks
      set status = 'done', completed_at = now()
      where source_ref = ref and status = 'open';
  elsif new.owner_id is not null then
    if exists (
      select 1 from public.workspace_tasks
      where source_ref = ref and status = 'open' and assignee_id = new.owner_id
    ) then
      update public.workspace_tasks
        set title = 'Lead fundraising prospect: ' || new.name,
            due_date = new.next_action_date
        where source_ref = ref and status = 'open' and assignee_id = new.owner_id;
    else
      if tg_op = 'INSERT' then
        should_create := true;
      else
        should_create :=
          new.owner_id is distinct from old.owner_id
          or (old.stage = 'Declined' and new.stage <> 'Declined');
      end if;

      if should_create then
        insert into public.workspace_tasks
          (title, note, assignee_id, assigned_by, due_date, priority, status,
           source_module, source_label, source_link, source_ref)
        values
          ('Lead fundraising prospect: ' || new.name,
           'You own this fundraising prospect. Work the engagement plan in the Fundraising hub.',
           new.owner_id,
           auth.uid(),
           new.next_action_date,
           coalesce(new.priority, 'P2'),
           'open',
           'fundraising',
           'Fundraising prospect',
           '#fundraising',
           ref);
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.sync_fundraising_prospect_workspace() from public;

drop trigger if exists sync_fundraising_prospect_workspace on public.fundraising_prospects;
create trigger sync_fundraising_prospect_workspace
after insert or update or delete on public.fundraising_prospects
for each row execute function app_private.sync_fundraising_prospect_workspace();

-- ── Realtime ────────────────────────────────────────────────────
-- Prospects + interactions are collaborative and low-volume. Donations are
-- deliberately NOT published: a full-export import inserts thousands of rows
-- and would blast every subscriber with events.

do $$
declare
  t text;
begin
  foreach t in array array['fundraising_prospects', 'fundraising_interactions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
