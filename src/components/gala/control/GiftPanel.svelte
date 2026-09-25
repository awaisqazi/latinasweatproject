<script>
  // Record a gift from the show-control phone: paddle, amount, Record, next.
  //
  // It writes through the pledge terminal's store (galaTerminal/store.svelte.js)
  // and therefore through the same RPCs, the same durable outbox and the same
  // idempotent op ids as /gala/pledges: a gift keyed here lands on the projector
  // and every phone exactly like a terminal entry, and a paddle that two people
  // key at the same level is recorded once (the server's round-key guard).
  //
  // The paddle -> name preview comes from the check-in roster the store already
  // loaded; an unknown number is still accepted and recorded as "Paddle N".
  // No dialogs: the name under the field IS the confirmation.
  //
  // Mounted on /gala/control, the Control tab of /gala/admin, and as the
  // primary screen of the pledge terminal (/gala/pledges, the Pledges tab).
  // On a keyboard the field also takes the terminal's line grammar: "12 45 88"
  // records three paddles at the chosen amount, "45*750" a custom amount,
  // "45a" anonymous, "45!" a deliberate second gift at the same level.
  import { levelMoney } from "../../../lib/galaLive/config.js";
  import { rowState, parseEntry, amountWords } from "../../../lib/galaTerminal/derive.js";

  let { terminal = null, levels = [], callingCents = null, flat = false, autofocus = false } = $props();

  /** Hosts (the pledge terminal's keyboard shortcuts) put the cursor back here. */
  export function focus() {
    inputEl?.focus({ preventScroll: true });
  }

  let paddleText = $state("");
  let picked = $state(null); // cents the operator chose; null = follow the calling level
  let otherOpen = $state(false);
  let otherText = $state("");
  let error = $state("");
  let last = $state.raw(null); // { op, paddle, cents, name }
  let inputEl = $state(null);

  const ready = $derived(terminal?.phase === "ready" || terminal?.phase === "error");
  const roster = $derived(terminal?.paddles || {});
  const rosterLoaded = $derived(Object.keys(roster).length > 0);
  const paddle = $derived(/^\d{1,5}$/.test(paddleText.trim()) ? Number(paddleText.trim()) : null);
  // Anything else typed (a burst, a *amount, a flag) goes through the grammar.
  const lineText = $derived(paddle == null && /[\s*a!]/i.test(paddleText.trim()) ? paddleText.trim() : "");
  const who = $derived(paddle ? roster[paddle] || null : null);

  const otherCents = $derived.by(() => {
    const n = Number(String(otherText).replace(/[$,\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  });
  const callCents = $derived(Number(callingCents) > 0 ? Number(callingCents) : null);
  const cents = $derived(otherOpen ? otherCents : picked ?? callCents);
  const isLevel = $derived(cents != null && levels.some((l) => Number(l.amount_cents) === Number(cents)));
  const canRecord = $derived(
    ready && ((paddle != null && paddle > 0 && cents != null && cents > 0 && cents <= 100_000_000) || !!lineText),
  );
  const otherWords = $derived(otherOpen && otherCents ? amountWords(otherCents) : "");
  const levelSet = $derived(new Set(levels.map((l) => Number(l.amount_cents))));
  const PARSE_TEXT = {
    "bad-token": (r) => `"${r.token}" is not a paddle number.`,
    "bad-paddle": () => "Paddle 0 is not a paddle.",
    "no-amount": () => "Pick an amount first.",
    "too-large": () => "That amount is too large to be real.",
  };

  $effect(() => {
    if (autofocus && inputEl) requestAnimationFrame(() => inputEl?.focus({ preventScroll: true }));
  });

  function pick(c) {
    otherOpen = false;
    picked = Number(c) === callCents ? null : Number(c);
    error = "";
    inputEl?.focus();
  }
  function openOther() {
    otherOpen = true;
    picked = null;
  }

  function record(e) {
    e?.preventDefault();
    error = "";
    if (!terminal) return;
    if (lineText) {
      const parsed = parseEntry(lineText, cents);
      if (!parsed.ok) return (error = (PARSE_TEXT[parsed.reason] || (() => "That line did not read as paddles."))(parsed));
      let entry = null;
      let item = null;
      for (item of parsed.items) {
        entry = terminal.submit({ ...item, custom: item.custom || !levelSet.has(Number(item.cents)) });
      }
      if (entry && item) {
        const w = roster[item.paddle];
        last = { op: entry.op, paddle: item.paddle, cents: item.cents, name: w?.name || "", count: parsed.items.length };
      }
      paddleText = "";
      picked = null;
      otherOpen = false;
      otherText = "";
      requestAnimationFrame(() => inputEl?.focus());
      return;
    }
    if (paddle == null || paddle <= 0) return (error = "Type the paddle number.");
    if (cents == null) return (error = "Pick an amount.");
    const name = who?.name || "";
    const entry = terminal.submit({ paddle, cents, custom: !isLevel });
    last = { op: entry.op, paddle, cents, name, label: who?.label || "" };
    // Next paddle: the field empties, the amount goes back to the calling level.
    paddleText = "";
    picked = null;
    otherOpen = false;
    otherText = "";
    requestAnimationFrame(() => inputEl?.focus());
  }

  // The store drops a landed item from its outbox once the tape carries it, so
  // keep the donation id on `last` the moment it is known.
  $effect(() => {
    if (!last || last.donationId != null || !terminal) return;
    const item = terminal.queue.find((q) => q.op === last.op);
    if (item?.donationId != null) last = { ...last, donationId: item.donationId };
  });

  // Where the last entry is now: outbox, server, published, pulled back.
  const lastStatus = $derived.by(() => {
    if (!last || !terminal) return null;
    const dupe = terminal.dupes.find((d) => d.id === last.op);
    if (dupe) return { kind: "dupe", text: `Already recorded at this level by ${dupe.by}` };
    const item = terminal.queue.find((q) => q.op === last.op);
    if (item?.state === "waiting" || item?.state === "sending") {
      // The queue drains head first, so only the head item counts tries: any
      // retrying item means this one is stuck behind a dead connection too.
      const stuck = item.tries || terminal.queue.some((q) => q.tries > 0 && q.state !== "done");
      return { kind: "send", text: stuck ? "No connection, retrying" : "Sending" };
    }
    if (item?.state === "failed") return { kind: "fail", text: `Not saved: ${terminal.reasonText(item.reason)}`, retry: true };
    const id = item?.donationId ?? last.donationId;
    const row = id != null ? terminal.rows.find((r) => r.id === id) : null;
    if (row) {
      const st = rowState(row);
      if (st === "live") return { kind: "ok", text: "on screen" };
      if (st === "pending") return { kind: "ok", text: "on screen in a moment" };
      if (st === "retracted") return { kind: "undone", text: "pulled back" };
      if (st === "voided") return { kind: "undone", text: "voided" };
      return { kind: "ok", text: "saved, hidden from the screen" };
    }
    if (item?.state === "done" || !item) return { kind: "ok", text: "saved" };
    return null;
  });
  const lastName = $derived.by(() => {
    if (!last) return "";
    const item = terminal?.queue.find((q) => q.op === last.op);
    const id = item?.donationId ?? last.donationId;
    const row = id != null ? terminal.rows.find((r) => r.id === id) : null;
    return row?.guest_name || last.name || "";
  });
  const canUndo = $derived(
    !!last && terminal?.undoSlot?.op === last.op && lastStatus && lastStatus.kind !== "undone" && lastStatus.kind !== "dupe",
  );

  async function undo() {
    if (!terminal) return;
    const res = await terminal.undoLast();
    if (!res?.ok && res?.reason !== "nothing-to-undo") error = terminal.reasonText(res?.reason);
    else if (res?.outcome === "dropped") last = { ...last, dropped: true };
  }
</script>

<section class="gift" class:flat>
  <div class="head">
    <div class="eyebrow">Record a gift</div>
    {#if terminal && terminal.queued.length}
      <span class="qpill">{terminal.queued.length} waiting to send</span>
    {/if}
  </div>

  {#if !terminal || terminal.phase === "loading" || terminal.phase === "idle"}
    <p class="muted small">Opening the gift tape…</p>
  {:else}
    <form class="entry" onsubmit={record}>
      <label class="padlabel">
        <span>Paddle</span>
        <input
          bind:this={inputEl}
          class="paddle"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          enterkeyhint="done"
          maxlength="60"
          placeholder="42"
          bind:value={paddleText}
          data-gift-paddle
          oninput={() => (error = "")}
          onkeydown={(e) => {
            // Esc clears a half-typed number here; it never reaches the
            // terminal's "Esc = undo the last gift" shortcut.
            if (e.key === "Escape" && paddleText) {
              e.preventDefault();
              e.stopPropagation();
              paddleText = "";
              error = "";
            }
          }}
        />
      </label>
      <p class="who" class:unknown={paddle && !who && rosterLoaded}>
        {#if lineText}
          Several paddles on one line · Record sends each one
        {:else if !paddle}
          {rosterLoaded ? "Type the number on the paddle" : "Loading the guest list"}
        {:else if who}
          <b>{who.name || "Guest"}</b><span>{`${who.label && who.label !== who.name ? ` · ${who.label}` : ""}${who.table != null ? ` · Table ${who.table}` : ""}`}</span>
        {:else}
          <b>{`Paddle ${paddle}`}</b><span>{" · not on the list, records with no name"}</span>
        {/if}
      </p>

      <div class="amounts" role="group" aria-label="Amount">
        {#each levels as l (l.amount_cents)}
          <button
            type="button"
            class="amt"
            class:on={!otherOpen && Number(cents) === Number(l.amount_cents)}
            class:calling={Number(l.amount_cents) === callCents}
            onclick={() => pick(l.amount_cents)}
          >{levelMoney(l.amount_cents)}</button>
        {/each}
        <button type="button" class="amt" class:on={otherOpen} onclick={openOther}>Other</button>
      </div>
      {#if otherOpen}
        <label class="other">
          <span>Amount in dollars</span>
          <input type="text" inputmode="decimal" autocomplete="off" placeholder="750" bind:value={otherText} />
        </label>
        {#if otherWords}<p class="muted small words">{otherWords}</p>{/if}
      {:else if cents == null}
        <p class="muted small">No level is being called. Pick an amount.</p>
      {/if}

      {#if error}<p class="err">{error}</p>{/if}

      <button class="record" type="submit" disabled={!canRecord}>
        {#if canRecord && !lineText}Record {levelMoney(cents)} · Paddle {paddle}{:else}Record{/if}
      </button>
    </form>

    {#if last}
      <div class="last" class:bad={lastStatus?.kind === "fail"} class:grey={lastStatus?.kind === "dupe" || lastStatus?.kind === "undone" || last.dropped}>
        <p>
          {last.count > 1 ? `${last.count} gifts, last: ` : ""}{`Paddle ${last.paddle}${lastName ? ` · ${lastName}` : ""} · ${levelMoney(last.cents)} · `}<b>{last.dropped ? "dropped before it was sent" : lastStatus?.text || "saved"}</b>
        </p>
        <div class="lastbtns">
          {#if lastStatus?.retry}
            <button type="button" class="mini" onclick={() => terminal.retryItem(last.op)}>Retry</button>
          {/if}
          {#if canUndo && !last.dropped}
            <button type="button" class="mini" onclick={undo}>Undo</button>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</section>

<style>
  .gift {
    padding: 14px;
    border-radius: 6px;
    background: var(--navy, #111a27);
    border: 1px solid rgba(255, 189, 89, 0.55);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .gift.flat {
    border-radius: 0;
    border-width: 0 0 1px;
    border-color: rgba(255, 189, 89, 0.35);
    padding: 12px;
    background: transparent;
  }
  .words {
    margin-top: -4px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .eyebrow {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--gold, #ffbd59);
  }
  .qpill {
    font-size: 12px;
    font-weight: 800;
    padding: 3px 9px;
    border-radius: 999px;
    color: var(--ink, #05070c);
    background: var(--alert, #ff8a7a);
  }
  .muted {
    margin: 0;
    color: var(--dim, #a9b4c2);
  }
  .small {
    font-size: 13px;
  }
  .entry {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: var(--muted, #c3ccd8);
  }
  input {
    width: 100%;
    min-height: 48px;
    padding: 0 12px;
    border-radius: 3px;
    border: 1px solid rgba(228, 201, 138, 0.3);
    background: var(--navy2, #16212f);
    color: var(--cream, #fff8ef);
    font: 600 17px var(--sans, sans-serif);
    box-sizing: border-box;
  }
  input:focus {
    outline: none;
    border-color: var(--gold, #ffbd59);
    box-shadow: 0 0 0 2px var(--night, #0b1320), 0 0 0 4px var(--gold, #ffbd59);
  }
  input.paddle {
    min-height: 72px;
    font-size: 40px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .who {
    margin: -2px 0 0;
    min-height: 22px;
    font-size: 16px;
    line-height: 1.35;
    color: var(--warm, #f2e4d2);
    overflow-wrap: anywhere;
  }
  .who b {
    color: var(--cream, #fff8ef);
    font-size: 18px;
  }
  .who.unknown b {
    color: var(--gold, #ffbd59);
  }
  .amounts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
    gap: 6px;
  }
  .amt {
    min-height: 48px;
    padding: 0 4px;
    border-radius: 3px;
    border: 1px solid rgba(255, 189, 89, 0.45);
    background: var(--navy2, #16212f);
    color: var(--cream, #fff8ef);
    font: 700 15px var(--sans, sans-serif);
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  .amt.calling {
    border-width: 2px;
    border-color: var(--gold, #ffbd59);
  }
  .amt.on {
    background: var(--gold, #ffbd59);
    color: var(--ink, #05070c);
    border-color: var(--gold, #ffbd59);
  }
  .err {
    margin: 0;
    color: var(--alert, #ff8a7a);
    font-size: 14px;
  }
  .record {
    min-height: 64px;
    border-radius: 4px;
    border: 0;
    background: var(--gold, #ffbd59);
    color: var(--ink, #05070c);
    font: 800 19px var(--sans, sans-serif);
    cursor: pointer;
  }
  .record:disabled {
    opacity: 0.45;
  }
  .last {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 4px;
    background: rgba(95, 212, 184, 0.1);
    border: 1px solid rgba(95, 212, 184, 0.45);
  }
  .last p {
    margin: 0;
    font-size: 15px;
    line-height: 1.35;
    color: var(--cream, #fff8ef);
    overflow-wrap: anywhere;
  }
  .last b {
    color: var(--ok, #5fd4b8);
  }
  .last.grey {
    background: rgba(255, 248, 239, 0.04);
    border-color: rgba(195, 204, 216, 0.3);
  }
  .last.grey b {
    color: var(--dim, #a9b4c2);
  }
  .last.bad {
    background: rgba(255, 138, 122, 0.1);
    border-color: var(--alert, #ff8a7a);
  }
  .last.bad b {
    color: var(--alert, #ff8a7a);
  }
  .lastbtns {
    display: flex;
    gap: 6px;
    flex: 0 0 auto;
  }
  .mini {
    min-height: 44px;
    padding: 0 14px;
    border-radius: 3px;
    border: 1px solid rgba(255, 189, 89, 0.55);
    background: transparent;
    color: var(--gold, #ffbd59);
    font: 800 14px var(--sans, sans-serif);
    cursor: pointer;
  }
</style>
