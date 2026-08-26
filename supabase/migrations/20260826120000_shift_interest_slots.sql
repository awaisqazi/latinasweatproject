-- Shift-interest slots move from src/data/shiftInterest.js into the database
-- so the Studio Spaces admins can close a shift the moment it's filled, add
-- new shifts mid-month, or remove one entirely, all without a deploy. The
-- public /scheduleinterest form reads this table live; the data file keeps
-- only month metadata and day/room labels.

create table if not exists public.shift_interest_slots (
  id uuid primary key default gen_random_uuid(),
  month_slug text not null,
  -- 'mon-lv-0800' (day-room-HHMM), same key format the submissions use.
  slot_key text not null,
  -- 'open' shows as selectable on the form; 'filled' shows as taken.
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_interest_slots_month_check
    check (month_slug ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint shift_interest_slots_key_check
    check (slot_key ~ '^(mon|tue|wed|thu|fri|sat|sun)-(lv|gp)-([01][0-9]|2[0-3])[0-5][0-9]$'),
  constraint shift_interest_slots_status_check
    check (status in ('open', 'filled')),
  constraint shift_interest_slots_month_key_unique unique (month_slug, slot_key)
);

create index if not exists shift_interest_slots_month_idx
  on public.shift_interest_slots (month_slug);

drop trigger if exists set_shift_interest_slots_updated_at on public.shift_interest_slots;
create trigger set_shift_interest_slots_updated_at
before update on public.shift_interest_slots
for each row execute function public.set_updated_at();

-- Slots hold no secrets: world-readable (the public form needs them), while
-- writes are limited to spaces-module admins.
alter table public.shift_interest_slots enable row level security;
revoke all on table public.shift_interest_slots from anon, authenticated;
grant select on table public.shift_interest_slots to anon, authenticated;
grant insert, update, delete on table public.shift_interest_slots to authenticated;
grant all on table public.shift_interest_slots to service_role;

drop policy if exists "Shift slots are public" on public.shift_interest_slots;
create policy "Shift slots are public"
  on public.shift_interest_slots for select to anon, authenticated
  using (true);

drop policy if exists "Spaces module can add shift slots" on public.shift_interest_slots;
create policy "Spaces module can add shift slots"
  on public.shift_interest_slots for insert to authenticated
  with check ((select app_private.has_module('spaces')));

drop policy if exists "Spaces module can update shift slots" on public.shift_interest_slots;
create policy "Spaces module can update shift slots"
  on public.shift_interest_slots for update to authenticated
  using ((select app_private.has_module('spaces')))
  with check ((select app_private.has_module('spaces')));

drop policy if exists "Spaces module can delete shift slots" on public.shift_interest_slots;
create policy "Spaces module can delete shift slots"
  on public.shift_interest_slots for delete to authenticated
  using ((select app_private.has_module('spaces')));

-- Seed September 2026 with the currently open shifts.
insert into public.shift_interest_slots (month_slug, slot_key)
values
  ('2026-09', 'mon-lv-0800'),
  ('2026-09', 'tue-lv-0700'),
  ('2026-09', 'wed-lv-0700'),
  ('2026-09', 'wed-lv-0800'),
  ('2026-09', 'fri-lv-0600'),
  ('2026-09', 'sun-lv-0800')
on conflict on constraint shift_interest_slots_month_key_unique do nothing;

-- The submit RPC now accepts only slots that exist and are open for the
-- month, and reports back which keys it kept, so the form can tell someone
-- when a pick was filled between page load and submit.
create or replace function public.submit_shift_interest(
  p_month_slug text,
  p_name text,
  p_email text,
  p_service_class integer,
  p_slot_keys text[],
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_month text := btrim(coalesce(p_month_slug, ''));
  clean_name text := btrim(coalesce(p_name, ''));
  clean_email text := lower(btrim(coalesce(p_email, '')));
  clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  requested int;
  clean_slots text[];
  v_id uuid;
  v_result text;
begin
  if clean_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    or char_length(clean_name) not between 1 and 80
    or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or char_length(clean_email) not between 5 and 160
    or p_service_class is null
    or p_service_class not between 1 and 25
    or (clean_notes is not null and char_length(clean_notes) > 500)
  then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  select count(distinct k) into requested
  from unnest(coalesce(p_slot_keys, '{}')) as k;

  -- Keep only slots that are actually open for this month right now.
  select coalesce(array_agg(distinct k order by k), '{}')
  into clean_slots
  from unnest(coalesce(p_slot_keys, '{}')) as k
  join public.shift_interest_slots s
    on s.month_slug = clean_month and s.slot_key = k and s.status = 'open';

  if coalesce(array_length(clean_slots, 1), 0) = 0 then
    return jsonb_build_object(
      'ok', false,
      'reason', case when requested > 0 then 'slots_unavailable' else 'invalid_input' end
    );
  end if;
  if array_length(clean_slots, 1) > 80 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
  end if;

  -- Abuse ceiling: one month of scheduling never needs more rows than this.
  if (select count(*) from public.shift_interest_submissions
      where month_slug = clean_month) >= 500 then
    return jsonb_build_object('ok', false, 'reason', 'month_full');
  end if;

  insert into public.shift_interest_submissions (
    month_slug, name, email, service_class, slot_keys, notes
  )
  values (
    clean_month, clean_name, clean_email, p_service_class, clean_slots, clean_notes
  )
  on conflict on constraint shift_interest_month_email_unique
  do update set
    name = excluded.name,
    service_class = excluded.service_class,
    slot_keys = excluded.slot_keys,
    notes = excluded.notes,
    updated_at = now()
  returning id, (case when created_at = updated_at then 'inserted' else 'updated' end)
  into v_id, v_result;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'result', v_result,
    'accepted', to_jsonb(clean_slots)
  );
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
end;
$$;

notify pgrst, 'reload schema';
