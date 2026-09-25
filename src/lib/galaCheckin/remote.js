// src/lib/galaCheckin/remote.js
// RPC client + realtime channel for the check-in desk. Sibling of
// src/lib/galaSeating/remote.js and bound by the same rules:
//   - secrets (the passcode once, the session token after) travel in a POST body
//     and nowhere else: never a URL, a log line, or a broadcast payload;
//   - no guest data ever leaves through Realtime. The broadcast is a doorbell
//     ({ v, c }); presence carries a volunteer's first name and an opaque guest id;
//   - nothing here throws. A dead network is a result value: { ok:false, transient:true }.
//   - the PASSCODE is never stored. Only the 18-hour session token is.

import { supabase as sharedClient } from "../supabaseClient.js";

export const DEFAULT_EVENT = "gala-2026";
const tokenKey = (event) => `lsp.galaCheckin.token.${event}`;
const NAME_KEY = "lsp.galaCheckin.name";
const CLIENT_KEY = "lsp.galaCheckin.clientId";
const CALL_TIMEOUT_MS = 10000;

// Postgres / PostgREST codes that mean "nothing was decided, ask again":
// statement timeout, lock timeout, serialization, deadlock, pool exhausted.
const TRANSIENT_CODES = new Set(["57014", "55P03", "40001", "40P01", "PGRST000", "PGRST001", "PGRST002", "PGRST003"]);

function box(persist) {
  try {
    return persist ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export const newOpId = () => globalThis.crypto.randomUUID();

export function clientId() {
  try {
    let id = box(false)?.getItem(CLIENT_KEY);
    if (!id) {
      id = newOpId().slice(0, 12);
      box(false)?.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return newOpId().slice(0, 12);
  }
}

export const recallName = () => {
  try { return box(true)?.getItem(NAME_KEY) || ""; } catch { return ""; }
};

async function callRpc(db, name, args) {
  if (!db) return { ok: false, reason: "offline", transient: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const { data, error } = await db.rpc(name, args).abortSignal(controller.signal);
    if (error) {
      const transient = !error.code || TRANSIENT_CODES.has(String(error.code));
      return { ok: false, reason: transient ? "offline" : String(error.code), transient, error: error.message || "" };
    }
    if (!data || typeof data !== "object") return { ok: false, reason: "error", transient: false };
    if (data.ok === false && data.reason === "retry") return { ...data, transient: true };
    return data;
  } catch {
    return { ok: false, reason: "offline", transient: true };
  } finally {
    clearTimeout(timer);
  }
}

export function createCheckinRemote({ event = DEFAULT_EVENT, client: db = sharedClient } = {}) {
  const me = clientId();
  let token = "";
  let channelName = "";
  let channel = null;
  let actor = "";
  let presence = { focus: null };

  try {
    token = box(false)?.getItem(tokenKey(event)) || box(true)?.getItem(tokenKey(event)) || "";
  } catch { /* private mode: the volunteer unlocks again */ }

  const auth = () => ({ p_event: event, p_token: token });

  function adopt(res, persist) {
    token = res.token;
    actor = res.actor || "";
    channelName = res.channel || "";
    try {
      box(false)?.setItem(tokenKey(event), token);
      if (persist) box(true)?.setItem(tokenKey(event), token);
      box(true)?.setItem(NAME_KEY, actor);
    } catch { /* fine */ }
  }

  function forget() {
    token = "";
    try {
      box(false)?.removeItem(tokenKey(event));
      box(true)?.removeItem(tokenKey(event));
    } catch { /* fine */ }
  }

  async function unlock({ passcode, name, device = "", persist = false }) {
    const res = await callRpc(db, "gala_checkin_unlock", { p_event: event, p_pass: passcode, p_name: name, p_device: device });
    if (res.ok) adopt(res, persist);
    return res.ok ? { ok: true, role: res.role, actor: res.actor, expiresAt: res.expires_at } : res;
  }

  /** Dashboard path: the signed-in Supabase user must hold the gala module. */
  async function adminSession({ name, device = "" }) {
    const res = await callRpc(db, "gala_checkin_admin_session", { p_event: event, p_name: name, p_device: device });
    if (res.ok) adopt(res, false);
    return res.ok ? { ok: true, role: res.role, actor: res.actor, expiresAt: res.expires_at } : res;
  }

  async function load() {
    const res = await callRpc(db, "gala_checkin_load", auth());
    if (res.ok) {
      channelName = res.channel || channelName;
      actor = res.me?.actor || actor;
    }
    return res;
  }

  const since = (version, logId) =>
    callRpc(db, "gala_checkin_since", { ...auth(), p_version: Number(version) || 0, p_log_id: Number(logId) || 0 });
  const stats = () => callRpc(db, "gala_checkin_stats", auth());

  // Every mutation takes the op id from the caller: the STORE owns retries, and a
  // retry must reuse the id or it is not idempotent.
  const checkIn = (opId, guestIds, opts = {}) =>
    callRpc(db, "gala_checkin", { ...auth(), p_guest_ids: guestIds, p_op_id: opId, p_opts: opts });
  const undo = (opId, guestId, reason = "") =>
    callRpc(db, "gala_checkin_undo", { ...auth(), p_guest_id: guestId, p_op_id: opId, p_reason: reason });
  const walkIn = (opId, guest, opts = {}) =>
    callRpc(db, "gala_checkin_walkin", { ...auth(), p_op_id: opId, p_guest: guest, p_opts: opts });
  const updateGuest = (opId, guestId, patch) =>
    callRpc(db, "gala_checkin_guest_update", { ...auth(), p_guest_id: guestId, p_op_id: opId, p_patch: patch });
  const paddleAssign = (opId, guestId, number = null, opts = {}) =>
    callRpc(db, "gala_checkin_paddle_assign", { ...auth(), p_guest_id: guestId, p_op_id: opId, p_number: number, p_opts: opts });
  const paddleSwap = (opId, guestId, number = null, oldStatus = "void", opts = {}) =>
    callRpc(db, "gala_checkin_paddle_swap", { ...auth(), p_guest_id: guestId, p_op_id: opId, p_number: number, p_old_status: oldStatus, p_opts: opts });
  const paddleRelease = (opId, paddleNumber, force = false) =>
    callRpc(db, "gala_checkin_paddle_release", { ...auth(), p_paddle_number: paddleNumber, p_op_id: opId, p_force: force });
  const groupSet = (opId, guestIds, joinGuestId = null) =>
    callRpc(db, "gala_checkin_group_set", { ...auth(), p_guest_ids: guestIds, p_op_id: opId, p_join_guest_id: joinGuestId });

  async function logout() {
    await callRpc(db, "gala_checkin_logout", auth());
    forget();
  }

  // --- the pledge terminal (docs/gala-2026/10-display-rpc-contract.md s3, s4) --
  // ADDED for the donation terminal. Nothing above this line changed: the same
  // session, the same op-id discipline, the same "nothing throws" contract. The
  // RPCs take DOLLARS (`p_amount numeric`) while the display state speaks cents,
  // so the caller converts once, in galaTerminal/derive.js.
  const donationAdd = (opId, { amount, paddle = null, roundKey = null, kind = "pledge", donorName = null, note = "", hidden = false }) =>
    callRpc(db, "gala_donation_add", {
      ...auth(), p_op_id: opId, p_amount: amount, p_paddle_number: paddle, p_round_key: roundKey,
      p_kind: kind, p_donor_name: donorName, p_note: note, p_hidden: hidden,
    });

  const donationRecord = (opId, { amount, paddle = null, roundKey = null, kind = "pledge", donorName = null, note = "", anonymous = false, hidden = false, publishDelayMs = null }) =>
    callRpc(db, "gala_donation_record", {
      ...auth(), p_op_id: opId, p_amount: amount, p_paddle_number: paddle, p_round_key: roundKey,
      p_kind: kind, p_donor_name: donorName, p_note: note, p_anonymous: anonymous,
      p_hidden: hidden, p_publish_delay_ms: publishDelayMs,
    });

  /** The shared two-clerk tape. `since` is a `chg`; pass the returned cursor back. */
  const donationList = (since = 0) =>
    callRpc(db, "gala_donation_list", { ...auth(), p_since: Number(since) || 0 });

  const donationUpdate = (opId, donationId, patch) =>
    callRpc(db, "gala_donation_update", { ...auth(), p_op_id: opId, p_donation_id: donationId, p_patch: patch });
  const donationRetract = (opId, donationId, reason = "") =>
    callRpc(db, "gala_donation_retract", { ...auth(), p_op_id: opId, p_donation_id: donationId, p_reason: reason });
  const donationUnretract = (opId, donationId) =>
    callRpc(db, "gala_donation_unretract", { ...auth(), p_op_id: opId, p_donation_id: donationId });
  const donationVoid = (opId, donationId, reason) =>
    callRpc(db, "gala_donation_void", { ...auth(), p_op_id: opId, p_donation_id: donationId, p_reason: reason });

  /** Admin-role sessions only; a door token is answered `forbidden`, not an error. */
  const displaySet = (opId, patch) =>
    callRpc(db, "gala_display_set", { ...auth(), p_op_id: opId, p_patch: patch });

  // ADDED for the ops console's Big Screen tab (ticket G7). Not part of the
  // original display-terminal surface, so it is additive: everything above
  // this line is unchanged. Admin-role sessions only (docs/gala-2026/
  // 10-display-rpc-contract.md section 5); the key is returned exactly once
  // and the caller must never persist it (web storage or otherwise).
  const displayRotateKey = () => callRpc(db, "gala_display_rotate_key", auth());

  // ADDED for the /gala/admin Tools tab. Existing admin-only RPCs
  // (gala_checkin_pool_init / gala_checkin_pool_mark), additive: nothing above
  // changed. pool_init only ever ADDS numbers (on conflict do nothing);
  // pool_mark moves unassigned paddles between free, held and void.
  const poolInit = (lo, hi, held = []) =>
    callRpc(db, "gala_checkin_pool_init", { ...auth(), p_lo: lo, p_hi: hi, p_held: held });
  const poolMark = (numbers, status) =>
    callRpc(db, "gala_checkin_pool_mark", { ...auth(), p_numbers: numbers, p_status: status });

  // --- realtime ------------------------------------------------------------
  function people(raw) {
    const out = [];
    for (const entries of Object.values(raw || {})) {
      for (const e of entries || []) {
        if (e?.c && !out.some((p) => p.c === e.c)) out.push({ c: e.c, n: e.n || "", focus: e.focus ?? null });
      }
    }
    return out;
  }

  /** onStatus: "live" | "down". The store turns "down" into faster polling. */
  function subscribe({ onPing, onPresence, onStatus } = {}) {
    if (!db || !channelName) {
      onStatus?.("down");
      return () => {};
    }
    const stale = db.getChannels?.().find((c) => c.topic === `realtime:${channelName}`);
    if (stale) db.removeChannel(stale);

    const ch = db.channel(channelName, { config: { broadcast: { self: false }, presence: { key: me } } });
    ch.on("broadcast", { event: "ping" }, ({ payload }) => {
      const v = Number(payload?.v);
      if (Number.isFinite(v)) onPing?.(v);
    });
    const emit = () => onPresence?.(people(ch.presenceState()));
    ch.on("presence", { event: "sync" }, emit);
    ch.on("presence", { event: "join" }, emit);
    ch.on("presence", { event: "leave" }, emit);
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        onStatus?.("live");
        try { await ch.track({ c: me, n: actor, focus: presence.focus }); } catch { /* decoration */ }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        onStatus?.("down");
      }
    });
    channel = ch;
    return () => {
      channel = null;
      db.removeChannel(ch).catch(() => {});
    };
  }

  async function ping(version) {
    try {
      // Version and client id. Never a guest, a name, or the token.
      await channel?.send({ type: "broadcast", event: "ping", payload: { v: version, c: me } });
    } catch { /* the poll covers a lost doorbell */ }
  }

  async function setFocus(guestId) {
    presence = { focus: guestId ? { g: guestId } : null };
    try { await channel?.track({ c: me, n: actor, focus: presence.focus }); } catch { /* decoration */ }
  }

  return {
    event, clientId: me,
    get hasToken() { return Boolean(token); },
    get actor() { return actor; },
    unlock, adminSession, load, since, stats, logout, forget,
    checkIn, undo, walkIn, updateGuest, paddleAssign, paddleSwap, paddleRelease, groupSet,
    subscribe, ping, setFocus,
    donationAdd, donationRecord, donationList, donationUpdate, donationRetract, donationUnretract,
    donationVoid, displaySet, displayRotateKey, poolInit, poolMark,
  };
}
