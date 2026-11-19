<script context="module">
  // Survives tab switches, so coming back to Overview paints the last list
  // at once while a fresh fetch runs.
  const cache = { attention: null, attentionStatus: "loading", updates: {}, updatesMonth: "" };
</script>

<script>
  // Fundraising > Overview, the board's view. Three questions, in order:
  // where are we against the goal (GoalBlock), what changed lately
  // (LatelyBlock), and what needs attention (AttentionList, from
  // fundraising_attention). Then the four subcommittees as tiles with this
  // month's update (fundraising_updates), and a print-only board report.
  // The live numbers come from LiveData, which FundraisingView mounts once
  // for every tab. Every block hides or says so quietly when its data is
  // missing.
  import { onDestroy } from "svelte";
  import { Printer, RefreshCw } from "@lucide/svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import AttentionList from "./live/overview/AttentionList.svelte";
  import BoardReport from "./live/overview/BoardReport.svelte";
  import GoalBlock from "./live/overview/GoalBlock.svelte";
  import LatelyBlock from "./live/overview/LatelyBlock.svelte";
  import SubcommitteeTiles from "./live/overview/SubcommitteeTiles.svelte";
  import { goalBarModel } from "../../../lib/dashboard/fundraisingRollup";
  import {
    attentionLines,
    loadAttention,
    loadMonthUpdates,
    monthNameOf,
    monthStartOf,
    subcommitteeTiles,
    thanksOverdueCount,
  } from "../../../lib/dashboard/fundraisingAttention";
  import { LIVE_REALTIME_DEBOUNCE_MS } from "../../../lib/dashboard/fundraisingLive";
  import { chicagoToday, formatDateOnlyLabel } from "../../../lib/dashboard/timeclock";

  export let supabase;
  export let view = null; // LiveData's view
  export let onOpenDonorEmail = () => {};
  export let onOpenProspect = () => {};
  export let onOpenTab = () => {};
  export let onOpenWorksheet = () => {};

  // loading | ready | hidden | error
  let attentionStatus = cache.attention ? "ready" : cache.attentionStatus === "hidden" ? "hidden" : "loading";
  let attention = cache.attention;
  let attentionRefreshing = false;
  let attentionInFlight = false;
  let attentionQueued = false;
  let updates = cache.updates;
  let updatesMonth = cache.updatesMonth;
  let attentionTimer = 0;
  let destroyed = false;
  let report;

  $: status = view?.status || "loading";
  $: connected = Boolean(view?.connected);
  $: actions = view?.actions || {};
  $: today = view?.today || chicagoToday();
  $: monthName = monthNameOf(today);
  $: todayLabel = formatDateOnlyLabel(today);

  // Ask for the plan roll-up each time Overview opens, so a worksheet saved
  // on another tab shows up here.
  let rollupRequested = false;
  $: if (!rollupRequested && view?.actions?.refreshRollup) {
    rollupRequested = true;
    view.actions.refreshRollup();
  }

  // Each live refresh (realtime or the 60 s poll) also re-reads the
  // attention list and this month's updates, debounced.
  let lastLive = undefined;
  $: liveRef = view?.live;
  $: if (liveRef !== lastLive) {
    lastLive = liveRef;
    scheduleAttention();
  }

  $: rollupData = view?.rollup?.status === "ready" ? view.rollup.data : null;
  $: bar = goalBarModel({ goal: view?.goal || null, rollup: rollupData, grants: view?.liveGrants || null });
  $: lines = attention ? attentionLines(attention.items, attention.today || today) : [];
  $: attentionVisible = attentionStatus !== "hidden";
  $: thanksCount = attentionStatus === "ready" ? thanksOverdueCount(attention) : null;
  $: tiles = subcommitteeTiles(view, thanksCount, updates);

  function scheduleAttention() {
    if (typeof window === "undefined") return;
    window.clearTimeout(attentionTimer);
    attentionTimer = window.setTimeout(refreshAttention, attention ? LIVE_REALTIME_DEBOUNCE_MS : 0);
  }

  async function refreshAttention() {
    if (!supabase || destroyed) return;
    if (attentionInFlight) {
      attentionQueued = true;
      return;
    }
    attentionInFlight = true;
    attentionRefreshing = true;
    const month = monthStartOf(chicagoToday());
    const [result, updatesResult] = await Promise.all([loadAttention(supabase), loadMonthUpdates(supabase, month)]);
    if (destroyed) return;

    if (result.missing || result.forbidden) {
      attention = null;
      attentionStatus = "hidden";
    } else if (result.error) {
      // Keep the last good list on screen when there is one.
      if (!attention) attentionStatus = "error";
    } else {
      attention = result.data;
      attentionStatus = "ready";
    }
    cache.attention = attention;
    cache.attentionStatus = attentionStatus;

    if (!updatesResult.error) {
      updates = updatesResult.data;
      updatesMonth = month;
    } else if (updatesMonth !== month) {
      updates = {};
    }
    cache.updates = updates;
    cache.updatesMonth = updatesMonth;

    attentionInFlight = false;
    attentionRefreshing = false;
    if (attentionQueued) {
      attentionQueued = false;
      refreshAttention();
    }
  }

  function retryAttention() {
    attentionStatus = "loading";
    refreshAttention();
  }

  onDestroy(() => {
    destroyed = true;
    if (typeof window !== "undefined") window.clearTimeout(attentionTimer);
  });
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-card border border-ink/8 bg-white px-4 py-2 shadow-card">
    <p class="min-w-0 flex-1 basis-56 text-sm {view?.stale ? 'text-amber-800' : 'text-ink/70'}" role="status">
      {#if status === "loading"}
        Loading live Zeffy numbers…
      {:else if connected}
        <span class="font-semibold text-ink">Live from Zeffy</span>, {view.syncedAgo ? `synced ${view.syncedAgo}` : "sync time unknown"}{#if view.refreshing}<span class="text-ink/45">, refreshing</span>{/if}
      {:else if status === "forbidden"}
        Your account does not have access to the live Zeffy numbers.
      {:else}
        Live Zeffy data is not connected yet.
      {/if}
    </p>
    <div class="flex items-center gap-2">
      {#if status !== "forbidden"}
        <Button class="min-h-11!" variant="ghost" icon={RefreshCw} loading={Boolean(view?.syncing)} onclick={() => actions.sync?.()}>Sync now</Button>
      {/if}
      <Button class="min-h-11!" icon={Printer} onclick={() => report?.print()}>Board report</Button>
    </div>
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
      message={`The live Zeffy numbers could not be loaded${view?.liveError ? ` (${view.liveError})` : ""}. The campaign and donor lists are in Fundraising Events and Donor Engagement.`}
      onRetry={() => actions.refresh?.()}
    />
  {/if}

  <div class="grid items-start gap-4 {attentionVisible ? 'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : ''}">
    <div class="min-w-0 space-y-4">
      {#if status === "loading" && !bar}
        <SkeletonCard lines={4} />
      {:else}
        <GoalBlock {supabase} {view} {bar} {onOpenWorksheet} />
      {/if}
      {#if connected}
        <LatelyBlock {view} {onOpenDonorEmail} />
      {:else if status === "loading"}
        <SkeletonCard lines={3} />
      {/if}
    </div>
    {#if attentionVisible}
      <div class="min-w-0">
        <AttentionList
          status={attentionStatus}
          {lines}
          refreshing={attentionRefreshing}
          {onOpenTab}
          {onOpenProspect}
          onSync={() => actions.sync?.()}
          onRetry={retryAttention}
        />
      </div>
    {/if}
  </div>

  <SubcommitteeTiles {tiles} {monthName} {onOpenTab} />

  <BoardReport
    bind:this={report}
    {view}
    {bar}
    {lines}
    attentionShown={attentionStatus === "ready"}
    {tiles}
    {monthName}
    {todayLabel}
  />
</div>
