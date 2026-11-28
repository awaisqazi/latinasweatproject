// Instructor portal · logic tests.  node src/lib/instructorPortal/test/run.mjs
//
// PRIVACY: every name, address and number below is invented for this file. Real
// portal content lives in private/ and never enters the repo, not in fixtures,
// not in comments, not in output.

import {
  parseInline, safeHref, isExternal, plainText,
  isDateString, addDays, daysBetween, chicagoToday,
  visibleDates, currentWeek, stillOpen, searchPortal, searchWords, wordStarts, foldText,
} from "../richText.js";
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
function hasError(result, needle) {
  if (result.errors.some((e) => e.includes(needle))) return;
  throw new Error(`no error containing ${JSON.stringify(needle)} in ${JSON.stringify(result.errors)}`);
}
const clone = (v) => JSON.parse(JSON.stringify(v));

/* ------------------------------------------------------------------ *
 * fixture (invented people and numbers only)
 * ------------------------------------------------------------------ */

const VALID = {
  schema: 1,
  updated: "2026-11-20",
  period: { label: "Winter session", start: "2026-11-16", end: "2026-12-31" },
  week: [
    { start: "2026-11-16", end: "2026-11-22", headline: "Opening week", notes: [{ t: "p", x: "Welcome to the **new room**." }], shoutouts: ["Thanks, Rosa Example"] },
    { start: "2026-11-23", end: "2026-11-29", headline: "Holiday week", notes: [] },
  ],
  dates: [
    { date: "2026-12-19", title: "Winter party", href: "/posada/", cta: "Details" },
    { date: "2026-12-01", time: "All day", title: "Giving day", text: "Share your page." },
  ],
  actions: [{ id: "request-sub", label: "Request a sub", text: "Use the form.", href: "/subs/" }],
  handbook: {
    title: "Instructor handbook",
    version: "1.0",
    effective: "November 2026",
    appliesTo: "All instructors",
    original: { label: "Original PDF", href: "https://drive.example.org/file" },
    sections: [
      { id: "arrival", title: "Arriving for class", blocks: [{ t: "p", x: "Arrive 15 minutes early." }] },
      { id: "music", title: "Music and sound", blocks: [{ t: "ul", items: ["Keep the volume kind", "Use the studio speaker"] }] },
    ],
  },
  faq: [
    { id: "pay-dates", group: "Pay", q: "When is payday?", a: [{ t: "p", x: "Every other **Friday**." }], pending: false },
    { id: "inscripcion", group: "Classes", q: "How does inscripción work?", a: [{ t: "p", x: "See [the schedule](/schedule/)." }], pending: false },
    { id: "parking", group: "Studio", q: "Where do I park?", a: [{ t: "p", x: "Policy coming soon." }], pending: true, ask: { who: "Dana Placeholder", email: "dana@example.org", phone: "(555) 010-0199" } },
  ],
  contacts: [{ area: "Scheduling", for: "Subs and swaps", who: "Sam Sample", emails: ["sam@example.org"], phones: ["555-010-0123"] }],
  volunteer: [{ title: "Setup crew", when: "Saturdays", text: "Help set up.", href: "/movecrew/", cta: "Sign up", until: "2026-11-28" }],
  committees: { text: [{ t: "p", x: "Join a committee." }], href: "/committee/", cta: "Apply" },
  fundraising: { text: [{ t: "p", x: "Help us raise." }], links: [{ label: "Give", text: "Our page", href: "/givingtuesday/" }], contact: { who: "Fran Fictional", emails: ["fran@example.org"] } },
  coordinators: {
    intro: [{ t: "p", x: "For desk coordinators." }],
    schedule: {
      label: "Desk shifts",
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      rows: [{ time: "9 am", who: ["Ana", "Ben", "", "Cy", "Dee"] }],
      weekend: [{ day: "Saturday", time: "8 am", who: "Eve" }],
    },
    tools: [{ label: "Booking admin", text: "Check in guests.", href: "https://booking.example.org/admin" }],
    todos: [{ title: "Opening", items: ["Lights on", "Unlock door"], pending: false }],
    find: { items: [{ what: "Mats", where: "Closet B" }], pending: true, note: "List not finished." },
  },
  links: [{ label: "Home", href: "/" }],
};

/* ------------------------------------------------------------------ *
 * safeHref
 * ------------------------------------------------------------------ */

describe("safeHref", () => {
  it("accepts site-relative, https, mailto, tel", () => {
    eq(safeHref("/subs/"), "/subs/");
    eq(safeHref("/"), "/");
    eq(safeHref("https://example.org/a?b=c#d"), "https://example.org/a?b=c#d");
    eq(safeHref("mailto:someone@example.org"), "mailto:someone@example.org");
    eq(safeHref("tel:+15550100123"), "tel:+15550100123");
    eq(safeHref("tel:555-010-0123"), "tel:555-010-0123");
  });
  it("accepts mixed-case allowed schemes", () => {
    eq(safeHref("HTTPS://Example.org/"), "HTTPS://Example.org/");
    eq(safeHref("MailTo:a@example.org"), "MailTo:a@example.org");
    eq(safeHref("TEL:5550100"), "TEL:5550100");
  });
  it("trims surrounding whitespace", () => {
    eq(safeHref("  https://example.org/  "), "https://example.org/");
    eq(safeHref("\n/subs/"), "/subs/");
  });
  it("rejects dangerous and unsupported schemes", () => {
    for (const bad of [
      "javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "\tjavascript:alert(1)",
      "java\tscript:alert(1)", "data:text/html,<b>x</b>", "DATA:text/html;base64,AAAA",
      "vbscript:x", "http://example.org", "ftp://example.org", "file:///etc/passwd",
    ]) eq(safeHref(bad), null, bad);
  });
  it("rejects protocol-relative and backslash tricks", () => {
    for (const bad of ["//evil.example", "//evil.example/path", "/\\evil.example", "\\\\evil.example", "https://"]) {
      eq(safeHref(bad), null, bad);
    }
  });
  it("rejects userinfo, inner whitespace, odd hosts, non-strings", () => {
    eq(safeHref("https://latinasweatproject.com@evil.example/"), null);
    eq(safeHref("https://exa mple.org"), null);
    eq(safeHref("https://localhost/"), null);
    eq(safeHref("relative/path"), null);
    eq(safeHref("#section"), null);
    eq(safeHref(""), null);
    eq(safeHref(null), null);
    eq(safeHref(42), null);
    eq(safeHref("tel:call-me"), null);
    eq(safeHref("mailto:"), null);
  });
  it("marks off-site https as external only", () => {
    eq(isExternal("https://example.org/"), true);
    eq(isExternal("https://latinasweatproject.com/gala/"), false);
    eq(isExternal("https://WWW.LatinaSweatProject.com/"), false);
    eq(isExternal("https://latinasweatproject.com.evil.example/"), true);
    eq(isExternal("/subs/"), false);
    eq(isExternal("mailto:a@example.org"), false);
  });
});

/* ------------------------------------------------------------------ *
 * parseInline
 * ------------------------------------------------------------------ */

describe("parseInline", () => {
  it("plain text is one text part", () => {
    deepEq(parseInline("Just words."), [{ type: "text", value: "Just words." }]);
  });
  it("empty and non-string give no parts", () => {
    deepEq(parseInline(""), []);
    deepEq(parseInline(undefined), []);
    deepEq(parseInline({ x: 1 }), []);
  });
  it("parses strong and links in order", () => {
    deepEq(parseInline("Read **this** and [the page](/subs/) or [mail](mailto:a@example.org) or [site](https://example.org/x)."), [
      { type: "text", value: "Read " },
      { type: "strong", value: "this" },
      { type: "text", value: " and " },
      { type: "link", label: "the page", href: "/subs/", external: false },
      { type: "text", value: " or " },
      { type: "link", label: "mail", href: "mailto:a@example.org", external: false },
      { type: "text", value: " or " },
      { type: "link", label: "site", href: "https://example.org/x", external: true },
      { type: "text", value: "." },
    ]);
  });
  it("an unsafe link renders as its label in plain text", () => {
    deepEq(parseInline("Click [here](javascript:alert(1)) now"), [{ type: "text", value: "Click here) now" }]);
    deepEq(parseInline("Go [there](//evil.example) ok"), [{ type: "text", value: "Go there ok" }]);
    deepEq(parseInline("[x](data:text/html,hi)"), [{ type: "text", value: "x" }]);
  });
  it("HTML stays literal text", () => {
    deepEq(parseInline("<b>hi</b> <script>x</script>"), [{ type: "text", value: "<b>hi</b> <script>x</script>" }]);
  });
  it("unmatched or empty markers stay literal", () => {
    deepEq(parseInline("2 ** 3 and ****"), [{ type: "text", value: "2 ** 3 and ****" }]);
    deepEq(parseInline("[no link] (here)"), [{ type: "text", value: "[no link] (here)" }]);
  });
  it("plainText keeps labels, drops urls and markers", () => {
    eq(plainText("See **this** at [the page](/subs/)."), "See this at the page.");
  });
});

/* ------------------------------------------------------------------ *
 * dates
 * ------------------------------------------------------------------ */

describe("date strings", () => {
  it("isDateString checks the calendar", () => {
    ok(isDateString("2026-02-28"));
    ok(isDateString("2028-02-29"));
    ok(!isDateString("2026-02-29"));
    ok(!isDateString("2026-13-01"));
    ok(!isDateString("2026-1-01"));
    ok(!isDateString("2026-11-25T00:00"));
    ok(!isDateString(20261125));
  });
  it("addDays and daysBetween cross month, year and DST", () => {
    eq(addDays("2026-11-30", 1), "2026-12-01");
    eq(addDays("2026-12-31", 1), "2027-01-01");
    eq(addDays("2026-03-08", 1), "2026-03-09");
    eq(addDays("2026-11-01", -1), "2026-10-31");
    eq(daysBetween("2026-11-22", "2026-12-06"), 14);
    eq(daysBetween("2026-03-07", "2026-03-09"), 2);
  });
  it("chicagoToday uses Chicago, not UTC", () => {
    // 03:30 UTC on Nov 26 is still the evening of Nov 25 in Chicago.
    eq(chicagoToday(new Date("2026-11-26T03:30:00Z")), "2026-11-25");
    eq(chicagoToday(new Date("2026-11-26T06:30:00Z")), "2026-11-26");
    ok(isDateString(chicagoToday()));
  });
});

describe("currentWeek", () => {
  const weeks = VALID.week;
  it("finds the entry containing today, inclusive at both ends", () => {
    eq(currentWeek(weeks, "2026-11-16").entry.headline, "Opening week");
    eq(currentWeek(weeks, "2026-11-22").status, "current");
    eq(currentWeek(weeks, "2026-11-22").entry.headline, "Opening week");
  });
  it("switches across the week boundary", () => {
    eq(currentWeek(weeks, "2026-11-23").entry.headline, "Holiday week");
    eq(currentWeek(weeks, "2026-11-29").entry.headline, "Holiday week");
  });
  it("after the last entry: most recent past, with days ago", () => {
    const r = currentWeek(weeks, "2026-11-30");
    eq(r.status, "past");
    eq(r.entry.headline, "Holiday week");
    eq(r.endedDaysAgo, 1);
  });
  it("14 days after the end is still past, 15 is stale", () => {
    eq(currentWeek(weeks, "2026-12-13").status, "past");
    eq(currentWeek(weeks, "2026-12-13").endedDaysAgo, 14);
    eq(currentWeek(weeks, "2026-12-14").status, "stale");
    eq(currentWeek(weeks, "2026-12-14").entry.headline, "Holiday week");
  });
  it("gap between entries shows the earlier one as past", () => {
    const gappy = [weeks[0], { start: "2026-12-07", end: "2026-12-13", headline: "Later" }];
    const r = currentWeek(gappy, "2026-11-25");
    eq(r.status, "past");
    eq(r.entry.headline, "Opening week");
  });
  it("only future, empty, missing or broken entries give none", () => {
    eq(currentWeek(weeks, "2026-11-01").status, "none");
    eq(currentWeek([], "2026-11-25").status, "none");
    eq(currentWeek(undefined, "2026-11-25").status, "none");
    eq(currentWeek([{ start: "nope", end: "2026-11-30" }, null], "2026-11-25").status, "none");
  });
});

describe("visibleDates and stillOpen", () => {
  const dates = [
    { date: "2026-12-19", title: "C" },
    { date: "2026-12-01", title: "B" },
    { date: "2026-11-20", end: "2026-11-26", title: "A range" },
    { date: "2026-11-24", title: "Gone" },
    { date: "not a date", title: "Broken" },
  ];
  it("sorts ascending and drops finished and broken entries", () => {
    deepEq(visibleDates(dates, "2026-11-25").map((d) => d.title), ["A range", "B", "C"]);
  });
  it("an item shows through its last day and disappears the day after", () => {
    deepEq(visibleDates(dates, "2026-11-26").map((d) => d.title), ["A range", "B", "C"]);
    deepEq(visibleDates(dates, "2026-11-27").map((d) => d.title), ["B", "C"]);
    deepEq(visibleDates(dates, "2026-12-01").map((d) => d.title), ["B", "C"]);
    deepEq(visibleDates(dates, "2026-12-02").map((d) => d.title), ["C"]);
  });
  it("does not mutate its input", () => {
    eq(dates[0].title, "C");
  });
  it("volunteer items use until, and items without dates always show", () => {
    const vol = [{ title: "Crew", until: "2026-11-28" }, { title: "Always" }];
    deepEq(stillOpen(vol, "2026-11-28").map((v) => v.title), ["Crew", "Always"]);
    deepEq(stillOpen(vol, "2026-11-29").map((v) => v.title), ["Always"]);
    deepEq(stillOpen(null, "2026-11-29"), []);
  });
});

/* ------------------------------------------------------------------ *
 * search
 * ------------------------------------------------------------------ */

describe("searchPortal", () => {
  it("matches FAQ questions and answers, case-insensitive", () => {
    deepEq(searchPortal(VALID, "PAYDAY"), { faq: ["pay-dates"], handbook: [] });
    deepEq(searchPortal(VALID, "friday"), { faq: ["pay-dates"], handbook: [] });
  });
  it("is accent-insensitive both ways", () => {
    deepEq(searchPortal(VALID, "inscripcion").faq, ["inscripcion"]);
    deepEq(searchPortal(VALID, "INSCRIPCIÓN").faq, ["inscripcion"]);
  });
  it("matches handbook titles and list items", () => {
    deepEq(searchPortal(VALID, "arriving").handbook, ["arrival"]);
    deepEq(searchPortal(VALID, "speaker").handbook, ["music"]);
  });
  it("needs every word, searches link labels but not urls or markers", () => {
    deepEq(searchPortal(VALID, "volume kind").handbook, ["music"]);
    deepEq(searchPortal(VALID, "volume parking"), { faq: [], handbook: [] });
    deepEq(searchPortal(VALID, "the schedule").faq, ["inscripcion"]);
    deepEq(searchPortal(VALID, "/schedule/").faq, []);
  });
  it("matches at word starts only, never inside a word", () => {
    const doc = clone(VALID);
    doc.faq.push({ id: "late", group: "Teaching", q: "I am running late.", a: [{ t: "p", x: "Text the desk about lateness." }], pending: false });
    doc.faq.push({ id: "noise", group: "Teaching", q: "Teaching-related forms", a: [{ t: "p", x: "Do not manipulate the scanner." }], pending: false });
    doc.handbook.sections.push({ id: "subs", title: "Substitute policy", blocks: [{ t: "p", x: "Two subs per month." }] });
    doc.handbook.sections.push({ id: "suburb", title: "Neighborhood", blocks: [{ t: "p", x: "Our suburban partners." }] });
    deepEq(searchPortal(doc, "late").faq, ["late"]);
    deepEq(searchPortal(doc, "lateness").faq, ["late"]);
    deepEq(searchPortal(doc, "sub").handbook, ["subs", "suburb"]);
    deepEq(searchPortal(doc, "substitute").handbook, ["subs"]);
    deepEq(searchPortal(doc, "related").faq, ["noise"]);
    deepEq(searchPortal(doc, "ulate").faq, []);
    deepEq(searchPortal(doc, "LATE").faq, ["late"]);
  });
  it("wordStarts finds only word-initial positions, accent-insensitive", () => {
    deepEq(wordStarts(foldText("late, related, LATENESS"), "late"), [0, 15]);
    deepEq(wordStarts(foldText("Inscripción abierta"), "inscripcion"), [0]);
    deepEq(wordStarts(foldText("teaching-related"), "related"), [9]);
    deepEq(searchWords("  Sub  LATE "), ["sub", "late"]);
    deepEq(searchWords("a"), []);
  });
  it("short or empty queries and empty content match nothing", () => {
    deepEq(searchPortal(VALID, " a "), { faq: [], handbook: [] });
    deepEq(searchPortal(VALID, ""), { faq: [], handbook: [] });
    deepEq(searchPortal({}, "payday"), { faq: [], handbook: [] });
    deepEq(searchPortal(null, "payday"), { faq: [], handbook: [] });
  });
});

/* ------------------------------------------------------------------ *
 * validateContent
 * ------------------------------------------------------------------ */

describe("validateContent", () => {
  it("accepts the valid fixture", () => {
    const r = validateContent(VALID);
    deepEq(r.errors, []);
    eq(r.ok, true);
  });
  it("accepts a minimal document (sections optional)", () => {
    eq(validateContent({ schema: 1, updated: "2026-11-20" }).ok, true);
  });
  it("accepts contact phones as strings or { label, number }, and checks both", () => {
    const d = clone(VALID);
    d.contacts[0].phones = ["555-010-0123", { label: "Sam Sample", number: "(555) 010-0124" }];
    deepEq(validateContent(d).errors, []);
    d.contacts[0].phones = [
      "555",
      { label: "", number: "555-010-0125" },
      { label: "Pat Pretend", number: "555-01" },
      { label: "Pat Pretend" },
      42,
    ];
    const r = validateContent(d);
    hasError(r, "content.contacts[0].phones[0]: must contain at least 7 digits");
    hasError(r, "content.contacts[0].phones[1].label: must be a non-empty string");
    hasError(r, "content.contacts[0].phones[2].number: must contain at least 7 digits");
    hasError(r, "content.contacts[0].phones[3].number: must be a non-empty string");
    hasError(r, "content.contacts[0].phones[4]: must be a number string or a { label, number } object");
  });
  it("rejects non-objects and the wrong schema", () => {
    eq(validateContent(null).ok, false);
    eq(validateContent([]).ok, false);
    hasError(validateContent({ schema: 2, updated: "2026-11-20" }), "content.schema");
    hasError(validateContent({ schema: "1", updated: "2026-11-20" }), "content.schema");
  });
  it("checks date formats and ranges", () => {
    const d = clone(VALID);
    d.updated = "11/20/2026";
    d.week[0].end = "2026-11-10";
    d.dates[0].date = "2026-02-30";
    const r = validateContent(d);
    hasError(r, "content.updated");
    hasError(r, "content.week[0].end: is before start");
    hasError(r, "content.dates[0].date");
  });
  it("checks block shapes", () => {
    const d = clone(VALID);
    d.handbook.sections[0].blocks = [{ t: "div", x: "no" }, { t: "p" }, { t: "ul", items: [] }, { t: "ol", items: ["ok", 3] }];
    const r = validateContent(d);
    hasError(r, "content.handbook.sections[0].blocks[0].t");
    hasError(r, "content.handbook.sections[0].blocks[1].x: is required");
    hasError(r, "content.handbook.sections[0].blocks[2].items: must not be empty");
    hasError(r, "content.handbook.sections[0].blocks[3].items[1]");
  });
  it("rejects unsafe hrefs and unsafe inline links anywhere", () => {
    const d = clone(VALID);
    d.actions[0].href = "javascript:alert(1)";
    d.links[0].href = "//evil.example";
    d.faq[0].a[0].x = "See [this](data:text/html,x).";
    d.coordinators.todos[0].items[0] = "Open [the form](http://example.org).";
    const r = validateContent(d);
    hasError(r, "content.actions[0].href");
    hasError(r, "content.links[0].href");
    hasError(r, "content.faq[0].a[0].x");
    hasError(r, "content.coordinators.todos[0].items[0]");
  });
  it("requires unique kebab-case ids in faq and handbook sections", () => {
    const d = clone(VALID);
    d.faq[1].id = "pay-dates";
    d.handbook.sections[1].id = "Music Room";
    d.faq[2].id = undefined;
    const r = validateContent(d);
    hasError(r, 'content.faq[1].id: duplicate faq id "pay-dates"');
    hasError(r, "content.handbook.sections[1].id: must be kebab-case");
    hasError(r, "content.faq[2].id: is required");
  });
  it("rows[].who must match the number of days", () => {
    const d = clone(VALID);
    d.coordinators.schedule.rows.push({ time: "1 pm", who: ["Ana", "Ben"] });
    hasError(validateContent(d), "content.coordinators.schedule.rows[1].who: has 2 entries but days has 5");
  });
  it("checks types, required fields, emails and pending", () => {
    const d = clone(VALID);
    d.faq[0].pending = "no";
    d.contacts[0].emails = ["not-an-email"];
    d.contacts[0].who = "";
    delete d.volunteer[0].href;
    d.links[0].href = "";
    d.dates = { not: "an array" };
    const r = validateContent(d);
    hasError(r, "content.faq[0].pending");
    hasError(r, "content.contacts[0].emails[0]");
    eq(r.errors.some((e) => e.includes("content.contacts[0].who")), false, "blank display text is not an error");
    ok(r.warnings.some((w) => w.includes("content.contacts[0].who: is empty")), "blank display text warns");
    hasError(r, "content.volunteer[0].href: is required");
    hasError(r, "content.links[0].href: must not be empty");
    hasError(r, "content.dates: must be an array");
  });
  it("warns, without failing, on unknown keys and HTML", () => {
    const d = clone(VALID);
    d.extra = true;
    d.week[0].headline = "<b>Big</b> week";
    const r = validateContent(d);
    eq(r.ok, true);
    ok(r.warnings.some((w) => w.includes("content.extra")));
    ok(r.warnings.some((w) => w.includes("content.week[0].headline")));
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
