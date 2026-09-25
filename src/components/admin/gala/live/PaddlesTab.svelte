<!--
  Pool status: every physical paddle, searchable by number or holder name.
  Release and swap are exposed because the shared check-in store already
  exposes them (store.paddleRelease, store.paddleSwap); nothing new was added
  to the store or the remote for this tab. Everything else here is read-only.
-->
<script>
  import { Search, RotateCw, Undo2, ArrowRightLeft } from "@lucide/svelte";

  let { checkin } = $props();

  const STATUS_FILTERS = ["all", "assigned", "free", "held", "void"];

  // Plain language for the refusals these two RPCs actually return
  // (docs/gala-2026/06-checkin-concurrency-design.md s5.1).
  const REASON_TEXT = {
    "paddle-has-donations": "This paddle has gifts recorded on it. It cannot go back in the box; swap the holder to a new number instead.",
    "would-orphan-paddle": "That would leave a paddle with nobody on it. Return the paddle to the box first.",
    "paddle-taken": "That number already belongs to someone else.",
    "paddle-void": "That paddle was retired (lost or replaced). Pick another number.",
    "unknown-paddle": "That number is not in tonight's box.",
    "group-has-paddle": "This party already has a different paddle.",
    "pool-empty": "No free paddles left in the box.",
    forbidden: "This needs an admin session.",
  };
  const reasonText = (reason) => REASON_TEXT[reason] || `Could not complete that: ${reason || "unknown reason"}.`;

  let query = $state("");
  let statusFilter = $state("all");
  let busyNumber = $state(null);
  let errorByNumber = $state.raw({});
  let confirmRelease = $state(null); // paddle_number pending a force-release confirm
  let swapOpen = $state(null);       // paddle_number with the swap form open
  let swapValue = $state("");

  function holderFor(group) {
    if (!group) return null;
    for (const g of Object.values(checkin.guestsById)) {
      if (g.paddle_group === group) return g;
    }
    return null;
  }

  const rows = $derived.by(() => {
    const all = Object.values(checkin.paddles).sort((a, b) => a.paddle_number - b.paddle_number);
    const q = query.trim().toLowerCase();
    return all
      .filter((p) => statusFilter === "all" || p.status === statusFilter)
      .map((p) => ({ ...p, holder: holderFor(p.paddle_group) }))
      .filter((p) => {
        if (!q) return true;
        if (String(p.paddle_number).includes(q)) return true;
        const name = (p.holder?.party_label || p.holder?.name || "").toLowerCase();
        return name.includes(q);
      });
  });

  const summary = $derived(checkin.stats.paddles);

  async function release(number, force = false) {
    busyNumber = number;
    errorByNumber = { ...errorByNumber, [number]: "" };
    const res = await checkin.paddleRelease(number, force);
    busyNumber = null;
    confirmRelease = null;
    if (!res.ok) {
      if (res.reason === "group-checked-in" && !force) {
        confirmRelease = number;
        return;
      }
      errorByNumber = { ...errorByNumber, [number]: reasonText(res.reason) };
    }
  }

  async function doSwap(row) {
    const number = parseInt(swapValue, 10);
    if (!Number.isFinite(number) || number <= 0) {
      errorByNumber = { ...errorByNumber, [row.paddle_number]: "Type a paddle number." };
      return;
    }
    if (!row.holder) {
      errorByNumber = { ...errorByNumber, [row.paddle_number]: "No guest is holding this paddle to move." };
      return;
    }
    busyNumber = row.paddle_number;
    const res = await checkin.paddleSwap(row.holder.id, number, "free");
    busyNumber = null;
    if (res.ok) {
      swapOpen = null;
      swapValue = "";
    } else {
      errorByNumber = { ...errorByNumber, [row.paddle_number]: reasonText(res.reason) };
    }
  }
</script>

<div class="pt-wrap">
  <div class="pt-summary">
    <span><strong>{summary.assigned}</strong> assigned</span>
    <span><strong>{summary.free}</strong> free</span>
    <span><strong>{summary.held}</strong> held</span>
    <span><strong>{summary.void}</strong> void</span>
    <span class:pt-warn={summary.arrived_without_paddle > 0}><strong>{summary.arrived_without_paddle}</strong> arrived without a paddle</span>
  </div>

  <div class="pt-controls">
    <div class="pt-search">
      <Search size={16} strokeWidth={2} />
      <input type="text" placeholder="Search number or name" bind:value={query} />
    </div>
    <div class="pt-filters" role="group" aria-label="Filter by status">
      {#each STATUS_FILTERS as f (f)}
        <button type="button" class="pt-chip" class:pt-chip--on={statusFilter === f} onclick={() => (statusFilter = f)}>{f}</button>
      {/each}
    </div>
  </div>

  <div class="pt-table-wrap">
    <table class="pt-table">
      <thead>
        <tr><th>#</th><th>Status</th><th>Holder</th><th>Preassigned</th><th>Actions</th></tr>
      </thead>
      <tbody>
        {#each rows as row (row.paddle_number)}
          <tr>
            <td class="pt-num">{row.paddle_number}</td>
            <td><span class="pt-badge pt-badge--{row.status}">{row.status}</span></td>
            <td>{row.holder ? (row.holder.party_label || row.holder.name) : "–"}</td>
            <td>{row.preassigned ? "Yes" : ""}</td>
            <td class="pt-actions">
              {#if row.status === "assigned" || row.status === "held"}
                {#if confirmRelease === row.paddle_number}
                  <span class="pt-confirm">Occupant is checked in. Force release?</span>
                  <button type="button" class="pt-btn pt-btn--danger" onclick={() => release(row.paddle_number, true)} disabled={busyNumber === row.paddle_number}>Force</button>
                  <button type="button" class="pt-btn pt-btn--ghost" onclick={() => (confirmRelease = null)}>Cancel</button>
                {:else}
                  <button type="button" class="pt-btn" onclick={() => release(row.paddle_number)} disabled={busyNumber === row.paddle_number}>
                    {#if busyNumber === row.paddle_number}<RotateCw size={13} class="pt-spin" />{:else}<Undo2 size={13} />{/if} Release
                  </button>
                  <button type="button" class="pt-btn pt-btn--ghost" onclick={() => { swapOpen = swapOpen === row.paddle_number ? null : row.paddle_number; swapValue = ""; }}>
                    <ArrowRightLeft size={13} /> Swap
                  </button>
                {/if}
              {/if}
            </td>
          </tr>
          {#if swapOpen === row.paddle_number}
            <tr class="pt-swap-row">
              <td colspan="5">
                <div class="pt-swap">
                  <label>New number for {row.holder?.name || row.holder?.party_label || "this guest"}</label>
                  <input type="text" inputmode="numeric" bind:value={swapValue} placeholder="e.g. 87" />
                  <button type="button" class="pt-btn" onclick={() => doSwap(row)} disabled={busyNumber === row.paddle_number}>Confirm swap</button>
                  <span class="pt-swap-note">The old number ({row.paddle_number}) goes back in the box as free.</span>
                </div>
              </td>
            </tr>
          {/if}
          {#if errorByNumber[row.paddle_number]}
            <tr><td colspan="5" class="pt-err">{errorByNumber[row.paddle_number]}</td></tr>
          {/if}
        {/each}
        {#if !rows.length}
          <tr><td colspan="5" class="pt-empty">No paddles match.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>

<style>
  .pt-wrap { display: flex; flex-direction: column; gap: 12px; }
  .pt-summary { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: var(--g26-dim); }
  .pt-summary strong { color: var(--g26-cream); font-variant-numeric: tabular-nums; }
  .pt-warn strong { color: var(--g26-alert); }

  .pt-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .pt-search { display: flex; align-items: center; gap: 8px; flex: 1 1 220px; min-height: 40px; padding: 0 10px; background: var(--g26-surface-2); border: 1px solid var(--g26-line-strong); border-radius: var(--g26-r-ctl); color: var(--g26-dim); }
  .pt-search input { flex: 1; background: transparent; border: 0; color: var(--g26-cream); font-size: 14px; }
  .pt-search input:focus { outline: none; }
  .pt-filters { display: flex; gap: 6px; }
  .pt-chip { min-height: 34px; padding: 0 12px; font-size: 12px; font-weight: 700; text-transform: capitalize; color: var(--g26-dim); background: transparent; border: 1px solid var(--g26-line); border-radius: 999px; cursor: pointer; }
  .pt-chip--on { color: var(--g26-ink); background: var(--g26-gold-soft); border-color: var(--g26-gold-soft); }

  .pt-table-wrap { overflow-x: auto; background: var(--g26-surface-1); border: 1px solid var(--g26-line); border-radius: var(--g26-r-card); }
  .pt-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .pt-table th { padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--g26-dim); background: var(--g26-surface-2); }
  .pt-table td { padding: 8px 10px; border-bottom: 1px solid var(--g26-line); color: var(--g26-muted); }
  .pt-num { font-variant-numeric: tabular-nums; font-weight: 800; color: var(--g26-cream); }
  .pt-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: capitalize; }
  .pt-badge--assigned { background: rgb(255 189 89 / 0.18); color: var(--g26-gold-soft); }
  .pt-badge--free { background: rgb(95 212 184 / 0.16); color: var(--g26-ok); }
  .pt-badge--held { background: rgb(140 196 236 / 0.16); color: var(--g26-info); }
  .pt-badge--void { background: rgb(255 138 122 / 0.16); color: var(--g26-alert); }

  .pt-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .pt-btn { display: inline-flex; align-items: center; gap: 5px; min-height: 30px; padding: 0 10px; font-size: 11px; font-weight: 800; color: var(--g26-ink); background: var(--g26-gold-soft); border: 0; border-radius: var(--g26-r-ctl); cursor: pointer; }
  .pt-btn--ghost { color: var(--g26-cream); background: transparent; border: 1px solid var(--g26-line-strong); }
  .pt-btn--danger { background: var(--g26-alert); }
  .pt-confirm { font-size: 11px; color: var(--g26-alert); font-weight: 700; }
  :global(.pt-spin) { animation: pt-spin 1s linear infinite; }
  @keyframes pt-spin { to { transform: rotate(360deg); } }

  .pt-swap-row td { background: var(--g26-surface-2); }
  .pt-swap { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .pt-swap label { font-size: 12px; color: var(--g26-dim); }
  .pt-swap input { min-height: 34px; width: 90px; padding: 0 8px; background: var(--g26-surface-1); border: 1px solid var(--g26-line-strong); border-radius: var(--g26-r-ctl); color: var(--g26-cream); }
  .pt-swap-note { font-size: 11px; color: var(--g26-dim); }

  .pt-err { color: var(--g26-alert); font-size: 12px; font-weight: 700; background: rgb(255 138 122 / 0.08); }
  .pt-empty { text-align: center; color: var(--g26-dim); padding: 24px; }
</style>
