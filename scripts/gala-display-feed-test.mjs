#!/usr/bin/env node
// Gala live-display feed test. Fires real, parallel HTTP requests at PostgREST
// against a THROWAWAY event and asserts the three properties the projector
// depends on: every gift reaches every display exactly once, the feed and the
// public aggregate never disagree about the money, and two clerks keying the
// same paddle at the same level produce one gift, not two.
//
// Companion to scripts/gala-checkin-concurrency-test.mjs, which covers paddles.
//
//   1. Owner, once (Supabase SQL editor or the Management API; values are yours,
//      never committed):
//        select public.gala_checkin_set_passcode('test-display-0921', '<door pass>', '<admin pass>');
//   2. Run:
//        GALA_TEST_EVENT=test-display-0921 GALA_TEST_DOOR='<door pass>' GALA_TEST_ADMIN='<admin pass>' \
//          node scripts/gala-display-feed-test.mjs
//      URL and key come from PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_PUBLISHABLE_KEY
//      (environment first, then the repo's .env).
//   3. Owner, afterwards:
//        select public.gala_checkin_archive_and_purge('test-display-0921', 'PURGE test-display-0921');
//        delete from public.gala_event_archive where event_slug = 'test-display-0921';
//      The display row and its throttle go with the event: the access-row cascade
//      trigger takes them.
//
// The script refuses any event slug that does not start with "test-". Every
// donor name in here is invented. Exit code 0 = every assertion held.

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
const CLERKS = Number(process.env.GALA_TEST_CLERKS || 3);
const ROUNDS = Number(process.env.GALA_TEST_ROUNDS || 6);
const PADDLES = Number(process.env.GALA_TEST_PADDLES || 24);
const DELAY_MS = Number(process.env.GALA_TEST_DELAY_MS || 2000);

if (!URL_BASE || !KEY) throw new Error("Set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
if (!EVENT.startsWith("test-")) throw new Error('GALA_TEST_EVENT must start with "test-". This script never touches a real event.');
if (!DOOR || !ADMIN) throw new Error("Set GALA_TEST_DOOR and GALA_TEST_ADMIN (the passcodes you gave gala_checkin_set_passcode).");

const uuid = () => crypto.randomUUID();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
    const transient = !out || out.reason === "retry" || out.reason === "network"
      || /^http-5/.test(out.reason || "") || out.reason === "http-408";
    if (!transient) return out;
    await sleep(150 * (i + 1));
  }
  return out;
}

let passed = 0;
let failed = 0;
function check(cond, label, extra) {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.error(`  FAIL ${label}${extra === undefined ? "" : "  " + JSON.stringify(extra)}`); }
}
/** Print what the server actually said, not just the status code. */
const why = (res) => (res && (res.error || res.reason)) || res;

// ---------------------------------------------------------------------------
console.log(`\nGala display feed test  event=${EVENT}  clerks=${CLERKS}  rounds=${ROUNDS}  paddles=${PADDLES}\n`);

// --- sessions -------------------------------------------------------------
const admin = await rpc("gala_checkin_unlock", { p_event: EVENT, p_pass: ADMIN, p_name: "Lead", p_device: "lead-laptop" });
if (!admin.ok) throw new Error("admin unlock failed: " + JSON.stringify(admin));
const clerks = [];
for (let i = 0; i < CLERKS; i++) {
  const c = await rpc("gala_checkin_unlock", {
    p_event: EVENT, p_pass: DOOR, p_name: `Clerk${String.fromCharCode(65 + i)}`, p_device: `terminal-${i + 1}`,
  });
  if (!c.ok) throw new Error("clerk unlock failed: " + JSON.stringify(c));
  clerks.push(c);
}
check(clerks.length === CLERKS && admin.role === "admin", "sessions minted");

// --- seed the room --------------------------------------------------------
await rpc("gala_checkin_pool_init", { p_event: EVENT, p_token: admin.token, p_lo: 1, p_hi: PADDLES + 10 });
const guests = Array.from({ length: PADDLES }, (_, i) => ({
  id: `t${i + 1}`,
  name: `Invitada Prueba ${i + 1}`,
  party_id: `party${i + 1}@example.test`,
  party_label: `Mesa Prueba ${i + 1}`,
  table_number: 1 + (i % 6),
}));
let r = await rpc("gala_checkin_import", { p_event: EVENT, p_token: admin.token, p_guests: guests });
check(r.ok && r.rows === PADDLES, "guests imported", r);
for (let i = 0; i < PADDLES; i++) {
  await rpcRetry("gala_checkin", {
    p_event: EVENT, p_token: admin.token, p_guest_ids: [`t${i + 1}`], p_op_id: uuid(), p_opts: { paddle: i + 1 },
  });
}

r = await rpc("gala_display_set", {
  p_event: EVENT, p_token: admin.token, p_op_id: uuid(),
  p_patch: {
    scene: "appeal", goal_cents: 7500000, publish_delay_ms: DELAY_MS,
    current_level_cents: 50000, show_names: true,
    levels: [{ amount_cents: 50000, impact_line: "Una temporada de clases" }],
  },
});
check(r.ok && r.state.goal_cents === 7500000 && r.state.publish_delay_ms === DELAY_MS, "display configured", why(r));

const keyRes = await rpc("gala_display_rotate_key", { p_event: EVENT, p_token: admin.token });
check(keyRes.ok && typeof keyRes.display_key === "string" && keyRes.display_key.length === 32,
  "display key minted over the wire", why(keyRes));
const DISPLAY_KEY = keyRes.display_key;

// --- anon can read nothing it should not ----------------------------------
for (const t of ["gala_event_display", "gala_event_donations", "gala_event_guests"]) {
  const res = await fetch(`${URL_BASE}/rest/v1/${t}?select=*&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  check(res.status === 401 || res.status === 403 || res.status === 404, `anon denied direct table read: ${t}`, res.status);
}
r = await rpc("gala_display_feed", { p_event: EVENT, p_display_key: "not-the-key-at-all", p_cursor: 0 });
check(r.ok && r.named === false && r.gifts.length === 0, "wrong display key yields no names", r);
r = await rpc("gala_display_public", { p_event: EVENT });
check(r.ok && r.live === true && !JSON.stringify(r).includes("Invitada") && !JSON.stringify(r).includes("example.test"),
  "public aggregate carries no names and no party ids");

// --- two displays, polling independently ----------------------------------
// Each keeps its own cursor and its own seen-set, exactly like the real page.
function makeDisplay(name) {
  return { name, cursor: 0, seen: new Map(), dupes: [], retractions: new Set(), polls: 0 };
}
async function poll(d) {
  const f = await rpc("gala_display_feed", { p_event: EVENT, p_display_key: DISPLAY_KEY, p_cursor: d.cursor });
  d.polls++;
  if (!f.ok || f.named !== true) { d.error = f; return f; }
  for (const g of f.gifts) {
    // A correction re-sends the same seq on purpose; a DUPLICATE is the same seq
    // with the same chg, which must never happen.
    const prev = d.seen.get(g.seq);
    if (prev && prev.chg === g.chg) d.dupes.push(g.seq);
    d.seen.set(g.seq, g);
  }
  for (const s of f.retractions) d.retractions.add(s);
  d.cursor = f.cursor;
  d.state = f;
  return f;
}
const displays = [makeDisplay("projector"), makeDisplay("stage-monitor")];
let polling = true;
const pollLoop = (async () => {
  while (polling) {
    await Promise.all(displays.map(poll));
    await sleep(350);
  }
  // Drain past the publish delay so nothing is left in flight.
  for (let i = 0; i < 12; i++) { await Promise.all(displays.map(poll)); await sleep(300); }
})();

// --- three clerks hammer --------------------------------------------------
const LEVELS = [50000, 100000, 250000, 500000];
const expected = new Map();   // op_id -> amount_cents actually accepted
let converged = 0;
const t0 = Date.now();

for (let round = 0; round < ROUNDS; round++) {
  const level = LEVELS[round % LEVELS.length];
  const roundKey = `raise-r${round}-${level}`;
  const batch = [];
  for (let p = 1; p <= PADDLES; p++) {
    // Every third paddle is called to TWO clerks at once: the duplicate that
    // doubled the 2025 thermometer. Exactly one row must survive.
    const owners = p % 3 === 0 ? [p % CLERKS, (p + 1) % CLERKS] : [p % CLERKS];
    for (const c of owners) {
      batch.push({ clerk: c, paddle: p, level, roundKey, op: uuid() });
    }
  }
  const results = await Promise.all(batch.map((b) =>
    rpcRetry("gala_donation_add", {
      p_event: EVENT, p_token: clerks[b.clerk].token, p_op_id: b.op,
      p_amount: b.level / 100, p_paddle_number: b.paddle, p_round_key: b.roundKey,
    })));
  results.forEach((res, i) => {
    if (!res.ok) { check(false, `gift ${batch[i].paddle}@${batch[i].level} accepted`, res); return; }
    if (res.outcome === "already-recorded") converged++;
    else expected.set(batch[i].op, batch[i].level);
  });
}
const hammerMs = Date.now() - t0;
check(true, `hammer done: ${expected.size} gifts, ${converged} converged on another clerk, ${hammerMs} ms`);

// A retry with the SAME op_id must not make a second gift.
const replayOp = uuid();
const first = await rpc("gala_donation_add", {
  p_event: EVENT, p_token: clerks[0].token, p_op_id: replayOp, p_amount: 42, p_paddle_number: 1,
});
const again = await rpc("gala_donation_add", {
  p_event: EVENT, p_token: clerks[0].token, p_op_id: replayOp, p_amount: 42, p_paddle_number: 1,
});
check(first.ok && again.ok && again.replayed === true && again.donation_id === first.donation_id,
  "op_id replay makes no twin", { first: first.donation_id, again: again.donation_id });
if (first.ok) expected.set(replayOp, 4200);

// Non-paddle gifts, the kinds gala_donation_add cannot express.
for (const [kind, amount, donor] of [
  ["sponsor", 150000, "Panaderia Rio Verde"],
  ["online", 7500, "Donante en Linea"],
  ["seed", 1000000, "Regalo Semilla"],
]) {
  const res = await rpcRetry("gala_donation_record", {
    p_event: EVENT, p_token: clerks[1].token, p_op_id: uuid(),
    p_amount: amount / 100, p_kind: kind, p_donor_name: donor,
  });
  check(res.ok && res.outcome === "recorded", `non-paddle ${kind} gift recorded`, why(res));
  if (res.ok) expected.set(res.donation_id, amount);
}

// An anonymous gift must never carry its household's name.
const anonRes = await rpcRetry("gala_donation_record", {
  p_event: EVENT, p_token: clerks[0].token, p_op_id: uuid(),
  p_amount: 300, p_paddle_number: 2, p_anonymous: true,
});
check(anonRes.ok, "anonymous gift recorded", why(anonRes));
const anonSeq = anonRes.seq;

// --- edit, retract, void --------------------------------------------------
// Regression: an edit that never mentions the paddle. PL/pgSQL evaluates every
// parameter of the UPDATE, so a conditionally assigned record raised 55000 here.
let list = await rpc("gala_donation_list", { p_event: EVENT, p_token: clerks[2].token, p_since: 0 });
check(list.ok && list.donations.length > 0, "clerk tape readable by a second terminal", why(list));
check(list.donations.some((d) => d.entered_by === "ClerkA") && list.donations.some((d) => d.entered_by === "ClerkB"),
  "the tape shows who keyed each row");

const editRow = list.donations.find((d) => d.live && d.paddle_number === 5 && d.round_key);
const retractRow = list.donations.find((d) => d.live && d.paddle_number === 6 && d.round_key);
const voidRow = list.donations.find((d) => d.live && d.paddle_number === 7 && d.round_key);

let editedDelta = 0, retractedCents = 0, voidedCents = 0;
if (editRow) {
  const res = await rpcRetry("gala_donation_update", {
    p_event: EVENT, p_token: clerks[0].token, p_op_id: uuid(),
    p_donation_id: editRow.id, p_patch: { amount: 1234.56 },
  });
  check(res.ok && res.donation.amount_cents === 123456 && res.donation.seq === editRow.seq,
    "edit keeps seq and changes the amount", why(res));
  if (res.ok) editedDelta = 123456 - editRow.amount_cents;
}
if (retractRow) {
  const res = await rpcRetry("gala_donation_retract", {
    p_event: EVENT, p_token: clerks[1].token, p_op_id: uuid(),
    p_donation_id: retractRow.id, p_reason: "donor asked",
  });
  check(res.ok && res.donation.retracted_at && !res.donation.voided_at,
    "retract hides the gift and keeps the money", why(res));
  if (res.ok) retractedCents = retractRow.amount_cents;
}
if (voidRow) {
  const bad = await rpc("gala_donation_void", {
    p_event: EVENT, p_token: clerks[1].token, p_op_id: uuid(), p_donation_id: voidRow.id, p_reason: "",
  });
  check(!bad.ok && bad.reason === "missing-reason", "void demands a reason", bad);
  const res = await rpcRetry("gala_donation_void", {
    p_event: EVENT, p_token: clerks[1].token, p_op_id: uuid(),
    p_donation_id: voidRow.id, p_reason: "keyed twice on paper",
  });
  check(res.ok && res.donation.voided_at, "void is soft and reasoned", why(res));
  if (res.ok) voidedCents = voidRow.amount_cents;
}

// --- let the displays catch up -------------------------------------------
polling = false;
await pollLoop;

// --- the assertions that matter ------------------------------------------
const pub = await rpc("gala_display_public", { p_event: EVENT });
list = await rpc("gala_donation_list", { p_event: EVENT, p_token: admin.token, p_since: 0 });

for (const d of displays) {
  check(!d.error, `${d.name}: every poll succeeded`, d.error);
  check(d.dupes.length === 0, `${d.name}: no gift delivered twice`, d.dupes.slice(0, 5));
}
const [a, b] = displays;
const aSeqs = [...a.seen.keys()].sort((x, y) => x - y);
const bSeqs = [...b.seen.keys()].sort((x, y) => x - y);
check(JSON.stringify(aSeqs) === JSON.stringify(bSeqs),
  "both displays converged on the same set of gifts", { a: aSeqs.length, b: bSeqs.length });

// Live rows on the screen: what the clerk tape says is live AND published.
const liveRows = list.donations.filter((d) => d.live && d.published);
const liveSeqs = new Set(liveRows.map((d) => d.seq));
const onScreen = aSeqs.filter((s) => !a.retractions.has(s));
check(onScreen.length === liveSeqs.size,
  "the projector holds exactly the live, published gifts",
  { screen: onScreen.length, db: liveSeqs.size });
check(onScreen.every((s) => liveSeqs.has(s)), "and not one gift the database does not have");

const screenCents = onScreen.reduce((sum, s) => sum + Number(a.seen.get(s).amount_cents), 0);
check(screenCents === pub.total_cents,
  "the feed total and the public aggregate agree to the cent",
  { screen: screenCents, public: pub.total_cents });
check(pub.gift_count === onScreen.length, "and so do the gift counts",
  { public: pub.gift_count, screen: onScreen.length });
check(pub.total_cents === list.totals.live_cents,
  "and the clerk tape agrees too", { public: pub.total_cents, tape: list.totals.live_cents });

check(retractedCents === 0 || a.retractions.has(retractRow.seq), "the retracted gift reached the displays as a retraction");
check(voidedCents === 0 || a.retractions.has(voidRow.seq), "the voided gift reached the displays as a retraction");
if (editRow) {
  const shown = a.seen.get(editRow.seq);
  check(shown && Number(shown.amount_cents) === 123456, "the edit reached the displays as a correction on the same seq", shown?.amount_cents);
}
if (anonSeq) {
  const shown = a.seen.get(anonSeq);
  check(shown && shown.display_name === "Anonymous" && shown.anonymous === true,
    "the anonymous gift never carried its household's name", shown?.display_name);
}
check(!JSON.stringify([...a.seen.values()]).includes("example.test"),
  "no party id (a buyer email) ever reached a display");

// One live gift per paddle per level: the 2025 bug, gone.
const byRoundPaddle = new Map();
let roundDupes = 0;
for (const d of list.donations) {
  if (!d.round_key || d.voided_at) continue;
  const k = `${d.round_key}|${d.paddle_number ?? d.called_number}`;
  if (byRoundPaddle.has(k)) roundDupes++;
  byRoundPaddle.set(k, d.id);
}
check(roundDupes === 0, "zero duplicate gifts per (round_key, paddle)", roundDupes);
check(converged > 0, "the duplicate guard actually fired during the hammer", converged);

const seqs = list.donations.map((d) => d.seq).sort((x, y) => x - y);
check(new Set(seqs).size === seqs.length, "every seq in the event is unique");
check(seqs.every((s, i) => i === 0 || s === seqs[i - 1] + 1), "seq has no gaps: nothing was lost between the clerks and the table");

check(stats.retry === 0, "retry = 0", stats.retry);
const bad = Object.keys(stats.http).filter((s) => s !== "200");
check(bad.length === 0, "every HTTP response was 200", stats.http);

console.log(`\n  ${stats.calls} RPC calls, slowest ${stats.slowest} ms, ${displays[0].polls}+${displays[1].polls} display polls`);
console.log(`  public total $${(pub.total_cents / 100).toFixed(2)} across ${pub.gift_count} gifts, ${list.totals.needs_review} flagged for review`);
console.log(`\n${passed} passed, ${failed} failed\n`);
console.log(`Now purge:  select public.gala_checkin_archive_and_purge('${EVENT}', 'PURGE ${EVENT}');`);
console.log(`            delete from public.gala_event_archive where event_slug = '${EVENT}';\n`);
process.exit(failed ? 1 : 0);
