-- Event & Scheduling Requests: pipe the public /eventsrequest Google Form
-- into the admin dashboard's Studio Spaces module. A form-bound Apps Script
-- posts each response to submit_event_request (secret-guarded, dedupes on the
-- Google response id). Admins triage in a new "Event Requests" tab: conflicts
-- are computed against space_bookings AND class occurrences via the existing
-- get_space_conflicts engine, approval can transactionally book every
-- requested room (the booking conflict trigger keeps it honest) and queue the
-- event into the marketing intake queue (public.projects, source google_form).

-- Shared secret the Apps Script must present (same pattern as intake_secret).
insert into app_private.settings (key, value)
select 'event_request_secret', gen_random_uuid()::text
where not exists (
  select 1 from app_private.settings where key = 'event_request_secret'
);

-- ---------------------------------------------------------------------------
-- The request queue.
-- ---------------------------------------------------------------------------
create table if not exists public.event_requests (
  id uuid primary key default gen_random_uuid(),
  -- Google Form response id; the webhook's dedupe key (safe re-syncs).
  response_id text not null unique,
  submitted_at timestamptz not null default now(),
  board_name text not null,
  email text,
  event_name text not null,
  event_date date,
  start_time time,
  end_time time,
  setup_cleanup text,
  -- Raw comma-joined answer, the bookable rooms parsed from it, and any
  -- free-text remainder ("Other" on the public form).
  location_raw text,
  rooms text[] not null default '{}',
  other_location text,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  -- Bookings created by approval (removed again on reopen).
  booking_ids uuid[] not null default '{}',
  -- Marketing intake project queued by approval.
  marketing_project_id uuid references public.projects(id) on delete set null,
  marketing_queued_at timestamptz,
  -- Full raw answers, forward-compatible with new form questions.
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_requests_status_idx
  on public.event_requests (status, event_date);
create index if not exists event_requests_decided_by_idx
  on public.event_requests (decided_by);
create index if not exists event_requests_marketing_project_idx
  on public.event_requests (marketing_project_id);

drop trigger if exists set_event_requests_updated_at on public.event_requests;
create trigger set_event_requests_updated_at
before update on public.event_requests
for each row execute function public.set_updated_at();

alter table public.event_requests enable row level security;
revoke all on table public.event_requests from anon, authenticated;
grant select on table public.event_requests to authenticated;
grant all on table public.event_requests to service_role;

drop policy if exists "Spaces module can read event requests" on public.event_requests;
create policy "Spaces module can read event requests"
on public.event_requests for select to authenticated
using ((select app_private.has_module('spaces')));
-- Writes happen only through the SECURITY DEFINER RPCs below.

-- ---------------------------------------------------------------------------
-- Location parsing: which bookable rooms does a raw location answer name?
-- The public form now offers Little Village Room / Gage Park Room / Cafe
-- (older submissions may say "Studio Kitchen", which is the Cafe).
-- ---------------------------------------------------------------------------
create or replace function app_private.parse_event_request_rooms(p_location text)
returns table (rooms text[], other_location text)
language plpgsql
immutable
as $$
declare
  v_rooms text[] := '{}';
  v_other text[] := '{}';
  part text;
begin
  if coalesce(btrim(p_location), '') = '' then
    return query select '{}'::text[], null::text;
    return;
  end if;

  foreach part in array string_to_array(p_location, ',') loop
    part := btrim(part);
    if part = '' then
      continue;
    elsif lower(part) in ('little village room', 'little village') then
      v_rooms := array_append(v_rooms, 'Little Village Room');
    elsif lower(part) in ('gage park room', 'gage park') then
      v_rooms := array_append(v_rooms, 'Gage Park Room');
    elsif lower(part) in ('cafe', 'café', 'studio kitchen', 'kitchen') then
      v_rooms := array_append(v_rooms, 'Cafe');
    else
      v_other := v_other || part;
    end if;
  end loop;

  return query select
    (select coalesce(array_agg(distinct r), '{}'::text[]) from unnest(v_rooms) r),
    nullif(array_to_string(v_other, ', '), '');
end;
$$;

-- ---------------------------------------------------------------------------
-- Ingest endpoint for the Apps Script webhook.
-- ---------------------------------------------------------------------------
create or replace function public.submit_event_request(
  p_secret text,
  p_response_id text,
  p_submitted_at timestamptz default now(),
  p_board_name text default null,
  p_email text default null,
  p_event_name text default null,
  p_event_date date default null,
  p_start_time time default null,
  p_end_time time default null,
  p_setup_cleanup text default null,
  p_location text default null,
  p_notes text default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $$
declare
  v_secret text;
  v_rooms text[];
  v_other text;
  v_existing record;
  v_id uuid;
begin
  select value into v_secret
  from app_private.settings where key = 'event_request_secret';
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception 'Invalid event request secret.' using errcode = '42501';
  end if;

  if coalesce(btrim(p_response_id), '') = '' then
    raise exception 'Event request submission requires a response id.';
  end if;

  select * into v_rooms, v_other
  from app_private.parse_event_request_rooms(p_location);

  select id, status into v_existing
  from public.event_requests where response_id = btrim(p_response_id);

  if found then
    -- Re-syncs refresh pending rows but never clobber a decided request.
    if v_existing.status <> 'pending' then
      return jsonb_build_object(
        'ok', true, 'id', v_existing.id, 'result', 'skipped_already_decided'
      );
    end if;

    update public.event_requests set
      submitted_at = coalesce(p_submitted_at, submitted_at),
      board_name = coalesce(nullif(btrim(coalesce(p_board_name, '')), ''), board_name),
      email = coalesce(nullif(btrim(coalesce(p_email, '')), ''), email),
      event_name = coalesce(nullif(btrim(coalesce(p_event_name, '')), ''), event_name),
      event_date = p_event_date,
      start_time = p_start_time,
      end_time = p_end_time,
      setup_cleanup = nullif(btrim(coalesce(p_setup_cleanup, '')), ''),
      location_raw = nullif(btrim(coalesce(p_location, '')), ''),
      rooms = v_rooms,
      other_location = v_other,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      payload = coalesce(p_payload, '{}'::jsonb)
    where id = v_existing.id;

    return jsonb_build_object('ok', true, 'id', v_existing.id, 'result', 'updated');
  end if;

  insert into public.event_requests (
    response_id, submitted_at, board_name, email, event_name,
    event_date, start_time, end_time, setup_cleanup,
    location_raw, rooms, other_location, notes, payload
  ) values (
    btrim(p_response_id),
    coalesce(p_submitted_at, now()),
    coalesce(nullif(btrim(coalesce(p_board_name, '')), ''), 'Unknown'),
    nullif(btrim(coalesce(p_email, '')), ''),
    coalesce(nullif(btrim(coalesce(p_event_name, '')), ''), 'Untitled event request'),
    p_event_date,
    p_start_time,
    p_end_time,
    nullif(btrim(coalesce(p_setup_cleanup, '')), ''),
    nullif(btrim(coalesce(p_location, '')), ''),
    v_rooms,
    v_other,
    nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'result', 'inserted');
exception
  when unique_violation then
    -- Concurrent duplicate delivery of the same response; treat as deduped.
    select id into v_id
    from public.event_requests where response_id = btrim(p_response_id);
    return jsonb_build_object('ok', true, 'id', v_id, 'result', 'deduped');
end;
$$;

revoke all on function public.submit_event_request(
  text, text, timestamptz, text, text, text, date, time, time, text, text, text, jsonb
) from public;
grant execute on function public.submit_event_request(
  text, text, timestamptz, text, text, text, date, time, time, text, text, text, jsonb
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Conflict preview for a request: existing bookings + class occurrences (via
-- get_space_conflicts) plus other pending requests wanting the same room at
-- an overlapping time. Times are studio-local (America/Chicago).
-- ---------------------------------------------------------------------------
create or replace function public.get_event_request_conflicts(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $$
declare
  r record;
  v_starts timestamptz;
  v_ends timestamptz;
  room text;
  room_results jsonb := '[]'::jsonb;
  room_conflicts jsonb;
  request_conflicts jsonb;
begin
  if not (select app_private.has_module('spaces')) then
    raise exception 'Spaces module access required.' using errcode = '42501';
  end if;

  select * into r from public.event_requests where id = p_request_id;
  if not found then
    raise exception 'Event request not found.';
  end if;

  if r.event_date is null or r.start_time is null or r.end_time is null then
    return jsonb_build_object(
      'checkable', false,
      'reason', 'Request is missing a date, start time, or end time.'
    );
  end if;
  if r.end_time <= r.start_time then
    return jsonb_build_object(
      'checkable', false,
      'reason', 'End time is not after the start time.'
    );
  end if;
  if coalesce(array_length(r.rooms, 1), 0) = 0 then
    return jsonb_build_object(
      'checkable', false,
      'reason', 'No bookable room was requested.'
    );
  end if;

  v_starts := (r.event_date + r.start_time) at time zone 'America/Chicago';
  v_ends := (r.event_date + r.end_time) at time zone 'America/Chicago';

  foreach room in array r.rooms loop
    room_conflicts := public.get_space_conflicts(room, v_starts, v_ends, null);

    -- Other pending requests competing for this room at an overlapping time.
    select coalesce(jsonb_agg(jsonb_build_object(
        'type', 'request',
        'title', o.event_name,
        'requested_by', o.board_name,
        'starts_at', (o.event_date + o.start_time) at time zone 'America/Chicago',
        'ends_at', (o.event_date + o.end_time) at time zone 'America/Chicago'
      ) order by o.start_time), '[]'::jsonb)
      into request_conflicts
    from public.event_requests o
    where o.id <> r.id
      and o.status = 'pending'
      and o.event_date = r.event_date
      and o.start_time is not null
      and o.end_time is not null
      and room = any(o.rooms)
      and o.start_time < r.end_time
      and o.end_time > r.start_time;

    room_results := room_results || jsonb_build_object(
      'room', room,
      'conflicts', room_conflicts || request_conflicts
    );
  end loop;

  return jsonb_build_object(
    'checkable', true,
    'starts_at', v_starts,
    'ends_at', v_ends,
    'rooms', room_results
  );
end;
$$;

revoke all on function public.get_event_request_conflicts(uuid) from public;
grant execute on function public.get_event_request_conflicts(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Decision endpoint: approve (optionally booking rooms and queueing the
-- marketing intake project, all in one transaction), decline, or reopen.
-- ---------------------------------------------------------------------------
create or replace function public.decide_event_request(
  p_id uuid,
  p_action text,
  p_note text default null,
  p_create_bookings boolean default true,
  p_queue_marketing boolean default true
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $$
declare
  r record;
  v_starts timestamptz;
  v_ends timestamptz;
  room text;
  v_booking_id uuid;
  v_booking_ids uuid[] := '{}';
  v_project_id uuid;
  v_booking_notes text;
begin
  if not (select app_private.has_module('spaces')) then
    raise exception 'Spaces module access required.' using errcode = '42501';
  end if;

  if p_action not in ('approve', 'decline', 'reopen') then
    raise exception 'Unknown action %.', p_action;
  end if;

  select * into r from public.event_requests where id = p_id for update;
  if not found then
    raise exception 'Event request not found.';
  end if;

  if p_action = 'reopen' then
    if r.status = 'pending' then
      return jsonb_build_object('ok', false, 'code', 'already_pending',
        'message', 'This request is already pending.');
    end if;

    -- Remove the bookings this approval created (edits included; the tab
    -- copy warns about this). Manually deleted ones are simply gone already.
    delete from public.space_bookings where id = any(r.booking_ids);

    update public.event_requests set
      status = 'pending',
      decided_by = null,
      decided_at = null,
      decision_note = null,
      booking_ids = '{}'
    where id = p_id;

    return jsonb_build_object('ok', true, 'status', 'pending');
  end if;

  if r.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'already_decided',
      'message', 'This request was already ' || r.status || '. Reopen it first.');
  end if;

  if p_action = 'decline' then
    update public.event_requests set
      status = 'declined',
      decided_by = (select auth.uid()),
      decided_at = now(),
      decision_note = nullif(btrim(coalesce(p_note, '')), '')
    where id = p_id;

    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  -- Approve.
  if p_create_bookings and coalesce(array_length(r.rooms, 1), 0) > 0 then
    if r.event_date is null or r.start_time is null or r.end_time is null
       or r.end_time <= r.start_time then
      return jsonb_build_object('ok', false, 'code', 'missing_schedule',
        'message', 'This request is missing a usable date/time, so rooms cannot be booked. Approve without bookings or add a booking manually.');
    end if;

    v_starts := (r.event_date + r.start_time) at time zone 'America/Chicago';
    v_ends := (r.event_date + r.end_time) at time zone 'America/Chicago';
    v_booking_notes := concat_ws(E'\n',
      'Booked from an approved event request.',
      'Requested by: ' || r.board_name
        || coalesce(' (' || r.email || ')', ''),
      case when r.setup_cleanup is not null
        then 'Set-up / clean-up: ' || r.setup_cleanup end,
      case when r.other_location is not null
        then 'Also requested (untracked): ' || r.other_location end,
      case when r.notes is not null then 'Notes: ' || r.notes end
    );

    -- All-or-nothing: the space_bookings conflict trigger raises 23P01 on
    -- any overlap, and this exception block rolls back every booking.
    begin
      foreach room in array r.rooms loop
        insert into public.space_bookings (
          title, kind, space, starts_at, ends_at, notes, created_by
        ) values (
          left(r.event_name, 200), 'event', room, v_starts, v_ends,
          v_booking_notes, (select auth.uid())
        )
        returning id into v_booking_id;
        v_booking_ids := v_booking_ids || v_booking_id;
      end loop;
    exception
      when exclusion_violation then
        return jsonb_build_object('ok', false, 'code', 'conflict',
          'message', sqlerrm);
    end;
  end if;

  if p_queue_marketing and r.marketing_project_id is null then
    insert into public.projects (
      title, status, source, intake_reviewed, intake_submitted_at,
      intake_respondent_email, intake_contact_name, intake_payload
    ) values (
      left(r.event_name, 200),
      'Ready for Production',
      'google_form',
      false,
      coalesce(r.submitted_at, now()),
      r.email,
      r.board_name,
      jsonb_strip_nulls(jsonb_build_object(
        'Request type', 'Approved event / studio space request',
        'Event Date', case when r.event_date is not null
          then to_char(r.event_date, 'FMDay, FMMonth FMDD, YYYY') end,
        'Time', case when r.start_time is not null and r.end_time is not null
          then to_char(r.event_date + r.start_time, 'FMHH12:MI AM')
            || ' - ' || to_char(r.event_date + r.end_time, 'FMHH12:MI AM') end,
        'Rooms', nullif(array_to_string(r.rooms, ', '), ''),
        'Other location', r.other_location,
        'Set-up / clean-up', r.setup_cleanup,
        'Notes', r.notes,
        'Event request id', r.id::text
      ))
    )
    returning id into v_project_id;
  end if;

  update public.event_requests set
    status = 'approved',
    decided_by = (select auth.uid()),
    decided_at = now(),
    decision_note = nullif(btrim(coalesce(p_note, '')), ''),
    booking_ids = v_booking_ids,
    marketing_project_id = coalesce(v_project_id, marketing_project_id),
    marketing_queued_at = case when v_project_id is not null
      then now() else marketing_queued_at end
  where id = p_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'approved',
    'booking_ids', to_jsonb(v_booking_ids),
    'marketing_project_id', coalesce(v_project_id, r.marketing_project_id)
  );
end;
$$;

revoke all on function public.decide_event_request(uuid, text, text, boolean, boolean) from public;
grant execute on function public.decide_event_request(uuid, text, text, boolean, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Live updates: publish the queue so the dashboard refreshes as requests
-- arrive or are decided. RLS scopes events to spaces-module subscribers.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.event_requests';
  end if;
end $$;

notify pgrst, 'reload schema';
