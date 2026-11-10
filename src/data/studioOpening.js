// The Mural Park opening: single source of truth for the opening hero on the
// homepage (OpeningHero.astro) and the opening card on /links
// (OpeningLinksCard.astro).
//
// Look: the schedule announcement set made for social on Nov 9, 2026
// (scripts/render-mural-park-schedule-instructors.mjs): Public Sans, deep
// green ground, cream type, one flat color per class format. Same palette,
// same format colors, same per-day bar mosaic as the cover post.
//
// Facts (Fez, Nov 9 2026): doors open Monday, November 16, 2026 at Mural
// Park, 924 W 19th Place, 4th floor. Two studios (Gage Park Studio, Little
// Village Studio). Never call Mural Park permanent. The first class on
// MarianaTek that day starts at 5:30 AM Central, which is what the countdown
// runs to; after that moment every surface flips to "Doors are open" by
// itself (build time and in the browser).
//
// THE TOGGLE: set showOpeningHero to false to bring back the original video
// hero ("Empowering Through Movement") unchanged once the opening has
// passed. The /links card is removed by deleting <OpeningLinksCard /> and the
// first `highlights` entry in src/pages/links.astro.
export const showOpeningHero = true;

export const studioOpening = {
  opensAtISO: "2026-11-16T05:30:00-06:00",
  label: ["LSP at Mural Park", "924 W 19th Place", "4th floor"],
  headline: "Pilsen, we're back.",
  headlineEs: "Pilsen, volvimos.",
  soon: "Doors open Monday, November 16.",
  soonEs: "Abrimos el lunes 16 de noviembre.",
  open: "Doors are open.",
  openEs: "Ya abrimos.",
  stats: ["14 formats", "2 studios", "every day"],
  statsEs: ["14 formatos", "2 estudios", "todos los días"],
  bookLabel: "Book a class",
  bookLabelEs: "Reserva tu clase",
  bookPath: "schedule",
  freeWeekLabel: "New Studio Free Week",
  freeWeekPath: "pricing",
  tagline: "Empowering through movement.",
};

export const isStudioOpen = (now = new Date()) =>
  now.getTime() >= Date.parse(studioOpening.opensAtISO);

// Homepage link share card (Open Graph image + description), by date. Link
// previews are baked in at build time, so the deploy workflow rebuilds the
// site on the two mornings this changes (the `schedule` block in
// .github/workflows/deploy.yml: Nov 16 and Nov 23). Each phase has its own
// file name so apps that cached the old preview fetch the new one. Images
// are drawn by scripts/render-opening-share-cards.mjs.
//   until the first class, Mon Nov 16 2026   "Doors open Monday, November 16."
//   opening week, to Mon Nov 23 2026         "Doors are open."
//   after that                               the long-term card
export const shareCardLongTermFromISO = "2026-11-23T05:30:00-06:00";
const shareCardBase = { width: 1200, height: 630, type: "image/png" };
export const homeShareCard = (now = new Date()) => {
  if (!isStudioOpen(now)) {
    return {
      ...shareCardBase,
      image: "images/og/opening-soon.png",
      title: "Pilsen, we're back",
      alt: "Pilsen, we're back. Doors open Monday, November 16. LSP at Mural Park, 924 W 19th Place, 4th floor.",
      description:
        "Pilsen, we're back. Doors open Monday, November 16 at Mural Park, 924 W 19th Place, 4th floor. Book a class.",
    };
  }
  if (now.getTime() < Date.parse(shareCardLongTermFromISO)) {
    return {
      ...shareCardBase,
      image: "images/og/opening-open.png",
      title: "Pilsen, we're back",
      alt: "Pilsen, we're back. Doors are open. LSP at Mural Park, 924 W 19th Place, 4th floor.",
      description:
        "Pilsen, we're back. Doors are open at Mural Park, 924 W 19th Place, 4th floor. Book a class.",
    };
  }
  return {
    ...shareCardBase,
    image: "images/og/home.png",
    title: "Yoga, fitness and community wellness in Pilsen",
    alt: "Latina Sweat Project: empowering through movement. Yoga, fitness and community wellness in Pilsen, at Mural Park, 924 W 19th Place.",
    // undefined = the site's standard description (Layout.astro).
    description: undefined,
  };
};

// Palette and format colors, copied from the schedule post generator.
export const openingPalette = {
  ground: "#17241D",
  cream: "#FAF7EF",
  ink: "#1D3329",
  hair: "#C0AB7F",
  hairLight: "#C2B498",
  empty: "#ECE8DC",
};

export const openingFormats = [
  { name: "Yoga Flow", color: "#B6C7A6" },
  { name: "Power Yoga Flow", color: "#555E34" },
  { name: "Gentle Yoga Flow", color: "#DCE6D3" },
  { name: "Restorative Yoga", color: "#4A5952" },
  { name: "Chair Yoga", color: "#E6DAC3" },
  { name: "Yoga Flow en Español", color: "#CFAE7E" },
  { name: "Yoga Sculpt", color: "#2F4F3D" },
  { name: "Banda Yoga Sculpt", color: "#5C4033" },
  { name: "Sculpting for Longevity", color: "#BDB38E" },
  { name: "Strength Training", color: "#111111" },
  { name: "HIIT", color: "#E4C26E" },
  { name: "Mat Pilates", color: "#DCA4AA" },
  { name: "MixxedFit", color: "#D09A7A" },
  { name: "Zumba", color: "#9FB46D" },
];
export const openingFormatColor = Object.fromEntries(
  openingFormats.map((f) => [f.name, f.color]),
);

// One typical week, Monday to Sunday, every class in start-time order, from
// marketing/mural-park-opening/schedule/november_public_schedule.json (the
// same sheet the cover post is drawn from). [time, format]. Class names and
// times only, never instructor names.
export const openingWeek = [
  { day: "Mon", classes: [["5:30 AM", "Yoga Flow"], ["6:00 AM", "Yoga Sculpt"], ["6:30 AM", "Yoga Flow"], ["7:00 AM", "HIIT"], ["7:30 AM", "Yoga Flow"], ["8:30 AM", "Yoga Flow"], ["12:00 PM", "Yoga Flow"], ["12:00 PM", "Mat Pilates"], ["5:00 PM", "Power Yoga Flow"], ["5:30 PM", "Yoga Sculpt"], ["6:00 PM", "Power Yoga Flow"], ["6:30 PM", "Yoga Sculpt"], ["7:00 PM", "Yoga Flow"], ["7:30 PM", "Strength Training"], ["8:00 PM", "Restorative Yoga"], ["8:30 PM", "Yoga Sculpt"]] },
  { day: "Tue", classes: [["5:30 AM", "Yoga Flow"], ["6:00 AM", "Strength Training"], ["6:30 AM", "Yoga Flow"], ["7:30 AM", "Yoga Flow"], ["10:00 AM", "Gentle Yoga Flow"], ["12:00 PM", "Chair Yoga"], ["12:00 PM", "Mat Pilates"], ["5:00 PM", "Yoga Flow"], ["5:30 PM", "Strength Training"], ["6:00 PM", "Yoga Flow en Español"], ["6:30 PM", "Yoga Sculpt"], ["7:00 PM", "Yoga Flow"], ["7:30 PM", "Yoga Sculpt"], ["8:00 PM", "Yoga Flow"]] },
  { day: "Wed", classes: [["5:30 AM", "Yoga Flow"], ["6:00 AM", "Yoga Sculpt"], ["6:30 AM", "Yoga Flow"], ["7:30 AM", "Yoga Flow"], ["9:00 AM", "Sculpting for Longevity"], ["12:00 PM", "Yoga Flow"], ["12:00 PM", "Yoga Sculpt"], ["5:00 PM", "Yoga Flow"], ["5:30 PM", "Mat Pilates"], ["6:00 PM", "Yoga Flow"], ["6:30 PM", "Yoga Sculpt"], ["7:00 PM", "Yoga Flow"], ["7:30 PM", "Yoga Sculpt"], ["8:00 PM", "Restorative Yoga"]] },
  { day: "Thu", classes: [["5:30 AM", "Yoga Flow"], ["6:00 AM", "Strength Training"], ["6:30 AM", "Yoga Flow"], ["7:00 AM", "Yoga Sculpt"], ["7:30 AM", "Yoga Flow"], ["8:30 AM", "Yoga Flow"], ["10:00 AM", "Yoga Flow"], ["12:00 PM", "Power Yoga Flow"], ["12:00 PM", "Yoga Sculpt"], ["5:00 PM", "Yoga Flow"], ["5:30 PM", "Yoga Sculpt"], ["6:00 PM", "Power Yoga Flow"], ["6:30 PM", "Yoga Sculpt"], ["7:00 PM", "Yoga Flow"], ["7:30 PM", "Yoga Sculpt"], ["8:00 PM", "Restorative Yoga"]] },
  { day: "Fri", classes: [["5:30 AM", "Yoga Flow"], ["6:00 AM", "Banda Yoga Sculpt"], ["6:30 AM", "Power Yoga Flow"], ["7:00 AM", "Yoga Sculpt"], ["7:30 AM", "Yoga Flow"], ["9:00 AM", "Sculpting for Longevity"], ["12:00 PM", "Yoga Sculpt"], ["5:00 PM", "Power Yoga Flow"], ["5:30 PM", "MixxedFit"], ["6:00 PM", "Yoga Flow en Español"], ["6:30 PM", "Yoga Sculpt"]] },
  { day: "Sat", classes: [["7:30 AM", "Yoga Flow"], ["8:00 AM", "Strength Training"], ["8:30 AM", "Yoga Flow"], ["9:15 AM", "Mat Pilates"], ["9:30 AM", "Gentle Yoga Flow"], ["10:30 AM", "Yoga Flow"], ["10:30 AM", "Yoga Sculpt"]] },
  { day: "Sun", classes: [["7:30 AM", "Yoga Flow"], ["8:00 AM", "Zumba"], ["8:30 AM", "Yoga Flow"], ["9:15 AM", "Yoga Sculpt"], ["9:30 AM", "Yoga Flow"], ["10:30 AM", "Yoga Flow"], ["5:30 PM", "Yoga Flow"], ["6:30 PM", "Yoga Flow"]] },
];
