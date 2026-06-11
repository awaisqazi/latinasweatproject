-- Volunteer shift categories and the operational overlap guard.
--
-- Shifts are classified as:
--   operational   - day-to-day studio shifts (all legacy recurring/custom rows)
--   special_event - studio events that need volunteers; may overlap anything
--   external      - off-site volunteer opportunities; may overlap anything
--
-- Rule: no two non-cancelled OPERATIONAL shifts may overlap in time. Existing
-- rows are grandfathered (some legacy duplicates exist); the trigger only
-- evaluates new inserts and updates that change time/cancelled/category, so
-- capacity or title edits to historical duplicates keep working.

alter table public.volunteer_shifts
  add column if not exists category text not null default 'operational'
  check (category in ('operational', 'special_event', 'external'));

update public.volunteer_shifts
set category = 'special_event'
where kind = 'opportunity' and category = 'operational';

create index if not exists volunteer_shifts_operational_active_idx
  on public.volunteer_shifts (starts_at, ends_at)
  where not cancelled and category = 'operational';

create or replace function app_private.prevent_operational_overlap()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  conflicting record;
begin
  if tg_op = 'UPDATE'
     and new.starts_at = old.starts_at
     and new.ends_at = old.ends_at
     and new.cancelled = old.cancelled
     and new.category = old.category then
    return new;
  end if;

  if new.cancelled or new.category <> 'operational' then
    return new;
  end if;

  select s.id, s.starts_at, s.ends_at
    into conflicting
  from public.volunteer_shifts s
  where s.id <> new.id
    and not s.cancelled
    and s.category = 'operational'
    and tstzrange(s.starts_at, s.ends_at, '[)')
        && tstzrange(new.starts_at, new.ends_at, '[)')
  limit 1;

  if found then
    raise exception
      'An operational shift already covers % - % on %',
      to_char(conflicting.starts_at at time zone 'America/Chicago', 'HH12:MI AM'),
      to_char(conflicting.ends_at at time zone 'America/Chicago', 'HH12:MI AM'),
      to_char(conflicting.starts_at at time zone 'America/Chicago', 'YYYY-MM-DD')
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_operational_overlap on public.volunteer_shifts;
create trigger prevent_operational_overlap
before insert or update on public.volunteer_shifts
for each row execute function app_private.prevent_operational_overlap();

-- Regenerate guard: skip any template instant that overlaps an existing
-- operational shift, cancelled or not. Cancelled rows act as tombstones so
-- the monthly cron never resurrects a slot an admin cancelled, and active
-- overlaps are skipped so the cron can never trip the trigger above (one
-- violating row would abort the whole insert).
create or replace function app_private.generate_shift_instances(p_through date)
returns integer
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  inserted_count integer;
begin
  insert into public.volunteer_shifts
    (kind, category, template_id, starts_at, ends_at, lead_capacity, volunteer_capacity)
  select
    'recurring',
    'operational',
    t.id,
    (d.day::date + t.start_time) at time zone 'America/Chicago',
    (d.day::date + t.end_time) at time zone 'America/Chicago',
    t.lead_capacity,
    t.volunteer_capacity
  from generate_series(current_date::timestamp, p_through::timestamp, interval '1 day') as d(day)
  join public.shift_templates t
    on t.active
   and t.day_of_week = extract(dow from d.day)::smallint
   and d.day::date >= t.effective_from
   and (t.effective_until is null or d.day::date <= t.effective_until)
  where not exists (
    select 1
    from public.volunteer_shifts existing
    where existing.category = 'operational'
      and tstzrange(existing.starts_at, existing.ends_at, '[)')
          && tstzrange(
               (d.day::date + t.start_time) at time zone 'America/Chicago',
               (d.day::date + t.end_time) at time zone 'America/Chicago',
               '[)'
             )
  )
  on conflict (template_id, starts_at) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- Expose the category on the public read surface. CREATE OR REPLACE VIEW can
-- only append columns at the end, so category goes last; drop/recreate would
-- lose the anon/authenticated grants.
create or replace view public.shifts_public as
select
  s.id,
  s.kind,
  s.title,
  s.description,
  s.location,
  s.starts_at,
  s.ends_at,
  s.lead_capacity,
  s.volunteer_capacity,
  s.cancelled,
  count(r.*) filter (where r.role = 'lead') as lead_count,
  count(r.*) filter (where r.role = 'volunteer') as volunteer_count,
  s.category
from public.volunteer_shifts s
left join public.shift_registrations r on r.shift_id = s.id
group by s.id;

notify pgrst, 'reload schema';
