<script>
  import { CalendarPlus, Trash2, Upload } from "@lucide/svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import {
    buildRecurringShiftRows,
    findOperationalOverlaps,
    formatShortDate,
    formatTimeRange,
    parseShiftCsv,
    parseDateStr,
  } from "../../../lib/dashboard/volunteersAdmin.js";

  export let supabase;
  export let onChanged = () => {};

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let errorMessage = "";
  let successMessage = "";

  // Recurring creation state
  let recurringStartDate = "";
  let recurringEndDate = "";
  let recurringTime = "18:00";
  let recurringDuration = 60;
  let recurringDays = [];
  let recurringLeadCap = 1;
  let recurringVolCap = 2;
  let isCreatingRecurring = false;
  let confirmingRecurring = false;

  $: recurringRows = buildRecurringShiftRows({
    startDate: recurringStartDate,
    endDate: recurringEndDate,
    daysOfWeek: recurringDays,
    time: recurringTime,
    durationMinutes: recurringDuration,
    leadCapacity: recurringLeadCap,
    volunteerCapacity: recurringVolCap,
  });

  $: recurringConfirmMessage = `Create ${recurringRows.length} shift${recurringRows.length === 1 ? "" : "s"} between ${recurringStartDate} and ${recurringEndDate}?`;

  // CSV upload state
  let csvRows = [];
  let csvErrors = [];
  let csvFileName = "";
  let isUploadingCsv = false;
  let csvInput;

  // Bulk delete state
  let deleteStartDate = "";
  let deleteEndDate = "";
  let deleteTime = "";
  let deleteDays = [];
  let deletePreview = null; // { deletable: [], conflicts: [] }
  let isPreviewingDelete = false;
  let isDeleting = false;
  let confirmingBulkDelete = false;

  $: bulkDeleteMessage = deletePreview
    ? `Delete ${deletePreview.deletable.length} shift${deletePreview.deletable.length === 1 ? "" : "s"}?` +
      (deletePreview.conflicts.length
        ? ` ${deletePreview.conflicts.length} shift${deletePreview.conflicts.length === 1 ? "" : "s"} with registrations will be skipped.`
        : "")
    : "";

  // Extend schedule state
  let isExtending = false;

  function toggleDay(list, day) {
    return list.includes(day) ? list.filter((d) => d !== day) : [...list, day];
  }

  function setMessages(error, success) {
    errorMessage = error || "";
    successMessage = success || "";
  }

  // Insert operational rows, skipping any that overlap existing active
  // operational shifts (or each other). Returns a user-facing summary.
  async function insertSkippingOverlaps(rows, label) {
    const { okRows, conflicts } = await findOperationalOverlaps(supabase, rows);

    if (!okRows.length) {
      setMessages(
        `All ${rows.length} ${label} overlap existing operational shifts, nothing was created.`,
        "",
      );
      return false;
    }

    const { error } = await supabase.from("volunteer_shifts").insert(okRows);

    if (error) {
      setMessages(error.message, "");
      return false;
    }

    const skippedNote = conflicts.length
      ? ` Skipped ${conflicts.length} overlapping slot${conflicts.length === 1 ? "" : "s"}: ${conflicts
          .slice(0, 5)
          .map((c) => `${formatShortDate(c.row.starts_at)} ${formatTimeRange(c.row.starts_at, c.row.ends_at)}`)
          .join(", ")}${conflicts.length > 5 ? ", ..." : ""}.`
      : "";
    setMessages("", `Created ${okRows.length} shifts.${skippedNote}`);
    return true;
  }

  function requestCreateRecurring() {
    if (!recurringRows.length || isCreatingRecurring) return;
    confirmingRecurring = true;
  }

  async function createRecurring() {
    if (!recurringRows.length || isCreatingRecurring) return;

    isCreatingRecurring = true;
    setMessages("", "");

    try {
      const created = await insertSkippingOverlaps(recurringRows, "shifts");
      if (created) {
        recurringStartDate = "";
        recurringEndDate = "";
        recurringDays = [];
        onChanged();
      }
    } catch (err) {
      setMessages(err?.message || "Could not check for overlapping shifts.", "");
    }

    isCreatingRecurring = false;
    confirmingRecurring = false;
  }

  function handleCsvFile(event) {
    const file = event.currentTarget.files?.[0];
    csvRows = [];
    csvErrors = [];
    csvFileName = "";
    if (!file) return;

    csvFileName = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseShiftCsv(e.target.result);
      csvRows = parsed.rows;
      csvErrors = parsed.errors;
    };
    reader.readAsText(file);
  }

  async function uploadCsv() {
    if (!csvRows.length || isUploadingCsv) return;

    isUploadingCsv = true;
    setMessages("", "");

    try {
      const created = await insertSkippingOverlaps(csvRows, "CSV rows");
      if (created) {
        if (csvErrors.length) {
          successMessage += ` ${csvErrors.length} unreadable lines were skipped.`;
        }
        csvRows = [];
        csvErrors = [];
        csvFileName = "";
        if (csvInput) csvInput.value = "";
        onChanged();
      }
    } catch (err) {
      setMessages(err?.message || "Could not check for overlapping shifts.", "");
    }

    isUploadingCsv = false;
  }

  async function previewDelete() {
    if (!deleteStartDate || !deleteEndDate || !deleteTime || !deleteDays.length) {
      setMessages(
        "Pick a date range, days of the week, and a start time to preview the deletion.",
        "",
      );
      return;
    }

    isPreviewingDelete = true;
    setMessages("", "");
    deletePreview = null;

    const rangeStart = parseDateStr(deleteStartDate);
    const rangeEnd = parseDateStr(deleteEndDate);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    const { data: shifts, error } = await supabase
      .from("volunteer_shifts")
      .select("id, kind, title, starts_at, ends_at, cancelled")
      .gte("starts_at", rangeStart.toISOString())
      .lt("starts_at", rangeEnd.toISOString())
      .order("starts_at", { ascending: true });

    if (error) {
      setMessages(error.message, "");
      isPreviewingDelete = false;
      return;
    }

    const [targetH, targetM] = deleteTime.split(":").map(Number);
    const matching = (shifts || []).filter((shift) => {
      const start = new Date(shift.starts_at);
      return (
        deleteDays.includes(start.getDay()) &&
        start.getHours() === targetH &&
        start.getMinutes() === targetM
      );
    });

    let countsById = new Map();
    if (matching.length) {
      const { data: registrations, error: regError } = await supabase
        .from("shift_registrations")
        .select("id, shift_id, name")
        .in("shift_id", matching.map((shift) => shift.id));

      if (regError) {
        setMessages(regError.message, "");
        isPreviewingDelete = false;
        return;
      }

      for (const reg of registrations || []) {
        if (!countsById.has(reg.shift_id)) countsById.set(reg.shift_id, []);
        countsById.get(reg.shift_id).push(reg.name);
      }
    }

    const deletable = [];
    const conflicts = [];
    for (const shift of matching) {
      const names = countsById.get(shift.id) || [];
      if (names.length) {
        conflicts.push({ ...shift, volunteerNames: names });
      } else {
        deletable.push(shift);
      }
    }

    deletePreview = { deletable, conflicts };
    isPreviewingDelete = false;
  }

  function requestBulkDelete() {
    if (!deletePreview || isDeleting) return;

    if (!deletePreview.deletable.length) {
      setMessages("No empty shifts match this time slot.", "");
      return;
    }

    confirmingBulkDelete = true;
  }

  async function confirmDelete() {
    if (!deletePreview || isDeleting) return;

    const { deletable, conflicts } = deletePreview;
    if (!deletable.length) {
      setMessages("No empty shifts match this time slot.", "");
      confirmingBulkDelete = false;
      return;
    }

    isDeleting = true;
    setMessages("", "");

    const { error } = await supabase
      .from("volunteer_shifts")
      .delete()
      .in("id", deletable.map((shift) => shift.id));

    if (error) {
      setMessages(error.message, "");
    } else {
      setMessages(
        "",
        `Deleted ${deletable.length} shifts.${conflicts.length ? ` Skipped ${conflicts.length} with registrations.` : ""}`,
      );
      deletePreview = null;
      deleteTime = "";
      onChanged();
    }

    isDeleting = false;
    confirmingBulkDelete = false;
  }

  async function extendSchedule() {
    if (isExtending) return;

    isExtending = true;
    setMessages("", "");

    const { data, error } = await supabase.rpc("generate_volunteer_shifts", {
      p_days: 70,
    });

    if (error) {
      setMessages(error.message, "");
    } else {
      setMessages(
        "",
        `Schedule extended: ${data ?? 0} new recurring shifts created through ${formatShortDate(new Date(Date.now() + 70 * 86400000))}.`,
      );
      onChanged();
    }

    isExtending = false;
  }
</script>

<Panel title="Bulk shift tools" id="volunteers-bulk-tools-title">
  {#if errorMessage}
    <Banner tone="error" message={errorMessage} class="mb-4" />
  {/if}
  {#if successMessage}
    <Banner tone="success" message={successMessage} class="mb-4" />
  {/if}

  <div class="grid gap-4 lg:grid-cols-2">
    <!-- Recurring creation -->
    <section class="rounded-card border border-ink/8 bg-canvas p-4">
      <h4 class="flex items-center gap-2 font-bold text-ink">
        <CalendarPlus class="h-4 w-4 text-accent" aria-hidden="true" />
        Create recurring shifts
      </h4>
      <p class="mt-1 text-sm text-ink/60">
        Adds custom shifts on the selected weekdays across a date range.
      </p>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <Field label="Start date" id="bulk-recurring-start-date">
          <input id="bulk-recurring-start-date" type="date" class="input" bind:value={recurringStartDate} />
        </Field>
        <Field label="End date" id="bulk-recurring-end-date">
          <input id="bulk-recurring-end-date" type="date" class="input" bind:value={recurringEndDate} />
        </Field>
        <Field label="Start time" id="bulk-recurring-time">
          <input id="bulk-recurring-time" type="time" class="input" bind:value={recurringTime} />
        </Field>
        <Field label="Duration (minutes)" id="bulk-recurring-duration">
          <input id="bulk-recurring-duration" type="number" min="15" step="15" class="input" bind:value={recurringDuration} />
        </Field>
        <Field label="Lead spots" id="bulk-recurring-lead-cap">
          <input id="bulk-recurring-lead-cap" type="number" min="0" class="input" bind:value={recurringLeadCap} />
        </Field>
        <Field label="Volunteer spots" id="bulk-recurring-vol-cap">
          <input id="bulk-recurring-vol-cap" type="number" min="0" class="input" bind:value={recurringVolCap} />
        </Field>
      </div>

      <div class="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Days of week">
        {#each DAY_NAMES as dayName, day}
          <button
            type="button"
            class="min-h-9 rounded-control border px-2.5 text-xs font-bold transition {recurringDays.includes(day) ? 'border-accent bg-accent-soft text-accent-strong' : 'border-ink/14 bg-white text-ink/60 hover:bg-ink/[0.04]'}"
            aria-pressed={recurringDays.includes(day)}
            onclick={() => (recurringDays = toggleDay(recurringDays, day))}
          >
            {dayName}
          </button>
        {/each}
      </div>

      <Button
        variant="primary"
        class="mt-4"
        loading={isCreatingRecurring}
        disabled={!recurringRows.length}
        onclick={requestCreateRecurring}
      >
        {#if isCreatingRecurring}
          Creating
        {:else}
          Create {recurringRows.length || ""} shift{recurringRows.length === 1 ? "" : "s"}
        {/if}
      </Button>
    </section>

    <!-- CSV upload -->
    <section class="rounded-card border border-ink/8 bg-canvas p-4">
      <h4 class="flex items-center gap-2 font-bold text-ink">
        <Upload class="h-4 w-4 text-accent" aria-hidden="true" />
        CSV bulk upload
      </h4>
      <p class="mt-1 text-sm text-ink/60">
        Columns: Date, StartTime, Duration, LeadCapacity, VolunteerCapacity. Example: 2026-06-26, 18:00, 60, 1, 2
      </p>

      <input
        bind:this={csvInput}
        type="file"
        accept=".csv,text/csv"
        class="mt-3 block w-full text-sm text-ink/60 file:mr-3 file:rounded-control file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-black"
        aria-label="CSV file"
        onchange={handleCsvFile}
      />

      {#if csvFileName}
        <p class="mt-2 text-sm text-ink/70">
          {csvFileName}: {csvRows.length} shift{csvRows.length === 1 ? "" : "s"} ready
          {#if csvErrors.length}
            · {csvErrors.length} line{csvErrors.length === 1 ? "" : "s"} skipped
          {/if}
        </p>
        {#if csvErrors.length}
          <ul class="mt-1 list-inside list-disc text-xs text-red-700">
            {#each csvErrors.slice(0, 5) as parseError}
              <li>{parseError}</li>
            {/each}
          </ul>
        {/if}
      {/if}

      <Button
        variant="primary"
        class="mt-4"
        loading={isUploadingCsv}
        disabled={!csvRows.length}
        onclick={uploadCsv}
      >
        {#if isUploadingCsv}
          Uploading
        {:else}
          Upload {csvRows.length || ""} shift{csvRows.length === 1 ? "" : "s"}
        {/if}
      </Button>
    </section>

    <!-- Bulk delete by time slot -->
    <section class="rounded-card border border-ink/8 bg-canvas p-4">
      <h4 class="flex items-center gap-2 font-bold text-ink">
        <Trash2 class="h-4 w-4 text-red-600" aria-hidden="true" />
        Bulk delete by time slot
      </h4>
      <p class="mt-1 text-sm text-ink/60">
        Removes shifts starting at a given time on selected weekdays. Shifts with registrations are skipped.
      </p>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <Field label="From" id="bulk-delete-start-date">
          <input id="bulk-delete-start-date" type="date" class="input" bind:value={deleteStartDate} />
        </Field>
        <Field label="To" id="bulk-delete-end-date">
          <input id="bulk-delete-end-date" type="date" class="input" bind:value={deleteEndDate} />
        </Field>
        <Field label="Start time" id="bulk-delete-time" class="col-span-2">
          <input id="bulk-delete-time" type="time" class="input" bind:value={deleteTime} />
        </Field>
      </div>

      <div class="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Days of week to delete">
        {#each DAY_NAMES as dayName, day}
          <button
            type="button"
            class="min-h-9 rounded-control border px-2.5 text-xs font-bold transition {deleteDays.includes(day) ? 'border-red-400 bg-red-50 text-red-700' : 'border-ink/14 bg-white text-ink/60 hover:bg-ink/[0.04]'}"
            aria-pressed={deleteDays.includes(day)}
            onclick={() => (deleteDays = toggleDay(deleteDays, day))}
          >
            {dayName}
          </button>
        {/each}
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          loading={isPreviewingDelete}
          onclick={previewDelete}
        >
          {isPreviewingDelete ? "Checking" : "Preview deletion"}
        </Button>
        {#if deletePreview}
          <Button
            variant="danger"
            loading={isDeleting}
            disabled={!deletePreview.deletable.length}
            onclick={requestBulkDelete}
          >
            {#if isDeleting}
              Deleting
            {:else}
              Delete {deletePreview.deletable.length} shift{deletePreview.deletable.length === 1 ? "" : "s"}
            {/if}
          </Button>
        {/if}
      </div>

      {#if deletePreview}
        <div class="mt-3 space-y-2 text-sm">
          <p class="font-bold text-ink/80">
            {deletePreview.deletable.length} empty shift{deletePreview.deletable.length === 1 ? "" : "s"} will be deleted.
          </p>
          {#if deletePreview.conflicts.length}
            <Banner tone="warning">
              <p class="font-bold">
                {deletePreview.conflicts.length} shift{deletePreview.conflicts.length === 1 ? "" : "s"} with registrations will be skipped:
              </p>
              <ul class="mt-1 space-y-1">
                {#each deletePreview.conflicts as conflict (conflict.id)}
                  <li>
                    {formatShortDate(conflict.starts_at)} · {formatTimeRange(conflict.starts_at, conflict.ends_at)}: {conflict.volunteerNames.join(", ")}
                  </li>
                {/each}
              </ul>
            </Banner>
          {/if}
        </div>
      {/if}
    </section>

    <!-- Extend schedule -->
    <section class="rounded-card border border-ink/8 bg-canvas p-4">
      <h4 class="font-bold text-ink">Extend the recurring schedule</h4>
      <p class="mt-1 text-sm text-ink/60">
        Generates recurring shift instances from the weekly templates through the next 70 days. This also runs automatically every month.
      </p>
      <Button
        variant="dark"
        class="mt-4"
        loading={isExtending}
        onclick={extendSchedule}
      >
        {isExtending ? "Extending" : "Extend schedule"}
      </Button>
    </section>
  </div>
</Panel>

<ConfirmDialog
  open={confirmingRecurring}
  title="Create recurring shifts?"
  message={recurringConfirmMessage}
  confirmLabel="Create shifts"
  tone="primary"
  busy={isCreatingRecurring}
  onConfirm={createRecurring}
  onCancel={() => (confirmingRecurring = false)}
/>

<ConfirmDialog
  open={confirmingBulkDelete}
  title="Delete shifts?"
  message={bulkDeleteMessage}
  confirmLabel="Delete shifts"
  tone="danger"
  busy={isDeleting}
  onConfirm={confirmDelete}
  onCancel={() => (confirmingBulkDelete = false)}
/>
