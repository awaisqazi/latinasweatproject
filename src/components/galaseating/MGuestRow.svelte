<!--
  One guest, phone sized: a 56px row that is a plain button, not a drag handle.

  On a phone a name is something you tap, so nothing here waits to see whether
  the finger was really a long press. Dragging a guest into a seat still works
  on the map; it is never the only way.
-->
<script>
  import { getContext } from "svelte";
  import { MEALS, ticketTypeById } from "../../lib/galaSeating/model.js";

  let { guest, onpick = () => {} } = $props();
  const { store, ui } = getContext("gala-seating");

  const plan = $derived(store.plan);
  const seat = $derived(plan.seating[guest.id] || null);
  const table = $derived(seat ? plan.tables.find((t) => t.id === seat.tableId) || null : null);
  const ticket = $derived(ticketTypeById(guest.ticketType));
  const meal = $derived(MEALS.find((m) => m.id === guest.meal) || null);
  const warnings = $derived(store.warnings.byGuest?.[guest.id] || []);
  const severity = $derived(
    warnings.some((w) => w.severity === "error") ? "error" : warnings.length ? "warn" : "",
  );
  const selected = $derived(ui.selectedGuestId === guest.id);

  const mealVar = {
    "short-rib": "var(--gs-meal-short-rib)",
    whitefish: "var(--gs-meal-whitefish)",
    ravioli: "var(--gs-meal-ravioli)",
  };
</script>

<button
  type="button"
  class="mgr"
  class:mgr--selected={selected}
  class:mgr--late={guest.hasDinner === false}
  data-guest-row="true"
  data-id={guest.id}
  data-sev={severity}
  onclick={() => onpick(guest.id)}
  aria-label={`${guest.name}, ${seat && table ? `table ${table.number}, seat ${seat.seat + 1}` : "not seated"}`}
>
  <span class="mgr-main">
    <span class="mgr-name" class:mgr-name--ph={guest.placeholder}>{guest.name}</span>
    <span class="mgr-sub">
      <span class="mgr-party">{guest.partyLabel}</span>
      {#if guest.hasDinner}
        <span
          class="gs-dot"
          style={`background:${mealVar[guest.meal] || "var(--gs-meal-none)"}`}
          title={meal ? meal.label : "No entrée selected"}
        ></span>
      {/if}
      <span class="mgr-ticket" data-sponsor={ticket.sponsor ? "1" : null}>
        {guest.hasDinner === false ? "Late night" : ticket.short}
      </span>
      {#if (guest.tags || []).includes("outreach")}
        <span class="mgr-outreach">Outreach</span>
      {/if}
      {#if guest.seatingNote || guest.plannerNote}
        <svg class="mgr-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Has a note">
          <path d="M5 4h14v16l-7-4-7 4z" stroke-linejoin="round" />
        </svg>
      {/if}
      {#if severity}
        <svg
          class="mgr-ic mgr-ic--{severity}"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-label="Has a warning"
        >
          <path d="M12 4 2.5 20h19z" stroke-linejoin="round" />
          <path d="M12 10v4M12 17.2v.2" stroke-linecap="round" />
        </svg>
      {/if}
    </span>
  </span>

  {#if seat && table}
    <span class="mgr-chip">T{table.number}</span>
  {:else if guest.hasDinner === false}
    <span class="mgr-chip mgr-chip--none">No seat</span>
  {:else}
    <span class="mgr-chip mgr-chip--open">Unseated</span>
  {/if}
</button>

<style>
  .mgr {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 56px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-bottom: 1px solid rgba(228, 201, 138, 0.1);
    border-radius: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .mgr:active {
    background: rgba(255, 189, 89, 0.12);
  }
  .mgr--selected {
    border-color: var(--gs-gold-bright);
    background: rgba(255, 189, 89, 0.12);
  }
  .mgr--late .mgr-name {
    color: #9aa6b4;
  }
  .mgr-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .mgr-name {
    font-size: 15px;
    color: var(--gs-cream);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mgr-name--ph {
    font-style: italic;
    color: #b9c3cf;
  }
  .mgr-sub {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 12px;
    color: #8f9bab;
  }
  .mgr-party {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 14ch;
  }
  .mgr-ticket {
    flex: 0 0 auto;
    font-size: 10px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #97a3b2;
    border: 1px solid rgba(151, 163, 178, 0.45);
    border-radius: 2px;
    padding: 1px 4px;
    white-space: nowrap;
  }
  .mgr-ticket[data-sponsor] {
    color: var(--gs-gold-soft);
    border-color: rgba(228, 201, 138, 0.55);
  }
  .mgr-outreach {
    flex: 0 0 auto;
    font-size: 10px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #1d1405;
    background: var(--gs-warn);
    border-radius: 2px;
    padding: 1px 4px;
    white-space: nowrap;
    font-weight: 700;
  }
  .mgr-ic {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    color: #8593a3;
  }
  .mgr-ic--warn {
    color: var(--gs-warn);
  }
  .mgr-ic--error {
    color: var(--gs-error);
  }
  .mgr-chip {
    flex: 0 0 auto;
    min-width: 44px;
    text-align: center;
    padding: 5px 7px;
    border-radius: 2px;
    border: 1px solid rgba(228, 201, 138, 0.4);
    background: rgba(255, 189, 89, 0.12);
    color: var(--gs-gold-soft);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .mgr-chip--open {
    border-color: rgba(151, 163, 178, 0.4);
    background: none;
    color: #8f9bab;
  }
  .mgr-chip--none {
    border-style: dashed;
    border-color: rgba(151, 163, 178, 0.35);
    background: none;
    color: #76828f;
  }
</style>
