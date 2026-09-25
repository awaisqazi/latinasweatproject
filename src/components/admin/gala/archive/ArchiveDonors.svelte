<script>
  // Gala 2025 archive: Donors tab. One row per donor (grouped by paddle,
  // then email, then name; see groupDonors in galaMath.js), sortable and
  // searchable. Clicking a row opens that donor's individual gifts.
  import Panel from "../../ui/Panel.svelte";
  import DataTable from "../../ui/DataTable.svelte";
  import SearchInput from "../../ui/SearchInput.svelte";
  import Badge from "../../ui/Badge.svelte";
  import SlideOver from "../../marketing/SlideOver.svelte";
  import {
    groupDonors,
    formatMoney,
    formatDateCT,
    formatTimeCT,
  } from "../../../../lib/dashboard/galaMath.js";

  let { guests = [], donations = [] } = $props();

  let search = $state("");
  let sortField = $state("total");
  let sortDirection = $state("desc");
  let selectedKey = $state(null);

  const donors = $derived(groupDonors(donations, guests));

  const filtered = $derived.by(() => {
    const query = search.trim().toLowerCase();
    if (!query) return donors;
    return donors.filter((donor) =>
      [donor.donorName, donor.email, donor.phone, donor.paddleNumber, donor.tableLabel]
        .filter((v) => v !== null && v !== undefined)
        .some((v) => String(v).toLowerCase().includes(query)),
    );
  });

  const sorted = $derived.by(() => {
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av = a[sortField];
      let bv = b[sortField];
      if (sortField === "donorName") {
        av = (av || "").toLowerCase();
        bv = (bv || "").toLowerCase();
      }
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return av > bv ? dir : -dir;
    });
  });

  const selectedDonor = $derived(sorted.find((d) => d.key === selectedKey) ?? donors.find((d) => d.key === selectedKey) ?? null);

  const columns = [
    { key: "donorName", label: "Donor", sortable: true },
    { key: "paddleNumber", label: "Paddle", sortable: true, class: "text-right", hideBelow: "lg" },
    { key: "email", label: "Email", hideBelow: "lg" },
    { key: "phone", label: "Phone", hideBelow: "xl" },
    { key: "giftCount", label: "Gifts", sortable: true, class: "text-right" },
    { key: "total", label: "Total", sortable: true, class: "text-right" },
  ];

  function handleSort(field) {
    if (sortField === field) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDirection = field === "donorName" ? "asc" : "desc";
    }
  }

  function openDonor(donor) {
    selectedKey = donor.key;
  }

  function closeDonor() {
    selectedKey = null;
  }
</script>

<Panel title="Donors" id="archive-donors">
  <svelte:fragment slot="actions">
    <SearchInput
      value={search}
      onSearch={(q) => (search = q)}
      placeholder="Search donors"
      label="Search donors by name, email, phone or paddle"
      class="w-56"
    />
  </svelte:fragment>

  <DataTable
    columns={columns}
    rows={sorted}
    rowKey="key"
    minWidth="48rem"
    emptyTitle={search ? "No matching donors" : "No donors yet"}
    emptyMessage={search ? `Nobody matches "${search}".` : "Donor totals appear here once gifts are recorded."}
    sortField={sortField}
    sortDirection={sortDirection}
    onSort={handleSort}
    onRowClick={openDonor}
  >
    <svelte:fragment slot="cell" let:row let:column>
      {#if column.key === "donorName"}
        <p class="font-bold leading-snug text-ink">{row.donorName}</p>
        {#if row.allAnonymous}
          <Badge tone="neutral" size="xs" class="mt-1">Anonymous on screen</Badge>
        {:else if row.anonymousCount > 0}
          <Badge tone="amber" size="xs" class="mt-1">Some gifts anonymous</Badge>
        {/if}
      {:else if column.key === "paddleNumber"}
        {row.paddleNumber ?? "–"}
      {:else if column.key === "total"}
        <span class="font-semibold tabular-nums">{formatMoney(row.total)}</span>
      {:else}
        {row[column.key] || "–"}
      {/if}
    </svelte:fragment>

    <svelte:fragment slot="card" let:row>
      <div class="rounded-card border border-ink/8 bg-white p-4 shadow-card">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-bold leading-snug text-ink">{row.donorName}</p>
            <p class="mt-0.5 truncate text-xs text-ink/55">{row.email || "No email on file"}</p>
          </div>
          <span class="shrink-0 font-semibold tabular-nums text-ink">{formatMoney(row.total)}</span>
        </div>
        <p class="mt-2 text-xs text-ink/60">
          Paddle {row.paddleNumber ?? "–"} &middot; {row.giftCount} gift{row.giftCount === 1 ? "" : "s"}
        </p>
      </div>
    </svelte:fragment>
  </DataTable>
</Panel>

<SlideOver
  open={selectedKey !== null}
  title={selectedDonor?.donorName || "Donor"}
  eyebrow="Gala 2025 · Donor detail"
  closeLabel="Close donor detail"
  onClose={closeDonor}
>
  {#if selectedDonor}
    <div class="space-y-4 px-5 py-5">
      <div class="rounded-control border border-ink/8 bg-canvas/60 px-4 py-3 text-sm">
        <p class="font-bold text-ink">{formatMoney(selectedDonor.total)} total, {selectedDonor.giftCount} gift{selectedDonor.giftCount === 1 ? "" : "s"}</p>
        <p class="mt-1 text-ink/65">
          {selectedDonor.email || "No email on file"}{selectedDonor.phone ? ` · ${selectedDonor.phone}` : ""}
        </p>
        {#if selectedDonor.paddleNumber !== null && selectedDonor.paddleNumber !== undefined}
          <p class="mt-1 text-ink/65">Paddle {selectedDonor.paddleNumber}{selectedDonor.tableLabel ? ` · ${selectedDonor.tableLabel}` : ""}</p>
        {/if}
      </div>

      <ul class="space-y-2">
        {#each selectedDonor.gifts as gift (gift.id)}
          <li class="rounded-control border border-ink/8 bg-white px-3.5 py-2.5 text-sm">
            <div class="flex items-center justify-between gap-2">
              <span class="font-semibold text-ink">{formatMoney(gift.amount)}</span>
              <span class="text-xs text-ink/55">{formatDateCT(gift.createdAt)} &middot; {formatTimeCT(gift.createdAt)}</span>
            </div>
            <p class="mt-1 text-xs text-ink/60">
              {gift.kind === "ticket_sales" ? "Ticket sales" : gift.kind === "external" ? "Other gift" : "Paddle pledge"}
              {gift.hidden ? " · hidden from screen" : ""}
              {gift.anonymous ? " · shown as anonymous" : ""}
            </p>
            {#if gift.note}
              <p class="mt-1 text-xs italic text-ink/50">{gift.note}</p>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</SlideOver>
