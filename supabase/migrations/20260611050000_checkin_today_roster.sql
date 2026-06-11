-- The unlisted /checkin page needs registrant names and live check-in state,
-- but shift_registrations_public deliberately masks volunteer names. This
-- RPC exposes names WITHOUT a kiosk code, scoped server-side to TODAY's
-- shifts only (America/Chicago), so the page stays easy to use while the
-- full historical roster remains unenumerable.

create or replace function public.get_today_check_in_roster()
returns table (
  id uuid,
  shift_id uuid,
  name text,
  role text,
  checked_in boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.shift_id, r.name, r.role, r.checked_in
  from public.shift_registrations r
  join public.volunteer_shifts s on s.id = r.shift_id
  where s.starts_at >= ((now() at time zone 'America/Chicago')::date::timestamp at time zone 'America/Chicago')
    and s.starts_at < (((now() at time zone 'America/Chicago')::date + 1)::timestamp at time zone 'America/Chicago')
  order by s.starts_at, r.name;
$$;

revoke all on function public.get_today_check_in_roster() from public;
grant execute on function public.get_today_check_in_roster()
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
