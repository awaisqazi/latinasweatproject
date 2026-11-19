-- Grant pipeline phases + committed grant money in the fundraising totals.
--
-- 1. fundraising_prospects.stage gets the phase vocabulary
--      Prospecting, Viable, Drafted, Submitted, Committed, Received, Declined
--    (default Prospecting). Existing rows are relabelled in place:
--      Research -> Prospecting, Outreach -> Viable, In Conversation -> Viable,
--      Application -> Drafted, Committed -> Committed, Stewardship -> Received,
--      Declined -> Declined.
--    Counts before (production, 2026-11-18): Research 80, Outreach 3,
--    In Conversation 1, Application 0, Committed 0, Stewardship 0, Declined 0
--    (84 rows). The one In Conversation row (for rollback, since it merges into
--    Viable): 8fbc1e47-1ab5-4f26-8206-7a923e9d7c93.
--    The relabel runs with the prospect triggers disabled, so it writes no
--    activity-log entries, leaves updated_at alone and creates, completes or
--    edits no Workspace cards. 'Declined' keeps its meaning in
--    app_private.sync_fundraising_prospect_workspace (the only function naming
--    a stage; unchanged).
-- 2. New nullable columns ask_amount, committed_amount, committed_on, received_on.
-- 3. Trigger stamps committed_on / received_on (America/Chicago date) on entry
--    to Committed / Received when they are null. Never overwrites.
-- 4. Counting rule (one definition): a grant counts when stage in
--    ('Committed','Received') and committed_amount is not null, in the calendar
--    year of committed_on. View public.fundraising_grants_committed.
-- 5. fundraising_live gains a top-level `grants` block (everything else unchanged).
-- 6. fundraising_goal_rollup gains grants_committed_cents for the cycle year.
--
-- Rollback for the relabel: docs/fundraising-live/03-grant-phases.md.

-- ── 1. Phase vocabulary + relabel ───────────────────────────────

alter table public.fundraising_prospects drop constraint if exists fundraising_prospects_stage_check;

alter table public.fundraising_prospects disable trigger log_fundraising_prospect_activity;
alter table public.fundraising_prospects disable trigger set_fundraising_prospects_updated_at;
alter table public.fundraising_prospects disable trigger sync_fundraising_prospect_workspace;

update public.fundraising_prospects
set stage = case stage
  when 'Research' then 'Prospecting'
  when 'Outreach' then 'Viable'
  when 'In Conversation' then 'Viable'
  when 'Application' then 'Drafted'
  when 'Committed' then 'Committed'
  when 'Stewardship' then 'Received'
  when 'Declined' then 'Declined'
  else stage
end
where stage in ('Research', 'Outreach', 'In Conversation', 'Application', 'Stewardship');

alter table public.fundraising_prospects enable trigger log_fundraising_prospect_activity;
alter table public.fundraising_prospects enable trigger set_fundraising_prospects_updated_at;
alter table public.fundraising_prospects enable trigger sync_fundraising_prospect_workspace;

alter table public.fundraising_prospects alter column stage set default 'Prospecting';
alter table public.fundraising_prospects add constraint fundraising_prospects_stage_check check (
  stage in ('Prospecting', 'Viable', 'Drafted', 'Submitted', 'Committed', 'Received', 'Declined')
);

-- ── 2. Amounts and dates ────────────────────────────────────────

alter table public.fundraising_prospects add column if not exists ask_amount numeric(12,2);
alter table public.fundraising_prospects add column if not exists committed_amount numeric(12,2);
alter table public.fundraising_prospects add column if not exists committed_on date;
alter table public.fundraising_prospects add column if not exists received_on date;

create index if not exists fundraising_prospects_committed_idx
  on public.fundraising_prospects (committed_on)
  where stage in ('Committed', 'Received') and committed_amount is not null;

-- ── 3. Phase dates trigger ──────────────────────────────────────

create or replace function app_private.stamp_fundraising_prospect_phase_dates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_today date := (now() at time zone 'America/Chicago')::date;
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    if new.stage in ('Committed', 'Received') and new.committed_on is null then
      new.committed_on := v_today;
    end if;
    if new.stage = 'Received' and new.received_on is null then
      new.received_on := v_today;
    end if;
  end if;
  return new;
end;
$fn$;

revoke all on function app_private.stamp_fundraising_prospect_phase_dates() from public;

drop trigger if exists stamp_fundraising_prospect_phase_dates on public.fundraising_prospects;
create trigger stamp_fundraising_prospect_phase_dates
before insert or update on public.fundraising_prospects
for each row execute function app_private.stamp_fundraising_prospect_phase_dates();

-- ── 4. Counting rule ────────────────────────────────────────────

create or replace view public.fundraising_grants_committed
with (security_invoker = on) as
select p.id, p.name, p.kind, p.stage, p.committed_amount, p.committed_on, p.received_on
from public.fundraising_prospects p
where p.stage in ('Committed', 'Received')
  and p.committed_amount is not null;

revoke all on table public.fundraising_grants_committed from anon, authenticated;
grant select on table public.fundraising_grants_committed to authenticated;
grant select on table public.fundraising_grants_committed to service_role;

-- ── 5. fundraising_live + grants block ──────────────────────────
-- Body identical to 20261118120300 except v_grants and the `grants` key.

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
  v_totals jsonb;
  v_monthly jsonb;
  v_campaigns jsonb;
  v_categories jsonb;
  v_donors jsonb;
  v_recent jsonb;
  v_lapsed jsonb;
  v_top jsonb;
  v_sync jsonb;
  v_grants jsonb;
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
  ), firsts as (
    -- Mirror only: its history starts 2025-07-18, the same day as the
    -- archived spreadsheet import, which is no longer read.
    select mir.email, min(mir.d) as first_d
    from mir
    group by mir.email
  ), ledger as (
    select email, ts, d, amt, name from mir
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

  -- ── grants (counting rule: view fundraising_grants_committed) ──
  -- Kept apart from the Zeffy totals above: the UI shows the two side by side.
  with g as (
    select round(c.committed_amount * 100)::bigint as cents, c.committed_on, c.stage
    from public.fundraising_grants_committed c
  ),
  years as (
    select extract(year from g.committed_on)::int as y, sum(g.cents)::bigint as cents
    from g where g.committed_on is not null group by 1
  ),
  phases(phase, ord) as (
    values ('Prospecting', 1), ('Viable', 2), ('Drafted', 3), ('Submitted', 4),
           ('Committed', 5), ('Received', 6), ('Declined', 7)
  ),
  pp as (
    select ph.phase, ph.ord,
      count(fp.id) as n,
      coalesce(round(sum(fp.ask_amount) * 100), 0)::bigint as ask_cents,
      -- counted grants only (the rule above), so it is 0 outside Committed/Received
      coalesce(round(sum(fp.committed_amount) filter (where fp.stage in ('Committed', 'Received')) * 100), 0)::bigint as committed_cents
    from phases ph
    left join public.fundraising_prospects fp on fp.stage = ph.phase
    group by ph.phase, ph.ord
  )
  select jsonb_build_object(
    'committed_ytd_cents', (select coalesce(sum(g.cents), 0)::bigint from g
                            where g.committed_on >= v_year and g.committed_on < (v_year + interval '1 year')::date),
    'committed_ytd_count', (select count(*) from g
                            where g.committed_on >= v_year and g.committed_on < (v_year + interval '1 year')::date),
    'received_ytd_cents', (select coalesce(sum(g.cents), 0)::bigint from g
                           where g.stage = 'Received'
                             and g.committed_on >= v_year and g.committed_on < (v_year + interval '1 year')::date),
    'committed_last_12_months_cents', (select coalesce(sum(g.cents), 0)::bigint from g
                                       where g.committed_on > v_12m and g.committed_on <= v_today),
    'by_year', coalesce((select jsonb_object_agg(y::text, cents order by y) from years), '{}'::jsonb),
    'by_phase', (select jsonb_agg(jsonb_build_object(
                   'phase', pp.phase, 'count', pp.n,
                   'ask_cents', pp.ask_cents, 'committed_cents', pp.committed_cents) order by pp.ord)
                 from pp)
  ) into v_grants;

  return jsonb_build_object(
    'ok', true,
    'tz', v_tz,
    'generated_at', now(),
    'today', v_today,
    'synced_at', coalesce(v_sync->'reconcile_last_run_at', v_sync->'last_payment_synced_at'),
    'history_from', v_history_from,
    'legacy_used_before', null,   -- kept for the contract; the import is no longer read
    'sync', v_sync,
    'totals', v_totals,
    'monthly', coalesce(v_monthly, '[]'::jsonb),
    'campaigns', v_campaigns,
    'by_category_ytd', v_categories,
    'donors', v_donors,
    'recent', v_recent,
    'lapsed', v_lapsed,
    'top_donors_ytd', v_top,
    'grants', v_grants
  );
end;
$fn$;

revoke all on function public.fundraising_live(text) from public, anon;
grant execute on function public.fundraising_live(text) to authenticated, service_role;

-- ── 6. fundraising_goal_rollup + grants_committed_cents ─────────
-- Body identical to 20261118130000 except v_grants_cents and its key.

create or replace function public.fundraising_goal_rollup(p_cycle text default '2027')
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_cycle text := coalesce(nullif(btrim(p_cycle), ''), '2027');
  v_goals jsonb;
  v_goal_cents bigint;
  v_subs jsonb;
  v_totals jsonb;
  v_people jsonb;
  v_grants_cents bigint;
begin
  if not coalesce((select app_private.has_module('fundraising')), false) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  -- app_settings.fundraising_goals: {"2027": 100000000} (cents by year).
  -- Tolerate a JSON string holding that object, and string or number values.
  select s.value into v_goals from public.app_settings s where s.key = 'fundraising_goals';
  begin
    if jsonb_typeof(v_goals) = 'string' then
      v_goals := (v_goals #>> '{}')::jsonb;
    end if;
    if jsonb_typeof(v_goals) = 'object' then
      v_goal_cents := round(app_private.fundraising_parse_number(v_goals->>v_cycle))::bigint;
    end if;
  exception when others then
    v_goal_cents := null;
  end;

  with subs(id, ord) as (
    values ('events', 1), ('grants', 2), ('donors', 3), ('upskilling', 4)
  ),
  wr as (
    select r.* from public.fundraising_worksheet_rows r where r.cycle = v_cycle
  ),
  per_sub as (
    select r.subcommittee,
      max(round(100 * app_private.fundraising_parse_number(r.data->>'amount'))) filter (where r.row_key = 'low')::bigint as low_cents,
      max(round(100 * app_private.fundraising_parse_number(r.data->>'amount'))) filter (where r.row_key = 'realistic')::bigint as realistic_cents,
      max(round(100 * app_private.fundraising_parse_number(r.data->>'amount'))) filter (where r.row_key = 'stretch')::bigint as stretch_cents
    from wr r
    where r.section = 'size_share'
      and r.row_key in ('low', 'realistic', 'stretch')
      and r.subcommittee in ('events', 'grants', 'donors')
    group by r.subcommittee
  ),
  people_filled as (
    select bool_or(app_private.fundraising_parse_number(r.data->>'realistic') is not null) as filled
    from wr r
    where r.subcommittee = 'upskilling' and r.section = 'size_share'
      and r.row_key in ('people_trained', 'made_ask', 'introductions', 'employer_matches')
  ),
  last_change as (
    select r.subcommittee, max(r.updated_at) as updated_at from wr r group by r.subcommittee
  ),
  so as (
    select s.ord,
      jsonb_build_object(
        'id', s.id,
        'low_cents', p.low_cents,
        'realistic_cents', p.realistic_cents,
        'stretch_cents', p.stretch_cents,
        'filled', case when s.id = 'upskilling'
                       then coalesce((select pf.filled from people_filled pf), false)
                       else p.realistic_cents is not null end,
        'updated_at', l.updated_at
      ) as j,
      p.low_cents, p.realistic_cents, p.stretch_cents
    from subs s
    left join per_sub p on p.subcommittee = s.id
    left join last_change l on l.subcommittee = s.id
  )
  select
    jsonb_agg(o.j order by o.ord),
    jsonb_build_object(
      'low_cents', coalesce(sum(o.low_cents), 0)::bigint,
      'realistic_cents', coalesce(sum(o.realistic_cents), 0)::bigint,
      'stretch_cents', coalesce(sum(o.stretch_cents), 0)::bigint
    )
  into v_subs, v_totals
  from so o;

  with measures(k, ord) as (
    values ('people_trained', 1), ('made_ask', 2), ('introductions', 3), ('employer_matches', 4)
  ),
  m as (
    select r.row_key,
      app_private.fundraising_parse_number(r.data->>'low') as low,
      app_private.fundraising_parse_number(r.data->>'realistic') as realistic,
      app_private.fundraising_parse_number(r.data->>'stretch') as stretch
    from public.fundraising_worksheet_rows r
    where r.cycle = v_cycle and r.subcommittee = 'upskilling' and r.section = 'size_share'
      and r.row_key in ('people_trained', 'made_ask', 'introductions', 'employer_matches')
  )
  select jsonb_object_agg(ms.k, jsonb_build_object(
    'low', m.low, 'realistic', m.realistic, 'stretch', m.stretch))
  into v_people
  from measures ms left join m on m.row_key = ms.k;

  -- Grants committed in the cycle's calendar year (same rule as fundraising_live).
  if v_cycle ~ '^[0-9]{4}$' then
    select coalesce(round(sum(c.committed_amount) * 100), 0)::bigint into v_grants_cents
    from public.fundraising_grants_committed c
    where extract(year from c.committed_on) = v_cycle::int;
  end if;

  return jsonb_build_object(
    'ok', true,
    'cycle', v_cycle,
    'goal_cents', v_goal_cents,
    'subcommittees', v_subs,
    'totals', v_totals,
    'people', v_people,
    'grants_committed_cents', v_grants_cents
  );
end;
$fn$;

revoke all on function public.fundraising_goal_rollup(text) from public, anon;
grant execute on function public.fundraising_goal_rollup(text) to authenticated, service_role;
