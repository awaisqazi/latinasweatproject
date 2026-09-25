<!--
  The cards that tell a volunteer what just happened.

  "Already checked in" is the important one, and it is NOT an error: two people
  reached the same guest at the same moment, the server settled it, and this
  card says who got there first, when, and with which paddle, so the volunteer
  can say "you are already in, paddle 17" without looking anything up.
-->
<script>
  import { getContext } from "svelte";
  import { Check, Info, TriangleAlert, X } from "@lucide/svelte";
  import { clockTime } from "../../lib/galaCheckin/derive.js";

  const { store } = getContext("gala-checkin");

  function alreadyText(n) {
    const who = n.by ? ` by ${n.by}` : "";
    const when = n.at ? ` at ${clockTime(n.at)}` : "";
    const paddle = n.paddle == null ? "" : ` · Paddle ${n.paddle}`;
    return `Already checked in${who}${when}${paddle}`;
  }
</script>

<div class="ns" role="region" aria-label="Messages" aria-live="polite">
  {#each store.notices as n (n.id)}
    <div class="ns-card ns-card--{n.kind}">
      <span class="ns-icon" aria-hidden="true">
        {#if n.kind === "already"}<Check size={18} strokeWidth={2.6} />
        {:else if n.kind === "error"}<TriangleAlert size={18} strokeWidth={2.4} />
        {:else}<Info size={18} strokeWidth={2.2} />{/if}
      </span>
      <p class="ns-text">
        {#if n.kind === "already"}
          {alreadyText(n)}
        {:else}
          {n.text}
        {/if}
      </p>
      <button type="button" class="ns-x" aria-label="Dismiss" onclick={() => store.dismissNotice(n.id)}>
        <X size={16} strokeWidth={2.4} />
      </button>
    </div>
  {/each}
</div>

<style>
  .ns {
    position: fixed;
    z-index: 70;
    left: 8px;
    right: 8px;
    bottom: calc(76px + env(safe-area-inset-bottom, 0px));
    display: grid;
    gap: 8px;
    pointer-events: none;
  }
  .ns-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 10px 10px 12px;
    background: var(--g26-surface-2);
    border: 1px solid var(--g26-line);
    border-left-width: 4px;
    border-radius: var(--g26-r-card);
    box-shadow: 0 20px 50px -30px rgb(0 0 0 / 0.95);
    pointer-events: auto;
  }
  .ns-card--already {
    border-left-color: var(--g26-gold);
    color: var(--g26-cream);
  }
  .ns-card--already .ns-icon {
    color: var(--g26-gold);
  }
  .ns-card--info {
    border-left-color: var(--g26-ok);
    color: var(--g26-cream);
  }
  .ns-card--info .ns-icon {
    color: var(--g26-ok);
  }
  .ns-card--error {
    border-left-color: var(--g26-alert);
    color: var(--g26-cream);
  }
  .ns-card--error .ns-icon {
    color: var(--g26-alert);
  }

  .ns-icon {
    flex: none;
    display: grid;
    place-items: center;
  }
  .ns-text {
    flex: 1;
    margin: 0;
    font-family: var(--g26-sans);
    font-size: 15px;
    font-weight: 700;
    line-height: 1.4;
  }
  .ns-x {
    flex: none;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    color: var(--g26-dim);
    background: transparent;
    border: 0;
    cursor: pointer;
  }
  .ns-x:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }
</style>
