// Gala module adapter. The ONLY file that knows the real table, view and RPC
// names for the gala module; every naming difference between report
// authors and every future rename is absorbed here (see
// docs/gala-2026/07-admin-dashboard-plan.md section "Companion plans").
// UI components never call supabase.from(...) or supabase.rpc(...)
// directly: they call the functions below, which take the shared
// `supabase` client (src/lib/supabaseClient.js) as their first argument,
// the same convention as every other src/lib/dashboard/*.js module.
//
// Scope of this file today (ticket G4): the Gala 2025 archive is fully
// wired against the real, frozen 2025 tables. Gala 2026 live operations
// (check-in, the donations terminal, realtime) are owned by other tickets
// and are stubbed below so this adapter's shape is stable for anything
// that wants to start building against it now.

import {
  normalizeGuestRow,
  normalizeGiftRow,
} from "./galaMath.js";

/* ------------------------------------------------------------------ *
 * Constants: every table, view and RPC name lives here and ONLY here.
 * ------------------------------------------------------------------ */

const TABLES = {
  // 2025 archive (frozen in place; see MASTER-PLAN section 2 "2025 archive").
  guests2025: "gala_guests",
  donations2025: "gala_donations",
};

// 2026 tables/RPCs do not exist yet (owned by tickets G1/G2, the DB plan).
// Names are the proposals from docs/gala-2026/00-MASTER-PLAN.md section 2
// ("Realtime") and 07-admin-dashboard-plan.md section 5.4. Keep them here so
// the moment those RPCs ship, only this block needs to change.
const RPCS_2026 = {
  checkinStats: "gala_checkin_stats", // aggregate arrivals/paddles for Overview tiles
  checkinLoad: "gala_checkin_load", // full guest list for the check-in desk
  checkinSince: "gala_checkin_since", // incremental sync for the live store (version cursor)
  donationAdd: "gala_donation_add", // record a gift from the donations terminal
};

const PAGE_SIZE = 1000; // PostgREST's default row cap; page past it, never trust one page.
const MAX_PAGES = 20; // 142 guest rows / 29 donation rows at migration time; this is generous headroom.

const NOT_DEPLOYED = {
  ok: false,
  reason: "not_deployed",
  message: "Gala 2026 database upgrade is not deployed yet.",
};

// GalaEvent shape (docs/gala-2026/07-admin-dashboard-plan.md section 5.1).
// Copy rule: "Gala 2025" only, never "Noche Inolvidable" in new UI.
const ARCHIVE_2025_EVENT = {
  slug: "gala-2025",
  name: "Gala 2025",
  shortName: "Gala 2025",
  year: 2025,
  startsAt: null,
  venue: "",
  status: "archived",
  isTest: false,
  isCurrent: false,
  goalAmount: null,
  storage: "tables",
  summary: null,
};

const UPCOMING_2026_EVENT = {
  slug: "gala-2026",
  name: "Gala 2026",
  shortName: "Gala 2026",
  year: 2026,
  startsAt: "2026-09-25T18:00:00-05:00",
  venue: "Museum of Contemporary Art Chicago",
  status: "upcoming",
  isTest: false,
  isCurrent: true,
  goalAmount: null,
  storage: "tables",
  summary: null,
};

/* ------------------------------------------------------------------ *
 * internal: paged select past the 1,000-row PostgREST cap
 * ------------------------------------------------------------------ */

async function fetchAllRows(supabase, table, orderColumn) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    // eslint-disable-next-line no-await-in-loop -- pages must be fetched in order to stop early
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { rows, error };
    for (const row of data || []) rows.push(row);
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

// Lightweight event picker list. No `gala_events` table exists yet (that is
// the DB ticket's job), so this is a plain, synchronous list rather than a
// query. { slug, label, status } is the minimal shape a switcher needs.
export function listEvents() {
  return [
    { slug: "gala-2026", label: "Gala 2026", status: "upcoming" },
    { slug: "gala-2025", label: "Gala 2025", status: "archive" },
  ];
}

// Full GalaEvent objects (section 5.1 shape), for callers that follow the
// plan's richer adapter contract (e.g. the future GalaView module root).
// Same "no gala_events table yet" situation as listEvents: this always
// returns the two known events. Once ADM's DB ticket ships `gala_events`,
// this is where a real query plus PGRST205/42P01 fallback would go.
export async function listGalaEvents(_supabase) {
  return { events: [{ ...UPCOMING_2026_EVENT }, { ...ARCHIVE_2025_EVENT }], error: null };
}

/* ------------------------------------------------------------------ *
 * Gala 2025 archive (fully working, read-only)
 * ------------------------------------------------------------------ */

// Reads the two frozen 2025 tables in full and returns normalized data:
// { data: { event, guests, donations }, error }. Never writes: the 2025
// tables are read-only by policy (MASTER-PLAN section 2, "2025 archive").
export async function loadArchive(supabase, slug = "gala-2025") {
  if (slug !== "gala-2025") {
    return {
      data: null,
      error: { message: `loadArchive only supports the gala-2025 archive today (got "${slug}").` },
    };
  }
  if (!supabase) {
    return { data: null, error: { message: "A Supabase client is required." } };
  }

  const [guestResult, donationResult] = await Promise.all([
    fetchAllRows(supabase, TABLES.guests2025, "paddle_number"),
    fetchAllRows(supabase, TABLES.donations2025, "created_at"),
  ]);

  if (guestResult.error || donationResult.error) {
    return { data: null, error: guestResult.error || donationResult.error };
  }

  const guests = guestResult.rows.map(normalizeGuestRow).filter(Boolean);
  const donations = donationResult.rows.map(normalizeGiftRow).filter(Boolean);

  return {
    data: { event: { ...ARCHIVE_2025_EVENT }, guests, donations },
    error: null,
  };
}

// Plan-contract alias (section 5.2): `loadEventData(supabase, event) ->
// { guests, gifts, error }`. Archive callers should prefer loadArchive
// above; this exists so a module written against the plan's exact function
// names (e.g. a future GalaView.svelte) works unchanged.
export async function loadEventData(supabase, event) {
  const slug = typeof event === "string" ? event : event?.slug;
  if (slug === "gala-2025") {
    const { data, error } = await loadArchive(supabase, slug);
    return { guests: data?.guests || [], gifts: data?.donations || [], error };
  }
  return { guests: [], gifts: [], error: slug === "gala-2026" ? NOT_DEPLOYED : { message: `Unknown event "${slug}".` } };
}

/* ------------------------------------------------------------------ *
 * Gala 2026 live operations — STUBBED
 *
 * The check-in concurrency plan and the donations-terminal plan (see
 * MASTER-PLAN section 2 "2026 tables" / "Realtime") own the migration that
 * creates these RPCs. Every function below fails soft with
 * reason: "not_deployed" instead of throwing, so a UI built against this
 * adapter today keeps working once the real RPCs land: only the body of
 * these functions changes, not their signatures or the reason contract.
 * ------------------------------------------------------------------ */

// TODO(DB ticket): call RPC `gala_checkin_stats(p_event)` for the live
// Overview tiles (arrived/expected, paddles issued, totals).
export async function loadCheckinStats(_supabase, _eventSlug) {
  return { ...NOT_DEPLOYED };
}

// TODO(DB ticket): call RPC `gala_checkin_load(p_event)` for the full guest
// list behind the check-in desk.
export async function loadCheckinRoster(_supabase, _eventSlug) {
  return { ...NOT_DEPLOYED };
}

// TODO(DB ticket): call RPC `gala_checkin_since(p_event, p_version)` for the
// live store's incremental sync (see galaLive.svelte.js in the plan).
export async function loadCheckinSince(_supabase, _eventSlug, _version) {
  return { ...NOT_DEPLOYED };
}

// TODO(DB ticket): call RPC `gala_donation_add(...)` from the donations
// terminal (idempotent on a client-generated op id; see plan section 5.4
// `gala_record_gift`, named `gala_donation_add` in MASTER-PLAN section 2).
export async function recordDonation2026(_supabase, _payload) {
  return { ...NOT_DEPLOYED };
}

// Exposed for callers that want to check a specific RPC's deployment
// status by name rather than by calling one of the wrappers above.
export const GALA_2026_RPCS = { ...RPCS_2026 };
