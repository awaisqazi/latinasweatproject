<script>
  // Thirteen months of Zeffy payments as plain CSS bars, oldest on the left.
  // The current month is still in progress, so it is drawn lighter.
  import Panel from "../../ui/Panel.svelte";
  import {
    formatCentsCompact,
    countLabel,
    formatCentsWhole,
    monthLabel,
    monthYearMark,
  } from "../../../../lib/dashboard/fundraisingLive";

  export let months = []; // fillMonths() output

  $: maxCents = months.reduce((max, row) => Math.max(max, row.amountCents), 0);
  $: best = months.reduce((top, row) => (!top || row.amountCents > top.amountCents ? row : top), null);
  $: current = months.find((row) => row.isCurrent) || null;
  $: totalCents = months.reduce((sum, row) => sum + row.amountCents, 0);

  function heightFor(cents, max) {
    if (!max || !cents) return 0;
    return Math.max(2, Math.round((cents / max) * 100));
  }

  function giftsLabel(count) {
    return countLabel(count, "payment");
  }
</script>

<Panel title="Month by month" id="fundraising-live-months-title">
  {#if totalCents > 0}
    <div class="flex items-stretch gap-2">
      <div class="flex h-40 flex-col justify-between pb-[34px] text-right text-[11px] font-semibold tabular-nums text-ink/45" aria-hidden="true">
        <span>{formatCentsCompact(maxCents)}</span>
        <span>$0</span>
      </div>
      <ul class="flex h-40 min-w-0 flex-1 items-end gap-1 sm:gap-1.5" aria-label="Zeffy payments by month, last 13 months">
        {#each months as row, index (row.month)}
          {@const yearMark = monthYearMark(row.month, index === 0)}
          <li
            class="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            aria-label={`${monthLabel(row.month, { withYear: true })}${row.isCurrent ? " so far" : ""}: ${formatCentsWhole(row.amountCents)} from ${giftsLabel(row.giftCount)}`}
            title={`${monthLabel(row.month, { withYear: true })}: ${formatCentsWhole(row.amountCents)} · ${giftsLabel(row.giftCount)}`}
          >
            <span class="relative block w-full flex-1 border-b border-ink/12">
              <span
                class="absolute inset-x-0 bottom-0 block rounded-t-[3px] {row.isCurrent ? 'bg-accent/45' : 'bg-accent'}"
                style="height: {heightFor(row.amountCents, maxCents)}%"
              ></span>
            </span>
            <span class="mt-1.5 h-3.5 text-[10px] font-semibold leading-none text-ink/55 sm:text-[11px]" aria-hidden="true">
              {monthLabel(row.month).slice(0, 1)}<span class="hidden sm:inline">{monthLabel(row.month).slice(1)}</span>
            </span>
            <span class="mt-0.5 h-3 whitespace-nowrap text-[10px] font-semibold leading-none text-ink/45" aria-hidden="true">{yearMark}</span>
          </li>
        {/each}
      </ul>
    </div>

    <dl class="mt-4 grid gap-3 sm:grid-cols-3">
      <div>
        <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Best month</dt>
        <dd class="mt-1 text-sm text-ink/80">
          {best ? `${monthLabel(best.month, { withYear: true })} · ${formatCentsWhole(best.amountCents)}` : "n/a"}
        </dd>
      </div>
      <div>
        <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">This month so far</dt>
        <dd class="mt-1 text-sm text-ink/80">
          {current ? `${formatCentsWhole(current.amountCents)} · ${giftsLabel(current.giftCount)}` : "n/a"}
        </dd>
      </div>
      <div>
        <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">13 months</dt>
        <dd class="mt-1 text-sm text-ink/80">{formatCentsWhole(totalCents)}</dd>
      </div>
    </dl>
  {:else}
    <p class="text-sm text-ink/60">No Zeffy payments in the last 13 months yet.</p>
  {/if}
</Panel>
