// src/lib/galaCheckin/store.svelte.js  (Svelte 5 runes module)
//
// The server is the only author of truth. This store holds the rows the server
// last sent, a cursor, and the list of operations still waiting for an answer.
// There is no optimistic plan and no op replay: rows come back, rows get upserted.
//
// Two rules are worth repeating because breaking either is invisible until gala
// night:
//   C2  a mutation's answer NEVER moves the cursor. Only load() and since() do.
//   P1  a paddle number is never computed, predicted or carried over here. If it
//       is not on a server row, the UI shows a spinner, not a number.

import { newOpId } from "./remote.js";
import { deriveStats, groupParties, membersByGroup } from "./derive.js";   // pure functions, unit tested in node

const POLL_LIVE_MS = 12000;     // safety net while the socket is up
const POLL_DOWN_MS = 4000;      // the socket is down: polling IS the sync
const RETRY_DELAYS = [400, 800, 1600, 3000, 5000, 8000, 10000];   // about 29 s, then "Not saved"
const WRITE_KINDS = new Set(["checkin", "walkin"]);
const NOTICE_MS = 6000;
const CONFLICTS = new Set(["paddle-taken", "paddle-void", "unknown-paddle", "group-has-paddle", "pool-empty"]);
const SIGNED_OUT = new Set(["bad-session", "expired", "revoked", "closed"]);

/**
 * `retryDelays` exists for the node test (src/lib/galaCheckin/test/run.mjs),
 * which cannot wait 29 seconds per case. The app never passes it.
 */
export function createCheckinStore({ retryDelays = RETRY_DELAYS } = {}) {
  let remote = null;

  // $state.raw: replaced wholesale on every apply, never mutated in place.
  let guestsById = $state.raw({});
  let paddlesByNumber = $state.raw({});
  let log = $state.raw([]);
  let people = $state.raw([]);
  let pending = $state.raw({});          // opId -> { kind, guestIds, state: "sending"|"retrying"|"failed", tries }
  let notices = $state.raw([]);          // friendly cards: { id, kind: "already"|"info"|"error", text }
  let me = $state.raw(null);             // { actor, role, session_id }
  let closed = $state.raw(false);
  let sync = $state({ status: "locked", socket: "down", lastSyncAt: null, error: "" });
  // Guest ids THIS device checked in tonight. Lets a sheet say "checked in on
  // another phone" without guessing from a first name two volunteers may share.
  let mine = $state.raw(new Set());

  // Plain variables: never rendered, so no signal needed.
  let cursor = { version: 0, logId: 0 };
  let pulling = false;
  let pullAgain = false;
  let pollTimer = null;
  let unsubscribe = null;
  const resend = new Map();              // opId -> () => Promise, for "tap to retry"
  const kindByOp = new Map();            // opId -> kind, so a late success is still recorded as ours

  const guests = $derived(Object.values(guestsById).filter((g) => !g.removed_at));
  const parties = $derived(groupParties(guests));
  const stats = $derived(deriveStats(guests, Object.values(paddlesByNumber)));
  // Shared household paddles: who else holds this guest's paddle, across parties.
  const groups = $derived(membersByGroup(guests));
  const pendingByGuest = $derived.by(() => {
    const out = {};
    for (const [opId, p] of Object.entries(pending)) for (const id of p.guestIds) out[id] = { opId, ...p };
    return out;
  });
  const focusByGuest = $derived.by(() => {
    const out = {};
    for (const p of people) if (p.focus?.g && p.c !== remote?.clientId) out[p.focus.g] = p;
    return out;
  });
  // Writes that ran out of retries. The banner offers each one a "tap to retry".
  const stuck = $derived(Object.entries(pending).filter(([, p]) => p.state === "failed").map(([id, p]) => ({ opId: id, ...p })));

  // ---- rows in ---------------------------------------------------------------
  function applyRows(res) {
    if (res.guests?.length) {
      const next = { ...guestsById };
      for (const g of res.guests) if (!next[g.id] || g.row_version >= next[g.id].row_version) next[g.id] = g;
      guestsById = next;
    }
    if (res.paddles?.length) {
      const next = { ...paddlesByNumber };
      for (const p of res.paddles) if (!next[p.paddle_number] || p.row_version >= next[p.paddle_number].row_version) next[p.paddle_number] = p;
      paddlesByNumber = next;
    }
    if (res.log?.length) {
      const seen = new Set(log.map((l) => l.id));
      log = [...log, ...res.log.filter((l) => !seen.has(l.id))].slice(-200);
    }
  }

  function signedOut(reason) {
    remote?.forget();
    stop();
    sync = { ...sync, status: "locked", error: reason };
  }

  function note(res) {
    if (SIGNED_OUT.has(res.reason)) return signedOut(res.reason);
    if (res.transient) sync = { ...sync, status: "offline" };
  }

  // ---- notices ---------------------------------------------------------------
  function push(notice) {
    const id = notice.id || newOpId();
    notices = [...notices, { ...notice, id }];
    if (notice.kind !== "error") setTimeout(() => dismissNotice(id), NOTICE_MS);
    return id;
  }
  const dismissNotice = (id) => { notices = notices.filter((n) => n.id !== id); };

  // ---- reads -----------------------------------------------------------------
  async function attach(r) {
    remote = r;
    sync = { ...sync, status: "loading", error: "" };
    const res = await remote.load();
    if (!res.ok) {
      note(res);
      if (res.transient) sync = { ...sync, status: "offline", error: "Cannot reach the guest list." };
      return res;
    }
    guestsById = Object.fromEntries(res.guests.map((g) => [g.id, g]));
    paddlesByNumber = Object.fromEntries(res.paddles.map((p) => [p.paddle_number, p]));
    log = res.log || [];
    me = res.me;
    closed = Boolean(res.closed);
    cursor = { version: res.version, logId: res.log_id };
    sync = { status: "degraded", socket: "down", lastSyncAt: Date.now(), error: "" };
    start();
    return res;
  }

  /** The ONLY place the cursor moves. Mutation answers never move it (see rule C2). */
  async function pull() {
    if (!remote || sync.status === "locked") return;
    if (pulling) { pullAgain = true; return; }
    pulling = true;
    try {
      const res = await remote.since(cursor.version, cursor.logId);
      if (!res.ok) return note(res);
      if (res.version < cursor.version) return void attach(remote);   // event was reset under us
      applyRows(res);
      cursor = { version: res.version, logId: Math.max(cursor.logId, res.log_id || 0) };
      sync = { ...sync, status: sync.socket === "live" ? "live" : "degraded", lastSyncAt: Date.now(), error: "" };
    } finally {
      pulling = false;
      if (pullAgain) { pullAgain = false; void pull(); }
    }
  }

  function schedule() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (!document.hidden) void pull(); }, sync.socket === "live" ? POLL_LIVE_MS : POLL_DOWN_MS);
  }

  function start() {
    unsubscribe = remote.subscribe({
      onPing: (v) => { if (v > cursor.version) void pull(); },
      onPresence: (list) => { people = list; },
      onStatus: (s) => {
        sync = { ...sync, socket: s, status: sync.status === "locked" ? "locked" : s === "live" ? "live" : "degraded" };
        schedule();
        if (s === "live") void pull();      // whatever happened while the socket was away
      },
    });
    schedule();
    window.addEventListener("online", pull);
    window.addEventListener("focus", pull);
    document.addEventListener("visibilitychange", onVisible);
  }

  function onVisible() {
    if (document.hidden) return;
    void pull();
    // iOS suspends sockets in the background: rejoin rather than trust a zombie.
    if (sync.socket !== "live") { unsubscribe?.(); start(); }
  }

  function stop() {
    clearInterval(pollTimer);
    unsubscribe?.();
    unsubscribe = null;
    window.removeEventListener("online", pull);
    window.removeEventListener("focus", pull);
    document.removeEventListener("visibilitychange", onVisible);
  }

  // ---- writes ----------------------------------------------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const setPending = (opId, patch) => { pending = { ...pending, [opId]: { ...pending[opId], ...patch } }; };
  const clearPending = (opId) => { const { [opId]: _gone, ...rest } = pending; pending = rest; resend.delete(opId); };

  /**
   * One user intent = one op id. Automatic retries reuse it (that is what makes a
   * retry safe). A NEW tap after a refusal is a new intent and gets a new id.
   */
  async function run(kind, guestIds, send) {
    if (guestIds.some((id) => pendingByGuest[id])) return { ok: false, reason: "busy" };
    const opId = newOpId();
    pending = { ...pending, [opId]: { kind, guestIds, state: "sending", tries: 0 } };
    kindByOp.set(opId, kind);
    const attempt = async () => {
      for (let i = 0; ; i++) {
        const res = await send(opId);
        if (res.ok || !res.transient) return settle(opId, res);
        if (i >= retryDelays.length) {
          setPending(opId, { state: "failed" });
          resend.set(opId, attempt);
          sync = { ...sync, status: "offline" };
          // The op id travels back so a form can offer "tap to retry" with the
          // SAME id: a fresh id after a write that did land would be a twin.
          return { ...res, opId };
        }
        setPending(opId, { state: "retrying", tries: i + 1 });
        await sleep(retryDelays[i]);
      }
    };
    return attempt();
  }

  function settle(opId, res) {
    clearPending(opId);
    const kind = kindByOp.get(opId);
    kindByOp.delete(opId);
    if (res.ok) {
      applyRows(res);                    // rows only. NOT the cursor.
      if (WRITE_KINDS.has(kind) && res.newly?.length) mine = new Set([...mine, ...res.newly]);
      void remote.ping(res.version);     // doorbell for everyone else
      void pull();                       // and catch up on what we may have missed
      if (res.outcome === "already") {
        const g = res.guests?.[0];
        push({ id: opId, kind: "already", guestId: g?.id, by: g?.checked_in_by, at: g?.checked_in_at, paddle: g?.paddle_number });
      }
    } else if (!CONFLICTS.has(res.reason)) {
      note(res);
    }
    return res;                          // conflicts go back to the caller, which opens the dialog
  }

  /** Same op id again, so a write that did land the first time is answered as a replay, never twice. */
  const retry = (opId) => {
    const again = resend.get(opId);
    if (!again) return Promise.resolve({ ok: false, reason: "busy" });
    setPending(opId, { state: "sending" });
    return again();
  };

  /**
   * Offline policy (7.5): block, never queue. A check-in whose paddle already
   * exists on a server row may be tapped and will retry in the background, so the
   * volunteer can hand the paddle over meanwhile. Anything that needs a NEW
   * number cannot be faked and is refused up front.
   */
  function needsConnection(guestIds, opts) {
    if (sync.status !== "offline") return false;
    const mode = opts?.paddle;
    if (mode === "none") return false;
    return guestIds.some((id) => guestsById[id]?.paddle_number == null);
  }

  return {
    get guests() { return guests; },
    get guestsById() { return guestsById; },
    get parties() { return parties; },
    get paddles() { return paddlesByNumber; },
    get log() { return log; },
    get stats() { return stats; },
    get people() { return people; },
    get mine() { return mine; },
    /** Live rows of everyone sharing this paddle group (empty array if none). */
    groupMembers: (key) => groups.get(key) || [],
    get focusByGuest() { return focusByGuest; },
    get pendingByGuest() { return pendingByGuest; },
    get pending() { return pending; },
    get stuck() { return stuck; },
    get notices() { return notices; },
    get sync() { return sync; },
    get me() { return me; },
    get closed() { return closed; },
    get actor() { return me?.actor || remote?.actor || ""; },
    get event() { return remote?.event || ""; },
    attach, pull, stop, retry, dismissNotice, push,
    setFocus: (guestId) => remote?.setFocus(guestId),
    logout: async () => { await remote?.logout(); stop(); sync = { ...sync, status: "locked" }; },
    needsConnection,
    checkIn: (guestIds, opts) =>
      needsConnection(guestIds, opts)
        ? Promise.resolve({ ok: false, reason: "needs-connection" })
        : run("checkin", guestIds, (op) => remote.checkIn(op, guestIds, opts)),
    undo: (guestId, reason) => run("undo", [guestId], (op) => remote.undo(op, guestId, reason)),
    walkIn: (guest, opts) =>
      sync.status === "offline"
        ? Promise.resolve({ ok: false, reason: "needs-connection" })
        : run("walkin", [], (op) => remote.walkIn(op, guest, opts)),
    updateGuest: (guestId, patch) => run("update", [guestId], (op) => remote.updateGuest(op, guestId, patch)),
    paddleAssign: (guestId, number, opts) =>
      sync.status === "offline"
        ? Promise.resolve({ ok: false, reason: "needs-connection" })
        : run("paddle", [guestId], (op) => remote.paddleAssign(op, guestId, number, opts)),
    paddleSwap: (guestId, number, oldStatus) =>
      sync.status === "offline"
        ? Promise.resolve({ ok: false, reason: "needs-connection" })
        : run("paddle", [guestId], (op) => remote.paddleSwap(op, guestId, number, oldStatus)),
    paddleRelease: (number, force) => run("paddle", [], (op) => remote.paddleRelease(op, number, force)),
    groupSet: (guestIds, joinGuestId) =>
      sync.status === "offline"
        ? Promise.resolve({ ok: false, reason: "needs-connection" })
        : run("group", guestIds, (op) => remote.groupSet(op, guestIds, joinGuestId)),
  };
}
