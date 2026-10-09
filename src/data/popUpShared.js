// Shared helpers for the LSP Pop Up weeks (src/data/popUpWeek1.js,
// src/data/popUpWeek2.js, combined in src/data/popUpWeeks.js). Each week
// file holds only its own facts (copy, ISO bounds, locations, sessions);
// everything that is the same from week to week lives here so the weeks
// never drift apart.

// Instructor avatars. The slug is the full name lowercased, ASCII-folded,
// spaces -> hyphens ("Vero Quiñones" -> "vero-quinones"); that mapping is the
// ONLY identity source (never guess who is in a photo). Square face-centred
// transparent webps live at public/images/popup/instructors/<slug>.webp
// (320px) and <slug>-160.webp, built by
// `python3 scripts/render-popup-instructor-avatars.py` from the cutouts in
// marketing/popup-week1/instructors/. Names listed here have no photo and
// render an initials circle instead.
export const INSTRUCTORS_WITHOUT_PHOTO = new Set(["Rosa Ortega"]);
export const instructorSlug = (name) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export const instructorInitials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
// { name, slug, initials, photo, photoSmall } ; photo paths are relative to
// BASE_URL (prefix with import.meta.env.BASE_URL), null when there is none.
export const instructorInfo = (name) => {
  const slug = instructorSlug(name);
  const has = !INSTRUCTORS_WITHOUT_PHOTO.has(name);
  return {
    name,
    slug,
    initials: instructorInitials(name),
    photo: has ? `images/popup/instructors/${slug}.webp` : null,
    photoSmall: has ? `images/popup/instructors/${slug}-160.webp` : null,
  };
};

// Session factory for one week. `days` maps "MM-DD" -> [day, dayShort,
// dateLabel]. Each session is a 45-minute class; `startsAt` is a full ISO
// timestamp (America/Chicago, CDT = -05:00) so "next up" compares real
// instants. `instructors` stays an array of full-name strings (consumers
// join it as text); `people` is the same list as instructorInfo objects.
// `extra` carries optional fields such as `note` (e.g. a holiday label)
// and `cancelled: true` (Oct 9 2026): a cancelled class stays listed (people
// may have seen it) but renders struck through with a "Cancelled" tag, and
// is excluded from "Next up", the teachers rows and every class count (use
// the helpers below, never `location.sessions.length`).
export const makeSessionFactory = (days, year = "2026") => (loc, md, hhmm, time, className, instructors, extra = {}) => {
  const [day, dayShort, dateLabel] = days[md];
  return {
    cancelled: false,
    id: `${loc}-${md}-${hhmm.replace(":", "")}`,
    date: `${year}-${md}`,
    startsAt: `${year}-${md}T${hhmm}:00-05:00`,
    day,
    dayShort,
    dateLabel,
    time,
    className,
    instructors,
    people: instructors.map(instructorInfo),
    ...extra,
  };
};

// Sessions that are going ahead (not cancelled).
export const activeSessions = (location) => location.sessions.filter((s) => !s.cancelled);

// Unique instructors at a location (cancelled classes excluded), in
// first-appearance order.
export const locationInstructors = (location) => {
  const seen = new Map();
  for (const s of activeSessions(location)) for (const p of s.people) if (!seen.has(p.name)) seen.set(p.name, p);
  return [...seen.values()];
};

// Sessions grouped by calendar day (for the /popup day-grouped lists). A
// day's `note` is the first session note that day (e.g. "Indigenous
// Peoples Day"). Cancelled sessions stay in their day, so a day whose only
// classes are cancelled still shows (with the cancelled rows), never
// "No classes".
export const groupSessionsByDay = (location) => {
  const days = [];
  for (const s of location.sessions) {
    let d = days.find((x) => x.date === s.date);
    if (!d) {
      d = { date: s.date, day: s.day, dayShort: s.dayShort, dateLabel: s.dateLabel, sessions: [], closed: false, note: null };
      days.push(d);
    }
    if (s.note && !d.note) d.note = s.note;
    d.sessions.push(s);
  }
  for (const c of location.closedDays ?? []) {
    days.push({ ...c, sessions: [], closed: true, note: null });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
};

export const toMs = (now = new Date()) => (now instanceof Date ? now.getTime() : new Date(now).getTime());

// "upcoming" before startsAtISO, "live" through endsAtISO, "past" after.
export const weekPhase = (week, now = new Date()) => {
  const t = toMs(now);
  if (t < Date.parse(week.startsAtISO)) return "upcoming";
  if (t <= Date.parse(week.endsAtISO)) return "live";
  return "past";
};

// Classes going ahead (cancelled excluded).
export const sessionCount = (locations) => locations.reduce((n, l) => n + activeSessions(l).length, 0);
