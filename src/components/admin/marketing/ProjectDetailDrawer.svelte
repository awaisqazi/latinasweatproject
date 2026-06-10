<script>
  import {
    CalendarClock,
    CheckCircle2,
    CircleAlert,
    ExternalLink,
    Search,
    UserPlus,
  } from "@lucide/svelte";
  import { isOperationalAdmin } from "../../../lib/dashboard/roles";
  import ProjectTimeline from "./ProjectTimeline.svelte";
  import PublishScheduleDialog from "./PublishScheduleDialog.svelte";
  import SlideOver from "./SlideOver.svelte";

  export let project = null;
  export let supabase;
  export let teamMembers = [];
  export let currentUserEmail = "";
  export let currentUserRole = "member";
  export let availableStatuses = [];
  export let scheduleProjects = [];
  export let eyebrow = "Project details";
  export let onClose = () => {};
  export let onProjectUpdated = () => {};

  let displayedProject = null;
  let drawerOpen = false;
  let assignmentSearch = "";
  let assignmentSaving = false;
  let assignmentError = "";
  let assignmentSuccess = "";
  let statusSaving = false;
  let statusError = "";
  let statusSuccess = "";
  let prioritySaving = false;
  let priorityError = "";
  let prioritySuccess = "";
  let publishScheduleOpen = false;
  let publishScheduleSaving = false;
  let publishScheduleError = "";
  let timelineRefreshKey = 0;

  const defaultStatuses = [
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
  const priorityOptions = ["P0", "P1", "P2"];
  const projectSelectColumns =
    "id,title,priority,status,deadline,publish_date,details_url,copy_approved,files_url,deliverables_url,assigned_to,edit_notes,channel_tags,source,intake_reviewed,intake_submitted_at";

  $: if (project?.id && project.id !== displayedProject?.id) {
    openDrawer(project);
  }
  $: assignedEmails = getAssignedEmails(displayedProject);
  $: filteredTeamMembers = getFilteredTeamMembers(assignmentSearch);
  $: currentUserIsAssigned = assignedEmails.some(
    (email) => normalizeEmail(email) === normalizeEmail(currentUserEmail),
  );
  $: isCurrentUserAdmin = isOperationalAdmin(currentUserRole);
  $: statusOptions = getStatusOptions(displayedProject?.status);
  $: unlistedAssignedEmails = assignedEmails.filter(
    (email) =>
      !teamMembers.some((member) => normalizeEmail(member.email) === normalizeEmail(email)),
  );

  function openDrawer(nextProject) {
    displayedProject = nextProject;
    assignmentSearch = "";
    assignmentError = "";
    assignmentSuccess = "";
    statusError = "";
    statusSuccess = "";
    priorityError = "";
    prioritySuccess = "";
    publishScheduleOpen = false;
    publishScheduleError = "";
    drawerOpen = true;
  }

  function requestClose() {
    if (assignmentSaving || statusSaving || prioritySaving || publishScheduleSaving) {
      return;
    }

    drawerOpen = false;
  }

  function handleClose() {
    publishScheduleOpen = false;
    publishScheduleError = "";
    displayedProject = null;
    onClose();
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
    return "bg-gray-50 text-gray-700 border-gray-200";
  }

  function getDateLabel(item) {
    if (!item) return "No date";

    if (item.calendar_date) {
      return `${item.calendar_date_type || "Scheduled"}: ${formatDate(item.calendar_date)}`;
    }

    if (item.publish_date) {
      return `Publish: ${formatDate(item.publish_date)}`;
    }

    if (item.deadline) {
      return `Deadline: ${formatDate(item.deadline)}`;
    }

    return "No date";
  }

  function formatChannelTags(tags) {
    if (!Array.isArray(tags) || !tags.length) return "General";
    return tags.map((tag) => String(tag).trim()).filter(Boolean).join(", ") || "General";
  }

  function isLikelyUrl(value) {
    return /^https?:\/\//i.test(value || "");
  }

  function getProjectLinks(item) {
    if (!item) return [];

    return [
      { label: "Details", url: item.details_url },
      { label: "Files", url: item.files_url },
      { label: "Deliverables", url: item.deliverables_url },
    ].filter((link) => isLikelyUrl(link.url));
  }

  function getProjectReferences(item) {
    if (!item) return [];

    return [
      { label: "Files", value: item.files_url },
      { label: "Deliverables", value: item.deliverables_url },
    ].filter((reference) => reference.value && !isLikelyUrl(reference.value));
  }

  function getAllStatuses() {
    return availableStatuses.length ? availableStatuses : defaultStatuses;
  }

  function getStatusOptions(currentStatus) {
    if (isCurrentUserAdmin) return getAllStatuses();
    if (memberMovableStatuses.includes(currentStatus)) return memberMovableStatuses;
    return currentStatus ? [currentStatus] : [];
  }

  function canMoveToStatus(targetStatus) {
    if (!displayedProject?.id || targetStatus === displayedProject.status) return false;
    if (isCurrentUserAdmin) return true;

    return (
      memberMovableStatuses.includes(displayedProject.status) &&
      memberMovableStatuses.includes(targetStatus)
    );
  }

  async function updateProjectStatus(targetStatus) {
    if (!displayedProject || statusSaving || targetStatus === displayedProject.status) return;

    if (!canMoveToStatus(targetStatus)) {
      statusError =
        "Members can move projects among production, copy, review, and stuck. Admin-only lanes stay protected.";
      return;
    }

    if (targetStatus === "Ready to Publish" && isCurrentUserAdmin) {
      openPublishScheduler();
      return;
    }

    const previousStatus = displayedProject.status;
    statusSaving = true;
    statusError = "";
    statusSuccess = "";

    const { data, error } = await supabase
      .from("projects")
      .update({ status: targetStatus })
      .eq("id", displayedProject.id)
      .select(projectSelectColumns)
      .single();

    if (error) {
      statusError = error.message;
      statusSaving = false;
      return;
    }

    displayedProject = data;
    onProjectUpdated(data);
    timelineRefreshKey += 1;
    statusSuccess = `Moved from ${previousStatus} to ${targetStatus}.`;
    statusSaving = false;
  }

  function openPublishScheduler() {
    publishScheduleOpen = true;
    publishScheduleError = "";
    statusError = "";
    statusSuccess = "";
  }

  function closePublishScheduler() {
    if (publishScheduleSaving) return;

    publishScheduleOpen = false;
    publishScheduleError = "";
  }

  async function confirmPublishSchedule(date) {
    if (!displayedProject || publishScheduleSaving || !date) return;

    const previousStatus = displayedProject.status;
    publishScheduleSaving = true;
    statusSaving = true;
    publishScheduleError = "";
    statusError = "";
    statusSuccess = "";

    const { data, error } = await supabase
      .from("projects")
      .update({ status: "Ready to Publish", publish_date: date })
      .eq("id", displayedProject.id)
      .select(projectSelectColumns)
      .single();

    if (error) {
      publishScheduleError = error.message;
      statusError = error.message;
      publishScheduleSaving = false;
      statusSaving = false;
      return;
    }

    displayedProject = data;
    onProjectUpdated(data);
    timelineRefreshKey += 1;
    statusSuccess = `Moved from ${previousStatus} to Ready to Publish and scheduled for ${formatDate(date)}.`;
    publishScheduleSaving = false;
    statusSaving = false;
    publishScheduleOpen = false;
  }

  async function updateProjectPriority(targetPriority) {
    if (!displayedProject || prioritySaving) return;

    const nextPriority = targetPriority || null;

    if ((displayedProject.priority || null) === nextPriority) return;

    if (!isCurrentUserAdmin) {
      priorityError = "Only admins can change priority.";
      return;
    }

    prioritySaving = true;
    priorityError = "";
    prioritySuccess = "";

    const { data, error } = await supabase
      .from("projects")
      .update({ priority: nextPriority })
      .eq("id", displayedProject.id)
      .select(projectSelectColumns)
      .single();

    if (error) {
      priorityError = error.message;
      prioritySaving = false;
      return;
    }

    displayedProject = data;
    onProjectUpdated(data);
    prioritySuccess = `Priority changed to ${data.priority || "Unset"}.`;
    prioritySaving = false;
  }

  async function toggleAssignment(email, checked) {
    if (!displayedProject || assignmentSaving) return;

    if (!checked && !canUnassignWithCheckbox(email)) {
      assignmentError =
        "Only admins can remove another teammate's assignment. Use I'm Done to complete your own assignment.";
      return;
    }

    const nextAssignedTo = checked
      ? normalizeAssignedEmails([...assignedEmails, email])
      : assignedEmails.filter(
          (assignedEmail) => normalizeEmail(assignedEmail) !== normalizeEmail(email),
        );

    const assigneeLabel = getAssigneeLabel(email);

    await saveAssignments(
      nextAssignedTo,
      checked ? "Assignment added." : "Assignment removed.",
      checked
        ? `Assigned this project to ${assigneeLabel}.`
        : `Removed assignment for ${assigneeLabel}.`,
    );
  }

  async function completeMyAssignment() {
    if (!displayedProject || !currentUserIsAssigned || assignmentSaving) return;

    const nextAssignedTo = assignedEmails.filter(
      (email) => normalizeEmail(email) !== normalizeEmail(currentUserEmail),
    );

    await saveAssignments(
      nextAssignedTo,
      "Your assignment is complete.",
      "Completed their assignment.",
    );
  }

  async function saveAssignments(nextAssignedTo, successText, timelineBody = "") {
    assignmentSaving = true;
    assignmentError = "";
    assignmentSuccess = "";

    const { data, error } = await supabase
      .from("projects")
      .update({ assigned_to: normalizeAssignedEmails(nextAssignedTo) })
      .eq("id", displayedProject.id)
      .select(projectSelectColumns)
      .single();

    if (error) {
      assignmentError = error.message;
      assignmentSaving = false;
      return;
    }

    displayedProject = data;
    onProjectUpdated(data);

    if (timelineBody) {
      await addTimelineLog(data.id, timelineBody);
    }

    assignmentSuccess = successText;
    assignmentSaving = false;
  }

  async function addTimelineLog(projectId, body) {
    const { error } = await supabase
      .from("project_comments")
      .insert({
        project_id: projectId,
        body,
      });

    if (error) {
      assignmentError = `Assignment saved, but the timeline could not be updated: ${error.message}`;
      return;
    }

    timelineRefreshKey += 1;
  }

  function getAssignedEmails(item) {
    if (!Array.isArray(item?.assigned_to)) return [];

    return item.assigned_to
      .map((email) => String(email || "").trim())
      .filter(Boolean);
  }

  function normalizeAssignedEmails(values) {
    const emails = values
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    return Array.from(new Set(emails));
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getFilteredTeamMembers(searchValue) {
    const query = normalizeEmail(searchValue);
    const members = teamMembers.filter((member) => member.email);

    if (!query) return members;

    return members.filter((member) =>
      normalizeEmail(`${member.full_name || ""} ${member.email}`).includes(query),
    );
  }

  function getAssigneeLabel(email) {
    const member = teamMembers.find(
      (item) => normalizeEmail(item.email) === normalizeEmail(email),
    );

    if (member?.full_name) return `${member.full_name} (${member.email})`;
    return email;
  }

  function isAssigned(email) {
    return assignedEmails.some(
      (assignedEmail) => normalizeEmail(assignedEmail) === normalizeEmail(email),
    );
  }

  function canUnassignWithCheckbox(email) {
    return isCurrentUserAdmin && isAssigned(email);
  }

  function canToggleAssignment(email) {
    return !isAssigned(email) || canUnassignWithCheckbox(email);
  }
</script>

<SlideOver
  open={drawerOpen}
  title={displayedProject?.title || ""}
  {eyebrow}
  closeLabel="Close project details"
  closeDisabled={assignmentSaving || statusSaving || prioritySaving || publishScheduleSaving}
  onClose={requestClose}
  onClosed={handleClose}
>
  {#if displayedProject}
    <div class="px-5 py-5">
        <div class="flex flex-wrap gap-2">
          <span class="rounded-full border px-2.5 py-1 text-xs font-bold {getStatusClass(displayedProject.status)}">
            {displayedProject.status}
          </span>
          <span class="rounded-full border px-2.5 py-1 text-xs font-bold {getPriorityClass(displayedProject.priority)}">
            {displayedProject.priority || "Priority unset"}
          </span>
          <span class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700">
            <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
            {getDateLabel(displayedProject)}
          </span>
        </div>

        <dl class="mt-5 grid gap-3 text-sm">
          <div class="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
            <dt class="font-bold">Channels</dt>
            <dd class="mt-1 text-gray-700">{formatChannelTags(displayedProject.channel_tags)}</dd>
          </div>
          <div class="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
            <dt class="font-bold">Assigned to</dt>
            <dd class="mt-1 text-gray-700">
              {assignedEmails.length ? assignedEmails.join(", ") : "Unassigned"}
            </dd>
          </div>
          <div class="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
            <dt class="font-bold">Copy approval</dt>
            <dd class="mt-1 text-gray-700">{displayedProject.copy_approved ? "Approved" : "Not approved"}</dd>
          </div>
        </dl>

        <section class="mt-5 rounded-md border border-black/10 bg-white p-4" aria-labelledby="drawer-status-title">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h4 id="drawer-status-title" class="font-bold">Move status</h4>
            </div>
            {#if statusSaving}
              <span class="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
                Saving
              </span>
            {/if}
          </div>

          {#if statusError}
            <div class="mt-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{statusError}</span>
            </div>
          {/if}

          {#if statusSuccess}
            <div class="mt-3 flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
              <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{statusSuccess}</span>
            </div>
          {/if}

          <label class="mt-4 block text-sm font-bold" for={`project-status-${displayedProject.id}`}>
            Status
            <select
              id={`project-status-${displayedProject.id}`}
              class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
              value={displayedProject.status}
              onchange={(event) => updateProjectStatus(event.currentTarget.value)}
              disabled={statusSaving || statusOptions.length <= 1}
            >
              {#each statusOptions as status}
                <option value={status}>{status}</option>
              {/each}
            </select>
          </label>

          {#if isCurrentUserAdmin}
            <label class="mt-4 block text-sm font-bold" for={`project-priority-${displayedProject.id}`}>
              Priority
              <select
                id={`project-priority-${displayedProject.id}`}
                class="mt-2 min-h-10 w-full rounded-md border px-3 text-sm font-bold outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 {getPriorityClass(displayedProject.priority)}"
                value={displayedProject.priority || ""}
                onchange={(event) => updateProjectPriority(event.currentTarget.value)}
                disabled={prioritySaving}
              >
                <option value="">Unset</option>
                {#each priorityOptions as priority}
                  <option value={priority}>{priority}</option>
                {/each}
              </select>
            </label>

            {#if priorityError}
              <div class="mt-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{priorityError}</span>
              </div>
            {/if}

            {#if prioritySuccess}
              <div class="mt-3 flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
                <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{prioritySuccess}</span>
              </div>
            {/if}
          {/if}
        </section>

        {#if teamMembers.length}
          <section class="mt-5 rounded-md border border-black/10 bg-white p-4" aria-labelledby="drawer-assignments-title">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2">
                  <UserPlus class="h-4 w-4 text-[#0f766e]" aria-hidden="true" />
                  <h4 id="drawer-assignments-title" class="font-bold">Assignments</h4>
                </div>
                <p class="mt-1 text-sm leading-6 text-gray-600">
                  Add teammates who need to help with this project.
                </p>
              </div>

              {#if currentUserIsAssigned}
                <button
                  type="button"
                  class="shrink-0 rounded-md bg-[#0f766e] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#115e59] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  onclick={completeMyAssignment}
                  disabled={assignmentSaving}
                >
                  {#if assignmentSaving}
                    Saving
                  {:else}
                    I’m Done
                  {/if}
                </button>
              {/if}
            </div>

            {#if assignmentError}
              <div class="mt-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{assignmentError}</span>
              </div>
            {/if}

            {#if assignmentSuccess}
              <div class="mt-3 flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
                <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{assignmentSuccess}</span>
              </div>
            {/if}

            <div class="mt-4">
              <label class="sr-only" for="assignment-search">Search team members</label>
              <div class="relative">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  id="assignment-search"
                  type="search"
                  class="min-h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                  placeholder="Search team members"
                  bind:value={assignmentSearch}
                />
              </div>
            </div>

            {#if assignedEmails.length}
              <div class="mt-3 flex flex-wrap gap-1.5">
                {#each assignedEmails as assignedEmail}
                  <span class="rounded-full border border-teal-100 bg-teal-50 px-2 py-1 text-xs font-bold text-teal-800">
                    {assignedEmail}
                  </span>
                {/each}
              </div>
            {/if}

            <div class="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
              {#each filteredTeamMembers as member}
                {@const memberIsAssigned = isAssigned(member.email)}
                {@const memberCanToggle = canToggleAssignment(member.email)}
                <label class="flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm transition {memberCanToggle ? 'cursor-pointer hover:border-[#0f766e]/30 hover:bg-white' : 'cursor-not-allowed opacity-65'}">
                  <input
                    type="checkbox"
                    class="mt-1 h-4 w-4 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]"
                    checked={memberIsAssigned}
                    onchange={(event) => toggleAssignment(member.email, event.currentTarget.checked)}
                    disabled={assignmentSaving || !memberCanToggle}
                    title={memberCanToggle ? undefined : "Only admins can unassign teammates from here."}
                  />
                  <span class="min-w-0">
                    <span class="block font-bold">{member.full_name || member.email}</span>
                    {#if member.full_name}
                      <span class="block break-words text-xs text-gray-500">{member.email}</span>
                    {/if}
                  </span>
                </label>
              {:else}
                <p class="rounded-md border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500">
                  No matching team members.
                </p>
              {/each}
            </div>

            {#if unlistedAssignedEmails.length}
              <p class="mt-3 text-xs leading-5 text-gray-500">
                Assigned emails not tied to current accounts: {unlistedAssignedEmails.join(", ")}
              </p>
            {/if}
          </section>
        {/if}

        <div class="mt-5">
          <ProjectTimeline {supabase} project={displayedProject} refreshKey={timelineRefreshKey} />
        </div>

        {#if getProjectLinks(displayedProject).length}
          <section class="mt-5" aria-labelledby="drawer-links-title">
            <h4 id="drawer-links-title" class="font-bold">External links</h4>
            <div class="mt-3 grid gap-2">
              {#each getProjectLinks(displayedProject) as link}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-black/10 px-3 text-sm font-bold transition hover:border-[#0f766e]/40 hover:text-[#0f766e]"
                >
                  <ExternalLink class="h-4 w-4" aria-hidden="true" />
                  {link.label}
                </a>
              {/each}
            </div>
          </section>
        {/if}

        {#if getProjectReferences(displayedProject).length}
          <section class="mt-5" aria-labelledby="drawer-references-title">
            <h4 id="drawer-references-title" class="font-bold">Asset references</h4>
            <div class="mt-3 space-y-2">
              {#each getProjectReferences(displayedProject) as item}
                <div class="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
                  <p class="font-bold">{item.label}</p>
                  <p class="mt-1 break-words text-gray-700">{item.value}</p>
                </div>
              {/each}
            </div>
          </section>
        {/if}
      </div>

      <div class="border-t border-black/10 p-4">
        <button
          type="button"
          class="flex min-h-11 w-full items-center justify-center rounded-md bg-[#ffbd59] px-4 py-2.5 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
          onclick={requestClose}
        >
          Close
        </button>
      </div>
    {/if}
</SlideOver>

<PublishScheduleDialog
  open={publishScheduleOpen}
  project={displayedProject}
  projects={scheduleProjects}
  initialDate={displayedProject?.publish_date || ""}
  isSaving={publishScheduleSaving}
  errorMessage={publishScheduleError}
  onCancel={closePublishScheduler}
  onConfirm={confirmPublishSchedule}
/>
