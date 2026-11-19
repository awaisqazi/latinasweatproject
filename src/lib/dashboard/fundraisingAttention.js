// Fundraising > Overview: "Needs attention" and the subcommittees' monthly
// updates.
//
// Reads public.fundraising_attention(p_tz) and the table
// public.fundraising_updates. Contract:
// docs/fundraising-live/04-attention-thanks-updates.md.
//
// normalizeAttention() is the one place that knows the RPC's field names.
// attentionLines() turns the raw items into the short list the board reads:
// overdue grant next steps fold into one line, at most three upcoming ones
// stay on their own, count items read as one sentence with the number first,
// and the per-subcommittee kinds (missing update, worksheet not sized) fold
// into one line each when more than one subcommittee has them.

import {
  FUNDRAISING_SUBCOMMITTEES,
  coLeadsLabel,
  subcommitteeById,
} from "../../data/fundraisingSubcommittees.js";
import { formatCentsWhole, isMissingRpcError } from "./fundraisingLive.js";
import { STUDIO_TIME_ZONE, chicagoToday, formatDateOnlyLabel } from "./timeclock.js";

export const ATTENTION_RPC = "fundraising_attention";
export const UPDATES_TABLE = "fundraising_updates";
export const ATTENTION_LINES_SHOWN = 6;
export const UPCOMING_GRANTS_SHOWN = 3;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function dateOrEmpty(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text(value));
  return match ? match[1] : "";
}

function countOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

// ── Attention ───────────────────────────────────────────────────

function normalizeItem(row, index) {
  const target = isObject(row.target) ? row.target : {};
  const subcommittee = text(row.subcommittee);
  return {
    key: `${text(row.kind) || "item"}|${subcommittee}|${text(target.id)}|${index}`,
    kind: text(row.kind),
    subcommittee: subcommittee || null,
    count: countOrNull(row.count),
    title: text(row.title),
    detail: text(row.detail),
    dueOn: dateOrEmpty(row.due_on),
    target: {
      tab: text(target.tab),
      subtab: text(target.subtab),
      id: text(target.id),
    },
  };
}

// Always the full shape. ok is false only when the RPC says so.
export function normalizeAttention(raw) {
  let source = raw;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }
  if (Array.isArray(source)) source = source[0];
  if (isObject(source) && isObject(source[ATTENTION_RPC])) source = source[ATTENTION_RPC];
  if (!isObject(source)) source = {};
  const items = (Array.isArray(source.items) ? source.items : [])
    .filter(isObject)
    .map(normalizeItem)
    .filter((item) => item.kind || item.title);
  return {
    ok: source.ok !== false,
    reason: text(source.reason),
    today: dateOrEmpty(source.today),
    cycle: text(source.cycle),
    generatedAt: text(source.generated_at),
    items,
  };
}

function subcommitteeLabel(id) {
  const subcommittee = subcommitteeById(id);
  return subcommittee?.tabLabel || subcommittee?.name || id || "";
}

// A month name from a "2026-11-18" date.
export function monthNameOf(date) {
  const match = /^\d{4}-(\d{2})/.exec(text(date));
  return match ? MONTH_NAMES[Number(match[1]) - 1] || "" : "";
}

// The plain sentence for a count kind, number first. Falls back to the
// RPC's own title for anything it does not know.
export function countSentence(item) {
  const n = item.count;
  if (n === null) return item.title;
  const num = n.toLocaleString("en-US");
  switch (item.kind) {
    case "thanks_overdue":
      return `${num} ${plural(n, "gift has", "gifts have")} waited more than a week for a thank-you`;
    case "fundraisers_pending":
      return `${num} fundraiser ${plural(n, "sign-up needs", "sign-ups need")} approval`;
    case "outreach_to_contact":
      return `${num} ${plural(n, "donor on a call list has", "donors on call lists have")} not been contacted yet`;
    case "lapsed_no_owner":
      return `${num} lapsed ${plural(n, "donor has", "donors have")} no owner`;
    default:
      return item.title || `${num} to look at`;
  }
}

function navTarget(item) {
  return { tab: item.target.tab || item.subcommittee || "", subtab: item.target.subtab, id: "" };
}

function grantChild(item) {
  return {
    key: item.key,
    title: item.title || "Untitled grant",
    detail: item.detail,
    dueOn: item.dueOn,
    dueLabel: item.dueOn ? formatDateOnlyLabel(item.dueOn) : "",
    target: { tab: "grants", subtab: item.target.subtab || "pipeline", id: item.target.id },
  };
}

function subcommitteeChild(item) {
  return {
    key: item.key,
    title: item.title || subcommitteeLabel(item.subcommittee),
    detail: item.detail,
    dueOn: "",
    dueLabel: "",
    target: navTarget(item),
  };
}

// Lines for the "Needs attention" list, in the RPC's order (a folded line
// takes the place of its first item). Each line is
// { key, kind, title, detail, dueLabel, overdue, target, children }.
// A line with children expands; a line without navigates to its target
// (target.id set means "open this prospect").
export function attentionLines(items, today = chicagoToday()) {
  const list = Array.isArray(items) ? items : [];
  const day = dateOrEmpty(today) || chicagoToday();
  const month = monthNameOf(day);

  const grants = list.filter((item) => item.kind === "grant_deadline");
  const overdue = grants.filter((item) => item.dueOn && item.dueOn < day);
  const upcoming = grants
    .filter((item) => !item.dueOn || item.dueOn >= day)
    .sort((a, b) => (a.dueOn || "9999").localeCompare(b.dueOn || "9999"));
  const upcomingShown = upcoming.slice(0, UPCOMING_GRANTS_SHOWN);
  const upcomingRest = upcoming.slice(UPCOMING_GRANTS_SHOWN);
  const updates = list.filter((item) => item.kind === "update_missing");
  const worksheets = list.filter((item) => item.kind === "worksheet_not_sized");

  const lines = [];
  const placed = new Set();

  for (const item of list) {
    if (item.kind === "grant_deadline") {
      if (overdue.includes(item)) {
        if (placed.has("grants-overdue")) continue;
        placed.add("grants-overdue");
        lines.push({
          key: "grants-overdue",
          kind: "grant_overdue_group",
          title:
            overdue.length === 1
              ? "1 grant next step is overdue"
              : `${overdue.length.toLocaleString("en-US")} grant next steps are overdue`,
          detail: "Each one has a next-step date that has passed.",
          dueLabel: "",
          overdue: true,
          target: { tab: "grants", subtab: "pipeline", id: "" },
          children: overdue.map(grantChild),
        });
        continue;
      }
      if (!placed.has("grants-upcoming")) {
        placed.add("grants-upcoming");
        for (const next of upcomingShown) {
          const child = grantChild(next);
          lines.push({
            key: next.key,
            kind: "grant_deadline",
            title: `${child.title}: next step due ${child.dueLabel || "soon"}`,
            detail: next.detail,
            dueLabel: child.dueLabel,
            overdue: false,
            target: child.target,
            children: [],
          });
        }
        if (upcomingRest.length) {
          lines.push({
            key: "grants-upcoming-more",
            kind: "grant_upcoming_group",
            title: `${upcomingRest.length.toLocaleString("en-US")} more grant next ${plural(upcomingRest.length, "step is", "steps are")} due in the next 30 days`,
            detail: "",
            dueLabel: "",
            overdue: false,
            target: { tab: "grants", subtab: "pipeline", id: "" },
            children: upcomingRest.map(grantChild),
          });
        }
      }
      continue;
    }

    if (item.kind === "update_missing" && updates.length > 1) {
      if (placed.has("updates")) continue;
      placed.add("updates");
      lines.push({
        key: "updates-missing",
        kind: "update_missing_group",
        title: `${updates.length} subcommittees have no update for ${month || "this month"} yet`,
        detail: updates.map((row) => subcommitteeLabel(row.subcommittee)).filter(Boolean).join(", "),
        dueLabel: "",
        overdue: false,
        target: { tab: "", subtab: "", id: "" },
        children: updates.map(subcommitteeChild),
      });
      continue;
    }

    if (item.kind === "worksheet_not_sized" && worksheets.length > 1) {
      if (placed.has("worksheets")) continue;
      placed.add("worksheets");
      const year = worksheets.map((row) => (row.title.match(/\b\d{4}\b/) || [])[0]).find(Boolean);
      lines.push({
        key: "worksheets-not-sized",
        kind: "worksheet_not_sized_group",
        title: `${worksheets.length} worksheets are not sized${year ? ` for ${year}` : ""} yet`,
        detail: worksheets.map((row) => subcommitteeLabel(row.subcommittee)).filter(Boolean).join(", "),
        dueLabel: "",
        overdue: false,
        target: { tab: "", subtab: "", id: "" },
        children: worksheets.map(subcommitteeChild),
      });
      continue;
    }

    lines.push({
      key: item.key,
      kind: item.kind,
      title: item.count === null ? item.title || "Something to look at" : countSentence(item),
      detail: item.detail,
      dueLabel: item.dueOn ? formatDateOnlyLabel(item.dueOn) : "",
      overdue: Boolean(item.dueOn && item.dueOn < day),
      target: navTarget(item),
      children: [],
    });
  }

  return lines;
}

// Gifts waiting more than a week for a thank-you, from the attention data:
// a number when the attention data loaded (0 when the kind is absent, since
// the RPC leaves out kinds with nothing to act on), null when it did not.
export function thanksOverdueCount(attention) {
  if (!attention || !attention.ok) return null;
  const item = (attention.items || []).find((row) => row.kind === "thanks_overdue");
  return item ? item.count ?? 0 : 0;
}

// The sub-tab id FundraisingView uses: `<tab>-<subtab>`, or "" for none.
export function subTabId(target) {
  const tab = text(target?.tab);
  const subtab = text(target?.subtab);
  return tab && subtab ? `${tab}-${subtab}` : "";
}

// { data, error, missing, forbidden }. missing is true when the RPC is not
// deployed yet; the list then stays hidden.
export async function loadAttention(supabase) {
  if (!supabase) return { data: null, error: null, missing: true, forbidden: false };
  const { data, error } = await supabase.rpc(ATTENTION_RPC, { p_tz: STUDIO_TIME_ZONE });
  if (error) return { data: null, error, missing: isMissingRpcError(error), forbidden: false };
  const attention = normalizeAttention(data);
  if (!attention.ok) return { data: null, error: null, missing: false, forbidden: true, reason: attention.reason };
  return { data: attention, error: null, missing: false, forbidden: false };
}

// ── Monthly updates ─────────────────────────────────────────────

// "2026-11-01" for any date in November 2026.
export function monthStartOf(date = chicagoToday()) {
  const match = /^(\d{4})-(\d{2})/.exec(text(date));
  return match ? `${match[1]}-${match[2]}-01` : "";
}

// { donors: { body, updatedAt }, ... } for the rows of one month; a
// subcommittee with no row (or an empty body) is left out.
export function updatesBySubcommittee(rows) {
  const known = new Set(FUNDRAISING_SUBCOMMITTEES.map((row) => row.id));
  const result = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isObject(row)) continue;
    const id = text(row.subcommittee);
    const body = text(row.body);
    if (!known.has(id) || !body) continue;
    const updatedAt = text(row.updated_at);
    if (result[id] && result[id].updatedAt >= updatedAt) continue;
    result[id] = { body, updatedAt };
  }
  return result;
}

// The first lines of an update for a tile: up to `max` characters, cut at
// a word, with an ellipsis when cut.
export function updatePreview(body, max = 140) {
  const flat = text(body).replace(/\s+/g, " ");
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:]+$/, "")}…`;
}

function isMissingTableError(error) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST200") return true;
  if (Number(error.status) === 404) return true;
  return /could not find the table|relation .* does not exist/i.test(String(error.message || ""));
}

// { data: {donors: {...}}, error, missing }. A missing table or a user
// without access comes back as an empty map, quietly.
export async function loadMonthUpdates(supabase, month = monthStartOf()) {
  if (!supabase || !month) return { data: {}, error: null, missing: true };
  const { data, error } = await supabase
    .from(UPDATES_TABLE)
    .select("subcommittee,month,body,updated_at")
    .eq("month", month);
  if (error) {
    const missing = isMissingTableError(error);
    return { data: {}, error: missing ? null : error, missing };
  }
  return { data: updatesBySubcommittee(data), error: null, missing: false };
}

// ── Subcommittee tiles ──────────────────────────────────────────

// One tile per subcommittee, in the data file's order: name, co-leads, ONE
// headline number with its label, and this month's update (or null).
// view is LiveData's view; thanksOverdue is thanksOverdueCount() output;
// updates is updatesBySubcommittee() output.
export function subcommitteeTiles(view, thanksOverdue = null, updates = {}) {
  const connected = Boolean(view?.connected);
  const count = (n) => (n === null || n === undefined ? "n/a" : Number(n).toLocaleString("en-US"));
  return FUNDRAISING_SUBCOMMITTEES.map((subcommittee) => {
    let value = "n/a";
    let label = "";
    if (subcommittee.id === "donors") {
      if (thanksOverdue !== null && thanksOverdue !== undefined) {
        value = count(thanksOverdue);
        label = `${thanksOverdue === 1 ? "gift" : "gifts"} waiting more than a week for a thank-you`;
      } else {
        const lapsed = connected ? view?.live?.donors?.lapsedCount : null;
        value = count(lapsed);
        label = "lapsed donors: gave last year, not yet this year";
      }
    } else if (subcommittee.id === "grants") {
      const grants = view?.grants || null;
      if (grants) {
        value = formatCentsWhole(grants.committedYtdCents);
        label = `committed this year, ${count(grants.pipelineCount)} in the pipeline`;
      } else {
        label = "committed this year";
      }
    } else if (subcommittee.id === "events") {
      if (connected && view?.events) {
        value = formatCentsWhole(view.events.revenueCents);
        label = "event revenue this year";
      } else {
        label = "event revenue this year, needs the live Zeffy numbers";
      }
    } else if (subcommittee.id === "upskilling") {
      const upskilling = view?.upskilling || null;
      if (upskilling && !view?.givingError) {
        value = count(upskilling.signedUp);
        label = upskilling.signedUp === 1 ? "person fundraising" : "people fundraising";
      } else {
        label = "people fundraising";
      }
    }
    const update = updates && isObject(updates[subcommittee.id]) ? updates[subcommittee.id] : null;
    return {
      id: subcommittee.id,
      name: subcommittee.name,
      tabLabel: subcommittee.tabLabel || subcommittee.name,
      coLeads: coLeadsLabel(subcommittee),
      value,
      label,
      update,
    };
  });
}
