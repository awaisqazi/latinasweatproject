// Instructor portal: safe inline text, date rules and search.
// Contract: ./README.md ("Content document", "Behaviour the page derives from the data").
//
// Everything here is pure and returns plain data. Nothing builds an HTML string,
// so nothing here is ever fed to {@html}. Safe to import in Node (tests, the CLI)
// and in the browser.

/* ------------------------------------------------------------------ *
 * Links
 * ------------------------------------------------------------------ */

const SITE_HOSTS = new Set(["latinasweatproject.com", "www.latinasweatproject.com"]);

// Control characters, whitespace and backslashes have no business inside an
// href we accept: they are how "java\tscript:" and "/\evil.example" tricks work.
const UNSAFE_CHARS = /[\u0000- \u007F-\u009F\\]/;

/**
 * The URL if it is safe to put in an href, else null.
 * Allowed: site-relative ("/subs/", a single leading slash), https:, mailto:, tel:.
 * Leading and trailing whitespace is trimmed first; anything else odd rejects.
 * @param {unknown} url
 * @returns {string | null}
 */
export function safeHref(url) {
  if (typeof url !== "string") return null;
  const s = url.trim();
  if (!s || s.length > 2000 || UNSAFE_CHARS.test(s)) return null;

  // Site-relative: exactly one leading slash ("//host" is protocol-relative).
  if (s[0] === "/") return s[1] === "/" ? null : s;

  const lower = s.toLowerCase();
  if (lower.startsWith("https://")) {
    const host = httpsHost(s);
    return host ? s : null;
  }
  if (lower.startsWith("mailto:")) {
    return /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/i.test(s) ? s : null;
  }
  if (lower.startsWith("tel:")) {
    return /^tel:\+?[0-9][0-9().-]*$/i.test(s) ? s : null;
  }
  return null;
}

// Host of an https URL, lowercased, without port. null when there is none, or
// when the URL carries userinfo ("https://site.com@evil.example" lands on evil).
function httpsHost(s) {
  const rest = s.slice("https://".length);
  const authority = rest.split(/[/?#]/, 1)[0];
  if (!authority || authority.includes("@")) return null;
  const host = authority.replace(/:\d*$/, "").toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host) || !host.includes(".") || host.startsWith(".") || host.endsWith(".")) {
    return null;
  }
  return host;
}

/**
 * true for https: links that leave latinasweatproject.com (open in a new tab).
 * Site-relative, mailto: and tel: links are not external.
 * @param {string} href  an href already passed through safeHref
 */
export function isExternal(href) {
  if (typeof href !== "string" || !href.toLowerCase().startsWith("https://")) return false;
  const host = httpsHost(href);
  return !!host && !SITE_HOSTS.has(host);
}

/* ------------------------------------------------------------------ *
 * Inline syntax: [label](url) and **words**. Nothing else is parsed.
 * ------------------------------------------------------------------ */

// Emphasis must hug its words ("**this**", not "** this **"), as in Markdown, so
// arithmetic like "2 ** 3" stays literal.
const INLINE = /\*\*(?!\s)([^*]+?)(?<!\s)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/**
 * @param {unknown} text
 * @returns {Array<{type:"text",value:string} | {type:"strong",value:string}
 *                 | {type:"link",label:string,href:string,external:boolean}>}
 *   A link whose URL fails safeHref comes back as plain text of its label.
 */
export function parseInline(text) {
  if (typeof text !== "string" || text === "") return [];
  const out = [];
  const pushText = (value) => {
    if (!value) return;
    const last = out[out.length - 1];
    if (last && last.type === "text") last.value += value;
    else out.push({ type: "text", value });
  };

  let at = 0;
  INLINE.lastIndex = 0;
  for (let m = INLINE.exec(text); m; m = INLINE.exec(text)) {
    pushText(text.slice(at, m.index));
    at = m.index + m[0].length;

    if (m[1] !== undefined) {
      if (m[1].trim()) out.push({ type: "strong", value: m[1] });
      else pushText(m[0]);
      continue;
    }

    const label = m[2];
    const href = safeHref(m[3]);
    if (href) out.push({ type: "link", label, href, external: isExternal(href) });
    else pushText(label);
  }
  pushText(text.slice(at));
  return out;
}

/** The text a reader sees: link labels kept, URLs and ** markers dropped. */
export function plainText(text) {
  return parseInline(text)
    .map((part) => (part.type === "link" ? part.label : part.value))
    .join("");
}

/* ------------------------------------------------------------------ *
 * Dates. Strings only ("YYYY-MM-DD"), compared as strings and shifted with
 * Date.UTC, so no local-timezone parse can move a day.
 * ------------------------------------------------------------------ */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** true for a real calendar date written YYYY-MM-DD. */
export function isDateString(s) {
  if (typeof s !== "string") return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function utcDay(s) {
  const m = DATE_RE.exec(s);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** a + n days, as YYYY-MM-DD. */
export function addDays(date, n) {
  return new Date(utcDay(date) + n * 86400000).toISOString().slice(0, 10);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a, b) {
  return Math.round((utcDay(b) - utcDay(a)) / 86400000);
}

/** Today in America/Chicago as YYYY-MM-DD. */
export function chicagoToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// The last day an item is shown: end, else date, else until.
function lastDayOf(item) {
  for (const key of ["end", "date", "until"]) {
    if (isDateString(item?.[key])) return item[key];
  }
  return null;
}

/**
 * Items still showing today: each disappears the day after its `end`, else
 * `date`, else `until`. Items with none of those always show. Order is kept.
 * Used for `volunteer` (and by visibleDates).
 * @param {unknown} items
 * @param {string} today  YYYY-MM-DD, America/Chicago
 */
export function stillOpen(items, today) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const last = lastDayOf(item);
    return !last || today <= last;
  });
}

/**
 * `dates`: drop entries without a valid `date`, drop finished ones (the day
 * after end, else date), sort ascending by date then end. Returns a new array.
 * @param {unknown} dates
 * @param {string} today  YYYY-MM-DD, America/Chicago
 */
export function visibleDates(dates, today) {
  if (!Array.isArray(dates)) return [];
  return stillOpen(
    dates.filter((d) => d && isDateString(d.date)),
    today,
  )
    .map((d, i) => ({ d, i }))
    .sort((a, b) => {
      if (a.d.date !== b.d.date) return a.d.date < b.d.date ? -1 : 1;
      const ae = isDateString(a.d.end) ? a.d.end : a.d.date;
      const be = isDateString(b.d.end) ? b.d.end : b.d.date;
      if (ae !== be) return ae < be ? -1 : 1;
      return a.i - b.i;
    })
    .map(({ d }) => d);
}

/** Notes older than this many days after their week ended are hidden. */
export const STALE_AFTER_DAYS = 14;

/**
 * Which `week` entry to show.
 * @param {unknown} weeks
 * @param {string} today  YYYY-MM-DD, America/Chicago
 * @returns {{ status: "current" | "past" | "stale" | "none",
 *             entry: object | null, endedDaysAgo: number | null }}
 *   current: entry's range contains today.
 *   past:    no current entry; entry is the most recent past one, ended
 *            endedDaysAgo days ago (1 to 14). State its range plainly.
 *   stale:   the most recent past entry ended more than 14 days ago: hide the
 *            notes and show only `dates`. entry is still returned for reference.
 *   none:    no past or current entry (empty, missing, or only future weeks).
 */
export function currentWeek(weeks, today) {
  const valid = Array.isArray(weeks)
    ? weeks.filter((w) => w && isDateString(w.start) && isDateString(w.end) && w.start <= w.end)
    : [];

  let current = null;
  let past = null;
  for (const w of valid) {
    if (w.start <= today && today <= w.end) {
      if (!current || w.start > current.start) current = w;
    } else if (w.end < today) {
      if (!past || w.end > past.end || (w.end === past.end && w.start > past.start)) past = w;
    }
  }

  if (current) return { status: "current", entry: current, endedDaysAgo: null };
  if (!past) return { status: "none", entry: null, endedDaysAgo: null };
  const ago = daysBetween(past.end, today);
  return { status: ago > STALE_AFTER_DAYS ? "stale" : "past", entry: past, endedDaysAgo: ago };
}

/* ------------------------------------------------------------------ *
 * Search
 * ------------------------------------------------------------------ */

/** Lowercase, accents stripped: "Inscripción" matches "inscripcion". */
export function foldText(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function blocksText(blocks) {
  if (!Array.isArray(blocks)) return "";
  const out = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (typeof b.x === "string") out.push(plainText(b.x));
    if (Array.isArray(b.items)) {
      for (const item of b.items) if (typeof item === "string") out.push(plainText(item));
    }
  }
  return out.join(" ");
}

// A letter or digit in any script: the edges of a word.
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * The query as search words: folded (see foldText), split on whitespace.
 * A query shorter than 2 characters gives no words: show everything then.
 * @param {unknown} query
 * @returns {string[]}
 */
export function searchWords(query) {
  const q = foldText(query).trim();
  return q.length < 2 ? [] : q.split(/\s+/).filter(Boolean);
}

/**
 * Where `word` starts a word in `folded` (text already passed through
 * foldText): every index i where folded continues with word and the character
 * before i is not a letter or digit. So "late" is found in "late" and
 * "lateness" but not in "related"; "sub" in "subs" and "substitute".
 * @param {string} folded
 * @param {string} word  a search word (folded)
 * @returns {number[]}
 */
export function wordStarts(folded, word) {
  const out = [];
  if (!word) return out;
  for (let at = folded.indexOf(word); at !== -1; at = folded.indexOf(word, at + 1)) {
    if (at === 0 || !WORD_CHAR.test(folded[at - 1])) out.push(at);
  }
  return out;
}

/** true when every search word starts a word somewhere in `text`. */
export function matchesAll(text, words) {
  const folded = foldText(text);
  return words.length > 0 && words.every((w) => wordStarts(folded, w).length > 0);
}

/**
 * Case- and accent-insensitive search over FAQ questions and answers and
 * handbook section titles and blocks. Every word of the query must appear at
 * the start of a word in the entry (see wordStarts): a prefix match, never a
 * match from the middle of a word.
 * @param {object} content  the portal document
 * @param {string} query
 * @returns {{ faq: string[], handbook: string[] }}  ids, in document order
 */
export function searchPortal(content, query) {
  const result = { faq: [], handbook: [] };
  const words = searchWords(query);
  if (!words.length) return result;
  const hit = (hay) => matchesAll(hay, words);

  const faq = Array.isArray(content?.faq) ? content.faq : [];
  for (const entry of faq) {
    if (!entry || typeof entry.id !== "string") continue;
    if (hit(`${plainText(entry.q ?? "")} ${blocksText(entry.a)}`)) result.faq.push(entry.id);
  }

  const sections = Array.isArray(content?.handbook?.sections) ? content.handbook.sections : [];
  for (const s of sections) {
    if (!s || typeof s.id !== "string") continue;
    if (hit(`${plainText(s.title ?? "")} ${blocksText(s.blocks)}`)) result.handbook.push(s.id);
  }
  return result;
}
