-- Store the class start time as real data instead of a "Class time:" notes prefix.

alter table public.sub_requests add column if not exists start_time time;

-- Recreate the public view with start_time (appended last so create-or-replace
-- keeps the existing column order and grants).
create or replace view public.sub_requests_public as
select
  sr.id,
  sr.class_name,
  sr.date,
  sr.duration_minutes,
  sr.location,
  sr.notes,
  sr.requested_by_name,
  sr.status,
  sr.assigned_sub_name,
  sr.created_at,
  count(sv.*) as volunteer_count,
  sr.start_time
from public.sub_requests sr
left join public.sub_volunteers sv on sv.request_id = sr.id
group by sr.id;

-- Replace the create RPC with one that accepts the start time. The old
-- 7-argument signature is dropped rather than overloaded so PostgREST calls
-- from the currently deployed site resolve unambiguously via the default.
drop function if exists public.create_sub_request(text, date, integer, text, text, text, text);

create or replace function public.create_sub_request(
  p_class_name text,
  p_date date,
  p_duration_minutes integer,
  p_location text,
  p_notes text,
  p_requested_by_name text,
  p_requested_by_email text,
  p_start_time time default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if p_date is null or p_date < current_date then
    return jsonb_build_object('ok', false, 'reason', 'invalid_date');
  end if;

  insert into public.sub_requests (
    class_name, date, start_time, duration_minutes, location, notes,
    requested_by_name, requested_by_email
  )
  values (
    btrim(p_class_name),
    p_date,
    p_start_time,
    p_duration_minutes,
    nullif(btrim(coalesce(p_location, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    btrim(p_requested_by_name),
    lower(btrim(p_requested_by_email))
  )
  returning id into new_id;

  return jsonb_build_object('ok', true, 'id', new_id);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
end;
$$;

revoke all on function public.create_sub_request(text, date, integer, text, text, text, text, time) from public;
grant execute on function public.create_sub_request(text, date, integer, text, text, text, text, time)
  to anon, authenticated, service_role;

-- Backfill: lift "Class time: H:MM AM/PM" prefixes out of notes into
-- start_time, then strip the prefix. The [^APap]* gap tolerates the narrow
-- no-break space some browsers emit before AM/PM.
with parsed as (
  select
    id,
    regexp_match(notes, '^Class time:\s*(\d{1,2}):(\d{2})[^APap]*([APap])[Mm]') as m
  from public.sub_requests
  where notes ~* '^Class time:'
)
update public.sub_requests sr
set
  start_time = make_time(
    case
      when upper(p.m[3]) = 'P' and p.m[1]::int <> 12 then p.m[1]::int + 12
      when upper(p.m[3]) = 'A' and p.m[1]::int = 12 then 0
      else p.m[1]::int
    end,
    p.m[2]::int,
    0
  ),
  notes = nullif(btrim(regexp_replace(sr.notes, '^Class time:[^·]*(·\s*)?', '')), '')
from parsed p
where sr.id = p.id
  and p.m is not null
  and p.m[1]::int between 1 and 12
  and p.m[2]::int between 0 and 59;

notify pgrst, 'reload schema';
