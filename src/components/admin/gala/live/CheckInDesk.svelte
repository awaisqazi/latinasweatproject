<!--
  Check-in, composed for the ops console's laptop desk rather than a
  volunteer's phone. This intentionally does NOT mount GalaCheckinApp.svelte:
  that component owns its own gate, its own store and its own realtime
  channel, and mounting a second independent copy next to the console's own
  store would open a second socket on the same event (the terminal store's
  own comment: "one socket per browser tab, or the two channels fight over
  the same topic"). Instead this composes the same public subcomponents
  GalaCheckinApp uses, against the console's ALREADY-ATTACHED store (read
  through the "gala-checkin" context the console sets once at its root).
  Nothing in src/components/galacheckin/* is modified: every import below is
  an existing, tested export.
-->
<script>
  import { getContext } from "svelte";
  import { ListPlus, RotateCw, Table2, UserPlus, WifiOff } from "@lucide/svelte";
  import { buildSearchIndex, matchGuests, rankParties } from "../../../../lib/galaCheckin/derive.js";

  import GuestSearch from "../../../galacheckin/GuestSearch.svelte";
  import PartyCard from "../../../galacheckin/PartyCard.svelte";
  import PartySheet from "../../../galacheckin/PartySheet.svelte";
  import WalkInSheet from "../../../galacheckin/WalkInSheet.svelte";
  import PaddleConflictDialog from "../../../galacheckin/PaddleConflictDialog.svelte";
  import ConfirmSheet from "../../../galacheckin/ConfirmSheet.svelte";
  import ArrivalConfirm from "../../../galacheckin/ArrivalConfirm.svelte";
  import NoticeStack from "../../../galacheckin/NoticeStack.svelte";
  import SyncPill from "../../../galacheckin/SyncPill.svelte";
  import ActivityFeed from "../../../galacheckin/ActivityFeed.svelte";
  import Sheet from "../../../galacheckin/Sheet.svelte";

  const { store, ui } = getContext("gala-checkin");

  const index = $derived(buildSearchIndex(store.guests));
  const searching = $derived(ui.query.trim().length > 0);
  const found = $derived(searching ? matchGuests(ui.query, index) : null);

  const rows = $derived.by(() => {
    const parties = store.parties;
    if (searching) return rankParties(found.hits, parties);
    const keep = parties.filter((p) => {
      if (ui.filter === "waiting") return !p.allArrived;
      if (ui.filter === "arrived") return p.anyArrived;
      if (ui.filter === "late") return p.lateNight > 0;
      return true;
    });
    return keep.slice().sort((a, b) => a.sort_key.localeCompare(b.sort_key)).map((p) => ({ party: p, matchedGuestId: "" }));
  });

  const totals = $derived(store.stats.totals);
  const offline = $derived(store.sync.status === "offline");
</script>

<div class="cid-shell">
  <header class="cid-bar">
    <h2 class="cid-title">Check-In desk</h2>
    <p class="cid-count">
      <span class="cid-count-num">{totals.checked_in}</span>
      <span class="cid-count-of">of {totals.guests} arrived</span>
    </p>
    <SyncPill />
  </header>

  {#if offline}
    <div class="cid-offline" role="alert"><WifiOff size={18} strokeWidth={2.2} /> No connection. Nothing is being saved on this device.</div>
  {/if}
  {#if store.closed}
    <div class="cid-offline" role="alert"><span>Check-in is closed for the night.</span></div>
  {/if}
  {#each store.stuck as op (op.opId)}
    <button type="button" class="cid-stuck" onclick={() => store.retry(op.opId)}>
      <RotateCw size={16} strokeWidth={2.2} /> Not saved, tap to retry
    </button>
  {/each}

  <GuestSearch />

  <main class="cid-list">
    {#if rows.length === 0}
      <p class="cid-empty">
        {#if searching}
          Nobody matches that. Two short fragments are the fastest search.
        {:else}
          No guests in this filter.
        {/if}
      </p>
    {:else}
      {#if searching && found.fuzzy}<p class="cid-didyoumean">Did you mean</p>{/if}
      {#each rows as row (row.party.id)}
        <PartyCard party={row.party} matchedGuestId={row.matchedGuestId} />
      {/each}
    {/if}
  </main>

  <nav class="cid-foot">
    <button type="button" class="cid-foot-btn cid-foot-btn--gold" onclick={() => ui.openWalkIn()}>
      <UserPlus size={19} strokeWidth={2.2} /> Walk-in
    </button>
    <button type="button" class="cid-foot-btn" onclick={() => (ui.panel = ui.panel === "tables" ? "none" : "tables")}>
      <Table2 size={19} strokeWidth={2} /> Tables
    </button>
    <button type="button" class="cid-foot-btn" onclick={() => (ui.panel = ui.panel === "feed" ? "none" : "feed")}>
      <ListPlus size={19} strokeWidth={2} /> Activity
    </button>
  </nav>
</div>

<NoticeStack />
<PartySheet />
<WalkInSheet />

{#if ui.panel === "feed"}
  <Sheet eyebrow="Tonight" title="Activity" onclose={() => (ui.panel = "none")} tall>
    <ActivityFeed />
  </Sheet>
{/if}
{#if ui.panel === "tables"}
  <Sheet eyebrow="Arrivals" title="By table" onclose={() => (ui.panel = "none")} tall>
    <table class="cid-tables">
      <thead><tr><th scope="col">Table</th><th scope="col">Arrived</th><th scope="col">Seats</th></tr></thead>
      <tbody>
        {#each store.stats.by_table as t (t.table_number ?? "none")}
          <tr>
            <th scope="row">{t.table_number ?? "No table"}</th>
            <td class="cid-num">{t.checked_in}</td>
            <td class="cid-num">{t.total}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="cid-tables-note">
      Paddles out: {store.stats.paddles.assigned} · free in the box: {store.stats.paddles.free} ·
      arrived without a paddle: {store.stats.paddles.arrived_without_paddle}
    </p>
  </Sheet>
{/if}

<PaddleConflictDialog />
<ConfirmSheet />
<ArrivalConfirm />

<style>
  .cid-shell {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: calc(100dvh - 160px);
  }
  .cid-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 4px;
    border-bottom: 1px solid var(--g26-line);
  }
  .cid-title {
    flex: none;
    margin: 0;
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: 22px;
    color: var(--g26-gold);
  }
  .cid-count { flex: 1; margin: 0; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .cid-count-num { font-size: 19px; font-weight: 800; color: var(--g26-cream); }
  .cid-count-of { font-size: 13px; font-weight: 700; color: var(--g26-dim); margin-left: 4px; }

  .cid-offline {
    display: flex; align-items: center; gap: 8px;
    padding: 9px 12px; font-size: 13px; font-weight: 700;
    color: var(--g26-ink); background: var(--g26-alert); border-radius: var(--g26-r-ctl);
  }
  .cid-stuck {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; min-height: 44px; font-family: var(--g26-sans); font-size: 13px; font-weight: 800;
    color: var(--g26-alert); background: rgb(255 138 122 / 0.12);
    border: 1px solid rgb(255 138 122 / 0.4); border-radius: var(--g26-r-ctl); cursor: pointer;
  }

  .cid-list {
    flex: 1; min-height: 320px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 10px;
    align-content: start;
  }
  .cid-empty, .cid-didyoumean { grid-column: 1 / -1; margin: 0; padding: 20px; text-align: center; color: var(--g26-dim); }
  .cid-didyoumean { font-size: 11px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: var(--g26-gold-soft); padding-bottom: 0; }

  .cid-foot {
    display: flex; gap: 8px; padding-top: 6px; border-top: 1px solid var(--g26-line);
  }
  .cid-foot-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    min-height: 48px; padding: 0 16px;
    font-family: var(--g26-sans); font-size: 13px; font-weight: 800; letter-spacing: 0.04em;
    color: var(--g26-cream); background: transparent; border: 1px solid var(--g26-line-strong);
    border-radius: var(--g26-r-ctl); cursor: pointer;
  }
  .cid-foot-btn--gold { color: var(--g26-ink); background: var(--g26-gold); border-color: var(--g26-gold); }

  .cid-tables { width: 100%; border-collapse: collapse; color: #1e1e1e; }
  .cid-tables th, .cid-tables td { padding: 9px 6px; text-align: left; font-size: 14px; border-bottom: 1px solid rgb(185 132 47 / 0.22); }
  .cid-tables thead th { font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: rgb(30 30 30 / 0.55); }
  .cid-num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 800; }
  .cid-tables-note { margin: 12px 0 0; font-size: 13px; color: rgb(30 30 30 / 0.65); }

  @media (max-width: 720px) {
    .cid-list { grid-template-columns: 1fr; }
  }
</style>
