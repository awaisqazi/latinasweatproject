<script>
  // One short block of real numbers per fundraising subcommittee. Names and
  // co-leads come from src/data/fundraisingSubcommittees.js; the numbers are
  // picked by the subcommittee id. Anything that needs the live Zeffy data
  // says so instead of showing a zero.
  import Button from "../../ui/Button.svelte";
  import Panel from "../../ui/Panel.svelte";
  import {
    FUNDRAISING_SUBCOMMITTEES,
    coLeadsLabel,
  } from "../../../../data/fundraisingSubcommittees.js";
  import { formatChicagoDateLabel, formatDateOnlyLabel } from "../../../../lib/dashboard/timeclock";
  import { formatCentsWhole } from "../../../../lib/dashboard/fundraisingLive";

  export let liveConnected = false;
  export let historyStartLabel = ""; // first date the Zeffy records cover
  export let events = null; // eventsScorecard()
  export let grants = null; // grantsScorecard()
  export let donors = {}; // live.donors, normalized (values may be null)
  export let lapsed = []; // live.lapsed
  export let hasLapsed = false;
  export let ownersAssigned = 0;
  export let outreachCounts = []; // countOutreachByStatus()
  export let activeCallLists = 0;
  export let outreachError = "";
  export let upskilling = null; // upskillingScorecard()
  export let givingError = "";
  export let givingCampaignTitle = "";
  export let onOpenDonorEmail = () => {};
  export let onOpenProspect = () => {};

  const LAPSED_COLLAPSED = 5;
  let showAllLapsed = false;
  $: lapsedShown = showAllLapsed ? lapsed : lapsed.slice(0, LAPSED_COLLAPSED);

  function count(value) {
    return value === null || value === undefined ? "n/a" : Number(value).toLocaleString();
  }

  function donorLabel(row) {
    return row.name || row.email || "Unnamed donor";
  }
</script>

<div class="grid items-start gap-4 lg:grid-cols-2">
  {#each FUNDRAISING_SUBCOMMITTEES as committee (committee.id)}
    <Panel title={committee.name} id={`fundraising-committee-${committee.id}-title`}>
      <p class="-mt-3 mb-4 text-sm text-ink/55">Co-leads: {coLeadsLabel(committee)}</p>

      {#if committee.id === "events"}
        {#if liveConnected && events}
          <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Event revenue this year</dt>
              <dd class="mt-1 text-xl font-bold tabular-nums text-ink">{formatCentsWhole(events.revenueCents)}</dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Event campaigns with payments</dt>
              <dd class="mt-1 text-xl font-bold tabular-nums text-ink">{events.campaignCount.toLocaleString()}</dd>
            </div>
            <div class="col-span-2">
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Top event</dt>
              <dd class="mt-1 text-sm text-ink/80">
                {#if events.top}
                  <span class="font-semibold text-ink">{events.top.title}</span>{" · "}{formatCentsWhole(events.top.raisedYtdCents)}
                {:else}
                  No event payments this year yet
                {/if}
              </dd>
            </div>
          </dl>
          <p class="mt-3 text-xs text-ink/50">
            Revenue counts Zeffy ticket, auction and raffle payments, net of refunds.
          </p>
        {:else}
          <p class="text-sm text-ink/60">These numbers come from the live Zeffy data, which is not connected yet.</p>
        {/if}
      {:else if committee.id === "grants"}
        {#if grants}
          <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Prospects in the pipeline</dt>
              <dd class="mt-1 text-xl font-bold tabular-nums text-ink">{grants.pipelineCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Total ask</dt>
              <dd class="mt-1 text-xl font-bold tabular-nums text-ink">{formatCentsWhole(grants.pipelineAskCents)}</dd>
              <dd class="mt-0.5 text-xs text-ink/50">
                {grants.pipelineWithAsk} of {grants.pipelineCount} have an amount
              </dd>
            </div>
            <div class="col-span-2">
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Next deadline</dt>
              <dd class="mt-1 text-sm text-ink/80">
                {#if grants.nextDeadline}
                  <button
                    type="button"
                    class="block max-w-full text-left font-semibold text-ink underline decoration-ink/20 underline-offset-2 hover:decoration-ink/60"
                    onclick={() => onOpenProspect(grants.nextDeadline.prospectId)}
                  >
                    {grants.nextDeadline.prospectName}
                  </button>
                  <span class="mt-0.5 block text-ink/65">{formatDateOnlyLabel(grants.nextDeadline.date)}</span>
                {:else}
                  No dated deadline in the prospect research
                {/if}
              </dd>
            </div>
          </dl>
          {#if grants.byStage.length}
            <table class="mt-4 w-full text-sm">
              <caption class="sr-only">Prospects by stage</caption>
              <thead>
                <tr class="text-left text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
                  <th scope="col" class="pb-1.5 font-bold">Stage</th>
                  <th scope="col" class="pb-1.5 text-right font-bold">Prospects</th>
                  <th scope="col" class="pb-1.5 text-right font-bold">Ask</th>
                </tr>
              </thead>
              <tbody>
                {#each grants.byStage as row (row.stage)}
                  <tr class="border-t border-ink/8">
                    <td class="py-1.5 text-ink/80">{row.stage}</td>
                    <td class="py-1.5 text-right tabular-nums text-ink/80">{row.count}</td>
                    <td class="py-1.5 text-right tabular-nums text-ink/80">{row.askCents ? formatCentsWhole(row.askCents) : ""}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
          <p class="mt-3 text-xs text-ink/50">
            Pipeline is Research through Application. Asks are the first amount written in each prospect's suggested ask.
          </p>
        {/if}
      {:else if committee.id === "donors"}
        <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Lapsed donors</dt>
            <dd class="mt-1 text-xl font-bold tabular-nums text-ink">{liveConnected ? count(donors.lapsedCount) : "n/a"}</dd>
            <dd class="mt-0.5 text-xs text-ink/50">Gave last year, not yet this year</dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">New donors this year</dt>
            <dd class="mt-1 text-xl font-bold tabular-nums text-ink">{liveConnected ? count(donors.newDonorsYtd) : "n/a"}</dd>
            <dd class="mt-0.5 text-xs text-ink/50">
              First gift on record{historyStartLabel ? `, records start ${historyStartLabel}` : ""}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Returning donors this year</dt>
            <dd class="mt-1 text-xl font-bold tabular-nums text-ink">{liveConnected ? count(donors.returningDonorsYtd) : "n/a"}</dd>
            <dd class="mt-0.5 text-xs text-ink/50">Gave this year and before</dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Donors with an owner</dt>
            <dd class="mt-1 text-xl font-bold tabular-nums text-ink">{ownersAssigned.toLocaleString()}</dd>
          </div>
          <div class="col-span-2">
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Outreach on active call lists</dt>
            <dd class="mt-1 text-sm text-ink/80">
              {#if outreachError}
                Could not load the call lists
              {:else if !activeCallLists}
                No active call lists
              {:else if outreachCounts.length}
                {outreachCounts.map((row) => `${row.label} ${row.count}`).join(" · ")}
              {:else}
                The active call lists are empty
              {/if}
            </dd>
          </div>
        </dl>

        {#if liveConnected && hasLapsed}
          <h4 class="mt-5 text-sm font-bold text-ink">Lapsed donors, biggest last year first</h4>
          {#if lapsed.length}
            <div class="mt-2 space-y-2">
              {#each lapsedShown as row, index (`${row.email}|${index}`)}
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40 hover:shadow-card disabled:cursor-default disabled:hover:border-ink/8 disabled:hover:shadow-none"
                  disabled={!row.email}
                  onclick={() => onOpenDonorEmail(row.email)}
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-bold leading-snug text-ink">{donorLabel(row)}</span>
                    {#if row.name && row.email}
                      <span class="mt-0.5 block truncate text-xs text-ink/55">{row.email}</span>
                    {/if}
                    <span class="mt-0.5 block truncate text-xs text-ink/50">
                      Last gift {row.lastGiftAt ? formatChicagoDateLabel(row.lastGiftAt) : "unknown"}
                    </span>
                  </span>
                  <span class="text-right">
                    <span class="block text-sm font-bold tabular-nums text-ink">{formatCentsWhole(row.lastYearCents)}</span>
                    <span class="block text-xs text-ink/50">last year</span>
                  </span>
                </button>
              {/each}
            </div>
            {#if lapsed.length > LAPSED_COLLAPSED}
              <div class="mt-3 flex justify-center">
                <Button size="sm" variant="ghost" onclick={() => (showAllLapsed = !showAllLapsed)}>
                  {showAllLapsed ? "Show fewer" : `Show all ${lapsed.length}`}
                </Button>
              </div>
            {/if}
          {:else}
            <p class="mt-2 text-sm text-ink/60">No lapsed donors. Everyone who gave last year has given this year.</p>
          {/if}
        {/if}
      {:else if committee.id === "upskilling"}
        {#if givingError}
          <p class="text-sm text-ink/60">Could not load the Giving Tuesday fundraisers.</p>
        {:else if upskilling}
          <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Signed up to fundraise</dt>
              <dd class="mt-1 text-xl font-bold tabular-nums text-ink">{upskilling.signedUp.toLocaleString()}</dd>
              <dd class="mt-0.5 text-xs text-ink/50">{upskilling.approved} approved</dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">With at least one gift</dt>
              <dd class="mt-1 text-xl font-bold tabular-nums text-ink">{upskilling.withGift.toLocaleString()}</dd>
            </div>
            <div class="col-span-2">
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Raised on their pages</dt>
              <dd class="mt-1 text-xl font-bold tabular-nums text-ink">{formatCentsWhole(upskilling.raisedCents)}</dd>
            </div>
          </dl>
          <p class="mt-3 text-xs text-ink/50">
            Peer fundraisers from {givingCampaignTitle || "Giving Tuesday"}. Training is not tracked in the dashboard, so it is not shown here.
          </p>
        {/if}
      {/if}
    </Panel>
  {/each}
</div>
