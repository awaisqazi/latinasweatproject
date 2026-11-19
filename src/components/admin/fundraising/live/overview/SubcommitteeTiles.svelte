<script>
  // Overview block 4: the four subcommittees as compact tiles. Name,
  // co-leads, one headline number and the first lines of this month's
  // update. The whole tile opens the subcommittee's tab. `tiles` is
  // subcommitteeTiles() output, worked out in FundraisingLiveOverview.
  import { updatePreview } from "../../../../../lib/dashboard/fundraisingAttention";

  export let tiles = [];
  export let monthName = "";
  export let onOpenTab = () => {};
</script>

<section aria-labelledby="fundraising-subcommittees-title">
  <h3 id="fundraising-subcommittees-title" class="sr-only">Subcommittees</h3>
  <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {#each tiles as tile (tile.id)}
      <li class="min-w-0">
        <button
          type="button"
          class="flex h-full min-h-11 w-full flex-col rounded-card border border-ink/8 bg-white p-4 text-left shadow-card transition hover:border-accent/40"
          onclick={() => onOpenTab(tile.id)}
        >
          <span class="block text-base font-bold leading-snug text-ink">{tile.name}</span>
          <span class="block text-xs text-ink/55">{tile.coLeads}</span>
          <span class="mt-3 block text-2xl font-bold tabular-nums leading-none text-ink">{tile.value}</span>
          <span class="mt-1 block text-sm leading-snug text-ink/65">{tile.label}</span>
          <span class="mt-3 block text-sm leading-snug {tile.update ? 'text-ink/80' : 'text-ink/50'}">
            {tile.update ? updatePreview(tile.update.body) : `No update for ${monthName || "this month"} yet`}
          </span>
        </button>
      </li>
    {/each}
  </ul>
</section>
