<!--
  The keyboard map, collapsed by default and one key away.

  Everything in the terminal is reachable without a mouse, so the map is not a
  nicety: it is the interface. It stays collapsed because a clerk who needs it
  is between entries, and open it steals nothing from the tape.

  ONE DELIBERATE DEVIATION from 08 s7.2, and it is worth knowing about: that
  table gives the level to the number keys, but this terminal's single field is
  where paddle digits go, and a digit cannot mean two things at 8:40 PM. The
  level moves on the arrows and the brackets, or on Option plus a number.
-->
<script>
  import { ChevronDown, Keyboard } from "@lucide/svelte";

  let { open = $bindable(false) } = $props();

  const KEYS = [
    ["45", "Enter", "Record paddle 45 at the level being called"],
    ["12 45 88", "Enter", "A burst, because spotters call in threes"],
    ["45*750", "Enter", "$750 from paddle 45, whatever the level is"],
    ["45a", "Enter", "Anonymous for this gift only"],
    ["45!", "Enter", "A second gift from 45 at this level, on purpose"],
    ["[", "]", "Step the level up or down (the arrows do the same)"],
    ["Option", "1 to 9", "Jump straight to a level"],
    ["Esc", "Z", "Undo the entry you just made"],
    ["O", "", "Another gift: cash, card, online, sponsor, match"],
    ["R", "", "Show only the rows that need review"],
    ["?", "", "Open and close this list"],
  ];
</script>

<div class="hs">
  <button type="button" class="hs-toggle" aria-expanded={open} onclick={() => (open = !open)}>
    <Keyboard size={16} strokeWidth={2.2} />
    <span>Keys</span>
    <ChevronDown size={15} strokeWidth={2.4} class={open ? "hs-flip" : ""} />
  </button>

  {#if open}
    <dl class="hs-list">
      {#each KEYS as [a, b, what] (a + b)}
        <div class="hs-item">
          <dt>
            <kbd>{a}</kbd>
            {#if b}<kbd>{b}</kbd>{/if}
          </dt>
          <dd>{what}</dd>
        </div>
      {/each}
    </dl>
  {/if}
</div>

<style>
  .hs {
    border-top: 1px solid var(--g26-line);
    background: var(--g26-surface-0);
  }
  .hs-toggle {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    min-height: 44px;
    padding: 0 12px;
    font-family: var(--g26-sans);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--g26-dim);
    background: transparent;
    border: 0;
    cursor: pointer;
  }
  .hs-toggle:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }
  .hs-toggle :global(.hs-flip) {
    transform: rotate(180deg);
  }

  .hs-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 2px 18px;
    margin: 0;
    padding: 0 12px 12px;
  }
  .hs-item {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 3px 0;
  }
  .hs-item dt {
    flex: none;
    display: flex;
    gap: 4px;
    min-width: 108px;
  }
  .hs-item dd {
    margin: 0;
    font-size: 12px;
    color: var(--g26-dim);
  }
  kbd {
    padding: 2px 6px;
    font-family: var(--g26-sans);
    font-size: 11px;
    font-weight: 800;
    color: var(--g26-cream);
    background: var(--g26-surface-2);
    border: 1px solid var(--g26-line);
    border-bottom-width: 2px;
    border-radius: 3px;
  }
</style>
