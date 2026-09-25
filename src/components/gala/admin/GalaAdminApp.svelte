<!--
  /gala/admin: one phone page for the organizer on gala night.

  Same door as /gala/control: the event's ADMIN passcode goes to
  gala_checkin_unlock once and comes back as an 18 hour session token (the
  passcode is never stored; "remember this device" keeps the token). The token
  slot is the one /gala/control, /gala/pledges and the check-in desk share, so
  a device that already unlocked any of them with the admin passcode opens
  straight into the tabs.

  Tabs, pinned at the top:
    Control  the run of show (ProgramControl) with the Record-a-gift panel
    Pledges  the pledge terminal (PledgeTerminal), primary screen = the same panel
    Tools    paddle pool, display key, check-in numbers, links

  One check-in store, one terminal store, one Realtime channel for the whole
  page: the gift panel on Control and the terminal on Pledges share a queue and
  a tape. Only the active tab is mounted (the terminal owns window keys).

  PRIVACY: this repo is public and the page ships empty. Guests and gifts come
  from the passcode-protected RPCs at run time.
-->
<script>
  import { onDestroy, onMount, setContext } from "svelte";
  import { createCheckinRemote, newOpId, DEFAULT_EVENT } from "../../../lib/galaCheckin/remote.js";
  import { createCheckinStore } from "../../../lib/galaCheckin/store.svelte.js";
  import { createTerminalStore } from "../../../lib/galaTerminal/store.svelte.js";
  import { createCheckinUi } from "../../galacheckin/uiState.svelte.js";
  import ProgramControl from "../control/ProgramControl.svelte";
  import PledgeTerminal from "../../galaterminal/PledgeTerminal.svelte";
  import AdminTools from "./AdminTools.svelte";

  const TABS = [
    { id: "control", label: "Control" },
    { id: "pledges", label: "Pledges" },
    { id: "tools", label: "Tools" },
  ];

  function pickEvent() {
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("event") || "";
      if (/^[a-z0-9][a-z0-9-]{0,79}$/.test(v)) return v;
    }
    return DEFAULT_EVENT;
  }
  const event = pickEvent();
  const remote = createCheckinRemote({ event });
  const checkin = createCheckinStore();
  const terminal = createTerminalStore({ scope: "admin" });
  setContext("gala-checkin", { store: checkin, ui: createCheckinUi(checkin) });

  function tabFromHash() {
    const h = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
    return TABS.some((t) => t.id === h) ? h : "control";
  }
  let tab = $state(tabFromHash());
  function show(id) {
    tab = id;
    try {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
    } catch {
      /* fine */
    }
    window.scrollTo(0, 0);
  }

  /* ---------------- gate ---------------- */
  let phase = $state("checking"); // checking | gate | loading | ready
  let pass = $state("");
  let who = $state("");
  let remember = $state(true);
  let gateBusy = $state(false);
  let gateError = $state("");

  const GATE_TEXT = {
    "bad-passcode": "That passcode did not work.",
    locked: "Too many tries from this network. Wait ten minutes, or use the ops console.",
    "missing-name": "Add your first name.",
    closed: "This event is closed.",
    offline: "No connection. Try again.",
  };

  async function open() {
    phase = "loading";
    const res = await checkin.attach(remote);
    if (!res?.ok && !res?.transient) {
      gateError = "Your session ended. Unlock again.";
      phase = "gate";
      return;
    }
    await terminal.attach({ checkin, remote });
    phase = "ready";
  }

  async function unlock(e) {
    e?.preventDefault();
    if (gateBusy) return;
    gateError = "";
    if (!pass.trim()) return (gateError = "Enter the admin passcode.");
    if (!who.trim()) return (gateError = GATE_TEXT["missing-name"]);
    gateBusy = true;
    const res = await remote.unlock({ passcode: pass.trim(), name: who.trim(), device: "gala-admin", persist: remember });
    gateBusy = false;
    pass = "";
    if (!res.ok) return (gateError = GATE_TEXT[res.reason] || `Could not unlock (${res.reason || "error"}).`);
    if (res.role !== "admin") {
      await remote.logout();
      gateError = "That passcode opens the door desk. This page needs the admin passcode.";
      return;
    }
    await open();
  }

  async function lock(reason) {
    terminal.stop();
    checkin.stop();
    if (reason === "signout") {
      await remote.logout();
      gateError = "";
    } else {
      gateError = reason === "forbidden" ? "This session cannot change the screen. Unlock with the admin passcode." : "Your session ended. Unlock again.";
    }
    phase = "gate";
  }

  // A revoked, expired or rotated session lands back on the gate.
  $effect(() => {
    if (phase === "ready" && checkin.sync.status === "locked") void lock("expired");
  });

  onMount(() => {
    const onHash = () => (tab = tabFromHash());
    window.addEventListener("hashchange", onHash);
    (async () => {
      if (!remote.hasToken) {
        phase = "gate";
        return;
      }
      // A remembered session: prove it is an ADMIN one without changing
      // anything (an empty patch answers "nothing-to-change" only after auth).
      const res = await remote.displaySet(newOpId(), {});
      if (res?.reason === "nothing-to-change") await open();
      else {
        phase = "gate";
        if (res?.transient) gateError = "No connection yet. You can still unlock when it returns.";
      }
    })();
    return () => window.removeEventListener("hashchange", onHash);
  });

  onDestroy(() => {
    terminal.stop();
    checkin.stop();
  });
</script>

<div class="ga" class:pledges={phase === "ready" && tab === "pledges"}>
  {#if phase === "checking" || phase === "loading"}
    <div class="boot">
      <p class="boot-title">Annual Gala</p>
      <p class="boot-sub">{phase === "loading" ? "Opening the guest list and the tape" : "Checking this device"}</p>
    </div>
  {:else if phase === "gate"}
    <form class="gate" onsubmit={unlock}>
      <div class="eyebrow">Annual Gala</div>
      <h1 class="serif">Gala admin</h1>
      <p class="muted">Show control, pledges and night-of tools in one place. Admin passcode only.</p>
      <label>
        <span>Admin passcode</span>
        <input type="password" autocomplete="current-password" bind:value={pass} />
      </label>
      <label>
        <span>Your first name</span>
        <input type="text" autocomplete="given-name" maxlength="40" bind:value={who} />
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={remember} />
        <span>Remember this device for tonight</span>
      </label>
      {#if gateError}<p class="err">{gateError}</p>{/if}
      <button class="primary" type="submit" disabled={gateBusy}>{gateBusy ? "Unlocking…" : "Unlock"}</button>
      {#if event !== DEFAULT_EVENT}<p class="muted small">Event: {event}</p>{/if}
    </form>
  {:else}
    <nav class="tabs" aria-label="Gala admin">
      {#each TABS as t (t.id)}
        <button class="tab" class:on={tab === t.id} aria-current={tab === t.id ? "page" : undefined} onclick={() => show(t.id)}>
          {t.label}
          {#if t.id === "pledges" && terminal.queued.length}<span class="dot">{terminal.queued.length}</span>{/if}
        </button>
      {/each}
    </nav>

    {#if tab === "control"}
      <div class="pane">
        <ProgramControl {remote} {checkin} {terminal} onLock={lock} />
      </div>
    {:else if tab === "pledges"}
      <div class="pane-fixed">
        <PledgeTerminal store={terminal} />
      </div>
    {:else}
      <div class="pane">
        <AdminTools {remote} {checkin} {event} onLock={lock} />
      </div>
    {/if}
  {/if}
</div>

<style>
  /* The 2026 token block (docs/gala-2026/04-theme-design-spec.md s2.6), as
     GalaTerminalApp declares it: the check-in components on the Pledges tab
     (SyncPill, NoticeStack, sheets) read these. */
  .ga {
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

    min-height: 100vh;
    min-height: 100dvh;
    color: var(--g26-text);
    font-family: var(--g26-sans);
    background: var(--g26-night);
  }
  .ga :global(*) {
    box-sizing: border-box;
  }
  .ga.pledges {
    height: 100dvh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .tabs {
    position: sticky;
    top: 0;
    z-index: 30;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: max(8px, env(safe-area-inset-top)) 12px 8px;
    background: rgb(11 19 32 / 0.97);
    border-bottom: 1px solid var(--g26-line-strong);
    flex: none;
  }
  .tab {
    position: relative;
    min-height: 48px;
    border-radius: var(--g26-r-ctl);
    border: 1px solid rgb(255 189 89 / 0.4);
    background: var(--g26-navy-2);
    color: var(--g26-cream);
    font: 800 15px var(--g26-sans);
    letter-spacing: 0.04em;
    cursor: pointer;
  }
  .tab.on {
    background: var(--g26-gold);
    border-color: var(--g26-gold);
    color: var(--g26-ink);
  }
  .dot {
    position: absolute;
    top: -6px;
    right: -4px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 20px;
    color: var(--g26-ink);
    background: var(--g26-alert);
  }
  .pane {
    max-width: 560px;
    margin: 0 auto;
  }
  .pane-fixed {
    flex: 1;
    min-height: 0;
  }

  .boot {
    display: grid;
    place-content: center;
    gap: 6px;
    min-height: 100dvh;
    text-align: center;
  }
  .boot-title {
    margin: 0;
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: 32px;
    color: var(--g26-gold);
  }
  .boot-sub {
    margin: 0;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--g26-dim);
  }

  .gate {
    max-width: 440px;
    margin: 0 auto;
    padding: 40px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .gate h1 {
    margin: 0;
    font-size: 40px;
    color: var(--g26-cream);
  }
  .serif {
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
  }
  .eyebrow {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--g26-gold);
  }
  .muted {
    margin: 0;
    color: var(--g26-dim);
    line-height: 1.4;
  }
  .small {
    font-size: 13px;
  }
  .err {
    margin: 0;
    color: var(--g26-alert);
    font-size: 14px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: var(--g26-muted);
  }
  input {
    width: 100%;
    min-height: 50px;
    padding: 0 12px;
    border-radius: var(--g26-r-ctl);
    border: 1px solid rgb(228 201 138 / 0.3);
    background: var(--g26-navy-2);
    color: var(--g26-cream);
    font: 600 17px var(--g26-sans);
  }
  input:focus {
    outline: none;
    border-color: var(--g26-gold);
    box-shadow: var(--g26-focus);
  }
  .check {
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
    font-weight: 500;
  }
  .check input {
    width: 22px;
    min-height: 22px;
    height: 22px;
    margin: 0;
    accent-color: var(--g26-gold);
    flex: 0 0 auto;
  }
  .primary {
    min-height: 54px;
    border: 0;
    border-radius: var(--g26-r-ctl);
    background: var(--g26-gold);
    color: var(--g26-ink);
    font: 800 17px var(--g26-sans);
    cursor: pointer;
  }
  .primary:disabled {
    opacity: 0.5;
  }
</style>
