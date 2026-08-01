// Time Clock module: shared, dependency-free logic for the data the studio
// iPad kiosk syncs. Everything here is pure so it can be reasoned about (and
// unit-tested) without a browser or a database.
//
// Two rules drive the whole module:
//
//   1. Billable hours are DERIVED, never stored. Instructor shifts pay
//      1.5h per class actually taught; coordinator shifts pay wall clock
//      (clock out - clock in). Open shifts have no hours at all.
//
//   2. The studio runs on America/Chicago. Every date boundary, display
//      string, and CSV cell is computed in that zone explicitly, because the
//      admin looking at the portal may be sitting anywhere.
//
// There is no date library in this project, so the timezone math is
// hand-rolled on top of Intl.DateTimeFormat (see chicagoOffsetMs).

export const STUDIO_TIME_ZONE = "America/Chicago";
export const INSTRUCTOR_HOURS_PER_CLASS = 1.5;

// A punch whose clock-in is older than this and still open is almost
// certainly a missed clock-out rather than a very long shift.
export const MISSED_PUNCH_HOURS = 12;

// Two punches for the same employee starting within this window are treated
// as the same shift when importing (the kiosk may already have synced it).
export const DUPLICATE_WINDOW_MS = 90 * 1000;

// Explicit column lists; never select("*").
export const EMPLOYEE_COLUMNS =
  "id,rfid_tag,first_name,last_name,email,pin,job_title,profile_role,is_active,created_at,updated_at";
export const PUNCH_COLUMNS =
  "id,employee_id,clock_in_at,clock_out_at,was_forced_out,shift_role,scheduled_classes,actual_classes_taught,source,note,created_at,updated_at";
export const MESSAGE_COLUMNS =
  "id,title,body,audience,employee_id,starts_on,ends_on,is_active,sort_order,created_by,created_at,updated_at";
export const RECEIPT_COLUMNS = "id,message_id,employee_id,punch_id,seen_at";
export const IMPORT_COLUMNS =
  "id,file_name,format,total_rows,imported_punches,skipped_rows,created_employees,created_by,created_at";
export const KIOSK_STATUS_COLUMNS =
  "id,last_seen_at,app_version,pending_push,detail";

// The kiosk CSVs use display names, not the stored enum values.
export const PROFILE_ROLE_LABELS = {
  instructor: "Instructor",
  coordinator: "Coordinator",
  both: "Both",
};

export const SHIFT_ROLE_LABELS = {
  instructor: "Instructor",
  coordinator: "Coordinator",
};

export const PROFILE_ROLE_OPTIONS = [
  { value: "instructor", label: "Instructor" },
  { value: "coordinator", label: "Coordinator" },
  { value: "both", label: "Both" },
];

export const SHIFT_ROLE_OPTIONS = [
  { value: "instructor", label: "Instructor" },
  { value: "coordinator", label: "Coordinator" },
];

export const AUDIENCE_LABELS = {
  all: "Everyone",
  instructor: "Instructors",
  coordinator: "Coordinators",
};

export const AUDIENCE_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "instructor", label: "Instructors" },
  { value: "coordinator", label: "Coordinators" },
];

export const SOURCE_LABELS = {
  kiosk: "Kiosk",
  portal: "Portal",
  import: "Import",
};

const pad = (value) => String(value).padStart(2, "0");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_RE.test(String(value || "").trim());
}

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  // Deterministic-enough fallback for environments without WebCrypto.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Hours ──────────────────────────────────────────────────────

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Wall-clock hours actually on the premises. null for an open shift.
export function loggedHours(punch) {
  const start = toDate(punch?.clock_in_at);
  const end = toDate(punch?.clock_out_at);
  if (!start || !end) return null;
  const hours = (end.getTime() - start.getTime()) / 3600000;
  return hours > 0 ? hours : 0;
}

// What the studio pays for. Instructors are paid per class taught (1.5h
// each) regardless of how long they hung around; coordinators are paid for
// the time they were clocked in. null for an open shift, because a shift
// that has not ended has no settled billable amount.
export function billableHours(punch) {
  if (!punch?.clock_in_at || !punch?.clock_out_at) return null;
  if (punch.shift_role === "instructor") {
    const classes = Number(punch.actual_classes_taught || 0);
    return (Number.isFinite(classes) ? classes : 0) * INSTRUCTOR_HOURS_PER_CLASS;
  }
  return loggedHours(punch);
}

export function isOpenPunch(punch) {
  return Boolean(punch?.clock_in_at) && !punch?.clock_out_at;
}

// "7.50" — blank for open shifts so CSV cells and table cells agree.
export function formatHours(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return value.toFixed(2);
}

export function sumHours(punches, fn) {
  return punches.reduce((total, punch) => {
    const value = fn(punch);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

// ── America/Chicago time ───────────────────────────────────────

const CHICAGO_PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: STUDIO_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const CHICAGO_DATE_DISPLAY = new Intl.DateTimeFormat("en-US", {
  timeZone: STUDIO_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

const CHICAGO_SHORT_DATE_DISPLAY = new Intl.DateTimeFormat("en-US", {
  timeZone: STUDIO_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const CHICAGO_TIME_DISPLAY = new Intl.DateTimeFormat("en-US", {
  timeZone: STUDIO_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

const CHICAGO_DATETIME_DISPLAY = new Intl.DateTimeFormat("en-US", {
  timeZone: STUDIO_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// Numeric wall-clock components as read in Chicago at that instant.
export function chicagoParts(value) {
  const date = toDate(value);
  if (!date) return null;
  const parts = {};
  for (const part of CHICAGO_PARTS_FORMAT.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  // h23 renders midnight as 00, but guard anyway: some older engines emit 24.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

// "2026-07-15"
export function formatChicagoDate(value) {
  const parts = chicagoParts(value);
  if (!parts) return "";
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

// "2026-07-15 09:30" — the exact shape the kiosk timesheet CSV uses.
export function formatChicagoDateTime(value) {
  const parts = chicagoParts(value);
  if (!parts) return "";
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

// "2026-07-15T09:30" for <input type="datetime-local">.
export function toChicagoInputValue(value) {
  const text = formatChicagoDateTime(value);
  return text ? text.replace(" ", "T") : "";
}

// Converts a typed studio wall-clock time and reads the result back, so a
// caller can tell the difference between "saved exactly what you typed" and
// "that time does not exist". The only wall-clock times that fail to
// round-trip are the ones inside the spring-forward gap (02:00–02:59 on the
// second Sunday in March), which resolve to a real instant an hour away.
// `saved` is the wall-clock time that will actually be stored.
export function chicagoInputRoundTrip(local) {
  const typed = String(local || "").trim().replace(" ", "T").slice(0, 16);
  if (!typed) return { iso: null, saved: "", shifted: false };
  const iso = chicagoLocalToUtcIso(typed);
  if (!iso) return { iso: null, saved: "", shifted: false };
  const saved = toChicagoInputValue(iso);
  return { iso, saved, shifted: Boolean(saved) && saved !== typed };
}

export function formatChicagoDateLabel(value) {
  const date = toDate(value);
  return date ? CHICAGO_DATE_DISPLAY.format(date) : "";
}

export function formatChicagoShortDate(value) {
  const date = toDate(value);
  return date ? CHICAGO_SHORT_DATE_DISPLAY.format(date) : "";
}

export function formatChicagoTimeLabel(value) {
  const date = toDate(value);
  return date ? CHICAGO_TIME_DISPLAY.format(date) : "";
}

export function formatChicagoDateTimeLabel(value) {
  const date = toDate(value);
  return date ? CHICAGO_DATETIME_DISPLAY.format(date) : "";
}

// A plain "2026-07-15" date column rendered for humans, without letting the
// browser's own zone shift it a day.
export function formatDateOnlyLabel(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""))) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return CHICAGO_DATE_DISPLAY.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

// Offset of America/Chicago at `instant`, in milliseconds (negative, since
// Chicago is west of UTC). Intl tells us what the wall clock reads there;
// reading those same digits back as if they were UTC and subtracting the real
// instant yields the offset. This is the only way to get a zone offset
// without a date library.
function chicagoOffsetMs(instant) {
  const parts = chicagoParts(instant);
  if (!parts) return 0;
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - instant.getTime();
}

// "yyyy-MM-dd HH:mm" (or "...THH:mm") of STUDIO wall-clock time -> UTC ISO.
//
// DST correctness needs two probes. Pass one reads the offset in effect at
// the naive UTC reading of those digits and subtracts it; that answer is
// wrong by an hour for times within ~a day of a transition, because the
// offset at the naive instant may not be the offset at the real one. Pass two
// re-probes the offset AT the first guess and recomputes, which converges for
// every real local time.
//
// Impossible times (inside the spring-forward gap) and ambiguous times
// (inside the fall-back repeated hour) still resolve to a single real
// instant: ambiguous times take the first (daylight) occurrence, matching
// what the kiosk records when it stamps a punch.
export function chicagoLocalToUtcIso(local) {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(
    String(local || "").trim(),
  );
  if (!match) return null;

  const naive = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    match[6] ? Number(match[6]) : 0,
  );
  if (!Number.isFinite(naive)) return null;

  const firstGuess = naive - chicagoOffsetMs(new Date(naive));
  const settled = naive - chicagoOffsetMs(new Date(firstGuess));
  return new Date(settled).toISOString();
}

// Inclusive start / exclusive end of a Chicago calendar day, as UTC ISO.
export function chicagoDayStartIso(dateStr) {
  return chicagoLocalToUtcIso(`${dateStr} 00:00`);
}

export function chicagoDayEndIso(dateStr) {
  return chicagoDayStartIso(addDaysToDate(dateStr, 1));
}

// Pure "yyyy-MM-dd" arithmetic (UTC-anchored, so no zone can shift it).
export function addDaysToDate(dateStr, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!match) return dateStr;
  const ms =
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) +
    days * 86400000;
  const date = new Date(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// 0 = Sunday.
export function weekdayOfDate(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!match) return 0;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  ).getUTCDay();
}

// Studio weeks run Monday -> Sunday.
export function startOfWeekDate(dateStr) {
  const back = (weekdayOfDate(dateStr) + 6) % 7;
  return addDaysToDate(dateStr, -back);
}

export function startOfMonthDate(dateStr) {
  return `${String(dateStr).slice(0, 7)}-01`;
}

export function endOfMonthDate(dateStr) {
  const first = startOfMonthDate(dateStr);
  const match = /^(\d{4})-(\d{2})-01$/.exec(first);
  if (!match) return dateStr;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const nextFirst =
    month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
  return addDaysToDate(nextFirst, -1);
}

// Today's date in the studio's zone, not the viewer's.
export function chicagoToday(now = new Date()) {
  return formatChicagoDate(now);
}

export const QUICK_RANGES = [
  { id: "this-week", label: "This Week" },
  { id: "last-week", label: "Last Week" },
  { id: "this-month", label: "This Month" },
  { id: "last-30", label: "Last 30 Days" },
];

// Inclusive { from, to } "yyyy-MM-dd" pair, computed on Chicago calendar days.
export function quickRange(id, now = new Date()) {
  const today = chicagoToday(now);

  if (id === "this-week") {
    const from = startOfWeekDate(today);
    return { from, to: addDaysToDate(from, 6) };
  }
  if (id === "last-week") {
    const from = addDaysToDate(startOfWeekDate(today), -7);
    return { from, to: addDaysToDate(from, 6) };
  }
  if (id === "this-month") {
    return { from: startOfMonthDate(today), to: endOfMonthDate(today) };
  }
  // last-30, inclusive of today.
  return { from: addDaysToDate(today, -29), to: today };
}

// ── Relative time ──────────────────────────────────────────────

export function relativeTime(value, now = Date.now()) {
  const date = toDate(value);
  if (!date) return "Never";
  const diff = now - date.getTime();
  if (diff < 0) return "just now";
  if (diff < 60000) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// "6h 12m" for a shift that is still running.
export function elapsedLabel(value, now = Date.now()) {
  const date = toDate(value);
  if (!date) return "";
  const diff = Math.max(0, now - date.getTime());
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes % 60}m`;
}

// Green when the iPad checked in within 15 minutes, amber within a day, red
// beyond that (or never).
export function kioskFreshness(lastSeenAt, now = Date.now()) {
  const date = toDate(lastSeenAt);
  if (!date) return { tone: "red", label: "Never synced", dot: "bg-red-500" };
  const diff = now - date.getTime();
  if (diff < 15 * 60000) {
    return { tone: "green", label: "Online", dot: "bg-green-500" };
  }
  if (diff < 24 * 3600000) {
    return { tone: "amber", label: "Idle", dot: "bg-amber-500" };
  }
  return { tone: "red", label: "Offline", dot: "bg-red-500" };
}

// ── Employees ──────────────────────────────────────────────────

// '' or 'PENDING:<uuid>' both mean "this person still needs a card".
export function isPendingRfid(tag) {
  const text = String(tag || "").trim();
  return text === "" || text.toUpperCase().startsWith("PENDING:");
}

// New portal-created employees get this so the kiosk's onboarding queue
// picks them up for card assignment.
export function pendingRfidTag() {
  return `PENDING:${newId()}`;
}

// The one spelling of a name used as a lookup key, applied identically to
// both sides of every match. Non-breaking spaces (Excel and Numbers both emit
// them), tabs, and runs of ordinary spaces all collapse to a single space, so
// "Ana  Ruiz" out of one export and "Ana Ruiz" out of another cannot fork one
// person into two roster rows.
export function normalizeNameKey(value) {
  return String(value ?? "")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function employeeFullName(employee) {
  if (!employee) return "";
  return [employee.first_name, employee.last_name]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

// Name, falling back to email, falling back to a stable placeholder.
export function employeeLabel(employee) {
  return employeeFullName(employee) || employee?.email || "Unnamed";
}

export function splitFullName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function profileRoleFromLabel(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "coordinator") return "coordinator";
  if (text === "both") return "both";
  return "instructor";
}

export function shiftRoleFromLabel(value) {
  return String(value || "").trim().toLowerCase() === "coordinator"
    ? "coordinator"
    : "instructor";
}

// A message targeted at an audience matches an employee whose classification
// is that role, or "both".
export function employeeMatchesAudience(employee, audience) {
  if (audience === "all") return true;
  const role = employee?.profile_role || "instructor";
  return role === audience || role === "both";
}

// ── CSV parsing ────────────────────────────────────────────────

// Splits a CSV document into rows of cells. Handles quoted fields containing
// commas and newlines, doubled quotes as an escaped quote, CRLF or LF line
// endings, and a leading UTF-8 BOM (Excel adds one; downloadCsv writes one).
export function parseCsv(text) {
  const input = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }

    cell += char;
    i += 1;
  }

  row.push(cell);
  rows.push(row);

  // Files normally end with a newline, leaving a phantom empty final row.
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === "")) {
    rows.pop();
  }

  return rows;
}

// ── Kiosk CSV formats ──────────────────────────────────────────

// Canonical full backup: every field the kiosk stores, ISO8601 datetimes.
export const BACKUP_CSV_HEADERS = [
  "Punch ID",
  "Employee ID",
  "First Name",
  "Last Name",
  "Email",
  "RFID Tag",
  "Profile Role",
  "Shift Role",
  "Scheduled Classes",
  "Actual Classes Taught",
  "Clock In",
  "Clock Out",
  "Hours Logged",
  "Billable Hours",
  "Forced Out",
];

// The human-facing timesheet export: Chicago wall-clock datetimes, display
// names, no ids.
export const TIMESHEET_CSV_HEADERS = [
  "Date",
  "Employee",
  "Email",
  "Role",
  "Profile Role",
  "Shift Role",
  "Scheduled Classes",
  "Actual Classes Taught",
  "Clock In",
  "Clock Out",
  "Hours Logged",
  "Billable Hours",
  "Forced Out",
];

export const ROSTER_CSV_HEADERS = [
  "Full Name",
  "Email",
  "RFID Card",
  "PIN",
  "Role",
  "Classification",
  "Status",
];

export const IMPORT_FORMAT_LABELS = {
  backup: "Full backup",
  "backup-no-id": "Full backup (legacy, no Punch ID)",
  timesheet: "Timesheet export",
};

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();
}

function headerIndex(headers, name) {
  const target = normalizeHeader(name);
  return headers.findIndex((header) => normalizeHeader(header) === target);
}

// Which kiosk export is this? Detection is by header content (not order or
// exact count) so a build that adds a trailing column still imports.
export function detectCsvFormat(headerRow) {
  const headers = (headerRow || []).map(normalizeHeader);
  const has = (name) => headers.includes(normalizeHeader(name));

  if (!has("Clock In")) return null;

  if (has("Punch ID") && has("Employee ID")) return "backup";
  // Older kiosk builds wrote the same layout without the leading Punch ID.
  if (has("Employee ID") && has("First Name")) return "backup-no-id";
  if (has("Date") && has("Employee")) return "timesheet";
  return null;
}

// Parses one datetime cell. Backup exports use ISO8601 (which carries its own
// offset); timesheet exports use "yyyy-MM-dd HH:mm" in STUDIO wall time and
// must be converted through the Chicago zone. Returns a UTC ISO string.
export function parseCsvDateTime(value, format) {
  const text = String(value || "").trim();
  if (!text) return null;

  const wallClock = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?$/;

  if (format === "timesheet") {
    if (wallClock.test(text)) return chicagoLocalToUtcIso(text);
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  // Backup: a zone designator means it is a real instant already.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  // Zone-less ISO from an older build: interpret as studio wall time.
  if (wallClock.test(text)) return chicagoLocalToUtcIso(text);

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function parseBooleanCell(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "yes" || text === "y" || text === "1";
}

function parseIntCell(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

// Reads either kiosk export into one normalized row shape:
//   { punchId, employeeId, firstName, lastName, fullName, email, rfidTag,
//     jobTitle, profileRole, shiftRole, scheduledClasses, actualClasses,
//     clockInIso, clockOutIso, forcedOut, lineNumber }
// Returns { format, headers, rows, totalRows, skippedRows, error }.
export function parseKioskCsv(text) {
  const table = parseCsv(text);
  if (!table.length) {
    return { format: null, headers: [], rows: [], totalRows: 0, skippedRows: 0, error: "This file is empty." };
  }

  const headers = table[0].map((header) => String(header || "").replace(/^\uFEFF/, "").trim());
  const format = detectCsvFormat(headers);

  if (!format) {
    return {
      format: null,
      headers,
      rows: [],
      totalRows: 0,
      skippedRows: 0,
      error:
        "This does not look like a Time Clock export. Expected either the full backup CSV (Punch ID, Employee ID, …, Clock In) or the timesheet CSV (Date, Employee, Email, …, Clock In).",
    };
  }

  const ix = {
    punchId: headerIndex(headers, "Punch ID"),
    employeeId: headerIndex(headers, "Employee ID"),
    firstName: headerIndex(headers, "First Name"),
    lastName: headerIndex(headers, "Last Name"),
    employee: headerIndex(headers, "Employee"),
    email: headerIndex(headers, "Email"),
    rfidTag: headerIndex(headers, "RFID Tag"),
    jobTitle: headerIndex(headers, "Role"),
    profileRole: headerIndex(headers, "Profile Role"),
    shiftRole: headerIndex(headers, "Shift Role"),
    scheduled: headerIndex(headers, "Scheduled Classes"),
    actual: headerIndex(headers, "Actual Classes Taught"),
    clockIn: headerIndex(headers, "Clock In"),
    clockOut: headerIndex(headers, "Clock Out"),
    forcedOut: headerIndex(headers, "Forced Out"),
  };

  const at = (row, index) => (index >= 0 && index < row.length ? String(row[index] || "").trim() : "");

  const rows = [];
  let totalRows = 0;
  let skippedRows = 0;

  for (let r = 1; r < table.length; r += 1) {
    const raw = table[r] || [];
    if (raw.every((cell) => String(cell || "").trim() === "")) continue;
    totalRows += 1;

    const clockInIso = parseCsvDateTime(at(raw, ix.clockIn), format);
    if (!clockInIso) {
      // No parseable clock-in means there is no shift to import.
      skippedRows += 1;
      continue;
    }

    const nameFromColumns = [at(raw, ix.firstName), at(raw, ix.lastName)]
      .filter(Boolean)
      .join(" ");
    const fullName = nameFromColumns || at(raw, ix.employee);
    const split = nameFromColumns
      ? { firstName: at(raw, ix.firstName), lastName: at(raw, ix.lastName) }
      : splitFullName(fullName);

    rows.push({
      lineNumber: r + 1,
      punchId: isUuid(at(raw, ix.punchId)) ? at(raw, ix.punchId).toLowerCase() : "",
      employeeId: isUuid(at(raw, ix.employeeId)) ? at(raw, ix.employeeId).toLowerCase() : "",
      firstName: split.firstName,
      lastName: split.lastName,
      fullName,
      email: at(raw, ix.email).toLowerCase(),
      rfidTag: at(raw, ix.rfidTag),
      jobTitle: at(raw, ix.jobTitle),
      profileRole: profileRoleFromLabel(at(raw, ix.profileRole)),
      shiftRole: shiftRoleFromLabel(at(raw, ix.shiftRole)),
      scheduledClasses: parseIntCell(at(raw, ix.scheduled)),
      actualClasses: parseIntCell(at(raw, ix.actual)),
      clockInIso,
      clockOutIso: parseCsvDateTime(at(raw, ix.clockOut), format),
      forcedOut: parseBooleanCell(at(raw, ix.forcedOut)),
    });
  }

  return { format, headers, rows, totalRows, skippedRows, error: "" };
}

// ── CSV generation (must mirror the kiosk's own exports) ───────

export function timesheetCsvRow(punch, employee) {
  return [
    formatChicagoDate(punch.clock_in_at),
    employeeFullName(employee) || employee?.email || "",
    employee?.email || "",
    employee?.job_title || "",
    PROFILE_ROLE_LABELS[employee?.profile_role] || "",
    SHIFT_ROLE_LABELS[punch.shift_role] || "",
    String(punch.scheduled_classes ?? 0),
    String(punch.actual_classes_taught ?? 0),
    formatChicagoDateTime(punch.clock_in_at),
    punch.clock_out_at ? formatChicagoDateTime(punch.clock_out_at) : "",
    formatHours(loggedHours(punch)),
    formatHours(billableHours(punch)),
    punch.was_forced_out ? "true" : "false",
  ];
}

export function rosterCsvRow(employee) {
  return [
    employeeFullName(employee) || employee?.email || "",
    employee?.email || "",
    isPendingRfid(employee?.rfid_tag) ? "" : employee?.rfid_tag || "",
    employee?.pin || "",
    employee?.job_title || "",
    PROFILE_ROLE_LABELS[employee?.profile_role] || "Instructor",
    employee?.is_active ? "Active" : "Inactive",
  ];
}

const compactDate = (dateStr) => String(dateStr || "").replace(/-/g, "");

export function timesheetCsvFilename(fromDate, toDate) {
  return `LSP-Timesheets-${compactDate(fromDate)}-to-${compactDate(toDate)}.csv`;
}

export function rosterCsvFilename(now = new Date()) {
  return `LSP-Roster-${compactDate(chicagoToday(now))}.csv`;
}

// ── Import planning ────────────────────────────────────────────

// Decides, for one parsed CSV row, which existing employee it belongs to.
// Order is deliberate: an explicit Employee ID is authoritative (it is the
// kiosk's own primary key), then email, then full name.
export function matchEmployee(row, indexes) {
  if (row.employeeId && indexes.byId.has(row.employeeId)) {
    return indexes.byId.get(row.employeeId);
  }
  if (row.email && indexes.byEmail.has(row.email)) {
    return indexes.byEmail.get(row.email);
  }
  // Same normalization the index was built with — see normalizeNameKey.
  const nameKey = normalizeNameKey(row.fullName);
  if (nameKey && indexes.byName.has(nameKey)) {
    return indexes.byName.get(nameKey);
  }
  return null;
}

export function buildEmployeeIndexes(employees) {
  const byId = new Map();
  const byEmail = new Map();
  const byName = new Map();
  for (const employee of employees || []) {
    byId.set(String(employee.id).toLowerCase(), employee);
    const email = String(employee.email || "").trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, employee);
    const name = normalizeNameKey(employeeFullName(employee));
    if (name && !byName.has(name)) byName.set(name, employee);
  }
  return { byId, byEmail, byName };
}

// A row with no Employee ID, no email, and no name belongs to nobody. It
// cannot be matched and must not be invented: minting an employee per such
// row fills the roster with blank phantoms that then own real hours.
export function rowIdentifiesEmployee(row) {
  return Boolean(
    String(row?.employeeId || "").trim() ||
      String(row?.email || "").trim() ||
      normalizeNameKey(row?.fullName),
  );
}
