<script>
  import {
    CircleCheck,
    CircleAlert,
    Download,
    FileUp,
    Sparkles,
    UsersRound,
    X,
  } from "@lucide/svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import Badge from "../ui/Badge.svelte";
  import {
    buildCompliance,
    buildComplianceCsvRows,
    downloadCsv,
    getLastFullMonthRange,
    parseDateStr,
    reconcileAiResult,
    toDateStr,
    toGeminiRecords,
  } from "../../../lib/dashboard/volunteersAdmin.js";
  import {
    extractExpectedVolunteers,
    generateVolunteerSummary,
    isGeminiConfigured,
    parseCSV,
  } from "../../../lib/geminiUtils.js";

  export let supabase;

  const AI_RECORD_LIMIT = 1500;
  const lastMonth = getLastFullMonthRange();

  let startDate = lastMonth.startStr;
  let endDate = lastMonth.endStr;
  let roster = null;
  let rosterFileName = "";
  let rosterError = "";
  let rosterInput;

  let isRunning = false;
  let runError = "";
  let registrations = null; // raw rows from the last run
  let deterministicResult = null;
  let aiResult = null;
  let aiError = "";
  let isRefining = false;
  let activeSource = "exact"; // exact | ai
  let resultRange = null; // { startStr, endStr } of the displayed result

  $: displayed = activeSource === "ai" && aiResult ? aiResult : deterministicResult;
  $: aiTooLarge = (registrations?.length || 0) > AI_RECORD_LIMIT;
  $: grouped = displayed
    ? {
        under: displayed.volunteers.filter((v) => v.category === "under"),
        close: displayed.volunteers.filter((v) => v.category === "close"),
        met: displayed.volunteers.filter((v) => v.category === "met"),
      }
    : null;

  const SECTIONS = [
    { key: "under", label: "Under 2 hours · out of compliance", tone: "red" },
    { key: "close", label: "Close · 2 to 3.99 hours", tone: "amber" },
    { key: "met", label: "Met · 4+ hours", tone: "green" },
  ];

  function setPreset(which) {
    if (which === "last") {
      const range = getLastFullMonthRange();
      startDate = range.startStr;
      endDate = range.endStr;
    } else {
      const now = new Date();
      startDate = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
      endDate = toDateStr(now);
    }
  }

  function handleRosterFile(event) {
    rosterError = "";
    roster = null;
    rosterFileName = "";
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = extractExpectedVolunteers(parseCSV(String(e.target.result || "")));
        if (!parsed.length) {
          rosterError =
            "No volunteers found in that CSV. Expected Full Name/Email or First/Last Name columns.";
          if (rosterInput) rosterInput.value = "";
          return;
        }
        roster = parsed;
        rosterFileName = file.name;
      } catch (err) {
        rosterError = err?.message || "Could not read that CSV file.";
        if (rosterInput) rosterInput.value = "";
      }
    };
    reader.readAsText(file);
  }

  function clearRoster() {
    roster = null;
    rosterFileName = "";
    rosterError = "";
    if (rosterInput) rosterInput.value = "";
  }

  async function fetchRegistrations(rangeStartIso, rangeEndIso) {
    const pageSize = 1000;
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("shift_registrations")
        .select(
          "id, name, email, checked_in, shift:volunteer_shifts!inner(id, starts_at, ends_at, cancelled)",
        )
        .gte("shift.starts_at", rangeStartIso)
        .lt("shift.starts_at", rangeEndIso)
        .order("id")
        .range(offset, offset + pageSize - 1);

      if (error) throw new Error(error.message);
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  }

  async function runCheck() {
    if (!startDate || !endDate || isRunning) return;
    if (parseDateStr(endDate) < parseDateStr(startDate)) {
      runError = "The end date must be on or after the start date.";
      return;
    }

    isRunning = true;
    runError = "";
    aiResult = null;
    aiError = "";
    activeSource = "exact";

    try {
      const rangeStart = parseDateStr(startDate);
      const rangeEndExclusive = parseDateStr(endDate);
      rangeEndExclusive.setDate(rangeEndExclusive.getDate() + 1);

      registrations = await fetchRegistrations(
        rangeStart.toISOString(),
        rangeEndExclusive.toISOString(),
      );
      deterministicResult = buildCompliance(registrations, roster);
      resultRange = { startStr: startDate, endStr: endDate };
    } catch (err) {
      runError = err?.message || "Could not load registrations for that range.";
      registrations = null;
      deterministicResult = null;
      resultRange = null;
    }

    isRunning = false;
  }

  async function refineWithAi() {
    if (!registrations?.length || isRefining || aiTooLarge) return;

    isRefining = true;
    aiError = "";

    try {
      const raw = await generateVolunteerSummary(
        toGeminiRecords(registrations),
        { startDate: resultRange.startStr, endDate: resultRange.endStr },
        roster,
      );
      // Keep the AI's identity groupings but recompute every total from the
      // raw rows: models merge names well and add numbers badly.
      aiResult = reconcileAiResult(raw, registrations, roster);
      activeSource = "ai";
    } catch (err) {
      aiError = err?.message || "AI analysis failed. The exact-match results are still shown.";
    }

    isRefining = false;
  }

  function exportCsv() {
    if (!displayed || !resultRange) return;
    downloadCsv(
      `volunteer-compliance_${resultRange.startStr}_to_${resultRange.endStr}${activeSource === "ai" ? "_ai" : ""}.csv`,
      buildComplianceCsvRows(displayed),
    );
  }

  function hoursLabel(v) {
    return `${v.totalCheckedInHours} h checked in · ${v.totalRegisteredHours} h registered · ${v.checkedInShifts}/${v.totalRegisteredShifts} shifts`;
  }
</script>

<div class="space-y-4">
  <Panel title="Monthly compliance check" id="compliance-form-title">
    <p class="-mt-2 mb-4 max-w-2xl text-sm leading-6 text-ink/60">
      Counts checked-in volunteer hours per person for a date range and flags
      anyone under the 4-hour monthly requirement. Optionally upload a member
      roster CSV to also catch members with no check-ins at all.
    </p>

    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="From" id="compliance-start">
        <input id="compliance-start" type="date" class="input" bind:value={startDate} disabled={isRunning} />
      </Field>
      <Field label="To" id="compliance-end" hint="Inclusive">
        <input id="compliance-end" type="date" class="input" bind:value={endDate} disabled={isRunning} />
      </Field>
      <div class="flex items-end gap-2 lg:col-span-2">
        <Button size="sm" onclick={() => setPreset("last")} disabled={isRunning}>Last month</Button>
        <Button size="sm" onclick={() => setPreset("this")} disabled={isRunning}>This month</Button>
      </div>
    </div>

    <div class="mt-4 rounded-control border border-dashed border-ink/15 bg-canvas/50 p-3.5">
      {#if roster}
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="teal" dot>{roster.length} expected volunteers</Badge>
          <span class="truncate text-ink/60">{rosterFileName}</span>
          <button
            type="button"
            class="rounded p-1 text-ink/45 transition hover:text-ink"
            aria-label="Remove roster"
            onclick={clearRoster}
          >
            <X class="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      {:else}
        <label class="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium text-ink/70">
          <FileUp class="h-4 w-4 text-ink/45" aria-hidden="true" />
          Optional: upload a member roster CSV (Full Name, Email)
          <input
            bind:this={rosterInput}
            type="file"
            accept=".csv,text/csv"
            class="sr-only"
            onchange={handleRosterFile}
            disabled={isRunning}
          />
          <span class="rounded-control border border-ink/15 bg-white px-2.5 py-1 text-xs font-semibold shadow-card">Choose file</span>
        </label>
      {/if}
      {#if rosterError}
        <p class="mt-2 text-xs font-medium text-red-700" role="alert">{rosterError}</p>
      {/if}
    </div>

    {#if runError}
      <Banner tone="error" message={runError} class="mt-4" onRetry={runCheck} />
    {/if}

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <Button variant="primary" loading={isRunning} onclick={runCheck} icon={UsersRound}>
        Run compliance check
      </Button>
    </div>
  </Panel>

  {#if deterministicResult && resultRange}
    {#if displayed && grouped}
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Unique volunteers" value={displayed.stats.totalUniqueVolunteers} icon={UsersRound} tone="neutral" />
        <StatCard label="Checked-in hours" value={displayed.stats.totalCheckedInHours} icon={CircleCheck} tone="teal" />
        <StatCard label="Met 4+ hours" value={displayed.stats.metCount} icon={CircleCheck} tone="gold" />
        <StatCard label="Under 2 hours" value={displayed.stats.underCount} icon={CircleAlert} tone="rose" />
      </div>

      <Panel padded={false}>
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-ink/8 px-4 py-3 md:px-5">
          <div class="flex flex-wrap items-center gap-3">
            <h3 class="text-base font-bold">
              Results · {resultRange.startStr} to {resultRange.endStr}
            </h3>
            {#if aiResult}
              <Tabs
                variant="segmented"
                label="Result source"
                tabs={[
                  { id: "exact", label: "Exact match" },
                  { id: "ai", label: "AI-merged" },
                ]}
                bind:active={activeSource}
              />
            {/if}
          </div>
          <div class="flex flex-wrap items-center gap-2">
            {#if isGeminiConfigured()}
              {#if !aiResult}
                <Button
                  icon={Sparkles}
                  loading={isRefining}
                  disabled={aiTooLarge}
                  title={aiTooLarge ? "Range too large for AI analysis. Narrow the date range." : ""}
                  onclick={refineWithAi}
                >
                  Refine with AI
                </Button>
              {/if}
            {/if}
            <Button icon={Download} onclick={exportCsv}>Download CSV</Button>
          </div>
        </div>

        {#if aiTooLarge && isGeminiConfigured() && !aiResult}
          <div class="px-4 pt-3 md:px-5">
            <Banner tone="info" message="This range has too many registrations for AI analysis. Narrow the date range to use identity merging; exact-match results are complete." />
          </div>
        {/if}
        {#if !isGeminiConfigured()}
          <div class="px-4 pt-3 md:px-5">
            <Banner tone="info" message="AI refinement is unavailable in this build (no Gemini key). Showing exact email-match results." />
          </div>
        {/if}
        {#if aiError}
          <div class="px-4 pt-3 md:px-5">
            <Banner tone="error" message={aiError} onRetry={refineWithAi} retryLabel="Retry AI analysis" />
          </div>
        {/if}

        {#if !displayed.volunteers.length}
          <div class="p-4 md:p-5">
            <EmptyState
              title="No registrations in this range"
              message="No volunteer shift registrations were found between these dates."
            />
          </div>
        {:else}
          <div class="divide-y divide-ink/6">
            {#each SECTIONS as section (section.key)}
              {#if grouped[section.key].length}
                <section class="px-4 py-4 md:px-5">
                  <div class="mb-3 flex items-center gap-2">
                    <Badge tone={section.tone} dot>{section.label}</Badge>
                    <span class="text-xs font-semibold tabular-nums text-ink/45">{grouped[section.key].length}</span>
                  </div>
                  <ul class="space-y-2">
                    {#each grouped[section.key] as v (v.primaryEmail)}
                      <li class="rounded-control border border-ink/8 bg-white px-3.5 py-3 shadow-card {v.confidence === 'low' || v.uncertaintyNote ? 'border-amber-300/70 bg-amber-50/40' : ''}">
                        <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <div class="min-w-0">
                            <p class="font-semibold text-ink">{v.primaryName}</p>
                            <p class="truncate text-xs text-ink/55">{v.primaryEmail}</p>
                            {#if v.allNames?.length > 1 || v.allEmails?.length > 1}
                              <p class="mt-1 text-xs text-ink/45">
                                Also seen as: {[...new Set([...(v.allNames || []), ...(v.allEmails || [])])].filter((x) => x !== v.primaryName && x !== v.primaryEmail).join(", ")}
                              </p>
                            {/if}
                          </div>
                          <div class="flex shrink-0 flex-wrap items-center gap-1.5">
                            {#if v.onExpectedList === false}
                              <Badge tone="neutral" size="xs">Not on roster</Badge>
                            {/if}
                            {#if v.confidence && v.confidence !== "high"}
                              <Badge tone="amber" size="xs">{v.confidence} confidence</Badge>
                            {/if}
                          </div>
                        </div>
                        <p class="mt-1.5 text-sm tabular-nums text-ink/70">{hoursLabel(v)}</p>
                        {#if v.uncertaintyNote}
                          <p class="mt-1 text-xs font-medium text-amber-800">{v.uncertaintyNote}</p>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </section>
              {/if}
            {/each}

            {#if displayed.notFound?.length}
              <section class="px-4 py-4 md:px-5">
                <div class="mb-3 flex items-center gap-2">
                  <Badge tone="neutral" dot>Not found in check-in records</Badge>
                  <span class="text-xs font-semibold tabular-nums text-ink/45">{displayed.notFound.length}</span>
                </div>
                <ul class="space-y-1.5">
                  {#each displayed.notFound as missing (missing.email + missing.name)}
                    <li class="flex flex-wrap items-baseline justify-between gap-2 rounded-control bg-canvas/70 px-3.5 py-2.5 text-sm">
                      <span class="font-medium text-ink/80">{missing.name || missing.email}</span>
                      <span class="text-xs text-ink/50">{missing.email}</span>
                    </li>
                  {/each}
                </ul>
              </section>
            {/if}

            {#if displayed.notes}
              <p class="px-4 py-3 text-xs leading-5 text-ink/45 md:px-5">{displayed.notes}</p>
            {/if}
          </div>
        {/if}
      </Panel>
    {/if}
  {/if}
</div>
