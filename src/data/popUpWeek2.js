// Pop Up Week 2: LSP's second pop-up class week, Oct 12 to Oct 18, 2026,
// directly after Pop Up Week 1 (src/data/popUpWeek1.js), same two Pilsen
// locations, same shape as that file. Listed with Week 1 in
// src/data/popUpWeeks.js, which every surface reads.
//
// Facts are binding (marketing/popup-week2/BRIEF.md, read from the two live
// Zeffy forms Oct 6 2026): instructor FULL NAMES exactly as written ("Vero
// Quiñones" keeps the ñ; "Jay Pena" stays as written); every class is 45
// minutes; the Mon Oct 12 Chicago Art Dept classes carry the
// "Indigenous Peoples Day" note. Revised the same day (brief REVISION
// block): Thu Oct 15 6 PM is Yoga Sculpt with Alondra Alcazar and Sat Oct
// 17 9 AM is Yoga Sculpt with Yaritza Jurado (the CAD form was edited). What to bring, verbatim: "Bring water and
// your mat, limited mats available for rent." Copy rules: never call these
// "free classes"; no em dashes (en dash for ranges); no new address.
//
// The Wed Oct 14 7:00 PM class at Chicago Art Dept is The Collective Finish
// Line post-marathon flow (its own Zeffy form, src/data/collectiveFinishLine.js),
// not part of this week's form, so it is not listed here.
import { popUpWeek1 } from "./popUpWeek1.js";
import { makeSessionFactory, weekPhase, sessionCount } from "./popUpShared.js";

export const popUpWeek2 = {
  // Shared copy and palette come from Week 1 (same campaign, same lines).
  ...popUpWeek1,
  id: "week-2",
  number: 2,
  title: "Pop Up Week 2",
  pagePath: "popup",
  dateRangeLabel: "Oct 12 · Oct 18",
  // En dash for ranges, never an em dash.
  dateRangeShort: "Oct 12 – 18",
  eyebrow: "Pop Up Week 2 · October 12 – 18",
  datePill: "October 12 – 18",
  throughLabel: "Oct 12 through Oct 18",
  trackingWeek: "week_2",
  startsAtISO: "2026-10-12T00:00:00-05:00",
  endsAtISO: "2026-10-18T23:59:59-05:00",
  ogImage: "images/popup/og-popup-week2.jpg",
  ogImageAlt:
    "Pop Up Week 2, October 12 – 18: LSP classes at Chicago Art Department and Sanctuary Health in Pilsen.",
  highlightImage: "images/highlights/hl_popup2.png",
  highlightLabel: { en: "Pop Up Wk 2", es: "Pop Up Sem 2" },
};

const session = makeSessionFactory({
  "10-12": ["Monday", "Mon", "Oct 12"],
  "10-13": ["Tuesday", "Tue", "Oct 13"],
  "10-14": ["Wednesday", "Wed", "Oct 14"],
  "10-15": ["Thursday", "Thu", "Oct 15"],
  "10-16": ["Friday", "Fri", "Oct 16"],
  "10-17": ["Saturday", "Sat", "Oct 17"],
  "10-18": ["Sunday", "Sun", "Oct 18"],
});
const holiday = { note: "Indigenous Peoples Day" };

export const popUpWeek2Locations = [
  {
    id: "chicago-art-department",
    name: "Chicago Art Department",
    lockup: ["Chicago", "Art", "Dept"],
    shortName: "Chicago Art Dept",
    shortLabel: "Pilsen · Halsted & 19th",
    address: "1926 S Halsted St, Chicago, IL 60608",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=1926+S+Halsted+St+Chicago+IL+60608",
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-at-chicago-art-department-week--2",
    ticketsLabel: "Reserve at Chicago Art Dept",
    ticketsLabelEs: "Reserva en Chicago Art Dept",
    conversionEvent: "class_booking_start",
    trackingLocation: "chicago_art_department",
    priceLine: "Pay what you can",
    priceLineEs: "Paga lo que puedas",
    capacityLine: "Up to 75 mats per class",
    capacityLineEs: "Hasta 75 mats por clase",
    theme: "light",
    closedDays: [],
    sessions: [
      session("cad", "10-12", "06:00", "6:00 AM", "Yoga Flow", ["Lizette Vega", "Anabel Hernandez"], holiday),
      session("cad", "10-12", "18:00", "6:00 PM", "Yoga Flow", ["Savannah Alvarez", "Jessica Eguia"], holiday),
      session("cad", "10-13", "06:00", "6:00 AM", "Yoga Sculpt", ["Andrea Fuentes"]),
      session("cad", "10-13", "18:00", "6:00 PM", "Yoga Sculpt", ["Amayrani Nunez"]),
      session("cad", "10-14", "06:00", "6:00 AM", "Yoga Sculpt", ["Vero Quiñones"]),
      session("cad", "10-14", "18:00", "6:00 PM", "Yoga Sculpt", ["Vanessa Tirado"]),
      session("cad", "10-15", "06:00", "6:00 AM", "Strength Training", ["Jay Pena"]),
      session("cad", "10-15", "18:00", "6:00 PM", "Yoga Sculpt", ["Alondra Alcazar"]),
      session("cad", "10-16", "06:00", "6:00 AM", "Yoga Flow", ["Sarah Esparza", "Gisella Mitchell"]),
      // Roster spelling is "Yari Jurado" (MarianaTek employee 6166; confirmed same person Oct 6 2026); display name follows the Zeffy form.
      session("cad", "10-17", "09:00", "9:00 AM", "Yoga Sculpt", ["Yaritza Jurado"]),
      session("cad", "10-18", "10:00", "10:00 AM", "Yoga Flow", ["Brenda Maldonado"]),
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
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-at-sanctuary-health-week--2",
    ticketsLabel: "Reserve at Sanctuary Health",
    ticketsLabelEs: "Reserva en Sanctuary Health",
    conversionEvent: "class_booking_start",
    trackingLocation: "sanctuary_health",
    priceLine: "$10 per mat",
    priceLineEs: "$10 por mat",
    capacityLine: "Space limited to 12 mats per class",
    capacityLineEs: "Cupo limitado a 12 mats por clase",
    theme: "dark",
    // Sat Oct 17: no classes at this location.
    closedDays: [{ date: "2026-10-17", day: "Saturday", dayShort: "Sat", dateLabel: "Oct 17" }],
    sessions: [
      session("sanc", "10-12", "06:00", "6:00 AM", "Yoga Flow", ["Marelin Enriquez", "Celina Huerta"]),
      session("sanc", "10-13", "06:00", "6:00 AM", "Yoga Flow", ["Ghazala Irshad", "Benjamin Drury"]),
      session("sanc", "10-14", "06:00", "6:00 AM", "Yoga Flow", ["Kellyn Mitchell", "Antonia Rosales"]),
      session("sanc", "10-15", "06:00", "6:00 AM", "Yoga Flow", ["Jiana Calixto", "Savannah Alvarez"]),
      session("sanc", "10-15", "20:30", "8:30 PM", "Yoga Flow", ["Jade Nguyen", "Xochyl Perez"]),
      session("sanc", "10-16", "06:00", "6:00 AM", "Yoga Flow", ["Dinorah Zubieta"]),
      session("sanc", "10-18", "20:00", "8:00 PM", "Yoga Flow", ["Rosa Ortega", "Courtney Luedke"]),
    ],
  },
];

export const popUpWeek2SessionCount = sessionCount(popUpWeek2Locations);
export const popUpWeek2Full = { ...popUpWeek2, locations: popUpWeek2Locations };
export const getPopUpWeek2Phase = (now = new Date()) => weekPhase(popUpWeek2, now);
