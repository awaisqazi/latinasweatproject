// Client-side module access checks. These are UX only; the database
// enforces real access through RLS policies built on app_private.has_module().
import { isSuperuser } from "./roles";

// Retained for any external default needs. loadModuleGrants no longer grants
// these on error: it retries transient failures, then fails closed so the
// shell can prompt a retry instead of silently granting access.
export const FALLBACK_GRANTS = ["marketing"];

export function hasModule(profile, grants, moduleKey) {
  if (!moduleKey) return false;
  if (isSuperuser(profile)) return true;
  return Array.isArray(grants) && grants.includes(moduleKey);
}

// Returns { grants, error }. A network blip should not hide a user's modules,
// so we retry a couple of times; if it still fails we return no grants plus the
// error so the dashboard can show a retry prompt rather than fabricate access.
export async function loadModuleGrants(supabase, profileId, { retries = 2 } = {}) {
  if (!profileId) return { grants: [], error: null };

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { data, error } = await supabase
      .from("profile_modules")
      .select("module")
      .eq("profile_id", profileId);

    if (!error) {
      return { grants: (data || []).map((row) => row.module), error: null };
    }

    lastError = error;

    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  return { grants: [], error: lastError };
}
