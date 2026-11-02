// Copy of record for the Día de los Muertos weekend 2026 recap
// (/diadelosmuertos). Three exports: ddlmRecap (the page's strings and the
// program as it was published), ddlmSurvey (the attendee survey, the page's
// one main action, used by the recap, the homepage and /links) and ddlmStory
// (the photo essay). The album itself is in ddlmGallery2026.js. The layout is
// specified in marketing/ddlm-recap/REDESIGN-BRIEF.md.
//
// Binding copy rules: facts come only from fallEvents.js. No attendance,
// dollars, quotes or outcomes, and never a meal count. Past tense, English
// first (Spanish only as a sign-off or a proper noun; /links is the one place
// with full Spanish), no em dashes, "sound bath", and a class is never called
// free (the kids class is "free registration"). Class leaders by first name
// only, and never over a photo. Nothing here sells: no tickets, waiver,
// volunteer form or directions.
//
// Survey rules: addressed to people who were there. No invitation to anyone
// else, no coaching of answers or ratings, no raffle, prize or incentive, no
// deadline, and no question aimed at the reader: lead with the event's name.

import {
  ddlmEvent,
  ddlmWeekend,
  halloweenEvents,
  halloweenMeal,
  halloweenProgram,
} from "./fallEvents.js";
import { ddlmHasSundayPhotos, ddlmMayorPost } from "./ddlmGallery2026.js";

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

// The published program, as a record. Rows come straight from fallEvents.js,
// minus what only made sense before the weekend (registration, supplies).
const recapDetail = (detail) =>
  detail
    .replace(/\s*Registration on Zeffy\.$/, "")
    .replace(/, while supplies last$/, "")
    .replace(/\.$/, "");

export const ddlmRecap = {
  heading: "Día de los Muertos",
  tagline: "Thank you for remembering with us.",
  dateLine: "October 31 and November 1, 2026 · La Villita Park",
  // Hero: album #119 (stem 65535/55623990513_67bf6df9d2), five catrinas in the
  // tent with the ofrendas behind them. Rendered by prepare.mjs to
  // public/images/ddlm/recap/ (hero-900/1600/2400.webp, og-ddlm-recap.jpg).
  heroAlt:
    "Five catrinas in flower crowns and face paint stand in the tent at La Villita Park, with the ofrendas, marigolds and papel picado behind them.",
  // Switches on its own when ddlmSundayPhotos is filled in. Until then
  // nothing may imply a Saturday photo is from Sunday.
  metaDescription: `Thank you for remembering with us. Día de los Muertos at La Villita Park, October 31 and November 1, 2026, in photos from Saturday${ddlmHasSundayPhotos ? " and Sunday" : ""}. If you joined us, the attendee survey takes 2 to 3 minutes.`,
  making: {
    heading: "Three nights before",
    dateLine: "Wednesday, October 28",
    captionTime: "Wednesday, October 28.",
    captionText:
      "Paint, paper and marigolds: the calaveras and crosses were made by hand. Phone photos from the team.",
  },
  saturday: {
    heading: "Saturday, October 31",
    dateLine: ddlmWeekend.saturdayLabel,
  },
  sunday: {
    heading: "Sunday, November 1",
    dateLine: ddlmWeekend.sundayLabel,
    // NOT VERIFIED: this describes the published program. There are no Sunday
    // photos of the evening's program yet, so if it ran differently, fix it
    // here (open item for Fez).
    body: "Sunday evening we honored our ancestors at the community altars, with Banda El Pueblo, Mariachi Sirenas and gentle yoga, Danza Azteca by Kalpulli Xochykalli, then a grief meditation and sound bath.",
  },
  thankYou: {
    heading: "Thank you, La Villita",
    pullLine:
      "This fall, while we're in the process of being displaced from our studio, you met us across the neighborhood.",
    body: [
      "LSP Día de los Muertos is our space to remember and celebrate our loved ones together. This year we held that space at La Villita Park, over two days, and you came.",
      `A weekend like this takes many hands: set-up, ofrendas, welcoming, classes and clean-up. Thank you to every volunteer, to class leaders ${classLeaders}, to the musicians and dancers, and to everyone who brought someone they love to the ofrendas.`,
    ],
    signoff: "Con cariño, The Latina Sweat Project",
  },
  program: {
    heading: "The program",
    days: [
      {
        id: "program-saturday",
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
        id: "program-sunday",
        day: "Sunday, November 1",
        label: ddlmWeekend.sundayLabel,
        rows: ddlmEvent.runOfShow,
        note: null,
      },
    ],
  },
  supporters: {
    heading: "Supported by",
    line: ddlmWeekend.supportersLine,
  },
  photos: {
    heading: "Every photo",
  },
  // The /links card (src/pages/links.astro) and its two line strings.
  card: {
    line: "October 31 and November 1 · La Villita Park",
    lineEs: "31 de octubre y 1 de noviembre · La Villita Park",
    blurb: "Thank you for remembering with us. The weekend at La Villita Park, in photos.",
    blurbEs: "Gracias por recordar con nosotros. El fin de semana en La Villita Park, en fotos.",
    photosButton: "See the photos",
    photosButtonEs: "Ver las fotos",
  },
};

// The attendee survey for the funder. The form is the grant's own, so it lists
// the weekend under the name the grant uses; `noteChoices` are the two exact
// choices, set in bold wherever the note prints. Rendered by
// src/components/DdlmSurveyCta.astro; the homepage line lives here too so the
// copy exists once. `bodyCard` is the shorter /links wording.
export const ddlmSurvey = {
  url: "https://forms.cloud.microsoft/pages/responsepage.aspx?id=_0n0vIiuoUOlaC-BT6ket-YzGzMkaeJEvjvZ0LuQOb5UMk5KR0tUTDRHU1NKTTVNN1A1NzVWOFhCOS4u&origin=QRCode&route=shorturl",
  heading: "Día de los Muertos: share your feedback",
  body: "If you joined us at La Villita Park on Saturday or Sunday, the funder behind the weekend has a short survey for you. It takes 2 to 3 minutes and it is anonymous. Funding is how events this size happen, and this survey is how the funder sees what the weekend meant.",
  button: "Take the survey",
  note: 'On the form, choose South Lawndale, then The Latina Sweat Project presents "Fall Sweat Festival". That is how the grant lists our weekend, so the form will not say Día de los Muertos.',
  noteChoices: ["South Lawndale", 'The Latina Sweat Project presents "Fall Sweat Festival"'],
  closingLine: "If you joined us this weekend, the survey takes 2 to 3 minutes.",
  homeLine: "If you joined us, the attendee survey takes 2 to 3 minutes: ",
  homeLink: "take the survey",
  bodyCard:
    "If you joined us at La Villita Park on Saturday or Sunday, the funder behind the weekend has a short survey for you: 2 to 3 minutes, anonymous. Funding is how events this size happen, and this survey is how the funder sees what the weekend meant.",
  headingEs: "Día de los Muertos: comparte tu opinión",
  bodyEs:
    "Si nos acompañaste en La Villita Park el sábado o el domingo, el patrocinador del fin de semana tiene una encuesta corta para ti: de 2 a 3 minutos, anónima. Así se financian eventos de este tamaño, y así el patrocinador ve lo que significó el fin de semana. La encuesta está en inglés.",
  noteEs:
    'En el formulario elige South Lawndale y luego The Latina Sweat Project presents "Fall Sweat Festival". Así aparece nuestro fin de semana en la beca, por eso no dirá Día de los Muertos.',
  buttonEs: "Responder la encuesta",
};

// Story frames by Flickr stem (the `t` field in ddlmSaturdayPhotos), never by
// index, so removing a row can never shift a pick. `rows` are ordered lists of
// frames; `layout` is "justified" (default), "full" or "two-thirds". A
// two-thirds row prints the moment's caption beside the photo, or its own
// `caption` when it has one. `phoneY` is the object-position y for portraits
// on phones (4:5 crop). `alt` describes the scene and never names anyone.
//
// Rules: no child in a lead position; the one kids yoga frame shows children
// from behind only and is never "full". Ofrendas carry families' framed
// photos, so ofrenda frames are wide frames only and nothing crops in on one.
// Sunday frames are `{ sun: "<stem>" }` from ddlmSundayPhotos; DdlmStory.astro
// fails the build if a Sunday row names a Saturday stem.
export const ddlmStory = {
  making: ["IMG_1156", "IMG_1146", "IMG_1155", "IMG_1138"],
  makingAlt: {
    IMG_1156: "A gold calavera with marigold eyes.",
    IMG_1146: "A red cross with a heart, held up.",
    IMG_1155: "Orange and white calaveras on a chair.",
    IMG_1138: "A green cross with a yellow flower.",
  },
  saturday: [
    {
      time: "9:00 AM",
      text: "The ofrendas open, with hot drinks.",
      rows: [
        {
          frames: [
            { t: "65535/55624273655_a1512a2902", phoneY: 50, alt: "The altar with its marigold path and rows of candles on the grass." },
            { t: "65535/55623991493_25281be074", alt: "A serape-covered table with candles and rings of marigolds." },
          ],
        },
        {
          frames: [
            { t: "65535/55623993918_47231b697b", alt: "A bunch of marigolds, close up." },
            { t: "65535/55624277175_661a3d0a73", phoneY: 50, alt: "Marigolds laid on the grass in the shape of a cross, with candles around them." },
          ],
        },
      ],
    },
    {
      time: "10:30 AM",
      text: "Kids yoga, in costume.",
      rows: [
        {
          layout: "two-thirds",
          frames: [
            { t: "65535/55622856732_867ce6b02c", alt: "The kids yoga class seen from behind, facing the leaders at the front, marigold strands hanging from the tent." },
          ],
        },
      ],
    },
    {
      time: "11:00 AM",
      text: "Banda Cerro Azul.",
      rows: [
        {
          layout: "full",
          frames: [
            { t: "65535/55623990868_af1f7cc8f7", alt: "The whole band standing under the big tent." },
          ],
        },
        {
          layout: "two-thirds",
          caption: "Trumpets and clarinets, outside the tent.",
          frames: [
            { t: "65535/55624280325_2d20225f4f", alt: "Trumpet and clarinet players from the band on the grass outside the tent." },
          ],
        },
      ],
    },
    {
      time: "11:00 AM to 12:30 PM",
      text: "Farmers market and trick or treat, warm meals from OrganicLife, fresh fruits and vegetables from Sharing Excess.",
      rows: [
        {
          layout: "full",
          frames: [
            { t: "65535/55623993738_fd47afe43f", alt: "The produce line under the canopies, a queue along the boxes." },
          ],
        },
        {
          frames: [
            { t: "65535/55622855502_6a565c962a", phoneY: 40, alt: "A volunteer packing green peppers from the produce boxes." },
            { t: "65535/55624063334_fba7875b84", phoneY: 30, alt: "The OrganicLife chefs serving from a table of trays and fruit cups." },
            { t: "65535/55624278155_3e423babfc", phoneY: 50, alt: "Rows of fruit cups on a black table, a hand reaching for one." },
          ],
        },
      ],
    },
    {
      time: "Late morning",
      text: "Catrinas, face paint and costumes.",
      rows: [
        {
          layout: "full",
          frames: [
            { t: "65535/55623852581_769b00f5d9", alt: "Five catrinas in the tent facing the camera, papel picado above them." },
          ],
        },
        {
          frames: [
            { t: "65535/55624280040_26cb11667a", phoneY: 25, alt: "A catrina in a black lace veil and flower crown, holding a bouquet of roses." },
            { t: "65535/55624062889_bf9ae65e36", alt: "Two catrinas in flower crowns talking under the paper lace, one holding a bouquet." },
          ],
        },
        {
          frames: [
            { t: "65535/55622853507_80a7780594", alt: "A costumed figure in a monster mask, autumn trees behind." },
            { t: "65535/55624275810_23f67be6ec", phoneY: 60, alt: "A catrina in a rose crown face-painting a visitor at the table." },
          ],
        },
      ],
    },
    {
      time: "12:30 PM",
      text: "Banda Pilates + Sculpt, with Banda Cerro Azul playing live.",
      rows: [
        {
          layout: "full",
          frames: [
            { t: "65535/55623850661_2ecae643a1", alt: "The whole tent: people on mats, the crowd at the back, the altar table in the foreground." },
          ],
        },
        {
          frames: [
            { t: "65535/55623986408_f2383b8a6f", phoneY: 30, alt: "The class lying on its backs, the band standing behind under the papel picado." },
            { t: "65535/55623849576_e0795f45e0", alt: "An arm raised at the front of the class, people on their mats, the ofrenda behind." },
          ],
        },
        {
          frames: [
            { t: "65535/55622849482_db2266db1f", alt: "The band in a line at the back of the tent, the class in tabletop." },
            { t: "65535/55622849202_dcd38319b2", alt: "A drummer at the timbales, marigold strands hanging behind." },
          ],
        },
      ],
    },
  ],
  // Always rendered, before ddlmStory.sunday. The only images in the Sunday
  // section until the album lands. Credit only: no sentence naming the visit,
  // and nothing here quotes or paraphrases the post.
  sundayOpener: {
    time: "Sunday evening",
    text: "At the ofrendas. Photos from the Office of the Mayor,",
    link: { text: "@chicagosmayor", href: ddlmMayorPost },
    credit: "Photo: Office of the Mayor, @chicagosmayor",
    rows: [{ frames: [{ guest: "mayor-group" }, { guest: "mayor-ofrenda" }] }],
  },
  sunday: [], // moments by { sun: "<stem>" } once ddlmSundayPhotos exists
};
