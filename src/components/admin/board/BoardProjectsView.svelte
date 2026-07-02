<script>
  import { onMount } from "svelte";
  import {
    ClipboardList,
    Hourglass,
    LayoutList,
    ListChecks,
    OctagonAlert,
    Plus,
    SquareKanban,
    Trophy,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import BoardProjectBoard from "./BoardProjectBoard.svelte";
  import BoardProjectDrawer from "./BoardProjectDrawer.svelte";

  export let supabase;
  export let profile = null;
  export let teamMembers = [];
  export let refreshKey = 0;
  export let onAssignTask = () => {};
  // Board task/owner changes can create or close the CURRENT user's workspace
  // cards via DB triggers; the parent uses this to refresh the nav badge.
  export let onWorkspaceChanged = () => {};

  const BOARD_STATUSES = ["Planning", "In Progress", "Blocked", "Done"];
  const STATUS_TONES = {
    Planning: "neutral",
    "In Progress": "blue",
    Blocked: "red",
    Done: "green",
  };
  const VIEW_TABS = [
    { id: "list", label: "List", icon: LayoutList },
    { id: "kanban", label: "Kanban", icon: SquareKanban },
  ];
  const projectColumns =
    "id, title, description, status, owner_id, due_date, created_by, created_at, updated_at";

  let boardProjects = [];
  let taskSummaries = {};
  let isLoading = true;
  let errorMessage = "";
  let viewMode = "list";
  let expandedProjectId = "";
  let drawerProject = null;
  let lastRefreshKey = refreshKey;
  let showCreateForm = false;
  let newTitle = "";
  let newDueDate = "";
  let isCreating = false;
  let createError = "";
  let draggedProjectId = "";
  let dragOverStatus = "";
  let movingProjectId = "";

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadBoardProjects();
  }
  $: projectsByStatus = BOARD_STATUSES.reduce((groups, status) => {
    groups[status] = boardProjects.filter((project) => project.status === status);
    return groups;
  }, {});
  $: sortedProjects = boardProjects
    .slice()
    .sort((a, b) => {
      if (a.status === "Done" && b.status !== "Done") return 1;
      if (b.status === "Done" && a.status !== "Done") return -1;
      return (a.due_date || "9999").localeCompare(b.due_date || "9999");
    });
  $: expandedProject =
    boardProjects.find((project) => project.id === expandedProjectId) || null;

  onMount(() => {
    loadBoardProjects();
  });

  async function loadBoardProjects() {
    if (!supabase) return;

    isLoading = true;
    errorMessage = "";

    const [projectsResult, tasksResult] = await Promise.all([
      supabase
        .from("board_projects")
        .select(projectColumns)
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase.from("board_project_tasks").select("project_id, status"),
    ]);

    if (projectsResult.error) {
      errorMessage = projectsResult.error.message;
    } else {
      boardProjects = projectsResult.data || [];
    }

    // The summary chips are progressive enhancement; a task load error should
    // not block the project list.
    if (!tasksResult.error) {
      taskSummaries = buildTaskSummaries(tasksResult.data || []);
    }

    isLoading = false;
  }

  function buildTaskSummaries(taskRows) {
    return taskRows.reduce((acc, task) => {
      const summary = acc[task.project_id] || { total: 0, done: 0 };
      summary.total += 1;
      if (task.status === "Done") summary.done += 1;
      acc[task.project_id] = summary;
      return acc;
    }, {});
  }

  function handleExpandedTasksChanged(projectId, tasks) {
    if (!projectId) return;

    taskSummaries = {
      ...taskSummaries,
      [projectId]: {
        total: tasks.length,
        done: tasks.filter((task) => task.status === "Done").length,
      },
    };
    onWorkspaceChanged();
  }

  async function createProject(event) {
    event?.preventDefault();

    const title = newTitle.trim();
    if (!title || isCreating) return;

    isCreating = true;
    createError = "";

    const { data, error } = await supabase
      .from("board_projects")
      .insert({
        title,
        due_date: newDueDate || null,
        created_by: profile?.id || null,
        owner_id: profile?.id || null,
      })
      .select(projectColumns)
      .single();

    if (error) {
      createError = error.message;
    } else {
      boardProjects = [data, ...boardProjects];
      newTitle = "";
      newDueDate = "";
      showCreateForm = false;
      expandedProjectId = data.id;
      onWorkspaceChanged();
    }

    isCreating = false;
  }

  function handleProjectUpdated(updatedProject) {
    if (!updatedProject?.id) return;

    boardProjects = boardProjects.map((project) =>
      project.id === updatedProject.id ? { ...project, ...updatedProject } : project,
    );
    onWorkspaceChanged();
  }

  function handleProjectDeleted(deletedId) {
    boardProjects = boardProjects.filter((project) => project.id !== deletedId);
    if (expandedProjectId === deletedId) expandedProjectId = "";
    drawerProject = null;
  }

  function openProject(project) {
    if (draggedProjectId) return;
    expandedProjectId = project.id;
  }

  function handleDragStart(event, project) {
    // Don't allow re-dragging a card whose status save is still in flight.
    if (movingProjectId === project.id) {
      event.preventDefault();
      return;
    }

    draggedProjectId = project.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", project.id);
  }

  function handleDragEnd() {
    draggedProjectId = "";
    dragOverStatus = "";
  }

  function handleColumnDragOver(event, status) {
    if (!draggedProjectId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    dragOverStatus = status;
  }

  function handleColumnDragLeave(event, status) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }

    if (dragOverStatus === status) {
      dragOverStatus = "";
    }
  }

  async function handleColumnDrop(event, status) {
    event.preventDefault();

    const projectId = event.dataTransfer.getData("text/plain") || draggedProjectId;
    const project = boardProjects.find((item) => item.id === projectId);

    draggedProjectId = "";
    dragOverStatus = "";

    if (!project || project.status === status) return;

    const previousStatus = project.status;
    movingProjectId = project.id;
    handleProjectUpdated({ ...project, status });

    // Optimistic lock: zero rows back means someone else changed the project
    // between our load and this move.
    let query = supabase.from("board_projects").update({ status }).eq("id", project.id);
    if (project.updated_at) {
      query = query.eq("updated_at", project.updated_at);
    }

    const { data, error } = await query.select(projectColumns).maybeSingle();

    if (error) {
      errorMessage = error.message;
      handleProjectUpdated({ ...project, status: previousStatus });
    } else if (!data) {
      handleProjectUpdated({ ...project, status: previousStatus });
      errorMessage = `Someone else just updated "${project.title}" — the board has been refreshed with their change. Try again in a moment.`;
      await loadBoardProjects();
    } else {
      handleProjectUpdated(data);
    }

    movingProjectId = "";
  }

  function formatDate(value) {
    if (!value) return "No due date";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function isOverdue(project) {
    if (!project.due_date || project.status === "Done") return false;

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return project.due_date < todayKey;
  }

  function getOwnerLabel(project) {
    const owner = teamMembers.find((member) => member.id === project.owner_id);
    return owner?.full_name || owner?.email || "Unowned";
  }

  function taskSummaryLabel(project) {
    const summary = taskSummaries[project.id];
    if (!summary?.total) return "No tasks";
    return `${summary.done}/${summary.total} tasks`;
  }
</script>

<section class="space-y-4" aria-labelledby="board-projects-title">
  <h3 id="board-projects-title" class="sr-only">Board Projects</h3>

  {#if expandedProject}
    <BoardProjectBoard
      {supabase}
      project={expandedProject}
      {teamMembers}
      {refreshKey}
      onBack={() => (expandedProjectId = "")}
      onOpenSettings={() => (drawerProject = expandedProject)}
      {onAssignTask}
      onTasksChanged={handleExpandedTasksChanged}
    />
  {:else}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Planning" value={projectsByStatus["Planning"]?.length || 0} icon={ClipboardList} tone="gold" loading={isLoading} />
      <StatCard label="In Progress" value={projectsByStatus["In Progress"]?.length || 0} icon={Hourglass} tone="teal" loading={isLoading} />
      <StatCard label="Blocked" value={projectsByStatus["Blocked"]?.length || 0} icon={OctagonAlert} tone="rose" loading={isLoading} />
      <StatCard label="Done" value={projectsByStatus["Done"]?.length || 0} icon={Trophy} tone="teal" loading={isLoading} />
    </div>

    {#if errorMessage}
      <Banner tone="error" message={errorMessage} />
    {/if}

    <Panel title="Board Projects" id="board-projects-panel-title" loading={isLoading}>
      <p class="mb-4 text-sm leading-6 text-ink/60">
        Click a project to open its own task board, where each task moves through
        To Do, In Progress, Blocked, and Done.
      </p>

      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={VIEW_TABS} bind:active={viewMode} variant="segmented" label="View mode" hasPanels={false} />

        <Button
          variant="primary"
          icon={Plus}
          onclick={() => (showCreateForm = !showCreateForm)}
        >
          New project
        </Button>
      </div>

      {#if showCreateForm}
        <form class="mb-4 rounded-control border border-ink/8 bg-canvas p-4" onsubmit={createProject}>
          <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              class="input"
              placeholder="Project title"
              aria-label="Project title"
              bind:value={newTitle}
              disabled={isCreating}
            />
            <input
              type="date"
              class="input"
              aria-label="Due date"
              bind:value={newDueDate}
              disabled={isCreating}
            />
            <Button
              variant="dark"
              type="submit"
              loading={isCreating}
              disabled={!newTitle.trim()}
            >
              Create
            </Button>
          </div>
          {#if createError}
            <Banner tone="error" message={createError} class="mt-3" />
          {/if}
        </form>
      {/if}

      {#if isLoading}
        <div class="space-y-2">
          {#each Array(3) as _, i (i)}
            <SkeletonCard lines={2} />
          {/each}
        </div>
      {:else if !boardProjects.length}
        <EmptyState
          title="No board projects yet"
          message="Create the first board project to start tracking administrative work, owners, tasks, and due dates."
        />
      {:else if viewMode === "list"}
        <div class="space-y-2">
          {#each sortedProjects as project (project.id)}
            <button
              type="button"
              class="flex w-full flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40 hover:shadow-card"
              onclick={() => openProject(project)}
            >
              <span class="min-w-0 flex-1">
                <span class="block font-bold leading-snug {project.status === 'Done' ? 'text-ink/40 line-through' : 'text-ink'}">
                  {project.title}
                </span>
                <span class="mt-1 block text-sm text-ink/60">
                  {getOwnerLabel(project)}
                </span>
              </span>
              <Badge tone="neutral" size="xs">
                <ListChecks class="h-3 w-3" aria-hidden="true" />
                {taskSummaryLabel(project)}
              </Badge>
              <Badge tone={STATUS_TONES[project.status] || "neutral"}>
                {project.status}
              </Badge>
              <span class="text-xs font-bold {isOverdue(project) ? 'text-red-600' : 'text-ink/50'}">
                {formatDate(project.due_date)}
                {#if isOverdue(project)}
                  · Overdue
                {/if}
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="board-kanban-scroll -mx-4 overflow-x-auto px-4 pb-3 md:-mx-5 md:px-5">
          <div class="board-kanban-track grid gap-3">
            {#each BOARD_STATUSES as status}
              <div
                class="snap-start flex min-h-[24rem] flex-col rounded-control border border-ink/8 bg-canvas p-3 transition {dragOverStatus === status ? 'border-accent bg-accent-soft ring-2 ring-accent/20' : ''}"
                role="region"
                aria-label={`${status} projects`}
                ondragover={(event) => handleColumnDragOver(event, status)}
                ondragleave={(event) => handleColumnDragLeave(event, status)}
                ondrop={(event) => handleColumnDrop(event, status)}
              >
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h4 class="text-sm font-bold text-ink">{status}</h4>
                  <Badge tone="neutral" size="xs" class="bg-white">
                    {projectsByStatus[status]?.length || 0}
                  </Badge>
                </div>
                <div class="flex-1 space-y-2">
                  {#each projectsByStatus[status] || [] as project (project.id)}
                    <div
                      class="rounded-control border border-ink/8 bg-white shadow-card transition {movingProjectId === project.id ? 'opacity-60' : ''}"
                      draggable="true"
                      role="button"
                      tabindex="0"
                      ondragstart={(event) => handleDragStart(event, project)}
                      ondragend={handleDragEnd}
                      onclick={() => openProject(project)}
                      onkeydown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openProject(project);
                        }
                      }}
                    >
                      <div class="px-3 py-2.5">
                        <p class="text-sm font-bold leading-snug text-ink">{project.title}</p>
                        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink/50">
                          <span>{getOwnerLabel(project)}</span>
                          <span>{taskSummaryLabel(project)}</span>
                          {#if project.due_date}
                            <span class={isOverdue(project) ? "font-bold text-red-600" : ""}>
                              {formatDate(project.due_date)}
                            </span>
                          {/if}
                        </div>
                      </div>
                    </div>
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
    </Panel>
  {/if}
</section>

<BoardProjectDrawer
  {supabase}
  project={drawerProject}
  {teamMembers}
  currentUserRole={profile?.role || "member"}
  onClose={() => (drawerProject = null)}
  onProjectUpdated={handleProjectUpdated}
  onProjectDeleted={handleProjectDeleted}
  {onAssignTask}
/>

<style>
  .board-kanban-scroll {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scroll-padding-inline: 1rem;
    scroll-snap-type: x mandatory;
  }

  .board-kanban-track {
    grid-auto-columns: 100%;
    grid-auto-flow: column;
  }

  @media (min-width: 768px) {
    .board-kanban-track {
      grid-auto-columns: calc((100% - 0.75rem) / 2);
    }
  }

  @media (min-width: 1280px) {
    .board-kanban-track {
      grid-auto-columns: calc((100% - 2.25rem) / 4);
    }
  }
</style>
