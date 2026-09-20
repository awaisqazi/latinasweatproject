<!--
  Gala Seating planner: "Export & print". Owned by the import/export agent.

  SELF CONTAINED ON PURPOSE. Drop <ExportMenu {store} /> into the toolbar and you are
  done: this component renders its own trigger button, its own menu, and it also
  renders <PrintView> and <ImportDialog> inside itself. Both of those portal their own
  root element to <body>, so no parent overflow or stacking context can trap them and
  the UI agent needs no extra wiring, no extra props and no print-mode plumbing.

  Print flow: pick a layout, PrintView renders it, we wait two frames for layout, call
  window.print(), then clear the mode on "afterprint" (with a timer as a safety net).

  PRIVACY: downloads are made from the in-memory plan by the browser itself. Nothing is
  sent anywhere. The plan JSON carries guest names, emails and entrées, so the menu says
  so where the planner can see it.
-->
<script>
  import { getContext, tick } from "svelte";
  import PrintView from "./PrintView.svelte";
  import ImportDialog from "./ImportDialog.svelte";
  import { copyText, downloadText, stampName } from "../../lib/galaSeating/xlsxIO.js";
  import { seatingCsv, serializePlan } from "../../lib/galaSeating/exporters.js";
  import { guestsAtTable, mealById, tableLabel } from "../../lib/galaSeating/model.js";

  // The store may be passed in, or picked up from the app's "gala-seating"
  // context, so this works both as <ExportMenu {store} /> and bare in a toolbar.
  let { store: storeProp = null } = $props();
  let ctxStore = null;
  try {
    ctxStore = (getContext("gala-seating") || {}).store || null;
  } catch {
    ctxStore = null;
  }
  const store = $derived(storeProp || ctxStore);

  const EVENT_LINE = "Annual Gala · Museum of Contemporary Art Chicago · September 25, 2026";
  const PRINT_MODES = [
    { id: "floor", label: "Floor plan", hint: "One landscape page" },
    { id: "tables", label: "Table cards", hint: "Two per page, for the tables" },
    { id: "alpha", label: "Alphabetical guest list", hint: "Check-in desk" },
    { id: "kitchen", label: "Kitchen and caterer counts", hint: "Entrées by table" },
  ];

  let menuOpen = $state(false);
  let printMode = $state(null);
  let importOpen = $state(false);
  let status = $state("");
  let versionLabel = $state("");
  let backups = $state([]);
  let confirmRestoreId = $state("");
  let trigger = $state(null);

  const plan = $derived(store && store.plan ? store.plan : null);

  function flash(message) {
    status = message;
    setTimeout(() => {
      if (status === message) status = "";
    }, 4000);
  }

  function refreshBackups() {
    if (!store || typeof store.listBackups !== "function") {
      backups = [];
      return;
    }
    try {
      backups = store.listBackups() || [];
    } catch {
      backups = [];
    }
  }

  function toggleMenu() {
    menuOpen = !menuOpen;
    if (menuOpen) {
      status = "";
      confirmRestoreId = "";
      refreshBackups();
    }
  }

  function closeMenu() {
    menuOpen = false;
    confirmRestoreId = "";
  }

  function onKeydown(event) {
    if (event.key === "Escape" && menuOpen) {
      event.stopPropagation();
      closeMenu();
      if (trigger) trigger.focus();
    }
  }

  /* ---------------------------------------------------------------- downloads */

  function planName() {
    return (plan && plan.meta && plan.meta.name) || "Gala seating";
  }

  function downloadPlan() {
    if (!plan) return flash("There is no plan to share yet.");
    try {
      const text = serializePlan(plan);
      downloadText(stampName("lsp-gala-seating", "json"), text, "application/json");
      flash("Plan file downloaded. It holds guest details, so keep it inside the planning team.");
    } catch (err) {
      flash(`The plan could not be written: ${String(err && err.message ? err.message : err)}`);
    }
  }

  function downloadCsv() {
    if (!plan) return flash("There is no plan to export yet.");
    try {
      const text = seatingCsv(plan);
      if (!text) return flash("The seating chart is empty, so there is nothing to export.");
      downloadText(stampName("lsp-gala-seating-chart", "csv"), text, "text/csv;charset=utf-8");
      flash("Seating chart CSV downloaded.");
    } catch (err) {
      flash(`The CSV could not be written: ${String(err && err.message ? err.message : err)}`);
    }
  }

  /* ------------------------------------------------------------------- print */

  async function startPrint(mode) {
    if (!plan) return flash("There is no plan to print yet.");
    closeMenu();
    printMode = mode;
    await tick();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      window.print();
    } catch {
      /* the browser refused the dialog, nothing to clean up beyond the mode */
    }
    setTimeout(() => {
      if (printMode === mode) printMode = null;
    }, 1500);
  }

  $effect(() => {
    if (typeof window === "undefined") return;
    const done = () => {
      printMode = null;
    };
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  });

  /* ------------------------------------------------------------------- copy */

  function summaryText() {
    if (!plan) return "";
    const lines = [planName(), EVENT_LINE];
    const guestCount = Object.keys(plan.guests || {}).length;
    const seated = Object.keys(plan.seating || {}).length;
    lines.push(`${guestCount} guests · ${seated} seated`, "");
    const tables = [...(plan.tables || [])].sort((a, b) => a.number - b.number);
    for (const table of tables) {
      const people = guestsAtTable(plan, table.id);
      lines.push(tableLabel(table));
      if (!people.length) {
        lines.push("  (empty)");
      } else {
        for (const guest of people) {
          const spot = plan.seating[guest.id];
          const meal = mealById(guest.meal);
          lines.push(`  ${spot ? spot.seat + 1 : "?"}. ${guest.name}${meal ? ` · ${meal.short}` : ""}`);
        }
        const free = table.seats - people.length;
        if (free > 0) lines.push(`  ${free} seat${free === 1 ? "" : "s"} free`);
      }
      lines.push("");
    }
    const unseated = Object.values(plan.guests || {}).filter((g) => !plan.seating[g.id]);
    if (unseated.length) {
      lines.push(`Not seated yet (${unseated.length})`);
      for (const guest of unseated) lines.push(`  ${guest.name}`);
    }
    return lines.join("\n");
  }

  async function copySummary() {
    if (!plan) return flash("There is no plan to copy yet.");
    const ok = await copyText(summaryText());
    flash(ok ? "Table-by-table summary copied. Paste it into a message." : "The browser blocked the clipboard. Print the table cards instead.");
  }

  /* ---------------------------------------------------------------- versions */

  async function saveVersion() {
    if (!store || typeof store.saveVersion !== "function") return flash("Versions are not available yet.");
    const label =
      versionLabel.trim() ||
      `Saved ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
    try {
      await store.saveVersion(label);
      versionLabel = "";
      refreshBackups();
      flash(`Saved "${label}".`);
    } catch (err) {
      flash(`The version could not be saved: ${String(err && err.message ? err.message : err)}`);
    }
  }

  function restore(id) {
    if (!store || typeof store.restoreBackup !== "function") return flash("Restore is not available yet.");
    try {
      store.restoreBackup(id);
      confirmRestoreId = "";
      refreshBackups();
      flash("Restored. The shared plan now matches that version.");
    } catch (err) {
      flash(`That version could not be restored: ${String(err && err.message ? err.message : err)}`);
    }
  }

  function backupTime(at) {
    if (!at) return "";
    const date = new Date(at);
    if (Number.isNaN(date.getTime())) return String(at);
    return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="wrap">
  <button
    type="button"
    class="gala-btn gala-btn--gold trigger"
    bind:this={trigger}
    aria-haspopup="true"
    aria-expanded={menuOpen}
    onclick={toggleMenu}
  >
    Export &amp; print
  </button>

  {#if menuOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="scrim" role="presentation" onclick={closeMenu}></div>
    <div class="menu" role="menu" aria-label="Export and print">
      <section class="group">
        <h3>Share</h3>
        <button type="button" class="item" role="menuitem" onclick={downloadPlan}>
          <span class="item-label">Share this arrangement</span>
          <span class="item-hint">Downloads the plan file. It contains guest details, so share it only with the planning team.</span>
        </button>
        <button type="button" class="item" role="menuitem" onclick={downloadCsv}>
          <span class="item-label">Seating chart CSV</span>
          <span class="item-hint">Table, seat, guest, party, ticket, entrée, tags, notes.</span>
        </button>
        <button type="button" class="item" role="menuitem" onclick={copySummary}>
          <span class="item-label">Copy table-by-table summary</span>
          <span class="item-hint">Plain text, ready to paste into a message.</span>
        </button>
      </section>

      <section class="group">
        <h3>Print</h3>
        {#each PRINT_MODES as mode (mode.id)}
          <button type="button" class="item" role="menuitem" onclick={() => startPrint(mode.id)}>
            <span class="item-label">{mode.label}</span>
            <span class="item-hint">{mode.hint}</span>
          </button>
        {/each}
      </section>

      <section class="group">
        <h3>Versions · this device</h3>
        <div class="version-form">
          <input
            type="text"
            placeholder="Name this version"
            bind:value={versionLabel}
            onkeydown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveVersion();
              }
            }}
          />
          <button type="button" class="gala-btn gala-btn--ghost small" onclick={saveVersion}>Save</button>
        </div>
        {#if backups.length}
          <ul class="backups">
            {#each backups as backup (backup.id)}
              <li>
                <div class="backup-body">
                  <span class="backup-label">{backup.label || "Automatic backup"}</span>
                  <span class="backup-meta">
                    {backupTime(backup.at)} · {backup.guestCount ?? 0} guests · {backup.seatedCount ?? 0} seated
                  </span>
                </div>
                {#if confirmRestoreId === backup.id}
                  <div class="backup-actions">
                    <button type="button" class="gala-btn gala-btn--ghost small" onclick={() => (confirmRestoreId = "")}>Cancel</button>
                    <button type="button" class="gala-btn gala-btn--gold small" onclick={() => restore(backup.id)}>Yes, restore</button>
                  </div>
                {:else}
                  <button type="button" class="gala-btn gala-btn--ghost small" onclick={() => (confirmRestoreId = backup.id)}>Restore</button>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="hint">No versions saved on this device yet.</p>
        {/if}
        <p class="hint">Shared version history is under the sync badge.</p>
      </section>

      <section class="group admin">
        <h3>Admin</h3>
        <button
          type="button"
          class="item"
          role="menuitem"
          onclick={() => {
            closeMenu();
            importOpen = true;
          }}
        >
          <span class="item-label">Update guest data from spreadsheets</span>
          <span class="item-hint">Refresh entrées and add guests. Seats already assigned are kept.</span>
        </button>
      </section>

      {#if status}
        <p class="status" role="status">{status}</p>
      {/if}
    </div>
  {/if}
</div>

{#if status && !menuOpen}
  <p class="floating-status" role="status">{status}</p>
{/if}

<!-- Both of these portal themselves to <body>. -->
<PrintView {store} mode={printMode} />
<ImportDialog {store} open={importOpen} onclose={() => (importOpen = false)} />

<style>
  .wrap {
    position: relative;
    display: inline-block;
    font-family: var(--font-body, "Rubik", sans-serif);
  }

  .trigger {
    min-height: 44px;
    padding: 0 1.15rem;
    font-size: 0.86rem;
    font-weight: 600;
    cursor: pointer;
  }

  .scrim {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: transparent;
  }

  .menu {
    position: absolute;
    z-index: 61;
    top: calc(100% + 0.5rem);
    right: 0;
    width: min(22rem, calc(100vw - 2rem));
    max-height: min(70vh, 36rem);
    overflow-y: auto;
    background: #0b1320;
    color: #fff8ef;
    border: 1px solid rgba(228, 201, 138, 0.42);
    box-shadow: 0 30px 70px -28px rgba(0, 0, 0, 0.85);
    text-align: left;
  }

  .group {
    padding: 0.7rem 0.55rem 0.8rem;
    border-bottom: 1px solid rgba(185, 132, 47, 0.28);
  }
  .group:last-of-type {
    border-bottom: none;
  }
  .group.admin {
    background: rgba(17, 26, 39, 0.9);
  }
  h3 {
    margin: 0 0 0.45rem;
    padding: 0 0.45rem;
    font-size: 0.66rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #e4c98a;
    font-weight: 600;
  }

  .item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    width: 100%;
    min-height: 44px;
    padding: 0.5rem 0.45rem;
    text-align: left;
    background: transparent;
    border: none;
    color: inherit;
    cursor: pointer;
  }
  .item:hover,
  .item:focus-visible {
    background: rgba(185, 132, 47, 0.16);
    outline: none;
  }
  .item-label {
    font-size: 0.88rem;
    font-weight: 600;
  }
  .item-hint {
    font-size: 0.74rem;
    color: rgba(255, 248, 239, 0.62);
    line-height: 1.3;
  }

  .version-form {
    display: flex;
    gap: 0.4rem;
    padding: 0 0.45rem;
  }
  .version-form input {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
    padding: 0 0.55rem;
    background: #111a27;
    color: #fff8ef;
    border: 1px solid rgba(228, 201, 138, 0.3);
    font-size: 0.82rem;
  }
  .small {
    min-height: 44px;
    padding: 0 0.8rem;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .backups {
    list-style: none;
    margin: 0.55rem 0 0;
    padding: 0 0.45rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .backups li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    padding: 0.45rem 0.5rem;
    border: 1px solid rgba(228, 201, 138, 0.2);
    background: rgba(17, 26, 39, 0.8);
  }
  .backup-body {
    display: flex;
    flex-direction: column;
    min-width: 9rem;
    flex: 1 1 auto;
  }
  .backup-label {
    font-size: 0.82rem;
    font-weight: 600;
  }
  .backup-meta {
    font-size: 0.72rem;
    color: rgba(255, 248, 239, 0.6);
  }
  .backup-actions {
    display: flex;
    gap: 0.35rem;
  }

  .hint {
    margin: 0.5rem 0 0;
    padding: 0 0.45rem;
    font-size: 0.74rem;
    color: rgba(255, 248, 239, 0.58);
  }

  .status {
    margin: 0;
    padding: 0.6rem 0.9rem;
    border-top: 1px solid rgba(185, 132, 47, 0.35);
    background: rgba(185, 132, 47, 0.14);
    font-size: 0.78rem;
    color: #ffe9c4;
  }

  .floating-status {
    position: fixed;
    z-index: 62;
    left: 50%;
    bottom: 1.25rem;
    transform: translateX(-50%);
    margin: 0;
    max-width: min(30rem, calc(100vw - 2rem));
    padding: 0.6rem 0.9rem;
    background: #111a27;
    color: #ffe9c4;
    border: 1px solid rgba(228, 201, 138, 0.42);
    font-size: 0.78rem;
    font-family: var(--font-body, "Rubik", sans-serif);
  }

  @media (max-width: 640px) {
    .menu {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      top: auto;
      width: 100vw;
      max-height: 82vh;
      border-left: none;
      border-right: none;
      border-bottom: none;
    }
    .scrim {
      background: rgba(4, 7, 13, 0.6);
    }
  }

  /* Phone: the menu is a sheet at the bottom of the app shell, not a dropdown
     hanging off the corner of a 360px screen. `.wrap` goes static so the menu
     anchors to the shell. */
  @media (max-width: 1023px), (pointer: coarse) and (max-height: 599px) {
    .wrap {
      display: block;
      position: static;
      width: 100%;
    }
    .trigger {
      width: 100%;
    }
    .scrim {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: calc(56px + env(safe-area-inset-bottom));
      z-index: 83;
      background: rgba(4, 8, 14, 0.58);
    }
    .menu {
      position: absolute;
      z-index: 84;
      top: auto;
      left: 0;
      right: 0;
      bottom: calc(56px + env(safe-area-inset-bottom));
      width: auto;
      max-height: calc(100% - 56px - env(safe-area-inset-bottom) - 8px);
      border-radius: 6px 6px 0 0;
      border-top: 3px solid #b9842f;
      padding-bottom: env(safe-area-inset-bottom);
      overscroll-behavior: contain;
    }
    .item {
      min-height: 54px;
      padding: 0.7rem 0.6rem;
    }
    .item-label {
      font-size: 0.95rem;
    }
    .item-hint {
      font-size: 0.8rem;
    }
    /* 16px or iOS Safari zooms the page on focus. See GalaSeatingApp. */
    .version-form input {
      font-size: 16px;
      min-height: 46px;
    }
    .version-form {
      flex-wrap: wrap;
    }
    .floating-status {
      position: absolute;
      bottom: calc(56px + env(safe-area-inset-bottom) + 10px);
      max-width: calc(100% - 2rem);
      font-size: 0.85rem;
    }
  }
</style>
