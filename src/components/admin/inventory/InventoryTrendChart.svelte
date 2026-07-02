<script>
  // Hand-rolled inline SVG line chart for inventory counts over time.
  // No chart libraries. Step-after lines (counts change discretely at log
  // times). Responsive via viewBox + width 100%; fixed pixel height.
  //
  // Legacy-mode note: every value the SVG depends on is either referenced
  // directly in the template, derived in a `$:` block, or bound to an
  // `{@const}`. Helper functions used at render time receive all the state
  // they read as arguments, so reactivity never hides behind a call.

  export let series = []; // [{ itemId, name, color, threshold, points: [{ t (ms), qty }] }]
  export let rangeStart = 0; // ms
  export let rangeEnd = 0; // ms
  export let rangeId = "30d"; // 1w | 30d | 3m | 12m

  const VIEW_W = 720;
  const VIEW_H = 280;
  const PAD_L = 44;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 34;
  const PLOT_W = VIEW_W - PAD_L - PAD_R;
  const PLOT_H = VIEW_H - PAD_T - PAD_B;

  const MS_PER_DAY = 86400000;

  // ---- Y domain (0-based, padded headroom) -------------------------------
  $: maxQty = series.reduce((max, s) => {
    for (const p of s.points) if (p.qty > max) max = p.qty;
    return max;
  }, 0);
  // Round the top up to a "nice" number so ticks land on round values.
  $: yTop = niceCeil(maxQty);
  $: yTicks = buildYTicks(yTop);

  // ---- X domain ----------------------------------------------------------
  $: spanMs = Math.max(1, rangeEnd - rangeStart); // guard divide-by-zero
  $: xTicks = buildXTicks(rangeStart, rangeEnd, rangeId);

  // ---- Scales (pure, take domain as args so they re-run reactively) ------
  function xPos(t, start, span) {
    return PAD_L + ((t - start) / span) * PLOT_W;
  }
  function yPos(qty, top) {
    if (top <= 0) return PAD_T + PLOT_H;
    return PAD_T + PLOT_H - (qty / top) * PLOT_H;
  }

  // ---- Build a step-after path for one series ----------------------------
  // Points come in chronological order. We hold each value until the next
  // log, then step to the new value (vertical), then hold again.
  function stepPath(points, start, span, top) {
    if (!points.length) return "";
    if (points.length === 1) {
      // Single point: draw a short flat segment so something is visible.
      const y = yPos(points[0].qty, top);
      const x = xPos(points[0].t, start, span);
      return `M ${x.toFixed(2)} ${y.toFixed(2)} L ${(PAD_L + PLOT_W).toFixed(2)} ${y.toFixed(2)}`;
    }
    let d = "";
    for (let i = 0; i < points.length; i += 1) {
      const x = xPos(points[i].t, start, span);
      const y = yPos(points[i].qty, top);
      if (i === 0) {
        d += `M ${x.toFixed(2)} ${y.toFixed(2)}`;
      } else {
        // step-after: horizontal to new x at previous y, then vertical to new y
        const prevY = yPos(points[i - 1].qty, top);
        d += ` L ${x.toFixed(2)} ${prevY.toFixed(2)} L ${x.toFixed(2)} ${y.toFixed(2)}`;
      }
    }
    // Extend the last value to the right edge of the plot so the current
    // count reads as "still in effect".
    const lastY = yPos(points[points.length - 1].qty, top);
    d += ` L ${(PAD_L + PLOT_W).toFixed(2)} ${lastY.toFixed(2)}`;
    return d;
  }

  function niceCeil(value) {
    if (value <= 0) return 4; // keep a visible axis even with no data
    if (value <= 4) return 4;
    const pow = Math.pow(10, Math.floor(Math.log10(value)));
    const scaled = value / pow;
    let nice;
    if (scaled <= 1) nice = 1;
    else if (scaled <= 2) nice = 2;
    else if (scaled <= 2.5) nice = 2.5;
    else if (scaled <= 5) nice = 5;
    else nice = 10;
    return Math.ceil(value / (nice * pow)) * (nice * pow);
  }

  function buildYTicks(top) {
    const count = 4; // yields 4 gridlines incl. 0
    const step = top / count;
    const ticks = [];
    for (let i = 0; i <= count; i += 1) {
      const v = Math.round(step * i);
      // De-dupe if rounding collapsed two ticks (small ranges).
      if (!ticks.length || ticks[ticks.length - 1] !== v) ticks.push(v);
    }
    return ticks;
  }

  function buildXTicks(start, end, range) {
    const count = range === "1w" ? 5 : 4; // 4-6 ticks depending on range
    const ticks = [];
    for (let i = 0; i <= count; i += 1) {
      const t = start + ((end - start) * i) / count;
      ticks.push({ t, label: formatTick(t, range) });
    }
    return ticks;
  }

  function formatTick(t, range) {
    const d = new Date(t);
    if (range === "1w") {
      return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d);
    }
    if (range === "12m") {
      return new Intl.DateTimeFormat("en-US", { month: "short" }).format(d);
    }
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
  }

  // Screen-reader summary: latest value per visible series.
  $: srSummary = series
    .map((s) => {
      const last = s.points[s.points.length - 1];
      return last ? `${s.name}: ${last.qty}` : `${s.name}: no data`;
    })
    .join("; ");
</script>

<div class="w-full">
  <svg
    viewBox="0 0 {VIEW_W} {VIEW_H}"
    preserveAspectRatio="none"
    width="100%"
    height="280"
    role="img"
    aria-label="Inventory counts over time. {srSummary}"
    class="block"
  >
    <!-- Y gridlines + labels -->
    {#each yTicks as tick (tick)}
      {@const y = yPos(tick, yTop)}
      <line
        x1={PAD_L}
        x2={PAD_L + PLOT_W}
        y1={y}
        y2={y}
        stroke="rgb(15 23 42 / 0.08)"
        stroke-width="1"
      />
      <text
        x={PAD_L - 8}
        y={y + 4}
        text-anchor="end"
        class="fill-ink/45 text-[11px] tabular-nums"
        font-size="11"
      >
        {tick}
      </text>
    {/each}

    <!-- X axis baseline -->
    <line
      x1={PAD_L}
      x2={PAD_L + PLOT_W}
      y1={PAD_T + PLOT_H}
      y2={PAD_T + PLOT_H}
      stroke="rgb(15 23 42 / 0.16)"
      stroke-width="1"
    />

    <!-- X ticks + labels -->
    {#each xTicks as tick (tick.t)}
      {@const x = xPos(tick.t, rangeStart, spanMs)}
      <line
        x1={x}
        x2={x}
        y1={PAD_T + PLOT_H}
        y2={PAD_T + PLOT_H + 5}
        stroke="rgb(15 23 42 / 0.25)"
        stroke-width="1"
      />
      <text
        x={x}
        y={PAD_T + PLOT_H + 20}
        text-anchor="middle"
        class="fill-ink/50 text-[11px]"
        font-size="11"
      >
        {tick.label}
      </text>
    {/each}

    <!-- Threshold dashed line: only when exactly one series is visible, to
         avoid clutter. -->
    {#if series.length === 1 && series[0].threshold > 0 && series[0].threshold <= yTop}
      {@const ty = yPos(series[0].threshold, yTop)}
      <line
        x1={PAD_L}
        x2={PAD_L + PLOT_W}
        y1={ty}
        y2={ty}
        stroke={series[0].color}
        stroke-width="1"
        stroke-dasharray="4 4"
        opacity="0.5"
      />
      <text
        x={PAD_L + PLOT_W}
        y={ty - 4}
        text-anchor="end"
        font-size="10"
        fill={series[0].color}
        opacity="0.8"
      >
        low {series[0].threshold}
      </text>
    {/if}

    <!-- Series lines + points -->
    {#each series as s (s.itemId)}
      <path
        d={stepPath(s.points, rangeStart, spanMs, yTop)}
        fill="none"
        stroke={s.color}
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      {#each s.points as p (p.t)}
        <circle
          cx={xPos(p.t, rangeStart, spanMs)}
          cy={yPos(p.qty, yTop)}
          r="2.5"
          fill={s.color}
        />
      {/each}
    {/each}
  </svg>
</div>
