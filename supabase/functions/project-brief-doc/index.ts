import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================
// PROJECT BRIEF DOC AUTOMATION (server-side port of the legacy
// Google Apps Script). Given a project id, copies the "Project
// Brief (Template)" Google Doc into the team Drive folder, names
// it [YYYY-MM-DD]_[Project Title], and links it back onto the
// project's details_url. Idempotent: skips if details_url is set
// (unless force=true).
//
// Auth (any one):
//   - x-brief-doc-secret header == BRIEF_DOC_SECRET   (DB trigger / server)
//   - Authorization: Bearer <service role key>        (server)
//   - Authorization: Bearer <user JWT> for an admin/superuser (manual button)
//
// Required edge-function secrets (supabase secrets set ...):
//   GOOGLE_SERVICE_ACCOUNT_JSON  full service-account key JSON
//   BRIEF_DOC_TEMPLATE_ID        Drive file id of the brief template
//   BRIEF_DOC_FOLDER_ID          Drive folder id to file copies into
//   BRIEF_DOC_SECRET             shared secret matching app_private.settings
// Auto-provided by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-brief-doc-secret, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({}, 204);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase function environment is not configured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!(await isAuthorized(req, admin, serviceRoleKey))) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { project_id?: string; projectId?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  const projectId = String(body.project_id ?? body.projectId ?? "").trim();
  const force = body.force === true;
  if (!projectId) return json({ error: "Missing required field: project_id" }, 400);

  const { data: project, error: loadError } = await admin
    .from("projects")
    .select("id, title, details_url, brief_doc_status")
    .eq("id", projectId)
    .single();

  if (loadError || !project) return json({ error: "Project not found" }, 404);

  // Idempotency guard — mirrors the legacy "Column D already has a link" check.
  if (!force && typeof project.details_url === "string" && project.details_url.trim() !== "") {
    return json({ ok: true, skipped: true, reason: "details_url already set", details_url: project.details_url });
  }

  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  const templateId = Deno.env.get("BRIEF_DOC_TEMPLATE_ID");
  const folderId = Deno.env.get("BRIEF_DOC_FOLDER_ID");
  if (!saJson || !templateId || !folderId) {
    await markStatus(admin, projectId, "error");
    return json({ error: "Google Drive integration is not configured" }, 500);
  }

  try {
    const serviceAccount = JSON.parse(saJson);
    const accessToken = await getAccessToken(serviceAccount);

    const docName = `${chicagoDatePrefix()}_${(project.title ?? "Untitled").trim()}`.slice(0, 250);
    const copyUrl =
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(templateId)}/copy` +
      `?supportsAllDrives=true&fields=id,webViewLink,name`;

    const driveResp = await fetch(copyUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: docName, parents: [folderId] }),
    });

    if (!driveResp.ok) {
      const detail = (await driveResp.text()).slice(0, 600);
      await markStatus(admin, projectId, "error");
      return json({ error: "Google Drive copy failed", status: driveResp.status, detail }, 502);
    }

    const file = await driveResp.json();
    const link = file.webViewLink ?? `https://docs.google.com/document/d/${file.id}/edit`;

    const { data: updated, error: updateError } = await admin
      .from("projects")
      .update({ details_url: link, brief_doc_status: "created" })
      .eq("id", projectId)
      .select("id, details_url, brief_doc_status")
      .single();

    if (updateError) return json({ error: updateError.message }, 500);

    return json({ ok: true, created: true, doc_id: file.id, details_url: link, project: updated });
  } catch (error) {
    await markStatus(admin, projectId, "error");
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function isAuthorized(
  req: Request,
  admin: ReturnType<typeof createClient>,
  serviceRoleKey: string,
): Promise<boolean> {
  const configuredSecret = Deno.env.get("BRIEF_DOC_SECRET");
  const providedSecret = req.headers.get("x-brief-doc-secret");
  if (configuredSecret && providedSecret && providedSecret === configuredSecret) return true;

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")?.trim();
  if (!bearer) return false;
  if (bearer === serviceRoleKey || bearer.startsWith("sb_secret_")) return true;

  // Manual button: a signed-in user who is either an admin/superuser or a
  // member with the marketing module granted.
  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data?.user) return false;
  const userId = data.user.id;
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (profile?.role === "admin" || profile?.role === "superuser") return true;
  const { data: grant } = await admin
    .from("profile_modules")
    .select("module")
    .eq("profile_id", userId)
    .eq("module", "marketing")
    .maybeSingle();
  return !!grant;
}

async function markStatus(admin: ReturnType<typeof createClient>, id: string, status: string) {
  await admin.from("projects").update({ brief_doc_status: status }).eq("id", id);
}

async function getAccessToken(sa: { client_email: string; private_key: string; token_uri?: string }): Promise<string> {
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = { iss: sa.client_email, scope: DRIVE_SCOPE, aud: tokenUri, iat: now, exp: now + 3600 };

  const encode = (obj: unknown) => base64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${encode(header)}.${encode(claim)}`;
  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64url(new Uint8Array(signature))}`;

  const resp = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!resp.ok) throw new Error(`Google token exchange failed: ${resp.status} ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  if (!data.access_token) throw new Error("Google token exchange returned no access_token");
  return data.access_token;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")),
    (c) => c.charCodeAt(0),
  );
  return await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// en-CA renders as YYYY-MM-DD; America/Chicago matches the legacy script's intent.
function chicagoDatePrefix(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function json(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
