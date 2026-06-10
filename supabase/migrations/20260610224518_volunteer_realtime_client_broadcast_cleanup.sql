-- The public volunteer page now sends sanitized Broadcast events from the
-- browser after successful registration/cancel RPCs. Remove the unused
-- database-triggered signal path so the database does not write extra rows.

drop trigger if exists broadcast_volunteer_shift_changes_on_registrations
  on public.shift_registrations;
drop trigger if exists broadcast_volunteer_shift_changes_on_shifts
  on public.volunteer_shifts;

drop function if exists app_private.broadcast_volunteer_shift_change();

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'volunteer_shift_realtime_events'
  ) then
    execute 'alter publication supabase_realtime drop table public.volunteer_shift_realtime_events';
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'realtime'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime drop table realtime.messages';
  end if;
end $$;

drop table if exists public.volunteer_shift_realtime_events;

notify pgrst, 'reload schema';
