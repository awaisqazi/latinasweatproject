<script>
  // Annual goal tracker. Goals live in app_settings.fundraising_goals as
  // cents by year ({"2027": 100000000}); only a superuser can write them
  // (RLS). With no goal stored this shows nothing, except a quiet "Set a
  // goal" link for superusers.
  import { Pencil, Save, X } from "@lucide/svelte";
  import Banner from "../../ui/Banner.svelte";
  import Button from "../../ui/Button.svelte";
  import Field from "../../ui/Field.svelte";
  import Panel from "../../ui/Panel.svelte";
  import { centsToInput, parseDollarsToCents } from "../../../../lib/dashboard/givingAdmin";
  import { formatCentsWhole, saveGoal } from "../../../../lib/dashboard/fundraisingLive";

  export let supabase;
  export let goal = null; // goalProgress() result, or null
  export let goalsValue = null; // the stored jsonb, as loaded
  export let canEdit = false;
  export let currentYear = new Date().getFullYear();
  export let onSaved = () => {};

  let editing = false;
  let draftYear = "";
  let draftAmount = "";
  let saving = false;
  let saveError = "";

  $: percentShown = goal?.percent === null || goal?.percent === undefined ? null : goal.percent;
  $: barWidth = percentShown === null ? 0 : Math.min(100, Math.max(0, percentShown));

  function startEdit() {
    draftYear = String(goal?.year || currentYear + 1);
    draftAmount = goal ? centsToInput(goal.cents) : "";
    saveError = "";
    editing = true;
  }

  async function save(event) {
    event?.preventDefault();
    if (saving) return;
    const year = Number(draftYear);
    if (!Number.isInteger(year) || year < currentYear - 1 || year > currentYear + 10) {
      saveError = `Enter a year between ${currentYear - 1} and ${currentYear + 10}.`;
      return;
    }
    const cents = parseDollarsToCents(draftAmount);
    if (!cents) {
      saveError = "Enter the goal in dollars, for example 1000000.";
      return;
    }
    saving = true;
    saveError = "";
    const { value, error } = await saveGoal(supabase, goalsValue, year, cents);
    saving = false;
    if (error) {
      saveError = error.message || "The goal could not be saved.";
      return;
    }
    editing = false;
    onSaved(value);
  }
</script>

{#if goal || editing}
  <Panel title={goal && !editing ? `${goal.year} goal${goal.mode === "upcoming" ? " (upcoming)" : ""}` : "Annual goal"} id="fundraising-live-goal-title">
    <svelte:fragment slot="actions">
      {#if canEdit && !editing}
        <Button size="sm" variant="ghost" icon={Pencil} onclick={startEdit}>Edit goal</Button>
      {/if}
    </svelte:fragment>

    {#if editing}
      <form class="space-y-4" onsubmit={save}>
        <div class="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Field label="Year" id="fundraising-goal-year">
            <input
              id="fundraising-goal-year"
              type="number"
              inputmode="numeric"
              class="input"
              min={currentYear - 1}
              max={currentYear + 10}
              bind:value={draftYear}
              disabled={saving}
            />
          </Field>
          <Field label="Goal in dollars" id="fundraising-goal-amount" hint="Zeffy payments only, in whole dollars.">
            <input
              id="fundraising-goal-amount"
              type="text"
              inputmode="decimal"
              class="input"
              placeholder="1000000"
              bind:value={draftAmount}
              disabled={saving}
            />
          </Field>
        </div>
        {#if saveError}
          <Banner tone="error" message={saveError} />
        {/if}
        <div class="flex justify-end gap-2">
          <Button size="sm" variant="ghost" icon={X} disabled={saving} onclick={() => (editing = false)}>Cancel</Button>
          <Button size="sm" variant="primary" type="submit" icon={Save} loading={saving}>Save goal</Button>
        </div>
      </form>
    {:else if goal}
      {#if goal.mode === "current"}
        <p class="text-3xl font-bold tabular-nums text-ink">
          {goal.baselineCents === null ? "n/a" : formatCentsWhole(goal.baselineCents)}
          <span class="text-base font-semibold text-ink/55">of {formatCentsWhole(goal.cents)}</span>
        </p>
      {:else}
        <p class="text-3xl font-bold tabular-nums text-ink">{formatCentsWhole(goal.cents)}</p>
        <p class="mt-1 text-sm text-ink/65">Proposed for {goal.year}. The last 12 months are the baseline.</p>
      {/if}

      <div
        class="mt-4 h-2 overflow-hidden rounded-full bg-ink/[0.06]"
        role="progressbar"
        aria-label={goal.mode === "current" ? "Raised this year toward the goal" : "Last 12 months compared with the goal"}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={barWidth}
      >
        <div class="h-full rounded-full bg-accent" style="width: {barWidth}%"></div>
      </div>

      <p class="mt-2 text-sm text-ink/75">
        {#if goal.baselineCents === null}
          The live totals are not available, so progress cannot be shown.
        {:else if goal.mode === "current"}
          {percentShown}% raised this year · {formatCentsWhole(goal.remainingCents)} to go
        {:else}
          The last 12 months brought in {formatCentsWhole(goal.baselineCents)}, {percentShown}% of the goal.
          {#if goal.multiple}
            {" "}Reaching it means about {goal.multiple} times that pace.
          {/if}
        {/if}
      </p>
    {/if}

    <p class="mt-4 border-t border-ink/8 pt-3 text-xs leading-5 text-ink/55">
      Counts Zeffy payments only. Grants, checks and sponsor invoices are not in Zeffy, so they are not in this number.
    </p>
  </Panel>
{:else if canEdit}
  <div class="flex justify-end">
    <Button size="sm" variant="ghost" icon={Pencil} onclick={startEdit}>Set an annual goal</Button>
  </div>
{/if}
