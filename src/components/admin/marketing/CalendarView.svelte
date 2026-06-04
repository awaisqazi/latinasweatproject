<script>
  import { onMount } from "svelte";
  import {
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    RefreshCw,
  } from "@lucide/svelte";
  import EmptyState from "./EmptyState.svelte";
  import ProjectDetailDrawer from "./ProjectDetailDrawer.svelte";

  export let supabase;
  export let refreshKey = 0;
  export let currentUserEmail = "";
  export let currentUserRole = "member";
  export let teamMembers = [];
  export let availableStatuses = [];
  export let scheduleProjects = [];
  export let onProjectUpdated = () => {};

  let projects = [];
  let selectedProject = null;
  let isLoading = true;
  let errorMessage = "";
  let currentMonth = getMonthStart(new Date());
  let lastRefreshKey = refreshKey;

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const activeExcludedStatuses = ["Published", "Archived"];

  $: calendarProjects = projects
    .map((project) => ({
      ...project,
      calendar_date: project.deadline || project.publish_date,
      calendar_date_type: project.deadline ? "Deadline" : "Publish",
    }))
    .filter((project) => Boolean(project.calendar_date));

  $: calendarDays = buildCalendarDays(currentMonth, calendarProjects);
  $: visibleMonthProjects = calendarProjects
    .filter((project) => isSameMonth(project.calendar_date, currentMonth))
    .slice()
    .sort((a, b) => a.calendar_date.localeCompare(b.calendar_date));
  $: monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(currentMonth);

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
            "id,title,status,priority,deadline,publish_date,details_url,copy_approved,files_url,deliverables_url,assigned_to,edit_notes,channel_tags,source,intake_reviewed",
          )
          .eq("intake_reviewed", true)
          .neq("status", activeExcludedStatuses[0])
          .neq("status", activeExcludedStatuses[1])
          .order("deadline", { ascending: true, nullsFirst: false })
          .order("publish_date", { ascending: true, nullsFirst: false }),
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
        "Project calendar took too long to load. Please refresh and try again.";
    } finally {
      isLoading = false;
    }
  }

  function withTimeout(request, timeoutMs = 15000) {
    return Promise.race([
      request,
      new Promise((_, reject) => {
        window.setTimeout(
          () => reject(new Error("Project calendar took too long to load.")),
          timeoutMs,
        );
      }),
    ]);
  }

  function buildCalendarDays(month, sourceProjects) {
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
        projects: sourceProjects.filter((project) => project.calendar_date === dateKey),
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

  function getChannelClass(project) {
    const tags = normalizeTags(project.channel_tags);
    const joinedTags = tags.join(" ");

    if (joinedTags.includes("linkedin")) {
      return "border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-300 hover:bg-blue-100";
    }

    if (joinedTags.includes("website")) {
      return "border-gray-200 bg-gray-100 text-gray-800 hover:border-gray-300 hover:bg-gray-200";
    }

    if (joinedTags.includes("ig") || joinedTags.includes("instagram") || joinedTags.includes("tiktok")) {
      return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 hover:border-fuchsia-300 hover:bg-fuchsia-100";
    }

    if (joinedTags.includes("newsletter")) {
      return "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100";
    }

    return "border-teal-200 bg-teal-50 text-teal-800 hover:border-teal-300 hover:bg-teal-100";
  }

  function getChannelDotClass(project) {
    const tags = normalizeTags(project.channel_tags);
    const joinedTags = tags.join(" ");

    if (joinedTags.includes("linkedin")) return "bg-blue-500";
    if (joinedTags.includes("website")) return "bg-gray-500";
    if (joinedTags.includes("ig") || joinedTags.includes("instagram") || joinedTags.includes("tiktok")) {
      return "bg-fuchsia-500";
    }
    if (joinedTags.includes("newsletter")) return "bg-emerald-500";
    return "bg-teal-500";
  }

  function normalizeTags(tags) {
    if (!Array.isArray(tags)) return [];

    return tags
      .flatMap((tag) => String(tag).split(","))
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
  }

  function openProjectDetails(project) {
    selectedProject = project;
  }

  function handleDrawerProjectUpdated(updatedProject) {
    if (!updatedProject?.id) return;

    onProjectUpdated(updatedProject);

    const shouldKeepProject =
      updatedProject.intake_reviewed === true &&
      !activeExcludedStatuses.includes(updatedProject.status);
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

<section class="space-y-4" aria-labelledby="calendar-view-title">
  <div class="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between md:p-5">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#0f766e]">
        Deadlines and active work
      </p>
      <h3 id="calendar-view-title" class="mt-1 text-2xl font-bold">Project Calendar</h3>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="inline-flex min-h-10 items-center justify-center rounded-md border border-black/10 bg-white p-2 shadow-sm transition hover:border-[#0f766e]/30 hover:text-[#0f766e]"
        aria-label="Previous month"
        onclick={() => setMonth(-1)}
      >
        <ChevronLeft class="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm font-bold shadow-sm transition hover:border-[#0f766e]/30 hover:text-[#0f766e]"
        onclick={goToToday}
      >
        Today
      </button>
      <button
        type="button"
        class="inline-flex min-h-10 items-center justify-center rounded-md border border-black/10 bg-white p-2 shadow-sm transition hover:border-[#0f766e]/30 hover:text-[#0f766e]"
        aria-label="Next month"
        onclick={() => setMonth(1)}
      >
        <ChevronRight class="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold shadow-sm transition hover:border-[#0f766e]/30 hover:text-[#0f766e] disabled:cursor-not-allowed disabled:opacity-60"
        onclick={loadCalendarProjects}
        disabled={isLoading}
      >
        <RefreshCw class="h-4 w-4 {isLoading ? 'animate-spin' : ''}" aria-hidden="true" />
        Refresh
      </button>
    </div>
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

  <div class="rounded-lg border border-black/10 bg-white shadow-sm">
    <div class="flex flex-col gap-2 border-b border-black/10 px-4 py-4 md:flex-row md:items-end md:justify-between md:px-5">
      <div>
        <h4 class="text-xl font-bold">{monthLabel}</h4>
        <p class="mt-1 text-sm text-gray-600">
          {visibleMonthProjects.length} active project date{visibleMonthProjects.length === 1 ? "" : "s"}
        </p>
      </div>

      <div class="flex flex-wrap gap-2 text-xs font-bold">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-50 px-2.5 py-1 text-fuchsia-800">
          <span class="h-2 w-2 rounded-full bg-fuchsia-500"></span>
          IG/TikTok
        </span>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-blue-800">
          <span class="h-2 w-2 rounded-full bg-blue-500"></span>
          LinkedIn
        </span>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-gray-800">
          <span class="h-2 w-2 rounded-full bg-gray-500"></span>
          Website
        </span>
      </div>
    </div>

    {#if isLoading}
      <div class="flex min-h-72 items-center justify-center px-4 py-10">
        <div class="flex items-center gap-3 text-sm text-gray-600">
          <span
            class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin"
            aria-hidden="true"
          ></span>
          Loading project calendar
        </div>
      </div>
    {:else if calendarProjects.length}
      <div class="overflow-x-auto">
        <div class="grid min-w-[56rem] grid-cols-7 border-b border-gray-200 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
          {#each weekdays as weekday}
            <div class="border-r border-gray-200 px-3 py-3 last:border-r-0">
              {weekday}
            </div>
          {/each}
        </div>

        <div class="grid min-w-[56rem] grid-cols-7">
          {#each calendarDays as day}
            <div
              class="min-h-32 border-r border-t border-gray-200 px-2 py-2 last:border-r-0 {day.isCurrentMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'}"
            >
              <div class="mb-2 flex items-center justify-between gap-2">
                <span
                  class="inline-flex h-7 min-w-7 items-center justify-center rounded-full text-sm font-bold {day.isToday ? 'bg-[#1E1E1E] text-white' : ''}"
                >
                  {day.dayNumber}
                </span>
                {#if day.projects.length}
                  <span class="text-xs font-bold text-gray-500">{day.projects.length}</span>
                {/if}
              </div>

              <div class="space-y-1.5">
                {#each day.projects as project}
                  <button
                    type="button"
                    class="group w-full rounded-md border px-2 py-1.5 text-left text-xs font-semibold leading-snug transition focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-1 {getChannelClass(project)}"
                    onclick={() => openProjectDetails(project)}
                  >
                    <span class="mb-1 flex items-center gap-1.5">
                      <span class="h-2 w-2 shrink-0 rounded-full {getChannelDotClass(project)}"></span>
                      <span class="truncate">{project.calendar_date_type}</span>
                    </span>
                    <span class="line-clamp-2">{project.title}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="p-4 md:p-5">
        <EmptyState
          title="No calendar dates"
          message="Active reviewed projects with deadlines will appear here."
        />
      </div>
    {/if}
  </div>

  {#if !isLoading && visibleMonthProjects.length}
    <section
      class="rounded-lg border border-black/10 bg-white p-4 shadow-sm md:hidden"
      aria-labelledby="calendar-agenda-title"
    >
      <h4 id="calendar-agenda-title" class="font-bold">This month</h4>
      <div class="mt-3 space-y-2">
        {#each visibleMonthProjects as project}
          <button
            type="button"
            class="flex w-full items-start gap-3 rounded-md border border-black/10 px-3 py-3 text-left transition hover:border-[#0f766e]/30"
            onclick={() => openProjectDetails(project)}
          >
            <span class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full {getChannelDotClass(project)}"></span>
            <span class="min-w-0">
              <span class="block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                {formatDate(project.calendar_date)}
              </span>
              <span class="mt-1 block font-bold leading-snug">{project.title}</span>
              <span class="mt-1 block text-sm text-gray-600">{project.status}</span>
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
  eyebrow="Project calendar"
  onClose={() => (selectedProject = null)}
  onProjectUpdated={handleDrawerProjectUpdated}
/>
