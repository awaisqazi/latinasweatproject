<script>
  import { onMount } from "svelte";
  import {
    CalendarClock,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock3,
    RefreshCw,
  } from "@lucide/svelte";
  import { getChannelSegments } from "../../../lib/dashboard/channelColors";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Skeleton from "../ui/Skeleton.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import ProjectDetailDrawer from "./ProjectDetailDrawer.svelte";

  export let supabase;
  export let refreshKey = 0;
  export let currentUserEmail = "";
  export let currentUserRole = "member";
  export let teamMembers = [];
  export let availableStatuses = [];
  export let scheduleProjects = [];
  export let onProjectUpdated = () => {};
  export let onAssignTask = () => {};

  let projects = [];
  let selectedProject = null;
  let isLoading = true;
  let errorMessage = "";
  let currentMonth = getMonthStart(new Date());
  let lastRefreshKey = refreshKey;
  let filterMode = "all";

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Everything that is being worked on shows on its deadline; posts show on
  // their publish date. "Ready for Review" gets its own color so reviewers can
  // scan for it.
  const WORK_STATUSES = ["Ready for Production", "In Production", "Ready for Copy", "Stuck"];
  const REVIEW_STATUS = "Ready for Review";
  const POST_STATUSES = ["Ready to Publish", "Published"];
  const FILTER_TABS = [
    { id: "all", label: "Everything" },
    { id: "work", label: "Projects" },
    { id: "posts", label: "Posts" },
  ];

  $: calendarEntries = projects.flatMap(toCalendarEntries);
  $: visibleEntries =
    filterMode === "all"
      ? calendarEntries
      : calendarEntries.filter((entry) =>
          filterMode === "posts" ? entry.kind === "post" : entry.kind !== "post",
        );
  $: calendarDays = buildCalendarDays(currentMonth, visibleEntries);
  $: monthEntries = visibleEntries
    .filter((entry) => isSameMonth(entry.date, currentMonth))
    .slice()
    .sort(
      (a, b) => a.date.localeCompare(b.date) || kindRank(a) - kindRank(b),
    );
  $: monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(currentMonth);
  $: allMonthEntries = calendarEntries.filter((entry) =>
    isSameMonth(entry.date, currentMonth),
  );
  $: workCount = allMonthEntries.filter((entry) => entry.kind === "work").length;
  $: reviewCount = allMonthEntries.filter((entry) => entry.kind === "review").length;
  $: scheduledCount = allMonthEntries.filter(
    (entry) => entry.kind === "post" && !entry.published,
  ).length;
  $: postedCount = allMonthEntries.filter(
    (entry) => entry.kind === "post" && entry.published,
  ).length;
  $: monthChannels = Array.from(
    new Map(
      allMonthEntries
        .filter((entry) => entry.kind === "post")
        .flatMap((entry) => entry.segments)
        .map((segment) => [segment.key, segment]),
    ).values(),
  );
  $: undatedCount = projects.filter((project) => !toCalendarEntries(project).length).length;

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadCalendarProjects();
  }

  onMount(() => {
    loadCalendarProjects();
  });

  async function loadCalendarProjects() {
    if (!supabase) {
      isLoading = false;
      errorMessage = "The Supabase client is not available yet.";
      return;
    }

    isLoading = true;
    errorMessage = "";

    try {
      const { data, error } = await withTimeout(
        supabase
          .from("projects")
          .select(
            "id,title,status,priority,deadline,publish_date,details_url,brief_doc_status,copy_approved,files_url,deliverables_url,assigned_to,edit_notes,channel_tags,source,intake_reviewed,intake_submitted_at,updated_at",
          )
          .eq("intake_reviewed", true)
          .neq("status", "Archived")
          .order("deadline", { ascending: true }),
      );

      if (error) {
        errorMessage = error.message;
      } else {
        projects = data || [];
      }
    } catch (error) {
      errorMessage =
        error?.message ||
        "The marketing calendar took too long to load. Please refresh and try again.";
    } finally {
      isLoading = false;
    }
  }

  function withTimeout(request, timeoutMs = 15000) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(
        () => reject(new Error("The marketing calendar took too long to load.")),
        timeoutMs,
      );
    });
    return Promise.race([request, timeout]).finally(() => window.clearTimeout(timer));
  }

  // A project can appear twice: as production work on its deadline AND as a
  // post on its publish date (posts only once it is Ready to Publish or
  // Published).
  function toCalendarEntries(project) {
    const entries = [];

    if (
      (WORK_STATUSES.includes(project.status) || project.status === REVIEW_STATUS) &&
      project.deadline
    ) {
      entries.push({
        kind: project.status === REVIEW_STATUS ? "review" : "work",
        date: project.deadline,
        project,
      });
    }

    if (POST_STATUSES.includes(project.status) && project.publish_date) {
      entries.push({
        kind: "post",
        date: project.publish_date,
        published: project.status === "Published",
        segments: getChannelSegments(project.channel_tags),
        project,
      });
    }

    return entries;
  }

  function kindRank(entry) {
    if (entry.kind === "post") return 0;
    if (entry.kind === "review") return 1;
    return 2;
  }

  function buildCalendarDays(month, entries) {
    const firstDay = getMonthStart(month);
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const dateKey = toDateKey(date);

      return {
        date,
        dateKey,
        dayNumber: date.getDate(),
        isToday: dateKey === toDateKey(new Date()),
        isCurrentMonth:
          date.getMonth() === month.getMonth() &&
          date.getFullYear() === month.getFullYear(),
        entries: entries
          .filter((entry) => entry.date === dateKey)
          .sort((a, b) => kindRank(a) - kindRank(b)),
      };
    });
  }

  function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function setMonth(offset) {
    currentMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + offset,
      1,
    );
  }

  function goToToday() {
    currentMonth = getMonthStart(new Date());
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function isSameMonth(dateKey, month) {
    const date = new Date(`${dateKey}T00:00:00`);
    return date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear();
  }

  function formatDate(value) {
    if (!value) return "No date";

    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function entryTypeLabel(entry) {
    if (entry.kind === "post") return entry.published ? "Posted" : "Scheduled";
    if (entry.kind === "review") return "Ready for review";
    return entry.project.status === "Stuck" ? "Stuck" : "In progress";
  }

  function projectChipClass(entry) {
    if (entry.kind === "review") {
      return "border-violet-200 bg-violet-100 text-violet-900 hover:border-violet-300";
    }
    return "border-sky-200 bg-sky-100 text-sky-900 hover:border-sky-300";
  }

  function openProjectDetails(project) {
    selectedProject = project;
  }

  function handleDrawerProjectUpdated(updatedProject) {
    if (!updatedProject?.id) return;

    onProjectUpdated(updatedProject);

    const shouldKeepProject =
      updatedProject.intake_reviewed !== false && updatedProject.status !== "Archived";
    const existingProject = projects.find((project) => project.id === updatedProject.id);

    if (shouldKeepProject && existingProject) {
      projects = projects.map((project) =>
        project.id === updatedProject.id ? { ...project, ...updatedProject } : project,
      );
    } else if (shouldKeepProject) {
      projects = [updatedProject, ...projects];
    } else {
      projects = projects.filter((project) => project.id !== updatedProject.id);
    }

    if (selectedProject?.id === updatedProject.id) {
      selectedProject = { ...selectedProject, ...updatedProject };
    }
  }
</script>

<section class="space-y-4" aria-labelledby="marketing-calendar-title">
  <div class="flex flex-col gap-3 rounded-card border border-ink/8 bg-white p-4 shadow-card md:flex-row md:items-center md:justify-between md:p-5">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">
        Production work and publishing in one view
      </p>
      <h3 id="marketing-calendar-title" class="mt-1 text-2xl font-bold">
        Marketing Calendar
      </h3>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Button iconOnly icon={ChevronLeft} label="Previous month" onclick={() => setMonth(-1)} />
      <Button onclick={goToToday}>Today</Button>
      <Button iconOnly icon={ChevronRight} label="Next month" onclick={() => setMonth(1)} />
      <Button icon={RefreshCw} loading={isLoading} onclick={loadCalendarProjects}>
        Refresh
      </Button>
    </div>
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} />
  {/if}

  <div class="rounded-card border border-ink/8 bg-white shadow-card">
    <div class="flex flex-col gap-3 border-b border-ink/8 px-4 py-4 md:px-5">
      <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h4 class="text-xl font-bold">{monthLabel}</h4>
          <p class="mt-1 text-sm text-ink/60">
            {workCount} in progress · {reviewCount} in review · {scheduledCount} scheduled · {postedCount} posted
          </p>
        </div>
        <Tabs
          tabs={FILTER_TABS}
          bind:active={filterMode}
          variant="segmented"
          label="Calendar filter"
          hasPanels={false}
        />
      </div>

      <div class="flex flex-wrap items-center gap-2" aria-label="Color legend">
        <Badge tone="neutral">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-400" aria-hidden="true"></span>
          In progress
        </Badge>
        <Badge tone="neutral">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-400" aria-hidden="true"></span>
          Ready for review
        </Badge>
        {#each monthChannels as channel (channel.key)}
          <Badge tone="neutral">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full {channel.dot}" aria-hidden="true"></span>
            {channel.label}
          </Badge>
        {/each}
        <span class="text-xs font-semibold text-ink/50">
          Dashed border = scheduled, solid + check = posted. Split colors = posting to multiple channels.
        </span>
      </div>

      {#if undatedCount}
        <p class="text-xs font-semibold text-ink/45">
          {undatedCount} project{undatedCount === 1 ? " has" : "s have"} no deadline or publish
          date yet, so {undatedCount === 1 ? "it doesn't" : "they don't"} appear on the calendar.
        </p>
      {/if}
    </div>

    {#if isLoading}
      <div class="p-4 md:p-5" role="status">
        <span class="sr-only">Loading marketing calendar</span>
        <div class="grid grid-cols-7 gap-2">
          {#each weekdays as weekday (weekday)}
            <Skeleton variant="text" class="h-3 w-8" />
          {/each}
          {#each Array(35) as _, index (index)}
            <Skeleton class="h-20" />
          {/each}
        </div>
      </div>
    {:else if visibleEntries.length}
      <div class="overflow-x-auto">
        <div class="grid min-w-[56rem] grid-cols-7 border-b border-ink/8 text-xs font-bold uppercase tracking-[0.12em] text-ink/45">
          {#each weekdays as weekday}
            <div class="border-r border-ink/8 px-3 py-3 last:border-r-0">
              {weekday}
            </div>
          {/each}
        </div>

        <div class="grid min-w-[56rem] grid-cols-7">
          {#each calendarDays as day}
            <div
              class="min-h-32 border-r border-t border-ink/8 px-2 py-2 last:border-r-0 {day.isCurrentMonth ? (day.date.getDay() === 0 || day.date.getDay() === 6 ? 'bg-canvas/40' : 'bg-white') : 'bg-canvas/70 text-ink/35'}{day.isToday ? ' ring-2 ring-inset ring-accent/30' : ''}"
            >
              <div class="mb-2 flex items-center justify-between gap-2">
                <span
                  class="inline-flex h-7 min-w-7 items-center justify-center rounded-full text-sm font-bold {day.isToday ? 'bg-ink text-white' : ''}"
                >
                  {day.dayNumber}
                </span>
                {#if day.entries.length}
                  <span class="text-xs font-bold text-ink/45">{day.entries.length}</span>
                {/if}
              </div>

              <div class="space-y-1.5">
                {#each day.entries as entry (entry.kind + entry.project.id)}
                  {#if entry.kind === "post"}
                    <button
                      type="button"
                      class="relative w-full overflow-hidden rounded-md border text-left text-xs font-semibold leading-snug transition focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 {entry.published ? 'border-ink/15 hover:border-ink/30' : 'border-dashed border-ink/30 hover:border-ink/50'}"
                      onclick={() => openProjectDetails(entry.project)}
                    >
                      <span class="absolute inset-0 flex" aria-hidden="true">
                        {#each entry.segments as segment (segment.key)}
                          <span class="h-full flex-1 {segment.seg}"></span>
                        {/each}
                      </span>
                      <span class="relative block px-2 py-1.5 text-ink/85">
                        <span class="sr-only">{formatDate(entry.date)}:</span>
                        <span class="mb-1 flex items-center gap-1.5">
                          {#if entry.published}
                            <CheckCircle2 class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {:else}
                            <Clock3 class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {/if}
                          <span class="truncate">
                            {entryTypeLabel(entry)} · {entry.segments.map((segment) => segment.label).join(" + ")}
                          </span>
                        </span>
                        <span class="line-clamp-2">{entry.project.title}</span>
                      </span>
                    </button>
                  {:else}
                    <button
                      type="button"
                      class="w-full rounded-md border px-2 py-1.5 text-left text-xs font-semibold leading-snug transition focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 {projectChipClass(entry)}"
                      onclick={() => openProjectDetails(entry.project)}
                    >
                      <span class="sr-only">{formatDate(entry.date)}:</span>
                      <span class="mb-1 flex items-center gap-1.5">
                        <CalendarClock class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span class="truncate">{entryTypeLabel(entry)} · Due</span>
                      </span>
                      <span class="line-clamp-2">{entry.project.title}</span>
                    </button>
                  {/if}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="p-4 md:p-5">
        <EmptyState
          title="Nothing on the calendar"
          message="Projects with deadlines, plus posts with publish dates, will appear here."
        />
      </div>
    {/if}
  </div>

  {#if !isLoading && monthEntries.length}
    <section
      class="rounded-card border border-ink/8 bg-white p-4 shadow-card md:hidden"
      aria-labelledby="marketing-agenda-title"
    >
      <h4 id="marketing-agenda-title" class="font-bold">This month</h4>
      <div class="mt-3 space-y-2">
        {#each monthEntries as entry (entry.kind + entry.project.id)}
          <button
            type="button"
            class="flex w-full items-start gap-3 rounded-control border border-ink/8 px-3 py-3 text-left transition hover:border-accent/30"
            onclick={() => openProjectDetails(entry.project)}
          >
            {#if entry.kind === "post"}
              <span class="mt-1 flex h-2.5 w-8 shrink-0 overflow-hidden rounded-full" aria-hidden="true">
                {#each entry.segments as segment (segment.key)}
                  <span class="h-full flex-1 {segment.dot}"></span>
                {/each}
              </span>
            {:else}
              <span
                class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full {entry.kind === 'review' ? 'bg-violet-400' : 'bg-sky-400'}"
                aria-hidden="true"
              ></span>
            {/if}
            <span class="min-w-0">
              <span class="block text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
                {formatDate(entry.date)} · {entryTypeLabel(entry)}
              </span>
              <span class="mt-1 block font-bold leading-snug">{entry.project.title}</span>
              {#if entry.kind === "post"}
                <span class="mt-1 block text-sm text-ink/60">
                  {entry.segments.map((segment) => segment.label).join(" + ")}
                </span>
              {:else}
                <span class="mt-1 block text-sm text-ink/60">{entry.project.status}</span>
              {/if}
            </span>
          </button>
        {/each}
      </div>
    </section>
  {/if}
</section>

<ProjectDetailDrawer
  {supabase}
  project={selectedProject}
  {teamMembers}
  {currentUserEmail}
  {currentUserRole}
  {availableStatuses}
  scheduleProjects={scheduleProjects.length ? scheduleProjects : projects}
  eyebrow="Marketing calendar"
  onClose={() => (selectedProject = null)}
  onProjectUpdated={handleDrawerProjectUpdated}
  {onAssignTask}
/>
