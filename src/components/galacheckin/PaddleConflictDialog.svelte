<!--
  The paddle in the volunteer's hand does not match the one the database has.

  Every one of these is a DESIGNED refusal: the server decided before it wrote
  anything, so nobody has been checked in and no number has been burned. The
  dialog therefore never apologises for a fault, it just says what is true about
  the box of paddles and offers the three ways forward.

  Copy is fixed by docs/gala-2026/06-checkin-concurrency-design.md section 5.1.

  Door volunteers never type a paddle number (organizer, Sep 25: the next free
  paddle comes from the server, always). "Type another number" and "Swap to
  N" only exist for an admin session (`canType`).
-->
<script>
  import { getContext } from "svelte";
  import { clockTime } from "../../lib/galaCheckin/derive.js";

  const { ui } = getContext("gala-checkin");

  const c = $derived(ui.conflict);
  const res = $derived(c?.res || {});
  const typed = $derived(c?.typed ?? null);
  const number = $derived(res.paddle_number ?? typed);
  const nextFree = $derived(res.next_free ?? null);

  let entry = $state("");
  let typing = $state(false);
  let entryEl = $state(null);

  const HEAD = {
    "paddle-taken": "That paddle is already out",
    "paddle-void": "That paddle was retired",
    "unknown-paddle": "Not a paddle from tonight",
    "group-has-paddle": "This party already has a paddle",
    "pool-empty": "The box is empty",
    "mixed-groups": "One household at a time",
    "needs-connection": "No connection",
  };

  function body() {
    switch (res.reason) {
      case "paddle-taken":
        return `Paddle ${number} already belongs to ${res.held_by || "another party"}${
          res.assigned_by ? ` (given by ${res.assigned_by}${res.assigned_at ? ` at ${clockTime(res.assigned_at)}` : ""})` : ""
        }. Put that one aside.`;
      case "paddle-void":
        return `Paddle ${number} was retired (lost or replaced). Pick another.`;
      case "unknown-paddle":
        return `Paddle ${number} is not in tonight's box.`;
      case "group-has-paddle":
        return `This party already has paddle ${res.paddle_number}.`;
      case "pool-empty":
        return c?.canType
          ? "No free paddles left in the box. Take one from the reserve stack and type its number."
          : "No free paddles left in the box. Ask the lead: they can add paddles from an admin device.";
      case "mixed-groups":
        return "This party is split across more than one paddle, so a typed number cannot cover all of them. Check in one household at a time, or let the next free paddles come out on their own.";
      case "needs-connection":
        return "A new paddle number has to come from the server. Wait for the signal (the pill at the top turns green), or write the name on the paper list and ask the lead.";
      default:
        return "Something went wrong. Try again.";
    }
  }

  function typeAnother() {
    typing = true;
    entry = "";
    queueMicrotask(() => entryEl?.focus());
  }

  function submitTyped(event) {
    event?.preventDefault();
    const n = Number(entry);
    if (!Number.isInteger(n) || n < 1 || n > 9999) return;
    c.onTyped?.(n);
  }
</script>

{#if c}
  <div class="cd-scrim" role="presentation" onpointerdown={() => ui.closeConflict()}></div>
  <div class="cd" role="alertdialog" aria-modal="true" aria-labelledby="cd-head">
    <p class="cd-eyebrow">Paddle</p>
    <h2 class="cd-head" id="cd-head">{HEAD[res.reason] || "Check the paddle"}</h2>
    <p class="cd-body">{body()}</p>

    {#if typing}
      <form class="cd-entry" onsubmit={submitTyped}>
        <label class="glabel" for="cd-num">Paddle number in your hand</label>
        <input
          id="cd-num"
          class="ginput ginput--num"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="off"
          maxlength="4"
          enterkeyhint="done"
          bind:value={entry}
          bind:this={entryEl}
        />
        <button type="submit" class="gbtn gbtn--gold" disabled={!/^[0-9]{1,4}$/.test(entry)}>
          Use paddle {entry || ""}
        </button>
      </form>
    {:else}
      <div class="cd-acts">
        {#if res.reason === "group-has-paddle"}
          <button type="button" class="gbtn gbtn--gold" onclick={() => c.onKeep?.(res.paddle_number)}>
            Keep {res.paddle_number}
          </button>
          {#if typed != null && c.canType}
            <button type="button" class="gbtn" onclick={() => c.onSwap?.(typed)}>Swap to {typed}</button>
          {/if}
        {:else if res.reason === "mixed-groups" || res.reason === "needs-connection"}
          {#if c.onAuto && res.reason === "mixed-groups"}
            <button type="button" class="gbtn gbtn--gold" onclick={() => c.onAuto?.()}>
              Use the next free paddles
            </button>
          {/if}
        {:else}
          {#if nextFree != null && c.onAuto}
            <!-- No number on this button: by the time it is tapped another desk
                 may have taken it. The number shown is the one the server hands back. -->
            <button type="button" class="gbtn gbtn--gold" onclick={() => c.onAuto?.()}>
              Use the next free paddle
            </button>
          {/if}
          {#if c.canType}
            <button type="button" class="gbtn" onclick={typeAnother}>Admin: type another number</button>
            {#if c.onNone}
              <button type="button" class="gbtn" onclick={() => c.onNone?.()}>Check in without a paddle</button>
            {/if}
          {/if}
        {/if}
        <button type="button" class="gbtn gbtn--quiet" onclick={() => ui.closeConflict()}>Cancel</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .cd-scrim {
    position: fixed;
    inset: 0;
    background: rgb(4 8 14 / 0.75);
    z-index: 90;
  }
  .cd {
    position: fixed;
    z-index: 91;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(460px, calc(100vw - 20px));
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    padding: 20px;
    background: var(--g26-navy);
    color: var(--g26-text);
    border: 1px solid var(--g26-line-strong);
    border-top: 4px solid var(--g26-alert);
    border-radius: var(--g26-r-card);
    box-shadow: 0 40px 90px -40px rgb(0 0 0 / 0.95);
  }
  .cd-eyebrow {
    margin: 0;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--g26-alert);
  }
  .cd-head {
    margin: 4px 0 8px;
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
    font-size: 26px;
    line-height: 1.15;
    color: var(--g26-cream);
  }
  .cd-body {
    margin: 0 0 16px;
    font-size: 16px;
    line-height: 1.5;
  }
  .cd-acts,
  .cd-entry {
    display: grid;
    gap: 8px;
  }
</style>
