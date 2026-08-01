<script>
  // Historical punch import, modelled on the fundraising Zeffy importer:
  // choose a file, see a preview with counts, confirm, watch a progress bar,
  // leave an audit row behind.
  //
  // Both kiosk exports are accepted and auto-detected from the header. The
  // whole thing is idempotent: re-uploading the same file (or a file the
  // kiosk has already synced) adds nothing, so "when in doubt, upload it
  // again" is always the right advice.
  import { onMount } from "svelte";
  import { FileSpreadsheet, Upload } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import {
    DUPLICATE_WINDOW_MS,
    EMPLOYEE_COLUMNS,
    IMPORT_COLUMNS,
    IMPORT_FORMAT_LABELS,
    buildEmployeeIndexes,
    formatChicagoDateTimeLabel,
    isPendingRfid,
    matchEmployee,
    newId,
    normalizeNameKey,
    parseKioskCsv,
    pendingRfidTag,
    rowIdentifiesEmployee,
  } from "../../../lib/dashboard/timeclock";

  export let supabase;
  export let profile = null;
  export let employees = [];
  export let refreshKey = 0;
  export let onImported = () => {};

  const CHUNK_SIZE = 200;
  // PostgREST caps a single response. Every lookup the plan rests on has to
  // be complete: a short read means a shift already in the database is
  // imported a second time, or a deleted person is quietly re-created. So
  // they are paged, and the ceiling below fails the import out loud instead
  // of planning against half the data.
  const PAGE_SIZE = 1000;
  const MAX_LOOKUP_ROWS = 100000;

  let fileInput;
  let fileName = "";
  let parsing = false;
  let plan = null; // { format, employeesToCreate, punchesToInsert, duplicates, ... }
  let importing = false;
  let importProgress = 0;
  let importResult = null;
  let errorMessage = "";

  let history = [];
  let historyLoading = true;
  let lastRefreshKey = refreshKey;

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadAll();
  }

  onMount(loadAll);

  async function loadAll() {
    if (!supabase) return;
    historyLoading = true;
    const { data, error } = await supabase
      .from("timeclock_imports")
      .select(IMPORT_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error) history = data || [];
    historyLoading = false;
  }

  async function handleFileChange(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || parsing || importing) return;

    fileName = file.name;
    parsing = true;
    plan = null;
    importResult = null;
    errorMessage = "";

    try {
      const text = await file.text();
      const parsed = parseKioskCsv(text);
      if (parsed.error) throw new Error(parsed.error);
      if (!parsed.rows.length) {
        throw new Error(
          "No rows with a readable clock-in time were found in this file.",
        );
      }
      plan = await buildPlan(parsed);
    } catch (error) {
      errorMessage = error?.message || "This file could not be read.";
      plan = null;
    }

    parsing = false;
  }

  // Reads every page of a query. `onCap` is expected to throw: the planner
  // has no honest way to continue on a partial answer.
  async function fetchAllPages(buildQuery, onCap) {
    const rows = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const page = data || [];
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
      if (rows.length >= MAX_LOOKUP_ROWS) onCap();
    }
  }

  // Works out what would happen, without writing anything. Matching order is
  // Employee ID -> email -> full name; anything left over becomes a new
  // employee. Punch identity is the file's Punch ID when it has one, and
  // otherwise "same employee, clock-in within 90 seconds", which is what makes
  // re-uploads and already-synced kiosk data safe.
  async function buildPlan(parsed) {
    const indexes = buildEmployeeIndexes(employees);

    // A row with no Employee ID, no email and no name belongs to nobody.
    // Creating a person for each one fills the roster with blank phantoms
    // that then own real payroll hours, so they are rejected up front.
    const usableRows = [];
    let unidentifiedRows = 0;
    for (const row of parsed.rows) {
      if (rowIdentifiesEmployee(row)) usableRows.push(row);
      else unidentifiedRows += 1;
    }

    // Tombstoned staff are invisible to the roster query this tab is handed,
    // so without this a row for a deleted person sails past every match and
    // is re-created as a stranger with the same name (or collides with the
    // tombstone's own id and loses its shifts silently). Reviving someone is
    // an explicit decision, never an import side effect.
    const deletedEmployees = await fetchAllPages(
      () =>
        supabase
          .from("timeclock_employees")
          .select(EMPLOYEE_COLUMNS)
          .not("deleted_at", "is", null)
          .order("id", { ascending: true }),
      () => {
        throw new Error(
          "There are too many deleted employees to check this file against. Ask support to clear old tombstones before importing.",
        );
      },
    );
    const deletedIndexes = buildEmployeeIndexes(deletedEmployees);

    // New employees invented by this file, keyed the same three ways so a
    // second row for the same person reuses the first one.
    const createdById = new Map();
    const createdByEmail = new Map();
    const createdByName = new Map();
    const employeesToCreate = [];

    const resolved = [];
    let deletedEmployeeRows = 0;

    for (const row of usableRows) {
      let employee = matchEmployee(row, indexes);

      if (!employee && matchEmployee(row, deletedIndexes)) {
        deletedEmployeeRows += 1;
        continue;
      }

      if (!employee) {
        const nameKey = normalizeNameKey(row.fullName);
        employee =
          (row.employeeId && createdById.get(row.employeeId)) ||
          (row.email && createdByEmail.get(row.email)) ||
          (nameKey && createdByName.get(nameKey)) ||
          null;
      }

      if (!employee) {
        // Reuse the file's own Employee ID as the row id when it has one, so
        // a later full-backup import lines up with this one.
        const draft = {
          id: row.employeeId || newId(),
          first_name: row.firstName,
          last_name: row.lastName,
          email: row.email,
          pin: "",
          job_title: row.jobTitle,
          profile_role: row.profileRole,
          // A real card from the file is worth keeping; a pending sentinel
          // from the file is not, since it belongs to the other device's
          // onboarding queue.
          rfid_tag: row.rfidTag && !isPendingRfid(row.rfidTag) ? row.rfidTag : pendingRfidTag(),
          is_active: true,
        };
        employeesToCreate.push(draft);
        employee = draft;
        if (row.employeeId) createdById.set(row.employeeId, draft);
        if (row.email) createdByEmail.set(row.email, draft);
        const nameKey = normalizeNameKey(row.fullName);
        if (nameKey) createdByName.set(nameKey, draft);
      }

      resolved.push({ row, employeeId: employee.id });
    }

    // Look up the punches that already exist for the employees this file
    // touches, over the window the file covers, so dedupe is one query rather
    // than one per row.
    const existingIds = Array.from(
      new Set(resolved.map((item) => item.employeeId)),
    ).filter((id) => indexes.byId.has(String(id).toLowerCase()));

    // A loop, not Math.min(...arr): a large export would blow the call stack.
    let minMs = Infinity;
    let maxMs = -Infinity;
    for (const item of resolved) {
      const ms = new Date(item.row.clockInIso).getTime();
      if (ms < minMs) minMs = ms;
      if (ms > maxMs) maxMs = ms;
    }

    let existing = [];
    if (existingIds.length && resolved.length) {
      const windowStart = new Date(minMs - DUPLICATE_WINDOW_MS).toISOString();
      const windowEnd = new Date(maxMs + DUPLICATE_WINDOW_MS).toISOString();

      // Every page of the window, not the first 5,000 rows in whatever order
      // the server felt like: a shift missing from this list is a shift that
      // gets imported on top of itself.
      existing = await fetchAllPages(
        () =>
          supabase
            .from("timeclock_punches")
            .select("id,employee_id,clock_in_at")
            .is("deleted_at", null)
            .in("employee_id", existingIds)
            .gte("clock_in_at", windowStart)
            .lte("clock_in_at", windowEnd)
            .order("clock_in_at", { ascending: true })
            // Ties on clock_in_at would otherwise let pages overlap.
            .order("id", { ascending: true }),
        () => {
          throw new Error(
            `This file covers more existing shifts (over ${MAX_LOOKUP_ROWS.toLocaleString()}) than can be checked for duplicates in one pass. Split it into shorter date ranges and import them one at a time.`,
          );
        },
      );
    }

    const existingPunchIds = new Set(existing.map((punch) => String(punch.id).toLowerCase()));
    const existingByEmployee = new Map();
    for (const punch of existing) {
      const list = existingByEmployee.get(punch.employee_id) || [];
      list.push(new Date(punch.clock_in_at).getTime());
      existingByEmployee.set(punch.employee_id, list);
    }

    const punchesToInsert = [];
    const seenIds = new Set();
    const seenTimes = new Map(); // within-file dedupe
    let duplicates = 0;

    for (const item of resolved) {
      const { row, employeeId } = item;
      const startMs = new Date(row.clockInIso).getTime();

      // Two independent guards, both applied. The id check makes re-uploading
      // the exact same backup a no-op. The 90-second window catches the same
      // shift arriving under a *different* id — which is what happens when a
      // timesheet CSV (no ids at all) was imported first and the full backup
      // follows, or when the kiosk already synced the shift itself.
      if (row.punchId && (existingPunchIds.has(row.punchId) || seenIds.has(row.punchId))) {
        duplicates += 1;
        continue;
      }

      const known = [
        ...(existingByEmployee.get(employeeId) || []),
        ...(seenTimes.get(employeeId) || []),
      ];
      if (known.some((ms) => Math.abs(ms - startMs) <= DUPLICATE_WINDOW_MS)) {
        duplicates += 1;
        continue;
      }

      if (row.punchId) seenIds.add(row.punchId);
      const seenForEmployee = seenTimes.get(employeeId) || [];
      seenForEmployee.push(startMs);
      seenTimes.set(employeeId, seenForEmployee);

      punchesToInsert.push({
        id: row.punchId || newId(),
        employee_id: employeeId,
        clock_in_at: row.clockInIso,
        clock_out_at: row.clockOutIso,
        // A blank clock-out with the forced flag set still means "forced";
        // the kiosk writes that when a shift was abandoned.
        was_forced_out: row.forcedOut,
        shift_role: row.shiftRole,
        scheduled_classes: row.scheduledClasses,
        actual_classes_taught: row.actualClasses,
        source: "import",
        note: "",
      });
    }

    return {
      format: parsed.format,
      totalRows: parsed.totalRows,
      unreadableRows: parsed.skippedRows,
      unidentifiedRows,
      deletedEmployeeRows,
      matchedEmployees: new Set(
        resolved
          .filter((item) => indexes.byId.has(String(item.employeeId).toLowerCase()))
          .map((item) => item.employeeId),
      ).size,
      employeesToCreate,
      punchesToInsert,
      duplicates,
      openShifts: punchesToInsert.filter((punch) => !punch.clock_out_at).length,
    };
  }

  async function runImport() {
    if (!plan || importing) return;
    if (!plan.punchesToInsert.length && !plan.employeesToCreate.length) return;

    importing = true;
    importProgress = 0;
    errorMessage = "";

    let createdEmployees = 0;
    let importedPunches = 0;
    let failed = false;

    // Employee chunks count towards the bar too — an employees-only file
    // would otherwise sit at 0% for its whole run and look hung.
    const totalChunks =
      Math.ceil(plan.employeesToCreate.length / CHUNK_SIZE) +
      Math.ceil(plan.punchesToInsert.length / CHUNK_SIZE) || 1;
    let doneChunks = 0;
    const advance = () => {
      doneChunks += 1;
      importProgress = Math.round((doneChunks / totalChunks) * 100);
    };

    // Employees first, so the punch foreign keys resolve.
    for (let i = 0; i < plan.employeesToCreate.length; i += CHUNK_SIZE) {
      const chunk = plan.employeesToCreate.slice(i, i + CHUNK_SIZE);
      // ignoreDuplicates is the safety net for an id that already exists as
      // a tombstone (invisible to the roster query above); .select() then
      // counts what was really inserted.
      const { data, error } = await supabase
        .from("timeclock_employees")
        .upsert(chunk, { onConflict: "id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        errorMessage = `The import stopped while adding people: ${error.message}. Nothing is lost — upload the same file again to continue, duplicates are skipped.`;
        failed = true;
        break;
      }
      createdEmployees += data?.length || 0;
      advance();
    }

    if (!failed) {
      for (let i = 0; i < plan.punchesToInsert.length; i += CHUNK_SIZE) {
        const chunk = plan.punchesToInsert.slice(i, i + CHUNK_SIZE);
        // The last line of defence against a double import: a Punch ID the
        // preview did not see (outside the scanned window, or synced by the
        // kiosk while the preview was on screen) collides here and is dropped.
        const { data, error } = await supabase
          .from("timeclock_punches")
          .upsert(chunk, { onConflict: "id", ignoreDuplicates: true })
          .select("id");

        if (error) {
          errorMessage = `The import stopped partway: ${error.message}. The ${importedPunches.toLocaleString()} shifts already added were kept — upload the same file again to finish, duplicates are skipped.`;
          failed = true;
          break;
        }

        importedPunches += data?.length || 0;
        advance();
      }
    }

    // Rows the file could never turn into a shift, whatever else happened.
    const rejected =
      plan.unreadableRows + plan.unidentifiedRows + plan.deletedEmployeeRows;
    // Everything that did not become a punch. On a partial run this includes
    // the rows never attempted, which is exactly what "skipped" has to mean
    // for the audit trail to add up against total_rows.
    const skipped = Math.max(0, plan.totalRows - importedPunches);
    const alreadyPresent = Math.max(0, skipped - rejected);

    // Audit row even when the run failed partway: a half-finished import is
    // precisely the one somebody will need to reconstruct later.
    await supabase.from("timeclock_imports").insert({
      file_name: fileName || "Time Clock export",
      format: plan.format,
      total_rows: plan.totalRows,
      imported_punches: importedPunches,
      skipped_rows: skipped,
      created_employees: createdEmployees,
      created_by: profile?.id || null,
    });

    if (!failed) {
      importResult = { importedPunches, createdEmployees, alreadyPresent, rejected };
      plan = null;
      fileName = "";
    }

    importing = false;
    await loadAll();
    onImported();
  }

  function discardPlan() {
    plan = null;
    fileName = "";
    errorMessage = "";
  }
</script>

<div class="space-y-4">
  <Panel title="Import historical punches" id="time-clock-import-title">
    <p class="text-sm leading-6 text-ink/60">
      Upload either CSV the iPad exports — the full backup (with Punch ID and
      Employee ID columns) or the human-readable timesheet. Shifts already in
      the database are skipped, people who are not on the roster yet are
      created, and nothing is ever overwritten. Re-uploading the same file is
      always safe.
    </p>
    <p class="mt-2 text-sm leading-6 text-ink/60">
      <strong class="font-semibold text-ink/80">Order matters:</strong> let the
      iPad finish its first cloud sync before importing. The iPad uploads its
      own history under its original record IDs — importing the same shifts
      from a CSV first creates them under new IDs, and the two sets double-count
      as duplicates. After the iPad has synced, imports are only needed for
      history the iPad no longer has.
    </p>

    {#if errorMessage}
      <Banner tone="error" message={errorMessage} class="mt-4" />
    {/if}

    {#if importResult}
      <Banner
        tone="success"
        class="mt-4"
        message={`Import complete: ${importResult.importedPunches.toLocaleString()} shift${importResult.importedPunches === 1 ? "" : "s"} added, ${importResult.createdEmployees.toLocaleString()} new ${importResult.createdEmployees === 1 ? "person" : "people"} on the roster, ${importResult.alreadyPresent.toLocaleString()} row${importResult.alreadyPresent === 1 ? "" : "s"} skipped as already present, ${importResult.rejected.toLocaleString()} row${importResult.rejected === 1 ? "" : "s"} skipped as unreadable or unmatched.`}
      />
    {/if}

    <div class="mt-4">
      <input
        bind:this={fileInput}
        type="file"
        accept=".csv,text/csv"
        class="sr-only"
        aria-label="Choose a Time Clock CSV export"
        onchange={handleFileChange}
      />
      <Button
        variant="primary"
        icon={FileSpreadsheet}
        loading={parsing}
        disabled={importing}
        onclick={() => fileInput?.click()}
      >
        {parsing ? "Reading file" : "Choose CSV file"}
      </Button>
    </div>

    {#if plan}
      <div class="mt-4 rounded-control border border-ink/8 bg-canvas/60 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{fileName}</Badge>
          <Badge tone="teal" size="xs">{IMPORT_FORMAT_LABELS[plan.format] || plan.format}</Badge>
          <Badge tone="neutral" size="xs">{plan.totalRows.toLocaleString()} rows</Badge>
        </div>

        <dl class="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Matched people</dt>
            <dd class="mt-1 font-semibold text-ink">{plan.matchedEmployees.toLocaleString()}</dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">People to create</dt>
            <dd class="mt-1 font-semibold {plan.employeesToCreate.length ? 'text-amber-700' : 'text-ink'}">
              {plan.employeesToCreate.length.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Shifts to import</dt>
            <dd class="mt-1 font-semibold text-ink">{plan.punchesToInsert.length.toLocaleString()}</dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Already present</dt>
            <dd class="mt-1 font-semibold text-ink">{plan.duplicates.toLocaleString()}</dd>
          </div>
        </dl>

        {#if plan.employeesToCreate.length}
          <div class="mt-3 rounded-control border border-amber-200 bg-amber-50/70 px-3.5 py-3">
            <p class="text-xs font-bold uppercase tracking-[0.12em] text-amber-800">
              New roster entries
            </p>
            <p class="mt-1.5 text-sm leading-6 text-amber-900">
              {plan.employeesToCreate
                .slice(0, 8)
                .map((draft) => [draft.first_name, draft.last_name].filter(Boolean).join(" ") || draft.email || "Unnamed")
                .join(", ")}{plan.employeesToCreate.length > 8
                ? `, and ${plan.employeesToCreate.length - 8} more`
                : ""}.
            </p>
            <p class="mt-1.5 text-xs leading-5 text-amber-800">
              Anyone without a card in the file joins the iPad's onboarding
              queue so a card can be scanned for them at the studio.
            </p>
          </div>
        {/if}

        {#if plan.unreadableRows}
          <p class="mt-3 text-xs text-ink/55">
            {plan.unreadableRows.toLocaleString()} row{plan.unreadableRows === 1 ? "" : "s"} had no
            readable clock-in time and will be ignored.
          </p>
        {/if}
        {#if plan.unidentifiedRows}
          <p class="mt-1 text-xs text-ink/55">
            {plan.unidentifiedRows.toLocaleString()} row{plan.unidentifiedRows === 1 ? "" : "s"} had no
            identifiable employee — no Employee ID, no email, no name — and will be skipped.
          </p>
        {/if}
        {#if plan.deletedEmployeeRows}
          <div class="mt-3 rounded-control border border-amber-200 bg-amber-50/70 px-3.5 py-3">
            <p class="text-sm leading-6 text-amber-900">
              {plan.deletedEmployeeRows.toLocaleString()} row{plan.deletedEmployeeRows === 1 ? "" : "s"}
              belong to a deleted employee — put that person back on the Roster
              first, or these shifts are skipped. An import never brings a
              deleted employee back on its own.
            </p>
          </div>
        {/if}
        {#if plan.openShifts}
          <p class="mt-1 text-xs text-ink/55">
            {plan.openShifts.toLocaleString()} row{plan.openShifts === 1 ? "" : "s"} have no clock-out
            and will import as shifts still on the clock.
          </p>
        {/if}

        {#if importing}
          <div class="mt-4">
            <div class="h-2 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                class="h-full rounded-full bg-accent transition-[width] duration-200"
                style={`width: ${importProgress}%`}
              ></div>
            </div>
            <p class="mt-1.5 text-xs font-semibold text-ink/55" role="status">
              Importing {importProgress}%
            </p>
          </div>
        {/if}

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="dark"
            icon={Upload}
            loading={importing}
            disabled={!plan.punchesToInsert.length && !plan.employeesToCreate.length}
            onclick={runImport}
          >
            {plan.punchesToInsert.length
              ? `Import ${plan.punchesToInsert.length.toLocaleString()} shift${plan.punchesToInsert.length === 1 ? "" : "s"}`
              : "Nothing new to import"}
          </Button>
          <Button variant="ghost" disabled={importing} onclick={discardPlan}>Cancel</Button>
        </div>

        <p class="mt-3 text-xs leading-5 text-ink/50">
          Hours columns in the file are ignored — billable hours are always
          recalculated from the classes taught and the clock times.
        </p>
      </div>
    {/if}
  </Panel>

  <Panel title="Import history" id="time-clock-import-history-title">
    {#if historyLoading}
      <SkeletonCard lines={3} />
    {:else if history.length}
      <div class="space-y-2">
        {#each history as run (run.id)}
          <div class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3">
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-bold leading-snug text-ink">
                {run.file_name || "Time Clock export"}
              </span>
              <span class="mt-0.5 block text-xs font-semibold text-ink/50">
                {formatChicagoDateTimeLabel(run.created_at)}
                {#if run.format}
                  · {IMPORT_FORMAT_LABELS[run.format] || run.format}
                {/if}
              </span>
            </span>
            <Badge tone={run.imported_punches > 0 ? "green" : "neutral"} size="xs">
              +{(run.imported_punches || 0).toLocaleString()} shifts
            </Badge>
            {#if run.created_employees > 0}
              <Badge tone="gold" size="xs">
                +{run.created_employees.toLocaleString()} people
              </Badge>
            {/if}
            <Badge tone="neutral" size="xs">
              {(run.skipped_rows || 0).toLocaleString()} skipped
            </Badge>
          </div>
        {/each}
      </div>
    {:else}
      <EmptyState
        title="No imports yet"
        message="Upload the iPad's first CSV export above to backfill history."
      />
    {/if}
  </Panel>
</div>
