<!-- Gestures and shortcuts, for the planner who did not build this. -->
<script>
  import { getContext } from "svelte";
  import Sheet from "./Sheet.svelte";

  const { ui } = getContext("gala-seating");
  const open = $derived(ui.panel === "help");

  const MOUSE = [
    ["Drag a name onto a seat", "Seats that guest. Drop on a table instead and they take the first free seat."],
    ["Drop on someone", "The two swap seats."],
    ["Drag a party header", "Seats the whole party, as many as fit."],
    ["Drag back to the list", "Unseats. The drop zone appears while you drag."],
    ["Drag a table", "Moves it, snapped to the grid, with alignment guides. Unlock the layout first."],
    ["Corner handle on the podium or dance floor", "Resizes it."],
    ["Drag empty floor", "Pans the room. Wheel zooms, pinch zooms on touch."],
    ["Long press or right click on empty floor", "Drops a table, bar or label right there."],
  ];

  const TAP = [
    ["Tap a name", "Selects them, opens the details and finds their seat on the floor."],
    ["Tap a seat", "Selects whoever is sitting there and scrolls the list to their row."],
    ["With someone selected, tap a seat", "Places them there. Escape cancels."],
    ["Long press a name on touch", "Picks them up to drag. A plain tap still opens them."],
  ];

  const KEYS = [
    ["Cmd or Ctrl + Z", "Undo"],
    ["Shift + Cmd or Ctrl + Z", "Redo"],
    ["/", "Jump to the search box"],
    ["Arrow keys in the list", "Move between names"],
    ["Enter on a name", "Open and locate"],
    ["Tab to a table, then arrow keys", "Move around its seats"],
    ["Enter on a seat", "Place the selected guest there"],
    ["Delete on a seat or a name", "Unseat"],
    ["Escape", "Close a panel, or drop the selection"],
    ["?", "This list"],
  ];
</script>

{#if open}
  <Sheet eyebrow="Reference" title="Gestures and shortcuts" onclose={() => (ui.panel = "none")}>
    {#snippet children()}
      <div class="hp">
        <section>
          <h3>Pointer</h3>
          <dl>
            {#each MOUSE as [term, def] (term)}
              <dt>{term}</dt>
              <dd>{def}</dd>
            {/each}
          </dl>
        </section>

        <section>
          <h3>Tap and touch</h3>
          <dl>
            {#each TAP as [term, def] (term)}
              <dt>{term}</dt>
              <dd>{def}</dd>
            {/each}
          </dl>
        </section>

        <section>
          <h3>Keyboard</h3>
          <dl class="hp-keys">
            {#each KEYS as [term, def] (term)}
              <dt><kbd>{term}</kbd></dt>
              <dd>{def}</dd>
            {/each}
          </dl>
        </section>

        <section>
          <h3>Colours on the floor</h3>
          <ul class="hp-legend">
            <li><span class="gs-dot" style="background:var(--gs-meal-short-rib)"></span> Short rib</li>
            <li><span class="gs-dot" style="background:var(--gs-meal-whitefish)"></span> Whitefish</li>
            <li><span class="gs-dot" style="background:var(--gs-meal-ravioli)"></span> Ravioli</li>
            <li><span class="gs-dot" style="background:var(--gs-meal-none)"></span> No entrée chosen</li>
          </ul>
          <p class="hp-note">
            An amber seat ring means a warning, a red one means something to fix. A dashed seat is
            empty, or an unnamed seat waiting for a name. A red table means it overlaps another table
            or sits on the dance floor.
          </p>
        </section>

        <section>
          <h3>Saving</h3>
          <p class="hp-note">
            Every change is saved to this browser the moment you make it, and pushed to the shared
            plan a moment later. If the network drops, keep working: the changes queue up and go out
            when it comes back.
          </p>
        </section>
      </div>
    {/snippet}
  </Sheet>
{/if}

<style>
  .hp section {
    margin-bottom: 20px;
  }
  .hp h3 {
    margin: 0 0 8px;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #8a6a24;
  }
  .hp dl {
    margin: 0;
    display: grid;
    grid-template-columns: 42% 1fr;
    gap: 6px 12px;
    font-size: 12.5px;
    line-height: 1.45;
  }
  .hp dt {
    color: var(--gs-ink);
    font-weight: 700;
  }
  .hp dd {
    margin: 0;
    color: #4a525f;
  }
  .hp-keys dt {
    font-weight: 400;
  }
  kbd {
    display: inline-block;
    padding: 2px 6px;
    border: 1px solid rgba(23, 32, 44, 0.25);
    border-bottom-width: 2px;
    border-radius: 3px;
    background: #fffdf9;
    font-family: inherit;
    font-size: 11.5px;
  }
  .hp-legend {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 12.5px;
  }
  .hp-legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .hp-note {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.55;
    color: #4a525f;
  }
</style>
