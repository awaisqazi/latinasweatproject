// Pure mapping for the Zeffy mirror tables (zeffy_payments, zeffy_campaigns,
// zeffy_contacts). No I/O, so every rule unit-tests. Money uses the same
// giftCents / refundedCents as the giving sync, so both agree to the cent.
import { giftCents, refundedCents, type ZeffyPayment } from "./logic.ts";

const str = (v: unknown): string | null => {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
};

const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;

// Zeffy timestamps are unix seconds; tolerate ms and ISO strings too.
export function toIso(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    const ms = v > 1e12 ? v : v * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export const lowerEmail = (v: unknown): string | null => {
  const s = str(v);
  return s ? s.toLowerCase() : null;
};

// First non-empty value among several possible field names.
function pick(obj: any, keys: string[]): unknown {
  for (const k of keys) {
    const v = k.split(".").reduce((o, part) => (o == null ? undefined : o[part]), obj);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

export function mirrorPaymentRow(p: ZeffyPayment, syncedAt = new Date().toISOString()) {
  const gift = giftCents(p);
  const charged = int(p.amount);
  return {
    id: p.id,
    created_at: toIso(p.created),
    amount_cents: gift,
    refunded_cents: refundedCents(p, gift),
    charged_cents: charged !== null && charged > 0 ? charged : 0,
    status: String(p.status || "unknown"),
    refund_status: String(p.refund_status || "none"),
    campaign_id: str(p.campaign_id),
    parent_campaign_id: str(p.parent_campaign_id),
    campaign_category: str(p.campaign_category),
    team_id: str(p.team_id),
    campaign_type: str(p.campaign_type),
    payment_type: str(p.type),
    contact_id: str(p.contact),
    buyer_email: lowerEmail(p.buyer?.email),
    buyer_first_name: str(p.buyer?.first_name),
    buyer_last_name: str(p.buyer?.last_name),
    items: Array.isArray(p.items) ? p.items : [],
    raw: p,
    deleted_at: null,
    synced_at: syncedAt,
  };
}

export function mirrorCampaignRow(c: any, syncedAt = new Date().toISOString()) {
  return {
    id: String(c.id),
    title: str(c.title) ?? str(c.name),
    url: str(c.url),
    category: str(c.category),
    type: str(c.type),
    status: str(c.status),
    goal_cents: int(c.goal_amount) ?? int(c.target),
    volume_cents: int(c.volume),
    parent_campaign_id: str(c.parent_campaign_id),
    is_archived: typeof c.is_archived === "boolean" ? c.is_archived : null,
    start_date: toIso(c.start_date),
    end_date: toIso(c.end_date),
    zeffy_created_at: toIso(c.created),
    zeffy_updated_at: toIso(c.updated),
    zeffy_deleted_at: toIso(c.deleted_at),
    raw: c,
    synced_at: syncedAt,
  };
}

export function mirrorContactRow(c: any, syncedAt = new Date().toISOString()) {
  return {
    id: String(c.id),
    email: lowerEmail(pick(c, ["email", "email_address", "primary_email"])),
    first_name: str(pick(c, ["first_name", "firstName"])),
    last_name: str(pick(c, ["last_name", "lastName"])),
    phone: str(pick(c, ["phone", "phone_number", "phoneNumber"])),
    company_name: str(pick(c, ["company_name", "company", "companyName", "organization_name"])),
    donor_type: str(c.donor_type),
    total_contribution_cents: int(c.total_contribution),
    donation_count: int(c.donation_count),
    first_donation_at: toIso(c.first_donation_date),
    last_donation_at: toIso(c.last_donation_date),
    zeffy_created_at: toIso(pick(c, ["created", "created_at", "createdAt"])),
    zeffy_updated_at: toIso(pick(c, ["updated", "updated_at", "updatedAt"])),
    raw: c,
    deleted_at: null,
    synced_at: syncedAt,
  };
}

// A webhook payload carries the full object when it has more than {id, object}.
export function isFullObject(data: any, object: string): boolean {
  if (!data || typeof data !== "object" || typeof data.id !== "string") return false;
  if (data.object && data.object !== object) return false;
  return Object.keys(data).some((k) => k !== "id" && k !== "object");
}

// Type skeleton of a JSON value, never its values: lets an operator see what
// fields an endpoint returns without exposing donor data.
export function shapeOf(v: unknown, depth = 0): unknown {
  if (v === null) return "null";
  if (Array.isArray(v)) return v.length && depth < 3 ? [shapeOf(v[0], depth + 1)] : [];
  if (typeof v === "object") {
    if (depth >= 3) return "object";
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = shapeOf(val, depth + 1);
    return out;
  }
  return typeof v;
}

// Next listing cursor, same rule as the reconcile loop.
export function nextCursor(list: any, rows: Array<{ id?: string }>): string | null {
  return list?.next_cursor || (rows.length ? rows[rows.length - 1].id ?? null : null);
}

// The campaign list (titles, status, raised volume) needs a refresh when it is
// stale or this run saw a payment made after the last refresh (new money moves
// a campaign's volume, and may be on a form the mirror does not know yet).
export function campaignsNeedRefresh(
  lastSyncIso: string | null | undefined,
  nowMs: number,
  payments: ZeffyPayment[],
  maxAgeMs = 15 * 60_000,
): boolean {
  if (!lastSyncIso) return true;
  const last = new Date(lastSyncIso).getTime();
  if (!Number.isFinite(last) || nowMs - last > maxAgeMs) return true;
  return payments.some((p) => typeof p.created === "number" && p.created * 1000 > last);
}
