// src/lib/galaLive/config.js
//
// Every constant and every on-screen string for /gala/live lives here.
// Spec: docs/gala-2026/05-live-3d-concept.md sections 4.2, 4.3, 7.3, 7.4.
// House rules: no em-dashes anywhere, the separator is the middot. The event is
// publicly the "Annual Gala"; no other event name is ever printed.

/** Bumped by hand. Compared against state.min_client_version. */
export const CLIENT_VERSION = "2026.09.25";

/** The slug the page reads unless a DEV-only ?event= override says otherwise. */
export const DEFAULT_EVENT = "gala-2026";

/** Deterministic seed for slot layout and particle attributes. */
export const DEFAULT_SEED = 20260925;

/* ---------------------------------------------------------------------- */
/* Runtime state: compiled defaults                                        */
/* ---------------------------------------------------------------------- */

// docs/gala-2026/10-display-rpc-contract.md section 1. A failed read must change
// nothing, so every key the page reads has a safe value here. goal_cents is the
// $75,000 the 2025 code assumed, per 05 section 10 question 1.
export const STATE_DEFAULTS = Object.freeze({
  ok: true,
  live: false,
  event: DEFAULT_EVENT,
  scene: "ambient",
  total_cents: 0,
  gift_count: 0,
  goal_cents: 7_500_000,
  percent: 0,
  count_mode: "all",
  current_level_cents: null,
  levels: [],
  tier_cents: [25000, 100000, 500000],
  show_names: true,
  fx_mode: "full",
  publish_delay_ms: 4000,
  confirm_threshold_cents: 250000,
  match: { active: false },
  auction: {},
  stretch: { active: false },
  message: "",
  hold: false,
  poll_ms: 10000,
  reload_nonce: "",
  min_client_version: "",
  cue: null,
  cue_seq: 0,
  config: {},
  // Run of show pointer (20260925090000): {segment_id, step, honoree_overrides,
  // updated_at}. {} = never started; the program scene then opens on seating.
  program: {},
  version: 0,
});

/**
 * The state the display actually runs on: server values where present, compiled
 * defaults everywhere else. An unknown slug answers with `live:false` and
 * `scene:"blackout"`; the page shows ambient instead, so the projector is never
 * a black rectangle before the event row exists (ticket G5).
 */
export function mergeState(snapshot) {
  const s = snapshot && typeof snapshot === "object" ? snapshot : {};
  const out = { ...STATE_DEFAULTS };
  for (const k of Object.keys(STATE_DEFAULTS)) {
    if (s[k] !== undefined && s[k] !== null) out[k] = s[k];
  }
  // Nullable keys the loop above would have pinned to their default.
  out.current_level_cents = s.current_level_cents ?? null;
  out.cue = s.cue ?? null;
  out.live = s.live === true;
  if (!out.live) {
    out.scene = "ambient";
    out.fx_mode = STATE_DEFAULTS.fx_mode;
    out.goal_cents = STATE_DEFAULTS.goal_cents;
  }
  if (!SCENES.includes(out.scene)) out.scene = "ambient";
  if (!["full", "lite", "off"].includes(out.fx_mode)) out.fx_mode = "full";
  if (!Array.isArray(out.tier_cents) || !out.tier_cents.length) {
    out.tier_cents = STATE_DEFAULTS.tier_cents;
  }
  if (!Array.isArray(out.levels)) out.levels = [];
  if (!out.program || typeof out.program !== "object" || Array.isArray(out.program)) out.program = {};
  if (!(out.goal_cents > 0)) out.goal_cents = STATE_DEFAULTS.goal_cents;
  const poll = Number(out.poll_ms);
  out.poll_ms = Number.isFinite(poll) ? Math.min(120000, Math.max(1000, poll)) : STATE_DEFAULTS.poll_ms;
  return out;
}

export const SCENES = ["ambient", "program", "appeal", "auction", "finale", "thanks", "blackout"];

/** Scenes that run the full gift choreography. */
export const GIFT_SCENES = new Set(["ambient", "program", "appeal", "auction", "finale", "thanks"]);

/* ---------------------------------------------------------------------- */
/* Gift tiers (05 section 4.2). Edges come from state.tier_cents.          */
/* ---------------------------------------------------------------------- */

/** Visual weight per tier. Index 0 is tier 1. */
export const TIER_VISUALS = Object.freeze([
  { id: "T1", gap: 0.9, flight: 1.5, dwell: 2.2, head: 1.0, sparks: 24, confetti: 0, confettiMode: "pop", ring: false, eyebrow: "New gift" },
  { id: "T2", gap: 1.4, flight: 1.7, dwell: 3.0, head: 1.5, sparks: 60, confetti: 0, confettiMode: "pop", ring: false, eyebrow: "New gift" },
  { id: "T3", gap: 3.0, flight: 2.0, dwell: 4.5, head: 2.2, sparks: 160, confetti: 140, confettiMode: "pop", ring: true, eyebrow: "Generous gift" },
  { id: "T4", gap: 5.0, flight: 2.6, dwell: 6.0, head: 3.2, sparks: 420, confetti: 480, confettiMode: "rain", ring: true, eyebrow: "Incredible gift" },
]);

/** tier = 1 + count of edges <= amount (10 section 2), clamped to the 4 visuals. */
export function tierOf(amountCents, edges = STATE_DEFAULTS.tier_cents) {
  const amt = Number(amountCents) || 0;
  let n = 1;
  for (const e of edges) if (amt >= Number(e)) n++;
  return Math.min(TIER_VISUALS.length, Math.max(1, n));
}

export const tierVisual = (tier) => TIER_VISUALS[Math.min(TIER_VISUALS.length, Math.max(1, tier || 1)) - 1];

/* ---------------------------------------------------------------------- */
/* Queue (05 section 4.3)                                                  */
/* ---------------------------------------------------------------------- */

export const QUEUE = Object.freeze({
  LAG_MAX: 10, // seconds from arrival to the name being on screen
  CARD_MIN: 2.5, // a hero card is never replaced sooner
  GAP_FLOOR: 0.12, // 8 launches per second
  SOFT_CAP: 60, // above this, T1/T2 get rows only
  RESUME: 20, // comets for everyone again below this
  ROLL_MAX: 12, // rows kept in the DOM
  ROLL_LIFE: 3.2, // seconds a roll row lives
  INFLIGHT_MAX: 24,
  SEEN_MAX: 800,
  SILENT_CATCHUP_AGE_MS: 90_000, // older than this on a reload: row only, no comet
});

export const MILESTONES = Object.freeze([0.25, 0.5, 0.75, 1.0]);

/* ---------------------------------------------------------------------- */
/* Timing (05 section 7.3)                                                 */
/* ---------------------------------------------------------------------- */

export const TIMING = Object.freeze({
  countUpK: 3.4, // exponential damp on the DOM total
  fillK: 2.0, // fill front damp
  anchorK: 4.0, // X anchor spring
  heatDecay: 0.25,
  flashDecay: 1.6,
  flashCapMilestone: 0.7,
  flashCapT4: 0.45,
  cardToComet: 0.6, // comet launches this long after the card appears
  starRipple: 0.7,
  bannerMilestone: 6,
  bannerGoal: 12,
  goalRamp: 2.5,
  reconcileTween: 1.2,
});

/* ---------------------------------------------------------------------- */
/* Particle budgets per fx level (05 section 6)                            */
/* ---------------------------------------------------------------------- */

export const FX_COUNTS = Object.freeze({
  full: { body: 1500, core: 90, halo: 520, dust: 6000, comets: 24, trail: 48, sparks: 4000, confetti: 1400, rings: 4, bloom: true },
  lite: { body: 750, core: 40, halo: 250, dust: 1500, comets: 24, trail: 16, sparks: 1200, confetti: 400, rings: 4, bloom: false },
});

/** Projector luminance floors (05 section 3.6). */
export const PROJECTOR = Object.freeze({
  laptop: { lift: 0.0, ghostOutline: 0.16, ghostStars: 0.22, dustScale: 1.0 },
  projector: { lift: 0.012, ghostOutline: 0.26, ghostStars: 0.32, dustScale: 1.3 },
});

/** Identity palette (04 section 2.1). */
export const PALETTE = Object.freeze({
  ink: "#05070c",
  navy: "#111a27",
  bgTop: "#080b11",
  bgMid: "#121c2a",
  bgBot: "#03050a",
  cream: "#fff8ef",
  warm: "#f2e4d2",
  gold: "#ffbd59",
  goldDeep: "#b9842f",
  goldHi: "#fff1be",
});

/* ---------------------------------------------------------------------- */
/* Copy (05 section 7.4). Reviewed for house style: no em-dashes.          */
/* ---------------------------------------------------------------------- */

export const COPY = Object.freeze({
  org: "The Latina Sweat Project",
  eventLine: "Annual Gala · Live",
  raisedTonight: "Raised tonight",
  ofGoal: "of GOAL goal",
  toGo: "to go",
  anonymous: "Anonymous",
  giveNow: "Give now",
  scanToGive: "Scan to give",
  askLevel: "Raise your paddle at",
  currentBid: "Current bid",
  lot: "Lot",
  goingOnce: "Going once",
  goingTwice: "Going twice",
  sold: "Sold",
  thanks: "Gracias, comunidad",
  thanksEyebrow: "Thank you",
  goalReached: "Goal reached",
  matchEyebrow: "Match",
  sponsorsEyebrow: "With thanks to our sponsors",
  ambientTitle: "Annual Gala",
  ambientLine: "The Latina Sweat Project at MCA Chicago",
  programEyebrow: "Now",
  demoBadge: "Demo data",
  publicBadge: "Live totals",
  noNamesNote: "Names appear on the room display",
  milestones: {
    0.25: { small: "25% of goal", text: "We are on our way" },
    0.5: { small: "50% of goal", text: "Halfway there" },
    0.75: { small: "75% of goal", text: "The final stretch" },
    1: { small: "Goal reached", text: "Gracias, comunidad" },
  },
});

/** Fake donor names. Demo mode only, never the network (05 section 5.9). */
export const DEMO_NAMES = Object.freeze([
  "Marisol Vega", "Tomas Arriaga", "Lucia Benavides", "Rafa Quintanilla", "Ines Calloway",
  "The Okafor Family", "Dolores Pruitt", "Anonymous", "Table 12", "Paloma Estrada",
  "Beto Landry", "Ximena Duarte", "Nadia Farouk", "Gus Pellegrino", "Carmen Ibarra",
  "Wen Zhao", "Priya Raman", "Oscar Tillman", "Familia Cordero", "Yesenia Roldan",
  "Marcus Adeyemi", "Sol y Luna Studio (fake)",
]);

/** Paddle-raise ladder for the demo generator, in cents. */
export const DEMO_LEVELS = Object.freeze([
  5000, 10000, 10000, 10000, 25000, 25000, 25000, 50000, 50000, 100000, 100000, 250000, 500000,
]);

/* ---------------------------------------------------------------------- */
/* Formatting                                                             */
/* ---------------------------------------------------------------------- */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Cents to "$1,234". Never shows cents: the room reads whole dollars. */
export const money = (cents) => usd.format(Math.round((Number(cents) || 0) / 100));

/** Cents to "$1,234" from a dollars number (demo helper). */
export const moneyFromDollars = (dollars) => usd.format(Math.round(Number(dollars) || 0));
