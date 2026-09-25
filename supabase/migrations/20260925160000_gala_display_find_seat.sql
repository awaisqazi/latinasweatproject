-- 20260925160000_gala_display_find_seat.sql
--
-- "Find my table" on a guest's phone (/gala/live, the unkeyed mirror). The
-- guest types their name once; this answers with their table and seat.
--
-- gala_display_find_seat(p_event, p_query)
--   * normalizes case and accents (translate map: unaccent is not installed on
--     this project), drops apostrophes, turns anything else that is not a
--     letter into a space;
--   * needs at least 3 letters, otherwise {ok: false, reason: 'short'};
--   * reads the same plan as gala_display_seating_board: the seating slug in
--     gala_event_display.config.seating_slug, else the event slug;
--   * matches a guest when the query is their full name, their first plus last
--     name, their first name plus any later name, or their last name (a
--     compound surname counts: "de la cruz"). Generic placeholders ("Guest of
--     Jane Doe (2)") match only when the query contains the buyer's name;
--   * returns at most 5 candidates, best match first, each exactly
--     {name, table_number, seat, late_night}: seat is 1-based, table and seat
--     are null when the guest has no seat. No ids, emails, phones, meals,
--     notes, parties or tags;
--   * sleeps 0.15 s per call to blunt enumeration. No lockout.
-- Anon + authenticated may execute it. The normalizer is never granted.

create or replace function public.gala_display_norm_name(p text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $fn$
  select btrim(regexp_replace(
    regexp_replace(
      translate(
        lower(regexp_replace(coalesce(p, ''), '[''’`´]', '', 'g')),
        'áàâäãåāăąéèêëēėęěíìîïīįóòôöõøōőúùûüūůűñńçćčýÿšśžźżłđ',
        'aaaaaaaaaeeeeeeeeiiiiiioooooooouuuuuuunncccyysszzzld'
      ),
      '[^a-z]+', ' ', 'g'),
    '\s+', ' ', 'g'));
$fn$;

create or replace function public.gala_display_find_seat(p_event text, p_query text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_q text := public.gala_display_norm_name(left(coalesce(p_query, ''), 120));
  v_seat_slug text;
  v_plan jsonb;
  v_out jsonb;
begin
  perform pg_catalog.pg_sleep(0.15);

  if char_length(replace(v_q, ' ', '')) < 3 then
    return jsonb_build_object('ok', false, 'reason', 'short');
  end if;

  select coalesce(nullif(btrim(coalesce(d.config ->> 'seating_slug', '')), ''), v_event)
    into v_seat_slug
  from public.gala_event_display d where d.event_slug = v_event;
  v_seat_slug := coalesce(v_seat_slug, v_event);

  select sp.plan into v_plan from public.gala_seating_plans sp where sp.slug = v_seat_slug;
  if v_plan is null then
    return jsonb_build_object('ok', false, 'reason', 'no-plan');
  end if;

  with g as (
    select
      e.key as gid,
      e.value as guest,
      -- "(2)" style suffixes are planner bookkeeping, never part of a name.
      btrim(regexp_replace(coalesce(e.value ->> 'name', ''), '\s*\((d|\d+)\)\s*$', '', 'i')) as shown,
      public.gala_display_norm_name(regexp_replace(coalesce(e.value ->> 'name', ''), '\s*\((d|\d+)\)\s*$', '', 'i')) as n,
      public.gala_display_norm_name(coalesce(nullif(e.value ->> 'buyerName', ''), e.value ->> 'partyLabel', '')) as buyer
    from jsonb_each(case when jsonb_typeof(v_plan -> 'guests') = 'object' then v_plan -> 'guests' else '{}'::jsonb end) e
  ),
  t as (
    select g.*,
      string_to_array(g.n, ' ') as w,
      (coalesce((g.guest ->> 'placeholder')::boolean, false)
        or g.n ~ '^(guest|guests|plus one|plus 1|tbd|tba|companion|date)( |$)') as generic
    from g
    where g.n <> ''
  ),
  m as (
    select t.*,
      case
        when t.generic then
          case when t.buyer <> '' and char_length(t.buyer) >= 3
                    and position(t.buyer in v_q) > 0 then 5 end
        when t.n = v_q then 1
        when cardinality(t.w) >= 2 and v_q = t.w[1] || ' ' || t.w[cardinality(t.w)] then 2
        when cardinality(t.w) >= 2
             and split_part(v_q, ' ', 1) = t.w[1]
             and position(' ' in v_q) > 0
             and (' ' || array_to_string(t.w[2:], ' ') || ' ') like
                 ('% ' || substr(v_q, position(' ' in v_q) + 1) || ' %') then 3
        when cardinality(t.w) >= 2 and (t.n like '% ' || v_q) then 4
        else null
      end as rank
    from t
  ),
  hit as (
    select m.*, s.value as seat_row
    from m
    left join lateral (
      select v_plan -> 'seating' -> m.gid as value
    ) s on true
    where m.rank is not null
    order by m.rank, m.n
    limit 5
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', h.shown,
      'table_number', tb.value -> 'number',
      'seat', case when tb.value is not null and h.seat_row ->> 'seat' ~ '^[0-9]{1,4}$'
                   then to_jsonb((h.seat_row ->> 'seat')::integer + 1) else 'null'::jsonb end,
      'late_night', (h.guest ->> 'hasDinner') = 'false' and tb.value is null
    ) order by h.rank, h.n), '[]'::jsonb)
    into v_out
  from hit h
  left join lateral (
    select x.value
    from jsonb_array_elements(case when jsonb_typeof(v_plan -> 'tables') = 'array' then v_plan -> 'tables' else '[]'::jsonb end) x(value)
    where x.value ->> 'id' = h.seat_row ->> 'tableId'
    limit 1
  ) tb on true;

  return jsonb_build_object('ok', true, 'matches', v_out);
end;
$fn$;

revoke all on function public.gala_display_norm_name(text) from public, anon, authenticated, service_role;
revoke all on function public.gala_display_find_seat(text, text) from public, anon, authenticated, service_role;
grant execute on function public.gala_display_find_seat(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
