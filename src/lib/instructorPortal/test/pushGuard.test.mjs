// Instructor portal · the push script's stale-copy guard.
//   node src/lib/instructorPortal/test/pushGuard.test.mjs
//
// No network and no database. This covers the decision the owner's push script
// makes before it replaces the live document: go ahead, nothing to do, or stop
// because staff changed something the working copy does not have.
//
// PRIVACY: every name and sentence below is invented for this file.

import {
  VERSION_RE,
  canonical,
  changedSinceBase,
  dashboardSavesQuery,
  differingSections,
  guardedPushQuery,
  judgePush,
  liveQuery,
  makeBase,
  readBase,
  refusalText,
  sectionHashes,
  withBase,
} from "../../../../scripts/instructor-portal-guard.mjs";

/* ------------------------------------------------------------------ *
 * tiny harness (same shape as run.mjs)
 * ------------------------------------------------------------------ */

let passed = 0;
const failures = [];
let group = "";

function describe(name, fn) { group = name; fn(); }
function it(name, fn) {
  const label = `${group} > ${name}`;
  try { fn(); passed++; }
  catch (err) { failures.push(`${label}\n    ${err && err.message ? err.message : err}`); }
}
function eq(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message || "not equal"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function deepEq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message || "not deep equal"}:\n    expected ${b}\n    got      ${a}`);
}
function throws(fn, message) {
  try { fn(); } catch { return; }
  throw new Error(message || "expected it to throw");
}

/* ------------------------------------------------------------------ *
 * fixtures (invented)
 * ------------------------------------------------------------------ */

const V1 = "2026-01-05T15:00:00.000001Z";
const V2 = "2026-01-12T16:30:00.250000Z";

const doc = () => ({
  schema: 1,
  updated: "2026-01-05",
  week: [{ start: "2026-01-05", end: "2026-01-11", headline: "Quiet week", notes: ["Mats are in the hall closet."] }],
  dates: [{ date: "2026-01-19", title: "Studio closed" }],
  faq: [{ q: "Where do the mats go?", a: [{ t: "p", x: "In the hall closet." }] }],
  handbook: [{ id: "basics", title: "Basics", blocks: [{ t: "p", x: "Arrive ten minutes early." }] }],
});

// The same document as Postgres would hand it back: keys in another order.
const reordered = (d) => Object.fromEntries(Object.keys(d).reverse().map((k) => [k, d[k]]));

const staffEdit = (d) => ({
  ...d,
  updated: "2026-01-12",
  week: [...d.week, { start: "2026-01-12", end: "2026-01-18", headline: "New playlist", notes: ["Try the new speaker."] }],
});

/* ------------------------------------------------------------------ *
 * comparing documents
 * ------------------------------------------------------------------ */

describe("comparing", () => {
  it("key order does not matter", () => {
    eq(canonical({ b: 1, a: { d: 2, c: 3 } }), canonical({ a: { c: 3, d: 2 }, b: 1 }));
    deepEq(sectionHashes(doc()), sectionHashes(reordered(doc())));
  });
  it("list order does matter", () => {
    const a = doc();
    const b = doc();
    b.week[0].notes = ["Second.", "First."];
    a.week[0].notes = ["First.", "Second."];
    deepEq(differingSections(a, b), ["week"]);
  });
  it("names the sections that differ, sorted", () => {
    const b = doc();
    b.faq[0].a[0].x = "On the shelf.";
    b.dates = [];
    deepEq(differingSections(doc(), b), ["dates", "faq"]);
  });
  it("a section only one side has counts as different", () => {
    const b = doc();
    delete b.dates;
    b.extra = { on: true };
    deepEq(differingSections(doc(), b), ["dates", "extra"]);
  });
  it("the date stamp alone is not a difference", () => {
    const b = doc();
    b.updated = "2026-02-01";
    deepEq(differingSections(doc(), b), []);
  });
  it("a number written two ways is the same number", () => {
    eq(canonical(JSON.parse('{"schema":1.0}')), canonical(JSON.parse('{"schema":1}')));
  });
});

/* ------------------------------------------------------------------ *
 * the decision
 * ------------------------------------------------------------------ */

describe("judgePush", () => {
  it("first content for a slug goes ahead", () => {
    deepEq(judgePush({ local: doc(), live: null }), { action: "push", first: true });
  });
  it("live already equal to the working copy: nothing to do", () => {
    deepEq(judgePush({ local: doc(), live: reordered(doc()), liveVersion: V1 }), { action: "same" });
  });
  it("live is still what this computer pushed: go ahead with local changes", () => {
    const pushed = doc();
    const local = doc();
    local.handbook[0].blocks[0].x = "Arrive fifteen minutes early.";
    const verdict = judgePush({ local, live: pushed, liveVersion: V1, base: makeBase(pushed, V1) });
    deepEq(verdict, { action: "push" });
  });
  it("staff added a week and the working copy does not have it: stop, and say which section", () => {
    const pushed = doc();
    const live = staffEdit(pushed);
    const local = doc();
    local.handbook[0].blocks[0].x = "Arrive fifteen minutes early.";
    const verdict = judgePush({ local, live, liveVersion: V2, base: makeBase(pushed, V1) });
    deepEq(verdict, { action: "refuse", why: "live-changed", sections: ["week"] });
  });
  it("an untouched old working copy is stopped too", () => {
    const pushed = doc();
    const verdict = judgePush({ local: doc(), live: staffEdit(pushed), liveVersion: V2, base: makeBase(pushed, V1) });
    deepEq(verdict, { action: "refuse", why: "live-changed", sections: ["week"] });
  });
  it("once the staff sections are brought across, the push goes ahead", () => {
    const pushed = doc();
    const live = staffEdit(pushed);
    const local = { ...doc(), week: live.week };
    local.handbook[0].blocks[0].x = "Arrive fifteen minutes early.";
    deepEq(judgePush({ local, live, liveVersion: V2, base: makeBase(pushed, V1) }), { action: "push" });
  });
  it("staff saved again after the pull: stopped again", () => {
    const pushed = doc();
    const firstEdit = staffEdit(pushed);
    const local = { ...doc(), week: firstEdit.week };
    const live = { ...firstEdit, week: [...firstEdit.week, { start: "2026-01-19", end: "2026-01-25", headline: "Late add" }] };
    const verdict = judgePush({ local, live, liveVersion: V2, base: makeBase(pushed, V1) });
    deepEq(verdict, { action: "refuse", why: "live-changed", sections: ["week"] });
  });
  it("both sides changed the same section differently: stop", () => {
    const pushed = doc();
    const live = doc();
    live.faq[0].a[0].x = "On the shelf by the door.";
    const local = doc();
    local.faq[0].a[0].x = "In the back room.";
    const verdict = judgePush({ local, live, liveVersion: V2, base: makeBase(pushed, V1) });
    deepEq(verdict, { action: "refuse", why: "live-changed", sections: ["faq"] });
  });
  it("only the sections staff changed are named, not the owner's own edits", () => {
    const pushed = doc();
    const live = staffEdit(pushed);
    const local = doc();
    local.dates = [];
    local.handbook[0].title = "The basics";
    const verdict = judgePush({ local, live, liveVersion: V2, base: makeBase(pushed, V1) });
    deepEq(verdict.sections, ["week"]);
  });
  it("a new version with the same content is not a change", () => {
    const pushed = doc();
    const local = doc();
    local.dates = [];
    deepEq(judgePush({ local, live: reordered(pushed), liveVersion: V2, base: makeBase(pushed, V1) }), { action: "push" });
  });
  it("a live section staff removed and local still has is at risk", () => {
    const pushed = doc();
    const live = doc();
    delete live.dates;
    const verdict = judgePush({ local: doc(), live, liveVersion: V2, base: makeBase(pushed, V1) });
    deepEq(verdict, { action: "refuse", why: "live-changed", sections: ["dates"] });
  });
  it("only the date stamp moved: go ahead", () => {
    const pushed = doc();
    const live = { ...doc(), updated: "2026-01-12" };
    const local = doc();
    local.handbook[0].title = "The basics";
    deepEq(judgePush({ local, live, liveVersion: V2, base: makeBase(pushed, V1) }), { action: "push" });
  });
});

describe("judgePush with no record on this computer", () => {
  it("nobody has saved from the dashboard: go ahead", () => {
    const local = doc();
    local.dates = [];
    deepEq(judgePush({ local, live: doc(), liveVersion: V1, base: null, dashboardSaves: 0 }), { action: "push" });
  });
  it("staff have saved from the dashboard: stop, and name where the two differ", () => {
    const local = doc();
    local.handbook[0].title = "The basics";
    const verdict = judgePush({ local, live: staffEdit(doc()), liveVersion: V2, base: null, dashboardSaves: 3 });
    deepEq(verdict, { action: "refuse", why: "no-record", sections: ["handbook", "week"] });
  });
  it("staff have saved, but only the date stamp differs: go ahead", () => {
    const live = { ...doc(), updated: "2026-01-12" };
    deepEq(judgePush({ local: doc(), live, liveVersion: V2, base: null, dashboardSaves: 3 }), { action: "push" });
  });
  it("identical documents need no record", () => {
    deepEq(judgePush({ local: doc(), live: doc(), liveVersion: V2, base: null, dashboardSaves: 3 }), { action: "same" });
  });
});

/* ------------------------------------------------------------------ *
 * the record kept between pushes
 * ------------------------------------------------------------------ */

describe("the record", () => {
  it("holds a version and hashes, and none of the content", () => {
    const base = makeBase(doc(), V1);
    eq(base.version, V1);
    deepEq(Object.keys(base.sections), ["dates", "faq", "handbook", "schema", "updated", "week"]);
    const text = JSON.stringify(withBase(null, "instructors-dev", base));
    for (const word of ["Quiet", "closet", "Studio closed", "Arrive"]) {
      if (text.includes(word)) throw new Error(`content leaked into the record: ${word}`);
    }
  });
  it("round trips through the state file", () => {
    const base = makeBase(doc(), V1);
    const state = JSON.parse(JSON.stringify(withBase(null, "instructors-dev", base)));
    deepEq(readBase(state, "instructors-dev"), base);
    eq(readBase(state, "instructors"), null);
  });
  it("keeps other slugs when one is replaced", () => {
    let state = withBase(null, "instructors-dev", makeBase(doc(), V1));
    state = withBase(state, "instructors", makeBase(staffEdit(doc()), V2));
    eq(readBase(state, "instructors-dev").version, V1);
    eq(readBase(state, "instructors").version, V2);
  });
  it("a damaged record reads as no record", () => {
    eq(readBase(null, "instructors"), null);
    eq(readBase({ slugs: { instructors: { version: "yesterday", sections: {} } } }, "instructors"), null);
    eq(readBase({ slugs: { instructors: { version: V1, sections: { week: "not-a-hash" } } } }, "instructors"), null);
    eq(readBase({ slugs: { instructors: { version: V1 } } }, "instructors"), null);
  });
  it("says what changed live since the record", () => {
    const base = makeBase(doc(), V1);
    deepEq(changedSinceBase(base, staffEdit(doc())), ["week"]);
    deepEq(changedSinceBase(base, reordered(doc())), []);
  });
});

/* ------------------------------------------------------------------ *
 * SQL text and the words shown
 * ------------------------------------------------------------------ */

describe("statements", () => {
  it("the version format is six-digit UTC", () => {
    eq(VERSION_RE.test(V1), true);
    eq(VERSION_RE.test("2026-01-05T15:00:00.000Z"), false);
    eq(VERSION_RE.test("2026-01-05 15:00:00.000001+00"), false);
  });
  it("refuse anything that is not a slug", () => {
    throws(() => liveQuery("x'; drop table t; --"));
    throws(() => dashboardSavesQuery("Instructors"));
    throws(() => guardedPushQuery("a b", "e30=", null));
  });
  it("refuse a payload or version that is not what it should be", () => {
    throws(() => guardedPushQuery("instructors-dev", "e30='); select 1; --", null));
    throws(() => guardedPushQuery("instructors-dev", "", null));
    throws(() => guardedPushQuery("instructors-dev", "e30=", "2026-01-05'; --"));
    throws(() => guardedPushQuery("instructors-dev", "e30=", undefined));
  });
  it("the write checks the version it was judged against", () => {
    const q = guardedPushQuery("instructors-dev", "e30=", V1);
    if (!q.includes(`is not distinct from '${V1}'::text`)) throw new Error("expected version missing");
    if (!q.includes("for update")) throw new Error("row lock missing");
    const first = guardedPushQuery("instructors-dev", "e30=", null);
    if (!first.includes("is not distinct from null::text")) throw new Error("first push should expect no row");
  });
});

describe("the refusal message", () => {
  const base = { sections: ["dates", "week"], liveVersion: V2, pulledFile: "private/instructor-portal/pulled-instructors.json" };
  it("names the sections, the steps and the way to override", () => {
    const text = refusalText({ ...base, why: "live-changed", slug: "instructors" });
    for (const part of ["Nothing was changed", "dates, week", "instructor-portal.mjs pull", "pulled-instructors.json", "--overwrite"]) {
      if (!text.includes(part)) throw new Error(`missing: ${part}`);
    }
    if (text.includes("--slug")) throw new Error("the default slug needs no flag");
  });
  it("keeps the slug flag for the dev portal", () => {
    const text = refusalText({ ...base, why: "no-record", slug: "instructors-dev", pulledFile: "private/instructor-portal/pulled-instructors-dev.json" });
    if (!text.includes("pull --slug instructors-dev")) throw new Error("pull step lost its slug");
    if (!text.includes("push --slug instructors-dev --overwrite")) throw new Error("push step lost its slug");
  });
  it("has no em dash", () => {
    for (const why of ["live-changed", "no-record"]) {
      if (refusalText({ ...base, why, slug: "instructors" }).includes(String.fromCharCode(0x2014))) throw new Error("em dash");
    }
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
