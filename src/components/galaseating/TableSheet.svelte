<!-- One table: name, note, lock, its seats in order, meal counts, bulk actions. -->
<script>
  import { getContext } from "svelte";
  import { MEALS, guestsAtTable, tableLabel } from "../../lib/galaSeating/model.js";
  import Sheet from "./Sheet.svelte";

  const { store, ui } = getContext("gala-seating");

  const plan = $derived(store.plan);
  const table = $derived(ui.openTableId ? plan.tables.find((t) => t.id === ui.openTableId) || null : null);
  const seated = $derived(table ? guestsAtTable(plan, table.id) : []);
  const warnings = $derived(table ? store.warnings.byTable?.[table.id] || [] : []);
  const free = $derived(table ? table.seats - seated.length : 0);

  let partyPickerOpen = $state(false);
  let partyQuery = $state("");
  let confirmClear = $state(false);
  let confirmRemove = $state(false);
  let renumberOpen = $state(false);
  let seatsDraft = $state(10);
  let confirmShrink = $state(/** @type {{to:number, lose:number}|null} */ (null));

  $effect(() => {
    void ui.openTableId;
    partyPickerOpen = false;
    partyQuery = "";
    confirmClear = false;
    confirmRemove = false;
    renumberOpen = false;
    confirmShrink = null;
    seatsDraft = table?.seats ?? 10;
  });

  /** Seat counts run 6 to 12; shrinking past the people there asks first. */
  function trySeats(next) {
    const value = Math.max(6, Math.min(12, Number(next) || 0));
    seatsDraft = value;
    if (value >= seated.length) {
      confirmShrink = null;
      store.setTableSeats(table.id, value);
      return;
    }
    confirmShrink = { to: value, lose: seated.length - value };
  }

  function applyShrink() {
    const to = confirmShrink?.to;
    confirmShrink = null;
    if (to == null) return;
    const res = store.setTableSeats(table.id, to);
    if (res?.unseated?.length) {
      store.pushToast({
        kind: "warn",
        message: `${res.unseated.length} ${res.unseated.length === 1 ? "guest is" : "guests are"} back in the unseated list.`,
        action: { label: "Undo", run: () => store.undo() },
      });
    }
  }

  const mealTotals = $derived.by(() => {
    const out = {};
    for (const g of seated) {
      if (!g.hasDinner) continue;
      const key = g.meal || "none";
      out[key] = (out[key] || 0) + 1;
    }
    return out;
  });

  const parties = $derived.by(() => {
    const q = partyQuery.trim().toLowerCase();
    const map = new Map();
    for (const g of Object.values(plan.guests)) {
      if (plan.seating[g.id]) continue;
      if (!map.has(g.partyId)) map.set(g.partyId, { partyId: g.partyId, label: g.partyLabel, count: 0 });
      map.get(g.partyId).count += 1;
    }
    return [...map.values()]
      .filter((p) => !q || p.label.toLowerCase().includes(q))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  });

  function mealColor(id) {
    return (
      {
        "short-rib": "var(--gs-meal-short-rib)",
        whitefish: "var(--gs-meal-whitefish)",
        ravioli: "var(--gs-meal-ravioli)",
      }[id] || "var(--gs-meal-none)"
    );
  }

  /** Move a guest up or down the seat order at this table. */
  function reorder(index, delta) {
    const order = seated.map((g) => g.id);
    const next = index + delta;
    if (next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];
    store.setSeatOrder(table.id, order);
  }

  function seatWholeParty(partyId) {
    partyPickerOpen = false;
    const res = store.seatParty(partyId, table.id);
    if (res?.missed?.length) {
      store.pushToast({ kind: "warn", message: `${res.missed.length} of that party did not fit here.` });
    }
  }
</script>

{#if table}
  <Sheet eyebrow="Table" title={tableLabel(table)} onclose={() => ui.closeSheets()}>
    {#snippet children()}
      <div class="ts">
        <p class="ts-count">
          <strong>{seated.length}</strong> of {table.seats} seated · {free} free
        </p>

        {#if warnings.length}
          <div class="ts-warns">
            {#each warnings as w (w.key)}
              <div class="ts-warn" data-sev={w.severity}>
                <p>{w.message}</p>
                <button type="button" class="gs-linkbtn" onclick={() => store.dismissWarning(w.key)}>Dismiss</button>
              </div>
            {/each}
          </div>
        {/if}

        <label class="ts-field">
          <span>Table name, optional</span>
          <input
            class="gs-input"
            value={table.name}
            placeholder="Sponsor or host name"
            oninput={(e) => store.updateTable(table.id, { name: e.currentTarget.value })}
          />
        </label>

        <label class="ts-field">
          <span>Note</span>
          <textarea
            class="gs-input"
            rows="2"
            value={table.note}
            oninput={(e) => store.updateTable(table.id, { note: e.currentTarget.value })}
          ></textarea>
        </label>

        <div class="ts-two">
          <label class="ts-field">
            <span>Seats</span>
            <select class="gs-input" value={String(table.seats)} onchange={(e) => trySeats(e.currentTarget.value)}>
              {#each [6, 7, 8, 9, 10, 11, 12] as n (n)}
                <option value={String(n)}>{n} seats</option>
              {/each}
            </select>
          </label>
          <div class="ts-field">
            <span>Number</span>
            <button type="button" class="gs-btn ts-wide" onclick={() => (renumberOpen = !renumberOpen)}>
              Table {table.number} · swap with…
            </button>
          </div>
        </div>

        {#if confirmShrink}
          <p class="ts-confirm">
            {confirmShrink.lose} {confirmShrink.lose === 1 ? "guest" : "guests"} would lose their seat at this table.
          </p>
          <div class="ts-actions">
            <button type="button" class="gs-btn gs-btn--danger" onclick={applyShrink}>Shrink anyway</button>
            <button type="button" class="gs-btn" onclick={() => { confirmShrink = null; seatsDraft = table.seats; }}>
              Keep {table.seats}
            </button>
          </div>
        {/if}

        {#if renumberOpen}
          <div class="ts-numbers">
            {#each plan.tables.filter((t) => t.id !== table.id) as other (other.id)}
              <button
                type="button"
                class="ts-numbtn"
                onclick={() => {
                  store.swapTableNumbers(table.id, other.id);
                  renumberOpen = false;
                }}
              >
                {other.number}
              </button>
            {/each}
          </div>
          <button type="button" class="gs-linkbtn" onclick={() => { renumberOpen = false; store.renumberByPosition(); }}>
            Renumber every table by position instead
          </button>
        {/if}

        <label class="ts-check">
          <input
            type="checkbox"
            checked={table.locked}
            onchange={(e) => store.updateTable(table.id, { locked: e.currentTarget.checked })}
          />
          Lock this table: it cannot be dragged and auto-seat leaves it alone
        </label>

        <section class="ts-sec">
          <h3>Meals at this table</h3>
          <div class="ts-meals">
            {#each MEALS as m (m.id)}
              <span class="ts-meal">
                <span class="gs-dot" style={`background:${mealColor(m.id)}`}></span>
                {m.short}<strong>{mealTotals[m.id] || 0}</strong>
              </span>
            {/each}
            {#if mealTotals.none}
              <span class="ts-meal">
                <span class="gs-dot" style="background:var(--gs-meal-none)"></span>
                No meal<strong>{mealTotals.none}</strong>
              </span>
            {/if}
          </div>
        </section>

        <section class="ts-sec">
          <h3>Seats in order</h3>
          {#if !seated.length}
            <p class="ts-empty">Nobody here yet. Drag a guest onto the table, or use "Seat a whole party here".</p>
          {:else}
            <ol class="ts-seats">
              {#each seated as guest, i (guest.id)}
                <li>
                  <span class="ts-seatno">{(plan.seating[guest.id]?.seat ?? i) + 1}</span>
                  <button type="button" class="ts-seatname" onclick={() => ui.openGuest(guest.id)}>
                    {guest.name}
                  </button>
                  {#if guest.hasDinner}
                    <span class="gs-dot" style={`background:${mealColor(guest.meal)}`}></span>
                  {/if}
                  <span class="ts-seatbtns">
                    <button type="button" class="ts-mini" onclick={() => reorder(i, -1)} disabled={i === 0} aria-label="Move up">
                      &uarr;
                    </button>
                    <button
                      type="button"
                      class="ts-mini"
                      onclick={() => reorder(i, 1)}
                      disabled={i === seated.length - 1}
                      aria-label="Move down"
                    >
                      &darr;
                    </button>
                    <button type="button" class="ts-mini" onclick={() => store.unseatGuest(guest.id)} aria-label="Remove from table">
                      &times;
                    </button>
                  </span>
                </li>
              {/each}
            </ol>
          {/if}
        </section>

        <section class="ts-sec">
          {#if partyPickerOpen}
            <input
              class="gs-input"
              placeholder="Search a party"
              value={partyQuery}
              oninput={(e) => (partyQuery = e.currentTarget.value)}
            />
            <div class="ts-parties">
              {#each parties as p (p.partyId)}
                <button type="button" class="ts-partybtn" onclick={() => seatWholeParty(p.partyId)}>
                  <span>{p.label}</span>
                  <small>{p.count} unseated{p.count > free ? `, ${free} fit` : ""}</small>
                </button>
              {/each}
              {#if !parties.length}
                <p class="ts-empty">Everyone is seated.</p>
              {/if}
            </div>
            <button type="button" class="gs-linkbtn" onclick={() => (partyPickerOpen = false)}>Cancel</button>
          {:else}
            <div class="ts-actions">
              <button type="button" class="gs-btn" onclick={() => (partyPickerOpen = true)} disabled={free === 0}>
                Seat a whole party here
              </button>
              {#if seated.length}
                {#if confirmClear}
                  <button type="button" class="gs-btn gs-btn--danger" onclick={() => { store.clearTable(table.id); confirmClear = false; }}>
                    Yes, clear {seated.length}
                  </button>
                  <button type="button" class="gs-btn" onclick={() => (confirmClear = false)}>Keep</button>
                {:else}
                  <button type="button" class="gs-btn gs-btn--danger" onclick={() => (confirmClear = true)}>Clear table</button>
                {/if}
              {/if}
              {#if plan.tables.length > 1}
                {#if confirmRemove}
                  <button
                    type="button"
                    class="gs-btn gs-btn--danger"
                    onclick={() => {
                      if (store.removeTable(table.id)) ui.closeSheets();
                    }}
                  >
                    Yes, remove{seated.length ? ` and unseat ${seated.length}` : ""}
                  </button>
                  <button type="button" class="gs-btn" onclick={() => (confirmRemove = false)}>Keep it</button>
                {:else}
                  <button type="button" class="gs-btn gs-btn--danger" onclick={() => (confirmRemove = true)}>
                    Remove this table
                  </button>
                {/if}
              {/if}
            </div>
          {/if}
        </section>
      </div>
    {/snippet}
  </Sheet>
{/if}

<style>
  .ts-count {
    margin: 0 0 12px;
    font-size: 14px;
    color: #5f6875;
  }
  .ts-count strong {
    color: #6b4a12;
    font-size: 17px;
  }
  .ts-warns {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }
  .ts-warn {
    display: flex;
    gap: 8px;
    justify-content: space-between;
    align-items: flex-start;
    padding: 8px 10px;
    border-left: 3px solid var(--gs-warn);
    background: rgba(226, 163, 60, 0.12);
  }
  .ts-warn[data-sev="error"] {
    border-left-color: var(--gs-error);
    background: rgba(224, 106, 90, 0.12);
  }
  .ts-warn p {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
  }
  .ts-warn :global(.gs-linkbtn) {
    color: #8a5700;
    font-size: 12px;
    flex: 0 0 auto;
  }
  .ts-field {
    display: block;
    margin-bottom: 12px;
  }
  .ts-field > span {
    display: block;
    font-size: 11.5px;
    color: #5f6875;
    margin-bottom: 4px;
  }
  .ts-check {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12.5px;
    line-height: 1.45;
    color: #3d4653;
  }
  .ts-sec {
    margin-top: 18px;
  }
  .ts-sec h3 {
    margin: 0 0 8px;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #8a6a24;
  }
  .ts-meals {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 12.5px;
  }
  .ts-meal {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .ts-meal strong {
    margin-left: 2px;
    font-variant-numeric: tabular-nums;
  }
  .ts-seats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ts-seats li {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 4px 2px;
    border-bottom: 1px solid rgba(23, 32, 44, 0.08);
  }
  .ts-seatno {
    flex: 0 0 auto;
    width: 20px;
    font-size: 11px;
    color: #8a939f;
    font-variant-numeric: tabular-nums;
  }
  .ts-seatname {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
    background: none;
    border: none;
    padding: 6px 2px;
    font: inherit;
    font-size: 13px;
    color: var(--gs-ink);
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ts-seatname:hover {
    text-decoration: underline;
  }
  .ts-seatbtns {
    flex: 0 0 auto;
    display: flex;
    gap: 2px;
  }
  .ts-mini {
    width: 30px;
    height: 30px;
    min-height: 30px;
    border: 1px solid rgba(23, 32, 44, 0.18);
    background: #fffdf9;
    border-radius: 2px;
    cursor: pointer;
    font-size: 13px;
    color: var(--gs-ink);
  }
  .ts-mini:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .ts-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .ts-parties {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 8px 0;
  }
  .ts-partybtn {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    padding: 8px 9px;
    min-height: 40px;
    border: 1px solid rgba(23, 32, 44, 0.16);
    border-radius: 2px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
    text-align: left;
  }
  .ts-partybtn:hover {
    background: rgba(255, 189, 89, 0.28);
  }
  .ts-partybtn small {
    color: #78818f;
    font-size: 11px;
    flex: 0 0 auto;
  }
  .ts-two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .ts-wide {
    width: 100%;
  }
  .ts-confirm {
    margin: 0 0 8px;
    font-size: 12.5px;
    color: #8c2f22;
  }
  .ts-numbers {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 8px;
  }
  .ts-numbtn {
    width: 40px;
    height: 40px;
    min-height: 40px;
    border: 1px solid rgba(23, 32, 44, 0.22);
    border-radius: 2px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  .ts-numbtn:hover {
    background: rgba(255, 189, 89, 0.3);
  }
  .ts-empty {
    margin: 0;
    font-size: 12.5px;
    color: #78818f;
    line-height: 1.5;
  }
</style>
