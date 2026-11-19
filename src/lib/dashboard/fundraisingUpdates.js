// Subcommittee follow-ups for the four Fundraising subcommittee tabs:
//
// 1. This month's update: one short note per subcommittee per month in
//    public.fundraising_updates (unique on subcommittee + month; month is the
//    first day of the month in America/Chicago).
// 2. Next up: the lines of public.fundraising_attention(p_tz) that belong to
//    one subcommittee, with many overdue grant next steps folded into one.
//
// Contract: docs/fundraising-live/04-attention-thanks-updates.md, sections 2
// and 3. Everything degrades to "nothing to show" when the table or RPC is
// missing or the account lacks access.

import {
  STUDIO_TIME_ZONE,
  addDaysToDate,
  chicagoToday,
  formatChicagoDate,
  formatChicagoTimeLabel,
  formatDateOnlyLabel,
} from "./timeclock.js";
import { isForbiddenError, isMissingError } from "./fundraisingThanks.js";

export const UPDATES_TABLE = "fundraising_updates";
export const UPDATE_MAX_LENGTH = 2000;
export const UPDATE_COLUMNS = "id, subcommittee, month, body, author_id, created_at, updated_at";
export const ATTENTION_RPC = "fundraising_attention";
export const SUBCOMMITTEE_IDS = ["events", "grants", "donors", "upskilling"];
// From this many overdue grant next steps, they show as one expandable line.
export const GROUP_OVERDUE_GRANTS_FROM = 3;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

// ── Months ──────────────────────────────────────────────────────

// "2026-11-01" for any day in November 2026 (a yyyy-mm-dd key).
export function monthStartOf(dateKey) {
  if (!isDateKey(dateKey)) return "";
  return `${String(dateKey).slice(0, 7)}-01`;
}

export function currentMonthStart(now = new Date()) {
  return monthStartOf(chicagoToday(now));
}

export function previousMonthStart(monthKey) {
  if (!isDateKey(monthKey)) return "";
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
}

// "November", or "December 2025" when the month is not in `currentYear`.
export function monthName(monthKey, currentYear = null) {
  if (!isDateKey(monthKey)) return "";
  const year = Number(monthKey.slice(0, 4));
  const name = MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1] || "";
  return currentYear && Number(currentYear) !== year ? `${name} ${year}` : name;
}

// "today at 3:04 PM", "yesterday at 9:15 AM", "Nov 12 at 3:04 PM", all on
// the Chicago clock.
export function updatedLabel(value, now = new Date()) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  const day = formatChicagoDate(date);
  const today = chicagoToday(now);
  const time = formatChicagoTimeLabel(date);
  if (day === today) return `today at ${time}`;
  if (day === addDaysToDate(today, -1)) return `yesterday at ${time}`;
  const label = formatDateOnlyLabel(day);
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return `${sameYear ? label.replace(/, \d{4}$/, "") : label} at ${time}`;
}

// { ok, body, error }: body is trimmed and within the 1 to 2,000 rule.
export function validateUpdateBody(value) {
  const body = String(value ?? "").trim();
  if (!body) return { ok: false, body, error: "Write a line or two before saving." };
  if (body.length > UPDATE_MAX_LENGTH) {
    return { ok: false, body, error: `Keep it to ${UPDATE_MAX_LENGTH.toLocaleString("en-US")} characters.` };
  }
  return { ok: true, body, error: "" };
}

export function normalizeUpdateRow(row) {
  if (!isObject(row)) return null;
  return {
    id: row.id || "",
    subcommittee: String(row.subcommittee || ""),
    month: String(row.month || "").slice(0, 10),
    body: String(row.body || ""),
    authorId: row.author_id || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || row.created_at || "",
  };
}

// { rows, error, missing, forbidden }; rows are normalized, newest month first.
export async function loadUpdates(supabase, subcommittee, months) {
  const keys = (months || []).filter(isDateKey);
  if (!supabase || !subcommittee || !keys.length) {
    return { rows: [], error: null, missing: !supabase, forbidden: false };
  }
  const { data, error } = await supabase
    .from(UPDATES_TABLE)
    .select(UPDATE_COLUMNS)
    .eq("subcommittee", subcommittee)
    .in("month", keys)
    .order("month", { ascending: false });
  if (error) {
    return { rows: [], error, missing: isMissingError(error), forbidden: isForbiddenError(error) };
  }
  return { rows: (data || []).map(normalizeUpdateRow).filter(Boolean), error: null, missing: false, forbidden: false };
}

// Upsert on (subcommittee, month). { row, error }.
export async function saveUpdate(supabase, { subcommittee, month, body }) {
  const check = validateUpdateBody(body);
  if (!check.ok) return { row: null, error: { message: check.error, code: "client" } };
  if (!supabase) return { row: null, error: { message: "Not connected." } };
  const { data, error } = await supabase
    .from(UPDATES_TABLE)
    .upsert({ subcommittee, month, body: check.body }, { onConflict: "subcommittee,month" })
    .select(UPDATE_COLUMNS)
    .single();
  if (error) return { row: null, error };
  return { row: normalizeUpdateRow(data), error: null };
}

// ── Next up (fundraising_attention) ────────────────────────────

export function normalizeAttentionItem(raw) {
  if (!isObject(raw)) return null;
  const kind = String(raw.kind || "").trim();
  if (!kind) return null;
  const target = isObject(raw.target) ? raw.target : {};
  const count = raw.count === null || raw.count === undefined || raw.count === "" ? null : Number(raw.count);
  return {
    kind,
    subcommittee: SUBCOMMITTEE_IDS.includes(raw.subcommittee) ? raw.subcommittee : null,
    count: Number.isFinite(count) ? count : null,
    title: String(raw.title || "").trim(),
    detail: String(raw.detail || "").trim(),
    dueOn: isDateKey(String(raw.due_on || "").slice(0, 10)) ? String(raw.due_on).slice(0, 10) : "",
    target: {
      tab: String(target.tab || "").trim(),
      subtab: String(target.subtab || "").trim(),
      id: target.id ? String(target.id) : "",
    },
  };
}

export function normalizeAttention(raw) {
  if (!isObject(raw) || raw.ok === false) {
    return { ok: false, reason: isObject(raw) ? String(raw.reason || "forbidden") : "invalid", today: "", items: [] };
  }
  return {
    ok: true,
    reason: "",
    today: isDateKey(raw.today) ? raw.today : "",
    generatedAt: raw.generated_at || "",
    items: (Array.isArray(raw.items) ? raw.items : []).map(normalizeAttentionItem).filter(Boolean),
  };
}

// { data, error, missing, forbidden }
export async function loadAttention(supabase) {
  if (!supabase) return { data: null, error: null, missing: true, forbidden: false };
  const { data, error } = await supabase.rpc(ATTENTION_RPC, { p_tz: STUDIO_TIME_ZONE });
  if (error) return { data: null, error, missing: isMissingError(error), forbidden: isForbiddenError(error) };
  const attention = normalizeAttention(data);
  if (!attention.ok) return { data: null, error: null, missing: false, forbidden: true };
  return { data: attention, error: null, missing: false, forbidden: false };
}

// The FundraisingView sub-tab id for a target: "pipeline" under "grants" is
// "grants-pipeline". Already-prefixed ids pass through. "" when the target
// names no sub-tab.
export function targetSubTabId(target) {
  const tab = String(target?.tab || "").trim();
  const sub = String(target?.subtab || "").trim();
  if (!tab || !sub) return "";
  return sub.startsWith(`${tab}-`) ? sub : `${tab}-${sub}`;
}

// One subcommittee's Next up lines, in the RPC's order. Overdue grant next
// steps fold into one "group" line (placed where the first of them was) once
// there are GROUP_OVERDUE_GRANTS_FROM or more of them.
//
// Line: { key, kind, title, detail, dueOn, overdue, target, children? }
export function attentionLines(items, subcommitteeId, today = chicagoToday()) {
  const mine = (items || []).filter((item) => item && item.subcommittee === subcommitteeId);
  const toLine = (item, index) => ({
    key: `${item.kind}|${item.target.id || item.subcommittee || ""}|${index}`,
    kind: item.kind,
    title: item.title,
    detail: item.detail,
    dueOn: item.dueOn,
    overdue: Boolean(item.dueOn) && item.dueOn < today,
    count: item.count,
    target: item.target,
  });
  const lines = mine.map(toLine);
  const overdueGrants = lines.filter((line) => line.kind === "grant_deadline" && line.overdue);
  if (overdueGrants.length < GROUP_OVERDUE_GRANTS_FROM) return lines;

  const oldest = overdueGrants.reduce((min, line) => (line.dueOn < min ? line.dueOn : min), overdueGrants[0].dueOn);
  const group = {
    key: "grant_deadline|overdue-group",
    kind: "grant_deadline_group",
    title: `${overdueGrants.length} grant next steps are overdue`,
    detail: oldest ? `The oldest was due ${formatDateOnlyLabel(oldest)}.` : "",
    dueOn: oldest,
    overdue: true,
    count: overdueGrants.length,
    target: { tab: "grants", subtab: "pipeline", id: "" },
    children: overdueGrants,
  };
  const result = [];
  let placed = false;
  for (const line of lines) {
    if (line.kind === "grant_deadline" && line.overdue) {
      if (!placed) {
        result.push(group);
        placed = true;
      }
      continue;
    }
    result.push(line);
  }
  return result;
}

// "Was due Jul 29", "Due today", "Due Dec 1" (year only when not this year).
export function dueLabel(dueOn, today = chicagoToday()) {
  if (!isDateKey(dueOn)) return "";
  const full = formatDateOnlyLabel(dueOn);
  const label = dueOn.slice(0, 4) === String(today).slice(0, 4) ? full.replace(/, \d{4}$/, "") : full;
  if (dueOn === today) return "Due today";
  return dueOn < today ? `Was due ${label}` : `Due ${label}`;
}

// ── Realtime ────────────────────────────────────────────────────

// One channel listening to every change on the given public tables (with an
// optional PostgREST filter per table). Returns an unsubscribe function.
export function subscribeTables(supabase, tables, onChange) {
  if (!supabase?.channel || !(tables || []).length) return () => {};
  let channel = supabase.channel(`fundraising-followups-${Math.random().toString(36).slice(2, 10)}`);
  for (const entry of tables) {
    const spec = typeof entry === "string" ? { table: entry } : entry;
    const options = { event: "*", schema: "public", table: spec.table };
    if (spec.filter) options.filter = spec.filter;
    channel = channel.on("postgres_changes", options, (payload) => onChange?.(payload));
  }
  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
