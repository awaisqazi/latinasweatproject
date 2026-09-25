-- Profiles role guard.
--
-- WHAT: only a superuser, or a context with no end-user JWT (migrations, the
-- SQL editor, cron, and the service-role key the marketing-users edge function
-- uses), may change public.profiles.role or public.profiles.id. Plus, the
-- `authenticated` role loses blanket UPDATE on public.profiles and keeps
-- UPDATE only on full_name.
--
-- WHY: the "Users can update their own profile" policy lets any signed-in user
-- write their own row, and `authenticated` held UPDATE on every column of that
-- row including `role`, so a member could grant themselves superuser and with
-- it every admin module. Sign-up is open, so this was reachable by anyone.
--
-- Two independent layers on purpose: the trigger holds even if a future
-- migration re-grants the column, and the grant holds even if the trigger is
-- dropped. Legitimate role management is unaffected: it runs in the
-- marketing-users edge function on the service-role key, which has no
-- auth.uid(), and it already checks the caller is a superuser before writing.

create or replace function app_private.enforce_profile_role_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  if new.id is distinct from old.id then
    raise exception 'A profile id cannot be changed.'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    -- A null auth.uid() means there is no end-user JWT on this connection:
    -- migrations, the SQL editor, cron jobs, and the service-role key. Those
    -- are the trusted role-management paths. Anything carrying a user JWT has
    -- to be a superuser.
    if (select auth.uid()) is not null
       and not (select app_private.is_superuser()) then
      raise exception 'Only a superuser can change a profile role.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$fn$;

revoke all on function app_private.enforce_profile_role_change() from public;
grant execute on function app_private.enforce_profile_role_change()
  to authenticated, service_role;

-- Runs alongside trg_prevent_last_superuser; both are BEFORE UPDATE row
-- triggers that only inspect and return new, so neither depends on the other.
drop trigger if exists trg_profiles_role_guard on public.profiles;
create trigger trg_profiles_role_guard
  before update on public.profiles
  for each row execute function app_private.enforce_profile_role_change();

-- Column privileges. `authenticated` had drifted to table-wide UPDATE (so
-- every column, role included). The only column the browser writes on its own
-- row is full_name, from the marketing reset-password screen. email is kept in
-- sync by public.handle_new_user and updated_at by set_profiles_updated_at,
-- both of which run with owner rights and are not checked against these
-- grants. The admin UI never updates another user's row from the browser; it
-- goes through the marketing-users edge function on the service-role key.
revoke update on table public.profiles from authenticated;
revoke update on table public.profiles from anon;
grant update (full_name) on table public.profiles to authenticated;

notify pgrst, 'reload schema';
