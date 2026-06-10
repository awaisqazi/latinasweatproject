-- Public realtime signal for volunteer schedule changes.
--
-- Do not publish raw shift_registrations rows: they contain emails and phone
-- numbers. Instead, broadcast a sanitized event and let the public UI refetch
-- shifts_public / shift_registrations_public.

create or replace view public.shift_registrations_public as
select
  r.id,
  r.shift_id,
  case when r.role = 'lead' then r.name else null end as name,
  r.role,
  false as checked_in
from public.shift_registrations r;

grant select on public.shift_registrations_public to anon, authenticated;

create or replace function public.get_shift_check_in_registrations(
  p_code text,
  p_shift_ids uuid[]
)
returns table (
  id uuid,
  shift_id uuid,
  name text,
  role text,
  checked_in boolean
)
language plpgsql
stable
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  expected_code text;
begin
  select value into expected_code
  from app_private.settings
  where key = 'volunteer_check_in_code';

  if expected_code is null or p_code is distinct from expected_code then
    raise exception 'Invalid check-in code.' using errcode = '42501';
  end if;

  return query
  select
    r.id,
    r.shift_id,
    r.name,
    r.role,
    r.checked_in
  from public.shift_registrations r
  where r.shift_id = any(coalesce(p_shift_ids, '{}'::uuid[]))
  order by r.created_at;
end;
$$;

revoke all on function public.get_shift_check_in_registrations(text, uuid[]) from public;
grant execute on function public.get_shift_check_in_registrations(text, uuid[])
  to anon, authenticated, service_role;

create or replace function app_private.broadcast_volunteer_shift_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime, pg_temp
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

  perform realtime.send(
    jsonb_build_object(
      'shift_id', changed_shift_id,
      'starts_at', changed_starts_at,
      'kind', changed_kind,
      'cancelled', changed_cancelled,
      'operation', tg_op
    ),
    'shift-changed',
    'volunteer-shifts',
    false
  );

  return null;
end;
$$;

revoke all on function app_private.broadcast_volunteer_shift_change() from public;
revoke all on function app_private.broadcast_volunteer_shift_change() from anon;
revoke all on function app_private.broadcast_volunteer_shift_change() from authenticated;

drop trigger if exists broadcast_volunteer_shift_changes_on_registrations
  on public.shift_registrations;
create trigger broadcast_volunteer_shift_changes_on_registrations
after insert or update or delete on public.shift_registrations
for each row execute function app_private.broadcast_volunteer_shift_change();

drop trigger if exists broadcast_volunteer_shift_changes_on_shifts
  on public.volunteer_shifts;
create trigger broadcast_volunteer_shift_changes_on_shifts
after insert or update or delete on public.volunteer_shifts
for each row execute function app_private.broadcast_volunteer_shift_change();

notify pgrst, 'reload schema';
