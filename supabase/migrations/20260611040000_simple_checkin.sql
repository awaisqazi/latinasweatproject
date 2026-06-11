-- Simplify volunteer check-in: the studio wants the original unlisted
-- /checkin page with one-tap check-in, not a kiosk-code flow. Registrant
-- names and check-in state are already public via shift_registrations_public;
-- this adds a codeless check-in RPC. Accepted tradeoff (owner decision):
-- anyone who knows the unlisted URL can toggle check-ins.

create or replace function public.set_shift_check_in(
  p_registration_id uuid,
  p_checked_in boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_count integer;
begin
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

revoke all on function public.set_shift_check_in(uuid, boolean) from public;
grant execute on function public.set_shift_check_in(uuid, boolean)
  to anon, authenticated, service_role;

-- Retire the kiosk-code surface: the coded RPC variants and the stored code.
drop function if exists public.set_shift_check_in(uuid, boolean, text);
drop function if exists public.get_shift_check_in_registrations(text, uuid[]);
drop function if exists public.get_volunteer_check_in_code();
delete from app_private.settings where key = 'volunteer_check_in_code';

notify pgrst, 'reload schema';
