// Instructor portal: the two dashboard RPCs that let staff edit the content
// document from /admin#instructor-portal.
// SQL: supabase/migrations/20261127120000_instructor_portal_admin.sql.
// Contract: ./README.md ("Editing content").
//
// Rules this file exists to keep:
//   - it never creates a Supabase client: the dashboard passes in the shared,
//     signed-in one, so the caller's own login is what Postgres checks;
//   - nothing here throws. A dead network, a missing migration or a refusal is
//     a result value with a `reason`;
//   - the version (`updatedAt`) is an opaque string. It goes back to the server
//     exactly as it came: timestamptz carries microseconds and a JavaScript
//     Date would round them off, which would make every save look like a
//     conflict;
//   - content is never logged and never stored. It lives in the caller's memory.

const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const CALL_TIMEOUT_MS = 20000;

// Reasons the two RPCs can return (see the migration).
const SERVER_REASONS = new Set([
  "forbidden",
  "no-portal",
  "conflict",
  "locked-sections",
  "invalid-slug",
  "not-an-object",
  "bad-schema",
  "too-large",
  "missing-version",
]);

async function callRpc(supabase, name, args) {
  if (!supabase || typeof supabase.rpc !== "function") return { ok: false, reason: "config" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const { data, error } = await supabase.rpc(name, args).abortSignal(controller.signal);
    if (error) {
      // PostgREST cannot find the function: the migration is not applied yet.
      if (error.code === "PGRST202" || error.code === "42883") return { ok: false, reason: "not-installed" };
      // No EXECUTE for this role: the session ended and the call went out as anon.
      if (error.code === "42501") return { ok: false, reason: "signed-out" };
      if (error.code === "PGRST301" || error.code === "PGRST302") return { ok: false, reason: "signed-out" };
      return { ok: false, reason: "network" };
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, reason: "network" };
    return data;
  } catch {
    // AbortError (timeout) or a thrown fetch: both are "not right now".
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

function failure(res) {
  const reason = SERVER_REASONS.has(res?.reason) || ["config", "not-installed", "signed-out"].includes(res?.reason)
    ? res.reason
    : "network";
  return { ok: false, reason };
}

/**
 * The live document for a slug, for editing.
 * @param {object} supabase  the dashboard's signed-in client
 * @param {string} slug      "instructors", or "instructors-dev" while testing
 * @returns {Promise<{ ok: true, content: object, updatedAt: string, updatedBy: string | null }
 *                  | { ok: false, reason: string }>}
 */
export async function loadPortalForEdit(supabase, slug) {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return { ok: false, reason: "invalid-slug" };

  const res = await callRpc(supabase, "instructor_portal_admin_get", { p_slug: slug });
  if (res.ok !== true) return failure(res);

  const content = res.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return { ok: false, reason: "network" };
  if (typeof res.updated_at !== "string" || !res.updated_at) return { ok: false, reason: "network" };

  return {
    ok: true,
    content,
    updatedAt: res.updated_at,
    updatedBy: typeof res.updated_by === "string" && res.updated_by.trim() ? res.updated_by.trim() : null,
  };
}

/**
 * Save an edited document. Refused with reason "conflict" (and the live
 * `updatedAt`) when someone else saved after `expectedUpdatedAt` was loaded.
 * @param {object} supabase
 * @param {string} slug
 * @param {object} content            the whole document, already validated
 * @param {string} expectedUpdatedAt  the `updatedAt` this edit started from, untouched
 * @returns {Promise<{ ok: true, updatedAt: string, unchanged: boolean }
 *                  | { ok: false, reason: string, updatedAt?: string }>}
 */
export async function savePortalEdit(supabase, slug, content, expectedUpdatedAt) {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) return { ok: false, reason: "invalid-slug" };
  if (!content || typeof content !== "object" || Array.isArray(content)) return { ok: false, reason: "not-an-object" };
  if (typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt) return { ok: false, reason: "missing-version" };

  const res = await callRpc(supabase, "instructor_portal_admin_save", {
    p_slug: slug,
    p_content: content,
    p_expected_updated_at: expectedUpdatedAt,
  });

  if (res.ok === true) {
    if (typeof res.updated_at !== "string" || !res.updated_at) return { ok: false, reason: "network" };
    return { ok: true, updatedAt: res.updated_at, unchanged: res.unchanged === true };
  }

  const out = failure(res);
  if (out.reason === "conflict" && typeof res.updated_at === "string" && res.updated_at) {
    out.updatedAt = res.updated_at;
  }
  return out;
}

/** A plain sentence for each reason, for a message on screen. */
export function adminReasonText(reason) {
  switch (reason) {
    case "forbidden":
      return "You do not have access to edit the instructor portal. A superuser can turn it on for you in User Access.";
    case "signed-out":
      return "You have been signed out. Sign in again in another tab, then come back and try again.";
    case "not-installed":
      return "The portal editor is not switched on yet. The site owner needs to apply the database update first.";
    case "no-portal":
      return "There is no portal content to edit yet. The site owner has to load it first.";
    case "conflict":
      return "Someone else saved the portal while you were editing, so your changes were not saved.";
    case "locked-sections":
      return "This save would change a part of the portal that is read only here, so nothing was saved. Refresh and try again.";
    case "too-large":
      return "The portal content is too large to save. Shorten something and try again.";
    case "config":
      return "This site is not connected to the database, so the portal cannot be loaded.";
    case "invalid-slug":
    case "not-an-object":
    case "bad-schema":
    case "missing-version":
      return `The editor sent something the database did not accept (${reason}), so nothing was saved. Tell the site owner.`;
    default:
      return "Can't reach the portal right now. Check your connection and try again.";
  }
}
