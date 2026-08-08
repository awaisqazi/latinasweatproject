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
// top band than the shared geometry allows to stay legible.
export const WINDOW_OVERRIDES = {
  sweatfest: {
    story: { x: 60, y: 360, w: 960, h: 1310, r: 28 },
    portrait: { x: 60, y: 290, w: 960, h: 870, r: 28 },
    square: { x: 60, y: 270, w: 960, h: 640, r: 28 },
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
  {
    id: "studio",
    name: "LSP Classic",
    tag: "Everyday",
    // Painted behind the photo window before the guest photo is drawn, so
    // any sliver the photo doesn't cover matches the frame.
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
  {
    id: "sweatfest",
    name: "Sweat Fest",
    tag: "Sat, Aug 22",
    backdrop: "#e2ecac",
    accent: "#ee3083",
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
  sweatfest: {
    family: '"Hello Baddie", "Rubik", sans-serif',
    weight: 400,
    italic: false,
    size: 46,
    color: "#ee3083",
    scrim: "rgba(226, 236, 172, 0.9)",
    tilt: -3,
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
};

const PRESET_LINES = {
  studio: [
    "I just finished class at LSP",
    "Getting ready to sweat",
    "Come sweat with me",
    "Movement, culture y comunidad",
  ],
  sweatfest: [
    "Join me at Sweat Fest!",
    "See you Aug 22!",
    "Come find me at Sweat Fest",
  ],
  gala: [
    "Meet me at the Gala",
    "Support LSP's mission",
    "See you Sept 25",
  ],
};

const baseDesign = (frameId) => frameId.replace(/-stamp$/, "");
export const frameTextStyle = (frameId) => TEXT_STYLES[baseDesign(frameId)];
export const framePresets = (frameId) => PRESET_LINES[baseDesign(frameId)];

// Sticker tray: brand marks (PNGs with real transparency; the small ones are
// rendered by scripts/render-photobooth-frames.mjs) plus a curated emoji set.
export const PHOTOBOOTH_STICKERS = [
  { id: "lsp-x", kind: "image", src: "/images/lsp-studio-logo.png", label: "LSP logo" },
  { id: "lsp-ring", kind: "image", src: "/logo3.png", label: "LSP ring" },
  { id: "fest", kind: "image", src: "/images/photobooth/stickers/sweatfest.png", label: "Sweat Fest" },
  { id: "sparkle", kind: "image", src: "/images/photobooth/stickers/sparkle.png", label: "Gold sparkle" },
  { id: "diamond", kind: "image", src: "/images/photobooth/stickers/diamond.png", label: "Gold diamond" },
  { id: "checker", kind: "image", src: "/images/photobooth/stickers/checker.png", label: "Checkerboard" },
  ...["🔥", "💪", "✨", "🎉", "💛", "💃", "🧘", "🙌"].map((char) => ({
    id: `emoji-${char}`,
    kind: "emoji",
    char,
  })),
];

// Frames whose sunset date (if any) hasn't passed yet, newest events first.
export const activeFrames = (today = new Date()) =>
  PHOTOBOOTH_FRAMES.filter(
    (f) => !f.sunset || new Date(`${f.sunset}T23:59:59`) >= today,
  );
