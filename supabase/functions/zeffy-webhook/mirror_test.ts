// Zeffy mirror: pure mapping plus webhook, reconcile and backfill flows
// against an in-memory stand-in for supabase-js and a fake Zeffy API.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { route } from "./handlers.ts";
import { hmacHex, paymentRow } from "./logic.ts";
import {
  campaignsNeedRefresh,
  isFullObject,
  mirrorCampaignRow,
  mirrorContactRow,
  mirrorPaymentRow,
  shapeOf,
  toIso,
} from "./mirror_logic.ts";

type Row = Record<string, any>;

const KEYS: Record<string, string> = {
  zeffy_payments: "id",
  zeffy_campaigns: "id",
  zeffy_contacts: "id",
  zeffy_sync_state: "key",
  giving_webhook_events: "id",
};

function fakeDb(tables: Record<string, Row[]>, opts: { failTables?: string[] } = {}) {
  const fail = new Set(opts.failTables || []);
  class Q {
    filters: Array<(r: Row) => boolean> = [];
    op: "select" | "update" | "insert" | "upsert" = "select";
    patch: Row | null = null;
    payload: Row[] = [];
    constructor(public table: string) {}
    select(_c?: string) {
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
    upsert(rows: Row | Row[], _o?: unknown) {
      this.op = "upsert";
      this.payload = Array.isArray(rows) ? rows : [rows];
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
      if (fail.has(this.table) && this.op !== "select") return res({ data: null, error: { code: "XX000" } });
      if (this.op === "upsert") {
        const t = (tables[this.table] ||= []);
        const key = KEYS[this.table] || "id";
        for (const row of this.payload) {
          const hit = t.find((r) => r[key] === row[key]);
          if (hit) Object.assign(hit, row);
          else t.push({ ...row });
        }
        return res({ data: null, error: null });
      }
      const rows = this.rows();
      if (this.op === "update") rows.forEach((r) => Object.assign(r, this.patch));
      res({ data: rows, error: null });
    }
  }
  return {
    from: (t: string) => new Q(t),
    rpc: (name: string, args: Row) => {
      if (name !== "giving_upsert_zeffy_payment") return Promise.resolve({ data: null, error: { code: "x" } });
      const row = args.p_row;
      const t = (tables.giving_payments ||= []);
      const hit = t.find((r) => r.zeffy_payment_id === row.zeffy_payment_id);
      if (hit) Object.assign(hit, row);
      else t.push({ ...row, source: "zeffy" });
      return Promise.resolve({ data: "ok", error: null });
    },
  };
}

const SECRET = "whsec_unit_test_only";
const CRON = "cron_unit_test_only";

async function signedRequest(event: unknown) {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = `t=${t},v1=${await hmacHex(SECRET, `${t}.${body}`)}`;
  return new Request("https://x.test/zeffy-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Zeffy-Signature": sig },
    body,
  });
}

const cronRequest = (qs: string) =>
  new Request(`https://x.test/?${qs}`, { method: "POST", headers: { "x-giving-cron-secret": CRON } });

function seed(): Record<string, Row[]> {
  return {
    giving_campaigns: [{ slug: "gt-selftest", zeffy_campaign_ids: ["main"], starts_at: new Date(Date.now() - 86400_000).toISOString(), ends_at: new Date(Date.now() + 10 * 86400_000).toISOString() }],
    giving_fundraisers: [{ id: "f-ana", campaign_slug: "gt-selftest", zeffy_campaign_id: "page-ana", zeffy_url: null }],
    giving_webhook_events: [],
    giving_payments: [],
    zeffy_payments: [],
    zeffy_campaigns: [],
    zeffy_contacts: [],
    zeffy_sync_state: [],
  };
}

const payment = (over: Row = {}) => ({
  id: "pay_1",
  object: "payment",
  created: Math.floor(Date.now() / 1000) - 60,
  amount: 5600,
  status: "succeeded",
  refund_status: "none",
  refunds: [],
  dispute: null,
  buyer: { email: "  D@Example.com ", first_name: "D", last_name: "N" },
  campaign_id: "page-ana",
  parent_campaign_id: "main",
  campaign_category: "PeerToPeerCampaign",
  team_id: null,
  items: [{ type: "donation", amount: 5000 }],
  ...over,
});

// Fake Zeffy API. `pages` maps a list path prefix to its pages, in order.
function fakeZeffy(pages: Record<string, Row[][]>, byId: Record<string, Row | number> = {}) {
  const calls: string[] = [];
  const fetchFn = ((input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const path = url.pathname.replace("/api/v1", "");
    calls.push(path + url.search);
    const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }));
    const list = pages[path];
    if (list) {
      const after = url.searchParams.get("starting_after");
      let idx = 0;
      if (after) idx = list.findIndex((pg) => pg.some((r) => r.id === after)) + 1;
      const data = list[idx] || [];
      return json({ object: "list", data, has_more: idx < list.length - 1 });
    }
    const hit = byId[path];
    if (typeof hit === "number") return json({ error: "x" }, hit);
    if (hit) return json(hit);
    return json({}, 404);
  }) as typeof fetch;
  return { calls, fetchFn };
}

async function withZeffy(f: ReturnType<typeof fakeZeffy>, fn: () => Promise<void>) {
  const real = globalThis.fetch;
  globalThis.fetch = f.fetchFn;
  Deno.env.set("ZEFFY_API_KEY", "key_unit_test_only");
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
    Deno.env.delete("ZEFFY_API_KEY");
  }
}

Deno.env.set("ZEFFY_WEBHOOK_SECRET", SECRET);
Deno.env.set("GIVING_CRON_SECRET", CRON);
Deno.env.delete("ZEFFY_API_KEY");

// ── Pure mapping ────────────────────────────────────────────────

Deno.test("mirror row: same gift and refund cents as the giving row, tip excluded, email lowercased", () => {
  const p = payment({ refunds: [{ amount: 1000, status: "succeeded" }] });
  const m = mirrorPaymentRow(p as any, "2026-11-18T00:00:00.000Z");
  const g = paymentRow(p as any, "gt", null);
  assertEquals(m.amount_cents, g.amount_cents);
  assertEquals(m.refunded_cents, g.refunded_cents);
  assertEquals(m.amount_cents, 5000);
  assertEquals(m.refunded_cents, 1000);
  assertEquals(m.charged_cents, 5600);
  assertEquals(m.buyer_email, "d@example.com");
  assertEquals(m.campaign_category, "PeerToPeerCampaign");
  assertEquals(m.deleted_at, null);
  assertEquals(m.created_at, new Date(p.created * 1000).toISOString());
});

Deno.test("mirror row: full refund and missing buyer", () => {
  const m = mirrorPaymentRow(payment({ refund_status: "full", buyer: null }) as any);
  assertEquals(m.refunded_cents, m.amount_cents);
  assertEquals(m.buyer_email, null);
});

Deno.test("campaign row: goal from goal_amount or target, volume, created", () => {
  const c = mirrorCampaignRow({ id: "c1", title: "Gala", url: "u", category: "Event", type: "ticketing", status: "active", target: 900, volume: 1234, created: 1_700_000_000 });
  assertEquals([c.goal_cents, c.volume_cents, c.zeffy_created_at], [900, 1234, toIso(1_700_000_000)]);
  assertEquals(mirrorCampaignRow({ id: "c2", name: "N", goal_amount: 5, target: 9 }).goal_cents, 5);
  assertEquals(mirrorCampaignRow({ id: "c2", name: "N" }).title, "N");
});

Deno.test("contact row: picks common field spellings", () => {
  const c = mirrorContactRow({ id: "ct1", email: "A@B.co", firstName: "A", last_name: "B", phone_number: "1", created: 1_700_000_000 });
  assertEquals([c.email, c.first_name, c.last_name, c.phone], ["a@b.co", "A", "B", "1"]);
  assertEquals(c.zeffy_created_at, toIso(1_700_000_000));
  const z = mirrorContactRow({ id: "ct2", email: "z@z.co", phone_number: null, donor_type: "individual", total_contribution: 12500, donation_count: 3, first_donation_date: null, last_donation_date: 1_700_000_000 });
  assertEquals([z.donor_type, z.total_contribution_cents, z.donation_count, z.first_donation_at, z.last_donation_at], ["individual", 12500, 3, null, toIso(1_700_000_000)]);
});

Deno.test("mirror row: contact id, payment type and campaign type from the live payload shape", () => {
  const m = mirrorPaymentRow(payment({ contact: "ct_9", type: "one_time", campaign_type: "donation_form" }) as any);
  assertEquals([m.contact_id, m.payment_type, m.campaign_type], ["ct_9", "one_time", "donation_form"]);
});

Deno.test("shapeOf returns types, never values", () => {
  const s = shapeOf({ id: "x", buyer: { email: "secret@example.com" }, items: [{ amount: 1 }], n: null });
  assertEquals(s, { id: "string", buyer: { email: "string" }, items: [{ amount: "number" }], n: "null" });
  assert(!JSON.stringify(s).includes("secret"));
});

Deno.test("isFullObject: {id, object} alone is not a full payload", () => {
  assertEquals(isFullObject({ id: "c", object: "contact" }, "contact"), false);
  assertEquals(isFullObject({ id: "c", object: "contact", email: "e" }, "contact"), true);
  assertEquals(isFullObject({ id: "c", object: "payment", email: "e" }, "contact"), false);
});

Deno.test("campaignsNeedRefresh: never synced, stale, or new money", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  assertEquals(campaignsNeedRefresh(null, now, []), true);
  assertEquals(campaignsNeedRefresh("2026-11-18T11:30:00Z", now, []), true);
  assertEquals(campaignsNeedRefresh("2026-11-18T11:55:00Z", now, []), false);
  const newer = { id: "p", created: Date.parse("2026-11-18T11:58:00Z") / 1000 };
  const older = { id: "p", created: Date.parse("2026-11-18T11:00:00Z") / 1000 };
  assertEquals(campaignsNeedRefresh("2026-11-18T11:55:00Z", now, [newer]), true);
  assertEquals(campaignsNeedRefresh("2026-11-18T11:55:00Z", now, [older]), false);
});

// ── Webhook ─────────────────────────────────────────────────────

Deno.test("webhook: payment outside giving is mirrored, giving outcome still ignored", async () => {
  const tables = seed();
  const ev = { id: "e1", type: "payment.created", data: payment({ id: "pay_x", campaign_id: "gala", parent_campaign_id: null }) };
  const res = await route(await signedRequest(ev), fakeDb(tables) as any);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).outcome, "ignored");
  assertEquals(tables.giving_payments.length, 0);
  assertEquals(tables.zeffy_payments.map((r) => r.id), ["pay_x"]);
  assertEquals(tables.giving_webhook_events[0].outcome, "ignored");
  assertEquals(tables.giving_webhook_events[0].mirror_outcome, "upserted");
});

Deno.test("webhook: giving payment goes to both tables", async () => {
  const tables = seed();
  const res = await route(await signedRequest({ id: "e2", type: "payment.completed", data: payment() }), fakeDb(tables) as any);
  assertEquals((await res.json()).outcome, "processed");
  assertEquals(tables.giving_payments.length, 1);
  assertEquals(tables.zeffy_payments[0].amount_cents, tables.giving_payments[0].amount_cents);
});

Deno.test("webhook: a mirror failure never changes the giving outcome or status", async () => {
  const tables = seed();
  const db = fakeDb(tables, { failTables: ["zeffy_payments"] });
  const res = await route(await signedRequest({ id: "e3", type: "payment.completed", data: payment() }), db as any);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).outcome, "processed");
  assertEquals(tables.giving_payments.length, 1);
  assertEquals(tables.giving_webhook_events[0].mirror_outcome, undefined);
});

Deno.test("webhook: payment.deleted soft-deletes the mirror row", async () => {
  const tables = seed();
  tables.zeffy_payments.push({ id: "pay_9", deleted_at: null });
  const res = await route(await signedRequest({ id: "e4", type: "payment.deleted", data: { id: "pay_9", object: "payment" } }), fakeDb(tables) as any);
  assertEquals((await res.json()).outcome, "ignored");
  assert(tables.zeffy_payments[0].deleted_at);
  assertEquals(tables.giving_webhook_events[0].mirror_outcome, "deleted");
});

Deno.test("webhook: contact.created with a full payload is upserted", async () => {
  const tables = seed();
  const data = { id: "ct_1", object: "contact", email: "X@Y.co", first_name: "X", last_name: "Y" };
  const res = await route(await signedRequest({ id: "e5", type: "contact.created", data }), fakeDb(tables) as any);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).outcome, "processed");
  assertEquals(tables.zeffy_contacts[0].email, "x@y.co");
  assertEquals(tables.giving_webhook_events[0], { id: "e5", type: "contact.created", outcome: "processed", error: null, mirror_outcome: "contact_processed" });
});

Deno.test("webhook: contact.updated with only an id refetches; 404 soft-deletes; no key defers", async () => {
  const tables = seed();
  tables.zeffy_contacts.push({ id: "ct_2", email: "old@y.co", deleted_at: null });
  const db = fakeDb(tables);
  const r0 = await route(await signedRequest({ id: "e6", type: "contact.updated", data: { id: "ct_2", object: "contact" } }), db as any);
  assertEquals((await r0.json()).outcome, "deferred");

  const z = fakeZeffy({}, { "/contacts/ct_2": { id: "ct_2", object: "contact", email: "New@y.co" } });
  await withZeffy(z, async () => {
    const r1 = await route(await signedRequest({ id: "e7", type: "contact.updated", data: { id: "ct_2", object: "contact" } }), db as any);
    assertEquals((await r1.json()).outcome, "processed");
    assertEquals(tables.zeffy_contacts[0].email, "new@y.co");
    const r2 = await route(await signedRequest({ id: "e8", type: "contact.updated", data: { id: "ct_gone", object: "contact" } }), db as any);
    assertEquals((await r2.json()).outcome, "deleted");
  });
});

Deno.test("webhook: contact.updated when the key cannot read contacts is acknowledged as deferred", async () => {
  const tables = seed();
  const z = fakeZeffy({}, { "/contacts/ct_3": 403 });
  await withZeffy(z, async () => {
    const res = await route(await signedRequest({ id: "e9", type: "contact.updated", data: { id: "ct_3", object: "contact" } }), fakeDb(tables) as any);
    assertEquals(res.status, 200);
    assertEquals((await res.json()).outcome, "deferred");
  });
});

Deno.test("webhook: contact.deleted soft-deletes", async () => {
  const tables = seed();
  tables.zeffy_contacts.push({ id: "ct_4", deleted_at: null });
  const res = await route(await signedRequest({ id: "e10", type: "contact.deleted", data: { id: "ct_4", object: "contact" } }), fakeDb(tables) as any);
  assertEquals((await res.json()).outcome, "deleted");
  assert(tables.zeffy_contacts[0].deleted_at);
});

Deno.test("webhook: unknown event types are acknowledged with 200 and logged", async () => {
  const tables = seed();
  const res = await route(await signedRequest({ id: "e11", type: "campaign.updated", data: { id: "c" } }), fakeDb(tables) as any);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).outcome, "ignored");
  assertEquals(tables.giving_webhook_events[0].type, "campaign.updated");
});

// ── Reconcile ───────────────────────────────────────────────────

Deno.test("reconcile: mirrors every listed payment and refreshes paged campaigns; giving counts unchanged", async () => {
  const tables = seed();
  const z = fakeZeffy({
    "/payments": [[payment(), payment({ id: "pay_gala", campaign_id: "gala", parent_campaign_id: null })]],
    "/campaigns": [[{ id: "main", title: "Drive" }], [{ id: "gala", title: "Gala" }]],
  });
  await withZeffy(z, async () => {
    const res = await route(cronRequest("mode=reconcile"), fakeDb(tables) as any);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals([body.ok, body.fetched, body.upserted, body.matched, body.unmatched, body.deleted], [true, 2, 1, 1, 0, 0]);
    assertEquals(body.mirror.payments, 2);
    assertEquals(body.mirror.campaigns, { fetched: 2, pages: 2, complete: true });
    assertEquals(body.mirror.errors, []);
    assertEquals(tables.giving_payments.length, 1);
    assertEquals(tables.zeffy_payments.length, 2);
    assertEquals(tables.zeffy_campaigns.map((c) => c.id), ["main", "gala"]);
    assert(tables.zeffy_sync_state.find((s) => s.key === "reconcile")?.last_run_at);

    // A second run right after: nothing new, campaigns are fresh, no campaign calls.
    const before = z.calls.length;
    tables.zeffy_payments.length = 0;
    const body2 = await (await route(cronRequest("mode=reconcile"), fakeDb(tables) as any)).json();
    assertEquals(body2.mirror.campaigns, null);
    assertEquals(z.calls.slice(before).filter((c) => c.startsWith("/campaigns")).length, 0);
  });
});

Deno.test("reconcile: a broken mirror still answers the giving result", async () => {
  const tables = seed();
  const z = fakeZeffy({ "/payments": [[payment()]], "/campaigns": [[]] });
  await withZeffy(z, async () => {
    const db = fakeDb(tables, { failTables: ["zeffy_payments", "zeffy_campaigns", "zeffy_sync_state"] });
    const res = await route(cronRequest("mode=reconcile"), db as any);
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals([body.ok, body.upserted, body.matched], [true, 1, 1]);
    assert(body.mirror.errors.length > 0);
  });
});

Deno.test("reconcile: with no active drive the mirror still lists the last week", async () => {
  const tables = seed();
  tables.giving_campaigns[0].ends_at = "2020-01-01T00:00:00Z";
  const z = fakeZeffy({ "/payments": [[payment({ id: "pay_late" })]], "/campaigns": [[]] });
  await withZeffy(z, async () => {
    const body = await (await route(cronRequest("mode=reconcile"), fakeDb(tables) as any)).json();
    assertEquals(body.note, "no_active_campaigns");
    assertEquals(body.upserted, 0);
    assertEquals(body.mirror.payments, 1);
    assertEquals(tables.giving_payments.length, 0);
    assert(z.calls[0].includes("created%5Bgte%5D="));
  });
});

// ── Backfill ────────────────────────────────────────────────────

Deno.test("backfill: bounded pages per call, resumes from the saved cursor, then reports complete", async () => {
  const tables = seed();
  const pages = [
    [payment({ id: "p5", created: 1_790_000_500 }), payment({ id: "p4", created: 1_790_000_400 })],
    [payment({ id: "p3", created: 1_790_000_300 }), payment({ id: "p2", created: 1_790_000_200 })],
    [payment({ id: "p1", created: 1_700_000_000 })],
  ];
  const z = fakeZeffy({ "/payments": pages });
  await withZeffy(z, async () => {
    const db = fakeDb(tables);
    const b1 = await (await route(cronRequest("mode=backfill&pages=2"), db as any)).json();
    assertEquals([b1.ok, b1.done, b1.pages, b1.rows], [true, false, 2, 4]);
    assertEquals(tables.zeffy_sync_state.find((s) => s.key === "payments_backfill")?.cursor, "p2");
    const b2 = await (await route(cronRequest("mode=backfill&pages=2"), db as any)).json();
    assertEquals([b2.done, b2.pages, b2.total_rows, b2.oldest], [true, 1, 5, toIso(1_700_000_000)]);
    const b3 = await (await route(cronRequest("mode=backfill"), db as any)).json();
    assertEquals(b3.note, "already_complete");
    assertEquals(tables.zeffy_payments.length, 5);
    // Restart walks again; upserts are idempotent.
    const b4 = await (await route(cronRequest("mode=backfill&restart=1&pages=5"), db as any)).json();
    assertEquals([b4.done, b4.total_rows], [true, 5]);
    assertEquals(tables.zeffy_payments.length, 5);
    assert(!z.calls.some((c) => c.includes("created")));
  });
});

Deno.test("contacts: synced through the same resumable runner; a 403 is reported", async () => {
  const tables = seed();
  const ok = fakeZeffy({ "/contacts": [[{ id: "c1", email: "A@b.co" }, { id: "c2", email: null }]] });
  await withZeffy(ok, async () => {
    const body = await (await route(cronRequest("mode=contacts"), fakeDb(tables) as any)).json();
    assertEquals([body.ok, body.done, body.rows], [true, true, 2]);
    assertEquals(tables.zeffy_contacts.map((c) => c.email), ["a@b.co", null]);
  });
  const denied = fakeZeffy({}, { "/contacts": 403 });
  await withZeffy(denied, async () => {
    const res = await route(cronRequest("mode=contacts&restart=1"), fakeDb(seed()) as any);
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.detail, "zeffy_http_403");
    assert(!JSON.stringify(body).includes("key_unit_test_only"));
  });
});

Deno.test("mirror modes: unauthorised is 401, no key is no_api_key", async () => {
  for (const mode of ["backfill", "contacts", "campaigns", "shape"]) {
    const anon = new Request(`https://x.test/?mode=${mode}`, { method: "POST" });
    assertEquals((await route(anon, fakeDb(seed()) as any)).status, 401);
    assertEquals(await (await route(cronRequest(`mode=${mode}`), fakeDb(seed()) as any)).json(), { ok: false, reason: "no_api_key" });
  }
});

Deno.test("shape: answers field types only", async () => {
  const z = fakeZeffy(
    { "/payments": [[payment()]], "/contacts": [[{ id: "c1", email: "secret@example.com" }]], "/campaigns": [[{ id: "main", title: "Drive" }]] },
    { "/payments/pay_1": payment(), "/contacts/c1": { id: "c1" }, "/campaigns/main": { id: "main" } },
  );
  await withZeffy(z, async () => {
    const body = await (await route(cronRequest("mode=shape"), fakeDb(seed()) as any)).json();
    assertEquals(body.shapes.contacts.item, { id: "string", email: "string" });
    assertEquals(body.shapes.contacts.get_by_id_status, 200);
    assert(!JSON.stringify(body).includes("secret@example.com"));
    assert(!JSON.stringify(body).includes("example.com"));
  });
});
