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

// September offers Little Village only; Gage Park has no open shifts this
// round (leave a room's array out, or empty, and it disappears from the form
// and the admin grid). Days with no slots are hidden too.
export const shiftInterestMonths = [
  {
    slug: "2026-09",
    label: "September 2026",
    // While true, /scheduleinterest accepts submissions for this month.
    open: true,
    days: [
      { id: "mon", label: "Monday", short: "Mon", slots: { lv: ["08:00"] } },
      { id: "tue", label: "Tuesday", short: "Tue", slots: { lv: ["07:00"] } },
      { id: "wed", label: "Wednesday", short: "Wed", slots: { lv: ["07:00", "08:00"] } },
      { id: "thu", label: "Thursday", short: "Thu", slots: {} },
      { id: "fri", label: "Friday", short: "Fri", slots: { lv: ["06:00"] } },
      { id: "sat", label: "Saturday", short: "Sat", slots: {} },
      { id: "sun", label: "Sunday", short: "Sun", slots: { lv: ["08:00"] } },
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

// Rooms that actually offer at least one shift in a month; the form and the
// admin grid only render these.
export function monthRooms(month) {
  return SHIFT_ROOMS.filter((room) =>
    month.days.some((day) => (day.slots[room.id] || []).length > 0),
  );
}

// Days that offer at least one shift in a month.
export function monthDays(month) {
  return month.days.filter((day) =>
    SHIFT_ROOMS.some((room) => (day.slots[room.id] || []).length > 0),
  );
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
