<!--
  Every gift that is not a paddle going up at the level being called.

  This is `gala_donation_record`, the RPC that can say the things the fast path
  cannot: a kind outside the paddle raise, a free-text donor with no paddle, a
  per-gift anonymous flag, and an override of the publish delay.

  It is also how an online gift gets in. Zeffy has no ingest path here yet
  (10 s7.3), so Clerk B keeps the payments list open on a phone and keys name
  and amount as they land. That path is the MUST, not the fallback (08 s7.3).

  A gift needs an owner: a paddle, a name, or the anonymous box. The server
  answers `missing-donor` otherwise, and this form asks first.
-->
<script>
  import Sheet from "../galacheckin/Sheet.svelte";
  import { money } from "../../lib/galaTerminal/derive.js";

  let { store, onclose = () => {} } = $props();

  const KINDS = [
    ["pledge", "Pledge"],
    ["cash", "Cash"],
    ["card", "Card"],
    ["online", "Online (Zeffy)"],
    ["sponsor", "Sponsor"],
    ["seed", "Seed gift"],
    ["match", "Match"],
    ["other", "Other"],
  ];

  let kind = $state("cash");
  let amount = $state("");
  let paddle = $state("");
  let donorName = $state("");
  let anonymous = $state(false);
  let note = $state("");
  let quiet = $state(false);       // publish now, no undo window: it must not wait
  let offScreen = $state(false);   // never on the screen, still in the books
  let message = $state("");

  const cents = $derived(Math.round((Number(amount) || 0) * 100));
  const hasOwner = $derived(Boolean(paddle.trim() || donorName.trim() || anonymous));
  const ready = $derived(cents > 0 && hasOwner);

  function record() {
    if (!ready) {
      message = cents > 0
        ? "A gift needs an owner: a paddle, a name, or the anonymous box."
        : "Put an amount in first.";
      return;
    }
    store.submit({
      paddle: paddle.trim() ? Number(paddle) : null,
      cents,
      custom: true,                       // never part of a level's tally
      kind,
      donorName: donorName.trim() || null,
      anonymous,
      note: note.trim(),
      hidden: offScreen,
      publishDelayMs: quiet || offScreen ? 0 : null,
    });
    onclose();
  }
</script>

<Sheet eyebrow="Annual Gala" title="Another gift" {onclose} tall>
  <div class="og">
    <div class="og-kinds" role="radiogroup" aria-label="Kind of gift">
      {#each KINDS as [value, label] (value)}
        <button
          type="button"
          role="radio"
          aria-checked={kind === value}
          class="og-kind"
          class:og-kind--on={kind === value}
          onclick={() => (kind = value)}
        >{label}</button>
      {/each}
    </div>

    <div class="og-grid">
      <label class="og-field">
        <span>Amount in dollars</span>
        <input type="text" inputmode="decimal" autocomplete="off" bind:value={amount} placeholder="250" />
      </label>
      <label class="og-field">
        <span>Paddle, if they have one</span>
        <input type="text" inputmode="numeric" autocomplete="off" bind:value={paddle} placeholder="none" />
      </label>
      <label class="og-field og-field--wide">
        <span>Or the donor's name</span>
        <input type="text" maxlength="200" autocomplete="off" bind:value={donorName} disabled={anonymous} placeholder="Panaderia del barrio" />
      </label>
      <label class="og-check">
        <input type="checkbox" bind:checked={anonymous} />
        <span>Anonymous: the screen says "Anonymous"</span>
      </label>
      <label class="og-field og-field--wide">
        <span>Note, for the reconciliation list</span>
        <input type="text" maxlength="300" autocomplete="off" bind:value={note} placeholder="Zeffy, 8:52 PM" />
      </label>
      <label class="og-check">
        <input type="checkbox" bind:checked={quiet} />
        <span>Do not animate: publish it at once, with no undo window</span>
      </label>
      <label class="og-check">
        <input type="checkbox" bind:checked={offScreen} />
        <span>Keep it off the screen entirely. It stays in the books.</span>
      </label>
    </div>

    <p class="og-sum">
      {#if ready}
        {money(cents)} · {kind}{paddle.trim() ? ` · paddle ${paddle.trim()}` : ""}{anonymous ? " · anonymous" : donorName.trim() ? ` · ${donorName.trim()}` : ""}
      {:else}
        {message || "An amount, and a paddle or a name."}
      {/if}
    </p>
  </div>

  {#snippet footer()}
    <button type="button" class="og-save" onclick={record}>Record the gift</button>
  {/snippet}
</Sheet>

<style>
  .og {
    display: grid;
    gap: 12px;
    color: #1e1e1e;
  }

  .og-kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .og-kind {
    min-height: 44px;
    padding: 0 12px;
    font-family: var(--g26-sans);
    font-size: 13px;
    font-weight: 700;
    color: #1e1e1e;
    background: rgb(255 255 255 / 0.6);
    border: 1px solid rgb(30 30 30 / 0.24);
    border-radius: 999px;
    cursor: pointer;
  }
  .og-kind--on {
    color: var(--g26-ink);
    background: var(--g26-gold);
    border-color: var(--g26-gold-deep);
  }
  .og-kind:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--g26-cream), 0 0 0 4px var(--g26-gold-deep);
  }

  .og-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .og-field {
    display: grid;
    gap: 3px;
  }
  .og-field--wide {
    grid-column: 1 / -1;
  }
  .og-field span {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgb(30 30 30 / 0.6);
  }
  .og-field input {
    min-height: 52px;
    padding: 0 10px;
    font: inherit;
    font-size: 16px;
    color: #1e1e1e;
    background: rgb(255 255 255 / 0.78);
    border: 1px solid rgb(30 30 30 / 0.28);
    border-radius: 2px;
  }
  .og-field input:disabled {
    opacity: 0.5;
  }
  .og-field input:focus-visible {
    outline: none;
    border-color: var(--g26-gold-deep);
    box-shadow: 0 0 0 3px rgb(185 132 47 / 0.24);
  }
  .og-check {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 48px;
    font-size: 14px;
    line-height: 1.3;
    cursor: pointer;
  }
  .og-check input {
    flex: none;
    width: 22px;
    height: 22px;
    accent-color: var(--g26-gold-deep);
  }

  .og-sum {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: rgb(30 30 30 / 0.72);
  }

  .og-save {
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
    .og-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
