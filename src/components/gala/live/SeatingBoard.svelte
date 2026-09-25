<script>
  // "Find your table" on the projector, shown while guests walk in. Four
  // boards on a loop (src/lib/galaLive/program.js SEATING_BOARDS):
  //
  //   1. "all": the WHOLE ROOM with every name, laid out like the corridor:
  //      one screen column per plan row, the podium row of three at the coat
  //      check end on the left, then the rows of two toward the entrance on
  //      the right. One font size for every name, set by the tallest column;
  //      each name is then fitted to its box width (fitName: shrink to 70%,
  //      then middle initials, never an ellipsis). Owns the whole stage.
  //   2-4. zoomed groups of rows with bigger names, each with a mini-map of
  //      the corridor (the group's tables in gold) so a guest can see where
  //      that group sits in the room.
  //
  // `board` comes from src/lib/galaLive/seatingBoard.js: either the live plan
  // (names, only with the seating passcode in the projector's URL fragment) or
  // the numbers-only map. Every size is a stage unit (1920 x 1080); the root
  // covers the stage and places everything in stage coordinates.
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { SEATING_BOARDS, SEATING_BOARD_MS } from "../../../lib/galaLive/program.js";
  import { fitName, measure100 } from "../../../lib/galaLive/fitName.js";
  import SeatMiniMap from "./SeatMiniMap.svelte";

  let { board = null, reduced = false, eyebrow = "", idx = $bindable(0) } = $props();

  // Every entry into the seating segment starts on the whole room.
  onMount(() => {
    idx = 0;
  });
  $effect(() => {
    const ms = SEATING_BOARDS[idx]?.ms || SEATING_BOARD_MS;
    const t = setTimeout(() => {
      idx = (idx + 1) % SEATING_BOARDS.length;
    }, ms);
    return () => clearTimeout(t);
  });

  const current = $derived(SEATING_BOARDS[idx] || SEATING_BOARDS[0]);
  const whole = $derived(current.id === "all");
  const numbersOnly = $derived(!board || !!board.numbersOnly);
  const podSide = $derived(board?.podSide || "N. Gallery");
  const rows = $derived(board?.rows || []);

  /* ---------------- geometry (stage units) ---------------- */
  // Whole room: the boxes fill this rectangle.
  const WROOM = { left: 24, top: 148, w: 1872, h: 918 };
  // Zoomed boards: the board area, the mini-map column on its right.
  const ZAREA = { left: 96, top: 180, w: 1728, h: 700 };
  const SIDE_W = 300;
  const SIDE_GAP = 30;
  const MINI_H = 140;
  const ZROOM = { top: 52, w: ZAREA.w - SIDE_W - SIDE_GAP, h: ZAREA.h - 52 };

  const BORDER = 2;
  const GAP_SEAT = 8;

  const seatWidth = (ss) => (measure100("00", 800) * ss) / 100;
  const longestAt = (col, fs) =>
    Math.max(0, ...col.flatMap((t) => t.guests.map((g) => (measure100(g.name, 600) * fs) / 100)));

  /** Column widths proportional to need, never below 60% of an even share. */
  function widthsFor(needs, usable) {
    if (numbersOnly) return needs.map(() => usable / needs.length);
    const floorW = (usable / needs.length) * 0.6;
    const n2 = needs.map((w) => Math.max(floorW, w));
    const sum = n2.reduce((x, y) => x + y, 0);
    return n2.map((w) => (w * usable) / sum);
  }

  function seatsOf(t, avail, fs, rowH) {
    const out = [];
    for (let i = 1; i <= t.seats; i++) {
      const guest = t.guests.find((q) => q.seat === i);
      const fit = guest ? fitName(guest.name, { avail, size: fs, rowH }) : null;
      out.push({ seat: i, name: guest ? guest.name : "", fit });
    }
    return out;
  }

  /**
   * The whole room. One column per plan row (rows[0] = coat check end), tables
   * top to bottom by plan x. A column of two splits its height evenly (so the
   * rows line up across the room); a column of three or more splits by seat
   * count. ONE name size for the whole board: the tightest seat row decides.
   */
  function placeWhole(b, W, H) {
    const cols = (b?.rows || []).filter((r) => r && r.length);
    if (!cols.length) return [];
    const gap = 10;
    const rowGap = 10;
    const padX = 8;
    const padV = 6;
    const hdSize = numbersOnly ? 44 : 22;
    const hdH = numbersOnly ? 0 : 32;
    const chromeV = hdH + padV + 2 * BORDER;

    const colBoxes = cols.map((col) => {
      const n = col.length;
      const avail = H - rowGap * (n - 1);
      if (n >= 3) {
        const seats = col.reduce((s, t) => s + t.seats, 0);
        const liH = (avail - n * chromeV) / seats;
        return col.map((t) => ({ t, h: chromeV + t.seats * liH, liH }));
      }
      return col.map((t) => ({ t, h: avail / n, liH: (avail / n - chromeV) / t.seats }));
    });
    const minLi = Math.min(...colBoxes.flat().map((x) => x.liH));
    const fs = Math.min(30, minLi * 0.78);
    const ss = Math.min(fs * 0.74, 20);
    const chromeH = 2 * padX + 2 * BORDER + seatWidth(ss) + GAP_SEAT + 4;
    const widths = widthsFor(
      cols.map((col) => chromeH + (numbersOnly ? 0 : longestAt(col, fs))),
      W - gap * (cols.length - 1),
    );

    const out = [];
    let x = 0;
    colBoxes.forEach((col, c) => {
      const boxW = widths[c];
      const avail = boxW - chromeH;
      let y = 0;
      for (const { t, h, liH } of col) {
        out.push({
          t,
          left: x,
          top: y,
          w: boxW,
          h,
          hdH,
          hdSize,
          liH,
          fs,
          ss,
          padX,
          padV,
          // One line per seat on the whole room: no two-line wrap at this size.
          seats: numbersOnly ? [] : seatsOf(t, avail, fs, 0),
        });
        y += h + rowGap;
      }
      x += boxW + gap;
    });
    return out;
  }

  /**
   * A zoomed group of rows: one row alone lays its tables side by side,
   * several rows become columns. Names may take two lines here.
   */
  function placeZoom(b, rowsIdx, W, H) {
    const picked = rowsIdx.map((r) => b?.rows?.[r]).filter((r) => r && r.length);
    if (!picked.length) return [];
    const single = picked.length === 1;
    const cols = single ? picked[0].map((t) => [t]) : picked;
    const gap = 28;
    const rowGap = 26;
    const padX = 12;
    const padV = 8;
    const hdSize = numbersOnly ? 44 : single ? 34 : 28;
    const hdH = numbersOnly ? 0 : Math.round(hdSize * 1.5);
    const nameSize = single ? 34 : 28;
    const maxSeats = Math.max(...picked.flat().map((t) => t.seats));
    const chromeV = hdH + padV + 2 * BORDER;

    const geo = cols.map((col) => {
      const n = col.length;
      const boxH = (H - rowGap * (n - 1)) / n;
      const liH = (boxH - chromeV) / maxSeats;
      const fs = Math.min(nameSize, liH * 0.7);
      const ss = Math.min(fs * 0.72, 22);
      const chrome = 2 * padX + 2 * BORDER + seatWidth(ss) + GAP_SEAT + 4;
      return { boxH, liH, fs, ss, chrome, need: chrome + (numbersOnly ? 0 : longestAt(col, fs)) };
    });
    const widths = widthsFor(geo.map((g) => g.need), W - gap * (cols.length - 1));

    const out = [];
    let x = 0;
    cols.forEach((col, c) => {
      const g = geo[c];
      const boxW = widths[c];
      col.forEach((t, r) => {
        out.push({
          t,
          left: x,
          top: r * (g.boxH + rowGap),
          w: boxW,
          h: g.boxH,
          hdH,
          hdSize,
          liH: g.liH,
          fs: g.fs,
          ss: g.ss,
          padX,
          padV,
          seats: numbersOnly ? [] : seatsOf(t, boxW - g.chrome, g.fs, g.liH * 0.94),
        });
      });
      x += boxW + gap;
    });
    return out;
  }

  const boxes = $derived(
    whole ? placeWhole(board, WROOM.w, WROOM.h) : placeZoom(board, current.rows, ZROOM.w, ZROOM.h),
  );
  const groupTables = $derived(
    whole ? [] : current.rows.flatMap((r) => (rows[r] || []).map((t) => t.number)),
  );
  const pos = (l, t, w, h) =>
    `left: calc(var(--u) * ${l}); top: calc(var(--u) * ${t}); width: calc(var(--u) * ${w}); height: calc(var(--u) * ${h})`;
</script>

{#snippet tableBox(b)}
  <div class="box" class:bare={numbersOnly} data-table={b.t.number} style={pos(b.left, b.top, b.w, b.h)}>
    {#if numbersOnly}
      <span class="n big" style={`font-size: calc(var(--u) * ${b.hdSize})`}>Table {b.t.number}</span>
    {:else}
      <div class="hd" style={`height: calc(var(--u) * ${b.hdH}); padding: 0 calc(var(--u) * ${b.padX})`}>
        <span class="n" style={`font-size: calc(var(--u) * ${b.hdSize})`}>Table {b.t.number}</span>
        <span class="c" style={`font-size: calc(var(--u) * ${Math.max(14, b.hdSize * 0.62)})`}>{b.t.guests.length}/{b.t.seats}</span>
      </div>
      <ol style={`padding: calc(var(--u) * ${b.padV / 2}) calc(var(--u) * ${b.padX})`}>
        {#each b.seats as s (s.seat)}
          <li class:open={!s.name} class:two={s.fit?.lines.length > 1} style={`height: calc(var(--u) * ${b.liH})`}>
            <span class="s" style={`font-size: calc(var(--u) * ${b.ss})`}>{String(s.seat).padStart(2, "0")}</span>
            {#if s.fit}
              <span class="nm" style={`font-size: calc(var(--u) * ${s.fit.size}); line-height: ${s.fit.lineHeight}`}>
                {#each s.fit.lines as ln, k (k)}<span class="ln">{ln}</span>{/each}
              </span>
            {:else}
              <span class="nm" style={`font-size: calc(var(--u) * ${b.fs})`}>open</span>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </div>
{/snippet}

{#snippet dots()}
  <span class="dots" aria-hidden="true">
    {#each SEATING_BOARDS as bd, i (bd.id)}<i class:on={i === idx}></i>{/each}
  </span>
{/snippet}

<div class="sb">
  {#key idx}
    <div class="layer" in:fade={{ duration: reduced ? 0 : 700, delay: reduced ? 0 : 250 }} out:fade={{ duration: reduced ? 0 : 450 }}>
      {#if whole}
        <div class="w-head" style={pos(24, 14, 1100, 100)}>
          {#if eyebrow}<div class="eyebrow">{eyebrow}</div>{/if}
          <h1 class="w-title">Find your table</h1>
        </div>
        <div class="w-label" style={pos(1000, 30, 720, 60)}>
          <span>{current.label}</span>
          {@render dots()}
        </div>
        <div class="front w-front" style={pos(WROOM.left, 108, WROOM.w, 34)}>
          <span>&#9664; Coat check end</span>
          <span class="mid">
            {#if board && !numbersOnly}
              {board.tables} tables · {board.seated} dinner guests · Podium on the {podSide} side · Seat 1 is on the coat check side, seats count clockwise
            {:else}
              Your table number is on your place card · Podium on the {podSide} side
            {/if}
          </span>
          <span>Entrance end &#9654;</span>
        </div>
        <div class="room" data-seat-room style={pos(WROOM.left, WROOM.top, WROOM.w, WROOM.h)}>
          {#each boxes as b (b.t.id)}{@render tableBox(b)}{/each}
        </div>
      {:else}
        <div class="z-area" data-seat-area style={pos(ZAREA.left, ZAREA.top, ZAREA.w, ZAREA.h)}>
          <div class="front" style={pos(0, 0, ZROOM.w, 40)}>
            <span>&#9664; Coat check end</span>
            <span>Podium on the {podSide} side</span>
            <span>Entrance end &#9654;</span>
          </div>
          <div class="room" data-seat-room style={pos(0, ZROOM.top, ZROOM.w, ZROOM.h)}>
            {#each boxes as b (b.t.id)}{@render tableBox(b)}{/each}
          </div>
          <div class="side" style={pos(ZAREA.w - SIDE_W, 0, SIDE_W, ZAREA.h)}>
            <div class="mini" data-seat-mini style={`height: calc(var(--u) * ${MINI_H})`}>
              <SeatMiniMap {rows} highlight={groupTables} vw={SIDE_W} vh={MINI_H} label={`Where ${current.label.toLowerCase()} sits in the room`} />
            </div>
            <div class="z-label">{current.label}</div>
            <div class="legend"><i></i><span>Gold: the tables on this board</span></div>
            {@render dots()}
          </div>
        </div>
      {/if}
    </div>
  {/key}
</div>

<style>
  .sb,
  .layer {
    position: absolute;
    left: 0;
    top: 0;
    width: calc(var(--u) * 1920);
    height: calc(var(--u) * 1080);
    pointer-events: none;
  }
  .w-head,
  .w-label,
  .front,
  .room,
  .z-area,
  .side,
  .box {
    position: absolute;
  }
  .box,
  li {
    box-sizing: border-box;
  }

  /* ---------- whole room: head ---------- */
  .eyebrow {
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.24em;
    font-size: calc(var(--u) * 18);
    color: var(--g26-gold);
  }
  .w-title {
    margin: calc(var(--u) * 4) 0 0;
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
    font-size: calc(var(--u) * 58);
    line-height: 1;
    color: var(--g26-cream);
  }
  .w-label {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: calc(var(--u) * 16);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    font-size: calc(var(--u) * 20);
    color: var(--g26-gold);
  }

  /* ---------- the corridor ends ---------- */
  .front {
    border-top: calc(var(--u) * 3) solid rgba(255, 189, 89, 0.75);
    padding-top: calc(var(--u) * 7);
    display: flex;
    justify-content: space-between;
    gap: calc(var(--u) * 20);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: calc(var(--u) * 18);
    color: var(--g26-gold-soft);
    white-space: nowrap;
  }
  .w-front {
    font-size: calc(var(--u) * 17);
  }
  .front .mid {
    letter-spacing: 0.08em;
    text-transform: none;
    font-weight: 700;
    color: var(--g26-muted);
    overflow: hidden;
  }

  /* ---------- table boxes ---------- */
  .box {
    display: flex;
    flex-direction: column;
    background: rgba(5, 7, 12, 0.82);
    border: calc(var(--u) * 2) solid rgba(255, 189, 89, 0.5);
    border-radius: calc(var(--u) * 4);
    overflow: hidden;
  }
  .box.bare {
    justify-content: center;
    align-items: center;
    background: rgba(5, 7, 12, 0.72);
  }
  .hd {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: linear-gradient(90deg, rgba(255, 189, 89, 0.24), rgba(255, 189, 89, 0.08));
    border-bottom: calc(var(--u) * 2) solid rgba(255, 189, 89, 0.45);
    box-sizing: border-box;
  }
  .n {
    font-family: var(--g26-serif);
    font-style: italic;
    color: var(--g26-cream);
    line-height: 1;
    white-space: nowrap;
  }
  .hd .c {
    font-weight: 800;
    letter-spacing: 0.06em;
    color: var(--g26-gold);
    font-variant-numeric: tabular-nums;
  }
  ol {
    list-style: none;
    margin: 0;
    overflow: hidden;
    flex: 1;
    min-height: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 8);
    border-bottom: calc(var(--u) * 1) solid rgba(228, 201, 138, 0.2);
    white-space: nowrap;
  }
  li:last-child {
    border-bottom: 0;
  }
  li .s {
    flex: 0 0 auto;
    font-weight: 800;
    color: var(--g26-gold-soft);
    font-variant-numeric: tabular-nums;
  }
  li .nm {
    flex: 1;
    min-width: 0;
    font-weight: 600;
    color: var(--g26-cream);
    white-space: nowrap;
  }
  li .ln {
    display: block;
  }
  li.two {
    align-items: flex-start;
    padding-top: calc(var(--u) * 1);
  }
  li.two .s {
    line-height: 1.35;
  }
  li.open .nm {
    color: var(--g26-muted);
    font-style: italic;
    font-weight: 500;
    opacity: 0.8;
  }

  /* ---------- zoomed boards: the mini-map column ---------- */
  .side {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 14);
  }
  .mini {
    flex: 0 0 auto;
    width: 100%;
    padding: 0;
  }
  .z-label {
    margin-top: calc(var(--u) * 6);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: calc(var(--u) * 22);
    line-height: 1.35;
    color: var(--g26-gold);
  }
  .legend {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 10);
    font-weight: 700;
    font-size: calc(var(--u) * 18);
    color: var(--g26-muted);
  }
  .legend i {
    flex: 0 0 auto;
    width: calc(var(--u) * 18);
    height: calc(var(--u) * 18);
    border-radius: calc(var(--u) * 2);
    background: var(--g26-gold);
  }
  .dots {
    display: inline-flex;
    gap: calc(var(--u) * 8);
  }
  .dots i {
    width: calc(var(--u) * 12);
    height: calc(var(--u) * 12);
    transform: rotate(45deg);
    border: calc(var(--u) * 2) solid rgba(255, 189, 89, 0.7);
  }
  .dots i.on {
    background: var(--g26-gold);
  }
</style>
