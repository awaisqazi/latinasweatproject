<script>
  // Gala 2025 archive: Guests & paddles tab. One row per party, decorated
  // with the total that paddle pledged (buildGuestRows in galaMath.js).
  // Search only, no editing: this whole folder renders zero mutating
  // controls (see docs/gala-2026/07-admin-dashboard-plan.md ADM-09).
  import Panel from "../../ui/Panel.svelte";
  import DataTable from "../../ui/DataTable.svelte";
  import SearchInput from "../../ui/SearchInput.svelte";
  import {
    buildGuestRows,
    formatMoney,
    formatTimeCT,
  } from "../../../../lib/dashboard/galaMath.js";

  let { guests = [], donations = [] } = $props();

  let search = $state("");
  let sortField = $state("paddleNumber");
  let sortDirection = $state("asc");

  const rows = $derived(buildGuestRows(guests, donations));

  const filtered = $derived.by(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    const digits = query.replace(/\D/g, "");
    return rows.filter((guest) => {
      if (String(guest.paddleNumber ?? "").includes(query)) return true;
      if (guest.fullName.toLowerCase().includes(query)) return true;
      if (guest.email.toLowerCase().includes(query)) return true;
      if (digits && guest.phone.replace(/\D/g, "").includes(digits)) return true;
      return false;
    });
  });

  const sorted = $derived.by(() => {
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av = a[sortField];
      let bv = b[sortField];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return av > bv ? dir : -dir;
    });
  });

  const columns = [
    { key: "paddleNumber", label: "Paddle", sortable: true, class: "text-right" },
    { key: "fullName", label: "Name", sortable: true },
    { key: "partySize", label: "Party size", sortable: true, class: "text-right", hideBelow: "lg" },
    { key: "checkedInCount", label: "Arrived", sortable: true, class: "text-right" },
    { key: "checkedInAt", label: "Check-in time (CT)", hideBelow: "xl" },
    { key: "email", label: "Email", hideBelow: "lg" },
    { key: "phone", label: "Phone", hideBelow: "xl" },
    { key: "originalPaddle", label: "Original paddle", class: "text-right", hideBelow: "xl" },
    { key: "totalPledged", label: "Total pledged", sortable: true, class: "text-right" },
  ];

  function handleSort(field) {
    if (sortField === field) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDirection = field === "fullName" ? "asc" : "desc";
    }
  }
</script>

<Panel title="Guests & paddles" id="archive-guests">
  <svelte:fragment slot="actions">
    <SearchInput
      value={search}
      onSearch={(q) => (search = q)}
      placeholder="Search guests"
      label="Search guests by name, phone or paddle"
      class="w-56"
    />
  </svelte:fragment>

  <DataTable
    columns={columns}
    rows={sorted}
    rowKey="id"
    minWidth="56rem"
    emptyTitle={search ? "No matching guests" : "No guests yet"}
    emptyMessage={search ? `Nobody matches "${search}".` : "The 2025 guest list appears here."}
    sortField={sortField}
    sortDirection={sortDirection}
    onSort={handleSort}
  >
    <svelte:fragment slot="cell" let:row let:column>
      {#if column.key === "fullName"}
        <p class="font-bold leading-snug text-ink">{row.fullName || "Unnamed guest"}</p>
      {:else if column.key === "paddleNumber"}
        {row.paddleNumber ?? "–"}
      {:else if column.key === "checkedInCount"}
        {row.checkedInCount} / {row.partySize}
      {:else if column.key === "checkedInAt"}
        {row.checkedInCount > 0 && row.checkedInAt ? formatTimeCT(row.checkedInAt) : "–"}
      {:else if column.key === "originalPaddle"}
        {row.originalPaddle ?? "–"}
      {:else if column.key === "totalPledged"}
        <span class="font-semibold tabular-nums">{formatMoney(row.totalPledged)}</span>
      {:else}
        {row[column.key] || "–"}
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="card" let:row>
      <div class="rounded-card border border-ink/8 bg-white p-4 shadow-card">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-bold leading-snug text-ink">{row.fullName || "Unnamed guest"}</p>
            <p class="mt-0.5 text-xs text-ink/55">Paddle {row.paddleNumber ?? "–"}</p>
          </div>
          <span class="shrink-0 font-semibold tabular-nums text-ink">{formatMoney(row.totalPledged)}</span>
        </div>
        <p class="mt-2 text-xs text-ink/60">
          {row.checkedInCount} / {row.partySize} arrived
          {row.checkedInCount > 0 && row.checkedInAt ? ` · ${formatTimeCT(row.checkedInAt)}` : ""}
        </p>
      </div>
    </svelte:fragment>
  </DataTable>
</Panel>
