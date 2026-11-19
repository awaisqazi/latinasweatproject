// Live fundraising view (Fundraising module, Overview tab).
//
// Reads public.fundraising_live(p_tz), which aggregates the Zeffy mirror
// (zeffy_payments / zeffy_campaigns). Contract:
// docs/fundraising-live/01-backend-contract.md. Money is integer cents; a
// gift counts when it succeeded, net of refunds. All dates are read on the
// America/Chicago clock. Donor names and emails here are staff-only data and
// never leave the admin dashboard.
//
// normalizeLive() is the one place that knows the RPC's field names. If the
// backend renames or drops a field, fix the alias lists below; the
// components only ever see the normalized, camelCase shape.

import { getSetting, setSetting } from "./appSettings.js";
import { PROSPECT_STAGES } from "./fundraising.js";
import {
  STUDIO_TIME_ZONE,
  chicagoToday,
  formatChicagoDate,
} from "./timeclock.js";

export const LIVE_RPC = "fundraising_live";
export const GOALS_SETTING_KEY = "fundraising_goals";
export const LIVE_POLL_MS = 60 * 1000;
export const LIVE_REALTIME_DEBOUNCE_MS = 1500;
export const MONTHS_SHOWN = 13;

// ── Small coercers ──────────────────────────────────────────────

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pick(source, keys) {
  if (!isObject(source)) return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function has(source, keys) {
  return pick(source, keys) !== undefined;
}

// Integer cents, or null when the value is missing or not a number. bigint
// columns can arrive as strings.
function centsOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function intOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function text(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function list(source, keys) {
  const value = pick(source, keys);
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function fullName(row) {
  const direct = text(pick(row, ["name", "donor_name", "display_name", "buyer_name", "full_name"]));
  if (direct) return direct;
  return [
    text(pick(row, ["first_name", "buyer_first_name"])),
    text(pick(row, ["last_name", "buyer_last_name"])),
  ]
    .filter(Boolean)
    .join(" ");
}

function emailOf(row) {
  return text(pick(row, ["email", "buyer_email", "donor_email"])).toLowerCase();
}

// Links are rendered as hrefs, so only plain https URLs get through.
export function safeHttpsUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

// "2026-11", "2026-11-01", "2026-11-01T05:00:00+00:00" -> "2026-11".
export function monthKey(value) {
  const match = /^(\d{4})-(\d{2})/.exec(text(value));
  return match ? `${match[1]}-${match[2]}` : "";
}

// ── Normalizer ──────────────────────────────────────────────────

const AMOUNT_KEYS = ["amount_cents", "net_cents", "cents", "total_cents", "raised_cents"];
const COUNT_KEYS = ["gift_count", "gifts", "count", "payment_count", "payments"];

const TOTAL_ALIASES = {
  today: ["today"],
  last7Days: ["last_7_days", "last7_days", "last_7d", "week"],
  monthToDate: ["month_to_date", "mtd", "this_month"],
  yearToDate: ["year_to_date", "ytd", "this_year"],
  priorYearSamePeriod: [
    "prior_year_same_period",
    "prior_ytd",
    "last_year_same_period",
    "prior_year_to_date",
  ],
  priorYearTotal: ["prior_year_total", "last_year_total", "prior_year"],
  last12Months: ["last_12_months", "last12_months", "trailing_12_months", "ttm"],
};

// A total is { amountCents, giftCount }, or null when the RPC did not send it
// (the UI shows "n/a" instead of a misleading $0).
function normalizeTotal(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "string") {
    const amountCents = centsOrNull(value);
    return amountCents === null ? null : { amountCents, giftCount: null };
  }
  if (!isObject(value)) return null;
  const amountCents = centsOrNull(pick(value, AMOUNT_KEYS));
  if (amountCents === null) return null;
  return { amountCents, giftCount: intOrNull(pick(value, COUNT_KEYS)) };
}

function normalizeMonth(row) {
  return {
    month: monthKey(pick(row, ["month", "month_start", "period", "start"])),
    amountCents: centsOrNull(pick(row, AMOUNT_KEYS)) ?? 0,
    giftCount: intOrNull(pick(row, COUNT_KEYS)) ?? 0,
  };
}

function normalizeCampaign(row) {
  const goal = centsOrNull(pick(row, ["goal_cents", "target_cents", "goal"]));
  return {
    id: text(pick(row, ["id", "campaign_id"])),
    title: text(pick(row, ["title", "name", "campaign_title"])) || "Untitled campaign",
    url: safeHttpsUrl(pick(row, ["url", "zeffy_url", "link"])),
    category: text(pick(row, ["category", "campaign_category"])),
    type: text(pick(row, ["type"])),
    status: text(pick(row, ["status"])),
    goalCents: goal && goal > 0 ? goal : null,
    raisedCents: centsOrNull(pick(row, ["raised_cents", "total_cents", "volume_cents", "amount_cents"])) ?? 0,
    raisedYtdCents: centsOrNull(pick(row, ["raised_ytd_cents", "ytd_cents", "year_to_date_cents"])) ?? 0,
    giftsYtd: intOrNull(pick(row, ["gifts_ytd", "gift_count_ytd", "ytd_gift_count"])) ?? 0,
    lastGiftAt: text(pick(row, ["last_gift_at", "last_payment_at", "last_gift"])),
  };
}

function normalizeCategory(row) {
  return {
    category: text(pick(row, ["category", "campaign_category", "name"])) || "other",
    amountCents: centsOrNull(pick(row, AMOUNT_KEYS)) ?? 0,
    giftCount: intOrNull(pick(row, COUNT_KEYS)) ?? 0,
  };
}

function normalizeGift(row, index) {
  return {
    id: text(pick(row, ["id", "payment_id"])) || `gift-${index}`,
    createdAt: text(pick(row, ["created_at", "paid_at", "date"])),
    amountCents: centsOrNull(pick(row, AMOUNT_KEYS)) ?? 0,
    name: fullName(row),
    email: emailOf(row),
    campaignTitle: text(pick(row, ["campaign_title", "campaign", "title"])),
    campaignId: text(pick(row, ["campaign_id"])),
    category: text(pick(row, ["category", "campaign_category"])).toLowerCase(),
  };
}

function normalizeLapsed(row) {
  return {
    email: emailOf(row),
    name: fullName(row),
    lastYearCents: centsOrNull(pick(row, ["last_year_cents", "prior_year_cents", "amount_cents"])) ?? 0,
    lastGiftAt: text(pick(row, ["last_gift_at", "last_payment_at", "last_gift"])),
    lifetimeCents: centsOrNull(pick(row, ["lifetime_cents", "total_cents"])),
  };
}

function normalizeTopDonor(row) {
  return {
    email: emailOf(row),
    name: fullName(row),
    amountCents:
      centsOrNull(pick(row, ["ytd_cents", "amount_cents", "total_cents", "net_cents"])) ?? 0,
    giftCount: intOrNull(pick(row, COUNT_KEYS)),
    lastGiftAt: text(pick(row, ["last_gift_at", "last_payment_at"])),
    lifetimeCents: centsOrNull(pick(row, ["lifetime_cents", "total_cents"])),
  };
}

const DONOR_ALIASES = {
  donorsYtd: ["donors_ytd", "donor_count_ytd", "unique_donors_ytd"],
  newDonorsYtd: ["new_donors_ytd", "new_ytd"],
  returningDonorsYtd: ["returning_donors_ytd", "returning_ytd"],
  repeatDonorsYtd: ["repeat_donors_ytd", "repeat_ytd"],
  lapsedCount: ["lapsed_count", "lapsed_donors", "lapsed_total"],
};

// Takes whatever the RPC returned and always hands back the full shape.
export function normalizeLive(raw) {
  let source = raw;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }
  if (Array.isArray(source)) source = source[0];
  if (isObject(source) && isObject(source[LIVE_RPC])) source = source[LIVE_RPC];
  if (!isObject(source)) source = {};

  const syncSource = isObject(source.sync) ? source.sync : {};
  const sync = {
    reconcileLastRunAt: text(pick(syncSource, ["reconcile_last_run_at", "last_run_at"])),
    campaignsLastRunAt: text(pick(syncSource, ["campaigns_last_run_at"])),
    backfillDone: syncSource.backfill_done === undefined ? null : Boolean(syncSource.backfill_done),
    contactsDone: syncSource.contacts_done === undefined ? null : Boolean(syncSource.contacts_done),
    lastPaymentSyncedAt: text(pick(syncSource, ["last_payment_synced_at"])),
  };

  const totalsSource = isObject(source.totals) ? source.totals : source;
  const totals = {};
  for (const [key, aliases] of Object.entries(TOTAL_ALIASES)) {
    totals[key] = normalizeTotal(pick(totalsSource, aliases));
  }

  const donorsSource = isObject(source.donors) ? source.donors : source;
  const donors = {};
  for (const [key, aliases] of Object.entries(DONOR_ALIASES)) {
    donors[key] = intOrNull(pick(donorsSource, aliases));
  }

  const recentKeys = ["recent", "recent_gifts", "recent_payments"];
  const lapsedKeys = ["lapsed", "lapsed_donors_list", "lapsed_list"];
  const topKeys = ["top_donors_ytd", "top_donors", "top_ytd"];
  const categoryKeys = ["by_category_ytd", "categories_ytd", "by_category"];

  return {
    // ok is false only when the RPC says so ({ok: false, reason: "forbidden"}).
    ok: source.ok !== false,
    reason: text(source.reason),
    tz: text(source.tz) || STUDIO_TIME_ZONE,
    today: /^\d{4}-\d{2}-\d{2}$/.test(text(source.today)) ? text(source.today) : "",
    generatedAt: text(source.generated_at),
    legacyUsedBefore: text(source.legacy_used_before),
    sync,
    syncedAt:
      sync.reconcileLastRunAt ||
      text(pick(source, ["synced_at", "last_synced_at", "generated_at"])),
    historyFrom: text(pick(source, ["history_from", "data_from", "first_payment_at"])),
    totals,
    monthly: list(source, ["monthly", "months", "by_month"]).map(normalizeMonth).filter((row) => row.month),
    campaigns: list(source, ["campaigns"]).map(normalizeCampaign),
    byCategoryYtd: list(source, categoryKeys).map(normalizeCategory),
    hasCategories: has(source, categoryKeys),
    donors,
    recent: list(source, recentKeys).map(normalizeGift),
    hasRecent: has(source, recentKeys),
    lapsed: list(source, lapsedKeys).map(normalizeLapsed).filter((row) => row.email || row.name),
    hasLapsed: has(source, lapsedKeys),
    topDonorsYtd: list(source, topKeys).map(normalizeTopDonor).filter((row) => row.email || row.name),
    hasTopDonors: has(source, topKeys),
  };
}

// PostgREST answers PGRST202 for an unknown function; Postgres answers 42883
// when the function exists but the signature does not match.
export function isMissingRpcError(error) {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  if (Number(error.status) === 404) return true;
  return /could not find the function|function .* does not exist/i.test(String(error.message || ""));
}

// ── Money ───────────────────────────────────────────────────────

// Headline numbers in whole dollars ("$12,480"); feeds keep the cents.
export function formatCentsWhole(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(Number(cents || 0) / 100));
}

// "$1.2K", "$1M" for chart labels where space is tight.
export function formatCentsCompact(cents) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(cents || 0) / 100);
}

// Whole percent change, or null when there is nothing to compare against.
export function percentChange(current, previous) {
  const now = Number(current);
  const before = Number(previous);
  if (!Number.isFinite(now) || !Number.isFinite(before) || before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

// ── Freshness ───────────────────────────────────────────────────

export function syncedAgoLabel(value, now = Date.now()) {
  const time = value ? new Date(value).getTime() : Number.NaN;
  if (!Number.isFinite(time)) return "";
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// The reconcile runs every 5 minutes; older than this means it is failing.
export const STALE_SYNC_MINUTES = 20;

export function isStale(value, now = Date.now()) {
  const time = value ? new Date(value).getTime() : Number.NaN;
  if (!Number.isFinite(time)) return true;
  return now - time > STALE_SYNC_MINUTES * 60000;
}

// The first Chicago date the live data covers ("2025-07-18"), or "".
export function historyStartDate(live) {
  const start = live?.historyFrom ? formatChicagoDate(live.historyFrom) : "";
  return start || (/^\d{4}-\d{2}-\d{2}$/.test(live?.legacyUsedBefore || "") ? live.legacyUsedBefore : "");
}

// True when last year's comparison figures start after Jan 1 of last year.
export function priorYearIsPartial(live, today = chicagoToday()) {
  const start = historyStartDate(live);
  if (!start) return false;
  return start > `${Number(today.slice(0, 4)) - 1}-01-01`;
}

// Plain sentence for the warning banner, or "" when the sync looks healthy.
export function syncHealthWarning(live, now = Date.now()) {
  if (!live) return "";
  if (isStale(live.syncedAt, now)) {
    const ago = syncedAgoLabel(live.syncedAt, now);
    return ago
      ? `The Zeffy sync last ran ${ago}. It normally runs every 5 minutes, so the newest payments may be missing.`
      : "The Zeffy sync has not reported a run, so the newest payments may be missing.";
  }
  if (live.sync?.backfillDone === false) {
    return "Zeffy history is still loading, so older totals may be low for now.";
  }
  return "";
}

// "Sync now" result in this view's words (runZeffySync's own message is
// written for the Giving Tuesday tab). Takes { ok, raw } from runZeffySync.
export function liveSyncMessage(result) {
  const raw = result?.raw;
  if (raw?.ok === false && raw.reason === "no_api_key") {
    return { tone: "warning", message: "The Zeffy key is not set up, so nothing could sync." };
  }
  if (raw?.ok === false && raw.reason === "unauthorized") {
    return { tone: "error", message: "Your account cannot run a sync. Ask an admin for the Fundraising module." };
  }
  if (raw?.ok === true) {
    const errors = Array.isArray(raw.mirror?.errors) ? raw.mirror.errors.length : 0;
    const payments = Number(raw.mirror?.payments ?? raw.upserted ?? 0);
    if (errors) {
      return { tone: "warning", message: `Sync finished with ${errors} error${errors === 1 ? "" : "s"}. The next automatic sync will retry.` };
    }
    if (raw.partial) {
      return { tone: "warning", message: "Sync ran out of time. The next automatic sync picks up the rest." };
    }
    return { tone: "success", message: `Synced with Zeffy: ${payments.toLocaleString()} recent payment${payments === 1 ? "" : "s"} checked.` };
  }
  const detail = raw?.reason || (result?.ok === false ? "no answer" : "");
  return { tone: "error", message: `Sync failed${detail ? ` (${detail})` : ""}. The automatic sync still runs every 5 minutes.` };
}

// "1 payment", "12 gifts". Zeffy payments include tickets, shop and auction
// purchases, so "gift" is kept for donation forms, peer-to-peer and donors.
export function countLabel(count, noun = "payment") {
  const n = Number(count || 0);
  return `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`;
}

// Donation forms and peer-to-peer pages take gifts; every other Zeffy form
// (Event, Shop, Auction, Raffle, custom payments) takes payments.
export function campaignTakesGifts(campaign) {
  return /donation|peer/i.test(String(campaign?.category || ""));
}

// Two-digit year mark ("'25") for the first bar and each January.
export function monthYearMark(key, isFirst) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
  if (!match) return "";
  return isFirst || match[2] === "01" ? `'${match[1].slice(2)}` : "";
}

// ── Months ──────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(key, { withYear = false } = {}) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
  if (!match) return "";
  const name = MONTH_NAMES[Number(match[2]) - 1] || "";
  return withYear ? `${name} ${match[1]}` : name;
}

function shiftMonth(key, delta) {
  const [year, month] = key.split("-").map(Number);
  const index = year * 12 + (month - 1) + delta;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

// Exactly MONTHS_SHOWN months ending with the current Chicago month, oldest
// first, with zero months filled in so the bars never skip a month.
export function fillMonths(monthly, today = chicagoToday()) {
  const current = monthKey(today);
  const byMonth = new Map();
  for (const row of monthly || []) {
    if (!row?.month) continue;
    const prior = byMonth.get(row.month);
    byMonth.set(row.month, {
      amountCents: (prior?.amountCents || 0) + (row.amountCents || 0),
      giftCount: (prior?.giftCount || 0) + (row.giftCount || 0),
    });
  }
  const months = [];
  for (let back = MONTHS_SHOWN - 1; back >= 0; back -= 1) {
    const month = shiftMonth(current, -back);
    const row = byMonth.get(month);
    months.push({
      month,
      amountCents: row?.amountCents || 0,
      giftCount: row?.giftCount || 0,
      isCurrent: back === 0,
    });
  }
  return months;
}

// ── Goals (app_settings.fundraising_goals) ──────────────────────

// Stored as {"2027": 100000000} (cents by year). Also tolerates a wrapped
// {"goals": {...}} or {"2027": {"amount_cents": ...}}. Returns sorted
// [{ year, cents }].
export function parseGoals(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return [];
    }
  }
  if (isObject(source) && isObject(source.goals)) source = source.goals;
  if (!isObject(source)) return [];
  const goals = [];
  for (const [key, raw] of Object.entries(source)) {
    if (!/^\d{4}$/.test(key)) continue;
    const cents = centsOrNull(isObject(raw) ? pick(raw, ["amount_cents", "cents", "goal_cents"]) : raw);
    if (cents && cents > 0) goals.push({ year: Number(key), cents });
  }
  return goals.sort((a, b) => a.year - b.year);
}

// The current year's goal if there is one, otherwise the nearest future
// year's goal as "upcoming". Past-only goals show nothing.
export function pickGoal(goals, currentYear) {
  const year = Number(currentYear);
  const exact = (goals || []).find((goal) => goal.year === year);
  if (exact) return { ...exact, mode: "current" };
  const next = (goals || []).find((goal) => goal.year > year);
  return next ? { ...next, mode: "upcoming" } : null;
}

// Numbers for the goal panel. Current year: year-to-date against the goal.
// Upcoming year: the last 12 months as the baseline.
export function goalProgress(goal, totals) {
  if (!goal) return null;
  const baseline =
    goal.mode === "current" ? totals?.yearToDate?.amountCents : totals?.last12Months?.amountCents;
  if (baseline === null || baseline === undefined) {
    return { ...goal, baselineCents: null, percent: null, remainingCents: null, multiple: null };
  }
  const percent = goal.cents > 0 ? Math.floor((baseline / goal.cents) * 1000) / 10 : null;
  return {
    ...goal,
    baselineCents: baseline,
    percent,
    remainingCents: Math.max(goal.cents - baseline, 0),
    multiple: baseline > 0 ? Math.round((goal.cents / baseline) * 10) / 10 : null,
  };
}

// Returns the stored object with one year set (or removed when cents is
// null), keeping every other key as it was.
export function mergeGoal(storedValue, year, cents) {
  let base = storedValue;
  if (typeof base === "string") {
    try {
      base = JSON.parse(base);
    } catch {
      base = {};
    }
  }
  const next = isObject(base) ? { ...base } : {};
  const key = String(year);
  if (cents === null || cents === undefined) delete next[key];
  else next[key] = Math.round(Number(cents));
  return next;
}

// ── Campaigns ───────────────────────────────────────────────────

// by_category_ytd uses the payment's lower-case label (event, donation,
// shop, auction, custom, raffle). Event revenue counts tickets plus the
// auctions and raffles run at events.
export const EVENT_PAYMENT_CATEGORIES = ["event", "auction", "raffle"];

export function isEventCategory(category) {
  return EVENT_PAYMENT_CATEGORIES.includes(String(category || "").toLowerCase());
}

// Campaigns carry Zeffy's own label (Event, Auction, Raffle, DonationForm,
// PeerToPeerCampaign...). Ticketed forms also live under /ticketing/.
export function isEventCampaign(campaign) {
  return (
    /^(event|auction|raffle|lottery)/i.test(String(campaign?.category || "")) ||
    /\/ticketing\//i.test(String(campaign?.url || ""))
  );
}

// Zeffy leaves nearly every form "active", so status says little: show the
// campaigns with a gift this year, biggest year-to-date first.
export function campaignsForView(campaigns) {
  return (campaigns || [])
    .filter((campaign) => campaign.giftsYtd > 0)
    .sort(
      (a, b) =>
        b.raisedYtdCents - a.raisedYtdCents ||
        String(b.lastGiftAt || "").localeCompare(String(a.lastGiftAt || "")),
    );
}

export function campaignGoalPercent(campaign) {
  if (!campaign?.goalCents) return null;
  return Math.min(100, Math.floor((campaign.raisedCents / campaign.goalCents) * 100));
}

// ── Subcommittee scorecards ─────────────────────────────────────

// Fundraising Events: event and ticket campaigns this year.
export function eventsScorecard(live) {
  if (!live) return null;
  const eventCampaigns = live.campaigns.filter(
    (campaign) => isEventCampaign(campaign) && (campaign.giftsYtd > 0 || campaign.raisedYtdCents > 0),
  );
  const revenueCents = live.hasCategories
    ? live.byCategoryYtd
        .filter((row) => isEventCategory(row.category))
        .reduce((sum, row) => sum + row.amountCents, 0)
    : eventCampaigns.reduce((sum, campaign) => sum + campaign.raisedYtdCents, 0);
  const top = eventCampaigns
    .slice()
    .sort((a, b) => b.raisedYtdCents - a.raisedYtdCents)
    .find((campaign) => campaign.raisedYtdCents > 0);
  return {
    revenueCents,
    campaignCount: eventCampaigns.length,
    top: top ? { title: top.title, url: top.url, raisedYtdCents: top.raisedYtdCents } : null,
  };
}

// Suggested asks are free text ("$25,000", "$10K to $25K", "25k"). Reads the
// first dollar amount written; null when there is none.
export function parseAskCents(value) {
  const source = String(value || "");
  const match =
    /\$\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\b/.exec(source) ||
    /\b(\d[\d,]*(?:\.\d+)?)\s*([kKmM])\b/.exec(source);
  if (!match) return null;
  const number = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(number) || number <= 0) return null;
  const unit = (match[2] || "").toLowerCase();
  const dollars = unit === "k" ? number * 1000 : unit === "m" ? number * 1000000 : number;
  return Math.round(dollars * 100);
}

const MONTH_PATTERN =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

function validDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Every full date written in a free-text deadlines field, as yyyy-mm-dd.
// Dates without a year ("March 1 annually") are skipped on purpose.
export function parseDeadlineDates(value) {
  const source = String(value || "");
  const found = new Set();
  for (const m of source.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
    const date = validDate(m[1], m[2], m[3]);
    if (date) found.add(date);
  }
  for (const m of source.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g)) {
    const date = validDate(m[3], m[1], m[2]);
    if (date) found.add(date);
  }
  const named = new RegExp(`\\b${MONTH_PATTERN}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`, "gi");
  for (const m of source.matchAll(named)) {
    const month = MONTH_NAMES.findIndex((name) => m[1].toLowerCase().startsWith(name.toLowerCase())) + 1;
    const date = validDate(m[3], month, m[2]);
    if (date) found.add(date);
  }
  return [...found].sort();
}

// Stages still being worked toward a decision.
export const PIPELINE_STAGES = ["Research", "Outreach", "In Conversation", "Application"];

// Grant Research and Identification: the prospects pipeline.
export function grantsScorecard(prospects, today = chicagoToday()) {
  const rows = prospects || [];
  const byStage = PROSPECT_STAGES.map((stage) => {
    const inStage = rows.filter((prospect) => prospect.stage === stage);
    const asks = inStage.map((prospect) => parseAskCents(prospect.suggested_ask)).filter((cents) => cents);
    return {
      stage,
      count: inStage.length,
      askCents: asks.reduce((sum, cents) => sum + cents, 0),
      withAsk: asks.length,
    };
  });
  const pipeline = byStage.filter((row) => PIPELINE_STAGES.includes(row.stage));
  const committed = byStage.find((row) => row.stage === "Committed") || { count: 0, askCents: 0 };

  let nextDeadline = null;
  for (const prospect of rows) {
    if (prospect.stage === "Declined") continue;
    for (const date of parseDeadlineDates(prospect.deadlines)) {
      if (date < today) continue;
      if (!nextDeadline || date < nextDeadline.date) {
        nextDeadline = { date, prospectId: prospect.id, prospectName: prospect.name };
      }
    }
  }

  return {
    pipelineCount: pipeline.reduce((sum, row) => sum + row.count, 0),
    pipelineAskCents: pipeline.reduce((sum, row) => sum + row.askCents, 0),
    pipelineWithAsk: pipeline.reduce((sum, row) => sum + row.withAsk, 0),
    committedCount: committed.count,
    committedAskCents: committed.askCents,
    byStage: byStage.filter((row) => row.count > 0),
    nextDeadline,
  };
}

// Existing Donor Engagement: outreach items tallied per status, in the order
// of the statuses list passed in ([{ value, label }]).
export function countOutreachByStatus(items, statuses) {
  const counts = new Map();
  for (const item of items || []) counts.set(item.status, (counts.get(item.status) || 0) + 1);
  return (statuses || [])
    .map((status) => ({ ...status, count: counts.get(status.value) || 0 }))
    .filter((row) => row.count > 0);
}

export function ownersAssignedCount(donorProfiles) {
  return (donorProfiles || []).filter((row) => row?.owner_id).length;
}

// Membership Upskilling: people fundraising for LSP on Giving Tuesday.
export function upskillingScorecard(fundraisers, totals) {
  const active = (fundraisers || []).filter(
    (row) => row.status === "approved" || row.status === "pending",
  );
  const approvedIds = new Set(
    (fundraisers || []).filter((row) => row.status === "approved").map((row) => row.id),
  );
  const approvedTotals = (totals || []).filter(
    (row) => row.status === "approved" || approvedIds.has(row.fundraiser_id),
  );
  return {
    signedUp: active.length,
    approved: approvedIds.size,
    withGift: approvedTotals.filter((row) => Number(row.gift_count || 0) > 0).length,
    raisedCents: approvedTotals.reduce((sum, row) => sum + Number(row.raised_cents || 0), 0),
  };
}

// ── Loaders ─────────────────────────────────────────────────────

// Always resolves to { data, error, missing }: data is normalized, missing
// is true when the RPC is not deployed yet.
export async function loadLive(supabase) {
  if (!supabase) return { data: null, error: null, missing: true, forbidden: false };
  const { data, error } = await supabase.rpc(LIVE_RPC, { p_tz: STUDIO_TIME_ZONE });
  if (error) return { data: null, error, missing: isMissingRpcError(error), forbidden: false };
  const live = normalizeLive(data);
  if (!live.ok) return { data: null, error: null, missing: false, forbidden: true, reason: live.reason };
  return { data: live, error: null, missing: false, forbidden: false };
}

// { value, exists, error }. exists is false when the settings row is absent.
export async function loadGoalsSetting(supabase) {
  const { value, error } = await getSetting(supabase, GOALS_SETTING_KEY);
  return { value, exists: value !== null && value !== undefined, error };
}

export async function saveGoal(supabase, storedValue, year, cents) {
  const next = mergeGoal(storedValue, year, cents);
  const { data, error } = await setSetting(supabase, GOALS_SETTING_KEY, next);
  return { value: error ? storedValue : (data?.value ?? next), error };
}

// Outreach item statuses for the given call lists (paged past 1,000 rows).
export async function loadOutreachStatuses(supabase, campaignIds) {
  const ids = (campaignIds || []).filter(Boolean);
  if (!supabase || !ids.length) return { data: [], error: null };
  const PAGE = 1000;
  const all = [];
  for (let page = 0; page < 20; page += 1) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("fundraising_outreach_items")
      .select("id,campaign_id,status")
      .in("campaign_id", ids)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { data: all, error };
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: all, error: null };
}

// Any change to the Zeffy mirror's payments is a "refetch" signal. Its own
// channel, so the Overview can subscribe and leave without touching the
// dashboard-wide one. Returns an unsubscribe function.
export function subscribeZeffyPayments(supabase, onChange) {
  if (!supabase?.channel) return () => {};
  const channel = supabase
    .channel(`fundraising-live-${Math.random().toString(36).slice(2, 10)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "zeffy_payments" }, () => onChange?.())
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
