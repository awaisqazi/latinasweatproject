<script>
  // Gala 2025 archive: Timeline tab. Hand-rolled responsive inline SVG, no
  // chart library (house pattern: src/components/admin/inventory/
  // InventoryTrendChart.svelte). Two layers over the detected event night,
  // in America/Chicago:
  //   1. cumulative dollars as a step-after line with a soft gold area
  //   2. dollars per 5-minute bucket as low-opacity bars on their own scale
  // Event-night detection, bucketing and the stat strip all come from
  // buildEventNightTimeline() in galaMath.js; this file only draws it.
  import { Info } from "@lucide/svelte";
  import Panel from "../../ui/Panel.svelte";
  import StatCard from "../../ui/StatCard.svelte";
  import EmptyState from "../../ui/EmptyState.svelte";
  import Banner from "../../ui/Banner.svelte";
  import {
    buildEventNightTimeline,
    formatMoney,
    formatDateCT,
    formatTimeCT,
    CHICAGO_TZ,
  } from "../../../../lib/dashboard/galaMath.js";

  let { donations = [] } = $props();

  const BUCKET_MINUTES = 5;
  const TICK_MINUTES = 30;

  const VIEW_W = 720;
  const VIEW_H = 320;
  const PAD_L = 52;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 34;
  const PLOT_W = VIEW_W - PAD_L - PAD_R;
  const PLOT_H = VIEW_H - PAD_T - PAD_B;
  const BAR_MAX_H = PLOT_H * 0.32; // bars only ever occupy the bottom third or so

  const timeline = $derived(buildEventNightTimeline(donations, { bucketMinutes: BUCKET_MINUTES, timeZone: CHICAGO_TZ }));

  const startMs = $derived(timeline.night ? new Date(timeline.night.start).getTime() : 0);
  const endMs = $derived(timeline.night ? new Date(timeline.night.end).getTime() : 0);
  const spanMs = $derived(Math.max(1, endMs - startMs));
  const bucketMs = $derived(BUCKET_MINUTES * 60 * 1000);

  const maxCumulative = $derived(niceCeil(timeline.buckets.reduce((m, b) => Math.max(m, b.cumulative), 0)));
  const maxBucketAmount = $derived(timeline.buckets.reduce((m, b) => Math.max(m, b.amount), 0));

  function xPos(t) {
    return PAD_L + ((t - startMs) / spanMs) * PLOT_W;
  }
  function yPosCumulative(value) {
    if (maxCumulative <= 0) return PAD_T + PLOT_H;
    return PAD_T + PLOT_H - (value / maxCumulative) * PLOT_H;
  }
  function barHeight(amount) {
    if (maxBucketAmount <= 0) return 0;
    return (amount / maxBucketAmount) * BAR_MAX_H;
  }

  function niceCeil(value) {
    if (value <= 0) return 100;
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

  // Cumulative "staircase": held flat during a bucket, steps up at the end
  // of the bucket (when that bucket's gifts are fully counted).
  const cumulativePoints = $derived.by(() => {
    const points = [{ x: startMs, y: 0 }];
    timeline.buckets.forEach((bucket, i) => {
      points.push({ x: startMs + (i + 1) * bucketMs, y: bucket.cumulative });
    });
    return points;
  });

  const cumulativePath = $derived(stepPath(cumulativePoints));
  const areaPath = $derived(
    cumulativePoints.length
      ? `${stepPath(cumulativePoints)} L ${xPos(cumulativePoints[cumulativePoints.length - 1].x).toFixed(2)} ${(PAD_T + PLOT_H).toFixed(2)} L ${xPos(cumulativePoints[0].x).toFixed(2)} ${(PAD_T + PLOT_H).toFixed(2)} Z`
      : "",
  );

  function stepPath(points) {
    if (!points.length) return "";
    let d = "";
    for (let i = 0; i < points.length; i += 1) {
      const x = xPos(points[i].x);
      const y = yPosCumulative(points[i].y);
      if (i === 0) {
        d += `M ${x.toFixed(2)} ${y.toFixed(2)}`;
      } else {
        const prevY = yPosCumulative(points[i - 1].y);
        d += ` L ${x.toFixed(2)} ${prevY.toFixed(2)} L ${x.toFixed(2)} ${y.toFixed(2)}`;
      }
    }
    return d;
  }

  const xTicks = $derived.by(() => {
    if (!timeline.night) return [];
    const ticks = [];
    const stepMs = TICK_MINUTES * 60 * 1000;
    for (let t = Math.ceil(startMs / stepMs) * stepMs; t <= endMs; t += stepMs) {
      ticks.push({ t, label: formatTimeCT(new Date(t).toISOString(), CHICAGO_TZ) });
    }
    if (!ticks.length || ticks[0].t !== startMs) ticks.unshift({ t: startMs, label: formatTimeCT(new Date(startMs).toISOString(), CHICAGO_TZ) });
    return ticks;
  });

  const yTicks = $derived.by(() => {
    const count = 4;
    const step = maxCumulative / count;
    const ticks = [];
    for (let i = 0; i <= count; i += 1) ticks.push(Math.round(step * i));
    return ticks;
  });

  // Best-effort marker: the largest gift's bucket-end cumulative value (the
  // exact within-bucket position is not resolvable from bucketed data).
  const largestMarker = $derived.by(() => {
    if (!timeline.largestGift || !timeline.night) return null;
    const t = new Date(timeline.largestGift.createdAt).getTime();
    if (Number.isNaN(t)) return null;
    const idx = Math.min(timeline.buckets.length - 1, Math.max(0, Math.floor((t - startMs) / bucketMs)));
    const bucket = timeline.buckets[idx];
    if (!bucket) return null;
    return { x: xPos(startMs + (idx + 1) * bucketMs), y: yPosCumulative(bucket.cumulative), amount: timeline.largestGift.amount };
  });

  const srRows = $derived(
    timeline.buckets.map((bucket) => ({
      label: bucket.label,
      amount: formatMoney(bucket.amount),
      cumulative: formatMoney(bucket.cumulative),
    })),
  );
</script>

<div class="space-y-4">
  {#if !timeline.night}
    <Panel title="Timeline" id="archive-timeline">
      <EmptyState title="Not enough data for a timeline" message="No non-hidden gifts were recorded to detect an event night." icon={Info} />
    </Panel>
  {:else}
    {#if timeline.excludedCount > 0}
      <Banner
        tone="info"
        message={`${timeline.excludedCount} gift${timeline.excludedCount === 1 ? " was" : "s were"} recorded outside the event night. ${timeline.excludedCount === 1 ? "It counts" : "They count"} in totals but ${timeline.excludedCount === 1 ? "is" : "are"} not on this chart.`}
      />
    {/if}

    <Panel title="Donations over the night" id="archive-timeline-chart">
      <div class="w-full">
        <svg
          viewBox="0 0 {VIEW_W} {VIEW_H}"
          preserveAspectRatio="none"
          width="100%"
          height="320"
          role="img"
          aria-labelledby="archive-timeline-svg-title"
          class="block"
        >
          <title id="archive-timeline-svg-title">
            Cumulative gala donations from {formatTimeCT(timeline.night.start, CHICAGO_TZ)} to {formatTimeCT(timeline.night.end, CHICAGO_TZ)} Chicago time, reaching {formatMoney(timeline.totalInWindow)}.
          </title>

          {#each yTicks as tick (tick)}
            {@const y = yPosCumulative(tick)}
            <line x1={PAD_L} x2={PAD_L + PLOT_W} y1={y} y2={y} stroke="rgb(15 23 42 / 0.08)" stroke-width="1" />
            <text x={PAD_L - 8} y={y + 4} text-anchor="end" class="fill-ink/45 text-[10px] tabular-nums" font-size="10">
              {formatMoney(tick).replace(".00", "")}
            </text>
          {/each}

          <line x1={PAD_L} x2={PAD_L + PLOT_W} y1={PAD_T + PLOT_H} y2={PAD_T + PLOT_H} stroke="rgb(15 23 42 / 0.16)" stroke-width="1" />

          {#each xTicks as tick (tick.t)}
            {@const x = xPos(tick.t)}
            <line x1={x} x2={x} y1={PAD_T + PLOT_H} y2={PAD_T + PLOT_H + 5} stroke="rgb(15 23 42 / 0.25)" stroke-width="1" />
            <text x={x} y={PAD_T + PLOT_H + 20} text-anchor="middle" class="fill-ink/50 text-[10px]" font-size="10">{tick.label}</text>
          {/each}

          <!-- Layer 2: per-bucket dollars, low-opacity bars on their own scale -->
          {#each timeline.buckets as bucket, i (bucket.bucketStart)}
            {@const bx = xPos(startMs + i * bucketMs)}
            {@const bw = Math.max(1, xPos(startMs + (i + 1) * bucketMs) - bx - 1)}
            {@const bh = barHeight(bucket.amount)}
            <rect x={bx} y={PAD_T + PLOT_H - bh} width={bw} height={bh} fill="var(--color-accent, #2f8f8a)" opacity="0.22" />
          {/each}

          <!-- Layer 1: cumulative dollars, step-after line with a soft gold area -->
          <path d={areaPath} fill="var(--color-brand, #ffbd59)" opacity="0.16" stroke="none" />
          <path d={cumulativePath} fill="none" stroke="var(--color-brand-strong, #b8860b)" stroke-width="2" stroke-linejoin="round" />

          {#if largestMarker}
            <circle cx={largestMarker.x} cy={largestMarker.y} r="4.5" fill="var(--color-ink, #1c1c1c)" />
            <text x={largestMarker.x} y={largestMarker.y - 10} text-anchor="middle" class="fill-ink text-[10px] font-semibold" font-size="10">
              Largest {formatMoney(largestMarker.amount)}
            </text>
          {/if}
        </svg>

        <table class="sr-only">
          <caption>Donations per {BUCKET_MINUTES}-minute bucket, Chicago time, with a running cumulative total</caption>
          <thead>
            <tr><th scope="col">Time (CT)</th><th scope="col">Amount</th><th scope="col">Cumulative</th></tr>
          </thead>
          <tbody>
            {#each srRows as row (row.label + row.cumulative)}
              <tr><td>{row.label}</td><td>{row.amount}</td><td>{row.cumulative}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Panel>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        label="Busiest 5 minutes"
        value={timeline.busiest ? formatMoney(timeline.busiest.amount) : formatMoney(0)}
        hint={timeline.busiest ? `Starting ${timeline.busiest.label} CT` : "No gifts recorded"}
        tone="gold"
      />
      <StatCard
        label="Time to half the total"
        value={timeline.timeToHalf ? formatTimeCT(timeline.timeToHalf, CHICAGO_TZ) : "–"}
        hint={`Half of ${formatMoney(timeline.totalInWindow)}`}
        tone="teal"
      />
      <StatCard
        label="First and last gift"
        value={timeline.firstGiftAt ? `${formatTimeCT(timeline.firstGiftAt, CHICAGO_TZ)} – ${formatTimeCT(timeline.lastGiftAt, CHICAGO_TZ)}` : "–"}
        hint={formatDateCT(timeline.night.start, CHICAGO_TZ)}
        tone="neutral"
      />
    </div>
  {/if}
</div>
