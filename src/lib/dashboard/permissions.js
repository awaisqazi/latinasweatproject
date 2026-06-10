// Client-side module access checks. These are UX only; the database
// enforces real access through RLS policies built on app_private.has_module().

// If the grants query fails, fall back to marketing so a transient API issue
// does not lock out the existing team. A successful empty grant list means no
// explicitly assigned modules.
import { isSuperuser } from "./roles";

export const FALLBACK_GRANTS = ["marketing"];

export function hasModule(profile, grants, moduleKey) {
  if (!moduleKey) return false;
  if (isSuperuser(profile)) return true;
  return Array.isArray(grants) && grants.includes(moduleKey);
}

export async function loadModuleGrants(supabase, profileId) {
  if (!profileId) return FALLBACK_GRANTS;

  const { data, error } = await supabase
    .from("profile_modules")
    .select("module")
    .eq("profile_id", profileId);

  if (error) {
    return FALLBACK_GRANTS;
  }

  const grants = (data || []).map((row) => row.module);
  return grants;
}
