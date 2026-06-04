import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-marketing-intake-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type IntakePayload = {
  responseId?: string;
  submittedAt?: string;
  respondentEmail?: string;
  contactName?: string;
  title?: string;
  targetLiveDate?: string;
  messaging?: string;
  logos?: string[];
  workingAssets?: string[];
  instagramTags?: string[];
  linkedInTags?: string[];
  urgency?: number | null;
  raw?: Record<string, unknown>;
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

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase function environment is not configured" }, 500);
  }

  const supabaseKey = getAuthorizedSupabaseKey(req, serviceRoleKey);

  if (!supabaseKey) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let payload: IntakePayload;

  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const title = normalizeString(payload.title);
  const responseId = normalizeString(payload.responseId);

  if (!title) {
    return jsonResponse({ error: "Missing required field: title" }, 400);
  }

  if (!responseId) {
    return jsonResponse({ error: "Missing required field: responseId" }, 400);
  }

  const liveDate = parseDate(payload.targetLiveDate);
  const urgency = normalizeUrgency(payload.urgency);
  const instagramTags = normalizeArray(payload.instagramTags);
  const linkedInTags = normalizeArray(payload.linkedInTags);
  const logos = normalizeArray(payload.logos);
  const workingAssets = normalizeArray(payload.workingAssets);
  const channelTags = [
    ...instagramTags.map((tag) => `Instagram: ${tag}`),
    ...linkedInTags.map((tag) => `LinkedIn: ${tag}`),
  ];

  const project = {
    title,
    priority: priorityFromUrgency(urgency),
    status: "Ready for Production",
    deadline: liveDate,
    publish_date: liveDate,
    files_url: firstValue([...workingAssets, ...logos]),
    assigned_to: [],
    edit_notes: buildEditNotes(payload, { instagramTags, linkedInTags, logos, workingAssets }),
    channel_tags: channelTags,
    source: "google_form",
    intake_response_id: responseId,
    intake_submitted_at: parseTimestamp(payload.submittedAt),
    intake_respondent_email: normalizeString(payload.respondentEmail) || null,
    intake_contact_name: normalizeString(payload.contactName) || null,
    intake_urgency: urgency,
    intake_reviewed: false,
    intake_payload: payload,
  };

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase
    .from("projects")
    .upsert(project, { onConflict: "intake_response_id" })
    .select("id, intake_response_id")
    .single();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true, project: data });
});

function getAuthorizedSupabaseKey(req: Request, serviceRoleKey: string): string | null {
  const configuredSecret = Deno.env.get("MARKETING_INTAKE_WEBHOOK_SECRET");
  const providedSecret = req.headers.get("x-marketing-intake-secret");
  const bearerToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (configuredSecret && providedSecret === configuredSecret) {
    return serviceRoleKey;
  }

  if (bearerToken === serviceRoleKey || bearerToken?.startsWith("sb_secret_")) {
    return bearerToken;
  }

  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeArray(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map(normalizeString).filter(Boolean);
  }

  return String(value)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeUrgency(value: unknown): number | null {
  const urgency = Number(value);

  if (!Number.isFinite(urgency) || urgency < 1 || urgency > 5) {
    return null;
  }

  return Math.round(urgency);
}

function priorityFromUrgency(urgency: number | null): "P0" | "P1" | "P2" | null {
  if (urgency === null) {
    return null;
  }

  if (urgency >= 5) {
    return "P0";
  }

  if (urgency >= 3) {
    return "P1";
  }

  return "P2";
}

function firstValue(values: string[]): string | null {
  return values.find(Boolean) || null;
}

function parseDate(value: unknown): string | null {
  const raw = normalizeString(value);

  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function parseTimestamp(value: unknown): string | null {
  const raw = normalizeString(value);

  if (!raw) {
    return new Date().toISOString();
  }

  const parsed = new Date(raw);

  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function buildEditNotes(
  payload: IntakePayload,
  assets: {
    instagramTags: string[];
    linkedInTags: string[];
    logos: string[];
    workingAssets: string[];
  },
): string {
  return [
    `Submitted via LSP Brand & Visibility Intake.`,
    `Point of contact: ${normalizeString(payload.contactName) || "N/A"}`,
    `Respondent email: ${normalizeString(payload.respondentEmail) || "N/A"}`,
    `Target live date: ${normalizeString(payload.targetLiveDate) || "N/A"}`,
    `Urgency: ${payload.urgency ?? "N/A"}`,
    "",
    "Language/key messaging:",
    normalizeString(payload.messaging) || "N/A",
    "",
    `Instagram tags: ${assets.instagramTags.join(", ") || "N/A"}`,
    `LinkedIn tags: ${assets.linkedInTags.join(", ") || "N/A"}`,
    `Working assets: ${assets.workingAssets.join(", ") || "N/A"}`,
    `Logos: ${assets.logos.join(", ") || "N/A"}`,
  ].join("\n");
}
