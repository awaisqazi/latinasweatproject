<script>
  // This year's top donors from the live Zeffy data. Staff-only data: names
  // and emails here never go on a public page.
  import EmptyState from "../../ui/EmptyState.svelte";
  import Panel from "../../ui/Panel.svelte";
  import { formatChicagoDateLabel } from "../../../../lib/dashboard/timeclock";
  import { formatCentsWhole } from "../../../../lib/dashboard/fundraisingLive";

  export let topDonors = [];
  export let onOpenDonorEmail = () => {};

  function donorLabel(row) {
    return row.name || row.email || "Anonymous";
  }
</script>

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
            {#if donor.name && donor.email}
              <span class="mt-0.5 block truncate text-xs text-ink/55">{donor.email}</span>
            {/if}
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
