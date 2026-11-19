// Request handlers for zeffy-webhook (index.ts only serves them).
//
//   POST /                   signed Zeffy webhook delivery (Zeffy-Signature)
//   POST /?mode=reconcile    pull payments from the Zeffy API and upsert them;
//                            authorised by x-giving-cron-secret (pg_cron) or a
//                            dashboard user with the fundraising module.
//   POST /?mode=check        ask Zeffy about each linked campaign id (same
//                            authorisation); answers public campaign fields
//                            only, so the link can be confirmed without the key.
//   POST /?mode=backfill|contacts|campaigns|shape
//                            Zeffy mirror jobs (same authorisation), see mirror.ts.
//
// Every payment the reconcile lists and every payment.* / contact.* event is
// also written to the zeffy_* mirror tables. Mirror work runs after the giving
// step and never changes a giving outcome or status code.
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
import { ZeffyClient } from "./zeffy_client.ts";
import {
  getState,
  probeShapes,
  processContactEvent,
  runBackfill,
  saveState,
  softDeletePayment,
  syncCampaigns,
  upsertPayments,
} from "./mirror.ts";
import { campaignsNeedRefresh } from "./mirror_logic.ts";

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

  const setOutcome = (outcome: string, err: string | null = null, mirror?: string) =>
    db.from("giving_webhook_events")
      .update(mirror ? { outcome, error: err, mirror_outcome: mirror } : { outcome, error: err })
      .eq("id", eventId);

  try {
    const { outcome, mirror } = await processEvent(db, type, event.data);
    await setOutcome(outcome, null, mirror);
    return jsonResponse({ ok: true, outcome });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "error";
    await setOutcome("error", msg);
    // Non-2xx makes Zeffy retry; the event id stays retryable while 'error'.
    return jsonResponse({ ok: false, reason: "processing_failed" }, 500);
  }
}

type EventResult = { outcome: string; mirror?: string };

// Mirror work after the giving step: best effort. A failure is logged (no
// donor data, no secrets) and leaves mirror_outcome null; the 5-minute
// reconcile re-lists recent payments and repairs the row.
async function mirrorStep(fn: () => Promise<string>): Promise<string | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.error("zeffy mirror step failed", e instanceof Error ? e.message.slice(0, 120) : "error");
    return undefined;
  }
}

async function processEvent(db: SupabaseClient, type: string, data: any): Promise<EventResult> {
  const apiKey = Deno.env.get("ZEFFY_API_KEY");

  if (type.startsWith("contact.")) {
    const outcome = await processContactEvent(db, type, data, apiKey ? new ZeffyClient(apiKey) : null);
    return { outcome, mirror: `contact_${outcome}` };
  }

  // Anything that is not a payment or contact event: acknowledged and logged.
  if (!type.startsWith("payment.")) return { outcome: "ignored" };
  const paymentId = typeof data?.id === "string" ? data.id : "";
  if (!paymentId) return { outcome: "ignored" };

  const zeffy = apiKey ? new ZeffyClient(apiKey) : null;
  const mirrorDelete = () => mirrorStep(async () => (await softDeletePayment(db, paymentId)) ? "deleted" : "absent");

  if (type === "payment.deleted") {
    const outcome = (await markDeleted(db, paymentId)) ? "deleted" : "ignored";
    return { outcome, mirror: await mirrorDelete() };
  }

  let payment: ZeffyPayment | null = null;
  if ((type === "payment.completed" || type === "payment.created") && data?.object === "payment" && "amount" in data) {
    payment = data as ZeffyPayment;
  } else {
    // payment.updated carries only {id, object}: refetch the current state.
    if (!zeffy) return { outcome: "deferred" }; // the reconcile pass picks it up once the key exists
    const res = await zeffy.get(`/payments/${encodeURIComponent(paymentId)}`);
    if (res.status === 404) {
      const outcome = (await markDeleted(db, paymentId)) ? "deleted" : "ignored";
      return { outcome, mirror: await mirrorDelete() };
    }
    payment = res.body as ZeffyPayment;
  }

  const ctx = await loadCtx(db, zeffy);
  const out = await storePayment(ctx, payment);
  const p = payment;
  const mirror = await mirrorStep(async () => (await upsertPayments(db, [p])) ? "upserted" : "skipped");
  return { outcome: out === "ignored" ? "ignored" : "processed", mirror };
}

// ── Reconcile ───────────────────────────────────────────────────

const EARLY_GIFT_WINDOW_MS = 14 * 86400_000;

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
  // Mirror of every listed payment (all forms) plus the campaign list. Its
  // failures are reported here and never change the giving counts or status.
  const mirror: MirrorCounts = { payments: 0, deleted: 0, campaigns: null, errors: [] };
  const listed: ZeffyPayment[] = [];

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
    if (!active.length) {
      // No giving drive to sync: still keep the mirror current over the last week.
      const since = Math.floor((Date.now() - MIRROR_ONLY_WINDOW_MS) / 1000);
      let cursor: string | null = null;
      for (let page = 0; page < 20 && Date.now() - startedAt < budgetMs; page++) {
        const qs = new URLSearchParams({ limit: "100", "created[gte]": String(since) });
        if (cursor) qs.set("starting_after", cursor);
        const res = await zeffy.get(`/payments?${qs}`);
        const list = res.body || {};
        const rows: ZeffyPayment[] = Array.isArray(list.data) ? list.data : [];
        counts.fetched += rows.length;
        listed.push(...rows);
        await mirrorPage(db, rows, mirror);
        cursor = list.next_cursor || (rows.length ? rows[rows.length - 1].id : null);
        if (!list.has_more || !cursor) break;
      }
      await finishMirror(db, zeffy, listed, mirror, startedAt + budgetMs, counts);
      return jsonResponse({ ok: true, ...counts, note: "no_active_campaigns", mirror });
    }

    const ctx = await loadCtx(db, zeffy);
    ctx.campaigns = ctx.campaigns.filter((c) => active.some((a) => a.slug === c.slug));
    // Look back two weeks before the earliest start: the Zeffy page takes gifts
    // as soon as it is published, and a gift made before kickoff still counts.
    const earliest = Math.min(...active.map((c) => new Date(c.starts_at).getTime()));
    const since = Math.floor((earliest - EARLY_GIFT_WINDOW_MS) / 1000);

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
      listed.push(...rows);
      await mirrorPage(db, rows, mirror);
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
          await mirrorTry(mirror, async () => {
            if (await softDeletePayment(db, id)) mirror.deleted++;
          });
          continue;
        }
        const out = await storePayment(ctx, res.body as ZeffyPayment);
        if (out !== "ignored") {
          counts.upserted++;
          counts[out]++;
        }
        await mirrorPage(db, [res.body as ZeffyPayment], mirror);
      }
    }

    await finishMirror(db, zeffy, listed, mirror, startedAt + budgetMs, counts);
    return jsonResponse({ ok: true, ...counts, ...(partial ? { partial: true } : {}), mirror });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 120) : "error";
    console.error("zeffy reconcile failed", msg);
    return jsonResponse({ ok: false, reason: "reconcile_failed", detail: msg, ...counts }, 500);
  }
}

// ── Mirror helpers for the reconcile ────────────────────────────

const MIRROR_ONLY_WINDOW_MS = 7 * 86400_000;

type MirrorCounts = {
  payments: number;
  deleted: number;
  campaigns: { fetched: number; pages: number; complete: boolean } | null;
  errors: string[];
  api_calls?: number;
};

async function mirrorTry(m: MirrorCounts, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (m.errors.length < 5) m.errors.push(e instanceof Error ? e.message.slice(0, 80) : "error");
  }
}

async function mirrorPage(db: SupabaseClient, rows: ZeffyPayment[], m: MirrorCounts): Promise<void> {
  await mirrorTry(m, async () => {
    m.payments += await upsertPayments(db, rows);
  });
}

// Campaign refresh when stale or new money arrived, then the run record.
async function finishMirror(
  db: SupabaseClient,
  zeffy: ZeffyClient,
  listed: ZeffyPayment[],
  m: MirrorCounts,
  deadlineMs: number,
  counts: Record<string, number>,
): Promise<void> {
  await mirrorTry(m, async () => {
    const state = await getState(db, "campaigns");
    if (deadlineMs - Date.now() > 10_000 && campaignsNeedRefresh(state?.last_run_at, Date.now(), listed)) {
      m.campaigns = await syncCampaigns(db, zeffy, deadlineMs - 5_000);
    }
  });
  m.api_calls = zeffy.calls;
  await mirrorTry(m, async () => {
    const now = new Date().toISOString();
    await saveState(db, "reconcile", { last_run_at: now, last_result: { ...counts, mirror: m, at: now } });
  });
}

// ── Check ───────────────────────────────────────────────────────

// Campaign fields safe to echo: what the public Zeffy page already shows.
const CAMPAIGN_FIELDS = [
  "id", "object", "title", "name", "url", "category", "type", "status",
  "target", "goal_amount", "volume", "parent_campaign_id", "created",
];
function publicCampaign(body: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CAMPAIGN_FIELDS) {
    const v = body?.[key];
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[key] = v;
  }
  return out;
}

export async function handleCheck(req: Request, db: SupabaseClient): Promise<Response> {
  if (!(await isAuthorisedForReconcile(req))) {
    return jsonResponse({ ok: false, reason: "unauthorized" }, 401);
  }
  const apiKey = Deno.env.get("ZEFFY_API_KEY");
  if (!apiKey) return jsonResponse({ ok: false, reason: "no_api_key" }, 200);
  const zeffy = new ZeffyClient(apiKey);

  try {
    const { data: all, error } = await db.from("giving_campaigns").select("slug, zeffy_campaign_ids");
    if (error) throw new Error(`db_campaigns_${error.code}`);
    const linked = [];
    for (const c of all || []) {
      for (const id of (Array.isArray(c.zeffy_campaign_ids) ? c.zeffy_campaign_ids : []).slice(0, 10)) {
        const res = await zeffy.get(`/campaigns/${encodeURIComponent(id)}`);
        linked.push({ slug: c.slug, id, found: res.status !== 404, campaign: res.status === 404 ? null : publicCampaign(res.body) });
      }
    }
    // Peer-to-peer pages Zeffy knows about, so a wrong id can be corrected.
    const list = await zeffy.get("/campaigns?limit=100");
    const rows: any[] = Array.isArray(list.body?.data) ? list.body.data : [];
    const peerToPeer = rows
      .filter((r) => /peer/i.test(`${r?.category ?? ""} ${r?.type ?? ""} ${r?.url ?? ""}`))
      .slice(0, 40)
      .map(publicCampaign);
    return jsonResponse({ ok: true, linked, peer_to_peer: peerToPeer, listed: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 120) : "error";
    console.error("zeffy check failed", msg);
    return jsonResponse({ ok: false, reason: "check_failed", detail: msg }, 500);
  }
}

// ── Mirror modes ────────────────────────────────────────────────
//   backfill   next pages of the full payment history (?restart=1 starts over)
//   contacts   next pages of the contact list (?restart=1 starts over)
//   campaigns  full campaign list refresh
//   shape      field names and types per endpoint, never values

export async function handleMirrorMode(req: Request, db: SupabaseClient, mode: string): Promise<Response> {
  if (!(await isAuthorisedForReconcile(req))) {
    return jsonResponse({ ok: false, reason: "unauthorized" }, 401);
  }
  const apiKey = Deno.env.get("ZEFFY_API_KEY");
  if (!apiKey) return jsonResponse({ ok: false, reason: "no_api_key" }, 200);
  const zeffy = new ZeffyClient(apiKey);
  const params = new URL(req.url).searchParams;
  const restart = params.get("restart") === "1";
  const pagesParam = Number(params.get("pages"));
  const maxPages = Number.isFinite(pagesParam) && pagesParam > 0 ? Math.min(Math.floor(pagesParam), 60) : 40;
  try {
    if (mode === "shape") return jsonResponse({ ok: true, shapes: await probeShapes(zeffy), api_calls: zeffy.calls });
    if (mode === "campaigns") {
      const r = await syncCampaigns(db, zeffy, Date.now() + 90_000, 30);
      return jsonResponse({ ok: true, ...r, api_calls: zeffy.calls });
    }
    const kind = mode === "backfill" ? "payments" : "contacts";
    // 60 s of paging keeps each call well inside pg_net's 120 s timeout.
    return jsonResponse(await runBackfill(db, zeffy, kind, { restart, maxPages, budgetMs: 60_000 }));
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 120) : "error";
    console.error(`zeffy ${mode} failed`, msg);
    return jsonResponse({ ok: false, reason: `${mode}_failed`, detail: msg, api_calls: zeffy.calls }, 500);
  }
}

export async function route(req: Request, db: SupabaseClient): Promise<Response> {
  if (req.method === "OPTIONS") return jsonResponse({}, 204);
  if (req.method !== "POST") return jsonResponse({ ok: false, reason: "method_not_allowed" }, 405);
  const mode = new URL(req.url).searchParams.get("mode");
  if (mode === "reconcile") return handleReconcile(req, db);
  if (mode === "check") return handleCheck(req, db);
  if (mode === "backfill" || mode === "contacts" || mode === "campaigns" || mode === "shape") {
    return handleMirrorMode(req, db, mode);
  }
  return handleWebhook(req, db);
}

export { jsonResponse };
