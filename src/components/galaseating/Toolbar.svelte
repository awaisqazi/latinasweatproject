<!--
  Slim tool header: plan name, save state, sync, undo/redo, room controls,
  auto-seat, export, help. No marketing nav: this is a working surface.
-->
<script>
  import { getContext } from "svelte";
  import ExportMenu from "./ExportMenu.svelte";
  import SyncBadge from "./SyncBadge.svelte";

  let { onautoseat = () => {} } = $props();
  const { store, ui } = getContext("gala-seating");

  let editingName = $state(false);
  let nameDraft = $state("");
  let now = $state(Date.now());
  let addOpen = $state(false);

  /** Focus a field as it appears (an action, not the autofocus attribute). */
  function focusNow(node) {
    node.focus();
    node.select?.();
  }

  // Keep "Saved · just now" honest without a timer per component.
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 15000);
    return () => clearInterval(id);
  });

  const counts = $derived(store.warnings.counts || { error: 0, warn: 0, info: 0 });
  const warningTotal = $derived((counts.error || 0) + (counts.warn || 0) + (counts.info || 0));

  const savedLabel = $derived.by(() => {
    const at = store.savedAt;
    if (!at) return "Not saved yet";
    const secs = Math.max(0, Math.round((now - at.getTime()) / 1000));
    if (secs < 45) return "Saved · just now";
    if (secs < 3600) return `Saved · ${Math.round(secs / 60)} min ago`;
    return `Saved · ${at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  });

  function startRename() {
    nameDraft = store.plan.meta.name;
    editingName = true;
  }

  function commitRename() {
    const next = String(nameDraft ?? "").trim();
    editingName = false;
    if (next && next !== store.plan.meta.name) store.renamePlan(next);
  }

  function addFixture(type) {
    addOpen = false;
    const id = store.addFixture(type);
    store.pushToast({ kind: "ok", message: "Added to the room. Drag it where it belongs." });
    return id;
  }
</script>

<header class="tb">
  <div class="tb-left">
    <span class="tb-mark" aria-hidden="true">LSP</span>
    <div class="tb-title">
      {#if editingName}
        <input
          class="tb-nameinput"
          value={nameDraft}
          oninput={(e) => (nameDraft = e.currentTarget.value)}
          onblur={commitRename}
          onkeydown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") editingName = false;
          }}
          aria-label="Plan name"
          use:focusNow
        />
      {:else}
        <button type="button" class="tb-name gs-serif" onclick={startRename} title="Rename this plan">
          {store.plan.meta.name}
        </button>
      {/if}
      <span class="tb-saved" class:tb-saved--bad={store.saveError}>{savedLabel}</span>
    </div>
  </div>

  <div class="tb-right">
    <SyncBadge {store} />

    <div class="tb-group" role="group" aria-label="History">
      <button type="button" class="gs-btn" disabled={!store.canUndo} onclick={() => store.undo()} title="Undo (Cmd/Ctrl+Z)">
        <svg class="gs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M9 14 4 9l5-5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M4 9h11a5 5 0 0 1 0 10h-3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="tb-lbl">Undo</span>
      </button>
      <button type="button" class="gs-btn" disabled={!store.canRedo} onclick={() => store.redo()} title="Redo (Shift+Cmd/Ctrl+Z)">
        <svg class="gs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="m15 14 5-5-5-5" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M20 9H9a5 5 0 0 0 0 10h3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="tb-lbl">Redo</span>
      </button>
    </div>

    <button
      type="button"
      class="gs-btn"
      class:gs-btn--on={ui.panel === "warnings"}
      onclick={() => (ui.panel = ui.panel === "warnings" ? "none" : "warnings")}
      title="Warnings"
    >
      <span class="tb-sev tb-sev--error" class:tb-sev--off={!counts.error}>{counts.error || 0}</span>
      <span class="tb-sev tb-sev--warn" class:tb-sev--off={!counts.warn}>{counts.warn || 0}</span>
      <span class="tb-lbl">{warningTotal === 1 ? "warning" : "warnings"}</span>
    </button>

    <div class="tb-group" role="group" aria-label="Room">
      <button
        type="button"
        class="gs-btn"
        class:gs-btn--on={ui.layoutLocked}
        onclick={() => (ui.layoutLocked = !ui.layoutLocked)}
        title={ui.layoutLocked ? "Layout locked, tables cannot be dragged" : "Layout unlocked, tables can be dragged"}
      >
        <svg class="gs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <rect x="4" y="10" width="16" height="10" rx="1.5" />
          {#if ui.layoutLocked}
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke-linecap="round" />
          {:else}
            <path d="M8 10V7a4 4 0 0 1 7.5-2" stroke-linecap="round" />
          {/if}
        </svg>
        <span class="tb-lbl">{ui.layoutLocked ? "Locked" : "Unlocked"}</span>
      </button>

      <button
        type="button"
        class="gs-btn"
        onclick={() => {
          const id = store.addTable();
          const t = store.plan.tables.find((x) => x.id === id);
          if (t) ui.centerOn(t.x, t.y);
        }}
        title="Add a table to the room"
      >
        <svg class="gs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8.5v7M8.5 12h7" stroke-linecap="round" />
        </svg>
        <span class="tb-lbl">Add table</span>
      </button>

      <div class="tb-menu">
        <button type="button" class="gs-btn" onclick={() => (addOpen = !addOpen)} aria-expanded={addOpen} title="Add to room">
          <svg class="gs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke-linecap="round" />
          </svg>
          <span class="tb-lbl">Add</span>
        </button>
        {#if addOpen}
          <div class="tb-dropdown" role="menu">
            <button type="button" role="menuitem" onclick={() => addFixture("bar")}>Bar</button>
            <button type="button" role="menuitem" onclick={() => addFixture("dj")}>DJ</button>
            <button type="button" role="menuitem" onclick={() => addFixture("entrance")}>Entrance</button>
            <button type="button" role="menuitem" onclick={() => addFixture("label")}>Text label</button>
            <hr />
            <button type="button" role="menuitem" onclick={() => { addOpen = false; store.renumberByPosition(); }}>
              Renumber tables by position
            </button>
            <button type="button" role="menuitem" onclick={() => { addOpen = false; store.resetLayout(); }}>
              Reset layout
            </button>
          </div>
        {/if}
      </div>
    </div>

    <button type="button" class="gs-btn gs-btn--gold" onclick={onautoseat} title="Auto-seat">
      <svg class="gs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="m12 3 1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" stroke-linejoin="round" />
        <path d="M18 17.5 19 20l2.5 1-2.5 1-1 2.5" stroke-linejoin="round" opacity="0.5" />
      </svg>
      <span class="tb-lbl">Auto-seat</span>
    </button>

    <ExportMenu {store} />

    <button
      type="button"
      class="gs-btn"
      class:gs-btn--on={ui.panel === "help"}
      onclick={() => (ui.panel = ui.panel === "help" ? "none" : "help")}
      aria-label="Gestures and shortcuts"
      title="Gestures and shortcuts"
    >
      ?
    </button>
  </div>
</header>

<svelte:window onclick={(e) => { if (addOpen && !e.target.closest?.(".tb-menu")) addOpen = false; }} />

<style>
  .tb {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(228, 201, 138, 0.2);
    background: linear-gradient(180deg, rgba(17, 26, 39, 0.96), rgba(11, 19, 32, 0.96));
    position: relative;
    z-index: 30;
  }
  .tb-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .tb-mark {
    font-family: "Playfair Display", Georgia, serif;
    font-size: 13px;
    letter-spacing: 0.2em;
    color: var(--gs-gold-bright);
    border: 1px solid rgba(255, 189, 89, 0.4);
    padding: 4px 7px;
    flex: 0 0 auto;
  }
  .tb-title {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .tb-name {
    background: none;
    border: none;
    padding: 0;
    color: var(--gs-cream);
    font-size: 16px;
    text-align: left;
    cursor: text;
    max-width: 44vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-height: 0;
  }
  .tb-nameinput {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--gs-line-strong);
    color: var(--gs-cream);
    font: inherit;
    font-size: 15px;
    padding: 2px 6px;
    border-radius: 2px;
    max-width: 44vw;
  }
  .tb-saved {
    font-size: 11px;
    color: #8f9bab;
  }
  .tb-saved--bad {
    color: #ffb4a6;
  }
  .tb-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .tb-group {
    display: flex;
    gap: 4px;
  }
  .tb-sev {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    padding: 0 4px;
    border-radius: 2px;
  }
  .tb-sev--error {
    color: #ffd0c8;
    background: rgba(224, 106, 90, 0.3);
  }
  .tb-sev--warn {
    color: #ffe4b5;
    background: rgba(226, 163, 60, 0.28);
  }
  .tb-sev--off {
    color: #8794a5;
    background: rgba(135, 148, 165, 0.16);
  }
  .tb-menu {
    position: relative;
  }
  .tb-dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    min-width: 180px;
    background: var(--gs-cream);
    color: var(--gs-ink);
    border: 1px solid rgba(23, 32, 44, 0.2);
    box-shadow: 0 24px 60px -28px rgba(0, 0, 0, 0.8);
    padding: 5px;
    z-index: 60;
  }
  .tb-dropdown button {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 9px 10px;
    font: inherit;
    font-size: 13px;
    color: inherit;
    cursor: pointer;
    border-radius: 2px;
  }
  .tb-dropdown button:hover {
    background: rgba(255, 189, 89, 0.28);
  }
  .tb-dropdown hr {
    border: 0;
    border-top: 1px solid rgba(23, 32, 44, 0.16);
    margin: 4px 2px;
  }
  @media (max-width: 1100px) {
    .tb-lbl {
      display: none;
    }
  }
  @media (max-width: 1023px) {
    .tb {
      padding: 5px 8px;
      gap: 6px;
      flex-wrap: nowrap;
    }
    .tb-mark {
      display: none;
    }
    .tb-name {
      font-size: 13.5px;
      max-width: 34vw;
    }
    .tb-saved {
      font-size: 10px;
    }
    .tb-right {
      flex-wrap: nowrap;
      gap: 5px;
      overflow-x: auto;
      scrollbar-width: none;
      padding-bottom: 1px;
    }
    .tb-right::-webkit-scrollbar {
      display: none;
    }
    /* Keep the row to one line: compact hit targets, no wrapping. */
    .tb-right :global(.gs-btn) {
      min-height: 40px;
      padding: 0 9px;
      flex: 0 0 auto;
    }
    /* The export menu renders its own trigger; keep it on one line here. */
    .tb-right :global(button) {
      white-space: nowrap;
      flex: 0 0 auto;
    }
  }
</style>
