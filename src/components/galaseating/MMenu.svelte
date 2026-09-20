<!--
  The Menu sheet: everything that used to be crammed into the top bar as an
  unlabelled icon, now a full-width row with a word on it.

  Grouped the way a planner thinks: take it back, add something, do it for me,
  get it out of here, and finally hand the phone back.
-->
<script>
  import { getContext } from "svelte";
  import ExportMenu from "./ExportMenu.svelte";
  import MSheet from "./MSheet.svelte";

  let {
    nav,
    onautoseat = () => {},
    onhelp = () => {},
    onrename = () => {},
    onversions = () => {},
    onlock = () => {},
  } = $props();
  const { store, ui } = getContext("gala-seating");

  function run(fn) {
    nav.closeTop();
    // Let the sheet come down before the next surface goes up.
    queueMicrotask(fn);
  }

  function addTable() {
    const id = store.addTable();
    store.pushToast({
      kind: "ok",
      message: "Table added at the back of the room.",
      action: { label: "Undo", run: () => store.undo() },
    });
    if (id) ui.openTable(id);
  }
</script>

<MSheet title="Menu" snaps={[0.74, 0.94]} onclose={() => nav.closeTop()}>
  {#snippet children()}
    <div class="mm">
      <h3 class="mm-h">History</h3>
      <div class="mm-pair">
        <button type="button" class="mm-row" disabled={!store.canUndo} onclick={() => store.undo()}>
          <svg class="mm-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M9 14 4 9l5-5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M4 9h11a5 5 0 0 1 0 10h-3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Undo
        </button>
        <button type="button" class="mm-row" disabled={!store.canRedo} onclick={() => store.redo()}>
          <svg class="mm-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="m15 14 5-5-5-5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M20 9H9a5 5 0 0 0 0 10h3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Redo
        </button>
      </div>

      <h3 class="mm-h">Add to the plan</h3>
      <button type="button" class="mm-row" onclick={() => run(() => nav.openLayer({ type: "addGuest" }))}>
        <svg class="mm-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="10" cy="8" r="3.4" />
          <path d="M4 19.5c0-3.2 2.7-5.2 6-5.2 1.3 0 2.5.3 3.4.9" stroke-linecap="round" />
          <path d="M17 13v6M14 16h6" stroke-linecap="round" />
        </svg>
        Add guest
      </button>
      <button type="button" class="mm-row" onclick={() => run(addTable)}>
        <svg class="mm-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8.5v7M8.5 12h7" stroke-linecap="round" />
        </svg>
        Add table
      </button>

      <h3 class="mm-h">The room</h3>
      <button type="button" class="mm-row" onclick={() => run(onautoseat)}>
        <svg class="mm-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="m12 3 1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" stroke-linejoin="round" />
        </svg>
        Auto-seat
      </button>
      <button
        type="button"
        class="mm-row"
        aria-pressed={ui.layoutLocked}
        onclick={() => (ui.layoutLocked = !ui.layoutLocked)}
      >
        <svg class="mm-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="4" y="10" width="16" height="10" rx="1.5" />
          {#if ui.layoutLocked}
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke-linecap="round" />
          {:else}
            <path d="M8 10V7a4 4 0 0 1 7.5-2" stroke-linecap="round" />
          {/if}
        </svg>
        Lock layout
        <span class="mm-state">{ui.layoutLocked ? "Locked" : "Unlocked"}</span>
      </button>
      <button type="button" class="mm-row" onclick={() => run(onrename)}>
        <svg class="mm-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M4 20h4L20 8l-4-4L4 16z" stroke-linejoin="round" />
        </svg>
        Rename this plan
      </button>

      <h3 class="mm-h">Take it out</h3>
      <div class="mm-export">
        <ExportMenu {store} />
      </div>
      <button type="button" class="mm-row" onclick={() => run(onversions)}>
        <svg class="mm-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7.5V12l3 2" stroke-linecap="round" />
        </svg>
        Version history
      </button>

      <h3 class="mm-h">This device</h3>
      <button type="button" class="mm-row" onclick={() => run(onhelp)}>
        <svg class="mm-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 1.9-2.4 3.4M12 17.3v.2" stroke-linecap="round" />
        </svg>
        Gestures and shortcuts
      </button>
      <button type="button" class="mm-row mm-row--quiet" onclick={() => run(onlock)}>
        <svg class="mm-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="4" y="10" width="16" height="10" rx="1.5" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke-linecap="round" />
        </svg>
        Lock this page
        <span class="mm-state">Forget the passcode here</span>
      </button>

      <p class="mm-privacy">
        Guest data is private: it lives in this browser and in LSP's passcode-protected database.
      </p>
    </div>
  {/snippet}
</MSheet>

<style>
  .mm-h {
    margin: 14px 0 6px;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #8a6a24;
  }
  .mm-h:first-child {
    margin-top: 0;
  }
  .mm-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .mm-row {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    min-height: 54px;
    padding: 10px 12px;
    margin-bottom: 6px;
    border: 1px solid rgba(23, 32, 44, 0.2);
    border-radius: 3px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 15.5px;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .mm-row:active:not(:disabled) {
    background: rgba(255, 189, 89, 0.34);
  }
  .mm-row:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .mm-row--quiet {
    color: #5f6875;
  }
  .mm-ic {
    flex: 0 0 auto;
    width: 21px;
    height: 21px;
    color: #8a6a24;
  }
  .mm-state {
    margin-left: auto;
    font-size: 12.5px;
    color: #78818f;
    text-align: right;
  }
  /* ExportMenu renders its own trigger; give it the same row shape. */
  .mm-export {
    margin-bottom: 6px;
  }
  .mm-export :global(.wrap) {
    display: block;
    width: 100%;
  }
  .mm-export :global(.trigger) {
    width: 100%;
    min-height: 54px;
    font-size: 15.5px;
  }
  .mm-privacy {
    margin: 18px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: #78818f;
  }
</style>
