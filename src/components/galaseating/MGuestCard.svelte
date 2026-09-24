<!--
  One guest, in the space of a thumb.

  Compact by default, roughly 220px, so the room stays visible behind it while
  the planner decides. The four things they actually do, in the order they do
  them, as buttons big enough to hit without looking: show me where they are,
  move them, take them out, tell me everything.

  Dragging a name onto a ten-pixel chair is not one of the four.
-->
<script>
  import { getContext } from "svelte";
  import { MEALS, ticketTypeById, tableLabel, seatPosition } from "../../lib/galaSeating/model.js";
  import { needsTicketResolution } from "../../lib/galaSeating/ticketResolution.js";
  import MSheet from "./MSheet.svelte";

  let { guestId, nav, onshowonmap = () => {}, onmeasure = () => {} } = $props();
  const { store, ui } = getContext("gala-seating");

  const plan = $derived(store.plan);
  const guest = $derived(plan.guests[guestId] || null);
  const seat = $derived(guest ? plan.seating[guest.id] || null : null);
  const table = $derived(seat ? plan.tables.find((t) => t.id === seat.tableId) || null : null);
  const meal = $derived(guest ? MEALS.find((m) => m.id === guest.meal) || null : null);
  const ticket = $derived(guest ? ticketTypeById(guest.ticketType) : null);
  const warnings = $derived(guest ? store.warnings.byGuest?.[guest.id] || [] : []);

  const mealVar = {
    "short-rib": "var(--gs-meal-short-rib)",
    whitefish: "var(--gs-meal-whitefish)",
    ravioli: "var(--gs-meal-ravioli)",
  };

  /**
   * "Show on map" is offered only when it would do something: either another
   * tab is showing, or the seat is off screen or under this very sheet.
   */
  const needsShowing = $derived.by(() => {
    if (!table || !seat) return false;
    if (nav.tab !== "map") return true;
    const at = seatPosition(table, seat.seat);
    return !ui.isInClearView(at.x, at.y, 24);
  });

  const noteSnippet = $derived.by(() => {
    const raw = String(guest?.seatingNote || guest?.plannerNote || "").trim();
    if (!raw) return "";
    return raw.length > 140 ? `${raw.slice(0, 138)}…` : raw;
  });

  function unseat() {
    if (!guest) return;
    const name = guest.name;
    store.unseatGuest(guest.id);
    store.pushToast({
      kind: "ok",
      message: `${name} is back in the unseated list.`,
      action: { label: "Undo", run: () => store.undo() },
    });
  }
</script>

{#if guest}
  <MSheet
    eyebrow={ticket?.label || ""}
    title={guest.name}
    snaps={[302, 0.92]}
    {onmeasure}
    onclose={() => nav.closeTop()}
  >
    {#snippet children()}
      <div class="mgc">
        <p class="mgc-where">
          {#if table && seat}
            <span class="mgc-seatnow">{tableLabel(table)} · seat {seat.seat + 1}</span>
          {:else if guest.hasDinner === false}
            <span class="mgc-seatnow mgc-seatnow--none">Late night · arrives 9 PM · no dinner seat</span>
          {:else}
            <span class="mgc-seatnow mgc-seatnow--none">Not seated</span>
          {/if}
        </p>

        <p class="mgc-facts">
          {#if guest.hasDinner}
            <span class="mgc-fact">
              <span class="gs-dot" style={`background:${mealVar[guest.meal] || "var(--gs-meal-none)"}`}></span>
              {meal ? meal.short : "No entrée"}
            </span>
          {/if}
          <span class="mgc-pill">{ticket?.short}</span>
          {#if guest.partyLabel}<span class="mgc-party">{guest.partyLabel}</span>{/if}
        </p>

        <div class="mgc-actions">
          {#if needsShowing}
            <button type="button" class="mgc-btn mgc-btn--gold" onclick={() => onshowonmap(guest.id)}>
              Show on map
            </button>
          {/if}
          <button
            type="button"
            class="mgc-btn"
            class:mgc-btn--gold={!needsShowing}
            onclick={() => nav.openLayer({ type: "tablePicker", guestId: guest.id })}
          >
            {seat ? "Move" : "Seat"}
          </button>
          {#if seat}
            <button type="button" class="mgc-btn" onclick={unseat}>Unseat</button>
          {/if}
          <button
            type="button"
            class="mgc-btn"
            onclick={() => nav.openLayer({ type: "guestDetails", guestId: guest.id })}
          >
            Details
          </button>
        </div>

        {#if warnings.length}
          <div class="mgc-warns">
            {#each warnings as w (w.key)}
              <p class="mgc-warn" data-sev={w.severity}>{w.message}</p>
            {/each}
          </div>
        {/if}

        {#if noteSnippet}
          <blockquote class="mgc-note">{noteSnippet}</blockquote>
        {/if}

        {#if guest.placeholder || guest.unmatched || needsTicketResolution(guest)}
          <p class="mgc-recon">
            {guest.placeholder
              ? "This seat has no name yet."
              : guest.unmatched
                ? "No ticket matched this dinner response."
                : "No ticket on record."}
            <button
              type="button"
              class="gs-linkbtn"
              onclick={() => nav.openLayer({ type: "guestDetails", guestId: guest.id })}
            >
              Reconcile in Details
            </button>
          </p>
        {/if}
      </div>
    {/snippet}
  </MSheet>
{/if}

<style>
  .mgc-where {
    margin: 0 0 8px;
  }
  .mgc-seatnow {
    font-size: 16px;
    font-weight: 700;
    color: #6b4a12;
  }
  .mgc-seatnow--none {
    color: #7b8493;
    font-weight: 400;
    font-style: italic;
  }
  .mgc-facts {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-wrap: wrap;
    margin: 0 0 12px;
    font-size: 13px;
    color: #5f6875;
  }
  .mgc-fact {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .mgc-pill {
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 1px solid rgba(23, 32, 44, 0.3);
    border-radius: 2px;
    padding: 2px 6px;
  }
  .mgc-party {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 18ch;
  }

  .mgc-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .mgc-btn {
    min-height: 52px;
    padding: 0 12px;
    border: 1px solid rgba(23, 32, 44, 0.3);
    border-radius: 3px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .mgc-btn:active {
    background: rgba(255, 189, 89, 0.34);
  }
  .mgc-btn--gold {
    background: var(--gs-gold-bright);
    border-color: var(--gs-gold);
  }

  .mgc-warns {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mgc-warn {
    margin: 0;
    padding: 9px 10px;
    border-left: 3px solid var(--gs-warn);
    background: rgba(226, 163, 60, 0.14);
    font-size: 13px;
    line-height: 1.45;
  }
  .mgc-warn[data-sev="error"] {
    border-left-color: var(--gs-error);
    background: rgba(224, 106, 90, 0.13);
  }
  .mgc-note {
    margin: 12px 0 0;
    padding: 10px 12px;
    background: rgba(255, 189, 89, 0.2);
    border-left: 3px solid var(--gs-gold);
    font-size: 14px;
    line-height: 1.5;
    font-style: italic;
  }
  .mgc-recon {
    margin: 12px 0 0;
    padding: 10px 12px;
    background: rgba(255, 189, 89, 0.16);
    border: 1px solid rgba(185, 132, 47, 0.45);
    font-size: 13px;
    line-height: 1.5;
    color: #4a525f;
  }
</style>
