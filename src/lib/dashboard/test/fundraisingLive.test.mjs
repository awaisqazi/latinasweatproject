// Live fundraising view · logic tests.  node src/lib/dashboard/test/fundraisingLive.test.mjs
//
// Pins the contract normalizer (full fixture, renamed fields, missing
// sections, junk input), the goal picker, the 13-month fill, and the
// subcommittee scorecards' parsing of free-text prospect fields.
//
// PRIVACY: every name and email below is invented for this file.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  campaignTakesGifts,
  campaignsForView,
  combinedTotals,
  normalizeGrants,
  countLabel,
  eventsScorecard,
  fillMonths,
  formatCentsWhole,
  goalProgress,
  grantsScorecard,
  historyStartDate,
  isMissingRpcError,
  liveSyncMessage,
  loadLive,
  mergeGoal,
  monthYearMark,
  normalizeLive,
  parseAskCents,
  parseDeadlineDates,
  parseGoals,
  percentChange,
  pickGoal,
  priorYearIsPartial,
  syncHealthWarning,
  syncedAgoLabel,
  upskillingScorecard,
} from "../fundraisingLive.js";

let passed = 0;
const queue = [];
function test(name, fn) {
  queue.push([name, fn]);
}

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/fundraisingLive.sample.json", import.meta.url), "utf8"),
);
const TODAY = "2026-11-18";

test("normalizeLive reads the real contract shape", () => {
  const live = normalizeLive(fixture);
  assert.equal(live.ok, true);
  assert.equal(live.today, "2026-11-18");
  assert.equal(live.legacyUsedBefore, "2025-07-18");
  assert.equal(live.syncedAt, "2026-11-19T00:30:02.075+00:00", "freshness reads sync.reconcile_last_run_at");
  assert.equal(live.sync.backfillDone, true);
  assert.equal(live.sync.lastPaymentSyncedAt, "2026-11-19T00:30:01.928+00:00");
  assert.deepEqual(live.totals.today, { amountCents: 0, giftCount: 0 });
  assert.equal(live.totals.yearToDate.amountCents, 10404427);
  assert.equal(live.totals.priorYearSamePeriod.amountCents, 3339047);
  assert.equal(live.totals.last12Months.giftCount, 1900);
  assert.equal(live.monthly[0].month, "2025-11");
  assert.equal(live.campaigns.length, 4);
  assert.equal(live.campaigns[0].goalCents, null);
  assert.equal(live.campaigns[1].goalCents, 1500000);
  assert.equal(live.campaigns[3].url, "", "non-https links are dropped");
  assert.equal(live.donors.lapsedCount, 818);
  assert.equal(live.donors.newDonorsYtd, 960);
  assert.equal(live.recent[0].id, "pay_1");
  assert.equal(live.recent[0].campaignId, "c-support");
  assert.equal(live.recent[0].category, "donation");
  assert.equal(live.lapsed[0].lastYearCents, 340000);
  assert.equal(live.topDonorsYtd[0].amountCents, 537500);
  assert.equal(live.topDonorsYtd[0].giftCount, 2);
  assert.equal(live.topDonorsYtd[0].lifetimeCents, 537500);
  assert.ok(live.hasCategories && live.hasRecent && live.hasLapsed && live.hasTopDonors);
});

test("forbidden answer is recognised, by normalizeLive and loadLive", async () => {
  const live = normalizeLive({ ok: false, reason: "forbidden" });
  assert.equal(live.ok, false);
  assert.equal(live.reason, "forbidden");
  const fake = { rpc: async () => ({ data: { ok: false, reason: "forbidden" }, error: null }) };
  const result = await loadLive(fake);
  assert.equal(result.forbidden, true);
  assert.equal(result.data, null);
  const missing = await loadLive({ rpc: async () => ({ data: null, error: { code: "PGRST202" } }) });
  assert.equal(missing.missing, true);
});

test("normalizeLive tolerates renamed fields and string numbers", () => {
  const live = normalizeLive({
    last_synced_at: "2026-11-18T20:00:00Z",
    totals: { ytd: { cents: "500", count: "2" }, mtd: 300, ttm: { net_cents: 900 } },
    months: [{ month_start: "2026-10-01T05:00:00+00:00", net_cents: 100, gifts: 1 }],
    recent_gifts: [{ paid_at: "2026-11-18T10:00:00Z", net_cents: 100, donor_name: "Test Five" }],
    donors: { unique_donors_ytd: 4 },
  });
  assert.equal(live.syncedAt, "2026-11-18T20:00:00Z");
  assert.deepEqual(live.totals.yearToDate, { amountCents: 500, giftCount: 2 });
  assert.deepEqual(live.totals.monthToDate, { amountCents: 300, giftCount: null });
  assert.equal(live.totals.last12Months.amountCents, 900);
  assert.equal(live.monthly[0].month, "2026-10");
  assert.equal(live.recent[0].name, "Test Five");
  assert.equal(live.donors.donorsYtd, 4);
});

test("normalizeLive fills safe defaults for missing sections and junk", () => {
  for (const raw of [null, undefined, "not json", 42, [], {}]) {
    const live = normalizeLive(raw);
    assert.equal(live.totals.today, null, "missing totals are null, not $0");
    assert.equal(live.donors.lapsedCount, null);
    assert.deepEqual(live.campaigns, []);
    assert.deepEqual(live.recent, []);
    assert.equal(live.hasRecent, false);
    assert.equal(live.syncedAt, "");
  }
  // A jsonb returned as a string, or wrapped in a one-row array, still reads.
  assert.equal(normalizeLive(JSON.stringify(fixture)).totals.yearToDate.amountCents, 10404427);
  assert.equal(normalizeLive([fixture]).totals.yearToDate.amountCents, 10404427);
  assert.equal(normalizeLive({ fundraising_live: fixture }).totals.yearToDate.amountCents, 10404427);
});

test("isMissingRpcError recognises an undeployed function", () => {
  assert.equal(isMissingRpcError({ code: "PGRST202", message: "x" }), true);
  assert.equal(isMissingRpcError({ code: "42883" }), true);
  assert.equal(isMissingRpcError({ message: "Could not find the function public.fundraising_live(p_tz)" }), true);
  assert.equal(isMissingRpcError({ code: "42501", message: "permission denied" }), false);
  assert.equal(isMissingRpcError(null), false);
});

test("fillMonths gives 13 months ending this Chicago month, zeros filled", () => {
  const months = fillMonths(normalizeLive(fixture).monthly, TODAY);
  assert.equal(months.length, 13);
  assert.equal(months[0].month, "2025-11");
  assert.equal(months[12].month, "2026-11");
  assert.equal(months[12].isCurrent, true);
  assert.equal(months[0].amountCents, 1661166);
  assert.equal(months[1].amountCents, 1900491);
  assert.equal(months[2].amountCents, 0, "missing months are zero");
  assert.equal(fillMonths([], "2026-01-05")[0].month, "2025-01", "crosses the year boundary");
});

test("goals: parse, pick current or upcoming, never invent", () => {
  const goals = parseGoals({ 2027: 100000000, note: "board proposal", 2025: "5000000", bad: 1 });
  assert.deepEqual(goals, [
    { year: 2025, cents: 5000000 },
    { year: 2027, cents: 100000000 },
  ]);
  assert.deepEqual(parseGoals('{"goals":{"2026":{"amount_cents":700}}}'), [{ year: 2026, cents: 700 }]);
  assert.deepEqual(parseGoals(null), []);
  assert.equal(pickGoal(goals, 2026).mode, "upcoming");
  assert.equal(pickGoal(goals, 2026).year, 2027);
  assert.equal(pickGoal(goals, 2025).mode, "current");
  assert.equal(pickGoal([{ year: 2024, cents: 1 }], 2026), null, "past-only goals show nothing");
  assert.equal(pickGoal([], 2026), null);
});

test("goalProgress uses YTD for the current year and last 12 months for upcoming", () => {
  const live = normalizeLive(fixture);
  const upcoming = goalProgress({ year: 2027, cents: 100000000, mode: "upcoming" }, live.totals);
  assert.equal(upcoming.baselineCents, 13368418);
  assert.equal(upcoming.percent, 13.3);
  assert.equal(upcoming.multiple, 7.5);
  const current = goalProgress({ year: 2026, cents: 20000000, mode: "current" }, live.totals);
  assert.equal(current.baselineCents, 10404427);
  assert.equal(current.remainingCents, 9595573);
  const blind = goalProgress({ year: 2026, cents: 1, mode: "current" }, normalizeLive({}).totals);
  assert.equal(blind.percent, null);
});

test("mergeGoal keeps other keys and can remove a year", () => {
  assert.deepEqual(mergeGoal({ 2027: 1, note: "x" }, 2028, 5), { 2027: 1, 2028: 5, note: "x" });
  assert.deepEqual(mergeGoal('{"2027":1}', 2027, null), {});
  assert.deepEqual(mergeGoal(null, 2027, 100000000), { 2027: 100000000 });
});

test("campaignsForView keeps campaigns with gifts this year, biggest YTD first", () => {
  const rows = campaignsForView(normalizeLive(fixture).campaigns);
  assert.deepEqual(rows.map((row) => row.id), ["c-gala", "c-auction", "c-support"], "active but idle forms are left out");
});

test("eventsScorecard uses the payment categories event, auction and raffle", () => {
  const card = eventsScorecard(normalizeLive(fixture));
  assert.equal(card.revenueCents, 6959677 + 377000, "event + auction from by_category_ytd");
  assert.equal(card.campaignCount, 2, "Event and Auction campaigns with gifts");
  assert.equal(card.top.title, "Sample Gala");
  const noCategories = { ...normalizeLive(fixture), hasCategories: false, byCategoryYtd: [] };
  assert.equal(eventsScorecard(noCategories).revenueCents, 4595000 + 377000, "falls back to campaigns");
});

test("history start, partial prior year and sync health", () => {
  const live = normalizeLive(fixture);
  assert.equal(historyStartDate(live), "2025-07-18");
  assert.equal(priorYearIsPartial(live, TODAY), true, "2025 starts July 18");
  assert.equal(priorYearIsPartial(live, "2027-03-01"), false, "2026 is fully covered");
  const fresh = Date.parse("2026-11-19T00:34:00Z");
  assert.equal(syncHealthWarning(live, fresh), "");
  assert.match(syncHealthWarning(live, Date.parse("2026-11-19T02:30:00Z")), /last ran 1 hr ago/);
  const loading = { ...live, sync: { ...live.sync, backfillDone: false } };
  assert.match(syncHealthWarning(loading, fresh), /still loading/);
});

test("liveSyncMessage speaks for this view", () => {
  assert.equal(liveSyncMessage({ ok: true, raw: { ok: true, mirror: { payments: 3, errors: [] } } }).tone, "success");
  assert.match(liveSyncMessage({ ok: true, raw: { ok: true, mirror: { payments: 3, errors: [] } } }).message, /3 recent payments/);
  assert.equal(liveSyncMessage({ ok: true, raw: { ok: true, mirror: { payments: 0, errors: ["x"] } } }).tone, "warning");
  assert.equal(liveSyncMessage({ ok: false, raw: { ok: false, reason: "no_api_key" } }).tone, "warning");
  assert.equal(liveSyncMessage({ ok: false, raw: { ok: false, reason: "unauthorized" } }).tone, "error");
  assert.match(liveSyncMessage({ ok: false, raw: null }).message, /Sync failed/);
  for (const result of [{ raw: { ok: true, note: "no_active_campaigns", mirror: { payments: 0, errors: [] } } }]) {
    assert.doesNotMatch(liveSyncMessage(result).message, /campaign|Giving/i);
  }
});

test("parseAskCents reads the first dollar amount in free text", () => {
  assert.equal(parseAskCents("$25,000"), 2500000);
  assert.equal(parseAskCents("$10K to $25K for programs"), 1000000);
  assert.equal(parseAskCents("Ask for 50k general operating"), 5000000);
  assert.equal(parseAskCents("$1.5M capital"), 150000000);
  assert.equal(parseAskCents("Apply in 2027"), null, "a bare year is not an ask");
  assert.equal(parseAskCents(""), null);
});

test("parseDeadlineDates finds full dates only", () => {
  assert.deepEqual(parseDeadlineDates("LOI due March 3, 2027; full app 2027-05-01"), ["2027-03-03", "2027-05-01"]);
  assert.deepEqual(parseDeadlineDates("Rolling. Board meets 1/15/2027"), ["2027-01-15"]);
  assert.deepEqual(parseDeadlineDates("Every March 1"), []);
  assert.deepEqual(parseDeadlineDates("Feb 30, 2027"), [], "impossible dates are dropped");
});

test("grantsScorecard totals the pipeline and finds the next deadline", () => {
  const card = grantsScorecard(
    [
      { id: "a", name: "Test Fund A", stage: "Research", suggested_ask: "$10,000", deadlines: "Jan 10, 2027" },
      { id: "b", name: "Test Fund B", stage: "Application", suggested_ask: "$25K", deadlines: "Dec 1, 2026" },
      { id: "c", name: "Test Fund C", stage: "Committed", suggested_ask: "$5,000" },
      { id: "d", name: "Test Fund D", stage: "Declined", suggested_ask: "$99,000", deadlines: "Nov 20, 2026" },
      { id: "e", name: "Test Fund E", stage: "Outreach", suggested_ask: "TBD", deadlines: "Oct 1, 2026" },
    ],
    TODAY,
  );
  assert.equal(card.pipelineCount, 3);
  assert.equal(card.pipelineAskCents, 3500000);
  assert.equal(card.pipelineWithAsk, 2);
  assert.equal(card.committedCount, 1);
  assert.deepEqual(card.nextDeadline, { date: "2026-12-01", prospectId: "b", prospectName: "Test Fund B" });
});

test("grantsScorecard reads the new phases, real asks first, legacy names mapped", () => {
  const card = grantsScorecard(
    [
      { id: "a", name: "Test Fund A", stage: "Prospecting", ask_amount: 20000, suggested_ask: "$10,000", deadlines: "Jan 10, 2027" },
      { id: "b", name: "Test Fund B", stage: "Drafted", ask_amount: null, suggested_ask: "$25K", deadlines: "Dec 1, 2026" },
      { id: "c", name: "Test Fund C", stage: "Committed", ask_amount: 5000, committed_amount: 4000, committed_on: "2026-06-01", deadlines: "Nov 25, 2026" },
      { id: "d", name: "Test Fund D", stage: "Received", committed_amount: "1500.50", committed_on: "2026-02-01", received_on: "2026-03-01" },
      { id: "e", name: "Test Fund E", stage: "Received", committed_amount: 9000, committed_on: "2025-12-01", received_on: "2026-01-05" },
      { id: "f", name: "Test Fund F", stage: "Committed", committed_amount: null, committed_on: "2026-05-01" },
      { id: "g", name: "Test Fund G", stage: "In Conversation", suggested_ask: "$3,000" },
      { id: "h", name: "Test Fund H", stage: "Declined", ask_amount: 50000 },
    ],
    TODAY,
  );
  assert.equal(card.pipelineCount, 3, "Prospecting, Drafted, and the legacy In Conversation as Viable");
  assert.equal(card.pipelineAskCents, 2000000 + 2500000 + 300000);
  assert.equal(card.pipelineEstimated, 2, "two asks come from the suggested_ask note");
  assert.equal(card.committedYtdCents, 550050, "Committed or Received with an amount, in committed_on's year");
  assert.equal(card.committedYtdCount, 2);
  assert.equal(card.receivedYtdCents, 150050, "the counted grants of this year already Received");
  assert.deepEqual(card.nextDeadline, { date: "2026-12-01", prospectId: "b", prospectName: "Test Fund B" }, "committed grants have no deadline to chase");
  assert.deepEqual(card.byPhase.map((row) => row.phase), ["Prospecting", "Viable", "Drafted", "Committed", "Received", "Declined"]);
  assert.equal(card.byPhaseFromLive, false);
});

test("grantsScorecard prefers the live grants block when it is there", () => {
  const liveGrants = normalizeGrants({
    committed_ytd_cents: 2500000,
    committed_ytd_count: 1,
    received_ytd_cents: "1000000",
    committed_last_12_months_cents: 3000000,
    by_year: { 2026: 2500000, 2027: 4000000, bad: 5 },
    by_phase: [
      { phase: "Prospecting", count: 4, ask_cents: 100, committed_cents: 0 },
      { phase: "Research", count: 1, ask_cents: 50, committed_cents: 0 },
      { phase: "Committed", count: 1, ask_cents: 2500000, committed_cents: 2500000 },
      "junk",
    ],
  });
  assert.deepEqual(liveGrants.byYear, { 2026: 2500000, 2027: 4000000 });
  assert.deepEqual(liveGrants.byPhase[0], { phase: "Prospecting", count: 5, askCents: 150, committedCents: 0 }, "legacy names merge");
  const card = grantsScorecard([], TODAY, liveGrants);
  assert.equal(card.committedYtdCents, 2500000);
  assert.equal(card.receivedYtdCents, 1000000);
  assert.equal(card.byPhaseFromLive, true);
  assert.equal(normalizeGrants(undefined), null);
  assert.equal(normalizeGrants("nope"), null);
  assert.equal(normalizeLive(fixture).grants === null || typeof normalizeLive(fixture).grants === "object", true);
  assert.equal(normalizeLive({}).grants, null, "no grants block, no grants");
});

test("combinedTotals and goalProgress add committed grants, or stay Zeffy only", () => {
  const totals = { yearToDate: { amountCents: 10000000, giftCount: 5 }, last12Months: { amountCents: 12000000, giftCount: 9 } };
  const grants = normalizeGrants({ committed_ytd_cents: 2500000, committed_last_12_months_cents: 3000000, by_year: { 2026: 2500000, 2027: 4000000 } });
  const combined = combinedTotals(totals, grants);
  assert.deepEqual(combined.yearToDate, { amountCents: 12500000, zeffyCents: 10000000, grantsCents: 2500000 });
  assert.deepEqual(combined.last12Months, { amountCents: 15000000, zeffyCents: 12000000, grantsCents: 3000000 });
  assert.deepEqual(combinedTotals(totals, null).yearToDate, { amountCents: 10000000, zeffyCents: 10000000, grantsCents: null });
  assert.equal(combinedTotals({}, grants).yearToDate, null);

  const current = goalProgress({ year: 2026, cents: 100000000, mode: "current" }, totals, grants);
  assert.equal(current.baselineCents, 12500000);
  assert.equal(current.grantsCents, 2500000);
  assert.equal(current.includesGrants, true);
  const upcoming = goalProgress({ year: 2027, cents: 100000000, mode: "upcoming" }, totals, grants);
  assert.equal(upcoming.baselineCents, 15000000, "pace is the last 12 months, grants included");
  assert.equal(upcoming.goalYearGrantsCents, 4000000, "grants already committed for the goal year");
  const zeffyOnly = goalProgress({ year: 2026, cents: 100000000, mode: "current" }, totals);
  assert.equal(zeffyOnly.baselineCents, 10000000);
  assert.equal(zeffyOnly.includesGrants, false);
});

test("upskillingScorecard counts Giving Tuesday fundraisers", () => {
  const card = upskillingScorecard(
    [
      { id: "1", status: "approved" },
      { id: "2", status: "approved" },
      { id: "3", status: "pending" },
      { id: "4", status: "hidden" },
    ],
    [
      { fundraiser_id: "1", status: "approved", gift_count: 2, raised_cents: 5000 },
      { fundraiser_id: "2", status: "approved", gift_count: 0, raised_cents: 0 },
      { fundraiser_id: "4", status: "hidden", gift_count: 1, raised_cents: 900 },
    ],
  );
  assert.deepEqual(card, { signedUp: 3, approved: 2, withGift: 1, raisedCents: 5000 });
});

test("payments vs gifts wording and year marks", () => {
  assert.equal(countLabel(1), "1 payment");
  assert.equal(countLabel(1684), "1,684 payments");
  assert.equal(countLabel(1, "gift"), "1 gift");
  assert.equal(countLabel(0, "gift"), "0 gifts");
  assert.equal(campaignTakesGifts({ category: "DonationForm" }), true);
  assert.equal(campaignTakesGifts({ category: "PeerToPeerCampaign" }), true);
  for (const category of ["Event", "Shop", "Auction", "Raffle", ""]) {
    assert.equal(campaignTakesGifts({ category }), false, category);
  }
  const marks = fillMonths([], TODAY).map((row, index) => monthYearMark(row.month, index === 0));
  assert.equal(marks[0], "'25", "first bar");
  assert.equal(marks[2], "'26", "January");
  assert.equal(marks.filter(Boolean).length, 2);
});

test("money and freshness labels", () => {
  assert.equal(formatCentsWhole(812500049), "$8,125,000");
  assert.equal(percentChange(125, 100), 25);
  assert.equal(percentChange(5, 0), null);
  const now = Date.parse("2026-11-18T21:00:00Z");
  assert.equal(syncedAgoLabel("2026-11-18T20:55:00Z", now), "5 min ago");
  assert.equal(syncedAgoLabel("2026-11-18T20:59:40Z", now), "just now");
  assert.equal(syncedAgoLabel("2026-11-18T18:00:00Z", now), "3 hr ago");
  assert.equal(syncedAgoLabel("", now), "");
});

for (const [name, fn] of queue) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}
console.log(`\n${passed} tests passed`);
