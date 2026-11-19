<script context="module">
  // Survives tab switches and the parent's reload skeleton, so coming back to
  // Overview paints the last numbers at once while a fresh fetch runs.
  const cache = {
    live: null,
    goalsValue: null,
    goalsLoaded: false,
    givingFundraisers: [],
    givingTotals: [],
    givingCampaignTitle: "",
  };
</script>

<script>
  // Live fundraising view: Zeffy totals from fundraising_live(p_tz), the
  // annual goal from app_settings, and the subcommittee scorecards. Refetches
  // on any zeffy_payments change (debounced) and every 60 s while the page is
  // visible. When the RPC is missing it shows a quiet notice and the
  // parent's all-time campaign and donor lists below still carry the page.
  import { onDestroy, onMount } from "svelte";
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
  import LiveCampaigns from "./live/LiveCampaigns.svelte";
  import LiveGoalPanel from "./live/LiveGoalPanel.svelte";
  import LiveMonthlyBars from "./live/LiveMonthlyBars.svelte";
  import LiveRecentGifts from "./live/LiveRecentGifts.svelte";
  import SubcommitteeScorecards from "./live/SubcommitteeScorecards.svelte";
  import {
    LIVE_POLL_MS,
    LIVE_REALTIME_DEBOUNCE_MS,
    campaignsForView,
    countOutreachByStatus,
    eventsScorecard,
    fillMonths,
    formatCentsWhole,
    goalProgress,
    grantsScorecard,
    historyStartDate,
    isStale,
    liveSyncMessage,
    loadGoalsSetting,
    loadLive,
    loadOutreachStatuses,
    ownersAssignedCount,
    parseGoals,
    percentChange,
    pickGoal,
    priorYearIsPartial,
    subscribeZeffyPayments,
    syncHealthWarning,
    syncedAgoLabel,
    upskillingScorecard,
  } from "../../../lib/dashboard/fundraisingLive";
  import {
    loadGivingCampaign,
    loadGivingFundraisers,
    loadGivingTotals,
    resolveGivingCampaignSlug,
    runZeffySync,
  } from "../../../lib/dashboard/givingAdmin";
  import { OUTREACH_STATUSES } from "../../../lib/dashboard/fundraisingCrm";
  import { chicagoToday, formatDateOnlyLabel } from "../../../lib/dashboard/timeclock";
  import { isSuperuser } from "../../../lib/dashboard/roles";

  export let supabase;
  export let profile = null;
  export let prospects = [];
  export let donorProfiles = [];
  export let outreachCampaigns = [];
  export let refreshKey = 0;
  export let onOpenDonorEmail = () => {};
  export let onOpenProspect = () => {};

  const TICK_MS = 15 * 1000;
  const givingSlug = resolveGivingCampaignSlug();

  // loading | ready | missing | forbidden | error
  let status = cache.live ? "ready" : "loading";
  let live = cache.live;
  let liveError = "";
  let refreshError = "";
  let refreshing = false;
  let inFlight = false;
  let queued = false;
  let lastFetchAt = 0;
  let destroyed = false;

  let goalsValue = cache.goalsValue;
  let goalsLoaded = cache.goalsLoaded;

  let givingFundraisers = cache.givingFundraisers;
  let givingTotals = cache.givingTotals;
  let givingCampaignTitle = cache.givingCampaignTitle;
  let givingError = "";

  let outreachItems = [];
  let outreachError = "";
  let lastOutreachKey = null;

  let syncing = false;
  let syncResult = null;

  let now = Date.now();
  let lastRefreshKey = refreshKey;
  let realtimeTimer = 0;
  let tickTimer = 0;
  let unsubscribe = () => {};

  $: canEdit = isSuperuser(profile);
  $: today = chicagoToday(new Date(now));
  $: currentYear = Number(today.slice(0, 4));
  $: connected = status === "ready" && Boolean(live);
  $: totals = live?.totals || {};
  $: goal = goalsLoaded ? goalProgress(pickGoal(parseGoals(goalsValue), currentYear), totals) : null;
  $: months = fillMonths(live?.monthly || [], today);
  $: viewCampaigns = campaignsForView(live?.campaigns || []);
  $: events = eventsScorecard(live);
  $: historyStart = historyStartDate(live);
  $: historyStartLabel = historyStart ? formatDateOnlyLabel(historyStart) : "";
  $: priorPartial = priorYearIsPartial(live, today);
  $: healthWarning = connected ? syncHealthWarning(live, now) : "";
  $: grants = grantsScorecard(prospects, today);
  $: activeCallLists = outreachCampaigns.filter((campaign) => campaign.status === "active");
  $: outreachKey = activeCallLists.map((campaign) => campaign.id).sort().join(",");
  $: if (outreachKey !== lastOutreachKey) {
    lastOutreachKey = outreachKey;
    fetchOutreach(activeCallLists.map((campaign) => campaign.id));
  }
  $: outreachCounts = countOutreachByStatus(outreachItems, OUTREACH_STATUSES);
  $: ownersAssigned = ownersAssignedCount(donorProfiles);
  $: upskilling = upskillingScorecard(givingFundraisers, givingTotals);
  $: syncedAgo = syncedAgoLabel(live?.syncedAt, now);
  $: stale = connected && isStale(live?.syncedAt, now);
  // A change against a partial year would overstate growth, so it is left out.
  $: ytdChange = priorPartial
    ? null
    : percentChange(totals.yearToDate?.amountCents, totals.priorYearSamePeriod?.amountCents);

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    refreshLive();
    loadSecondary();
    fetchOutreach(activeCallLists.map((campaign) => campaign.id));
  }

  onMount(() => {
    refreshLive();
    loadSecondary();
    unsubscribe = subscribeZeffyPayments(supabase, scheduleRealtimeRefresh);
    tickTimer = window.setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", handleVisibility);
  });

  onDestroy(() => {
    destroyed = true;
    unsubscribe();
    if (typeof window !== "undefined") {
      window.clearInterval(tickTimer);
      window.clearTimeout(realtimeTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
    }
  });

  function pageVisible() {
    return typeof document === "undefined" || document.visibilityState === "visible";
  }

  function tick() {
    now = Date.now();
    if (pageVisible() && now - lastFetchAt >= LIVE_POLL_MS) refreshLive();
  }

  function handleVisibility() {
    if (!pageVisible()) return;
    now = Date.now();
    if (now - lastFetchAt >= LIVE_POLL_MS) refreshLive();
  }

  // A burst of payment changes (a sync upserts many rows) becomes one fetch.
  // While the page is hidden, the next visible tick picks it up instead.
  function scheduleRealtimeRefresh() {
    window.clearTimeout(realtimeTimer);
    if (!pageVisible()) {
      lastFetchAt = 0;
      return;
    }
    realtimeTimer = window.setTimeout(refreshLive, LIVE_REALTIME_DEBOUNCE_MS);
  }

  async function refreshLive() {
    if (!supabase || destroyed) return;
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    refreshing = true;
    lastFetchAt = Date.now();

    const result = await loadLive(supabase);
    if (destroyed) return;

    if (result.forbidden) {
      live = null;
      cache.live = null;
      status = "forbidden";
      refreshError = "";
    } else if (result.error) {
      if (live) {
        refreshError = "The live numbers could not be refreshed. Showing the last ones loaded.";
      } else {
        status = result.missing ? "missing" : "error";
        liveError = result.error.message || "";
      }
    } else {
      live = result.data;
      cache.live = live;
      status = "ready";
      liveError = "";
      refreshError = "";
    }

    inFlight = false;
    refreshing = false;
    now = Date.now();
    if (queued) {
      queued = false;
      refreshLive();
    }
  }

  async function loadSecondary() {
    if (!supabase) return;
    const [goalsResult, fundraisersResult, totalsResult, campaignResult] = await Promise.all([
      loadGoalsSetting(supabase),
      loadGivingFundraisers(supabase, givingSlug),
      loadGivingTotals(supabase, givingSlug),
      loadGivingCampaign(supabase, givingSlug),
    ]);
    if (destroyed) return;

    // A failed or absent goals row shows no goal; never a made-up one.
    goalsValue = goalsResult.error ? null : goalsResult.value;
    goalsLoaded = true;
    cache.goalsValue = goalsValue;
    cache.goalsLoaded = true;

    givingError = fundraisersResult.error?.message || totalsResult.error?.message || "";
    if (!fundraisersResult.error) givingFundraisers = fundraisersResult.data || [];
    if (!totalsResult.error) givingTotals = totalsResult.data || [];
    if (!campaignResult.error) givingCampaignTitle = campaignResult.data?.title || "";
    cache.givingFundraisers = givingFundraisers;
    cache.givingTotals = givingTotals;
    cache.givingCampaignTitle = givingCampaignTitle;
  }

  async function fetchOutreach(campaignIds) {
    if (!supabase) return;
    const { data, error } = await loadOutreachStatuses(supabase, campaignIds);
    if (destroyed) return;
    outreachError = error?.message || "";
    if (!error) outreachItems = data || [];
  }

  async function syncNow() {
    if (syncing) return;
    syncing = true;
    syncResult = null;
    const result = await runZeffySync(supabase);
    if (destroyed) return;
    syncing = false;
    syncResult = liveSyncMessage(result);
    refreshLive();
  }

  function handleGoalSaved(value) {
    goalsValue = value;
    cache.goalsValue = value;
  }

  function moneyOrNa(total) {
    return total ? formatCentsWhole(total.amountCents) : "n/a";
  }

  function giftsHint(total) {
    if (!total || total.giftCount === null) return "";
    return `${total.giftCount.toLocaleString()} gift${total.giftCount === 1 ? "" : "s"}`;
  }

  function ytdHint(ytd, prior, change, partial) {
    if (!prior) return giftsHint(ytd);
    const delta = change === null ? "" : ` (${change > 0 ? "+" : ""}${change}%)`;
    return `Last year by now ${formatCentsWhole(prior.amountCents)}${partial ? ", partial" : delta}`;
  }

  function monthHint(month, week) {
    const parts = [giftsHint(month)];
    if (week) parts.push(`${formatCentsWhole(week.amountCents)} last 7 days`);
    return parts.filter(Boolean).join(" · ");
  }

  function last12Hint(priorYear, partial) {
    if (!priorYear) return "";
    return `${partial ? "Last year, partial" : "Last year in full"} ${formatCentsWhole(priorYear.amountCents)}`;
  }
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-3 rounded-card border border-ink/8 bg-white px-4 py-3 shadow-card">
    <p class="min-w-0 text-sm {stale ? 'text-amber-800' : 'text-ink/70'}" role="status">
      {#if status === "loading"}
        Loading live Zeffy numbers…
      {:else if connected}
        <span class="font-semibold text-ink">Live from Zeffy</span>{" · "}{syncedAgo ? `synced ${syncedAgo}` : "sync time unknown"}{#if historyStartLabel}<span class="text-ink/50">{" · "}records from {historyStartLabel}</span>{/if}{#if refreshing}<span class="text-ink/45">{" · "}refreshing</span>{/if}
      {:else if status === "forbidden"}
        Your account does not have access to the live Zeffy numbers.
      {:else}
        Live Zeffy data is not connected yet.
      {/if}
    </p>
    {#if status !== "forbidden"}
      <Button size="sm" icon={RefreshCw} loading={syncing} onclick={syncNow}>Sync now</Button>
    {/if}
  </div>

  {#if healthWarning}
    <Banner tone="warning" message={healthWarning} />
  {/if}

  {#if syncResult && syncResult.tone !== "success"}
    <Banner tone={syncResult.tone} message={syncResult.message} onDismiss={() => (syncResult = null)} />
  {/if}
  {#if refreshError}
    <Banner tone="warning" message={refreshError} onRetry={refreshLive} />
  {/if}
  {#if status === "error"}
    <Banner
      tone="warning"
      message={`The live Zeffy numbers could not be loaded${liveError ? ` (${liveError})` : ""}. The all-time campaign and donor lists are below.`}
      onRetry={refreshLive}
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
      <StatCard label="Today" value={moneyOrNa(totals.today)} icon={Banknote} tone="gold" hint={giftsHint(totals.today)} />
      <StatCard
        label="This month"
        value={moneyOrNa(totals.monthToDate)}
        icon={CalendarDays}
        tone="teal"
        hint={monthHint(totals.monthToDate, totals.last7Days)}
      />
      <StatCard
        label="Year to date"
        value={moneyOrNa(totals.yearToDate)}
        icon={HandCoins}
        tone="teal"
        hint={ytdHint(totals.yearToDate, totals.priorYearSamePeriod, ytdChange, priorPartial)}
      />
      <StatCard
        label="Last 12 months"
        value={moneyOrNa(totals.last12Months)}
        icon={TrendingUp}
        tone="gold"
        hint={last12Hint(totals.priorYearTotal, priorPartial)}
      />
    </div>
    {#if priorPartial && historyStartLabel}
      <p class="-mt-1 text-xs text-ink/55">
        Last year's figures are partial: Zeffy records start {historyStartLabel}.
      </p>
    {/if}

    {#if goal}
      <div class="grid items-start gap-4 xl:grid-cols-[2fr_3fr]">
        <LiveGoalPanel {supabase} {goal} {goalsValue} {canEdit} {currentYear} onSaved={handleGoalSaved} />
        <LiveMonthlyBars {months} />
      </div>
    {:else}
      {#if canEdit && goalsLoaded}
        <LiveGoalPanel {supabase} {goal} {goalsValue} {canEdit} {currentYear} onSaved={handleGoalSaved} />
      {/if}
      <LiveMonthlyBars {months} />
    {/if}

    <LiveCampaigns campaigns={viewCampaigns} />
  {/if}

  {#if status !== "loading"}
    <SubcommitteeScorecards
      liveConnected={connected}
      {historyStartLabel}
      {events}
      {grants}
      donors={live?.donors || {}}
      lapsed={live?.lapsed || []}
      hasLapsed={Boolean(live?.hasLapsed)}
      {ownersAssigned}
      {outreachCounts}
      activeCallLists={activeCallLists.length}
      {outreachError}
      {upskilling}
      {givingError}
      {givingCampaignTitle}
      {onOpenDonorEmail}
      {onOpenProspect}
    />
  {/if}

  {#if connected}
    <LiveRecentGifts
      recent={live.recent}
      topDonors={live.topDonorsYtd}
      hasTopDonors={live.hasTopDonors}
      {onOpenDonorEmail}
    />
  {/if}
</div>
