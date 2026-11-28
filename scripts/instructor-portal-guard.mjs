// The stale-copy guard for `instructor-portal.mjs push`.
//
// `push` replaces the whole live document with the working copy. Staff also
// edit the live document from the dashboard, so an old working copy would wipe
// their week. This file decides whether a push would do that. It has no I/O:
// the script reads and writes, this judges. Tests:
// src/lib/instructorPortal/test/pushGuard.test.mjs
//
// How it knows. After every push the script keeps a "base" for the slug: the
// live version it just wrote and one hash per top-level section (hashes only,
// never content, in the gitignored private folder). On the next push it reads
// what is live and compares three things per section:
//
//   base  what this computer last pushed
//   live  what is there now
//   local what content.json would put there
//
// A section is at risk when live moved away from base and local is not what is
// live. That is somebody else's change about to be replaced with something
// else. A section that changed live and that the working copy already carries
// is fine, and so is a section only the working copy changed.

import { createHash } from "node:crypto";

/** `updated_at` as text with all six microsecond digits, always UTC. */
export const VERSION_SQL = `to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
export const VERSION_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/;

const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

// The date stamp every save rewrites. It is not something a person wrote, so a
// different stamp alone never blocks a push.
const STAMP_KEYS = new Set(["updated"]);

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** JSON text with object keys sorted, so equal values give equal text. */
export function canonical(value) {
  return JSON.stringify(value, (_key, v) =>
    isObject(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v,
  );
}

const hash = (value) => createHash("sha256").update(canonical(value) ?? "null", "utf8").digest("hex");

/** One hash per top-level section of a document. */
export function sectionHashes(doc) {
  const out = {};
  if (!isObject(doc)) return out;
  for (const key of Object.keys(doc).sort()) out[key] = hash(doc[key]);
  return out;
}

/** Top-level sections whose values differ between two documents, sorted. The stamp is left out. */
export function differingSections(a, b) {
  const x = isObject(a) ? a : {};
  const y = isObject(b) ? b : {};
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  return [...keys]
    .filter((k) => !STAMP_KEYS.has(k))
    .filter((k) => canonical(x[k]) !== canonical(y[k]))
    .sort();
}

/** What to remember after a push: the live version and a hash of each section. */
export function makeBase(doc, version) {
  return { version, sections: sectionHashes(doc) };
}

/** A stored base, or null when it is missing or not in the expected shape. */
export function readBase(state, slug) {
  const b = isObject(state) && isObject(state.slugs) ? state.slugs[slug] : null;
  if (!isObject(b) || typeof b.version !== "string" || !VERSION_RE.test(b.version)) return null;
  if (!isObject(b.sections)) return null;
  for (const v of Object.values(b.sections)) if (typeof v !== "string" || !HASH_RE.test(v)) return null;
  return { version: b.version, sections: b.sections };
}

/** The state file's contents with one slug's base replaced. Other slugs are kept. */
export function withBase(state, slug, base) {
  const slugs = isObject(state) && isObject(state.slugs) ? { ...state.slugs } : {};
  slugs[slug] = base;
  return {
    about:
      "Written by scripts/instructor-portal.mjs. The live version this computer last pushed, per slug. Hashes only, no content. Safe to delete: the next push then asks you to confirm.",
    slugs,
  };
}

/** Sections that changed live since the base was taken, sorted. The stamp is left out. */
export function changedSinceBase(base, live) {
  const now = sectionHashes(live);
  const keys = new Set([...Object.keys(base.sections), ...Object.keys(now)]);
  return [...keys]
    .filter((k) => !STAMP_KEYS.has(k))
    .filter((k) => base.sections[k] !== now[k])
    .sort();
}

/**
 * Decide what `push` should do.
 *
 *   local           the working copy (already valid schema 1)
 *   live            the live document, or null when the slug has none yet
 *   liveVersion     its version text, or null
 *   base            from readBase(), or null
 *   dashboardSaves  how many times staff have saved this slug from the
 *                   dashboard, as far as the history table knows. Only looked
 *                   at when there is no base.
 *
 * Returns one of
 *   { action: "push", first?: true }            go ahead
 *   { action: "same" }                          live already equals the working copy
 *   { action: "refuse", why: "live-changed", sections }
 *   { action: "refuse", why: "no-record", sections }
 */
export function judgePush({ local, live, liveVersion = null, base = null, dashboardSaves = 0 }) {
  if (live === null || live === undefined) return { action: "push", first: true };
  if (canonical(local) === canonical(live)) return { action: "same" };

  const differs = differingSections(local, live);

  if (!base) {
    // Nothing on this computer says which live version the working copy came
    // from. That is only a risk once staff have saved from the dashboard.
    if (!(dashboardSaves > 0)) return { action: "push" };
    if (!differs.length) return { action: "push" };
    return { action: "refuse", why: "no-record", sections: differs };
  }

  if (liveVersion && base.version === liveVersion) return { action: "push" };

  const atRisk = changedSinceBase(base, live).filter((k) => differs.includes(k));
  if (!atRisk.length) return { action: "push" };
  return { action: "refuse", why: "live-changed", sections: atRisk };
}

/* ------------------------------------------------------------------ *
 * SQL text. Every value that reaches a statement is checked here first.
 * ------------------------------------------------------------------ */

function mustBeSlug(slug) {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) throw new Error("bad slug");
  return slug;
}

/** Read what is live, with its version. */
export function liveQuery(slug) {
  return (
    `select content, updated_at, ${VERSION_SQL} as version ` +
    `from public.instructor_portal_content where slug = '${mustBeSlug(slug)}';`
  );
}

/**
 * Store the document, but only if the live row is still the version that was
 * just judged (or still absent, when `expectedVersion` is null). The row is
 * locked for the length of the statement, so a dashboard save cannot land
 * between the check and the write: it waits, then sees a new version and tells
 * its editor that somebody else saved.
 *
 * Returns one row: `r` (the function's answer, or {ok:false, reason:"moved"})
 * and `version` (the new version text when it was stored).
 */
export function guardedPushQuery(slug, base64Json, expectedVersion) {
  mustBeSlug(slug);
  if (typeof base64Json !== "string" || !base64Json || !B64_RE.test(base64Json)) throw new Error("bad payload");
  if (expectedVersion !== null && !(typeof expectedVersion === "string" && VERSION_RE.test(expectedVersion))) {
    throw new Error("bad version");
  }
  const expected = expectedVersion === null ? "null::text" : `'${expectedVersion}'::text`;
  return `with cur as materialized (
  select ${VERSION_SQL} as version
  from public.instructor_portal_content
  where slug = '${slug}'
  for update
),
done as materialized (
  select case
    when (select version from cur) is not distinct from ${expected}
    then public.instructor_portal_set_content('${slug}', convert_from(decode('${base64Json}', 'base64'), 'utf8')::jsonb)
    else jsonb_build_object('ok', false, 'reason', 'moved')
  end as r
)
select r,
  case when (r ->> 'ok') = 'true'
    then to_char((r ->> 'updated_at')::timestamptz at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  end as version
from done;`;
}

/** Is the history table there? It arrives with the staff editor's migration. */
export const HISTORY_EXISTS_QUERY =
  `select to_regclass('public.instructor_portal_content_history') is not null as present;`;

/** How many versions of this slug were replaced by a dashboard save. */
export function dashboardSavesQuery(slug) {
  return (
    `select count(*)::int as n from public.instructor_portal_content_history ` +
    `where slug = '${mustBeSlug(slug)}' and source = 'dashboard';`
  );
}

/* ------------------------------------------------------------------ *
 * Words for the person at the keyboard. Section names only, never content.
 * ------------------------------------------------------------------ */

/** The message for a refused push. `pulledFile` is the path `pull` writes. */
export function refusalText({ why, sections, slug, liveVersion, pulledFile }) {
  const list = `  ${sections.join(", ")}`;
  const flag = slug === "instructors" ? "" : ` --slug ${slug}`;
  const steps = [
    "What to do:",
    `  1. node scripts/instructor-portal.mjs pull${flag}`,
    `  2. bring those sections from ${pulledFile} into content.json`,
    `  3. node scripts/instructor-portal.mjs push${flag}`,
  ];
  if (why === "live-changed") {
    return [
      "push stopped. Nothing was changed.",
      "",
      `The live portal (slug=${slug}) was edited after this computer last pushed it`,
      `(live version ${liveVersion}). These sections changed there, and content.json`,
      "would replace them with something else:",
      list,
      "",
      ...steps,
      "",
      "To replace them on purpose, add --overwrite to the push.",
    ].join("\n");
  }
  return [
    "push stopped. Nothing was changed.",
    "",
    `Staff have saved this portal (slug=${slug}) from the dashboard, and this computer`,
    "has no record of which live version content.json was made from. Live and",
    "content.json differ in:",
    list,
    "",
    "What to do:",
    `  1. node scripts/instructor-portal.mjs pull${flag}`,
    `  2. compare ${pulledFile} with content.json and bring across what staff changed`,
    `  3. node scripts/instructor-portal.mjs push${flag} --overwrite`,
    "",
    "After that one push this computer keeps the record itself.",
  ].join("\n");
}
