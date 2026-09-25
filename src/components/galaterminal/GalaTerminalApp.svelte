<!--
  The standalone pledge terminal at /gala/pledges.

  Same door as the check-in desk: a passcode and a first name go to
  `gala_checkin_unlock`, which answers with an 18 hour session token. Any valid
  session can key a pledge; only an admin session can move the level on the big
  screen, and the level bar says which one this is.

  This component owns the two stores and nothing else. The check-in store is
  here for three reasons and only three:

    1. it holds the ONE Realtime channel this tab is allowed to open, so the
       terminal's doorbell rides along with it;
    2. it loads the guest roster, which is the paddle to name lookup the clerk
       reads out loud;
    3. its notices, sync pill and sheets are already built and already tested.

  PRIVACY: this repo is public. The page ships empty. Every guest and every
  gift comes from LSP's passcode-protected database at run time, and the only
  thing this device writes to disk is the session token and a queue of
  paddle numbers and amounts with no names attached.
-->
<script>
  import { onDestroy, onMount, setContext } from "svelte";

  import { createCheckinStore } from "../../lib/galaCheckin/store.svelte.js";
  import { createCheckinRemote, DEFAULT_EVENT } from "../../lib/galaCheckin/remote.js";
  import { createTerminalStore } from "../../lib/galaTerminal/store.svelte.js";
  import { createCheckinUi } from "../galacheckin/uiState.svelte.js";
  import CheckinGate from "../galacheckin/CheckinGate.svelte";
  import PledgeTerminal from "./PledgeTerminal.svelte";

  let { event = DEFAULT_EVENT } = $props();

  /**
   * Development builds only: `?event=test-term-g6` points the terminal at a
   * throwaway event so two tabs can be driven against each other without
   * touching gala night. Computed SYNCHRONOUSLY, because the gate mounts before
   * onMount and needs the slug to look for a saved token. The DEV guard strips
   * it from the production build.
   */
  const slug = (() => {
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("event") || "";
      if (/^[a-z0-9-]{3,40}$/.test(v)) return v;
    }
    return event;
  })();

  const checkin = createCheckinStore();
  const terminal = createTerminalStore();
  const remote = createCheckinRemote({ event: slug });
  setContext("gala-checkin", { store: checkin, ui: createCheckinUi(checkin) });

  /** gate | loading | app */
  let phase = $state(remote.hasToken ? "loading" : "gate");
  let problem = $state("");

  async function open() {
    phase = "loading";
    problem = "";
    const res = await checkin.attach(remote);
    if (!res.ok) {
      phase = "gate";
      return;
    }
    const tape = await terminal.attach({ checkin, remote });
    if (!tape.ok && !["offline", "retry"].includes(tape.reason)) {
      problem = terminal.reasonText(tape.reason);
      phase = "gate";
      return;
    }
    phase = "app";
  }

  onMount(() => {
    if (phase === "loading") void open();
  });

  onDestroy(() => {
    terminal.stop();
    checkin.stop();
  });

  // A revoked, expired or rotated session lands back on the gate at the next
  // call, wherever in the terminal the clerk happens to be.
  $effect(() => {
    if (phase === "app" && checkin.sync.status === "locked") phase = "gate";
  });
</script>

<div class="gc">
  {#if phase === "gate"}
    <CheckinGate {remote} onunlock={open} subtitle="Pledge terminal" submitLabel="Open the terminal" />
    {#if problem}<p class="gc-problem" role="alert">{problem}</p>{/if}
  {:else if phase === "loading"}
    <div class="gc-boot">
      <p class="gc-boot-title">Annual Gala</p>
      <p class="gc-boot-sub">Opening the tape</p>
    </div>
  {:else}
    <PledgeTerminal store={terminal} />
  {/if}
</div>

<style>
  /* The same token block the check-in desk declares on `.gc`. Svelte scopes
     styles per component, so it is repeated rather than shared: a public
     stylesheet is the one place these must never live. */
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

    height: 100dvh;
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

  .gc-problem {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: 12px;
    margin: 0;
    padding: 12px;
    text-align: center;
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-ink);
    background: var(--g26-alert);
    border-radius: var(--g26-r-card);
  }
</style>
