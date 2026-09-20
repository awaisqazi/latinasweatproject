// Gala Seating: workspace UI state shared between the floor plan, the guest
// list and the sheets. Runes only. Created once by GalaSeatingApp and handed
// down through context.
//
// Drag and drop is Pointer Events end to end (mouse, touch, pen). The HTML5
// drag-and-drop API is not used: it does not exist on touch devices.

import { SEAT_R, SEAT_RING_R, TABLE_R, seatPosition } from "../../lib/galaSeating/model.js";

/**
 * Camera manners.
 *
 * A seat drawn smaller than this is not readable, so locating somebody is
 * allowed to zoom. Anything at or above it is already legible and the camera
 * must not move: a room that jumps under your thumb every time you tap a name
 * is the single most disorienting thing a plan view can do.
 */
const LEGIBLE_SEAT_PX = 24;
/** When a zoom IS warranted, stop here: readable, still most of the room. */
const COMFORTABLE_SEAT_PX = 36;

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
  // Phone list only: the segmented control and the chips from the filter sheet
  // are two separate questions, so they are two separate pieces of state. The
  // desktop sidebar keeps using the single `listFilter`.
  let listSegment = $state(/** @type {"all"|"unseated"|"seated"} */ ("all"));
  let listChips = $state(/** @type {string[]} */ ([]));
  /** Beacon on a located seat: a few expanding rings, then gone. */
  let locate = $state(/** @type {{guestId:string, tableId:string, at:number}|null} */ (null));

  // ---- room view ----------------------------------------------------------
  let view = $state({ x: 0, y: 0, k: 1 });
  let layoutLocked = $state(isTouchDevice);
  let floorEl = null; // plain ref, never read in a template
  /**
   * What is currently sitting on top of the floor: a sheet docked at the
   * bottom on a phone, the details drawer on the right on desktop. The camera
   * aims at the part of the room that is actually visible.
   */
  let viewInsets = $state({ top: 0, right: 0, bottom: 0, left: 0 });
  function setViewInsets(next) {
    const merged = { top: 0, right: 0, bottom: 0, left: 0, ...(next || {}) };
    if (
      merged.top === viewInsets.top &&
      merged.right === viewInsets.right &&
      merged.bottom === viewInsets.bottom &&
      merged.left === viewInsets.left
    ) {
      return;
    }
    viewInsets = merged;
  }

  // ---- drag ---------------------------------------------------------------
  let drag = $state(/** @type {any} */ (null));
  let dropHint = $state("");
  let confirmAsk = $state(/** @type {any} */ (null));

  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  /**
   * The phone shell installs a router so that "open this guest" means "push a
   * guest card onto the navigation stack" instead of "set openGuestId". Every
   * existing caller (the floor plan, the warnings list, a collision toast)
   * keeps calling the same three functions and lands in the right place.
   * On desktop the router stays null and nothing below changes.
   * @type {null | {openGuest?:Function, openTable?:Function, closeSheets?:Function, pickGuest?:Function, revealInList?:Function, showOnMap?:Function}}
   */
  let router = null;
  function setRouter(next) {
    router = next;
  }

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
    if (id) store.setPresence({ guestId: id });
    else store.setPresence(null);
    if (router?.openGuest) {
      router.openGuest(id);
      return;
    }
    openGuestId = id;
    openTableId = null;
  }

  function openTable(id) {
    if (id) store.setPresence({ tableId: id });
    else store.setPresence(null);
    if (router?.openTable) {
      router.openTable(id);
      return;
    }
    openTableId = id;
    openGuestId = null;
  }

  function closeSheets() {
    store.setPresence(null);
    if (router?.closeSheets) {
      router.closeSheets();
      return;
    }
    openGuestId = null;
    openTableId = null;
  }

  let panRaf = 0;

  /**
   * The part of the floor nobody is standing on, in floor-local coordinates
   * (0,0 is the top-left of the floor element, not of the page).
   */
  function clearArea() {
    const r = floorRect();
    const left = viewInsets.left;
    const top = viewInsets.top;
    const width = Math.max(80, r.width - viewInsets.left - viewInsets.right);
    const height = Math.max(80, r.height - viewInsets.top - viewInsets.bottom);
    return { left, top, width, height, cx: left + width / 2, cy: top + height / 2 };
  }

  /** Where a room point currently lands inside the floor element. */
  function roomToFloor(rx, ry) {
    return { x: rx * view.k + view.x, y: ry * view.k + view.y };
  }

  function animateView(targetX, targetY, targetK, animate) {
    if (panRaf) cancelAnimationFrame(panRaf);
    if (!animate || reducedMotion) {
      view.x = targetX;
      view.y = targetY;
      view.k = targetK;
      return;
    }
    const from = { x: view.x, y: view.y, k: view.k };
    const start = performance.now();
    const dur = 350;
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      view.x = from.x + (targetX - from.x) * e;
      view.y = from.y + (targetY - from.y) * e;
      view.k = from.k + (targetK - from.k) * e;
      panRaf = p < 1 ? requestAnimationFrame(step) : 0;
    };
    panRaf = requestAnimationFrame(step);
  }

  function pulse(guestId) {
    if (!guestId) return;
    focusPulse = guestId;
    setTimeout(() => {
      if (focusPulse === guestId) focusPulse = null;
    }, 1800);
  }

  /**
   * Put a room point in the middle of the clear area, optionally at a new zoom.
   * This is the deliberate move, used by "Show on map" and by the warnings
   * list. Nothing else is allowed to call it.
   */
  function centerOn(rx, ry, { pulseGuest = null, zoom = null, animate = true } = {}) {
    const r = floorRect();
    if (!r.width) return;
    const area = clearArea();
    const k = zoom ? Math.max(0.12, Math.min(2.6, zoom)) : view.k;
    pulse(pulseGuest);
    animateView(area.cx - rx * k, area.cy - ry * k, k, animate);
  }

  /**
   * Pan the least amount that brings a room point inside the clear area, and
   * not one pixel more. Zoom is never touched. If the point is already in
   * sight, nothing moves at all: a tap on something you can see should never
   * rearrange the room.
   * @returns {boolean} true when the camera moved
   */
  function nudgeIntoView(rx, ry, { margin = 56, animate = true } = {}) {
    const r = floorRect();
    if (!r.width) return false;
    const area = clearArea();
    const p = roomToFloor(rx, ry);
    const minX = area.left + margin;
    const maxX = area.left + area.width - margin;
    const minY = area.top + margin;
    const maxY = area.top + area.height - margin;
    let dx = 0;
    let dy = 0;
    if (p.x < minX) dx = minX - p.x;
    else if (p.x > maxX) dx = maxX - p.x;
    if (p.y < minY) dy = minY - p.y;
    else if (p.y > maxY) dy = maxY - p.y;
    if (!dx && !dy) return false;
    animateView(view.x + dx, view.y + dy, view.k, animate);
    return true;
  }

  /** Is this room point inside the clear area right now? */
  function isInClearView(rx, ry, margin = 8) {
    const r = floorRect();
    if (!r.width) return false;
    const area = clearArea();
    const p = roomToFloor(rx, ry);
    return (
      p.x >= area.left + margin &&
      p.x <= area.left + area.width - margin &&
      p.y >= area.top + margin &&
      p.y <= area.top + area.height - margin
    );
  }

  /** Select a guest and scroll the list to them (used by collision notices). */
  function revealInList(guestId) {
    selectedGuestId = guestId;
    listFilter = "all";
    listQuery = "";
    listSegment = "all";
    listChips = [];
    if (router?.revealInList) router.revealInList(guestId);
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-guest-row][data-id="${guestId}"]`);
      row?.scrollIntoView?.({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
      row?.focus?.();
    });
  }

  /**
   * Find a guest's seat, with the lightest camera move that does the job.
   *
   *   - already legible and in sight  ->  nothing moves, just the beacon
   *   - legible but hidden or covered ->  the smallest pan that uncovers it
   *   - too small to read             ->  centre it and zoom exactly to
   *                                       readable, never further
   *
   * `reveal: false` is the passive form used when a tap already put the guest
   * on screen: it will nudge a covered seat out from under a sheet but will
   * never zoom.
   */
  function findOnFloor(guestId, { reveal = true } = {}) {
    const plan = store.plan;
    const s = plan.seating[guestId];
    if (!s) return false;
    const t = plan.tables.find((x) => x.id === s.tableId);
    if (!t) return false;

    const seatAt = seatPosition(t, s.seat);
    const seatPx = SEAT_R * 2 * view.k;

    if (seatPx >= LEGIBLE_SEAT_PX || !reveal) {
      // Readable already: at most slide it out from under whatever is docked.
      nudgeIntoView(seatAt.x, seatAt.y, { margin: Math.max(48, SEAT_RING_R * view.k) });
    } else {
      const k = Math.min(2.6, COMFORTABLE_SEAT_PX / (SEAT_R * 2));
      centerOn(t.x, t.y, { zoom: k });
    }

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
    if (router?.pickGuest) {
      // The phone opens the guest card over whatever list they came from and
      // leaves the map alone: jumping the room under a sheet is disorienting.
      store.setPresence({ guestId });
      router.pickGuest(guestId);
      return;
    }
    openGuest(guestId);
    store.setPresence({ guestId });
    // Desktop: opening the drawer can cover the seat, so uncover it. It does
    // not zoom unless the seat is too small to read.
    requestAnimationFrame(() => findOnFloor(guestId));
  }

  /** The reverse: a tap on a seat selects the guest and finds their row. */
  function pickFromFloor(guestId) {
    selectedGuestId = guestId;
    if (router?.openGuest) {
      store.setPresence({ guestId });
      router.openGuest(guestId);
      return;
    }
    revealInList(guestId);
    openGuest(guestId);
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
    get viewInsets() {
      return viewInsets;
    },
    setViewInsets,
    nudgeIntoView,
    isInClearView,
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
    get listSegment() {
      return listSegment;
    },
    set listSegment(v) {
      listSegment = v;
    },
    get listChips() {
      return listChips;
    },
    set listChips(v) {
      listChips = Array.isArray(v) ? v : [];
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
    setRouter,
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
