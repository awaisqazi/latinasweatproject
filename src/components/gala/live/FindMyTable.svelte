<script>
  // "Find my table" on a guest's phone (/gala/live, the phone view). Asked once,
  // softly: the guest types their name (or skips), picks themselves if several
  // people match, and from then on the first card on the page is their table
  // and seat with the corridor map, in every segment of the night. The answer
  // is re-checked every few minutes in case the planners move someone.
  // Server: gala_display_find_seat. Storage: this browser's localStorage only.
  import { onMount } from "svelte";
  import { TABLE_ROWS } from "../../../lib/galaLive/program.js";
  import {
    readFindSeat, writeFindSeat, findSeat, sameMatch, FIND_SEAT_REFRESH_MS,
  } from "../../../lib/galaLive/findSeat.js";
  import SeatMiniMap from "./SeatMiniMap.svelte";

  let { event = "gala-2026" } = $props();

  // Read synchronously so the first paint is already the right card.
  const saved = readFindSeat();
  let query = $state(saved.query);
  let pick = $state(saved.pick);
  let skipped = $state(saved.skipped);
  let input = $state(saved.pick ? "" : saved.query);
  let busy = $state(false);
  let candidates = $state([]);
  let note = $state(""); // "", "none", "short", "offline"
  let open = $state(false); // the skipped guest reopened the prompt

  const view = $derived(
    pick ? "result" : candidates.length ? "choose" : skipped && !open ? "collapsed" : "ask",
  );

  function save() {
    writeFindSeat({ query, pick, skipped });
  }

  async function submit(e) {
    e?.preventDefault();
    const q = input.trim();
    note = "";
    if (q.replace(/[^\p{L}]/gu, "").length < 3) {
      note = "short";
      return;
    }
    busy = true;
    const res = await findSeat(event, q);
    busy = false;
    if (!res.ok) {
      note = res.reason === "short" ? "short" : res.reason === "offline" ? "offline" : "none";
      return;
    }
    query = q;
    if (!res.matches.length) {
      note = "none";
      save();
      return;
    }
    if (res.matches.length === 1) {
      choose(res.matches[0]);
      return;
    }
    candidates = res.matches;
  }

  function choose(m) {
    pick = m;
    candidates = [];
    skipped = false;
    open = false;
    note = "";
    save();
  }

  function change() {
    pick = null;
    candidates = [];
    input = "";
    note = "";
    query = "";
    skipped = false;
    open = true;
    save();
  }

  function skip() {
    skipped = true;
    open = false;
    candidates = [];
    note = "";
    save();
  }

  // Planners can move people: re-ask the server now and then with the same
  // name and keep the guest's pick in step. Never flaps to "not found": a name
  // that stops matching keeps the last answer on screen.
  let lastCheck = 0;
  async function recheck() {
    if (!pick || !query || busy) return;
    lastCheck = Date.now();
    const res = await findSeat(event, query);
    if (!res.ok || !pick) return;
    const same = res.matches.filter((m) => m.name === pick.name);
    const next =
      same.find((m) => sameMatch(m, pick)) ||
      (same.length === 1 ? same[0] : null);
    if (next && !sameMatch(next, pick)) {
      pick = next;
      save();
    }
  }
  onMount(() => {
    if (pick) recheck();
    const t = setInterval(recheck, FIND_SEAT_REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck > 60_000) recheck();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  });

  const where = (m) =>
    m.late_night ? "Late night · 9 PM" : m.table_number ? `Table ${m.table_number}${m.seat ? ` · Seat ${m.seat}` : ""}` : "Seat to be confirmed";
</script>

<section class="fmt" class:slim={view === "collapsed"} aria-live="polite">
  {#if view === "result"}
    <div class="eyebrow">Your table tonight</div>
    {#if pick.late_night}
      <div class="big serif">Late night · 9 PM</div>
      <p class="sub">Gallery and open bar, no assigned seat</p>
    {:else if pick.table_number}
      <div class="big">
        <span class="serif">Table {pick.table_number}</span>{#if pick.seat}<span class="sep" aria-hidden="true">·</span><span class="serif">Seat {pick.seat}</span>{/if}
      </div>
      <div class="map">
        <SeatMiniMap rows={TABLE_ROWS} highlight={[pick.table_number]} vw={300} vh={170} label={`Dinner corridor map, table ${pick.table_number} highlighted`} />
      </div>
      <p class="sub">Seat 1 is on the coat check side, seats count clockwise.</p>
    {:else}
      <div class="big serif">Seat to be confirmed</div>
      <p class="sub">Ask any host and they will walk you to your table.</p>
    {/if}
    <p class="who">
      <span class="nm">{pick.name}</span>
      <button type="button" class="link" onclick={change}>Not you? Change name</button>
    </p>
  {:else if view === "choose"}
    <div class="eyebrow">Find my table</div>
    <h2 class="serif">Which one is you?</h2>
    <ul class="cands">
      {#each candidates as c, i (i)}
        <li>
          <button type="button" class="cand" onclick={() => choose(c)}>
            <span class="cn">{c.name}</span>
            <span class="cw">{where(c)}</span>
          </button>
        </li>
      {/each}
    </ul>
    <button type="button" class="link" onclick={change}>None of these, try another name</button>
  {:else if view === "collapsed"}
    <button type="button" class="reopen" onclick={() => (open = true)}>
      <span class="eyebrow">Find my table</span>
      <span class="arrow" aria-hidden="true">&#8250;</span>
    </button>
  {:else}
    <div class="eyebrow">Find my table</div>
    <h2 class="serif">Find your table tonight.</h2>
    <form onsubmit={submit}>
      <label for="fmt-name">What’s your name?</label>
      <input
        id="fmt-name"
        type="text"
        autocomplete="name"
        autocapitalize="words"
        spellcheck="false"
        enterkeyhint="search"
        maxlength="120"
        placeholder="First and last name"
        bind:value={input}
        oninput={() => (note = "")}
      />
      {#if note === "none"}
        <p class="msg">We could not find that name. Ask any host.</p>
      {:else if note === "short"}
        <p class="msg">Type at least three letters of your name.</p>
      {:else if note === "offline"}
        <p class="msg">No connection right now. Try again in a moment.</p>
      {/if}
      <button type="submit" class="go" disabled={busy}>{busy ? "Looking…" : "Find my table"}</button>
      <button type="button" class="link" onclick={skip}>Skip</button>
    </form>
  {/if}
</section>

<style>
  .fmt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 20px 18px 18px;
    text-align: center;
    border: 1px solid rgba(255, 189, 89, 0.45);
    border-radius: 6px;
    background:
      radial-gradient(120% 80% at 50% 0%, rgba(255, 189, 89, 0.14), transparent 70%),
      var(--g26-navy, #111a27);
    box-shadow: 0 0 40px rgba(255, 189, 89, 0.08);
  }
  .fmt.slim {
    padding: 0;
  }
  .eyebrow {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--g26-gold, #ffbd59);
  }
  .serif {
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
  }
  h2 {
    margin: 0;
    font-size: 28px;
    line-height: 1.15;
    color: var(--g26-cream, #fff8ef);
  }
  .big {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: baseline;
    gap: 0 12px;
    font-size: 40px;
    line-height: 1.1;
    color: var(--g26-cream, #fff8ef);
  }
  .sep {
    color: var(--g26-gold, #ffbd59);
  }
  .map {
    width: 100%;
    aspect-ratio: 300 / 170;
    margin-top: 2px;
  }
  .sub {
    margin: 0;
    font-size: 14px;
    line-height: 1.45;
    color: var(--g26-muted, #c3ccd8);
  }
  .who {
    margin: 4px 0 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .who .nm {
    font-size: 15px;
    font-weight: 700;
    color: var(--g26-warm, #f2e4d2);
  }
  form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  label {
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-muted, #c3ccd8);
  }
  input {
    width: 100%;
    box-sizing: border-box;
    min-height: 50px;
    padding: 0 14px;
    border-radius: 4px;
    border: 1px solid rgba(228, 201, 138, 0.4);
    background: var(--g26-ink, #05070c);
    color: var(--g26-cream, #fff8ef);
    /* 16px or iOS zooms the page on focus */
    font: 600 16px var(--g26-sans, sans-serif);
    text-align: center;
  }
  input:focus {
    outline: none;
    border-color: var(--g26-gold, #ffbd59);
    box-shadow: 0 0 0 3px rgba(255, 189, 89, 0.25);
  }
  input::placeholder {
    color: var(--g26-dim, #a9b4c2);
    font-weight: 500;
  }
  .msg {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-alert, #ff8a7a);
  }
  .go {
    min-height: 50px;
    border: 0;
    border-radius: 4px;
    background: var(--g26-gold, #ffbd59);
    color: var(--g26-ink, #05070c);
    font: 800 15px var(--g26-sans, sans-serif);
    letter-spacing: 0.06em;
    cursor: pointer;
  }
  .go:disabled {
    opacity: 0.6;
  }
  .link {
    align-self: center;
    min-height: 40px;
    padding: 0 8px;
    border: 0;
    background: none;
    color: var(--g26-gold-soft, #e4c98a);
    font: 700 14px var(--g26-sans, sans-serif);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .cands {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cand {
    width: 100%;
    min-height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid rgba(255, 189, 89, 0.45);
    background: var(--g26-navy-2, #16212f);
    color: var(--g26-cream, #fff8ef);
    cursor: pointer;
  }
  .cn {
    font: 700 16px var(--g26-sans, sans-serif);
  }
  .cw {
    font: 800 12px var(--g26-sans, sans-serif);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--g26-gold, #ffbd59);
  }
  .reopen {
    width: 100%;
    min-height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .arrow {
    font-size: 26px;
    line-height: 1;
    color: var(--g26-gold, #ffbd59);
  }
</style>
