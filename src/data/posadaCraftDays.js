// Posada Craft Days: single source of truth for the /posada page
// (src/pages/posada.astro) and its share card (scripts/render-posada-og.mjs).
// The confirmation email script in marketing/posada-craft-days/ keeps its own
// copy of the days (Apps Script cannot import this file); its build checks
// that copy against this one.
//
// Facts come from two places only:
//   1. LSP's own save-the-date post (instagram.com/p/Df5crFGIVeH, Nov 19 2026):
//      "Community Grand Opening · LSP Posadas · Saturday, December 19",
//      location tag Mural Park.
//   2. Fez's brief for the volunteer form (Nov 19 2026): the five craft days,
//      the four one-hour shifts, and the Bulls ticket raffle on the first two.
//   3. Fez's event copy (Nov 23 2026; on Nov 25 Fez set the name back to
//      "LSP Posadas"): the event is "LSP Posadas",
//      the LSP Grand Opening & Community Fundraiser, Saturday December 19,
//      6 to 9 pm, Mural Park; music, food, Loteria, festive activities,
//      raffles; raising $10,000 toward a permanent home for LSP in 2027; free
//      tickets on Zeffy with a $10 suggested donation.
// Do not add details that are not in one of those sources.
//
// All dates are 2026 and Central Standard Time (UTC-6).

export const posadaEvent = {
  // Fez, Nov 25 2026: "rename to LSP Posadas across all of the surfaces"
  // (Nov 23 to 25 it was "Una Posada, Un Hogar").
  name: "LSP Posadas",
  kicker: "LSP Grand Opening & Community Fundraiser",
  dateISO: "2026-12-19",
  dateLabel: "Saturday, December 19",
  timeLabel: "6 to 9 pm",
  start: "2026-12-19T18:00:00-06:00",
  end: "2026-12-19T21:00:00-06:00",
  venue: "Mural Park",
  // Free tickets, pay what you can, $10 suggested (Zeffy, Latina Sweat Cares,
  // created Nov 23 2026).
  ticketUrl: "https://www.zeffy.com/en-US/ticketing/una-posada-un-hogar",
  goal: 10000,
  instagramUrl: "https://www.instagram.com/p/Df5crFGIVeH/",
  // The team's save-the-date graphic, used whole.
  art: "images/posada/lsp-posadas-save-the-date.jpg",
  artAlt:
    "Save the date. Community Grand Opening, LSP Posadas, Saturday, December 19.",
  // Calendar file for December 19, 6 to 9 pm (public/posada/cal/). The name
  // is kept: confirmation emails already sent link to it.
  calendarFile: "posada/cal/lsp-posadas-2026-12-19.ics",
  // Address used in the calendar entries (no floor: the floor is confirmed
  // for the craft days only).
  calendarLocation: "Mural Park, 924 W 19th Place, Chicago, IL 60608",
};

// Confirmed by Fez on Nov 19 2026: craft days happen at the studio. To change
// the place, edit it here and in
// marketing/posada-craft-days/PosadaConfirm.template.gs.
export const craftDaysPlace = {
  name: "Mural Park",
  street: "924 W 19th Place",
  floor: "4th floor",
  cityLine: "Chicago, IL 60608",
  mapUrl: "https://maps.google.com/?q=924+W+19th+Pl,+Chicago,+IL+60608",
};

// Slot VALUES are the Google Form option labels: they must match the form
// exactly or Google drops the answer. `short` is what the page shows.
export const craftSlots = [
  { value: "4:30pm-5:30pm", short: "4:30 to 5:30", startMin: 990, endMin: 1050 },
  { value: "5:30pm-6:30pm", short: "5:30 to 6:30", startMin: 1050, endMin: 1110 },
  { value: "6:30pm-7:30pm", short: "6:30 to 7:30", startMin: 1110, endMin: 1170 },
  { value: "7:30pm-8:30pm", short: "7:30 to 8:30", startMin: 1170, endMin: 1230 },
];
export const craftHours = "4:30 to 8:30 pm";

// `label` is the Google Form question title and the response-sheet header.
// `end` is the moment the day's last shift ends: the page hides the day then.
export const craftDays = [
  {
    key: "tue1124",
    label: "Tuesday 11/24",
    long: "Tuesday, November 24",
    weekday: "Tuesday",
    monthShort: "Nov",
    dayNum: 24,
    date: "2026-11-24",
    end: "2026-11-24T20:30:00-06:00",
    raffle: true,
  },
  {
    key: "wed1125",
    label: "Wednesday 11/25",
    long: "Wednesday, November 25",
    weekday: "Wednesday",
    monthShort: "Nov",
    dayNum: 25,
    date: "2026-11-25",
    end: "2026-11-25T20:30:00-06:00",
    raffle: true,
  },
  {
    key: "thu1203",
    label: "Thursday 12/3",
    long: "Thursday, December 3",
    weekday: "Thursday",
    monthShort: "Dec",
    dayNum: 3,
    date: "2026-12-03",
    end: "2026-12-03T20:30:00-06:00",
    raffle: false,
  },
  {
    key: "thu1210",
    label: "Thursday 12/10",
    long: "Thursday, December 10",
    weekday: "Thursday",
    monthShort: "Dec",
    dayNum: 10,
    date: "2026-12-10",
    end: "2026-12-10T20:30:00-06:00",
    raffle: false,
  },
  {
    key: "thu1217",
    label: "Thursday 12/17",
    long: "Thursday, December 17",
    weekday: "Thursday",
    monthShort: "Dec",
    dayNum: 17,
    date: "2026-12-17",
    end: "2026-12-17T20:30:00-06:00",
    raffle: false,
  },
];

// The raffle (Fez, Nov 19 2026): show up to a shift on 11/24 or 11/25; at the
// end of every hour, Bulls tickets for Saturday, November 28 are raffled off.
// The note hides itself once the Wednesday shifts are over.
export const craftRaffle = {
  title: "Bulls tickets raffle",
  line: "Show up for a shift on Tuesday 11/24 or Wednesday 11/25. At the end of every hour, we raffle off Bulls tickets for Saturday, November 28.",
  endsAt: "2026-11-25T20:30:00-06:00",
};

// Hidden Google Form (Collab@ account). Entry ids are filled in once the form
// exists; a structural edit to the form (deleting or recreating a question)
// changes them and silently breaks the page.
export const craftForm = {
  actionUrl:
    "https://docs.google.com/forms/d/e/1FAIpQLSe0L3eicTEnwsb7OcsFBXts14Ly2szkmezFbyfOXyF9RAyghg/formResponse",
  entryIds: {
    fullName: "entry.910122558",
    email: "entry.29587905",
    phone: "entry.803680226",
    tue1124: "entry.1098672503",
    wed1125: "entry.1593288423",
    thu1203: "entry.471831560",
    thu1210: "entry.303897094",
    thu1217: "entry.1043285516",
    notes: "entry.307505778",
  },
};

export const craftContactEmail = "collab@latinasweatproject.com";

// ------------------------------------------- homepage + /links placements --
// Added Nov 19 2026. The homepage band (PosadaHomeBand.astro, right after the
// Giving Tuesday band) and the /links card + story bubble
// (PosadaLinksCard.astro, second card) switch by themselves, at build time
// AND in the browser:
//   until the last craft day ends (Thu 12/17, 8:30 pm)  "volunteer": Posada
//       Craft Days, the next craft day, Pick your hours -> /posada#signup
//       (the raffle note shows until craftRaffle.endsAt)
//   from then to the end of Sat 12/19 (Chicago)         "save-the-date": the
//       event and its ticket button only
// Both phases lead with the event (LSP Posadas) and its free-ticket
// button (posadaEvent.ticketUrl); the craft days sit under it while open.
//   after that                                          nothing
// HOW TO TURN THEM OFF BY HAND: set showPosadaHomeBand (homepage) and/or
// showPosadaLinksCard (/links card and its bubble) to false. To end them on
// another day, change posadaPlacementsUntil.
export const showPosadaHomeBand = true;
export const showPosadaLinksCard = true;
export const posadaPlacementsUntil = "2026-12-20T00:00:00-06:00";

// "volunteer" | "save-the-date" | "off" (the toggles are applied by the components).
export function posadaPlacementPhase(now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  if (t >= Date.parse(posadaPlacementsUntil)) return "off";
  const last = craftDays[craftDays.length - 1];
  return t < Date.parse(last.end) ? "volunteer" : "save-the-date";
}

// The first craft day whose last shift has not ended yet, or null.
export function nextCraftDay(now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return craftDays.find((d) => t < Date.parse(d.end)) ?? null;
}

// Spanish for the /links toggle (keyed like craftDays). Proper names stay:
// LSP Posadas, Posada Craft Days, Community Grand Opening, Mural Park.
export const craftDaysEs = {
  tue1124: { short: "Mar", long: "martes 24 de noviembre" },
  wed1125: { short: "Mié", long: "miércoles 25 de noviembre" },
  thu1203: { short: "Jue", long: "jueves 3 de diciembre" },
  thu1210: { short: "Jue", long: "jueves 10 de diciembre" },
  thu1217: { short: "Jue", long: "jueves 17 de diciembre" },
};
export const posadaPlacementCopy = {
  event:
    "LSP Grand Opening & Community Fundraiser. Saturday, December 19, 6 to 9 pm at Mural Park: music, food, Lotería, raffles and celebration.",
  eventEs:
    "LSP Grand Opening & Community Fundraiser. Sábado 19 de diciembre, de 6 a 9 pm, en Mural Park: música, comida, Lotería, rifas y celebración.",
  goal: "We're raising $10,000 toward a permanent home for Latina Sweat Project in 2027. Free tickets, $10 suggested donation.",
  goalEs:
    "Estamos recaudando $10,000 para un hogar permanente para Latina Sweat Project en 2027. Boletos gratis, donación sugerida de $10.",
  ticket: "Get your free ticket",
  ticketEs: "Reserva tu boleto gratis",
  craftTitle: "Posada Craft Days",
  intro: "Help us get ready. Come craft with us: pick a day, pick an hour.",
  introEs: "Ayúdanos a prepararnos. Ven a hacer manualidades con nosotros: elige un día y una hora.",
  next: "Next craft day:",
  nextEs: "Próximo día:",
  today: "Craft day today:",
  todayEs: "Hoy hay manualidades:",
  hoursEs: "de 4:30 a 8:30 pm",
  shifts: "One-hour shifts at Mural Park, 924 W 19th Place, 4th floor.",
  shiftsEs: "Turnos de una hora en Mural Park, 924 W 19th Place, 4.º piso.",
  raffleTitleEs: "Rifa de boletos de los Bulls",
  raffleLineEs:
    "Ven a un turno el martes 24 o el miércoles 25 de noviembre. Al final de cada hora rifamos boletos de los Bulls para el sábado 28 de noviembre.",
  cta: "Pick your hours",
  ctaEs: "Elige tus horas",
  calendar: "Add December 19 to your calendar",
  calendarEs: "Agenda el 19 de diciembre",
  dayEs: "Sáb",
  november: "November",
  novemberEs: "noviembre",
  december: "December",
  decemberEs: "diciembre",
  bubble: "Posadas",
};
