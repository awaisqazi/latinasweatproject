<script>
  import {
    CalendarClock,
    ExternalLink,
    FileText,
    Pencil,
    Search,
    UserPlus,
  } from "@lucide/svelte";
  import { isOperationalAdmin } from "../../../lib/dashboard/roles";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import Field from "../ui/Field.svelte";
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
  export let onAssignTask = () => {};

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
  let briefDocSaving = false;
  let briefDocError = "";
  let briefDocSuccess = "";
  let briefPollActive = false;
  let linksEditing = false;
  let linksFilesInput = "";
  let linksDeliverablesInput = "";
  let linksSaving = false;
  let linksError = "";
  let linksSuccess = "";

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
  const priorityOptions = ["P0", "P1", "P2"];
  const projectSelectColumns =
    "id,title,priority,status,deadline,publish_date,details_url,brief_doc_status,copy_approved,files_url,deliverables_url,assigned_to,edit_notes,channel_tags,source,intake_reviewed,intake_submitted_at,updated_at";
  const CONFLICT_MESSAGE =
    "Someone else just updated this project — their latest version has been loaded. Please re-apply your change.";

  // Optimistic-locked project update: applies only if nobody changed the row
  // since it was loaded. On conflict, pulls the other person's version into
  // the drawer and returns { conflict: true } so the caller can say so.
  async function guardedProjectUpdate(payload) {
    let query = supabase.from("projects").update(payload).eq("id", displayedProject.id);
    if (displayedProject.updated_at) {
      query = query.eq("updated_at", displayedProject.updated_at);
    }

    const { data, error } = await query.select(projectSelectColumns).maybeSingle();

    if (error) return { error };

    if (!data) {
      const { data: fresh } = await supabase
        .from("projects")
        .select(projectSelectColumns)
        .eq("id", displayedProject.id)
        .maybeSingle();

      if (fresh) {
        displayedProject = fresh;
        onProjectUpdated(fresh);
      }
      return { conflict: true };
    }

    return { data };
  }

  $: if (project?.id && project.id !== displayedProject?.id) {
    openDrawer(project);
  } else if (!project && drawerOpen) {
    // Parent cleared the selection (e.g. changed views) — close the drawer.
    drawerOpen = false;
  }
  $: assignedEmails = getAssignedEmails(displayedProject);
  $: filteredTeamMembers = getFilteredTeamMembers(assignmentSearch);
  $: currentUserIsAssigned = assignedEmails.some(
    (email) => normalizeEmail(email) === normalizeEmail(currentUserEmail),
  );
  $: isCurrentUserAdmin = isOperationalAdmin(currentUserRole);
  $: statusOptions = getStatusOptions();
  $: unlistedAssignedEmails = assignedEmails.filter(
    (email) =>
      !teamMembers.some((member) => normalizeEmail(member.email) === normalizeEmail(email)),
  );
  $: if (
    drawerOpen &&
    displayedProject?.brief_doc_status === "pending" &&
    !isLikelyUrl(displayedProject?.details_url) &&
    !briefPollActive
  ) {
    briefPollActive = true;
    pollBriefDoc(8);
  }

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
    linksEditing = false;
    linksError = "";
    linksSuccess = "";
    drawerOpen = true;
  }

  function requestClose() {
    if (
      assignmentSaving ||
      statusSaving ||
      prioritySaving ||
      publishScheduleSaving ||
      linksSaving
    ) {
      return;
    }

    drawerOpen = false;
  }

  function handleClose() {
    drawerOpen = false;
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

  function getPriorityTone(priority) {
    if (priority === "P0") return "red";
    if (priority === "P1") return "amber";
    return "neutral";
  }

  function getStatusTone(status) {
    if (status === "Stuck") return "red";
    if (status === "In Production") return "blue";
    if (status?.startsWith("Ready")) return "amber";
    return "neutral";
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

    // details_url is surfaced as "Open brief doc" in the Project brief section,
    // so it's intentionally omitted here to avoid a duplicate link.
    return [
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

  async function reloadProject() {
    if (!displayedProject?.id) return;
    const { data, error } = await supabase
      .from("projects")
      .select(projectSelectColumns)
      .eq("id", displayedProject.id)
      .single();
    if (!error && data) {
      displayedProject = data;
      onProjectUpdated(data);
    }
  }

  // While a brief is generating server-side (status 'pending', no link yet),
  // poll a few times so the link appears without a manual refresh.
  async function pollBriefDoc(tries) {
    if (
      !drawerOpen ||
      tries <= 0 ||
      !displayedProject?.id ||
      isLikelyUrl(displayedProject?.details_url) ||
      displayedProject?.brief_doc_status !== "pending"
    ) {
      briefPollActive = false;
      return;
    }
    await reloadProject();
    if (
      drawerOpen &&
      !isLikelyUrl(displayedProject?.details_url) &&
      displayedProject?.brief_doc_status === "pending"
    ) {
      setTimeout(() => pollBriefDoc(tries - 1), 2500);
    } else {
      briefPollActive = false;
    }
  }

  async function generateBriefDoc(force = false) {
    if (!displayedProject || briefDocSaving) return;
    briefDocSaving = true;
    briefDocError = "";
    briefDocSuccess = "";

    const { data, error } = await supabase.functions.invoke("project-brief-doc", {
      body: { project_id: displayedProject.id, force },
    });

    if (error || (data && data.error)) {
      briefDocError =
        (data && data.error) || error?.message || "Could not generate the brief doc.";
      briefDocSaving = false;
      return;
    }

    // Re-fetch so the new details_url link shows immediately.
    const { data: refreshed, error: reloadError } = await supabase
      .from("projects")
      .select(projectSelectColumns)
      .eq("id", displayedProject.id)
      .single();

    if (!reloadError && refreshed) {
      displayedProject = refreshed;
      onProjectUpdated(refreshed);
    }

    briefDocSuccess = data?.skipped
      ? "A brief doc is already linked for this project."
      : "Brief doc created and linked under Details.";
    briefDocSaving = false;
  }

  function getAllStatuses() {
    return availableStatuses.length ? availableStatuses : defaultStatuses;
  }

  function getStatusOptions() {
    // Everyone can move a project to any status now.
    return getAllStatuses();
  }

  async function updateProjectStatus(targetStatus) {
    if (!displayedProject || statusSaving || targetStatus === displayedProject.status) return;

    if (targetStatus === "Ready to Publish") {
      openPublishScheduler();
      return;
    }

    const previousStatus = displayedProject.status;
    statusSaving = true;
    statusError = "";
    statusSuccess = "";

    const { data, error, conflict } = await guardedProjectUpdate({ status: targetStatus });

    if (error || conflict) {
      statusError = conflict ? CONFLICT_MESSAGE : error.message;
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

    const { data, error, conflict } = await guardedProjectUpdate({
      status: "Ready to Publish",
      publish_date: date,
    });

    if (error || conflict) {
      const message = conflict ? CONFLICT_MESSAGE : error.message;
      publishScheduleError = message;
      statusError = message;
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

    const { data, error, conflict } = await guardedProjectUpdate({ priority: nextPriority });

    if (error || conflict) {
      priorityError = conflict ? CONFLICT_MESSAGE : error.message;
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

    const { data, error, conflict } = await guardedProjectUpdate({
      assigned_to: normalizeAssignedEmails(nextAssignedTo),
    });

    if (error || conflict) {
      assignmentError = conflict ? CONFLICT_MESSAGE : error.message;
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

  function startLinksEdit() {
    linksFilesInput = displayedProject?.files_url || "";
    linksDeliverablesInput = displayedProject?.deliverables_url || "";
    linksError = "";
    linksSuccess = "";
    linksEditing = true;
  }

  function cancelLinksEdit() {
    if (linksSaving) return;
    linksEditing = false;
    linksError = "";
  }

  // People paste Drive links without a scheme ("drive.google.com/...");
  // give those https:// so they stay clickable links, not asset references.
  function normalizeLinkInput(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(trimmed)) return `https://${trimmed}`;
    return trimmed;
  }

  async function saveLinks(event) {
    event.preventDefault();
    if (!displayedProject || linksSaving) return;

    const nextFiles = normalizeLinkInput(linksFilesInput);
    const nextDeliverables = normalizeLinkInput(linksDeliverablesInput);

    if (
      nextFiles === (displayedProject.files_url || null) &&
      nextDeliverables === (displayedProject.deliverables_url || null)
    ) {
      linksEditing = false;
      return;
    }

    linksSaving = true;
    linksError = "";
    linksSuccess = "";

    const changed = [];
    if (nextFiles !== (displayedProject.files_url || null)) {
      changed.push(`the Files link${nextFiles ? "" : " (removed)"}`);
    }
    if (nextDeliverables !== (displayedProject.deliverables_url || null)) {
      changed.push(`the Deliverables link${nextDeliverables ? "" : " (removed)"}`);
    }

    const { data, error, conflict } = await guardedProjectUpdate({
      files_url: nextFiles,
      deliverables_url: nextDeliverables,
    });

    if (error || conflict) {
      linksError = conflict ? CONFLICT_MESSAGE : error.message;
      linksSaving = false;
      return;
    }

    displayedProject = data;
    onProjectUpdated(data);
    await addTimelineLog(data.id, `Updated ${changed.join(" and ")}.`);
    linksSuccess = "Links saved.";
    linksSaving = false;
    linksEditing = false;
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

  // `emails` is threaded through as a parameter so template call sites can
  // name assignedEmails directly — legacy reactivity doesn't track reads that
  // happen inside the function body.
  function isAssigned(email, emails = assignedEmails) {
    return emails.some(
      (assignedEmail) => normalizeEmail(assignedEmail) === normalizeEmail(email),
    );
  }

  function canUnassignWithCheckbox(email, emails = assignedEmails) {
    return isCurrentUserAdmin && isAssigned(email, emails);
  }

  function canToggleAssignment(email, emails = assignedEmails) {
    return !isAssigned(email, emails) || canUnassignWithCheckbox(email, emails);
  }
</script>

<SlideOver
  open={drawerOpen}
  title={displayedProject?.title || ""}
  {eyebrow}
  closeLabel="Close project details"
  closeDisabled={assignmentSaving || statusSaving || prioritySaving || publishScheduleSaving || linksSaving}
  onClose={requestClose}
  onClosed={handleClose}
>
  {#if displayedProject}
    <div class="px-5 py-5">
        <div class="flex flex-wrap gap-2">
          <Badge tone={getStatusTone(displayedProject.status)}>
            {displayedProject.status}
          </Badge>
          <Badge tone={getPriorityTone(displayedProject.priority)}>
            {displayedProject.priority || "Priority unset"}
          </Badge>
          <Badge tone="neutral">
            <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
            {getDateLabel(displayedProject)}
          </Badge>
        </div>

        <div class="mt-4">
          <Button
            size="sm"
            icon={UserPlus}
            onclick={() =>
              onAssignTask({
                sourceModule: "marketing",
                sourceLabel: `Marketing: ${displayedProject.title}`,
                sourceLink: "#kanban",
                sourceRef: `open:project:${displayedProject.id}`,
                title: `Follow up: ${displayedProject.title}`,
              })}
          >
            Assign a task about this
          </Button>
        </div>

        <dl class="mt-5 grid gap-3 text-sm">
          <div class="rounded-card border border-ink/8 bg-canvas px-4 py-3">
            <dt class="font-bold text-ink">Channels</dt>
            <dd class="mt-1 text-ink/70">{formatChannelTags(displayedProject.channel_tags)}</dd>
          </div>
          <div class="rounded-card border border-ink/8 bg-canvas px-4 py-3">
            <dt class="font-bold text-ink">Assigned to</dt>
            <dd class="mt-1 text-ink/70">
              {assignedEmails.length ? assignedEmails.join(", ") : "Unassigned"}
            </dd>
          </div>
          <div class="rounded-card border border-ink/8 bg-canvas px-4 py-3">
            <dt class="font-bold text-ink">Copy approval</dt>
            <dd class="mt-1 text-ink/70">{displayedProject.copy_approved ? "Approved" : "Not approved"}</dd>
          </div>
        </dl>

        <section class="mt-5 rounded-card border border-ink/8 bg-white p-4" aria-labelledby="drawer-status-title">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h4 id="drawer-status-title" class="font-bold text-ink">Move status</h4>
            </div>
            {#if statusSaving}
              <Badge tone="neutral" class="shrink-0">Saving</Badge>
            {/if}
          </div>

          {#if statusError}
            <Banner tone="error" message={statusError} class="mt-3" />
          {/if}

          {#if statusSuccess}
            <Banner tone="success" message={statusSuccess} class="mt-3" />
          {/if}

          <Field label="Status" id={`project-status-${displayedProject.id}`} class="mt-4">
            <select
              id={`project-status-${displayedProject.id}`}
              class="select"
              value={displayedProject.status}
              onchange={(event) => updateProjectStatus(event.currentTarget.value)}
              disabled={statusSaving || statusOptions.length <= 1}
            >
              {#each statusOptions as status}
                <option value={status}>{status}</option>
              {/each}
            </select>
          </Field>

          {#if isCurrentUserAdmin}
            <Field label="Priority" id={`project-priority-${displayedProject.id}`} class="mt-4">
              <select
                id={`project-priority-${displayedProject.id}`}
                class="select font-bold"
                value={displayedProject.priority || ""}
                onchange={(event) => updateProjectPriority(event.currentTarget.value)}
                disabled={prioritySaving}
              >
                <option value="">Unset</option>
                {#each priorityOptions as priority}
                  <option value={priority}>{priority}</option>
                {/each}
              </select>
            </Field>

            {#if priorityError}
              <Banner tone="error" message={priorityError} class="mt-3" />
            {/if}

            {#if prioritySuccess}
              <Banner tone="success" message={prioritySuccess} class="mt-3" />
            {/if}
          {/if}
        </section>

        {#if teamMembers.length}
          <section class="mt-5 rounded-card border border-ink/8 bg-white p-4" aria-labelledby="drawer-assignments-title">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2">
                  <UserPlus class="h-4 w-4 text-accent" aria-hidden="true" />
                  <h4 id="drawer-assignments-title" class="font-bold text-ink">Assignments</h4>
                </div>
                <p class="mt-1 text-sm leading-6 text-ink/60">
                  Add teammates who need to help with this project.
                </p>
              </div>

              {#if currentUserIsAssigned}
                <Button
                  variant="primary"
                  size="sm"
                  class="shrink-0"
                  onclick={completeMyAssignment}
                  loading={assignmentSaving}
                >
                  {assignmentSaving ? "Saving" : "I’m Done"}
                </Button>
              {/if}
            </div>

            {#if assignmentError}
              <Banner tone="error" message={assignmentError} class="mt-3" />
            {/if}

            {#if assignmentSuccess}
              <Banner tone="success" message={assignmentSuccess} class="mt-3" />
            {/if}

            <div class="mt-4">
              <label class="sr-only" for="assignment-search">Search team members</label>
              <div class="relative">
                <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" aria-hidden="true" />
                <input
                  id="assignment-search"
                  type="search"
                  class="input pl-9"
                  placeholder="Search team members"
                  bind:value={assignmentSearch}
                />
              </div>
            </div>

            {#if assignedEmails.length}
              <div class="mt-3 flex flex-wrap gap-1.5">
                {#each assignedEmails as assignedEmail}
                  <Badge tone="teal" size="xs">{assignedEmail}</Badge>
                {/each}
              </div>
            {/if}

            <div class="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
              {#each filteredTeamMembers as member}
                {@const memberIsAssigned = isAssigned(member.email, assignedEmails)}
                {@const memberCanToggle = canToggleAssignment(member.email, assignedEmails)}
                <label class="flex items-start gap-3 rounded-control border border-ink/8 bg-canvas px-3 py-2 text-sm transition {memberCanToggle ? 'cursor-pointer hover:border-accent/30 hover:bg-white' : 'cursor-not-allowed opacity-65'}">
                  <input
                    type="checkbox"
                    class="mt-1 h-4 w-4 rounded border-ink/25 text-accent focus:ring-accent"
                    checked={memberIsAssigned}
                    onchange={(event) => toggleAssignment(member.email, event.currentTarget.checked)}
                    disabled={assignmentSaving || !memberCanToggle}
                    title={memberCanToggle ? undefined : "Only admins can unassign teammates from here."}
                  />
                  <span class="min-w-0">
                    <span class="block font-bold text-ink">{member.full_name || member.email}</span>
                    {#if member.full_name}
                      <span class="block break-words text-xs text-ink/50">{member.email}</span>
                    {/if}
                  </span>
                </label>
              {:else}
                <p class="rounded-card border border-dashed border-ink/15 px-3 py-4 text-center text-sm text-ink/50">
                  No matching team members.
                </p>
              {/each}
            </div>

            {#if unlistedAssignedEmails.length}
              <p class="mt-3 text-xs leading-5 text-ink/50">
                Assigned emails not tied to current accounts: {unlistedAssignedEmails.join(", ")}
              </p>
            {/if}
          </section>
        {/if}

        <div class="mt-5">
          <ProjectTimeline {supabase} project={displayedProject} refreshKey={timelineRefreshKey} />
        </div>

        <section class="mt-5" aria-labelledby="drawer-brief-title">
          <h4 id="drawer-brief-title" class="font-bold text-ink">Project brief</h4>
          {#if isLikelyUrl(displayedProject?.details_url)}
            <a
              href={displayedProject.details_url}
              target="_blank"
              rel="noreferrer"
              class="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-ink/14 px-3 text-sm font-bold text-ink transition hover:border-accent/40 hover:text-accent-strong"
            >
              <FileText class="h-4 w-4" aria-hidden="true" />
              Open brief doc
            </a>
          {:else if displayedProject?.brief_doc_status === "pending"}
            <p class="mt-1 text-sm text-ink/60">
              Generating the brief doc… this usually takes a few seconds.
            </p>
            <div class="mt-3">
              <Button variant="secondary" class="w-full" loading disabled>
                Generating brief doc…
              </Button>
            </div>
            <button
              type="button"
              class="mt-2 text-sm font-semibold text-accent-strong hover:underline"
              onclick={reloadProject}
            >
              Check now
            </button>
          {:else}
            <p class="mt-1 text-sm text-ink/60">
              Copies the LSP brief template into the team Drive folder and links it under Details.
            </p>
            <div class="mt-3">
              <Button
                variant="secondary"
                class="w-full"
                icon={FileText}
                loading={briefDocSaving}
                disabled={briefDocSaving}
                onclick={() => generateBriefDoc(false)}
              >
                {briefDocSaving
                  ? "Generating…"
                  : displayedProject?.brief_doc_status === "error"
                    ? "Retry brief doc"
                    : "Generate brief doc"}
              </Button>
            </div>
          {/if}
          {#if briefDocError}
            <p class="mt-2 text-sm font-semibold text-red-600">{briefDocError}</p>
          {/if}
          {#if briefDocSuccess}
            <p class="mt-2 text-sm font-semibold text-emerald-600">{briefDocSuccess}</p>
          {/if}
        </section>

        <section class="mt-5" aria-labelledby="drawer-links-title">
          <div class="flex items-center justify-between gap-2">
            <h4 id="drawer-links-title" class="font-bold text-ink">External links</h4>
            {#if !linksEditing}
              <Button size="sm" icon={Pencil} onclick={startLinksEdit}>
                Edit links
              </Button>
            {/if}
          </div>

          {#if linksError}
            <p class="mt-2 text-sm font-semibold text-red-600">{linksError}</p>
          {/if}
          {#if linksSuccess && !linksEditing}
            <p class="mt-2 text-sm font-semibold text-emerald-600">{linksSuccess}</p>
          {/if}

          {#if linksEditing}
            <form class="mt-3 grid gap-3" onsubmit={saveLinks}>
              <Field
                label="Files link"
                id="drawer-links-files"
                hint="Drive folder with source assets (raw footage, photos, working files)."
              >
                <input
                  id="drawer-links-files"
                  type="text"
                  class="input"
                  placeholder="https://drive.google.com/…"
                  bind:value={linksFilesInput}
                />
              </Field>

              <Field
                label="Deliverables link"
                id="drawer-links-deliverables"
                hint="Drive folder with finished work ready for review or publishing."
              >
                <input
                  id="drawer-links-deliverables"
                  type="text"
                  class="input"
                  placeholder="https://drive.google.com/…"
                  bind:value={linksDeliverablesInput}
                />
              </Field>

              <div class="flex gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  class="flex-1"
                  loading={linksSaving}
                  disabled={linksSaving}
                >
                  {linksSaving ? "Saving" : "Save Links"}
                </Button>
                <Button class="flex-1" onclick={cancelLinksEdit} disabled={linksSaving}>
                  Cancel
                </Button>
              </div>
            </form>
          {:else if getProjectLinks(displayedProject).length}
            <div class="mt-3 grid gap-2">
              {#each getProjectLinks(displayedProject) as link}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-ink/14 px-3 text-sm font-bold text-ink transition hover:border-accent/40 hover:text-accent-strong"
                >
                  <ExternalLink class="h-4 w-4" aria-hidden="true" />
                  {link.label}
                </a>
              {/each}
            </div>
          {:else}
            <p class="mt-1 text-sm text-ink/60">
              No files or deliverables links yet. Add a Drive folder link so
              teammates can find this project's assets.
            </p>
          {/if}
        </section>

        {#if getProjectReferences(displayedProject).length}
          <section class="mt-5" aria-labelledby="drawer-references-title">
            <h4 id="drawer-references-title" class="font-bold text-ink">Asset references</h4>
            <div class="mt-3 space-y-2">
              {#each getProjectReferences(displayedProject) as item}
                <div class="rounded-card border border-ink/8 bg-canvas px-4 py-3 text-sm">
                  <p class="font-bold text-ink">{item.label}</p>
                  <p class="mt-1 break-words text-ink/70">{item.value}</p>
                </div>
              {/each}
            </div>
          </section>
        {/if}
      </div>

      <div class="border-t border-ink/8 p-4">
        <Button variant="primary" class="w-full" onclick={requestClose}>
          Close
        </Button>
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
