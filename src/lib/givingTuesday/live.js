// Transport for LSP Giving Tuesday. Contract (fixed, built by the backend
// agent): rpc("giving_public", { p_campaign }) returns
//   { ok, campaign: { slug, title, goal_cents, threshold_cents, starts_at,
//     ends_at, give_url, prize_label, board_open, signup_open },
//     total_cents, gift_count, fundraiser_count, reached_count,
//     fundraisers: [{ slug, name, cohort, avatar, why, raised_cents,
//     gift_count, goal_cents, reached, give_url }],
//     turnstile_site_key, server_time }
// or { ok: false, reason: "not_found" }. No donor names, ever.
//
// Dev only: `?mock=<0|5|40>&total=<dollars>` (plus `now=<iso>`, `mock=fail`,
// `board=closed`, `signup=closed`, `prize=<text>`, `reason=<code>`, `tick=1`) swaps the
// RPC for src/lib/givingTuesday/mock.js. The branch sits behind
// import.meta.env.DEV, so production builds drop it and never load the mock.

import { supabase, SUPABASE_CONFIG_ERROR } from "../supabaseClient.js";
import { GIVING_SLUG } from "../../data/givingTuesday.js";

const CALL_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Dev-only mock params, or null. Always null in production builds.
export function mockParams() {
  if (!import.meta.env.DEV) return null;
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  return q.has("mock") ? q : null;
}

// Dev-only clock override (?now=2026-12-01T18:00:00Z) for phase QA.
export function nowOverride() {
  const q = mockParams();
  const v = q?.get("now");
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/** One call. Resolves to the payload ({ ok: true, ... }) or throws. */
export async function fetchGivingPublic(campaign = GIVING_SLUG) {
  if (import.meta.env.DEV) {
    const q = mockParams();
    if (q) {
      const { mockGivingPublic } = await import("./mock.js");
      return mockGivingPublic(q);
    }
  }
  if (SUPABASE_CONFIG_ERROR || !supabase) throw new Error(SUPABASE_CONFIG_ERROR || "not configured");
  const { data, error } = await withTimeout(supabase.rpc("giving_public", { p_campaign: campaign }), CALL_TIMEOUT_MS);
  if (error) throw error;
  if (!data || data.ok !== true) throw new Error(data?.reason || "not_ok");
  return data;
}

/**
 * Poll while the tab is visible. Calls onData(payload) on success and
 * onError(err) on failure (the last good payload stays on screen). Pauses
 * when the tab is hidden and refreshes at once when it comes back. Returns a
 * stop() function.
 */
export function startPolling({ intervalMs, onData, onError }) {
  // Dev mock `tick=1`: poll fast so the rising mock total can be watched.
  if (import.meta.env.DEV && mockParams()?.get("tick")) intervalMs = 3500;
  let timer = null;
  let stopped = false;
  let inFlight = false;

  const tick = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      onData(await fetchGivingPublic());
    } catch (err) {
      onError?.(err);
    } finally {
      inFlight = false;
    }
  };
  const schedule = () => {
    clearInterval(timer);
    timer = null;
    if (!stopped && document.visibilityState === "visible") timer = setInterval(tick, intervalMs);
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") tick();
    schedule();
  };

  tick();
  schedule();
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

/** Sign-up call. Resolves to { ok: true } or { ok: false, reason }. */
export async function submitSignup(body) {
  if (import.meta.env.DEV) {
    const q = mockParams();
    if (q) {
      await new Promise((r) => setTimeout(r, 900));
      const reason = q.get("reason");
      return reason ? { ok: false, reason } : { ok: true };
    }
  }
  if (SUPABASE_CONFIG_ERROR || !supabase) return { ok: false, reason: "network" };
  try {
    const { data, error } = await supabase.functions.invoke("giving-signup", { body });
    // Non-2xx surfaces as FunctionsHttpError; the reason is in the body.
    if (error) {
      let reason = "";
      try {
        const parsed = await error.context.json();
        reason = parsed?.reason || "";
      } catch {
        reason = "";
      }
      return { ok: false, reason: reason || "network" };
    }
    if (!data?.ok) return { ok: false, reason: data?.reason || "unknown" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "network" };
  }
}
