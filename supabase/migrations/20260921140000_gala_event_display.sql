-- Gala live display: runtime state, the public aggregate guest phones poll, the
-- keyed name feed the projector reads, and the clerk-side edit / retract / void
-- path. Second half of the gala event stack; 20260921120000_gala_event_checkin.sql
-- is the backbone and every convention here comes from it (zero-grant tables with
-- RLS on, SECURITY DEFINER RPCs as the only client surface, jsonb {ok, reason}
-- instead of raised errors, op_id idempotency, gala_checkin_lock on every write,
-- gala_checkin_bump for the version and the doorbell).
--
-- WHY THIS EXISTS. Three things the first migration deliberately left open:
--
--   1. RUNTIME CONTROL. Goal, giving levels, scene, the names toggle and the 3D
--      kill switch must be changeable on the night without a deploy, because a
--      push to main is production and GitHub Pages has taken 75 minutes to go
--      live (09 s4.1). They live in one row per event, written only by an admin
--      session through a validated whitelist, read by everyone through an RPC.
--
--   2. TWO AUDIENCES, TWO SHAPES. A guest's phone gets numbers and nothing else:
--      gala_display_public is anon, takes no secret, and can never emit a name.
--      The projector gets names, but only when the page is opened with a display
--      key in the URL fragment (09 R15). There is no shape in between, so a
--      screenshot of a guest's phone can never contain a donor.
--
--   3. UNDO THAT REACHES THE SCREEN. A fat-fingered $50,000 must be catchable
--      before the room sees it, and removable after (09 R5). Gifts therefore
--      carry publish_at (now + publish_delay_ms, default 4 s) and are invisible
--      to both readers until it passes; retract hides a published gift and keeps
--      the money; void is a soft, reasoned removal. Nothing is ever hard deleted.
--
-- THE CURSOR. The display must never replay a celebration after a reload and
-- never drop a name when several gifts land in the same millisecond (05 s4.5).
-- Timestamps cannot do this and neither can the identity column: two concurrent
-- inserts can take ids 10 and 11 and commit in the other order, so a reader that
-- remembers "max id 11" loses 10 for ever. Instead every donation row carries
--
--   seq  a per-event counter assigned once, at insert, under gala_checkin_lock.
--        It is the gift's identity on the wire. It never changes.
--   chg  the stream position of the row's most recent visible change. Equal to
--        seq at insert; a later edit, retract or void moves it to the head.
--
-- Both are handed out under the same per-event advisory lock every mutation
-- already takes, so they are strictly monotonic in COMMIT order, and a unique
-- index on each is the backstop. The feed cursor is a chg, which is why an edit
-- made after a gift was shown comes back down the same pipe as a correction
-- (05 s4.4) instead of being lost behind the cursor.
--
-- THE WATERMARK. A cursor must never step over a gift that is merely waiting for
-- its publish delay. Every feed read therefore stops at
--   v_max = min(chg of the oldest not-yet-due live gift) - 1,
-- so a delayed gift holds the cursor until it is due, and is then delivered in
-- order. This is the one rule that makes "4 s undo" and "never drop a name"
-- coexist.
--
-- NOT TOUCHED HERE: the 2025 archive (public.gala_guests / public.gala_donations)
-- and its anon-readable gala_donations_public view. gala_display_public replaces
-- that view as the public source of totals; the freeze and the revoke are staged
-- separately in 20260921150000_gala_2025_archive_freeze.sql.pending, because the
-- legacy /admin/gala UI still writes to those tables.

-- 1) Additive columns on the donations table -----------------------------------
-- The first migration owns this table and stays re-runnable, so everything here
-- is add-column-if-not-exists. No existing column changes type or meaning, and
-- gala_donation_add keeps its exact signature and behaviour.

alter table public.gala_event_donations
  add column if not exists seq bigint,
  add column if not exists chg bigint,
  add column if not exists publish_at timestamptz,
  add column if not exists anonymous boolean not null default false,
  add column if not exists retracted_at timestamptz,
  add column if not exists retracted_by text,
  add column if not exists retract_reason text,
  add column if not exists void_reason text,
  add column if not exists resolved_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by text;

-- Gifts that are not a paddle raise: a lead gift keyed before doors, a sponsor
-- cheque handed over at the table, the winning auction bid, a match pledge.
-- Superset of the first migration's list, so no existing row can be rejected.
alter table public.gala_event_donations
  drop constraint if exists gala_event_donations_kind_check;
alter table public.gala_event_donations
  add constraint gala_event_donations_kind_check
  check (kind in ('pledge', 'cash', 'card', 'online', 'ticket', 'other',
                  'seed', 'sponsor', 'auction', 'match'));

-- Backfill BEFORE the stream trigger exists, so it cannot renumber what it is
-- about to protect. Matches zero rows on every later run.
update public.gala_event_donations d
   set seq = n.rn,
       chg = n.rn,
       publish_at = coalesce(d.publish_at, d.created_at)
  from (
    select id, row_number() over (partition by event_slug order by created_at, id) as rn
    from public.gala_event_donations
    where seq is null
  ) n
 where d.id = n.id and d.seq is null;

-- The backstops. Under gala_checkin_lock a collision is unreachable; these make
-- it unrepresentable, the same way the paddle indexes do in the first migration.
create unique index if not exists gala_event_donations_seq_idx
  on public.gala_event_donations (event_slug, seq);
create unique index if not exists gala_event_donations_chg_idx
  on public.gala_event_donations (event_slug, chg);
-- The one index the public aggregate and the feed both ride.
create index if not exists gala_event_donations_live_idx
  on public.gala_event_donations (event_slug, publish_at)
  where voided_at is null and retracted_at is null and not hidden;

-- 2) Display / runtime state ---------------------------------------------------
-- One row per event. Zero grants, RLS on: read through gala_display_public or
-- gala_display_feed, written only through gala_display_set.

create table if not exists public.gala_event_display (
  event_slug text primary key,

  -- What the room is looking at. Orthogonal to the gift choreography (05 s4.6).
  scene text not null default 'ambient'
    check (scene in ('ambient', 'program', 'appeal', 'auction', 'finale', 'thanks', 'blackout')),

  -- Money, in cents, always. numeric dollars are returned alongside for the
  -- client, but the authoritative numbers on the wire are integers.
  goal_cents bigint not null default 0 check (goal_cents >= 0),
  baseline_cents bigint not null default 0 check (baseline_cents >= 0),
  total_override_cents bigint check (total_override_cents is null or total_override_cents >= 0),

  -- all    every live gift counts toward the number on the wall
  -- appeal only gifts carrying a round_key (the paddle raise) count
  -- manual the wall shows total_override_cents: the operator's "T" key, used
  --        when the room must not watch a number move while a mistake is fixed
  count_mode text not null default 'all' check (count_mode in ('all', 'appeal', 'manual')),

  -- [{amount_cents, impact_line}] - the ask ladder, in order.
  levels jsonb not null default '[]'::jsonb,
  current_level_cents bigint check (current_level_cents is null or current_level_cents >= 0),

  -- Gift tier edges in cents (05 s4.2 defaults: $250 / $1,000 / $5,000).
  tier_cents integer[] not null default '{25000,100000,500000}',

  show_names boolean not null default true,
  fx_mode text not null default 'full' check (fx_mode in ('full', 'lite', 'off')),

  -- The undo window. A gift is invisible to every reader until now() passes
  -- created_at + this (09 R5).
  publish_delay_ms integer not null default 4000
    check (publish_delay_ms between 0 and 60000),
  confirm_threshold_cents bigint not null default 250000 check (confirm_threshold_cents >= 0),

  -- {active, label, unlock_at_count, unlock_at_amount_cents, amount_cents}
  match jsonb not null default '{"active": false}'::jsonb,
  -- {lot, title, image_url, current_bid_cents, paddle, status}. Numbers and an
  -- item title only: this object is served to anon, so it can never hold a name.
  auction jsonb not null default '{}'::jsonb,
  -- {goal_cents, label, active}
  stretch jsonb not null default '{}'::jsonb,

  message text not null default '' check (char_length(message) <= 300),
  hold boolean not null default false,
  poll_ms integer not null default 10000 check (poll_ms between 1000 and 120000),

  -- The remote "turn it off and on again" (09 s4.3).
  reload_nonce text not null default '' check (char_length(reload_nonce) <= 40),
  min_client_version text not null default '' check (char_length(min_client_version) <= 40),

  -- One-shot operator cues. Row based, not broadcast, so a dropped realtime
  -- message cannot lose one; cue_seq is what stops a reload re-firing it.
  cue jsonb,
  cue_seq bigint not null default 0,

  -- Anything the display wants that is not worth a column.
  config jsonb not null default '{}'::jsonb,

  -- sha256 of the display key. The key itself is never stored.
  key_hash bytea,
  key_set_at timestamptz,

  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  constraint gala_event_display_slug_check check (char_length(event_slug) between 1 and 80),
  constraint gala_event_display_levels_check check (jsonb_typeof(levels) = 'array'),
  constraint gala_event_display_match_check check (jsonb_typeof(match) = 'object'),
  constraint gala_event_display_auction_check check (jsonb_typeof(auction) = 'object'),
  constraint gala_event_display_stretch_check check (jsonb_typeof(stretch) = 'object'),
  constraint gala_event_display_config_check check (jsonb_typeof(config) = 'object'),
  constraint gala_event_display_tiers_check check (coalesce(array_length(tier_cents, 1), 0) <= 8)
);

-- 3) RLS + grants --------------------------------------------------------------

alter table public.gala_event_display enable row level security;
revoke all on table public.gala_event_display from anon, authenticated, service_role;

-- 4) The stream: seq, chg, publish_at, and the doorbell ------------------------

create or replace function public.gala_event_donations_stream()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_next bigint;
  v_delay integer;
begin
  if tg_op = 'INSERT' then
    -- Assigned under the caller's gala_checkin_lock, so monotonic in commit
    -- order. The unique indexes catch a hand-run insert that skipped the lock.
    select coalesce(max(d.chg), 0) + 1 into v_next
    from public.gala_event_donations d
    where d.event_slug = new.event_slug;

    new.seq := v_next;
    new.chg := v_next;

    if new.publish_at is null then
      select dd.publish_delay_ms into v_delay
      from public.gala_event_display dd
      where dd.event_slug = new.event_slug;
      new.publish_at := coalesce(new.created_at, now())
        + make_interval(secs => coalesce(v_delay, 4000) / 1000.0);
    end if;

    new.updated_at := coalesce(new.created_at, now());
    perform public.gala_checkin_bump(new.event_slug);
    return new;
  end if;

  -- UPDATE. seq is the gift's identity: it never moves.
  new.seq := old.seq;

  -- Only a change a reader can see moves the stream. Comparing the whole row
  -- (minus the two bookkeeping columns) means a column added later is covered
  -- without anyone remembering to extend a list.
  if (to_jsonb(new) - 'chg' - 'updated_at') is distinct from (to_jsonb(old) - 'chg' - 'updated_at') then
    select coalesce(max(d.chg), 0) + 1 into v_next
    from public.gala_event_donations d
    where d.event_slug = new.event_slug;

    new.chg := v_next;
    new.updated_at := now();
    perform public.gala_checkin_bump(new.event_slug);
  else
    new.chg := old.chg;
  end if;

  return new;
end;
$fn$;

drop trigger if exists gala_event_donations_stream on public.gala_event_donations;
create trigger gala_event_donations_stream
  before insert or update on public.gala_event_donations
  for each row execute function public.gala_event_donations_stream();

-- The first migration's purge deletes the access row last. Hanging the display
-- row and the display-key throttle off that delete means the existing
-- gala_checkin_archive_and_purge stays the one teardown command, and a re-run of
-- the first migration cannot undo it.
create or replace function public.gala_event_access_cascade()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  delete from public.gala_event_display where event_slug = old.event_slug;
  delete from public.gala_event_attempts where event_slug = 'display:' || old.event_slug;
  return old;
end;
$fn$;

drop trigger if exists gala_event_access_cascade on public.gala_event_access;
create trigger gala_event_access_cascade
  after delete on public.gala_event_access
  for each row execute function public.gala_event_access_cascade();

-- 5) Internal helpers (never granted to a Data API role) -----------------------

create or replace function public.gala_display_tier(p_cents bigint, p_tiers integer[])
returns integer
language sql
immutable
set search_path = pg_catalog, pg_temp
as $fn$
  select 1 + (
    select count(*)::integer
    from unnest(coalesce(p_tiers, '{}'::integer[])) t
    where coalesce(p_cents, 0) >= t
  )
$fn$;

-- donor_name, else the household's party_label, else "Anonymous" (06 s13).
-- paddle_group is NEVER returned: it can be a buyer email.
create or replace function public.gala_display_donor_name(
  p_event text,
  p_donor_name text,
  p_guest_id text,
  p_group text
)
returns text
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(
    nullif(btrim(coalesce(p_donor_name, '')), ''),
    nullif(btrim(coalesce((
      select g.party_label from public.gala_event_guests g
      where g.event_slug = p_event and g.id = p_guest_id
    ), '')), ''),
    nullif(btrim(coalesce((
      select g.party_label from public.gala_event_guests g
      where g.event_slug = p_event and g.paddle_group = p_group and g.removed_at is null
      order by g.id
      limit 1
    ), '')), ''),
    'Anonymous'
  )
$fn$;

create or replace function public.gala_display_ensure(p_event text)
returns public.gala_event_display
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_row public.gala_event_display%rowtype;
begin
  insert into public.gala_event_display (event_slug)
  values (p_event)
  on conflict (event_slug) do nothing;

  select * into v_row from public.gala_event_display d where d.event_slug = p_event;
  return v_row;
end;
$fn$;

-- THE public aggregate, as one object. Built once here and reused by both
-- readers so the projector and a guest's phone can never disagree about the
-- number, only about whether names come with it.
create or replace function public.gala_display_public_json(p_event text)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_d public.gala_event_display%rowtype;
  v_agg record;
  v_ver bigint;
  v_total bigint;
  v_count integer;
begin
  select * into v_d from public.gala_event_display d where d.event_slug = p_event;

  if not found then
    -- Unknown, closed or purged: a harmless shape with every number at zero and
    -- the scene dark. Never an error, never a hint that the slug is wrong.
    return jsonb_build_object(
      'ok', true, 'live', false, 'event', p_event,
      'scene', 'blackout',
      'total_cents', 0, 'total', 0::numeric, 'gift_count', 0,
      'goal_cents', 0, 'goal', 0::numeric, 'percent', 0::numeric,
      'count_mode', 'all',
      'current_level_cents', null, 'current_level', null,
      'levels', '[]'::jsonb, 'tier_cents', '[]'::jsonb,
      'show_names', false, 'fx_mode', 'off',
      'publish_delay_ms', 4000, 'confirm_threshold_cents', 0,
      'match', jsonb_build_object('active', false),
      'auction', '{}'::jsonb, 'stretch', '{}'::jsonb,
      'message', '', 'hold', false, 'poll_ms', 10000,
      'reload_nonce', '', 'min_client_version', '',
      'cue', null, 'cue_seq', 0, 'config', '{}'::jsonb,
      'version', 0, 'server_time', clock_timestamp()
    );
  end if;

  -- One pass. Everything the room sees is decided by this scan: nothing voided,
  -- nothing retracted, nothing hidden, nothing still inside its publish delay.
  select
    coalesce(sum(round(d.amount * 100)), 0)::bigint as cents,
    count(*)::integer as n,
    coalesce(sum(round(d.amount * 100)) filter (where d.round_key is not null), 0)::bigint as appeal_cents,
    count(*) filter (where d.round_key is not null)::integer as appeal_n
  into v_agg
  from public.gala_event_donations d
  where d.event_slug = p_event
    and d.voided_at is null
    and d.retracted_at is null
    and not d.hidden
    and coalesce(d.publish_at, d.created_at) <= now();

  if v_d.count_mode = 'manual' then
    v_total := coalesce(v_d.total_override_cents, v_d.baseline_cents + v_agg.cents);
    v_count := v_agg.n;
  elsif v_d.count_mode = 'appeal' then
    v_total := v_d.baseline_cents + v_agg.appeal_cents;
    v_count := v_agg.appeal_n;
  else
    v_total := v_d.baseline_cents + v_agg.cents;
    v_count := v_agg.n;
  end if;

  select coalesce(max(s.version), 0) into v_ver
  from public.gala_event_state s where s.event_slug = p_event;

  return jsonb_build_object(
    'ok', true, 'live', true, 'event', p_event,
    'scene', v_d.scene,
    'total_cents', v_total,
    'total', round(v_total / 100.0, 2),
    'gift_count', v_count,
    'goal_cents', v_d.goal_cents,
    'goal', round(v_d.goal_cents / 100.0, 2),
    'percent', case when v_d.goal_cents > 0
      then round((v_total * 100.0) / v_d.goal_cents, 2) else 0::numeric end,
    'count_mode', v_d.count_mode,
    'current_level_cents', v_d.current_level_cents,
    'current_level', case when v_d.current_level_cents is not null
      then round(v_d.current_level_cents / 100.0, 2) end,
    'levels', v_d.levels,
    'tier_cents', to_jsonb(v_d.tier_cents),
    'show_names', v_d.show_names,
    'fx_mode', v_d.fx_mode,
    'publish_delay_ms', v_d.publish_delay_ms,
    'confirm_threshold_cents', v_d.confirm_threshold_cents,
    'match', v_d.match,
    'auction', v_d.auction,
    'stretch', v_d.stretch,
    'message', v_d.message,
    'hold', v_d.hold,
    'poll_ms', v_d.poll_ms,
    'reload_nonce', v_d.reload_nonce,
    'min_client_version', v_d.min_client_version,
    'cue', v_d.cue,
    'cue_seq', v_d.cue_seq,
    'config', v_d.config,
    'version', v_ver,
    'server_time', clock_timestamp()
  );
end;
$fn$;

-- The clerk-side view of one gift: real names, who keyed it, every flag. Behind
-- a session token, never anon.
create or replace function public.gala_donation_clerk_json(
  p_event text,
  p_since bigint,
  p_limit integer,
  p_id bigint default null
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'seq', d.seq,
    'chg', d.chg,
    'amount', d.amount,
    'amount_cents', round(d.amount * 100)::bigint,
    'kind', d.kind,
    'round_key', d.round_key,
    'paddle_number', d.paddle_number,
    'called_number', d.called_number,
    'guest_name', (
      select g.name from public.gala_event_guests g
      where g.event_slug = d.event_slug and g.id = d.guest_id
    ),
    'display_name', public.gala_display_donor_name(d.event_slug, d.donor_name, d.guest_id, d.paddle_group),
    'donor_name', d.donor_name,
    'anonymous', d.anonymous,
    'hidden', d.hidden,
    'needs_review', d.needs_review,
    'note', d.note,
    'entered_by', d.entered_by,
    'created_at', d.created_at,
    'publish_at', d.publish_at,
    'published', coalesce(d.publish_at, d.created_at) <= now(),
    'retracted_at', d.retracted_at,
    'retracted_by', d.retracted_by,
    'retract_reason', d.retract_reason,
    'voided_at', d.voided_at,
    'voided_by', d.voided_by,
    'void_reason', d.void_reason,
    'updated_at', d.updated_at,
    'updated_by', d.updated_by,
    'live', d.voided_at is null and d.retracted_at is null and not d.hidden
  ) order by d.chg), '[]'::jsonb)
  from (
    select * from public.gala_event_donations x
    where x.event_slug = p_event
      and (p_id is null or x.id = p_id)
      and (p_id is not null or x.chg > coalesce(p_since, 0))
    order by x.chg
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
  ) d
$fn$;

-- Per-level tally for the clerk tape: "$1,000 - 9 paddles" (08 s7.2).
create or replace function public.gala_donation_rounds_json(p_event text)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(jsonb_object_agg(r.round_key, jsonb_build_object(
    'gifts', r.n, 'total_cents', r.cents, 'paddles', r.paddles
  )), '{}'::jsonb)
  from (
    select round_key,
           count(*)::integer as n,
           coalesce(sum(round(amount * 100)), 0)::bigint as cents,
           count(distinct coalesce(paddle_number, called_number))::integer as paddles
    from public.gala_event_donations
    where event_slug = p_event and round_key is not null and voided_at is null
    group by round_key
  ) r
$fn$;

-- Resolve "paddle 42" to a household and a primary guest, exactly the way
-- gala_donation_add does, so an edit freezes the same answer an entry would.
create or replace function public.gala_donation_resolve(
  p_event text,
  p_number integer,
  out paddle_number integer,
  out paddle_group text,
  out guest_id text,
  out status text
)
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_pad public.gala_event_paddles%rowtype;
begin
  if p_number is null then
    return;
  end if;

  select * into v_pad from public.gala_event_paddles p
  where p.event_slug = p_event and p.paddle_number = p_number;

  paddle_number := v_pad.paddle_number;   -- null when the number is not in the pool
  paddle_group := v_pad.paddle_group;
  status := v_pad.status;

  if v_pad.paddle_group is not null then
    select g.id into guest_id from public.gala_event_guests g
    where g.event_slug = p_event and g.paddle_group = v_pad.paddle_group and g.removed_at is null
    order by (g.name = g.buyer_name) desc, g.checked_in_at nulls last, g.id
    limit 1;
  end if;
end;
$fn$;

-- What every clerk-side mutation answers with.
create or replace function public.gala_donation_result(
  p_event text,
  p_id bigint,
  p_outcome text,
  p_replayed boolean,
  p_version bigint
)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'ok', true,
    'outcome', p_outcome,
    'replayed', p_replayed,
    'version', p_version,
    'donation_id', p_id,
    'donation', coalesce(public.gala_donation_clerk_json(p_event, null, 1, p_id) -> 0, 'null'::jsonb)
  )
$fn$;

-- 6) Public RPC: the guest phone aggregate -------------------------------------
-- anon, no token, no names, one row out. This is what replaces anon access to
-- the 2025 gala_donations_public view.

create or replace function public.gala_display_public(p_event text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
begin
  if v_event = '' or char_length(v_event) > 80 then
    return public.gala_display_public_json('');
  end if;
  return public.gala_display_public_json(v_event);
end;
$fn$;

-- 7) Public RPC: the keyed display feed ----------------------------------------
-- Names, with a cursor. The key travels in the page's URL fragment, so it never
-- reaches a server log. A wrong key gets exactly the guest-phone shape: the
-- refusal is indistinguishable from an event that has no key set.

create or replace function public.gala_display_feed(
  p_event text,
  p_display_key text default null,
  p_cursor bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_key text := coalesce(p_display_key, '');
  v_d public.gala_event_display%rowtype;
  v_state jsonb;
  v_named boolean := false;
  v_cur bigint := greatest(coalesce(p_cursor, 0), 0);
  v_head bigint;
  v_block bigint;
  v_max bigint;
  v_gifts jsonb;
  v_retr jsonb;
  v_rows integer;
  v_last bigint;
  v_ip text;
  v_fail_ip integer;
  v_fail_all integer;
begin
  select * into v_d from public.gala_event_display d where d.event_slug = v_event;
  v_state := public.gala_display_public_json(v_event);

  -- Fast path first: a correct key costs one sha256 and no extra query, because
  -- the projector calls this every few seconds all night.
  if v_d.key_hash is not null
     and char_length(v_key) between 8 and 128
     and v_d.key_hash = extensions.digest(v_key, 'sha256') then
    v_named := true;
  elsif v_key <> '' then
    -- Wrong key. Same throttle as the passcode gate, in its OWN namespace
    -- ('display:<slug>'), so guessing the display key can never lock the door
    -- staff out of check-in (09 R20).
    v_ip := public.gala_checkin_client_ip();

    if random() < 0.05 then
      delete from public.gala_event_attempts where at < now() - interval '1 day';
    end if;

    select count(*) filter (where a.ip_hash = v_ip), count(*)
      into v_fail_ip, v_fail_all
    from public.gala_event_attempts a
    where a.event_slug = 'display:' || v_event and a.at > now() - interval '10 minutes';

    if v_fail_ip < 10 and v_fail_all < 60 then
      insert into public.gala_event_attempts (event_slug, ip_hash) values ('display:' || v_event, v_ip);
    end if;
    perform pg_catalog.pg_sleep(0.25);
  end if;

  if not v_named then
    return v_state || jsonb_build_object(
      'named', false, 'gifts', '[]'::jsonb, 'retractions', '[]'::jsonb, 'cursor', 0
    );
  end if;

  -- A correct key clears this address's failures, so a fat-fingered paste
  -- followed by the right key does not leave a lockout behind.
  if exists (
    select 1 from public.gala_event_attempts a where a.event_slug = 'display:' || v_event
  ) then
    delete from public.gala_event_attempts a
    where a.event_slug = 'display:' || v_event
      and a.ip_hash = public.gala_checkin_client_ip();
  end if;

  select coalesce(max(d.chg), 0) into v_head
  from public.gala_event_donations d where d.event_slug = v_event;

  -- THE WATERMARK. Stop one short of the oldest gift that is still inside its
  -- publish delay, so the cursor can never step over it.
  select min(d.chg) - 1 into v_block
  from public.gala_event_donations d
  where d.event_slug = v_event
    and d.chg > v_cur
    and coalesce(d.publish_at, d.created_at) > now()
    and d.voided_at is null
    and d.retracted_at is null
    and not d.hidden;

  v_max := least(coalesce(v_block, v_head), v_head);

  with win as (
    select d.* from public.gala_event_donations d
    where d.event_slug = v_event and d.chg > v_cur and d.chg <= v_max
    order by d.chg
    limit 400
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'seq', w.seq,
      'chg', w.chg,
      'amount', w.amount,
      'amount_cents', round(w.amount * 100)::bigint,
      'display_name', case
        when w.anonymous or not v_d.show_names then 'Anonymous'
        else public.gala_display_donor_name(v_event, w.donor_name, w.guest_id, w.paddle_group)
      end,
      'tier', public.gala_display_tier(round(w.amount * 100)::bigint, v_d.tier_cents),
      'anonymous', w.anonymous or not v_d.show_names,
      'kind', w.kind,
      'paddle', coalesce(w.paddle_number, w.called_number),
      'needs_review', w.needs_review,
      'round_key', w.round_key,
      'at', w.created_at
    ) order by w.chg) filter (
      where w.voided_at is null and w.retracted_at is null and not w.hidden
    ), '[]'::jsonb),
    -- A gift killed INSIDE its publish delay was never on the screen, so it is
    -- consumed silently: no gift, no retraction. That is the 4 s undo (09 R5).
    coalesce(jsonb_agg(w.seq order by w.chg) filter (
      where (w.voided_at is not null or w.retracted_at is not null)
        and coalesce(w.publish_at, w.created_at) <= now()
    ), '[]'::jsonb),
    count(*)::integer,
    max(w.chg)
  into v_gifts, v_retr, v_rows, v_last
  from win w;

  -- A truncated page resumes exactly where it stopped; otherwise the cursor goes
  -- to the watermark, which is the whole point of computing it.
  return v_state || jsonb_build_object(
    'named', true,
    'gifts', v_gifts,
    'retractions', v_retr,
    'cursor', greatest(v_cur, case when v_rows >= 400 then coalesce(v_last, v_max) else v_max end)
  );
end;
$fn$;

-- 8) Public RPC: operator control ----------------------------------------------

create or replace function public.gala_display_set(
  p_event text,
  p_token text,
  p_op_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_allowed text[] := array[
    'scene', 'goal_cents', 'baseline_cents', 'total_override_cents', 'count_mode',
    'levels', 'current_level_cents', 'tier_cents', 'show_names', 'fx_mode',
    'publish_delay_ms', 'confirm_threshold_cents', 'match', 'auction', 'stretch',
    'message', 'hold', 'poll_ms', 'reload_nonce', 'min_client_version', 'cue', 'config'
  ];
  v_fields text[];
  v_ver bigint;
  v_bad text;
  v_levels jsonb;
  v_tiers integer[];
  v_match jsonb;
  v_auction jsonb;
  v_stretch jsonb;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if v_auth.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-patch');
  end if;

  select array_agg(k order by k) into v_fields
  from jsonb_object_keys(p_patch) k where k = any (v_allowed);

  if v_fields is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing-to-change');
  end if;

  -- Everything that can say no is decided BEFORE the first write.
  if p_patch ? 'scene' and coalesce(p_patch ->> 'scene', '') not in
     ('ambient', 'program', 'appeal', 'auction', 'finale', 'thanks', 'blackout') then
    v_bad := 'scene';
  elsif p_patch ? 'count_mode' and coalesce(p_patch ->> 'count_mode', '') not in ('all', 'appeal', 'manual') then
    v_bad := 'count_mode';
  elsif p_patch ? 'fx_mode' and coalesce(p_patch ->> 'fx_mode', '') not in ('full', 'lite', 'off') then
    v_bad := 'fx_mode';
  elsif p_patch ? 'goal_cents' and (p_patch ->> 'goal_cents') !~ '^[0-9]{1,12}$' then
    v_bad := 'goal_cents';
  elsif p_patch ? 'baseline_cents' and (p_patch ->> 'baseline_cents') !~ '^[0-9]{1,12}$' then
    v_bad := 'baseline_cents';
  elsif p_patch ? 'total_override_cents'
        and jsonb_typeof(p_patch -> 'total_override_cents') <> 'null'
        and (p_patch ->> 'total_override_cents') !~ '^[0-9]{1,12}$' then
    v_bad := 'total_override_cents';
  elsif p_patch ? 'current_level_cents'
        and jsonb_typeof(p_patch -> 'current_level_cents') <> 'null'
        and (p_patch ->> 'current_level_cents') !~ '^[0-9]{1,12}$' then
    v_bad := 'current_level_cents';
  elsif p_patch ? 'confirm_threshold_cents' and (p_patch ->> 'confirm_threshold_cents') !~ '^[0-9]{1,12}$' then
    v_bad := 'confirm_threshold_cents';
  elsif p_patch ? 'publish_delay_ms' and (
        (p_patch ->> 'publish_delay_ms') !~ '^[0-9]{1,6}$'
        or (p_patch ->> 'publish_delay_ms')::integer > 60000) then
    v_bad := 'publish_delay_ms';
  elsif p_patch ? 'poll_ms' and (
        (p_patch ->> 'poll_ms') !~ '^[0-9]{1,6}$'
        or (p_patch ->> 'poll_ms')::integer not between 1000 and 120000) then
    v_bad := 'poll_ms';
  elsif p_patch ? 'show_names' and jsonb_typeof(p_patch -> 'show_names') <> 'boolean' then
    v_bad := 'show_names';
  elsif p_patch ? 'hold' and jsonb_typeof(p_patch -> 'hold') <> 'boolean' then
    v_bad := 'hold';
  elsif p_patch ? 'levels' and jsonb_typeof(p_patch -> 'levels') <> 'array' then
    v_bad := 'levels';
  elsif p_patch ? 'tier_cents' and jsonb_typeof(p_patch -> 'tier_cents') <> 'array' then
    v_bad := 'tier_cents';
  elsif p_patch ? 'match' and jsonb_typeof(p_patch -> 'match') <> 'object' then
    v_bad := 'match';
  elsif p_patch ? 'auction' and jsonb_typeof(p_patch -> 'auction') <> 'object' then
    v_bad := 'auction';
  elsif p_patch ? 'stretch' and jsonb_typeof(p_patch -> 'stretch') <> 'object' then
    v_bad := 'stretch';
  elsif p_patch ? 'config' and jsonb_typeof(p_patch -> 'config') <> 'object' then
    v_bad := 'config';
  elsif p_patch ? 'cue' and jsonb_typeof(p_patch -> 'cue') not in ('object', 'null') then
    v_bad := 'cue';
  elsif p_patch ? 'message' and char_length(coalesce(p_patch ->> 'message', '')) > 300 then
    v_bad := 'message';
  elsif p_patch ? 'config' and pg_column_size(p_patch -> 'config') > 8192 then
    v_bad := 'config';
  end if;

  if v_bad is not null then
    return jsonb_build_object('ok', false, 'reason', 'invalid-patch', 'field', v_bad);
  end if;

  -- levels: rebuilt, not trusted. At most 24 rungs, an integer amount and a
  -- short line of copy each.
  if p_patch ? 'levels' then
    if jsonb_array_length(p_patch -> 'levels') > 24 then
      return jsonb_build_object('ok', false, 'reason', 'invalid-patch', 'field', 'levels');
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'amount_cents', case when (e ->> 'amount_cents') ~ '^[0-9]{1,12}$' then (e ->> 'amount_cents')::bigint else 0 end,
      'impact_line', left(coalesce(e ->> 'impact_line', ''), 120)
    ) order by ord), '[]'::jsonb)
    into v_levels
    from jsonb_array_elements(p_patch -> 'levels') with ordinality x(e, ord)
    where jsonb_typeof(e) = 'object';
  end if;

  if p_patch ? 'tier_cents' then
    select array_agg(t order by t) into v_tiers
    from (
      select distinct (e #>> '{}')::bigint::integer as t
      from jsonb_array_elements(p_patch -> 'tier_cents') e
      where jsonb_typeof(e) = 'number' and (e #>> '{}') ~ '^[0-9]{1,9}$'
    ) s;
    if coalesce(array_length(v_tiers, 1), 0) > 8 then
      return jsonb_build_object('ok', false, 'reason', 'invalid-patch', 'field', 'tier_cents');
    end if;
    v_tiers := coalesce(v_tiers, '{}'::integer[]);
  end if;

  -- match / auction / stretch are rebuilt key by key. These objects are served
  -- to anon, so a bidder's name typed into the wrong box can never reach the
  -- public RPC: an unlisted key is simply dropped (05 s4.6).
  if p_patch ? 'match' then
    v_match := jsonb_strip_nulls(jsonb_build_object(
      'active', coalesce((p_patch -> 'match' ->> 'active')::boolean, false),
      'label', left(coalesce(p_patch -> 'match' ->> 'label', ''), 80),
      'amount_cents', case when (p_patch -> 'match' ->> 'amount_cents') ~ '^[0-9]{1,12}$'
        then (p_patch -> 'match' ->> 'amount_cents')::bigint end,
      'unlock_at_count', case when (p_patch -> 'match' ->> 'unlock_at_count') ~ '^[0-9]{1,6}$'
        then (p_patch -> 'match' ->> 'unlock_at_count')::integer end,
      'unlock_at_amount_cents', case when (p_patch -> 'match' ->> 'unlock_at_amount_cents') ~ '^[0-9]{1,12}$'
        then (p_patch -> 'match' ->> 'unlock_at_amount_cents')::bigint end
    )) || jsonb_build_object('active', coalesce((p_patch -> 'match' ->> 'active')::boolean, false));
  end if;

  if p_patch ? 'auction' then
    v_auction := jsonb_strip_nulls(jsonb_build_object(
      'lot', left(coalesce(p_patch -> 'auction' ->> 'lot', ''), 40),
      'title', left(coalesce(p_patch -> 'auction' ->> 'title', ''), 120),
      'image_url', left(coalesce(p_patch -> 'auction' ->> 'image_url', ''), 400),
      'current_bid_cents', case when (p_patch -> 'auction' ->> 'current_bid_cents') ~ '^[0-9]{1,12}$'
        then (p_patch -> 'auction' ->> 'current_bid_cents')::bigint end,
      'paddle', case when (p_patch -> 'auction' ->> 'paddle') ~ '^[0-9]{1,4}$'
        then (p_patch -> 'auction' ->> 'paddle')::integer end,
      'status', case when (p_patch -> 'auction' ->> 'status') in ('open', 'once', 'twice', 'sold')
        then p_patch -> 'auction' ->> 'status' end
    ));
  end if;

  if p_patch ? 'stretch' then
    v_stretch := jsonb_strip_nulls(jsonb_build_object(
      'active', coalesce((p_patch -> 'stretch' ->> 'active')::boolean, false),
      'label', left(coalesce(p_patch -> 'stretch' ->> 'label', ''), 80),
      'goal_cents', case when (p_patch -> 'stretch' ->> 'goal_cents') ~ '^[0-9]{1,12}$'
        then (p_patch -> 'stretch' ->> 'goal_cents')::bigint end
    )) || jsonb_build_object('active', coalesce((p_patch -> 'stretch' ->> 'active')::boolean, false));
  end if;

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return jsonb_build_object('ok', true, 'outcome', 'set', 'replayed', true,
      'version', (select s.version from public.gala_event_state s where s.event_slug = v_event),
      'state', public.gala_display_public_json(v_event));
  end if;

  perform public.gala_display_ensure(v_event);
  v_ver := public.gala_checkin_bump(v_event);

  update public.gala_event_display d set
    scene = case when p_patch ? 'scene' then p_patch ->> 'scene' else d.scene end,
    goal_cents = case when p_patch ? 'goal_cents' then (p_patch ->> 'goal_cents')::bigint else d.goal_cents end,
    baseline_cents = case when p_patch ? 'baseline_cents' then (p_patch ->> 'baseline_cents')::bigint else d.baseline_cents end,
    total_override_cents = case when p_patch ? 'total_override_cents'
      then nullif(p_patch ->> 'total_override_cents', '')::bigint else d.total_override_cents end,
    count_mode = case when p_patch ? 'count_mode' then p_patch ->> 'count_mode' else d.count_mode end,
    levels = case when p_patch ? 'levels' then coalesce(v_levels, '[]'::jsonb) else d.levels end,
    current_level_cents = case when p_patch ? 'current_level_cents'
      then nullif(p_patch ->> 'current_level_cents', '')::bigint else d.current_level_cents end,
    tier_cents = case when p_patch ? 'tier_cents' then v_tiers else d.tier_cents end,
    show_names = case when p_patch ? 'show_names' then (p_patch ->> 'show_names')::boolean else d.show_names end,
    fx_mode = case when p_patch ? 'fx_mode' then p_patch ->> 'fx_mode' else d.fx_mode end,
    publish_delay_ms = case when p_patch ? 'publish_delay_ms' then (p_patch ->> 'publish_delay_ms')::integer else d.publish_delay_ms end,
    confirm_threshold_cents = case when p_patch ? 'confirm_threshold_cents'
      then (p_patch ->> 'confirm_threshold_cents')::bigint else d.confirm_threshold_cents end,
    match = case when p_patch ? 'match' then coalesce(v_match, '{"active": false}'::jsonb) else d.match end,
    auction = case when p_patch ? 'auction' then coalesce(v_auction, '{}'::jsonb) else d.auction end,
    stretch = case when p_patch ? 'stretch' then coalesce(v_stretch, '{}'::jsonb) else d.stretch end,
    message = case when p_patch ? 'message' then left(coalesce(p_patch ->> 'message', ''), 300) else d.message end,
    hold = case when p_patch ? 'hold' then (p_patch ->> 'hold')::boolean else d.hold end,
    poll_ms = case when p_patch ? 'poll_ms' then (p_patch ->> 'poll_ms')::integer else d.poll_ms end,
    reload_nonce = case when p_patch ? 'reload_nonce' then left(coalesce(p_patch ->> 'reload_nonce', ''), 40) else d.reload_nonce end,
    min_client_version = case when p_patch ? 'min_client_version'
      then left(coalesce(p_patch ->> 'min_client_version', ''), 40) else d.min_client_version end,
    cue = case when p_patch ? 'cue' then nullif(p_patch -> 'cue', 'null'::jsonb) else d.cue end,
    cue_seq = case when p_patch ? 'cue' then d.cue_seq + 1 else d.cue_seq end,
    config = case when p_patch ? 'config' then p_patch -> 'config' else d.config end,
    updated_at = now(),
    updated_by = v_auth.actor
  where d.event_slug = v_event;

  -- Field names only. Values (a banner line, an auction title) stay out of the
  -- log, which anyone unlocked can read.
  insert into public.gala_event_log (event_slug, version, op_id, kind, actor, session_id, detail)
  values (v_event, v_ver, p_op_id, 'display_set', v_auth.actor, v_auth.session_id,
    jsonb_build_object('outcome', 'set', 'fields', to_jsonb(v_fields)));

  return jsonb_build_object('ok', true, 'outcome', 'set', 'replayed', false, 'version', v_ver,
    'fields', to_jsonb(v_fields), 'state', public.gala_display_public_json(v_event));
end;
$fn$;

-- Rotate the display key from an admin session (the ops console). The key is
-- returned exactly once; only its sha256 is kept.
create or replace function public.gala_display_rotate_key(
  p_event text,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_key text;
  v_ver bigint;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if v_auth.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  v_key := encode(extensions.gen_random_bytes(16), 'hex');

  perform public.gala_checkin_lock(v_event);
  perform public.gala_display_ensure(v_event);
  v_ver := public.gala_checkin_bump(v_event);

  update public.gala_event_display d
     set key_hash = extensions.digest(v_key, 'sha256'),
         key_set_at = now(), updated_at = now(), updated_by = v_auth.actor
   where d.event_slug = v_event;

  delete from public.gala_event_attempts where event_slug = 'display:' || v_event;

  insert into public.gala_event_log (event_slug, version, kind, actor, session_id, detail)
  values (v_event, v_ver, 'display_key', v_auth.actor, v_auth.session_id,
    jsonb_build_object('outcome', 'rotated'));

  -- Shown once. There is no way to read it back.
  return jsonb_build_object('ok', true, 'outcome', 'rotated', 'version', v_ver, 'display_key', v_key);
end;
$fn$;

-- 9) Public RPCs: the clerk terminals ------------------------------------------

-- The shared two-clerk tape. Any valid session: both clerks and the lead see
-- the same rows, including the ones flagged for review and who keyed each.
create or replace function public.gala_donation_list(
  p_event text,
  p_token text,
  p_since bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_rows jsonb;
  v_head bigint;
  v_agg record;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;

  -- Head first, rows after: the other order can skip a commit for ever (the
  -- same rule gala_checkin_load follows for the version).
  select coalesce(max(d.chg), 0) into v_head
  from public.gala_event_donations d where d.event_slug = v_event;

  v_rows := public.gala_donation_clerk_json(v_event, coalesce(p_since, 0), 2000, null);

  select
    coalesce(sum(round(d.amount * 100)) filter (
      where d.voided_at is null and d.retracted_at is null and not d.hidden), 0)::bigint as live_cents,
    count(*) filter (
      where d.voided_at is null and d.retracted_at is null and not d.hidden)::integer as live_n,
    coalesce(sum(round(d.amount * 100)) filter (where d.voided_at is null), 0)::bigint as booked_cents,
    count(*) filter (where d.voided_at is null and d.needs_review)::integer as review_n,
    count(*) filter (where d.voided_at is not null)::integer as void_n,
    count(*) filter (where d.retracted_at is not null and d.voided_at is null)::integer as retracted_n,
    count(*) filter (
      where d.voided_at is null and coalesce(d.publish_at, d.created_at) > now())::integer as pending_n
  into v_agg
  from public.gala_event_donations d
  where d.event_slug = v_event;

  return jsonb_build_object(
    'ok', true,
    'cursor', greatest(coalesce(p_since, 0), v_head),
    'server_time', clock_timestamp(),
    'me', jsonb_build_object('actor', v_auth.actor, 'role', v_auth.role, 'session_id', v_auth.session_id),
    'donations', v_rows,
    'rounds', public.gala_donation_rounds_json(v_event),
    'totals', jsonb_build_object(
      'live_cents', v_agg.live_cents,
      'live_count', v_agg.live_n,
      'booked_cents', v_agg.booked_cents,
      'needs_review', v_agg.review_n,
      'voided', v_agg.void_n,
      'retracted', v_agg.retracted_n,
      'pending_publish', v_agg.pending_n
    ),
    'state', public.gala_display_public_json(v_event)
  );
end;
$fn$;

-- Everything gala_donation_add cannot say: a kind outside the paddle raise, a
-- per-gift anonymous flag, a free-text donor with no paddle, and an override of
-- the publish delay (0 for a gift seeded before doors, which must not animate).
-- gala_donation_add is left exactly as the first migration wrote it.
create or replace function public.gala_donation_record(
  p_event text,
  p_token text,
  p_op_id uuid,
  p_amount numeric,
  p_paddle_number integer default null,
  p_round_key text default null,
  p_kind text default 'pledge',
  p_donor_name text default null,
  p_note text default '',
  p_anonymous boolean default false,
  p_hidden boolean default false,
  p_publish_delay_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_res record;
  v_prior public.gala_event_donations%rowtype;
  v_row public.gala_event_donations%rowtype;
  v_round text := nullif(left(btrim(coalesce(p_round_key, '')), 40), '');
  v_name text := nullif(left(btrim(coalesce(p_donor_name, '')), 200), '');
  v_delay integer;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-amount');
  end if;
  if coalesce(p_kind, '') not in ('pledge', 'cash', 'card', 'online', 'ticket', 'other',
                                  'seed', 'sponsor', 'auction', 'match') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-kind');
  end if;
  -- Money needs an owner: either a paddle to resolve or a name to print.
  if p_paddle_number is null and v_name is null and not coalesce(p_anonymous, false) then
    return jsonb_build_object('ok', false, 'reason', 'missing-donor');
  end if;
  if p_publish_delay_ms is not null and p_publish_delay_ms not between 0 and 60000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-options');
  end if;

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_donations d
  where d.event_slug = v_event and d.op_id = p_op_id;
  if found then
    return jsonb_build_object('ok', true, 'outcome', 'recorded', 'replayed', true,
      'donation_id', v_prior.id, 'seq', v_prior.seq, 'needs_review', v_prior.needs_review,
      'publish_at', v_prior.publish_at);
  end if;

  select * into v_res from public.gala_donation_resolve(v_event, p_paddle_number);

  -- Same paddle, same raise level, already keyed by the other clerk.
  if v_round is not null and v_res.paddle_number is not null then
    select * into v_prior from public.gala_event_donations d
    where d.event_slug = v_event and d.round_key = v_round
      and d.paddle_number = v_res.paddle_number and d.voided_at is null;
    if found then
      return jsonb_build_object('ok', true, 'outcome', 'already-recorded', 'replayed', false,
        'donation_id', v_prior.id, 'seq', v_prior.seq,
        'entered_by', v_prior.entered_by, 'amount', v_prior.amount);
    end if;
  end if;

  v_delay := p_publish_delay_ms;

  insert into public.gala_event_donations (
    event_slug, op_id, kind, amount, round_key, paddle_number, called_number, paddle_group,
    guest_id, donor_name, anonymous, hidden, needs_review, note, entered_by, session_id,
    publish_at
  )
  values (
    v_event, p_op_id, p_kind, p_amount, v_round,
    v_res.paddle_number, p_paddle_number, v_res.paddle_group, v_res.guest_id,
    v_name, coalesce(p_anonymous, false), coalesce(p_hidden, false),
    p_paddle_number is not null and v_res.paddle_group is null,
    left(coalesce(p_note, ''), 300), v_auth.actor, v_auth.session_id,
    case when v_delay is not null then now() + make_interval(secs => v_delay / 1000.0) end
  )
  returning * into v_row;

  return jsonb_build_object('ok', true, 'outcome', 'recorded', 'replayed', false,
    'donation_id', v_row.id, 'seq', v_row.seq, 'needs_review', v_row.needs_review,
    'publish_at', v_row.publish_at,
    'held_by', case when v_res.paddle_group is not null
      then public.gala_checkin_group_label(v_event, v_res.paddle_group) end,
    'paddle_status', v_res.status);
end;
$fn$;

-- Fix a row: the amount, who it is from, whether it shows a name, the note, the
-- kind, and the paddle (which is how a needs_review row is resolved). A voided
-- row is not editable: void is the end of the line for that entry.
create or replace function public.gala_donation_update(
  p_event text,
  p_token text,
  p_op_id uuid,
  p_donation_id bigint,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_row public.gala_event_donations%rowtype;
  v_allowed text[] := array['amount', 'donor_name', 'anonymous', 'note', 'kind', 'paddle_number', 'hidden'];
  v_fields text[];
  v_res record;
  v_ver bigint;
  v_num integer;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-patch');
  end if;

  select array_agg(k order by k) into v_fields
  from jsonb_object_keys(p_patch) k where k = any (v_allowed);
  if v_fields is null then
    return jsonb_build_object('ok', false, 'reason', 'nothing-to-change');
  end if;

  if p_patch ? 'amount' and (
       (p_patch ->> 'amount') is null
       or (p_patch ->> 'amount') !~ '^[0-9]{1,7}(\.[0-9]{1,2})?$'
       or (p_patch ->> 'amount')::numeric <= 0
       or (p_patch ->> 'amount')::numeric > 1000000) then
    return jsonb_build_object('ok', false, 'reason', 'invalid-amount');
  end if;
  if p_patch ? 'kind' and coalesce(p_patch ->> 'kind', '') not in
     ('pledge', 'cash', 'card', 'online', 'ticket', 'other', 'seed', 'sponsor', 'auction', 'match') then
    return jsonb_build_object('ok', false, 'reason', 'invalid-kind');
  end if;
  if p_patch ? 'anonymous' and jsonb_typeof(p_patch -> 'anonymous') <> 'boolean' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-patch', 'field', 'anonymous');
  end if;
  if p_patch ? 'hidden' and jsonb_typeof(p_patch -> 'hidden') <> 'boolean' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-patch', 'field', 'hidden');
  end if;
  if p_patch ? 'paddle_number'
     and jsonb_typeof(p_patch -> 'paddle_number') <> 'null'
     and (p_patch ->> 'paddle_number') !~ '^[0-9]{1,4}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-patch', 'field', 'paddle_number');
  end if;

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return public.gala_donation_result(v_event, (v_prior.detail ->> 'donation_id')::bigint, 'updated', true,
      (select s.version from public.gala_event_state s where s.event_slug = v_event));
  end if;

  select * into v_row from public.gala_event_donations d
  where d.event_slug = v_event and d.id = p_donation_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown-donation');
  end if;
  if v_row.voided_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'donation-voided');
  end if;

  -- ALWAYS resolve, even when the patch leaves the paddle alone. The UPDATE
  -- below mentions v_res inside a CASE, and PL/pgSQL evaluates every parameter
  -- of the statement whether or not its branch is taken: a conditionally
  -- assigned record would raise 55000 "record is not assigned yet" on any edit
  -- that did not touch the paddle. v_num is null in that case, and
  -- gala_donation_resolve answers with a row of nulls.
  v_num := case when p_patch ? 'paddle_number' and (p_patch ->> 'paddle_number') ~ '^[0-9]{1,4}$'
    then (p_patch ->> 'paddle_number')::integer end;
  select * into v_res from public.gala_donation_resolve(v_event, v_num);

  v_ver := public.gala_checkin_bump(v_event);

  begin
    update public.gala_event_donations d set
      amount = case when p_patch ? 'amount' then (p_patch ->> 'amount')::numeric else d.amount end,
      donor_name = case when p_patch ? 'donor_name'
        then nullif(left(btrim(coalesce(p_patch ->> 'donor_name', '')), 200), '') else d.donor_name end,
      anonymous = case when p_patch ? 'anonymous' then (p_patch ->> 'anonymous')::boolean else d.anonymous end,
      hidden = case when p_patch ? 'hidden' then (p_patch ->> 'hidden')::boolean else d.hidden end,
      note = case when p_patch ? 'note' then left(coalesce(p_patch ->> 'note', ''), 300) else d.note end,
      kind = case when p_patch ? 'kind' then p_patch ->> 'kind' else d.kind end,
      -- Resolving the paddle re-freezes the household and the primary guest, the
      -- same answer an entry would have frozen, and clears the review flag.
      paddle_number = case when p_patch ? 'paddle_number' then v_res.paddle_number else d.paddle_number end,
      called_number = case when p_patch ? 'paddle_number' then v_num else d.called_number end,
      paddle_group = case when p_patch ? 'paddle_number' then v_res.paddle_group else d.paddle_group end,
      guest_id = case when p_patch ? 'paddle_number' then v_res.guest_id else d.guest_id end,
      needs_review = case when p_patch ? 'paddle_number'
        then (v_num is not null and v_res.paddle_group is null) else d.needs_review end,
      resolved_at = case when p_patch ? 'paddle_number' and v_res.paddle_group is not null
        then now() else d.resolved_at end,
      updated_by = v_auth.actor
    where d.event_slug = v_event and d.id = p_donation_id;
  exception
    when unique_violation then
      -- (event, round_key, paddle) already has a live gift: the clerk moved this
      -- row onto a paddle the other clerk already keyed at this level.
      return jsonb_build_object('ok', false, 'reason', 'duplicate-round');
  end;

  insert into public.gala_event_log (event_slug, version, op_id, kind, paddle_number, actor, session_id, detail)
  values (v_event, v_ver, p_op_id, 'donation_update', v_num, v_auth.actor, v_auth.session_id,
    jsonb_build_object('outcome', 'updated', 'donation_id', p_donation_id, 'fields', to_jsonb(v_fields)));

  return public.gala_donation_result(v_event, p_donation_id, 'updated', false, v_ver);
end;
$fn$;

-- Take it off the screen now, keep the money in the books. This is the button on
-- every recent row of the clerk tape (09 R5). Reversible.
create or replace function public.gala_donation_retract(
  p_event text,
  p_token text,
  p_op_id uuid,
  p_donation_id bigint,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_row public.gala_event_donations%rowtype;
  v_ver bigint;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return public.gala_donation_result(v_event, (v_prior.detail ->> 'donation_id')::bigint, 'retracted', true,
      (select s.version from public.gala_event_state s where s.event_slug = v_event));
  end if;

  select * into v_row from public.gala_event_donations d
  where d.event_slug = v_event and d.id = p_donation_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown-donation');
  end if;
  if v_row.retracted_at is not null then
    return public.gala_donation_result(v_event, p_donation_id, 'already-retracted', false,
      (select s.version from public.gala_event_state s where s.event_slug = v_event));
  end if;

  v_ver := public.gala_checkin_bump(v_event);

  update public.gala_event_donations d
     set retracted_at = now(), retracted_by = v_auth.actor,
         retract_reason = left(coalesce(p_reason, ''), 200), updated_by = v_auth.actor
   where d.event_slug = v_event and d.id = p_donation_id;

  insert into public.gala_event_log (event_slug, version, op_id, kind, actor, session_id, detail)
  values (v_event, v_ver, p_op_id, 'donation_retract', v_auth.actor, v_auth.session_id,
    jsonb_build_object('outcome', 'retracted', 'donation_id', p_donation_id,
      'was_published', coalesce(v_row.publish_at, v_row.created_at) <= now()));

  return public.gala_donation_result(v_event, p_donation_id, 'retracted', false, v_ver);
end;
$fn$;

create or replace function public.gala_donation_unretract(
  p_event text,
  p_token text,
  p_op_id uuid,
  p_donation_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_row public.gala_event_donations%rowtype;
  v_ver bigint;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return public.gala_donation_result(v_event, (v_prior.detail ->> 'donation_id')::bigint, 'unretracted', true,
      (select s.version from public.gala_event_state s where s.event_slug = v_event));
  end if;

  select * into v_row from public.gala_event_donations d
  where d.event_slug = v_event and d.id = p_donation_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown-donation');
  end if;
  if v_row.voided_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'donation-voided');
  end if;
  if v_row.retracted_at is null then
    return public.gala_donation_result(v_event, p_donation_id, 'not-retracted', false,
      (select s.version from public.gala_event_state s where s.event_slug = v_event));
  end if;

  v_ver := public.gala_checkin_bump(v_event);

  update public.gala_event_donations d
     set retracted_at = null, retracted_by = null, retract_reason = null, updated_by = v_auth.actor
   where d.event_slug = v_event and d.id = p_donation_id;

  insert into public.gala_event_log (event_slug, version, op_id, kind, actor, session_id, detail)
  values (v_event, v_ver, p_op_id, 'donation_unretract', v_auth.actor, v_auth.session_id,
    jsonb_build_object('outcome', 'unretracted', 'donation_id', p_donation_id));

  return public.gala_donation_result(v_event, p_donation_id, 'unretracted', false, v_ver);
end;
$fn$;

-- Soft void with a reason, never a delete: the row stays for reconciliation the
-- next morning (09 R18: no delete during the event, ever). Voiding frees the
-- (round_key, paddle) slot so the corrected entry can be keyed straight away.
create or replace function public.gala_donation_void(
  p_event text,
  p_token text,
  p_op_id uuid,
  p_donation_id bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
set lock_timeout = '4s'
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_row public.gala_event_donations%rowtype;
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
  v_ver bigint;
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if p_op_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing-op-id');
  end if;
  if v_reason = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing-reason');
  end if;

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return public.gala_donation_result(v_event, (v_prior.detail ->> 'donation_id')::bigint, 'voided', true,
      (select s.version from public.gala_event_state s where s.event_slug = v_event));
  end if;

  select * into v_row from public.gala_event_donations d
  where d.event_slug = v_event and d.id = p_donation_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown-donation');
  end if;
  if v_row.voided_at is not null then
    return public.gala_donation_result(v_event, p_donation_id, 'already-voided', false,
      (select s.version from public.gala_event_state s where s.event_slug = v_event));
  end if;

  v_ver := public.gala_checkin_bump(v_event);

  update public.gala_event_donations d
     set voided_at = now(), voided_by = v_auth.actor, void_reason = v_reason, updated_by = v_auth.actor
   where d.event_slug = v_event and d.id = p_donation_id;

  insert into public.gala_event_log (event_slug, version, op_id, kind, actor, session_id, detail)
  values (v_event, v_ver, p_op_id, 'donation_void', v_auth.actor, v_auth.session_id,
    jsonb_build_object('outcome', 'voided', 'donation_id', p_donation_id,
      'was_published', coalesce(v_row.publish_at, v_row.created_at) <= now()));

  return public.gala_donation_result(v_event, p_donation_id, 'voided', false, v_ver);
end;
$fn$;

-- 10) Owner-only (SQL editor / Management API; never the Data API) -------------

-- Set or rotate the display key without a session, the way
-- gala_checkin_set_passcode sets the passcodes. Pass null for a random one.
-- The key is returned ONCE and only its sha256 is stored.
create or replace function public.gala_display_set_key(
  p_event text,
  p_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_key text := nullif(btrim(coalesce(p_key, '')), '');
begin
  if v_event = '' or char_length(v_event) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-slug');
  end if;
  if not exists (select 1 from public.gala_event_access a where a.event_slug = v_event) then
    return jsonb_build_object('ok', false, 'reason', 'no-event');
  end if;
  if v_key is not null and char_length(v_key) not between 8 and 128 then
    return jsonb_build_object('ok', false, 'reason', 'key-too-short');
  end if;

  v_key := coalesce(v_key, encode(extensions.gen_random_bytes(16), 'hex'));

  perform public.gala_display_ensure(v_event);

  update public.gala_event_display d
     set key_hash = extensions.digest(v_key, 'sha256'), key_set_at = now(), updated_at = now()
   where d.event_slug = v_event;

  delete from public.gala_event_attempts where event_slug = 'display:' || v_event;

  return jsonb_build_object('ok', true, 'event', v_event, 'display_key', v_key);
end;
$fn$;

-- 11) Grants -------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC on every new function, so: revoke from
-- everyone first, then grant the Data API roles only the public RPCs. The first
-- migration's block matches gala_checkin% plus three names by hand, so it and
-- this one never touch each other's functions; gala_donation_add is explicitly
-- left to it.

do $grants$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'gala\_display%' or p.proname like 'gala\_donation\_%'
           or p.proname = 'gala_event_donations_stream' or p.proname = 'gala_event_access_cascade')
      and p.proname <> 'gala_donation_add'
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.sig);

    if r.proname in (
      'gala_display_public', 'gala_display_feed', 'gala_display_set', 'gala_display_rotate_key',
      'gala_donation_record', 'gala_donation_list', 'gala_donation_update',
      'gala_donation_retract', 'gala_donation_unretract', 'gala_donation_void'
    ) then
      execute format('grant execute on function %s to anon, authenticated', r.sig);
    end if;
  end loop;
end
$grants$;

notify pgrst, 'reload schema';

-- Runbook ----------------------------------------------------------------------
-- Mint the display key (SQL editor; the value is shown once, never committed):
--   select public.gala_display_set_key('gala-2026');
-- The projector then opens  /gala/live?event=gala-2026#k=<key>
-- Set the night's numbers (from the ops console, admin session):
--   select public.gala_display_set('gala-2026', '<admin token>', gen_random_uuid(),
--     '{"goal_cents": 7500000, "scene": "ambient", "publish_delay_ms": 4000,
--       "levels": [{"amount_cents": 500000, "impact_line": "..."}]}'::jsonb);
-- Hide every name instantly:  {"show_names": false}
-- Kill the 3D:                {"fx_mode": "off"}
-- Freeze the number:          {"count_mode": "manual", "total_override_cents": 4210000}
-- Reload every display:       {"reload_nonce": "<anything new>"}
-- Clear a display-key lockout:
--   delete from public.gala_event_attempts where event_slug = 'display:gala-2026';
-- Teardown is unchanged: gala_checkin_archive_and_purge drops the access row and
-- the cascade trigger takes the display row and its throttle with it.
