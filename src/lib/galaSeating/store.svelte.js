// Gala Seating: the reactive store (Svelte 5 runes).
//
// ONE shared plan, many planners. Every edit is an op from ops.js: the store
// applies it optimistically, writes localStorage at once, and flushes the
// queued ops to remote.apply(). `confirmed` is the last server state, `pending`
// is what the server has not acknowledged yet, and the visible plan is
// applyOps(confirmed, pending). There is no conflict dialog: the last op on a
// seat or a field wins, on the client and in Postgres alike.
//
// PRIVACY: guest data lives in this browser and in LSP's passcode-protected
// database. It never goes in a URL and never goes anywhere else.
//
// Call createSeatingStore() during a component's initialisation so the $derived
// values below have an owner (GalaSeatingApp.svelte does exactly that).

import {
  BACKUPS_KEY,
  SCHEMA_VERSION,
  STORAGE_KEY,
  SEATS_PER_TABLE,
  createDefaultPlan,
  defaultFixtures,
  defaultTableSpot,
  defaultTables,
  emptyPrefs,
  firstFreeSeat,
  guestList,
  guestsAtTable,
  occupantOf,
  tableLabel,
  ticketTypeById,
} from "./model.js";
import { applyOps } from "./ops.js";
import { computeWarnings, indexWarnings, previewPlacement } from "./warnings.js";
import { mergeGuestsIntoPlan } from "./importers.js";
import { resolvePreferences } from "./preferences.js";
import { autoSeat } from "./autoseat.js";

const UNDO_LIMIT = 160;
const BACKUP_CAP = 20;
const AUTO_BACKUP_MS = 5 * 60 * 1000;
const COALESCE_MS = 1200;
const FLUSH_MS = 120;
const POLL_MS = 10000;
const PULSE_MS = 1600;
const RECENT_MS = 8000;
const ACTIVITY_CAP = 100;
const PRESENCE_STALE_MS = 15000;
const PRESENCE_BEAT_MS = 5000;

const hasWindow = typeof window !== "undefined";

const nowIso = () => new Date().toISOString();
const uid = (p) => `${p}${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
const clone = (v) => JSON.parse(JSON.stringify(v));

function fixtureBox(f) {
  return { x0: f.x - f.w / 2, x1: f.x + f.w / 2, y0: f.y - f.h / 2, y1: f.y + f.h / 2 };
}

export function createSeatingStore() {
  // ---- core state ---------------------------------------------------------
  // Plain (raw) state: plans are immutable values produced by applyOps.
  let confirmed = $state.raw(createDefaultPlan());
  let pending = $state.raw(/** @type {any[]} */ ([]));
  let version = $state(0);

  const plan = $derived(pending.length ? applyOps(confirmed, pending) : confirmed);

  let savedAt = $state(/** @type {Date|null} */ (null));
  let saveError = $state("");
  let backups = $state(/** @type {any[]} */ ([]));
  let toasts = $state(/** @type {any[]} */ ([]));
  let undoDepth = $state(0);
  let redoDepth = $state(0);
  let loaded = $state(false);
  let people = $state.raw(/** @type {any[]} */ ([]));
  let activity = $state.raw(/** @type {any[]} */ ([]));
  let collisions = $state.raw(/** @type {any[]} */ ([]));
  let pulses = $state.raw(/** @type {Record<string, {color:string, at:number}>} */ ({}));
  let foreignEdit = $state(/** @type {any} */ (null));
  let remote = $state.raw(/** @type {any} */ (null));

  let sync = $state({
    status: /** @type {"locked"|"loading"|"live"|"saving"|"offline"|"error"} */ ("locked"),
    version: 0,
    updatedAt: /** @type {string|null} */ (null),
    updatedBy: "",
    pending: 0,
    error: "",
  });

  // Non-reactive machinery.
  const undoStack = [];
  const redoStack = [];
  let editor = "";
  let localOnly = false;
  let inFlight = false;
  let flushTimer = null;
  let pollTimer = null;
  let pulseTimer = null;
  let retryDelay = 1500;
  let lastAutoBackup = 0;
  let writeId = uid("w");
  let unsubscribe = null;
  let disposed = false;
  let dragging = false;
  let incomingBuffer = [];
  let lastPresence = "";
  let presenceFocus = null;
  let presenceTimer = null;
  let peopleRaw = [];
  const presenceSeen = new Map();

  // ---- derived ------------------------------------------------------------
  const allWarnings = $derived(computeWarnings(plan) || []);
  const visibleWarnings = $derived(allWarnings.filter((w) => !plan.dismissed[w.key]));
  const dismissedWarnings = $derived(allWarnings.filter((w) => plan.dismissed[w.key]));
  const warningIndex = $derived(indexWarnings(visibleWarnings));

  /** Tables that overlap another table or sit on top of a fixture. */
  const badTableIds = $derived.by(() => {
    const bad = new Set();
    const ts = plan.tables;
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        if (Math.hypot(ts[i].x - ts[j].x, ts[i].y - ts[j].y) < 190) {
          bad.add(ts[i].id);
          bad.add(ts[j].id);
        }
      }
    }
    for (const f of plan.fixtures) {
      if (f.type === "label") continue;
      const b = fixtureBox(f);
      for (const t of ts) {
        if (t.x + 96 > b.x0 && t.x - 96 < b.x1 && t.y + 96 > b.y0 && t.y - 96 < b.y1) bad.add(t.id);
      }
    }
    return bad;
  });

  const stats = $derived.by(() => {
    const guests = guestList(plan);
    const dinner = guests.filter((g) => g.hasDinner);
    const seatedIds = Object.keys(plan.seating);
    const seatedSet = new Set(seatedIds);
    const seats = plan.tables.reduce((n, t) => n + t.seats, 0);
    const mealsSeated = {};
    const mealsAll = {};
    for (const g of dinner) {
      const key = g.meal || "none";
      mealsAll[key] = (mealsAll[key] || 0) + 1;
      if (seatedSet.has(g.id)) mealsSeated[key] = (mealsSeated[key] || 0) + 1;
    }
    return {
      guests: guests.length,
      dinnerGuests: dinner.length,
      dinnerSeated: dinner.filter((g) => seatedSet.has(g.id)).length,
      lateNight: guests.length - dinner.length,
      seated: seatedIds.length,
      // Late Night Access tickets have no dinner seat, so they are never
      // "unseated": counting them would look like a planner's backlog.
      unseated: dinner.filter((g) => !seatedSet.has(g.id)).length,
      unseatedAll: guests.length - seatedIds.length,
      seats,
      openSeats: seats - seatedIds.length,
      mealsSeated,
      mealsAll,
      tables: plan.tables.length,
      placeholders: guests.filter((g) => g.placeholder).length,
      unmatched: guests.filter((g) => g.unmatched).length,
    };
  });

  // ---- persistence --------------------------------------------------------
  function writeLocal() {
    if (!hasWindow) return;
    writeId = uid("w");
    const payload = {
      writeId,
      savedAt: nowIso(),
      version,
      editor,
      confirmed,
      pending,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      savedAt = new Date();
      saveError = "";
    } catch {
      try {
        backups = backups.filter((b) => b.pinned);
        writeBackups();
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        savedAt = new Date();
        saveError = "";
      } catch {
        saveError =
          "This browser is not saving a local copy (private mode or storage is full). Your edits still go to the shared plan when you are online.";
      }
    }
  }

  function readLocal() {
    if (!hasWindow) return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeBackups() {
    if (!hasWindow) return;
    try {
      window.localStorage.setItem(BACKUPS_KEY, JSON.stringify(backups));
    } catch {
      const idx = backups.findIndex((b) => !b.pinned);
      if (idx >= 0) {
        backups = backups.filter((_, i) => i !== idx);
        writeBackups();
      }
    }
  }

  function readBackups() {
    if (!hasWindow) return [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(BACKUPS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function backup(label, { pinned = false } = {}) {
    const snap = clone(plan);
    const entry = {
      id: uid("b"),
      at: nowIso(),
      label,
      pinned,
      guestCount: Object.keys(snap.guests).length,
      seatedCount: Object.keys(snap.seating).length,
      plan: snap,
    };
    let autoSeen = 0;
    backups = [entry, ...backups].filter((b) => {
      if (b.pinned) return true;
      autoSeen += 1;
      return autoSeen <= BACKUP_CAP;
    });
    lastAutoBackup = Date.now();
    writeBackups();
    return entry.id;
  }

  function maybeAutoBackup() {
    if (Date.now() - lastAutoBackup < AUTO_BACKUP_MS) return;
    backup("Autosave");
  }

  // ---- op plumbing --------------------------------------------------------
  function warningKeySet() {
    const set = new Set();
    for (const w of visibleWarnings) set.add(w.key);
    return set;
  }

  /**
   * Apply ops locally, remember how to undo them, save, and queue the flush.
   * @param {string} label
   * @param {any[]} ops
   * @param {any[]} inverse   ops that put the plan back the way it was
   * @param {{coalesce?: string|null, notify?: boolean, undoable?: boolean}} [opts]
   */
  function commit(label, ops, inverse, opts = {}) {
    if (!ops || !ops.length) return false;
    const before = opts.notify ? warningKeySet() : null;

    if (opts.undoable !== false) pushUndo({ label, ops, inverse, coalesce: opts.coalesce || null });
    const source = plan;
    noteLocalOps(source, ops, label);
    const said = describeOps(ops, "You");
    applyLocal(ops);
    logActivity({ mine: true, editor: editor || "You", color: "#FFBD59", text: said, focus: focusOf(ops) });
    writeLocal();
    maybeAutoBackup();
    if (before) notifyNewWarnings(before);
    return true;
  }

  function applyLocal(ops) {
    if (remote && !localOnly) {
      pending = [...pending, ...ops];
      sync.pending = pending.length;
      scheduleFlush();
    } else {
      confirmed = applyOps(confirmed, ops);
    }
  }

  function pushUndo(entry) {
    const last = undoStack[undoStack.length - 1];
    if (entry.coalesce && last && last.coalesce === entry.coalesce && Date.now() - last.at < COALESCE_MS) {
      last.ops = entry.ops;
      last.at = Date.now();
      return;
    }
    undoStack.push({ ...entry, at: Date.now() });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
    undoDepth = undoStack.length;
    redoDepth = 0;
  }

  function notifyNewWarnings(beforeKeys) {
    const fresh = visibleWarnings.filter((w) => !beforeKeys.has(w.key));
    if (!fresh.length) return;
    const worst = fresh.find((w) => w.severity === "error") || fresh[0];
    pushToast({
      kind: worst.severity === "error" ? "error" : "warn",
      message: worst.message,
      detail: fresh.length > 1 ? `and ${fresh.length - 1} more` : "",
      action: { label: "Undo", run: () => undo() },
    });
  }

  function undo() {
    const entry = undoStack.pop();
    if (!entry) return;
    redoStack.push(entry);
    undoDepth = undoStack.length;
    redoDepth = redoStack.length;
    applyLocal(entry.inverse);
    writeLocal();
  }

  function redo() {
    const entry = redoStack.pop();
    if (!entry) return;
    undoStack.push(entry);
    undoDepth = undoStack.length;
    redoDepth = redoStack.length;
    applyLocal(entry.ops);
    writeLocal();
  }

  // ---- toasts -------------------------------------------------------------
  function pushToast(t) {
    const entry = { id: uid("t"), kind: "info", ...t };
    toasts = [...toasts, entry];
    if (hasWindow) window.setTimeout(() => dismissToast(entry.id), entry.action ? 9000 : 5000);
    return entry.id;
  }

  function dismissToast(id) {
    toasts = toasts.filter((t) => t.id !== id);
  }

  // ---- collisions, activity feed, soft locks ------------------------------
  // Last op wins, exactly as ops.js says. What changes here is that BOTH
  // planners find out when their edits landed on the same thing.

  /** key -> { at, desc }: what this client touched in the last few seconds. */
  const recentLocal = new Map();

  function opKeys(source, op) {
    switch (op.op) {
      case "seat":
        return [`guest:${op.g}`, `seat:${op.t}:${op.s}`];
      case "unseat":
        return [`guest:${op.g}`];
      case "guest_patch":
      case "guest_del":
        return [`guest:${op.g}`];
      case "guest_put":
        return [`guest:${op.guest?.id}`];
      case "item_patch":
      case "item_del":
        return [`item:${op.coll}:${op.id}`];
      case "item_put":
        return [`item:${op.coll}:${op.item?.id}`];
      case "clear_seats": {
        const out = [];
        for (const [gid, s] of Object.entries(source.seating || {})) {
          if (!op.t || s.tableId === op.t) out.push(`guest:${gid}`);
        }
        return out;
      }
      case "replace":
        return ["*"];
      default:
        return [];
    }
  }

  function batchKeys(source, ops) {
    const keys = new Set();
    for (const op of ops || []) for (const k of opKeys(source, op)) keys.add(k);
    return keys;
  }

  function noteLocalOps(source, ops, desc) {
    const at = Date.now();
    for (const k of batchKeys(source, ops)) recentLocal.set(k, { at, desc });
    if (recentLocal.size > 400) {
      for (const [k, v] of recentLocal) if (at - v.at > RECENT_MS) recentLocal.delete(k);
    }
  }

  /** Keys this client owns right now: anything unsent, plus the last 8 seconds. */
  function localKeyHits(keys) {
    const cutoff = Date.now() - RECENT_MS;
    const hits = [];
    for (const k of keys) {
      const entry = recentLocal.get(k);
      if (entry && entry.at >= cutoff) hits.push({ key: k, ...entry });
    }
    const pendingKeys = batchKeys(confirmed, pending);
    for (const k of keys) {
      if (pendingKeys.has(k) && !hits.some((h) => h.key === k)) hits.push({ key: k, at: Date.now(), desc: "your change" });
    }
    return hits;
  }

  function guestName(id) {
    return plan.guests[id]?.name || "a guest";
  }

  function tableName(id) {
    const t = plan.tables.find((x) => x.id === id);
    return t ? tableLabel(t) : "a table";
  }

  /** One plain sentence describing what a batch of ops did. */
  function describeOps(ops, who) {
    const list = ops || [];
    if (!list.length) return `${who} made a change`;
    if (list.some((o) => o.op === "replace")) return `${who} replaced the whole plan`;

    const seats = list.filter((o) => o.op === "seat");
    const unseats = list.filter((o) => o.op === "unseat");
    const clears = list.filter((o) => o.op === "clear_seats");
    const itemPatches = list.filter((o) => o.op === "item_patch");
    const guestPatches = list.filter((o) => o.op === "guest_patch");

    if (clears.length) {
      const c = clears[0];
      return c.t ? `${who} cleared ${tableName(c.t)}` : `${who} cleared every seat`;
    }
    if (seats.length === 1 && !unseats.length) {
      const s = seats[0];
      return `${who} seated ${guestName(s.g)} at ${tableName(s.t)}, seat ${Number(s.s) + 1}`;
    }
    if (seats.length > 1) return `${who} seated ${seats.length} guests`;
    if (unseats.length === 1) return `${who} unseated ${guestName(unseats[0].g)}`;
    if (unseats.length > 1) return `${who} unseated ${unseats.length} guests`;
    if (itemPatches.length) {
      const p = itemPatches[0];
      const moved = p.patch && ("x" in p.patch || "y" in p.patch);
      if (p.coll === "tables") return `${who} ${moved ? "moved" : "edited"} ${tableName(p.id)}`;
      const f = plan.fixtures.find((x) => x.id === p.id);
      return `${who} ${moved ? "moved" : "edited"} the ${f?.label || "room fixture"}`;
    }
    if (guestPatches.length === 1) {
      const p = guestPatches[0];
      if (p.patch && "meal" in p.patch) return `${who} updated the entrée for ${guestName(p.g)}`;
      return `${who} updated ${guestName(p.g)}`;
    }
    if (guestPatches.length > 1) return `${who} updated ${guestPatches.length} guests`;
    if (list.some((o) => o.op === "guest_del")) return `${who} removed a guest`;
    if (list.some((o) => o.op === "guest_put")) return `${who} updated the guest list`;
    if (list.some((o) => o.op === "item_put" || o.op === "item_del")) return `${who} changed the room`;
    if (list.some((o) => o.op === "dismiss")) return `${who} dismissed a warning`;
    if (list.some((o) => o.op === "meta_patch")) return `${who} renamed the plan`;
    return `${who} made a change`;
  }

  function logActivity(entry) {
    if (localOnly && !entry.mine) return;
    activity = [{ id: uid("a"), at: entry.at || nowIso(), ...entry }, ...activity].slice(0, ACTIVITY_CAP);
  }

  function pushCollision(notice) {
    if (localOnly) return;
    const entry = { id: uid("x"), at: Date.now(), ...notice };
    collisions = [entry, ...collisions].slice(0, 3);
    if (hasWindow) window.setTimeout(() => dismissCollision(entry.id), 12000);
  }

  function dismissCollision(id) {
    collisions = collisions.filter((c) => c.id !== id);
  }

  function colorOf(client) {
    return people.find((p) => p.client === client)?.color || "#FFBD59";
  }

  function editorOf(batch) {
    return batch?.editor || "Another planner";
  }

  /**
   * Compare a batch from someone else against what this client just did.
   * `mode` is "lost" when their batch landed after ours, "won" when ours did.
   */
  function reportCollision(batch, mode) {
    if (localOnly) return false;
    const ops = batch?.ops || [];
    const keys = batchKeys(plan, ops);
    const hits = localKeyHits(keys);
    if (!hits.length) return false;

    const who = editorOf(batch);
    const color = colorOf(batch.client);

    // Seat collision: a guest of ours was evicted from the seat we gave them.
    for (const op of ops) {
      if (op.op !== "seat") continue;
      const occupant = occupantOf(plan, op.t, Number(op.s));
      if (!occupant || occupant.id === op.g) continue;
      if (!localKeyHits([`guest:${occupant.id}`]).length) continue;
      const table = plan.tables.find((t) => t.id === op.t);
      const stillFree = table ? firstFreeSeat(plan, op.t) : -1;
      const first = occupant.name.split(/\s+/)[0] || occupant.name;
      pushCollision({
        kind: "evicted",
        color,
        message: `${who} placed ${guestName(op.g)} in the seat you gave ${occupant.name}. ${first} is back in the unseated list.`,
        actions: [
          { label: `Find ${first}`, kind: "find", guestId: occupant.id },
          ...(stillFree >= 0 && table
            ? [{ label: `Seat at ${tableLabel(table)}`, kind: "seat", guestId: occupant.id, tableId: op.t }]
            : []),
        ],
        pulse: { guestId: occupant.id, color },
      });
      return true;
    }

    const what = describeOps(ops, who);
    const guestOp = ops.find((o) => o.op === "seat" || o.op === "unseat" || o.op === "guest_patch");
    const itemOp = ops.find((o) => o.op === "item_patch");
    const subject = guestOp ? guestName(guestOp.g) : itemOp?.coll === "tables" ? tableName(itemOp.id) : "the same thing";
    const verb = guestOp?.op === "guest_patch" ? "editing" : "moving";

    if (mode === "lost") {
      const where = guestOp && plan.seating[guestOp.g]
        ? ` ${guestName(guestOp.g)} is now at ${tableName(plan.seating[guestOp.g].tableId)}.`
        : "";
      pushCollision({
        kind: "lost",
        color,
        message: `${who} was ${verb} ${subject} at the same moment, and their change landed last.${where} If that is not what you expected, do it again.`,
        detail: what,
        pulse: guestOp ? { guestId: guestOp.g, color } : itemOp ? { tableId: itemOp.id, color } : null,
      });
    } else {
      pushCollision({
        kind: "won",
        color,
        message: `${who} was ${verb} ${subject} at the same moment. Your change was saved last. If it does not look right, check it and try again.`,
        detail: what,
        pulse: guestOp ? { guestId: guestOp.g, color } : itemOp ? { tableId: itemOp.id, color } : null,
      });
    }
    return true;
  }

  // ---- inverse helpers ----------------------------------------------------
  function seatOpFor(guestId) {
    const s = plan.seating[guestId];
    return s ? { op: "seat", g: guestId, t: s.tableId, s: s.seat } : { op: "unseat", g: guestId };
  }

  function patchInverse(before, patch) {
    const out = {};
    for (const k of Object.keys(patch)) out[k] = before ? before[k] : undefined;
    return out;
  }

  // ---- seating actions ----------------------------------------------------
  /**
   * @returns {{ok:boolean, seat?:number, reason?:string}}
   */
  function seatGuest(guestId, tableId, seat = null, opts = {}) {
    const guest = plan.guests[guestId];
    const table = plan.tables.find((t) => t.id === tableId);
    if (!guest || !table) return { ok: false, reason: "missing" };

    let target = seat;
    if (target == null || target < 0 || target >= table.seats) {
      target = firstFreeSeat(plan, tableId);
      if (target < 0) return { ok: false, reason: "full" };
    }
    const current = plan.seating[guestId] || null;
    if (current && current.tableId === tableId && current.seat === target) return { ok: true, seat: target };

    const occupant = occupantOf(plan, tableId, target);
    const ops = [];
    const inverse = [];

    if (occupant && occupant.id !== guestId) {
      if (current) {
        // Straight swap: the occupant takes the seat this guest is leaving.
        ops.push({ op: "seat", g: guestId, t: tableId, s: target });
        ops.push({ op: "seat", g: occupant.id, t: current.tableId, s: current.seat });
        inverse.push(seatOpFor(occupant.id), seatOpFor(guestId));
      } else {
        const spare = firstFreeSeat(plan, tableId);
        if (spare >= 0) {
          target = spare;
          ops.push({ op: "seat", g: guestId, t: tableId, s: target });
          inverse.push(seatOpFor(guestId));
        } else {
          // Seat op evicts the occupant by definition.
          ops.push({ op: "seat", g: guestId, t: tableId, s: target });
          inverse.push(seatOpFor(occupant.id), seatOpFor(guestId));
          pushToast({
            kind: "warn",
            message: `${occupant.name} was unseated to make room at ${tableLabel(table)}.`,
            action: { label: "Undo", run: () => undo() },
          });
        }
      }
    } else {
      ops.push({ op: "seat", g: guestId, t: tableId, s: target });
      inverse.push(seatOpFor(guestId));
    }

    commit(`Seat ${guest.name}`, ops, inverse, { notify: opts.notify !== false });
    return { ok: true, seat: target };
  }

  function unseatGuest(guestId) {
    if (!plan.seating[guestId]) return;
    const guest = plan.guests[guestId];
    commit(`Unseat ${guest?.name || "guest"}`, [{ op: "unseat", g: guestId }], [seatOpFor(guestId)]);
  }

  function seatParty(partyId, tableId, opts = {}) {
    const table = plan.tables.find((t) => t.id === tableId);
    if (!table) return { seated: 0, missed: [] };
    const members = guestList(plan)
      .filter((g) => g.partyId === partyId)
      .filter((g) => (opts.onlyUnseated === false ? true : !plan.seating[g.id]));
    if (!members.length) return { seated: 0, missed: [] };

    const taken = new Set(
      Object.values(plan.seating)
        .filter((s) => s.tableId === tableId)
        .map((s) => s.seat),
    );
    const ops = [];
    const inverse = [];
    const missed = [];
    for (const g of members) {
      let free = -1;
      for (let i = 0; i < table.seats; i++) {
        if (!taken.has(i)) {
          free = i;
          break;
        }
      }
      if (free < 0) {
        missed.push(g);
        continue;
      }
      taken.add(free);
      ops.push({ op: "seat", g: g.id, t: tableId, s: free });
      inverse.push(seatOpFor(g.id));
    }
    if (!ops.length) return { seated: 0, missed };
    commit(`Seat party at ${tableLabel(table)}`, ops, inverse.reverse(), { notify: true });
    return { seated: ops.length, missed };
  }

  function clearTable(tableId) {
    const seated = guestsAtTable(plan, tableId);
    if (!seated.length) return;
    const table = plan.tables.find((t) => t.id === tableId);
    commit(
      `Clear ${table ? tableLabel(table) : "table"}`,
      [{ op: "clear_seats", t: tableId }],
      seated.map((g) => seatOpFor(g.id)),
    );
  }

  function clearAllSeats() {
    const seated = Object.keys(plan.seating);
    if (!seated.length) return;
    backup("Before clearing every seat");
    commit(
      "Clear every seat",
      [{ op: "clear_seats" }],
      seated.map((id) => seatOpFor(id)),
    );
  }

  function setSeatOrder(tableId, guestIds) {
    const ops = [];
    const inverse = [];
    guestIds.forEach((id, i) => {
      if (!plan.guests[id]) return;
      const s = plan.seating[id];
      if (s && s.tableId === tableId && s.seat === i) return;
      ops.push({ op: "seat", g: id, t: tableId, s: i });
      inverse.push(seatOpFor(id));
    });
    if (!ops.length) return;
    commit("Reorder seats", ops, inverse.reverse());
  }

  // ---- room actions -------------------------------------------------------
  function moveTable(id, x, y) {
    const t = plan.tables.find((tb) => tb.id === id);
    if (!t || t.locked) return;
    const nx = Math.round(x);
    const ny = Math.round(y);
    if (t.x === nx && t.y === ny) return;
    commit(
      "Move table",
      [{ op: "item_patch", coll: "tables", id, patch: { x: nx, y: ny } }],
      [{ op: "item_patch", coll: "tables", id, patch: { x: t.x, y: t.y } }],
    );
  }

  function updateTable(id, patch) {
    const t = plan.tables.find((tb) => tb.id === id);
    if (!t) return;
    commit(
      "Edit table",
      [{ op: "item_patch", coll: "tables", id, patch }],
      [{ op: "item_patch", coll: "tables", id, patch: patchInverse(t, patch) }],
      { coalesce: patch.name != null || patch.note != null ? `table-text:${id}` : null },
    );
  }

  /** Is this spot clear of every table and fixture? */
  function spotIsFree(x, y, exceptId = null) {
    for (const t of plan.tables) {
      if (t.id === exceptId) continue;
      if (Math.hypot(t.x - x, t.y - y) < 200) return false;
    }
    for (const f of plan.fixtures) {
      if (f.type === "label") continue;
      if (x + 100 > f.x - f.w / 2 && x - 100 < f.x + f.w / 2 && y + 100 > f.y - f.h / 2 && y - 100 < f.y + f.h / 2) {
        return false;
      }
    }
    return true;
  }

  /** The default spot for the next table, or the nearest clear one to it. */
  function freeSpotNear(x, y) {
    if (spotIsFree(x, y)) return [x, y];
    for (let ring = 1; ring <= 8; ring++) {
      for (let a = 0; a < 12; a++) {
        const angle = (a / 12) * Math.PI * 2;
        const nx = Math.round((x + Math.cos(angle) * ring * 110) / 10) * 10;
        const ny = Math.round((y + Math.sin(angle) * ring * 110) / 10) * 10;
        if (nx < 120 || ny < 120) continue;
        if (spotIsFree(nx, ny)) return [nx, ny];
      }
    }
    return [x, y];
  }

  /**
   * Add a table. With no position it lands on the next default spot from the
   * model (or the nearest clear one); with a position it lands where the
   * planner pressed.
   */
  function addTable(at = null) {
    const number = plan.tables.reduce((n, t) => Math.max(n, t.number), 0) + 1;
    const id = uid("t");
    const base = at ? [Math.round(at.x / 10) * 10, Math.round(at.y / 10) * 10] : defaultTableSpot(plan.tables.length);
    const [x, y] = freeSpotNear(base[0], base[1]);
    const item = { id, number, name: "", x, y, seats: SEATS_PER_TABLE, locked: false, note: "" };
    commit("Add table", [{ op: "item_put", coll: "tables", item }], [{ op: "item_del", coll: "tables", id }]);
    return id;
  }

  /**
   * Change how many seats a table has. Shrinking past the people already there
   * unseats the highest seat numbers; the caller confirms first.
   */
  function setTableSeats(id, seats) {
    const t = plan.tables.find((x) => x.id === id);
    if (!t) return { ok: false };
    const next = Math.max(6, Math.min(12, Math.round(Number(seats) || 0)));
    if (next === t.seats) return { ok: true, unseated: [] };
    const displaced = guestsAtTable(plan, id).filter((g) => plan.seating[g.id].seat >= next);
    const ops = [{ op: "item_patch", coll: "tables", id, patch: { seats: next } }];
    const inverse = [{ op: "item_patch", coll: "tables", id, patch: { seats: t.seats } }];
    for (const g of displaced) {
      ops.unshift({ op: "unseat", g: g.id });
      inverse.push(seatOpFor(g.id));
    }
    commit("Change seat count", ops, inverse.reverse(), { notify: true });
    return { ok: true, unseated: displaced };
  }

  /** Give a table another table's number, and that table this one's. */
  function swapTableNumbers(idA, idB) {
    const a = plan.tables.find((t) => t.id === idA);
    const b = plan.tables.find((t) => t.id === idB);
    if (!a || !b || a.id === b.id) return false;
    commit(
      "Renumber table",
      [
        { op: "item_patch", coll: "tables", id: a.id, patch: { number: b.number } },
        { op: "item_patch", coll: "tables", id: b.id, patch: { number: a.number } },
      ],
      [
        { op: "item_patch", coll: "tables", id: a.id, patch: { number: a.number } },
        { op: "item_patch", coll: "tables", id: b.id, patch: { number: b.number } },
      ],
    );
    return true;
  }

  /** Renumber every table front to back, left to right, after a rearrange. */
  function renumberByPosition() {
    const ordered = [...plan.tables].sort((p, q) => {
      const rowP = Math.round(p.y / 160);
      const rowQ = Math.round(q.y / 160);
      return rowP - rowQ || p.x - q.x;
    });
    const ops = [];
    const inverse = [];
    ordered.forEach((t, i) => {
      if (t.number === i + 1) return;
      ops.push({ op: "item_patch", coll: "tables", id: t.id, patch: { number: i + 1 } });
      inverse.push({ op: "item_patch", coll: "tables", id: t.id, patch: { number: t.number } });
    });
    if (!ops.length) {
      pushToast({ kind: "info", message: "The numbers already run front to back." });
      return 0;
    }
    commit("Renumber by position", ops, inverse);
    pushToast({ kind: "ok", message: `Renumbered ${ops.length} tables front to back.`, action: { label: "Undo", run: () => undo() } });
    return ops.length;
  }

  /** Remove a table. Anyone sitting at it goes back to the unseated list. */
  function removeTable(id) {
    const t = plan.tables.find((tb) => tb.id === id);
    if (!t) return false;
    const seated = guestsAtTable(plan, id);
    const inverse = [{ op: "item_put", coll: "tables", item: clone(t) }, ...seated.map((g) => seatOpFor(g.id))];
    commit("Remove table", [{ op: "item_del", coll: "tables", id }], inverse);
    if (seated.length) {
      pushToast({
        kind: "warn",
        message: `${seated.length} ${seated.length === 1 ? "guest is" : "guests are"} back in the unseated list.`,
        action: { label: "Undo", run: () => undo() },
      });
    }
    return true;
  }

  function resetLayout() {
    const fresh = defaultTables(Math.max(plan.tables.length, 1));
    const ops = [];
    const inverse = [];
    plan.tables.forEach((t, i) => {
      const spot = fresh[i];
      if (!spot || (t.x === spot.x && t.y === spot.y)) return;
      ops.push({ op: "item_patch", coll: "tables", id: t.id, patch: { x: spot.x, y: spot.y } });
      inverse.push({ op: "item_patch", coll: "tables", id: t.id, patch: { x: t.x, y: t.y } });
    });
    for (const def of defaultFixtures()) {
      const cur = plan.fixtures.find((f) => f.id === def.id);
      if (!cur) {
        ops.push({ op: "item_put", coll: "fixtures", item: def });
        inverse.push({ op: "item_del", coll: "fixtures", id: def.id });
      } else if (cur.x !== def.x || cur.y !== def.y || cur.w !== def.w || cur.h !== def.h) {
        ops.push({ op: "item_patch", coll: "fixtures", id: def.id, patch: { x: def.x, y: def.y, w: def.w, h: def.h } });
        inverse.push({
          op: "item_patch",
          coll: "fixtures",
          id: def.id,
          patch: { x: cur.x, y: cur.y, w: cur.w, h: cur.h },
        });
      }
    }
    if (!ops.length) return;
    commit("Reset layout", ops, inverse);
  }

  function moveFixture(id, x, y) {
    const f = plan.fixtures.find((fx) => fx.id === id);
    if (!f) return;
    const nx = Math.round(x);
    const ny = Math.round(y);
    if (f.x === nx && f.y === ny) return;
    commit(
      "Move fixture",
      [{ op: "item_patch", coll: "fixtures", id, patch: { x: nx, y: ny } }],
      [{ op: "item_patch", coll: "fixtures", id, patch: { x: f.x, y: f.y } }],
    );
  }

  function updateFixture(id, patch) {
    const f = plan.fixtures.find((fx) => fx.id === id);
    if (!f) return;
    commit(
      "Edit fixture",
      [{ op: "item_patch", coll: "fixtures", id, patch }],
      [{ op: "item_patch", coll: "fixtures", id, patch: patchInverse(f, patch) }],
      { coalesce: patch.label != null ? `fixture-text:${id}` : null },
    );
  }

  const FIXTURE_DEFAULTS = {
    bar: { label: "Bar", w: 240, h: 70 },
    dj: { label: "DJ", w: 160, h: 90 },
    entrance: { label: "Entrance", w: 180, h: 54 },
    label: { label: "Label", w: 200, h: 48 },
    podium: { label: "Podium", w: 190, h: 64 },
    dancefloor: { label: "Dance floor", w: 470, h: 430 },
  };

  function addFixture(type, patch = {}) {
    const preset = FIXTURE_DEFAULTS[type] || FIXTURE_DEFAULTS.label;
    const id = uid("f");
    const item = {
      id,
      type,
      label: preset.label,
      x: Math.round(plan.room.width / 2),
      y: Math.round(plan.room.height / 2) + 150,
      w: preset.w,
      h: preset.h,
      ...patch,
    };
    commit("Add to room", [{ op: "item_put", coll: "fixtures", item }], [{ op: "item_del", coll: "fixtures", id }]);
    return id;
  }

  function removeFixture(id) {
    const f = plan.fixtures.find((fx) => fx.id === id);
    if (!f) return;
    commit(
      "Remove from room",
      [{ op: "item_del", coll: "fixtures", id }],
      [{ op: "item_put", coll: "fixtures", item: clone(f) }],
    );
  }

  // ---- guest actions ------------------------------------------------------
  // Fields that come from the spreadsheets. When a planner changes one by hand we record it in
  // `editedFields`, and `mergeGuestsIntoPlan` then refuses to overwrite it on the next re-import
  // (a late-night ticket switched to Comp, a corrected entrée, a guest moved to another party).
  const SHEET_FIELDS = ["name", "ticketType", "hasDinner", "meal", "partyId", "partyLabel", "buyerName", "buyerEmail", "phone", "email", "seatingNote", "heardAbout"];

  function updateGuest(id, rawPatch) {
    const current = plan.guests[id];
    if (!current || !rawPatch) return;
    const g = { ...current, editedFields: Array.isArray(current.editedFields) ? current.editedFields : [] };
    const touched = SHEET_FIELDS.filter((k) => k in rawPatch && JSON.stringify(rawPatch[k]) !== JSON.stringify(current[k]));
    const patch = touched.length
      ? { ...rawPatch, editedFields: [...new Set([...g.editedFields, ...touched])] }
      : rawPatch;
    commit(
      "Edit guest",
      [{ op: "guest_patch", g: id, patch }],
      [{ op: "guest_patch", g: id, patch: patchInverse(g, patch) }],
      { notify: true, coalesce: typeof patch.plannerNote === "string" || typeof patch.name === "string" ? `guest-text:${id}` : null },
    );
  }

  function addGuest(partial = {}) {
    const id = partial.id || uid("m");
    const name = String(partial.name ?? "").trim() || "New guest";
    const guest = {
      id,
      name,
      partyId: partial.partyId || `manual:${id}`,
      partyLabel: partial.partyLabel || name,
      buyerName: partial.buyerName || "",
      buyerEmail: partial.buyerEmail || "",
      ticketType: partial.ticketType || "comp",
      ticketNumbers: partial.ticketNumbers || [],
      hasDinner: partial.hasDinner !== false,
      meal: partial.meal || null,
      mealRaw: "",
      phone: partial.phone || "",
      email: partial.email || "",
      seatingNote: partial.seatingNote || "",
      heardAbout: "",
      placeholder: false,
      unmatched: false,
      tags: partial.tags || [],
      plannerNote: partial.plannerNote || "",
      prefs: emptyPrefs(),
      source: "manual",
    };
    commit("Add guest", [{ op: "guest_put", guest }], [{ op: "guest_del", g: id }]);
    return id;
  }

  /**
   * Add several guests at once: one name per line, all into one party. Used for
   * comps, staff and walk-ins on the night.
   * @returns {string[]} the new ids
   */
  function addGuests(names, shared = {}) {
    const clean = (names || []).map((n) => String(n ?? "").trim()).filter(Boolean);
    if (!clean.length) return [];
    const partyId = shared.partyId || `manual:${uid("p")}`;
    const partyLabel = shared.partyLabel || clean[0];
    const ticket = ticketTypeById(shared.ticketType || "comp");
    const ops = [];
    const inverse = [];
    const ids = [];
    for (const name of clean) {
      const id = `m:${uid("")}`;
      ids.push(id);
      ops.push({
        op: "guest_put",
        guest: {
          id,
          name,
          partyId,
          partyLabel,
          buyerName: shared.buyerName || "",
          buyerEmail: shared.buyerEmail || "",
          ticketType: ticket.id,
          ticketNumbers: [],
          hasDinner: shared.hasDinner ?? ticket.hasDinner !== false,
          meal: shared.meal || null,
          mealRaw: "",
          phone: shared.phone || "",
          email: shared.email || "",
          seatingNote: "",
          heardAbout: "",
          placeholder: false,
          unmatched: false,
          tags: [...(shared.tags || [])],
          plannerNote: shared.plannerNote || "",
          prefs: emptyPrefs(),
          source: "manual",
        },
      });
      inverse.push({ op: "guest_del", g: id });
    }
    if (shared.seatAtTableId) {
      const taken = new Set(
        Object.values(plan.seating)
          .filter((s) => s.tableId === shared.seatAtTableId)
          .map((s) => s.seat),
      );
      const table = plan.tables.find((t) => t.id === shared.seatAtTableId);
      for (const id of ids) {
        if (!table) break;
        let free = -1;
        for (let i = 0; i < table.seats; i++) {
          if (!taken.has(i)) {
            free = i;
            break;
          }
        }
        if (free < 0) break;
        taken.add(free);
        ops.push({ op: "seat", g: id, t: table.id, s: free });
        inverse.push({ op: "unseat", g: id });
      }
    }
    commit(clean.length === 1 ? `Add ${clean[0]}` : `Add ${clean.length} guests`, ops, inverse.reverse(), {
      notify: true,
    });
    return ids;
  }

  function removeGuest(id) {
    const guest = plan.guests[id];
    if (!guest) return;
    const inverse = [{ op: "guest_put", guest: clone(guest) }];
    if (plan.seating[id]) inverse.push(seatOpFor(id));
    for (const c of plan.constraints) {
      if (c.guestIds.includes(id)) inverse.push({ op: "item_put", coll: "constraints", item: clone(c) });
    }
    commit(`Remove ${guest.name}`, [{ op: "guest_del", g: id }], inverse);
  }

  function addConstraint(type, guestIds, note = "") {
    const id = uid("c");
    commit(
      "Add constraint",
      [{ op: "item_put", coll: "constraints", item: { id, type, guestIds: [...guestIds], note } }],
      [{ op: "item_del", coll: "constraints", id }],
      { notify: true },
    );
    return id;
  }

  function removeConstraint(id) {
    const c = plan.constraints.find((x) => x.id === id);
    if (!c) return;
    commit(
      "Remove constraint",
      [{ op: "item_del", coll: "constraints", id }],
      [{ op: "item_put", coll: "constraints", item: clone(c) }],
    );
  }

  function dismissWarning(key) {
    commit("Dismiss warning", [{ op: "dismiss", key, on: true }], [{ op: "dismiss", key, on: false }]);
  }

  function restoreWarning(key) {
    commit("Restore warning", [{ op: "dismiss", key, on: false }], [{ op: "dismiss", key, on: true }]);
  }

  function renamePlan(name) {
    const before = plan.meta.name;
    if (before === name) return;
    commit(
      "Rename plan",
      [{ op: "meta_patch", patch: { name } }],
      [{ op: "meta_patch", patch: { name: before } }],
      { coalesce: "plan-name" },
    );
  }

  // ---- bulk changes -------------------------------------------------------
  /**
   * Merge imported guests in as guest_put ops (plus seat ops for any seat the
   * merge moved). Existing seats, tags and planner notes survive.
   */
  function importGuests(guests, sourceLabel = "Import") {
    if (!Array.isArray(guests) || !guests.length) return { added: 0, updated: 0, kept: 0, missing: [] };
    backup(`Before import: ${sourceLabel}`);

    const base = clone(plan);
    let next = base;
    let summary = { added: 0, updated: 0, kept: 0, missing: [] };
    try {
      const res = mergeGuestsIntoPlan(base, guests) || {};
      if (res.plan) next = res.plan;
      if (res.summary) summary = res.summary;
    } catch (err) {
      console.error("[gala seating] mergeGuestsIntoPlan failed, merging locally", err);
      next = base;
    }
    // Safety net while the shared importer is a stub: make sure the guests landed.
    if (!guests.every((g) => next.guests && next.guests[g.id])) {
      const merged = localMerge(next, guests);
      next = merged.plan;
      summary = merged.summary;
    }
    try {
      const resolved = resolvePreferences(Object.values(next.guests));
      if (Array.isArray(resolved) && resolved.length) {
        next.guests = Object.fromEntries(resolved.filter(Boolean).map((g) => [g.id, g]));
      }
    } catch (err) {
      console.error("[gala seating] resolvePreferences failed", err);
    }

    const ops = [];
    const inverse = [];
    for (const guest of Object.values(next.guests)) {
      const before = plan.guests[guest.id];
      if (before && JSON.stringify(before) === JSON.stringify(guest)) continue;
      ops.push({ op: "guest_put", guest });
      inverse.push(before ? { op: "guest_put", guest: clone(before) } : { op: "guest_del", g: guest.id });
    }
    // Seats the merge moved or added (placeholders that gained a name keep theirs).
    for (const [gid, s] of Object.entries(next.seating)) {
      const before = plan.seating[gid];
      if (before && before.tableId === s.tableId && before.seat === s.seat) continue;
      ops.push({ op: "seat", g: gid, t: s.tableId, s: s.seat });
      inverse.push(seatOpFor(gid));
    }
    const sources = Array.from(new Set([...(plan.meta.sources || []), sourceLabel]));
    ops.push({ op: "meta_patch", patch: { importedAt: nowIso(), sources } });
    inverse.push({ op: "meta_patch", patch: { importedAt: plan.meta.importedAt, sources: plan.meta.sources || [] } });

    commit(`Import ${sourceLabel}`, ops, inverse);
    return summary;
  }

  function localMerge(base, guests) {
    const next = clone(base);
    const summary = { added: 0, updated: 0, kept: 0, missing: [] };
    const incoming = new Set(guests.map((g) => g.id));
    for (const g of guests) {
      const existing = next.guests[g.id];
      if (existing) {
        next.guests[g.id] = {
          ...g,
          tags: existing.tags?.length ? existing.tags : g.tags,
          plannerNote: existing.plannerNote || g.plannerNote,
          name: existing.source === "manual" ? existing.name : g.name,
        };
        summary.updated += 1;
      } else {
        next.guests[g.id] = { ...g };
        summary.added += 1;
      }
    }
    for (const g of Object.values(next.guests)) {
      if (!incoming.has(g.id)) {
        summary.kept += 1;
        if (g.source !== "manual") summary.missing.push(g);
      }
    }
    return { plan: next, summary };
  }

  /**
   * Reconcile a dinner-form response that never matched a ticket with the
   * unnamed placeholder seat it almost certainly belongs to.
   *
   * The claimed guest inherits the placeholder's ticket, party and seat; the
   * placeholder row goes away. One undo step puts both back.
   */
  function claimTicketSeat(unmatchedId, placeholderId) {
    const guest = plan.guests[unmatchedId];
    const placeholder = plan.guests[placeholderId];
    if (!guest || !placeholder) return false;

    const inherited = {
      partyId: placeholder.partyId,
      partyLabel: placeholder.partyLabel,
      buyerName: placeholder.buyerName,
      buyerEmail: placeholder.buyerEmail,
      ticketType: placeholder.ticketType,
      ticketNumbers: [...(placeholder.ticketNumbers || [])],
      hasDinner: placeholder.hasDinner,
      seatingNote: placeholder.seatingNote || guest.seatingNote,
      heardAbout: placeholder.heardAbout || guest.heardAbout,
      unmatched: false,
    };
    const ops = [{ op: "guest_patch", g: unmatchedId, patch: inherited }];
    const inverse = [{ op: "guest_patch", g: unmatchedId, patch: patchInverse(guest, inherited) }];

    const seat = plan.seating[placeholderId];
    if (seat) {
      ops.push({ op: "seat", g: unmatchedId, t: seat.tableId, s: seat.seat });
      inverse.push(seatOpFor(unmatchedId));
    }
    ops.push({ op: "guest_del", g: placeholderId });
    inverse.push({ op: "guest_put", guest: clone(placeholder) });
    if (seat) inverse.push({ op: "seat", g: placeholderId, t: seat.tableId, s: seat.seat });

    commit(`Claim a seat for ${guest.name}`, ops, inverse.reverse(), { notify: true });
    pushToast({
      kind: "ok",
      message: `${guest.name} now holds ${placeholder.partyLabel}'s ticket seat.`,
      action: { label: "Undo", run: () => undo() },
    });
    return true;
  }

  /** Placeholders of a party, in the order the buyer listed them. */
  function placeholdersOf(partyId) {
    return Object.values(plan.guests)
      .filter((g) => g.placeholder && g.partyId === partyId)
      .sort(
        (a, b) =>
          (a.placeholderIndex ?? 999) - (b.placeholderIndex ?? 999) || a.name.localeCompare(b.name),
      );
  }

  /**
   * Bulk reconcile: a whole group of dinner responses typed under one
   * organiser's name takes a buyer's unnamed seats, in placeholder order.
   * Anyone left over stays unmatched. One batch, one undo step.
   */
  function claimGroupSeats(unmatchedPartyId, targetPartyId) {
    const diners = Object.values(plan.guests)
      .filter((g) => g.unmatched && g.partyId === unmatchedPartyId)
      .sort((a, b) => a.name.localeCompare(b.name));
    const slots = placeholdersOf(targetPartyId);
    if (!diners.length || !slots.length) return { claimed: 0, leftover: diners.length };

    const ops = [];
    const inverse = [];
    const pairs = Math.min(diners.length, slots.length);
    for (let i = 0; i < pairs; i++) {
      const guest = diners[i];
      const placeholder = slots[i];
      const inherited = {
        partyId: placeholder.partyId,
        partyLabel: placeholder.partyLabel,
        buyerName: placeholder.buyerName,
        buyerEmail: placeholder.buyerEmail,
        ticketType: placeholder.ticketType,
        ticketNumbers: [...(placeholder.ticketNumbers || [])],
        hasDinner: placeholder.hasDinner,
        seatingNote: placeholder.seatingNote || guest.seatingNote,
        heardAbout: placeholder.heardAbout || guest.heardAbout,
        unmatched: false,
      };
      ops.push({ op: "guest_patch", g: guest.id, patch: inherited });
      inverse.push({ op: "guest_patch", g: guest.id, patch: patchInverse(guest, inherited) });

      const seat = plan.seating[placeholder.id];
      if (seat) {
        ops.push({ op: "seat", g: guest.id, t: seat.tableId, s: seat.seat });
        inverse.push(seatOpFor(guest.id));
      }
      ops.push({ op: "guest_del", g: placeholder.id });
      inverse.push({ op: "guest_put", guest: clone(placeholder) });
      if (seat) inverse.push({ op: "seat", g: placeholder.id, t: seat.tableId, s: seat.seat });
    }

    const leftover = diners.length - pairs;
    commit(`Assign ${diners[0].partyLabel} to ticket seats`, ops, inverse.reverse(), { notify: true });
    pushToast({
      kind: leftover ? "warn" : "ok",
      message: leftover
        ? `Assigned ${pairs} of ${diners.length}. ${leftover} stayed unmatched, there were not enough unnamed seats.`
        : `Assigned all ${pairs} to ${slots[0].partyLabel}'s seats.`,
      action: { label: "Undo", run: () => undo() },
    });
    return { claimed: pairs, leftover };
  }

  /** Give a placeholder seat a name, without a dinner response to claim it. */
  function nameSeat(placeholderId, name) {
    const clean = String(name ?? "").trim();
    if (!clean) return false;
    const placeholder = plan.guests[placeholderId];
    if (!placeholder) return false;
    const patch = { name: clean, placeholder: false };
    commit(
      `Name ${placeholder.partyLabel}'s seat`,
      [{ op: "guest_patch", g: placeholderId, patch }],
      [{ op: "guest_patch", g: placeholderId, patch: patchInverse(placeholder, patch) }],
    );
    return true;
  }

  /** Whole-plan swap: one `replace` op, undoable in a single step. */
  function replacePlan(nextPlan, { label = "Replace plan", takeBackup = true } = {}) {
    if (!nextPlan || typeof nextPlan !== "object") return false;
    if (takeBackup) backup("Before replacing the plan");
    const before = clone(plan);
    commit(label, [{ op: "replace", plan: normalisePlan(nextPlan) }], [{ op: "replace", plan: before }]);
    return true;
  }

  function runAutoSeat(opts = {}) {
    backup("Before auto-seat");
    const before = clone(plan);
    let res;
    try {
      res = autoSeat(before, opts) || {};
    } catch (err) {
      console.error("[gala seating] autoSeat failed", err);
      pushToast({ kind: "error", message: "Auto-seat did not run. Nothing was changed." });
      return { placed: 0, skipped: [] };
    }
    const next = res.plan ? normalisePlan(res.plan) : before;
    const summary = { placed: res.placed || 0, skipped: res.skipped || [] };

    if (opts.onlyUnseated === false) {
      // Reshuffle everyone: a single whole-plan swap.
      commit("Auto-seat: reshuffle everyone", [{ op: "replace", plan: next }], [{ op: "replace", plan: clone(before) }], {
        notify: true,
      });
      return summary;
    }

    const ops = [];
    const inverse = [];
    for (const [gid, s] of Object.entries(next.seating)) {
      const cur = plan.seating[gid];
      if (cur && cur.tableId === s.tableId && cur.seat === s.seat) continue;
      ops.push({ op: "seat", g: gid, t: s.tableId, s: s.seat });
      inverse.push(seatOpFor(gid));
    }
    for (const gid of Object.keys(plan.seating)) {
      if (!next.seating[gid]) {
        ops.push({ op: "unseat", g: gid });
        inverse.push(seatOpFor(gid));
      }
    }
    if (!ops.length) return summary;
    commit("Auto-seat", ops, inverse.reverse(), { notify: true });
    return summary;
  }

  function normalisePlan(input) {
    const p = clone(input);
    const base = createDefaultPlan();
    p.schema = SCHEMA_VERSION;
    p.meta = { ...base.meta, ...(p.meta || {}) };
    p.room = { ...base.room, ...(p.room || {}) };
    p.fixtures = Array.isArray(p.fixtures) && p.fixtures.length ? p.fixtures : base.fixtures;
    p.tables = Array.isArray(p.tables) && p.tables.length ? p.tables : base.tables;
    p.guests = p.guests && typeof p.guests === "object" ? p.guests : {};
    p.seating = p.seating && typeof p.seating === "object" ? p.seating : {};
    p.constraints = Array.isArray(p.constraints) ? p.constraints : [];
    p.dismissed = p.dismissed && typeof p.dismissed === "object" ? p.dismissed : {};
    for (const g of Object.values(p.guests)) {
      if (!g.prefs) g.prefs = emptyPrefs();
      if (!Array.isArray(g.tags)) g.tags = [];
      if (!Array.isArray(g.ticketNumbers)) g.ticketNumbers = [];
    }
    const tableIds = new Set(p.tables.map((t) => t.id));
    for (const [gid, s] of Object.entries(p.seating)) {
      if (!p.guests[gid] || !tableIds.has(s?.tableId)) delete p.seating[gid];
    }
    return p;
  }

  // ---- backups ------------------------------------------------------------
  function listBackups() {
    return backups.map(({ id, at, label, guestCount, seatedCount, pinned }) => ({
      id,
      at,
      label,
      guestCount,
      seatedCount,
      pinned,
    }));
  }

  function restoreBackup(id) {
    const entry = backups.find((b) => b.id === id);
    if (!entry) return false;
    return replacePlan(entry.plan, { label: `Restore: ${entry.label}` });
  }

  async function saveVersion(label) {
    const name = String(label ?? "").trim() || `Version ${new Date().toLocaleString()}`;
    backup(name, { pinned: true });
    if (remote?.snapshot && !localOnly) {
      try {
        await remote.snapshot(name);
      } catch (err) {
        console.error("[gala seating] remote snapshot failed", err);
      }
    }
    pushToast({ kind: "ok", message: `Saved a version: ${name}` });
  }

  function deleteBackup(id) {
    backups = backups.filter((b) => b.id !== id);
    writeBackups();
  }

  // ---- realtime -----------------------------------------------------------
  function scheduleFlush() {
    if (!remote || localOnly) return;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, FLUSH_MS);
  }

  async function flush() {
    if (!remote || localOnly || disposed || inFlight) return;
    if (!pending.length) return;
    inFlight = true;
    const batch = pending;
    const sent = batch.length;
    sync.status = "saving";
    try {
      const res = await remote.apply(version, batch);
      if (res?.ok) {
        retryDelay = 1500;
        if (res.reset) {
          adoptReset(res.reset.plan, res.version, res.editor);
          pending = [];
        } else {
          const sentKeys = batchKeys(confirmed, batch);
          let base = confirmed;
          for (const b of res.missed || []) {
            const theirKeys = batchKeys(base, b.ops || []);
            const overlap = [...theirKeys].some((k) => sentKeys.has(k));
            base = applyOps(base, b.ops || []);
            notePulses(b);
            logActivity({
              mine: false,
              at: b.at,
              editor: editorOf(b),
              color: colorOf(b.client),
              text: describeOps(b.ops, editorOf(b)),
              focus: focusOf(b.ops),
              collided: overlap,
            });
            if (overlap) reportCollision(b, "won");
          }
          confirmed = applyOps(base, batch);
          pending = pending.slice(sent);
          version = res.version || version;
        }
        sync = { ...sync, status: "live", version, updatedAt: nowIso(), updatedBy: editor, pending: pending.length, error: "" };
        writeLocal();
      } else if (res?.reason === "no-plan") {
        // The slug is empty: the server only accepts a single `replace` for the
        // first write. Fold everything we have into one and send that instead.
        pending = [{ op: "replace", plan: clone(plan) }];
        sync = { ...sync, status: "saving", pending: 1, error: "" };
        inFlight = false;
        scheduleFlush();
        return;
      } else {
        sync = { ...sync, status: "offline", pending: pending.length, error: res?.reason || "Could not reach the shared plan" };
        retryLater();
      }
    } catch (err) {
      sync = { ...sync, status: "offline", pending: pending.length, error: String(err?.message || err) };
      retryLater();
    } finally {
      inFlight = false;
    }
    if (pending.length && sync.status === "live") scheduleFlush();
  }

  function retryLater() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  }

  function adoptReset(nextPlan, nextVersion, who) {
    confirmed = normalisePlan(nextPlan);
    pending = [];
    version = nextVersion || version;
    undoStack.length = 0;
    redoStack.length = 0;
    undoDepth = 0;
    redoDepth = 0;
    sync = { ...sync, status: "live", version, pending: 0, error: "" };
    writeLocal();
    pushToast({ kind: "info", message: `The plan was replaced by ${who || "another planner"}.` });
  }

  /** Remember which seats other planners just touched, so the floor can pulse. */
  function notePulses(batch) {
    const color = (people.find((p) => p.client === batch.client)?.color) || "#FFBD59";
    const next = { ...pulses };
    let any = false;
    for (const op of batch.ops || []) {
      if (op.op === "seat" || op.op === "unseat") {
        next[op.g] = { color, at: Date.now() };
        any = true;
      }
    }
    if (!any) return;
    pulses = next;
    if (pulseTimer) clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => {
      const cutoff = Date.now() - PULSE_MS;
      const kept = {};
      for (const [k, v] of Object.entries(pulses)) if (v.at > cutoff) kept[k] = v;
      pulses = kept;
    }, PULSE_MS);
  }

  async function pullSince() {
    if (!remote || localOnly || disposed || inFlight) return;
    try {
      const res = await remote.since(version);
      if (!res?.ok) return;
      if (res.reset) {
        adoptReset(res.reset.plan, res.version, res.reset.editor);
        return;
      }
      const batches = (res.batches || []).filter((b) => (b.version || 0) > version);
      if (!batches.length) {
        if (sync.status === "offline" || sync.status === "error") {
          sync = { ...sync, status: "live", error: "" };
          if (pending.length) scheduleFlush();
        }
        return;
      }
      if (dragging) {
        // Never yank something out of the local planner's hand: hold the
        // repaint until the drag finishes. The local drop is just a later op.
        incomingBuffer.push(...batches);
        version = res.version || version;
        return;
      }
      applyIncoming(batches, res.version);
    } catch {
      if (sync.status === "live" || sync.status === "saving") sync = { ...sync, status: "offline" };
    }
  }

  function applyIncoming(batches, nextVersion) {
    let base = confirmed;
    let last = null;
    for (const b of batches) {
      const collided = reportCollision(b, "lost");
      base = applyOps(base, b.ops || []);
      notePulses(b);
      logActivity({
        mine: false,
        at: b.at,
        editor: editorOf(b),
        color: colorOf(b.client),
        text: describeOps(b.ops, editorOf(b)),
        focus: focusOf(b.ops),
        collided,
      });
      last = b;
    }
    confirmed = base;
    version = nextVersion || version;
    sync = {
      ...sync,
      status: "live",
      version,
      updatedAt: last?.at || sync.updatedAt,
      updatedBy: last?.editor || sync.updatedBy,
      error: "",
    };
    writeLocal();
  }

  /** The floor tells us when a drag starts and ends. */
  function setDragging(on) {
    dragging = Boolean(on);
    if (!dragging && incomingBuffer.length) {
      const batches = incomingBuffer;
      incomingBuffer = [];
      applyIncoming(batches, version);
    }
  }

  /**
   * Announce what this planner is touching. Sent at the START of a drag (and
   * when a sheet opens), cleared on drop or cancel, and repeated as a
   * heartbeat so a closed tab's hold expires instead of sticking forever.
   */
  function setPresence(focus) {
    presenceFocus = focus || null;
    if (!remote?.setPresence || localOnly) return;
    const key = JSON.stringify(presenceFocus);
    if (key === lastPresence) return;
    lastPresence = key;
    sendPresence();
  }

  function sendPresence() {
    if (!remote?.setPresence || localOnly) return;
    try {
      const r = remote.setPresence({ focus: presenceFocus });
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch {
      /* presence is decoration, never let it break an edit */
    }
  }

  /** Drop other planners' focus once it goes stale, so a closed tab lets go. */
  function refreshPeople() {
    const now = Date.now();
    people = peopleRaw.map((p) => {
      const seen = presenceSeen.get(p.client);
      const fresh = seen && now - seen.at < PRESENCE_STALE_MS;
      return fresh ? p : { ...p, focus: null };
    });
  }

  /** Who is holding this guest or table right now, if anyone. */
  function holderOf(target) {
    if (localOnly || !target) return null;
    for (const p of people) {
      const f = p.focus;
      if (!f) continue;
      if (target.guestId && f.guestId === target.guestId) return p;
      if (target.tableId && f.tableId === target.tableId) return p;
    }
    return null;
  }

  function focusOf(ops) {
    for (const op of ops || []) {
      if (op.op === "seat" || op.op === "unseat" || op.op === "guest_patch") return { guestId: op.g };
      if (op.op === "clear_seats" && op.t) return { tableId: op.t };
      if (op.op === "item_patch" && op.coll === "tables") return { tableId: op.id };
    }
    return null;
  }

  async function attachRemote(r, who = "") {
    if (!r) {
      startLocalOnly();
      return;
    }
    remote = r;
    localOnly = false;
    editor = String(who ?? "").trim();
    sync = { ...sync, status: "loading", error: "" };
    try {
      const res = await r.load();
      if (res?.plan) {
        confirmed = normalisePlan(res.plan);
        version = res.version || 0;
        sync = {
          status: "live",
          version,
          updatedAt: res.updatedAt || null,
          updatedBy: res.updatedBy || "",
          pending: pending.length,
          error: "",
        };
      } else {
        // The maintainer has not seeded the guest list yet.
        confirmed = normalisePlan(res?.plan || createDefaultPlan());
        version = res?.version || 0;
        sync = { status: "live", version, updatedAt: null, updatedBy: "", pending: pending.length, error: "" };
      }
      writeLocal();
      if (pending.length) scheduleFlush();
    } catch (err) {
      sync = { ...sync, status: "offline", error: String(err?.message || err) };
    }
    subscribe();
    startPolling();
  }

  function subscribe() {
    if (!remote?.subscribe || unsubscribe) return;
    try {
      unsubscribe = remote.subscribe({
        onPing: (v) => {
          if ((v || 0) > version) void pullSince();
        },
        onPresence: (list) => {
          peopleRaw = Array.isArray(list) ? list : [];
          const now = Date.now();
          for (const p of peopleRaw) {
            const key = JSON.stringify(p.focus || null);
            const seen = presenceSeen.get(p.client);
            if (!seen || seen.key !== key) presenceSeen.set(p.client, { key, at: now });
          }
          refreshPeople();
        },
        onStatus: (state) => {
          if (state === "offline" && sync.status !== "conflict") sync = { ...sync, status: "offline" };
          else if (state === "live" && sync.status === "offline") {
            sync = { ...sync, status: "live", error: "" };
            void pullSince();
            if (pending.length) scheduleFlush();
          }
        },
      });
    } catch (err) {
      console.error("[gala seating] subscribe failed", err);
    }
  }

  function startPolling() {
    if (pollTimer || !hasWindow) return;
    pollTimer = setInterval(() => void pullSince(), POLL_MS);
    presenceTimer = setInterval(() => {
      if (presenceFocus) sendPresence();
      refreshPeople();
    }, PRESENCE_BEAT_MS);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
  }

  function onOnline() {
    void pullSince();
    if (pending.length) scheduleFlush();
  }

  function onFocus() {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    void pullSince();
  }

  async function loadRemoteVersion(v) {
    if (!remote) return false;
    try {
      const older = await remote.historyGet(v);
      if (!older) return false;
      backup(`Before loading version ${v}`);
      return replacePlan(older, { label: `Load version ${v}`, takeBackup: false });
    } catch {
      pushToast({ kind: "error", message: "Could not load that version." });
      return false;
    }
  }

  /** Local-only mode: the dev bypass and the gate's "Work offline". Never touches the remote. */
  function startLocalOnly() {
    localOnly = true;
    remote = null;
    if (pending.length) {
      confirmed = applyOps(confirmed, pending);
      pending = [];
    }
    sync = { status: "offline", version: 0, updatedAt: null, updatedBy: "", pending: 0, error: "" };
  }

  function loadDemo(guests) {
    if (!localOnly) return;
    importGuests(guests, "Demo guests");
  }

  // ---- boot ---------------------------------------------------------------
  function hydrate() {
    if (!hasWindow || loaded) return;
    const saved = readLocal();
    if (saved?.confirmed) {
      confirmed = normalisePlan(saved.confirmed);
      pending = Array.isArray(saved.pending) ? saved.pending : [];
      version = saved.version || 0;
      savedAt = saved.savedAt ? new Date(saved.savedAt) : null;
      writeId = saved.writeId || writeId;
      sync.pending = pending.length;
    }
    backups = readBackups();
    lastAutoBackup = Date.now();
    loaded = true;
  }

  function onStorage(event) {
    if (!event || event.key !== STORAGE_KEY || !event.newValue) return;
    let payload;
    try {
      payload = JSON.parse(event.newValue);
    } catch {
      return;
    }
    if (!payload?.confirmed || payload.writeId === writeId) return;
    // Two tabs, same browser. With a remote attached both converge on their
    // own, so this only matters in local mode.
    if (!localOnly && remote) return;
    if (undoStack.length === 0) {
      confirmed = normalisePlan(payload.confirmed);
      pending = Array.isArray(payload.pending) ? payload.pending : [];
      writeId = payload.writeId;
      savedAt = payload.savedAt ? new Date(payload.savedAt) : new Date();
      return;
    }
    foreignEdit = { at: payload.savedAt || nowIso(), editor: payload.editor || "Another tab", payload };
  }

  function acceptForeignEdit() {
    const payload = foreignEdit?.payload;
    foreignEdit = null;
    if (!payload?.confirmed) return;
    replacePlan(applyOps(normalisePlan(payload.confirmed), payload.pending || []), {
      label: "Load the other tab's plan",
    });
  }

  function keepMineOverForeign() {
    foreignEdit = null;
    writeLocal();
  }

  function start() {
    hydrate();
    if (hasWindow) window.addEventListener("storage", onStorage);
  }

  function destroy() {
    disposed = true;
    if (hasWindow) {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    }
    if (flushTimer) clearTimeout(flushTimer);
    if (pollTimer) clearInterval(pollTimer);
    if (presenceTimer) clearInterval(presenceTimer);
    if (pulseTimer) clearTimeout(pulseTimer);
    try {
      unsubscribe?.();
    } catch {
      /* ignore */
    }
  }

  return {
    // reactive reads
    get plan() {
      return plan;
    },
    get warnings() {
      return warningIndex;
    },
    get allWarnings() {
      return allWarnings;
    },
    get dismissedWarnings() {
      return dismissedWarnings;
    },
    get stats() {
      return stats;
    },
    get badTableIds() {
      return badTableIds;
    },
    get savedAt() {
      return savedAt;
    },
    get saveError() {
      return saveError;
    },
    get toasts() {
      return toasts;
    },
    get sync() {
      return sync;
    },
    get people() {
      return people;
    },
    get activity() {
      return activity;
    },
    get collisions() {
      return collisions;
    },
    get pulses() {
      return pulses;
    },
    get remote() {
      return remote;
    },
    get foreignEdit() {
      return foreignEdit;
    },
    get loaded() {
      return loaded;
    },
    get canUndo() {
      return undoDepth > 0;
    },
    get canRedo() {
      return redoDepth > 0;
    },
    get backups() {
      return backups;
    },
    get editorName() {
      return editor;
    },
    get isLocalOnly() {
      return localOnly;
    },

    previewPlacement: (guestId, tableId) => {
      try {
        return previewPlacement(plan, guestId, tableId) || [];
      } catch (err) {
        console.error("[gala seating] previewPlacement failed", err);
        return [];
      }
    },

    // actions
    seatGuest,
    unseatGuest,
    seatParty,
    clearTable,
    clearAllSeats,
    setSeatOrder,
    moveTable,
    updateTable,
    addTable,
    removeTable,
    setTableSeats,
    swapTableNumbers,
    renumberByPosition,
    resetLayout,
    moveFixture,
    updateFixture,
    addFixture,
    removeFixture,
    updateGuest,
    addGuest,
    addGuests,
    removeGuest,
    addConstraint,
    removeConstraint,
    dismissWarning,
    restoreWarning,
    renamePlan,
    importGuests,
    claimTicketSeat,
    claimGroupSeats,
    placeholdersOf,
    nameSeat,
    replacePlan,
    runAutoSeat,
    undo,
    redo,
    listBackups,
    restoreBackup,
    saveVersion,
    deleteBackup,
    backup,
    pushToast,
    dismissToast,
    attachRemote,
    startLocalOnly,
    loadDemo,
    loadRemoteVersion,
    setDragging,
    setPresence,
    holderOf,
    dismissCollision,
    acceptForeignEdit,
    keepMineOverForeign,
    start,
    destroy,
  };
}
