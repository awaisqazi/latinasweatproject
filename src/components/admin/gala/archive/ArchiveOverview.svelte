<script>
  // Gala 2025 archive: Overview tab. Final totals only, split the way 2025
  // actually recorded money (paddle pledges, other gifts, hand-entered
  // ticket sales kept off the big screen) plus attendance and donor count.
  // Pure presentation: every number comes from buildArchiveSummary()
  // (src/lib/dashboard/galaMath.js), never computed here.
  import {
    CircleCheck,
    HandCoins,
    Gift,
    Ticket,
    Users,
    TrendingUp,
    Trophy,
    UserCheck,
    TriangleAlert,
  } from "@lucide/svelte";
  import Panel from "../../ui/Panel.svelte";
  import StatCard from "../../ui/StatCard.svelte";
  import Badge from "../../ui/Badge.svelte";
  import { buildArchiveSummary, formatMoney } from "../../../../lib/dashboard/galaMath.js";

  let { event = null, guests = [], donations = [] } = $props();

  const summary = $derived(buildArchiveSummary(guests, donations));

  const reconciliation = $derived.by(() => {
    const frozen = event && event.summary && typeof event.summary === "object" ? event.summary : null;
    if (!frozen || typeof frozen.total_all !== "number") return null;
    const recomputed = summary.sumAll;
    const matches = Math.abs(recomputed - frozen.total_all) < 0.01;
    return { matches, recomputed, frozen: frozen.total_all };
  });
</script>

<div class="space-y-4">
  {#if reconciliation}
    <div
      class="flex items-center gap-2 rounded-control border px-3.5 py-2.5 text-sm {reconciliation.matches
        ? 'border-green-200 bg-green-50 text-green-800'
        : 'border-amber-200 bg-amber-50 text-amber-800'}"
    >
      {#if reconciliation.matches}
        <CircleCheck class="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Recomputed totals match the frozen summary: {formatMoney(reconciliation.recomputed)}.</span>
      {:else}
        <TriangleAlert class="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Recomputed total {formatMoney(reconciliation.recomputed)} does not match the frozen summary
          {formatMoney(reconciliation.frozen)}.
        </span>
      {/if}
    </div>
  {/if}

  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="All recorded revenue" value={formatMoney(summary.sumAll)} icon={TrendingUp} tone="gold" hint="Every 2025 gift, pledges, other gifts and ticket sales" />
    <StatCard
      label="Shown on the big screen"
      value={formatMoney(summary.sumPublic)}
      icon={CircleCheck}
      tone="teal"
      hint={summary.sumHidden > 0 ? `${formatMoney(summary.sumHidden)} recorded but hidden` : "Nothing was hidden"}
    />
    <StatCard label="Paddle pledges" value={formatMoney(summary.pledgeTotal)} icon={HandCoins} tone="gold" />
    <StatCard label="Other gifts" value={formatMoney(summary.externalTotal)} icon={Gift} tone="teal" />
    <StatCard label="Ticket sales, hidden" value={formatMoney(summary.ticketSalesTotal)} icon={Ticket} tone="neutral" hint="Hand-entered, never shown on screen" />
    <StatCard label="Donors" value={summary.donorCount} icon={Users} tone="gold" hint={`${summary.giftCount} gift${summary.giftCount === 1 ? "" : "s"} recorded`} />
    <StatCard
      label="Average pledge"
      value={formatMoney(summary.averageGift)}
      icon={HandCoins}
      tone="teal"
      hint={`${summary.pledgeGiftCount} pledge${summary.pledgeGiftCount === 1 ? "" : "s"}, ticket sales excluded`}
    />
    <StatCard
      label="Largest pledge"
      value={summary.largestGift ? formatMoney(summary.largestGift.amount) : formatMoney(0)}
      icon={Trophy}
      tone="gold"
      hint={summary.largestGift ? summary.largestGift.donorName || "Anonymous" : "No pledges recorded"}
    />
  </div>

  <Panel title="Attendance and paddles" id="archive-attendance">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        label="Checked in"
        value={`${summary.guestsArrived} / ${summary.guestsExpected}`}
        icon={UserCheck}
        tone="teal"
        hint={`${summary.partyCount} part${summary.partyCount === 1 ? "y" : "ies"} on the list`}
      />
      <StatCard label="Paddles issued" value={summary.paddlesIssued} icon={Users} tone="gold" />
      {#if summary.voidedCount > 0}
        <StatCard
          label="Voided gifts"
          value={summary.voidedCount}
          icon={TriangleAlert}
          tone="rose"
          hint={`${formatMoney(summary.voidedTotal)} excluded from every total above`}
        />
      {:else}
        <div class="flex items-center rounded-card border border-dashed border-ink/15 bg-canvas/60 px-4 py-3 text-sm text-ink/60">
          <Badge tone="green" size="xs">No voided gifts</Badge>
        </div>
      {/if}
    </div>
  </Panel>
</div>
