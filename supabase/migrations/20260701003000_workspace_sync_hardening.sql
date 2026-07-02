-- Hardening pass on the board <-> workspace sync triggers (QA findings).
--
-- 1) sync_workspace_board_task ran SECURITY DEFINER off a client-writable
--    source_ref: any authenticated user could insert a workspace card with a
--    forged 'board_task:<uuid>' ref, complete it, and flip any board task past
--    the board_projects RLS. A malformed ref also crashed the uuid cast,
--    breaking workspace task updates. Now: the uuid parse is exception-safe,
--    and the sync only fires when the card's assignee matches the board
--    task's real assignee (i.e. only the capability the assignee already has).
-- 2) sync_board_project_workspace re-inserted the owner's "Lead board
--    project" card on EVERY project update, resurrecting cards the owner had
--    already acknowledged. Now a missing card is only re-created when
--    ownership actually changes or the project comes back from Done.

create or replace function app_private.sync_workspace_board_task()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  task_id uuid;
  task_assignee uuid;
begin
  if new.source_ref is null or new.source_ref not like 'board_task:%' then
    return new;
  end if;

  -- 'board_task:' is 11 chars; anything after must be a well-formed uuid.
  begin
    task_id := nullif(substring(new.source_ref from 12), '')::uuid;
  exception when others then
    return new;
  end;
  if task_id is null then
    return new;
  end if;

  -- Only sync when this card belongs to the board task's current assignee.
  -- A forged source_ref on a self-created card can then only touch tasks the
  -- user is genuinely assigned to, which is exactly the intended capability.
  select assignee_id into task_assignee
  from public.board_project_tasks
  where id = task_id;

  if task_assignee is null or task_assignee is distinct from new.assignee_id then
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

create or replace function app_private.sync_board_project_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  ref text := 'board_project:' || coalesce(new.id, old.id)::text;
  should_create boolean;
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
      -- Missing card: only (re)create it when ownership is new or the
      -- project came back from Done. Plain edits (title, due date, notes)
      -- must not resurrect a card the owner already cleared.
      if tg_op = 'INSERT' then
        should_create := true;
      else
        should_create :=
          new.owner_id is distinct from old.owner_id
          or (old.status = 'Done' and new.status <> 'Done');
      end if;

      if should_create then
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
  end if;

  return new;
end;
$$;

revoke all on function app_private.sync_board_project_workspace() from public;
