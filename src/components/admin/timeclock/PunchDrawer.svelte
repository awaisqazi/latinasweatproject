<script>
  // Create or correct a single shift. The datetime-local inputs are read and
  // written as STUDIO wall-clock time regardless of where the admin is, which
  // is the only interpretation that matches what the kiosk showed the
  // employee.
  import { Clock, Trash2 } from "@lucide/svelte";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Field from "../ui/Field.svelte";
  import {
    SHIFT_ROLE_OPTIONS,
    SOURCE_LABELS,
    billableHours,
    chicagoInputRoundTrip,
    chicagoLocalToUtcIso,
    employeeLabel,
    formatChicagoDateTimeLabel,
    formatHours,
    loggedHours,
    newId,
    toChicagoInputValue,
  } from "../../../lib/dashboard/timeclock";

  export let supabase;
  export let employees = [];
  export let open = false;
  export let punch = null; // null = create mode
  export let onClose = () => {};
  export let onSaved = () => {};

  let drawerOpen = false;
  let formKey = "";
  let isSaving = false;
  let isDeleting = false;
  let confirmingDelete = false;
  let errorMessage = "";
  let fieldError = "";

  let employeeId = "";
  let clockInLocal = "";
  let clockOutLocal = "";
  // What the form was seeded with. datetime-local only carries minutes, so a
  // kiosk timestamp with seconds comes back truncated; comparing against
  // these keeps a note-only edit from silently rewriting the clock times.
  let seededClockInLocal = "";
  let seededClockOutLocal = "";
  let shiftRole = "instructor";
  let scheduledClasses = 0;
  let actualClasses = 0;
  let wasForcedOut = false;
  let note = "";

  $: isCreate = !punch?.id;

  // Rebuild the form whenever a different record (or "new") is requested.
  $: syncFromProps(open, punch);
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

    if (target?.id) {
      employeeId = target.employee_id || "";
      clockInLocal = toChicagoInputValue(target.clock_in_at);
      clockOutLocal = target.clock_out_at ? toChicagoInputValue(target.clock_out_at) : "";
      seededClockInLocal = clockInLocal;
      seededClockOutLocal = clockOutLocal;
      shiftRole = target.shift_role || "instructor";
      scheduledClasses = target.scheduled_classes ?? 0;
      actualClasses = target.actual_classes_taught ?? 0;
      wasForcedOut = Boolean(target.was_forced_out);
      note = target.note || "";
      return;
    }

    employeeId = "";
    clockInLocal = "";
    clockOutLocal = "";
    seededClockInLocal = "";
    seededClockOutLocal = "";
    shiftRole = "instructor";
    scheduledClasses = 0;
    actualClasses = 0;
    wasForcedOut = false;
    note = "";
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

  $: activeEmployees = employees.filter(
    (employee) => employee.is_active || employee.id === employeeId,
  );
  $: selectedEmployee = employees.find((employee) => employee.id === employeeId) || null;

  // Live preview of what this shift will be worth, using exactly the same
  // derivation the tables and CSV use.
  $: previewPunch = {
    clock_in_at: clockInLocal ? chicagoLocalToUtcIso(clockInLocal) : null,
    clock_out_at: clockOutLocal ? chicagoLocalToUtcIso(clockOutLocal) : null,
    shift_role: shiftRole,
    actual_classes_taught: Number(actualClasses) || 0,
  };
  $: previewLogged = formatHours(loggedHours(previewPunch));
  $: previewBillable = formatHours(billableHours(previewPunch));

  // The hour that daylight saving skips does not exist on the studio's clock.
  // Typing it still saves a real instant — an hour away from what was typed —
  // so say so rather than letting the drawer reopen showing a different time.
  $: clockInTrip = chicagoInputRoundTrip(clockInLocal);
  $: clockOutTrip = chicagoInputRoundTrip(clockOutLocal);
  $: shiftedTimes = [
    clockInTrip.shifted ? `clock in saves as ${formatChicagoDateTimeLabel(clockInTrip.iso)}` : "",
    clockOutTrip.shifted ? `clock out saves as ${formatChicagoDateTimeLabel(clockOutTrip.iso)}` : "",
  ].filter(Boolean);

  function validate() {
    if (!employeeId) return "Pick who this shift belongs to.";
    if (!clockInLocal) return "A clock-in time is required.";

    const inIso = chicagoLocalToUtcIso(clockInLocal);
    if (!inIso) return "That clock-in time could not be read.";

    if (clockOutLocal) {
      const outIso = chicagoLocalToUtcIso(clockOutLocal);
      if (!outIso) return "That clock-out time could not be read.";
      if (new Date(outIso).getTime() <= new Date(inIso).getTime()) {
        return "Clock out has to be after clock in.";
      }
    }

    if (shiftRole === "instructor") {
      const scheduled = Number(scheduledClasses) || 0;
      const actual = Number(actualClasses) || 0;
      if (scheduled < 0 || actual < 0) return "Class counts cannot be negative.";
      if (actual > scheduled) {
        return "Classes taught cannot be more than classes scheduled.";
      }
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
      employee_id: employeeId,
      shift_role: shiftRole,
      scheduled_classes: shiftRole === "instructor" ? Number(scheduledClasses) || 0 : 0,
      actual_classes_taught: shiftRole === "instructor" ? Number(actualClasses) || 0 : 0,
      was_forced_out: wasForcedOut,
      note: note.trim(),
    };

    // Only send a time the admin actually touched. The input rounds a kiosk
    // stamp of 09:00:37 down to 09:00, so sending it back on every save would
    // shave seconds off shifts nobody meant to edit.
    if (isCreate || clockInLocal !== seededClockInLocal) {
      payload.clock_in_at = chicagoLocalToUtcIso(clockInLocal);
    }
    if (isCreate || clockOutLocal !== seededClockOutLocal) {
      payload.clock_out_at = clockOutLocal ? chicagoLocalToUtcIso(clockOutLocal) : null;
    }

    // updated_at is stamped by a server trigger; never send it.
    const { error } = isCreate
      ? await supabase.from("timeclock_punches").insert({
          ...payload,
          // Client-generated uuid so a kiosk pull is idempotent.
          id: newId(),
          source: "portal",
        })
      : await supabase.from("timeclock_punches").update(payload).eq("id", punch.id);

    isSaving = false;

    if (error) {
      errorMessage = error.message;
      return;
    }

    drawerOpen = false;
    onSaved();
  }

  async function softDelete() {
    if (!punch?.id || isDeleting) return;
    isDeleting = true;
    errorMessage = "";

    // Tombstone, never a hard delete: the kiosk needs to see the removal to
    // converge after an offline stretch.
    const { error } = await supabase
      .from("timeclock_punches")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", punch.id);

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
  title={isCreate ? "Add a punch" : selectedEmployee ? employeeLabel(selectedEmployee) : "Edit punch"}
  eyebrow={isCreate
    ? "New shift · recorded from the portal"
    : `${SOURCE_LABELS[punch?.source] || "Shift"} · ${formatChicagoDateTimeLabel(punch?.clock_in_at)}`}
  closeLabel="Close punch editor"
  closeDisabled={isSaving || isDeleting}
  onClose={requestClose}
  onClosed={handleClosed}
>
  <div class="space-y-4 px-5 py-5">
    {#if errorMessage}
      <Banner tone="error" message={errorMessage} />
    {/if}

    <Field
      label="Employee"
      id="punch-employee"
      required
      hint={isCreate ? "Only active staff are listed." : ""}
    >
      <select id="punch-employee" class="select" bind:value={employeeId} disabled={isSaving}>
        <option value="">Select someone…</option>
        {#each activeEmployees as employee (employee.id)}
          <option value={employee.id}>
            {employeeLabel(employee)}{employee.job_title ? ` · ${employee.job_title}` : ""}
          </option>
        {/each}
      </select>
    </Field>

    <div class="grid gap-4 sm:grid-cols-2">
      <Field label="Clock in" id="punch-in" required hint="Studio time (America/Chicago)">
        <input
          id="punch-in"
          type="datetime-local"
          class="input"
          bind:value={clockInLocal}
          disabled={isSaving}
        />
      </Field>
      <Field label="Clock out" id="punch-out" hint="Leave blank for a shift still running">
        <input
          id="punch-out"
          type="datetime-local"
          class="input"
          bind:value={clockOutLocal}
          disabled={isSaving}
        />
      </Field>
    </div>

    {#if shiftedTimes.length}
      <Banner
        tone="warning"
        message={`That time does not exist in the studio's clock — daylight saving skips it. Saving this shift anyway: ${shiftedTimes.join(", ")}.`}
      />
    {/if}

    <Field label="Shift role" id="punch-role" hint="How this particular shift is paid">
      <select id="punch-role" class="select" bind:value={shiftRole} disabled={isSaving}>
        {#each SHIFT_ROLE_OPTIONS as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </Field>

    {#if shiftRole === "instructor"}
      <div class="grid gap-4 sm:grid-cols-2">
        <Field label="Classes scheduled" id="punch-scheduled">
          <input
            id="punch-scheduled"
            type="number"
            min="0"
            max="20"
            class="input"
            bind:value={scheduledClasses}
            disabled={isSaving}
          />
        </Field>
        <Field
          label="Classes taught"
          id="punch-actual"
          hint="Cannot exceed the scheduled count"
        >
          <input
            id="punch-actual"
            type="number"
            min="0"
            max="20"
            class="input"
            bind:value={actualClasses}
            disabled={isSaving}
          />
        </Field>
      </div>
    {/if}

    <div class="rounded-control border border-ink/8 bg-canvas/60 p-4">
      <div class="flex items-center gap-2">
        <Clock class="h-4 w-4 text-accent" aria-hidden="true" />
        <span class="text-xs font-bold uppercase tracking-[0.12em] text-ink/55">
          This shift is worth
        </span>
      </div>
      <div class="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span class="text-2xl font-bold tabular-nums text-ink">
          {previewBillable || "—"}
        </span>
        <span class="text-sm text-ink/60">
          billable{previewLogged ? ` · ${previewLogged} logged` : ""}
        </span>
      </div>
      <p class="mt-2 text-xs leading-5 text-ink/50">
        {#if shiftRole === "instructor"}
          Instructor shifts pay 1.5 hours per class actually taught.
        {:else}
          Coordinator shifts pay the time between clock in and clock out.
        {/if}
        {#if !clockOutLocal}
          An open shift has no billable hours until it is closed.
        {/if}
      </p>
    </div>

    <label class="flex items-start gap-3 rounded-control border border-ink/10 bg-white px-4 py-3">
      <input
        type="checkbox"
        class="mt-0.5 h-4 w-4 accent-[#0f766e]"
        bind:checked={wasForcedOut}
        disabled={isSaving}
      />
      <span class="min-w-0">
        <span class="block text-sm font-semibold text-ink">Forced out</span>
        <span class="block text-xs leading-5 text-ink/55">
          The employee never tapped out; someone closed the shift for them.
        </span>
      </span>
    </label>

    <Field label="Note" id="punch-note" hint="Why this shift was edited, or anything payroll should know">
      <textarea
        id="punch-note"
        class="textarea"
        rows="3"
        bind:value={note}
        disabled={isSaving}
        placeholder="Forgot to tap out after the 6pm class."
      ></textarea>
    </Field>

    {#if fieldError}
      <Banner tone="warning" message={fieldError} onDismiss={() => (fieldError = "")} />
    {/if}

    {#if !isCreate}
      <div class="flex flex-wrap items-center gap-2 text-xs text-ink/50">
        <Badge tone="neutral" size="xs">{SOURCE_LABELS[punch?.source] || punch?.source}</Badge>
        <span>Recorded {formatChicagoDateTimeLabel(punch?.created_at)}</span>
      </div>
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
          {isCreate ? "Add punch" : "Save changes"}
        </Button>
      </div>
    </div>
  </div>
</SlideOver>

<ConfirmDialog
  open={confirmingDelete}
  title="Delete this punch?"
  message="It disappears from timesheets and exports, and the studio iPad drops it on its next sync. The row is tombstoned rather than erased, so support can still recover it."
  confirmLabel="Delete punch"
  tone="danger"
  busy={isDeleting}
  onConfirm={softDelete}
  onCancel={() => (confirmingDelete = false)}
/>
