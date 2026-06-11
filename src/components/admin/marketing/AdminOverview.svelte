<script>
  import { onMount } from "svelte";
  import {
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
    Trash2,
    X,
  } from "@lucide/svelte";
  import SlideOver from "./SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import DataTable from "../ui/DataTable.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import SearchInput from "../ui/SearchInput.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import StatCard from "../ui/StatCard.svelte";
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

  // Badge tone maps for the whole view: status / priority / source pills.
  const STATUS_TONES = {
    Stuck: "red",
    "In Production": "blue",
    Published: "green",
  };
  const PRIORITY_TONES = { P0: "red", P1: "amber", P2: "teal" };
  const SOURCE_TONES = { manual: "neutral", google_form: "teal" };

  const projectColumns = [
    { key: "title", label: "Project" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "deadline", label: "Deadline", hideBelow: "lg" },
    { key: "publish_date", label: "Publish", hideBelow: "lg" },
    { key: "assigned_to", label: "Assigned", hideBelow: "xl" },
    { key: "copy_approved", label: "Copy" },
    { key: "actions", label: "Actions" },
  ];

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
  let confirmingSaveProject = null;
  let saveConfirmResolve = null;
  let confirmingDeleteProject = null;

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

    const confirmed = await requestSaveConfirmation(project);

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
      confirmingSaveProject = null;
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
    confirmingSaveProject = null;
    successMessage = `"${data.title}" was saved.`;

    await onProjectsChanged();
    return data;
  }

  function requestSaveConfirmation(project) {
    confirmingSaveProject = project;

    return new Promise((resolve) => {
      saveConfirmResolve = resolve;
    });
  }

  function resolveSaveConfirmation(confirmed) {
    const resolve = saveConfirmResolve;

    saveConfirmResolve = null;

    if (!confirmed) {
      confirmingSaveProject = null;
    }

    if (resolve) resolve(confirmed);
  }

  function requestDeleteProject(project) {
    confirmingDeleteProject = project;
  }

  async function deleteProject(project) {
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
    confirmingDeleteProject = null;
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

  function getPriorityTone(priority) {
    return PRIORITY_TONES[priority] || "neutral";
  }

  function getStatusTone(status) {
    if (STATUS_TONES[status]) return STATUS_TONES[status];
    if (status?.startsWith("Ready")) return "amber";
    return "neutral";
  }

  function getSourceTone(source) {
    return SOURCE_TONES[source] || "neutral";
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
  <Banner tone="error">
    <p class="font-bold">Unauthorized</p>
    <p class="mt-1">
      This admin view is available to superusers and admins with Marketing access.
      A superuser can update module access from User Access.
    </p>
  </Banner>
{:else}
  <section class="space-y-5" aria-labelledby="admin-title">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">
          Admin controls
        </p>
        <h3 id="admin-title" class="mt-1 text-2xl font-bold text-ink">Admin Overview</h3>
      </div>

      <Button icon={RefreshCw} loading={isRefreshing} onclick={loadAdminData}>
        Refresh
      </Button>
    </div>

    {#if errorMessage}
      <Banner tone="error" message={errorMessage} />
    {/if}

    {#if successMessage}
      <Banner tone="success" message={successMessage} />
    {/if}

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Team accounts" value={accountUsers.length} tone="neutral" loading={isLoading} />
      <StatCard label="Intake queue" value={intakeProjects.length} tone="gold" loading={isLoading} />
      <StatCard label="Copy pending" value={copyPendingCount} tone="rose" loading={isLoading} />
      <StatCard label="Total projects" value={allProjects.length} tone="teal" loading={isLoading} />
    </div>

    <Panel title="Google Forms Intake Queue" id="google-forms-intake-queue" loading={isLoading}>
      {#if isLoading}
        <div class="grid gap-4 xl:grid-cols-2">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      {:else if intakeProjects.length}
        <div class="grid gap-4 xl:grid-cols-2">
          {#each intakeProjects as project}
            {@const draft = getDraft(project.id)}
            {@const payloadEntries = getPayloadEntries(project.intake_payload)}
            {@const searchValue = assignmentSearches[project.id] || ""}

            <article class="rounded-card border border-amber-200 bg-amber-50/45 p-4 shadow-card">
              <div class="flex flex-col gap-2 border-b border-amber-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <Badge tone="amber" class="uppercase tracking-[0.12em]">Pending Review</Badge>
                  <h4 class="mt-3 text-lg font-bold leading-tight text-ink">{project.title}</h4>
                  <p class="mt-1 text-sm text-ink/70">
                    Contact: {project.intake_contact_name || project.intake_respondent_email || "Unknown"}
                  </p>
                </div>
                <p class="text-sm font-semibold text-ink/60">
                  {formatDateTime(project.intake_submitted_at)}
                </p>
              </div>

              <div class="mt-4 rounded-control border border-amber-200 bg-white p-3">
                <div class="mb-3 flex items-center gap-2">
                  <Inbox class="h-4 w-4 text-accent" aria-hidden="true" />
                  <h5 class="font-bold text-ink">Request details</h5>
                </div>

                {#if payloadEntries.length}
                  <dl class="grid gap-2 text-sm">
                    {#each payloadEntries as entry}
                      <div class="rounded-control bg-canvas/70 px-3 py-2">
                        <dt class="font-bold text-ink">{entry.key}</dt>
                        <dd class="mt-1 whitespace-pre-wrap break-words text-ink/70">
                          {entry.value}
                        </dd>
                      </div>
                    {/each}
                  </dl>
                {:else}
                  <p class="rounded-control border border-dashed border-ink/15 bg-canvas/70 px-3 py-4 text-sm text-ink/60">
                    No intake payload was attached to this submission.
                  </p>
                {/if}
              </div>

              <form class="mt-4 grid gap-4" onsubmit={(event) => approveIntake(event, project)}>
                <div>
                  <p class="text-sm font-semibold text-ink">Assign team members</p>
                  <div class="mt-1.5 rounded-control border border-ink/8 bg-white p-3">
                    <SearchInput
                      bind:value={assignmentSearches[project.id]}
                      placeholder="Search account emails"
                      label="Search account emails"
                    />

                    {#if draft.assigned_to?.length}
                      <div class="mt-3 flex flex-wrap gap-1.5">
                        {#each draft.assigned_to as email}
                          <Badge tone="teal" size="xs">{email}</Badge>
                        {/each}
                      </div>
                    {/if}

                    <div class="mt-3 max-h-44 overflow-y-auto rounded-control border border-ink/10">
                      {#each getFilteredTeamMembers(searchValue, assignableTeamMembers) as member}
                        <label class="flex min-h-11 items-center gap-3 border-b border-ink/6 px-3 py-2 text-sm last:border-b-0 hover:bg-canvas/70">
                          <input
                            type="checkbox"
                            class="h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent"
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
                        <p class="px-3 py-4 text-sm text-ink/50">
                          No matching accounts.
                        </p>
                      {/each}
                    </div>
                  </div>
                </div>

                <div class="grid gap-3 md:grid-cols-2">
                  <Field label="Priority" id={`intake-priority-${project.id}`}>
                    <select
                      id={`intake-priority-${project.id}`}
                      class="select"
                      value={draft.priority}
                      onchange={(event) =>
                        updateIntakeDraft(project.id, "priority", event.currentTarget.value)}
                    >
                      {#each priorities as priority}
                        <option value={priority}>{priority}</option>
                      {/each}
                    </select>
                  </Field>

                  <Field label="Initial status" id={`intake-status-${project.id}`}>
                    <select
                      id={`intake-status-${project.id}`}
                      class="select"
                      value={draft.status}
                      onchange={(event) =>
                        updateIntakeDraft(project.id, "status", event.currentTarget.value)}
                    >
                      {#each statuses as status}
                        <option value={status}>{status}</option>
                      {/each}
                    </select>
                  </Field>
                </div>

                <Field label="Edit notes" id={`intake-notes-${project.id}`}>
                  <textarea
                    id={`intake-notes-${project.id}`}
                    class="textarea min-h-28"
                    value={draft.edit_notes}
                    placeholder="Add production notes, scope, links, or next actions."
                    oninput={(event) =>
                      updateIntakeDraft(project.id, "edit_notes", event.currentTarget.value)}
                  ></textarea>
                </Field>

                <Button
                  type="submit"
                  variant="primary"
                  icon={CheckCircle2}
                  loading={savingIntakeId === project.id}
                >
                  {savingIntakeId === project.id ? "Sending" : "Approve & Send to Pipeline"}
                </Button>
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
          <p class="text-sm leading-6 text-ink/60">
            Edit project records, search/filter/sort the full pipeline, export data, or add manual work.
          </p>
          <p class="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
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
          <Button icon={Download} class="whitespace-nowrap" onclick={() => exportProjectsCsv("all")}>
            Export All
          </Button>

          <Button icon={Download} class="whitespace-nowrap" onclick={() => exportProjectsCsv("filtered")}>
            Export Filtered
          </Button>

          <label class="flex items-center gap-2 text-sm font-semibold text-ink/70">
            Rows
            <span class="w-20">
              <select
                class="select"
                value={projectPageSize}
                onchange={(event) => setProjectPageSize(event.currentTarget.value)}
              >
                {#each projectPageSizes as size}
                  <option value={size}>{size}</option>
                {/each}
              </select>
            </span>
          </label>

          <div class="flex items-center gap-2">
            <Button
              onclick={() => setProjectPage(currentProjectPage - 1)}
              disabled={currentProjectPage <= 1}
            >
              Previous
            </Button>
            <span class="min-w-20 text-center text-sm font-bold text-ink/70">
              {currentProjectPage} / {totalProjectPages}
            </span>
            <Button
              onclick={() => setProjectPage(currentProjectPage + 1)}
              disabled={currentProjectPage >= totalProjectPages}
            >
              Next
            </Button>
          </div>

          <Button variant="dark" icon={Plus} class="whitespace-nowrap" onclick={openManualProjectModal}>
            Add Manual Project
          </Button>
        </div>
      </div>

      <div class="mb-4 grid gap-3 rounded-control border border-ink/8 bg-canvas/70 p-3 lg:grid-cols-[minmax(16rem,2fr)_repeat(3,minmax(10rem,1fr))] xl:grid-cols-[minmax(18rem,2fr)_repeat(4,minmax(9rem,1fr))] 2xl:grid-cols-[minmax(18rem,2fr)_repeat(7,minmax(9rem,1fr))]">
        <div class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
          <span>Search</span>
          <SearchInput
            class="mt-2"
            bind:value={projectSearch}
            placeholder="Title, assignee, channel, notes, links"
            label="Search projects"
            onSearch={resetProjectPage}
          />
        </div>

        <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
          Status
          <select
            class="select mt-2"
            bind:value={projectStatusFilter}
            onchange={resetProjectPage}
          >
            <option value="all">All statuses</option>
            {#each statuses as status}
              <option value={status}>{status}</option>
            {/each}
          </select>
        </label>

        <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
          Priority
          <select
            class="select mt-2"
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

        <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
          Assignee
          <select
            class="select mt-2"
            bind:value={projectAssigneeFilter}
            onchange={resetProjectPage}
          >
            <option value="all">All assignees</option>
            {#each assigneeFilterOptions as email}
              <option value={email}>{email}</option>
            {/each}
          </select>
        </label>

        <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
          Source
          <select
            class="select mt-2"
            bind:value={projectSourceFilter}
            onchange={resetProjectPage}
          >
            <option value="all">All sources</option>
            {#each projectSourceOptions as source}
              <option value={source}>{source}</option>
            {/each}
          </select>
        </label>

        <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
          Copy
          <select
            class="select mt-2"
            bind:value={projectCopyFilter}
            onchange={resetProjectPage}
          >
            <option value="all">All copy states</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
          </select>
        </label>

        <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
          Review
          <select
            class="select mt-2"
            bind:value={projectReviewFilter}
            onchange={resetProjectPage}
          >
            <option value="all">All review states</option>
            <option value="reviewed">Reviewed</option>
            <option value="unreviewed">Unreviewed</option>
          </select>
        </label>

        <div class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
          <label for="project-sort-field">Sort by</label>
          <select
            id="project-sort-field"
            class="select mt-2"
            bind:value={projectSortField}
            onchange={(event) => updateProjectSortField(event.currentTarget.value)}
          >
            {#each projectSortOptions as option}
              <option value={option.field}>{option.label}</option>
            {/each}
          </select>
        </div>

        <div class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
          <label for="project-sort-direction">Direction</label>
          <select
            id="project-sort-direction"
            class="select mt-2"
            bind:value={projectSortDirection}
            onchange={(event) => setProjectSortDirection(event.currentTarget.value)}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>

        <div class="flex items-end">
          <Button icon={RotateCcw} class="w-full" onclick={resetProjectFilters}>
            Reset Filters
          </Button>
        </div>
      </div>

      <DataTable
        columns={projectColumns}
        rows={visibleProjects}
        rowKey="id"
        loading={isLoading}
        minWidth="68rem"
        emptyTitle="No projects yet"
        emptyMessage="Add a manual project or approve an intake request to start the pipeline."
        onRowClick={(project) => openProjectDrawer(project)}
        class="max-h-[64vh]"
      >
        <svelte:fragment slot="cell" let:row let:column>
          {#if column.key === "title"}
            <div class="min-w-0 max-w-[24rem]">
              <p class="line-clamp-2 font-bold leading-snug text-ink">{row.title}</p>
              <p class="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-ink/50">
                <span>{formatTags(row.channel_tags) || "General"}</span>
                <Badge tone={getSourceTone(row.source)} size="xs">{row.source || "manual"}</Badge>
              </p>
            </div>
          {:else if column.key === "status"}
            <Badge tone={getStatusTone(row.status)}>{row.status}</Badge>
          {:else if column.key === "priority"}
            <Badge tone={getPriorityTone(row.priority)}>{row.priority || "Unset"}</Badge>
          {:else if column.key === "deadline"}
            {formatDate(row.deadline)}
          {:else if column.key === "publish_date"}
            {formatDate(row.publish_date)}
          {:else if column.key === "assigned_to"}
            <span class="line-clamp-1 max-w-[15rem]">{formatAssignedBrief(row)}</span>
          {:else if column.key === "copy_approved"}
            <span class="flex flex-wrap items-center gap-1">
              <Badge tone={row.copy_approved ? "green" : "amber"}>
                {row.copy_approved ? "Approved" : "Pending"}
              </Badge>
              {#if row.intake_reviewed === false}
                <Badge tone="red">Unreviewed</Badge>
              {/if}
            </span>
          {:else if column.key === "actions"}
            <div class="flex items-center gap-2">
              <Button
                size="sm"
                iconOnly
                icon={Pencil}
                label={`Edit ${row.title}`}
                title="Edit project"
                onclick={(event) => {
                  event.stopPropagation();
                  openEditProjectModal(row);
                }}
              />

              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                title="Delete project"
                loading={deletingProjectId === row.id}
                onclick={(event) => {
                  event.stopPropagation();
                  requestDeleteProject(row);
                }}
              >
                {deletingProjectId === row.id ? "Deleting" : "Delete"}<span class="sr-only"> {row.title}</span>
              </Button>
            </div>
          {/if}
        </svelte:fragment>

        <svelte:fragment slot="card" let:row>
          <div class="rounded-card border border-ink/8 bg-white p-4 shadow-card">
            <button
              type="button"
              class="block w-full text-left"
              onclick={() => openProjectDrawer(row)}
            >
              <p class="font-bold leading-snug text-ink">{row.title}</p>
              <p class="mt-1 text-xs font-semibold text-ink/50">
                {formatTags(row.channel_tags) || "General"} · {row.source || "manual"}
              </p>
              <span class="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={getStatusTone(row.status)} size="xs">{row.status}</Badge>
                <Badge tone={getPriorityTone(row.priority)} size="xs">{row.priority || "Unset"}</Badge>
                <Badge tone={row.copy_approved ? "green" : "amber"} size="xs">
                  {row.copy_approved ? "Copy approved" : "Copy pending"}
                </Badge>
                {#if row.intake_reviewed === false}
                  <Badge tone="red" size="xs">Unreviewed</Badge>
                {/if}
              </span>
              <p class="mt-2 text-xs text-ink/60">
                Deadline {formatDate(row.deadline)} · Publish {formatDate(row.publish_date)}
              </p>
              <p class="mt-1 truncate text-xs text-ink/60">{formatAssignedBrief(row)}</p>
            </button>
            <div class="mt-3 flex items-center gap-2">
              <Button size="sm" icon={Pencil} onclick={() => openEditProjectModal(row)}>
                Edit<span class="sr-only"> {row.title}</span>
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                loading={deletingProjectId === row.id}
                onclick={() => requestDeleteProject(row)}
              >
                {deletingProjectId === row.id ? "Deleting" : "Delete"}<span class="sr-only"> {row.title}</span>
              </Button>
            </div>
          </div>
        </svelte:fragment>
      </DataTable>
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
        <div class="border-b border-ink/10 bg-ink px-5 py-5 text-white">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
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
                <Field label="Project title" id="edit-project-title" required>
                  <input
                    id="edit-project-title"
                    type="text"
                    class="input"
                    value={draft.title}
                    oninput={(event) => updateProjectDraft(editingProject.id, "title", event.currentTarget.value)}
                    required
                  />
                </Field>

                <div class="grid gap-3 md:grid-cols-3">
                  <Field label="Status" id="edit-project-status">
                    <select
                      id="edit-project-status"
                      class="select"
                      value={draft.status}
                      onchange={(event) => updateProjectDraft(editingProject.id, "status", event.currentTarget.value)}
                    >
                      {#each statuses as status}
                        <option value={status}>{status}</option>
                      {/each}
                    </select>
                  </Field>

                  <Field label="Priority" id="edit-project-priority">
                    <select
                      id="edit-project-priority"
                      class="select"
                      value={draft.priority || ""}
                      onchange={(event) => updateProjectDraft(editingProject.id, "priority", event.currentTarget.value)}
                    >
                      <option value="">Unset</option>
                      {#each priorities as priority}
                        <option value={priority}>{priority}</option>
                      {/each}
                    </select>
                  </Field>

                  <Field label="Source" id="edit-project-source">
                    <select
                      id="edit-project-source"
                      class="select"
                      value={draft.source}
                      onchange={(event) => updateProjectDraft(editingProject.id, "source", event.currentTarget.value)}
                    >
                      {#each projectSourceOptions as source}
                        <option value={source}>{source}</option>
                      {/each}
                    </select>
                  </Field>
                </div>

                <div class="grid gap-3 md:grid-cols-2">
                  <Field label="Deadline" id="edit-project-deadline">
                    <input
                      id="edit-project-deadline"
                      type="date"
                      class="input"
                      value={draft.deadline}
                      onchange={(event) => updateProjectDraft(editingProject.id, "deadline", event.currentTarget.value)}
                    />
                  </Field>

                  <Field label="Publish date" id="edit-project-publish-date">
                    <input
                      id="edit-project-publish-date"
                      type="date"
                      class="input"
                      value={draft.publish_date}
                      onchange={(event) => updateProjectDraft(editingProject.id, "publish_date", event.currentTarget.value)}
                    />
                  </Field>
                </div>

                <div class="grid gap-3 md:grid-cols-3">
                  <Field label="Details URL" id="edit-project-details-url">
                    <input
                      id="edit-project-details-url"
                      type="url"
                      class="input"
                      value={draft.details_url}
                      oninput={(event) => updateProjectDraft(editingProject.id, "details_url", event.currentTarget.value)}
                    />
                  </Field>

                  <Field label="Files URL" id="edit-project-files-url">
                    <input
                      id="edit-project-files-url"
                      type="url"
                      class="input"
                      value={draft.files_url}
                      oninput={(event) => updateProjectDraft(editingProject.id, "files_url", event.currentTarget.value)}
                    />
                  </Field>

                  <Field label="Deliverables URL" id="edit-project-deliverables-url">
                    <input
                      id="edit-project-deliverables-url"
                      type="url"
                      class="input"
                      value={draft.deliverables_url}
                      oninput={(event) => updateProjectDraft(editingProject.id, "deliverables_url", event.currentTarget.value)}
                    />
                  </Field>
                </div>

                <section class="rounded-control border border-ink/8 bg-canvas/70 p-3" aria-labelledby="edit-project-assignment-title">
                  <h4 id="edit-project-assignment-title" class="text-sm font-bold text-ink">
                    Assign team members
                  </h4>

                  <SearchInput
                    class="mt-2"
                    bind:value={editProjectAssignmentSearch}
                    placeholder="Search teammates"
                    label="Search teammates"
                  />

                  {#if draft.assigned_to?.length}
                    <div class="mt-3 flex flex-wrap gap-1.5">
                      {#each draft.assigned_to as email}
                        <Badge tone="teal" size="xs">{email}</Badge>
                      {/each}
                    </div>
                  {/if}

                  <div class="mt-3 max-h-48 overflow-y-auto rounded-control border border-ink/10 bg-white">
                    {#each getProjectAssignmentOptions(editingProject, draft, editProjectAssignmentSearch, assignableTeamMembers) as option}
                      <label class="flex min-h-10 items-center gap-3 border-b border-ink/6 px-3 py-2 text-sm last:border-b-0 hover:bg-canvas/70">
                        <input
                          type="checkbox"
                          class="h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent"
                          checked={isProjectAssigned(draft, option.email)}
                          onchange={(event) =>
                            updateProjectAssignment(editingProject.id, option.email, event.currentTarget.checked)}
                        />
                        <span>{option.label}</span>
                      </label>
                    {:else}
                      <p class="px-3 py-4 text-sm text-ink/50">
                        No matching accounts.
                      </p>
                    {/each}
                  </div>
                </section>

                <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
                  <section class="rounded-control border border-ink/8 bg-canvas/70 p-3" aria-labelledby="edit-project-channels-title">
                    <h4 id="edit-project-channels-title" class="text-sm font-bold text-ink">
                      Channels
                    </h4>

                    <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {#each channelOptions as channel}
                        <label class="flex min-h-10 items-center gap-2 rounded-control border border-ink/10 bg-white px-3 py-2 text-sm font-semibold transition hover:border-accent/30">
                          <input
                            type="checkbox"
                            class="h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent"
                            checked={isChannelSelected(draft.channel_tags, channel)}
                            onchange={(event) =>
                              updateProjectChannel(editingProject.id, channel, event.currentTarget.checked)}
                          />
                          {channel}
                        </label>
                      {/each}
                    </div>

                    {#if getCustomChannelTags(draft.channel_tags).length}
                      <div class="mt-3 rounded-control border border-amber-200 bg-amber-50 px-3 py-2">
                        <p class="text-xs font-bold uppercase tracking-[0.1em] text-amber-800">
                          Existing custom tags
                        </p>
                        <div class="mt-2 flex flex-wrap gap-1.5">
                          {#each getCustomChannelTags(draft.channel_tags) as tag}
                            <Badge tone="amber" size="xs">{tag}</Badge>
                          {/each}
                        </div>
                      </div>
                    {/if}
                  </section>

                  <label class="flex min-h-10 items-center gap-3 self-end rounded-control border border-ink/10 bg-white px-3 py-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      role="switch"
                      class="h-5 w-5 rounded border-ink/20 text-accent focus:ring-accent"
                      checked={draft.copy_approved}
                      onchange={(event) => updateProjectDraft(editingProject.id, "copy_approved", event.currentTarget.checked)}
                    />
                    Copy approved
                  </label>
                </div>

                <div class="grid gap-3 md:grid-cols-3">
                  <Field label="Contact" id="edit-project-contact">
                    <input
                      id="edit-project-contact"
                      type="text"
                      class="input"
                      value={draft.intake_contact_name}
                      oninput={(event) => updateProjectDraft(editingProject.id, "intake_contact_name", event.currentTarget.value)}
                    />
                  </Field>

                  <Field label="Respondent email" id="edit-project-respondent-email">
                    <input
                      id="edit-project-respondent-email"
                      type="email"
                      class="input"
                      value={draft.intake_respondent_email}
                      oninput={(event) => updateProjectDraft(editingProject.id, "intake_respondent_email", event.currentTarget.value)}
                    />
                  </Field>

                  <Field label="Intake urgency" id="edit-project-urgency">
                    <input
                      id="edit-project-urgency"
                      type="number"
                      min="1"
                      max="5"
                      class="input"
                      value={draft.intake_urgency}
                      oninput={(event) => updateProjectDraft(editingProject.id, "intake_urgency", event.currentTarget.value)}
                    />
                  </Field>
                </div>

                <label class="flex min-h-10 items-center gap-3 rounded-control border border-ink/10 bg-white px-3 py-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    class="h-5 w-5 rounded border-ink/20 text-accent focus:ring-accent"
                    checked={draft.intake_reviewed}
                    onchange={(event) => updateProjectDraft(editingProject.id, "intake_reviewed", event.currentTarget.checked)}
                  />
                  Intake reviewed
                </label>

                <Field label="Timeline / notes" id="edit-project-notes">
                  <textarea
                    id="edit-project-notes"
                    class="textarea min-h-32"
                    value={draft.edit_notes}
                    oninput={(event) => updateProjectDraft(editingProject.id, "edit_notes", event.currentTarget.value)}
                  ></textarea>
                </Field>
              </div>
            </div>

            <div class="flex flex-col-reverse gap-2 border-t border-ink/8 bg-white p-4 sm:flex-row sm:justify-end">
              <Button
                onclick={cancelProjectDrawerEdit}
                disabled={savingProjectId === editingProject.id}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                icon={Save}
                loading={savingProjectId === editingProject.id}
                disabled={!isProjectDraftDirty(editingProject) || savingProjectId === editingProject.id}
              >
                {savingProjectId === editingProject.id ? "Saving" : "Save Changes"}
              </Button>
            </div>
          </form>
        {:else}
          <div class="flex-1 overflow-y-auto px-5 py-5">
            <div class="flex flex-wrap gap-2">
              <Badge tone={getStatusTone(editingProject.status)}>{editingProject.status}</Badge>
              <Badge tone={getPriorityTone(editingProject.priority)}>
                {editingProject.priority || "Priority unset"}
              </Badge>
              <Badge tone={editingProject.copy_approved ? "green" : "amber"}>
                {editingProject.copy_approved ? "Copy approved" : "Copy pending"}
              </Badge>
            </div>

            <dl class="mt-5 grid gap-3 sm:grid-cols-2">
              {#each getProjectDetailRows(editingProject) as row}
                <div class="rounded-control border border-ink/8 bg-canvas/70 px-4 py-3">
                  <dt class="text-xs font-bold uppercase tracking-[0.1em] text-ink/50">
                    {row.label}
                  </dt>
                  <dd class="mt-1 break-words text-sm font-semibold text-ink/80">
                    {row.value}
                  </dd>
                </div>
              {/each}
            </dl>

            {#if detailLinks.length || detailReferences.length}
              <section class="mt-5 rounded-control border border-ink/8 bg-white p-4" aria-labelledby="project-drawer-links">
                <h4 id="project-drawer-links" class="font-bold text-ink">External links</h4>
                {#if detailLinks.length}
                  <div class="mt-3 flex flex-wrap gap-2">
                    {#each detailLinks as link}
                      <a
                        class="inline-flex min-h-10 items-center gap-2 rounded-control border border-ink/10 px-3 text-sm font-bold text-accent-strong transition hover:border-accent/40 hover:bg-accent-soft"
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
                      <div class="rounded-control bg-canvas/70 px-3 py-2">
                        <dt class="text-xs font-bold uppercase tracking-[0.1em] text-ink/50">
                          {reference.label}
                        </dt>
                        <dd class="mt-1 break-words text-sm text-ink/70">
                          {reference.value}
                        </dd>
                      </div>
                    {/each}
                  </dl>
                {/if}
              </section>
            {/if}

            <section class="mt-5 rounded-control border border-ink/8 bg-white p-4" aria-labelledby="project-drawer-notes">
              <h4 id="project-drawer-notes" class="font-bold text-ink">Timeline / notes</h4>
              <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/70">
                {editingProject.edit_notes || "No timeline notes yet."}
              </p>
            </section>

            {#if payloadEntries.length}
              <section class="mt-5 rounded-control border border-ink/8 bg-white p-4" aria-labelledby="project-drawer-intake">
                <h4 id="project-drawer-intake" class="font-bold text-ink">Intake payload</h4>
                <dl class="mt-3 grid gap-2 text-sm">
                  {#each payloadEntries as entry}
                    <div class="rounded-control bg-canvas/70 px-3 py-2">
                      <dt class="font-bold text-ink">{entry.key}</dt>
                      <dd class="mt-1 whitespace-pre-wrap break-words text-ink/70">
                        {entry.value}
                      </dd>
                    </div>
                  {/each}
                </dl>
              </section>
            {/if}
          </div>

          <div class="flex flex-col-reverse gap-2 border-t border-ink/8 bg-white p-4 sm:flex-row sm:justify-end">
            <Button onclick={closeEditProjectModal}>
              Close
            </Button>
            <Button variant="primary" icon={Pencil} onclick={startProjectDrawerEdit}>
              Edit Details
            </Button>
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
      <div class="border-b border-ink/10 bg-ink px-5 py-5 text-white">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
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
          <Field label="Project title" id="manual-project-title" required>
            <input
              id="manual-project-title"
              type="text"
              class="input"
              bind:value={manualForm.title}
              required
            />
          </Field>

          <div class="grid gap-3 md:grid-cols-2">
            <Field label="Priority" id="manual-project-priority">
              <select
                id="manual-project-priority"
                class="select"
                bind:value={manualForm.priority}
              >
                {#each priorities as priority}
                  <option value={priority}>{priority}</option>
                {/each}
              </select>
            </Field>

            <Field label="Status" id="manual-project-status">
              <select
                id="manual-project-status"
                class="select"
                bind:value={manualForm.status}
              >
                {#each statuses as status}
                  <option value={status}>{status}</option>
                {/each}
              </select>
            </Field>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <Field label="Deadline" id="manual-project-deadline">
              <input
                id="manual-project-deadline"
                type="date"
                class="input"
                bind:value={manualForm.deadline}
              />
            </Field>

            <Field label="Publish date" id="manual-project-publish-date">
              <input
                id="manual-project-publish-date"
                type="date"
                class="input"
                bind:value={manualForm.publish_date}
              />
            </Field>
          </div>

          <div class="grid gap-3 md:grid-cols-3">
            <Field label="Details URL" id="manual-project-details-url">
              <input
                id="manual-project-details-url"
                type="url"
                class="input"
                bind:value={manualForm.details_url}
              />
            </Field>

            <Field label="Files URL" id="manual-project-files-url">
              <input
                id="manual-project-files-url"
                type="url"
                class="input"
                bind:value={manualForm.files_url}
              />
            </Field>

            <Field label="Deliverables URL" id="manual-project-deliverables-url">
              <input
                id="manual-project-deliverables-url"
                type="url"
                class="input"
                bind:value={manualForm.deliverables_url}
              />
            </Field>
          </div>

          <div>
            <p class="text-sm font-semibold text-ink">Assign team members</p>
            <div class="mt-1.5 rounded-control border border-ink/8 bg-white p-3">
              <SearchInput
                bind:value={manualTeamSearch}
                placeholder="Search account emails"
                label="Search account emails"
              />

              {#if manualForm.assigned_to?.length}
                <div class="mt-3 flex flex-wrap gap-1.5">
                  {#each manualForm.assigned_to as email}
                    <Badge tone="teal" size="xs">{email}</Badge>
                  {/each}
                </div>
              {/if}

              <div class="mt-3 max-h-44 overflow-y-auto rounded-control border border-ink/10">
                {#each getFilteredTeamMembers(manualTeamSearch, assignableTeamMembers) as member}
                  <label class="flex min-h-11 items-center gap-3 border-b border-ink/6 px-3 py-2 text-sm last:border-b-0 hover:bg-canvas/70">
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent"
                      checked={manualForm.assigned_to?.includes(member.email)}
                      onchange={(event) =>
                        updateManualAssignment(member.email, event.currentTarget.checked)}
                    />
                    <span>{formatMember(member)}</span>
                  </label>
                {:else}
                  <p class="px-3 py-4 text-sm text-ink/50">
                    No matching accounts.
                  </p>
                {/each}
              </div>
            </div>
          </div>

          <section class="rounded-control border border-ink/8 bg-canvas/70 p-3" aria-labelledby="manual-project-channels-title">
            <h4 id="manual-project-channels-title" class="text-sm font-bold text-ink">
              Channels
            </h4>

            <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {#each channelOptions as channel}
                <label class="flex min-h-10 items-center gap-2 rounded-control border border-ink/10 bg-white px-3 py-2 text-sm font-semibold transition hover:border-accent/30">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent"
                    checked={isChannelSelected(manualForm.channel_tags, channel)}
                    onchange={(event) => updateManualChannel(channel, event.currentTarget.checked)}
                  />
                  {channel}
                </label>
              {/each}
            </div>
          </section>

          <Field label="Edit notes" id="manual-project-notes">
            <textarea
              id="manual-project-notes"
              class="textarea min-h-28"
              bind:value={manualForm.edit_notes}
            ></textarea>
          </Field>
        </div>
      </div>

      <div class="flex flex-col-reverse gap-2 border-t border-ink/8 bg-white p-4 sm:flex-row sm:justify-end">
        <Button
          onclick={closeManualProjectModal}
          disabled={savingManualProject}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          icon={FilePlus2}
          loading={savingManualProject}
        >
          {savingManualProject ? "Adding" : "Add Project"}
        </Button>
      </div>
    </form>
  </SlideOver>

  <ConfirmDialog
    open={Boolean(confirmingSaveProject)}
    title="Save project changes"
    message={`Save changes to "${confirmingSaveProject?.title}"? These updates will apply across Workspace, Kanban, Project Calendar, and Publishing Calendar.`}
    confirmLabel="Save Changes"
    tone="primary"
    busy={Boolean(confirmingSaveProject) && savingProjectId === confirmingSaveProject?.id}
    onConfirm={() => resolveSaveConfirmation(true)}
    onCancel={() => resolveSaveConfirmation(false)}
  />

  <ConfirmDialog
    open={Boolean(confirmingDeleteProject)}
    title="Delete project"
    message={`Delete "${confirmingDeleteProject?.title}"? This cannot be undone.`}
    confirmLabel="Delete"
    tone="danger"
    busy={Boolean(deletingProjectId)}
    onConfirm={() => deleteProject(confirmingDeleteProject)}
    onCancel={() => (confirmingDeleteProject = null)}
  />
{/if}
