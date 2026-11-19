<script>
  // Fundraising > Donor Engagement, below its header: the body of each
  // sub-tab except Worksheet (FundraisingView mounts that one). Donors keeps
  // the full donor list with the top donors and newest payments beside it.
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import DonorsListPanel from "./DonorsListPanel.svelte";
  import LapsedDonors from "./live/LapsedDonors.svelte";
  import LiveRecentGifts from "./live/LiveRecentGifts.svelte";
  import LiveTopDonors from "./live/LiveTopDonors.svelte";
  import OutreachTab from "./OutreachTab.svelte";
  import TemplatesTab from "./TemplatesTab.svelte";
  import { formatMoney } from "../../../lib/dashboard/fundraising";

  export let sub = "donors-list";
  export let supabase;
  export let profile = null;
  export let teamMembers = [];
  export let refreshKey = 0;
  export let view = null; // LiveData's view
  export let donorSummaries = [];
  export let donorProfiles = [];
  export let templates = [];
  // Donor list filters, bound so they survive sub-tab switches.
  export let donorSearch = "";
  export let donorSort = "total";
  export let donorSegment = "all";
  export let donorPage = 0;
  export let galaEmails = null;
  export let onOpenDonor = () => {};
  export let onOpenDonorEmail = () => {};
  export let onTemplatesChanged = () => {};
  export let onWorkspaceChanged = () => {};

  $: givingDonors = donorSummaries.filter((donor) => Number(donor.total_given) > 0);
  $: topDonorsAllTime = givingDonors.slice(0, 10);
  $: connected = Boolean(view?.connected);

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
</script>

{#if sub === "donors-list"}
  <div class="grid items-start gap-4 xl:grid-cols-[3fr_2fr]">
    <DonorsListPanel
      {supabase}
      {profile}
      {teamMembers}
      {donorSummaries}
      {donorProfiles}
      bind:search={donorSearch}
      bind:sort={donorSort}
      bind:segment={donorSegment}
      bind:page={donorPage}
      bind:galaEmails
      {onOpenDonor}
    />

    <div class="space-y-4">
      {#if connected && view.live.hasTopDonors}
        <LiveTopDonors topDonors={view.live.topDonorsYtd} {onOpenDonorEmail} />
      {/if}

      <Panel title="Top donors since July 2025" id="fundraising-top-donors-title">
        {#if topDonorsAllTime.length}
          <p class="-mt-2 mb-3 text-sm text-ink/60">
            {givingDonors.length.toLocaleString()} donor{givingDonors.length === 1 ? " has" : "s have"} given since Zeffy records start.
          </p>
          <div class="space-y-2">
            {#each topDonorsAllTime as donor, index (donor.email)}
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40 hover:shadow-card"
                onclick={() => onOpenDonor(donor)}
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
          <EmptyState title="No donors yet" message="Donors appear here as gifts sync from Zeffy." />
        {/if}
      </Panel>

      {#if connected}
        <LiveRecentGifts recent={view.live.recent} idPrefix="fundraising-donors" {onOpenDonorEmail} />
      {/if}
    </div>
  </div>
{:else if sub === "donors-lapsed"}
  <LapsedDonors {view} {onOpenDonorEmail} />
{:else if sub === "donors-outreach"}
  <OutreachTab
    {supabase}
    {profile}
    {teamMembers}
    {donorSummaries}
    {donorProfiles}
    {refreshKey}
    {onOpenDonor}
    {onWorkspaceChanged}
  />
{:else if sub === "donors-templates"}
  <TemplatesTab
    {supabase}
    {templates}
    currentUserRole={profile?.role || "member"}
    {onTemplatesChanged}
  />
{/if}
