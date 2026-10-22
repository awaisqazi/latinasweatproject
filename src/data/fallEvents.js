// Fall 2026 ticketed events at La Villita Park (2800 S Sacramento Ave):
// two classes on Halloween (Sat Oct 31) and LSP Día de los Muertos (Sun
// Nov 1). Single source of truth for every surface that shows them:
// /events (#fall-events cards), the homepage events carousel, /links
// (#halloween-card for the Oct 31 double-header, #ddlm-card), the Pop Up
// Week 4 cross-link (PopUpWeekSchedule + PopUpWeekBand), /checkin ("Fall
// events" group) and /diadelosmuertos (ticket CTA, facts, run of show).
//
// Facts are binding: read straight off the live Zeffy forms (Latina Sweat
// Cares) on Oct 20 2026, see marketing/fall-events/BRIEF.md + events.json.
// Zeffy page values win over banner text. Copy rules: no em dashes (en
// dash for ranges, "·"), never "free class(es)" (the kids class is "Free
// registration"), no address beyond 2800 S Sacramento Ave, never guess who
// is pictured in a banner.
//
// OPEN QUESTIONS (carried for Fez, do not "fix" without him):
// - Kids Halloween Yoga: RESOLVED 2026-10-22, Fez confirmed the address is
//   2800 S Sacramento Ave, Chicago, IL 60608 (La Villita Park). The banner
//   art still prints "3800 S SACRAMENTO" because it is the Zeffy art as
//   published; swap the image here once the Zeffy banner is fixed.
// - Kids Halloween Yoga: no age range, and the Zeffy page says
//   "child-parent class" but sells one free General Admission ticket, so it
//   is unclear whether each child or each family registers. The site says
//   only "Free registration" and does not invent a rule.
// - Live Banda Pilates + Yoga Sculpt: Zeffy says 12:30 to 1:00 PM (30
//   minutes). Shown as listed; confirm it is not a placeholder end time.
// - Live Banda Pilates + Yoga Sculpt: the banner shows two instructor
//   headshots with no names anywhere. Instructors are NOT named on the site.
// - Día de los Muertos: the Zeffy header and ticket copy say 4 to 9 PM
//   ("full access 4pm-9pm"), the run of show and banner say "8PM END". The
//   site shows the 4:00 PM start only ("From 4:00 PM") and never promises
//   an end time; endsAtISO uses 9 PM (Zeffy) so nothing hides early.
// - Día de los Muertos: Zeffy names no venue, only the address, which is
//   La Villita Park's address (same as the Oct 31 events).
// - Día de los Muertos class leaders appear by FIRST NAME only on Zeffy
//   (Yaritza, Savannah, Zoraida, Luz). Use them exactly as written; never
//   expand to full names.
//
// Check-in links are signed Zeffy bearer links (staff only): they appear
// on the noindex /checkin page and nowhere public.

const VENUE = {
  venue: "La Villita Park",
  address: "2800 S Sacramento Ave",
  addressFull: "2800 S Sacramento Ave, Chicago, IL 60608",
  neighborhood: "La Villita",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=2800+S+Sacramento+Ave+Chicago+IL+60608",
};

const toMs = (now) => (now instanceof Date ? now.getTime() : new Date(now).getTime());

export const fallEvents = [
  {
    id: "kids-halloween-yoga",
    slug: "kids-yoga-registration",
    title: "Kids Halloween Yoga",
    titleEs: "Yoga de Halloween para niñas y niños",
    zeffyTitle: "Kids Yoga Registration",
    date: "2026-10-31",
    // CDT (-05:00): DST ends Nov 1.
    dateISO: { start: "2026-10-31T10:30:00-05:00", end: "2026-10-31T11:00:00-05:00" },
    day: "Saturday",
    dayShort: "Sat",
    dayShortEs: "Sáb",
    dateLabel: "Oct 31",
    dateLabelEs: "31 Oct",
    dateLong: "Saturday, October 31",
    timeLabel: "10:30 – 11:00 AM",
    startTimeLabel: "10:30 AM",
    ...VENUE,
    price: 0,
    priceLine: "Free registration",
    priceLineEs: "Registro gratuito",
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/kids-yoga-registration",
    ticketsLabel: "Register",
    ticketsLabelEs: "Regístrate",
    formId: "711470b8-583f-48d9-a087-369830ef36ec",
    checkInFormId: "711470b8-583f-48d9-a087-369830ef36ec",
    // Signed Zeffy check-in manager link; EXPIRES Sun Nov 1 2026, 10:00 AM CST.
    checkInUrl:
      "https://www.zeffy.com/en-US/checkin-manager/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdhbml6YXRpb25JZCI6Ijc4MzFkYjM2LWJlNWQtNGU4My05OGZmLWVkMTdmZjViOWE0NSIsInRpY2tldGluZ0lkIjoiNzExNDcwYjgtNTgzZi00OGQ5LWEwODctMzY5ODMwZWYzNmVjIiwiaWF0IjoxNzkyNTQwMTk3LCJleHAiOjE3OTM1NDg4MDB9.LHcgYjD3JBfS78zSfa1c1AyNeJR59YKF-_jdxw6qoOI",
    banner: {
      webp: "images/events/fall-2026/kids-halloween-yoga.webp",
      jpg: "images/events/fall-2026/kids-halloween-yoga.jpg",
      width: 800,
      height: 800,
      // The art prints "3800 S Sacramento" (see OPEN QUESTIONS); the alt
      // text does not repeat an address.
      alt: "Kids Halloween Yoga, October 31, 2026, 10:30 to 11:00 AM at La Villita Park: illustrated kids in costumes doing yoga poses.",
    },
    summary: "A child-parent yoga class in costume: little ones move, breathe, and stretch in community.",
    summaryEs: "Una clase de yoga para compartir en familia, con disfraz: los más peques se mueven, respiran y se estiran en comunidad.",
    // Zeffy description, verbatim minus the emoji.
    description: [
      "Kids Yoga with Latina Sweat Cares is a child-parent class where little ones move, breathe, and stretch in community. Kids are guided to explore balance, focus, and rest through simple poses, stories, and games.",
    ],
    descriptionEs: [
      "Yoga para Niñas y Niños con Latina Sweat Cares es una clase para compartir en familia, donde los más peques se mueven, respiran y se estiran en comunidad. A través de posturas sencillas, cuentos y juegos, las niñas y los niños aprenden a explorar el equilibrio, la concentración y el descanso.",
    ],
    // Banner-only perk (not on the Zeffy page).
    note: "Wear a costume to receive a free kids mat while supplies last.",
    noteEs: "Ven disfrazado y recibe un mat para niños gratis mientras duren.",
    lineup: [],
    people: [],
    trackingKey: "kids_halloween_yoga",
  },
  {
    id: "live-banda-pilates-yoga-sculpt",
    slug: "live-banda-pilates-yoga-sculpt",
    title: "Live Banda Pilates + Yoga Sculpt",
    titleEs: "Pilates + Yoga Sculpt con banda en vivo",
    zeffyTitle: "Live Banda Pilates + Yoga Sculpt",
    date: "2026-10-31",
    dateISO: { start: "2026-10-31T12:30:00-05:00", end: "2026-10-31T13:00:00-05:00" },
    day: "Saturday",
    dayShort: "Sat",
    dayShortEs: "Sáb",
    dateLabel: "Oct 31",
    dateLabelEs: "31 Oct",
    dateLong: "Saturday, October 31",
    // 30 minutes as listed on Zeffy (see OPEN QUESTIONS).
    timeLabel: "12:30 – 1:00 PM",
    startTimeLabel: "12:30 PM",
    ...VENUE,
    price: 15,
    priceLine: "$15",
    priceLineEs: "$15",
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/live-banda-pilates-yoga-sculpt",
    ticketsLabel: "Get tickets",
    ticketsLabelEs: "Boletos",
    formId: "19dea858-b1ad-4f61-93bb-5d2b7c0f9669",
    checkInFormId: "19dea858-b1ad-4f61-93bb-5d2b7c0f9669",
    // Signed Zeffy check-in manager link; EXPIRES Sun Nov 1 2026, 12:00 PM CST.
    checkInUrl:
      "https://www.zeffy.com/en-US/checkin-manager/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdhbml6YXRpb25JZCI6Ijc4MzFkYjM2LWJlNWQtNGU4My05OGZmLWVkMTdmZjViOWE0NSIsInRpY2tldGluZ0lkIjoiMTlkZWE4NTgtYjFhZC00ZjYxLTkzYmItNWQyYjdjMGY5NjY5IiwiaWF0IjoxNzkyNTQwMjA2LCJleHAiOjE3OTM1NTYwMDB9.bmvIxEkTAXyBsN-xdq8CTT8fe5_mXg5vf46PwbUjouA",
    banner: {
      webp: "images/events/fall-2026/live-banda-pilates-yoga-sculpt.webp",
      jpg: "images/events/fall-2026/live-banda-pilates-yoga-sculpt.jpg",
      width: 800,
      height: 800,
      // Two instructor headshots are on the art; never name or describe them.
      alt: "Live Banda Pilates + Yoga Sculpt flyer: Banda La Enkantadora, 10.31.2026, 12:30 to 1:00 PM at La Villita Park.",
    },
    summary: "A full-body workout with Banda La Enkantadora playing live.",
    summaryEs: "Un entrenamiento de cuerpo completo con Banda La Enkantadora tocando en vivo.",
    description: [
      "Live Banda Pilates + Yoga Sculpt is a full-body workout with Banda La Enkantadora playing live.",
      "We move, sweat, and flow together, centering our community with love and intention.",
    ],
    descriptionEs: [
      "Pilates + Yoga Sculpt con Banda La Enkantadora tocando en vivo: un entrenamiento de cuerpo completo.",
      "Nos movemos, sudamos y fluimos juntos, con la comunidad al centro, con amor e intención.",
    ],
    note: "Limited mats will be available for rent, first come first served.",
    noteEs: "Habrá pocos mats para rentar, por orden de llegada.",
    lineup: ["Banda La Enkantadora"],
    // Instructors deliberately not listed (see OPEN QUESTIONS).
    people: [],
    trackingKey: "live_banda_pilates",
  },
  {
    id: "dia-de-los-muertos",
    slug: "lsp-dia-de-los-muertos",
    title: "LSP Día de los Muertos",
    titleEs: "LSP Día de los Muertos",
    zeffyTitle: "LSP Dia de los Muertos",
    date: "2026-11-01",
    // CST (-06:00) after DST ends. End = 9 PM per the Zeffy header (the run
    // of show says 8 PM; the site never prints an end time).
    dateISO: { start: "2026-11-01T16:00:00-06:00", end: "2026-11-01T21:00:00-06:00" },
    day: "Sunday",
    dayShort: "Sun",
    dayShortEs: "Dom",
    dateLabel: "Nov 1",
    dateLabelEs: "1 Nov",
    dateLong: "Sunday, November 1",
    timeLabel: "From 4:00 PM",
    timeLabelEs: "Desde las 4:00 PM",
    startTimeLabel: "4:00 PM",
    ...VENUE,
    price: 20,
    priceLine: "$20 General Admission",
    priceLineEs: "$20 Admisión general",
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-dia-de-los-muertos",
    ticketsLabel: "Get tickets",
    ticketsLabelEs: "Boletos",
    formId: "64aafa83-c336-428c-98ff-d1625b9257b8",
    checkInFormId: "64aafa83-c336-428c-98ff-d1625b9257b8",
    // Signed Zeffy check-in manager link; EXPIRES Mon Nov 2 2026, 9:00 PM CST.
    checkInUrl:
      "https://www.zeffy.com/en-US/checkin-manager/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdhbml6YXRpb25JZCI6Ijc4MzFkYjM2LWJlNWQtNGU4My05OGZmLWVkMTdmZjViOWE0NSIsInRpY2tldGluZ0lkIjoiNjRhYWZhODMtYzMzNi00MjhjLTk4ZmYtZDE2MjViOTI1N2I4IiwiaWF0IjoxNzkyNTQwMTg2LCJleHAiOjE3OTM2NzQ4MDB9.YDBXCMWhyWqQFq2CNX6o8XCugrqL7FZK9yrRyZht7LE",
    banner: {
      webp: "images/events/fall-2026/dia-de-los-muertos.webp",
      jpg: "images/events/fall-2026/dia-de-los-muertos.jpg",
      width: 800,
      height: 800,
      alt: "LSP Día de los Muertos, November 1, 2026: the run of show over an ofrenda with marigolds and candles, with the Banda El Pueblo and Mariachi Sirenas logos.",
    },
    pagePath: "diadelosmuertos",
    summary: "Our space to remember and celebrate our loved ones together: community altars, gentle yoga, grief meditation and sound bowls, banda, mariachi and danza azteca.",
    summaryEs: "Nuestro espacio para recordar y celebrar juntos a nuestros seres queridos: altares comunitarios, yoga suave, meditación del duelo y cuencos de sonido, banda, mariachi y danza azteca.",
    description: [
      "LSP Día de los Muertos is our space to remember and celebrate our loved ones together. We honor our ancestors through cultura, community, and greet them with our community altars.",
      "Your ticket includes full access to the program. Re-entry is allowed, and we encourage you to visit the neighborhood's local small businesses while in the area.",
    ],
    checkInLine:
      "Check-in for classes opens 15 minutes before class start and closes 5 minutes after the instructor begins.",
    note: "Limited mats will be available for rent, please bring your own if you can.",
    noteEs: "Habrá pocos mats para rentar, trae el tuyo si puedes.",
    // Run of show as on Zeffy (the 5:30 to 6:00 PM gap is in the source;
    // the "8PM END" row is left out, see OPEN QUESTIONS). First names only.
    runOfShow: [
      { time: "4:00 – 5:00 PM", title: "Banda El Pueblo", detail: "Ofrenda viewing" },
      { time: "5:00 – 5:30 PM", title: "Mariachi Sirenas + gentle yoga", detail: "With Yaritza and Savannah" },
      { time: "6:00 – 7:00 PM", title: "Danza Azteca", detail: "By Kalpulli Xochykalli" },
      { time: "7:00 – 7:45 PM", title: "Stages of grief meditation + sound bowls", detail: "With Zoraida and Luz" },
    ],
    lineup: ["Banda El Pueblo", "Mariachi Sirenas", "Kalpulli Xochykalli (Danza Azteca)"],
    people: ["Yaritza", "Savannah", "Zoraida", "Luz"],
    trackingKey: "dia_de_los_muertos",
  },
].map((e) => ({
  ...e,
  startsAtISO: e.dateISO.start,
  endsAtISO: e.dateISO.end,
  anchor: e.id,
  // True once this event's end instant has passed.
  isPast: (now = new Date()) => toMs(now) > Date.parse(e.dateISO.end),
}));

export const fallEventById = (id) => fallEvents.find((e) => e.id === id);
export const halloweenEvents = fallEvents.filter((e) => e.date === "2026-10-31");
export const ddlmEvent = fallEventById("dia-de-los-muertos");

// Events that have not ended yet (build time; FallEventsClient re-checks in
// the browser via data-fall-past-at).
export const activeFallEvents = (now = new Date()) => fallEvents.filter((e) => !e.isPast(now));
export const lastFallEndISO = ddlmEvent.endsAtISO;
export const isHalloweenActive = (now = new Date()) => halloweenEvents.some((e) => !e.isPast(now));
export const halloweenEndISO = halloweenEvents[halloweenEvents.length - 1].endsAtISO;

// Copy for the Oct 31 double-header (/links card, cross-links).
export const halloweenAtLaVillita = {
  title: "Halloween at La Villita Park",
  titleEs: "Halloween en La Villita Park",
  dateLabel: "Sat Oct 31",
  dateLabelEs: "Sáb 31 Oct",
};

// "Also this week" cross-link lines for a Pop Up week (Week 4 holds both
// days): one line per day that falls inside the week, each hiding once its
// last event has ended. Links to /events#fall-events.
export const fallCrossLinkLines = (week, now = new Date()) => {
  const start = Date.parse(week.startsAtISO);
  const end = Date.parse(week.endsAtISO);
  const inWeek = (e) => {
    const t = Date.parse(e.startsAtISO);
    return t >= start && t <= end;
  };
  const lines = [];
  if (halloweenEvents.some(inWeek) && isHalloweenActive(now)) {
    lines.push({ text: "Halloween yoga at La Villita Park, Sat Oct 31", pastAt: halloweenEndISO });
  }
  if (inWeek(ddlmEvent) && !ddlmEvent.isPast(now)) {
    lines.push({ text: "Día de los Muertos at La Villita Park, Sun Nov 1", pastAt: ddlmEvent.endsAtISO });
  }
  return lines;
};

// Exact Zeffy URL -> GA4 conversion event (used by /links). The two Oct 31
// classes are class registrations; Día de los Muertos is an event ticket.
export const fallTicketEventFor = (url = "") => {
  const e = fallEvents.find((x) => x.ticketsUrl === url);
  if (!e) return undefined;
  return e.id === "dia-de-los-muertos" ? "ddlm_ticket_click" : "class_booking_start";
};

// data-conversion-* attributes for an event's Zeffy CTA.
export const fallConversionAttrs = (e, context) => ({
  "data-conversion-event": e.id === "dia-de-los-muertos" ? "ddlm_ticket_click" : "class_booking_start",
  "data-conversion-context": context,
  "data-conversion-provider": "zeffy",
  "data-conversion-booking-path": "fall_events_zeffy",
  "data-conversion-fall-event": e.trackingKey,
});
