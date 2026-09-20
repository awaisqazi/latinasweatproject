<!--
  The gate. One passcode opens the one shared plan.

  The check is NOT here: this component collects a passcode and hands it to
  gala_seating_verify, which compares it to a bcrypt hash inside Postgres. A
  static page in a public repo cannot keep a secret, so nothing in this file, or
  anywhere in the bundle, knows what the passcode is. Wrong tries are counted and
  throttled server side; after eight in ten minutes the slug locks for everyone.

  The passcode goes to sessionStorage, or to localStorage only when the planner
  ticks "Remember on this device". It never reaches a URL or a log line.

  By default this renders the form alone, because GalaSeatingApp already draws the
  cream invitation card around it. `standalone` draws the whole gate: navy floor,
  lattice, card and heading.
-->
<script>
  import { onMount } from "svelte";
  import {
    createRemote,
    DEFAULT_SLUG,
    forgetPasscode,
    recallEditor,
    recallPasscode,
    rememberEditor,
    rememberPasscode,
  } from "../../lib/galaSeating/remote.js";

  let { slug = DEFAULT_SLUG, standalone = false, onunlock = () => {} } = $props();

  let pass = $state("");
  let name = $state("");
  let remember = $state(false);
  let reveal = $state(false);
  /** idle | checking | wrong | locked | offline | missing-name */
  let state = $state("checking");
  let shake = $state(false);
  let passInput = $state(null);
  let nameInput = $state(null);

  const busy = $derived(state === "checking");

  const MESSAGES = {
    wrong: "That passcode is not right. Check it with whoever shared it.",
    locked: "Too many attempts. Try again in a few minutes.",
    offline: "Cannot reach the shared plan right now.",
    "missing-name": "Add your name so the team can see who made a change.",
  };
  const message = $derived(MESSAGES[state] || "");

  function reducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }

  onMount(async () => {
    name = recallEditor();
    const saved = recallPasscode();

    // Silent re-entry, but only when we also know who this planner is: a shared
    // plan with an anonymous editor helps nobody.
    if (saved && name.trim()) {
      const res = await unlock(saved, false, true);
      if (res) return;
    }

    state = "idle";
    queueMicrotask(() => (saved && !name.trim() ? nameInput : passInput)?.focus());
  });

  /** @returns {Promise<boolean>} true when the gate opened. */
  async function unlock(candidate, persist, silent) {
    const editor = name.trim().slice(0, 60);
    state = "checking";

    const remote = createRemote({ slug, passcode: candidate, editor });
    const res = await remote.verify();

    if (res.ok) {
      rememberPasscode(candidate, persist);
      rememberEditor(editor);
      onunlock({ remote, editor });
      return true;
    }

    if (res.reason === "locked") state = "locked";
    else if (res.reason === "offline") state = "offline";
    else {
      // A remembered passcode that stopped working (rotated) should not keep
      // failing silently on every load.
      if (silent) forgetPasscode();
      state = "wrong";
      pass = "";
      if (!reducedMotion()) {
        shake = true;
        setTimeout(() => (shake = false), 420);
      }
      queueMicrotask(() => passInput?.focus());
    }
    return false;
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      state = "missing-name";
      nameInput?.focus();
      return;
    }
    if (!pass) {
      state = "wrong";
      passInput?.focus();
      return;
    }
    await unlock(pass, remember, false);
  }

  function workOffline() {
    onunlock({ remote: null, editor: name.trim().slice(0, 60) || "This device" });
  }
</script>

{#snippet form()}
  <form class="gg-form" class:gg-shake={shake} onsubmit={submit} novalidate>
    <div class="gg-row">
      <label class="gg-label" for="gg-pass">Passcode</label>
      <div class="gg-input-wrap">
        <input
          id="gg-pass"
          class="gg-input gg-input--pass"
          type={reveal ? "text" : "password"}
          autocomplete="current-password"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          bind:value={pass}
          bind:this={passInput}
          disabled={busy}
          aria-invalid={state === "wrong"}
          aria-describedby="gg-status"
        />
        <button
          type="button"
          class="gg-reveal"
          aria-pressed={reveal}
          aria-label={reveal ? "Hide passcode" : "Show passcode"}
          onclick={() => (reveal = !reveal)}
        >
          {reveal ? "Hide" : "Show"}
        </button>
      </div>
    </div>

    <div class="gg-row">
      <label class="gg-label" for="gg-name">Your name</label>
      <input
        id="gg-name"
        class="gg-input"
        type="text"
        autocomplete="name"
        placeholder="So the team sees who moved a table"
        maxlength="60"
        bind:value={name}
        bind:this={nameInput}
        disabled={busy}
        aria-invalid={state === "missing-name"}
        aria-describedby="gg-status"
      />
    </div>

    <label class="gg-check">
      <input type="checkbox" bind:checked={remember} disabled={busy} />
      <span>Remember on this device</span>
    </label>

    <button type="submit" class="gg-submit gala-btn gala-btn--gold" disabled={busy}>
      {busy ? "Checking" : "Unlock"}
    </button>

    <p id="gg-status" class="gg-status" class:gg-status--bad={state !== "idle"} role="status" aria-live="polite">
      {message}
    </p>

    {#if state === "offline" || state === "locked"}
      <button type="button" class="gg-offline" onclick={workOffline}>
        Work offline on this device
      </button>
      <p class="gg-fine">Offline edits stay in this browser and do not reach the shared plan.</p>
    {/if}
  </form>
{/snippet}

{#if standalone}
  <div class="gg-gate">
    <div class="gg-lattice gala-lattice" aria-hidden="true"></div>
    <div class="gg-card">
      <div class="gg-frame" aria-hidden="true"></div>
      <p class="gg-eyebrow">The Latina Sweat Project</p>
      <h1 class="gg-title">Gala Seating</h1>
      <p class="gg-sub">Annual Gala · Museum of Contemporary Art Chicago</p>
      {@render form()}
    </div>
  </div>
{:else}
  {@render form()}
{/if}

<style>
  .gg-gate {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: 2rem 1rem;
    background: radial-gradient(120% 90% at 50% 0%, #111a27 0%, #0b1320 62%, #080e18 100%);
  }

  .gg-lattice {
    position: absolute;
    inset: 0;
    opacity: 0.07;
    pointer-events: none;
  }

  .gg-card {
    position: relative;
    width: 100%;
    max-width: 26rem;
    padding: 2.25rem 1.5rem 1.75rem;
    background: #fff8ef;
    color: #1e1e1e;
    border-radius: 3px;
    box-shadow: 0 30px 70px -30px rgb(0 0 0 / 0.75);
  }

  /* The engraved double hairline of a printed invitation. */
  .gg-frame {
    position: absolute;
    inset: 10px;
    border: 1px solid #b9842f;
    border-radius: 2px;
    pointer-events: none;
  }
  .gg-frame::after {
    content: "";
    position: absolute;
    inset: 4px;
    border: 1px solid rgb(228 201 138 / 0.75);
    border-radius: 1px;
  }

  .gg-eyebrow {
    margin: 0;
    text-align: center;
    font-size: 0.68rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #8a5700;
  }

  .gg-title {
    margin: 0.4rem 0 0;
    text-align: center;
    font-family: var(--font-display);
    font-style: italic;
    font-weight: 500;
    font-size: clamp(2rem, 9vw, 2.6rem);
    line-height: 1.05;
    color: #1e1e1e;
  }

  .gg-sub {
    margin: 0.5rem 0 1.5rem;
    text-align: center;
    font-size: 0.8rem;
    color: rgb(30 30 30 / 0.66);
  }

  .gg-form {
    display: grid;
    gap: 0.9rem;
  }

  .gg-row {
    display: grid;
    gap: 0.3rem;
  }

  .gg-label {
    font-size: 0.7rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgb(30 30 30 / 0.6);
  }

  .gg-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .gg-input {
    width: 100%;
    min-width: 0;
    padding: 0.62rem 0.7rem;
    font: inherit;
    font-size: 0.95rem;
    color: #1e1e1e;
    background: rgb(255 255 255 / 0.7);
    border: 1px solid rgb(30 30 30 / 0.28);
    border-radius: 2px;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }
  .gg-input--pass {
    padding-right: 3.6rem;
    letter-spacing: 0.08em;
  }
  .gg-input:focus-visible {
    outline: none;
    border-color: #b9842f;
    box-shadow: 0 0 0 3px rgb(185 132 47 / 0.22);
  }
  .gg-input[aria-invalid="true"] {
    border-color: #a3341f;
  }
  .gg-input::placeholder {
    color: rgb(30 30 30 / 0.38);
  }

  .gg-reveal {
    position: absolute;
    right: 0.35rem;
    padding: 0.3rem 0.45rem;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #8a5700;
    background: transparent;
    border: 0;
    border-radius: 2px;
    cursor: pointer;
  }
  .gg-reveal:hover {
    color: #1e1e1e;
  }
  .gg-reveal:focus-visible {
    outline: 2px solid #b9842f;
    outline-offset: 1px;
  }

  .gg-check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    color: rgb(30 30 30 / 0.75);
    cursor: pointer;
  }
  .gg-check input {
    width: 0.95rem;
    height: 0.95rem;
    accent-color: #b9842f;
  }

  .gg-submit {
    margin-top: 0.15rem;
    padding: 0.7rem 1rem;
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    border: 0;
    cursor: pointer;
  }
  .gg-submit:disabled {
    opacity: 0.65;
    cursor: progress;
  }

  .gg-status {
    min-height: 1.15rem;
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.35;
    color: rgb(30 30 30 / 0.6);
  }
  .gg-status--bad {
    color: #a3341f;
  }

  .gg-offline {
    justify-self: start;
    padding: 0;
    font-size: 0.82rem;
    color: #8a5700;
    background: none;
    border: 0;
    border-bottom: 1px solid currentColor;
    cursor: pointer;
  }

  .gg-fine {
    margin: 0;
    font-size: 0.72rem;
    color: rgb(30 30 30 / 0.5);
  }

  @media (prefers-reduced-motion: no-preference) {
    .gg-shake {
      animation: gg-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
    }
  }

  @keyframes gg-shake {
    10%, 90% { transform: translateX(-1px); }
    20%, 80% { transform: translateX(2px); }
    30%, 50%, 70% { transform: translateX(-4px); }
    40%, 60% { transform: translateX(4px); }
  }
</style>
