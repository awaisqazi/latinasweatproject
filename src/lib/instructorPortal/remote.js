// Instructor portal client: the three RPCs in
// supabase/migrations/20261125120000_instructor_portal.sql, plus the session token.
// Contract: ./README.md ("Client API").
//
// Rules this file exists to keep:
//   - the passcode goes in one RPC body and nowhere else: never stored, never in
//     a URL, never logged;
//   - only the session token is stored (sessionStorage, or localStorage when
//     "remember this device" is ticked). Content stays in memory;
//   - one Supabase client, the shared one;
//   - nothing here throws. A dead network or a missing config is a result value.
//   - ?slug= and ?local=1 work only under `astro dev`: each branch is guarded
//     directly on import.meta.env.DEV, which Vite replaces with `false` in a
//     production build, so the bundler drops the branch.

import { supabase as sharedClient } from "../supabaseClient.js";

export const DEFAULT_SLUG = "instructors";
const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const CALL_TIMEOUT_MS = 12000;
const LOCAL_CONTENT_URL = "/private/instructor-portal/content.json";

const UNLOCK_REASONS = new Set(["bad-passcode", "locked", "no-portal"]);

/* ------------------------------------------------------------------ *
 * Slug and dev switches
 * ------------------------------------------------------------------ */

function queryParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

/** "instructors"; under astro dev only, ?slug=instructors-dev picks another. */
export function portalSlug() {
  if (import.meta.env.DEV) {
    const asked = queryParam("slug");
    if (asked && SLUG_RE.test(asked)) return asked;
  }
  return DEFAULT_SLUG;
}

/** true under astro dev with ?local=1 (always false in a production build). */
export function localMode() {
  if (import.meta.env.DEV) {
    return queryParam("local") === "1";
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Token storage. Wrapped everywhere: Safari private mode and blocked site
 * data can throw on access, and the right failure is "type it again".
 * ------------------------------------------------------------------ */

function tokenKey(slug) {
  return `lsp.instructorPortal.${slug}.token`;
}

function storageArea(persist) {
  try {
    if (typeof window === "undefined") return null;
    return persist ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readToken(slug) {
  for (const persist of [false, true]) {
    try {
      const value = storageArea(persist)?.getItem(tokenKey(slug));
      if (value && TOKEN_RE.test(value)) return value;
    } catch {
      /* try the other area */
    }
  }
  return "";
}

function saveToken(slug, token, remember) {
  clearToken(slug);
  try {
    storageArea(!!remember)?.setItem(tokenKey(slug), token);
  } catch {
    /* not stored: this tab still works, a reload asks again */
  }
}

function clearToken(slug) {
  for (const persist of [false, true]) {
    try {
      storageArea(persist)?.removeItem(tokenKey(slug));
    } catch {
      /* nothing to do */
    }
  }
}

/* ------------------------------------------------------------------ *
 * RPC
 * ------------------------------------------------------------------ */

const NETWORK = Object.freeze({ ok: false, reason: "network" });

async function callRpc(name, args) {
  const db = sharedClient;
  if (!db) return { ok: false, reason: "config" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const { data, error } = await db.rpc(name, args).abortSignal(controller.signal);
    if (error) {
      // No code means PostgREST never answered. With a code, the server is up
      // but the call failed (for example the migration is not applied yet);
      // the visitor can only retry later either way.
      return { ...NETWORK, error: error.code || "" };
    }
    if (!data || typeof data !== "object") return { ...NETWORK };
    return data;
  } catch {
    // AbortError, a thrown fetch, a patched global: all "not right now".
    return { ...NETWORK };
  } finally {
    clearTimeout(timer);
  }
}

function okResult(res) {
  return {
    ok: true,
    content: res.content ?? null,
    updatedAt: res.content_updated_at ?? null,
    expiresAt: res.expires_at ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * @param {string} passcode
 * @param {{ remember?: boolean }} [opts]
 * @returns {Promise<{ ok: true, content: object, updatedAt: string|null, expiresAt: string|null }
 *                  | { ok: false, reason: "bad-passcode"|"locked"|"no-portal"|"network"|"config",
 *                      retryAfterSeconds?: number }>}
 */
export async function unlockPortal(passcode, { remember = false } = {}) {
  const slug = portalSlug();
  const pass = typeof passcode === "string" ? passcode : "";
  if (!sharedClient) return { ok: false, reason: "config" };
  if (!pass) return { ok: false, reason: "bad-passcode" };

  const res = await callRpc("instructor_portal_unlock", {
    p_slug: slug,
    p_pass: pass,
    p_remember: !!remember,
  });

  if (res.ok && typeof res.token === "string" && TOKEN_RE.test(res.token)) {
    saveToken(slug, res.token, remember);
    return okResult(res);
  }

  const reason = UNLOCK_REASONS.has(res.reason) ? res.reason : res.reason === "config" ? "config" : "network";
  const out = { ok: false, reason };
  if (reason === "locked" && Number.isFinite(Number(res.retry_after_seconds))) {
    out.retryAfterSeconds = Math.max(1, Math.round(Number(res.retry_after_seconds)));
  }
  return out;
}

/**
 * Pick up a stored session, if any.
 * @returns {Promise<{ ok: true, content: object, updatedAt: string|null, expiresAt: string|null }
 *                  | { ok: false, reason: "no-session"|"expired"|"network"|"config" }>}
 *   "config" only when a token is stored but Supabase is not configured.
 */
export async function resumePortal() {
  const slug = portalSlug();
  const token = readToken(slug);
  if (!token) return { ok: false, reason: "no-session" };
  if (!sharedClient) return { ok: false, reason: "config" };

  const res = await callRpc("instructor_portal_fetch", { p_slug: slug, p_token: token });
  if (res.ok) return okResult(res);
  if (res.reason === "expired") {
    clearToken(slug);
    return { ok: false, reason: "expired" };
  }
  return { ok: false, reason: "network" };
}

/** Forget the token here, then end the session on the server (best effort). */
export async function lockPortal() {
  const slug = portalSlug();
  const token = readToken(slug);
  clearToken(slug);
  if (token && sharedClient) {
    await callRpc("instructor_portal_lock", { p_slug: slug, p_token: token });
  }
  return { ok: true };
}

/**
 * Under astro dev only: the gitignored working copy, straight from the dev
 * server, with no Supabase involved. Production builds always get "no-local".
 * @returns {Promise<{ ok: true, content: object, updatedAt: null, local: true }
 *                  | { ok: false, reason: "no-local" }>}
 */
export async function loadLocalContent() {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(`${LOCAL_CONTENT_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return { ok: false, reason: "no-local" };
      const text = await res.text();
      let doc;
      try {
        doc = JSON.parse(text);
      } catch {
        return { ok: false, reason: "no-local" };
      }
      if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { ok: false, reason: "no-local" };
      return { ok: true, content: doc, updatedAt: null, local: true };
    } catch {
      return { ok: false, reason: "no-local" };
    }
  }
  return { ok: false, reason: "no-local" };
}
