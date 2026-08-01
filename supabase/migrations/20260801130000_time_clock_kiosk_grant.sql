-- Auto-grant the Time Clock module to the kiosk machine account.
--
-- The studio iPad signs in as timeclock-kiosk@latinasweatproject.com, a
-- normal invited auth user. Its only special treatment is this: because the
-- account may be created in the dashboard before or after this migration
-- runs, the grant is applied both ways — immediately if the profile already
-- exists, and via a narrowly-scoped trigger the moment handle_new_user
-- inserts its profile row. The trigger matches exactly one email and is a
-- no-op for every other signup.

create or replace function app_private.grant_time_clock_to_kiosk()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if lower(new.email) = 'timeclock-kiosk@latinasweatproject.com' then
    insert into public.profile_modules (profile_id, module)
    values (new.id, 'time_clock')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists timeclock_kiosk_auto_grant on public.profiles;
create trigger timeclock_kiosk_auto_grant
  after insert on public.profiles
  for each row execute function app_private.grant_time_clock_to_kiosk();

-- Grant immediately if the kiosk profile already exists.
insert into public.profile_modules (profile_id, module)
select p.id, 'time_clock'
from public.profiles p
where lower(p.email) = 'timeclock-kiosk@latinasweatproject.com'
on conflict do nothing;
