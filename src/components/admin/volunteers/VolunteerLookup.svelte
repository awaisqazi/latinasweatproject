<script>
  import { Download } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import SearchInput from "../ui/SearchInput.svelte";
  import StatCard from "../ui/StatCard.svelte";
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

  function handleSearch(query) {
    if (!query) {
      results = [];
      hasSearched = false;
      errorMessage = "";
      return;
    }
    runSearch(query);
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

  async function exportRangeCsv() {
    if (!exportStart || !exportEnd || isExporting) return;

    isExporting = true;
    exportError = "";

    const rangeStart = parseDateStr(exportStart);
    const rangeEnd = parseDateStr(exportEnd);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    // Paginate: PostgREST caps unranged selects at 1000 rows, which silently
    // truncated busy ranges before.
    const pageSize = 1000;
    const data = [];
    let pageError = null;
    for (let offset = 0; ; offset += pageSize) {
      const { data: page, error } = await supabase
        .from("shift_registrations")
        .select(
          "id, name, email, phone, role, checked_in, check_in_time, shift:volunteer_shifts!inner(id, kind, title, starts_at, ends_at, cancelled)",
        )
        .gte("shift.starts_at", rangeStart.toISOString())
        .lt("shift.starts_at", rangeEnd.toISOString())
        .order("id")
        .range(offset, offset + pageSize - 1);

      if (error) {
        pageError = error;
        break;
      }
      data.push(...(page || []));
      if (!page || page.length < pageSize) break;
    }

    if (pageError) {
      exportError = pageError.message;
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
  <SearchInput
    bind:value={searchQuery}
    placeholder="Search by name or email (2+ characters)"
    label="Search volunteers"
    debounce={300}
    minChars={2}
    loading={isSearching}
    onSearch={handleSearch}
  />

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} class="mt-4" />
  {/if}

  {#if hasSearched && !errorMessage}
    <div class="mt-4 grid grid-cols-3 gap-2">
      <StatCard label="Shifts" value={stats.totalShifts} tone="neutral" />
      <StatCard label="Hours" value={stats.totalHours} tone="teal" />
      <StatCard label="Check-ins" value={stats.checkedInCount} tone="gold" />
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
          <li class="flex flex-wrap items-center justify-between gap-2 rounded-control border border-ink/8 bg-white px-4 py-3">
            <div class="min-w-0">
              <p class="font-bold leading-snug text-ink">{row.name}</p>
              <p class="break-all text-sm text-ink/60">{row.email}{row.phone ? ` · ${row.phone}` : ""}</p>
              <p class="mt-1 text-sm text-ink/60">
                {formatShortDate(row.shift.starts_at)} · {shiftLabel(row.shift)}
                {#if row.shift.title}
                  · {formatTimeRange(row.shift.starts_at, row.shift.ends_at)}
                {/if}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Badge tone={row.role === "lead" ? "teal" : "neutral"} size="xs">
                {row.role === "lead" ? "Lead" : "Volunteer"}
              </Badge>
              {#if row.checked_in}
                <Badge tone="green" size="xs">Checked in</Badge>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <div class="mt-5 rounded-card border border-ink/8 bg-canvas p-4">
    <h4 class="font-bold text-ink">Export registrations (CSV)</h4>
    <div class="mt-3 flex flex-wrap items-end gap-3">
      <Field label="From" id="volunteer-export-start" class="w-40">
        <input
          id="volunteer-export-start"
          type="date"
          class="input"
          bind:value={exportStart}
        />
      </Field>
      <Field label="To" id="volunteer-export-end" class="w-40">
        <input
          id="volunteer-export-end"
          type="date"
          class="input"
          bind:value={exportEnd}
        />
      </Field>
      <Button
        variant="dark"
        icon={Download}
        loading={isExporting}
        disabled={!exportStart || !exportEnd}
        onclick={exportRangeCsv}
      >
        {isExporting ? "Exporting" : "Download CSV"}
      </Button>
    </div>
    {#if exportError}
      <Banner tone="error" message={exportError} class="mt-3" />
    {/if}
  </div>
</Panel>
