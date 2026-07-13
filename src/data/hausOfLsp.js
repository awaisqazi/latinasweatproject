// Haus of LSP · Summer Renaissance: single source of truth for every
// surface (homepage spotlight, events feature, links card, /hausoflsp page).
//
// Haus of LSP is LSP's queer-centered event series; Summer Renaissance is
// its summer 2026 night. Facts below come from the printed flyer:
//   - Sat, Aug 1, 2026 · 6 to 11 PM · Pilsen, at the LSP Studio
//     (the flyer's "949 W 19th St" was a typo; the studio is 949 W 16th St)
//   - 6 to 8 PM: art exhibit + open mic / slam poetry
//   - 8 to 11 PM: DJ ("let loose and be free") + drinks
//   - All proceeds go toward the LSP Queer Scholarship
// The Zeffy interest form is live while pricing and ticketing details are
// being finalized. Every event CTA reads this URL and label from the shared
// data below.

export const hausOfLsp = {
  seriesName: "Haus of LSP",
  seriesLine: "The queer-centered event series from The Latina Sweat Project",
  seriesDescription:
    "Haus of LSP is how our LGBTQ+ comunidad gathers: nights built around queer art, queer voices, and dance floors where everyone belongs. Every Haus event raises money for the LSP Queer Scholarship.",
  fundName: "LSP Queer Scholarship",
  instagramUrl: "https://www.instagram.com/latinasweatproject/",
};

export const summerRenaissance = {
  slug: "summer-renaissance",
  title: "Summer Renaissance",
  presentedBy: "Haus of LSP presents",
  startsAtISO: "2026-08-01T18:00:00-05:00",
  endsAtISO: "2026-08-01T23:00:00-05:00",
  dateLabel: "Saturday, August 1, 2026",
  shortDateLabel: "Aug 1",
  timeLabel: "6:00 to 11:00 PM",
  dateTimeLabel: "August 1, 2026 · 6:00 to 11:00 PM",
  neighborhood: "Pilsen",
  venueName: "LSP Studio",
  address: "949 W 16th St, Chicago",
  venueLine: "LSP Studio · 949 W 16th St, Pilsen",
  tagline: "Queer art, open mics, and a dance floor of our own.",
  cause: "All proceeds go toward the LSP Queer Scholarship",
  homepageDescription:
    "A summer night from Haus of LSP: an art exhibit and open mic that melt into a DJ set, with every dollar building the LSP Queer Scholarship.",
  pageDescription:
    "Haus of LSP throws open the doors for one summer night in Pilsen: queer art on the walls, poets on the mic, and a DJ carrying us to 11. Come for the gallery, stay for the dance floor, and know that every dollar raised funds the LSP Queer Scholarship.",
  pagePath: "/hausoflsp",
  calendarPath: "/summer-renaissance-2026.ics",
  ticketsOnSale: true,
  ticketsUrl:
    "https://www.zeffy.com/en-US/ticketing/haus-of-lsp-summer-renaissance",
  ticketsLabel: "Express Interest",
  statusLabel: "Pricing and ticketing details coming soon",
  exploreLabel: "Step inside the Haus",
};

// Artist + performer interest form (Google Form "Latina Sweat Project:
// Art Exhibit/Open Mic"). The form's final question is a REQUIRED file
// upload (2+ photos of the artist's work), and Google file-upload questions
// cannot be posted from outside Google (they store to Drive and force a
// Google sign-in). So the on-site form collects every text/choice answer,
// then opens the real form PRE-FILLED via viewform?usp=pp_url; the artist
// signs in, attaches photos, and submits there. Entry ids extracted from
// FB_PUBLIC_LOAD_DATA_ on 2026-07-13; date prefills use _year/_month/_day.
export const hausArtistForm = {
  title: "Latina Sweat Project: Art Exhibit/Open Mic",
  viewUrl:
    "https://docs.google.com/forms/d/e/1FAIpQLScusJlkvq9TVgPVzLcrxg0dyz2OYF0d8Je1Xw9x4c3I6qr2Xg/viewform",
  entries: {
    fullName: "entry.94017494",
    dob: "entry.681432501", // date question: prefill as _year/_month/_day
    phone: "entry.918116317",
    interest: "entry.667126451",
    visited: "entry.169214209",
    impact: "entry.1892245547",
    invoke: "entry.663036833",
    materials: "entry.1198921460",
    // entry.1824477100 = required art-photo upload; finished on Google.
  },
  interestOptions: ["Art Exhibit", "Open Mic/Slam Poetry"],
  visitedOptions: ["Yes", "No"],
  uploadNote: "at least two pictures of the art you would like to display",
};

// The night in two acts, straight from the flyer's "qué va a pasar?" note.
export const summerRenaissanceActs = [
  {
    id: "gallery",
    time: "6:00 to 8:00 PM",
    title: "The Gallery Hours",
    accent: "mint",
    items: [
      {
        title: "Art exhibit",
        detail: "Queer artists from our comunidad, up on the walls.",
      },
      {
        title: "Open mic + slam poetry",
        detail: "Bring a poem, a song, a story, or just your snaps.",
      },
    ],
  },
  {
    id: "dance",
    time: "8:00 to 11:00 PM",
    title: "The Dance Floor",
    accent: "pink",
    items: [
      {
        title: "DJ set",
        detail: "Let loose and be free.",
      },
      {
        title: "Drinks",
        detail: "Raise a glass; the proceeds raise a scholarship.",
      },
    ],
  },
];

// Nightlife collage identity: hot pink marker ink, purple photo wash, mint
// sticker trim, chrome hardware, all over a deep plum-maroon room.
export const hausColors = {
  pink: "#ff6fb5", // marker ink + neon accents
  violet: "#a06bd8", // purple photo wash
  mint: "#b8ecd2", // sticker-frame trim, used sparingly
  plum: "#241019", // the dark room
  maroon: "#3a1626", // warmer wall tone behind glows
  paper: "#f5f1e6", // the torn notebook note
};

// Disco ball, tiled mirror facets over a radial sheen. Used as an inline
// <img>-free background via the `.haus-disco` utility (see global.css).
const discoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><defs><radialGradient id="sheen" cx="35%" cy="28%" r="85%"><stop offset="0%" stop-color="#ffe9f7" stop-opacity="0.95"/><stop offset="38%" stop-color="#d9a8ef" stop-opacity="0.6"/><stop offset="75%" stop-color="#7a4a92" stop-opacity="0.55"/><stop offset="100%" stop-color="#2c1030" stop-opacity="0.9"/></radialGradient><pattern id="tiles" width="13" height="13" patternUnits="userSpaceOnUse"><rect x="0.75" y="0.75" width="11.5" height="11.5" rx="0.8" fill="rgba(255,255,255,0.14)"/><rect x="0.75" y="0.75" width="5" height="5" rx="0.8" fill="rgba(255,255,255,0.10)"/></pattern></defs><circle cx="100" cy="100" r="97" fill="url(#sheen)"/><circle cx="100" cy="100" r="97" fill="url(#tiles)"/><circle cx="100" cy="100" r="97" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/></svg>`;
export const hausDiscoUri = `url("data:image/svg+xml,${encodeURIComponent(discoSvg)}")`;

// Mirror-ball room speckles: a tiled scatter of soft light dots (white,
// pink, mint) used by the `.haus-lights` overlay (see global.css) on the
// /hausoflsp page and the homepage spotlight. Epilepsy-safe by design: the
// dots are faint and soft-edged, the overlay only ever translates (never
// pulses opacity), and reduced-motion holds it perfectly still.
const lightDots = [
  [60, 40, 10, "lw", 0.5], [170, 90, 7, "lp", 0.45], [300, 30, 12, "lm", 0.35],
  [420, 110, 8, "lw", 0.4], [40, 200, 7, "lm", 0.4], [230, 180, 11, "lw", 0.35],
  [350, 230, 7, "lp", 0.5], [120, 300, 9, "lp", 0.4], [450, 320, 10, "lw", 0.35],
  [280, 360, 8, "lm", 0.45], [60, 420, 11, "lw", 0.3], [200, 450, 7, "lw", 0.5],
  [380, 430, 9, "lp", 0.35], [330, 120, 6, "lw", 0.55], [150, 150, 5, "lm", 0.5],
  [430, 220, 5, "lp", 0.55],
]
  .map(
    ([cx, cy, r, g, o]) =>
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${g})" opacity="${o}"/>`,
  )
  .join("");
const lightGrad = (id, color) =>
  `<radialGradient id="${id}"><stop offset="0%" stop-color="${color}" stop-opacity="1"/><stop offset="55%" stop-color="${color}" stop-opacity="0.5"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
const lightTileSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><defs>${lightGrad("lw", "#ffffff")}${lightGrad("lp", "#ff9fce")}${lightGrad("lm", "#cff5e0")}</defs>${lightDots}</svg>`;
export const hausLightTileUri = `url("data:image/svg+xml,${encodeURIComponent(lightTileSvg)}")`;
