-- 20260925090000_gala_program_segments.sql
--
-- The run of show on the big screen. ADDITIVE ONLY: one jsonb column on the
-- display row, two private helpers, and two function bodies re-issued with
-- one extra key each. No signature moves, no return key is removed, no grant
-- changes.
--
--   gala_event_display.program = {segment_id, step, honoree_overrides, updated_at}
--
--     segment_id         which program segment the room is on ("seating",
--                        "welcome", "hosts", ..., "honors", "appeal", "thanks").
--                        The catalogue lives in the client (src/lib/galaLive/
--                        program.js); the server only checks the shape.
--     step               0..999, the reveal step inside that segment. For
--                        honors: 2*i = honor i title with the awardee hidden,
--                        2*i + 1 = honor i revealed.
--     honoree_overrides  {slug: {photo_url, name}}: runtime fixes typed on the
--                        control phone (a photo URL pasted at 7 PM, a name
--                        spelling). Public by design: awardees are announced
--                        on stage. photo_url must be https:// or a site path
--                        under /images/.
--     updated_at         server time of the last program write.
--
-- Written only through gala_display_set (admin session), key `program`. The
-- patch is MERGED: send only what changes. `honoree_overrides` merges per
-- slug; a slug set to null (or to an object with nothing in it) is removed.
-- Read through gala_display_public_json, so it reaches guest phones
-- (gala_display_public) and the keyed projector feed (gala_display_feed)
-- alike. It must never hold a guest's name: seating names reach the projector
-- only through the passcode-gated seating RPC, never through this row.
--
-- Apply: Management API + ledger row (docs/gala-2026/02 section 5). Never
-- `supabase db push`.

-- 1) The column --------------------------------------------------------------

alter table public.gala_event_display
  add column if not exists program jsonb not null default '{}'::jsonb;

do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gala_event_display_program_check'
      and conrelid = 'public.gala_event_display'::regclass
  ) then
    alter table public.gala_event_display
      add constraint gala_event_display_program_check check (jsonb_typeof(program) = 'object');
  end if;
end
$do$;

-- 2) Private helpers ----------------------------------------------------------

-- NULL = acceptable, else a short machine reason. Only the known keys are
-- inspected; anything else in the patch is dropped by the merge, not refused.
create or replace function public.gala_display_program_check(p jsonb)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
declare
  v_k text;
  v_v jsonb;
  v_n integer := 0;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return 'not-object';
  end if;

  if p ? 'segment_id' and (
       jsonb_typeof(p -> 'segment_id') <> 'string'
       or (p ->> 'segment_id') !~ '^[a-z0-9][a-z0-9-]{0,39}$') then
    return 'segment_id';
  end if;

  if p ? 'step' and (
       jsonb_typeof(p -> 'step') <> 'number'
       or (p ->> 'step') !~ '^[0-9]{1,3}$') then
    return 'step';
  end if;

  if p ? 'honoree_overrides' then
    if jsonb_typeof(p -> 'honoree_overrides') <> 'object' then
      return 'honoree_overrides';
    end if;
    for v_k, v_v in select key, value from jsonb_each(p -> 'honoree_overrides') loop
      v_n := v_n + 1;
      if v_n > 16 then
        return 'honoree_overrides-count';
      end if;
      if v_k !~ '^[a-z0-9][a-z0-9-]{0,59}$' then
        return 'honoree_overrides-slug';
      end if;
      if jsonb_typeof(v_v) = 'null' then
        continue;
      end if;
      if jsonb_typeof(v_v) <> 'object' then
        return 'honoree_overrides-value';
      end if;
      if v_v ? 'photo_url' and jsonb_typeof(v_v -> 'photo_url') not in ('string', 'null') then
        return 'photo_url';
      end if;
      if char_length(coalesce(v_v ->> 'photo_url', '')) > 500 then
        return 'photo_url';
      end if;
      if coalesce(v_v ->> 'photo_url', '') <> ''
         and (v_v ->> 'photo_url') !~ '^https://[^[:space:]"''<>\\]{4,}$'
         and (v_v ->> 'photo_url') !~ '^/images/[A-Za-z0-9/_.-]{1,200}$' then
        return 'photo_url';
      end if;
      if v_v ? 'name' and jsonb_typeof(v_v -> 'name') not in ('string', 'null') then
        return 'name';
      end if;
      if char_length(coalesce(v_v ->> 'name', '')) > 80 then
        return 'name';
      end if;
    end loop;
  end if;

  return null;
end;
$fn$;

-- Merge a checked patch over the stored program. The result is rebuilt from
-- the whitelist, so nothing unlisted can ever be stored or served to anon.
create or replace function public.gala_display_program_merge(p_old jsonb, p jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $fn$
declare
  v_old jsonb := case when jsonb_typeof(p_old) = 'object' then p_old else '{}'::jsonb end;
  v_seg text;
  v_step integer;
  v_ov jsonb;
  v_k text;
  v_v jsonb;
  v_one jsonb;
begin
  v_seg := case when p ? 'segment_id' then p ->> 'segment_id' else v_old ->> 'segment_id' end;
  v_step := case
    when p ? 'step' then (p ->> 'step')::integer
    when (v_old ->> 'step') ~ '^[0-9]{1,3}$' then (v_old ->> 'step')::integer
    else 0
  end;

  v_ov := case when jsonb_typeof(v_old -> 'honoree_overrides') = 'object'
    then v_old -> 'honoree_overrides' else '{}'::jsonb end;

  if p ? 'honoree_overrides' then
    for v_k, v_v in select key, value from jsonb_each(p -> 'honoree_overrides') loop
      if jsonb_typeof(v_v) = 'object' then
        v_one := jsonb_strip_nulls(jsonb_build_object(
          'photo_url', nullif(btrim(coalesce(v_v ->> 'photo_url', '')), ''),
          'name', nullif(btrim(left(coalesce(v_v ->> 'name', ''), 80)), '')
        ));
      else
        v_one := '{}'::jsonb;
      end if;
      if v_one = '{}'::jsonb then
        v_ov := v_ov - v_k;
      else
        v_ov := jsonb_set(v_ov, array[v_k], v_one, true);
      end if;
    end loop;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'segment_id', v_seg,
    'step', v_step,
    'honoree_overrides', v_ov,
    'updated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));
end;
$fn$;

revoke all on function public.gala_display_program_check(jsonb) from public, anon, authenticated;
revoke all on function public.gala_display_program_merge(jsonb, jsonb) from public, anon, authenticated;

-- 3) The public aggregate: identical to 20260921140000 plus `program` in both
--    branches. gala_display_feed embeds this object, so the keyed projector
--    feed carries `program` too without being redefined.

CREATE OR REPLACE FUNCTION public.gala_display_public_json(p_event text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      'cue', null, 'cue_seq', 0, 'config', '{}'::jsonb, 'program', '{}'::jsonb,
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
    'program', v_d.program,
    'version', v_ver,
    'server_time', clock_timestamp()
  );
end;
$function$;

-- 4) gala_display_set: identical to 20260921140000 plus the `program` key.

CREATE OR REPLACE FUNCTION public.gala_display_set(p_event text, p_token text, p_op_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
 SET lock_timeout TO '4s'
AS $function$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_auth record;
  v_prior public.gala_event_log%rowtype;
  v_allowed text[] := array[
    'scene', 'goal_cents', 'baseline_cents', 'total_override_cents', 'count_mode',
    'levels', 'current_level_cents', 'tier_cents', 'show_names', 'fx_mode',
    'publish_delay_ms', 'confirm_threshold_cents', 'match', 'auction', 'stretch',
    'message', 'hold', 'poll_ms', 'reload_nonce', 'min_client_version', 'cue', 'config',
    'program'
  ];
  v_fields text[];
  v_ver bigint;
  v_bad text;
  v_levels jsonb;
  v_tiers integer[];
  v_match jsonb;
  v_auction jsonb;
  v_stretch jsonb;
  v_program jsonb;
  v_prog_err text;
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
  elsif p_patch ? 'program' and jsonb_typeof(p_patch -> 'program') <> 'object' then
    v_bad := 'program';
  elsif p_patch ? 'program' and pg_column_size(p_patch -> 'program') > 8192 then
    v_bad := 'program';
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

  -- program: the run-of-show pointer (20260925090000). Checked here, merged
  -- over the stored value below under the event lock, so the control phone
  -- and the projector keyboard each send only what they change.
  if p_patch ? 'program' then
    v_prog_err := public.gala_display_program_check(p_patch -> 'program');
    if v_prog_err is not null then
      return jsonb_build_object('ok', false, 'reason', 'invalid-patch', 'field', 'program', 'detail', v_prog_err);
    end if;
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

  if p_patch ? 'program' then
    select public.gala_display_program_merge(d.program, p_patch -> 'program')
      into v_program
    from public.gala_event_display d where d.event_slug = v_event;
  end if;

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
    program = case when p_patch ? 'program' then coalesce(v_program, d.program) else d.program end,
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
$function$;
