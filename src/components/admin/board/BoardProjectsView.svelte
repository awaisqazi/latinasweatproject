<script>
  import { onMount } from "svelte";
  import {
    CircleAlert,
    ClipboardList,
    Hourglass,
    LayoutList,
    OctagonAlert,
    Plus,
    SquareKanban,
    Trophy,
  } from "@lucide/svelte";
  import EmptyState from "../marketing/EmptyState.svelte";
  import Panel from "../marketing/Panel.svelte";
  import SummaryCard from "../marketing/SummaryCard.svelte";
  import BoardProjectDrawer from "./BoardProjectDrawer.svelte";

  export let supabase;
  export let profile = null;
  export let teamMembers = [];
  export let refreshKey = 0;

  const BOARD_STATUSES = ["Planning", "In Progress", "Blocked", "Done"];
  const projectColumns =
    "id, title, description, status, owner_id, due_date, created_by, created_at, updated_at";

  let boardProjects = [];
  let isLoading = true;
  let errorMessage = "";
  let viewMode = "list";
  let selectedProject = null;
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

  onMount(() => {
    loadBoardProjects();
  });

  async function loadBoardProjects() {
    if (!supabase) return;

    isLoading = true;
    errorMessage = "";

    const { data, error } = await supabase
      .from("board_projects")
      .select(projectColumns)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      errorMessage = error.message;
    } else {
      boardProjects = data || [];
    }

    isLoading = false;
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
      selectedProject = data;
    }

    isCreating = false;
  }

  function handleProjectUpdated(updatedProject) {
    if (!updatedProject?.id) return;

    boardProjects = boardProjects.map((project) =>
      project.id === updatedProject.id ? { ...project, ...updatedProject } : project,
    );

    if (selectedProject?.id === updatedProject.id) {
      selectedProject = { ...selectedProject, ...updatedProject };
    }
  }

  function handleProjectDeleted(deletedId) {
    boardProjects = boardProjects.filter((project) => project.id !== deletedId);
    selectedProject = null;
  }

  function handleDragStart(event, project) {
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

    const { data, error } = await supabase
      .from("board_projects")
      .update({ status })
      .eq("id", project.id)
      .select(projectColumns)
      .single();

    if (error) {
      errorMessage = error.message;
      handleProjectUpdated({ ...project, status: previousStatus });
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

  function getStatusBadgeClass(status) {
    if (status === "Blocked") return "bg-red-50 text-red-700 border-red-200";
    if (status === "In Progress") return "bg-blue-50 text-blue-700 border-blue-200";
    if (status === "Done") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  function getOwnerLabel(project) {
    const owner = teamMembers.find((member) => member.id === project.owner_id);
    return owner?.full_name || owner?.email || "Unowned";
  }
</script>

<section class="space-y-4" aria-labelledby="board-projects-title">
  <h3 id="board-projects-title" class="sr-only">Board Projects</h3>

  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <SummaryCard label="Planning" value={projectsByStatus["Planning"]?.length || 0} icon={ClipboardList} tone="gold" />
    <SummaryCard label="In Progress" value={projectsByStatus["In Progress"]?.length || 0} icon={Hourglass} tone="teal" />
    <SummaryCard label="Blocked" value={projectsByStatus["Blocked"]?.length || 0} icon={OctagonAlert} tone="rose" />
    <SummaryCard label="Done" value={projectsByStatus["Done"]?.length || 0} icon={Trophy} tone="teal" />
  </div>

  {#if errorMessage}
    <div class="flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{errorMessage}</span>
    </div>
  {/if}

  <Panel title="Board Projects" id="board-projects-panel-title" loading={isLoading}>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="inline-flex rounded-md border border-black/10 bg-gray-50 p-1" role="group" aria-label="View mode">
        <button
          type="button"
          class="inline-flex min-h-9 items-center gap-1.5 rounded px-3 text-sm font-bold transition {viewMode === 'list' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}"
          aria-pressed={viewMode === "list"}
          onclick={() => (viewMode = "list")}
        >
          <LayoutList class="h-4 w-4" aria-hidden="true" />
          List
        </button>
        <button
          type="button"
          class="inline-flex min-h-9 items-center gap-1.5 rounded px-3 text-sm font-bold transition {viewMode === 'kanban' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}"
          aria-pressed={viewMode === "kanban"}
          onclick={() => (viewMode = "kanban")}
        >
          <SquareKanban class="h-4 w-4" aria-hidden="true" />
          Kanban
        </button>
      </div>

      <button
        type="button"
        class="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833]"
        onclick={() => (showCreateForm = !showCreateForm)}
      >
        <Plus class="h-4 w-4" aria-hidden="true" />
        New project
      </button>
    </div>

    {#if showCreateForm}
      <form class="mb-4 rounded-md border border-black/10 bg-gray-50 p-4" onsubmit={createProject}>
        <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            type="text"
            class="min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            placeholder="Project title"
            bind:value={newTitle}
            disabled={isCreating}
          />
          <input
            type="date"
            class="min-h-10 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            aria-label="Due date"
            bind:value={newDueDate}
            disabled={isCreating}
          />
          <button
            type="submit"
            class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#1E1E1E] px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!newTitle.trim() || isCreating}
          >
            {#if isCreating}
              <span class="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true"></span>
              Creating
            {:else}
              Create
            {/if}
          </button>
        </div>
        {#if createError}
          <div class="mt-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{createError}</span>
          </div>
        {/if}
      </form>
    {/if}

    {#if isLoading}
      <div class="flex min-h-48 items-center justify-center">
        <div class="flex items-center gap-3 text-sm text-gray-600">
          <span class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin" aria-hidden="true"></span>
          Loading board projects
        </div>
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
            class="flex w-full flex-wrap items-center gap-3 rounded-md border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#0f766e]/40 hover:shadow-sm"
            onclick={() => (selectedProject = project)}
          >
            <span class="min-w-0 flex-1">
              <span class="block font-bold leading-snug {project.status === 'Done' ? 'text-gray-400 line-through' : ''}">
                {project.title}
              </span>
              <span class="mt-1 block text-sm text-gray-600">
                {getOwnerLabel(project)}
              </span>
            </span>
            <span class="rounded-full border px-2.5 py-1 text-xs font-bold {getStatusBadgeClass(project.status)}">
              {project.status}
            </span>
            <span class="text-xs font-bold {isOverdue(project) ? 'text-red-600' : 'text-gray-500'}">
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
              class="snap-start flex min-h-[24rem] flex-col rounded-md border border-black/10 bg-gray-50 p-3 transition {dragOverStatus === status ? 'border-[#0f766e] bg-teal-50 ring-2 ring-[#0f766e]/20' : ''}"
              role="region"
              aria-label={`${status} projects`}
              ondragover={(event) => handleColumnDragOver(event, status)}
              ondrop={(event) => handleColumnDrop(event, status)}
            >
              <div class="mb-3 flex items-center justify-between gap-2">
                <h4 class="text-sm font-bold">{status}</h4>
                <span class="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-gray-600">
                  {projectsByStatus[status]?.length || 0}
                </span>
              </div>
              <div class="flex-1 space-y-2">
                {#each projectsByStatus[status] || [] as project (project.id)}
                  <div
                    class="rounded-md border border-black/10 bg-white shadow-sm transition {movingProjectId === project.id ? 'opacity-60' : ''}"
                    draggable="true"
                    role="button"
                    tabindex="0"
                    ondragstart={(event) => handleDragStart(event, project)}
                    ondragend={handleDragEnd}
                    onclick={() => (selectedProject = project)}
                    onkeydown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectedProject = project;
                      }
                    }}
                  >
                    <div class="px-3 py-2.5">
                      <p class="text-sm font-bold leading-snug">{project.title}</p>
                      <div class="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-500">
                        <span>{getOwnerLabel(project)}</span>
                        {#if project.due_date}
                          <span class={isOverdue(project) ? "font-bold text-red-600" : ""}>
                            {formatDate(project.due_date)}
                          </span>
                        {/if}
                      </div>
                    </div>
                  </div>
                {:else}
                  <p class="rounded-md border border-dashed border-gray-300 bg-white px-3 py-4 text-center text-xs text-gray-500">
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
</section>

<BoardProjectDrawer
  {supabase}
  project={selectedProject}
  {teamMembers}
  currentUserRole={profile?.role || "member"}
  onClose={() => (selectedProject = null)}
  onProjectUpdated={handleProjectUpdated}
  onProjectDeleted={handleProjectDeleted}
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
