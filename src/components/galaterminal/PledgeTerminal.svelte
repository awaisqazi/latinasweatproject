<!--
  The pledge terminal: one or two clerks, a keyboard, and the paddle raise.

  The shape of the ten minutes this screen exists for: the emcee calls a level,
  three spotters shout paddle numbers, and a clerk types digits and Enter,
  digits and Enter, without ever looking away from the room. Everything else on
  this screen is a read-only tape.

  What that demands, and where it is enforced:

    · the input NEVER blocks on the network. `store.submit` writes to the local
      queue and returns; the field is empty again in the same tick
      (galaTerminal/store.svelte.js, rule Q1)
    · a paddle nobody holds is ACCEPTED, tagged red, and fixed later. There is
      no dialog in this file that can steal the keyboard mid-appeal (10 s6)
    · "the other clerk got there first" is a grey line, not an error (08 s7.2)
    · an amount at or above the operator's threshold takes a second Enter, in
      the line, not in a modal (09 R5)
    · the undo window is the operator's `publish_delay_ms`, and inside it a
      killed gift never reaches the room at all (10 s2, rule 8)

  MOUNTABLE: <PledgeTerminal {store} /> with a terminal store that is already
  attached. The admin console embeds exactly this with an admin session, so the
  lead's level switches move the projector.
-->
<script>
  import { getContext, onMount, setContext } from "svelte";
  import { AlertTriangle, CircleDollarSign, Filter, Plus, Undo2, WifiOff } from "@lucide/svelte";

  import { createCheckinUi } from "../galacheckin/uiState.svelte.js";
  import NoticeStack from "../galacheckin/NoticeStack.svelte";
  import SyncPill from "../galacheckin/SyncPill.svelte";
  import { agoLabel, amountWords, levelByKey, money, parseEntry, stepLevel } from "../../lib/galaTerminal/derive.js";

  import FixSheet from "./FixSheet.svelte";
  import HelpStrip from "./HelpStrip.svelte";
  import LevelBar from "./LevelBar.svelte";
  import OtherGiftSheet from "./OtherGiftSheet.svelte";
  import TapeRow from "./TapeRow.svelte";

  let { store } = $props();

  // The check-in components (SyncPill, NoticeStack, Sheet) read this context.
  // Embedded in the admin console the host has usually set it already; standing
  // on its own page, the terminal provides it.
  const inherited = getContext("gala-checkin");
  if (!inherited) setContext("gala-checkin", { store: store.checkin, ui: createCheckinUi(store.checkin) });

  let text = $state("");
  let error = $state("");
  /** null | { kind: "confirm" | "duplicate", text } . A strip, never a modal. */
  let gate = $state(null);
  let filter = $state("all");
  let helpOpen = $state(false);
  let fixRow = $state(null);
  let otherOpen = $state(false);
  let inputEl = $state(null);
  let now = $state(Date.now());

  const sheetOpen = $derived(Boolean(fixRow) || otherOpen);
  const offline = $derived(store.checkin?.sync?.status === "offline");
  const queued = $derived(store.queued);
  const levelTally = $derived(store.byLevel.find((b) => b.amount_cents === store.levelCents) || null);
  const undo = $derived(store.undoSlot);
  const undoLeft = $derived(undo ? Math.max(0, undo.until - now) : 0);

  // A 250 ms tick only while there is a countdown to draw.
  $effect(() => {
    if (!undo && !queued.length) return;
    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });

  onMount(() => focusInput());

  function focusInput() {
    // Focus on the next frame so a sheet's own focus restore does not win.
    requestAnimationFrame(() => inputEl?.focus({ preventScroll: true }));
  }

  /* ---- the tape ---------------------------------------------------------- */

  const serverIds = $derived(new Set(store.rows.map((r) => r.id)));

  /**
   * Local lines sit above the server's, because they are always the newest.
   * A landed entry stays until the server's copy of it arrives, so a row never
   * blinks out of existence in front of a clerk who is counting.
   */
  const localLines = $derived([
    ...store.queue
      .filter((q) => q.state !== "done" || !serverIds.has(q.donationId))
      .map((q) => ({ key: `q${q.op}`, at: q.at, queued: q })),
    ...store.dupes.map((d) => ({ key: `d${d.id}`, at: d.at, dupe: d })),
  ].sort((a, b) => b.at - a.at));

  const visibleRows = $derived(
    (filter === "review" ? store.rows.filter((r) => r.needs_review && !r.voided_at) : store.rows).slice(0, 200),
  );
  // "Retract from screen" and "Fix" live on the last 20 rows (09 s6.2) and on
  // anything still waiting to be reconciled, however far back it has scrolled.
  const actionable = $derived(new Set([
    ...store.rows.slice(0, 20).map((r) => r.id),
    ...store.needsReview.map((r) => r.id),
  ]));

  /* ---- entry ------------------------------------------------------------- */

  const PARSE_MESSAGE = {
    "bad-token": (r) => `"${r.token}" is not a paddle. Digits, and then * for a custom amount, a for anonymous, ! to key it twice.`,
    "bad-paddle": () => "Paddle 0 is not a paddle.",
    "no-amount": () => "Pick a giving level first, or type an amount like 45*750.",
    "too-large": () => "That amount is too large to be real.",
    empty: () => "",
  };

  function gateFor(items) {
    const big = items.find((i) => store.needsConfirm(i.cents));
    if (big) {
      const words = amountWords(big.cents);
      return {
        kind: "confirm",
        text: `${money(big.cents)}${words ? ` · ${words}` : ""} from paddle ${big.paddle}. Enter again to record it, Esc to drop it.`,
      };
    }
    for (const i of items) {
      if (i.force) continue;
      const dup = store.duplicateFor(i.paddle, i.cents);
      if (dup) {
        return {
          kind: "duplicate",
          text: `Paddle ${i.paddle} already has ${money(dup.amount_cents)} at this level (${dup.entered_by}, ${agoLabel(dup.created_at, Date.now())}). Enter again to keep both, Esc to drop it.`,
        };
      }
    }
    return null;
  }

  function commit() {
    const parsed = parseEntry(text, store.levelCents);
    if (!parsed.ok) {
      error = (PARSE_MESSAGE[parsed.reason] || (() => "That line did not parse."))(parsed);
      return;
    }
    if (!gate) {
      const g = gateFor(parsed.items);
      if (g) { gate = g; error = ""; return; }
    }
    // Clear FIRST: the next paddle is already being shouted.
    text = "";
    gate = null;
    error = "";
    for (const item of parsed.items) store.submit(item);
    focusInput();
  }

  function onInput() {
    // The line changed, so whatever the clerk was being asked about is stale.
    gate = null;
    error = "";
  }

  /* ---- keyboard ---------------------------------------------------------- */

  const LEVEL_STEP = { "]": +1, "[": -1, ArrowDown: +1, ArrowUp: -1 };

  function step(dir) {
    const next = stepLevel(store.levels, store.levelCents, dir);
    if (next) void store.setLevel(next.amount_cents);
  }

  function onKeydown(event) {
    if (sheetOpen) return;                       // the sheet owns the keyboard
    const target = event.target;
    const inOtherField = target !== inputEl
      && (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT");
    if (inOtherField) return;

    const key = event.key;

    // Option (or Alt) plus 1 to 9 jumps to a level. Plain digits belong to the
    // paddle field: a digit cannot mean two things at 8:40 PM.
    if (event.altKey && /^[1-9]$/.test(key)) {
      const l = levelByKey(store.levels, key);
      if (l) { event.preventDefault(); void store.setLevel(l.amount_cents); }
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      if (key.toLowerCase() === "z") { event.preventDefault(); void store.undoLast(); }
      return;
    }

    if (key in LEVEL_STEP) { event.preventDefault(); step(LEVEL_STEP[key]); return; }

    if (key === "Enter") { event.preventDefault(); commit(); return; }

    if (key === "Escape") {
      event.preventDefault();
      if (gate) { gate = null; text = ""; focusInput(); return; }
      if (text) { text = ""; error = ""; focusInput(); return; }
      void store.undoLast();
      return;
    }

    // Letters that are NOT part of the entry grammar are shortcuts. "a" and "!"
    // are grammar, so they are never stolen from the field.
    const lower = key.toLowerCase();
    if (lower === "z") { event.preventDefault(); void store.undoLast(); return; }
    if (lower === "o") { event.preventDefault(); otherOpen = true; return; }
    if (lower === "r") { event.preventDefault(); filter = filter === "review" ? "all" : "review"; return; }
    if (key === "?" || key === "F1") { event.preventDefault(); helpOpen = !helpOpen; return; }

    // Anything the clerk types belongs in the field, wherever the focus drifted.
    if (/^[0-9a!*]$/i.test(key) && target !== inputEl) inputEl?.focus({ preventScroll: true });
  }

  function closeSheet() {
    fixRow = null;
    otherOpen = false;
    focusInput();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="gt">
  <header class="gt-bar">
    <div class="gt-id">
      <h1 class="gt-title">Pledges</h1>
      <p class="gt-sub">Annual Gala{store.actor ? ` · ${store.actor}` : ""}</p>
    </div>

    <dl class="gt-totals">
      <div><dt>On screen</dt><dd>{money(store.totals.live_cents)}</dd></div>
      <div><dt>Gifts</dt><dd>{store.totals.live_count}</dd></div>
      <div class="gt-booked"><dt>In the books</dt><dd>{money(store.totals.booked_cents)}</dd></div>
    </dl>

    <SyncPill />
  </header>

  {#if offline || queued.length}
    <div class="gt-queue" class:gt-queue--bad={offline} role="status">
      {#if offline}<WifiOff size={18} strokeWidth={2.2} />{/if}
      <strong>{queued.length}</strong>
      <span>
        {queued.length === 1 ? "entry" : "entries"} waiting on this device.
        {offline ? "Keep typing: they send themselves when the signal comes back." : "Sending now."}
      </span>
    </div>
  {/if}

  <LevelBar {store} />

  <section class="gt-entry">
    <label class="gt-lab" for="gt-paddle">Paddle</label>
    <input
      id="gt-paddle"
      class="gt-input"
      class:gt-input--gate={Boolean(gate)}
      type="text"
      inputmode="numeric"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      enterkeyhint="done"
      placeholder={store.levelCents ? `Number, then Enter, at ${money(store.levelCents)}` : "Pick a giving level"}
      bind:value={text}
      bind:this={inputEl}
      oninput={onInput}
      aria-describedby="gt-say"
    />
    <p class="gt-tally">
      {#if levelTally}
        <span class="gt-tally-n">{levelTally.paddles}</span> paddles at {money(store.levelCents)}
        · {money(levelTally.total_cents)}
      {:else if store.levelCents}
        Nobody at {money(store.levelCents)} yet
      {/if}
    </p>
  </section>

  <p
    id="gt-say"
    class="gt-say"
    class:gt-say--gate={Boolean(gate)}
    class:gt-say--bad={Boolean(error)}
    role="status"
    aria-live="polite"
  >
    {#if gate}
      <AlertTriangle size={16} strokeWidth={2.4} />{gate.text}
    {:else if error}
      {error}
    {:else}
      Type a number and press Enter. A paddle nobody holds is still recorded, in red, and fixed later.
    {/if}
  </p>

  {#if undo && undoLeft > 0}
    <div class="gt-undo" role="status">
      <button type="button" class="gt-undo-btn" onclick={() => store.undoLast()}>
        <Undo2 size={17} strokeWidth={2.4} />
        Undo {money(undo.cents)}{undo.paddle ? ` · paddle ${undo.paddle}` : ""}
      </button>
      <span class="gt-undo-word">
        {undo.published ? "Already on the screen. Esc pulls it back." : "Esc, before the room sees it."}
      </span>
      <span class="gt-undo-left">{Math.ceil(undoLeft / 1000)}s</span>
    </div>
  {/if}

  <div class="gt-tools">
    <button type="button" class="gt-tool" onclick={() => (otherOpen = true)}>
      <Plus size={17} strokeWidth={2.4} /> Other gift
    </button>
    <button
      type="button"
      class="gt-tool"
      class:gt-tool--on={filter === "review"}
      aria-pressed={filter === "review"}
      onclick={() => (filter = filter === "review" ? "all" : "review")}
    >
      <Filter size={16} strokeWidth={2.2} /> Needs review
      {#if store.totals.needs_review}<span class="gt-pip">{store.totals.needs_review}</span>{/if}
    </button>
    <p class="gt-legend">
      <CircleDollarSign size={14} strokeWidth={2.2} />
      {store.totals.pending_publish} about to show · {store.totals.retracted} pulled back · {store.totals.voided} voided
    </p>
  </div>

  <!-- The emcee says "I count nine at a thousand": this is the row the clerk
       checks it against, every level at once (08 s7.2). -->
  {#if store.byLevel.length}
    <dl class="gt-byLevel">
      {#each store.byLevel as l (l.amount_cents)}
        <div class:gt-byLevel--on={l.amount_cents === store.levelCents}>
          <dt>{money(l.amount_cents)}</dt>
          <dd><strong>{l.paddles}</strong> paddles · {money(l.total_cents)}</dd>
        </div>
      {/each}
    </dl>
  {/if}

  <div class="gt-tape" role="log" aria-label="Tonight's gifts">
    {#if filter === "all"}
      {#each localLines as line (line.key)}
        <TapeRow
          {store}
          queued={line.queued}
          dupe={line.dupe}
          name={line.queued?.paddle != null ? (store.paddles[line.queued.paddle]?.name || "") : (line.queued?.donorName || "")}
          {now}
        />
      {/each}
    {/if}

    {#each visibleRows as row (row.id)}
      <TapeRow {store} {row} {now} actionable={actionable.has(row.id)} onfix={(r) => (fixRow = r)} />
    {/each}

    {#if !visibleRows.length && !localLines.length}
      <p class="gt-empty">
        {#if filter === "review"}
          Nothing is waiting to be reconciled. That is the good outcome.
        {:else}
          No gifts yet tonight. Type a paddle number and press Enter.
        {/if}
      </p>
    {/if}
  </div>

  <HelpStrip bind:open={helpOpen} />

  {#if fixRow}
    <FixSheet {store} row={store.rows.find((r) => r.id === fixRow.id) || fixRow} onclose={closeSheet} />
  {/if}
  {#if otherOpen}
    <OtherGiftSheet {store} onclose={closeSheet} />
  {/if}

  <NoticeStack />
</div>

<style>
  /* ------------------------------------------------------------------ *
   * Tokens: docs/gala-2026/04-theme-design-spec.md section 2.6, the same
   * subset the check-in desk uses. Declared on this root rather than
   * imported, so the component is self-contained wherever the admin
   * console drops it, and so nothing leaks into the public site.
   * ------------------------------------------------------------------ */
  .gt {
    --g26-ink: #05070c;
    --g26-night: #0b1320;
    --g26-navy: #111a27;
    --g26-navy-2: #16212f;
    --g26-navy-3: #1b2a40;
    --g26-cream: #fff8ef;
    --g26-text: #f3ece1;
    --g26-muted: #c3ccd8;
    --g26-dim: #a9b4c2;
    --g26-gold: #ffbd59;
    --g26-gold-deep: #b9842f;
    --g26-gold-soft: #e4c98a;
    --g26-gold-hi: #fff1be;
    --g26-gold-ink: #8a5700;
    --g26-ok: #5fd4b8;
    --g26-alert: #ff8a7a;

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

    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: var(--g26-text);
    font-family: var(--g26-sans);
    background: var(--g26-night);
  }

  .gt-bar {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 60px;
    padding: 6px 12px;
    padding-top: calc(6px + env(safe-area-inset-top, 0px));
    background: rgb(11 19 32 / 0.96);
    border-bottom: 1px solid var(--g26-line-strong);
  }
  .gt-id {
    flex: none;
  }
  .gt-title {
    margin: 0;
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
    font-size: 26px;
    line-height: 1;
    color: var(--g26-gold);
  }
  .gt-sub {
    margin: 2px 0 0;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--g26-dim);
  }

  .gt-totals {
    flex: 1;
    display: flex;
    justify-content: flex-end;
    gap: 18px;
    margin: 0;
  }
  .gt-totals div {
    text-align: right;
  }
  .gt-totals dt {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--g26-dim);
  }
  .gt-totals dd {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    line-height: 1.1;
    font-variant-numeric: tabular-nums lining-nums;
    color: var(--g26-cream);
  }
  .gt-booked dd {
    color: var(--g26-gold-soft);
  }

  .gt-queue {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 12px;
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-ink);
    background: var(--g26-gold);
  }
  .gt-queue--bad {
    color: var(--g26-ink);
    background: var(--g26-alert);
  }
  .gt-queue strong {
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }

  .gt-entry {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 12px;
  }
  .gt-lab {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--g26-gold-soft);
  }
  /* Big enough to read from a laptop on a dark ballroom table, and 16px or more
     on a phone so iOS does not magnify the page the moment it is tapped. */
  .gt-input {
    width: 100%;
    min-height: 72px;
    padding: 0 16px;
    font-family: var(--g26-sans);
    font-size: 40px;
    font-weight: 800;
    letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums lining-nums;
    color: var(--g26-cream);
    background: var(--g26-surface-1);
    border: 2px solid var(--g26-line-strong);
    border-radius: var(--g26-r-ctl);
  }
  .gt-input::placeholder {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: rgb(169 180 194 / 0.7);
  }
  .gt-input:focus-visible {
    outline: none;
    border-color: var(--g26-gold);
    box-shadow: 0 0 0 3px rgb(255 189 89 / 0.25);
  }
  .gt-input--gate {
    border-color: var(--g26-alert);
  }
  .gt-tally {
    margin: 0;
    text-align: right;
    font-size: 13px;
    color: var(--g26-dim);
    white-space: nowrap;
  }
  .gt-tally-n {
    font-size: 22px;
    font-weight: 800;
    color: var(--g26-cream);
  }

  .gt-say {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    margin: 0;
    padding: 0 12px 8px;
    font-size: 13px;
    line-height: 1.35;
    color: var(--g26-dim);
  }
  .gt-say--gate {
    font-size: 15px;
    font-weight: 800;
    color: var(--g26-gold);
  }
  .gt-say--bad {
    font-weight: 700;
    color: var(--g26-alert);
  }

  .gt-undo {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 12px;
    background: var(--g26-surface-2);
    border-top: 1px solid var(--g26-line);
    border-bottom: 1px solid var(--g26-line);
  }
  .gt-undo-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 44px;
    padding: 0 14px;
    font-family: var(--g26-sans);
    font-size: 14px;
    font-weight: 800;
    color: var(--g26-ink);
    background: var(--g26-gold);
    border: 0;
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }
  .gt-undo-btn:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }
  .gt-undo-word {
    flex: 1;
    font-size: 12px;
    color: var(--g26-dim);
  }
  .gt-undo-left {
    font-size: 15px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--g26-gold-soft);
  }

  .gt-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--g26-line);
  }
  .gt-tool {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 44px;
    padding: 0 12px;
    font-family: var(--g26-sans);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--g26-cream);
    background: transparent;
    border: 1px solid var(--g26-line-strong);
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }
  .gt-tool--on {
    color: var(--g26-ink);
    background: var(--g26-gold-soft);
  }
  .gt-tool:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }
  .gt-pip {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    font-size: 11px;
    color: var(--g26-ink);
    background: var(--g26-alert);
    border-radius: 999px;
  }
  .gt-legend {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin: 0;
    font-size: 11px;
    color: var(--g26-dim);
  }

  .gt-byLevel {
    display: flex;
    gap: 6px;
    margin: 0;
    padding: 7px 12px;
    overflow-x: auto;
    scrollbar-width: none;
    border-bottom: 1px solid var(--g26-line);
  }
  .gt-byLevel::-webkit-scrollbar {
    display: none;
  }
  .gt-byLevel div {
    flex: none;
    padding: 3px 10px;
    border: 1px solid var(--g26-line);
    border-radius: var(--g26-r-ctl);
  }
  .gt-byLevel--on {
    border-color: var(--g26-line-strong) !important;
    background: rgb(255 189 89 / 0.08);
  }
  .gt-byLevel dt {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    color: var(--g26-gold-soft);
  }
  .gt-byLevel dd {
    margin: 0;
    font-size: 12px;
    white-space: nowrap;
    color: var(--g26-dim);
  }
  .gt-byLevel strong {
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    color: var(--g26-cream);
  }

  .gt-tape {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .gt-empty {
    margin: 0;
    padding: 34px 20px;
    text-align: center;
    font-size: 15px;
    line-height: 1.5;
    color: var(--g26-dim);
  }

  /* A volunteer's own phone. The header stacks, the field stays enormous, and
     every target keeps its 56px. */
  @media (max-width: 720px) {
    .gt-bar {
      flex-wrap: wrap;
      gap: 8px;
    }
    .gt-totals {
      order: 3;
      width: 100%;
      justify-content: space-between;
      gap: 8px;
      padding-bottom: 4px;
    }
    .gt-totals dd {
      font-size: 18px;
    }
    .gt-entry {
      grid-template-columns: 1fr;
      gap: 6px;
      padding: 10px 12px 4px;
    }
    .gt-input {
      min-height: 64px;
      font-size: 32px;
    }
    .gt-tally {
      text-align: left;
    }
    .gt-tool {
      min-height: 56px;
    }
    .gt-legend {
      display: none;
    }
    .gt-undo-btn {
      min-height: 56px;
    }
  }
</style>
