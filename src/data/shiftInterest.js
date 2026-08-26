// Month metadata + day/room labels for the teaching-shift interest form
// (/scheduleinterest) and the admin "Shift Interest" tab in Studio Spaces.
//
// The actual slot list lives in Supabase (shift_interest_slots) so admins can
// mark a shift filled, add one, or remove one from the dashboard without a
// deploy. This file only knows which months exist and how days/rooms are
// labeled and ordered. To run the form for a new month: append a month object
// here, flip the `open` flags, then add its slots from the admin tab.
//
// A slot's identity everywhere (form, admin grid, database) is its key:
// `${day.id}-${room.id}-${HHMM}`, e.g. "mon-lv-0600". Keys are validated by
// regex in Supabase, so day/room ids must not change.

export const SHIFT_ROOMS = [
  { id: "lv", name: "Little Village Sculpt Room", short: "Little Village" },
  { id: "gp", name: "Gage Park Flow Room", short: "Gage Park" },
];

// Canonical week order for grids and sorting.
export const SHIFT_DAYS = [
  { id: "mon", label: "Monday", short: "Mon" },
  { id: "tue", label: "Tuesday", short: "Tue" },
  { id: "wed", label: "Wednesday", short: "Wed" },
  { id: "thu", label: "Thursday", short: "Thu" },
  { id: "fri", label: "Friday", short: "Fri" },
  { id: "sat", label: "Saturday", short: "Sat" },
  { id: "sun", label: "Sunday", short: "Sun" },
];

export const shiftInterestMonths = [
  {
    slug: "2026-09",
    label: "September 2026",
    // While true, /scheduleinterest accepts submissions for this month.
    open: true,
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

// Parse a key back into its parts for display ("mon-lv-0600").
export function parseSlotKey(key) {
  const [dayId, roomId, hhmm] = key.split("-");
  return { dayId, roomId, time: `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` };
}

export function describeSlotKey(key) {
  const { dayId, roomId, time } = parseSlotKey(key);
  const day = SHIFT_DAYS.find((d) => d.id === dayId);
  const room = SHIFT_ROOMS.find((r) => r.id === roomId);
  return `${day?.short || dayId} ${formatSlotTime(time)} · ${room?.short || roomId}`;
}

// Group Supabase slot rows ({slot_key, status, ...}) into ordered
// day -> room -> slot structure for rendering. Days and rooms with no slots
// are omitted. Each slot carries { key, time, status, row } (row = the
// original record, so the admin tab keeps ids for updates).
export function groupSlots(slotRows) {
  const byDayRoom = new Map();
  for (const row of slotRows || []) {
    const { dayId, roomId, time } = parseSlotKey(row.slot_key);
    const mapKey = `${dayId}|${roomId}`;
    if (!byDayRoom.has(mapKey)) byDayRoom.set(mapKey, []);
    byDayRoom.get(mapKey).push({ key: row.slot_key, time, status: row.status, row });
  }

  return SHIFT_DAYS.flatMap((day) => {
    const rooms = SHIFT_ROOMS.flatMap((room) => {
      const slots = byDayRoom.get(`${day.id}|${room.id}`);
      if (!slots?.length) return [];
      slots.sort((a, b) => a.time.localeCompare(b.time));
      return [{ room, slots }];
    });
    return rooms.length ? [{ day, rooms }] : [];
  });
}

// Rooms that appear anywhere in a slot list, in canonical order.
export function slotRooms(slotRows) {
  const ids = new Set((slotRows || []).map((row) => parseSlotKey(row.slot_key).roomId));
  return SHIFT_ROOMS.filter((room) => ids.has(room.id));
}
