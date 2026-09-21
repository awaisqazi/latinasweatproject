<!--
  One round table: a cream linen disc with a gold rim, ten seats on the ring
  with seat 0 at the top, and a centre plate showing the number, an optional
  name, the fill count and a warning badge.
-->
<script>
  import { MEALS, SEAT_R, SEAT_RING_R, TABLE_R, seatPosition } from "../../lib/galaSeating/model.js";

  let {
    table,
    guests = [],
    bad = false,
    warnings = [],
    byGuest = {},
    dragOver = null,
    dragLevel = "ok",
    dragActive = false,
    showNames = false,
    layoutLocked = false,
    ghostBad = false,
    people = [],
    focusByGuest = {},
    pulses = {},
    focusPulse = null,
    selectedGuestId = null,
    locate = null,
    dim = false,
    reducedMotion = false,
    /** Current view scale, so the centre plate can stay readable when zoomed out. */
    k = 1,
    onseat = () => {},
    ontable = () => {},
    onseatkeydown = () => {},
    ontablekeydown = () => {},
    onhover = () => {},
  } = $props();

  const mealColor = {
    "short-rib": "var(--gs-meal-short-rib)",
    whitefish: "var(--gs-meal-whitefish)",
    ravioli: "var(--gs-meal-ravioli)",
  };

  const seatIdx = $derived(Array.from({ length: table.seats }, (_, i) => i));
  const filled = $derived(guests.filter(Boolean).length);
  const severity = $derived(
    warnings.some((w) => w.severity === "error")
      ? "error"
      : warnings.some((w) => w.severity === "warn")
        ? "warn"
        : warnings.length
          ? "info"
          : "",
  );
  const free = $derived(table.seats - filled);
  const isTarget = $derived(Boolean(dragOver));
  const locatedHere = $derived(locate?.tableId === table.id);

  /*
   * The centre plate, drawn at a size a person can read.
   *
   * Everything on the floor is in room units and scales with the view, which is
   * right for the furniture and wrong for the label: zoomed out to see the
   * whole room, a 30-unit number renders at six pixels. The number is given a
   * floor in SCREEN pixels and converted back into room units, so it grows as
   * the room shrinks and is untouched at any normal working zoom.
   */
  const unit = $derived(1 / Math.max(k, 0.01));
  /** Screen size of the number: never below 12.5px, never above its natural 30. */
  const numPx = $derived(Math.min(30, Math.max(12.5, 30 * k)));
  /**
   * "7/10" is five characters; below about five pixels a character it is noise
   * inside a small disc, and no amount of scaling fits it there. At that point
   * the rim arc carries how full the table is, which reads at any size.
   */
  const countIsLegible = $derived(12 * k >= 5);
  const fillArc = $derived.by(() => {
    if (countIsLegible || !table.seats) return null;
    const r = TABLE_R - 6;
    const frac = Math.max(0, Math.min(1, filled / table.seats));
    if (frac <= 0) return { path: "", frac: 0, r };
    if (frac >= 1) return { path: "full", frac: 1, r };
    const a0 = -Math.PI / 2;
    const a1 = a0 + frac * Math.PI * 2;
    const x0 = table.x + Math.cos(a0) * r;
    const y0 = table.y + Math.sin(a0) * r;
    const x1 = table.x + Math.cos(a1) * r;
    const y1 = table.y + Math.sin(a1) * r;
    const large = frac > 0.5 ? 1 : 0;
    return { path: `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`, frac, r };
  });

  function initials(name) {
    const parts = String(name || "")
      .replace(/\(.*?\)/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function firstName(name) {
    const first = String(name || "").trim().split(/\s+/)[0] || "";
    return first.length > 9 ? `${first.slice(0, 8)}.` : first;
  }

  function guestSeverity(guest) {
    const list = byGuest[guest.id] || [];
    if (list.some((w) => w.severity === "error")) return "error";
    if (list.some((w) => w.severity === "warn")) return "warn";
    return "";
  }

  function hoverIn(event, guest, seat) {
    if (!guest) {
      onhover(null);
      return;
    }
    const meal = MEALS.find((m) => m.id === guest.meal);
    onhover({
      name: guest.name,
      sub: [`Seat ${seat + 1}`, guest.partyLabel, meal?.short].filter(Boolean).join(" · "),
      x: event.clientX,
      y: event.clientY,
    });
  }
</script>

<g
  class="tn"
  class:tn--target={isTarget}
  class:tn--bad={bad || ghostBad}
  class:tn--locked={table.locked}
  class:tn--dim={dim}
  class:tn--located={locatedHere}
  data-level={isTarget ? dragLevel : ""}
>
  <g data-ghost-for={table.id}>
    <!-- Glow for a table that still has room, while something is being dragged -->
    {#if dragActive && free > 0 && !isTarget}
      <circle class="tn-glow" cx={table.x} cy={table.y} r={SEAT_RING_R + 18} />
    {/if}
    {#if isTarget}
      <circle class="tn-ring" cx={table.x} cy={table.y} r={SEAT_RING_R + 20} />
    {/if}

    <!-- Seats -->
    {#each seatIdx as i (i)}
      {@const pos = seatPosition(table, i)}
      {@const guest = guests[i] || null}
      {@const sev = guest ? guestSeverity(guest) : ""}
      {@const pulse = guest ? pulses[guest.id] : null}
      {@const watcher = guest ? focusByGuest[guest.id] : null}
      <g
        class="tn-seat"
        class:tn-seat--empty={!guest}
        class:tn-seat--hot={dragOver?.seat === i}
        class:tn-seat--placeholder={guest?.placeholder}
        class:tn-seat--pulse={Boolean(pulse) || focusPulse === guest?.id}
        class:tn-seat--selected={Boolean(guest) && guest.id === selectedGuestId}
        data-sev={sev}
        id={`gs-seat-${table.id}-${i}`}
        data-drag={guest ? "guest" : null}
        data-guest={guest?.id}
        data-table={table.id}
        data-seat={i}
        role="button"
        tabindex="-1"
        aria-label={guest ? `Seat ${i + 1}, ${guest.name}` : `Seat ${i + 1}, empty`}
        onclick={(e) => {
          e.stopPropagation();
          onseat(table.id, i);
        }}
        onkeydown={(e) => onseatkeydown(e, table.id, i)}
        onpointerenter={(e) => hoverIn(e, guest, i)}
        onpointerleave={() => onhover(null)}
        onfocus={(e) => hoverIn(e, guest, i)}
        onblur={() => onhover(null)}
      >
        <circle
          class="tn-seatdisc"
          cx={pos.x}
          cy={pos.y}
          r={SEAT_R}
          style={pulse ? `--gs-pulse:${pulse.color}` : watcher ? `--gs-pulse:${watcher.color}` : ""}
        />
        {#if guest}
          <text class="tn-seatinit" x={pos.x} y={pos.y + 4}>{initials(guest.name)}</text>
          {#if guest.hasDinner}
            <circle
              class="tn-meal"
              cx={pos.x + SEAT_R - 5}
              cy={pos.y - SEAT_R + 5}
              r="4.2"
              fill={mealColor[guest.meal] || "var(--gs-meal-none)"}
            />
          {/if}
          {#if showNames}
            <text class="tn-seatname" x={pos.x} y={pos.y + SEAT_R + 12}>{firstName(guest.name)}</text>
          {/if}
          {#if watcher}
            <circle class="tn-watch" cx={pos.x} cy={pos.y} r={SEAT_R + 5} style={`stroke:${watcher.color}`} />
          {/if}
          {#if guest.id === selectedGuestId}
            <circle class="tn-selring" cx={pos.x} cy={pos.y} r={SEAT_R + 6} />
          {/if}
          {#if locate?.guestId === guest.id}
            {#if reducedMotion}
              <circle class="tn-beaconstatic" cx={pos.x} cy={pos.y} r={SEAT_R + 12} />
            {:else}
              {#each [0, 1, 2] as ring (ring)}
                <circle
                  class="tn-beacon"
                  cx={pos.x}
                  cy={pos.y}
                  r={SEAT_R + 2}
                  style={`animation-delay:${ring * 0.22}s`}
                />
              {/each}
            {/if}
          {/if}
        {:else}
          <text class="tn-seatnum" x={pos.x} y={pos.y + 4}>{i + 1}</text>
        {/if}
      </g>
    {/each}

    <!-- Linen disc -->
    <g
      class="tn-disc"
      id={`gs-table-${table.id}`}
      data-drag="table"
      data-id={table.id}
      role="button"
      tabindex="0"
      aria-label={`${table.name ? `Table ${table.number}, ${table.name}` : `Table ${table.number}`}, ${filled} of ${table.seats} seated`}
      onclick={(e) => {
        e.stopPropagation();
        ontable(table.id);
      }}
      onkeydown={(e) => ontablekeydown(e, table)}
    >
      <circle class="tn-linen" cx={table.x} cy={table.y} r={TABLE_R} />
      <circle class="tn-rim" cx={table.x} cy={table.y} r={TABLE_R - 7} />

      {#if countIsLegible}
        <text class="tn-num" x={table.x} y={table.y - (table.name ? 8 : 2)}>{table.number}</text>
        {#if table.name}
          <text class="tn-name" x={table.x} y={table.y + 12}>{table.name.slice(0, 16)}</text>
        {/if}
        <text class="tn-count" x={table.x} y={table.y + (table.name ? 28 : 22)}>{filled}/{table.seats}</text>
      {:else}
        <!-- Zoomed out: the number, held at a readable size, and a rim gauge
             instead of a "7/10" too small to be anything but grey mush. -->
        <text
          class="tn-num"
          x={table.x}
          y={table.y + numPx * 0.34 * unit}
          style={`font-size:${numPx * unit}px`}>{table.number}</text>
        {#if fillArc}
          <circle
            class="tn-gaugetrack"
            cx={table.x}
            cy={table.y}
            r={fillArc.r}
            style={`stroke-width:${Math.max(4, 3 * unit)}px`}
          />
          {#if fillArc.frac >= 1}
            <circle
              class="tn-gauge"
              cx={table.x}
              cy={table.y}
              r={fillArc.r}
              style={`stroke-width:${Math.max(4, 3 * unit)}px`}
            />
          {:else if fillArc.path}
            <path class="tn-gauge" d={fillArc.path} style={`stroke-width:${Math.max(4, 3 * unit)}px`} />
          {/if}
        {/if}
      {/if}
      {#if table.locked}
        <path
          class="tn-lock"
          d={`M ${table.x - 26} ${table.y - 30} h 10 v -4 a 5 5 0 0 1 10 0 v 4 h 2 v 11 h -22 z`}
        />
      {/if}
      {#if severity}
        <g class="tn-badge" data-sev={severity}>
          <circle cx={table.x + TABLE_R - 12} cy={table.y - TABLE_R + 12} r="11" />
          <text x={table.x + TABLE_R - 12} y={table.y - TABLE_R + 16}>{warnings.length}</text>
        </g>
      {/if}
    </g>
  </g>

  <!-- Other planners looking at this table -->
  {#if people.length}
    <g class="tn-people">
      {#each people.slice(0, 3) as person, i (person.client)}
        <g transform={`translate(${table.x - TABLE_R + i * 22} ${table.y + TABLE_R + 16})`}>
          <circle r="9" style={`fill:${person.color}`} />
          <text class="tn-peoplei" y="3.5">{(person.editor || "?").slice(0, 1).toUpperCase()}</text>
        </g>
      {/each}
      {#if people[0]?.editor}
        <text class="tn-peoplename" x={table.x} y={table.y + TABLE_R + 40}>{people[0].editor} is moving this</text>
      {/if}
    </g>
  {/if}
</g>

<style>
  .tn-linen {
    fill: url(#gs-linen);
    stroke: rgba(185, 132, 47, 0.9);
    stroke-width: 1.6;
    filter: url(#gs-soft);
  }
  .tn-rim {
    fill: none;
    stroke: rgba(185, 132, 47, 0.42);
    stroke-width: 1;
  }
  .tn--bad .tn-linen {
    stroke: #e06a5a;
    stroke-width: 2.4;
  }
  .tn--bad .tn-rim {
    stroke: rgba(224, 106, 90, 0.55);
  }
  .tn--locked .tn-rim {
    stroke-dasharray: 5 4;
  }
  .tn-disc {
    cursor: pointer;
  }
  .tn-num {
    fill: #2a3444;
    font-family: "Playfair Display", Georgia, serif;
    font-size: 30px;
    font-weight: 600;
    text-anchor: middle;
    pointer-events: none;
  }
  .tn-name {
    fill: #5a6473;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-anchor: middle;
    font-family: Arial, sans-serif;
    pointer-events: none;
  }
  .tn-count {
    fill: #7a8394;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-anchor: middle;
    font-family: Arial, sans-serif;
    pointer-events: none;
  }
  .tn-lock {
    fill: rgba(90, 100, 115, 0.55);
    pointer-events: none;
  }
  /* The rim gauge: how full this table is, at a size that survives any zoom. */
  .tn-gaugetrack {
    fill: none;
    stroke: rgba(42, 52, 68, 0.18);
    pointer-events: none;
  }
  .tn-gauge {
    fill: none;
    stroke: var(--gs-gold);
    stroke-linecap: round;
    pointer-events: none;
  }
  .tn-badge circle {
    fill: #e2a33c;
    stroke: #fff8ef;
    stroke-width: 1.5;
  }
  .tn-badge[data-sev="error"] circle {
    fill: #e06a5a;
  }
  .tn-badge[data-sev="info"] circle {
    fill: #8794a5;
  }
  .tn-badge text {
    fill: #17202c;
    font-size: 12px;
    font-weight: 700;
    text-anchor: middle;
    font-family: Arial, sans-serif;
    pointer-events: none;
  }

  .tn-seat {
    cursor: pointer;
  }
  .tn-seatdisc {
    transform-box: fill-box;
    transform-origin: center;
    fill: #253244;
    stroke: rgba(228, 201, 138, 0.55);
    stroke-width: 1.4;
    transition: fill 0.15s ease;
  }
  .tn-seat--empty .tn-seatdisc {
    fill: rgba(255, 255, 255, 0.03);
    stroke: rgba(228, 201, 138, 0.3);
    stroke-dasharray: 4 4;
  }
  .tn-seat--placeholder .tn-seatdisc {
    stroke-dasharray: 3 3;
    stroke: rgba(228, 201, 138, 0.75);
  }
  .tn-seat[data-sev="warn"] .tn-seatdisc {
    stroke: #e2a33c;
    stroke-width: 2.2;
  }
  .tn-seat[data-sev="error"] .tn-seatdisc {
    stroke: #e06a5a;
    stroke-width: 2.4;
  }
  .tn-seat--hot .tn-seatdisc {
    fill: rgba(255, 189, 89, 0.38);
    stroke: #ffbd59;
    stroke-width: 2.4;
    stroke-dasharray: none;
  }
  .tn-seat:hover .tn-seatdisc {
    fill: #32425a;
  }
  .tn-seatinit {
    fill: var(--gs-cream);
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-anchor: middle;
    font-family: Arial, sans-serif;
    pointer-events: none;
  }
  .tn-seatnum {
    fill: rgba(228, 201, 138, 0.45);
    font-size: 11px;
    text-anchor: middle;
    font-family: Arial, sans-serif;
    pointer-events: none;
  }
  .tn-seatname {
    fill: rgba(243, 236, 225, 0.85);
    font-size: 10.5px;
    text-anchor: middle;
    font-family: Arial, sans-serif;
    pointer-events: none;
  }
  .tn-meal {
    stroke: #0b1320;
    stroke-width: 1;
    pointer-events: none;
  }
  .tn-watch {
    fill: none;
    stroke-width: 2;
    opacity: 0.85;
    pointer-events: none;
  }

  .tn-glow {
    fill: rgba(255, 189, 89, 0.05);
    stroke: rgba(255, 189, 89, 0.18);
    stroke-width: 1;
    pointer-events: none;
  }
  .tn-ring {
    fill: rgba(255, 189, 89, 0.1);
    stroke: #ffbd59;
    stroke-width: 2;
    pointer-events: none;
  }
  .tn[data-level="warn"] .tn-ring {
    fill: rgba(226, 163, 60, 0.14);
    stroke: #e2a33c;
  }
  .tn[data-level="error"] .tn-ring {
    fill: rgba(224, 106, 90, 0.16);
    stroke: #e06a5a;
  }

  .tn-people text {
    text-anchor: middle;
    font-family: Arial, sans-serif;
    pointer-events: none;
  }
  .tn-peoplei {
    fill: #17202c;
    font-size: 10px;
    font-weight: 700;
  }
  .tn-peoplename {
    fill: rgba(243, 236, 225, 0.7);
    font-size: 10.5px;
  }

  .tn--dim {
    opacity: 0.32;
    transition: opacity 0.3s ease;
  }
  .tn--located .tn-rim {
    stroke: var(--gs-gold-bright);
    stroke-width: 2.4;
  }
  .tn-selring {
    fill: none;
    stroke: #ffbd59;
    stroke-width: 2.6;
    pointer-events: none;
  }
  .tn-beaconstatic {
    fill: none;
    stroke: #ffbd59;
    stroke-width: 3;
    pointer-events: none;
  }
  .tn-beacon {
    fill: none;
    stroke: #ffbd59;
    stroke-width: 3;
    pointer-events: none;
    opacity: 0;
  }
  @media (prefers-reduced-motion: no-preference) {
    .tn-beacon {
      animation: gs-beacon 1.4s ease-out 1;
    }
    .tn--located .tn-seat--selected .tn-seatdisc {
      animation: gs-seat-bounce 0.5s ease-out 1;
    }
    @keyframes gs-beacon {
      0% {
        r: 20;
        opacity: 0.9;
      }
      100% {
        r: 64;
        opacity: 0;
      }
    }
    @keyframes gs-seat-bounce {
      0% {
        transform: scale(1);
      }
      45% {
        transform: scale(1.22);
      }
      100% {
        transform: scale(1);
      }
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .tn-seat--pulse .tn-seatdisc {
      animation: gs-seat-pulse 1.4s ease-out 1;
    }
    @keyframes gs-seat-pulse {
      0% {
        stroke: var(--gs-pulse, #ffbd59);
        stroke-width: 6;
      }
      100% {
        stroke-width: 1.4;
      }
    }
  }
</style>
