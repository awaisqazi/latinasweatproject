// Thank-you tracker (Fundraising > Donor Engagement > Thank-yous).
//
// Reads public.fundraising_thanks_queue(p_days, p_tz) and writes through
// public.fundraising_mark_thanked(p_payment_ids, p_method, p_note); un-marking
// deletes the row from fundraising_payment_thanks. Contract:
// docs/fundraising-live/04-attention-thanks-updates.md, section 1. Donor names
// and emails here are staff-only data and never leave the admin dashboard.
//
// normalizeThanksQueue() is the one place that knows the RPC's field names;
// the components only see the camelCase shape below.

import { STUDIO_TIME_ZONE } from "./timeclock.js";

export const THANKS_QUEUE_RPC = "fundraising_thanks_queue";
export const MARK_THANKED_RPC = "fundraising_mark_thanked";
export const THANKS_TABLE = "fundraising_payment_thanks";
export const THANKS_WINDOW_DAYS = 60;
export const OVERDUE_AFTER_DAYS = 7;
// The tracker starts with every old gift unmarked; this is the "start from a
// workable list" cut-off for the one-time bulk mark.
export const BULK_OLDER_THAN_DAYS = 7;
export const BULK_NOTE = "Marked in bulk when the tracker started (older than a week).";

// The methods the backend accepts, in the order the picker shows them.
export const THANK_METHODS = [
  { value: "email", label: "Email" },
  { value: "call", label: "Call" },
  { value: "text", label: "Text" },
  { value: "note", label: "Note" },
  { value: "in_person", label: "In person" },
];

export const THANKS_FILTERS = [
  { id: "all", label: "All" },
  { id: "overdue", label: "Overdue" },
  { id: "mine", label: "Mine" },
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function intOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function textOrEmpty(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

export function normalizeThanksItem(raw) {
  if (!isObject(raw)) return null;
  const paymentId = textOrEmpty(raw.payment_id ?? raw.paymentId);
  if (!paymentId) return null;
  const daysWaiting = Math.max(0, intOrNull(raw.days_waiting ?? raw.daysWaiting) ?? 0);
  const overdueRaw = raw.overdue;
  return {
    paymentId,
    createdAt: textOrEmpty(raw.created_at ?? raw.createdAt),
    amountCents: intOrNull(raw.amount_cents ?? raw.amountCents) ?? 0,
    name: textOrEmpty(raw.name),
    email: textOrEmpty(raw.email).toLowerCase(),
    campaignTitle: textOrEmpty(raw.campaign_title ?? raw.campaignTitle),
    category: textOrEmpty(raw.category),
    daysWaiting,
    overdue: typeof overdueRaw === "boolean" ? overdueRaw : daysWaiting > OVERDUE_AFTER_DAYS,
    donorGiftCount: intOrNull(raw.donor_gift_count ?? raw.donorGiftCount),
    donorLifetimeCents: intOrNull(raw.donor_lifetime_cents ?? raw.donorLifetimeCents),
    ownerId: textOrEmpty(raw.owner_id ?? raw.ownerId),
  };
}

// { ok, reason, windowDays, waitingCount, overdueCount, thankedLast30Days, items }
export function normalizeThanksQueue(raw) {
  if (!isObject(raw)) {
    return { ok: false, reason: "invalid", windowDays: THANKS_WINDOW_DAYS, waitingCount: 0, overdueCount: 0, thankedLast30Days: 0, items: [] };
  }
  if (raw.ok === false) {
    return { ok: false, reason: textOrEmpty(raw.reason) || "forbidden", windowDays: THANKS_WINDOW_DAYS, waitingCount: 0, overdueCount: 0, thankedLast30Days: 0, items: [] };
  }
  const items = (Array.isArray(raw.items) ? raw.items : []).map(normalizeThanksItem).filter(Boolean);
  const waiting = intOrNull(raw.waiting_count ?? raw.waitingCount);
  const overdue = intOrNull(raw.overdue_count ?? raw.overdueCount);
  return {
    ok: true,
    reason: "",
    windowDays: intOrNull(raw.window_days ?? raw.windowDays) ?? THANKS_WINDOW_DAYS,
    waitingCount: waiting ?? items.length,
    overdueCount: overdue ?? items.filter((item) => item.overdue).length,
    thankedLast30Days: intOrNull(raw.thanked_last_30_days ?? raw.thankedLast30Days) ?? 0,
    items,
  };
}

// PostgREST answers PGRST202 for an unknown function, 42883 for a signature
// mismatch, PGRST205 / 42P01 for an unknown table.
export function isMissingError(error) {
  if (!error) return false;
  if (["PGRST202", "42883", "PGRST205", "42P01"].includes(error.code)) return true;
  if (Number(error.status) === 404) return true;
  return /could not find the (function|table)|does not exist/i.test(String(error.message || ""));
}

export function isForbiddenError(error) {
  return Boolean(error) && (error.code === "42501" || Number(error.status) === 403);
}

// Gifts still waiting once the ids in `hidden` (marked here, not yet
// reflected by a reload) are taken out, plus any `restored` items (un-marked
// here, not yet back from a reload). Newest first, like the RPC.
export function visibleThanks(items, hidden, restored = []) {
  const hiddenSet = hidden instanceof Set ? hidden : new Set(hidden || []);
  const list = (items || []).filter((item) => !hiddenSet.has(item.paymentId));
  const present = new Set(list.map((item) => item.paymentId));
  for (const item of restored || []) {
    if (item && !present.has(item.paymentId) && !hiddenSet.has(item.paymentId)) {
      list.push(item);
      present.add(item.paymentId);
    }
  }
  return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// The header counts, adjusted for marks and undos made here since the last
// load, so the numbers move the moment a button is tapped.
export function adjustedThanksCounts(queue, hidden, restored = []) {
  const items = queue?.items || [];
  const hiddenSet = hidden instanceof Set ? hidden : new Set(hidden || []);
  const loadedIds = new Set(items.map((item) => item.paymentId));
  const hiddenLoaded = items.filter((item) => hiddenSet.has(item.paymentId));
  const back = (restored || []).filter((item) => item && !loadedIds.has(item.paymentId) && !hiddenSet.has(item.paymentId));
  const waiting = Math.max(0, (queue?.waitingCount || 0) - hiddenLoaded.length + back.length);
  const overdue = Math.max(
    0,
    (queue?.overdueCount || 0) -
      hiddenLoaded.filter((item) => item.overdue).length +
      back.filter((item) => item.overdue).length,
  );
  const thanked = Math.max(0, (queue?.thankedLast30Days || 0) + hiddenLoaded.length - back.length);
  return { waiting, overdue, thanked };
}

export function filterThanks(items, filter, profileId = "") {
  if (filter === "overdue") return (items || []).filter((item) => item.overdue);
  if (filter === "mine") {
    if (!profileId) return [];
    return (items || []).filter((item) => item.ownerId === profileId);
  }
  return items || [];
}

export function olderThan(items, days = BULK_OLDER_THAN_DAYS) {
  return (items || []).filter((item) => item.daysWaiting > days);
}

export function waitedLabel(days) {
  const n = Math.max(0, Number(days) || 0);
  if (n === 0) return "Today";
  if (n === 1) return "1 day";
  return `${n.toLocaleString("en-US")} days`;
}

export function methodLabel(value) {
  return THANK_METHODS.find((method) => method.value === value)?.label || "";
}

// ── Loaders and writes ──────────────────────────────────────────

// Always resolves to { data, error, missing, forbidden }.
export async function loadThanksQueue(supabase, days = THANKS_WINDOW_DAYS) {
  if (!supabase) return { data: null, error: null, missing: true, forbidden: false };
  const { data, error } = await supabase.rpc(THANKS_QUEUE_RPC, { p_days: days, p_tz: STUDIO_TIME_ZONE });
  if (error) {
    return { data: null, error, missing: isMissingError(error), forbidden: isForbiddenError(error) };
  }
  const queue = normalizeThanksQueue(data);
  if (!queue.ok) return { data: null, error: null, missing: false, forbidden: true };
  return { data: queue, error: null, missing: false, forbidden: false };
}

// { count, error }: count is how many were newly marked.
export async function markThanked(supabase, paymentIds, method = null, note = null) {
  const ids = [...new Set((paymentIds || []).filter(Boolean))];
  if (!supabase || !ids.length) return { count: 0, error: null };
  const validMethod = THANK_METHODS.some((item) => item.value === method) ? method : null;
  const { data, error } = await supabase.rpc(MARK_THANKED_RPC, {
    p_payment_ids: ids,
    p_method: validMethod,
    p_note: note ? String(note).slice(0, 500) : null,
  });
  if (error) return { count: 0, error };
  return { count: Number(data) || 0, error: null };
}

export async function unmarkThanked(supabase, paymentIds) {
  const ids = [...new Set((paymentIds || []).filter(Boolean))];
  if (!supabase || !ids.length) return { error: null };
  const { error } = await supabase.from(THANKS_TABLE).delete().in("payment_id", ids);
  return { error: error || null };
}

export async function setThanksMethod(supabase, paymentIds, method) {
  const ids = [...new Set((paymentIds || []).filter(Boolean))];
  if (!supabase || !ids.length) return { error: null };
  const value = THANK_METHODS.some((item) => item.value === method) ? method : null;
  const { error } = await supabase.from(THANKS_TABLE).update({ method: value }).in("payment_id", ids);
  return { error: error || null };
}
