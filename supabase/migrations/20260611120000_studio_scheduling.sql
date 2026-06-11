-- Studio scheduling suite: historical class utilization, the forward weekly
-- class schedule (instructor/class/room/time planning), and space bookings
-- for events and trainings with hard conflict prevention so nothing
-- double-books the Little Village or Gage Park rooms.

-- New dashboard module gate.
alter table public.profile_modules
  drop constraint profile_modules_module_check;
alter table public.profile_modules
  add constraint profile_modules_module_check check (
    module in (
      'marketing',
      'board_projects',
      'volunteers',
      'subs',
      'events',
      'elections',
      'gala',
      'users',
      'spaces'
    )
  );

-- ---------------------------------------------------------------------------
-- Imported MarianaTek class session history (read-only reference data).
-- ---------------------------------------------------------------------------
create table if not exists public.class_history (
  id uuid primary key default gen_random_uuid(),
  session_date date not null,
  start_time time not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  classroom text not null,
  class_type text not null,
  instructors text not null default '',
  has_substitute boolean not null default false,
  is_free boolean not null default false,
  checked_in integer not null default 0,
  late_cancelled integer not null default 0,
  no_showed integer not null default 0,
  layout_capacity integer not null default 0,
  actual_capacity integer not null default 0,
  utilization numeric(5, 2),
  imported_at timestamptz not null default now()
);

create unique index if not exists class_history_dedupe
  on public.class_history (session_date, start_time, classroom, class_type, instructors);
create index if not exists class_history_slot_idx
  on public.class_history (classroom, day_of_week, start_time);
create index if not exists class_history_type_idx
  on public.class_history (class_type);

alter table public.class_history enable row level security;
revoke all on table public.class_history from anon;
grant select on table public.class_history to authenticated;
grant all on table public.class_history to service_role;

drop policy if exists "Spaces module can read class history" on public.class_history;
create policy "Spaces module can read class history"
on public.class_history
for select
to authenticated
using ((select app_private.has_module('spaces')));

-- ---------------------------------------------------------------------------
-- The forward weekly class schedule.
-- ---------------------------------------------------------------------------
create table if not exists public.class_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  class_type text not null check (char_length(btrim(class_type)) between 1 and 120),
  instructor text,
  room text not null check (room in ('Little Village Room', 'Gage Park Room', 'Cafe')),
  active boolean not null default true,
  effective_from date not null default current_date,
  effective_until date,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_schedule_slots_room_idx
  on public.class_schedule_slots (room, day_of_week, start_time);

drop trigger if exists set_class_schedule_slots_updated_at on public.class_schedule_slots;
create trigger set_class_schedule_slots_updated_at
before update on public.class_schedule_slots
for each row execute function public.set_updated_at();

alter table public.class_schedule_slots enable row level security;
revoke all on table public.class_schedule_slots from anon;
grant select, insert, update, delete on table public.class_schedule_slots to authenticated;
grant all on table public.class_schedule_slots to service_role;

drop policy if exists "Spaces module can read schedule" on public.class_schedule_slots;
create policy "Spaces module can read schedule"
on public.class_schedule_slots for select to authenticated
using ((select app_private.has_module('spaces')));

drop policy if exists "Spaces module can insert schedule" on public.class_schedule_slots;
create policy "Spaces module can insert schedule"
on public.class_schedule_slots for insert to authenticated
with check ((select app_private.has_module('spaces')));

drop policy if exists "Spaces module can update schedule" on public.class_schedule_slots;
create policy "Spaces module can update schedule"
on public.class_schedule_slots for update to authenticated
using ((select app_private.has_module('spaces')))
with check ((select app_private.has_module('spaces')));

drop policy if exists "Spaces module can delete schedule" on public.class_schedule_slots;
create policy "Spaces module can delete schedule"
on public.class_schedule_slots for delete to authenticated
using ((select app_private.has_module('spaces')));

-- Two active class slots may not overlap in the same room on the same day
-- while their effective windows intersect.
create or replace function app_private.prevent_class_slot_overlap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  conflicting record;
begin
  if tg_op = 'UPDATE'
     and new.day_of_week = old.day_of_week
     and new.start_time = old.start_time
     and new.duration_minutes = old.duration_minutes
     and new.room = old.room
     and new.active = old.active
     and new.effective_from = old.effective_from
     and new.effective_until is not distinct from old.effective_until then
    return new;
  end if;

  if not new.active then
    return new;
  end if;

  select s.class_type, s.start_time, s.duration_minutes
    into conflicting
  from public.class_schedule_slots s
  where s.id <> new.id
    and s.active
    and s.room = new.room
    and s.day_of_week = new.day_of_week
    and (s.start_time, s.start_time + make_interval(mins => s.duration_minutes))
        overlaps (new.start_time, new.start_time + make_interval(mins => new.duration_minutes))
    and daterange(s.effective_from, s.effective_until, '[]')
        && daterange(new.effective_from, new.effective_until, '[]')
  limit 1;

  if found then
    raise exception
      '% already holds % at % for % minutes on that day',
      new.room, conflicting.class_type,
      to_char(conflicting.start_time, 'HH12:MI AM'), conflicting.duration_minutes
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_class_slot_overlap on public.class_schedule_slots;
create trigger prevent_class_slot_overlap
before insert or update on public.class_schedule_slots
for each row execute function app_private.prevent_class_slot_overlap();

-- ---------------------------------------------------------------------------
-- Space bookings: events, trainings, and other reservations of a room.
-- ---------------------------------------------------------------------------
create table if not exists public.space_bookings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  kind text not null default 'event' check (kind in ('event', 'training', 'other')),
  space text not null check (space in ('Little Village Room', 'Gage Park Room', 'Cafe')),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  event_id uuid references public.events(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists space_bookings_space_idx
  on public.space_bookings (space, starts_at);

drop trigger if exists set_space_bookings_updated_at on public.space_bookings;
create trigger set_space_bookings_updated_at
before update on public.space_bookings
for each row execute function public.set_updated_at();

alter table public.space_bookings enable row level security;
revoke all on table public.space_bookings from anon;
grant select, insert, update, delete on table public.space_bookings to authenticated;
grant all on table public.space_bookings to service_role;

drop policy if exists "Spaces module can read bookings" on public.space_bookings;
create policy "Spaces module can read bookings"
on public.space_bookings for select to authenticated
using ((select app_private.has_module('spaces')));

drop policy if exists "Spaces module can insert bookings" on public.space_bookings;
create policy "Spaces module can insert bookings"
on public.space_bookings for insert to authenticated
with check ((select app_private.has_module('spaces')));

drop policy if exists "Spaces module can update bookings" on public.space_bookings;
create policy "Spaces module can update bookings"
on public.space_bookings for update to authenticated
using ((select app_private.has_module('spaces')))
with check ((select app_private.has_module('spaces')));

drop policy if exists "Spaces module can delete bookings" on public.space_bookings;
create policy "Spaces module can delete bookings"
on public.space_bookings for delete to authenticated
using ((select app_private.has_module('spaces')));

-- All conflicts for a proposed reservation: other bookings in the space plus
-- scheduled class occurrences (slot day/time expanded over the booking's
-- local dates). Shared by the client preflight and the enforcement trigger.
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
  if not (select app_private.has_module('spaces')) then
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

revoke all on function public.get_space_conflicts(text, timestamptz, timestamptz, uuid) from public;
grant execute on function public.get_space_conflicts(text, timestamptz, timestamptz, uuid)
  to authenticated, service_role;

-- Hard enforcement: a booking that overlaps another booking or a scheduled
-- class in the same space is rejected.
create or replace function app_private.prevent_space_booking_conflict()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  conflicts jsonb;
  first_conflict jsonb;
begin
  if tg_op = 'UPDATE'
     and new.space = old.space
     and new.starts_at = old.starts_at
     and new.ends_at = old.ends_at then
    return new;
  end if;

  conflicts := public.get_space_conflicts(new.space, new.starts_at, new.ends_at, new.id);

  if jsonb_array_length(conflicts) > 0 then
    first_conflict := conflicts -> 0;
    raise exception
      '% is already in use: % (%) from % to %',
      new.space,
      first_conflict ->> 'title',
      first_conflict ->> 'type',
      to_char((first_conflict ->> 'starts_at')::timestamptz at time zone 'America/Chicago', 'Mon DD HH12:MI AM'),
      to_char((first_conflict ->> 'ends_at')::timestamptz at time zone 'America/Chicago', 'HH12:MI AM')
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_space_booking_conflict on public.space_bookings;
create trigger prevent_space_booking_conflict
before insert or update on public.space_bookings
for each row execute function app_private.prevent_space_booking_conflict();

-- ---------------------------------------------------------------------------
-- Insight views over the imported history. security_invoker so the
-- class_history RLS policy (spaces module) applies to readers.
-- ---------------------------------------------------------------------------
create or replace view public.class_history_slot_stats
with (security_invoker = true) as
select
  classroom,
  day_of_week,
  start_time,
  count(*) as sessions,
  round(avg(utilization), 1) as avg_utilization,
  round(avg(checked_in), 1) as avg_checked_in,
  max(session_date) as last_session
from public.class_history
group by classroom, day_of_week, start_time;

create or replace view public.class_history_type_stats
with (security_invoker = true) as
select
  class_type,
  count(*) as sessions,
  round(avg(utilization), 1) as avg_utilization,
  round(avg(checked_in), 1) as avg_checked_in,
  min(session_date) as first_session,
  max(session_date) as last_session
from public.class_history
group by class_type;

create or replace view public.class_history_instructor_stats
with (security_invoker = true) as
select
  btrim(instructor_name) as instructor,
  count(*) as sessions,
  round(avg(h.utilization), 1) as avg_utilization,
  round(avg(h.checked_in), 1) as avg_checked_in,
  count(distinct h.class_type) as class_types,
  max(h.session_date) as last_session
from public.class_history h,
  unnest(string_to_array(h.instructors, ',')) as instructor_name
where btrim(instructor_name) <> ''
group by btrim(instructor_name);

grant select on public.class_history_slot_stats to authenticated;
grant select on public.class_history_type_stats to authenticated;
grant select on public.class_history_instructor_stats to authenticated;

notify pgrst, 'reload schema';
