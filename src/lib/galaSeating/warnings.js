// Gala Seating planner · every way a placement can contradict what a guest asked for.
//
// Warnings are advice, never a block: the planner knows things the spreadsheet does not.
// Keys are stable so a dismissal survives recomputation, and `plan.dismissed` is NOT
// filtered here - the store does that, so a dismissed warning can be restored.
//
// Pure ES module: no DOM, no Node APIs, never mutates its inputs.

import {
  guestList, firstFreeSeat, tableLabel, ticketTypeById, TICKET_TYPES,
} from "./model.js";
import { normName } from "./matching.js";
import { groupLabel, groupMembers } from "./preferences.js";

const SPONSOR_IDS = new Set(TICKET_TYPES.filter((t) => t.sponsor).map((t) => t.id));

/** "Ana Perez" -> "Ana", but placeholders keep their full label. */
function shortName(g) {
  if (!g) return "someone";
  if (g.placeholder || g.unmatched) return g.name;
  const first = String(g.name || "").trim().split(/\s+/)[0];
  return first || g.name || "someone";
}

function labelOf(plan, tableId) {
  const t = plan.tables.find((x) => x.id === tableId);
  return t ? tableLabel(t) : "an unknown table";
}

function listOfTables(plan, tableIds) {
  const names = tableIds.map((id) => {
    const t = plan.tables.find((x) => x.id === id);
    return t ? `Table ${t.number}` : "an unknown table";
  });
  if (names.length <= 1) return names[0] || "no table";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function warn(key, severity, type, guestIds, tableIds, message, detail) {
  const w = { key, severity, type, guestIds, tableIds, message };
  if (detail) w.detail = detail;
  return w;
}

/** Tagged "Needs outreach": nobody has confirmed this seat yet. Advice only, like every warning. */
function outreachWarning(guest, tableId) {
  return warn(
    `needs-outreach:${guest.id}`, "info", "needs-outreach",
    [guest.id], tableId ? [tableId] : [],
    `${guest.name} is waiting on outreach; not seated until confirmed.`
  );
}

/**
 * Indices shared by every rule, built once per computation so a hover preview stays cheap.
 */
function buildContext(plan) {
  const guests = guestList(plan);
  const seating = plan.seating || {};
  const byParty = new Map();
  const byTable = new Map();
  for (const t of plan.tables) byTable.set(t.id, []);
  for (const g of guests) {
    if (!byParty.has(g.partyId)) byParty.set(g.partyId, []);
    byParty.get(g.partyId).push(g);
    const s = seating[g.id];
    if (s && byTable.has(s.tableId)) byTable.get(s.tableId).push(g);
  }
  const maxSeats = plan.tables.reduce((m, t) => Math.max(m, t.seats || 0), 0);
  const groupCache = new Map();
  return {
    plan, guests, seating, byParty, byTable, maxSeats,
    tableIdOf: (id) => (seating[id] ? seating[id].tableId : null),
    membersOfGroup(key) {
      if (!groupCache.has(key)) groupCache.set(key, groupMembers(guests, key));
      return groupCache.get(key);
    },
  };
}

/* ------------------------------------------------------------------ *
 * per-guest rules
 * ------------------------------------------------------------------ */

function guestWarnings(ctx, guest) {
  const { plan, seating } = ctx;
  const out = [];
  const seat = seating[guest.id];
  const myTable = seat ? seat.tableId : null;
  const prefs = guest.prefs || {};

  if (seat && guest.hasDinner === false) {
    out.push(warn(
      `late-night-seated:${guest.id}`, "error", "late-night-seated",
      [guest.id], [myTable],
      `${shortName(guest)} has a Late Night Access ticket (9 PM, no dinner) but is seated at ${labelOf(plan, myTable)}.`
    ));
  }

  if (seat && guest.hasDinner !== false && !guest.meal) {
    out.push(warn(
      `no-meal:${guest.id}`, "info", "no-meal",
      [guest.id], [myTable],
      `${shortName(guest)} is seated for dinner with no entrée selection.`
    ));
  }

  if ((guest.tags || []).includes("outreach")) {
    out.push(outreachWarning(guest, myTable));
  }

  if (guest.unmatched) {
    out.push(warn(
      `unmatched-guest:${guest.id}`, "info", "unmatched-guest",
      [guest.id], myTable ? [myTable] : [],
      `${guest.name} submitted a dinner selection but has no matching ticket.`,
      guest.partyLabel ? `Listed "${guest.partyLabel}" as the purchaser.` : undefined
    ));
  }

  for (let i = 0; i < (prefs.unresolved || []).length; i++) {
    const fragment = prefs.unresolved[i];
    out.push(warn(
      `pref-unresolved:${guest.id}:${i}`, "info", "pref-unresolved",
      [guest.id], myTable ? [myTable] : [],
      `${shortName(guest)} wrote "${fragment}" and it did not match anyone, check by hand.`,
      guest.seatingNote
    ));
  }

  if (!seat) return out;

  for (const targetId of prefs.withGuestIds || []) {
    const target = plan.guests[targetId];
    if (!target || targetId === guest.id) continue;
    const theirTable = ctx.tableIdOf(targetId);
    if (!theirTable) {
      out.push(warn(
        `pref-pending:${guest.id}:${targetId}`, "info", "pref-pending",
        [guest.id, targetId], [myTable],
        `${shortName(guest)} asked to sit with ${shortName(target)}, who has no seat yet.`
      ));
    } else if (theirTable !== myTable) {
      out.push(warn(
        `pref-separated:${guest.id}:${targetId}`, "warn", "pref-separated",
        [guest.id, targetId], [myTable, theirTable],
        `${shortName(guest)} asked to sit with ${shortName(target)}, who is at ${labelOf(plan, theirTable)}.`
      ));
    }
  }

  for (const partyId of prefs.withPartyIds || []) {
    if (partyId === guest.partyId) continue;
    const members = (ctx.byParty.get(partyId) || []).filter((g) => g.id !== guest.id);
    if (!members.length) continue;
    const seatedMembers = members.filter((m) => ctx.tableIdOf(m.id));
    const label = members[0].partyLabel || "that party";
    if (!seatedMembers.length) {
      out.push(warn(
        `pref-pending:${guest.id}:party:${partyId}`, "info", "pref-pending",
        [guest.id, ...members.map((m) => m.id)], [myTable],
        `${shortName(guest)} asked to sit with the tickets ${label} bought, none of which are seated yet.`
      ));
    } else if (!seatedMembers.some((m) => ctx.tableIdOf(m.id) === myTable)) {
      const theirTables = [...new Set(seatedMembers.map((m) => ctx.tableIdOf(m.id)))];
      out.push(warn(
        `pref-separated:${guest.id}:party:${partyId}`, "warn", "pref-separated",
        [guest.id, ...seatedMembers.map((m) => m.id)], [myTable, ...theirTables],
        `${shortName(guest)} asked to sit with the tickets ${label} bought, who are at ${listOfTables(plan, theirTables)}.`
      ));
    }
  }

  for (const key of prefs.groups || []) {
    const members = ctx.membersOfGroup(key).filter((m) => m.id !== guest.id);
    if (!members.length) continue;
    const together = members.some((m) => ctx.tableIdOf(m.id) === myTable);
    if (!together) {
      out.push(warn(
        `group-isolated:${guest.id}:${key}`, "warn", "group-isolated",
        [guest.id, ...members.map((m) => m.id)], [myTable],
        `${shortName(guest)} asked to sit with ${groupLabel(key)}, but nobody from it is at ${labelOf(plan, myTable)}.`,
        `${members.length} other guests are in this group.`
      ));
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * party / table / plan rules
 * ------------------------------------------------------------------ */

function partyWarnings(ctx, partyId) {
  const members = ctx.byParty.get(partyId) || [];
  if (members.length < 2) return [];
  const seated = members.filter((m) => ctx.tableIdOf(m.id));
  const tables = [...new Set(seated.map((m) => ctx.tableIdOf(m.id)))];
  if (tables.length < 2) return [];
  // A party bigger than any table cannot help being split.
  if (members.length > ctx.maxSeats) return [];

  const sponsor = members.some((m) => SPONSOR_IDS.has(m.ticketType));
  const label = members[0].partyLabel || "This party";
  const ids = seated.map((m) => m.id);
  if (sponsor) {
    const type = ticketTypeById(members.find((m) => SPONSOR_IDS.has(m.ticketType)).ticketType);
    return [warn(
      `sponsor-split:${partyId}`, "warn", "sponsor-split",
      ids, tables,
      `${label}'s ${members.length} ${type.label} seats are split across ${listOfTables(ctx.plan, tables)}.`
    )];
  }
  return [warn(
    `party-split:${partyId}`, "warn", "party-split",
    ids, tables,
    `${label} bought ${members.length} tickets together but they are split across ${listOfTables(ctx.plan, tables)}.`
  )];
}

function tableWarnings(ctx, table) {
  const occupants = ctx.byTable.get(table.id) || [];
  if (occupants.length <= table.seats) return [];
  return [warn(
    `over-capacity:${table.id}`, "error", "over-capacity",
    occupants.map((g) => g.id), [table.id],
    `${tableLabel(table)} has ${occupants.length} guests in ${table.seats} seats.`
  )];
}

function constraintWarnings(ctx) {
  const { plan } = ctx;
  const out = [];
  for (const c of plan.constraints || []) {
    const ids = (c.guestIds || []).filter((id) => plan.guests[id]);
    const seated = ids.filter((id) => ctx.tableIdOf(id));
    if (seated.length < 2) continue;
    const tables = [...new Set(seated.map((id) => ctx.tableIdOf(id)))];
    const names = seated.map((id) => shortName(plan.guests[id]));
    if (c.type === "apart") {
      for (const tableId of tables) {
        const here = seated.filter((id) => ctx.tableIdOf(id) === tableId);
        if (here.length < 2) continue;
        out.push(warn(
          `apart-violated:${c.id}:${tableId}`, "error", "apart-violated",
          here, [tableId],
          `${here.map((id) => shortName(plan.guests[id])).join(" and ")} are marked keep apart but are both at ${labelOf(plan, tableId)}.`,
          c.note
        ));
      }
    } else if (c.type === "together" && tables.length > 1) {
      out.push(warn(
        `together-violated:${c.id}`, "warn", "together-violated",
        seated, tables,
        `${names.join(" and ")} are marked keep together but are at ${listOfTables(plan, tables)}.`,
        c.note
      ));
    }
  }
  return out;
}

function duplicateWarnings(ctx) {
  const byName = new Map();
  for (const g of ctx.guests) {
    if (g.placeholder) continue;
    const key = normName(g.name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(g);
  }
  const out = [];
  for (const [key, list] of byName) {
    if (list.length < 2) continue;
    const tables = [...new Set(list.map((g) => ctx.tableIdOf(g.id)).filter(Boolean))];
    out.push(warn(
      `duplicate-name:${key}`, "info", "duplicate-name",
      list.map((g) => g.id), tables,
      `${list.length} guests are named ${list[0].name}, one of them may be a duplicate.`
    ));
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * public API
 * ------------------------------------------------------------------ */

/**
 * Every warning the current plan produces. Dismissed keys are included; the store filters.
 * @returns {Array} Warning[]
 */
export function computeWarnings(plan) {
  if (!plan || !plan.guests) return [];
  const ctx = buildContext(plan);
  const out = [];
  for (const g of ctx.guests) out.push(...guestWarnings(ctx, g));
  for (const partyId of ctx.byParty.keys()) out.push(...partyWarnings(ctx, partyId));
  for (const t of plan.tables) out.push(...tableWarnings(ctx, t));
  out.push(...constraintWarnings(ctx));
  out.push(...duplicateWarnings(ctx));
  return out;
}

/** Only the warnings that name this guest, computed without touching every other guest. */
function warningsAbout(plan, guestId) {
  const guest = plan.guests[guestId];
  if (!guest) return [];
  const ctx = buildContext(plan);
  const out = guestWarnings(ctx, guest);
  out.push(...partyWarnings(ctx, guest.partyId));
  const seat = plan.seating[guestId];
  if (seat) {
    const table = plan.tables.find((t) => t.id === seat.tableId);
    if (table) out.push(...tableWarnings(ctx, table));
  }
  for (const w of constraintWarnings(ctx)) if (w.guestIds.includes(guestId)) out.push(w);
  for (const w of duplicateWarnings(ctx)) if (w.guestIds.includes(guestId)) out.push(w);
  return out;
}

/**
 * What would go wrong if this guest were dropped on this table: only the warnings that
 * are NEW compared with where they sit now, plus a synthetic error when the table is full.
 * Runs on every drag-hover, so it never walks the whole guest list twice.
 */
export function previewPlacement(plan, guestId, tableId) {
  if (!plan || !plan.guests[guestId]) return [];
  const table = plan.tables.find((t) => t.id === tableId);
  if (!table) return [];

  const current = plan.seating[guestId];
  const alreadyHere = current && current.tableId === tableId;
  const free = firstFreeSeat(plan, tableId);
  const out = [];
  if (free === -1 && !alreadyHere) {
    out.push(warn(
      `table-full:${tableId}`, "error", "over-capacity",
      [guestId], [tableId],
      `${tableLabel(table)} is full, this would take it past ${table.seats} seats.`
    ));
  }

  const before = new Set(warningsAbout(plan, guestId).map((w) => w.key));
  const hypothetical = {
    ...plan,
    seating: { ...plan.seating, [guestId]: { tableId, seat: free === -1 ? table.seats : free } },
  };
  for (const w of warningsAbout(hypothetical, guestId)) {
    if (!before.has(w.key)) out.push(w);
  }
  // Already true before the drop, so the diff above drops it; the planner still needs to see
  // it while dragging someone who is waiting on outreach. Never blocks the drop.
  const guest = plan.guests[guestId];
  if ((guest.tags || []).includes("outreach") && !alreadyHere && !out.some((w) => w.type === "needs-outreach")) {
    out.push(outreachWarning(guest, tableId));
  }
  return out;
}

/** Group warnings for the UI: by guest, by table, and a severity tally. */
export function indexWarnings(warnings) {
  const byGuest = {};
  const byTable = {};
  const counts = { error: 0, warn: 0, info: 0 };
  const all = Array.isArray(warnings) ? warnings : [];
  for (const w of all) {
    for (const id of w.guestIds || []) (byGuest[id] = byGuest[id] || []).push(w);
    for (const id of w.tableIds || []) if (id) (byTable[id] = byTable[id] || []).push(w);
    if (counts[w.severity] != null) counts[w.severity]++;
  }
  return { byGuest, byTable, counts, all };
}
