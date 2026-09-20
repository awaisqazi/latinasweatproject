// Gala Seating planner: the shared data model. This file IS the contract between
// the logic modules (src/lib/galaSeating/*.js), the store, and the Svelte UI.
//
// PRIVACY: this repo is public. Guest data is never committed and never shipped.
// The page starts empty; planners import the Zeffy export and the dinner-selection
// responses in the browser, and everything stays in localStorage on that device.

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = "lsp.galaSeating.v1";
export const BACKUPS_KEY = "lsp.galaSeating.v1.backups";
export const SEATS_PER_TABLE = 10;
export const DEFAULT_TABLE_COUNT = 13;

/** Room coordinate space (arbitrary units, rendered with a viewBox and pan/zoom). */
export const ROOM = { width: 1800, height: 1060 };
/** Table disc radius, and the radius of the ring the seats sit on. */
export const TABLE_R = 68;
export const SEAT_RING_R = 104;
export const SEAT_R = 21;

export const MEALS = [
  { id: "short-rib", label: "Cherry Braised Short Rib", short: "Short rib", match: /short\s*rib/i },
  { id: "whitefish", label: "Whitefish à la Plancha", short: "Whitefish", match: /whitefish/i },
  { id: "ravioli", label: "Asparagus Artichoke Ravioli (V)", short: "Ravioli (V)", match: /ravioli/i, vegetarian: true },
];

// hasDinner=false means the ticket starts at 9 PM and includes no dinner seat.
export const TICKET_TYPES = [
  { id: "gold", label: "Gold Sponsor", short: "Gold", hasDinner: true, sponsor: true, match: /gold\s*sponsor/i },
  { id: "community", label: "Community Sponsor", short: "Community", hasDinner: true, sponsor: true, match: /community\s*sponsor/i },
  { id: "presenting", label: "Presenting Sponsor", short: "Presenting", hasDinner: true, sponsor: true, match: /presenting\s*sponsor/i },
  { id: "champion", label: "Champion Sponsor", short: "Champion", hasDinner: true, sponsor: true, match: /champion\s*sponsor/i },
  { id: "benefactor", label: "Benefactor: The Full Evening", short: "Benefactor", hasDinner: true, match: /benefactor/i },
  { id: "supporter", label: "Supporter: Late Night Access", short: "Late night", hasDinner: false, match: /supporter|late\s*night/i },
  { id: "comp", label: "Comp / staff / honoree", short: "Comp", hasDinner: true },
  { id: "unknown", label: "No matching ticket", short: "No ticket", hasDinner: true },
];

export const GUEST_TAGS = [
  { id: "vip", label: "VIP" },
  { id: "speaker", label: "Speaker / honoree" },
  { id: "accessible", label: "Accessible seating" },
  { id: "staff", label: "LSP team" },
  { id: "allergy", label: "Allergy / dietary" },
];

/**
 * @typedef {Object} Guest
 * @property {string} id              Stable across re-imports (see importers.js).
 * @property {string} name            Display name.
 * @property {string} partyId         Buyer-level group id (normalized buyer email, or "solo:<id>").
 * @property {string} partyLabel      Human label for the party, normally the buyer's name.
 * @property {string} buyerName
 * @property {string} buyerEmail
 * @property {string} ticketType      One of TICKET_TYPES[].id
 * @property {string[]} ticketNumbers
 * @property {boolean} hasDinner
 * @property {string|null} meal       One of MEALS[].id, or null when no selection yet.
 * @property {string} mealRaw         The selection exactly as submitted.
 * @property {string} phone
 * @property {string} email           The guest's own email from the dinner form, if any.
 * @property {string} seatingNote     Raw "seating preference" answer from the ticket purchase.
 * @property {string} heardAbout      Raw "How did you hear about LSP?" answer.
 * @property {boolean} placeholder    True for an unnamed seat ("Guest of X") awaiting a name.
 * @property {boolean} unmatched      True when a dinner response had no matching ticket.
 * @property {string[]} tags          GUEST_TAGS[].id
 * @property {string} plannerNote     Free text added by the planner in the app.
 * @property {GuestPrefs} prefs
 * @property {"import"|"manual"} source
 *
 * @typedef {Object} GuestPrefs
 * @property {"none"|"resolved"|"partial"|"unresolved"} status
 * @property {string[]} withGuestIds   Guests this person asked to sit with.
 * @property {string[]} withPartyIds   Whole parties this person asked to sit with.
 * @property {string[]} groups         Group keys, e.g. "ytt26", "acme".
 * @property {string[]} unresolved     Fragments of the note that matched nobody.
 *
 * @typedef {Object} Table
 * @property {string} id
 * @property {number} number
 * @property {string} name            Optional label, e.g. a sponsor name.
 * @property {number} x               Center, room units.
 * @property {number} y
 * @property {number} seats
 * @property {boolean} locked         Locked tables are skipped by auto-seat and cannot be dragged.
 * @property {string} note
 *
 * @typedef {Object} Fixture          Podium, dance floor, and any extra room furniture.
 * @property {string} id
 * @property {"podium"|"dancefloor"|"bar"|"dj"|"entrance"|"label"} type
 * @property {string} label
 * @property {number} x               Center.
 * @property {number} y
 * @property {number} w
 * @property {number} h
 *
 * @typedef {Object} Constraint
 * @property {string} id
 * @property {"together"|"apart"} type
 * @property {string[]} guestIds
 * @property {string} note
 *
 * @typedef {Object} Plan
 * @property {number} schema
 * @property {{name:string, createdAt:string, updatedAt:string, importedAt:string|null, sources:string[]}} meta
 * @property {{width:number, height:number}} room
 * @property {Fixture[]} fixtures
 * @property {Table[]} tables
 * @property {Object<string, Guest>} guests
 * @property {Object<string, {tableId:string, seat:number}>} seating   guestId -> seat
 * @property {Constraint[]} constraints
 * @property {Object<string, true>} dismissed                          warning.key -> true
 *
 * @typedef {Object} Warning
 * @property {string} key             Stable, so a dismissal survives recomputation.
 * @property {"error"|"warn"|"info"} severity
 * @property {string} type            See WARNING_TYPES.
 * @property {string[]} guestIds
 * @property {string[]} tableIds
 * @property {string} message         One plain sentence.
 * @property {string} [detail]
 */

export const WARNING_TYPES = {
  "pref-separated": "Asked to sit with someone who is at another table",
  "pref-pending": "Asked to sit with someone who is not seated yet",
  "pref-unresolved": "Seating note could not be matched to a guest, review by hand",
  "group-isolated": "Asked to sit with a group, but nobody from it is at this table",
  "party-split": "Tickets bought together are split across tables",
  "sponsor-split": "A sponsor's seats are split across tables",
  "late-night-seated": "Late Night Access ticket, dinner is not included",
  "no-meal": "Seated for dinner with no entrée selection",
  "over-capacity": "More guests than seats",
  "apart-violated": "Marked keep apart, but seated together",
  "together-violated": "Marked keep together, but seated apart",
  "duplicate-name": "Possible duplicate guest",
  "unmatched-guest": "Dinner response with no matching ticket",
};

export function emptyPrefs() {
  return { status: "none", withGuestIds: [], withPartyIds: [], groups: [], unresolved: [] };
}

export function defaultFixtures() {
  return [
    { id: "podium", type: "podium", label: "Podium", x: 900, y: 84, w: 190, h: 64 },
    { id: "dancefloor", type: "dancefloor", label: "Dance floor", x: 900, y: 430, w: 470, h: 430 },
  ];
}

/** Slots for the default rounds: two columns flanking the dance floor on each side, five across the back. */
const TABLE_SPOTS = [
  [190, 300], [470, 300], [1330, 300], [1610, 300],
  [190, 590], [470, 590], [1330, 590], [1610, 590],
  [250, 890], [575, 890], [900, 890], [1225, 890], [1550, 890],
];

/** Where table number `index + 1` sits by default. Tables past the 13 slots start a new back row. */
export function defaultTableSpot(index) {
  if (TABLE_SPOTS[index]) return TABLE_SPOTS[index];
  const k = index - TABLE_SPOTS.length;
  return [250 + (k % 5) * 325, 1180 + Math.floor(k / 5) * 290];
}

export function defaultTables(count = DEFAULT_TABLE_COUNT) {
  const tables = [];
  for (let i = 0; i < count; i++) {
    const [x, y] = defaultTableSpot(i);
    tables.push({ id: `t${i + 1}`, number: i + 1, name: "", x, y, seats: SEATS_PER_TABLE, locked: false, note: "" });
  }
  return tables;
}

export function createDefaultPlan() {
  const now = new Date().toISOString();
  return {
    schema: SCHEMA_VERSION,
    meta: { name: "Annual Gala 2026 · Dinner seating", createdAt: now, updatedAt: now, importedAt: null, sources: [] },
    room: { ...ROOM },
    fixtures: defaultFixtures(),
    tables: defaultTables(),
    guests: {},
    seating: {},
    constraints: [],
    dismissed: {},
  };
}

// ---- read helpers (pure) ---------------------------------------------------

export function guestList(plan) { return Object.values(plan.guests); }

export function guestsAtTable(plan, tableId) {
  return Object.entries(plan.seating)
    .filter(([, s]) => s.tableId === tableId)
    .sort((a, b) => a[1].seat - b[1].seat)
    .map(([id]) => plan.guests[id])
    .filter(Boolean);
}

export function occupantOf(plan, tableId, seat) {
  for (const [id, s] of Object.entries(plan.seating)) if (s.tableId === tableId && s.seat === seat) return plan.guests[id] || null;
  return null;
}

export function firstFreeSeat(plan, tableId) {
  const t = plan.tables.find((x) => x.id === tableId);
  if (!t) return -1;
  const taken = new Set(Object.values(plan.seating).filter((s) => s.tableId === tableId).map((s) => s.seat));
  for (let i = 0; i < t.seats; i++) if (!taken.has(i)) return i;
  return -1;
}

export function freeSeatCount(plan, tableId) {
  const t = plan.tables.find((x) => x.id === tableId);
  return t ? t.seats - guestsAtTable(plan, tableId).length : 0;
}

export function unseatedGuests(plan) { return guestList(plan).filter((g) => !plan.seating[g.id]); }
export function partyMembers(plan, partyId) { return guestList(plan).filter((g) => g.partyId === partyId); }
export function tableOf(plan, guestId) { const s = plan.seating[guestId]; return s ? plan.tables.find((t) => t.id === s.tableId) || null : null; }
export function tableLabel(t) { return t.name ? `Table ${t.number} · ${t.name}` : `Table ${t.number}`; }
export function mealById(id) { return MEALS.find((m) => m.id === id) || null; }
export function ticketTypeById(id) { return TICKET_TYPES.find((t) => t.id === id) || TICKET_TYPES[TICKET_TYPES.length - 1]; }

/** Seat center in room units. Seat 0 is at the top, going clockwise. */
export function seatPosition(table, seat) {
  const a = -Math.PI / 2 + (seat / table.seats) * Math.PI * 2;
  return { x: table.x + Math.cos(a) * SEAT_RING_R, y: table.y + Math.sin(a) * SEAT_RING_R };
}
