// Gala Seating planner · logic tests.  node src/lib/galaSeating/test/run.mjs
//
// PRIVACY: every name, email and note below is invented for this file. Real guest data
// never enters the repo, not in fixtures, not in comments, not in output.

import {
  createDefaultPlan,
  ROOM, emptyPrefs, guestList, SEATS_PER_TABLE, DEFAULT_TABLE_COUNT,
} from "../model.js";
import {
  normName, namesMatch, parseTickets, parseResponses,
  isGenericGuestName, matchSelections, stableId,
  repairMojibake,
} from "../matching.js";
import { buildGuestsFromRows, mergeGuestsIntoPlan } from "../importers.js";
import { resolvePreferences, groupMembers, splitFragments } from "../preferences.js";
import { computeWarnings, previewPlacement, indexWarnings } from "../warnings.js";
import { autoSeat, rankTables } from "../autoseat.js";
import {
  serializePlan, parsePlanFile, seatingCsv, mealCounts, alphaList, tableCards,
} from "../exporters.js";
import { applyOps } from "../ops.js";
import {
  resolutionPatch, ticketResolutionOf, needsTicketResolution, hasNoZeffyTicket,
  resolutionAttribution, chicagoShortDate, showsTicketResolution,
} from "../ticketResolution.js";

/* ------------------------------------------------------------------ *
 * tiny harness
 * ------------------------------------------------------------------ */

let passed = 0;
const failures = [];
let group = "";

function describe(name, fn) { group = name; fn(); }
function it(name, fn) {
  try { fn(); passed++; }
  catch (err) { failures.push(`${group} > ${name}\n    ${err && err.message ? err.message : err}`); }
}
function ok(value, message) { if (!value) throw new Error(message || `expected truthy, got ${JSON.stringify(value)}`); }
function eq(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message || "not equal"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function deepEq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message || "not deep equal"}:\n    expected ${b}\n    got      ${a}`);
}
function has(list, value, message) {
  if (!list.includes(value)) throw new Error(`${message || "missing"}: ${JSON.stringify(value)} not in ${JSON.stringify(list)}`);
}

/* ------------------------------------------------------------------ *
 * fixtures (invented names only)
 * ------------------------------------------------------------------ */

const TICKET_HEADERS = [
  " Guest First Name ", "Guest last name", "Guest address", "Buyer first name", "Buyer last name",
  "Buyer email", "Ticket number", "Ticket type",
  "Do you have a seating preference with another guest or group?",
  "How did you hear about LSP?", "Ticket notes", "Status",
];

// [guestFirst, guestLast, buyerFirst, buyerLast, email, ticketNo, type, pref, heard]
function ticketRow(buyerFirst, buyerLast, email, ticketNo, type, pref = "", heard = "") {
  // Zeffy mirrors the buyer name into the guest columns on every row.
  return [buyerFirst, buyerLast, "", buyerFirst, buyerLast, email, ticketNo, type, pref, heard, "", "Not checked-in"];
}

const BENEFACTOR = "Benefactor: The Full Evening";
const LATE_NIGHT = "Supporter: Late Night Access";
const GOLD = "Gold Sponsor";
const COMMUNITY = "Community Sponsor";

function ticketRows() {
  return [
    TICKET_HEADERS,
    ticketRow("Ana", "Perez", "ana@example.org", "101", BENEFACTOR, "State Representative Edgar Gonzalez, Jr.", "A friend"),
    ticketRow("Ana", "Perez", "ana@example.org", 102.0, BENEFACTOR, "Same as number one!", "A friend"),
    ticketRow("Ana", "Perez", "ANA@example.org ", "103.0", BENEFACTOR, "", "A friend"),
    [],                                   // blank row in the middle of the sheet
    ticketRow("Luis", "Ramos", "luis@example.net", "104", BENEFACTOR, "Ana Perez", ""),
    ticketRow("Luis", "Ramos", "luis@example.net", "105", BENEFACTOR, "", ""),
    ticketRow("Delia", "Zamora", "dz@example.com", "106", COMMUNITY, "YTT '26 cohort people", ""),
    ticketRow("Delia", "Zamora", "dz@example.com", "107", COMMUNITY, "", ""),
    ticketRow("Delia", "Zamora", "dz@example.com", "108", COMMUNITY, "", ""),
    ticketRow("Delia", "Zamora", "dz@example.com", "109", COMMUNITY, "", ""),
    ticketRow("Delia", "Zamora", "dz@example.com", "110", COMMUNITY, "", ""),
    ticketRow("Marcos", "Diaz", "marcos@chubb.example", "111", BENEFACTOR, "no preference but seat with the Chubb people.", "I work at Chubb"),
    ticketRow("Marcos", "Diaz", "marcos@chubb.example", "112", BENEFACTOR, "", "I work at Chubb"),
    ticketRow("Paula", "Nieto", "paula@chubb.example", "113", BENEFACTOR, "", "A Chubb colleague invited me"),
    ticketRow("Edgar", "Gonzalez", "edgar@example.org", "114", BENEFACTOR, "", ""),
    ticketRow("Tomas", "Rivas", "tomas@example.org", "115", LATE_NIGHT, "", ""),
    ticketRow("Tomas", "Rivas", "tomas@example.org", "116", LATE_NIGHT, "", ""),
    ticketRow("Sofia", "Lane", "sofia@goldco.example", "117", GOLD, "seat with tickets Delia Zamora purchased.", ""),
    ticketRow("Sofia", "Lane", "sofia@goldco.example", "118", GOLD, "", ""),
    ticketRow("Refunded", "Person", "refund@example.org", "119", BENEFACTOR, "", ""),
  ];
}

function ticketRowsWithRefund() {
  const rows = ticketRows();
  rows[rows.length - 1][11] = "Refunded";
  return rows;
}

const MEAL_HEADERS = ["Timestamp", "Guest Name", "Purchaser’s name", "Email address", "Phone number", "Dinner selection"];
const SHORT_RIB = "Cherry Braised Short Rib";
const WHITEFISH = "Whitefish à la Plancha";
const RAVIOLI = "Asparagus Artichoke Ravioli (V)";

function mealRow(ts, guest, purchaser, email, phone, selection) {
  return [ts, guest, purchaser, email, phone, selection];
}

function mealRows() {
  return [
    MEAL_HEADERS,
    mealRow("2026-09-01T10:00:00Z", "Ana Perez", "Ana Perez", "ana@example.org", "555-0100", SHORT_RIB),
    mealRow("2026-09-01T10:05:00Z", "Brenda Cruz", "Ana Perez", "brenda@example.org", "555-0101", RAVIOLI),
    mealRow("2026-09-01T11:00:00Z", "Luis Ramos", "Luis Ramos", "luis@example.net", "", SHORT_RIB),
    mealRow("2026-09-01T11:02:00Z", "Elena Ramos", "Luis Ramos", "luis@example.net", "", WHITEFISH),
    // Delia bought 5 seats but six people answered under her name: capacity wins.
    mealRow("2026-09-02T09:00:00Z", "Delia Zamora", "Delia Zamora", "dz@example.com", "", SHORT_RIB),
    mealRow("2026-09-02T09:01:00Z", "Veronica Salas", "Delia Zamora", "vero@example.org", "", WHITEFISH),
    mealRow("2026-09-02T09:02:00Z", "Elizabeth Fuentes", "Delia Zamora", "liz@example.org", "", RAVIOLI),
    mealRow("2026-09-02T09:03:00Z", "Giselle Mora", "Delia Zamora", "gigi@example.org", "", SHORT_RIB),
    mealRow("2026-09-02T09:04:00Z", "Jessica Nava", "Delia Zamora", "jess@example.org", "", SHORT_RIB),
    mealRow("2026-09-02T09:05:00Z", "Xochitl Barron", "Delia Zamora", "xochitl@example.org", "", WHITEFISH),
    // Duplicate submissions: the later timestamp wins.
    mealRow("2026-09-03T08:00:00Z", "Marcos Diaz", "Marcos Diaz", "marcos@chubb.example", "", SHORT_RIB),
    mealRow("2026-09-04T08:00:00Z", "Marcos Diaz", "Marcos Diaz", "marcos@chubb.example", "", RAVIOLI),
    mealRow("2026-09-03T08:10:00Z", "Edgar Gonzalez", "Edgar Gonzalez", "edgar@example.org", "", WHITEFISH),
    // Nobody's ticket: a comped honoree who filled the form in anyway.
    mealRow("2026-09-05T08:00:00Z", "Renata Ocampo", "Community Table", "renata@example.org", "", RAVIOLI),
    mealRow("2026-09-05T08:01:00Z", "Hugo Barrera", "Community Table", "hugo@example.org", "", SHORT_RIB),
  ];
}

let guestSeq = 0;
function mkGuest(over = {}) {
  guestSeq++;
  return {
    id: over.id || `g${guestSeq}`,
    name: over.name || `Guest ${guestSeq}`,
    partyId: over.partyId || `solo:${guestSeq}`,
    partyLabel: over.partyLabel || over.name || `Guest ${guestSeq}`,
    buyerName: over.buyerName || over.name || "",
    buyerEmail: over.buyerEmail || "",
    ticketType: over.ticketType || "benefactor",
    ticketNumbers: over.ticketNumbers || [],
    hasDinner: over.hasDinner !== undefined ? over.hasDinner : true,
    meal: over.meal !== undefined ? over.meal : "short-rib",
    mealRaw: over.mealRaw || "",
    phone: "", email: "",
    seatingNote: over.seatingNote || "",
    heardAbout: over.heardAbout || "",
    placeholder: !!over.placeholder,
    unmatched: !!over.unmatched,
    tags: over.tags || [],
    plannerNote: over.plannerNote || "",
    prefs: over.prefs || emptyPrefs(),
    source: over.source || "import",
    ...(over.placeholderIndex !== undefined ? { placeholderIndex: over.placeholderIndex } : {}),
  };
}

function makePlan(guests, { tableCount = 3, seats = 4 } = {}) {
  const plan = createDefaultPlan();
  plan.tables = Array.from({ length: tableCount }, (_, i) => ({
    id: `t${i + 1}`, number: i + 1, name: "", x: 200 + i * 300, y: 300, seats, locked: false, note: "",
  }));
  plan.guests = Object.fromEntries(guests.map((g) => [g.id, g]));
  return plan;
}

function seatAt(plan, guestId, tableId, seat) {
  plan.seating[guestId] = { tableId, seat };
  return plan;
}

function typesOf(warnings) { return warnings.map((w) => w.type); }

/* ------------------------------------------------------------------ *
 * matching
 * ------------------------------------------------------------------ */

describe("matching", () => {
  it("normalizes accents, curly apostrophes and punctuation", () => {
    eq(normName("  Verónica  O’Hara-Salas "), "veronica ohara salas");
    eq(normName(null), "");
  });

  it("matches names across middle names, order and small typos", () => {
    ok(namesMatch("Ana M Perez", "Ana Perez"));
    ok(namesMatch("Perez Ana", "Ana Perez"));
    ok(namesMatch("Jonathan Ruiz", "Jonathon Ruiz"));
    ok(!namesMatch("Ana Perez", "Luis Ramos"));
    ok(!namesMatch("", "Ana Perez"));
  });

  it("reads tolerant headers, blank rows and numeric ticket numbers", () => {
    const parsed = parseTickets(ticketRows());
    eq(parsed.tickets.length, 19, "one ticket per non-blank row");
    eq(parsed.tickets[1].ticketNumber, "102", "102.0 becomes 102");
    eq(parsed.tickets[2].ticketNumber, "103", "\"103.0\" becomes 103");
    eq(parsed.tickets[2].buyerEmail, "ana@example.org", "email is trimmed and lowercased");
    eq(parsed.tickets[0].seatingNote, "State Representative Edgar Gonzalez, Jr.");
    eq(parsed.tickets[0].ticketTypeId, "benefactor");
    eq(parsed.tickets.find((t) => t.ticketTypeId === "supporter").hasDinner, false);
  });

  it("skips refunded rows", () => {
    const parsed = parseTickets(ticketRowsWithRefund());
    eq(parsed.skipped, 1);
    eq(parsed.tickets.length, 18);
  });

  it("sees that the export mirrors the buyer name onto every ticket row", () => {
    const parsed = parseTickets(ticketRows());
    ok(parsed.tickets.every((t) => t.guestMirrorsBuyer), "every row mirrors");
  });

  it("dedupes dinner responses, latest timestamp wins", () => {
    const parsed = parseResponses(mealRows());
    eq(parsed.rawCount, 15);
    eq(parsed.responses.length, 14);
    eq(parsed.duplicatesDropped, 1);
    const marcos = parsed.responses.find((r) => r.guestNorm === "marcos diaz");
    eq(marcos.selection, RAVIOLI, "the later submission wins");
  });

  it("caps attribution at the buyer's seat count", () => {
    const tickets = parseTickets(ticketRows()).tickets;
    const responses = parseResponses(mealRows()).responses;
    const result = matchSelections(tickets, responses);
    const dinorah = result.buyers.find((b) => b.buyerEmail === "dz@example.com");
    eq(dinorah.tickets.length, 5);
    eq(dinorah.attributed.length, 5, "six answered, five seats");
    ok(result.stats.unattributed >= 1, "the surplus stays unattributed for a human");
  });

  it("never mutates the tickets or responses handed to it", () => {
    const tickets = parseTickets(ticketRows()).tickets;
    const responses = parseResponses(mealRows()).responses;
    matchSelections(tickets, responses);
    ok(tickets.every((t) => t.covered === false), "input tickets untouched");
    ok(responses.every((r) => r.attributedTo === null), "input responses untouched");
  });

  it("produces identical ids for identical input", () => {
    eq(stableId("g", "ana@example.org|ana perez"), stableId("g", "ana@example.org|ana perez"));
    ok(stableId("g", "a") !== stableId("g", "b"));
  });
});

/* ------------------------------------------------------------------ *
 * mojibake
 * ------------------------------------------------------------------ */

// How the export renders each character: the UTF-8 bytes read back through Mac Roman.
const MOJI = {
  "ñ": "√±", "Ñ": "√ë", "á": "√°",
  "é": "√©", "í": "√≠", "ó": "√≥",
  "ú": "√∫", "ü": "√º", "Á": "√Å",
  "É": "√â", "Í": "√ç", "Ó": "√ì",
  "Ú": "√ö", "’": "‚Äô", "“": "‚Äú",
  "”": "‚Äù", "–": "‚Äì",
};
/** Write a correct string the way the Zeffy export would mangle it. */
const mangle = (s) => s.replace(/[^ -]/g, (ch) => MOJI[ch] || ch);

describe("repairMojibake", () => {
  it("restores every character the export is known to mangle", () => {
    for (const [right, wrong] of Object.entries(MOJI)) {
      eq(repairMojibake(wrong), right, `sequence for U+${right.codePointAt(0).toString(16)}`);
    }
  });

  it("fixes names in place without touching the rest", () => {
    eq(repairMojibake(mangle("Beatriz Mardueño")), "Beatriz Mardueño");
    eq(repairMojibake(mangle("Sofía Saldaña-Rincón")), "Sofía Saldaña-Rincón");
    eq(repairMojibake(mangle("Señor Álvarez")), "Señor Álvarez");
    eq(repairMojibake(mangle("she said “yes” – it’s on")), "she said “yes” – it’s on");
  });

  it("leaves clean text, plain ASCII and blanks alone", () => {
    eq(repairMojibake("Ana Perez"), "Ana Perez");
    eq(repairMojibake("Beatriz Mardueño"), "Beatriz Mardueño", "already correct text is untouched");
    eq(repairMojibake(""), "");
    eq(repairMojibake(null), "");
    eq(repairMojibake(undefined), "");
    eq(repairMojibake(85), "85");
  });

  it("is idempotent", () => {
    const once = repairMojibake(mangle("Rocío Núñez"));
    eq(repairMojibake(once), once);
  });

  it("normalizes a mangled name to the same key as a clean one", () => {
    eq(normName(mangle("Beatriz Mardueño")), normName("Beatriz Mardueño"));
    eq(normName(mangle("Beatriz Mardueño")), "beatriz mardueno");
    ok(namesMatch(mangle("Beatriz Mardueño"), "Beatriz Mardueño"),
      "a mangled ticket name matches the clean form on the dinner sheet");
  });

  it("repairs ticket cells, response cells and override cells at parse time", () => {
    const tickets = [
      TICKET_HEADERS,
      ticketRow("Beatriz", mangle("Mardueño"), "bea@example.org", "201", BENEFACTOR,
        mangle("Sentar con Sofía Saldaña"), mangle("Una amiga me invitó")),
    ];
    const parsed = parseTickets(tickets);
    eq(parsed.tickets[0].buyerName, "Beatriz Mardueño");
    eq(parsed.tickets[0].seatingNote, "Sentar con Sofía Saldaña");
    eq(parsed.tickets[0].heardAbout, "Una amiga me invitó");

    const meals = [
      MEAL_HEADERS,
      mealRow("2026-09-01T10:00:00Z", mangle("Sofía Saldaña"), mangle("Beatriz Mardueño"),
        "sofia@example.org", "", RAVIOLI),
    ];
    const responses = parseResponses(meals).responses;
    eq(responses[0].guestName, "Sofía Saldaña");
    eq(responses[0].purchaserName, "Beatriz Mardueño");

    const built = buildGuestsFromRows({
      ticketRows: tickets,
      mealRows: meals,
      overrideRows: [
        ["Purchaser name (as typed on form)", "Buyer email", "Skip buyer email", "Note"],
        [mangle("Beatriz Mardueño"), "bea@example.org", "", mangle("Confirmado por teléfono")],
      ],
    });
    const sofia = built.guests.find((g) => g.name === "Sofía Saldaña");
    ok(sofia, "the dinner guest came through with her accents");
    eq(sofia.buyerName, "Beatriz Mardueño");
    ok(!built.guests.some((g) => /[√‚¬]/.test(`${g.name}${g.buyerName}${g.seatingNote}${g.heardAbout}`)),
      "no mangled sequence survives anywhere in the guest list");
  });

  it("gives the same guest ids whether the sheet arrives mangled or clean", () => {
    const rows = (mangler) => [
      TICKET_HEADERS,
      ticketRow("Beatriz", mangler("Mardueño"), "bea@example.org", "201", BENEFACTOR),
      ticketRow("Beatriz", mangler("Mardueño"), "bea@example.org", "202", BENEFACTOR),
      ticketRow(mangler("Rocío"), mangler("Núñez"), "rocio@example.org", "203", BENEFACTOR),
    ];
    const mealsFor = (mangler) => [
      MEAL_HEADERS,
      mealRow("2026-09-01T10:00:00Z", mangler("Sofía Saldaña"), mangler("Beatriz Mardueño"), "sofia@example.org", "", RAVIOLI),
    ];
    const dirty = buildGuestsFromRows({ ticketRows: rows(mangle), mealRows: mealsFor(mangle) });
    const clean = buildGuestsFromRows({ ticketRows: rows((s) => s), mealRows: mealsFor((s) => s) });
    deepEq(dirty.guests.map((g) => g.id).sort(), clean.guests.map((g) => g.id).sort(),
      "ids are computed from the repaired text, so they do not depend on the encoding");
    deepEq(dirty.guests.map((g) => g.name).sort(), clean.guests.map((g) => g.name).sort());
    // And the buyer-named path, which hashes the buyer's own name, is covered too.
    ok(dirty.guests.some((g) => g.name === "Rocío Núñez" && !g.placeholder));
  });

  it("writes the repaired name into the CSV", () => {
    const built = buildGuestsFromRows({
      ticketRows: [TICKET_HEADERS, ticketRow("Beatriz", mangle("Mardueño"), "bea@example.org", "201", BENEFACTOR)],
    });
    const plan = mergeGuestsIntoPlan(makePlan([], { tableCount: 1, seats: 4 }), built.guests).plan;
    const guest = Object.values(plan.guests)[0];
    plan.seating[guest.id] = { tableId: "t1", seat: 0 };
    const csv = seatingCsv(plan);
    ok(csv.includes("Beatriz Mardueño"), "the accent reaches the spreadsheet");
    ok(!/[√‚¬]/.test(csv), "and the mangled form does not");
  });
});

/* ------------------------------------------------------------------ *
 * importers
 * ------------------------------------------------------------------ */

describe("importers", () => {
  const built = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
  const guests = built.guests;
  const byName = (name) => guests.find((g) => normName(g.name) === normName(name));

  it("turns every ticket row into exactly one seat", () => {
    const fromTickets = guests.filter((g) => !g.unmatched);
    eq(fromTickets.length, 19, "19 ticket rows, 19 seats");
  });

  it("names the buyer rather than hiding them behind a placeholder", () => {
    const sofia = byName("Sofia Lane");
    ok(sofia, "the gold sponsor buyer is in the list");
    eq(sofia.placeholder, false);
    eq(sofia.ticketType, "gold");
  });

  it("fills the rest of a party with numbered placeholders", () => {
    const ana = guests.filter((g) => g.buyerEmail === "ana@example.org");
    eq(ana.length, 3);
    eq(ana.filter((g) => g.placeholder).length, 1, "2 named + 1 placeholder");
    eq(ana.find((g) => g.placeholder).name, "Guest of Ana Perez (3)");
    const tomas = guests.filter((g) => g.buyerEmail === "tomas@example.org");
    eq(tomas.find((g) => g.placeholder).name, "Guest of Tomas Rivas (2)");
  });

  it("keeps late-night tickets and flags them", () => {
    const tomas = guests.filter((g) => g.buyerEmail === "tomas@example.org");
    eq(tomas.length, 2);
    ok(tomas.every((g) => g.hasDinner === false));
    eq(tomas[0].ticketType, "supporter");
  });

  it("carries the meal, phone and per-row seating note", () => {
    const ana = byName("Ana Perez");
    eq(ana.meal, "short-rib");
    eq(ana.phone, "555-0100");
    const marcos = byName("Marcos Diaz");
    eq(marcos.meal, "ravioli", "the later duplicate submission won");
  });

  it("resolves \"same as number one\" to the first row's note", () => {
    const ana = guests.filter((g) => g.buyerEmail === "ana@example.org");
    const notes = ana.map((g) => g.seatingNote);
    eq(notes.filter((n) => n === "State Representative Edgar Gonzalez, Jr.").length, 2,
      "row 1 and the row that said 'same as number one'");
    has(notes, "", "the third row keeps its own empty note");
  });

  it("lists dinner responses with no ticket as unmatched, grouped by typed purchaser", () => {
    const unmatched = guests.filter((g) => g.unmatched);
    ok(unmatched.length >= 3, `expected the surplus plus two comps, got ${unmatched.length}`);
    const renata = byName("Renata Ocampo");
    const hugo = byName("Hugo Barrera");
    ok(renata && hugo);
    eq(renata.partyId, hugo.partyId, "a typed-organizer group stays together");
    eq(renata.partyLabel, "Community Table");
    eq(renata.ticketType, "unknown");
  });

  it("writes a plain-English report", () => {
    eq(built.report.tickets, 19);
    eq(built.report.dinnerTickets, 17);
    eq(built.report.responses, 15);
    ok(built.report.placeholders > 0);
    ok(built.report.notes.some((n) => /late-night tickets have no dinner seat/.test(n)), built.report.notes.join(" | "));
    ok(built.report.notes.some((n) => /did not match a ticket/.test(n)));
  });

  it("gives identical ids when the same sheets are imported again", () => {
    const again = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    deepEq(again.guests.map((g) => g.id).sort(), guests.map((g) => g.id).sort(), "ids are stable");
  });

  it("works with tickets only", () => {
    const only = buildGuestsFromRows({ ticketRows: ticketRows() });
    eq(only.guests.length, 19);
    eq(only.guests.filter((g) => !g.placeholder).length, 9, "one named buyer per party");
    eq(only.guests.filter((g) => g.placeholder).length, 10, "every other seat is a placeholder");
  });

  it("works with dinner responses only", () => {
    const only = buildGuestsFromRows({ mealRows: mealRows() });
    eq(only.guests.length, 14);
    ok(only.guests.every((g) => g.unmatched));
  });

  it("lets an Overrides row claim a purchaser group the matcher would not risk", () => {
    const overrideRows = [
      ["Purchaser name (as typed on form)", "Buyer email", "Skip buyer email", "Note"],
      ["EXAMPLE Table Host", "example@example.org", "", "template row, ignored"],
      ["Community Table", "tomas@example.org", "", "Tomas hosts the comped table"],
    ];
    const withOverride = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows(), overrideRows });
    const renata = withOverride.guests.find((g) => g.name === "Renata Ocampo");
    ok(renata, "Renata is still in the list");
    eq(renata.unmatched, false, "the override gave her a ticket");
    eq(renata.buyerEmail, "tomas@example.org");
    const hugo = withOverride.guests.find((g) => g.name === "Hugo Barrera");
    eq(hugo.partyId, renata.partyId, "both moved to the same party");
    eq(withOverride.guests.filter((g) => g.unmatched).length, built.report.unmatchedGuests - 2);
  });

  it("gives a buyer their own seat when the form names them, whoever they listed as purchaser", () => {
    const rows = mealRows();
    rows.push(mealRow("2026-09-07T09:00:00Z", "Paula Nieto", "Somebody Else", "paula.alt@example.org", "", RAVIOLI));
    const result = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: rows });
    const paulas = result.guests.filter((g) => normName(g.name) === "paula nieto");
    eq(paulas.length, 1, "she is not listed twice");
    eq(paulas[0].unmatched, false);
    eq(paulas[0].meal, "ravioli", "her selection landed on her own ticket");
  });

  it("counts possible duplicate names in the report", () => {
    // Paula bought once with her work address and once with a personal one, so she is in
    // the room twice and the planner needs to know before they seat both.
    const rows = ticketRows();
    rows.push(ticketRow("Paula", "Nieto", "paula.nieto@example.org", "120", BENEFACTOR));
    const dupes = buildGuestsFromRows({ ticketRows: rows, mealRows: mealRows() });
    eq(dupes.report.duplicates, 1);
    ok(dupes.report.notes.some((n) => /possible duplicate names/.test(n)));
  });

  it("returns an empty result rather than throwing on empty input", () => {
    const none = buildGuestsFromRows({});
    eq(none.guests.length, 0);
    ok(none.report.notes.length > 0);
  });
});

/* ------------------------------------------------------------------ *
 * merge
 * ------------------------------------------------------------------ */

describe("mergeGuestsIntoPlan", () => {
  it("keeps seats, tags and planner notes, and refreshes imported fields", () => {
    const first = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    let plan = makePlan([], { tableCount: 4, seats: 10 });
    plan = mergeGuestsIntoPlan(plan, first.guests).plan;
    const ana = Object.values(plan.guests).find((g) => normName(g.name) === "ana perez");
    plan.seating[ana.id] = { tableId: "t2", seat: 3 };
    plan.guests[ana.id] = { ...plan.guests[ana.id], tags: ["vip"], plannerNote: "Sits near the podium" };

    // Second import: Ana switched her entrée.
    const rows = mealRows();
    rows[1][5] = WHITEFISH;
    const second = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: rows });
    const { plan: merged, summary } = mergeGuestsIntoPlan(plan, second.guests);

    deepEq(merged.seating[ana.id], { tableId: "t2", seat: 3 }, "the seat survived");
    deepEq(merged.guests[ana.id].tags, ["vip"], "tags survived");
    eq(merged.guests[ana.id].plannerNote, "Sits near the podium", "planner note survived");
    eq(merged.guests[ana.id].meal, "whitefish", "the meal was refreshed");
    eq(summary.added, 0);
    ok(summary.updated > 0);
  });

  it("keeps a name the planner edited by hand", () => {
    const first = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    let plan = mergeGuestsIntoPlan(makePlan([], { tableCount: 4, seats: 10 }), first.guests).plan;
    const ana = Object.values(plan.guests).find((g) => normName(g.name) === "ana perez");
    plan.guests[ana.id] = { ...plan.guests[ana.id], name: "Ana Perez (board chair)", nameEdited: true };
    const merged = mergeGuestsIntoPlan(plan, first.guests).plan;
    eq(merged.guests[ana.id].name, "Ana Perez (board chair)");
  });

  it("moves a seated placeholder's seat to the guest who finally has a name", () => {
    const tRows = ticketRows();
    const first = buildGuestsFromRows({ ticketRows: tRows, mealRows: mealRows() });
    let plan = mergeGuestsIntoPlan(makePlan([], { tableCount: 4, seats: 10 }), first.guests).plan;
    const placeholder = Object.values(plan.guests).find((g) => g.name === "Guest of Ana Perez (3)");
    ok(placeholder, "the placeholder exists");
    plan.seating[placeholder.id] = { tableId: "t3", seat: 7 };

    const rows = mealRows();
    rows.push(mealRow("2026-09-06T09:00:00Z", "Pilar Arroyo", "Ana Perez", "pilar@example.org", "", SHORT_RIB));
    const second = buildGuestsFromRows({ ticketRows: tRows, mealRows: rows });
    const { plan: merged, summary } = mergeGuestsIntoPlan(plan, second.guests);

    const pilar = Object.values(merged.guests).find((g) => g.name === "Pilar Arroyo");
    ok(pilar, "the new named guest arrived");
    deepEq(merged.seating[pilar.id], { tableId: "t3", seat: 7 }, "she inherited the placeholder's seat");
    ok(!merged.guests[placeholder.id], "the placeholder was retired");
    ok(!merged.seating[placeholder.id], "and left no ghost seat");
    ok(!summary.missing.some((g) => g.id === placeholder.id), "a migrated placeholder is not reported missing");
  });

  it("keeps manual guests and reports vanished ones instead of deleting them", () => {
    const first = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    let plan = mergeGuestsIntoPlan(makePlan([], { tableCount: 4, seats: 10 }), first.guests).plan;
    const manual = mkGuest({ id: "manual-1", name: "Rosa Beltran", source: "manual" });
    plan.guests[manual.id] = manual;

    const shorter = first.guests.filter((g) => g.buyerEmail !== "luis@example.net");
    const { plan: merged, summary } = mergeGuestsIntoPlan(plan, shorter);
    ok(merged.guests["manual-1"], "manual guests are always kept");
    ok(!summary.missing.some((g) => g.source === "manual"), "manual guests are not 'missing'");
    eq(summary.missing.length, 2, "Luis and his second seat are reported, not deleted");
    ok(summary.missing.every((g) => merged.guests[g.id]), "and they stay in the plan");
  });

  it("never touches seating for guests it did not migrate", () => {
    const first = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    let plan = mergeGuestsIntoPlan(makePlan([], { tableCount: 4, seats: 10 }), first.guests).plan;
    const ids = Object.keys(plan.guests).slice(0, 5);
    ids.forEach((id, i) => { plan.seating[id] = { tableId: "t1", seat: i }; });
    const before = JSON.stringify(plan.seating);
    const merged = mergeGuestsIntoPlan(plan, first.guests).plan;
    eq(JSON.stringify(merged.seating), before);
  });
});

/* ------------------------------------------------------------------ *
 * re-import after the planner has reconciled by hand
 * ------------------------------------------------------------------ */

describe("mergeGuestsIntoPlan · claimed seats", () => {
  /** Exactly what the store's claimTicketSeat does, so the test tracks the real flow. */
  function claimSeat(plan, unmatchedId, placeholderId) {
    const guest = plan.guests[unmatchedId];
    const ph = plan.guests[placeholderId];
    ok(guest && ph, "claim needs both guests");
    const next = { ...plan, guests: { ...plan.guests }, seating: { ...plan.seating } };
    next.guests[unmatchedId] = {
      ...guest,
      partyId: ph.partyId,
      partyLabel: ph.partyLabel,
      buyerName: ph.buyerName,
      buyerEmail: ph.buyerEmail,
      ticketType: ph.ticketType,
      ticketNumbers: [...(ph.ticketNumbers || [])],
      hasDinner: ph.hasDinner,
      seatingNote: ph.seatingNote || guest.seatingNote,
      heardAbout: ph.heardAbout || guest.heardAbout,
      unmatched: false,
    };
    const seat = next.seating[placeholderId];
    if (seat) {
      next.seating[unmatchedId] = { ...seat };
      delete next.seating[placeholderId];
    }
    delete next.guests[placeholderId];
    return next;
  }

  const findBy = (plan, name) => Object.values(plan.guests).find((g) => g.name === name);
  const partySize = (plan, partyId) => Object.values(plan.guests).filter((g) => g.partyId === partyId).length;

  function importedPlan() {
    const { guests } = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    return mergeGuestsIntoPlan(makePlan([], { tableCount: 4, seats: 10 }), guests).plan;
  }

  it("keeps a claimed diner claimed when the same sheets are imported again", () => {
    let plan = importedPlan();
    const renata = findBy(plan, "Renata Ocampo");
    const placeholder = findBy(plan, "Guest of Ana Perez (3)");
    eq(renata.unmatched, true, "she starts with no ticket");
    plan.seating[placeholder.id] = { tableId: "t2", seat: 4 };
    plan = claimSeat(plan, renata.id, placeholder.id);
    eq(partySize(plan, "ana@example.org"), 3, "the party is whole right after the claim");

    const second = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    const { plan: merged, summary } = mergeGuestsIntoPlan(plan, second.guests);
    const after = merged.guests[renata.id];

    ok(after, "she is still in the plan under the same id");
    eq(after.unmatched, false, "she was not dragged back to 'no matching ticket'");
    eq(after.partyId, "ana@example.org", "she kept the ticketed party");
    eq(after.partyLabel, "Ana Perez");
    eq(after.buyerEmail, "ana@example.org");
    eq(after.ticketType, "benefactor", "and the ticket type that came with the seat");
    eq(after.hasDinner, true);
    eq(after.placeholder, false);
    eq(after.meal, "ravioli", "her entrée still comes from the dinner form");
    deepEq(merged.seating[renata.id], { tableId: "t2", seat: 4 }, "her seat did not move");
    ok(!merged.guests[placeholder.id], "the placeholder did not come back");
    eq(partySize(merged, "ana@example.org"), 3, "the party still has exactly its 3 tickets");
    eq(summary.suppressedPlaceholders, 1, "and the merge says it held one back");
  });

  it("survives a second and third re-import", () => {
    let plan = importedPlan();
    const renata = findBy(plan, "Renata Ocampo");
    plan = claimSeat(plan, renata.id, findBy(plan, "Guest of Ana Perez (3)").id);
    for (let i = 0; i < 3; i++) {
      const fresh = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
      plan = mergeGuestsIntoPlan(plan, fresh.guests).plan;
    }
    eq(plan.guests[renata.id].unmatched, false);
    eq(partySize(plan, "ana@example.org"), 3, "it does not drift by one on every import");
  });

  it("holds a whole organizer group inside a sponsor's ten seats", () => {
    const tickets = [TICKET_HEADERS];
    for (let i = 0; i < 10; i++) {
      tickets.push(ticketRow("Sofia", "Lane", "sofia@goldco.example", `3${i}`, GOLD));
    }
    const diners = ["Adela Roque", "Bruno Cifuentes", "Carla Otero", "Dario Ponce", "Eva Marquez",
      "Fidel Arregui", "Gala Pineda", "Hector Salcedo", "Iris Montano", "Julio Bastida"];
    const meals = [MEAL_HEADERS];
    diners.forEach((name, i) => meals.push(
      mealRow(`2026-09-0${(i % 9) + 1}T09:00:00Z`, name, "Community Table", `d${i}@example.org`, "", SHORT_RIB)));

    const first = buildGuestsFromRows({ ticketRows: tickets, mealRows: meals });
    let plan = mergeGuestsIntoPlan(makePlan([], { tableCount: 2, seats: 10 }), first.guests).plan;
    eq(partySize(plan, "sofia@goldco.example"), 10, "ten gold seats");
    eq(Object.values(plan.guests).filter((g) => g.unmatched).length, 10, "ten diners with no ticket");

    // Claim the nine unnamed seats; the tenth diner has nowhere to go.
    const placeholders = Object.values(plan.guests)
      .filter((g) => g.placeholder)
      .sort((a, b) => a.placeholderIndex - b.placeholderIndex);
    eq(placeholders.length, 9, "Sofia holds the first seat herself");
    const claimedNames = [];
    for (const ph of placeholders) {
      const diner = Object.values(plan.guests).find((g) => g.unmatched && diners.includes(g.name) && !claimedNames.includes(g.name));
      claimedNames.push(diner.name);
      plan = claimSeat(plan, diner.id, ph.id);
    }
    eq(partySize(plan, "sofia@goldco.example"), 10);

    const { plan: merged, summary } = mergeGuestsIntoPlan(plan, buildGuestsFromRows({ ticketRows: tickets, mealRows: meals }).guests);
    eq(partySize(merged, "sofia@goldco.example"), 10, "still exactly ten, not nineteen");
    eq(summary.suppressedPlaceholders, 9);
    eq(Object.values(merged.guests).filter((g) => g.placeholder).length, 0, "no placeholder came back");
    eq(Object.values(merged.guests).filter((g) => g.unmatched).length, 1, "the diner with no seat is still unmatched");
    for (const name of claimedNames) {
      const g = Object.values(merged.guests).find((x) => x.name === name);
      eq(g.ticketType, "gold", `${name} kept the sponsor ticket`);
      eq(g.unmatched, false);
    }
  });

  it("still adds the guest for a ticket that was bought later", () => {
    const plan = importedPlan();
    const before = partySize(plan, "ana@example.org");
    const rows = ticketRows();
    rows.push(ticketRow("Ana", "Perez", "ana@example.org", "121", BENEFACTOR));
    const { plan: merged, summary } = mergeGuestsIntoPlan(plan, buildGuestsFromRows({ ticketRows: rows, mealRows: mealRows() }).guests);
    eq(partySize(merged, "ana@example.org"), before + 1, "the new seat appeared");
    eq(summary.added, 1);
    eq(summary.suppressedPlaceholders, 0);
    ok(Object.values(merged.guests).some((g) => g.name === "Guest of Ana Perez (4)"));
  });

  it("counts a manual guest against the party's tickets", () => {
    let plan = importedPlan();
    const placeholder = findBy(plan, "Guest of Ana Perez (3)");
    delete plan.guests[placeholder.id];
    plan.guests["manual-1"] = mkGuest({
      id: "manual-1", name: "Pilar Arroyo", partyId: "ana@example.org",
      partyLabel: "Ana Perez", source: "manual",
    });
    const { plan: merged, summary } = mergeGuestsIntoPlan(plan, buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() }).guests);
    eq(partySize(merged, "ana@example.org"), 3, "the manual guest took the third seat");
    ok(!merged.guests[placeholder.id], "so the placeholder stayed away");
    eq(summary.suppressedPlaceholders, 1);
    ok(merged.guests["manual-1"], "and the manual guest is untouched");
  });

  it("still migrates a seated placeholder to the guest who finally has a name", () => {
    const tRows = ticketRows();
    let plan = importedPlan();
    const placeholder = findBy(plan, "Guest of Ana Perez (3)");
    plan.seating[placeholder.id] = { tableId: "t3", seat: 6 };

    const rows = mealRows();
    rows.push(mealRow("2026-09-06T09:00:00Z", "Pilar Arroyo", "Ana Perez", "pilar@example.org", "", SHORT_RIB));
    const { plan: merged, summary } = mergeGuestsIntoPlan(plan, buildGuestsFromRows({ ticketRows: tRows, mealRows: rows }).guests);
    const pilar = Object.values(merged.guests).find((g) => g.name === "Pilar Arroyo");
    deepEq(merged.seating[pilar.id], { tableId: "t3", seat: 6 }, "she inherited the seat");
    ok(!merged.guests[placeholder.id], "the placeholder retired");
    eq(partySize(merged, "ana@example.org"), 3, "and migration did not cost the party a seat");
    eq(summary.suppressedPlaceholders, 0, "there was no placeholder left to suppress");
  });
});

describe("mergeGuestsIntoPlan · planner edits", () => {
  it("never erases an entrée the planner chose when the sheet is blank", () => {
    const first = buildGuestsFromRows({ ticketRows: ticketRows() });   // tickets only: no meals
    let plan = mergeGuestsIntoPlan(makePlan([], { tableCount: 4, seats: 10 }), first.guests).plan;
    const guest = Object.values(plan.guests).find((g) => g.name === "Ana Perez");
    eq(guest.meal, null, "the sheet had no entrée");
    plan.guests[guest.id] = { ...plan.guests[guest.id], meal: "ravioli", mealRaw: "Asked at the door" };

    const merged = mergeGuestsIntoPlan(plan, buildGuestsFromRows({ ticketRows: ticketRows() }).guests).plan;
    eq(merged.guests[guest.id].meal, "ravioli", "the planner's entrée survived");
    eq(merged.guests[guest.id].mealRaw, "Asked at the door");
  });

  it("lets a newer sheet answer replace an older sheet answer", () => {
    const first = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    const plan = mergeGuestsIntoPlan(makePlan([], { tableCount: 4, seats: 10 }), first.guests).plan;
    const guest = Object.values(plan.guests).find((g) => g.name === "Ana Perez");
    eq(guest.meal, "short-rib");

    const rows = mealRows();
    rows[1][5] = WHITEFISH;
    const merged = mergeGuestsIntoPlan(plan, buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: rows }).guests).plan;
    eq(merged.guests[guest.id].meal, "whitefish", "the dinner form is still the source of truth");
  });

  it("honours editedFields on a ticket type the planner corrected", () => {
    const first = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    const base = mergeGuestsIntoPlan(makePlan([], { tableCount: 4, seats: 10 }), first.guests).plan;
    const tomas = Object.values(base.guests).find((g) => g.name === "Tomas Rivas");
    eq(tomas.ticketType, "supporter");
    eq(tomas.hasDinner, false);

    // The planner comped him a dinner seat and recorded both edits.
    const plan = { ...base, guests: { ...base.guests } };
    plan.guests[tomas.id] = {
      ...tomas, ticketType: "comp", hasDinner: true, editedFields: ["ticketType", "hasDinner"],
    };
    const merged = mergeGuestsIntoPlan(plan, first.guests).plan;
    eq(merged.guests[tomas.id].ticketType, "comp", "the correction stuck");
    eq(merged.guests[tomas.id].hasDinner, true);
    deepEq(merged.guests[tomas.id].editedFields, ["ticketType", "hasDinner"], "and is remembered for next time");

    // Only what was recorded is protected.
    const partial = { ...base, guests: { ...base.guests } };
    partial.guests[tomas.id] = { ...tomas, ticketType: "comp", hasDinner: true, editedFields: ["ticketType"] };
    const merged2 = mergeGuestsIntoPlan(partial, first.guests).plan;
    eq(merged2.guests[tomas.id].ticketType, "comp");
    eq(merged2.guests[tomas.id].hasDinner, false, "hasDinner was not listed, so the sheet wins");
  });

  it("protects an entrée listed in editedFields even from a real sheet answer", () => {
    const first = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    const base = mergeGuestsIntoPlan(makePlan([], { tableCount: 4, seats: 10 }), first.guests).plan;
    const ana = Object.values(base.guests).find((g) => g.name === "Ana Perez");
    const plan = { ...base, guests: { ...base.guests } };
    plan.guests[ana.id] = { ...ana, meal: "ravioli", mealRaw: "Allergy, swapped by phone", editedFields: ["meal"] };

    const rows = mealRows();
    rows[1][5] = WHITEFISH;
    const merged = mergeGuestsIntoPlan(plan, buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: rows }).guests).plan;
    eq(merged.guests[ana.id].meal, "ravioli", "the planner outranks the form once they have said so");
    eq(merged.guests[ana.id].mealRaw, "Allergy, swapped by phone", "and the note that goes with it");
  });

  it("does not mutate the plan it was given", () => {
    const first = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    const plan = mergeGuestsIntoPlan(makePlan([], { tableCount: 4, seats: 10 }), first.guests).plan;
    const before = JSON.stringify(plan);
    mergeGuestsIntoPlan(plan, buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() }).guests);
    eq(JSON.stringify(plan), before);
  });
});

/* ------------------------------------------------------------------ *
 * preferences
 * ------------------------------------------------------------------ */

describe("preferences", () => {
  const DZ = "dz@example.com";
  function prefWorld() {
    const targets = [
      ["Edgar Gonzalez"], ["Mariana Soto"], ["Juan Pablo del Rincon"], ["Jiana Ortiz"],
      ["Sarah Esparza"], ["Henry Palmer"], ["Viviana Navarro"], ["Evelyn Cortes"],
      ["Brenda Cruz"], ["Elizabeth Fuentes"], ["Veronica Salas"], ["Margarita Pena"],
      ["Estevan Rios"], ["Giselle Mora"], ["Jessica Nava"], ["Anabel Ruiz"],
      ["Xochitl Barron"], ["Brad Johnson"], ["Ana Lima"],
    ].map(([name], i) => mkGuest({ id: `t${i}`, name }));

    const dinorah = mkGuest({
      id: "dz", name: "Delia Zamora", partyId: DZ, partyLabel: "Delia Zamora",
      buyerName: "Delia Zamora", buyerEmail: DZ,
    });
    const paula = mkGuest({
      id: "chubb-other", name: "Paula Nieto", buyerEmail: "paula@chubb.example",
      heardAbout: "A Chubb colleague invited me",
    });

    const askers = [
      mkGuest({ id: "a1", name: "Ana Perez", seatingNote: "State Representative Edgar Gonzalez, Jr." }),
      mkGuest({ id: "a2", name: "Marcos Diaz", buyerEmail: "marcos@chubb.example", heardAbout: "I work at Chubb", seatingNote: "no preference but seat with the Chubb people." }),
      mkGuest({ id: "a3", name: "Sofia Lane", seatingNote: "Mariana Soto & Juan Pablo del Rincon" }),
      mkGuest({ id: "a4", name: "Nadia Cruz", seatingNote: "YTT '26 cohort people" }),
      mkGuest({ id: "a5", name: "Omar Vela", seatingNote: "With or near any LSP YTT 26' Peers :D" }),
      mkGuest({ id: "a6", name: "Pia Rueda", seatingNote: "YTT" }),
      mkGuest({ id: "a7", name: "Rosa Beltran", seatingNote: "With Jiana" }),
      mkGuest({ id: "a8", name: "Tania Mesa", seatingNote: "Sarah Esparza + Henry Palmer" }),
      mkGuest({ id: "a9", name: "Ulises Paz", seatingNote: "Viviana Navarro, Evelyn Cortes" }),
      mkGuest({ id: "a10", name: "Vera Lugo", seatingNote: "Ideally, Brenda, Liz, Vero, Margarita ✨" }),
      mkGuest({ id: "a11", name: "Wendy Sosa", seatingNote: "Estevan, Gigi, Jess, Anabel, Xochyl" }),
      mkGuest({ id: "a12", name: "Yara Toledo", seatingNote: "seat with tickets Delia Zamora purchased." }),
      mkGuest({ id: "a13", name: "Zeta Mendez", seatingNote: "Same as number one!" }),
      mkGuest({ id: "a14", name: "Abel Quinn", seatingNote: "Brad Johnson" }),
      mkGuest({ id: "a15", name: "Bea Solis", seatingNote: "Whoever Nobodyknows" }),
      mkGuest({ id: "a16", name: "Cleo Vance", seatingNote: "Ana" }),
      mkGuest({ id: "a17", name: "Dora Nunez", seatingNote: "Brad Johnson and Whoever Nobodyknows" }),
      mkGuest({ id: "a18", name: "Elsa Prieto", seatingNote: "" }),
    ];
    return resolvePreferences([...targets, dinorah, paula, ...askers]);
  }

  const world = prefWorld();
  const by = (id) => world.find((g) => g.id === id);
  const named = (name) => world.find((g) => g.name === name).id;

  it("splits on commas, ampersands, plus signs and 'and'", () => {
    deepEq(splitFragments("Sarah Esparza + Henry Palmer"), ["Sarah Esparza", "Henry Palmer"]);
    deepEq(splitFragments("Viviana Navarro, Evelyn Cortes"), ["Viviana Navarro", "Evelyn Cortes"]);
  });

  it("strips titles and suffixes before splitting", () => {
    deepEq(splitFragments("State Representative Edgar Gonzalez, Jr."), ["Edgar Gonzalez"]);
    deepEq(by("a1").prefs.withGuestIds, [named("Edgar Gonzalez")]);
    eq(by("a1").prefs.status, "resolved");
  });

  it("turns an organization mentioned by other guests into a group", () => {
    deepEq(by("a2").prefs.groups, ["chubb"]);
    eq(by("a2").prefs.unresolved.length, 0, "'no preference but' is filler, not an unresolved fragment");
    const members = groupMembers(world, "chubb").map((g) => g.id).sort();
    deepEq(members, ["a2", "chubb-other"], "membership follows the domain and the 'how did you hear' answer");
  });

  it("recognises YTT in all its spellings", () => {
    for (const id of ["a4", "a5", "a6"]) deepEq(by(id).prefs.groups, ["ytt26"], `guest ${id}`);
    eq(groupMembers(world, "ytt26").length, 3);
  });

  it("resolves two full names joined by an ampersand", () => {
    deepEq(by("a3").prefs.withGuestIds.sort(), [named("Mariana Soto"), named("Juan Pablo del Rincon")].sort());
  });

  it("resolves a single first name only when it is unique", () => {
    deepEq(by("a7").prefs.withGuestIds, [named("Jiana Ortiz")]);
    deepEq(by("a16").prefs.withGuestIds, [], "two guests are called Ana, so it stays for a human");
    deepEq(by("a16").prefs.unresolved, ["Ana"]);
    eq(by("a16").prefs.status, "unresolved");
  });

  it("knows common nicknames", () => {
    deepEq(by("a10").prefs.withGuestIds.sort(),
      [named("Brenda Cruz"), named("Elizabeth Fuentes"), named("Veronica Salas"), named("Margarita Pena")].sort());
    deepEq(by("a11").prefs.withGuestIds.sort(),
      [named("Estevan Rios"), named("Giselle Mora"), named("Jessica Nava"), named("Anabel Ruiz"), named("Xochitl Barron")].sort());
  });

  it("resolves \"tickets X purchased\" to that party", () => {
    deepEq(by("a12").prefs.withPartyIds, [DZ]);
    eq(by("a12").prefs.withGuestIds.length, 0);
  });

  it("treats a leftover \"same as number one\" as no preference", () => {
    eq(by("a13").prefs.status, "none");
  });

  it("reports what it could not match", () => {
    deepEq(by("a15").prefs.unresolved, ["Whoever Nobodyknows"]);
    eq(by("a15").prefs.status, "unresolved");
    eq(by("a17").prefs.status, "partial");
    deepEq(by("a17").prefs.withGuestIds, [named("Brad Johnson")]);
    deepEq(by("a17").prefs.unresolved, ["Whoever Nobodyknows"]);
    eq(by("a18").prefs.status, "none");
  });

  it("ignores the conversational tail around a name it did resolve", () => {
    const [asker] = resolvePreferences([
      mkGuest({ id: "p1", name: "Rosa Beltran", seatingNote: "Please seat us with Mariana Soto's group, we are coming together." }),
      mkGuest({ id: "p2", name: "Mariana Soto" }),
    ]);
    deepEq(asker.prefs.withGuestIds, ["p2"]);
    deepEq(asker.prefs.unresolved, [], "'we are coming together' is prose, not a missing guest");
    eq(asker.prefs.status, "resolved");
  });

  it("flags a whole note once when none of it resolves", () => {
    const [asker] = resolvePreferences([
      mkGuest({ id: "p1", name: "Rosa Beltran", seatingNote: "Anywhere is fine, thank you for a beautiful evening." }),
    ]);
    eq(asker.prefs.unresolved.length, 1, "one flag, not one per clause");
    eq(asker.prefs.unresolved[0], "Anywhere is fine, thank you for a beautiful evening.");
    eq(asker.prefs.status, "unresolved");
  });

  it("still flags a capitalized reference it could not place", () => {
    const [asker] = resolvePreferences([
      mkGuest({ id: "p1", name: "Rosa Beltran", seatingNote: "We are with the Morales group." }),
    ]);
    deepEq(asker.prefs.unresolved, ["the Morales group"]);
  });

  it("says nothing at all about a plain \"no preference\"", () => {
    for (const note of ["No preference.", "no preference", "N/A", "none"]) {
      const [g] = resolvePreferences([mkGuest({ name: "Rosa Beltran", seatingNote: note })]);
      eq(g.prefs.status, "none", `note: ${note}`);
      deepEq(g.prefs.unresolved, [], `note: ${note}`);
    }
  });

  it("never links a guest to themself", () => {
    const [self] = resolvePreferences([mkGuest({ id: "self", name: "Nora Vidal", seatingNote: "Nora Vidal" })]);
    deepEq(self.prefs.withGuestIds, []);
  });

  it("does not mutate the guests handed to it", () => {
    const original = mkGuest({ name: "Iris Cano", seatingNote: "Brad Johnson" });
    const snapshot = JSON.stringify(original);
    resolvePreferences([original, mkGuest({ name: "Brad Johnson" })]);
    eq(JSON.stringify(original), snapshot);
  });

  it("resolves the real imported notes end to end", () => {
    const { guests } = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    const ana = guests.find((g) => g.name === "Ana Perez");
    deepEq(ana.prefs.withGuestIds, [guests.find((g) => g.name === "Edgar Gonzalez").id]);
    const sofia = guests.find((g) => g.name === "Sofia Lane");
    deepEq(sofia.prefs.withPartyIds, ["dz@example.com"]);
    const marcos = guests.find((g) => g.name === "Marcos Diaz");
    deepEq(marcos.prefs.groups, ["chubb"]);
    const dinorah = guests.find((g) => g.name === "Delia Zamora");
    deepEq(dinorah.prefs.groups, ["ytt26"]);
  });
});

/* ------------------------------------------------------------------ *
 * warnings
 * ------------------------------------------------------------------ */

describe("warnings", () => {
  it("flags a guest seated away from the person they asked for", () => {
    const luis = mkGuest({ name: "Luis Ramos" });
    const ana = mkGuest({ name: "Ana Perez", prefs: { ...emptyPrefs(), status: "resolved", withGuestIds: [luis.id] } });
    const plan = makePlan([ana, luis]);
    seatAt(plan, ana.id, "t1", 0);
    seatAt(plan, luis.id, "t2", 0);
    const w = computeWarnings(plan).find((x) => x.type === "pref-separated");
    ok(w, "a pref-separated warning");
    eq(w.severity, "warn");
    eq(w.message, "Ana asked to sit with Luis, who is at Table 2.");
    eq(w.key, `pref-separated:${ana.id}:${luis.id}`);
  });

  it("is quiet when they sit together", () => {
    const luis = mkGuest({ name: "Luis Ramos" });
    const ana = mkGuest({ name: "Ana Perez", prefs: { ...emptyPrefs(), withGuestIds: [luis.id] } });
    const plan = makePlan([ana, luis]);
    seatAt(plan, ana.id, "t1", 0);
    seatAt(plan, luis.id, "t1", 1);
    ok(!typesOf(computeWarnings(plan)).includes("pref-separated"));
  });

  it("says when the requested person is not seated yet", () => {
    const luis = mkGuest({ name: "Luis Ramos" });
    const ana = mkGuest({ name: "Ana Perez", prefs: { ...emptyPrefs(), withGuestIds: [luis.id] } });
    const plan = makePlan([ana, luis]);
    seatAt(plan, ana.id, "t1", 0);
    const w = computeWarnings(plan).find((x) => x.type === "pref-pending");
    ok(w);
    eq(w.severity, "info");
  });

  it("quotes a note it could not resolve", () => {
    const ana = mkGuest({
      name: "Ana Perez", seatingNote: "Whoever Nobodyknows",
      prefs: { ...emptyPrefs(), status: "unresolved", unresolved: ["Whoever Nobodyknows"] },
    });
    const plan = makePlan([ana]);
    const w = computeWarnings(plan).find((x) => x.type === "pref-unresolved");
    ok(w && w.message.includes('"Whoever Nobodyknows"'), w && w.message);
    eq(w.severity, "info");
  });

  it("flags a guest cut off from their group", () => {
    const a = mkGuest({ name: "Nadia Cruz", prefs: { ...emptyPrefs(), groups: ["ytt26"] } });
    const b = mkGuest({ name: "Omar Vela", prefs: { ...emptyPrefs(), groups: ["ytt26"] } });
    const plan = makePlan([a, b]);
    seatAt(plan, a.id, "t1", 0);
    seatAt(plan, b.id, "t2", 0);
    const w = computeWarnings(plan).filter((x) => x.type === "group-isolated");
    eq(w.length, 2, "both of them are alone");
    eq(w[0].severity, "warn");
    seatAt(plan, b.id, "t1", 1);
    eq(computeWarnings(plan).filter((x) => x.type === "group-isolated").length, 0);
  });

  it("flags a party split across tables, and a sponsor party separately", () => {
    const p = "buyer@example.org";
    const a = mkGuest({ name: "Ana Perez", partyId: p, partyLabel: "Ana Perez" });
    const b = mkGuest({ name: "Guest of Ana Perez (2)", partyId: p, partyLabel: "Ana Perez", placeholder: true });
    const plan = makePlan([a, b]);
    seatAt(plan, a.id, "t1", 0);
    seatAt(plan, b.id, "t2", 0);
    const split = computeWarnings(plan).find((x) => x.type === "party-split");
    ok(split);
    eq(split.key, `party-split:${p}`);

    const s1 = mkGuest({ name: "Sofia Lane", partyId: "gold@example.org", partyLabel: "Sofia Lane", ticketType: "gold" });
    const s2 = mkGuest({ name: "Guest of Sofia Lane (2)", partyId: "gold@example.org", partyLabel: "Sofia Lane", ticketType: "gold" });
    const plan2 = makePlan([s1, s2]);
    seatAt(plan2, s1.id, "t1", 0);
    seatAt(plan2, s2.id, "t2", 0);
    const types = typesOf(computeWarnings(plan2));
    has(types, "sponsor-split");
    ok(!types.includes("party-split"), "sponsor-split replaces party-split");
  });

  it("does not scold a party that is bigger than any table", () => {
    const party = "big@example.org";
    const guests = Array.from({ length: 6 }, (_, i) => mkGuest({ name: `Guest ${i}`, partyId: party, partyLabel: "Big Party" }));
    const plan = makePlan(guests, { tableCount: 3, seats: 4 });
    guests.forEach((g, i) => seatAt(plan, g.id, i < 4 ? "t1" : "t2", i % 4));
    ok(!typesOf(computeWarnings(plan)).includes("party-split"));
  });

  it("treats a seated late-night ticket as an error", () => {
    const g = mkGuest({ name: "Tomas Rivas", hasDinner: false, meal: null, ticketType: "supporter" });
    const plan = makePlan([g]);
    seatAt(plan, g.id, "t1", 0);
    const w = computeWarnings(plan).find((x) => x.type === "late-night-seated");
    ok(w);
    eq(w.severity, "error");
    ok(!typesOf(computeWarnings(plan)).includes("no-meal"), "no entrée is expected for a late-night ticket");
  });

  it("notes a seated dinner guest with no entrée", () => {
    const g = mkGuest({ name: "Ana Perez", meal: null });
    const plan = makePlan([g]);
    seatAt(plan, g.id, "t1", 0);
    const w = computeWarnings(plan).find((x) => x.type === "no-meal");
    ok(w);
    eq(w.severity, "info");
  });

  it("catches an over-full table", () => {
    const guests = Array.from({ length: 5 }, (_, i) => mkGuest({ name: `Guest ${i}` }));
    const plan = makePlan(guests, { tableCount: 2, seats: 4 });
    guests.forEach((g, i) => seatAt(plan, g.id, "t1", i));
    const w = computeWarnings(plan).find((x) => x.type === "over-capacity");
    ok(w);
    eq(w.severity, "error");
  });

  it("honors keep-apart and keep-together", () => {
    const a = mkGuest({ name: "Ana Perez" });
    const b = mkGuest({ name: "Luis Ramos" });
    const plan = makePlan([a, b]);
    plan.constraints = [{ id: "c1", type: "apart", guestIds: [a.id, b.id], note: "" }];
    seatAt(plan, a.id, "t1", 0);
    seatAt(plan, b.id, "t1", 1);
    const apart = computeWarnings(plan).find((x) => x.type === "apart-violated");
    ok(apart);
    eq(apart.severity, "error");

    plan.constraints = [{ id: "c2", type: "together", guestIds: [a.id, b.id], note: "" }];
    seatAt(plan, b.id, "t2", 0);
    const together = computeWarnings(plan).find((x) => x.type === "together-violated");
    ok(together);
    eq(together.severity, "warn");
  });

  it("points at possible duplicates and at responses with no ticket", () => {
    const a = mkGuest({ name: "Ana Perez" });
    const b = mkGuest({ name: "ana  perez" });
    const c = mkGuest({ name: "Renata Ocampo", unmatched: true, partyLabel: "Community Table" });
    const plan = makePlan([a, b, c]);
    const types = typesOf(computeWarnings(plan));
    has(types, "duplicate-name");
    has(types, "unmatched-guest");
  });

  it("covers every documented warning type in one plan", () => {
    const seen = new Set();
    const luis = mkGuest({ name: "Luis Ramos", partyId: "luis@example.org", partyLabel: "Luis Ramos" });
    const luis2 = mkGuest({ name: "Elena Ramos", partyId: "luis@example.org", partyLabel: "Luis Ramos" });
    const groupMate = mkGuest({ name: "Omar Vela", prefs: { ...emptyPrefs(), groups: ["ytt26"] } });
    const pending = mkGuest({ name: "Pia Rueda" });
    const ana = mkGuest({
      name: "Ana Perez", seatingNote: "Whoever Nobodyknows",
      prefs: { ...emptyPrefs(), status: "partial", withGuestIds: [luis.id, pending.id], groups: ["ytt26"], unresolved: ["Whoever Nobodyknows"] },
    });
    const late = mkGuest({ name: "Tomas Rivas", hasDinner: false, meal: null });
    const noMeal = mkGuest({ name: "Vera Lugo", meal: null });
    const dupe = mkGuest({ name: "Vera Lugo", meal: "ravioli" });
    const unmatched = mkGuest({ name: "Renata Ocampo", unmatched: true });
    const gold1 = mkGuest({ name: "Sofia Lane", partyId: "gold@example.org", partyLabel: "Sofia Lane", ticketType: "gold" });
    const gold2 = mkGuest({ name: "Guest of Sofia Lane (2)", partyId: "gold@example.org", partyLabel: "Sofia Lane", ticketType: "gold" });
    const apartA = mkGuest({ name: "Hugo Barrera" });
    const apartB = mkGuest({ name: "Bea Solis" });
    const togA = mkGuest({ name: "Cleo Vance" });
    const togB = mkGuest({ name: "Dora Nunez" });

    const all = [luis, luis2, groupMate, pending, ana, late, noMeal, dupe, unmatched, gold1, gold2, apartA, apartB, togA, togB];
    const plan = makePlan(all, { tableCount: 4, seats: 4 });
    plan.constraints = [
      { id: "c1", type: "apart", guestIds: [apartA.id, apartB.id], note: "" },
      { id: "c2", type: "together", guestIds: [togA.id, togB.id], note: "" },
    ];
    seatAt(plan, ana.id, "t1", 0);
    seatAt(plan, luis.id, "t2", 0);
    seatAt(plan, luis2.id, "t3", 0);
    seatAt(plan, groupMate.id, "t2", 1);
    seatAt(plan, late.id, "t1", 1);
    seatAt(plan, noMeal.id, "t1", 2);
    seatAt(plan, dupe.id, "t1", 3);
    seatAt(plan, unmatched.id, "t4", 0);
    seatAt(plan, gold1.id, "t3", 1);
    seatAt(plan, gold2.id, "t4", 1);
    seatAt(plan, apartA.id, "t2", 2);
    seatAt(plan, apartB.id, "t2", 3);
    seatAt(plan, togA.id, "t3", 2);
    seatAt(plan, togB.id, "t4", 2);
    // one seat too many on t1
    plan.seating.extra = { tableId: "t1", seat: 4 };
    plan.guests.extra = mkGuest({ id: "extra", name: "Iris Cano" });

    for (const w of computeWarnings(plan)) seen.add(w.type);
    for (const type of [
      "pref-separated", "pref-pending", "pref-unresolved", "group-isolated", "party-split",
      "sponsor-split", "late-night-seated", "no-meal", "over-capacity", "apart-violated",
      "together-violated", "duplicate-name", "unmatched-guest",
    ]) ok(seen.has(type), `missing warning type: ${type}`);
  });

  it("indexes by guest, by table and by severity", () => {
    const luis = mkGuest({ name: "Luis Ramos" });
    const ana = mkGuest({ name: "Ana Perez", prefs: { ...emptyPrefs(), withGuestIds: [luis.id] } });
    const plan = makePlan([ana, luis]);
    seatAt(plan, ana.id, "t1", 0);
    seatAt(plan, luis.id, "t2", 0);
    const idx = indexWarnings(computeWarnings(plan));
    ok(idx.byGuest[ana.id].length >= 1);
    ok(idx.byTable.t1.length >= 1);
    eq(idx.counts.warn >= 1, true);
    eq(idx.all.length, idx.counts.error + idx.counts.warn + idx.counts.info);
  });

  it("keeps dismissed warnings in the list (the store filters them)", () => {
    const g = mkGuest({ name: "Ana Perez", meal: null });
    const plan = makePlan([g]);
    seatAt(plan, g.id, "t1", 0);
    plan.dismissed = { [`no-meal:${g.id}`]: true };
    ok(typesOf(computeWarnings(plan)).includes("no-meal"));
  });
});

/* ------------------------------------------------------------------ *
 * previewPlacement
 * ------------------------------------------------------------------ */

describe("previewPlacement", () => {
  it("returns only what is new about this table", () => {
    const luis = mkGuest({ name: "Luis Ramos" });
    const ana = mkGuest({ name: "Ana Perez", prefs: { ...emptyPrefs(), withGuestIds: [luis.id] }, meal: null });
    const plan = makePlan([ana, luis]);
    seatAt(plan, luis.id, "t2", 0);

    const bad = previewPlacement(plan, ana.id, "t1");
    has(typesOf(bad), "pref-separated");
    has(typesOf(bad), "no-meal");

    const good = previewPlacement(plan, ana.id, "t2");
    ok(!typesOf(good).includes("pref-separated"), "sitting with Luis creates no separation warning");
  });

  it("says nothing new when the guest is already there", () => {
    const g = mkGuest({ name: "Ana Perez", meal: null });
    const plan = makePlan([g]);
    seatAt(plan, g.id, "t1", 0);
    deepEq(previewPlacement(plan, g.id, "t1"), [], "no-meal is already true, so it is not new");
  });

  it("warns that a full table cannot take another guest", () => {
    const sitters = Array.from({ length: 4 }, (_, i) => mkGuest({ name: `Guest ${i}` }));
    const mover = mkGuest({ name: "Ana Perez" });
    const plan = makePlan([...sitters, mover], { tableCount: 2, seats: 4 });
    sitters.forEach((g, i) => seatAt(plan, g.id, "t1", i));
    const w = previewPlacement(plan, mover.id, "t1");
    const full = w.find((x) => x.key === "table-full:t1");
    ok(full, "a table-full error");
    eq(full.severity, "error");
  });

  it("does not change the plan", () => {
    const g = mkGuest({ name: "Ana Perez" });
    const plan = makePlan([g]);
    const before = JSON.stringify(plan);
    previewPlacement(plan, g.id, "t2");
    eq(JSON.stringify(plan), before);
  });
});

/* ------------------------------------------------------------------ *
 * autoSeat
 * ------------------------------------------------------------------ */

function capacityOk(plan) {
  const counts = new Map();
  for (const s of Object.values(plan.seating)) counts.set(s.tableId, (counts.get(s.tableId) || 0) + 1);
  for (const t of plan.tables) if ((counts.get(t.id) || 0) > t.seats) return false;
  const seats = new Set();
  for (const s of Object.values(plan.seating)) {
    const key = `${s.tableId}:${s.seat}`;
    if (seats.has(key)) return false;
    seats.add(key);
  }
  return true;
}

describe("autoSeat", () => {
  it("never exceeds a table's capacity and never double-books a seat", () => {
    const guests = Array.from({ length: 14 }, (_, i) => mkGuest({ name: `Guest ${i}` }));
    const plan = makePlan(guests, { tableCount: 3, seats: 4 });
    const result = autoSeat(plan, {});
    ok(capacityOk(result.plan), "capacity respected");
    eq(result.placed, 3 * 4, "every seat in this small room");
    eq(result.skipped.length, 2);
    ok(result.skipped.every((s) => typeof s.reason === "string" && s.reason.length > 0));
  });

  it("leaves locked tables alone", () => {
    const guests = Array.from({ length: 6 }, (_, i) => mkGuest({ name: `Guest ${i}` }));
    const plan = makePlan(guests, { tableCount: 3, seats: 4 });
    plan.tables[0].locked = true;
    const result = autoSeat(plan, {});
    ok(!Object.values(result.plan.seating).some((s) => s.tableId === "t1"), "nothing landed on the locked table");
  });

  it("keeps guests who already have a seat where they are", () => {
    const guests = Array.from({ length: 5 }, (_, i) => mkGuest({ name: `Guest ${i}` }));
    const plan = makePlan(guests, { tableCount: 3, seats: 4 });
    seatAt(plan, guests[0].id, "t3", 2);
    const result = autoSeat(plan, { onlyUnseated: true });
    deepEq(result.plan.seating[guests[0].id], { tableId: "t3", seat: 2 });
  });

  it("honors keep-apart", () => {
    const a = mkGuest({ name: "Hugo Barrera" });
    const b = mkGuest({ name: "Bea Solis" });
    const plan = makePlan([a, b], { tableCount: 2, seats: 4 });
    plan.constraints = [{ id: "c1", type: "apart", guestIds: [a.id, b.id], note: "" }];
    const result = autoSeat(plan, {});
    const ta = result.plan.seating[a.id];
    const tb = result.plan.seating[b.id];
    ok(ta && tb, "both were seated");
    ok(ta.tableId !== tb.tableId, "on different tables");
  });

  it("keeps a party together when it fits", () => {
    const party = "ana@example.org";
    const members = Array.from({ length: 3 }, (_, i) =>
      mkGuest({ name: `Party member ${i}`, partyId: party, partyLabel: "Ana Perez" }));
    const others = Array.from({ length: 4 }, (_, i) => mkGuest({ name: `Other ${i}` }));
    const plan = makePlan([...members, ...others], { tableCount: 3, seats: 4 });
    const result = autoSeat(plan, {});
    const tables = new Set(members.map((m) => result.plan.seating[m.id].tableId));
    eq(tables.size, 1, "the party landed on one table");
  });

  it("seats a sponsor block on its own table", () => {
    const gold = Array.from({ length: 4 }, (_, i) =>
      mkGuest({ name: `Gold seat ${i}`, partyId: "gold@example.org", partyLabel: "Sofia Lane", ticketType: "gold" }));
    const others = Array.from({ length: 4 }, (_, i) => mkGuest({ name: `Other ${i}` }));
    const plan = makePlan([...gold, ...others], { tableCount: 3, seats: 4 });
    const result = autoSeat(plan, {});
    const goldTables = new Set(gold.map((g) => result.plan.seating[g.id].tableId));
    eq(goldTables.size, 1);
    const otherTables = new Set(others.map((g) => result.plan.seating[g.id].tableId));
    ok(!otherTables.has([...goldTables][0]), "no stranger was dropped onto the sponsor table");
  });

  it("skips late-night tickets unless asked", () => {
    const late = mkGuest({ name: "Tomas Rivas", hasDinner: false });
    const normal = mkGuest({ name: "Ana Perez" });
    const plan = makePlan([late, normal], { tableCount: 2, seats: 4 });
    const a = autoSeat(plan, {});
    ok(!a.plan.seating[late.id], "not seated by default");
    ok(a.skipped.some((s) => s.guestId === late.id && /late night/i.test(s.reason)));
    const b = autoSeat(plan, { includeLateNight: true });
    ok(b.plan.seating[late.id], "seated when asked");
  });

  it("puts people who asked for each other on one table", () => {
    const luis = mkGuest({ name: "Luis Ramos" });
    const ana = mkGuest({ name: "Ana Perez", prefs: { ...emptyPrefs(), withGuestIds: [luis.id] } });
    const filler = Array.from({ length: 6 }, (_, i) => mkGuest({ name: `Other ${i}` }));
    const plan = makePlan([ana, luis, ...filler], { tableCount: 3, seats: 4 });
    const result = autoSeat(plan, {});
    eq(result.plan.seating[ana.id].tableId, result.plan.seating[luis.id].tableId);
  });

  it("is deterministic and does not mutate the plan", () => {
    const guests = Array.from({ length: 9 }, (_, i) => mkGuest({ name: `Guest ${i}` }));
    const plan = makePlan(guests, { tableCount: 3, seats: 4 });
    const before = JSON.stringify(plan);
    const a = autoSeat(plan, {});
    const b = autoSeat(plan, {});
    eq(JSON.stringify(plan), before, "input untouched");
    deepEq(a.plan.seating, b.plan.seating, "same input, same output");
  });

  it("reports where every guest went and why", () => {
    const gold = Array.from({ length: 2 }, (_, i) =>
      mkGuest({ name: `Gold seat ${i}`, partyId: "gold@example.org", partyLabel: "Sofia Lane", ticketType: "gold" }));
    const luis = mkGuest({ name: "Luis Ramos" });
    const ana = mkGuest({ name: "Ana Perez", prefs: { ...emptyPrefs(), withGuestIds: [luis.id] } });
    const ytt1 = mkGuest({ name: "Nadia Cruz", prefs: { ...emptyPrefs(), groups: ["ytt26"] } });
    const ytt2 = mkGuest({ name: "Omar Vela", prefs: { ...emptyPrefs(), groups: ["ytt26"] } });
    const plain = mkGuest({ name: "Bea Solis" });
    const plan = makePlan([...gold, luis, ana, ytt1, ytt2, plain], { tableCount: 3, seats: 4 });
    const result = autoSeat(plan, {});

    eq(result.placements.length, result.placed);
    ok(result.placements.every((p) => p.guestId && p.tableId && Number.isInteger(p.seat) && p.reason),
      "every placement carries a seat and a reason");
    const reasonFor = (g) => result.placements.find((p) => p.guestId === g.id).reason;
    eq(reasonFor(gold[0]), "Gold sponsor, front table");
    eq(reasonFor(ana), "asked to sit with Luis Ramos");
    ok(/YTT '26 group/.test(reasonFor(ytt1)), `got: ${reasonFor(ytt1)}`);
    eq(reasonFor(gold[1]), "Gold sponsor, front table", "the sponsor's second seat says the same");
    eq(reasonFor(plain), "filled from the front");
    // Deterministic order: by table number, then seat.
    const order = result.placements.map((p) => `${p.tableId}:${p.seat}`);
    deepEq(order, order.slice().sort((a, b) => a.localeCompare(b, "en", { numeric: true })));
  });

  it("names a VIP and a speaker as the reason they are up front", () => {
    const speaker = mkGuest({ name: "Renata Ocampo", tags: ["speaker"] });
    const vip = mkGuest({ name: "Hugo Barrera", tags: ["vip"] });
    const rest = Array.from({ length: 6 }, (_, i) => mkGuest({ name: `Other ${i}` }));
    const plan = makePlan([...rest, speaker, vip], { tableCount: 3, seats: 4 });
    const result = autoSeat(plan, {});
    const reasonFor = (g) => result.placements.find((p) => p.guestId === g.id).reason;
    eq(reasonFor(speaker), "Speaker, near the podium");
    eq(reasonFor(vip), "VIP, front table");
    const ranks = new Map(rankTables(plan).map((r) => [r.tableId, r.rank]));
    ok(ranks.get(result.plan.seating[speaker.id].tableId) <= 2, "the speaker is near the front");
  });

  it("splits an oversized cluster along party lines", () => {
    const partyA = Array.from({ length: 3 }, (_, i) =>
      mkGuest({ name: `A${i}`, partyId: "a@example.org", partyLabel: "Ana Perez" }));
    const partyB = Array.from({ length: 3 }, (_, i) =>
      mkGuest({ name: `B${i}`, partyId: "b@example.org", partyLabel: "Luis Ramos" }));
    // A asks for B, which would make a cluster of 6 on tables of 4.
    partyA[0].prefs = { ...emptyPrefs(), withGuestIds: [partyB[0].id] };
    const plan = makePlan([...partyA, ...partyB], { tableCount: 3, seats: 4 });
    const result = autoSeat(plan, {});
    ok(capacityOk(result.plan));
    eq(new Set(partyA.map((g) => result.plan.seating[g.id].tableId)).size, 1, "party A stayed whole");
    eq(new Set(partyB.map((g) => result.plan.seating[g.id].tableId)).size, 1, "party B stayed whole");
  });
});

/* ------------------------------------------------------------------ *
 * position-aware seating
 * ------------------------------------------------------------------ */

describe("rankTables", () => {
  it("ranks the default room by closeness to the podium", () => {
    const plan = createDefaultPlan();
    const ranked = rankTables(plan);
    eq(ranked.length, plan.tables.length);
    deepEq(ranked.map((r) => r.rank), ranked.map((_, i) => i + 1), "ranks run 1..n with no gaps");
    ok(ranked.every((r, i) => i === 0 || r.score >= ranked[i - 1].score), "scores never go backwards");
    const numberOf = (tableId) => plan.tables.find((t) => t.id === tableId).number;
    // The default room is a long hall: two rows, the podium in a gap in the front row. The two
    // front-row tables flanking the podium beat everything, and a far corner comes last.
    const front = ranked.slice(0, 2).map((r) => numberOf(r.tableId)).sort((a, b) => a - b);
    deepEq(front, [3, 4], "tables 3 and 4 flank the podium");
    const back = numberOf(ranked[ranked.length - 1].tableId);
    ok([1, 7, 8, 15].includes(back), `the worst table is a far corner, got ${back}`);
  });

  it("breaks an exact tie on table number", () => {
    const plan = createDefaultPlan();
    const ranked = rankTables(plan);
    const byId = new Map(plan.tables.map((t) => [t.id, t]));
    for (let i = 1; i < ranked.length; i++) {
      if (ranked[i].score === ranked[i - 1].score) {
        ok(byId.get(ranked[i - 1].tableId).number < byId.get(ranked[i].tableId).number,
          "the lower table number comes first");
      }
    }
    // Force an exact tie: two tables mirrored around a centred podium.
    const tied = createDefaultPlan();
    tied.fixtures = [{ id: "podium", type: "podium", label: "", x: tied.room.width / 2, y: 100, w: 190, h: 64 }];
    tied.tables = [
      { id: "right", number: 2, name: "", x: tied.room.width / 2 + 300, y: 300, seats: 10, locked: false, note: "" },
      { id: "left", number: 1, name: "", x: tied.room.width / 2 - 300, y: 300, seats: 10, locked: false, note: "" },
    ];
    const tr = rankTables(tied);
    eq(tr[0].score, tr[1].score, "mirrored tables tie exactly");
    eq(tr[0].tableId, "left", "the lower table number wins the tie");
  });

  it("measures to the nearest edge of the dance floor, not its centre", () => {
    const plan = createDefaultPlan();
    plan.fixtures = [{ id: "dancefloor", type: "dancefloor", label: "", x: 900, y: 400, w: 400, h: 400 }];
    plan.tables = [
      { id: "edge", number: 1, name: "", x: 750, y: 400, seats: 10, locked: false, note: "" },   // inside
      { id: "near", number: 2, name: "", x: 1150, y: 400, seats: 10, locked: false, note: "" },  // 50 past the edge
      { id: "far", number: 3, name: "", x: 1500, y: 400, seats: 10, locked: false, note: "" },   // 400 past it
    ];
    const ranked = rankTables(plan);
    // No podium, so only that term falls back to the top centre of the room. Subtract it
    // to read the dance-floor distance on its own.
    const scores = Object.fromEntries(ranked.map((r) => [r.tableId, r.score]));
    const floorPart = (id) => {
      const t = plan.tables.find((x) => x.id === id);
      return scores[id] - 0.6 * Math.hypot(t.x - plan.room.width / 2, t.y);
    };
    ok(scores.near < scores.far, "nearer the floor scores lower");
    eq(Math.round(floorPart("near")), 50, "distance is measured to the edge, not the centre");
    eq(Math.round(floorPart("edge")), 0, "a table on the floor is at distance zero");
  });

  it("falls back to the top centre of the room when the fixtures are gone", () => {
    const plan = createDefaultPlan();
    plan.fixtures = [];
    const ranked = rankTables(plan);
    const byId = new Map(plan.tables.map((t) => [t.id, t]));
    const first = byId.get(ranked[0].tableId);
    const last = byId.get(ranked[ranked.length - 1].tableId);
    const d = (t) => Math.hypot(t.x - plan.room.width / 2, t.y);
    ok(d(first) < d(last), "the table nearest the stage end still wins");
    eq(Math.round(ranked[0].score), Math.round(1.6 * d(first)), "both terms fall back together");
  });

  it("re-ranks when the planner moves the dance floor", () => {
    const plan = createDefaultPlan();
    // The default hall has no dance floor, so give this room one at the front first.
    plan.fixtures = [...plan.fixtures, { id: "dancefloor", type: "dancefloor", label: "", x: plan.room.width / 2, y: 120, w: 400, h: 200 }];
    const before = rankTables(plan)[0].tableId;
    const moved = {
      ...plan,
      fixtures: plan.fixtures.map((f) => (f.type === "dancefloor" ? { ...f, y: 900 } : f)),
    };
    const after = rankTables(moved)[0].tableId;
    ok(before !== after, "moving the floor changes which table is best");
  });
});

describe("autoSeat · prominence", () => {
  function frontPlan(guests) {
    const plan = createDefaultPlan();
    plan.guests = Object.fromEntries(guests.map((g) => [g.id, g]));
    return plan;
  }
  const rankMap = (plan) => new Map(rankTables(plan).map((r) => [r.tableId, r.rank]));

  it("puts the sponsors on the best tables, best tier first", () => {
    const party = (label, type, n) => Array.from({ length: n }, (_, i) =>
      mkGuest({ name: `${label} ${i}`, partyId: `${label}@example.org`, partyLabel: label, ticketType: type }));
    const champion = party("Champion Co", "champion", 10);
    const gold = party("Gold Co", "gold", 10);
    const community = party("Community Co", "community", 5);
    const crowd = Array.from({ length: 40 }, (_, i) => mkGuest({ name: `Guest ${i}` }));
    const plan = frontPlan([...crowd, ...gold, ...champion, ...community]);
    const result = autoSeat(plan, {});
    const ranks = rankMap(plan);
    const rankOfParty = (members) => ranks.get(result.plan.seating[members[0].id].tableId);

    eq(rankOfParty(champion), 1, "the champion sponsor takes the best table");
    eq(rankOfParty(gold), 2, "gold comes next");
    ok(rankOfParty(community) <= 3, "then community");
    for (const members of [champion, gold, community]) {
      eq(new Set(members.map((m) => result.plan.seating[m.id].tableId)).size, 1, "each sponsor party is whole");
    }
    ok(ranks.get(result.plan.seating[crowd[0].id].tableId) > 2, "general guests are not on the sponsor tables");
  });

  it("lets two five-seat community sponsors share one front table", () => {
    const party = (label) => Array.from({ length: 5 }, (_, i) =>
      mkGuest({ name: `${label} ${i}`, partyId: `${label}@example.org`, partyLabel: label, ticketType: "community" }));
    const a = party("Community A");
    const b = party("Community B");
    const plan = frontPlan([...a, ...b]);
    const result = autoSeat(plan, {});
    const ranks = rankMap(plan);
    eq(result.plan.seating[a[0].id].tableId, result.plan.seating[b[0].id].tableId, "they share a table");
    eq(ranks.get(result.plan.seating[a[0].id].tableId), 1, "and it is the best one");
  });

  it("fills the room from the front backwards", () => {
    const guests = Array.from({ length: 30 }, (_, i) => mkGuest({ name: `Guest ${i}` }));
    const plan = frontPlan(guests);
    const result = autoSeat(plan, {});
    const ranks = rankMap(plan);
    const used = [...new Set(Object.values(result.plan.seating).map((s) => s.tableId))].map((id) => ranks.get(id)).sort((x, y) => x - y);
    deepEq(used, [1, 2, 3], "30 guests fill the three best tables and nothing else");
  });

  it("lets affinity beat prominence", () => {
    // A gold sponsor holds the best table with room to spare; someone who asked to sit
    // with one of their people should join them rather than take the next table.
    const gold = Array.from({ length: 6 }, (_, i) =>
      mkGuest({ name: `Gold seat ${i}`, partyId: "gold@example.org", partyLabel: "Sofia Lane", ticketType: "gold" }));
    const friend = mkGuest({ name: "Ana Perez", prefs: { ...emptyPrefs(), status: "resolved", withGuestIds: [gold[0].id] } });
    const crowd = Array.from({ length: 20 }, (_, i) => mkGuest({ name: `Guest ${i}` }));
    const plan = frontPlan([...crowd, ...gold, friend]);
    const result = autoSeat(plan, {});
    eq(result.plan.seating[friend.id].tableId, result.plan.seating[gold[0].id].tableId,
      "she joined the sponsor's table");
    const reason = result.placements.find((p) => p.guestId === friend.id).reason;
    eq(reason, "asked to sit with Gold seat 0");
  });

  it("keeps someone at the front when they asked for a whole party there", () => {
    const host = Array.from({ length: 4 }, (_, i) =>
      mkGuest({ name: `Host seat ${i}`, partyId: "host@example.org", partyLabel: "Delia Zamora", ticketType: "community" }));
    const asker = mkGuest({ name: "Yara Toledo", prefs: { ...emptyPrefs(), status: "resolved", withPartyIds: ["host@example.org"] } });
    const crowd = Array.from({ length: 20 }, (_, i) => mkGuest({ name: `Guest ${i}` }));
    const plan = frontPlan([...crowd, ...host, asker]);
    const result = autoSeat(plan, {});
    eq(result.plan.seating[asker.id].tableId, result.plan.seating[host[0].id].tableId);
  });

  it("ignores prominence when the planner turns it off", () => {
    const guests = Array.from({ length: 12 }, (_, i) => mkGuest({ name: `Guest ${i}` }));
    const plan = frontPlan(guests);
    const flat = autoSeat(plan, { prioritizeFront: false });
    const front = autoSeat(plan, { prioritizeFront: true });
    const firstTable = (r) => r.plan.seating[guests[0].id].tableId;
    eq(firstTable(flat), "t1", "without prominence it fills by table number");
    const ranks = rankMap(plan);
    eq(ranks.get(firstTable(front)), 1, "with prominence it fills by rank");
    ok(front.placements.every((p) => p.reason), "reasons are written either way");
    ok(flat.placements.some((p) => p.reason === "first table with room"));
  });

  it("still respects locked tables and keep-apart while chasing the front", () => {
    const gold = Array.from({ length: 10 }, (_, i) =>
      mkGuest({ name: `Gold seat ${i}`, partyId: "gold@example.org", partyLabel: "Sofia Lane", ticketType: "gold" }));
    const a = mkGuest({ name: "Hugo Barrera" });
    const b = mkGuest({ name: "Bea Solis" });
    const plan = frontPlan([...gold, a, b]);
    const ranks = rankMap(plan);
    const bestId = [...ranks.entries()].find(([, r]) => r === 1)[0];
    plan.tables = plan.tables.map((t) => (t.id === bestId ? { ...t, locked: true } : t));
    plan.constraints = [{ id: "c1", type: "apart", guestIds: [a.id, b.id], note: "" }];

    const result = autoSeat(plan, {});
    ok(!Object.values(result.plan.seating).some((s) => s.tableId === bestId), "the locked table stayed empty");
    eq(ranks.get(result.plan.seating[gold[0].id].tableId), 2, "the sponsor took the next best table");
    ok(result.plan.seating[a.id].tableId !== result.plan.seating[b.id].tableId, "keep-apart held");
  });
});

describe("autoSeat · contiguity", () => {
  it("seats a party in one run of adjacent seats", () => {
    const party = Array.from({ length: 4 }, (_, i) =>
      mkGuest({ name: `Party ${i}`, partyId: "ana@example.org", partyLabel: "Ana Perez" }));
    const plan = makePlan(party, { tableCount: 2, seats: 10 });
    const result = autoSeat(plan, {});
    const seats = party.map((g) => result.plan.seating[g.id].seat).sort((a, b) => a - b);
    deepEq(seats, [0, 1, 2, 3], "one unbroken run");
  });

  it("keeps two parties on one table contiguous and separate", () => {
    const mk = (label, n) => Array.from({ length: n }, (_, i) =>
      mkGuest({ name: `${label} ${i}`, partyId: `${label}@example.org`, partyLabel: label }));
    const a = mk("A", 4);
    const b = mk("B", 4);
    const plan = makePlan([...a, ...b], { tableCount: 1, seats: 10 });
    const result = autoSeat(plan, {});
    const run = (members) => members.map((g) => result.plan.seating[g.id].seat).sort((x, y) => x - y);
    const isRun = (seats) => seats.every((s, i) => i === 0 || s === seats[i - 1] + 1);
    ok(isRun(run(a)), `party A is contiguous: ${run(a)}`);
    ok(isRun(run(b)), `party B is contiguous: ${run(b)}`);
    const overlap = run(a).filter((s) => run(b).includes(s));
    deepEq(overlap, [], "and they do not interleave");
  });

  it("gives each party its own run when one cluster holds two of them", () => {
    // A asks for B, so both parties travel as one cluster onto one table. They must not
    // end up interleaved around the ring.
    const mk = (label, n) => Array.from({ length: n }, (_, i) =>
      mkGuest({ name: `${label} ${i}`, partyId: `${label}@example.org`, partyLabel: label }));
    const a = mk("A", 3);
    const b = mk("B", 3);
    a[0].prefs = { ...emptyPrefs(), status: "resolved", withGuestIds: [b[0].id] };
    const plan = makePlan([...a, ...b], { tableCount: 2, seats: 10 });
    const result = autoSeat(plan, {});
    const seatsOf = (members) => members.map((g) => result.plan.seating[g.id].seat).sort((x, y) => x - y);
    eq(new Set([...a, ...b].map((g) => result.plan.seating[g.id].tableId)).size, 1, "one table");
    const isRun = (seats) => seats.every((s, i) => i === 0 || s === seats[i - 1] + 1);
    ok(isRun(seatsOf(a)), `A is contiguous: ${seatsOf(a)}`);
    ok(isRun(seatsOf(b)), `B is contiguous: ${seatsOf(b)}`);
  });

  it("packs a later party against the guests already there", () => {
    const seated = mkGuest({ name: "Already Seated" });
    const party = Array.from({ length: 3 }, (_, i) =>
      mkGuest({ name: `Party ${i}`, partyId: "ana@example.org", partyLabel: "Ana Perez" }));
    const plan = makePlan([seated, ...party], { tableCount: 1, seats: 10 });
    seatAt(plan, seated.id, "t1", 0);
    const result = autoSeat(plan, { onlyUnseated: true });
    const seats = party.map((g) => result.plan.seating[g.id].seat).sort((a, b) => a - b);
    deepEq(seats, [1, 2, 3], "they sit right next to the guest who was already there");
  });

  it("wraps a run around the ring when that is what is free", () => {
    const blocker = Array.from({ length: 4 }, (_, i) => mkGuest({ name: `Blocker ${i}` }));
    const party = Array.from({ length: 4 }, (_, i) =>
      mkGuest({ name: `Party ${i}`, partyId: "ana@example.org", partyLabel: "Ana Perez" }));
    const plan = makePlan([...blocker, ...party], { tableCount: 1, seats: 8 });
    // Occupy seats 2,3,4,5 so the only run of 4 is 6,7,0,1 around the back.
    blocker.forEach((g, i) => seatAt(plan, g.id, "t1", i + 2));
    const result = autoSeat(plan, { onlyUnseated: true });
    const seats = party.map((g) => result.plan.seating[g.id].seat).sort((a, b) => a - b);
    deepEq(seats, [0, 1, 6, 7], "the run wrapped around seat 0");
  });

  it("still fills the gaps when no run is long enough", () => {
    const scattered = [0, 2, 4].map((seat, i) => ({ guest: mkGuest({ name: `Sitter ${i}` }), seat }));
    const party = Array.from({ length: 3 }, (_, i) =>
      mkGuest({ name: `Party ${i}`, partyId: "ana@example.org", partyLabel: "Ana Perez" }));
    const plan = makePlan([...scattered.map((s) => s.guest), ...party], { tableCount: 1, seats: 6 });
    for (const s of scattered) seatAt(plan, s.guest.id, "t1", s.seat);
    const result = autoSeat(plan, { onlyUnseated: true });
    const seats = party.map((g) => result.plan.seating[g.id].seat).sort((a, b) => a - b);
    deepEq(seats, [1, 3, 5], "nobody is left standing just because the seats are scattered");
  });

  it("is deterministic with prominence on", () => {
    const gold = Array.from({ length: 7 }, (_, i) =>
      mkGuest({ name: `Gold ${i}`, partyId: "gold@example.org", partyLabel: "Sofia Lane", ticketType: "gold" }));
    const vip = mkGuest({ name: "Renata Ocampo", tags: ["vip"] });
    const crowd = Array.from({ length: 25 }, (_, i) => mkGuest({ name: `Guest ${i}` }));
    const plan = createDefaultPlan();
    plan.guests = Object.fromEntries([...crowd, ...gold, vip].map((g) => [g.id, g]));
    const before = JSON.stringify(plan);
    const a = autoSeat(plan, {});
    const b = autoSeat(plan, {});
    eq(JSON.stringify(plan), before, "input untouched");
    deepEq(a.plan.seating, b.plan.seating);
    deepEq(a.placements, b.placements, "same placements and same reasons");
    ok(capacityOk(a.plan));
  });
});

/* ------------------------------------------------------------------ *
 * exporters
 * ------------------------------------------------------------------ */

describe("exporters", () => {
  function demoPlan() {
    const ana = mkGuest({ name: "Verónica Salas", partyId: "ana@example.org", partyLabel: "Ana Perez", tags: ["vip"], plannerNote: 'Say "hello"' });
    const luis = mkGuest({ name: "Luis Ramos", meal: "whitefish" });
    const ph = mkGuest({ name: "Guest of Ana Perez (2)", partyId: "ana@example.org", partyLabel: "Ana Perez", placeholder: true, meal: null, placeholderIndex: 2 });
    const unseated = mkGuest({ name: "Hugo Barrera", meal: "ravioli" });
    const plan = makePlan([ana, luis, ph, unseated], { tableCount: 2, seats: 4 });
    seatAt(plan, ana.id, "t1", 0);
    seatAt(plan, luis.id, "t1", 1);
    seatAt(plan, ph.id, "t2", 0);
    return { plan, ana, luis, ph, unseated };
  }

  it("round-trips through serialize and parse", () => {
    const { plan } = demoPlan();
    const { plan: back, errors } = parsePlanFile(serializePlan(plan));
    deepEq(errors, []);
    deepEq(back.seating, plan.seating);
    deepEq(Object.keys(back.guests).sort(), Object.keys(plan.guests).sort());
    deepEq(back.tables, plan.tables);
    const id = Object.keys(plan.guests)[0];
    eq(back.guests[id].name, plan.guests[id].name);
    deepEq(back.guests[id].tags, plan.guests[id].tags);
  });

  it("accepts a bare plan with no wrapper", () => {
    const { plan } = demoPlan();
    const { plan: back, errors } = parsePlanFile(JSON.stringify(plan));
    ok(back);
    deepEq(errors, []);
  });

  it("refuses a file that is not a plan", () => {
    eq(parsePlanFile("not json at all").plan, null);
    eq(parsePlanFile('{"hello":"world"}').plan, null);
    ok(parsePlanFile("not json at all").errors.length > 0);
  });

  it("repairs a corrupted file and reports what it repaired", () => {
    const { plan, ana, luis } = demoPlan();
    const broken = JSON.parse(serializePlan(plan));
    broken.plan.seating["ghost-guest"] = { tableId: "t1", seat: 2 };     // no such guest
    broken.plan.seating[luis.id] = { tableId: "t9", seat: 0 };            // no such table
    broken.plan.guests[ana.id].seat = 99;
    broken.plan.guests["bad"] = null;                                     // unreadable guest
    broken.plan.guests[ana.id].tags = "vip";                              // wrong type
    broken.plan.guests[ana.id].meal = "lasagna";                          // unknown meal
    broken.plan.constraints = [{ id: "c1", type: "apart", guestIds: ["ghost-guest", "also-gone"] }];
    broken.plan.room = null;
    delete broken.plan.meta;

    const { plan: fixed, errors } = parsePlanFile(JSON.stringify(broken));
    ok(fixed, "a plan came back");
    ok(errors.length >= 4, `expected several notices, got ${errors.length}: ${errors.join(" | ")}`);
    ok(!fixed.seating["ghost-guest"], "the dangling seat is gone");
    ok(!fixed.seating[luis.id], "the seat on a missing table is gone");
    ok(!fixed.guests.bad, "the unreadable guest is gone");
    deepEq(fixed.guests[ana.id].tags, [], "tags became an array again");
    eq(fixed.guests[ana.id].meal, null, "an unknown entrée became 'not chosen'");
    deepEq(fixed.constraints, [], "a rule about guests who are gone was dropped");
    eq(fixed.room.width, ROOM.width);
    ok(fixed.meta.name);
  });

  it("drops a seat index past the end of the table", () => {
    const { plan, ana } = demoPlan();
    const wrapper = JSON.parse(serializePlan(plan));
    wrapper.plan.seating[ana.id] = { tableId: "t1", seat: 99 };
    const { plan: fixed, errors } = parsePlanFile(JSON.stringify(wrapper));
    ok(!fixed.seating[ana.id]);
    ok(errors.some((e) => /seat/i.test(e)));
  });

  it("writes an Excel-friendly CSV with one row per seat", () => {
    const { plan } = demoPlan();
    const csv = seatingCsv(plan);
    eq(csv.charCodeAt(0), 0xfeff, "UTF-8 BOM so Excel reads accents");
    const lines = csv.slice(1).split("\r\n").filter(Boolean);
    eq(lines[0], '"Table","Seat","Guest","Party","Ticket","Meal","Tags","Notes"');
    ok(csv.includes("Verónica Salas"), "accents survive");
    ok(csv.includes('""hello""'), "inner quotes are doubled");
    ok(csv.includes('"Unseated"'), "there is an unseated block");
    // 8 seats across 2 tables + header + blank + section header + 1 unseated guest
    eq(lines.length, 1 + 8 + 1 + 1 + 1);
  });

  it("counts meals for the kitchen", () => {
    const { plan } = demoPlan();
    const counts = mealCounts(plan);
    eq(counts.total["short-rib"], 1);
    eq(counts.total.whitefish, 1);
    eq(counts.total.ravioli, 1, "an unseated dinner guest still eats");
    eq(counts.total.none, 1, "the placeholder has not chosen");
    eq(counts.byTable.t1["short-rib"], 1);
    eq(counts.seatedTotal, 3);
  });

  it("sorts the check-in list by last name with placeholders last", () => {
    const { plan } = demoPlan();
    const list = alphaList(plan);
    deepEq(list.map((x) => x.name), ["Hugo Barrera", "Luis Ramos", "Verónica Salas", "Guest of Ana Perez (2)"]);
    eq(list[1].table, "Table 1");
    eq(list[1].seat, 2, "seats are 1-based for humans");
    eq(list[0].table, "", "an unseated guest has no table");
  });

  it("builds one card per table", () => {
    const { plan } = demoPlan();
    const cards = tableCards(plan);
    eq(cards.length, 2);
    eq(cards[0].guests.length, 2);
    eq(cards[0].empty, 2);
    eq(cards[0].guests[0].seat, 1);
    eq(cards[0].guests[0].seatIndex, 0);
    eq(cards[1].meals.none, 1);
  });

  it("survives a full import, auto-seat, export, import cycle", () => {
    const { guests } = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    let plan = createDefaultPlan();
    plan = mergeGuestsIntoPlan(plan, guests).plan;
    eq(plan.tables.length, DEFAULT_TABLE_COUNT, "the room comes from the model, not a literal");
    eq(plan.tables[0].seats, SEATS_PER_TABLE);
    const seated = autoSeat(plan, {});
    ok(capacityOk(seated.plan));
    const { plan: back, errors } = parsePlanFile(serializePlan(seated.plan));
    deepEq(errors, []);
    deepEq(back.seating, seated.plan.seating, "every seat survived the round trip");
    eq(guestList(back).length, guestList(seated.plan).length);
  });
});

describe("generic guest names are never merged", () => {
  it("keeps two 'Guest of' rows as two people and numbers the second", () => {
    const rows = [
      ["Timestamp", "Guest Name", "Purchaser’s name", "Email address", "Phone number", "Dinner selection"],
      ["2026-09-20 19:49", "Guest of Pat Lee", "Pat Lee", "pat@example.com", "555", "Cherry Braised Short Rib"],
      ["2026-09-20 19:50", "Guest of Pat Lee", "Pat Lee", "pat@example.com", "555", "Whitefish à la Plancha"],
      ["2026-09-20 19:51", "Ana Ruiz", "Pat Lee", "ana@example.com", "556", "Cherry Braised Short Rib"],
      ["2026-09-20 19:52", "Ana Ruiz", "Pat Lee", "ana@example.com", "556", "Asparagus Artichoke Ravioli (V)"],
    ];
    const out = parseResponses(rows);
    eq(out.rawCount, 4);
    eq(out.responses.length, 3, "two Guest-of rows kept, the named repeat merged");
    deepEq(out.responses.map((r) => r.guestName).sort(), ["Ana Ruiz", "Guest of Pat Lee", "Guest of Pat Lee (2)"]);
    eq(out.responses.find((r) => r.guestName === "Ana Ruiz").selection, "Asparagus Artichoke Ravioli (V)", "a named repeat still takes the latest answer");
    ok(isGenericGuestName("Guest of CPA") && isGenericGuestName("+1") && isGenericGuestName("Plus one") && !isGenericGuestName("Guestina Ortiz"), "generic-name detection");
  });
});

describe("no ticket on record", () => {
  // 03:00 UTC on Sep 24 is still the evening of Sep 23 in Chicago.
  const WHEN = new Date("2026-09-24T03:00:00Z");

  /** The same ops the store's resolveNoTicket emits, applied through ops.js. */
  function resolve(plan, guestId, resolutionId, note = "", editor = "Marisol") {
    const built = resolutionPatch(plan.guests[guestId], resolutionId, { editor, when: WHEN, note });
    const ops = [];
    if (built.unseat && plan.seating[guestId]) ops.push({ op: "unseat", g: guestId });
    ops.push({ op: "guest_patch", g: guestId, patch: built.patch });
    return applyOps(plan, ops);
  }

  function diner(over = {}) {
    return mkGuest({ ticketType: "unknown", unmatched: true, plannerNote: "Met at the open house.", ...over });
  }

  it("dates the stamp on the Chicago clock", () => {
    eq(chicagoShortDate(WHEN), "Sep 23");
  });

  it("comped: comp ticket, dinner, matched, locked fields, stamped note", () => {
    const g = diner({ id: "nt-comp", name: "Paloma Ibarra", tags: ["outreach", "vip"] });
    const plan = resolve(makePlan([g]), g.id, "comped", "Board guest");
    const after = plan.guests[g.id];
    eq(after.ticketType, "comp");
    eq(after.hasDinner, true);
    eq(after.unmatched, false);
    deepEq(after.tags, ["vip"], "outreach tag removed, other tags kept");
    deepEq(after.editedFields, ["ticketType", "hasDinner"]);
    eq(after.plannerNote, "Comped (Marisol, Sep 23). Board guest. Met at the open house.");
    eq(ticketResolutionOf(after), "comped");
    eq(resolutionAttribution(after, "comped"), "Marisol, Sep 23");
    ok(!needsTicketResolution(after) && showsTicketResolution(after), "resolved, status line still shown");
  });

  it("the status line survives on a diner who carries a stray ticket number", () => {
    const g = diner({ id: "nt-num", name: "Celia Robles", ticketNumbers: ["X-1"] });
    const after = resolve(makePlan([g]), g.id, "comped").guests[g.id];
    ok(showsTicketResolution(after), "stamped in the note, so still shown");
    const handSet = { ...mkGuest({ id: "nt-hand", name: "Irma Vela", ticketType: "comp", ticketNumbers: ["X-2"] }), editedFields: ["ticketType"] };
    ok(!showsTicketResolution(handSet), "a ticketed guest switched to Comp by hand is not a no-ticket case");
  });

  it("paid another way: benefactor ticket with ticketType locked", () => {
    const g = { ...diner({ id: "nt-paid", name: "Teodoro Villa" }), editedFields: ["meal"] };
    const plan = resolve(makePlan([g]), g.id, "paid-other");
    const after = plan.guests[g.id];
    eq(after.ticketType, "benefactor");
    eq(after.hasDinner, true);
    eq(after.unmatched, false);
    deepEq(after.editedFields, ["meal", "ticketType", "hasDinner"]);
    eq(after.plannerNote, "Paid another way (Marisol, Sep 23). Met at the open house.");
    eq(ticketResolutionOf(after), "paid-other");
  });

  it("outreach: unseats, tags, stamps, and leaves the ticket fields alone", () => {
    const g = diner({ id: "nt-out", name: "Graciela Otero" });
    let plan = seatAt(makePlan([g]), g.id, "t1", 2);
    plan = resolve(plan, g.id, "outreach", "Call her Friday");
    const after = plan.guests[g.id];
    ok(!plan.seating[g.id], "unseated");
    deepEq(after.tags, ["outreach"]);
    eq(after.ticketType, "unknown");
    eq(after.unmatched, true);
    ok(!("editedFields" in after), "no ticket fields claimed");
    eq(after.plannerNote, "Needs outreach (Marisol, Sep 23). Call her Friday. Met at the open house.");
    eq(ticketResolutionOf(after), "outreach");
    ok(hasNoZeffyTicket(after) && !needsTicketResolution(after), "still no ticket, but decided");
  });

  it("a hand-added guest with no ticket number counts as no ticket until resolved", () => {
    const g = mkGuest({ id: "nt-man", name: "Oscar Lemus", ticketType: "unknown", source: "manual" });
    ok(hasNoZeffyTicket(g) && needsTicketResolution(g));
    const withTicket = mkGuest({ id: "nt-man2", name: "Ines Cordero", source: "manual", ticketNumbers: ["900"] });
    ok(!hasNoZeffyTicket(withTicket), "a ticket number is a ticket");
    ok(!needsTicketResolution(resolve(makePlan([g]), g.id, "paid-other").guests[g.id]));
  });

  it("outreach warning appears for the tag and clears once the seat is comped", () => {
    const g = diner({ id: "nt-warn", name: "Rocio Anaya" });
    let plan = resolve(makePlan([g]), g.id, "outreach");
    const w = computeWarnings(plan).find((x) => x.type === "needs-outreach");
    ok(w, "needs-outreach emitted");
    eq(w.key, "needs-outreach:nt-warn");
    eq(w.severity, "info");
    eq(w.message, "Rocio Anaya is waiting on outreach; not seated until confirmed.");
    plan = resolve(plan, g.id, "comped");
    ok(!typesOf(computeWarnings(plan)).includes("needs-outreach"), "cleared");
  });

  it("previewPlacement still shows the outreach warning on a drop, without blocking it", () => {
    const g = diner({ id: "nt-drag", name: "Beatriz Solano" });
    const plan = resolve(makePlan([g]), g.id, "outreach");
    const preview = previewPlacement(plan, g.id, "t2");
    has(typesOf(preview), "needs-outreach");
    ok(!preview.some((x) => x.severity === "error"), "advice only");
  });

  it("auto-seat skips guests waiting on outreach", () => {
    const a = diner({ id: "nt-as1", name: "Leonel Aguirre" });
    const b = mkGuest({ id: "nt-as2", name: "Mariela Pineda" });
    const plan = resolve(makePlan([a, b], { tableCount: 2, seats: 4 }), a.id, "outreach");
    const res = autoSeat(plan, {});
    ok(!res.plan.seating[a.id], "not seated");
    ok(res.plan.seating[b.id], "everyone else still seated");
    deepEq(res.skipped.filter((s) => s.guestId === a.id), [{ guestId: a.id, reason: "needs outreach" }]);
    const all = autoSeat(plan, { onlyUnseated: false });
    ok(!all.plan.seating[a.id], "not seated on a full reshuffle either");
  });

  it("a fresh import keeps all three resolutions", () => {
    const { guests } = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    let plan = mergeGuestsIntoPlan(makePlan([], { tableCount: 4, seats: 10 }), guests).plan;
    const unmatched = Object.values(plan.guests).filter((g) => g.unmatched);
    ok(unmatched.length >= 2, "fixture has unmatched diners");
    const [first, second] = unmatched;
    const walkIn = mkGuest({ id: "nt-walkin", name: "Amparo Quiroz", ticketType: "unknown", source: "manual" });
    plan = { ...plan, guests: { ...plan.guests, [walkIn.id]: walkIn } };

    plan = resolve(plan, first.id, "comped");
    plan = resolve(plan, second.id, "paid-other");
    plan = resolve(plan, walkIn.id, "outreach");

    const fresh = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() }).guests;
    const merged = mergeGuestsIntoPlan(plan, fresh).plan;
    eq(ticketResolutionOf(merged.guests[first.id]), "comped");
    eq(merged.guests[first.id].unmatched, false);
    eq(ticketResolutionOf(merged.guests[second.id]), "paid-other");
    eq(merged.guests[second.id].ticketType, "benefactor");
    eq(ticketResolutionOf(merged.guests[walkIn.id]), "outreach");
    ok(merged.guests[first.id].plannerNote.startsWith("Comped (Marisol, Sep 23)."), "note kept");
  });

  it("outreach on an imported diner survives a re-import too", () => {
    const { guests } = buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() });
    let plan = mergeGuestsIntoPlan(makePlan([], { tableCount: 4, seats: 10 }), guests).plan;
    const target = Object.values(plan.guests).find((g) => g.unmatched);
    plan = resolve(plan, target.id, "outreach");
    const merged = mergeGuestsIntoPlan(plan, buildGuestsFromRows({ ticketRows: ticketRows(), mealRows: mealRows() }).guests).plan;
    eq(ticketResolutionOf(merged.guests[target.id]), "outreach");
    has(merged.guests[target.id].tags, "outreach");
  });
});

/* ------------------------------------------------------------------ *
 * summary
 * ------------------------------------------------------------------ */

const total = passed + failures.length;
if (failures.length) {
  console.log(`\nFAIL  ${failures.length} of ${total} checks failed\n`);
  for (const f of failures) console.log(`  x ${f}\n`);
  process.exit(1);
} else {
  console.log(`\nPASS  ${passed} of ${total} checks passed\n`);
}
