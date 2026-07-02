// End-of-shift inventory log intake for the public /inventory form.
// Verifies a Cloudflare Turnstile token, then records the submission with
// the service role (the tables are RLS-locked to the dashboard's inventory
// module). Low-stock Workspace alerts fire from a database trigger.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SubmitPayload = {
  coordinatorName?: string;
  notes?: string;
  counts?: Array<{ itemId?: string; quantity?: number }>;
  turnstileToken?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return jsonResponse({}, 204);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");

  if (!supabaseUrl || !serviceRoleKey || !turnstileSecret) {
    return jsonResponse({ error: "Function environment is not configured" }, 500);
  }

  let payload: SubmitPayload;

  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const coordinatorName = String(payload.coordinatorName || "").trim();
  const notes = String(payload.notes || "").trim();
  const counts = Array.isArray(payload.counts) ? payload.counts : [];
  const turnstileToken = String(payload.turnstileToken || "");

  if (!coordinatorName || coordinatorName.length > 120) {
    return jsonResponse({ ok: false, reason: "invalid_name" }, 400);
  }

  if (notes.length > 2000) {
    return jsonResponse({ ok: false, reason: "invalid_notes" }, 400);
  }

  if (!counts.length || counts.length > 100) {
    return jsonResponse({ ok: false, reason: "invalid_counts" }, 400);
  }

  if (!turnstileToken) {
    return jsonResponse({ ok: false, reason: "captcha_missing" }, 400);
  }

  // Verify the Turnstile token before touching the database.
  const verifyBody = new URLSearchParams({
    secret: turnstileSecret,
    response: turnstileToken,
  });
  const remoteIp = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for");
  if (remoteIp) {
    verifyBody.set("remoteip", remoteIp.split(",")[0].trim());
  }

  let turnstileOk = false;

  try {
    const verifyResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: verifyBody },
    );
    const verdict = await verifyResponse.json();
    turnstileOk = Boolean(verdict?.success);
  } catch {
    turnstileOk = false;
  }

  if (!turnstileOk) {
    return jsonResponse({ ok: false, reason: "captcha_failed" }, 403);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: items, error: itemsError } = await supabase
    .from("inventory_items")
    .select("id, name, unit, low_threshold")
    .eq("active", true);

  if (itemsError) {
    return jsonResponse({ error: itemsError.message }, 500);
  }

  const itemsById = new Map((items || []).map((item) => [item.id, item]));
  const seen = new Set<string>();
  const cleanCounts: Array<{ itemId: string; quantity: number }> = [];

  for (const entry of counts) {
    const itemId = String(entry?.itemId || "");
    const quantity = Number(entry?.quantity);

    if (!itemsById.has(itemId) || seen.has(itemId)) {
      return jsonResponse({ ok: false, reason: "invalid_counts" }, 400);
    }

    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000) {
      return jsonResponse({ ok: false, reason: "invalid_counts" }, 400);
    }

    seen.add(itemId);
    cleanCounts.push({ itemId, quantity });
  }

  // Snapshot the previous count per item so history keeps its own deltas.
  const { data: previousRows, error: previousError } = await supabase
    .from("inventory_log_items")
    .select("item_id, quantity, inventory_logs!inner(created_at)")
    .in("item_id", cleanCounts.map((count) => count.itemId))
    .order("created_at", { ascending: false, referencedTable: "inventory_logs" });

  if (previousError) {
    return jsonResponse({ error: previousError.message }, 500);
  }

  const previousByItem = new Map<string, number>();
  for (const row of previousRows || []) {
    if (!previousByItem.has(row.item_id)) {
      previousByItem.set(row.item_id, row.quantity);
    }
  }

  const { data: log, error: logError } = await supabase
    .from("inventory_logs")
    .insert({
      coordinator_name: coordinatorName,
      notes: notes || null,
      source: "form",
    })
    .select("id, created_at")
    .single();

  if (logError) {
    return jsonResponse({ error: logError.message }, 500);
  }

  const { error: lineError } = await supabase.from("inventory_log_items").insert(
    cleanCounts.map((count) => ({
      log_id: log.id,
      item_id: count.itemId,
      quantity: count.quantity,
      previous_quantity: previousByItem.get(count.itemId) ?? null,
    })),
  );

  if (lineError) {
    // Keep the tables consistent if line items fail after the header landed.
    await supabase.from("inventory_logs").delete().eq("id", log.id);
    return jsonResponse({ error: lineError.message }, 500);
  }

  const lowItems = cleanCounts
    .map((count) => {
      const item = itemsById.get(count.itemId);
      return item && count.quantity <= item.low_threshold
        ? {
            name: item.name,
            unit: item.unit,
            quantity: count.quantity,
            threshold: item.low_threshold,
          }
        : null;
    })
    .filter(Boolean);

  return jsonResponse({ ok: true, logId: log.id, lowItems });
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
