<!--
  Gala Seating planner: the workspace root.

  Black-tie at the museum: a deep navy gallery floor, gold hairlines, cream
  stationery sheets. The plan is one shared live document; this component owns
  the store, the shared UI state, the keyboard shortcuts and the layout.

  PRIVACY: guest data stays in this browser and in LSP's passcode-protected
  database. Nothing here writes a guest to a URL.
-->
<script>
  import { onDestroy, onMount, setContext } from "svelte";
  import { createSeatingStore } from "../../lib/galaSeating/store.svelte.js";
  import { createUiState } from "./uiState.svelte.js";
  import { demoGuests } from "../../lib/galaSeating/demo.js";
  import PasscodeGate from "./PasscodeGate.svelte";
  import Toolbar from "./Toolbar.svelte";
  import StatsBar from "./StatsBar.svelte";
  import FloorPlan from "./FloorPlan.svelte";
  import GuestList from "./GuestList.svelte";
  import GuestSheet from "./GuestSheet.svelte";
  import TableSheet from "./TableSheet.svelte";
  import WarningsPanel from "./WarningsPanel.svelte";
  import HelpPopover from "./HelpPopover.svelte";
  import AutoSeatDialog from "./AutoSeatDialog.svelte";
  import Toasts from "./Toasts.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import MShell from "./MShell.svelte";

  const store = createSeatingStore();
  const ui = createUiState(store);
  setContext("gala-seating", { store, ui });

  /**
   * Phone and tablet get a different information architecture, not a squeezed
   * copy of the desktop one: full-screen tabs and a bottom bar instead of a
   * slide-over list and a toolbar that scrolls sideways.
   *
   * Computed synchronously, because children mount before this component's
   * onMount and a phone must never render the desktop layout first.
   */
  const MOBILE_QUERY = "(max-width: 1023px), (pointer: coarse) and (max-height: 599px)";
  function measureMobile() {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.(MOBILE_QUERY).matches ?? window.innerWidth < 1024;
  }
  let mobile = $state(measureMobile());
  const wide = $derived(!mobile);

  let unlocked = $state(false);
  let gateChecked = $state(false);
  // Development builds only: `?plan=sandbox-abc` points the page at a rehearsal plan so realtime can be
  // tested without touching the real one. Read synchronously, because the gate tries a remembered
  // passcode as soon as it mounts. The DEV guard strips this from production.
  const devSlug = (() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return "";
    const v = new URLSearchParams(window.location.search).get("plan") || "";
    return /^[a-z0-9-]{3,40}$/.test(v) ? v : "";
  })();
  let showAutoSeat = $state(false);

  const guestCount = $derived(Object.keys(store.plan.guests).length);
  const isEmpty = $derived(guestCount === 0);

  function handleUnlock(detail) {
    const remote = detail?.remote || null;
    const editor = detail?.editor || "";
    unlocked = true;
    if (remote) store.attachRemote(remote, editor);
    else store.startLocalOnly();
  }

  function workLocally() {
    store.startLocalOnly();
    unlocked = true;
  }

  function loadDemo() {
    store.loadDemo(demoGuests());
  }

  function onKeydown(event) {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

    if (event.key === "Escape") {
      if (ui.drag) return;
      if (showAutoSeat) showAutoSeat = false;
      else if (ui.openGuestId || ui.openTableId) ui.closeSheets();
      else if (ui.panel !== "none") ui.panel = "none";
      else ui.clearSelection();
      return;
    }
    if (typing) return;

    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (meta && event.key.toLowerCase() === "y") {
      event.preventDefault();
      store.redo();
      return;
    }
    if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
      event.preventDefault();
      ui.panel = ui.panel === "help" ? "none" : "help";
      return;
    }
    if (event.key === "/") {
      event.preventDefault();
      ui.focusSearch();
    }
  }

  function onResize() {
    mobile = measureMobile();
  }

  /**
   * Desktop only: the details drawer covers 400px of the right-hand wall, so
   * the camera aims at what is left. The phone shell reports its own insets.
   */
  $effect(() => {
    if (mobile) return;
    const covered = Boolean(ui.openGuestId || ui.openTableId || ui.panel !== "none");
    ui.setViewInsets(covered ? { right: 400 } : {});
  });

  onMount(() => {
    store.start();
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeydown);

    // Dev / offline bypass. Local-only: it never touches the shared plan.
    const params = new URLSearchParams(window.location.search);
    if (params.get("local") === "1") {
      workLocally();
      // Local mode only, for trying the tool and for screenshots: seed the
      // invented demo list without a click. It never touches the shared plan.
      if (params.get("demo") === "1" && Object.keys(store.plan.guests).length === 0) loadDemo();
    }
    gateChecked = true;

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeydown);
    };
  });

  onDestroy(() => store.destroy());
</script>

<div class="gs-root">
  <div class="gs-lattice gala-lattice" aria-hidden="true"></div>

  {#if !unlocked}
    <div class="gs-gatewrap">
      <div class="gs-gatecard">
        <p class="gs-eyebrow">The Latina Sweat Project</p>
        <h1 class="gs-gatetitle">Gala <span class="gala-foil">Seating</span></h1>
        <p class="gs-gatesub">
          Dinner seating for the Annual Gala at the Museum of Contemporary Art Chicago. One shared
          plan, edited live by the planning team.
        </p>
        <div class="gs-gateslot">
          <PasscodeGate slug={devSlug || undefined} onunlock={handleUnlock} />
        </div>
        {#if gateChecked}
          <p class="gs-gatefoot">
            <button type="button" class="gs-linkbtn" onclick={workLocally}>Work offline on this device</button>
            <span class="gs-dim"> · nothing you do offline reaches the shared plan.</span>
          </p>
        {/if}
        <p class="gs-privacy">
          Guest data is private: it lives in this browser and in LSP's passcode-protected database.
        </p>
      </div>
    </div>
  {:else if mobile && !isEmpty}
    <MShell />
  {:else}
    <div class="gs-shell">
      {#if !mobile}
        <Toolbar onautoseat={() => (showAutoSeat = true)} />
        <StatsBar />
      {/if}

      {#if store.saveError}
        <p class="gs-banner gs-banner--bad" role="status">{store.saveError}</p>
      {/if}
      {#if store.foreignEdit}
        <p class="gs-banner" role="status">
          Another tab on this device saved a different plan.
          <button type="button" class="gs-linkbtn" onclick={() => store.acceptForeignEdit()}>Load it</button>
          <span class="gs-dim">·</span>
          <button type="button" class="gs-linkbtn" onclick={() => store.keepMineOverForeign()}>Keep mine</button>
        </p>
      {/if}

      {#if isEmpty}
        <div class="gs-empty">
          <div class="gs-emptycard">
            <p class="gs-eyebrow">Annual Gala · Museum of Contemporary Art Chicago</p>
            <h2 class="gs-emptytitle">The room is set, the guest list is not.</h2>
            {#if store.isLocalOnly}
              <p class="gs-emptybody">
                You are working offline on this device. Load the invented demo list to try every
                part of the planner: drag guests into seats, rearrange the room, run auto-seat.
              </p>
              <div class="gs-emptyactions">
                <button type="button" class="gala-btn gala-btn--gold gs-cta" onclick={loadDemo}>
                  Load demo guests
                </button>
              </div>
              <p class="gs-dim gs-emptynote">Demo names are invented. No real guest data is ever stored in this page.</p>
            {:else}
              <p class="gs-emptybody">
                The guest list has not been loaded yet. Ask the site maintainer to seed the ticket
                and dinner data, then refresh: it will appear here for everyone at once.
              </p>
            {/if}
          </div>
        </div>
      {:else}
        <!-- Desktop workspace. The phone never reaches here: MShell owns it. -->
        <main class="gs-workspace">
          <aside class="gs-sidebar"><GuestList mode="sidebar" /></aside>
          <div class="gs-floorwrap">
            <FloorPlan />
          </div>
        </main>
      {/if}

      <p class="gs-privacy gs-privacy--footer">
        Guest data is private: it lives in this browser and in LSP's passcode-protected database.
      </p>
    </div>

    <GuestSheet />
    <TableSheet />
    <WarningsPanel />
    <HelpPopover />
    <ConfirmDialog />
    <Toasts />
    {#if showAutoSeat}
      <AutoSeatDialog onclose={() => (showAutoSeat = false)} />
    {/if}
  {/if}
</div>

<style>
  /* ---------- tokens ---------- */
  :global(.gs-root) {
    --gs-floor-0: #0b1320;
    --gs-floor-1: #111a27;
    --gs-floor-2: #16212f;
    --gs-line: rgba(228, 201, 138, 0.22);
    --gs-line-strong: rgba(255, 189, 89, 0.55);
    --gs-gold: #b9842f;
    --gs-gold-bright: #ffbd59;
    --gs-gold-soft: #e4c98a;
    --gs-cream: #fff8ef;
    --gs-ink: #17202c;
    --gs-text: #f3ece1;
    --gs-dim: #a9b4c2;
    --gs-ok: #6fbf8b;
    --gs-warn: #e2a33c;
    --gs-error: #e06a5a;
    --gs-meal-short-rib: #d07a4e;
    --gs-meal-whitefish: #7fb4d6;
    --gs-meal-ravioli: #8fc07a;
    --gs-meal-none: #8794a5;

    position: relative;
    min-height: 100vh;
    min-height: 100dvh;
    background:
      radial-gradient(120% 90% at 50% -10%, #16212f 0%, var(--gs-floor-0) 55%, #070d16 100%);
    color: var(--gs-text);
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    font-size: 14px;
    overflow: hidden;
  }

  .gs-lattice {
    position: absolute;
    inset: 0;
    opacity: 0.04;
    pointer-events: none;
  }

  /* ---------- gate ---------- */
  .gs-gatewrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    min-height: 100dvh;
    padding: 24px 16px;
  }
  .gs-gatecard {
    width: 100%;
    max-width: 520px;
    border: 1px solid var(--gs-line);
    background: rgba(11, 19, 32, 0.82);
    box-shadow: 0 30px 80px -40px rgba(0, 0, 0, 0.9);
    padding: 34px 26px 26px;
    text-align: center;
  }
  .gs-eyebrow {
    margin: 0;
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--gs-gold-soft);
  }
  .gs-gatetitle {
    margin: 12px 0 10px;
    font-family: "Playfair Display", Georgia, serif;
    font-style: italic;
    font-weight: 600;
    font-size: 40px;
    line-height: 1.05;
    color: var(--gs-cream);
  }
  .gs-gatesub {
    margin: 0 auto 20px;
    max-width: 40ch;
    color: var(--gs-dim);
    line-height: 1.55;
  }
  /* PasscodeGate is typeset for a cream card (dark ink), so give it one: an engraved
     invitation panel inside the navy gate. Without this its labels vanish on navy. */
  .gs-gateslot {
    margin-top: 1.75rem;
    padding: 1.5rem 1.4rem 1.6rem;
    background: #fff8ef;
    color: #1e1e1e;
    text-align: left;
    box-shadow: 0 0 0 1px #e4c98a, 0 0 0 5px #fff8ef, 0 0 0 6px rgb(185 132 47 / 0.55);
  }
  .gs-gatefoot {
    margin: 10px 0 0;
    font-size: 13px;
  }
  .gs-privacy {
    margin: 18px 0 0;
    font-size: 12px;
    color: #8f9bab;
    line-height: 1.5;
  }
  .gs-privacy--footer {
    flex: 0 0 auto;
    padding: 6px 14px 8px;
    margin: 0;
    text-align: center;
    border-top: 1px solid rgba(228, 201, 138, 0.1);
  }
  @media (max-width: 1023px) {
    .gs-privacy--footer {
      padding: 4px 10px 5px;
      font-size: 10px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  /* ---------- shell ---------- */
  .gs-shell {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
  }
  .gs-workspace {
    flex: 1 1 auto;
    min-height: 0;
    position: relative;
    display: flex;
  }
  .gs-sidebar {
    flex: 0 0 340px;
    min-width: 0;
    border-right: 1px solid rgba(228, 201, 138, 0.16);
    background: rgba(8, 14, 24, 0.72);
    display: flex;
    flex-direction: column;
  }
  .gs-floorwrap {
    flex: 1 1 auto;
    min-width: 0;
    position: relative;
  }
  .gs-guestsbtn {
    position: absolute;
    left: 10px;
    bottom: 10px;
    z-index: 16;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 46px;
    padding: 0 14px;
    border-radius: 3px;
    border: 1px solid var(--gs-line-strong);
    background: rgba(255, 189, 89, 0.92);
    color: #17202c;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 14px 34px -18px rgba(0, 0, 0, 0.9);
  }
  .gs-guestsn {
    font-weight: 400;
    font-size: 11px;
    opacity: 0.8;
  }
  .gs-drawerscrim {
    position: fixed;
    inset: 0;
    z-index: 59;
    background: rgba(4, 8, 14, 0.55);
  }

  .gs-banner {
    flex: 0 0 auto;
    margin: 0;
    padding: 7px 14px;
    font-size: 12.5px;
    background: rgba(255, 189, 89, 0.1);
    border-bottom: 1px solid var(--gs-line);
    color: var(--gs-gold-soft);
  }
  .gs-banner--bad {
    background: rgba(224, 106, 90, 0.14);
    color: #ffd9d2;
    border-bottom-color: rgba(224, 106, 90, 0.4);
  }

  /* ---------- empty state ---------- */
  .gs-empty {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
  }
  .gs-emptycard {
    max-width: 560px;
    text-align: center;
    border: 1px solid var(--gs-line);
    background: rgba(11, 19, 32, 0.8);
    padding: 34px 26px;
  }
  .gs-emptytitle {
    margin: 12px 0 12px;
    font-family: "Playfair Display", Georgia, serif;
    font-style: italic;
    font-weight: 600;
    font-size: 30px;
    line-height: 1.15;
    color: var(--gs-cream);
  }
  .gs-emptybody {
    margin: 0 auto;
    max-width: 46ch;
    color: var(--gs-dim);
    line-height: 1.6;
  }
  .gs-emptyactions {
    margin-top: 22px;
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }
  .gs-emptynote {
    margin-top: 14px;
    font-size: 12px;
  }
  :global(.gs-cta) {
    min-height: 46px;
    padding: 0 22px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
  }

  /* ---------- shared widgets (global: used by every child) ---------- */
  :global(.gs-dim) {
    color: var(--gs-dim);
  }
  :global(.gs-linkbtn) {
    background: none;
    border: none;
    padding: 0;
    color: var(--gs-gold-bright);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    font: inherit;
  }
  :global(.gs-linkbtn:hover) {
    color: var(--gs-cream);
  }
  :global(.gs-btn) {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 10px;
    border-radius: 3px;
    border: 1px solid rgba(228, 201, 138, 0.3);
    background: rgba(255, 255, 255, 0.035);
    color: var(--gs-text);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease;
  }
  :global(.gs-btn:hover:not(:disabled)) {
    border-color: var(--gs-line-strong);
    background: rgba(255, 189, 89, 0.1);
  }
  :global(.gs-btn:disabled) {
    opacity: 0.4;
    cursor: default;
  }
  :global(.gs-btn--gold) {
    background: var(--gs-gold-bright);
    border-color: var(--gs-gold-bright);
    color: #17202c;
    font-weight: 700;
  }
  :global(.gs-btn--gold:hover:not(:disabled)) {
    background: #ffd08a;
    border-color: #ffd08a;
  }
  :global(.gs-btn--danger) {
    border-color: rgba(224, 106, 90, 0.5);
    color: #ffc9c0;
  }
  :global(.gs-btn--danger:hover:not(:disabled)) {
    background: rgba(224, 106, 90, 0.16);
    border-color: #e06a5a;
  }
  :global(.gs-btn--on) {
    background: rgba(255, 189, 89, 0.16);
    border-color: var(--gs-line-strong);
    color: var(--gs-cream);
  }
  :global(.gs-icon) {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
  }
  :global(.gs-root button:focus-visible),
  :global(.gs-root [tabindex]:focus-visible),
  :global(.gs-root input:focus-visible),
  :global(.gs-root select:focus-visible),
  :global(.gs-root textarea:focus-visible) {
    outline: 2px solid var(--gs-gold-bright);
    outline-offset: 2px;
  }
  /* Buttons sitting on a cream stationery surface flip to ink on cream. */
  :global(.gs-sheet .gs-btn),
  :global(.gs-root .gs-btn--onlight) {
    border-color: rgba(23, 32, 44, 0.28);
    background: #fffdf9;
    color: var(--gs-ink);
  }
  :global(.gs-sheet .gs-btn:hover:not(:disabled)) {
    background: rgba(255, 189, 89, 0.3);
    border-color: var(--gs-gold);
  }
  :global(.gs-sheet .gs-btn--gold) {
    background: var(--gs-gold-bright);
    border-color: var(--gs-gold);
  }
  :global(.gs-sheet .gs-btn--danger) {
    border-color: rgba(176, 73, 59, 0.6);
    color: #8c2f22;
  }
  :global(.gs-sheet .gs-btn--danger:hover:not(:disabled)) {
    background: rgba(224, 106, 90, 0.16);
  }
  :global(.gs-input) {
    width: 100%;
    min-height: 38px;
    padding: 8px 10px;
    border-radius: 3px;
    border: 1px solid rgba(23, 32, 44, 0.25);
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 13.5px;
  }
  :global(.gs-sheet .gs-input) {
    border-color: rgba(23, 32, 44, 0.28);
  }
  :global(.gs-pill) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 2px;
    border: 1px solid currentColor;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  :global(.gs-dot) {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
    display: inline-block;
  }
  :global(.gs-scroll) {
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: rgba(228, 201, 138, 0.35) transparent;
  }
  :global(.gs-scroll::-webkit-scrollbar) {
    width: 9px;
  }
  :global(.gs-scroll::-webkit-scrollbar-thumb) {
    background: rgba(228, 201, 138, 0.28);
    border-radius: 6px;
  }
  :global(.gs-serif) {
    font-family: "Playfair Display", Georgia, serif;
    font-style: italic;
    font-weight: 600;
  }
  :global(.gs-hairline) {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(228, 201, 138, 0.45), transparent);
    border: 0;
    margin: 14px 0;
  }
  @media (max-width: 1023px), (pointer: coarse) and (max-height: 599px) {
    :global(.gs-root) {
      /* No double-tap zoom anywhere in the app. Pinch zoom is untouched:
         taking it away would fail WCAG and the floor needs it. */
      touch-action: manipulation;
    }
    :global(.gs-root button),
    :global(.gs-root [role="button"]) {
      min-height: 44px;
    }
    :global(.gs-root .gs-btn) {
      min-height: 44px;
      padding: 0 12px;
    }

    /*
     * THE 16px RULE, and it is a rule.
     *
     * iOS Safari zooms the whole page when a focused form control is smaller
     * than 16px, and a zoomed page pushes the controls that close the current
     * screen out of the viewport. That is how the guest drawer became a trap:
     * a 13px search box, one tap, and the Close button was somewhere above the
     * status bar. Every control in every dialog is held at 16px here so no
     * component can reintroduce it by forgetting.
     */
    :global(.gs-root input),
    :global(.gs-root select),
    :global(.gs-root textarea) {
      font-size: 16px;
    }
    :global(.gs-root input[type="checkbox"]),
    :global(.gs-root input[type="radio"]) {
      width: 22px;
      height: 22px;
    }
    /* Roomier hit targets inside the cream dialogs. */
    :global(.gs-root .gs-input) {
      min-height: 46px;
    }
  }
</style>
