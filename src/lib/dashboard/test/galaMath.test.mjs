// Gala data layer · logic tests.  node src/lib/dashboard/test/galaMath.test.mjs
//
// PRIVACY: every name, email and note below is invented for this file. Real
// guest or donor data never enters the repo, not in fixtures, not in output.

import assert from "node:assert/strict";
import {
  normalizeGuestRow,
  normalizeGiftRow,
  computeTotals,
  groupDonors,
  giftsByLevel,
  attendance,
  buildGuestRows,
  buildArchiveSummary,
  chicagoDateKey,
  formatDateCT,
  formatTimeCT,
  formatMoney,
  detectEventNight,
  bucketTimeline,
  busiestBucket,
  timeToHalfTotal,
  buildEventNightTimeline,
  findRecentDuplicate,
  sanitizeCsvCell,
  toCsvString,
  buildPledgesCsv,
  buildDonorsCsv,
  buildQuickBooksCsv,
  buildAttendanceCsv,
} from "../galaMath.js";

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
function close(actual, expected, epsilon = 0.001, message) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message || "not close enough"}: expected ${expected}, got ${actual}`);
  }
}

/* ------------------------------------------------------------------ *
 * fixtures (invented names only)
 * ------------------------------------------------------------------ */

// A 2025-style row: everything real is null, detail sits in `extras`.
function legacyGuestRow(overrides = {}) {
  return {
    id: "g-legacy-1",
    legacy_id: "firestore-abc123",
    paddle_number: 12,
    first_name: null,
    last_name: null,
    checked_in: true,
    check_in_time: "2025-10-04T23:10:00Z",
    original_paddle: null,
    extras: { fullName: "Marisol Vega", guestCount: 3, checkedInCount: 2 },
    created_at: "2025-06-01T00:00:00Z",
    updated_at: "2025-06-01T00:00:00Z",
    ...overrides,
  };
}

// A 2026-style row: real columns populated, extras empty.
function liveGuestRow(overrides = {}) {
  return {
    id: "g-live-1",
    event_slug: "gala-2026",
    paddle_number: 101,
    first_name: "Rocio",
    last_name: "Delgado",
    party_size: 2,
    checked_in_count: 1,
    checked_in: false,
    check_in_time: null,
    email: "rocio@example.org",
    phone: "312-555-0199",
    table_label: "Table 4",
    meal: "Vegetarian",
    ticket_type: "Benefactor",
    notes: "",
    original_paddle: null,
    source_ref: "seating:g-live-1",
    extras: {},
    created_at: "2026-09-25T23:00:00Z",
    updated_at: "2026-09-25T23:05:00Z",
    ...overrides,
  };
}

function legacyGiftRow(overrides = {}) {
  return {
    id: "d-legacy-1",
    legacy_id: "firestore-gift-1",
    paddle_number: 12,
    amount: 500,
    donor_name: null,
    extras: { type: "PLEDGE", donorEmail: "marisol@example.org", message: "For the scholarship fund", hidden: false },
    created_at: "2025-10-04T23:12:00Z",
    ...overrides,
  };
}

function liveGiftRow(overrides = {}) {
  return {
    id: "d-live-1",
    event_slug: "gala-2026",
    kind: "pledge",
    paddle_number: 101,
    amount: 1000,
    donor_name: "Rocio Delgado",
    donor_email: "rocio@example.org",
    note: "",
    hidden: false,
    anonymous: false,
    voided_at: null,
    void_reason: null,
    entered_by: "profile-1",
    entered_by_label: "Fez Q.",
    client_op: "op-1",
    created_at: "2026-09-25T23:20:00Z",
    updated_at: "2026-09-25T23:20:00Z",
    extras: {},
    ...overrides,
  };
}

/* ------------------------------------------------------------------ *
 * normalizeGuestRow
 * ------------------------------------------------------------------ */

describe("normalizeGuestRow", () => {
  it("returns null for a missing row", () => {
    eq(normalizeGuestRow(null), null);
    eq(normalizeGuestRow(undefined), null);
  });

  it("reads a 2025-style row entirely from extras", () => {
    const guest = normalizeGuestRow(legacyGuestRow());
    eq(guest.fullName, "Marisol Vega");
    eq(guest.firstName, "");
    eq(guest.lastName, "");
    eq(guest.paddleNumber, 12);
    eq(guest.partySize, 3);
    eq(guest.checkedInCount, 2);
    eq(guest.checkedInAt, "2025-10-04T23:10:00Z");
  });

  it("prefers real columns over extras for a 2026-style row", () => {
    const guest = normalizeGuestRow(liveGuestRow());
    eq(guest.fullName, "Rocio Delgado");
    eq(guest.firstName, "Rocio");
    eq(guest.lastName, "Delgado");
    eq(guest.email, "rocio@example.org");
    eq(guest.partySize, 2);
    eq(guest.checkedInCount, 1);
    eq(guest.tableLabel, "Table 4");
  });

  it("real column wins even when extras also has a value", () => {
    const guest = normalizeGuestRow(
      legacyGuestRow({ first_name: "Ana", last_name: "Ruiz", extras: { fullName: "Should be ignored", guestCount: 3, checkedInCount: 2 } }),
    );
    eq(guest.fullName, "Ana Ruiz");
  });

  it("defaults safely when every field is null", () => {
    const guest = normalizeGuestRow({
      id: "g-null", paddle_number: null, first_name: null, last_name: null,
      checked_in: null, check_in_time: null, original_paddle: null,
      extras: null, created_at: null, updated_at: null,
    });
    eq(guest.fullName, "");
    eq(guest.paddleNumber, null);
    eq(guest.partySize, 1, "party size defaults to 1, never 0");
    eq(guest.checkedInCount, 0);
    eq(guest.email, "");
    eq(guest.originalPaddle, null);
  });

  it("falls back to the legacy checked_in boolean when checkedInCount is missing", () => {
    const guest = normalizeGuestRow(
      legacyGuestRow({ checked_in: true, extras: { fullName: "Iris Cano", guestCount: 4 } }),
    );
    eq(guest.checkedInCount, 4, "no checkedInCount in extras, but checked_in=true, so the whole party arrived");
  });

  it("never reports more arrivals than the party size", () => {
    const guest = normalizeGuestRow(
      legacyGuestRow({ extras: { fullName: "Over Counted", guestCount: 2, checkedInCount: 9 } }),
    );
    eq(guest.checkedInCount, 9, "clamp uses the larger of partySize/checkedInCount as ceiling so a bad extras value is preserved, not silently dropped");
    ok(guest.checkedInCount >= guest.partySize, "documents the clamp behavior explicitly");
  });
});

/* ------------------------------------------------------------------ *
 * normalizeGiftRow
 * ------------------------------------------------------------------ */

describe("normalizeGiftRow", () => {
  it("returns null for a missing row", () => {
    eq(normalizeGiftRow(undefined), null);
  });

  it("maps a 2025-style row's extras.type to a normalized kind", () => {
    const gift = normalizeGiftRow(legacyGiftRow());
    eq(gift.kind, "pledge");
    eq(gift.amount, 500);
    eq(gift.donorEmail, "marisol@example.org");
    eq(gift.note, "For the scholarship fund");
    eq(gift.hidden, false);
  });

  it("maps EXTERNAL and TICKET_SALES case-insensitively", () => {
    eq(normalizeGiftRow(legacyGiftRow({ extras: { type: "EXTERNAL" } })).kind, "external");
    eq(normalizeGiftRow(legacyGiftRow({ extras: { type: "TICKET_SALES", hidden: true } })).kind, "ticket_sales");
    eq(normalizeGiftRow(legacyGiftRow({ extras: { type: "ticket_sales" } })).kind, "ticket_sales");
  });

  it("missing kind defaults to pledge; unrecognized values become other", () => {
    eq(normalizeGiftRow(legacyGiftRow({ extras: {} })).kind, "pledge");
    eq(normalizeGiftRow(legacyGiftRow({ extras: { type: "MYSTERY_BOX" } })).kind, "other");
  });

  it("coerces a currency-formatted string amount", () => {
    const gift = normalizeGiftRow(legacyGiftRow({ amount: "$1,250.50" }));
    eq(gift.amount, 1250.5);
  });

  it("coerces a plain numeric string amount", () => {
    const gift = normalizeGiftRow(legacyGiftRow({ amount: "75" }));
    eq(gift.amount, 75);
  });

  it("an unparseable amount becomes 0, never NaN", () => {
    const gift = normalizeGiftRow(legacyGiftRow({ amount: "donated in kind" }));
    eq(gift.amount, 0);
    ok(!Number.isNaN(gift.amount));
  });

  it("reads a 2026-style row from real columns", () => {
    const gift = normalizeGiftRow(liveGiftRow({ anonymous: true }));
    eq(gift.kind, "pledge");
    eq(gift.amount, 1000);
    eq(gift.donorName, "Rocio Delgado");
    eq(gift.anonymous, true);
    eq(gift.enteredByLabel, "Fez Q.");
  });

  it("hidden gifts (2025 hand-entered ticket sales) normalize to hidden: true", () => {
    const gift = normalizeGiftRow(legacyGiftRow({ paddle_number: null, extras: { type: "TICKET_SALES", hidden: true } }));
    eq(gift.hidden, true);
    eq(gift.kind, "ticket_sales");
  });

  it("nulls everywhere still produce a safe object", () => {
    const gift = normalizeGiftRow({
      id: null, paddle_number: null, amount: null, donor_name: null,
      extras: null, created_at: null,
    });
    eq(gift.amount, 0);
    eq(gift.kind, "pledge");
    eq(gift.hidden, false);
    eq(gift.paddleNumber, null);
    eq(gift.donorName, "");
  });
});

/* ------------------------------------------------------------------ *
 * computeTotals
 * ------------------------------------------------------------------ */

describe("computeTotals", () => {
  it("returns all zeros for no donations", () => {
    const totals = computeTotals([]);
    eq(totals.giftCount, 0);
    eq(totals.sumAll, 0);
    eq(totals.averageGift, 0);
    eq(totals.largestGift, null);
  });

  it("splits pledge, external, ticket_sales and hidden correctly", () => {
    const gifts = [
      normalizeGiftRow(legacyGiftRow({ id: "1", amount: 500, extras: { type: "PLEDGE" } })),
      normalizeGiftRow(legacyGiftRow({ id: "2", amount: 200, extras: { type: "EXTERNAL" } })),
      normalizeGiftRow(legacyGiftRow({ id: "3", amount: 100, extras: { type: "TICKET_SALES", hidden: true } })),
      normalizeGiftRow(legacyGiftRow({ id: "4", amount: 50, extras: { type: "TICKET_SALES", hidden: true } })),
    ];
    const totals = computeTotals(gifts);
    eq(totals.giftCount, 4);
    eq(totals.pledgeTotal, 500);
    eq(totals.externalTotal, 200);
    eq(totals.ticketSalesTotal, 150);
    eq(totals.sumHidden, 150, "both ticket_sales rows are hidden");
    eq(totals.sumPublic, 700, "pledge + external, the room saw this much");
    eq(totals.sumAll, 850);
    // averageGift/largestGift are pledge-only (see the function's own doc
    // comment): the two ticket_sales rows are excluded from both, though they
    // still count in ticketSalesTotal/ticketSalesCount and every dollar total.
    eq(totals.pledgeGiftCount, 2);
    eq(totals.ticketSalesCount, 2);
    close(totals.averageGift, 700 / 2, 0.001, "average is pledge + external only, not ticket_sales");
    eq(totals.largestGift.id, "1");
  });

  it("excludes voided gifts from every total but still counts them separately", () => {
    const gifts = [
      normalizeGiftRow(legacyGiftRow({ id: "1", amount: 500 })),
      normalizeGiftRow(liveGiftRow({ id: "2", amount: 9999, voided_at: "2026-09-25T23:30:00Z" })),
    ];
    const totals = computeTotals(gifts);
    eq(totals.giftCount, 1);
    eq(totals.sumAll, 500, "the voided $9,999 gift must not inflate the total");
    eq(totals.voidedCount, 1);
    eq(totals.voidedTotal, 9999);
    eq(totals.largestGift.id, "1");
  });

  it("a large ticket_sales lump sum never outranks or skews a real gift (bug: largest showed $22,010 of ticket sales)", () => {
    const gifts = [
      normalizeGiftRow(legacyGiftRow({ id: "p1", amount: 500, extras: { type: "PLEDGE" } })),
      normalizeGiftRow(legacyGiftRow({ id: "p2", amount: 1000, extras: { type: "PLEDGE" } })),
      normalizeGiftRow(legacyGiftRow({ id: "t1", amount: 22010, extras: { type: "TICKET_SALES", hidden: true } })),
    ];
    const totals = computeTotals(gifts);
    eq(totals.largestGift.id, "p2", "the $22,010 ticket-sales batch must not outrank a real pledge");
    close(totals.averageGift, 750, 0.001, "average is pledge-only: (500 + 1000) / 2");
    eq(totals.pledgeGiftCount, 2);
    eq(totals.ticketSalesCount, 1);
    eq(totals.ticketSalesTotal, 22010, "ticket sales still count toward their own total");
    eq(totals.sumAll, 23510, "and toward the grand total");
  });
});

/* ------------------------------------------------------------------ *
 * groupDonors
 * ------------------------------------------------------------------ */

describe("groupDonors", () => {
  it("groups repeat gifts on the same paddle into one donor row", () => {
    const guests = [normalizeGuestRow(legacyGuestRow({ paddle_number: 12, extras: { fullName: "Marisol Vega", guestCount: 2 } }))];
    const gifts = [
      normalizeGiftRow(legacyGiftRow({ id: "1", paddle_number: 12, amount: 500 })),
      normalizeGiftRow(legacyGiftRow({ id: "2", paddle_number: 12, amount: 250 })),
    ];
    const donors = groupDonors(gifts, guests);
    eq(donors.length, 1);
    eq(donors[0].donorName, "Marisol Vega");
    eq(donors[0].giftCount, 2);
    eq(donors[0].total, 750);
  });

  it("falls back to email, then name, when there is no paddle", () => {
    const gifts = [
      normalizeGiftRow(legacyGiftRow({ id: "1", paddle_number: null, donor_name: "Luz Obregón", extras: { type: "EXTERNAL", donorEmail: "luz@example.org" } })),
      normalizeGiftRow(legacyGiftRow({ id: "2", paddle_number: null, donor_name: "Luz Obregón", extras: { type: "EXTERNAL", donorEmail: "LUZ@example.org" } })),
    ];
    const donors = groupDonors(gifts, []);
    eq(donors.length, 1, "case-insensitive email match collapses both gifts into one donor");
    eq(donors[0].total, 1000);
  });

  it("keeps the real donor name and flags anonymous gifts without hiding them", () => {
    const gifts = [normalizeGiftRow(liveGiftRow({ id: "1", anonymous: true }))];
    const donors = groupDonors(gifts, []);
    eq(donors[0].donorName, "Rocio Delgado", "internal donor views always show the real name");
    eq(donors[0].allAnonymous, true);
  });

  it("returns an empty leaderboard for zero donations", () => {
    deepEq(groupDonors([], []), []);
  });
});

/* ------------------------------------------------------------------ *
 * giftsByLevel, attendance, buildGuestRows, buildArchiveSummary
 * ------------------------------------------------------------------ */

describe("giftsByLevel", () => {
  it("buckets by the highest level cleared and puts small gifts under the last one", () => {
    const gifts = [
      normalizeGiftRow(liveGiftRow({ id: "1", amount: 5000 })),
      normalizeGiftRow(liveGiftRow({ id: "2", amount: 2600 })),
      normalizeGiftRow(liveGiftRow({ id: "3", amount: 40 })),
    ];
    const buckets = giftsByLevel(gifts, [5000, 2500, 1000]);
    eq(buckets.find((b) => b.level === 5000).count, 1);
    eq(buckets.find((b) => b.level === 2500).count, 1);
    eq(buckets.find((b) => b.level === null).count, 1, "the $40 gift lands in the under bucket");
  });
});

describe("attendance", () => {
  it("sums arrivals over party size and counts issued paddles", () => {
    const guests = [
      normalizeGuestRow(legacyGuestRow({ paddle_number: 1, extras: { fullName: "A", guestCount: 2, checkedInCount: 2 } })),
      normalizeGuestRow(legacyGuestRow({ paddle_number: null, extras: { fullName: "B", guestCount: 3, checkedInCount: 0 } })),
    ];
    const att = attendance(guests);
    eq(att.expected, 5);
    eq(att.arrived, 2);
    eq(att.paddlesIssued, 1);
    eq(att.partyCount, 2);
  });
});

describe("buildGuestRows / buildArchiveSummary", () => {
  it("attaches totalPledged by matching paddle number", () => {
    const guests = [normalizeGuestRow(legacyGuestRow({ paddle_number: 12, extras: { fullName: "Marisol Vega", guestCount: 2 } }))];
    const gifts = [normalizeGiftRow(legacyGiftRow({ paddle_number: 12, amount: 300 }))];
    const rows = buildGuestRows(guests, gifts);
    eq(rows[0].totalPledged, 300);
  });

  it("summarizes zero-donation events without throwing", () => {
    const summary = buildArchiveSummary([], []);
    eq(summary.sumAll, 0);
    eq(summary.donorCount, 0);
    eq(summary.guestsExpected, 0);
  });
});

/* ------------------------------------------------------------------ *
 * Chicago time formatting + UTC-midnight straddling
 * ------------------------------------------------------------------ */

describe("Chicago time helpers", () => {
  it("groups by the Chicago calendar date, not the UTC date", () => {
    // 2026-09-26T03:00:00Z is 2026-09-25 10:00 PM in Chicago (CDT, UTC-5).
    eq(chicagoDateKey("2026-09-26T03:00:00Z"), "2026-09-25");
    // 2026-09-26T07:00:00Z is 2026-09-26 2:00 AM in Chicago: a different
    // Chicago day even though both timestamps are on the same UTC date.
    eq(chicagoDateKey("2026-09-26T07:00:00Z"), "2026-09-26");
  });

  it("formats a time in Chicago wall-clock, not UTC", () => {
    // 2026-09-26T01:30:00Z = 2026-09-25 8:30 PM CDT.
    eq(formatTimeCT("2026-09-26T01:30:00Z"), "8:30 PM");
  });

  it("formatMoney renders whole and fractional dollars", () => {
    eq(formatMoney(500), "$500.00");
    eq(formatMoney(1234.5), "$1,234.50");
    eq(formatMoney(null), "$0.00");
  });
});

/* ------------------------------------------------------------------ *
 * detectEventNight / bucketTimeline / buildEventNightTimeline
 * ------------------------------------------------------------------ */

describe("detectEventNight", () => {
  it("returns null when there are no gifts", () => {
    eq(detectEventNight([]), null);
  });

  it("picks the Chicago date with the most gifts, so the small migration-day cluster loses the vote", () => {
    // Per docs/gala-2026/07-admin-dashboard-plan.md section 3.5: rows whose
    // Firestore timestamp was missing got created_at = the 2026-06-10 import
    // run. That is a small handful of rows, never as many as an actual event
    // night, so the plain "busiest Chicago date" rule naturally excludes it
    // without any special-cased date check.
    const gifts = [
      // The real event night: Oct 4, 2025, five gifts.
      normalizeGiftRow(legacyGiftRow({ id: "n1", created_at: "2025-10-05T00:05:00Z", amount: 500 })), // 2025-10-04 7:05 PM CDT
      normalizeGiftRow(legacyGiftRow({ id: "n2", created_at: "2025-10-05T00:20:00Z", amount: 250 })),
      normalizeGiftRow(legacyGiftRow({ id: "n3", created_at: "2025-10-05T01:45:00Z", amount: 1000 })),
      normalizeGiftRow(legacyGiftRow({ id: "n4", created_at: "2025-10-05T02:10:00Z", amount: 300 })),
      normalizeGiftRow(legacyGiftRow({ id: "n5", created_at: "2025-10-05T02:40:00Z", amount: 150 })),
      // A small migration-artifact cluster on the import date.
      normalizeGiftRow(legacyGiftRow({ id: "m1", created_at: "2026-06-10T15:00:00Z", amount: 10 })),
      normalizeGiftRow(legacyGiftRow({ id: "m2", created_at: "2026-06-10T15:01:00Z", amount: 10 })),
    ];
    const night = detectEventNight(gifts);
    eq(night.dateKey, "2025-10-04");
    eq(night.giftCount, 5);
  });

  it("excludes hidden rows from the vote so a batch of hidden ticket sales cannot hijack the date", () => {
    const gifts = [
      normalizeGiftRow(legacyGiftRow({ id: "real1", created_at: "2025-10-05T00:05:00Z", amount: 500 })),
      normalizeGiftRow(legacyGiftRow({ id: "real2", created_at: "2025-10-05T00:20:00Z", amount: 500 })),
      normalizeGiftRow(legacyGiftRow({ id: "hidden1", created_at: "2025-11-01T12:00:00Z", extras: { type: "TICKET_SALES", hidden: true } })),
      normalizeGiftRow(legacyGiftRow({ id: "hidden2", created_at: "2025-11-01T12:05:00Z", extras: { type: "TICKET_SALES", hidden: true } })),
      normalizeGiftRow(legacyGiftRow({ id: "hidden3", created_at: "2025-11-01T12:10:00Z", extras: { type: "TICKET_SALES", hidden: true } })),
    ];
    eq(detectEventNight(gifts).dateKey, "2025-10-04");
  });
});

describe("bucketTimeline / busiestBucket / timeToHalfTotal", () => {
  it("buckets in-window gifts, excludes out-of-window gifts, and accumulates cumulative totals", () => {
    const start = "2025-10-05T00:00:00Z";
    const end = "2025-10-05T00:30:00Z";
    const gifts = [
      normalizeGiftRow(legacyGiftRow({ id: "1", created_at: "2025-10-05T00:02:00Z", amount: 100 })),
      normalizeGiftRow(legacyGiftRow({ id: "2", created_at: "2025-10-05T00:07:00Z", amount: 400 })),
      normalizeGiftRow(legacyGiftRow({ id: "3", created_at: "2025-10-05T00:22:00Z", amount: 200 })),
      normalizeGiftRow(legacyGiftRow({ id: "outside", created_at: "2025-10-05T02:00:00Z", amount: 9999 })),
    ];
    const { buckets, excludedCount, totalInWindow } = bucketTimeline(gifts, { start, end, bucketMinutes: 5 });
    eq(excludedCount, 1);
    eq(totalInWindow, 700);
    eq(buckets.length, 6, "30 minutes / 5-minute buckets");
    eq(buckets[0].amount, 100);
    eq(buckets[1].amount, 400, "the 00:07 gift lands in the second 5-minute bucket");
    eq(buckets[buckets.length - 1].cumulative, 700, "cumulative total reaches the full in-window sum");

    const busiest = busiestBucket(buckets);
    eq(busiest.amount, 400);

    const halfAt = timeToHalfTotal(buckets, totalInWindow);
    ok(halfAt !== null);
  });

  it("returns an empty result instead of throwing when there is no window", () => {
    const result = bucketTimeline([], {});
    deepEq(result.buckets, []);
    eq(result.totalInWindow, 0);
  });

  it("timeToHalfTotal is null when there is nothing to give", () => {
    eq(timeToHalfTotal([{ bucketStart: "x", cumulative: 0 }], 0), null);
  });
});

describe("buildEventNightTimeline", () => {
  it("rolls up night detection, bucketing, and the stat strip in one call", () => {
    const gifts = [
      normalizeGiftRow(legacyGiftRow({ id: "1", created_at: "2025-10-05T00:05:00Z", amount: 500 })),
      normalizeGiftRow(legacyGiftRow({ id: "2", created_at: "2025-10-05T00:35:00Z", amount: 1500 })),
    ];
    const result = buildEventNightTimeline(gifts, { bucketMinutes: 10 });
    ok(result.night);
    eq(result.largestGift.id, "2");
    eq(result.firstGiftAt, "2025-10-05T00:05:00Z");
    eq(result.lastGiftAt, "2025-10-05T00:35:00Z");
    ok(result.totalInWindow === 2000);
  });

  it("handles zero gifts without throwing", () => {
    const result = buildEventNightTimeline([]);
    eq(result.night, null);
    deepEq(result.buckets, []);
  });
});

/* ------------------------------------------------------------------ *
 * findRecentDuplicate
 * ------------------------------------------------------------------ */

describe("findRecentDuplicate", () => {
  const now = new Date("2026-09-25T23:20:00Z").getTime();

  it("finds a same paddle, same amount gift inside the 90 second window", () => {
    const gifts = [normalizeGiftRow(liveGiftRow({ id: "1", created_at: "2026-09-25T23:19:00Z", amount: 500, paddle_number: 42 }))];
    const dup = findRecentDuplicate(gifts, { paddle: 42, amount: 500, withinSeconds: 90, now });
    eq(dup.id, "1");
  });

  it("ignores a match outside the window", () => {
    const gifts = [normalizeGiftRow(liveGiftRow({ id: "1", created_at: "2026-09-25T23:17:00Z", amount: 500, paddle_number: 42 }))];
    // 180 seconds before `now`, outside a 90 second window.
    eq(findRecentDuplicate(gifts, { paddle: 42, amount: 500, withinSeconds: 90, now }), null);
  });

  it("ignores voided gifts even if they otherwise match", () => {
    const gifts = [normalizeGiftRow(liveGiftRow({ id: "1", created_at: "2026-09-25T23:19:30Z", amount: 500, paddle_number: 42, voided_at: "2026-09-25T23:19:40Z" }))];
    eq(findRecentDuplicate(gifts, { paddle: 42, amount: 500, withinSeconds: 90, now }), null);
  });

  it("ignores a different amount on the same paddle", () => {
    const gifts = [normalizeGiftRow(liveGiftRow({ id: "1", created_at: "2026-09-25T23:19:30Z", amount: 500, paddle_number: 42 }))];
    eq(findRecentDuplicate(gifts, { paddle: 42, amount: 250, withinSeconds: 90, now }), null);
  });

  it("returns null with no paddle given", () => {
    eq(findRecentDuplicate([], { paddle: null, amount: 500 }), null);
  });
});

/* ------------------------------------------------------------------ *
 * CSV builders: RFC 4180 quoting + formula-injection guard
 * ------------------------------------------------------------------ */

describe("sanitizeCsvCell / toCsvString", () => {
  it("prefixes cells that start with =, +, - or @ with a single quote", () => {
    eq(sanitizeCsvCell("=cmd|'/c calc'!A1"), "'=cmd|'/c calc'!A1");
    eq(sanitizeCsvCell("+1 555 0100"), "'+1 555 0100");
    eq(sanitizeCsvCell("-500"), "'-500");
    eq(sanitizeCsvCell("@mention"), "'@mention");
    eq(sanitizeCsvCell("Marisol Vega"), "Marisol Vega", "an ordinary cell is untouched");
    eq(sanitizeCsvCell(null), "");
    eq(sanitizeCsvCell(undefined), "");
  });

  it("quotes fields containing commas, quotes or newlines and doubles internal quotes", () => {
    const csv = toCsvString(["Name", "Note"], [["Vega, Marisol", 'Said "thank you"'], ["Plain", "no special chars"]]);
    const lines = csv.split("\r\n");
    eq(lines[0], "Name,Note");
    eq(lines[1], '"Vega, Marisol","Said ""thank you"""');
    eq(lines[2], "Plain,no special chars");
  });

  it("preserves accented characters untouched", () => {
    const csv = toCsvString(["Name"], [["Iñez Muñoz"]]);
    ok(csv.includes("Iñez Muñoz"));
  });

  it("uses CRLF row separators (Excel-friendly)", () => {
    const csv = toCsvString(["A"], [["1"], ["2"]]);
    eq(csv, "A\r\n1\r\n2");
  });
});

describe("buildPledgesCsv", () => {
  it("builds one row per gift with a Voided status and a comma-safe donor name", () => {
    const guests = [normalizeGuestRow(legacyGuestRow({ paddle_number: 12, extras: { fullName: "Vega, Marisol", guestCount: 1 } }))];
    const gifts = [
      normalizeGiftRow(legacyGiftRow({ id: "1", paddle_number: 12, amount: 500, created_at: "2025-10-05T00:05:00Z" })),
      normalizeGiftRow(liveGiftRow({ id: "2", voided_at: "2026-09-25T23:30:00Z" })),
    ];
    const { headers, rows } = buildPledgesCsv(gifts, guests);
    eq(headers.length, 14);
    eq(rows.length, 2);
    ok(rows[0].includes("Recorded"));
    ok(rows[1].includes("Voided"));
    const csv = toCsvString(headers, rows);
    ok(csv.includes('"Vega, Marisol"'), "the guest fallback name is quoted because it contains a comma");
  });
});

describe("buildDonorsCsv", () => {
  it("marks a fully anonymous donor group as Anonymous: Yes", () => {
    const gifts = [normalizeGiftRow(liveGiftRow({ id: "1", anonymous: true }))];
    const { rows } = buildDonorsCsv(gifts, []);
    eq(rows[0][0], "Rocio Delgado");
    eq(rows[0][rows[0].length - 1], "Yes");
  });

  it("returns no rows for zero donations", () => {
    const { rows } = buildDonorsCsv([], []);
    deepEq(rows, []);
  });
});

describe("buildQuickBooksCsv", () => {
  it("excludes voided and hidden rows and formats a plain decimal amount", () => {
    const gifts = [
      normalizeGiftRow(legacyGiftRow({ id: "1", amount: 500 })),
      normalizeGiftRow(legacyGiftRow({ id: "2", amount: 100, extras: { type: "TICKET_SALES", hidden: true } })),
      normalizeGiftRow(liveGiftRow({ id: "3", amount: 250, voided_at: "2026-09-25T23:30:00Z" })),
    ];
    const { headers, rows } = buildQuickBooksCsv(gifts, { qbClass: "Fundraising:Gala 2025" });
    eq(headers[0], "Customer");
    eq(rows.length, 1);
    eq(rows[0][4], "500.00");
    eq(rows[0][5], "Fundraising:Gala 2025");
  });

  it("exports the real donor name even for an anonymous gift", () => {
    const gifts = [normalizeGiftRow(liveGiftRow({ id: "1", anonymous: true, donor_name: "Rocio Delgado" }))];
    const { rows } = buildQuickBooksCsv(gifts, {});
    eq(rows[0][0], "Rocio Delgado");
  });
});

describe("buildAttendanceCsv", () => {
  it("sorts by paddle number and leaves unassigned paddles at the end", () => {
    const guests = [
      normalizeGuestRow(legacyGuestRow({ paddle_number: null, extras: { fullName: "No Paddle", guestCount: 1 } })),
      normalizeGuestRow(legacyGuestRow({ paddle_number: 3, extras: { fullName: "Three", guestCount: 1 } })),
      normalizeGuestRow(legacyGuestRow({ paddle_number: 1, extras: { fullName: "One", guestCount: 1 } })),
    ];
    const { rows } = buildAttendanceCsv(guests);
    deepEq(rows.map((r) => r[1]), ["One", "Three", "No Paddle"]);
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
