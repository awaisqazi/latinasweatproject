// Needs attention, monthly updates and the Overview goal bar · logic tests.
// node src/lib/dashboard/test/fundraisingAttention.test.mjs
//
// Pins the attention normalizer (contract shape, junk, forbidden), the
// grouping the Overview list shows, the updates map and the goal bar.

import assert from "node:assert/strict";
import {
  attentionLines,
  countSentence,
  loadAttention,
  loadMonthUpdates,
  monthStartOf,
  normalizeAttention,
  subcommitteeTiles,
  subTabId,
  thanksOverdueCount,
  updatePreview,
  updatesBySubcommittee,
} from "../fundraisingAttention.js";
import { goalBarModel, normalizeGoalRollup } from "../fundraisingRollup.js";

let passed = 0;
const queue = [];
function test(name, fn) {
  queue.push([name, fn]);
}

function grant(id, due, extra = {}) {
  return {
    kind: "grant_deadline",
    subcommittee: "grants",
    count: null,
    title: `Prospect ${id}`,
    detail: `Next action ${id}`,
    due_on: due,
    target: { tab: "grants", subtab: "pipeline", id: `p-${id}` },
    ...extra,
  };
}

const SAMPLE = {
  ok: true,
  generated_at: "2026-11-19T02:01:32Z",
  today: "2026-11-18",
  cycle: "2027",
  items: [
    grant(1, "2026-07-29"),
    grant(2, "2026-07-29"),
    grant(3, "2026-11-01"),
    grant(4, "2026-11-20"),
    grant(5, "2026-11-25"),
    grant(6, "2026-12-01"),
    grant(7, "2026-12-10"),
    {
      kind: "thanks_overdue", subcommittee: "donors", count: 190,
      title: "190 gifts waiting over a week for a thank-you",
      detail: "Thank donors within 7 days of their gift.", due_on: null,
      target: { tab: "donors", subtab: "thanks" },
    },
    {
      kind: "fundraisers_pending", subcommittee: "events", count: 9,
      title: "9 fundraiser sign-ups to approve", detail: "Giving Tuesday", due_on: null,
      target: { tab: "events", subtab: "giving" },
    },
    {
      kind: "lapsed_no_owner", subcommittee: "donors", count: 1,
      title: "1 lapsed donors have no owner", detail: "", due_on: null,
      target: { tab: "donors", subtab: "lapsed" },
    },
    { kind: "worksheet_not_sized", subcommittee: "events", count: null, title: "Events worksheet not sized for 2027", detail: "", due_on: null, target: { tab: "events", subtab: "worksheet" } },
    { kind: "worksheet_not_sized", subcommittee: "grants", count: null, title: "Grants worksheet not sized for 2027", detail: "", due_on: null, target: { tab: "grants", subtab: "worksheet" } },
  ],
};

test("normalizeAttention reads the contract shape", () => {
  const a = normalizeAttention(SAMPLE);
  assert.equal(a.ok, true);
  assert.equal(a.today, "2026-11-18");
  assert.equal(a.cycle, "2027");
  assert.equal(a.items.length, 12);
  assert.deepEqual(a.items[7].target, { tab: "donors", subtab: "thanks", id: "" });
  assert.equal(a.items[7].count, 190);
  assert.equal(a.items[0].count, null);
  assert.equal(a.items[0].dueOn, "2026-07-29");
});

test("normalizeAttention survives junk and reports forbidden", () => {
  for (const raw of [null, undefined, "nope", 7, [], { items: "x" }, { items: [null, 3, "a"] }]) {
    const a = normalizeAttention(raw);
    assert.equal(a.ok, true);
    assert.deepEqual(a.items, []);
  }
  assert.equal(normalizeAttention({ ok: false, reason: "forbidden" }).ok, false);
  assert.equal(normalizeAttention(JSON.stringify(SAMPLE)).items.length, 12);
  assert.equal(normalizeAttention([{ fundraising_attention: SAMPLE }]).items.length, 12);
});

test("overdue grants fold into one line that expands to each grant", () => {
  const lines = attentionLines(normalizeAttention(SAMPLE).items, "2026-11-18");
  const first = lines[0];
  assert.equal(first.kind, "grant_overdue_group");
  assert.equal(first.title, "3 grant next steps are overdue");
  assert.equal(first.children.length, 3);
  assert.deepEqual(first.children[0].target, { tab: "grants", subtab: "pipeline", id: "p-1" });
  assert.equal(lines.filter((line) => line.kind === "grant_overdue_group").length, 1);
});

test("at most three upcoming grants show on their own, the rest fold", () => {
  const lines = attentionLines(normalizeAttention(SAMPLE).items, "2026-11-18");
  const single = lines.filter((line) => line.kind === "grant_deadline");
  assert.equal(single.length, 3);
  assert.deepEqual(single.map((line) => line.target.id), ["p-4", "p-5", "p-6"]);
  assert.match(single[0].title, /^Prospect 4: next step due /);
  assert.ok(single[0].dueLabel);
  const more = lines.find((line) => line.kind === "grant_upcoming_group");
  assert.equal(more.children.length, 1);
  assert.match(more.title, /^1 more grant next step is due/);
});

test("count items read number first, with the right plural", () => {
  const lines = attentionLines(normalizeAttention(SAMPLE).items, "2026-11-18");
  const titles = lines.map((line) => line.title);
  assert.ok(titles.includes("190 gifts have waited more than a week for a thank-you"));
  assert.ok(titles.includes("9 fundraiser sign-ups need approval"));
  assert.ok(titles.includes("1 lapsed donor has no owner"));
  assert.equal(countSentence({ kind: "thanks_overdue", count: 1, title: "" }), "1 gift has waited more than a week for a thank-you");
  assert.equal(countSentence({ kind: "outreach_to_contact", count: 1234, title: "" }), "1,234 donors on call lists have not been contacted yet");
  assert.equal(countSentence({ kind: "new_kind", count: 4, title: "4 new things" }), "4 new things");
});

test("per-subcommittee kinds fold when more than one, stay single when one", () => {
  const lines = attentionLines(normalizeAttention(SAMPLE).items, "2026-11-18");
  const sheets = lines.find((line) => line.kind === "worksheet_not_sized_group");
  assert.equal(sheets.title, "2 worksheets are not sized for 2027 yet");
  assert.equal(sheets.detail, "Fundraising Events, Grants");
  assert.deepEqual(sheets.children[1].target, { tab: "grants", subtab: "worksheet", id: "" });

  const one = attentionLines(
    normalizeAttention({ items: [{ kind: "update_missing", subcommittee: "donors", title: "Donor Engagement has no November update", target: { tab: "donors" } }] }).items,
    "2026-11-21",
  );
  assert.equal(one.length, 1);
  assert.equal(one[0].title, "Donor Engagement has no November update");
  assert.deepEqual(one[0].target, { tab: "donors", subtab: "", id: "" });

  const two = attentionLines(
    normalizeAttention({
      items: [
        { kind: "update_missing", subcommittee: "events", title: "a", target: { tab: "events" } },
        { kind: "update_missing", subcommittee: "upskilling", title: "b", target: { tab: "upskilling" } },
      ],
    }).items,
    "2026-11-21",
  );
  assert.equal(two.length, 1);
  assert.equal(two[0].title, "2 subcommittees have no update for November yet");
});

test("line order follows the RPC, a folded line takes its first item's place", () => {
  const lines = attentionLines(normalizeAttention(SAMPLE).items, "2026-11-18");
  assert.deepEqual(
    lines.map((line) => line.kind),
    [
      "grant_overdue_group",
      "grant_deadline",
      "grant_deadline",
      "grant_deadline",
      "grant_upcoming_group",
      "thanks_overdue",
      "fundraisers_pending",
      "lapsed_no_owner",
      "worksheet_not_sized_group",
    ],
  );
  assert.deepEqual(attentionLines([], "2026-11-18"), []);
  assert.deepEqual(attentionLines(null), []);
});

test("thanksOverdueCount: number when loaded, 0 when absent, null when not loaded", () => {
  assert.equal(thanksOverdueCount(normalizeAttention(SAMPLE)), 190);
  assert.equal(thanksOverdueCount(normalizeAttention({ ok: true, items: [] })), 0);
  assert.equal(thanksOverdueCount(null), null);
  assert.equal(thanksOverdueCount(normalizeAttention({ ok: false })), null);
});

test("subTabId builds <tab>-<subtab>", () => {
  assert.equal(subTabId({ tab: "donors", subtab: "thanks" }), "donors-thanks");
  assert.equal(subTabId({ tab: "donors", subtab: "" }), "");
  assert.equal(subTabId(null), "");
});

test("updates: month start, map by subcommittee, preview", () => {
  assert.equal(monthStartOf("2026-11-18"), "2026-11-01");
  assert.equal(monthStartOf("junk"), "");
  const map = updatesBySubcommittee([
    { subcommittee: "donors", month: "2026-11-01", body: "  Old  ", updated_at: "2026-11-02T00:00:00Z" },
    { subcommittee: "donors", month: "2026-11-01", body: "New", updated_at: "2026-11-10T00:00:00Z" },
    { subcommittee: "events", body: "   " },
    { subcommittee: "other", body: "x" },
    null,
  ]);
  assert.deepEqual(Object.keys(map), ["donors"]);
  assert.equal(map.donors.body, "New");
  assert.equal(updatePreview("short"), "short");
  const long = "word ".repeat(60);
  const preview = updatePreview(long, 40);
  assert.ok(preview.length <= 41);
  assert.ok(preview.endsWith("…"));
});

test("loaders degrade quietly", async () => {
  assert.equal((await loadAttention(null)).missing, true);
  const missing = await loadAttention({ rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) });
  assert.equal(missing.missing, true);
  const forbidden = await loadAttention({ rpc: async () => ({ data: { ok: false, reason: "forbidden" }, error: null }) });
  assert.equal(forbidden.forbidden, true);
  const ok = await loadAttention({ rpc: async (name, args) => {
    assert.equal(name, "fundraising_attention");
    assert.equal(args.p_tz, "America/Chicago");
    return { data: SAMPLE, error: null };
  } });
  assert.equal(ok.data.items.length, 12);

  const query = (result) => ({
    from: () => ({ select: () => ({ eq: async () => result }) }),
  });
  const table = await loadMonthUpdates(query({ data: null, error: { code: "42P01", message: "relation does not exist" } }), "2026-11-01");
  assert.deepEqual(table, { data: {}, error: null, missing: true });
  const rows = await loadMonthUpdates(query({ data: [{ subcommittee: "grants", body: "Hi", updated_at: "x" }], error: null }), "2026-11-01");
  assert.equal(rows.data.grants.body, "Hi");
});

test("subcommittee tiles pick one headline each and degrade without data", () => {
  const view = {
    connected: true,
    live: { donors: { lapsedCount: 42 } },
    grants: { committedYtdCents: 1000000, pipelineCount: 85 },
    events: { revenueCents: 5000000 },
    upskilling: { signedUp: 12 },
  };
  const tiles = subcommitteeTiles(view, 190, { grants: { body: "Two LOIs out", updatedAt: "x" } });
  assert.deepEqual(tiles.map((tile) => tile.id), ["donors", "grants", "events", "upskilling"]);
  assert.equal(tiles[0].value, "190");
  assert.match(tiles[0].label, /^gifts waiting more than a week/);
  assert.equal(tiles[1].value, "$10,000");
  assert.equal(tiles[1].label, "committed this year, 85 in the pipeline");
  assert.equal(tiles[1].update.body, "Two LOIs out");
  assert.equal(tiles[2].value, "$50,000");
  assert.equal(tiles[3].value, "12");
  assert.equal(tiles[0].update, null);
  assert.equal(tiles[0].coLeads, "Rut and Margarita");
  // No attention data: lapsed donors instead.
  assert.equal(subcommitteeTiles(view, null)[0].value, "42");
  // Nothing loaded at all.
  const bare = subcommitteeTiles(null, null, null);
  assert.deepEqual(bare.map((tile) => tile.value), ["n/a", "n/a", "n/a", "n/a"]);
});

// ── Goal bar ──

const ROLLUP = normalizeGoalRollup({
  ok: true,
  cycle: "2027",
  goal_cents: 100000000,
  grants_committed_cents: 100000,
  subcommittees: [
    { id: "events", realistic_cents: 25000000, low_cents: 1, stretch_cents: 2, filled: true },
    { id: "grants", realistic_cents: null, filled: false },
    { id: "donors", realistic_cents: 20000000, filled: true },
    { id: "upskilling", filled: false },
  ],
});
const EMPTY_ROLLUP = normalizeGoalRollup({ ok: true, cycle: "2027", goal_cents: 100000000, subcommittees: [] });
const UPCOMING = { year: 2027, cents: 100000000, mode: "upcoming", baselineCents: 11409900 };

test("goal bar before the goal year: counted is progress toward the plans", () => {
  const bar = goalBarModel({ goal: UPCOMING, rollup: ROLLUP, grants: { byYear: { 2027: 250000 } } });
  assert.equal(bar.countedCents, 250000);
  assert.equal(bar.realisticCents, 45000000);
  assert.equal(bar.plansCents, 45000000 - 250000);
  assert.equal(bar.gapCents, 100000000 - 45000000);
  assert.equal(bar.sentence, "Realistic plans add up to $450,000, and $2,500 of that is already in. That leaves $550,000 to find.");
  assert.equal(bar.unsizedNote, "Not sized yet: Grants and Fundraising Workshops.");
  assert.ok(bar.countedPercent + bar.plansPercent <= 100);
  // Without the live grants block, the roll-up's committed grants are used.
  assert.equal(goalBarModel({ goal: UPCOMING, rollup: ROLLUP, grants: null }).countedCents, 100000);
  // Grants block with no entry for the year counts 0, and the sentence skips "already in".
  const zero = goalBarModel({ goal: UPCOMING, rollup: ROLLUP, grants: { byYear: {} } });
  assert.equal(zero.countedCents, 0);
  assert.equal(zero.sentence, "Realistic plans add up to $450,000. That leaves $550,000 to find.");
});

test("goal bar is honest when nothing is sized or no plans load", () => {
  const none = goalBarModel({ goal: UPCOMING, rollup: EMPTY_ROLLUP, grants: { byYear: {} } });
  assert.equal(none.sentence, "No subcommittee has sized its plan yet. That leaves $1,000,000 to find.");
  assert.equal(none.unsizedNote, "");
  assert.equal(none.plansCents, 0);
  const noPlans = goalBarModel({ goal: UPCOMING, rollup: null, grants: null });
  assert.equal(noPlans.plansApply, false);
  assert.equal(noPlans.countedKnown, false);
  assert.equal(noPlans.sentence, "That leaves $1,000,000 to find.");
  assert.equal(goalBarModel({ goal: null }), null);
});

test("goal bar when counted money passes the plans, or covers the goal", () => {
  const current = { year: 2027, cents: 100000000, mode: "current", baselineCents: 60000000 };
  const bar = goalBarModel({ goal: current, rollup: ROLLUP, grants: null });
  assert.equal(bar.countedCents, 60000000);
  assert.equal(bar.plansCents, 0);
  assert.equal(bar.gapCents, 40000000);
  assert.equal(bar.sentence, "Realistic plans add up to $450,000, and $600,000 is already in, more than the plans. That leaves $400,000 to find.");
  assert.equal(bar.countedPercent, 60);
  assert.equal(bar.plansPercent, 0);
  const over = goalBarModel({ goal: { ...current, baselineCents: 110000000 }, rollup: ROLLUP });
  assert.equal(over.gapCents, 0);
  assert.match(over.sentence, /That is \$100,000 more than the goal\.$/);
  // A plan cycle for another year adds nothing to this bar.
  const other = goalBarModel({ goal: { ...current, year: 2026 }, rollup: ROLLUP });
  assert.equal(other.plansApply, false);
  assert.equal(other.plansCents, 0);
});

for (const [name, fn] of queue) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
console.log(`${passed} tests passed`);
