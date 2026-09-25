#!/usr/bin/env node
// Gala check-in concurrency test. Fires real, parallel HTTP requests at PostgREST
// against a THROWAWAY event and asserts that duplicate paddles are impossible.
//
//   1. Owner, once, in the Supabase SQL editor (values are yours, never committed):
//        select public.gala_checkin_set_passcode('test-ci-0921', '<door pass>', '<admin pass>');
//   2. Run:
//        GALA_TEST_EVENT=test-ci-0921 GALA_TEST_DOOR='<door pass>' GALA_TEST_ADMIN='<admin pass>' \
//          node scripts/gala-checkin-concurrency-test.mjs
//      URL and key come from PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_PUBLISHABLE_KEY
//      (environment first, then the repo's .env).
//   3. Owner, afterwards:
//        select public.gala_checkin_archive_and_purge('test-ci-0921', 'PURGE test-ci-0921');
//        delete from public.gala_event_archive where event_slug = 'test-ci-0921';
//
// The script refuses any event slug that does not start with "test-". All guest
// names are invented. Exit code 0 = every assertion held.

import fs from "node:fs";
import crypto from "node:crypto";

function envFile() {
  try {
    return Object.fromEntries(
      fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
        .split("\n")
        .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]),
    );
  } catch {
    return {};
  }
}

const fileEnv = envFile();
const URL_BASE = (process.env.PUBLIC_SUPABASE_URL || fileEnv.PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || fileEnv.PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const EVENT = process.env.GALA_TEST_EVENT || "";
const DOOR = process.env.GALA_TEST_DOOR || "";
const ADMIN = process.env.GALA_TEST_ADMIN || "";
const DEVICES = Number(process.env.GALA_TEST_DEVICES || 8);
const CHAOS_OPS = Number(process.env.GALA_TEST_CHAOS || 400);

if (!URL_BASE || !KEY) throw new Error("Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
if (!EVENT.startsWith("test-")) throw new Error('GALA_TEST_EVENT must start with "test-". This script never touches a real event.');
if (!DOOR || !ADMIN) throw new Error("Set GALA_TEST_DOOR and GALA_TEST_ADMIN (the passcodes you gave gala_checkin_set_passcode).");

const uuid = () => crypto.randomUUID();
const stats = { calls: 0, http: {}, retry: 0, slowest: 0 };

/** One PostgREST call. Returns the function's jsonb, or {ok:false, reason:"http-<status>"}. */
async function rpc(fn, args) {
  const started = Date.now();
  stats.calls++;
  let res;
  try {
    res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch (err) {
    return { ok: false, reason: "network", error: String(err) };
  }
  stats.slowest = Math.max(stats.slowest, Date.now() - started);
  stats.http[res.status] = (stats.http[res.status] || 0) + 1;
  if (!res.ok) return { ok: false, reason: `http-${res.status}`, error: await res.text() };
  const body = await res.json();
  if (body && body.reason === "retry") stats.retry++;
  return body;
}

/** A mutating call the way the real client makes it: same op_id until it lands. */
async function rpcRetry(fn, args, tries = 6) {
  let out;
  for (let i = 0; i < tries; i++) {
    out = await rpc(fn, args);
    const transient = !out || out.reason === "retry" || out.reason === "network" || /^http-5/.test(out.reason || "") || out.reason === "http-408";
    if (!transient) return out;
    await new Promise((r) => setTimeout(r, 150 * (i + 1)));
  }
  return out;
}

let passed = 0;
let failed = 0;
function check(cond, label, extra) {
  if (cond) {
    passed++;
    console.log(`  ok    ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}${extra !== undefined ? "  " + JSON.stringify(extra).slice(0, 400) : ""}`);
  }
}

/** Run thunks with at most `width` in flight, results in input order. */
async function pool(thunks, width = 64) {
  const out = new Array(thunks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, thunks.length) }, async () => {
      while (next < thunks.length) {
        const i = next++;
        out[i] = await thunks[i]();
      }
    }),
  );
  return out;
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = (list) => list[crypto.randomInt(list.length)];

/** The invariants that must hold for ANY interleaving. */
function invariants(state, label) {
  const assigned = state.paddles.filter((p) => p.status === "assigned");
  const numbers = new Set(assigned.map((p) => p.paddle_number));
  const groups = new Set(assigned.map((p) => p.paddle_group));
  check(numbers.size === assigned.length, `${label}: no paddle number appears twice`);
  check(groups.size === assigned.length, `${label}: no household holds two paddles`);
  check(state.paddles.every((p) => (p.status === "assigned") === (p.paddle_group !== null)), `${label}: only assigned paddles have a holder`);

  const byGroup = new Map(assigned.map((p) => [p.paddle_group, p.paddle_number]));
  const wrong = state.guests.filter((g) => (byGroup.get(g.paddle_group) ?? null) !== (g.paddle_number ?? null));
  check(wrong.length === 0, `${label}: every guest row shows its household's paddle`, wrong.slice(0, 3));

  const perGroup = new Map();
  for (const g of state.guests) {
    if (!perGroup.has(g.paddle_group)) perGroup.set(g.paddle_group, new Set());
    perGroup.get(g.paddle_group).add(g.paddle_number ?? null);
  }
  check([...perGroup.values()].every((s) => s.size === 1), `${label}: a household never shows two different numbers`);
}

// ---------------------------------------------------------------------------
// 2026 paddle policy (organizer, Sep 25): households SHARE a paddle, walk-ins
// take the next free one. These cases hammer exactly the races that policy
// brings back: two devices on the two halves of a couple, a split while the
// other half is being checked in, and undo racing everything.
// ---------------------------------------------------------------------------
async function householdCases(admin, devices) {
  const T = () => pick(devices);
  const load = () => rpc("gala_checkin_load", { p_event: EVENT, p_token: admin.token });
  const couples = (prefix, n) => Array.from({ length: n }, (_, p) => {
    const pid = `${prefix}${String(p + 1).padStart(2, "0")}`;
    return [1, 2].map((m) => ({ id: `${pid}-${m}`, name: `Test ${pid} partner ${m}`, party_id: `party:${pid}`, party_label: `Couple ${pid}`, table_number: (p % 13) + 1 }));
  });
  const K = couples("k", 30);   // both halves at once, no paddle yet
  const L = couples("l", 20);   // paddle_assign from two devices at once
  const N = couples("n", 10);   // partner check-in racing a walk-in that joins the couple
  const O = couples("o", 20);   // split racing a check-in
  const P = couples("p", 20);   // undo races
  const all = [K, L, N, O, P].flat(2);
  let r = await rpc("gala_checkin_import", { p_event: EVENT, p_token: admin.token, p_guests: all, p_max_group: 4 });
  check(r.ok && r.rows === all.length, `imported ${all.length} invented household guests (couples share a paddle group)`, r);
  let st = await load();
  const groupOf = new Map(st.guests.map((g) => [g.id, g.paddle_group]));
  check(K.every(([a, b]) => groupOf.get(a.id) === groupOf.get(b.id)), "each couple is ONE paddle group");

  // P and O start from the Thursday state: the household already holds a paddle.
  const pre = await pool([...O, ...P].map(([a]) => () => rpcRetry("gala_checkin_paddle_assign", { p_event: EVENT, p_token: admin.token, p_guest_id: a.id, p_op_id: uuid() })));
  check(pre.every((x) => x.ok && x.outcome === "assigned"), "pre-assigned 40 household paddles", pre.find((x) => !x.ok));

  // ---- K ---------------------------------------------------------------------
  console.log("\nK. 30 couples: both partners checked in at the same instant on two different devices");
  let res = await pool(shuffle(K.flatMap(([a, b]) => [
    () => rpcRetry("gala_checkin", { p_event: EVENT, p_token: devices[0], p_guest_ids: [a.id], p_op_id: uuid() }).then((x) => ({ c: a.party_id, id: a.id, x })),
    () => rpcRetry("gala_checkin", { p_event: EVENT, p_token: devices[1], p_guest_ids: [b.id], p_op_id: uuid() }).then((x) => ({ c: b.party_id, id: b.id, x })),
  ])), 60);
  check(res.every(({ x }) => x.ok && x.outcome === "checked_in"), "all 60 partners checked in, no errors", res.find(({ x }) => !x.ok));
  const perCouple = new Map();
  for (const { c, id, x } of res) {
    const own = x.guests?.find((g) => g.id === id)?.paddle_number;
    if (!perCouple.has(c)) perCouple.set(c, new Set());
    perCouple.get(c).add(own).add(x.paddle_number);
  }
  check([...perCouple.values()].every((s) => s.size === 1 && Number.isInteger([...s][0])), "each couple got exactly ONE number, and BOTH devices were told that number", [...perCouple.entries()].find(([, s]) => s.size !== 1));
  check(new Set([...perCouple.values()].map((s) => [...s][0])).size === 30, "30 couples, 30 different numbers");

  // ---- L ---------------------------------------------------------------------
  console.log("\nL. 20 households: two devices ask for the household's paddle at the same instant (no check-in)");
  res = await pool(shuffle(L.flatMap(([a, b]) => [
    () => rpcRetry("gala_checkin_paddle_assign", { p_event: EVENT, p_token: devices[2], p_guest_id: a.id, p_op_id: uuid() }).then((x) => ({ c: a.party_id, x })),
    () => rpcRetry("gala_checkin_paddle_assign", { p_event: EVENT, p_token: devices[3], p_guest_id: b.id, p_op_id: uuid() }).then((x) => ({ c: b.party_id, x })),
  ])), 40);
  check(res.every(({ x }) => x.ok), "all 40 calls ok", res.find(({ x }) => !x.ok));
  const perL = new Map();
  for (const { c, x } of res) {
    if (!perL.has(c)) perL.set(c, { nums: new Set(), outcomes: [] });
    perL.get(c).nums.add(x.paddle_number);
    perL.get(c).outcomes.push(x.outcome);
  }
  check([...perL.values()].every((v) => v.nums.size === 1 && Number.isInteger([...v.nums][0])), "exactly one number per household, both devices see it");
  check([...perL.values()].every((v) => v.outcomes.sort().join() === "already,assigned"), 'one device "assigned", the other "already" (never a second paddle)');

  // ---- M ---------------------------------------------------------------------
  console.log("\nM. 40 walk-ins at the same instant, each double-tapped (same op id twice)");
  st = await load();
  const freeBefore = st.paddles.filter((p) => p.status === "free").map((p) => p.paddle_number).sort((a, b) => a - b);
  const ops = Array.from({ length: 40 }, (_, i) => ({ op: uuid(), name: `Test door walk-in ${i + 1}` }));
  res = await pool(shuffle(ops.flatMap((o) => [0, 1].map((k) => () =>
    rpcRetry("gala_checkin_walkin", { p_event: EVENT, p_token: devices[k], p_op_id: o.op, p_guest: { name: o.name }, p_opts: { assign_paddle: true } }).then((x) => ({ o, x }))))), 80);
  check(res.every(({ x }) => x.ok), "all 80 submissions ok", res.find(({ x }) => !x.ok));
  const byOp = new Map();
  for (const { o, x } of res) {
    if (!byOp.has(o.op)) byOp.set(o.op, new Set());
    byOp.get(o.op).add(x.paddle_number);
  }
  check([...byOp.values()].every((s) => s.size === 1 && Number.isInteger([...s][0])), "both taps of a walk-in report the same server-issued number");
  const walkNums = [...byOp.values()].map((s) => [...s][0]).sort((a, b) => a - b);
  check(new Set(walkNums).size === 40, "40 walk-ins, 40 DISTINCT paddles");
  check(JSON.stringify(walkNums) === JSON.stringify(freeBefore.slice(0, 40)), "and they are exactly the 40 lowest free numbers (next free, no held reserve touched)", [walkNums.slice(0, 5), freeBefore.slice(0, 5)]);
  st = await load();
  check(st.guests.filter((g) => g.name.startsWith("Test door walk-in")).length === 40, "40 guest rows, not 80");
  check(res.filter(({ x }) => x.replayed).length === 40, "40 of the 80 taps were answered as replays");

  // ---- N ---------------------------------------------------------------------
  console.log("\nN. 10 couples: one device checks in a partner while another adds a walk-in to the SAME household");
  res = await pool(shuffle(N.flatMap(([a]) => [
    () => rpcRetry("gala_checkin", { p_event: EVENT, p_token: devices[4], p_guest_ids: [a.id], p_op_id: uuid() }).then((x) => ({ c: a.party_id, x })),
    () => rpcRetry("gala_checkin_walkin", { p_event: EVENT, p_token: devices[5], p_op_id: uuid(), p_guest: { name: `Test ${a.party_id} plus one`, join_guest_id: a.id } }).then((x) => ({ c: a.party_id, x })),
  ])), 20);
  check(res.every(({ x }) => x.ok), "all 20 ok", res.find(({ x }) => !x.ok));
  const perN = new Map();
  for (const { c, x } of res) {
    if (!perN.has(c)) perN.set(c, new Set());
    perN.get(c).add(x.paddle_number);
  }
  check([...perN.values()].every((s) => s.size === 1 && Number.isInteger([...s][0])), "the walk-in joined the household's ONE paddle in every race");

  // ---- O ---------------------------------------------------------------------
  console.log("\nO. 20 couples holding a paddle: device A splits partner 2 out while device B checks partner 2 in");
  st = await load();
  const before = new Map(st.guests.map((g) => [g.id, g.paddle_number]));
  res = await pool(shuffle(O.flatMap(([a, b]) => [
    async () => {
      const s = await rpcRetry("gala_checkin_group_set", { p_event: EVENT, p_token: devices[6], p_guest_ids: [b.id], p_op_id: uuid() });
      const g = s.ok ? await rpcRetry("gala_checkin_paddle_assign", { p_event: EVENT, p_token: devices[6], p_guest_id: b.id, p_op_id: uuid() }) : s;
      return { a, b, s, g, kind: "split" };
    },
    async () => ({ a, b, x: await rpcRetry("gala_checkin", { p_event: EVENT, p_token: devices[7], p_guest_ids: [b.id], p_op_id: uuid() }), kind: "checkin" }),
  ])), 40);
  check(res.every((z) => (z.kind === "split" ? z.s.ok && z.g.ok : z.x.ok)), "every split and every check-in answered ok", res.find((z) => (z.kind === "split" ? !(z.s.ok && z.g.ok) : !z.x.ok)));
  st = await load();
  const rowO = new Map(st.guests.map((g) => [g.id, g]));
  check(O.every(([a]) => rowO.get(a.id).paddle_number === before.get(a.id)), "partner 1 kept the household paddle in all 20 races");
  check(O.every(([a, b]) => Number.isInteger(rowO.get(b.id).paddle_number) && rowO.get(b.id).paddle_number !== rowO.get(a.id).paddle_number), "partner 2 ended with their OWN, single, different paddle");
  check(O.every(([, b]) => rowO.get(b.id).checked_in_at), "and partner 2 is checked in whichever call landed first");
  invariants(st, "after split races");

  // ---- P ---------------------------------------------------------------------
  console.log("\nP. undo races on 20 couples holding a paddle");
  const onP = await pool(P.map(([a]) => () => rpcRetry("gala_checkin", { p_event: EVENT, p_token: T(), p_guest_ids: [a.id], p_op_id: uuid() })));
  check(onP.every((x) => x.ok), "partner 1 of each couple checked in");
  st = await load();
  const padP = new Map(st.guests.map((g) => [g.id, g.paddle_number]));
  // P1: two devices undo the same guest at once
  res = await pool(P.flatMap(([a]) => [0, 1].map((k) => () => rpcRetry("gala_checkin_undo", { p_event: EVENT, p_token: devices[k], p_guest_id: a.id, p_op_id: uuid() }).then((x) => ({ c: a.party_id, x })))), 40);
  const perP1 = new Map();
  for (const { c, x } of res) perP1.set(c, [...(perP1.get(c) || []), x.ok ? x.outcome : x.reason]);
  check([...perP1.values()].every((v) => v.sort().join() === "not-checked-in,undone"), 'double undo: exactly one "undone", the other a quiet "not-checked-in"', [...perP1.values()][0]);
  // P2: undo racing a re-check-in of the same guest, then partner 2 racing both
  res = await pool(shuffle(P.flatMap(([a, b]) => [
    () => rpcRetry("gala_checkin", { p_event: EVENT, p_token: devices[2], p_guest_ids: [a.id], p_op_id: uuid() }),
    () => rpcRetry("gala_checkin_undo", { p_event: EVENT, p_token: devices[3], p_guest_id: a.id, p_op_id: uuid() }),
    () => rpcRetry("gala_checkin", { p_event: EVENT, p_token: devices[4], p_guest_ids: [b.id], p_op_id: uuid() }),
  ])), 60);
  check(res.every((x) => x.ok), "60 racing check-ins and undos, no errors", res.find((x) => !x.ok));
  st = await load();
  const rowP = new Map(st.guests.map((g) => [g.id, g]));
  check(P.every(([a, b]) => rowP.get(a.id).paddle_number === padP.get(a.id) && rowP.get(b.id).paddle_number === padP.get(a.id)), "undo NEVER released the paddle: both partners still show the household's original number");
  check(P.every(([, b]) => rowP.get(b.id).checked_in_at), "partner 2 checked in fine while partner 1 was being undone");
  // P3: undo then check in again gets the same number back
  res = await pool(P.map(([a]) => async () => {
    await rpcRetry("gala_checkin_undo", { p_event: EVENT, p_token: devices[5], p_guest_id: a.id, p_op_id: uuid() });
    return rpcRetry("gala_checkin", { p_event: EVENT, p_token: devices[6], p_guest_ids: [a.id], p_op_id: uuid() }).then((x) => ({ a, x }));
  }));
  check(res.every(({ a, x }) => x.ok && x.outcome === "checked_in" && x.paddle_number === padP.get(a.id)), "undo then check in again: the SAME paddle comes back", res.find(({ a, x }) => !(x.ok && x.paddle_number === padP.get(a.id))));
  // P4: an undo replay (same op id, double tap) is one undo
  const [pa] = P[0];
  const opU = uuid();
  res = await pool([0, 1, 2].map(() => () => rpcRetry("gala_checkin_undo", { p_event: EVENT, p_token: devices[7], p_guest_id: pa.id, p_op_id: opU })));
  check(res.filter((x) => x.ok && !x.replayed && x.outcome === "undone").length === 1 && res.filter((x) => x.replayed).length === 2, "one undo op id sent 3 times = one undo, two replays");
  st = await load();
  const undoLog = await rpc("gala_checkin_since", { p_event: EVENT, p_token: admin.token, p_version: 0, p_log_id: 0 });
  check(undoLog.ok && undoLog.log.filter((l) => l.kind === "undo" && l.guest_ids?.[0] === pa.id).length >= 1, "the undo is in the audit log");

  invariants(st, "after household cases");
}

async function main() {
  console.log(`Event ${EVENT} at ${URL_BASE}\n`);

  // ---- sessions -------------------------------------------------------------
  const admin = await rpc("gala_checkin_unlock", { p_event: EVENT, p_pass: ADMIN, p_name: "Test Admin", p_device: "node" });
  check(admin.ok && admin.role === "admin", "admin passcode unlocks an admin session", admin);
  if (!admin.ok) return;

  const devices = [];
  for (let i = 0; i < DEVICES; i++) {
    const s = await rpc("gala_checkin_unlock", { p_event: EVENT, p_pass: DOOR, p_name: `Volunteer ${i + 1}`, p_device: `node-${i + 1}` });
    check(s.ok && s.role === "door", `door session ${i + 1}`, s);
    devices.push(s.token);
  }
  const T = () => pick(devices);

  // ---- security -------------------------------------------------------------
  console.log("\nSecurity");
  for (const table of ["gala_event_guests", "gala_event_paddles", "gala_event_log", "gala_event_sessions", "gala_event_access", "gala_event_donations"]) {
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*&limit=1`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    const rows = res.ok ? await res.json() : null;
    check(!res.ok || (Array.isArray(rows) && rows.length === 0), `anon cannot read ${table} (HTTP ${res.status})`);
  }
  let r = await rpc("gala_checkin_load", { p_event: EVENT, p_token: "0".repeat(64) });
  check(!r.ok && r.reason === "bad-session", "a made-up token is refused", r);
  r = await rpc("gala_checkin_bump", { p_event: EVENT });
  check(!r.ok, "internal helpers are not callable", r);
  r = await rpc("gala_checkin_set_passcode", { p_event: EVENT, p_door_pass: "hijacked-1" });
  check(!r.ok, "the passcode setter is not callable", r);
  r = await rpc("gala_checkin_pool_init", { p_event: EVENT, p_token: devices[0], p_lo: 1, p_hi: 5 });
  check(!r.ok && r.reason === "forbidden", "a door session cannot manage the pool", r);

  // ---- seed -----------------------------------------------------------------
  console.log("\nSeed");
  const guests = [];
  const solo = (prefix, n) => Array.from({ length: n }, (_, i) => {
    const id = `${prefix}${String(i + 1).padStart(3, "0")}`;
    return { id, name: `Test ${id}`, party_id: `solo:${id}`, party_label: `Test ${id}`, table_number: (i % 13) + 1 };
  });
  const parties = (prefix, n, size) => Array.from({ length: n }, (_, p) =>
    Array.from({ length: size }, (_, m) => {
      const pid = `${prefix}${String(p + 1).padStart(2, "0")}`;
      return { id: `${pid}-${m + 1}`, name: `Test ${pid} member ${m + 1}`, party_id: `party:${pid}`, party_label: `Household ${pid}`, table_number: (p % 13) + 1 };
    })).flat();

  const A = solo("a", 60);          // A: 60 different households, all at once
  const B = parties("b", 20, 4);    // B: 20 households of 4, every member at once
  const C = solo("c", 1);           // C: one guest, eight devices
  const D = solo("d", 1);           // D: one op id, replayed
  const Eg = solo("e", 10);         // E: ten households want the same physical paddle
  const G = parties("g", 30, 3);    // G: chaos
  guests.push(...A, ...B, ...C, ...D, ...Eg, ...G);

  r = await rpc("gala_checkin_import", { p_event: EVENT, p_token: admin.token, p_guests: guests, p_max_group: 4 });
  check(r.ok && r.rows === guests.length, `imported ${guests.length} invented guests`, r);
  r = await rpc("gala_checkin_pool_init", { p_event: EVENT, p_token: admin.token, p_lo: 1, p_hi: 600, p_held: [591, 592, 593, 594, 595, 596, 597, 598, 599, 600] });
  check(r.ok, "paddle pool 1..600 with 591..600 held as the offline reserve", r);

  // ---- A: distinct households, next free -------------------------------------
  console.log("\nA. 60 households ask for the next free paddle at the same instant");
  let res = await pool(A.map((g) => () => rpcRetry("gala_checkin", { p_event: EVENT, p_token: T(), p_guest_ids: [g.id], p_op_id: uuid() })));
  check(res.every((x) => x.ok && x.outcome === "checked_in"), "all 60 checked in", res.find((x) => !x.ok));
  let nums = res.map((x, i) => x.guests?.find((g) => g.id === A[i].id)?.paddle_number);
  check(new Set(nums).size === 60 && nums.every(Number.isInteger), "60 DISTINCT paddle numbers", nums.slice(0, 10));
  check(Math.max(...nums) - Math.min(...nums) === 59, "and they are contiguous (no gaps burned)", [Math.min(...nums), Math.max(...nums)]);

  // ---- B: the 2025 bug -------------------------------------------------------
  console.log("\nB. 20 households of 4: every member checked in at once, on different devices");
  res = await pool(shuffle(B).map((g) => () => rpcRetry("gala_checkin", { p_event: EVENT, p_token: T(), p_guest_ids: [g.id], p_op_id: uuid() }).then((x) => ({ g, x }))));
  check(res.every(({ x }) => x.ok), "all 80 calls succeeded", res.find(({ x }) => !x.ok));
  const seen = new Map();
  for (const { g, x } of res) {
    const n = x.guests?.find((row) => row.id === g.id)?.paddle_number;
    if (!seen.has(g.party_id)) seen.set(g.party_id, new Set());
    seen.get(g.party_id).add(n);
  }
  check([...seen.values()].every((s) => s.size === 1 && Number.isInteger([...s][0])), "every household ended with exactly ONE paddle", [...seen.entries()].find(([, s]) => s.size !== 1));
  check(new Set([...seen.values()].map((s) => [...s][0])).size === 20, "20 households, 20 different numbers");

  // ---- C: same guest, many devices -------------------------------------------
  console.log(`\nC. one guest, ${DEVICES} devices, ${DEVICES} different op ids`);
  res = await pool(devices.map((t) => () => rpcRetry("gala_checkin", { p_event: EVENT, p_token: t, p_guest_ids: [C[0].id], p_op_id: uuid() })));
  check(res.every((x) => x.ok), "nobody got an error", res.find((x) => !x.ok));
  check(res.filter((x) => x.outcome === "checked_in").length === 1, "exactly one device performed the check-in");
  check(res.filter((x) => x.outcome === "already").length === DEVICES - 1, 'the rest got the friendly "already" state');
  const who = new Set(res.map((x) => x.guests[0].checked_in_by));
  const pads = new Set(res.map((x) => x.guests[0].paddle_number));
  check(who.size === 1 && pads.size === 1, "everyone was told the same volunteer and the same paddle", [[...who], [...pads]]);

  // ---- D: replays ------------------------------------------------------------
  console.log("\nD. one op id sent 6 times at once, then 3 more times later");
  const opD = uuid();
  res = await pool(Array.from({ length: 6 }, () => () => rpcRetry("gala_checkin", { p_event: EVENT, p_token: devices[0], p_guest_ids: [D[0].id], p_op_id: opD })));
  for (let i = 0; i < 3; i++) res.push(await rpcRetry("gala_checkin", { p_event: EVENT, p_token: devices[0], p_guest_ids: [D[0].id], p_op_id: opD }));
  check(res.every((x) => x.ok), "all nine answered ok");
  check(res.filter((x) => x.replayed === false).length === 1, "exactly one was the original");
  check(new Set(res.map((x) => x.guests.find((g) => g.id === D[0].id).paddle_number)).size === 1, "all nine carry the same paddle");
  check(new Set(res.map((x) => x.guests.find((g) => g.id === D[0].id).checked_in_at)).size === 1, "and the same check-in time");

  // ---- E: the paddle on top of the pile ---------------------------------------
  console.log("\nE. ten households all handed physical paddle #300 at once");
  res = await pool(Eg.map((g) => () => rpcRetry("gala_checkin", { p_event: EVENT, p_token: T(), p_guest_ids: [g.id], p_op_id: uuid(), p_opts: { paddle: 300 } })));
  check(res.filter((x) => x.ok).length === 1, "exactly one got #300");
  const losers = res.filter((x) => !x.ok);
  check(losers.length === 9 && losers.every((x) => x.reason === "paddle-taken" && Number.isInteger(x.next_free)), 'nine got a clean "paddle-taken" with a suggestion', losers[0]);
  let st = await rpc("gala_checkin_load", { p_event: EVENT, p_token: admin.token });
  check(st.guests.filter((g) => g.id.startsWith("e") && g.checked_in_at).length === 1, "and the nine were NOT checked in by the failed call");
  res = await pool(Eg.map((g) => () => rpcRetry("gala_checkin", { p_event: EVENT, p_token: T(), p_guest_ids: [g.id], p_op_id: uuid() })));
  check(res.every((x) => x.ok), "retrying with the next free paddle works for all ten");

  // ---- F: walk-in replays ------------------------------------------------------
  console.log("\nF. one walk-in submitted 5 times (double taps + retries)");
  const opF = uuid();
  res = await pool(Array.from({ length: 5 }, () => () => rpcRetry("gala_checkin_walkin", { p_event: EVENT, p_token: devices[1], p_op_id: opF, p_guest: { name: "Test Walk In" } })));
  check(res.every((x) => x.ok), "all five ok", res.find((x) => !x.ok));
  st = await rpc("gala_checkin_load", { p_event: EVENT, p_token: admin.token });
  check(st.guests.filter((g) => g.name === "Test Walk In").length === 1, "one guest row, not five");
  invariants(st, "after A-F");

  // ---- G + H: chaos, with a follower that only ever calls since() --------------
  console.log(`\nG. ${CHAOS_OPS} random operations, 24 in flight, while a follower tails since()`);
  const follower = { version: st.version, logId: st.log_id, guests: new Map(st.guests.map((g) => [g.id, g])), paddles: new Map(st.paddles.map((p) => [p.paddle_number, p])) };
  let chasing = true;
  const tail = (async () => {
    while (chasing) {
      const d = await rpc("gala_checkin_since", { p_event: EVENT, p_token: devices[2], p_version: follower.version, p_log_id: follower.logId });
      if (d.ok) {
        for (const g of d.guests) follower.guests.set(g.id, g);
        for (const p of d.paddles) follower.paddles.set(p.paddle_number, p);
        follower.version = d.version;
        follower.logId = d.log_id;
      }
      await new Promise((r2) => setTimeout(r2, 120));
    }
  })();

  // "mixed-groups" belongs here too: rolls 0, 7 and 14 send a whole party WITH a typed
  // paddle number, and once an earlier chaos op has split that party across two
  // paddle_groups the server correctly refuses (design doc section 8, refusal table).
  // Without it this assertion fails intermittently on correct server behaviour.
  const EXPECTED_REFUSALS = new Set(["paddle-taken", "paddle-void", "group-has-paddle", "group-checked-in", "would-orphan-paddle", "no-paddle", "same-paddle", "pool-empty", "paddle-has-donations", "mixed-groups"]);
  const ids = G.map((g) => g.id);
  const unexpected = [];
  const thunks = Array.from({ length: CHAOS_OPS }, () => async () => {
    const roll = crypto.randomInt(100);
    const id = pick(ids);
    const base = { p_event: EVENT, p_token: T(), p_op_id: uuid() };
    let out;
    if (roll < 45) {
      const mates = G.filter((g) => g.party_id === G.find((x) => x.id === id).party_id).map((g) => g.id);
      out = await rpcRetry("gala_checkin", { ...base, p_guest_ids: roll < 15 ? mates : [id], p_opts: roll % 7 === 0 ? { paddle: 200 + crypto.randomInt(40) } : {} });
    } else if (roll < 65) out = await rpcRetry("gala_checkin_undo", { ...base, p_guest_id: id, p_reason: "chaos" });
    else if (roll < 75) out = await rpcRetry("gala_checkin_paddle_swap", { ...base, p_guest_id: id });
    else if (roll < 82) out = await rpcRetry("gala_checkin_paddle_release", { ...base, p_paddle_number: 100 + crypto.randomInt(160) });
    else if (roll < 88) out = await rpcRetry("gala_checkin_group_set", { ...base, p_guest_ids: [id] });
    else if (roll < 94) out = await rpcRetry("gala_checkin_paddle_assign", { ...base, p_guest_id: id });
    else out = await rpcRetry("gala_checkin_walkin", { ...base, p_guest: { name: `Test chaos walk-in ${roll}` } });
    if (!out.ok && !EXPECTED_REFUSALS.has(out.reason)) unexpected.push(out);
    return out;
  });
  await pool(thunks, 24);
  check(unexpected.length === 0, "every refusal was one of the designed, friendly ones", unexpected.slice(0, 3));

  st = await rpc("gala_checkin_load", { p_event: EVENT, p_token: admin.token });
  invariants(st, "after chaos");

  console.log("\nH. the since() follower converged on exactly what load() returns");
  await new Promise((r2) => setTimeout(r2, 600));
  chasing = false;
  await tail;
  const last = await rpc("gala_checkin_since", { p_event: EVENT, p_token: devices[2], p_version: follower.version, p_log_id: follower.logId });
  for (const g of last.guests || []) follower.guests.set(g.id, g);
  for (const p of last.paddles || []) follower.paddles.set(p.paddle_number, p);
  const norm = (rows, key) => JSON.stringify(rows.slice().sort((a, b) => (a[key] > b[key] ? 1 : -1)));
  check(norm([...follower.guests.values()], "id") === norm(st.guests, "id"), "guest rows identical");
  check(norm([...follower.paddles.values()], "paddle_number") === norm(st.paddles, "paddle_number"), "paddle rows identical");

  const s2 = await rpc("gala_checkin_stats", { p_event: EVENT, p_token: admin.token });
  check(s2.ok && s2.stats.totals.checked_in === st.guests.filter((g) => g.checked_in_at && !g.removed_at).length, "stats agree with the rows");

  await householdCases(admin, devices);

  console.log(`\n${stats.calls} calls, slowest ${stats.slowest} ms, HTTP ${JSON.stringify(stats.http)}, "retry" answers: ${stats.retry} (expected 0)`);
  check(stats.retry === 0, 'the unique-constraint backstop never had to fire ("retry" = 0)');
}

await main();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
