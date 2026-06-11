<script>
  import EmptyState from "./EmptyState.svelte";
  import SkeletonRow from "./SkeletonRow.svelte";
  import SkeletonCard from "./SkeletonCard.svelte";

  // Responsive table: real <table> at md and up, caller-provided card list
  // below (via the `card` slot), generic stacked rows as the fallback.
  export let columns = []; // [{ key, label, class?, hideBelow? ("lg"|"xl"), sortable? }]
  export let rows = [];
  export let rowKey = "id";
  export let loading = false;
  export let skeletonRows = 5;
  export let emptyTitle = "Nothing here yet";
  export let emptyMessage = "";
  export let onRowClick = null;
  export let minWidth = "";
  // Header-click sorting (opt in per column with sortable: true).
  export let sortField = "";
  export let sortDirection = "asc";
  export let onSort = null;
  let className = "";
  export { className as class };

  const HIDE = { lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" };

  $: colClass = (column) =>
    `${column.class || ""} ${column.hideBelow ? HIDE[column.hideBelow] || "" : ""}`;

  function handleRowKeydown(event, row) {
    if (!onRowClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onRowClick(row);
    }
  }
</script>

{#if loading}
  <div class="hidden overflow-hidden rounded-card border border-ink/8 bg-white shadow-card md:block">
    {#each Array(skeletonRows) as _, i (i)}
      <SkeletonRow columns={Math.min(columns.length, 6)} />
    {/each}
  </div>
  <div class="space-y-2 md:hidden">
    {#each Array(Math.min(skeletonRows, 3)) as _, i (i)}
      <SkeletonCard lines={3} />
    {/each}
  </div>
{:else if !rows.length}
  {#if $$slots.empty}
    <slot name="empty" />
  {:else}
    <EmptyState title={emptyTitle} message={emptyMessage} />
  {/if}
{:else}
  <!-- Desktop table -->
  <div class="thin-scroll hidden overflow-x-auto rounded-card border border-ink/8 bg-white shadow-card md:block {className}">
    <table class="w-full text-left text-sm" style={minWidth ? `min-width:${minWidth}` : ""}>
      <thead>
        <tr class="border-b border-ink/10 bg-canvas/70">
          {#each columns as column (column.key)}
            <th
              scope="col"
              aria-sort={column.sortable && sortField === column.key
                ? sortDirection === "asc"
                  ? "ascending"
                  : "descending"
                : undefined}
              class="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65 {colClass(column)}"
            >
              {#if column.sortable && onSort}
                <button
                  type="button"
                  class="inline-flex items-center gap-1 uppercase tracking-[0.1em] transition-colors hover:text-ink {sortField === column.key ? 'text-ink' : ''}"
                  onclick={() => onSort(column.key)}
                >
                  {column.label}
                  <span aria-hidden="true" class="text-[10px]">
                    {sortField === column.key ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                  </span>
                </button>
              {:else}
                {column.label}
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row[rowKey])}
          <tr
            class="border-b border-ink/6 last:border-b-0 {onRowClick ? 'cursor-pointer transition-colors hover:bg-accent-soft/50 focus-visible:bg-accent-soft/50' : ''}"
            tabindex={onRowClick ? 0 : undefined}
            onclick={onRowClick ? () => onRowClick(row) : undefined}
            onkeydown={onRowClick ? (event) => handleRowKeydown(event, row) : undefined}
          >
            {#each columns as column (column.key)}
              <td class="px-4 py-3 align-middle text-ink/80 {colClass(column)}">
                <slot name="cell" {row} {column}>{row[column.key] ?? ""}</slot>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Mobile cards -->
  <div class="space-y-2 md:hidden">
    {#each rows as row (row[rowKey])}
      {#if $$slots.card}
        <slot name="card" {row} />
      {:else}
        <button
          type="button"
          class="block w-full rounded-card border border-ink/8 bg-white p-4 text-left shadow-card {onRowClick ? '' : 'pointer-events-none'}"
          onclick={onRowClick ? () => onRowClick(row) : undefined}
          tabindex={onRowClick ? 0 : -1}
        >
          <dl class="space-y-1.5">
            {#each columns.filter((c) => !c.hideBelow) as column (column.key)}
              <div class="flex items-baseline justify-between gap-3">
                <dt class="text-[11px] font-semibold uppercase tracking-wide text-ink/65">{column.label}</dt>
                <dd class="min-w-0 truncate text-right text-sm text-ink/85">
                  <slot name="cell" {row} {column}>{row[column.key] ?? ""}</slot>
                </dd>
              </div>
            {/each}
          </dl>
        </button>
      {/if}
    {/each}
  </div>
{/if}
