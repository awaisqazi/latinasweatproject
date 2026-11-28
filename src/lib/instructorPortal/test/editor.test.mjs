// Instructor portal · editor helper tests.  node src/lib/instructorPortal/test/editor.test.mjs
//
// PRIVACY: every name, address and sentence below is invented for this file.
// Real portal content lives in private/ and never enters the repo, not in
// fixtures, not in comments, not in output.

import {
  EDITABLE_SECTIONS, EDITABLE_KEYS, clone, sameValue,
  mondayOf, nextWeekRange, blankWeek, weekStatus, portalWeekLine,
  cleanList, splitLines, flattenNotes, notesAsList, cleanBlocks, blocksToText, textToBlocks,
  blankDate, cleanDate, sortDates, isPastDate,
  prepareForSave, changedSections, isDirty, rebaseDraft, plainProblems,
} from "../editor.js";
import { validateContent } from "../schema.js";

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

/* ------------------------------------------------------------------ *
 * fixture (invented people and text only)
 * ------------------------------------------------------------------ */

const VALID = {
  schema: 1,
  updated: "2026-11-20",
  week: [
    { start: "2026-11-16", end: "2026-11-22", headline: "Opening week", notes: [{ t: "ul", items: ["Doors open at 6", "Bring a water bottle"] }], shoutouts: ["Thanks, Rosa Example"] },
    { start: "2026-11-23", end: "2026-11-29", headline: "Holiday week", notes: [{ t: "p", x: "Short week." }] },
  ],
  dates: [
    { date: "2026-12-01", time: "All day", title: "Giving day", text: "Share your page." },
    { date: "2026-12-19", title: "Winter party", href: "/posada/", cta: "Details" },
  ],
  handbook: {
    title: "Instructor handbook",
    version: "1.0",
    effective: "November 2026",
    appliesTo: "All instructors",
    sections: [{ id: "arrival", title: "Arriving for class", blocks: [{ t: "p", x: "Arrive 15 minutes early." }] }],
  },
  faq: [
    { id: "pay-dates", group: "Pay", q: "When is payday?", a: [{ t: "p", x: "Every other **Friday**." }], pending: false },
    { id: "parking", group: "Studio", q: "Where do I park?", a: [{ t: "p", x: "Policy coming soon." }], pending: true, ask: { who: "Dana Placeholder", email: "dana@example.org" } },
  ],
  contacts: [{ area: "Scheduling", for: "Subs and swaps", who: "Sam Sample", emails: ["sam@example.org"], phones: ["555-010-0123"] }],
};

const TODAY = "2026-11-27";

/* ------------------------------------------------------------------ *
 * values
 * ------------------------------------------------------------------ */

describe("fixture and constants", () => {
  it("the fixture is valid", () => {
    deepEq(validateContent(VALID).errors, []);
  });
  it("section and key lists", () => {
    deepEq(EDITABLE_SECTIONS, ["week", "dates", "faq"]);
    deepEq(EDITABLE_KEYS, ["updated", "week", "dates", "faq"]);
  });
});

describe("clone and sameValue", () => {
  it("clone is deep and passes undefined through", () => {
    const c = clone(VALID);
    deepEq(c, VALID);
    c.week[0].notes[0].items[0] = "changed";
    eq(VALID.week[0].notes[0].items[0], "Doors open at 6");
    eq(clone(undefined), undefined);
  });
  it("sameValue ignores key order, not array order", () => {
    ok(sameValue({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 }));
    ok(!sameValue([1, 2], [2, 1]));
    ok(!sameValue({ a: 1 }, { a: 1, b: 2 }));
    ok(!sameValue({ a: "1" }, { a: 1 }));
    ok(!sameValue([], {}));
    ok(sameValue(undefined, undefined));
    ok(!sameValue(null, {}));
  });
});

/* ------------------------------------------------------------------ *
 * weeks
 * ------------------------------------------------------------------ */

describe("mondayOf", () => {
  it("a Monday is itself, a Sunday goes back six days", () => {
    eq(mondayOf("2026-11-23"), "2026-11-23");
    eq(mondayOf("2026-11-29"), "2026-11-23");
    eq(mondayOf("2026-11-27"), "2026-11-23");
  });
  it("crosses month and year boundaries", () => {
    eq(mondayOf("2026-12-02"), "2026-11-30");
    eq(mondayOf("2027-01-02"), "2026-12-28");
  });
  it("non-dates give an empty string", () => {
    eq(mondayOf("2026-02-30"), "");
    eq(mondayOf(""), "");
    eq(mondayOf(undefined), "");
  });
});

describe("nextWeekRange", () => {
  it("this week when it is free", () => {
    deepEq(nextWeekRange([], TODAY), { start: "2026-11-23", end: "2026-11-29" });
    deepEq(nextWeekRange(undefined, TODAY), { start: "2026-11-23", end: "2026-11-29" });
    deepEq(nextWeekRange("nope", TODAY), { start: "2026-11-23", end: "2026-11-29" });
  });
  it("next week when this week is taken", () => {
    deepEq(nextWeekRange(VALID.week, TODAY), { start: "2026-11-30", end: "2026-12-06" });
  });
  it("skips two taken weeks, and any overlap counts", () => {
    const weeks = [...VALID.week, { start: "2026-12-05", end: "2026-12-05" }];
    deepEq(nextWeekRange(weeks, TODAY), { start: "2026-12-07", end: "2026-12-13" });
  });
  it("ignores invalid entries", () => {
    deepEq(nextWeekRange([{ start: "bad", end: "2026-11-29" }, { start: "2026-11-29", end: "2026-11-23" }, null], TODAY), { start: "2026-11-23", end: "2026-11-29" });
  });
  it("stops after 60 weeks", () => {
    const r = nextWeekRange([{ start: "2026-01-01", end: "2030-01-01" }], TODAY);
    eq(r.start, "2028-01-10");
    eq(r.end, "2028-01-16");
  });
});

describe("blankWeek and weekStatus", () => {
  it("blankWeek shape", () => {
    deepEq(blankWeek({ start: "2026-11-30", end: "2026-12-06" }), {
      start: "2026-11-30", end: "2026-12-06", headline: "", notes: [{ t: "ul", items: [""] }], shoutouts: [],
    });
  });
  it("statuses", () => {
    eq(weekStatus(VALID.week[1], TODAY), "current");
    eq(weekStatus({ start: "2026-11-27", end: "2026-11-27" }, TODAY), "current");
    eq(weekStatus(VALID.week[0], TODAY), "past");
    eq(weekStatus({ start: "2026-11-30", end: "2026-12-06" }, TODAY), "upcoming");
    eq(weekStatus({ start: "2026-12-06", end: "2026-11-30" }, TODAY), "invalid");
    eq(weekStatus({ start: "", end: "2026-11-30" }, TODAY), "invalid");
    eq(weekStatus(null, TODAY), "invalid");
  });
});

describe("portalWeekLine", () => {
  it("current", () => {
    eq(portalWeekLine(VALID.week, TODAY), "Instructors see the note for Nov 23 to 29 right now.");
  });
  it("past", () => {
    eq(portalWeekLine(VALID.week, "2026-12-01"), "No note covers this week yet. Instructors see the Nov 23 to 29 note, labelled as last week's.");
  });
  it("stale", () => {
    eq(portalWeekLine(VALID.week, "2026-12-20"), "The newest note ended more than 14 days ago, so the portal hides notes and shows only Coming up.");
  });
  it("none", () => {
    eq(portalWeekLine([], TODAY), "There is no note for this week yet. The portal shows only Coming up.");
  });
});

/* ------------------------------------------------------------------ *
 * lists and blocks
 * ------------------------------------------------------------------ */

describe("cleanList and splitLines", () => {
  it("cleanList trims and drops blanks and non-strings", () => {
    deepEq(cleanList([" a ", "", "  ", 3, null, "b"]), ["a", "b"]);
    deepEq(cleanList("a"), []);
  });
  it("splitLines strips one marker of each kind", () => {
    deepEq(splitLines("- one\n* two\n• three\n· four\n– five\n1. six\n12) seven\n\n  eight  \r\n"), ["one", "two", "three", "four", "five", "six", "seven", "eight"]);
  });
  it("splitLines strips only one marker and leaves **bold** alone", () => {
    deepEq(splitLines("**Bold** start\n- - nested\n2026 was fun\n-no space"), ["**Bold** start", "- nested", "2026 was fun", "-no space"]);
    deepEq(splitLines(undefined), []);
  });
});

describe("flattenNotes and notesAsList", () => {
  const mixed = [{ t: "h", x: "Heads up" }, { t: "p", x: "  " }, { t: "ul", items: ["a", 4, "b"] }, { t: "ol", items: ["c"] }, { t: "p", x: "End." }];
  it("flattenNotes", () => {
    deepEq(flattenNotes(mixed), ["Heads up", "a", "b", "c", "End."]);
    deepEq(flattenNotes(null), []);
  });
  it("simple when missing, empty or one bullet list", () => {
    deepEq(notesAsList(undefined), { simple: true, items: [] });
    deepEq(notesAsList([]), { simple: true, items: [] });
    deepEq(notesAsList([{ t: "ul", items: ["a", 2, ""] }]), { simple: true, items: ["a", "", ""] });
  });
  it("not simple otherwise", () => {
    deepEq(notesAsList(mixed), { simple: false, items: ["Heads up", "a", "b", "c", "End."] });
    deepEq(notesAsList([{ t: "p", x: "Only a paragraph" }]), { simple: false, items: ["Only a paragraph"] });
    deepEq(notesAsList([{ t: "ul", items: ["a"] }, { t: "ul", items: ["b"] }]).simple, false);
  });
});

describe("cleanBlocks", () => {
  it("trims, drops empty blocks, keeps unknown ones", () => {
    const odd = { t: "div", x: "keep me" };
    const input = [{ t: "ul", items: [" a ", ""] }, { t: "ol", items: ["", " "] }, { t: "p", x: "  hi " }, { t: "h", x: "" }, { t: "p", x: 4 }, odd, "str"];
    const out = cleanBlocks(input);
    deepEq(out, [{ t: "ul", items: ["a"] }, { t: "p", x: "hi" }, odd, "str"]);
    eq(out[2], odd, "unknown block kept untouched");
    eq(input[0].items.length, 2, "input not mutated");
  });
  it("non-arrays come back as is", () => {
    eq(cleanBlocks(undefined), undefined);
    eq(cleanBlocks("x"), "x");
  });
});

describe("blocksToText and textToBlocks", () => {
  const blocks = [
    { t: "h", x: "This week" },
    { t: "p", x: "Welcome back, see [the board](/subs/)." },
    { t: "ul", items: ["**Bring** a mat", "Doors at 6"] },
    { t: "ol", items: ["Sign in", "Set up"] },
    { t: "p", x: "Thanks." },
  ];
  it("writes the expected text", () => {
    eq(blocksToText(blocks), "## This week\n\nWelcome back, see [the board](/subs/).\n\n- **Bring** a mat\n- Doors at 6\n\n1. Sign in\n2. Set up\n\nThanks.");
    eq(blocksToText([]), "");
    eq(blocksToText(null), "");
  });
  it("round trips", () => {
    ok(sameValue(textToBlocks(blocksToText(blocks)), blocks));
    const two = [{ t: "ul", items: ["a"] }, { t: "ul", items: ["b"] }, { t: "p", x: "x" }, { t: "p", x: "y" }];
    ok(sameValue(textToBlocks(blocksToText(two)), two));
  });
  it("paragraph lines join, and a list straight after a paragraph starts a new block", () => {
    deepEq(textToBlocks("First line\nsecond line\n- one\n* two\nAfter list\n3) three\n# Big"), [
      { t: "p", x: "First line second line" },
      { t: "ul", items: ["one", "two"] },
      { t: "p", x: "After list" },
      { t: "ol", items: ["three"] },
      { t: "h", x: "Big" },
    ]);
  });
  it("blank text gives no blocks, **bold** is a paragraph", () => {
    deepEq(textToBlocks("  \n\n "), []);
    deepEq(textToBlocks(undefined), []);
    deepEq(textToBlocks("**Bold** start"), [{ t: "p", x: "**Bold** start" }]);
  });
});

/* ------------------------------------------------------------------ *
 * dates
 * ------------------------------------------------------------------ */

describe("dates", () => {
  it("blankDate", () => {
    deepEq(blankDate(), { date: "", title: "" });
  });
  it("cleanDate trims and removes blank optionals and an end equal to date", () => {
    const input = { date: " 2026-12-19 ", end: "2026-12-19", time: " ", title: " Winter party ", text: "", href: "  /posada/ ", cta: "", extra: " kept " };
    deepEq(cleanDate(input), { date: "2026-12-19", title: "Winter party", href: "/posada/", extra: "kept" });
    eq(input.time, " ", "input not mutated");
    deepEq(cleanDate({ date: "2026-12-19", end: "2026-12-21", title: "Run" }), { date: "2026-12-19", end: "2026-12-21", title: "Run" });
    deepEq(cleanDate({ date: "", title: "" }), { date: "", title: "" });
    eq(cleanDate(null), null);
  });
  it("sortDates is stable and puts undated entries last", () => {
    const list = [
      { date: "", title: "Blank 1" },
      { date: "2026-12-19", title: "Party" },
      { date: "2026-12-01", end: "2026-12-03", title: "Long" },
      { date: "2026-12-01", title: "Short" },
      { date: "2026-12-19", title: "Party 2" },
      { date: "soon", title: "Blank 2" },
    ];
    deepEq(sortDates(list).map((d) => d.title), ["Short", "Long", "Party", "Party 2", "Blank 1", "Blank 2"]);
    eq(list[0].title, "Blank 1", "input order kept");
    deepEq(sortDates(null), []);
  });
  it("isPastDate", () => {
    eq(isPastDate({ date: "2026-11-26" }, TODAY), true);
    eq(isPastDate({ date: "2026-11-27" }, TODAY), false);
    eq(isPastDate({ date: "2026-11-20", end: "2026-11-28" }, TODAY), false);
    eq(isPastDate({ date: "2026-11-20", end: "bad" }, TODAY), true);
    eq(isPastDate({ date: "" }, TODAY), false);
    eq(isPastDate(null, TODAY), false);
  });
});

/* ------------------------------------------------------------------ *
 * prepareForSave
 * ------------------------------------------------------------------ */

describe("prepareForSave", () => {
  it("does not mutate its input and leaves read-only sections deep-equal", () => {
    const draft = clone(VALID);
    draft.week[0].headline = "  Opening week  ";
    draft.handbook.extraNote = " left alone ";
    const before = clone(draft);
    const out = prepareForSave(draft, TODAY);
    deepEq(draft, before);
    ok(sameValue(out.handbook, draft.handbook));
    ok(sameValue(out.contacts, draft.contacts));
    eq(out.schema, 1);
    eq(out.week[0].headline, "Opening week");
  });
  it("sorts weeks, cleans notes and shoutouts, keeps missing keys missing", () => {
    const draft = clone(VALID);
    draft.week.reverse();
    draft.week.push({ start: "", end: "", headline: "No dates yet" });
    draft.week[0].shoutouts = ["", " Lupe Sample "];
    draft.week[1].notes = [{ t: "ul", items: ["Doors open at 6", ""] }];
    const out = prepareForSave(draft, TODAY);
    deepEq(out.week.map((w) => w.headline), ["Opening week", "Holiday week", "No dates yet"]);
    deepEq(out.week[1].shoutouts, ["Lupe Sample"]);
    deepEq(out.week[0].notes, [{ t: "ul", items: ["Doors open at 6"] }]);
    ok(!("notes" in out.week[2]) && !("shoutouts" in out.week[2]));
  });
  it("cleans and sorts dates, cleans faq answers only", () => {
    const draft = clone(VALID);
    draft.dates.reverse();
    draft.dates[0].cta = " ";
    draft.faq[0].q = "  When is payday?  ";
    draft.faq[0].a = [{ t: "p", x: " Every other **Friday**. " }, { t: "p", x: "" }];
    const out = prepareForSave(draft, TODAY);
    deepEq(out.dates.map((d) => d.title), ["Giving day", "Winter party"]);
    ok(!("cta" in out.dates[1]));
    deepEq(out.faq[0].a, [{ t: "p", x: "Every other **Friday**." }]);
    eq(out.faq[0].q, "  When is payday?  ", "faq q untouched");
  });
  it("sets updated only for a real date", () => {
    eq(prepareForSave(VALID, TODAY).updated, TODAY);
    eq(prepareForSave(VALID).updated, "2026-11-20");
    eq(prepareForSave(VALID, "soon").updated, "2026-11-20");
    eq(prepareForSave(null, TODAY), null);
  });
  it("a filled-in blankWeek validates", () => {
    const draft = clone(VALID);
    const w = blankWeek(nextWeekRange(draft.week, TODAY));
    w.headline = "Week three";
    w.notes[0].items = ["Bring a towel", ""];
    w.shoutouts.push("");
    draft.week.push(w);
    const r = validateContent(prepareForSave(draft, TODAY));
    deepEq(r.errors, []);
    deepEq(r.warnings, []);
  });
  it("a blankWeek left with a blank headline warns rather than errors", () => {
    const draft = clone(VALID);
    draft.week.push(blankWeek(nextWeekRange(draft.week, TODAY)));
    const r = validateContent(prepareForSave(draft, TODAY));
    deepEq(r.errors, []);
    deepEq(r.warnings, ["content.week[2].headline: is empty, so the page shows nothing there"]);
  });
});

/* ------------------------------------------------------------------ *
 * changedSections, isDirty, rebaseDraft
 * ------------------------------------------------------------------ */

describe("changedSections and isDirty", () => {
  it("nothing changed, and updated is ignored", () => {
    const draft = clone(VALID);
    draft.updated = "2026-11-27";
    deepEq(changedSections(VALID, draft), []);
    eq(isDirty(VALID, draft), false);
  });
  it("blank rows and stray spaces are not changes", () => {
    const draft = clone(VALID);
    draft.week[0].notes[0].items.push("", "  ");
    draft.week[0].shoutouts.push("");
    draft.faq[1].a.push({ t: "p", x: " " });
    draft.dates[0].cta = "";
    draft.dates[1].title = "Winter party  ";
    deepEq(changedSections(VALID, draft), []);
  });
  it("a missing key and an undefined key are the same", () => {
    const draft = clone(VALID);
    draft.faq = undefined;
    const base = clone(VALID);
    delete base.faq;
    deepEq(changedSections(base, draft), []);
  });
  it("a missing section and an empty list are the same", () => {
    const base = clone(VALID);
    delete base.dates;
    const draft = clone(base);
    draft.dates = [];
    deepEq(changedSections(base, draft), []);
    eq(isDirty(base, draft), false);
    const r = rebaseDraft(base, draft, clone(base));
    deepEq(r.carried, []);
    deepEq(r.clashes, []);
    draft.dates.push({ date: "2026-12-10", title: "Staff meeting" });
    deepEq(changedSections(base, draft), ["dates"]);
  });
  it("sees a real edit in each section", () => {
    const w = clone(VALID); w.week[1].headline = "Short holiday week";
    const d = clone(VALID); d.dates.push({ date: "2026-12-10", title: "Staff meeting" });
    const f = clone(VALID); f.faq[1].pending = false;
    deepEq(changedSections(VALID, w), ["week"]);
    deepEq(changedSections(VALID, d), ["dates"]);
    deepEq(changedSections(VALID, f), ["faq"]);
    const all = clone(w); all.dates = d.dates; all.faq = f.faq;
    deepEq(changedSections(VALID, all), ["week", "dates", "faq"]);
    eq(isDirty(VALID, all), true);
  });
});

describe("rebaseDraft", () => {
  it("carries my change over theirs when they did not touch it", () => {
    const mine = clone(VALID); mine.week[1].headline = "Mine";
    const theirs = clone(VALID); theirs.dates.push({ date: "2026-12-10", title: "Theirs" }); theirs.updated = "2026-11-26";
    const before = [clone(mine), clone(theirs)];
    const r = rebaseDraft(VALID, mine, theirs);
    deepEq(r.carried, ["week"]);
    deepEq(r.clashes, []);
    eq(r.doc.week[1].headline, "Mine");
    eq(r.doc.dates.length, 3);
    eq(r.doc.updated, "2026-11-26");
    deepEq([mine, theirs], before, "arguments not mutated");
    r.doc.week[1].headline = "x";
    eq(mine.week[1].headline, "Mine", "doc does not share objects with mine");
  });
  it("removes a section I deleted", () => {
    const mine = clone(VALID); delete mine.faq;
    const r = rebaseDraft(VALID, mine, clone(VALID));
    deepEq(r.carried, ["faq"]);
    ok(!("faq" in r.doc));
  });
  it("reports a clash and keeps theirs", () => {
    const mine = clone(VALID); mine.faq[0].q = "When do we get paid?";
    const theirs = clone(VALID); theirs.faq[0].q = "What day is payday?";
    const r = rebaseDraft(VALID, mine, theirs);
    deepEq(r.carried, []);
    deepEq(r.clashes, ["faq"]);
    eq(r.doc.faq[0].q, "What day is payday?");
  });
  it("the same change on both sides is neither", () => {
    const mine = clone(VALID); mine.dates[0].title = "Giving Day";
    const theirs = clone(VALID); theirs.dates[0].title = "Giving Day ";
    const r = rebaseDraft(VALID, mine, theirs);
    deepEq(r.carried, []);
    deepEq(r.clashes, []);
    eq(r.doc.dates[0].title, "Giving Day ");
  });
  it("nothing changed anywhere", () => {
    const r = rebaseDraft(VALID, clone(VALID), clone(VALID));
    deepEq(r, { doc: VALID, carried: [], clashes: [] });
  });
});

/* ------------------------------------------------------------------ *
 * plainProblems
 * ------------------------------------------------------------------ */

describe("plainProblems", () => {
  const problemsFor = (doc) => plainProblems(validateContent(doc), doc);
  const find = (list, raw) => {
    const p = list.find((x) => x.raw.startsWith(raw));
    if (!p) throw new Error(`no problem for ${raw} in ${JSON.stringify(list.map((x) => x.raw))}`);
    return p;
  };

  it("week errors", () => {
    const d = clone(VALID);
    d.week[1].end = "2026-11-20";
    d.week[0].start = "Nov 16";
    const r = problemsFor(d);
    const a = find(r.errors, "content.week[1].end");
    deepEq({ section: a.section, index: a.index, where: a.where, message: a.message }, {
      section: "week", index: 1, where: "The week starting Nov 23", message: "the end date is before the start date",
    });
    eq(a.text, "The week starting Nov 23: the end date is before the start date.");
    const b = find(r.errors, "content.week[0].start");
    eq(b.message, "the start date is not a real date");
    eq(b.where, 'The week "Opening week"', "no usable start date: named by its headline");
    d.week[0].headline = " ";
    eq(find(problemsFor(d).errors, "content.week[0].start").where, "Week entry 1", "nothing to name it by");
  });
  it("week label uses the range", () => {
    const d = clone(VALID);
    d.week[1] = { start: "2026-11-30", end: "2026-12-06", headline: "Next", notes: [{ t: "p", x: "Read [this](javascript:alert(1))." }] };
    const p = find(problemsFor(d).errors, "content.week[1].notes[0].x");
    eq(p.where, "Week of Nov 30 to Dec 6");
    eq(p.message, 'the link "javascript:alert(1" behind "this" will not work. A link must start with https://, or be a page on this site such as /subs/, or start with mailto: or tel:');
  });
  it("dates errors", () => {
    const d = clone(VALID);
    d.dates[1].href = "http://example.org";
    d.dates[1].end = "2026-12-01";
    d.dates.push({ date: "", title: "" });
    d.dates.push({ date: "2026-12-24" });
    const r = problemsFor(d);
    const href = find(r.errors, "content.dates[1].href");
    eq(href.where, "Winter party (Dec 19)");
    eq(href.text, 'Winter party (Dec 19): the link "http://example.org" will not work. A link must start with https://, or be a page on this site such as /subs/, or start with mailto: or tel:.');
    eq(find(r.errors, "content.dates[1].end").message, "the last day is before the date");
    const blank = find(r.errors, "content.dates[2].date");
    eq(blank.where, "The date with no title");
    eq(blank.message, "the date is missing");
    const noTitle = find(r.errors, "content.dates[3].title");
    eq(noTitle.where, "The date on Dec 24");
    eq(noTitle.message, "the title is missing");
  });
  it("faq errors", () => {
    const d = clone(VALID);
    delete d.faq[0].a;
    d.faq[1].pending = "maybe";
    d.faq[1].q = "What happens when a class is cancelled at the very last minute by the studio?";
    const r = problemsFor(d);
    const a = find(r.errors, "content.faq[0].a");
    eq(a.where, '"When is payday?"');
    eq(a.message, "the answer is missing");
    const p = find(r.errors, "content.faq[1].pending");
    eq(p.message, "the not-written-yet setting is not on or off");
    ok(p.where.startsWith('"What happens') && p.where.endsWith('..."') && p.where.length <= 62, p.where);
  });
  it("faq inline link error", () => {
    const d = clone(VALID);
    d.faq[0].a = [{ t: "ul", items: ["Ask [the desk](ftp://desk.example.org)"] }];
    const p = find(problemsFor(d).errors, "content.faq[0].a[0].items[0]");
    eq(p.section, "faq");
    eq(p.index, 0);
    eq(p.message, 'the link "ftp://desk.example.org" behind "the desk" will not work. A link must start with https://, or be a page on this site such as /subs/, or start with mailto: or tel:');
  });
  it("other errors", () => {
    const d = clone(VALID);
    d.contacts[0].emails = ["nope"];
    const p = find(problemsFor(d).errors, "content.contacts[0].emails[0]");
    eq(p.section, "other");
    eq(p.index, null);
    eq(p.where, "Another part of the portal");
    eq(p.text, 'Another part of the portal has a problem this editor cannot fix (contacts[0].emails[0]: does not look like an email address ("nope")). Tell the site owner.');
  });
  it("warnings: only editable sections, in plain words", () => {
    const d = clone(VALID);
    d.week[0].headline = "";
    d.week[1].notes = [{ t: "p", x: "<b>Loud</b> week" }];
    d.dates[0].title = " ";
    d.handbook.title = "";
    d.extra = true;
    const r = problemsFor(d);
    deepEq(r.errors, []);
    deepEq(r.warnings.map((w) => w.text), [
      "Week of Nov 16 to 22: the headline is empty.",
      "The date on Dec 1: the title is empty.",
      "Week of Nov 23 to 29: the notes contain HTML tags, which show as typed.",
    ]);
    ok(validateContent(d).warnings.length > r.warnings.length, "handbook and unknown-key warnings were dropped");
  });
  it("errors keep the validator's order; missing input gives nothing", () => {
    const d = clone(VALID);
    d.week[0].end = "x";
    d.dates[0].date = "y";
    d.faq[0].a = null;
    const res = validateContent(d);
    deepEq(plainProblems(res, d).errors.map((p) => p.raw), res.errors);
    deepEq(plainProblems(undefined, d), { errors: [], warnings: [] });
    deepEq(plainProblems(res, null), { errors: [], warnings: [] });
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
