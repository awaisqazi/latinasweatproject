<script>
  import { CircleAlert, Download, Search, X } from "@lucide/svelte";
  import Panel from "../marketing/Panel.svelte";
  import EmptyState from "../marketing/EmptyState.svelte";
  import {
    downloadCsv,
    formatShortDate,
    formatTimeRange,
    parseDateStr,
    shiftLabel,
    toDateStr,
  } from "../../../lib/dashboard/volunteersAdmin.js";

  export let supabase;

  let searchQuery = "";
  let isSearching = false;
  let hasSearched = false;
  let results = [];
  let errorMessage = "";
  let searchTimer;

  // CSV export state
  let exportStart = toDateStr(new Date(new Date().getFullYear(), 0, 1));
  let exportEnd = toDateStr(new Date());
  let isExporting = false;
  let exportError = "";

  $: stats = (() => {
    const totalShifts = results.length;
    const checkedInCount = results.filter((row) => row.checked_in).length;
    const totalHours = results.reduce((sum, row) => {
      if (!row.shift) return sum;
      return (
        sum +
        (new Date(row.shift.ends_at) - new Date(row.shift.starts_at)) / 3600000
      );
    }, 0);
    return { totalShifts, checkedInCount, totalHours: totalHours.toFixed(1) };
  })();

  function handleQueryInput() {
    window.clearTimeout(searchTimer);
    const query = searchQuery.trim();
    if (query.length < 2) {
      results = [];
      hasSearched = false;
      return;
    }
    searchTimer = window.setTimeout(() => runSearch(query), 300);
  }

  async function runSearch(query) {
    isSearching = true;
    errorMessage = "";

    const escaped = query.replace(/[%_,]/g, "");
    const { data, error } = await supabase
      .from("shift_registrations")
      .select(
        "id, shift_id, name, email, phone, role, checked_in, check_in_time, shift:volunteer_shifts(id, kind, title, starts_at, ends_at, cancelled)",
      )
      .or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
      .limit(200);

    if (error) {
      errorMessage = error.message;
      results = [];
    } else {
      results = (data || [])
        .filter((row) => row.shift)
        .sort((a, b) => new Date(b.shift.starts_at) - new Date(a.shift.starts_at));
    }

    hasSearched = true;
    isSearching = false;
  }

  function clearSearch() {
    searchQuery = "";
    results = [];
    hasSearched = false;
    errorMessage = "";
  }

  async function exportRangeCsv() {
    if (!exportStart || !exportEnd || isExporting) return;

    isExporting = true;
    exportError = "";

    const rangeStart = parseDateStr(exportStart);
    const rangeEnd = parseDateStr(exportEnd);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    const { data, error } = await supabase
      .from("shift_registrations")
      .select(
        "id, name, email, phone, role, checked_in, check_in_time, shift:volunteer_shifts!inner(id, kind, title, starts_at, ends_at, cancelled)",
      )
      .gte("shift.starts_at", rangeStart.toISOString())
      .lt("shift.starts_at", rangeEnd.toISOString());

    if (error) {
      exportError = error.message;
      isExporting = false;
      return;
    }

    const rows = [
      [
        "Name",
        "Email",
        "Phone",
        "Role",
        "Shift Date",
        "Shift Time",
        "Shift Duration (Hours)",
        "Status",
        "Check-in Time",
      ],
    ];

    const sorted = (data || [])
      .filter((row) => row.shift)
      .sort((a, b) => new Date(a.shift.starts_at) - new Date(b.shift.starts_at));

    for (const row of sorted) {
      const start = new Date(row.shift.starts_at);
      const end = new Date(row.shift.ends_at);
      rows.push([
        row.name || "",
        row.email || "",
        row.phone || "",
        row.role || "",
        start.toLocaleDateString(),
        formatTimeRange(start, end),
        ((end - start) / 3600000).toFixed(2),
        row.checked_in ? "Checked In" : "Registered",
        row.check_in_time ? new Date(row.check_in_time).toLocaleString() : "",
      ]);
    }

    downloadCsv(`volunteer_report_${exportStart}_to_${exportEnd}.csv`, rows);
    isExporting = false;
  }
</script>

<Panel title="Volunteer lookup" id="volunteer-lookup-title" loading={isSearching}>
  <div class="relative">
    <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
    <input
      type="search"
      class="min-h-11 w-full rounded-md border border-gray-200 bg-white pl-9 pr-9 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
      placeholder="Search by name or email (2+ characters)"
      aria-label="Search volunteers"
      bind:value={searchQuery}
      oninput={handleQueryInput}
    />
    {#if searchQuery}
      <button
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        aria-label="Clear search"
        onclick={clearSearch}
      >
        <X class="h-4 w-4" aria-hidden="true" />
      </button>
    {/if}
  </div>

  {#if errorMessage}
    <div class="mt-4 flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{errorMessage}</span>
    </div>
  {/if}

  {#if hasSearched && !errorMessage}
    <div class="mt-4 grid grid-cols-3 gap-2 text-center">
      <div class="rounded-md border border-black/10 bg-gray-50 p-3">
        <p class="text-2xl font-bold">{stats.totalShifts}</p>
        <p class="text-xs font-semibold text-gray-600">Shifts</p>
      </div>
      <div class="rounded-md border border-black/10 bg-gray-50 p-3">
        <p class="text-2xl font-bold">{stats.totalHours}</p>
        <p class="text-xs font-semibold text-gray-600">Hours</p>
      </div>
      <div class="rounded-md border border-black/10 bg-gray-50 p-3">
        <p class="text-2xl font-bold">{stats.checkedInCount}</p>
        <p class="text-xs font-semibold text-gray-600">Check-ins</p>
      </div>
    </div>

    {#if !results.length}
      <div class="mt-4">
        <EmptyState
          title="No registrations found"
          message="No volunteer registrations match that name or email."
        />
      </div>
    {:else}
      <ul class="mt-4 space-y-2">
        {#each results as row (row.id)}
          <li class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-black/10 bg-white px-4 py-3">
            <div class="min-w-0">
              <p class="font-bold leading-snug">{row.name}</p>
              <p class="break-all text-sm text-gray-600">{row.email}{row.phone ? ` · ${row.phone}` : ""}</p>
              <p class="mt-1 text-sm text-gray-600">
                {formatShortDate(row.shift.starts_at)} · {shiftLabel(row.shift)}
                {#if row.shift.title}
                  · {formatTimeRange(row.shift.starts_at, row.shift.ends_at)}
                {/if}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full px-2 py-0.5 text-xs font-bold {row.role === 'lead' ? 'bg-purple-100 text-purple-700' : 'bg-teal-50 text-teal-700'}">
                {row.role === "lead" ? "Lead" : "Volunteer"}
              </span>
              {#if row.checked_in}
                <span class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  Checked in
                </span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <div class="mt-5 rounded-md border border-black/10 bg-gray-50 p-4">
    <h4 class="font-bold">Export registrations (CSV)</h4>
    <div class="mt-3 flex flex-wrap items-end gap-3">
      <label class="block text-xs font-bold text-gray-700">
        From
        <input
          type="date"
          class="mt-1 block min-h-10 rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
          bind:value={exportStart}
        />
      </label>
      <label class="block text-xs font-bold text-gray-700">
        To
        <input
          type="date"
          class="mt-1 block min-h-10 rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
          bind:value={exportEnd}
        />
      </label>
      <button
        type="button"
        class="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#1E1E1E] px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        onclick={exportRangeCsv}
        disabled={isExporting || !exportStart || !exportEnd}
      >
        {#if isExporting}
          <span class="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true"></span>
          Exporting
        {:else}
          <Download class="h-4 w-4" aria-hidden="true" />
          Download CSV
        {/if}
      </button>
    </div>
    {#if exportError}
      <div class="mt-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
        <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{exportError}</span>
      </div>
    {/if}
  </div>
</Panel>
