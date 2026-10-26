// Pop Up Week 4: LSP's fourth pop-up class week, Oct 26 to Nov 1, 2026,
// directly after Pop Up Week 3 (src/data/popUpWeek3.js), same two Pilsen
// locations, same shape. Listed in src/data/popUpWeeks.js.
//
// Facts are binding (marketing/popup-week3-4/BRIEF.md, Oct 12 2026): FULL
// NAMES exactly as on the MarianaTek roster; every class is 45 minutes.
// Chicago Art Dept is EVENING ONLY this week (Fez, Oct 20 2026): the four
// 6:00 PM classes Mon Oct 26 to Thu Oct 29. The five 6:00 AM sessions
// (Mon to Fri) were removed, so Fri Oct 30, Sat Oct 31 and Sun Nov 1 are
// simply not listed (no "No classes" rows); a notice line says so.
// Mon Oct 26 6:00 PM was cancelled (Fez, Oct 27 2026), leaving 3 CAD classes. Sanctuary has no
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
    // Rebuilt Zeffy form (Oct 20 2026; the first CAD Week 4 form was deleted
    // by accident), hence the "-2" slug.
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-at-chicago-art-department-week--4-2",
    // Own check-in form per week (never inherit Week 2's): /checkin.
    checkInFormId: "929718d4-b7ae-4652-a34e-e3580a0b3151",
    checkInUrl:
      // cad-w4: signed Zeffy check-in manager link for the rebuilt form (see
      // CHECK-IN LINKS in popUpShared.js). This link EXPIRES Oct 30 2026
      // (JWT exp, 6:45 PM CDT), after the last CAD class on Thu Oct 29.
      "https://www.zeffy.com/en-US/checkin-manager/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdhbml6YXRpb25JZCI6Ijc4MzFkYjM2LWJlNWQtNGU4My05OGZmLWVkMTdmZjViOWE0NSIsInRpY2tldGluZ0lkIjoiOTI5NzE4ZDQtYjdhZS00NjUyLWEzNGUtZTM1ODBhMGIzMTUxIiwiaWF0IjoxNzkyNTM5ODgwLCJleHAiOjE3OTM0MDM5MDB9.9-ndxhto2w2hnwXOFm0SgzfX5P4pD1pVnZvd_Un5IS4",
    noticeLine: "Evening classes only this week, 6:00 PM Tuesday to Thursday. Monday's class was cancelled.",
    closedDays: [],
    sessions: [
      // Fabiola Saldaña (MarianaTek 6942, newest YTT cohort ids 6937-6953) is a working
      // assumption flagged for Fez; the other roster Fabiola is Fabiola Davila (6556).
      // Cancelled (Fez, Oct 27 2026): stays listed, struck through.
      session("cad", "10-26", "18:00", "6:00 PM", "Yoga Flow", ["Courtney Luedke", "Fabiola Saldaña"], { cancelled: true }),
      session("cad", "10-27", "18:00", "6:00 PM", "Yoga Sculpt", ["Vanessa Tirado"]),
      session("cad", "10-28", "18:00", "6:00 PM", "Yoga Sculpt", ["Alondra Alcazar"]),
      session("cad", "10-29", "18:00", "6:00 PM", "Yoga Sculpt", ["Juanita Barajas"]),
    ],
  },
  {
    ...sancBase,
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-at-sanctuary-health-week--4",
    checkInFormId: "6b9eb140-462d-40c1-a0d2-7ef61675e2db",
    checkInUrl:
      // sanc-w4: signed Zeffy check-in manager link (see CHECK-IN LINKS in popUpShared.js).
      "https://www.zeffy.com/en-US/checkin-manager/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdhbml6YXRpb25JZCI6Ijc4MzFkYjM2LWJlNWQtNGU4My05OGZmLWVkMTdmZjViOWE0NSIsInRpY2tldGluZ0lkIjoiNmI5ZWIxNDAtNDYyZC00MGMxLWEwZDItN2VmNjE2NzVlMmRiIiwiaWF0IjoxNzkxODQ5MTQ3LCJleHAiOjE4MjMzODUxNDd9.8M35gd5O3lxs37Oa1YRwDP6D-5zclGZWNA9XQV_kCOM",
    // Sat Oct 31: no classes at this location.
    closedDays: [closedDay("10-31")],
    sessions: [
      session("sanc", "10-26", "06:00", "6:00 AM", "Yoga Flow", ["Jocelyn Vega", "Giselle Castaneda"]),
      session("sanc", "10-27", "06:00", "6:00 AM", "Yoga Flow", ["Gisella Mitchell", "Benjamin Drury"]),
      session("sanc", "10-28", "06:00", "6:00 AM", "Yoga Flow", ["Jiana Calixto", "Celina Huerta"]),
      session("sanc", "10-29", "06:00", "6:00 AM", "Yoga Flow", ["Rosa Ortega", "Ghazala Irshad"]),
      session("sanc", "10-29", "20:30", "8:30 PM", "Yoga Flow", ["Savannah Alvarez", "Xochyl Perez"]),
      session("sanc", "10-30", "06:00", "6:00 AM", "Yoga Flow", ["Dinorah Zubieta"]),
      session("sanc", "11-01", "20:00", "8:00 PM", "Yoga Flow", ["Efren Ramirez Jr", "Ariel Cervera"]),
    ],
  },
];

export const popUpWeek4SessionCount = sessionCount(popUpWeek4Locations);
export const popUpWeek4Full = { ...popUpWeek4, locations: popUpWeek4Locations };
export const getPopUpWeek4Phase = (now = new Date()) => weekPhase(popUpWeek4, now);
