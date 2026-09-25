<script>
  // The run of show on the projector: one view per program segment, in the
  // Constelacion look (navy, gold #FFBD59 foil, cream, Didot italic + Avenir
  // Next caps, the glowing X). Rendered inside LiveStage's 1920 x 1080 frame,
  // so every size is a stage unit.
  //
  // Text is DOM, light is WebGL: this component owns the [data-fx-anchor="x"]
  // box for the program scenes, and the 3D X springs to wherever the current
  // segment puts it. One-shot light (the honoree burst, the kickoff flare) is
  // requested through onMoment(kind, element); LiveStage decides whether the
  // canvas or canvas-confetti plays it, and never on a cold load.
  //
  // Catalogue and copy: src/lib/galaLive/program.js. Awardee names stay out
  // of the DOM until their reveal step.
  import { fade } from "svelte/transition";
  import {
    SEGMENTS, HONOREES, VOICES, MENU, MCS, FASHION, PERFORMERS, REMARKS, SPONSOR_ROWS,
    SILENT_AUCTION_URL, SILENT_AUCTION_LABEL,
    segmentById, honorAt, voiceAt, resolveHonoree, monogram, logoStyle,
  } from "../../../lib/galaLive/program.js";
  import { COPY } from "../../../lib/galaLive/config.js";
  import { fitWidth } from "../../../lib/galaLive/fitName.js";
  import QRCode from "qrcode";
  import XFillFallback from "./XFillFallback.svelte";
  import SeatingBoard from "./SeatingBoard.svelte";
  import FollowStrip from "./FollowStrip.svelte";
  import RollCall from "./RollCall.svelte";
  import Banner from "./Banner.svelte";

  let {
    pos,
    overrides = {},
    board = null,
    totalText = "",
    showTotal = false,
    pct = 0,
    goalMet = false,
    hasCanvas = false,
    reduced = false,
    sponsors = [],
    rows = [],
    overflow = 0,
    named = false,
    banner = null,
    onMoment = () => {},
  } = $props();

  const seg = $derived(segmentById(pos?.seg) || SEGMENTS[0]);
  const step = $derived(Math.max(0, Number(pos?.step) || 0));
  const honor = $derived(seg.id === "honors" ? honorAt(step) : null);
  const honoree = $derived(honor?.kind === "honor" ? resolveHonoree(HONOREES[honor.index], overrides) : null);
  const voice = $derived(seg.id === "voices" ? voiceAt(step) : null);

  // One key per visual state. Svelte remounts on change, so every CSS entrance
  // animation replays exactly once per step.
  const viewKey = $derived(
    seg.id === "honors"
      ? honor.kind === "remarks" ? "honors-remarks" : `honors-${honor.index}-${honor.revealed ? "r" : "h"}`
      : seg.id === "voices" ? `voices-${step}` : seg.id,
  );

  // Where the X sits, per view (stage units: left, top, width, height).
  const ANCHORS = {
    seating: [1668, 22, 156, 124],
    welcome: [680, 70, 560, 430],
    hosts: [1380, 110, 440, 180],
    sponsors: [810, 40, 300, 200],
    "silent-auction": [1300, 120, 420, 300],
    dinner: [770, 64, 380, 290],
    "voices-0": [810, 60, 300, 220],
    "voices-n": [130, 150, 640, 740],
    "honors-m": [130, 150, 640, 740],
    "honors-h": [1210, 150, 580, 640],
    "honors-r": [130, 140, 660, 760],
    gallery: [610, 96, 700, 520],
    "fashion-show": [810, 56, 300, 220],
    dj: [610, 96, 700, 520],
    thanks: [780, 36, 360, 280],
  };
  const anchor = $derived(
    ANCHORS[
      seg.id === "voices" ? (step > 0 ? "voices-n" : "voices-0") : seg.id === "honors" ? (honor.kind === "remarks" ? "honors-m" : honor.revealed ? "honors-r" : "honors-h") : seg.id
    ] || [610, 96, 700, 520],
  );
  const box = (a) =>
    `left: calc(var(--u) * ${a[0]}); top: calc(var(--u) * ${a[1]}); width: calc(var(--u) * ${a[2]}); height: calc(var(--u) * ${a[3]})`;

  const dur = $derived(reduced ? 0 : 1);
  const showRoll = $derived(named && rows.length > 0 && seg.id !== "seating");

  /** Svelte action: ask the page for a light moment once this node is laid out. */
  function moment(node, kind) {
    const id = requestAnimationFrame(() => onMoment(kind, node));
    return { destroy: () => cancelAnimationFrame(id) };
  }

  const splitLetters = (s) => [...s];

  // The silent auction QR, rendered here (no network, no image file).
  let aucQr = $state("");
  $effect(() => {
    if (seg.id !== "silent-auction" || aucQr) return;
    QRCode.toDataURL(SILENT_AUCTION_URL, { errorCorrectionLevel: "M", margin: 1, width: 600, color: { dark: "#05070C", light: "#FFF8EF" } })
      .then((d) => (aucQr = d))
      .catch(() => {});
  });
</script>

<!-- The follow strip comes first in the DOM so it is always one of the scene's
     quiet rects. -->
<FollowStrip variant="corner" />

{#if seg.id !== "seating"}
  <header class="hdr" transition:fade={{ duration: 400 * dur }}>
    <div>{COPY.org}</div>
    <div class="sub">Annual Gala</div>
  </header>
{/if}

<div class="zone-x" data-fx-anchor="x" style={box(anchor)}>
  {#if !hasCanvas}
    <div class="xfb"><XFillFallback progress={pct} {goalMet} {reduced} /></div>
  {/if}
</div>

{#key viewKey}
  <section
    class="view v-{seg.id}"
    class:still={reduced}
    in:fade={{ duration: 700 * dur, delay: 380 * dur }}
    out:fade={{ duration: 380 * dur }}
  >
    {#if seg.id === "seating"}
      <div class="seat-head">
        <div class="eyebrow">{seg.eyebrow} · {seg.time}</div>
        <h1 class="serif h-seat">Find your table</h1>
      </div>
      <div class="seat-meta">MCA Chicago<br />Friday, September 25, 2026</div>
      <div class="seat-board" data-fx-quiet>
        <SeatingBoard {board} width={1728} height={636} {reduced} />
      </div>
      {#if board?.demo}
        <div class="demo-plate" role="note">DEMO DATA · not the real seating</div>
      {/if}
      <div class="seat-foot">
        {#if board?.demo}
          Invented names for rehearsal only. The real plan loads only with the seating passcode.
        {:else if board && !board.numbersOnly}
          {board.tables} tables · {board.seated} dinner guests · Seat 1 is on the coat check side, seats count clockwise
        {:else}
          Your table number is on your place card. Ask any host for help.
        {/if}
      </div>
    {:else if seg.id === "welcome"}
      <div class="center-stack" style="top: calc(var(--u) * 560)">
        <div class="eyebrow rise" style="--d: 200ms">Welcome to the</div>
        <!-- Foil per letter: background-clip:text on a parent does not paint
             through transformed children (04 section 3.5). -->
        <h1 class="serif h-hero" use:moment={"kickoff"} aria-label="Annual Gala">
          {#each splitLetters("Annual Gala") as ch, i (i)}<span class="ltr foil" aria-hidden="true" style={`--i:${i}`}>{ch === " " ? " " : ch}</span>{/each}
        </h1>
        <div class="rule draw" style="--d: 1500ms"></div>
        <div class="line rise" style="--d: 1700ms">The Latina Sweat Project at MCA Chicago · Friday, September 25, 2026</div>
      </div>
    {:else if seg.id === "hosts"}
      <div class="host-photo walkup">
        <img src={MCS.photo} alt="{MCS.first} and {MCS.second}, tonight’s MCs" />
      </div>
      <div class="host-text" data-fx-quiet>
        <div class="eyebrow rise" style="--d: 900ms">{MCS.label}</div>
        <div class="host-names">
          <span class="mask"><span class="serif foil nm" use:fitWidth style="--d: 1250ms">{MCS.first}</span></span>
          <span class="second">
            <span class="amp rise" style="--d: 1650ms">&amp;</span>
            <span class="mask"><span class="serif foil nm" use:fitWidth style="--d: 1850ms">{MCS.second}</span></span>
          </span>
        </div>
        <div class="rule draw left" style="--d: 2300ms"></div>
        <div class="line rise" style="--d: 2500ms">Please welcome your hosts for the evening</div>
      </div>
    {:else if seg.id === "dinner"}
      <div class="center-stack" style="top: calc(var(--u) * 360)">
        <div class="eyebrow rise" style="--d: 150ms">{seg.time} · {seg.eyebrow}</div>
        <h1 class="serif foil h-big rise" style="--d: 300ms">Dinner is served</h1>
        <div class="rule draw" style="--d: 700ms"></div>
        <ul class="menu">
          {#each MENU as m, i (m)}
            <li class="rise" style={`--d: ${900 + i * 220}ms`}><span class="dia"></span>{m}</li>
          {/each}
        </ul>
        <div class="line rise" style="--d: 1600ms; margin-top: calc(var(--u) * 26)">The program begins at 7:45 PM</div>
        <div class="perf rise" style="--d: 1800ms">
          <span class="eyebrow">Music tonight</span>
          <span class="mark perfmark"><img src={PERFORMERS.mariachi.logo} alt="" style={logoStyle(PERFORMERS.mariachi)} /></span>
          <span class="serif pname">{PERFORMERS.mariachi.name}</span>
        </div>
      </div>
    {:else if seg.id === "voices"}
      {#if !voice}
        <div class="center-stack" style="top: calc(var(--u) * 300)">
          <div class="eyebrow rise" style="--d: 150ms">{seg.eyebrow}</div>
          <h1 class="serif foil h-big rise" style="--d: 300ms">Featured Voices</h1>
          <div class="rule draw" style="--d: 700ms"></div>
        </div>
        <div class="voice-grid">
          {#each VOICES as v, i (v.slug)}
            <div class="vcell rise-scale" style={`--d: ${900 + i * 160}ms`}>
              <div class="portrait round small"><img src={v.photo} alt={v.name} /></div>
              <div class="vname">{v.name}</div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="portrait round big rise-scale" style="left: calc(var(--u) * 200); top: calc(var(--u) * 230)">
          <img src={voice.photo} alt={voice.name} />
        </div>
        <div class="side-text" data-fx-quiet>
          <div class="eyebrow rise" style="--d: 400ms">Featured Voice · {step} of {VOICES.length}</div>
          <div class="mask"><div class="serif foil nm-xl" use:fitWidth style="--d: 700ms">{voice.name}</div></div>
          <div class="rule draw left" style="--d: 1200ms"></div>
        </div>
      {/if}
    {:else if seg.id === "honors" && honor.kind === "remarks"}
      <div class="portrait round big rise-scale" style="left: calc(var(--u) * 200); top: calc(var(--u) * 230)">
        <img src={REMARKS.photo} alt={REMARKS.name} />
      </div>
      <div class="side-text" data-fx-quiet>
        <div class="eyebrow rise" style="--d: 400ms">Tonight’s Honors · Remarks</div>
        <div class="mask"><div class="serif foil nm-lg" use:fitWidth style="--d: 700ms">{REMARKS.name}</div></div>
        <div class="role rise" style="--d: 1100ms">{REMARKS.role}, The Latina Sweat Project</div>
        <div class="rule draw left" style="--d: 1300ms"></div>
      </div>
    {:else if seg.id === "honors" && honoree}
      {#if !honor.revealed}
        <div class="honor-text" data-fx-quiet>
          <div class="eyebrow rise" style="--d: 150ms">Tonight’s Honors · {honor.index + 1} of {HONOREES.length}</div>
          <h1 class="serif foil h-honor rise" style="--d: 350ms">{honoree.title}</h1>
          <div class="rule draw left" style="--d: 800ms"></div>
          <p class="desc rise" style="--d: 1000ms">{honoree.description}</p>
          <div class="presenter rise" style="--d: 1300ms">Presented by {honoree.presenter}</div>
          <div class="await rise" style="--d: 1600ms">And the honor goes to</div>
        </div>
        <div class="mystery" aria-hidden="true">
          <div class="ring-pulse"></div>
        </div>
      {:else}
        <div class="portrait round honoree reveal" use:moment={"reveal"}>
          {#if honoree.photo}
            <img src={honoree.photo} alt={honoree.name} />
          {:else}
            <div class="mono"><span class="serif">{monogram(honoree.name)}</span></div>
          {/if}
          <div class="burst-ring" aria-hidden="true"></div>
        </div>
        <div class="honoree-text" data-fx-quiet>
          <div class="eyebrow rise" style="--d: 200ms">{honoree.title}</div>
          <div class="mask tall"><div class="serif foil nm-honoree" use:fitWidth={0.66} style="--d: 450ms">{honoree.name}</div></div>
          <div class="rule draw left" style="--d: 1100ms"></div>
          <p class="desc small rise" style="--d: 1300ms">{honoree.description}</p>
          <div class="presenter rise" style="--d: 1500ms">Presented by {honoree.presenter}</div>
        </div>
      {/if}
    {:else if seg.id === "fashion-show"}
      <div class="center-stack" style="top: calc(var(--u) * 290)">
        <div class="eyebrow rise" style="--d: 150ms">{seg.time} · {seg.eyebrow}</div>
        <h1 class="serif foil h-big rise" style="--d: 300ms">The Fashion Show</h1>
        <div class="rule draw" style="--d: 700ms"></div>
      </div>
      <div class="brands">
        {#each FASHION as b, i (b.name)}
          <div class="brand rise-scale" style={`--d: ${900 + i * 180}ms`}>
            <div class="mark brandmark"><img src={b.logo} alt="" style={logoStyle(b)} /></div>
            <div class="bcap">{b.name}</div>
          </div>
        {/each}
      </div>
    {:else if seg.id === "dj"}
      <div class="center-stack" style="top: calc(var(--u) * 540)">
        <div class="eyebrow rise" style="--d: 150ms">{seg.time} · After party</div>
        <div class="mark djmark rise-scale" style="--d: 350ms"><img src={PERFORMERS.dj.logo} alt={PERFORMERS.dj.name} style={logoStyle(PERFORMERS.dj)} /></div>
        <div class="rule draw" style="--d: 800ms"></div>
        <div class="serif dj-line rise" style="--d: 1000ms">DJ &amp; Open Bar Until Midnight</div>
      </div>
    {:else if seg.id === "thanks"}
      <div class="center-stack" style="top: calc(var(--u) * 320)">
        <div class="eyebrow rise" style="--d: 150ms">{seg.eyebrow}</div>
        <h1 class="serif foil h-hero rise" style="--d: 350ms">Gracias, comunidad</h1>
        {#if showTotal}
          <div class="line rise" style="--d: 900ms">{COPY.raisedTonight} · <b class="gold">{totalText}</b></div>
        {/if}
      </div>
      <div class="spons rise" style="--d: 1300ms">
        <div class="eyebrow">{COPY.sponsorsEyebrow}</div>
        {@render sponsorRows()}
      </div>
    {:else if seg.id === "sponsors"}
      <div class="center-stack" style="top: calc(var(--u) * 250)">
        <div class="eyebrow rise" style="--d: 150ms">{seg.eyebrow}</div>
        <h1 class="serif foil h-big rise" style="--d: 350ms">Thank you to our sponsors</h1>
        <div class="rule draw" style="--d: 800ms"></div>
      </div>
      <div class="spons big rise" style="--d: 1000ms">
        {@render sponsorRows()}
      </div>
    {:else if seg.id === "silent-auction"}
      <div class="auc-text" data-fx-quiet>
        <div class="eyebrow rise" style="--d: 150ms">Silent auction · {seg.eyebrow}</div>
        <h1 class="serif foil h-big rise" style="--d: 350ms">Last call to bid</h1>
        <div class="rule draw left" style="--d: 800ms"></div>
        <div class="line rise" style="--d: 1000ms">Bid at <b class="gold">{SILENT_AUCTION_LABEL}</b></div>
      </div>
      <div class="auc-qr rise-scale" style="--d: 900ms" data-fx-quiet>
        {#if aucQr}<img src={aucQr} alt="QR code for {SILENT_AUCTION_LABEL}" />{/if}
        <div class="auc-cap">Scan to bid</div>
      </div>
    {:else}
      <!-- Calm title cards: gallery, and any future segment. -->
      <div class="center-stack" style="top: calc(var(--u) * 560)">
        <div class="eyebrow rise" style="--d: 150ms">{seg.time ? `${seg.time} · ` : ""}{seg.eyebrow}</div>
        <h1 class="serif foil h-hero rise" style="--d: 350ms">{seg.title}</h1>
        <div class="rule draw" style="--d: 900ms"></div>
        {#if seg.id === "gallery"}
          <div class="line rise" style="--d: 1100ms">The galleries are open · Open bar · Late Night guests, welcome</div>
        {/if}
      </div>
    {/if}
  </section>
{/key}

{#snippet sponsorRows()}
  {#if sponsors.length}
    <div class="srow">
      {#each sponsors as sp (sp.name || sp.logo_url)}
        <div class="scell">
          {#if sp.logo_url}<div class="mark smark"><img src={sp.logo_url} alt={sp.name || ""} /></div>{/if}
          {#if sp.name}<div class="bcap">{sp.name}</div>{/if}
        </div>
      {/each}
    </div>
  {:else}
    {#each SPONSOR_ROWS as row, r (r)}
      <div class="srow" class:featured={r === 0}>
        {#each row as sp (sp.name)}
          <div class="scell">
            <div class="mark smark"><img src={sp.logo} alt={sp.name} style={logoStyle(sp)} /></div>
            <div class="bcap">{sp.name}</div>
          </div>
        {/each}
      </div>
    {/each}
  {/if}
{/snippet}

{#if showRoll}
  <div class="roll-zone" data-fx-quiet>
    <RollCall {rows} {overflow} {reduced} />
  </div>
{/if}

{#if banner}
  <div class="banner-zone"><Banner {banner} {reduced} /></div>
{/if}

<style>
  .hdr,
  .zone-x,
  .view,
  .roll-zone,
  .banner-zone {
    position: absolute;
  }
  .hdr {
    left: calc(var(--u) * 96);
    right: calc(var(--u) * 96);
    top: calc(var(--u) * 54);
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-weight: 800;
    letter-spacing: 0.42em;
    font-size: calc(var(--u) * 26);
    text-transform: uppercase;
    color: var(--g26-cream);
    text-shadow: 0 calc(var(--u) * 2) calc(var(--u) * 12) rgba(5, 7, 12, 0.85);
    z-index: 3;
  }
  .hdr .sub {
    color: var(--g26-gold);
    letter-spacing: 0.3em;
  }
  .zone-x {
    pointer-events: none;
  }
  .xfb {
    position: absolute;
    inset: 0;
    opacity: 0.55;
  }
  .view {
    inset: 0;
    pointer-events: none;
  }

  /* ---------- type ---------- */
  .serif {
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
  }
  .foil {
    background: linear-gradient(100deg, #b9842f 0%, #ffbd59 28%, #fff1be 48%, #ffbd59 66%, #f4a833 82%, #b9842f 100%);
    background-size: 220% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: g26shimmer 7s linear infinite;
    filter: drop-shadow(0 calc(var(--u) * 4) calc(var(--u) * 18) rgba(5, 7, 12, 0.7));
  }
  .still .foil {
    animation: none;
  }
  @keyframes g26shimmer {
    from {
      background-position: 110% 0;
    }
    to {
      background-position: -110% 0;
    }
  }
  .eyebrow {
    font-weight: 800;
    letter-spacing: 0.36em;
    font-size: calc(var(--u) * 28);
    color: var(--g26-gold);
    text-transform: uppercase;
    line-height: 1.2;
  }
  .line {
    font-size: calc(var(--u) * 36);
    font-weight: 600;
    color: var(--g26-warm);
    letter-spacing: 0.02em;
  }
  .gold {
    color: var(--g26-gold);
  }
  .h-hero {
    margin: calc(var(--u) * 8) 0 0;
    font-size: calc(var(--u) * 168);
    line-height: 1.02;
    white-space: nowrap;
  }
  .h-big {
    margin: calc(var(--u) * 8) 0 0;
    font-size: calc(var(--u) * 124);
    line-height: 1.04;
    white-space: nowrap;
  }
  .rule {
    height: calc(var(--u) * 3);
    width: calc(var(--u) * 520);
    margin: calc(var(--u) * 18) auto;
    background: linear-gradient(90deg, rgba(255, 189, 89, 0), var(--g26-gold), rgba(255, 189, 89, 0));
  }
  .rule.left {
    margin-left: 0;
    background: linear-gradient(90deg, var(--g26-gold), rgba(255, 189, 89, 0));
  }

  /* ---------- entrances (black tie: slow in, decisive, settles) ---------- */
  .rise {
    opacity: 0;
    animation: g26rise 900ms var(--g26-ease) var(--d, 0ms) forwards;
  }
  .rise-scale {
    opacity: 0;
    animation: g26risescale 1100ms var(--g26-ease) var(--d, 0ms) forwards;
  }
  .draw {
    transform: scaleX(0);
    animation: g26draw 700ms var(--g26-ease) var(--d, 0ms) forwards;
  }
  .mask {
    display: block;
    overflow: hidden;
    padding: 0 0.12em 0.08em 0.02em;
  }
  .mask > * {
    display: inline-block;
    transform: translateY(108%);
    animation: g26mask 900ms var(--g26-ease) var(--d, 0ms) forwards;
  }
  /* Foil text that also makes an entrance runs both animations. */
  .foil.rise {
    animation:
      g26rise 900ms var(--g26-ease) var(--d, 0ms) forwards,
      g26shimmer 7s linear infinite;
  }
  .mask > .foil {
    animation:
      g26mask 900ms var(--g26-ease) var(--d, 0ms) forwards,
      g26shimmer 7s linear infinite;
  }
  .ltr.foil {
    animation:
      g26ltr 1000ms var(--g26-ease) calc(500ms + var(--i) * 70ms) forwards,
      g26shimmer 7s linear infinite;
  }
  .still .rise,
  .still .rise-scale,
  .still .draw,
  .still .mask > *,
  .still .ltr,
  .still .walkup,
  .still .reveal {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
    filter: none;
  }
  @keyframes g26rise {
    from {
      opacity: 0;
      transform: translateY(calc(var(--u) * 26));
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes g26risescale {
    from {
      opacity: 0;
      transform: scale(0.86);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes g26draw {
    to {
      transform: scaleX(1);
    }
  }
  @keyframes g26mask {
    to {
      transform: none;
    }
  }

  .center-stack {
    position: absolute;
    left: calc(var(--u) * 140);
    right: calc(var(--u) * 140);
    text-align: center;
  }

  /* ---------- welcome: the kickoff ---------- */
  .ltr {
    display: inline-block;
    opacity: 0;
    transform: translateY(calc(var(--u) * 40)) scale(0.9);
    animation: g26ltr 1000ms var(--g26-ease) calc(500ms + var(--i) * 70ms) forwards;
  }
  @keyframes g26ltr {
    to {
      opacity: 1;
      transform: none;
    }
  }

  /* ---------- seating ---------- */
  .seat-head {
    position: absolute;
    left: calc(var(--u) * 96);
    top: calc(var(--u) * 40);
  }
  .h-seat {
    margin: calc(var(--u) * 2) 0 0;
    font-size: calc(var(--u) * 92);
    line-height: 1;
    color: var(--g26-cream);
  }
  .seat-meta {
    position: absolute;
    right: calc(var(--u) * 290);
    top: calc(var(--u) * 70);
    text-align: right;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: calc(var(--u) * 22);
    line-height: 1.5;
    color: var(--g26-warm);
  }
  .seat-board {
    position: absolute;
    left: calc(var(--u) * 96);
    top: calc(var(--u) * 196);
  }
  .seat-foot {
    position: absolute;
    left: calc(var(--u) * 96);
    width: calc(var(--u) * 1060);
    top: calc(var(--u) * 948);
    font-weight: 700;
    font-size: calc(var(--u) * 24);
    color: var(--g26-muted);
    line-height: 1.35;
  }

  .demo-plate {
    position: absolute;
    left: calc(var(--u) * 560);
    top: calc(var(--u) * 430);
    width: calc(var(--u) * 800);
    padding: calc(var(--u) * 26) calc(var(--u) * 30);
    z-index: 8;
    text-align: center;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-size: calc(var(--u) * 44);
    line-height: 1.2;
    color: var(--g26-ink);
    background: var(--g26-alert);
    border: calc(var(--u) * 4) solid var(--g26-cream);
    border-radius: calc(var(--u) * 6);
    box-shadow: 0 0 calc(var(--u) * 60) rgba(5, 7, 12, 0.9);
    transform: rotate(-4deg);
  }

  /* ---------- hosts: the walk up ---------- */
  .host-photo {
    position: absolute;
    left: calc(var(--u) * 190);
    top: calc(var(--u) * 150);
    width: calc(var(--u) * 500);
    height: calc(var(--u) * 750);
    border-radius: calc(var(--u) * 6);
    overflow: hidden;
    box-shadow:
      0 0 0 calc(var(--u) * 2) rgba(255, 189, 89, 0.6),
      0 0 calc(var(--u) * 80) rgba(255, 189, 89, 0.25);
  }
  .host-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .walkup {
    opacity: 0;
    animation: g26walk 2000ms cubic-bezier(0.2, 0.7, 0.2, 1) 250ms forwards;
  }
  @keyframes g26walk {
    0% {
      opacity: 0;
      transform: translateX(calc(var(--u) * -260)) translateY(calc(var(--u) * 30)) scale(0.9);
      filter: brightness(0.25);
    }
    60% {
      opacity: 1;
    }
    100% {
      opacity: 1;
      transform: none;
      filter: brightness(1);
    }
  }
  .host-text {
    position: absolute;
    left: calc(var(--u) * 820);
    right: calc(var(--u) * 96);
    top: calc(var(--u) * 300);
    padding: calc(var(--u) * 18) calc(var(--u) * 28);
    background: rgba(5, 7, 12, 0.55);
    border-radius: calc(var(--u) * 6);
  }
  .host-names {
    display: flex;
    flex-direction: column;
    margin-top: calc(var(--u) * 6);
  }
  .host-names .second {
    display: flex;
    align-items: baseline;
    gap: calc(var(--u) * 26);
    padding-left: calc(var(--u) * 90);
  }
  .host-names .nm {
    font-size: calc(var(--u) * 140 * var(--fit, 1));
    line-height: 1.02;
  }
  .amp {
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: calc(var(--u) * 96);
    color: var(--g26-cream);
  }

  /* ---------- portraits ---------- */
  .portrait {
    position: absolute;
    overflow: hidden;
  }
  .portrait img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .round {
    border-radius: 50%;
    box-shadow:
      0 0 0 calc(var(--u) * 4) rgba(5, 7, 12, 0.9),
      0 0 0 calc(var(--u) * 7) var(--g26-gold),
      0 0 calc(var(--u) * 90) rgba(255, 189, 89, 0.35);
  }
  .round.big {
    width: calc(var(--u) * 500);
    height: calc(var(--u) * 500);
  }
  .round.small {
    position: relative;
    width: calc(var(--u) * 210);
    height: calc(var(--u) * 210);
  }
  .side-text {
    position: absolute;
    left: calc(var(--u) * 820);
    right: calc(var(--u) * 96);
    top: calc(var(--u) * 300);
    padding: calc(var(--u) * 18) calc(var(--u) * 28);
    background: rgba(5, 7, 12, 0.55);
    border-radius: calc(var(--u) * 6);
  }
  .nm-lg {
    font-size: calc(var(--u) * 92 * var(--fit, 1));
    line-height: 1.08;
    color: var(--g26-cream);
  }
  .nm-xl {
    font-size: calc(var(--u) * 132 * var(--fit, 1));
    line-height: 1.06;
  }
  .role {
    font-size: calc(var(--u) * 32);
    font-weight: 700;
    color: var(--g26-warm);
  }
  .quote {
    margin: 0;
    font-size: calc(var(--u) * 56);
    line-height: 1.22;
    color: var(--g26-cream);
  }

  /* ---------- dinner ---------- */
  .menu {
    list-style: none;
    margin: calc(var(--u) * 8) 0 0;
    padding: 0;
    display: flex;
    justify-content: center;
    gap: calc(var(--u) * 40);
  }
  .menu li {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 16);
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: calc(var(--u) * 44);
    color: var(--g26-cream);
    white-space: nowrap;
  }
  .dia {
    width: calc(var(--u) * 14);
    height: calc(var(--u) * 14);
    transform: rotate(45deg);
    background: var(--g26-gold);
  }
  .perf {
    margin-top: calc(var(--u) * 54);
    display: inline-flex;
    align-items: center;
    gap: calc(var(--u) * 24);
  }
  .perf .eyebrow {
    font-size: calc(var(--u) * 24);
  }
  .pname {
    font-size: calc(var(--u) * 56);
    color: var(--g26-cream);
  }
  /* Logos: white knockouts straight on the stage. No plate, border or ring:
     each mark sits in an invisible fixed cell, contained and centred. */
  .mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }
  /* Every logo: an explicit cell, the img filling it with object-fit contain,
     then its optical scale (--s) and wordmark height cap (--h). */
  .mark img {
    display: block;
    width: 100%;
    height: calc(100% * var(--h, 1));
    object-fit: contain;
    transform: scale(var(--s, 1));
    opacity: 0.92;
  }
  .perfmark {
    height: calc(var(--u) * 84);
    width: calc(var(--u) * 250);
  }
  /* ---------- voices ---------- */
  .voice-grid {
    position: absolute;
    left: calc(var(--u) * 96);
    right: calc(var(--u) * 96);
    top: calc(var(--u) * 560);
    display: flex;
    justify-content: center;
    gap: calc(var(--u) * 48);
  }
  .vcell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: calc(var(--u) * 18);
    width: calc(var(--u) * 240);
  }
  .vname {
    text-align: center;
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: calc(var(--u) * 36);
    line-height: 1.1;
    color: var(--g26-cream);
  }

  /* ---------- honors ---------- */
  .honor-text {
    position: absolute;
    left: calc(var(--u) * 96);
    width: calc(var(--u) * 1080);
    top: calc(var(--u) * 200);
    padding: calc(var(--u) * 20) calc(var(--u) * 30);
    background: rgba(5, 7, 12, 0.6);
    border-left: calc(var(--u) * 5) solid var(--g26-gold);
    border-radius: calc(var(--u) * 4);
  }
  .h-honor {
    margin: calc(var(--u) * 10) 0 0;
    font-size: calc(var(--u) * 112);
    line-height: 1.04;
  }
  .desc {
    margin: 0;
    font-size: calc(var(--u) * 40);
    line-height: 1.35;
    font-weight: 500;
    color: var(--g26-warm);
  }
  .desc.small {
    font-size: calc(var(--u) * 32);
  }
  .await {
    margin-top: calc(var(--u) * 34);
    font-weight: 800;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    font-size: calc(var(--u) * 28);
    color: var(--g26-gold);
  }
  .mystery {
    position: absolute;
    left: calc(var(--u) * 1330);
    top: calc(var(--u) * 300);
    width: calc(var(--u) * 340);
    height: calc(var(--u) * 340);
  }
  .ring-pulse {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: calc(var(--u) * 3) solid rgba(255, 189, 89, 0.75);
    box-shadow:
      0 0 calc(var(--u) * 60) rgba(255, 189, 89, 0.35),
      inset 0 0 calc(var(--u) * 60) rgba(255, 189, 89, 0.2);
    animation: g26breathe 3.2s ease-in-out infinite;
  }
  .still .ring-pulse {
    animation: none;
  }
  @keyframes g26breathe {
    0%,
    100% {
      transform: scale(0.94);
      opacity: 0.65;
    }
    50% {
      transform: scale(1.04);
      opacity: 1;
    }
  }
  .honoree {
    left: calc(var(--u) * 190);
    top: calc(var(--u) * 240);
    width: calc(var(--u) * 560);
    height: calc(var(--u) * 560);
    overflow: visible;
  }
  .honoree img,
  .honoree .mono {
    border-radius: 50%;
  }
  .honoree img {
    position: relative;
    z-index: 1;
  }
  .reveal {
    animation: g26reveal 1400ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @keyframes g26reveal {
    0% {
      opacity: 0;
      transform: scale(0.55);
      filter: blur(calc(var(--u) * 18)) brightness(2);
    }
    55% {
      opacity: 1;
      filter: blur(0) brightness(1.35);
    }
    100% {
      opacity: 1;
      transform: none;
      filter: none;
    }
  }
  .burst-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: calc(var(--u) * 6) solid var(--g26-gold-hi);
    opacity: 0;
    animation: g26burst 1600ms ease-out 250ms;
    pointer-events: none;
  }
  .still .burst-ring {
    display: none;
  }
  @keyframes g26burst {
    0% {
      opacity: 0.95;
      transform: scale(0.9);
    }
    100% {
      opacity: 0;
      transform: scale(1.7);
    }
  }
  .mono {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at 50% 35%, rgba(255, 189, 89, 0.28), transparent 62%),
      linear-gradient(160deg, #1b2a40, #0b1320 60%, #05070c);
  }
  .mono span {
    font-size: calc(var(--u) * 230);
    color: var(--g26-gold);
    letter-spacing: 0.02em;
    text-shadow: 0 0 calc(var(--u) * 40) rgba(255, 189, 89, 0.45);
  }
  .honoree-text {
    position: absolute;
    left: calc(var(--u) * 860);
    right: calc(var(--u) * 96);
    top: calc(var(--u) * 250);
    padding: calc(var(--u) * 20) calc(var(--u) * 30);
    background: rgba(5, 7, 12, 0.6);
    border-radius: calc(var(--u) * 6);
  }
  .mask.tall {
    padding-bottom: 0.14em;
  }
  .nm-honoree {
    font-size: calc(var(--u) * 132 * var(--fit, 1));
    line-height: 1.08;
  }

  /* ---------- fashion ---------- */
  .brands {
    position: absolute;
    left: calc(var(--u) * 96);
    right: calc(var(--u) * 96);
    top: calc(var(--u) * 560);
    display: flex;
    justify-content: center;
    gap: calc(var(--u) * 36);
  }
  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: calc(var(--u) * 14);
  }
  .brandmark {
    width: calc(var(--u) * 240);
    height: calc(var(--u) * 150);
  }
  .bcap {
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-size: calc(var(--u) * 20);
    color: var(--g26-warm);
    text-align: center;
  }
  .dj-line {
    font-size: calc(var(--u) * 64);
    color: var(--g26-cream);
  }
  .djmark {
    display: flex;
    height: calc(var(--u) * 220);
    width: calc(var(--u) * 620);
    margin: calc(var(--u) * 10) auto 0;
  }

  /* ---------- thanks ---------- */
  .spons {
    position: absolute;
    left: calc(var(--u) * 96);
    width: calc(var(--u) * 1100);
    top: calc(var(--u) * 590);
    text-align: center;
  }
  .srow {
    margin-top: calc(var(--u) * 16);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: calc(var(--u) * 44);
  }
  .scell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: calc(var(--u) * 8);
    width: calc(var(--u) * 230);
  }
  .smark {
    width: calc(var(--u) * 200);
    height: calc(var(--u) * 66);
  }
  .srow.featured .scell {
    width: calc(var(--u) * 370);
  }
  .srow.featured .smark {
    width: calc(var(--u) * 360);
    height: calc(var(--u) * 120);
  }
  .scell .bcap {
    font-size: calc(var(--u) * 17);
    line-height: 1.25;
  }

  .spons:not(.big) .srow.featured .scell {
    width: calc(var(--u) * 330);
  }
  .spons:not(.big) .srow.featured .smark {
    width: calc(var(--u) * 320);
    height: calc(var(--u) * 108);
  }
  .spons.big {
    left: calc(var(--u) * 96);
    width: calc(var(--u) * 1728);
    top: calc(var(--u) * 470);
  }
  .spons.big .srow {
    gap: calc(var(--u) * 64);
    margin-top: calc(var(--u) * 26);
  }
  .spons.big .srow.featured .scell {
    width: calc(var(--u) * 470);
  }
  .spons.big .srow.featured .smark {
    width: calc(var(--u) * 460);
    height: calc(var(--u) * 150);
  }
  .spons.big .scell {
    width: calc(var(--u) * 300);
  }
  .spons.big .smark {
    width: calc(var(--u) * 290);
    height: calc(var(--u) * 92);
  }
  .spons.big .bcap {
    font-size: calc(var(--u) * 20);
  }
  .auc-text {
    position: absolute;
    left: calc(var(--u) * 96);
    width: calc(var(--u) * 1080);
    top: calc(var(--u) * 320);
    padding: calc(var(--u) * 20) calc(var(--u) * 30);
    background: rgba(5, 7, 12, 0.6);
    border-left: calc(var(--u) * 5) solid var(--g26-gold);
    border-radius: calc(var(--u) * 4);
  }
  .auc-qr {
    position: absolute;
    left: calc(var(--u) * 1330);
    top: calc(var(--u) * 300);
    width: calc(var(--u) * 360);
    text-align: center;
  }
  .auc-qr img {
    display: block;
    width: 100%;
    background: var(--g26-cream);
    padding: calc(var(--u) * 12);
    border-radius: calc(var(--u) * 6);
    image-rendering: pixelated;
  }
  .auc-cap {
    margin-top: calc(var(--u) * 14);
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: calc(var(--u) * 48);
    color: var(--g26-cream);
  }
  .presenter {
    margin-top: calc(var(--u) * 16);
    font-weight: 700;
    font-size: calc(var(--u) * 28);
    color: var(--g26-gold-soft);
    letter-spacing: 0.04em;
  }
  .quote.wide {
    max-width: calc(var(--u) * 1400);
    margin: 0 auto calc(var(--u) * 20);
    font-size: calc(var(--u) * 76);
  }

  /* ---------- gifts during the program ---------- */
  .roll-zone {
    left: calc(var(--u) * 96);
    width: calc(var(--u) * 1040);
    top: calc(var(--u) * 930);
    height: calc(var(--u) * 96);
  }
  .banner-zone {
    left: calc(var(--u) * 460);
    width: calc(var(--u) * 1000);
    top: calc(var(--u) * 140);
    height: calc(var(--u) * 180);
    z-index: 6;
  }
</style>
