-- Live fundraising view: read API for the admin dashboard.
--
--   public.zeffy_gifts              security_invoker view: the counted gifts
--                                   (succeeded, not deleted, net of refunds,
--                                   tip excluded, net above zero, payments
--                                   that charged nothing left out).
--   public.fundraising_live(p_tz)   jsonb snapshot for the dashboard.
--
-- Both run with the caller's rights (security invoker), so RLS applies: only
-- dashboard users with the fundraising module see anything. The RPC also checks
-- the module up front and answers {ok: false, reason: 'forbidden'} otherwise.
--
-- Donor history: the mirror (zeffy_payments) is the money source. The legacy
-- Zeffy export (fundraising_donations, per line item) is read only for dates
-- before the mirror's first payment, and for "first ever gift" checks, so no
-- gift is counted twice. Nothing here writes to or changes the legacy tables.

create or replace view public.zeffy_gifts
with (security_invoker = on) as
select
  p.id,
  p.created_at,
  p.net_cents,
  p.amount_cents,
  p.refunded_cents,
  p.buyer_email,
  p.buyer_first_name,
  p.buyer_last_name,
  p.contact_id,
  p.campaign_id,
  p.parent_campaign_id,
  coalesce(p.parent_campaign_id, p.campaign_id) as campaign_key,
  p.campaign_category,
  p.campaign_type,
  p.payment_type
from public.zeffy_payments p
where p.status = 'succeeded'
  and p.deleted_at is null
  and p.net_cents > 0
  and p.created_at is not null
  -- A payment that charged nothing (100%-discount checkout, or a manual entry
  -- with payment method "free", e.g. comped gala tickets) still lists its
  -- items at list price, so giftCents (shared with the giving sync) reports
  -- the list price. It is not money, and the legacy Zeffy export counts it as
  -- 0 too: leave it out.
  and p.charged_cents > 0;

revoke all on table public.zeffy_gifts from anon, authenticated;
grant select on table public.zeffy_gifts to authenticated;
grant select on table public.zeffy_gifts to service_role;

create or replace function public.fundraising_live(p_tz text default 'America/Chicago')
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_tz text := coalesce(nullif(btrim(p_tz), ''), 'America/Chicago');
  v_today date;
  v_month date;
  v_year date;
  v_py date;          -- prior calendar year start
  v_py_same date;     -- today, one year ago
  v_12m date;         -- last 12 months: local date after this
  v_from_ts timestamptz;
  v_history_from timestamptz;
  v_legacy_cut date;
  v_totals jsonb;
  v_monthly jsonb;
  v_campaigns jsonb;
  v_categories jsonb;
  v_donors jsonb;
  v_recent jsonb;
  v_lapsed jsonb;
  v_top jsonb;
  v_sync jsonb;
begin
  if not coalesce((select app_private.has_module('fundraising')), false) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  begin
    perform now() at time zone v_tz;
  exception when others then
    v_tz := 'America/Chicago';
  end;

  v_today := (now() at time zone v_tz)::date;
  v_month := date_trunc('month', v_today)::date;
  v_year := date_trunc('year', v_today)::date;
  v_py := (v_year - interval '1 year')::date;
  v_py_same := (v_today - interval '1 year')::date;
  v_12m := (v_today - interval '1 year')::date;
  -- Earliest instant any bucket below needs (start of the prior year, local).
  v_from_ts := (least(v_py, (v_month - interval '12 months')::date)::timestamp at time zone v_tz);

  select min(p.created_at) into v_history_from
  from public.zeffy_payments p
  where p.deleted_at is null and p.created_at is not null;
  v_legacy_cut := coalesce((v_history_from at time zone v_tz)::date, 'infinity'::date);

  -- ── totals ────────────────────────────────────────────────────
  with g as (
    select z.net_cents as amt, (z.created_at at time zone v_tz)::date as d
    from public.zeffy_gifts z
    where z.created_at >= v_from_ts
  )
  select jsonb_build_object(
    'today', jsonb_build_object(
      'amount_cents', coalesce(sum(amt) filter (where d = v_today), 0),
      'gift_count', count(*) filter (where d = v_today)),
    'last_7_days', jsonb_build_object(
      'amount_cents', coalesce(sum(amt) filter (where d > v_today - 7 and d <= v_today), 0),
      'gift_count', count(*) filter (where d > v_today - 7 and d <= v_today)),
    'month_to_date', jsonb_build_object(
      'amount_cents', coalesce(sum(amt) filter (where d >= v_month and d <= v_today), 0),
      'gift_count', count(*) filter (where d >= v_month and d <= v_today)),
    'year_to_date', jsonb_build_object(
      'amount_cents', coalesce(sum(amt) filter (where d >= v_year and d <= v_today), 0),
      'gift_count', count(*) filter (where d >= v_year and d <= v_today)),
    'prior_year_same_period', jsonb_build_object(
      'amount_cents', coalesce(sum(amt) filter (where d >= v_py and d <= v_py_same), 0),
      'gift_count', count(*) filter (where d >= v_py and d <= v_py_same)),
    'prior_year_total', jsonb_build_object(
      'amount_cents', coalesce(sum(amt) filter (where d >= v_py and d < v_year), 0),
      'gift_count', count(*) filter (where d >= v_py and d < v_year)),
    'last_12_months', jsonb_build_object(
      'amount_cents', coalesce(sum(amt) filter (where d > v_12m and d <= v_today), 0),
      'gift_count', count(*) filter (where d > v_12m and d <= v_today))
  ) into v_totals
  from g;

  -- ── monthly: last 13 months including this one ────────────────
  select jsonb_agg(jsonb_build_object(
      'month', to_char(m.m, 'YYYY-MM'),
      'amount_cents', coalesce(s.amt, 0),
      'gift_count', coalesce(s.n, 0)) order by m.m)
  into v_monthly
  from generate_series((v_month - interval '12 months')::date, v_month, interval '1 month') as m(m)
  left join (
    select date_trunc('month', z.created_at at time zone v_tz)::date as mm,
           sum(z.net_cents) as amt, count(*) as n
    from public.zeffy_gifts z
    where z.created_at >= ((v_month - interval '12 months')::date::timestamp at time zone v_tz)
    group by 1
  ) s on s.mm = m.m::date;

  -- ── campaigns: active, or with gifts in the last 12 months ────
  -- Peer-to-peer participant pages roll up to their parent campaign.
  with a as (
    select z.campaign_key as ckey,
      sum(z.net_cents) filter (where (z.created_at at time zone v_tz)::date >= v_year) as ytd,
      count(*) filter (where (z.created_at at time zone v_tz)::date >= v_year) as n_ytd,
      count(*) filter (where (z.created_at at time zone v_tz)::date > v_12m) as n_12m,
      max(z.created_at) as last_gift
    from public.zeffy_gifts z
    group by 1
  ), k as (
    select a.ckey from a where a.n_12m > 0 and a.ckey is not null
    union
    select c.id from public.zeffy_campaigns c
    where c.status = 'active' and c.zeffy_deleted_at is null and not coalesce(c.is_archived, false)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', k.ckey,
      'title', c.title,
      'url', c.url,
      'category', c.category,
      'status', c.status,
      'goal_cents', c.goal_cents,
      'raised_cents', c.volume_cents,
      'raised_ytd_cents', coalesce(a.ytd, 0),
      'gifts_ytd', coalesce(a.n_ytd, 0),
      'last_gift_at', a.last_gift)
    order by coalesce(a.ytd, 0) desc, coalesce(c.volume_cents, 0) desc, c.title), '[]'::jsonb)
  into v_campaigns
  from k
  left join public.zeffy_campaigns c on c.id = k.ckey
  left join a on a.ckey = k.ckey;

  -- ── by category, year to date ─────────────────────────────────
  select coalesce(jsonb_agg(jsonb_build_object('category', s.cat, 'amount_cents', s.amt, 'gift_count', s.n)
    order by s.amt desc), '[]'::jsonb)
  into v_categories
  from (
    select coalesce(z.campaign_category, c.category, 'Unknown') as cat,
           sum(z.net_cents) as amt, count(*) as n
    from public.zeffy_gifts z
    left join public.zeffy_campaigns c on c.id = z.campaign_key
    where (z.created_at at time zone v_tz)::date >= v_year
      and z.created_at >= v_from_ts
    group by 1
  ) s;

  -- ── donors (by lower-case email; gifts without an email are left out) ──
  with mir as (
    select z.buyer_email as email, z.created_at as ts, (z.created_at at time zone v_tz)::date as d,
           z.net_cents as amt,
           nullif(btrim(coalesce(z.buyer_first_name, '') || ' ' || coalesce(z.buyer_last_name, '')), '') as name
    from public.zeffy_gifts z
    where z.buyer_email is not null and btrim(z.buyer_email) <> ''
  ), leg as (
    select lower(btrim(f.email)) as email, f.payment_date as d,
           round((f.total_amount - f.refund_amount) * 100)::bigint as amt,
           nullif(btrim(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, '')), '') as name
    from public.fundraising_donations f
    where f.payment_status = 'Succeeded' and f.total_amount > 0
      and f.email is not null and btrim(f.email) <> '' and f.payment_date is not null
  ), firsts as (
    select u.email, min(u.d) as first_d
    from (select email, d from mir union all select email, d from leg) u
    group by u.email
  ), ledger as (
    select email, ts, d, amt, name from mir
    union all
    select email, (d::timestamp at time zone v_tz), d, amt, name from leg where d < v_legacy_cut
  ), per as (
    select l.email,
      (array_remove(array_agg(l.name order by l.ts desc), null))[1] as name,
      sum(l.amt) filter (where l.d >= v_year) as ytd,
      count(*) filter (where l.d >= v_year) as n_ytd,
      sum(l.amt) filter (where l.d >= v_py and l.d < v_year) as ly,
      sum(l.amt) as lifetime,
      max(l.ts) as last_ts
    from ledger l
    group by l.email
  )
  select
    jsonb_build_object(
      'donors_ytd', count(*) filter (where per.ytd > 0),
      'new_donors_ytd', count(*) filter (where per.ytd > 0 and f.first_d >= v_year),
      'returning_donors_ytd', count(*) filter (where per.ytd > 0 and f.first_d < v_year),
      'repeat_donors_ytd', count(*) filter (where per.n_ytd >= 2),
      'lapsed_count', count(*) filter (where per.ly > 0 and coalesce(per.ytd, 0) = 0)
    ),
    coalesce((
      select jsonb_agg(x.j order by x.ly desc, x.email)
      from (
        select p2.email, p2.ly, jsonb_build_object(
          'email', p2.email, 'name', p2.name, 'last_year_cents', p2.ly,
          'last_gift_at', p2.last_ts, 'lifetime_cents', p2.lifetime) as j
        from per p2
        where p2.ly > 0 and coalesce(p2.ytd, 0) = 0
        order by p2.ly desc, p2.email
        limit 100
      ) x), '[]'::jsonb),
    coalesce((
      select jsonb_agg(x.j order by x.ytd desc, x.email)
      from (
        select p3.email, p3.ytd, jsonb_build_object(
          'email', p3.email, 'name', p3.name, 'amount_cents', p3.ytd, 'gift_count', p3.n_ytd,
          'last_gift_at', p3.last_ts, 'lifetime_cents', p3.lifetime) as j
        from per p3
        where p3.ytd > 0
        order by p3.ytd desc, p3.email
        limit 25
      ) x), '[]'::jsonb)
  into v_donors, v_lapsed, v_top
  from per
  left join firsts f on f.email = per.email;

  -- ── recent gifts ──────────────────────────────────────────────
  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb)
  into v_recent
  from (
    select z.created_at, jsonb_build_object(
      'id', z.id,
      'created_at', z.created_at,
      'amount_cents', z.net_cents,
      'name', nullif(btrim(coalesce(z.buyer_first_name, '') || ' ' ||
              coalesce(left(nullif(btrim(z.buyer_last_name), ''), 1) || '.', '')), ''),
      'email', z.buyer_email,
      'campaign_id', z.campaign_key,
      'campaign_title', coalesce(pc.title, cc.title),
      'category', coalesce(z.campaign_category, pc.category, cc.category)) as j
    from public.zeffy_gifts z
    left join public.zeffy_campaigns pc on pc.id = z.parent_campaign_id
    left join public.zeffy_campaigns cc on cc.id = z.campaign_id
    order by z.created_at desc
    limit 25
  ) x;

  -- ── sync health ───────────────────────────────────────────────
  select jsonb_build_object(
    'reconcile_last_run_at', max(s.last_run_at) filter (where s.key = 'reconcile'),
    'campaigns_last_run_at', max(s.last_run_at) filter (where s.key = 'campaigns'),
    'backfill_done', coalesce(bool_or(s.done) filter (where s.key = 'payments_backfill'), false),
    'backfill_completed_at', max(s.completed_at) filter (where s.key = 'payments_backfill'),
    'contacts_done', coalesce(bool_or(s.done) filter (where s.key = 'contacts_sync'), false),
    'contacts_completed_at', max(s.completed_at) filter (where s.key = 'contacts_sync'),
    'last_payment_synced_at', (select max(p.synced_at) from public.zeffy_payments p)
  ) into v_sync
  from public.zeffy_sync_state s;

  return jsonb_build_object(
    'ok', true,
    'tz', v_tz,
    'generated_at', now(),
    'today', v_today,
    'synced_at', coalesce(v_sync->'reconcile_last_run_at', v_sync->'last_payment_synced_at'),
    'history_from', v_history_from,
    'legacy_used_before', case when v_legacy_cut = 'infinity'::date then null else v_legacy_cut end,
    'sync', v_sync,
    'totals', v_totals,
    'monthly', coalesce(v_monthly, '[]'::jsonb),
    'campaigns', v_campaigns,
    'by_category_ytd', v_categories,
    'donors', v_donors,
    'recent', v_recent,
    'lapsed', v_lapsed,
    'top_donors_ytd', v_top
  );
end;
$fn$;

revoke all on function public.fundraising_live(text) from public, anon;
grant execute on function public.fundraising_live(text) to authenticated, service_role;
