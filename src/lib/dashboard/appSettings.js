// Client helper for public.app_settings (key/value). SELECT is open to any
// signed-in user; writes are superuser-only (enforced by RLS).

export const FEEDBACK_RECIPIENT_KEY = "feedback_recipient_id";

// Returns { value, error }. value is the stored jsonb, decoded (a string/uuid
// for feedback_recipient_id), or null when unset.
export async function getSetting(supabase, key) {
  if (!supabase || !key) return { value: null, error: null };

  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  return { value: error ? null : (data?.value ?? null), error: error || null };
}

export async function setSetting(supabase, key, value) {
  return supabase
    .from("app_settings")
    .upsert({ key, value }, { onConflict: "key" })
    .select("value")
    .single();
}
