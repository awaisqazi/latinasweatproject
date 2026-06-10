<script>
  import { CircleAlert, ListChecks, Plus, Trash2 } from "@lucide/svelte";

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

  async function deleteTask(task) {
    if (!task?.id || deletingTaskId) return;

    const shouldDelete = window.confirm(`Delete task "${task.title}"?`);
    if (!shouldDelete) return;

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
      <ListChecks class="h-4 w-4 text-[#0f766e]" aria-hidden="true" />
      <h4 id="board-task-list-title" class="font-bold">Tasks</h4>
    </div>
    {#if tasks.length}
      <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
        {completedCount}/{tasks.length} done
      </span>
    {/if}
  </div>

  {#if errorMessage}
    <div class="mt-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
      <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{errorMessage}</span>
    </div>
  {/if}

  <form class="mt-3 flex gap-2" onsubmit={addTask}>
    <input
      type="text"
      class="min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
      placeholder="Add a task"
      bind:value={newTaskTitle}
      disabled={isAdding}
    />
    <button
      type="submit"
      class="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md bg-[#ffbd59] px-3 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={!newTaskTitle.trim() || isAdding}
    >
      <Plus class="h-4 w-4" aria-hidden="true" />
      Add
    </button>
  </form>

  <div class="mt-3 space-y-2">
    {#if isLoading}
      <div class="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
        <span class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin" aria-hidden="true"></span>
        Loading tasks
      </div>
    {:else if tasks.length}
      {#each tasks as task (task.id)}
        <article class="rounded-md border px-3 py-2.5 {task.done ? 'border-emerald-200 bg-emerald-50/60' : 'border-gray-200 bg-white'}">
          <div class="flex items-start gap-3">
            <input
              type="checkbox"
              class="mt-1 h-4 w-4 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]"
              checked={task.done}
              aria-label={`Mark "${task.title}" ${task.done ? "not done" : "done"}`}
              disabled={savingTaskId === task.id}
              onchange={(event) => toggleDone(task, event.currentTarget.checked)}
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold leading-snug {task.done ? 'text-gray-500 line-through' : ''}">
                {task.title}
              </p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <select
                  class="min-h-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-[#0f766e]"
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
                  class="min-h-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 outline-none transition focus:border-[#0f766e]"
                  value={task.due_date || ""}
                  aria-label={`Due date for "${task.title}"`}
                  disabled={savingTaskId === task.id}
                  onchange={(event) =>
                    updateTask(task, { due_date: event.currentTarget.value || null })}
                />
                {#if task.due_date}
                  <span class="text-xs font-bold text-gray-500">Due {formatDueDate(task.due_date)}</span>
                {/if}
                {#if getAssigneeName(task)}
                  <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">
                    {getAssigneeName(task)}
                  </span>
                {/if}
              </div>
            </div>
            <button
              type="button"
              class="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={`Delete task "${task.title}"`}
              onclick={() => deleteTask(task)}
              disabled={deletingTaskId === task.id}
            >
              <Trash2 class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </article>
      {/each}
    {:else}
      <p class="rounded-md border border-dashed border-gray-300 bg-white px-4 py-4 text-center text-sm text-gray-500">
        No tasks yet. Break this project into steps above.
      </p>
    {/if}
  </div>
</section>
