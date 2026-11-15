-- Time Clock: duplicate badge pre-flight.  READ-ONLY, safe to run any time.
--
-- Run this in the Supabase SQL editor BEFORE `supabase db push` applies
-- 20261114170000_timeclock_employees_unique_badge.sql. That migration adds a
-- unique index so that one real RFID badge number can belong to only one
-- live employee, and it refuses to run while duplicates exist.
--
-- This file is one SELECT. It changes nothing. It is not a migration (it
-- lives in supabase/snippets, which `db push` ignores).
--
-- How to read the result
--
--   "Success. No rows returned"   Nothing to fix. Safe to push.
--
--   problem = 'DUPLICATE'         Two or more live employees hold exactly the
--                                 same badge number. These BLOCK the
--                                 migration. For each badge, decide who
--                                 really has it (shifts and last_clock_in
--                                 are there to help: the person with recent
--                                 punches is usually the real holder), then
--                                 take it off everyone else: Time Clock >
--                                 Roster > click the person > Remove badge.
--                                 Run this again until no DUPLICATE rows
--                                 are left.
--
--   problem = 'look-alike'        Badge numbers that are not identical but
--                                 differ only by leading zeros, letter case
--                                 or stray punctuation, for example
--                                 0010741208 and 10741208 (a spreadsheet
--                                 will strip the zeros from a CSV). These do
--                                 NOT block the migration and the index will
--                                 not treat them as the same badge, but one
--                                 of the two is probably a typo that will
--                                 never scan. Worth a look, not urgent.
--
-- Who is counted: employees that are not deleted (inactive staff included,
-- exactly like the index) and that hold a real badge. Blank tags and
-- PENDING:<uuid> placeholders mean "no badge yet" and are ignored.

with live_badges as (
  select
    e.id,
    e.rfid_tag,
    e.first_name,
    e.last_name,
    e.email,
    e.is_active,
    e.created_at,
    e.updated_at,
    -- Loose spelling of the badge, used only to spot look-alikes.
    ltrim(lower(regexp_replace(e.rfid_tag, '[^A-Za-z0-9]', '', 'g')), '0') as loose_badge
  from public.timeclock_employees e
  where e.deleted_at is null
    and e.rfid_tag <> ''
    and e.rfid_tag not like 'PENDING:%'
),
flagged as (
  select
    b.*,
    count(*) over (partition by b.rfid_tag) as same_badge,
    count(*) over (partition by b.loose_badge) as similar_badge
  from live_badges b
)
select
  case when f.same_badge > 1 then 'DUPLICATE' else 'look-alike' end as problem,
  f.rfid_tag as badge,
  case when f.same_badge > 1 then f.same_badge else f.similar_badge end as people_involved,
  coalesce(nullif(btrim(f.first_name || ' ' || f.last_name), ''), '(no name)') as employee,
  f.email,
  case when f.is_active then 'active' else 'inactive' end as status,
  p.shifts,
  p.last_clock_in,
  f.created_at as added_on,
  f.updated_at as last_changed,
  f.id as employee_id
from flagged f
left join lateral (
  select
    count(*) as shifts,
    max(pu.clock_in_at) as last_clock_in
  from public.timeclock_punches pu
  where pu.employee_id = f.id
    and pu.deleted_at is null
) p on true
where f.same_badge > 1
   or f.similar_badge > 1
order by
  (f.same_badge > 1) desc,
  f.loose_badge,
  f.rfid_tag,
  p.last_clock_in desc nulls last,
  f.updated_at desc;
