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
    UserRound,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import ProjectTimeline from "./ProjectTimeline.svelte";
  import SlideOver from "./SlideOver.svelte";
  import { loadMyOpenTasks, completeTask } from "../../../lib/dashboard/workspaceTasks";

  export let supabase;
  export let email;
  export let profileId = "";
  export let teamMembers = [];
  export let refreshKey = 0;
  export let onProjectUpdated = () => {};
  export let onTasksChanged = () => {};

  let projects = [];
  let tasks = [];
  let selectedProject = null;
  let detailsOpen = false;
  let isLoading = true;
  let completingId = "";
  let errorMessage = "";
  let lastRefreshKey = refreshKey;

  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // Merge marketing projects + assigned tasks into one feed, soonest first.
  $: items = [
    ...tasks.map(toTaskItem),
    ...projects.map(toProjectItem),
  ].sort(byDueThenPriority);
  $: urgentItems = items.filter(isUrgentItem);
  $: pipelineItems = items.filter((item) => !isUrgentItem(item));

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadWorkspace();
  }

  onMount(() => {
    loadWorkspace();
  });

  async function loadWorkspace() {
    isLoading = true;
    errorMessage = "";

    await Promise.all([loadWorkspaceProjects(), loadWorkspaceTasks()]);

    isLoading = false;
  }

  async function loadWorkspaceProjects() {
    if (!supabase || !email) {
      projects = [];
      return;
    }

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
    }
  }

  async function loadWorkspaceTasks() {
    if (!profileId) {
      tasks = [];
      return;
    }

    const { tasks: loaded, error } = await loadMyOpenTasks(supabase, profileId);

    if (error) {
      errorMessage = errorMessage || error.message;
      return;
    }

    tasks = loaded;
  }

  function withTimeout(request, timeoutMs = 15000) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(
        () => reject(new Error("Assigned projects took too long to load.")),
        timeoutMs,
      );
    });
    // clearTimeout so a resolved request doesn't leave the timer running.
    return Promise.race([request, timeout]).finally(() => window.clearTimeout(timer));
  }

  // ── Normalizers ───────────────────────────────────────────────
  function toProjectItem(project) {
    return {
      kind: "project",
      id: project.id,
      title: project.title,
      priority: project.priority,
      due: project.deadline,
      status: project.status,
      raw: project,
    };
  }

  function toTaskItem(task) {
    return {
      kind: "task",
      id: task.id,
      title: task.title,
      priority: task.priority,
      due: task.due_date,
      status: task.status,
      note: task.note,
      sourceLabel: task.source_label,
      sourceLink: task.source_link,
      assignerName: resolveAssigner(task.assigned_by),
      raw: task,
    };
  }

  function resolveAssigner(id) {
    if (!id) return "A teammate";
    const member = (teamMembers || []).find((person) => person.id === id);
    return member?.full_name || member?.email || "A teammate";
  }

  function byDueThenPriority(a, b) {
    if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  }

  function isUrgentItem(item) {
    return item.priority === "P0" || isDeadlineWithinSevenDays(item.due);
  }

  // ── Actions ───────────────────────────────────────────────────
  function openItem(item) {
    if (item.kind === "project") {
      selectedProject = item.raw;
      detailsOpen = true;
    }
  }

  async function completeItem(item) {
    if (item.kind === "task") {
      await completeTaskItem(item.raw);
    } else {
      await completeMyAssignment(item.raw);
    }
  }

  async function completeTaskItem(task) {
    if (!task?.id || completingId) return;

    completingId = task.id;
    errorMessage = "";

    const { error } = await completeTask(supabase, task.id);

    if (error) {
      errorMessage = error.message;
      completingId = "";
      return;
    }

    tasks = tasks.filter((item) => item.id !== task.id);
    onTasksChanged();
    completingId = "";
  }

  function closeProjectDialog() {
    detailsOpen = false;
  }

  function handleDrawerClosed() {
    selectedProject = null;
  }

  async function completeMyAssignment(project) {
    if (!project?.id || !isAssignedToCurrentUser(project) || completingId) {
      return;
    }

    completingId = project.id;
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
      completingId = "";
      return;
    }

    await addTimelineLog(project.id, "Completed their assignment.");

    projects = projects.filter((item) => item.id !== project.id);
    onProjectUpdated(data);

    if (selectedProject?.id === project.id) {
      closeProjectDialog();
    }

    completingId = "";
  }

  async function addTimelineLog(projectId, body) {
    const { error } = await supabase
      .from("project_comments")
      .insert({ project_id: projectId, body });

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

  function isDeadlineWithinSevenDays(deadline) {
    if (!deadline) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDate = new Date(`${deadline}T00:00:00`);
    const dayDelta = Math.ceil((dueDate.getTime() - today.getTime()) / MS_PER_DAY);

    return dayDelta < 7;
  }

  function formatDate(value) {
    if (!value) return "No due date";

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

  function getItemCardClass(priority) {
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

    <Button icon={RefreshCw} class="w-fit" onclick={loadWorkspace} loading={isLoading}>
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
      "P0 work and anything due in the next 7 days.",
      CircleAlert,
      urgentItems,
      "No urgent tasks",
      "Assigned P0 work and near-deadline items will collect here.",
    )}

    {@render WorkspaceSection(
      "My Priorities",
      "Everything assigned to you across the organization.",
      ListCheck,
      pipelineItems,
      "You're all caught up",
      "Tasks and projects assigned to you will appear here.",
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
          loading={completingId === selectedProject.id}
        >
          {completingId === selectedProject.id ? "Confirming" : "Confirm Complete"}
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

{#snippet WorkspaceSection(title, description, icon, sectionItems, emptyTitle, emptyMessage)}
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

    {#if sectionItems.length}
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {#each sectionItems as item (item.kind + item.id)}
          <article class="flex min-h-44 flex-col justify-between rounded-card border p-4 shadow-card {getItemCardClass(item.priority)}">
            <div>
              <div class="flex items-start justify-between gap-3">
                <h5 class="line-clamp-2 font-bold leading-snug text-ink">{item.title}</h5>
                <Badge tone={getPriorityTone(item.priority)} size="xs" class="shrink-0">
                  {item.priority || "Unset"}
                </Badge>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                {#if item.kind === "task"}
                  <Badge tone="neutral">Task</Badge>
                {:else}
                  <Badge tone={getStatusTone(item.status)}>{item.status}</Badge>
                {/if}
                <Badge tone="neutral">
                  <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
                  {formatDate(item.due)}
                </Badge>
              </div>

              {#if item.kind === "task"}
                <p class="mt-3 flex items-center gap-1.5 text-xs text-ink/55">
                  <UserRound class="h-3.5 w-3.5" aria-hidden="true" />
                  Assigned by {item.assignerName}
                </p>
                {#if item.note}
                  <p class="mt-2 line-clamp-3 text-sm leading-6 text-ink/70">{item.note}</p>
                {/if}
                {#if item.sourceLink}
                  <a
                    href={item.sourceLink}
                    class="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-strong hover:underline"
                  >
                    <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
                    {item.sourceLabel || "Open linked item"}
                  </a>
                {/if}
              {/if}
            </div>

            <div class="mt-4 grid gap-2 {item.kind === 'project' ? 'sm:grid-cols-2' : ''}">
              {#if item.kind === "project"}
                <Button icon={Eye} class="w-full" onclick={() => openItem(item)}>
                  View Details
                </Button>
              {/if}
              <Button
                variant="primary"
                icon={CheckCircle2}
                class="w-full"
                onclick={() => completeItem(item)}
                loading={completingId === item.id}
              >
                {completingId === item.id ? "Saving" : "Complete"}
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
