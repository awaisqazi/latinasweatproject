<!--
  Fix one row: the amount, the donor, the paddle, the note. And, at the bottom,
  the two ways a gift leaves the screen, which are deliberately not the same
  thing (09 R5, R18):

    RETRACT  off the screen now, money stays in the books. Reversible.
    VOID     soft, reasoned, and the end of the line. Never a delete. It frees
             the (level, paddle) slot so the corrected entry can be keyed at once.

  Assigning a paddle here is also how a red "needs review" row is resolved: the
  server re-freezes the household exactly the way an entry would have.
-->
<script>
  import Sheet from "../galacheckin/Sheet.svelte";
  import { money, rowName, rowState } from "../../lib/galaTerminal/derive.js";

  let { store, row, onclose = () => {} } = $props();

  const KINDS = ["pledge", "cash", "card", "online", "ticket", "sponsor", "seed", "match", "auction", "other"];

  let amount = $state(String(row.amount ?? ""));
  let donorName = $state(row.donor_name || "");
  let paddle = $state(row.paddle_number == null ? (row.called_number == null ? "" : String(row.called_number)) : String(row.paddle_number));
  let anonymous = $state(Boolean(row.anonymous));
  let kind = $state(row.kind || "pledge");
  let note = $state(row.note || "");
  let voidReason = $state("");
  let busy = $state(false);
  let message = $state("");

  const st = $derived(rowState(row));
  const voided = $derived(Boolean(row.voided_at));

  /** Only what actually moved: an empty intersection is answered `nothing-to-change`. */
  function patch() {
    const out = {};
    const cents = Math.round((Number(amount) || 0) * 100);
    if (cents > 0 && cents !== row.amount_cents) out.amount = Number(amount);
    if ((donorName.trim() || null) !== (row.donor_name || null)) out.donor_name = donorName.trim() || null;
    if (anonymous !== Boolean(row.anonymous)) out.anonymous = anonymous;
    if (kind !== row.kind) out.kind = kind;
    if (note.trim() !== (row.note || "")) out.note = note.trim();
    const p = paddle.trim() === "" ? null : Number(paddle);
    const current = row.paddle_number ?? null;
    if (p !== current && (p === null || Number.isFinite(p))) out.paddle_number = p;
    return out;
  }

  async function save() {
    const p = patch();
    if (!Object.keys(p).length) { message = "Nothing changed yet."; return; }
    busy = true;
    const res = await store.update(row.id, p);
    busy = false;
    if (res.ok) onclose();
    else message = store.reasonText(res.reason);
  }

  async function doVoid() {
    if (!voidReason.trim()) { message = "Say why, in a few words."; return; }
    busy = true;
    const res = await store.voidGift(row.id, voidReason.trim().slice(0, 200));
    busy = false;
    if (res.ok) onclose();
    else message = store.reasonText(res.reason);
  }

  async function toggleScreen() {
    busy = true;
    const res = row.retracted_at
      ? await store.unretract(row.id)
      : await store.retract(row.id, "clerk pulled it back");
    busy = false;
    if (res.ok) onclose();
    else message = store.reasonText(res.reason);
  }
</script>

<Sheet eyebrow={`Gift #${row.seq} · ${rowName(row)}`} title={money(row.amount_cents)} {onclose} tall>
  <div class="fx">
    <p class="fx-state">
      Keyed by {row.entered_by}. {st === "voided" ? "Voided" : st === "retracted" ? "Pulled back off the screen" : st === "pending" ? "About to show" : st === "hidden" ? "Kept off the screen" : "On the screen"}.
      {#if row.needs_review}<strong> Nobody holds paddle {row.called_number}.</strong>{/if}
    </p>

    {#if !voided}
      <div class="fx-grid">
        <label class="fx-field">
          <span>Amount</span>
          <input type="text" inputmode="decimal" bind:value={amount} disabled={busy} />
        </label>
        <label class="fx-field">
          <span>Paddle</span>
          <input type="text" inputmode="numeric" placeholder="none" bind:value={paddle} disabled={busy} />
        </label>
        <label class="fx-field fx-field--wide">
          <span>Donor name, if there is no paddle</span>
          <input type="text" maxlength="200" bind:value={donorName} disabled={busy} />
        </label>
        <label class="fx-field">
          <span>Kind</span>
          <select bind:value={kind} disabled={busy}>
            {#each KINDS as k (k)}<option value={k}>{k}</option>{/each}
          </select>
        </label>
        <label class="fx-check">
          <input type="checkbox" bind:checked={anonymous} disabled={busy} />
          <span>Show as Anonymous on the screen</span>
        </label>
        <label class="fx-field fx-field--wide">
          <span>Note, for the reconciliation list</span>
          <input type="text" maxlength="300" bind:value={note} disabled={busy} />
        </label>
      </div>
    {:else}
      <p class="fx-state">A voided gift is the end of the line. Key the corrected entry instead.</p>
    {/if}

    {#if message}<p class="fx-msg" role="status">{message}</p>{/if}

    {#if !voided}
      <div class="fx-danger">
        <p class="fx-danger-head">Take it off the screen</p>
        <button type="button" class="fx-btn" onclick={toggleScreen} disabled={busy}>
          {row.retracted_at ? "Restore to the screen" : "Retract from the screen, keep the money"}
        </button>
        <p class="fx-danger-head">Void it</p>
        <label class="fx-field">
          <span>Why (required, and it is logged)</span>
          <input type="text" maxlength="200" bind:value={voidReason} disabled={busy} placeholder="keyed twice on paper" />
        </label>
        <button type="button" class="fx-btn fx-btn--bad" onclick={doVoid} disabled={busy}>Void this gift</button>
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <button type="button" class="fx-save" onclick={save} disabled={busy || voided}>
      {busy ? "Saving" : "Save the fix"}
    </button>
  {/snippet}
</Sheet>

<style>
  .fx {
    display: grid;
    gap: 12px;
    color: #1e1e1e;
  }
  .fx-state {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: rgb(30 30 30 / 0.7);
  }
  .fx-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .fx-field {
    display: grid;
    gap: 3px;
  }
  .fx-field--wide {
    grid-column: 1 / -1;
  }
  .fx-field span {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgb(30 30 30 / 0.6);
  }
  .fx-field input,
  .fx-field select {
    min-height: 52px;
    padding: 0 10px;
    font: inherit;
    font-size: 16px;
    color: #1e1e1e;
    background: rgb(255 255 255 / 0.78);
    border: 1px solid rgb(30 30 30 / 0.28);
    border-radius: 2px;
  }
  .fx-field input:focus-visible,
  .fx-field select:focus-visible {
    outline: none;
    border-color: var(--g26-gold-deep);
    box-shadow: 0 0 0 3px rgb(185 132 47 / 0.24);
  }
  .fx-check {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 48px;
    font-size: 14px;
    cursor: pointer;
  }
  .fx-check input {
    width: 22px;
    height: 22px;
    accent-color: var(--g26-gold-deep);
  }

  .fx-msg {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: #a3341f;
  }

  .fx-danger {
    display: grid;
    gap: 8px;
    padding: 12px;
    background: rgb(163 52 31 / 0.06);
    border: 1px solid rgb(163 52 31 / 0.22);
    border-radius: var(--g26-r-ctl);
  }
  .fx-danger-head {
    margin: 0;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgb(30 30 30 / 0.6);
  }
  .fx-btn {
    min-height: 56px;
    font-family: var(--g26-sans);
    font-size: 13px;
    font-weight: 800;
    color: #1e1e1e;
    background: transparent;
    border: 1px solid rgb(30 30 30 / 0.3);
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }
  .fx-btn--bad {
    color: #fff8ef;
    background: #a3341f;
    border-color: #a3341f;
  }
  .fx-btn:disabled,
  .fx-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .fx-save {
    min-height: 56px;
    font-family: var(--g26-sans);
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--g26-ink);
    background: var(--g26-gold);
    border: 1px solid var(--g26-gold-deep);
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }

  @media (max-width: 520px) {
    .fx-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
