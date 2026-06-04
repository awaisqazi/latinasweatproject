<script>
  import { onMount, tick } from "svelte";
  import {
    CalendarClock,
    CheckCircle2,
    CircleAlert,
    ExternalLink,
    Eye,
    ListCheck,
    RefreshCw,
    X,
  } from "@lucide/svelte";
  import EmptyState from "./EmptyState.svelte";
  import ProjectTimeline from "./ProjectTimeline.svelte";

  export let supabase;
  export let email;
  export let refreshKey = 0;
  export let onProjectUpdated = () => {};

  let projects = [];
  let selectedProject = null;
  let detailsDialog;
  let isLoading = true;
  let completingProjectId = "";
  let errorMessage = "";
  let lastRefreshKey = refreshKey;

  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  $: urgentProjects = projects.filter(isUrgentProject);
  $: pipelineProjects = projects.filter((project) => !isUrgentProject(project));
  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadWorkspaceProjects();
  }

  onMount(() => {
    loadWorkspaceProjects();
  });

  async function loadWorkspaceProjects() {
    if (!supabase || !email) {
      isLoading = false;
      errorMessage = "Your profile email is missing, so assigned projects cannot load.";
      return;
    }

    isLoading = true;
    errorMessage = "";

    try {
      const { data, error } = await withTimeout(
        supabase
          .from("projects")
          .select(
            "id,title,status,priority,deadline,publish_date,edit_notes,details_url,files_url,deliverables_url,assigned_to,channel_tags,copy_approved,source,intake_reviewed,intake_submitted_at",
          )
          .contains("assigned_to", [email])
          .neq("status", "Published")
          .neq("status", "Archived")
          .eq("intake_reviewed", true)
          .order("deadline", { ascending: true, nullsFirst: false }),
      );

      if (error) {
        projects = [];
        errorMessage = error.message;
      } else {
        projects = data || [];
      }
    } catch (error) {
      projects = [];
      errorMessage =
        error?.message ||
        "Assigned projects took too long to load. Please refresh and try again.";
    } finally {
      isLoading = false;
    }
  }

  function withTimeout(request, timeoutMs = 15000) {
    return Promise.race([
      request,
      new Promise((_, reject) => {
        window.setTimeout(
          () => reject(new Error("Assigned projects took too long to load.")),
          timeoutMs,
        );
      }),
    ]);
  }

  async function openProjectDialog(project) {
    selectedProject = project;
    await tick();
    detailsDialog?.showModal();
  }

  function closeProjectDialog() {
    detailsDialog?.close();
    selectedProject = null;
  }

  function handleDialogClick(event) {
    if (event.target === detailsDialog) {
      closeProjectDialog();
    }
  }

  async function completeMyAssignment(project) {
    if (!project?.id || !isAssignedToCurrentUser(project) || completingProjectId) {
      return;
    }

    completingProjectId = project.id;
    errorMessage = "";

    const nextAssignedTo = getAssignedEmails(project).filter(
      (assigneeEmail) => normalizeEmail(assigneeEmail) !== normalizeEmail(email),
    );

    const { data, error } = await supabase
      .from("projects")
      .update({ assigned_to: nextAssignedTo })
      .eq("id", project.id)
      .select(
        "id,title,priority,status,deadline,publish_date,details_url,copy_approved,files_url,deliverables_url,assigned_to,edit_notes,channel_tags,source,intake_reviewed,intake_submitted_at",
      )
      .single();

    if (error) {
      errorMessage = error.message;
      completingProjectId = "";
      return;
    }

    await addTimelineLog(project.id, "Completed their assignment.");

    projects = projects.filter((item) => item.id !== project.id);
    onProjectUpdated(data);

    if (selectedProject?.id === project.id) {
      closeProjectDialog();
    }

    completingProjectId = "";
  }

  async function addTimelineLog(projectId, body) {
    const { error } = await supabase
      .from("project_comments")
      .insert({
        project_id: projectId,
        body,
      });

    if (error) {
      errorMessage = `Assignment completed, but the timeline could not be updated: ${error.message}`;
    }
  }

  function getAssignedEmails(project) {
    if (!Array.isArray(project?.assigned_to)) return [];

    return project.assigned_to
      .map((assignedEmail) => String(assignedEmail || "").trim())
      .filter(Boolean);
  }

  function isAssignedToCurrentUser(project) {
    const currentEmail = normalizeEmail(email);

    return getAssignedEmails(project).some(
      (assignedEmail) => normalizeEmail(assignedEmail) === currentEmail,
    );
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isUrgentProject(project) {
    return project.priority === "P0" || isDeadlineWithinSevenDays(project.deadline);
  }

  function isDeadlineWithinSevenDays(deadline) {
    if (!deadline) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDate = new Date(`${deadline}T00:00:00`);
    const dayDelta = Math.ceil((dueDate.getTime() - today.getTime()) / MS_PER_DAY);

    return dayDelta < 7;
  }

  function formatDate(value) {
    if (!value) return "No deadline";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function getPriorityClass(priority) {
    if (priority === "P0") return "bg-red-100 text-red-800 border-red-300";
    if (priority === "P1") return "bg-amber-100 text-amber-800 border-amber-300";
    if (priority === "P2") return "bg-teal-100 text-teal-800 border-teal-300";
    return "bg-gray-50 text-gray-600 border-gray-200";
  }

  function getProjectCardClass(priority) {
    if (priority === "P0") return "border-red-300 bg-red-50 shadow-red-100/70";
    if (priority === "P1") return "border-amber-300 bg-amber-50 shadow-amber-100/70";
    if (priority === "P2") return "border-teal-200 bg-teal-50 shadow-teal-100/70";
    return "border-black/10 bg-white";
  }

  function getStatusClass(status) {
    if (status === "Stuck") return "bg-red-50 text-red-700 border-red-200";
    if (status === "In Production") return "bg-blue-50 text-blue-700 border-blue-200";
    if (status?.startsWith("Ready")) return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-gray-50 text-gray-700 border-gray-200";
  }

  function getProjectLinks(project) {
    if (!project) return [];

    return [
      { label: "Details", url: project.details_url },
      { label: "Files", url: project.files_url },
      { label: "Deliverables", url: project.deliverables_url },
    ].filter((link) => Boolean(link.url));
  }
</script>

<section class="space-y-5" aria-labelledby="workspace-title">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#0f766e]">
        Assigned to {email}
      </p>
      <h3 id="workspace-title" class="mt-1 text-2xl font-bold">Workspace</h3>
    </div>

    <button
      type="button"
      class="flex min-h-10 w-fit items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold shadow-sm transition hover:border-[#0f766e]/30 hover:text-[#0f766e] disabled:cursor-not-allowed disabled:opacity-60"
      onclick={loadWorkspaceProjects}
      disabled={isLoading}
    >
      <RefreshCw class="h-4 w-4 {isLoading ? 'animate-spin' : ''}" aria-hidden="true" />
      Refresh
    </button>
  </div>

  {#if errorMessage}
    <div
      class="flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      role="alert"
    >
      <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{errorMessage}</span>
    </div>
  {/if}

  {#if isLoading}
    <div class="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
      <div class="flex items-center gap-3 text-sm text-gray-600">
        <span
          class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin"
          aria-hidden="true"
        ></span>
        Loading assigned projects
      </div>
    </div>
  {:else}
    {@render WorkspaceSection(
      "Urgent Tasks",
      "P0 projects and anything due in the next 7 days.",
      CircleAlert,
      urgentProjects,
      "No urgent tasks",
      "Assigned P0 projects and near-deadline work will collect here.",
      openProjectDialog,
      completeMyAssignment,
    )}

    {@render WorkspaceSection(
      "My Pipeline",
      "Reviewed active projects assigned to you.",
      ListCheck,
      pipelineProjects,
      "Pipeline is clear",
      "Assigned reviewed projects that are not urgent will appear here.",
      openProjectDialog,
      completeMyAssignment,
    )}
  {/if}
</section>

<dialog
  bind:this={detailsDialog}
  class="w-[min(92vw,42rem)] rounded-lg border border-black/10 bg-white p-0 text-[#1E1E1E] shadow-2xl backdrop:bg-black/45"
  onclick={handleDialogClick}
  onclose={() => (selectedProject = null)}
>
  {#if selectedProject}
    <div class="border-b border-black/10 bg-[#1E1E1E] px-5 py-5 text-white">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#ffbd59]">
            Project details
          </p>
          <h3 class="mt-2 text-xl font-bold leading-tight">{selectedProject.title}</h3>
        </div>
        <button
          type="button"
          class="rounded-md p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Close project details"
          onclick={closeProjectDialog}
        >
          <X class="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="space-y-5 px-5 py-5">
      <div class="flex flex-wrap gap-2">
        <span class="rounded-full border px-2.5 py-1 text-xs font-bold {getStatusClass(selectedProject.status)}">
          {selectedProject.status}
        </span>
        <span class="rounded-full border px-2.5 py-1 text-xs font-bold {getPriorityClass(selectedProject.priority)}">
          {selectedProject.priority || "Priority unset"}
        </span>
        <span class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700">
          <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
          {formatDate(selectedProject.deadline)}
        </span>
      </div>

      {#if isAssignedToCurrentUser(selectedProject)}
        <button
          type="button"
          class="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#0f766e] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#115e59] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          onclick={() => completeMyAssignment(selectedProject)}
          disabled={completingProjectId === selectedProject.id}
        >
          {#if completingProjectId === selectedProject.id}
            <span class="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true"></span>
            Confirming
          {:else}
            <CheckCircle2 class="h-4 w-4" aria-hidden="true" />
            Confirm Complete
          {/if}
        </button>
      {/if}

      <ProjectTimeline {supabase} project={selectedProject} />

      {#if getProjectLinks(selectedProject).length}
        <section aria-labelledby="external-links-title">
          <h4 id="external-links-title" class="font-bold">External links</h4>
          <div class="mt-3 grid gap-2 sm:grid-cols-3">
            {#each getProjectLinks(selectedProject) as link}
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 px-3 text-sm font-bold transition hover:border-[#0f766e]/40 hover:text-[#0f766e]"
              >
                <ExternalLink class="h-4 w-4" aria-hidden="true" />
                {link.label}
              </a>
            {/each}
          </div>
        </section>
      {/if}

      <button
        type="button"
        class="flex min-h-11 w-full items-center justify-center rounded-md bg-[#ffbd59] px-4 py-2.5 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
        onclick={closeProjectDialog}
      >
        Close
      </button>
    </div>
  {/if}
</dialog>

{#snippet WorkspaceSection(
  title,
  description,
  icon,
  projects,
  emptyTitle,
  emptyMessage,
  onView,
  onComplete,
)}
  {@const Icon = icon}
  <section
    class="rounded-lg border border-black/10 bg-white p-4 shadow-sm md:p-5"
    aria-labelledby={title.toLowerCase().replaceAll(" ", "-")}
  >
    <div class="mb-4 flex items-start gap-3">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#fff3d8] text-[#8a5700]">
        <Icon class="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <h4 id={title.toLowerCase().replaceAll(" ", "-")} class="text-lg font-bold">
          {title}
        </h4>
        <p class="mt-1 text-sm leading-6 text-gray-600">{description}</p>
      </div>
    </div>

    {#if projects.length}
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {#each projects as project}
          <article class="flex min-h-44 flex-col justify-between rounded-md border p-4 shadow-sm {getProjectCardClass(project.priority)}">
            <div>
              <div class="flex items-start justify-between gap-3">
                <h5 class="line-clamp-2 font-bold leading-snug">{project.title}</h5>
                <span class="shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold {getPriorityClass(project.priority)}">
                  {project.priority || "Unset"}
                </span>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <span class="rounded-full border px-2.5 py-1 text-xs font-bold {getStatusClass(project.status)}">
                  {project.status}
                </span>
                <span class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700">
                  <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
                  {formatDate(project.deadline)}
                </span>
              </div>
            </div>

            <div class="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-black/10 px-3 text-sm font-bold transition hover:border-[#0f766e]/40 hover:text-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
                onclick={() => onView(project)}
              >
                <Eye class="h-4 w-4" aria-hidden="true" />
                View Details
              </button>
              <button
                type="button"
                class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#0f766e] px-3 text-sm font-bold text-white transition hover:bg-[#115e59] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                onclick={() => onComplete(project)}
                disabled={completingProjectId === project.id}
              >
                {#if completingProjectId === project.id}
                  <span class="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true"></span>
                  Saving
                {:else}
                  <CheckCircle2 class="h-4 w-4" aria-hidden="true" />
                  Complete
                {/if}
              </button>
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <EmptyState title={emptyTitle} message={emptyMessage} />
    {/if}
  </section>
{/snippet}
