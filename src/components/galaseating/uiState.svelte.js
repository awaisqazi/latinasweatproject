// Gala Seating: workspace UI state shared between the floor plan, the guest
// list and the sheets. Runes only. Created once by GalaSeatingApp and handed
// down through context.
//
// Drag and drop is Pointer Events end to end (mouse, touch, pen). The HTML5
// drag-and-drop API is not used: it does not exist on touch devices.

import { SEAT_R, SEAT_RING_R, TABLE_R } from "../../lib/galaSeating/model.js";

const isTouchDevice =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window);

export function createUiState(store) {
  // ---- selection and sheets ----------------------------------------------
  let selectedGuestId = $state(/** @type {string|null} */ (null));
  let openGuestId = $state(/** @type {string|null} */ (null));
  let openTableId = $state(/** @type {string|null} */ (null));
  let panel = $state(/** @type {"none"|"warnings"|"help"} */ ("none"));
  let sheetSnap = $state(/** @type {"peek"|"half"|"full"} */ ("half"));
  let focusPulse = $state(/** @type {string|null} */ (null));
  let listFilter = $state("all");
  let listQuery = $state("");
  let listSort = $state("last");
  let listOpen = $state(false);
  let focusSearchTick = $state(0);
  /** Beacon on a located seat: a few expanding rings, then gone. */
  let locate = $state(/** @type {{guestId:string, tableId:string, at:number}|null} */ (null));

  // ---- room view ----------------------------------------------------------
  let view = $state({ x: 0, y: 0, k: 1 });
  let layoutLocked = $state(isTouchDevice);
  let floorEl = null; // plain ref, never read in a template

  // ---- drag ---------------------------------------------------------------
  let drag = $state(/** @type {any} */ (null));
  let dropHint = $state("");
  let confirmAsk = $state(/** @type {any} */ (null));

  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function setFloorEl(el) {
    floorEl = el;
  }

  function floorRect() {
    return floorEl ? floorEl.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };
  }

  function clientToRoom(cx, cy) {
    const r = floorRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  }

  function roomToClient(rx, ry) {
    const r = floorRect();
    return { x: r.left + rx * view.k + view.x, y: r.top + ry * view.k + view.y };
  }

  function isOverFloor(cx, cy) {
    const r = floorRect();
    return cx >= r.left && cx <= r.left + r.width && cy >= r.top && cy <= r.top + r.height;
  }

  /** Nearest table under a room-space point, and the seat if one is close. */
  function hitTest(cx, cy) {
    if (!isOverFloor(cx, cy)) return null;
    const p = clientToRoom(cx, cy);
    const plan = store.plan;
    let best = null;
    for (const t of plan.tables) {
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d > SEAT_RING_R + SEAT_R + 14) continue;
      if (!best || d < best.d) best = { table: t, d };
    }
    if (!best) return null;
    const t = best.table;
    let seat = null;
    if (best.d > TABLE_R - 10) {
      let bestSeat = null;
      for (let i = 0; i < t.seats; i++) {
        const a = -Math.PI / 2 + (i / t.seats) * Math.PI * 2;
        const sx = t.x + Math.cos(a) * SEAT_RING_R;
        const sy = t.y + Math.sin(a) * SEAT_RING_R;
        const d = Math.hypot(sx - p.x, sy - p.y);
        if (d <= SEAT_R + 12 && (!bestSeat || d < bestSeat.d)) bestSeat = { seat: i, d };
      }
      if (bestSeat) seat = bestSeat.seat;
    }
    return { tableId: t.id, seat };
  }

  // ---- drag lifecycle -----------------------------------------------------
  let previewTimer = null;
  let lastPreviewKey = "";

  function startDrag(payload, cx, cy) {
    // Soft lock: if someone else is already holding this guest, say so. We
    // never block the pickup, the last op still wins.
    const holder = payload.guestId ? store.holderOf({ guestId: payload.guestId }) : null;
    drag = {
      ...payload,
      x: cx,
      y: cy,
      over: null,
      level: "ok",
      message: "",
      heldBy: holder ? { editor: holder.editor, color: holder.color } : null,
    };
    dropHint = "";
    store.setDragging(true);
    // Presence goes out at drag START so other planners see the hold early.
    if (payload.guestId) store.setPresence({ guestId: payload.guestId });
    if (isTouchDevice) navigator.vibrate?.(8);
  }

  function moveDrag(cx, cy) {
    if (!drag) return;
    drag.x = cx;
    drag.y = cy;
    const hit = hitTest(cx, cy);
    const sameTable = hit?.tableId === drag.over?.tableId;
    drag.over = hit;
    if (!hit) {
      drag.level = "ok";
      drag.message = "";
      lastPreviewKey = "";
      return;
    }
    if (!sameTable) schedulePreview(hit.tableId);
  }

  function schedulePreview(tableId) {
    const key = `${drag?.guestId || drag?.partyId}:${tableId}`;
    if (key === lastPreviewKey) return;
    lastPreviewKey = key;
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      previewTimer = null;
      if (!drag || drag.over?.tableId !== tableId) return;
      const plan = store.plan;
      const table = plan.tables.find((t) => t.id === tableId);
      const taken = Object.values(plan.seating).filter((s) => s.tableId === tableId).length;
      const need = drag.kind === "party" ? drag.count : 1;
      const alreadyHere = drag.guestId && plan.seating[drag.guestId]?.tableId === tableId;
      if (table && !alreadyHere && taken + need > table.seats) {
        drag.level = drag.kind === "party" ? "warn" : "error";
        drag.message =
          drag.kind === "party"
            ? `Only ${Math.max(table.seats - taken, 0)} of ${need} fit here`
            : "This table is full";
        return;
      }
      const guestId = drag.guestId || null;
      const warns = guestId ? store.previewPlacement(guestId, tableId) : [];
      if (warns.length) {
        const worst = warns.find((w) => w.severity === "error") || warns[0];
        drag.level = worst.severity === "error" ? "error" : "warn";
        drag.message = worst.message;
      } else {
        drag.level = "ok";
        drag.message = "";
      }
    }, 60);
  }

  function endDrag() {
    const d = drag;
    drag = null;
    dropHint = "";
    lastPreviewKey = "";
    if (previewTimer) clearTimeout(previewTimer);
    store.setDragging(false);
    store.setPresence(null);
    return d;
  }

  /**
   * Start a pointer drag from a guest row or from a seated guest on the floor.
   * Mouse and pen: the drag starts after a few pixels of movement, so a click
   * is still a click. Touch: a long press starts it, so the list keeps
   * scrolling normally, and a plain tap runs `onTap`.
   *
   * @param {PointerEvent} event
   * @param {{kind:"guest"|"party", guestId?:string, partyId?:string, label:string, count?:number}} payload
   * @param {{onTap?: () => void}} [opts]
   */
  function beginPointerDrag(event, payload, opts = {}) {
    if (event.button === 2) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const touch = event.pointerType === "touch";
    let started = false;
    let timer = null;

    const begin = (cx, cy) => {
      started = true;
      startDrag(payload, cx, cy);
      moveDrag(cx, cy);
    };

    const onMove = (e) => {
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (!started) {
        if (touch) {
          // The finger is scrolling the list, not picking a guest up.
          if (dist > 12) cleanup();
          return;
        }
        if (dist < 5) return;
        begin(e.clientX, e.clientY);
        return;
      }
      moveDrag(e.clientX, e.clientY);
    };

    const onUp = (e) => {
      const wasStarted = started;
      cleanup();
      if (!wasStarted) {
        opts.onTap?.();
        return;
      }
      const d = endDrag();
      if (!d) return;
      const hit = hitTest(e.clientX, e.clientY);
      if (hit) {
        place(hit, d);
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el?.closest?.("[data-unseat-zone]") || el?.closest?.("[data-guest-list]")) {
        if (d.kind === "guest" && store.plan.seating[d.guestId]) store.unseatGuest(d.guestId);
      }
    };

    const onCancel = () => {
      const wasStarted = started;
      cleanup();
      if (wasStarted) endDrag();
    };

    function cleanup() {
      if (timer) clearTimeout(timer);
      timer = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);

    if (touch) {
      timer = setTimeout(() => {
        timer = null;
        begin(startX, startY);
      }, 250);
    }
  }

  // ---- placement ----------------------------------------------------------
  function ask(question) {
    confirmAsk = question;
  }

  function closeAsk() {
    confirmAsk = null;
  }

  /** Drop or tap-to-place: one entry point for both. */
  function place(target, payload) {
    if (!target) return;
    // A Late Night Access ticket does not include dinner. Seating one is a
    // deliberate act (an upgrade or a comped dinner), so it asks first.
    if (payload.kind === "guest") {
      const guest = store.plan.guests[payload.guestId];
      if (guest && guest.hasDinner === false) {
        ask({
          message: `${guest.name} has Late Night Access, which does not include dinner. Seat anyway?`,
          confirmLabel: "Seat anyway",
          onConfirm: () => {
            confirmAsk = null;
            doPlace(target, payload);
          },
        });
        return;
      }
    }
    doPlace(target, payload);
  }

  function doPlace(target, payload) {
    if (payload.kind === "party") {
      const res = store.seatParty(payload.partyId, target.tableId, { onlyUnseated: true });
      if (res?.missed?.length) {
        store.pushToast({
          kind: "warn",
          message: `${res.missed.length} of the party did not fit, they are still unseated.`,
        });
      } else if (res?.seated) {
        store.pushToast({ kind: "ok", message: `Seated ${res.seated} together.` });
      }
      return;
    }
    const res = store.seatGuest(payload.guestId, target.tableId, target.seat);
    if (res && res.ok === false && res.reason === "full") {
      store.pushToast({ kind: "warn", message: "That table is full." });
    }
  }

  function selectGuest(id) {
    selectedGuestId = id;
  }

  function clearSelection() {
    selectedGuestId = null;
  }

  function openGuest(id) {
    openGuestId = id;
    openTableId = null;
    if (id) store.setPresence({ guestId: id });
    else store.setPresence(null);
  }

  function openTable(id) {
    openTableId = id;
    openGuestId = null;
    if (id) store.setPresence({ tableId: id });
    else store.setPresence(null);
  }

  function closeSheets() {
    openGuestId = null;
    openTableId = null;
    store.setPresence(null);
  }

  let panRaf = 0;

  /**
   * Pan (and optionally zoom) so a room point sits in the clear part of the
   * viewport: the guest list covers the left on desktop, the details drawer the
   * right, and the selected card the bottom on a phone. With reduced motion
   * this jumps instead of gliding.
   */
  function centerOn(rx, ry, { pulseGuest = null, zoom = null, animate = true } = {}) {
    const r = floorRect();
    if (!r.width) return;
    const narrow = typeof window !== "undefined" && window.innerWidth < 1024;
    const padRight = !narrow && (openGuestId || openTableId) ? 400 : 0;
    const padBottom = narrow && selectedGuestId ? 132 : 0;
    const k = zoom ? Math.max(0.25, Math.min(2.6, zoom)) : view.k;
    const targetX = (r.width - padRight) / 2 - rx * k;
    const targetY = (r.height - padBottom) / 2 - ry * k;

    if (pulseGuest) {
      focusPulse = pulseGuest;
      setTimeout(() => {
        if (focusPulse === pulseGuest) focusPulse = null;
      }, 1800);
    }

    if (panRaf) cancelAnimationFrame(panRaf);
    if (!animate || reducedMotion) {
      view.x = targetX;
      view.y = targetY;
      view.k = k;
      return;
    }
    const from = { x: view.x, y: view.y, k: view.k };
    const start = performance.now();
    const dur = 420;
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      view.x = from.x + (targetX - from.x) * e;
      view.y = from.y + (targetY - from.y) * e;
      view.k = from.k + (k - from.k) * e;
      panRaf = p < 1 ? requestAnimationFrame(step) : 0;
    };
    panRaf = requestAnimationFrame(step);
  }

  /** Select a guest and scroll the list to them (used by collision notices). */
  function revealInList(guestId) {
    selectedGuestId = guestId;
    listFilter = "all";
    listQuery = "";
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-guest-row][data-id="${guestId}"]`);
      row?.scrollIntoView?.({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
      row?.focus?.();
    });
  }

  /** Pan to a guest's seat and play the locate beacon on it. */
  function findOnFloor(guestId, { zoom = true } = {}) {
    const plan = store.plan;
    const s = plan.seating[guestId];
    if (!s) return false;
    const t = plan.tables.find((x) => x.id === s.tableId);
    if (!t) return false;
    centerOn(t.x, t.y, { zoom: zoom ? Math.max(view.k, 1.15) : null });
    locate = { guestId, tableId: t.id, at: Date.now() };
    setTimeout(() => {
      if (locate?.guestId === guestId) locate = null;
    }, 1600);
    return true;
  }

  /**
   * One tap on a name does three things at once: select the guest, open their
   * details, and locate their seat on the floor. On a phone the drawer gets out
   * of the way first and the compact card takes over.
   */
  function pickGuest(guestId) {
    selectedGuestId = guestId;
    const narrow = typeof window !== "undefined" && window.innerWidth < 1024;
    if (narrow) {
      listOpen = false;
      openGuestId = null;
      openTableId = null;
    } else {
      openGuest(guestId);
    }
    store.setPresence({ guestId });
    requestAnimationFrame(() => findOnFloor(guestId));
  }

  /** The reverse: a tap on a seat selects the guest and finds their row. */
  function pickFromFloor(guestId) {
    selectedGuestId = guestId;
    revealInList(guestId);
    const narrow = typeof window !== "undefined" && window.innerWidth < 1024;
    if (!narrow) openGuest(guestId);
  }

  function focusSearch() {
    focusSearchTick += 1;
  }

  return {
    get isTouch() {
      return isTouchDevice;
    },
    get selectedGuestId() {
      return selectedGuestId;
    },
    set selectedGuestId(v) {
      selectedGuestId = v;
    },
    get openGuestId() {
      return openGuestId;
    },
    get openTableId() {
      return openTableId;
    },
    get panel() {
      return panel;
    },
    set panel(v) {
      panel = v;
    },
    get sheetSnap() {
      return sheetSnap;
    },
    set sheetSnap(v) {
      sheetSnap = v;
    },
    get view() {
      return view;
    },
    get layoutLocked() {
      return layoutLocked;
    },
    set layoutLocked(v) {
      layoutLocked = v;
    },
    get drag() {
      return drag;
    },
    get dropHint() {
      return dropHint;
    },
    get confirmAsk() {
      return confirmAsk;
    },
    set dropHint(v) {
      dropHint = v;
    },
    get focusPulse() {
      return focusPulse;
    },
    get listFilter() {
      return listFilter;
    },
    set listFilter(v) {
      listFilter = v;
    },
    get listQuery() {
      return listQuery;
    },
    set listQuery(v) {
      listQuery = v;
    },
    get listSort() {
      return listSort;
    },
    set listSort(v) {
      listSort = v;
    },
    get listOpen() {
      return listOpen;
    },
    set listOpen(v) {
      listOpen = v;
      if (v) focusSearchTick += 1;
    },
    get focusSearchTick() {
      return focusSearchTick;
    },
    get locate() {
      return locate;
    },
    get reducedMotion() {
      return reducedMotion;
    },
    setFloorEl,
    floorRect,
    clientToRoom,
    roomToClient,
    isOverFloor,
    hitTest,
    startDrag,
    moveDrag,
    endDrag,
    beginPointerDrag,
    place,
    ask,
    closeAsk,
    selectGuest,
    clearSelection,
    openGuest,
    openTable,
    closeSheets,
    centerOn,
    findOnFloor,
    revealInList,
    pickGuest,
    pickFromFloor,
    focusSearch,
  };
}
