<script>
  // The hero card. Comets launch from its left edge 0.6 s after it appears, so
  // the name and the light are visibly linked without any moving text
  // (05 section 3.3). It is also a quiet rect: dust dims inside it.
  import { fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { money } from "../../../lib/galaLive/config.js";
  import { fitWidth } from "../../../lib/galaLive/fitName.js";

  let { card = null, compact = false, reduced = false } = $props();

  const dur = $derived(reduced ? 0 : 450);
  const nameSize = $derived.by(() => {
    const n = (card?.name || "").length;
    const base = card && card.tier >= 4 && !compact ? 88 : compact ? 64 : 74;
    if (n > 22) return Math.round(base * 0.62);
    if (n > 15) return Math.round(base * 0.78);
    return base;
  });
</script>

{#if card}
  {#key card.seq}
    <div
      class="gl-card"
      class:t4={card.tier >= 4}
      class:compact
      data-fx-origin="gift"
      in:fly={{ y: compact ? 14 : 26, duration: dur, easing: cubicOut }}
      out:fly={{ y: 10, duration: reduced ? 0 : 320, easing: cubicOut }}
    >
      <div class="eyebrow">{card.eyebrow}</div>
      <div class="namewrap"><div class="name" use:fitWidth={0.5} style={`font-size: calc(var(--u) * ${nameSize} * var(--fit, 1))`}>{card.name}</div></div>
      <div class="amt">{money(card.cents)}</div>
    </div>
  {/key}
{/if}

<style>
  .gl-card {
    position: absolute;
    inset: 0;
    padding: calc(var(--u) * 14) calc(var(--u) * 28);
    background: rgba(5, 7, 12, 0.78);
    border: calc(var(--u) * 2) solid rgba(255, 189, 89, 0.55);
    border-left: calc(var(--u) * 8) solid var(--g26-gold);
    border-radius: calc(var(--u) * 6);
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: calc(var(--u) * 4);
    overflow: hidden;
  }
  .eyebrow {
    font-weight: 800;
    letter-spacing: 0.34em;
    text-transform: uppercase;
    font-size: calc(var(--u) * 26);
    color: var(--g26-gold);
    line-height: 1;
  }
  .name {
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
    line-height: 1.06;
    color: var(--g26-cream);
    white-space: nowrap;
    display: inline-block;
    max-width: none;
  }
  /* Never an ellipsis: the name shrinks to fit, then wraps. */
  .namewrap {
    min-width: 0;
    overflow: hidden;
  }
  .amt {
    font-size: calc(var(--u) * 60);
    font-weight: 800;
    color: var(--g26-gold);
    font-variant-numeric: tabular-nums lining-nums;
    line-height: 1.05;
  }
  .compact .amt {
    font-size: calc(var(--u) * 48);
  }
  /* T4 is the only gold-filled surface on the stage, and it is brief. */
  .t4 {
    background: linear-gradient(100deg, rgba(185, 132, 47, 0.94), rgba(255, 189, 89, 0.94));
    border-color: var(--g26-cream);
  }
  .t4 .eyebrow,
  .t4 .amt {
    color: var(--g26-ink);
  }
  .t4 .name {
    color: var(--g26-ink);
  }
</style>
