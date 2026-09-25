-- 20260925150000_gala_display_seating_board.sql
--
-- The projector's "Find your table" board, unlocked by the DISPLAY KEY alone.
--
-- Until now the projector needed the seating planner's passcode in its URL
-- (#k=<display key>&seat=<passcode>) to show names on the seating loop. The
-- organizer decided the display key is enough: it already unlocks donor names
-- on the room display, so it also unlocks the seating board. No second secret,
-- no extra step on the night.
--
-- gala_display_seating_board(p_event, p_display_key, p_version)
--   * checks the key exactly like gala_display_feed: sha256 against
--     gala_event_display.key_hash, 8 to 128 chars; a wrong key is logged in the
--     same 'display:<slug>' attempts namespace, with the same caps, the same
--     0.25 s sleep, and a correct key clears this address's failures;
--   * reads the seating plan for the event's seating slug: the event slug
--     itself, or gala_event_display.config.seating_slug when set;
--   * returns ONLY what the board draws: per table its number, seats and plan
--     x/y, and per seated guest the seat index and name. No guest ids, emails,
--     phones, meals, notes, parties or tags. Plus the podium's x/y so the board
--     can say which side it is on.
--   * p_version: the plan version the caller already holds. When it still
--     matches, the answer is {ok, version, unchanged: true} and no names move.
--
-- A refusal is the same shape whatever the cause (no row, no key set, wrong
-- key): {ok: false, reason: 'refused'}. Anon + authenticated may execute it,
-- like the other public display RPCs. The builder helper is never granted.

create or replace function public.gala_display_seating_json(p_seating_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case when sp.slug is null then null else jsonb_build_object(
    'version', sp.version,
    'updated_at', sp.updated_at,
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'number', t.value -> 'number',
        'seats', t.value -> 'seats',
        'x', t.value -> 'x',
        'y', t.value -> 'y',
        'guests', coalesce((
          select jsonb_agg(jsonb_build_object(
            'seat', s.value -> 'seat',
            'name', sp.plan -> 'guests' -> s.key ->> 'name'
          ) order by case when s.value ->> 'seat' ~ '^[0-9]{1,4}$' then (s.value ->> 'seat')::integer end)
          from jsonb_each(case when jsonb_typeof(sp.plan -> 'seating') = 'object' then sp.plan -> 'seating' else '{}'::jsonb end) s
          where s.value ->> 'tableId' = t.value ->> 'id'
            and coalesce(btrim(sp.plan -> 'guests' -> s.key ->> 'name'), '') <> ''
        ), '[]'::jsonb)
      ) order by t.ordinality)
      from jsonb_array_elements(case when jsonb_typeof(sp.plan -> 'tables') = 'array' then sp.plan -> 'tables' else '[]'::jsonb end)
           with ordinality t(value, ordinality)
    ), '[]'::jsonb),
    'podium', (
      select jsonb_build_object('x', f.value -> 'x', 'y', f.value -> 'y')
      from jsonb_array_elements(case when jsonb_typeof(sp.plan -> 'fixtures') = 'array' then sp.plan -> 'fixtures' else '[]'::jsonb end) f(value)
      where f.value ->> 'type' = 'podium'
      limit 1
    )
  ) end
  from (select 1) one
  left join public.gala_seating_plans sp on sp.slug = btrim(coalesce(p_seating_slug, ''));
$fn$;

create or replace function public.gala_display_seating_board(
  p_event text,
  p_display_key text default null,
  p_version integer default null
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
  v_named boolean := false;
  v_seat_slug text;
  v_ver integer;
  v_board jsonb;
  v_ip text;
  v_fail_ip integer;
  v_fail_all integer;
begin
  select * into v_d from public.gala_event_display d where d.event_slug = v_event;

  -- The key check, as in gala_display_feed.
  if v_d.key_hash is not null
     and char_length(v_key) between 8 and 128
     and v_d.key_hash = extensions.digest(v_key, 'sha256') then
    v_named := true;
  elsif v_key <> '' then
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
    return jsonb_build_object('ok', false, 'reason', 'refused');
  end if;

  if exists (
    select 1 from public.gala_event_attempts a where a.event_slug = 'display:' || v_event
  ) then
    delete from public.gala_event_attempts a
    where a.event_slug = 'display:' || v_event
      and a.ip_hash = public.gala_checkin_client_ip();
  end if;

  v_seat_slug := coalesce(nullif(btrim(coalesce(v_d.config ->> 'seating_slug', '')), ''), v_event);

  select sp.version into v_ver from public.gala_seating_plans sp where sp.slug = v_seat_slug;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no-plan');
  end if;

  if p_version is not null and p_version = v_ver then
    return jsonb_build_object('ok', true, 'version', v_ver, 'unchanged', true);
  end if;

  v_board := public.gala_display_seating_json(v_seat_slug);
  return jsonb_build_object('ok', true, 'unchanged', false) || v_board;
end;
$fn$;

revoke all on function public.gala_display_seating_json(text) from public, anon, authenticated, service_role;
revoke all on function public.gala_display_seating_board(text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.gala_display_seating_board(text, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';

-- Runbook ----------------------------------------------------------------------
-- Point an event's projector at another seating plan (rehearsals):
--   update public.gala_event_display
--      set config = config || jsonb_build_object('seating_slug', '<plan slug>')
--    where event_slug = '<event>';
-- The display key itself is minted in /gala/admin, Tools (gala_display_rotate_key).
