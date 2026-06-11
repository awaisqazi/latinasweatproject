<script>
  import { onMount } from "svelte";
  import {
    CalendarClock,
    CheckCircle2,
    CircleAlert,
    ExternalLink,
    Eye,
    ListCheck,
    RefreshCw,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import ProjectTimeline from "./ProjectTimeline.svelte";
  import SlideOver from "./SlideOver.svelte";

  export let supabase;
  export let email;
  export let refreshKey = 0;
  export let onProjectUpdated = () => {};

  let projects = [];
  let selectedProject = null;
  let detailsOpen = false;
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
        errorMessage = error.message;
      } else {
        projects = data || [];
      }
    } catch (error) {
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

  function openProjectDialog(project) {
    selectedProject = project;
    detailsOpen = true;
  }

  function closeProjectDialog() {
    detailsOpen = false;
  }

  function handleDrawerClosed() {
    selectedProject = null;
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

  function getPriorityTone(priority) {
    if (priority === "P0") return "red";
    if (priority === "P1") return "amber";
    return "neutral";
  }

  function getProjectCardClass(priority) {
    if (priority === "P0") return "border-red-300 bg-red-50/70";
    if (priority === "P1") return "border-amber-300 bg-amber-50/70";
    return "border-ink/8 bg-white";
  }

  function getStatusTone(status) {
    if (status === "Stuck") return "red";
    if (status === "In Production") return "blue";
    if (status?.startsWith("Ready")) return "amber";
    return "neutral";
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
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">
        Assigned to {email}
      </p>
      <h3 id="workspace-title" class="mt-1 text-2xl font-bold text-ink">Workspace</h3>
    </div>

    <Button
      icon={RefreshCw}
      class="w-fit"
      onclick={loadWorkspaceProjects}
      loading={isLoading}
    >
      Refresh
    </Button>
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} />
  {/if}

  {#if isLoading}
    <SkeletonCard lines={3} />
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

<SlideOver
  open={detailsOpen}
  title={selectedProject?.title || ""}
  eyebrow="Project details"
  closeLabel="Close project details"
  onClose={closeProjectDialog}
  onClosed={handleDrawerClosed}
>
  {#if selectedProject}
    <div class="space-y-5 px-5 py-5">
      <div class="flex flex-wrap gap-2">
        <Badge tone={getStatusTone(selectedProject.status)}>
          {selectedProject.status}
        </Badge>
        <Badge tone={getPriorityTone(selectedProject.priority)}>
          {selectedProject.priority || "Priority unset"}
        </Badge>
        <Badge tone="neutral">
          <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
          {formatDate(selectedProject.deadline)}
        </Badge>
      </div>

      {#if isAssignedToCurrentUser(selectedProject)}
        <Button
          variant="primary"
          icon={CheckCircle2}
          class="w-full"
          onclick={() => completeMyAssignment(selectedProject)}
          loading={completingProjectId === selectedProject.id}
        >
          {completingProjectId === selectedProject.id ? "Confirming" : "Confirm Complete"}
        </Button>
      {/if}

      <ProjectTimeline {supabase} project={selectedProject} />

      {#if getProjectLinks(selectedProject).length}
        <section aria-labelledby="external-links-title">
          <h4 id="external-links-title" class="font-bold text-ink">External links</h4>
          <div class="mt-3 grid gap-2 sm:grid-cols-3">
            {#each getProjectLinks(selectedProject) as link}
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                class="inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-ink/14 px-3 text-sm font-bold text-ink transition hover:border-accent/40 hover:text-accent-strong"
              >
                <ExternalLink class="h-4 w-4" aria-hidden="true" />
                {link.label}
              </a>
            {/each}
          </div>
        </section>
      {/if}

      <Button variant="primary" class="w-full" onclick={closeProjectDialog}>
        Close
      </Button>
    </div>
  {/if}
</SlideOver>

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
    class="rounded-card border border-ink/8 bg-white p-4 shadow-card md:p-5"
    aria-labelledby={title.toLowerCase().replaceAll(" ", "-")}
  >
    <div class="mb-4 flex items-start gap-3">
      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-ink">
        <Icon class="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <h4 id={title.toLowerCase().replaceAll(" ", "-")} class="text-lg font-bold text-ink">
          {title}
        </h4>
        <p class="mt-1 text-sm leading-6 text-ink/60">{description}</p>
      </div>
    </div>

    {#if projects.length}
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {#each projects as project}
          <article class="flex min-h-44 flex-col justify-between rounded-card border p-4 shadow-card {getProjectCardClass(project.priority)}">
            <div>
              <div class="flex items-start justify-between gap-3">
                <h5 class="line-clamp-2 font-bold leading-snug text-ink">{project.title}</h5>
                <Badge tone={getPriorityTone(project.priority)} size="xs" class="shrink-0">
                  {project.priority || "Unset"}
                </Badge>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <Badge tone={getStatusTone(project.status)}>
                  {project.status}
                </Badge>
                <Badge tone="neutral">
                  <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
                  {formatDate(project.deadline)}
                </Badge>
              </div>
            </div>

            <div class="mt-4 grid gap-2 sm:grid-cols-2">
              <Button icon={Eye} class="w-full" onclick={() => onView(project)}>
                View Details
              </Button>
              <Button
                variant="primary"
                icon={CheckCircle2}
                class="w-full"
                onclick={() => onComplete(project)}
                loading={completingProjectId === project.id}
              >
                {completingProjectId === project.id ? "Saving" : "Complete"}
              </Button>
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <EmptyState title={emptyTitle} message={emptyMessage} />
    {/if}
  </section>
{/snippet}
