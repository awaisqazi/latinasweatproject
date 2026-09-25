<script>
  // The paddle-raise ladder on the projector: every giving level and what it
  // provides, as a quiet list beside the thermometer. The level being called
  // is lit gold; the others step back. Copy wraps, never truncates: the box
  // shrinks its type (fitBox) until the whole ladder fits.
  import { COPY, levelMoney } from "../../../lib/galaLive/config.js";
  import { fitBox } from "../../../lib/galaLive/fitName.js";

  let { levels = [], currentCents = null } = $props();

  const calling = $derived(currentCents != null && levels.some((l) => Number(l.amount_cents) === Number(currentCents)));
  const fitKey = $derived(`${currentCents}|${levels.map((l) => `${l.amount_cents}:${l.impact || l.label}`).join("|")}`);
</script>

<div class="pl" use:fitBox={{ min: 0.5, key: fitKey }}>
  <div class="eyebrow">{COPY.ladderEyebrow}</div>
  <ol class="rungs">
    {#each levels as l (l.amount_cents)}
      {@const cur = calling && Number(l.amount_cents) === Number(currentCents)}
      <li class:cur class:dim={calling && !cur}>
        <span class="amt">{levelMoney(l.amount_cents)}</span>
        <span class="imp">{l.impact || l.label}</span>
      </li>
    {/each}
  </ol>
</div>

<style>
  .pl {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 6 * var(--k, 1));
    padding: calc(var(--u) * 10) calc(var(--u) * 16);
    background: rgba(5, 7, 12, 0.72);
    border-radius: calc(var(--u) * 4);
    overflow: hidden;
  }
  .eyebrow {
    font-weight: 800;
    letter-spacing: 0.34em;
    font-size: calc(var(--u) * 20 * var(--k, 1));
    line-height: 1.15;
    color: var(--g26-gold);
    text-transform: uppercase;
  }
  .rungs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 2 * var(--k, 1));
  }
  li {
    display: grid;
    grid-template-columns: calc(var(--u) * 132 * var(--k, 1)) minmax(0, 1fr);
    align-items: baseline;
    column-gap: calc(var(--u) * 16);
    padding: calc(var(--u) * 3 * var(--k, 1)) calc(var(--u) * 10);
    border-left: calc(var(--u) * 5) solid transparent;
    border-radius: calc(var(--u) * 3);
    transition: background-color 400ms ease, opacity 400ms ease;
  }
  .amt {
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: calc(var(--u) * 36 * var(--k, 1));
    line-height: 1.05;
    color: var(--g26-cream);
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: lining-nums;
  }
  .imp {
    font-size: calc(var(--u) * 24 * var(--k, 1));
    font-weight: 500;
    line-height: 1.16;
    color: var(--g26-warm);
    overflow-wrap: break-word;
    min-width: 0;
  }
  .cur {
    background: rgba(255, 189, 89, 0.16);
    border-left-color: var(--g26-gold);
  }
  .cur .amt {
    color: var(--g26-gold);
  }
  .cur .imp {
    color: var(--g26-cream);
    font-weight: 700;
  }
  .dim {
    opacity: 0.58;
  }
</style>
