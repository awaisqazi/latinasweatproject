<script>
  // The studio floor: the Giving Tuesday thermometer drawn as a room seen from
  // above. One mat = matCents ($100) of the goal, so $15,000 is 150 mats.
  // Funded mats unroll (a body that grows from one end while the roll travels
  // along it and is used up); a partly funded mat stays half rolled, roll and
  // all. Past the goal, mats spill out of the room in extra rows below it.
  //
  // Two drawings share the same state: "narrow" (phones: 10 columns of mats
  // lying sideways, 15 rows) and "wide" (30 columns of upright mats, 5 rows).
  // CSS shows one. Each mat animates with keyframes whose start and end come
  // from --from / --to, so a mat that changes while someone watches rolls on
  // from where it was. Two identical keyframe sets (gen A/B) restart a mat's
  // animation when its target changes again.
  //
  // Props: shownCents (what the floor shows; 0 until it scrolls into view),
  // goalCents, ghostCents (the amount picker's preview, drawn as white mats
  // after the funded edge), live (false: floor only, no mats), reduced.
  import { untrack } from "svelte";

  let {
    shownCents = 0,
    goalCents = 1500000,
    matCents = 10000,
    ghostCents = 0,
    live = false,
    reduced = false,
  } = $props();

  // Studio mat colours: the site palette (design.md section 1) and the mats in
  // LSP's own class photos. [mat, roll]
  const COLORS = [
    ["#1e1e1e", "#000000"],
    ["#0f766e", "#0a524d"],
    ["#c7602d", "#97461f"],
    ["#d9467a", "#a8305b"],
    ["#0369a1", "#024a72"],
    ["#1e1e1e", "#000000"],
    ["#6d4aa8", "#4f3480"],
    ["#0f766e", "#0a524d"],
  ];
  // Deterministic, so a mat keeps its colour between renders and visits.
  function colorOf(i) {
    let x = (i + 11) * 2654435761;
    x = (x ^ (x >>> 13)) >>> 0;
    return COLORS[x % COLORS.length];
  }

  const LAYOUTS = {
    narrow: { axis: "x", cols: 10, aisleAt: 5, w: 30, h: 10, gx: 4, gy: 5, aisle: 8, pad: 10, spill: 14 },
    wide: { axis: "y", cols: 30, aisleAt: 15, w: 26, h: 72, gx: 8, gy: 14, aisle: 18, pad: 20, spill: 28 },
  };

  const mats = $derived(Math.max(1, Math.ceil(goalCents / matCents)));
  const funded = $derived(Math.max(0, shownCents / matCents));
  const ghostMats = $derived(Math.max(0, ghostCents / matCents));
  // Slots drawn: the room, plus spill rows when the total or the preview runs
  // past it (capped at a second room's worth; the number above stays true).
  const slots = $derived(Math.min(mats * 2, Math.max(mats, Math.ceil(funded + (live ? ghostMats : 0) - 1e-9))));

  function geom(L, n) {
    const baseRows = Math.ceil(mats / L.cols);
    const rows = Math.ceil(n / L.cols);
    const colX = (c) => L.pad + c * (L.w + L.gx) + (c >= L.aisleAt ? L.aisle : 0);
    const rowY = (r) => L.pad + r * (L.h + L.gy) + (r >= baseRows ? L.spill : 0);
    const width = colX(L.cols - 1) + L.w + L.pad;
    const roomH = L.pad * 2 + baseRows * L.h + (baseRows - 1) * L.gy;
    const height = rows > baseRows ? rowY(rows - 1) + L.h + L.pad : roomH;
    const pos = Array.from({ length: n }, (_, i) => [colX(i % L.cols), rowY(Math.floor(i / L.cols))]);
    return { width, height, roomH, pos };
  }
  const gNarrow = $derived(geom(LAYOUTS.narrow, slots));
  const gWide = $derived(geom(LAYOUTS.wide, slots));

  // Per-mat animation state, updated only for mats whose fill changed.
  let st = $state([]); // [{ from, to, gen, d }]
  $effect(() => {
    const f = live ? funded : 0;
    const n = slots;
    const cur = untrack(() => st);
    const next = [];
    const changed = [];
    for (let i = 0; i < n; i++) {
      const to = Math.min(1, Math.max(0, f - i));
      const prev = cur[i] ?? { from: 0, to: 0, gen: 0, d: 0 };
      if (Math.abs(prev.to - to) > 1e-6) {
        changed.push(i);
        next.push({ from: prev.to, to, gen: prev.gen + 1, d: 0 });
      } else next.push(prev);
    }
    // Stagger: one after another from the funded edge, the whole wave in about
    // 3.2 s however many mats changed (a long first reveal, a short live one).
    const step = changed.length > 1 ? Math.min(48, 3200 / changed.length) : 0;
    changed.forEach((i, k) => (next[i].d = Math.round(k * step)));
    st = next;
  });

  // Ghost preview: white mats from the funded edge forward.
  function ghostSpans(f, g, n) {
    if (!(g > 0)) return [];
    const out = [];
    const end = Math.min(n, f + g);
    for (let i = Math.floor(f); i < Math.ceil(end - 1e-9); i++) {
      const a = Math.max(0, f - i);
      const b = Math.min(1, end - i);
      if (b - a > 1e-6) out.push({ i, a, b, k: out.length });
    }
    return out;
  }
  const ghosts = $derived(live ? ghostSpans(funded, ghostMats, slots) : []);
</script>

{#snippet floor(name, L, g)}
  <svg
    class={`mf mf-${name} mf-${L.axis}`}
    class:mf-still={reduced}
    viewBox={`0 0 ${g.width} ${g.height}`}
    width={g.width}
    height={g.height}
    style={`--len:${L.axis === "x" ? L.w : L.h}px`}
    aria-hidden="true"
    focusable="false"
  >
    <rect class="mf-room" x="0" y="0" width={g.width} height={g.roomH} rx={L.pad * 0.6} />
    {#each g.pos as [x, y], i (i)}
      {@const s = st[i]}
      {@const c = colorOf(i)}
      <g transform={`translate(${x} ${y})`}>
        <rect class="mf-out" class:mf-out-live={live} width={L.w} height={L.h} rx={L.axis === "x" ? 2 : 3} />
        {#if s && (s.to > 0 || s.from > 0)}
          <rect
            class={`mf-body mf-g${s.gen % 2}`}
            width={L.w}
            height={L.h}
            rx={L.axis === "x" ? 2 : 3}
            fill={c[0]}
            style={`--from:${s.from};--to:${s.to};--d:${s.d}ms`}
          />
          {#if L.axis === "x"}
            <rect
              class={`mf-roll mf-g${s.gen % 2}`}
              class:mf-roll-done={s.to >= 1}
              x={-2.5}
              y={-1.5}
              width="5"
              height={L.h + 3}
              rx="2.5"
              fill={c[1]}
              style={`--from:${s.from};--to:${s.to};--d:${s.d}ms`}
            />
          {:else}
            <rect
              class={`mf-roll mf-g${s.gen % 2}`}
              class:mf-roll-done={s.to >= 1}
              x={-2}
              y={-4}
              width={L.w + 4}
              height="8"
              rx="4"
              fill={c[1]}
              style={`--from:${s.from};--to:${s.to};--d:${s.d}ms`}
            />
          {/if}
        {/if}
      </g>
    {/each}
    {#each ghosts as gh (`${gh.i}-${gh.a}-${gh.b}-${ghostCents}`)}
      {@const [x, y] = g.pos[gh.i]}
      {#if L.axis === "x"}
        <rect
          class="mf-ghost"
          x={x + gh.a * L.w}
          y={y}
          width={(gh.b - gh.a) * L.w}
          height={L.h}
          rx="2"
          style={`--d:${Math.min(gh.k * 45, 900)}ms`}
        />
      {:else}
        <rect
          class="mf-ghost"
          x={x}
          y={y + gh.a * L.h}
          width={L.w}
          height={(gh.b - gh.a) * L.h}
          rx="3"
          style={`--d:${Math.min(gh.k * 45, 900)}ms`}
        />
      {/if}
    {/each}
  </svg>
{/snippet}

<div class="mf-wrap">
  {@render floor("narrow", LAYOUTS.narrow, gNarrow)}
  {@render floor("wide", LAYOUTS.wide, gWide)}
</div>

<style>
  .mf-wrap { width: 100%; }
  .mf {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .mf-wide { display: none; }
  @media (min-width: 700px) {
    .mf-narrow { display: none; }
    .mf-wide { display: block; }
  }

  .mf-room { fill: var(--gt-sun, #ffde59); }
  .mf-out {
    fill: none;
    stroke: rgba(30, 30, 30, 0);
    stroke-width: 1;
    transition: stroke 0.6s;
  }
  .mf-wide .mf-out { stroke-width: 1.5; }
  .mf-out-live { stroke: rgba(30, 30, 30, 0.34); }

  .mf-body,
  .mf-roll {
    transform-box: fill-box;
  }
  .mf-body { transform-origin: 0 0; }
  .mf-roll { transform-origin: 50% 50%; }

  /* Sideways mats (phones): the body grows to the right, the roll travels right. */
  .mf-x .mf-body.mf-g0 { animation: mf-bx0 0.9s cubic-bezier(0.3, 0.7, 0.3, 1) var(--d) both; }
  .mf-x .mf-body.mf-g1 { animation: mf-bx1 0.9s cubic-bezier(0.3, 0.7, 0.3, 1) var(--d) both; }
  .mf-x .mf-roll.mf-g0 { animation: mf-rx0 0.9s cubic-bezier(0.3, 0.7, 0.3, 1) var(--d) both; }
  .mf-x .mf-roll.mf-g1 { animation: mf-rx1 0.9s cubic-bezier(0.3, 0.7, 0.3, 1) var(--d) both; }
  .mf-x .mf-roll-done.mf-g0 { animation-name: mf-rx0-done; }
  .mf-x .mf-roll-done.mf-g1 { animation-name: mf-rx1-done; }
  /* Upright mats (wide screens): the body grows down from the front of the room. */
  .mf-y .mf-body.mf-g0 { animation: mf-by0 0.9s cubic-bezier(0.3, 0.7, 0.3, 1) var(--d) both; }
  .mf-y .mf-body.mf-g1 { animation: mf-by1 0.9s cubic-bezier(0.3, 0.7, 0.3, 1) var(--d) both; }
  .mf-y .mf-roll.mf-g0 { animation: mf-ry0 0.9s cubic-bezier(0.3, 0.7, 0.3, 1) var(--d) both; }
  .mf-y .mf-roll.mf-g1 { animation: mf-ry1 0.9s cubic-bezier(0.3, 0.7, 0.3, 1) var(--d) both; }
  .mf-y .mf-roll-done.mf-g0 { animation-name: mf-ry0-done; }
  .mf-y .mf-roll-done.mf-g1 { animation-name: mf-ry1-done; }

  /* The roll is fattest at the start and thins as the mat is used up. */
  @keyframes mf-bx0 { from { transform: scaleX(var(--from)); } to { transform: scaleX(var(--to)); } }
  @keyframes mf-bx1 { from { transform: scaleX(var(--from)); } to { transform: scaleX(var(--to)); } }
  @keyframes mf-rx0 {
    from { transform: translateX(calc(var(--from) * var(--len))) scale(calc(1.25 - var(--from) * 0.5)); }
    to { transform: translateX(calc(var(--to) * var(--len))) scale(calc(1.25 - var(--to) * 0.5)); }
  }
  @keyframes mf-rx1 {
    from { transform: translateX(calc(var(--from) * var(--len))) scale(calc(1.25 - var(--from) * 0.5)); }
    to { transform: translateX(calc(var(--to) * var(--len))) scale(calc(1.25 - var(--to) * 0.5)); }
  }
  @keyframes mf-rx0-done {
    0% { opacity: 1; transform: translateX(calc(var(--from) * var(--len))) scale(calc(1.25 - var(--from) * 0.5)); }
    86% { opacity: 1; }
    100% { opacity: 0; transform: translateX(var(--len)) scale(0.55); }
  }
  @keyframes mf-rx1-done {
    0% { opacity: 1; transform: translateX(calc(var(--from) * var(--len))) scale(calc(1.25 - var(--from) * 0.5)); }
    86% { opacity: 1; }
    100% { opacity: 0; transform: translateX(var(--len)) scale(0.55); }
  }
  @keyframes mf-by0 { from { transform: scaleY(var(--from)); } to { transform: scaleY(var(--to)); } }
  @keyframes mf-by1 { from { transform: scaleY(var(--from)); } to { transform: scaleY(var(--to)); } }
  @keyframes mf-ry0 {
    from { transform: translateY(calc(var(--from) * var(--len))) scale(calc(1.15 - var(--from) * 0.3)); }
    to { transform: translateY(calc(var(--to) * var(--len))) scale(calc(1.15 - var(--to) * 0.3)); }
  }
  @keyframes mf-ry1 {
    from { transform: translateY(calc(var(--from) * var(--len))) scale(calc(1.15 - var(--from) * 0.3)); }
    to { transform: translateY(calc(var(--to) * var(--len))) scale(calc(1.15 - var(--to) * 0.3)); }
  }
  @keyframes mf-ry0-done {
    0% { opacity: 1; transform: translateY(calc(var(--from) * var(--len))) scale(calc(1.15 - var(--from) * 0.3)); }
    86% { opacity: 1; }
    100% { opacity: 0; transform: translateY(var(--len)) scale(0.85); }
  }
  @keyframes mf-ry1-done {
    0% { opacity: 1; transform: translateY(calc(var(--from) * var(--len))) scale(calc(1.15 - var(--from) * 0.3)); }
    86% { opacity: 1; }
    100% { opacity: 0; transform: translateY(var(--len)) scale(0.85); }
  }

  /* The picker's preview: white mats, laid down quickly after the funded edge. */
  .mf-ghost {
    fill: #ffffff;
    stroke: var(--gt-ink, #1e1e1e);
    stroke-width: 1.25;
    transform-box: fill-box;
    transform-origin: 0 0;
    animation: mf-ghost-x 0.45s cubic-bezier(0.3, 0.7, 0.3, 1) var(--d) both;
  }
  .mf-y .mf-ghost { animation-name: mf-ghost-y; stroke-width: 1.75; }
  @keyframes mf-ghost-x { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes mf-ghost-y { from { transform: scaleY(0); } to { transform: scaleY(1); } }

  /* Reduced motion: final states, no travel. A partly funded mat still shows its roll. */
  .mf-still .mf-body,
  .mf-still .mf-roll,
  .mf-still .mf-ghost { animation: none !important; }
  .mf-still.mf-x .mf-body { transform: scaleX(var(--to)); }
  .mf-still.mf-y .mf-body { transform: scaleY(var(--to)); }
  .mf-still.mf-x .mf-roll { transform: translateX(calc(var(--to) * var(--len))) scale(calc(1.25 - var(--to) * 0.5)); }
  .mf-still.mf-y .mf-roll { transform: translateY(calc(var(--to) * var(--len))) scale(calc(1.15 - var(--to) * 0.3)); }
  .mf-still .mf-roll-done { opacity: 0; }
  @media (prefers-reduced-motion: reduce) {
    .mf-body,
    .mf-roll,
    .mf-ghost { animation: none !important; }
    .mf-x .mf-body { transform: scaleX(var(--to)); }
    .mf-y .mf-body { transform: scaleY(var(--to)); }
    .mf-x .mf-roll { transform: translateX(calc(var(--to) * var(--len))) scale(calc(1.25 - var(--to) * 0.5)); }
    .mf-y .mf-roll { transform: translateY(calc(var(--to) * var(--len))) scale(calc(1.15 - var(--to) * 0.3)); }
    .mf-roll-done { opacity: 0; }
    .mf-out { transition: none; }
  }
</style>
