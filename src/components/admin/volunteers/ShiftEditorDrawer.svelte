<script>
  import { CalendarClock, Trash2, UserPlus } from "@lucide/svelte";
  import {
    categoryLabel,
    formatShortDate,
    formatTimeRange,
    fromDateTimeLocalInput,
    isOverlapError,
    shiftLabel,
    toDateTimeLocalInput,
  } from "../../../lib/dashboard/volunteersAdmin.js";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Field from "../ui/Field.svelte";

  export let supabase;
  export let shift = null;
  export let onClose = () => {};
  export let onChanged = () => {};
  export let onDeleted = () => {};

  const shiftColumns =
    "id, kind, category, title, description, location, starts_at, ends_at, lead_capacity, volunteer_capacity, cancelled, created_at, updated_at";

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

  let confirmingUncheck = null; // registration awaiting un-check-in confirm
  let confirmingRemove = null; // registration awaiting removal confirm
  let confirmingDelete = false;

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
    confirmingUncheck = null;
    confirmingRemove = null;
    confirmingDelete = false;
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
    drawerOpen = false;
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
      errorMessage = isOverlapError(error)
        ? "Another operational shift now covers this time, so this one cannot be restored. Cancel the other shift first."
        : error.message;
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

  function requestSetCheckIn(registration, checkedIn) {
    if (busyRegistrationId) return;

    if (!checkedIn) {
      confirmingUncheck = registration;
      return;
    }

    setCheckIn(registration, checkedIn);
  }

  async function setCheckIn(registration, checkedIn) {
    if (busyRegistrationId) return;

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

  async function confirmUncheck() {
    const registration = confirmingUncheck;
    if (!registration) return;
    await setCheckIn(registration, false);
    confirmingUncheck = null;
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

  async function confirmRemove() {
    const registration = confirmingRemove;
    if (!registration) return;
    await removeRegistration(registration);
    confirmingRemove = null;
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

    isDeleting = true;
    errorMessage = "";

    const { error } = await supabase
      .from("volunteer_shifts")
      .delete()
      .eq("id", displayedShift.id);

    if (error) {
      errorMessage = error.message;
      isDeleting = false;
      confirmingDelete = false;
      return;
    }

    const deletedId = displayedShift.id;
    isDeleting = false;
    confirmingDelete = false;
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
  eyebrow={displayedShift ? `${kindLabel(displayedShift.kind)} · ${categoryLabel(displayedShift.category)} · ${formatShortDate(displayedShift.starts_at)} · ${formatTimeRange(displayedShift.starts_at, displayedShift.ends_at)}` : "Shift details"}
  closeLabel="Close shift details"
  closeDisabled={isSaving || isDeleting || isAdding}
  onClose={requestClose}
  onClosed={handleClose}
>
  {#if displayedShift}
    <div class="px-5 py-5">
        <div class="flex flex-wrap gap-2">
          {#if displayedShift.cancelled}
            <Badge tone="red">Cancelled</Badge>
          {/if}
          <Badge tone="neutral">
            <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
            Leads {leadCount}/{displayedShift.lead_capacity} · Volunteers {volunteerCount}/{displayedShift.volunteer_capacity}
          </Badge>
        </div>

        {#if errorMessage}
          <Banner tone="error" message={errorMessage} class="mt-4" />
        {/if}

        {#if successMessage}
          <Banner tone="success" message={successMessage} class="mt-4" />
        {/if}

        <section class="mt-5 rounded-card border border-ink/8 bg-white p-4">
          <div class="flex items-start justify-between gap-3">
            <h4 class="font-bold text-ink">Shift settings</h4>
            {#if isSaving}
              <Badge tone="neutral" class="shrink-0">Saving</Badge>
            {/if}
          </div>

          {#if hasDetailsFields}
            <Field label="Title" id="shift-title-input" class="mt-4">
              <input
                id="shift-title-input"
                type="text"
                class="input"
                bind:value={titleDraft}
                placeholder="Shift title"
                disabled={isSaving}
                onblur={saveDetails}
              />
            </Field>

            <Field label="Location" id="shift-location-input" class="mt-4">
              <input
                id="shift-location-input"
                type="text"
                class="input"
                bind:value={locationDraft}
                placeholder="949 W 16th St, Chicago"
                disabled={isSaving}
                onblur={saveDetails}
              />
            </Field>

            <Field label="Description" id="shift-description-input" class="mt-4">
              <textarea
                id="shift-description-input"
                class="textarea min-h-20"
                bind:value={descriptionDraft}
                placeholder="What will volunteers do?"
                disabled={isSaving}
                onblur={saveDetails}
              ></textarea>
            </Field>
          {/if}

          <div class="mt-4 grid grid-cols-2 gap-3">
            <Field label="Lead spots" id="shift-lead-cap">
              <input
                id="shift-lead-cap"
                type="number"
                min="0"
                class="input"
                bind:value={leadCapDraft}
                disabled={isSaving}
                onblur={saveCapacities}
              />
            </Field>
            <Field label="Volunteer spots" id="shift-vol-cap">
              <input
                id="shift-vol-cap"
                type="number"
                min="0"
                class="input"
                bind:value={volCapDraft}
                disabled={isSaving}
                onblur={saveCapacities}
              />
            </Field>
          </div>

          <Button
            variant={displayedShift.cancelled ? "secondary" : "danger"}
            class="mt-4"
            onclick={toggleCancelled}
            disabled={isSaving}
          >
            {displayedShift.cancelled ? "Restore shift" : "Cancel shift"}
          </Button>
        </section>

        <section class="mt-5 rounded-card border border-ink/8 bg-white p-4">
          <div class="flex items-center justify-between gap-3">
            <h4 class="font-bold text-ink">Roster</h4>
            <Button
              variant="primary"
              size="sm"
              icon={UserPlus}
              onclick={() => {
                showAddForm = !showAddForm;
                addError = "";
              }}
            >
              Add
            </Button>
          </div>

          {#if showAddForm}
            <form class="mt-3 rounded-card border border-ink/8 bg-canvas p-3" onsubmit={addRegistration}>
              <div class="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  class="input"
                  placeholder="Full name"
                  aria-label="Full name"
                  bind:value={addName}
                  disabled={isAdding}
                />
                <input
                  type="email"
                  class="input"
                  placeholder="Email"
                  aria-label="Email"
                  bind:value={addEmail}
                  disabled={isAdding}
                />
                <input
                  type="tel"
                  class="input"
                  placeholder="Phone (optional)"
                  aria-label="Phone"
                  bind:value={addPhone}
                  disabled={isAdding}
                />
                <select
                  class="select"
                  aria-label="Role"
                  bind:value={addRole}
                  disabled={isAdding}
                >
                  <option value="volunteer">Volunteer</option>
                  <option value="lead">Lead</option>
                </select>
              </div>
              {#if addError}
                <Banner tone="error" message={addError} class="mt-2" />
              {/if}
              <Button
                type="submit"
                variant="dark"
                class="mt-3"
                loading={isAdding}
                disabled={!addName.trim() || !addEmail.trim()}
              >
                {isAdding ? "Adding" : "Add registration"}
              </Button>
            </form>
          {/if}

          {#if rosterLoading}
            <div class="mt-4 flex items-center gap-3 text-sm text-ink/60">
              <span class="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden="true"></span>
              Loading roster
            </div>
          {:else if !roster.length}
            <p class="mt-4 rounded-card border border-dashed border-ink/15 bg-canvas/60 px-3 py-5 text-center text-sm text-ink/50">
              No one is registered for this shift yet.
            </p>
          {:else}
            <ul class="mt-3 space-y-2">
              {#each roster as registration (registration.id)}
                <li class="rounded-control border border-ink/8 bg-white p-3">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="font-bold leading-snug text-ink">{registration.name}</p>
                        <Badge tone={registration.role === "lead" ? "teal" : "neutral"} size="xs">
                          {registration.role === "lead" ? "Lead" : "Volunteer"}
                        </Badge>
                      </div>
                      <p class="mt-1 break-all text-sm text-ink/60">{registration.email}</p>
                      {#if registration.phone}
                        <p class="text-sm text-ink/60">{registration.phone}</p>
                      {/if}
                      {#if registration.checked_in}
                        <p class="mt-1 text-xs font-bold text-green-700">
                          Checked in{registration.check_in_time ? `: ${formatCheckInTime(registration.check_in_time)}` : ""}
                        </p>
                      {/if}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      icon={Trash2}
                      label={`Remove ${registration.name}`}
                      onclick={() => (confirmingRemove = registration)}
                      disabled={busyRegistrationId === registration.id}
                    />
                  </div>

                  {#if editingTimeId === registration.id}
                    <div class="mt-3 flex flex-wrap items-center gap-2">
                      <div class="w-60 max-w-full">
                        <input
                          type="datetime-local"
                          class="input"
                          aria-label="Check-in time"
                          bind:value={editingTimeValue}
                        />
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        loading={busyRegistrationId === registration.id}
                        disabled={!editingTimeValue}
                        onclick={() => saveCheckInTime(registration)}
                      >
                        Save time
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => (editingTimeId = "")}
                      >
                        Cancel
                      </Button>
                    </div>
                  {:else}
                    <div class="mt-3 flex flex-wrap gap-2">
                      {#if registration.checked_in}
                        <Button
                          variant="secondary"
                          size="sm"
                          onclick={() => requestSetCheckIn(registration, false)}
                          disabled={busyRegistrationId === registration.id}
                        >
                          Un-check in
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onclick={() => startEditingTime(registration)}
                        >
                          Edit time
                        </Button>
                      {:else}
                        <Button
                          variant="primary"
                          size="sm"
                          loading={busyRegistrationId === registration.id}
                          onclick={() => requestSetCheckIn(registration, true)}
                        >
                          Check in
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onclick={() => startEditingTime(registration)}
                        >
                          Set time
                        </Button>
                      {/if}
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </section>

        <section class="mt-5 rounded-card border border-red-200 bg-red-50/50 p-4">
          <h4 class="font-bold text-red-800">Danger zone</h4>
          <p class="mt-1 text-sm text-red-700">
            Deleting a shift also removes every registration on it.
          </p>
          <Button
            variant="danger"
            class="mt-3"
            icon={Trash2}
            loading={isDeleting}
            onclick={() => (confirmingDelete = true)}
          >
            {isDeleting ? "Deleting" : "Delete shift"}
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
  open={!!confirmingUncheck}
  title="Un-check in volunteer?"
  message={confirmingUncheck ? `Un-check in ${confirmingUncheck.name}? Their check-in time will be cleared.` : ""}
  confirmLabel="Un-check in"
  tone="primary"
  busy={!!confirmingUncheck && busyRegistrationId === confirmingUncheck.id}
  onConfirm={confirmUncheck}
  onCancel={() => (confirmingUncheck = null)}
/>

<ConfirmDialog
  open={!!confirmingRemove}
  title="Remove registration?"
  message={confirmingRemove ? `Remove ${confirmingRemove.name} (${confirmingRemove.email}) from this shift?` : ""}
  confirmLabel="Remove"
  tone="danger"
  busy={!!confirmingRemove && busyRegistrationId === confirmingRemove.id}
  onConfirm={confirmRemove}
  onCancel={() => (confirmingRemove = null)}
/>

<ConfirmDialog
  open={confirmingDelete}
  title="Delete shift?"
  message={`Delete this shift and all ${roster.length} registration${roster.length === 1 ? "" : "s"}? This cannot be undone.`}
  confirmLabel="Delete shift"
  tone="danger"
  busy={isDeleting}
  onConfirm={deleteShift}
  onCancel={() => (confirmingDelete = false)}
/>
