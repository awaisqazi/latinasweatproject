// Shared helpers for the LSP Pop Up weeks (src/data/popUpWeek1.js to
// src/data/popUpWeek4.js, combined in src/data/popUpWeeks.js). Each week
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

// Day labels for a "MM-DD" date: ["Monday", "Mon", "Oct 19"] (Nov 1 ->
// "Nov 1"). Computed from the calendar so any week works; a week may still
// pass its own map to makeSessionFactory (Weeks 1 and 2 do).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const dayLabels = (md, year = "2026") => {
  const [m, d] = md.split("-").map(Number);
  const day = WEEKDAYS[new Date(Date.UTC(Number(year), m - 1, d)).getUTCDay()];
  return [day, day.slice(0, 3), `${MONTHS[m - 1]} ${d}`];
};

// America/Chicago UTC offset ("-05:00" CDT, "-06:00" CST) for a local
// date + "HH:MM", so startsAt instants stay right across the DST change
// (Sun Nov 1 2026 is CST). Uses Intl, so it works at build time and in Node.
export const chicagoOffset = (isoDate, hhmm) => {
  const guess = Date.parse(`${isoDate}T${hhmm}:00Z`) + 6 * 60 * 60 * 1000;
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "shortOffset" })
    .formatToParts(new Date(guess))
    .find((p) => p.type === "timeZoneName").value; // "GMT-5"
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return "-06:00";
  return `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}`;
};

// Session factory for one week. `days` (optional) maps "MM-DD" -> [day,
// dayShort, dateLabel]; dates it does not list use dayLabels(). Each
// session is a 45-minute class; `startsAt` is a full ISO timestamp in
// America/Chicago local time (CDT -05:00, CST -06:00 from Nov 1 2026) so
// "next up" compares real instants. `instructors` stays an array of
// full-name strings (consumers join it as text); `people` is the same list
// as instructorInfo objects.
// `extra` carries optional fields such as `note` (e.g. a holiday label)
// and `cancelled: true` (Oct 9 2026): a cancelled class stays listed (people
// may have seen it) but renders struck through with a "Cancelled" tag, and
// is excluded from "Next up", the teachers rows and every class count (use
// the helpers below, never `location.sessions.length`).
export const makeSessionFactory = (days = {}, year = "2026") => (loc, md, hhmm, time, className, instructors, extra = {}) => {
  const [day, dayShort, dateLabel] = days[md] ?? dayLabels(md, year);
  const date = `${year}-${md}`;
  return {
    cancelled: false,
    id: `${loc}-${md}-${hhmm.replace(":", "")}`,
    date,
    startsAt: `${date}T${hhmm}:00${chicagoOffset(date, hhmm)}`,
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

// A "No classes" day for a location's closedDays list.
export const closedDay = (md, year = "2026") => {
  const [day, dayShort, dateLabel] = dayLabels(md, year);
  return { date: `${year}-${md}`, day, dayShort, dateLabel };
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

// CHECK-IN LINKS (volunteers check people in at the door from /checkin).
// Zeffy's check-in manager link is a SIGNED per-form URL
// (https://www.zeffy.com/en-US/checkin-manager/<JWT>), so it cannot be built
// from a form id. Each location (and each Finish Line class) carries its
// own explicit `checkInUrl` string, copied from that form's campaign hub >
// Guest list > Check-in manager; `checkInFormId` is kept for reference only.
// The links collected Oct 12 2026 EXPIRE around Oct 12 2027 (JWT exp): copy
// fresh ones from Zeffy if they are still needed then. A location whose
// `checkInUrl` is null renders a disabled "Link coming" button on /checkin.
// Source of the current set: marketing/popup-week3-4/checkin-links.json.

// Classes going ahead (cancelled excluded).
export const sessionCount = (locations) => locations.reduce((n, l) => n + activeSessions(l).length, 0);

// How many locations a week has, for copy that must not hardcode "two"
// (Week 3 has three: Southside Social joins for one class, Oct 12 2026).
// Neighborhood = loc.neighborhood, else the part of shortLabel before " · "
// ("Pilsen · Halsted & 19th" -> "Pilsen"). Returns
// { count, en: "Three locations", es: "Tres lugares", places: [...],
//   placesLabel: "Pilsen & Back of the Yards" }.
const COUNT_EN = ["", "One", "Two", "Three", "Four", "Five", "Six"];
const COUNT_ES = ["", "Un", "Dos", "Tres", "Cuatro", "Cinco", "Seis"];
export const locationsSummary = (week) => {
  const count = week.locations.length;
  const places = [];
  for (const l of week.locations) {
    const n = l.neighborhood ?? String(l.shortLabel ?? "").split(" · ")[0];
    if (n && !places.includes(n)) places.push(n);
  }
  const word = (list, n) => list[n] ?? String(n);
  return {
    count,
    en: `${word(COUNT_EN, count)} location${count === 1 ? "" : "s"}`,
    es: `${word(COUNT_ES, count)} lugar${count === 1 ? "" : "es"}`,
    places,
    placesLabel: places.join(" & "),
  };
};
