<!--
  Somebody is at the door who is not on the list.

  Name, optional phone, one tap: the server creates the guest, checks them in
  and hands out the NEXT FREE paddle in one call, or none of it happens. The
  number appears only after the server answers (a spinner until then), so two
  phones tapping "Walk-in" at the same instant each read out their own,
  different number (concurrency test, section M).

  Opened from a party sheet ("Add a guest to this party"), the new guest SHARES
  that household's paddle by default (organizer, Sep 25: households share), and
  can be switched to a paddle of their own.

  A weak signal never makes a twin: if the answer does not come back, the
  button becomes "Not saved, tap to retry" and resends the SAME op id, which the
  server answers as a replay of the walk-in that may already exist.
-->
<script>
  import { getContext, untrack } from "svelte";
  import { LoaderCircle } from "@lucide/svelte";
  import { LATE_NIGHT } from "../../lib/galaCheckin/derive.js";
  import Sheet from "./Sheet.svelte";
  import PaddleChip from "./PaddleChip.svelte";

  const { store, ui } = getContext("gala-checkin");

  const partyLabel = $derived(ui.walkIn?.partyLabel || "");
  const joinName = $derived(ui.walkIn?.joinName || "");
  const joinPaddle = $derived(ui.walkIn?.joinPaddle ?? null);

  let name = $state("");
  let phone = $state("");
  let email = $state("");
  let table = $state("");
  let lateNight = $state(false);
  let note = $state("");
  let share = $state(true);
  let more = $state(false);
  let saving = $state(false);
  let error = $state("");
  let stuckOp = $state("");
  let success = $state(null);   // null | { name, paddle, holder }

  const ready = $derived(name.trim().length > 0 && !saving);

  function reset() {
    name = "";
    phone = "";
    email = "";
    note = "";
    more = false;
    share = Boolean(ui.walkIn?.joinGuestId);
    const host = ui.walkIn?.joinGuestId ? store.guestsById[ui.walkIn.joinGuestId] : null;
    lateNight = host ? !host.has_dinner : false;
    table = ui.walkIn?.tableNumber != null ? String(ui.walkIn.tableNumber) : "";
    error = "";
    stuckOp = "";
    success = null;
    saving = false;
  }

  // Fresh form every time the sheet opens. Never carries a name from the
  // previous walk-in into the next one.
  // untrack: reset() reads live store rows, and a poll landing mid-typing must
  // never wipe the form. Only a NEW ui.walkIn object re-arms it.
  $effect(() => {
    if (ui.walkIn) untrack(reset);
  });

  function landed(res, guest) {
    const row = (res.guests || []).find((g) => (res.newly || []).includes(g.id)) || null;
    const mates = row ? store.groupMembers(row.paddle_group).filter((m) => m.id !== row.id && m.checked_in_at) : [];
    success = { name: guest.name, paddle: res.paddle_number ?? row?.paddle_number ?? null, holder: mates[0]?.name || "" };
  }

  function explain(res) {
    if (res.reason === "missing-name") return "A name is the one thing we need.";
    if (res.reason === "needs-connection") return "No connection. Write the name on the paper list; add them here when the pill turns green.";
    if (res.reason === "pool-empty") return "No free paddles left in the box. Ask the lead.";
    if (res.reason === "unknown-guest") return "That party changed. Close this and open the party again.";
    return "Something went wrong, try again.";
  }

  async function submit(event) {
    event?.preventDefault();
    if (!ready) {
      error = "A name is the one thing we need.";
      return;
    }
    saving = true;
    error = "";

    const guest = {
      name: name.trim().slice(0, 160),
      email: email.trim().slice(0, 200),
      phone: phone.trim().slice(0, 40),
      has_dinner: !lateNight,
      door_note: note.trim().slice(0, 300),
    };
    if (lateNight) guest.ticket_type = "late-night";
    if (/^\d{1,3}$/.test(table.trim())) guest.table_number = table.trim();
    if (share && ui.walkIn?.joinGuestId) guest.join_guest_id = ui.walkIn.joinGuestId;

    const res = await store.walkIn(guest, { assign_paddle: true });
    saving = false;
    if (res.ok) return landed(res, guest);
    if (res.transient && res.opId) {
      stuckOp = res.opId;
      error = "Not saved yet: the signal dropped. Tap to retry; it will not add them twice.";
      return;
    }
    error = explain(res);
    if (!["missing-name", "needs-connection", "pool-empty", "unknown-guest"].includes(res.reason)) console.warn("[walk-in] refused", res.reason, res);
  }

  async function retry() {
    if (!stuckOp) return;
    saving = true;
    const res = await store.retry(stuckOp);
    saving = false;
    if (res?.ok) {
      stuckOp = "";
      error = "";
      return landed(res, { name: name.trim() });
    }
    if (res?.transient) return;
    stuckOp = "";
    error = explain(res || {});
  }
</script>

{#if ui.walkIn}
  <Sheet
    eyebrow={success ? "Checked in" : partyLabel ? "Add a guest" : "Walk-in"}
    title={success ? success.name : partyLabel ? `With ${partyLabel}` : "New guest at the door"}
    onclose={() => ui.closeWalkIn()}
    initialFocus={success ? "" : "#wi-name"}
  >
    {#if success}
      <div class="wi-success">
        <PaddleChip number={success.paddle} size="xl" />
        {#if success.holder}
          <p class="wi-success-line wi-success-line--out">Paddle {success.paddle} is already with {success.holder}. No new paddle.</p>
        {:else if success.paddle != null}
          <p class="wi-success-line">Hand over paddle {success.paddle}</p>
        {/if}
      </div>
    {:else}
      <form id="walkin-form" class="wi" onsubmit={submit} novalidate>
        <div class="wi-row">
          <label class="glabel" for="wi-name">Name <span class="wi-req">required</span></label>
          <input
            id="wi-name"
            class="ginput"
            type="text"
            autocapitalize="words"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="go"
            autocomplete="off"
            maxlength="80"
            placeholder="First and last name"
            bind:value={name}
            disabled={Boolean(stuckOp)}
          />
        </div>
        <div class="wi-row">
          <label class="glabel" for="wi-phone">Phone <span class="wi-opt-note">optional</span></label>
          <input id="wi-phone" class="ginput" type="tel" inputmode="tel" autocomplete="off" maxlength="40" enterkeyhint="go" bind:value={phone} disabled={Boolean(stuckOp)} />
        </div>

        {#if ui.walkIn.joinGuestId}
          <fieldset class="wi-fieldset">
            <legend class="glabel">Paddle</legend>
            <div class="wi-seg">
              <button type="button" class="wi-opt" class:wi-opt--on={share} aria-pressed={share} onclick={() => (share = true)}>
                {joinPaddle != null ? `Share paddle ${joinPaddle}` : `Share with ${joinName}`}
              </button>
              <button type="button" class="wi-opt" class:wi-opt--on={!share} aria-pressed={!share} onclick={() => (share = false)}>
                Own paddle
              </button>
            </div>
          </fieldset>
        {/if}

        {#if more}
          <fieldset class="wi-fieldset">
            <legend class="glabel">Ticket</legend>
            <div class="wi-seg">
              <button type="button" class="wi-opt" class:wi-opt--on={!lateNight} aria-pressed={!lateNight} onclick={() => (lateNight = false)}>Dinner</button>
              <button type="button" class="wi-opt" class:wi-opt--on={lateNight} aria-pressed={lateNight} onclick={() => (lateNight = true)}>{LATE_NIGHT}</button>
            </div>
          </fieldset>
          <div class="wi-row">
            <label class="glabel" for="wi-table">Table <span class="wi-opt-note">optional</span></label>
            <input id="wi-table" class="ginput" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" bind:value={table} />
          </div>
          <div class="wi-row">
            <label class="glabel" for="wi-email">Email <span class="wi-opt-note">optional</span></label>
            <input id="wi-email" class="ginput" type="email" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="200" bind:value={email} />
          </div>
          <div class="wi-row">
            <label class="glabel" for="wi-note">Note for the desk <span class="wi-opt-note">optional</span></label>
            <input id="wi-note" class="ginput" type="text" maxlength="120" bind:value={note} />
          </div>
        {:else}
          <button type="button" class="wi-more" onclick={() => (more = true)}>
            + Ticket, table, email, note{lateNight ? ` (${LATE_NIGHT})` : ""}
          </button>
        {/if}

        {#if error}
          <p class="wi-error" role="alert">{error}</p>
        {/if}
      </form>
    {/if}

    {#snippet footer()}
      {#if success}
        <button type="button" class="gbtn gbtn--gold gbtn--lg" onclick={() => { ui.closeWalkIn(); ui.nextGuest(); }}>Done, next guest</button>
        <button type="button" class="gbtn gbtn--quiet" onclick={reset}>Add another walk-in</button>
      {:else if stuckOp}
        <button type="button" class="gbtn gbtn--alert gbtn--lg" disabled={saving} onclick={retry}>
          {#if saving}<LoaderCircle size={18} strokeWidth={2.4} />{/if} Not saved, tap to retry
        </button>
      {:else}
        <button type="submit" form="walkin-form" class="gbtn gbtn--gold gbtn--lg" disabled={!ready}>
          {#if saving}
            <span class="wi-spin"><LoaderCircle size={18} strokeWidth={2.4} /></span> Getting a paddle
          {:else}
            Check in + {share && ui.walkIn.joinGuestId ? "shared paddle" : "next free paddle"}
          {/if}
        </button>
        <button type="button" class="gbtn gbtn--quiet" onclick={() => ui.closeWalkIn()}>Cancel</button>
      {/if}
    {/snippet}
  </Sheet>
{/if}

<style>
  .wi {
    display: grid;
    gap: 14px;
  }
  .wi-row {
    display: grid;
    gap: 6px;
  }
  .wi-fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    display: grid;
    gap: 6px;
  }
  .wi-req {
    color: var(--g26-gold);
    letter-spacing: 0.08em;
  }
  .wi-opt-note {
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: none;
    color: var(--g26-dim);
  }
  .wi-seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .wi-opt {
    min-height: 52px;
    padding: 0 6px;
    font-family: var(--g26-sans);
    font-size: 15px;
    font-weight: 800;
    color: var(--g26-cream);
    background: transparent;
    border: 1px solid var(--g26-line-strong);
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }
  .wi-opt--on {
    color: var(--g26-ink);
    background: var(--g26-gold);
    border-color: var(--g26-gold);
  }
  .wi-opt:focus-visible,
  .wi-more:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }
  .wi-more {
    justify-self: start;
    min-height: 48px;
    padding: 0 2px;
    font-family: var(--g26-sans);
    font-size: 15px;
    font-weight: 700;
    color: var(--g26-gold);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .wi-error {
    margin: 0;
    padding: 10px 12px;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.4;
    color: var(--g26-cream);
    border: 1px solid var(--g26-alert);
    border-left-width: 4px;
    border-radius: var(--g26-r-chip);
  }
  .wi-success {
    display: grid;
    justify-items: center;
    gap: 16px;
    padding: 16px 0 8px;
    text-align: center;
  }
  .wi-success-line {
    margin: 0;
    font-size: 19px;
    font-weight: 800;
    color: var(--g26-cream);
  }
  .wi-success-line--out {
    padding: 8px 10px;
    color: var(--g26-ink);
    background: var(--g26-gold);
    border-radius: var(--g26-r-chip);
  }
  .wi-spin {
    display: inline-grid;
  }
  @media (prefers-reduced-motion: no-preference) {
    .wi-spin {
      animation: wi-turn 1s linear infinite;
    }
  }
  @keyframes wi-turn {
    to { transform: rotate(360deg); }
  }
</style>
