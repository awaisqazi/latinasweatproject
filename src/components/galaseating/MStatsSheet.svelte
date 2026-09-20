<!--
  The rest of the numbers.

  The map keeps one line of the two that matter; everything else, entrées, late
  night, the reconciliation backlog, lives here rather than in a strip that gets
  clipped mid-word at the right edge of a 390px screen.
-->
<script>
  import { getContext } from "svelte";
  import { MEALS } from "../../lib/galaSeating/model.js";
  import MSheet from "./MSheet.svelte";

  let { nav } = $props();
  const { store, ui } = getContext("gala-seating");

  const s = $derived(store.stats);
  const counts = $derived(store.warnings.counts || { error: 0, warn: 0, info: 0 });
  const pct = $derived(s.dinnerGuests ? Math.round((s.dinnerSeated / s.dinnerGuests) * 100) : 0);

  const mealVar = {
    "short-rib": "var(--gs-meal-short-rib)",
    whitefish: "var(--gs-meal-whitefish)",
    ravioli: "var(--gs-meal-ravioli)",
  };

  function reconcile() {
    ui.listChips = ["reconcile"];
    ui.listSegment = "all";
    nav.closeTop();
    queueMicrotask(() => nav.selectTab("guests"));
  }
</script>

<MSheet eyebrow="The count" title="Where the plan stands" snaps={[0.62, 0.92]} onclose={() => nav.closeTop()}>
  {#snippet children()}
    <div class="mss">
      <div class="mss-bar" aria-hidden="true"><span style={`width:${pct}%`}></span></div>
      <p class="mss-lead">
        <strong>{s.dinnerSeated}</strong> of {s.dinnerGuests} dinner guests seated
      </p>

      <dl class="mss-dl">
        <dt>Open seats</dt>
        <dd>{s.openSeats}</dd>
        <dt>Tables</dt>
        <dd>{s.tables}</dd>
        {#if s.lateNight}
          <dt>Late night, no dinner seat</dt>
          <dd>{s.lateNight}</dd>
        {/if}
        <dt>To fix</dt>
        <dd>{counts.error || 0}</dd>
        <dt>To review</dt>
        <dd>{counts.warn || 0}</dd>
      </dl>

      <h3 class="mss-h">Entrées ordered</h3>
      <ul class="mss-meals">
        {#each MEALS as meal (meal.id)}
          <li>
            <span class="gs-dot" style={`background:${mealVar[meal.id]}`}></span>
            <span class="mss-mealname">{meal.label}</span>
            <span class="mss-mealn">{s.mealsSeated[meal.id] || 0} seated of {s.mealsAll[meal.id] || 0}</span>
          </li>
        {/each}
        {#if s.mealsAll.none}
          <li>
            <span class="gs-dot" style="background:var(--gs-meal-none)"></span>
            <span class="mss-mealname">No entrée chosen</span>
            <span class="mss-mealn">{s.mealsAll.none}</span>
          </li>
        {/if}
      </ul>

      {#if s.placeholders || s.unmatched}
        <h3 class="mss-h">Still to reconcile</h3>
        <p class="mss-recon">
          {s.placeholders} unnamed {s.placeholders === 1 ? "seat" : "seats"} · {s.unmatched} unmatched
          {s.unmatched === 1 ? "diner" : "diners"}
        </p>
        <button type="button" class="mss-btn" onclick={reconcile}>Show them in the guest list</button>
      {/if}
    </div>
  {/snippet}
</MSheet>

<style>
  .mss-bar {
    height: 4px;
    background: rgba(23, 32, 44, 0.12);
  }
  .mss-bar span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--gs-gold), var(--gs-gold-bright));
  }
  .mss-lead {
    margin: 10px 0 14px;
    font-size: 15px;
    color: #5f6875;
  }
  .mss-lead strong {
    color: #6b4a12;
    font-size: 19px;
  }
  .mss-dl {
    margin: 0;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px 12px;
    font-size: 14px;
  }
  .mss-dl dt {
    color: #78818f;
  }
  .mss-dl dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .mss-h {
    margin: 20px 0 8px;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #8a6a24;
  }
  .mss-meals {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .mss-meals li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(23, 32, 44, 0.08);
    font-size: 14px;
  }
  .mss-mealname {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mss-mealn {
    flex: 0 0 auto;
    color: #78818f;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
  }
  .mss-recon {
    margin: 0 0 10px;
    font-size: 14px;
    color: #4a525f;
  }
  .mss-btn {
    width: 100%;
    min-height: 50px;
    border: 1px solid rgba(23, 32, 44, 0.28);
    border-radius: 3px;
    background: var(--gs-gold-bright);
    color: var(--gs-ink);
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }
</style>
