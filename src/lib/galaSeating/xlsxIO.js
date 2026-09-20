// Gala Seating planner: file input and output. Owned by the import/export agent.
//
// PRIVACY: everything here runs in the planner's browser. Files are parsed with
// SheetJS on this device, nothing is uploaded, and no guest data is ever written
// to disk except by an explicit download the planner asks for.
//
// SheetJS (~1 MB) is pulled in with a dynamic import so the /galaseating bundle
// stays small until someone actually opens a workbook.
//
// The detection half of this file is pure and DOM free on purpose, so it can be
// exercised from node against the real spreadsheets without a browser.

/* ------------------------------------------------------------------ reading */

const SPREADSHEET_RE = /\.(xlsx|xlsm|xlsb|xls|csv|tsv)$/i;
const JSON_RE = /\.json$/i;
const TEXT_RE = /\.(csv|tsv|txt)$/i;

export function isSpreadsheetFile(file) {
  return !!file && SPREADSHEET_RE.test(file.name || "");
}

export function isPlanFile(file) {
  return !!file && JSON_RE.test(file.name || "");
}

/** Cells come back as strings, numbers, booleans or ISO date strings. */
function normalizeCell(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (value === null || value === undefined) return "";
  return value;
}

/**
 * Read one .xlsx/.xls/.csv file into arrays of arrays, header row included.
 * @param {File|Blob} file
 * @returns {Promise<{ name: string, sheets: Object<string, any[][]> }>}
 */
export async function readWorkbookFile(file) {
  if (!file) throw new Error("No file to read.");
  const XLSX = await import("xlsx");
  const name = file.name || "workbook";

  let workbook;
  try {
    if (TEXT_RE.test(name)) {
      const text = await readTextFile(file);
      workbook = XLSX.read(text, { type: "string", cellDates: true, raw: false });
    } else {
      const buffer = await file.arrayBuffer();
      workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
    }
  } catch (err) {
    throw new Error(`"${name}" could not be opened as a spreadsheet. ${String(err && err.message ? err.message : err)}`);
  }

  const sheets = {};
  for (const sheetName of workbook.SheetNames || []) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: false });
    sheets[sheetName] = rows.map((row) => (Array.isArray(row) ? row.map(normalizeCell) : []));
  }
  if (!Object.keys(sheets).length) throw new Error(`"${name}" has no sheets in it.`);
  return { name, sheets };
}

/** Read any text file (a plan .json, a .csv) as a string. */
export function readTextFile(file) {
  if (!file) return Promise.reject(new Error("No file to read."));
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("The file could not be read."));
    reader.readAsText(file);
  });
}

/* ---------------------------------------------------------------- detection */

/**
 * Fold a header cell down to something comparable: lowercase, accents removed,
 * curly and straight apostrophes treated alike, punctuation turned into spaces.
 * "Purchaser's name" and "Purchaser’s name" both become "purchaser s name",
 * which is deliberately NOT the same as the overrides tab's "purchaser name".
 */
export function normalizeHeader(cell) {
  return String(cell === null || cell === undefined ? "" : cell)
    .replace(/[‘’ʼ′']/g, "'")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** How far down a sheet we look for the real header row (some tabs open with a banner). */
const HEADER_SCAN_ROWS = 6;

const KIND_LABELS = {
  tickets: "Ticket export",
  meals: "Dinner selections",
  overrides: "Overrides",
};

/** The columns we look for, shown to the planner when nothing is recognised. */
export const EXPECTED_HEADERS = {
  tickets: ["Buyer email", "Ticket type", "Ticket number"],
  meals: ["Guest Name", "Dinner selection (or Entrée / Meal)"],
  overrides: ["Purchaser name", "Buyer email", "no Ticket number column"],
};

export function kindLabel(kind) {
  return KIND_LABELS[kind] || kind;
}

/**
 * Classify a single candidate header row.
 * @returns {"tickets"|"meals"|"overrides"|null}
 */
export function classifyHeaderRow(row) {
  if (!Array.isArray(row)) return null;
  const headers = row.map(normalizeHeader).filter(Boolean);
  if (headers.length < 2) return null;
  const has = (re) => headers.some((h) => re.test(h));

  const ticketNumber = has(/\bticket number\b/);
  const buyerEmail = has(/\bbuyer email\b/) || has(/^buyer e ?mail$/);

  if (buyerEmail && has(/\bticket type\b/) && ticketNumber) return "tickets";
  if (has(/\bguest name\b/) && has(/dinner|entree|entre|\bmeal\b/)) return "meals";
  if (has(/\bpurchaser name\b/) && buyerEmail && !ticketNumber) return "overrides";
  return null;
}

/**
 * Look at every sheet in a workbook and work out which one is the Zeffy ticket
 * export, which one is the dinner-selection responses, and which one is the
 * optional overrides tab. Sheet NAMES are ignored on purpose: the responses
 * workbook carries its own stale copy of the ticket export called "Tickets".
 *
 * @param {Object<string, any[][]>} sheets
 * @param {string} [fileLabel]  File name, so the dialog can say where each came from.
 * @returns {{
 *   ticketRows: any[][]|null, mealRows: any[][]|null, overrideRows: any[][]|null,
 *   found: { tickets: string|null, meals: string|null, overrides: string|null },
 *   sources: { tickets: string, meals: string, overrides: string },
 *   counts: { tickets: number, meals: number, overrides: number },
 *   candidates: { tickets: Candidate[], meals: Candidate[], overrides: Candidate[] },
 *   sheetNames: string[]
 * }}
 */
export function detectSheets(sheets, fileLabel = "") {
  const candidates = { tickets: [], meals: [], overrides: [] };
  const sheetNames = Object.keys(sheets || {});

  for (const sheetName of sheetNames) {
    const rows = sheets[sheetName];
    if (!Array.isArray(rows) || !rows.length) continue;
    const limit = Math.min(HEADER_SCAN_ROWS, rows.length);
    for (let r = 0; r < limit; r++) {
      const kind = classifyHeaderRow(rows[r]);
      if (!kind) continue;
      const body = r === 0 ? rows : rows.slice(r);
      candidates[kind].push({
        sheet: sheetName,
        file: fileLabel,
        headerRow: r,
        dataRows: Math.max(0, body.length - 1),
        rows: body,
      });
      break; // one kind per sheet, the first header row that matches wins
    }
  }

  for (const kind of Object.keys(candidates)) {
    candidates[kind].sort((a, b) => b.dataRows - a.dataRows);
  }

  return fromCandidates(candidates, sheetNames);
}

function pick(candidates, kind) {
  return (candidates[kind] && candidates[kind][0]) || null;
}

function fromCandidates(candidates, sheetNames) {
  const tickets = pick(candidates, "tickets");
  const meals = pick(candidates, "meals");
  const overrides = pick(candidates, "overrides");
  return {
    ticketRows: tickets ? tickets.rows : null,
    mealRows: meals ? meals.rows : null,
    overrideRows: overrides ? overrides.rows : null,
    found: {
      tickets: tickets ? tickets.sheet : null,
      meals: meals ? meals.sheet : null,
      overrides: overrides ? overrides.sheet : null,
    },
    sources: {
      tickets: tickets ? tickets.file : "",
      meals: meals ? meals.file : "",
      overrides: overrides ? overrides.file : "",
    },
    counts: {
      tickets: tickets ? tickets.dataRows : 0,
      meals: meals ? meals.dataRows : 0,
      overrides: overrides ? overrides.dataRows : 0,
    },
    candidates,
    sheetNames: sheetNames || [],
  };
}

const EMPTY_CANDIDATES = () => ({ tickets: [], meals: [], overrides: [] });

/**
 * Combine the detections from several files. For each kind the sheet with more
 * data rows wins, so a fresh 107-row Zeffy export beats the stale 106-row copy
 * pasted into the responses workbook. Every candidate is kept so the planner can
 * override the choice by hand.
 */
export function mergeDetected(a, b) {
  const left = a || fromCandidates(EMPTY_CANDIDATES(), []);
  if (!b) return left;
  const merged = EMPTY_CANDIDATES();
  for (const kind of Object.keys(merged)) {
    merged[kind] = []
      .concat(left.candidates ? left.candidates[kind] || [] : [])
      .concat(b.candidates ? b.candidates[kind] || [] : [])
      .sort((x, y) => y.dataRows - x.dataRows);
  }
  return fromCandidates(merged, [].concat(left.sheetNames || [], b.sheetNames || []));
}

/** Fold a list of per-file detections into one. */
export function mergeAllDetected(list) {
  return (list || []).reduce((acc, one) => (acc ? mergeDetected(acc, one) : one), null) ||
    fromCandidates(EMPTY_CANDIDATES(), []);
}

/**
 * Swap in a different candidate for one kind (the planner picked another sheet).
 * @param {object} detected
 * @param {"tickets"|"meals"|"overrides"} kind
 * @param {{sheet:string, file:string}} choice
 */
export function chooseCandidate(detected, kind, choice) {
  const list = (detected.candidates && detected.candidates[kind]) || [];
  const wanted = list.find((c) => c.sheet === choice.sheet && c.file === choice.file);
  if (!wanted) return detected;
  const next = EMPTY_CANDIDATES();
  for (const k of Object.keys(next)) {
    next[k] = ((detected.candidates && detected.candidates[k]) || []).slice();
  }
  next[kind] = [wanted].concat(next[kind].filter((c) => c !== wanted));
  return fromCandidates(next, detected.sheetNames || []);
}

export function anyDetected(detected) {
  return !!(detected && (detected.ticketRows || detected.mealRows || detected.overrideRows));
}

/* ------------------------------------------------------------------ writing */

function pad(n) {
  return String(n).padStart(2, "0");
}

/** "lsp-gala-seating-2026-09-20-1432.json" */
export function stampName(prefix, ext, date = new Date()) {
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  const clean = String(prefix || "lsp-gala-seating").replace(/[^a-z0-9-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${clean || "lsp-gala-seating"}-${stamp}.${String(ext || "txt").replace(/^\./, "")}`;
}

/** Hand a Blob to the browser as a download, then let the object URL go. */
export function downloadBlob(filename, blob) {
  if (typeof document === "undefined") return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}

export function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  return downloadBlob(filename, new Blob([text], { type: mime }));
}

/** Clipboard with a textarea fallback for browsers that block the async API. */
export async function copyText(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the textarea */
    }
  }
  if (typeof document === "undefined") return false;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}
