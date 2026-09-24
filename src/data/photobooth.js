// Selfie-mirror photo booth: frame catalog + geometry, shared by the
// client app (src/components/PhotoboothApp.svelte) and the frame renderer
// (scripts/render-photobooth-frames.mjs). The renderer draws each frame
// overlay PNG with a fully transparent "photo window" whose rect must match
// PHOTO_WINDOWS exactly; the app positions the guest's photo under that
// window, so if you move a window here, re-run the renderer:
//
//   node scripts/render-photobooth-frames.mjs
//
// Photos never touch a server: the app composites everything on-device.
//
// To add a frame: append an entry to PHOTOBOOTH_FRAMES, add a matching
// `build<Design>` function in the render script, re-render, done. Event
// frames should carry `sunset` (last day to show, inclusive) so seasonal
// designs retire themselves without a code change.

export const PHOTOBOOTH_RATIOS = [
  {
    id: "story",
    label: "Story",
    hint: "Personal · IG + TikTok",
    width: 1080,
    height: 1920,
  },
  {
    id: "portrait",
    label: "Post",
    hint: "Grid-worthy · IG feed",
    width: 1080,
    height: 1350,
  },
  {
    id: "square",
    label: "Square",
    hint: "Facebook + X",
    width: 1080,
    height: 1080,
  },
];

// The transparent photo window per ratio, in export pixels. Designs share
// these unless they list an override in WINDOW_OVERRIDES; always resolve via
// photoWindow(frameId, ratioId).
export const PHOTO_WINDOWS = {
  story: { x: 60, y: 240, w: 960, h: 1430, r: 28 },
  portrait: { x: 60, y: 180, w: 960, h: 980, r: 28 },
  square: { x: 60, y: 170, w: 960, h: 740, r: 28 },
};

// The Sweat Fest horizontal lockup is a wide 3.33:1 logo; it needs a taller
// top band than the shared geometry allows to stay legible. The ticket and
// 5K designs carry chunky headers/stubs of their own, so they get bespoke
// windows too.
const sweatfestLockupWindows = {
  story: { x: 60, y: 360, w: 960, h: 1310, r: 28 },
  portrait: { x: 60, y: 290, w: 960, h: 870, r: 28 },
  square: { x: 60, y: 270, w: 960, h: 640, r: 28 },
};
export const WINDOW_OVERRIDES = {
  sweatfest: sweatfestLockupWindows,
  "sweatfest-checker": sweatfestLockupWindows,
  "sweatfest-ticket": {
    story: { x: 90, y: 300, w: 900, h: 1150, r: 18 },
    portrait: { x: 90, y: 260, w: 900, h: 660, r: 18 },
    square: { x: 90, y: 240, w: 900, h: 420, r: 18 },
  },
  "sweatfest-5k": {
    story: { x: 70, y: 290, w: 940, h: 1200, r: 22 },
    portrait: { x: 70, y: 250, w: 940, h: 750, r: 22 },
    square: { x: 70, y: 230, w: 940, h: 560, r: 22 },
  },
  // Gala 2026 modernist set: the headline band carries a circle X badge that
  // breaks its bottom edge, so the window starts below the badge.
  "gala-mca": {
    story: { x: 60, y: 400, w: 960, h: 1270, r: 28 },
    portrait: { x: 60, y: 300, w: 960, h: 880, r: 28 },
    square: { x: 60, y: 276, w: 960, h: 654, r: 28 },
  },
  "gala-plaque": {
    story: { x: 60, y: 440, w: 960, h: 1250, r: 28 },
    portrait: { x: 60, y: 330, w: 960, h: 860, r: 28 },
    square: { x: 60, y: 300, w: 960, h: 640, r: 28 },
  },
  // One mono line up top, the paddle + RAISE YOUR PADDLE along the bottom:
  // the window shifts up so the bottom band has room.
  "gala-paddle": {
    story: { x: 60, y: 190, w: 960, h: 1440, r: 28 },
    portrait: { x: 60, y: 150, w: 960, h: 970, r: 28 },
    square: { x: 60, y: 140, w: 960, h: 730, r: 28 },
  },
};

export const photoWindow = (frameId, ratioId) => {
  const frame = PHOTOBOOTH_FRAMES.find((f) => f.id === frameId);
  if (frame?.fullBleed) {
    const ratio = PHOTOBOOTH_RATIOS.find((r) => r.id === ratioId);
    return { x: 0, y: 0, w: ratio.width, h: ratio.height, r: 0 };
  }
  return WINDOW_OVERRIDES[frameId]?.[ratioId] ?? PHOTO_WINDOWS[ratioId];
};

// Two styles per design: the bordered "frame" look, and a full-bleed "stamp"
// look (fullBleed: true) where the photo fills the whole canvas and branding
// sits on translucent scrim cards. Stamp backdrops only show through in the
// picker thumbnails (the photo always covers the canvas), so they use a
// neutral gray that keeps the translucent stamps readable there.
export const PHOTOBOOTH_FRAMES = [
  // Annual Gala 2026 (Fri Sep 25, MCA Chicago) in the program's black-and-
  // white modernist identity. Leads the catalog (and is the landing default)
  // through gala week; the sunset retires the block. `textStyle` points guest
  // text at a shared style key (see TEXT_STYLES).
  {
    id: "gala-mca",
    name: "LSP at the MCA",
    tag: "Fri, Sep 25",
    backdrop: "#FFFFFF",
    accent: "#FFBD59",
    textStyle: "gala26",
    sunset: "2026-10-02",
  },
  {
    id: "gala-night",
    name: "One Night",
    tag: "Fri, Sep 25",
    backdrop: "#000000",
    accent: "#FFBD59",
    textStyle: "gala26-night",
    sunset: "2026-10-02",
  },
  {
    id: "gala-plaque",
    name: "Gala Plaque",
    tag: "Annual Gala 2026",
    backdrop: "#FFFFFF",
    accent: "#FFBD59",
    textStyle: "gala26",
    sunset: "2026-10-02",
  },
  {
    id: "gala-paddle",
    name: "Raise Your Paddle",
    tag: "Paddle 26",
    backdrop: "#FFFFFF",
    accent: "#FFBD59",
    textStyle: "gala26",
    sunset: "2026-10-02",
  },
  {
    id: "gala-mca-stamp",
    name: "MCA Stamp",
    tag: "Full photo",
    backdrop: "#8a8a8a",
    accent: "#FFBD59",
    fullBleed: true,
    textStyle: "gala26-night",
    sunset: "2026-10-02",
  },
  {
    id: "gala-night-stamp",
    name: "Night Stamp",
    tag: "Full photo",
    backdrop: "#8a8a8a",
    accent: "#FFBD59",
    fullBleed: true,
    textStyle: "gala26-night",
    sunset: "2026-10-02",
  },
  {
    id: "gala-somos-stamp",
    name: "Somos LSP",
    tag: "Full photo",
    backdrop: "#8a8a8a",
    accent: "#FFBD59",
    fullBleed: true,
    textStyle: "gala26-night",
    sunset: "2026-10-02",
  },
  // The Sweat Fest family leads the catalog through the festival window (the
  // "meet me there" campaign wants a fest frame as the landing default);
  // sunset dates retire the whole block and studio takes over again.
  {
    id: "sweatfest-ticket",
    name: "Fest Ticket",
    tag: "Ticket secured",
    // Painted behind the photo window before the guest photo is drawn, so
    // any sliver the photo doesn't cover matches the frame.
    backdrop: "#f4f7dc",
    accent: "#ee3083",
    sunset: "2026-08-29",
  },
  {
    id: "sweatfest",
    name: "Sweat Fest",
    tag: "Sat, Aug 22",
    backdrop: "#e2ecac",
    accent: "#ee3083",
    sunset: "2026-08-29",
  },
  {
    id: "sweatfest-checker",
    name: "Meet Me There",
    tag: "Checkerboard",
    backdrop: "#e2ecac",
    accent: "#60a444",
    sunset: "2026-08-29",
  },
  {
    id: "sweatfest-5k",
    name: "Sunrise 5K",
    tag: "All paces",
    backdrop: "#f4f7dc",
    accent: "#f15b27",
    sunset: "2026-08-29",
  },
  {
    id: "sweatfest-pachanga",
    name: "Pachanga",
    tag: "The night set",
    backdrop: "#123f36",
    accent: "#00a7ab",
    sunset: "2026-08-29",
  },
  {
    id: "sweatfest-stamp",
    name: "Fest Stamp",
    tag: "Full photo",
    backdrop: "#8a8a8a",
    accent: "#ee3083",
    fullBleed: true,
    sunset: "2026-08-29",
  },
  {
    id: "sweatfest-ticket-stamp",
    name: "Ticket Stamp",
    tag: "Full photo",
    backdrop: "#8a8a8a",
    accent: "#ee3083",
    fullBleed: true,
    sunset: "2026-08-29",
  },
  {
    id: "sweatfest-admitted-stamp",
    name: "Admitted",
    tag: "Full photo",
    backdrop: "#8a8a8a",
    accent: "#ee3083",
    fullBleed: true,
    sunset: "2026-08-29",
  },
  {
    id: "sweatfest-crew-stamp",
    name: "Crew Pass",
    tag: "Full photo",
    backdrop: "#8a8a8a",
    accent: "#00a7ab",
    fullBleed: true,
    sunset: "2026-08-29",
  },
  {
    id: "sweatfest-polaroid-stamp",
    name: "Instant Photo",
    tag: "Full photo",
    backdrop: "#8a8a8a",
    accent: "#ee3083",
    fullBleed: true,
    sunset: "2026-08-29",
  },
  {
    id: "sweatfest-checker-stamp",
    name: "Checker Edge",
    tag: "Full photo",
    backdrop: "#8a8a8a",
    accent: "#60a444",
    fullBleed: true,
    sunset: "2026-08-29",
  },
  {
    id: "studio",
    name: "LSP Classic",
    tag: "Everyday",
    backdrop: "#FDF2F2",
    accent: "#ffbd59",
  },
  {
    id: "studio-stamp",
    name: "LSP Stamp",
    tag: "Full photo",
    backdrop: "#8a8a8a",
    accent: "#ffbd59",
    fullBleed: true,
  },
  // "New chapter" relocation campaign: no sunset until the move lands.
  {
    id: "pilsen",
    name: "Pilsen 💛",
    tag: "New chapter",
    backdrop: "#FFBD59",
    accent: "#1E1E1E",
  },
  {
    id: "pilsen-stamp",
    name: "Pilsen Stamp",
    tag: "Full photo",
    backdrop: "#8a8a8a",
    accent: "#ffbd59",
    fullBleed: true,
  },
  {
    id: "gala",
    name: "Annual Gala",
    tag: "Fri, Sep 25",
    backdrop: "#0a0e16",
    accent: "#ffbd59",
    sunset: "2026-10-02",
  },
  {
    id: "gala-stamp",
    name: "Gala Stamp",
    tag: "Full photo",
    backdrop: "#8a8a8a",
    accent: "#ffbd59",
    fullBleed: true,
    sunset: "2026-10-02",
  },
];

export const frameSrc = (frameId, ratioId) =>
  `/images/photobooth/frame-${frameId}-${ratioId}.png`;

// ---------------------------------------------------------------------------
// Guest personalization: preset lines, custom text, stickers. Text renders
// on-canvas in the frame's own voice (both styles of a design share one).
// Didot is an iOS system font; Georgia italic is the Android/desktop stand-in.
// ---------------------------------------------------------------------------
const TEXT_STYLES = {
  studio: {
    family: '"Rubik", sans-serif',
    weight: 800,
    italic: false,
    size: 34,
    color: "#FFFFFF",
    scrim: "rgba(30, 30, 30, 0.82)",
    tilt: -2,
  },
  pilsen: {
    family: '"Rubik", sans-serif',
    weight: 800,
    italic: false,
    size: 34,
    color: "#1E1E1E",
    scrim: "rgba(253, 242, 242, 0.9)",
    tilt: -2,
  },
  sweatfest: {
    family: '"Hello Baddie", "Rubik", sans-serif',
    weight: 400,
    italic: false,
    size: 46,
    color: "#ee3083",
    scrim: "rgba(226, 236, 172, 0.9)",
    tilt: -3,
  },
  "sweatfest-ticket": {
    family: '"Filson Soft", "Rubik", sans-serif',
    weight: 800,
    italic: false,
    size: 34,
    color: "#ee3083",
    scrim: "rgba(244, 247, 220, 0.92)",
    tilt: -2,
  },
  "sweatfest-checker": {
    family: '"Hello Baddie", "Rubik", sans-serif',
    weight: 400,
    italic: false,
    size: 46,
    color: "#e2ecac",
    scrim: "rgba(30, 30, 30, 0.85)",
    tilt: -3,
  },
  "sweatfest-5k": {
    family: '"Filson Soft", "Rubik", sans-serif',
    weight: 800,
    italic: false,
    size: 34,
    color: "#f15b27",
    scrim: "rgba(255, 255, 255, 0.9)",
    tilt: -2,
  },
  "sweatfest-pachanga": {
    family: '"Hello Baddie", "Rubik", sans-serif',
    weight: 400,
    italic: false,
    size: 46,
    color: "#f6a9c8",
    scrim: "rgba(18, 63, 54, 0.85)",
    tilt: 2,
  },
  "sweatfest-admitted": {
    family: '"Filson Soft", "Rubik", sans-serif',
    weight: 800,
    italic: false,
    size: 34,
    color: "#ee3083",
    scrim: "rgba(255, 255, 255, 0.88)",
    tilt: -6,
  },
  "sweatfest-crew": {
    family: '"Filson Soft", "Rubik", sans-serif',
    weight: 800,
    italic: false,
    size: 34,
    color: "#00a7ab",
    scrim: "rgba(244, 247, 220, 0.92)",
    tilt: -2,
  },
  "sweatfest-polaroid": {
    family: '"Hello Baddie", "Rubik", sans-serif',
    weight: 400,
    italic: false,
    size: 46,
    color: "#ee3083",
    scrim: "rgba(244, 247, 220, 0.9)",
    tilt: -2,
  },
  gala: {
    family: "Didot, Georgia, serif",
    weight: 400,
    italic: true,
    size: 40,
    color: "#FFBD59",
    scrim: "rgba(5, 7, 12, 0.68)",
    tilt: 0,
  },
  // Gala 2026 modernist set. The print faces (Archivo Expanded Black, Space
  // Mono) aren't shipped to the browser, so guest text uses the closest
  // system stack in heavy caps (`caps` uppercases on-canvas). Black on white
  // for the white-framed designs, white on black for the night + stamps.
  gala26: {
    family: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    weight: 800,
    italic: false,
    caps: true,
    size: 34,
    color: "#000000",
    scrim: "rgba(255, 255, 255, 0.92)",
    tilt: 0,
  },
  "gala26-night": {
    family: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    weight: 800,
    italic: false,
    caps: true,
    size: 34,
    color: "#FFFFFF",
    scrim: "rgba(0, 0, 0, 0.82)",
    tilt: 0,
  },
};

const PRESET_LINES = {
  studio: [
    "I just finished class at LSP",
    "Getting ready to sweat",
    "Come sweat with me",
    "Movement, culture y comunidad",
  ],
  pilsen: [
    "Keep LSP in Pilsen",
    "I stand with LSP",
    "Aquí nos quedamos",
    "This community is my gym",
  ],
  sweatfest: [
    "Join me at Sweat Fest!",
    "See you Aug 22!",
    "Come find me at Sweat Fest",
  ],
  "sweatfest-ticket": [
    "Ticket secured. Meet me there!",
    "I'm in for Aug 22. Are you?",
    "Got my Sweat Fest ticket!",
  ],
  "sweatfest-checker": [
    "Meet me at Sweat Fest!",
    "Pull up on Aug 22!",
    "Bringing my crew, join us!",
  ],
  "sweatfest-5k": [
    "Running the sunrise 5K, join me!",
    "Catch me at the 5K, 7 AM",
    "All paces. Run with me!",
  ],
  "sweatfest-pachanga": [
    "Meet me at the Pachanga!",
    "Dancing 'til the final set",
    "See you on the dance floor",
  ],
  "sweatfest-admitted": [
    "Officially in for Sweat Fest!",
    "Stamped and ready for Aug 22",
    "Get stamped. Grab a ticket!",
  ],
  "sweatfest-crew": [
    "You're on my crew list",
    "Crew assembling for Aug 22",
    "Plus-one spot open. Claim it!",
  ],
  "sweatfest-polaroid": [
    "Proof I'll be at Sweat Fest",
    "Meet me at 18th & Peoria",
    "Save the date with me!",
  ],
  gala: [
    "Meet me at the Gala",
    "Support LSP's mission",
    "See you Sept 25",
  ],
};
// Per-ratio presets: stories speak first person, feed formats keep timeless
// brand lines (framePresets picks by ratio when a design lists both).
const GALA26_PRESETS = {
  story: [
    "Meet me at the MCA tonight",
    "Dressed up for a reason",
    "Raising my paddle for LSP",
  ],
  feed: ["One night at the MCA", "Para la comunidad", "Somos LSP"],
};
PRESET_LINES.gala26 = GALA26_PRESETS;
PRESET_LINES["gala26-night"] = GALA26_PRESETS;

const baseDesign = (frameId) =>
  PHOTOBOOTH_FRAMES.find((f) => f.id === frameId)?.textStyle ??
  frameId.replace(/-stamp$/, "");
export const frameTextStyle = (frameId) => TEXT_STYLES[baseDesign(frameId)];
export const framePresets = (frameId, ratioId) => {
  const lines = PRESET_LINES[baseDesign(frameId)];
  if (Array.isArray(lines)) return lines;
  return ratioId === "story" ? lines.story : lines.feed;
};

// Sticker tray: brand marks (PNGs with real transparency; the small ones are
// rendered by scripts/render-photobooth-frames.mjs) plus a curated emoji set.
// Event stickers carry `sunset` like frames do; resolve via activeStickers().
const FEST_SUNSET = "2026-08-29";
const GALA_SUNSET = "2026-10-02";
const stickerSrc = (name) => `/images/photobooth/stickers/${name}.png`;
export const PHOTOBOOTH_STICKERS = [
  // Annual Gala 2026 die-cuts, from the printed sticker sheet.
  { id: "gala-facade", kind: "image", src: stickerSrc("gala-facade"), label: "MCA facade badge", sunset: GALA_SUNSET },
  { id: "gala-somos", kind: "image", src: stickerSrc("gala-somos"), label: "Somos LSP", sunset: GALA_SUNSET },
  // Sweat Fest campaign set: "I'm going, come with me" props, retired with
  // the fest frames.
  { id: "fest-ticket", kind: "image", src: stickerSrc("fest-ticket"), label: "Fest ticket", sunset: FEST_SUNSET },
  { id: "meet-me", kind: "image", src: stickerSrc("meet-me"), label: "Meet me there", sunset: FEST_SUNSET },
  { id: "im-in", kind: "image", src: stickerSrc("im-in"), label: "I'm in burst", sunset: FEST_SUNSET },
  { id: "aug-22", kind: "image", src: stickerSrc("aug-22"), label: "Aug 22 pennant", sunset: FEST_SUNSET },
  { id: "fest-5k", kind: "image", src: stickerSrc("fest-5k"), label: "Sunrise 5K bib", sunset: FEST_SUNSET },
  { id: "disco", kind: "image", src: stickerSrc("disco"), label: "Pachanga disco ball", sunset: FEST_SUNSET },
  { id: "fest", kind: "image", src: stickerSrc("sweatfest"), label: "Sweat Fest", sunset: FEST_SUNSET },
  { id: "checker", kind: "image", src: stickerSrc("checker"), label: "Checkerboard", sunset: FEST_SUNSET },
  // Evergreen brand marks.
  { id: "lsp-x", kind: "image", src: "/images/lsp-studio-logo.png", label: "LSP logo" },
  { id: "lsp-ring", kind: "image", src: "/logo3.png", label: "LSP ring" },
  { id: "sparkle", kind: "image", src: stickerSrc("sparkle"), label: "Gold sparkle" },
  { id: "diamond", kind: "image", src: stickerSrc("diamond"), label: "Gold diamond" },
  ...["🔥", "💪", "✨", "🎉", "🎟️", "🏃", "🕺", "☀️", "💛", "💃", "🧘", "🙌"].map(
    (char) => ({
      id: `emoji-${char}`,
      kind: "emoji",
      char,
    }),
  ),
];

const beforeSunset = (item, today) =>
  !item.sunset || new Date(`${item.sunset}T23:59:59`) >= today;

// Frames whose sunset date (if any) hasn't passed yet, newest events first.
export const activeFrames = (today = new Date()) =>
  PHOTOBOOTH_FRAMES.filter((f) => beforeSunset(f, today));

export const activeStickers = (today = new Date()) =>
  PHOTOBOOTH_STICKERS.filter((s) => beforeSunset(s, today));
