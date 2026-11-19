<script>
  // Overview block 1: where are we against the goal? One headline, one bar
  // (counted for the goal year, what realistic plans add, the gap), one
  // sentence that reads the bar out, the baseline before the goal year
  // starts, and each subcommittee's plan behind a disclosure. The goal is
  // edited here by superusers. `bar` is goalBarModel() output, worked out
  // once in FundraisingLiveOverview so the board report prints the same.
  import { Pencil } from "@lucide/svelte";
  import Button from "../../../ui/Button.svelte";
  import Panel from "../../../ui/Panel.svelte";
  import GoalEditForm from "./GoalEditForm.svelte";
  import { formatChicagoDateLabel } from "../../../../../lib/dashboard/timeclock";
  import { formatCentsWhole } from "../../../../../lib/dashboard/fundraisingLive";
  import { ROLLUP_CYCLE, rollupSummary } from "../../../../../lib/dashboard/fundraisingRollup";

  export let supabase;
  export let view = null; // LiveData's view
  export let bar = null; // goalBarModel() output, or null without a goal
  export let onOpenWorksheet = () => {};

  let editing = false;

  $: goal = view?.goal || null;
  $: canEdit = Boolean(view?.canEdit);
  $: includesGrants = Boolean(view?.liveGrants);
  $: rollupStatus = view?.rollup?.status || "idle";
  $: rollup = rollupStatus === "ready" ? view?.rollup?.data || null : null;
  $: rollupLoading = rollupStatus === "loading" || rollupStatus === "idle";
  $: rollupFailed = rollupStatus === "error";
  $: cycle = rollup?.cycle || ROLLUP_CYCLE;
  // Without a goal, the plans still get their own plain sentence.
  $: noGoalSummary = !bar && rollup ? rollupSummary(rollup, null) : null;
  $: last12 = view?.combined?.last12Months || null;
  $: zeffyLast12 = view?.totals?.last12Months || null;
  $: showBaseline = Boolean(bar?.upcoming) && Boolean(view?.connected) && Boolean(zeffyLast12);
  $: visible = Boolean(bar) || Boolean(rollup) || (canEdit && Boolean(view?.goalsLoaded)) || editing;
  $: countedLabel = bar
    ? bar.upcoming
      ? `Grants committed for ${bar.year}`
      : `Counted in ${bar.year}`
    : "";
  $: headline = bar ? `${bar.year} goal: ${formatCentsWhole(bar.goalCents)}` : `${cycle} goal`;

  function money(cents) {
    return cents === null || cents === undefined ? "" : formatCentsWhole(cents);
  }

  function amount(value) {
    return value === null || value === undefined ? "n/a" : Number(value).toLocaleString("en-US");
  }

  function saved(value) {
    editing = false;
    view?.actions?.goalSaved?.(value);
  }
</script>

{#if visible}
  <Panel id="fundraising-goal-title">
    <div class="flex items-start justify-between gap-3">
      <h3 id="fundraising-goal-title" class="text-xl font-bold leading-tight text-ink">
        {#if bar}{headline}{:else if editing}Annual goal{:else}No goal is set for {cycle} yet{/if}
      </h3>
      {#if canEdit && !editing}
        <Button class="min-h-11!" variant="ghost" icon={Pencil} onclick={() => (editing = true)}>
          {bar ? "Edit goal" : "Set goal"}
        </Button>
      {/if}
    </div>

    {#if editing}
      <div class="mt-4">
        <GoalEditForm
          {supabase}
          {goal}
          goalsValue={view?.goalsValue}
          currentYear={view?.currentYear}
          {includesGrants}
          onSaved={saved}
          onCancel={() => (editing = false)}
        />
      </div>
    {:else if bar}
      <div
        class="mt-4 flex h-3 overflow-hidden rounded-full bg-ink/[0.07]"
        role="img"
        aria-label={`${countedLabel}: ${money(bar.countedCents)}.${bar.plansApply ? ` Rest of the realistic plans: ${money(bar.plansCents)}.` : ""} Still to find: ${money(bar.gapCents)}.`}
      >
        <span class="block h-full bg-accent" style="width: {bar.countedPercent}%"></span>
        <span class="block h-full bg-accent/35" style="width: {bar.plansPercent}%"></span>
      </div>

      <dl class="mt-3 grid grid-cols-3 gap-3">
        <div class="min-w-0">
          <dt class="flex items-start gap-1.5 text-xs leading-4 text-ink/60">
            <span class="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-accent" aria-hidden="true"></span>
            {countedLabel}
          </dt>
          <dd class="mt-1 text-base font-bold tabular-nums text-ink">{bar.countedKnown ? money(bar.countedCents) : "n/a"}</dd>
        </div>
        {#if bar.plansApply}
          <div class="min-w-0">
            <dt class="flex items-start gap-1.5 text-xs leading-4 text-ink/60">
              <span class="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-accent/35" aria-hidden="true"></span>
              Rest of the plans
            </dt>
            <dd class="mt-1 text-base font-bold tabular-nums text-ink">{bar.sizedCount ? money(bar.plansCents) : "Not sized"}</dd>
          </div>
        {/if}
        <div class="min-w-0">
          <dt class="flex items-start gap-1.5 text-xs leading-4 text-ink/60">
            <span class="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-ink/[0.12]" aria-hidden="true"></span>
            Still to find
          </dt>
          <dd class="mt-1 text-base font-bold tabular-nums text-ink">{money(bar.gapCents)}</dd>
        </div>
      </dl>

      <p class="mt-3 text-base font-semibold leading-snug text-ink">{bar.sentence}</p>
      {#if bar.unsizedNote}
        <p class="mt-1 text-sm text-ink/60">{bar.unsizedNote}</p>
      {/if}
      {#if !bar.countedKnown}
        <p class="mt-1 text-sm text-ink/60">The live numbers are not connected, so money already counted is not shown.</p>
      {/if}
      {#if rollupFailed}
        <p class="mt-1 text-sm text-ink/60">
          The subcommittee plans could not be loaded.{" "}<button
            type="button"
            class="inline-flex min-h-11 items-center font-semibold text-ink underline decoration-ink/25 underline-offset-2"
            onclick={() => view?.actions?.refreshRollup?.()}
          >Try again</button>
        </p>
      {:else if rollupLoading && !bar.plansApply}
        <p class="mt-1 text-sm text-ink/50">Loading the subcommittee plans…</p>
      {/if}
      {#if showBaseline}
        <p class="mt-3 text-sm leading-snug text-ink/75">
          Last 12 months, the baseline: <span class="font-semibold text-ink">{money(last12 ? last12.amountCents : zeffyLast12.amountCents)}</span>{#if last12 && last12.grantsCents !== null}
            {" "}({money(last12.zeffyCents)} in Zeffy payments and {money(last12.grantsCents)} in grants).
          {:else}
            {" "}in Zeffy payments.
          {/if}
        </p>
      {/if}
    {:else if noGoalSummary}
      <p class="mt-3 text-base font-semibold leading-snug text-ink">{noGoalSummary.sentence}</p>
    {/if}

    {#if !editing && rollup}
      <details class="group mt-3">
        <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-control text-sm font-semibold text-ink hover:bg-ink/[0.03] [&::-webkit-details-marker]:hidden">
          <span>Plan by subcommittee</span>
          <span class="text-xs font-semibold text-ink/55 group-open:hidden">Show</span>
          <span class="hidden text-xs font-semibold text-ink/55 group-open:inline">Hide</span>
        </summary>
        <ul class="mt-1 space-y-1">
          {#each rollup.rows as row (row.id)}
            <li>
              <button
                type="button"
                class="flex min-h-11 w-full items-start justify-between gap-3 rounded-control px-2 py-2 text-left hover:bg-ink/[0.03]"
                onclick={() => onOpenWorksheet(row.id)}
              >
                <span class="min-w-0">
                  <span class="block text-sm font-semibold text-ink">{row.tabLabel}</span>
                  <span class="block text-xs text-ink/55">
                    {#if row.sized}
                      Low {money(row.lowCents) || "n/a"}, stretch {money(row.stretchCents) || "n/a"}{row.updatedAt ? `, updated ${formatChicagoDateLabel(row.updatedAt)}` : ""}
                    {:else}
                      Open its worksheet to size the plan
                    {/if}
                  </span>
                </span>
                <span class="shrink-0 text-right text-sm font-bold tabular-nums text-ink">
                  {row.sized ? money(row.realisticCents) || "n/a" : "Not sized"}
                </span>
              </button>
            </li>
          {/each}
          {#if rollup.people}
            <li>
              <button
                type="button"
                class="flex min-h-11 w-full items-start justify-between gap-3 rounded-control px-2 py-2 text-left hover:bg-ink/[0.03]"
                onclick={() => onOpenWorksheet(rollup.people.id)}
              >
                <span class="min-w-0">
                  <span class="block text-sm font-semibold text-ink">{rollup.people.tabLabel}, in people</span>
                  {#if rollup.people.sized}
                    {#each rollup.people.metrics.filter((metric) => metric.sized) as metric (metric.key)}
                      <span class="block text-xs text-ink/55">
                        {metric.label}: low {amount(metric.low)}, realistic {amount(metric.realistic)}, stretch {amount(metric.stretch)}
                      </span>
                    {/each}
                  {:else}
                    <span class="block text-xs text-ink/55">Open its worksheet to size the plan</span>
                  {/if}
                </span>
                {#if !rollup.people.sized}
                  <span class="shrink-0 text-right text-sm font-bold text-ink">Not sized</span>
                {/if}
              </button>
            </li>
          {/if}
        </ul>
        {#if rollup.sizedCount}
          <p class="mt-2 px-2 text-sm text-ink/75">
            All realistic plans: <span class="font-semibold text-ink">{money(rollup.totals.realisticCents)}</span>
            (low {money(rollup.totals.lowCents)}, stretch {money(rollup.totals.stretchCents)}).
          </p>
        {/if}
        <p class="mt-2 px-2 text-xs leading-5 text-ink/55">
          From each subcommittee's {cycle} worksheet. These are plans, not money raised.
        </p>
      </details>
    {/if}

    {#if !editing && bar}
      <p class="mt-3 text-xs leading-5 text-ink/55">
        {#if includesGrants}
          Counts Zeffy payments and grants marked committed or received. Checks and sponsor invoices outside Zeffy are not included.
        {:else}
          Counts Zeffy payments only. Grants, checks and sponsor invoices are not in Zeffy, so they are not in this number.
        {/if}
      </p>
    {/if}
  </Panel>
{/if}
