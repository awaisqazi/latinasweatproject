<!--
  One table, as a list of chairs.

  This is the phone's answer to a ring of ten seats drawn 12 pixels wide: every
  chair, occupied or not, is a full-width row you can read and hit. An empty
  chair is not a gap, it is an invitation, "Seat someone here", and it opens a
  picker that puts the chosen guest in that exact chair.

  Opened from the map it is a bottom sheet, so the room stays behind it.
  Opened from the Tables tab it takes the whole screen, because there is no
  room behind it worth keeping.
-->
<script>
  import { getContext } from "svelte";
  import { MEALS, ticketTypeById, tableLabel } from "../../lib/galaSeating/model.js";
  import { seatRows, tableMeals } from "../../lib/galaSeating/seatHelpers.js";
  import MSheet from "./MSheet.svelte";
  import MFull from "./MFull.svelte";

  let { tableId, nav, variant = "sheet", onmeasure = () => {} } = $props();
  const { store, ui } = getContext("gala-seating");

  let renaming = $state(false);
  let nameDraft = $state("");
  let confirmClear = $state(false);

  const plan = $derived(store.plan);
  const table = $derived(plan.tables.find((t) => t.id === tableId) || null);
  const rows = $derived(table ? seatRows(plan, tableId) : []);
  const filled = $derived(rows.filter((r) => r.guest).length);
  const free = $derived(table ? table.seats - filled : 0);
  const warnings = $derived(store.warnings.byTable?.[tableId] || []);
  const meals = $derived(table ? tableMeals(plan, tableId) : {});

  const mealVar = {
    "short-rib": "var(--gs-meal-short-rib)",
    whitefish: "var(--gs-meal-whitefish)",
    ravioli: "var(--gs-meal-ravioli)",
  };

  const title = $derived(table ? `${tableLabel(table)} · ${filled}/${table.seats}` : "Table");

  function startRename() {
    nameDraft = table?.name || "";
    renaming = true;
  }

  function commitRename() {
    if (!table) return;
    store.updateTable(table.id, { name: String(nameDraft ?? "").trim() });
    renaming = false;
  }

  function clearTable() {
    if (!table) return;
    const n = filled;
    store.clearTable(table.id);
    confirmClear = false;
    store.pushToast({
      kind: "ok",
      message: `${n} ${n === 1 ? "guest is" : "guests are"} back in the unseated list.`,
      action: { label: "Undo", run: () => store.undo() },
    });
  }

  function warnFor(guest) {
    const list = store.warnings.byGuest?.[guest.id] || [];
    if (list.some((w) => w.severity === "error")) return "error";
    return list.length ? "warn" : "";
  }
</script>

{#snippet body()}
  <div class="mtr">
    {#if warnings.length}
      <div class="mtr-warns">
        {#each warnings as w (w.key)}
          <div class="mtr-warn" data-sev={w.severity}>
            <p>{w.message}</p>
            <button type="button" class="gs-linkbtn" onclick={() => store.dismissWarning(w.key)}>Dismiss</button>
          </div>
        {/each}
      </div>
    {/if}

    {#if renaming}
      <div class="mtr-rename">
        <label class="mtr-lbl" for="mtr-name">Table name, optional</label>
        <input
          id="mtr-name"
          class="mtr-input"
          value={nameDraft}
          placeholder="Sponsor or host name"
          oninput={(e) => (nameDraft = e.currentTarget.value)}
          onkeydown={(e) => {
            if (e.key === "Enter") commitRename();
          }}
        />
        <div class="mtr-renamebtns">
          <button type="button" class="mtr-act mtr-act--gold" onclick={commitRename}>Save name</button>
          <button type="button" class="mtr-act" onclick={() => (renaming = false)}>Cancel</button>
        </div>
      </div>
    {/if}

    <ol class="mtr-seats">
      {#each rows as row (row.seat)}
        <li>
          {#if row.guest}
            <button type="button" class="mtr-row" onclick={() => ui.openGuest(row.guest.id)}>
              <span class="mtr-no">{row.seat + 1}</span>
              <span class="mtr-main">
                <span class="mtr-name">{row.guest.name}</span>
                <span class="mtr-sub">{row.guest.partyLabel}</span>
              </span>
              <span class="mtr-meta">
                {#if row.guest.hasDinner}
                  <span
                    class="gs-dot"
                    style={`background:${mealVar[row.guest.meal] || "var(--gs-meal-none)"}`}
                    title={MEALS.find((m) => m.id === row.guest.meal)?.label || "No entrée"}
                  ></span>
                {/if}
                <span class="mtr-pill">{ticketTypeById(row.guest.ticketType).short}</span>
                {#if warnFor(row.guest)}
                  <svg
                    class="mtr-ic mtr-ic--{warnFor(row.guest)}"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-label="Has a warning"
                  >
                    <path d="M12 4 2.5 20h19z" stroke-linejoin="round" />
                    <path d="M12 10v4M12 17.2v.2" stroke-linecap="round" />
                  </svg>
                {/if}
              </span>
            </button>
          {:else}
            <button
              type="button"
              class="mtr-row mtr-row--empty"
              onclick={() => nav.openLayer({ type: "seatPicker", tableId, seat: row.seat })}
            >
              <span class="mtr-no">{row.seat + 1}</span>
              <span class="mtr-main">
                <span class="mtr-empty">Seat someone here</span>
              </span>
              <span class="mtr-plus" aria-hidden="true">+</span>
            </button>
          {/if}
        </li>
      {/each}
    </ol>

    <div class="mtr-meals">
      {#each MEALS as m (m.id)}
        <span class="mtr-meal">
          <span class="gs-dot" style={`background:${mealVar[m.id]}`}></span>
          {m.short}<strong>{meals[m.id] || 0}</strong>
        </span>
      {/each}
      {#if meals.none}
        <span class="mtr-meal">
          <span class="gs-dot" style="background:var(--gs-meal-none)"></span>
          No entrée<strong>{meals.none}</strong>
        </span>
      {/if}
    </div>

    <div class="mtr-acts">
      <button type="button" class="mtr-act" onclick={startRename}>Rename</button>
      <button
        type="button"
        class="mtr-act"
        class:mtr-act--on={table?.locked}
        aria-pressed={Boolean(table?.locked)}
        onclick={() => store.updateTable(tableId, { locked: !table.locked })}
      >
        {table?.locked ? "Locked" : "Lock"}
      </button>
      <button
        type="button"
        class="mtr-act"
        disabled={free === 0}
        onclick={() => nav.openLayer({ type: "partyPicker", tableId })}
      >
        Seat a party here
      </button>
      {#if filled}
        {#if confirmClear}
          <button type="button" class="mtr-act mtr-act--danger" onclick={clearTable}>Yes, clear {filled}</button>
          <button type="button" class="mtr-act" onclick={() => (confirmClear = false)}>Keep</button>
        {:else}
          <button type="button" class="mtr-act mtr-act--danger" onclick={() => (confirmClear = true)}>
            Clear table
          </button>
        {/if}
      {/if}
    </div>
  </div>
{/snippet}

{#if table}
  {#if variant === "full"}
    <MFull eyebrow="Table" {title} onclose={() => nav.closeTop()}>
      {#snippet children()}{@render body()}{/snippet}
    </MFull>
  {:else}
    <MSheet eyebrow="Table" {title} snaps={[0.58, 0.94]} {onmeasure} onclose={() => nav.closeTop()}>
      {#snippet children()}{@render body()}{/snippet}
    </MSheet>
  {/if}
{/if}

<style>
  .mtr-warns {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }
  .mtr-warn {
    display: flex;
    gap: 8px;
    justify-content: space-between;
    align-items: flex-start;
    padding: 9px 10px;
    border-left: 3px solid var(--gs-warn);
    background: rgba(226, 163, 60, 0.13);
  }
  .mtr-warn[data-sev="error"] {
    border-left-color: var(--gs-error);
    background: rgba(224, 106, 90, 0.12);
  }
  .mtr-warn p {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
  }
  .mtr-warn :global(.gs-linkbtn) {
    color: #8a5700;
    flex: 0 0 auto;
    font-size: 13px;
  }

  .mtr-rename {
    margin-bottom: 14px;
    padding: 10px;
    border: 1px solid rgba(185, 132, 47, 0.45);
    background: rgba(255, 189, 89, 0.14);
  }
  .mtr-lbl {
    display: block;
    font-size: 12px;
    color: #5f6875;
    margin-bottom: 5px;
  }
  .mtr-input {
    width: 100%;
    min-height: 46px;
    padding: 10px;
    border: 1px solid rgba(23, 32, 44, 0.28);
    border-radius: 3px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 16px;
  }
  .mtr-renamebtns {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .mtr-seats {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .mtr-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 58px;
    padding: 8px 6px;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(23, 32, 44, 0.1);
    color: var(--gs-ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .mtr-row:active {
    background: rgba(255, 189, 89, 0.3);
  }
  .mtr-no {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    line-height: 26px;
    text-align: center;
    border-radius: 50%;
    background: rgba(23, 32, 44, 0.08);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
    color: #5f6875;
  }
  .mtr-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .mtr-name {
    font-size: 15.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mtr-sub {
    font-size: 12px;
    color: #78818f;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mtr-empty {
    font-size: 15px;
    font-style: italic;
    color: #8a6a24;
  }
  .mtr-row--empty {
    border-bottom-style: dashed;
  }
  .mtr-plus {
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    line-height: 30px;
    text-align: center;
    border: 1px dashed rgba(185, 132, 47, 0.7);
    border-radius: 3px;
    color: #8a6a24;
    font-size: 19px;
  }
  .mtr-meta {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .mtr-pill {
    font-size: 10px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    border: 1px solid rgba(23, 32, 44, 0.28);
    border-radius: 2px;
    padding: 2px 5px;
    white-space: nowrap;
  }
  .mtr-ic {
    width: 16px;
    height: 16px;
    color: var(--gs-warn);
  }
  .mtr-ic--error {
    color: #b0493b;
  }

  .mtr-meals {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid rgba(23, 32, 44, 0.12);
    font-size: 13px;
    color: #5f6875;
  }
  .mtr-meal {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .mtr-meal strong {
    margin-left: 3px;
    font-variant-numeric: tabular-nums;
    color: var(--gs-ink);
  }

  .mtr-acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
  .mtr-act {
    flex: 1 1 auto;
    min-width: 40%;
    min-height: 48px;
    padding: 0 12px;
    border: 1px solid rgba(23, 32, 44, 0.28);
    border-radius: 3px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 14.5px;
    cursor: pointer;
  }
  .mtr-act:active {
    background: rgba(255, 189, 89, 0.34);
  }
  .mtr-act:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .mtr-act--gold {
    background: var(--gs-gold-bright);
    border-color: var(--gs-gold);
    font-weight: 700;
  }
  .mtr-act--on {
    background: rgba(255, 189, 89, 0.4);
    border-color: var(--gs-gold);
    font-weight: 700;
  }
  .mtr-act--danger {
    border-color: rgba(176, 73, 59, 0.6);
    color: #8c2f22;
  }
</style>
