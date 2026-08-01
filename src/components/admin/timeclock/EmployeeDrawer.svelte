<script>
  // Add or edit one person on the studio roster.
  //
  // New employees are created with a PENDING:<uuid> rfid_tag sentinel rather
  // than a blank one, because that is what puts them in the iPad's onboarding
  // queue for card assignment. The portal never assigns a real card.
  import { IdCard, Trash2 } from "@lucide/svelte";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Field from "../ui/Field.svelte";
  import {
    PROFILE_ROLE_LABELS,
    PROFILE_ROLE_OPTIONS,
    employeeLabel,
    isPendingRfid,
    newId,
    pendingRfidTag,
  } from "../../../lib/dashboard/timeclock";

  export let supabase;
  export let employees = [];
  export let open = false;
  export let employee = null; // null = create mode
  export let onClose = () => {};
  export let onSaved = () => {};

  let drawerOpen = false;
  let formKey = "";
  let isSaving = false;
  let isDeleting = false;
  let confirmingDelete = false;
  let errorMessage = "";
  let fieldError = "";

  let firstName = "";
  let lastName = "";
  let email = "";
  let pin = "";
  let jobTitle = "";
  let profileRole = "instructor";
  let isActive = true;

  $: isCreate = !employee?.id;

  $: syncFromProps(open, employee);
  $: if (!open && drawerOpen && !isSaving && !isDeleting) {
    drawerOpen = false;
  }

  function syncFromProps(isOpen, target) {
    if (!isOpen) return;
    const key = target?.id || "__new__";
    if (key === formKey && drawerOpen) return;
    formKey = key;
    buildForm(target);
    drawerOpen = true;
  }

  function buildForm(target) {
    errorMessage = "";
    fieldError = "";
    confirmingDelete = false;

    firstName = target?.first_name || "";
    lastName = target?.last_name || "";
    email = target?.email || "";
    pin = target?.pin || "";
    jobTitle = target?.job_title || "";
    profileRole = target?.profile_role || "instructor";
    isActive = target ? Boolean(target.is_active) : true;
  }

  function requestClose() {
    if (isSaving || isDeleting) return;
    drawerOpen = false;
  }

  function handleClosed() {
    drawerOpen = false;
    formKey = "";
    onClose();
  }

  // Emails are the fallback identity when the kiosk CSV has no ids, so a
  // duplicate is worth flagging even though nothing enforces uniqueness.
  $: normalizedEmail = email.trim().toLowerCase();
  $: duplicateEmail =
    normalizedEmail &&
    employees.find(
      (other) =>
        other.id !== employee?.id &&
        String(other.email || "").trim().toLowerCase() === normalizedEmail,
    );

  $: needsCard = isCreate || isPendingRfid(employee?.rfid_tag);

  function validate() {
    if (!firstName.trim() && !lastName.trim() && !normalizedEmail) {
      return "Give this person at least a name or an email.";
    }
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return "That email address does not look right.";
    }
    const trimmedPin = pin.trim();
    if (trimmedPin && !/^\d{4}$/.test(trimmedPin)) {
      return "A PIN has to be exactly 4 digits (or left blank).";
    }
    return "";
  }

  async function save() {
    if (isSaving) return;

    fieldError = validate();
    if (fieldError) return;

    isSaving = true;
    errorMessage = "";

    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: normalizedEmail,
      pin: pin.trim(),
      job_title: jobTitle.trim(),
      profile_role: profileRole,
      is_active: isActive,
    };

    // updated_at is stamped by a server trigger; never send it.
    const { error } = isCreate
      ? await supabase.from("timeclock_employees").insert({
          ...payload,
          id: newId(),
          rfid_tag: pendingRfidTag(),
        })
      : await supabase
          .from("timeclock_employees")
          .update(payload)
          .eq("id", employee.id);

    isSaving = false;

    if (error) {
      errorMessage = error.message;
      return;
    }

    drawerOpen = false;
    onSaved();
  }

  async function softDelete() {
    if (!employee?.id || isDeleting) return;
    isDeleting = true;
    errorMessage = "";

    // One stamp for the person and their shifts, so the kiosk sees a single
    // coherent removal rather than two unrelated ones.
    const stamp = new Date().toISOString();

    // Punches first, deliberately. A failure between the two writes then
    // leaves live punches under a live employee (harmless, retryable) rather
    // than orphaned punches under a tombstoned employee, which would keep
    // paying out hours to a person the roster no longer knows about.
    const { error: punchError } = await supabase
      .from("timeclock_punches")
      .update({ deleted_at: stamp })
      .eq("employee_id", employee.id)
      .is("deleted_at", null);

    if (punchError) {
      isDeleting = false;
      confirmingDelete = false;
      errorMessage = punchError.message;
      return;
    }

    const { error } = await supabase
      .from("timeclock_employees")
      .update({ deleted_at: stamp, is_active: false })
      .eq("id", employee.id);

    isDeleting = false;
    confirmingDelete = false;

    if (error) {
      errorMessage = error.message;
      return;
    }

    drawerOpen = false;
    onSaved();
  }
</script>

<SlideOver
  open={drawerOpen}
  title={isCreate ? "Add an employee" : employeeLabel(employee)}
  eyebrow={isCreate
    ? "New roster entry"
    : `${PROFILE_ROLE_LABELS[employee?.profile_role] || "Instructor"} · ${employee?.is_active ? "Active" : "Inactive"}`}
  closeLabel="Close employee editor"
  closeDisabled={isSaving || isDeleting}
  onClose={requestClose}
  onClosed={handleClosed}
>
  <div class="space-y-4 px-5 py-5">
    {#if errorMessage}
      <Banner tone="error" message={errorMessage} />
    {/if}

    <div class="grid gap-4 sm:grid-cols-2">
      <Field label="First name" id="employee-first">
        <input id="employee-first" class="input" bind:value={firstName} disabled={isSaving} />
      </Field>
      <Field label="Last name" id="employee-last">
        <input id="employee-last" class="input" bind:value={lastName} disabled={isSaving} />
      </Field>
    </div>

    <Field
      label="Email"
      id="employee-email"
      hint="Stored lowercase. Used to match rows when importing kiosk CSVs."
      error={duplicateEmail ? `${employeeLabel(duplicateEmail)} already uses this email.` : ""}
    >
      <input
        id="employee-email"
        type="email"
        class="input"
        bind:value={email}
        disabled={isSaving}
        placeholder="name@latinasweatproject.com"
      />
    </Field>

    <div class="grid gap-4 sm:grid-cols-2">
      <Field label="PIN" id="employee-pin" hint="Exactly 4 digits, or blank for none">
        <input
          id="employee-pin"
          class="input"
          inputmode="numeric"
          maxlength="4"
          bind:value={pin}
          disabled={isSaving}
          placeholder="1234"
        />
      </Field>
      <Field label="Job title" id="employee-job" hint="Free text — the kiosk calls this their role">
        <input
          id="employee-job"
          class="input"
          bind:value={jobTitle}
          disabled={isSaving}
          placeholder="Lead Instructor"
        />
      </Field>
    </div>

    <Field
      label="Classification"
      id="employee-role"
      hint="Which kinds of shift this person can clock in for"
    >
      <select id="employee-role" class="select" bind:value={profileRole} disabled={isSaving}>
        {#each PROFILE_ROLE_OPTIONS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </Field>

    <label class="flex items-start gap-3 rounded-control border border-ink/10 bg-white px-4 py-3">
      <input
        type="checkbox"
        class="mt-0.5 h-4 w-4 accent-[#0f766e]"
        bind:checked={isActive}
        disabled={isSaving}
      />
      <span class="min-w-0">
        <span class="block text-sm font-semibold text-ink">Active</span>
        <span class="block text-xs leading-5 text-ink/55">
          Inactive staff cannot clock in at the iPad, but all of their past
          shifts stay on the timesheets.
        </span>
      </span>
    </label>

    <div class="rounded-control border border-ink/8 bg-canvas/60 p-4">
      <div class="flex items-center gap-2">
        <IdCard class="h-4 w-4 text-accent" aria-hidden="true" />
        <span class="text-xs font-bold uppercase tracking-[0.12em] text-ink/55">RFID card</span>
      </div>
      {#if needsCard}
        <p class="mt-2 text-sm leading-6 text-ink/65">
          {isCreate ? "They'll appear" : "They're waiting"} in the iPad's onboarding
          queue to get a card. Tap their name at the studio and scan a blank card
          to finish. Cards are never assigned from the portal.
        </p>
      {:else}
        <p class="mt-2 flex items-center gap-2 text-sm text-ink/65">
          <Badge tone="green" size="xs">Assigned</Badge>
          <span class="font-mono text-xs">{employee?.rfid_tag}</span>
        </p>
        <p class="mt-2 text-xs leading-5 text-ink/50">
          To replace a lost card, re-enroll this person at the iPad.
        </p>
      {/if}
    </div>

    {#if fieldError}
      <Banner tone="warning" message={fieldError} onDismiss={() => (fieldError = "")} />
    {/if}

    <div class="flex flex-wrap items-center justify-between gap-2 border-t border-ink/8 pt-4">
      {#if isCreate}
        <span></span>
      {:else}
        <Button
          variant="danger"
          icon={Trash2}
          disabled={isSaving}
          onclick={() => (confirmingDelete = true)}
        >
          Delete
        </Button>
      {/if}
      <div class="flex items-center gap-2">
        <Button variant="ghost" disabled={isSaving || isDeleting} onclick={requestClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={isSaving} onclick={save}>
          {isCreate ? "Add employee" : "Save changes"}
        </Button>
      </div>
    </div>
  </div>
</SlideOver>

<ConfirmDialog
  open={confirmingDelete}
  title={`Delete ${employeeLabel(employee)}?`}
  message="This removes them from the roster and from the studio iPad on its next sync, their card stops working, and every shift they ever worked is removed from timesheets, totals, and exports along with them. If they have simply left, untick Active instead — deactivating stops them clocking in but keeps their whole history on the timesheets, and it is reversible."
  confirmLabel="Delete employee and their shifts"
  tone="danger"
  busy={isDeleting}
  onConfirm={softDelete}
  onCancel={() => (confirmingDelete = false)}
/>
