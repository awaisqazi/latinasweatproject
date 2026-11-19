<script>
  // Active and recently active Zeffy campaigns from the live mirror.
  import { ExternalLink } from "@lucide/svelte";
  import Button from "../../ui/Button.svelte";
  import EmptyState from "../../ui/EmptyState.svelte";
  import Panel from "../../ui/Panel.svelte";
  import { formatChicagoDateLabel } from "../../../../lib/dashboard/timeclock";
  import {
    campaignGoalPercent,
    formatCentsWhole,
  } from "../../../../lib/dashboard/fundraisingLive";

  export let campaigns = []; // campaignsForView() output
  const COLLAPSED = 8;

  let showAll = false;
  $: shown = showAll ? campaigns : campaigns.slice(0, COLLAPSED);

  // Zeffy's campaign labels (Event, DonationForm, PeerToPeerCampaign...).
  const CATEGORY_LABELS = {
    event: "Event",
    peertopeercampaign: "Peer to peer",
    peertopeer: "Peer to peer",
    donationform: "Donation form",
    donation: "Donation form",
    membership: "Membership",
    shop: "Shop",
    auction: "Auction",
    raffle: "Raffle",
    lottery: "Raffle",
    custompayment: "Payment form",
    custom: "Payment form",
  };

  function categoryLabel(category) {
    const raw = String(category || "");
    if (!raw) return "";
    const key = raw.toLowerCase().replace(/[^a-z]/g, "");
    if (CATEGORY_LABELS[key]) return CATEGORY_LABELS[key];
    const spaced = raw.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  function metaLine(campaign) {
    const parts = [];
    const category = categoryLabel(campaign.category);
    if (category) parts.push(category);
    parts.push(`${campaign.giftsYtd.toLocaleString()} gift${campaign.giftsYtd === 1 ? "" : "s"} this year`);
    parts.push(campaign.lastGiftAt ? `last gift ${formatChicagoDateLabel(campaign.lastGiftAt)}` : "no gifts yet");
    return parts.join(" · ");
  }
</script>

<Panel title="Campaigns with gifts this year" id="fundraising-live-campaigns-title">
  {#if campaigns.length}
    <div class="space-y-2">
      {#each shown as campaign, index (`${campaign.id}|${index}`)}
        {@const percent = campaignGoalPercent(campaign)}
        <div class="rounded-control border border-ink/8 bg-white px-4 py-3">
          <div class="flex flex-wrap items-center gap-3">
            <span class="min-w-0 flex-1">
              {#if campaign.url}
                <a
                  class="inline-flex max-w-full items-center gap-1.5 font-bold leading-snug text-ink hover:text-accent-strong"
                  href={campaign.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span class="truncate">{campaign.title}</span>
                  <ExternalLink class="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                  <span class="sr-only">(opens Zeffy in a new tab)</span>
                </a>
              {:else}
                <span class="block truncate font-bold leading-snug text-ink">{campaign.title}</span>
              {/if}
              <span class="mt-1 block text-xs font-semibold text-ink/50">{metaLine(campaign)}</span>
            </span>
            <span class="text-right">
              <span class="block text-sm font-bold tabular-nums text-ink">{formatCentsWhole(campaign.raisedYtdCents)}</span>
              <span class="block text-xs text-ink/50">this year</span>
            </span>
          </div>
          {#if percent !== null}
            <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]" aria-hidden="true">
              <div class="h-full rounded-full bg-accent" style="width: {percent}%"></div>
            </div>
            <p class="mt-1.5 text-xs text-ink/60">
              {formatCentsWhole(campaign.raisedCents)} of {formatCentsWhole(campaign.goalCents)} goal ({percent}%)
            </p>
          {/if}
        </div>
      {/each}
    </div>
    {#if campaigns.length > COLLAPSED}
      <div class="mt-3 flex justify-center">
        <Button size="sm" variant="ghost" onclick={() => (showAll = !showAll)}>
          {showAll ? "Show fewer" : `Show all ${campaigns.length}`}
        </Button>
      </div>
    {/if}
  {:else}
    <EmptyState title="No campaign gifts this year yet" message="Campaigns appear here after their first gift of the year." />
  {/if}
</Panel>
