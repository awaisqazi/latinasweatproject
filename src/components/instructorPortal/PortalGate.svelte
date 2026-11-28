<!--
  The gate. One passcode field and "Remember this device".

  The check is NOT here: unlockPortal sends the passcode to an RPC that compares
  it with a bcrypt hash inside Postgres and returns the content only when it
  matches. Nothing in this file, or anywhere in the bundle, knows the passcode.
  The passcode itself is never stored and never put in a URL; remote.js keeps
  only the session token it gets back.
-->
<script>
  import { onMount, tick } from "svelte";
  import { unlockPortal } from "../../lib/instructorPortal/remote.js";

  let { notice = "", onunlock = () => {} } = $props();

  let pass = $state("");
  let remember = $state(false);
  let reveal = $state(false);
  /** idle | checking | wrong | empty | locked | network | config */
  let status = $state("idle");
  let retryMinutes = $state(0);
  let shake = $state(false);
  let input = $state(null);

  const busy = $derived(status === "checking");

  const message = $derived.by(() => {
    switch (status) {
      case "empty":
        return { title: "Enter the passcode first.", sub: "" };
      case "wrong":
        return {
          title: "That passcode didn't work.",
          sub: "Check it with whoever shared it with you, then try again.",
        };
      case "locked":
        return {
          title: "Too many wrong tries, so the portal is paused for a little while.",
          sub: retryMinutes
            ? `Try again in about ${retryMinutes} ${retryMinutes === 1 ? "minute" : "minutes"}.`
            : "Try again in a few minutes.",
        };
      case "network":
        return {
          title: "Can't reach the portal right now.",
          sub: "Check your connection and try again.",
        };
      case "config":
        return {
          title: "The portal isn't open on this site yet.",
          sub: "Let the studio know you saw this message.",
        };
      default:
        return null;
    }
  });

  function coarse() {
    try {
      return window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    } catch {
      return false;
    }
  }
  function reducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }

  onMount(() => {
    // Never on a touch device: an unasked-for keyboard covers half the gate.
    if (!coarse()) input?.focus();
  });

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!pass.trim()) {
      status = "empty";
      input?.focus();
      return;
    }
    status = "checking";
    let res;
    try {
      res = await unlockPortal(pass, { remember });
    } catch {
      res = { ok: false, reason: "network" };
    }
    if (res?.ok) {
      pass = "";
      input?.blur();
      onunlock(res);
      return;
    }

    const reason = res?.reason || "network";
    if (reason === "locked") {
      retryMinutes = Math.max(1, Math.ceil((Number(res.retryAfterSeconds) || 0) / 60));
      status = "locked";
    } else if (reason === "network") {
      status = "network";
    } else if (reason === "config" || reason === "no-portal") {
      status = "config";
    } else {
      status = "wrong";
      pass = "";
      if (!reducedMotion()) {
        shake = true;
        setTimeout(() => (shake = false), 440);
      }
      await tick();
      input?.focus();
    }
  }
</script>

<div class="ip-gate">
  <div class="ip-gate__inner">
    <img class="ip-gate__logo" src="/images/lsp-studio-logo.png" width="104" height="104" alt="The Latina Sweat Project" />
    <h1>Instructor portal</h1>
    <p class="ip-gate__lead">
      For LSP instructors and studio coordinators: this week, the handbook, who to contact and where things are. Enter
      the passcode the studio shared with you.
    </p>

    <form onsubmit={submit} novalidate class:ip-shake={shake}>
      <label class="ip-label" for="ip-pass">Passcode</label>
      <div class="ip-passrow">
        <input
          bind:this={input}
          bind:value={pass}
          id="ip-pass"
          class="ip-input"
          type={reveal ? "text" : "password"}
          name="passcode"
          autocomplete="current-password"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="go"
          aria-describedby="ip-gate-msg"
          aria-invalid={status === "wrong" || status === "empty" ? "true" : undefined}
        />
        <button
          type="button"
          class="ip-show"
          aria-pressed={reveal}
          aria-controls="ip-pass"
          onclick={() => (reveal = !reveal)}>{reveal ? "Hide" : "Show"}</button
        >
      </div>
      <p class="ip-gate__msg" class:has-msg={!!message || !!notice} id="ip-gate-msg" role="status" aria-live="polite">
        {#if message}{message.title}{#if message.sub}<small>{message.sub}</small>{/if}{:else if notice}{notice}{/if}
      </p>

      <label class="ip-check">
        <input type="checkbox" bind:checked={remember} />
        <span>
          Remember this device for 30 days
          <small>If it's off, you're signed out when you close the tab. Leave it off on a shared phone or computer.</small>
        </span>
      </label>

      <button class="ip-btn" type="submit" disabled={busy}>{busy ? "Opening…" : "Open the portal"}</button>


    </form>
  </div>
</div>
