// Time Clock · logic tests.  node src/lib/dashboard/test/timeclock.test.mjs
//
// Covers the two pieces of the module that guard against real-world damage:
// the import's badge pre-check (one badge, one live employee) and the reading
// of the kiosk heartbeat, which has to survive whatever an old or future
// kiosk build writes into its free-form detail json.
//
// PRIVACY: every name, email and badge number below is invented for this file.

import {
  durationLabel,
  isPendingRfid,
  kioskHeartbeat,
  planImportBadges,
} from "../timeclock.js";

/* ------------------------------------------------------------------ *
 * tiny test harness (same shape as galaMath.test.mjs)
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
 * fixtures (invented)
 * ------------------------------------------------------------------ */

const ID_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ID_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ID_C = "cccccccc-0000-4000-8000-000000000003";
const ID_D = "dddddddd-0000-4000-8000-000000000004";

function person(id, firstName, rfidTag, extra = {}) {
  return { id, first_name: firstName, last_name: "Example", email: "", rfid_tag: rfidTag, is_active: true, ...extra };
}

let pendingCounter = 0;
const fakePending = () => `PENDING:test-${++pendingCounter}`;

/* ------------------------------------------------------------------ *
 * planImportBadges
 * ------------------------------------------------------------------ */

describe("planImportBadges", () => {
  it("keeps a badge nobody else holds", () => {
    const drafts = [person(ID_A, "Ana", "0010741208")];
    const live = [person(ID_B, "Bea", "0010999999")];
    const plan = planImportBadges(drafts, live, fakePending);
    eq(plan.conflicts.length, 0);
    eq(plan.drafts[0].rfid_tag, "0010741208");
    ok(plan.drafts[0] === drafts[0], "an untouched draft should be passed through as-is");
  });

  it("strips a badge that a live employee already holds, and says whose it is", () => {
    const drafts = [person(ID_A, "Ana", "0010741208")];
    const live = [person(ID_B, "Bea", "0010741208")];
    const plan = planImportBadges(drafts, live, fakePending);
    eq(plan.conflicts.length, 1);
    eq(plan.conflicts[0].badge, "0010741208");
    eq(plan.conflicts[0].source, "roster");
    eq(plan.conflicts[0].heldBy.id, ID_B);
    eq(plan.conflicts[0].draft.id, ID_A);
    ok(isPendingRfid(plan.drafts[0].rfid_tag), "the draft should be imported with a PENDING tag");
    eq(plan.drafts[0].id, ID_A, "the person is still imported under the same id");
    eq(plan.drafts[0].first_name, "Ana");
  });

  it("does not mutate the drafts it was given", () => {
    const drafts = [person(ID_A, "Ana", "0010741208")];
    planImportBadges(drafts, [person(ID_B, "Bea", "0010741208")], fakePending);
    eq(drafts[0].rfid_tag, "0010741208");
  });

  it("counts an inactive holder: the index covers inactive staff too", () => {
    const drafts = [person(ID_A, "Ana", "0010741208")];
    const live = [person(ID_B, "Bea", "0010741208", { is_active: false })];
    const plan = planImportBadges(drafts, live, fakePending);
    eq(plan.conflicts.length, 1);
    eq(plan.conflicts[0].heldBy.is_active, false);
  });

  it("lets two rows of the same file fight it out: the first keeps the badge", () => {
    const drafts = [
      person(ID_A, "Ana", "0010741208"),
      person(ID_B, "Bea", "0010741208"),
      person(ID_C, "Cam", "0010741208"),
    ];
    const plan = planImportBadges(drafts, [], fakePending);
    eq(plan.drafts[0].rfid_tag, "0010741208");
    ok(isPendingRfid(plan.drafts[1].rfid_tag));
    ok(isPendingRfid(plan.drafts[2].rfid_tag));
    deepEq(plan.conflicts.map((c) => [c.draft.id, c.source, c.heldBy.id]), [
      [ID_B, "file", ID_A],
      [ID_C, "file", ID_A],
    ]);
    ok(plan.drafts[1].rfid_tag !== plan.drafts[2].rfid_tag, "each loser gets its own placeholder");
  });

  it("prefers naming the roster holder when a badge is taken both ways", () => {
    const drafts = [person(ID_A, "Ana", "0010741208"), person(ID_B, "Bea", "0010741208")];
    const live = [person(ID_C, "Cam", "0010741208")];
    const plan = planImportBadges(drafts, live, fakePending);
    deepEq(plan.conflicts.map((c) => [c.draft.id, c.source, c.heldBy.id]), [
      [ID_A, "roster", ID_C],
      [ID_B, "roster", ID_C],
    ]);
  });

  it("ignores placeholders and blanks on both sides", () => {
    const drafts = [
      person(ID_A, "Ana", "PENDING:11111111-1111-4111-8111-111111111111"),
      person(ID_B, "Bea", ""),
    ];
    const live = [
      person(ID_C, "Cam", "PENDING:11111111-1111-4111-8111-111111111111"),
      person(ID_D, "Dee", ""),
    ];
    const plan = planImportBadges(drafts, live, fakePending);
    eq(plan.conflicts.length, 0);
    ok(plan.drafts[0] === drafts[0] && plan.drafts[1] === drafts[1]);
  });

  it("compares badges exactly, the way the unique index does", () => {
    const drafts = [
      person(ID_A, "Ana", "10741208"), // leading zeros stripped by a spreadsheet
      person(ID_B, "Bea", "abc-123"),
    ];
    const live = [person(ID_C, "Cam", "0010741208"), person(ID_D, "Dee", "ABC-123")];
    const plan = planImportBadges(drafts, live, fakePending);
    eq(plan.conflicts.length, 0, "different strings are different badges");
  });

  it("leaves a draft alone when its id is already on the roster (the insert skips it)", () => {
    // Stale roster prop: the row was added at the iPad after the page loaded.
    const drafts = [person(ID_A.toUpperCase(), "Ana", "0010741208")];
    const live = [person(ID_A, "Ana", "0010741208")];
    const plan = planImportBadges(drafts, live, fakePending);
    eq(plan.conflicts.length, 0);
    eq(plan.drafts[0].rfid_tag, "0010741208");
  });

  it("handles a roster that already contains a duplicate", () => {
    const drafts = [person(ID_A, "Ana", "0010741208")];
    const live = [person(ID_B, "Bea", "0010741208"), person(ID_C, "Cam", "0010741208")];
    const plan = planImportBadges(drafts, live, fakePending);
    eq(plan.conflicts.length, 1);
    eq(plan.conflicts[0].heldBy.id, ID_B);
  });

  it("survives empty and missing input", () => {
    deepEq(planImportBadges([], [], fakePending), { drafts: [], conflicts: [] });
    deepEq(planImportBadges(null, undefined, fakePending), { drafts: [], conflicts: [] });
  });

  it("uses a real PENDING:<uuid> placeholder by default", () => {
    const plan = planImportBadges(
      [person(ID_A, "Ana", "0010741208")],
      [person(ID_B, "Bea", "0010741208")],
    );
    ok(/^PENDING:[0-9a-f-]{36}$/.test(plan.drafts[0].rfid_tag), plan.drafts[0].rfid_tag);
  });
});

/* ------------------------------------------------------------------ *
 * durationLabel
 * ------------------------------------------------------------------ */

describe("durationLabel", () => {
  it("formats minutes, hours and days", () => {
    eq(durationLabel(0), "under a minute");
    eq(durationLabel(59 * 1000), "under a minute");
    eq(durationLabel(45 * 60000), "45m");
    eq(durationLabel((6 * 60 + 12) * 60000), "6h 12m");
    eq(durationLabel((47 * 60 + 59) * 60000), "47h 59m");
    eq(durationLabel((3 * 24 + 4) * 3600000), "3d 4h");
  });

  it("returns a blank for nonsense", () => {
    eq(durationLabel(-1), "");
    eq(durationLabel(NaN), "");
    eq(durationLabel(undefined), "");
  });
});

/* ------------------------------------------------------------------ *
 * kioskHeartbeat
 * ------------------------------------------------------------------ */

const NOW = Date.parse("2026-11-16T15:00:00Z");

describe("kioskHeartbeat", () => {
  it("falls back to the raw id for a row with no detail at all", () => {
    for (const detail of [{}, null, undefined, "oops", 7, []]) {
      const h = kioskHeartbeat({ id: "studio-ipad", last_seen_at: "2026-11-16T14:59:00Z", detail }, NOW);
      eq(h.title, "studio-ipad", `detail=${JSON.stringify(detail)}`);
      eq(h.label, "");
      eq(h.lastError, "");
      eq(h.held, 0);
      eq(h.consecutiveFailures, 0);
      eq(h.oldestPendingMs, null);
      eq(h.oldestPendingLabel, "");
      eq(h.model, "");
      eq(h.osVersion, "");
    }
  });

  it("reads an old build's detail: counts and last_error only", () => {
    const h = kioskHeartbeat(
      {
        id: "studio-ipad",
        last_seen_at: "2026-11-16T14:59:00Z",
        detail: { employees: 0, punches: 2, receipts: 0, deletions: 0, last_error: "The request timed out." },
      },
      NOW,
    );
    eq(h.title, "studio-ipad");
    eq(h.lastError, "The request timed out.");
    eq(h.failingStageLabel, "");
    eq(h.held, 0);
    eq(h.oldestPendingLabel, "");
  });

  it("reads the current build's detail in full", () => {
    const h = kioskHeartbeat(
      {
        id: "ipad-1a2b3c4d",
        last_seen_at: "2026-11-16T14:58:00Z",
        detail: {
          employees: 1,
          punches: 3,
          receipts: 0,
          deletions: 0,
          last_error: "2 row(s) held back by the server",
          run_outcome: "partial",
          failing_stage: "push.employees",
          last_error_at: "2026-11-16T14:58:00Z",
          consecutive_failures: 3,
          last_success_at: "2026-11-16T09:00:00Z",
          oldest_pending_at: "2026-11-16T11:48:00Z",
          oldest_pending_age_s: 11400,
          orphan_punches: 0,
          quarantined: 2,
          rfid_conflicts: 0,
          skipped_rows: 0,
          device_label: "Front desk",
          device_model: "iPad15,7",
          os_version: "26.1",
          credential_storage: "keychain",
        },
      },
      NOW,
    );
    eq(h.title, "Front desk");
    eq(h.label, "Front desk");
    eq(h.id, "ipad-1a2b3c4d");
    eq(h.model, "iPad15,7");
    eq(h.osVersion, "26.1");
    eq(h.lastError, "2 row(s) held back by the server");
    eq(h.failingStage, "push.employees");
    eq(h.failingStageLabel, "uploading employees");
    eq(h.consecutiveFailures, 3);
    eq(h.held, 2);
    eq(h.oldestPendingLabel, "3h 12m");
  });

  it("accepts `label` as well as `device_label`, and prefers device_label", () => {
    eq(kioskHeartbeat({ id: "x", detail: { label: "Back room" } }, NOW).title, "Back room");
    eq(kioskHeartbeat({ id: "x", detail: { label: "B", device_label: "A" } }, NOW).title, "A");
    eq(kioskHeartbeat({ id: "x", detail: { device_label: "   " } }, NOW).title, "x", "a blank label falls back to the id");
  });

  it("explicit nulls (what the kiosk sends when all is well) read as nothing to show", () => {
    const h = kioskHeartbeat(
      {
        id: "studio-ipad",
        last_seen_at: "2026-11-16T14:59:00Z",
        detail: { last_error: null, failing_stage: null, oldest_pending_at: null, oldest_pending_age_s: null, quarantined: 0, consecutive_failures: 0, device_label: "" },
      },
      NOW,
    );
    eq(h.lastError, "");
    eq(h.failingStageLabel, "");
    eq(h.oldestPendingMs, null);
    eq(h.held, 0);
    eq(h.title, "studio-ipad");
  });

  it("keeps ageing the oldest unsent row after the kiosk goes quiet", () => {
    // Reported 10 minutes old at a heartbeat that is itself two days old.
    const h = kioskHeartbeat(
      { id: "studio-ipad", last_seen_at: "2026-11-14T15:00:00Z", detail: { oldest_pending_age_s: 600 } },
      NOW,
    );
    eq(h.oldestPendingLabel, "2d 0h");
  });

  it("falls back to the age figure when the timestamp is unusable", () => {
    const h = kioskHeartbeat(
      { id: "x", last_seen_at: "2026-11-16T15:00:00Z", detail: { oldest_pending_at: 784911600, oldest_pending_age_s: 120 } },
      NOW,
    );
    eq(h.oldestPendingLabel, "2m");
    const garbage = kioskHeartbeat({ id: "x", detail: { oldest_pending_at: "soon" } }, NOW);
    eq(garbage.oldestPendingMs, null);
  });

  it("never reports a negative age for a clock that runs ahead", () => {
    const h = kioskHeartbeat({ id: "x", detail: { oldest_pending_at: "2026-11-16T15:05:00Z" } }, NOW);
    eq(h.oldestPendingMs, 0);
    eq(h.oldestPendingLabel, "under a minute");
  });

  it("coerces counts defensively", () => {
    eq(kioskHeartbeat({ id: "x", detail: { quarantined: "4" } }, NOW).held, 4);
    eq(kioskHeartbeat({ id: "x", detail: { quarantined: -2 } }, NOW).held, 0);
    eq(kioskHeartbeat({ id: "x", detail: { quarantined: "many" } }, NOW).held, 0);
    eq(kioskHeartbeat({ id: "x", detail: { quarantined: 2.9 } }, NOW).held, 2);
    eq(kioskHeartbeat({ id: "x", detail: { quarantined: {} } }, NOW).held, 0);
  });

  it("shows an unknown stage as-is and caps a runaway error message", () => {
    const h = kioskHeartbeat(
      { id: "x", detail: { failing_stage: "push.something-new", last_error: "e".repeat(5000) } },
      NOW,
    );
    eq(h.failingStageLabel, "push.something-new");
    ok(h.lastError.length <= 401, `error was ${h.lastError.length} chars`);
    ok(h.lastError.endsWith("…"));
  });

  it("ignores non-string text fields rather than printing [object Object]", () => {
    const h = kioskHeartbeat({ id: "x", detail: { last_error: { code: 409 }, device_label: 12, device_model: null } }, NOW);
    eq(h.lastError, "");
    eq(h.title, "x");
    eq(h.model, "");
  });

  it("survives a missing device", () => {
    eq(kioskHeartbeat(null, NOW).title, "Unnamed kiosk");
    eq(kioskHeartbeat(undefined, NOW).held, 0);
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
