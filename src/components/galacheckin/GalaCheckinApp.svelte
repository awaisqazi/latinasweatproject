<!--
  Volunteer check-in for the Annual Gala. Phone first, one handed, dim venue.

  The shape of the evening: a volunteer unlocks once with a passcode and their
  first name, searches, taps a party, hands over a paddle. Eight of them do that
  at the same time on eight phones, and the server is the only thing that
  decides anything. This component owns the store, the shared UI state and the
  layout; every rule that matters is documented where it is enforced:

    · a paddle number is never invented here          (PaddleChip.svelte)
    · a mutation answer never moves the cursor        (store.svelte.js, rule C2)
    · nothing about a guest reaches web storage       (remote.js)
    · presence carries a first name and a guest id,
      never party_id, which is usually an email       (uiState.svelte.js)

  PRIVACY: this repo is public. The page ships empty; the guest list lives in
  LSP's passcode-protected database and never touches a URL.
-->
<script>
  import { onDestroy, onMount, setContext } from "svelte";
  import { ListPlus, RotateCw, Table2, UserPlus, WifiOff } from "@lucide/svelte";

  import { createCheckinStore } from "../../lib/galaCheckin/store.svelte.js";
  import { createCheckinRemote, DEFAULT_EVENT } from "../../lib/galaCheckin/remote.js";
  import { buildSearchIndex, matchGuests, rankParties } from "../../lib/galaCheckin/derive.js";
  import { createCheckinUi } from "./uiState.svelte.js";

  import CheckinGate from "./CheckinGate.svelte";
  import GuestSearch from "./GuestSearch.svelte";
  import PartyCard from "./PartyCard.svelte";
  import PartySheet from "./PartySheet.svelte";
  import WalkInSheet from "./WalkInSheet.svelte";
  import PaddleConflictDialog from "./PaddleConflictDialog.svelte";
  import ConfirmSheet from "./ConfirmSheet.svelte";
  import ArrivalConfirm from "./ArrivalConfirm.svelte";
  import NoticeStack from "./NoticeStack.svelte";
  import SyncPill from "./SyncPill.svelte";
  import ActivityFeed from "./ActivityFeed.svelte";
  import Sheet from "./Sheet.svelte";

  let { event = DEFAULT_EVENT } = $props();

  /**
   * Development builds only: `?event=test-ui-0921` points the desk at a
   * rehearsal event so two browsers can be driven against each other without
   * touching gala night. Computed SYNCHRONOUSLY, because the gate mounts before
   * this component's onMount and needs the slug to look for a saved token
   * (the same gotcha that bit /galaseating). The DEV guard strips it from the
   * production build.
   */
  const slug = (() => {
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("event") || "";
      if (/^[a-z0-9-]{3,40}$/.test(v)) return v;
    }
    return event;
  })();

  const store = createCheckinStore();
  const ui = createCheckinUi(store);
  const remote = createCheckinRemote({ event: slug });
  setContext("gala-checkin", { store, ui });

  /** gate | loading | app */
  let phase = $state(remote.hasToken ? "loading" : "gate");

  onMount(async () => {
    if (phase !== "loading") return;
    const res = await store.attach(remote);
    phase = res.ok ? "app" : "gate";
  });

  onDestroy(() => store.stop());

  // A revoked, expired or rotated session lands back on the gate at the next
  // call, wherever in the app the volunteer happens to be.
  $effect(() => {
    if (phase === "app" && store.sync.status === "locked") phase = "gate";
  });

  async function unlocked() {
    phase = "loading";
    const res = await store.attach(remote);
    phase = res.ok ? "app" : "gate";
  }

  // ---- the list ---------------------------------------------------------------
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
    return keep
      .slice()
      .sort((a, b) => a.sort_key.localeCompare(b.sort_key))
      .map((p) => ({ party: p, matchedGuestId: "" }));
  });

  const totals = $derived(store.stats.totals);
  const offline = $derived(store.sync.status === "offline");

  function onKeydown(e) {
    if (e.key === "Escape") ui.closeTop();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="gc">
  {#if phase === "gate"}
    <CheckinGate {remote} onunlock={unlocked} />
  {:else if phase === "loading"}
    <div class="gc-boot">
      <p class="gc-boot-title">Annual Gala</p>
      <p class="gc-boot-sub">Loading the guest list</p>
    </div>
  {:else}
    <div class="gc-shell">
      <header class="gc-bar">
        <h1 class="gc-title">Check-In</h1>
        <button
          type="button"
          class="gc-count"
          aria-pressed={ui.filter === "waiting"}
          aria-label="{totals.checked_in} of {totals.guests} arrived. Show who has not arrived."
          onclick={() => (ui.filter = ui.filter === "waiting" ? "all" : "waiting")}
        >
          <span class="gc-count-num">{totals.checked_in}</span>
          <span class="gc-count-of">of {totals.guests} arrived</span>
        </button>
        <SyncPill />
      </header>

      {#if offline}
        <div class="gc-offline" role="alert">
          <WifiOff size={18} strokeWidth={2.2} />
          <span>No connection. Nothing is being saved on this device.</span>
        </div>
      {/if}

      {#if store.closed}
        <div class="gc-offline" role="alert">
          <span>Check-in is closed for the night.</span>
        </div>
      {/if}

      {#each store.stuck as op (op.opId)}
        <button type="button" class="gc-stuck" onclick={async () => ui.afterCheckIn(await store.retry(op.opId))}>
          <RotateCw size={16} strokeWidth={2.2} />
          Not saved{op.kind === "walkin" ? " (walk-in)" : ""}, tap to retry
        </button>
      {/each}

      <GuestSearch />

      <main class="gc-list">
        {#if rows.length === 0}
          <p class="gc-empty">
            {#if searching}
              Nobody matches that. Two short fragments are the fastest search: the
              first letters of a first name and of a surname, like "ma go".
            {:else}
              No guests in this filter.
            {/if}
          </p>
        {:else}
          {#if searching && found.fuzzy}
            <p class="gc-didyoumean">Did you mean</p>
          {/if}
          {#each rows as row (row.party.id)}
            <PartyCard party={row.party} matchedGuestId={row.matchedGuestId} />
          {/each}
        {/if}
      </main>

      <nav class="gc-foot">
        <button type="button" class="gc-foot-btn gc-foot-btn--gold" onclick={() => ui.openWalkIn()}>
          <UserPlus size={20} strokeWidth={2.2} /> Walk-in
        </button>
        <button type="button" class="gc-foot-btn" onclick={() => (ui.panel = ui.panel === "tables" ? "none" : "tables")}>
          <Table2 size={20} strokeWidth={2} /> Tables
        </button>
        <button type="button" class="gc-foot-btn" onclick={() => (ui.panel = ui.panel === "feed" ? "none" : "feed")}>
          <ListPlus size={20} strokeWidth={2} /> Activity
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
        <table class="gc-tables">
          <thead>
            <tr><th scope="col">Table</th><th scope="col">Arrived</th><th scope="col">Seats</th></tr>
          </thead>
          <tbody>
            {#each store.stats.by_table as t (t.table_number ?? "none")}
              <tr>
                <th scope="row">{t.table_number ?? "No table"}</th>
                <td class="gc-num">{t.checked_in}</td>
                <td class="gc-num">{t.total}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="gc-tables-note">
          Paddles out: {store.stats.paddles.assigned} · free in the box: {store.stats.paddles.free} ·
          arrived without a paddle: {store.stats.paddles.arrived_without_paddle}
        </p>
      </Sheet>
    {/if}

    <PaddleConflictDialog />
    <ConfirmSheet />
    <ArrivalConfirm />
  {/if}
</div>

<style>
  /* ------------------------------------------------------------------ *
   * Tokens: docs/gala-2026/04-theme-design-spec.md section 2.6, the subset
   * this app uses. Declared on the root so every child inherits them, and
   * kept out of global.css so nothing leaks into the public site.
   * ------------------------------------------------------------------ */
  .gc {
    --g26-ink: #05070c;
    --g26-night: #0b1320;
    --g26-navy: #111a27;
    --g26-navy-2: #16212f;
    --g26-navy-3: #1b2a40;
    --g26-cream: #fff8ef;
    --g26-warm: #f2e4d2;
    --g26-text: #f3ece1;
    --g26-muted: #c3ccd8;
    --g26-dim: #a9b4c2;
    --g26-gold: #ffbd59;
    --g26-gold-strong: #f4a833;
    --g26-gold-deep: #b9842f;
    --g26-gold-soft: #e4c98a;
    --g26-gold-hi: #fff1be;
    --g26-gold-ink: #8a5700;
    --g26-ok: #5fd4b8;
    --g26-alert: #ff8a7a;
    --g26-info: #8cc4ec;

    --g26-surface-0: var(--g26-night);
    --g26-surface-1: var(--g26-navy);
    --g26-surface-2: var(--g26-navy-2);
    --g26-surface-3: var(--g26-navy-3);
    --g26-line: rgb(228 201 138 / 0.22);
    --g26-line-strong: rgb(255 189 89 / 0.55);
    --g26-focus: 0 0 0 2px var(--g26-night), 0 0 0 4px var(--g26-gold);

    --g26-serif: "Didot", "Bodoni 72", "Bodoni Moda", "Playfair Display", Georgia, serif;
    --g26-sans: "Avenir Next", "Avenir", "Rubik", "Helvetica Neue", Arial, sans-serif;

    --g26-r-chip: 2px;
    --g26-r-ctl: 3px;
    --g26-r-card: 6px;
    --g26-r-sheet: 14px;

    min-height: 100dvh;
    color: var(--g26-text);
    font-family: var(--g26-sans);
    background: var(--g26-night);
  }

  .gc-boot {
    display: grid;
    place-content: center;
    gap: 6px;
    min-height: 100dvh;
    text-align: center;
  }
  .gc-boot-title {
    margin: 0;
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: 32px;
    color: var(--g26-gold);
  }
  .gc-boot-sub {
    margin: 0;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--g26-dim);
  }

  /* The app owns the viewport: the list scrolls, the bars do not. */
  .gc-shell {
    display: flex;
    flex-direction: column;
    height: 100dvh;
  }

  .gc-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 56px;
    padding: 0 12px;
    padding-top: env(safe-area-inset-top, 0);
    background: rgb(11 19 32 / 0.94);
    border-bottom: 1px solid var(--g26-line-strong);
  }
  .gc-title {
    flex: none;
    margin: 0;
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
    font-size: 24px;
    line-height: 1;
    color: var(--g26-gold);
  }
  .gc-count {
    flex: 1;
    min-height: 48px;
    margin: 0;
    padding: 0 4px;
    font-family: var(--g26-sans);
    background: none;
    border: 0;
    cursor: pointer;
    text-align: right;
    font-variant-numeric: tabular-nums lining-nums;
    white-space: nowrap;
  }
  .gc-count[aria-pressed="true"] .gc-count-of {
    color: var(--g26-gold);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .gc-count:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }
  .gc-count-num {
    font-size: 22px;
    font-weight: 800;
    color: var(--g26-cream);
  }
  .gc-count-of {
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-dim);
  }

  .gc-offline {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-ink);
    background: var(--g26-alert);
  }

  .gc-stuck {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 48px;
    font-family: var(--g26-sans);
    font-size: 14px;
    font-weight: 800;
    color: var(--g26-alert);
    background: rgb(255 138 122 / 0.12);
    border: 0;
    border-bottom: 1px solid rgb(255 138 122 / 0.4);
    cursor: pointer;
  }

  .gc-list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .gc-empty {
    margin: 0;
    padding: 28px 20px;
    text-align: center;
    font-size: 15px;
    line-height: 1.5;
    color: var(--g26-dim);
  }
  .gc-didyoumean {
    margin: 0;
    padding: 10px 14px 4px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--g26-gold-soft);
  }

  .gc-foot {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr;
    gap: 8px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
    background: rgb(11 19 32 / 0.96);
    border-top: 1px solid var(--g26-line-strong);
  }
  .gc-foot-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 56px;
    font-family: var(--g26-sans);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--g26-cream);
    background: transparent;
    border: 1px solid var(--g26-line-strong);
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }
  .gc-foot-btn--gold {
    color: var(--g26-ink);
    background: var(--g26-gold);
    border-color: var(--g26-gold);
  }
  .gc-foot-btn:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }

  .gc-tables {
    width: 100%;
    border-collapse: collapse;
    color: var(--g26-text);
  }
  .gc-tables th,
  .gc-tables td {
    padding: 9px 6px;
    text-align: left;
    font-size: 16px;
    border-bottom: 1px solid var(--g26-line);
  }
  .gc-tables thead th {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--g26-gold-soft);
  }
  .gc-num {
    text-align: right;
    font-variant-numeric: tabular-nums lining-nums;
    font-weight: 800;
  }
  .gc-tables-note {
    margin: 12px 0 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--g26-dim);
  }

  /* ------------------------------------------------------------------ *
   * Shared controls for every sheet and dialog. Dark on purpose: a bright
   * panel in a dim lobby blinds the volunteer and lights up the guest.
   * Buttons are 48px at the smallest, 56px for primary actions; inputs are
   * 17px or more so iOS never zooms on focus.
   * ------------------------------------------------------------------ */
  .gc :global(.gbtn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 56px;
    padding: 0 16px;
    font-family: var(--g26-sans);
    font-size: 16px;
    font-weight: 800;
    letter-spacing: 0.03em;
    line-height: 1.2;
    text-align: center;
    color: var(--g26-cream);
    background: transparent;
    border: 1px solid var(--g26-line-strong);
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }
  .gc :global(.gbtn--sm) {
    min-height: 48px;
    padding: 0 12px;
    font-size: 14px;
  }
  .gc :global(.gbtn--lg) {
    min-height: 60px;
    font-size: 18px;
  }
  .gc :global(.gbtn--gold) {
    color: var(--g26-ink);
    background: var(--g26-gold);
    border-color: var(--g26-gold);
  }
  .gc :global(.gbtn--alert) {
    color: var(--g26-alert);
    border-color: var(--g26-alert);
  }
  .gc :global(.gbtn--quiet) {
    min-height: 48px;
    color: var(--g26-dim);
    border-color: transparent;
  }
  .gc :global(.gbtn:disabled) {
    opacity: 0.45;
    cursor: default;
  }
  .gc :global(.gbtn:focus-visible) {
    outline: none;
    box-shadow: var(--g26-focus);
  }
  .gc :global(.glabel) {
    padding: 0;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--g26-gold-soft);
  }
  .gc :global(.ginput) {
    width: 100%;
    min-height: 56px;
    padding: 0 14px;
    font-family: var(--g26-sans);
    font-size: 18px;
    font-weight: 600;
    color: var(--g26-cream);
    background: var(--g26-navy-2);
    border: 1px solid var(--g26-line-strong);
    border-radius: var(--g26-r-ctl);
    -webkit-appearance: none;
    appearance: none;
  }
  .gc :global(.ginput::placeholder) {
    color: var(--g26-dim);
    font-weight: 500;
  }
  .gc :global(.ginput:focus-visible) {
    outline: none;
    border-color: var(--g26-gold);
    box-shadow: var(--g26-focus);
  }
  .gc :global(.ginput--num) {
    min-height: 64px;
    font-size: 30px;
    font-weight: 800;
    font-variant-numeric: tabular-nums lining-nums;
  }

  /* The desk laptop gets the same components, not a light theme. */
  @media (min-width: 900px) {
    .gc-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 12px;
      align-content: start;
      padding: 12px;
    }
    .gc-empty,
    .gc-didyoumean {
      grid-column: 1 / -1;
    }
    .gc-foot {
      grid-template-columns: repeat(3, minmax(0, 220px));
      justify-content: start;
    }
  }
</style>
