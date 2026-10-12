// Pop Up Week 3: LSP's third pop-up class week, Oct 19 to Oct 25, 2026,
// directly after Pop Up Week 2 (src/data/popUpWeek2.js), same two Pilsen
// locations, same shape as that file. Listed in src/data/popUpWeeks.js,
// which every surface reads.
//
// Facts are binding (marketing/popup-week3-4/BRIEF.md, Fez's "Interim Space
// Schedule - Schedule updated final" sheet + CAD instructor grid, Oct 12
// 2026): instructor FULL NAMES exactly as on the MarianaTek roster ("Vero
// Quiñones" keeps the ñ; "Jay Pena" stays as written; "Yaritza Jurado" is
// roster "Yari Jurado"); every class is 45 minutes; Dinorah Zubieta teaches
// Sanctuary Fri 6 AM every week. Sanctuary has no classes Sat Oct 24.
// Copy rules: never call these "free classes"; no em dashes (en dash for
// ranges); no new address.
//
// Zeffy ticket URLs are the expected slugs of the Week 3 forms (duplicated
// from Week 2); confirm against the live forms.
import { popUpWeek2, popUpWeek2Locations } from "./popUpWeek2.js";
import { makeSessionFactory, closedDay, weekPhase, sessionCount } from "./popUpShared.js";

export const popUpWeek3 = {
  // Shared copy and palette come from Week 1 via Week 2 (same campaign).
  ...popUpWeek2,
  id: "week-3",
  number: 3,
  title: "Pop Up Week 3",
  pagePath: "popup",
  dateRangeLabel: "Oct 19 · Oct 25",
  // En dash for ranges, never an em dash.
  dateRangeShort: "Oct 19 – 25",
  eyebrow: "Pop Up Week 3 · October 19 – 25",
  datePill: "October 19 – 25",
  throughLabel: "Oct 19 through Oct 25",
  trackingWeek: "week_3",
  startsAtISO: "2026-10-19T00:00:00-05:00",
  endsAtISO: "2026-10-25T23:59:59-05:00",
  ogImage: "images/popup/og-popup-week3.jpg",
  ogImageAlt:
    "Pop Up Week 3, October 19 – 25: LSP classes at Chicago Art Department and Sanctuary Health in Pilsen.",
  highlightImage: "images/highlights/hl_popup3.png",
  highlightLabel: { en: "Pop Up Wk 3", es: "Pop Up Sem 3" },
};

const session = makeSessionFactory();
const [cadBase, sancBase] = popUpWeek2Locations;

export const popUpWeek3Locations = [
  {
    ...cadBase,
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-at-chicago-art-department-week--3",
    closedDays: [],
    sessions: [
      session("cad", "10-19", "06:00", "6:00 AM", "Yoga Flow", ["Benjamin Drury", "Lizette Vega"]),
      session("cad", "10-19", "18:00", "6:00 PM", "Yoga Flow", ["Fabiola", "Courtney Luedke"]),
      session("cad", "10-20", "06:00", "6:00 AM", "Yoga Sculpt", ["Yaritza Jurado"]),
      session("cad", "10-20", "18:00", "6:00 PM", "Yoga Sculpt", ["Vanessa Tirado"]),
      session("cad", "10-21", "06:00", "6:00 AM", "Yoga Sculpt", ["Vero Quiñones"]),
      session("cad", "10-21", "18:00", "6:00 PM", "Yoga Sculpt", ["Alondra Alcazar"]),
      session("cad", "10-22", "06:00", "6:00 AM", "Strength Training", ["Jay Pena"]),
      session("cad", "10-22", "18:00", "6:00 PM", "Yoga Sculpt", ["Juanita"]),
      session("cad", "10-23", "06:00", "6:00 AM", "Yoga Flow", ["Sarah Esparza", "Gisella Mitchell"]),
      session("cad", "10-24", "09:00", "9:00 AM", "Pilates", ["Ashley Reitz"]),
      session("cad", "10-25", "10:00", "10:00 AM", "Yoga Flow", ["Brenda Maldonado"]),
    ],
  },
  {
    ...sancBase,
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-at-sanctuary-health-week--3",
    // Sat Oct 24: no classes at this location.
    closedDays: [closedDay("10-24")],
    sessions: [
      session("sanc", "10-19", "06:00", "6:00 AM", "Yoga Flow", ["Celina Huerta", "Jocelyn Vega"]),
      session("sanc", "10-20", "06:00", "6:00 AM", "Yoga Flow", ["Giselle Castaneda", "Rosa Ortega"]),
      session("sanc", "10-21", "06:00", "6:00 AM", "Yoga Flow", ["Antonia Rosales", "Kellyn Mitchell"]),
      session("sanc", "10-22", "06:00", "6:00 AM", "Yoga Flow", ["Ghazala Irshad", "Marlene Garcia"]),
      session("sanc", "10-22", "20:30", "8:30 PM", "Yoga Flow", ["Gigi", "Efren"]),
      session("sanc", "10-23", "06:00", "6:00 AM", "Yoga Flow", ["Dinorah Zubieta"]),
      session("sanc", "10-25", "20:00", "8:00 PM", "Yoga Flow", ["Anabel Hernandez", "Jade Nguyen"]),
    ],
  },
];

export const popUpWeek3SessionCount = sessionCount(popUpWeek3Locations);
export const popUpWeek3Full = { ...popUpWeek3, locations: popUpWeek3Locations };
export const getPopUpWeek3Phase = (now = new Date()) => weekPhase(popUpWeek3, now);
