<script>
  import {
    CalendarClock,
    CalendarPlus,
    CheckCircle2,
    CircleAlert,
    Mail,
    MapPin,
    Phone,
    Trash2,
    UserCheck,
    UserX,
  } from "@lucide/svelte";
  import { generateSubCalendarLink } from "../../../lib/subCalendarUtils";
  import SlideOver from "../marketing/SlideOver.svelte";

  export let supabase;
  export let request = null;
  export let onClose = () => {};
  export let onRequestUpdated = () => {};
  export let onRequestDeleted = () => {};

  const requestColumns =
    "id, class_name, date, duration_minutes, location, notes, requested_by_name, requested_by_email, status, assigned_sub_name, assigned_sub_email, assigned_sub_phone, assigned_at, created_at, sub_volunteers(id, name, email, phone, created_at)";

  let displayedRequest = null;
  let drawerOpen = false;
  let isSaving = false;
  let isDeleting = false;
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
    drawerOpen = true;
  }

  function requestClose() {
    if (isSaving || isDeleting) return;
    drawerOpen = false;
  }

  function handleClose() {
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
    saveUpdates(
      {
        status: "approved",
        assigned_sub_name: volunteer.name,
        assigned_sub_email: volunteer.email,
        assigned_sub_phone: volunteer.phone || null,
        assigned_at: new Date().toISOString(),
      },
      `${volunteer.name} approved as the sub. Please text them to confirm they can still make it.`,
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

    if (!remaining.length && displayedRequest.status === "pending") {
      const { data, error: statusError } = await supabase
        .from("sub_requests")
        .update({ status: "open" })
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
    successMessage = `${volunteer.name} removed from this request. Consider texting them to thank them for offering to help.`;
    isSaving = false;
  }

  async function assignManually(event) {
    event?.preventDefault();

    const name = assignName.trim();
    const email = assignEmail.trim();
    if (!name || !email) return;

    await saveUpdates(
      {
        status: "approved",
        assigned_sub_name: name,
        assigned_sub_email: email.toLowerCase(),
        assigned_sub_phone: assignPhone.trim() || null,
        assigned_at: new Date().toISOString(),
      },
      `${name} assigned as the sub. Please text them to confirm.`,
    );

    if (!errorMessage) {
      assignName = "";
      assignEmail = "";
      assignPhone = "";
    }
  }

  function unassignSub() {
    const nextStatus = volunteers.length ? "pending" : "open";

    saveUpdates(
      {
        status: nextStatus,
        assigned_sub_name: null,
        assigned_sub_email: null,
        assigned_sub_phone: null,
        assigned_at: null,
      },
      `Sub unassigned. The request is ${nextStatus === "pending" ? "back to pending approval" : "open again"}.`,
    );
  }

  async function deleteRequest() {
    if (!displayedRequest?.id || isDeleting) return;

    const shouldDelete = window.confirm(
      `Delete the sub request for "${displayedRequest.class_name}" on ${formatDate(displayedRequest.date)}? Its volunteer sign-ups will also be removed. This cannot be undone.`,
    );
    if (!shouldDelete) return;

    isDeleting = true;
    errorMessage = "";

    const { error } = await supabase
      .from("sub_requests")
      .delete()
      .eq("id", displayedRequest.id);

    if (error) {
      errorMessage = error.message;
      isDeleting = false;
      return;
    }

    const deletedId = displayedRequest.id;
    isDeleting = false;
    onRequestDeleted(deletedId);
    requestClose();
  }

  function getCalendarLink(item) {
    if (!item?.date) return "#";

    const [year, month, day] = item.date.split("-").map(Number);
    return generateSubCalendarLink({
      id: item.id,
      className: item.class_name,
      date: new Date(year, month - 1, day),
      duration: item.duration_minutes || 60,
      location: item.location,
      notes: item.notes,
      requestedBy: { name: item.requested_by_name },
    });
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

  function getStatusClass(status) {
    if (status === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status === "pending") return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  function getStatusLabel(status) {
    if (status === "approved") return "Sub confirmed";
    if (status === "pending") return "Pending approval";
    return "Needs sub";
  }
</script>

<SlideOver
  open={drawerOpen}
  title={displayedRequest?.class_name || ""}
  eyebrow={displayedRequest ? `Sub request · ${formatDate(displayedRequest.date)}` : "Sub request"}
  closeLabel="Close sub request details"
  closeDisabled={isSaving || isDeleting}
  onClose={requestClose}
  onClosed={handleClose}
>
  {#if displayedRequest}
    <div class="px-5 py-5">
        <div class="flex flex-wrap gap-2">
          <span class="rounded-full border px-2.5 py-1 text-xs font-bold {getStatusClass(displayedRequest.status)}">
            {getStatusLabel(displayedRequest.status)}
          </span>
          <span class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700">
            <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
            {displayedRequest.duration_minutes || 60} minutes
          </span>
          {#if displayedRequest.location}
            <span class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700">
              <MapPin class="h-3.5 w-3.5" aria-hidden="true" />
              {displayedRequest.location}
            </span>
          {/if}
        </div>

        {#if errorMessage}
          <div class="mt-4 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        {/if}

        {#if successMessage}
          <div class="mt-4 flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
        {/if}

        <section class="mt-5 rounded-md border border-black/10 bg-white p-4" aria-labelledby="sub-drawer-details-title">
          <h4 id="sub-drawer-details-title" class="font-bold">Request details</h4>
          <dl class="mt-3 space-y-2 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="font-semibold text-gray-500">Requested by</dt>
              <dd class="text-right font-semibold">{displayedRequest.requested_by_name}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="font-semibold text-gray-500">Requester email</dt>
              <dd class="text-right">
                <a class="font-semibold text-[#0f766e] hover:underline" href={`mailto:${displayedRequest.requested_by_email}`}>
                  {displayedRequest.requested_by_email}
                </a>
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="font-semibold text-gray-500">Created</dt>
              <dd class="text-right">{formatTimestamp(displayedRequest.created_at)}</dd>
            </div>
            {#if displayedRequest.notes}
              <div>
                <dt class="font-semibold text-gray-500">Notes</dt>
                <dd class="mt-1 rounded-md bg-gray-50 px-3 py-2 leading-6">{displayedRequest.notes}</dd>
              </div>
            {/if}
          </dl>
          <a
            class="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-bold text-gray-700 transition hover:border-[#0f766e]/30 hover:text-[#0f766e]"
            href={getCalendarLink(displayedRequest)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <CalendarPlus class="h-4 w-4" aria-hidden="true" />
            Add to Google Calendar
          </a>
        </section>

        {#if displayedRequest.status === "approved" && displayedRequest.assigned_sub_name}
          <section class="mt-5 rounded-md border border-emerald-200 bg-emerald-50/60 p-4" aria-labelledby="sub-drawer-assigned-title">
            <h4 id="sub-drawer-assigned-title" class="font-bold text-emerald-900">Assigned sub</h4>
            <p class="mt-2 font-bold">{displayedRequest.assigned_sub_name}</p>
            <div class="mt-1 space-y-1 text-sm">
              {#if displayedRequest.assigned_sub_email}
                <p class="flex items-center gap-2">
                  <Mail class="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                  <a class="text-[#0f766e] hover:underline" href={`mailto:${displayedRequest.assigned_sub_email}`}>
                    {displayedRequest.assigned_sub_email}
                  </a>
                </p>
              {/if}
              {#if displayedRequest.assigned_sub_phone}
                <p class="flex items-center gap-2">
                  <Phone class="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                  <a class="text-[#0f766e] hover:underline" href={`tel:${displayedRequest.assigned_sub_phone}`}>
                    {displayedRequest.assigned_sub_phone}
                  </a>
                </p>
              {/if}
              {#if displayedRequest.assigned_at}
                <p class="text-emerald-800">Assigned {formatTimestamp(displayedRequest.assigned_at)}</p>
              {/if}
            </div>
            <p class="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Don't forget: please text the substitute to confirm they can still make it.
            </p>
            <button
              type="button"
              class="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-bold text-gray-700 transition hover:border-[#0f766e]/30 hover:text-[#0f766e] disabled:cursor-not-allowed disabled:opacity-60"
              onclick={unassignSub}
              disabled={isSaving}
            >
              <UserX class="h-4 w-4" aria-hidden="true" />
              Un-assign sub
            </button>
          </section>
        {/if}

        <section class="mt-5 rounded-md border border-black/10 bg-white p-4" aria-labelledby="sub-drawer-volunteers-title">
          <div class="flex items-start justify-between gap-3">
            <h4 id="sub-drawer-volunteers-title" class="font-bold">
              Volunteers ({volunteers.length})
            </h4>
            {#if isSaving}
              <span class="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
                Saving
              </span>
            {/if}
          </div>

          {#if volunteers.length}
            <ul class="mt-3 space-y-3">
              {#each volunteers as volunteer (volunteer.id)}
                <li class="rounded-md border border-black/10 bg-gray-50 p-3">
                  <p class="font-bold">{volunteer.name}</p>
                  <div class="mt-1 space-y-1 text-sm">
                    <p class="flex items-center gap-2">
                      <Mail class="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                      <a class="text-[#0f766e] hover:underline" href={`mailto:${volunteer.email}`}>
                        {volunteer.email}
                      </a>
                    </p>
                    {#if volunteer.phone}
                      <p class="flex items-center gap-2">
                        <Phone class="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                        <a class="text-[#0f766e] hover:underline" href={`tel:${volunteer.phone}`}>
                          {volunteer.phone}
                        </a>
                      </p>
                    {/if}
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[#0f766e] px-3 text-sm font-bold text-white transition hover:bg-[#0c5f59] disabled:cursor-not-allowed disabled:opacity-60"
                      onclick={() => approveVolunteer(volunteer)}
                      disabled={isSaving}
                    >
                      <UserCheck class="h-4 w-4" aria-hidden="true" />
                      Approve
                    </button>
                    <button
                      type="button"
                      class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      onclick={() => rejectVolunteer(volunteer)}
                      disabled={isSaving}
                    >
                      <UserX class="h-4 w-4" aria-hidden="true" />
                      Reject
                    </button>
                  </div>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="mt-3 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center text-sm text-gray-500">
              No one has volunteered yet.
            </p>
          {/if}
        </section>

        <section class="mt-5 rounded-md border border-black/10 bg-white p-4" aria-labelledby="sub-drawer-assign-title">
          <h4 id="sub-drawer-assign-title" class="font-bold">Assign a sub manually</h4>
          <p class="mt-1 text-sm text-gray-600">
            Found a sub outside the volunteer list? Enter their contact info to confirm them.
          </p>
          <form class="mt-3 space-y-3" onsubmit={assignManually}>
            <label class="block text-sm font-bold" for={`sub-assign-name-${displayedRequest.id}`}>
              Name *
              <input
                id={`sub-assign-name-${displayedRequest.id}`}
                type="text"
                class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={assignName}
                disabled={isSaving}
              />
            </label>
            <label class="block text-sm font-bold" for={`sub-assign-email-${displayedRequest.id}`}>
              Email *
              <input
                id={`sub-assign-email-${displayedRequest.id}`}
                type="email"
                class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={assignEmail}
                disabled={isSaving}
              />
            </label>
            <label class="block text-sm font-bold" for={`sub-assign-phone-${displayedRequest.id}`}>
              Phone
              <input
                id={`sub-assign-phone-${displayedRequest.id}`}
                type="tel"
                class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={assignPhone}
                disabled={isSaving}
              />
            </label>
            <button
              type="submit"
              class="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#1E1E1E] px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving || !assignName.trim() || !assignEmail.trim()}
            >
              <UserCheck class="h-4 w-4" aria-hidden="true" />
              Assign sub
            </button>
          </form>
        </section>

        <section class="mt-5 rounded-md border border-red-200 bg-red-50/50 p-4">
          <h4 class="font-bold text-red-800">Danger zone</h4>
          <button
            type="button"
            class="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-red-300 bg-white px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            onclick={deleteRequest}
            disabled={isDeleting}
          >
            {#if isDeleting}
              <span class="h-4 w-4 rounded-full border-2 border-red-700 border-t-transparent animate-spin" aria-hidden="true"></span>
              Deleting
            {:else}
              <Trash2 class="h-4 w-4" aria-hidden="true" />
              Delete request
            {/if}
          </button>
        </section>
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
