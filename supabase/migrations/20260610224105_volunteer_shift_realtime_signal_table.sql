-- Anonymous-safe realtime signal for volunteer slot count refreshes.
--
-- The public client subscribes to INSERTs on this table, then refetches the
-- public views. Rows intentionally contain no registration names, emails, or
-- phone numbers.

create table if not exists public.volunteer_shift_realtime_events (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.volunteer_shifts(id) on delete cascade,
  starts_at timestamptz,
  kind text,
  cancelled boolean,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  created_at timestamptz not null default now()
);

create index if not exists volunteer_shift_realtime_events_created_at_idx
  on public.volunteer_shift_realtime_events(created_at desc);
create index if not exists volunteer_shift_realtime_events_shift_id_idx
  on public.volunteer_shift_realtime_events(shift_id);

alter table public.volunteer_shift_realtime_events enable row level security;

revoke all on table public.volunteer_shift_realtime_events from anon;
revoke all on table public.volunteer_shift_realtime_events from authenticated;
grant select on table public.volunteer_shift_realtime_events to anon, authenticated;
grant all on table public.volunteer_shift_realtime_events to service_role;

drop policy if exists "Anyone can receive volunteer shift realtime events"
  on public.volunteer_shift_realtime_events;
create policy "Anyone can receive volunteer shift realtime events"
on public.volunteer_shift_realtime_events
for select
to anon, authenticated
using (true);

create or replace function app_private.broadcast_volunteer_shift_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_shift_id uuid;
  changed_starts_at timestamptz;
  changed_kind text;
  changed_cancelled boolean;
begin
  if tg_table_name = 'shift_registrations' then
    changed_shift_id := coalesce(new.shift_id, old.shift_id);

    select starts_at, kind, cancelled
      into changed_starts_at, changed_kind, changed_cancelled
    from public.volunteer_shifts
    where id = changed_shift_id;
  else
    changed_shift_id := coalesce(new.id, old.id);
    changed_starts_at := coalesce(new.starts_at, old.starts_at);
    changed_kind := coalesce(new.kind, old.kind);
    changed_cancelled := coalesce(new.cancelled, old.cancelled);
  end if;

  if changed_shift_id is null then
    return null;
  end if;

  insert into public.volunteer_shift_realtime_events (
    shift_id,
    starts_at,
    kind,
    cancelled,
    operation
  )
  values (
    changed_shift_id,
    changed_starts_at,
    changed_kind,
    changed_cancelled,
    tg_op
  );

  delete from public.volunteer_shift_realtime_events
  where created_at < now() - interval '1 day';

  return null;
end;
$$;

revoke all on function app_private.broadcast_volunteer_shift_change() from public;
revoke all on function app_private.broadcast_volunteer_shift_change() from anon;
revoke all on function app_private.broadcast_volunteer_shift_change() from authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'volunteer_shift_realtime_events'
  ) then
    execute 'alter publication supabase_realtime add table public.volunteer_shift_realtime_events';
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'realtime'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime drop table realtime.messages';
  end if;
end $$;

notify pgrst, 'reload schema';
