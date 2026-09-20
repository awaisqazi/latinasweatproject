<!--
  "Seat a party here": the fast way to build a table out of one purchase.

  Parties are listed biggest first, with how many of them are still standing and
  how many would actually fit in the chairs left at this table.
-->
<script>
  import { getContext } from "svelte";
  import { tableLabel } from "../../lib/galaSeating/model.js";
  import { tableOccupancy } from "../../lib/galaSeating/seatHelpers.js";
  import MFull from "./MFull.svelte";

  let { tableId, nav } = $props();
  const { store } = getContext("gala-seating");

  let query = $state("");

  const plan = $derived(store.plan);
  const table = $derived(plan.tables.find((t) => t.id === tableId) || null);
  const free = $derived(tableOccupancy(plan, tableId)?.free ?? 0);

  const parties = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const map = new Map();
    for (const g of Object.values(plan.guests)) {
      if (plan.seating[g.id]) continue;
      if (g.hasDinner === false) continue;
      if (!map.has(g.partyId)) map.set(g.partyId, { partyId: g.partyId, label: g.partyLabel, count: 0 });
      map.get(g.partyId).count += 1;
    }
    return [...map.values()]
      .filter((p) => !q || p.label.toLowerCase().includes(q))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  });

  function seatParty(party) {
    const res = store.seatParty(party.partyId, tableId);
    const seated = res?.seated || 0;
    if (res?.missed?.length) {
      store.pushToast({
        kind: "warn",
        message: `Seated ${seated} of ${party.label}, ${res.missed.length} did not fit.`,
        action: { label: "Undo", run: () => store.undo() },
      });
    } else {
      store.pushToast({
        kind: "ok",
        message: `Seated ${seated} from ${party.label} at ${table ? tableLabel(table) : "the table"}.`,
        action: { label: "Undo", run: () => store.undo() },
      });
    }
    nav.closeTop();
  }
</script>

<MFull
  eyebrow={table ? `${tableLabel(table)} · ${free} free` : ""}
  title="Seat a whole party"
  onclose={() => nav.closeTop()}
>
  {#snippet sticky()}
    <input
      class="mpp-search"
      type="text"
      inputmode="search"
      autocomplete="off"
      autocapitalize="none"
      placeholder="Search a party"
      value={query}
      oninput={(e) => (query = e.currentTarget.value)}
      aria-label="Search parties"
    />
  {/snippet}

  {#snippet children()}
    {#if !parties.length}
      <p class="mpp-none">Every dinner guest already has a chair.</p>
    {/if}
    <ul class="mpp-list">
      {#each parties as party (party.partyId)}
        <li>
          <button type="button" class="mpp-row" onclick={() => seatParty(party)}>
            <span class="mpp-name">{party.label}</span>
            <span class="mpp-count">
              {party.count} waiting{party.count > free ? ` · ${free} fit` : ""}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/snippet}
</MFull>

<style>
  .mpp-search {
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
  .mpp-none {
    padding: 24px 4px;
    text-align: center;
    color: #78818f;
    font-size: 14px;
  }
  .mpp-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .mpp-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-height: 58px;
    padding: 10px 6px;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(23, 32, 44, 0.1);
    color: var(--gs-ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .mpp-row:active {
    background: rgba(255, 189, 89, 0.32);
  }
  .mpp-name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 15.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mpp-count {
    flex: 0 0 auto;
    font-size: 12.5px;
    color: #78818f;
  }
</style>
