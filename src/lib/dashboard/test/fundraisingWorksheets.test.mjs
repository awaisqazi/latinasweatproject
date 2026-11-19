// Fundraising worksheets · logic tests.  node src/lib/dashboard/test/fundraisingWorksheets.test.mjs
//
// Pins the definitions (keys unique and stable, size_share shape the board
// roll-up reads), number parsing, defaults merging, progress counting, the
// realtime merge rules, and the store's save behaviour against a fake API:
// debounce, serialised saves, retry keeping the typed text, and a remote
// change to the row being typed in.

import assert from "node:assert/strict";
import {
  FUNDRAISING_WORKSHEETS,
  GROUND_RULES,
  HEADER_PART,
  getWorksheet,
} from "../../../data/fundraisingWorksheets.js";
import {
  ADDED_ROW_DEF,
  buildSavePayload,
  createWorksheetStore,
  editableColumns,
  fieldValue,
  fillableParts,
  findPart,
  findRowDef,
  fixedIdentity,
  formatNumberValue,
  isMissingTableError,
  isOlderRow,
  mergeIncomingRow,
  newRecord,
  parseNumberInput,
  partProgress,
  progressLabel,
  pruneDraft,
  rowIsFilled,
  rowLabel,
  rowValues,
  sectionProgress,
  timeValue,
  worksheetProgress,
} from "../fundraisingWorksheets.js";

let passed = 0;
const queue = [];
function test(name, fn) {
  queue.push([name, fn]);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function dbRow(over = {}) {
  return {
    id: over.id || "row-" + Math.random().toString(36).slice(2, 8),
    cycle: "2027",
    subcommittee: "events",
    section: "size_share",
    row_key: "realistic",
    position: 1,
    data: {},
    created_by: OTHER,
    updated_by: OTHER,
    created_at: "2026-11-18T20:00:00.000+00:00",
    updated_at: "2026-11-18T20:00:00.000+00:00",
    ...over,
  };
}

// Fake API: saves resolve when the test says so, in order.
function fakeApi({ rows = [], loadError = null } = {}) {
  const calls = [];
  const pending = [];
  let listener = null;
  let clock = Date.parse("2026-11-18T21:00:00Z");
  const stored = new Map();
  return {
    calls,
    pending,
    emit: (payload) => listener?.(payload),
    api: {
      load: async () => (loadError ? { data: [], error: loadError, missing: isMissingTableError(loadError) } : { data: rows, error: null }),
      subscribe: (_scope, fn) => {
        listener = fn;
        return () => (listener = null);
      },
      remove: async (id) => {
        calls.push({ remove: id });
        return { error: null };
      },
      save: (pRow) =>
        new Promise((resolve) => {
          calls.push(pRow);
          pending.push({
            pRow,
            ok: () => {
              const key = pRow.id || `${pRow.section}:${pRow.row_key}`;
              const prev = stored.get(key) || dbRow({ id: pRow.id || `id-${key}`, section: pRow.section, row_key: pRow.row_key, data: {} });
              clock += 1000;
              const next = { ...prev, data: { ...prev.data, ...pRow.data }, updated_by: ME, updated_at: new Date(clock).toISOString() };
              stored.set(key, next);
              resolve({ data: next, error: null });
            },
            fail: (error = { message: "Failed to fetch" }) => resolve({ data: null, error }),
          });
        }),
    },
  };
}

// ── Definitions ─────────────────────────────────────────────────

test("every subcommittee has a worksheet with unique, snake_case keys", () => {
  for (const id of ["events", "grants", "donors", "upskilling"]) {
    const ws = getWorksheet(id);
    assert.ok(ws, id);
    const parts = fillableParts(ws);
    assert.equal(parts[0], HEADER_PART, "header first");
    const partKeys = parts.map((p) => p.key);
    assert.equal(new Set(partKeys).size, partKeys.length, `${id} part keys unique`);
    for (const part of parts) {
      assert.match(part.key, /^[a-z][a-z0-9_]*$/, part.key);
      const rowKeys = part.rows.map((r) => r.key);
      assert.equal(new Set(rowKeys).size, rowKeys.length, `${id}.${part.key} row keys unique`);
      for (const key of rowKeys) assert.match(key, /^[a-z][a-z0-9_]*$/, `${part.key}.${key}`);
      const columnKeys = (part.columns || []).map((c) => c.key);
      assert.equal(new Set(columnKeys).size, columnKeys.length);
    }
  }
  assert.equal(getWorksheet("nope"), null);
});

test("size_share matches the roll-up contract", () => {
  for (const id of ["events", "grants", "donors"]) {
    const part = findPart(getWorksheet(id), "size_share");
    assert.deepEqual(part.rows.map((r) => r.key), ["low", "realistic", "stretch"], id);
    const cols = editableColumns(part, part.rows[0]);
    assert.deepEqual(cols.map((c) => [c.key, c.type]), [["amount", "money"], ["assumption", "long"]], id);
  }
  const up = findPart(getWorksheet("upskilling"), "size_share");
  assert.deepEqual(up.rows.map((r) => r.key), ["people_trained", "made_ask", "introductions", "employer_matches"]);
  assert.deepEqual(
    editableColumns(up, up.rows[0]).map((c) => [c.key, c.type]),
    [["low", "count"], ["realistic", "count"], ["stretch", "count"]],
  );
  for (const ws of Object.values(FUNDRAISING_WORKSHEETS)) {
    assert.equal(ws.sections.filter((s) => s.share).length, 1, `${ws.id} has one share section`);
    assert.equal(ws.sections.find((s) => s.share).key, "size_share");
  }
});

test("copy has no em-dashes and says 'this dashboard'", () => {
  const blob = JSON.stringify(FUNDRAISING_WORKSHEETS) + JSON.stringify(GROUND_RULES);
  assert.equal(blob.includes(String.fromCharCode(0x2014)), false);
  assert.equal(/Fundraising tab of the admin dashboard/.test(blob), false);
  assert.ok(GROUND_RULES.includes("Past results per campaign are in this dashboard."));
});

test("prefilled values and fixed labels", () => {
  const part = findPart(getWorksheet("events"), "events_2026");
  const gala = findRowDef(part, "gala_2026");
  assert.equal(rowLabel(part, gala), "Gala 2026");
  assert.deepEqual(editableColumns(part, gala).map((c) => c.key), ["when", "raised", "cost", "attendance", "repeat"]);
  // The blank last row lets people type the event name.
  assert.equal(editableColumns(part, findRowDef(part, "row_1"))[0].key, "event");
  const raised = editableColumns(part, gala)[1];
  assert.equal(fieldValue(null, gala, raised), "$71,132.50 (as of Sept 26)");
  const rec = { ...newRecord({ section: "events_2026", rowKey: "gala_2026" }), base: dbRow({ data: { raised: "" } }) };
  assert.equal(fieldValue(rec, gala, raised), "", "a cleared default stays cleared");
  assert.equal(fieldValue({ ...rec, draft: { raised: "$80,000" } }, gala, raised), "$80,000");
  const header = HEADER_PART;
  assert.equal(editableColumns(header, findRowDef(header, "date"))[0].type, "date");
});

// ── Numbers ─────────────────────────────────────────────────────

test("number parsing accepts dollar typing and stores numbers", () => {
  assert.deepEqual(parseNumberInput("$12,500"), { ok: true, value: 12500 });
  assert.deepEqual(parseNumberInput(" 12 500.505 "), { ok: true, value: 12500.51 });
  assert.deepEqual(parseNumberInput(""), { ok: true, value: null });
  assert.equal(parseNumberInput("about 5k").ok, false);
  assert.equal(parseNumberInput("1.5", "count").ok, false);
  assert.deepEqual(parseNumberInput("1,200", "count"), { ok: true, value: 1200 });
  assert.equal(formatNumberValue(12500, "money"), "$12,500");
  assert.equal(formatNumberValue(12500.5, "money"), "$12,500.50");
  assert.equal(formatNumberValue(1200, "count"), "1,200");
  assert.equal(formatNumberValue(null, "money"), "");
});

test("save payload sends only typed fields, numbers as numbers", () => {
  const part = findPart(getWorksheet("events"), "size_share");
  const cols = editableColumns(part, part.rows[1]);
  const rec = { ...newRecord({ section: "size_share", rowKey: "realistic", position: 1 }), draft: { amount: "$25,000" } };
  const { pRow, empty, invalid } = buildSavePayload(rec, cols, { cycle: "2027", subcommittee: "events" });
  assert.equal(empty, false);
  assert.deepEqual(invalid, {});
  assert.deepEqual(pRow, {
    cycle: "2027",
    subcommittee: "events",
    section: "size_share",
    row_key: "realistic",
    position: 1,
    data: { amount: 25000 },
  });
  const cleared = buildSavePayload({ ...rec, draft: { amount: "" } }, cols, { cycle: "2027", subcommittee: "events" });
  assert.equal(cleared.pRow.data.amount, null, "clearing sends null");
  const bad = buildSavePayload({ ...rec, draft: { amount: "lots", assumption: "x" } }, cols, { cycle: "2027", subcommittee: "events" });
  assert.deepEqual(bad.pRow.data, { assumption: "x" });
  assert.ok(bad.invalid.amount);
  const added = buildSavePayload({ ...newRecord({ section: "pipeline", id: "abc", position: 9 }), draft: { funder: "F" } }, [{ key: "funder", type: "text" }], { cycle: "2027", subcommittee: "grants" });
  assert.equal(added.pRow.id, "abc");
  assert.equal(added.pRow.row_key, null);
});

// ── Progress ────────────────────────────────────────────────────

test("progress counts real entries, not prefilled values", () => {
  const ws = getWorksheet("events");
  const part = findPart(ws, "events_2026");
  assert.deepEqual(partProgress(part, {}), { filled: 0, total: 8 }, "defaults are not filled");
  const records = {
    [fixedIdentity("events_2026", "gala_2026")]: { ...newRecord({ section: "events_2026", rowKey: "gala_2026" }), draft: { cost: "$9,000" } },
  };
  assert.deepEqual(partProgress(part, records), { filled: 1, total: 8 });
  const addedId = "a:x1";
  records[addedId] = { ...newRecord({ section: "events_2026", id: "x1", position: 20 }) };
  assert.deepEqual(partProgress(part, records), { filled: 1, total: 9 }, "added blank row counts in the total");
  records[addedId] = { ...records[addedId], draft: { event: "Bike ride" } };
  assert.equal(progressLabel(partProgress(part, records)), "2 of 9 filled");

  const grants = getWorksheet("grants");
  const docs = findPart(grants, "documents");
  const checked = {
    [fixedIdentity("documents", "form_990")]: { ...newRecord({ section: "documents", rowKey: "form_990" }), base: dbRow({ data: { checked: true } }) },
  };
  assert.equal(rowIsFilled(docs, findRowDef(docs, "form_990"), rowValues(docs, findRowDef(docs, "form_990"), checked[fixedIdentity("documents", "form_990")])), true);
  assert.deepEqual(sectionProgress(grants.sections[0], checked), { filled: 1, total: 12 }, "five questions plus seven documents");
  const whole = worksheetProgress(grants, checked);
  assert.equal(whole.filled, 1);
  assert.ok(whole.total > 30);
  assert.equal(rowIsFilled(docs, ADDED_ROW_DEF, { checked: false }), false);
});

// ── Realtime merge rules ────────────────────────────────────────

test("timestamps from REST and realtime compare", () => {
  assert.equal(timeValue("2026-11-18 21:00:00.123456+00"), Date.parse("2026-11-18T21:00:00.123Z"));
  assert.equal(isOlderRow({ updated_at: "2026-11-18 20:59:00+00" }, { updated_at: "2026-11-18T21:00:00+00:00" }), true);
  assert.equal(isOlderRow({ updated_at: "bad" }, { updated_at: "2026-11-18T21:00:00Z" }), false);
});

test("remote change to the row being typed in keeps the draft and flags it", () => {
  const cols = [{ key: "amount", type: "money" }, { key: "assumption", type: "long" }];
  const base = dbRow({ data: { amount: 1000, assumption: "a" } });
  const rec = { ...newRecord({ section: "size_share", rowKey: "realistic" }), base, draft: { amount: "2,000" } };
  const theirs = dbRow({ id: base.id, data: { amount: 5000, assumption: "a" }, updated_at: "2026-11-18T20:05:00Z" });
  const merged = mergeIncomingRow(rec, theirs, { profileId: ME, columns: cols });
  assert.equal(merged.draft.amount, "2,000", "draft untouched");
  assert.equal(merged.conflict, true);
  assert.equal(merged.base, theirs);

  const otherField = dbRow({ id: base.id, data: { amount: 1000, assumption: "b" }, updated_at: "2026-11-18T20:05:00Z" });
  const quiet = mergeIncomingRow(rec, otherField, { profileId: ME, columns: cols });
  assert.equal(quiet.conflict, false, "a different field merges in silently");
  assert.equal(fieldValue(quiet, ADDED_ROW_DEF, cols[1]), "b");

  const echo = dbRow({ id: base.id, data: { amount: 2000 }, updated_by: ME, updated_at: "2026-11-18T20:05:00Z" });
  assert.equal(mergeIncomingRow(rec, echo, { profileId: ME, columns: cols }).conflict, false, "own echo");

  const stale = dbRow({ id: base.id, data: { amount: 1 }, updated_at: "2026-11-18T19:00:00Z" });
  assert.equal(mergeIncomingRow(rec, stale, { profileId: ME, columns: cols }), rec, "older rows are ignored");
});

test("pruneDraft drops fields the database now holds", () => {
  const cols = [{ key: "amount", type: "money" }, { key: "assumption", type: "long" }];
  const saved = dbRow({ data: { amount: 2000, assumption: "x" } });
  assert.deepEqual(pruneDraft({ amount: "$2,000", assumption: "x" }, saved, cols), {});
  assert.deepEqual(pruneDraft({ amount: "$2,000" }, saved, cols, { keep: ["amount"] }), { amount: "$2,000" });
  assert.deepEqual(pruneDraft({ assumption: "xy" }, saved, cols, { onlyIfEqual: { assumption: "x" } }), { assumption: "xy" });
});

// ── Store ───────────────────────────────────────────────────────

function makeStore(fake, id = "events") {
  return createWorksheetStore({
    api: fake.api,
    worksheet: getWorksheet(id),
    subcommitteeId: id,
    cycle: "2027",
    profileId: ME,
    debounceMs: 10,
  });
}

test("store: missing table shows the quiet state", async () => {
  const fake = fakeApi({ loadError: { code: "PGRST205", message: "Could not find the table" } });
  const store = makeStore(fake);
  await store.load();
  assert.equal(store.getState().status, "missing");
  store.destroy();
});

test("store: loads saved rows over the defaults and ignores other cycles", async () => {
  const fake = fakeApi({
    rows: [
      dbRow({ row_key: "low", data: { amount: 9000 } }),
      dbRow({ row_key: "low", cycle: "2028", section: "size_share", data: { amount: 1 } }),
      dbRow({ id: "added-1", section: "hosted_events", row_key: null, position: 4, data: { event: "Block party" } }),
    ],
  });
  const store = makeStore(fake);
  await store.load();
  const s = store.getState();
  assert.equal(s.status, "ready");
  assert.equal(s.records[fixedIdentity("size_share", "low")].base.data.amount, 9000);
  assert.equal(s.records["a:added-1"].base.data.event, "Block party");
  store.destroy();
});

test("store: debounced, serialised saves; newer text is never overwritten", async () => {
  const fake = fakeApi();
  const store = makeStore(fake);
  await store.load();
  const id = fixedIdentity("size_share", "realistic");
  store.setField(id, "amount", "$1");
  store.setField(id, "amount", "$12");
  assert.equal(store.getState().records[id].state, "pending");
  await wait(25);
  assert.equal(fake.calls.length, 1, "debounced into one save");
  assert.equal(fake.calls[0].data.amount, 12);
  assert.equal(store.getState().records[id].state, "saving");
  store.setField(id, "amount", "$12,500");
  await wait(25);
  assert.equal(fake.calls.length, 1, "second save waits for the first");
  fake.pending[0].ok();
  await wait(5);
  assert.equal(fake.calls.length, 2);
  assert.equal(fake.calls[1].data.amount, 12500);
  assert.equal(fake.calls[1].id, "id-size_share:realistic", "second save carries the row id");
  assert.equal(store.getState().records[id].draft.amount, "$12,500", "draft kept while the newer save runs");
  fake.pending[1].ok();
  await wait(5);
  const rec = store.getState().records[id];
  assert.equal(rec.state, "saved");
  assert.deepEqual(rec.draft, {});
  assert.equal(rec.base.data.amount, 12500);
  store.destroy();
});

test("store: failed save keeps the text and Retry sends it", async () => {
  const fake = fakeApi();
  const store = makeStore(fake);
  await store.load();
  const id = fixedIdentity("questions", "grow_most");
  store.setField(id, "answer", "Sweat Fest");
  // Blur flushes at once instead of waiting for the debounce.
  const flushing = store.blur(id, "answer");
  await wait(1);
  assert.equal(fake.calls.length, 1);
  fake.pending[0].fail();
  await flushing;
  await wait(5);
  let rec = store.getState().records[id];
  assert.equal(rec.state, "error");
  assert.equal(rec.error, "No connection.");
  assert.equal(rec.draft.answer, "Sweat Fest");
  const retrying = store.retry(id);
  await wait(1);
  fake.pending[1].ok();
  await retrying;
  rec = store.getState().records[id];
  assert.equal(rec.state, "saved");
  assert.equal(rec.base.data.answer, "Sweat Fest");
  store.destroy();
});

test("store: realtime change from someone else keeps the local draft", async () => {
  const fake = fakeApi({ rows: [dbRow({ id: "r1", row_key: "low", data: { amount: 100, assumption: "old" } })] });
  const store = makeStore(fake);
  await store.load();
  const low = fixedIdentity("size_share", "low");
  const stretch = fixedIdentity("size_share", "stretch");
  store.setField(low, "assumption", "mine");
  fake.emit({ eventType: "UPDATE", new: dbRow({ id: "r1", row_key: "low", data: { amount: 100, assumption: "theirs" }, updated_at: "2026-11-18T20:10:00Z" }) });
  fake.emit({ eventType: "INSERT", new: dbRow({ id: "r2", row_key: "stretch", data: { amount: 900 }, updated_at: "2026-11-18T20:10:00Z" }) });
  let s = store.getState();
  assert.equal(s.records[low].draft.assumption, "mine");
  assert.equal(s.records[low].conflict, true);
  assert.equal(s.records[stretch].base.data.amount, 900, "other rows merge in");
  await wait(25);
  assert.equal(fake.calls.length, 0, "autosave pauses on a conflict");
  await store.blur(low, "assumption");
  assert.equal(fake.calls.length, 0, "blur does not overwrite theirs either");
  store.reloadRow(low);
  s = store.getState();
  assert.equal(s.records[low].conflict, false);
  assert.equal(fieldValue(s.records[low], ADDED_ROW_DEF, { key: "assumption", type: "long" }), "theirs");
  await wait(20);
  assert.equal(fake.calls.length, 0, "reloading cancels the pending save");
  store.destroy();
});

test("store: Keep mine saves over a conflict", async () => {
  const fake = fakeApi({ rows: [dbRow({ id: "r1", row_key: "low", data: { assumption: "old" } })] });
  const store = makeStore(fake);
  await store.load();
  const low = fixedIdentity("size_share", "low");
  store.setField(low, "assumption", "mine");
  fake.emit({ eventType: "UPDATE", new: dbRow({ id: "r1", row_key: "low", data: { assumption: "theirs" }, updated_at: "2026-11-18T20:10:00Z" }) });
  const saving = store.retry(low);
  await wait(1);
  assert.deepEqual(fake.calls[0].data, { assumption: "mine" });
  fake.pending[0].ok();
  await saving;
  const rec = store.getState().records[low];
  assert.equal(rec.conflict, false);
  assert.equal(rec.state, "saved");
  store.destroy();
});

test("store: add and remove rows", async () => {
  const fake = fakeApi();
  const store = makeStore(fake, "grants");
  await store.load();
  assert.equal(store.addRow("needs"), null, "fixed tables cannot add rows");
  const a = store.addRow("pipeline");
  const b = store.addRow("pipeline");
  const s = store.getState();
  assert.ok(s.records[b].position > s.records[a].position);
  assert.ok(s.records[a].position >= 6, "after the six blank rows");
  await store.removeRow(a);
  assert.equal(store.getState().records[a], undefined, "unsaved row removed locally");
  assert.equal(fake.calls.length, 0);
  store.setField(b, "funder", "Community Trust");
  await wait(20);
  fake.pending[0].ok();
  await wait(5);
  await store.removeRow(b);
  assert.deepEqual(fake.calls.at(-1), { remove: store.getState().records[b]?.id ?? fake.calls[0].id });
  assert.equal(store.getState().records[b], undefined);
  fake.emit({ eventType: "INSERT", new: dbRow({ id: "z9", subcommittee: "grants", section: "pipeline", row_key: null, position: 50, data: { funder: "X" } }) });
  assert.ok(store.getState().records["a:z9"]);
  fake.emit({ eventType: "DELETE", old: { id: "z9" } });
  assert.equal(store.getState().records["a:z9"], undefined);
  store.destroy();
});

test("store: destroy flushes typed text", async () => {
  const fake = fakeApi();
  const store = makeStore(fake);
  await store.load();
  store.setField(fixedIdentity("header", "members"), "value", "Ana, Bea");
  assert.equal(store.hasUnsaved(), true);
  store.destroy();
  assert.equal(fake.calls.length, 1);
  assert.deepEqual(fake.calls[0].data, { value: "Ana, Bea" });
  assert.equal(fake.calls[0].section, "header");
});

for (const [name, fn] of queue) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}
console.log(`\n${passed} tests passed`);
