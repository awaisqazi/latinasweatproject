<script>
  import {
    CalendarClock,
    CheckCircle2,
    CircleAlert,
    Trash2,
    UserPlus,
  } from "@lucide/svelte";
  import {
    formatShortDate,
    formatTimeRange,
    fromDateTimeLocalInput,
    shiftLabel,
    toDateTimeLocalInput,
  } from "../../../lib/dashboard/volunteersAdmin.js";
  import SlideOver from "../marketing/SlideOver.svelte";

  export let supabase;
  export let shift = null;
  export let onClose = () => {};
  export let onChanged = () => {};
  export let onDeleted = () => {};

  const shiftColumns =
    "id, kind, title, description, location, starts_at, ends_at, lead_capacity, volunteer_capacity, cancelled, created_at, updated_at";

  let displayedShift = null;
  let drawerOpen = false;
  let isSaving = false;
  let isDeleting = false;
  let errorMessage = "";
  let successMessage = "";

  let titleDraft = "";
  let locationDraft = "";
  let descriptionDraft = "";
  let leadCapDraft = 1;
  let volCapDraft = 2;

  let roster = [];
  let rosterLoading = false;
  let busyRegistrationId = "";
  let editingTimeId = "";
  let editingTimeValue = "";

  let showAddForm = false;
  let addName = "";
  let addEmail = "";
  let addPhone = "";
  let addRole = "volunteer";
  let isAdding = false;
  let addError = "";

  $: if (shift?.id && shift.id !== displayedShift?.id) {
    openDrawer(shift);
  }
  $: hasDetailsFields =
    displayedShift?.kind === "custom" || displayedShift?.kind === "opportunity";

  function openDrawer(nextShift) {
    displayedShift = nextShift;
    titleDraft = nextShift.title || "";
    locationDraft = nextShift.location || "";
    descriptionDraft = nextShift.description || "";
    leadCapDraft = nextShift.lead_capacity;
    volCapDraft = nextShift.volunteer_capacity;
    errorMessage = "";
    successMessage = "";
    addError = "";
    showAddForm = false;
    addName = "";
    addEmail = "";
    addPhone = "";
    addRole = "volunteer";
    editingTimeId = "";
    drawerOpen = true;

    loadRoster(nextShift.id);
  }

  async function loadRoster(shiftId) {
    rosterLoading = true;

    const { data, error } = await supabase
      .from("shift_registrations")
      .select("id, shift_id, name, email, phone, role, checked_in, check_in_time, created_at")
      .eq("shift_id", shiftId)
      .order("created_at", { ascending: true });

    if (error) {
      errorMessage = error.message;
      roster = [];
    } else {
      roster = data || [];
    }

    rosterLoading = false;
  }

  function requestClose() {
    if (isSaving || isDeleting || isAdding) return;
    drawerOpen = false;
  }

  function handleClose() {
    displayedShift = null;
    roster = [];
    onClose();
  }

  async function saveUpdates(updates, successText) {
    if (!displayedShift?.id || isSaving) return;

    isSaving = true;
    errorMessage = "";
    successMessage = "";

    const { data, error } = await supabase
      .from("volunteer_shifts")
      .update(updates)
      .eq("id", displayedShift.id)
      .select(shiftColumns)
      .single();

    if (error) {
      errorMessage = error.message;
    } else {
      displayedShift = data;
      successMessage = successText;
      onChanged(data);
    }

    isSaving = false;
  }

  function saveDetails() {
    saveUpdates(
      {
        title: titleDraft.trim() || null,
        location: locationDraft.trim() || null,
        description: descriptionDraft.trim() || null,
      },
      "Details saved.",
    );
  }

  function saveCapacities() {
    const lead = Math.max(0, Number(leadCapDraft) || 0);
    const vol = Math.max(0, Number(volCapDraft) || 0);
    saveUpdates(
      { lead_capacity: lead, volunteer_capacity: vol },
      "Capacities updated.",
    );
  }

  function toggleCancelled() {
    const next = !displayedShift.cancelled;
    saveUpdates(
      { cancelled: next },
      next ? "Shift cancelled." : "Shift restored.",
    );
  }

  async function setCheckIn(registration, checkedIn) {
    if (busyRegistrationId) return;

    if (
      !checkedIn &&
      !window.confirm(
        `Un-check in ${registration.name}? Their check-in time will be cleared.`,
      )
    ) {
      return;
    }

    busyRegistrationId = registration.id;
    errorMessage = "";

    const { data, error } = await supabase
      .from("shift_registrations")
      .update({
        checked_in: checkedIn,
        check_in_time: checkedIn ? new Date().toISOString() : null,
      })
      .eq("id", registration.id)
      .select("id, shift_id, name, email, phone, role, checked_in, check_in_time, created_at")
      .single();

    if (error) {
      errorMessage = error.message;
    } else {
      roster = roster.map((reg) => (reg.id === data.id ? data : reg));
      onChanged(displayedShift);
    }

    busyRegistrationId = "";
  }

  function startEditingTime(registration) {
    editingTimeId = registration.id;
    editingTimeValue = toDateTimeLocalInput(
      registration.check_in_time || new Date().toISOString(),
    );
  }

  async function saveCheckInTime(registration) {
    const iso = fromDateTimeLocalInput(editingTimeValue);
    if (!iso) return;

    busyRegistrationId = registration.id;
    errorMessage = "";

    const { data, error } = await supabase
      .from("shift_registrations")
      .update({ checked_in: true, check_in_time: iso })
      .eq("id", registration.id)
      .select("id, shift_id, name, email, phone, role, checked_in, check_in_time, created_at")
      .single();

    if (error) {
      errorMessage = error.message;
    } else {
      roster = roster.map((reg) => (reg.id === data.id ? data : reg));
      editingTimeId = "";
      onChanged(displayedShift);
    }

    busyRegistrationId = "";
  }

  async function removeRegistration(registration) {
    if (
      !window.confirm(
        `Remove ${registration.name} (${registration.email}) from this shift?`,
      )
    ) {
      return;
    }

    busyRegistrationId = registration.id;
    errorMessage = "";

    const { error } = await supabase
      .from("shift_registrations")
      .delete()
      .eq("id", registration.id);

    if (error) {
      errorMessage = error.message;
    } else {
      roster = roster.filter((reg) => reg.id !== registration.id);
      onChanged(displayedShift);
    }

    busyRegistrationId = "";
  }

  async function addRegistration(event) {
    event?.preventDefault();
    if (isAdding) return;

    const name = addName.trim();
    const email = addEmail.trim().toLowerCase();
    if (!name || !email) {
      addError = "Name and email are required.";
      return;
    }

    isAdding = true;
    addError = "";

    const { data, error } = await supabase
      .from("shift_registrations")
      .insert({
        shift_id: displayedShift.id,
        name,
        email,
        phone: addPhone.trim() || null,
        role: addRole,
      })
      .select("id, shift_id, name, email, phone, role, checked_in, check_in_time, created_at")
      .single();

    if (error) {
      addError =
        error.code === "23505"
          ? "Someone is already registered for this shift with that email."
          : error.message;
    } else {
      roster = [...roster, data];
      addName = "";
      addEmail = "";
      addPhone = "";
      addRole = "volunteer";
      showAddForm = false;
      successMessage = "Registration added.";
      onChanged(displayedShift);
    }

    isAdding = false;
  }

  async function deleteShift() {
    if (!displayedShift?.id || isDeleting) return;

    const shouldDelete = window.confirm(
      `Delete this shift and all ${roster.length} registration${roster.length === 1 ? "" : "s"}? This cannot be undone.`,
    );
    if (!shouldDelete) return;

    isDeleting = true;
    errorMessage = "";

    const { error } = await supabase
      .from("volunteer_shifts")
      .delete()
      .eq("id", displayedShift.id);

    if (error) {
      errorMessage = error.message;
      isDeleting = false;
      return;
    }

    const deletedId = displayedShift.id;
    isDeleting = false;
    onDeleted(deletedId);
    requestClose();
  }

  function kindLabel(kind) {
    if (kind === "opportunity") return "Opportunity";
    if (kind === "custom") return "Custom shift";
    return "Recurring shift";
  }

  function formatCheckInTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  $: leadCount = roster.filter((reg) => reg.role === "lead").length;
  $: volunteerCount = roster.filter((reg) => reg.role === "volunteer").length;
</script>

<SlideOver
  open={drawerOpen}
  title={displayedShift ? shiftLabel(displayedShift) : ""}
  eyebrow={displayedShift ? `${kindLabel(displayedShift.kind)} · ${formatShortDate(displayedShift.starts_at)} · ${formatTimeRange(displayedShift.starts_at, displayedShift.ends_at)}` : "Shift details"}
  closeLabel="Close shift details"
  closeDisabled={isSaving || isDeleting || isAdding}
  onClose={requestClose}
  onClosed={handleClose}
>
  {#if displayedShift}
    <div class="px-5 py-5">
        <div class="flex flex-wrap gap-2">
          {#if displayedShift.cancelled}
            <span class="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
              Cancelled
            </span>
          {/if}
          <span class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700">
            <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
            Leads {leadCount}/{displayedShift.lead_capacity} · Volunteers {volunteerCount}/{displayedShift.volunteer_capacity}
          </span>
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

        <section class="mt-5 rounded-md border border-black/10 bg-white p-4">
          <div class="flex items-start justify-between gap-3">
            <h4 class="font-bold">Shift settings</h4>
            {#if isSaving}
              <span class="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
                Saving
              </span>
            {/if}
          </div>

          {#if hasDetailsFields}
            <label class="mt-4 block text-sm font-bold" for="shift-title-input">
              Title
              <input
                id="shift-title-input"
                type="text"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={titleDraft}
                placeholder="Shift title"
                disabled={isSaving}
                onblur={saveDetails}
              />
            </label>

            <label class="mt-4 block text-sm font-bold" for="shift-location-input">
              Location
              <input
                id="shift-location-input"
                type="text"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={locationDraft}
                placeholder="949 W 16th St, Chicago"
                disabled={isSaving}
                onblur={saveDetails}
              />
            </label>

            <label class="mt-4 block text-sm font-bold" for="shift-description-input">
              Description
              <textarea
                id="shift-description-input"
                class="mt-2 min-h-20 w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-normal leading-6 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={descriptionDraft}
                placeholder="What will volunteers do?"
                disabled={isSaving}
                onblur={saveDetails}
              ></textarea>
            </label>
          {/if}

          <div class="mt-4 grid grid-cols-2 gap-3">
            <label class="block text-sm font-bold" for="shift-lead-cap">
              Lead spots
              <input
                id="shift-lead-cap"
                type="number"
                min="0"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={leadCapDraft}
                disabled={isSaving}
                onblur={saveCapacities}
              />
            </label>
            <label class="block text-sm font-bold" for="shift-vol-cap">
              Volunteer spots
              <input
                id="shift-vol-cap"
                type="number"
                min="0"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={volCapDraft}
                disabled={isSaving}
                onblur={saveCapacities}
              />
            </label>
          </div>

          <button
            type="button"
            class="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 {displayedShift.cancelled
              ? 'border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50'
              : 'border-amber-300 bg-white text-amber-700 hover:bg-amber-50'}"
            onclick={toggleCancelled}
            disabled={isSaving}
          >
            {displayedShift.cancelled ? "Restore shift" : "Cancel shift"}
          </button>
        </section>

        <section class="mt-5 rounded-md border border-black/10 bg-white p-4">
          <div class="flex items-center justify-between gap-3">
            <h4 class="font-bold">Roster</h4>
            <button
              type="button"
              class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-[#ffbd59] px-3 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833]"
              onclick={() => {
                showAddForm = !showAddForm;
                addError = "";
              }}
            >
              <UserPlus class="h-4 w-4" aria-hidden="true" />
              Add
            </button>
          </div>

          {#if showAddForm}
            <form class="mt-3 rounded-md border border-black/10 bg-gray-50 p-3" onsubmit={addRegistration}>
              <div class="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  class="min-h-10 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                  placeholder="Full name"
                  aria-label="Full name"
                  bind:value={addName}
                  disabled={isAdding}
                />
                <input
                  type="email"
                  class="min-h-10 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                  placeholder="Email"
                  aria-label="Email"
                  bind:value={addEmail}
                  disabled={isAdding}
                />
                <input
                  type="tel"
                  class="min-h-10 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                  placeholder="Phone (optional)"
                  aria-label="Phone"
                  bind:value={addPhone}
                  disabled={isAdding}
                />
                <select
                  class="min-h-10 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                  aria-label="Role"
                  bind:value={addRole}
                  disabled={isAdding}
                >
                  <option value="volunteer">Volunteer</option>
                  <option value="lead">Lead</option>
                </select>
              </div>
              {#if addError}
                <div class="mt-2 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                  <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{addError}</span>
                </div>
              {/if}
              <button
                type="submit"
                class="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#1E1E1E] px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isAdding || !addName.trim() || !addEmail.trim()}
              >
                {#if isAdding}
                  <span class="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true"></span>
                  Adding
                {:else}
                  Add registration
                {/if}
              </button>
            </form>
          {/if}

          {#if rosterLoading}
            <div class="mt-4 flex items-center gap-3 text-sm text-gray-600">
              <span class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin" aria-hidden="true"></span>
              Loading roster
            </div>
          {:else if !roster.length}
            <p class="mt-4 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 py-5 text-center text-sm text-gray-500">
              No one is registered for this shift yet.
            </p>
          {:else}
            <ul class="mt-3 space-y-2">
              {#each roster as registration (registration.id)}
                <li class="rounded-md border border-black/10 bg-white p-3">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="font-bold leading-snug">{registration.name}</p>
                        <span class="rounded-full px-2 py-0.5 text-xs font-bold {registration.role === 'lead' ? 'bg-purple-100 text-purple-700' : 'bg-teal-50 text-teal-700'}">
                          {registration.role === "lead" ? "Lead" : "Volunteer"}
                        </span>
                      </div>
                      <p class="mt-1 break-all text-sm text-gray-600">{registration.email}</p>
                      {#if registration.phone}
                        <p class="text-sm text-gray-600">{registration.phone}</p>
                      {/if}
                      {#if registration.checked_in}
                        <p class="mt-1 text-xs font-bold text-emerald-700">
                          Checked in{registration.check_in_time ? `: ${formatCheckInTime(registration.check_in_time)}` : ""}
                        </p>
                      {/if}
                    </div>
                    <button
                      type="button"
                      class="rounded-md p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                      aria-label={`Remove ${registration.name}`}
                      onclick={() => removeRegistration(registration)}
                      disabled={busyRegistrationId === registration.id}
                    >
                      <Trash2 class="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  {#if editingTimeId === registration.id}
                    <div class="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        type="datetime-local"
                        class="min-h-9 rounded-md border border-gray-200 bg-white px-2 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                        aria-label="Check-in time"
                        bind:value={editingTimeValue}
                      />
                      <button
                        type="button"
                        class="min-h-9 rounded-md bg-[#0f766e] px-3 text-xs font-bold text-white transition hover:bg-[#0d655e] disabled:opacity-60"
                        onclick={() => saveCheckInTime(registration)}
                        disabled={busyRegistrationId === registration.id || !editingTimeValue}
                      >
                        Save time
                      </button>
                      <button
                        type="button"
                        class="min-h-9 rounded-md border border-gray-200 px-3 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
                        onclick={() => (editingTimeId = "")}
                      >
                        Cancel
                      </button>
                    </div>
                  {:else}
                    <div class="mt-3 flex flex-wrap gap-2">
                      {#if registration.checked_in}
                        <button
                          type="button"
                          class="min-h-9 rounded-md border border-amber-300 bg-white px-3 text-xs font-bold text-amber-700 transition hover:bg-amber-50 disabled:opacity-60"
                          onclick={() => setCheckIn(registration, false)}
                          disabled={busyRegistrationId === registration.id}
                        >
                          Un-check in
                        </button>
                        <button
                          type="button"
                          class="min-h-9 rounded-md border border-gray-200 bg-white px-3 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
                          onclick={() => startEditingTime(registration)}
                        >
                          Edit time
                        </button>
                      {:else}
                        <button
                          type="button"
                          class="min-h-9 rounded-md bg-[#0f766e] px-3 text-xs font-bold text-white transition hover:bg-[#0d655e] disabled:opacity-60"
                          onclick={() => setCheckIn(registration, true)}
                          disabled={busyRegistrationId === registration.id}
                        >
                          Check in
                        </button>
                        <button
                          type="button"
                          class="min-h-9 rounded-md border border-gray-200 bg-white px-3 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
                          onclick={() => startEditingTime(registration)}
                        >
                          Set time
                        </button>
                      {/if}
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        <section class="mt-5 rounded-md border border-red-200 bg-red-50/50 p-4">
          <h4 class="font-bold text-red-800">Danger zone</h4>
          <p class="mt-1 text-sm text-red-700">
            Deleting a shift also removes every registration on it.
          </p>
          <button
            type="button"
            class="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-red-300 bg-white px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            onclick={deleteShift}
            disabled={isDeleting}
          >
            {#if isDeleting}
              <span class="h-4 w-4 rounded-full border-2 border-red-700 border-t-transparent animate-spin" aria-hidden="true"></span>
              Deleting
            {:else}
              <Trash2 class="h-4 w-4" aria-hidden="true" />
              Delete shift
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
