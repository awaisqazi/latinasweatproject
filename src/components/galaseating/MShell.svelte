<!--
  The planner on a phone.

  Three fixed things and one changing one: a top bar that never scrolls away, a
  tab bar that is always in thumb reach, the room underneath everything, and
  whichever surface the planner opened on top. The root is sized to the VISIBLE
  viewport, not the layout viewport, so Safari's collapsing toolbar and the
  keyboard shrink the app instead of pushing its header off the top of the
  screen. That is a structural fix: nothing here relies on `position: sticky`
  winning an argument with the browser.

  The map is mounted once and stays mounted. Switching tabs draws an opaque
  full-screen panel over it, so the planner's pan and zoom survive a trip to the
  guest list and "Show on map" is instant.

  PRIVACY: guest data stays in this browser and in LSP's passcode-protected
  database. Nothing here writes a guest to a URL.
-->
<script>
  import { getContext, onMount } from "svelte";
  import { forgetPasscode } from "../../lib/galaSeating/remote.js";
  import { tableLabel } from "../../lib/galaSeating/model.js";
  import { bestSeatFor, unseatedDinnerCount } from "../../lib/galaSeating/seatHelpers.js";
  import { createMobileNav } from "./mobileNav.svelte.js";
  import { bindVisualViewport, resetPageZoom } from "./viewport.js";

  import FloorPlan from "./FloorPlan.svelte";
  import MTopBar from "./MTopBar.svelte";
  import MTabBar from "./MTabBar.svelte";
  import MGuestsTab from "./MGuestsTab.svelte";
  import MTablesTab from "./MTablesTab.svelte";
  import MAlertsTab from "./MAlertsTab.svelte";
  import MGuestCard from "./MGuestCard.svelte";
  import MTableRoster from "./MTableRoster.svelte";
  import MSeatPicker from "./MSeatPicker.svelte";
  import MTablePicker from "./MTablePicker.svelte";
  import MPartyPicker from "./MPartyPicker.svelte";
  import MMenu from "./MMenu.svelte";
  import MSortSheet from "./MSortSheet.svelte";
  import MFilterSheet from "./MFilterSheet.svelte";
  import MStatsSheet from "./MStatsSheet.svelte";
  import MRenameSheet from "./MRenameSheet.svelte";
  import MFull from "./MFull.svelte";
  import GuestSheetBody from "./GuestSheetBody.svelte";
  import AddGuestDialog from "./AddGuestDialog.svelte";
  import AutoSeatDialog from "./AutoSeatDialog.svelte";
  import HelpPopover from "./HelpPopover.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import Toasts from "./Toasts.svelte";
  import SyncBadge from "./SyncBadge.svelte";

  const { store, ui } = getContext("gala-seating");
  const nav = createMobileNav();

  /** Surfaces that only cover part of the floor, so the camera can allow for them. */
  const SHEET_TYPES = new Set(["guest", "table", "menu", "sort", "filters", "stats", "rename"]);

  let rootEl = $state(null);
  let floor = $state(null);
  let syncOpen = $state(false);
  let sheetInsets = $state({ bottom: 0, right: 0 });
  // Bound in the template so Svelte keeps the `[data-keyboard]` rules: an
  // attribute only ever written from JS gets its CSS pruned as unused.
  let keyboardUp = $state(false);

  const plan = $derived(store.plan);
  const top = $derived(nav.topLayer);
  const moving = $derived(nav.moving);
  const movingGuest = $derived(moving ? plan.guests[moving.guestId] || null : null);

  const unseatedBadge = $derived(unseatedDinnerCount(plan));
  const alertsBadge = $derived.by(() => {
    const c = store.warnings.counts || {};
    return (c.error || 0) + (c.warn || 0) + (store.collisions?.length || 0);
  });

  /** Only the two numbers that matter, on one line that always fits. */
  const statsLine = $derived.by(() => {
    const s = store.stats;
    return `${s.dinnerSeated} of ${s.dinnerGuests} seated · ${s.openSeats} open ${
      s.openSeats === 1 ? "seat" : "seats"
    }`;
  });

  onMount(() => {
    // The shell is sized to the VISIBLE viewport, not the layout viewport, and
    // it publishes --m-vh / --m-top for every surface inside it. If the gate
    // handed over while the page was still magnified, snap back first.
    resetPageZoom();
    const stopViewport = bindVisualViewport(rootEl, (info) => (keyboardUp = info.keyboard));
    const stopNav = nav.start();

    // Every path that used to set `openGuestId` now pushes a surface onto the
    // navigation stack, so the floor plan, the warnings list and the collision
    // toasts all keep working without knowing a phone exists.
    ui.setRouter({
      openGuest(id) {
        if (!id) nav.closeAllLayers();
        else nav.openLayer({ type: "guest", guestId: id });
      },
      openTable(id) {
        if (!id) nav.closeAllLayers();
        else nav.openLayer({ type: "table", tableId: id });
      },
      pickGuest(id) {
        nav.openLayer({ type: "guest", guestId: id });
      },
      closeSheets() {
        nav.closeAllLayers();
      },
      // The guest card is the reveal on a phone; hunting a row in a list
      // behind it would be a second, competing answer.
      revealInList() {},
    });

    return () => {
      stopNav();
      stopViewport();
      ui.setRouter(null);
    };
  });

  // What is standing on the floor right now, so the camera aims at the rest.
  $effect(() => {
    const onMap = nav.tab === "map";
    const isSheet = top && SHEET_TYPES.has(top.type);
    ui.setViewInsets(
      onMap && isSheet ? { bottom: sheetInsets.bottom || 0, right: sheetInsets.right || 0 } : {},
    );
  });

  // ---- actions -------------------------------------------------------------

  /** The only gesture allowed to move the camera on its own. */
  function showOnMap(guestId) {
    ui.selectedGuestId = guestId;
    nav.selectTab("map");
    // Reopen the compact card over the map once the tab has settled.
    nav.openLayer({ type: "guest", guestId });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!ui.findOnFloor(guestId)) {
          store.pushToast({ kind: "info", message: "That guest is not seated yet." });
        }
      });
    });
  }

  function onMovePick(tableId, seat) {
    if (!moving) return;
    const guest = plan.guests[moving.guestId];
    const table = plan.tables.find((t) => t.id === tableId);
    if (!guest || !table) return;
    const target = seat != null ? seat : bestSeatFor(plan, guest.id, tableId);
    if (target < 0) {
      store.pushToast({ kind: "warn", message: `${tableLabel(table)} is full.` });
      return;
    }
    const res = store.seatGuest(guest.id, tableId, target);
    if (res && res.ok === false) {
      store.pushToast({ kind: "warn", message: "That table is full." });
      return;
    }
    store.pushToast({
      kind: "ok",
      message: `Seated ${guest.name} at ${tableLabel(table)}`,
      action: { label: "Undo", run: () => store.undo() },
    });
    nav.cancelMove();
  }

  function lockPage() {
    forgetPasscode();
    window.location.reload();
  }
</script>

<div class="m-root" bind:this={rootEl} data-keyboard={keyboardUp ? "on" : "off"}>
  <div class="m-col">
    <MTopBar
      {store}
      menuOpen={top?.type === "menu"}
      statusOpen={syncOpen}
      onstatus={() => (syncOpen = !syncOpen)}
      onsearch={() => {
        nav.selectTab("guests");
        ui.focusSearch();
      }}
      onmenu={() => (top?.type === "menu" ? nav.closeTop() : nav.openLayer({ type: "menu" }))}
    />

    {#if nav.tab === "map"}
      <button type="button" class="m-stats" onclick={() => nav.openLayer({ type: "stats" })}>
        <span class="m-statsline">{statsLine}</span>
        <span class="m-statsmore" aria-hidden="true">More</span>
      </button>
    {/if}

    <main class="m-main">
      <div class="m-map">
        <FloorPlan bind:this={floor} mobile moveGuestId={moving?.guestId || null} onmovepick={onMovePick} />

        {#if moving && movingGuest}
          <div class="m-movebar" role="status">
            <span class="m-movetext">
              <strong>Moving {movingGuest.name}</strong>
              <span>tap a table or a seat</span>
            </span>
            <button type="button" class="m-movecancel" onclick={() => nav.cancelMove()}>Cancel</button>
          </div>
        {/if}

        <div class="m-mapctl">
          <button
            type="button"
            class="m-ctl"
            class:m-ctl--on={ui.layoutLocked}
            aria-pressed={ui.layoutLocked}
            onclick={() => {
              ui.layoutLocked = !ui.layoutLocked;
              store.pushToast({
                kind: "info",
                message: ui.layoutLocked
                  ? "Layout locked. Guests still move freely."
                  : "Layout unlocked. Drag a table to move it.",
              });
            }}
            aria-label={ui.layoutLocked ? "Layout locked" : "Layout unlocked"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="4" y="10" width="16" height="10" rx="1.5" />
              {#if ui.layoutLocked}
                <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke-linecap="round" />
              {:else}
                <path d="M8 10V7a4 4 0 0 1 7.5-2" stroke-linecap="round" />
              {/if}
            </svg>
          </button>
          <button type="button" class="m-ctl m-ctl--fit" onclick={() => floor?.fitRoom()}>Fit</button>
        </div>
      </div>

      {#if nav.tab === "guests"}
        <MGuestsTab {nav} />
      {:else if nav.tab === "tables"}
        <MTablesTab {nav} />
      {:else if nav.tab === "alerts"}
        <MAlertsTab {nav} onshow={showOnMap} />
      {/if}
    </main>
  </div>

  <MTabBar
    tab={nav.tab}
    guests={unseatedBadge}
    alerts={alertsBadge}
    onselect={(id) => nav.selectTab(id)}
  />

  <!-- The top surface, and only the top surface. Each one is a single entry in
       session history, so Back closes exactly one of them and the one beneath
       comes back on its own. -->
  {#if top}
    {#key nav.depth}
      {#if top.type === "guest"}
        <MGuestCard
          guestId={top.guestId}
          {nav}
          onshowonmap={showOnMap}
          onmeasure={(v) => (sheetInsets = v)}
        />
      {:else if top.type === "table"}
        <MTableRoster
          tableId={top.tableId}
          {nav}
          variant={nav.tab === "tables" ? "full" : "sheet"}
          onmeasure={(v) => (sheetInsets = v)}
        />
      {:else if top.type === "seatPicker"}
        <MSeatPicker tableId={top.tableId} seat={top.seat} {nav} />
      {:else if top.type === "tablePicker"}
        <MTablePicker guestId={top.guestId} {nav} />
      {:else if top.type === "partyPicker"}
        <MPartyPicker tableId={top.tableId} {nav} />
      {:else if top.type === "guestDetails"}
        <MFull
          eyebrow="Guest record"
          title={plan.guests[top.guestId]?.name || "Guest"}
          onclose={() => nav.closeTop()}
        >
          {#snippet children()}<GuestSheetBody guestId={top.guestId} />{/snippet}
        </MFull>
      {:else if top.type === "menu"}
        <MMenu
          {nav}
          onautoseat={() => nav.openLayer({ type: "autoseat" })}
          onhelp={() => (ui.panel = "help")}
          onrename={() => nav.openLayer({ type: "rename" })}
          onversions={() => (syncOpen = true)}
          onlock={lockPage}
        />
      {:else if top.type === "sort"}
        <MSortSheet {nav} />
      {:else if top.type === "filters"}
        <MFilterSheet {nav} />
      {:else if top.type === "stats"}
        <MStatsSheet {nav} />
      {:else if top.type === "rename"}
        <MRenameSheet {nav} />
      {:else if top.type === "addGuest"}
        <AddGuestDialog onclose={() => nav.closeTop()} />
      {:else if top.type === "autoseat"}
        <AutoSeatDialog onclose={() => nav.closeTop()} />
      {/if}
    {/key}
  {/if}

  <!-- Version history, driven by the top bar's status button and by the Menu. -->
  <SyncBadge {store} hideTrigger bind:open={syncOpen} />

  <HelpPopover />
  <ConfirmDialog />
  <Toasts />
</div>

<style>
  .m-root {
    position: fixed;
    top: var(--m-top, 0px);
    left: 0;
    right: 0;
    /* The visible viewport, measured. The static fallbacks are only for the
       first paint and for browsers without visualViewport. */
    height: 100%;
    height: -webkit-fill-available;
    height: 100dvh;
    height: var(--m-vh, 100dvh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    overscroll-behavior: none;
    /* Kills the double-tap-to-zoom delay without taking pinch zoom away. */
    touch-action: manipulation;
    background: radial-gradient(120% 90% at 50% -10%, #16212f 0%, #0b1320 55%, #070d16 100%);
  }
  .m-col {
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  /* Keyboard up: the A to Z rail has nowhere near enough height left for 26
     letters and collapses into an illegible smear. It is a shortcut, not a
     control, so it steps out until the keyboard does. */
  .m-root[data-keyboard="on"] :global(.mgl-rail) {
    display: none;
  }
  .m-main {
    flex: 1 1 auto;
    min-height: 0;
    position: relative;
  }
  /* The map is mounted once and never unmounted, so pan and zoom survive a trip
     to the guest list. `z-index: 0` gives it a stacking context of its own, so
     its floating controls cannot paint through the tab that covers it. */
  .m-map {
    position: absolute;
    inset: 0;
    z-index: 0;
  }
  .m-main > :global(:not(.m-map)) {
    z-index: 1;
  }

  .m-stats {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-height: 40px;
    padding: 0 14px 0 calc(14px + env(safe-area-inset-left));
    border: none;
    border-bottom: 1px solid rgba(228, 201, 138, 0.14);
    background: rgba(9, 15, 26, 0.9);
    color: #c6d0dc;
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .m-stats:active {
    background: rgba(255, 189, 89, 0.12);
  }
  .m-statsline {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .m-statsmore {
    flex: 0 0 auto;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gs-gold-soft);
  }

  .m-movebar {
    position: absolute;
    left: 10px;
    right: 10px;
    top: 10px;
    z-index: 18;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px 9px 13px;
    background: rgba(255, 189, 89, 0.95);
    border-radius: 3px;
    color: #17202c;
    box-shadow: 0 16px 40px -20px rgba(0, 0, 0, 0.9);
  }
  .m-movetext {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-size: 12.5px;
  }
  .m-movetext strong {
    font-size: 14.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .m-movecancel {
    flex: 0 0 auto;
    min-height: 44px;
    min-width: 80px;
    padding: 0 14px;
    border: 1px solid rgba(23, 32, 44, 0.4);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.55);
    color: #17202c;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }

  .m-mapctl {
    position: absolute;
    right: calc(10px + env(safe-area-inset-right));
    bottom: 12px;
    z-index: 16;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .m-ctl {
    width: 48px;
    height: 48px;
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--gs-line-strong);
    border-radius: 3px;
    background: rgba(11, 19, 32, 0.92);
    color: var(--gs-text);
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .m-ctl:active {
    background: rgba(255, 189, 89, 0.3);
  }
  .m-ctl--on {
    background: rgba(255, 189, 89, 0.22);
    color: var(--gs-gold-bright);
  }
  .m-ctl svg {
    width: 21px;
    height: 21px;
  }

  @media (orientation: landscape) and (max-height: 559px) {
    .m-root {
      flex-direction: row;
      padding-left: env(safe-area-inset-left);
    }
    .m-root :global(.mt) {
      order: -1;
    }
    .m-mapctl {
      bottom: 10px;
    }
  }
</style>
