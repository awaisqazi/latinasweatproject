<script>
  // Fundraising > Overview, the board's view: freshness and Sync now, the
  // headline Zeffy totals, the annual goal, the subcommittee plans rolled up
  // against it, the month bars, one short scorecard per subcommittee (each
  // opens its tab) and the newest payments. The numbers come from LiveData,
  // which FundraisingView mounts once for every tab. When the live RPC is
  // missing this shows a quiet notice and the scorecards still carry what
  // does not need Zeffy.
  import {
    Banknote,
    CalendarDays,
    HandCoins,
    RefreshCw,
    TrendingUp,
  } from "@lucide/svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import GoalRollupPanel from "./live/GoalRollupPanel.svelte";
  import LiveGoalPanel from "./live/LiveGoalPanel.svelte";
  import LiveMonthlyBars from "./live/LiveMonthlyBars.svelte";
  import LiveRecentGifts from "./live/LiveRecentGifts.svelte";
  import SubcommitteeScorecards from "./live/SubcommitteeScorecards.svelte";
  import { countLabel, formatCentsWhole } from "../../../lib/dashboard/fundraisingLive";
  import { ROLLUP_CYCLE } from "../../../lib/dashboard/fundraisingRollup";

  export let supabase;
  export let view = null; // LiveData's view
  export let onOpenDonorEmail = () => {};
  export let onOpenProspect = () => {};
  export let onOpenTab = () => {};
  export let onOpenWorksheet = () => {};

  $: status = view?.status || "loading";
  $: connected = Boolean(view?.connected);
  $: totals = view?.totals || {};
  $: goal = view?.goal || null;
  $: actions = view?.actions || {};
  // Year to date and Last 12 months add committed grants when the live
  // grants block is there; Today and This month stay Zeffy only.
  $: combined = view?.combined || {};
  $: ytdWithGrants = combined.yearToDate?.grantsCents !== null && combined.yearToDate?.grantsCents !== undefined;
  $: last12WithGrants = combined.last12Months?.grantsCents !== null && combined.last12Months?.grantsCents !== undefined;
  $: rollupStatus = view?.rollup?.status || "idle";
  $: rollupVisible = rollupStatus === "ready" || rollupStatus === "error";
  // Ask for the plan roll-up each time Overview opens, so a worksheet saved
  // on another tab shows up here.
  let rollupRequested = false;
  $: if (!rollupRequested && view?.actions?.refreshRollup) {
    rollupRequested = true;
    view.actions.refreshRollup();
  }

  function moneyOrNa(total) {
    return total ? formatCentsWhole(total.amountCents) : "n/a";
  }

  function paymentsHint(total) {
    if (!total || total.giftCount === null) return "";
    return countLabel(total.giftCount, "payment");
  }

  function ytdHint(ytd, prior, change, partial) {
    if (!prior) return paymentsHint(ytd);
    const delta = change === null ? "" : ` (${change > 0 ? "+" : ""}${change}%)`;
    return `Last year by now ${formatCentsWhole(prior.amountCents)}${partial ? ", partial" : delta}`;
  }

  function monthHint(month, week) {
    const parts = [paymentsHint(month)];
    if (week) parts.push(`${formatCentsWhole(week.amountCents)} last 7 days`);
    return parts.filter(Boolean).join(" · ");
  }

  function partsHint(part) {
    return `Zeffy ${formatCentsWhole(part.zeffyCents)} · Grants committed ${formatCentsWhole(part.grantsCents)}`;
  }

  function combinedValue(part, total) {
    return part ? formatCentsWhole(part.amountCents) : moneyOrNa(total);
  }

  function last12Hint(priorYear, partial) {
    if (!priorYear) return "";
    return `${partial ? "Last year, partial" : "Last year in full"} ${formatCentsWhole(priorYear.amountCents)}`;
  }
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-3 rounded-card border border-ink/8 bg-white px-4 py-3 shadow-card">
    <p class="min-w-0 text-sm {view?.stale ? 'text-amber-800' : 'text-ink/70'}" role="status">
      {#if status === "loading"}
        Loading live Zeffy numbers…
      {:else if connected}
        <span class="font-semibold text-ink">Live from Zeffy</span>{" · "}{view.syncedAgo ? `synced ${view.syncedAgo}` : "sync time unknown"}{#if view.historyStartLabel}<span class="text-ink/50">{" · "}records from {view.historyStartLabel}</span>{/if}{#if view.refreshing}<span class="text-ink/45">{" · "}refreshing</span>{/if}
      {:else if status === "forbidden"}
        Your account does not have access to the live Zeffy numbers.
      {:else}
        Live Zeffy data is not connected yet.
      {/if}
    </p>
    {#if status !== "forbidden"}
      <Button size="sm" icon={RefreshCw} loading={Boolean(view?.syncing)} onclick={() => actions.sync?.()}>Sync now</Button>
    {/if}
  </div>

  {#if view?.healthWarning}
    <Banner tone="warning" message={view.healthWarning} />
  {/if}

  {#if view?.syncResult && view.syncResult.tone !== "success"}
    <Banner tone={view.syncResult.tone} message={view.syncResult.message} onDismiss={() => actions.dismissSync?.()} />
  {/if}
  {#if view?.refreshError}
    <Banner tone="warning" message={view.refreshError} onRetry={() => actions.refresh?.()} />
  {/if}
  {#if status === "error"}
    <Banner
      tone="warning"
      message={`The live Zeffy numbers could not be loaded${view?.liveError ? ` (${view.liveError})` : ""}. The all-time campaign and donor lists are in Fundraising Events and Donor Engagement.`}
      onRetry={() => actions.refresh?.()}
    />
  {/if}

  {#if status === "loading"}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {#each Array(4) as _, i (i)}
        <SkeletonCard lines={2} />
      {/each}
    </div>
  {:else if connected}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Today" value={moneyOrNa(totals.today)} icon={Banknote} tone="gold" hint={paymentsHint(totals.today)} />
      <StatCard
        label="This month"
        value={moneyOrNa(totals.monthToDate)}
        icon={CalendarDays}
        tone="teal"
        hint={monthHint(totals.monthToDate, totals.last7Days)}
      />
      <StatCard
        label="Year to date"
        value={ytdWithGrants ? combinedValue(combined.yearToDate, totals.yearToDate) : moneyOrNa(totals.yearToDate)}
        icon={HandCoins}
        tone="teal"
        hint={ytdWithGrants
          ? partsHint(combined.yearToDate)
          : ytdHint(totals.yearToDate, totals.priorYearSamePeriod, view.ytdChange, view.priorPartial)}
      />
      <StatCard
        label="Last 12 months"
        value={last12WithGrants ? combinedValue(combined.last12Months, totals.last12Months) : moneyOrNa(totals.last12Months)}
        icon={TrendingUp}
        tone="gold"
        hint={last12WithGrants ? partsHint(combined.last12Months) : last12Hint(totals.priorYearTotal, view.priorPartial)}
      />
    </div>
    {#if (ytdWithGrants && totals.priorYearSamePeriod) || (last12WithGrants && totals.priorYearTotal)}
      <!-- The last-year comparisons are Zeffy only, so they move out of the cards. -->
      <p class="-mt-1 text-xs text-ink/55">
        Zeffy only, for comparison:{#if ytdWithGrants && totals.priorYearSamePeriod}{" "}{ytdHint(totals.yearToDate, totals.priorYearSamePeriod, view.ytdChange, view.priorPartial)}.{/if}{#if last12WithGrants && totals.priorYearTotal}{" "}{last12Hint(totals.priorYearTotal, view.priorPartial)}.{/if}
      </p>
    {/if}
    {#if view.priorPartial && view.historyStartLabel}
      <p class="-mt-1 text-xs text-ink/55">
        Last year's figures are partial: Zeffy records start {view.historyStartLabel}.
      </p>
    {/if}
  {/if}

  {#if status !== "loading"}
    {#if connected && goal}
      {#if rollupVisible}
        <div class="grid items-start gap-4 xl:grid-cols-[2fr_3fr]">
          <LiveGoalPanel
            {supabase}
            {goal}
            goalsValue={view.goalsValue}
            canEdit={view.canEdit}
            currentYear={view.currentYear}
            includesGrants={Boolean(view.liveGrants)}
            onSaved={(value) => actions.goalSaved?.(value)}
          />
          <GoalRollupPanel
            state={view.rollup}
            cycle={ROLLUP_CYCLE}
            goalsValue={view.goalsValue}
            onRetry={() => actions.refreshRollup?.()}
            {onOpenWorksheet}
          />
        </div>
        <LiveMonthlyBars months={view.months} />
      {:else}
        <div class="grid items-start gap-4 xl:grid-cols-[2fr_3fr]">
          <LiveGoalPanel
            {supabase}
            {goal}
            goalsValue={view.goalsValue}
            canEdit={view.canEdit}
            currentYear={view.currentYear}
            includesGrants={Boolean(view.liveGrants)}
            onSaved={(value) => actions.goalSaved?.(value)}
          />
          <LiveMonthlyBars months={view.months} />
        </div>
      {/if}
    {:else}
      {#if connected && view.canEdit && view.goalsLoaded}
        <LiveGoalPanel
          {supabase}
          {goal}
          goalsValue={view.goalsValue}
          canEdit={view.canEdit}
          currentYear={view.currentYear}
          includesGrants={Boolean(view.liveGrants)}
          onSaved={(value) => actions.goalSaved?.(value)}
        />
      {/if}
      {#if rollupVisible}
        <GoalRollupPanel
          state={view.rollup}
          cycle={ROLLUP_CYCLE}
          goalsValue={view?.goalsValue}
          onRetry={() => actions.refreshRollup?.()}
          {onOpenWorksheet}
        />
      {/if}
      {#if connected}
        <LiveMonthlyBars months={view.months} />
      {/if}
    {/if}

    <SubcommitteeScorecards {view} {onOpenTab} {onOpenProspect} />
  {/if}

  {#if connected}
    <LiveRecentGifts recent={view.live.recent} {onOpenDonorEmail} />
  {/if}
</div>
