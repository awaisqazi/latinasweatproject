<!--
  The door to the door.

  A passcode and a first name, nothing else. The check is NOT here: the passcode
  goes to gala_checkin_unlock, which compares it to a bcrypt hash inside
  Postgres and answers with an 18 hour session token. A static page in a public
  repo cannot keep a secret, so nothing in this file, or anywhere in the bundle,
  knows what the passcode is.

  The passcode itself is NEVER stored. Only the token, in sessionStorage, and in
  localStorage only when the volunteer ticks "Keep this device unlocked
  tonight". No guest ever touches web storage.

  The card is cream on the navy floor: the gate is typeset as a printed
  invitation, and cream type on a dark panel loses the engraved keylines that
  make it read as one.
-->
<script>
  import { onMount } from "svelte";

  // `subtitle` and `submitLabel` are optional and default to the check-in desk's
  // own words, so the pledge terminal can stand behind the same door without
  // telling a clerk they are about to check somebody in.
  let {
    remote,
    onunlock = () => {},
    subtitle = "Volunteer check-in",
    submitLabel = "Start check-in",
  } = $props();

  let pass = $state("");
  let name = $state("");
  let keep = $state(false);
  let reveal = $state(false);
  /** idle | checking | bad-passcode | locked | missing-name | closed | offline */
  let state = $state("idle");
  let shake = $state(false);
  let passInput = $state(null);
  let nameInput = $state(null);

  const busy = $derived(state === "checking");

  const MESSAGES = {
    "bad-passcode": "That passcode is not right. Check it with whoever shared it.",
    locked: "Too many attempts. Try again in a few minutes.",
    "missing-name": "Add your first name so the team can see who checked a guest in.",
    closed: "Check-in is closed for the night.",
    offline: "Cannot reach the guest list right now. Check the signal and try again.",
    error: "Something went wrong. Try again.",
  };
  const message = $derived(MESSAGES[state] || "");

  function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
  }

  onMount(() => {
    // A returning volunteer keeps their name, never their passcode.
    try { name = remote?.actor || window.localStorage.getItem("lsp.galaCheckin.name") || ""; } catch { /* private mode */ }
  });

  async function submit(event) {
    event?.preventDefault();
    if (busy) return;
    if (!name.trim()) {
      state = "missing-name";
      nameInput?.focus();
      return;
    }
    if (!pass) {
      state = "bad-passcode";
      passInput?.focus();
      return;
    }

    state = "checking";
    const res = await remote.unlock({
      passcode: pass,
      name: name.trim().slice(0, 40),
      device: deviceLabel(),
      persist: keep,
    });

    if (res.ok) {
      pass = "";
      onunlock(res);
      return;
    }

    state = MESSAGES[res.reason] ? res.reason : res.transient ? "offline" : "error";
    if (state === "bad-passcode") {
      pass = "";
      if (!reducedMotion()) {
        shake = true;
        setTimeout(() => (shake = false), 420);
      }
      queueMicrotask(() => passInput?.focus());
    }
  }

  /** A hint for the lead's device list. No identifiers, nothing personal. */
  function deviceLabel() {
    try {
      const ua = navigator.userAgent || "";
      if (/iPad/.test(ua)) return "iPad";
      if (/iPhone/.test(ua)) return "iPhone";
      if (/Android/.test(ua)) return "Android phone";
      return "Laptop";
    } catch {
      return "";
    }
  }
</script>

<div class="cg">
  <div class="cg-lattice gala-lattice" aria-hidden="true"></div>

  <form class="cg-card" class:cg-shake={shake} onsubmit={submit} novalidate>
    <div class="cg-frame" aria-hidden="true"></div>

    <p class="cg-eyebrow">The Latina Sweat Project</p>
    <h1 class="cg-title">Annual Gala</h1>
    <p class="cg-sub">{subtitle}</p>

    <div class="cg-row">
      <label class="cg-label" for="cg-pass">Passcode</label>
      <div class="cg-wrap">
        <input
          id="cg-pass"
          class="cg-input cg-input--pass"
          type={reveal ? "text" : "password"}
          autocomplete="current-password"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="next"
          bind:value={pass}
          bind:this={passInput}
          disabled={busy}
          aria-invalid={state === "bad-passcode"}
          aria-describedby="cg-status"
        />
        <button
          type="button"
          class="cg-reveal"
          aria-pressed={reveal}
          aria-label={reveal ? "Hide passcode" : "Show passcode"}
          onclick={() => (reveal = !reveal)}
        >{reveal ? "Hide" : "Show"}</button>
      </div>
    </div>

    <div class="cg-row">
      <label class="cg-label" for="cg-name">Your first name</label>
      <input
        id="cg-name"
        class="cg-input"
        type="text"
        autocomplete="given-name"
        autocapitalize="words"
        autocorrect="off"
        spellcheck="false"
        enterkeyhint="go"
        placeholder="Goes next to every check-in you make"
        maxlength="40"
        bind:value={name}
        bind:this={nameInput}
        disabled={busy}
        aria-invalid={state === "missing-name"}
        aria-describedby="cg-status"
      />
    </div>

    <label class="cg-check">
      <input type="checkbox" bind:checked={keep} disabled={busy} />
      <span>Keep this device unlocked tonight</span>
    </label>

    <button type="submit" class="cg-submit" disabled={busy}>
      {busy ? "Checking" : submitLabel}
    </button>

    <p id="cg-status" class="cg-status" class:cg-status--bad={Boolean(message)} role="status" aria-live="polite">
      {message}
    </p>

    <p class="cg-fine">
      The guest list stays on the server. Nothing about a guest is saved to this phone.
    </p>
  </form>
</div>

<style>
  .cg {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: 2rem 1rem calc(2rem + env(safe-area-inset-bottom, 0px));
    background: radial-gradient(120% 90% at 50% 0%, #111a27 0%, #0b1320 62%, #080e18 100%);
  }
  .cg-lattice {
    position: absolute;
    inset: 0;
    opacity: 0.06;
    pointer-events: none;
  }

  .cg-card {
    position: relative;
    display: grid;
    gap: 0.9rem;
    width: 100%;
    max-width: 26rem;
    padding: 2.25rem 1.5rem 1.6rem;
    background: var(--g26-cream);
    color: #1e1e1e;
    border-radius: var(--g26-r-ctl);
    box-shadow: 0 30px 70px -30px rgb(0 0 0 / 0.8);
  }
  .cg-frame {
    position: absolute;
    inset: 10px;
    border: 1px solid var(--g26-gold-deep);
    border-radius: 2px;
    pointer-events: none;
  }
  .cg-frame::after {
    content: "";
    position: absolute;
    inset: 4px;
    border: 1px solid rgb(228 201 138 / 0.75);
    border-radius: 1px;
  }

  .cg-eyebrow {
    margin: 0;
    text-align: center;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.26em;
    text-transform: uppercase;
    color: var(--g26-gold-ink);
  }
  .cg-title {
    margin: 0.35rem 0 0;
    text-align: center;
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
    font-size: clamp(2rem, 9vw, 2.6rem);
    line-height: 1.05;
  }
  .cg-sub {
    margin: 0.35rem 0 0.9rem;
    text-align: center;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgb(30 30 30 / 0.55);
  }

  .cg-row {
    display: grid;
    gap: 0.3rem;
  }
  .cg-label {
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgb(30 30 30 / 0.6);
  }
  .cg-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  .cg-input {
    width: 100%;
    min-width: 0;
    /* 16px or iOS Safari magnifies the page the instant the field is tapped. */
    min-height: 52px;
    padding: 0.6rem 0.7rem;
    font: inherit;
    font-size: 16px;
    color: #1e1e1e;
    background: rgb(255 255 255 / 0.72);
    border: 1px solid rgb(30 30 30 / 0.28);
    border-radius: 2px;
  }
  .cg-input--pass {
    padding-right: 3.6rem;
    letter-spacing: 0.08em;
  }
  .cg-input:focus-visible {
    outline: none;
    border-color: var(--g26-gold-deep);
    box-shadow: 0 0 0 3px rgb(185 132 47 / 0.24);
  }
  .cg-input[aria-invalid="true"] {
    border-color: #a3341f;
  }
  .cg-input::placeholder {
    color: rgb(30 30 30 / 0.38);
  }

  .cg-reveal {
    position: absolute;
    right: 0.35rem;
    padding: 0.45rem 0.5rem;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--g26-gold-ink);
    background: transparent;
    border: 0;
    cursor: pointer;
  }

  .cg-check {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-height: 48px;
    font-size: 0.86rem;
    color: rgb(30 30 30 / 0.78);
    cursor: pointer;
  }
  .cg-check input {
    width: 22px;
    height: 22px;
    accent-color: var(--g26-gold-deep);
  }

  .cg-submit {
    min-height: 56px;
    font-family: var(--g26-sans);
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--g26-ink);
    background: var(--g26-gold);
    border: 1px solid var(--g26-gold-deep);
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }
  .cg-submit:disabled {
    opacity: 0.65;
    cursor: progress;
  }
  .cg-submit:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--g26-cream), 0 0 0 4px var(--g26-gold-deep);
  }

  .cg-status {
    min-height: 1.15rem;
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.4;
    color: rgb(30 30 30 / 0.6);
  }
  .cg-status--bad {
    color: #a3341f;
  }
  .cg-fine {
    margin: 0;
    font-size: 0.72rem;
    color: rgb(30 30 30 / 0.5);
  }

  @media (prefers-reduced-motion: no-preference) {
    .cg-shake {
      animation: cg-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
    }
  }
  @keyframes cg-shake {
    10%, 90% { transform: translateX(-1px); }
    20%, 80% { transform: translateX(2px); }
    30%, 50%, 70% { transform: translateX(-4px); }
    40%, 60% { transform: translateX(4px); }
  }
</style>
