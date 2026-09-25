-- Gala 2026: policy tweaks (G2b)
--
-- Three decisions the organizer made AFTER 20260921120000_gala_event_checkin.sql
-- and 20260921140000_gala_event_display.sql shipped. This migration is additive:
-- every function is replaced in place, no signature moves, no return key is
-- removed, no table is touched. Re-runnable, like the two before it.
--
--   D5  One paddle per person. Every guest holds their own paddle: named
--       ticket holders, unnamed "+1" placeholder seats and Late Night tickets
--       alike. Households no longer share.
--   D6  Numbering starts at 1 and is pre-assigned before the night. Numbers
--       follow SEATING: table 1's guests first, then table 2, and so on, in
--       seat order inside each table. Guests with no table (Late Night) come
--       after the last table. Walk-ins take the first free number after the
--       last ticketed paddle, which falls out of "ascending free pool row".
--   D7  A walk-in gets their paddle as part of check-in, in one call, and the
--       answer carries the number the clerk has to write on the paddle.
--   D8  The projector shows donor NAMES: a pledge keyed as "paddle 42, $500"
--       shows the name of the person holding paddle 42.
--
-- What each change actually needed is recorded above each function.

-- 1) D5: per-person paddle groups ---------------------------------------------
-- Before: paddle_group = party_id, except that a party LARGER than p_max_group
-- was exploded into one 'g:<id>' group per guest. So p_max_group = 1 still gave
-- a party of one its party_id, and a household of two shared a paddle.
-- After: p_max_group <= 1 means EVERY guest gets 'g:<id>' - parties of one and
-- placeholder "+1" seats included. p_max_group >= 2 (and the default of 4) is
-- bit-for-bit what it was.
--
-- The re-import rule is unchanged and was already correct: ON CONFLICT never
-- writes paddle_group, so a group that is already set survives every re-import
-- and every seating sync, whatever p_max_group says.

create or replace function public.gala_checkin_upsert_guests(
  p_event text,
  p_rows jsonb,
  p_ver bigint,
  p_max_group integer
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_count integer;
begin
  with src as (
    select
      left(btrim(r ->> 'id'), 80) as id,
      left(coalesce(nullif(btrim(r ->> 'name'), ''), 'Guest'), 160) as name,
      left(coalesce(nullif(btrim(r ->> 'party_id'), ''), 'solo:' || btrim(r ->> 'id')), 200) as party_id,
      left(coalesce(r ->> 'party_label', ''), 160) as party_label,
      left(coalesce(r ->> 'buyer_name', ''), 160) as buyer_name,
      left(coalesce(r ->> 'buyer_email', ''), 200) as buyer_email,
      left(coalesce(r ->> 'email', ''), 200) as email,
      left(coalesce(r ->> 'phone', ''), 40) as phone,
      left(coalesce(nullif(btrim(r ->> 'ticket_type'), ''), 'unknown'), 40) as ticket_type,
      coalesce((r ->> 'has_dinner')::boolean, true) as has_dinner,
      case when (r ->> 'table_number') ~ '^[0-9]{1,3}$' then (r ->> 'table_number')::integer end as table_number,
      left(coalesce(r ->> 'table_name', ''), 80) as table_name,
      case when (r ->> 'seat') ~ '^[0-9]{1,3}$' then (r ->> 'seat')::integer end as seat,
      nullif(left(coalesce(r ->> 'meal', ''), 40), '') as meal,
      coalesce((
        select array_agg(left(t, 40)) from jsonb_array_elements_text(
          case when jsonb_typeof(r -> 'tags') = 'array' then r -> 'tags' else '[]'::jsonb end
        ) t
      ), '{}'::text[]) as tags,
      left(coalesce(r ->> 'notes', ''), 600) as notes,
      coalesce((r ->> 'placeholder')::boolean, false) as placeholder,
      case when r ->> 'source' in ('seating', 'manual', 'walkin') then r ->> 'source' else 'manual' end as source
    from jsonb_array_elements(p_rows) r
    where jsonb_typeof(r) = 'object' and coalesce(btrim(r ->> 'id'), '') <> ''
  ),
  sized as (
    select s.*, count(*) over (partition by s.party_id) as party_size
    from src s
  ),
  up as (
    insert into public.gala_event_guests as g (
      event_slug, id, name, party_id, party_label, paddle_group, buyer_name, buyer_email,
      email, phone, ticket_type, has_dinner, table_number, table_name, seat, meal, tags,
      notes, placeholder, source, row_version
    )
    select
      p_event, s.id, s.name, s.party_id, s.party_label,
      -- p_max_group <= 1: ONE PADDLE PER PERSON, placeholders included (D5).
      -- Otherwise the 2025 rule: households share a paddle, a sponsor table
      -- larger than p_max_group does not.
      case when p_max_group <= 1 or s.party_size > p_max_group
           then 'g:' || s.id
           else s.party_id end,
      s.buyer_name, s.buyer_email, s.email, s.phone, s.ticket_type, s.has_dinner,
      s.table_number, s.table_name, s.seat, s.meal, s.tags, s.notes, s.placeholder, s.source, p_ver
    from sized s
    on conflict (event_slug, id) do update set
      name = case when 'name' = any (g.door_edited) then g.name else excluded.name end,
      email = case when 'email' = any (g.door_edited) then g.email else excluded.email end,
      phone = case when 'phone' = any (g.door_edited) then g.phone else excluded.phone end,
      meal = case when 'meal' = any (g.door_edited) then g.meal else excluded.meal end,
      table_number = case when 'table_number' = any (g.door_edited) then g.table_number else excluded.table_number end,
      table_name = excluded.table_name,
      seat = excluded.seat,
      party_id = excluded.party_id,
      party_label = excluded.party_label,
      buyer_name = excluded.buyer_name,
      buyer_email = excluded.buyer_email,
      ticket_type = excluded.ticket_type,
      has_dinner = excluded.has_dinner,
      tags = excluded.tags,
      notes = excluded.notes,
      placeholder = case when 'name' = any (g.door_edited) then g.placeholder else excluded.placeholder end,
      removed_at = null,
      row_version = p_ver,
      updated_at = now()
    returning 1
  )
  select count(*) into v_count from up;

  return v_count;
end;
$fn$;

-- The documented way to ask for the 2026 policy: p_max_group => 0 (or 1).
-- The answer now says which mode ran, so a seed script can assert it.
create or replace function public.gala_checkin_import(
  p_event text,
  p_token text,
  p_guests jsonb,
  p_max_group integer default 4
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
  v_ver bigint;
  v_count integer;
  v_max integer := greatest(1, coalesce(p_max_group, 4));
begin
  select * into v_auth from public.gala_checkin_auth(v_event, p_token);
  if v_auth.status <> 'ok' then
    return jsonb_build_object('ok', false, 'reason', v_auth.status);
  end if;
  if v_auth.role <> 'admin' then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_guests is null or jsonb_typeof(p_guests) <> 'array' or jsonb_array_length(p_guests) > 2000 then
    return jsonb_build_object('ok', false, 'reason', 'invalid-guests');
  end if;

  perform public.gala_checkin_lock(v_event);
  v_ver := public.gala_checkin_bump(v_event);
  v_count := public.gala_checkin_upsert_guests(v_event, p_guests, v_ver, v_max);

  insert into public.gala_event_log (event_slug, version, kind, actor, session_id, detail)
  values (v_event, v_ver, 'import', v_auth.actor, v_auth.session_id,
    jsonb_build_object('rows', v_count, 'max_group', v_max, 'per_person', v_max <= 1));

  return jsonb_build_object('ok', true, 'rows', v_count, 'version', v_ver,
    'max_group', v_max, 'per_person', v_max <= 1);
end;
$fn$;

-- 2) D6: pre-assignment runs in seating order ---------------------------------
-- Before: groups were ordered by min(table_number) nulls last, then the party
-- LABEL, then the group key - so table 4's numbers were right but the order
-- inside a table was alphabetical, not the seat order the room is set to.
-- After: each group is anchored on its first guest by
--   (table_number nulls last, seat nulls last, name, id)
-- and the groups are ordered by that same tuple, so paddle 1 is table 1 seat 1
-- and the no-table tail (Late Night) lands after the last table.
--
-- Already correct, kept: only 'free' pool rows are used, ascending; groups that
-- already hold a paddle are skipped; the op_id replay makes it idempotent.
-- New: the summary carries skipped, first_number and last_number.

create or replace function public.gala_checkin_preassign_all(
  p_event text,
  p_token text,
  p_op_id uuid,
  p_dinner_only boolean default true
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
  v_ver bigint;
  v_done integer;
  v_left integer;
  v_skipped integer;
  v_first integer;
  v_last integer;
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

  perform public.gala_checkin_lock(v_event);

  select * into v_prior from public.gala_event_log l where l.event_slug = v_event and l.op_id = p_op_id;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true,
      'assigned', v_prior.detail -> 'assigned',
      'skipped', coalesce(v_prior.detail -> 'skipped', 'null'::jsonb),
      'first_number', coalesce(v_prior.detail -> 'first_number', 'null'::jsonb),
      'last_number', coalesce(v_prior.detail -> 'last_number', 'null'::jsonb),
      'left_without', coalesce(v_prior.detail -> 'left_without', 'null'::jsonb),
      'version', v_prior.version);
  end if;

  -- Counted BEFORE the writes: groups in scope that already hold a paddle and
  -- are therefore left exactly as they are.
  select count(distinct g.paddle_group) into v_skipped
  from public.gala_event_guests g
  where g.event_slug = v_event and g.removed_at is null
    and (not coalesce(p_dinner_only, true) or g.has_dinner)
    and exists (
      select 1 from public.gala_event_paddles p
      where p.event_slug = v_event and p.paddle_group = g.paddle_group
    );

  v_ver := public.gala_checkin_bump(v_event);

  with anchor as (
    -- One row per group: the guest that group is seated by.
    select distinct on (g.paddle_group)
           g.paddle_group, g.table_number, g.seat, g.name, g.id
    from public.gala_event_guests g
    where g.event_slug = v_event and g.removed_at is null
      and (not coalesce(p_dinner_only, true) or g.has_dinner)
      and not exists (
        select 1 from public.gala_event_paddles p
        where p.event_slug = v_event and p.paddle_group = g.paddle_group
      )
    order by g.paddle_group, g.table_number nulls last, g.seat nulls last, g.name, g.id
  ),
  need as (
    select a.paddle_group,
           row_number() over (
             order by a.table_number nulls last, a.seat nulls last, a.name, a.id
           ) as rn
    from anchor a
  ),
  free as (
    select p.paddle_number, row_number() over (order by p.paddle_number) as rn
    from public.gala_event_paddles p
    where p.event_slug = v_event and p.status = 'free'
  ),
  upd as (
    update public.gala_event_paddles p
       set status = 'assigned', paddle_group = need.paddle_group, preassigned = true,
           assigned_at = now(), assigned_by = v_auth.actor, row_version = v_ver, updated_at = now()
      from need join free using (rn)
     where p.event_slug = v_event and p.paddle_number = free.paddle_number
    returning p.paddle_number
  )
  select count(*)::integer, min(u.paddle_number), max(u.paddle_number)
    into v_done, v_first, v_last
  from upd u;

  update public.gala_event_guests g set row_version = v_ver
   where g.event_slug = v_event
     and g.paddle_group in (
       select p.paddle_group from public.gala_event_paddles p
       where p.event_slug = v_event and p.row_version = v_ver and p.paddle_group is not null
     );

  select count(distinct g.paddle_group) into v_left
  from public.gala_event_guests g
  where g.event_slug = v_event and g.removed_at is null
    and (not coalesce(p_dinner_only, true) or g.has_dinner)
    and not exists (
      select 1 from public.gala_event_paddles p
      where p.event_slug = v_event and p.paddle_group = g.paddle_group
    );

  insert into public.gala_event_log (event_slug, version, op_id, kind, actor, session_id, detail)
  values (v_event, v_ver, p_op_id, 'preassign', v_auth.actor, v_auth.session_id,
    jsonb_build_object('assigned', v_done, 'left_without', v_left, 'skipped', v_skipped,
      'first_number', v_first, 'last_number', v_last,
      'dinner_only', coalesce(p_dinner_only, true)));

  return jsonb_build_object('ok', true, 'replayed', false, 'assigned', v_done,
    'skipped', v_skipped, 'first_number', v_first, 'last_number', v_last,
    'left_without', v_left, 'version', v_ver);
end;
$fn$;

-- 3) D7: the walk-in already is one call --------------------------------------
-- gala_checkin_walkin inserts the guest and hands the row straight to
-- gala_checkin_apply, whose default paddle mode is 'auto' - so "create, check
-- in, claim the next free number" was ALREADY atomic, and a dry pool already
-- rolls the whole walk-in back. Two things were missing, and only these change:
--
--   a) p_opts.assign_paddle, a readable spelling of the paddle option. true is
--      the existing default (auto), false is the existing {"paddle":"none"}.
--      An explicit "paddle" key still wins, so every existing caller is
--      untouched and every existing test still holds.
--   b) the authoritative number in the answer. It was only reachable by digging
--      through 'guests' or 'paddles', and a REPLAYED walk-in (the retry a flaky
--      iPad actually makes) carried no number at all. Now every answer carries
--      paddle_number / paddle_numbers, read live from the pool.

create or replace function public.gala_checkin_paddle_opt(
  p_opts jsonb,
  out mode text,
  out number integer,
  out lo integer,
  out hi integer
)
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_opts jsonb := coalesce(p_opts, '{}'::jsonb);
  v_pad jsonb := v_opts -> 'paddle';
  v_asg jsonb := v_opts -> 'assign_paddle';
  v_txt text;
begin
  mode := 'auto';

  -- Only consulted when no explicit "paddle" was given.
  if v_pad is null and v_asg is not null then
    if v_asg = 'true'::jsonb then
      mode := 'auto';
    elsif v_asg = 'false'::jsonb then
      mode := 'none';
    elsif jsonb_typeof(v_asg) <> 'null' then
      mode := 'invalid';
    end if;
  end if;

  if v_pad is not null and jsonb_typeof(v_pad) in ('number', 'string') then
    v_txt := btrim(v_pad #>> '{}');
    if v_txt = 'none' then
      mode := 'none';
    elsif v_txt ~ '^[0-9]{1,4}$' then
      mode := 'number';
      number := v_txt::integer;
    elsif v_txt <> 'auto' and v_txt <> '' then
      mode := 'invalid';
    end if;
  end if;

  v_txt := btrim(coalesce(v_opts ->> 'min', ''));
  if v_txt ~ '^[0-9]{1,4}$' then lo := v_txt::integer; end if;
  v_txt := btrim(coalesce(v_opts ->> 'max', ''));
  if v_txt ~ '^[0-9]{1,4}$' then hi := v_txt::integer; end if;
end;
$fn$;

-- The numbers the guests in p_ids are holding RIGHT NOW, straight from the
-- pool. Used to stamp every check-in answer, including replays.
create or replace function public.gala_checkin_held_numbers(p_event text, p_ids text[])
returns integer[]
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(array_agg(distinct p.paddle_number order by p.paddle_number), '{}'::integer[])
  from public.gala_event_guests g
  join public.gala_event_paddles p
    on p.event_slug = g.event_slug and p.paddle_group = g.paddle_group
  where g.event_slug = p_event and g.id = any (coalesce(p_ids, '{}'::text[]))
$fn$;

create or replace function public.gala_checkin_apply(
  p_event text,
  p_ids text[],
  p_opts jsonb,
  p_actor text,
  p_session bigint,
  p_op_id uuid,
  p_kind text
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_opt record;
  v_now timestamptz := clock_timestamp();
  v_found integer;
  v_newly text[];
  v_already text[];
  v_groups text[];
  v_group text;
  v_cur integer;
  v_got integer;
  v_need integer;
  v_free integer;
  v_ver bigint;
  v_conflict jsonb;
  v_numbers integer[] := '{}';
  v_held integer[];
begin
  select * into v_opt from public.gala_checkin_paddle_opt(p_opts);
  if v_opt.mode = 'invalid' then
    return jsonb_build_object('ok', false, 'reason', 'invalid-options');
  end if;

  -- Row locks in id order. Redundant under the event lock; kept so a hand-run
  -- UPDATE in the SQL editor on gala night still cannot interleave.
  select count(*) into v_found
  from (
    select 1 from public.gala_event_guests g
    where g.event_slug = p_event and g.id = any (p_ids) and g.removed_at is null
    order by g.id
    for update
  ) locked;

  if v_found <> cardinality(p_ids) then
    return jsonb_build_object('ok', false, 'reason', 'unknown-guest');
  end if;

  select array_agg(g.id order by g.id) filter (where g.checked_in_at is null),
         array_agg(g.id order by g.id) filter (where g.checked_in_at is not null)
    into v_newly, v_already
  from public.gala_event_guests g
  where g.event_slug = p_event and g.id = any (p_ids);

  -- Everyone was already in: a friendly state, not an error, and not a change.
  if v_newly is null then
    v_held := public.gala_checkin_held_numbers(p_event, p_ids);

    insert into public.gala_event_log (event_slug, version, kind, guest_ids, actor, session_id, detail)
    values (p_event, 0, 'checkin_noop', p_ids, p_actor, p_session, jsonb_build_object('attempted_op', p_op_id));

    return jsonb_build_object(
      'ok', true, 'outcome', 'already', 'replayed', false,
      'version', (select s.version from public.gala_event_state s where s.event_slug = p_event),
      'newly', '[]'::jsonb, 'already', to_jsonb(v_already),
      'paddle_number', case when cardinality(v_held) = 1 then v_held[1] end,
      'paddle_numbers', to_jsonb(v_held),
      'guests', public.gala_checkin_guests_json(p_event, p_ids, null),
      'paddles', '[]'::jsonb
    );
  end if;

  select array_agg(distinct g.paddle_group order by g.paddle_group) into v_groups
  from public.gala_event_guests g
  where g.event_slug = p_event and g.id = any (v_newly);

  -- Everything that can say "no" is decided BEFORE the first write.
  if v_opt.mode = 'number' then
    if cardinality(v_groups) > 1 then
      return jsonb_build_object('ok', false, 'reason', 'mixed-groups');
    end if;

    select p.paddle_number into v_cur
    from public.gala_event_paddles p
    where p.event_slug = p_event and p.paddle_group = v_groups[1];

    if found and v_cur <> v_opt.number then
      return jsonb_build_object('ok', false, 'reason', 'group-has-paddle', 'paddle_number', v_cur);
    elsif not found then
      v_conflict := public.gala_checkin_paddle_conflict(p_event, v_opt.number, v_opt.lo, v_opt.hi);
      if v_conflict is not null then
        return v_conflict;
      end if;
    end if;
  elsif v_opt.mode = 'auto' then
    select count(*) into v_need
    from unnest(v_groups) grp
    where not exists (
      select 1 from public.gala_event_paddles p
      where p.event_slug = p_event and p.paddle_group = grp
    );

    select count(*) into v_free
    from public.gala_event_paddles p
    where p.event_slug = p_event and p.status = 'free'
      and (v_opt.lo is null or p.paddle_number >= v_opt.lo)
      and (v_opt.hi is null or p.paddle_number <= v_opt.hi);

    if v_need > v_free then
      return jsonb_build_object('ok', false, 'reason', 'pool-empty', 'needed', v_need, 'free', v_free);
    end if;
  end if;

  -- Writes. The block is a savepoint: if a constraint ever fires (it cannot
  -- under the event lock; this is the backstop) nothing of this op survives and
  -- the client simply retries with the same op_id.
  begin
    v_ver := public.gala_checkin_bump(p_event);

    if v_opt.mode <> 'none' then
      foreach v_group in array v_groups loop
        v_got := public.gala_checkin_claim_paddle(
          p_event, v_group, v_opt.number, v_opt.lo, v_opt.hi, p_actor, false, v_ver
        );
        if v_got is null then
          raise exception using errcode = 'GC001', message = 'no paddle could be claimed';
        end if;
        v_numbers := v_numbers || v_got;
      end loop;
    end if;

    update public.gala_event_guests g
       set checked_in_at = v_now, checked_in_by = p_actor, checked_in_session = p_session,
           checkin_op = p_op_id, row_version = v_ver, updated_at = v_now
     where g.event_slug = p_event and g.id = any (v_newly);

    insert into public.gala_event_log (event_slug, version, op_id, kind, guest_ids, paddle_number, actor, session_id, detail)
    values (
      p_event, v_ver, p_op_id, p_kind, p_ids,
      case when cardinality(v_numbers) = 1 then v_numbers[1] end,
      p_actor, p_session,
      jsonb_build_object(
        'newly', to_jsonb(v_newly),
        'already', to_jsonb(coalesce(v_already, '{}'::text[])),
        'paddles', to_jsonb(v_numbers),
        'paddle_mode', v_opt.mode
      )
    );
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'reason', 'retry', 'detail', 'unique-backstop');
    when sqlstate 'GC001' then
      return jsonb_build_object('ok', false, 'reason', 'pool-empty');
  end;

  -- Read back rather than trusting v_numbers: with paddle mode 'none' the guest
  -- may still hold a number from a pre-assignment, and that is the number the
  -- clerk needs to hear.
  v_held := public.gala_checkin_held_numbers(p_event, p_ids);

  return jsonb_build_object(
    'ok', true,
    'outcome', case when v_already is null then 'checked_in' else 'partial' end,
    'replayed', false,
    'version', v_ver,
    'newly', to_jsonb(v_newly),
    'already', to_jsonb(coalesce(v_already, '{}'::text[])),
    'paddle_number', case when cardinality(v_held) = 1 then v_held[1] end,
    'paddle_numbers', to_jsonb(v_held),
    'guests', public.gala_checkin_guests_json(p_event, null, v_ver - 1),
    'paddles', public.gala_checkin_paddles_json(p_event, v_ver - 1)
  );
end;
$fn$;

-- A replayed op now answers with the number too, read live, so a retried
-- walk-in tells the clerk the same paddle the first call did.
create or replace function public.gala_checkin_replay(p_event text, p_log public.gala_event_log)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'ok', true,
    'outcome', coalesce(p_log.detail ->> 'outcome', case p_log.kind when 'undo' then 'undone' else 'checked_in' end),
    'replayed', true,
    'version', (select s.version from public.gala_event_state s where s.event_slug = p_event),
    'newly', coalesce(p_log.detail -> 'newly', '[]'::jsonb),
    'already', coalesce(p_log.detail -> 'already', '[]'::jsonb),
    'paddle_number', case
      when cardinality(public.gala_checkin_held_numbers(p_event, p_log.guest_ids)) = 1
      then (public.gala_checkin_held_numbers(p_event, p_log.guest_ids))[1] end,
    'paddle_numbers', to_jsonb(public.gala_checkin_held_numbers(p_event, p_log.guest_ids)),
    'guests', public.gala_checkin_guests_json(p_event, p_log.guest_ids, null),
    'paddles', '[]'::jsonb
  )
$fn$;

-- 4) D8: the projector shows the holder's name --------------------------------
-- Before: donor_name -> the guest row's party_label -> the group's party_label
-- -> "Anonymous". With one paddle per person, party_label is the HOUSEHOLD
-- ("Rosa Delgado + 1"), so paddle 42's pledge printed the buyer, not the person
-- who actually raised the paddle.
-- After: donor_name -> the NAME of the guest frozen on the donation row, when
-- that guest is not a placeholder -> party_label (the guest's, then the
-- group's) -> "Anonymous".
--
-- A placeholder "+1" seat has a generated name ("Guest of Rosa Delgado (2)"),
-- so it falls through to party_label on purpose: the screen says the household,
-- never a filler string.
--
-- gala_donation_record already freezes guest_id from the paddle at the moment
-- the gift is keyed (gala_donation_resolve), so "paddle 42, $500" carries the
-- holder without any change there. The per-gift anonymous flag and the
-- show_names master switch are applied by the CALLERS and are untouched.
-- paddle_group, emails and phones are still never returned, and
-- gala_display_public stays name-free: it does not call this.

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
      select g.name from public.gala_event_guests g
      where g.event_slug = p_event and g.id = p_guest_id and not g.placeholder
    ), '')), ''),
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

-- 5) Grants -------------------------------------------------------------------
-- CREATE OR REPLACE keeps a function's privileges, so this block only restates
-- what the two earlier migrations already granted. It is here so the set is
-- provable from this file alone, and so gala_checkin_held_numbers (new, and
-- internal) starts life with EXECUTE revoked from PUBLIC like every other
-- helper.

do $grants$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'gala_checkin_upsert_guests', 'gala_checkin_import', 'gala_checkin_preassign_all',
        'gala_checkin_paddle_opt', 'gala_checkin_held_numbers', 'gala_checkin_apply',
        'gala_checkin_replay', 'gala_display_donor_name'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.sig);

    if r.proname in ('gala_checkin_import', 'gala_checkin_preassign_all') then
      execute format('grant execute on function %s to anon, authenticated', r.sig);
    end if;
  end loop;
end
$grants$;

notify pgrst, 'reload schema';

-- Runbook ----------------------------------------------------------------------
-- The 2026 seed, in this order, as an admin session:
--   select public.gala_checkin_sync_seating('gala-2026', '<admin token>', 'gala-2026', 0);
--     -- or, from a CSV:
--   select public.gala_checkin_import('gala-2026', '<admin token>', '<guests json>'::jsonb, 0);
--   select public.gala_checkin_pool_init('gala-2026', '<admin token>', 1, <N + walk-in headroom>);
--   select public.gala_checkin_preassign_all('gala-2026', '<admin token>', gen_random_uuid(), false);
-- p_max_group => 0 is the one-paddle-per-person policy (D5). p_dinner_only =>
-- false pre-assigns the Late Night tail too, after the last table (D6).
-- Check the answer: first_number should be 1 and last_number the ticket count.
-- Walk-ins then take last_number + 1 upward, one call each:
--   select public.gala_checkin_walkin('gala-2026', '<door token>', gen_random_uuid(),
--     '{"name": "..."}'::jsonb);            -- assigns; read paddle_number back
