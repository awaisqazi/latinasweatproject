<script>
  // One subcommittee's key numbers, picked by its id. "compact" is the
  // Overview scorecard; "full" opens the subcommittee's own tab, with more
  // room and the notes on how each number is counted. Anything that needs
  // the live Zeffy data says so instead of showing a zero.
  import { formatDateOnlyLabel } from "../../../../lib/dashboard/timeclock";
  import { formatCentsWhole } from "../../../../lib/dashboard/fundraisingLive";

  export let committeeId = "";
  export let view = null; // LiveData's view
  export let variant = "compact"; // compact | full
  export let onOpenProspect = () => {};

  $: full = variant === "full";
  $: liveConnected = Boolean(view?.connected);
  $: liveNote =
    view?.status === "forbidden"
      ? "These numbers come from the live Zeffy data, which your account does not have access to."
      : !view || view.status === "loading"
        ? "Loading the live Zeffy numbers…"
        : "These numbers come from the live Zeffy data, which is not connected yet.";
  $: events = view?.events || null;
  $: grants = view?.grants || null;
  $: donors = view?.live?.donors || {};
  $: upskilling = view?.upskilling || null;
  $: historyStartLabel = view?.historyStartLabel || "";
  $: gridClass = full ? "grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4" : "grid grid-cols-2 gap-x-4 gap-y-3";
  $: valueClass = full ? "mt-1 text-2xl font-bold tabular-nums text-ink" : "mt-1 text-xl font-bold tabular-nums text-ink";
  const wideClass = "col-span-2";

  function count(value) {
    return value === null || value === undefined ? "n/a" : Number(value).toLocaleString();
  }
</script>

{#if committeeId === "events"}
  {#if liveConnected && events}
    <dl class={gridClass}>
      <div>
        <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Event revenue this year</dt>
        <dd class={valueClass}>{formatCentsWhole(events.revenueCents)}</dd>
      </div>
      <div>
        <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Event campaigns with payments</dt>
        <dd class={valueClass}>{events.campaignCount.toLocaleString()}</dd>
      </div>
      <div class={wideClass}>
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
    {#if full}
      <p class="mt-3 text-xs text-ink/50">
        Revenue counts Zeffy ticket, auction and raffle payments this year, net of refunds.
      </p>
    {/if}
  {:else}
    <p class="text-sm text-ink/60">{liveNote}</p>
  {/if}
{:else if committeeId === "grants"}
  {#if grants}
    <dl class={gridClass}>
      <div>
        <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Committed this year</dt>
        <dd class={valueClass}>{formatCentsWhole(grants.committedYtdCents)}</dd>
        <dd class="mt-0.5 text-xs text-ink/50">
          {grants.committedYtdCount === null || grants.committedYtdCount === undefined
            ? "Committed or received"
            : `${grants.committedYtdCount} grant${grants.committedYtdCount === 1 ? "" : "s"}, committed or received`}
        </dd>
      </div>
      {#if full}
        <div>
          <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Received this year</dt>
          <dd class={valueClass}>{formatCentsWhole(grants.receivedYtdCents)}</dd>
        </div>
      {/if}
      <div>
        <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">In the pipeline</dt>
        <dd class={valueClass}>{grants.pipelineCount.toLocaleString()}</dd>
        <dd class="mt-0.5 text-xs text-ink/50">Prospecting through Submitted</dd>
      </div>
      <div>
        <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Total ask</dt>
        <dd class={valueClass}>{formatCentsWhole(grants.pipelineAskCents)}</dd>
        <dd class="mt-0.5 text-xs text-ink/50">
          {grants.pipelineWithAsk} of {grants.pipelineCount} have an amount{grants.pipelineEstimated
            ? `, ${grants.pipelineEstimated} estimated from the research note`
            : ""}
        </dd>
      </div>
      <div class={full ? "col-span-2 lg:col-span-4" : wideClass}>
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
    {#if full && grants.byPhase.length}
      <div class="mt-4 overflow-x-auto">
        <table class="w-full min-w-[20rem] max-w-2xl text-sm">
          <caption class="sr-only">Grants by phase</caption>
          <thead>
            <tr class="text-left text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
              <th scope="col" class="pb-1.5 font-bold">Phase</th>
              <th scope="col" class="pb-1.5 text-right font-bold">Grants</th>
              <th scope="col" class="pb-1.5 text-right font-bold">Ask</th>
              <th scope="col" class="pb-1.5 text-right font-bold">Committed</th>
            </tr>
          </thead>
          <tbody>
            {#each grants.byPhase as row (row.phase)}
              <tr class="border-t border-ink/8">
                <td class="py-1.5 text-ink/80">{row.phase}</td>
                <td class="py-1.5 text-right tabular-nums text-ink/80">{row.count}</td>
                <td class="py-1.5 text-right tabular-nums text-ink/80">
                  {row.askCents ? formatCentsWhole(row.askCents) : ""}{#if row.estimated}<span class="block text-xs text-ink/50">{row.estimated} estimated</span>{/if}
                </td>
                <td class="py-1.5 text-right tabular-nums text-ink/80">{row.committedCents ? formatCentsWhole(row.committedCents) : ""}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    {#if full}
      <p class="mt-3 text-xs text-ink/50">
        A grant counts once it is Committed or Received with a committed amount, in the year of its committed date. Asks use each grant's ask amount; where that is empty, the first amount in its research note is used and marked estimated.
      </p>
    {/if}
  {/if}
{:else if committeeId === "donors"}
  <dl class={gridClass}>
    <div>
      <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Lapsed donors</dt>
      <dd class={valueClass}>{liveConnected ? count(donors.lapsedCount) : "n/a"}</dd>
      <dd class="mt-0.5 text-xs text-ink/50">Gave last year, not yet this year</dd>
    </div>
    <div>
      <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">New donors this year</dt>
      <dd class={valueClass}>{liveConnected ? count(donors.newDonorsYtd) : "n/a"}</dd>
      <dd class="mt-0.5 text-xs text-ink/50">
        First gift on record{historyStartLabel ? `, records start ${historyStartLabel}` : ""}
      </dd>
    </div>
    <div>
      <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Returning donors this year</dt>
      <dd class={valueClass}>{liveConnected ? count(donors.returningDonorsYtd) : "n/a"}</dd>
      <dd class="mt-0.5 text-xs text-ink/50">Gave this year and before</dd>
    </div>
    <div>
      <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Donors with an owner</dt>
      <dd class={valueClass}>{(view?.ownersAssigned || 0).toLocaleString()}</dd>
    </div>
    <div class={full ? "col-span-2 lg:col-span-4" : "col-span-2"}>
      <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Outreach on active call lists</dt>
      <dd class="mt-1 text-sm text-ink/80">
        {#if view?.outreachError}
          Could not load the call lists
        {:else if !view?.activeCallListsCount}
          No active call lists
        {:else if view.outreachCounts.length}
          {view.outreachCounts.map((row) => `${row.label} ${row.count}`).join(" · ")}
        {:else}
          The active call lists are empty
        {/if}
      </dd>
    </div>
  </dl>
  {#if full && !liveConnected}
    <p class="mt-3 text-xs text-ink/50">{liveNote}</p>
  {/if}
{:else if committeeId === "upskilling"}
  {#if view?.givingError}
    <p class="text-sm text-ink/60">Could not load the Giving Tuesday fundraisers.</p>
  {:else if upskilling}
    <dl class={gridClass}>
      <div>
        <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Signed up to fundraise</dt>
        <dd class={valueClass}>{upskilling.signedUp.toLocaleString()}</dd>
        <dd class="mt-0.5 text-xs text-ink/50">{upskilling.approved} approved</dd>
      </div>
      <div>
        <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">With at least one gift</dt>
        <dd class={valueClass}>{upskilling.withGift.toLocaleString()}</dd>
      </div>
      <div class={wideClass}>
        <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Raised on their pages</dt>
        <dd class={valueClass}>{formatCentsWhole(upskilling.raisedCents)}</dd>
      </div>
    </dl>
    <p class="mt-3 text-xs text-ink/50">
      Peer fundraisers from {view?.givingCampaignTitle || "Giving Tuesday"}. Training attendance is recorded in the Worksheet, not here.
    </p>
  {/if}
{/if}
