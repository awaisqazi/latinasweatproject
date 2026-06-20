-- DB-level guarantee that at least one superuser always remains, closing the
-- rare TOCTOU window the edge function cannot fully prevent.
create or replace function app_private.prevent_last_superuser_demotion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  remaining integer;
begin
  if tg_op = 'UPDATE' then
    if old.role = 'superuser' and coalesce(new.role, '') <> 'superuser' then
      select count(*) into remaining
      from public.profiles
      where role = 'superuser' and id <> old.id;
      if remaining = 0 then
        raise exception 'At least one superuser account is required.'
          using errcode = 'check_violation';
      end if;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.role = 'superuser' then
      select count(*) into remaining
      from public.profiles
      where role = 'superuser' and id <> old.id;
      if remaining = 0 then
        raise exception 'At least one superuser account is required.'
          using errcode = 'check_violation';
      end if;
    end if;
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_last_superuser on public.profiles;
create trigger trg_prevent_last_superuser
  before update or delete on public.profiles
  for each row execute function app_private.prevent_last_superuser_demotion();
