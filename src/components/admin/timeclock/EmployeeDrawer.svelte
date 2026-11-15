<script>
  // Add or edit one person on the studio roster.
  //
  // New employees are created with a PENDING:<uuid> rfid_tag sentinel rather
  // than a blank one, because that is what puts them in the iPad's onboarding
  // queue for card assignment. The portal never assigns a real card.
  //
  // It can take one away, though. "Remove badge" swaps a real badge number
  // for a fresh PENDING:<uuid>, which frees a lost badge (and, since the
  // database allows a real badge on only one live employee, is how a
  // duplicate gets resolved) without anyone having to be at the studio.
  import { IdCard, Trash2, Unlink } from "@lucide/svelte";
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
  // Something changed on the server while the drawer stays open (a badge was
  // removed): the parent should reload its list but not close us.
  export let onChanged = () => {};

  let drawerOpen = false;
  let formKey = "";
  let isSaving = false;
  let isDeleting = false;
  let confirmingDelete = false;
  let errorMessage = "";
  let fieldError = "";

  // The badge as this drawer last knew it. Kept apart from `employee`
  // because the parent's row object goes stale the moment a badge is removed
  // while the drawer is still open on it.
  let rfidTag = "";
  let confirmingBadgeRemoval = false;
  let isRemovingBadge = false;
  let badgeNotice = "";

  let firstName = "";
  let lastName = "";
  let email = "";
  let pin = "";
  let jobTitle = "";
  let profileRole = "instructor";
  let isActive = true;

  $: isCreate = !employee?.id;

  $: syncFromProps(open, employee);
  $: if (!open && drawerOpen && !isSaving && !isDeleting && !isRemovingBadge) {
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
    confirmingBadgeRemoval = false;
    badgeNotice = "";
    rfidTag = target?.rfid_tag || "";

    firstName = target?.first_name || "";
    lastName = target?.last_name || "";
    email = target?.email || "";
    pin = target?.pin || "";
    jobTitle = target?.job_title || "";
    profileRole = target?.profile_role || "instructor";
    isActive = target ? Boolean(target.is_active) : true;
  }

  function requestClose() {
    if (isSaving || isDeleting || isRemovingBadge) return;
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

  $: needsCard = isCreate || isPendingRfid(rfidTag);

  // Takes this person's badge away by putting a fresh PENDING:<uuid> in its
  // place: the same placeholder a new portal employee starts with, so the
  // iPad drops the badge on its next sync and lists them as waiting for one.
  // The portal still never writes a real badge number.
  async function removeBadge() {
    if (!employee?.id || isRemovingBadge || isPendingRfid(rfidTag)) return;
    isRemovingBadge = true;
    errorMessage = "";
    badgeNotice = "";

    const removed = rfidTag;
    const placeholder = pendingRfidTag();

    // Compare-and-set on the badge we showed. If the iPad gave this person
    // a different badge since the roster loaded, removing "their badge"
    // would silently wipe the new one, so the write matches nothing instead.
    const { data, error } = await supabase
      .from("timeclock_employees")
      .update({ rfid_tag: placeholder })
      .eq("id", employee.id)
      .eq("rfid_tag", removed)
      .is("deleted_at", null)
      .select("id");

    isRemovingBadge = false;
    confirmingBadgeRemoval = false;

    if (error) {
      errorMessage = error.message;
      return;
    }
    if (!data?.length) {
      errorMessage =
        "Nothing was changed: this person's badge is no longer the one shown here, most likely because it was changed at the iPad. Close this panel to load the current roster, then try again.";
      onChanged();
      return;
    }

    rfidTag = placeholder;
    badgeNotice = `Badge ${removed} was removed. It stops working for this person the next time the studio iPad syncs, and can then be given to someone else.`;
    onChanged();
  }

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
  closeDisabled={isSaving || isDeleting || isRemovingBadge}
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
        <span class="text-xs font-bold uppercase tracking-[0.12em] text-ink/55">RFID badge</span>
      </div>
      {#if badgeNotice}
        <Banner
          tone="success"
          message={badgeNotice}
          class="mt-3"
          onDismiss={() => (badgeNotice = "")}
        />
      {/if}
      {#if needsCard}
        <p class="mt-2 text-sm leading-6 text-ink/65">
          {isCreate ? "They'll appear" : "They're waiting"} in the iPad's queue
          to get a badge. Tap their name at the studio and scan a blank badge
          to finish. Badges are never assigned from the portal.
        </p>
      {:else}
        <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p class="flex items-center gap-2 text-sm text-ink/65">
            <Badge tone="green" size="xs">Assigned</Badge>
            <span class="font-mono text-xs">{rfidTag}</span>
          </p>
          <Button
            size="sm"
            variant="danger"
            icon={Unlink}
            disabled={isSaving || isDeleting}
            loading={isRemovingBadge}
            onclick={() => (confirmingBadgeRemoval = true)}
          >
            Remove badge
          </Button>
        </div>
        <p class="mt-2 text-xs leading-5 text-ink/50">
          Lost or handed back? Remove it here so it stops working for this
          person, then scan their replacement at the iPad. A new badge is
          always assigned at the iPad, never from the portal.
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
          disabled={isSaving || isRemovingBadge}
          onclick={() => (confirmingDelete = true)}
        >
          Delete
        </Button>
      {/if}
      <div class="flex items-center gap-2">
        <Button
          variant="ghost"
          disabled={isSaving || isDeleting || isRemovingBadge}
          onclick={requestClose}
        >
          Cancel
        </Button>
        <Button variant="primary" loading={isSaving} disabled={isRemovingBadge} onclick={save}>
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

<ConfirmDialog
  open={confirmingBadgeRemoval}
  title={`Remove ${employeeLabel(employee)}'s badge?`}
  message={`Badge ${rfidTag} will stop clocking them in once the studio iPad next syncs; if the iPad is offline, that is when it reconnects. They go back to waiting for a badge, and this one can be given to someone else. Their shifts, PIN and details are not touched. To undo it, scan a badge for them again at the iPad.`}
  confirmLabel="Remove badge"
  tone="danger"
  busy={isRemovingBadge}
  onConfirm={removeBadge}
  onCancel={() => (confirmingBadgeRemoval = false)}
/>
