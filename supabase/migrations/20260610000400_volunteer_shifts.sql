-- Volunteer shifts: recurring schedule templates, materialized shift instances
-- (recurring + custom + one-off opportunities), and registrations.
-- Replaces the volunteerapp-74ebe Firestore project.
--
-- Public (anon) access is view/RPC only: registrant emails and phone numbers
-- are never readable with the anon key (the old Firestore setup leaked them).

create extension if not exists pg_cron;

-- Private key/value settings (e.g. the kiosk check-in code).
create table if not exists app_private.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into app_private.settings (key, value)
values (
  'volunteer_check_in_code',
  substr(md5(random()::text || clock_timestamp()::text), 1, 12)
)
on conflict (key) do nothing;

create table if not exists public.shift_templates (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  lead_capacity smallint not null default 1 check (lead_capacity >= 0),
  volunteer_capacity smallint not null default 2 check (volunteer_capacity >= 0),
  effective_from date not null default current_date,
  effective_until date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (day_of_week, start_time, end_time)
);

create table if not exists public.volunteer_shifts (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  kind text not null default 'recurring'
    check (kind in ('recurring', 'custom', 'opportunity')),
  template_id uuid references public.shift_templates(id) on delete set null,
  title text,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  lead_capacity smallint not null default 1 check (lead_capacity >= 0),
  volunteer_capacity smallint not null default 2 check (volunteer_capacity >= 0),
  cancelled boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, starts_at)
);

create index if not exists volunteer_shifts_starts_at_idx
  on public.volunteer_shifts(starts_at);
create index if not exists volunteer_shifts_kind_idx
  on public.volunteer_shifts(kind, starts_at);

create table if not exists public.shift_registrations (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.volunteer_shifts(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text not null check (
    email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254
  ),
  phone text check (phone is null or char_length(phone) <= 30),
  role text not null check (role in ('lead', 'volunteer')),
  checked_in boolean not null default false,
  check_in_time timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists shift_registrations_dedupe
  on public.shift_registrations(shift_id, lower(email));
create index if not exists shift_registrations_shift_idx
  on public.shift_registrations(shift_id);
create index if not exists shift_registrations_email_idx
  on public.shift_registrations(lower(email));

alter table public.shift_templates enable row level security;
alter table public.volunteer_shifts enable row level security;
alter table public.shift_registrations enable row level security;

revoke all on table public.shift_templates from anon;
revoke all on table public.volunteer_shifts from anon;
revoke all on table public.shift_registrations from anon;

grant select, insert, update, delete on table public.shift_templates to authenticated;
grant select, insert, update, delete on table public.volunteer_shifts to authenticated;
grant select, insert, update, delete on table public.shift_registrations to authenticated;

grant all on table public.shift_templates to service_role;
grant all on table public.volunteer_shifts to service_role;
grant all on table public.shift_registrations to service_role;

drop trigger if exists set_volunteer_shifts_updated_at on public.volunteer_shifts;
create trigger set_volunteer_shifts_updated_at
before update on public.volunteer_shifts
for each row execute function public.set_updated_at();

-- Seed the standard weekly schedule (mirrors the legacy src/lib/shiftUtils.js).
insert into public.shift_templates (day_of_week, start_time, end_time)
select 0, make_time(h, 0, 0), make_time(h + 1, 0, 0) from generate_series(7, 11) h
union all
select 0, make_time(h, 0, 0), make_time(h + 1, 0, 0) from generate_series(17, 20) h
union all
select 1, time '05:30', time '06:00'
union all
select 1, make_time(h, 0, 0), make_time(h + 1, 0, 0) from generate_series(6, 8) h
union all
select 1, make_time(h, 0, 0), make_time(h + 1, 0, 0) from generate_series(17, 20) h
union all
select 2, time '05:30', time '06:00'
union all
select 2, make_time(h, 0, 0), make_time(h + 1, 0, 0) from generate_series(6, 7) h
union all
select 3, time '05:30', time '06:00'
union all
select 3, make_time(h, 0, 0), make_time(h + 1, 0, 0) from generate_series(6, 8) h
union all
select 3, make_time(h, 0, 0), make_time(h + 1, 0, 0) from generate_series(17, 20) h
union all
select 4, time '05:30', time '06:00'
union all
select 4, make_time(h, 0, 0), make_time(h + 1, 0, 0) from generate_series(6, 8) h
union all
select 5, time '05:30', time '06:00'
union all
select 5, make_time(h, 0, 0), make_time(h + 1, 0, 0) from generate_series(6, 8) h
union all
select 5, make_time(h, 0, 0), make_time(h + 1, 0, 0) from generate_series(17, 19) h
union all
select 6, make_time(h, 0, 0), make_time(h + 1, 0, 0) from generate_series(7, 11) h
on conflict (day_of_week, start_time, end_time) do nothing;

-- Materialize recurring shift instances from templates, idempotently.
-- All local times are America/Chicago (matches legacy shift IDs).
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
    (kind, template_id, starts_at, ends_at, lead_capacity, volunteer_capacity)
  select
    'recurring',
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
    -- Skip instants already covered by an imported legacy shift.
    select 1
    from public.volunteer_shifts existing
    where existing.starts_at = (d.day::date + t.start_time) at time zone 'America/Chicago'
      and existing.kind = 'recurring'
  )
  on conflict (template_id, starts_at) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function app_private.generate_shift_instances(date) from public;
grant execute on function app_private.generate_shift_instances(date) to service_role;

-- Dashboard wrapper so the volunteers module can extend the schedule on demand.
create or replace function public.generate_volunteer_shifts(p_days integer default 70)
returns integer
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not (select app_private.has_module('volunteers')) then
    raise exception 'Volunteers module access required.' using errcode = '42501';
  end if;

  return app_private.generate_shift_instances(
    current_date + greatest(1, least(coalesce(p_days, 70), 365))
  );
end;
$$;

revoke all on function public.generate_volunteer_shifts(integer) from public;
revoke all on function public.generate_volunteer_shifts(integer) from anon;
grant execute on function public.generate_volunteer_shifts(integer) to authenticated, service_role;

-- Reveal the kiosk check-in code to volunteers-module users only.
create or replace function public.get_volunteer_check_in_code()
returns text
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if not (select app_private.has_module('volunteers')) then
    raise exception 'Volunteers module access required.' using errcode = '42501';
  end if;

  return (select value from app_private.settings where key = 'volunteer_check_in_code');
end;
$$;

revoke all on function public.get_volunteer_check_in_code() from public;
revoke all on function public.get_volunteer_check_in_code() from anon;
grant execute on function public.get_volunteer_check_in_code() to authenticated, service_role;

-- Public read surface: capacities and counts, never emails or phone numbers.
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
  count(r.*) filter (where r.role = 'volunteer') as volunteer_count
from public.volunteer_shifts s
left join public.shift_registrations r on r.shift_id = s.id
group by s.id;

create or replace view public.shift_registrations_public as
select
  r.id,
  r.shift_id,
  r.name,
  r.role,
  r.checked_in
from public.shift_registrations r;

grant select on public.shifts_public to anon, authenticated;
grant select on public.shift_registrations_public to anon, authenticated;

-- Month availability payload for the public calendar (shape mirrors the
-- legacy monthly_availability Firestore docs).
create or replace function public.get_month_availability(p_month text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  month_start date;
  result jsonb;
begin
  if p_month is null or p_month !~ '^\d{4}-\d{2}$' then
    return jsonb_build_object('days', '{}'::jsonb);
  end if;

  month_start := to_date(p_month || '-01', 'YYYY-MM-DD');

  select jsonb_build_object(
      'days', coalesce(jsonb_object_agg(day_rows.day, day_rows.day_shifts), '{}'::jsonb)
    )
    into result
  from (
    select
      (month_shifts.local_start)::date::text as day,
      jsonb_agg(
        jsonb_build_object(
          'id', month_shifts.id,
          'kind', month_shifts.kind,
          'title', month_shifts.title,
          'time',
            trim(leading '0' from to_char(month_shifts.local_start, 'HH12:MI AM'))
            || ' - '
            || trim(leading '0' from to_char(month_shifts.local_end, 'HH12:MI AM')),
          'leadSlots', month_shifts.lead_capacity,
          'leadFilled', month_shifts.lead_filled,
          'volunteerSlots', month_shifts.volunteer_capacity,
          'volunteerFilled', month_shifts.volunteer_filled,
          'hasAvailability',
            (month_shifts.lead_filled < month_shifts.lead_capacity
              or month_shifts.volunteer_filled < month_shifts.volunteer_capacity)
            and not month_shifts.cancelled,
          'cancelled', month_shifts.cancelled
        )
        order by month_shifts.local_start
      ) as day_shifts
    from (
      select
        s.id,
        s.kind,
        s.title,
        s.cancelled,
        s.lead_capacity,
        s.volunteer_capacity,
        s.starts_at at time zone 'America/Chicago' as local_start,
        s.ends_at at time zone 'America/Chicago' as local_end,
        count(r.*) filter (where r.role = 'lead') as lead_filled,
        count(r.*) filter (where r.role = 'volunteer') as volunteer_filled
      from public.volunteer_shifts s
      left join public.shift_registrations r on r.shift_id = s.id
      where (s.starts_at at time zone 'America/Chicago')::date >= month_start
        and (s.starts_at at time zone 'America/Chicago')::date
            < (month_start + interval '1 month')::date
      group by s.id
    ) month_shifts
    group by (month_shifts.local_start)::date
  ) day_rows;

  return coalesce(result, jsonb_build_object('days', '{}'::jsonb));
end;
$$;

revoke all on function public.get_month_availability(text) from public;
grant execute on function public.get_month_availability(text)
  to anon, authenticated, service_role;

-- Capacity-safe anonymous registration (replaces the Firestore transaction).
create or replace function public.register_for_shift(
  p_shift_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  shift_record record;
  filled_count integer;
  role_capacity integer;
begin
  if p_role not in ('lead', 'volunteer') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_role');
  end if;

  select * into shift_record
  from public.volunteer_shifts
  where id = p_shift_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if shift_record.cancelled then
    return jsonb_build_object('ok', false, 'reason', 'cancelled');
  end if;

  if shift_record.ends_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'past');
  end if;

  select count(*) into filled_count
  from public.shift_registrations
  where shift_id = p_shift_id and role = p_role;

  if p_role = 'lead' then
    role_capacity := shift_record.lead_capacity;
  else
    role_capacity := shift_record.volunteer_capacity;
  end if;

  if filled_count >= role_capacity then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  insert into public.shift_registrations (shift_id, name, email, phone, role)
  values (
    p_shift_id,
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''),
    p_role
  );

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
end;
$$;

revoke all on function public.register_for_shift(uuid, text, text, text, text) from public;
grant execute on function public.register_for_shift(uuid, text, text, text, text)
  to anon, authenticated, service_role;

create or replace function public.cancel_shift_registration(
  p_shift_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  delete from public.shift_registrations
  where shift_id = p_shift_id
    and lower(email) = lower(btrim(p_email));

  get diagnostics deleted_count = row_count;

  if deleted_count = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.cancel_shift_registration(uuid, text) from public;
grant execute on function public.cancel_shift_registration(uuid, text)
  to anon, authenticated, service_role;

-- Kiosk check-in. The station code lives in app_private.settings and is shown
-- to volunteers-module users in the dashboard; the kiosk URL carries ?code=.
create or replace function public.set_shift_check_in(
  p_registration_id uuid,
  p_checked_in boolean,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  expected_code text;
  updated_count integer;
begin
  select value into expected_code
  from app_private.settings
  where key = 'volunteer_check_in_code';

  if expected_code is null or p_code is distinct from expected_code then
    return jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  update public.shift_registrations
  set checked_in = coalesce(p_checked_in, false),
      check_in_time = case when coalesce(p_checked_in, false) then now() else null end
  where id = p_registration_id;

  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.set_shift_check_in(uuid, boolean, text) from public;
grant execute on function public.set_shift_check_in(uuid, boolean, text)
  to anon, authenticated, service_role;

-- Volunteers-module RLS for the admin dashboard.
drop policy if exists "Volunteers module can read shift templates" on public.shift_templates;
create policy "Volunteers module can read shift templates"
on public.shift_templates
for select
to authenticated
using ((select app_private.has_module('volunteers')));

drop policy if exists "Volunteers module can insert shift templates" on public.shift_templates;
create policy "Volunteers module can insert shift templates"
on public.shift_templates
for insert
to authenticated
with check ((select app_private.has_module('volunteers')));

drop policy if exists "Volunteers module can update shift templates" on public.shift_templates;
create policy "Volunteers module can update shift templates"
on public.shift_templates
for update
to authenticated
using ((select app_private.has_module('volunteers')))
with check ((select app_private.has_module('volunteers')));

drop policy if exists "Volunteers module can delete shift templates" on public.shift_templates;
create policy "Volunteers module can delete shift templates"
on public.shift_templates
for delete
to authenticated
using ((select app_private.has_module('volunteers')));

drop policy if exists "Volunteers module can read shifts" on public.volunteer_shifts;
create policy "Volunteers module can read shifts"
on public.volunteer_shifts
for select
to authenticated
using ((select app_private.has_module('volunteers')));

drop policy if exists "Volunteers module can insert shifts" on public.volunteer_shifts;
create policy "Volunteers module can insert shifts"
on public.volunteer_shifts
for insert
to authenticated
with check ((select app_private.has_module('volunteers')));

drop policy if exists "Volunteers module can update shifts" on public.volunteer_shifts;
create policy "Volunteers module can update shifts"
on public.volunteer_shifts
for update
to authenticated
using ((select app_private.has_module('volunteers')))
with check ((select app_private.has_module('volunteers')));

drop policy if exists "Volunteers module can delete shifts" on public.volunteer_shifts;
create policy "Volunteers module can delete shifts"
on public.volunteer_shifts
for delete
to authenticated
using ((select app_private.has_module('volunteers')));

drop policy if exists "Volunteers module can read registrations" on public.shift_registrations;
create policy "Volunteers module can read registrations"
on public.shift_registrations
for select
to authenticated
using ((select app_private.has_module('volunteers')));

drop policy if exists "Volunteers module can insert registrations" on public.shift_registrations;
create policy "Volunteers module can insert registrations"
on public.shift_registrations
for insert
to authenticated
with check ((select app_private.has_module('volunteers')));

drop policy if exists "Volunteers module can update registrations" on public.shift_registrations;
create policy "Volunteers module can update registrations"
on public.shift_registrations
for update
to authenticated
using ((select app_private.has_module('volunteers')))
with check ((select app_private.has_module('volunteers')));

drop policy if exists "Volunteers module can delete registrations" on public.shift_registrations;
create policy "Volunteers module can delete registrations"
on public.shift_registrations
for delete
to authenticated
using ((select app_private.has_module('volunteers')));

-- Generate the first window now, then monthly via pg_cron (~70 days ahead).
select app_private.generate_shift_instances(current_date + 70);

select cron.schedule(
  'generate-volunteer-shifts',
  '0 6 1 * *',
  $$select app_private.generate_shift_instances(current_date + 70)$$
);

notify pgrst, 'reload schema';
