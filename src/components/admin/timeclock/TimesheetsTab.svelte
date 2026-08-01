<script>
  // Payroll view: what each person worked over a date range, and every
  // individual punch behind those totals. Ranges are Chicago calendar days,
  // not the viewer's, so a Sunday-night admin in another timezone still sees
  // the studio's week.
  import { onMount } from "svelte";
  import {
    CalendarClock,
    Download,
    FileText,
    Plus,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import PunchDrawer from "./PunchDrawer.svelte";
  import { downloadCsv } from "../../../lib/dashboard/csv";
  import {
    PUNCH_COLUMNS,
    QUICK_RANGES,
    SHIFT_ROLE_LABELS,
    SOURCE_LABELS,
    TIMESHEET_CSV_HEADERS,
    billableHours,
    chicagoDayEndIso,
    chicagoDayStartIso,
    employeeLabel,
    formatChicagoShortDate,
    formatChicagoTimeLabel,
    formatHours,
    loggedHours,
    quickRange,
    timesheetCsvFilename,
    timesheetCsvRow,
  } from "../../../lib/dashboard/timeclock";

  export let supabase;
  export let employees = [];
  export let refreshKey = 0;
  export let onChanged = () => {};

  const initialRange = quickRange("this-week");

  // PostgREST caps a single response, so the range is paged. Payroll numbers
  // that are quietly short are worse than no numbers at all.
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 20000;

  let fromDate = initialRange.from;
  let toDate = initialRange.to;
  let activeQuickRange = "this-week";
  let punches = [];
  let truncated = false;
  let isLoading = true;
  let errorMessage = "";
  let lastRefreshKey = refreshKey;
  // Seeded with the initial range so the range watcher below does not
  // duplicate the onMount load.
  let lastLoadedRange = `${initialRange.from}|${initialRange.to}`;

  let drawerOpen = false;
  let drawerPunch = null; // null = create mode

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadAll();
  }

  // Changing either date picker reloads; the guard keeps the reactive block
  // from re-firing on its own writes.
  $: rangeKey = `${fromDate}|${toDate}`;
  $: if (rangeKey !== lastLoadedRange && fromDate && toDate) {
    loadAll();
  }

  onMount(loadAll);

  async function loadAll() {
    if (!supabase || !fromDate || !toDate) return;
    if (fromDate > toDate) {
      errorMessage = "The start date is after the end date.";
      // Drop the old rows: totals for a range nobody asked for must not sit
      // under the error. Clearing the guard means the next valid range
      // reloads even if it is the one that was on screen before.
      punches = [];
      truncated = false;
      lastLoadedRange = "";
      isLoading = false;
      return;
    }

    lastLoadedRange = `${fromDate}|${toDate}`;
    isLoading = true;
    errorMessage = "";
    truncated = false;

    const startIso = chicagoDayStartIso(fromDate);
    const endIso = chicagoDayEndIso(toDate);
    const collected = [];

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("timeclock_punches")
        .select(PUNCH_COLUMNS)
        .is("deleted_at", null)
        .gte("clock_in_at", startIso)
        .lt("clock_in_at", endIso)
        .order("clock_in_at", { ascending: false })
        // Two punches can share a clock-in to the second; without a
        // tiebreaker the server is free to order them differently per page,
        // which duplicates one row and drops another.
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        errorMessage = error.message;
        isLoading = false;
        return;
      }

      const page = data || [];
      collected.push(...page);

      if (page.length < PAGE_SIZE) break;
      if (collected.length >= MAX_ROWS) {
        truncated = true;
        break;
      }
    }

    punches = collected;
    isLoading = false;
  }

  function applyQuickRange(id) {
    const range = quickRange(id);
    activeQuickRange = id;
    fromDate = range.from;
    toDate = range.to;
  }

  function handleDateInput() {
    activeQuickRange = "";
  }

  $: employeeById = Object.fromEntries(
    employees.map((employee) => [employee.id, employee]),
  );

  $: detailRows = punches.map((punch) => {
    const employee = employeeById[punch.employee_id] || null;
    return {
      punch,
      employee,
      name: employee ? employeeLabel(employee) : "Unknown employee",
      date: formatChicagoShortDate(punch.clock_in_at),
      clockIn: formatChicagoTimeLabel(punch.clock_in_at),
      clockOut: punch.clock_out_at ? formatChicagoTimeLabel(punch.clock_out_at) : "",
      logged: formatHours(loggedHours(punch)),
      billable: formatHours(billableHours(punch)),
    };
  });

  // Per-employee rollup for the range, biggest billable first.
  $: summaryRows = buildSummary(punches, employeeById);

  function buildSummary(list, byId) {
    const totals = new Map();
    for (const punch of list) {
      const key = punch.employee_id;
      if (!totals.has(key)) {
        totals.set(key, {
          id: key,
          name: byId[key] ? employeeLabel(byId[key]) : "Unknown employee",
          jobTitle: byId[key]?.job_title || "",
          shifts: 0,
          open: 0,
          logged: 0,
          billable: 0,
        });
      }
      const row = totals.get(key);
      row.shifts += 1;
      const logged = loggedHours(punch);
      const billable = billableHours(punch);
      if (logged == null) row.open += 1;
      row.logged += logged || 0;
      row.billable += billable || 0;
    }
    return Array.from(totals.values()).sort((a, b) => b.billable - a.billable);
  }

  $: totalBillable = summaryRows.reduce((sum, row) => sum + row.billable, 0);
  $: totalLogged = summaryRows.reduce((sum, row) => sum + row.logged, 0);
  $: openCount = punches.filter((punch) => !punch.clock_out_at).length;

  function exportCsv() {
    // Byte-for-byte the kiosk's own timesheet layout, so the two exports can
    // be diffed or concatenated.
    const rows = detailRows.map((row) => timesheetCsvRow(row.punch, row.employee));
    downloadCsv(timesheetCsvFilename(fromDate, toDate), TIMESHEET_CSV_HEADERS, rows);
  }

  function openCreate() {
    drawerPunch = null;
    drawerOpen = true;
  }

  function openEdit(row) {
    drawerPunch = row.punch;
    drawerOpen = true;
  }

  async function handleSaved() {
    drawerOpen = false;
    await loadAll();
    onChanged();
  }
</script>

<div class="space-y-4">
  {#if errorMessage}
    <Banner tone="error" message={errorMessage} onRetry={loadAll} />
  {/if}

  {#if truncated}
    <Banner
      tone="warning"
      message={`Range too large — showing the first ${MAX_ROWS.toLocaleString()} shifts, so these totals and the CSV are incomplete. Narrow the dates and run it in pieces.`}
    />
  {/if}

  <Panel title="Date range" id="time-clock-range-title">
    <div slot="actions">
      <Button size="sm" variant="primary" icon={Plus} onclick={openCreate}>
        Add punch
      </Button>
    </div>

    <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div class="flex flex-wrap items-end gap-3">
        <Field label="From" id="timesheet-from" class="w-44">
          <input
            id="timesheet-from"
            type="date"
            class="input"
            bind:value={fromDate}
            oninput={handleDateInput}
          />
        </Field>
        <Field label="To" id="timesheet-to" class="w-44">
          <input
            id="timesheet-to"
            type="date"
            class="input"
            bind:value={toDate}
            oninput={handleDateInput}
          />
        </Field>
      </div>

      <div class="flex flex-wrap gap-2">
        {#each QUICK_RANGES as range (range.id)}
          <button
            type="button"
            class="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors {activeQuickRange === range.id
              ? 'border-accent bg-accent-soft text-accent-strong'
              : 'border-ink/12 bg-white text-ink/65 hover:border-ink/30 hover:text-ink'}"
            aria-pressed={activeQuickRange === range.id}
            onclick={() => applyQuickRange(range.id)}
          >
            {range.label}
          </button>
        {/each}
      </div>
    </div>
    <p class="mt-3 text-xs text-ink/45">
      Dates are studio days (America/Chicago). Weeks run Monday through Sunday.
    </p>
  </Panel>

  {#if isLoading}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {#each Array(4) as _, i (i)}
        <SkeletonCard lines={2} />
      {/each}
    </div>
  {:else}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Shifts" value={punches.length} icon={CalendarClock} tone="neutral" />
      <StatCard
        label="Billable hours"
        value={formatHours(totalBillable) || "0.00"}
        icon={FileText}
        tone="gold"
      />
      <StatCard
        label="Hours logged"
        value={formatHours(totalLogged) || "0.00"}
        icon={FileText}
        tone="teal"
      />
      <StatCard
        label="Still open"
        value={openCount}
        icon={CalendarClock}
        tone={openCount ? "rose" : "neutral"}
        hint={openCount ? "No clock-out yet" : "Every shift closed"}
      />
    </div>
  {/if}

  <Panel title="By employee" id="time-clock-summary-title">
    {#if isLoading}
      <SkeletonCard lines={4} />
    {:else if !summaryRows.length}
      <EmptyState
        title="No shifts in this range"
        message="Widen the dates, or add a punch by hand if someone forgot to tap in."
        icon={CalendarClock}
      />
    {:else}
      <div class="thin-scroll overflow-x-auto">
        <table class="w-full text-left text-sm" style="min-width:620px">
          <thead>
            <tr class="border-b border-ink/10 bg-canvas/70">
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Employee</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Shifts</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Hours logged</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Billable hours</th>
            </tr>
          </thead>
          <tbody>
            {#each summaryRows as row (row.id)}
              <tr class="border-b border-ink/6 last:border-b-0">
                <td class="px-3 py-3 align-middle">
                  <span class="font-semibold text-ink">{row.name}</span>
                  {#if row.jobTitle}
                    <span class="block text-xs text-ink/50">{row.jobTitle}</span>
                  {/if}
                </td>
                <td class="px-3 py-3 align-middle tabular-nums text-ink/80">
                  {row.shifts}
                  {#if row.open}
                    <span class="text-xs text-amber-700"> ({row.open} open)</span>
                  {/if}
                </td>
                <td class="px-3 py-3 align-middle tabular-nums text-ink/80">{formatHours(row.logged)}</td>
                <td class="px-3 py-3 align-middle tabular-nums font-bold text-ink">{formatHours(row.billable)}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr class="border-t border-ink/10 bg-canvas/70">
              <td class="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-ink/65">Total</td>
              <td class="px-3 py-2.5 tabular-nums text-sm font-bold text-ink">{punches.length}</td>
              <td class="px-3 py-2.5 tabular-nums text-sm font-bold text-ink">{formatHours(totalLogged)}</td>
              <td class="px-3 py-2.5 tabular-nums text-sm font-bold text-ink">{formatHours(totalBillable)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="mt-3 text-xs leading-5 text-ink/45">
        Instructor shifts bill 1.5 hours per class actually taught; coordinator
        shifts bill the time between clock in and clock out. Open shifts
        contribute nothing until they are closed.
      </p>
    {/if}
  </Panel>

  <Panel title="Punches" id="time-clock-punches-title">
    <div slot="actions">
      <Button
        size="sm"
        icon={Download}
        disabled={!detailRows.length}
        onclick={exportCsv}
      >
        Export CSV
      </Button>
    </div>

    {#if isLoading}
      <SkeletonCard lines={5} />
    {:else if !detailRows.length}
      <EmptyState
        title="No punches in this range"
        message="Nothing was recorded on these days."
        icon={CalendarClock}
      >
        <div slot="actions">
          <Button variant="primary" size="sm" icon={Plus} onclick={openCreate}>
            Add a punch
          </Button>
        </div>
      </EmptyState>
    {:else}
      <div class="thin-scroll overflow-x-auto">
        <table class="w-full text-left text-sm" style="min-width:940px">
          <thead>
            <tr class="border-b border-ink/10 bg-canvas/70">
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Date</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Employee</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Shift role</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">In</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Out</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Logged</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Billable</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Flags</th>
            </tr>
          </thead>
          <tbody>
            {#each detailRows as row (row.punch.id)}
              <tr
                class="cursor-pointer border-b border-ink/6 transition-colors last:border-b-0 hover:bg-accent-soft/50 focus-visible:bg-accent-soft/50"
                tabindex="0"
                onclick={() => openEdit(row)}
                onkeydown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEdit(row);
                  }
                }}
              >
                <td class="px-3 py-3 align-middle whitespace-nowrap text-ink/80">{row.date}</td>
                <td class="px-3 py-3 align-middle font-semibold text-ink">{row.name}</td>
                <td class="px-3 py-3 align-middle">
                  <Badge tone={row.punch.shift_role === "coordinator" ? "blue" : "teal"} size="xs">
                    {SHIFT_ROLE_LABELS[row.punch.shift_role] || "Instructor"}
                  </Badge>
                  {#if row.punch.shift_role === "instructor"}
                    <span class="ml-1.5 text-xs tabular-nums text-ink/50">
                      {row.punch.actual_classes_taught ?? 0}/{row.punch.scheduled_classes ?? 0}
                    </span>
                  {/if}
                </td>
                <td class="px-3 py-3 align-middle whitespace-nowrap tabular-nums text-ink/80">{row.clockIn}</td>
                <td class="px-3 py-3 align-middle whitespace-nowrap tabular-nums">
                  {#if row.clockOut}
                    <span class="text-ink/80">{row.clockOut}</span>
                  {:else}
                    <Badge tone="amber" size="xs" dot>On the clock</Badge>
                  {/if}
                </td>
                <td class="px-3 py-3 align-middle tabular-nums text-ink/80">
                  {row.logged || "—"}
                </td>
                <td class="px-3 py-3 align-middle tabular-nums font-bold text-ink">
                  {row.billable || "—"}
                </td>
                <td class="px-3 py-3 align-middle">
                  <span class="flex flex-wrap items-center gap-1.5">
                    <Badge tone={row.punch.source === "kiosk" ? "neutral" : "gold"} size="xs">
                      {SOURCE_LABELS[row.punch.source] || row.punch.source}
                    </Badge>
                    {#if row.punch.was_forced_out}
                      <Badge tone="red" size="xs">Forced</Badge>
                    {/if}
                    {#if row.punch.note}
                      <span title={row.punch.note} class="text-ink/45" aria-label="Has a note">
                        <FileText class="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    {/if}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-ink/45">
        Click any row to correct it. Instructor rows show taught / scheduled classes.
      </p>
    {/if}
  </Panel>
</div>

<PunchDrawer
  {supabase}
  {employees}
  open={drawerOpen}
  punch={drawerPunch}
  onClose={() => (drawerOpen = false)}
  onSaved={handleSaved}
/>
