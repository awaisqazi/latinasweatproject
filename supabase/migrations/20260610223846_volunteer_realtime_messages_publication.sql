-- Database-triggered broadcasts are delivered through realtime.messages.
-- Keep raw volunteer tables out of the realtime publication so registration
-- emails and phone numbers are never streamed to public clients.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'realtime'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table realtime.messages';
  end if;
end $$;
