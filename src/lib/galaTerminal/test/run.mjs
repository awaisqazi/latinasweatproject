// Gala pledge terminal · logic tests.  node src/lib/galaTerminal/test/run.mjs
//
// PRIVACY: every name below is invented for this file. Real guest or donor data
// never enters the repo, not in fixtures, not in comments, not in output.
//
// The cases are the ones that cost money if they are wrong: the entry grammar a
// clerk types blind, the duplicate guard, the tape merge that must not grow a
// second copy of a corrected gift, and the offline queue's on-disk shape, which
// has to survive a reload with the op ids intact and without a single name.

import {
  DEFAULT_LEVELS, agoLabel, amountWords, centsOf, dollars, findLiveAtLevel, levelByKey,
  levelCentsFromRoundKey, levelList, mergeTape, money, nextForceIndex, packQueue, paddleIndex,
  parseEntry, queueDepth, roundKeyFor, roundsByLevel, rowName, rowState, secondsAgo, stepLevel,
  tapeList, unpackQueue,
} from "../derive.js";

/* ------------------------------------------------------------------ *
 * tiny harness (same shape as src/lib/galaCheckin/test/run.mjs)
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

const LEVELS = [500000, 250000, 100000, 50000, 25000, 10000];
const state = (over = {}) => ({
  levels: LEVELS.map((amount_cents) => ({ amount_cents, impact_line: "" })),
  current_level_cents: 100000,
  confirm_threshold_cents: 250000,
  publish_delay_ms: 4000,
  ...over,
});

let seq = 0;
function gift(over = {}) {
  seq += 1;
  return {
    id: seq, seq, chg: seq,
    amount: 500, amount_cents: 50000,
    kind: "pledge", round_key: "raise-500",
    paddle_number: 11, called_number: 11,
    guest_name: "Invitada Prueba Uno", display_name: "Mesa Prueba Uno", donor_name: null,
    anonymous: false, hidden: false, needs_review: false, note: "",
    entered_by: "ClerkA", created_at: "2026-09-25T23:13:58.402Z", publish_at: null, published: true,
    retracted_at: null, voided_at: null, live: true,
    ...over,
  };
}

/* ------------------------------------------------------------------ *
 * money
 * ------------------------------------------------------------------ */

describe("money", () => {
  it("crosses the wire as dollars and lives in memory as cents", () => {
    eq(dollars(50000), 500);
    eq(dollars(123456), 1234.56);
    eq(centsOf("750"), 75000);
    eq(centsOf(1234.56), 123456);
  });

  it("drops the cents when there are none to show", () => {
    eq(money(50000), "$500");
    eq(money(500000), "$5,000");
    eq(money(123456), "$1,234.56");
    eq(money(0), "$0");
  });

  it("spells an amount out for the confirm gate, and refuses to guess", () => {
    eq(amountWords(500000), "five thousand dollars");
    eq(amountWords(5000000), "fifty thousand dollars");
    eq(amountWords(25000), "two hundred fifty dollars");
    eq(amountWords(105000), "one thousand fifty dollars");
    eq(amountWords(123456), "", "no words for a fractional amount");
    eq(amountWords(0), "");
  });
});

/* ------------------------------------------------------------------ *
 * levels
 * ------------------------------------------------------------------ */

describe("levelList", () => {
  it("is highest first, deduplicated, and capped at the nine number keys", () => {
    const many = { levels: Array.from({ length: 12 }, (_, i) => ({ amount_cents: (i + 1) * 10000 })) };
    const out = levelList(many);
    eq(out.length, 9);
    eq(out[0].amount_cents, 1200000 / 10);
    ok(out.every((l, i) => i === 0 || l.amount_cents < out[i - 1].amount_cents), "descending");
    deepEq(out.map((l) => l.key), ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });

  it("throws away junk levels instead of showing a $0 button", () => {
    const out = levelList({ levels: [{ amount_cents: 50000 }, { amount_cents: 0 }, { amount_cents: 50000 }, {}] });
    eq(out.length, 1);
    eq(out[0].amount_cents, 50000);
  });

  it("falls back to the compiled-in ladder only when the state has none", () => {
    eq(levelList({ levels: [] }).length, DEFAULT_LEVELS.length);
    eq(levelList(null)[0].amount_cents, 500000);
  });

  it("cuts an impact line at 120 characters, the way the server does", () => {
    const out = levelList({ levels: [{ amount_cents: 50000, impact_line: "x".repeat(200) }] });
    eq(out[0].impact_line.length, 120);
  });
});

describe("levelByKey and stepLevel", () => {
  const levels = levelList(state());

  it("maps the number keys 1 to 9 onto the ladder", () => {
    eq(levelByKey(levels, "1").amount_cents, 500000);
    eq(levelByKey(levels, "4").amount_cents, 50000);
    eq(levelByKey(levels, "9"), null);
    eq(levelByKey(levels, "0"), null);
    eq(levelByKey(levels, "x"), null);
  });

  it("walks the ladder and never wraps, because wrapping is a fat-finger disaster", () => {
    eq(stepLevel(levels, 500000, +1).amount_cents, 250000);
    eq(stepLevel(levels, 250000, -1).amount_cents, 500000);
    eq(stepLevel(levels, 500000, -1).amount_cents, 500000, "already at the top");
    eq(stepLevel(levels, 10000, +1).amount_cents, 10000, "already at the bottom");
  });

  it("lands on the top level when the room is on an amount that is not a level", () => {
    eq(stepLevel(levels, 77777, +1).amount_cents, 500000);
    eq(stepLevel([], 50000, +1), null);
  });
});

/* ------------------------------------------------------------------ *
 * round keys
 * ------------------------------------------------------------------ */

describe("round keys", () => {
  it("names a level the way the contract's example does", () => {
    eq(roundKeyFor(50000), "raise-500");
    eq(roundKeyFor(500000), "raise-5000");
    eq(roundKeyFor(2500), "raise-25");
  });

  it("gives a deliberate second gift its own key, so the server guard still bites", () => {
    eq(roundKeyFor(50000, 2), "raise-500#2");
    eq(roundKeyFor(50000, 3), "raise-500#3");
  });

  it("reads the level back out of a key, and only out of a raise key", () => {
    eq(levelCentsFromRoundKey("raise-500"), 50000);
    eq(levelCentsFromRoundKey("raise-500#2"), 50000);
    eq(levelCentsFromRoundKey("raise-1234.56"), 123456);
    eq(levelCentsFromRoundKey("paddles-up"), null);
    eq(levelCentsFromRoundKey(null), null);
  });

  it("rolls the forced keys back into one per-level tally for the emcee", () => {
    const out = roundsByLevel({
      "raise-500": { gifts: 9, total_cents: 450000, paddles: 9 },
      "raise-500#2": { gifts: 1, total_cents: 50000, paddles: 1 },
      "raise-1000": { gifts: 4, total_cents: 400000, paddles: 4 },
      "table-gift": { gifts: 2, total_cents: 100000, paddles: 0 },
    });
    eq(out.length, 2);
    eq(out[0].amount_cents, 100000);
    eq(out[1].amount_cents, 50000);
    eq(out[1].gifts, 10, "nine plus the forced one");
    eq(out[1].total_cents, 500000);
  });
});

/* ------------------------------------------------------------------ *
 * the entry line
 * ------------------------------------------------------------------ */

describe("parseEntry", () => {
  it("takes a bare paddle at the locked level", () => {
    const r = parseEntry("45", 250000);
    ok(r.ok);
    deepEq(r.items, [{ paddle: 45, cents: 250000, custom: false, anonymous: false, force: false }]);
  });

  it("takes a burst, because spotters shout in threes", () => {
    const r = parseEntry("12 45 88", 50000);
    ok(r.ok);
    eq(r.items.length, 3);
    deepEq(r.items.map((i) => i.paddle), [12, 45, 88]);
    ok(r.items.every((i) => i.cents === 50000));
  });

  it("takes commas and runs of spaces, because a numpad is not a typewriter", () => {
    const r = parseEntry("  12,45   88 ", 50000);
    eq(r.items.length, 3);
  });

  it("takes a custom amount with the numpad star", () => {
    const r = parseEntry("45*750", 50000);
    eq(r.items[0].cents, 75000);
    eq(r.items[0].custom, true);
    eq(parseEntry("45*7.50", 50000).items[0].cents, 750);
  });

  it("takes the anonymous and force flags, in either order", () => {
    eq(parseEntry("45a", 50000).items[0].anonymous, true);
    eq(parseEntry("45!", 50000).items[0].force, true);
    const both = parseEntry("45a!", 50000).items[0];
    ok(both.anonymous && both.force);
    const swapped = parseEntry("45!a", 50000).items[0];
    ok(swapped.anonymous && swapped.force);
    eq(parseEntry("45*750a", 50000).items[0].anonymous, true);
  });

  it("refuses the whole line rather than half a burst", () => {
    const r = parseEntry("12 4x 88", 50000);
    eq(r.ok, false);
    eq(r.reason, "bad-token");
    eq(r.token, "4x");
    eq(r.items.length, 0);
  });

  it("refuses an empty line, paddle zero, and a level of nothing", () => {
    eq(parseEntry("   ", 50000).reason, "empty");
    eq(parseEntry("0", 50000).reason, "bad-paddle");
    eq(parseEntry("45", 0).reason, "no-amount");
    eq(parseEntry("45*99999999", 50000).ok, false);
  });
});

/* ------------------------------------------------------------------ *
 * the tape
 * ------------------------------------------------------------------ */

describe("mergeTape", () => {
  it("upserts by id and keeps the newest change", () => {
    const a = gift({ id: 1, seq: 1, chg: 1, amount_cents: 50000 });
    const fixed = { ...a, chg: 63, amount_cents: 123456 };
    let by = mergeTape({}, [a]);
    by = mergeTape(by, [fixed]);
    eq(Object.keys(by).length, 1, "a correction is not a second gift");
    eq(by[1].amount_cents, 123456);
  });

  it("ignores a stale copy that arrives after a newer one", () => {
    const a = gift({ id: 2, chg: 70 });
    const stale = { ...a, chg: 9, amount_cents: 1 };
    const by = mergeTape(mergeTape({}, [a]), [stale]);
    eq(by[2].chg, 70);
    eq(by[2].amount_cents, 50000);
  });

  it("never mutates the object it was given, and survives an empty page", () => {
    const before = mergeTape({}, [gift({ id: 3 })]);
    const after = mergeTape(before, []);
    eq(after, before, "an empty page is the same object");
    const grown = mergeTape(before, [gift({ id: 4 })]);
    eq(Object.keys(before).length, 1);
    eq(Object.keys(grown).length, 2);
  });

  it("sorts the tape newest change first", () => {
    const by = mergeTape({}, [gift({ id: 10, chg: 10 }), gift({ id: 11, chg: 44 }), gift({ id: 12, chg: 22 })]);
    deepEq(tapeList(by).map((r) => r.id), [11, 12, 10]);
  });
});

describe("the local duplicate guard", () => {
  const rows = [
    gift({ id: 20, paddle_number: 45, called_number: 45, round_key: "raise-2500", amount_cents: 250000, entered_by: "ClerkB" }),
    gift({ id: 21, paddle_number: 45, called_number: 45, round_key: "raise-500", amount_cents: 50000 }),
    gift({ id: 22, paddle_number: 46, called_number: 46, round_key: "raise-2500", amount_cents: 250000, voided_at: "2026-09-25T23:20:00Z" }),
    gift({ id: 23, paddle_number: null, called_number: 212, round_key: "raise-2500", needs_review: true }),
  ];

  it("finds the same paddle at the same level and names the other clerk", () => {
    const hit = findLiveAtLevel(rows, 45, 250000);
    ok(hit);
    eq(hit.id, 20);
    eq(hit.entered_by, "ClerkB");
  });

  it("does not confuse two levels", () => {
    eq(findLiveAtLevel(rows, 45, 100000), null);
  });

  it("treats a voided row as a freed slot, exactly like the server does", () => {
    eq(findLiveAtLevel(rows, 46, 250000), null);
  });

  it("guards an unknown paddle by the number that was actually called", () => {
    const hit = findLiveAtLevel(rows, 212, 250000);
    ok(hit);
    eq(hit.id, 23);
  });

  it("numbers a deliberate repeat past the gifts already on the tape", () => {
    eq(nextForceIndex(rows, 45, 250000), 2);
    eq(nextForceIndex(rows, 46, 250000), 1, "the voided one does not count");
    eq(nextForceIndex(rows, 99, 250000), 1);
  });
});

describe("row labels", () => {
  it("says what a row is, in the order that matters", () => {
    eq(rowState(gift()), "live");
    eq(rowState(gift({ published: false })), "pending");
    eq(rowState(gift({ hidden: true })), "hidden");
    eq(rowState(gift({ retracted_at: "now" })), "retracted");
    eq(rowState(gift({ retracted_at: "now", voided_at: "now" })), "voided");
  });

  it("shows the clerk the guest, never the projector's label", () => {
    eq(rowName(gift()), "Invitada Prueba Uno");
    eq(rowName(gift({ guest_name: null, donor_name: "Panaderia Rio Verde" })), "Panaderia Rio Verde");
    eq(rowName(gift({ anonymous: true })), "Anonymous", "an anonymous gift never carries the household name");
    eq(rowName(gift({ guest_name: null, donor_name: null, display_name: "Anonymous", needs_review: true, paddle_number: null, called_number: 212 })),
      "Paddle 212", "a needs-review row shows the number the clerk can shout, not the room's word");
    eq(rowName(gift({ guest_name: null, donor_name: null, display_name: "Mesa Prueba", paddle_number: null, called_number: null })), "Mesa Prueba");
  });

  it("counts the seconds for 'Clerk B, 8 s ago'", () => {
    const now = Date.parse("2026-09-25T23:14:06.402Z");
    eq(secondsAgo("2026-09-25T23:13:58.402Z", now), 8);
    eq(agoLabel("2026-09-25T23:13:58.402Z", now), "8 s ago");
    eq(agoLabel("2026-09-25T23:09:06.402Z", now), "5 min ago");
    eq(agoLabel("", now), "");
    eq(secondsAgo("not a date", now), null);
  });
});

/* ------------------------------------------------------------------ *
 * paddle -> name
 * ------------------------------------------------------------------ */

describe("paddleIndex", () => {
  const guests = [
    { id: "a1", name: "Ana Prueba", buyer_name: "Ana Prueba", party_label: "Mesa Prueba", paddle_number: 11, table_number: 3 },
    { id: "a2", name: "Beto Invitado", buyer_name: "Ana Prueba", party_label: "Mesa Prueba", paddle_number: 12 },
    { id: "a3", name: "Retirada Prueba", paddle_number: 13, removed_at: "2026-09-25T20:00:00Z" },
    { id: "a4", name: "Sin Paleta", paddle_number: null },
  ];

  it("resolves one paddle to one named guest", () => {
    const index = paddleIndex(guests);
    eq(index[11].name, "Ana Prueba");
    eq(index[11].table, 3);
    eq(index[12].name, "Beto Invitado");
  });

  it("skips a removed guest and a guest with no paddle", () => {
    const index = paddleIndex(guests);
    eq(index[13], undefined);
    eq(Object.keys(index).length, 2);
  });

  it("prefers the buyer when two rows somehow share a number", () => {
    const index = paddleIndex([
      { id: "b1", name: "Segunda Prueba", buyer_name: "Primera Prueba", paddle_number: 20 },
      { id: "b2", name: "Primera Prueba", buyer_name: "Primera Prueba", paddle_number: 20 },
    ]);
    eq(index[20].name, "Primera Prueba");
  });
});

/* ------------------------------------------------------------------ *
 * the offline queue
 * ------------------------------------------------------------------ */

describe("the offline queue", () => {
  const items = [
    { op: "11111111-1111-4111-8111-111111111111", paddle: 45, cents: 250000, round: "raise-2500", kind: "pledge", anonymous: false, at: 1_758_000_000_000, state: "waiting", tries: 3 },
    { op: "22222222-2222-4222-8222-222222222222", paddle: null, cents: 7500, round: null, kind: "online", anonymous: true, at: 1_758_000_000_500, state: "sending", tries: 0 },
  ];

  it("survives a reload with the op ids intact, which is what makes a resend safe", () => {
    const back = unpackQueue(JSON.stringify(packQueue(items)));
    eq(back.length, 2);
    eq(back[0].op, items[0].op);
    eq(back[0].cents, 250000);
    eq(back[0].round, "raise-2500");
    eq(back[1].kind, "online");
    eq(back[1].anonymous, true);
    eq(back[1].paddle, null);
  });

  it("comes back ready to send, whatever it was doing when the tab died", () => {
    const back = unpackQueue(JSON.stringify(packQueue(items)));
    ok(back.every((i) => i.state === "waiting" && i.tries === 0));
  });

  it("keeps its order, because thirty paddles have to land in the order they were called", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ op: `op-${i}`, paddle: i + 1, cents: 50000, round: "raise-500", at: i }));
    deepEq(unpackQueue(JSON.stringify(packQueue(many))).map((i) => i.paddle), many.map((i) => i.paddle));
  });

  it("stores a paddle and an amount and NOT one name", () => {
    const blob = JSON.stringify(packQueue([{ ...items[0], donorName: "Panaderia Rio Verde", note: "table 4, in cash" }]));
    ok(!blob.includes("Panaderia"), "no donor name on disk");
    ok(!blob.includes("cash"), "no note on disk");
    ok(blob.includes("45"), "the paddle is there");
  });

  it("drops a malformed blob instead of throwing, because a bad read must not kill the terminal", () => {
    deepEq(unpackQueue("{not json"), []);
    deepEq(unpackQueue(null), []);
    deepEq(unpackQueue(JSON.stringify({ v: 99, q: [{ o: "x", c: 100 }] })), [], "a future version is not readable");
    deepEq(unpackQueue(JSON.stringify({ v: 1, q: "nope" })), []);
  });

  it("drops the individual entries that make no sense, and keeps the rest", () => {
    const back = unpackQueue(JSON.stringify({ v: 1, q: [{ o: "keep", c: 500, t: 1 }, { c: 500 }, { o: "no-money", c: 0 }] }));
    eq(back.length, 1);
    eq(back[0].op, "keep");
  });

  it("counts everything the server has not acknowledged", () => {
    eq(queueDepth([{ state: "waiting" }, { state: "sending" }, { state: "failed" }, { state: "done" }]), 3);
    eq(queueDepth([]), 0);
    eq(queueDepth(null), 0);
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
