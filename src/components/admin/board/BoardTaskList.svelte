<script>
  import { ListChecks, Plus, Trash2 } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";

  export let supabase;
  export let projectId = "";
  export let teamMembers = [];
  export let onTasksChanged = () => {};

  let tasks = [];
  let isLoading = false;
  let errorMessage = "";
  let newTaskTitle = "";
  let isAdding = false;
  let savingTaskId = "";
  let deletingTaskId = "";
  let confirmingTask = null;
  let loadedProjectId = "";

  const taskColumns =
    "id, project_id, title, done, done_at, assignee_id, due_date, sort_order, created_at";

  $: if (projectId && projectId !== loadedProjectId) {
    loadedProjectId = projectId;
    loadTasks();
  }
  $: completedCount = tasks.filter((task) => task.done).length;

  async function loadTasks() {
    if (!supabase || !projectId) return;

    isLoading = true;
    errorMessage = "";

    const { data, error } = await supabase
      .from("board_project_tasks")
      .select(taskColumns)
      .eq("project_id", projectId)
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
    if (!title || !supabase || !projectId || isAdding) return;

    isAdding = true;
    errorMessage = "";

    const nextSortOrder =
      tasks.reduce((max, task) => Math.max(max, task.sort_order || 0), 0) + 10;

    const { data, error } = await supabase
      .from("board_project_tasks")
      .insert({ project_id: projectId, title, sort_order: nextSortOrder })
      .select(taskColumns)
      .single();

    if (error) {
      errorMessage = error.message;
    } else {
      tasks = [...tasks, data];
      newTaskTitle = "";
      onTasksChanged(tasks);
    }

    isAdding = false;
  }

  async function updateTask(task, updates) {
    if (!task?.id || savingTaskId) return;

    savingTaskId = task.id;
    errorMessage = "";

    const { data, error } = await supabase
      .from("board_project_tasks")
      .update(updates)
      .eq("id", task.id)
      .select(taskColumns)
      .single();

    if (error) {
      errorMessage = error.message;
    } else {
      tasks = tasks.map((item) => (item.id === data.id ? data : item));
      onTasksChanged(tasks);
    }

    savingTaskId = "";
  }

  function toggleDone(task, checked) {
    updateTask(task, {
      done: checked,
      done_at: checked ? new Date().toISOString() : null,
    });
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
      onTasksChanged(tasks);
    }

    deletingTaskId = "";
    confirmingTask = null;
  }

  function formatDueDate(value) {
    if (!value) return "";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function getAssigneeName(task) {
    const member = teamMembers.find((item) => item.id === task.assignee_id);
    return member?.full_name || member?.email || "";
  }
</script>

<section aria-labelledby="board-task-list-title">
  <div class="flex items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <ListChecks class="h-4 w-4 text-accent" aria-hidden="true" />
      <h4 id="board-task-list-title" class="font-bold text-ink">Tasks</h4>
    </div>
    {#if tasks.length}
      <Badge tone="neutral">{completedCount}/{tasks.length} done</Badge>
    {/if}
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} class="mt-3" />
  {/if}

  <form class="mt-3 flex gap-2" onsubmit={addTask}>
    <input
      type="text"
      class="input"
      placeholder="Add a task"
      aria-label="Add a task"
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

  <div class="mt-3 space-y-2">
    {#if isLoading}
      <SkeletonCard lines={2} />
    {:else if tasks.length}
      {#each tasks as task (task.id)}
        <article class="rounded-control border px-3 py-2.5 {task.done ? 'border-green-200 bg-green-50/60' : 'border-ink/8 bg-white'}">
          <div class="flex items-start gap-3">
            <input
              type="checkbox"
              class="mt-1 h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent"
              checked={task.done}
              aria-label={`Mark "${task.title}" ${task.done ? "not done" : "done"}`}
              disabled={savingTaskId === task.id}
              onchange={(event) => toggleDone(task, event.currentTarget.checked)}
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold leading-snug {task.done ? 'text-ink/50 line-through' : 'text-ink'}">
                {task.title}
              </p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <select
                  class="min-h-8 rounded-control border border-ink/14 bg-white px-2 text-xs font-semibold text-ink/70 outline-none transition focus:border-accent"
                  value={task.assignee_id || ""}
                  aria-label={`Assignee for "${task.title}"`}
                  disabled={savingTaskId === task.id}
                  onchange={(event) =>
                    updateTask(task, { assignee_id: event.currentTarget.value || null })}
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
                  disabled={savingTaskId === task.id}
                  onchange={(event) =>
                    updateTask(task, { due_date: event.currentTarget.value || null })}
                />
                {#if task.due_date}
                  <span class="text-xs font-bold text-ink/50">Due {formatDueDate(task.due_date)}</span>
                {/if}
                {#if getAssigneeName(task)}
                  <Badge tone="neutral" size="xs">{getAssigneeName(task)}</Badge>
                {/if}
              </div>
            </div>
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
        </article>
      {/each}
    {:else}
      <p class="rounded-control border border-dashed border-ink/15 bg-white px-4 py-4 text-center text-sm text-ink/55">
        No tasks yet. Break this project into steps above.
      </p>
    {/if}
  </div>
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
