// Zeffy sync for giving campaigns. Deployed with JWT verification OFF.
//
//   POST /                   signed Zeffy webhook delivery (Zeffy-Signature)
//   POST /?mode=reconcile    pull payments from the Zeffy API and upsert them;
//                            authorised by x-giving-cron-secret (pg_cron) or a
//                            dashboard user with the fundraising module.
//
// Secrets (names only): ZEFFY_WEBHOOK_SECRET, ZEFFY_API_KEY, GIVING_CRON_SECRET.
// Never log or echo any of them.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { jsonResponse, route } from "./handlers.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return jsonResponse({}, 204);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ ok: false, reason: "not_configured" }, 500);
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return route(req, db);
});
