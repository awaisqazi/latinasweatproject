// Goal roll-up (Fundraising module, Overview tab): each subcommittee's
// low / realistic / stretch plan from its worksheet, added up against the
// annual goal.
//
// Reads public.fundraising_goal_rollup(p_cycle). Contract:
// docs/fundraising-live/02-worksheets-contract.md. Money is integer cents.
// Membership Upskilling is measured in people, so its amounts are null and
// its plan comes back under `people`.
//
// normalizeGoalRollup() is the one place that knows the RPC's field names;
// the panel only sees the normalized, camelCase shape.

import { FUNDRAISING_SUBCOMMITTEES } from "../../data/fundraisingSubcommittees.js";
import { formatCentsWhole, isMissingRpcError } from "./fundraisingLive.js";

export const ROLLUP_RPC = "fundraising_goal_rollup";
export const ROLLUP_CYCLE = "2027";

export const PEOPLE_METRICS = [
  { key: "people_trained", label: "People trained" },
  { key: "made_ask", label: "People who made an ask" },
  { key: "introductions", label: "Introductions" },
  { key: "employer_matches", label: "Employer matches" },
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

// Whole cents, or null when missing, not a number, or negative.
function centsOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function countOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function boolOrNull(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value === "true" || value === "t";
  return Boolean(value);
}

function joinNames(names) {
  const list = names.filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function sumOf(rows, key) {
  return rows.reduce((sum, row) => (row[key] === null ? sum : sum + row[key]), 0);
}

function normalizeRange(value) {
  const source = isObject(value) ? value : {};
  const range = {
    low: countOrNull(source.low),
    realistic: countOrNull(source.realistic),
    stretch: countOrNull(source.stretch),
  };
  return { ...range, sized: range.low !== null || range.realistic !== null || range.stretch !== null };
}

// Always hands back the full shape, with one row per dollar subcommittee in
// the data file's order (an absent row is simply "not sized yet").
export function normalizeGoalRollup(raw) {
  let source = raw;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }
  if (Array.isArray(source)) source = source[0];
  if (isObject(source) && isObject(source[ROLLUP_RPC])) source = source[ROLLUP_RPC];
  if (!isObject(source)) source = {};

  const byId = new Map();
  for (const row of Array.isArray(source.subcommittees) ? source.subcommittees : []) {
    if (isObject(row) && text(row.id)) byId.set(text(row.id), row);
  }

  const rowFor = (subcommittee) => {
    const row = byId.get(subcommittee.id) || {};
    const lowCents = centsOrNull(row.low_cents);
    const realisticCents = centsOrNull(row.realistic_cents);
    const stretchCents = centsOrNull(row.stretch_cents);
    const hasAmount = lowCents !== null || realisticCents !== null || stretchCents !== null;
    return {
      id: subcommittee.id,
      name: subcommittee.name,
      tabLabel: subcommittee.tabLabel || subcommittee.name,
      lowCents,
      realisticCents,
      stretchCents,
      filled: boolOrNull(row.filled),
      // A row counts once it carries an amount, unless the backend says the
      // worksheet is explicitly not filled in.
      sized: hasAmount && row.filled !== false,
      updatedAt: text(row.updated_at),
    };
  };

  const rows = FUNDRAISING_SUBCOMMITTEES.filter((s) => s.measure !== "people").map(rowFor);
  const sizedRows = rows.filter((row) => row.sized);

  const peopleSubcommittee = FUNDRAISING_SUBCOMMITTEES.find((s) => s.measure === "people") || null;
  const peopleSource = isObject(source.people) ? source.people : {};
  const peopleMetrics = PEOPLE_METRICS.map((metric) => ({
    ...metric,
    ...normalizeRange(peopleSource[metric.key]),
  }));
  const peopleRow = peopleSubcommittee ? byId.get(peopleSubcommittee.id) || {} : {};

  const goalCents = centsOrNull(source.goal_cents);

  return {
    ok: source.ok !== false,
    reason: text(source.reason),
    cycle: text(source.cycle),
    goalCents: goalCents && goalCents > 0 ? goalCents : null,
    // Grants already committed for the cycle year (null when not sent).
    grantsCommittedCents: centsOrNull(source.grants_committed_cents),
    rows,
    sizedCount: sizedRows.length,
    // Summed here from the sized rows only, so the totals always add up to
    // the rows the panel shows. (The RPC's own totals also count amounts on
    // worksheets that are not filled in.)
    totals: {
      lowCents: sumOf(sizedRows, "lowCents"),
      realisticCents: sumOf(sizedRows, "realisticCents"),
      stretchCents: sumOf(sizedRows, "stretchCents"),
    },
    people: peopleSubcommittee
      ? {
          id: peopleSubcommittee.id,
          name: peopleSubcommittee.name,
          tabLabel: peopleSubcommittee.tabLabel || peopleSubcommittee.name,
          metrics: peopleMetrics,
          sized: peopleMetrics.some((metric) => metric.sized) && peopleRow.filled !== false,
          updatedAt: text(peopleRow.updated_at),
        }
      : null,
  };
}

// The one plain-words line the board reads first. fallbackGoalCents is the
// goal stored in app_settings for the same year, used when the RPC sends none.
export function rollupSummary(rollup, fallbackGoalCents = null) {
  if (!rollup) return null;
  const goalCents = rollup.goalCents || (fallbackGoalCents > 0 ? fallbackGoalCents : null);
  // Whole dollars before comparing, so the total and the gap shown always
  // add up to the goal shown.
  const realistic = Math.round(rollup.totals.realisticCents / 100) * 100;
  const year = rollup.cycle || ROLLUP_CYCLE;
  const unsized = rollup.rows.filter((row) => !row.sized);

  let status;
  let sentence;
  let gapCents = null;
  if (!rollup.sizedCount) {
    status = "none";
    sentence =
      "No subcommittee has sized its plan yet. Each one adds its low, realistic and stretch numbers on its Worksheet tab.";
  } else if (!goalCents) {
    status = "nogoal";
    sentence = `Realistic plans add up to ${formatCentsWhole(realistic)}. No goal is set for ${year} yet.`;
  } else if (realistic < goalCents) {
    status = "short";
    gapCents = goalCents - realistic;
    sentence = `Realistic plans add up to ${formatCentsWhole(realistic)}, ${formatCentsWhole(gapCents)} short of the ${formatCentsWhole(goalCents)} goal.`;
  } else if (realistic === goalCents) {
    status = "met";
    gapCents = 0;
    sentence = `Realistic plans add up to ${formatCentsWhole(realistic)}, which meets the ${formatCentsWhole(goalCents)} goal.`;
  } else {
    status = "over";
    gapCents = goalCents - realistic;
    sentence = `Realistic plans add up to ${formatCentsWhole(realistic)}, ${formatCentsWhole(-gapCents)} more than the ${formatCentsWhole(goalCents)} goal.`;
  }

  let incompleteNote = "";
  if (rollup.sizedCount && unsized.length) {
    const names = joinNames(unsized.map((row) => row.name));
    incompleteNote = `This leaves out ${names}, which ${unsized.length === 1 ? "has" : "have"} not sized ${unsized.length === 1 ? "its plan" : "their plans"} yet.`;
  }

  return { status, goalCents, realisticCents: realistic, gapCents, sentence, incompleteNote };
}

// Any worksheet edit changes the roll-up (contract section 5). Returns an
// unsubscribe function.
export function subscribeWorksheetRows(supabase, cycle, onChange) {
  if (!supabase?.channel) return () => {};
  const channel = supabase
    .channel(`fundraising-worksheets-${Math.random().toString(36).slice(2, 10)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "fundraising_worksheet_rows", filter: `cycle=eq.${cycle}` },
      () => onChange?.(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// { data, error, missing, forbidden }. missing is true when the RPC is not
// deployed yet; the panel then stays hidden.
export async function loadGoalRollup(supabase, cycle = ROLLUP_CYCLE) {
  if (!supabase) return { data: null, error: null, missing: true, forbidden: false };
  const { data, error } = await supabase.rpc(ROLLUP_RPC, { p_cycle: String(cycle) });
  if (error) return { data: null, error, missing: isMissingRpcError(error), forbidden: false };
  const rollup = normalizeGoalRollup(data);
  if (!rollup.ok) return { data: null, error: null, missing: false, forbidden: true, reason: rollup.reason };
  return { data: rollup, error: null, missing: false, forbidden: false };
}
