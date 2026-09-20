<!--
  Gala Seating planner: print layouts. Owned by the import/export agent.

  HOW IT MOUNTS. This component portals its own root element to <body> the first
  time it renders, so nobody has to wire it up: ExportMenu already renders
  <PrintView {store} mode={printMode} /> inside itself, and the root escapes to the
  body so the "@media print" rules can hide the rest of the app cleanly. Nothing
  is visible on screen, ever: the root is display:none outside of @media print.

  MODES: "floor" (one landscape page), "tables" (two cards per portrait page),
  "alpha" (three-column check-in list), "kitchen" (entree counts for the caterer).
  Pass mode={null} to render nothing.

  PRIVACY: guest data reaches this component from the in-memory plan only. Nothing
  is fetched, nothing is uploaded, and printing is a local browser action.
-->
<script module>
  import { SEAT_RING_R as RING_R } from "../../lib/galaSeating/model.js";

  /**
   * Where the guest names go on the printed floor plan.
   *
   * A round table with ten names cannot carry them on the seat ring: at this room
   * density (tables 280 room units apart, a name is roughly 110 wide) labels from
   * neighbouring tables land on exactly the same y and collide. So each table gets
   * a name column beside its disc, placed on whichever side has more room INSIDE
   * that table's own slot, where a slot runs to the midpoint of each neighbour in
   * the same horizontal band. Slots never overlap, so columns never collide, and
   * the text is truncated to the width the slot actually offers. Seat numbers are
   * drawn in the seat dots, and the rows are listed in seat order, so a name is
   * always traceable back to its chair.
   *
   * Exported from the module block so a node script can check the geometry.
   */
  export const FLOOR = {
    pad: 110, // the page has margins; the plan may use a little air outside the room
    ring: RING_R + 6,
    gap: 10,
    font: 15,
    charW: 7.8, // ~0.52em, measured against Rubik at this size
    rowH: 26,
    minRowH: 13,
    minCol: 42,
    maxCol: 180,
    bandGap: 150,
  };

  function fitLabel(name, maxChars, seat, withNumber) {
    const prefix = withNumber ? `${seat} ` : "";
    const room = maxChars - prefix.length;
    if (room < 3) return "";
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    const first = parts[0];
    const initial = parts.length > 1 ? ` ${parts[parts.length - 1].charAt(0)}.` : "";
    let body = first + initial;
    if (body.length > room) body = first.length > room ? `${first.slice(0, Math.max(1, room - 1))}…` : first;
    return prefix + body;
  }

  export function floorLayout(entries, room) {
    const width = (room && room.width) || 1800;
    const height = (room && room.height) || 1060;
    const list = [...(entries || [])];

    // Group tables into horizontal bands, then give each table a slot inside its band.
    const byY = [...list].sort((a, b) => a.table.y - b.table.y);
    const bands = [];
    for (const entry of byY) {
      const band = bands[bands.length - 1];
      if (band && Math.abs(entry.table.y - band.y) < FLOOR.bandGap) {
        band.items.push(entry);
        band.y = band.items.reduce((sum, i) => sum + i.table.y, 0) / band.items.length;
      } else {
        bands.push({ y: entry.table.y, items: [entry] });
      }
    }

    const out = [];
    bands.forEach((band, bandIndex) => {
      const above = bands[bandIndex - 1];
      const below = bands[bandIndex + 1];
      const upRoom = above ? (band.y - above.y) / 2 : band.y + FLOOR.pad;
      const downRoom = below ? (below.y - band.y) / 2 : height + FLOOR.pad - band.y;
      const halfSpan = Math.max(40, Math.min(upRoom, downRoom) - 14);

      const items = [...band.items].sort((a, b) => a.table.x - b.table.x);
      items.forEach((entry, i) => {
        const t = entry.table;
        const prev = items[i - 1];
        const next = items[i + 1];
        const slotLeft = prev ? (prev.table.x + t.x) / 2 : -FLOOR.pad;
        const slotRight = next ? (t.x + next.table.x) / 2 : width + FLOOR.pad;
        const freeLeft = t.x - FLOOR.ring - FLOOR.gap - slotLeft;
        const freeRight = slotRight - (t.x + FLOOR.ring + FLOOR.gap);
        const side = freeRight > freeLeft ? "right" : "left";
        const colWidth = Math.min(FLOOR.maxCol, Math.max(0, side === "right" ? freeRight : freeLeft));

        const occupied = entry.seats.filter((s) => s.name);
        const maxChars = Math.floor(colWidth / FLOOR.charW);
        const withNumber = maxChars >= 13;
        const rowH = Math.min(FLOOR.rowH, Math.max(FLOOR.minRowH, occupied.length > 1 ? (halfSpan * 2) / (occupied.length - 1) : FLOOR.rowH));
        const startY = t.y - ((occupied.length - 1) / 2) * rowH;
        const x = side === "right" ? t.x + FLOOR.ring + FLOOR.gap : t.x - FLOOR.ring - FLOOR.gap;

        const rows =
          colWidth < FLOOR.minCol
            ? []
            : occupied
                .map((seat, k) => ({
                  seat: seat.seat,
                  y: startY + k * rowH + FLOOR.font * 0.35,
                  text: fitLabel(seat.name, maxChars, seat.seat, withNumber),
                }))
                .filter((r) => r.text);

        out.push({
          table: t,
          seats: entry.seats,
          seated: occupied.length,
          side,
          anchor: side === "right" ? "start" : "end",
          x,
          colWidth,
          rows,
          box: { x0: side === "right" ? x : x - colWidth, x1: side === "right" ? x + colWidth : x, y0: startY - 12, y1: startY + Math.max(0, occupied.length - 1) * rowH + 8 },
        });
      });
    });
    return out.sort((a, b) => a.table.number - b.table.number);
  }
</script>

<script>
  import {
    MEALS,
    TABLE_R,
    guestsAtTable,
    mealById,
    seatPosition,
    tableLabel,
  } from "../../lib/galaSeating/model.js";
  import { alphaList, mealCounts } from "../../lib/galaSeating/exporters.js";
  import { getContext } from "svelte";

  let { store: storeProp = null, mode = null } = $props();
  let ctxStore = null;
  try {
    ctxStore = (getContext("gala-seating") || {}).store || null;
  } catch {
    ctxStore = null;
  }
  const store = $derived(storeProp || ctxStore);

  const EVENT_LINE = "Annual Gala · Museum of Contemporary Art Chicago · September 25, 2026";
  const NO_MEAL = "No selection";

  let root = $state(null);
  let printedAt = $state(new Date());

  const plan = $derived(store && store.plan ? store.plan : null);
  const active = $derived(!!mode && !!plan);

  /* Portal: hoist the root out of the app so body-level print rules can hide
     everything except this subtree. Safe to call more than once. */
  $effect(() => {
    const el = root;
    if (!el || typeof document === "undefined") return;
    if (el.parentNode !== document.body) document.body.appendChild(el);
    return () => {
      if (el.parentNode) el.remove();
    };
  });

  /* The body class is what @media print keys off. An inactive instance never
     touches it, so a second PrintView mounted elsewhere cannot switch it off. */
  $effect(() => {
    if (typeof document === "undefined" || !active) return;
    document.body.classList.add("gala-printing");
    printedAt = new Date();
    return () => document.body.classList.remove("gala-printing");
  });

  function fmtTime(date) {
    try {
      return date.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return date.toISOString();
    }
  }

  const planName = $derived(plan && plan.meta && plan.meta.name ? plan.meta.name : "Gala seating");
  const stamp = $derived(fmtTime(printedAt));

  /* ---- seat data, straight from the frozen model so seat numbers match the app ---- */

  function seatGrid(table) {
    if (!plan) return [];
    const bySeat = new Map();
    for (const guest of guestsAtTable(plan, table.id)) {
      const spot = plan.seating[guest.id];
      if (spot) bySeat.set(spot.seat, guest);
    }
    const rows = [];
    for (let i = 0; i < table.seats; i++) rows.push({ seat: i + 1, guest: bySeat.get(i) || null });
    return rows;
  }

  const tablesInOrder = $derived(
    plan ? [...plan.tables].sort((a, b) => a.number - b.number) : [],
  );

  const cards = $derived(
    tablesInOrder.map((table) => {
      const rows = seatGrid(table);
      const seated = rows.filter((r) => r.guest);
      const counts = {};
      for (const row of seated) {
        const key = row.guest.meal || "none";
        counts[key] = (counts[key] || 0) + 1;
      }
      return { table, rows, seated: seated.length, counts };
    }),
  );

  function mealShort(id) {
    const meal = mealById(id);
    return meal ? meal.short : NO_MEAL;
  }

  function tagLabel(tags) {
    if (!Array.isArray(tags) || !tags.length) return "";
    const map = { vip: "VIP", accessible: "Accessible", allergy: "Allergy", speaker: "Speaker", staff: "LSP team" };
    return tags.map((t) => map[t] || t).join(", ");
  }

  /* Built in JS, not in the template: Svelte trims the whitespace that sits
     next to an {#if} boundary, which would glue these fragments together. */
  function seatMeta(guest) {
    return [mealShort(guest.meal), tagLabel(guest.tags), guest.partyLabel || ""].filter(Boolean).join(" · ");
  }

  function countsLine(counts) {
    const parts = [];
    for (const meal of MEALS) if (counts[meal.id]) parts.push(`${meal.short} ${counts[meal.id]}`);
    if (counts.none) parts.push(`${NO_MEAL} ${counts.none}`);
    return parts.length ? parts.join(" · ") : "No entrées recorded";
  }

  /* ---- alphabetical list (exporters first, model as the safety net) ---- */

  function lastFirst(name) {
    const clean = String(name || "").trim();
    if (!clean) return "Unnamed guest";
    if (clean.includes(",")) return clean;
    const parts = clean.split(/\s+/);
    if (parts.length < 2) return clean;
    const last = parts.pop();
    return `${last}, ${parts.join(" ")}`;
  }

  function tableText(value) {
    if (value === null || value === undefined || value === "") return "Not seated";
    if (typeof value === "number") return `Table ${value}`;
    const text = String(value);
    return /^table\b/i.test(text) ? text : `Table ${text}`;
  }

  const alphaRows = $derived.by(() => {
    if (!plan) return [];
    let rows = [];
    try {
      rows = alphaList(plan) || [];
    } catch {
      rows = [];
    }
    if (rows.length) {
      // alphaList gives the full table label ("Table 3 · Presenting"); the
      // check-in desk only needs the number, so the columns stay narrow.
      return rows.map((r) => ({
        name: lastFirst(r.name),
        table: r.tableNumber != null ? `Table ${r.tableNumber}` : tableText(r.table),
        meal: r.meal || mealShort(r.meal),
      }));
    }
    // Fallback: everyone in the plan, sorted by the last word of their name.
    return Object.values(plan.guests)
      .map((g) => {
        const spot = plan.seating[g.id];
        const table = spot ? plan.tables.find((t) => t.id === spot.tableId) : null;
        return {
          name: lastFirst(g.name),
          table: table ? `Table ${table.number}` : "Not seated",
          meal: mealShort(g.meal),
          sortKey: lastFirst(g.name).toLowerCase(),
        };
      })
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  });

  /* ---- kitchen counts ---- */

  const kitchen = $derived.by(() => {
    if (!plan) return { columns: [], rows: [], totals: {}, grand: 0, vegetarian: 0, allergies: [] };
    let counts = null;
    try {
      counts = mealCounts(plan);
    } catch {
      counts = null;
    }
    const hasCounts = counts && counts.byTable && Object.keys(counts.byTable).length;

    const columns = MEALS.map((m) => ({ id: m.id, label: m.short, vegetarian: !!m.vegetarian }));
    columns.push({ id: "none", label: NO_MEAL, vegetarian: false });

    const rows = cards
      .map((card) => {
        const source = hasCounts ? counts.byTable[card.table.id] || {} : card.counts;
        const cells = columns.map((c) => source[c.id] || 0);
        const total = cells.reduce((a, b) => a + b, 0);
        return { table: card.table, cells, total };
      })
      .filter((r) => r.total > 0);

    const totals = columns.map((_, i) => rows.reduce((sum, r) => sum + r.cells[i], 0));
    const grand = totals.reduce((a, b) => a + b, 0);
    const vegIndex = columns.findIndex((c) => c.vegetarian);
    const vegetarian = vegIndex >= 0 ? totals[vegIndex] : 0;

    const allergies = [];
    for (const card of cards) {
      for (const row of card.rows) {
        const g = row.guest;
        if (g && Array.isArray(g.tags) && g.tags.includes("allergy")) {
          const note = g.plannerNote || g.seatingNote || "";
          allergies.push({
            table: card.table.number,
            name: g.name,
            detail: [mealShort(g.meal), note].filter(Boolean).join(" · "),
          });
        }
      }
    }
    allergies.sort((a, b) => a.table - b.table);

    return { columns, rows, totals, grand, vegetarian, allergies };
  });

  const seatedCount = $derived(plan ? Object.keys(plan.seating).length : 0);
  const guestCount = $derived(plan ? Object.keys(plan.guests).length : 0);

  /* ---- floor plan geometry ---- */

  const room = $derived(plan && plan.room ? plan.room : { width: 1800, height: 1060 });
  const fixtures = $derived(plan && Array.isArray(plan.fixtures) ? plan.fixtures : []);

  const floorTables = $derived(
    floorLayout(
      tablesInOrder.map((table) => ({
        table,
        seats: seatGrid(table).map((row) => ({
          seat: row.seat,
          name: row.guest ? row.guest.name : "",
          pos: seatPosition(table, row.seat - 1),
        })),
      })),
      room,
    ),
  );
</script>

<div class="gala-print-root print-root" bind:this={root} aria-hidden="true">
  {#if active}
    {#if mode === "floor"}
      <section class="sheet sheet--floor">
        <header class="sheet-head">
          <h1>{planName}</h1>
          <p class="sheet-sub">Floor plan · {tablesInOrder.length} tables · {seatedCount} of {guestCount} guests seated</p>
        </header>
        <svg
          class="floor"
          viewBox="{-FLOOR.pad} {-40} {room.width + FLOOR.pad * 2} {room.height + 80}"
          role="img"
          aria-label="Floor plan"
        >
          <rect x="0" y="0" width={room.width} height={room.height} fill="none" stroke="#bbbbbb" stroke-width="2" />
          {#each fixtures as fixture (fixture.id)}
            <g>
              <rect
                x={fixture.x - fixture.w / 2}
                y={fixture.y - fixture.h / 2}
                width={fixture.w}
                height={fixture.h}
                fill="none"
                stroke="#111111"
                stroke-width="2"
                stroke-dasharray={fixture.type === "dancefloor" ? "14 10" : "0"}
              />
              <text x={fixture.x} y={fixture.y + 8} text-anchor="middle" class="fixture-label">{fixture.label}</text>
            </g>
          {/each}
          {#each floorTables as entry (entry.table.id)}
            <g>
              <circle cx={entry.table.x} cy={entry.table.y} r={TABLE_R} fill="none" stroke="#111111" stroke-width="2.5" />
              <text x={entry.table.x} y={entry.table.y + 2} text-anchor="middle" class="table-number">{entry.table.number}</text>
              <text x={entry.table.x} y={entry.table.y + 30} text-anchor="middle" class="table-name">
                {entry.table.name || `${entry.seated} of ${entry.table.seats}`}
              </text>
              {#each entry.seats as seat (seat.seat)}
                <circle cx={seat.pos.x} cy={seat.pos.y} r="11" fill={seat.name ? "#111111" : "#ffffff"} stroke="#111111" stroke-width="1.5" />
                <text
                  x={seat.pos.x}
                  y={seat.pos.y + 4.5}
                  text-anchor="middle"
                  class="seat-number"
                  fill={seat.name ? "#ffffff" : "#555555"}>{seat.seat}</text>
              {/each}
              {#if entry.rows.length}
                <!-- paper behind the column, so a fixture outline or the room edge
                     never runs through a guest's name -->
                <rect
                  x={entry.box.x0 - 4}
                  y={entry.box.y0 - 2}
                  width={entry.colWidth + 8}
                  height={entry.box.y1 - entry.box.y0 + 4}
                  fill="#ffffff"
                />
              {/if}
              {#each entry.rows as row (row.seat)}
                <text x={entry.x} y={row.y} text-anchor={entry.anchor} class="seat-label">{row.text}</text>
              {/each}
            </g>
          {/each}
        </svg>
      </section>
    {/if}

    {#if mode === "tables"}
      <section class="sheet sheet--tables">
        {#each cards as card (card.table.id)}
          <article class="card">
            <header class="card-head">
              <h2>{tableLabel(card.table)}</h2>
              <span class="card-count">{card.seated} of {card.table.seats} seats</span>
            </header>
            <ol class="seat-list">
              {#each card.rows as row (row.seat)}
                <li class:empty={!row.guest}>
                  <span class="seat-no">{row.seat}</span>
                  {#if row.guest}
                    <span class="seat-name">{row.guest.name}</span>
                    <span class="seat-meta">{seatMeta(row.guest)}</span>
                  {:else}
                    <span class="seat-name blank"></span>
                    <span class="seat-meta"></span>
                  {/if}
                </li>
              {/each}
            </ol>
            <footer class="card-foot">{countsLine(card.counts)}</footer>
          </article>
        {/each}
      </section>
    {/if}

    {#if mode === "alpha"}
      <section class="sheet sheet--alpha">
        <header class="sheet-head">
          <h1>{planName}</h1>
          <p class="sheet-sub">Check-in list, alphabetical by last name · {alphaRows.length} guests · printed {stamp}</p>
        </header>
        <ul class="alpha">
          {#each alphaRows as row, i (row.name + i)}
            <li><span class="alpha-name">{row.name}</span> <span class="alpha-table">· {row.table}</span></li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if mode === "kitchen"}
      <section class="sheet sheet--kitchen">
        <header class="sheet-head">
          <h1>{planName}</h1>
          <p class="sheet-sub">Kitchen counts by table · {kitchen.grand} dinner covers · printed {stamp}</p>
        </header>
        <p class="callout">Vegetarian entrées: {kitchen.vegetarian}</p>
        <table class="counts">
          <thead>
            <tr>
              <th scope="col">Table</th>
              {#each kitchen.columns as col (col.id)}
                <th scope="col">{col.label}</th>
              {/each}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {#each kitchen.rows as row (row.table.id)}
              <tr>
                <th scope="row">{tableLabel(row.table)}</th>
                {#each row.cells as cell, i (i)}
                  <td>{cell || ""}</td>
                {/each}
                <td class="total">{row.total}</td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">All tables</th>
              {#each kitchen.totals as total, i (i)}
                <td class="total">{total}</td>
              {/each}
              <td class="total">{kitchen.grand}</td>
            </tr>
          </tfoot>
        </table>
        <h2 class="section-head">Allergy and dietary notes</h2>
        {#if kitchen.allergies.length}
          <ul class="allergies">
            {#each kitchen.allergies as row, i (row.name + i)}
              <li><strong>Table {row.table}</strong> {`· ${row.name} · ${row.detail}`}</li>
            {/each}
          </ul>
        {:else}
          <p class="muted">No guests are tagged with an allergy or dietary note.</p>
        {/if}
      </section>
    {/if}

    <div class="running-foot">
      <span>{planName}</span>
      <span>{EVENT_LINE}</span>
      <span>Printed {stamp}</span>
    </div>
  {/if}
</div>

<style>
  /* Nothing here is ever visible on screen. */
  .print-root {
    display: none;
  }

  @page {
    size: Letter;
    margin: 0.5in 0.5in 0.72in;
  }
  /* Page numbers where the engine supports margin boxes. Kept in its own block
     so an engine that drops it still keeps the size and margins above. */
  @page {
    @bottom-right {
      content: counter(page) " / " counter(pages);
      font: 8pt Georgia, serif;
      color: #444444;
    }
  }
  @page floorplan {
    size: Letter landscape;
    margin: 0.45in 0.45in 0.7in;
  }

  @media print {
    :global(body.gala-printing) {
      background: #ffffff !important;
    }
    /* Hide the whole app, show only the portalled print root. */
    :global(body.gala-printing > *) {
      display: none !important;
    }
    :global(body.gala-printing > .gala-print-root) {
      display: block !important;
    }

    .print-root {
      color: #111111;
      background: #ffffff;
      font-family: Rubik, "Helvetica Neue", Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.32;
    }

    .sheet--floor {
      page: floorplan;
    }

    .sheet-head {
      border-bottom: 1px solid #111111;
      padding-bottom: 6pt;
      margin-bottom: 10pt;
    }
    h1 {
      font-family: "Playfair Display", Georgia, serif;
      font-style: italic;
      font-size: 17pt;
      font-weight: 600;
      margin: 0;
    }
    .sheet-sub {
      margin: 3pt 0 0;
      font-size: 8.5pt;
      color: #444444;
    }
    .section-head {
      font-family: "Playfair Display", Georgia, serif;
      font-style: italic;
      font-size: 12pt;
      margin: 14pt 0 5pt;
      border-bottom: 1px solid #999999;
      padding-bottom: 3pt;
    }
    .muted {
      color: #555555;
      font-size: 8.5pt;
    }

    /* ---- floor ---- */
    .floor {
      width: 100%;
      height: auto;
    }
    .table-number {
      font-family: "Playfair Display", Georgia, serif;
      font-size: 40px;
      font-weight: 600;
      fill: #111111;
    }
    .table-name {
      font-size: 19px;
      fill: #333333;
    }
    .seat-label {
      font-size: 15px;
      fill: #111111;
    }
    .seat-number {
      font-size: 13px;
      font-weight: 600;
    }
    .fixture-label {
      font-family: "Playfair Display", Georgia, serif;
      font-style: italic;
      font-size: 26px;
      fill: #333333;
      letter-spacing: 1px;
    }

    /* ---- table cards: two per portrait page ---- */
    .card {
      break-inside: avoid;
      page-break-inside: avoid;
      border: 1px solid #111111;
      padding: 10pt 12pt;
      margin-bottom: 12pt;
      min-height: 4.15in;
    }
    .card:nth-of-type(2n) {
      break-after: page;
      page-break-after: always;
      margin-bottom: 0;
    }
    .card:last-of-type {
      break-after: auto;
      page-break-after: auto;
    }
    .card-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      border-bottom: 1px solid #999999;
      padding-bottom: 5pt;
    }
    .card-head h2 {
      font-family: "Playfair Display", Georgia, serif;
      font-style: italic;
      font-size: 15pt;
      font-weight: 600;
      margin: 0;
    }
    .card-count {
      font-size: 8.5pt;
      color: #444444;
    }
    .seat-list {
      list-style: none;
      margin: 7pt 0 0;
      padding: 0;
    }
    .seat-list li {
      display: grid;
      grid-template-columns: 16pt 1.45in 1fr;
      gap: 6pt;
      align-items: baseline;
      padding: 3.2pt 0;
      border-bottom: 1px dotted #bbbbbb;
    }
    .seat-no {
      color: #666666;
      font-size: 8pt;
    }
    .seat-name {
      font-weight: 600;
    }
    .seat-name.blank {
      display: block;
      min-height: 9pt;
    }
    .seat-meta {
      font-size: 8.2pt;
      color: #333333;
    }
    .card-foot {
      margin-top: 7pt;
      font-size: 8.5pt;
      color: #222222;
      border-top: 1px solid #999999;
      padding-top: 5pt;
    }

    /* ---- alphabetical ---- */
    .alpha {
      column-count: 3;
      column-gap: 0.3in;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .alpha li {
      break-inside: avoid;
      padding: 2.4pt 0;
      border-bottom: 1px dotted #cccccc;
      font-size: 9pt;
    }
    .alpha-name {
      font-weight: 600;
    }
    .alpha-table {
      color: #444444;
      white-space: nowrap;
    }

    /* ---- kitchen ---- */
    .callout {
      margin: 0 0 8pt;
      font-size: 10pt;
      border-left: 3px solid #111111;
      padding-left: 7pt;
    }
    .counts {
      width: 100%;
      border-collapse: collapse;
    }
    .counts th,
    .counts td {
      border: 1px solid #999999;
      padding: 4pt 6pt;
      text-align: center;
      font-size: 9pt;
    }
    .counts thead th,
    .counts tbody th,
    .counts tfoot th {
      text-align: left;
      font-weight: 600;
    }
    .counts thead th {
      text-align: center;
      border-bottom: 1.5px solid #111111;
    }
    .counts .total {
      font-weight: 700;
    }
    .counts tfoot td,
    .counts tfoot th {
      border-top: 1.5px solid #111111;
    }
    .allergies {
      margin: 0;
      padding-left: 14pt;
    }
    .allergies li {
      padding: 2.4pt 0;
      font-size: 9pt;
      break-inside: avoid;
    }

    /* ---- repeating footer: sits in the bottom page margin ---- */
    .running-foot {
      position: fixed;
      left: 0;
      right: 0;
      bottom: -0.42in;
      display: flex;
      justify-content: space-between;
      gap: 12pt;
      font-family: Georgia, "Playfair Display", serif;
      font-size: 7.5pt;
      color: #444444;
      border-top: 1px solid #bbbbbb;
      padding-top: 3pt;
    }
  }
</style>
