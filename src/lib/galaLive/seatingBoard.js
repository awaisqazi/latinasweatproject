// src/lib/galaLive/seatingBoard.js
//
// "Find your table" boards for the projector's seating loop, built AT RUNTIME
// from the live seating plan so no guest name ever ships in this public repo.
//
// Where the names come from: the projector URL carries the seating passcode in
// its fragment (#k=<display key>&seat=<passcode>). This module calls the
// passcode-gated gala_seating_load RPC (src/lib/galaSeating/remote.js) and keeps
// only table numbers, seat numbers and display names in memory. Nothing is
// persisted, logged, or sent anywhere else. Guest phones never call this: the
// page only loads it when BOTH a display key and a seating passcode are present.
//
// Layout: the same corridor as the printed seating slides (a podium row of
// three at the north / coat check end, then rows of two toward the entrance):
// tables are clustered into rows by their y position in the plan, each row
// becomes one screen column, and within a row tables sort by x.

import { createRemote } from "../galaSeating/remote.js";
import { TABLE_ROWS } from "./program.js";

/** Read `seat=` from the fragment. Never from the query string. */
export function readSeatingPass() {
  try {
    const params = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
    const v = (params.get("seat") || "").trim();
    return v.length >= 4 && v.length <= 200 ? v : "";
  } catch {
    return "";
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
 * Load the plan once, then re-check every `refreshMs` (cheap version check) so
 * a late seat change made in /galaseating reaches the screen within a minute.
 * `onBoard(board | null, reason)` is called on every change.
 */
export function createSeatingSource({ slug, passcode, onBoard, refreshMs = 60_000 }) {
  let stopped = false;
  let timer = 0;
  let version = -1;
  const remote = createRemote({ slug, passcode });

  async function pull() {
    if (stopped) return;
    try {
      const chk = version >= 0 ? await remote.check() : { ok: true, version: -2 };
      if (chk.ok && chk.version !== version) {
        const res = await remote.load();
        if (res.ok && res.plan) {
          version = res.version;
          onBoard(boardFromPlan(res.plan), "ok");
        } else if (!res.ok && res.reason !== "offline") {
          onBoard(null, res.reason || "refused");
          stopped = true; // a wrong passcode does not get retried every minute
          return;
        }
      }
    } catch {
      /* offline: keep what we have */
    }
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
