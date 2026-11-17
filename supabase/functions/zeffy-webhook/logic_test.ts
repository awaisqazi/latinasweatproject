// deno test supabase/functions/zeffy-webhook
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  attribute,
  giftCents,
  hmacHex,
  matchFundraiserByUrl,
  netCents,
  normalizeUrl,
  paymentRow,
  refundedCents,
  shouldSkipEvent,
  verifyZeffySignature,
  type ZeffyPayment,
} from "./logic.ts";

const SECRET = "whsec_unit_test_only";
const NOW = 1_795_000_000;

async function sign(body: string, t = NOW, secret = SECRET) {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${body}`)}`;
}

Deno.test("signature: good signature passes", async () => {
  const body = '{"id":"evt_1","type":"payment.completed","data":{}}';
  assertEquals(await verifyZeffySignature(body, await sign(body), SECRET, NOW), { ok: true });
});

Deno.test("signature: verified on the raw bytes, a re-serialised body fails", async () => {
  const body = '{"id": "evt_1",  "type":"payment.completed"}';
  const header = await sign(body);
  const reserialised = JSON.stringify(JSON.parse(body));
  assertEquals((await verifyZeffySignature(reserialised, header, SECRET, NOW)).ok, false);
});

Deno.test("signature: bad signature, wrong secret, tampered body, missing and malformed headers fail", async () => {
  const body = '{"id":"evt_1"}';
  assertEquals(await verifyZeffySignature(body, `t=${NOW},v1=${"0".repeat(64)}`, SECRET, NOW), {
    ok: false,
    reason: "mismatch",
  });
  assertEquals(
    (await verifyZeffySignature(body, await sign(body, NOW, "whsec_other"), SECRET, NOW)).ok,
    false,
  );
  assertEquals((await verifyZeffySignature(body + " ", await sign(body), SECRET, NOW)).ok, false);
  assertEquals(await verifyZeffySignature(body, null, SECRET, NOW), { ok: false, reason: "missing" });
  assertEquals(await verifyZeffySignature(body, "garbage", SECRET, NOW), { ok: false, reason: "malformed" });
  assertEquals(await verifyZeffySignature(body, `t=abc,v1=00`, SECRET, NOW), { ok: false, reason: "malformed" });
  assertEquals((await verifyZeffySignature(body, `t=${NOW},v1=zz`, SECRET, NOW)).ok, false);
});

Deno.test("signature: stale and future timestamps beyond 5 minutes fail, inside passes", async () => {
  const body = '{"id":"evt_1"}';
  assertEquals(await verifyZeffySignature(body, await sign(body, NOW - 301), SECRET, NOW), {
    ok: false,
    reason: "stale",
  });
  assertEquals((await verifyZeffySignature(body, await sign(body, NOW + 301), SECRET, NOW)).ok, false);
  assertEquals((await verifyZeffySignature(body, await sign(body, NOW - 299), SECRET, NOW)).ok, true);
});

Deno.test("idempotency: replayed event ids with a final outcome are skipped", () => {
  assert(shouldSkipEvent("processed"));
  assert(shouldSkipEvent("ignored"));
  assert(shouldSkipEvent("deleted"));
  assert(!shouldSkipEvent("error"));
  assert(!shouldSkipEvent("received"));
  assert(!shouldSkipEvent("deferred"));
  assert(!shouldSkipEvent(null));
});

// ── Attribution ─────────────────────────────────────────────────

const MAIN = "main-p2p-page";
const campaigns = [{ slug: "gt-selftest", zeffy_campaign_ids: [MAIN] }];
const fundraisers = [
  { id: "f-ana", campaign_slug: "gt-selftest", zeffy_campaign_id: "page-ana", zeffy_url: "https://www.zeffy.com/en-US/peer-to-peer/ana" },
  { id: "f-bea", campaign_slug: "gt-selftest", zeffy_campaign_id: null, zeffy_url: "https://www.zeffy.com/en-US/peer-to-peer/bea/" },
];

const pay = (over: Partial<ZeffyPayment>): ZeffyPayment => ({
  id: "pay_1",
  created: NOW,
  amount: 5000,
  status: "succeeded",
  refund_status: "none",
  refunds: [],
  dispute: null,
  buyer: { email: "Donor@Example.com", first_name: "D", last_name: "N" },
  campaign_id: MAIN,
  campaign_category: "peer_to_peer",
  parent_campaign_id: MAIN,
  team_id: null,
  items: [{ type: "donation", amount: 5000 }],
  ...over,
});

Deno.test("attribution: payment on the main page belongs to the campaign, no fundraiser", () => {
  const a = attribute(pay({}), campaigns, fundraisers);
  assertEquals(a.kind, "main");
});

Deno.test("attribution: payment on a known participant page is credited to that fundraiser", () => {
  const a = attribute(pay({ campaign_id: "page-ana" }), campaigns, fundraisers);
  assertEquals(a.kind, "fundraiser");
  if (a.kind === "fundraiser") assertEquals(a.fundraiser.id, "f-ana");
});

Deno.test("attribution: unknown participant page stays on the campaign and matches by URL", () => {
  const a = attribute(pay({ campaign_id: "page-bea" }), campaigns, fundraisers);
  assertEquals(a.kind, "unknown_page");
  const hit = matchFundraiserByUrl("HTTPS://www.zeffy.com/en-US/peer-to-peer/bea?utm_source=x", "gt-selftest", fundraisers);
  assertEquals(hit?.id, "f-bea");
  assertEquals(matchFundraiserByUrl("https://www.zeffy.com/en-US/peer-to-peer/nobody", "gt-selftest", fundraisers), null);
  assertEquals(matchFundraiserByUrl(null, "gt-selftest", fundraisers), null);
});

Deno.test("attribution: payment outside every giving campaign is ignored", () => {
  assertEquals(attribute(pay({ campaign_id: "gala-form", parent_campaign_id: null }), campaigns, fundraisers).kind, "ignored");
  assertEquals(attribute(pay({ campaign_id: null, parent_campaign_id: null }), campaigns, fundraisers).kind, "ignored");
});

Deno.test("attribution: a stand-alone form listed in zeffy_campaign_ids counts via campaign_id", () => {
  const cs = [{ slug: "gt-selftest", zeffy_campaign_ids: [MAIN, "extra-form"] }];
  assertEquals(attribute(pay({ campaign_id: "extra-form", parent_campaign_id: null }), cs, fundraisers).kind, "main");
});

Deno.test("normalizeUrl strips case, query, fragment and trailing slashes", () => {
  assertEquals(normalizeUrl("https://Zeffy.com/A/B/?x=1#y"), "https://zeffy.com/a/b");
  assertEquals(normalizeUrl(""), "");
});

// ── Money ───────────────────────────────────────────────────────

Deno.test("money: gift excludes a tip that is not a line item", () => {
  // amount 5600 with a 600 tip; the donation item is 5000.
  assertEquals(giftCents(pay({ amount: 5600, items: [{ type: "donation", amount: 5000 }] })), 5000);
  // No items: fall back to amount.
  assertEquals(giftCents(pay({ amount: 2500, items: [] })), 2500);
});

Deno.test("money: partial refund nets out", () => {
  const p = pay({ refund_status: "partial", refunds: [{ amount: 2000, status: "succeeded" }, { amount: 999, status: "failed" }] });
  assertEquals(refundedCents(p), 2000);
  assertEquals(netCents(p), 3000);
});

Deno.test("money: full refund nets to zero even when refunds include the tip", () => {
  const p = pay({ amount: 5600, refund_status: "full", refunds: [{ amount: 5600, status: "succeeded" }] });
  assertEquals(refundedCents(p), 5000);
  assertEquals(netCents(p), 0);
});

Deno.test("money: refunds never exceed the gift, and a lost dispute nets to zero", () => {
  assertEquals(refundedCents(pay({ refund_status: "partial", refunds: [{ amount: 9000, status: "succeeded" }] })), 5000);
  assertEquals(netCents(pay({ dispute: { status: "lost", amount: 5000 } })), 0);
});

Deno.test("paymentRow maps fields for the upsert", () => {
  const row = paymentRow(pay({ campaign_id: "page-ana" }), "gt-selftest", "f-ana");
  assertEquals(row.amount_cents, 5000);
  assertEquals(row.buyer_email, "donor@example.com");
  assertEquals(row.paid_at, new Date(NOW * 1000).toISOString());
  assertEquals(row.fundraiser_id, "f-ana");
  assertEquals(row.zeffy_parent_campaign_id, MAIN);
});
