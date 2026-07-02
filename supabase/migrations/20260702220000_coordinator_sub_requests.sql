-- Coordinator shift coverage rides the same sub_requests pipeline as class
-- sub requests: kind distinguishes them, coordinator requests carry a
-- start/end time range and no class name. duration_minutes is derived from
-- the range at insert so existing duration-based UI and calendar links work
-- for both kinds.

alter table public.sub_requests
  add column if not exists kind text not null default 'class',
  add column if not exists end_time time;

alter table public.sub_requests drop constraint if exists sub_requests_kind_check;
alter table public.sub_requests add constraint sub_requests_kind_check
  check (kind in ('class', 'coordinator'));

alter table public.sub_requests alter column class_name drop not null;

alter table public.sub_requests drop constraint if exists sub_requests_kind_fields_check;
alter table public.sub_requests add constraint sub_requests_kind_fields_check check (
  (kind = 'class' and class_name is not null)
  or (
    kind = 'coordinator'
    and start_time is not null
    and end_time is not null
    and end_time > start_time
  )
);

-- Recreate the public view with kind + end_time appended (create-or-replace
-- keeps existing column order and grants).
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
  sr.start_time,
  sr.kind,
  sr.end_time
from public.sub_requests sr
left join public.sub_volunteers sv on sv.request_id = sr.id
group by sr.id;

-- Replace the create RPC with a kind-aware one. The 8-argument signature is
-- dropped rather than overloaded so PostgREST resolution stays unambiguous;
-- the currently deployed site's 8 named arguments still match this function
-- through the two new defaults.
drop function if exists public.create_sub_request(text, date, integer, text, text, text, text, time);

create or replace function public.create_sub_request(
  p_class_name text,
  p_date date,
  p_duration_minutes integer,
  p_location text,
  p_notes text,
  p_requested_by_name text,
  p_requested_by_email text,
  p_start_time time default null,
  p_kind text default 'class',
  p_end_time time default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
  v_kind text := coalesce(p_kind, 'class');
  v_class_name text;
  v_duration integer;
  v_end_time time;
begin
  if v_kind not in ('class', 'coordinator') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  if p_date is null or p_date < current_date then
    return jsonb_build_object('ok', false, 'reason', 'invalid_date');
  end if;

  if v_kind = 'coordinator' then
    -- Coordinator shifts are a time range; the class fields don't apply.
    if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
      return jsonb_build_object('ok', false, 'reason', 'invalid_time_range');
    end if;

    v_class_name := null;
    v_end_time := p_end_time;
    v_duration := (extract(epoch from (p_end_time - p_start_time)) / 60)::integer;

    if v_duration < 5 or v_duration > 600 then
      return jsonb_build_object('ok', false, 'reason', 'invalid_time_range');
    end if;
  else
    if p_class_name is null or btrim(p_class_name) = '' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_input');
    end if;

    v_class_name := btrim(p_class_name);
    v_end_time := null;
    v_duration := p_duration_minutes;
  end if;

  insert into public.sub_requests (
    kind, class_name, date, start_time, end_time, duration_minutes,
    location, notes, requested_by_name, requested_by_email
  )
  values (
    v_kind,
    v_class_name,
    p_date,
    p_start_time,
    v_end_time,
    v_duration,
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

revoke all on function public.create_sub_request(text, date, integer, text, text, text, text, time, text, time) from public;
grant execute on function public.create_sub_request(text, date, integer, text, text, text, text, time, text, time)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
