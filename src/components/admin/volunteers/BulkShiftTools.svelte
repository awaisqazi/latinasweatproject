<script>
  import {
    CalendarPlus,
    CircleAlert,
    CheckCircle2,
    Trash2,
    Upload,
  } from "@lucide/svelte";
  import Panel from "../marketing/Panel.svelte";
  import {
    buildRecurringShiftRows,
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

  $: recurringRows = buildRecurringShiftRows({
    startDate: recurringStartDate,
    endDate: recurringEndDate,
    daysOfWeek: recurringDays,
    time: recurringTime,
    durationMinutes: recurringDuration,
    leadCapacity: recurringLeadCap,
    volunteerCapacity: recurringVolCap,
  });

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

  // Extend schedule state
  let isExtending = false;

  function toggleDay(list, day) {
    return list.includes(day) ? list.filter((d) => d !== day) : [...list, day];
  }

  function setMessages(error, success) {
    errorMessage = error || "";
    successMessage = success || "";
  }

  async function createRecurring() {
    if (!recurringRows.length || isCreatingRecurring) return;

    if (
      !window.confirm(
        `Create ${recurringRows.length} shift${recurringRows.length === 1 ? "" : "s"} between ${recurringStartDate} and ${recurringEndDate}?`,
      )
    ) {
      return;
    }

    isCreatingRecurring = true;
    setMessages("", "");

    const { error } = await supabase.from("volunteer_shifts").insert(recurringRows);

    if (error) {
      setMessages(error.message, "");
    } else {
      setMessages("", `Created ${recurringRows.length} shifts.`);
      recurringStartDate = "";
      recurringEndDate = "";
      recurringDays = [];
      onChanged();
    }

    isCreatingRecurring = false;
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

    const { error } = await supabase.from("volunteer_shifts").insert(csvRows);

    if (error) {
      setMessages(error.message, "");
    } else {
      setMessages(
        "",
        `Uploaded ${csvRows.length} shifts.${csvErrors.length ? ` ${csvErrors.length} lines were skipped.` : ""}`,
      );
      csvRows = [];
      csvErrors = [];
      csvFileName = "";
      if (csvInput) csvInput.value = "";
      onChanged();
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

  async function confirmDelete() {
    if (!deletePreview || isDeleting) return;

    const { deletable, conflicts } = deletePreview;
    if (!deletable.length) {
      setMessages("No empty shifts match this time slot.", "");
      return;
    }

    const confirmMsg =
      `Delete ${deletable.length} shift${deletable.length === 1 ? "" : "s"}?` +
      (conflicts.length
        ? ` ${conflicts.length} shift${conflicts.length === 1 ? "" : "s"} with registrations will be skipped.`
        : "");
    if (!window.confirm(confirmMsg)) return;

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
    <div class="mb-4 flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{errorMessage}</span>
    </div>
  {/if}
  {#if successMessage}
    <div class="mb-4 flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
      <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{successMessage}</span>
    </div>
  {/if}

  <div class="grid gap-4 lg:grid-cols-2">
    <!-- Recurring creation -->
    <section class="rounded-md border border-black/10 bg-gray-50 p-4">
      <h4 class="flex items-center gap-2 font-bold">
        <CalendarPlus class="h-4 w-4 text-[#0f766e]" aria-hidden="true" />
        Create recurring shifts
      </h4>
      <p class="mt-1 text-sm text-gray-600">
        Adds custom shifts on the selected weekdays across a date range.
      </p>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <label class="block text-xs font-bold text-gray-700">
          Start date
          <input type="date" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={recurringStartDate} />
        </label>
        <label class="block text-xs font-bold text-gray-700">
          End date
          <input type="date" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={recurringEndDate} />
        </label>
        <label class="block text-xs font-bold text-gray-700">
          Start time
          <input type="time" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={recurringTime} />
        </label>
        <label class="block text-xs font-bold text-gray-700">
          Duration (minutes)
          <input type="number" min="15" step="15" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={recurringDuration} />
        </label>
        <label class="block text-xs font-bold text-gray-700">
          Lead spots
          <input type="number" min="0" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={recurringLeadCap} />
        </label>
        <label class="block text-xs font-bold text-gray-700">
          Volunteer spots
          <input type="number" min="0" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={recurringVolCap} />
        </label>
      </div>

      <div class="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Days of week">
        {#each DAY_NAMES as dayName, day}
          <button
            type="button"
            class="min-h-9 rounded-md border px-2.5 text-xs font-bold transition {recurringDays.includes(day) ? 'border-[#0f766e] bg-teal-50 text-teal-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'}"
            aria-pressed={recurringDays.includes(day)}
            onclick={() => (recurringDays = toggleDay(recurringDays, day))}
          >
            {dayName}
          </button>
        {/each}
      </div>

      <button
        type="button"
        class="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] disabled:cursor-not-allowed disabled:opacity-60"
        onclick={createRecurring}
        disabled={isCreatingRecurring || !recurringRows.length}
      >
        {#if isCreatingRecurring}
          <span class="h-4 w-4 rounded-full border-2 border-[#1E1E1E] border-t-transparent animate-spin" aria-hidden="true"></span>
          Creating
        {:else}
          Create {recurringRows.length || ""} shift{recurringRows.length === 1 ? "" : "s"}
        {/if}
      </button>
    </section>

    <!-- CSV upload -->
    <section class="rounded-md border border-black/10 bg-gray-50 p-4">
      <h4 class="flex items-center gap-2 font-bold">
        <Upload class="h-4 w-4 text-[#0f766e]" aria-hidden="true" />
        CSV bulk upload
      </h4>
      <p class="mt-1 text-sm text-gray-600">
        Columns: Date, StartTime, Duration, LeadCapacity, VolunteerCapacity. Example: 2026-06-26, 18:00, 60, 1, 2
      </p>

      <input
        bind:this={csvInput}
        type="file"
        accept=".csv,text/csv"
        class="mt-3 block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#1E1E1E] file:px-3 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-black"
        aria-label="CSV file"
        onchange={handleCsvFile}
      />

      {#if csvFileName}
        <p class="mt-2 text-sm text-gray-700">
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

      <button
        type="button"
        class="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] disabled:cursor-not-allowed disabled:opacity-60"
        onclick={uploadCsv}
        disabled={isUploadingCsv || !csvRows.length}
      >
        {#if isUploadingCsv}
          <span class="h-4 w-4 rounded-full border-2 border-[#1E1E1E] border-t-transparent animate-spin" aria-hidden="true"></span>
          Uploading
        {:else}
          Upload {csvRows.length || ""} shift{csvRows.length === 1 ? "" : "s"}
        {/if}
      </button>
    </section>

    <!-- Bulk delete by time slot -->
    <section class="rounded-md border border-black/10 bg-gray-50 p-4">
      <h4 class="flex items-center gap-2 font-bold">
        <Trash2 class="h-4 w-4 text-red-600" aria-hidden="true" />
        Bulk delete by time slot
      </h4>
      <p class="mt-1 text-sm text-gray-600">
        Removes shifts starting at a given time on selected weekdays. Shifts with registrations are skipped.
      </p>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <label class="block text-xs font-bold text-gray-700">
          From
          <input type="date" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={deleteStartDate} />
        </label>
        <label class="block text-xs font-bold text-gray-700">
          To
          <input type="date" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={deleteEndDate} />
        </label>
        <label class="col-span-2 block text-xs font-bold text-gray-700">
          Start time
          <input type="time" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={deleteTime} />
        </label>
      </div>

      <div class="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Days of week to delete">
        {#each DAY_NAMES as dayName, day}
          <button
            type="button"
            class="min-h-9 rounded-md border px-2.5 text-xs font-bold transition {deleteDays.includes(day) ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'}"
            aria-pressed={deleteDays.includes(day)}
            onclick={() => (deleteDays = toggleDay(deleteDays, day))}
          >
            {dayName}
          </button>
        {/each}
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex min-h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-bold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          onclick={previewDelete}
          disabled={isPreviewingDelete}
        >
          {#if isPreviewingDelete}
            <span class="h-4 w-4 rounded-full border-2 border-gray-600 border-t-transparent animate-spin" aria-hidden="true"></span>
            Checking
          {:else}
            Preview deletion
          {/if}
        </button>
        {#if deletePreview}
          <button
            type="button"
            class="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-300 bg-white px-4 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            onclick={confirmDelete}
            disabled={isDeleting || !deletePreview.deletable.length}
          >
            {#if isDeleting}
              <span class="h-4 w-4 rounded-full border-2 border-red-700 border-t-transparent animate-spin" aria-hidden="true"></span>
              Deleting
            {:else}
              Delete {deletePreview.deletable.length} shift{deletePreview.deletable.length === 1 ? "" : "s"}
            {/if}
          </button>
        {/if}
      </div>

      {#if deletePreview}
        <div class="mt-3 space-y-2 text-sm">
          <p class="font-bold text-gray-800">
            {deletePreview.deletable.length} empty shift{deletePreview.deletable.length === 1 ? "" : "s"} will be deleted.
          </p>
          {#if deletePreview.conflicts.length}
            <div class="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p class="font-bold text-amber-800">
                {deletePreview.conflicts.length} shift{deletePreview.conflicts.length === 1 ? "" : "s"} with registrations will be skipped:
              </p>
              <ul class="mt-1 space-y-1 text-amber-800">
                {#each deletePreview.conflicts as conflict (conflict.id)}
                  <li>
                    {formatShortDate(conflict.starts_at)} · {formatTimeRange(conflict.starts_at, conflict.ends_at)}: {conflict.volunteerNames.join(", ")}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      {/if}
    </section>

    <!-- Extend schedule -->
    <section class="rounded-md border border-black/10 bg-gray-50 p-4">
      <h4 class="font-bold">Extend the recurring schedule</h4>
      <p class="mt-1 text-sm text-gray-600">
        Generates recurring shift instances from the weekly templates through the next 70 days. This also runs automatically every month.
      </p>
      <button
        type="button"
        class="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md bg-[#1E1E1E] px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        onclick={extendSchedule}
        disabled={isExtending}
      >
        {#if isExtending}
          <span class="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true"></span>
          Extending
        {:else}
          Extend schedule
        {/if}
      </button>
    </section>
  </div>
</Panel>
