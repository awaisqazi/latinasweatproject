// src/lib/galaLive/stores.js
//
// The only things that cross from the director and the feed into Svelte.
// 60 Hz data (particle positions, uniforms) never comes through here: the
// director calls the SceneHandle imperatively. What lands in a store is what a
// human reads (05 section 5.4).

import { writable } from "svelte/store";
import { STATE_DEFAULTS, mergeState } from "./config.js";

/** The operator row, merged over compiled defaults. Never null. */
export const liveState = writable(mergeState(STATE_DEFAULTS));

/** What the panels print. */
export const totals = writable({ cents: 0, goalCents: STATE_DEFAULTS.goal_cents, pct: 0, bump: false });
export const heroCard = writable(null);
export const rollRows = writable([]);
export const banner = writable(null);

/** Transport health, for the HUD and the small status dot. */
export const feedStatus = writable({
  mode: "public", // display | public | demo
  named: false,
  live: false,
  cursor: 0,
  lastOkAt: 0,
  ageMs: 0,
  polls: 0,
  errors: 0,
  lastError: "",
});

/** Renderer health, for the HUD. */
export const fxStatus = writable({
  level: "full",
  requested: "full",
  fps: 0,
  ms: 0,
  draws: 0,
  degrade: 0,
  rebuilds: 0,
  losses: 0,
  canvas: false,
  pixelRatio: 1,
});

/** Director telemetry, for the HUD. */
export const showStatus = writable({
  mode: "IDLE",
  queue: 0,
  inFlight: 0,
  drain: 0,
  litBody: 0,
  nBody: 0,
  litHalo: 0,
  nHalo: 0,
  coreLit: false,
  overflow: 0,
  maxLagMs: 0,
  trueCents: 0,
  launchedCents: 0,
  landedCents: 0,
  hold: false,
});
