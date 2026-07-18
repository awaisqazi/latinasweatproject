<script>
  import { onMount, tick } from "svelte";
  import {
    AlertCircle,
    ArrowLeftRight,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    DoorOpen,
    HandCoins,
    HeartHandshake,
    Home,
    Kanban,
    Lock,
    LogOut,
    Menu,
    MessageSquare,
    Package,
    PanelLeftClose,
    PanelLeftOpen,
    PartyPopper,
    Plus,
    RefreshCw,
    Search,
    ShieldCheck,
    Ticket,
    UserPlus,
    Users,
    Vote,
    X,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import { LayoutList, SquareKanban } from "@lucide/svelte";
  import {
    getSupabaseClient,
    SUPABASE_CONFIG_ERROR,
  } from "../../../lib/supabaseClient";
  import { hasModule, loadModuleGrants } from "../../../lib/dashboard/permissions";
  import { isOperationalAdmin, isSuperuser } from "../../../lib/dashboard/roles";
  import { subscribeDashboardRealtime } from "../../../lib/dashboard/realtime";
  import { countMyOpenTasks } from "../../../lib/dashboard/workspaceTasks";
  import { getSetting, FEEDBACK_RECIPIENT_KEY } from "../../../lib/dashboard/appSettings";
  import AdminOverview from "./AdminOverview.svelte";
  import AssignTaskDialog from "./AssignTaskDialog.svelte";
  import FeedbackDialog from "./FeedbackDialog.svelte";
  import ProjectCard from "./ProjectCard.svelte";
  import ProjectDetailDrawer from "./ProjectDetailDrawer.svelte";
  import ProjectCreateDrawer from "./ProjectCreateDrawer.svelte";
  import PublishingCalendarView from "./PublishingCalendarView.svelte";
  import PublishScheduleDialog from "./PublishScheduleDialog.svelte";
  import UserAccessView from "./UserAccessView.svelte";
  import Workspace from "./Workspace.svelte";
  import UnifiedCalendarView from "../dashboard/UnifiedCalendarView.svelte";
  import BoardProjectsView from "../board/BoardProjectsView.svelte";
  import EventsView from "../events/EventsView.svelte";
  import FundraisingView from "../fundraising/FundraisingView.svelte";
  import VolunteersView from "../volunteers/VolunteersView.svelte";
  import SubsView from "../subs/SubsView.svelte";
  import ElectionsView from "../elections/ElectionsView.svelte";
  import GalaView from "../gala/GalaView.svelte";
  import SpacesView from "../spaces/SpacesView.svelte";
  import InventoryView from "../inventory/InventoryView.svelte";

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
    "id,title,priority,status,deadline,publish_date,details_url,copy_approved,files_url,deliverables_url,assigned_to,edit_notes,channel_tags,source,intake_reviewed,intake_submitted_at,updated_at";

  const navItems = [
    { id: "workspace", label: "Workspace", icon: Home, section: "Home" },
    { id: "kanban", label: "Kanban", icon: Kanban, section: "Marketing", modules: ["marketing"] },
    { id: "publishing", label: "Marketing Calendar", icon: CalendarDays, section: "Marketing", modules: ["marketing"] },
    { id: "admin", label: "Marketing Admin", icon: ShieldCheck, section: "Marketing", modules: ["marketing"], adminOnly: true },
    { id: "calendar", label: "Project Calendar", icon: CalendarDays, section: "Planning", modules: ["marketing", "board_projects"] },
    { id: "board", label: "Board Projects", icon: ClipboardList, section: "Planning", modules: ["board_projects"] },
    { id: "volunteers", label: "Volunteers", icon: HeartHandshake, section: "Operations", modules: ["volunteers"] },
    { id: "subs", label: "Sub Requests", icon: ArrowLeftRight, section: "Operations", modules: ["subs"] },
    { id: "events", label: "Events", icon: Ticket, section: "Operations", modules: ["events"] },
    { id: "elections", label: "Elections", icon: Vote, section: "Operations", modules: ["elections"] },
    { id: "gala", label: "Gala", icon: PartyPopper, section: "Operations", modules: ["gala"] },
    { id: "fundraising", label: "Fundraising", icon: HandCoins, section: "Operations", modules: ["fundraising"] },
    { id: "spaces", label: "Studio Spaces", icon: DoorOpen, section: "Operations", modules: ["spaces"] },
    { id: "inventory", label: "Inventory", icon: Package, section: "Operations", modules: ["inventory"] },
    { id: "user-access", label: "User Access", icon: Users, section: "Admin", superuserOnly: true },
  ];

  let activeView = "workspace";
  let sidebarOpen = false;
  let sidebarCollapsed = false;
  let supabase;
  let user = null;
  let profile = null;
  let moduleGrants = [];
  let grantsError = "";
  let grantsLoading = false;
  let assignTaskOpen = false;
  let assignTaskPrefill = null;
  let workspaceTaskCount = 0;
  let feedbackOpen = false;
  let feedbackRecipientId = "";
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
  let fundraisingRefreshKey = 0;
  let spacesRefreshKey = 0;
  let inventoryRefreshKey = 0;
  let selectedKanbanProject = null;
  let createDrawerOpen = false;
  let publishScheduleProject = null;
  let publishScheduleStatus = "";
  let publishScheduleSaving = false;
  let publishScheduleError = "";
  let kanbanScroller;
  let activeKanbanIndex = 0;
  let kanbanScrollRaf = 0;
  let kanbanViewMode = "kanban"; // "kanban" | "list"
  let kanbanSearch = "";
  let kanbanStatusFilter = "all";
  let kanbanPriorityFilter = "all";
  let kanbanAssigneeFilter = "all";
  let kanbanChannelFilter = "all";
  let kanbanCopyFilter = "all";
  const KANBAN_VIEW_TABS = [
    { id: "kanban", label: "Kanban", icon: SquareKanban },
    { id: "list", label: "List", icon: LayoutList },
  ];
  let draggedProjectId = "";
  let dragOverStatus = "";
  let movingProjectId = "";
  let statusMoveError = "";
  let signingOut = false;
  let errorMessage = SUPABASE_CONFIG_ERROR;
  let projectError = "";

  $: isAdmin = isOperationalAdmin(profile);
  $: feedbackRecipient = teamMembers.find((member) => member.id === feedbackRecipientId);
  $: feedbackRecipientName = feedbackRecipient?.full_name || feedbackRecipient?.email || "";
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

  // ── Kanban search + filters (apply to both Kanban and List views) ──
  $: kanbanAssigneeOptions = Array.from(
    new Set(latestProjects.flatMap((project) => project.assigned_to || []).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  $: kanbanChannelOptions = Array.from(
    new Set(latestProjects.flatMap((project) => project.channel_tags || []).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  $: hasKanbanFilters =
    Boolean(kanbanSearch.trim()) ||
    kanbanStatusFilter !== "all" ||
    kanbanPriorityFilter !== "all" ||
    kanbanAssigneeFilter !== "all" ||
    kanbanChannelFilter !== "all" ||
    kanbanCopyFilter !== "all";
  // Pass every filter as an argument so the reactive block tracks them all.
  $: filteredKanbanProjects = filterKanbanProjects(
    latestProjects,
    kanbanSearch,
    kanbanStatusFilter,
    kanbanPriorityFilter,
    kanbanAssigneeFilter,
    kanbanChannelFilter,
    kanbanCopyFilter,
  );
  $: filteredByStatus = statuses.reduce((groups, status) => {
    groups[status] = filteredKanbanProjects.filter((project) => project.status === status);
    return groups;
  }, {});
  $: filteredKanbanList = [...filteredKanbanProjects].sort((a, b) => {
    const sa = statuses.indexOf(a.status);
    const sb = statuses.indexOf(b.status);
    const ra = sa === -1 ? 99 : sa;
    const rb = sb === -1 ? 99 : sb;
    if (ra !== rb) return ra - rb;
    return (a.deadline || "9999").localeCompare(b.deadline || "9999");
  });

  function filterKanbanProjects(list, search, statusF, priorityF, assigneeF, channelF, copyF) {
    const query = search.trim().toLowerCase();
    const assignee = assigneeF.toLowerCase();
    const channel = channelF.toLowerCase();

    return list.filter((project) => {
      if (query) {
        const haystack = [
          project.title,
          project.status,
          project.priority,
          project.edit_notes,
          ...(project.assigned_to || []),
          ...(project.channel_tags || []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (statusF !== "all" && project.status !== statusF) return false;
      if (priorityF !== "all" && (project.priority || "unset") !== priorityF) return false;
      if (
        assigneeF !== "all" &&
        !(project.assigned_to || []).some((email) => (email || "").toLowerCase() === assignee)
      ) {
        return false;
      }
      if (
        channelF !== "all" &&
        !(project.channel_tags || []).some((tag) => (tag || "").toLowerCase() === channel)
      ) {
        return false;
      }
      if (copyF === "approved" && !project.copy_approved) return false;
      if (copyF === "pending" && project.copy_approved) return false;
      return true;
    });
  }

  function clearKanbanFilters() {
    kanbanSearch = "";
    kanbanStatusFilter = "all";
    kanbanPriorityFilter = "all";
    kanbanAssigneeFilter = "all";
    kanbanChannelFilter = "all";
    kanbanCopyFilter = "all";
  }

  function kanbanPriorityTone(priority) {
    if (priority === "P0") return "red";
    if (priority === "P1") return "amber";
    return "neutral";
  }

  function kanbanStatusTone(status) {
    if (status === "Stuck") return "red";
    if (status === "In Production") return "blue";
    if (status === "Published") return "green";
    if (status && status.startsWith("Ready")) return "amber";
    return "neutral";
  }

  function kanbanAssignedBrief(project) {
    const assigned = (project.assigned_to || []).filter(Boolean);
    if (!assigned.length) return "Unassigned";
    if (assigned.length === 1) return assigned[0];
    return `${assigned[0]} +${assigned.length - 1}`;
  }

  function formatKanbanDate(project) {
    const value = project.publish_date || project.deadline;
    if (!value) return "No date";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
      new Date(`${value}T00:00:00`),
    );
  }

  onMount(() => {
    if (SUPABASE_CONFIG_ERROR) {
      isLoading = false;
      return;
    }

    supabase = getSupabaseClient();
    dashboardPath = window.location.pathname.replace(/\/+$/, "") || DASHBOARD_PATH;
    sidebarCollapsed = localStorage.getItem("lsp:sidebar-collapsed") === "1";
    setInitialViewFromHash();
    initializeDashboard();
    window.addEventListener("hashchange", syncViewFromHash);

    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    isDesktop = desktopQuery.matches;
    const handleViewportChange = (event) => {
      isDesktop = event.matches;
    };
    desktopQuery.addEventListener("change", handleViewportChange);

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        redirectToLogin();
      }
    });

    return () => {
      window.removeEventListener("hashchange", syncViewFromHash);
      desktopQuery.removeEventListener("change", handleViewportChange);
      data.subscription.unsubscribe();
      realtimeUnsubscribe?.();
      window.clearTimeout(projectKeysRealtimeTimer);
      window.clearTimeout(boardRealtimeTimer);
      window.clearTimeout(workspaceRealtimeTimer);
      window.clearTimeout(fundraisingRealtimeTimer);
    };
  });

  // ── Live updates ──────────────────────────────────────────────
  // One channel for the four collaborative tables. Merges are applied
  // immediately (the kanban derives from `projects`, so teammates' moves show
  // up in place); the heavier view refetches are debounced so a burst of
  // changes triggers one reload.
  let realtimeUnsubscribe = null;
  let projectKeysRealtimeTimer = 0;
  let boardRealtimeTimer = 0;
  let workspaceRealtimeTimer = 0;
  let fundraisingRealtimeTimer = 0;

  function startRealtime() {
    realtimeUnsubscribe?.();
    realtimeUnsubscribe = subscribeDashboardRealtime(supabase, {
      onProjects: handleProjectsRealtime,
      onBoard: scheduleBoardRealtimeRefresh,
      onWorkspace: scheduleWorkspaceRealtimeRefresh,
      onFundraising: scheduleFundraisingRealtimeRefresh,
    });
  }

  function handleProjectsRealtime(payload) {
    if (payload.eventType === "DELETE") {
      const deletedId = payload.old?.id;
      if (!deletedId) return;

      projects = projects.filter((project) => project.id !== deletedId);
      const { [deletedId]: _removed, ...remainingUpdates } = projectUpdatesById;
      projectUpdatesById = remainingUpdates;
      if (selectedKanbanProject?.id === deletedId) selectedKanbanProject = null;
      if (publishScheduleProject?.id === deletedId) closePublishScheduler();
      scheduleProjectKeysRefresh();
      return;
    }

    if (payload.new?.id) {
      handleProjectUpdated(payload.new, { bumpKeys: false });
      scheduleProjectKeysRefresh();
    }
  }

  function scheduleProjectKeysRefresh() {
    window.clearTimeout(projectKeysRealtimeTimer);
    projectKeysRealtimeTimer = window.setTimeout(() => {
      workspaceRefreshKey += 1;
      calendarRefreshKey += 1;
      publishingRefreshKey += 1;
      adminRefreshKey += 1;
    }, 500);
  }

  function scheduleBoardRealtimeRefresh() {
    window.clearTimeout(boardRealtimeTimer);
    boardRealtimeTimer = window.setTimeout(() => {
      boardRefreshKey += 1;
      calendarRefreshKey += 1;
    }, 500);
  }

  function scheduleWorkspaceRealtimeRefresh() {
    window.clearTimeout(workspaceRealtimeTimer);
    workspaceRealtimeTimer = window.setTimeout(() => {
      loadWorkspaceTaskCount();
      workspaceRefreshKey += 1;
    }, 500);
  }

  function scheduleFundraisingRealtimeRefresh() {
    window.clearTimeout(fundraisingRealtimeTimer);
    fundraisingRealtimeTimer = window.setTimeout(() => {
      fundraisingRefreshKey += 1;
    }, 500);
  }

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
      loadWorkspaceTaskCount(),
      loadFeedbackRecipient(),
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

    startRealtime();
    isLoading = false;
  }

  async function loadGrants() {
    grantsLoading = true;
    const { grants, error } = await loadModuleGrants(supabase, user.id);
    moduleGrants = grants;
    grantsError = error
      ? "We couldn't load your module access. Some sections may be hidden until you retry."
      : "";
    grantsLoading = false;
  }

  async function loadWorkspaceTaskCount() {
    if (!user?.id) return;
    workspaceTaskCount = await countMyOpenTasks(supabase, user.id);
  }

  async function loadFeedbackRecipient() {
    // Who the dashboard "Feedback" button delivers to (set in User Access).
    const { value } = await getSetting(supabase, FEEDBACK_RECIPIENT_KEY);
    feedbackRecipientId = typeof value === "string" ? value : "";
  }

  function handleFeedbackSent() {
    // If feedback was sent to me, surface it in my badge right away.
    if (feedbackRecipientId === user?.id) {
      loadWorkspaceTaskCount();
      workspaceRefreshKey += 1;
    }
  }

  function handleTaskAssigned() {
    // Refresh the badge (covers self-assignment) and re-pull the Workspace
    // feed if the user is looking at it.
    loadWorkspaceTaskCount();
    workspaceRefreshKey += 1;
  }

  function openAssignTask(prefill = null) {
    assignTaskPrefill = prefill;
    assignTaskOpen = true;
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
        "id,title,priority,status,deadline,publish_date,details_url,brief_doc_status,copy_approved,files_url,deliverables_url,assigned_to,edit_notes,channel_tags,source,intake_reviewed,intake_submitted_at,updated_at",
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
    // Close any open kanban drawer / publish dialog when changing views so
    // they don't linger over the new section.
    selectedKanbanProject = null;
    publishScheduleProject = null;
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
      fundraising: () => (fundraisingRefreshKey += 1),
      spaces: () => (spacesRefreshKey += 1),
      inventory: () => (inventoryRefreshKey += 1),
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
    // Everyone can move a project to any column.
    return Boolean(project?.id) && Boolean(targetStatus) && project.status !== targetStatus;
  }

  function canStartProjectDrag(project) {
    return Boolean(project?.id) && movingProjectId !== project.id;
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

    if (!canMoveProjectToStatus(project, status)) return;

    if (shouldPromptForPublishSchedule(project, status)) {
      openPublishScheduler(project, status);
      return;
    }

    await moveProjectToStatus(project, status);
  }

  function shouldPromptForPublishSchedule(project, targetStatus) {
    return targetStatus === "Ready to Publish" && project?.status !== targetStatus;
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

    if (result?.conflict) {
      publishScheduleError =
        "Someone else just updated this project. Close this dialog and try again with their latest version.";
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

    // Optimistic lock: only apply the move if nobody else changed the row
    // since we loaded it. Zero rows back means someone got there first.
    let query = supabase
      .from("projects")
      .update(updatePayload)
      .eq("id", project.id);
    if (previousProject.updated_at) {
      query = query.eq("updated_at", previousProject.updated_at);
    }

    const { data, error } = await query.select(projectSelectColumns).maybeSingle();

    if (error) {
      statusMoveError = error.message;
      handleProjectUpdated(previousProject);
      movingProjectId = "";
      return { error };
    }

    if (!data) {
      handleProjectUpdated(previousProject);
      statusMoveError = `Someone else just updated "${previousProject.title}" — the board has been refreshed with their change. Try again in a moment.`;
      await refreshProjectRow(project.id);
      movingProjectId = "";
      return { conflict: true };
    }

    handleProjectUpdated(data);
    movingProjectId = "";
    return { data };
  }

  // Pull one project's current row after a conflict so the board reflects the
  // other person's change (realtime usually beats this, but don't rely on it).
  async function refreshProjectRow(projectId) {
    const { data, error } = await supabase
      .from("projects")
      .select(projectSelectColumns)
      .eq("id", projectId)
      .maybeSingle();

    if (error) return;

    if (data) {
      handleProjectUpdated(data);
    } else {
      projects = projects.filter((project) => project.id !== projectId);
      if (selectedKanbanProject?.id === projectId) selectedKanbanProject = null;
    }
  }

  function openCreateDrawer() {
    createDrawerOpen = true;
  }

  function handleProjectCreated(project) {
    createDrawerOpen = false;
    if (!project?.id) return;
    handleProjectUpdated(project);
    selectedKanbanProject = getLatestProject(project);
  }

  function openKanbanProjectDetails(project) {
    if (draggedProjectId) return;

    selectedKanbanProject = getLatestProject(project);
  }

  function handleProjectUpdated(updatedProject, { bumpKeys = true } = {}) {
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

    if (bumpKeys) {
      workspaceRefreshKey += 1;
      calendarRefreshKey += 1;
      publishingRefreshKey += 1;
      adminRefreshKey += 1;
    }
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
    try {
      localStorage.setItem("lsp:sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      // Private mode storage failures are fine; collapse just won't persist.
    }
  }

  function getInitials() {
    const name = getDisplayName();
    const parts = name
      .replace(/@.*$/, "")
      .split(/[\s._-]+/)
      .filter(Boolean);
    return (
      ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?"
    );
  }

  // Cmd/Ctrl+K quick switcher over the visible nav items. Combobox pattern:
  // focus stays in the input, ArrowUp/Down move the active option, Enter
  // picks it. Pure hash navigation; zero coupling to view data.
  let switcherOpen = false;
  let switcherQuery = "";
  let switcherInput;
  let switcherActive = 0;
  let switcherReturnFocus = null;

  $: switcherMatches = switcherQuery.trim()
    ? visibleNavItems.filter((item) =>
        item.label.toLowerCase().includes(switcherQuery.trim().toLowerCase()),
      )
    : visibleNavItems;
  $: if (switcherActive >= switcherMatches.length) switcherActive = 0;

  async function openSwitcher() {
    switcherReturnFocus = document.activeElement;
    switcherOpen = true;
    switcherQuery = "";
    switcherActive = 0;
    await tick();
    switcherInput?.focus();
  }

  function closeSwitcher() {
    switcherOpen = false;
    if (switcherReturnFocus instanceof HTMLElement) {
      switcherReturnFocus.focus({ preventScroll: true });
    }
    switcherReturnFocus = null;
  }

  function pickSwitcherItem(item) {
    closeSwitcher();
    if (item) window.location.hash = item.id;
  }

  function handleGlobalKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (switcherOpen) {
        closeSwitcher();
      } else {
        openSwitcher();
      }
      return;
    }

    if (switcherOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSwitcher();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        switcherActive = (switcherActive + 1) % Math.max(1, switcherMatches.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        switcherActive =
          (switcherActive - 1 + Math.max(1, switcherMatches.length)) %
          Math.max(1, switcherMatches.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        pickSwitcherItem(switcherMatches[switcherActive]);
      }
      return;
    }

    if (event.key === "Escape" && sidebarOpen) {
      event.preventDefault();
      closeSidebar();
      return;
    }

    handleWindowKanbanKeydown(event);
  }

  // Mobile drawer focus management: move focus in on open, restore on close,
  // and keep the off-canvas drawer out of the tab order while hidden.
  let sidebarReturnFocus = null;
  let sidebarEl;
  let isDesktop = true;

  async function openSidebar() {
    sidebarReturnFocus = document.activeElement;
    sidebarOpen = true;
    await tick();
    sidebarEl?.querySelector("nav a")?.focus({ preventScroll: true });
  }

  function closeSidebar() {
    sidebarOpen = false;
    if (sidebarReturnFocus instanceof HTMLElement) {
      sidebarReturnFocus.focus({ preventScroll: true });
    }
    sidebarReturnFocus = null;
  }
</script>

<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<svelte:window onkeydown={handleGlobalKeydown} />

<main class="lsp-portal min-h-screen bg-canvas text-ink">
  {#if isLoading}
    <div class="min-h-screen lg:flex" aria-busy="true" aria-label="Loading dashboard">
      <div class="hidden w-72 shrink-0 bg-ink lg:block"></div>
      <div class="min-w-0 flex-1">
        <div class="border-b border-ink/10 bg-white/90 px-4 py-4 md:px-6">
          <div class="skeleton h-7 w-44 rounded-md"></div>
        </div>
        <div class="grid gap-3 px-4 py-5 md:grid-cols-2 md:px-6 xl:grid-cols-3">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} class="hidden xl:block" />
        </div>
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
        onclick={closeSidebar}
      ></button>
    {/if}

    <div class="min-h-screen lg:flex">
      <aside
        bind:this={sidebarEl}
        inert={!sidebarOpen && !isDesktop}
        class="fixed inset-y-0 left-0 z-40 w-[min(18rem,86vw)] transform border-r border-black/10 bg-ink text-white transition-[transform,width] duration-200 lg:translate-x-0 lg:transform-none {sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'} {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}"
        aria-label="Dashboard navigation"
      >
        <div class="flex h-full min-h-dvh flex-col">
          <div class="flex items-center justify-between border-b border-white/10 px-4 py-4 {sidebarCollapsed ? 'lg:px-3' : ''}">
            <div class="flex min-w-0 items-center gap-3 {sidebarCollapsed ? 'lg:justify-center' : ''}">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand text-[13px] font-bold tracking-tight text-ink" aria-hidden="true">
                LSP
              </span>
              <div class="min-w-0 {sidebarCollapsed ? 'lg:hidden' : ''}">
                <h1 class="truncate text-base font-bold leading-tight">Dashboard</h1>
                <p class="truncate text-[11px] font-medium text-white/55">The Latina Sweat Project</p>
              </div>
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
              onclick={closeSidebar}
            >
              <X class="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <nav class="flex-1 space-y-4 overflow-y-auto px-3 py-4">
            {#each navSections as section}
              <div>
                {#if section.title}
                  <p class="px-3 pb-1 text-[0.66rem] font-bold uppercase tracking-[0.16em] text-white/50 {sidebarCollapsed ? 'lg:hidden' : ''}">
                    {section.title}
                  </p>
                {/if}
                <div class="space-y-0.5">
                  {#each section.items as item}
                    {@const Icon = item.icon}
                    {@const isActive = activeView === item.id}
                    <a
                      href={`#${item.id}`}
                      class="relative flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors duration-150 {sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''} {isActive ? 'bg-white/[0.09] font-semibold text-white' : 'text-white/70 hover:bg-white/[0.06] hover:text-white'}"
                      aria-current={isActive ? "page" : undefined}
                      title={item.label}
                    >
                      {#if isActive}
                        <span class="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" aria-hidden="true"></span>
                      {/if}
                      <Icon class="h-4 w-4 shrink-0 {isActive ? 'text-brand' : ''}" aria-hidden="true" />
                      <span class="{sidebarCollapsed ? 'lg:hidden' : ''}">{item.label}</span>
                      {#if item.id === "workspace" && workspaceTaskCount > 0}
                        <span
                          class="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-brand-ink {sidebarCollapsed ? 'lg:hidden' : ''}"
                          aria-label={`${workspaceTaskCount} open tasks`}
                        >
                          {workspaceTaskCount}
                        </span>
                        {#if sidebarCollapsed}
                          <span class="absolute right-1.5 top-1.5 hidden h-2 w-2 rounded-full bg-brand lg:block" aria-hidden="true"></span>
                        {/if}
                      {/if}
                    </a>
                  {/each}
                </div>
              </div>
            {/each}
          </nav>

          <div class="mt-auto border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] {sidebarCollapsed ? 'lg:px-2' : ''}">
            <div class="flex items-center gap-3 rounded-control bg-white/[0.07] px-3 py-2.5 {sidebarCollapsed ? 'lg:flex-col lg:gap-2 lg:px-2' : ''}">
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-ink" aria-hidden="true">
                {getInitials()}
              </span>
              <div class="min-w-0 flex-1 {sidebarCollapsed ? 'lg:hidden' : ''}">
                <p class="truncate text-sm font-semibold">{getDisplayName()}</p>
                <p class="truncate text-xs capitalize text-white/70">{profile?.role || "member"}</p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-control p-2 text-white/70 transition hover:bg-red-500/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                onclick={handleSignOut}
                disabled={signingOut}
                aria-label="Sign out"
                title="Sign out"
              >
                {#if signingOut}
                  <span class="block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true"></span>
                {:else}
                  <LogOut class="h-4 w-4" aria-hidden="true" />
                {/if}
              </button>
            </div>
          </div>
        </div>
      </aside>

      <section class="min-w-0 flex-1 transition-[margin] duration-200 {sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}">
        <header class="sticky top-0 z-20 border-b border-black/10 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <button
                type="button"
                class="rounded-control border border-ink/12 bg-white p-2 text-ink shadow-card lg:hidden"
                aria-label="Open navigation"
                onclick={openSidebar}
              >
                <Menu class="h-5 w-5" aria-hidden="true" />
              </button>
              <div class="flex min-w-0 items-center gap-2.5">
                {#if activeNavItem?.icon}
                  {@const ActiveIcon = activeNavItem.icon}
                  <span class="hidden h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-ink sm:flex" aria-hidden="true">
                    <ActiveIcon class="h-4 w-4" />
                  </span>
                {/if}
                <div class="min-w-0">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                    Dashboard
                  </p>
                  <h2 class="truncate text-lg font-bold leading-tight md:text-xl">
                    {activeNavItem?.label || "Dashboard"}
                  </h2>
                </div>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={UserPlus}
                onclick={() => openAssignTask()}
              >
                Assign
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={MessageSquare}
                onclick={() => (feedbackOpen = true)}
              >
                Feedback
              </Button>
              <button
                type="button"
                class="hidden min-h-10 items-center gap-2 rounded-control border border-ink/12 bg-white px-3 text-sm text-ink/45 shadow-card transition hover:border-ink/25 hover:text-ink/70 md:flex"
                onclick={openSwitcher}
                aria-label="Open quick navigation"
              >
                <Search class="h-3.5 w-3.5" aria-hidden="true" />
                <span class="font-medium">Jump to</span>
                <kbd class="rounded border border-ink/15 bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-ink/50">⌘K</kbd>
              </button>
              <button
                type="button"
                class="flex h-10 w-10 items-center justify-center rounded-control border border-ink/12 bg-white text-ink shadow-card transition hover:border-accent/40 hover:text-accent sm:hidden"
                onclick={refreshActiveView}
                disabled={activeView !== "workspace" && projectsLoading}
                aria-label="Refresh"
              >
                <RefreshCw class="h-4 w-4 {projectsLoading ? 'animate-spin' : ''}" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="hidden min-h-10 items-center gap-2 rounded-control border border-ink/12 bg-white px-3 text-sm font-semibold shadow-card transition hover:border-accent/40 hover:text-accent sm:flex"
                onclick={refreshActiveView}
                disabled={activeView !== "workspace" && projectsLoading}
              >
                <RefreshCw class="h-4 w-4 {projectsLoading ? 'animate-spin' : ''}" aria-hidden="true" />
                Refresh
              </button>
            </div>
          </div>
        </header>

        {#if switcherOpen}
          <div
            class="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[18vh]"
            role="presentation"
            onclick={(event) => {
              if (event.target === event.currentTarget) closeSwitcher();
            }}
          >
            <!-- Combobox pattern: focus stays in the input; ArrowUp/Down move
                 the active option, Enter activates it. -->
            <div class="w-full max-w-md overflow-hidden rounded-card border border-ink/10 bg-white shadow-pop">
              <div class="relative border-b border-ink/8">
                <Search class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" aria-hidden="true" />
                <input
                  bind:this={switcherInput}
                  type="text"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="switcher-listbox"
                  aria-activedescendant={switcherMatches[switcherActive] ? `switcher-option-${switcherMatches[switcherActive].id}` : undefined}
                  aria-autocomplete="list"
                  class="w-full border-0 py-3 pl-10 pr-4 text-sm outline-none placeholder:text-ink/35"
                  placeholder="Jump to a section"
                  aria-label="Jump to a section"
                  bind:value={switcherQuery}
                />
              </div>
              <ul id="switcher-listbox" class="max-h-72 overflow-y-auto p-1.5" role="listbox" aria-label="Sections">
                {#each switcherMatches as item, i (item.id)}
                  {@const ItemIcon = item.icon}
                  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
                  <li
                    id="switcher-option-{item.id}"
                    role="option"
                    aria-selected={i === switcherActive}
                    class="flex cursor-pointer items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium transition-colors {i === switcherActive ? 'bg-accent-soft text-accent-strong' : 'text-ink/75 hover:bg-ink/[0.05]'}"
                    onclick={() => pickSwitcherItem(item)}
                    onmouseenter={() => (switcherActive = i)}
                  >
                    <ItemIcon class="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span class="flex-1">{item.label}</span>
                    <span class="text-[11px] font-semibold uppercase tracking-wide text-ink/45">{item.section}</span>
                  </li>
                {:else}
                  <li class="px-3 py-6 text-center text-sm text-ink/65">No matching sections</li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}

        <div class="px-4 py-5 md:px-6 md:py-6">
          {#if projectError}
            <Banner tone="error" message={projectError} class="mb-4" />
          {/if}

          {#if statusMoveError}
            <Banner tone="error" message={statusMoveError} class="mb-4" />
          {/if}

          {#if grantsError}
            <Banner tone="error" class="mb-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <p>{grantsError}</p>
                <Button size="sm" loading={grantsLoading} onclick={loadGrants}>
                  Retry
                </Button>
              </div>
            </Banner>
          {/if}

          {#if !canViewActive}
            <Panel title="No access" id="no-access-title">
              <div class="flex items-start gap-3 text-ink/75">
                <Lock class="mt-1 h-5 w-5 shrink-0 text-ink/40" aria-hidden="true" />
                <div>
                  <p class="text-sm leading-6">
                    You don't have access to this section yet. A superuser can grant
                    module access from User Access.
                  </p>
                  {#if visibleNavItems.length}
                    <Button variant="primary" href={`#${visibleNavItems[0].id}`} class="mt-3">
                      Go to {visibleNavItems[0].label}
                    </Button>
                  {/if}
                </div>
              </div>
            </Panel>
          {:else if activeView === "workspace"}
            <Workspace
              {supabase}
              email={profile?.email || user?.email}
              profileId={user?.id}
              {teamMembers}
              currentUserRole={profile?.role || "member"}
              currentUserName={profile?.full_name || profile?.email || user?.email}
              isFeedbackRecipient={Boolean(feedbackRecipientId) && feedbackRecipientId === user?.id}
              hasBoardAccess={canSeeNavItem({ modules: ["board_projects"] }, profile, moduleGrants)}
              moduleAccess={{
                marketing: canSeeNavItem({ modules: ["marketing"] }, profile, moduleGrants),
                board: canSeeNavItem({ modules: ["board_projects"] }, profile, moduleGrants),
                fundraising: canSeeNavItem({ modules: ["fundraising"] }, profile, moduleGrants),
                subs: canSeeNavItem({ modules: ["subs"] }, profile, moduleGrants),
                events: canSeeNavItem({ modules: ["events"] }, profile, moduleGrants),
              }}
              availableStatuses={statuses}
              scheduleProjects={latestProjects}
              refreshKey={workspaceRefreshKey}
              onProjectUpdated={handleProjectUpdated}
              onTasksChanged={loadWorkspaceTaskCount}
              onCreateProject={openCreateDrawer}
              onAssignTask={openAssignTask}
            />
          {:else if activeView === "kanban"}
            <section aria-labelledby="kanban-title">
              <Panel title="Marketing Projects" id="kanban-title" loading={projectsLoading}>
                <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Tabs
                    tabs={KANBAN_VIEW_TABS}
                    bind:active={kanbanViewMode}
                    variant="segmented"
                    label="Project view mode"
                    hasPanels={false}
                  />
                  <Button variant="primary" size="sm" icon={Plus} class="w-fit" onclick={openCreateDrawer}>
                    New project
                  </Button>
                </div>

                <div class="mb-3 grid gap-3 rounded-card border border-ink/8 bg-canvas/70 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50 sm:col-span-2 xl:col-span-1">
                    Search
                    <span class="relative mt-2 block">
                      <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" aria-hidden="true" />
                      <input
                        type="search"
                        class="input pl-9"
                        placeholder="Title, assignee, channel, notes"
                        aria-label="Search projects"
                        bind:value={kanbanSearch}
                      />
                    </span>
                  </label>
                  <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
                    Status
                    <select class="select mt-2" bind:value={kanbanStatusFilter}>
                      <option value="all">All</option>
                      {#each statuses as status}<option value={status}>{status}</option>{/each}
                    </select>
                  </label>
                  <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
                    Priority
                    <select class="select mt-2" bind:value={kanbanPriorityFilter}>
                      <option value="all">All</option>
                      <option value="unset">Unset</option>
                      {#each ["P0", "P1", "P2"] as priority}<option value={priority}>{priority}</option>{/each}
                    </select>
                  </label>
                  <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
                    Assignee
                    <select class="select mt-2" bind:value={kanbanAssigneeFilter}>
                      <option value="all">All</option>
                      {#each kanbanAssigneeOptions as email}<option value={email}>{email}</option>{/each}
                    </select>
                  </label>
                  <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
                    Channel
                    <select class="select mt-2" bind:value={kanbanChannelFilter}>
                      <option value="all">All</option>
                      {#each kanbanChannelOptions as channel}<option value={channel}>{channel}</option>{/each}
                    </select>
                  </label>
                  <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
                    Copy
                    <select class="select mt-2" bind:value={kanbanCopyFilter}>
                      <option value="all">All</option>
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                    </select>
                  </label>
                </div>

                <div class="mb-4 flex items-center justify-between gap-3">
                  <p class="text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
                    {filteredKanbanProjects.length} of {latestProjects.length} project{latestProjects.length === 1 ? "" : "s"}
                  </p>
                  {#if hasKanbanFilters}
                    <Button size="sm" variant="ghost" onclick={clearKanbanFilters}>Clear filters</Button>
                  {/if}
                </div>

                {#if kanbanViewMode === "list"}
                  {#if filteredKanbanList.length}
                    <div class="space-y-2">
                      {#each filteredKanbanList as project (project.id)}
                        <button
                          type="button"
                          class="flex w-full flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40 hover:shadow-card"
                          onclick={() => openKanbanProjectDetails(project)}
                        >
                          <span class="min-w-0 flex-1">
                            <span class="block truncate font-bold leading-snug text-ink">{project.title}</span>
                            <span class="mt-1 block text-sm text-ink/55">{kanbanAssignedBrief(project)}</span>
                          </span>
                          {#if project.channel_tags?.length}
                            <span class="hidden flex-wrap gap-1 md:flex">
                              {#each project.channel_tags.slice(0, 3) as tag}
                                <Badge tone="neutral" size="xs">{tag}</Badge>
                              {/each}
                            </span>
                          {/if}
                          <Badge tone={kanbanPriorityTone(project.priority)} size="xs">
                            {project.priority || "Unset"}
                          </Badge>
                          <Badge tone={kanbanStatusTone(project.status)}>{project.status}</Badge>
                          <span class="w-16 shrink-0 text-right text-xs font-bold text-ink/50">
                            {formatKanbanDate(project)}
                          </span>
                        </button>
                      {/each}
                    </div>
                  {:else}
                    <p class="rounded-card border border-dashed border-ink/15 bg-white px-4 py-10 text-center text-sm text-ink/55">
                      No projects match the current filters.
                    </p>
                  {/if}
                {:else}
                  <div class="mb-3 flex items-center justify-between gap-3">
                    <p class="min-w-0 truncate text-sm font-semibold text-ink/70" aria-live="polite">
                      {statuses[activeKanbanIndex]} · {activeKanbanIndex + 1} of {statuses.length}
                    </p>
                    <div class="flex shrink-0 items-center gap-3">
                      <Button
                        iconOnly
                        icon={ChevronLeft}
                        label="Previous columns"
                        onclick={() => scrollKanbanToIndex(activeKanbanIndex - 1)}
                        disabled={activeKanbanIndex === 0}
                      />
                      <div class="flex items-center gap-0.5" aria-label="Kanban column position">
                        {#each statuses as status, index}
                          <button
                            type="button"
                            class="group flex h-6 min-w-6 items-center justify-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                            aria-label={`Show ${status}`}
                            aria-current={activeKanbanIndex === index ? "true" : undefined}
                            onclick={() => scrollKanbanToIndex(index)}
                          >
                            <span
                              class="h-2.5 rounded-full transition {activeKanbanIndex === index ? 'w-6 bg-accent' : 'w-2.5 bg-ink/20 group-hover:bg-ink/35'}"
                              aria-hidden="true"
                            ></span>
                          </button>
                        {/each}
                      </div>
                      <Button
                        iconOnly
                        icon={ChevronRight}
                        label="Next columns"
                        onclick={() => scrollKanbanToIndex(activeKanbanIndex + 1)}
                        disabled={activeKanbanIndex === statuses.length - 1}
                      />
                    </div>
                  </div>

                  <div
                    bind:this={kanbanScroller}
                    class="kanban-scroll thin-scroll -mx-4 overflow-x-auto px-4 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 md:-mx-6 md:px-6"
                    tabindex="0"
                    aria-label="Scrollable Kanban columns. Use left and right arrows to move columns, and up and down arrows to scroll the active column."
                    onscroll={handleKanbanScroll}
                    onkeydown={handleKanbanKeydown}
                  >
                    <div class="kanban-track grid gap-3">
                      {#each statuses as status}
                        <div
                          class="snap-start flex h-[calc(100dvh-22rem)] min-h-[28rem] max-h-[46rem] flex-col rounded-card border border-ink/8 bg-canvas p-3 transition {dragOverStatus === status ? 'border-accent bg-accent-soft ring-2 ring-accent/20' : ''}"
                          data-kanban-column
                          ondragover={(event) => handleColumnDragOver(event, status)}
                          ondragleave={(event) => handleColumnDragLeave(event, status)}
                          ondrop={(event) => handleColumnDrop(event, status)}
                        >
                          <div class="mb-3 flex min-h-10 shrink-0 items-start justify-between gap-2">
                            <h3 class="text-sm font-bold leading-tight text-ink">{status}</h3>
                            <div class="flex items-center gap-2">
                              {#if dragOverStatus === status}
                                <Badge tone="teal" variant="solid" size="xs">Drop</Badge>
                              {/if}
                              <Badge tone="neutral" size="xs">{filteredByStatus[status]?.length || 0}</Badge>
                            </div>
                          </div>
                          <div
                            class="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1"
                            aria-label={`${status} projects`}
                            data-kanban-column-list
                          >
                            {#each filteredByStatus[status] || [] as project (project.id)}
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
                              <p class="rounded-card border border-dashed border-ink/15 bg-white px-3 py-4 text-center text-xs text-ink/45">
                                {hasKanbanFilters ? "No matches" : "Empty"}
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
              onAssignTask={openAssignTask}
              onWorkspaceChanged={handleTaskAssigned}
            />
          {:else if activeView === "events"}
            <EventsView
              {supabase}
              {profile}
              refreshKey={eventsRefreshKey}
              onAssignTask={openAssignTask}
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
              onAssignTask={openAssignTask}
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
          {:else if activeView === "fundraising"}
            <FundraisingView
              {supabase}
              {profile}
              {teamMembers}
              refreshKey={fundraisingRefreshKey}
              onAssignTask={openAssignTask}
              onWorkspaceChanged={handleTaskAssigned}
            />
          {:else if activeView === "spaces"}
            <SpacesView
              {supabase}
              {profile}
              refreshKey={spacesRefreshKey}
            />
          {:else if activeView === "inventory"}
            <InventoryView
              {supabase}
              {profile}
              refreshKey={inventoryRefreshKey}
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
              onAssignTask={openAssignTask}
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
      onAssignTask={openAssignTask}
    />

    <ProjectCreateDrawer
      {supabase}
      open={createDrawerOpen}
      {teamMembers}
      currentUserEmail={profile?.email || user?.email}
      onClose={() => (createDrawerOpen = false)}
      onCreated={handleProjectCreated}
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

    <AssignTaskDialog
      {supabase}
      open={assignTaskOpen}
      {teamMembers}
      currentProfileId={user?.id}
      prefill={assignTaskPrefill}
      onClose={() => (assignTaskOpen = false)}
      onCreated={handleTaskAssigned}
    />

    <FeedbackDialog
      {supabase}
      open={feedbackOpen}
      currentProfileId={user?.id}
      currentUserName={profile?.full_name || profile?.email || user?.email}
      recipientId={feedbackRecipientId}
      recipientName={feedbackRecipientName}
      onClose={() => (feedbackOpen = false)}
      onSent={handleFeedbackSent}
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
