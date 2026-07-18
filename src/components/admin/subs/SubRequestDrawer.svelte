<script>
  import {
    CalendarClock,
    CalendarPlus,
    Clock,
    Mail,
    MapPin,
    Phone,
    Trash2,
    UserCheck,
    UserPlus,
    UserX,
  } from "@lucide/svelte";
  import { generateSubCalendarLink } from "../../../lib/subCalendarUtils";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Field from "../ui/Field.svelte";

  export let supabase;
  export let request = null;
  export let onClose = () => {};
  export let onRequestUpdated = () => {};
  export let onRequestDeleted = () => {};
  export let onAssignTask = () => {};

  const requestColumns =
    "id, kind, class_name, date, start_time, end_time, duration_minutes, location, notes, requested_by_name, requested_by_email, status, assigned_sub_name, assigned_sub_email, assigned_sub_phone, assigned_at, created_at, sub_volunteers(id, name, email, phone, created_at)";
  const STATUS_TONES = { open: "amber", pending: "blue", approved: "green" };

  let displayedRequest = null;
  let drawerOpen = false;
  let isSaving = false;
  let isDeleting = false;
  let confirmingDelete = false;
  let errorMessage = "";
  let successMessage = "";
  let assignName = "";
  let assignEmail = "";
  let assignPhone = "";

  $: if (request?.id && request.id !== displayedRequest?.id) {
    openDrawer(request);
  }
  $: volunteers = displayedRequest?.sub_volunteers || [];

  function openDrawer(nextRequest) {
    displayedRequest = nextRequest;
    errorMessage = "";
    successMessage = "";
    assignName = "";
    assignEmail = "";
    assignPhone = "";
    confirmingDelete = false;
    drawerOpen = true;
  }

  function requestClose() {
    if (isSaving || isDeleting) return;
    drawerOpen = false;
  }

  function handleClose() {
    drawerOpen = false;
    displayedRequest = null;
    onClose();
  }

  async function saveUpdates(updates, successText) {
    if (!displayedRequest?.id || isSaving) return;

    isSaving = true;
    errorMessage = "";
    successMessage = "";

    const { data, error } = await supabase
      .from("sub_requests")
      .update(updates)
      .eq("id", displayedRequest.id)
      .select(requestColumns)
      .single();

    if (error) {
      errorMessage = error.message;
    } else {
      const updated = { ...data, sub_volunteers: data.sub_volunteers || [] };
      displayedRequest = updated;
      onRequestUpdated(updated);
      successMessage = successText;
    }

    isSaving = false;
  }

  function approveVolunteer(volunteer) {
    const roleText =
      displayedRequest?.kind === "coordinator" ? "to cover this shift" : "as the sub";
    saveUpdates(
      {
        status: "approved",
        assigned_sub_name: volunteer.name,
        assigned_sub_email: volunteer.email,
        assigned_sub_phone: volunteer.phone || null,
        assigned_at: new Date().toISOString(),
      },
      `${volunteer.name} approved ${roleText}. Please text them to confirm they can still make it.`,
    );
  }

  async function rejectVolunteer(volunteer) {
    if (!displayedRequest?.id || isSaving) return;

    isSaving = true;
    errorMessage = "";
    successMessage = "";

    const { error } = await supabase
      .from("sub_volunteers")
      .delete()
      .eq("id", volunteer.id);

    if (error) {
      errorMessage = error.message;
      isSaving = false;
      return;
    }

    const remaining = volunteers.filter((entry) => entry.id !== volunteer.id);
    let updated = { ...displayedRequest, sub_volunteers: remaining };

    // If the volunteer we just removed was the approved/assigned sub, clear the
    // assignment and reopen the request (otherwise it would still show them as
    // confirmed). Otherwise, only reopen a pending request that's now empty.
    const wasAssignedSub =
      displayedRequest.status === "approved" &&
      displayedRequest.assigned_sub_email &&
      volunteer.email &&
      displayedRequest.assigned_sub_email.toLowerCase() === volunteer.email.toLowerCase();

    let requestUpdates = null;
    if (wasAssignedSub) {
      requestUpdates = {
        status: remaining.length ? "pending" : "open",
        assigned_sub_name: null,
        assigned_sub_email: null,
        assigned_sub_phone: null,
        assigned_at: null,
      };
    } else if (!remaining.length && displayedRequest.status === "pending") {
      requestUpdates = { status: "open" };
    }

    if (requestUpdates) {
      const { data, error: statusError } = await supabase
        .from("sub_requests")
        .update(requestUpdates)
        .eq("id", displayedRequest.id)
        .select(requestColumns)
        .single();

      if (statusError) {
        errorMessage = statusError.message;
      } else {
        updated = { ...data, sub_volunteers: data.sub_volunteers || [] };
      }
    }

    displayedRequest = updated;
    onRequestUpdated(updated);
    successMessage = wasAssignedSub
      ? `${volunteer.name} removed and unassigned. The request is ${remaining.length ? "back to pending approval" : "open again"}.`
      : `${volunteer.name} removed from this request. Consider texting them to thank them for offering to help.`;
    isSaving = false;
  }

  async function assignManually(event) {
    event?.preventDefault();

    const name = assignName.trim();
    const email = assignEmail.trim();
    if (!name || !email) return;

    const roleText =
      displayedRequest?.kind === "coordinator" ? "to cover this shift" : "as the sub";
    await saveUpdates(
      {
        status: "approved",
        assigned_sub_name: name,
        assigned_sub_email: email.toLowerCase(),
        assigned_sub_phone: assignPhone.trim() || null,
        assigned_at: new Date().toISOString(),
      },
      `${name} assigned ${roleText}. Please text them to confirm.`,
    );

    if (!errorMessage) {
      assignName = "";
      assignEmail = "";
      assignPhone = "";
    }
  }

  function unassignSub() {
    const nextStatus = volunteers.length ? "pending" : "open";
    const subjectText =
      displayedRequest?.kind === "coordinator" ? "Coverage unassigned" : "Sub unassigned";

    saveUpdates(
      {
        status: nextStatus,
        assigned_sub_name: null,
        assigned_sub_email: null,
        assigned_sub_phone: null,
        assigned_at: null,
      },
      `${subjectText}. The request is ${nextStatus === "pending" ? "back to pending approval" : "open again"}.`,
    );
  }

  function deleteRequest() {
    if (!displayedRequest?.id || isDeleting) return;
    confirmingDelete = true;
  }

  async function confirmDeleteRequest() {
    if (!displayedRequest?.id || isDeleting) return;

    isDeleting = true;
    errorMessage = "";

    const { error } = await supabase
      .from("sub_requests")
      .delete()
      .eq("id", displayedRequest.id);

    if (error) {
      errorMessage = error.message;
      isDeleting = false;
      confirmingDelete = false;
      return;
    }

    const deletedId = displayedRequest.id;
    isDeleting = false;
    confirmingDelete = false;
    onRequestDeleted(deletedId);
    requestClose();
  }

  function getCalendarLink(item) {
    if (!item?.date) return "#";

    const [year, month, day] = item.date.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (item.start_time) {
      const [hours, minutes] = item.start_time.split(":").map(Number);
      date.setHours(hours, minutes, 0, 0);
    }

    return generateSubCalendarLink({
      id: item.id,
      className: getRequestTitle(item),
      date,
      duration: item.duration_minutes || 60,
      location: item.location,
      notes: item.notes,
      requestedBy: { name: item.requested_by_name },
    });
  }

  function formatStartTime(value) {
    if (!value) return "";

    const [hours, minutes] = value.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);

    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
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

  function formatTimestamp(value) {
    if (!value) return "";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function getStatusLabel(status, kind) {
    if (kind === "coordinator") {
      if (status === "approved") return "Coverage confirmed";
      if (status === "pending") return "Pending approval";
      return "Needs coverage";
    }
    if (status === "approved") return "Sub confirmed";
    if (status === "pending") return "Pending approval";
    return "Needs sub";
  }

  function getRequestTitle(item) {
    if (item?.kind === "coordinator") return "Coordinator Shift";
    return item?.class_name || "Class";
  }

  function formatTimeRange(startTime, endTime) {
    if (!startTime) return "";
    if (!endTime) return formatStartTime(startTime);
    return `${formatStartTime(startTime)} to ${formatStartTime(endTime)}`;
  }
</script>

<SlideOver
  open={drawerOpen}
  title={displayedRequest ? getRequestTitle(displayedRequest) : ""}
  eyebrow={displayedRequest
    ? `${displayedRequest.kind === "coordinator" ? "Coverage request" : "Sub request"} · ${formatDate(displayedRequest.date)}`
    : "Sub request"}
  closeLabel="Close sub request details"
  closeDisabled={isSaving || isDeleting}
  onClose={requestClose}
  onClosed={handleClose}
>
  {#if displayedRequest}
    <div class="px-5 py-5">
        <div class="flex flex-wrap gap-2">
          <Badge tone={STATUS_TONES[displayedRequest.status] || "amber"} dot>
            {getStatusLabel(displayedRequest.status, displayedRequest.kind)}
          </Badge>
          {#if displayedRequest.kind === "coordinator"}
            <Badge tone="neutral">Coordinator</Badge>
          {/if}
          {#if displayedRequest.kind === "coordinator"}
            {#if displayedRequest.start_time}
              <Badge tone="neutral">
                <Clock class="h-3.5 w-3.5" aria-hidden="true" />
                {formatTimeRange(displayedRequest.start_time, displayedRequest.end_time)}
              </Badge>
            {/if}
          {:else if displayedRequest.start_time}
            <Badge tone="neutral">
              <Clock class="h-3.5 w-3.5" aria-hidden="true" />
              {formatStartTime(displayedRequest.start_time)}
            </Badge>
          {/if}
          <Badge tone="neutral">
            <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
            {displayedRequest.duration_minutes || 60} minutes
          </Badge>
          {#if displayedRequest.location}
            <Badge tone="neutral">
              <MapPin class="h-3.5 w-3.5" aria-hidden="true" />
              {displayedRequest.location}
            </Badge>
          {/if}
        </div>

        {#if errorMessage}
          <Banner tone="error" message={errorMessage} class="mt-4" />
        {/if}

        {#if successMessage}
          <Banner tone="success" message={successMessage} class="mt-4" />
        {/if}

        <div class="mt-4">
          <Button
            size="sm"
            icon={UserPlus}
            onclick={() =>
              onAssignTask({
                sourceModule: "subs",
                sourceLabel: `${displayedRequest.kind === "coordinator" ? "Coverage" : "Sub"}: ${getRequestTitle(displayedRequest)} · ${formatDate(displayedRequest.date)}`,
                sourceLink: "#subs",
                sourceRef: `open:sub_request:${displayedRequest.id}`,
                title: `Cover ${displayedRequest.kind === "coordinator" ? "coordinator shift" : "sub"}: ${getRequestTitle(displayedRequest)}`,
              })}
          >
            Assign a task about this
          </Button>
        </div>

        <section class="mt-5 rounded-card border border-ink/8 bg-white p-4" aria-labelledby="sub-drawer-details-title">
          <h4 id="sub-drawer-details-title" class="font-bold">Request details</h4>
          <dl class="mt-3 space-y-2 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="font-semibold text-ink/55">Requested by</dt>
              <dd class="text-right font-semibold">{displayedRequest.requested_by_name}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="font-semibold text-ink/55">Requester email</dt>
              <dd class="text-right">
                <a class="font-semibold text-accent-strong hover:underline" href={`mailto:${displayedRequest.requested_by_email}`}>
                  {displayedRequest.requested_by_email}
                </a>
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="font-semibold text-ink/55">
                {displayedRequest.kind === "coordinator" ? "Shift time" : "Class time"}
              </dt>
              <dd class="text-right font-semibold">
                {#if displayedRequest.kind === "coordinator"}
                  {displayedRequest.start_time
                    ? formatTimeRange(displayedRequest.start_time, displayedRequest.end_time)
                    : "Not provided"}
                {:else}
                  {displayedRequest.start_time
                    ? formatStartTime(displayedRequest.start_time)
                    : "Not provided"}
                {/if}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="font-semibold text-ink/55">Created</dt>
              <dd class="text-right">{formatTimestamp(displayedRequest.created_at)}</dd>
            </div>
            {#if displayedRequest.notes}
              <div>
                <dt class="font-semibold text-ink/55">Notes</dt>
                <dd class="mt-1 rounded-control bg-canvas px-3 py-2 leading-6">{displayedRequest.notes}</dd>
              </div>
            {/if}
          </dl>
          <a
            class="mt-3 inline-flex min-h-9 items-center gap-2 rounded-control border border-ink/14 bg-white px-3 text-sm font-semibold text-ink shadow-card transition hover:border-ink/30 hover:bg-ink/[0.03]"
            href={getCalendarLink(displayedRequest)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <CalendarPlus class="h-4 w-4" aria-hidden="true" />
            Add to Google Calendar
          </a>
        </section>

        {#if displayedRequest.status === "approved" && displayedRequest.assigned_sub_name}
          <section class="mt-5 rounded-card border border-green-200 bg-green-50/60 p-4" aria-labelledby="sub-drawer-assigned-title">
            <h4 id="sub-drawer-assigned-title" class="font-bold text-green-900">
              {displayedRequest.kind === "coordinator" ? "Assigned coverage" : "Assigned sub"}
            </h4>
            <p class="mt-2 font-bold">{displayedRequest.assigned_sub_name}</p>
            <div class="mt-1 space-y-1 text-sm">
              {#if displayedRequest.assigned_sub_email}
                <p class="flex items-center gap-2">
                  <Mail class="h-3.5 w-3.5 text-green-700" aria-hidden="true" />
                  <a class="text-accent-strong hover:underline" href={`mailto:${displayedRequest.assigned_sub_email}`}>
                    {displayedRequest.assigned_sub_email}
                  </a>
                </p>
              {/if}
              {#if displayedRequest.assigned_sub_phone}
                <p class="flex items-center gap-2">
                  <Phone class="h-3.5 w-3.5 text-green-700" aria-hidden="true" />
                  <a class="text-accent-strong hover:underline" href={`tel:${displayedRequest.assigned_sub_phone}`}>
                    {displayedRequest.assigned_sub_phone}
                  </a>
                </p>
              {/if}
              {#if displayedRequest.assigned_at}
                <p class="text-green-800">Assigned {formatTimestamp(displayedRequest.assigned_at)}</p>
              {/if}
            </div>
            <Banner
              tone="warning"
              message={displayedRequest.kind === "coordinator"
                ? "Don't forget: please text the person covering to confirm they can still make it."
                : "Don't forget: please text the substitute to confirm they can still make it."}
              class="mt-3"
            />
            <Button
              class="mt-3"
              icon={UserX}
              onclick={unassignSub}
              disabled={isSaving}
            >
              {displayedRequest.kind === "coordinator" ? "Un-assign coverage" : "Un-assign sub"}
            </Button>
          </section>
        {/if}

        <section class="mt-5 rounded-card border border-ink/8 bg-white p-4" aria-labelledby="sub-drawer-volunteers-title">
          <div class="flex items-start justify-between gap-3">
            <h4 id="sub-drawer-volunteers-title" class="font-bold">
              Volunteers ({volunteers.length})
            </h4>
            {#if isSaving}
              <Badge tone="neutral" class="shrink-0">Saving</Badge>
            {/if}
          </div>

          {#if volunteers.length}
            <ul class="mt-3 space-y-3">
              {#each volunteers as volunteer (volunteer.id)}
                <li class="rounded-card border border-ink/8 bg-canvas/60 p-3">
                  <p class="font-bold">{volunteer.name}</p>
                  <div class="mt-1 space-y-1 text-sm">
                    <p class="flex items-center gap-2">
                      <Mail class="h-3.5 w-3.5 text-ink/45" aria-hidden="true" />
                      <a class="text-accent-strong hover:underline" href={`mailto:${volunteer.email}`}>
                        {volunteer.email}
                      </a>
                    </p>
                    {#if volunteer.phone}
                      <p class="flex items-center gap-2">
                        <Phone class="h-3.5 w-3.5 text-ink/45" aria-hidden="true" />
                        <a class="text-accent-strong hover:underline" href={`tel:${volunteer.phone}`}>
                          {volunteer.phone}
                        </a>
                      </p>
                    {/if}
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      icon={UserCheck}
                      onclick={() => approveVolunteer(volunteer)}
                      disabled={isSaving}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={UserX}
                      onclick={() => rejectVolunteer(volunteer)}
                      disabled={isSaving}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="mt-3 rounded-card border border-dashed border-ink/15 bg-canvas/60 px-3 py-4 text-center text-sm text-ink/50">
              No one has volunteered yet.
            </p>
          {/if}
        </section>

        <section class="mt-5 rounded-card border border-ink/8 bg-white p-4" aria-labelledby="sub-drawer-assign-title">
          <h4 id="sub-drawer-assign-title" class="font-bold">
            {displayedRequest.kind === "coordinator" ? "Assign coverage manually" : "Assign a sub manually"}
          </h4>
          <p class="mt-1 text-sm text-ink/60">
            {displayedRequest.kind === "coordinator"
              ? "Found someone outside the volunteer list to cover this shift? Enter their contact info to confirm them."
              : "Found a sub outside the volunteer list? Enter their contact info to confirm them."}
          </p>
          <form class="mt-3 space-y-3" onsubmit={assignManually}>
            <Field label="Name" id={`sub-assign-name-${displayedRequest.id}`} required>
              <input
                id={`sub-assign-name-${displayedRequest.id}`}
                type="text"
                class="input"
                bind:value={assignName}
                disabled={isSaving}
              />
            </Field>
            <Field label="Email" id={`sub-assign-email-${displayedRequest.id}`} required>
              <input
                id={`sub-assign-email-${displayedRequest.id}`}
                type="email"
                class="input"
                bind:value={assignEmail}
                disabled={isSaving}
              />
            </Field>
            <Field label="Phone" id={`sub-assign-phone-${displayedRequest.id}`}>
              <input
                id={`sub-assign-phone-${displayedRequest.id}`}
                type="tel"
                class="input"
                bind:value={assignPhone}
                disabled={isSaving}
              />
            </Field>
            <Button
              type="submit"
              variant="dark"
              icon={UserCheck}
              disabled={isSaving || !assignName.trim() || !assignEmail.trim()}
            >
              Assign sub
            </Button>
          </form>
        </section>

        <section class="mt-5 rounded-card border border-red-200 bg-red-50/50 p-4">
          <h4 class="font-bold text-red-800">Danger zone</h4>
          <Button
            variant="danger"
            class="mt-3"
            icon={Trash2}
            onclick={deleteRequest}
            disabled={isDeleting}
          >
            Delete request
          </Button>
        </section>
      </div>

      <div class="border-t border-ink/8 p-4">
        <Button variant="primary" class="min-h-11 w-full" onclick={requestClose}>
          Close
        </Button>
      </div>
  {/if}
</SlideOver>

<ConfirmDialog
  open={confirmingDelete}
  title={displayedRequest?.kind === "coordinator" ? "Delete coverage request?" : "Delete sub request?"}
  message={displayedRequest
    ? `Delete the ${displayedRequest.kind === "coordinator" ? "coverage request for the coordinator shift" : `sub request for "${getRequestTitle(displayedRequest)}"`} on ${formatDate(displayedRequest.date)}? Its volunteer sign-ups will also be removed. This cannot be undone.`
    : ""}
  confirmLabel="Delete request"
  cancelLabel="Cancel"
  tone="danger"
  busy={isDeleting}
  onConfirm={confirmDeleteRequest}
  onCancel={() => (confirmingDelete = false)}
/>
