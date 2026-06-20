-- Cover the 11 foreign keys the dashboard joins/filters on
create index if not exists idx_board_project_comments_author_id on public.board_project_comments(author_id);
create index if not exists idx_board_project_tasks_assignee_id on public.board_project_tasks(assignee_id);
create index if not exists idx_board_projects_created_by on public.board_projects(created_by);
create index if not exists idx_board_projects_owner_id on public.board_projects(owner_id);
create index if not exists idx_class_schedule_slots_created_by on public.class_schedule_slots(created_by);
create index if not exists idx_profile_modules_granted_by on public.profile_modules(granted_by);
create index if not exists idx_project_comments_author_id on public.project_comments(author_id);
create index if not exists idx_schedule_periods_created_by on public.schedule_periods(created_by);
create index if not exists idx_space_bookings_created_by on public.space_bookings(created_by);
create index if not exists idx_space_bookings_event_id on public.space_bookings(event_id);
create index if not exists idx_volunteer_shifts_created_by on public.volunteer_shifts(created_by);

-- Remove the one-off dedupe backup artifact (no PK, no RLS)
drop table if exists app_private.volunteer_shifts_dedupe_backup_20260610;
