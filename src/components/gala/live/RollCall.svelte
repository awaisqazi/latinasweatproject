<script>
  // The no-dropped-names guarantee. Every gift gets a row here whether or not
  // it won a hero card, and the grid widens to two or three columns as the
  // room speeds up (05 section 4.3).
  import { fly, fade } from "svelte/transition";
  import { money } from "../../../lib/galaLive/config.js";
  import { fitWidth } from "../../../lib/galaLive/fitName.js";

  let { rows = [], overflow = 0, reduced = false } = $props();

  const cols = $derived(rows.length > 8 ? 3 : rows.length > 4 ? 2 : 1);
  const dur = $derived(reduced ? 0 : 400);
</script>

<div class="roll" style={`--cols:${cols}`}>
  {#if overflow > 0}
    <div class="chip" transition:fade={{ duration: dur }}>+{overflow} more gifts</div>
  {/if}
  {#each rows as row (row.id)}
    <div
      class="row"
      class:big={row.tier >= 3}
      in:fly={{ x: reduced ? 0 : 24, duration: dur }}
      out:fade={{ duration: dur }}
    >
      <span class="nwrap"><span class="n" use:fitWidth={{ min: 0.45, wrap: false }}>{row.name}</span></span>
      <span class="a">{money(row.cents)}</span>
    </div>
  {/each}
</div>

<style>
  .roll {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(var(--cols, 1), 1fr);
    grid-auto-rows: calc(var(--u) * 46);
    gap: calc(var(--u) * 6) calc(var(--u) * 18);
    align-content: start;
    overflow: hidden;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: calc(var(--u) * 14);
    padding: 0 calc(var(--u) * 12);
    font-size: calc(var(--u) * 34);
    font-weight: 700;
    color: var(--g26-cream);
    background: rgba(5, 7, 12, 0.58);
    border-left: calc(var(--u) * 4) solid rgba(255, 189, 89, 0.7);
    border-radius: calc(var(--u) * 2);
    white-space: nowrap;
    overflow: hidden;
    line-height: calc(var(--u) * 46);
  }
  /* Names are never cut: the name shrinks to fit its row instead. */
  .row .nwrap {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
  }
  .row .n {
    display: inline-block;
    font-size: calc(var(--u) * 34 * var(--fit, 1));
  }
  .row .a {
    flex: 0 0 auto;
  }
  .row .a {
    color: var(--g26-gold);
    font-weight: 800;
    font-variant-numeric: tabular-nums lining-nums;
  }
  .row.big {
    color: var(--g26-gold);
    border-left-color: var(--g26-cream);
  }
  .chip {
    grid-column: 1 / -1;
    font-size: calc(var(--u) * 26);
    font-weight: 800;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--g26-gold);
    background: rgba(5, 7, 12, 0.62);
    padding: 0 calc(var(--u) * 12);
    line-height: calc(var(--u) * 40);
  }
</style>
