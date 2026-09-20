// Shared-plan client: the RPCs in supabase/migrations/*_gala_seating.sql plus the
// realtime channel that keeps several planners in step.
//
// Contract: README.md, "Shared live plan, realtime collaboration, and the passcode".
//
// Rules this file exists to keep:
//   - the passcode travels in a POST body and nowhere else: never a URL, never a
//     log line, never a broadcast payload;
//   - no guest data ever leaves through Realtime. The broadcast is a doorbell:
//     { v, c }, a version and a client id. Whoever hears it calls since();
//   - nothing here throws. A dead network is a result value, not an exception,
//     because the store has to keep working offline.

import { supabase as sharedClient } from "../supabaseClient.js";

export const DEFAULT_SLUG = "gala-2026";
export const PASSCODE_STORAGE_KEY = "lsp.galaSeating.passcode";
export const EDITOR_STORAGE_KEY = "lsp.galaSeating.editor";
export const CLIENT_STORAGE_KEY = "lsp.galaSeating.clientId";

const CALL_TIMEOUT_MS = 12000;

// Presence dots. Gold first: it is the planner who unlocked most recently on a
// given device, and it reads as "you" against the gala palette.
export const PRESENCE_COLORS = [
  "#E4C98A", // gold
  "#E08A9B", // rose
  "#7FB8B0", // teal
  "#C9A227", // brass
  "#9FB8E4", // periwinkle
  "#D9A066", // amber
  "#A8C686", // sage
  "#C79BD8", // orchid
];

// ---------------------------------------------------------------------------
// Passcode handling. sessionStorage by default so closing the tab forgets it;
// localStorage only when the planner ticks "Remember on this device".
// ---------------------------------------------------------------------------

function store(persist) {
  if (typeof window === "undefined") return null;
  try {
    return persist ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberPasscode(pass, persist = false) {
  if (!pass) return;
  try {
    store(false)?.setItem(PASSCODE_STORAGE_KEY, pass);
    if (persist) store(true)?.setItem(PASSCODE_STORAGE_KEY, pass);
    else store(true)?.removeItem(PASSCODE_STORAGE_KEY);
  } catch {
    /* private mode: the planner retypes it, which is the correct failure */
  }
}

export function recallPasscode() {
  try {
    return store(false)?.getItem(PASSCODE_STORAGE_KEY) || store(true)?.getItem(PASSCODE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function forgetPasscode() {
  try {
    store(false)?.removeItem(PASSCODE_STORAGE_KEY);
    store(true)?.removeItem(PASSCODE_STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

export function rememberEditor(name) {
  try {
    store(true)?.setItem(EDITOR_STORAGE_KEY, name || "");
  } catch {
    /* nothing to do */
  }
}

export function recallEditor() {
  try {
    return store(true)?.getItem(EDITOR_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

/** Stable per-tab-ish id so a planner's own ops are not replayed back at them. */
export function clientId() {
  try {
    const found = store(false)?.getItem(CLIENT_STORAGE_KEY);
    if (found) return found;
    const made = randomId();
    store(false)?.setItem(CLIENT_STORAGE_KEY, made);
    return made;
  } catch {
    return randomId();
  }
}

function randomId() {
  try {
    return globalThis.crypto.randomUUID().slice(0, 12);
  } catch {
    return `c${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function colorForClient(id) {
  let h = 5381;
  for (let i = 0; i < String(id || "").length; i++) h = ((h << 5) + h + String(id).charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length];
}

/**
 * Channel name = "gala-seating:" + 20 hex of SHA-256(slug + ":" + passcode).
 * Realtime channel names are not secret, so deriving it from the passcode keeps
 * anyone without the passcode from joining and watching the doorbell traffic.
 */
async function channelName(slug, passcode) {
  const raw = `${slug}:${passcode}`;
  try {
    const bytes = new TextEncoder().encode(raw);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `gala-seating:${hex.slice(0, 20)}`;
  } catch {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < raw.length; i++) {
      h1 = (h1 ^ raw.charCodeAt(i)) >>> 0;
      h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = (Math.imul(h2 ^ raw.charCodeAt(raw.length - 1 - i), 2246822519) + h1) >>> 0;
    }
    return `gala-seating:${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}0000`;
  }
}

// ---------------------------------------------------------------------------

const OFFLINE = Object.freeze({ ok: false, reason: "offline" });

function isNetworkError(error) {
  if (!error) return false;
  if (error.code) return false; // PostgREST answered, so the wire is fine
  return true;
}

async function callRpc(db, name, args) {
  if (!db) return { ...OFFLINE };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

  try {
    const { data, error } = await db.rpc(name, args).abortSignal(controller.signal);
    if (error) {
      return isNetworkError(error)
        ? { ...OFFLINE }
        : { ok: false, reason: error.code || "error", error: error.message || "" };
    }
    if (!data || typeof data !== "object") return { ok: false, reason: "error" };
    return data;
  } catch {
    // AbortError, a thrown fetch, a monkey-patched global: all "not right now".
    return { ...OFFLINE };
  } finally {
    clearTimeout(timer);
  }
}

function toBatch(raw) {
  return {
    version: raw?.version ?? 0,
    client: raw?.client ?? "",
    editor: raw?.editor ?? "",
    at: raw?.at ?? null,
    ops: Array.isArray(raw?.ops) ? raw.ops : [],
  };
}

/**
 * @param {{ slug?: string, passcode: string, clientId?: string, editor?: string,
 *           client?: object }} opts
 *   `client` overrides the shared Supabase client. The app never passes it; tests
 *   do, so that two remotes can be genuinely independent (one Supabase client
 *   hands back the SAME channel object for a given topic, which is right for a
 *   browser tab and wrong for a two-planner simulation).
 */
export function createRemote({
  slug = DEFAULT_SLUG,
  passcode,
  clientId: myId,
  editor = "",
  client: db = sharedClient,
} = {}) {
  const me = myId || clientId();
  let editorName = String(editor || "").slice(0, 60);
  let channel = null;
  let channelReady = null;
  let presenceState = { focus: null };
  let torn = false;

  const auth = () => ({ p_slug: slug, p_pass: passcode });

  async function verify() {
    const res = await callRpc(db, "gala_seating_verify", auth());
    return res.ok ? { ok: true } : { ok: false, reason: res.reason || "offline" };
  }

  async function load() {
    const res = await callRpc(db, "gala_seating_load", auth());
    if (!res.ok) return { ok: false, reason: res.reason || "offline" };
    return {
      ok: true,
      plan: res.plan ?? null,
      version: res.version ?? 0,
      updatedAt: res.updated_at ?? null,
      updatedBy: res.updated_by ?? "",
    };
  }

  async function check() {
    const res = await callRpc(db, "gala_seating_check", auth());
    if (!res.ok) return { ok: false, reason: res.reason || "offline" };
    return {
      ok: true,
      version: res.version ?? 0,
      updatedAt: res.updated_at ?? null,
      updatedBy: res.updated_by ?? "",
    };
  }

  async function apply(baseVersion, ops) {
    const res = await callRpc(db, "gala_seating_apply", {
      ...auth(),
      p_client: me,
      p_base_version: Number(baseVersion) || 0,
      p_ops: ops || [],
      p_editor: editorName,
    });
    if (!res.ok) return { ok: false, reason: res.reason || "offline", error: res.error };

    const version = res.version ?? 0;
    // Doorbell, fire and forget: a failed ping only costs the others a poll.
    ping(version);

    if (res.reset) return { ok: true, version, reset: { plan: res.reset.plan ?? null } };
    return { ok: true, version, missed: (res.missed || []).map(toBatch) };
  }

  async function since(version) {
    const res = await callRpc(db, "gala_seating_since", { ...auth(), p_version: Number(version) || 0 });
    if (!res.ok) return { ok: false, reason: res.reason || "offline" };
    if (res.reset) return { ok: true, version: res.version ?? 0, reset: { plan: res.reset.plan ?? null } };
    return { ok: true, version: res.version ?? 0, batches: (res.batches || []).map(toBatch) };
  }

  async function history() {
    const res = await callRpc(db, "gala_seating_history_list", auth());
    if (!res.ok) return [];
    return (res.items || []).map((row) => ({
      version: row.version ?? 0,
      at: row.at ?? null,
      editor: row.editor ?? "",
      guestCount: row.guest_count ?? 0,
      seatedCount: row.seated_count ?? 0,
      label: row.label ?? null,
    }));
  }

  async function historyGet(version) {
    const res = await callRpc(db, "gala_seating_history_get", { ...auth(), p_version: Number(version) || 0 });
    return res.ok ? res.plan ?? null : null;
  }

  async function snapshot(label) {
    const res = await callRpc(db, "gala_seating_snapshot", { ...auth(), p_label: String(label || "").slice(0, 80) });
    return res.ok ? { ok: true, version: res.version ?? 0 } : { ok: false, reason: res.reason || "offline" };
  }

  // --- realtime ------------------------------------------------------------

  function people(raw) {
    const out = [];
    for (const entries of Object.values(raw || {})) {
      for (const entry of entries || []) {
        if (!entry || !entry.client) continue;
        if (out.some((p) => p.client === entry.client)) continue;
        out.push({
          client: entry.client,
          editor: entry.editor || "",
          color: entry.color || colorForClient(entry.client),
          focus: entry.focus ?? null,
        });
      }
    }
    return out.sort((a, b) => a.client.localeCompare(b.client));
  }

  function subscribe({ onPing, onPresence, onStatus } = {}) {
    if (!db || !passcode) {
      onStatus?.("offline");
      return () => {};
    }

    torn = false; // a remount may subscribe again on the same remote
    channelReady = (async () => {
      try {
        const name = await channelName(slug, passcode);
        if (torn) return null;

        // A Supabase client hands back the same channel object for a topic it
        // already holds, and callbacks cannot be added to one that has already
        // subscribed. Drop the stale one so a re-subscribe (remount, passcode
        // change) starts clean instead of throwing.
        const stale = db.getChannels?.().find((c) => c.topic === `realtime:${name}`);
        if (stale) await db.removeChannel(stale);

        const ch = db.channel(name, {
          config: { broadcast: { self: false }, presence: { key: me } },
        });

        ch.on("broadcast", { event: "ping" }, ({ payload }) => {
          const version = Number(payload?.v);
          if (Number.isFinite(version)) onPing?.(version, payload?.c || "");
        });

        const emit = () => onPresence?.(people(ch.presenceState()));
        ch.on("presence", { event: "sync" }, emit);
        ch.on("presence", { event: "join" }, emit);
        ch.on("presence", { event: "leave" }, emit);

        ch.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            onStatus?.("live");
            await ch.track({ client: me, editor: editorName, color: colorForClient(me), focus: presenceState.focus });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            onStatus?.("error");
          } else if (status === "CLOSED") {
            onStatus?.("offline");
          }
        });

        channel = ch;
        return ch;
      } catch {
        // Realtime is a convenience: without it the store still polls since().
        onStatus?.("error");
        return null;
      }
    })();

    return () => {
      torn = true;
      const pending = channelReady;
      channelReady = null;
      channel = null;
      Promise.resolve(pending)
        .then((ch) => ch && db.removeChannel(ch))
        .catch(() => {});
    };
  }

  async function ping(version) {
    try {
      const ch = channel || (await channelReady);
      if (!ch) return;
      // Version and client id only. Never a plan, a guest, or the passcode.
      await ch.send({ type: "broadcast", event: "ping", payload: { v: version, c: me } });
    } catch {
      /* the 10 s fallback poll covers a missed doorbell */
    }
  }

  async function setPresence(patch = {}) {
    if (patch.editor !== undefined) editorName = String(patch.editor || "").slice(0, 60);
    if (patch.focus !== undefined) presenceState = { ...presenceState, focus: patch.focus ?? null };
    try {
      const ch = channel || (await channelReady);
      if (!ch) return;
      await ch.track({ client: me, editor: editorName, color: colorForClient(me), focus: presenceState.focus });
    } catch {
      /* presence is a nicety, never a blocker */
    }
  }

  return {
    slug,
    clientId: me,
    color: colorForClient(me),
    get editor() {
      return editorName;
    },
    verify,
    load,
    check,
    apply,
    since,
    history,
    historyGet,
    snapshot,
    subscribe,
    setPresence,
  };
}
