<!--
  "Seat someone here": who goes in chair 4 at table 7.

  The search box is pinned above the only scrolling area, so the keyboard can
  never push it away. Unseated dinner guests come first because that is who the
  planner is placing; everyone else follows, and anyone already sitting
  somewhere says so before you move them.
-->
<script>
  import { getContext } from "svelte";
  import { ticketTypeById, tableLabel, MEALS } from "../../lib/galaSeating/model.js";
  import { moveNote } from "../../lib/galaSeating/seatHelpers.js";
  import { searchGuests, lastName } from "./guestListLogic.js";
  import MFull from "./MFull.svelte";

  let { tableId, seat, nav } = $props();
  const { store } = getContext("gala-seating");

  let query = $state("");

  const plan = $derived(store.plan);
  const table = $derived(plan.tables.find((t) => t.id === tableId) || null);
  const found = $derived(searchGuests(plan, query));

  const groups = $derived.by(() => {
    const here = new Set(
      Object.entries(plan.seating)
        .filter(([, s]) => s.tableId === tableId)
        .map(([id]) => id),
    );
    const byName = (a, b) => lastName(a.name).localeCompare(lastName(b.name));
    const unseated = found.filter((g) => !plan.seating[g.id] && g.hasDinner !== false).sort(byName);
    const elsewhere = found.filter((g) => plan.seating[g.id] && !here.has(g.id)).sort(byName);
    const late = found.filter((g) => !plan.seating[g.id] && g.hasDinner === false).sort(byName);
    return [
      { key: "unseated", label: "Waiting for a seat", items: unseated },
      { key: "elsewhere", label: "Already seated elsewhere", items: elsewhere },
      { key: "late", label: "Late night, no dinner seat", items: late },
    ].filter((g) => g.items.length);
  });

  const mealVar = {
    "short-rib": "var(--gs-meal-short-rib)",
    whitefish: "var(--gs-meal-whitefish)",
    ravioli: "var(--gs-meal-ravioli)",
  };

  function pick(guest) {
    const from = moveNote(plan, guest.id);
    const res = store.seatGuest(guest.id, tableId, seat);
    if (res && res.ok === false) {
      store.pushToast({ kind: "warn", message: "That chair could not be filled." });
      return;
    }
    store.pushToast({
      kind: "ok",
      message: `${guest.name} is in seat ${(res?.seat ?? seat) + 1} at ${table ? tableLabel(table) : "the table"}.`,
      detail: from || undefined,
      action: { label: "Undo", run: () => store.undo() },
    });
    nav.closeTop();
  }
</script>

<MFull
  eyebrow={table ? `${tableLabel(table)} · seat ${seat + 1}` : ""}
  title="Who sits here"
  onclose={() => nav.closeTop()}
>
  {#snippet sticky()}
    <input
      class="msp-search"
      type="text"
      inputmode="search"
      enterkeyhint="search"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="none"
      spellcheck="false"
      placeholder="Search a name or a party"
      value={query}
      oninput={(e) => (query = e.currentTarget.value)}
      aria-label="Search guests to seat here"
    />
  {/snippet}

  {#snippet children()}
    {#if !groups.length}
      <p class="msp-none">Nobody matches that.</p>
    {/if}
    {#each groups as group (group.key)}
      <h3 class="msp-head">{group.label}<span>{group.items.length}</span></h3>
      <ul class="msp-list">
        {#each group.items as guest (guest.id)}
          <li>
            <button type="button" class="msp-row" onclick={() => pick(guest)}>
              <span class="msp-main">
                <span class="msp-name">{guest.name}</span>
                <span class="msp-sub">
                  {guest.partyLabel}
                  {#if moveNote(plan, guest.id)}
                    <em class="msp-move">{moveNote(plan, guest.id)}</em>
                  {/if}
                </span>
              </span>
              <span class="msp-meta">
                {#if guest.hasDinner}
                  <span
                    class="gs-dot"
                    style={`background:${mealVar[guest.meal] || "var(--gs-meal-none)"}`}
                    title={MEALS.find((m) => m.id === guest.meal)?.label || "No entrée"}
                  ></span>
                {/if}
                <span class="msp-pill">{ticketTypeById(guest.ticketType).short}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/each}
  {/snippet}
</MFull>

<style>
  .msp-search {
    width: 100%;
    min-height: 48px;
    padding: 10px 12px;
    border: 1px solid rgba(23, 32, 44, 0.28);
    border-radius: 3px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 16px;
  }
  .msp-none {
    padding: 24px 4px;
    text-align: center;
    color: #78818f;
    font-size: 14px;
  }
  .msp-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin: 16px 0 4px;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #8a6a24;
  }
  .msp-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .msp-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 58px;
    padding: 9px 6px;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(23, 32, 44, 0.1);
    color: var(--gs-ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .msp-row:active {
    background: rgba(255, 189, 89, 0.32);
  }
  .msp-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .msp-name {
    font-size: 15.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .msp-sub {
    font-size: 12.5px;
    color: #78818f;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .msp-move {
    font-style: normal;
    color: #8a5700;
    margin-left: 6px;
  }
  .msp-meta {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .msp-pill {
    font-size: 10px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    border: 1px solid rgba(23, 32, 44, 0.28);
    border-radius: 2px;
    padding: 2px 5px;
    white-space: nowrap;
  }
</style>
