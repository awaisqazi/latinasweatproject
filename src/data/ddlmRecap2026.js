// Copy of record for the Día de los Muertos weekend 2026 recap
// (/diadelosmuertos): the thank-you, the program as it was published, and the
// hero and lead photo picks. The album itself is in ddlmGallery2026.js.
//
// Binding copy rules: facts come only from fallEvents.js. No attendance,
// dollars, quotes or outcomes, and never a meal count. Past tense, English
// first (Spanish only as a sign-off or a proper noun), no em dashes, "sound
// bath", never "free class". Class leaders by first name only, and never over
// a photo. Nothing here sells: no tickets, waiver, volunteer form or directions.
//
// NOT VERIFIED: the Sunday lines describe the published program. There are no
// Sunday photos yet, so if the evening ran differently, fix it here.

import {
  ddlmEvent,
  ddlmWeekend,
  halloweenEvents,
  halloweenMeal,
  halloweenProgram,
} from "./fallEvents.js";
import { ddlmHasSundayPhotos } from "./ddlmGallery2026.js";

const joinList = (items, conj = "and") =>
  items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
const lowerFirst = (t) => t.charAt(0).toLowerCase() + t.slice(1);

// Saturday first, then Sunday: Ariesna, Lucia, Vanessa, Veronica, Yaritza,
// Savannah, Zoraida and Luz.
const classLeaders = joinList(
  [...halloweenEvents, ddlmEvent].flatMap((e) => e.people),
);

export const ddlmRecap = {
  heading: "Día de los Muertos",
  tagline: "Thank you for remembering with us.",
  dateLine: "October 31 and November 1, 2026 · La Villita Park",
  thankYouHeading: "Thank you, La Villita",
  thankYouLead:
    "LSP Día de los Muertos is our space to remember and celebrate our loved ones together. This year we held that space at La Villita Park, over two days, and you came.",
  thankYou: [
    "On Saturday, Halloween in the park opened with the ofrendas, then kids yoga in costume, Banda Cerro Azul, the farmers market and trick or treat, warm meals from OrganicLife, fresh fruits and vegetables from Sharing Excess, and Banda Pilates + Sculpt with the band playing live.",
    "On Sunday evening we honored our ancestors at the community altars, with Banda El Pueblo, Mariachi Sirenas and gentle yoga, Danza Azteca by Kalpulli Xochykalli, then a grief meditation and sound bath.",
    `This fall, while we're in the process of being displaced from our studio, you met us across the neighborhood. A weekend like this takes many hands: set-up, ofrendas, welcoming, classes and clean-up. Thank you to every volunteer, to class leaders ${classLeaders}, to the musicians and dancers, and to everyone who brought someone they love to the ofrendas.`,
  ],
  supportLine:
    "The weekend was made possible in part by the Chicago Department of Public Health's Community-Centered Wellness Micro-Grant.",
  signoff: "Con cariño, The Latina Sweat Project",
  // These three switch on their own when ddlmSundayPhotos is filled in. Until
  // then nothing may imply a photo is from Sunday.
  metaDescription: ddlmHasSundayPhotos
    ? "Thank you for remembering with us. A look back at LSP's Día de los Muertos weekend at La Villita Park, October 31 and November 1, 2026, in photos."
    : "Thank you for remembering with us. A look back at LSP's Día de los Muertos weekend at La Villita Park, October 31 and November 1, 2026, with photos from Saturday.",
  photosHeading: ddlmHasSundayPhotos ? "The weekend in photos" : "Saturday in photos",
  photosIntro: ddlmHasSundayPhotos
    ? "Both days at La Villita Park, and the night we made the ofrendas."
    : "Saturday at La Villita Park, and the night we made the ofrendas.",
  programHeading: "The program",
  programClose: ddlmEvent.runOfShow[ddlmEvent.runOfShow.length - 1].detail, // Hasta la próxima
};

// The published program, as a record. Rows come straight from fallEvents.js,
// minus what only made sense before the weekend (registration, supplies).
const recapDetail = (detail) =>
  detail
    .replace(/\s*Registration on Zeffy\.$/, "")
    .replace(/, while supplies last$/, "")
    .replace(/\.$/, "");

export const ddlmRecapProgram = [
  {
    id: "saturday",
    day: "Saturday, October 31",
    label: ddlmWeekend.saturdayLabel,
    rows: halloweenProgram.map((r) => ({
      time: r.time,
      title: r.title,
      detail: recapDetail(r.detail),
    })),
    note: `OrganicLife's warm meal: ${joinList(halloweenMeal.menu.map(lowerFirst))}.`,
  },
  {
    id: "sunday",
    day: "Sunday, November 1",
    label: ddlmWeekend.sundayLabel,
    rows: ddlmEvent.runOfShow.filter((r) => r.title !== "End"),
    note: null,
  },
];

// Hero: album #119, five catrinas in the tent with the ofrendas behind them.
// Rendered by marketing/ddlm-recap/prepare.mjs to public/images/ddlm/recap/
// (hero-900/1600/2400.webp and the 1200x630 og-ddlm-recap.jpg).
//
// Leads: picks per chapter, RENDERED IN THE ORDER LISTED. `i` is the Saturday
// album index (row in ddlmSaturdayPhotos), `id` an Oct 28 photo id, `sun` a
// ddlmSundayPhotos row. `big` tiles span 2x2 and must be landscape; portraits
// (o: "p") span one column, two rows; other landscapes one cell. Hole-free on
// both the 4-column desktop and 2-column phone grid:
//   "B s s B s s", "B T T B B", "T T B B T T", "T T T T ..." in fours.
// `src` names a self-hosted 1200w webp used for that tile (Flickr's _c is soft
// at 2x on a big tile); prepare.mjs renders every `src` listed here.
//
// Lead rules: no child as a lead frame. Ofrendas carry photos of people's loved
// ones, so ofrenda leads are wide frames or the handmade calaveras and crosses,
// and nothing crops in on a family's framed photo (#181 has one at top left,
// so it stays in the wall).
export const ddlmRecapPhotos = {
  hero: 119,
  heroAlt:
    "Five catrinas in flower crowns and face paint stand in the tent at La Villita Park, with the ofrendas, marigolds and papel picado behind them.",
  leads: {
    making: [
      { id: "IMG_1126" },
      { id: "IMG_1156" },
      { id: "IMG_2012" },
      { id: "IMG_1146" },
      { id: "IMG_1127" },
      { id: "IMG_1155" },
      { id: "IMG_5881" },
      { id: "IMG_1138" },
    ],
    ofrendas: [
      { i: 73 },
      { i: 80 },
      { i: 53, big: true, src: "lead-053.webp" },
      { i: 99, big: true, src: "lead-099.webp" },
      { i: 44 },
      { i: 45 },
    ],
    kids: [
      { i: 29, big: true, src: "lead-029.webp" },
      { i: 30 },
      { i: 37 },
      { i: 20, big: true, src: "lead-020.webp" },
      { i: 47, big: true, src: "lead-047.webp" },
    ],
    banda: [
      { i: 52, big: true, src: "lead-052.webp" },
      { i: 113 },
      { i: 162 },
      { i: 194, big: true, src: "lead-194.webp" },
      { i: 193 },
      { i: 115 },
    ],
    market: [
      { i: 82 },
      { i: 16 },
      { i: 81, big: true, src: "lead-081.webp" },
      { i: 59, big: true, src: "lead-059.webp" },
      { i: 86 },
      { i: 10 },
    ],
    costume: [
      { i: 104 },
      { i: 48 },
      { i: 108, big: true, src: "lead-108.webp" },
      { i: 89, big: true, src: "lead-089.webp" },
      { i: 134 },
      { i: 77 },
    ],
    pilates: [
      { i: 175, big: true, src: "lead-175.webp" },
      { i: 166 },
      { i: 205 },
      { i: 190, big: true, src: "lead-190.webp" },
      { i: 155, big: true, src: "lead-155.webp" },
    ],
    sunday: [],
  },
};
