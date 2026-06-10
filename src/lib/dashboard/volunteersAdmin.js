// Pure helpers for the Volunteers dashboard module.
// All date math uses the browser's local time; the org operates in
// America/Chicago and shift timestamps are stored as timestamptz.

const pad = (num) => String(num).padStart(2, "0");

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
