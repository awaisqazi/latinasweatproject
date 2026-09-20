<!--
  The phone dock: once a guest is selected the list slides away and this compact
  card takes the bottom of the screen, so the floor stays visible while the
  planner looks at who they just tapped.
-->
<script>
  import { getContext } from "svelte";
  import { MEALS, ticketTypeById, tableLabel } from "../../lib/galaSeating/model.js";

  const { store, ui } = getContext("gala-seating");

  const plan = $derived(store.plan);
  const guest = $derived(ui.selectedGuestId ? plan.guests[ui.selectedGuestId] || null : null);
  const seat = $derived(guest ? plan.seating[guest.id] || null : null);
  const table = $derived(seat ? plan.tables.find((t) => t.id === seat.tableId) || null : null);
  const meal = $derived(guest ? MEALS.find((m) => m.id === guest.meal) || null : null);
  const ticket = $derived(guest ? ticketTypeById(guest.ticketType) : null);

  const mealVar = {
    "short-rib": "var(--gs-meal-short-rib)",
    whitefish: "var(--gs-meal-whitefish)",
    ravioli: "var(--gs-meal-ravioli)",
  };

  // If someone else moves the selected guest while you are looking at them,
  // follow the seat. Only on a real change: re-locating on every render would
  // fight the planner's own panning.
  let lastSeatKey = null;
  $effect(() => {
    const id = guest?.id;
    const key = id && seat ? `${id}:${seat.tableId}:${seat.seat}` : null;
    if (!key) {
      lastSeatKey = null;
      return;
    }
    const first = lastSeatKey === null;
    if (key === lastSeatKey) return;
    lastSeatKey = key;
    if (!first) ui.findOnFloor(id);
  });
</script>

{#if guest}
  <div class="sc" role="status">
    <div class="sc-main">
      <p class="sc-name">{guest.name}</p>
      <p class="sc-meta">
        {#if table && seat}
          <span class="sc-where">{tableLabel(table)} · seat {seat.seat + 1}</span>
        {:else}
          <span class="sc-where sc-where--none">Not seated yet</span>
        {/if}
        {#if guest.hasDinner}
          <span class="gs-dot" style={`background:${mealVar[guest.meal] || "var(--gs-meal-none)"}`}></span>
          <span>{meal ? meal.short : "No entrée"}</span>
        {/if}
        <span class="sc-ticket">{ticket?.short}</span>
        {#if guest.seatingNote || guest.plannerNote}
          <svg class="sc-note" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Has a note">
            <path d="M5 4h14v16l-7-4-7 4z" stroke-linejoin="round" />
          </svg>
        {/if}
      </p>
    </div>
    <div class="sc-actions">
      {#if !seat}
        <button type="button" class="gs-btn gs-btn--gold" onclick={() => ui.openGuest(guest.id)}>Seat at…</button>
      {/if}
      <button type="button" class="gs-btn" onclick={() => ui.openGuest(guest.id)}>Details</button>
      <button type="button" class="sc-x" onclick={() => ui.clearSelection()} aria-label="Deselect">&times;</button>
    </div>
  </div>
{/if}

<style>
  .sc {
    position: fixed;
    left: 8px;
    right: 8px;
    bottom: 8px;
    z-index: 22;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: rgba(10, 17, 28, 0.97);
    border: 1px solid var(--gs-line-strong);
    border-left: 4px solid var(--gs-gold-bright);
    border-radius: 3px;
    box-shadow: 0 -10px 40px -20px rgba(0, 0, 0, 0.95);
  }
  .sc-main {
    flex: 1 1 auto;
    min-width: 0;
  }
  .sc-name {
    margin: 0;
    font-size: 14.5px;
    color: var(--gs-cream);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sc-meta {
    margin: 2px 0 0;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 11.5px;
    color: var(--gs-dim);
  }
  .sc-where {
    color: var(--gs-gold-soft);
  }
  .sc-where--none {
    color: #8f9bab;
    font-style: italic;
  }
  .sc-ticket {
    font-size: 9.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 1px solid rgba(151, 163, 178, 0.45);
    border-radius: 2px;
    padding: 1px 4px;
  }
  .sc-note {
    width: 12px;
    height: 12px;
  }
  .sc-actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sc-x {
    width: 34px;
    height: 34px;
    min-height: 34px;
    background: none;
    border: 1px solid rgba(228, 201, 138, 0.3);
    border-radius: 3px;
    color: #9fabba;
    font-size: 17px;
    line-height: 1;
    cursor: pointer;
  }
</style>
