<script>
  import { onMount } from "svelte";
  import {
    ArchiveRestore,
    CalendarClock,
    CheckCircle2,
    CircleAlert,
    ExternalLink,
    Eye,
    Inbox,
    ListCheck,
    MessageSquare,
    Plus,
    RefreshCw,
    Search,
    UserRound,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import ProjectDetailDrawer from "./ProjectDetailDrawer.svelte";
  import SlideOver from "./SlideOver.svelte";
  import BoardProjectDrawer from "../board/BoardProjectDrawer.svelte";
  import EventEditorDrawer from "../events/EventEditorDrawer.svelte";
  import DonorDrawer from "../fundraising/DonorDrawer.svelte";
  import OutreachQueueDrawer from "../fundraising/OutreachQueueDrawer.svelte";
  import ProspectDrawer from "../fundraising/ProspectDrawer.svelte";
  import SubRequestDrawer from "../subs/SubRequestDrawer.svelte";
  import {
    loadMyOpenTasks,
    loadMyDoneTasks,
    loadMyFeedbackTasks,
    completeTask,
    logDoneItem,
    reopenTask,
  } from "../../../lib/dashboard/workspaceTasks";
  import { PROSPECT_COLUMNS } from "../../../lib/dashboard/fundraising";
  import { loadTemplates } from "../../../lib/dashboard/fundraisingCrm";
  import { isOperationalAdmin } from "../../../lib/dashboard/roles";

  export let supabase;
  export let email;
  export let profileId = "";
  export let teamMembers = [];
  export let currentUserRole = "member";
  export let isFeedbackRecipient = false;
  // Whether the current user can open the Board Projects view; board-sourced
  // cards hide their "#board" link when they can't.
  export let hasBoardAccess = true;
  // Per-module access ({ marketing, board, fundraising, subs, events }) so the
  // in-place resolver never opens a drawer whose data RLS would blank out.
  export let moduleAccess = {};
  export let currentUserName = "";
  export let availableStatuses = [];
  export let scheduleProjects = [];
  export let refreshKey = 0;
  export let onProjectUpdated = () => {};
  export let onTasksChanged = () => {};
  export let onCreateProject = () => {};
  export let onAssignTask = () => {};

  let projects = [];
  let tasks = [];
  let doneTasks = [];
  let feedbackTasks = [];
  let activeTab = "open";
  let feedbackSearch = "";
  let selectedTask = null;
  let taskDetailsOpen = false;
  let isLoading = true;
  let completingId = "";
  let errorMessage = "";
  let lastRefreshKey = refreshKey;

  // In-place module drawers: "View full details" resolves a task's source_ref
  // to the real record and opens the same drawer the module itself uses.
  let marketingProject = null;
  let boardProject = null;
  let prospectRecord = null;
  let donorRecord = null;
  let outreachCampaignId = "";
  let subRequest = null;
  let eventRecord = null;
  let resolvingRef = false;
  let fundraisingTemplates = null; // lazy-loaded for DonorDrawer
  let outreachQueueRefresh = 0;

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const PROJECT_COLUMNS =
    "id,title,status,priority,deadline,publish_date,edit_notes,details_url,brief_doc_status,files_url,deliverables_url,assigned_to,channel_tags,copy_approved,source,intake_reviewed,intake_submitted_at,updated_at";
  const BOARD_PROJECT_COLUMNS =
    "id, title, description, status, owner_id, due_date, created_by, created_at, updated_at";
  const SUB_REQUEST_COLUMNS =
    "id, kind, class_name, date, start_time, end_time, duration_minutes, location, notes, requested_by_name, requested_by_email, status, assigned_sub_name, assigned_sub_email, assigned_sub_phone, assigned_at, created_at, sub_volunteers(id, name, email, phone, created_at)";
  const EVENT_COLUMNS =
    "id, slug, title, image_src, image_frame_class, image_class, date_label, time_label, starts_on, ends_on, location, address, description, registration_link, registration_label, featured, recurring, tags, published, sort_order, created_at, updated_at";
  // source_ref kinds this view can open in place (mapped to the module whose
  // access is required); anything else keeps the plain "open the module" link.
  const OPENABLE_REF_MODULES = {
    project: "marketing",
    board_project: "board",
    board_task: "board",
    fundraising_prospect: "fundraising",
    fundraising_donor: "fundraising",
    fundraising_outreach: "fundraising",
    sub_request: "subs",
    event: "events",
  };

  // Merge marketing projects + assigned tasks into one feed, soonest first.
  $: items = [
    ...tasks.map(toTaskItem),
    ...projects.map(toProjectItem),
  ].sort(byDueThenPriority);
  $: urgentItems = items.filter(isUrgentItem);
  $: pipelineItems = items.filter((item) => !isUrgentItem(item));

  $: openFeedbackCount = feedbackTasks.filter((task) => task.status === "open").length;
  $: showFeedbackTab = isFeedbackRecipient || feedbackTasks.length > 0;
  $: workspaceTabs = [
    { id: "open", label: "Open", count: items.length },
    { id: "done", label: "History", icon: ArchiveRestore, count: doneTasks.length },
    ...(showFeedbackTab
      ? [{ id: "feedback", label: "Feedback inbox", icon: Inbox, count: openFeedbackCount }]
      : []),
  ];
  $: if (activeTab === "feedback" && !showFeedbackTab) activeTab = "open";
  $: filteredFeedbackTasks = feedbackTasks.filter((task) =>
    matchesFeedbackSearch(task, feedbackSearch),
  );
  $: selectedTaskOpenable = canOpenSourceRecord(selectedTask, moduleAccess, hasBoardAccess);

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

    await Promise.all([loadWorkspaceProjects(), refreshTaskLists()]);

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
          .select(PROJECT_COLUMNS)
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

  async function refreshTaskLists() {
    if (!profileId) {
      tasks = [];
      doneTasks = [];
      feedbackTasks = [];
      return;
    }

    let openResult;
    let doneResult;
    let feedbackResult;
    try {
      [openResult, doneResult, feedbackResult] = await withTimeout(
        Promise.all([
          loadMyOpenTasks(supabase, profileId),
          loadMyDoneTasks(supabase, profileId),
          loadMyFeedbackTasks(supabase, profileId),
        ]),
      );
    } catch (error) {
      errorMessage =
        errorMessage ||
        error?.message ||
        "Your tasks took too long to load. Please refresh and try again.";
      return;
    }

    const firstError =
      openResult.error || doneResult.error || feedbackResult.error;
    if (firstError) {
      errorMessage = errorMessage || firstError.message;
    }

    if (!openResult.error) tasks = openResult.tasks;
    if (!doneResult.error) doneTasks = doneResult.tasks;
    if (!feedbackResult.error) feedbackTasks = feedbackResult.tasks;
  }

  function withTimeout(request, timeoutMs = 15000) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(
        () => reject(new Error("The workspace took too long to load.")),
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
      sourceModule: task.source_module,
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

  function taskKindLabel(task) {
    if (task.source_module === "feedback") return "Feedback";
    if (task.source_module === "board_projects") return "Board";
    return "Task";
  }

  function feedbackCategory(task) {
    const match = /^Feedback \((.+)\)$/.exec(task.title || "");
    return match ? match[1] : "Feedback";
  }

  function matchesFeedbackSearch(task, search) {
    const query = search.trim().toLowerCase();
    if (!query) return true;

    return [task.title, task.note, task.source_label, resolveAssigner(task.assigned_by)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  }

  // ── Source-record resolution ──────────────────────────────────

  function parseSourceRef(task) {
    // Trigger-managed refs are bare ("fundraising_donor:<email>"); manual
    // per-record assigns use an "open:" namespace so DB sync triggers never
    // mistake them for their own cards. Both open the same drawers here.
    let ref = task?.source_ref || "";
    if (ref.startsWith("open:")) ref = ref.slice(5);
    const separator = ref.indexOf(":");
    if (separator < 1) return null;
    return { kind: ref.slice(0, separator), id: ref.slice(separator + 1) };
  }

  function canOpenSourceRecord(task, access, boardAccess) {
    const parsed = parseSourceRef(task);
    if (!parsed) return false;
    const moduleKey = OPENABLE_REF_MODULES[parsed.kind];
    if (!moduleKey) return false;
    if (moduleKey === "board") return boardAccess;
    return access?.[moduleKey] !== false;
  }

  async function openSourceRecord(task) {
    const parsed = parseSourceRef(task);
    if (!parsed || resolvingRef) return;

    resolvingRef = true;
    errorMessage = "";

    try {
      const opened = await resolveAndOpen(parsed);
      if (opened) {
        closeTaskDetails();
      } else {
        errorMessage =
          "That record couldn't be opened here. It may have been deleted, or you may not have access to its module.";
      }
    } catch (error) {
      errorMessage = error?.message || "That record couldn't be opened here.";
    } finally {
      resolvingRef = false;
    }
  }

  async function resolveAndOpen({ kind, id }) {
    if (kind === "project") {
      const { data } = await supabase
        .from("projects")
        .select(PROJECT_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (!data) return false;
      marketingProject = data;
      return true;
    }

    if (kind === "board_project" || kind === "board_task") {
      let projectId = id;
      if (kind === "board_task") {
        const { data: taskRow } = await supabase
          .from("board_project_tasks")
          .select("project_id")
          .eq("id", id)
          .maybeSingle();
        if (!taskRow) return false;
        projectId = taskRow.project_id;
      }
      const { data } = await supabase
        .from("board_projects")
        .select(BOARD_PROJECT_COLUMNS)
        .eq("id", projectId)
        .maybeSingle();
      if (!data) return false;
      boardProject = data;
      return true;
    }

    if (kind === "fundraising_prospect") {
      const { data } = await supabase
        .from("fundraising_prospects")
        .select(PROSPECT_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (!data) return false;
      prospectRecord = data;
      return true;
    }

    if (kind === "fundraising_donor") {
      return openDonorByEmail(id);
    }

    if (kind === "fundraising_outreach") {
      // Ref format: fundraising_outreach:<campaign_id>:<assignee_id>
      const campaignId = id.split(":")[0];
      if (!campaignId) return false;
      await ensureTemplatesLoaded();
      outreachCampaignId = campaignId;
      return true;
    }

    if (kind === "sub_request") {
      const { data } = await supabase
        .from("sub_requests")
        .select(SUB_REQUEST_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (!data) return false;
      subRequest = data;
      return true;
    }

    if (kind === "event") {
      const { data } = await supabase
        .from("events")
        .select(EVENT_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (!data) return false;
      eventRecord = data;
      return true;
    }

    return false;
  }

  async function openDonorByEmail(donorEmail) {
    const normalized = String(donorEmail || "").trim().toLowerCase();
    if (!normalized) return false;

    await ensureTemplatesLoaded();

    const { data, error } = await supabase
      .from("fundraising_donor_summary")
      .select("*")
      .eq("email", normalized)
      .maybeSingle();

    if (error) return false;

    // A donor profile can exist for someone with no imported gifts yet; fall
    // back to a stub so the drawer still opens with the contact log.
    donorRecord = data || { email: normalized };
    return true;
  }

  async function ensureTemplatesLoaded() {
    if (fundraisingTemplates !== null) return;
    const { data, error } = await loadTemplates(supabase);
    // On error stay null so the next open retries instead of caching a miss.
    if (!error) fundraisingTemplates = data || [];
  }

  function handleDonorWorkspaceChanged() {
    // A template send can flip outreach rows to "contacted"; refresh the
    // queue drawer underneath so it doesn't show (and save over) stale rows.
    outreachQueueRefresh += 1;
    onTasksChanged();
  }

  function handleModuleProjectUpdated(updated) {
    if (updated?.id) {
      const previous = projects.find((project) => project.id === updated.id);

      if (
        previous &&
        Array.isArray(updated.assigned_to) &&
        !isAssignedToCurrentUser(updated)
      ) {
        // No longer mine (unassigned, or completed via the card's Complete
        // button, which writes its own History entry). A drawer refresh can't
        // tell completion from unassignment, so never log from here.
        projects = projects.filter((project) => project.id !== updated.id);
      } else if (previous) {
        projects = projects.map((project) =>
          project.id === updated.id ? { ...project, ...updated } : project,
        );
      } else {
        // Not in the feed (opened via source_ref); a full reload covers
        // whether it should now appear.
        loadWorkspaceProjects();
      }
    }
    onProjectUpdated(updated);
  }

  // ── Actions ───────────────────────────────────────────────────
  function openItem(item) {
    if (item.kind === "project") {
      marketingProject = item.raw;
    } else {
      openTaskDetails(item.raw);
    }
  }

  function openTaskDetails(task) {
    selectedTask = task;
    taskDetailsOpen = true;
  }

  function closeTaskDetails() {
    taskDetailsOpen = false;
  }

  function handleTaskDrawerClosed() {
    selectedTask = null;
  }

  async function completeItem(item) {
    if (item.kind === "task") {
      await completeWorkspaceTask(item.raw);
    } else {
      await completeMyAssignment(item.raw);
    }
  }

  async function completeWorkspaceTask(task) {
    if (!task?.id || completingId) return;

    completingId = task.id;
    errorMessage = "";

    try {
      const { data, error } = await completeTask(supabase, task.id);

      if (error) {
        errorMessage = error.message;
        return;
      }

      if (selectedTask?.id === task.id && data) {
        selectedTask = data;
      }

      await refreshTaskLists();
      onTasksChanged();
    } finally {
      completingId = "";
    }
  }

  async function reopenWorkspaceTask(task) {
    if (!task?.id || completingId) return;

    completingId = task.id;
    errorMessage = "";

    try {
      const { data, error } = await reopenTask(supabase, task.id);

      if (error) {
        errorMessage = error.message;
        return;
      }

      if (selectedTask?.id === task.id && data) {
        selectedTask = data;
      }

      await refreshTaskLists();
      onTasksChanged();
    } finally {
      completingId = "";
    }
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

    // Optimistic lock: assigned_to is a shared array, so a blind write could
    // silently drop a teammate's simultaneous assignment change.
    let query = supabase
      .from("projects")
      .update({ assigned_to: nextAssignedTo })
      .eq("id", project.id);
    if (project.updated_at) {
      query = query.eq("updated_at", project.updated_at);
    }

    const { data, error } = await query.select(PROJECT_COLUMNS).maybeSingle();

    if (error) {
      errorMessage = error.message;
      completingId = "";
      return;
    }

    if (!data) {
      errorMessage =
        "This project's assignments just changed — your workspace has been refreshed. Try again in a moment.";
      await loadWorkspaceProjects();
      completingId = "";
      return;
    }

    await addTimelineLog(project.id, "Completed their assignment.");

    // Leave a trace in History; without it, a completed project assignment
    // disappears entirely (the email is simply removed from assigned_to).
    await logDoneItem(supabase, {
      assigneeId: profileId,
      title: `Completed assignment: ${project.title}`,
      note: "You completed your assignment on this marketing project.",
      sourceModule: "projects",
      sourceLabel: "Marketing project",
      sourceLink: "#kanban",
    });

    projects = projects.filter((item) => item.id !== project.id);
    onProjectUpdated(data);
    await refreshTaskLists();

    if (marketingProject?.id === project.id) {
      marketingProject = null;
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

  function formatDateTime(value) {
    if (!value) return "";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
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
</script>

<section class="space-y-5" aria-labelledby="workspace-title">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">
        Assigned to {email}
      </p>
      <h3 id="workspace-title" class="mt-1 text-2xl font-bold text-ink">Workspace</h3>
    </div>

    <div class="flex w-fit items-center gap-2">
      <Button variant="primary" icon={Plus} onclick={onCreateProject}>
        New project
      </Button>
      <Button icon={RefreshCw} onclick={loadWorkspace} loading={isLoading}>
        Refresh
      </Button>
    </div>
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} />
  {/if}

  <Tabs
    tabs={workspaceTabs}
    bind:active={activeTab}
    variant="segmented"
    label="Workspace sections"
    hasPanels={false}
  />

  {#if isLoading}
    <SkeletonCard lines={3} />
  {:else if activeTab === "open"}
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
  {:else if activeTab === "done"}
    <section
      class="rounded-card border border-ink/8 bg-white p-4 shadow-card md:p-5"
      aria-labelledby="workspace-history-title"
    >
      <div class="mb-4 flex items-start gap-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-ink">
          <ArchiveRestore class="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h4 id="workspace-history-title" class="text-lg font-bold text-ink">History</h4>
          <p class="mt-1 text-sm leading-6 text-ink/60">
            Everything you've completed. Nothing here is lost: open an item to
            read it again, or reopen it to put it back in your queue.
          </p>
        </div>
      </div>

      {#if doneTasks.length}
        <div class="space-y-2">
          {#each doneTasks as task (task.id)}
            <article class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3">
              <button
                type="button"
                class="min-w-0 flex-1 text-left"
                onclick={() => openTaskDetails(task)}
              >
                <span class="block truncate font-bold leading-snug text-ink/70 hover:text-ink">
                  {task.title}
                </span>
                <span class="mt-1 block text-xs text-ink/50">
                  {taskKindLabel(task)} · Completed {formatDateTime(task.completed_at) || "earlier"}
                </span>
              </button>
              <Button
                size="sm"
                icon={Eye}
                onclick={() => openTaskDetails(task)}
              >
                View
              </Button>
              <Button
                size="sm"
                icon={ArchiveRestore}
                loading={completingId === task.id}
                onclick={() => reopenWorkspaceTask(task)}
              >
                Reopen
              </Button>
            </article>
          {/each}
        </div>
      {:else}
        <EmptyState
          title="No completed items yet"
          message="Tasks you complete will land here so you can always find them again."
        />
      {/if}
    </section>
  {:else if activeTab === "feedback"}
    <section
      class="rounded-card border border-ink/8 bg-white p-4 shadow-card md:p-5"
      aria-labelledby="workspace-feedback-title"
    >
      <div class="mb-4 flex items-start gap-3">
        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-ink">
          <Inbox class="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h4 id="workspace-feedback-title" class="text-lg font-bold text-ink">Feedback inbox</h4>
          <p class="mt-1 text-sm leading-6 text-ink/60">
            Every piece of feedback sent to you through the dashboard, including
            what you've already cleared.
          </p>
        </div>
      </div>

      <label class="relative mb-4 block">
        <span class="sr-only">Search feedback</span>
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" aria-hidden="true" />
        <input
          type="search"
          class="input pl-9"
          placeholder="Search feedback by message, sender, or type"
          bind:value={feedbackSearch}
        />
      </label>

      {#if filteredFeedbackTasks.length}
        <div class="space-y-3">
          {#each filteredFeedbackTasks as task (task.id)}
            <article class="rounded-card border p-4 {task.status === 'open' ? 'border-ink/10 bg-white shadow-card' : 'border-ink/8 bg-canvas/60'}">
              <div class="flex flex-wrap items-center gap-2">
                <Badge tone={task.status === "open" ? "amber" : "neutral"} size="xs">
                  {task.status === "open" ? "Open" : "Cleared"}
                </Badge>
                <Badge tone="blue" size="xs">
                  <MessageSquare class="h-3 w-3" aria-hidden="true" />
                  {feedbackCategory(task)}
                </Badge>
                <span class="text-xs font-semibold text-ink/50">
                  {resolveAssigner(task.assigned_by)} · {formatDateTime(task.created_at)}
                </span>
              </div>

              {#if task.note}
                <p class="mt-3 whitespace-pre-wrap text-sm leading-6 {task.status === 'open' ? 'text-ink/80' : 'text-ink/60'}">
                  {task.note}
                </p>
              {/if}

              <div class="mt-3 flex flex-wrap gap-2">
                {#if task.status === "open"}
                  <Button
                    size="sm"
                    variant="primary"
                    icon={CheckCircle2}
                    loading={completingId === task.id}
                    onclick={() => completeWorkspaceTask(task)}
                  >
                    Mark handled
                  </Button>
                {:else}
                  <Button
                    size="sm"
                    icon={ArchiveRestore}
                    loading={completingId === task.id}
                    onclick={() => reopenWorkspaceTask(task)}
                  >
                    Reopen
                  </Button>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <EmptyState
          title={feedbackSearch ? "No matching feedback" : "No feedback yet"}
          message={feedbackSearch
            ? "Try a different search term."
            : "Feedback sent through the dashboard's Feedback button will collect here."}
        />
      {/if}
    </section>
  {/if}
</section>

<SlideOver
  open={taskDetailsOpen}
  title={selectedTask?.title || ""}
  eyebrow={selectedTask ? taskKindLabel(selectedTask) : "Task"}
  closeLabel="Close task details"
  onClose={closeTaskDetails}
  onClosed={handleTaskDrawerClosed}
>
  {#if selectedTask}
    <div class="space-y-5 px-5 py-5">
      {#if errorMessage}
        <Banner tone="error" message={errorMessage} />
      {/if}

      <div class="flex flex-wrap gap-2">
        <Badge tone={selectedTask.status === "open" ? "amber" : "green"}>
          {selectedTask.status === "open" ? "Open" : "Completed"}
        </Badge>
        <Badge tone={getPriorityTone(selectedTask.priority)}>
          {selectedTask.priority || "Priority unset"}
        </Badge>
        <Badge tone="neutral">
          <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
          {formatDate(selectedTask.due_date)}
        </Badge>
      </div>

      <div class="rounded-control border border-ink/8 bg-canvas/60 px-4 py-3 text-sm leading-6 text-ink/70">
        <p class="flex items-center gap-1.5">
          <UserRound class="h-3.5 w-3.5" aria-hidden="true" />
          Assigned by {resolveAssigner(selectedTask.assigned_by)}
          {#if selectedTask.created_at}
            on {formatDateTime(selectedTask.created_at)}
          {/if}
        </p>
        {#if selectedTask.status === "done" && selectedTask.completed_at}
          <p class="mt-1 flex items-center gap-1.5">
            <CheckCircle2 class="h-3.5 w-3.5" aria-hidden="true" />
            Completed {formatDateTime(selectedTask.completed_at)}
          </p>
        {/if}
      </div>

      {#if selectedTask.note}
        <section aria-labelledby="task-note-title">
          <h4 id="task-note-title" class="font-bold text-ink">Details</h4>
          <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/80">
            {selectedTask.note}
          </p>
        </section>
      {/if}

      {#if selectedTaskOpenable}
        <Button
          variant="primary"
          icon={Eye}
          class="w-full"
          loading={resolvingRef}
          onclick={() => openSourceRecord(selectedTask)}
        >
          {resolvingRef ? "Opening" : "View full details"}
        </Button>
      {/if}

      {#if selectedTask.source_link}
        {#if selectedTask.source_link === "#board" && !hasBoardAccess}
          <p class="rounded-control border border-ink/10 bg-canvas/60 px-3 py-2.5 text-sm font-semibold text-ink/60">
            {selectedTask.source_label || "Board item"}
          </p>
        {:else}
          <a
            href={selectedTask.source_link}
            class="inline-flex min-h-10 items-center gap-2 rounded-control border border-ink/14 px-3 text-sm font-bold text-ink transition hover:border-accent/40 hover:text-accent-strong"
            onclick={closeTaskDetails}
          >
            <ExternalLink class="h-4 w-4" aria-hidden="true" />
            {selectedTask.source_label || "Open linked item"}
          </a>
        {/if}
      {/if}

      {#if selectedTask.status === "open"}
        <Button
          variant="primary"
          icon={CheckCircle2}
          class="w-full"
          loading={completingId === selectedTask.id}
          onclick={() => completeWorkspaceTask(selectedTask)}
        >
          Complete
        </Button>
      {:else}
        <Button
          icon={ArchiveRestore}
          class="w-full"
          loading={completingId === selectedTask.id}
          onclick={() => reopenWorkspaceTask(selectedTask)}
        >
          Reopen
        </Button>
      {/if}

      <Button variant="secondary" class="w-full" onclick={closeTaskDetails}>
        Close
      </Button>
    </div>
  {/if}
</SlideOver>

<ProjectDetailDrawer
  {supabase}
  project={marketingProject}
  {teamMembers}
  currentUserEmail={email}
  {currentUserRole}
  {availableStatuses}
  {scheduleProjects}
  eyebrow="Project details"
  onClose={() => (marketingProject = null)}
  onProjectUpdated={handleModuleProjectUpdated}
  {onAssignTask}
/>

<BoardProjectDrawer
  {supabase}
  project={boardProject}
  {teamMembers}
  {currentUserRole}
  onClose={() => (boardProject = null)}
  onProjectUpdated={onTasksChanged}
  onProjectDeleted={() => {
    boardProject = null;
    onTasksChanged();
  }}
  {onAssignTask}
/>

<ProspectDrawer
  {supabase}
  prospect={prospectRecord}
  {teamMembers}
  {currentUserRole}
  onClose={() => (prospectRecord = null)}
  onProspectUpdated={onTasksChanged}
  onProspectDeleted={() => {
    prospectRecord = null;
    onTasksChanged();
  }}
  {onAssignTask}
/>

<DonorDrawer
  {supabase}
  donor={donorRecord}
  {teamMembers}
  templates={fundraisingTemplates || []}
  currentUserId={profileId}
  {currentUserName}
  onClose={() => (donorRecord = null)}
  {onAssignTask}
  onWorkspaceChanged={handleDonorWorkspaceChanged}
/>

<OutreachQueueDrawer
  {supabase}
  campaignId={outreachCampaignId}
  {profileId}
  refreshKey={outreachQueueRefresh}
  onOpenDonor={(item) => openDonorByEmail(item.donor_email)}
  onChanged={onTasksChanged}
  onClose={() => (outreachCampaignId = "")}
/>

<SubRequestDrawer
  {supabase}
  request={subRequest}
  onClose={() => (subRequest = null)}
  onRequestUpdated={onTasksChanged}
  onRequestDeleted={() => {
    subRequest = null;
    onTasksChanged();
  }}
  {onAssignTask}
/>

<EventEditorDrawer
  {supabase}
  event={eventRecord}
  isAdmin={isOperationalAdmin({ role: currentUserRole })}
  onClose={() => (eventRecord = null)}
  onSaved={onTasksChanged}
  onDeleted={() => {
    eventRecord = null;
    onTasksChanged();
  }}
  {onAssignTask}
/>

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
                <button
                  type="button"
                  class="min-w-0 text-left"
                  onclick={() => openItem(item)}
                >
                  <h5 class="line-clamp-2 font-bold leading-snug text-ink hover:underline">
                    {item.title}
                  </h5>
                </button>
                <Badge tone={getPriorityTone(item.priority)} size="xs" class="shrink-0">
                  {item.priority || "Unset"}
                </Badge>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                {#if item.kind === "task"}
                  <Badge tone={item.sourceModule === "feedback" ? "blue" : "neutral"}>
                    {taskKindLabel(item.raw)}
                  </Badge>
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
              {/if}
            </div>

            <div class="mt-4 grid grid-cols-2 gap-2">
              <Button icon={Eye} class="w-full" onclick={() => openItem(item)}>
                {item.kind === "project" ? "View Details" : "View"}
              </Button>
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
