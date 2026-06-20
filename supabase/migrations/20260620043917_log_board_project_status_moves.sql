-- Mirror the marketing status-move timeline for board projects so status
-- changes are recorded in board_project_comments.
create or replace function app_private.log_board_project_status_move()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if old.status is not distinct from new.status then
    return new;
  end if;
  if current_user = 'service_role' then
    return new;
  end if;
  if actor_id is not null then
    insert into public.board_project_comments
      (project_id, author_id, author_name, author_email, body)
    values
      (new.id, actor_id, '', '',
       format('Moved this project from %s to %s.', old.status, new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_board_project_status_move on public.board_projects;
create trigger trg_log_board_project_status_move
  before update on public.board_projects
  for each row execute function app_private.log_board_project_status_move();
