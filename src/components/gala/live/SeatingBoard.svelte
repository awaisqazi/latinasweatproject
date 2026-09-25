<script>
  // "Find your table" on the projector: the dinner corridor laid out like the
  // printed seating slides (podium row of three at the coat check end on the
  // left, then rows of two toward the entrance), restyled for the Constelacion
  // projector theme. Cycles whole corridor, north end, rows 1 to 3, rows 4 to 7
  // every 10 s until the program moves on.
  //
  // `board` comes from src/lib/galaLive/seatingBoard.js: either the live plan
  // (names, only with the seating passcode in the projector's URL fragment) or
  // the numbers-only map. Sizes are stage units (1920 x 1080).
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { SEATING_BOARDS, SEATING_BOARD_MS } from "../../../lib/galaLive/program.js";
  import { fitName, measure100 } from "../../../lib/galaLive/fitName.js";

  let { board = null, width = 1728, height = 680, reduced = false } = $props();

  let idx = $state(0);
  onMount(() => {
    const t = setInterval(() => {
      idx = (idx + 1) % SEATING_BOARDS.length;
    }, SEATING_BOARD_MS);
    return () => clearInterval(t);
  });

  const current = $derived(SEATING_BOARDS[idx]);
  const numbersOnly = $derived(!board || board.numbersOnly);

  const PAD_X = 12; // ol side padding
  const BORDER = 2;
  const GAP_SEAT = 10;

  /**
   * Port of place() in the printed slides' build script, in stage units, with
   * one change: column widths follow the longest name in each column, and
   * every name is fitted (fitName: shrink, then two lines, then middle
   * initials). Nothing is ever cut off with an ellipsis.
   */
  function place(b, rowsIdx, W, H) {
    if (!b?.rows?.length) return [];
    const picked = rowsIdx.map((r) => b.rows[r]).filter((r) => r && r.length);
    if (!picked.length) return [];
    const whole = rowsIdx.length > 4;
    const single = picked.length === 1;
    const cols = single ? picked[0].map((t) => [t]) : picked;
    const gap = whole ? 12 : 30;
    const rowGap = whole ? 14 : 28;
    const hdSize = numbersOnly ? (whole ? 30 : 44) : whole ? 17 : single ? 34 : 28;
    const nameSize = whole ? 16 : single ? 34 : 26;
    const ncols = cols.length;
    const maxSeats = Math.max(...picked.flat().map((t) => t.seats));
    const hdH = hdSize * 1.55;
    const padV = 8;

    // Per column: the row height and font size its table count allows.
    const geo = cols.map((col) => {
      const n = col.length;
      const boxH = (H - rowGap * (n - 1)) / n;
      const liH = (boxH - hdH - padV) / maxSeats;
      const fs = Math.min(nameSize, liH * 0.7);
      const ss = Math.min(fs * 0.72, 22);
      const seatW = (measure100("00", 800) * ss) / 100;
      const chrome = 2 * PAD_X + 2 * BORDER + seatW + GAP_SEAT + 6;
      const longest = numbersOnly
        ? 0
        : Math.max(0, ...col.flatMap((t) => t.guests.map((g) => (measure100(g.name, 600) * fs) / 100)));
      return { n, boxH, liH, fs, ss, seatW, chrome, need: chrome + longest };
    });

    // Column widths: proportional to need, never below 60% of an even share.
    const usable = W - gap * (ncols - 1);
    let widths;
    if (numbersOnly) {
      widths = geo.map(() => usable / ncols);
    } else {
      const floorW = (usable / ncols) * 0.6;
      const needs = geo.map((g) => Math.max(floorW, g.need));
      const sum = needs.reduce((x, y) => x + y, 0);
      widths = needs.map((w) => (w * usable) / sum);
    }

    const out = [];
    let x = 0;
    cols.forEach((col, c) => {
      const g = geo[c];
      const boxW = widths[c];
      const avail = boxW - g.chrome;
      col.forEach((t, r) => {
        const seats = [];
        for (let i = 1; i <= t.seats; i++) {
          const guest = t.guests.find((q) => q.seat === i);
          const fit = guest ? fitName(guest.name, { avail, size: g.fs, rowH: g.liH * 0.94 }) : null;
          seats.push({ seat: i, name: guest ? guest.name : "", fit });
        }
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
          seats,
        });
      });
      x += boxW + gap;
    });
    return out;
  }

  const boxes = $derived(place(board, current.rows, width, height - 64));
  const podSide = $derived(board?.podSide || "N. Gallery");
</script>

<div class="board" style={`width: calc(var(--u) * ${width}); height: calc(var(--u) * ${height})`}>
  <div class="front">
    <span>&#9664; Coat check end</span>
    <span>Dinner corridor · podium on the {podSide} side</span>
    <span>Entrance end &#9654;</span>
  </div>
  {#key idx}
    <div class="room" in:fade={{ duration: reduced ? 0 : 700, delay: reduced ? 0 : 250 }} out:fade={{ duration: reduced ? 0 : 450 }}>
      {#each boxes as b (b.t.id)}
        <div
          class="box"
          class:bare={numbersOnly}
          style={`left: calc(var(--u) * ${b.left}); top: calc(var(--u) * ${b.top}); width: calc(var(--u) * ${b.w}); height: calc(var(--u) * ${b.h})`}
        >
          <div class="hd" style={`height: calc(var(--u) * ${b.hdH})`}>
            <span class="n" style={`font-size: calc(var(--u) * ${b.hdSize})`}>Table {b.t.number}</span>
            {#if !numbersOnly}
              <span class="c" style={`font-size: calc(var(--u) * ${Math.max(14, b.hdSize * 0.55)})`}>{b.t.guests.length}/{b.t.seats}</span>
            {/if}
          </div>
          {#if !numbersOnly}
            <ol>
              {#each b.seats as s (s.seat)}
                <li class:open={!s.name} class:two={s.fit?.lines.length > 1} style={`height: calc(var(--u) * ${b.liH})`}>
                  <span class="s" style={`font-size: calc(var(--u) * ${b.ss})`}>{String(s.seat).padStart(2, "0")}</span>
                  {#if s.fit}
                    <span class="nm" title={s.name} style={`font-size: calc(var(--u) * ${s.fit.size}); line-height: ${s.fit.lineHeight}`}>
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
      {/each}
    </div>
  {/key}
  <div class="label">
    {#key idx}<span in:fade={{ duration: reduced ? 0 : 500 }}>{current.label}</span>{/key}
    <span class="dots" aria-hidden="true">
      {#each SEATING_BOARDS as bd, i (bd.id)}<i class:on={i === idx}></i>{/each}
    </span>
  </div>
</div>

<style>
  .board {
    position: relative;
  }
  .front {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: calc(var(--u) * 40);
    border-top: calc(var(--u) * 3) solid rgba(255, 189, 89, 0.75);
    padding-top: calc(var(--u) * 8);
    display: flex;
    justify-content: space-between;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: calc(var(--u) * 19);
    color: var(--g26-gold-soft);
  }
  .room {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(var(--u) * 52);
    bottom: calc(var(--u) * 12);
  }
  .box {
    position: absolute;
    display: flex;
    flex-direction: column;
    background: rgba(5, 7, 12, 0.8);
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
    padding: 0 calc(var(--u) * 12);
    background: linear-gradient(90deg, rgba(255, 189, 89, 0.24), rgba(255, 189, 89, 0.08));
    border-bottom: calc(var(--u) * 2) solid rgba(255, 189, 89, 0.45);
  }
  .bare .hd {
    background: none;
    border: 0;
    justify-content: center;
  }
  .hd .n {
    font-family: var(--g26-serif);
    font-style: italic;
    color: var(--g26-cream);
    line-height: 1;
    white-space: nowrap;
  }
  .hd .c {
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--g26-gold);
    font-variant-numeric: tabular-nums;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: calc(var(--u) * 4) calc(var(--u) * 12);
    overflow: hidden;
    flex: 1;
    min-height: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 10);
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
  .label {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(var(--u) * -44);
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 18);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.24em;
    font-size: calc(var(--u) * 22);
    color: var(--g26-gold);
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
