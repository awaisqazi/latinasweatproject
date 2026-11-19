<script context="module">
  // Survives tab switches and leaving the Fundraising view, so coming back
  // paints the last numbers at once while a fresh fetch runs.
  const cache = {
    live: null,
    goalsValue: null,
    goalsLoaded: false,
    givingFundraisers: [],
    givingTotals: [],
    givingCampaignTitle: "",
    rollup: null,
  };
</script>

<script>
  // Headless loader for the live fundraising numbers, mounted once by
  // FundraisingView so every tab reads the same data: Zeffy totals from
  // fundraising_live(p_tz), the annual goal from app_settings, the Giving
  // Tuesday peer fundraisers and the outreach call-list statuses. Refetches
  // on any zeffy_payments change (debounced) and every 60 s while the page is
  // visible. Hands everything up as one `view` object (bind:view); the
  // actions inside it (refresh, sync, ...) are the only way to change it.
  import { onDestroy, onMount } from "svelte";
  import {
    LIVE_POLL_MS,
    LIVE_REALTIME_DEBOUNCE_MS,
    campaignsForView,
    combinedTotals,
    countOutreachByStatus,
    eventsScorecard,
    fillMonths,
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
  } from "../../../../lib/dashboard/fundraisingLive";
  import {
    loadGivingCampaign,
    loadGivingFundraisers,
    loadGivingTotals,
    resolveGivingCampaignSlug,
    runZeffySync,
  } from "../../../../lib/dashboard/givingAdmin";
  import { ROLLUP_CYCLE, loadGoalRollup, subscribeWorksheetRows } from "../../../../lib/dashboard/fundraisingRollup";
  import { OUTREACH_STATUSES } from "../../../../lib/dashboard/fundraisingCrm";
  import { chicagoToday, formatDateOnlyLabel } from "../../../../lib/dashboard/timeclock";
  import { isSuperuser } from "../../../../lib/dashboard/roles";

  export let supabase;
  export let profile = null;
  export let prospects = [];
  export let donorProfiles = [];
  export let outreachCampaigns = [];
  export let refreshKey = 0;
  export let view = null;

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

  // The goal roll-up loads on request (the Overview asks when it opens), so
  // a worksheet saved on another tab shows the next time Overview is opened.
  // idle | loading | ready | hidden | error
  let rollupStatus = cache.rollup ? "ready" : "idle";
  let rollup = cache.rollup;
  let rollupError = "";
  let rollupLoading = false;
  let rollupQueued = false;

  let now = Date.now();
  let lastRefreshKey = refreshKey;
  let realtimeTimer = 0;
  let tickTimer = 0;
  let unsubscribe = () => {};
  let unsubscribeWorksheets = () => {};
  let rollupTimer = 0;

  const actions = {
    refresh: () => refreshLive(),
    sync: () => syncNow(),
    dismissSync: () => (syncResult = null),
    goalSaved: (value) => handleGoalSaved(value),
    refreshRollup: () => loadRollup(),
  };

  $: canEdit = isSuperuser(profile);
  $: today = chicagoToday(new Date(now));
  $: currentYear = Number(today.slice(0, 4));
  $: connected = status === "ready" && Boolean(live);
  $: totals = live?.totals || {};
  // Committed grants from fundraising_live's grants block; null keeps every
  // total Zeffy only.
  $: liveGrants = live?.grants || null;
  $: combined = combinedTotals(totals, liveGrants);
  $: goal = goalsLoaded
    ? goalProgress(pickGoal(parseGoals(goalsValue), currentYear), totals, liveGrants)
    : null;
  $: months = fillMonths(live?.monthly || [], today);
  $: viewCampaigns = campaignsForView(live?.campaigns || []);
  $: events = eventsScorecard(live);
  $: historyStart = historyStartDate(live);
  $: historyStartLabel = historyStart ? formatDateOnlyLabel(historyStart) : "";
  $: priorPartial = priorYearIsPartial(live, today);
  $: healthWarning = connected ? syncHealthWarning(live, now) : "";
  $: grants = grantsScorecard(prospects, today, liveGrants);
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

  $: view = {
    status,
    connected,
    live,
    liveError,
    refreshError,
    refreshing,
    syncing,
    syncResult,
    now,
    today,
    currentYear,
    canEdit,
    totals,
    liveGrants,
    combined,
    goal,
    goalsValue,
    goalsLoaded,
    months,
    viewCampaigns,
    events,
    historyStartLabel,
    priorPartial,
    healthWarning,
    grants,
    activeCallListsCount: activeCallLists.length,
    outreachCounts,
    outreachError,
    ownersAssigned,
    upskilling,
    givingFundraisers,
    givingTotals,
    givingError,
    givingCampaignTitle,
    syncedAgo,
    stale,
    ytdChange,
    rollup: { status: rollupStatus, data: rollup, error: rollupError, loading: rollupLoading },
    actions,
  };

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    refreshLive();
    loadSecondary();
    fetchOutreach(activeCallLists.map((campaign) => campaign.id));
    if (rollupStatus !== "idle" && rollupStatus !== "hidden") loadRollup();
  }

  onMount(() => {
    refreshLive();
    loadSecondary();
    unsubscribe = subscribeZeffyPayments(supabase, scheduleRealtimeRefresh);
    unsubscribeWorksheets = subscribeWorksheetRows(supabase, ROLLUP_CYCLE, scheduleRollupRefresh);
    tickTimer = window.setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", handleVisibility);
  });

  onDestroy(() => {
    destroyed = true;
    unsubscribe();
    unsubscribeWorksheets();
    if (typeof window !== "undefined") {
      window.clearTimeout(rollupTimer);
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

  // Someone saved a worksheet: re-read the roll-up once the burst settles,
  // but only after the Overview has asked for it.
  function scheduleRollupRefresh() {
    if (rollupStatus === "idle" || rollupStatus === "hidden") return;
    window.clearTimeout(rollupTimer);
    rollupTimer = window.setTimeout(loadRollup, LIVE_REALTIME_DEBOUNCE_MS);
  }

  async function loadRollup() {
    if (!supabase || destroyed) return;
    if (rollupLoading) {
      rollupQueued = true;
      return;
    }
    rollupLoading = true;
    if (!rollup) rollupStatus = "loading";
    const result = await loadGoalRollup(supabase, ROLLUP_CYCLE);
    if (destroyed) return;
    rollupLoading = false;
    if (result.missing || result.forbidden) {
      rollup = null;
      cache.rollup = null;
      rollupError = "";
      rollupStatus = "hidden";
    } else if (result.error) {
      // Keep the last good roll-up on screen when there is one.
      rollupError = result.error.message || "The plans could not be loaded.";
      if (!rollup) rollupStatus = "error";
    } else {
      rollup = result.data;
      cache.rollup = rollup;
      rollupError = "";
      rollupStatus = "ready";
    }
    if (rollupQueued) {
      rollupQueued = false;
      loadRollup();
    }
  }

  function handleGoalSaved(value) {
    goalsValue = value;
    cache.goalsValue = value;
  }
</script>
