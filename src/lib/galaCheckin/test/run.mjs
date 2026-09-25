// Gala check-in desk · logic tests.  node src/lib/galaCheckin/test/run.mjs
//
// PRIVACY: every name, email and phone number below is invented for this file.
// Real guest data never enters the repo, not in fixtures, not in comments, not
// in output. The hazards these fixtures reproduce (shared surnames, a host who
// is not the household, accents, nicknames, suffixes, compound surnames, a
// "Guest of X" seat, a shared organizer phone) come from the anonymous counts
// in docs/gala-2026/03-guest-data-analysis.md section 6, never from a row.

import fs from "node:fs";
import {
  LATE_NIGHT, arrivalBlocks, buildSearchIndex, checkedInLine, clockTime, deriveStats, expandNickname,
  groupParties, matchGuests, membersByGroup, nameList, paddleBlocks, paddleShare, rankParties,
} from "../derive.js";

/* ------------------------------------------------------------------ *
 * tiny harness (same shape as src/lib/galaSeating/test/run.mjs)
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

/* ------------------------------------------------------------------ *
 * fixtures (invented names only)
 * ------------------------------------------------------------------ */

let seq = 0;
function guest(over = {}) {
  seq += 1;
  const id = over.id || `g${seq}`;
  return {
    id,
    name: "Guest",
    party_id: `solo:${id}`,
    party_label: "",
    paddle_group: over.paddle_group || over.party_id || `solo:${id}`,
    paddle_number: null,
    paddle_preassigned: false,
    buyer_name: "",
    buyer_email: "",
    email: "",
    phone: "",
    ticket_type: "dinner",
    has_dinner: true,
    table_number: null,
    table_name: "",
    seat: null,
    meal: null,
    tags: [],
    notes: "",
    door_note: "",
    placeholder: false,
    source: "manual",
    checked_in_at: null,
    checked_in_by: "",
    removed_at: null,
    row_version: 1,
    ...over,
  };
}

/** A household: one party, one paddle group, one paddle. */
function household(pid, label, buyer, names, over = {}) {
  return names.map((n, i) =>
    guest({
      id: `${pid}-${i + 1}`,
      name: typeof n === "string" ? n : n.name,
      party_id: `party:${pid}`,
      party_label: label,
      paddle_group: `party:${pid}`,
      buyer_name: buyer,
      seat: i + 1,
      ...(typeof n === "string" ? {} : n),
      ...over,
    }));
}

function roster() {
  return [
    // A couple. The host's surname is not the partner's: the analysis found this
    // in 50 of 67 named non-buyers.
    ...household("nv", "Nava household", "Rosalba Nava", [
      { name: "Rosalba Nava", email: "rosalba@example.invalid", phone: "312 555 0143", meal: "chicken" },
      { name: "Ignacio Trevino", meal: "vegetarian" },
    ], { table_number: 1, table_name: "Table 1" }),

    // A placeholder seat, which must never be reachable by the words "guest of".
    ...household("ql", "Quintanilla household", "Marisol Quintanilla", [
      { name: "Marisol Quintanilla", meal: "chicken" },
      { name: "Guest of Marisol Quintanilla", placeholder: true },
    ], { table_number: 2, table_name: "Table 2" }),

    // Accents, a compound surname and a suffix.
    ...household("hr", "Del Hierro household", "Guadalupe Del Hierro", [
      { name: "Guadalupe Del Hierro", phone: "7735550188", meal: "beef" },
      { name: "Margarita Del Hierro Jr", meal: "vegan" },
    ], { table_number: 3, table_name: "Table 3" }),

    // A sponsor table: ONE party, but each seat is its own paddle group.
    ...household("st", "Stavros table", "Anneke Stavros", [
      { name: "Anneke Stavros", meal: "beef" },
      { name: "Benedikt Stavros", meal: "beef" },
      { name: "Cressida Onwudiwe", meal: "chicken" },
    ], { table_number: 4, table_name: "Table 4" }).map((g, i) => ({ ...g, paddle_group: `g:st-${i + 1}` })),

    // Late Night Access: no dinner, defaults to no paddle.
    ...household("ln", "Late Night pair", "Tomasz Wisniewski", [
      { name: "Tomasz Wisniewski" },
      { name: "Ilkay Demirci" },
    ], { has_dinner: false, ticket_type: "late-night" }),

    guest({
      id: "solo-1", name: "Solveig Haraldsen", party_label: "Solveig Haraldsen",
      buyer_name: "Solveig Haraldsen", table_number: 5, table_name: "Table 5", meal: "vegan",
    }),
    guest({
      id: "solo-2", name: "Veronica Aldaz", party_label: "Veronica Aldaz",
      buyer_name: "Veronica Aldaz", table_number: 5, table_name: "Table 5", meal: "chicken",
      email: "vero.aldaz@example.invalid",
    }),
  ];
}

const pool = (n, over = {}) =>
  Array.from({ length: n }, (_, i) => ({
    paddle_number: i + 1, status: "free", paddle_group: null, preassigned: false,
    assigned_at: null, assigned_by: "", note: "", row_version: 1, ...over,
  }));

const idsOf = (res) => res.hits.map((h) => h.id);

/* ------------------------------------------------------------------ *
 * parties
 * ------------------------------------------------------------------ */

describe("groupParties", () => {
  it("makes one card per party, members in seat order", () => {
    const parties = groupParties(roster());
    const nava = parties.find((p) => p.id === "party:nv");
    eq(nava.total, 2);
    eq(nava.members[0].name, "Rosalba Nava");
    eq(nava.label, "Nava household");
    eq(nava.table_number, 1);
  });

  it("counts arrivals and reports a partly arrived party", () => {
    const rows = roster();
    rows.find((g) => g.id === "nv-1").checked_in_at = "2026-11-14T00:42:00Z";
    const nava = groupParties(rows).find((p) => p.id === "party:nv");
    eq(nava.arrived, 1);
    eq(nava.allArrived, false);
    eq(nava.anyArrived, true);
  });

  it("a household is ONE paddle group, a sponsor table is many", () => {
    const parties = groupParties(roster());
    eq(parties.find((p) => p.id === "party:nv").groups.length, 1, "couple shares a paddle");
    eq(parties.find((p) => p.id === "party:nv").splitAcrossGroups, false);
    eq(parties.find((p) => p.id === "party:st").groups.length, 3, "sponsor seats each get their own");
    eq(parties.find((p) => p.id === "party:st").splitAcrossGroups, true, "a typed number would be refused as mixed-groups");
  });

  it("carries the paddle number that the SERVER put on the row, and only that", () => {
    const rows = roster();
    for (const g of rows) if (g.party_id === "party:nv") { g.paddle_number = 17; g.paddle_preassigned = true; }
    const nava = groupParties(rows).find((p) => p.id === "party:nv");
    deepEq(nava.paddleNumbers, [17]);
    eq(nava.groups[0].preassigned, true);
    const ql = groupParties(rows).find((p) => p.id === "party:ql");
    deepEq(ql.paddleNumbers, [], "no number is ever invented for a party that has none");
  });

  it("summarises meals and Late Night seats for the door", () => {
    const parties = groupParties(roster());
    const hierro = parties.find((p) => p.id === "party:hr");
    deepEq(hierro.meals, [{ meal: "beef", n: 1 }, { meal: "vegan", n: 1 }]);
    const late = parties.find((p) => p.id === "party:ln");
    eq(late.lateNight, 2);
    eq(late.dinner, 0);
  });

  it("counts open placeholder seats on the card", () => {
    const ql = groupParties(roster()).find((p) => p.id === "party:ql");
    eq(ql.placeholders, 1);
  });
});

/* ------------------------------------------------------------------ *
 * stats
 * ------------------------------------------------------------------ */

describe("deriveStats", () => {
  it("totals match the shape gala_checkin_stats_json returns", () => {
    const rows = roster();
    rows.find((g) => g.id === "nv-1").checked_in_at = "2026-11-14T00:42:00Z";
    rows.find((g) => g.id === "ln-1").checked_in_at = "2026-11-14T02:10:00Z";
    const s = deriveStats(rows, pool(10));
    eq(s.totals.guests, 13);
    eq(s.totals.checked_in, 2);
    eq(s.totals.late_night, 2);
    eq(s.totals.late_night_checked_in, 1);
    eq(s.totals.dinner, 11);
    eq(s.totals.dinner_checked_in, 1);
    eq(s.totals.placeholders_open, 1);
    eq(s.totals.parties, 7);
    eq(s.totals.parties_arrived, 2);
  });

  it("counts walk-ins separately", () => {
    const rows = [...roster(), guest({ id: "w_1", name: "Paloma Erhardt", source: "walkin", checked_in_at: "2026-11-14T01:00:00Z" })];
    eq(deriveStats(rows, []).totals.walkins, 1);
  });

  it("reports the number the lead watches: arrived with no paddle", () => {
    const rows = roster();
    rows.find((g) => g.id === "st-1").checked_in_at = "2026-11-14T00:50:00Z";
    const s = deriveStats(rows, pool(3));
    eq(s.paddles.pool, 3);
    eq(s.paddles.free, 3);
    eq(s.paddles.arrived_without_paddle, 1);
    ok(s.paddles.groups_without_paddle >= 1);
  });

  it("a household with a paddle is one group with a paddle, not two", () => {
    const rows = roster();
    for (const g of rows) if (g.party_id === "party:nv") g.paddle_number = 4;
    const s = deriveStats(rows, [...pool(3), { paddle_number: 4, status: "assigned", paddle_group: "party:nv", row_version: 2 }]);
    eq(s.paddles.assigned, 1);
    // Nine paddle groups in the roster (three of them are the sponsor seats);
    // one paddle covers the couple's whole household, so eight are still open.
    eq(s.paddles.groups_without_paddle, 8, "the couple's single group is covered by one paddle");
  });

  it("buckets by table and by ticket type", () => {
    const s = deriveStats(roster(), []);
    eq(s.by_table.find((t) => t.table_number === 4).total, 3);
    eq(s.by_ticket_type.find((t) => t.ticket_type === "late-night").total, 2);
  });
});

/* ------------------------------------------------------------------ *
 * search
 * ------------------------------------------------------------------ */

describe("matchGuests", () => {
  const index = () => buildSearchIndex(roster());

  it("folds accents on both sides", () => {
    const rows = roster();
    rows.find((g) => g.id === "nv-2").name = "Ignacio Treviño";
    const i = buildSearchIndex(rows);
    deepEq(idsOf(matchGuests("trevino", i)), ["nv-2"]);
    deepEq(idsOf(matchGuests("Treviño", i)), ["nv-2"]);
  });

  it("matches token prefixes, in any order", () => {
    const i = index();
    eq(matchGuests("ros", i).hits[0].id, "nv-1");
    eq(matchGuests("nava ros", i).hits[0].id, "nv-1", "order does not matter");
  });

  it("the two-fragment query the placeholder text asks for narrows to one party", () => {
    const i = index();
    const res = matchGuests("ma qu", i);
    eq(res.hits[0].id, "ql-1");
    eq(rankParties(res.hits, groupParties(roster())).length, 1, "one card, not a wall");
  });

  it("every typed token has to land: it is AND, not OR", () => {
    const i = index();
    eq(matchGuests("rosalba stavros", i).hits.length, 0);
  });

  it("a host name surfaces the whole party, own names score higher", () => {
    const i = index();
    const res = matchGuests("anneke", i);
    const parties = rankParties(res.hits, groupParties(roster()));
    eq(parties.length, 1);
    eq(parties[0].party.id, "party:st");
    eq(parties[0].party.total, 3, "all three seats come with the card");
    eq(res.hits[0].id, "st-1", "the person who owns the name is first");
    ok(res.hits[0].score > res.hits[1].score, "a buyer hit scores below an own-name hit");
  });

  it("never indexes the words guest and of", () => {
    const i = index();
    eq(matchGuests("guest", i).hits.length, 0, '"guest" must not return a wall of placeholders');
    eq(matchGuests("of", i).hits.length, 0);
  });

  it("still reaches a placeholder seat through its host", () => {
    const i = index();
    const ids = idsOf(matchGuests("quintanilla", i));
    ok(ids.includes("ql-2"), "the unnamed seat comes with the party");
  });

  it("drops suffixes from matching but the name keeps them for display", () => {
    const i = index();
    deepEq(idsOf(matchGuests("jr", i)), []);
    ok(idsOf(matchGuests("margarita", i)).includes("hr-2"));
  });

  it("indexes every token of a compound surname", () => {
    const i = index();
    ok(idsOf(matchGuests("hierro", i)).includes("hr-1"), "never assume the last token is the surname");
    ok(idsOf(matchGuests("del", i)).includes("hr-1"));
  });

  it("knows a small, generic nickname map, both directions", () => {
    const i = index();
    ok(idsOf(matchGuests("vero", i)).includes("solo-2"));
    deepEq(expandNickname("lupe").sort(), ["guadalupe", "lupe"]);
    ok(idsOf(matchGuests("lupe", i)).includes("hr-1"));
    deepEq(expandNickname("haraldsen"), ["haraldsen"], "an ordinary token expands to itself");
  });

  it("finds a guest by the local part of an email", () => {
    const i = index();
    ok(idsOf(matchGuests("rosalba", i)).includes("nv-1"));
  });

  it("1 to 3 digits mean a paddle first, then a table", () => {
    const rows = roster();
    for (const g of rows) if (g.party_id === "party:nv") g.paddle_number = 4;
    const i = buildSearchIndex(rows);
    const res = matchGuests("4", i);
    eq(res.mode, "number");
    eq(res.hits[0].id.startsWith("nv-"), true, "the paddle wins over table 4");
    ok(idsOf(res).some((id) => id.startsWith("st-")), "table 4 still appears, below");
  });

  it("t4 and table 4 list the table", () => {
    const i = index();
    eq(matchGuests("t4", i).mode, "table");
    deepEq(idsOf(matchGuests("table 4", i)).sort(), ["st-1", "st-2", "st-3"]);
  });

  it("4 digits are the end of a phone number, 10 are the whole one", () => {
    const i = index();
    deepEq(idsOf(matchGuests("0143", i)), ["nv-1"]);
    deepEq(idsOf(matchGuests("3125550143", i)), ["nv-1"]);
    deepEq(idsOf(matchGuests("(312) 555-0143", i)), ["nv-1"], "punctuation the volunteer types is ignored");
  });

  it("someone not yet arrived outranks someone already in the room", () => {
    const rows = roster();
    rows.find((g) => g.id === "st-1").checked_in_at = "2026-11-14T00:30:00Z";
    const i = buildSearchIndex(rows);
    const res = matchGuests("stavros", i);
    eq(res.hits[0].id, "st-2", "the person still at the door comes first");
  });

  it("fuzzy runs only when nothing else hit, and says so", () => {
    const i = index();
    const clean = matchGuests("stavros", i);
    eq(clean.fuzzy, false);
    const typo = matchGuests("stavris", i);
    eq(typo.fuzzy, true, "did you mean");
    ok(idsOf(typo).includes("st-1"));
    eq(matchGuests("zzzzzz", i).mode, "none");
  });

  it("a short fragment is never fuzzy matched", () => {
    const i = index();
    eq(matchGuests("xyz", i).hits.length, 0, "3 letters would match half the room");
  });

  it("an empty query is not a search", () => {
    eq(matchGuests("   ", index()).mode, "empty");
  });
});

/* ------------------------------------------------------------------ *
 * misc
 * ------------------------------------------------------------------ */

describe("rankParties", () => {
  it("shows each party once, best hit first, and remembers who matched", () => {
    const parties = groupParties(roster());
    const i = buildSearchIndex(roster());
    const ranked = rankParties(matchGuests("stavros", i).hits, parties);
    eq(ranked.length, 1);
    eq(ranked[0].matchedGuestId, "st-1");
  });
});

describe("clockTime", () => {
  it("is Chicago time whatever the phone is set to", () => {
    eq(clockTime("2026-11-15T00:42:00Z"), "6:42 PM");
    eq(clockTime(""), "");
    eq(clockTime("not a date"), "");
  });
});

/* ------------------------------------------------------------------ *
 * shared household paddles (organizer, Sep 25: households share)
 * ------------------------------------------------------------------ */

function couple(over = {}) {
  return household("cp", "Arce household", "Lidia Arce", ["Lidia Arce", "Mateo Quiroga"], { paddle_number: 42, ...over });
}

describe("paddleShare", () => {
  it("a paddle of one is not shared and says nothing", () => {
    const g = guest({ id: "s1", name: "Noemi Farias", paddle_number: 7 });
    const s = paddleShare(g, [g]);
    eq(s.shared, false);
    eq(s.text, "");
  });
  it("before anyone arrives, both halves read 'shared with' the other", () => {
    const [a, b] = couple();
    eq(paddleShare(a, [a, b]).text, "Paddle 42 · shared with Mateo Quiroga");
    eq(paddleShare(b, [a, b]).text, "Paddle 42 · shared with Lidia Arce");
    eq(paddleShare(a, [a, b]).withOther, false);
  });
  it("the second half arriving later reads 'already with' the first: no new paddle", () => {
    const [a, b] = couple();
    a.checked_in_at = "2026-09-25T23:41:00Z";
    const s = paddleShare(b, [a, b]);
    eq(s.withOther, true);
    eq(s.holder.id, a.id);
    eq(s.text, "Paddle 42 · already with Lidia Arce");
    eq(paddleShare(a, [a, b]).text, "Has paddle 42 · shared with Mateo Quiroga");
  });
  it("the holder is whoever arrived FIRST, not the buyer", () => {
    const [a, b] = couple();
    a.checked_in_at = "2026-09-25T23:50:00Z";
    b.checked_in_at = "2026-09-25T23:41:00Z";
    eq(paddleShare(a, [a, b]).holder.id, b.id);
    eq(paddleShare(a, [a, b]).text, "Paddle 42 · with Mateo Quiroga");
  });
  it("a household with no paddle yet says it will share one", () => {
    const [a, b] = couple({ paddle_number: null });
    eq(paddleShare(a, [a, b]).text, "Shares one paddle with Mateo Quiroga");
  });
  it("removed members do not count", () => {
    const [a, b] = couple();
    b.removed_at = "2026-09-25T22:00:00Z";
    eq(paddleShare(a, [a, b]).shared, false);
  });
});

describe("arrivalBlocks", () => {
  it("a couple checked in together is ONE block with one number, handed over", () => {
    const [a, b] = couple({ checked_in_at: "2026-09-25T23:41:00Z" });
    const blocks = arrivalBlocks([a, b], () => [a, b]);
    eq(blocks.length, 1);
    eq(blocks[0].number, 42);
    eq(blocks[0].handOver, true);
    eq(blocks[0].holder, null);
  });
  it("the partner arriving later is told the paddle is already out", () => {
    const [a, b] = couple();
    a.checked_in_at = "2026-09-25T23:41:00Z";
    b.checked_in_at = "2026-09-26T00:05:00Z";
    const blocks = arrivalBlocks([b], () => [a, b]);
    eq(blocks[0].handOver, false);
    eq(blocks[0].holder.id, a.id);
  });
  it("a partner who arrives AFTER the card opened never flips it to 'already with'", () => {
    const [a, b] = couple();
    a.checked_in_at = "2026-09-25T23:41:00Z";
    b.checked_in_at = "2026-09-25T23:42:00Z";
    const blocks = arrivalBlocks([a], () => [a, b]);
    eq(blocks[0].handOver, true);
    eq(blocks[0].waiting.length, 0);
  });
  it("lists who is still expected on the same paddle", () => {
    const [a, b] = couple();
    a.checked_in_at = "2026-09-25T23:41:00Z";
    deepEq(arrivalBlocks([a], () => [a, b])[0].waiting.map((m) => m.id), [b.id]);
  });
  it("two households in one party check-in give two blocks", () => {
    const x = guest({ id: "x1", paddle_group: "gx", paddle_number: 3, checked_in_at: "2026-09-25T23:41:00Z" });
    const y = guest({ id: "y1", paddle_group: "gy", paddle_number: 4, checked_in_at: "2026-09-25T23:41:00Z" });
    deepEq(arrivalBlocks([x, y]).map((b) => b.number), [3, 4]);
  });
  it("no paddle means no hand-over", () => {
    const x = guest({ id: "x2", checked_in_at: "2026-09-25T23:41:00Z" });
    eq(arrivalBlocks([x])[0].handOver, false);
  });
});

describe("paddleBlocks and membersByGroup", () => {
  it("one block per paddle group, with the earliest arrival as holder", () => {
    const [a, b] = couple();
    b.checked_in_at = "2026-09-25T23:41:00Z";
    const party = groupParties([a, b])[0];
    const blocks = paddleBlocks(party);
    eq(blocks.length, 1);
    eq(blocks[0].shared, true);
    eq(blocks[0].holder.id, b.id);
    deepEq(blocks[0].waiting.map((m) => m.id), [a.id]);
  });
  it("groups span parties after a merge, and skip removed rows", () => {
    const a = guest({ id: "m1", party_id: "p1", paddle_group: "shared" });
    const b = guest({ id: "m2", party_id: "p2", paddle_group: "shared" });
    const c = guest({ id: "m3", party_id: "p2", paddle_group: "shared", removed_at: "2026-09-25T22:00:00Z" });
    deepEq(membersByGroup([a, b, c]).get("shared").map((g) => g.id), ["m1", "m2"]);
  });
  it("nameList keeps it short", () => {
    eq(nameList([{ name: "A" }]), "A");
    eq(nameList([{ name: "A" }, { name: "B" }]), "A and B");
    eq(nameList([{ name: "A" }, { name: "B" }, { name: "C" }]), "A and 2 more");
  });
});

describe("door copy", () => {
  it("checked-in line names the volunteer and the Chicago time", () => {
    eq(checkedInLine(guest({ checked_in_at: "2026-09-25T23:41:00Z", checked_in_by: "Maria" })), "Checked in by Maria at 6:41 PM");
    eq(checkedInLine(guest({})), "");
  });
  it("Late Night is always shown with its 9 PM door time, no em-dash anywhere", () => {
    eq(LATE_NIGHT, "Late Night · 9 PM");
    const src = fs.readFileSync(new URL("../derive.js", import.meta.url), "utf8");
    ok(!src.includes("\u2014"), "derive.js contains an em-dash");
  });
});

describe("search: first OR last name, accents ignored, fast", () => {
  const people = [
    guest({ id: "a1", name: "Sofía Gómez" }),
    guest({ id: "a2", name: "José Martínez" }),
    guest({ id: "a3", name: "Ana María Núñez" }),
    guest({ id: "a4", name: "Óscar Lima" }),
  ];
  const i = buildSearchIndex(people);
  const top = (q) => matchGuests(q, i).hits[0]?.id;
  it("by first name without accents", () => { eq(top("sofia"), "a1"); eq(top("oscar"), "a4"); });
  it("by last name without accents", () => { eq(top("gomez"), "a1"); eq(top("nunez"), "a3"); eq(top("martinez"), "a2"); });
  it("typed WITH accents too", () => { eq(top("Gómez"), "a1"); eq(top("NÚÑEZ"), "a3"); });
  it("last name then first name", () => { eq(top("martinez jose"), "a2"); });
  it("a middle name finds the person", () => { eq(top("maria"), "a3"); });
  it("answers a 400-guest list in well under 100 ms per keystroke", () => {
    const big = [];
    for (let k = 0; k < 400; k++) big.push(guest({ id: `b${k}`, name: `Invented${k} Surname${k % 37}`, party_id: `p${k % 180}` }));
    const t0 = performance.now();
    const idx = buildSearchIndex(big);
    for (const q of ["inv", "invented12", "surname3", "zz", "12", "t 4"]) matchGuests(q, idx);
    const per = (performance.now() - t0) / 6;
    ok(per < 100, `took ${per.toFixed(1)} ms per query`);
  });
});

/* ------------------------------------------------------------------ *
 * store.svelte.js (compiled with the Svelte compiler, driven by a fake remote)
 * ------------------------------------------------------------------ */

const asyncTests = [];
function itAsync(name, fn) { const g = group; asyncTests.push({ name: `${g} > ${name}`, fn }); }

async function loadStore() {
  const { compileModule } = await import("svelte/compiler");
  const src = fs.readFileSync(new URL("../store.svelte.js", import.meta.url), "utf8");
  let code = compileModule(src, { generate: "client", filename: "store.svelte.js" }).js.code;
  code = code
    .replace(/import \{ newOpId \} from ["']\.\/remote\.js["'];?/, "const newOpId = () => globalThis.crypto.randomUUID();")
    .replace(/from ["']\.\/derive\.js["']/, `from ${JSON.stringify(new URL("../derive.js", import.meta.url).href)}`);
  // Inside node_modules so the compiled module can resolve "svelte/internal/client".
  const dir = new URL("../../../../node_modules/.cache/", import.meta.url);
  fs.mkdirSync(dir, { recursive: true });
  const file = new URL("gala-checkin-store.test.mjs", dir);
  fs.writeFileSync(file, code);
  globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
  globalThis.document ??= { hidden: false, addEventListener() {}, removeEventListener() {} };
  return import(`${file.href}?t=${Date.now()}`);
}

function fakeRemote(rows, script = {}) {
  const calls = [];
  return {
    calls,
    clientId: "test-device",
    actor: "Tester",
    event: "test-store",
    load: async () => ({ ok: true, version: 1, log_id: 0, guests: rows, paddles: [], log: [], me: { actor: "Tester", role: "door" }, closed: false }),
    since: async (v) => ({ ok: true, version: v, log_id: 0, guests: [], paddles: [], log: [] }),
    subscribe: () => () => {},
    ping: async () => {},
    setFocus: async () => {},
    checkIn: async (op, ids) => { calls.push({ kind: "checkin", op, ids }); return script.checkIn(op, ids, calls.length); },
    walkIn: async (op, g) => { calls.push({ kind: "walkin", op, g }); return script.walkIn(op, g, calls.length); },
  };
}

describe("store", () => {
  itAsync("groupMembers returns both halves of a couple, live", async () => {
    const { createCheckinStore } = await loadStore();
    const store = createCheckinStore({ retryDelays: [1] });
    await store.attach(fakeRemote(couple()));
    deepEq(store.groupMembers("party:cp").map((g) => g.id), ["cp-1", "cp-2"]);
    deepEq(store.groupMembers("nope"), []);
    store.stop();
  });

  itAsync("a flaky check-in retries with the SAME op id, then reports 'failed' with that id", async () => {
    const { createCheckinStore } = await loadStore();
    const store = createCheckinStore({ retryDelays: [1, 1, 1] });
    const r = fakeRemote(couple(), { checkIn: () => ({ ok: false, reason: "offline", transient: true }) });
    await store.attach(r);
    const res = await store.checkIn(["cp-1"], { assign_paddle: true });
    eq(res.ok, false);
    eq(r.calls.length, 4, "1 try + 3 retries");
    eq(new Set(r.calls.map((c) => c.op)).size, 1, "one op id for every attempt");
    eq(res.opId, r.calls[0].op, "the failure carries the op id");
    eq(store.stuck.length, 1);
    eq(store.pendingByGuest["cp-1"].state, "failed");
    eq(store.sync.status, "offline");
    store.stop();
  });

  itAsync("tap to retry resends the SAME op id and a landed write is recorded as this device's", async () => {
    const { createCheckinStore } = await loadStore();
    const store = createCheckinStore({ retryDelays: [1] });
    let online = false;
    const [a, b] = couple();
    const r = fakeRemote([a, b], {
      checkIn: (op) => online
        ? { ok: true, outcome: "checked_in", replayed: true, version: 2, newly: ["cp-1"], guests: [{ ...a, checked_in_at: "2026-09-25T23:41:00Z", row_version: 2 }], paddles: [] }
        : { ok: false, reason: "offline", transient: true },
    });
    await store.attach(r);
    const first = await store.checkIn(["cp-1"], {});
    online = true;
    const again = await store.retry(first.opId);
    eq(again.ok, true);
    eq(new Set(r.calls.map((c) => c.op)).size, 1, "every attempt, including the manual retry, used one op id");
    eq(store.stuck.length, 0);
    ok(store.mine.has("cp-1"), "remembered as checked in on this device");
    eq(store.guestsById["cp-1"].checked_in_at, "2026-09-25T23:41:00Z");
    eq((await store.retry("unknown-op")).reason, "busy");
    store.stop();
  });

  itAsync("a second tap while the first is in flight is refused as busy (no second op)", async () => {
    const { createCheckinStore } = await loadStore();
    const store = createCheckinStore({ retryDelays: [1] });
    let release;
    const gate = new Promise((res) => (release = res));
    const r = fakeRemote(couple(), { checkIn: async () => { await gate; return { ok: true, outcome: "checked_in", version: 2, newly: [], guests: [], paddles: [] }; } });
    await store.attach(r);
    const one = store.checkIn(["cp-1"], {});
    const two = await store.checkIn(["cp-1"], {});
    eq(two.reason, "busy");
    release();
    await one;
    eq(r.calls.length, 1);
    store.stop();
  });

  itAsync("a walk-in that never answered is retried with the same op id: one guest, never two", async () => {
    const { createCheckinStore } = await loadStore();
    const store = createCheckinStore({ retryDelays: [1] });
    let online = false;
    const r = fakeRemote([], {
      walkIn: (op) => online
        ? { ok: true, outcome: "checked_in", version: 2, newly: [`w_${op}`], paddle_number: 57, guests: [guest({ id: `w_${op}`, name: "Invented Walkin", paddle_number: 57, checked_in_at: "2026-09-25T23:41:00Z", row_version: 2 })], paddles: [] }
        : { ok: false, reason: "offline", transient: true },
    });
    await store.attach(r);
    const first = await store.walkIn({ name: "Invented Walkin" }, { assign_paddle: true });
    online = true;
    const again = await store.retry(first.opId);
    eq(again.paddle_number, 57);
    eq(new Set(r.calls.map((c) => c.op)).size, 1);
    eq(store.guests.length, 1);
    store.stop();
  });
});

/* ------------------------------------------------------------------ *
 * summary
 * ------------------------------------------------------------------ */

for (const t of asyncTests) {
  try { await t.fn(); passed++; }
  catch (err) { failures.push(`${t.name}\n    ${err && err.message ? err.message : err}`); }
}

const total = passed + failures.length;
if (failures.length) {
  console.log(`\nFAIL  ${failures.length} of ${total} checks failed\n`);
  for (const f of failures) console.log(`  x ${f}\n`);
  process.exit(1);
} else {
  console.log(`\nPASS  ${passed} of ${total} checks passed\n`);
}
