-- Teaching-shift interest form (/scheduleinterest) + the "Shift Interest" tab
-- in the admin Studio Spaces module.
--
-- Instructors pick the shifts they want to teach next month and leave name,
-- email, and their service class (1-25). Submissions contain emails, so unlike
-- the potluck tables this one is NOT world-readable: anon writes go through a
-- validating SECURITY DEFINER RPC, and reads are limited to dashboard users
-- with the 'spaces' module (same policy shape as event_requests). Submitting
-- again with the same email for the same month replaces the earlier answer,
-- which doubles as the "edit my response" flow with no tokens to lose.

create table if not exists public.shift_interest_submissions (
  id uuid primary key default gen_random_uuid(),
  -- e.g. '2026-09'; matches a month object in src/data/shiftInterest.js.
  month_slug text not null,
  name text not null,
  email text not null,
  service_class integer not null,
  -- Slot keys like 'mon-lv-0600'; the site's data file defines which keys a
  -- month actually offers, the regex here just keeps junk out.
  slot_keys text[] not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_interest_month_slug_check
    check (month_slug ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint shift_interest_name_check
    check (char_length(name) between 1 and 80),
  constraint shift_interest_email_check
    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
           and char_length(email) between 5 and 160),
  constraint shift_interest_service_class_check
    check (service_class between 1 and 25),
  constraint shift_interest_slot_keys_check
    check (array_length(slot_keys, 1) between 1 and 80),
  constraint shift_interest_notes_check
    check (notes is null or char_length(notes) <= 500),
  constraint shift_interest_month_email_unique unique (month_slug, email)
);

create index if not exists shift_interest_month_created_idx
  on public.shift_interest_submissions (month_slug, created_at);

drop trigger if exists set_shift_interest_updated_at on public.shift_interest_submissions;
create trigger set_shift_interest_updated_at
before update on public.shift_interest_submissions
for each row execute function public.set_updated_at();

-- RLS: deny by default; spaces-module admins can read and delete (spam
-- cleanup); every write from the public site goes through the RPC below.
alter table public.shift_interest_submissions enable row level security;
revoke all on table public.shift_interest_submissions from anon, authenticated;
grant select, delete on table public.shift_interest_submissions to authenticated;
grant all on table public.shift_interest_submissions to service_role;

drop policy if exists "Spaces module can read shift interest"
  on public.shift_interest_submissions;
create policy "Spaces module can read shift interest"
  on public.shift_interest_submissions for select to authenticated
  using ((select app_private.has_module('spaces')));

drop policy if exists "Spaces module can delete shift interest"
  on public.shift_interest_submissions;
create policy "Spaces module can delete shift interest"
  on public.shift_interest_submissions for delete to authenticated
  using ((select app_private.has_module('spaces')));

-- Public submit/update endpoint. Answers jsonb {ok, ...} instead of raising,
-- mirroring the potluck RPCs.
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
  clean_slots text[];
  v_id uuid;
  v_result text;
begin
  -- Dedupe and validate the slot keys (day-room-HHMM).
  select coalesce(array_agg(distinct k order by k), '{}')
  into clean_slots
  from unnest(coalesce(p_slot_keys, '{}')) as k
  where k ~ '^(mon|tue|wed|thu|fri|sat|sun)-(lv|gp)-([01][0-9]|2[0-3])[0-5][0-9]$';

  if clean_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    or char_length(clean_name) not between 1 and 80
    or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or char_length(clean_email) not between 5 and 160
    or p_service_class is null
    or p_service_class not between 1 and 25
    or coalesce(array_length(clean_slots, 1), 0) not between 1 and 80
    or (clean_notes is not null and char_length(clean_notes) > 500)
  then
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

  return jsonb_build_object('ok', true, 'id', v_id, 'result', v_result);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_input');
end;
$$;

revoke all on function public.submit_shift_interest(text, text, text, integer, text[], text) from public;
grant execute on function public.submit_shift_interest(text, text, text, integer, text[], text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
