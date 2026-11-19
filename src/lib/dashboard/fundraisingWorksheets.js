// Fundraising board worksheets (Fundraising module, one form per subcommittee).
//
// Storage: public.fundraising_worksheet_rows, contract in
// docs/fundraising-live/02-worksheets-contract.md. Every database call lives
// in the four functions below (loadWorksheetRows, saveWorksheetRow,
// deleteWorksheetRow, subscribeWorksheet), so a change of save path is a
// one-function change.
//
// Row model: a fixed row (row_key set) exists in the database only once
// someone has typed in it; until then the form shows the definition's
// defaults. Saves send only the fields a person changed, and the save RPC
// shallow-merges them into the stored row, so two people editing different
// fields of the same row do not overwrite each other.
//
// createWorksheetStore() owns the per-row draft, the debounced and
// serialised saves, and the realtime merge. It is a plain Svelte-style store
// (subscribe returns an unsubscribe) with no Svelte import, so the node test
// can drive it with a fake API.

import { HEADER_PART } from "../../data/fundraisingWorksheets.js";

export const WORKSHEET_TABLE = "fundraising_worksheet_rows";
export const WORKSHEET_SAVE_RPC = "fundraising_worksheet_save";
export const SAVE_DEBOUNCE_MS = 900;

const FILLABLE_KINDS = new Set(["table", "qa", "checklist"]);
const NUMBER_TYPES = new Set(["money", "count"]);

// ── Database access ─────────────────────────────────────────────

export function isMissingTableError(error) {
  if (!error) return false;
  if (["PGRST205", "42P01", "PGRST202", "42883"].includes(error.code)) return true;
  return /could not find the (table|function)|relation .* does not exist|function .* does not exist/i.test(
    String(error.message || ""),
  );
}

export function isForbiddenError(error) {
  if (!error) return false;
  if (error.code === "42501") return true;
  return /forbidden|permission denied/i.test(String(error.message || ""));
}

// { data: rows[], error, missing }
export async function loadWorksheetRows(supabase, { cycle, subcommittee }) {
  const { data, error } = await supabase
    .from(WORKSHEET_TABLE)
    .select("*")
    .eq("cycle", cycle)
    .eq("subcommittee", subcommittee)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { data: [], error, missing: isMissingTableError(error) };
  return { data: data || [], error: null, missing: false };
}

// p_row: { id?, cycle, subcommittee, section, row_key?, position?, data }.
// Returns { data: savedRow, error }.
export async function saveWorksheetRow(supabase, pRow) {
  const { data, error } = await supabase.rpc(WORKSHEET_SAVE_RPC, { p_row: pRow });
  if (error) return { data: null, error };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.id) return { data: null, error: { message: "The save did not return the row." } };
  return { data: row, error: null };
}

export async function deleteWorksheetRow(supabase, id) {
  const { error } = await supabase.from(WORKSHEET_TABLE).delete().eq("id", id);
  return { error: error || null };
}

export function subscribeWorksheet(supabase, { cycle, subcommittee }, onChange) {
  if (!supabase?.channel) return () => {};
  const channel = supabase
    .channel(`fundraising-worksheet-${subcommittee}-${cycle}-${Math.random().toString(36).slice(2, 10)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: WORKSHEET_TABLE, filter: `subcommittee=eq.${subcommittee}` },
      (payload) => onChange?.(payload),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export function supabaseWorksheetApi(supabase) {
  return {
    load: (scope) => loadWorksheetRows(supabase, scope),
    save: (pRow) => saveWorksheetRow(supabase, pRow),
    remove: (id) => deleteWorksheetRow(supabase, id),
    subscribe: (scope, onChange) => subscribeWorksheet(supabase, scope, onChange),
  };
}

// ── Definition lookup ───────────────────────────────────────────

export function fixedIdentity(section, rowKey) {
  return `f:${section}:${rowKey}`;
}

export function addedIdentity(id) {
  return `a:${id}`;
}

export function rowIdentity(row) {
  return row.row_key ? fixedIdentity(row.section, row.row_key) : addedIdentity(row.id);
}

export function isFillablePart(part) {
  return Boolean(part && FILLABLE_KINDS.has(part.kind) && part.key);
}

// Every part that stores rows, header first.
export function fillableParts(worksheet) {
  if (!worksheet) return [];
  const parts = [HEADER_PART];
  for (const section of worksheet.sections || []) {
    for (const part of section.parts || []) if (isFillablePart(part)) parts.push(part);
  }
  return parts;
}

export function findPart(worksheet, key) {
  return fillableParts(worksheet).find((part) => part.key === key) || null;
}

export const ADDED_ROW_DEF = Object.freeze({ key: null, cells: {} });

export function findRowDef(part, rowKey) {
  if (!part) return null;
  if (!rowKey) return ADDED_ROW_DEF;
  return (part.rows || []).find((row) => row.key === rowKey) || null;
}

function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

// A label column shows fixed text on rows that give a value for it.
export function isLabelCell(column, rowDef) {
  return Boolean(column.fixed && hasText(rowDef?.cells?.[column.key]));
}

// [{ key, label, type }] the person can type in for this row.
export function editableColumns(part, rowDef) {
  if (!part) return [];
  if (part.kind === "checklist") return [{ key: "checked", label: "Ready", type: "checkbox" }];
  return (part.columns || [])
    .filter((column) => !isLabelCell(column, rowDef))
    .map((column) => ({
      key: column.key,
      label: column.label,
      type: (!column.fixed && rowDef?.type) || column.type || "text",
    }));
}

// The fixed text for a row (question, month, scenario), or "".
export function rowLabel(part, rowDef) {
  if (!part || !rowDef) return "";
  if (part.kind === "checklist") return rowDef.label || "";
  const column = (part.columns || []).find((c) => isLabelCell(c, rowDef));
  return column ? String(rowDef.cells[column.key]) : "";
}

export function fieldDefault(rowDef, key, type) {
  if (type === "checkbox") return false;
  const value = rowDef?.cells?.[key];
  return value === undefined || value === null ? "" : String(value);
}

// ── Numbers ─────────────────────────────────────────────────────

// "$12,500" -> 12500, "" -> null. Same characters stripped as the backend's
// fundraising_parse_number ($, commas, spaces).
export function parseNumberInput(text, type = "money") {
  const raw = String(text ?? "").replace(/[\s$,]/g, "");
  if (raw === "") return { ok: true, value: null };
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(raw)) {
    return {
      ok: false,
      value: null,
      message: type === "count" ? "Enter a whole number, like 12." : "Enter a dollar amount, like 12,500.",
    };
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) return { ok: false, value: null, message: "That number is too large." };
  if (type === "count") {
    if (!Number.isInteger(value)) return { ok: false, value: null, message: "Enter a whole number, like 12." };
    return { ok: true, value };
  }
  return { ok: true, value: Math.round(value * 100) / 100 };
}

export function formatNumberValue(value, type) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (type === "money") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(n);
  }
  return n.toLocaleString("en-US");
}

// What the input shows for a stored value.
export function displayStored(value, type) {
  if (type === "checkbox") return value === true;
  if (NUMBER_TYPES.has(type)) return formatNumberValue(value, type);
  return value === undefined || value === null ? "" : String(value);
}

// What goes into data for a typed value: { ok, value, message }.
export function toStoredValue(input, type) {
  if (type === "checkbox") return { ok: true, value: input === true };
  if (NUMBER_TYPES.has(type)) return parseNumberInput(input, type);
  return { ok: true, value: String(input ?? "") };
}

function sameStored(a, b) {
  const norm = (v) => (v === undefined || v === "" ? null : v);
  return norm(a) === norm(b);
}

// ── Records and merge rules ─────────────────────────────────────

// A record is the form's view of one row:
//   { identity, section, rowKey, id, position, base, draft, state, error,
//     invalid, conflict, removing }
// base is the last database row we know of (null until it exists); draft
// holds only the fields typed here and not yet confirmed saved, as typed.
export function newRecord({ section, rowKey = null, id = null, position = 0 }) {
  return {
    identity: rowKey ? fixedIdentity(section, rowKey) : addedIdentity(id),
    section,
    rowKey,
    id,
    position,
    base: null,
    draft: {},
    state: "idle", // idle | pending | saving | saved | error | invalid | remove_error
    error: "",
    invalid: {},
    conflict: false,
    removing: false,
  };
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

// The value a field shows: the draft, else the stored value, else the default.
export function fieldValue(record, rowDef, column) {
  if (record && hasOwn(record.draft, column.key)) return record.draft[column.key];
  const data = record?.base?.data;
  if (hasOwn(data, column.key)) return displayStored(data[column.key], column.type);
  return column.type === "checkbox" ? false : fieldDefault(rowDef, column.key, column.type);
}

export function rowValues(part, rowDef, record) {
  const values = {};
  for (const column of editableColumns(part, rowDef)) values[column.key] = fieldValue(record, rowDef, column);
  return values;
}

// A row counts as filled when a person has put something in it: a checked
// box, or any field that is not blank and not just the prefilled value.
export function rowIsFilled(part, rowDef, values) {
  if (part?.kind === "checklist") return values?.checked === true;
  return editableColumns(part, rowDef).some((column) => {
    const value = values?.[column.key];
    if (!hasText(value)) return false;
    return String(value).trim() !== fieldDefault(rowDef, column.key, column.type).trim();
  });
}

// Added rows of a part, in display order.
export function addedRecords(records, partKey) {
  return Object.values(records || {})
    .filter((record) => record.section === partKey && !record.rowKey)
    .sort(
      (a, b) =>
        a.position - b.position ||
        String(a.base?.created_at || "").localeCompare(String(b.base?.created_at || "")) ||
        String(a.id).localeCompare(String(b.id)),
    );
}

export function partProgress(part, records) {
  if (!isFillablePart(part)) return { filled: 0, total: 0 };
  let filled = 0;
  let total = 0;
  for (const rowDef of part.rows || []) {
    total += 1;
    const record = records?.[fixedIdentity(part.key, rowDef.key)];
    if (rowIsFilled(part, rowDef, rowValues(part, rowDef, record))) filled += 1;
  }
  if (part.canAdd) {
    for (const record of addedRecords(records, part.key)) {
      total += 1;
      if (rowIsFilled(part, ADDED_ROW_DEF, rowValues(part, ADDED_ROW_DEF, record))) filled += 1;
    }
  }
  return { filled, total };
}

function addProgress(a, b) {
  return { filled: a.filled + b.filled, total: a.total + b.total };
}

export function sectionProgress(section, records) {
  return (section?.parts || [])
    .filter(isFillablePart)
    .reduce((sum, part) => addProgress(sum, partProgress(part, records)), { filled: 0, total: 0 });
}

export function worksheetProgress(worksheet, records) {
  return fillableParts(worksheet).reduce(
    (sum, part) => addProgress(sum, partProgress(part, records)),
    { filled: 0, total: 0 },
  );
}

export function progressLabel(progress) {
  return `${progress?.filled || 0} of ${progress?.total || 0} filled`;
}

// Postgres timestamps arrive as "2026-11-18T21:00:00.123+00:00" over REST
// and "2026-11-18 21:00:00.123456+00" over realtime.
export function timeValue(value) {
  if (!value) return NaN;
  const iso = String(value)
    .trim()
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d\d)$/, "$1:00");
  return Date.parse(iso);
}

export function isOlderRow(incoming, current) {
  if (!current) return false;
  const a = timeValue(incoming?.updated_at);
  const b = timeValue(current?.updated_at);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a < b;
}

// Merge a database row (realtime or load) into a record. Never touches the
// draft. Flags a conflict when someone else changed a field that is being
// edited here to something other than what is typed.
export function mergeIncomingRow(record, incoming, { profileId = null, columns = [] } = {}) {
  if (isOlderRow(incoming, record.base)) return record;
  const typesByKey = Object.fromEntries(columns.map((c) => [c.key, c.type]));
  const fromOther = !profileId || incoming.updated_by !== profileId;
  let conflict = record.conflict;
  if (fromOther && record.base) {
    for (const key of Object.keys(record.draft || {})) {
      const before = record.base?.data?.[key];
      const after = incoming.data?.[key];
      if (sameStored(before, after)) continue;
      const typed = toStoredValue(record.draft[key], typesByKey[key] || "text");
      if (typed.ok && sameStored(typed.value, after)) continue;
      conflict = true;
    }
  } else if (fromOther && !record.base && Object.keys(record.draft || {}).length) {
    // The row did not exist when this person started typing.
    for (const key of Object.keys(record.draft)) {
      const typed = toStoredValue(record.draft[key], typesByKey[key] || "text");
      if (hasOwn(incoming.data, key) && !(typed.ok && sameStored(typed.value, incoming.data[key]))) conflict = true;
    }
  }
  return {
    ...record,
    base: incoming,
    id: incoming.id,
    position: Number.isFinite(Number(incoming.position)) ? Number(incoming.position) : record.position,
    conflict,
  };
}

// The RPC payload for a record's draft. Invalid numbers stay in the draft
// and are left out of the save.
export function buildSavePayload(record, columns, { cycle, subcommittee }) {
  const typesByKey = Object.fromEntries(columns.map((c) => [c.key, c.type]));
  const data = {};
  const invalid = {};
  const snapshot = {};
  for (const [key, input] of Object.entries(record.draft || {})) {
    const stored = toStoredValue(input, typesByKey[key] || "text");
    if (!stored.ok) {
      invalid[key] = stored.message;
      continue;
    }
    data[key] = stored.value;
    snapshot[key] = input;
  }
  const pRow = {
    cycle,
    subcommittee,
    section: record.section,
    row_key: record.rowKey || null,
    position: record.position,
    data,
  };
  if (record.id) pRow.id = record.id;
  return { pRow, invalid, snapshot, empty: Object.keys(data).length === 0 };
}

// Drop draft fields that now match what is stored (after a save or on blur).
export function pruneDraft(draft, base, columns, { keep = [], onlyIfEqual = null } = {}) {
  const typesByKey = Object.fromEntries(columns.map((c) => [c.key, c.type]));
  const next = {};
  for (const [key, input] of Object.entries(draft || {})) {
    if (keep.includes(key)) {
      next[key] = input;
      continue;
    }
    if (onlyIfEqual && hasOwn(onlyIfEqual, key) && onlyIfEqual[key] !== input) {
      next[key] = input;
      continue;
    }
    const typed = toStoredValue(input, typesByKey[key] || "text");
    if (typed.ok && sameStored(typed.value, base?.data?.[key])) continue;
    next[key] = input;
  }
  return next;
}

function friendlyError(error) {
  if (isForbiddenError(error)) return "Your account cannot edit worksheets.";
  if (isMissingTableError(error)) return "Worksheets are not set up yet.";
  const message = String(error?.message || "");
  if (/fetch|network|failed to/i.test(message)) return "No connection.";
  return message || "Something went wrong.";
}

function newId() {
  return globalThis.crypto.randomUUID();
}

// ── Store ───────────────────────────────────────────────────────

export function createWorksheetStore({
  supabase = null,
  api = null,
  worksheet,
  subcommitteeId,
  cycle,
  profileId = null,
  debounceMs = SAVE_DEBOUNCE_MS,
}) {
  const io = api || supabaseWorksheetApi(supabase);
  const scope = { cycle, subcommittee: subcommitteeId };
  const parts = fillableParts(worksheet);
  const partsByKey = Object.fromEntries(parts.map((part) => [part.key, part]));

  let state = { status: "loading", message: "", forbidden: false, records: initialRecords() };
  const subscribers = new Set();
  const timers = new Map();
  const inflight = new Map();
  const again = new Set();
  let focused = null; // { identity, key }
  let unsubscribeRealtime = null;
  let destroyed = false;

  function initialRecords() {
    const records = {};
    for (const part of parts) {
      (part.rows || []).forEach((rowDef, index) => {
        const record = newRecord({ section: part.key, rowKey: rowDef.key, position: index });
        records[record.identity] = record;
      });
    }
    return records;
  }

  function emit() {
    for (const fn of subscribers) fn(state);
  }

  function set(next) {
    state = { ...state, ...next };
    emit();
  }

  function patch(identity, changes) {
    const prev = state.records[identity];
    if (!prev) return;
    state = { ...state, records: { ...state.records, [identity]: { ...prev, ...changes } } };
    emit();
  }

  function drop(identity) {
    if (!state.records[identity]) return;
    const records = { ...state.records };
    delete records[identity];
    state = { ...state, records };
    emit();
  }

  function columnsFor(record) {
    const part = partsByKey[record?.section];
    return editableColumns(part, findRowDef(part, record?.rowKey));
  }

  function applyRow(row) {
    if (!row || row.cycle !== cycle || row.subcommittee !== subcommitteeId) return;
    const part = partsByKey[row.section];
    if (!part) return;
    if (row.row_key && !findRowDef(part, row.row_key)) return;
    if (!row.row_key && !part.canAdd) return;
    const identity = rowIdentity(row);
    let record = state.records[identity];
    if (!record) {
      record = newRecord({ section: row.section, rowKey: row.row_key || null, id: row.id, position: row.position });
    }
    const merged = mergeIncomingRow(record, row, { profileId, columns: columnsFor(record) });
    if (merged === record && state.records[identity]) return;
    state = { ...state, records: { ...state.records, [identity]: merged } };
    emit();
  }

  function applyRemote(payload) {
    if (destroyed || !payload) return;
    const type = payload.eventType || payload.type;
    if (type === "DELETE") {
      const id = payload.old?.id;
      if (!id) return;
      const record = Object.values(state.records).find((r) => r.id === id);
      if (!record) return;
      if (Object.keys(record.draft).length || inflight.has(record.identity)) {
        // Keep what is typed; the next save puts the row back.
        patch(record.identity, { base: null, conflict: true });
      } else if (record.rowKey) {
        patch(record.identity, { base: null, id: null, state: "idle" });
      } else {
        drop(record.identity);
      }
      return;
    }
    applyRow(payload.new);
  }

  async function load() {
    if (destroyed) return;
    set({ status: state.status === "ready" ? "ready" : "loading", message: "" });
    if (!unsubscribeRealtime) unsubscribeRealtime = io.subscribe(scope, applyRemote) || (() => {});
    const result = await io.load(scope);
    if (destroyed) return;
    if (result.error) {
      set({
        status: result.missing ? "missing" : "error",
        message: result.missing ? "" : friendlyError(result.error),
      });
      return;
    }
    for (const row of result.data || []) applyRow(row);
    set({ status: "ready" });
  }

  function schedule(identity) {
    clearTimeout(timers.get(identity));
    timers.set(
      identity,
      setTimeout(() => {
        timers.delete(identity);
        // Someone else changed this row: wait for "Keep mine" or "Use theirs".
        if (state.records[identity]?.conflict) {
          patch(identity, { state: "idle" });
          return;
        }
        flush(identity);
      }, debounceMs),
    );
  }

  function flush(identity) {
    clearTimeout(timers.get(identity));
    timers.delete(identity);
    if (inflight.has(identity)) {
      again.add(identity);
      return inflight.get(identity);
    }
    const promise = run(identity).finally(() => inflight.delete(identity));
    inflight.set(identity, promise);
    return promise;
  }

  async function run(identity) {
    let record = state.records[identity];
    if (!record || record.removing) return;
    const columns = columnsFor(record);
    const { pRow, invalid, snapshot, empty } = buildSavePayload(record, columns, scope);
    const hasInvalid = Object.keys(invalid).length > 0;
    if (empty) {
      patch(identity, { invalid, state: hasInvalid ? "invalid" : record.state === "pending" ? "idle" : record.state });
      return;
    }
    patch(identity, { invalid, state: "saving", error: "" });
    const result = await io.save(pRow);
    record = state.records[identity];
    if (!record) return;
    if (result.error) {
      again.delete(identity);
      if (isForbiddenError(result.error)) set({ forbidden: true });
      patch(identity, { state: "error", error: friendlyError(result.error) });
      return;
    }
    const saved = result.data;
    const base = isOlderRow(saved, record.base) ? record.base : saved;
    const keep = focused?.identity === identity && NUMBER_TYPES.has(columns.find((c) => c.key === focused.key)?.type)
      ? [focused.key]
      : [];
    const draft = pruneDraft(record.draft, saved, columns, { keep, onlyIfEqual: snapshot });
    const stillInvalid = Object.keys(record.invalid || {}).length > 0;
    patch(identity, {
      base,
      id: saved.id,
      draft,
      conflict: false,
      state: stillInvalid ? "invalid" : again.has(identity) || timers.has(identity) ? "pending" : "saved",
      error: "",
    });
    if (again.has(identity)) {
      again.delete(identity);
      await run(identity);
    }
  }

  function setField(identity, key, value) {
    const record = state.records[identity];
    if (!record || destroyed) return;
    const invalid = { ...record.invalid };
    delete invalid[key];
    patch(identity, { draft: { ...record.draft, [key]: value }, invalid, state: "pending" });
    schedule(identity);
  }

  function focus(identity, key) {
    focused = { identity, key };
  }

  async function blur(identity, key) {
    if (focused?.identity === identity && focused?.key === key) focused = null;
    const record = state.records[identity];
    if (!record || record.conflict) return;
    if (timers.has(identity) || Object.keys(record.draft).length) await flush(identity);
    const after = state.records[identity];
    if (!after || after.state === "error" || after.state === "saving" || timers.has(identity)) return;
    const keepInvalid = Object.keys(after.invalid || {});
    const draft = pruneDraft(after.draft, after.base, columnsFor(after), { keep: keepInvalid });
    if (Object.keys(draft).length !== Object.keys(after.draft).length) patch(identity, { draft });
  }

  // Retry a failed save, or keep this person's text over someone else's change.
  function retry(identity) {
    if (state.records[identity]?.conflict) patch(identity, { conflict: false });
    return flush(identity);
  }

  // Discard this person's draft for the row and show what is stored.
  function reloadRow(identity) {
    clearTimeout(timers.get(identity));
    timers.delete(identity);
    patch(identity, { draft: {}, invalid: {}, conflict: false, state: "idle", error: "" });
  }

  function addRow(partKey) {
    const part = partsByKey[partKey];
    if (!part?.canAdd || destroyed) return null;
    const positions = Object.values(state.records)
      .filter((r) => r.section === partKey)
      .map((r) => Number(r.position) || 0);
    const position = Math.max((part.rows || []).length - 1, ...positions) + 1;
    const record = newRecord({ section: partKey, id: newId(), position });
    state = { ...state, records: { ...state.records, [record.identity]: record } };
    emit();
    return record.identity;
  }

  async function removeRow(identity) {
    const record = state.records[identity];
    if (!record || record.rowKey) return;
    clearTimeout(timers.get(identity));
    timers.delete(identity);
    patch(identity, { removing: true, error: "" });
    if (inflight.has(identity)) await inflight.get(identity).catch(() => {});
    const current = state.records[identity];
    if (!current) return;
    if (!current.base) {
      drop(identity);
      return;
    }
    const { error } = await io.remove(current.id);
    if (error) {
      if (isForbiddenError(error)) set({ forbidden: true });
      patch(identity, { removing: false, state: "remove_error", error: friendlyError(error) });
      return;
    }
    drop(identity);
  }

  // everything: also rows paused on a conflict or a failed save (used when
  // the form goes away, so typed text is sent rather than dropped).
  function flushAll({ everything = false } = {}) {
    const identities = new Set([
      ...[...timers.keys()].filter((identity) => everything || !state.records[identity]?.conflict),
      ...Object.values(state.records)
        .filter(
          (r) =>
            Object.keys(r.draft).length &&
            (everything || (r.state !== "error" && r.state !== "invalid" && !r.conflict)),
        )
        .map((r) => r.identity),
    ]);
    return Promise.all([...identities].map((identity) => flush(identity)));
  }

  function hasUnsaved() {
    return Object.values(state.records).some(
      (r) => timers.has(r.identity) || inflight.has(r.identity) || Object.keys(r.draft).length > 0,
    );
  }

  function subscribe(fn) {
    subscribers.add(fn);
    fn(state);
    return () => subscribers.delete(fn);
  }

  // Unsubscribes realtime; saves already typed still go out.
  function destroy() {
    if (destroyed) return Promise.resolve();
    const pending = flushAll({ everything: true });
    destroyed = true;
    unsubscribeRealtime?.();
    unsubscribeRealtime = null;
    return pending;
  }

  return {
    subscribe,
    load,
    setField,
    focus,
    blur,
    retry,
    reloadRow,
    addRow,
    removeRow,
    flushAll,
    hasUnsaved,
    applyRemote,
    destroy,
    getState: () => state,
  };
}
