// Single source of truth for the teaching-shift interest form
// (/scheduleinterest) and the admin "Shift Interest" tab in Studio Spaces.
//
// Each month lists exactly the shifts that are open for interest. To run the
// form for a new month: append a month object (copy September and edit the
// slot times), flip its `open` to true, and set the old month's `open` to
// false. Old submissions stay archived in Supabase under their month slug.
//
// Times are 24h "HH:MM" strings. A slot's identity everywhere (form, admin
// grid, database) is its key: `${day.id}-${room.id}-${HHMM}`, e.g.
// "mon-lv-0600". Keys must match the regex enforced by the
// submit_shift_interest RPC in Supabase, so keep day/room ids as-is.

export const SHIFT_ROOMS = [
  { id: "lv", name: "Little Village Sculpt Room", short: "Little Village" },
  { id: "gp", name: "Gage Park Flow Room", short: "Gage Park" },
];

// Monday through Friday share the same slot template.
const WEEKDAY_LV = ["06:00", "07:00", "08:00", "12:00", "17:30", "18:30", "19:30", "20:30"];
const WEEKDAY_GP = ["06:30", "07:30", "08:30", "17:00", "18:00", "19:00", "20:00"];

export const shiftInterestMonths = [
  {
    slug: "2026-09",
    label: "September 2026",
    // While true, /scheduleinterest accepts submissions for this month.
    open: true,
    days: [
      { id: "mon", label: "Monday", short: "Mon", slots: { lv: WEEKDAY_LV, gp: WEEKDAY_GP } },
      { id: "tue", label: "Tuesday", short: "Tue", slots: { lv: WEEKDAY_LV, gp: WEEKDAY_GP } },
      { id: "wed", label: "Wednesday", short: "Wed", slots: { lv: WEEKDAY_LV, gp: WEEKDAY_GP } },
      { id: "thu", label: "Thursday", short: "Thu", slots: { lv: WEEKDAY_LV, gp: WEEKDAY_GP } },
      { id: "fri", label: "Friday", short: "Fri", slots: { lv: WEEKDAY_LV, gp: WEEKDAY_GP } },
      {
        id: "sat",
        label: "Saturday",
        short: "Sat",
        slots: {
          lv: ["07:00", "08:00", "09:15", "10:30", "11:30"],
          gp: ["07:15", "08:15", "09:30", "10:45", "11:45"],
        },
      },
      {
        id: "sun",
        label: "Sunday",
        short: "Sun",
        slots: {
          lv: ["07:00", "08:00", "09:15", "10:30", "17:30", "18:30"],
          gp: ["07:15", "08:15", "09:30"],
        },
      },
    ],
  },
];

export const activeShiftMonth =
  shiftInterestMonths.find((m) => m.open) ||
  shiftInterestMonths[shiftInterestMonths.length - 1];

export const SERVICE_CLASS_MIN = 1;
export const SERVICE_CLASS_MAX = 25;

export function slotKey(dayId, roomId, time) {
  return `${dayId}-${roomId}-${time.replace(":", "")}`;
}

export function formatSlotTime(time) {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

// Every valid slot key for a month, for validating and for the admin grid.
export function monthSlotKeys(month) {
  const keys = [];
  for (const day of month.days) {
    for (const room of SHIFT_ROOMS) {
      for (const time of day.slots[room.id] || []) {
        keys.push(slotKey(day.id, room.id, time));
      }
    }
  }
  return keys;
}

// Parse a key back into its parts for display ("mon-lv-0600").
export function parseSlotKey(key) {
  const [dayId, roomId, hhmm] = key.split("-");
  return { dayId, roomId, time: `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` };
}

export function describeSlotKey(key, month = activeShiftMonth) {
  const { dayId, roomId, time } = parseSlotKey(key);
  const day = month.days.find((d) => d.id === dayId);
  const room = SHIFT_ROOMS.find((r) => r.id === roomId);
  return `${day?.short || dayId} ${formatSlotTime(time)} · ${room?.short || roomId}`;
}
