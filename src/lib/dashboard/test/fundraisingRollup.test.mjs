// Goal roll-up · logic tests.  node src/lib/dashboard/test/fundraisingRollup.test.mjs
//
// Pins the roll-up normalizer (contract shape, missing rows, junk input,
// forbidden) and the plain-words summary the Overview panel shows.

import assert from "node:assert/strict";
import {
  loadGoalRollup,
  subscribeWorksheetRows,
  normalizeGoalRollup,
  rollupSummary,
} from "../fundraisingRollup.js";

let passed = 0;
const queue = [];
function test(name, fn) {
  queue.push([name, fn]);
}

const FULL = {
  ok: true,
  cycle: "2027",
  goal_cents: 100000000,
  subcommittees: [
    { id: "events", low_cents: 15000000, realistic_cents: 25000000, stretch_cents: 40000000, filled: true, updated_at: "2026-11-18T20:00:00Z" },
    { id: "grants", low_cents: "20000000", realistic_cents: "30000000", stretch_cents: "50000000", filled: true, updated_at: "2026-11-17T20:00:00Z" },
    { id: "donors", low_cents: 10000000, realistic_cents: 20000000, stretch_cents: 30000000, filled: true, updated_at: null },
    { id: "upskilling", low_cents: null, realistic_cents: null, stretch_cents: null, filled: true, updated_at: "2026-11-16T20:00:00Z" },
  ],
  totals: { low_cents: 45000000, realistic_cents: 75000000, stretch_cents: 120000000 },
  people: {
    people_trained: { low: 10, realistic: 20, stretch: 30 },
    made_ask: { low: 5, realistic: 10, stretch: 15 },
    introductions: { low: null, realistic: null, stretch: null },
    employer_matches: { low: 1, realistic: "2", stretch: 4 },
  },
};

test("normalizeGoalRollup reads the contract shape", () => {
  const rollup = normalizeGoalRollup(FULL);
  assert.equal(rollup.ok, true);
  assert.equal(rollup.cycle, "2027");
  assert.equal(rollup.goalCents, 100000000);
  assert.deepEqual(rollup.rows.map((row) => row.id), ["donors", "grants", "events"], "dollar rows only, data-file order");
  assert.equal(rollup.sizedCount, 3);
  const grants = rollup.rows.find((row) => row.id === "grants");
  assert.equal(grants.realisticCents, 30000000, "bigint strings become numbers");
  assert.equal(grants.updatedAt, "2026-11-17T20:00:00Z");
  assert.deepEqual(rollup.totals, { lowCents: 45000000, realisticCents: 75000000, stretchCents: 120000000 });
  assert.equal(rollup.people.id, "upskilling");
  assert.equal(rollup.grantsCommittedCents, null, "absent until the RPC sends it");
  assert.equal(normalizeGoalRollup({ ...FULL, grants_committed_cents: "2500000" }).grantsCommittedCents, 2500000);
  assert.equal(rollup.people.sized, true);
  const trained = rollup.people.metrics.find((metric) => metric.key === "people_trained");
  assert.equal(trained.realistic, 20);
  const intros = rollup.people.metrics.find((metric) => metric.key === "introductions");
  assert.equal(intros.sized, false);
  assert.equal(rollup.people.metrics.find((metric) => metric.key === "employer_matches").realistic, 2);
});

test("reads the contract's own sample (docs 02, section 4)", () => {
  const rollup = normalizeGoalRollup({
    ok: true, cycle: "ztest", goal_cents: null,
    subcommittees: [
      { id: "events", low_cents: 1250000, realistic_cents: 1250050, stretch_cents: null, filled: true, updated_at: "2026-11-19T01:42:59.305177+00:00" },
      { id: "grants", low_cents: null, realistic_cents: null, stretch_cents: null, filled: false, updated_at: "2026-11-19T01:42:59.305177+00:00" },
      { id: "donors", low_cents: null, realistic_cents: 750000, stretch_cents: null, filled: true, updated_at: "2026-11-19T01:42:59.305177+00:00" },
      { id: "upskilling", low_cents: null, realistic_cents: null, stretch_cents: null, filled: true, updated_at: "2026-11-19T01:42:59.305177+00:00" },
    ],
    totals: { low_cents: 1250000, realistic_cents: 2000050, stretch_cents: 0 },
    people: {
      people_trained: { low: 5, realistic: 10, stretch: 15 },
      made_ask: { low: 1, realistic: null, stretch: null },
      introductions: { low: null, realistic: null, stretch: null },
      employer_matches: { low: null, realistic: null, stretch: null },
    },
  });
  assert.deepEqual(rollup.rows.map((row) => [row.id, row.sized]), [["donors", true], ["grants", false], ["events", true]]);
  assert.deepEqual(rollup.totals, { lowCents: 1250000, realisticCents: 2000050, stretchCents: 0 }, "matches the RPC's totals");
  assert.equal(rollup.people.sized, true);
  const summary = rollupSummary(rollup, 100000000);
  assert.equal(summary.sentence, "Realistic plans add up to $20,001, $979,999 short of the $1,000,000 goal.");
  assert.equal(summary.incompleteNote, "This leaves out Grant Research and Identification, which has not sized its plan yet.");
  // An empty cycle: goal set, nothing filled in.
  const empty = rollupSummary(normalizeGoalRollup({
    ok: true, cycle: "2027", goal_cents: 100000000,
    subcommittees: ["events", "grants", "donors", "upskilling"].map((id) => ({ id, low_cents: null, realistic_cents: null, stretch_cents: null, filled: false, updated_at: null })),
    totals: { low_cents: 0, realistic_cents: 0, stretch_cents: 0 },
  }));
  assert.equal(empty.status, "none");
});

test("unwraps string, array and named-wrapper payloads", () => {
  assert.equal(normalizeGoalRollup(JSON.stringify(FULL)).goalCents, 100000000);
  assert.equal(normalizeGoalRollup([FULL]).sizedCount, 3);
  assert.equal(normalizeGoalRollup({ fundraising_goal_rollup: FULL }).totals.realisticCents, 75000000);
  assert.equal(normalizeGoalRollup({ ...FULL, totals: { realistic_cents: 1 } }).totals.realisticCents, 75000000, "RPC totals are not trusted over the rows");
});

test("missing rows and missing totals are summed from what is sized", () => {
  const rollup = normalizeGoalRollup({
    ok: true,
    cycle: "2027",
    goal_cents: 100000000,
    subcommittees: [
      { id: "grants", low_cents: 1000, realistic_cents: 2000, stretch_cents: 3000, filled: true },
      { id: "events", low_cents: null, realistic_cents: null, stretch_cents: null, filled: false },
      { id: "donors", low_cents: 500, realistic_cents: 700, stretch_cents: null, filled: false },
    ],
  });
  assert.equal(rollup.sizedCount, 1, "filled:false never counts, even with amounts");
  // RPC totals would include the unfilled donors amounts; ours add up to the rows shown.
  assert.deepEqual(rollup.totals, { lowCents: 1000, realisticCents: 2000, stretchCents: 3000 });
  assert.equal(rollup.people.sized, false);
});

test("junk input gives an empty, honest shape", () => {
  for (const junk of [null, undefined, "not json", 42, [], { subcommittees: "nope", totals: 5 }]) {
    const rollup = normalizeGoalRollup(junk);
    assert.equal(rollup.rows.length, 3);
    assert.equal(rollup.sizedCount, 0);
    assert.deepEqual(rollup.totals, { lowCents: 0, realisticCents: 0, stretchCents: 0 });
    assert.equal(rollup.goalCents, null);
  }
  const negative = normalizeGoalRollup({ goal_cents: -5, subcommittees: [{ id: "grants", realistic_cents: -100 }] });
  assert.equal(negative.goalCents, null);
  assert.equal(negative.sizedCount, 0, "negative amounts are dropped");
});

test("rollupSummary says the gap in plain words", () => {
  const short = rollupSummary(normalizeGoalRollup(FULL));
  assert.equal(short.status, "short");
  assert.equal(short.gapCents, 25000000);
  assert.equal(short.sentence, "Realistic plans add up to $750,000, $250,000 short of the $1,000,000 goal.");
  assert.equal(short.incompleteNote, "");

  const met = rollupSummary(
    normalizeGoalRollup({
      ...FULL,
      subcommittees: FULL.subcommittees.map((row) =>
        row.id === "events" ? { ...row, realistic_cents: 50000000 } : row,
      ),
    }),
  );
  assert.equal(met.status, "met");
  assert.match(met.sentence, /meets the \$1,000,000 goal/);

  const over = rollupSummary(normalizeGoalRollup({ ...FULL, goal_cents: 50000000 }));
  assert.equal(over.status, "over");
  assert.equal(over.sentence, "Realistic plans add up to $750,000, $250,000 more than the $500,000 goal.");
});

test("rollupSummary is honest when nothing or only some is filled in", () => {
  const empty = rollupSummary(normalizeGoalRollup({ ok: true, cycle: "2027", goal_cents: 100000000, subcommittees: [] }));
  assert.equal(empty.status, "none");
  assert.match(empty.sentence, /No subcommittee has sized its plan yet/);
  assert.equal(empty.incompleteNote, "");

  const partial = rollupSummary(
    normalizeGoalRollup({
      ok: true,
      cycle: "2027",
      goal_cents: 100000000,
      subcommittees: [{ id: "grants", low_cents: 1, realistic_cents: 30000000, stretch_cents: 3, filled: true }],
    }),
  );
  assert.equal(partial.status, "short");
  assert.equal(
    partial.incompleteNote,
    "This leaves out Existing Donor Engagement and Fundraising Events, which have not sized their plans yet.",
  );

  const oneLeft = rollupSummary(
    normalizeGoalRollup({
      ...FULL,
      subcommittees: FULL.subcommittees.filter((row) => row.id !== "events"),
      totals: undefined,
    }),
  );
  assert.equal(oneLeft.realisticCents, 50000000, "totals summed from the sized rows");
  assert.equal(oneLeft.incompleteNote, "This leaves out Fundraising Events, which has not sized its plan yet.");
});

test("rollupSummary falls back to the stored goal, or says none is set", () => {
  const noGoal = normalizeGoalRollup({ ...FULL, goal_cents: null });
  assert.equal(rollupSummary(noGoal, 100000000).status, "short");
  const none = rollupSummary(noGoal, null);
  assert.equal(none.status, "nogoal");
  assert.equal(none.sentence, "Realistic plans add up to $750,000. No goal is set for 2027 yet.");
  assert.equal(rollupSummary(null), null);
});

test("loadGoalRollup maps missing, forbidden and ok", async () => {
  const missing = await loadGoalRollup({
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }),
  });
  assert.equal(missing.missing, true);
  const forbidden = await loadGoalRollup({ rpc: async () => ({ data: { ok: false, reason: "forbidden" }, error: null }) });
  assert.equal(forbidden.forbidden, true);
  assert.equal(forbidden.data, null);
  let args = null;
  const ok = await loadGoalRollup(
    {
      rpc: async (name, params) => {
        args = [name, params];
        return { data: FULL, error: null };
      },
    },
    2027,
  );
  assert.deepEqual(args, ["fundraising_goal_rollup", { p_cycle: "2027" }]);
  assert.equal(ok.data.sizedCount, 3);
  assert.equal((await loadGoalRollup(null)).missing, true);
});

test("subscribeWorksheetRows listens to one cycle and cleans up", () => {
  const calls = [];
  let removed = null;
  const channel = {
    on(type, filter, handler) {
      calls.push([type, filter]);
      this.handler = handler;
      return this;
    },
    subscribe() {
      return this;
    },
  };
  const fake = { channel: () => channel, removeChannel: (c) => (removed = c) };
  let changes = 0;
  const stop = subscribeWorksheetRows(fake, "2027", () => (changes += 1));
  assert.equal(calls[0][1].table, "fundraising_worksheet_rows");
  assert.equal(calls[0][1].filter, "cycle=eq.2027");
  channel.handler();
  assert.equal(changes, 1);
  stop();
  assert.equal(removed, channel);
  assert.equal(typeof subscribeWorksheetRows(null, "2027", () => {}), "function");
});

for (const [name, fn] of queue) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}
console.log(`\n${passed} tests passed`);
