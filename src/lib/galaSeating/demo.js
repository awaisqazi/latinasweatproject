// Gala Seating: invented demo guests.
//
// PRIVACY: every name, email, phone and note in this file is made up so the
// planner can be tried without touching real guest data. Nothing here comes
// from a ticket export or a dinner form. Keep it that way: this repo is public.
//
// The shapes match the Guest typedef in model.js. `prefs` is left empty on
// purpose; the store runs resolvePreferences() over the merged guest list so
// the demo notes light up the same way an imported note does.

import { emptyPrefs } from "./model.js";

/**
 * Parties, as a planner would recognise them: one buyer, one or more seats.
 * `names` is the seat list. A null entry becomes an unnamed placeholder
 * ("Guest of <buyer>"), which is exactly what a real export produces when a
 * buyer has not named everyone yet.
 * `meals` lines up with `names`; null means no selection came in.
 * `note` is the raw seating-preference answer from the ticket purchase.
 */
const PARTIES = [
  {
    buyer: "Marisol Vega",
    email: "marisol.vega@example.org",
    phone: "(312) 555-0148",
    ticket: "presenting",
    note: "Our whole table together please. Two of our guests are joining us straight from the airport, so anywhere near the entrance is perfect.",
    heard: "Board member",
    names: [
      "Marisol Vega",
      "Teodoro Vega",
      "Paloma Restrepo",
      "Ignacio Restrepo",
      "Delfina Carranza",
      "Rubén Carranza",
      "Noelia Sandoval",
      null,
      "Camila Arriaga",
      null,
    ],
    meals: ["short-rib", "short-rib", "whitefish", "whitefish", "ravioli", "short-rib", "ravioli", null, "whitefish", null],
    tags: { "Marisol Vega": ["vip"] },
  },
  {
    buyer: "Ofelia Bustamante",
    email: "ofelia.bustamante@example.com",
    phone: "(773) 555-0112",
    ticket: "gold",
    note: "Please seat us with Rosalinda Terán's group, we are coming together.",
    heard: "Instagram",
    names: ["Ofelia Bustamante", "Ramiro Bustamante", "Lucero Peñaloza", "Aurelio Peñaloza", "Xiomara Bustamante"],
    meals: ["whitefish", "short-rib", "ravioli", "short-rib", "whitefish"],
  },
  {
    buyer: "Rosalinda Terán",
    email: "rosalinda.teran@example.com",
    phone: "(312) 555-0193",
    ticket: "gold",
    note: "Sitting with Ofelia Bustamante and her family.",
    heard: "A friend",
    names: ["Rosalinda Terán", "Efraín Terán", "Maricela Quintanilla", "Hugo Quintanilla", "Beatriz Alcalá"],
    meals: ["ravioli", "short-rib", "short-rib", null, "whitefish"],
  },
  {
    buyer: "Esperanza Mondragón",
    email: "esperanza.m@example.net",
    phone: "(872) 555-0165",
    ticket: "champion",
    note: "We would love to sit with the YTT '26 cohort if there is room.",
    heard: "Teacher training",
    names: [
      "Esperanza Mondragón",
      "Claudio Mondragón",
      "Yaretzi Fuentes",
      "Salomé Iriarte",
      "Gerardo Iriarte",
      "Nayeli Zambrano",
      "Abelardo Zambrano",
      "Lourdes Villagómez",
    ],
    meals: ["short-rib", "short-rib", "ravioli", "ravioli", "whitefish", "whitefish", "short-rib", "ravioli"],
    tags: { "Yaretzi Fuentes": ["speaker"] },
  },
  {
    buyer: "Tomasa Escareño",
    email: "tomasa.escareno@example.com",
    phone: "(773) 555-0107",
    ticket: "community",
    note: "YTT '26 cohort, we are all trying to sit together.",
    heard: "Teacher training",
    names: ["Tomasa Escareño", "Brígida Ocampo", "Feliciano Ocampo", "Amparo Lizárraga", "Serafina Lizárraga", "Cuauhtémoc Rangel", "Herminia Rangel"],
    meals: ["ravioli", "ravioli", "short-rib", "whitefish", "whitefish", "short-rib", "ravioli"],
  },
  {
    buyer: "Práxedis Alfaro",
    email: "praxedis.alfaro@example.com",
    phone: "(312) 555-0179",
    ticket: "benefactor",
    note: "YTT '26. Please keep me with Tomasa Escareño's table.",
    heard: "Teacher training",
    names: ["Práxedis Alfaro", "Soledad Alfaro", "Isaura Menchaca", "Nicomedes Menchaca", "Rufina Bracamontes", "Leobardo Bracamontes"],
    meals: ["short-rib", "whitefish", "ravioli", "short-rib", "ravioli", "whitefish"],
  },
  {
    buyer: "Candelaria Puentes",
    email: "candelaria.puentes@example.org",
    phone: "(773) 555-0154",
    ticket: "benefactor",
    note: "Please do not seat us near the speakers, my mother uses a hearing aid and the volume is a lot. A quieter corner would help.",
    heard: "Community class",
    names: ["Candelaria Puentes", "Trinidad Puentes", "Modesta Gallardo", "Anselmo Gallardo", "Perpetua Gallardo", "Eulalia Nieto"],
    meals: ["whitefish", "short-rib", "ravioli", "short-rib", null, "whitefish"],
    tags: { "Modesta Gallardo": ["accessible"] },
  },
  {
    buyer: "Jacinta Villalpando",
    email: "jacinta.v@example.com",
    phone: "(872) 555-0133",
    ticket: "benefactor",
    note: "We are with the Morales group.",
    heard: "Email newsletter",
    names: ["Jacinta Villalpando", "Ausencio Villalpando", "Remedios Cifuentes", "Bonifacio Cifuentes"],
    meals: ["short-rib", "short-rib", "whitefish", "ravioli"],
  },
  {
    buyer: "Estanislao Morales",
    email: "e.morales@example.com",
    phone: "(312) 555-0126",
    ticket: "benefactor",
    note: "Jacinta Villalpando is joining our table.",
    heard: "A friend",
    names: ["Estanislao Morales", "Griselda Morales", "Fulgencio Morales", "Obdulia Barragán"],
    meals: ["ravioli", "whitefish", "short-rib", "short-rib"],
  },
  {
    buyer: "Zenaida Cortázar",
    email: "zenaida.cortazar@example.net",
    phone: "(773) 555-0188",
    ticket: "benefactor",
    note: "Anywhere is fine, thank you for a beautiful evening.",
    heard: "Instagram",
    names: ["Zenaida Cortázar", "Lisandro Cortázar", "Otilia Berrones", "Casimiro Berrones"],
    meals: ["whitefish", "whitefish", "ravioli", "short-rib"],
  },
  {
    buyer: "Xóchitl Pedroza",
    email: "xochitl.pedroza@example.com",
    phone: "(312) 555-0170",
    ticket: "benefactor",
    note: "Please seat us with Zenaida Cortázar if you can, and away from Fabiola Sotelo, long story.",
    heard: "Community class",
    names: ["Xóchitl Pedroza", "Aristeo Pedroza", "Leticia Urbina"],
    meals: ["short-rib", "ravioli", "whitefish"],
  },
  {
    buyer: "Fabiola Sotelo",
    email: "fabiola.sotelo@example.com",
    phone: "(773) 555-0142",
    ticket: "benefactor",
    note: "No preference.",
    heard: "Instagram",
    names: ["Fabiola Sotelo", "Genoveva Sotelo", "Máximo Sotelo"],
    meals: ["ravioli", "short-rib", null],
  },
  {
    buyer: "Reynalda Ceballos",
    email: "reynalda.c@example.org",
    phone: "(872) 555-0119",
    ticket: "benefactor",
    note: "We are celebrating my sister's birthday, a table near the dance floor would make her night.",
    heard: "A friend",
    names: ["Reynalda Ceballos", "Aurora Ceballos", "Faustino Ceballos"],
    meals: ["short-rib", "whitefish", "whitefish"],
  },
  {
    buyer: "Hermelinda Solórzano",
    email: "h.solorzano@example.com",
    phone: "(312) 555-0161",
    ticket: "benefactor",
    note: "Please seat me with Wilfrido Camarena, we are colleagues at the clinic.",
    heard: "Employer match",
    names: ["Hermelinda Solórzano", "Prudencia Solórzano"],
    meals: ["ravioli", "ravioli"],
  },
  {
    buyer: "Wilfrido Camarena",
    email: "w.camarena@example.com",
    phone: "(773) 555-0135",
    ticket: "benefactor",
    note: "With Hermelinda Solórzano please.",
    heard: "Employer match",
    names: ["Wilfrido Camarena", "Dolores Camarena"],
    meals: ["short-rib", "whitefish"],
  },
  {
    buyer: "Natividad Quiroga",
    email: "natividad.q@example.net",
    phone: "(872) 555-0177",
    ticket: "benefactor",
    note: "",
    heard: "Email newsletter",
    names: ["Natividad Quiroga", "Baldomero Quiroga"],
    meals: ["whitefish", "short-rib"],
  },
  {
    buyer: "Crescencia Landeros",
    email: "c.landeros@example.com",
    phone: "(312) 555-0104",
    ticket: "benefactor",
    note: "Vegetarian table if one exists, and we would love to be with the studio team.",
    heard: "Community class",
    names: ["Crescencia Landeros", "Ambrosio Landeros"],
    meals: ["ravioli", "ravioli"],
  },
  {
    buyer: "Eudocia Barrientos",
    email: "eudocia.b@example.org",
    phone: "(773) 555-0181",
    ticket: "benefactor",
    note: "",
    heard: "A friend",
    names: ["Eudocia Barrientos", "Teódulo Barrientos"],
    meals: ["short-rib", null],
  },
  {
    buyer: "Alondra Mejorada",
    email: "alondra.m@example.com",
    phone: "(312) 555-0150",
    ticket: "benefactor",
    note: "Seat me with the board table if there is a spot, otherwise anywhere.",
    heard: "Board member",
    names: ["Alondra Mejorada"],
    meals: ["whitefish"],
    tags: { "Alondra Mejorada": ["vip"] },
  },
  {
    buyer: "Porfirio Nájera",
    email: "p.najera@example.com",
    phone: "(773) 555-0122",
    ticket: "benefactor",
    note: "",
    heard: "Instagram",
    names: ["Porfirio Nájera"],
    meals: ["short-rib"],
  },
  {
    buyer: "Leonor Chavarría",
    email: "leonor.ch@example.net",
    phone: "(872) 555-0198",
    ticket: "benefactor",
    note: "Please seat me with Marisol Vega, she invited me.",
    heard: "A friend",
    names: ["Leonor Chavarría"],
    meals: ["ravioli"],
  },
  {
    buyer: "Everardo Pizarro",
    email: "e.pizarro@example.com",
    phone: "(312) 555-0139",
    ticket: "benefactor",
    note: "Gluten free if possible, I emailed about it.",
    heard: "Email newsletter",
    names: ["Everardo Pizarro"],
    meals: ["whitefish"],
    tags: { "Everardo Pizarro": ["allergy"] },
  },
  {
    buyer: "Isidra Valdivieso",
    email: "isidra.v@example.com",
    phone: "(773) 555-0157",
    ticket: "benefactor",
    note: "",
    heard: "Community class",
    names: ["Isidra Valdivieso"],
    meals: [null],
  },
  {
    buyer: "Melquíades Tinoco",
    email: "m.tinoco@example.org",
    phone: "(312) 555-0166",
    ticket: "benefactor",
    note: "Whatever is easiest for you.",
    heard: "A friend",
    names: ["Melquíades Tinoco"],
    meals: ["short-rib"],
  },
  // Late night (Supporter) tickets: no dinner seat.
  {
    buyer: "Yesenia Bastida",
    email: "yesenia.b@example.com",
    phone: "(773) 555-0114",
    ticket: "supporter",
    note: "Coming for the dancing only.",
    heard: "Instagram",
    names: ["Yesenia Bastida", "Odalys Bastida", "Rigoberto Bastida"],
    meals: [null, null, null],
  },
  {
    buyer: "Ignacia Robledo",
    email: "ignacia.r@example.com",
    phone: "(872) 555-0128",
    ticket: "supporter",
    note: "",
    heard: "A friend",
    names: ["Ignacia Robledo", "Eleuterio Robledo"],
    meals: [null, null],
  },
  {
    buyer: "Saturnino Gaytán",
    email: "s.gaytan@example.net",
    phone: "(312) 555-0191",
    ticket: "supporter",
    note: "",
    heard: "Instagram",
    names: ["Saturnino Gaytán"],
    meals: [null],
  },
  {
    buyer: "Nohemí Arellano",
    email: "nohemi.a@example.com",
    phone: "(773) 555-0173",
    ticket: "supporter",
    note: "Will find the Vega group after dinner.",
    heard: "A friend",
    names: ["Nohemí Arellano", "Cipriano Arellano"],
    meals: [null, null],
  },
  // Comps: staff, honorees, press.
  {
    buyer: "LSP staff",
    email: "team@example.org",
    phone: "",
    ticket: "comp",
    note: "Studio team, please spread us across the room so there is a host at each corner.",
    heard: "Staff",
    names: ["Guadalupe Pineda", "Mirella Tapia", "Rosario Quezada", "Domitila Escamilla", "Benigno Urrutia"],
    meals: ["ravioli", "short-rib", "whitefish", "ravioli", "short-rib"],
    tags: {
      "Guadalupe Pineda": ["staff", "speaker"],
      "Mirella Tapia": ["staff"],
      "Rosario Quezada": ["staff"],
      "Domitila Escamilla": ["staff"],
      "Benigno Urrutia": ["staff"],
    },
  },
  {
    buyer: "Honorees",
    email: "honorees@example.org",
    phone: "",
    ticket: "comp",
    note: "Honorees speak during dinner, they need to reach the podium quickly.",
    heard: "Staff",
    names: ["Altagracia Bermúdez", "Filiberto Bermúdez", "Sinforosa Caldera"],
    meals: ["short-rib", "whitefish", "ravioli"],
    tags: {
      "Altagracia Bermúdez": ["speaker", "vip"],
      "Sinforosa Caldera": ["speaker"],
    },
  },
  // A dinner response with no matching ticket, the kind of row a planner has
  // to chase down by hand.
  {
    buyer: "Unmatched response",
    email: "unmatched@example.com",
    phone: "(773) 555-0199",
    ticket: "unknown",
    note: "I filled out the dinner form but I think my sister bought the ticket.",
    heard: "A friend",
    names: ["Jovita Maldonado"],
    meals: ["whitefish"],
    unmatched: true,
  },
];

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Build the demo guest list. Ids are stable between calls so loading the demo
 * twice updates rather than duplicates.
 * @returns {import("./model.js").Guest[]}
 */
export function demoGuests() {
  const guests = [];
  let ticketSeq = 4100;

  for (const party of PARTIES) {
    const partyId = `demo:${slug(party.buyer)}`;
    party.names.forEach((rawName, i) => {
      ticketSeq += 1;
      const placeholder = !rawName;
      const name = rawName || `Guest of ${party.buyer}`;
      const hasDinner = party.ticket !== "supporter";
      guests.push({
        id: `${partyId}:${i + 1}`,
        name,
        partyId,
        partyLabel: party.buyer,
        buyerName: party.buyer,
        buyerEmail: party.email,
        ticketType: party.ticket,
        ticketNumbers: [`G-${ticketSeq}`],
        hasDinner,
        meal: hasDinner ? party.meals?.[i] || null : null,
        mealRaw: "",
        phone: i === 0 ? party.phone || "" : "",
        email: i === 0 ? party.email : "",
        seatingNote: i === 0 ? party.note || "" : "",
        heardAbout: i === 0 ? party.heard || "" : "",
        placeholder,
        unmatched: Boolean(party.unmatched),
        tags: party.tags?.[name] ? [...party.tags[name]] : [],
        plannerNote: "",
        prefs: emptyPrefs(),
        source: "import",
      });
    });
  }

  return guests;
}

/** Count, handy for the welcome screen copy. */
export const DEMO_GUEST_COUNT = PARTIES.reduce((n, p) => n + p.names.length, 0);
