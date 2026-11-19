<script>
  // The superuser's goal editor, inside the Overview goal block. Goals live
  // in app_settings.fundraising_goals as cents by year ({"2027": 100000000});
  // only a superuser can write them (RLS).
  import { Save, X } from "@lucide/svelte";
  import Banner from "../../../ui/Banner.svelte";
  import Button from "../../../ui/Button.svelte";
  import Field from "../../../ui/Field.svelte";
  import { centsToInput, parseDollarsToCents } from "../../../../../lib/dashboard/givingAdmin";
  import { saveGoal } from "../../../../../lib/dashboard/fundraisingLive";

  export let supabase;
  export let goal = null; // goalProgress() result, or null
  export let goalsValue = null; // the stored jsonb, as loaded
  export let currentYear = new Date().getFullYear();
  export let includesGrants = false;
  export let onSaved = () => {};
  export let onCancel = () => {};

  let draftYear = String(goal?.year || currentYear + 1);
  let draftAmount = goal ? centsToInput(goal.cents) : "";
  let saving = false;
  let saveError = "";

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
    onSaved(value);
  }
</script>

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
    <Field
      label="Goal in dollars"
      id="fundraising-goal-amount"
      hint={includesGrants ? "Zeffy payments plus committed grants, in whole dollars." : "Zeffy payments only, in whole dollars."}
    >
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
    <Button class="min-h-11!" variant="ghost" icon={X} disabled={saving} onclick={onCancel}>Cancel</Button>
    <Button class="min-h-11!" variant="primary" type="submit" icon={Save} loading={saving}>Save goal</Button>
  </div>
</form>
