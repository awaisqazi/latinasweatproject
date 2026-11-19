<script>
  // Overview: the board's "come back to the table" view. Each dollar
  // subcommittee's low / realistic / stretch plan from its worksheet, the
  // totals, and how the realistic total compares with the goal, in plain
  // words. Membership Upskilling plans in people, shown under the table.
  // LiveData loads fundraising_goal_rollup; this stays hidden while the RPC
  // is not deployed, and for accounts it refuses.
  import Banner from "../../ui/Banner.svelte";
  import Panel from "../../ui/Panel.svelte";
  import { formatChicagoDateLabel } from "../../../../lib/dashboard/timeclock";
  import { formatCentsWhole, parseGoals } from "../../../../lib/dashboard/fundraisingLive";
  import { ROLLUP_CYCLE, rollupSummary } from "../../../../lib/dashboard/fundraisingRollup";

  export let state = null; // view.rollup: { status, data, error, loading }
  export let cycle = ROLLUP_CYCLE;
  export let goalsValue = null; // app_settings.fundraising_goals, the fallback goal
  export let onRetry = () => {};
  export let onOpenWorksheet = () => {};

  $: status = state?.status || "idle";
  $: rollup = state?.data || null;
  $: errorText = state?.error || "";
  $: loading = Boolean(state?.loading);
  $: fallbackGoalCents = parseGoals(goalsValue).find((goal) => String(goal.year) === String(cycle))?.cents || null;
  $: summary = rollupSummary(rollup, fallbackGoalCents);
  $: people = rollup?.people || null;

  function money(cents) {
    return cents === null || cents === undefined ? "" : formatCentsWhole(cents);
  }

  function amount(value) {
    return value === null || value === undefined ? "" : Number(value).toLocaleString();
  }
</script>

{#if status === "error"}
  <Panel title={`${cycle} plans against the goal`} id="fundraising-rollup-title">
    <Banner
      tone="warning"
      message={`The subcommittee plans could not be loaded${errorText ? ` (${errorText})` : ""}.`}
      {onRetry}
    />
  </Panel>
{:else if status === "ready" && rollup && summary}
  <Panel title={`${cycle} plans against the goal`} id="fundraising-rollup-title" loading={loading}>
    <p class="text-base font-semibold leading-snug text-ink">{summary.sentence}</p>
    {#if summary.incompleteNote}
      <p class="mt-1 text-sm text-ink/60">{summary.incompleteNote}</p>
    {/if}

    <div class="mt-4 overflow-x-auto">
      <table class="w-full min-w-[20rem] text-sm">
        <caption class="sr-only">Each subcommittee's plan for {cycle}, in dollars</caption>
        <thead>
          <tr class="text-left text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
            <th scope="col" class="pb-1.5 pr-3 font-bold">Subcommittee</th>
            <th scope="col" class="pb-1.5 pl-2 text-right font-bold">Low</th>
            <th scope="col" class="pb-1.5 pl-2 text-right font-bold">Realistic</th>
            <th scope="col" class="pb-1.5 pl-2 text-right font-bold">Stretch</th>
          </tr>
        </thead>
        <tbody>
          {#each rollup.rows as row (row.id)}
            <tr class="border-t border-ink/8 align-top">
              <th scope="row" class="py-2 pr-3 text-left font-semibold text-ink">
                {row.tabLabel}
                {#if row.sized && row.updatedAt}
                  <span class="block text-xs font-normal text-ink/50">Updated {formatChicagoDateLabel(row.updatedAt)}</span>
                {/if}
                {#if row.id === "grants" && rollup.grantsCommittedCents !== null}
                  <span class="block text-xs font-normal text-ink/65">Already committed for {cycle}: {money(rollup.grantsCommittedCents)}</span>
                {/if}
              </th>
              {#if row.sized}
                <td class="py-2 pl-2 text-right tabular-nums text-ink/80">{money(row.lowCents)}</td>
                <td class="py-2 pl-2 text-right font-semibold tabular-nums text-ink">{money(row.realisticCents)}</td>
                <td class="py-2 pl-2 text-right tabular-nums text-ink/80">{money(row.stretchCents)}</td>
              {:else}
                <td colspan="3" class="py-2 pl-2 text-right text-ink/60">
                  Not sized yet{" · "}<button
                    type="button"
                    class="font-semibold text-ink underline decoration-ink/20 underline-offset-2 hover:decoration-ink/60"
                    onclick={() => onOpenWorksheet(row.id)}
                  >Open its worksheet</button>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr class="border-t-2 border-ink/15">
            <th scope="row" class="py-2 pr-3 text-left font-bold text-ink">Total</th>
            <td class="py-2 pl-2 text-right font-bold tabular-nums text-ink">{rollup.sizedCount ? money(rollup.totals.lowCents) : ""}</td>
            <td class="py-2 pl-2 text-right font-bold tabular-nums text-ink">{rollup.sizedCount ? money(rollup.totals.realisticCents) : ""}</td>
            <td class="py-2 pl-2 text-right font-bold tabular-nums text-ink">{rollup.sizedCount ? money(rollup.totals.stretchCents) : ""}</td>
          </tr>
          {#if summary.goalCents}
            <tr>
              <th scope="row" class="py-1 pr-3 text-left font-semibold text-ink/65">Goal</th>
              <td colspan="3" class="py-1 pl-2 text-right tabular-nums text-ink/65">{money(summary.goalCents)}</td>
            </tr>
          {/if}
        </tfoot>
      </table>
    </div>

    {#if people}
      <h4 class="mt-5 text-sm font-bold text-ink">{people.tabLabel}, planned in people</h4>
      {#if people.sized}
        <div class="mt-2 overflow-x-auto">
          <table class="w-full min-w-[20rem] text-sm">
            <caption class="sr-only">{people.name} plan for {cycle}, in people</caption>
            <thead>
              <tr class="text-left text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
                <th scope="col" class="pb-1.5 pr-3 font-bold">Measure</th>
                <th scope="col" class="pb-1.5 pl-2 text-right font-bold">Low</th>
                <th scope="col" class="pb-1.5 pl-2 text-right font-bold">Realistic</th>
                <th scope="col" class="pb-1.5 pl-2 text-right font-bold">Stretch</th>
              </tr>
            </thead>
            <tbody>
              {#each people.metrics as metric (metric.key)}
                <tr class="border-t border-ink/8">
                  <th scope="row" class="py-1.5 pr-3 text-left font-normal text-ink/80">{metric.label}</th>
                  <td class="py-1.5 pl-2 text-right tabular-nums text-ink/80">{amount(metric.low)}</td>
                  <td class="py-1.5 pl-2 text-right font-semibold tabular-nums text-ink">{amount(metric.realistic)}</td>
                  <td class="py-1.5 pl-2 text-right tabular-nums text-ink/80">{amount(metric.stretch)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="mt-1 text-sm text-ink/60">
          Not sized yet{" · "}<button
            type="button"
            class="font-semibold text-ink underline decoration-ink/20 underline-offset-2 hover:decoration-ink/60"
            onclick={() => onOpenWorksheet(people.id)}
          >Open its worksheet</button>
        </p>
      {/if}
    {/if}

    <p class="mt-4 text-xs leading-5 text-ink/55">
      From each subcommittee's {cycle} worksheet. These are plans, not money raised, and they include grants and other income that Zeffy does not see.
    </p>
  </Panel>
{/if}
