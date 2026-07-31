import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const SUPABASE_CONFIG_ERROR =
  !supabaseUrl || !supabasePublishableKey
    ? "Supabase is not configured for this dashboard."
    : "";

// MarianaTek's web-integration "polyfills" bundle is served per user agent, and
// the mobile-Safari variant monkey-patches window.fetch (and Promise) in a way
// that breaks supabase-js requests: endless loading spinners and failed
// submissions, which is why "Request Desktop Website" used to work around it.
// Layout.astro captures the pristine fetch as its very first script, before any
// third party can run, and we prefer that reference here. That keeps supabase
// immune on every page, including the booking pages that legitimately embed
// MarianaTek widgets.
//
// SSR safety: this module is evaluated on the server when client:load islands
// are rendered, so every window access is guarded and the fallback is the
// ambient global fetch.
function lspFetch(...args) {
  if (typeof window !== "undefined") {
    if (typeof window.__lspNativeFetch === "function") {
      return window.__lspNativeFetch(...args);
    }
    if (typeof window.fetch === "function") {
      return window.fetch(...args);
    }
  }

  return fetch(...args);
}

export const supabase = SUPABASE_CONFIG_ERROR
  ? null
  : createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
      global: {
        fetch: lspFetch,
      },
    });

export function getSupabaseClient() {
  if (!supabase) {
    throw new Error(SUPABASE_CONFIG_ERROR);
  }

  return supabase;
}
