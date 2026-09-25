// src/lib/galaLive/program.js
//
// The run of show for the 2026 Annual Gala, as data. Pure module: no DOM, no
// network, no Svelte, so the projector, the control phone, the guest mirror and
// the /lspgala hub all read the same catalogue and can never disagree about
// what "Next" means.
//
// Source of truth for every word here: the printed program,
// marketing/gala-program/modern/build.mjs (TIMELINE, HONORS, VOICES, FASHION,
// sponsors, MCs), plus the menu on /galameal. Awardee names are public: they
// are announced on stage tonight.
//
// State on the wire: gala_event_display.program (migration
// 20260925090000_gala_program_segments.sql) = {segment_id, step,
// honoree_overrides, updated_at}. Written through gala_display_set.
//
// House rules: no em-dashes, "Annual Gala" only, names exactly as given.

/* ---------------------------------------------------------------------- */
/* Content                                                                */
/* ---------------------------------------------------------------------- */

const IMG = "/images/gala/2026";

export const FOLLOW_URL = "https://latinasweatproject.com/gala/live";
export const FOLLOW_LABEL = "latinasweatproject.com/gala/live";

// The printed program says "Alo & Cynthia"; the organizer's sheet names her
// Alondra, so the screen does too.
export const MCS = Object.freeze({
  names: "Alondra & Cynthia",
  first: "Alondra",
  second: "Cynthia",
  label: "Tonight’s MCs",
  photo: `${IMG}/program/hosts.jpg`,
});

export const FOUNDER = Object.freeze({
  name: "Margarita Quiñones-Peña",
  role: "Founder",
  photo: `${IMG}/program/voices/margarita-quinones-pena.jpg`,
  quote: "The Latina Sweat Project was never these walls. It has always been the people.",
});

/** Dinner entrées, from /galameal. */
export const MENU = Object.freeze([
  "Whitefish à la Plancha",
  "Asparagus Artichoke Ravioli",
  "Cherry Braised Short Rib",
]);


/**
 * The eight honors in program order (the HONORS array), with tonight's
 * awardees. `photo` is a site path, or "" for the monogram tile; the control
 * phone can paste a photo URL at runtime (honoree_overrides).
 */
export const HONOREES = Object.freeze([
  {
    slug: "awais-qazi",
    title: "Leadership Through Service Honor",
    description: "Recognizing service that strengthens community, builds trust, and helps create meaningful change through consistent action.",
    name: "Awais “Fez” Qazi",
    presenter: "Vanessa Tirado",
    photo: `${IMG}/honorees/awais-qazi.jpg`,
  },
  {
    slug: "rut-merida",
    title: "Leadership in Motion Honor",
    description: "Honoring leadership that turns commitment into action and keeps meaningful change moving forward.",
    name: "Rut Merida",
    presenter: "Vanessa Tirado",
    photo: `${IMG}/honorees/rut-merida.jpg`,
  },
  {
    slug: "lucia-del-rincon",
    title: "Community Impact Honor",
    description: "Recognizing leadership that transforms care, collaboration, and community-centered work into meaningful impact.",
    name: "Lucia del Rincón",
    presenter: "Vanessa Tirado",
    photo: `${IMG}/honorees/lucia-del-rincon.jpg`,
  },
  {
    slug: "ruthie-maldonado-delwiche",
    title: "Somos LSP Honor",
    description: "Recognizing someone who embodies the heart, values, and spirit of Latina Sweat Project through the way they show up for community.",
    name: "Ruthie Maldonado-Delwiche",
    presenter: "Vanessa Tirado",
    photo: `${IMG}/honorees/ruthie-maldonado-delwiche.jpg`,
  },
  {
    slug: "lucia-moya",
    title: "Community Advocacy Honor",
    description: "Honoring advocacy that opens doors, amplifies community needs, and helps create meaningful change where it matters most.",
    name: "Lucia Moya",
    presenter: "Margarita Quiñones-Peña",
    photo: "",
  },
  {
    slug: "katia-orozco",
    title: "Community Leadership Honor",
    description: "Recognizing leadership rooted in representation, community connection, and building meaningful change for the next generation.",
    name: "Katia Orozco",
    presenter: "Margarita Quiñones-Peña",
    photo: "",
  },
  {
    slug: "stacey-berdejo",
    title: "Civic Leadership Award",
    description: "Honoring civic leadership that elevates community voices and helps turn representation into meaningful, lasting change.",
    name: "Stacey Berdejo",
    presenter: "Margarita Quiñones-Peña",
    photo: "",
  },
  {
    slug: "dave-dyson",
    title: "Changemaker Award",
    description: "Recognizing leadership that moves beyond support into action, investment, and meaningful change for the communities and organizations he stands behind.",
    name: "Dave Dyson",
    presenter: "Margarita Quiñones-Peña",
    photo: "",
  },
]);

/** Featured Voices, in the organizer sheet's order. Margarita speaks in the honors block instead. */
export const VOICES = Object.freeze([
  { slug: "savannah-alvarez", name: "Savannah Alvarez" },
  { slug: "yesi-peyret", name: "Yesi Peyret" },
  { slug: "yari-jurado", name: "Yari Jurado" },
  { slug: "xochyl-perez", name: "Xochyl Perez" },
  { slug: "vanessa-tirado", name: "Vanessa Tirado" },
].map((v) => Object.freeze({ ...v, photo: `${IMG}/program/voices/${v.slug}.jpg` })));

/**
 * Sponsors, exactly as the printed program's back cover shows them: the
 * featured trio, then the rest (SPONSORS_FEATURED and SPONSORS in
 * marketing/gala-program/modern/build.mjs), with the program's captions. On
 * the dark stage every mark is a white knockout, no plate or box behind it
 * (public/images/gala/2026/program/logos/white/). Eclipse Telecom is the Gold
 * sponsor's mark.
 */
const LOGO = `${IMG}/program/logos/white`;
export const SPONSOR_ROWS = Object.freeze([
  [
    { name: "Aon", logo: `${LOGO}/aon.png`, scale: 0.85 },
    { name: "Eclipse Telecom", logo: `${LOGO}/eclipse.png`, scale: 1 },
    { name: "Chubb", logo: `${LOGO}/chubb.png`, scale: 1, maxH: 0.6 },
  ],
  [
    { name: "Chicago Community Loan Fund", logo: `${LOGO}/cclf.png`, scale: 1 },
    { name: "Rep. Edgar Gonzalez Jr.", logo: `${LOGO}/edgar.png`, scale: 1 },
    { name: "Wintrust", logo: `${LOGO}/wintrust.png`, scale: 0.95 },
    { name: "Hilario for School Board President", logo: `${LOGO}/hilario.png`, scale: 0.62 },
  ],
]);

/**
 * The Fashion Show brands (FASHION in the program).
 * Optical balance for every logo cell on the dark stage: `scale` shrinks a
 * dense or squarish mark inside its cell (transform), `maxH` caps a very wide
 * wordmark's height as a fraction of the cell. Cells are equal per tier.
 */
export const FASHION = Object.freeze([
  { name: "We Will Win", logo: `${LOGO}/we-will-win.png`, scale: 0.8 },
  { name: "Gente Fina", logo: `${LOGO}/gente-fina.png`, scale: 1, maxH: 0.55 },
  { name: "Definitive Selection", logo: `${LOGO}/definitive.png`, scale: 0.8 },
  { name: "Sosa", logo: `${LOGO}/sosa.png`, scale: 1 },
  { name: "Fiera", logo: `${LOGO}/fiera.png`, scale: 0.95 },
  { name: "Dennise Designs", logo: `${LOGO}/dennise.png`, scale: 0.75 },
]);

export const PERFORMERS = Object.freeze({
  mariachi: { name: "Mariachi Sirenas", time: "6:30 PM", logo: `${LOGO}/sirenas.png`, scale: 0.9 },
  dj: { name: "DJ Mateo", time: "10:30 PM", logo: `${LOGO}/djmateo.png`, scale: 1 },
});

/** Inline style for a logo cell's img: optical scale and height cap. */
export const logoStyle = (l) => `--s:${Number(l?.scale) || 1};--h:${Number(l?.maxH) || 1}`;

/* ---------------------------------------------------------------------- */
/* The dinner corridor, numbers only                                       */
/* ---------------------------------------------------------------------- */

// The room as the seating plan lays it out (17 tables): a podium row of three
// at the north (coat check) end, then seven rows of two toward the entrance.
// Each row is one column on the screen, coat check end on the left; within a
// row the first table sits on top (the plan's left column: 4, 6, ... 14, 17;
// right column: 5, 7, ... 15, 16). Table numbers and positions only: this is
// what guest phones get, and what the projector shows without the seating
// passcode.
export const TABLE_ROWS = Object.freeze([
  [1, 2, 3],
  [4, 5],
  [6, 7],
  [8, 9],
  [10, 11],
  [12, 13],
  [14, 15],
  [17, 16],
]);

/**
 * The seating loop's four boards, in order. "all" is the whole room with every
 * name (every row of the plan, whatever `rows` says); the others are zoomed
 * groups of plan rows (index 0 = the podium row at the coat check end), each
 * with a mini-map of the corridor. `ms` is how long each board stays up.
 */
export const SEATING_BOARDS = Object.freeze([
  { id: "all", label: "The whole dinner corridor", rows: [0, 1, 2, 3, 4, 5, 6, 7], ms: 30_000 },
  { id: "north", label: "North end, by the coat check", rows: [0], ms: 12_000 },
  { id: "mid", label: "Rows 1 to 3 from the north end", rows: [1, 2, 3], ms: 12_000 },
  { id: "south", label: "Rows 4 to 7, toward the entrance", rows: [4, 5, 6, 7], ms: 12_000 },
]);
/** Fallback for a board without its own `ms`. */
export const SEATING_BOARD_MS = 12_000;

/**
 * The honors block, one entry per Next press. Each honor is two steps (title
 * with the awardee hidden, then the reveal). Vanessa Tirado presents 1 to 4;
 * Margarita Quiñones-Peña takes the stage with remarks, then presents 5 to 8.
 */
export const REMARKS = Object.freeze({
  name: "Margarita Quiñones-Peña",
  role: "Founder",
  photo: `${IMG}/program/voices/margarita-quinones-pena.jpg`,
});
export const HONOR_STEPS = Object.freeze([
  ...HONOREES.slice(0, 4).flatMap((h, i) => [
    { kind: "honor", index: i, revealed: false },
    { kind: "honor", index: i, revealed: true },
  ]),
  { kind: "remarks" },
  ...HONOREES.slice(4).flatMap((h, i) => [
    { kind: "honor", index: i + 4, revealed: false },
    { kind: "honor", index: i + 4, revealed: true },
  ]),
]);

/** Step of an honor's title card (hidden) and of its reveal. */
export const honorStepOf = (index, revealed) =>
  HONOR_STEPS.findIndex((x) => x.kind === "honor" && x.index === index && x.revealed === !!revealed);

/* ---------------------------------------------------------------------- */
/* Segments                                                               */
/* ---------------------------------------------------------------------- */

/**
 * The run of show. `steps` = how many reveal steps the segment has (Next walks
 * them before moving on). `scene` = the display scene the segment runs in:
 * gifts keep flowing in every scene, the thermometer layout only in "appeal".
 */
export const SEGMENTS = Object.freeze([
  { id: "seating", title: "Find your table", short: "Find your table", eyebrow: "Welcome & Cocktail Hour", time: "6:00 PM", scene: "program", steps: 1 },
  { id: "welcome", title: "Welcome to the Annual Gala", short: "Welcome", eyebrow: "The Latina Sweat Project", time: "", scene: "program", steps: 1 },
  { id: "hosts", title: "Alondra & Cynthia", short: "Our MCs", eyebrow: "Tonight’s MCs", time: "", scene: "program", steps: 1 },
  { id: "voices", title: "Featured Voices", short: "Featured Voices", eyebrow: "Our community", time: "", scene: "program", steps: 1 + VOICES.length },
  { id: "dinner", title: "Dinner is served", short: "Dinner", eyebrow: "Buen provecho", time: "7:00 PM", scene: "program", steps: 1 },
  { id: "honors", title: "Tonight’s Honors", short: "Honors", eyebrow: "Awards", time: "7:45 PM", scene: "program", steps: HONOR_STEPS.length },
  { id: "sponsors", title: "Thank you to our sponsors", short: "Our sponsors", eyebrow: "With gratitude", time: "", scene: "program", steps: 1 },
  { id: "appeal", title: "Raise your paddle", short: "Paddle raise", eyebrow: "Live bidding", time: "8:15 PM", scene: "appeal", steps: 1 },
  { id: "silent-auction", title: "Silent auction · Last call", short: "Silent auction last call", eyebrow: "Last call", time: "", scene: "program", steps: 1 },
  { id: "gallery", title: "Gallery & Open Bar", short: "Gallery & Open Bar", eyebrow: "The galleries are open", time: "9:00 PM", scene: "program", steps: 1 },
  { id: "fashion-show", title: "The Fashion Show", short: "Fashion Show", eyebrow: "On the runway", time: "10:00 PM", scene: "program", steps: 1 },
  { id: "dj", title: "DJ Mateo", short: "After party", eyebrow: "DJ & Open Bar Until Midnight", time: "10:30 PM", scene: "program", steps: 1 },
  { id: "thanks", title: "Gracias, comunidad", short: "Gracias", eyebrow: "With gratitude", time: "", scene: "thanks", steps: 1 },
]);

/** The silent auction bidding page (the printed program's second QR). */
export const SILENT_AUCTION_URL = "https://latinasweatproject.com/silentauction";
export const SILENT_AUCTION_LABEL = "latinasweatproject.com/silentauction";

const BY_ID = new Map(SEGMENTS.map((s, i) => [s.id, { ...s, index: i }]));

export const segmentById = (id) => BY_ID.get(id) || null;

/** A position everyone can agree on: never an unknown segment, never a step out of range. */
export function normalizePos(program) {
  const p = program && typeof program === "object" ? program : {};
  const seg = BY_ID.get(String(p.segment_id || p.seg || "")) || BY_ID.get("seating");
  const raw = Number(p.step);
  const step = Number.isFinite(raw) ? Math.max(0, Math.min(seg.steps - 1, Math.floor(raw))) : 0;
  return { seg: seg.id, step };
}

export const samePos = (a, b) => !!a && !!b && a.seg === b.seg && a.step === b.step;

export function nextPos(pos) {
  const cur = normalizePos({ segment_id: pos?.seg, step: pos?.step });
  const s = BY_ID.get(cur.seg);
  if (cur.step < s.steps - 1) return { seg: cur.seg, step: cur.step + 1 };
  const n = SEGMENTS[s.index + 1];
  return n ? { seg: n.id, step: 0 } : cur;
}

export function prevPos(pos) {
  const cur = normalizePos({ segment_id: pos?.seg, step: pos?.step });
  const s = BY_ID.get(cur.seg);
  if (cur.step > 0) return { seg: cur.seg, step: cur.step - 1 };
  const p = SEGMENTS[s.index - 1];
  return p ? { seg: p.id, step: p.steps - 1 } : cur;
}

export const sceneFor = (segId) => BY_ID.get(segId)?.scene || "program";

/** The display patch that moves the room to `pos`: program pointer + its scene. */
export function patchFor(pos) {
  const p = normalizePos({ segment_id: pos.seg, step: pos.step });
  return { program: { segment_id: p.seg, step: p.step }, scene: sceneFor(p.seg) };
}

/** Honors: {kind: "honor", index, revealed} or {kind: "remarks"} for a step. */
export function honorAt(step) {
  const s = Math.max(0, Math.min(HONOR_STEPS.length - 1, Math.floor(Number(step) || 0)));
  return HONOR_STEPS[s];
}

/** Voices: step 0 = the whole group, step k = voice k - 1. */
export const voiceAt = (step) => (step > 0 ? VOICES[Math.min(VOICES.length, step) - 1] : null);

/** An honoree with any runtime override (name spelling, pasted photo) applied. */
export function resolveHonoree(h, overrides) {
  const o = overrides && typeof overrides === "object" ? overrides[h.slug] : null;
  const photo = o && typeof o.photo_url === "string" && safeImageUrl(o.photo_url) ? o.photo_url : h.photo;
  const name = o && typeof o.name === "string" && o.name.trim() ? o.name.trim() : h.name;
  return { ...h, name, photo };
}

/** https:// anywhere, or a path on this site under /images/. Anything else is ignored. */
export function safeImageUrl(u) {
  const s = String(u || "").trim();
  if (/^\/images\/[A-Za-z0-9/_.-]{1,200}$/.test(s)) return true;
  try {
    const url = new URL(s);
    return url.protocol === "https:" && s.length <= 500;
  } catch {
    return false;
  }
}

/** "LQ" style monogram for honorees without a photo. */
export function monogram(name) {
  const parts = String(name || "")
    .replace(/[“”"][^“”"]*[“”"]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * One line for "Now: ..." on the hub and the control phone. Never leaks an
 * awardee before the reveal: while hidden, only the honor's title is named.
 */
export function statusLine(program, scene = "program") {
  if (scene === "blackout") return "";
  if (scene === "appeal" || scene === "auction") return "Paddle raise";
  if (scene === "thanks" || scene === "finale") return "Gracias, comunidad";
  const pos = normalizePos(program);
  const seg = BY_ID.get(pos.seg);
  if (seg.id === "honors") {
    const at = honorAt(pos.step);
    if (at.kind === "remarks") return `Honors · Remarks · ${REMARKS.name}`;
    const { index, revealed } = at;
    const h = resolveHonoree(HONOREES[index], program?.honoree_overrides);
    return `Honors · ${h.title.replace(/ (Honor|Award)$/, "")}${revealed ? ` · ${h.name}` : ""}`;
  }
  if (seg.id === "voices") {
    const v = voiceAt(pos.step);
    return v ? `Featured Voices · ${v.name}` : "Featured Voices";
  }
  return seg.short;
}

/** Plain-language step label for the control phone. */
export function stepLabel(pos) {
  const p = normalizePos({ segment_id: pos?.seg, step: pos?.step });
  const seg = BY_ID.get(p.seg);
  if (seg.id === "honors") {
    const at = honorAt(p.step);
    if (at.kind === "remarks") return `Remarks · ${REMARKS.name}`;
    const { index, revealed } = at;
    return `Honor ${index + 1} of ${HONOREES.length} · ${revealed ? "revealed" : "name hidden"}`;
  }
  if (seg.id === "voices") return p.step === 0 ? `All ${VOICES.length} voices` : `Voice ${p.step} of ${VOICES.length}`;
  if (seg.id === "seating") return "Loops until you press Next";
  return seg.steps > 1 ? `Step ${p.step + 1} of ${seg.steps}` : "";
}

/** True when the program pointer was ever written (a fresh event row is {}). */
export const programStarted = (program) => !!(program && typeof program === "object" && program.segment_id);
