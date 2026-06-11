-- get_space_conflicts is called by the space_bookings trigger, which also
-- fires for service-role and maintenance inserts where auth.uid() is null.
-- Scope the module gate to real user sessions; anon cannot execute the
-- function at all (no grant), so null-uid here means a service context.

create or replace function public.get_space_conflicts(
  p_space text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_exclude_booking uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  booking_conflicts jsonb;
  class_conflicts jsonb;
begin
  if (select auth.uid()) is not null
     and not (select app_private.has_module('spaces')) then
    raise exception 'Spaces module access required.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'type', 'booking',
      'title', b.title,
      'kind', b.kind,
      'starts_at', b.starts_at,
      'ends_at', b.ends_at
    ) order by b.starts_at), '[]'::jsonb)
    into booking_conflicts
  from public.space_bookings b
  where b.space = p_space
    and (p_exclude_booking is null or b.id <> p_exclude_booking)
    and b.starts_at < p_ends_at
    and b.ends_at > p_starts_at;

  select coalesce(jsonb_agg(jsonb_build_object(
      'type', 'class',
      'title', occ.class_type,
      'instructor', occ.instructor,
      'starts_at', occ.occ_start,
      'ends_at', occ.occ_end
    ) order by occ.occ_start), '[]'::jsonb)
    into class_conflicts
  from (
    select
      s.class_type,
      s.instructor,
      (d.day::date + s.start_time) at time zone 'America/Chicago' as occ_start,
      (d.day::date + s.start_time + make_interval(mins => s.duration_minutes))
        at time zone 'America/Chicago' as occ_end
    from generate_series(
      (p_starts_at at time zone 'America/Chicago')::date,
      (p_ends_at at time zone 'America/Chicago')::date,
      interval '1 day'
    ) as d(day)
    join public.class_schedule_slots s
      on s.active
     and s.room = p_space
     and s.day_of_week = extract(dow from d.day)::smallint
     and d.day::date >= s.effective_from
     and (s.effective_until is null or d.day::date <= s.effective_until)
  ) occ
  where occ.occ_start < p_ends_at
    and occ.occ_end > p_starts_at;

  return booking_conflicts || class_conflicts;
end;
$$;

notify pgrst, 'reload schema';
