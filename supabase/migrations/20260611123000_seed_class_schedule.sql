-- Seed the forward class schedule from the imported history: the sessions
-- already loaded through 2026-06-30 ARE the current operating schedule.
-- A slot qualifies when it ran 3+ times since May and still appears on or
-- after June 15; its instructor is the most recent non-substitute teacher.
-- Inserts go newest-first so the room-overlap trigger keeps the current
-- timetable and skips superseded variants of the same slot.

do $$
declare
  candidate record;
  picked_instructor text;
  inserted_count integer := 0;
  skipped_count integer := 0;
begin
  for candidate in
    select classroom, day_of_week, start_time, class_type,
           count(*) as sessions,
           max(session_date) as last_seen
    from public.class_history
    where session_date between date '2026-05-01' and date '2026-06-30'
    group by classroom, day_of_week, start_time, class_type
    having count(*) >= 3 and max(session_date) >= date '2026-06-15'
    order by max(session_date) desc, count(*) desc
  loop
    select h.instructors into picked_instructor
    from public.class_history h
    where h.classroom = candidate.classroom
      and h.day_of_week = candidate.day_of_week
      and h.start_time = candidate.start_time
      and h.class_type = candidate.class_type
      and h.session_date >= date '2026-05-01'
      and not h.has_substitute
    order by h.session_date desc
    limit 1;

    if picked_instructor is null then
      select h.instructors into picked_instructor
      from public.class_history h
      where h.classroom = candidate.classroom
        and h.day_of_week = candidate.day_of_week
        and h.start_time = candidate.start_time
        and h.class_type = candidate.class_type
      order by h.session_date desc
      limit 1;
    end if;

    begin
      insert into public.class_schedule_slots
        (day_of_week, start_time, duration_minutes, class_type, instructor,
         room, active, effective_from, notes)
      values (
        candidate.day_of_week,
        candidate.start_time,
        case when candidate.class_type ilike '50 minute%' then 50 else 60 end,
        candidate.class_type,
        nullif(btrim(picked_instructor), ''),
        candidate.classroom,
        true,
        date '2026-06-11',
        format('Seeded from history: %s sessions since May, last on %s',
               candidate.sessions, candidate.last_seen)
      );
      inserted_count := inserted_count + 1;
    exception when exclusion_violation then
      -- A newer slot already owns this room/time window; this candidate is
      -- the superseded variant.
      skipped_count := skipped_count + 1;
    end;
  end loop;

  raise notice 'class schedule seed: % inserted, % skipped as superseded',
    inserted_count, skipped_count;
end $$;
