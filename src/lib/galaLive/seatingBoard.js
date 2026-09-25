// src/lib/galaLive/seatingBoard.js
//
// "Find your table" boards for the projector's seating loop, built AT RUNTIME
// from the live seating plan so no guest name ever ships in this public repo.
//
// Where the names come from: the DISPLAY KEY alone (#k=<display key> in the
// projector's URL fragment). The keyed gala_display_seating_board RPC
// (supabase/migrations/20260925150000_gala_display_seating_board.sql) checks the
// key exactly like the keyed gift feed and returns only table numbers, seats,
// plan x/y and seated guests' names. Nothing is persisted, logged, or sent
// anywhere else. Guest phones have no key, so they never call it and only ever
// get the numbers-only map.
//
// Old links that still carry the seating passcode (#k=...&seat=<passcode>) keep
// working: if the keyed RPC refuses, the passcode-gated gala_seating_load path
// (src/lib/galaSeating/remote.js) is tried once, silently.
//
// Layout: the same corridor as the printed seating slides (a podium row of
// three at the north / coat check end, then rows of two toward the entrance):
// tables are clustered into rows by their y position in the plan, each row
// becomes one screen column, and within a row tables sort by x.

import { supabase as sharedClient } from "../supabaseClient.js";
import { createRemote } from "../galaSeating/remote.js";
import { readDisplayKey } from "./giftFeed.js";
import { TABLE_ROWS } from "./program.js";

/** Stands in for "no passcode, use the display key" (see readSeatingPass). */
export const KEYED = "@display-key";

/** The legacy `seat=` passcode from the fragment. Never from the query string. */
function readSeatParam() {
  try {
    const params = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    const v = (params.get("seat") || "").trim();
    return v.length >= 4 && v.length <= 200 ? v : "";
  } catch {
    return "";
  }
}

/**
 * What the projector unlocks the seating board with. The display key is
 * enough: with a key and no `seat=` this returns KEYED, so the page's
 * "seating credential AND display key" gate opens on the key alone. A legacy
 * `seat=` passcode is returned as is and only used as a fallback.
 */
export function readSeatingPass() {
  const seat = readSeatParam();
  if (seat) return seat;
  try {
    return readDisplayKey() ? KEYED : "";
  } catch {
    return "";
  }
}

/**
 * The keyed RPC's answer -> the Plan shape boardFromPlan reads, so both paths
 * lay the board out identically. Ids are made up here: the server sends none.
 */
export function planFromKeyedBoard(res) {
  const tables = [];
  const seating = {};
  const guests = {};
  let k = 0;
  (Array.isArray(res?.tables) ? res.tables : []).forEach((t, i) => {
    const id = `k${i}`;
    tables.push({ id, number: t.number, seats: t.seats, x: t.x, y: t.y });
    for (const g of Array.isArray(t.guests) ? t.guests : []) {
      const gid = `g${k++}`;
      seating[gid] = { tableId: id, seat: g.seat };
      guests[gid] = { name: g.name };
    }
  });
  const fixtures = res?.podium ? [{ type: "podium", x: res.podium.x, y: res.podium.y }] : [];
  return { tables, seating, guests, fixtures };
}

async function callBoard(db, args) {
  if (!db) return { ok: false, reason: "offline" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const { data, error } = await db.rpc("gala_display_seating_board", args).abortSignal(controller.signal);
    if (error) return { ok: false, reason: "rpc" };
    if (!data || typeof data !== "object") return { ok: false, reason: "shape" };
    return data;
  } catch {
    return { ok: false, reason: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

// Title-case shouty or lower-case names, as the printed slides do; leave mixed
// case alone ("McKenzie", "DeLeon"). Strips trailing "(D)" / "(2)" markers.
function tidyName(n) {
  return String(n || "")
    .replace(/\s*\((D|\d+)\)$/i, "")
    .split(" ")
    .map((w) =>
      (w === w.toUpperCase() || w === w.toLowerCase()) && /^\p{L}/u.test(w) && !/^(del|de|la|los)$/i.test(w)
        ? w.toLowerCase().replace(/(^|['-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
        : w,
    )
    .join(" ")
    .trim();
}

/**
 * Plan -> { rows: [[{number, seats, guests:[{seat, name}]}]], podSide, seated, tables }
 * rows[0] is the north end. Returns null for a plan with no tables.
 */
export function boardFromPlan(plan) {
  const tables = Array.isArray(plan?.tables) ? plan.tables : [];
  if (!tables.length) return null;
  const seating = plan.seating && typeof plan.seating === "object" ? plan.seating : {};
  const guests = plan.guests && typeof plan.guests === "object" ? plan.guests : {};

  const list = tables
    .filter((t) => Number.isFinite(Number(t.number)))
    .map((t) => ({
      id: t.id,
      number: Number(t.number),
      seats: Math.max(1, Math.min(16, Number(t.seats) || 10)),
      x: Number(t.x) || 0,
      y: Number(t.y) || 0,
      guests: Object.entries(seating)
        .filter(([, s]) => s && s.tableId === t.id)
        .map(([gid, s]) => ({ seat: (Number(s.seat) || 0) + 1, name: tidyName(guests[gid]?.name) }))
        .filter((g) => g.name)
        .sort((a, b) => a.seat - b.seat),
    }));

  // Cluster into rows by y (hand-placed tables are rarely perfectly aligned).
  const centres = [];
  for (const y of list.map((t) => t.y).sort((a, b) => a - b)) {
    const c = centres.find((r) => Math.abs(r.y - y) < 140);
    if (c) {
      c.ys.push(y);
      c.y = c.ys.reduce((a, b) => a + b, 0) / c.ys.length;
    } else centres.push({ y, ys: [y] });
  }
  const rows = centres.map((c) =>
    list.filter((t) => Math.abs(t.y - c.y) < 140).sort((a, b) => a.x - b.x),
  );

  const podium = (plan.fixtures || []).find((f) => f && f.type === "podium");
  const xs = list.map((t) => t.x);
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const podSide = podium ? (Number(podium.x) > midX ? "N. Gallery" : "S. Gallery") : "";

  return {
    rows,
    podSide,
    seated: list.reduce((n, t) => n + t.guests.length, 0),
    tables: list.length,
  };
}

/** The numbers-only board: what phones and a passcode-less projector show. */
export function numbersOnlyBoard() {
  return {
    rows: TABLE_ROWS.map((r) => r.map((n) => ({ id: `t${n}`, number: n, seats: 10, guests: [] }))),
    podSide: "N. Gallery",
    seated: 0,
    tables: TABLE_ROWS.flat().length,
    numbersOnly: true,
  };
}

/**
 * Load the board once, then re-check every `refreshMs` so a late seat change
 * made in /galaseating reaches the screen within a minute. The keyed RPC takes
 * the version already on screen and answers "unchanged" without names when
 * nothing moved. `onBoard(board | null, reason)` is called on every change.
 *
 * `passcode` is what readSeatingPass() returned: KEYED (display key only) or a
 * legacy seat= passcode, which is tried only if the keyed RPC refuses.
 */
export function createSeatingSource({ slug, passcode, onBoard, refreshMs = 60_000, client = sharedClient }) {
  let stopped = false;
  let timer = 0;
  let version = -1;
  let mode = "key"; // "key" | "pass"
  let key = "";
  try {
    key = readDisplayKey();
  } catch {
    key = "";
  }
  const pass = passcode && passcode !== KEYED ? passcode : "";
  if (!key) mode = "pass";
  let remote = null;

  async function pullKeyed() {
    const res = await callBoard(client, {
      p_event: slug,
      p_display_key: key,
      p_version: version >= 0 ? version : null,
    });
    if (res.ok) {
      if (!res.unchanged) {
        version = Number(res.version) || 0;
        onBoard(boardFromPlan(planFromKeyedBoard(res)), "ok");
      }
      return true;
    }
    if (res.reason === "offline") return true; // keep what we have, try again later
    // Refused (wrong or rotated key), no plan for this event, or the RPC is
    // missing: fall back to a legacy seat= passcode when there is one,
    // otherwise stop quietly. The numbers-only board is the expected default
    // there, so nothing is reported (the page would only log it).
    if (pass) {
      mode = "pass";
      version = -1;
      return pullPass();
    }
    return false;
  }

  async function pullPass() {
    if (!pass) {
      onBoard(null, "no-key");
      return false;
    }
    if (!remote) remote = createRemote({ slug, passcode: pass });
    const chk = version >= 0 ? await remote.check() : { ok: true, version: -2 };
    if (chk.ok && chk.version !== version) {
      const res = await remote.load();
      if (res.ok && res.plan) {
        version = res.version;
        onBoard(boardFromPlan(res.plan), "ok");
      } else if (!res.ok && res.reason !== "offline") {
        onBoard(null, res.reason || "refused");
        return false; // a wrong passcode does not get retried every minute
      }
    }
    return true;
  }

  async function pull() {
    if (stopped) return;
    let again = true;
    try {
      again = mode === "key" ? await pullKeyed() : await pullPass();
    } catch {
      /* offline: keep what we have */
    }
    if (!again) stopped = true;
    if (!stopped) timer = setTimeout(pull, refreshMs);
  }
  pull();
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

/**
 * Demo only (?demo=1, or DEV ?seatdemo=1): the corridor filled with the
 * invented guests from src/lib/galaSeating/demo.js, so the named board can be
 * rehearsed without the real plan or its passcode.
 */
export async function demoBoard() {
  const { demoGuests } = await import("../galaSeating/demo.js");
  const names = demoGuests().map((g) => g.name).filter(Boolean);
  let k = 0;
  const rows = TABLE_ROWS.map((r) =>
    r.map((n) => {
      const seats = n === 1 || n === 4 ? 11 : 10;
      const guests = [];
      for (let s = 1; s <= seats && k < names.length; s++) {
        if ((n + s) % 7 === 0) continue; // leave a few open seats
        guests.push({ seat: s, name: tidyName(names[k++]) });
      }
      return { id: `t${n}`, number: n, seats, guests };
    }),
  );
  return { rows, podSide: "N. Gallery", seated: k, tables: TABLE_ROWS.flat().length, demo: true };
}
