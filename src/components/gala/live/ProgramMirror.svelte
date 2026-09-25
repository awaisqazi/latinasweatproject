<script>
  // What a guest's phone shows of the program on the big screen. Same
  // catalogue, same theming, lighter motion: CSS only, no WebGL, nothing at all
  // under prefers-reduced-motion. Data is the public aggregate the page already
  // polls every ~10 s (gala_display_public): never a websocket, never a name
  // from the seating plan. During the seating loop the phone gets the corridor
  // map with table numbers only.
  import {
    HONOREES, VOICES, MENU, MCS, FOUNDER, FASHION, PERFORMERS, REMARKS, SPONSOR_ROWS, TABLE_ROWS, SILENT_AUCTION_URL, SILENT_AUCTION_LABEL,
    segmentById, normalizePos, honorAt, voiceAt, resolveHonoree, monogram, logoStyle,
  } from "../../../lib/galaLive/program.js";
  import { money } from "../../../lib/galaLive/config.js";

  let { program = {}, scene = "program", levelCents = null, impactLine = "", reduced = false, demo = false } = $props();

  const pos = $derived(normalizePos(program));
  const view = $derived(scene === "appeal" || scene === "auction" ? "appeal" : scene === "thanks" || scene === "finale" ? "thanks" : pos.seg);
  const seg = $derived(segmentById(view) || segmentById(pos.seg));
  const honor = $derived(view === "honors" ? honorAt(pos.step) : null);
  const honoree = $derived(honor?.kind === "honor" ? resolveHonoree(HONOREES[honor.index], program?.honoree_overrides) : null);
  const voice = $derived(view === "voices" ? voiceAt(pos.step) : null);
  const key = $derived(
    view === "honors" ? `h-${pos.step}` : view === "voices" ? `v-${pos.step}` : view,
  );
</script>

{#snippet sponsorRows()}
  {#each SPONSOR_ROWS as row, r (r)}
    <div class="logos" class:featured={r === 0}>
      {#each row as sp (sp.name)}
        <div class="lcell"><div class="mark"><img src={sp.logo} alt={sp.name} style={logoStyle(sp)} /></div><span class="cap">{sp.name}</span></div>
      {/each}
    </div>
  {/each}
{/snippet}

<section class="pm" class:still={reduced} aria-live="polite">
  <div class="now">Now on the screen</div>
  {#key key}
    <div class="card">
      {#if view === "seating"}
        <div class="eyebrow">{seg.time} · Welcome</div>
        <h2 class="serif">Find your table</h2>
        <p class="lead">Find your table on the screens, or ask a host.</p>
        {#if demo}<div class="demo-plate" role="note">DEMO DATA · not the real seating</div>{/if}
        <div class="map" aria-label="Dinner corridor map, table numbers">
          <div class="mapends"><span>Coat check</span><span>Entrance</span></div>
          <div class="cols">
            {#each TABLE_ROWS as row, i (i)}
              <div class="col">
                {#each row as n (n)}<div class="tb">{n}</div>{/each}
              </div>
            {/each}
          </div>
          <div class="mapnote">Podium on the N. Gallery side</div>
        </div>
      {:else if view === "appeal"}
        <div class="eyebrow">8:15 PM · Live bidding</div>
        <h2 class="serif foil">Raise your paddle</h2>
        {#if levelCents}
          <div class="level">{money(levelCents)}</div>
          {#if impactLine}<p class="lead">{impactLine}</p>{/if}
        {/if}
      {:else if view === "thanks"}
        <div class="eyebrow">With gratitude</div>
        <h2 class="serif foil">Gracias, comunidad</h2>
        <div class="eyebrow small">With thanks to our sponsors</div>
        {@render sponsorRows()}
      {:else if view === "sponsors"}
        <div class="eyebrow">With gratitude</div>
        <h2 class="serif foil">Thank you to our sponsors</h2>
        {@render sponsorRows()}
      {:else if view === "silent-auction"}
        <div class="eyebrow">Silent auction · Last call</div>
        <h2 class="serif foil">Last call to bid</h2>
        <a class="bid" href={SILENT_AUCTION_URL} rel="noopener">Bid now</a>
        <p class="small">{SILENT_AUCTION_LABEL}</p>
      {:else if view === "hosts"}
        <div class="eyebrow">{MCS.label}</div>
        <div class="hostrow">
          <img class="hostimg" src={MCS.photo} alt="" loading="lazy" />
          <h2 class="serif foil">{MCS.first} <span class="amp">&amp;</span> {MCS.second}</h2>
        </div>
      {:else if view === "welcome"}
        <div class="eyebrow">Welcome to the</div>
        <h2 class="serif foil big">Annual Gala</h2>
        <p class="lead">The Latina Sweat Project at MCA Chicago</p>
      {:else if view === "welcome-remarks"}
        <div class="eyebrow">{seg.time} · Welcome remarks</div>
        <blockquote class="serif quote">“{FOUNDER.quote}”</blockquote>
        <p class="small">{FOUNDER.name}, {FOUNDER.role}</p>
      {:else if view === "dinner"}
        <div class="eyebrow">{seg.time} · Buen provecho</div>
        <h2 class="serif foil">Dinner is served</h2>
        <ul class="menu">{#each MENU as m (m)}<li>{m}</li>{/each}</ul>
        <p class="lead">The program begins at 7:45 PM</p>
        <p class="small">Music tonight by {PERFORMERS.mariachi.name}</p>
      {:else if view === "voices"}
        <div class="eyebrow">{seg.time} · Featured Voices</div>
        {#if voice}
          <div class="person">
            <img class="round" src={voice.photo} alt="" loading="lazy" />
            <h2 class="serif foil">{voice.name}</h2>
          </div>
        {:else}
          <h2 class="serif foil">Featured Voices</h2>
          <div class="vgrid">
            {#each VOICES as v (v.slug)}
              <div class="vc"><img class="round sm" src={v.photo} alt="" loading="lazy" /><span>{v.name}</span></div>
            {/each}
          </div>
        {/if}
      {:else if view === "honors"}
        {#if honor.kind === "remarks"}
          <div class="eyebrow">Tonight’s Honors · Remarks</div>
          <div class="person">
            <img class="round" src={REMARKS.photo} alt="" loading="lazy" />
            <h2 class="serif foil">{REMARKS.name}</h2>
          </div>
        {:else if honoree}
          <div class="eyebrow">Tonight’s Honors · {honor.index + 1} of {HONOREES.length}</div>
          <h2 class="serif foil">{honoree.title}</h2>
          {#if honor.revealed}
            <div class="person reveal">
              {#if honoree.photo}
                <img class="round" src={honoree.photo} alt="" />
              {:else}
                <div class="round mono"><span class="serif">{monogram(honoree.name)}</span></div>
              {/if}
              <div class="honname serif">{honoree.name}</div>
            </div>
          {/if}
          <p class="lead">{honoree.description}</p>
          <p class="small">Presented by {honoree.presenter}</p>
        {/if}
      {:else if view === "fashion-show"}
        <div class="eyebrow">{seg.time} · On the runway</div>
        <h2 class="serif foil">The Fashion Show</h2>
        <div class="logos fashion">
          {#each FASHION as b (b.name)}
            <div class="lcell"><div class="mark"><img src={b.logo} alt={b.name} style={logoStyle(b)} /></div><span class="cap">{b.name}</span></div>
          {/each}
        </div>
      {:else if view === "dj"}
        <div class="eyebrow">{seg.time} · After party</div>
        <h2 class="serif foil">DJ Mateo</h2>
        <p class="lead">DJ &amp; Open Bar Until Midnight</p>
      {:else if view === "gallery"}
        <div class="eyebrow">{seg.time}</div>
        <h2 class="serif foil">Gallery &amp; Open Bar</h2>
        <p class="lead">The galleries are open · Open bar · Late Night guests, welcome</p>
      {:else}
        <div class="eyebrow">{seg.time ? `${seg.time} · ` : ""}{seg.eyebrow}</div>
        <h2 class="serif foil">{seg.title}</h2>
      {/if}
    </div>
  {/key}
</section>

<style>
  .pm {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .now {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 8px 0;
    background: var(--g26-night, #0b1320);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: var(--g26-gold-soft);
    text-align: center;
  }
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 22px 18px 20px;
    text-align: center;
    border: 1px solid rgba(255, 189, 89, 0.3);
    border-radius: 6px;
    background:
      radial-gradient(120% 80% at 50% 0%, rgba(255, 189, 89, 0.1), transparent 70%),
      var(--g26-navy);
    animation: pmin 600ms var(--g26-ease) both;
  }
  @keyframes pmin {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .eyebrow {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--g26-gold);
  }
  .eyebrow.small {
    font-size: 11px;
  }
  .serif {
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
  }
  h2 {
    margin: 0;
    font-size: 34px;
    line-height: 1.08;
    color: var(--g26-cream);
  }
  h2.big {
    font-size: 48px;
  }
  .foil {
    background: linear-gradient(100deg, #b9842f, #ffbd59 30%, #fff1be 50%, #ffbd59 70%, #b9842f);
    background-size: 220% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: pmshimmer 7s linear infinite;
  }
  @keyframes pmshimmer {
    from {
      background-position: 110% 0;
    }
    to {
      background-position: -110% 0;
    }
  }
  .lead {
    margin: 0;
    font-size: 16px;
    line-height: 1.45;
    color: var(--g26-warm);
  }
  .small {
    margin: 0;
    font-size: 14px;
    color: var(--g26-muted);
  }
  .quote {
    margin: 4px 0 0;
    font-size: 23px;
    line-height: 1.3;
    color: var(--g26-cream);
  }
  .level {
    font-family: var(--g26-serif);
    font-size: 44px;
    color: var(--g26-cream);
    font-variant-numeric: lining-nums;
  }
  .menu {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: 21px;
    color: var(--g26-cream);
  }
  .tier {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .names {
    font-size: 16px;
    color: var(--g26-cream);
    line-height: 1.4;
  }
  .hostrow {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .hostimg {
    width: 150px;
    height: 225px;
    object-fit: cover;
    border-radius: 4px;
    box-shadow: 0 0 0 1px rgba(255, 189, 89, 0.6);
  }
  .amp {
    color: var(--g26-cream);
    -webkit-text-fill-color: var(--g26-cream);
  }
  .person {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .round {
    width: 150px;
    height: 150px;
    border-radius: 50%;
    object-fit: cover;
    box-shadow:
      0 0 0 3px var(--g26-night),
      0 0 0 5px var(--g26-gold),
      0 0 40px rgba(255, 189, 89, 0.3);
  }
  .round.sm {
    width: 64px;
    height: 64px;
  }
  .mono {
    display: grid;
    place-items: center;
    background: linear-gradient(160deg, #1b2a40, #0b1320 60%, #05070c);
  }
  .mono span {
    font-size: 60px;
    color: var(--g26-gold);
  }
  .honname {
    font-size: 32px;
    line-height: 1.1;
    color: var(--g26-cream);
  }
  .reveal {
    animation: pmreveal 1100ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .reveal .round {
    animation: pmglow 1600ms ease-out 200ms both;
  }
  @keyframes pmreveal {
    from {
      opacity: 0;
      transform: scale(0.8);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes pmglow {
    0% {
      box-shadow:
        0 0 0 3px var(--g26-night),
        0 0 0 5px var(--g26-gold-hi),
        0 0 90px rgba(255, 241, 190, 0.9);
    }
    100% {
      box-shadow:
        0 0 0 3px var(--g26-night),
        0 0 0 5px var(--g26-gold),
        0 0 40px rgba(255, 189, 89, 0.3);
    }
  }
  .vgrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px 8px;
    width: 100%;
  }
  .vc {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--g26-cream);
  }
  /* Logos: natural document flow, the page scrolls. Every mark has an
     explicit cell; the img fills it (contain) and carries its optical scale.
     Featured sponsors one per row at 96px, the second tier two per row at
     64px, fashion two per row at 110px. White marks, no plates. */
  .logos {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 14px;
    width: 100%;
    margin-top: 4px;
  }
  .logos.featured {
    grid-template-columns: minmax(0, 1fr);
  }
  .lcell {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .mark {
    width: 100%;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .logos.featured .mark {
    height: 96px;
  }
  .logos.fashion .mark {
    height: 110px;
  }
  .mark img {
    display: block;
    width: 100%;
    height: calc(100% * var(--h, 1));
    object-fit: contain;
    transform: scale(var(--s, 1));
    opacity: 0.92;
  }
  .bid {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 52px;
    width: 100%;
    border: 1px solid var(--g26-gold);
    border-radius: 3px;
    color: var(--g26-gold);
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    text-decoration: none;
    font-size: 15px;
  }
  .cap {
    font-size: 12px;
    line-height: 1.25;
    color: var(--g26-muted);
    text-align: center;
  }
  .map {
    width: 100%;
    margin-top: 4px;
  }
  .mapends {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--g26-gold-soft);
    border-top: 2px solid rgba(255, 189, 89, 0.6);
    padding-top: 5px;
    margin-bottom: 8px;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 5px;
    align-items: stretch;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .tb {
    flex: 1;
    min-height: 40px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 189, 89, 0.55);
    border-radius: 3px;
    background: rgba(5, 7, 12, 0.6);
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: 19px;
    color: var(--g26-cream);
  }
  .mapnote {
    margin-top: 8px;
    font-size: 12px;
    color: var(--g26-muted);
  }
  .demo-plate {
    padding: 10px 12px;
    border-radius: 4px;
    background: var(--g26-alert);
    color: var(--g26-ink);
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .still .card,
  .still .reveal,
  .still .reveal .round,
  .still .foil {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .card,
    .reveal,
    .reveal .round,
    .foil {
      animation: none;
    }
  }
</style>
