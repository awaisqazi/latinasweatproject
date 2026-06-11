<script>
  // Read-only utilization insights from the imported MarianaTek class
  // history. Three panels: a day-by-time heatmap per room, class type
  // performance, and instructor performance.
  import { onMount } from "svelte";
  import { ChartColumn, FileUp, GraduationCap, Users } from "@lucide/svelte";
  import Panel from "../ui/Panel.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import SearchInput from "../ui/SearchInput.svelte";
  import {
    CLASS_ROOMS,
    ROOM_SHORT,
    ROOM_TONES,
    DOW_LABELS,
    formatTime12,
    parseHistoryCsvRows,
    timeToMinutes,
  } from "../../../lib/dashboard/spacesAdmin.js";
  import { formatShortDate } from "../../../lib/dashboard/volunteersAdmin.js";
  import { parseCSV } from "../../../lib/geminiUtils.js";

  export let supabase;
  // Accepted for prop compatibility with the other tabs; CSV imports reload
  // this tab's own panels directly, so onChanged is never invoked.
  export let dataVersion = 0;
  export let onChanged = () => {};

  const MIN_SESSIONS = 3;
  const INSTRUCTOR_LIMIT = 30;

  let slotRows = [];
  let slotLoading = true;
  let slotError = "";

  let typeRows = [];
  let typeLoading = true;
  let typeError = "";

  let instructorRows = [];
  let instructorLoading = true;
  let instructorError = "";
  let instructorQuery = "";

  let lastVersion = dataVersion;
  $: if (dataVersion !== lastVersion) {
    lastVersion = dataVersion;
    loadAll();
  }

  onMount(loadAll);

  function loadAll() {
    loadSlotStats();
    loadTypeStats();
    loadInstructorStats();
  }

  async function loadSlotStats() {
    if (!supabase) return;
    slotLoading = true;
    slotError = "";
    const { data, error } = await supabase.from("class_history_slot_stats").select("*");
    if (error) {
      slotError = error.message;
      slotRows = [];
    } else {
      slotRows = data || [];
    }
    slotLoading = false;
  }

  async function loadTypeStats() {
    if (!supabase) return;
    typeLoading = true;
    typeError = "";
    const { data, error } = await supabase
      .from("class_history_type_stats")
      .select("*")
      .order("avg_utilization", { ascending: false });
    if (error) {
      typeError = error.message;
      typeRows = [];
    } else {
      typeRows = data || [];
    }
    typeLoading = false;
  }

  async function loadInstructorStats() {
    if (!supabase) return;
    instructorLoading = true;
    instructorError = "";
    const { data, error } = await supabase
      .from("class_history_instructor_stats")
      .select("*")
      .order("sessions", { ascending: false })
      .limit(INSTRUCTOR_LIMIT);
    if (error) {
      instructorError = error.message;
      instructorRows = [];
    } else {
      instructorRows = data || [];
    }
    instructorLoading = false;
  }

  // ---- Heatmap derivation -------------------------------------------------

  function buildHeatmap(room, rows) {
    const roomRows = (rows || []).filter((r) => r.classroom === room);
    const times = [...new Set(roomRows.map((r) => r.start_time))].sort(
      (a, b) => timeToMinutes(a) - timeToMinutes(b),
    );
    const cells = {};
    for (const r of roomRows) cells[`${r.day_of_week}|${r.start_time}`] = r;
    return { room, times, cells };
  }

  $: heatmaps = CLASS_ROOMS.map((room) => buildHeatmap(room, slotRows));

  // Background intensity scaled from utilization: white at 0, accent-soft
  // for low, deepening teal, white text on solid accent at 60%+.
  function heatClass(cell) {
    const sessions = Number(cell?.sessions || 0);
    const u = Number(cell?.avg_utilization || 0);
    if (sessions < MIN_SESSIONS) return "bg-white text-ink/45";
    if (u >= 60) return "bg-accent text-white font-semibold";
    if (u >= 45) return "bg-accent/40 text-ink font-semibold";
    if (u >= 30) return "bg-accent/20 text-ink";
    if (u >= 15) return "bg-accent-soft text-ink";
    if (u > 0) return "bg-accent-soft/50 text-ink/80";
    return "bg-white text-ink/65";
  }

  function cellTitle(cell) {
    return `${cell.sessions} session${Number(cell.sessions) === 1 ? "" : "s"}, avg ${avgCheckedIn(cell.avg_checked_in)} checked in`;
  }

  // ---- Formatting helpers -------------------------------------------------

  function pct(value) {
    return `${Math.round(Number(value) || 0)}%`;
  }

  function avgCheckedIn(value) {
    return (Number(value) || 0).toFixed(1);
  }

  // green for healthy, amber for soft, red for poor utilization.
  function utilizationTone(value) {
    const u = Number(value) || 0;
    if (u >= 40) return "green";
    if (u >= 20) return "amber";
    return "red";
  }

  // The view may surface class_types as a count or an array; handle both.
  function classTypesCount(value) {
    if (Array.isArray(value)) return value.length;
    return Number(value) || 0;
  }

  $: filteredInstructors = instructorQuery.trim()
    ? instructorRows.filter((r) =>
        (r.instructor || "").toLowerCase().includes(instructorQuery.trim().toLowerCase()),
      )
    : instructorRows;

  // ---- History CSV import --------------------------------------------------
  // The dedupe unique index on class_history plus ignoreDuplicates makes
  // re-uploading overlapping exports safe: only new sessions land.

  const IMPORT_BATCH_SIZE = 500;

  let importInput;
  let importBusy = false;
  let importError = "";
  let importSuccess = "";

  async function handleImportFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file || importBusy || !supabase) return;

    importBusy = true;
    importError = "";
    importSuccess = "";

    let text = "";
    try {
      text = await file.text();
    } catch (err) {
      importError = err?.message || "Could not read that CSV file.";
      importBusy = false;
      return;
    }

    const { rows, errors } = parseHistoryCsvRows(parseCSV(text));

    if (!rows.length) {
      importError =
        "No readable sessions in that file. Export 'Class Session Utilization Details' from MarianaTek and try again.";
      importBusy = false;
      return;
    }

    let imported = 0;
    for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
      const batch = rows.slice(i, i + IMPORT_BATCH_SIZE);
      const { error } = await supabase.from("class_history").upsert(batch, {
        onConflict: "session_date,start_time,classroom,class_type,instructors",
        ignoreDuplicates: true,
      });
      if (error) {
        importError = error.message;
        importBusy = false;
        return;
      }
      imported += batch.length;
    }

    importSuccess = `Imported ${imported} session${imported === 1 ? "" : "s"} (${errors.length} unreadable line${errors.length === 1 ? "" : "s"} skipped). Duplicate sessions are ignored automatically.`;
    importBusy = false;
    loadAll();
  }
</script>

<div class="space-y-4">
  <!-- History CSV import toolbar -->
  <div class="flex flex-wrap items-center justify-between gap-3">
    <p class="max-w-xl text-xs leading-5 text-ink/65">
      Export "Class Session Utilization Details" from MarianaTek and upload it here
      to keep insights current.
    </p>
    <div>
      <input
        bind:this={importInput}
        type="file"
        accept=".csv"
        class="hidden"
        onchange={handleImportFile}
      />
      <Button
        variant="secondary"
        icon={FileUp}
        loading={importBusy}
        onclick={() => importInput?.click()}
      >
        Import history CSV
      </Button>
    </div>
  </div>

  {#if importError}
    <Banner tone="error" message={importError} onDismiss={() => (importError = "")} />
  {/if}

  {#if importSuccess}
    <Banner tone="success" message={importSuccess} onDismiss={() => (importSuccess = "")} />
  {/if}

  <!-- Panel 1: day-by-time heatmap per room -->
  {#if slotLoading && !slotRows.length}
    <SkeletonCard lines={8} />
  {:else}
    <Panel title="Best and worst time slots" id="insights-slot-heatmap" loading={slotLoading}>
      {#if slotError}
        <Banner tone="error" message={slotError} onRetry={loadSlotStats} />
      {:else if !slotRows.length}
        <EmptyState
          title="No session history yet"
          message="Once class history is imported, this heatmap shows which days and times fill up."
          icon={ChartColumn}
        />
      {:else}
        <p class="mb-4 text-sm leading-6 text-ink/65">
          Average utilization by day and start time. Darker teal means fuller classes,
          so the darkest cells are the strongest candidates when scheduling new classes.
        </p>
        <div class="grid gap-5 xl:grid-cols-2">
          {#each heatmaps as heatmap (heatmap.room)}
            <div>
              <div class="mb-2 flex items-center gap-2">
                <Badge tone={ROOM_TONES[heatmap.room] || "neutral"}>{ROOM_SHORT[heatmap.room]}</Badge>
              </div>
              {#if !heatmap.times.length}
                <p class="rounded-control border border-dashed border-ink/15 px-3 py-6 text-center text-sm text-ink/65">
                  No imported sessions for this room.
                </p>
              {:else}
                <div class="thin-scroll overflow-x-auto rounded-control border border-ink/8">
                  <table class="w-full min-w-[480px] border-collapse text-center text-xs">
                    <thead>
                      <tr class="border-b border-ink/10 bg-canvas/70">
                        <th scope="col" class="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">
                          Time
                        </th>
                        {#each DOW_LABELS as day (day)}
                          <th scope="col" class="px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">
                            {day}
                          </th>
                        {/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each heatmap.times as time (time)}
                        <tr class="border-b border-ink/6 last:border-b-0">
                          <th scope="row" class="whitespace-nowrap px-2 py-1.5 text-left text-xs font-semibold text-ink/80">
                            {formatTime12(time)}
                          </th>
                          {#each DOW_LABELS as day, dow (day)}
                            {@const cell = heatmap.cells[`${dow}|${time}`]}
                            {#if cell}
                              <td class="px-2 py-1.5 tabular-nums {heatClass(cell)}" title={cellTitle(cell)}>
                                {pct(cell.avg_utilization)}{Number(cell.sessions) < MIN_SESSIONS ? "*" : ""}
                              </td>
                            {:else}
                              <td class="bg-white px-2 py-1.5 text-ink/20" aria-label="No sessions"></td>
                            {/if}
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}
            </div>
          {/each}
        </div>
        <p class="mt-3 text-xs text-ink/45">
          * Fewer than {MIN_SESSIONS} sessions at this slot, treat with caution. Hover a cell for session counts.
        </p>
      {/if}
    </Panel>
  {/if}

  <!-- Panel 2: class type performance -->
  {#if typeLoading && !typeRows.length}
    <SkeletonCard lines={6} />
  {:else}
    <Panel title="Class types" id="insights-class-types" loading={typeLoading}>
      {#if typeError}
        <Banner tone="error" message={typeError} onRetry={loadTypeStats} />
      {:else if !typeRows.length}
        <EmptyState
          title="No class types yet"
          message="Class type performance appears here once session history is imported."
          icon={GraduationCap}
        />
      {:else}
        <div class="thin-scroll overflow-x-auto">
          <table class="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr class="border-b border-ink/10 bg-canvas/70">
                <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Class type</th>
                <th scope="col" class="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Sessions</th>
                <th scope="col" class="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Avg utilization</th>
                <th scope="col" class="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Avg checked in</th>
                <th scope="col" class="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Last offered</th>
              </tr>
            </thead>
            <tbody>
              {#each typeRows as row (row.class_type)}
                <tr class="border-b border-ink/6 last:border-b-0">
                  <td class="px-3 py-2.5 font-semibold text-ink">{row.class_type}</td>
                  <td class="px-3 py-2.5 text-right tabular-nums text-ink/80">{row.sessions}</td>
                  <td class="px-3 py-2.5 text-right">
                    <Badge tone={utilizationTone(row.avg_utilization)} size="xs">{pct(row.avg_utilization)}</Badge>
                  </td>
                  <td class="px-3 py-2.5 text-right tabular-nums text-ink/80">{avgCheckedIn(row.avg_checked_in)}</td>
                  <td class="px-3 py-2.5 text-right whitespace-nowrap text-ink/65">
                    {row.last_session ? formatShortDate(row.last_session) : "–"}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </Panel>
  {/if}

  <!-- Panel 3: instructor performance -->
  {#if instructorLoading && !instructorRows.length}
    <SkeletonCard lines={6} />
  {:else}
    <Panel title="Instructors" id="insights-instructors" loading={instructorLoading}>
      <svelte:fragment slot="actions">
        <SearchInput
          bind:value={instructorQuery}
          placeholder="Filter instructors"
          label="Filter instructors by name"
          class="w-48 sm:w-56"
        />
      </svelte:fragment>
      {#if instructorError}
        <Banner tone="error" message={instructorError} onRetry={loadInstructorStats} />
      {:else if !instructorRows.length}
        <EmptyState
          title="No instructors yet"
          message="Instructor performance appears here once session history is imported."
          icon={Users}
        />
      {:else if !filteredInstructors.length}
        <EmptyState
          title="No matching instructors"
          message={`Nobody in the top ${INSTRUCTOR_LIMIT} matches "${instructorQuery.trim()}".`}
          icon={Users}
        />
      {:else}
        <div class="thin-scroll overflow-x-auto">
          <table class="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr class="border-b border-ink/10 bg-canvas/70">
                <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Instructor</th>
                <th scope="col" class="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Sessions</th>
                <th scope="col" class="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Avg utilization</th>
                <th scope="col" class="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Avg checked in</th>
                <th scope="col" class="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Class types</th>
                <th scope="col" class="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Last taught</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredInstructors as row (row.instructor)}
                <tr class="border-b border-ink/6 last:border-b-0">
                  <td class="px-3 py-2.5 font-semibold text-ink">{row.instructor}</td>
                  <td class="px-3 py-2.5 text-right tabular-nums text-ink/80">{row.sessions}</td>
                  <td class="px-3 py-2.5 text-right">
                    <Badge tone={utilizationTone(row.avg_utilization)} size="xs">{pct(row.avg_utilization)}</Badge>
                  </td>
                  <td class="px-3 py-2.5 text-right tabular-nums text-ink/80">{avgCheckedIn(row.avg_checked_in)}</td>
                  <td class="px-3 py-2.5 text-right tabular-nums text-ink/80">{classTypesCount(row.class_types)}</td>
                  <td class="px-3 py-2.5 text-right whitespace-nowrap text-ink/65">
                    {row.last_session ? formatShortDate(row.last_session) : "–"}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="mt-3 text-xs text-ink/45">Showing the {INSTRUCTOR_LIMIT} most active instructors by session count.</p>
      {/if}
    </Panel>
  {/if}

  <p class="text-sm leading-6 text-ink/65">
    Data source: imported MarianaTek session history, Sep 2025 - Jun 2026 (2,846 sessions).
    Utilization is checked-in attendance relative to capacity.
  </p>
</div>
