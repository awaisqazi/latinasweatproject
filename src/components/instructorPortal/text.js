// Small view helpers for the instructor portal. Pure functions, no content.
import { foldText, plainText, safeHref, isExternal, isDateString, searchWords, wordStarts } from "../../lib/instructorPortal/richText.js";

/** An array, whatever the hand-edited document holds there. */
export const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null) : []);
/** A non-empty trimmed string, else "". */
export const str = (v) => (typeof v === "string" ? v.trim() : "");

/** Search words exactly as searchPortal reads them. */
export const queryWords = searchWords;

/**
 * Split `text` into runs, marking every place a search word starts a word,
 * by the same rule searchPortal matches with (wordStarts), so what is
 * highlighted is exactly what matched.
 * @returns {{text:string, hit:boolean}[]}
 */
export function splitMarks(text, words) {
  const s = String(text ?? "");
  if (!words || !words.length || !s) return [{ text: s, hit: false }];
  // Fold one character at a time so indexes map back to the original.
  let folded = "";
  const map = [];
  for (let i = 0; i < s.length; i++) {
    const f = foldText(s[i]);
    for (let k = 0; k < f.length; k++) map.push(i);
    folded += f;
  }
  const hit = new Array(s.length).fill(false);
  for (const w of words) {
    for (const at of wordStarts(folded, w)) {
      for (let k = at; k < at + w.length; k++) hit[map[k]] = true;
    }
  }
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === hit[i]) last.text += s[i];
    else out.push({ text: s[i], hit: hit[i] });
  }
  return out;
}

/** A short excerpt of the first block that contains every search word. */
export function snippetFor(blocks, words, max = 170) {
  const texts = [];
  for (const b of arr(blocks)) {
    if (typeof b.x === "string") texts.push(plainText(b.x));
    for (const it of arr(b.items)) if (typeof it === "string") texts.push(plainText(it));
  }
  const starts = (t) => words.map((w) => wordStarts(foldText(t), w)[0]).filter((i) => i !== undefined);
  const first = texts.find((t) => starts(t).length > 0);
  if (!first) return "";
  if (first.length <= max) return first;
  const at = Math.max(0, Math.min(...starts(first)) - 50);
  let cut = first.slice(at, at + max);
  if (at > 0) cut = "…" + cut.replace(/^\S*\s/, "");
  if (at + max < first.length) cut = cut.replace(/\s\S*$/, "") + "…";
  return cut;
}

/** A link's attributes: external https opens a new tab; null when unsafe. */
export function linkAttrs(href) {
  const safe = safeHref(href);
  if (!safe) return null;
  return isExternal(safe) ? { href: safe, target: "_blank", rel: "noopener" } : { href: safe };
}

/** tel: link for a phone number written any way; null if there are no digits. */
export function telHref(phone) {
  const s = str(phone);
  const plus = s.startsWith("+") ? "+" : "";
  const digits = s.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return safeHref(`tel:${plus}${digits}`);
}
export function mailHref(email) {
  const s = str(email);
  return s ? safeHref(`mailto:${s}`) : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(d) {
  const [y, m, day] = d.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return { y, m, day, wd };
}

/** "Nov 25" */
export function shortDate(d) {
  if (!isDateString(d)) return "";
  const p = parts(d);
  return `${MONTHS[p.m - 1]} ${p.day}`;
}
/** "Wed" */
export function weekday(d) {
  return isDateString(d) ? DAYS[parts(d).wd] : "";
}
/** "November 25, 2026" */
export function longDate(d) {
  if (!isDateString(d)) return "";
  const p = parts(d);
  return `${MONTHS_LONG[p.m - 1]} ${p.day}, ${p.y}`;
}
/** "Nov 23 to 29", "Nov 30 to Dec 6" */
export function rangeLabel(a, b) {
  if (!isDateString(a)) return "";
  if (!isDateString(b) || a === b) return shortDate(a);
  const pa = parts(a);
  const pb = parts(b);
  const end = pa.m === pb.m && pa.y === pb.y ? String(pb.day) : shortDate(b);
  return `${shortDate(a)} to ${end}`;
}
