-- Members may now move marketing projects across every Kanban column. This
-- trigger no longer restricts who can move where; it only records the move in
-- the project timeline. (Name kept for trigger wiring; it is now log-only.)
create or replace function app_private.enforce_project_status_moves()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
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
    insert into public.project_comments (
      project_id,
      author_id,
      author_name,
      author_email,
      body
    )
    values (
      new.id,
      actor_id,
      '',
      '',
      format('Moved this project from %s to %s.', old.status, new.status)
    );
  end if;

  return new;
end;
$$;
