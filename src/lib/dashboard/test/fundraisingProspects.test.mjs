// Grant phases and prospect fields · logic tests.  node src/lib/dashboard/test/fundraisingProspects.test.mjs
//
// Pins the phase vocabulary, the legacy-name mapping, which moves ask for
// an amount or a date, money typing, when a grant counts, and the
// missing-column fallback for the new grant fields.

import assert from "node:assert/strict";
import {
  GRANT_PHASES,
  PROSPECT_COLUMNS,
  PROSPECT_FULL_COLUMNS,
  PROSPECT_STAGES,
  grantCountedYear,
  isMissingColumnError,
  moneyInputValue,
  normalizeProspectStage,
  parseMoneyInput,
  prospectGrantColumnsMissing,
  stageMoveNeeds,
  withProspectColumns,
} from "../fundraising.js";

let passed = 0;
const queue = [];
function test(name, fn) {
  queue.push([name, fn]);
}

test("phases in order, Declined set apart", () => {
  assert.deepEqual(PROSPECT_STAGES, ["Prospecting", "Viable", "Drafted", "Submitted", "Committed", "Received", "Declined"]);
  assert.deepEqual(GRANT_PHASES, PROSPECT_STAGES.slice(0, 6));
});

test("legacy stage names map onto the new phases", () => {
  assert.equal(normalizeProspectStage("Research"), "Prospecting");
  assert.equal(normalizeProspectStage("Outreach"), "Viable");
  assert.equal(normalizeProspectStage("In Conversation"), "Viable");
  assert.equal(normalizeProspectStage("Application"), "Drafted");
  assert.equal(normalizeProspectStage("Stewardship"), "Received");
  assert.equal(normalizeProspectStage("Submitted"), "Submitted");
  assert.equal(normalizeProspectStage(null), "Prospecting");
});

test("which moves ask before saving", () => {
  assert.equal(stageMoveNeeds("Submitted", "Committed"), "commit");
  assert.equal(stageMoveNeeds("Committed", "Received"), "receive");
  assert.equal(stageMoveNeeds("Viable", "Received"), "receive");
  assert.equal(stageMoveNeeds("Viable", "Drafted"), "");
  assert.equal(stageMoveNeeds("Committed", "Committed"), "");
  assert.equal(stageMoveNeeds("Stewardship", "Received"), "", "a legacy Received row is already there");
});

test("money typing", () => {
  assert.equal(parseMoneyInput("$12,500"), 12500);
  assert.equal(parseMoneyInput(" 12500.5 "), 12500.5);
  assert.equal(parseMoneyInput(""), null);
  assert.equal(parseMoneyInput("abc"), undefined);
  assert.equal(parseMoneyInput("12.345"), undefined);
  assert.equal(moneyInputValue(12500), "12500");
  assert.equal(moneyInputValue(null), "");
});

test("a grant counts when Committed or Received with an amount, in committed_on's year", () => {
  assert.equal(grantCountedYear({ stage: "Committed", committed_amount: 100, committed_on: "2027-01-02" }), 2027);
  assert.equal(grantCountedYear({ stage: "Received", committed_amount: "100", committed_on: "2026-12-31" }), 2026);
  assert.equal(grantCountedYear({ stage: "Committed", committed_amount: null, committed_on: "2027-01-02" }), null);
  assert.equal(grantCountedYear({ stage: "Submitted", committed_amount: 100, committed_on: "2027-01-02" }), null);
  assert.equal(grantCountedYear({ stage: "Committed", committed_amount: 100, committed_on: null }), null);
});

test("missing grant columns fall back to the original list once", async () => {
  assert.equal(PROSPECT_FULL_COLUMNS.startsWith(`${PROSPECT_COLUMNS},`), true);
  assert.equal(isMissingColumnError({ code: "42703", message: "column fundraising_prospects.ask_amount does not exist" }), true);
  assert.equal(isMissingColumnError({ code: "23514" }), false);
  const seen = [];
  const run = async (columns) => {
    seen.push(columns);
    return columns.includes("ask_amount")
      ? { data: null, error: { code: "42703", message: "column does not exist" } }
      : { data: [{ id: "x" }], error: null };
  };
  const result = await withProspectColumns(run);
  assert.deepEqual(result.data, [{ id: "x" }]);
  assert.deepEqual(seen, [PROSPECT_FULL_COLUMNS, PROSPECT_COLUMNS]);
  assert.equal(prospectGrantColumnsMissing(), true);
  seen.length = 0;
  await withProspectColumns(run);
  assert.deepEqual(seen, [PROSPECT_COLUMNS], "not retried with the missing columns again");
});

for (const [name, fn] of queue) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}
console.log(`\n${passed} tests passed`);
