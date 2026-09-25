<!--
  The level being called, which is the whole point of level-locked entry: the
  clerk picks the amount once and then types paddles, so an amount is almost
  never typed and a fat finger has almost nothing to hit (09 R5).

  A LEAD (admin session) moves the projector with the level, so the big screen,
  the other terminal and the room are looking at the same number. A door clerk
  can still work a level of their own, and the bar says so out loud rather than
  pretending both terminals agree.
-->
<script>
  import { Check, Lock, Radio } from "@lucide/svelte";
  import { money } from "../../lib/galaTerminal/derive.js";

  let { store } = $props();

  const levels = $derived(store.levels);
  const active = $derived(store.levelCents);
  const room = $derived(store.roomLevelCents);
  const adrift = $derived(!store.following && room != null && room !== active);
</script>

<div class="lb">
  <div class="lb-rail" role="radiogroup" aria-label="Giving level">
    {#each levels as l (l.amount_cents)}
      <button
        type="button"
        role="radio"
        aria-checked={l.amount_cents === active}
        class="lb-chip"
        class:lb-chip--on={l.amount_cents === active}
        class:lb-chip--room={l.amount_cents === room && l.amount_cents !== active}
        onclick={() => store.setLevel(l.amount_cents)}
      >
        <span class="lb-key" aria-hidden="true">{l.key}</span>
        <span class="lb-amt">{money(l.amount_cents)}</span>
        {#if l.impact_line}<span class="lb-line">{l.impact_line}</span>{/if}
        {#if l.amount_cents === active}
          <span class="lb-on" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
        {/if}
      </button>
    {/each}
    {#if !levels.length}
      <p class="lb-none">No giving levels are configured yet. A lead sets them from the console.</p>
    {/if}
  </div>

  <p class="lb-state">
    {#if store.isAdmin}
      <span class="lb-badge lb-badge--lead"><Radio size={13} strokeWidth={2.4} /> Lead</span>
      <span>The big screen follows you.</span>
    {:else if adrift}
      <span class="lb-badge lb-badge--off"><Lock size={13} strokeWidth={2.4} /> Your level only</span>
      <button type="button" class="lb-follow" onclick={() => store.followRoom()}>
        Follow the room ({money(room)})
      </button>
    {:else}
      <span class="lb-badge"><Radio size={13} strokeWidth={2.4} /> Following the room</span>
      <span>The lead is calling {room == null ? "nothing yet" : money(room)}.</span>
    {/if}
  </p>
</div>

<style>
  .lb {
    display: grid;
    gap: 6px;
    padding: 8px 12px 6px;
    border-bottom: 1px solid var(--g26-line);
  }

  /* One row on a laptop, a thumb-flick on a phone. Never wraps into a grid that
     moves a level under the clerk's finger between two entries. */
  .lb-rail {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 2px;
  }
  .lb-rail::-webkit-scrollbar {
    display: none;
  }

  .lb-chip {
    position: relative;
    flex: 1 0 auto;
    display: grid;
    gap: 1px;
    min-width: 116px;
    min-height: 56px;
    padding: 7px 12px;
    text-align: left;
    font-family: var(--g26-sans);
    color: var(--g26-muted);
    background: var(--g26-surface-1);
    border: 1px solid var(--g26-line);
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }
  .lb-chip:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }
  .lb-chip--on {
    color: var(--g26-ink);
    background: var(--g26-gold);
    border-color: var(--g26-gold-hi);
  }
  /* The room is here, this terminal is not: shown, never silently overridden. */
  .lb-chip--room {
    border-color: var(--g26-line-strong);
    border-style: dashed;
  }

  .lb-key {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.2em;
    opacity: 0.7;
  }
  .lb-amt {
    font-size: 22px;
    font-weight: 800;
    line-height: 1.1;
    font-variant-numeric: tabular-nums lining-nums;
  }
  .lb-line {
    max-width: 22ch;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.25;
    opacity: 0.75;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lb-on {
    position: absolute;
    top: 6px;
    right: 8px;
  }
  .lb-none {
    margin: 0;
    padding: 12px 2px;
    font-size: 13px;
    color: var(--g26-dim);
  }

  .lb-state {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 12px;
    color: var(--g26-dim);
  }
  .lb-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--g26-gold-soft);
    border: 1px solid var(--g26-line);
    border-radius: 999px;
  }
  .lb-badge--lead {
    color: var(--g26-ink);
    background: var(--g26-gold-soft);
    border-color: var(--g26-gold-soft);
  }
  .lb-badge--off {
    color: var(--g26-alert);
    border-color: var(--g26-alert);
  }
  .lb-follow {
    min-height: 32px;
    padding: 0 10px;
    font-family: var(--g26-sans);
    font-size: 12px;
    font-weight: 800;
    color: var(--g26-gold);
    background: transparent;
    border: 1px solid var(--g26-line-strong);
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }
  .lb-follow:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }

  @media (max-width: 640px) {
    .lb-chip {
      min-width: 104px;
    }
    .lb-amt {
      font-size: 20px;
    }
  }
</style>
