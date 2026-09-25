<script>
  // Milestone, goal and sold banners. Always on a plate: the prototype's first
  // goal finale washed an unplated banner to invisibility, and that plate is
  // now one of the non-negotiables (05 section 3.5).
  import { scale, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  let { banner = null, reduced = false } = $props();
  const dur = $derived(reduced ? 0 : 500);
</script>

{#if banner}
  <div
    class="banner"
    in:scale={{ start: 0.96, duration: dur, easing: cubicOut }}
    out:fade={{ duration: reduced ? 0 : 320 }}
  >
    <small>{banner.small}</small>
    <span>{banner.text}</span>
  </div>
{/if}

<style>
  .banner {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(var(--u) * 8);
    text-align: center;
    /* 74% ink minimum. Nothing here may depend on the canvas behind it. */
    background: rgba(5, 7, 12, 0.78);
    border-top: calc(var(--u) * 3) solid var(--g26-gold);
    border-bottom: calc(var(--u) * 3) solid var(--g26-gold);
    padding: calc(var(--u) * 14) calc(var(--u) * 24);
  }
  small {
    font-family: var(--g26-sans);
    font-weight: 800;
    letter-spacing: 0.4em;
    font-size: calc(var(--u) * 28);
    color: var(--g26-gold);
    text-transform: uppercase;
    line-height: 1;
  }
  span {
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
    font-size: calc(var(--u) * 84);
    line-height: 1.04;
    color: var(--g26-cream);
  }
</style>
