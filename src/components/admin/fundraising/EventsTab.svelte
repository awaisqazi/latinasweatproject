<script>
  // Fundraising > Fundraising Events, below its header: Campaigns (this
  // year's live Zeffy campaigns, then every campaign since July 2025 with
  // its CSV export), Giving Tuesday and Calendar. Worksheet is mounted by
  // FundraisingView.
  import { Banknote, Download, HandCoins, Target } from "@lucide/svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import FundraisingCalendarTab from "./FundraisingCalendarTab.svelte";
  import GivingTuesdayTab from "./GivingTuesdayTab.svelte";
  import LiveCampaigns from "./live/LiveCampaigns.svelte";
  import { formatMoney } from "../../../lib/dashboard/fundraising";
  import { dateStamp, downloadCsv } from "../../../lib/dashboard/csv";

  export let sub = "events-campaigns";
  export let supabase;
  export let profile = null;
  export let teamMembers = [];
  export let refreshKey = 0;
  export let view = null; // LiveData's view
  export let campaignSummaries = [];
  export let last30Donations = [];
  export let prospects = [];
  export let donorProfiles = [];
  export let outreachCampaigns = [];
  export let onPendingCount = () => {};
  export let onOpenProspect = () => {};
  export let onOpenDonorEmail = () => {};

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
  $: liveNote =
    view?.status === "forbidden"
      ? "This year's campaigns come from the live Zeffy data, which your account does not have access to."
      : !view || view.status === "loading"
        ? "Loading the live Zeffy numbers…"
        : "This year's campaigns come from the live Zeffy data, which is not connected yet.";

  function formatDate(value) {
    if (!value) return "n/a";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function exportCampaignsCsv() {
    downloadCsv(
      `lsp-campaigns-${dateStamp()}.csv`,
      ["Campaign", "Total raised", "Gifts", "Donors", "First gift", "Last gift"],
      rankedCampaigns.map((campaign) => [
        campaign.campaign_title || "(no campaign)",
        Number(campaign.total_raised || 0).toFixed(2),
        campaign.gift_count || 0,
        campaign.participant_count || 0,
        campaign.first_date || "",
        campaign.last_date || "",
      ]),
    );
  }
</script>

{#if sub === "events-campaigns"}
  {#if view?.connected}
    <LiveCampaigns campaigns={view.viewCampaigns} />
  {:else}
    <Panel title="Campaigns with payments this year" id="fundraising-live-campaigns-title">
      <p class="text-sm text-ink/60">{liveNote}</p>
    </Panel>
  {/if}

  <div class="pt-4">
    <h3 id="fundraising-all-campaigns-title" class="text-lg font-bold text-ink">All campaigns since July 2025</h3>
    <p class="mt-1 text-sm text-ink/60">
      All-time numbers from Zeffy, which syncs automatically. Records start July 18, 2025.
    </p>
  </div>

  <div class="grid gap-3 sm:grid-cols-3">
    <StatCard label="Raised since July 2025" value={formatMoney(totalRaised)} icon={HandCoins} tone="gold" />
    <StatCard label="Raised last 30 days" value={formatMoney(last30Raised)} icon={Banknote} tone="teal" />
    <StatCard label="Average gift" value={formatMoney(averageGift)} icon={Target} tone="gold" />
  </div>

  <Panel title="Campaigns" id="fundraising-campaigns-title">
    {#if rankedCampaigns.length}
      <div class="mb-3 flex justify-end">
        <Button size="sm" icon={Download} onclick={exportCampaignsCsv}>
          Export CSV
        </Button>
      </div>
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
      <EmptyState title="No campaign totals yet" message="Campaign totals appear here as gifts sync from Zeffy." />
    {/if}
  </Panel>
{:else if sub === "events-giving"}
  <GivingTuesdayTab
    {supabase}
    {profile}
    {teamMembers}
    {refreshKey}
    {onPendingCount}
  />
{:else if sub === "events-calendar"}
  <FundraisingCalendarTab
    {prospects}
    {donorProfiles}
    campaigns={outreachCampaigns}
    {teamMembers}
    onOpenProspect={(prospect) => onOpenProspect(prospect.id)}
    {onOpenDonorEmail}
  />
{/if}
