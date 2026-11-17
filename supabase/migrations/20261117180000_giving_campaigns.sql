-- Giving Tuesday 2026: peer-to-peer giving campaigns synced from Zeffy.
--
-- One campaign row per drive (giving-tuesday-2026 is the first). Instructors
-- sign up through the public giving-signup edge function (Turnstile-verified,
-- rows land as 'pending' and stay private until an admin approves them). Gifts
-- arrive from the zeffy-webhook edge function (signed webhook deliveries plus a
-- reconcile pass against the Zeffy API) or are keyed by hand as offline gifts.
--
-- Surface:
--   public.giving_public(p_campaign)   anon, aggregates only: never a donor name,
--                                      email, single gift amount or timestamp.
--   public.giving_fundraiser_totals    security_invoker view for the admin tab.
--   public.giving_signup_submit(...)   service_role only (edge function).
--   public.giving_upsert_zeffy_payment service_role only (edge function).
--   public.giving_can_manage()         authenticated: the reconcile button's
--                                      permission check (has_module fundraising).
--
-- Tables have RLS on, anon gets nothing, the fundraising module reads and
-- writes. Money is integer cents everywhere. Additive only: nothing existing is
-- altered.

-- ── Campaigns ───────────────────────────────────────────────────

create table if not exists public.giving_campaigns (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  title text not null check (char_length(btrim(title)) > 0),
  goal_cents bigint not null default 0 check (goal_cents >= 0),
  threshold_cents bigint not null default 15000 check (threshold_cents >= 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Zeffy campaign ids whose payments count toward this drive: the main
  -- peer-to-peer page id (payments carry it as parent_campaign_id), plus any
  -- stand-alone form that should also count.
  zeffy_campaign_ids text[] not null default '{}',
  give_url text,
  prize_label text,
  is_public boolean not null default true,
  board_open boolean not null default true,
  signup_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

drop trigger if exists set_giving_campaigns_updated_at on public.giving_campaigns;
create trigger set_giving_campaigns_updated_at
before update on public.giving_campaigns
for each row execute function public.set_updated_at();

-- ── Fundraisers (one per instructor per campaign) ───────────────

create table if not exists public.giving_fundraisers (
  id uuid primary key default gen_random_uuid(),
  campaign_slug text not null references public.giving_campaigns(slug)
    on update cascade on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,119}$'),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 60),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 60),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 121),
  email text not null check (char_length(email) between 3 and 200),
  phone text check (phone is null or char_length(phone) <= 30),
  cohort text not null default 'instructor'
    check (cohort in ('instructor', 'ytt-2026', 'both')),
  why text check (why is null or char_length(why) <= 160),
  avatar_slug text,
  show_on_board boolean not null default true,
  consent_page boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'hidden')),
  goal_cents bigint not null default 15000 check (goal_cents >= 0),
  zeffy_campaign_id text,
  zeffy_url text,
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists giving_fundraisers_slug_idx
  on public.giving_fundraisers (campaign_slug, slug);
create unique index if not exists giving_fundraisers_email_idx
  on public.giving_fundraisers (campaign_slug, lower(email));
create unique index if not exists giving_fundraisers_zeffy_campaign_idx
  on public.giving_fundraisers (zeffy_campaign_id)
  where zeffy_campaign_id is not null;
create index if not exists giving_fundraisers_board_idx
  on public.giving_fundraisers (campaign_slug, status);
create index if not exists giving_fundraisers_approved_by_idx
  on public.giving_fundraisers (approved_by);

drop trigger if exists set_giving_fundraisers_updated_at on public.giving_fundraisers;
create trigger set_giving_fundraisers_updated_at
before update on public.giving_fundraisers
for each row execute function public.set_updated_at();

-- ── Payments (Zeffy-synced and offline) ─────────────────────────
-- amount_cents is the gift itself (the Zeffy tip is never part of it, see the
-- edge function), refunded_cents the part handed back. A row counts when
-- status = 'succeeded'; net = greatest(amount_cents - refunded_cents, 0).

create table if not exists public.giving_payments (
  id uuid primary key default gen_random_uuid(),
  campaign_slug text not null references public.giving_campaigns(slug)
    on update cascade on delete cascade,
  fundraiser_id uuid references public.giving_fundraisers(id) on delete set null,
  source text not null default 'zeffy' check (source in ('zeffy', 'offline')),
  zeffy_payment_id text unique,
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  status text not null default 'succeeded',
  refund_status text not null default 'none',
  paid_at timestamptz not null default now(),
  buyer_email text,
  buyer_first_name text,
  buyer_last_name text,
  zeffy_campaign_id text,
  zeffy_parent_campaign_id text,
  zeffy_team_id text,
  -- Admin switch: false keeps the gift in the totals but out of the $150
  -- drawing threshold (for example a gift the instructor paid for herself
  -- under another email).
  counts_toward_threshold boolean not null default true,
  note text,
  raw jsonb,
  entered_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source <> 'zeffy' or zeffy_payment_id is not null)
);

create index if not exists giving_payments_campaign_idx
  on public.giving_payments (campaign_slug, status);
create index if not exists giving_payments_fundraiser_idx
  on public.giving_payments (fundraiser_id);
create index if not exists giving_payments_zeffy_campaign_idx
  on public.giving_payments (zeffy_campaign_id);
create index if not exists giving_payments_entered_by_idx
  on public.giving_payments (entered_by);

drop trigger if exists set_giving_payments_updated_at on public.giving_payments;
create trigger set_giving_payments_updated_at
before update on public.giving_payments
for each row execute function public.set_updated_at();

-- ── Webhook idempotency log ─────────────────────────────────────

create table if not exists public.giving_webhook_events (
  id text primary key,
  type text,
  outcome text not null default 'received',
  error text,
  received_at timestamptz not null default now()
);

create index if not exists giving_webhook_events_received_idx
  on public.giving_webhook_events (received_at desc);

-- ── Drawing record ──────────────────────────────────────────────

create table if not exists public.giving_draws (
  id uuid primary key default gen_random_uuid(),
  campaign_slug text not null references public.giving_campaigns(slug)
    on update cascade on delete cascade,
  drawn_at timestamptz not null default now(),
  drawn_by uuid references public.profiles(id) on delete set null,
  -- [{fundraiser_id, name, eligible_cents}] at the moment of the draw.
  eligible jsonb not null default '[]'::jsonb,
  seed text,
  winner_fundraiser_id uuid references public.giving_fundraisers(id) on delete set null,
  note text
);

create index if not exists giving_draws_campaign_idx
  on public.giving_draws (campaign_slug, drawn_at desc);
create index if not exists giving_draws_drawn_by_idx
  on public.giving_draws (drawn_by);
create index if not exists giving_draws_winner_idx
  on public.giving_draws (winner_fundraiser_id);

-- ── Avatar slugs baked in at build time ─────────────────────────
-- Photo slugs present under public/images/popup/instructors/ when this
-- migration was written, so the sign-up function can set avatar_slug without
-- filesystem access. Add a row when a new photo ships.

create table if not exists public.giving_avatar_slugs (
  slug text primary key
);

insert into public.giving_avatar_slugs (slug) values
  ('alondra-alcazar'), ('amayrani-nunez'), ('anabel-hernandez'),
  ('andrea-fuentes'), ('antonia-rosales'), ('ariel-cervera'),
  ('ariesna-garcia-sedano'), ('ashley-reitz'), ('benjamin-drury'),
  ('brenda-maldonado'), ('celina-huerta'), ('courtney-luedke'),
  ('dinorah-zubieta'), ('efren-ramirez-jr'), ('fabiola-davila'),
  ('fabiola-saldana'), ('ghazala-irshad'), ('gigi-torres'),
  ('gisella-mitchell'), ('giselle-castaneda'), ('jade-nguyen'),
  ('jay-pena'), ('jessica-eguia'), ('jiana-calixto'), ('jocelyn-vega'),
  ('juanita-barajas'), ('kellyn-mitchell'), ('lizette-vega'),
  ('lucia-del-rincon-martinez'), ('luz-rodriguez'), ('marelin-enriquez'),
  ('marlene-garcia'), ('rut-merida'), ('sarah-esparza'),
  ('savannah-alvarez'), ('vanessa-tirado'), ('vero-quinones'),
  ('xochyl-perez'), ('yaritza-jurado'), ('zoraida-magana')
on conflict (slug) do nothing;

-- ── Admin rollup (security_invoker: the caller's RLS applies) ───

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
      and p.status = 'succeeded'
  ) n
) t on true;

-- ── Grants + RLS ────────────────────────────────────────────────
-- Supabase default grants give anon and authenticated ALL on new tables:
-- revoke first, then grant narrowly.

alter table public.giving_campaigns enable row level security;
alter table public.giving_fundraisers enable row level security;
alter table public.giving_payments enable row level security;
alter table public.giving_webhook_events enable row level security;
alter table public.giving_draws enable row level security;
alter table public.giving_avatar_slugs enable row level security;

revoke all on table public.giving_campaigns from anon, authenticated;
revoke all on table public.giving_fundraisers from anon, authenticated;
revoke all on table public.giving_payments from anon, authenticated;
revoke all on table public.giving_webhook_events from anon, authenticated;
revoke all on table public.giving_draws from anon, authenticated;
revoke all on table public.giving_avatar_slugs from anon, authenticated;
revoke all on table public.giving_fundraiser_totals from anon, authenticated;

grant select, insert, update, delete on table public.giving_campaigns to authenticated;
grant select, insert, update, delete on table public.giving_fundraisers to authenticated;
grant select, insert, update, delete on table public.giving_payments to authenticated;
grant select on table public.giving_webhook_events to authenticated;
grant select, insert on table public.giving_draws to authenticated;
grant select on table public.giving_avatar_slugs to authenticated;
grant select on table public.giving_fundraiser_totals to authenticated;

grant all on table public.giving_campaigns to service_role;
grant all on table public.giving_fundraisers to service_role;
grant all on table public.giving_payments to service_role;
grant all on table public.giving_webhook_events to service_role;
grant all on table public.giving_draws to service_role;
grant all on table public.giving_avatar_slugs to service_role;
grant select on table public.giving_fundraiser_totals to service_role;

create policy "Fundraising module can read giving campaigns"
on public.giving_campaigns for select to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can insert giving campaigns"
on public.giving_campaigns for insert to authenticated
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can update giving campaigns"
on public.giving_campaigns for update to authenticated
using ((select app_private.has_module('fundraising')))
with check ((select app_private.has_module('fundraising')));

create policy "Admins can delete giving campaigns"
on public.giving_campaigns for delete to authenticated
using ((select app_private.is_admin()));

create policy "Fundraising module can read giving fundraisers"
on public.giving_fundraisers for select to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can insert giving fundraisers"
on public.giving_fundraisers for insert to authenticated
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can update giving fundraisers"
on public.giving_fundraisers for update to authenticated
using ((select app_private.has_module('fundraising')))
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can delete giving fundraisers"
on public.giving_fundraisers for delete to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can read giving payments"
on public.giving_payments for select to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can insert giving payments"
on public.giving_payments for insert to authenticated
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can update giving payments"
on public.giving_payments for update to authenticated
using ((select app_private.has_module('fundraising')))
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can delete giving payments"
on public.giving_payments for delete to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can read giving webhook events"
on public.giving_webhook_events for select to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can read giving draws"
on public.giving_draws for select to authenticated
using ((select app_private.has_module('fundraising')));

create policy "Fundraising module can record giving draws"
on public.giving_draws for insert to authenticated
with check ((select app_private.has_module('fundraising')));

create policy "Fundraising module can read giving avatar slugs"
on public.giving_avatar_slugs for select to authenticated
using ((select app_private.has_module('fundraising')));

-- ── Public aggregate RPC ────────────────────────────────────────

create or replace function public.giving_public(p_campaign text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
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
    and p.status = 'succeeded';

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
        and p.status = 'succeeded'
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
$fn$;

revoke all on function public.giving_public(text) from public;
grant execute on function public.giving_public(text) to anon, authenticated, service_role;

-- ── Reconcile permission check for dashboard users ──────────────

create or replace function public.giving_can_manage()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select coalesce((select app_private.has_module('fundraising')), false);
$fn$;

revoke all on function public.giving_can_manage() from public;
grant execute on function public.giving_can_manage() to authenticated, service_role;

-- ── Sign-up write path (service_role only, called by giving-signup) ─
-- Returns {ok, reason?, outcome?}. The edge function maps reasons to HTTP
-- statuses and always answers a duplicate with plain {ok: true}, so the
-- endpoint never reveals which emails are registered.

create or replace function public.giving_signup_submit(
  p_campaign text,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_phone text,
  p_cohort text,
  p_why text,
  p_show_on_board boolean,
  p_consent_page boolean,
  p_base_slug text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_c public.giving_campaigns%rowtype;
  v_existing public.giving_fundraisers%rowtype;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_display text;
  v_base text := btrim(coalesce(p_base_slug, ''));
  v_slug text;
  v_n integer := 1;
  v_avatar text;
begin
  select * into v_c from public.giving_campaigns c
  where c.slug = btrim(coalesce(p_campaign, '')) and c.is_public;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not v_c.signup_open then
    return jsonb_build_object('ok', false, 'reason', 'signup_closed');
  end if;

  if v_first = '' or v_last = '' or char_length(v_first) > 60 or char_length(v_last) > 60 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;
  if coalesce(p_cohort, '') not in ('instructor', 'ytt-2026', 'both') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_cohort');
  end if;
  if not coalesce(p_consent_page, false) then
    return jsonb_build_object('ok', false, 'reason', 'consent_required');
  end if;

  v_display := v_first || ' ' || v_last;
  if v_base = '' or v_base !~ '^[a-z0-9][a-z0-9-]*$' then
    v_base := 'fundraiser';
  end if;
  v_base := left(v_base, 110);

  -- Serialise sign-ups per campaign so two identical names cannot race to
  -- the same slug.
  perform pg_advisory_xact_lock(hashtext('giving_signup:' || v_c.slug));

  select * into v_existing from public.giving_fundraisers f
  where f.campaign_slug = v_c.slug and lower(f.email) = v_email
  for update;

  if found and v_existing.status <> 'pending' then
    return jsonb_build_object('ok', true, 'outcome', 'unchanged');
  end if;

  -- Keep the existing slug when the name did not change.
  if found and v_existing.display_name = v_display then
    v_slug := v_existing.slug;
  else
    v_slug := v_base;
    while exists (
      select 1 from public.giving_fundraisers f
      where f.campaign_slug = v_c.slug and f.slug = v_slug
        and f.id is distinct from v_existing.id
    ) loop
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    end loop;
  end if;

  select a.slug into v_avatar from public.giving_avatar_slugs a where a.slug = v_slug;

  if v_existing.id is not null then
    update public.giving_fundraisers set
      slug = v_slug,
      first_name = v_first,
      last_name = v_last,
      display_name = v_display,
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      cohort = p_cohort,
      why = nullif(btrim(coalesce(p_why, '')), ''),
      avatar_slug = v_avatar,
      show_on_board = coalesce(p_show_on_board, true),
      consent_page = true
    where id = v_existing.id;
    return jsonb_build_object('ok', true, 'outcome', 'updated');
  end if;

  insert into public.giving_fundraisers (
    campaign_slug, slug, first_name, last_name, display_name, email, phone,
    cohort, why, avatar_slug, show_on_board, consent_page, status, goal_cents
  ) values (
    v_c.slug, v_slug, v_first, v_last, v_display, v_email,
    nullif(btrim(coalesce(p_phone, '')), ''),
    p_cohort, nullif(btrim(coalesce(p_why, '')), ''), v_avatar,
    coalesce(p_show_on_board, true), true, 'pending', v_c.threshold_cents
  );
  return jsonb_build_object('ok', true, 'outcome', 'created');
end;
$fn$;

revoke all on function public.giving_signup_submit(text, text, text, text, text, text, text, boolean, boolean, text) from public;
revoke all on function public.giving_signup_submit(text, text, text, text, text, text, text, boolean, boolean, text) from anon, authenticated;
grant execute on function public.giving_signup_submit(text, text, text, text, text, text, text, boolean, boolean, text) to service_role;

-- ── Zeffy payment upsert (service_role only, called by zeffy-webhook) ─
-- p_row carries the columns the function computed. An admin's manual
-- fundraiser assignment and counts_toward_threshold flag survive every
-- later sync: fundraiser_id only moves when the sync found a match.

create or replace function public.giving_upsert_zeffy_payment(p_row jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_inserted boolean;
begin
  insert into public.giving_payments as gp (
    campaign_slug, fundraiser_id, source, zeffy_payment_id, amount_cents,
    refunded_cents, status, refund_status, paid_at, buyer_email,
    buyer_first_name, buyer_last_name, zeffy_campaign_id,
    zeffy_parent_campaign_id, zeffy_team_id, raw
  ) values (
    p_row->>'campaign_slug',
    nullif(p_row->>'fundraiser_id', '')::uuid,
    'zeffy',
    p_row->>'zeffy_payment_id',
    coalesce((p_row->>'amount_cents')::bigint, 0),
    coalesce((p_row->>'refunded_cents')::bigint, 0),
    coalesce(p_row->>'status', 'unknown'),
    coalesce(p_row->>'refund_status', 'none'),
    coalesce((p_row->>'paid_at')::timestamptz, now()),
    nullif(p_row->>'buyer_email', ''),
    nullif(p_row->>'buyer_first_name', ''),
    nullif(p_row->>'buyer_last_name', ''),
    nullif(p_row->>'zeffy_campaign_id', ''),
    nullif(p_row->>'zeffy_parent_campaign_id', ''),
    nullif(p_row->>'zeffy_team_id', ''),
    p_row->'raw'
  )
  on conflict (zeffy_payment_id) do update set
    campaign_slug = excluded.campaign_slug,
    fundraiser_id = coalesce(excluded.fundraiser_id, gp.fundraiser_id),
    amount_cents = excluded.amount_cents,
    refunded_cents = excluded.refunded_cents,
    status = excluded.status,
    refund_status = excluded.refund_status,
    paid_at = excluded.paid_at,
    buyer_email = excluded.buyer_email,
    buyer_first_name = excluded.buyer_first_name,
    buyer_last_name = excluded.buyer_last_name,
    zeffy_campaign_id = excluded.zeffy_campaign_id,
    zeffy_parent_campaign_id = excluded.zeffy_parent_campaign_id,
    zeffy_team_id = excluded.zeffy_team_id,
    raw = excluded.raw
  returning (xmax = 0) into v_inserted;

  return case when v_inserted then 'inserted' else 'updated' end;
end;
$fn$;

revoke all on function public.giving_upsert_zeffy_payment(jsonb) from public;
revoke all on function public.giving_upsert_zeffy_payment(jsonb) from anon, authenticated;
grant execute on function public.giving_upsert_zeffy_payment(jsonb) to service_role;

-- ── Seed: the real campaign ─────────────────────────────────────

insert into public.giving_campaigns (
  slug, title, goal_cents, threshold_cents, starts_at, ends_at,
  zeffy_campaign_ids, give_url, prize_label
) values (
  'giving-tuesday-2026',
  'LSP Giving Tuesday',
  1500000,
  15000,
  timestamptz '2026-11-19 00:00:00 America/Chicago',
  timestamptz '2026-12-01 23:59:59 America/Chicago',
  '{}',
  null,
  null
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
