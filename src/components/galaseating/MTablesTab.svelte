<!--
  The Tables tab: the room as a contact sheet.

  Thirteen cards, two per row on a phone, three on a tablet. Big number, fill
  bar, entrée dots, warning badge, lock. This tab plus the empty-seat picker is
  how a table actually gets built on a phone, with no dragging anywhere in it.
-->
<script>
  import { getContext } from "svelte";
  import { MEALS } from "../../lib/galaSeating/model.js";
  import { tableMeals } from "../../lib/galaSeating/seatHelpers.js";

  let { nav } = $props();
  const { store, ui } = getContext("gala-seating");

  const plan = $derived(store.plan);

  const mealVar = {
    "short-rib": "var(--gs-meal-short-rib)",
    whitefish: "var(--gs-meal-whitefish)",
    ravioli: "var(--gs-meal-ravioli)",
  };

  const cards = $derived.by(() =>
    plan.tables.map((table) => {
      let filled = 0;
      for (const s of Object.values(plan.seating)) if (s.tableId === table.id) filled += 1;
      const warnings = store.warnings.byTable?.[table.id] || [];
      const severity = warnings.some((w) => w.severity === "error")
        ? "error"
        : warnings.some((w) => w.severity === "warn")
          ? "warn"
          : warnings.length
            ? "info"
            : "";
      return { table, filled, warnings, severity, meals: tableMeals(plan, table.id) };
    }),
  );

  function addTable() {
    const id = store.addTable();
    store.pushToast({
      kind: "ok",
      message: "Table added at the back of the room.",
      action: { label: "Undo", run: () => store.undo() },
    });
    if (id) ui.openTable(id);
  }
</script>

<div class="mtt">
  <div class="mtt-head">
    <p class="mtt-lead">
      <strong>{plan.tables.length}</strong> tables · <strong>{store.stats.openSeats}</strong> open seats
    </p>
  </div>

  <div class="mtt-body gs-scroll">
    <div class="mtt-grid">
      {#each cards as card (card.table.id)}
        <button type="button" class="mtc" onclick={() => ui.openTable(card.table.id)}>
          <span class="mtc-top">
            <span class="mtc-num">{card.table.number}</span>
            {#if card.table.locked}
              <svg class="mtc-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Locked">
                <rect x="5" y="11" width="14" height="9" rx="1.5" />
                <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" stroke-linecap="round" />
              </svg>
            {/if}
            {#if card.severity}
              <span class="mtc-badge" data-sev={card.severity}>{card.warnings.length}</span>
            {/if}
          </span>

          {#if card.table.name}
            <span class="mtc-name">{card.table.name}</span>
          {/if}

          <span class="mtc-count">{card.filled}/{card.table.seats}</span>
          <span class="mtc-bar" aria-hidden="true">
            <span style={`width:${Math.round((card.filled / card.table.seats) * 100)}%`}></span>
          </span>

          <span class="mtc-meals">
            {#each MEALS as m (m.id)}
              {#if card.meals[m.id]}
                <span class="mtc-meal">
                  <span class="gs-dot" style={`background:${mealVar[m.id]}`}></span>{card.meals[m.id]}
                </span>
              {/if}
            {/each}
            {#if card.meals.none}
              <span class="mtc-meal">
                <span class="gs-dot" style="background:var(--gs-meal-none)"></span>{card.meals.none}
              </span>
            {/if}
          </span>
        </button>
      {/each}

      <button type="button" class="mtc mtc--add" onclick={addTable}>
        <span class="mtc-plus" aria-hidden="true">+</span>
        <span class="mtc-addlbl">Add table</span>
      </button>
    </div>
  </div>
</div>

<style>
  .mtt {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #0a111d;
  }
  .mtt-head {
    flex: 0 0 auto;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(228, 201, 138, 0.16);
    background: rgba(9, 15, 26, 0.98);
  }
  .mtt-lead {
    margin: 0;
    font-size: 13px;
    color: var(--gs-dim);
  }
  .mtt-lead strong {
    color: var(--gs-cream);
    font-variant-numeric: tabular-nums;
  }
  .mtt-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 12px;
  }
  .mtt-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  @media (min-width: 700px) {
    .mtt-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  .mtc {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-height: 118px;
    padding: 11px 12px;
    border: 1px solid rgba(228, 201, 138, 0.28);
    border-radius: 3px;
    background: linear-gradient(180deg, rgba(255, 248, 239, 0.06), rgba(255, 248, 239, 0.02));
    color: var(--gs-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .mtc:active {
    border-color: var(--gs-gold-bright);
    background: rgba(255, 189, 89, 0.16);
  }
  .mtc-top {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
  }
  .mtc-num {
    font-family: "Playfair Display", Georgia, serif;
    font-style: italic;
    font-weight: 600;
    font-size: 30px;
    line-height: 1;
    color: var(--gs-cream);
  }
  .mtc-lock {
    width: 15px;
    height: 15px;
    color: #8f9bab;
  }
  .mtc-badge {
    margin-left: auto;
    min-width: 22px;
    height: 22px;
    line-height: 22px;
    padding: 0 6px;
    border-radius: 11px;
    background: var(--gs-warn);
    color: #17202c;
    font-size: 12px;
    font-weight: 700;
    text-align: center;
  }
  .mtc-badge[data-sev="error"] {
    background: var(--gs-error);
    color: #fff3f0;
  }
  .mtc-badge[data-sev="info"] {
    background: #8794a5;
  }
  .mtc-name {
    font-size: 12px;
    color: var(--gs-gold-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .mtc-count {
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    color: #c6d0dc;
  }
  .mtc-bar {
    display: block;
    width: 100%;
    height: 3px;
    background: rgba(228, 201, 138, 0.16);
  }
  .mtc-bar span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--gs-gold), var(--gs-gold-bright));
  }
  .mtc-meals {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 11.5px;
    color: #8f9bab;
    font-variant-numeric: tabular-nums;
  }
  .mtc-meal {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .mtc--add {
    align-items: center;
    justify-content: center;
    gap: 6px;
    border-style: dashed;
    color: var(--gs-gold-soft);
  }
  .mtc-plus {
    font-size: 30px;
    line-height: 1;
  }
  .mtc-addlbl {
    font-size: 13px;
  }
</style>
