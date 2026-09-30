// The Collective Finish Line: LSP's three-part series around the Chicago
// Marathon (Sun Oct 11, 2026). A pre-marathon yoga flow (Mon Oct 5), a
// cheer zone on marathon day (Sun Oct 11), and a post-marathon restorative
// flow (Wed Oct 14).
//
// Single source of truth for every surface that mentions the series:
// /finishline (the campaign page), the homepage Monday Miles note and
// events-carousel card, /events (featured section #finishline), /links
// (#finishline-card + "Finish Line" bubble) and the /popup cross-link.
//
// Facts are binding (verified against the live Zeffy forms, Sep 30 2026):
// instructor FULL NAMES exactly as written, 7:00 to 7:45 PM at Chicago Art
// Department, General Admission pay what you can (suggested $10), 70 mats
// per class. The cheer zone has no ticket and no Zeffy form. Copy rules:
// never "free classes", no em dashes (en dash for ranges), never guess who
// is pictured in the flyer photos and never caption faces.
//
// Auto-hide: getFinishLinePhase(now) returns "upcoming" | "live" | "past"
// from the ISO bounds below. The site is static, so each surface checks the
// phase at build time AND carries data-finishline-hide-when-past so the
// small client script (FinishLineClient) hides CTAs in browsers after Oct
// 14 even if nobody rebuilds. Each event also carries its own end instant
// (data-finishline-past-at) so a class that already happened reads as done
// while the series is still live. /finishline itself stays up as a record.

export const collectiveFinishLine = {
  title: "The Collective Finish Line",
  // Three stacked headline lines, as on the flyer.
  headlineLines: ["The", "Collective", "Finish Line"],
  pagePath: "finishline",
  eyebrow: "Chicago Marathon week · October 5 – 14",
  dateRangeShort: "Oct 5 – 14",
  datePills: ["Oct 5", "Oct 11", "Oct 14"],
  startsAtISO: "2026-10-05T00:00:00-05:00",
  endsAtISO: "2026-10-14T23:59:59-05:00",
  // Flyer supporting copy (reused as written, minus the exclamation).
  supportingLine:
    "Get marathon-ready with two special yoga flows focused on strength, " +
    "mobility, and recovery.",
  cheerLine:
    "Plus, join us at the Latina Sweat Project cheer zone on marathon day " +
    "to celebrate and support runners.",
  welcomeLine:
    "Runners, walkers, cheerers and everyone in between are welcome. No " +
    "experience needed.",
  whatToExpect: ["Yoga Flow", "Community", "Motivational talk by seasoned runners"],
  priceLine: "Pay what you can · suggested $10",
  priceLineEs: "Paga lo que puedas · sugerido $10",
  capacityLine: "70 mats",
  capacityLineEs: "70 mats",
  admissionLine: "General Admission · one ticket = one space",
  classLengthLabel: "45 min",
  // What-to-bring line, verbatim.
  matsLine: "Bring water and your mat, limited mats available for rent.",
  matsLineEs: "Trae agua y tu mat, hay pocos mats disponibles para rentar.",
  supportLine:
    "Your registration supports Latina Sweat programs and keeps classes " +
    "and community events accessible.",
  changeOfPlansLine:
    "If your plans change, email collab@latinasweatproject.com so another " +
    "community member can take your spot.",
  changeOfPlansEmail: "collab@latinasweatproject.com",
  happenedLine: "This one has happened",
  wrappedLine: "Marathon week has wrapped. Gracias for moving and cheering with us.",
  ticketsLabel: "Reserve your mat",
  ticketsLabelEs: "Reserva tu mat",
  // Flyer poster (the whole Canva flyer; never crop faces out of it).
  flyer: {
    webp: "images/finishline/flyer.webp",
    jpg: "images/finishline/flyer.jpg",
    width: 1500,
    height: 2000,
    alt:
      "The Collective Finish Line flyer: yoga flows Oct 5 and Oct 14, 7:00 to 7:45 PM at Chicago Art Department, 1926 S Halsted, plus the LSP cheer zone on marathon day.",
  },
  ogImage: "images/finishline/og-finishline.jpg",
  highlightImage: "images/highlights/hl_finishline.png",
  // Palette from the Canva flyer (torn paper / charcoal / marigold).
  colors: {
    marigold: "#EFBD62",
    charcoal: "#484848",
    paper: "#F0F0EC",
    sheet: "#F7F6F1",
    taupe: "#B0A090",
    white: "#FFFFFF",
    tape: "#9A9A9A",
  },
};

const CAD = {
  venue: "Chicago Art Department",
  venueShort: "Chicago Art Dept",
  address: "1926 S Halsted St, Chicago, IL 60608",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=1926+S+Halsted+St+Chicago+IL+60608",
};

export const finishLineEvents = [
  {
    id: "oct5-flow",
    kind: "class",
    date: "2026-10-05",
    startsAtISO: "2026-10-05T19:00:00-05:00",
    endsAtISO: "2026-10-05T19:45:00-05:00",
    day: "Monday",
    dayShort: "Mon",
    dateLabel: "Oct 5",
    dayShortEs: "Lun",
    dateLabelEs: "5 Oct",
    timeLabel: "7:00 – 7:45 PM",
    title: "Pre-Marathon Yoga Flow",
    titleEs: "Yoga Flow antes del maratón",
    instructor: "Ruthie Maldonado-Delwiche",
    description:
      "A yoga flow with encouraging words and a moment of meditation, " +
      "closed with palo santo. It replaces Monday Miles that night.",
    ...CAD,
    ticketsUrl:
      "https://www.zeffy.com/en-US/ticketing/collective-finish-line-pre-marathon-yoga-flow",
    trackingKey: "oct5_flow",
  },
  {
    id: "oct11-cheer",
    kind: "cheer",
    date: "2026-10-11",
    startsAtISO: "2026-10-11T00:00:00-05:00",
    endsAtISO: "2026-10-11T23:59:59-05:00",
    day: "Sunday",
    dayShort: "Sun",
    dateLabel: "Oct 11",
    dayShortEs: "Dom",
    dateLabelEs: "11 Oct",
    timeLabel: "All day · marathon day",
    title: "Cheer Zone",
    titleEs: "Zona de porras",
    instructor: null,
    description:
      "Marathon day in Pilsen. Come as you are to celebrate and support " +
      "the runners. No ticket needed.",
    venue: "18th & Peoria, Pilsen",
    venueShort: "18th & Peoria",
    address: "18th St & Peoria St, Chicago, IL 60608",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=W+18th+St+and+S+Peoria+St+Chicago+IL+60608",
    ticketsUrl: null,
    trackingKey: "oct11_cheer",
  },
  {
    id: "oct14-restorative",
    kind: "class",
    date: "2026-10-14",
    startsAtISO: "2026-10-14T19:00:00-05:00",
    endsAtISO: "2026-10-14T19:45:00-05:00",
    day: "Wednesday",
    dayShort: "Wed",
    dateLabel: "Oct 14",
    dayShortEs: "Mié",
    dateLabelEs: "14 Oct",
    timeLabel: "7:00 – 7:45 PM",
    title: "Post-Marathon Restorative Flow",
    titleEs: "Flow restaurativo después del maratón",
    instructor: "Monica Ortiz",
    description:
      "A runners' restorative yoga flow to close out marathon week: slow, " +
      "grounding, kind to tired legs.",
    ...CAD,
    ticketsUrl:
      "https://www.zeffy.com/en-US/ticketing/collective-finish-line-post-marathon-restorative-flow",
    trackingKey: "oct14_restorative",
  },
].map((e) => ({
  ...e,
  // True once this event's end instant has passed.
  isPast: (now = new Date()) => toMs(now) > Date.parse(e.endsAtISO),
}));

export const finishLineClasses = finishLineEvents.filter((e) => e.kind === "class");

function toMs(now) {
  return now instanceof Date ? now.getTime() : new Date(now).getTime();
}

// "upcoming" before Oct 5, "live" Oct 5 00:00 to Oct 14 23:59:59 CT, "past" after.
export const getFinishLinePhase = (now = new Date()) => {
  const t = toMs(now);
  if (t < Date.parse(collectiveFinishLine.startsAtISO)) return "upcoming";
  if (t <= Date.parse(collectiveFinishLine.endsAtISO)) return "live";
  return "past";
};
export const isFinishLineActive = (now = new Date()) => getFinishLinePhase(now) !== "past";

// The next event that has not ended yet (null once the series is over).
export const nextFinishLineEvent = (now = new Date()) =>
  finishLineEvents.find((e) => !e.isPast(now)) ?? null;

// Exact Zeffy URL -> GA4 conversion event (used by /links).
export const finishLineTicketEventFor = (url = "") =>
  finishLineClasses.some((e) => e.ticketsUrl === url) ? "class_booking_start" : undefined;

// Presentation helper shared by the web surfaces: a CSS clip-path polygon
// with a deckle / ticket-stub torn top edge (x in %, y in px, deterministic
// per seed so builds are stable). Apply to the sheet; put the soft shadow on
// a wrapper with filter: drop-shadow() because clip-path clips box-shadow.
export const finishLineTornClip = (seed = 7, steps = 48, depth = 10) => {
  let r = seed;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    r = (r * 9301 + 49297) % 233280;
    const y = ((r / 233280) * depth).toFixed(1);
    pts.push(`${((i / steps) * 100).toFixed(2)}% ${y}px`);
  }
  return `polygon(${pts.join(", ")}, 100% 100%, 0% 100%)`;
};
