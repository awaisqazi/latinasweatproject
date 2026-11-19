<script>
  // LSP Giving Tuesday leaderboard: "a race of yoga mats". Up to five lanes,
  // one per instructor, ranked by the shared rules in
  // src/lib/givingTuesday/leaderboard.js (the parent passes topRaisers()).
  // Each lane: a large rank numeral, then the instructor's mat unrolling from
  // the left to a length proportional to the leader's amount, with their face
  // riding the unrolled end (where the roll sits on the board's row mats).
  // Name and amount sit under the lane. The leader's lane is larger.
  //
  // Used three times: on /givingtuesday inside the sand board (tone "light"),
  // and, mounted lazily by src/lib/givingTuesday/placementLeaders.svelte.js,
  // in the homepage's ink band (tone "ink", compact) and the white /links
  // card (tone "light", compact, bilingual). Identity: design.md
  // "Giving Tuesday".
  //
  // Props: leaders (ranked, 3 to 5), hrefFor(f) (that person's give link),
  // base, thresholdCents, seen (unroll once in view), reduced (final state,
  // no travel), tone, compact, headingId, es ({ leadTitle(n), leadLabel(...) }
  // for /links: every string then renders as a .lang-en / .lang-es pair for
  // the page's toggle; names and money stay as they are).
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { givingCopy as copy, money } from "../../data/givingTuesday.js";
  import { instructorInitials } from "../../data/popUpShared.js";
  import { matShare, reachedGoal, firstName, BOARD_MATS, BOARD_MATS_ON_INK } from "../../lib/givingTuesday/leaderboard.js";

  let {
    leaders = [],
    hrefFor = (f) => f.give_url || "#",
    base = "/",
    thresholdCents = 15000,
    seen = false,
    reduced = false,
    tone = "light",
    compact = false,
    headingId = "gt-lead-h",
    es = null,
  } = $props();

  let failed = $state({});
  const palette = $derived(tone === "ink" ? BOARD_MATS_ON_INK : BOARD_MATS);
  const lead = $derived(leaders[0]?.raised_cents || 0);
  const ext = (href) => /^https?:/i.test(href);
  const b = $derived(base.endsWith("/") ? base : `${base}/`);
  const avatarSrc = (f) => (f.avatar ? `${b}images/popup/instructors/${f.avatar}-160.webp` : null);
</script>

{#if leaders.length}
  <div class="lb" class:lb-ink={tone === "ink"} class:lb-compact={compact} class:lb-seen={seen || reduced} class:lb-still={reduced}>
    <h3 class="lb-h" id={headingId}>
      {#if es}
        <span class="lang-en">{copy.board.leadTitle(leaders.length)}</span>
        <span class="lang-es hidden">{es.leadTitle(leaders.length)}</span>
      {:else}
        {copy.board.leadTitle(leaders.length)}
      {/if}
    </h3>
    <ol class="lb-list" aria-labelledby={headingId}>
      {#each leaders as f, i (f.slug)}
        {@const href = hrefFor(f)}
        {@const src = avatarSrc(f)}
        <li
          class="lb-item"
          class:lb-first={i === 0}
          class:lb-done={reachedGoal(f, thresholdCents)}
          style={`--w:${matShare(f.raised_cents, lead)};--i:${i};--mat:${palette[i % palette.length]}`}
          animate:flip={{ duration: reduced ? 0 : 650, easing: cubicOut }}
        >
          <a
            class="lb-lane"
            {href}
            target={ext(href) ? "_blank" : undefined}
            rel={ext(href) ? "noopener" : undefined}
          >
            <!-- The link's name: rank, name, amount (the visible parts are aria-hidden). -->
            <span class="lb-sr">
              {#if es}
                <span class="lang-en">{copy.board.leadLabel(i + 1, f.name, money(f.raised_cents), firstName(f.name))}</span>
                <span class="lang-es hidden">{es.leadLabel(i + 1, f.name, money(f.raised_cents), firstName(f.name))}</span>
              {:else}
                {copy.board.leadLabel(i + 1, f.name, money(f.raised_cents), firstName(f.name))}
              {/if}
            </span>
            <span class="lb-rank" aria-hidden="true">{i + 1}</span>
            <span class="lb-track" aria-hidden="true">
              <span class="lb-stub"></span>
              <span class="lb-mat"></span>
              <span class="lb-carriage">
                <span class="lb-face">
                  {#if src && !failed[f.slug]}
                    <img
                      {src}
                      alt=""
                      width="80"
                      height="80"
                      loading="lazy"
                      decoding="async"
                      onerror={() => (failed = { ...failed, [f.slug]: true })}
                    />
                  {:else}
                    <span class="lb-initials">{instructorInitials(f.name)}</span>
                  {/if}
                </span>
              </span>
            </span>
            <span class="lb-text" aria-hidden="true">
              <span class="lb-name">{f.name}</span>
              <span class="lb-amt">{money(f.raised_cents)}</span>
            </span>
          </a>
        </li>
      {/each}
    </ol>
  </div>
{/if}

<style>
  /* Sizes per lane: --face (the rider), --mh (mat height), --rs (rank size).
     The rank column is one width for every lane, so every mat starts at the
     same x and the lengths compare honestly. */
  .lb {
    --ink: var(--gt-ink, #1e1e1e);
    --sun: var(--gt-sun, #ffde59);
    --face-bg: var(--gt-mist, #ececea);
    --out: rgba(30, 30, 30, 0.22);
    --rankw: 46px;
    --gap: 12px;
    color: var(--ink);
  }
  .lb-ink {
    --ink: #ffffff;
    --face-bg: #3a3a38;
    --out: rgba(255, 255, 255, 0.26);
  }
  .lb-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  /* /links language toggle (.lang-active-en / -es on .links-page). */
  :global(.lang-active-en) .lb .lang-es,
  :global(.lang-active-es) .lb .lang-en { display: none !important; }
  :global(.lang-active-es) .lb .lang-es { display: inline; }
  .lb-h {
    margin: 0;
    font-weight: 700;
    font-size: clamp(1.375rem, 5vw, 2rem);
    line-height: 1.15;
    letter-spacing: -0.015em;
  }
  .lb-compact .lb-h { font-size: 1.25rem; }
  .lb-list { list-style: none; margin: 24px 0 0; padding: 0; max-width: 980px; }
  .lb-compact .lb-list { margin-top: 16px; }

  .lb-item { --face: 48px; --mh: 14px; --rs: 2.25rem; }
  .lb-item + .lb-item { margin-top: 22px; }
  .lb-first { --face: 64px; --mh: 20px; --rs: 3.5rem; }
  .lb-first + .lb-item { margin-top: 30px; }
  .lb-compact .lb-item { --face: 40px; --mh: 12px; --rs: 1.75rem; }
  .lb-compact .lb-first { --face: 52px; --mh: 16px; --rs: 2.625rem; }
  .lb-compact .lb-item + .lb-item { margin-top: 14px; }
  .lb-compact .lb-first + .lb-item { margin-top: 20px; }
  .lb-compact { --rankw: 36px; --gap: 10px; }
  @media (min-width: 768px) {
    .lb { --rankw: 84px; --gap: 18px; }
    .lb-item { --face: 64px; --mh: 18px; --rs: 3.5rem; }
    .lb-first { --face: 96px; --mh: 26px; --rs: 6rem; }
    .lb-item + .lb-item { margin-top: 26px; }
    .lb-first + .lb-item { margin-top: 36px; }
    .lb-compact { --rankw: 40px; --gap: 12px; }
    .lb-compact .lb-item { --face: 44px; --mh: 13px; --rs: 2rem; }
    .lb-compact .lb-first { --face: 60px; --mh: 18px; --rs: 3rem; }
  }

  .lb-lane {
    position: relative;
    display: grid;
    grid-template-columns: var(--rankw) minmax(0, 1fr);
    grid-template-areas: "rank track" ". text";
    column-gap: var(--gap);
    align-items: center;
    color: inherit;
    text-decoration: none;
    border-radius: 4px;
  }
  .lb-lane:focus-visible { outline: 3px solid var(--ink); outline-offset: 4px; }
  .lb-ink .lb-lane:focus-visible { outline-color: var(--sun); }
  .lb-rank {
    grid-area: rank;
    justify-self: end;
    font-weight: 700;
    font-size: var(--rs);
    line-height: 0.8;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
    padding-top: 0.04em;
  }

  /* The lane: a faint mat outline for the full run (as on the floor), the
     mat (a fixed stub under the face's start plus a body that scales out),
     and the carriage that carries the face to the mat's end. */
  .lb-track {
    grid-area: track;
    position: relative;
    display: block;
    height: var(--face);
  }
  .lb-track::before {
    content: "";
    position: absolute;
    left: 0;
    width: calc(100% - var(--face) / 2);
    top: calc(50% - var(--mh) / 2);
    height: var(--mh);
    border-radius: 3px;
    box-shadow: inset 0 0 0 1.5px var(--out);
  }
  .lb-stub,
  .lb-mat {
    position: absolute;
    top: calc(50% - var(--mh) / 2);
    height: var(--mh);
    background: var(--mat);
    transition: background-color 0.4s;
  }
  .lb-stub { left: 0; width: calc(var(--face) / 2 + 1px); border-radius: 3px 0 0 3px; }
  .lb-mat {
    left: calc(var(--face) / 2);
    width: calc(100% - var(--face));
    transform-origin: 0 50%;
    transform: scaleX(0);
  }
  .lb-carriage {
    position: absolute;
    left: 0;
    top: 0;
    width: calc(100% - var(--face));
    height: 100%;
    transform: translateX(0);
  }
  .lb-seen .lb-mat {
    transform: scaleX(var(--w));
    transition: transform 1.1s cubic-bezier(0.3, 0.7, 0.3, 1) calc(var(--i) * 140ms), background-color 0.4s;
  }
  .lb-seen .lb-carriage {
    transform: translateX(calc(var(--w) * 100%));
    transition: transform 1.1s cubic-bezier(0.3, 0.7, 0.3, 1) calc(var(--i) * 140ms);
  }
  .lb-face {
    position: absolute;
    left: 0;
    top: 0;
    width: var(--face);
    height: var(--face);
    border-radius: 50%;
    background: var(--face-bg);
    display: grid;
    place-items: center;
  }
  .lb-face img,
  .lb-initials {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
  .lb-initials { display: grid; place-items: center; font-weight: 700; font-size: calc(var(--face) * 0.3); }
  /* Reaching $150: the board's yellow ring closes around the face once it
     has arrived at the end of its mat. */
  .lb-face::after {
    content: "";
    position: absolute;
    inset: -5px;
    border-radius: 50%;
    border: 4px solid var(--sun);
    opacity: 0;
    transform: scale(0.8);
  }
  .lb-first .lb-face::after { inset: -6px; border-width: 5px; }
  .lb-compact .lb-face::after { inset: -4px; border-width: 3px; }
  .lb-seen .lb-done .lb-face::after {
    opacity: 1;
    transform: none;
    transition: opacity 0.3s, transform 0.5s cubic-bezier(0.3, 1.5, 0.5, 1);
    transition-delay: calc(var(--i) * 140ms + 1.05s);
  }

  .lb-text {
    grid-area: text;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 12px;
    margin-top: 6px;
    min-width: 0;
  }
  .lb-name {
    font-weight: 700;
    font-size: 1.125rem;
    line-height: 1.25;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .lb-amt { font-size: 1.125rem; line-height: 1.25; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .lb-first .lb-name,
  .lb-first .lb-amt { font-size: 1.375rem; }
  .lb-compact .lb-name,
  .lb-compact .lb-amt { font-size: 1rem; }
  .lb-compact .lb-first .lb-name,
  .lb-compact .lb-first .lb-amt { font-size: 1.125rem; }
  @media (min-width: 768px) {
    .lb-text { margin-top: 8px; }
    .lb-name, .lb-amt { font-size: 1.25rem; }
    .lb-first .lb-name, .lb-first .lb-amt { font-size: 1.75rem; }
    .lb-compact .lb-name, .lb-compact .lb-amt { font-size: 1.0625rem; }
    .lb-compact .lb-first .lb-name, .lb-compact .lb-first .lb-amt { font-size: 1.25rem; }
  }
  .lb-lane:hover .lb-name { text-decoration: underline; text-underline-offset: 4px; }

  /* Reduced motion: everything in its final place, no travel. */
  .lb-still .lb-mat,
  .lb-still .lb-carriage,
  .lb-still .lb-stub,
  .lb-still .lb-face::after { transition: none !important; }
  @media (prefers-reduced-motion: reduce) {
    .lb-mat,
    .lb-carriage,
    .lb-stub,
    .lb-face::after { transition: none !important; }
  }
</style>
