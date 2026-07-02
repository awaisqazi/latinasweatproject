<script>
  // Expanded view for one board project: its own task kanban. Tasks move
  // through stages (To Do / In Progress / Blocked / Done) by drag-and-drop or
  // the per-card stage select. Assignments sync into the assignee's Workspace
  // via DB triggers, so there is no workspace bookkeeping here.
  import {
    ArrowLeft,
    CalendarClock,
    Plus,
    Settings2,
    Trash2,
    UserPlus,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";

  export let supabase;
  export let project = null;
  export let teamMembers = [];
  export let refreshKey = 0;
  export let onBack = () => {};
  export let onOpenSettings = () => {};
  export let onAssignTask = () => {};
  export let onTasksChanged = () => {};

  const TASK_STAGES = ["To Do", "In Progress", "Blocked", "Done"];
  const STATUS_TONES = {
    Planning: "neutral",
    "In Progress": "blue",
    Blocked: "red",
    Done: "green",
  };
  const taskColumns =
    "id, project_id, title, status, done, done_at, assignee_id, due_date, sort_order, created_at, updated_at";

  let tasks = [];
  let isLoading = false;
  let errorMessage = "";
  let newTaskTitle = "";
  let isAdding = false;
  let savingTaskIds = new Set();
  let deletingTaskId = "";
  let confirmingTask = null;
  let loadedProjectId = "";
  let lastRefreshKey = refreshKey;
  let draggedTaskId = "";
  let dragOverStage = "";

  $: if (project?.id && project.id !== loadedProjectId) {
    loadedProjectId = project.id;
    loadTasks();
  }
  // Tasks can change from outside this view (Workspace completions sync via
  // DB triggers), so the header Refresh must re-pull them too.
  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadTasks();
  }
  $: tasksByStage = TASK_STAGES.reduce((groups, stage) => {
    groups[stage] = tasks.filter((task) => task.status === stage);
    return groups;
  }, {});
  $: doneCount = tasksByStage["Done"]?.length || 0;

  async function loadTasks() {
    if (!supabase || !project?.id) return;

    isLoading = true;
    errorMessage = "";

    const { data, error } = await supabase
      .from("board_project_tasks")
      .select(taskColumns)
      .eq("project_id", project.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      tasks = [];
      errorMessage = error.message;
    } else {
      tasks = data || [];
    }

    isLoading = false;
  }

  async function addTask(event) {
    event?.preventDefault();

    const title = newTaskTitle.trim();
    if (!title || !supabase || !project?.id || isAdding) return;

    isAdding = true;
    errorMessage = "";

    const nextSortOrder =
      tasks.reduce((max, task) => Math.max(max, task.sort_order || 0), 0) + 10;

    const { data, error } = await supabase
      .from("board_project_tasks")
      .insert({ project_id: project.id, title, sort_order: nextSortOrder })
      .select(taskColumns)
      .single();

    if (error) {
      errorMessage = error.message;
    } else {
      tasks = [...tasks, data];
      newTaskTitle = "";
      onTasksChanged(project.id, tasks);
    }

    isAdding = false;
  }

  // Returns true on success so onchange handlers can revert the control's
  // DOM value when the save fails (the value attribute alone won't re-apply).
  async function updateTask(task, updates) {
    // Per-task guard (a Set) so saving one task never blocks edits to another.
    if (!task?.id || savingTaskIds.has(task.id)) return false;

    savingTaskIds = new Set(savingTaskIds).add(task.id);
    errorMessage = "";

    // Optimistic lock: zero rows back means someone else (a teammate, or a
    // Workspace completion syncing through the DB) changed this task first.
    let query = supabase.from("board_project_tasks").update(updates).eq("id", task.id);
    if (task.updated_at) {
      query = query.eq("updated_at", task.updated_at);
    }

    const { data, error } = await query.select(taskColumns).maybeSingle();

    let succeeded = false;
    if (error) {
      errorMessage = error.message;
    } else if (!data) {
      errorMessage = `Someone else just updated "${task.title}" — the board has been refreshed with their change. Try again in a moment.`;
      await loadTasks();
    } else {
      tasks = tasks.map((item) => (item.id === data.id ? data : item));
      onTasksChanged(project.id, tasks);
      succeeded = true;
    }

    const next = new Set(savingTaskIds);
    next.delete(task.id);
    savingTaskIds = next;
    return succeeded;
  }

  function moveTaskToStage(task, stage) {
    if (!task?.id || task.status === stage) return Promise.resolve(false);
    return updateTask(task, { status: stage });
  }

  async function handleStageSelect(event, task) {
    const control = event.currentTarget;
    const succeeded = await moveTaskToStage(task, control.value);
    if (!succeeded) control.value = task.status;
  }

  async function handleAssigneeSelect(event, task) {
    const control = event.currentTarget;
    const succeeded = await updateTask(task, { assignee_id: control.value || null });
    if (!succeeded) control.value = task.assignee_id || "";
  }

  async function handleDueDateChange(event, task) {
    const control = event.currentTarget;
    const succeeded = await updateTask(task, { due_date: control.value || null });
    if (!succeeded) control.value = task.due_date || "";
  }

  function requestDeleteTask(task) {
    if (!task?.id || deletingTaskId) return;
    confirmingTask = task;
  }

  async function deleteTask(task) {
    if (!task?.id || deletingTaskId) return;

    deletingTaskId = task.id;
    errorMessage = "";

    const { error } = await supabase
      .from("board_project_tasks")
      .delete()
      .eq("id", task.id);

    if (error) {
      errorMessage = error.message;
    } else {
      tasks = tasks.filter((item) => item.id !== task.id);
      onTasksChanged(project.id, tasks);
    }

    deletingTaskId = "";
    confirmingTask = null;
  }

  // ── Drag and drop between stage columns ─────────────────────────
  function handleTaskDragStart(event, task) {
    if (savingTaskIds.has(task.id)) {
      event.preventDefault();
      return;
    }

    draggedTaskId = task.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  }

  function handleTaskDragEnd() {
    draggedTaskId = "";
    dragOverStage = "";
  }

  function handleStageDragOver(event, stage) {
    if (!draggedTaskId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    dragOverStage = stage;
  }

  function handleStageDragLeave(event, stage) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }

    if (dragOverStage === stage) {
      dragOverStage = "";
    }
  }

  function handleStageDrop(event, stage) {
    event.preventDefault();

    const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
    const task = tasks.find((item) => item.id === taskId);

    draggedTaskId = "";
    dragOverStage = "";

    if (!task) return;
    moveTaskToStage(task, stage);
  }

  function formatDate(value) {
    if (!value) return "No due date";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function getOwnerLabel(item) {
    const owner = teamMembers.find((member) => member.id === item?.owner_id);
    return owner?.full_name || owner?.email || "Unowned";
  }

  function getAssigneeName(task) {
    const member = teamMembers.find((item) => item.id === task.assignee_id);
    return member?.full_name || member?.email || "";
  }
</script>

<section class="space-y-4" aria-labelledby="board-project-board-title">
  <div class="rounded-card border border-ink/8 bg-white p-4 shadow-card md:p-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <Button size="sm" icon={ArrowLeft} onclick={onBack}>
          All board projects
        </Button>
        <h3 id="board-project-board-title" class="mt-3 text-2xl font-bold leading-tight text-ink">
          {project?.title}
        </h3>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONES[project?.status] || "neutral"}>{project?.status}</Badge>
          <Badge tone="neutral">Owner: {getOwnerLabel(project)}</Badge>
          <Badge tone="neutral">
            <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
            {formatDate(project?.due_date)}
          </Badge>
          {#if tasks.length}
            <Badge tone={doneCount === tasks.length ? "green" : "neutral"}>
              {doneCount}/{tasks.length} tasks done
            </Badge>
          {/if}
        </div>
        {#if project?.description}
          <p class="mt-3 max-w-2xl text-sm leading-6 text-ink/70">{project.description}</p>
        {/if}
      </div>

      <div class="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={UserPlus}
          onclick={() =>
            onAssignTask({
              sourceModule: "board_projects",
              sourceLabel: `Board: ${project?.title}`,
              sourceLink: "#board",
              title: `Follow up: ${project?.title}`,
            })}
        >
          Assign a task about this
        </Button>
        <Button size="sm" icon={Settings2} onclick={onOpenSettings}>
          Project settings
        </Button>
      </div>
    </div>

    <form class="mt-4 flex gap-2" onsubmit={addTask}>
      <input
        type="text"
        class="input"
        placeholder="Add a task to this project"
        aria-label="Add a task to this project"
        bind:value={newTaskTitle}
        disabled={isAdding}
      />
      <Button
        variant="primary"
        type="submit"
        icon={Plus}
        class="shrink-0"
        loading={isAdding}
        disabled={!newTaskTitle.trim()}
      >
        Add
      </Button>
    </form>

    {#if errorMessage}
      <Banner tone="error" message={errorMessage} class="mt-4" />
    {/if}
  </div>

  {#if isLoading}
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {#each Array(4) as _, i (i)}
        <SkeletonCard lines={3} />
      {/each}
    </div>
  {:else}
    <div class="task-kanban-scroll -mx-4 overflow-x-auto px-4 pb-3 md:-mx-6 md:px-6">
      <div class="task-kanban-track grid gap-3">
        {#each TASK_STAGES as stage}
          <div
            class="snap-start flex min-h-[22rem] flex-col rounded-card border border-ink/8 bg-canvas p-3 transition {dragOverStage === stage ? 'border-accent bg-accent-soft ring-2 ring-accent/20' : ''}"
            role="region"
            aria-label={`${stage} tasks`}
            ondragover={(event) => handleStageDragOver(event, stage)}
            ondragleave={(event) => handleStageDragLeave(event, stage)}
            ondrop={(event) => handleStageDrop(event, stage)}
          >
            <div class="mb-3 flex items-center justify-between gap-2">
              <h4 class="text-sm font-bold text-ink">{stage}</h4>
              <div class="flex items-center gap-2">
                {#if dragOverStage === stage}
                  <Badge tone="teal" variant="solid" size="xs">Drop</Badge>
                {/if}
                <Badge tone="neutral" size="xs" class="bg-white">
                  {tasksByStage[stage]?.length || 0}
                </Badge>
              </div>
            </div>

            <div class="flex-1 space-y-2">
              {#each tasksByStage[stage] || [] as task (task.id)}
                <article
                  class="rounded-control border border-ink/8 bg-white shadow-card transition {savingTaskIds.has(task.id) ? 'opacity-60' : ''} {draggedTaskId === task.id ? 'opacity-50' : ''}"
                  draggable="true"
                  ondragstart={(event) => handleTaskDragStart(event, task)}
                  ondragend={handleTaskDragEnd}
                >
                  <div class="px-3 py-2.5">
                    <div class="flex items-start justify-between gap-2">
                      <p class="min-w-0 text-sm font-bold leading-snug {task.status === 'Done' ? 'text-ink/45 line-through' : 'text-ink'}">
                        {task.title}
                      </p>
                      <Button
                        iconOnly
                        size="sm"
                        variant="ghost"
                        icon={Trash2}
                        label={`Delete task "${task.title}"`}
                        loading={deletingTaskId === task.id}
                        onclick={() => requestDeleteTask(task)}
                      />
                    </div>

                    <div class="mt-2 grid gap-2">
                      <label class="sr-only" for={`task-stage-${task.id}`}>
                        Stage for "{task.title}"
                      </label>
                      <select
                        id={`task-stage-${task.id}`}
                        class="min-h-8 rounded-control border border-ink/14 bg-white px-2 text-xs font-semibold text-ink/70 outline-none transition focus:border-accent"
                        value={task.status}
                        disabled={savingTaskIds.has(task.id)}
                        onchange={(event) => handleStageSelect(event, task)}
                      >
                        {#each TASK_STAGES as stageOption}
                          <option value={stageOption}>{stageOption}</option>
                        {/each}
                      </select>

                      <div class="flex flex-wrap items-center gap-2">
                        <select
                          class="min-h-8 min-w-0 flex-1 rounded-control border border-ink/14 bg-white px-2 text-xs font-semibold text-ink/70 outline-none transition focus:border-accent"
                          value={task.assignee_id || ""}
                          aria-label={`Assignee for "${task.title}"`}
                          disabled={savingTaskIds.has(task.id)}
                          onchange={(event) => handleAssigneeSelect(event, task)}
                        >
                          <option value="">Unassigned</option>
                          {#each teamMembers as member}
                            <option value={member.id}>{member.full_name || member.email}</option>
                          {/each}
                        </select>
                        <input
                          type="date"
                          class="min-h-8 rounded-control border border-ink/14 bg-white px-2 text-xs font-semibold text-ink/70 outline-none transition focus:border-accent"
                          value={task.due_date || ""}
                          aria-label={`Due date for "${task.title}"`}
                          disabled={savingTaskIds.has(task.id)}
                          onchange={(event) => handleDueDateChange(event, task)}
                        />
                      </div>

                      {#if getAssigneeName(task) || task.due_date}
                        <div class="flex flex-wrap items-center gap-2">
                          {#if getAssigneeName(task)}
                            <Badge tone="neutral" size="xs">{getAssigneeName(task)}</Badge>
                          {/if}
                          {#if task.due_date}
                            <span class="text-xs font-bold text-ink/50">Due {formatDate(task.due_date)}</span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                </article>
              {:else}
                <p class="rounded-control border border-dashed border-ink/15 bg-white px-3 py-4 text-center text-xs text-ink/50">
                  Empty
                </p>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</section>

<ConfirmDialog
  open={Boolean(confirmingTask)}
  title="Delete this task?"
  message={`Delete task "${confirmingTask?.title}"? This cannot be undone.`}
  confirmLabel="Delete task"
  tone="danger"
  busy={Boolean(deletingTaskId)}
  onConfirm={() => deleteTask(confirmingTask)}
  onCancel={() => (confirmingTask = null)}
/>

<style>
  .task-kanban-scroll {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scroll-padding-inline: 1rem;
    scroll-snap-type: x mandatory;
  }

  .task-kanban-track {
    grid-auto-columns: 100%;
    grid-auto-flow: column;
  }

  @media (min-width: 768px) {
    .task-kanban-scroll {
      scroll-padding-inline: 1.5rem;
    }

    .task-kanban-track {
      grid-auto-columns: calc((100% - 0.75rem) / 2);
    }
  }

  @media (min-width: 1280px) {
    .task-kanban-track {
      grid-auto-columns: calc((100% - 2.25rem) / 4);
    }
  }
</style>
