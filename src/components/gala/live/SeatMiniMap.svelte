<script>
  // The dinner corridor as a small map: every table a numbered rectangle, the
  // coat check end on the left and the entrance on the right. Numbers only,
  // never a name, so the same drawing serves the projector's zoomed seating
  // boards (group highlighted in gold, the rest dim) and guests' phones (all
  // tables drawn the same).
  //
  // `rows` is board.rows from src/lib/galaLive/seatingBoard.js (row 0 = the
  // podium row at the coat check end) or TABLE_ROWS: arrays of table numbers
  // or of {number, x, y}. With plan coordinates on every table the map follows
  // the plan (plan y runs along the corridor, plan x across it); without them
  // the rows are spaced evenly. The SVG scales to whatever box holds it.
  let { rows = [], highlight = null, vw = 300, vh = 140, label = "Dinner corridor map" } = $props();

  const TOP = 24; // label band
  const PAD = 5;

  const hi = $derived(Array.isArray(highlight) && highlight.length ? new Set(highlight.map(Number)) : null);
  const tables = $derived(layout(rows, vw, vh, hi));

  function layout(src, W, H, hiSet) {
    const cols = (Array.isArray(src) ? src : [])
      .map((r) => (Array.isArray(r) ? r : []).map((t) => (typeof t === "number" ? { number: t } : t)).filter((t) => t && Number.isFinite(Number(t.number))))
      .filter((c) => c.length);
    if (!cols.length) return [];
    const nC = cols.length;
    const maxN = Math.max(...cols.map((c) => c.length));
    const areaW = W - 2 * PAD;
    const areaH = H - TOP - PAD;
    const tw = Math.min((areaW / nC) * 0.78, 44);
    const th = Math.min((areaH - (maxN - 1) * 6) / maxN, tw * 1.2);
    const all = cols.flat();
    const havePos = all.every((t) => Number.isFinite(Number(t.x)) && Number.isFinite(Number(t.y)));
    const frac = (v, lo, hi2) => (hi2 > lo ? (v - lo) / (hi2 - lo) : 0.5);
    let along; // 0..1 along the corridor
    let across; // 0..1 across it
    if (havePos) {
      const ys = all.map((t) => Number(t.y));
      const xs = all.map((t) => Number(t.x));
      const [y0, y1, x0, x1] = [Math.min(...ys), Math.max(...ys), Math.min(...xs), Math.max(...xs)];
      along = (t) => frac(Number(t.y), y0, y1);
      across = (t) => frac(Number(t.x), x0, x1);
    } else {
      const at = new Map();
      cols.forEach((c, i) =>
        c.forEach((t, j) => {
          const a = c.length === 1 ? 0.5 : c.length === 2 ? [0.26, 0.74][j] : j / (c.length - 1);
          at.set(t, [nC > 1 ? i / (nC - 1) : 0.5, a]);
        }),
      );
      along = (t) => at.get(t)[0];
      across = (t) => at.get(t)[1];
    }
    return all.map((t) => {
      const n = Number(t.number);
      return {
        n,
        x: PAD + along(t) * (areaW - tw),
        y: TOP + across(t) * (areaH - th),
        w: tw,
        h: th,
        fs: Math.min(th * 0.56, tw * 0.52),
        on: hiSet ? hiSet.has(n) : null,
      };
    });
  }
</script>

<svg class="mini" viewBox={`0 0 ${vw} ${vh}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
  <text class="end" x={PAD} y="12" text-anchor="start">&#9664; Coat check</text>
  <text class="end" x={vw - PAD} y="12" text-anchor="end">Entrance &#9654;</text>
  <line class="rule" x1={PAD} x2={vw - PAD} y1="18" y2="18" />
  {#each tables as t (t.n)}
    <g class:on={t.on === true} class:off={t.on === false}>
      <rect x={t.x} y={t.y} width={t.w} height={t.h} rx="2" />
      <text class="num" x={t.x + t.w / 2} y={t.y + t.h / 2} font-size={t.fs} text-anchor="middle" dominant-baseline="central">{t.n}</text>
    </g>
  {/each}
</svg>

<style>
  .mini {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .end {
    font-family: var(--g26-sans);
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    fill: var(--g26-gold-soft, #e4c98a);
  }
  .rule {
    stroke: rgba(255, 189, 89, 0.7);
    stroke-width: 1.5;
  }
  rect {
    fill: rgba(5, 7, 12, 0.72);
    stroke: rgba(255, 189, 89, 0.7);
    stroke-width: 1.2;
  }
  .num {
    font-family: var(--g26-sans);
    font-weight: 800;
    fill: var(--g26-cream, #fff8ef);
    font-variant-numeric: tabular-nums;
  }
  .on rect {
    fill: var(--g26-gold, #ffbd59);
    stroke: var(--g26-gold-hi, #fff1be);
    stroke-width: 1.5;
  }
  .on .num {
    fill: var(--g26-ink, #05070c);
  }
  .off rect {
    fill: rgba(5, 7, 12, 0.5);
    stroke: rgba(228, 201, 138, 0.28);
  }
  .off .num {
    fill: rgba(243, 236, 225, 0.4);
  }
</style>
