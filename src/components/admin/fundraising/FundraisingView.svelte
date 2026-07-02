<script>
  import { onMount } from "svelte";
  import {
    Banknote,
    CalendarClock,
    HandCoins,
    LayoutDashboard,
    Search,
    Target,
    Upload,
    UsersRound,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import DonorDrawer from "./DonorDrawer.svelte";
  import ImportTab from "./ImportTab.svelte";
  import ProspectsBoard from "./ProspectsBoard.svelte";
  import ProspectDrawer from "./ProspectDrawer.svelte";
  import {
    formatMoney,
    loadCampaignSummaries,
    loadDonationsSince,
    loadDonorSummaries,
    loadProspects,
  } from "../../../lib/dashboard/fundraising";

  export let supabase;
  export let profile = null;
  export let teamMembers = [];
  export let refreshKey = 0;
  export let onAssignTask = () => {};
  export let onWorkspaceChanged = () => {};

  const TABS = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "donors", label: "Donors", icon: UsersRound },
    { id: "prospects", label: "Prospects & Grants", icon: Target },
    { id: "import", label: "Import", icon: Upload },
  ];
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  let activeTab = "overview";
  let donorSummaries = [];
  let campaignSummaries = [];
  let prospects = [];
  let last30Donations = [];
  let isLoading = true;
  let errorMessage = "";
  let lastRefreshKey = refreshKey;
  let selectedDonor = null;
  let selectedProspectId = "";
  let donorSearch = "";
  let donorSort = "total";

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadAll();
  }

  $: givingDonors = donorSummaries.filter((donor) => Number(donor.total_given) > 0);
  $: totalRaised = campaignSummaries.reduce(
    (sum, campaign) => sum + Number(campaign.total_raised || 0),
    0,
  );
  $: totalGifts = campaignSummaries.reduce(
    (sum, campaign) => sum + Number(campaign.gift_count || 0),
    0,
  );
  $: last30Raised = last30Donations.reduce(
    (sum, gift) => sum + Number(gift.total_amount || 0) - Number(gift.refund_amount || 0),
    0,
  );
  $: averageGift = totalGifts ? totalRaised / totalGifts : 0;
  $: rankedCampaigns = campaignSummaries
    .filter((campaign) => Number(campaign.total_raised) > 0)
    .slice()
    .sort((a, b) => Number(b.total_raised || 0) - Number(a.total_raised || 0));
  $: topDonors = givingDonors.slice(0, 10);
  $: filteredDonors = filterDonors(donorSummaries, donorSearch, donorSort);
  $: selectedProspect =
    prospects.find((prospect) => prospect.id === selectedProspectId) || null;

  onMount(() => {
    loadAll();
  });

  async function loadAll() {
    if (!supabase) return;

    isLoading = true;
    errorMessage = "";

    const [donorsResult, campaignsResult, prospectsResult, recentResult] =
      await Promise.all([
        loadDonorSummaries(supabase),
        loadCampaignSummaries(supabase),
        loadProspects(supabase),
        loadDonationsSince(supabase, daysAgoDateKey(30)),
      ]);

    const firstError =
      donorsResult.error || campaignsResult.error || prospectsResult.error || recentResult.error;
    if (firstError) errorMessage = firstError.message;

    if (!donorsResult.error) donorSummaries = donorsResult.data || [];
    if (!campaignsResult.error) campaignSummaries = campaignsResult.data || [];
    if (!prospectsResult.error) prospects = prospectsResult.data || [];
    if (!recentResult.error) last30Donations = recentResult.data || [];

    isLoading = false;
  }

  function daysAgoDateKey(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function filterDonors(list, search, sort) {
    const query = search.trim().toLowerCase();
    let result = list;

    if (query) {
      result = result.filter((donor) =>
        [donor.donor_name, donor.email, donor.company_name, donor.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      );
    }

    return result.slice().sort((a, b) => {
      if (sort === "recent") {
        return (b.last_gift_date || "").localeCompare(a.last_gift_date || "");
      }
      if (sort === "name") {
        return (a.donor_name || a.email || "").localeCompare(b.donor_name || b.email || "");
      }
      return Number(b.total_given || 0) - Number(a.total_given || 0);
    });
  }

  function donorLabel(donor) {
    return donor.donor_name || donor.company_name || donor.email;
  }

  function formatDate(value) {
    if (!value) return "n/a";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function daysAgoLabel(value) {
    if (!value) return "Never";
    const then = new Date(`${value}T00:00:00`);
    const days = Math.floor((Date.now() - then.getTime()) / MS_PER_DAY);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }

  function handleProspectUpdated(updated) {
    if (!updated?.id) return;
    let found = false;
    prospects = prospects.map((prospect) => {
      if (prospect.id !== updated.id) return prospect;
      found = true;
      return { ...prospect, ...updated };
    });
    if (!found) prospects = [updated, ...prospects];
    onWorkspaceChanged();
  }

  function handleProspectDeleted(deletedId) {
    prospects = prospects.filter((prospect) => prospect.id !== deletedId);
    if (selectedProspectId === deletedId) selectedProspectId = "";
    onWorkspaceChanged();
  }

  function handleImported() {
    loadAll();
  }
</script>

<section class="space-y-4" aria-labelledby="fundraising-title">
  <div class="flex flex-col gap-3 rounded-card border border-ink/8 bg-white p-4 shadow-card md:flex-row md:items-center md:justify-between md:p-5">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">
        Donations, donors, and grant prospects in one hub
      </p>
      <h3 id="fundraising-title" class="mt-1 text-2xl font-bold">Fundraising</h3>
    </div>
    <Tabs tabs={TABS} bind:active={activeTab} variant="segmented" label="Fundraising sections" hasPanels={false} />
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} />
  {/if}

  {#if isLoading}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {#each Array(4) as _, i (i)}
        <SkeletonCard lines={2} />
      {/each}
    </div>
  {:else if activeTab === "overview"}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Raised all-time" value={formatMoney(totalRaised)} icon={HandCoins} tone="gold" />
      <StatCard label="Raised last 30 days" value={formatMoney(last30Raised)} icon={Banknote} tone="teal" />
      <StatCard label="Donors" value={givingDonors.length.toLocaleString()} icon={UsersRound} tone="teal" />
      <StatCard label="Average gift" value={formatMoney(averageGift)} icon={Target} tone="gold" />
    </div>

    <div class="grid gap-4 xl:grid-cols-[3fr_2fr]">
      <Panel title="Campaigns" id="fundraising-campaigns-title">
        {#if rankedCampaigns.length}
          <div class="space-y-2">
            {#each rankedCampaigns as campaign (campaign.campaign_title ?? "__untitled__")}
              <div class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3">
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-bold leading-snug text-ink">
                    {campaign.campaign_title || "(no campaign)"}
                  </span>
                  <span class="mt-1 block text-xs font-semibold text-ink/50">
                    {campaign.gift_count} gift{campaign.gift_count === 1 ? "" : "s"} ·
                    {campaign.participant_count} donor{campaign.participant_count === 1 ? "" : "s"} ·
                    last {formatDate(campaign.last_date)}
                  </span>
                </span>
                <span class="text-sm font-bold text-ink">{formatMoney(campaign.total_raised)}</span>
              </div>
            {/each}
          </div>
        {:else}
          <EmptyState title="No campaign totals yet" message="Import a Zeffy export to see campaign performance." />
        {/if}
      </Panel>

      <Panel title="Top donors" id="fundraising-top-donors-title">
        {#if topDonors.length}
          <div class="space-y-2">
            {#each topDonors as donor, index (donor.email)}
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40 hover:shadow-card"
                onclick={() => (selectedDonor = donor)}
              >
                <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink" aria-hidden="true">
                  {index + 1}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-bold leading-snug text-ink">{donorLabel(donor)}</span>
                  <span class="mt-0.5 block truncate text-xs text-ink/50">
                    {donor.gift_count} gift{donor.gift_count === 1 ? "" : "s"} · last {formatDate(donor.last_gift_date)}
                  </span>
                </span>
                <span class="text-sm font-bold text-ink">{formatMoney(donor.total_given)}</span>
              </button>
            {/each}
          </div>
        {:else}
          <EmptyState title="No donors yet" message="Import a Zeffy export to build the donor list." />
        {/if}
      </Panel>
    </div>
  {:else if activeTab === "donors"}
    <Panel title="Donors" id="fundraising-donors-title">
      <div class="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label class="relative block">
          <span class="sr-only">Search donors</span>
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" aria-hidden="true" />
          <input
            type="search"
            class="input pl-9"
            placeholder="Search by name, email, company, or phone"
            bind:value={donorSearch}
          />
        </label>
        <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50 sm:w-48">
          <span class="sr-only">Sort donors</span>
          <select class="select" bind:value={donorSort} aria-label="Sort donors">
            <option value="total">Top lifetime giving</option>
            <option value="recent">Most recent gift</option>
            <option value="name">Name A→Z</option>
          </select>
        </label>
      </div>

      <p class="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
        {filteredDonors.length.toLocaleString()} of {donorSummaries.length.toLocaleString()} donors
      </p>

      {#if filteredDonors.length}
        <div class="space-y-2">
          {#each filteredDonors.slice(0, 100) as donor (donor.email)}
            <button
              type="button"
              class="flex w-full flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40 hover:shadow-card"
              onclick={() => (selectedDonor = donor)}
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate font-bold leading-snug text-ink">{donorLabel(donor)}</span>
                <span class="mt-0.5 block truncate text-xs text-ink/55">{donor.email}</span>
              </span>
              <Badge tone="neutral" size="xs">
                {donor.gift_count || 0} gift{(donor.gift_count || 0) === 1 ? "" : "s"}
              </Badge>
              <Badge tone="neutral" size="xs">
                <CalendarClock class="h-3 w-3" aria-hidden="true" />
                {daysAgoLabel(donor.last_gift_date)}
              </Badge>
              <span class="w-24 shrink-0 text-right text-sm font-bold text-ink">
                {formatMoney(donor.total_given || 0)}
              </span>
            </button>
          {/each}
          {#if filteredDonors.length > 100}
            <p class="rounded-control border border-dashed border-ink/15 bg-white px-4 py-3 text-center text-xs text-ink/50">
              Showing the first 100. Refine the search to narrow down the rest.
            </p>
          {/if}
        </div>
      {:else}
        <EmptyState title="No matching donors" message="Try a different search term." />
      {/if}
    </Panel>
  {:else if activeTab === "prospects"}
    <ProspectsBoard
      {supabase}
      {prospects}
      {teamMembers}
      onSelect={(prospect) => (selectedProspectId = prospect.id)}
      onProspectUpdated={handleProspectUpdated}
    />
  {:else if activeTab === "import"}
    <ImportTab {supabase} profileId={profile?.id} onImported={handleImported} />
  {/if}
</section>

<DonorDrawer
  {supabase}
  donor={selectedDonor}
  {onAssignTask}
  onClose={() => (selectedDonor = null)}
/>

<ProspectDrawer
  {supabase}
  prospect={selectedProspect}
  {teamMembers}
  currentUserRole={profile?.role || "member"}
  {onAssignTask}
  onClose={() => (selectedProspectId = "")}
  onProspectUpdated={handleProspectUpdated}
  onProspectDeleted={handleProspectDeleted}
/>
