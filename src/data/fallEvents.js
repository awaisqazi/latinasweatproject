// Fall 2026 ticketed events at La Villita Park (2800 S Sacramento Ave):
// two classes on Halloween (Sat Oct 31) and LSP Día de los Muertos (Sun
// Nov 1). Single source of truth for every surface that shows them:
// /events (#fall-events cards), the homepage events carousel and the
// homepage Día de los Muertos weekend spotlight, /links (#ddlm-card,
// #halloween-card), the Pop Up Week 4 cross-link (PopUpWeekSchedule +
// PopUpWeekBand), /checkin ("Fall events" group) and /diadelosmuertos (the
// weekend page: Sat Oct 31 program, Sun Nov 1 program, lineup, flyers).
//
// Facts are binding: read straight off the live Zeffy forms (Latina Sweat
// Cares), first on Oct 20 2026 and re-read Oct 26 2026, plus the two
// program flyers (marketing/fall-events/flyers/); see
// marketing/fall-events/BRIEF.md and BRIEF-ddlm-weekend-2026-10-26.md.
// Zeffy wins over flyer and banner text for prices. Copy rules: no em
// dashes (en dash for ranges, "·"), never "free class(es)" (the kids class
// is "Free registration"; the ofrendas and the market are "Free, open to
// all"), never print "donation" as a price, no address beyond 2800 S
// Sacramento Ave, never guess who is pictured in a banner, class leaders
// by FIRST NAME only (Sunday: Yaritza, Savannah, Zoraida, Luz, exactly as
// Zeffy writes them; Saturday: Ariesna and Lucia for kids yoga, Vanessa and
// Veronica for Banda Pilates + Sculpt, confirmed by Fez 2026-10-26 from his
// project tracker), never surnames. Saturday extras confirmed the same day
// from the tracker's partners sheet: hot drinks at the ofrendas; warm meals
// from Organic Life and grocery bags from Sharing Access (150 bags, so
// always "while supplies last") during the 11:00 AM block.
//
// OPEN QUESTIONS (carried for Fez, do not "fix" without him):
// - RESOLVED 2026-10-26 (Fez): Zeffy is the source of truth for prices.
//   Both flyers print "DONATION" for Banda Pilates + Sculpt and for Día de
//   los Muertos, but the forms charge $15 and $20 and the site prints that;
//   never print "donation" as a price.
// - RESOLVED 2026-10-26 (Fez, from his project tracker): Saturday class
//   leaders are Ariesna and Lucia (kids yoga) and Vanessa and Veronica
//   (Banda Pilates + Sculpt), first names only; the Saturday giveaways (hot
//   drinks, Organic Life warm meals, Sharing Access grocery bags while
//   supplies last) are confirmed. Leader avatars: ddlmWeekend.classLeaders
//   carries an optional `avatar` per person (null = not sourced yet,
//   rendered as an initials circle in the /diadelosmuertos lineup).
// - The green "SE" logo on the Oct 31 flyer is unidentified. It is left
//   off the site (supporters are printed as text, see ddlmWeekend).
// - Kids Halloween Yoga: no age range, and the Zeffy page says
//   "child-parent class" but sells one free General Admission ticket, so it
//   is unclear whether each child or each family registers. The site says
//   only "Free registration" and does not invent a rule.
// - Día de los Muertos end time: ANSWERED by the Nov 1 flyer and the Zeffy
//   run of show ("8PM END"), so the site prints "4:00 – 8:00 PM" and an
//   "8:00 PM · End" row. The Zeffy header still says 4 to 9 PM ("full
//   access 4pm-9pm"); endsAtISO stays at 9 PM so nothing hides early. If
//   9 PM is right, change timeLabel and the last runOfShow row.
// - Live Banda Pilates + Yoga Sculpt banner: the Zeffy form still shows the
//   Oct 20 art that prints "Banda La Enkantadora"; the site card now uses a
//   crop of the Oct 31 program flyer instead. Zeffy needs a re-upload (Fez).
// (Resolved and removed: the 2800 vs 3800 S Sacramento address, confirmed
// 2800 on Oct 22, though the kids banner art still prints 3800; the 30
// minute banda class, confirmed 12:30 to 1:00 PM by the Oct 31 flyer.)
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
    summary: "A child-parent yoga class in costume with Ariesna and Lucia: little ones move, breathe, and stretch in community.",
    summaryEs: "Una clase de yoga para compartir en familia, con disfraz, con Ariesna y Lucia: los más peques se mueven, respiran y se estiran en comunidad.",
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
    // Class leaders, first names only (Fez, 2026-10-26, project tracker).
    people: ["Ariesna", "Lucia"],
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
      // Since Oct 26 this is a square crop of the Oct 31 program flyer
      // (marketing/fall-events/flyers/oct31-halloween-program.png), which
      // names Banda Cerro Azul. The Zeffy art saved Oct 20 printed the band
      // announced then (Banda La Enkantadora) in large type, so it was
      // retired here; Zeffy itself still shows it (re-upload = Fez).
      alt: "Halloween at La Villita Park, October 31, 2026: the day's program on an illustrated Halloween yoga pattern, from the 9:00 AM ofrendas to Banda Pilates + Sculpt at 12:30 PM. Prices and registration on Zeffy.",
    },
    summary: "A full-body workout with Vanessa and Veronica, and Banda Cerro Azul playing live.",
    summaryEs: "Un entrenamiento de cuerpo completo con Vanessa y Veronica, y Banda Cerro Azul tocando en vivo.",
    description: [
      "Live Banda Pilates + Yoga Sculpt is a full-body workout with Banda Cerro Azul playing live.",
      "We move, sweat, and flow together, centering our community with love and intention.",
    ],
    descriptionEs: [
      "Pilates + Yoga Sculpt con Banda Cerro Azul tocando en vivo: un entrenamiento de cuerpo completo.",
      "Nos movemos, sudamos y fluimos juntos, con la comunidad al centro, con amor e intención.",
    ],
    note: "Limited mats will be available for rent, first come first served.",
    noteEs: "Habrá pocos mats para rentar, por orden de llegada.",
    lineup: ["Banda Cerro Azul"],
    // Class leaders, first names only (Fez, 2026-10-26, project tracker).
    people: ["Vanessa", "Veronica"],
    trackingKey: "live_banda_pilates",
  },
  {
    id: "dia-de-los-muertos",
    slug: "lsp-dia-de-los-muertos",
    title: "LSP Día de los Muertos",
    titleEs: "LSP Día de los Muertos",
    zeffyTitle: "LSP Dia de los Muertos",
    date: "2026-11-01",
    // CST (-06:00) after DST ends. End = 9 PM per the Zeffy header so
    // nothing hides early; the site PRINTS 8:00 PM (flyer + Zeffy run of
    // show, see OPEN QUESTIONS).
    dateISO: { start: "2026-11-01T16:00:00-06:00", end: "2026-11-01T21:00:00-06:00" },
    day: "Sunday",
    dayShort: "Sun",
    dayShortEs: "Dom",
    dateLabel: "Nov 1",
    dateLabelEs: "1 Nov",
    dateLong: "Sunday, November 1",
    // 8 PM end per the flyer and the Zeffy run of show (see OPEN QUESTIONS).
    timeLabel: "4:00 – 8:00 PM",
    timeLabelEs: "4:00 – 8:00 PM",
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
    // Run of show as on Zeffy and the Nov 1 flyer (the 5:30 to 6:00 PM gap
    // is in the source), ending with the "8PM END" row. First names only.
    runOfShow: [
      { time: "4:00 – 5:00 PM", title: "Banda El Pueblo", detail: "Ofrenda viewing" },
      { time: "5:00 – 5:30 PM", title: "Mariachi Sirenas + gentle yoga", detail: "With Yaritza and Savannah" },
      { time: "6:00 – 7:00 PM", title: "Danza Azteca", detail: "By Kalpulli Xochykalli" },
      { time: "7:00 – 7:45 PM", title: "Stages of grief meditation + sound bowls", detail: "With Zoraida and Luz" },
      { time: "8:00 PM", title: "End", detail: "Hasta la próxima" },
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

// Sat Oct 31 run of show at La Villita Park, in order, from the Oct 31
// program flyer (marketing/fall-events/flyers/oct31-halloween-program.png).
// Prices follow Zeffy, not the flyer (the flyer prints "DONATION" for the
// banda class; Zeffy charges $15, see OPEN QUESTIONS). The two classes
// point at their fall event (Zeffy form + waiver) via registration.eventId;
// the ofrendas and the market have no form: "Free, open to all". `short`
// is the compact title for the homepage spotlight's mini program. Leaders
// and giveaways (hot drinks, Organic Life warm meals, Sharing Access grocery
// bags while supplies last) confirmed by Fez 2026-10-26. `detail` keeps its
// first word capitalised and any proper names as written (consumers that
// fold it into a sentence lowercase the first letter only).
export const halloweenProgram = [
  {
    time: "9:00 – 10:30 AM",
    title: "Ofrendas",
    short: "Ofrendas",
    titleEs: "Ofrendas",
    detail: "Community altars + hot drinks",
    detailEs: "Altares comunitarios + bebidas calientes",
    price: "Free, open to all",
    priceEs: "Gratis, abierto a todos",
    registration: null,
    startsAtISO: "2026-10-31T09:00:00-05:00",
    endsAtISO: "2026-10-31T10:30:00-05:00",
  },
  {
    time: "10:30 – 11:00 AM",
    title: "Kids Yoga class",
    short: "Kids yoga",
    titleEs: "Clase de yoga para niñas y niños",
    detail: "With Ariesna and Lucia · a child-parent class in costume. Registration on Zeffy.",
    detailEs: "Con Ariesna y Lucia · una clase para compartir en familia, con disfraz. Registro en Zeffy.",
    price: "Free registration",
    priceEs: "Registro gratuito",
    registration: { eventId: "kids-halloween-yoga" },
    startsAtISO: "2026-10-31T10:30:00-05:00",
    endsAtISO: "2026-10-31T11:00:00-05:00",
  },
  {
    time: "11:00 AM – 12:30 PM",
    title: "Banda Cerro Azul",
    short: "Banda Cerro Azul + trick or treat",
    titleEs: "Banda Cerro Azul",
    detail: "Farmers market + trick or treat · warm meals from Organic Life + grocery bags from Sharing Access, while supplies last",
    detailEs: "Mercado de agricultores + dulce o truco · comida caliente de Organic Life + despensas de Sharing Access, mientras duren",
    price: "Free, open to all",
    priceEs: "Gratis, abierto a todos",
    registration: null,
    startsAtISO: "2026-10-31T11:00:00-05:00",
    endsAtISO: "2026-10-31T12:30:00-05:00",
  },
  {
    time: "12:30 – 1:00 PM",
    title: "Banda Pilates + Sculpt",
    short: "Banda Pilates + Sculpt",
    titleEs: "Pilates + Sculpt con banda",
    detail: "With Vanessa and Veronica · Banda Cerro Azul playing live. Registration on Zeffy.",
    detailEs: "Con Vanessa y Veronica · Banda Cerro Azul tocando en vivo. Registro en Zeffy.",
    price: "$15",
    priceEs: "$15",
    registration: { eventId: "live-banda-pilates-yoga-sculpt" },
    startsAtISO: "2026-10-31T12:30:00-05:00",
    endsAtISO: "2026-10-31T13:00:00-05:00",
  },
];

// Shared copy for the Día de los Muertos weekend (Sat Oct 31 Halloween at
// La Villita Park + Sun Nov 1 Día de los Muertos): /diadelosmuertos, the
// homepage spotlight, /events #fall-events. Supporters are text only (no
// logos; the "SE" mark on the Oct 31 flyer is unidentified and left off).
export const ddlmWeekend = {
  title: "Día de los Muertos weekend",
  titleEs: "Fin de semana de Día de los Muertos",
  dateLabel: "Oct 31 + Nov 1",
  dateLabelEs: "31 Oct + 1 Nov",
  saturdayLabel: "Halloween at La Villita Park",
  saturdayLabelEs: "Halloween en La Villita Park",
  sundayLabel: "Día de los Muertos",
  sundayLabelEs: "Día de los Muertos",
  summary:
    "Saturday morning brings ofrendas, kids yoga, Banda Cerro Azul, a farmers market and trick or treat; Sunday evening we remember our loved ones with community altars, gentle yoga, grief meditation and sound bowls, banda, mariachi and danza azteca.",
  summaryEs:
    "El sábado por la mañana hay ofrendas, yoga para niñas y niños, Banda Cerro Azul, mercado de agricultores y dulce o truco; el domingo por la tarde recordamos a nuestros seres queridos con altares comunitarios, yoga suave, meditación del duelo y cuencos de sonido, banda, mariachi y danza azteca.",
  supportersLine:
    "Made possible in part by the Chicago Department of Public Health's Community-Centered Wellness Micro-Grant, with support from Organic Life and State Representative Edgar Gonzalez, Jr. (23rd House District).",
  lineup: {
    saturday: [{ name: "Banda Cerro Azul", detail: "11:00 AM set + the 12:30 PM Banda Pilates + Sculpt" }],
    sunday: [
      { name: "Banda El Pueblo", detail: "4:00 PM · Ofrenda viewing" },
      { name: "Mariachi Sirenas", detail: "5:00 PM · With gentle yoga" },
      { name: "Kalpulli Xochykalli", detail: "6:00 PM · Danza Azteca" },
    ],
  },
  // Class leaders by first name only (Sunday exactly as Zeffy writes them;
  // Saturday confirmed by Fez 2026-10-26 from his project tracker). `day`
  // lets pages hide the Saturday pairs after halloweenEndISO (`pastAt`).
  // `leaders[].avatar` is optional: a path under public/ (the Pop Up
  // instructor headshots) or null until sourced; not rendered yet.
  classLeaders: [
    {
      names: "Yaritza and Savannah",
      detail: "Gentle yoga · Sun 5:00 PM",
      day: "sunday",
      pastAt: null,
      leaders: [
        { name: "Yaritza", avatar: "images/popup/instructors/yaritza-jurado-160.webp" },
        { name: "Savannah", avatar: "images/popup/instructors/savannah-alvarez-160.webp" },
      ],
    },
    {
      names: "Zoraida and Luz",
      detail: "Grief meditation + sound bowls · Sun 7:00 PM",
      day: "sunday",
      pastAt: null,
      leaders: [
        { name: "Zoraida", avatar: "images/popup/instructors/zoraida-magana-160.webp" },
        { name: "Luz", avatar: "images/popup/instructors/luz-rodriguez-160.webp" },
      ],
    },
    {
      names: "Ariesna and Lucia",
      detail: "Kids yoga · Sat 10:30 AM",
      day: "saturday",
      pastAt: halloweenEndISO,
      leaders: [
        { name: "Ariesna", avatar: "images/popup/instructors/ariesna-garcia-sedano-160.webp" },
        { name: "Lucia", avatar: "images/popup/instructors/lucia-del-rincon-martinez-160.webp" },
      ],
    },
    {
      names: "Vanessa and Veronica",
      detail: "Banda Pilates + Sculpt · Sat 12:30 PM",
      day: "saturday",
      pastAt: halloweenEndISO,
      leaders: [
        { name: "Vanessa", avatar: "images/popup/instructors/vanessa-tirado-160.webp" },
        { name: "Veronica", avatar: "images/popup/instructors/vero-quinones-160.webp" },
      ],
    },
  ],
  startsAtISO: "2026-10-31T09:00:00-05:00",
  endsAtISO: ddlmEvent.endsAtISO,
  // Sunday doors (the countdown chips count to Saturday 9 AM, then to this).
  sundayStartsAtISO: ddlmEvent.startsAtISO,
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
    lines.push({
      text: "Halloween at La Villita Park, Sat Oct 31: ofrendas, kids yoga, banda + trick or treat",
      pastAt: halloweenEndISO,
    });
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
