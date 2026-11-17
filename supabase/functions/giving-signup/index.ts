// Giving Tuesday instructor sign-up for the public giving page.
// Verifies a Cloudflare Turnstile token BEFORE touching the database, then
// records the sign-up through the service-role-only RPC giving_signup_submit.
// New rows are 'pending' and stay private until an admin approves them. A
// repeat sign-up answers {ok: true} whatever happened, so the endpoint cannot
// be used to test which emails are registered.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { validateSignup } from "./validate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return jsonResponse({}, 204);
  if (req.method !== "POST") return jsonResponse({ ok: false, reason: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!supabaseUrl || !serviceRoleKey || !turnstileSecret) {
    return jsonResponse({ ok: false, reason: "not_configured" }, 500);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
  } catch {
    return jsonResponse({ ok: false, reason: "invalid_json" }, 400);
  }

  const checked = validateSignup(payload);
  if (!checked.ok) return jsonResponse({ ok: false, reason: checked.reason }, checked.status);
  const v = checked.value;

  // Turnstile first: nothing below runs for an unverified caller.
  const verifyBody = new URLSearchParams({ secret: turnstileSecret, response: v.turnstileToken });
  const remoteIp = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for");
  if (remoteIp) verifyBody.set("remoteip", remoteIp.split(",")[0].trim());

  let turnstileOk = false;
  try {
    const verifyResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: verifyBody, signal: AbortSignal.timeout(10000) },
    );
    const verdict = await verifyResponse.json();
    turnstileOk = Boolean(verdict?.success);
  } catch {
    turnstileOk = false;
  }
  if (!turnstileOk) return jsonResponse({ ok: false, reason: "captcha_failed" }, 403);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("giving_signup_submit", {
    p_campaign: v.campaign,
    p_first_name: v.firstName,
    p_last_name: v.lastName,
    p_email: v.email,
    p_phone: v.phone,
    p_cohort: v.cohort,
    p_why: v.why,
    p_show_on_board: v.showOnBoard,
    p_consent_page: v.consentPage,
    p_base_slug: v.baseSlug,
  });

  if (error) {
    console.error("giving-signup rpc failed", error.code);
    return jsonResponse({ ok: false, reason: "server_error" }, 500);
  }

  const result = (data || {}) as { ok?: boolean; reason?: string };
  if (result.ok) return jsonResponse({ ok: true }, 200);

  const reason = result.reason || "server_error";
  const status = reason === "not_found"
    ? 404
    : reason === "signup_closed"
    ? 403
    : reason.startsWith("invalid_") || reason === "consent_required"
    ? 400
    : 500;
  return jsonResponse({ ok: false, reason }, status);
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
