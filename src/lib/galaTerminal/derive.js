// src/lib/galaTerminal/derive.js
//
// Every pure function the pledge terminal needs: level keys, the entry-line
// grammar, the local duplicate guard, the tape merge, the per-level tally and
// the offline queue's on-disk shape.
//
// Pure on purpose. No Svelte, no DOM, no network, no clock it does not receive:
// node runs all of it (src/lib/galaTerminal/test/run.mjs).
//
// MONEY: the runtime state speaks cents (`amount_cents`), the RPCs take dollars
// (`p_amount numeric`). Everything in here is cents, and the one conversion sits
// in `dollars()` so there is a single place to be wrong.
//
// PRIVACY: this repo is public. Not one real guest name appears here or in the
// tests, and the offline queue never stores a name.

/* ------------------------------------------------------------------ *
 * money
 * ------------------------------------------------------------------ */

/** Cents to the dollars an RPC wants. Never build this string by hand. */
export const dollars = (cents) => Math.round(Number(cents) || 0) / 100;

export const centsOf = (amount) => Math.round((Number(amount) || 0) * 100);

/** "$5,000" for round money, "$1,234.56" when the cents matter. */
export function money(cents, { sign = true } = {}) {
  const n = Math.round(Number(cents) || 0);
  const whole = n % 100 === 0;
  const body = (Math.abs(n) / 100).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? "-" : ""}${sign ? "$" : ""}${body}`;
}

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n) {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    return n % 10 ? `${t}-${ONES[n % 10]}` : t;
  }
  const h = `${ONES[Math.floor(n / 100)]} hundred`;
  return n % 100 ? `${h} ${under1000(n % 100)}` : h;
}

/**
 * The confirm gate spells the amount out, because "50000" and "5000" look the
 * same at arm's length in a dark ballroom (09 R5). Whole dollars only: a typo
 * that matters is never 12 cents.
 */
export function amountWords(cents) {
  const n = Math.round(Number(cents) || 0);
  if (n <= 0 || n % 100 !== 0) return "";
  const d = n / 100;
  if (d >= 1_000_000) return "";
  const parts = [];
  if (d >= 1000) parts.push(`${under1000(Math.floor(d / 1000))} thousand`);
  const rest = d % 1000;
  if (rest || !parts.length) parts.push(under1000(rest));
  return `${parts.join(" ")} dollars`;
}

/* ------------------------------------------------------------------ *
 * levels
 * ------------------------------------------------------------------ */

/**
 * Only a fallback for a state that has not been configured yet. The levels the
 * clerk actually sees always come from the runtime state, because the
 * auctioneer changes them in the room (10 s7.1).
 */
export const DEFAULT_LEVELS = [500000, 250000, 100000, 50000, 25000, 10000].map((amount_cents) => ({
  amount_cents,
  impact_line: "",
}));

/** Highest first, deduplicated, at most nine: the keys 1 to 9 are the selector. */
export function levelList(state) {
  const raw = Array.isArray(state?.levels) && state.levels.length ? state.levels : DEFAULT_LEVELS;
  const seen = new Set();
  const out = [];
  for (const l of raw) {
    const cents = Math.round(Number(l?.amount_cents) || 0);
    if (cents <= 0 || seen.has(cents)) continue;
    seen.add(cents);
    out.push({ amount_cents: cents, impact_line: String(l?.impact_line || "").slice(0, 120) });
  }
  out.sort((a, b) => b.amount_cents - a.amount_cents);
  return out.slice(0, 9).map((l, i) => ({ ...l, key: String(i + 1) }));
}

/** "1".."9" picks a level. Anything else is not a level key. */
export function levelByKey(levels, key) {
  const i = Number(key) - 1;
  return Number.isInteger(i) && i >= 0 && i < levels.length ? levels[i] : null;
}

/**
 * `]` / ArrowDown walks DOWN the ladder (the appeal descends), `[` / ArrowUp
 * walks up. Off either end it stays put rather than wrapping: wrapping from
 * $100 back to $5,000 mid-appeal would be a fat-finger disaster.
 */
export function stepLevel(levels, currentCents, dir) {
  if (!levels.length) return null;
  const at = levels.findIndex((l) => l.amount_cents === Math.round(Number(currentCents) || 0));
  if (at < 0) return levels[0];
  const next = at + (dir > 0 ? 1 : -1);
  return levels[Math.min(levels.length - 1, Math.max(0, next))];
}

/* ------------------------------------------------------------------ *
 * round keys
 * ------------------------------------------------------------------ */

/**
 * `raise-500` is the level's key: the server's unique index on
 * (round_key, paddle) for live rows is what stops two clerks double-keying one
 * paddle. A DELIBERATE second gift from the same paddle at the same level has
 * to carry a different key, so it gets `raise-500#2`, which keeps it visible in
 * the tally instead of hiding it under a null round.
 */
export function roundKeyFor(cents, n = 1) {
  const base = `raise-${dollars(cents)}`;
  return n > 1 ? `${base}#${n}` : base;
}

/** `raise-500#2` -> 50000. Anything that is not a raise key answers null. */
export function levelCentsFromRoundKey(key) {
  const m = /^raise-(\d+(?:\.\d{1,2})?)(?:#\d+)?$/.exec(String(key || ""));
  return m ? centsOf(m[1]) : null;
}

/** The emcee says "I count nine": this is the number the clerk checks it against. */
export function roundsByLevel(rounds) {
  const byLevel = new Map();
  for (const [key, r] of Object.entries(rounds || {})) {
    const cents = levelCentsFromRoundKey(key);
    if (cents == null) continue;
    const row = byLevel.get(cents) || { amount_cents: cents, gifts: 0, total_cents: 0, paddles: 0 };
    row.gifts += Number(r?.gifts) || 0;
    row.total_cents += Number(r?.total_cents) || 0;
    row.paddles += Number(r?.paddles) || 0;
    byLevel.set(cents, row);
  }
  return [...byLevel.values()].sort((a, b) => b.amount_cents - a.amount_cents);
}

/* ------------------------------------------------------------------ *
 * the entry line
 * ------------------------------------------------------------------ */

// 08 s7.2: one field, and the whole grammar fits on a numpad.
//   45            paddle 45 at the locked level
//   12 45 88      a burst, because spotters shout in threes
//   45*750        $750 from paddle 45, whatever the level is
//   45a           anonymous for this gift
//   45!           a second gift from 45 at this level, on purpose
const TOKEN = /^(\d{1,6})(?:\*(\d{1,7}(?:\.\d{1,2})?))?([a!]{0,2})$/i;

/**
 * Never throws and never half-accepts: either every token parses or the line is
 * refused with a message, because half a burst is worse than none.
 */
export function parseEntry(text, levelCents) {
  const raw = String(text || "").trim();
  if (!raw) return { ok: false, reason: "empty", items: [] };

  const items = [];
  for (const token of raw.split(/[\s,]+/).filter(Boolean)) {
    const m = TOKEN.exec(token);
    if (!m) return { ok: false, reason: "bad-token", token, items: [] };
    const paddle = Number(m[1]);
    if (!paddle) return { ok: false, reason: "bad-paddle", token, items: [] };
    const cents = m[2] ? centsOf(m[2]) : Math.round(Number(levelCents) || 0);
    if (cents <= 0) return { ok: false, reason: "no-amount", token, items: [] };
    if (cents > 100_000_000) return { ok: false, reason: "too-large", token, items: [] };
    const flags = m[3].toLowerCase();
    items.push({
      paddle,
      cents,
      custom: Boolean(m[2]),
      anonymous: flags.includes("a"),
      force: flags.includes("!"),
    });
  }
  return { ok: true, items };
}

/* ------------------------------------------------------------------ *
 * the tape
 * ------------------------------------------------------------------ */

/**
 * Rows arrive keyed by `chg` and an edit re-sends the same row with a higher
 * `chg` (10 s2, rule 6). Upsert by `id`, keep the newest `chg`, never grow a
 * second copy of a corrected row.
 */
export function mergeTape(byId, rows) {
  if (!rows?.length) return byId;
  const next = { ...byId };
  for (const r of rows) {
    if (!r || r.id == null) continue;
    const prev = next[r.id];
    if (!prev || Number(r.chg) >= Number(prev.chg)) next[r.id] = r;
  }
  return next;
}

/** Newest change first: what a clerk watching the tape wants at the top. */
export function tapeList(byId) {
  return Object.values(byId || {}).sort((a, b) => Number(b.chg) - Number(a.chg));
}

const paddleOf = (row) => (row.paddle_number ?? row.called_number ?? null);

/**
 * The LOCAL duplicate guard. The server's unique index is the real one; this
 * only exists so the clerk hears about it before the gift is sent, naming the
 * other clerk (08 s7.2). Voided rows free the slot, so they do not count.
 */
export function findLiveAtLevel(rows, paddle, levelCents) {
  const want = Math.round(Number(levelCents) || 0);
  for (const r of rows) {
    if (r.voided_at) continue;
    if (paddleOf(r) !== Number(paddle)) continue;
    if (levelCentsFromRoundKey(r.round_key) !== want) continue;
    return r;
  }
  return null;
}

/** `45!` at a level that already has two gifts from 45 becomes `raise-500#3`. */
export function nextForceIndex(rows, paddle, levelCents) {
  const want = Math.round(Number(levelCents) || 0);
  let n = 0;
  for (const r of rows) {
    if (r.voided_at) continue;
    if (paddleOf(r) !== Number(paddle)) continue;
    if (levelCentsFromRoundKey(r.round_key) === want) n += 1;
  }
  return n + 1;
}

/** Seconds since a row was keyed, for "Clerk B, 8 s ago". */
export function secondsAgo(at, now) {
  const t = Date.parse(at || "");
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now - t) / 1000));
}

export function agoLabel(at, now) {
  const s = secondsAgo(at, now);
  if (s == null) return "";
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

/** What the clerk tape calls this row, in one word. Order matters. */
export function rowState(row) {
  if (row.voided_at) return "voided";
  if (row.retracted_at) return "retracted";
  if (row.hidden) return "hidden";
  if (!row.published) return "pending";
  return "live";
}

/**
 * The name on the clerk's tape, which is NOT the name on the projector: the
 * clerk sees the guest behind the paddle so they can say it out loud, the room
 * sees `display_name` (10 s6).
 */
export function rowName(row) {
  if (row.anonymous) return "Anonymous";
  if (row.guest_name) return row.guest_name;
  if (row.donor_name) return row.donor_name;
  // A needs-review row has no household, so `display_name` is already the
  // room's "Anonymous". The clerk needs the number they can shout instead.
  const p = paddleOf(row);
  if (p != null) return `Paddle ${p}`;
  return row.display_name || "Unnamed gift";
}

/* ------------------------------------------------------------------ *
 * paddle -> name, from the check-in roster
 * ------------------------------------------------------------------ */

/**
 * ONE PADDLE PER PERSON, so a number resolves to one named guest. This is only
 * used to put a name on the row while the server's answer is in flight; the row
 * the tape brings back always wins.
 */
export function paddleIndex(guests) {
  const out = {};
  for (const g of guests || []) {
    if (g.paddle_number == null || g.removed_at) continue;
    const prev = out[g.paddle_number];
    // The buyer of the household is the one the paddle is registered to.
    if (!prev || (g.buyer_name && g.name === g.buyer_name)) {
      out[g.paddle_number] = { name: g.name || "", label: g.party_label || g.buyer_name || "", table: g.table_number ?? null };
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * the offline queue
 * ------------------------------------------------------------------ */

// What survives a reload: a paddle, an amount and the op id that makes the
// resend safe. No name, no guest id, no token. Short keys because this lives in
// localStorage on a volunteer's own phone.
const QUEUE_VERSION = 1;

export function packQueue(items) {
  return {
    v: QUEUE_VERSION,
    q: (items || []).map((i) => ({
      o: i.op,
      p: i.paddle ?? null,
      c: i.cents,
      r: i.round || null,
      k: i.kind && i.kind !== "pledge" ? i.kind : undefined,
      a: i.anonymous ? 1 : undefined,
      t: i.at,
    })),
  };
}

/** Anything malformed is dropped, never thrown: a bad blob must not kill the app. */
export function unpackQueue(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); } catch { return []; }
  }
  if (!parsed || parsed.v !== QUEUE_VERSION || !Array.isArray(parsed.q)) return [];
  const out = [];
  for (const i of parsed.q) {
    const cents = Math.round(Number(i?.c) || 0);
    if (!i?.o || typeof i.o !== "string" || cents <= 0) continue;
    out.push({
      op: i.o,
      paddle: i.p == null ? null : Number(i.p),
      cents,
      round: i.r || null,
      kind: i.k || "pledge",
      anonymous: Boolean(i.a),
      at: Number(i.t) || 0,
      state: "waiting",
      tries: 0,
    });
  }
  return out;
}

/** The number the banner shouts. Anything not yet acknowledged by the server. */
export const queueDepth = (items) => (items || []).filter((i) => i.state !== "done").length;
