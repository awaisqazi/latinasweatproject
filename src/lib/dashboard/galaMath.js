// Gala module: pure, dependency-free data layer shared by the 2026 live ops
// tools and the Gala 2025 archive. No Supabase import, no DOM, no fetch.
// Every function here takes plain data in and returns plain data out, so it
// can be unit tested with plain `node` (see test/galaMath.test.mjs) and
// reused by both the archive views and, later, the live donation terminal.
//
// The two raw row shapes this module reconciles:
//   2025 (legacy import from Firestore): most guest/gift detail sits inside
//   the `extras` jsonb column, not real columns (see
//   docs/gala-2026/07-admin-dashboard-plan.md section 0.3 and 4).
//   2026 (new event-scoped schema): the same information lives in real
//   columns. Rule used everywhere below: a real column wins when present,
//   then `extras`, then a default. `extras` is read ONLY in
//   normalizeGuestRow/normalizeGiftRow; nothing downstream ever looks at it.
//
// All wall-clock formatting is in America/Chicago, never the server's UTC,
// because the DB stores UTC timestamps but the gala itself runs on Chicago
// time (see plan section 2 rule 10 and MASTER-PLAN section 2 "Time").

export const CHICAGO_TZ = "America/Chicago";

export const GIFT_KINDS = ["pledge", "external", "ticket_sales", "other"];

export const GIFT_KIND_LABELS = {
  pledge: "Pledge",
  external: "External",
  ticket_sales: "Ticket sales",
  other: "Other",
};

export const DEFAULT_QB_ITEM = "Gala Donation";

/* ------------------------------------------------------------------ *
 * tiny internal helpers (not exported; keep normalizers readable)
 * ------------------------------------------------------------------ */

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return undefined;
}

function firstBoolean(...values) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return false;
}

function toIntOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toPositiveInt(value) {
  const n = toIntOrNull(value);
  return n !== null && n > 0 ? n : null;
}

function toNonNegativeInt(value) {
  const n = toIntOrNull(value);
  return n !== null && n >= 0 ? n : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Accepts a real number, a numeric string, or a currency-formatted string
// ("$1,234.50") the way a hand-typed extras field might be stored. Anything
// unparseable is 0, never NaN: totals must always be safe to add.
function toAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normalizeGiftKind(raw) {
  if (raw === null || raw === undefined || raw === "") return "pledge";
  const key = String(raw).trim().toLowerCase();
  if (key === "pledge" || key === "external" || key === "ticket_sales") return key;
  return "other";
}

function indexGuestsByPaddle(guests) {
  const map = new Map();
  for (const guest of Array.isArray(guests) ? guests : []) {
    if (guest && guest.paddleNumber !== null && guest.paddleNumber !== undefined) {
      map.set(guest.paddleNumber, guest);
    }
  }
  return map;
}

/* ------------------------------------------------------------------ *
 * normalizers: the ONLY functions that know about `extras`
 * ------------------------------------------------------------------ */

// GalaGuest: { id, eventSlug, paddleNumber, fullName, firstName, lastName,
//   email, phone, partySize, checkedInCount, checkedInAt, tableLabel, meal,
//   ticketType, notes, originalPaddle, sourceRef, updatedAt }
export function normalizeGuestRow(row) {
  if (!row || typeof row !== "object") return null;
  const extras = row.extras && typeof row.extras === "object" ? row.extras : {};

  const firstName = firstString(row.first_name, extras.firstName);
  const lastName = firstString(row.last_name, extras.lastName);
  const joinedName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const fullName = joinedName || firstString(extras.fullName, row.full_name);

  const partySize = toPositiveInt(row.party_size) ?? toPositiveInt(extras.guestCount) ?? 1;
  const checkedInCountRaw =
    toNonNegativeInt(row.checked_in_count) ?? toNonNegativeInt(extras.checkedInCount);
  const legacyCheckedIn = firstBoolean(row.checked_in) === true;
  const checkedInCount = clamp(
    checkedInCountRaw ?? (legacyCheckedIn ? partySize : 0),
    0,
    Math.max(partySize, checkedInCountRaw ?? 0),
  );

  return {
    id: firstDefined(row.id) ?? null,
    eventSlug: firstDefined(row.event_slug) ?? null,
    paddleNumber: toIntOrNull(row.paddle_number),
    fullName,
    firstName,
    lastName,
    email: firstString(row.email, extras.email),
    phone: firstString(row.phone, extras.phone),
    partySize,
    checkedInCount,
    checkedInAt: firstDefined(row.check_in_time, row.checked_in_at) ?? null,
    tableLabel: firstString(row.table_label, extras.tableLabel),
    meal: firstString(row.meal, extras.meal),
    ticketType: firstString(row.ticket_type, extras.ticketType),
    notes: firstString(row.notes, extras.notes),
    originalPaddle: toIntOrNull(row.original_paddle),
    sourceRef: firstDefined(row.source_ref, row.legacy_id) ?? null,
    updatedAt: firstDefined(row.updated_at, row.created_at) ?? null,
  };
}

// GalaGift: { id, eventSlug, kind, paddleNumber, amount, donorName,
//   donorEmail, note, hidden, anonymous, voidedAt, voidReason, enteredBy,
//   enteredByLabel, clientOp, createdAt, updatedAt }
export function normalizeGiftRow(row) {
  if (!row || typeof row !== "object") return null;
  const extras = row.extras && typeof row.extras === "object" ? row.extras : {};

  return {
    id: firstDefined(row.id) ?? null,
    eventSlug: firstDefined(row.event_slug) ?? null,
    kind: normalizeGiftKind(firstDefined(row.kind, extras.type)),
    paddleNumber: toIntOrNull(row.paddle_number),
    amount: toAmount(firstDefined(row.amount, extras.amount)),
    donorName: firstString(row.donor_name, extras.donorName),
    donorEmail: firstString(row.donor_email, extras.donorEmail),
    note: firstString(row.note, extras.message),
    hidden: firstBoolean(row.hidden, extras.hidden),
    anonymous: firstBoolean(row.anonymous, extras.anonymous),
    voidedAt: firstDefined(row.voided_at) ?? null,
    voidReason: firstString(row.void_reason),
    enteredBy: firstDefined(row.entered_by) ?? null,
    enteredByLabel: firstString(row.entered_by_label),
    clientOp: firstDefined(row.client_op, row.legacy_id) ?? null,
    createdAt: firstDefined(row.created_at) ?? null,
    updatedAt: firstDefined(row.updated_at, row.created_at) ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * totals, donors, guests, attendance
 * ------------------------------------------------------------------ */

// computeTotals expects NORMALIZED gifts (output of normalizeGiftRow).
//
// `largestGift` / `averageGift` deliberately exclude `kind: "ticket_sales"`
// rows. Those are hand-entered lump sums for a whole batch of ticket
// purchases (2025 had three of them, one for $22,010), not a single donor's
// gift, so they must never win "largest gift" or skew "average gift". Ticket
// sales still count in every dollar total (`sumAll`, `sumPublic`/`sumHidden`,
// `ticketSalesTotal`) and get their own count (`ticketSalesCount`); they are
// just not "a gift" for the purposes of these two donor-facing stats. See
// docs/gala-2026 ticket G7.
export function computeTotals(gifts) {
  const rows = (Array.isArray(gifts) ? gifts : []).filter(Boolean);
  const byKind = { pledge: 0, external: 0, ticket_sales: 0, other: 0 };
  let sumAll = 0;
  let sumPublic = 0;
  let sumHidden = 0;
  let largestGift = null;
  let giftCount = 0;
  let pledgeGiftCount = 0;
  let pledgeSum = 0;
  let ticketSalesCount = 0;
  let voidedCount = 0;
  let voidedTotal = 0;

  for (const gift of rows) {
    const amount = Number.isFinite(gift.amount) ? gift.amount : 0;
    if (gift.voidedAt) {
      voidedCount += 1;
      voidedTotal += amount;
      continue;
    }
    giftCount += 1;
    sumAll += amount;
    byKind[gift.kind in byKind ? gift.kind : "other"] += amount;
    if (gift.hidden) sumHidden += amount;
    else sumPublic += amount;

    if (gift.kind === "ticket_sales") {
      ticketSalesCount += 1;
    } else {
      pledgeGiftCount += 1;
      pledgeSum += amount;
      if (!largestGift || amount > largestGift.amount) largestGift = gift;
    }
  }

  return {
    giftCount,
    pledgeGiftCount,
    ticketSalesCount,
    sumAll,
    sumPublic,
    sumHidden,
    pledgeTotal: byKind.pledge,
    externalTotal: byKind.external,
    ticketSalesTotal: byKind.ticket_sales,
    otherTotal: byKind.other,
    averageGift: pledgeGiftCount ? pledgeSum / pledgeGiftCount : 0,
    largestGift,
    voidedCount,
    voidedTotal,
  };
}

// Donor leaderboard. Groups by paddle first (most reliable join key), then
// lowercased email, then name, so a donor who gave more than once shows as
// one row. This is an internal/admin view: it always shows the real donor,
// even for gifts marked anonymous (that flag only controls the PUBLIC big
// screen). `anonymousCount` / `allAnonymous` let the UI flag it anyway.
export function groupDonors(gifts, guests = []) {
  const guestByPaddle = indexGuestsByPaddle(guests);
  const groups = new Map();

  for (const gift of (Array.isArray(gifts) ? gifts : []).filter((g) => g && !g.voidedAt)) {
    const guest =
      gift.paddleNumber !== null && gift.paddleNumber !== undefined
        ? guestByPaddle.get(gift.paddleNumber)
        : null;
    const emailKey = (gift.donorEmail || "").toLowerCase();
    const nameKey = (gift.donorName || "").toLowerCase();

    let key;
    if (gift.paddleNumber !== null && gift.paddleNumber !== undefined) key = `paddle:${gift.paddleNumber}`;
    else if (emailKey) key = `email:${emailKey}`;
    else if (nameKey) key = `name:${nameKey}`;
    else key = `anon:${gift.id ?? `${groups.size}`}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        donorName: (guest && guest.fullName) || gift.donorName || "Anonymous",
        paddleNumber: gift.paddleNumber ?? (guest ? guest.paddleNumber : null),
        email: (guest && guest.email) || gift.donorEmail || "",
        phone: (guest && guest.phone) || "",
        tableLabel: (guest && guest.tableLabel) || "",
        giftCount: 0,
        total: 0,
        anonymousCount: 0,
        gifts: [],
      });
    }

    const entry = groups.get(key);
    entry.giftCount += 1;
    entry.total += Number.isFinite(gift.amount) ? gift.amount : 0;
    if (gift.anonymous) entry.anonymousCount += 1;
    entry.gifts.push(gift);
  }

  return Array.from(groups.values())
    .map((entry) => ({ ...entry, allAnonymous: entry.giftCount > 0 && entry.anonymousCount === entry.giftCount }))
    .sort((a, b) => b.total - a.total);
}

// Assigns each non-voided gift to the highest level it clears. `levels`
// should be sorted descending, e.g. [5000, 2500, 1000, 500, 250, 100]; gifts
// below the smallest level land in the `level: null` ("under") bucket.
export function giftsByLevel(gifts, levels = []) {
  const sorted = [...levels].sort((a, b) => b - a);
  const buckets = sorted.map((level) => ({ level, count: 0, total: 0 }));
  const under = { level: null, count: 0, total: 0 };

  for (const gift of (Array.isArray(gifts) ? gifts : []).filter((g) => g && !g.voidedAt)) {
    const amount = Number.isFinite(gift.amount) ? gift.amount : 0;
    const bucket = buckets.find((b) => amount >= b.level) || under;
    bucket.count += 1;
    bucket.total += amount;
  }

  return [...buckets, under];
}

// attendance expects NORMALIZED guests.
export function attendance(guests) {
  const rows = (Array.isArray(guests) ? guests : []).filter(Boolean);
  let expected = 0;
  let arrived = 0;
  let paddlesIssued = 0;

  for (const guest of rows) {
    expected += Number.isFinite(guest.partySize) ? guest.partySize : 0;
    arrived += Number.isFinite(guest.checkedInCount) ? guest.checkedInCount : 0;
    if (guest.paddleNumber !== null && guest.paddleNumber !== undefined) paddlesIssued += 1;
  }

  return { expected, arrived, paddlesIssued, partyCount: rows.length };
}

// Decorates normalized guests with `totalPledged` (sum of their non-voided
// gifts, matched by paddle number) for the Guests & paddles table.
export function buildGuestRows(guests, gifts) {
  const totalsByPaddle = new Map();
  for (const gift of (Array.isArray(gifts) ? gifts : []).filter((g) => g && !g.voidedAt)) {
    if (gift.paddleNumber === null || gift.paddleNumber === undefined) continue;
    const amount = Number.isFinite(gift.amount) ? gift.amount : 0;
    totalsByPaddle.set(gift.paddleNumber, (totalsByPaddle.get(gift.paddleNumber) || 0) + amount);
  }

  return (Array.isArray(guests) ? guests : []).filter(Boolean).map((guest) => ({
    ...guest,
    totalPledged:
      guest.paddleNumber !== null && guest.paddleNumber !== undefined
        ? totalsByPaddle.get(guest.paddleNumber) || 0
        : 0,
  }));
}

// One place that combines totals + donor count + attendance for the
// "final totals" tiles (archive Overview, live Report).
export function buildArchiveSummary(guests, gifts) {
  const totals = computeTotals(gifts);
  const donorCount = groupDonors(gifts, guests).length;
  const att = attendance(guests);
  return {
    ...totals,
    donorCount,
    paddlesIssued: att.paddlesIssued,
    guestsExpected: att.expected,
    guestsArrived: att.arrived,
    partyCount: att.partyCount,
  };
}

/* ------------------------------------------------------------------ *
 * timeline: event-night detection + bucketing (America/Chicago)
 * ------------------------------------------------------------------ */

// YYYY-MM-DD in the given zone. Deliberately NOT `iso.slice(0, 10)`: that
// would use the UTC calendar date, and a gift at 11:45 PM Chicago time is
// already past midnight UTC the next day.
export function chicagoDateKey(iso, timeZone = CHICAGO_TZ) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDateCT(iso, timeZone = CHICAGO_TZ) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatTimeCT(iso, timeZone = CHICAGO_TZ) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatMoney(amount) {
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

// The Chicago calendar date with the most non-hidden, non-voided gifts. A
// migration artifact (rows whose Firestore timestamp was missing got
// `created_at` = the 2026-06-10 import run) would otherwise look like a
// small "event night" of its own, so hidden rows are excluded from the vote
// (2025's hand-entered ticket sales are `hidden: true` and were NOT part of
// a bulk backfill, but excluding hidden rows here also naturally keeps a
// handful of stray backfilled rows from tipping a close vote).
export function detectEventNight(gifts, options = {}) {
  const { timeZone = CHICAGO_TZ, padMinutes = 10 } = options;
  const candidates = (Array.isArray(gifts) ? gifts : []).filter(
    (g) => g && g.createdAt && !g.voidedAt && !g.hidden && !Number.isNaN(new Date(g.createdAt).getTime()),
  );
  if (!candidates.length) return null;

  const counts = new Map();
  for (const gift of candidates) {
    const key = chicagoDateKey(gift.createdAt, timeZone);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (!counts.size) return null;

  let bestKey = null;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }

  const dayRows = candidates.filter((g) => chicagoDateKey(g.createdAt, timeZone) === bestKey);
  const times = dayRows.map((g) => new Date(g.createdAt).getTime()).sort((a, b) => a - b);
  const padMs = padMinutes * 60 * 1000;

  return {
    dateKey: bestKey,
    start: new Date(times[0] - padMs).toISOString(),
    end: new Date(times[times.length - 1] + padMs).toISOString(),
    giftCount: dayRows.length,
  };
}

// Buckets ALL non-voided gifts (hidden included: totals must reconcile to
// the full ledger) that fall inside [start, end] into fixed-width buckets,
// with a running cumulative total. Gifts outside the window are counted in
// `excludedCount` but not in the buckets.
export function bucketTimeline(gifts, options = {}) {
  const { start, end, bucketMinutes = 5, timeZone = CHICAGO_TZ } = options;
  const rows = (Array.isArray(gifts) ? gifts : []).filter(
    (g) => g && g.createdAt && !g.voidedAt && !Number.isNaN(new Date(g.createdAt).getTime()),
  );

  const startMs = start ? new Date(start).getTime() : null;
  const endMs = end ? new Date(end).getTime() : null;

  if (startMs === null || endMs === null || Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { buckets: [], excludedCount: rows.length, totalInWindow: 0 };
  }

  const inWindow = [];
  let excludedCount = 0;
  for (const gift of rows) {
    const t = new Date(gift.createdAt).getTime();
    if (t < startMs || t > endMs) excludedCount += 1;
    else inWindow.push(gift);
  }

  const bucketMs = Math.max(1, bucketMinutes) * 60 * 1000;
  const bucketCount = Math.max(1, Math.ceil((endMs - startMs) / bucketMs));
  const buckets = [];
  for (let i = 0; i < bucketCount; i += 1) {
    const bucketStartMs = startMs + i * bucketMs;
    buckets.push({
      bucketStart: new Date(bucketStartMs).toISOString(),
      label: formatTimeCT(new Date(bucketStartMs).toISOString(), timeZone),
      amount: 0,
      cumulative: 0,
    });
  }

  for (const gift of inWindow) {
    const t = new Date(gift.createdAt).getTime();
    let idx = Math.floor((t - startMs) / bucketMs);
    idx = clamp(idx, 0, buckets.length - 1);
    buckets[idx].amount += Number.isFinite(gift.amount) ? gift.amount : 0;
  }

  let running = 0;
  for (const bucket of buckets) {
    running += bucket.amount;
    bucket.cumulative = running;
  }

  return { buckets, excludedCount, totalInWindow: running };
}

export function busiestBucket(buckets) {
  if (!Array.isArray(buckets) || !buckets.length) return null;
  return buckets.reduce((best, bucket) => (!best || bucket.amount > best.amount ? bucket : best), null);
}

// First bucket whose cumulative total reaches half of `total`; null when
// there is nothing to give (total <= 0) or no bucket reaches it.
export function timeToHalfTotal(buckets, total) {
  if (!Array.isArray(buckets) || !buckets.length || !(total > 0)) return null;
  const half = total / 2;
  for (const bucket of buckets) {
    if (bucket.cumulative >= half) return bucket.bucketStart;
  }
  return null;
}

// One-call version for the archive/report Timeline tab: detects the event
// night, buckets it, and rolls up the stat strip underneath the chart.
export function buildEventNightTimeline(gifts, options = {}) {
  const { bucketMinutes = 5, timeZone = CHICAGO_TZ } = options;
  const night = detectEventNight(gifts, { timeZone });
  const empty = {
    night: null,
    buckets: [],
    excludedCount: 0,
    totalInWindow: 0,
    busiest: null,
    timeToHalf: null,
    firstGiftAt: null,
    lastGiftAt: null,
    largestGift: null,
  };
  if (!night) return empty;

  const { buckets, excludedCount, totalInWindow } = bucketTimeline(gifts, {
    start: night.start,
    end: night.end,
    bucketMinutes,
    timeZone,
  });

  const startMs = new Date(night.start).getTime();
  const endMs = new Date(night.end).getTime();
  const inWindow = (Array.isArray(gifts) ? gifts : [])
    .filter((g) => g && g.createdAt && !g.voidedAt && !Number.isNaN(new Date(g.createdAt).getTime()))
    .filter((g) => {
      const t = new Date(g.createdAt).getTime();
      return t >= startMs && t <= endMs;
    })
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const largestGift = inWindow.reduce(
    (best, g) => (!best || (Number.isFinite(g.amount) ? g.amount : 0) > best.amount ? g : best),
    null,
  );

  return {
    night,
    buckets,
    excludedCount,
    totalInWindow,
    busiest: busiestBucket(buckets),
    timeToHalf: timeToHalfTotal(buckets, totalInWindow),
    firstGiftAt: inWindow[0]?.createdAt ?? null,
    lastGiftAt: inWindow[inWindow.length - 1]?.createdAt ?? null,
    largestGift,
  };
}

/* ------------------------------------------------------------------ *
 * duplicate detection (shared with the live donation terminal)
 * ------------------------------------------------------------------ */

// Non-voided gift on the same paddle, for the same amount, entered within
// `withinSeconds` of `now`. Used to warn a clerk who may be about to enter
// the same gift twice.
export function findRecentDuplicate(gifts, options = {}) {
  const { paddle, amount, withinSeconds = 90, now = Date.now() } = options;
  if (paddle === null || paddle === undefined) return null;
  const windowMs = withinSeconds * 1000;

  for (const gift of (Array.isArray(gifts) ? gifts : []).filter((g) => g && !g.voidedAt)) {
    if (gift.paddleNumber !== paddle) continue;
    if (Number(gift.amount) !== Number(amount)) continue;
    const createdMs = gift.createdAt ? new Date(gift.createdAt).getTime() : NaN;
    if (Number.isNaN(createdMs)) continue;
    if (Math.abs(now - createdMs) <= windowMs) return gift;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * CSV builders: RFC 4180 quoting + formula-injection guard
 * ------------------------------------------------------------------ */

const FORMULA_PREFIX_RE = /^[=+\-@]/;

// A cell that opens with =, +, - or @ is a live formula the instant Excel or
// Sheets opens the file (e.g. a donor note of "=cmd|'/c calc'!A1"). Prefixing
// with a single quote forces it to render as text everywhere that matters.
export function sanitizeCsvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return FORMULA_PREFIX_RE.test(text) ? `'${text}` : text;
}

function csvField(value) {
  const text = sanitizeCsvCell(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

// Pure RFC 4180 string builder (CRLF rows, doubled quotes). The browser
// download path (src/lib/dashboard/csv.js `downloadCsv`) does the same
// escaping again on top of the already-sanitized headers/rows these builders
// return, plus the UTF-8 BOM and Blob/anchor plumbing that needs a DOM.
export function toCsvString(headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(","));
  return lines.join("\r\n");
}

export const PLEDGES_CSV_HEADERS = [
  "Date", "Time (CT)", "Gift ID", "Kind", "Paddle", "Donor name", "Email",
  "Phone", "Amount", "Anonymous", "Hidden from screen", "Note", "Entered by", "Status",
];

export const DONORS_CSV_HEADERS = [
  "Donor", "Email", "Phone", "Paddle", "Table", "Gifts", "Total pledged", "Anonymous",
];

export const QUICKBOOKS_CSV_HEADERS = [
  "Customer", "Transaction date", "Item", "Description", "Amount", "Class", "Memo",
];

export const ATTENDANCE_CSV_HEADERS = [
  "Paddle", "Name", "Party size", "Checked in", "Check-in time (CT)", "Table", "Email", "Phone",
];

export function buildPledgesCsv(gifts, guests = [], options = {}) {
  const { timeZone = CHICAGO_TZ } = options;
  const guestByPaddle = indexGuestsByPaddle(guests);

  const rows = [...(Array.isArray(gifts) ? gifts : [])]
    .filter(Boolean)
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .map((gift) => {
      const guest =
        gift.paddleNumber !== null && gift.paddleNumber !== undefined
          ? guestByPaddle.get(gift.paddleNumber)
          : null;
      return [
        formatDateCT(gift.createdAt, timeZone),
        formatTimeCT(gift.createdAt, timeZone),
        gift.id ?? "",
        GIFT_KIND_LABELS[gift.kind] || gift.kind || "",
        gift.paddleNumber ?? "",
        gift.donorName || (guest ? guest.fullName : "") || "",
        gift.donorEmail || (guest ? guest.email : "") || "",
        (guest && guest.phone) || "",
        formatMoney(gift.amount),
        gift.anonymous ? "Yes" : "No",
        gift.hidden ? "Yes" : "No",
        gift.note || "",
        gift.enteredByLabel || "",
        gift.voidedAt ? "Voided" : "Recorded",
      ].map(sanitizeCsvCell);
    });

  return { headers: PLEDGES_CSV_HEADERS, rows };
}

export function buildDonorsCsv(gifts, guests = []) {
  const donors = groupDonors(gifts, guests);
  const rows = donors.map((donor) =>
    [
      donor.donorName || "Anonymous",
      donor.email || "",
      donor.phone || "",
      donor.paddleNumber ?? "",
      donor.tableLabel || "",
      donor.giftCount,
      formatMoney(donor.total),
      donor.anonymousCount === 0 ? "No" : donor.allAnonymous ? "Yes" : "Some",
    ].map(sanitizeCsvCell),
  );
  return { headers: DONORS_CSV_HEADERS, rows };
}

// Voided and hidden rows are excluded (Finance reconciles only recorded,
// public revenue). Anonymous gifts still export the real donor: the books
// need it even when the screen showed "Anonymous".
export function buildQuickBooksCsv(gifts, options = {}) {
  const { qbItem = DEFAULT_QB_ITEM, qbClass = "", timeZone = CHICAGO_TZ } = options;
  const rows = (Array.isArray(gifts) ? gifts : [])
    .filter((gift) => gift && !gift.voidedAt && !gift.hidden)
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .map((gift) =>
      [
        gift.donorName || "Unknown donor",
        formatDateCT(gift.createdAt, timeZone),
        qbItem,
        GIFT_KIND_LABELS[gift.kind] || "Gift",
        gift.amount.toFixed(2),
        qbClass,
        gift.note || "",
      ].map(sanitizeCsvCell),
    );
  return { headers: QUICKBOOKS_CSV_HEADERS, rows };
}

export function buildAttendanceCsv(guests, options = {}) {
  const { timeZone = CHICAGO_TZ } = options;
  const rows = (Array.isArray(guests) ? guests : [])
    .filter(Boolean)
    .sort((a, b) => (a.paddleNumber ?? Infinity) - (b.paddleNumber ?? Infinity))
    .map((guest) =>
      [
        guest.paddleNumber ?? "",
        guest.fullName || "",
        guest.partySize,
        guest.checkedInCount,
        guest.checkedInCount > 0 && guest.checkedInAt ? formatTimeCT(guest.checkedInAt, timeZone) : "",
        guest.tableLabel || "",
        guest.email || "",
        guest.phone || "",
      ].map(sanitizeCsvCell),
    );
  return { headers: ATTENDANCE_CSV_HEADERS, rows };
}
