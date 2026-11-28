// Instructor portal · dashboard RPC client tests.
//   node src/lib/instructorPortal/test/adminRemote.test.mjs
//
// No network and no database: a fake client stands in for Supabase. This covers
// the part that can go wrong quietly: how each answer from the server (or the
// lack of one) becomes a result the editor can show, and that the version
// string goes back untouched.
//
// PRIVACY: every name and sentence below is invented for this file.

import { loadPortalForEdit, savePortalEdit, adminReasonText } from "../adminRemote.js";

/* ------------------------------------------------------------------ *
 * tiny harness (same shape as run.mjs)
 * ------------------------------------------------------------------ */

let passed = 0;
const failures = [];
let group = "";
const pending = [];

function describe(name, fn) { group = name; fn(); }
function it(name, fn) {
  const label = `${group} > ${name}`;
  pending.push(
    Promise.resolve()
      .then(fn)
      .then(() => { passed++; })
      .catch((err) => { failures.push(`${label}\n    ${err && err.message ? err.message : err}`); }),
  );
}
function eq(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message || "not equal"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function deepEq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message || "not deep equal"}:\n    expected ${b}\n    got      ${a}`);
}

/** A stand-in client: answers every rpc() with `answer`, and records the calls. */
function fakeClient(answer) {
  const calls = [];
  return {
    calls,
    rpc(name, args) {
      calls.push({ name, args });
      return {
        abortSignal() {
          if (answer instanceof Error) return Promise.reject(answer);
          return Promise.resolve(answer);
        },
      };
    },
  };
}

const DOC = { schema: 1, updated: "2026-11-20", week: [], dates: [], faq: [] };
// Microseconds, as Postgres sends them. A Date would round this to .123.
const VERSION = "2026-11-27T21:42:10.123456+00:00";

describe("loadPortalForEdit", () => {
  it("maps a good answer", async () => {
    const db = fakeClient({ data: { ok: true, slug: "instructors-dev", content: DOC, updated_at: VERSION, updated_by: " Rosa Example " }, error: null });
    const r = await loadPortalForEdit(db, "instructors-dev");
    deepEq(r, { ok: true, content: DOC, updatedAt: VERSION, updatedBy: "Rosa Example" });
    deepEq(db.calls, [{ name: "instructor_portal_admin_get", args: { p_slug: "instructors-dev" } }]);
  });
  it("no name when the owner's script made the live version", async () => {
    const db = fakeClient({ data: { ok: true, content: DOC, updated_at: VERSION, updated_by: null }, error: null });
    eq((await loadPortalForEdit(db, "instructors")).updatedBy, null);
  });
  it("passes the server's refusals through", async () => {
    for (const reason of ["forbidden", "no-portal", "invalid-slug"]) {
      const db = fakeClient({ data: { ok: false, reason }, error: null });
      deepEq(await loadPortalForEdit(db, "instructors"), { ok: false, reason });
    }
  });
  it("a bad slug never reaches the server", async () => {
    const db = fakeClient({ data: { ok: true }, error: null });
    deepEq(await loadPortalForEdit(db, "Not A Slug"), { ok: false, reason: "invalid-slug" });
    eq(db.calls.length, 0);
  });
  it("migration not applied, signed out, dead network, no client", async () => {
    deepEq(await loadPortalForEdit(fakeClient({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }), "instructors"), { ok: false, reason: "not-installed" });
    deepEq(await loadPortalForEdit(fakeClient({ data: null, error: { code: "42501", message: "permission denied for function" } }), "instructors"), { ok: false, reason: "signed-out" });
    deepEq(await loadPortalForEdit(fakeClient({ data: null, error: { message: "Failed to fetch" } }), "instructors"), { ok: false, reason: "network" });
    deepEq(await loadPortalForEdit(fakeClient(new Error("aborted")), "instructors"), { ok: false, reason: "network" });
    deepEq(await loadPortalForEdit(null, "instructors"), { ok: false, reason: "config" });
  });
  it("an answer without a document or a version is not trusted", async () => {
    deepEq(await loadPortalForEdit(fakeClient({ data: { ok: true, content: null, updated_at: VERSION }, error: null }), "instructors"), { ok: false, reason: "network" });
    deepEq(await loadPortalForEdit(fakeClient({ data: { ok: true, content: DOC }, error: null }), "instructors"), { ok: false, reason: "network" });
    deepEq(await loadPortalForEdit(fakeClient({ data: { ok: false, reason: "something-new" }, error: null }), "instructors"), { ok: false, reason: "network" });
  });
});

describe("savePortalEdit", () => {
  it("sends the document and the version exactly as given", async () => {
    const next = "2026-11-27T21:50:00.654321+00:00";
    const db = fakeClient({ data: { ok: true, slug: "instructors-dev", updated_at: next, unchanged: false, bytes: 10 }, error: null });
    const r = await savePortalEdit(db, "instructors-dev", DOC, VERSION);
    deepEq(r, { ok: true, updatedAt: next, unchanged: false });
    eq(db.calls[0].name, "instructor_portal_admin_save");
    eq(db.calls[0].args.p_expected_updated_at, VERSION, "version untouched");
    eq(db.calls[0].args.p_content, DOC, "the same object, not a copy with changes");
    eq(db.calls[0].args.p_slug, "instructors-dev");
  });
  it("an unchanged save says so", async () => {
    const db = fakeClient({ data: { ok: true, updated_at: VERSION, unchanged: true }, error: null });
    deepEq(await savePortalEdit(db, "instructors", DOC, VERSION), { ok: true, updatedAt: VERSION, unchanged: true });
  });
  it("a conflict carries the live version", async () => {
    const live = "2026-11-27T21:45:00.000001+00:00";
    const db = fakeClient({ data: { ok: false, reason: "conflict", updated_at: live }, error: null });
    deepEq(await savePortalEdit(db, "instructors", DOC, VERSION), { ok: false, reason: "conflict", updatedAt: live });
  });
  it("other refusals pass through without a version", async () => {
    for (const reason of ["forbidden", "locked-sections", "too-large", "bad-schema", "no-portal"]) {
      const db = fakeClient({ data: { ok: false, reason, updated_at: VERSION }, error: null });
      deepEq(await savePortalEdit(db, "instructors", DOC, VERSION), { ok: false, reason });
    }
  });
  it("refuses to call without a slug, a document or a version", async () => {
    const db = fakeClient({ data: { ok: true, updated_at: VERSION }, error: null });
    deepEq(await savePortalEdit(db, "x", DOC, VERSION), { ok: false, reason: "invalid-slug" });
    deepEq(await savePortalEdit(db, "instructors", [DOC], VERSION), { ok: false, reason: "not-an-object" });
    deepEq(await savePortalEdit(db, "instructors", null, VERSION), { ok: false, reason: "not-an-object" });
    deepEq(await savePortalEdit(db, "instructors", DOC, ""), { ok: false, reason: "missing-version" });
    deepEq(await savePortalEdit(db, "instructors", DOC, new Date()), { ok: false, reason: "missing-version" }, "a Date is not a version");
    eq(db.calls.length, 0);
  });
  it("a dead network never throws", async () => {
    deepEq(await savePortalEdit(fakeClient(new Error("offline")), "instructors", DOC, VERSION), { ok: false, reason: "network" });
  });
});

describe("adminReasonText", () => {
  it("has a plain sentence for every reason, with no em-dash", () => {
    const reasons = ["forbidden", "signed-out", "not-installed", "no-portal", "conflict", "locked-sections", "too-large", "config", "invalid-slug", "not-an-object", "bad-schema", "missing-version", "network", "anything-else"];
    for (const reason of reasons) {
      const text = adminReasonText(reason);
      if (typeof text !== "string" || text.length < 20) throw new Error(`no sentence for ${reason}`);
      if (text.includes("\u2014")) throw new Error(`em-dash in the sentence for ${reason}`);
      if (!/[.]$/.test(text)) throw new Error(`the sentence for ${reason} does not end with a full stop`);
    }
    eq(adminReasonText("anything-else"), adminReasonText("network"));
  });
});

/* ------------------------------------------------------------------ *
 * summary
 * ------------------------------------------------------------------ */

await Promise.all(pending);
const total = passed + failures.length;
if (failures.length) {
  console.log(`\nFAIL  ${failures.length} of ${total} checks failed\n`);
  for (const f of failures) console.log(`  x ${f}\n`);
  process.exit(1);
} else {
  console.log(`\nPASS  ${passed} of ${total} checks passed\n`);
}
