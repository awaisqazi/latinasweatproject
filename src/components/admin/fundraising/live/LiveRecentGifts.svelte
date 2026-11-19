<script>
  // The newest Zeffy payments. Staff-only data: names and emails here never
  // go on a public page. This year's top donors are in LiveTopDonors.svelte.
  import EmptyState from "../../ui/EmptyState.svelte";
  import Panel from "../../ui/Panel.svelte";
  import { formatChicagoDateTimeLabel } from "../../../../lib/dashboard/timeclock";
  import { formatCents } from "../../../../lib/dashboard/givingAdmin";

  export let recent = [];
  export let idPrefix = "fundraising-live";
  export let onOpenDonorEmail = () => {};

  function donorLabel(row) {
    return row.name || row.email || "Anonymous";
  }
</script>

<Panel title="Recent payments" id={`${idPrefix}-recent-title`}>
  {#if recent.length}
    <div class="space-y-2">
      {#each recent as gift, index (`${gift.id}|${index}`)}
        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40 hover:shadow-card disabled:cursor-default disabled:hover:border-ink/8 disabled:hover:shadow-none"
          disabled={!gift.email}
          onclick={() => onOpenDonorEmail(gift.email)}
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate font-bold leading-snug text-ink">{donorLabel(gift)}</span>
            <span class="mt-0.5 block truncate text-xs text-ink/50">
              {[gift.campaignTitle, gift.createdAt ? formatChicagoDateTimeLabel(gift.createdAt) : ""].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span class="text-sm font-bold tabular-nums text-ink">{formatCents(gift.amountCents)}</span>
        </button>
      {/each}
    </div>
    <p class="mt-3 text-xs text-ink/50">Times are Chicago time. Amounts are net of refunds.</p>
  {:else}
    <EmptyState title="No payments yet" message="New Zeffy payments show up here within a few minutes." />
  {/if}
</Panel>
