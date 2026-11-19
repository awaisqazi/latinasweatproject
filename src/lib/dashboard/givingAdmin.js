// Giving Tuesday admin data layer (Fundraising module, "Giving Tuesday" tab).
// Contract: docs/giving-tuesday-2026/01-backend-contract.md. Money is integer
// cents everywhere; dates are shown and typed on the America/Chicago clock.
// Donor names and emails are read here for staff only and never leave the
// admin tab.

import { instructorSlug } from "../../data/popUpShared.js";
import {
  chicagoLocalToUtcIso,
  formatChicagoDate,
  formatChicagoDateLabel,
  formatChicagoDateTimeLabel,
} from "./timeclock.js";

// The campaign this tab manages. A later year is a one-line change here.
export const GIVING_CAMPAIGN_SLUG = "giving-tuesday-2026";

export const ZEFFY_FUNDRAISER_HELPER_URL =
  "https://www.zeffy.com/en-US/peer-to-peer/lsp-giving-tuesday?openFundraiser=true";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

// Dev-only override (?givingCampaign=gt-selftest) so the tab can be pointed at
// a throwaway campaign while testing. import.meta.env.DEV is false in
// production builds, so the branch is dead code there.
export function resolveGivingCampaignSlug() {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const requested = new URLSearchParams(window.location.search).get("givingCampaign");
    if (requested && SLUG_RE.test(requested)) return requested;
  }
  return GIVING_CAMPAIGN_SLUG;
}

export const COHORTS = [
  { value: "instructor", label: "Instructor" },
  { value: "ytt-2026", label: "YTT 2026" },
  { value: "both", label: "Both" },
];

export function cohortLabel(value) {
  return COHORTS.find((cohort) => cohort.value === value)?.label || value || "";
}

export const CAMPAIGN_COLUMNS =
  "slug,title,goal_cents,threshold_cents,starts_at,ends_at,zeffy_campaign_ids,give_url,prize_label,is_public,board_open,signup_open,updated_at";

export const FUNDRAISER_COLUMNS =
  "id,campaign_slug,slug,first_name,last_name,display_name,email,phone,cohort,why,avatar_slug,show_on_board,consent_page,status,goal_cents,zeffy_campaign_id,zeffy_url,approved_at,approved_by,notes,created_at,updated_at";

export const PAYMENT_COLUMNS =
  "id,campaign_slug,fundraiser_id,source,zeffy_payment_id,amount_cents,refunded_cents,status,refund_status,paid_at,buyer_email,buyer_first_name,buyer_last_name,counts_toward_threshold,note,entered_by,created_at,updated_at";

export const TOTALS_COLUMNS =
  "fundraiser_id,campaign_slug,slug,display_name,email,status,show_on_board,goal_cents,threshold_cents,raised_cents,gift_count,eligible_cents,eligible_gift_count,self_gift_cents,flagged_cents,late_cents,reached";

export const DRAW_COLUMNS =
  "id,campaign_slug,drawn_at,drawn_by,eligible,seed,winner_fundraiser_id,note";

// ── Money ───────────────────────────────────────────────────────

export function formatCents(cents) {
  const value = Number(cents || 0);
  const whole = value % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(value / 100);
}

// "50", "50.5", "$1,250.25" -> integer cents, parsed as text so floats never
// round a cent away. null when it is not a positive amount.
export function parseDollarsToCents(text) {
  const cleaned = String(text ?? "").replace(/[$,\s]/g, "");
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return cents > 0 ? cents : null;
}

export function centsToInput(cents) {
  const value = Number(cents || 0);
  const dollars = Math.floor(value / 100);
  const rest = value % 100;
  return rest ? `${dollars}.${String(rest).padStart(2, "0")}` : String(dollars);
}

export function netCents(payment) {
  return Math.max(Number(payment?.amount_cents || 0) - Number(payment?.refunded_cents || 0), 0);
}

// A gift counts when it has cleared or is still clearing (contract section 1).
// Zeffy shows a bank transfer on the thermometer while it is 'pending', so the
// site counts it too; a transfer that fails drops out on the next sync.
export function paymentCounts(payment) {
  return payment?.status === "succeeded" || payment?.status === "pending";
}

// Zeffy status values ("succeeded", "failed", "deleted"...) in sentence case.
export function paymentStatusLabel(status) {
  const text = String(status || "unknown").replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Optimistic lock for gift edits. Offline gifts lock on updated_at like the
// rest of the portal. Zeffy gifts cannot: every sync (every 5 minutes)
// rewrites the row and bumps updated_at, so they lock on the original values
// of the staff-owned fields instead (the sync never writes counts or note,
// and only writes fundraiser_id when it finds a match, which should conflict).
export const STAFF_GIFT_FIELDS = ["fundraiser_id", "counts_toward_threshold", "note"];

export function lockGiftQuery(query, loaded) {
  if (loaded.source !== "zeffy") return query.eq("updated_at", loaded.updated_at);
  let locked = query;
  for (const field of STAFF_GIFT_FIELDS) {
    const value = loaded[field];
    locked = value === null || value === undefined ? locked.is(field, null) : locked.eq(field, value);
  }
  return locked;
}

export function isRefunded(payment) {
  return (
    Number(payment?.refunded_cents || 0) > 0 ||
    (payment?.refund_status && payment.refund_status !== "none")
  );
}

// ── Dates (America/Chicago) ─────────────────────────────────────

export { formatChicagoDate, formatChicagoDateLabel, formatChicagoDateTimeLabel };

// A typed "2026-12-01" is saved as noon on Dec 1 Central, so no zone can push
// it to the day before or after.
export function chicagoDateToIso(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""))) return null;
  return chicagoLocalToUtcIso(`${dateStr} 12:00`);
}

export function todayChicago() {
  return formatChicagoDate(new Date());
}

// ── Validation (mirrors supabase/functions/giving-signup/validate.ts) ──

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const oneLine = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export { oneLine };

export function validateFundraiserInput(input) {
  const firstName = oneLine(input.firstName);
  const lastName = oneLine(input.lastName);
  const email = String(input.email ?? "").trim().toLowerCase();
  const phone = oneLine(input.phone).slice(0, 30);
  const cohort = String(input.cohort ?? "").trim();
  const why = oneLine(input.why);

  if (!firstName || !lastName || firstName.length > 60 || lastName.length > 60) {
    return { ok: false, field: "name", message: "First and last name are required (60 characters each at most)." };
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return { ok: false, field: "email", message: "Enter a valid email address." };
  }
  if (!COHORTS.some((option) => option.value === cohort)) {
    return { ok: false, field: "cohort", message: "Pick a cohort." };
  }
  if (why.length > 160) {
    return { ok: false, field: "why", message: "The why line is 160 characters at most." };
  }
  return {
    ok: true,
    value: {
      firstName,
      lastName,
      email,
      phone,
      cohort,
      why,
      baseSlug: (instructorSlug(`${firstName} ${lastName}`) || "fundraiser").slice(0, 110),
    },
  };
}

// Same clash rule as giving_signup_submit: base, base-2, base-3...
export function nextFreeSlug(baseSlug, takenSlugs) {
  const taken = new Set(takenSlugs || []);
  let base = String(baseSlug || "");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(base)) base = "fundraiser";
  base = base.slice(0, 110);
  let slug = base;
  let n = 1;
  while (taken.has(slug)) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

// Zeffy page URLs: https on zeffy.com, trimmed, query string and fragment
// dropped. Returns { ok, value } where value is null for a blank input.
export function normalizeZeffyUrl(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { ok: true, value: null };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: "Paste the full Zeffy link, starting with https://" };
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(host === "zeffy.com" || host.endsWith(".zeffy.com"))) {
    return { ok: false, message: "The link must be an https zeffy.com page." };
  }
  if (url.username || url.password || url.port) {
    return { ok: false, message: "The link must be an https zeffy.com page." };
  }
  return { ok: true, value: `${url.origin}${url.pathname}` };
}

// ── Loaders ─────────────────────────────────────────────────────

export async function loadGivingCampaign(supabase, slug) {
  return supabase.from("giving_campaigns").select(CAMPAIGN_COLUMNS).eq("slug", slug).maybeSingle();
}

export async function loadGivingFundraisers(supabase, slug) {
  return supabase
    .from("giving_fundraisers")
    .select(FUNDRAISER_COLUMNS)
    .eq("campaign_slug", slug)
    .order("created_at", { ascending: true })
    .limit(1000);
}

export async function loadGivingTotals(supabase, slug) {
  return supabase
    .from("giving_fundraiser_totals")
    .select(TOTALS_COLUMNS)
    .eq("campaign_slug", slug)
    .limit(1000);
}

// Paged past PostgREST's 1,000-row cap.
export async function loadGivingPayments(supabase, slug) {
  const PAGE = 1000;
  const all = [];
  for (let page = 0; page < 20; page += 1) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("giving_payments")
      .select(PAYMENT_COLUMNS)
      .eq("campaign_slug", slug)
      .order("paid_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { data: all, error };
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: all, error: null };
}

export async function loadGivingDraws(supabase, slug) {
  return supabase
    .from("giving_draws")
    .select(DRAW_COLUMNS)
    .eq("campaign_slug", slug)
    .order("drawn_at", { ascending: false });
}

export async function loadLastWebhookEvent(supabase) {
  return supabase
    .from("giving_webhook_events")
    .select("id,type,outcome,received_at")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function loadPendingFundraiserCount(supabase, slug) {
  const { count, error } = await supabase
    .from("giving_fundraisers")
    .select("id", { count: "exact", head: true })
    .eq("campaign_slug", slug)
    .eq("status", "pending");
  return { count: count || 0, error };
}

export async function loadAvatarSlugs(supabase) {
  return supabase.from("giving_avatar_slugs").select("slug").limit(2000);
}

// ── Reconcile ("Sync now") ──────────────────────────────────────

// Calls the zeffy-webhook reconcile mode with the signed-in user's token
// (supabase-js attaches it). Always resolves to { ok, tone, message, raw }.
export async function runZeffySync(supabase) {
  let body = null;
  let status = 0;
  const { data, error } = await supabase.functions.invoke("zeffy-webhook?mode=reconcile", {
    body: {},
  });
  if (error) {
    status = error.context?.status || 0;
    try {
      body = await error.context?.json?.();
    } catch {
      body = null;
    }
  } else {
    body = data;
    status = 200;
  }
  return { ...describeSyncResult(body, status, error), at: new Date().toISOString() };
}

export function describeSyncResult(body, status, error) {
  if (body?.ok === false && body.reason === "no_api_key") {
    return { ok: false, tone: "warning", message: "Zeffy key not added yet. Gifts sync once the owner adds it.", raw: body };
  }
  if (body?.ok === false && body.reason === "unauthorized") {
    return { ok: false, tone: "error", message: "Your account cannot run a sync. Ask an admin for the Fundraising module.", raw: body };
  }
  if (body?.ok === true && body.note === "no_active_campaigns") {
    return { ok: true, tone: "info", message: "No campaign is linked to Zeffy yet, so there was nothing to sync.", raw: body };
  }
  if (body?.ok === true) {
    const parts = [
      `${body.fetched || 0} fetched`,
      `${body.upserted || 0} saved`,
      `${body.matched || 0} credited`,
      `${body.unmatched || 0} unassigned`,
    ];
    if (body.deleted) parts.push(`${body.deleted} removed`);
    return {
      ok: true,
      tone: body.partial ? "warning" : "success",
      message: `Sync finished: ${parts.join(", ")}.${body.partial ? " It ran out of time, the next sync picks up the rest." : ""}`,
      raw: body,
    };
  }
  const detail = body?.reason || error?.message || (status ? `HTTP ${status}` : "no answer");
  return { ok: false, tone: "error", message: `Sync failed (${detail}).`, raw: body };
}
