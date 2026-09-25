<!--
  The paddle number, and the one rule that matters more than any other in this
  app: a number is shown ONLY when it is on a row the server sent.

  Nothing here counts, predicts, reserves or remembers a number. While an op is
  in flight the chip spins and says "Assigning"; if it turns out the volunteer
  was one tap behind another desk, the number that lands is the right one and
  nobody has already read a wrong one out loud.

  Sizes: sm (list rows), lg (party sheet), xl (the arrival card: the number the
  volunteer reads out while the paddle changes hands, legible at arm's length
  in a dark lobby).
-->
<script>
  import { LoaderCircle } from "@lucide/svelte";

  let {
    /** Straight from the server row. null means the server has not given one. */
    number = null,
    pending = false,
    size = "sm",
    // Kept for callers written before the dark sheets; every chip is dark now.
    tone = "dark",
    preassigned = false,
  } = $props();

  void tone;
  void preassigned;

  const state = $derived(pending ? "pending" : number == null ? "none" : "known");
</script>

<span class="pc pc--{size} pc--{state}" aria-live={pending ? "polite" : "off"}>
  {#if state === "known"}
    <span class="pc-word">Paddle</span>
    <span class="pc-num">{number}</span>
  {:else if state === "pending"}
    <span class="pc-spin" aria-hidden="true"><LoaderCircle size={size === "sm" ? 16 : 24} strokeWidth={2.2} /></span>
    <span class="pc-word">Assigning</span>
  {:else}
    <span class="pc-word">No paddle</span>
  {/if}
</span>

<style>
  .pc {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 9px;
    border: 1.5px solid var(--g26-gold);
    border-radius: var(--g26-r-chip);
    background: var(--g26-ink);
    font-family: var(--g26-sans);
    font-variant-numeric: tabular-nums lining-nums;
    white-space: nowrap;
  }

  .pc-word {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--g26-gold);
  }
  .pc-num {
    font-size: 20px;
    font-weight: 800;
    line-height: 1;
    color: var(--g26-cream);
  }

  .pc--none {
    border-color: rgb(255 248 239 / 0.3);
    background: transparent;
  }
  .pc--none .pc-word {
    color: var(--g26-dim);
  }

  .pc--pending .pc-word {
    color: var(--g26-gold-soft);
  }
  .pc-spin {
    display: inline-grid;
    place-items: center;
    color: var(--g26-gold);
  }
  @media (prefers-reduced-motion: no-preference) {
    .pc-spin {
      animation: pc-turn 1s linear infinite;
    }
  }
  @keyframes pc-turn {
    to { transform: rotate(360deg); }
  }

  .pc--lg {
    padding: 8px 14px;
    gap: 10px;
    border-width: 2px;
  }
  .pc--lg .pc-num {
    font-size: 44px;
  }
  .pc--lg .pc-word {
    font-size: 11px;
  }

  .pc--xl {
    flex-direction: column;
    gap: 2px;
    min-width: 132px;
    padding: 10px 18px 12px;
    border-width: 2px;
  }
  .pc--xl .pc-num {
    font-size: 72px;
    letter-spacing: -0.02em;
  }
  .pc--xl .pc-word {
    font-size: 12px;
    letter-spacing: 0.3em;
  }
</style>
