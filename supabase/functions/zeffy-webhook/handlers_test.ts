// End-to-end webhook flow against an in-memory stand-in for supabase-js.
import { assertEquals } from "jsr:@std/assert@1";
import { route } from "./handlers.ts";
import { hmacHex } from "./logic.ts";

type Row = Record<string, any>;

function fakeDb(tables: Record<string, Row[]>) {
  const upserts: Row[] = [];
  class Q {
    filters: Array<(r: Row) => boolean> = [];
    op: "select" | "update" | "insert" = "select";
    patch: Row | null = null;
    returning = false;
    constructor(public table: string) {}
    select(_c?: string) {
      if (this.op !== "select") this.returning = true;
      return this;
    }
    eq(c: string, v: unknown) {
      this.filters.push((r) => r[c] === v);
      return this;
    }
    neq(c: string, v: unknown) {
      this.filters.push((r) => r[c] !== v);
      return this;
    }
    is(c: string, v: unknown) {
      this.filters.push((r) => (r[c] ?? null) === v);
      return this;
    }
    in(c: string, vs: unknown[]) {
      this.filters.push((r) => vs.includes(r[c]));
      return this;
    }
    update(p: Row) {
      this.op = "update";
      this.patch = p;
      return this;
    }
    insert(row: Row) {
      const t = (tables[this.table] ||= []);
      if (t.some((r) => r.id === row.id)) return Promise.resolve({ error: { code: "23505" } });
      t.push({ ...row });
      return Promise.resolve({ error: null });
    }
    rows() {
      return (tables[this.table] || []).filter((r) => this.filters.every((f) => f(r)));
    }
    maybeSingle() {
      return Promise.resolve({ data: this.rows()[0] ?? null, error: null });
    }
    then(res: (v: unknown) => void) {
      const rows = this.rows();
      if (this.op === "update") rows.forEach((r) => Object.assign(r, this.patch));
      res({ data: rows, error: null });
    }
  }
  return {
    upserts,
    from: (t: string) => new Q(t),
    rpc: (name: string, args: Row) => {
      if (name !== "giving_upsert_zeffy_payment") return Promise.resolve({ data: null, error: { code: "x" } });
      const row = args.p_row;
      upserts.push(row);
      const t = (tables.giving_payments ||= []);
      const hit = t.find((r) => r.zeffy_payment_id === row.zeffy_payment_id);
      if (hit) Object.assign(hit, { ...row, fundraiser_id: row.fundraiser_id ?? hit.fundraiser_id });
      else t.push({ ...row, source: "zeffy" });
      return Promise.resolve({ data: hit ? "updated" : "inserted", error: null });
    },
  };
}

const SECRET = "whsec_unit_test_only";

async function signedRequest(event: unknown, secret = SECRET) {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${await hmacHex(secret, `${t}.${body}`)}`;
  return new Request("https://x.test/zeffy-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Zeffy-Signature": sig },
    body,
  });
}

function seed() {
  return {
    giving_campaigns: [{ slug: "gt-selftest", zeffy_campaign_ids: ["main"], starts_at: "2026-11-01T00:00:00Z", ends_at: "2026-12-02T05:59:59Z" }],
    giving_fundraisers: [{ id: "f-ana", campaign_slug: "gt-selftest", zeffy_campaign_id: "page-ana", zeffy_url: null }],
    giving_webhook_events: [] as Row[],
    giving_payments: [] as Row[],
  };
}

const payment = (over: Row = {}) => ({
  id: "pay_1",
  object: "payment",
  created: 1_795_000_000,
  amount: 5000,
  status: "succeeded",
  refund_status: "none",
  refunds: [],
  dispute: null,
  buyer: { email: "d@example.com", first_name: "D", last_name: "N" },
  campaign_id: "page-ana",
  parent_campaign_id: "main",
  team_id: null,
  items: [{ type: "donation", amount: 5000 }],
  ...over,
});

Deno.env.delete("ZEFFY_API_KEY");

Deno.test("webhook: no secret configured answers 503", async () => {
  Deno.env.delete("ZEFFY_WEBHOOK_SECRET");
  const db = fakeDb(seed());
  const res = await route(await signedRequest({ id: "e1", type: "payment.completed", data: payment() }), db as any);
  assertEquals(res.status, 503);
});

Deno.test("webhook: unsigned and badly signed requests are rejected, nothing recorded", async () => {
  Deno.env.set("ZEFFY_WEBHOOK_SECRET", SECRET);
  const tables = seed();
  const db = fakeDb(tables);
  const unsigned = new Request("https://x.test/", { method: "POST", body: "{}" });
  assertEquals((await route(unsigned, db as any)).status, 400);
  const forged = await signedRequest({ id: "e1", type: "payment.completed", data: payment() }, "whsec_wrong");
  assertEquals((await route(forged, db as any)).status, 400);
  assertEquals(tables.giving_webhook_events.length, 0);
});

Deno.test("webhook: participant-page payment stored and credited; replay is a no-op", async () => {
  Deno.env.set("ZEFFY_WEBHOOK_SECRET", SECRET);
  const tables = seed();
  const db = fakeDb(tables);
  const ev = { id: "e1", type: "payment.completed", version: 1, dispatchedAt: "x", data: payment() };
  const r1 = await route(await signedRequest(ev), db as any);
  assertEquals(r1.status, 200);
  assertEquals((await r1.json()).outcome, "processed");
  assertEquals(tables.giving_payments.length, 1);
  assertEquals(tables.giving_payments[0].fundraiser_id, "f-ana");
  assertEquals(tables.giving_webhook_events[0].outcome, "processed");

  const r2 = await route(await signedRequest(ev), db as any);
  assertEquals(r2.status, 200);
  assertEquals((await r2.json()).duplicate, true);
  assertEquals(db.upserts.length, 1);
});

Deno.test("webhook: payment outside giving campaigns is not stored, event marked ignored", async () => {
  Deno.env.set("ZEFFY_WEBHOOK_SECRET", SECRET);
  const tables = seed();
  const db = fakeDb(tables);
  const ev = { id: "e2", type: "payment.created", data: payment({ id: "pay_x", campaign_id: "gala", parent_campaign_id: null }) };
  const res = await route(await signedRequest(ev), db as any);
  assertEquals((await res.json()).outcome, "ignored");
  assertEquals(tables.giving_payments.length, 0);
  assertEquals(tables.giving_webhook_events[0], { id: "e2", type: "payment.created", outcome: "ignored", error: null });
});

Deno.test("webhook: payment.updated without an API key is deferred (reconcile catches up)", async () => {
  Deno.env.set("ZEFFY_WEBHOOK_SECRET", SECRET);
  const tables = seed();
  const db = fakeDb(tables);
  const res = await route(await signedRequest({ id: "e3", type: "payment.updated", data: { id: "pay_1", object: "payment" } }), db as any);
  assertEquals((await res.json()).outcome, "deferred");
});

Deno.test("webhook: payment.deleted marks a stored payment deleted", async () => {
  Deno.env.set("ZEFFY_WEBHOOK_SECRET", SECRET);
  const tables = seed();
  tables.giving_payments.push({ zeffy_payment_id: "pay_1", status: "succeeded", source: "zeffy" });
  const db = fakeDb(tables);
  const res = await route(await signedRequest({ id: "e4", type: "payment.deleted", data: { id: "pay_1", object: "payment" } }), db as any);
  assertEquals((await res.json()).outcome, "deleted");
  assertEquals(tables.giving_payments[0].status, "deleted");
});

Deno.test("reconcile: no credentials is 401; authorised without API key is no_api_key", async () => {
  Deno.env.set("GIVING_CRON_SECRET", "cron_unit_test_only");
  const db = fakeDb(seed());
  const anon = new Request("https://x.test/?mode=reconcile", { method: "POST" });
  assertEquals((await route(anon, db as any)).status, 401);
  const wrong = new Request("https://x.test/?mode=reconcile", { method: "POST", headers: { "x-giving-cron-secret": "nope" } });
  assertEquals((await route(wrong, db as any)).status, 401);
  const ok = new Request("https://x.test/?mode=reconcile", { method: "POST", headers: { "x-giving-cron-secret": "cron_unit_test_only" } });
  const res = await route(ok, db as any);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: false, reason: "no_api_key" });
});
