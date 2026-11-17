<script>
  // Giving Tuesday admin: campaign overview and settings, the fundraiser
  // roster, every gift, and the thank-you drawing. One campaign at a time
  // (GIVING_CAMPAIGN_SLUG); a dev-only ?givingCampaign= switch points it at a
  // throwaway test campaign. Donor names and emails live only in this tab.
  import { onMount } from "svelte";
  import {
    Gift,
    HandCoins,
    RefreshCw,
    Save,
    Trophy,
    UsersRound,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import GivingDrawingPanel from "./GivingDrawingPanel.svelte";
  import GivingGiftsPanel from "./GivingGiftsPanel.svelte";
  import GivingRosterPanel from "./GivingRosterPanel.svelte";
  import {
    CAMPAIGN_COLUMNS,
    GIVING_CAMPAIGN_SLUG,
    formatCents,
    formatChicagoDateTimeLabel,
    loadGivingCampaign,
    loadGivingDraws,
    loadGivingFundraisers,
    loadGivingPayments,
    loadGivingTotals,
    loadLastWebhookEvent,
    netCents,
    normalizeZeffyUrl,
    paymentCounts,
    resolveGivingCampaignSlug,
    runZeffySync,
  } from "../../../lib/dashboard/givingAdmin";

  export let supabase;
  export let profile = null;
  export let teamMembers = [];
  export let refreshKey = 0;
  export let onPendingCount = () => {};

  const SUB_TABS_BASE = [
    { id: "overview", label: "Overview" },
    { id: "roster", label: "Roster" },
    { id: "gifts", label: "Gifts" },
    { id: "drawing", label: "Drawing" },
  ];
  const SYNC_STORAGE_KEY = "lsp-giving-last-sync";
  const CONFLICT_MESSAGE =
    "Someone else just updated the campaign settings, so their latest version has been loaded. Please re-apply your change.";

  const campaignSlug = resolveGivingCampaignSlug();
  const isTestCampaign = campaignSlug !== GIVING_CAMPAIGN_SLUG;

  let activeSubTab = "overview";
  let campaign = null;
  let fundraisers = [];
  let totals = [];
  let payments = [];
  let draws = [];
  let lastWebhook = null;
  let isLoading = true;
  let errorMessage = "";
  let lastRefreshKey = refreshKey;

  let syncing = false;
  let lastSync = readStoredSync();

  let draftGiveUrl = "";
  let draftPrize = "";
  let draftBoardOpen = true;
  let draftSignupOpen = true;
  let settingsError = "";
  let settingsSaved = "";
  let savingSettings = false;

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadAll();
  }

  $: countedPayments = payments.filter((payment) => paymentCounts(payment));
  $: raisedCents = countedPayments.reduce((sum, payment) => sum + netCents(payment), 0);
  $: giftCount = countedPayments.filter((payment) => netCents(payment) > 0).length;
  $: unassignedCount = countedPayments.filter(
    (payment) => !payment.fundraiser_id && netCents(payment) > 0,
  ).length;
  $: approvedCount = fundraisers.filter((row) => row.status === "approved").length;
  $: pendingCount = fundraisers.filter((row) => row.status === "pending").length;
  $: hiddenCount = fundraisers.filter((row) => row.status === "hidden").length;
  $: reachedCount = totals.filter((row) => row.status === "approved" && row.reached).length;
  $: goalCents = Number(campaign?.goal_cents || 0);
  $: goalPercent = goalCents ? Math.floor((raisedCents / goalCents) * 100) : 0;
  $: onPendingCount(pendingCount);
  $: subTabs = SUB_TABS_BASE.map((tab) =>
    tab.id === "roster" ? { ...tab, count: pendingCount || undefined } : tab,
  );
  $: newestZeffyChange = payments
    .filter((payment) => payment.source === "zeffy")
    .reduce((latest, payment) => (payment.updated_at > latest ? payment.updated_at : latest), "");
  $: settingsDirty = Boolean(campaign) &&
    (draftGiveUrl.trim() !== (campaign.give_url || "") ||
      draftPrize.trim() !== (campaign.prize_label || "") ||
      draftBoardOpen !== Boolean(campaign.board_open) ||
      draftSignupOpen !== Boolean(campaign.signup_open));

  onMount(() => {
    loadAll();
  });

  function readStoredSync() {
    try {
      const raw = window.localStorage.getItem(SYNC_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function storeSync(result) {
    try {
      window.localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(result));
    } catch {
      /* private window or blocked storage: the result still shows this session */
    }
  }

  async function loadAll() {
    if (!supabase) return;
    isLoading = !campaign;
    errorMessage = "";

    const [campaignResult, fundraisersResult, totalsResult, paymentsResult, drawsResult, webhookResult] =
      await Promise.all([
        loadGivingCampaign(supabase, campaignSlug),
        loadGivingFundraisers(supabase, campaignSlug),
        loadGivingTotals(supabase, campaignSlug),
        loadGivingPayments(supabase, campaignSlug),
        loadGivingDraws(supabase, campaignSlug),
        loadLastWebhookEvent(supabase),
      ]);

    const firstError =
      campaignResult.error ||
      fundraisersResult.error ||
      totalsResult.error ||
      paymentsResult.error ||
      drawsResult.error ||
      webhookResult.error;
    if (firstError) errorMessage = firstError.message;

    if (!campaignResult.error) {
      campaign = campaignResult.data || null;
      if (campaign) seedSettings(campaign);
    }
    if (!fundraisersResult.error) fundraisers = fundraisersResult.data || [];
    if (!totalsResult.error) totals = totalsResult.data || [];
    if (!paymentsResult.error) payments = paymentsResult.data || [];
    if (!drawsResult.error) draws = drawsResult.data || [];
    if (!webhookResult.error) lastWebhook = webhookResult.data || null;

    isLoading = false;
  }

  // Lighter reloads after a write in one of the panels.
  async function reloadRoster() {
    const [fundraisersResult, totalsResult] = await Promise.all([
      loadGivingFundraisers(supabase, campaignSlug),
      loadGivingTotals(supabase, campaignSlug),
    ]);
    if (!fundraisersResult.error) fundraisers = fundraisersResult.data || [];
    if (!totalsResult.error) totals = totalsResult.data || [];
    errorMessage = fundraisersResult.error?.message || totalsResult.error?.message || "";
  }

  async function reloadGifts() {
    const [paymentsResult, totalsResult] = await Promise.all([
      loadGivingPayments(supabase, campaignSlug),
      loadGivingTotals(supabase, campaignSlug),
    ]);
    if (!paymentsResult.error) payments = paymentsResult.data || [];
    if (!totalsResult.error) totals = totalsResult.data || [];
    errorMessage = paymentsResult.error?.message || totalsResult.error?.message || "";
  }

  async function reloadDrawing() {
    const [drawsResult, totalsResult] = await Promise.all([
      loadGivingDraws(supabase, campaignSlug),
      loadGivingTotals(supabase, campaignSlug),
    ]);
    if (!drawsResult.error) draws = drawsResult.data || [];
    if (!totalsResult.error) totals = totalsResult.data || [];
    errorMessage = drawsResult.error?.message || totalsResult.error?.message || "";
  }

  function seedSettings(row) {
    draftGiveUrl = row.give_url || "";
    draftPrize = row.prize_label || "";
    draftBoardOpen = Boolean(row.board_open);
    draftSignupOpen = Boolean(row.signup_open);
  }

  async function saveSettings(event) {
    event?.preventDefault();
    if (!campaign || savingSettings) return;
    settingsError = "";
    settingsSaved = "";

    const giveUrl = normalizeZeffyUrl(draftGiveUrl);
    if (!giveUrl.ok) {
      settingsError = `Main Zeffy page: ${giveUrl.message}`;
      return;
    }
    const prize = draftPrize.replace(/\s+/g, " ").trim();
    if (prize.length > 200) {
      settingsError = "Keep the prize line to 200 characters.";
      return;
    }

    savingSettings = true;
    const { data, error } = await supabase
      .from("giving_campaigns")
      .update({
        give_url: giveUrl.value,
        prize_label: prize || null,
        board_open: draftBoardOpen,
        signup_open: draftSignupOpen,
      })
      .eq("slug", campaign.slug)
      .eq("updated_at", campaign.updated_at)
      .select(CAMPAIGN_COLUMNS)
      .maybeSingle();

    if (error) {
      settingsError = error.message;
    } else if (!data) {
      settingsError = CONFLICT_MESSAGE;
      const fresh = await loadGivingCampaign(supabase, campaignSlug);
      if (fresh.data) {
        campaign = fresh.data;
        seedSettings(fresh.data);
      }
    } else {
      campaign = data;
      seedSettings(data);
      settingsSaved = "Campaign settings saved.";
    }
    savingSettings = false;
  }

  async function syncNow() {
    if (syncing) return;
    syncing = true;
    const result = await runZeffySync(supabase);
    lastSync = result;
    storeSync(result);
    syncing = false;
    if (result.ok) reloadGifts();
  }

  function formatWhen(value) {
    return value ? formatChicagoDateTimeLabel(value) : "";
  }

  function dateRangeLabel(row) {
    if (!row) return "";
    return `${formatChicagoDateTimeLabel(row.starts_at)} to ${formatChicagoDateTimeLabel(row.ends_at)}`;
  }
</script>

<div class="space-y-4">
  {#if isTestCampaign}
    <Banner tone="warning" message={`Dev only: showing the test campaign "${campaignSlug}", not ${GIVING_CAMPAIGN_SLUG}.`} />
  {/if}

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} onRetry={loadAll} />
  {/if}

  {#if isLoading}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {#each Array(4) as _, i (i)}
        <SkeletonCard lines={2} />
      {/each}
    </div>
  {:else if !campaign}
    <EmptyState
      title="Campaign not found"
      message={`There is no giving campaign with the slug "${campaignSlug}", or your account cannot read it.`}
    />
  {:else}
    <Tabs tabs={subTabs} bind:active={activeSubTab} label="Giving Tuesday sections" hasPanels={false} />

    {#if activeSubTab === "overview"}
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Raised"
          value={formatCents(raisedCents)}
          icon={HandCoins}
          tone="gold"
          hint={`${goalPercent}% of the ${formatCents(goalCents)} goal`}
        />
        <StatCard
          label="Gifts"
          value={giftCount.toLocaleString()}
          icon={Gift}
          tone="teal"
          hint={unassignedCount ? `${unassignedCount} not credited to a fundraiser` : "All credited or on the main page"}
        />
        <StatCard
          label="Fundraisers"
          value={approvedCount.toLocaleString()}
          icon={UsersRound}
          tone="teal"
          hint={`${pendingCount} pending · ${hiddenCount} hidden`}
        />
        <StatCard
          label={`Reached ${formatCents(campaign.threshold_cents)}`}
          value={reachedCount.toLocaleString()}
          icon={Trophy}
          tone="gold"
          hint="In the thank-you drawing"
        />
      </div>

      <div class="grid gap-4 xl:grid-cols-[2fr_3fr]">
        <Panel title="Zeffy sync" id="giving-sync-title">
          <svelte:fragment slot="actions">
            <Button size="sm" icon={RefreshCw} loading={syncing} onclick={syncNow}>Sync now</Button>
          </svelte:fragment>

          <p class="text-sm leading-6 text-ink/65">
            Gifts sync from Zeffy every 5 minutes. Sync now pulls them right away.
          </p>

          {#if lastSync}
            <Banner tone={lastSync.tone} message={lastSync.message} class="mt-3" />
          {/if}

          <dl class="mt-4 space-y-3">
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Last sync from this browser</dt>
              <dd class="mt-1 text-sm text-ink/80">{lastSync ? formatWhen(lastSync.at) : "Not run from this browser yet"}</dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Last Zeffy webhook</dt>
              <dd class="mt-1 text-sm text-ink/80">
                {#if lastWebhook}
                  {formatWhen(lastWebhook.received_at)} · {lastWebhook.type || "unknown event"} · {lastWebhook.outcome}
                {:else}
                  None received yet
                {/if}
              </dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Newest change to a Zeffy gift</dt>
              <dd class="mt-1 text-sm text-ink/80">{newestZeffyChange ? formatWhen(newestZeffyChange) : "No Zeffy gifts yet"}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Campaign settings" id="giving-settings-title">
          <form class="space-y-4" onsubmit={saveSettings}>
            <div class="grid gap-4 sm:grid-cols-2">
              <Field
                label="Main Zeffy page"
                id="giving-give-url"
                class="sm:col-span-2"
                hint="Where the public Give button goes. Leave blank to hide the button."
              >
                <input
                  id="giving-give-url"
                  type="url"
                  class="input"
                  placeholder="https://www.zeffy.com/en-US/peer-to-peer/..."
                  bind:value={draftGiveUrl}
                  disabled={savingSettings}
                />
              </Field>
              <Field
                label="Prize"
                id="giving-prize"
                class="sm:col-span-2"
                hint="Shown on the public page. Leave blank while the prize is not announced."
              >
                <input
                  id="giving-prize"
                  type="text"
                  class="input"
                  maxlength="200"
                  bind:value={draftPrize}
                  disabled={savingSettings}
                />
              </Field>
              <label class="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent"
                  bind:checked={draftBoardOpen}
                  disabled={savingSettings}
                />
                <span>
                  <span class="block font-semibold text-ink">Board open</span>
                  <span class="block text-xs text-ink/55">Show approved fundraisers on the public page.</span>
                </span>
              </label>
              <label class="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent"
                  bind:checked={draftSignupOpen}
                  disabled={savingSettings}
                />
                <span>
                  <span class="block font-semibold text-ink">Sign-up open</span>
                  <span class="block text-xs text-ink/55">Accept new sign-ups at /givingtuesday/join.</span>
                </span>
              </label>
            </div>

            {#if settingsError}
              <Banner tone="error" message={settingsError} />
            {/if}
            {#if settingsSaved}
              <Banner tone="success" message={settingsSaved} onDismiss={() => (settingsSaved = "")} />
            {/if}

            <div class="flex justify-end">
              <Button
                variant="primary"
                type="submit"
                icon={Save}
                loading={savingSettings}
                disabled={!settingsDirty}
              >
                Save settings
              </Button>
            </div>
          </form>

          <dl class="mt-5 grid gap-3 border-t border-ink/8 pt-4 sm:grid-cols-2">
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Campaign</dt>
              <dd class="mt-1 text-sm text-ink/80">{campaign.title} <span class="text-ink/50">({campaign.slug})</span></dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Goal · drawing threshold</dt>
              <dd class="mt-1 text-sm text-ink/80">{formatCents(campaign.goal_cents)} · {formatCents(campaign.threshold_cents)}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Runs (Chicago time)</dt>
              <dd class="mt-1 text-sm text-ink/80">{dateRangeLabel(campaign)}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Zeffy campaign ids</dt>
              <dd class="mt-1 break-all font-mono text-xs text-ink/70">
                {campaign.zeffy_campaign_ids?.length ? campaign.zeffy_campaign_ids.join(", ") : "None linked"}
              </dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Public</dt>
              <dd class="mt-1 text-sm text-ink/80">
                <Badge tone={campaign.is_public ? "green" : "neutral"} size="xs">
                  {campaign.is_public ? "Listed at /givingtuesday" : "Not public"}
                </Badge>
              </dd>
            </div>
          </dl>
          <p class="mt-3 text-xs text-ink/50">Goal, dates and Zeffy ids are changed in SQL, see the backend contract.</p>
        </Panel>
      </div>
    {:else if activeSubTab === "roster"}
      <GivingRosterPanel
        {supabase}
        {profile}
        {campaign}
        {fundraisers}
        {totals}
        onChanged={reloadRoster}
      />
    {:else if activeSubTab === "gifts"}
      <GivingGiftsPanel
        {supabase}
        {profile}
        {campaign}
        {payments}
        {fundraisers}
        onChanged={reloadGifts}
      />
    {:else if activeSubTab === "drawing"}
      <GivingDrawingPanel
        {supabase}
        {profile}
        {campaign}
        {totals}
        {draws}
        {teamMembers}
        {isTestCampaign}
        onChanged={reloadDrawing}
      />
    {/if}
  {/if}
</div>
