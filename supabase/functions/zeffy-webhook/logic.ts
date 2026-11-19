// Pure Zeffy sync logic: signature check, gift and refund netting, campaign
// and fundraiser attribution. No I/O here, so every rule unit-tests.

export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  // Compare against itself on a length mismatch so timing does not leak length early.
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function parseSignatureHeader(header: string): { t: string; v1: string[] } | null {
  if (!header) return null;
  let t = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "t") t = value;
    else if (key === "v1") v1.push(value);
  }
  if (!t || !v1.length) return null;
  return { t, v1 };
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

export type SignatureVerdict = { ok: true } | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };

// Verifies `Zeffy-Signature: t=<unix>,v1=<hex>` against the RAW body string.
export async function verifyZeffySignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  tolerance = SIGNATURE_TOLERANCE_SECONDS,
): Promise<SignatureVerdict> {
  if (!header) return { ok: false, reason: "missing" };
  const parsed = parseSignatureHeader(header);
  if (!parsed || !/^\d+$/.test(parsed.t)) return { ok: false, reason: "malformed" };
  const ts = Number(parsed.t);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > tolerance) return { ok: false, reason: "stale" };
  const expected = hexToBytes(await hmacHex(secret, `${parsed.t}.${rawBody}`))!;
  for (const candidate of parsed.v1) {
    const got = hexToBytes(candidate);
    if (got && timingSafeEqual(expected, got)) return { ok: true };
  }
  return { ok: false, reason: "mismatch" };
}

// ── Money ────────────────────────────────────────────────────────

export type ZeffyRefund = { amount?: number; status?: string };
export type ZeffyItem = { type?: string; amount?: number };
export type ZeffyPayment = {
  id: string;
  object?: string;
  created?: number;
  amount?: number;
  status?: string;
  refund_status?: string;
  refunds?: ZeffyRefund[];
  dispute?: { status?: string; amount?: number } | null;
  buyer?: { email?: string | null; first_name?: string | null; last_name?: string | null } | null;
  campaign_id?: string | null;
  campaign_category?: string | null;
  parent_campaign_id?: string | null;
  team_id?: string | null;
  items?: ZeffyItem[];
  [k: string]: unknown;
};

const GIFT_ITEM_TYPES = new Set(["donation", "additional_donation", "ticket"]);
const cents = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

// The gift itself, never the optional Zeffy tip. The spec documents `amount`
// as "Amount in cents" and has no tip field, so whether `amount` carries the
// tip is not stated. Line items are the gift (the tip is never an item), so
// when items are present we count their sum, capped at `amount`.
export function giftCents(p: ZeffyPayment): number {
  const amount = cents(p.amount);
  const items = Array.isArray(p.items) ? p.items : [];
  const itemSum = items
    .filter((it) => GIFT_ITEM_TYPES.has(String(it?.type || "")))
    .reduce((sum, it) => sum + cents(it?.amount), 0);
  if (itemSum > 0) return amount > 0 ? Math.min(itemSum, amount) : itemSum;
  return amount;
}

// Refunded part of the gift: a full refund or a lost dispute refunds all of
// it; otherwise succeeded refunds add up, capped at the gift.
export function refundedCents(p: ZeffyPayment, gift = giftCents(p)): number {
  if (p.refund_status === "full") return gift;
  if (p.dispute && p.dispute.status === "lost") return gift;
  const refunds = Array.isArray(p.refunds) ? p.refunds : [];
  const sum = refunds
    .filter((r) => (r?.status || "succeeded") === "succeeded")
    .reduce((s, r) => s + cents(r?.amount), 0);
  return Math.min(sum, gift);
}

// ── Attribution ──────────────────────────────────────────────────

export type GivingCampaign = { slug: string; zeffy_campaign_ids: string[] };
export type GivingFundraiser = {
  id: string;
  campaign_slug: string;
  zeffy_campaign_id: string | null;
  zeffy_url: string | null;
};

// The same page has several spellings: the API writes
// https://www.zeffy.com/peer-to-peer/<slug>, the browser shows
// https://www.zeffy.com/en-US/peer-to-peer/<slug>. The locale segment
// (en-US, fr-CA, es...) is dropped so both compare equal.
export function normalizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  let s = String(url).trim().toLowerCase();
  const cut = s.search(/[?#]/);
  if (cut >= 0) s = s.slice(0, cut);
  while (s.endsWith("/")) s = s.slice(0, -1);
  s = s.replace(/^(https?:\/\/[^/]+)\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/, "$1");
  return s;
}

export function findCampaign(p: ZeffyPayment, campaigns: GivingCampaign[]): GivingCampaign | null {
  const ids = [p.parent_campaign_id, p.campaign_id].filter((x): x is string => !!x);
  if (!ids.length) return null;
  for (const id of ids) {
    const hit = campaigns.find((c) => (c.zeffy_campaign_ids || []).includes(id));
    if (hit) return hit;
  }
  return null;
}

export type Attribution =
  | { kind: "ignored" }
  | { kind: "main"; campaign: GivingCampaign }
  | { kind: "fundraiser"; campaign: GivingCampaign; fundraiser: GivingFundraiser }
  | { kind: "unknown_page"; campaign: GivingCampaign; campaignId: string };

export function attribute(
  p: ZeffyPayment,
  campaigns: GivingCampaign[],
  fundraisers: GivingFundraiser[],
): Attribution {
  const cid = p.campaign_id || "";
  // Zeffy's API leaves parent_campaign_id empty on participant pages, so a
  // gift on one may not point back at the main campaign: fall back to the
  // page id stored on a fundraiser.
  let campaign = findCampaign(p, campaigns);
  if (!campaign && cid) {
    const owner = fundraisers.find((f) => f.zeffy_campaign_id === cid);
    if (owner) campaign = campaigns.find((c) => c.slug === owner.campaign_slug) || null;
  }
  if (!campaign) return { kind: "ignored" };
  if (!cid || campaign.zeffy_campaign_ids.includes(cid)) return { kind: "main", campaign };
  const fr = fundraisers.find((f) => f.campaign_slug === campaign.slug && f.zeffy_campaign_id === cid);
  if (fr) return { kind: "fundraiser", campaign, fundraiser: fr };
  return { kind: "unknown_page", campaign, campaignId: cid };
}

// Match a participant page's public URL to a fundraiser's stored zeffy_url.
export function matchFundraiserByUrl(
  pageUrl: string | null | undefined,
  campaignSlug: string,
  fundraisers: GivingFundraiser[],
): GivingFundraiser | null {
  const target = normalizeUrl(pageUrl);
  if (!target) return null;
  return fundraisers.find((f) =>
    f.campaign_slug === campaignSlug && !f.zeffy_campaign_id && normalizeUrl(f.zeffy_url) === target
  ) || fundraisers.find((f) => f.campaign_slug === campaignSlug && normalizeUrl(f.zeffy_url) === target) || null;
}

// The row handed to giving_upsert_zeffy_payment.
export function paymentRow(p: ZeffyPayment, campaignSlug: string, fundraiserId: string | null) {
  const gift = giftCents(p);
  const created = typeof p.created === "number" && Number.isFinite(p.created) ? p.created : null;
  return {
    campaign_slug: campaignSlug,
    fundraiser_id: fundraiserId,
    zeffy_payment_id: p.id,
    amount_cents: gift,
    refunded_cents: refundedCents(p, gift),
    status: String(p.status || "unknown"),
    refund_status: String(p.refund_status || "none"),
    paid_at: created !== null ? new Date(created * 1000).toISOString() : new Date().toISOString(),
    buyer_email: p.buyer?.email ? String(p.buyer.email).trim().toLowerCase() : null,
    buyer_first_name: p.buyer?.first_name ?? null,
    buyer_last_name: p.buyer?.last_name ?? null,
    zeffy_campaign_id: p.campaign_id ?? null,
    zeffy_parent_campaign_id: p.parent_campaign_id ?? null,
    zeffy_team_id: p.team_id ?? null,
    raw: p,
  };
}

// Same netting the SQL uses, for tests and the reconcile summary.
export const netCents = (p: ZeffyPayment) => Math.max(0, giftCents(p) - refundedCents(p));

// Idempotency: an event whose stored outcome is final is acknowledged and
// skipped; 'received' (crashed mid-way), 'error' and 'deferred' reprocess.
const FINAL_OUTCOMES = new Set(["processed", "ignored", "deleted"]);
export const shouldSkipEvent = (outcome: string | null | undefined) => !!outcome && FINAL_OUTCOMES.has(outcome);
