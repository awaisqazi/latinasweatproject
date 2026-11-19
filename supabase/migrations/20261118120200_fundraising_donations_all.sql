-- Donor CRM reads live money: legacy Zeffy export before a cutover date,
-- the Zeffy mirror from it on. Legacy data is not touched.
--
-- public.fundraising_donations_all (security_invoker): one row per legacy
-- line item dated before the cutover, UNION ALL one row per counted mirror
-- payment (same filter as public.zeffy_gifts: succeeded, not deleted, net
-- above zero, charged above zero) whose America/Chicago date is on or after
-- the cutover.
--
-- Cutover: 2026-06-25. Day-level check on 2026-11-18, legacy
-- (total_amount - refund_amount, succeeded) against the mirror by Chicago
-- date: every day from 2025-07-18 to 2026-06-24 with money matches to the
-- cent and gift count (days where legacy has only $0 free-registration rows
-- have no mirror gift, as expected). On 2026-06-25, the last day of the
-- export, legacy has 16 rows, all $0; the mirror has 2 paid gifts ($30, at
-- 9:01 pm and 10:28 pm Chicago) made after the export was taken. So legacy is
-- exact before 2026-06-25 and the mirror is complete from it. Legacy rows on
-- or after the cutover stay excluded, so a later xlsx re-import cannot double
-- count anything.
--
-- What mirror rows lose: free ($0) registrations are not in zeffy_gifts, so
-- after the cutover they no longer add to row_count / last_activity_date /
-- campaign_count. Address, ticket number, answers, note and tribute fields are
-- left null (not on the payment in a comparable form).
--
-- fundraising_donor_summary and fundraising_campaign_summary keep their exact
-- columns and types; only their source changes. Rollback: the previous
-- definitions are in 20260702010000_fundraising_module.sql (from
-- public.fundraising_donations) and docs/fundraising-live/01-backend-contract.md.

create or replace view public.fundraising_donations_all
with (security_invoker = on) as
select
  d.id::text as id,
  'import'::text as source,
  d.email,
  d.first_name,
  d.last_name,
  d.company_name,
  d.phone,
  d.payment_date,
  d.payment_time,
  d.total_amount,
  d.refund_amount,
  d.payment_status,
  d.payment_method,
  d.campaign_title,
  d.campaign_link,
  d.rate_title,
  d.fund,
  d.note,
  d.in_honor_of
from public.fundraising_donations d
where d.payment_date < date '2026-06-25'
union all
select
  p.id,
  'zeffy'::text,
  p.buyer_email,
  p.buyer_first_name,
  p.buyer_last_name,
  coalesce(nullif(btrim(p.raw->'buyer'->>'company_name'), ''), ct.company_name),
  ct.phone,
  (p.created_at at time zone 'America/Chicago')::date,
  to_char(p.created_at at time zone 'America/Chicago', 'FMHH12:MI AM'),
  round(p.amount_cents / 100.0, 2)::numeric(12,2),
  round(p.refunded_cents / 100.0, 2)::numeric(12,2),
  'Succeeded'::text,
  case p.raw->'payment_method'->>'type'
    when 'card' then 'Card'
    when 'applePayOrGooglePay' then 'Apple Pay / Google Pay'
    when 'tapToPay' then 'Tap-to-pay'
    when 'ach' then 'ACH Direct debit'
    when 'free' then 'Free'
    else p.raw->'payment_method'->>'type'
  end,
  coalesce(c.title, pc.title),
  coalesce(c.url, pc.url),
  (select string_agg(distinct i->>'rate_title', ', ')
     from jsonb_array_elements(p.items) i
     where nullif(btrim(i->>'rate_title'), '') is not null),
  case when jsonb_typeof(p.raw->'fund') = 'string' then p.raw->>'fund' end,
  null::text,
  null::text
from public.zeffy_payments p
left join public.zeffy_campaigns c on c.id = p.campaign_id
left join public.zeffy_campaigns pc on pc.id = p.parent_campaign_id
left join lateral (
  select z.phone, z.company_name
  from public.zeffy_contacts z
  where p.buyer_email is not null and z.email = p.buyer_email and z.deleted_at is null
  order by z.zeffy_updated_at desc nulls last
  limit 1
) ct on true
where p.status = 'succeeded'
  and p.deleted_at is null
  and p.net_cents > 0
  and p.charged_cents > 0
  and p.created_at is not null
  and (p.created_at at time zone 'America/Chicago')::date >= date '2026-06-25';

revoke all on table public.fundraising_donations_all from anon, authenticated;
grant select on table public.fundraising_donations_all to authenticated;
grant select on table public.fundraising_donations_all to service_role;

create index if not exists zeffy_contacts_email_plain_idx on public.zeffy_contacts (email);

-- Same columns, order and types as 20260702010000; source switched.
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
from public.fundraising_donations_all
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
from public.fundraising_donations_all
group by campaign_title;
