// Pop Up Week 4: LSP's fourth pop-up class week, Oct 26 to Nov 1, 2026,
// directly after Pop Up Week 3 (src/data/popUpWeek3.js), same two Pilsen
// locations, same shape. Listed in src/data/popUpWeeks.js.
//
// Facts are binding (marketing/popup-week3-4/BRIEF.md, Oct 12 2026): FULL
// NAMES exactly as on the MarianaTek roster; every class is 45 minutes.
// The brief's CAD header says 10 classes but lists 9 (Mon-Fri); the 9
// listed classes are what is here, pending Fez.
// Chicago Art Dept has no weekend classes this week (Sat Oct 31 / Sun Nov
// 1 are simply not listed; a notice line says so). Sanctuary has no
// classes Sat Oct 31. DST ends Sun Nov 1, so that day's instants are CST
// (-06:00): makeSessionFactory picks the offset, and endsAtISO is
// Nov 1 23:59:59 local (-06:00).
// Copy rules: never call these "free classes"; no em dashes; no new address.
//
// Zeffy ticket URLs are the expected slugs of the Week 4 forms (duplicated
// from Week 2); confirm against the live forms.
import { popUpWeek2, popUpWeek2Locations } from "./popUpWeek2.js";
import { makeSessionFactory, closedDay, weekPhase, sessionCount } from "./popUpShared.js";

export const popUpWeek4 = {
  ...popUpWeek2,
  id: "week-4",
  number: 4,
  title: "Pop Up Week 4",
  pagePath: "popup",
  dateRangeLabel: "Oct 26 · Nov 1",
  // En dash for ranges, never an em dash.
  dateRangeShort: "Oct 26 – Nov 1",
  eyebrow: "Pop Up Week 4 · October 26 – November 1",
  datePill: "October 26 – November 1",
  throughLabel: "Oct 26 through Nov 1",
  trackingWeek: "week_4",
  startsAtISO: "2026-10-26T00:00:00-05:00",
  endsAtISO: "2026-11-01T23:59:59-06:00",
  ogImage: "images/popup/og-popup-week4.jpg",
  ogImageAlt:
    "Pop Up Week 4, October 26 – November 1: LSP classes at Chicago Art Department and Sanctuary Health in Pilsen.",
  highlightImage: "images/highlights/hl_popup4.png",
  highlightLabel: { en: "Pop Up Wk 4", es: "Pop Up Sem 4" },
};

const session = makeSessionFactory();
const [cadBase, sancBase] = popUpWeek2Locations;

export const popUpWeek4Locations = [
  {
    ...cadBase,
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-at-chicago-art-department-week--4",
    noticeLine: "No weekend classes at Chicago Art Dept this week.",
    closedDays: [],
    sessions: [
      session("cad", "10-26", "06:00", "6:00 AM", "Yoga Flow", ["Kellyn Mitchell", "Antonia Rosales"]),
      session("cad", "10-26", "18:00", "6:00 PM", "Yoga Flow", ["Courtney Luedke", "Fabiola"]),
      session("cad", "10-27", "06:00", "6:00 AM", "Yoga Sculpt", ["Yaritza Jurado"]),
      session("cad", "10-27", "18:00", "6:00 PM", "Yoga Sculpt", ["Vanessa Tirado"]),
      session("cad", "10-28", "06:00", "6:00 AM", "Yoga Sculpt", ["Vero Quiñones"]),
      session("cad", "10-28", "18:00", "6:00 PM", "Yoga Sculpt", ["Alondra Alcazar"]),
      session("cad", "10-29", "06:00", "6:00 AM", "Strength Training", ["Jay Pena"]),
      session("cad", "10-29", "18:00", "6:00 PM", "Yoga Sculpt", ["Juanita"]),
      session("cad", "10-30", "06:00", "6:00 AM", "Yoga Flow", ["Marelin Enriquez", "Sarah Esparza"]),
    ],
  },
  {
    ...sancBase,
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-at-sanctuary-health-week--4",
    // Sat Oct 31: no classes at this location.
    closedDays: [closedDay("10-31")],
    sessions: [
      session("sanc", "10-26", "06:00", "6:00 AM", "Yoga Flow", ["Jocelyn Vega", "Giselle Castaneda"]),
      session("sanc", "10-27", "06:00", "6:00 AM", "Yoga Flow", ["Gisella Mitchell", "Benjamin Drury"]),
      session("sanc", "10-28", "06:00", "6:00 AM", "Yoga Flow", ["Jiana Calixto", "Celina Huerta"]),
      session("sanc", "10-29", "06:00", "6:00 AM", "Yoga Flow", ["Rosa Ortega", "Ghazala Irshad"]),
      session("sanc", "10-29", "20:30", "8:30 PM", "Yoga Flow", ["Savannah Alvarez", "Xochyl Perez"]),
      session("sanc", "10-30", "06:00", "6:00 AM", "Yoga Flow", ["Dinorah Zubieta"]),
      session("sanc", "11-01", "20:00", "8:00 PM", "Yoga Flow", ["Efren", "Ariel"]),
    ],
  },
];

export const popUpWeek4SessionCount = sessionCount(popUpWeek4Locations);
export const popUpWeek4Full = { ...popUpWeek4, locations: popUpWeek4Locations };
export const getPopUpWeek4Phase = (now = new Date()) => weekPhase(popUpWeek4, now);
