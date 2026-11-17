// Request handlers for zeffy-webhook (index.ts only serves them).
//
//   POST /                   signed Zeffy webhook delivery (Zeffy-Signature)
//   POST /?mode=reconcile    pull payments from the Zeffy API and upsert them;
//                            authorised by x-giving-cron-secret (pg_cron) or a
//                            dashboard user with the fundraising module.
//
// Secrets (names only): ZEFFY_WEBHOOK_SECRET, ZEFFY_API_KEY, GIVING_CRON_SECRET.
// Never log or echo any of them.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  attribute,
  type GivingCampaign,
  type GivingFundraiser,
  matchFundraiserByUrl,
  paymentRow,
  timingSafeEqualString,
  verifyZeffySignature,
  type ZeffyPayment,
  shouldSkipEvent,
} from "./logic.ts";

const ZEFFY_BASE = "https://api.zeffy.com/api/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Zeffy API client with rate-limit handling ───────────────────

class ZeffyClient {
  private last = 0;
  constructor(private key: string) {}

  // Returns {status, body}. 404 is returned, not thrown.
  async get(path: string): Promise<{ status: number; body: any }> {
    for (let attempt = 0; attempt < 4; attempt++) {
      // 20 req/s ceiling: keep at least 75 ms between calls.
      const gap = Date.now() - this.last;
      if (gap < 75) await sleep(75 - gap);
      this.last = Date.now();

      const res = await fetch(`${ZEFFY_BASE}${path}`, {
        headers: { Authorization: `Bearer ${this.key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 429) {
        const wait = Math.min(Math.max(Number(res.headers.get("retry-after")) || 1, 1), 61);
        await res.body?.cancel();
        await sleep(wait * 1000);
        continue;
      }

      // Slow down before the per-minute window runs dry.
      const remaining = Number(res.headers.get("x-ratelimit-remaining"));
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      if (Number.isFinite(remaining) && remaining <= 2 && Number.isFinite(reset) && reset > 0) {
        const waitMs = Math.min(Math.max(reset * 1000 - Date.now(), 0), 61000);
        if (waitMs > 0) await sleep(waitMs);
      }

      if (res.status === 404) {
        await res.body?.cancel();
        return { status: 404, body: null };
      }
      if (!res.ok) {
        await res.body?.cancel();
        if (res.status >= 500 && attempt < 3) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw new Error(`zeffy_http_${res.status}`);
      }
      return { status: res.status, body: await res.json() };
    }
    throw new Error("zeffy_rate_limited");
  }
}

// ── Shared state loaded per request ─────────────────────────────

type Ctx = {
  db: SupabaseClient;
  zeffy: ZeffyClient | null;
  campaigns: GivingCampaign[];
  fundraisers: GivingFundraiser[];
  pageCache: Map<string, string | null>; // zeffy campaign id -> url
};

async function loadCtx(db: SupabaseClient, zeffy: ZeffyClient | null): Promise<Ctx> {
  const { data: campaigns, error: cErr } = await db
    .from("giving_campaigns")
    .select("slug, zeffy_campaign_ids, starts_at, ends_at");
  if (cErr) throw new Error(`db_campaigns_${cErr.code}`);
  const withIds = (campaigns || []).filter((c) => Array.isArray(c.zeffy_campaign_ids) && c.zeffy_campaign_ids.length);
  let fundraisers: GivingFundraiser[] = [];
  if (withIds.length) {
    const { data, error } = await db
      .from("giving_fundraisers")
      .select("id, campaign_slug, zeffy_campaign_id, zeffy_url")
      .in("campaign_slug", withIds.map((c) => c.slug));
    if (error) throw new Error(`db_fundraisers_${error.code}`);
    fundraisers = data || [];
  }
  return { db, zeffy, campaigns: withIds, fundraisers, pageCache: new Map() };
}

type StoreOutcome = "ignored" | "matched" | "unmatched";

async function storePayment(ctx: Ctx, p: ZeffyPayment): Promise<StoreOutcome> {
  const a = attribute(p, ctx.campaigns, ctx.fundraisers);
  if (a.kind === "ignored") return "ignored";

  let fundraiserId: string | null = null;
  if (a.kind === "fundraiser") fundraiserId = a.fundraiser.id;

  if (a.kind === "unknown_page" && ctx.zeffy) {
    let url = ctx.pageCache.get(a.campaignId);
    if (url === undefined) {
      const res = await ctx.zeffy.get(`/campaigns/${encodeURIComponent(a.campaignId)}`);
      url = res.status === 404 ? null : (res.body?.url ?? null);
      ctx.pageCache.set(a.campaignId, url ?? null);
    }
    const fr = matchFundraiserByUrl(url, a.campaign.slug, ctx.fundraisers);
    if (fr) {
      fundraiserId = fr.id;
      if (!fr.zeffy_campaign_id) {
        const { error } = await ctx.db
          .from("giving_fundraisers")
          .update({ zeffy_campaign_id: a.campaignId })
          .eq("id", fr.id)
          .is("zeffy_campaign_id", null);
        if (!error) fr.zeffy_campaign_id = a.campaignId;
      }
    }
  }

  const { error } = await ctx.db.rpc("giving_upsert_zeffy_payment", {
    p_row: paymentRow(p, a.campaign.slug, fundraiserId),
  });
  if (error) throw new Error(`db_upsert_${error.code}`);

  if (fundraiserId) return "matched";
  // A row an admin assigned by hand still counts as matched.
  const { data } = await ctx.db
    .from("giving_payments")
    .select("fundraiser_id")
    .eq("zeffy_payment_id", p.id)
    .maybeSingle();
  return data?.fundraiser_id ? "matched" : "unmatched";
}

async function markDeleted(db: SupabaseClient, paymentId: string): Promise<boolean> {
  const { data, error } = await db
    .from("giving_payments")
    .update({ status: "deleted" })
    .eq("zeffy_payment_id", paymentId)
    .select("id");
  if (error) throw new Error(`db_delete_${error.code}`);
  return (data || []).length > 0;
}

// ── Webhook ─────────────────────────────────────────────────────

export async function handleWebhook(req: Request, db: SupabaseClient): Promise<Response> {
  const secret = Deno.env.get("ZEFFY_WEBHOOK_SECRET");
  if (!secret) return jsonResponse({ ok: false, reason: "not_configured" }, 503);

  const raw = await req.text();
  const verdict = await verifyZeffySignature(raw, req.headers.get("zeffy-signature"), secret);
  if (!verdict.ok) return jsonResponse({ ok: false, reason: "invalid_signature" }, 400);

  let event: { id?: string; type?: string; data?: any };
  try {
    event = JSON.parse(raw);
  } catch {
    return jsonResponse({ ok: false, reason: "invalid_json" }, 400);
  }
  const eventId = typeof event?.id === "string" ? event.id.slice(0, 200) : "";
  const type = typeof event?.type === "string" ? event.type.slice(0, 80) : "";
  if (!eventId || !type) return jsonResponse({ ok: false, reason: "invalid_event" }, 400);

  // Idempotency: a final outcome means this event was already handled.
  const { data: seen, error: seenErr } = await db
    .from("giving_webhook_events")
    .select("outcome")
    .eq("id", eventId)
    .maybeSingle();
  if (seenErr) return jsonResponse({ ok: false, reason: "server_error" }, 500);
  if (seen && shouldSkipEvent(seen.outcome)) {
    return jsonResponse({ ok: true, duplicate: true, outcome: seen.outcome });
  }
  if (!seen) {
    const { error } = await db.from("giving_webhook_events").insert({ id: eventId, type, outcome: "received" });
    if (error) {
      // A concurrent delivery of the same event won the insert.
      if (error.code === "23505") return jsonResponse({ ok: true, duplicate: true });
      return jsonResponse({ ok: false, reason: "server_error" }, 500);
    }
  }

  const setOutcome = (outcome: string, err: string | null = null) =>
    db.from("giving_webhook_events").update({ outcome, error: err }).eq("id", eventId);

  try {
    const outcome = await processEvent(db, type, event.data);
    await setOutcome(outcome);
    return jsonResponse({ ok: true, outcome });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "error";
    await setOutcome("error", msg);
    // Non-2xx makes Zeffy retry; the event id stays retryable while 'error'.
    return jsonResponse({ ok: false, reason: "processing_failed" }, 500);
  }
}

async function processEvent(db: SupabaseClient, type: string, data: any): Promise<string> {
  if (!type.startsWith("payment.")) return "ignored";
  const paymentId = typeof data?.id === "string" ? data.id : "";
  if (!paymentId) return "ignored";

  const apiKey = Deno.env.get("ZEFFY_API_KEY");
  const zeffy = apiKey ? new ZeffyClient(apiKey) : null;

  if (type === "payment.deleted") {
    return (await markDeleted(db, paymentId)) ? "deleted" : "ignored";
  }

  let payment: ZeffyPayment | null = null;
  if ((type === "payment.completed" || type === "payment.created") && data?.object === "payment" && "amount" in data) {
    payment = data as ZeffyPayment;
  } else {
    // payment.updated carries only {id, object}: refetch the current state.
    if (!zeffy) return "deferred"; // the reconcile pass picks it up once the key exists
    const res = await zeffy.get(`/payments/${encodeURIComponent(paymentId)}`);
    if (res.status === 404) return (await markDeleted(db, paymentId)) ? "deleted" : "ignored";
    payment = res.body as ZeffyPayment;
  }

  const ctx = await loadCtx(db, zeffy);
  const out = await storePayment(ctx, payment);
  return out === "ignored" ? "ignored" : "processed";
}

// ── Reconcile ───────────────────────────────────────────────────

async function isAuthorisedForReconcile(req: Request): Promise<boolean> {
  const cronSecret = Deno.env.get("GIVING_CRON_SECRET");
  const given = req.headers.get("x-giving-cron-secret");
  if (cronSecret && given && timingSafeEqualString(given, cronSecret)) return true;

  const auth = req.headers.get("authorization") || "";
  if (!/^bearer\s+\S+/i.test(auth)) return false;
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return false;
  const userClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await userClient.rpc("giving_can_manage");
  return !error && data === true;
}

export async function handleReconcile(req: Request, db: SupabaseClient): Promise<Response> {
  if (!(await isAuthorisedForReconcile(req))) {
    return jsonResponse({ ok: false, reason: "unauthorized" }, 401);
  }
  const apiKey = Deno.env.get("ZEFFY_API_KEY");
  if (!apiKey) return jsonResponse({ ok: false, reason: "no_api_key" }, 200);

  const startedAt = Date.now();
  const budgetMs = 110_000;
  const zeffy = new ZeffyClient(apiKey);
  const counts = { fetched: 0, upserted: 0, matched: 0, unmatched: 0, deleted: 0 };

  try {
    const { data: all, error } = await db
      .from("giving_campaigns")
      .select("slug, zeffy_campaign_ids, starts_at, ends_at");
    if (error) throw new Error(`db_campaigns_${error.code}`);
    // Active: has Zeffy ids and ended no more than 30 days ago (refunds keep
    // arriving after the drive closes).
    const cutoff = Date.now() - 30 * 86400_000;
    const active = (all || []).filter((c) =>
      Array.isArray(c.zeffy_campaign_ids) && c.zeffy_campaign_ids.length &&
      new Date(c.ends_at).getTime() >= cutoff
    );
    if (!active.length) return jsonResponse({ ok: true, ...counts, note: "no_active_campaigns" });

    const ctx = await loadCtx(db, zeffy);
    ctx.campaigns = ctx.campaigns.filter((c) => active.some((a) => a.slug === c.slug));
    const earliest = Math.min(...active.map((c) => new Date(c.starts_at).getTime()));
    const since = Math.floor((earliest - 86400_000) / 1000);

    const seen = new Set<string>();
    let cursor: string | null = null;
    let partial = false;
    for (let page = 0; page < 200; page++) {
      if (Date.now() - startedAt > budgetMs) {
        partial = true;
        break;
      }
      const qs = new URLSearchParams({ limit: "100", "created[gte]": String(since) });
      if (cursor) qs.set("starting_after", cursor);
      const res = await zeffy.get(`/payments?${qs}`);
      const list = res.body || {};
      const rows: ZeffyPayment[] = Array.isArray(list.data) ? list.data : [];
      counts.fetched += rows.length;
      for (const p of rows) {
        if (!p?.id) continue;
        seen.add(p.id);
        const out = await storePayment(ctx, p);
        if (out !== "ignored") {
          counts.upserted++;
          counts[out]++;
        }
      }
      cursor = list.next_cursor || (rows.length ? rows[rows.length - 1].id : null);
      if (!list.has_more || !cursor) break;
    }

    // Stored Zeffy rows the listing did not return: refetch each, 404 = deleted.
    if (!partial) {
      const { data: stored, error: sErr } = await db
        .from("giving_payments")
        .select("zeffy_payment_id")
        .eq("source", "zeffy")
        .neq("status", "deleted")
        .in("campaign_slug", active.map((c) => c.slug));
      if (sErr) throw new Error(`db_stored_${sErr.code}`);
      const missing = (stored || []).map((r) => r.zeffy_payment_id).filter((id) => id && !seen.has(id)).slice(0, 50);
      for (const id of missing) {
        if (Date.now() - startedAt > budgetMs) {
          partial = true;
          break;
        }
        const res = await zeffy.get(`/payments/${encodeURIComponent(id)}`);
        if (res.status === 404) {
          if (await markDeleted(db, id)) counts.deleted++;
          continue;
        }
        const out = await storePayment(ctx, res.body as ZeffyPayment);
        if (out !== "ignored") {
          counts.upserted++;
          counts[out]++;
        }
      }
    }

    return jsonResponse({ ok: true, ...counts, ...(partial ? { partial: true } : {}) });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 120) : "error";
    console.error("zeffy reconcile failed", msg);
    return jsonResponse({ ok: false, reason: "reconcile_failed", detail: msg, ...counts }, 500);
  }
}

export async function route(req: Request, db: SupabaseClient): Promise<Response> {
  if (req.method === "OPTIONS") return jsonResponse({}, 204);
  if (req.method !== "POST") return jsonResponse({ ok: false, reason: "method_not_allowed" }, 405);
  const mode = new URL(req.url).searchParams.get("mode");
  if (mode === "reconcile") return handleReconcile(req, db);
  return handleWebhook(req, db);
}

export { jsonResponse };
