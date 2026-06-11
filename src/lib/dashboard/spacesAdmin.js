// Pure helpers for the Studio Spaces module (class schedule, space bookings,
// utilization insights). Times are studio-local (America/Chicago).

import { addDaysStr, parseDateStr, toDateStr } from "./volunteersAdmin.js";

export const ROOMS = ["Little Village Room", "Gage Park Room", "Cafe"];
export const CLASS_ROOMS = ["Little Village Room", "Gage Park Room"];

export const ROOM_SHORT = {
  "Little Village Room": "Little Village",
  "Gage Park Room": "Gage Park",
  Cafe: "Cafe",
};

export const ROOM_TONES = {
  "Little Village Room": "teal",
  "Gage Park Room": "gold",
  Cafe: "neutral",
};

export const BOOKING_KINDS = [
  { value: "event", label: "Event" },
  { value: "training", label: "Training" },
  { value: "other", label: "Other" },
];

export const KIND_TONES = { event: "blue", training: "amber", other: "neutral" };

export const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DOW_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// "HH:MM" or "HH:MM:SS" -> "6:15 AM"
export function formatTime12(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

// time string -> minutes since midnight, for sorting and grid math.
export function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + (m || 0);
}

// Expand weekly schedule slots into dated occurrences for one week.
// Returns [{ slot, dateStr, startMinutes, endMinutes }] honoring active
// state and effective windows.
export function slotOccurrencesForWeek(slots, weekStartStr) {
  const occurrences = [];

  for (let i = 0; i < 7; i += 1) {
    const dateStr = addDaysStr(weekStartStr, i);
    const date = parseDateStr(dateStr);
    const dow = date.getDay();

    for (const slot of slots || []) {
      if (!slot.active || slot.day_of_week !== dow) continue;
      if (slot.effective_from && dateStr < slot.effective_from) continue;
      if (slot.effective_until && dateStr > slot.effective_until) continue;

      const startMinutes = timeToMinutes(slot.start_time);
      occurrences.push({
        slot,
        dateStr,
        startMinutes,
        endMinutes: startMinutes + (slot.duration_minutes || 60),
      });
    }
  }

  return occurrences.sort((a, b) =>
    a.dateStr.localeCompare(b.dateStr) || a.startMinutes - b.startMinutes,
  );
}

// True when an error is one of the scheduling conflict triggers firing.
export function isConflictError(error) {
  return error?.code === "23P01";
}

const HISTORY_DOW = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

// Map parsed MarianaTek "class session utilization details" CSV rows (the
// object output of geminiUtils.parseCSV) onto class_history insert payloads.
// Returns { rows, errors }; rows are safe for upsert with ignoreDuplicates
// on the class_history_dedupe index.
export function parseHistoryCsvRows(csvRows) {
  const rows = [];
  const errors = [];

  (csvRows || []).forEach((r, i) => {
    const dateStr = (r["Class Date"] || "").trim();
    const timeStr = (r["Class Time"] || "").trim();
    const dow = HISTORY_DOW[(r["Class Day of Week"] || "").trim()];
    const classroom = (r["Classroom"] || "").trim();
    const classType = (r["Class Type"] || "").trim();

    const dateMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

    if (!dateMatch || !timeMatch || dow === undefined || !classroom || !classType) {
      errors.push(`Row ${i + 2}: could not read date/time/room/type`);
      return;
    }

    let hour = Number(timeMatch[1]) % 12;
    if (/pm/i.test(timeMatch[3])) hour += 12;

    const toInt = (v) => {
      const n = parseInt(String(v ?? "").trim(), 10);
      return Number.isFinite(n) ? n : 0;
    };
    const util = String(r["% Utilization"] || "").trim().replace("%", "");

    rows.push({
      session_date: `${dateMatch[3]}-${String(dateMatch[1]).padStart(2, "0")}-${String(dateMatch[2]).padStart(2, "0")}`,
      start_time: `${String(hour).padStart(2, "0")}:${timeMatch[2]}`,
      day_of_week: dow,
      classroom,
      class_type: classType,
      instructors: (r["Instructors"] || "").trim(),
      has_substitute: (r["Has Substitute?"] || "").trim() === "true",
      is_free: (r["Class Is Free?"] || "").trim() === "true",
      checked_in: toInt(r["Checked In Reservations"]),
      late_cancelled: toInt(r["Late Cancelled Reservations"]),
      no_showed: toInt(r["No Showed Reservations"]),
      layout_capacity: toInt(r["Layout Capacity"]),
      actual_capacity: toInt(r["Actual Capacity"]),
      utilization: util && !Number.isNaN(Number(util)) ? Number(util) : null,
    });
  });

  return { rows, errors };
}

export { addDaysStr, parseDateStr, toDateStr };
