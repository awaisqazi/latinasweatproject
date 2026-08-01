-- Time Clock module
--
-- The studio iPad kiosk (LSP Time Clock app) syncs its SwiftData store to
-- these tables, and the admin portal gains a "Time Clock" module for remote
-- timesheet management, roster edits, CSV import of historical punches, and
-- dynamic check-in messages shown on the kiosk.
--
-- Access model: the kiosk signs in as a dedicated machine auth user that is
-- granted the 'time_clock' module, exactly like a portal user. All tables are
-- module-gated through app_private.has_module('time_clock') — no anon access,
-- no service-role paths. Row ids are client-generated UUIDs (the kiosk's
-- SwiftData primary keys) so sync upserts are idempotent.
--
-- Deletes are tombstones (deleted_at) rather than hard deletes so the kiosk
-- can converge after offline stretches; portal queries filter deleted_at.
-- updated_at is server-stamped by trigger so incremental pulls have a single
-- authoritative clock.

-- 1) Register the module key ------------------------------------------------

alter table public.profile_modules
  drop constraint if exists profile_modules_module_check;

alter table public.profile_modules
  add constraint profile_modules_module_check
  check (
    module in (
      'marketing', 'board_projects', 'volunteers', 'subs', 'events',
      'elections', 'gala', 'users', 'spaces', 'fundraising', 'inventory',
      'time_clock'
    )
  );

-- 2) updated_at stamp helper ------------------------------------------------

create or replace function app_private.timeclock_touch_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3) Tables -----------------------------------------------------------------

create table if not exists public.timeclock_employees (
  id uuid primary key,
  rfid_tag text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  pin text not null default '',
  job_title text not null default '',
  profile_role text not null default 'instructor'
    check (profile_role in ('instructor', 'coordinator', 'both')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.timeclock_employees is
  'Studio staff roster mirrored from the iPad time-clock kiosk. rfid_tag may be a PENDING:<uuid> sentinel while a bulk-onboarded employee awaits a card; job_title is the free-text label the kiosk calls "role".';

create table if not exists public.timeclock_punches (
  id uuid primary key,
  employee_id uuid not null
    references public.timeclock_employees (id) on delete cascade,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  was_forced_out boolean not null default false,
  shift_role text not null default 'instructor'
    check (shift_role in ('instructor', 'coordinator')),
  scheduled_classes integer not null default 0,
  actual_classes_taught integer not null default 0,
  source text not null default 'kiosk'
    check (source in ('kiosk', 'portal', 'import')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.timeclock_punches is
  'One row per shift. Billable hours are derived, never stored: instructor shifts pay 1.5h per actual_classes_taught; coordinator shifts pay wall-clock clock_in_at -> clock_out_at. Open shifts have clock_out_at null.';

create table if not exists public.timeclock_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  body text not null,
  audience text not null default 'all'
    check (audience in ('all', 'instructor', 'coordinator')),
  employee_id uuid
    references public.timeclock_employees (id) on delete cascade,
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.timeclock_messages is
  'Dynamic messages shown during kiosk check-in. audience targets a shift role (or all); employee_id narrows a message to one person. starts_on/ends_on bound the display window (studio-local dates); null means unbounded.';

create table if not exists public.timeclock_message_receipts (
  id uuid primary key,
  message_id uuid not null
    references public.timeclock_messages (id) on delete cascade,
  employee_id uuid not null
    references public.timeclock_employees (id) on delete cascade,
  punch_id uuid
    references public.timeclock_punches (id) on delete set null,
  seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.timeclock_message_receipts is
  'Read receipts: the kiosk records which messages were on screen when an employee confirmed a punch, so the portal can show who has seen an announcement.';

create table if not exists public.timeclock_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null default '',
  format text not null default '',
  total_rows integer not null default 0,
  imported_punches integer not null default 0,
  skipped_rows integer not null default 0,
  created_employees integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.timeclock_imports is
  'Audit log for historical CSV imports, mirroring fundraising_imports. Imports are idempotent: re-uploading the same file skips already-present punches.';

create table if not exists public.timeclock_kiosk_status (
  id text primary key,
  last_seen_at timestamptz not null default now(),
  app_version text not null default '',
  pending_push integer not null default 0,
  detail jsonb not null default '{}'::jsonb
);

comment on table public.timeclock_kiosk_status is
  'Single-row-per-device heartbeat upserted on every kiosk sync so the portal can show whether the studio iPad is online and caught up.';

-- 4) Indexes ----------------------------------------------------------------

create index if not exists timeclock_punches_clock_in_idx
  on public.timeclock_punches (clock_in_at desc);
create index if not exists timeclock_punches_employee_idx
  on public.timeclock_punches (employee_id);
create index if not exists timeclock_punches_updated_idx
  on public.timeclock_punches (updated_at);
create index if not exists timeclock_punches_open_idx
  on public.timeclock_punches (clock_in_at)
  where clock_out_at is null and deleted_at is null;
create index if not exists timeclock_employees_updated_idx
  on public.timeclock_employees (updated_at);
create index if not exists timeclock_receipts_message_idx
  on public.timeclock_message_receipts (message_id);
create index if not exists timeclock_receipts_employee_idx
  on public.timeclock_message_receipts (employee_id);

-- 5) updated_at triggers ----------------------------------------------------

drop trigger if exists timeclock_employees_touch on public.timeclock_employees;
create trigger timeclock_employees_touch
  before update on public.timeclock_employees
  for each row execute function app_private.timeclock_touch_updated_at();

drop trigger if exists timeclock_punches_touch on public.timeclock_punches;
create trigger timeclock_punches_touch
  before update on public.timeclock_punches
  for each row execute function app_private.timeclock_touch_updated_at();

drop trigger if exists timeclock_messages_touch on public.timeclock_messages;
create trigger timeclock_messages_touch
  before update on public.timeclock_messages
  for each row execute function app_private.timeclock_touch_updated_at();

-- 6) Row level security -----------------------------------------------------

alter table public.timeclock_employees enable row level security;
alter table public.timeclock_punches enable row level security;
alter table public.timeclock_messages enable row level security;
alter table public.timeclock_message_receipts enable row level security;
alter table public.timeclock_imports enable row level security;
alter table public.timeclock_kiosk_status enable row level security;

revoke all on public.timeclock_employees from anon;
revoke all on public.timeclock_punches from anon;
revoke all on public.timeclock_messages from anon;
revoke all on public.timeclock_message_receipts from anon;
revoke all on public.timeclock_imports from anon;
revoke all on public.timeclock_kiosk_status from anon;

grant select, insert, update, delete on public.timeclock_employees to authenticated;
grant select, insert, update, delete on public.timeclock_punches to authenticated;
grant select, insert, update, delete on public.timeclock_messages to authenticated;
grant select, insert, update, delete on public.timeclock_message_receipts to authenticated;
grant select, insert, update, delete on public.timeclock_imports to authenticated;
grant select, insert, update, delete on public.timeclock_kiosk_status to authenticated;

drop policy if exists "Time clock module full access employees"
  on public.timeclock_employees;
create policy "Time clock module full access employees"
  on public.timeclock_employees
  for all to authenticated
  using ((select app_private.has_module('time_clock')))
  with check ((select app_private.has_module('time_clock')));

drop policy if exists "Time clock module full access punches"
  on public.timeclock_punches;
create policy "Time clock module full access punches"
  on public.timeclock_punches
  for all to authenticated
  using ((select app_private.has_module('time_clock')))
  with check ((select app_private.has_module('time_clock')));

drop policy if exists "Time clock module full access messages"
  on public.timeclock_messages;
create policy "Time clock module full access messages"
  on public.timeclock_messages
  for all to authenticated
  using ((select app_private.has_module('time_clock')))
  with check ((select app_private.has_module('time_clock')));

drop policy if exists "Time clock module full access receipts"
  on public.timeclock_message_receipts;
create policy "Time clock module full access receipts"
  on public.timeclock_message_receipts
  for all to authenticated
  using ((select app_private.has_module('time_clock')))
  with check ((select app_private.has_module('time_clock')));

drop policy if exists "Time clock module full access imports"
  on public.timeclock_imports;
create policy "Time clock module full access imports"
  on public.timeclock_imports
  for all to authenticated
  using ((select app_private.has_module('time_clock')))
  with check ((select app_private.has_module('time_clock')));

drop policy if exists "Time clock module full access kiosk status"
  on public.timeclock_kiosk_status;
create policy "Time clock module full access kiosk status"
  on public.timeclock_kiosk_status
  for all to authenticated
  using ((select app_private.has_module('time_clock')))
  with check ((select app_private.has_module('time_clock')));

-- 7) Realtime ---------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.timeclock_punches;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.timeclock_employees;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.timeclock_kiosk_status;
exception
  when duplicate_object then null;
end;
$$;

notify pgrst, 'reload schema';
