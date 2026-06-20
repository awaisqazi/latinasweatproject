<script>
  import { CalendarClock, Trash2, UserPlus } from "@lucide/svelte";
  import { isOperationalAdmin } from "../../../lib/dashboard/roles";
  import BoardTaskList from "./BoardTaskList.svelte";
  import ProjectTimeline from "../marketing/ProjectTimeline.svelte";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Field from "../ui/Field.svelte";

  export let supabase;
  export let project = null;
  export let teamMembers = [];
  export let currentUserRole = "member";
  export let onClose = () => {};
  export let onProjectUpdated = () => {};
  export let onProjectDeleted = () => {};
  export let onAssignTask = () => {};

  const BOARD_STATUSES = ["Planning", "In Progress", "Blocked", "Done"];
  const STATUS_TONES = {
    Planning: "neutral",
    "In Progress": "blue",
    Blocked: "red",
    Done: "green",
  };
  const projectColumns =
    "id, title, description, status, owner_id, due_date, created_by, created_at, updated_at";

  let displayedProject = null;
  let drawerOpen = false;
  let isSaving = false;
  let saveChain = Promise.resolve();
  let isDeleting = false;
  let confirmingDelete = false;
  let errorMessage = "";
  let successMessage = "";
  let descriptionDraft = "";
  let timelineRefreshKey = 0;

  $: isAdmin = isOperationalAdmin(currentUserRole);
  $: if (project?.id && project.id !== displayedProject?.id) {
    openDrawer(project);
  } else if (!project && drawerOpen) {
    drawerOpen = false;
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
    drawerOpen = false;
    displayedProject = null;
    onClose();
  }

  // Serialize saves so a second change (e.g. description-on-blur fired during a
  // status save) is queued and applied, never silently dropped.
  function saveUpdates(updates, successText) {
    if (!displayedProject?.id) return saveChain;
    saveChain = saveChain.then(() => runSave(updates, successText));
    return saveChain;
  }

  async function runSave(updates, successText) {
    if (!displayedProject?.id) return;

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

  function requestDeleteProject() {
    if (!displayedProject?.id || isDeleting) return;
    confirmingDelete = true;
  }

  async function deleteProject() {
    if (!displayedProject?.id || isDeleting) return;

    isDeleting = true;
    errorMessage = "";

    const { error } = await supabase
      .from("board_projects")
      .delete()
      .eq("id", displayedProject.id);

    if (error) {
      errorMessage = error.message;
      isDeleting = false;
      confirmingDelete = false;
      return;
    }

    const deletedId = displayedProject.id;
    isDeleting = false;
    confirmingDelete = false;
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
          <Badge tone={STATUS_TONES[displayedProject.status] || "neutral"}>
            {displayedProject.status}
          </Badge>
          <Badge tone="neutral">
            <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
            {formatDate(displayedProject.due_date)}
          </Badge>
          <Badge tone="neutral">Owner: {getOwnerLabel(displayedProject)}</Badge>
        </div>

        <div class="mt-4">
          <Button
            size="sm"
            icon={UserPlus}
            onclick={() =>
              onAssignTask({
                sourceModule: "board_projects",
                sourceLabel: `Board: ${displayedProject.title}`,
                sourceLink: "#board",
                title: `Follow up: ${displayedProject.title}`,
              })}
          >
            Assign a task about this
          </Button>
        </div>

        {#if errorMessage}
          <Banner tone="error" message={errorMessage} class="mt-4" />
        {/if}

        {#if successMessage}
          <Banner tone="success" message={successMessage} class="mt-4" />
        {/if}

        <section class="mt-5 rounded-control border border-ink/8 bg-white p-4" aria-labelledby="board-drawer-settings-title">
          <div class="flex items-start justify-between gap-3">
            <h4 id="board-drawer-settings-title" class="font-bold text-ink">Project settings</h4>
            {#if isSaving}
              <Badge tone="neutral" size="xs" class="shrink-0">Saving</Badge>
            {/if}
          </div>

          <Field label="Status" id={`board-status-${displayedProject.id}`} class="mt-4">
            <select
              id={`board-status-${displayedProject.id}`}
              class="select"
              value={displayedProject.status}
              disabled={isSaving}
              onchange={(event) =>
                saveUpdates({ status: event.currentTarget.value }, `Moved to ${event.currentTarget.value}.`)}
            >
              {#each BOARD_STATUSES as status}
                <option value={status}>{status}</option>
              {/each}
            </select>
          </Field>

          <Field label="Owner" id={`board-owner-${displayedProject.id}`} class="mt-4">
            <select
              id={`board-owner-${displayedProject.id}`}
              class="select"
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
          </Field>

          <Field label="Due date" id={`board-due-${displayedProject.id}`} class="mt-4">
            <input
              id={`board-due-${displayedProject.id}`}
              type="date"
              class="input"
              value={displayedProject.due_date || ""}
              disabled={isSaving}
              onchange={(event) =>
                saveUpdates({ due_date: event.currentTarget.value || null }, "Due date updated.")}
            />
          </Field>

          <Field label="Description" id={`board-description-${displayedProject.id}`} class="mt-4">
            <textarea
              id={`board-description-${displayedProject.id}`}
              class="textarea"
              bind:value={descriptionDraft}
              placeholder="What is this project about? What does done look like?"
              disabled={isSaving}
              onblur={saveDescription}
            ></textarea>
          </Field>
        </section>

        <section class="mt-5 rounded-control border border-ink/8 bg-white p-4">
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
          <section class="mt-5 rounded-control border border-red-200 bg-red-50/50 p-4">
            <h4 class="font-bold text-red-800">Danger zone</h4>
            <Button
              variant="danger"
              icon={Trash2}
              class="mt-3"
              loading={isDeleting}
              onclick={requestDeleteProject}
            >
              Delete project
            </Button>
          </section>
        {/if}
      <div class="border-t border-ink/8 p-4">
        <Button variant="secondary" class="w-full" onclick={requestClose}>
          Close
        </Button>
      </div>
    </div>
  {/if}
</SlideOver>

<ConfirmDialog
  open={confirmingDelete}
  title="Delete this project?"
  message={`Delete "${displayedProject?.title}" and all of its tasks and comments? This cannot be undone.`}
  confirmLabel="Delete project"
  tone="danger"
  busy={isDeleting}
  onConfirm={deleteProject}
  onCancel={() => (confirmingDelete = false)}
/>
