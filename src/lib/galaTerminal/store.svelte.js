// src/lib/galaTerminal/store.svelte.js  (Svelte 5 runes module)
//
// The pledge terminal's state. It stands on the check-in client that shipped
// before it: the session, the socket, the doorbell and the notice stack all
// belong to galaCheckin/{remote,store}.svelte.js, and this store borrows them
// rather than minting a second of each. One socket per browser tab, or the two
// channels fight over the same topic.
//
// Three rules, each of which is invisible until gala night if broken:
//
//   C2  a mutation's answer never moves the cursor. Only pull() does. A
//       mutation may upsert the row it returns, and that is all.
//   Q1  EVERY entry goes through the local queue, online or not. That is what
//       makes "the network died mid-appeal" an ordinary code path instead of an
//       emergency one, and what makes a resend safe: the op id is minted once,
//       written to localStorage, and reused for ever.
//   M1  money is cents in here and dollars on the wire. derive.dollars() is the
//       only conversion.
//
// Entry is never refused. Check-in blocks when it cannot reach the server
// because a paddle number cannot be invented; a pledge is just money, and the
// clerk has a spotter shouting at them.

import { newOpId } from "../galaCheckin/remote.js";
import {
  dollars, findLiveAtLevel, levelList, mergeTape, nextForceIndex, packQueue,
  paddleIndex, roundKeyFor, roundsByLevel, tapeList, unpackQueue,
} from "./derive.js";

const POLL_MS = 4000;              // the fallback when the doorbell is not ringing
const BACKOFF = [400, 800, 1600, 3000, 5000, 8000];   // then 8 s for ever: we never give up on money
const UNDO_FLOOR_MS = 4000;        // publish_delay_ms may be 0; the clerk still gets a moment
const DONE_KEEP_MS = 60000;        // how long a landed row lingers until the tape carries it
const DUPES_KEEP = 20;

// `scope` keeps a second surface's outbox (the show-control phone) apart from
// the pledge terminal's when both run in one browser: same op-id discipline,
// separate localStorage slot, so one tab's persist() never drops the other's.
const queueKey = (event, scope = "") => `lsp.galaTerminal.queue.${event}${scope ? `.${scope}` : ""}`;

/** Defaults compiled in, so a failed read changes nothing (10 s6). */
const SAFE_STATE = {
  levels: [], current_level_cents: null, confirm_threshold_cents: 250000,
  publish_delay_ms: 4000, total_cents: 0, gift_count: 0, show_names: true, version: 0,
};

export function createTerminalStore({ scope = "" } = {}) {
  let checkin = null;
  let remote = null;
  let stopped = false;

  let state = $state.raw(SAFE_STATE);
  let tapeById = $state.raw({});
  let rounds = $state.raw({});
  let totals = $state.raw({ live_cents: 0, live_count: 0, booked_cents: 0, needs_review: 0, voided: 0, retracted: 0, pending_publish: 0 });
  let me = $state.raw(null);
  let queue = $state.raw([]);            // Q1: the durable outbox, newest last
  let dupes = $state.raw([]);            // "the other clerk got there first", local only
  let undoSlot = $state.raw(null);
  let phase = $state("idle");            // idle | loading | ready | error
  let lastError = $state("");

  // Level selection. `follow` means "whatever the room is being asked for now".
  let pickedCents = $state.raw(null);
  let follow = $state(true);

  // Plain variables: never rendered.
  let cursor = 0;
  let pulling = false;
  let pullAgain = false;
  let pollTimer = null;
  let draining = false;
  let disposeWatch = null;
  let lastSeenSync = 0;

  const levels = $derived(levelList(state));
  const isAdmin = $derived(me?.role === "admin");
  const roomLevelCents = $derived(state.current_level_cents ?? null);
  const levelCents = $derived.by(() => {
    const room = roomLevelCents;
    if (follow && room != null) return room;
    if (pickedCents != null) return pickedCents;
    return room ?? levels[0]?.amount_cents ?? null;
  });
  const level = $derived(levels.find((l) => l.amount_cents === levelCents) || null);
  const rows = $derived(tapeList(tapeById));
  const byLevel = $derived(roundsByLevel(rounds));
  const paddles = $derived(paddleIndex(checkin?.guests || []));
  const queued = $derived(queue.filter((q) => q.state !== "done"));
  const inFlight = $derived(queue.filter((q) => q.state === "sending").length);
  const needsReview = $derived(rows.filter((r) => r.needs_review && !r.voided_at));

  /* ---- the queue, on disk ------------------------------------------------ */

  function persist() {
    try {
      const keep = queue.filter((q) => q.state !== "done");
      const store = window.localStorage;
      if (!keep.length) store.removeItem(queueKey(remote?.event || "", scope));
      else store.setItem(queueKey(remote?.event || "", scope), JSON.stringify(packQueue(keep)));
    } catch { /* private mode, full disk: the entry still lives in memory */ }
  }

  function restore() {
    try {
      queue = unpackQueue(window.localStorage.getItem(queueKey(remote?.event || "", scope)));
    } catch { queue = []; }
  }

  const patchItem = (op, patch) => {
    queue = queue.map((q) => (q.op === op ? { ...q, ...patch } : q));
  };
  const dropItem = (op) => {
    queue = queue.filter((q) => q.op !== op);
    persist();
  };

  /* ---- reads ------------------------------------------------------------- */

  function applyList(res) {
    tapeById = mergeTape(tapeById, res.donations || []);
    if (res.rounds) rounds = res.rounds;
    if (res.totals) totals = res.totals;
    if (res.state) state = { ...SAFE_STATE, ...res.state };
    if (res.me) me = res.me;
  }

  async function attach({ checkin: c, remote: r }) {
    checkin = c;
    remote = r;
    stopped = false;
    phase = "loading";
    restore();
    const res = await remote.donationList(0);
    if (!res.ok) {
      lastError = res.reason || "error";
      phase = queue.length ? "ready" : "error";      // a queue full of money still has to be visible
      start();
      return res;
    }
    applyList(res);
    cursor = Number(res.cursor) || 0;
    lastError = "";
    phase = "ready";
    start();
    void drain();
    return res;
  }

  /** The ONLY place the cursor moves (rule C2). */
  async function pull() {
    if (!remote || stopped) return;
    if (pulling) { pullAgain = true; return; }
    pulling = true;
    try {
      const res = await remote.donationList(cursor);
      if (!res.ok) { lastError = res.reason || "error"; return; }
      applyList(res);
      cursor = Math.max(cursor, Number(res.cursor) || 0);
      lastError = "";
      if (phase !== "ready") phase = "ready";
    } finally {
      pulling = false;
      if (pullAgain) { pullAgain = false; void pull(); }
    }
  }

  /**
   * The doorbell. The check-in store owns the only Realtime channel on this tab,
   * and every gala mutation bumps the same event version, so "the check-in store
   * just synced" is exactly the signal "something changed, come and look". The
   * 4 s poll below is the fallback when the socket is down.
   */
  function start() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (!document.hidden) { void pull(); void drain(); } }, POLL_MS);
    disposeWatch?.();
    disposeWatch = $effect.root(() => {
      $effect(() => {
        const at = checkin?.sync?.lastSyncAt || 0;
        if (at && at !== lastSeenSync) {
          lastSeenSync = at;
          void pull();
        }
      });
      $effect(() => {
        // Back on the network: flush before anything else.
        if (checkin?.sync?.status === "live" || checkin?.sync?.status === "degraded") void drain();
      });
    });
    window.addEventListener("online", onOnline);
  }

  function onOnline() { void pull(); void drain(); }

  function stop() {
    stopped = true;
    clearInterval(pollTimer);
    pollTimer = null;
    disposeWatch?.();
    disposeWatch = null;
    window.removeEventListener("online", onOnline);
  }

  /* ---- writes: the queue drains in order --------------------------------- */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function send(item) {
    const opts = {
      amount: dollars(item.cents),
      paddle: item.paddle,
      roundKey: item.round,
      kind: item.kind || "pledge",
      donorName: item.donorName || null,
      note: item.note || "",
      hidden: Boolean(item.hidden),
    };
    // gala_donation_add is the fast path and cannot say "anonymous" or pick a
    // kind outside the paddle raise; gala_donation_record can say everything.
    const plain = !item.anonymous && !item.donorName && item.publishDelayMs == null
      && ["pledge", "cash", "card", "online", "ticket", "other"].includes(opts.kind);
    return plain
      ? remote.donationAdd(item.op, opts)
      : remote.donationRecord(item.op, { ...opts, anonymous: Boolean(item.anonymous), publishDelayMs: item.publishDelayMs ?? null });
  }

  /**
   * One sender, head first, so thirty paddles typed in a burst reach the table
   * in the order the spotters called them. A hard refusal does not block the
   * queue: it is parked as `failed` and the next entry goes.
   */
  async function drain() {
    if (draining || !remote || stopped) return;
    draining = true;
    try {
      for (;;) {
        const item = queue.find((q) => q.state === "waiting");
        if (!item || stopped) break;
        patchItem(item.op, { state: "sending" });
        const res = await send(item);
        const now = queue.find((q) => q.op === item.op);
        if (!now) continue;                      // undone while it was in flight

        if (res.ok) {
          landed(now, res);
        } else if (res.transient) {
          const tries = (now.tries || 0) + 1;
          patchItem(item.op, { state: "waiting", tries });
          await sleep(BACKOFF[Math.min(tries - 1, BACKOFF.length - 1)]);
          if (stopped) break;
        } else {
          patchItem(item.op, { state: "failed", reason: res.reason || "error" });
          persist();
        }
      }
    } finally {
      draining = false;
    }
  }

  function landed(item, res) {
    if (res.outcome === "already-recorded") {
      // The other clerk got there first. Calm and grey, never an error.
      dupes = [{
        id: item.op, paddle: item.paddle, cents: item.cents,
        by: res.entered_by || "another clerk", donationId: res.donation_id, at: Date.now(),
      }, ...dupes].slice(0, DUPES_KEEP);
      dropItem(item.op);
      if (undoSlot?.op === item.op) undoSlot = null;
      return;
    }

    patchItem(item.op, { state: "done", donationId: res.donation_id, needsReview: Boolean(res.needs_review), doneAt: Date.now() });
    persist();

    if (undoSlot?.op === item.op) {
      undoSlot = { ...undoSlot, donationId: res.donation_id };
      if (undoSlot.wanted) void retract(res.donation_id, "clerk undo");
    }
    // Ring the doorbell for the other terminal, then catch up ourselves.
    void pull().then(() => { try { remote.ping(state.version); } catch { /* the poll covers it */ } });

    // Housekeeping: a landed row stays on the tape until the server's copy of it
    // arrives, so nothing ever blinks out of existence in front of a clerk.
    setTimeout(() => {
      queue = queue.filter((q) => !(q.state === "done" && (tapeById[q.donationId] || Date.now() - (q.doneAt || 0) > DONE_KEEP_MS)));
    }, 1200);
  }

  /* ---- the entry line ---------------------------------------------------- */

  /** Above the operator's threshold the clerk presses Enter twice (09 R5). */
  const needsConfirm = (cents) => Number(cents) >= Number(state.confirm_threshold_cents || Infinity);

  /** The local half of the duplicate guard. The server's unique index is the real one. */
  function duplicateFor(paddle, cents) {
    return findLiveAtLevel(rows, paddle, cents);
  }

  /**
   * Accept a parsed entry. Never blocks on the network: the item is written to
   * the queue (and to localStorage) and the caller's input is already empty.
   */
  function submit(item) {
    const cents = Math.round(item.cents);
    const round = item.custom
      ? null                                        // a free amount is not part of a level's tally
      : roundKeyFor(cents, item.force ? nextForceIndex(rows, item.paddle, cents) : 1);
    const entry = {
      op: newOpId(),
      paddle: item.paddle ?? null,
      cents,
      round,
      kind: item.kind || "pledge",
      anonymous: Boolean(item.anonymous),
      donorName: item.donorName || null,
      note: item.note || "",
      hidden: Boolean(item.hidden),
      publishDelayMs: item.publishDelayMs ?? null,
      at: Date.now(),
      state: "waiting",
      tries: 0,
    };
    queue = [...queue, entry];
    persist();
    undoSlot = {
      op: entry.op, donationId: null, cents, paddle: entry.paddle,
      until: Date.now() + Math.max(Number(state.publish_delay_ms) || 0, UNDO_FLOOR_MS),
      published: Number(state.publish_delay_ms) === 0,
      wanted: false,
    };
    void drain();
    return entry;
  }

  /* ---- undo, retract, void, fix ------------------------------------------ */

  async function mutate(fn) {
    const op = newOpId();
    const res = await fn(op);
    if (res.ok && res.donation) tapeById = mergeTape(tapeById, [res.donation]);   // rows only, NOT the cursor
    if (res.ok) void pull().then(() => { try { remote.ping(state.version); } catch { /* fine */ } });
    else if (!res.transient) checkin?.push({ kind: "error", text: reasonText(res.reason) });
    return res;
  }

  const retract = (donationId, reason = "") => mutate((op) => remote.donationRetract(op, donationId, reason));
  const unretract = (donationId) => mutate((op) => remote.donationUnretract(op, donationId));
  const voidGift = (donationId, reason) => mutate((op) => remote.donationVoid(op, donationId, reason));
  const update = (donationId, patch) => mutate((op) => remote.donationUpdate(op, donationId, patch));

  /**
   * Esc, or Z, inside the undo window. Three cases, and the first one is the
   * happy one: the entry never left this device, so the room never knew and
   * there is no row to explain to the treasurer.
   */
  async function undoLast() {
    const slot = undoSlot;
    if (!slot) return { ok: false, reason: "nothing-to-undo" };
    const item = queue.find((q) => q.op === slot.op);

    if (item && item.state === "waiting") {
      dropItem(slot.op);
      undoSlot = null;
      checkin?.push({ kind: "info", text: "Dropped before it was sent." });
      return { ok: true, outcome: "dropped" };
    }
    if (item && item.state === "sending" && !slot.donationId) {
      undoSlot = { ...slot, wanted: true };        // retract the moment the id lands
      return { ok: true, outcome: "pending" };
    }
    const id = slot.donationId || item?.donationId;
    if (!id) { undoSlot = null; return { ok: false, reason: "nothing-to-undo" }; }
    undoSlot = null;
    const res = await retract(id, "clerk undo");
    if (res.ok) checkin?.push({ kind: "info", text: "Pulled back." });
    return res;
  }

  /* ---- levels ------------------------------------------------------------ */

  /**
   * The lead clerk owns the level: an admin session moves the projector with
   * `gala_display_set`, so both terminals and the big screen agree. A door
   * session can still work a different level locally, and says so.
   */
  async function setLevel(cents, { publish = true } = {}) {
    const target = Math.round(Number(cents) || 0);
    if (!target) return { ok: false, reason: "no-level" };
    pickedCents = target;
    if (!(publish && isAdmin)) {
      follow = false;
      return { ok: true, outcome: "local" };
    }
    const res = await remote.displaySet(newOpId(), { current_level_cents: target });
    if (res.ok) {
      if (res.state) state = { ...SAFE_STATE, ...res.state };
      follow = true;
      pickedCents = null;
      try { remote.ping(res.version || state.version); } catch { /* the poll covers it */ }
    } else {
      follow = false;
      if (!res.transient) checkin?.push({ kind: "error", text: `The big screen did not move: ${reasonText(res.reason)}` });
    }
    return res;
  }

  function followRoom() {
    follow = true;
    pickedCents = null;
  }

  /* ---- words for refusals ------------------------------------------------ */

  const REASONS = {
    "bad-session": "Your session ended. Unlock again.",
    expired: "Your session expired. Unlock again.",
    revoked: "This session was signed out by the lead.",
    closed: "This event is closed.",
    forbidden: "Only a lead can change the big screen.",
    "unknown-donation": "That gift is no longer on the tape.",
    "donation-voided": "That gift was voided. A voided gift is the end of the line.",
    "duplicate-round": "That paddle already has a gift at this level.",
    "invalid-amount": "That amount is out of range.",
    "invalid-kind": "That kind of gift is not one the books know.",
    "missing-donor": "A gift needs a paddle, a name, or the anonymous box.",
    "missing-reason": "Say why, in a few words.",
    "nothing-to-change": "Nothing changed.",
    "invalid-patch": "That edit was refused.",
    offline: "No connection. It is queued on this device.",
  };
  const reasonText = (reason) => REASONS[reason] || "That did not go through. Try again.";

  return {
    get phase() { return phase; },
    get state() { return state; },
    get levels() { return levels; },
    get level() { return level; },
    get levelCents() { return levelCents; },
    get roomLevelCents() { return roomLevelCents; },
    get following() { return follow; },
    get isAdmin() { return isAdmin; },
    get me() { return me; },
    get rows() { return rows; },
    get byLevel() { return byLevel; },
    get totals() { return totals; },
    get rounds() { return rounds; },
    get paddles() { return paddles; },
    get queue() { return queue; },
    get queued() { return queued; },
    get inFlight() { return inFlight; },
    get dupes() { return dupes; },
    get undoSlot() { return undoSlot; },
    get needsReview() { return needsReview; },
    get lastError() { return lastError; },
    get checkin() { return checkin; },
    get event() { return remote?.event || ""; },
    get actor() { return me?.actor || checkin?.actor || ""; },

    attach, pull, stop, drain,
    submit, needsConfirm, duplicateFor,
    undoLast, retract, unretract, voidGift, update,
    setLevel, followRoom, reasonText,
    clearDupe: (id) => { dupes = dupes.filter((d) => d.id !== id); },
    retryItem: (op) => { patchItem(op, { state: "waiting" }); void drain(); },
    discardItem: (op) => { dropItem(op); },
  };
}
