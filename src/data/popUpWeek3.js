// Pop Up Week 3: LSP's third pop-up class week, Oct 19 to Oct 25, 2026,
// directly after Pop Up Week 2 (src/data/popUpWeek2.js), the same two Pilsen
// locations plus a third, Southside Social in Back of the Yards (one class,
// Thu Oct 22 8 AM, added Oct 12 2026), same shape as that file. Listed in src/data/popUpWeeks.js,
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
    "Pop Up Week 3, October 19 – 25: LSP classes at Chicago Art Department and Sanctuary Health in Pilsen and Southside Social in Back of the Yards.",
  // Week 1's body says "Two locations"; this week has three.
  body:
    "Programming at our studio is paused, so this week the classes come to the " +
    "neighborhood. Three locations, one week, the same community. Pick a " +
    "class and reserve your spot. Bring water and your mat, limited mats " +
    "available for rent.",
  highlightImage: "images/highlights/hl_popup3.png",
  highlightLabel: { en: "Pop Up Wk 3", es: "Pop Up Sem 3" },
};

const session = makeSessionFactory();
const [cadBase, sancBase] = popUpWeek2Locations;

export const popUpWeek3Locations = [
  {
    ...cadBase,
    // Short phone-toggle label, used when a week has three locations.
    toggleLabel: "Art Dept",
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-at-chicago-art-department-week--3",
    // Own check-in form per week (never inherit Week 2's): /checkin.
    checkInFormId: "e06204c5-c967-406b-a6cb-28da0ff5a3a0",
    checkInUrl:
      // cad-w3: signed Zeffy check-in manager link (see CHECK-IN LINKS in popUpShared.js).
      "https://www.zeffy.com/en-US/checkin-manager/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdhbml6YXRpb25JZCI6Ijc4MzFkYjM2LWJlNWQtNGU4My05OGZmLWVkMTdmZjViOWE0NSIsInRpY2tldGluZ0lkIjoiZTA2MjA0YzUtYzk2Ny00MDZiLWE2Y2ItMjhkYTBmZjVhM2EwIiwiaWF0IjoxNzkxODQ4ODQ1LCJleHAiOjE4MjMzODQ4NDV9.-_XqYP4WULhDG_cfDu8DViP1SOUvComnb3YWCBqUkts",
    closedDays: [],
    sessions: [
      session("cad", "10-19", "06:00", "6:00 AM", "Yoga Flow", ["Benjamin Drury", "Lizette Vega"]),
      // Fabiola Saldaña (MarianaTek 6942, newest YTT cohort ids 6937-6953) is a working
      // assumption flagged for Fez; the other roster Fabiola is Fabiola Davila (6556).
      session("cad", "10-19", "18:00", "6:00 PM", "Yoga Flow", ["Fabiola Saldaña", "Courtney Luedke"]),
      session("cad", "10-20", "06:00", "6:00 AM", "Yoga Sculpt", ["Yaritza Jurado"]),
      session("cad", "10-20", "18:00", "6:00 PM", "Yoga Sculpt", ["Vanessa Tirado"]),
      session("cad", "10-21", "06:00", "6:00 AM", "Yoga Sculpt", ["Vero Quiñones"]),
      session("cad", "10-21", "18:00", "6:00 PM", "Yoga Sculpt", ["Alondra Alcazar"]),
      session("cad", "10-22", "06:00", "6:00 AM", "Strength Training", ["Jay Pena"]),
      session("cad", "10-22", "18:00", "6:00 PM", "Yoga Sculpt", ["Juanita Barajas"]),
      session("cad", "10-23", "06:00", "6:00 AM", "Yoga Flow", ["Sarah Esparza", "Gisella Mitchell"]),
      session("cad", "10-24", "09:00", "9:00 AM", "Pilates", ["Ashley Reitz"]),
      session("cad", "10-25", "10:00", "10:00 AM", "Yoga Flow", ["Brenda Maldonado"]),
    ],
  },
  {
    ...sancBase,
    toggleLabel: "Sanctuary",
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-at-sanctuary-health-week--3",
    checkInFormId: "b60b7dab-6277-485e-a97f-13c21c838c06",
    checkInUrl:
      // sanc-w3: signed Zeffy check-in manager link (see CHECK-IN LINKS in popUpShared.js).
      "https://www.zeffy.com/en-US/checkin-manager/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdhbml6YXRpb25JZCI6Ijc4MzFkYjM2LWJlNWQtNGU4My05OGZmLWVkMTdmZjViOWE0NSIsInRpY2tldGluZ0lkIjoiYjYwYjdkYWItNjI3Ny00ODVlLWE5N2YtMTNjMjFjODM4YzA2IiwiaWF0IjoxNzkxODQ4ODg3LCJleHAiOjE4MjMzODQ4ODd9.YQTl-8N1WK-uWj95oI1XjctOz6Abki8ks9F49kPpfug",
    // Sat Oct 24: no classes at this location.
    closedDays: [closedDay("10-24")],
    sessions: [
      session("sanc", "10-19", "06:00", "6:00 AM", "Yoga Flow", ["Celina Huerta", "Jocelyn Vega"]),
      session("sanc", "10-20", "06:00", "6:00 AM", "Yoga Flow", ["Giselle Castaneda", "Rosa Ortega"]),
      session("sanc", "10-21", "06:00", "6:00 AM", "Yoga Flow", ["Antonia Rosales", "Kellyn Mitchell"]),
      session("sanc", "10-22", "06:00", "6:00 AM", "Yoga Flow", ["Ghazala Irshad", "Marlene Garcia"]),
      session("sanc", "10-22", "20:30", "8:30 PM", "Yoga Flow", ["Gigi Torres", "Efren Ramirez Jr"]),
      session("sanc", "10-23", "06:00", "6:00 AM", "Yoga Flow", ["Dinorah Zubieta"]),
      session("sanc", "10-25", "20:00", "8:00 PM", "Yoga Flow", ["Anabel Hernandez", "Jade Nguyen"]),
    ],
  },
  // Southside Social (Back of the Yards): one class this week (Fez, Oct 12
  // 2026). LSP held soft-launch classes here May to July 2026. Text lockup
  // only (no venue logo in the repo; never fabricate one). Paper card.
  {
    id: "southside-social",
    name: "Southside Social",
    lockup: ["Southside", "Social"],
    shortName: "Southside Social",
    toggleLabel: "Southside",
    shortLabel: "Back of the Yards · Ashland & 44th",
    neighborhood: "Back of the Yards",
    address: "4432 S Ashland Ave, Chicago, IL 60609",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=4432+S+Ashland+Ave+Chicago+IL+60609",
    ticketsUrl: "https://www.zeffy.com/en-US/ticketing/lsp-at-southside-social",
    checkInFormId: "75ebd835-7d20-4318-a9d4-ae1f71a0275b",
    checkInUrl:
      // southside-oct22: signed Zeffy check-in manager link (see CHECK-IN LINKS in popUpShared.js).
      "https://www.zeffy.com/en-US/checkin-manager/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdhbml6YXRpb25JZCI6Ijc4MzFkYjM2LWJlNWQtNGU4My05OGZmLWVkMTdmZjViOWE0NSIsInRpY2tldGluZ0lkIjoiNzVlYmQ4MzUtN2QyMC00MzE4LWE5ZDQtYWUxZjcxYTAyNzViIiwiaWF0IjoxNzkxODUwNDAzLCJleHAiOjE4MjMzODY0MDN9.Sxn7r2_YOVlNET2BRgF4TkC9UWNoLcl_9wBB0fltYv8",
    ticketsLabel: "Reserve at Southside Social",
    ticketsLabelEs: "Reserva en Southside Social",
    conversionEvent: "class_booking_start",
    trackingLocation: "southside_social",
    priceLine: "Pay what you can",
    priceLineEs: "Paga lo que puedas",
    capacityLine: "Up to 40 mats",
    capacityLineEs: "Hasta 40 mats",
    theme: "light",
    closedDays: [],
    sessions: [
      session("ssoc", "10-22", "08:00", "8:00 AM", "Yoga Sculpt", ["Andrea Fuentes"]),
    ],
  },
];

export const popUpWeek3SessionCount = sessionCount(popUpWeek3Locations);
export const popUpWeek3Full = { ...popUpWeek3, locations: popUpWeek3Locations };
export const getPopUpWeek3Phase = (now = new Date()) => weekPhase(popUpWeek3, now);
