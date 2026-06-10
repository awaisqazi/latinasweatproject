<script>
  import {
    CalendarClock,
    CheckCircle2,
    CircleAlert,
    Trash2,
  } from "@lucide/svelte";
  import { isOperationalAdmin } from "../../../lib/dashboard/roles";
  import BoardTaskList from "./BoardTaskList.svelte";
  import ProjectTimeline from "../marketing/ProjectTimeline.svelte";
  import SlideOver from "../marketing/SlideOver.svelte";

  export let supabase;
  export let project = null;
  export let teamMembers = [];
  export let currentUserRole = "member";
  export let onClose = () => {};
  export let onProjectUpdated = () => {};
  export let onProjectDeleted = () => {};

  const BOARD_STATUSES = ["Planning", "In Progress", "Blocked", "Done"];
  const projectColumns =
    "id, title, description, status, owner_id, due_date, created_by, created_at, updated_at";

  let displayedProject = null;
  let drawerOpen = false;
  let isSaving = false;
  let isDeleting = false;
  let errorMessage = "";
  let successMessage = "";
  let descriptionDraft = "";
  let timelineRefreshKey = 0;

  $: isAdmin = isOperationalAdmin(currentUserRole);
  $: if (project?.id && project.id !== displayedProject?.id) {
    openDrawer(project);
  }

  function openDrawer(nextProject) {
    displayedProject = nextProject;
    descriptionDraft = nextProject.description || "";
    errorMessage = "";
    successMessage = "";
    drawerOpen = true;
  }

  function requestClose() {
    if (isSaving || isDeleting) return;
    drawerOpen = false;
  }

  function handleClose() {
    displayedProject = null;
    onClose();
  }

  async function saveUpdates(updates, successText) {
    if (!displayedProject?.id || isSaving) return;

    isSaving = true;
    errorMessage = "";
    successMessage = "";

    const { data, error } = await supabase
      .from("board_projects")
      .update(updates)
      .eq("id", displayedProject.id)
      .select(projectColumns)
      .single();

    if (error) {
      errorMessage = error.message;
    } else {
      displayedProject = data;
      onProjectUpdated(data);
      successMessage = successText;
    }

    isSaving = false;
  }

  function saveDescription() {
    const nextDescription = descriptionDraft.trim() || null;

    if ((displayedProject?.description || null) === nextDescription) return;

    saveUpdates({ description: nextDescription }, "Description saved.");
  }

  async function deleteProject() {
    if (!displayedProject?.id || isDeleting) return;

    const shouldDelete = window.confirm(
      `Delete "${displayedProject.title}" and all of its tasks and comments? This cannot be undone.`,
    );
    if (!shouldDelete) return;

    isDeleting = true;
    errorMessage = "";

    const { error } = await supabase
      .from("board_projects")
      .delete()
      .eq("id", displayedProject.id);

    if (error) {
      errorMessage = error.message;
      isDeleting = false;
      return;
    }

    const deletedId = displayedProject.id;
    isDeleting = false;
    onProjectDeleted(deletedId);
    requestClose();
  }

  function formatDate(value) {
    if (!value) return "No due date";

    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function getStatusClass(status) {
    if (status === "Blocked") return "bg-red-50 text-red-700 border-red-200";
    if (status === "In Progress") return "bg-blue-50 text-blue-700 border-blue-200";
    if (status === "Done") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  function getOwnerLabel(item) {
    const owner = teamMembers.find((member) => member.id === item?.owner_id);
    return owner?.full_name || owner?.email || "Unowned";
  }
</script>

<SlideOver
  open={drawerOpen}
  title={displayedProject?.title || ""}
  eyebrow="Board project"
  closeLabel="Close board project details"
  closeDisabled={isSaving || isDeleting}
  onClose={requestClose}
  onClosed={handleClose}
>
  {#if displayedProject}
    <div class="px-5 py-5">
        <div class="flex flex-wrap gap-2">
          <span class="rounded-full border px-2.5 py-1 text-xs font-bold {getStatusClass(displayedProject.status)}">
            {displayedProject.status}
          </span>
          <span class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700">
            <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
            {formatDate(displayedProject.due_date)}
          </span>
          <span class="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700">
            Owner: {getOwnerLabel(displayedProject)}
          </span>
        </div>

        {#if errorMessage}
          <div class="mt-4 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        {/if}

        {#if successMessage}
          <div class="mt-4 flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
        {/if}

        <section class="mt-5 rounded-md border border-black/10 bg-white p-4" aria-labelledby="board-drawer-settings-title">
          <div class="flex items-start justify-between gap-3">
            <h4 id="board-drawer-settings-title" class="font-bold">Project settings</h4>
            {#if isSaving}
              <span class="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
                Saving
              </span>
            {/if}
          </div>

          <label class="mt-4 block text-sm font-bold" for={`board-status-${displayedProject.id}`}>
            Status
            <select
              id={`board-status-${displayedProject.id}`}
              class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              value={displayedProject.status}
              disabled={isSaving}
              onchange={(event) =>
                saveUpdates({ status: event.currentTarget.value }, `Moved to ${event.currentTarget.value}.`)}
            >
              {#each BOARD_STATUSES as status}
                <option value={status}>{status}</option>
              {/each}
            </select>
          </label>

          <label class="mt-4 block text-sm font-bold" for={`board-owner-${displayedProject.id}`}>
            Owner
            <select
              id={`board-owner-${displayedProject.id}`}
              class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              value={displayedProject.owner_id || ""}
              disabled={isSaving}
              onchange={(event) =>
                saveUpdates({ owner_id: event.currentTarget.value || null }, "Owner updated.")}
            >
              <option value="">Unowned</option>
              {#each teamMembers as member}
                <option value={member.id}>{member.full_name || member.email}</option>
              {/each}
            </select>
          </label>

          <label class="mt-4 block text-sm font-bold" for={`board-due-${displayedProject.id}`}>
            Due date
            <input
              id={`board-due-${displayedProject.id}`}
              type="date"
              class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              value={displayedProject.due_date || ""}
              disabled={isSaving}
              onchange={(event) =>
                saveUpdates({ due_date: event.currentTarget.value || null }, "Due date updated.")}
            />
          </label>

          <label class="mt-4 block text-sm font-bold" for={`board-description-${displayedProject.id}`}>
            Description
            <textarea
              id={`board-description-${displayedProject.id}`}
              class="mt-2 min-h-24 w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={descriptionDraft}
              placeholder="What is this project about? What does done look like?"
              disabled={isSaving}
              onblur={saveDescription}
            ></textarea>
          </label>
        </section>

        <section class="mt-5 rounded-md border border-black/10 bg-white p-4">
          <BoardTaskList
            {supabase}
            projectId={displayedProject.id}
            {teamMembers}
          />
        </section>

        <div class="mt-5">
          <ProjectTimeline
            {supabase}
            project={displayedProject}
            refreshKey={timelineRefreshKey}
            table="board_project_comments"
          />
        </div>

        {#if isAdmin}
          <section class="mt-5 rounded-md border border-red-200 bg-red-50/50 p-4">
            <h4 class="font-bold text-red-800">Danger zone</h4>
            <button
              type="button"
              class="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-red-300 bg-white px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              onclick={deleteProject}
              disabled={isDeleting}
            >
              {#if isDeleting}
                <span class="h-4 w-4 rounded-full border-2 border-red-700 border-t-transparent animate-spin" aria-hidden="true"></span>
                Deleting
              {:else}
                <Trash2 class="h-4 w-4" aria-hidden="true" />
                Delete project
              {/if}
            </button>
          </section>
        {/if}
      <div class="border-t border-black/10 p-4">
        <button
          type="button"
          class="flex min-h-11 w-full items-center justify-center rounded-md bg-[#ffbd59] px-4 py-2.5 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
          onclick={requestClose}
        >
          Close
        </button>
      </div>
    </div>
  {/if}
</SlideOver>
