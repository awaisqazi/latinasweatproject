<!--
  One person inside the party sheet.

  Three states, and the difference between them is shape and words before it is
  colour: a filled mint badge with a check mark and "Checked in by Maria at
  6:41 PM", a spinner with "Checking in", or an outlined slot with nothing in it.

  Households SHARE a paddle (organizer, Sep 25). So the row says, in words,
  what the chip alone cannot: "Paddle 42 · shared with Ben", or, when the
  partner already walked in with it, "Paddle 42 · already with Ana" and the
  button reads "Check in, no new paddle". Every number is off a server row.

  An unnamed seat ("Guest of X") prompts for the person's real name first, but
  never blocks the door: "Skip, check in" takes them in under the seat's name.
-->
<script>
  import { getContext } from "svelte";
  import { Check, LoaderCircle, RotateCcw, TriangleAlert, Users } from "@lucide/svelte";
  import { LATE_NIGHT, checkedInLine, paddleShare } from "../../lib/galaCheckin/derive.js";
  import PaddleChip from "./PaddleChip.svelte";

  let { guest, onCheckIn = () => {}, onUndo = () => {}, justNow = false } = $props();

  const { store, ui } = getContext("gala-checkin");

  const pending = $derived(store.pendingByGuest[guest.id] || null);
  const arrived = $derived(Boolean(guest.checked_in_at));
  const watcher = $derived(store.focusByGuest[guest.id]);
  const share = $derived(paddleShare(guest, store.groupMembers(guest.paddle_group)));
  const elsewhere = $derived(arrived && !store.mine.has(guest.id));

  let renaming = $state(false);
  let draft = $state("");
  let saving = $state(false);

  async function saveName() {
    const name = draft.trim().slice(0, 160);
    if (!name || saving) return;
    saving = true;
    const res = await store.updateGuest(guest.id, { name });
    saving = false;
    if (res.ok) {
      renaming = false;
      draft = "";
    }
  }

  async function retry() {
    ui.afterCheckIn(await store.retry(pending.opId));
  }
</script>

<div class="gr" class:gr--in={arrived} class:gr--flash={justNow}>
  <div class="gr-badge" aria-hidden="true">
    {#if pending?.state === "failed"}
      <span class="gr-bad"><TriangleAlert size={20} strokeWidth={2.4} /></span>
    {:else if pending}
      <span class="gr-spin"><LoaderCircle size={20} strokeWidth={2.4} /></span>
    {:else if arrived}
      <Check size={22} strokeWidth={3} />
    {/if}
  </div>

  <div class="gr-main">
    {#if renaming}
      <div class="gr-rename">
        <label class="glabel" for="rn-{guest.id}">Name for this seat</label>
        <input
          id="rn-{guest.id}"
          class="ginput"
          type="text"
          autocapitalize="words"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="done"
          maxlength="80"
          placeholder="First and last name"
          bind:value={draft}
          onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveName(); } }}
        />
        <div class="gr-rename-acts">
          <button type="button" class="gbtn gbtn--gold" onclick={saveName} disabled={!draft.trim() || saving}>
            {saving ? "Saving" : "Save name"}
          </button>
          <button type="button" class="gbtn" onclick={() => (renaming = false)}>Cancel</button>
        </div>
      </div>
    {:else}
      <div class="gr-toprow">
        <p class="gr-name" class:gr-name--empty={guest.placeholder}>{guest.name}</p>
        <PaddleChip number={guest.paddle_number} pending={Boolean(pending) && guest.paddle_number == null} />
      </div>

      {#if share.shared}
        <p class="gr-share" class:gr-share--out={share.withOther && !arrived}>
          <Users size={15} strokeWidth={2.2} /> {share.text}
        </p>
      {/if}

      <p class="gr-meta">
        {#if guest.placeholder}<span class="gr-flag">Unnamed seat</span>{/if}
        {#if !guest.has_dinner}<span class="gr-late">{LATE_NIGHT}</span>{/if}
        {#if guest.seat != null}<span>Seat {guest.seat}</span>{/if}
        {#if guest.meal}<span class="gr-meal">{guest.meal}</span>{/if}
        {#if guest.door_note}<span class="gr-note">{guest.door_note}</span>{/if}
      </p>

      {#if arrived}
        <p class="gr-state">
          {checkedInLine(guest)}{elsewhere && justNow ? " · on another phone" : ""}
        </p>
      {:else if pending}
        <p class="gr-state gr-state--wait" class:gr-state--bad={pending.state === "failed"}>
          {pending.state === "failed" ? "Not saved" : pending.state === "retrying" ? "Still saving, weak signal" : "Checking in"}
        </p>
      {/if}
      {#if watcher && !arrived}
        <p class="gr-watch">{watcher.n || "Another volunteer"} has this party open too</p>
      {/if}
    {/if}
  </div>

  <div class="gr-acts">
    {#if pending?.state === "failed"}
      <button type="button" class="gbtn gbtn--alert gbtn--sm" onclick={retry}>Not saved, tap to retry</button>
    {:else if arrived}
      <button type="button" class="gbtn gbtn--sm" onclick={() => onUndo(guest)} aria-label="Undo check-in for {guest.name}">
        <RotateCcw size={16} strokeWidth={2} /> Undo
      </button>
    {:else if guest.placeholder && !renaming}
      <button type="button" class="gbtn gbtn--gold gbtn--sm" onclick={() => { renaming = true; draft = ""; }}>
        Add name
      </button>
      <button type="button" class="gbtn gbtn--sm" onclick={() => onCheckIn(guest)} disabled={Boolean(pending)}>
        Skip, check in
      </button>
    {:else if !renaming}
      <button type="button" class="gbtn gbtn--gold gbtn--sm" onclick={() => onCheckIn(guest)} disabled={Boolean(pending)}>
        Check in
      </button>
    {/if}
  </div>
</div>

<style>
  .gr {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 0;
    border-bottom: 1px solid var(--g26-line);
  }
  .gr:last-child {
    border-bottom: 0;
  }
  .gr--flash {
    background: linear-gradient(90deg, rgb(95 212 184 / 0.14), transparent 70%);
  }

  .gr-badge {
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    margin-top: 2px;
    border: 1.5px solid rgb(255 248 239 / 0.4);
    border-radius: var(--g26-r-chip);
    color: var(--g26-ink);
  }
  .gr--in .gr-badge {
    background: var(--g26-ok);
    border-color: var(--g26-ok);
  }
  .gr-bad {
    display: inline-grid;
    color: var(--g26-alert);
  }
  .gr-spin {
    display: inline-grid;
    color: var(--g26-gold);
  }
  @media (prefers-reduced-motion: no-preference) {
    .gr-spin {
      animation: gr-turn 1s linear infinite;
    }
  }
  @keyframes gr-turn {
    to { transform: rotate(360deg); }
  }

  .gr-main {
    flex: 1;
    min-width: 0;
  }
  .gr-toprow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 8px;
  }
  .gr-name {
    flex: 1 1 130px;
    min-width: 130px;
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--g26-cream);
    overflow-wrap: anywhere;
  }
  .gr-name--empty {
    font-style: italic;
    color: var(--g26-dim);
  }
  .gr-share {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 6px 0 0;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.35;
    color: var(--g26-gold-soft);
  }
  .gr-share :global(svg) {
    flex: none;
    margin-top: 2px;
  }
  /* The paddle already left the desk with the partner: say it loudly. */
  .gr-share--out {
    padding: 6px 8px;
    color: var(--g26-ink);
    background: var(--g26-gold);
    border-radius: var(--g26-r-chip);
  }
  .gr-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    margin: 5px 0 0;
    font-size: 14px;
    color: var(--g26-dim);
  }
  .gr-meal {
    text-transform: capitalize;
  }
  .gr-late {
    font-weight: 800;
    color: var(--g26-info);
  }
  .gr-flag {
    font-weight: 800;
    color: var(--g26-alert);
  }
  .gr-note {
    font-style: italic;
  }
  .gr-state {
    margin: 5px 0 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-ok);
  }
  .gr-state--wait {
    color: var(--g26-gold-soft);
  }
  .gr-state--bad {
    color: var(--g26-alert);
  }
  .gr-watch {
    margin: 3px 0 0;
    font-size: 13px;
    color: var(--g26-gold-soft);
  }

  .gr-acts {
    flex: none;
    display: grid;
    gap: 6px;
    max-width: 150px;
  }

  .gr-rename {
    display: grid;
    gap: 6px;
  }
  .gr-rename-acts {
    display: flex;
    gap: 8px;
  }
</style>
