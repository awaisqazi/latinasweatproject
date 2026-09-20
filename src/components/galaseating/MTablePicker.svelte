<!--
  "Move Ana Ruiz": which table.

  Every table in the room as a card the size of a thumb, tinted by what would
  happen: gold means go ahead, amber says what the plan would complain about,
  red is full. Choosing one seats them next to their own party when there is a
  chair going spare there, otherwise in the first free chair, and the toast that
  follows carries the Undo.

  "Pick on the map instead" hands the job to the room itself for the planner who
  is thinking in geography rather than table numbers.
-->
<script>
  import { getContext } from "svelte";
  import { tableLabel } from "../../lib/galaSeating/model.js";
  import { bestSeatFor, tableChoices } from "../../lib/galaSeating/seatHelpers.js";
  import MFull from "./MFull.svelte";

  let { guestId, nav } = $props();
  const { store } = getContext("gala-seating");

  const plan = $derived(store.plan);
  const guest = $derived(plan.guests[guestId] || null);
  const choices = $derived(guest ? tableChoices(plan, guestId) : []);

  function choose(choice) {
    if (choice.level === "full" || choice.level === "here" || !guest) return;
    const seat = bestSeatFor(plan, guestId, choice.id);
    const name = guest.name;
    const res = store.seatGuest(guestId, choice.id, seat >= 0 ? seat : null);
    if (res && res.ok === false) {
      store.pushToast({ kind: "warn", message: "That table is full." });
      return;
    }
    store.pushToast({
      kind: "ok",
      message: `Seated ${name} at ${tableLabel(choice.table)}`,
      detail: choice.level === "warn" ? choice.reason : undefined,
      action: { label: "Undo", run: () => store.undo() },
    });
    // Back past the picker and the card underneath it, onto whichever tab the
    // planner was working in. The toast carries the Undo.
    nav.closeAllLayers();
  }
</script>

{#if guest}
  <MFull eyebrow="Move" title={guest.name} onclose={() => nav.closeTop()}>
    {#snippet children()}
      <p class="mtp-lead">Pick a table. Gold is clear, amber has a note, red is full.</p>

      <div class="mtp-grid">
        {#each choices as choice (choice.id)}
          <button
            type="button"
            class="mtp-card"
            data-level={choice.level}
            disabled={choice.level === "full" || choice.level === "here"}
            onclick={() => choose(choice)}
          >
            <span class="mtp-num">{choice.table.number}</span>
            {#if choice.table.name}<span class="mtp-name">{choice.table.name}</span>{/if}
            <span class="mtp-free">
              {#if choice.level === "here"}
                Already here
              {:else if choice.level === "full"}
                Full
              {:else}
                {choice.free} {choice.free === 1 ? "seat" : "seats"} free
              {/if}
            </span>
            {#if choice.level === "warn"}
              <span class="mtp-reason">{choice.reason}</span>
            {/if}
          </button>
        {/each}
      </div>

      <button type="button" class="mtp-map" onclick={() => nav.startMove(guestId)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" stroke-linejoin="round" />
          <path d="M9 4v13.5M15 6.5V20" />
        </svg>
        Pick on the map instead
      </button>
    {/snippet}
  </MFull>
{/if}

<style>
  .mtp-lead {
    margin: 0 0 12px;
    font-size: 13.5px;
    line-height: 1.5;
    color: #5f6875;
  }
  .mtp-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 8px;
  }
  .mtp-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-height: 82px;
    padding: 10px;
    border: 1px solid rgba(23, 32, 44, 0.24);
    border-left: 4px solid var(--gs-gold);
    border-radius: 3px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .mtp-card:active:not(:disabled) {
    background: rgba(255, 189, 89, 0.34);
  }
  .mtp-card[data-level="warn"] {
    border-left-color: var(--gs-warn);
    background: rgba(226, 163, 60, 0.12);
  }
  .mtp-card[data-level="full"] {
    border-left-color: #b0493b;
    background: rgba(224, 106, 90, 0.1);
    opacity: 0.72;
    cursor: default;
  }
  .mtp-card[data-level="here"] {
    border-left-color: #6a7280;
    background: rgba(23, 32, 44, 0.05);
    opacity: 0.8;
    cursor: default;
  }
  .mtp-num {
    font-family: "Playfair Display", Georgia, serif;
    font-style: italic;
    font-size: 23px;
    line-height: 1;
  }
  .mtp-name {
    font-size: 11.5px;
    color: #5f6875;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .mtp-free {
    font-size: 12.5px;
    color: #4a525f;
  }
  .mtp-reason {
    font-size: 11px;
    line-height: 1.35;
    color: #8a5700;
  }

  .mtp-map {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 52px;
    margin-top: 16px;
    padding: 0 14px;
    border: 1px dashed rgba(185, 132, 47, 0.7);
    border-radius: 3px;
    background: rgba(255, 189, 89, 0.14);
    color: #6b4a12;
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }
  .mtp-map svg {
    width: 20px;
    height: 20px;
  }
</style>
