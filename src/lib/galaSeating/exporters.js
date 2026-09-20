// Gala Seating planner · getting the plan out of the browser and back in again.
//
// A plan file is the planner's only real backup, so `parsePlanFile` is forgiving on the
// way in: it repairs what it can (dangling seats, missing fields, an older wrapper) and
// says exactly what it repaired, rather than refusing a file the night before the gala.
//
// Pure ES module: no DOM, no Node APIs, never mutates its inputs.

import {
  SCHEMA_VERSION, SEATS_PER_TABLE, ROOM,
  createDefaultPlan, defaultFixtures, defaultTables, defaultTableSpot,
  guestList, tableLabel, mealById, ticketTypeById, emptyPrefs, MEALS,
} from "./model.js";

export const EXPORT_APP = "lsp-gala-seating";

/* ------------------------------------------------------------------ *
 * JSON out
 * ------------------------------------------------------------------ */

export function serializePlan(plan) {
  return JSON.stringify(
    { app: EXPORT_APP, schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), plan },
    null,
    2
  );
}

/* ------------------------------------------------------------------ *
 * JSON in
 * ------------------------------------------------------------------ */

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v, fallback = "") => (typeof v === "string" ? v : v == null ? fallback : String(v));
const num = (v, fallback) => (typeof v === "number" && isFinite(v) ? v : fallback);
const bool = (v, fallback = false) => (typeof v === "boolean" ? v : fallback);
const arr = (v) => (Array.isArray(v) ? v : []);

function cleanPrefs(raw) {
  const p = emptyPrefs();
  if (!isObj(raw)) return p;
  const statuses = ["none", "resolved", "partial", "unresolved"];
  p.status = statuses.includes(raw.status) ? raw.status : "none";
  p.withGuestIds = arr(raw.withGuestIds).filter((x) => typeof x === "string");
  p.withPartyIds = arr(raw.withPartyIds).filter((x) => typeof x === "string");
  p.groups = arr(raw.groups).filter((x) => typeof x === "string");
  p.unresolved = arr(raw.unresolved).filter((x) => typeof x === "string");
  return p;
}

function cleanGuest(id, raw) {
  if (!isObj(raw)) return null;
  const gid = str(raw.id) || id;
  if (!gid) return null;
  const mealId = typeof raw.meal === "string" && MEALS.some((m) => m.id === raw.meal) ? raw.meal : null;
  const guest = {
    id: gid,
    name: str(raw.name) || "Unnamed guest",
    partyId: str(raw.partyId) || `solo:${gid}`,
    partyLabel: str(raw.partyLabel),
    buyerName: str(raw.buyerName),
    buyerEmail: str(raw.buyerEmail),
    ticketType: ticketTypeById(str(raw.ticketType)).id,
    ticketNumbers: arr(raw.ticketNumbers).map((n) => str(n)).filter(Boolean),
    hasDinner: bool(raw.hasDinner, true),
    meal: mealId,
    mealRaw: str(raw.mealRaw),
    phone: str(raw.phone),
    email: str(raw.email),
    seatingNote: str(raw.seatingNote),
    heardAbout: str(raw.heardAbout),
    placeholder: bool(raw.placeholder),
    unmatched: bool(raw.unmatched),
    tags: arr(raw.tags).filter((t) => typeof t === "string"),
    plannerNote: str(raw.plannerNote),
    prefs: cleanPrefs(raw.prefs),
    source: raw.source === "manual" ? "manual" : "import",
  };
  if (typeof raw.placeholderIndex === "number") guest.placeholderIndex = raw.placeholderIndex;
  if (raw.nameEdited === true) guest.nameEdited = true;
  return guest;
}

function cleanTable(raw, i) {
  if (!isObj(raw)) return null;
  const id = str(raw.id) || `t${i + 1}`;
  const [spotX, spotY] = defaultTableSpot(i);
  return {
    id,
    number: num(raw.number, i + 1),
    name: str(raw.name),
    x: num(raw.x, spotX),
    y: num(raw.y, spotY),
    seats: Math.max(1, Math.round(num(raw.seats, SEATS_PER_TABLE))),
    locked: bool(raw.locked),
    note: str(raw.note),
  };
}

function cleanFixture(raw, i) {
  if (!isObj(raw)) return null;
  const types = ["podium", "dancefloor", "bar", "dj", "entrance", "label"];
  return {
    id: str(raw.id) || `f${i + 1}`,
    type: types.includes(raw.type) ? raw.type : "label",
    label: str(raw.label),
    x: num(raw.x, 900),
    y: num(raw.y, 500),
    w: num(raw.w, 160),
    h: num(raw.h, 60),
  };
}

/**
 * Read a plan file. Accepts the export wrapper or a bare plan.
 * `errors` is a list of NOTICES about what was repaired; a null plan means the file was
 * unreadable and nothing could be salvaged.
 * @returns {{plan: Object|null, errors: string[]}}
 */
export function parsePlanFile(text) {
  const errors = [];
  let raw;
  try {
    raw = JSON.parse(String(text));
  } catch (err) {
    return { plan: null, errors: [`That file is not valid JSON (${err && err.message ? err.message : "parse error"}).`] };
  }
  if (!isObj(raw)) return { plan: null, errors: ["That file does not contain a seating plan."] };

  let body = raw;
  if (isObj(raw.plan)) {
    if (raw.app && raw.app !== EXPORT_APP) errors.push(`The file says it came from "${raw.app}", importing it anyway.`);
    body = raw.plan;
  } else if (!raw.guests && !raw.tables && !raw.seating) {
    return { plan: null, errors: ["That file does not contain a seating plan."] };
  }

  const base = createDefaultPlan();
  const plan = { ...base };

  const schema = num(body.schema, num(raw.schema, SCHEMA_VERSION));
  if (schema > SCHEMA_VERSION) errors.push(`The file was written by a newer version (schema ${schema}), some settings may be ignored.`);
  plan.schema = SCHEMA_VERSION;

  plan.meta = {
    ...base.meta,
    ...(isObj(body.meta) ? body.meta : {}),
    name: str(isObj(body.meta) ? body.meta.name : "", base.meta.name) || base.meta.name,
    updatedAt: new Date().toISOString(),
  };
  if (!isObj(body.meta)) errors.push("The file had no plan details, so the default name and dates were used.");

  plan.room = isObj(body.room)
    ? { width: num(body.room.width, ROOM.width), height: num(body.room.height, ROOM.height) }
    : { ...ROOM };

  const fixtures = arr(body.fixtures).map(cleanFixture).filter(Boolean);
  plan.fixtures = fixtures.length ? fixtures : defaultFixtures();
  if (!fixtures.length && arr(body.fixtures).length) errors.push("The room fixtures could not be read, so the default podium and dance floor were used.");

  const seenTables = new Set();
  const tables = [];
  for (let i = 0; i < arr(body.tables).length; i++) {
    const t = cleanTable(body.tables[i], i);
    if (!t) { errors.push(`Table ${i + 1} in the file was not readable and was dropped.`); continue; }
    if (seenTables.has(t.id)) { errors.push(`Two tables shared the id "${t.id}", the second was dropped.`); continue; }
    seenTables.add(t.id);
    tables.push(t);
  }
  if (!tables.length) {
    plan.tables = defaultTables();
    if (arr(body.tables).length) errors.push("No table could be read, so the default room of 12 tables was used.");
  } else {
    plan.tables = tables;
  }

  const guests = {};
  const rawGuests = isObj(body.guests) ? body.guests : {};
  if (!isObj(body.guests) && body.guests != null) errors.push("The guest list could not be read and was left empty.");
  let droppedGuests = 0;
  for (const [id, g] of Object.entries(rawGuests)) {
    const clean = cleanGuest(id, g);
    if (!clean) { droppedGuests++; continue; }
    guests[clean.id] = clean;
  }
  if (droppedGuests) errors.push(`${droppedGuests} guest ${droppedGuests === 1 ? "entry was" : "entries were"} not readable and ${droppedGuests === 1 ? "was" : "were"} dropped.`);
  plan.guests = guests;

  const seating = {};
  const takenSeats = new Map();
  let droppedSeats = 0;
  const rawSeating = isObj(body.seating) ? body.seating : {};
  if (!isObj(body.seating) && body.seating != null) errors.push("The seat assignments could not be read and were cleared.");
  for (const [guestId, s] of Object.entries(rawSeating)) {
    if (!guests[guestId] || !isObj(s)) { droppedSeats++; continue; }
    const table = plan.tables.find((t) => t.id === str(s.tableId));
    const seat = num(s.seat, -1);
    if (!table || !Number.isInteger(seat) || seat < 0 || seat >= table.seats) { droppedSeats++; continue; }
    const key = `${table.id}:${seat}`;
    if (takenSeats.has(key)) { droppedSeats++; continue; }
    takenSeats.set(key, guestId);
    seating[guestId] = { tableId: table.id, seat };
  }
  if (droppedSeats) errors.push(`${droppedSeats} seat ${droppedSeats === 1 ? "assignment" : "assignments"} pointed at a guest, table or seat that no longer exists and ${droppedSeats === 1 ? "was" : "were"} cleared.`);
  plan.seating = seating;

  const constraints = [];
  for (const c of arr(body.constraints)) {
    if (!isObj(c)) continue;
    const type = c.type === "apart" ? "apart" : c.type === "together" ? "together" : null;
    if (!type) continue;
    const ids = arr(c.guestIds).filter((id) => typeof id === "string" && guests[id]);
    if (ids.length < 2) { errors.push("A keep-together/keep-apart rule referred to guests who are gone and was dropped."); continue; }
    constraints.push({ id: str(c.id) || `c${constraints.length + 1}`, type, guestIds: ids, note: str(c.note) });
  }
  plan.constraints = constraints;

  const dismissed = {};
  if (isObj(body.dismissed)) for (const [k, v] of Object.entries(body.dismissed)) if (v) dismissed[k] = true;
  plan.dismissed = dismissed;

  return { plan, errors };
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

const BOM = "﻿";
const CSV_HEADER = ["Table", "Seat", "Guest", "Party", "Ticket", "Meal", "Tags", "Notes"];

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}
function csvRow(cells) { return cells.map(csvCell).join(","); }

function guestNotes(g) {
  return [g.plannerNote, g.seatingNote].map((x) => String(x || "").trim()).filter(Boolean).join(" · ");
}

function guestRowCells(g, tableText, seatText) {
  const meal = mealById(g.meal);
  return [
    tableText,
    seatText,
    g.name,
    g.partyLabel || g.buyerName || "",
    ticketTypeById(g.ticketType).short,
    meal ? meal.short : g.hasDinner === false ? "No dinner" : "",
    (g.tags || []).join(" "),
    guestNotes(g),
  ];
}

/**
 * One row per seat, empty seats included, then everyone still unseated.
 * Excel-friendly: UTF-8 BOM so accented names survive a double-click, CRLF line endings.
 */
export function seatingCsv(plan) {
  const rows = [CSV_HEADER];
  const occupant = new Map();
  for (const [guestId, s] of Object.entries(plan.seating || {})) {
    const g = plan.guests[guestId];
    if (g) occupant.set(`${s.tableId}:${s.seat}`, g);
  }

  for (const table of plan.tables.slice().sort((a, b) => a.number - b.number)) {
    for (let seat = 0; seat < table.seats; seat++) {
      const g = occupant.get(`${table.id}:${seat}`);
      rows.push(g
        ? guestRowCells(g, tableLabel(table), String(seat + 1))
        : [tableLabel(table), String(seat + 1), "", "", "", "", "", ""]);
    }
  }

  const unseated = guestList(plan)
    .filter((g) => !plan.seating[g.id])
    .sort((a, b) => a.name.localeCompare(b.name));
  if (unseated.length) {
    rows.push(["", "", "", "", "", "", "", ""]);
    rows.push(["Unseated", "", "", "", "", "", "", ""]);
    for (const g of unseated) rows.push(guestRowCells(g, "Unseated", ""));
  }

  return BOM + rows.map(csvRow).join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------ *
 * counts and print data
 * ------------------------------------------------------------------ */

function emptyCount() {
  const c = {};
  for (const m of MEALS) c[m.id] = 0;
  c.none = 0;
  return c;
}

/**
 * Kitchen numbers. `total` counts every dinner guest in the plan (seated or not, because
 * the kitchen cooks for all of them); `byTable` counts who is actually at each table.
 */
export function mealCounts(plan) {
  const total = emptyCount();
  const byTable = {};
  for (const t of plan.tables) byTable[t.id] = emptyCount();
  let seatedTotal = 0;

  for (const g of guestList(plan)) {
    const key = g.meal && total[g.meal] != null ? g.meal : "none";
    if (g.hasDinner !== false) total[key]++;
    const s = plan.seating[g.id];
    if (s && byTable[s.tableId]) { byTable[s.tableId][key]++; seatedTotal++; }
  }
  return { total, byTable, seatedTotal };
}

function lastNameKey(name) {
  const tokens = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "";
  return `${tokens[tokens.length - 1]} ${tokens.slice(0, -1).join(" ")}`.toLowerCase();
}

/** The check-in desk list: by last name, placeholders at the end. */
export function alphaList(plan) {
  return guestList(plan)
    .map((g) => {
      const s = plan.seating[g.id];
      const table = s ? plan.tables.find((t) => t.id === s.tableId) : null;
      const meal = mealById(g.meal);
      return {
        id: g.id,
        name: g.name,
        table: table ? tableLabel(table) : "",
        tableNumber: table ? table.number : null,
        seat: s ? s.seat + 1 : null,
        meal: meal ? meal.short : g.hasDinner === false ? "No dinner" : "",
        placeholder: !!g.placeholder,
        sortKey: lastNameKey(g.name),
      };
    })
    .sort((a, b) => {
      if (a.placeholder !== b.placeholder) return a.placeholder ? 1 : -1;
      return a.sortKey.localeCompare(b.sortKey) || a.name.localeCompare(b.name);
    });
}

/** One card per table, for the printed table cards and the kitchen sheet. */
export function tableCards(plan) {
  const counts = mealCounts(plan);
  return plan.tables
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((table) => {
      const seated = Object.entries(plan.seating || {})
        .filter(([, s]) => s.tableId === table.id)
        .sort((a, b) => a[1].seat - b[1].seat)
        .map(([id, s]) => {
          const g = plan.guests[id];
          if (!g) return null;
          const meal = mealById(g.meal);
          return {
            id: g.id,
            seat: s.seat + 1,
            seatIndex: s.seat,
            name: g.name,
            meal: meal ? meal.short : g.hasDinner === false ? "No dinner" : "",
            mealId: g.meal,
            tags: g.tags || [],
            party: g.partyLabel || g.buyerName || "",
            placeholder: !!g.placeholder,
          };
        })
        .filter(Boolean);
      return {
        table,
        label: tableLabel(table),
        guests: seated,
        empty: table.seats - seated.length,
        meals: counts.byTable[table.id] || emptyCount(),
      };
    });
}
