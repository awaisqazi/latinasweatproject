<script>
  // A read-only table from the worksheet (the grant fit test).
  export let part;

  $: columns = part?.columns || [];
  $: rows = part?.rows || [];
</script>

<div class="hidden overflow-hidden rounded-control border border-ink/8 md:block">
  <table class="w-full text-left text-sm">
    <thead>
      <tr class="border-b border-ink/10 bg-canvas/70">
        {#each columns as column (column.key)}
          <th scope="col" class="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">{column.label}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row, i (i)}
        <tr class="border-b border-ink/8 last:border-b-0">
          {#each columns as column, c (column.key)}
            {#if c === 0}
              <th scope="row" class="px-4 py-3 font-semibold text-ink">{row.cells[column.key]}</th>
            {:else}
              <td class="px-4 py-3 text-ink/80">{row.cells[column.key]}</td>
            {/if}
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<dl class="space-y-3 rounded-control border border-ink/8 p-3 md:hidden">
  {#each rows as row, i (i)}
    <div>
      <dt class="text-sm font-semibold text-ink">{row.cells[columns[0]?.key]}</dt>
      {#each columns.slice(1) as column (column.key)}
        <dd class="mt-0.5 text-sm text-ink/80">{row.cells[column.key]}</dd>
      {/each}
    </div>
  {/each}
</dl>
