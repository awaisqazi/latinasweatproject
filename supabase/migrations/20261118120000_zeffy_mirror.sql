-- Live fundraising view: a mirror of every Zeffy campaign, payment and contact.
--
-- Filled by the zeffy-webhook edge function (service role):
--   ?mode=reconcile  (pg_cron, every 5 min) upserts every payment it lists and
--                    refreshes campaigns;
--   ?mode=backfill   resumable full payment history (cursor in zeffy_sync_state);
--   ?mode=contacts   resumable contact sync;
--   webhook          payment.* and contact.* events keep rows current.
--
-- Read by public.fundraising_live(p_tz) (migration 20261118120100).
--
-- Money is integer cents. amount_cents is the gift without the optional Zeffy
-- tip, computed exactly like giving_payments.amount_cents (giftCents in
-- supabase/functions/zeffy-webhook/logic.ts); refunded_cents likewise.
-- A gift counts when status = 'succeeded' and deleted_at is null; its value is
-- net_cents.
--
-- Donor data: readable only by dashboard users with the fundraising module,
-- writable only by the service role. Additive only: nothing existing changes
-- except one new nullable column on giving_webhook_events.

-- ── Campaigns ───────────────────────────────────────────────────

create table if not exists public.zeffy_campaigns (
  id text primary key,
  title text,
  url text,
  category text,
  type text,
  status text,
  goal_cents bigint,
  volume_cents bigint,
  parent_campaign_id text,
  is_archived boolean,
  start_date timestamptz,
  end_date timestamptz,
  zeffy_created_at timestamptz,
  zeffy_updated_at timestamptz,
  zeffy_deleted_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists zeffy_campaigns_status_idx on public.zeffy_campaigns (status);

-- ── Payments ────────────────────────────────────────────────────

create table if not exists public.zeffy_payments (
  id text primary key,
  created_at timestamptz,
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  net_cents bigint generated always as (greatest(amount_cents - refunded_cents, 0)) stored,
  -- What Zeffy charged (payment.amount), kept for reconciliation only.
  charged_cents bigint not null default 0,
  status text not null default 'unknown',
  refund_status text not null default 'none',
  campaign_id text,
  parent_campaign_id text,
  campaign_category text,
  team_id text,
  campaign_type text,
  payment_type text,
  -- Zeffy contact id of the buyer (payment.contact).
  contact_id text,
  buyer_email text,
  buyer_first_name text,
  buyer_last_name text,
  items jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  synced_at timestamptz not null default now(),
  check (buyer_email is null or buyer_email = lower(buyer_email))
);

create index if not exists zeffy_payments_created_idx on public.zeffy_payments (created_at desc);
create index if not exists zeffy_payments_email_idx on public.zeffy_payments (lower(buyer_email));
create index if not exists zeffy_payments_campaign_idx on public.zeffy_payments (campaign_id);
create index if not exists zeffy_payments_parent_campaign_idx on public.zeffy_payments (parent_campaign_id);
create index if not exists zeffy_payments_contact_idx on public.zeffy_payments (contact_id);

-- ── Contacts ────────────────────────────────────────────────────

create table if not exists public.zeffy_contacts (
  id text primary key,
  email text,
  first_name text,
  last_name text,
  phone text,
  company_name text,
  donor_type text,
  -- Zeffy's own lifetime figures for the contact (cents, as Zeffy reports them).
  total_contribution_cents bigint,
  donation_count integer,
  first_donation_at timestamptz,
  last_donation_at timestamptz,
  zeffy_created_at timestamptz,
  zeffy_updated_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  synced_at timestamptz not null default now(),
  check (email is null or email = lower(email))
);

create index if not exists zeffy_contacts_email_idx on public.zeffy_contacts (lower(email));

-- ── Sync state (one row per job) ────────────────────────────────

create table if not exists public.zeffy_sync_state (
  key text primary key,
  cursor text,
  done boolean not null default false,
  counters jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  last_run_at timestamptz,
  last_result jsonb
);

-- ── Webhook log: what the mirror did with each event ────────────
-- Null on a payment event means the mirror step did not run or failed (the
-- 5-minute reconcile repairs it). Giving outcomes stay in `outcome`.

alter table public.giving_webhook_events add column if not exists mirror_outcome text;

-- ── Grants + RLS ────────────────────────────────────────────────

alter table public.zeffy_campaigns enable row level security;
alter table public.zeffy_payments enable row level security;
alter table public.zeffy_contacts enable row level security;
alter table public.zeffy_sync_state enable row level security;

revoke all on table public.zeffy_campaigns from anon, authenticated;
revoke all on table public.zeffy_payments from anon, authenticated;
revoke all on table public.zeffy_contacts from anon, authenticated;
revoke all on table public.zeffy_sync_state from anon, authenticated;

grant select on table public.zeffy_campaigns to authenticated;
grant select on table public.zeffy_payments to authenticated;
grant select on table public.zeffy_contacts to authenticated;
grant select on table public.zeffy_sync_state to authenticated;

grant all on table public.zeffy_campaigns to service_role;
grant all on table public.zeffy_payments to service_role;
grant all on table public.zeffy_contacts to service_role;
grant all on table public.zeffy_sync_state to service_role;

drop policy if exists "Fundraising module can read zeffy campaigns" on public.zeffy_campaigns;
create policy "Fundraising module can read zeffy campaigns"
on public.zeffy_campaigns for select to authenticated
using ((select app_private.has_module('fundraising')));

drop policy if exists "Fundraising module can read zeffy payments" on public.zeffy_payments;
create policy "Fundraising module can read zeffy payments"
on public.zeffy_payments for select to authenticated
using ((select app_private.has_module('fundraising')));

drop policy if exists "Fundraising module can read zeffy contacts" on public.zeffy_contacts;
create policy "Fundraising module can read zeffy contacts"
on public.zeffy_contacts for select to authenticated
using ((select app_private.has_module('fundraising')));

drop policy if exists "Fundraising module can read zeffy sync state" on public.zeffy_sync_state;
create policy "Fundraising module can read zeffy sync state"
on public.zeffy_sync_state for select to authenticated
using ((select app_private.has_module('fundraising')));

-- ── Realtime: the dashboard live-updates on new payments ────────
-- postgres_changes events are RLS-filtered per subscriber.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'zeffy_payments'
  ) then
    alter publication supabase_realtime add table public.zeffy_payments;
  end if;
end $$;
