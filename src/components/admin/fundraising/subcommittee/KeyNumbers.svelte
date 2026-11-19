<script>
  // A subcommittee tab's key numbers: at most three, each one figure with a
  // short sentence-case label, and everything else behind "More numbers".
  // Numbers that open something (a sub-tab, a grant) are buttons. A number
  // whose source is missing or not readable by this account is left out
  // rather than shown as a zero.
  import { formatMoney } from "../../../../lib/dashboard/fundraising";
  import { formatCentsWhole } from "../../../../lib/dashboard/fundraisingLive";
  import { formatDateOnlyLabel } from "../../../../lib/dashboard/timeclock";

  export let committeeId = "";
  export let view = null; // LiveData's view
  export let thanks = null; // FollowUpData's followUps.thanks
  export let campaignSummaries = [];
  export let last30Donations = [];
  export let onOpenSub = () => {}; // (subTabId) => void
  export let onOpenProspect = () => {}; // (prospectId) => void

  $: numbers = buildNumbers(committeeId, view, thanks, campaignSummaries, last30Donations, onOpenSub, onOpenProspect);
  $: primary = numbers.primary;
  $: more = numbers.more;
  $: note = numbers.note;

  function count(value) {
    return value === null || value === undefined ? null : Number(value).toLocaleString("en-US");
  }

  function plural(n, one, many) {
    return `${Number(n || 0).toLocaleString("en-US")} ${Number(n) === 1 ? one : many}`;
  }

  function shortDate(dateKey) {
    return formatDateOnlyLabel(dateKey).replace(/, \d{4}$/, "");
  }

  function liveNoteFor(liveView) {
    if (liveView?.status === "forbidden") return "Some numbers come from the live Zeffy data, which your account does not have access to.";
    if (!liveView || liveView.status === "loading") return "Loading the live Zeffy numbers.";
    if (!liveView.connected) return "Some numbers come from the live Zeffy data, which is not connected yet.";
    return "";
  }

  // Every argument is passed in so Svelte tracks it (legacy mode does not
  // track state read inside helpers).
  function buildNumbers(id, liveView, thanksState, summaries, recent, openSub, openProspect) {
    const connected = Boolean(liveView?.connected);
    const liveNote = liveNoteFor(liveView);
    const all = [];
    const extra = [];
    let text = "";

    if (id === "donors") {
      const queue = thanksState?.status === "ready" ? thanksState.data : null;
      const donors = liveView?.live?.donors || {};
      if (queue) {
        all.push({ key: "thanks", value: count(queue.waitingCount), label: "Gifts waiting for a thank-you", action: () => openSub("donors-thanks") });
      }
      if (connected && donors.lapsedCount !== null && donors.lapsedCount !== undefined) {
        all.push({ key: "lapsed", value: count(donors.lapsedCount), label: "Lapsed donors, gave last year and not yet this year", action: () => openSub("donors-lapsed") });
      }
      all.push({ key: "owners", value: count(liveView?.ownersAssigned || 0), label: "Donors with an owner", action: () => openSub("donors-list") });
      if (connected && donors.newDonorsYtd !== null && donors.newDonorsYtd !== undefined) {
        all.push({ key: "new", value: count(donors.newDonorsYtd), label: `New donors this year${liveView.historyStartLabel ? `, records start ${liveView.historyStartLabel}` : ""}` });
      }
      if (connected && donors.returningDonorsYtd !== null && donors.returningDonorsYtd !== undefined) {
        all.push({ key: "returning", value: count(donors.returningDonorsYtd), label: "Returning donors this year" });
      }
      if (queue) {
        extra.push({ key: "overdue", value: count(queue.overdueCount), label: "Thank-yous waiting more than a week" });
        extra.push({ key: "thanked", value: count(queue.thankedLast30Days), label: "Gifts thanked in the last 30 days" });
      }
      let outreach = "";
      if (liveView?.outreachError) outreach = "Could not load the call lists";
      else if (!liveView?.activeCallListsCount) outreach = "No active call lists";
      else if (liveView.outreachCounts?.length) outreach = liveView.outreachCounts.map((row) => `${row.label} ${row.count}`).join(", ");
      else outreach = "The active call lists are empty";
      extra.push({ key: "outreach", value: "", label: `Outreach on active call lists: ${outreach}`, action: () => openSub("donors-outreach") });
      if (!connected) text = liveNote;
    } else if (id === "grants") {
      const grants = liveView?.grants || null;
      if (grants) {
        all.push({ key: "committed", value: formatCentsWhole(grants.committedYtdCents), label: grants.committedYtdCount ? `Committed this year, ${plural(grants.committedYtdCount, "grant", "grants")}` : "Committed this year" });
        all.push({ key: "pipeline", value: count(grants.pipelineCount), label: `In the pipeline, ${formatCentsWhole(grants.pipelineAskCents)} total ask`, action: () => openSub("grants-pipeline") });
        if (grants.nextDeadline) {
          const deadline = grants.nextDeadline;
          all.push({ key: "deadline", value: shortDate(deadline.date), label: `Next deadline: ${deadline.prospectName}`, action: () => openProspect(deadline.prospectId) });
        } else {
          all.push({ key: "deadline", value: "None", label: "No dated deadline in the grant research" });
        }
        extra.push({ key: "received", value: formatCentsWhole(grants.receivedYtdCents), label: "Received this year" });
        for (const row of grants.byPhase || []) {
          const parts = [plural(row.count, "grant", "grants")];
          if (row.askCents) parts.push(`${formatCentsWhole(row.askCents)} ask${row.estimated ? `, ${row.estimated} estimated` : ""}`);
          if (row.committedCents) parts.push(`${formatCentsWhole(row.committedCents)} committed`);
          extra.push({ key: `phase-${row.phase}`, value: "", label: `${row.phase}: ${parts.join(", ")}` });
        }
        if (grants.pipelineCount) {
          extra.push({ key: "with-ask", value: "", label: `${grants.pipelineWithAsk} of ${grants.pipelineCount} grants in the pipeline have an ask amount${grants.pipelineEstimated ? `, ${grants.pipelineEstimated} of them estimated from the research note` : ""}.` });
        }
        extra.push({ key: "rule", value: "", label: "A grant counts once it is Committed or Received with a committed amount, in the year of its committed date." });
      }
    } else if (id === "events") {
      const events = liveView?.events || null;
      if (connected && events) {
        all.push({ key: "revenue", value: formatCentsWhole(events.revenueCents), label: "Event revenue this year" });
        all.push({ key: "campaigns", value: count(events.campaignCount), label: "Event campaigns with payments", action: () => openSub("events-campaigns") });
        if (events.top) {
          all.push({ key: "top", value: formatCentsWhole(events.top.raisedYtdCents), label: `Top event: ${events.top.title}` });
        } else {
          all.push({ key: "top", value: "None", label: "No event payments this year yet" });
        }
        extra.push({ key: "rule", value: "", label: "Event revenue counts Zeffy ticket, auction and raffle payments this year, net of refunds." });
      } else {
        text = liveNote;
      }
      const raised = (summaries || []).reduce((sum, row) => sum + Number(row.total_raised || 0), 0);
      const gifts = (summaries || []).reduce((sum, row) => sum + Number(row.gift_count || 0), 0);
      const last30 = (recent || []).reduce((sum, row) => sum + Number(row.total_amount || 0) - Number(row.refund_amount || 0), 0);
      if ((summaries || []).length) {
        extra.push({ key: "all-time", value: formatMoney(raised), label: "Payments since July 2025, all campaigns" });
        extra.push({ key: "last30", value: formatMoney(last30), label: "Payments in the last 30 days" });
        extra.push({ key: "average", value: formatMoney(gifts ? raised / gifts : 0), label: "Average payment" });
      }
    } else if (id === "upskilling") {
      const upskilling = liveView?.upskilling || null;
      if (liveView?.givingError) {
        text = "Could not load the Giving Tuesday fundraisers.";
      } else if (upskilling) {
        all.push({ key: "signed", value: count(upskilling.signedUp), label: "Signed up to fundraise", action: () => openSub("upskilling-people") });
        all.push({ key: "with-gift", value: count(upskilling.withGift), label: "With at least one gift" });
        all.push({ key: "raised", value: formatCentsWhole(upskilling.raisedCents), label: "Raised on their pages" });
        extra.push({ key: "approved", value: count(upskilling.approved), label: "Sign-ups approved" });
        extra.push({ key: "source", value: "", label: `Peer fundraisers from ${liveView?.givingCampaignTitle || "Giving Tuesday"}. Training attendance is recorded in the Worksheet, not here.` });
      }
    }

    return { primary: all.slice(0, 3), more: [...all.slice(3), ...extra], note: text };
  }
</script>

{#if primary.length}
  <ul class="grid gap-1 sm:grid-cols-3 sm:gap-4">
    {#each primary as item (item.key)}
      <li class="min-w-0">
        {#if item.action}
          <button
            type="button"
            class="flex min-h-11 w-full items-baseline justify-between gap-3 rounded-control py-2 text-left transition hover:bg-ink/[0.03] sm:flex-col-reverse sm:items-start sm:justify-end sm:gap-1 sm:px-2 sm:-mx-2"
            onclick={item.action}
          >
            <span class="min-w-0 text-sm leading-snug text-ink/65 underline decoration-ink/20 underline-offset-2">{item.label}</span>
            <span class="shrink-0 text-xl font-bold tabular-nums text-ink sm:text-2xl">{item.value}</span>
          </button>
        {:else}
          <div class="flex min-h-11 items-baseline justify-between gap-3 py-2 sm:flex-col-reverse sm:items-start sm:justify-end sm:gap-1">
            <span class="min-w-0 text-sm leading-snug text-ink/65">{item.label}</span>
            <span class="shrink-0 text-xl font-bold tabular-nums text-ink sm:text-2xl">{item.value}</span>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

{#if note}
  <p class="mt-2 text-sm text-ink/60">{note}</p>
{/if}

{#if more.length}
  <details class="group mt-2">
    <summary class="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-ink/70 hover:text-ink [&::-webkit-details-marker]:hidden">
      <span class="group-open:hidden">More numbers</span>
      <span class="hidden group-open:inline">Fewer numbers</span>
    </summary>
    <ul class="space-y-1 pb-1">
      {#each more as item (item.key)}
        <li>
          {#if item.action}
            <button
              type="button"
              class="flex min-h-11 w-full items-baseline justify-between gap-3 rounded-control py-1.5 text-left text-sm transition hover:bg-ink/[0.03]"
              onclick={item.action}
            >
              <span class="min-w-0 text-ink/70 underline decoration-ink/20 underline-offset-2">{item.label}</span>
              {#if item.value}<span class="shrink-0 font-bold tabular-nums text-ink">{item.value}</span>{/if}
            </button>
          {:else}
            <div class="flex items-baseline justify-between gap-3 py-1.5 text-sm">
              <span class="min-w-0 text-ink/70">{item.label}</span>
              {#if item.value}<span class="shrink-0 font-bold tabular-nums text-ink">{item.value}</span>{/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </details>
{/if}
