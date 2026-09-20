// Gala Seating: pure read helpers the phone UI needs.
//
// Seating on a phone is done by picking, not by dragging, so the UI has to
// answer questions the desktop answered with a hover preview: which seat should
// this person take at that table, which tables are worth offering, and what
// would go wrong if the planner chose one.
//
// Pure functions only. Nothing here mutates a plan or touches the DOM; the
// store stays the single writer. Logic modules (model.js, warnings.js) are read
// but never changed.
//
// PRIVACY: this repo is public. Nothing here stores, logs or transmits a guest.

import { firstFreeSeat, guestsAtTable, tableLabel } from "./model.js";
import { previewPlacement } from "./warnings.js";

/** Seats taken at a table, as a Set of seat indexes. */
function takenSeats(plan, tableId) {
  const out = new Set();
  for (const s of Object.values(plan.seating)) if (s.tableId === tableId) out.add(s.seat);
  return out;
}

/**
 * How full a table is, in one object, without walking `plan.seating` at every
 * call site.
 * @returns {{table: any, seats: number, taken: number, free: number}|null}
 */
export function tableOccupancy(plan, tableId) {
  const table = plan.tables.find((t) => t.id === tableId);
  if (!table) return null;
  const taken = takenSeats(plan, tableId).size;
  return { table, seats: table.seats, taken, free: Math.max(0, table.seats - taken) };
}

/**
 * Every seat at a table in ring order, occupied or not. This is the phone's
 * table roster: ten rows, always ten, so an empty chair is a thing you can tap.
 * @returns {Array<{seat:number, guest:any|null}>}
 */
export function seatRows(plan, tableId) {
  const table = plan.tables.find((t) => t.id === tableId);
  if (!table) return [];
  const bySeat = [];
  for (const [gid, s] of Object.entries(plan.seating)) {
    if (s.tableId !== tableId) continue;
    bySeat[s.seat] = plan.guests[gid] || null;
  }
  return Array.from({ length: table.seats }, (_, i) => ({ seat: i, guest: bySeat[i] || null }));
}

/**
 * The seat this guest should get at this table: a free chair next to someone
 * from their own party if there is one, otherwise the first free chair.
 *
 * Adjacency is on the ring, so seat 0 and the last seat are neighbours.
 * @returns {number} seat index, or -1 when the table is full
 */
export function bestSeatFor(plan, guestId, tableId) {
  const table = plan.tables.find((t) => t.id === tableId);
  const guest = plan.guests[guestId];
  if (!table || !guest) return -1;

  const taken = takenSeats(plan, tableId);
  // A guest already sitting here keeps their own chair in the "free" reckoning.
  const current = plan.seating[guestId];
  if (current && current.tableId === tableId) taken.delete(current.seat);
  if (taken.size >= table.seats) return -1;

  const n = table.seats;
  const partySeats = [];
  for (const [gid, s] of Object.entries(plan.seating)) {
    if (s.tableId !== tableId || gid === guestId) continue;
    if (plan.guests[gid]?.partyId === guest.partyId) partySeats.push(s.seat);
  }

  for (const seat of partySeats) {
    for (const delta of [1, -1]) {
      const candidate = ((seat + delta) % n + n) % n;
      if (!taken.has(candidate)) return candidate;
    }
  }

  for (let i = 0; i < n; i++) if (!taken.has(i)) return i;
  return -1;
}

/**
 * Where this guest could go, one row per table, ready to paint.
 *
 * `level` is the colour the picker uses: "ok" gold, "warn" amber with the
 * reason spelled out, "full" red and not choosable, "here" for the table they
 * are already sitting at.
 * @returns {Array<{id:string, table:any, label:string, free:number, seats:number, level:string, reason:string}>}
 */
export function tableChoices(plan, guestId) {
  const guest = plan.guests[guestId];
  const current = plan.seating[guestId] || null;
  return plan.tables.map((table) => {
    const taken = takenSeats(plan, table.id).size;
    const here = current?.tableId === table.id;
    const free = Math.max(0, table.seats - taken);
    let level = "ok";
    let reason = "";
    if (here) {
      level = "here";
      reason = `Already here · seat ${current.seat + 1}`;
    } else if (free === 0) {
      level = "full";
      reason = "Full";
    } else {
      const warns = guest ? previewPlacement(plan, guestId, table.id) : [];
      if (warns.length) {
        const worst = warns.find((w) => w.severity === "error") || warns[0];
        level = "warn";
        reason = worst.message;
      }
    }
    return {
      id: table.id,
      table,
      label: tableLabel(table),
      free,
      seats: table.seats,
      taken,
      level,
      reason,
    };
  });
}

/**
 * Dinner guests with no chair yet, the list the planner is actually working
 * through. Late Night Access tickets are not "unseated": they were never owed
 * a dinner seat.
 */
export function unseatedDinnerGuests(plan) {
  return Object.values(plan.guests).filter((g) => g.hasDinner !== false && !plan.seating[g.id]);
}

/** How many dinner guests are still waiting for a chair. The Guests tab badge. */
export function unseatedDinnerCount(plan) {
  let n = 0;
  for (const g of Object.values(plan.guests)) {
    if (g.hasDinner !== false && !plan.seating[g.id]) n += 1;
  }
  return n;
}

/**
 * "Moves from Table 2", or "" when they are not sitting anywhere yet. Used in
 * the empty-seat picker so a planner never moves somebody by accident.
 */
export function moveNote(plan, guestId) {
  const s = plan.seating[guestId];
  if (!s) return "";
  const t = plan.tables.find((x) => x.id === s.tableId);
  return t ? `Moves from ${tableLabel(t)}` : "";
}

/** Meal tallies at one table, for the roster header and the table cards. */
export function tableMeals(plan, tableId) {
  const out = {};
  for (const g of guestsAtTable(plan, tableId)) {
    if (!g.hasDinner) continue;
    const key = g.meal || "none";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

/** The first chair going spare at a table, or -1. Re-exported for the pickers. */
export function firstOpenSeat(plan, tableId) {
  return firstFreeSeat(plan, tableId);
}
