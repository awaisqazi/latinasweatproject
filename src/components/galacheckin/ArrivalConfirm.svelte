<!--
  What the volunteer reads out loud the moment a guest, or a whole party, is
  checked in: the paddle number first and biggest, then what to DO with it.

  Grouped by paddle, because households share one (organizer, Sep 25): a
  couple checked in together is one block, "Paddle 42 · Sofía and Daniel". The
  second half of a couple arriving later reads "Paddle 42 is already with
  Sofía. No new paddle." Nothing here is computed: the number is off the
  server row, and "already with" compares server check-in times of the rows
  this device holds (derive.js arrivalBlocks, unit tested).

  The same card shows a NEW number after a split or a lost-paddle swap.
-->
<script>
  import { getContext } from "svelte";
  import { NotebookText } from "@lucide/svelte";
  import { LATE_NIGHT, arrivalBlocks, nameList } from "../../lib/galaCheckin/derive.js";
  import PaddleChip from "./PaddleChip.svelte";

  const { store, ui } = getContext("gala-checkin");
  const arrival = $derived(ui.arrival);

  // Live rows by id (fall back to the answer's rows until the store has them).
  const rows = $derived.by(() => {
    if (arrival?.kind !== "arrival") return [];
    return arrival.ids.map((id) => store.guestsById[id] || arrival.rows.find((r) => r.id === id)).filter(Boolean);
  });
  const blocks = $derived(arrivalBlocks(rows, (key) => store.groupMembers(key)));

  let doneEl = $state(null);
  $effect(() => {
    if (arrival) queueMicrotask(() => doneEl?.focus({ preventScroll: true }));
  });

  function close() {
    const party = store.parties.find((p) => p.id === ui.openPartyId);
    ui.closeArrival();
    // Whole party in: straight back to an empty search for the next guest.
    if (!party || party.allArrived) {
      ui.closeParty();
      ui.nextGuest();
    }
  }
</script>

{#if arrival}
  <div class="ar-scrim" role="presentation" onpointerdown={close}></div>
  <div class="ar" role="alertdialog" aria-modal="true" aria-label={arrival.kind === "paddle" ? "New paddle" : "Checked in"}>
    {#if arrival.kind === "paddle"}
      <p class="ar-eyebrow">{arrival.eyebrow}</p>
      <div class="ar-block">
        <PaddleChip number={arrival.number ?? null} size="xl" />
        <div class="ar-info">
          <p class="ar-name">{arrival.title}</p>
          <p class="ar-do">{arrival.line}</p>
        </div>
      </div>
    {:else}
      <p class="ar-eyebrow">Checked in</p>
      <div class="ar-list">
        {#each blocks as b (b.key)}
          <div class="ar-block" class:ar-block--out={Boolean(b.holder)}>
            <PaddleChip number={b.number} size="xl" />
            <div class="ar-info">
              <p class="ar-name">{nameList(b.guests)}</p>
              {#if b.holder}
                <p class="ar-do ar-do--out">Already with {b.holder.name}. No new paddle.</p>
              {:else if b.number != null}
                <p class="ar-do">Hand over paddle {b.number}</p>
              {:else}
                <p class="ar-do">No paddle on this check-in</p>
              {/if}
              {#if b.waiting.length}
                <p class="ar-share">Shared with {nameList(b.waiting)}, not here yet</p>
              {/if}
              {#each b.guests as g (g.id)}
                <p class="ar-meta">
                  {#if b.guests.length > 1}<span class="ar-who">{g.name}</span>{/if}
                  {#if g.table_number != null}<span class="ar-tag">Table {g.table_number}</span>{/if}
                  {#if !g.has_dinner}<span class="ar-tag ar-tag--late">{LATE_NIGHT}</span>{/if}
                  {#if g.meal}<span class="ar-tag ar-tag--meal">{g.meal}</span>{/if}
                </p>
                {#if g.notes}
                  <p class="ar-note"><NotebookText size={15} strokeWidth={2.2} /> {g.notes}</p>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <button type="button" class="gbtn gbtn--gold gbtn--lg ar-btn" bind:this={doneEl} onclick={close}>Done</button>
  </div>
{/if}

<style>
  .ar-scrim {
    position: fixed;
    inset: 0;
    background: rgb(4 8 14 / 0.78);
    z-index: 96;
  }
  .ar {
    position: fixed;
    z-index: 97;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(460px, calc(100vw - 20px));
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    padding: 18px;
    background: var(--g26-navy);
    color: var(--g26-text);
    border: 1px solid var(--g26-line-strong);
    border-top: 4px solid var(--g26-ok);
    border-radius: var(--g26-r-card);
    box-shadow: 0 40px 90px -40px rgb(0 0 0 / 0.95);
  }
  .ar-eyebrow {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.26em;
    text-transform: uppercase;
    color: var(--g26-ok);
  }

  .ar-list {
    display: grid;
    gap: 14px;
  }
  .ar-block {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--g26-line);
  }
  .ar-block:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }
  .ar-info {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 5px;
  }
  .ar-name {
    margin: 0;
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: 24px;
    line-height: 1.15;
    color: var(--g26-cream);
    overflow-wrap: anywhere;
  }
  .ar-do {
    margin: 0;
    font-size: 17px;
    font-weight: 800;
    line-height: 1.3;
    color: var(--g26-cream);
  }
  .ar-do--out {
    padding: 6px 8px;
    color: var(--g26-ink);
    background: var(--g26-gold);
    border-radius: var(--g26-r-chip);
  }
  .ar-share {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-gold-soft);
  }
  .ar-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0;
  }
  .ar-who {
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-dim);
  }
  .ar-tag {
    padding: 3px 7px;
    font-size: 13px;
    font-weight: 800;
    color: var(--g26-text);
    border: 1px solid rgb(255 248 239 / 0.3);
    border-radius: var(--g26-r-chip);
    white-space: nowrap;
  }
  .ar-tag--late {
    color: var(--g26-info);
    border-color: rgb(140 196 236 / 0.6);
  }
  .ar-tag--meal {
    text-transform: capitalize;
  }
  .ar-note {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 2px 0 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-gold-soft);
  }
  .ar-btn {
    width: 100%;
    margin-top: 18px;
  }

  @media (max-width: 360px) {
    .ar-block {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
