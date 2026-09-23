// src/lib/galaLive/giftFeed.js
//
// Transport. Contract: docs/gala-2026/10-display-rpc-contract.md.
//
//   PUBLIC   gala_display_public(p_event)                 totals only, no names
//   DISPLAY  gala_display_feed(p_event, key, cursor)      names, with a cursor
//
// Rules this file exists to keep:
//   * the display key comes from the URL fragment and never reaches a query
//     string, a log line, or any other server;
//   * only the numeric cursor is persisted, so a reload never replays a gift
//     and never drops one;
//   * a gift inside its publish delay holds the cursor. A poll that returns no
//     gifts while total_cents has moved is correct, not a bug. Never jump the
//     cursor to "catch up";
//   * a wrong or missing key degrades to PUBLIC quietly. The refusal shape is
//     identical to an event with no key configured, and we treat it that way.

import { supabase as sharedClient } from "../supabaseClient.js";
import { QUEUE } from "./config.js";

const CALL_TIMEOUT_MS = 8000;
const DISPLAY_POLL_MS = 1500;
const KEY_SESSION = "lsp.galaLive.k";
const CURSOR_KEY = "lsp.galaLive.cursor.v1";

/* ---------------------------------------------------------------------- */
/* The display key                                                        */
/* ---------------------------------------------------------------------- */

/**
 * Read `#k=<32 hex>` from the fragment. The fragment is left in place so an
 * operator reload keeps working, and mirrored into sessionStorage so a cue that
 * reloads the page cannot lose it. It is never printed and never logged.
 */
export function readDisplayKey() {
  let key = "";
  try {
    const hash = (window.location.hash || "").replace(/^#/, "");
    const params = new URLSearchParams(hash);
    key = (params.get("k") || "").trim();
  } catch {
    key = "";
  }
  if (!/^[0-9a-fA-F]{8,128}$/.test(key)) key = "";
  try {
    if (key) window.sessionStorage.setItem(KEY_SESSION, key);
    else key = window.sessionStorage.getItem(KEY_SESSION) || "";
  } catch {
    /* private mode: the key lives in memory for this page load only */
  }
  return key;
}

/* ---------------------------------------------------------------------- */
/* Cursor record (05 section 4.5)                                         */
/* ---------------------------------------------------------------------- */

const today = () => new Date().toISOString().slice(0, 10);

export function readCursorRecord(event) {
  try {
    const raw = window.localStorage.getItem(CURSOR_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || rec.event !== event || rec.day !== today()) return null;
    if (!Number.isFinite(Number(rec.cursor))) return null;
    return {
      cursor: Number(rec.cursor),
      cueSeq: Number(rec.cueSeq) || 0,
      milestones: Array.isArray(rec.milestones) ? rec.milestones.map(Number) : [],
      nonce: String(rec.nonce || ""),
    };
  } catch {
    return null;
  }
}

export function writeCursorRecord(event, rec) {
  try {
    window.localStorage.setItem(
      CURSOR_KEY,
      JSON.stringify({ v: 1, event, day: today(), cursor: rec.cursor | 0, cueSeq: rec.cueSeq | 0, milestones: rec.milestones || [], nonce: rec.nonce || "" }),
    );
  } catch {
    /* a projector in private mode still runs; it just replays nothing because
       it also remembers nothing. The cold-start path is silent either way. */
  }
}

export function clearCursorRecord() {
  try {
    window.localStorage.removeItem(CURSOR_KEY);
  } catch {
    /* fine */
  }
}

/* ---------------------------------------------------------------------- */
/* Polling                                                                */
/* ---------------------------------------------------------------------- */

async function callRpc(db, name, args) {
  if (!db) return { ok: false, reason: "offline" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const { data, error } = await db.rpc(name, args).abortSignal(controller.signal);
    if (error) return { ok: false, reason: "rpc", message: error.message || "" };
    if (!data || typeof data !== "object") return { ok: false, reason: "shape" };
    return data;
  } catch {
    return { ok: false, reason: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{event:string, key:string, director:object, onState:Function,
 *          onStatus:Function, client?:object, persist?:boolean,
 *          followServerPoll?:boolean}} opts
 *
 * The two trailing options exist for guest-facing readers such as the /lspgala
 * hub, and their defaults leave the projector path exactly as it was:
 *   persist          false = never read or write the projector's cursor
 *                    record, so a phone cannot clobber it or be steered by it.
 *   followServerPoll true  = the keyed (display) mode also polls at the
 *                    server's poll_ms instead of DISPLAY_POLL_MS.
 */
export function createGiftFeed({ event, key, director, onState, onStatus, client = sharedClient, persist: persistCursor = true, followServerPoll = false }) {
  const db = client;
  const rec = persistCursor ? readCursorRecord(event) : null;
  let cursor = rec ? rec.cursor : 0;
  let cueSeq = rec ? rec.cueSeq : 0;
  let nonce = rec ? rec.nonce : "";
  let cold = !rec; // no record for today: the first snapshot is silent
  let first = true; // the first snapshot of this page load, cold or warm
  let mode = key ? "display" : "public";
  let stopped = false;
  let inFlight = false;
  let timer = 0;
  let pollMs = mode === "display" && !followServerPoll ? DISPLAY_POLL_MS : 10000;
  let polls = 0;
  let errors = 0;
  let lastOkAt = 0;
  let lastWrite = 0;

  if (rec?.milestones?.length) director.restoreMilestones(rec.milestones);

  function persist(force = false) {
    if (!persistCursor) return;
    const nowMs = Date.now();
    if (!force && nowMs - lastWrite < 1000) return;
    lastWrite = nowMs;
    writeCursorRecord(event, { cursor, cueSeq, milestones: director.milestonesHit(), nonce });
  }

  function applyGifts(payload) {
    // Order matters: retractions first, then gifts, then the total. Doing the
    // total last means baseCents is computed against the gifts we now hold.
    for (const seq of payload.retractions || []) director.retract(seq);

    const nowMs = Date.now();
    for (const g of payload.gifts || []) {
      const atMs = g.at ? Date.parse(g.at) : nowMs;
      const age = Number.isFinite(atMs) ? nowMs - atMs : 0;
      const how = cold ? "cold" : age > QUEUE.SILENT_CATCHUP_AGE_MS ? "catchup" : "live";
      director.receiveGift(
        { seq: g.seq, cents: Number(g.amount_cents) || 0, name: g.display_name || "", tier: Number(g.tier) || 0 },
        how,
      );
    }
  }

  async function once() {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      let payload;
      if (mode === "display") {
        payload = await callRpc(db, "gala_display_feed", { p_event: event, p_display_key: key, p_cursor: cursor });
        if (payload.ok && payload.named !== true) {
          // Wrong key, missing key, or no key configured. Indistinguishable by
          // design, so behave the same way in all three cases: degrade quietly.
          mode = "public";
        }
      }
      if (mode !== "display") {
        payload = payload && payload.ok ? payload : await callRpc(db, "gala_display_public", { p_event: event });
      }

      polls++;
      if (!payload.ok) {
        errors++;
        onStatus?.({ mode, named: mode === "display", cursor, polls, errors, lastError: payload.reason || "error", lastOkAt });
        return;
      }
      lastOkAt = Date.now();

      if (mode === "display") {
        applyGifts(payload);
        const next = Number(payload.cursor);
        if (Number.isFinite(next) && next > cursor) cursor = next;
      }

      director.reconcile(payload.total_cents);
      if (first) {
        first = false;
        cold = false;
        // Whether this is a cold start or a reload mid show, the picture the
        // page already earned is restored in one step: milestones that have
        // already been passed are sealed so no banner re-fires, and the total
        // snaps instead of rolling up from zero.
        director.sealMilestones();
        director.snapTotals();
      }
      persist();

      onState?.(payload, { mode, cueSeq, nonce, setCueSeq: (n) => { cueSeq = n; persist(true); }, setNonce: (n) => { nonce = n; persist(true); } });
      onStatus?.({ mode, named: payload.named === true, live: payload.live === true, cursor, polls, errors, lastError: "", lastOkAt });

      // A full page (400 rows) means there is more waiting: come straight back.
      if (mode === "display" && (payload.gifts?.length || 0) >= 400) {
        inFlight = false;
        return once();
      }
      // The public poll honours the operator's poll_ms; the projector stays fast.
      pollMs = mode === "display" && !followServerPoll ? DISPLAY_POLL_MS : Math.max(1000, Number(payload.poll_ms) || 10000);
    } finally {
      inFlight = false;
    }
  }

  function loop() {
    if (stopped) return;
    timer = setTimeout(async () => {
      await once();
      loop();
    }, pollMs);
  }

  return {
    get mode() {
      return mode;
    },
    get cursor() {
      return cursor;
    },
    async start() {
      await once();
      loop();
    },
    /** Make the next refetch immediate. Polling stays the source of truth. */
    poke() {
      clearTimeout(timer);
      once().then(loop);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      persist(true);
    },
    flush() {
      persist(true);
    },
  };
}
