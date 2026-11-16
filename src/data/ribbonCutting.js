// The Mural Park ribbon cutting (Sunday, November 15, 2026) and the grand
// reopening (Monday, November 16, 2026): single source of truth for the page
// at /ribboncutting (src/pages/ribboncutting.astro), its share card
// (scripts/render-ribboncutting-og.mjs) and its photo derivatives
// (scripts/prepare-ribboncutting-photos.mjs).
//
// Facts come from marketing/ribbon-cutting/BRIEF.md and the recorded remarks.
// Copy rules: Mural Park is a long-term residency, so LSP copy says "our new home at Mural Park" and nothing stronger; no em-dashes;
// English first; the old studio is "Morgan Street Studio"; quotes are the
// speakers' own words. The five people who spoke (Margarita Quiñones-Peña,
// Vanessa Tirado, Veronica Peña, Javier Yanez, Alderman Byron Sigcho-Lopez;
// names confirmed by Fez 2026-11-15) are named in `ribbonCuttingRemarks`; a
// speaker whose `name` is set to null shows UNNAMED_SPEAKER instead. The two
// unidentified men in the ribbon line are never named.
//
// ---------------------------------------------------------------------------
// VIDEO AND ALBUM: fill these in and rebuild. Anything left null does not
// render at all (no placeholder boxes).
//   fullRemarks.youtubeId  the 11-character YouTube id of the full remarks
//                          (from https://youtu.be/<id>). Renders a 16:9
//                          click-to-load player.
//   highlights[].youtubeId one per reel (Shorts ids work the same way). Renders
//                          a row of 9:16 click-to-load players; only reels
//                          with an id appear. `speaker` null renders no line.
//   poster                 the still shown before play: a photo id from
//                          `photos` below (already on the site), or a public
//                          path such as "images/ribbon-cutting/poster-cut.jpg".
//   posterPosition         CSS object-position of the poster crop (the reels
//                          crop photos to 9:16, so aim it at the speaker).
//   albumUrl               a shared Google Photos album link. Renders a "See
//                          every photo" link under the photos.
// ---------------------------------------------------------------------------

/** Rename the page by changing this (and the file name in src/pages). */
export const RIBBON_CUTTING_SLUG = "ribboncutting";

export const ribbonCuttingVideo = {
  fullRemarks: {
    youtubeId: null,
    title: "The remarks and the ribbon cutting at Mural Park",
    duration: "7 min",
    poster: "DSC09765",
  },
  highlights: [
    { youtubeId: null, title: "We cut the ribbon.", speaker: "The countdown and the cut", poster: "IMG_5926", posterPosition: "72% 50%" },
    { youtubeId: null, title: "The power of the people.", speaker: "Margarita Quiñones-Peña", poster: "DSC09768", posterPosition: "52% 50%" },
    { youtubeId: null, title: "It takes a village.", speaker: "Alderman Byron Sigcho-Lopez", poster: "IMG_5921", posterPosition: "35% 50%" },
    { youtubeId: null, title: "This is your win.", speaker: "Javier Yanez, Pilsen Chamber of Commerce", poster: "IMG_5919", posterPosition: "82% 50%" },
    { youtubeId: null, title: "For us, by us.", speaker: "Veronica Peña, Latina Sweat Project", poster: "DSC09770", posterPosition: "52% 50%" },
  ],
  albumUrl: null,
};

// ---------------------------------------------------------------------------
// HERO. To swap in a frame from the 4K video later: put the JPEG anywhere in
// the repo, point `source` at it, give it a new `id`, re-run
// `node scripts/prepare-ribboncutting-photos.mjs`, and update `alt`.
// `position` is the CSS object-position used when the frame is cropped.
// ---------------------------------------------------------------------------
export const ribbonCuttingHero = {
  // 4K frame of the cut (T 7:14 on the master clock), the frame the Instagram
  // carousel cover uses. The man at the far right edge is half out of the
  // source frame, so the hero shows it at 8:5 anchored left, which trims him
  // off cleanly and keeps the raised scissors inside the top edge.
  id: "cut-04-arms-up",
  source: "marketing/ribbon-cutting/clips/stills/cut-04-arms-up-cheer_T434.07.jpg",
  alt: "The moment after the cut: the founder throws both arms up with the gold scissors overhead as the ribbon line cheers and the cut ends of the red ribbon fall.",
  aspect: "8 / 5",
  position: "0% 50%",
};

export const ribbonCutting = {
  metaTitle: "We Cut the Ribbon at Mural Park | The Latina Sweat Project",
  socialTitle: "We cut the ribbon at Mural Park · Latina Sweat Project",
  metaDescription:
    "On Sunday, November 15, 2026, Latina Sweat Project cut the ribbon on our new home at Mural Park, in Pilsen. The remarks, the night in photos, and where to find us.",
  headline: ["We cut the", "ribbon."],
  sub: "Our new home at Mural Park, in Pilsen.",
  dateLine: "Sunday, November 15, 2026",
  intro:
    "We gathered our instructors, our community and the partners who spoke up for us, and cut the ribbon on our new studio at Mural Park. Classes started the next morning, Monday, November 16.",

  remarks: {
    heading: "In their words.",
    sub: "The remarks, in the order they were spoken.",
    coda: "Five, four, three, two, one.",
  },

  watch: {
    heading: "Watch the remarks.",
    reelsHeading: "Highlights",
  },

  photos: {
    heading: "The night in photos.",
    albumLabel: "See every photo",
  },

  thanks: {
    heading: "Gracias.",
    line: "You stood up for us in rooms we were not in.",
  },

  open: {
    heading: ["We’re home", "in Pilsen."],
    place: ["Mural Park", "924 W 19th Place, fourth floor", "Pilsen, Chicago"],
    bookLabel: "Book a class",
    bookPath: "schedule",
    directionsLabel: "Directions",
    directionsUrl: "https://www.google.com/maps/search/?api=1&query=924+W+19th+Place+Chicago+IL+60608",
    signoff: "Gracias, comunidad.",
    word: "Open",
  },
};

/** Shown in place of a speaker's name while `name` is null. */
export const UNNAMED_SPEAKER = "From the LSP team";

// The remarks, in the order they were spoken. Every line is checked word for
// word against remotion-video/ribbon-cutting/transcripts/master_transcript.md
// (2026-11-15); a line may be a fragment of a longer sentence but never
// reworded. "¡Sí se puede!" is the crowd's chant, not the Alderman's, so it is
// not quoted. `lead` is the large line, `more` the supporting lines.
export const ribbonCuttingRemarks = [
  {
    key: "margarita-welcome",
    name: "Margarita Quiñones-Peña",
    role: "Founder, Latina Sweat Project",
    lead: "We have a home and we’re kicking off tomorrow.",
    more: ["As you all know, we lost our space a little while ago."],
  },
  {
    key: "vanessa",
    name: "Vanessa Tirado",
    role: "Latina Sweat Project",
    lead: "I’m so happy. I’m thrilled.",
    more: ["It’s been such a journey to have and be able to meet every single one of you, your souls."],
  },
  {
    key: "veronica",
    name: "Veronica Peña",
    role: "Latina Sweat Project",
    lead: "This is for us, by us.",
    more: ["So many of you have spoken in rooms that we were never even a part of."],
  },
  {
    key: "javier",
    name: "Javier Yanez",
    role: "President, Pilsen Chamber of Commerce",
    lead: "This is your win. You know, own it.",
    more: [
      "You guys are creating miracles.",
      "I’m from Pilsen, born and raised. So seeing this here, stay here in Pilsen is something that moves me.",
    ],
  },
  {
    key: "alderman",
    name: "Alderman Byron Sigcho-Lopez",
    role: "25th Ward",
    lead: "It really takes a village.",
    more: ["This just shows how powerful the power of the people is."],
  },
  {
    key: "margarita-closing",
    name: "Margarita Quiñones-Peña",
    role: "Founder, Latina Sweat Project",
    lead: "The power of the people is we have 20,000 square feet to flow.",
    more: ["Our mission is liberation.", "Let’s cut this ribbon."],
  },
];

export const ribbonCuttingPartners = [
  "Mural Park",
  "Pilsen Chamber of Commerce",
  "Alderman Byron Sigcho-Lopez, 25th Ward",
  "City of Chicago Business Affairs and Consumer Protection",
];

// ---------------------------------------------------------------------------
// PHOTOS: every photo on the page except the hero, by id (the file name in
// marketing/ribbon-cutting/photos-edited without .jpg). Alt text describes
// the scene and never names anyone. `caption` names a speaker only during
// their own remarks. `phoneCrop` (an aspect ratio such as "1/1") and
// `phonePosition` crop a photo on phones only, where tall frames with a lot
// of ceiling would otherwise fill several screens; desktop shows every frame
// whole.
// ---------------------------------------------------------------------------
export const ribbonCuttingPhotos = {
  DSC09733: { alt: "Guests laughing at the check-in desk, a white desk with a black X cut into its front." },
  DSC09724: { alt: "A guest in a Latina Sweat Project sweatshirt smiling on a leather sofa." },
  DSC09720: { alt: "Four friends smiling behind a table set with rows of coupe glasses." },
  DSC09721: { alt: "A couple on a leather sofa with their small dog, the black LSP X sculpture on the brick wall behind them." },
  DSC09727: { alt: "A guest in an olive LSP sweatshirt smiling, phone and water bottle in hand." },
  DSC09736: { alt: "Three guests smiling by the elevators under a hand-painted sign that reads Thank you for supporting the hood." },
  DSC09745: { alt: "Four friends talking and laughing by the elevators." },
  DSC09754: { alt: "The loft before the remarks: a hand-lettered Welcome Home! board, the black LSP X sculpture, plants and a striped table of framed photos." },
  IMG_5907: { alt: "A woman in a black dress beams with a bottle of prosecco raised in each hand in front of the Power to the People and Welcome Home! signs." },
  DSC09747: { alt: "Three guests smiling with coupe glasses in the open loft." },
  IMG_5915: { alt: "The view from the crowd: guests holding up phones as the ribbon line stands across the front of the room." },
  DSC09768: {
    alt: "The founder speaks with gold scissors in hand, two women in the ribbon line smiling beside her.",
    caption: "Margarita Quiñones-Peña, founder, welcoming the room.",
  },
  DSC09764: { alt: "The ribbon line laughing and clapping, a long red ribbon sweeping across the frame." },
  IMG_5919: {
    phoneCrop: "1/1",
    phonePosition: "50% 52%",
    alt: "A man in an olive fleece and navy cap speaks while holding the red ribbon.",
    caption: "Javier Yanez, president of the Pilsen Chamber of Commerce.",
  },
  IMG_5921: {
    phoneCrop: "1/1",
    phonePosition: "50% 70%",
    alt: "A man in a patterned sweater and glasses speaks at the ribbon with a microphone clipped to his sweater.",
    caption: "Alderman Byron Sigcho-Lopez, 25th Ward.",
  },
  IMG_5926: {
    phoneCrop: "1/1",
    phonePosition: "50% 75%",
    alt: "Right after the cut: the ribbon in pieces in one man's hands as the line laughs with glasses raised.",
  },
  IMG_5928: {
    phoneCrop: "1/1",
    phonePosition: "50% 80%",
    alt: "Seven people from the ribbon line shoulder to shoulder with their glasses up.",
  },
  IMG_5942: {
    alt: "Seven people from the ribbon line laughing together with raised glasses behind the black LSP X sculpture.",
  },
  DSC09777: { alt: "The toast: the ribbon line laughing with glasses raised." },
  DSC09779: { alt: "Three people in conversation during the toast, glasses in hand." },
  DSC09782: { alt: "A guest in a patterned sweater smiling with a coupe glass as the room mingles." },
  DSC09785: { alt: "Five friends smiling with coupe glasses in front of the brick wall." },
  DSC09791: { alt: "Three friends smiling close together with coupe glasses." },
  DSC09794: {
    alt: "Everyone together: a large group kneeling and standing around glowing LSP marquee letters, candles along the brick wall.",
    // On phones the group is small in the wide frame, so it is cropped to 4:3 there.
    phoneCrop: "4/3",
    phonePosition: "50% 60%",
  },
};

// The story, in the order of the night. Each row is laid out as a justified
// row at desktop (every photo the same height, nothing cropped); on phones a
// photo takes the full width. A row of portraits alone is capped so its photos
// are no taller than about 600 px at desktop.
export const ribbonCuttingStory = [
  {
    key: "arriving",
    label: "Arriving",
    rows: [["DSC09733", "DSC09724"], ["DSC09720", "DSC09721"], ["DSC09727", "DSC09736"]],
  },
  {
    key: "ready",
    label: "The room, ready",
    rows: [["DSC09754", "IMG_5907"], ["DSC09745", "DSC09747"]],
  },
  {
    key: "line",
    label: "The ribbon line",
    rows: [["IMG_5915", "DSC09768"], ["DSC09764"], ["IMG_5919", "IMG_5921"]],
  },
  {
    key: "cut",
    label: "After the cut",
    rows: [["IMG_5926", "IMG_5942"]],
  },
  {
    key: "toast",
    label: "Salud",
    rows: [["IMG_5928", "DSC09777"], ["DSC09779", "DSC09782"], ["DSC09785", "DSC09791"]],
  },
  {
    key: "together",
    label: "Everyone together",
    rows: [["DSC09794"]],
  },
];

/** Every photo id the page uses (hero first), for the derivative script. */
export const ribbonCuttingPhotoIds = () => {
  const ids = new Set();
  for (const ch of ribbonCuttingStory) for (const row of ch.rows) for (const id of row) ids.add(id);
  for (const v of [ribbonCuttingVideo.fullRemarks, ...ribbonCuttingVideo.highlights]) {
    if (v.poster && !v.poster.includes("/")) ids.add(v.poster);
  }
  return [...ids];
};

// Widths generated for every photo; the hero also gets HERO_WIDTHS.
export const PHOTO_WIDTHS = [640, 1080, 1600];
export const HERO_WIDTHS = [900, 1600, 2400];
export const PHOTO_DIR = "images/ribbon-cutting";
