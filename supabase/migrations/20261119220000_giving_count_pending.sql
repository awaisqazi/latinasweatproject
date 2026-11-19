-- Giving Tuesday: count pending gifts alongside cleared ones.
--
-- Zeffy adds a bank-transfer (ACH) gift to a fundraiser's thermometer the
-- moment it is made, while the payment sits at status 'pending' for a few
-- business days. The site only counted 'succeeded', so a page could read
-- $235 on Zeffy and $210 here. Both the public RPC and the admin rollup now
-- count 'succeeded' and 'pending'. A transfer that fails leaves both statuses
-- on the next sync and drops out of every total.

create or replace view public.giving_fundraiser_totals
with (security_invoker = on) as
select
  f.id as fundraiser_id,
  f.campaign_slug,
  f.slug,
  f.display_name,
  f.email,
  f.status,
  f.show_on_board,
  f.goal_cents,
  c.threshold_cents,
  coalesce(t.raised_cents, 0)::bigint as raised_cents,
  coalesce(t.gift_count, 0)::integer as gift_count,
  coalesce(t.eligible_cents, 0)::bigint as eligible_cents,
  coalesce(t.eligible_gift_count, 0)::integer as eligible_gift_count,
  coalesce(t.self_gift_cents, 0)::bigint as self_gift_cents,
  coalesce(t.flagged_cents, 0)::bigint as flagged_cents,
  coalesce(t.late_cents, 0)::bigint as late_cents,
  (coalesce(t.eligible_cents, 0) >= c.threshold_cents) as reached
from public.giving_fundraisers f
join public.giving_campaigns c on c.slug = f.campaign_slug
left join lateral (
  select
    sum(n.net) as raised_cents,
    count(*) filter (where n.net > 0) as gift_count,
    sum(n.net) filter (where n.eligible) as eligible_cents,
    count(*) filter (where n.eligible and n.net > 0) as eligible_gift_count,
    sum(n.net) filter (where n.self_gift) as self_gift_cents,
    sum(n.net) filter (where not n.counts_toward_threshold) as flagged_cents,
    sum(n.net) filter (where n.late) as late_cents
  from (
    select
      greatest(p.amount_cents - p.refunded_cents, 0) as net,
      p.counts_toward_threshold,
      coalesce(lower(btrim(p.buyer_email)) = lower(btrim(f.email)), false) as self_gift,
      p.paid_at > c.ends_at as late,
      (p.counts_toward_threshold
        and not coalesce(lower(btrim(p.buyer_email)) = lower(btrim(f.email)), false)
        and p.paid_at <= c.ends_at) as eligible
    from public.giving_payments p
    where p.fundraiser_id = f.id
      and p.status in ('succeeded', 'pending')
  ) n
) t on true;

-- ── Grants + RLS ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.giving_public(p_campaign text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_slug text := btrim(coalesce(p_campaign, ''));
  v_c public.giving_campaigns%rowtype;
  v_total bigint;
  v_gifts integer;
  v_fcount integer;
  v_reached integer;
  v_board jsonb;
begin
  if v_slug = '' or char_length(v_slug) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_c from public.giving_campaigns c
  where c.slug = v_slug and c.is_public;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select
    coalesce(sum(greatest(p.amount_cents - p.refunded_cents, 0)), 0),
    count(*) filter (where p.amount_cents - p.refunded_cents > 0)
  into v_total, v_gifts
  from public.giving_payments p
  where p.campaign_slug = v_c.slug
    and p.status in ('succeeded', 'pending');

  with f as (
    select
      fr.id, fr.slug, fr.display_name, fr.cohort, fr.avatar_slug, fr.why,
      fr.goal_cents, fr.zeffy_url, fr.show_on_board,
      coalesce(t.raised, 0)::bigint as raised,
      coalesce(t.gifts, 0)::integer as gifts,
      coalesce(t.eligible, 0)::bigint as eligible
    from public.giving_fundraisers fr
    left join lateral (
      select
        sum(greatest(p.amount_cents - p.refunded_cents, 0)) as raised,
        count(*) filter (where p.amount_cents - p.refunded_cents > 0) as gifts,
        sum(greatest(p.amount_cents - p.refunded_cents, 0)) filter (
          where p.counts_toward_threshold
            and p.paid_at <= v_c.ends_at
            and not coalesce(lower(btrim(p.buyer_email)) = lower(btrim(fr.email)), false)
        ) as eligible
      from public.giving_payments p
      where p.fundraiser_id = fr.id
        and p.status in ('succeeded', 'pending')
    ) t on true
    where fr.campaign_slug = v_c.slug
      and fr.status = 'approved'
  )
  select
    count(*),
    count(*) filter (where f.eligible >= v_c.threshold_cents),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'slug', f.slug,
          'name', f.display_name,
          'cohort', f.cohort,
          'avatar', f.avatar_slug,
          'why', f.why,
          'raised_cents', f.raised,
          'gift_count', f.gifts,
          'goal_cents', f.goal_cents,
          'reached', f.eligible >= v_c.threshold_cents,
          'give_url', f.zeffy_url
        )
        order by f.raised desc, f.display_name, f.slug
      ) filter (where f.show_on_board and v_c.board_open),
      '[]'::jsonb
    )
  into v_fcount, v_reached, v_board
  from f;

  return jsonb_build_object(
    'ok', true,
    'campaign', jsonb_build_object(
      'slug', v_c.slug,
      'title', v_c.title,
      'goal_cents', v_c.goal_cents,
      'threshold_cents', v_c.threshold_cents,
      'starts_at', to_char(v_c.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'ends_at', to_char(v_c.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'give_url', v_c.give_url,
      'prize_label', v_c.prize_label,
      'board_open', v_c.board_open,
      'signup_open', v_c.signup_open
    ),
    'total_cents', v_total,
    'gift_count', v_gifts,
    'fundraiser_count', v_fcount,
    'reached_count', v_reached,
    'fundraisers', v_board,
    'turnstile_site_key', (
      select s.value #>> '{}' from public.app_settings s where s.key = 'turnstile_site_key'
    ),
    'server_time', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
end;
$function$
;
