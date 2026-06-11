-- Schedule planning round 2:
-- 1. copy_schedule_to_period(): start a new schedule period from the current
--    timetable (current slots end the day before, an editable copy begins).
-- 2. Instructor interest collection: periods open a public unlisted form
--    where instructors pick the time slots they want; admins review interest
--    alongside historical utilization and assign teachers.
-- 3. Spaces-module admins may append fresh MarianaTek exports to
--    class_history so insights stay current.

-- Allow history re-imports from the dashboard.
drop policy if exists "Spaces module can import class history" on public.class_history;
create policy "Spaces module can import class history"
on public.class_history
for insert
to authenticated
with check ((select app_private.has_module('spaces')));

-- ---------------------------------------------------------------------------
-- Periods
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_periods (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  starts_on date not null,
  notes text,
  status text not null default 'collecting' check (status in ('collecting', 'closed')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_schedule_periods_updated_at on public.schedule_periods;
create trigger set_schedule_periods_updated_at
before update on public.schedule_periods
for each row execute function public.set_updated_at();

alter table public.schedule_periods enable row level security;
revoke all on table public.schedule_periods from anon;
grant select, insert, update, delete on table public.schedule_periods to authenticated;
grant all on table public.schedule_periods to service_role;

drop policy if exists "Spaces module manages periods" on public.schedule_periods;
create policy "Spaces module manages periods"
on public.schedule_periods for all to authenticated
using ((select app_private.has_module('spaces')))
with check ((select app_private.has_module('spaces')));

-- ---------------------------------------------------------------------------
-- Instructor interest submissions
-- ---------------------------------------------------------------------------
create table if not exists public.slot_interest (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.schedule_periods(id) on delete cascade,
  room text not null check (room in ('Little Village Room', 'Gage Park Room', 'Cafe')),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  duration_minutes integer not null default 60,
  class_type text,
  instructor_name text not null check (char_length(btrim(instructor_name)) between 1 and 120),
  instructor_email text not null check (
    instructor_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(instructor_email) <= 254
  ),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

create unique index if not exists slot_interest_dedupe
  on public.slot_interest (period_id, room, day_of_week, start_time, lower(instructor_email));
create index if not exists slot_interest_period_idx
  on public.slot_interest (period_id, room, day_of_week, start_time);

alter table public.slot_interest enable row level security;
revoke all on table public.slot_interest from anon;
grant select, delete on table public.slot_interest to authenticated;
grant all on table public.slot_interest to service_role;

drop policy if exists "Spaces module reads interest" on public.slot_interest;
create policy "Spaces module reads interest"
on public.slot_interest for select to authenticated
using ((select app_private.has_module('spaces')));

drop policy if exists "Spaces module deletes interest" on public.slot_interest;
create policy "Spaces module deletes interest"
on public.slot_interest for delete to authenticated
using ((select app_private.has_module('spaces')));

-- ---------------------------------------------------------------------------
-- Copy the live timetable into a new period (atomic).
-- ---------------------------------------------------------------------------
create or replace function public.copy_schedule_to_period(p_new_start date)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  copied integer := 0;
  closed integer := 0;
begin
  if not (select app_private.has_module('spaces')) then
    raise exception 'Spaces module access required.' using errcode = '42501';
  end if;

  if p_new_start is null or p_new_start <= current_date - 365 then
    raise exception 'Pick a valid start date for the new period.';
  end if;

  -- End the current run of every slot that would still be live on the new
  -- start date, the day before the new period begins.
  with affected as (
    update public.class_schedule_slots
    set effective_until = p_new_start - 1
    where active
      and effective_from < p_new_start
      and (effective_until is null or effective_until >= p_new_start)
    returning id, day_of_week, start_time, duration_minutes, class_type,
              instructor, room, notes
  ), inserted as (
    insert into public.class_schedule_slots
      (day_of_week, start_time, duration_minutes, class_type, instructor,
       room, active, effective_from, notes)
    select day_of_week, start_time, duration_minutes, class_type, instructor,
           room, true, p_new_start,
           'Copied from previous period'
    from affected
    returning id
  )
  select (select count(*) from inserted), (select count(*) from affected)
    into copied, closed;

  return jsonb_build_object('copied', copied, 'closed', closed);
end;
$$;

revoke all on function public.copy_schedule_to_period(date) from public;
grant execute on function public.copy_schedule_to_period(date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Public form surface (anon): the open period and its slot grid.
-- ---------------------------------------------------------------------------
create or replace function public.get_open_schedule_form()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  period record;
  slots jsonb;
begin
  select id, title, starts_on, notes
    into period
  from public.schedule_periods
  where status = 'collecting'
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('open', false);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'room', s.room,
      'day_of_week', s.day_of_week,
      'start_time', to_char(s.start_time, 'HH24:MI'),
      'duration_minutes', s.duration_minutes,
      'class_type', s.class_type
    ) order by s.room, s.day_of_week, s.start_time), '[]'::jsonb)
    into slots
  from public.class_schedule_slots s
  where s.active
    and s.effective_from <= period.starts_on
    and (s.effective_until is null or s.effective_until >= period.starts_on);

  return jsonb_build_object(
    'open', true,
    'period', jsonb_build_object(
      'id', period.id,
      'title', period.title,
      'starts_on', period.starts_on,
      'notes', period.notes
    ),
    'slots', slots
  );
end;
$$;

revoke all on function public.get_open_schedule_form() from public;
grant execute on function public.get_open_schedule_form() to anon, authenticated, service_role;

-- Anonymous interest submission, validated server-side.
create or replace function public.submit_slot_interest(
  p_period_id uuid,
  p_name text,
  p_email text,
  p_notes text,
  p_slots jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  slot jsonb;
  saved integer := 0;
  duplicates integer := 0;
begin
  if not exists (
    select 1 from public.schedule_periods
    where id = p_period_id and status = 'collecting'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array'
     or jsonb_array_length(p_slots) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_slots');
  end if;

  if jsonb_array_length(p_slots) > 60 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  for slot in select * from jsonb_array_elements(p_slots) loop
    begin
      insert into public.slot_interest
        (period_id, room, day_of_week, start_time, duration_minutes,
         class_type, instructor_name, instructor_email, notes)
      values (
        p_period_id,
        slot ->> 'room',
        (slot ->> 'day_of_week')::smallint,
        (slot ->> 'start_time')::time,
        coalesce((slot ->> 'duration_minutes')::integer, 60),
        nullif(btrim(coalesce(slot ->> 'class_type', '')), ''),
        btrim(p_name),
        lower(btrim(p_email)),
        nullif(btrim(coalesce(p_notes, '')), '')
      );
      saved := saved + 1;
    exception
      when unique_violation then
        duplicates := duplicates + 1;
      when check_violation then
        return jsonb_build_object('ok', false, 'reason', 'invalid_input');
    end;
  end loop;

  return jsonb_build_object('ok', true, 'saved', saved, 'duplicates', duplicates);
end;
$$;

revoke all on function public.submit_slot_interest(uuid, text, text, text, jsonb) from public;
grant execute on function public.submit_slot_interest(uuid, text, text, text, jsonb)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
