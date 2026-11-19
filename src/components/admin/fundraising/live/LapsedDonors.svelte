<script>
  // Donor Engagement > Lapsed: donors who gave last year and not yet this
  // year, biggest last year first, from the live Zeffy data. Each row opens
  // the donor drawer.
  import Button from "../../ui/Button.svelte";
  import EmptyState from "../../ui/EmptyState.svelte";
  import Panel from "../../ui/Panel.svelte";
  import { formatChicagoDateLabel } from "../../../../lib/dashboard/timeclock";
  import { formatCentsWhole } from "../../../../lib/dashboard/fundraisingLive";

  export let view = null; // LiveData's view
  export let onOpenDonorEmail = () => {};

  const COLLAPSED = 25;
  let showAll = false;

  $: lapsed = view?.live?.lapsed || [];
  $: hasLapsed = Boolean(view?.connected && view?.live?.hasLapsed);
  $: shown = showAll ? lapsed : lapsed.slice(0, COLLAPSED);
  $: lapsedCount = view?.live?.donors?.lapsedCount;

  function donorLabel(row) {
    return row.name || row.email || "Unnamed donor";
  }
</script>

<Panel title="Lapsed donors, biggest last year first" id="fundraising-lapsed-title">
  {#if !view || view.status === "loading"}
    <p class="text-sm text-ink/60">Loading the live Zeffy numbers…</p>
  {:else if view.status === "forbidden"}
    <p class="text-sm text-ink/60">The lapsed list comes from the live Zeffy data, which your account does not have access to.</p>
  {:else if !view.connected}
    <p class="text-sm text-ink/60">The lapsed list comes from the live Zeffy data, which is not connected yet.</p>
  {:else if !hasLapsed}
    <p class="text-sm text-ink/60">The live Zeffy data does not include a lapsed list yet.</p>
  {:else if lapsed.length}
    <p class="-mt-2 mb-4 text-sm text-ink/60">
      Gave last year, not yet this year.{#if lapsedCount !== null && lapsedCount !== undefined && lapsedCount > lapsed.length}{" "}Showing the {lapsed.length.toLocaleString()} biggest of {lapsedCount.toLocaleString()}.{/if}
    </p>
    <div class="space-y-2">
      {#each shown as row, index (`${row.email}|${index}`)}
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40 hover:shadow-card disabled:cursor-default disabled:hover:border-ink/8 disabled:hover:shadow-none"
          disabled={!row.email}
          onclick={() => onOpenDonorEmail(row.email)}
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate font-bold leading-snug text-ink">{donorLabel(row)}</span>
            {#if row.name && row.email}
              <span class="mt-0.5 block truncate text-xs text-ink/55">{row.email}</span>
            {/if}
            <span class="mt-0.5 block truncate text-xs text-ink/50">
              Last gift {row.lastGiftAt ? formatChicagoDateLabel(row.lastGiftAt) : "unknown"}
            </span>
          </span>
          <span class="text-right">
            <span class="block text-sm font-bold tabular-nums text-ink">{formatCentsWhole(row.lastYearCents)}</span>
            <span class="block text-xs text-ink/50">last year</span>
          </span>
        </button>
      {/each}
    </div>
    {#if lapsed.length > COLLAPSED}
      <div class="mt-3 flex justify-center">
        <Button size="sm" variant="ghost" onclick={() => (showAll = !showAll)}>
          {showAll ? "Show fewer" : `Show all ${lapsed.length}`}
        </Button>
      </div>
    {/if}
  {:else}
    <EmptyState title="No lapsed donors" message="Everyone who gave last year has given this year." />
  {/if}
</Panel>
