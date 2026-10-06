// Pop Up Week 1: LSP's first pop-up class week, Oct 5 to Oct 11, 2026.
// Programming at 949 W 16th St is paused (LSP is being displaced); this fall LSP is pop-up
// across Pilsen while the permanent home is built (opening early 2027).
//
// Single source of truth for every surface that mentions the week:
// /popup (the campaign page), the homepage hero + "A New Chapter" band,
// /schedule, /classes, /events, and /links. Two locations, each with its
// own Zeffy ticketing form (direct links, never iframes).
//
// Facts are binding (campaign brief, Sep 28 2026): instructor FULL NAMES,
// verified against the MarianaTek roster, exactly as written ("Vero
// Quiñones" keeps the ñ; "Jay Pena" stays as written); every class is 45
// minutes. Do not "correct" names or add sessions. What to bring:
// "Bring water and your mat, limited mats available for rent." Copy rule: never call these "free classes".
//
// Auto-hide: getPopUpPhase(now) returns "upcoming" | "live" | "past" from
// the ISO bounds below. The site is static, so each surface checks the
// phase at build time AND carries data-popup-hide-when-past so the small
// client script (PopUpWeekClient) hides CTAs in browsers after Oct 11 even
// if nobody rebuilds. /popup itself stays up and says the week has wrapped.
//
// Multi-week (Oct 6 2026): shared helpers live in src/data/popUpShared.js
// (re-exported below so these exports stay stable) and the ordered list of
// weeks plus the "current week" helpers live in src/data/popUpWeeks.js.
// Week 2 (Oct 12 to 18) is src/data/popUpWeek2.js, same shape as this file.
import {
  instructorSlug,
  instructorInitials,
  instructorInfo,
  makeSessionFactory,
  locationInstructors,
  groupSessionsByDay,
  weekPhase,
  sessionCount,
} from "./popUpShared.js";

export { instructorSlug, instructorInitials, instructorInfo, locationInstructors, groupSessionsByDay };

export const popUpWeek1 = {
  id: "week-1",
  number: 1,
  title: "Pop Up Week 1",
  shortTitle: "Pop Up Week",
  pagePath: "popup",
  dateRangeLabel: "Oct 5 · Oct 11",
  // En dash for ranges, never an em dash.
  dateRangeShort: "Oct 5 – 11",
  eyebrow: "Pop Up Week 1 · October 5 – 11",
  // "October 5 – 11" (hero pill) and "Oct 5 through Oct 11" (band body).
  datePill: "October 5 – 11",
  throughLabel: "Oct 5 through Oct 11",
  // GA4 param popup_week on Zeffy CTAs (data-conversion-popup-week).
  trackingWeek: "week_1",
  ogImage: "images/popup/og-popup-week1.jpg",
  ogImageAlt:
    "Pop Up Week 1, October 5 – 11: LSP classes at Chicago Art Department and Sanctuary Health in Pilsen.",
  highlightImage: "images/highlights/hl_popup.png",
  highlightLabel: { en: "Pop Up Wk 1", es: "Pop Up Sem 1" },
  startsAtISO: "2026-10-05T00:00:00-05:00",
  endsAtISO: "2026-10-11T23:59:59-05:00",
  headline: "LSP Pop Up · Pilsen",
  body:
    "Programming at our studio is paused, so this week the classes come to the " +
    "neighborhood. Two locations, one week, the same community. Pick a " +
    "class and reserve your spot. Bring water and your mat, limited mats " +
    "available for rent.",
  blurb:
    "Join us for community-centered fitness and wellness designed so our " +
    "communities feel seen, empowered, and welcomed. Expect grounding " +
    "practices, sweat, and space to breathe: no perfection, just people " +
    "showing up as they are.",
  supportLine:
    "Your registration supports Latina Sweat programs and keeps classes " +
    "and community events accessible.",
  changeOfPlansLine:
    "If your plans change, email collab@latinasweatproject.com so another " +
    "community member can take your spot.",
  changeOfPlansEmail: "collab@latinasweatproject.com",
  classLengthLabel: "45 min",
  // What-to-bring line, verbatim (final user wording, Sep 28 2026).
  matsLine: "Bring water and your mat, limited mats available for rent.",
  matsLineEs: "Trae agua y tu mat, hay pocos mats disponibles para rentar.",
  wrappedLine: "This week has wrapped. Gracias for moving with us.",
  // Palette from the campaign IG graphics (cream / terracotta / ink).
  colors: {
    cream: "#F3EDE4",
    paper: "#FDFBF7",
    terracotta: "#C4573A",
    ink: "#1E1A17",
    mustard: "#E0A83A",
    muted: "#6F6760",
  },
};

// Session helper: 45-minute class (see makeSessionFactory in popUpShared.js).
const session = makeSessionFactory({
  "10-05": ["Monday", "Mon", "Oct 5"],
  "10-06": ["Tuesday", "Tue", "Oct 6"],
  "10-07": ["Wednesday", "Wed", "Oct 7"],
  "10-08": ["Thursday", "Thu", "Oct 8"],
  "10-09": ["Friday", "Fri", "Oct 9"],
  "10-10": ["Saturday", "Sat", "Oct 10"],
  "10-11": ["Sunday", "Sun", "Oct 11"],
});

export const popUpLocations = [
  {
    id: "chicago-art-department",
    name: "Chicago Art Department",
    lockup: ["Chicago", "Art", "Dept"],
    shortName: "Chicago Art Dept",
    shortLabel: "Pilsen · Halsted & 19th",
    address: "1926 S Halsted St, Chicago, IL 60608",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=1926+S+Halsted+St+Chicago+IL+60608",
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-at-chicago-art-depart",
    ticketsLabel: "Reserve at Chicago Art Dept",
    ticketsLabelEs: "Reserva en Chicago Art Dept",
    // Zeffy class registrations count as class booking intent (design.md
    // section 13: Zeffy class CTAs use class_booking_start); the location
    // rides along as a param.
    conversionEvent: "class_booking_start",
    trackingLocation: "chicago_art_department",
    priceLine: "Pay what you can",
    priceLineEs: "Paga lo que puedas",
    capacityLine: "Up to 75 mats per class",
    capacityLineEs: "Hasta 75 mats por clase",
    theme: "light",
    closedDays: [],
    sessions: [
      session("cad", "10-05", "06:00", "6:00 AM", "Yoga Flow", ["Giselle Castaneda", "Lizette Vega"]),
      session("cad", "10-05", "18:00", "6:00 PM", "Yoga Flow", ["Jessica Eguia", "Savannah Alvarez"]),
      session("cad", "10-06", "06:00", "6:00 AM", "Yoga Sculpt", ["Andrea Fuentes"]),
      session("cad", "10-06", "18:00", "6:00 PM", "Yoga Sculpt", ["Amayrani Nunez"]),
      session("cad", "10-06", "19:00", "7:00 PM", "Yoga Flow", ["Kellyn Mitchell", "Antonia Rosales", "Gisella Mitchell"]),
      session("cad", "10-07", "06:00", "6:00 AM", "Yoga Sculpt", ["Vero Quiñones"]),
      session("cad", "10-08", "06:00", "6:00 AM", "Strength Training", ["Jay Pena"]),
      session("cad", "10-08", "18:00", "6:00 PM", "Yoga Sculpt", ["Rut Merida"]),
      session("cad", "10-09", "06:00", "6:00 AM", "Yoga Flow", ["Gisella Mitchell", "Sarah Esparza"]),
      session("cad", "10-10", "09:00", "9:00 AM", "Pilates", ["Ashley Reitz"]),
      session("cad", "10-11", "10:00", "10:00 AM", "Yoga Flow", ["Brenda Maldonado"]),
    ],
  },
  {
    id: "sanctuary-health",
    name: "Sanctuary Health",
    lockup: ["Sanctuary", "Health"],
    shortName: "Sanctuary Health",
    shortLabel: "Pilsen · Racine & 19th",
    address: "1843 S Racine Ave, Chicago, IL 60608",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=1843+S+Racine+Ave+Chicago+IL+60608",
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-at-sanctuary-health",
    ticketsLabel: "Reserve at Sanctuary Health",
    ticketsLabelEs: "Reserva en Sanctuary Health",
    conversionEvent: "class_booking_start",
    trackingLocation: "sanctuary_health",
    priceLine: "$10 per mat",
    priceLineEs: "$10 por mat",
    capacityLine: "Space limited to 12 mats per class",
    capacityLineEs: "Cupo limitado a 12 mats por clase",
    theme: "dark",
    // Sat Oct 10: no classes at this location.
    closedDays: [{ date: "2026-10-10", day: "Saturday", dayShort: "Sat", dateLabel: "Oct 10" }],
    sessions: [
      session("sanc", "10-05", "06:00", "6:00 AM", "Yoga Flow", ["Jocelyn Vega", "Marelin Enriquez"]),
      session("sanc", "10-06", "06:00", "6:00 AM", "Yoga Flow", ["Ghazala Irshad", "Benjamin Drury"]),
      session("sanc", "10-07", "06:00", "6:00 AM", "Yoga Flow", ["Celina Huerta", "Anabel Hernandez"]),
      session("sanc", "10-08", "06:00", "6:00 AM", "Yoga Flow", ["Marlene Garcia", "Jiana Calixto"]),
      session("sanc", "10-08", "20:30", "8:30 PM", "Yoga Flow", ["Xochyl Perez", "Jade Nguyen"]),
      session("sanc", "10-09", "06:00", "6:00 AM", "Yoga Flow", ["Dinorah Zubieta"]),
      session("sanc", "10-11", "20:00", "8:00 PM", "Yoga Flow", ["Courtney Luedke", "Rosa Ortega"]),
    ],
  },
];

export const popUpSessionCount = sessionCount(popUpLocations);

// The week as one object (copy + locations), the shape popUpWeeks.js lists.
export const popUpWeek1Full = { ...popUpWeek1, locations: popUpLocations };

// "upcoming" before Oct 5, "live" Oct 5 to Oct 11, "past" after. (Week 1
// only; multi-week surfaces use currentPopUpWeek() from popUpWeeks.js.)
export const getPopUpPhase = (now = new Date()) => weekPhase(popUpWeek1, now);
export const isPopUpLive = (now = new Date()) => getPopUpPhase(now) === "live";
export const isPopUpActive = (now = new Date()) => getPopUpPhase(now) !== "past";

// Exact Zeffy URL -> GA4 conversion event (Week 1 only; /links uses the
// all-weeks version in popUpWeeks.js).
export const popUpTicketEventFor = (url = "") =>
  popUpLocations.find((l) => l.ticketsUrl === url)?.conversionEvent;
