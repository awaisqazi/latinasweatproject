<script>
  // Asked before a grant moves to Committed (amount and date) or Received
  // (date only), from the board or the drawer. A date left empty is filled
  // in by the database with today's date; a date given is never changed.
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Field from "../ui/Field.svelte";
  import { formatMoney, moneyInputValue, parseMoneyInput } from "../../../lib/dashboard/fundraising";
  import { chicagoToday } from "../../../lib/dashboard/timeclock";

  export let open = false;
  export let mode = "commit"; // commit | receive
  export let prospect = null;
  export let busy = false;
  export let onConfirm = () => {}; // (updates) => void, updates holds only the fields to write
  export let onCancel = () => {};

  let amountDraft = "";
  let dateDraft = "";
  let amountError = "";
  let lastKey = "";

  $: key = open && prospect ? `${prospect.id}|${mode}` : "";
  $: if (key !== lastKey) {
    lastKey = key;
    if (key) reset();
  }
  $: hasAmountField = Boolean(prospect) && "committed_amount" in prospect;
  $: missingAmount =
    mode === "receive" && hasAmountField && !(Number(prospect?.committed_amount) > 0);

  function reset() {
    amountDraft = moneyInputValue(prospect?.committed_amount ?? prospect?.ask_amount ?? "");
    dateDraft = chicagoToday();
    amountError = "";
  }

  function confirm() {
    if (mode === "commit") {
      const amount = parseMoneyInput(amountDraft);
      if (amount === undefined) {
        amountError = "Enter the amount in dollars, for example $12,500.";
        return;
      }
      const updates = { stage: "Committed" };
      if (hasAmountField) updates.committed_amount = amount;
      if (hasAmountField && dateDraft) updates.committed_on = dateDraft;
      onConfirm(updates);
      return;
    }
    const updates = { stage: "Received" };
    if (hasAmountField && dateDraft) updates.received_on = dateDraft;
    onConfirm(updates);
  }
</script>

<ConfirmDialog
  {open}
  title={mode === "commit" ? `Mark ${prospect?.name || "this grant"} committed` : `Mark ${prospect?.name || "this grant"} received`}
  confirmLabel={mode === "commit" ? "Mark committed" : "Mark received"}
  tone="primary"
  {busy}
  onConfirm={confirm}
  {onCancel}
>
  {#if !hasAmountField}
    <p>The grant amount fields are not set up yet, so only the phase will change.</p>
  {:else if mode === "commit"}
    <div class="space-y-4 text-ink">
      <Field
        label="Committed amount"
        id="grant-commit-amount"
        error={amountError}
        hint={prospect?.ask_amount ? `The ask was ${formatMoney(prospect.ask_amount)}.` : "Leave empty if the amount is not known yet. The grant counts in the totals once it has one."}
      >
        <input
          id="grant-commit-amount"
          type="text"
          inputmode="decimal"
          class="input"
          placeholder="$12,500"
          bind:value={amountDraft}
          disabled={busy}
          oninput={() => (amountError = "")}
        />
      </Field>
      <Field label="Committed on" id="grant-commit-date" hint="It counts toward this date's calendar year.">
        <input id="grant-commit-date" type="date" class="input" bind:value={dateDraft} disabled={busy} />
      </Field>
    </div>
  {:else}
    <div class="space-y-4 text-ink">
      <Field label="Received on" id="grant-receive-date">
        <input id="grant-receive-date" type="date" class="input" bind:value={dateDraft} disabled={busy} />
      </Field>
      {#if missingAmount}
        <p class="text-sm text-ink/65">
          No committed amount is set, so this grant will not count in the totals until one is added in its details.
        </p>
      {/if}
    </div>
  {/if}
</ConfirmDialog>
