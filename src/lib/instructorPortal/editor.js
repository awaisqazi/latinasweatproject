// Instructor portal: helpers for the in-browser content editor.
// Contract: ./README.md ("Content document (schema 1)") and the editor spec.
//
// Staff edit three parts of the document: `week`, `dates` and `faq`. The editor
// keeps a `base` (what the server has) and a `draft` (the working copy, which
// may hold blank strings and blank list rows while someone types).
// prepareForSave turns a draft into the clean document that is validated and
// saved; the rest of this file compares, merges and explains problems in
// plain words.
//
// Everything here is pure: no DOM, no Supabase, no dependencies, safe in Node
// and in the browser. Nothing private belongs in this file: no real names,
// addresses or portal content, in code or in comments.

import { isDateString, addDays, currentWeek } from "./richText.js";
import { rangeLabel, shortDate } from "../../components/instructorPortal/text.js";

export const EDITABLE_SECTIONS = ["week", "dates", "faq"];
// Keep in step with the SQL in
// supabase/migrations/20261127120000_instructor_portal_admin.sql: the database
// refuses a save that changes any other top-level key.
export const EDITABLE_KEYS = ["updated", "week", "dates", "faq"];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isBlank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/* ------------------------------------------------------------------ *
 * Values
 * ------------------------------------------------------------------ */

/** Deep copy via JSON. undefined in, undefined out. */
export function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/** Deep equality for JSON values, independent of object key order. */
export function sameValue(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => sameValue(x, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    // Keys holding undefined do not survive JSON, so they do not count.
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameValue(a[k], b[k]));
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Weeks
 * ------------------------------------------------------------------ */

/** The Monday on or before `date`, as YYYY-MM-DD. "" for anything not a real date. */
export function mondayOf(date) {
  if (!isDateString(date)) return "";
  const [y, m, d] = date.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((wd + 6) % 7));
}

const validWeek = (w) => isObj(w) && isDateString(w.start) && isDateString(w.end) && w.start <= w.end;

/**
 * The first Monday-to-Sunday week, starting with the one containing `today`,
 * that no valid entry overlaps. Gives up after 60 weeks and returns that week.
 */
export function nextWeekRange(weeks, today) {
  const first = mondayOf(today);
  if (!first) return { start: "", end: "" };
  const taken = Array.isArray(weeks) ? weeks.filter(validWeek) : [];
  let range = null;
  for (let i = 0; i < 60; i++) {
    const start = addDays(first, 7 * i);
    const end = addDays(start, 6);
    range = { start, end };
    if (!taken.some((w) => w.start <= end && w.end >= start)) return range;
  }
  return range;
}

export function blankWeek(range) {
  return { start: range.start, end: range.end, headline: "", notes: [{ t: "ul", items: [""] }], shoutouts: [] };
}

/** "current" | "upcoming" | "past" | "invalid" */
export function weekStatus(entry, today) {
  if (!validWeek(entry)) return "invalid";
  if (entry.end < today) return "past";
  if (entry.start > today) return "upcoming";
  return "current";
}

/** One plain sentence saying what instructors see today. */
export function portalWeekLine(weeks, today) {
  const r = currentWeek(weeks, today);
  if (r.status === "current") return `Instructors see the note for ${rangeLabel(r.entry.start, r.entry.end)} right now.`;
  if (r.status === "past") {
    return `No note covers this week yet. Instructors see the ${rangeLabel(r.entry.start, r.entry.end)} note, labelled as last week's.`;
  }
  if (r.status === "stale") return "The newest note ended more than 14 days ago, so the portal hides notes and shows only Coming up.";
  return "There is no note for this week yet. The portal shows only Coming up.";
}

/* ------------------------------------------------------------------ *
 * Simple lists and blocks
 * ------------------------------------------------------------------ */

/** Trimmed, non-blank strings only. */
export function cleanList(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

const LINE_MARKER = /^(?:[-*•·–]|\d+[.)])\s+/;

/** Multi-line text to one string per line, with one leading list marker stripped. */
export function splitLines(text) {
  if (typeof text !== "string") return [];
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim().replace(LINE_MARKER, "").trim())
    .filter(Boolean);
}

/** Every block as plain lines. */
export function flattenNotes(notes) {
  if (!Array.isArray(notes)) return [];
  const out = [];
  for (const b of notes) {
    if (!isObj(b)) continue;
    if (b.t === "p" || b.t === "h") {
      if (typeof b.x === "string" && b.x.trim()) out.push(b.x);
    } else if (b.t === "ul" || b.t === "ol") {
      if (Array.isArray(b.items)) for (const item of b.items) if (typeof item === "string") out.push(item);
    }
  }
  return out;
}

/** { simple, items }: simple when the notes are nothing, or one bullet list. */
export function notesAsList(notes) {
  if (!Array.isArray(notes) || notes.length === 0) return { simple: true, items: [] };
  const only = notes[0];
  if (notes.length === 1 && isObj(only) && only.t === "ul" && Array.isArray(only.items)) {
    return { simple: true, items: only.items.map((x) => (typeof x === "string" ? x : "")) };
  }
  return { simple: false, items: flattenNotes(notes) };
}

/** Blocks without blank text or empty lists. Unknown blocks are kept for the validator. */
export function cleanBlocks(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  const out = [];
  for (const b of blocks) {
    if (!isObj(b)) { out.push(b); continue; }
    if (b.t === "ul" || b.t === "ol") {
      const items = cleanList(b.items);
      if (items.length) out.push({ ...b, items });
    } else if (b.t === "p" || b.t === "h") {
      if (typeof b.x === "string" && b.x.trim()) out.push({ ...b, x: b.x.trim() });
    } else {
      out.push(b);
    }
  }
  return out;
}

/** Blocks to the plain text a person edits. Blocks are separated by one blank line. */
export function blocksToText(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return "";
  const parts = [];
  for (const b of blocks) {
    if (!isObj(b)) continue;
    const items = Array.isArray(b.items) ? b.items.filter((x) => typeof x === "string") : [];
    if (b.t === "p" && typeof b.x === "string") parts.push(b.x);
    else if (b.t === "h" && typeof b.x === "string") parts.push(`## ${b.x}`);
    else if (b.t === "ul" && items.length) parts.push(items.map((x) => `- ${x}`).join("\n"));
    else if (b.t === "ol" && items.length) parts.push(items.map((x, i) => `${i + 1}. ${x}`).join("\n"));
  }
  return parts.join("\n\n");
}

const UL_LINE = /^[-*•]\s+/;
const OL_LINE = /^\d+[.)]\s+/;
const H_LINE = /^##?\s+/;

/** Plain text back to blocks. See the README block shapes. */
export function textToBlocks(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const out = [];
  let cur = null; // { t, lines }
  const flush = () => {
    if (!cur) return;
    if (cur.t === "p") out.push({ t: "p", x: cur.lines.join(" ") });
    else out.push({ t: cur.t, items: cur.lines });
    cur = null;
  };
  const add = (t, line) => {
    if (!cur || cur.t !== t) { flush(); cur = { t, lines: [] }; }
    cur.lines.push(line);
  };
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (H_LINE.test(line)) {
      flush();
      const x = line.replace(H_LINE, "").trim();
      if (x) out.push({ t: "h", x });
      continue;
    }
    if (UL_LINE.test(line)) add("ul", line.replace(UL_LINE, "").trim());
    else if (OL_LINE.test(line)) add("ol", line.replace(OL_LINE, "").trim());
    else add("p", line);
  }
  flush();
  return out;
}

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

const OPTIONAL_DATE_KEYS = ["end", "time", "text", "href", "cta"];

export function blankDate() {
  return { date: "", title: "" };
}

/** A copy with strings trimmed and blank optional keys removed. */
export function cleanDate(entry) {
  if (!isObj(entry)) return entry;
  const out = {};
  for (const [k, v] of Object.entries(entry)) out[k] = typeof v === "string" ? v.trim() : clone(v);
  for (const k of OPTIONAL_DATE_KEYS) if (k in out && isBlank(out[k])) delete out[k];
  if ("end" in out && out.end === out.date) delete out.end;
  return out;
}

const lastDay = (d) => (isDateString(d?.end) ? d.end : d.date);

/** Real dates first (by date, then last day), then the rest in their order. Stable. */
export function sortDates(dates) {
  if (!Array.isArray(dates)) return [];
  const dated = [];
  const rest = [];
  dates.forEach((d, i) => (isObj(d) && isDateString(d.date) ? dated : rest).push({ d, i }));
  dated.sort((a, b) => {
    if (a.d.date !== b.d.date) return a.d.date < b.d.date ? -1 : 1;
    const ae = lastDay(a.d);
    const be = lastDay(b.d);
    if (ae !== be) return ae < be ? -1 : 1;
    return a.i - b.i;
  });
  return [...dated, ...rest].map(({ d }) => d);
}

/** true when the entry's last day is before today. */
export function isPastDate(entry, today) {
  if (!isObj(entry)) return false;
  const last = isDateString(entry.end) ? entry.end : isDateString(entry.date) ? entry.date : null;
  return last !== null && last < today;
}

/* ------------------------------------------------------------------ *
 * Document level
 * ------------------------------------------------------------------ */

function cleanWeekEntry(w) {
  if (!isObj(w)) return w;
  for (const k of ["start", "end", "headline"]) if (typeof w[k] === "string") w[k] = w[k].trim();
  if (Array.isArray(w.notes)) w.notes = cleanBlocks(w.notes);
  if (Array.isArray(w.shoutouts)) w.shoutouts = cleanList(w.shoutouts);
  return w;
}

function sortWeeks(weeks) {
  const dated = [];
  const rest = [];
  weeks.forEach((w, i) => (isObj(w) && isDateString(w.start) ? dated : rest).push({ w, i }));
  const endOf = (w) => (typeof w.end === "string" ? w.end : "");
  dated.sort((a, b) => {
    if (a.w.start !== b.w.start) return a.w.start < b.w.start ? -1 : 1;
    const ae = endOf(a.w);
    const be = endOf(b.w);
    if (ae !== be) return ae < be ? -1 : 1;
    return a.i - b.i;
  });
  return [...dated, ...rest].map(({ w }) => w);
}

/** The clean document that gets validated and saved. Never mutates `doc`. */
export function prepareForSave(doc, today) {
  if (!isObj(doc)) return doc;
  const out = clone(doc);
  if (Array.isArray(out.week)) out.week = sortWeeks(out.week.map(cleanWeekEntry));
  if (Array.isArray(out.dates)) out.dates = sortDates(out.dates.map(cleanDate));
  if (Array.isArray(out.faq)) {
    for (const f of out.faq) if (isObj(f) && Array.isArray(f.a)) f.a = cleanBlocks(f.a);
  }
  if (isDateString(today)) out.updated = today;
  return out;
}

const pick = (doc, k) => (isObj(doc) ? doc[k] : undefined);
// For comparing: a section that is missing and one that is an empty list are
// the same thing to a reader (the editor creates the list on first use).
const section = (doc, k) => pick(doc, k) ?? [];

/** The editable sections whose cleaned forms differ. `updated` is ignored. */
export function changedSections(base, draft) {
  const a = prepareForSave(base);
  const b = prepareForSave(draft);
  return EDITABLE_SECTIONS.filter((k) => !sameValue(section(a, k), section(b, k)));
}

export function isDirty(base, draft) {
  return changedSections(base, draft).length > 0;
}

/** Put my changes on top of a newer server copy. See the spec for the rules. */
export function rebaseDraft(base, mine, theirs) {
  const pb = prepareForSave(base);
  const pm = prepareForSave(mine);
  const pt = prepareForSave(theirs);
  const doc = isObj(theirs) ? clone(theirs) : {};
  const carried = [];
  const clashes = [];
  for (const k of EDITABLE_SECTIONS) {
    const b = section(pb, k);
    const m = section(pm, k);
    const t = section(pt, k);
    const iChanged = !sameValue(b, m);
    const theyChanged = !sameValue(b, t);
    if (iChanged && !theyChanged) {
      carried.push(k);
      const value = pick(mine, k);
      if (value === undefined) delete doc[k];
      else doc[k] = clone(value);
    } else if (iChanged && theyChanged && !sameValue(m, t)) {
      clashes.push(k);
    }
  }
  return { doc, carried, clashes };
}

/* ------------------------------------------------------------------ *
 * Problems in plain words
 * ------------------------------------------------------------------ */

const FIELD_WORDS = {
  week: { start: "start date", end: "end date", headline: "headline", notes: "notes", shoutouts: "shoutouts" },
  dates: { date: "date", end: "last day", time: "time", title: "title", text: "details", href: "link", cta: "link words" },
  faq: { q: "question", a: "answer", group: "group", pending: "not-written-yet setting", source: "source", ask: "who to ask" },
};
const ASK_WORDS = { who: "who to ask", email: "contact email", phone: "contact phone" };
const SECTION_WORDS = { week: "the weekly notes", dates: "the Coming up list", faq: "the questions" };
const SECTION_WHERE = { week: "Weekly notes", dates: "Coming up", faq: "Questions" };
const PLURAL = new Set(["notes", "shoutouts", "details"]);
const LINK_RULE = "A link must start with https://, or be a page on this site such as /subs/, or start with mailto: or tel:";

const PATH_RE = /^content\.(week|dates|faq)(?:\[(\d+)\])?(?:\.([A-Za-z]+))?(?:\.([A-Za-z]+))?(.*)$/;

function cut(s, max = 60) {
  return s.length > max ? `${s.slice(0, max - 3).trimEnd()}...` : s;
}

function whereLabel(section, index, doc) {
  if (index === null) return SECTION_WHERE[section];
  const item = Array.isArray(doc?.[section]) ? doc[section][index] : undefined;
  // The lists on screen are not numbered, so name the item by what it holds
  // and fall back to a number only when it holds nothing to name it by.
  if (section === "week") {
    if (validWeek(item)) return `Week of ${rangeLabel(item.start, item.end)}`;
    const start = isObj(item) ? shortDate(item.start) : "";
    if (start) return `The week starting ${start}`;
    const headline = isObj(item) && typeof item.headline === "string" ? item.headline.trim() : "";
    return headline ? `The week "${cut(headline)}"` : `Week entry ${index + 1}`;
  }
  if (section === "dates") {
    const title = isObj(item) && typeof item.title === "string" ? item.title.trim() : "";
    const day = isObj(item) ? shortDate(item.date) : "";
    if (title && day) return `${title} (${day})`;
    if (title) return title;
    if (day) return `The date on ${day}`;
    return "The date with no title";
  }
  const q = isObj(item) && typeof item.q === "string" ? item.q.trim() : "";
  return q ? `"${cut(q)}"` : `Question ${index + 1}`;
}

// Translate one validator message for a field of a week, dates or faq item.
function plainMessage(section, index, field, sub, rest, msg) {
  let words;
  if (field === null) words = index === null ? null : "this entry";
  else if (section === "faq" && field === "ask" && sub) words = ASK_WORDS[sub] || `${sub} for who to ask`;
  else words = FIELD_WORDS[section][field] || field;
  const subject = words ? `the ${words}` : SECTION_WORDS[section];
  const verb = (one, many) => (PLURAL.has(words) ? many : one);
  // Inside a block list or a string list (notes[0].items[2], a[1].x, shoutouts[0]).
  const inside = field !== null && /^\[/.test(rest || "") && !(section === "faq" && field === "ask");

  let m = /^unsafe or unsupported link "(.*)" in \[(.*)\]\(\.\.\.\)/.exec(msg);
  if (m) return `the link "${m[1]}" behind "${m[2]}" will not work. ${LINK_RULE}`;
  m = /^unsafe or unsupported link "(.*)" \(use /.exec(msg);
  if (m) return `the link "${m[1]}" will not work. ${LINK_RULE}`;

  if (msg === "is before start") return "the end date is before the start date";
  if (msg === "is before date") return "the last day is before the date";
  if (/^must be a real date written/.test(msg)) return `${subject} is not a real date`;
  if (msg === "must be true or false") return `${subject} is not on or off`;
  if (msg === "is empty, so the page shows nothing there") {
    return inside ? `${subject} ${verb("has", "have")} an empty line` : `${subject} ${verb("is", "are")} empty`;
  }
  if (msg === "looks like HTML, which is shown as literal text") {
    return `${subject} ${verb("contains", "contain")} HTML tags, which show as typed`;
  }
  if (inside) {
    if (msg === "must be a non-empty string" || msg === "is required" || msg === "must not be empty") {
      return `${subject} ${verb("has", "have")} an empty line`;
    }
    if (/^must be one of p, h, ul, ol/.test(msg)) return `${subject} ${verb("has", "have")} a part this editor does not recognise`;
  }
  if (msg === "is required" || msg === "must not be empty") return `${subject} is missing`;
  return `${subject} ${msg}`;
}

function toProblem(raw, doc) {
  const colon = raw.indexOf(": ");
  const path = colon === -1 ? raw : raw.slice(0, colon);
  const msg = colon === -1 ? "" : raw.slice(colon + 2);
  const m = PATH_RE.exec(path);
  if (!m) {
    const where = "Another part of the portal";
    const shown = raw.replace(/^content\./, "");
    return {
      section: "other", index: null, where, message: msg || raw,
      text: `Another part of the portal has a problem this editor cannot fix (${shown}). Tell the site owner.`,
      raw,
    };
  }
  const [, section, idx, field = null, sub = null, rest = ""] = m;
  const index = idx === undefined ? null : Number(idx);
  // A field without an index (content.week.foo) cannot happen; treat it as the section.
  const realField = index === null ? null : field;
  const where = whereLabel(section, index, doc);
  const message = plainMessage(section, index, realField, sub, sub ? `.${sub}${rest}` : rest, msg);
  return { section, index, where, message, text: `${where}: ${message}.`, raw };
}

/** validateContent's result in words a non-technical person can act on. */
export function plainProblems(result, doc) {
  if (!result || !doc) return { errors: [], warnings: [] };
  const errors = (Array.isArray(result.errors) ? result.errors : []).map((e) => toProblem(e, doc));
  const warnings = (Array.isArray(result.warnings) ? result.warnings : [])
    .map((w) => toProblem(w, doc))
    .filter((p) => p.section !== "other");
  return { errors, warnings };
}
