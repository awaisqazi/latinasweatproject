// Calendar utilities for substitute requests.
// The org operates in America/Chicago and a sub request's start_time is a
// wall-clock time. We emit that wall-clock time as a *floating* local datetime
// plus an explicit America/Chicago timezone, so the calendar event lands at the
// correct Chicago time no matter what timezone the admin or recipient is in.
const SUB_TIMEZONE = "America/Chicago";

const pad = (n) => String(n).padStart(2, "0");

// Date -> "YYYYMMDDTHHMMSS" using the date's LOCAL components (no UTC shift).
function formatFloating(date) {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}00`
  );
}

// "...Z" UTC stamp, used only for DTSTAMP (creation time).
function formatUtc(date) {
  return date.toISOString().replace(/[-:]|\.\d+/g, "");
}

export function generateSubCalendarLink(request) {
  const title = encodeURIComponent(`Sub: ${request.className} - Latina Sweat Project`);
  const details = encodeURIComponent(
    `Substituting for ${request.requestedBy?.name || "Instructor"}. ${request.notes || ""}`,
  );
  const location = encodeURIComponent(
    request.location || "949 W 16th St, Chicago, IL 60608",
  );

  const start = formatFloating(request.date);
  const endDate = new Date(request.date.getTime() + (request.duration || 60) * 60000);
  const end = formatFloating(endDate);

  return (
    `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}` +
    `&dates=${start}/${end}&ctz=${encodeURIComponent(SUB_TIMEZONE)}` +
    `&details=${details}&location=${location}&sf=true&output=xml`
  );
}

export function generateSubICSFile(request) {
  const title = `Sub: ${request.className} - Latina Sweat Project`;
  const description = `Substituting for ${request.requestedBy?.name || "Instructor"}. ${request.notes || ""}`;
  const location = request.location || "949 W 16th St, Chicago, IL 60608";

  const start = formatFloating(request.date);
  const endDate = new Date(request.date.getTime() + (request.duration || 60) * 60000);
  const end = formatFloating(endDate);
  const now = formatUtc(new Date());

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Latina Sweat Project//Sub Request//EN",
    "BEGIN:VEVENT",
    `UID:${request.id}@latinasweatproject.org`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${SUB_TIMEZONE}:${start}`,
    `DTEND;TZID=${SUB_TIMEZONE}:${end}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  return URL.createObjectURL(blob);
}
