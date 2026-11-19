-- Fundraising dashboard: thank-you tracker, monthly subcommittee updates and a
-- needs-attention queue.
--
--   public.fundraising_payment_thanks        one row per thanked Zeffy payment
--   public.fundraising_thanks_queue(int,text) gifts still waiting for a thank-you
--   public.fundraising_mark_thanked(text[],text,text) mark one or many as thanked
--   public.fundraising_updates               one update per subcommittee per month
--   public.fundraising_attention(text)       the board's to-do list, computed live
--
-- Thanks-queue rule: a payment counted by zeffy_gifts (succeeded, not deleted,
-- net of refunds > 0, charged > 0) whose zeffy_payments.campaign_category is
-- 'donation' or 'peer_to_peer' (when the payment carries no category, the
-- campaign's own category 'DonationForm' / 'PeerToPeerCampaign' decides).
-- Everything else (event tickets, shop, auction, raffle, custom) is left out.
--
-- Access: dashboard users with the fundraising module only; anon has nothing.
-- Additive only.

-- ── 1. Thank-you tracker ────────────────────────────────────────

create table if not exists public.fundraising_payment_thanks (
  payment_id text primary key references public.zeffy_payments(id) on delete cascade,
  thanked_by uuid references public.profiles(id) on delete set null,
  thanked_at timestamptz not null default now(),
  method text check (method in ('email', 'call', 'text', 'note', 'in_person', 'other')),
  note text
);

create index if not exists fundraising_payment_thanks_thanked_at_idx
  on public.fundraising_payment_thanks (thanked_at desc);
create index if not exists fundraising_payment_thanks_thanked_by_idx
  on public.fundraising_payment_thanks (thanked_by);

create or replace function app_private.fundraising_stamp_thanked_by()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is not null then
    new.thanked_by := v_uid;
  end if;
  return new;
end;
$fn$;

revoke all on function app_private.fundraising_stamp_thanked_by() from public;

drop trigger if exists fundraising_payment_thanks_stamp on public.fundraising_payment_thanks;
create trigger fundraising_payment_thanks_stamp
before insert or update on public.fundraising_payment_thanks
for each row execute function app_private.fundraising_stamp_thanked_by();

alter table public.fundraising_payment_thanks enable row level security;

revoke all on table public.fundraising_payment_thanks from anon, authenticated;
grant select, insert, update, delete on table public.fundraising_payment_thanks to authenticated;
grant all on table public.fundraising_payment_thanks to service_role;

drop policy if exists "Fundraising module can read thanks" on public.fundraising_payment_thanks;
create policy "Fundraising module can read thanks"
on public.fundraising_payment_thanks for select to authenticated
using ((select app_private.has_module('fundraising')));

drop policy if exists "Fundraising module can add thanks" on public.fundraising_payment_thanks;
create policy "Fundraising module can add thanks"
on public.fundraising_payment_thanks for insert to authenticated
with check ((select app_private.has_module('fundraising')));

drop policy if exists "Fundraising module can edit thanks" on public.fundraising_payment_thanks;
create policy "Fundraising module can edit thanks"
on public.fundraising_payment_thanks for update to authenticated
using ((select app_private.has_module('fundraising')))
with check ((select app_private.has_module('fundraising')));

drop policy if exists "Fundraising module can delete thanks" on public.fundraising_payment_thanks;
create policy "Fundraising module can delete thanks"
on public.fundraising_payment_thanks for delete to authenticated
using ((select app_private.has_module('fundraising')));

alter table public.fundraising_payment_thanks replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fundraising_payment_thanks'
  ) then
    alter publication supabase_realtime add table public.fundraising_payment_thanks;
  end if;
end $$;

create or replace function public.fundraising_thanks_queue(
  p_days integer default 60,
  p_tz text default 'America/Chicago'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_tz text := coalesce(nullif(btrim(p_tz), ''), 'America/Chicago');
  v_days integer := least(greatest(coalesce(p_days, 60), 1), 366);
  v_today date;
  v_waiting integer;
  v_overdue integer;
  v_thanked30 integer;
  v_items jsonb;
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

  with q as (
    select z.id, z.created_at, z.net_cents, z.buyer_email,
      nullif(btrim(coalesce(z.buyer_first_name, '') || ' ' || coalesce(z.buyer_last_name, '')), '') as name,
      coalesce(pc.title, cc.title) as campaign_title,
      coalesce(z.campaign_category, pc.category, cc.category) as category,
      v_today - (z.created_at at time zone v_tz)::date as days_waiting
    from public.zeffy_gifts z
    left join public.zeffy_campaigns pc on pc.id = z.parent_campaign_id
    left join public.zeffy_campaigns cc on cc.id = z.campaign_id
    where z.created_at >= now() - make_interval(days => v_days)
      and (
        z.campaign_category in ('donation', 'peer_to_peer')
        or (z.campaign_category is null
            and coalesce(pc.category, cc.category) in ('DonationForm', 'PeerToPeerCampaign'))
      )
      and not exists (select 1 from public.fundraising_payment_thanks t where t.payment_id = z.id)
  ),
  counts as (
    select count(*)::int as waiting, count(*) filter (where q.days_waiting > 7)::int as overdue from q
  ),
  top as (
    select q.* from q order by q.created_at desc, q.id limit 200
  ),
  donor as (
    select g.buyer_email as email, count(*)::int as n, sum(g.net_cents)::bigint as lifetime
    from public.zeffy_gifts g
    where g.buyer_email in (select t.buyer_email from top t where t.buyer_email is not null)
    group by g.buyer_email
  )
  select c.waiting, c.overdue,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'payment_id', t.id,
        'created_at', t.created_at,
        'amount_cents', t.net_cents,
        'name', t.name,
        'email', t.buyer_email,
        'campaign_title', t.campaign_title,
        'category', t.category,
        'days_waiting', t.days_waiting,
        'overdue', t.days_waiting > 7,
        'donor_gift_count', d.n,
        'donor_lifetime_cents', d.lifetime,
        'owner_id', dp.owner_id
      ) order by t.created_at desc, t.id)
      from top t
      left join donor d on d.email = t.buyer_email
      left join public.fundraising_donor_profiles dp on dp.email = t.buyer_email
    ), '[]'::jsonb)
  into v_waiting, v_overdue, v_items
  from counts c;

  select count(*)::int into v_thanked30
  from public.fundraising_payment_thanks t
  where t.thanked_at >= now() - interval '30 days';

  return jsonb_build_object(
    'ok', true,
    'window_days', v_days,
    'waiting_count', v_waiting,
    'overdue_count', v_overdue,
    'thanked_last_30_days', v_thanked30,
    'items', v_items
  );
end;
$fn$;

revoke all on function public.fundraising_thanks_queue(integer, text) from public, anon;
grant execute on function public.fundraising_thanks_queue(integer, text) to authenticated, service_role;

-- Marks the given payments thanked. Idempotent: payments already thanked keep
-- their row; unknown payment ids are skipped. Returns how many were newly marked.
create or replace function public.fundraising_mark_thanked(
  p_payment_ids text[],
  p_method text default null,
  p_note text default null
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_n integer;
  v_method text := nullif(btrim(p_method), '');
begin
  if not coalesce((select app_private.has_module('fundraising')), false) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_method is not null and v_method not in ('email', 'call', 'text', 'note', 'in_person', 'other') then
    raise exception 'unknown method %', v_method using errcode = '22023';
  end if;

  insert into public.fundraising_payment_thanks (payment_id, method, note)
  select distinct p.id, v_method, nullif(btrim(p_note), '')
  from public.zeffy_payments p
  where p.id = any (coalesce(p_payment_ids, '{}'::text[]))
  on conflict (payment_id) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

revoke all on function public.fundraising_mark_thanked(text[], text, text) from public, anon;
grant execute on function public.fundraising_mark_thanked(text[], text, text) to authenticated, service_role;

-- ── 2. Monthly subcommittee updates ─────────────────────────────

create table if not exists public.fundraising_updates (
  id uuid primary key default gen_random_uuid(),
  subcommittee text not null check (subcommittee in ('events', 'grants', 'donors', 'upskilling')),
  month date not null check (month = date_trunc('month', month)::date),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subcommittee, month)
);

create index if not exists fundraising_updates_month_idx on public.fundraising_updates (month desc);
create index if not exists fundraising_updates_author_idx on public.fundraising_updates (author_id);

-- author_id = whoever last wrote the update (stamped on insert and update).
create or replace function app_private.fundraising_stamp_update_author()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  if v_uid is not null then
    new.author_id := v_uid;
  end if;
  return new;
end;
$fn$;

revoke all on function app_private.fundraising_stamp_update_author() from public;

drop trigger if exists fundraising_updates_stamp on public.fundraising_updates;
create trigger fundraising_updates_stamp
before insert or update on public.fundraising_updates
for each row execute function app_private.fundraising_stamp_update_author();

drop trigger if exists set_fundraising_updates_updated_at on public.fundraising_updates;
create trigger set_fundraising_updates_updated_at
before update on public.fundraising_updates
for each row execute function public.set_updated_at();

alter table public.fundraising_updates enable row level security;

revoke all on table public.fundraising_updates from anon, authenticated;
grant select, insert, update, delete on table public.fundraising_updates to authenticated;
grant all on table public.fundraising_updates to service_role;

drop policy if exists "Fundraising module can read updates" on public.fundraising_updates;
create policy "Fundraising module can read updates"
on public.fundraising_updates for select to authenticated
using ((select app_private.has_module('fundraising')));

drop policy if exists "Fundraising module can add updates" on public.fundraising_updates;
create policy "Fundraising module can add updates"
on public.fundraising_updates for insert to authenticated
with check ((select app_private.has_module('fundraising')));

drop policy if exists "Fundraising module can edit updates" on public.fundraising_updates;
create policy "Fundraising module can edit updates"
on public.fundraising_updates for update to authenticated
using ((select app_private.has_module('fundraising')))
with check ((select app_private.has_module('fundraising')));

drop policy if exists "Fundraising module can delete updates" on public.fundraising_updates;
create policy "Fundraising module can delete updates"
on public.fundraising_updates for delete to authenticated
using ((select app_private.has_module('fundraising')));

alter table public.fundraising_updates replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fundraising_updates'
  ) then
    alter publication supabase_realtime add table public.fundraising_updates;
  end if;
end $$;

-- ── 3. Needs-attention queue ────────────────────────────────────
-- Order: items with a past due_on (oldest first), then items with a due_on
-- (soonest first), then count items in a fixed kind order:
--   sync_stale, thanks_overdue, fundraisers_pending, outreach_to_contact,
--   lapsed_no_owner, update_missing, worksheet_not_sized
-- (per-subcommittee kinds in the order events, grants, donors, upskilling).

create or replace function public.fundraising_attention(p_tz text default 'America/Chicago')
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
  v_month_name text;
  v_live jsonb;
  v_queue jsonb;
  v_goals jsonb;
  v_cycle text;
  v_rollup jsonb;
  v_synced timestamptz;
  v_n integer;
  v_title text;
  v_items jsonb := '[]'::jsonb;
  v_ranked jsonb;
  r record;
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
  v_month_name := trim(to_char(v_today, 'FMMonth'));

  -- Lapsed donors and sync state use fundraising_live's own definitions.
  v_live := public.fundraising_live(v_tz);
  v_queue := public.fundraising_thanks_queue(60, v_tz);

  -- grant_deadline: one per open prospect with a next action due within 30 days or overdue.
  for r in
    select p.id, p.name, p.next_action, p.next_action_date
    from public.fundraising_prospects p
    where p.stage not in ('Declined', 'Received')
      and p.next_action_date is not null
      and p.next_action_date <= v_today + 30
    order by p.next_action_date, p.name, p.id
    limit 10
  loop
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'grant_deadline', 'subcommittee', 'grants', 'count', null,
      'title', r.name,
      'detail', nullif(btrim(r.next_action), ''),
      'due_on', r.next_action_date,
      'target', jsonb_build_object('tab', 'grants', 'subtab', 'pipeline', 'id', r.id),
      '_rank', 0));
  end loop;

  -- sync_stale
  v_synced := nullif(v_live->>'synced_at', '')::timestamptz;
  if v_synced is null or v_synced < now() - interval '30 minutes' then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'sync_stale', 'subcommittee', null, 'count', null,
      'title', 'Zeffy sync is behind',
      'detail', case when v_synced is null then 'No sync recorded yet.'
                     else 'Last synced ' || (extract(epoch from now() - v_synced) / 60)::int || ' minutes ago.' end,
      'due_on', null,
      'target', jsonb_build_object('tab', 'overview'),
      '_rank', 1));
  end if;

  -- thanks_overdue
  v_n := coalesce((v_queue->>'overdue_count')::int, 0);
  if v_n > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'thanks_overdue', 'subcommittee', 'donors', 'count', v_n,
      'title', v_n || case when v_n = 1 then ' gift' else ' gifts' end || ' waiting over a week for a thank-you',
      'detail', 'Thank donors within 7 days of their gift.',
      'due_on', null,
      'target', jsonb_build_object('tab', 'donors', 'subtab', 'thanks'),
      '_rank', 2));
  end if;

  -- fundraisers_pending: while a giving campaign is active (signups open or
  -- the campaign window running, and not yet ended).
  select count(*)::int, min(c.title) into v_n, v_title
  from public.giving_fundraisers f
  join public.giving_campaigns c on c.slug = f.campaign_slug
  where f.status = 'pending'
    and (c.ends_at is null or c.ends_at > now())
    and (c.signup_open or (c.starts_at is not null and c.starts_at <= now()));
  if v_n > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'fundraisers_pending', 'subcommittee', 'events', 'count', v_n,
      'title', v_n || case when v_n = 1 then ' fundraiser sign-up to approve' else ' fundraiser sign-ups to approve' end,
      'detail', v_title,
      'due_on', null,
      'target', jsonb_build_object('tab', 'events', 'subtab', 'giving'),
      '_rank', 3));
  end if;

  -- outreach_to_contact
  select count(*)::int into v_n
  from public.fundraising_outreach_items i
  join public.fundraising_outreach_campaigns c on c.id = i.campaign_id
  where i.status = 'to_contact' and c.status = 'active';
  if v_n > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'outreach_to_contact', 'subcommittee', 'donors', 'count', v_n,
      'title', v_n || case when v_n = 1 then ' outreach contact to reach' else ' outreach contacts to reach' end,
      'detail', 'On active outreach campaigns.',
      'due_on', null,
      'target', jsonb_build_object('tab', 'donors', 'subtab', 'outreach'),
      '_rank', 4));
  end if;

  -- lapsed_no_owner: of the top 25 lapsed donors (fundraising_live order).
  select count(*)::int into v_n
  from (
    select l.value->>'email' as email
    from jsonb_array_elements(coalesce(v_live->'lapsed', '[]'::jsonb)) with ordinality l(value, ord)
    order by l.ord
    limit 25
  ) top25
  left join public.fundraising_donor_profiles dp on dp.email = top25.email
  where dp.owner_id is null;
  if v_n > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'lapsed_no_owner', 'subcommittee', 'donors', 'count', v_n,
      'title', v_n || case when v_n = 1 then ' lapsed donor has no owner' else ' lapsed donors have no owner' end,
      'detail', 'Among the top 25 who gave last year but not yet this year.',
      'due_on', null,
      'target', jsonb_build_object('tab', 'donors', 'subtab', 'lapsed'),
      '_rank', 5));
  end if;

  -- update_missing: from the 20th of the month on.
  if extract(day from v_today) >= 20 then
    for r in
      select s.id, s.label, s.ord
      from (values ('events', 'Events', 1), ('grants', 'Grants', 2), ('donors', 'Donors', 3), ('upskilling', 'Upskilling', 4))
        as s(id, label, ord)
      where not exists (
        select 1 from public.fundraising_updates u where u.subcommittee = s.id and u.month = v_month)
      order by s.ord
    loop
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'kind', 'update_missing', 'subcommittee', r.id, 'count', null,
        'title', 'No ' || r.label || ' update for ' || v_month_name || ' yet',
        'detail', 'Post a short monthly update for the board.',
        'due_on', null,
        'target', jsonb_build_object('tab', r.id),
        '_rank', 6 + r.ord / 10.0));
    end loop;
  end if;

  -- worksheet_not_sized: cycle = nearest goal year (>= this year) in
  -- app_settings.fundraising_goals, else next calendar year.
  select s.value into v_goals from public.app_settings s where s.key = 'fundraising_goals';
  begin
    if jsonb_typeof(v_goals) = 'string' then
      v_goals := (v_goals #>> '{}')::jsonb;
    end if;
    if jsonb_typeof(v_goals) = 'object' then
      select min(k) into v_cycle
      from jsonb_object_keys(v_goals) k
      where k ~ '^[0-9]{4}$' and k::int >= extract(year from v_today)::int;
    end if;
  exception when others then
    v_cycle := null;
  end;
  v_cycle := coalesce(v_cycle, (extract(year from v_today)::int + 1)::text);

  v_rollup := public.fundraising_goal_rollup(v_cycle);
  for r in
    select s.value as j, s.ord
    from jsonb_array_elements(coalesce(v_rollup->'subcommittees', '[]'::jsonb)) with ordinality s(value, ord)
    where not coalesce((s.value->>'filled')::boolean, false)
    order by s.ord
  loop
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'kind', 'worksheet_not_sized', 'subcommittee', r.j->>'id', 'count', null,
      'title', initcap(r.j->>'id') || ' worksheet not sized for ' || v_cycle,
      'detail', case when r.j->>'id' = 'upskilling'
                     then 'Add realistic people targets in Size your share.'
                     else 'Add a realistic amount in Size your share.' end,
      'due_on', null,
      'target', jsonb_build_object('tab', r.j->>'id', 'subtab', 'worksheet'),
      '_rank', 7 + r.ord / 10.0));
  end loop;

  select coalesce(jsonb_agg(i.value - '_rank' order by
      case when i.value->>'due_on' is not null and (i.value->>'due_on')::date < v_today then 0
           when i.value->>'due_on' is not null then 1
           else 2 end,
      (i.value->>'due_on')::date nulls last,
      (i.value->>'_rank')::numeric,
      i.ord), '[]'::jsonb)
  into v_ranked
  from jsonb_array_elements(v_items) with ordinality i(value, ord);

  return jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'today', v_today,
    'cycle', v_cycle,
    'items', v_ranked
  );
end;
$fn$;

revoke all on function public.fundraising_attention(text) from public, anon;
grant execute on function public.fundraising_attention(text) to authenticated, service_role;
