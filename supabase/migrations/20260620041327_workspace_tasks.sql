-- Cross-module assignment + notification entity. Anyone can assign a task to
-- any teammate; it surfaces in that teammate's Workspace.
create table if not exists public.workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text,
  assignee_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  due_date date,
  priority text not null default 'P2' check (priority in ('P0','P1','P2')),
  status text not null default 'open' check (status in ('open','done')),
  source_module text,
  source_label text,
  source_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  seen_at timestamptz
);

create index if not exists idx_workspace_tasks_assignee on public.workspace_tasks(assignee_id);
create index if not exists idx_workspace_tasks_assignee_status on public.workspace_tasks(assignee_id, status);
create index if not exists idx_workspace_tasks_assigned_by on public.workspace_tasks(assigned_by);

alter table public.workspace_tasks enable row level security;

-- Visible to the assignee, the assigner, or a superuser
create policy "workspace_tasks_select" on public.workspace_tasks
  for select to authenticated
  using (
    assignee_id = auth.uid()
    or assigned_by = auth.uid()
    or (select app_private.is_superuser())
  );

-- Any authenticated user may create a task, but only as themselves (assigned_by)
create policy "workspace_tasks_insert" on public.workspace_tasks
  for insert to authenticated
  with check (assigned_by = auth.uid());

-- Assignee (mark done/seen), assigner (edit), or superuser may update
create policy "workspace_tasks_update" on public.workspace_tasks
  for update to authenticated
  using (
    assignee_id = auth.uid()
    or assigned_by = auth.uid()
    or (select app_private.is_superuser())
  )
  with check (
    assignee_id = auth.uid()
    or assigned_by = auth.uid()
    or (select app_private.is_superuser())
  );

-- The assigner or a superuser may delete
create policy "workspace_tasks_delete" on public.workspace_tasks
  for delete to authenticated
  using (assigned_by = auth.uid() or (select app_private.is_superuser()));

create trigger set_workspace_tasks_updated_at
  before update on public.workspace_tasks
  for each row execute function set_updated_at();
