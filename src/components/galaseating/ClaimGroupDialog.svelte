<!--
  Bulk reconcile: a group of dinner responses typed under one organiser's name
  takes a buyer's unnamed seats. Shows the arithmetic before it commits, because
  the groups rarely line up exactly with the seats a buyer holds.
-->
<script>
  import { getContext } from "svelte";
  import { ticketTypeById } from "../../lib/galaSeating/model.js";

  let { partyId, onclose = () => {} } = $props();
  const { store } = getContext("gala-seating");

  let query = $state("");
  let chosen = $state(/** @type {string|null} */ (null));

  const plan = $derived(store.plan);
  const diners = $derived(Object.values(plan.guests).filter((g) => g.unmatched && g.partyId === partyId));
  const label = $derived(diners[0]?.partyLabel || "This group");

  function normal(v) {
    return String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z ]/g, "")
      .trim();
  }

  function overlap(a, b) {
    const A = new Set(normal(a).split(/\s+/).filter((w) => w.length > 2));
    const B = new Set(normal(b).split(/\s+/).filter((w) => w.length > 2));
    let n = 0;
    for (const w of A) if (B.has(w)) n += 1;
    return n;
  }

  const targets = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const map = new Map();
    for (const g of Object.values(plan.guests)) {
      if (!g.placeholder) continue;
      if (!map.has(g.partyId)) {
        map.set(g.partyId, {
          partyId: g.partyId,
          label: g.partyLabel,
          buyerName: g.buyerName,
          ticketType: g.ticketType,
          open: 0,
        });
      }
      map.get(g.partyId).open += 1;
    }
    return [...map.values()]
      .map((t) => ({
        ...t,
        // A group of ten almost always belongs to the sponsor holding ten seats.
        score: overlap(t.buyerName || t.label, label) * 10 + (t.open === diners.length ? 5 : 0) - Math.abs(t.open - diners.length),
      }))
      .filter((t) => !q || t.label.toLowerCase().includes(q) || (t.buyerName || "").toLowerCase().includes(q))
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, 14);
  });

  const chosenTarget = $derived(targets.find((t) => t.partyId === chosen) || null);
  const willSeat = $derived(chosenTarget ? Math.min(diners.length, chosenTarget.open) : 0);
  const leftover = $derived(chosenTarget ? Math.max(0, diners.length - chosenTarget.open) : 0);

  function apply() {
    if (!chosenTarget) return;
    store.claimGroupSeats(partyId, chosenTarget.partyId);
    onclose();
  }
</script>

<div class="cg-scrim" role="presentation" onpointerdown={onclose}></div>
<div class="cg gs-sheet" role="dialog" aria-modal="true" aria-label="Assign this group to a buyer's seats">
  <h2 class="gs-serif">Assign {label} to a buyer's seats</h2>
  <p class="cg-lead">
    {diners.length} {diners.length === 1 ? "diner" : "diners"} filled in the dinner form under this name
    with no ticket of their own. Pick the party whose unnamed seats they belong to.
  </p>

  <input
    class="gs-input"
    placeholder="Search a buyer or party"
    value={query}
    oninput={(e) => (query = e.currentTarget.value)}
  />

  <div class="cg-list gs-scroll">
    {#each targets as t (t.partyId)}
      <button
        type="button"
        class="cg-opt"
        class:cg-opt--on={chosen === t.partyId}
        onclick={() => (chosen = t.partyId)}
      >
        <span class="cg-optname">{t.label}</span>
        <span class="cg-optmeta">{ticketTypeById(t.ticketType).short} · {t.open} unnamed</span>
      </button>
    {/each}
    {#if !targets.length}
      <p class="cg-none">No party has unnamed seats left.</p>
    {/if}
  </div>

  {#if chosenTarget}
    <p class="cg-preview">
      {diners.length} {diners.length === 1 ? "diner" : "diners"} into {chosenTarget.open} unnamed
      {chosenTarget.open === 1 ? "seat" : "seats"}
      {#if leftover}
        · {leftover} will stay unmatched
      {:else}
        · every one of them lands
      {/if}
    </p>
  {/if}

  <div class="cg-actions">
    <button type="button" class="gs-btn gs-btn--gold" disabled={!chosenTarget || willSeat === 0} onclick={apply}>
      Assign {willSeat || ""}
    </button>
    <button type="button" class="gs-btn" onclick={onclose}>Cancel</button>
  </div>
</div>

<style>
  .cg-scrim {
    position: fixed;
    inset: 0;
    background: rgba(4, 8, 14, 0.62);
    z-index: 70;
  }
  .cg {
    position: fixed;
    z-index: 71;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(520px, calc(100vw - 24px));
    max-height: min(84dvh, 700px);
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--gs-cream);
    color: var(--gs-ink);
    border-top: 3px solid var(--gs-gold);
    padding: 20px;
    box-shadow: 0 40px 90px -40px rgba(0, 0, 0, 0.95);
  }
  .cg h2 {
    margin: 0;
    font-size: 21px;
  }
  .cg-lead {
    margin: 0;
    font-size: 13px;
    line-height: 1.55;
    color: #4a525f;
  }
  .cg-list {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    border: 1px solid rgba(23, 32, 44, 0.14);
    padding: 4px;
  }
  .cg-opt {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    padding: 9px 10px;
    min-height: 42px;
    border: 1px solid transparent;
    border-radius: 2px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    text-align: left;
  }
  .cg-opt:hover {
    background: rgba(255, 189, 89, 0.22);
  }
  .cg-opt--on {
    border-color: var(--gs-gold);
    background: rgba(255, 189, 89, 0.36);
    font-weight: 700;
  }
  .cg-optmeta {
    flex: 0 0 auto;
    font-size: 11px;
    color: #78818f;
    font-weight: 400;
  }
  .cg-preview {
    margin: 0;
    padding: 9px 11px;
    background: rgba(255, 189, 89, 0.24);
    border-left: 3px solid var(--gs-gold);
    font-size: 12.5px;
    line-height: 1.5;
  }
  .cg-none {
    margin: 8px;
    font-size: 12.5px;
    color: #78818f;
  }
  .cg-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
