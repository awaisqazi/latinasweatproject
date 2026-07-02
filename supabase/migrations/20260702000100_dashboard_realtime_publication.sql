-- Live collaboration for the admin dashboard: publish the four collaborative
-- tables over Supabase Realtime (postgres_changes). INSERT/UPDATE events are
-- RLS-filtered per subscriber (marketing module for projects, board module
-- for board tables, assignee/assigner/superuser for workspace_tasks), so each
-- teammate only receives rows they could already read. DELETE events carry
-- only the primary key.
--
-- Unlike the volunteer realtime work (which used a sanitized signal table
-- because its audience was anonymous visitors), these subscribers are
-- authenticated staff and RLS already scopes every row, so the real tables
-- can be published directly.

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects',
    'board_projects',
    'board_project_tasks',
    'workspace_tasks'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
