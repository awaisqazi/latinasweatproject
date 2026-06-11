<script>
  import EmptyState from "./EmptyState.svelte";
  import SkeletonRow from "./SkeletonRow.svelte";
  import SkeletonCard from "./SkeletonCard.svelte";

  // Responsive table: real <table> at md and up, caller-provided card list
  // below (via the `card` slot), generic stacked rows as the fallback.
  export let columns = []; // [{ key, label, class?, hideBelow? ("lg"|"xl") }]
  export let rows = [];
  export let rowKey = "id";
  export let loading = false;
  export let skeletonRows = 5;
  export let emptyTitle = "Nothing here yet";
  export let emptyMessage = "";
  export let onRowClick = null;
  export let minWidth = "";
  let className = "";
  export { className as class };

  const HIDE = { lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" };

  $: colClass = (column) =>
    `${column.class || ""} ${column.hideBelow ? HIDE[column.hideBelow] || "" : ""}`;
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
              class="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/50 {colClass(column)}"
            >
              {column.label}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row[rowKey])}
          <tr
            class="border-b border-ink/6 last:border-b-0 {onRowClick ? 'cursor-pointer transition-colors hover:bg-accent-soft/50' : ''}"
            onclick={onRowClick ? () => onRowClick(row) : undefined}
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
                <dt class="text-[11px] font-semibold uppercase tracking-wide text-ink/45">{column.label}</dt>
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
