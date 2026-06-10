<script>
  import { onMount } from "svelte";
  import {
    AlertCircle,
    ArrowUpDown,
    CheckCircle2,
    Download,
    ExternalLink,
    FilePlus2,
    Inbox,
    Pencil,
    Plus,
    RefreshCw,
    RotateCcw,
    Save,
    Search,
    ShieldAlert,
    Trash2,
    X,
  } from "@lucide/svelte";
  import EmptyState from "./EmptyState.svelte";
  import Panel from "./Panel.svelte";
  import SlideOver from "./SlideOver.svelte";
  import { isOperationalAdmin } from "../../../lib/dashboard/roles";

  export let supabase;
  export let profile;
  export let refreshKey = 0;
  export let onProjectsChanged = async () => {};

  const priorities = ["P0", "P1", "P2"];
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
  const projectPageSizes = [25, 50, 100, 200];
  const projectSourceOptions = ["manual", "google_form"];
  const projectSortOptions = [
    { field: "created_at", label: "Newest created" },
    { field: "title", label: "Project title" },
    { field: "status", label: "Status" },
    { field: "priority", label: "Priority" },
    { field: "deadline", label: "Deadline" },
    { field: "publish_date", label: "Publish date" },
    { field: "assigned_to", label: "Assignee" },
    { field: "copy_approved", label: "Copy approval" },
  ];
  const channelOptions = [
    "IG",
    "TikTok",
    "LinkedIn",
    "Website",
    "Newsletter",
    "Email",
    "Blog",
    "YouTube",
    "Podcast",
    "Press",
    "Event",
    "Partner",
    "Paid Ads",
    "SMS",
  ];
  const projectSelectColumns =
    "id,title,priority,status,deadline,publish_date,details_url,copy_approved,files_url,deliverables_url,assigned_to,edit_notes,channel_tags,source,intake_reviewed,intake_submitted_at,intake_respondent_email,intake_contact_name,intake_urgency,intake_payload,created_at";

  let intakeProjects = [];
  let allProjects = [];
  let teamMembers = [];
  let assignableTeamMembers = [];
  let accountUsers = [];
  let intakeDrafts = {};
  let projectDrafts = {};
  let assignmentSearches = {};
  let projectAssignmentSearches = {};
  let manualTeamSearch = "";
  let editProjectAssignmentSearch = "";
  let manualDrawerVisible = false;
  let editingProject = null;
  let isProjectDrawerEditing = false;
  let projectDrawerVisible = false;
  let manualForm = getEmptyManualForm();
  let projectSearch = "";
  let projectStatusFilter = "all";
  let projectPriorityFilter = "all";
  let projectSourceFilter = "all";
  let projectCopyFilter = "all";
  let projectReviewFilter = "all";
  let projectAssigneeFilter = "all";
  let projectSortField = "created_at";
  let projectSortDirection = "desc";
  let projectPageSize = 50;
  let currentProjectPage = 1;
  let isLoading = true;
  let isRefreshing = false;
  let errorMessage = "";
  let successMessage = "";
  let savingIntakeId = "";
  let savingProjectId = "";
  let deletingProjectId = "";
  let savingManualProject = false;
  let lastRefreshKey = refreshKey;

  $: isAdmin = isOperationalAdmin(profile);
  $: assignableTeamMembers = getAssignableTeamMembers(teamMembers, accountUsers);
  $: copyPendingCount = allProjects.filter((project) => !project.copy_approved).length;
  $: filteredProjects = getFilteredProjects(
    allProjects,
    projectSearch,
    projectStatusFilter,
    projectPriorityFilter,
    projectSourceFilter,
    projectCopyFilter,
    projectReviewFilter,
    projectAssigneeFilter,
  );
  $: sortedProjects = sortProjects(
    filteredProjects,
    projectSortField,
    projectSortDirection,
  );
  $: totalProjectPages = Math.max(1, Math.ceil(sortedProjects.length / projectPageSize));
  $: if (currentProjectPage > totalProjectPages) {
    currentProjectPage = totalProjectPages;
  }
  $: projectPageStart = (currentProjectPage - 1) * projectPageSize;
  $: projectPageEnd = Math.min(projectPageStart + projectPageSize, sortedProjects.length);
  $: visibleProjects = sortedProjects.slice(projectPageStart, projectPageEnd);
  $: assigneeFilterOptions = getAssigneeFilterOptions();
  $: if (isAdmin && refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadAdminData();
  }

  onMount(() => {
    if (isAdmin) {
      loadAdminData();
    } else {
      isLoading = false;
    }
  });

  async function loadAdminData() {
    if (!supabase || !isAdmin) {
      isLoading = false;
      return;
    }

    isRefreshing = true;
    errorMessage = "";

    try {
      const [membersResult, intakeResult, projectsResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .order("full_name", { ascending: true, nullsFirst: false }),
        supabase
          .from("projects")
          .select(projectSelectColumns)
          .eq("source", "google_form")
          .eq("intake_reviewed", false)
          .order("intake_submitted_at", { ascending: true, nullsFirst: false }),
        supabase
          .from("projects")
          .select(projectSelectColumns)
          .order("created_at", { ascending: false, nullsFirst: false }),
      ]);

      const firstError =
        membersResult.error || intakeResult.error || projectsResult.error;

      if (firstError) {
        throw firstError;
      }

      teamMembers = membersResult.data || [];
      intakeProjects = intakeResult.data || [];
      allProjects = projectsResult.data || [];
      accountUsers = teamMembers.map(profileToAccountUser);

      seedIntakeDrafts(intakeProjects);
      seedProjectDrafts(allProjects);
    } catch (error) {
      errorMessage = error?.message || "Admin projects could not be loaded.";
    } finally {
      isLoading = false;
      isRefreshing = false;
    }
  }

  function profileToAccountUser(profile) {
    return {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role || "member",
      created_at: profile.created_at || null,
      updated_at: profile.updated_at || null,
      invited_at: null,
      last_sign_in_at: null,
      confirmed_at: null,
      email_confirmed_at: null,
      account_status: "active",
    };
  }

  function seedIntakeDrafts(projects) {
    const nextDrafts = { ...intakeDrafts };

    for (const project of projects) {
      if (nextDrafts[project.id]) continue;

      nextDrafts[project.id] = {
        assigned_to: project.assigned_to || [],
        priority: project.priority || priorityFromUrgency(project.intake_urgency),
        status: project.status || "Ready for Production",
        edit_notes: project.edit_notes || "",
      };
    }

    intakeDrafts = nextDrafts;
  }

  function seedProjectDrafts(projects) {
    const nextDrafts = { ...projectDrafts };

    for (const project of projects) {
      nextDrafts[project.id] = projectToDraft(project);
    }

    projectDrafts = nextDrafts;
  }

  function projectToDraft(project) {
    return {
      title: project.title || "",
      priority: project.priority || "",
      status: project.status || "Ready for Production",
      deadline: project.deadline || "",
      publish_date: project.publish_date || "",
      details_url: project.details_url || "",
      files_url: project.files_url || "",
      deliverables_url: project.deliverables_url || "",
      assigned_to: normalizeAssignedEmails(project.assigned_to || []),
      edit_notes: project.edit_notes || "",
      channel_tags: normalizeChannelTags(project.channel_tags || []),
      copy_approved: Boolean(project.copy_approved),
      source: project.source || "manual",
      intake_reviewed: project.intake_reviewed !== false,
      intake_contact_name: project.intake_contact_name || "",
      intake_respondent_email: project.intake_respondent_email || "",
      intake_urgency: project.intake_urgency || "",
    };
  }

  function getProjectDraft(projectId) {
    return (
      projectDrafts[projectId] || {
        title: "",
        priority: "",
        status: "Ready for Production",
        deadline: "",
        publish_date: "",
        details_url: "",
        files_url: "",
        deliverables_url: "",
        assigned_to: [],
        edit_notes: "",
        channel_tags: [],
        copy_approved: false,
        source: "manual",
        intake_reviewed: true,
        intake_contact_name: "",
        intake_respondent_email: "",
        intake_urgency: "",
      }
    );
  }

  function updateProjectDraft(projectId, field, value) {
    const draft = getProjectDraft(projectId);

    projectDrafts = {
      ...projectDrafts,
      [projectId]: {
        ...draft,
        [field]: value,
      },
    };
  }

  function updateProjectAssignment(projectId, email, checked) {
    const draft = getProjectDraft(projectId);
    const current = normalizeAssignedEmails(draft.assigned_to || []);
    const assignedTo = checked
      ? normalizeAssignedEmails([...current, email])
      : current.filter((item) => normalizeEmail(item) !== normalizeEmail(email));

    updateProjectDraft(projectId, "assigned_to", assignedTo);
  }

  function updateProjectChannel(projectId, channel, checked) {
    const draft = getProjectDraft(projectId);
    const channelTags = checked
      ? normalizeChannelTags([...(draft.channel_tags || []), channel])
      : normalizeChannelTags(draft.channel_tags || []).filter(
          (tag) => normalizeChannelTag(tag) !== normalizeChannelTag(channel),
        );

    updateProjectDraft(projectId, "channel_tags", channelTags);
  }

  function updateManualChannel(channel, checked) {
    manualForm = {
      ...manualForm,
      channel_tags: checked
        ? normalizeChannelTags([...(manualForm.channel_tags || []), channel])
        : normalizeChannelTags(manualForm.channel_tags || []).filter(
            (tag) => normalizeChannelTag(tag) !== normalizeChannelTag(channel),
          ),
    };
  }

  function isChannelSelected(tags, channel) {
    return normalizeChannelTags(tags || []).some(
      (tag) => normalizeChannelTag(tag) === normalizeChannelTag(channel),
    );
  }

  function getCustomChannelTags(tags) {
    return normalizeChannelTags(tags || []).filter(
      (tag) =>
        !channelOptions.some(
          (option) => normalizeChannelTag(option) === normalizeChannelTag(tag),
        ),
    );
  }

  function normalizeChannelTags(values) {
    const rawValues = Array.isArray(values)
      ? values
      : String(values || "").split(",");
    const tags = rawValues
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const normalized = new Map();

    for (const tag of tags) {
      normalized.set(normalizeChannelTag(tag), tag);
    }

    return Array.from(normalized.values());
  }

  function normalizeChannelTag(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isProjectAssigned(draft, email) {
    return normalizeAssignedEmails(draft.assigned_to || []).some(
      (assignedEmail) => normalizeEmail(assignedEmail) === normalizeEmail(email),
    );
  }

  function setProjectAssignmentSearch(projectId, value) {
    projectAssignmentSearches = {
      ...projectAssignmentSearches,
      [projectId]: value,
    };
  }

  function resetProjectDraft(project) {
    projectDrafts = {
      ...projectDrafts,
      [project.id]: projectToDraft(project),
    };
    projectAssignmentSearches = {
      ...projectAssignmentSearches,
      [project.id]: "",
    };
  }

  async function openProjectDrawer(project, editing = false) {
    editingProject = project;
    isProjectDrawerEditing = editing;
    editProjectAssignmentSearch = "";
    resetProjectDraft(project);
    projectDrawerVisible = true;
  }

  function openEditProjectModal(project) {
    return openProjectDrawer(project, true);
  }

  function startProjectDrawerEdit() {
    if (!editingProject) return;

    resetProjectDraft(editingProject);
    isProjectDrawerEditing = true;
  }

  function cancelProjectDrawerEdit() {
    if (!editingProject || savingProjectId) return;

    resetProjectDraft(editingProject);
    isProjectDrawerEditing = false;
  }

  function closeEditProjectModal() {
    if (savingProjectId) return;

    if (editingProject) {
      resetProjectDraft(editingProject);
    }

    projectDrawerVisible = false;
  }

  function handleProjectDrawerClose() {
    projectDrawerVisible = false;
    editingProject = null;
    isProjectDrawerEditing = false;
    editProjectAssignmentSearch = "";
  }

  async function submitEditProject(event) {
    event.preventDefault();

    if (!editingProject) return;

    const saved = await saveProjectDraft(editingProject);

    if (saved) {
      const savedProject =
        saved === true
          ? allProjects.find((project) => project.id === editingProject.id) ||
            editingProject
          : saved;

      editingProject = savedProject;
      resetProjectDraft(savedProject);
      isProjectDrawerEditing = false;
      editProjectAssignmentSearch = "";
    }
  }

  function projectDraftToPayload(draft) {
    return {
      title: draft.title.trim(),
      priority: draft.priority || null,
      status: draft.status || "Ready for Production",
      deadline: draft.deadline || null,
      publish_date: draft.publish_date || null,
      details_url: draft.details_url.trim() || null,
      files_url: draft.files_url.trim() || null,
      deliverables_url: draft.deliverables_url.trim() || null,
      assigned_to: normalizeAssignedEmails(draft.assigned_to || []),
      edit_notes: draft.edit_notes.trim() || null,
      channel_tags: normalizeChannelTags(draft.channel_tags || []),
      copy_approved: Boolean(draft.copy_approved),
      source: draft.source || "manual",
      intake_reviewed: Boolean(draft.intake_reviewed),
      intake_contact_name: draft.intake_contact_name.trim() || null,
      intake_respondent_email: draft.intake_respondent_email.trim() || null,
      intake_urgency: draft.intake_urgency ? Number(draft.intake_urgency) : null,
    };
  }

  function projectToComparable(project) {
    return {
      title: project.title || "",
      priority: project.priority || null,
      status: project.status || "Ready for Production",
      deadline: project.deadline || null,
      publish_date: project.publish_date || null,
      details_url: project.details_url || null,
      files_url: project.files_url || null,
      deliverables_url: project.deliverables_url || null,
      assigned_to: normalizeAssignedEmails(project.assigned_to || []),
      edit_notes: project.edit_notes || null,
      channel_tags: Array.isArray(project.channel_tags) ? project.channel_tags : [],
      copy_approved: Boolean(project.copy_approved),
      source: project.source || "manual",
      intake_reviewed: project.intake_reviewed !== false,
      intake_contact_name: project.intake_contact_name || null,
      intake_respondent_email: project.intake_respondent_email || null,
      intake_urgency: project.intake_urgency || null,
    };
  }

  function isProjectDraftDirty(project) {
    const payload = projectDraftToPayload(getProjectDraft(project.id));
    const comparable = projectToComparable(project);

    return JSON.stringify(payload) !== JSON.stringify(comparable);
  }

  function priorityFromUrgency(urgency) {
    if (urgency >= 5) return "P0";
    if (urgency >= 3) return "P1";
    return "P2";
  }

  function updateIntakeDraft(projectId, field, value) {
    const draft = intakeDrafts[projectId] || {};

    intakeDrafts = {
      ...intakeDrafts,
      [projectId]: {
        ...draft,
        [field]: value,
      },
    };
  }

  function updateIntakeAssignment(projectId, email, checked) {
    const draft = intakeDrafts[projectId] || {};
    const current = draft.assigned_to || [];
    const assignedTo = checked
      ? Array.from(new Set([...current, email]))
      : current.filter((item) => item !== email);

    updateIntakeDraft(projectId, "assigned_to", assignedTo);
  }

  function updateManualAssignment(email, checked) {
    const current = manualForm.assigned_to || [];

    manualForm = {
      ...manualForm,
      assigned_to: checked
        ? Array.from(new Set([...current, email]))
        : current.filter((item) => item !== email),
    };
  }

  function setIntakeAssignmentSearch(projectId, value) {
    assignmentSearches = {
      ...assignmentSearches,
      [projectId]: value,
    };
  }

  function getFilteredTeamMembers(searchValue, members = assignableTeamMembers) {
    const query = normalizeSearch(searchValue);

    if (!query) return members;

    return members.filter((member) =>
      normalizeSearch(`${member.full_name || ""} ${member.email || ""}`).includes(
        query,
      ),
    );
  }

  function getAssignableTeamMembers(members, users) {
    const memberMap = new Map();

    for (const member of [...(members || []), ...(users || [])]) {
      if (!member?.email) continue;

      const key = normalizeEmail(member.email);
      const existing = memberMap.get(key) || {};

      memberMap.set(key, {
        ...existing,
        ...member,
        email: member.email,
        full_name: member.full_name || existing.full_name || "",
        role: member.role || existing.role || "member",
      });
    }

    return Array.from(memberMap.values()).sort((first, second) =>
      formatMember(first).localeCompare(formatMember(second), undefined, {
        sensitivity: "base",
      }),
    );
  }

  function normalizeSearch(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeAssignedEmails(values) {
    const emails = (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    return Array.from(new Set(emails));
  }

  function getProjectSearchText(project) {
    return normalizeSearch(
      [
        project.title,
        project.priority,
        project.status,
        project.deadline,
        project.publish_date,
        project.details_url,
        project.files_url,
        project.deliverables_url,
        project.edit_notes,
        project.source,
        project.intake_contact_name,
        project.intake_respondent_email,
        ...(project.assigned_to || []),
        ...(project.channel_tags || []),
      ].join(" "),
    );
  }

  function getFilteredProjects(
    projects,
    searchValue,
    statusFilter,
    priorityFilter,
    sourceFilter,
    copyFilter,
    reviewFilter,
    assigneeFilter,
  ) {
    const query = normalizeSearch(searchValue);
    const assigneeQuery = normalizeEmail(assigneeFilter);

    return projects.filter((project) => {
      if (query && !getProjectSearchText(project).includes(query)) return false;
      if (statusFilter !== "all" && project.status !== statusFilter) {
        return false;
      }
      if (priorityFilter !== "all") {
        const priority = project.priority || "unset";

        if (priority !== priorityFilter) return false;
      }
      if (sourceFilter !== "all" && project.source !== sourceFilter) {
        return false;
      }
      if (
        assigneeFilter !== "all" &&
        !normalizeAssignedEmails(project.assigned_to || []).some(
          (email) => normalizeEmail(email) === assigneeQuery,
        )
      ) {
        return false;
      }
      if (copyFilter === "approved" && !project.copy_approved) return false;
      if (copyFilter === "pending" && project.copy_approved) return false;
      if (reviewFilter === "reviewed" && project.intake_reviewed === false) {
        return false;
      }
      if (reviewFilter === "unreviewed" && project.intake_reviewed !== false) {
        return false;
      }

      return true;
    });
  }

  function sortProjects(projects, sortField, sortDirection) {
    const direction = sortDirection === "asc" ? 1 : -1;

    return [...projects].sort((a, b) => {
      const firstValue = getSortValue(a, sortField);
      const secondValue = getSortValue(b, sortField);
      const comparison = compareSortValues(firstValue, secondValue);

      return comparison * direction;
    });
  }

  function getSortValue(project, field) {
    if (field === "assigned_to") return formatAssigned(project);
    if (field === "channel_tags") return formatTags(project.channel_tags);
    if (field === "copy_approved") return project.copy_approved ? 1 : 0;
    if (field === "intake_reviewed") return project.intake_reviewed === false ? 0 : 1;
    if (field === "priority") return getPrioritySortRank(project.priority);
    if (field === "status") return getStatusSortRank(project.status);
    if (field === "deadline" || field === "publish_date" || field === "created_at") {
      return project[field] ? new Date(project[field]).getTime() : "";
    }

    return project[field] ?? "";
  }

  function getPrioritySortRank(priority) {
    if (priority === "P0") return 0;
    if (priority === "P1") return 1;
    if (priority === "P2") return 2;
    return 99;
  }

  function getStatusSortRank(status) {
    const index = statuses.indexOf(status);

    return index === -1 ? 99 : index;
  }

  function compareSortValues(firstValue, secondValue) {
    const firstEmpty = firstValue === null || firstValue === undefined || firstValue === "";
    const secondEmpty = secondValue === null || secondValue === undefined || secondValue === "";

    if (firstEmpty && secondEmpty) return 0;
    if (firstEmpty) return 1;
    if (secondEmpty) return -1;

    if (typeof firstValue === "number" && typeof secondValue === "number") {
      return firstValue - secondValue;
    }

    return String(firstValue).localeCompare(String(secondValue), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function setProjectSort(field) {
    if (projectSortField === field) {
      projectSortDirection = projectSortDirection === "asc" ? "desc" : "asc";
    } else {
      projectSortField = field;
      projectSortDirection = "asc";
    }

    currentProjectPage = 1;
  }

  function updateProjectSortField(field) {
    projectSortField = field;
    currentProjectPage = 1;
  }

  function setProjectSortDirection(direction) {
    projectSortDirection = direction === "asc" ? "asc" : "desc";
    currentProjectPage = 1;
  }

  function resetProjectPage() {
    currentProjectPage = 1;
  }

  function getSortLabel(field) {
    if (projectSortField !== field) return "Sort";

    return projectSortDirection === "asc" ? "Ascending" : "Descending";
  }

  function getSortIndicator(field) {
    if (projectSortField !== field) return "";

    return projectSortDirection === "asc" ? " ↑" : " ↓";
  }

  function getSortButtonClass(field) {
    return projectSortField === field ? "text-[#0f766e]" : "text-gray-500";
  }

  function updateProjectFilter(field, value) {
    if (field === "search") projectSearch = value;
    if (field === "status") projectStatusFilter = value;
    if (field === "priority") projectPriorityFilter = value;
    if (field === "source") projectSourceFilter = value;
    if (field === "copy") projectCopyFilter = value;
    if (field === "review") projectReviewFilter = value;
    if (field === "assignee") projectAssigneeFilter = value;

    currentProjectPage = 1;
  }

  function resetProjectFilters() {
    projectSearch = "";
    projectStatusFilter = "all";
    projectPriorityFilter = "all";
    projectSourceFilter = "all";
    projectCopyFilter = "all";
    projectReviewFilter = "all";
    projectAssigneeFilter = "all";
    projectSortField = "created_at";
    projectSortDirection = "desc";
    currentProjectPage = 1;
  }

  function getAssigneeFilterOptions() {
    const emailMap = new Map();

    for (const member of assignableTeamMembers) {
      if (member.email) emailMap.set(normalizeEmail(member.email), member.email);
    }

    for (const project of allProjects) {
      for (const email of project.assigned_to || []) {
        if (email) emailMap.set(normalizeEmail(email), email);
      }
    }

    return Array.from(emailMap.values()).sort((first, second) =>
      first.localeCompare(second, undefined, { sensitivity: "base" }),
    );
  }

  function getProjectAssignmentOptions(
    project,
    draft,
    searchValue,
    members = assignableTeamMembers,
  ) {
    const query = normalizeSearch(searchValue);
    const options = new Map();

    for (const member of members) {
      if (!member.email) continue;
      options.set(normalizeEmail(member.email), {
        email: member.email,
        label: formatMember(member),
      });
    }

    for (const email of [...(project.assigned_to || []), ...(draft.assigned_to || [])]) {
      if (!email || options.has(normalizeEmail(email))) continue;
      options.set(normalizeEmail(email), {
        email,
        label: email,
      });
    }

    return Array.from(options.values()).filter((option) =>
      query ? normalizeSearch(option.label).includes(query) : true,
    );
  }

  function formatMember(member) {
    if (!member) return "Unknown";
    return member.full_name ? `${member.full_name} (${member.email})` : member.email;
  }

  function getDraft(projectId) {
    return intakeDrafts[projectId] || {
      assigned_to: [],
      priority: "P2",
      status: "Ready for Production",
      edit_notes: "",
    };
  }

  async function approveIntake(event, project) {
    event.preventDefault();

    const draft = getDraft(project.id);
    savingIntakeId = project.id;
    errorMessage = "";
    successMessage = "";

    const updatePayload = {
      assigned_to: draft.assigned_to || [],
      priority: draft.priority || null,
      status: draft.status || "Ready for Production",
      edit_notes: draft.edit_notes?.trim() || null,
      intake_reviewed: true,
    };

    const { error } = await supabase
      .from("projects")
      .update(updatePayload)
      .eq("id", project.id);

    if (error) {
      errorMessage = error.message;
      savingIntakeId = "";
      return;
    }

    intakeProjects = intakeProjects.filter((item) => item.id !== project.id);
    allProjects = allProjects.map((item) =>
      item.id === project.id ? { ...item, ...updatePayload } : item,
    );
    savingIntakeId = "";
    successMessage = `"${project.title}" was sent to the pipeline.`;
    await onProjectsChanged();
  }

  async function saveProjectDraft(project) {
    const draft = getProjectDraft(project.id);
    const updatePayload = projectDraftToPayload(draft);

    if (!updatePayload.title) {
      errorMessage = "Project title cannot be blank.";
      return false;
    }

    if (updatePayload.status === "Ready to Publish" && !updatePayload.publish_date) {
      errorMessage = "Set a publish date before saving a project as Ready to Publish.";
      return false;
    }

    if (
      updatePayload.intake_urgency !== null &&
      (updatePayload.intake_urgency < 1 || updatePayload.intake_urgency > 5)
    ) {
      errorMessage = "Intake urgency must be between 1 and 5.";
      return false;
    }

    if (!isProjectDraftDirty(project)) return project;

    const confirmed = window.confirm(
      `Save changes to "${project.title}"? These updates will apply across Workspace, Kanban, Project Calendar, and Publishing Calendar.`,
    );

    if (!confirmed) return false;

    savingProjectId = project.id;
    errorMessage = "";
    successMessage = "";

    const { data, error } = await supabase
      .from("projects")
      .update(updatePayload)
      .eq("id", project.id)
      .select(projectSelectColumns)
      .single();

    if (error) {
      errorMessage = error.message;
      savingProjectId = "";
      return false;
    }

    allProjects = allProjects.map((item) =>
      item.id === project.id ? { ...item, ...data } : item,
    );
    intakeProjects = intakeProjects
      .filter((item) => item.id !== project.id)
      .concat(
        data.source === "google_form" && data.intake_reviewed === false
          ? [data]
          : [],
      );
    projectDrafts = {
      ...projectDrafts,
      [data.id]: projectToDraft(data),
    };
    savingProjectId = "";
    successMessage = `"${data.title}" was saved.`;

    await onProjectsChanged();
    return data;
  }

  async function deleteProject(project) {
    const confirmed = window.confirm(
      `Delete "${project.title}"? This cannot be undone.`,
    );

    if (!confirmed) return;

    deletingProjectId = project.id;
    errorMessage = "";
    successMessage = "";

    const { error } = await supabase.from("projects").delete().eq("id", project.id);

    if (error) {
      errorMessage = error.message;
    } else {
      intakeProjects = intakeProjects.filter((item) => item.id !== project.id);
      allProjects = allProjects.filter((item) => item.id !== project.id);
      successMessage = `"${project.title}" was deleted.`;
      await onProjectsChanged();
    }

    deletingProjectId = "";
  }

  async function openManualProjectModal() {
    manualForm = getEmptyManualForm();
    manualTeamSearch = "";
    manualDrawerVisible = true;
  }

  function closeManualProjectModal() {
    if (savingManualProject) return;

    manualDrawerVisible = false;
  }

  function handleManualDrawerClose() {
    manualDrawerVisible = false;
    manualTeamSearch = "";
  }

  async function createManualProject(event) {
    event.preventDefault();

    if (!manualForm.title.trim()) {
      errorMessage = "A manual project needs a title.";
      return;
    }

    savingManualProject = true;
    errorMessage = "";
    successMessage = "";

    const insertPayload = {
      title: manualForm.title.trim(),
      priority: manualForm.priority || null,
      status: manualForm.status || "Ready for Production",
      deadline: manualForm.deadline || null,
      publish_date: manualForm.publish_date || null,
      details_url: manualForm.details_url.trim() || null,
      copy_approved: false,
      files_url: manualForm.files_url.trim() || null,
      deliverables_url: manualForm.deliverables_url.trim() || null,
      assigned_to: manualForm.assigned_to || [],
      edit_notes: manualForm.edit_notes.trim() || null,
      channel_tags: normalizeChannelTags(manualForm.channel_tags || []),
      source: "manual",
      intake_reviewed: true,
      intake_payload: {},
    };

    const { data, error } = await supabase
      .from("projects")
      .insert(insertPayload)
      .select(projectSelectColumns)
      .single();

    if (error) {
      errorMessage = error.message;
      savingManualProject = false;
      return;
    }

    allProjects = data ? [data, ...allProjects] : allProjects;
    if (data) {
      projectDrafts = {
        ...projectDrafts,
        [data.id]: projectToDraft(data),
      };
    }
    successMessage = `"${insertPayload.title}" was added.`;
    savingManualProject = false;
    closeManualProjectModal();
    await onProjectsChanged();
  }

  function getEmptyManualForm() {
    return {
      title: "",
      priority: "P2",
      status: "Ready for Production",
      deadline: "",
      publish_date: "",
      details_url: "",
      files_url: "",
      deliverables_url: "",
      assigned_to: [],
      edit_notes: "",
      channel_tags: [],
    };
  }

  function getPayloadEntries(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return [];
    }

    return Object.entries(payload)
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => ({
        key,
        value: formatPayloadValue(value),
      }));
  }

  function formatPayloadValue(value) {
    if (Array.isArray(value)) {
      return value.map(formatPayloadValue).join(", ");
    }

    if (value && typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  }

  function formatDate(value) {
    if (!value) return "Not set";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function formatDateTime(value) {
    if (!value) return "Submission date unavailable";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function formatShortDateTime(value) {
    if (!value) return "Never";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  }

  function getAccountStatusLabel(user) {
    if (user.account_status === "active") return "Active";
    if (user.account_status === "invited") return "Invited";
    if (user.account_status === "profile_only") return "Profile only";
    return "Pending";
  }

  function getAccountStatusClass(user) {
    if (user.account_status === "active") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (user.account_status === "invited") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }

    return "border-gray-200 bg-gray-50 text-gray-700";
  }

  function getPriorityClass(priority) {
    if (priority === "P0") return "bg-red-100 text-red-800 border-red-300";
    if (priority === "P1") return "bg-amber-100 text-amber-800 border-amber-300";
    if (priority === "P2") return "bg-teal-100 text-teal-800 border-teal-300";
    return "bg-gray-50 text-gray-600 border-gray-200";
  }

  function getStatusClass(status) {
    if (status === "Stuck") return "bg-red-50 text-red-700 border-red-200";
    if (status === "In Production") return "bg-blue-50 text-blue-700 border-blue-200";
    if (status?.startsWith("Ready")) return "bg-amber-50 text-amber-700 border-amber-200";
    if (status === "Published") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-gray-50 text-gray-700 border-gray-200";
  }

  function formatAssigned(project) {
    return project.assigned_to?.length ? project.assigned_to.join(", ") : "Unassigned";
  }

  function formatAssignedBrief(project) {
    const assigned = normalizeAssignedEmails(project.assigned_to || []);

    if (!assigned.length) return "Unassigned";
    if (assigned.length === 1) return assigned[0];
    return `${assigned[0]} +${assigned.length - 1}`;
  }

  function formatTags(tags) {
    return Array.isArray(tags) && tags.length ? tags.join(", ") : "";
  }

  function getProjectDetailRows(project) {
    if (!project) return [];

    return [
      { label: "Status", value: project.status || "Not set" },
      { label: "Priority", value: project.priority || "Unset" },
      { label: "Deadline", value: formatDate(project.deadline) },
      { label: "Publish date", value: formatDate(project.publish_date) },
      { label: "Assigned to", value: formatAssigned(project) },
      { label: "Channels", value: formatTags(project.channel_tags) || "General" },
      { label: "Copy approval", value: project.copy_approved ? "Approved" : "Pending" },
      { label: "Source", value: project.source || "manual" },
      { label: "Intake reviewed", value: project.intake_reviewed === false ? "No" : "Yes" },
      { label: "Contact", value: project.intake_contact_name || "Not set" },
      { label: "Respondent email", value: project.intake_respondent_email || "Not set" },
      { label: "Intake urgency", value: project.intake_urgency || "Not set" },
      { label: "Created", value: formatShortDateTime(project.created_at) },
    ];
  }

  function getProjectLinks(project) {
    if (!project) return [];

    return [
      { label: "Details", url: project.details_url },
      { label: "Files", url: project.files_url },
      { label: "Deliverables", url: project.deliverables_url },
    ].filter((link) => isLikelyUrl(link.url));
  }

  function getProjectReferences(project) {
    if (!project) return [];

    return [
      { label: "Details", value: project.details_url },
      { label: "Files", value: project.files_url },
      { label: "Deliverables", value: project.deliverables_url },
    ].filter((reference) => reference.value && !isLikelyUrl(reference.value));
  }

  function isLikelyUrl(value) {
    return /^https?:\/\//i.test(value || "");
  }

  function exportProjectsCsv(scope = "all") {
    const sourceProjects = scope === "filtered" ? sortedProjects : allProjects;

    if (!sourceProjects.length) {
      errorMessage = "There are no projects to export.";
      return;
    }

    const headers = [
      "id",
      "title",
      "priority",
      "status",
      "deadline",
      "publish_date",
      "details_url",
      "copy_approved",
      "files_url",
      "deliverables_url",
      "assigned_to",
      "edit_notes",
      "channel_tags",
      "source",
      "intake_reviewed",
      "intake_submitted_at",
      "intake_respondent_email",
      "intake_contact_name",
      "intake_urgency",
      "created_at",
    ];
    const rows = sourceProjects.map((project) =>
      headers.map((header) => {
        if (header === "assigned_to") return formatTags(project.assigned_to);
        if (header === "channel_tags") return formatTags(project.channel_tags);
        return project[header] ?? "";
      }),
    );
    const csv = [headers, ...rows].map(csvRow).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateKey = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `lsp-marketing-projects-${scope}-${dateKey}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    successMessage = `${sourceProjects.length} project${sourceProjects.length === 1 ? "" : "s"} exported.`;
  }

  function csvRow(values) {
    return values
      .map((value) => {
        const text = String(value ?? "");
        const escaped = text.replace(/"/g, '""');

        return /[",\n\r]/.test(text) ? `"${escaped}"` : escaped;
      })
      .join(",");
  }

  function setProjectPageSize(value) {
    projectPageSize = Number(value);
    currentProjectPage = 1;
  }

  function setProjectPage(page) {
    currentProjectPage = Math.min(Math.max(1, page), totalProjectPages);
  }
</script>

{#if !isAdmin}
  <section
    class="rounded-lg border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm"
    aria-labelledby="admin-unauthorized-title"
    role="alert"
  >
    <div class="flex items-start gap-3">
      <ShieldAlert class="mt-1 h-6 w-6 shrink-0" aria-hidden="true" />
      <div>
        <h3 id="admin-unauthorized-title" class="text-lg font-bold">
          Unauthorized
        </h3>
        <p class="mt-2 text-sm leading-6">
          This admin view is available to superusers and admins with Marketing access.
          A superuser can update module access from User Access.
        </p>
      </div>
    </div>
  </section>
{:else}
  <section class="space-y-5" aria-labelledby="admin-title">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#0f766e]">
          Admin controls
        </p>
        <h3 id="admin-title" class="mt-1 text-2xl font-bold">Admin Overview</h3>
      </div>

      <button
        type="button"
        class="inline-flex min-h-10 w-fit items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold shadow-sm transition hover:border-[#0f766e]/30 hover:text-[#0f766e] disabled:cursor-not-allowed disabled:opacity-60"
        onclick={loadAdminData}
        disabled={isRefreshing}
      >
        <RefreshCw class="h-4 w-4 {isRefreshing ? 'animate-spin' : ''}" aria-hidden="true" />
        Refresh
      </button>
    </div>

    {#if errorMessage}
      <div
        class="flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        role="alert"
      >
        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{errorMessage}</span>
      </div>
    {/if}

    {#if successMessage}
      <div
        class="flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        role="status"
      >
        <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{successMessage}</span>
      </div>
    {/if}

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
          Team accounts
        </p>
        <p class="mt-2 text-3xl font-bold">{accountUsers.length}</p>
      </div>
      <div class="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
          Intake queue
        </p>
        <p class="mt-2 text-3xl font-bold">{intakeProjects.length}</p>
      </div>
      <div class="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
          Copy pending
        </p>
        <p class="mt-2 text-3xl font-bold">{copyPendingCount}</p>
      </div>
      <div class="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
          Total projects
        </p>
        <p class="mt-2 text-3xl font-bold">{allProjects.length}</p>
      </div>
    </div>

    <Panel title="Google Forms Intake Queue" id="google-forms-intake-queue" loading={isLoading}>
      {#if isLoading}
        <div class="flex min-h-40 items-center justify-center">
          <div class="flex items-center gap-3 text-sm text-gray-600">
            <span
              class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin"
              aria-hidden="true"
            ></span>
            Loading intake queue
          </div>
        </div>
      {:else if intakeProjects.length}
        <div class="grid gap-4 xl:grid-cols-2">
          {#each intakeProjects as project}
            {@const draft = getDraft(project.id)}
            {@const payloadEntries = getPayloadEntries(project.intake_payload)}
            {@const searchValue = assignmentSearches[project.id] || ""}

            <article class="rounded-lg border border-amber-200 bg-amber-50/45 p-4 shadow-sm">
              <div class="flex flex-col gap-2 border-b border-amber-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <p class="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] text-amber-800">
                    Pending Review
                  </p>
                  <h4 class="mt-3 text-lg font-bold leading-tight">{project.title}</h4>
                  <p class="mt-1 text-sm text-gray-700">
                    Contact: {project.intake_contact_name || project.intake_respondent_email || "Unknown"}
                  </p>
                </div>
                <p class="text-sm font-semibold text-gray-600">
                  {formatDateTime(project.intake_submitted_at)}
                </p>
              </div>

              <div class="mt-4 rounded-md border border-amber-200 bg-white p-3">
                <div class="mb-3 flex items-center gap-2">
                  <Inbox class="h-4 w-4 text-[#0f766e]" aria-hidden="true" />
                  <h5 class="font-bold">Request details</h5>
                </div>

                {#if payloadEntries.length}
                  <dl class="grid gap-2 text-sm">
                    {#each payloadEntries as entry}
                      <div class="rounded-md bg-gray-50 px-3 py-2">
                        <dt class="font-bold text-gray-900">{entry.key}</dt>
                        <dd class="mt-1 whitespace-pre-wrap break-words text-gray-700">
                          {entry.value}
                        </dd>
                      </div>
                    {/each}
                  </dl>
                {:else}
                  <p class="rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-sm text-gray-600">
                    No intake payload was attached to this submission.
                  </p>
                {/if}
              </div>

              <form class="mt-4 grid gap-4" onsubmit={(event) => approveIntake(event, project)}>
                <div>
                  <label class="text-sm font-bold" for={`intake-assignees-${project.id}`}>
                    Assign team members
                  </label>
                  <div class="mt-2 rounded-md border border-black/10 bg-white p-3">
                    <div class="relative">
                      <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                      <input
                        id={`intake-assignees-${project.id}`}
                        type="search"
                        value={searchValue}
                        class="min-h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                        placeholder="Search account emails"
                        oninput={(event) =>
                          setIntakeAssignmentSearch(project.id, event.currentTarget.value)}
                      />
                    </div>

                    {#if draft.assigned_to?.length}
                      <div class="mt-3 flex flex-wrap gap-1.5">
                        {#each draft.assigned_to as email}
                          <span class="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
                            {email}
                          </span>
                        {/each}
                      </div>
                    {/if}

                    <div class="mt-3 max-h-44 overflow-y-auto rounded-md border border-gray-200">
                      {#each getFilteredTeamMembers(searchValue, assignableTeamMembers) as member}
                        <label class="flex min-h-11 items-center gap-3 border-b border-gray-100 px-3 py-2 text-sm last:border-b-0 hover:bg-gray-50">
                          <input
                            type="checkbox"
                            class="h-4 w-4 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]"
                            checked={draft.assigned_to?.includes(member.email)}
                            onchange={(event) =>
                              updateIntakeAssignment(
                                project.id,
                                member.email,
                                event.currentTarget.checked,
                              )}
                          />
                          <span>{formatMember(member)}</span>
                        </label>
                      {:else}
                        <p class="px-3 py-4 text-sm text-gray-500">
                          No matching accounts.
                        </p>
                      {/each}
                    </div>
                  </div>
                </div>

                <div class="grid gap-3 md:grid-cols-2">
                  <label class="text-sm font-bold">
                    Priority
                    <select
                      class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                      value={draft.priority}
                      onchange={(event) =>
                        updateIntakeDraft(project.id, "priority", event.currentTarget.value)}
                    >
                      {#each priorities as priority}
                        <option value={priority}>{priority}</option>
                      {/each}
                    </select>
                  </label>

                  <label class="text-sm font-bold">
                    Initial status
                    <select
                      class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                      value={draft.status}
                      onchange={(event) =>
                        updateIntakeDraft(project.id, "status", event.currentTarget.value)}
                    >
                      {#each statuses as status}
                        <option value={status}>{status}</option>
                      {/each}
                    </select>
                  </label>
                </div>

                <label class="text-sm font-bold">
                  Edit notes
                  <textarea
                    class="mt-2 min-h-28 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                    value={draft.edit_notes}
                    placeholder="Add production notes, scope, links, or next actions."
                    oninput={(event) =>
                      updateIntakeDraft(project.id, "edit_notes", event.currentTarget.value)}
                  ></textarea>
                </label>

                <button
                  type="submit"
                  class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={savingIntakeId === project.id}
                >
                  {#if savingIntakeId === project.id}
                    <span class="h-4 w-4 rounded-full border-2 border-[#1E1E1E] border-t-transparent animate-spin" aria-hidden="true"></span>
                    Sending
                  {:else}
                    <CheckCircle2 class="h-4 w-4" aria-hidden="true" />
                    Approve & Send to Pipeline
                  {/if}
                </button>
              </form>
            </article>
          {/each}
        </div>
      {:else}
        <EmptyState
          title="Intake queue is clear"
          message="New Google Form submissions will appear here for admin review."
        />
      {/if}
    </Panel>

    <Panel title="Master Project Table" id="master-project-table" loading={isRefreshing}>
      <div class="mb-4 flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div>
          <p class="text-sm leading-6 text-gray-600">
            Edit project records, search/filter/sort the full pipeline, export data, or add manual work.
          </p>
          <p class="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
            {#if sortedProjects.length}
              Showing {projectPageStart + 1}-{projectPageEnd} of {sortedProjects.length} filtered projects
              {#if sortedProjects.length !== allProjects.length}
                ({allProjects.length} total)
              {/if}
            {:else}
              No projects match the current filters
            {/if}
          </p>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-start 2xl:justify-end">
          <button
            type="button"
            class="inline-flex min-h-10 w-fit shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-black/10 bg-white px-3 text-sm font-bold transition hover:border-[#0f766e]/40 hover:text-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
            onclick={() => exportProjectsCsv("all")}
          >
            <Download class="h-4 w-4" aria-hidden="true" />
            Export All
          </button>

          <button
            type="button"
            class="inline-flex min-h-10 w-fit shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-black/10 bg-white px-3 text-sm font-bold transition hover:border-[#0f766e]/40 hover:text-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
            onclick={() => exportProjectsCsv("filtered")}
          >
            <Download class="h-4 w-4" aria-hidden="true" />
            Export Filtered
          </button>

          <label class="flex items-center gap-2 text-sm font-semibold text-gray-700">
            Rows
            <select
              class="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              value={projectPageSize}
              onchange={(event) => setProjectPageSize(event.currentTarget.value)}
            >
              {#each projectPageSizes as size}
                <option value={size}>{size}</option>
              {/each}
            </select>
          </label>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm font-bold transition hover:border-[#0f766e]/30 hover:text-[#0f766e] disabled:cursor-not-allowed disabled:opacity-50"
              onclick={() => setProjectPage(currentProjectPage - 1)}
              disabled={currentProjectPage <= 1}
            >
              Previous
            </button>
            <span class="min-w-20 text-center text-sm font-bold text-gray-700">
              {currentProjectPage} / {totalProjectPages}
            </span>
            <button
              type="button"
              class="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm font-bold transition hover:border-[#0f766e]/30 hover:text-[#0f766e] disabled:cursor-not-allowed disabled:opacity-50"
              onclick={() => setProjectPage(currentProjectPage + 1)}
              disabled={currentProjectPage >= totalProjectPages}
            >
              Next
            </button>
          </div>

          <button
            type="button"
            class="inline-flex min-h-10 w-fit shrink-0 items-center gap-2 whitespace-nowrap rounded-md bg-[#1E1E1E] px-3 text-sm font-bold text-white transition hover:bg-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#ffbd59] focus:ring-offset-2"
            onclick={openManualProjectModal}
          >
            <Plus class="h-4 w-4" aria-hidden="true" />
            Add Manual Project
          </button>
        </div>
      </div>

      <div class="mb-4 grid gap-3 rounded-md border border-black/10 bg-gray-50 p-3 lg:grid-cols-[minmax(16rem,2fr)_repeat(3,minmax(10rem,1fr))] xl:grid-cols-[minmax(18rem,2fr)_repeat(4,minmax(9rem,1fr))] 2xl:grid-cols-[minmax(18rem,2fr)_repeat(7,minmax(9rem,1fr))]">
        <label class="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
          Search
          <div class="relative mt-2">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              class="min-h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm font-semibold normal-case tracking-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={projectSearch}
              placeholder="Title, assignee, channel, notes, links"
              oninput={resetProjectPage}
            />
          </div>
        </label>

        <label class="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
          Status
          <select
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            bind:value={projectStatusFilter}
            onchange={resetProjectPage}
          >
            <option value="all">All statuses</option>
            {#each statuses as status}
              <option value={status}>{status}</option>
            {/each}
          </select>
        </label>

        <label class="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
          Priority
          <select
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            bind:value={projectPriorityFilter}
            onchange={resetProjectPage}
          >
            <option value="all">All priorities</option>
            <option value="unset">Unset</option>
            {#each priorities as priority}
              <option value={priority}>{priority}</option>
            {/each}
          </select>
        </label>

        <label class="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
          Assignee
          <select
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            bind:value={projectAssigneeFilter}
            onchange={resetProjectPage}
          >
            <option value="all">All assignees</option>
            {#each assigneeFilterOptions as email}
              <option value={email}>{email}</option>
            {/each}
          </select>
        </label>

        <label class="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
          Source
          <select
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            bind:value={projectSourceFilter}
            onchange={resetProjectPage}
          >
            <option value="all">All sources</option>
            {#each projectSourceOptions as source}
              <option value={source}>{source}</option>
            {/each}
          </select>
        </label>

        <label class="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
          Copy
          <select
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            bind:value={projectCopyFilter}
            onchange={resetProjectPage}
          >
            <option value="all">All copy states</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
          </select>
        </label>

        <label class="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
          Review
          <select
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            bind:value={projectReviewFilter}
            onchange={resetProjectPage}
          >
            <option value="all">All review states</option>
            <option value="reviewed">Reviewed</option>
            <option value="unreviewed">Unreviewed</option>
          </select>
        </label>

        <div class="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
          <label for="project-sort-field">Sort by</label>
          <select
            id="project-sort-field"
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            bind:value={projectSortField}
            onchange={(event) => updateProjectSortField(event.currentTarget.value)}
          >
            {#each projectSortOptions as option}
              <option value={option.field}>{option.label}</option>
            {/each}
          </select>
        </div>

        <div class="text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
          <label for="project-sort-direction">Direction</label>
          <select
            id="project-sort-direction"
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            bind:value={projectSortDirection}
            onchange={(event) => setProjectSortDirection(event.currentTarget.value)}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>

        <div class="flex items-end">
          <button
            type="button"
            class="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-bold transition hover:border-[#0f766e]/40 hover:text-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
            onclick={resetProjectFilters}
          >
            <RotateCcw class="h-4 w-4" aria-hidden="true" />
            Reset Filters
          </button>
        </div>
      </div>

      <div class="max-h-[64vh] overflow-auto rounded-md border border-black/10">
        <table class="min-w-[68rem] w-full divide-y divide-gray-200 bg-white text-left text-sm">
          <thead class="sticky top-0 z-10 bg-gray-50 text-xs font-bold uppercase tracking-[0.12em] text-gray-500 shadow-sm">
            <tr>
              <th scope="col" class="px-3 py-3">
                <button type="button" class="inline-flex items-center gap-1.5 hover:text-[#0f766e] {getSortButtonClass('title')}" onclick={() => setProjectSort("title")}>
                  Project{getSortIndicator("title")}
                  <ArrowUpDown class="h-3.5 w-3.5" aria-label={getSortLabel("title")} />
                </button>
              </th>
              <th scope="col" class="px-3 py-3">
                <button type="button" class="inline-flex items-center gap-1.5 hover:text-[#0f766e] {getSortButtonClass('status')}" onclick={() => setProjectSort("status")}>
                  Status{getSortIndicator("status")}
                  <ArrowUpDown class="h-3.5 w-3.5" aria-label={getSortLabel("status")} />
                </button>
              </th>
              <th scope="col" class="px-3 py-3">
                <button type="button" class="inline-flex items-center gap-1.5 hover:text-[#0f766e] {getSortButtonClass('priority')}" onclick={() => setProjectSort("priority")}>
                  Priority{getSortIndicator("priority")}
                  <ArrowUpDown class="h-3.5 w-3.5" aria-label={getSortLabel("priority")} />
                </button>
              </th>
              <th scope="col" class="px-3 py-3">
                <button type="button" class="inline-flex items-center gap-1.5 hover:text-[#0f766e] {getSortButtonClass('deadline')}" onclick={() => setProjectSort("deadline")}>
                  Deadline{getSortIndicator("deadline")}
                  <ArrowUpDown class="h-3.5 w-3.5" aria-label={getSortLabel("deadline")} />
                </button>
              </th>
              <th scope="col" class="px-3 py-3">
                <button type="button" class="inline-flex items-center gap-1.5 hover:text-[#0f766e] {getSortButtonClass('publish_date')}" onclick={() => setProjectSort("publish_date")}>
                  Publish{getSortIndicator("publish_date")}
                  <ArrowUpDown class="h-3.5 w-3.5" aria-label={getSortLabel("publish_date")} />
                </button>
              </th>
              <th scope="col" class="px-3 py-3">
                <button type="button" class="inline-flex items-center gap-1.5 hover:text-[#0f766e] {getSortButtonClass('assigned_to')}" onclick={() => setProjectSort("assigned_to")}>
                  Assigned{getSortIndicator("assigned_to")}
                  <ArrowUpDown class="h-3.5 w-3.5" aria-label={getSortLabel("assigned_to")} />
                </button>
              </th>
              <th scope="col" class="px-3 py-3">
                <button type="button" class="inline-flex items-center gap-1.5 hover:text-[#0f766e] {getSortButtonClass('copy_approved')}" onclick={() => setProjectSort("copy_approved")}>
                  Copy{getSortIndicator("copy_approved")}
                  <ArrowUpDown class="h-3.5 w-3.5" aria-label={getSortLabel("copy_approved")} />
                </button>
              </th>
              <th scope="col" class="px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each visibleProjects as project}
              <tr
                class="cursor-pointer align-middle transition hover:bg-[#0f766e]/5 focus-within:bg-[#0f766e]/5"
                onclick={() => openProjectDrawer(project)}
              >
                <td class="max-w-[24rem] px-3 py-3">
                  <div class="min-w-0">
                    <p class="line-clamp-2 font-bold leading-snug text-gray-950">{project.title}</p>
                    <p class="mt-1 text-xs font-semibold text-gray-500">
                      {formatTags(project.channel_tags) || "General"} · {project.source || "manual"}
                    </p>
                  </div>
                </td>

                <td class="px-3 py-3">
                  <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-bold {getStatusClass(project.status)}">
                    {project.status}
                  </span>
                </td>

                <td class="px-3 py-3">
                  <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-bold {getPriorityClass(project.priority)}">
                    {project.priority || "Unset"}
                  </span>
                </td>

                <td class="px-3 py-3 text-gray-700">
                  {formatDate(project.deadline)}
                </td>

                <td class="px-3 py-3 text-gray-700">
                  {formatDate(project.publish_date)}
                </td>

                <td class="max-w-[15rem] px-3 py-3 text-gray-700">
                  <span class="line-clamp-1">{formatAssignedBrief(project)}</span>
                </td>

                <td class="px-3 py-3">
                  <span class="rounded-full px-2.5 py-1 text-xs font-bold {project.copy_approved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">
                    {project.copy_approved ? "Approved" : "Pending"}
                  </span>
                  {#if project.intake_reviewed === false}
                    <span class="mt-1 inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                      Unreviewed
                    </span>
                  {/if}
                </td>

                <td class="px-3 py-3">
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-white text-gray-700 transition hover:border-[#0f766e]/40 hover:text-[#0f766e] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
                      aria-label={`Edit ${project.title}`}
                      title="Edit project"
                      onclick={(event) => {
                        event.stopPropagation();
                        openEditProjectModal(project);
                      }}
                    >
                      <Pencil class="h-4 w-4" aria-hidden="true" />
                    </button>

                    <button
                      type="button"
                      class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700 transition hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={`Delete ${project.title}`}
                      title="Delete project"
                      onclick={(event) => {
                        event.stopPropagation();
                        deleteProject(project);
                      }}
                      disabled={deletingProjectId === project.id}
                    >
                      {#if deletingProjectId === project.id}
                        <span class="h-4 w-4 rounded-full border-2 border-red-700 border-t-transparent animate-spin" aria-hidden="true"></span>
                        Deleting
                      {:else}
                        <Trash2 class="h-4 w-4" aria-hidden="true" />
                        Delete
                      {/if}
                    </button>
                  </div>
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="8" class="px-3 py-10">
                  <EmptyState
                    title="No projects yet"
                    message="Add a manual project or approve an intake request to start the pipeline."
                  />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Panel>
  </section>

  <SlideOver
    open={projectDrawerVisible}
    showHeader={false}
    width="min(100vw, 42rem)"
    closeDisabled={savingProjectId === editingProject?.id}
    onClose={closeEditProjectModal}
    onClosed={handleProjectDrawerClose}
  >
    {#if editingProject}
      {@const draft = getProjectDraft(editingProject.id)}
      {@const detailLinks = getProjectLinks(editingProject)}
      {@const detailReferences = getProjectReferences(editingProject)}
      {@const payloadEntries = getPayloadEntries(editingProject.intake_payload)}

      <div class="flex min-h-full flex-col bg-white">
        <div class="border-b border-black/10 bg-[#1E1E1E] px-5 py-5 text-white">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#ffbd59]">
                {isProjectDrawerEditing ? "Edit project" : "Project details"}
              </p>
              <h3 class="mt-2 text-xl font-bold leading-tight">{editingProject.title}</h3>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              {#if !isProjectDrawerEditing}
                <button
                  type="button"
                  class="rounded-md p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                  aria-label={`Edit ${editingProject.title}`}
                  title="Edit project"
                  onclick={startProjectDrawerEdit}
                >
                  <Pencil class="h-5 w-5" aria-hidden="true" />
                </button>
              {/if}
              <button
                type="button"
                class="rounded-md p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Close project details"
                onclick={closeEditProjectModal}
              >
                <X class="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {#if isProjectDrawerEditing}
          <form class="contents" onsubmit={submitEditProject}>
            <div class="flex-1 overflow-y-auto px-5 py-5">
              <div class="grid gap-4">
                <label class="text-sm font-bold">
                  Project title
                  <input
                    type="text"
                    class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                    value={draft.title}
                    oninput={(event) => updateProjectDraft(editingProject.id, "title", event.currentTarget.value)}
                    required
                  />
                </label>

                <div class="grid gap-3 md:grid-cols-3">
                  <label class="text-sm font-bold">
                    Status
                    <select
                      class="mt-2 min-h-10 w-full rounded-md border px-3 text-sm font-bold outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20 {getStatusClass(draft.status)}"
                      value={draft.status}
                      onchange={(event) => updateProjectDraft(editingProject.id, "status", event.currentTarget.value)}
                    >
                      {#each statuses as status}
                        <option value={status}>{status}</option>
                      {/each}
                    </select>
                  </label>

                  <label class="text-sm font-bold">
                    Priority
                    <select
                      class="mt-2 min-h-10 w-full rounded-md border px-3 text-sm font-bold outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20 {getPriorityClass(draft.priority)}"
                      value={draft.priority || ""}
                      onchange={(event) => updateProjectDraft(editingProject.id, "priority", event.currentTarget.value)}
                    >
                      <option value="">Unset</option>
                      {#each priorities as priority}
                        <option value={priority}>{priority}</option>
                      {/each}
                    </select>
                  </label>

                  <label class="text-sm font-bold">
                    Source
                    <select
                      class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                      value={draft.source}
                      onchange={(event) => updateProjectDraft(editingProject.id, "source", event.currentTarget.value)}
                    >
                      {#each projectSourceOptions as source}
                        <option value={source}>{source}</option>
                      {/each}
                    </select>
                  </label>
                </div>

                <div class="grid gap-3 md:grid-cols-2">
                  <label class="text-sm font-bold">
                    Deadline
                    <input
                      type="date"
                      class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                      value={draft.deadline}
                      onchange={(event) => updateProjectDraft(editingProject.id, "deadline", event.currentTarget.value)}
                    />
                  </label>

                  <label class="text-sm font-bold">
                    Publish date
                    <input
                      type="date"
                      class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                      value={draft.publish_date}
                      onchange={(event) => updateProjectDraft(editingProject.id, "publish_date", event.currentTarget.value)}
                    />
                  </label>
                </div>

                <div class="grid gap-3 md:grid-cols-3">
                  <label class="text-sm font-bold">
                    Details URL
                    <input
                      type="url"
                      class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                      value={draft.details_url}
                      oninput={(event) => updateProjectDraft(editingProject.id, "details_url", event.currentTarget.value)}
                    />
                  </label>

                  <label class="text-sm font-bold">
                    Files URL
                    <input
                      type="url"
                      class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                      value={draft.files_url}
                      oninput={(event) => updateProjectDraft(editingProject.id, "files_url", event.currentTarget.value)}
                    />
                  </label>

                  <label class="text-sm font-bold">
                    Deliverables URL
                    <input
                      type="url"
                      class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                      value={draft.deliverables_url}
                      oninput={(event) => updateProjectDraft(editingProject.id, "deliverables_url", event.currentTarget.value)}
                    />
                  </label>
                </div>

                <section class="rounded-md border border-black/10 bg-gray-50 p-3" aria-labelledby="edit-project-assignment-title">
                  <h4 id="edit-project-assignment-title" class="text-sm font-bold">
                    Assign team members
                  </h4>

                  <div class="relative mt-2">
                    <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                    <input
                      type="search"
                      class="min-h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                      bind:value={editProjectAssignmentSearch}
                      placeholder="Search teammates"
                    />
                  </div>

                  {#if draft.assigned_to?.length}
                    <div class="mt-3 flex flex-wrap gap-1.5">
                      {#each draft.assigned_to as email}
                        <span class="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
                          {email}
                        </span>
                      {/each}
                    </div>
                  {/if}

                  <div class="mt-3 max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white">
                    {#each getProjectAssignmentOptions(editingProject, draft, editProjectAssignmentSearch, assignableTeamMembers) as option}
                      <label class="flex min-h-10 items-center gap-3 border-b border-gray-100 px-3 py-2 text-sm last:border-b-0 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          class="h-4 w-4 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]"
                          checked={isProjectAssigned(draft, option.email)}
                          onchange={(event) =>
                            updateProjectAssignment(editingProject.id, option.email, event.currentTarget.checked)}
                        />
                        <span>{option.label}</span>
                      </label>
                    {:else}
                      <p class="px-3 py-4 text-sm text-gray-500">
                        No matching accounts.
                      </p>
                    {/each}
                  </div>
                </section>

                <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
                  <section class="rounded-md border border-black/10 bg-gray-50 p-3" aria-labelledby="edit-project-channels-title">
                    <h4 id="edit-project-channels-title" class="text-sm font-bold">
                      Channels
                    </h4>

                    <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {#each channelOptions as channel}
                        <label class="flex min-h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold transition hover:border-[#0f766e]/30">
                          <input
                            type="checkbox"
                            class="h-4 w-4 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]"
                            checked={isChannelSelected(draft.channel_tags, channel)}
                            onchange={(event) =>
                              updateProjectChannel(editingProject.id, channel, event.currentTarget.checked)}
                          />
                          {channel}
                        </label>
                      {/each}
                    </div>

                    {#if getCustomChannelTags(draft.channel_tags).length}
                      <div class="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                        <p class="text-xs font-bold uppercase tracking-[0.1em] text-amber-800">
                          Existing custom tags
                        </p>
                        <div class="mt-2 flex flex-wrap gap-1.5">
                          {#each getCustomChannelTags(draft.channel_tags) as tag}
                            <span class="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-800">
                              {tag}
                            </span>
                          {/each}
                        </div>
                      </div>
                    {/if}
                  </section>

                  <label class="flex min-h-10 items-center gap-3 self-end rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      role="switch"
                      class="h-5 w-5 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]"
                      checked={draft.copy_approved}
                      onchange={(event) => updateProjectDraft(editingProject.id, "copy_approved", event.currentTarget.checked)}
                    />
                    Copy approved
                  </label>
                </div>

                <div class="grid gap-3 md:grid-cols-3">
                  <label class="text-sm font-bold">
                    Contact
                    <input
                      type="text"
                      class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                      value={draft.intake_contact_name}
                      oninput={(event) => updateProjectDraft(editingProject.id, "intake_contact_name", event.currentTarget.value)}
                    />
                  </label>

                  <label class="text-sm font-bold">
                    Respondent email
                    <input
                      type="email"
                      class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                      value={draft.intake_respondent_email}
                      oninput={(event) => updateProjectDraft(editingProject.id, "intake_respondent_email", event.currentTarget.value)}
                    />
                  </label>

                  <label class="text-sm font-bold">
                    Intake urgency
                    <input
                      type="number"
                      min="1"
                      max="5"
                      class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                      value={draft.intake_urgency}
                      oninput={(event) => updateProjectDraft(editingProject.id, "intake_urgency", event.currentTarget.value)}
                    />
                  </label>
                </div>

                <label class="flex min-h-10 items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    class="h-5 w-5 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]"
                    checked={draft.intake_reviewed}
                    onchange={(event) => updateProjectDraft(editingProject.id, "intake_reviewed", event.currentTarget.checked)}
                  />
                  Intake reviewed
                </label>

                <label class="text-sm font-bold">
                  Timeline / notes
                  <textarea
                    class="mt-2 min-h-32 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                    value={draft.edit_notes}
                    oninput={(event) => updateProjectDraft(editingProject.id, "edit_notes", event.currentTarget.value)}
                  ></textarea>
                </label>
              </div>
            </div>

            <div class="flex flex-col-reverse gap-2 border-t border-black/10 bg-white p-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                class="inline-flex min-h-11 items-center justify-center rounded-md border border-black/10 px-4 text-sm font-bold transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                onclick={cancelProjectDrawerEdit}
                disabled={savingProjectId === editingProject.id}
              >
                Cancel
              </button>
              <button
                type="submit"
                class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!isProjectDraftDirty(editingProject) || savingProjectId === editingProject.id}
              >
                {#if savingProjectId === editingProject.id}
                  <span class="h-4 w-4 rounded-full border-2 border-[#1E1E1E] border-t-transparent animate-spin" aria-hidden="true"></span>
                  Saving
                {:else}
                  <Save class="h-4 w-4" aria-hidden="true" />
                  Save Changes
                {/if}
              </button>
            </div>
          </form>
        {:else}
          <div class="flex-1 overflow-y-auto px-5 py-5">
            <div class="flex flex-wrap gap-2">
              <span class="rounded-full border px-2.5 py-1 text-xs font-bold {getStatusClass(editingProject.status)}">
                {editingProject.status}
              </span>
              <span class="rounded-full border px-2.5 py-1 text-xs font-bold {getPriorityClass(editingProject.priority)}">
                {editingProject.priority || "Priority unset"}
              </span>
              <span class="rounded-full px-2.5 py-1 text-xs font-bold {editingProject.copy_approved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">
                {editingProject.copy_approved ? "Copy approved" : "Copy pending"}
              </span>
            </div>

            <dl class="mt-5 grid gap-3 sm:grid-cols-2">
              {#each getProjectDetailRows(editingProject) as row}
                <div class="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                  <dt class="text-xs font-bold uppercase tracking-[0.1em] text-gray-500">
                    {row.label}
                  </dt>
                  <dd class="mt-1 break-words text-sm font-semibold text-gray-800">
                    {row.value}
                  </dd>
                </div>
              {/each}
            </dl>

            {#if detailLinks.length || detailReferences.length}
              <section class="mt-5 rounded-md border border-black/10 bg-white p-4" aria-labelledby="project-drawer-links">
                <h4 id="project-drawer-links" class="font-bold">External links</h4>
                {#if detailLinks.length}
                  <div class="mt-3 flex flex-wrap gap-2">
                    {#each detailLinks as link}
                      <a
                        class="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-bold text-[#0f766e] transition hover:border-[#0f766e]/40 hover:bg-teal-50"
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink class="h-4 w-4" aria-hidden="true" />
                        {link.label}
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if detailReferences.length}
                  <dl class="mt-3 grid gap-2">
                    {#each detailReferences as reference}
                      <div class="rounded-md bg-gray-50 px-3 py-2">
                        <dt class="text-xs font-bold uppercase tracking-[0.1em] text-gray-500">
                          {reference.label}
                        </dt>
                        <dd class="mt-1 break-words text-sm text-gray-700">
                          {reference.value}
                        </dd>
                      </div>
                    {/each}
                  </dl>
                {/if}
              </section>
            {/if}

            <section class="mt-5 rounded-md border border-black/10 bg-white p-4" aria-labelledby="project-drawer-notes">
              <h4 id="project-drawer-notes" class="font-bold">Timeline / notes</h4>
              <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                {editingProject.edit_notes || "No timeline notes yet."}
              </p>
            </section>

            {#if payloadEntries.length}
              <section class="mt-5 rounded-md border border-black/10 bg-white p-4" aria-labelledby="project-drawer-intake">
                <h4 id="project-drawer-intake" class="font-bold">Intake payload</h4>
                <dl class="mt-3 grid gap-2 text-sm">
                  {#each payloadEntries as entry}
                    <div class="rounded-md bg-gray-50 px-3 py-2">
                      <dt class="font-bold text-gray-900">{entry.key}</dt>
                      <dd class="mt-1 whitespace-pre-wrap break-words text-gray-700">
                        {entry.value}
                      </dd>
                    </div>
                  {/each}
                </dl>
              </section>
            {/if}
          </div>

          <div class="flex flex-col-reverse gap-2 border-t border-black/10 bg-white p-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              class="inline-flex min-h-11 items-center justify-center rounded-md border border-black/10 px-4 text-sm font-bold transition hover:bg-gray-50"
              onclick={closeEditProjectModal}
            >
              Close
            </button>
            <button
              type="button"
              class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
              onclick={startProjectDrawerEdit}
            >
              <Pencil class="h-4 w-4" aria-hidden="true" />
              Edit Details
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </SlideOver>

  <SlideOver
    open={manualDrawerVisible}
    showHeader={false}
    width="min(100vw, 42rem)"
    closeDisabled={savingManualProject}
    onClose={closeManualProjectModal}
    onClosed={handleManualDrawerClose}
  >
    <form
      class="flex min-h-full flex-col bg-white"
      onsubmit={createManualProject}
    >
      <div class="border-b border-black/10 bg-[#1E1E1E] px-5 py-5 text-white">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#ffbd59]">
              Manual project
            </p>
            <h3 class="mt-2 text-xl font-bold leading-tight">Add Manual Project</h3>
          </div>
          <button
            type="button"
            class="rounded-md p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Close add manual project"
            onclick={closeManualProjectModal}
          >
            <X class="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-5">
        <div class="grid gap-4">
          <label class="text-sm font-bold">
            Project title
            <input
              type="text"
              class="mt-2 min-h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={manualForm.title}
              required
            />
          </label>

          <div class="grid gap-3 md:grid-cols-2">
            <label class="text-sm font-bold">
              Priority
              <select
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={manualForm.priority}
              >
                {#each priorities as priority}
                  <option value={priority}>{priority}</option>
                {/each}
              </select>
            </label>

            <label class="text-sm font-bold">
              Status
              <select
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={manualForm.status}
              >
                {#each statuses as status}
                  <option value={status}>{status}</option>
                {/each}
              </select>
            </label>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <label class="text-sm font-bold">
              Deadline
              <input
                type="date"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={manualForm.deadline}
              />
            </label>

            <label class="text-sm font-bold">
              Publish date
              <input
                type="date"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={manualForm.publish_date}
              />
            </label>
          </div>

          <div class="grid gap-3 md:grid-cols-3">
            <label class="text-sm font-bold">
              Details URL
              <input
                type="url"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={manualForm.details_url}
              />
            </label>

            <label class="text-sm font-bold">
              Files URL
              <input
                type="url"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={manualForm.files_url}
              />
            </label>

            <label class="text-sm font-bold">
              Deliverables URL
              <input
                type="url"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={manualForm.deliverables_url}
              />
            </label>
          </div>

          <div>
            <label class="text-sm font-bold" for="manual-assignees">
              Assign team members
            </label>
            <div class="mt-2 rounded-md border border-black/10 bg-white p-3">
              <div class="relative">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  id="manual-assignees"
                  type="search"
                  bind:value={manualTeamSearch}
                  class="min-h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                  placeholder="Search account emails"
                />
              </div>

              {#if manualForm.assigned_to?.length}
                <div class="mt-3 flex flex-wrap gap-1.5">
                  {#each manualForm.assigned_to as email}
                    <span class="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
                      {email}
                    </span>
                  {/each}
                </div>
              {/if}

              <div class="mt-3 max-h-44 overflow-y-auto rounded-md border border-gray-200">
                {#each getFilteredTeamMembers(manualTeamSearch, assignableTeamMembers) as member}
                  <label class="flex min-h-11 items-center gap-3 border-b border-gray-100 px-3 py-2 text-sm last:border-b-0 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]"
                      checked={manualForm.assigned_to?.includes(member.email)}
                      onchange={(event) =>
                        updateManualAssignment(member.email, event.currentTarget.checked)}
                    />
                    <span>{formatMember(member)}</span>
                  </label>
                {:else}
                  <p class="px-3 py-4 text-sm text-gray-500">
                    No matching accounts.
                  </p>
                {/each}
              </div>
            </div>
          </div>

          <section class="rounded-md border border-black/10 bg-gray-50 p-3" aria-labelledby="manual-project-channels-title">
            <h4 id="manual-project-channels-title" class="text-sm font-bold">
              Channels
            </h4>

            <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {#each channelOptions as channel}
                <label class="flex min-h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-semibold transition hover:border-[#0f766e]/30">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]"
                    checked={isChannelSelected(manualForm.channel_tags, channel)}
                    onchange={(event) => updateManualChannel(channel, event.currentTarget.checked)}
                  />
                  {channel}
                </label>
              {/each}
            </div>
          </section>

          <label class="text-sm font-bold">
            Edit notes
            <textarea
              class="mt-2 min-h-28 w-full rounded-md border border-gray-200 px-3 py-2 text-sm leading-6 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={manualForm.edit_notes}
            ></textarea>
          </label>
        </div>
      </div>

      <div class="flex flex-col-reverse gap-2 border-t border-black/10 bg-white p-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="inline-flex min-h-11 items-center justify-center rounded-md border border-black/10 px-4 text-sm font-bold transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          onclick={closeManualProjectModal}
          disabled={savingManualProject}
        >
          Cancel
        </button>
        <button
          type="submit"
          class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={savingManualProject}
        >
          {#if savingManualProject}
            <span class="h-4 w-4 rounded-full border-2 border-[#1E1E1E] border-t-transparent animate-spin" aria-hidden="true"></span>
            Adding
          {:else}
            <FilePlus2 class="h-4 w-4" aria-hidden="true" />
            Add Project
          {/if}
        </button>
      </div>
    </form>
  </SlideOver>
{/if}
