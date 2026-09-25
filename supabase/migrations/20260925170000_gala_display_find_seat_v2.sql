-- 20260925170000_gala_display_find_seat_v2.sql
--
-- "Find my table" becomes a search-as-you-type list on guests' phones. Same
-- signature, same privacy contract as 20260925160000 (each row is exactly
-- {name, table_number, seat, late_night}), new matching:
--   * at least 2 letters, otherwise {ok: false, reason: 'short'};
--   * EVERY word of the query must be the start of some word of the guest's
--     normalized name: "ju" lists every Juan, Julianna, Juarez; "ju ba" narrows
--     to Juan Barbosa; "barb" finds Barbosa;
--   * "Guest of X" placeholders match only when a query word starts a word of
--     the buyer's name (so "gu" does not list every placeholder);
--   * best match first: the whole name starts with the query, then the query's
--     first word starts the first name, then any word; placeholders last; then
--     by name. At most 8 rows;
--   * same plan source (config.seating_slug or the event slug), same 0.15 s
--     sleep, same grants (anon + authenticated; the normalizer stays private).

create or replace function public.gala_display_find_seat(p_event text, p_query text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_event text := btrim(coalesce(p_event, ''));
  v_q text := public.gala_display_norm_name(left(coalesce(p_query, ''), 120));
  v_qt text[];
  v_seat_slug text;
  v_plan jsonb;
  v_out jsonb;
begin
  perform pg_catalog.pg_sleep(0.15);

  if char_length(replace(v_q, ' ', '')) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'short');
  end if;
  v_qt := (select array_agg(x) from unnest(string_to_array(v_q, ' ')) x where x <> '');

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
      btrim(regexp_replace(coalesce(e.value ->> 'name', ''), '\s*\((d|\d+)\)\s*$', '', 'i')) as shown,
      public.gala_display_norm_name(regexp_replace(coalesce(e.value ->> 'name', ''), '\s*\((d|\d+)\)\s*$', '', 'i')) as n,
      public.gala_display_norm_name(coalesce(nullif(e.value ->> 'buyerName', ''), e.value ->> 'partyLabel', '')) as buyer
    from jsonb_each(case when jsonb_typeof(v_plan -> 'guests') = 'object' then v_plan -> 'guests' else '{}'::jsonb end) e
  ),
  t as (
    select g.*,
      string_to_array(g.n, ' ') as w,
      string_to_array(g.buyer, ' ') as bw,
      (coalesce(g.guest ->> 'placeholder', '') = 'true'
        or g.n ~ '^(guest|guests|plus one|plus 1|tbd|tba|companion|date)( |$)') as generic
    from g
    where g.n <> ''
  ),
  m as (
    select t.*,
      case
        when t.generic then 4
        when t.n like v_q || '%' then 1
        when t.w[1] like v_qt[1] || '%' then 2
        else 3
      end as rank
    from t
    where not exists (
        select 1 from unnest(v_qt) qt
        where not exists (select 1 from unnest(t.w) nt where nt like qt || '%')
      )
      and (not t.generic or exists (
        select 1 from unnest(v_qt) qt, unnest(t.bw) b where b <> '' and b like qt || '%'
      ))
  ),
  hit as (
    select m.*, v_plan -> 'seating' -> m.gid as seat_row
    from m
    order by m.rank, m.n
    limit 8
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

revoke all on function public.gala_display_find_seat(text, text) from public, anon, authenticated, service_role;
grant execute on function public.gala_display_find_seat(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
