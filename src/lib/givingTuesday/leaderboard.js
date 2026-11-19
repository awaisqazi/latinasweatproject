// LSP Giving Tuesday leaderboard rules, shared by /givingtuesday
// (GivingTuesdayApp.svelte: the board's "top five" race and the full list
// order) and the homepage band (GivingTuesdayHomeBand.astro via
// placement.js). One place, so the two placements cannot drift apart.
//
//   order:   amount raised (most first), then first name, then full name
//            (case and accent insensitive)
//   leaders: only people who have raised more than $0, at most LEAD_MAX;
//            fewer than LEAD_MIN of them and there is no leaderboard
//   mats:    each mat runs a share of the lane, raised / leader's raised,
//            never shorter than MAT_MIN so the shortest still reads as a mat
//
// Plain JS (no Svelte, no supabase-js), safe to import anywhere.
import { givingRoutes } from "../../data/givingTuesday.js";

export const LEAD_MAX = 5;
export const LEAD_MIN = 3;
export const MAT_MIN = 0.24;

// Board mat colours, by position in the order (the list's own palette).
export const BOARD_MATS = ["#0f766e", "#c7602d", "#d9467a", "#0369a1", "#6d4aa8", "#1e1e1e"];
// The same hues lifted to hold contrast on the ink band (#1e1e1e).
export const BOARD_MATS_ON_INK = ["#2bb3a3", "#e2804e", "#ec6b9b", "#3f9fd8", "#a487dc", "#e9e4da"];

export function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

const cmp = (a, b) => String(a).localeCompare(String(b), "en", { sensitivity: "base" });

export function compareFundraisers(a, b) {
  return (
    (Number(b.raised_cents) || 0) - (Number(a.raised_cents) || 0) ||
    cmp(firstName(a.name), firstName(b.name)) ||
    cmp(a.name, b.name)
  );
}

/** A sorted copy of the fundraiser list. */
export function rankFundraisers(list) {
  return [...(list ?? [])].sort(compareFundraisers);
}

/** The leaderboard: [] unless at least LEAD_MIN people have raised money. */
export function topRaisers(list) {
  const top = rankFundraisers(list)
    .filter((f) => (Number(f.raised_cents) || 0) > 0)
    .slice(0, LEAD_MAX);
  return top.length >= LEAD_MIN ? top : [];
}

/** Share of the lane a mat runs (0..1): the leader's runs the full lane. */
export function matShare(raised, leaderRaised) {
  const lead = Number(leaderRaised) || 0;
  if (lead <= 0) return MAT_MIN;
  return Math.max(MAT_MIN, Math.min(1, (Number(raised) || 0) / lead));
}

/** The campaign Give link, falling back to /donate (as the page does). */
export function campaignGiveUrl(campaign, base = "/") {
  const b = base.endsWith("/") ? base : `${base}/`;
  return campaign?.give_url || `${b}${givingRoutes.fallbackGive.replace(/^\//, "")}`;
}

/** Reached the instructor's goal ($150): the yellow ring around the face. */
export function reachedGoal(f, thresholdCents) {
  const goal = f.goal_cents || thresholdCents;
  return !!(f.reached || (Number(f.raised_cents) || 0) >= goal);
}
