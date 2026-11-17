// Giving Tuesday drawing · logic tests.  node src/lib/dashboard/test/givingDraw.test.mjs
//
// Proves the draw is uniform (no modulo bias), that rejection sampling throws
// away the top of the 32-bit range, that the stored seed replays to the same
// winner, and that the snapshot has the shape giving_draws.eligible expects.
// Also checks the money/URL/slug helpers the admin tab leans on.
//
// PRIVACY: every name below is invented for this file.

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  buildEligibleSnapshot,
  indexFromSeed,
  runDraw,
  uniformIndex,
} from "../givingDraw.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// Deterministic source: xorshift32 bytes, so the run is repeatable.
function seededSource(seed) {
  let state = seed >>> 0 || 1;
  return (array) => {
    for (let i = 0; i < array.length; i += 1) {
      state ^= state << 13;
      state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      array[i] = state & 0xff;
    }
    return array;
  };
}

// Scripted source: hands out exactly these bytes.
function scriptedSource(bytes) {
  let offset = 0;
  return (array) => {
    for (let i = 0; i < array.length; i += 1) array[i] = bytes[offset++];
    return array;
  };
}

const TOTALS = [
  { fundraiser_id: "c0000000-0000-4000-8000-000000000003", display_name: "Test Cora", status: "approved", reached: true, eligible_cents: 20000 },
  { fundraiser_id: "a0000000-0000-4000-8000-000000000001", display_name: "Test Ana", status: "approved", reached: true, eligible_cents: 15000 },
  { fundraiser_id: "b0000000-0000-4000-8000-000000000002", display_name: "Test Bea", status: "approved", reached: false, eligible_cents: 9000 },
  { fundraiser_id: "d0000000-0000-4000-8000-000000000004", display_name: "Test Dee", status: "hidden", reached: true, eligible_cents: 30000 },
  { fundraiser_id: "e0000000-0000-4000-8000-000000000005", display_name: "Test Eve", status: "pending", reached: true, eligible_cents: 16000 },
];

test("snapshot: approved + reached only, sorted by id, exact shape", () => {
  const snap = buildEligibleSnapshot(TOTALS);
  assert.deepEqual(snap, [
    { fundraiser_id: "a0000000-0000-4000-8000-000000000001", name: "Test Ana", eligible_cents: 15000 },
    { fundraiser_id: "c0000000-0000-4000-8000-000000000003", name: "Test Cora", eligible_cents: 20000 },
  ]);
  // Order of the input must not change the snapshot.
  assert.deepEqual(buildEligibleSnapshot(TOTALS.slice().reverse()), snap);
});

test("runDraw: row shape for giving_draws", () => {
  const snap = buildEligibleSnapshot(TOTALS);
  const draw = runDraw(snap, seededSource(42));
  assert.deepEqual(Object.keys(draw).sort(), ["eligible", "seed", "winner_fundraiser_id", "winner_index"]);
  assert.equal(draw.eligible, snap);
  assert.match(draw.seed, /^([0-9a-f]{8})+$/);
  assert.equal(draw.winner_fundraiser_id, snap[draw.winner_index].fundraiser_id);
  assert.throws(() => runDraw([], seededSource(1)), /Nobody/);
});

test("rejection sampling: values at or above the limit are thrown away", () => {
  // n = 3: limit = 2^32 - (2^32 mod 3) = 4294967295. 0xFFFFFFFF is rejected,
  // then 0x00000005 -> 5 mod 3 = 2.
  const result = uniformIndex(3, scriptedSource([0xff, 0xff, 0xff, 0xff, 0, 0, 0, 5]));
  assert.equal(result.index, 2);
  assert.equal(result.bytes.length, 8);
  // n = 1 always answers 0 and never rejects.
  assert.equal(uniformIndex(1, scriptedSource([0xff, 0xff, 0xff, 0xff])).index, 0);
  // A power of two never rejects either.
  assert.equal(uniformIndex(4, scriptedSource([0xff, 0xff, 0xff, 0xff])).index, 3);
});

test("rejection boundary for a pool of 7", () => {
  const n = 7;
  const limit = 2 ** 32 - (2 ** 32 % n);
  const be = (v) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  // limit - 1 is kept, limit is rejected.
  assert.equal(uniformIndex(n, scriptedSource(be(limit - 1))).index, (limit - 1) % n);
  const r = uniformIndex(n, scriptedSource([...be(limit), ...be(10)]));
  assert.equal(r.index, 10 % n);
  assert.equal(r.bytes.length, 8);
});

test("seed replays to the same winner", () => {
  for (let s = 1; s <= 200; s += 1) {
    const n = (s % 13) + 1;
    const pool = Array.from({ length: n }, (_, i) => ({ fundraiser_id: `id-${i}`, name: `Test ${i}`, eligible_cents: 15000 }));
    const draw = runDraw(pool, seededSource(s * 7919));
    assert.equal(indexFromSeed(n, draw.seed), draw.winner_index);
  }
});

function chiSquare(counts, expected) {
  return counts.reduce((sum, c) => sum + ((c - expected) ** 2) / expected, 0);
}

test("uniform: 7-way pool over 700,000 seeded draws (chi-square, 6 df)", () => {
  const n = 7;
  const draws = 700_000;
  const counts = new Array(n).fill(0);
  const source = seededSource(20261201);
  for (let i = 0; i < draws; i += 1) counts[uniformIndex(n, source).index] += 1;
  const chi = chiSquare(counts, draws / n);
  console.log(`   counts ${counts.join(" ")}  chi2=${chi.toFixed(2)} (p=0.001 critical 22.46)`);
  assert.ok(chi < 22.46, `chi-square ${chi} too high`);
});

test("uniform: 5-way pool over 500,000 crypto.getRandomValues draws", () => {
  const n = 5;
  const draws = 500_000;
  const counts = new Array(n).fill(0);
  const source = (a) => webcrypto.getRandomValues(a);
  for (let i = 0; i < draws; i += 1) counts[uniformIndex(n, source).index] += 1;
  const chi = chiSquare(counts, draws / n);
  console.log(`   counts ${counts.join(" ")}  chi2=${chi.toFixed(2)} (p=0.001 critical 18.47)`);
  assert.ok(chi < 18.47, `chi-square ${chi} too high`);
});

test("no modulo bias: exhaustive count over a scaled-down 8-bit range", () => {
  // The same rule on an 8-bit word: with n = 3 and 256 values, plain modulo
  // would favour 0 (86/85/85). Rejection keeps 255 values, 85 each.
  const n = 3;
  const range = 256;
  const limit = range - (range % n);
  const counts = new Array(n).fill(0);
  for (let v = 0; v < range; v += 1) if (v < limit) counts[v % n] += 1;
  assert.deepEqual(counts, [85, 85, 85]);
});

// ── Helpers in givingAdmin.js (no Supabase needed) ──
// givingAdmin.js reads import.meta.env.DEV only inside a function, so it
// imports cleanly under Node.
const admin = await import("../givingAdmin.js");

test("parseDollarsToCents: text parsing, no float rounding", () => {
  assert.equal(admin.parseDollarsToCents("50"), 5000);
  assert.equal(admin.parseDollarsToCents("$1,250.25"), 125025);
  assert.equal(admin.parseDollarsToCents("0.1"), 10);
  assert.equal(admin.parseDollarsToCents("19.99"), 1999);
  assert.equal(admin.parseDollarsToCents("0"), null);
  assert.equal(admin.parseDollarsToCents("-5"), null);
  assert.equal(admin.parseDollarsToCents("1.234"), null);
  assert.equal(admin.parseDollarsToCents(""), null);
  assert.equal(admin.centsToInput(125025), "1250.25");
  assert.equal(admin.centsToInput(5000), "50");
  assert.equal(admin.formatCents(1500000), "$15,000");
  assert.equal(admin.formatCents(2550), "$25.50");
});

test("chicagoDateToIso: Dec 1 typed saves as Dec 1 Central", () => {
  const iso = admin.chicagoDateToIso("2026-12-01");
  assert.equal(iso, "2026-12-01T18:00:00.000Z");
  assert.equal(admin.formatChicagoDate(iso), "2026-12-01");
  // Summer (CDT) too.
  assert.equal(admin.formatChicagoDate(admin.chicagoDateToIso("2026-07-04")), "2026-07-04");
  assert.equal(admin.chicagoDateToIso("12/01/2026"), null);
});

test("normalizeZeffyUrl", () => {
  assert.deepEqual(admin.normalizeZeffyUrl("  https://www.zeffy.com/en-US/peer-to-peer/lsp-giving-tuesday/test-ana?utm=x#top "), {
    ok: true,
    value: "https://www.zeffy.com/en-US/peer-to-peer/lsp-giving-tuesday/test-ana",
  });
  assert.deepEqual(admin.normalizeZeffyUrl(""), { ok: true, value: null });
  assert.equal(admin.normalizeZeffyUrl("http://www.zeffy.com/x").ok, false);
  assert.equal(admin.normalizeZeffyUrl("https://zeffy.com.evil.test/x").ok, false);
  assert.equal(admin.normalizeZeffyUrl("https://evilzeffy.com/x").ok, false);
  assert.equal(admin.normalizeZeffyUrl("zeffy.com/x").ok, false);
});

test("validateFundraiserInput + nextFreeSlug match the sign-up function", () => {
  const r = admin.validateFundraiserInput({
    firstName: "  Lucía  del ", lastName: "Rincón Martínez", email: " Test@Example.com ",
    phone: "312 555 0100", cohort: "instructor", why: "Because\nmovement",
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.firstName, "Lucía del");
  assert.equal(r.value.email, "test@example.com");
  assert.equal(r.value.why, "Because movement");
  assert.equal(r.value.baseSlug, "lucia-del-rincon-martinez");
  assert.equal(admin.nextFreeSlug("test-ana", ["test-ana", "test-ana-2"]), "test-ana-3");
  assert.equal(admin.nextFreeSlug("test-ana", []), "test-ana");
  assert.equal(admin.validateFundraiserInput({ firstName: "A", lastName: "B", email: "nope", cohort: "instructor" }).field, "email");
  assert.equal(admin.validateFundraiserInput({ firstName: "A", lastName: "B", email: "a@b.co", cohort: "x" }).field, "cohort");
  assert.equal(admin.validateFundraiserInput({ firstName: "A", lastName: "B", email: "a@b.co", cohort: "both", why: "x".repeat(161) }).field, "why");
});

console.log(`\n${passed} passed`);
