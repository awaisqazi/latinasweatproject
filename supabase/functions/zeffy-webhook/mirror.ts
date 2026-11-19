// I/O for the Zeffy mirror (zeffy_payments, zeffy_campaigns, zeffy_contacts,
// zeffy_sync_state). Everything here is additive to the giving sync: callers
// in handlers.ts wrap mirror work so a mirror failure never changes a giving
// outcome or response status.
//
//   ?mode=backfill   resumable full payment history, bounded pages per call
//   ?mode=contacts   resumable contact sync, same mechanics
//   ?mode=campaigns  full campaign list refresh
//   ?mode=shape      field names and types of each endpoint, never values
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { ZeffyPayment } from "./logic.ts";
import {
  isFullObject,
  mirrorCampaignRow,
  mirrorContactRow,
  mirrorPaymentRow,
  nextCursor,
  shapeOf,
} from "./mirror_logic.ts";

export type ZeffyGetter = { get(path: string): Promise<{ status: number; body: any }>; calls?: number };

const CHUNK = 100;

// ── Sync state ──────────────────────────────────────────────────

export type SyncState = {
  key: string;
  cursor: string | null;
  done: boolean;
  counters: Record<string, any>;
  started_at: string | null;
  completed_at: string | null;
  last_run_at: string | null;
  last_result: Record<string, any> | null;
};

export async function getState(db: SupabaseClient, key: string): Promise<SyncState | null> {
  const { data, error } = await db.from("zeffy_sync_state").select("*").eq("key", key).maybeSingle();
  if (error) throw new Error(`db_state_${error.code}`);
  return (data as SyncState) ?? null;
}

export async function saveState(db: SupabaseClient, key: string, patch: Partial<SyncState>): Promise<void> {
  const { error } = await db.from("zeffy_sync_state").upsert({ key, ...patch }, { onConflict: "key" });
  if (error) throw new Error(`db_state_save_${error.code}`);
}

// ── Upserts ─────────────────────────────────────────────────────

export async function upsertPayments(db: SupabaseClient, payments: ZeffyPayment[]): Promise<number> {
  const now = new Date().toISOString();
  const rows = payments.filter((p) => p && typeof p.id === "string" && p.id).map((p) => mirrorPaymentRow(p, now));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("zeffy_payments").upsert(rows.slice(i, i + CHUNK), { onConflict: "id" });
    if (error) throw new Error(`db_mirror_payments_${error.code}`);
  }
  return rows.length;
}

export async function softDeletePayment(db: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await db
    .from("zeffy_payments")
    .update({ deleted_at: new Date().toISOString(), synced_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(`db_mirror_delete_${error.code}`);
  return (data || []).length > 0;
}

export async function upsertCampaigns(db: SupabaseClient, campaigns: any[]): Promise<number> {
  const now = new Date().toISOString();
  const rows = campaigns.filter((c) => c && c.id).map((c) => mirrorCampaignRow(c, now));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("zeffy_campaigns").upsert(rows.slice(i, i + CHUNK), { onConflict: "id" });
    if (error) throw new Error(`db_mirror_campaigns_${error.code}`);
  }
  return rows.length;
}

export async function upsertContacts(db: SupabaseClient, contacts: any[]): Promise<number> {
  const now = new Date().toISOString();
  const rows = contacts.filter((c) => c && c.id).map((c) => mirrorContactRow(c, now));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("zeffy_contacts").upsert(rows.slice(i, i + CHUNK), { onConflict: "id" });
    if (error) throw new Error(`db_mirror_contacts_${error.code}`);
  }
  return rows.length;
}

export async function softDeleteContact(db: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await db
    .from("zeffy_contacts")
    .update({ deleted_at: new Date().toISOString(), synced_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) throw new Error(`db_contacts_delete_${error.code}`);
  return (data || []).length > 0;
}

// ── Campaign list (paged, 100+ campaigns) ───────────────────────

export async function syncCampaigns(
  db: SupabaseClient,
  zeffy: ZeffyGetter,
  deadlineMs: number,
  maxPages = 20,
): Promise<{ fetched: number; pages: number; complete: boolean }> {
  let cursor: string | null = null;
  let fetched = 0;
  let pages = 0;
  let complete = false;
  while (pages < maxPages && Date.now() < deadlineMs) {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("starting_after", cursor);
    const res = await zeffy.get(`/campaigns?${qs}`);
    pages++;
    const list = res.body || {};
    const rows: any[] = Array.isArray(list.data) ? list.data : [];
    fetched += await upsertCampaigns(db, rows);
    cursor = nextCursor(list, rows);
    if (!list.has_more || !cursor) {
      complete = true;
      break;
    }
  }
  const now = new Date().toISOString();
  const result = { fetched, pages, complete };
  // last_run_at only moves on a complete pass, so a cut-short pass retries.
  await saveState(db, "campaigns", {
    ...(complete ? { last_run_at: now, completed_at: now, done: true } : {}),
    counters: { campaigns: fetched },
    last_result: { ...result, at: now },
  });
  return result;
}

// ── Resumable backfill (payments or contacts) ───────────────────

export type BackfillKind = "payments" | "contacts";

export async function runBackfill(
  db: SupabaseClient,
  zeffy: ZeffyGetter,
  kind: BackfillKind,
  opts: { restart?: boolean; maxPages?: number; budgetMs?: number } = {},
): Promise<Record<string, unknown>> {
  const key = kind === "payments" ? "payments_backfill" : "contacts_sync";
  const startedAt = Date.now();
  const budgetMs = opts.budgetMs ?? 60_000;
  const maxPages = opts.maxPages ?? 40;
  const callsBefore = zeffy.calls ?? 0;

  let state = await getState(db, key);
  if (opts.restart || !state) {
    state = {
      key,
      cursor: null,
      done: false,
      counters: { pages: 0, rows: 0 },
      started_at: new Date().toISOString(),
      completed_at: null,
      last_run_at: null,
      last_result: null,
    };
    await saveState(db, key, state);
  }
  if (state.done) {
    return { ok: true, kind, done: true, note: "already_complete", counters: state.counters, completed_at: state.completed_at };
  }

  const counters = { pages: 0, rows: 0, oldest: null as string | null, newest: null as string | null, ...state.counters };
  let cursor = state.cursor;
  let pagesThisCall = 0;
  let rowsThisCall = 0;
  let done = false;
  let status: number | null = null;

  while (pagesThisCall < maxPages && Date.now() - startedAt < budgetMs) {
    const qs = new URLSearchParams({ limit: "100" });
    if (cursor) qs.set("starting_after", cursor);
    const res = await zeffy.get(`/${kind}?${qs}`);
    status = res.status;
    if (res.status === 404) throw new Error(`zeffy_http_404`);
    const list = res.body || {};
    const rows: any[] = Array.isArray(list.data) ? list.data : [];
    const n = kind === "payments" ? await upsertPayments(db, rows) : await upsertContacts(db, rows);
    pagesThisCall++;
    rowsThisCall += n;
    counters.pages = (counters.pages || 0) + 1;
    counters.rows = (counters.rows || 0) + n;
    for (const r of rows) {
      const ts = typeof r?.created === "number" ? new Date(r.created * 1000).toISOString() : null;
      if (!ts) continue;
      if (!counters.oldest || ts < counters.oldest) counters.oldest = ts;
      if (!counters.newest || ts > counters.newest) counters.newest = ts;
    }
    const next = nextCursor(list, rows);
    done = !list.has_more || !next;
    cursor = next;
    const now = new Date().toISOString();
    // Saved after every page: a timeout loses at most the page in flight,
    // and re-upserting it is harmless.
    await saveState(db, key, {
      cursor: done ? null : cursor,
      done,
      counters,
      last_run_at: now,
      ...(done ? { completed_at: now } : {}),
    });
    if (done) break;
  }

  const result = {
    ok: true,
    kind,
    done,
    pages: pagesThisCall,
    rows: rowsThisCall,
    total_pages: counters.pages,
    total_rows: counters.rows,
    oldest: counters.oldest,
    newest: counters.newest,
    api_calls: (zeffy.calls ?? 0) - callsBefore,
    last_status: status,
  };
  await saveState(db, key, { last_result: { ...result, at: new Date().toISOString() } });
  return result;
}

// ── Contact webhook events ──────────────────────────────────────

// contact.created | contact.updated | contact.deleted. Returns the outcome
// stored on giving_webhook_events.
export async function processContactEvent(
  db: SupabaseClient,
  type: string,
  data: any,
  zeffy: ZeffyGetter | null,
): Promise<string> {
  const id = typeof data?.id === "string" ? data.id : "";
  if (!id) return "ignored";
  if (type === "contact.deleted") {
    await softDeleteContact(db, id);
    return "deleted";
  }
  if (type !== "contact.created" && type !== "contact.updated") return "ignored";
  if (isFullObject(data, "contact")) {
    await upsertContacts(db, [data]);
    return "processed";
  }
  if (!zeffy) return "deferred";
  let res: { status: number; body: any };
  try {
    res = await zeffy.get(`/contacts/${encodeURIComponent(id)}`);
  } catch (e) {
    // The key cannot read contacts (401/403): acknowledge instead of making
    // Zeffy retry for three days; a contacts sync run catches up later.
    if (e instanceof Error && /^zeffy_http_4\d\d$/.test(e.message)) return "deferred";
    throw e;
  }
  if (res.status === 404) {
    await softDeleteContact(db, id);
    return "deleted";
  }
  await upsertContacts(db, [res.body]);
  return "processed";
}

// ── Shape probe ─────────────────────────────────────────────────

export async function probeShapes(zeffy: ZeffyGetter): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const ep of ["payments", "contacts", "campaigns"]) {
    try {
      const res = await zeffy.get(`/${ep}?limit=3`);
      const list = res.body || {};
      const rows: any[] = Array.isArray(list.data) ? list.data : [];
      const entry: Record<string, unknown> = {
        status: res.status,
        list_keys: Object.keys(list),
        has_more: list.has_more ?? null,
        has_next_cursor: !!list.next_cursor,
        returned: rows.length,
        item: rows.length ? shapeOf(rows[0]) : null,
      };
      if (rows[0]?.id) {
        const one = await zeffy.get(`/${ep}/${encodeURIComponent(rows[0].id)}`);
        entry.get_by_id_status = one.status;
      }
      out[ep] = entry;
    } catch (e) {
      out[ep] = { error: e instanceof Error ? e.message.slice(0, 80) : "error" };
    }
  }
  return out;
}
