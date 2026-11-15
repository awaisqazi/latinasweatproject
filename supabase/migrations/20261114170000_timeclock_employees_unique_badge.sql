-- 20261114170000_timeclock_employees_unique_badge.sql
--
-- One real RFID badge number, one live employee.
--
-- Until now nothing on the server stopped two roster rows from carrying the
-- same rfid_tag. Each kiosk checks its own local store before it assigns a
-- badge, and the portal's CSV import wrote whatever the file said. With more
-- than one iPad syncing (every install now has its own kiosk id) and an
-- import that can write real badge numbers, two writers can each be sure a
-- badge is free. Whoever scans it then clocks in as whichever employee the
-- kiosk finds first: a payroll error nobody sees happen.
--
-- This makes the database the backstop, with a partial UNIQUE index over
-- real badges only.
--
--   * Covered: rows that are not tombstoned and carry a real tag. Inactive
--     staff are covered on purpose. Deactivating someone is reversible, so
--     their badge stays theirs until it is removed or reassigned.
--   * Not covered: '' and 'PENDING:<uuid>'. Both mean "no badge yet" and
--     many rows hold them at once.
--   * Not covered: tombstoned rows (deleted_at set). Deletes leave rfid_tag
--     in place, and a deleted person's badge must be free to reissue.
--
-- What a violation looks like to clients: SQLSTATE 23505, which PostgREST
-- returns as HTTP 409. The kiosk treats 409 as a row-level rejection: it
-- holds that one employee row (its heartbeat reports the count as
-- detail.quarantined) and keeps uploading everything else. The portal's
-- import checks badges before it writes (ImportTab.svelte), and the portal
-- never assigns a real badge number anywhere else.
--
-- The index cannot be built while duplicates exist. Run
-- supabase/snippets/timeclock_badge_duplicates_preflight.sql in the SQL
-- editor first and clear whatever it lists. The guard below repeats that
-- check so a push against unresolved data stops with every badge number
-- named, rather than a bare "could not create unique index" that names only
-- the first. The guard runs before any DDL, so nothing changes when it stops.

-- 1) Guard: stop, naming the badges, if any is held by two live employees ----

do $$
declare
  v_dupes text;
begin
  select string_agg(format('%s (%s people)', d.rfid_tag, d.holders), ', ' order by d.rfid_tag)
    into v_dupes
  from (
    select e.rfid_tag, count(*) as holders
    from public.timeclock_employees e
    where e.deleted_at is null
      and e.rfid_tag <> ''
      and e.rfid_tag not like 'PENDING:%'
    group by e.rfid_tag
    having count(*) > 1
  ) d;

  if v_dupes is not null then
    raise exception
      'Cannot add the unique badge index: these badge numbers are held by more than one live employee: %. Run supabase/snippets/timeclock_badge_duplicates_preflight.sql to see who, remove the badge from all but one person, then push again.',
      v_dupes
      using errcode = 'unique_violation';
  end if;
end;
$$;

-- 2) The index ----------------------------------------------------------------

create unique index if not exists timeclock_employees_live_badge_key
  on public.timeclock_employees (rfid_tag)
  where deleted_at is null
    and rfid_tag <> ''
    and rfid_tag not like 'PENDING:%';

comment on index public.timeclock_employees_live_badge_key is
  'One live employee per real RFID badge. Excludes tombstoned rows (deleted_at set), blank tags and PENDING:<uuid> placeholders, so a deleted person''s badge can be reissued and any number of staff can be waiting for one.';

notify pgrst, 'reload schema';
