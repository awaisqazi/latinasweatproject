<!-- The running count: seated, open seats, meals, warnings. -->
<script>
  import { getContext } from "svelte";
  import { MEALS } from "../../lib/galaSeating/model.js";

  const { store, ui } = getContext("gala-seating");
  const s = $derived(store.stats);
  const counts = $derived(store.warnings.counts || { error: 0, warn: 0, info: 0 });

  const mealVar = {
    "short-rib": "var(--gs-meal-short-rib)",
    whitefish: "var(--gs-meal-whitefish)",
    ravioli: "var(--gs-meal-ravioli)",
  };
  const pct = $derived(s.dinnerGuests ? Math.round((s.dinnerSeated / s.dinnerGuests) * 100) : 0);
</script>

<div class="sb">
  <div class="sb-progress" aria-hidden="true"><span style={`width:${pct}%`}></span></div>

  <div class="sb-items">
    <span class="sb-item sb-item--lead">
      <strong>{s.dinnerSeated}</strong> of {s.dinnerGuests} dinner guests seated
    </span>
    <span class="sb-sep">·</span>
    <span class="sb-item"><strong>{s.openSeats}</strong> open seats</span>
    <span class="sb-sep">·</span>
    <span class="sb-item"><strong>{s.tables}</strong> tables</span>
    {#if s.lateNight}
      <span class="sb-sep">·</span>
      <span class="sb-item">{s.lateNight} late night</span>
    {/if}

    <span class="sb-sep">·</span>
    <span class="sb-meals">
      {#each MEALS as meal (meal.id)}
        <span class="sb-meal" title={`${meal.label}: ${s.mealsSeated[meal.id] || 0} seated of ${s.mealsAll[meal.id] || 0}`}>
          <span class="gs-dot" style={`background:${mealVar[meal.id]}`}></span>
          {s.mealsAll[meal.id] || 0}
        </span>
      {/each}
      {#if s.mealsAll.none}
        <span class="sb-meal" title="Seated for dinner with no entrée selection">
          <span class="gs-dot" style="background:var(--gs-meal-none)"></span>
          {s.mealsAll.none} no meal
        </span>
      {/if}
    </span>

    {#if s.placeholders || s.unmatched}
      <span class="sb-sep">·</span>
      <button
        type="button"
        class="sb-recon"
        onclick={() => {
          ui.listFilter = "reconcile";
          ui.listOpen = true;
        }}
        title="Unnamed ticket seats and dinner responses with no ticket"
      >
        {s.placeholders} unnamed {s.placeholders === 1 ? "seat" : "seats"} · {s.unmatched} unmatched
        {s.unmatched === 1 ? "diner" : "diners"}
      </button>
    {/if}

    {#if counts.error || counts.warn}
      <span class="sb-sep">·</span>
      <button type="button" class="sb-warn" onclick={() => (ui.panel = "warnings")}>
        {counts.error ? `${counts.error} to fix` : ""}
        {counts.error && counts.warn ? " · " : ""}
        {counts.warn ? `${counts.warn} to review` : ""}
      </button>
    {/if}
  </div>
</div>

<style>
  .sb {
    flex: 0 0 auto;
    position: relative;
    border-bottom: 1px solid rgba(228, 201, 138, 0.14);
    background: rgba(9, 15, 26, 0.8);
  }
  .sb-progress {
    height: 2px;
    background: rgba(228, 201, 138, 0.12);
  }
  .sb-progress span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--gs-gold), var(--gs-gold-bright));
    transition: width 0.35s ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .sb-progress span {
      transition: none;
    }
  }
  .sb-items {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    padding: 6px 14px;
    font-size: 12px;
    color: var(--gs-dim);
  }
  .sb-item strong {
    color: var(--gs-cream);
    font-variant-numeric: tabular-nums;
  }
  .sb-item--lead {
    color: #c6d0dc;
  }
  .sb-sep {
    color: #4d5a6b;
  }
  .sb-meals {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .sb-meal {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-variant-numeric: tabular-nums;
  }
  .sb-recon {
    background: none;
    border: 1px solid rgba(255, 189, 89, 0.45);
    border-radius: 2px;
    padding: 1px 6px;
    color: var(--gs-gold-soft);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
    min-height: 0;
  }
  .sb-recon:hover {
    background: rgba(255, 189, 89, 0.16);
    color: var(--gs-cream);
  }
  .sb-warn {
    background: none;
    border: none;
    padding: 0;
    color: var(--gs-warn);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    min-height: 0;
  }
  @media (max-width: 1023px) {
    .sb-items {
      padding: 5px 10px;
      font-size: 11.5px;
      gap: 6px;
      flex-wrap: nowrap;
      overflow-x: auto;
      scrollbar-width: none;
      white-space: nowrap;
    }
    .sb-items::-webkit-scrollbar {
      display: none;
    }
    .sb-meals {
      flex: 0 0 auto;
      gap: 7px;
    }
  }
</style>
