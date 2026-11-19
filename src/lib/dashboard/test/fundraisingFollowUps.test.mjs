// Thank-you tracker and subcommittee follow-ups · logic tests.
//   node src/lib/dashboard/test/fundraisingFollowUps.test.mjs
//
// Pins the thanks-queue normalizer and the optimistic counts, the monthly
// update month keys and validation, and the Next up grouping of overdue
// grant next steps.
//
// PRIVACY: every name and email below is invented for this file.

import assert from "node:assert/strict";
import {
  BULK_OLDER_THAN_DAYS,
  adjustedThanksCounts,
  filterThanks,
  loadThanksQueue,
  markThanked,
  normalizeThanksQueue,
  olderThan,
  unmarkThanked,
  visibleThanks,
  waitedLabel,
} from "../fundraisingThanks.js";
import {
  attentionLines,
  currentMonthStart,
  dueLabel,
  loadAttention,
  monthName,
  monthStartOf,
  normalizeAttention,
  previousMonthStart,
  saveUpdate,
  targetSubTabId,
  updatedLabel,
  validateUpdateBody,
} from "../fundraisingUpdates.js";

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const RAW_QUEUE = {
  ok: true,
  window_days: 60,
  waiting_count: 4,
  overdue_count: 2,
  thanked_last_30_days: 1,
  items: [
    { payment_id: "p1", created_at: "2026-11-18T21:04:11+00:00", amount_cents: 5000, name: "Ana Prueba", email: "Ana@Example.com", campaign_title: "Giving Tuesday", category: "peer_to_peer", days_waiting: 0, overdue: false, donor_gift_count: 3, donor_lifetime_cents: "25000", owner_id: "u1" },
    { payment_id: "p2", created_at: "2026-11-10T15:00:00+00:00", amount_cents: "2500", name: null, email: null, campaign_title: "Donate", category: "donation", days_waiting: 8, overdue: true, donor_gift_count: null, donor_lifetime_cents: null, owner_id: null },
    { payment_id: "p3", created_at: "2026-10-01T15:00:00+00:00", amount_cents: 10000, name: "Beto Ejemplo", email: "beto@example.com", campaign_title: "Donate", days_waiting: 48 },
    { payment_id: "", amount_cents: 1 },
    "junk",
  ],
};

await test("normalizeThanksQueue maps fields and drops junk rows", () => {
  const queue = normalizeThanksQueue(RAW_QUEUE);
  assert.equal(queue.ok, true);
  assert.equal(queue.items.length, 3);
  assert.equal(queue.waitingCount, 4);
  assert.equal(queue.overdueCount, 2);
  assert.equal(queue.thankedLast30Days, 1);
  const [first, second, third] = queue.items;
  assert.equal(first.email, "ana@example.com");
  assert.equal(first.donorLifetimeCents, 25000);
  assert.equal(first.ownerId, "u1");
  assert.equal(second.amountCents, 2500);
  assert.equal(second.name, "");
  assert.equal(second.ownerId, "");
  // overdue missing: falls back to days_waiting > 7
  assert.equal(third.overdue, true);
});

await test("normalizeThanksQueue reports forbidden and junk", () => {
  assert.equal(normalizeThanksQueue({ ok: false, reason: "forbidden" }).ok, false);
  assert.equal(normalizeThanksQueue(null).ok, false);
  assert.deepEqual(normalizeThanksQueue({ ok: true }).items, []);
});

await test("visibleThanks hides marked ids and restores un-marked ones", () => {
  const queue = normalizeThanksQueue(RAW_QUEUE);
  const hidden = new Set(["p1"]);
  assert.deepEqual(visibleThanks(queue.items, hidden).map((i) => i.paymentId), ["p2", "p3"]);
  const restored = [{ ...queue.items[0], paymentId: "p0", createdAt: "2026-11-19T00:00:00Z" }];
  assert.deepEqual(visibleThanks(queue.items, new Set(), restored).map((i) => i.paymentId), ["p0", "p1", "p2", "p3"]);
  // a restored item already in the list is not doubled
  assert.equal(visibleThanks(queue.items, new Set(), [queue.items[1]]).length, 3);
});

await test("adjustedThanksCounts moves the header numbers at once", () => {
  const queue = normalizeThanksQueue(RAW_QUEUE);
  assert.deepEqual(adjustedThanksCounts(queue, new Set()), { waiting: 4, overdue: 2, thanked: 1 });
  assert.deepEqual(adjustedThanksCounts(queue, new Set(["p2", "nope"])), { waiting: 3, overdue: 1, thanked: 2 });
  const back = [{ paymentId: "p9", overdue: true }];
  assert.deepEqual(adjustedThanksCounts(queue, new Set(), back), { waiting: 5, overdue: 3, thanked: 0 });
});

await test("filterThanks: all, overdue, mine", () => {
  const { items } = normalizeThanksQueue(RAW_QUEUE);
  assert.equal(filterThanks(items, "all").length, 3);
  assert.deepEqual(filterThanks(items, "overdue").map((i) => i.paymentId), ["p2", "p3"]);
  assert.deepEqual(filterThanks(items, "mine", "u1").map((i) => i.paymentId), ["p1"]);
  assert.deepEqual(filterThanks(items, "mine", ""), []);
});

await test("olderThan picks gifts past the bulk cut-off", () => {
  const { items } = normalizeThanksQueue(RAW_QUEUE);
  assert.equal(BULK_OLDER_THAN_DAYS, 7);
  assert.deepEqual(olderThan(items).map((i) => i.paymentId), ["p2", "p3"]);
});

await test("waitedLabel", () => {
  assert.equal(waitedLabel(0), "Today");
  assert.equal(waitedLabel(1), "1 day");
  assert.equal(waitedLabel(1200), "1,200 days");
});

function fakeSupabase(handlers) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      return handlers.rpc ? handlers.rpc(name, args) : { data: null, error: null };
    },
    from(table) {
      const call = { table, ops: [] };
      calls.push(call);
      const builder = {
        delete() { call.ops.push(["delete"]); return builder; },
        update(v) { call.ops.push(["update", v]); return builder; },
        upsert(v, o) { call.ops.push(["upsert", v, o]); return builder; },
        select(c) { call.ops.push(["select", c]); return builder; },
        single() { call.ops.push(["single"]); return builder; },
        in(c, v) { call.ops.push(["in", c, v]); return builder; },
        eq(c, v) { call.ops.push(["eq", c, v]); return builder; },
        order() { return builder; },
        then(resolve) { resolve(handlers.from ? handlers.from(call) : { data: null, error: null }); },
      };
      return builder;
    },
  };
}

await test("loadThanksQueue: ok, missing, forbidden", async () => {
  const ok = await loadThanksQueue(fakeSupabase({ rpc: () => ({ data: RAW_QUEUE, error: null }) }));
  assert.equal(ok.data.items.length, 3);
  const missing = await loadThanksQueue(fakeSupabase({ rpc: () => ({ data: null, error: { code: "PGRST202", message: "x" } }) }));
  assert.equal(missing.missing, true);
  const forbidden = await loadThanksQueue(fakeSupabase({ rpc: () => ({ data: { ok: false, reason: "forbidden" }, error: null }) }));
  assert.equal(forbidden.forbidden, true);
});

await test("markThanked dedupes ids and drops an unknown method", async () => {
  const sb = fakeSupabase({ rpc: () => ({ data: 2, error: null }) });
  const result = await markThanked(sb, ["a", "a", "b", ""], "fax", null);
  assert.equal(result.count, 2);
  assert.deepEqual(sb.calls[0].args, { p_payment_ids: ["a", "b"], p_method: null, p_note: null });
  const none = await markThanked(sb, [], "email");
  assert.equal(none.count, 0);
});

await test("unmarkThanked deletes by payment_id", async () => {
  const sb = fakeSupabase({});
  await unmarkThanked(sb, ["a"]);
  assert.deepEqual(sb.calls[0].ops, [["delete"], ["in", "payment_id", ["a"]]]);
});

await test("month keys on the Chicago clock", () => {
  assert.equal(monthStartOf("2026-11-18"), "2026-11-01");
  assert.equal(previousMonthStart("2026-11-01"), "2026-10-01");
  assert.equal(previousMonthStart("2026-01-01"), "2025-12-01");
  // 03:00 UTC on Dec 1 is still Nov 30 in Chicago
  assert.equal(currentMonthStart(new Date("2026-12-01T03:00:00Z")), "2026-11-01");
  assert.equal(monthName("2026-11-01", 2026), "November");
  assert.equal(monthName("2025-12-01", 2026), "December 2025");
});

await test("validateUpdateBody trims and enforces 1 to 2,000", () => {
  assert.equal(validateUpdateBody("  ").ok, false);
  assert.deepEqual(validateUpdateBody("  Good month. ").body, "Good month.");
  assert.equal(validateUpdateBody("x".repeat(2000)).ok, true);
  assert.equal(validateUpdateBody("x".repeat(2001)).ok, false);
});

await test("saveUpdate upserts on subcommittee and month", async () => {
  const sb = fakeSupabase({
    from: () => ({ data: { id: "1", subcommittee: "grants", month: "2026-11-01", body: "Hi", author_id: "u1", updated_at: "2026-11-18T20:00:00Z" }, error: null }),
  });
  const { row, error } = await saveUpdate(sb, { subcommittee: "grants", month: "2026-11-01", body: " Hi " });
  assert.equal(error, null);
  assert.equal(row.authorId, "u1");
  const upsert = sb.calls[0].ops.find((op) => op[0] === "upsert");
  assert.deepEqual(upsert[1], { subcommittee: "grants", month: "2026-11-01", body: "Hi" });
  assert.deepEqual(upsert[2], { onConflict: "subcommittee,month" });
  const empty = await saveUpdate(sb, { subcommittee: "grants", month: "2026-11-01", body: " " });
  assert.ok(empty.error);
});

await test("updatedLabel reads the Chicago day", () => {
  const now = new Date("2026-11-18T20:00:00Z");
  assert.match(updatedLabel("2026-11-18T18:04:00Z", now), /^today at 12:04\sPM$/);
  assert.match(updatedLabel("2026-11-17T18:04:00Z", now), /^yesterday at /);
  assert.match(updatedLabel("2026-11-02T18:04:00Z", now), /^Nov 2 at /);
  assert.match(updatedLabel("2025-11-02T18:04:00Z", now), /^Nov 2, 2025 at /);
  assert.equal(updatedLabel("", now), "");
});

const RAW_ATTENTION = {
  ok: true,
  today: "2026-11-18",
  items: [
    { kind: "grant_deadline", subcommittee: "grants", count: null, title: "Fund A", detail: "Call", due_on: "2026-07-29", target: { tab: "grants", subtab: "pipeline", id: "a" } },
    { kind: "grant_deadline", subcommittee: "grants", title: "Fund B", detail: "Email", due_on: "2026-08-02", target: { tab: "grants", subtab: "pipeline", id: "b" } },
    { kind: "thanks_overdue", subcommittee: "donors", count: 190, title: "190 gifts waiting", target: { tab: "donors", subtab: "thanks" } },
    { kind: "grant_deadline", subcommittee: "grants", title: "Fund C", due_on: "2026-11-01", target: { tab: "grants", subtab: "pipeline", id: "c" } },
    { kind: "grant_deadline", subcommittee: "grants", title: "Fund D", due_on: "2026-12-01", target: { tab: "grants", subtab: "pipeline", id: "d" } },
    { kind: "worksheet_not_sized", subcommittee: "grants", title: "Worksheet", target: { tab: "grants", subtab: "worksheet" } },
    { kind: "sync_stale", subcommittee: null, title: "Sync", target: { tab: "overview" } },
    null,
  ],
};

await test("normalizeAttention and target sub-tab ids", () => {
  const attention = normalizeAttention(RAW_ATTENTION);
  assert.equal(attention.items.length, 7);
  assert.equal(attention.items[6].subcommittee, null);
  assert.equal(targetSubTabId({ tab: "donors", subtab: "thanks" }), "donors-thanks");
  assert.equal(targetSubTabId({ tab: "donors", subtab: "donors-thanks" }), "donors-thanks");
  assert.equal(targetSubTabId({ tab: "grants" }), "");
  assert.equal(normalizeAttention({ ok: false }).ok, false);
});

await test("attentionLines groups three or more overdue grant steps", () => {
  const { items } = normalizeAttention(RAW_ATTENTION);
  const lines = attentionLines(items, "grants", "2026-11-18");
  assert.deepEqual(lines.map((l) => l.kind), ["grant_deadline_group", "grant_deadline", "worksheet_not_sized"]);
  assert.equal(lines[0].children.length, 3);
  assert.equal(lines[0].dueOn, "2026-07-29");
  assert.equal(lines[0].title, "3 grant next steps are overdue");
  assert.equal(lines[1].title, "Fund D");
  assert.equal(lines[1].overdue, false);
  // two overdue stay as their own lines
  const fewer = attentionLines(items.filter((i) => i.title !== "Fund C"), "grants", "2026-11-18");
  assert.equal(fewer.filter((l) => l.kind === "grant_deadline").length, 3);
  assert.deepEqual(attentionLines(items, "donors", "2026-11-18").map((l) => l.kind), ["thanks_overdue"]);
  assert.deepEqual(attentionLines(items, "upskilling", "2026-11-18"), []);
});

await test("dueLabel", () => {
  assert.equal(dueLabel("2026-07-29", "2026-11-18"), "Was due Jul 29");
  assert.equal(dueLabel("2026-11-18", "2026-11-18"), "Due today");
  assert.equal(dueLabel("2027-01-05", "2026-11-18"), "Due Jan 5, 2027");
  assert.equal(dueLabel("", "2026-11-18"), "");
});

await test("loadAttention degrades on a missing RPC", async () => {
  const missing = await loadAttention(fakeSupabase({ rpc: () => ({ data: null, error: { code: "42883", message: "x" } }) }));
  assert.equal(missing.missing, true);
  const ok = await loadAttention(fakeSupabase({ rpc: () => ({ data: RAW_ATTENTION, error: null }) }));
  assert.equal(ok.data.items.length, 7);
});

console.log(`fundraisingFollowUps: ${passed} tests passed`);
