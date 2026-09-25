// src/lib/galaLive/findSeat.js
//
// "Find my table" for guests' phones on /gala/live. The guest types their name
// once; gala_display_find_seat (supabase/migrations/20260925160000_...) answers
// with at most five candidates, each only {name, table_number, seat,
// late_night}. The typed name and the chosen answer live in this browser's
// localStorage and nowhere else, so the next open is instant.

import { supabase as sharedClient } from "../supabaseClient.js";

export const FIND_SEAT_STORAGE = "lsp.gala.findseat.v1";
export const FIND_SEAT_REFRESH_MS = 3 * 60_000;

/** {query, pick, skipped} from localStorage; a clean slate when unreadable. */
export function readFindSeat() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FIND_SEAT_STORAGE) || "null");
    if (!raw || typeof raw !== "object") return { query: "", pick: null, skipped: false };
    return {
      query: typeof raw.query === "string" ? raw.query.slice(0, 120) : "",
      pick: cleanMatch(raw.pick),
      skipped: raw.skipped === true,
    };
  } catch {
    return { query: "", pick: null, skipped: false };
  }
}

export function writeFindSeat(state) {
  try {
    window.localStorage.setItem(
      FIND_SEAT_STORAGE,
      JSON.stringify({ query: state.query || "", pick: cleanMatch(state.pick), skipped: !!state.skipped }),
    );
  } catch {
    /* private mode: works for this visit only */
  }
}

function cleanMatch(m) {
  if (!m || typeof m !== "object" || typeof m.name !== "string") return null;
  const table = Number(m.table_number);
  const seat = Number(m.seat);
  return {
    name: m.name.slice(0, 120),
    table_number: Number.isFinite(table) && m.table_number !== null ? table : null,
    seat: Number.isFinite(seat) && m.seat !== null ? seat : null,
    late_night: m.late_night === true,
  };
}

/**
 * -> {ok: true, matches: [...]} | {ok: false, reason: 'short' | 'no-plan' | 'offline' | 'rpc'}
 */
export async function findSeat(event, query, client = sharedClient) {
  if (!client) return { ok: false, reason: "offline" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const { data, error } = await client
      .rpc("gala_display_find_seat", { p_event: event, p_query: String(query || "").slice(0, 120) })
      .abortSignal(controller.signal);
    if (error) return { ok: false, reason: "rpc" };
    if (!data || typeof data !== "object") return { ok: false, reason: "rpc" };
    if (!data.ok) return { ok: false, reason: data.reason || "rpc" };
    return { ok: true, matches: (Array.isArray(data.matches) ? data.matches : []).map(cleanMatch).filter(Boolean).slice(0, 5) };
  } catch {
    return { ok: false, reason: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

export const sameMatch = (a, b) =>
  !!a && !!b && a.name === b.name && a.table_number === b.table_number && a.seat === b.seat && a.late_night === b.late_night;
