<script>
  // The newest Zeffy gifts and this year's top donors. Staff-only data:
  // names and emails here never go on a public page.
  import EmptyState from "../../ui/EmptyState.svelte";
  import Panel from "../../ui/Panel.svelte";
  import { formatChicagoDateLabel, formatChicagoDateTimeLabel } from "../../../../lib/dashboard/timeclock";
  import { formatCents } from "../../../../lib/dashboard/givingAdmin";
  import { formatCentsWhole } from "../../../../lib/dashboard/fundraisingLive";

  export let recent = [];
  export let topDonors = [];
  export let hasTopDonors = false;
  export let onOpenDonorEmail = () => {};

  function donorLabel(row) {
    return row.name || row.email || "Anonymous";
  }
</script>

<div class="grid gap-4 {hasTopDonors ? 'xl:grid-cols-[3fr_2fr]' : ''}">
  <Panel title="Recent gifts" id="fundraising-live-recent-title">
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
      <EmptyState title="No gifts yet" message="New Zeffy gifts show up here within a few minutes." />
    {/if}
  </Panel>

  {#if hasTopDonors}
    <Panel title="Top donors this year" id="fundraising-live-top-title">
      {#if topDonors.length}
        <div class="space-y-2">
          {#each topDonors as donor, index (`${donor.email}|${index}`)}
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40 hover:shadow-card disabled:cursor-default disabled:hover:border-ink/8 disabled:hover:shadow-none"
              disabled={!donor.email}
              onclick={() => onOpenDonorEmail(donor.email)}
            >
              <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink" aria-hidden="true">
                {index + 1}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-bold leading-snug text-ink">{donorLabel(donor)}</span>
                <span class="mt-0.5 block truncate text-xs text-ink/50">
                  {[
                    donor.giftCount === null ? "" : `${donor.giftCount} gift${donor.giftCount === 1 ? "" : "s"}`,
                    donor.lastGiftAt ? `last ${formatChicagoDateLabel(donor.lastGiftAt)}` : "",
                  ].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span class="text-sm font-bold tabular-nums text-ink">{formatCentsWhole(donor.amountCents)}</span>
            </button>
          {/each}
        </div>
      {:else}
        <EmptyState title="No donors this year yet" message="Top donors appear after the first gift of the year." />
      {/if}
    </Panel>
  {/if}
</div>
