<!--
  The room: an SVG gallery floor in a pan/zoom viewport.

  Performance rule: nothing that runs on every pointermove is allowed to touch
  plan state. Table and fixture drags move a ghost with a transform written
  straight to the DOM node, and commit a single op on pointerup.

  All pointer handling is Pointer Events, so mouse, touch and pen behave the
  same. The HTML5 drag-and-drop API is deliberately not used.
-->
<script>
  import { getContext, onMount } from "svelte";
  import { ROOM, SEAT_R, TABLE_R } from "../../lib/galaSeating/model.js";
  import TableNode from "./TableNode.svelte";

  const { store, ui } = getContext("gala-seating");

  /**
   * `mobile` swaps the desktop chrome (zoom buttons, the placing banner, the
   * lock hint that used to render underneath the Guests button) for the phone
   * shell's own controls, and changes what a tap means: see SEAT_TAP_PX.
   */
  let { mobile = false, moveGuestId = null, onmovepick = null } = $props();

  const GRID = 10;
  const MIN_K = 0.12;
  const MAX_K = 2.6;
  /**
   * A seat has to be drawn at least this big before a fingertip can pick one
   * out of a ring of ten. Below it, the whole table is the target and a tap
   * opens its roster, where every chair is a full-width row.
   */
  const SEAT_TAP_PX = 32;
  /**
   * A table drawn smaller than this cannot carry its own number and its "7/10"
   * legibly, whatever we do with the type. A portrait phone is too narrow to
   * show all 1800 units of room at that size, so the opening view comes in
   * until the tables can be read and lets the room run off the sides. "Fit" is
   * one tap away; an unreadable room is not.
   */
  const LEGIBLE_TABLE_PX = 34;

  let settled = false;
  let hostEl = $state(null);
  let svgEl = $state(null);
  let hoverSeat = $state(/** @type {{name:string, x:number, y:number}|null} */ (null));
  let guides = $state({ vx: null, hy: null });
  let ghostBad = $state(false);
  let floorMenu = $state(/** @type {{x:number,y:number,at:{x:number,y:number}}|null} */ (null));
  let longPressTimer = null;
  let keyboardSeat = $state(/** @type {{tableId:string, seat:number}|null} */ (null));

  const plan = $derived(store.plan);
  const baseRoom = $derived(plan.room || ROOM);
  /**
   * The drawn floor, which can be larger than plan.room: tables added below or
   * beside the default room still need to be visible. plan.room itself is left
   * alone, it is the model's fixed room size.
   */
  const room = $derived.by(() => {
    let w = baseRoom.width;
    let h = baseRoom.height;
    for (const t of plan.tables) {
      w = Math.max(w, t.x + 190);
      h = Math.max(h, t.y + 190);
    }
    for (const f of plan.fixtures) {
      w = Math.max(w, f.x + f.w / 2 + 60);
      h = Math.max(h, f.y + f.h / 2 + 60);
    }
    return { width: Math.round(w), height: Math.round(h) };
  });
  const view = ui.view;
  const showNames = $derived(view.k >= 1.15);
  /** True once a single seat is big enough to aim a thumb at. */
  const seatsAreTappable = $derived(SEAT_R * 2 * view.k >= SEAT_TAP_PX);
  const inMoveMode = $derived(Boolean(moveGuestId));

  /** guestId -> seat, plus a quick tableId -> [guests] map for the nodes. */
  const seatsByTable = $derived.by(() => {
    const map = {};
    for (const t of plan.tables) map[t.id] = [];
    for (const [gid, s] of Object.entries(plan.seating)) {
      const guest = plan.guests[gid];
      if (!guest || !map[s.tableId]) continue;
      map[s.tableId][s.seat] = guest;
    }
    return map;
  });

  /** Other planners' focus, keyed by table and guest. */
  const focusByTable = $derived.by(() => {
    const map = {};
    for (const p of store.people || []) {
      const f = p.focus;
      if (!f) continue;
      let tableId = f.tableId || null;
      if (!tableId && f.guestId) tableId = plan.seating[f.guestId]?.tableId || null;
      if (!tableId) continue;
      (map[tableId] ||= []).push(p);
    }
    return map;
  });

  const focusByGuest = $derived.by(() => {
    const map = {};
    for (const p of store.people || []) if (p.focus?.guestId) map[p.focus.guestId] = p;
    return map;
  });

  const dragOver = $derived(ui.drag?.over || null);

  // ---------- view helpers -------------------------------------------------
  /**
   * @param {{whole?: boolean}} [opts] `whole: true` is the Fit button: show
   *   every table however small. The opening view instead prefers legibility.
   */
  function fit(opts = {}) {
    const r = ui.floorRect();
    if (!r.width || !r.height) return;
    // Phones get a tighter margin so the whole room fits a 360px-wide screen.
    const pad = r.width < 640 ? 10 : 36;
    const whole = Math.min((r.width - pad * 2) / room.width, (r.height - pad * 2) / room.height);
    let k = Math.max(MIN_K, Math.min(MAX_K, whole));

    if (mobile && !opts.whole && TABLE_R * 2 * k < LEGIBLE_TABLE_PX) {
      // A portrait phone cannot show the whole room AND readable tables. Show
      // readable tables: the room runs off the sides and the planner drags it,
      // which is a normal map gesture, where squinting at a 6px table number
      // is not.
      k = Math.max(k, Math.min(MAX_K, LEGIBLE_TABLE_PX / (TABLE_R * 2)));
    }

    view.k = k;
    view.x = (r.width - room.width * k) / 2;
    // Centred when the room still fits top to bottom, which it usually does on
    // a portrait phone even after coming in. When it does not, anchor the front
    // of the room: the podium is the landmark everything else is read against.
    const fitsVertically = room.height * k <= r.height - pad * 2;
    view.y = fitsVertically ? (r.height - room.height * k) / 2 : pad;
  }

  function zoomBy(factor, cx = null, cy = null) {
    const r = ui.floorRect();
    const ax = cx == null ? r.width / 2 : cx - r.left;
    const ay = cy == null ? r.height / 2 : cy - r.top;
    const next = Math.max(MIN_K, Math.min(MAX_K, view.k * factor));
    const ratio = next / view.k;
    view.x = ax - (ax - view.x) * ratio;
    view.y = ay - (ay - view.y) * ratio;
    view.k = next;
  }

  onMount(() => {
    ui.setFloorEl(hostEl);
    fit();
    const ro = new ResizeObserver(() => {
      if (!settled) fit();
    });
    if (hostEl) ro.observe(hostEl);
    return () => ro.disconnect();
  });

  // ---------- wheel / pinch ------------------------------------------------
  function onWheel(event) {
    event.preventDefault();
    settled = true;
    if (event.ctrlKey || event.metaKey) {
      zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX, event.clientY);
      return;
    }
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && !event.shiftKey) {
      zoomBy(event.deltaY < 0 ? 1.08 : 1 / 1.08, event.clientX, event.clientY);
    } else {
      view.x -= event.deltaX;
      view.y -= event.deltaY;
    }
  }

  // ---------- pointer state ------------------------------------------------
  /** @type {Map<number, {x:number,y:number}>} */
  const pointers = new Map();
  let mode = null; // "pan" | "table" | "fixture" | "resize" | "pinch"
  let moving = null; // { id, kind, startX, startY, ox, oy, w, h, el }
  let panStart = null;
  let pinchStart = null;
  let autoPanRaf = 0;

  function onPointerDown(event) {
    if (event.button === 2) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        k: view.k,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        vx: view.x,
        vy: view.y,
      };
      mode = "pinch";
      return;
    }

    const target = event.target.closest?.("[data-drag]");
    const kind = target?.getAttribute("data-drag");
    settled = true;

    if (kind === "guest" && !inMoveMode) {
      const guestId = target.getAttribute("data-guest");
      const guest = plan.guests[guestId];
      if (guest) {
        pointers.delete(event.pointerId);
        ui.beginPointerDrag(
          event,
          { kind: "guest", guestId, label: guest.name, count: 1 },
          { onTap: () => onSeatActivate(target.getAttribute("data-table"), Number(target.getAttribute("data-seat"))) },
        );
        return;
      }
    }

    if (kind === "table" && !ui.layoutLocked) {
      const id = target.getAttribute("data-id");
      const t = plan.tables.find((x) => x.id === id);
      if (t && !t.locked) {
        startItemDrag(event, { kind: "table", id, x: t.x, y: t.y });
        return;
      }
    }
    if ((kind === "fixture" || kind === "resize") && !ui.layoutLocked) {
      const id = target.getAttribute("data-id");
      const f = plan.fixtures.find((x) => x.id === id);
      if (f) {
        startItemDrag(event, {
          kind: kind === "resize" ? "resize" : "fixture",
          id,
          x: f.x,
          y: f.y,
          w: f.w,
          h: f.h,
        });
        return;
      }
    }

    mode = "pan";
    panStart = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
    try { svgEl?.setPointerCapture?.(event.pointerId); } catch { /* pointer already released: the drag still works without capture */ }

    // A long press on empty floor offers to drop a table right there.
    if (!ui.layoutLocked && !inMoveMode && !hitHere(event.clientX, event.clientY)) {
      const at = ui.clientToRoom(event.clientX, event.clientY);
      const sx = event.clientX;
      const sy = event.clientY;
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (!panStart) return;
        if (Math.hypot(panStart.x - sx, panStart.y - sy) > 6) return;
        openFloorMenu(sx, sy, at);
      }, 480);
    }
  }

  function hitHere(cx, cy) {
    return Boolean(ui.hitTest(cx, cy));
  }

  function openFloorMenu(cx, cy, at) {
    floorMenu = { x: cx, y: cy, at };
    navigator.vibrate?.(8);
  }

  function addTableHere() {
    const at = floorMenu?.at;
    floorMenu = null;
    const id = store.addTable(at || null);
    const t = store.plan.tables.find((x) => x.id === id);
    if (t) ui.centerOn(t.x, t.y);
    store.pushToast({ kind: "ok", message: "Table added. Drag it to fine tune the spot." });
  }

  function onContextMenu(event) {
    if (ui.layoutLocked) return;
    if (hitHere(event.clientX, event.clientY)) return;
    event.preventDefault();
    openFloorMenu(event.clientX, event.clientY, ui.clientToRoom(event.clientX, event.clientY));
  }

  function startItemDrag(event, item) {
    mode = item.kind;
    moving = {
      ...item,
      startX: event.clientX,
      startY: event.clientY,
      el: document.querySelector(`[data-ghost-for="${item.id}"]`),
    };
    guides = { vx: null, hy: null };
    ghostBad = false;
    store.setDragging(true);
    store.setPresence(item.kind === "table" ? { tableId: item.id } : null);
    try { svgEl?.setPointerCapture?.(event.pointerId); } catch { /* pointer already released: the drag still works without capture */ }
  }

  function onPointerMove(event) {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (longPressTimer && panStart && Math.hypot(event.clientX - panStart.x, event.clientY - panStart.y) > 6) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }

    if (mode === "pinch" && pointers.size >= 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const next = Math.max(MIN_K, Math.min(MAX_K, (pinchStart.k * dist) / (pinchStart.dist || 1)));
      const r = ui.floorRect();
      const ax = pinchStart.cx - r.left;
      const ay = pinchStart.cy - r.top;
      const ratio = next / pinchStart.k;
      view.x = ax - (ax - pinchStart.vx) * ratio;
      view.y = ay - (ay - pinchStart.vy) * ratio;
      view.k = next;
      return;
    }

    if (mode === "pan" && panStart) {
      view.x = panStart.vx + (event.clientX - panStart.x);
      view.y = panStart.vy + (event.clientY - panStart.y);
      return;
    }

    if (!moving) return;
    const dx = (event.clientX - moving.startX) / view.k;
    const dy = (event.clientY - moving.startY) / view.k;

    if (mode === "resize") {
      const w = Math.max(60, Math.round((moving.w + dx * 2) / GRID) * GRID);
      const h = Math.max(40, Math.round((moving.h + dy * 2) / GRID) * GRID);
      if (moving.el) {
        moving.el.setAttribute("x", String(moving.x - w / 2));
        moving.el.setAttribute("y", String(moving.y - h / 2));
        moving.el.setAttribute("width", String(w));
        moving.el.setAttribute("height", String(h));
      }
      moving.nextW = w;
      moving.nextH = h;
      return;
    }

    const nx = Math.round((moving.x + dx) / GRID) * GRID;
    const ny = Math.round((moving.y + dy) / GRID) * GRID;
    if (nx === moving.nextX && ny === moving.nextY) return;
    moving.nextX = nx;
    moving.nextY = ny;
    if (moving.el) moving.el.style.transform = `translate(${nx - moving.x}px, ${ny - moving.y}px)`;

    if (mode === "table") {
      let vx = null;
      let hy = null;
      let bad = false;
      for (const t of plan.tables) {
        if (t.id === moving.id) continue;
        if (Math.abs(t.x - nx) <= 6) vx = t.x;
        if (Math.abs(t.y - ny) <= 6) hy = t.y;
        if (Math.hypot(t.x - nx, t.y - ny) < 190) bad = true;
      }
      for (const f of plan.fixtures) {
        if (f.type === "label") continue;
        if (
          nx + 96 > f.x - f.w / 2 &&
          nx - 96 < f.x + f.w / 2 &&
          ny + 96 > f.y - f.h / 2 &&
          ny - 96 < f.y + f.h / 2
        ) {
          bad = true;
        }
      }
      if (guides.vx !== vx || guides.hy !== hy) guides = { vx, hy };
      if (ghostBad !== bad) ghostBad = bad;
    }
  }

  function onPointerUp(event) {
    pointers.delete(event.pointerId);
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    try {
      svgEl?.releasePointerCapture?.(event.pointerId);
    } catch {
      /* already released */
    }

    if (mode === "pinch") {
      if (pointers.size === 0) mode = null;
      pinchStart = null;
      return;
    }

    if (moving) {
      const m = moving;
      moving = null;
      guides = { vx: null, hy: null };
      ghostBad = false;
      if (m.el) {
        m.el.style.transform = "";
        m.el.removeAttribute("width");
        m.el.removeAttribute("height");
      }
      store.setDragging(false);
      store.setPresence(null);
      if (mode === "resize" && m.nextW != null) {
        store.updateFixture(m.id, { w: m.nextW, h: m.nextH });
      } else if (m.nextX != null) {
        if (mode === "table") store.moveTable(m.id, m.nextX, m.nextY);
        else store.moveFixture(m.id, m.nextX, m.nextY);
      }
      mode = null;
      return;
    }

    if (mode === "pan" && panStart) {
      const moved = Math.hypot(event.clientX - panStart.x, event.clientY - panStart.y);
      panStart = null;
      mode = null;
      if (moved < 6) {
        // Activate from pointerup, not from the child's click.
        //
        // Panning takes pointer capture on the <svg>, and a captured pointer
        // sends the follow-up click to the capture target, not to the table
        // disc under the finger. So a tap on a table used to reach nothing at
        // all. Hit testing here is the same test the drop code already uses.
        if (activateAt(event.clientX, event.clientY)) return;
        // A tap on empty floor cancels a pending selection.
        if (ui.selectedGuestId && event.target === svgEl) ui.clearSelection();
      }
      return;
    }
    mode = null;
  }

  // Auto-pan when a guest drag nears the edge of the floor.
  $effect(() => {
    const dragging = Boolean(ui.drag);
    if (!dragging) {
      if (autoPanRaf) cancelAnimationFrame(autoPanRaf);
      autoPanRaf = 0;
      return;
    }
    const step = () => {
      const d = ui.drag;
      if (!d) return;
      const r = ui.floorRect();
      const margin = 56;
      const speed = 11;
      let dx = 0;
      let dy = 0;
      if (d.x > r.left && d.x < r.left + margin) dx = speed;
      else if (d.x < r.left + r.width && d.x > r.left + r.width - margin) dx = -speed;
      if (d.y > r.top && d.y < r.top + margin) dy = speed;
      else if (d.y < r.top + r.height && d.y > r.top + r.height - margin) dy = -speed;
      if (dx || dy) {
        view.x += dx;
        view.y += dy;
        ui.moveDrag(d.x, d.y);
      }
      autoPanRaf = requestAnimationFrame(step);
    };
    autoPanRaf = requestAnimationFrame(step);
    return () => {
      if (autoPanRaf) cancelAnimationFrame(autoPanRaf);
      autoPanRaf = 0;
    };
  });

  // ---------- tap to place / keyboard -------------------------------------
  /** When the last tap was handled from pointerup, so a late click is ignored. */
  let lastActivateAt = 0;

  /** Hit test a tap and open whatever is under it. @returns true if it hit. */
  function activateAt(cx, cy) {
    const hit = ui.hitTest(cx, cy);
    if (!hit) return false;
    lastActivateAt = Date.now();
    if (hit.seat != null) onSeatActivate(hit.tableId, hit.seat);
    else onTableActivate(hit.tableId);
    return true;
  }

  /** Browsers that do deliver the click after a capture must not act twice. */
  function fromClick(fn) {
    if (Date.now() - lastActivateAt < 400) return;
    fn();
  }

  function onSeatActivate(tableId, seat) {
    // Move mode owns every tap on the room while it is running.
    if (inMoveMode) {
      onmovepick?.(tableId, seatsAreTappable ? seat : null);
      return;
    }
    // Zoomed out on a phone, ten seats share the space of one fingertip, so
    // the table takes the tap and hands over a roster of full-width rows.
    if (mobile && !seatsAreTappable) {
      ui.openTable(tableId);
      return;
    }
    // Desktop arms a selected guest for placement on the next tap. A phone
    // must not: the selection is only a highlight there, and a planner who
    // looked someone up half a minute ago will not expect the next tap on the
    // room to move them. Move mode is the phone's explicit version of this.
    const selected = mobile ? null : ui.selectedGuestId;
    const occupant = seatsByTable[tableId]?.[seat] || null;
    if (selected) {
      ui.place({ tableId, seat }, { kind: "guest", guestId: selected });
      ui.clearSelection();
      return;
    }
    if (occupant) ui.pickFromFloor(occupant.id);
    else ui.openTable(tableId);
  }

  function onTableActivate(tableId) {
    if (inMoveMode) {
      onmovepick?.(tableId, null);
      return;
    }
    const selected = mobile ? null : ui.selectedGuestId;
    if (selected) {
      ui.place({ tableId, seat: null }, { kind: "guest", guestId: selected });
      ui.clearSelection();
      return;
    }
    ui.openTable(tableId);
  }

  function onTableKeydown(event, table) {
    const seats = table.seats;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onTableActivate(table.id);
      return;
    }
    if (["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) {
      event.preventDefault();
      const cur = keyboardSeat?.tableId === table.id ? keyboardSeat.seat : -1;
      const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      const next = ((cur + delta) % seats + seats) % seats;
      keyboardSeat = { tableId: table.id, seat: next };
      const el = document.getElementById(`gs-seat-${table.id}-${next}`);
      el?.focus();
    }
  }

  function onSeatKeydown(event, tableId, seat) {
    const occupant = seatsByTable[tableId]?.[seat] || null;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSeatActivate(tableId, seat);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && occupant) {
      event.preventDefault();
      store.unseatGuest(occupant.id);
      return;
    }
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      const table = plan.tables.find((t) => t.id === tableId);
      if (!table) return;
      const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const next = ((seat + delta) % table.seats + table.seats) % table.seats;
      keyboardSeat = { tableId, seat: next };
      document.getElementById(`gs-seat-${tableId}-${next}`)?.focus();
    }
    if (event.key === "Escape") {
      document.getElementById(`gs-table-${tableId}`)?.focus();
    }
  }

  function onSeatHover(info) {
    // A finger has no hover. On a phone the tooltip only ever appeared as a
    // sticky label after a tap, so it does not appear at all.
    if (mobile) return;
    hoverSeat = info;
  }

  /** Free chairs per table, for the move-mode glow. */
  const freeByTable = $derived.by(() => {
    const map = {};
    for (const t of plan.tables) map[t.id] = t.seats;
    for (const s of Object.values(plan.seating)) {
      if (map[s.tableId] != null) map[s.tableId] -= 1;
    }
    return map;
  });

  /** The Fit button: the whole room, every table, however small. */
  export function fitRoom() {
    settled = true;
    fit({ whole: true });
  }

</script>

<div
  class="fp"
  bind:this={hostEl}
  role="application"
  aria-label="Room floor plan"
>
  <svg
    bind:this={svgEl}
    class="fp-svg"
    class:fp-svg--panning={mode === "pan"}
    class:fp-svg--locked={ui.layoutLocked}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onwheel={onWheel}
    oncontextmenu={onContextMenu}
    aria-hidden="false"
  >
    <defs>
      <pattern id="gs-parquet" width="48" height="48" patternUnits="userSpaceOnUse">
        <rect width="48" height="48" fill="none" />
        <rect width="24" height="24" fill="rgba(255,189,89,0.05)" />
        <rect x="24" y="24" width="24" height="24" fill="rgba(255,189,89,0.05)" />
        <path d="M0 0h48v48H0z" fill="none" stroke="rgba(255,189,89,0.08)" stroke-width="0.7" />
      </pattern>
      <radialGradient id="gs-linen" cx="38%" cy="32%" r="72%">
        <stop offset="0%" stop-color="#fffdf8" />
        <stop offset="70%" stop-color="#f6ecdc" />
        <stop offset="100%" stop-color="#e8dac4" />
      </radialGradient>
      <filter id="gs-soft" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#000" flood-opacity="0.45" />
      </filter>
    </defs>

    <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
      <!-- Wall outline and architectural grid -->
      <rect
        class="fp-wall"
        x="0"
        y="0"
        width={room.width}
        height={room.height}
      />
      <g class="fp-grid" aria-hidden="true">
        {#each Array.from({ length: Math.floor(room.width / 120) }, (_, i) => (i + 1) * 120) as gx (gx)}
          <line x1={gx} y1="0" x2={gx} y2={room.height} />
        {/each}
        {#each Array.from({ length: Math.floor(room.height / 120) }, (_, i) => (i + 1) * 120) as gy (gy)}
          <line x1="0" y1={gy} x2={room.width} y2={gy} />
        {/each}
      </g>

      <text class="fp-front" x={room.width / 2} y="34">FRONT</text>

      <!-- Fixtures -->
      {#each plan.fixtures as f (f.id)}
        <g
          class="fp-fixture"
          class:fp-fixture--floor={f.type === "dancefloor"}
          class:fp-fixture--label={f.type === "label"}
          data-drag="fixture"
          data-id={f.id}
        >
          <g data-ghost-for={f.id}>
            {#if f.type === "dancefloor"}
              <rect
                x={f.x - f.w / 2}
                y={f.y - f.h / 2}
                width={f.w}
                height={f.h}
                fill="url(#gs-parquet)"
                stroke="rgba(255,189,89,0.28)"
                stroke-width="1.2"
              />
              <text class="fp-fixlabel" x={f.x} y={f.y + 5}>{f.label}</text>
            {:else if f.type === "label"}
              <text class="fp-freelabel" x={f.x} y={f.y + 6}>{f.label}</text>
            {:else}
              <rect
                class="fp-fixbox"
                x={f.x - f.w / 2}
                y={f.y - f.h / 2}
                width={f.w}
                height={f.h}
                rx="2"
              />
              <text class="fp-fixlabel" x={f.x} y={f.y + 5}>
                {f.type === "podium" ? f.label.toUpperCase() : f.label}
              </text>
              {#if f.type === "podium"}
                <path
                  class="fp-compass"
                  d={`M ${f.x} ${f.y + f.h / 2 + 8} l -7 14 l 7 -4 l 7 4 z`}
                />
              {/if}
            {/if}
          </g>
          {#if !ui.layoutLocked && f.type !== "label"}
            <rect
              class="fp-handle"
              data-drag="resize"
              data-id={f.id}
              x={f.x + f.w / 2 - 9}
              y={f.y + f.h / 2 - 9}
              width="18"
              height="18"
              rx="2"
            />
          {/if}
        </g>
      {/each}

      <!-- Alignment guides while a table is dragged -->
      {#if guides.vx != null}
        <line class="fp-guide" x1={guides.vx} y1="0" x2={guides.vx} y2={room.height} />
      {/if}
      {#if guides.hy != null}
        <line class="fp-guide" x1="0" y1={guides.hy} x2={room.width} y2={guides.hy} />
      {/if}

      <!-- Tables -->
      {#each plan.tables as table (table.id)}
        <TableNode
          {table}
          guests={seatsByTable[table.id] || []}
          bad={store.badTableIds.has(table.id)}
          warnings={store.warnings.byTable?.[table.id] || []}
          byGuest={store.warnings.byGuest || {}}
          dragOver={dragOver?.tableId === table.id ? dragOver : null}
          dragLevel={ui.drag?.level || "ok"}
          dragActive={Boolean(ui.drag) || (inMoveMode && freeByTable[table.id] > 0)}
          {showNames}
          layoutLocked={ui.layoutLocked}
          ghostBad={moving?.id === table.id && ghostBad}
          people={focusByTable[table.id] || []}
          {focusByGuest}
          pulses={store.pulses}
          focusPulse={ui.focusPulse}
          selectedGuestId={ui.selectedGuestId}
          locate={ui.locate}
          dim={(Boolean(ui.locate) && ui.locate.tableId !== table.id) ||
            (inMoveMode && freeByTable[table.id] <= 0)}
          reducedMotion={ui.reducedMotion}
          onseat={(t, s) => fromClick(() => onSeatActivate(t, s))}
          ontable={(t) => fromClick(() => onTableActivate(t))}
          onseatkeydown={onSeatKeydown}
          ontablekeydown={onTableKeydown}
          onhover={onSeatHover}
        />
      {/each}
    </g>
  </svg>

  <!-- Hover / focus tooltip -->
  {#if hoverSeat}
    <div class="fp-tip" style={`left:${hoverSeat.x}px; top:${hoverSeat.y}px;`}>
      {hoverSeat.name}
      {#if hoverSeat.sub}<span class="fp-tipsub">{hoverSeat.sub}</span>{/if}
    </div>
  {/if}

  {#if floorMenu}
    <div class="fp-menu" style={`left:${floorMenu.x}px; top:${floorMenu.y}px;`} role="menu">
      <button type="button" role="menuitem" onclick={addTableHere}>Add a table here</button>
      <button type="button" role="menuitem" onclick={() => { const at = floorMenu.at; floorMenu = null; store.addFixture("bar", { x: Math.round(at.x), y: Math.round(at.y) }); }}>
        Add a bar here
      </button>
      <button type="button" role="menuitem" onclick={() => { const at = floorMenu.at; floorMenu = null; store.addFixture("label", { x: Math.round(at.x), y: Math.round(at.y) }); }}>
        Add a text label here
      </button>
      <button type="button" role="menuitem" onclick={() => (floorMenu = null)}>Cancel</button>
    </div>
  {/if}

  {#if !mobile}
    <!-- Desktop chrome. The phone shell draws its own, above the tab bar, so
         nothing ever lands underneath another control. -->
    <div class="fp-zoom">
      <button type="button" class="gs-btn" onclick={() => zoomBy(1.2)} aria-label="Zoom in">+</button>
      <button type="button" class="gs-btn" onclick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">&minus;</button>
      <button type="button" class="gs-btn" onclick={fit} aria-label="Fit the room to the screen">Fit</button>
    </div>

    {#if ui.selectedGuestId && plan.guests[ui.selectedGuestId]}
      <div class="fp-placing" role="status">
        <span class="fp-placingname">{plan.guests[ui.selectedGuestId].name}</span>
        <span class="gs-dim">selected · tap a seat or a table to place</span>
        <button type="button" class="gs-linkbtn" onclick={() => ui.clearSelection()}>Cancel</button>
      </div>
    {/if}

    {#if ui.layoutLocked}
      <p class="fp-lockhint">Layout locked · guests still drag freely</p>
    {/if}
  {/if}
</div>

<style>
  .fp {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
    background:
      radial-gradient(130% 100% at 50% 0%, rgba(255, 189, 89, 0.05), transparent 55%),
      linear-gradient(180deg, #111a27, #0b1320 60%, #080e18);
  }
  .fp-svg {
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
    touch-action: none;
  }
  .fp-svg--panning {
    cursor: grabbing;
  }
  .fp-wall {
    fill: rgba(255, 255, 255, 0.012);
    stroke: rgba(255, 189, 89, 0.4);
    stroke-width: 1.5;
  }
  .fp-grid line {
    stroke: rgba(228, 201, 138, 0.06);
    stroke-width: 1;
  }
  .fp-front {
    fill: rgba(228, 201, 138, 0.55);
    font-size: 15px;
    letter-spacing: 0.42em;
    text-anchor: middle;
    font-family: Arial, sans-serif;
  }
  .fp-fixbox {
    fill: rgba(255, 248, 239, 0.07);
    stroke: rgba(228, 201, 138, 0.45);
    stroke-width: 1.1;
  }
  .fp-fixlabel {
    fill: rgba(255, 248, 239, 0.72);
    font-size: 15px;
    letter-spacing: 0.2em;
    text-anchor: middle;
    font-family: Arial, sans-serif;
    pointer-events: none;
  }
  .fp-freelabel {
    fill: rgba(255, 248, 239, 0.85);
    font-size: 22px;
    letter-spacing: 0.06em;
    text-anchor: middle;
    font-family: "Playfair Display", Georgia, serif;
    font-style: italic;
    pointer-events: none;
  }
  .fp-compass {
    fill: rgba(255, 189, 89, 0.5);
  }
  .fp-fixture {
    cursor: default;
  }
  .fp-svg:not(.fp-svg--locked) .fp-fixture {
    cursor: move;
  }
  .fp-handle {
    fill: rgba(255, 189, 89, 0.28);
    stroke: rgba(255, 189, 89, 0.8);
    stroke-width: 1;
    cursor: nwse-resize;
  }
  .fp-guide {
    stroke: #ffbd59;
    stroke-width: 1;
    stroke-dasharray: 6 6;
    opacity: 0.85;
  }

  .fp-tip {
    position: fixed;
    transform: translate(-50%, -140%);
    background: var(--gs-cream);
    color: var(--gs-ink);
    padding: 5px 9px;
    font-size: 12px;
    border-radius: 2px;
    box-shadow: 0 10px 26px -12px rgba(0, 0, 0, 0.8);
    pointer-events: none;
    z-index: 25;
    white-space: nowrap;
  }
  .fp-tipsub {
    display: block;
    font-size: 10.5px;
    opacity: 0.7;
  }

  .fp-menu {
    position: fixed;
    z-index: 30;
    min-width: 190px;
    transform: translate(-4px, -4px);
    background: var(--gs-cream);
    color: var(--gs-ink);
    border: 1px solid rgba(23, 32, 44, 0.2);
    box-shadow: 0 24px 60px -28px rgba(0, 0, 0, 0.85);
    padding: 5px;
  }
  .fp-menu button {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 10px;
    font: inherit;
    font-size: 13px;
    color: inherit;
    cursor: pointer;
    border-radius: 2px;
  }
  .fp-menu button:hover {
    background: rgba(255, 189, 89, 0.3);
  }

  .fp-zoom {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 12;
  }
  .fp-zoom :global(.gs-btn) {
    width: 44px;
    min-height: 40px;
    background: rgba(11, 19, 32, 0.9);
  }

  .fp-placing {
    position: absolute;
    left: 50%;
    top: 12px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: calc(100% - 24px);
    padding: 7px 12px;
    background: rgba(255, 189, 89, 0.14);
    border: 1px solid var(--gs-line-strong);
    border-radius: 2px;
    font-size: 12.5px;
    z-index: 14;
    backdrop-filter: blur(4px);
  }
  .fp-placingname {
    font-weight: 700;
    color: var(--gs-cream);
  }
  @media (max-width: 1023px) {
    .fp-placing {
      left: 8px;
      right: 8px;
      top: 8px;
      transform: none;
      max-width: none;
      gap: 6px;
      padding: 6px 10px;
      font-size: 11.5px;
      white-space: nowrap;
      overflow: hidden;
    }
    .fp-placingname {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
  .fp-lockhint {
    position: absolute;
    left: 12px;
    bottom: 12px;
    margin: 0;
    font-size: 11px;
    color: #8f9bab;
    background: rgba(11, 19, 32, 0.75);
    padding: 4px 8px;
    border-radius: 2px;
    pointer-events: none;
  }
</style>
