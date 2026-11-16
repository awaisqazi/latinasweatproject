// The Mural Park ribbon cutting (Sunday, November 15, 2026) and the grand
// reopening (Monday, November 16, 2026): single source of truth for the page
// at /ribboncutting (src/pages/ribboncutting.astro), its share card
// (scripts/render-ribboncutting-og.mjs) and its photo derivatives
// (scripts/prepare-ribboncutting-photos.mjs).
//
// Facts come from marketing/ribbon-cutting/BRIEF.md and the recorded remarks.
// Copy rules: Mural Park is a long-term residency, so LSP copy says "our new
// home at Mural Park" and nothing stronger (never "permanent", "for good",
// "forever", "ours", "a home of our own"); no em-dashes; English first; the
// old studio is "Morgan Street Studio"; nothing about leases or landlords;
// quotes are the speakers' own words, checked against the proofread captions
// (marketing/ribbon-cutting/remarks/LSP-Ribbon-Cutting-Remarks.en.srt) and the
// master transcript. `t` on a quote is its time in the full remarks (m:ss).
//
// WHO IS WHO (confirmed by Fez, 2026-11-15 and 2026-11-16). The ribbon line,
// left to right as the room saw it: Greg (Mural Park; red jacket), Alderman
// Byron Sigcho-Lopez (25th Ward; patterned sweater), Vanessa Tirado (LSP; long
// dark coat), Margarita Quiñones-Peña (LSP founder; black dress, gold
// scissors), Veronica Peña (LSP; grey top, glasses), Javier Yanez (president,
// Pilsen Chamber of Commerce; olive fleece, navy cap), William (City of Chicago
// BACP; mustard sweater). Greg and William: first names only. Nobody else in
// any photo is ever named.
//
// ---------------------------------------------------------------------------
// VIDEO AND ALBUM: fill these in and rebuild. Anything left null does not
// render at all (no placeholder boxes).
//   fullRemarks.youtubeId  the 11-character YouTube id of the full remarks
//                          (from https://youtu.be/<id>). Renders a 16:9
//                          click-to-load player at the end of "In their words".
//   highlights[].youtubeId one per reel (Shorts ids work the same way). Renders
//                          a row of 9:16 click-to-load players; only reels
//                          with an id appear. `speaker` null renders no line.
//   poster                 the still shown before play: a photo id from
//                          `photos` below (already on the site), or a public
//                          path such as "images/ribbon-cutting/poster-cut.jpg".
//   posterPosition         CSS object-position of the poster crop (the reels
//                          crop photos to 9:16, so aim it at the speaker).
//   albumUrl / albumCount  the shared Google Photos album and how many photos
//                          it holds. Renders "See all <n> photos from the
//                          night" after the gallery.
// ---------------------------------------------------------------------------

/** Rename the page by changing this (and the file name in src/pages). */
export const RIBBON_CUTTING_SLUG = "ribboncutting";

export const ribbonCuttingVideo = {
  fullRemarks: {
    // Unlisted on The Latina Sweat Project channel (uploaded 2026-11-16); unlisted videos
    // play when embedded. Same id once it is switched to Public.
    youtubeId: "AhSnyhw1fpg",
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
  albumUrl: "https://photos.app.goo.gl/BfT9TapqvEAGUwoC8",
  albumCount: 102,
};

// ---------------------------------------------------------------------------
// HERO: a muted loop of the cut from the 4K landscape master (IMG_5937, T 428
// to 436.3), cut so the file opens on the cheer (T 434.07 to 436.3) and then
// runs the countdown and the cut (T 428 to 434.07); looped, the cheer follows
// the cut without a seam. The first frame is the poster and the still that
// visitors who ask for reduced motion see.
//   wide: 1600x900, the whole frame (desktop and tablets in landscape)
//   tall: 720x960, a 3:4 crop centred on the scissors (phones)
// Made with ffmpeg (libx264, CRF 25, no audio track, faststart); recipe in
// marketing/ribbon-cutting/qa/page-v2/README.md.
//
// `ribbonCuttingHero` is the still the share card is built from (unchanged).
// ---------------------------------------------------------------------------
export const ribbonCuttingHeroLoop = {
  wide: { src: "videos/ribbon-cutting/the-cut-wide.mp4", poster: "images/ribbon-cutting/the-cut-wide", posterWidths: [1600, 2400], size: [1600, 900] },
  tall: { src: "videos/ribbon-cutting/the-cut-tall.mp4", poster: "images/ribbon-cutting/the-cut-tall", posterWidths: [720, 1080], size: [720, 960] },
  alt: "The ribbon cutting at Mural Park: the founder throws both arms up with the gold scissors overhead as the ribbon line cheers, then the countdown, the cut and the cheer again.",
};

export const ribbonCuttingHero = {
  // 4K frame of the cut (T 7:14 on the master clock), used by the share card.
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
  pauseLabel: "Pause the video",
  playLabel: "Play the video",

  story: {
    heading: "How we got here.",
    beats: [
      {
        key: "morgan",
        title: "Morgan Street Studio",
        quote: "As you all know, we lost our space a little while ago, and it took a lot, a lot of people to advocate, to speak up, to show up.",
        who: "Margarita Quiñones-Peña",
        t: "1:17",
      },
      {
        key: "popup",
        title: "Four Pop Up Weeks",
        body: "Through October we kept teaching, with pop-up classes around Pilsen and nearby.",
      },
      {
        key: "muralpark",
        title: "Mural Park",
        body: "On Sunday, November 15, our instructors, our community and our partners filled our new home for the ribbon cutting. Classes started the next morning.",
        quote: "We have a home, and we’re kicking off tomorrow.",
        who: "Margarita Quiñones-Peña",
        t: "1:38",
      },
    ],
  },

  remarks: {
    heading: "In their words.",
    countdown: "Five, four, three, two, one.",
    countdownWho: "The room, at 6:39 pm",
  },

  watch: {
    heading: "Watch the remarks.",
    reelsHeading: "Highlights",
  },

  photos: {
    heading: "The night in photos.",
  },

  album: {
    // `{n}` is replaced with albumCount.
    label: "See all {n} photos from the night",
    note: "Our Google Photos album opens in a new tab.",
  },

  line: {
    heading: "The ribbon line.",
    quote: "These men up here stood up and were speaking of us in rooms that we were not in.",
    who: "Margarita Quiñones-Peña",
    t: "1:29",
    from: "From left",
    thanks:
      "Thank you to Mural Park, the Pilsen Chamber of Commerce, Alderman Byron Sigcho-Lopez and the City of Chicago Department of Business Affairs and Consumer Protection.",
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

// The remarks, in the order they were spoken, one large line each. Every line
// is word for word from the proofread captions (t = m:ss into the full
// remarks); a line may be a fragment of a longer sentence but is never
// reworded. `portrait` is a photo id (a frame of the 4K video or a photo from
// the moment), `more` are smaller supporting lines. An entry with no `name`
// and a `room` label is the room's own voice.
export const ribbonCuttingRemarks = [
  {
    key: "vanessa",
    name: "Vanessa Tirado",
    role: "Latina Sweat Project",
    lead: "I’m so happy. I’m thrilled.",
    t: "1:49",
    portrait: "speaker-vanessa",
    portraitAlt: "Vanessa Tirado, in a long dark coat, smiling and clapping at the ribbon.",
  },
  {
    key: "veronica",
    name: "Veronica Peña",
    role: "Latina Sweat Project",
    lead: "This is for us, by us.",
    t: "2:52",
    more: [{ text: "So many of you have spoken in rooms that we were never even a part of.", t: "2:07" }],
    portrait: "speaker-veronica",
    portraitAlt: "Veronica Peña, in a grey top and glasses, speaking at the ribbon.",
  },
  {
    key: "javier",
    name: "Javier Yanez",
    role: "President, Pilsen Chamber of Commerce",
    lead: "So in reality, this is your win. You know, own it.",
    t: "4:04",
    more: [{ text: "I’m from Pilsen, born and raised. So seeing this here, stay here in Pilsen is something that moves me.", t: "4:17" }],
    portrait: "speaker-javier",
    portraitAlt: "Javier Yanez, in an olive fleece and navy cap, with his hand on his heart as he speaks.",
  },
  {
    key: "alderman",
    name: "Alderman Byron Sigcho-Lopez",
    role: "25th Ward",
    lead: "This just shows how powerful the power of the people is.",
    t: "5:26",
    portrait: "speaker-alderman",
    portraitAlt: "Alderman Byron Sigcho-Lopez, in a patterned sweater and glasses, speaking with the red ribbon in his hands.",
  },
  {
    key: "room",
    room: "The room, right after",
    lead: "¡Sí se puede!",
    t: "5:39",
  },
  {
    key: "margarita",
    name: "Margarita Quiñones-Peña",
    role: "Founder, Latina Sweat Project",
    lead: "The power of the people is we have 20,000 square feet to flow.",
    t: "5:49",
    more: [
      { text: "I’ve never seen a room full of people from our community be in a space of wellness.", t: "6:09" },
      { text: "81 people that we have here leading, and you all are just leaders.", t: "6:22" },
    ],
    portrait: "speaker-margarita",
    portraitAlt: "Margarita Quiñones-Peña, in a black dress with the gold scissors in hand, smiling as she speaks.",
  },
];

// The seven people in the ribbon line, left to right as they stand in the
// photo used for the thank-you (IMG_5942, after the cut, behind the LSP X:
// the order there is the reverse of the ribbon line at the ends, so it was
// labelled by wardrobe: mustard sweater = William, red jacket = Greg).
export const ribbonCuttingLinePhoto = {
  id: "IMG_5942",
  alt: "The seven people from the ribbon line laughing together with raised glasses behind the black LSP X sculpture.",
  people: [
    { name: "William", role: "City of Chicago BACP" },
    { name: "Alderman Byron Sigcho-Lopez", role: "25th Ward" },
    { name: "Vanessa Tirado", role: "Latina Sweat Project" },
    { name: "Veronica Peña", role: "Latina Sweat Project" },
    { name: "Margarita Quiñones-Peña", role: "Founder, Latina Sweat Project" },
    { name: "Javier Yanez", role: "Pilsen Chamber of Commerce" },
    { name: "Greg", role: "Mural Park" },
  ],
};

// The cut itself, full-bleed after the countdown: a 4K frame of the master
// (T 432.53, the ribbon falling).
export const ribbonCuttingCutStill = {
  id: "cut-03-ribbon-falling",
  alt: "The instant after the cut: the two ends of the red ribbon fall away as the ribbon line starts to cheer.",
};

// ---------------------------------------------------------------------------
// PHOTOS: every photo on the page, by id. Most are the file name in
// marketing/ribbon-cutting/photos-edited without .jpg; ids listed in
// `ribbonCuttingSources` come from another file (video frames and portrait
// crops). Alt text describes the scene and never names anyone except a
// speaker during their own remarks. `caption` names a speaker only during
// their own remarks. `phoneCrop` (an aspect ratio such as "1/1") and
// `phonePosition` crop a photo on phones only, where tall frames with a lot
// of ceiling would otherwise fill several screens; desktop shows every frame
// whole unless it has `crop` (an aspect ratio for every width, with
// `position`), used where a frame has a lot of empty ceiling or wall.
// ---------------------------------------------------------------------------
export const ribbonCuttingSources = {
  "speaker-vanessa": "marketing/ribbon-cutting/clips/stills/speaker-vanessa_DSC09764.jpg",
  "speaker-veronica": "marketing/ribbon-cutting/clips/stills/speaker-veronica_IMG5917_T175.20.jpg",
  "speaker-javier": "marketing/ribbon-cutting/clips/stills/speaker-javier_T262.00.jpg",
  "speaker-alderman": "marketing/ribbon-cutting/clips/stills/speaker-alderman_T327.50.jpg",
  "speaker-margarita": "marketing/ribbon-cutting/clips/stills/speaker-margarita_T377.30.jpg",
  "cut-03-ribbon-falling": "marketing/ribbon-cutting/clips/stills/cut-03-ribbon-falling_T432.53.jpg",
};

export const ribbonCuttingPhotos = {
  DSC09733: { alt: "Guests laughing at the check-in desk, a white desk with a black X cut into its front." },
  DSC09724: { phoneCrop: "4/5", phonePosition: "50% 45%", alt: "A guest in a Latina Sweat Project sweatshirt smiling on a leather sofa." },
  DSC09720: { alt: "Four friends smiling behind a table set with rows of coupe glasses." },
  DSC09721: { alt: "A couple on a leather sofa with their small dog, the black LSP X sculpture on the brick wall behind them." },
  DSC09736: { alt: "Three guests smiling by the elevators under a hand-painted sign that reads Thank you for supporting the hood." },
  DSC09745: { alt: "Four friends talking and laughing by the elevators." },
  DSC09747: { alt: "Three guests smiling with coupe glasses in the open loft." },
  DSC09754: { alt: "The loft before the remarks: a bottle raised overhead beside the hand-lettered Welcome Home! board, the black LSP X sculpture, plants and a striped table of framed photos." },
  DSC09756: { phoneCrop: "4/5", phonePosition: "50% 30%", alt: "A woman in a black dress laughing with an open bottle in one hand and the cork in the other." },
  IMG_5907: { phoneCrop: "4/5", phonePosition: "50% 55%", alt: "A woman in a black dress beams with a bottle of prosecco raised in each hand in front of the Power to the People and Welcome Home! signs." },
  IMG_5915: { crop: "16/9", position: "50% 88%", alt: "The view from the crowd: guests holding up phones as the ribbon line stands across the front of the room." },
  DSC09764: { alt: "The ribbon line laughing and clapping, a long red ribbon sweeping across the frame." },
  DSC09768: {
    alt: "The founder speaks with gold scissors in hand, two women in the ribbon line smiling beside her.",
    caption: "Margarita Quiñones-Peña, founder, welcoming the room.",
  },
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
  IMG_5942: { alt: ribbonCuttingLinePhoto.alt },
  DSC09777: { alt: "The toast: the ribbon line laughing with glasses raised." },
  DSC09779: { alt: "Three people in conversation during the toast, glasses in hand." },
  DSC09782: { alt: "A guest in a patterned sweater smiling with a coupe glass as the room mingles." },
  DSC09785: { alt: "Five friends smiling with coupe glasses in front of the brick wall." },
  DSC09791: { alt: "Three friends smiling close together with coupe glasses." },
  DSC09794: {
    alt: "Everyone together: a large group kneeling and standing around glowing LSP marquee letters, candles along the brick wall.",
    // The group fills the lower two thirds of the frame: trim the wall above.
    crop: "2/1",
    position: "50% 80%",
    phoneCrop: "4/3",
    phonePosition: "50% 70%",
  },
};

// The night, in order. `time` is when the chapter's first frame was taken
// (camera clocks corrected, Chicago time). The first row of each chapter is
// its lead photo, shown large; later rows are justified at desktop (every
// photo in a row the same height, nothing cropped) and stack on phones.
export const ribbonCuttingStory = [
  {
    key: "arriving",
    label: "Arriving",
    time: "5:47 pm",
    rows: [["DSC09733"], ["DSC09720", "DSC09724"], ["DSC09721", "DSC09736"], ["DSC09745", "DSC09747"]],
  },
  {
    key: "pour",
    label: "The first bottles",
    time: "6:21 pm",
    rows: [["DSC09754"], ["DSC09756", "IMG_5907"]],
  },
  {
    key: "remarks",
    label: "The remarks",
    time: "6:32 pm",
    rows: [["IMG_5915"], ["DSC09764", "DSC09768"], ["IMG_5919", "IMG_5921"]],
  },
  {
    key: "toast",
    label: "The toast",
    time: "6:39 pm",
    rows: [["DSC09777"], ["IMG_5926", "IMG_5928"], ["DSC09779", "DSC09782"], ["DSC09785", "DSC09791"]],
  },
  {
    key: "together",
    label: "Everyone together",
    time: "6:48 pm",
    rows: [["DSC09794"]],
  },
];

/** Every photo id the page uses, for the derivative script. */
export const ribbonCuttingPhotoIds = () => {
  const ids = new Set();
  for (const ch of ribbonCuttingStory) for (const row of ch.rows) for (const id of row) ids.add(id);
  for (const r of ribbonCuttingRemarks) if (r.portrait) ids.add(r.portrait);
  ids.add(ribbonCuttingLinePhoto.id);
  ids.add(ribbonCuttingCutStill.id);
  for (const v of [ribbonCuttingVideo.fullRemarks, ...ribbonCuttingVideo.highlights]) {
    if (v.poster && !v.poster.includes("/")) ids.add(v.poster);
  }
  return [...ids];
};

// Widths generated for every photo; the hero also gets HERO_WIDTHS.
export const PHOTO_WIDTHS = [640, 1080, 1600];
export const HERO_WIDTHS = [900, 1600, 2400];
export const PHOTO_DIR = "images/ribbon-cutting";
