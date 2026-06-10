-- Class substitute requests. Replaces the substracker-c0a34 Firestore project.
-- Public reads go through sub_requests_public (requester email hidden);
-- public writes go through SECURITY DEFINER RPCs only.

create table if not exists public.sub_requests (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  class_name text not null check (char_length(btrim(class_name)) between 1 and 120),
  date date not null,
  duration_minutes integer check (
    duration_minutes is null or duration_minutes between 5 and 600
  ),
  location text check (location is null or char_length(location) <= 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  requested_by_name text not null check (char_length(btrim(requested_by_name)) between 1 and 120),
  requested_by_email text not null check (
    requested_by_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and char_length(requested_by_email) <= 254
  ),
  status text not null default 'open' check (status in ('open', 'pending', 'approved')),
  assigned_sub_name text,
  assigned_sub_email text,
  assigned_sub_phone text,
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sub_requests_date_idx on public.sub_requests(date, status);

create table if not exists public.sub_volunteers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sub_requests(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text not null check (
    email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254
  ),
  phone text check (phone is null or char_length(phone) <= 30),
  created_at timestamptz not null default now()
);

create unique index if not exists sub_volunteers_dedupe
  on public.sub_volunteers(request_id, lower(email));
create index if not exists sub_volunteers_request_idx
  on public.sub_volunteers(request_id);

alter table public.sub_requests enable row level security;
alter table public.sub_volunteers enable row level security;

revoke all on table public.sub_requests from anon;
revoke all on table public.sub_volunteers from anon;

grant select, insert, update, delete on table public.sub_requests to authenticated;
grant select, insert, update, delete on table public.sub_volunteers to authenticated;

grant all on table public.sub_requests to service_role;
grant all on table public.sub_volunteers to service_role;

drop trigger if exists set_sub_requests_updated_at on public.sub_requests;
create trigger set_sub_requests_updated_at
before update on public.sub_requests
for each row execute function public.set_updated_at();

-- Public view: requester name shown, requester email hidden, volunteer
-- contact info never exposed (only a count).
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
  count(sv.*) as volunteer_count
from public.sub_requests sr
left join public.sub_volunteers sv on sv.request_id = sr.id
group by sr.id;

grant select on public.sub_requests_public to anon, authenticated;

-- Instructors post sub requests from the public page (parity with the legacy app).
create or replace function public.create_sub_request(
  p_class_name text,
  p_date date,
  p_duration_minutes integer,
  p_location text,
  p_notes text,
  p_requested_by_name text,
  p_requested_by_email text
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
    class_name, date, duration_minutes, location, notes,
    requested_by_name, requested_by_email
  )
  values (
    btrim(p_class_name),
    p_date,
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

revoke all on function public.create_sub_request(text, date, integer, text, text, text, text) from public;
grant execute on function public.create_sub_request(text, date, integer, text, text, text, text)
  to anon, authenticated, service_role;

create or replace function public.volunteer_for_sub(
  p_request_id uuid,
  p_name text,
  p_email text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_record record;
begin
  select * into request_record
  from public.sub_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if request_record.status = 'approved' then
    return jsonb_build_object('ok', false, 'reason', 'already_filled');
  end if;

  if request_record.date < current_date then
    return jsonb_build_object('ok', false, 'reason', 'past');
  end if;

  insert into public.sub_volunteers (request_id, name, email, phone)
  values (
    p_request_id,
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), '')
  );

  update public.sub_requests
  set status = 'pending'
  where id = p_request_id and status = 'open';

  return jsonb_build_object('ok', true);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
end;
$$;

revoke all on function public.volunteer_for_sub(uuid, text, text, text) from public;
grant execute on function public.volunteer_for_sub(uuid, text, text, text)
  to anon, authenticated, service_role;

-- Subs-module RLS for the admin dashboard (full contact info visible here).
drop policy if exists "Subs module can read sub requests" on public.sub_requests;
create policy "Subs module can read sub requests"
on public.sub_requests
for select
to authenticated
using ((select app_private.has_module('subs')));

drop policy if exists "Subs module can insert sub requests" on public.sub_requests;
create policy "Subs module can insert sub requests"
on public.sub_requests
for insert
to authenticated
with check ((select app_private.has_module('subs')));

drop policy if exists "Subs module can update sub requests" on public.sub_requests;
create policy "Subs module can update sub requests"
on public.sub_requests
for update
to authenticated
using ((select app_private.has_module('subs')))
with check ((select app_private.has_module('subs')));

drop policy if exists "Subs module can delete sub requests" on public.sub_requests;
create policy "Subs module can delete sub requests"
on public.sub_requests
for delete
to authenticated
using ((select app_private.has_module('subs')));

drop policy if exists "Subs module can read sub volunteers" on public.sub_volunteers;
create policy "Subs module can read sub volunteers"
on public.sub_volunteers
for select
to authenticated
using ((select app_private.has_module('subs')));

drop policy if exists "Subs module can insert sub volunteers" on public.sub_volunteers;
create policy "Subs module can insert sub volunteers"
on public.sub_volunteers
for insert
to authenticated
with check ((select app_private.has_module('subs')));

drop policy if exists "Subs module can delete sub volunteers" on public.sub_volunteers;
create policy "Subs module can delete sub volunteers"
on public.sub_volunteers
for delete
to authenticated
using ((select app_private.has_module('subs')));

notify pgrst, 'reload schema';
