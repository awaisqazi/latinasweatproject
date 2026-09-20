<!-- One guest in the list: a drag source, a tap target, and a status line. -->
<script>
  import { getContext } from "svelte";
  import { MEALS, ticketTypeById } from "../../lib/galaSeating/model.js";

  let { guest, onkeynav = () => {} } = $props();
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
  const watcher = $derived((store.people || []).find((p) => p.focus?.guestId === guest.id) || null);

  const mealVar = {
    "short-rib": "var(--gs-meal-short-rib)",
    whitefish: "var(--gs-meal-whitefish)",
    ravioli: "var(--gs-meal-ravioli)",
  };

  function onPointerDown(event) {
    ui.beginPointerDrag(
      event,
      { kind: "guest", guestId: guest.id, label: guest.name, count: 1 },
      {
        onTap: () => ui.pickGuest(guest.id),
      },
    );
  }

  function onKeydown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      ui.pickGuest(guest.id);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      if (seat) {
        event.preventDefault();
        store.unseatGuest(guest.id);
      }
      return;
    }
    onkeynav(event);
  }
</script>

<div
  class="gr"
  class:gr--seated={Boolean(seat)}
  class:gr--selected={selected}
  class:gr--dragging={ui.drag?.guestId === guest.id}
  class:gr--late={guest.hasDinner === false}
  data-guest-row="true"
  data-id={guest.id}
  data-sev={severity}
  role="button"
  tabindex="0"
  aria-pressed={selected}
  aria-label={`${guest.name}${seat && table ? `, seated at table ${table.number}` : ", unseated"}`}
  onpointerdown={onPointerDown}
  onkeydown={onKeydown}
  style={watcher ? `--gs-watch:${watcher.color}` : ""}
>
  <div class="gr-main">
    <span class="gr-name" class:gr-name--ph={guest.placeholder}>{guest.name}</span>
    <span class="gr-party">{guest.partyLabel}</span>
  </div>

  <div class="gr-meta">
    {#if guest.hasDinner}
      <span
        class="gs-dot"
        style={`background:${mealVar[guest.meal] || "var(--gs-meal-none)"}`}
        title={meal ? meal.label : "No entrée selected"}
      ></span>
    {/if}
    {#if guest.hasDinner === false}
      <span class="gr-ticket gr-ticket--late">Late night</span>
    {:else}
      <span class="gr-ticket" data-sponsor={ticket.sponsor ? "1" : null}>{ticket.short}</span>
    {/if}
    {#if guest.seatingNote || guest.plannerNote}
      <svg class="gr-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Has a note">
        <path d="M5 4h14v16l-7-4-7 4z" stroke-linejoin="round" />
      </svg>
    {/if}
    {#if severity}
      <svg class="gr-ic gr-ic--{severity}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Has a warning">
        <path d="M12 4 2.5 20h19z" stroke-linejoin="round" />
        <path d="M12 10v4M12 17.2v.2" stroke-linecap="round" />
      </svg>
    {/if}
    {#if seat && table}
      <span class="gr-table">T{table.number}</span>
    {:else}
      <span class="gr-table gr-table--open">·</span>
    {/if}
  </div>
</div>

<style>
  .gr {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 8px;
    min-height: 46px;
    border-radius: 3px;
    border: 1px solid transparent;
    cursor: grab;
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
  }
  .gr:hover {
    background: rgba(255, 255, 255, 0.045);
  }
  .gr--selected {
    border-color: var(--gs-gold-bright);
    background: rgba(255, 189, 89, 0.12);
  }
  .gr--dragging {
    opacity: 0.4;
  }
  .gr--late .gr-name,
  .gr--late .gr-party {
    color: #8b97a6;
  }
  .gr-ticket--late {
    color: #8b97a6;
    border-color: rgba(139, 151, 166, 0.45);
  }
  .gr--seated .gr-name {
    color: #cdd6e1;
  }
  .gr[style*="--gs-watch"] {
    box-shadow: inset 3px 0 0 var(--gs-watch);
  }
  .gr-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .gr-name {
    font-size: 13.5px;
    color: var(--gs-cream);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gr-name--ph {
    font-style: italic;
    color: #b9c3cf;
  }
  .gr-party {
    font-size: 11px;
    color: #8593a3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gr-meta {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .gr-ticket {
    font-size: 9.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #97a3b2;
    border: 1px solid rgba(151, 163, 178, 0.45);
    border-radius: 2px;
    padding: 1px 4px;
    white-space: nowrap;
  }
  .gr-ticket[data-sponsor] {
    color: var(--gs-gold-soft);
    border-color: rgba(228, 201, 138, 0.55);
  }
  .gr-ic {
    width: 13px;
    height: 13px;
    color: #8593a3;
  }
  .gr-ic--warn {
    color: var(--gs-warn);
  }
  .gr-ic--error {
    color: var(--gs-error);
  }
  .gr-table {
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    color: var(--gs-gold-soft);
    min-width: 22px;
    text-align: right;
  }
  .gr-table--open {
    color: #5c6877;
  }
</style>
