-- Board task stages + workspace assignment sync.
--
-- 1) board_project_tasks gains a kanban stage (status), kept coherent with the
--    legacy done flag no matter which one a client writes, so each board
--    project can run its own task kanban.
-- 2) workspace_tasks gains source_ref so a module record can own a linked
--    workspace item: assigning a board task or board project puts an "action
--    pending" card in the assignee's Workspace, completing either side closes
--    both, and unassigning or deleting removes the pending card.

-- ── 1. Task stages ──────────────────────────────────────────────

alter table public.board_project_tasks
  add column if not exists status text not null default 'To Do';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'board_project_tasks_status_check'
      and conrelid = 'public.board_project_tasks'::regclass
  ) then
    alter table public.board_project_tasks
      add constraint board_project_tasks_status_check
      check (status in ('To Do', 'In Progress', 'Blocked', 'Done'));
  end if;
end $$;

update public.board_project_tasks set status = 'Done' where done and status <> 'Done';

create index if not exists board_project_tasks_status_idx
  on public.board_project_tasks(project_id, status);

-- Status change wins when both change in one write.
create or replace function app_private.sync_board_task_stage()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'Done' or new.done then
      new.status := 'Done';
      new.done := true;
      new.done_at := coalesce(new.done_at, now());
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    new.done := (new.status = 'Done');
    new.done_at := case when new.done then coalesce(new.done_at, now()) else null end;
  elsif new.done is distinct from old.done then
    new.status := case
      when new.done then 'Done'
      when old.status = 'Done' then 'To Do'
      else old.status
    end;
    new.done_at := case when new.done then coalesce(new.done_at, now()) else null end;
  end if;

  return new;
end;
$$;

revoke all on function app_private.sync_board_task_stage() from public;

drop trigger if exists sync_board_task_stage on public.board_project_tasks;
create trigger sync_board_task_stage
before insert or update on public.board_project_tasks
for each row execute function app_private.sync_board_task_stage();

-- ── 2. Workspace linkage ────────────────────────────────────────

alter table public.workspace_tasks
  add column if not exists source_ref text;

create index if not exists idx_workspace_tasks_source_ref
  on public.workspace_tasks(source_ref)
  where source_ref is not null;

-- Board task assignments → the assignee's Workspace.
-- security definer: the writer may not be the assignee, and the reverse sync
-- must work even when the assignee lacks the board_projects module.
create or replace function app_private.sync_board_task_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  ref text := 'board_task:' || coalesce(new.id, old.id)::text;
  proj_title text;
begin
  if tg_op = 'DELETE' then
    delete from public.workspace_tasks where source_ref = ref and status = 'open';
    return old;
  end if;

  select title into proj_title from public.board_projects where id = new.project_id;

  -- Reassignment: the previous assignee no longer has action pending.
  if tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id then
    delete from public.workspace_tasks
    where source_ref = ref
      and status = 'open'
      and (new.assignee_id is null or assignee_id is distinct from new.assignee_id);
  end if;

  if new.status = 'Done' then
    update public.workspace_tasks
      set status = 'done', completed_at = now()
      where source_ref = ref and status = 'open';
  elsif new.assignee_id is not null then
    if exists (
      select 1 from public.workspace_tasks
      where source_ref = ref and status = 'open' and assignee_id = new.assignee_id
    ) then
      update public.workspace_tasks
        set title = new.title,
            due_date = new.due_date,
            source_label = 'Board task · ' || coalesce(proj_title, 'Board project')
        where source_ref = ref and status = 'open' and assignee_id = new.assignee_id;
    else
      insert into public.workspace_tasks
        (title, note, assignee_id, assigned_by, due_date, priority, status,
         source_module, source_label, source_link, source_ref)
      values
        (new.title,
         'Task on board project "' || coalesce(proj_title, 'a board project')
           || '". Move it along on the project kanban, or complete it here when it is finished.',
         new.assignee_id,
         auth.uid(),
         new.due_date,
         'P2',
         'open',
         'board_projects',
         'Board task · ' || coalesce(proj_title, 'Board project'),
         '#board',
         ref);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.sync_board_task_workspace() from public;

drop trigger if exists sync_board_task_workspace on public.board_project_tasks;
create trigger sync_board_task_workspace
after insert or update or delete on public.board_project_tasks
for each row execute function app_private.sync_board_task_workspace();

-- Board project ownership → the owner's Workspace.
create or replace function app_private.sync_board_project_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  ref text := 'board_project:' || coalesce(new.id, old.id)::text;
begin
  if tg_op = 'DELETE' then
    delete from public.workspace_tasks where source_ref = ref and status = 'open';
    return old;
  end if;

  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    delete from public.workspace_tasks
    where source_ref = ref
      and status = 'open'
      and (new.owner_id is null or assignee_id is distinct from new.owner_id);
  end if;

  if new.status = 'Done' then
    update public.workspace_tasks
      set status = 'done', completed_at = now()
      where source_ref = ref and status = 'open';
  elsif new.owner_id is not null then
    if exists (
      select 1 from public.workspace_tasks
      where source_ref = ref and status = 'open' and assignee_id = new.owner_id
    ) then
      update public.workspace_tasks
        set title = 'Lead board project: ' || new.title,
            due_date = new.due_date
        where source_ref = ref and status = 'open' and assignee_id = new.owner_id;
    else
      insert into public.workspace_tasks
        (title, note, assignee_id, assigned_by, due_date, priority, status,
         source_module, source_label, source_link, source_ref)
      values
        ('Lead board project: ' || new.title,
         'You are the owner of this board project.',
         new.owner_id,
         auth.uid(),
         new.due_date,
         'P2',
         'open',
         'board_projects',
         'Board project',
         '#board',
         ref);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.sync_board_project_workspace() from public;

drop trigger if exists sync_board_project_workspace on public.board_projects;
create trigger sync_board_project_workspace
after insert or update or delete on public.board_projects
for each row execute function app_private.sync_board_project_workspace();

-- Completing (or reopening) a linked Workspace card moves the board task too.
-- Project-ownership cards ('board_project:%') deliberately do not sync back:
-- clearing that card is an acknowledgment, not "the project is done".
create or replace function app_private.sync_workspace_board_task()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  task_id uuid;
begin
  if new.source_ref is null or new.source_ref not like 'board_task:%' then
    return new;
  end if;

  task_id := nullif(substring(new.source_ref from 12), '')::uuid;
  if task_id is null then
    return new;
  end if;

  if new.status = 'done' and old.status = 'open' then
    update public.board_project_tasks
      set status = 'Done'
      where id = task_id and status <> 'Done';
  elsif new.status = 'open' and old.status = 'done' then
    update public.board_project_tasks
      set status = 'To Do'
      where id = task_id and status = 'Done';
  end if;

  return new;
end;
$$;

revoke all on function app_private.sync_workspace_board_task() from public;

drop trigger if exists sync_workspace_board_task on public.workspace_tasks;
create trigger sync_workspace_board_task
after update on public.workspace_tasks
for each row execute function app_private.sync_workspace_board_task();

-- ── 3. Backfill existing open assignments into Workspaces ──────

insert into public.workspace_tasks
  (title, note, assignee_id, assigned_by, due_date, priority, status,
   source_module, source_label, source_link, source_ref)
select
  t.title,
  'Task on board project "' || p.title
    || '". Move it along on the project kanban, or complete it here when it is finished.',
  t.assignee_id,
  null,
  t.due_date,
  'P2',
  'open',
  'board_projects',
  'Board task · ' || p.title,
  '#board',
  'board_task:' || t.id::text
from public.board_project_tasks t
join public.board_projects p on p.id = t.project_id
where t.assignee_id is not null
  and t.status <> 'Done'
  and not exists (
    select 1 from public.workspace_tasks w
    where w.source_ref = 'board_task:' || t.id::text and w.status = 'open'
  );

insert into public.workspace_tasks
  (title, note, assignee_id, assigned_by, due_date, priority, status,
   source_module, source_label, source_link, source_ref)
select
  'Lead board project: ' || p.title,
  'You are the owner of this board project.',
  p.owner_id,
  null,
  p.due_date,
  'P2',
  'open',
  'board_projects',
  'Board project',
  '#board',
  'board_project:' || p.id::text
from public.board_projects p
where p.owner_id is not null
  and p.status <> 'Done'
  and not exists (
    select 1 from public.workspace_tasks w
    where w.source_ref = 'board_project:' || p.id::text and w.status = 'open'
  );

notify pgrst, 'reload schema';
