<script>
  // Overview block 2: what changed lately? Today, the last 7 days, this
  // month and this year so far, a low strip of month-by-month bars, and the
  // five newest payments ("Show all" for the rest). Zeffy data only, plus
  // committed grants in the year figure when the live grants block is there.
  // Names and emails here are staff-only and never printed.
  import Panel from "../../../ui/Panel.svelte";
  import { formatChicagoDateTimeLabel } from "../../../../../lib/dashboard/timeclock";
  import { formatCents } from "../../../../../lib/dashboard/givingAdmin";
  import {
    countLabel,
    formatCentsWhole,
    monthLabel,
  } from "../../../../../lib/dashboard/fundraisingLive";

  export let view = null; // LiveData's view
  export let onOpenDonorEmail = () => {};

  const RECENT_SHOWN = 5;
  let showAllRecent = false;

  $: totals = view?.totals || {};
  $: ytdCombined = view?.combined?.yearToDate || null;
  $: ytdGrants = ytdCombined && ytdCombined.grantsCents ? ytdCombined.grantsCents : 0;
  $: figures = [
    { key: "today", label: "Today", total: totals.today, hint: "" },
    { key: "week", label: "Last 7 days", total: totals.last7Days, hint: "" },
    { key: "month", label: "This month", total: totals.monthToDate, hint: "" },
    {
      key: "year",
      label: "This year so far",
      total: ytdGrants && ytdCombined ? { amountCents: ytdCombined.amountCents, giftCount: null } : totals.yearToDate,
      hint: ytdGrants ? `with ${formatCentsWhole(ytdGrants)} in grants` : "",
      countFrom: totals.yearToDate,
    },
  ];
  $: months = view?.months || [];
  $: maxCents = months.reduce((max, row) => Math.max(max, row.amountCents), 0);
  $: best = months.reduce((top, row) => (!top || row.amountCents > top.amountCents ? row : top), null);
  $: recent = view?.live?.recent || [];
  $: recentShown = showAllRecent ? recent : recent.slice(0, RECENT_SHOWN);

  function money(total) {
    return total ? formatCentsWhole(total.amountCents) : "n/a";
  }

  function hintFor(figure) {
    if (figure.hint) return figure.hint;
    const source = figure.countFrom || figure.total;
    if (!source || source.giftCount === null || source.giftCount === undefined) return "";
    return countLabel(source.giftCount, "payment");
  }

  function heightFor(cents, max) {
    if (!max || !cents) return 0;
    return Math.max(4, Math.round((cents / max) * 100));
  }
</script>

<Panel title="Lately" id="fundraising-lately-title">
  <dl class="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
    {#each figures as figure (figure.key)}
      <div class="min-w-0">
        <dt class="text-sm text-ink/60">{figure.label}</dt>
        <dd class="mt-0.5 text-xl font-bold tabular-nums text-ink">{money(figure.total)}</dd>
        <dd class="text-xs text-ink/55">{hintFor(figure)}</dd>
      </div>
    {/each}
  </dl>

  {#if maxCents > 0}
    <div class="mt-4">
      <ul class="flex h-10 items-end gap-[3px]" aria-label="Zeffy payments by month, last 13 months">
        {#each months as row (row.month)}
          <li
            class="flex h-full min-w-0 flex-1 items-end"
            aria-label={`${monthLabel(row.month, { withYear: true })}${row.isCurrent ? " so far" : ""}: ${formatCentsWhole(row.amountCents)}`}
          >
            <span
              class="block w-full rounded-t-[2px] {row.isCurrent ? 'bg-accent/45' : 'bg-accent/80'}"
              style="height: {heightFor(row.amountCents, maxCents)}%"
            ></span>
          </li>
        {/each}
      </ul>
      <div class="mt-1 flex justify-between text-[11px] font-semibold text-ink/50" aria-hidden="true">
        <span>{monthLabel(months[0]?.month, { withYear: true })}</span>
        <span>{monthLabel(months[months.length - 1]?.month, { withYear: true })}</span>
      </div>
      {#if best}
        <p class="mt-1 text-xs text-ink/60">
          Best month: {monthLabel(best.month, { withYear: true })}, {formatCentsWhole(best.amountCents)}.
        </p>
      {/if}
    </div>
  {/if}

  <h4 class="mt-4 text-sm font-bold text-ink">Newest payments</h4>
  {#if recent.length}
    <ul class="mt-1">
      {#each recentShown as gift, index (`${gift.id}|${index}`)}
        <li>
          <button
            type="button"
            class="flex min-h-11 w-full items-center gap-3 rounded-control px-2 py-1.5 text-left hover:bg-ink/[0.03] disabled:cursor-default disabled:hover:bg-transparent"
            disabled={!gift.email}
            onclick={() => onOpenDonorEmail(gift.email)}
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold text-ink">{gift.name || gift.email || "Anonymous"}</span>
              <span class="block truncate text-xs text-ink/50">
                {[gift.campaignTitle, gift.createdAt ? formatChicagoDateTimeLabel(gift.createdAt) : ""].filter(Boolean).join(", ")}
              </span>
            </span>
            <span class="shrink-0 text-sm font-bold tabular-nums text-ink">{formatCents(gift.amountCents)}</span>
          </button>
        </li>
      {/each}
    </ul>
    {#if recent.length > RECENT_SHOWN}
      <button
        type="button"
        class="mt-1 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-2 hover:decoration-ink/60"
        aria-expanded={showAllRecent}
        onclick={() => (showAllRecent = !showAllRecent)}
      >
        {showAllRecent ? "Show fewer" : `Show all ${recent.length}`}
      </button>
    {/if}
    <p class="mt-1 px-2 text-xs text-ink/50">Chicago time. Amounts are net of refunds.</p>
  {:else}
    <p class="mt-1 text-sm text-ink/60">No payments yet. New Zeffy payments show up here within a few minutes.</p>
  {/if}
</Panel>
