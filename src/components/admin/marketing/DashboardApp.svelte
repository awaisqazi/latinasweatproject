<script>
  import { onMount } from "svelte";
  import {
    AlertCircle,
    ArrowLeftRight,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    HeartHandshake,
    Home,
    Kanban,
    Lock,
    LogOut,
    Menu,
    PanelLeftClose,
    PanelLeftOpen,
    PartyPopper,
    RefreshCw,
    ShieldCheck,
    Ticket,
    UserCircle,
    Users,
    Vote,
    X,
  } from "@lucide/svelte";
  import {
    getSupabaseClient,
    SUPABASE_CONFIG_ERROR,
  } from "../../../lib/supabaseClient";
  import { hasModule, loadModuleGrants } from "../../../lib/dashboard/permissions";
  import { isOperationalAdmin, isSuperuser } from "../../../lib/dashboard/roles";
  import AdminOverview from "./AdminOverview.svelte";
  import Panel from "./Panel.svelte";
  import ProjectCard from "./ProjectCard.svelte";
  import ProjectDetailDrawer from "./ProjectDetailDrawer.svelte";
  import PublishingCalendarView from "./PublishingCalendarView.svelte";
  import PublishScheduleDialog from "./PublishScheduleDialog.svelte";
  import UserAccessView from "./UserAccessView.svelte";
  import Workspace from "./Workspace.svelte";
  import UnifiedCalendarView from "../dashboard/UnifiedCalendarView.svelte";
  import BoardProjectsView from "../board/BoardProjectsView.svelte";
  import EventsView from "../events/EventsView.svelte";
  import VolunteersView from "../volunteers/VolunteersView.svelte";
  import SubsView from "../subs/SubsView.svelte";
  import ElectionsView from "../elections/ElectionsView.svelte";
  import GalaView from "../gala/GalaView.svelte";

  const LOGIN_PATH = "/admin/marketing/login";
  const DASHBOARD_PATH = "/admin/marketing";

  const statuses = [
    "Ready for Production",
    "In Production",
    "Ready for Copy",
    "Ready for Review",
    "Stuck",
    "Ready to Publish",
    "Published",
    "Archived",
  ];
  const memberMovableStatuses = [
    "Ready for Production",
    "In Production",
    "Ready for Copy",
    "Ready for Review",
    "Stuck",
  ];
  const projectSelectColumns =
    "id,title,priority,status,deadline,publish_date,details_url,copy_approved,files_url,deliverables_url,assigned_to,edit_notes,channel_tags,source,intake_reviewed,intake_submitted_at";

  const navItems = [
    { id: "workspace", label: "Workspace", icon: Home, section: "Marketing", modules: ["marketing"] },
    { id: "kanban", label: "Kanban", icon: Kanban, section: "Marketing", modules: ["marketing"] },
    { id: "publishing", label: "Publishing Calendar", icon: CalendarDays, section: "Marketing", modules: ["marketing"] },
    { id: "calendar", label: "Project Calendar", icon: CalendarDays, section: "Planning", modules: ["marketing", "board_projects"] },
    { id: "board", label: "Board Projects", icon: ClipboardList, section: "Planning", modules: ["board_projects"] },
    { id: "volunteers", label: "Volunteers", icon: HeartHandshake, section: "Operations", modules: ["volunteers"] },
    { id: "subs", label: "Sub Requests", icon: ArrowLeftRight, section: "Operations", modules: ["subs"] },
    { id: "events", label: "Events", icon: Ticket, section: "Operations", modules: ["events"] },
    { id: "elections", label: "Elections", icon: Vote, section: "Operations", modules: ["elections"] },
    { id: "gala", label: "Gala", icon: PartyPopper, section: "Operations", modules: ["gala"] },
    { id: "user-access", label: "User Access", icon: Users, section: "Admin", superuserOnly: true },
    { id: "admin", label: "Admin Overview", icon: ShieldCheck, section: "Admin", modules: ["marketing"], adminOnly: true },
  ];

  let activeView = "workspace";
  let sidebarOpen = false;
  let sidebarCollapsed = false;
  let supabase;
  let user = null;
  let profile = null;
  let moduleGrants = [];
  let dashboardPath = DASHBOARD_PATH;
  let projects = [];
  let projectUpdatesById = {};
  let latestProjects = [];
  let projectsByStatus = {};
  let statusCounts = {};
  let teamMembers = [];
  let isLoading = true;
  let projectsLoading = false;
  let workspaceRefreshKey = 0;
  let calendarRefreshKey = 0;
  let publishingRefreshKey = 0;
  let adminRefreshKey = 0;
  let userAccessRefreshKey = 0;
  let boardRefreshKey = 0;
  let eventsRefreshKey = 0;
  let volunteersRefreshKey = 0;
  let subsRefreshKey = 0;
  let electionsRefreshKey = 0;
  let galaRefreshKey = 0;
  let selectedKanbanProject = null;
  let publishScheduleProject = null;
  let publishScheduleStatus = "";
  let publishScheduleSaving = false;
  let publishScheduleError = "";
  let kanbanScroller;
  let activeKanbanIndex = 0;
  let kanbanScrollRaf = 0;
  let draggedProjectId = "";
  let dragOverStatus = "";
  let movingProjectId = "";
  let statusMoveError = "";
  let signingOut = false;
  let errorMessage = SUPABASE_CONFIG_ERROR;
  let projectError = "";

  $: isAdmin = isOperationalAdmin(profile);
  $: visibleNavItems = navItems.filter((item) => canSeeNavItem(item, profile, moduleGrants));
  $: navSections = visibleNavItems.reduce((sections, item) => {
    const lastSection = sections[sections.length - 1];

    if (lastSection && lastSection.title === item.section) {
      lastSection.items.push(item);
    } else {
      sections.push({ title: item.section, items: [item] });
    }
    return sections;
  }, []);
  $: canViewActive = visibleNavItems.some((item) => item.id === activeView);
  $: activeNavItem =
    navItems.find((item) => item.id === activeView) || visibleNavItems[0];
  $: latestProjects = projects.map(getLatestProject);
  $: projectsByStatus = latestProjects.reduce((groups, project) => {
    const status = project.status || "Ready for Production";

    groups[status] = [...(groups[status] || []), project];
    return groups;
  }, {});
  $: statusCounts = statuses.reduce((counts, status) => {
    counts[status] = projectsByStatus[status]?.length || 0;
    return counts;
  }, {});

  onMount(() => {
    if (SUPABASE_CONFIG_ERROR) {
      isLoading = false;
      return;
    }

    supabase = getSupabaseClient();
    dashboardPath = window.location.pathname.replace(/\/+$/, "") || DASHBOARD_PATH;
    setInitialViewFromHash();
    initializeDashboard();
    window.addEventListener("hashchange", syncViewFromHash);

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        redirectToLogin();
      }
    });

    return () => {
      window.removeEventListener("hashchange", syncViewFromHash);
      data.subscription.unsubscribe();
    };
  });

  async function initializeDashboard() {
    isLoading = true;
    errorMessage = "";

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      errorMessage = error.message;
      isLoading = false;
      return;
    }

    if (!data.session) {
      redirectToLogin();
      return;
    }

    user = data.session.user;
    await Promise.all([
      loadProfile(),
      loadGrants(),
      loadProjects(),
      loadTeamMembers(),
    ]);

    // If the default view isn't granted (and the user didn't deep-link it),
    // land on their first granted view instead.
    const hashView = window.location.hash.replace("#", "");
    if (
      !visibleNavItems.some((item) => item.id === activeView) &&
      hashView !== activeView
    ) {
      activeView = visibleNavItems[0]?.id || "workspace";
    }

    isLoading = false;
  }

  async function loadGrants() {
    moduleGrants = await loadModuleGrants(supabase, user.id);
  }

  function canSeeNavItem(item, currentProfile, grants) {
    if (item.superuserOnly) return isSuperuser(currentProfile);
    if (item.adminOnly) {
      return (
        isOperationalAdmin(currentProfile) &&
        (!item.modules?.length ||
          item.modules.some((moduleKey) =>
            hasModule(currentProfile, grants, moduleKey),
          ))
      );
    }
    if (!item.modules?.length) return true;

    return item.modules.some((moduleKey) =>
      hasModule(currentProfile, grants, moduleKey),
    );
  }

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      errorMessage = error.message;
      return;
    }

    profile =
      data || {
        id: user.id,
        email: user.email,
        full_name: user.email?.split("@")[0] || "Team member",
        role: "member",
      };
  }

  async function loadProjects() {
    projectsLoading = true;
    projectError = "";

    const { data, error } = await supabase
      .from("projects")
      .select(
        "id,title,priority,status,deadline,publish_date,details_url,copy_approved,files_url,deliverables_url,assigned_to,edit_notes,channel_tags,source,intake_reviewed,intake_submitted_at",
      )
      .order("deadline", { ascending: true });

    if (error) {
      projectError = error.message;
    } else {
      projects = data || [];
      projectUpdatesById = {};
    }

    projectsLoading = false;
  }

  async function loadTeamMembers() {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .order("full_name", { ascending: true, nullsFirst: false });

    if (error) {
      projectError = error.message;
      teamMembers = [];
      return;
    }

    teamMembers = (data || []).filter((member) => member.email);
  }

  async function handleSignOut() {
    signingOut = true;
    errorMessage = "";

    const { error } = await supabase.auth.signOut();

    if (error) {
      errorMessage = error.message;
      signingOut = false;
      return;
    }

    window.location.assign(LOGIN_PATH);
  }

  function redirectToLogin() {
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(`${LOGIN_PATH}?redirectTo=${encodeURIComponent(currentPath)}`);
  }

  function setInitialViewFromHash() {
    const hashView = window.location.hash.replace("#", "");
    if (navItems.some((item) => item.id === hashView)) {
      activeView = hashView;
    }
  }

  function syncViewFromHash() {
    const hashView = window.location.hash.replace("#", "");
    const nextView = navItems.some((item) => item.id === hashView)
      ? hashView
      : visibleNavItems[0]?.id || "workspace";

    activeView = nextView;
    sidebarOpen = false;
  }

  function setActiveView(view, updateHash = true) {
    activeView = view;
    sidebarOpen = false;

    if (updateHash) {
      window.history.replaceState(null, "", `${dashboardPath}#${view}`);
    }
  }

  function refreshActiveView() {
    const refreshers = {
      workspace: () => (workspaceRefreshKey += 1),
      calendar: () => (calendarRefreshKey += 1),
      publishing: () => (publishingRefreshKey += 1),
      board: () => (boardRefreshKey += 1),
      events: () => (eventsRefreshKey += 1),
      volunteers: () => (volunteersRefreshKey += 1),
      subs: () => (subsRefreshKey += 1),
      elections: () => (electionsRefreshKey += 1),
      gala: () => (galaRefreshKey += 1),
      "user-access": () => (userAccessRefreshKey += 1),
      admin: () => {
        adminRefreshKey += 1;
        loadProjects();
      },
    };

    (refreshers[activeView] || loadProjects)();
  }

  function getKanbanColumns() {
    return Array.from(kanbanScroller?.querySelectorAll("[data-kanban-column]") || []);
  }

  function clampKanbanIndex(index) {
    return Math.max(0, Math.min(statuses.length - 1, index));
  }

  function scrollKanbanToIndex(index) {
    const nextIndex = clampKanbanIndex(index);
    const columns = getKanbanColumns();
    const firstColumn = columns[0];
    const column = columns[nextIndex];

    if (!kanbanScroller || !firstColumn || !column) return;

    activeKanbanIndex = nextIndex;
    kanbanScroller.scrollTo({
      left: column.offsetLeft - firstColumn.offsetLeft,
      behavior: "smooth",
    });
    kanbanScroller?.focus({ preventScroll: true });
  }

  function handleKanbanScroll() {
    if (!kanbanScroller) return;

    if (kanbanScrollRaf) {
      window.cancelAnimationFrame(kanbanScrollRaf);
    }

    kanbanScrollRaf = window.requestAnimationFrame(() => {
      const columns = getKanbanColumns();
      const scrollerRect = kanbanScroller.getBoundingClientRect();
      const paddingLeft = parseFloat(getComputedStyle(kanbanScroller).paddingLeft) || 0;
      const snapLeft = scrollerRect.left + paddingLeft;
      let nextIndex = activeKanbanIndex;
      let closestDistance = Number.POSITIVE_INFINITY;

      columns.forEach((column, index) => {
        const distance = Math.abs(column.getBoundingClientRect().left - snapLeft);

        if (distance < closestDistance) {
          closestDistance = distance;
          nextIndex = index;
        }
      });

      activeKanbanIndex = nextIndex;
      kanbanScrollRaf = 0;
    });
  }

  function shouldIgnoreKanbanKeyTarget(target) {
    return (
      target instanceof HTMLElement &&
      target.matches("input, textarea, select, button, a, [contenteditable='true']")
    );
  }

  function handleKanbanArrowKey(event) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      shouldIgnoreKanbanKeyTarget(event.target)
    ) {
      return false;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollKanbanToIndex(activeKanbanIndex - 1);
      return true;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollKanbanToIndex(activeKanbanIndex + 1);
      return true;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      scrollActiveKanbanColumn(event.key === "ArrowDown" ? 1 : -1);
      return true;
    }

    return false;
  }

  function handleKanbanKeydown(event) {
    handleKanbanArrowKey(event);
  }

  function handleWindowKanbanKeydown(event) {
    if (
      activeView !== "kanban" ||
      selectedKanbanProject ||
      !kanbanScroller ||
      event.defaultPrevented
    ) {
      return;
    }

    handleKanbanArrowKey(event);
  }

  function scrollActiveKanbanColumn(direction) {
    const activeColumn = getKanbanColumns()[activeKanbanIndex];
    const list = activeColumn?.querySelector("[data-kanban-column-list]");

    list?.scrollBy({
      top: direction * Math.max(180, list.clientHeight * 0.72),
      behavior: "smooth",
    });
  }

  function getProjectById(projectId) {
    return latestProjects.find((project) => project.id === projectId);
  }

  function canMoveProjectToStatus(project, targetStatus) {
    if (!project?.id || !targetStatus || project.status === targetStatus) return false;
    if (isAdmin) return true;

    return (
      memberMovableStatuses.includes(project.status) &&
      memberMovableStatuses.includes(targetStatus)
    );
  }

  function canStartProjectDrag(project) {
    if (!project?.id || movingProjectId === project.id) return false;
    if (isAdmin) return true;

    return memberMovableStatuses.includes(project.status);
  }

  function canDropDraggedProject(targetStatus) {
    const draggedProject = getProjectById(draggedProjectId);

    return canMoveProjectToStatus(draggedProject, targetStatus);
  }

  function handleProjectDragStart(event, project) {
    const latestProject = getLatestProject(project);

    if (!canStartProjectDrag(latestProject)) {
      event.preventDefault();
      return;
    }

    draggedProjectId = latestProject.id;
    statusMoveError = "";

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-lsp-project-id", latestProject.id);
    event.dataTransfer.setData("text/plain", latestProject.id);
  }

  function handleProjectDragEnd() {
    draggedProjectId = "";
    dragOverStatus = "";
  }

  function handleColumnDragOver(event, status) {
    if (!draggedProjectId || !canDropDraggedProject(status)) return;

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

    const projectId =
      event.dataTransfer.getData("application/x-lsp-project-id") ||
      event.dataTransfer.getData("text/plain") ||
      draggedProjectId;
    const project = getProjectById(projectId);

    draggedProjectId = "";
    dragOverStatus = "";

    if (!project || project.status === status) return;

    if (!canMoveProjectToStatus(project, status)) {
      statusMoveError = isAdmin
        ? "This project cannot be moved right now."
        : "Members can move projects among production, copy, review, and stuck. Admin-only lanes stay protected.";
      return;
    }

    if (shouldPromptForPublishSchedule(project, status)) {
      openPublishScheduler(project, status);
      return;
    }

    await moveProjectToStatus(project, status);
  }

  function shouldPromptForPublishSchedule(project, targetStatus) {
    return (
      isAdmin &&
      targetStatus === "Ready to Publish" &&
      project?.status !== targetStatus
    );
  }

  function openPublishScheduler(project, targetStatus) {
    publishScheduleProject = getLatestProject(project);
    publishScheduleStatus = targetStatus;
    publishScheduleError = "";
    statusMoveError = "";
  }

  function closePublishScheduler() {
    if (publishScheduleSaving) return;

    publishScheduleProject = null;
    publishScheduleStatus = "";
    publishScheduleError = "";
  }

  async function confirmPublishSchedule(date) {
    if (!publishScheduleProject || !publishScheduleStatus || publishScheduleSaving) return;

    publishScheduleSaving = true;
    publishScheduleError = "";

    const result = await moveProjectToStatus(
      publishScheduleProject,
      publishScheduleStatus,
      { publish_date: date },
    );

    publishScheduleSaving = false;

    if (result?.error) {
      publishScheduleError = result.error.message;
      return;
    }

    closePublishScheduler();
  }

  async function moveProjectToStatus(project, status, extraUpdates = {}) {
    const previousProject = getLatestProject(project);
    const optimisticProject = {
      ...previousProject,
      status,
      ...extraUpdates,
    };
    const updatePayload = {
      status,
      ...extraUpdates,
    };

    movingProjectId = project.id;
    statusMoveError = "";
    handleProjectUpdated(optimisticProject);

    const { data, error } = await supabase
      .from("projects")
      .update(updatePayload)
      .eq("id", project.id)
      .select(projectSelectColumns)
      .single();

    if (error) {
      statusMoveError = error.message;
      handleProjectUpdated(previousProject);
      movingProjectId = "";
      return { error };
    }

    handleProjectUpdated(data);
    movingProjectId = "";
    return { data };
  }

  function openKanbanProjectDetails(project) {
    if (draggedProjectId) return;

    selectedKanbanProject = getLatestProject(project);
  }

  function handleProjectUpdated(updatedProject) {
    if (!updatedProject?.id) return;

    const existingProject =
      projects.find((project) => project.id === updatedProject.id) ||
      selectedKanbanProject ||
      {};
    const latestProject = {
      ...existingProject,
      ...(projectUpdatesById[updatedProject.id] || {}),
      ...updatedProject,
    };
    let foundProject = false;

    projectUpdatesById = {
      ...projectUpdatesById,
      [updatedProject.id]: latestProject,
    };

    projects = projects.map((project) => {
      if (project.id !== updatedProject.id) return project;

      foundProject = true;
      return latestProject;
    });

    if (!foundProject) {
      projects = [latestProject, ...projects];
    }

    if (selectedKanbanProject?.id === updatedProject.id) {
      selectedKanbanProject = {
        ...selectedKanbanProject,
        ...latestProject,
      };
    }

    workspaceRefreshKey += 1;
    calendarRefreshKey += 1;
    publishingRefreshKey += 1;
    adminRefreshKey += 1;
  }

  function getLatestProject(project) {
    if (!project?.id) return project;

    return {
      ...project,
      ...(projectUpdatesById[project.id] || {}),
    };
  }

  function getDisplayName() {
    return profile?.full_name || profile?.email || user?.email || "Team member";
  }

  function toggleSidebarCollapsed() {
    sidebarCollapsed = !sidebarCollapsed;
  }
</script>

<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<svelte:window onkeydown={handleWindowKanbanKeydown} />

<main class="min-h-screen bg-[#f7f7f4] text-[#1E1E1E]">
  {#if isLoading}
    <div class="flex min-h-screen items-center justify-center px-4">
      <div class="flex items-center gap-3 rounded-md border border-black/10 bg-white px-5 py-4 text-sm text-gray-600 shadow-sm">
        <span
          class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin"
          aria-hidden="true"
        ></span>
        Loading dashboard
      </div>
    </div>
  {:else if errorMessage}
    <div class="flex min-h-screen items-center justify-center px-4">
      <section class="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-sm" role="alert">
        <div class="flex items-start gap-3 text-red-800">
          <AlertCircle class="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <h1 class="text-lg font-bold">Dashboard unavailable</h1>
            <p class="mt-2 text-sm leading-6">{errorMessage}</p>
          </div>
        </div>
      </section>
    </div>
  {:else}
    {#if sidebarOpen}
      <button
        type="button"
        class="fixed inset-0 z-30 bg-black/35 lg:hidden"
        aria-label="Close navigation"
        onclick={() => (sidebarOpen = false)}
      ></button>
    {/if}

    <div class="min-h-screen lg:flex">
      <aside
        class="fixed inset-y-0 left-0 z-40 w-[min(18rem,86vw)] transform border-r border-black/10 bg-[#1E1E1E] text-white transition-[transform,width] duration-200 lg:translate-x-0 lg:transform-none {sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'} {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}"
        aria-label="Dashboard navigation"
      >
        <div class="flex h-full min-h-dvh flex-col">
          <div class="flex items-center justify-between border-b border-white/10 px-5 py-5 {sidebarCollapsed ? 'lg:px-3' : ''}">
            <div class="min-w-0 {sidebarCollapsed ? 'lg:text-center' : ''}">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffbd59] {sidebarCollapsed ? 'lg:tracking-normal' : ''}">
                LSP
              </p>
              <h1 class="mt-1 text-lg font-bold {sidebarCollapsed ? 'lg:hidden' : ''}">
                Dashboard
              </h1>
            </div>
            <button
              type="button"
              class="hidden rounded-md p-2 text-white/72 transition hover:bg-white/10 hover:text-white lg:inline-flex"
              aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
              onclick={toggleSidebarCollapsed}
            >
              {#if sidebarCollapsed}
                <PanelLeftOpen class="h-5 w-5" aria-hidden="true" />
              {:else}
                <PanelLeftClose class="h-5 w-5" aria-hidden="true" />
              {/if}
            </button>
            <button
              type="button"
              class="rounded-md p-2 text-white/72 transition hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Close navigation"
              onclick={() => (sidebarOpen = false)}
            >
              <X class="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <nav class="flex-1 space-y-4 overflow-y-auto px-3 py-4">
            {#each navSections as section}
              <div>
                {#if section.title}
                  <p class="px-3 pb-1 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-white/40 {sidebarCollapsed ? 'lg:hidden' : ''}">
                    {section.title}
                  </p>
                {/if}
                <div class="space-y-1">
                  {#each section.items as item}
                    {@const Icon = item.icon}
                    <a
                      href={`#${item.id}`}
                      class="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition {sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''} {activeView === item.id ? 'bg-[#ffbd59] text-[#1E1E1E]' : 'text-white/74 hover:bg-white/10 hover:text-white'}"
                      aria-current={activeView === item.id ? "page" : undefined}
                      title={item.label}
                    >
                      <Icon class="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span class="{sidebarCollapsed ? 'lg:hidden' : ''}">{item.label}</span>
                    </a>
                  {/each}
                </div>
              </div>
            {/each}
          </nav>

          <div class="mt-auto border-t border-white/10 p-4 {sidebarCollapsed ? 'lg:px-3' : ''}">
            <div class="mb-3 flex items-center gap-3 rounded-md bg-white/7 px-3 py-3 {sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}">
              <UserCircle class="h-8 w-8 shrink-0 text-[#ffbd59]" aria-hidden="true" />
              <div class="min-w-0 {sidebarCollapsed ? 'lg:hidden' : ''}">
                <p class="truncate text-sm font-bold">{getDisplayName()}</p>
                <p class="truncate text-xs capitalize text-white/58">{profile?.role || "member"}</p>
              </div>
            </div>
            <button
              type="button"
              class="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-white/15 px-3 text-sm font-bold text-white/82 transition hover:border-red-300/40 hover:bg-red-500/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#ffbd59] disabled:cursor-not-allowed disabled:opacity-60 {sidebarCollapsed ? 'lg:px-0' : ''}"
              onclick={handleSignOut}
              disabled={signingOut}
              title="Sign Out"
            >
              {#if signingOut}
                <span class="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true"></span>
                <span class="{sidebarCollapsed ? 'lg:hidden' : ''}">Signing out</span>
              {:else}
                <LogOut class="h-4 w-4" aria-hidden="true" />
                <span class="{sidebarCollapsed ? 'lg:hidden' : ''}">Sign Out</span>
              {/if}
            </button>
          </div>
        </div>
      </aside>

      <section class="min-w-0 flex-1 transition-[margin] duration-200 {sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}">
        <header class="sticky top-0 z-20 border-b border-black/10 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <button
                type="button"
                class="rounded-md border border-black/10 bg-white p-2 text-[#1E1E1E] shadow-sm lg:hidden"
                aria-label="Open navigation"
                onclick={() => (sidebarOpen = true)}
              >
                <Menu class="h-5 w-5" aria-hidden="true" />
              </button>
              <div class="min-w-0">
                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#0f766e]">
                  Dashboard
                </p>
                <h2 class="truncate text-xl font-bold md:text-2xl">
                  {activeNavItem?.label || "Dashboard"}
                </h2>
              </div>
            </div>

            <button
              type="button"
              class="hidden min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold shadow-sm transition hover:border-[#0f766e]/30 hover:text-[#0f766e] sm:flex"
              onclick={refreshActiveView}
              disabled={activeView !== "workspace" && projectsLoading}
            >
              <RefreshCw class="h-4 w-4 {projectsLoading ? 'animate-spin' : ''}" aria-hidden="true" />
              Refresh
            </button>
          </div>
        </header>

        <div class="px-4 py-5 md:px-6 md:py-6">
          {#if projectError}
            <div class="mb-4 flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{projectError}</span>
            </div>
          {/if}

          {#if statusMoveError}
            <div class="mb-4 flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{statusMoveError}</span>
            </div>
          {/if}

          {#if !canViewActive}
            <Panel title="No access" id="no-access-title">
              <div class="flex items-start gap-3 text-gray-700">
                <Lock class="mt-1 h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
                <div>
                  <p class="text-sm leading-6">
                    You don't have access to this section yet. A superuser can grant
                    module access from User Access.
                  </p>
                  {#if visibleNavItems.length}
                    <a
                      class="mt-3 inline-flex min-h-10 items-center rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833]"
                      href={`#${visibleNavItems[0].id}`}
                    >
                      Go to {visibleNavItems[0].label}
                    </a>
                  {/if}
                </div>
              </div>
            </Panel>
          {:else if activeView === "workspace"}
            <Workspace
              {supabase}
              email={profile?.email || user?.email}
              refreshKey={workspaceRefreshKey}
              onProjectUpdated={handleProjectUpdated}
            />
          {:else if activeView === "kanban"}
            <section aria-labelledby="kanban-title">
              <Panel title="Kanban Board" id="kanban-title" loading={projectsLoading}>
                <div class="mb-3 flex flex-col gap-3 rounded-md border border-black/10 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div class="min-w-0">
                    <p class="text-xs font-bold uppercase tracking-[0.12em] text-[#0f766e]">
                      Swipe or use arrow keys
                    </p>
                    <p class="mt-1 text-sm font-semibold text-gray-700" aria-live="polite">
                      {statuses[activeKanbanIndex]} · {activeKanbanIndex + 1} of {statuses.length}
                    </p>
                  </div>

                  <div class="flex items-center justify-between gap-3 sm:justify-end">
                    <button
                      type="button"
                      class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-black/10 bg-white text-[#1E1E1E] shadow-sm transition hover:border-[#0f766e]/40 hover:text-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label="Show previous Kanban column"
                      onclick={() => scrollKanbanToIndex(activeKanbanIndex - 1)}
                      disabled={activeKanbanIndex === 0}
                    >
                      <ChevronLeft class="h-5 w-5" aria-hidden="true" />
                    </button>

                    <div class="flex items-center gap-1.5" aria-label="Kanban column position">
                      {#each statuses as status, index}
                        <button
                          type="button"
                          class="h-2.5 rounded-full transition focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 {activeKanbanIndex === index ? 'w-6 bg-[#0f766e]' : 'w-2.5 bg-gray-300 hover:bg-gray-400'}"
                          aria-label={`Show ${status}`}
                          aria-current={activeKanbanIndex === index ? "true" : undefined}
                          onclick={() => scrollKanbanToIndex(index)}
                        ></button>
                      {/each}
                    </div>

                    <button
                      type="button"
                      class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-black/10 bg-white text-[#1E1E1E] shadow-sm transition hover:border-[#0f766e]/40 hover:text-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label="Show next Kanban column"
                      onclick={() => scrollKanbanToIndex(activeKanbanIndex + 1)}
                      disabled={activeKanbanIndex === statuses.length - 1}
                    >
                      <ChevronRight class="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div
                  bind:this={kanbanScroller}
                  class="kanban-scroll -mx-4 overflow-x-auto px-4 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] focus-visible:ring-offset-2 md:-mx-6 md:px-6"
                  tabindex="0"
                  aria-label="Scrollable Kanban columns. Use left and right arrows to move columns, and up and down arrows to scroll the active column."
                  onscroll={handleKanbanScroll}
                  onkeydown={handleKanbanKeydown}
                >
                  <div class="kanban-track grid gap-3">
                    {#each statuses as status}
                      <div
                        class="snap-start flex h-[calc(100dvh-17rem)] min-h-[30rem] max-h-[46rem] flex-col rounded-md border border-black/10 bg-gray-50 p-3 transition {dragOverStatus === status ? 'border-[#0f766e] bg-teal-50 ring-2 ring-[#0f766e]/20' : ''} {draggedProjectId && !canDropDraggedProject(status) ? 'opacity-75' : ''}"
                        data-kanban-column
                        ondragover={(event) => handleColumnDragOver(event, status)}
                        ondragleave={(event) => handleColumnDragLeave(event, status)}
                        ondrop={(event) => handleColumnDrop(event, status)}
                      >
                        <div class="mb-3 flex min-h-10 shrink-0 items-start justify-between gap-2">
                          <div class="min-w-0">
                            <h3 class="text-sm font-bold leading-tight">{status}</h3>
                            {#if !isAdmin && !memberMovableStatuses.includes(status)}
                              <span class="mt-1 inline-flex rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-gray-500">
                                Admin lane
                              </span>
                            {/if}
                          </div>
                          <div class="flex items-center gap-2">
                            {#if dragOverStatus === status}
                              <span class="rounded-full bg-[#0f766e] px-2 py-0.5 text-xs font-bold text-white">
                                Drop
                              </span>
                            {/if}
                            <span class="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-gray-600">
                              {statusCounts[status] || 0}
                            </span>
                          </div>
                        </div>
                        <div
                          class="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1"
                          aria-label={`${status} projects`}
                          data-kanban-column-list
                        >
                          {#each projectsByStatus[status] || [] as project}
                            <ProjectCard
                              {project}
                              compact={true}
                              draggable={canStartProjectDrag(project)}
                              isMoving={movingProjectId === project.id}
                              onSelect={openKanbanProjectDetails}
                              onDragStart={handleProjectDragStart}
                              onDragEnd={handleProjectDragEnd}
                            />
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
              </Panel>
            </section>
          {:else if activeView === "calendar"}
            <UnifiedCalendarView
              {supabase}
              refreshKey={calendarRefreshKey}
              {teamMembers}
              currentUserEmail={profile?.email || user?.email}
              currentUserRole={profile?.role || "member"}
              availableStatuses={statuses}
              scheduleProjects={latestProjects}
              showMarketing={canSeeNavItem(
                { modules: ["marketing"] },
                profile,
                moduleGrants,
              )}
              showBoard={canSeeNavItem(
                { modules: ["board_projects"] },
                profile,
                moduleGrants,
              )}
              onProjectUpdated={handleProjectUpdated}
            />
          {:else if activeView === "board"}
            <BoardProjectsView
              {supabase}
              {profile}
              {teamMembers}
              refreshKey={boardRefreshKey}
            />
          {:else if activeView === "events"}
            <EventsView
              {supabase}
              {profile}
              refreshKey={eventsRefreshKey}
            />
          {:else if activeView === "volunteers"}
            <VolunteersView
              {supabase}
              {profile}
              refreshKey={volunteersRefreshKey}
            />
          {:else if activeView === "subs"}
            <SubsView
              {supabase}
              {profile}
              refreshKey={subsRefreshKey}
            />
          {:else if activeView === "elections"}
            <ElectionsView
              {supabase}
              {profile}
              refreshKey={electionsRefreshKey}
            />
          {:else if activeView === "gala"}
            <GalaView
              {supabase}
              {profile}
              refreshKey={galaRefreshKey}
            />
          {:else if activeView === "publishing"}
            <PublishingCalendarView
              {supabase}
              refreshKey={publishingRefreshKey}
              {teamMembers}
              currentUserEmail={profile?.email || user?.email}
              currentUserRole={profile?.role || "member"}
              availableStatuses={statuses}
              scheduleProjects={latestProjects}
              onProjectUpdated={handleProjectUpdated}
            />
          {:else if activeView === "admin"}
            <AdminOverview
              {supabase}
              {profile}
              refreshKey={adminRefreshKey}
              onProjectsChanged={loadProjects}
            />
          {:else if activeView === "user-access"}
            <UserAccessView
              {supabase}
              {profile}
              refreshKey={userAccessRefreshKey}
            />
          {/if}
        </div>
      </section>
    </div>

    <ProjectDetailDrawer
      {supabase}
      project={selectedKanbanProject}
      {teamMembers}
      currentUserEmail={profile?.email || user?.email}
      currentUserRole={profile?.role || "member"}
      availableStatuses={statuses}
      scheduleProjects={latestProjects}
      eyebrow="Kanban project"
      onClose={() => (selectedKanbanProject = null)}
      onProjectUpdated={handleProjectUpdated}
    />

    <PublishScheduleDialog
      open={Boolean(publishScheduleProject)}
      project={publishScheduleProject}
      projects={latestProjects}
      initialDate={publishScheduleProject?.publish_date || ""}
      isSaving={publishScheduleSaving}
      errorMessage={publishScheduleError}
      onCancel={closePublishScheduler}
      onConfirm={confirmPublishSchedule}
    />
  {/if}
</main>

<style>
  .kanban-scroll {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scroll-padding-inline: 1rem;
    scroll-snap-type: x mandatory;
  }

  .kanban-track {
    grid-auto-columns: 100%;
    grid-auto-flow: column;
  }

  @media (min-width: 768px) {
    .kanban-scroll {
      scroll-padding-inline: 1.5rem;
    }

    .kanban-track {
      grid-auto-columns: calc((100% - 0.75rem) / 2);
    }
  }

  @media (min-width: 1280px) {
    .kanban-track {
      grid-auto-columns: calc((100% - 2.25rem) / 4);
    }
  }
</style>
