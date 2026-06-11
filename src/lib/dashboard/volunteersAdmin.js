// Pure helpers for the Volunteers dashboard module.
// All date math uses the browser's local time; the org operates in
// America/Chicago and shift timestamps are stored as timestamptz.

const pad = (num) => String(num).padStart(2, "0");

// Shift categories. Operational shifts may never overlap each other (enforced
// by the prevent_operational_overlap DB trigger); the others may overlap anything.
export const SHIFT_CATEGORIES = [
  { value: "operational", label: "Operational" },
  { value: "special_event", label: "Special event" },
  { value: "external", label: "External" },
];

export function categoryLabel(category) {
  return SHIFT_CATEGORIES.find((c) => c.value === category)?.label || "Operational";
}

// True when a Supabase/Postgres error is the operational-overlap trigger
// (exclusion_violation) firing.
export function isOverlapError(error) {
  return error?.code === "23P01";
}

// Timestamps arrive in mixed ISO flavors ("...Z" from toISOString, "...+00:00"
// from PostgREST), so compare as epoch milliseconds, never as strings.
const epoch = (ts) => new Date(ts).getTime();
const rangesOverlap = (a, b) =>
  epoch(a.starts_at) < epoch(b.ends_at) && epoch(b.starts_at) < epoch(a.ends_at);

// Preflight check for operational shift creation. `rows` are insert payloads
// with starts_at/ends_at ISO strings. Returns { okRows, conflicts } where
// conflicts entries are { row, reason }. Checks both the database (active
// operational shifts in the affected window) and overlaps within the batch.
export async function findOperationalOverlaps(supabase, rows, { excludeId = null } = {}) {
  const okRows = [];
  const conflicts = [];
  if (!rows?.length) return { okRows, conflicts };

  const minStart = rows.reduce(
    (m, r) => (epoch(r.starts_at) < epoch(m) ? r.starts_at : m),
    rows[0].starts_at,
  );
  const maxEnd = rows.reduce(
    (m, r) => (epoch(r.ends_at) > epoch(m) ? r.ends_at : m),
    rows[0].ends_at,
  );

  const { data: existing, error } = await supabase
    .from("volunteer_shifts")
    .select("id, starts_at, ends_at")
    .eq("cancelled", false)
    .eq("category", "operational")
    .lt("starts_at", maxEnd)
    .gt("ends_at", minStart);

  if (error) throw new Error(error.message);

  const accepted = [];
  const candidates = (existing || []).filter((s) => !excludeId || s.id !== excludeId);
  for (const row of rows) {
    const dbHit = candidates.find((s) => rangesOverlap(row, s));
    if (dbHit) {
      conflicts.push({
        row,
        reason: `overlaps the existing ${formatTimeRange(dbHit.starts_at, dbHit.ends_at)} shift on ${formatShortDate(dbHit.starts_at)}`,
      });
      continue;
    }
    if (accepted.some((s) => rangesOverlap(row, s))) {
      conflicts.push({ row, reason: "duplicates another row in this batch" });
      continue;
    }
    accepted.push(row);
    okRows.push(row);
  }

  return { okRows, conflicts };
}

// Date -> "YYYY-MM-DD" using local time (Safari-safe, no toISOString).
export function toDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "YYYY-MM-DD" -> local Date at midnight.
export function parseDateStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Add days to a "YYYY-MM-DD" string, returning a new string.
export function addDaysStr(dateStr, days) {
  const date = parseDateStr(dateStr);
  date.setDate(date.getDate() + days);
  return toDateStr(date);
}

// Start of the week containing `date` (Sunday, matching the legacy admin).
export function getWeekStartStr(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return toDateStr(d);
}

// Compose a local date + time ("YYYY-MM-DD", "HH:MM") into an ISO string.
export function composeLocalIso(dateStr, timeStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).toISOString();
}

// ISO/timestamptz string -> "YYYY-MM-DDTHH:MM" for datetime-local inputs.
export function toDateTimeLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "YYYY-MM-DDTHH:MM" (datetime-local) -> ISO string, or null.
export function fromDateTimeLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ISO -> "HH:MM" local, for time inputs.
export function toTimeInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTime(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatTimeRange(startsAt, endsAt) {
  return `${formatTime(startsAt)} - ${formatTime(endsAt)}`;
}

export function formatDayLabel(dateStr) {
  return parseDateStr(dateStr).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatShortDate(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Display label for a shift row (volunteer_shifts shape).
export function shiftLabel(shift) {
  if (shift?.title) return shift.title;
  if (shift?.kind === "opportunity") return "Volunteer opportunity";
  return formatTimeRange(shift.starts_at, shift.ends_at);
}

// Group an array of volunteer_shifts rows into 7 day buckets for a week grid.
// Returns [{ dateStr, label, shortLabel, isToday, shifts: [] }, ...].
export function buildWeekDays(shifts, weekStartStr) {
  const todayStr = toDateStr(new Date());
  const days = [];

  for (let i = 0; i < 7; i += 1) {
    const dateStr = addDaysStr(weekStartStr, i);
    const date = parseDateStr(dateStr);
    days.push({
      dateStr,
      label: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
      shortLabel: date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
      isToday: dateStr === todayStr,
      shifts: [],
    });
  }

  const byDate = new Map(days.map((day) => [day.dateStr, day]));

  for (const shift of shifts || []) {
    const dateStr = toDateStr(new Date(shift.starts_at));
    const day = byDate.get(dateStr);
    if (day) day.shifts.push(shift);
  }

  for (const day of days) {
    day.shifts.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }

  return days;
}

// Build volunteer_shifts insert payloads for a recurring custom schedule.
export function buildRecurringShiftRows({
  startDate,
  endDate,
  daysOfWeek,
  time,
  durationMinutes,
  leadCapacity,
  volunteerCapacity,
}) {
  if (!startDate || !endDate || !time || !daysOfWeek?.length) return [];

  const start = parseDateStr(startDate);
  const end = parseDateStr(endDate);
  if (end < start) return [];

  const [h, min] = time.split(":").map(Number);
  const duration = Number(durationMinutes) || 60;
  const rows = [];
  const current = new Date(start);

  while (current <= end) {
    if (daysOfWeek.includes(current.getDay())) {
      const startsAt = new Date(
        current.getFullYear(),
        current.getMonth(),
        current.getDate(),
        h,
        min,
      );
      const endsAt = new Date(startsAt.getTime() + duration * 60000);
      rows.push({
        kind: "custom",
        category: "operational",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        lead_capacity: Math.max(0, Number(leadCapacity) || 0),
        volunteer_capacity: Math.max(0, Number(volunteerCapacity) || 0),
      });
    }
    current.setDate(current.getDate() + 1);
  }

  return rows;
}

// Parse the legacy bulk-upload CSV format:
// Date, StartTime, Duration, LeadCapacity, VolunteerCapacity
// e.g. "2025-11-26, 18:00, 60, 1, 2". Returns { rows, errors }.
export function parseShiftCsv(text) {
  const rows = [];
  const errors = [];
  const lines = String(text || "").split(/\r?\n/);
  const startIdx = lines[0]?.toLowerCase().includes("date") ? 1 : 0;

  for (let i = startIdx; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;

    const [dateStr, timeStr, durStr, leadStr, volStr] = line
      .split(",")
      .map((s) => s.trim());

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "") || !/^\d{1,2}:\d{2}$/.test(timeStr || "")) {
      errors.push(`Line ${i + 1}: could not read date/time from "${line}"`);
      continue;
    }

    const duration = Number(durStr) || 60;
    const [y, m, d] = dateStr.split("-").map(Number);
    const [h, min] = timeStr.split(":").map(Number);
    const startsAt = new Date(y, m - 1, d, h, min);
    const endsAt = new Date(startsAt.getTime() + duration * 60000);

    rows.push({
      kind: "custom",
      category: "operational",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      lead_capacity: Math.max(0, Number(leadStr) || 1),
      volunteer_capacity: Math.max(0, Number(volStr) || 2),
    });
  }

  return { rows, errors };
}

// Serialize rows (arrays of cell values) into a CSV string.
export function serializeCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? "" : String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

// Trigger a client-side CSV download (UTF-8 BOM for Excel).
const CSV_BOM = String.fromCharCode(0xfeff);

// ---------------------------------------------------------------------------
// Monthly volunteer compliance (the "4 hour" rule)
// ---------------------------------------------------------------------------

export const COMPLIANCE_MET_HOURS = 4;
export const COMPLIANCE_CLOSE_HOURS = 2;

// First/last day of the last full calendar month, browser-local.
// endStr is INCLUSIVE (UI-facing); queries add a day for the exclusive bound.
export function getLastFullMonthRange(today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 0);
  return { startStr: toDateStr(start), endStr: toDateStr(end) };
}

const round2 = (n) => Math.round(n * 100) / 100;

function categorize(hours) {
  if (hours >= COMPLIANCE_MET_HOURS) return "met";
  if (hours >= COMPLIANCE_CLOSE_HOURS) return "close";
  return "under";
}

// Deterministic compliance pass: exact lowercase-email grouping over
// shift_registrations rows joined to their shift. Returns the SAME shape as
// geminiUtils.generateVolunteerSummary so one render path and one CSV
// builder serve both the exact and the AI-merged result.
// registrations: [{ name, email, checked_in, shift: { starts_at, ends_at, cancelled } }]
// roster: extractExpectedVolunteers() output ([{ name, email }]) or null.
export function buildCompliance(registrations, roster = null) {
  const byEmail = new Map();

  for (const reg of registrations || []) {
    if (!reg?.shift || reg.shift.cancelled || !reg.email) continue;
    const key = reg.email.trim().toLowerCase();
    if (!byEmail.has(key)) {
      byEmail.set(key, {
        primaryName: reg.name || "",
        primaryEmail: key,
        allNames: new Set(),
        allEmails: new Set([key]),
        totalCheckedInHours: 0,
        totalRegisteredHours: 0,
        checkedInShifts: 0,
        totalRegisteredShifts: 0,
      });
    }
    const entry = byEmail.get(key);
    if (reg.name) entry.allNames.add(reg.name.trim());
    const hours =
      (new Date(reg.shift.ends_at) - new Date(reg.shift.starts_at)) / 3600000;
    if (!Number.isFinite(hours) || hours <= 0) continue;
    entry.totalRegisteredShifts += 1;
    entry.totalRegisteredHours += hours;
    if (reg.checked_in) {
      entry.checkedInShifts += 1;
      entry.totalCheckedInHours += hours;
    }
  }

  const rosterByEmail = new Map(
    (roster || [])
      .filter((v) => v.email)
      .map((v) => [v.email.trim().toLowerCase(), v]),
  );

  const volunteers = [...byEmail.values()].map((entry) => {
    const onList = roster ? rosterByEmail.has(entry.primaryEmail) : null;
    return {
      primaryName: entry.primaryName || [...entry.allNames][0] || entry.primaryEmail,
      primaryEmail: entry.primaryEmail,
      allNames: [...entry.allNames],
      allEmails: [...entry.allEmails],
      totalCheckedInHours: round2(entry.totalCheckedInHours),
      totalRegisteredHours: round2(entry.totalRegisteredHours),
      checkedInShifts: entry.checkedInShifts,
      totalRegisteredShifts: entry.totalRegisteredShifts,
      category: categorize(entry.totalCheckedInHours),
      confidence: "high",
      uncertaintyNote:
        onList === false ? "Not on expected volunteer list" : null,
      onExpectedList: onList,
    };
  });

  // Compliance-first reading order: under, close, met; lowest hours first.
  const order = { under: 0, close: 1, met: 2 };
  volunteers.sort(
    (a, b) =>
      order[a.category] - order[b.category] ||
      a.totalCheckedInHours - b.totalCheckedInHours ||
      a.primaryName.localeCompare(b.primaryName),
  );

  const notFound = roster
    ? (roster || [])
        .filter(
          (v) => !v.email || !byEmail.has(v.email.trim().toLowerCase()),
        )
        .map((v) => ({
          name: v.name || "",
          email: v.email || "",
          note: "No check-in records found in this range",
        }))
    : [];

  return {
    volunteers,
    notFound,
    stats: {
      totalUniqueVolunteers: volunteers.length,
      totalCheckedInHours: round2(
        volunteers.reduce((sum, v) => sum + v.totalCheckedInHours, 0),
      ),
      metCount: volunteers.filter((v) => v.category === "met").length,
      closeCount: volunteers.filter((v) => v.category === "close").length,
      underCount: volunteers.filter((v) => v.category === "under").length,
      uncertainGroupings: 0,
      ...(roster
        ? { notFoundCount: notFound.length, expectedTotal: roster.length }
        : {}),
    },
    notes:
      "Exact email matching only. Use Refine with AI to merge identities across name and email variations.",
  };
}

// Rebuild an AI result's numbers deterministically. The model is good at
// identity grouping but unreliable at arithmetic, so we keep its groupings
// (allEmails per volunteer) and recompute every hour/shift total from the raw
// registrations. Emails the AI failed to group are appended from the exact
// pass so no volunteer is ever dropped.
export function reconcileAiResult(aiResult, registrations, roster = null) {
  if (!aiResult?.volunteers) return aiResult;

  const exact = buildCompliance(registrations, roster);
  const byEmail = new Map(exact.volunteers.map((v) => [v.primaryEmail, v]));
  const claimed = new Set();

  const volunteers = aiResult.volunteers.map((v) => {
    const emails = [
      ...new Set(
        [v.primaryEmail, ...(v.allEmails || [])]
          .filter(Boolean)
          .map((e) => e.trim().toLowerCase()),
      ),
    ];
    const parts = emails
      .filter((e) => byEmail.has(e) && !claimed.has(e))
      .map((e) => {
        claimed.add(e);
        return byEmail.get(e);
      });

    if (!parts.length) return null; // hallucinated identity: no real records

    const sum = (key) =>
      Math.round(parts.reduce((total, p) => total + p[key], 0) * 100) / 100;
    const checkedInHours = sum("totalCheckedInHours");

    return {
      ...v,
      allEmails: emails,
      totalCheckedInHours: checkedInHours,
      totalRegisteredHours: sum("totalRegisteredHours"),
      checkedInShifts: parts.reduce((t, p) => t + p.checkedInShifts, 0),
      totalRegisteredShifts: parts.reduce((t, p) => t + p.totalRegisteredShifts, 0),
      category:
        checkedInHours >= COMPLIANCE_MET_HOURS
          ? "met"
          : checkedInHours >= COMPLIANCE_CLOSE_HOURS
            ? "close"
            : "under",
    };
  });

  const kept = volunteers.filter(Boolean);
  for (const v of exact.volunteers) {
    if (!claimed.has(v.primaryEmail)) {
      kept.push({
        ...v,
        uncertaintyNote: v.uncertaintyNote || "Not grouped by AI; added from exact match",
      });
    }
  }

  const order = { under: 0, close: 1, met: 2 };
  kept.sort(
    (a, b) =>
      order[a.category] - order[b.category] ||
      a.totalCheckedInHours - b.totalCheckedInHours ||
      (a.primaryName || "").localeCompare(b.primaryName || ""),
  );

  return {
    ...aiResult,
    volunteers: kept,
    stats: {
      ...aiResult.stats,
      totalUniqueVolunteers: kept.length,
      totalCheckedInHours:
        Math.round(kept.reduce((t, v) => t + v.totalCheckedInHours, 0) * 100) / 100,
      metCount: kept.filter((v) => v.category === "met").length,
      closeCount: kept.filter((v) => v.category === "close").length,
      underCount: kept.filter((v) => v.category === "under").length,
    },
  };
}

// Map Supabase registration rows to the record shape generateVolunteerSummary
// expects: { name, email, shiftDate, shiftTime, durationHours, checkedIn }.
export function toGeminiRecords(registrations) {
  return (registrations || [])
    .filter((reg) => reg?.shift && !reg.shift.cancelled)
    .map((reg) => ({
      name: reg.name || "",
      email: reg.email || "",
      shiftDate: toDateStr(new Date(reg.shift.starts_at)),
      shiftTime: formatTimeRange(reg.shift.starts_at, reg.shift.ends_at),
      durationHours: round2(
        (new Date(reg.shift.ends_at) - new Date(reg.shift.starts_at)) / 3600000,
      ),
      checkedIn: !!reg.checked_in,
    }));
}

const CATEGORY_LABELS = {
  met: "Met 4+ Hours",
  close: "Close to 4 Hours (2-3.99h)",
  under: "Under 2 Hours - Out of Compliance",
};

// Legacy-parity CSV rows for downloadCsv(): header + volunteers + blank row +
// NOT FOUND section (when a roster was checked).
export function buildComplianceCsvRows(result) {
  const rows = [
    [
      "Name",
      "Email",
      "Checked-In Hours",
      "Registered Hours",
      "Shifts Checked In",
      "Total Shifts Registered",
      "Category",
      "Confidence",
      "On Expected List",
      "Notes",
    ],
  ];

  for (const v of result?.volunteers || []) {
    rows.push([
      v.primaryName,
      v.primaryEmail,
      v.totalCheckedInHours,
      v.totalRegisteredHours,
      v.checkedInShifts,
      v.totalRegisteredShifts,
      CATEGORY_LABELS[v.category] || v.category,
      v.confidence || "",
      v.onExpectedList === null || v.onExpectedList === undefined
        ? ""
        : v.onExpectedList
          ? "Yes"
          : "No",
      v.uncertaintyNote || "",
    ]);
  }

  if (result?.notFound?.length) {
    rows.push([]);
    rows.push(["--- NOT FOUND IN CHECK-IN RECORDS ---"]);
    for (const v of result.notFound) {
      rows.push([v.name, v.email, 0, 0, 0, 0, "Not Found", "", "Yes", v.note || ""]);
    }
  }

  return rows;
}

export function downloadCsv(filename, rows) {
  const blob = new Blob([CSV_BOM + serializeCsv(rows)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
