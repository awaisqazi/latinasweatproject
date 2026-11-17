// LSP Giving Tuesday share-kit images, drawn IN THE BROWSER on a canvas for
// whichever instructor opens /givingtuesday/kit (the roster changes at
// runtime, so there are no per-person files and no build step).
//
// Identity: the share card (scripts/render-givingtuesday-og.mjs, design.md
// "Giving Tuesday"): a flat panel of LSP highlight yellow #FFDE59, one ink
// #1e1e1e, Rubik 400 and 700, the LSP logo (public/logo.png) whole and
// unaltered (only its empty transparent margin is trimmed), and the class
// photo the page opens on (public/images/givingtuesday/wall/one-960.webp).
// Type sits on the yellow, never on the photo. No gradients, shadows, chips
// or rules. Every line is measured: the headline and the link shrink until
// they fit, so nothing runs off the frame. drawKit() returns the ink boxes so
// a check can prove it.
//
// Framework-free on purpose (no imports), so a headless harness can load it.

export const SUN = "#ffde59";
export const INK = "#1e1e1e";

// feed 4:5, story 9:16. panel = height of the yellow panel (the photo fills
// the rest). The story keeps type and logo out of Instagram's top ~250 px
// and bottom ~300 px (the photo runs under those).
export const FORMATS = {
  feed: {
    w: 1080, h: 1350, panel: 700, padX: 80,
    logoTop: 72, logoH: 112, minGapBelowLogo: 40,
    bottom: 64,
    kicker: 40, head: { max: 112, min: 24 }, date: 44, link: { max: 36, min: 14 },
    gapKicker: 26, gapHead: 34, gapDate: 22, lead: 1.02,
    photoAnchor: 0.15,
  },
  story: {
    w: 1080, h: 1920, panel: 1110, padX: 88,
    logoTop: 272, logoH: 136, minGapBelowLogo: 56,
    bottom: 84,
    kicker: 52, head: { max: 150, min: 28 }, date: 58, link: { max: 44, min: 16 },
    gapKicker: 34, gapHead: 46, gapDate: 28, lead: 1.02,
    photoAnchor: 0.15,
  },
};

const FAMILY = '"Rubik", sans-serif';

/** Wait for Rubik 400 and 700. Resolves true when both are really loaded. */
export async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts) return false;
  try {
    await Promise.all([document.fonts.load(`700 100px ${FAMILY}`, "Help"), document.fonts.load(`400 40px ${FAMILY}`, "Tuesday")]);
    await document.fonts.ready;
  } catch {
    /* fall through to the check */
  }
  return document.fonts.check(`700 100px ${FAMILY}`, "Help") && document.fonts.check(`400 40px ${FAMILY}`, "Tuesday");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image failed: ${src}`));
    img.src = src;
  });
}

// The logo's opaque bounding box (its empty transparent margin removed).
function trimBox(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const { data, width, height } = x.getImageData(0, 0, c.width, c.height);
  let l = width, t = height, r = -1, b = -1;
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < width; i++) {
      if (data[(y * width + i) * 4 + 3] > 4) {
        if (i < l) l = i;
        if (i > r) r = i;
        if (y < t) t = y;
        if (y > b) b = y;
      }
    }
  }
  if (r < 0) return { sx: 0, sy: 0, sw: width, sh: height };
  return { sx: l, sy: t, sw: r - l + 1, sh: b - t + 1 };
}

let assetsPromise = null;
/** Logo + photo, loaded once per page. `base` is the site base ("/"). */
export function loadAssets(base = "/") {
  if (!assetsPromise) {
    assetsPromise = Promise.all([loadImage(`${base}logo.png`), loadImage(`${base}images/givingtuesday/wall/one-960.webp`)])
      .then(([logo, photo]) => ({ logo, logoBox: trimBox(logo), photo }))
      .catch((err) => {
        assetsPromise = null;
        throw err;
      });
  }
  return assetsPromise;
}

function setFont(ctx, weight, size, tracking = 0) {
  ctx.font = `${weight} ${size}px ${FAMILY}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = tracking ? `${(tracking * size).toFixed(2)}px` : "0px";
}
function inkWidth(ctx, text) {
  const m = ctx.measureText(text);
  const ink = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0);
  return Math.max(m.width, ink);
}

/**
 * Draw one image.
 *   canvas  a <canvas> (resized here)
 *   format  "feed" | "story"
 *   words   { kicker, lines: [..], altLines?: [..], date, link } (link without https://)
 *   assets  from loadAssets()
 * Returns { boxes: { name: [l, t, r, b] }, headSize, linkSize, w, h }.
 */
export function drawKit(canvas, format, words, assets) {
  const F = FORMATS[format];
  if (!F) throw new Error(`unknown format ${format}`);
  canvas.width = F.w;
  canvas.height = F.h;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const maxW = F.w - F.padX * 2;
  const HEAD_TRACK = -0.02;

  // Ground.
  ctx.fillStyle = SUN;
  ctx.fillRect(0, 0, F.w, F.h);

  // Photo: cover the area under the panel, cropping mostly from the bottom
  // (arms and faces stay; feet may go).
  const { photo } = assets;
  const dh = F.h - F.panel;
  const scale = Math.max(F.w / photo.naturalWidth, dh / photo.naturalHeight);
  const sw = F.w / scale;
  const sh = dh / scale;
  const sx = (photo.naturalWidth - sw) / 2;
  const sy = (photo.naturalHeight - sh) * F.photoAnchor;
  ctx.drawImage(photo, sx, sy, sw, sh, 0, F.panel, F.w, dh);

  // Logo, whole, top left.
  const { logo, logoBox: lb } = assets;
  const logoW = Math.round(F.logoH * (lb.sw / lb.sh));
  ctx.drawImage(logo, lb.sx, lb.sy, lb.sw, lb.sh, F.padX, F.logoTop, logoW, F.logoH);
  const logoBottom = F.logoTop + F.logoH;

  // Metrics for a size: cap height and descender depth (ink, measured).
  const cap = (weight, size) => {
    setFont(ctx, weight, size);
    return ctx.measureText("H").actualBoundingBoxAscent || size * 0.7;
  };
  const desc = (weight, size) => {
    setFont(ctx, weight, size);
    return ctx.measureText("gjpy,").actualBoundingBoxDescent || size * 0.22;
  };

  // Link: shrink until it fits the width.
  let linkSize = F.link.max;
  for (; linkSize > F.link.min; linkSize -= 1) {
    setFont(ctx, 400, linkSize);
    if (inkWidth(ctx, words.link) <= maxW) break;
  }
  // Headline: biggest size where every line fits the width AND the whole
  // block fits between the logo and the bottom margin.
  const room = F.panel - F.bottom - (logoBottom + F.minGapBelowLogo);
  const blockHeight = (lines, hs) =>
    cap(700, F.kicker) + F.gapKicker + cap(700, hs) + (lines.length - 1) * hs * F.lead + desc(700, hs) * 0.4 +
    F.gapHead + cap(400, F.date) + F.gapDate + cap(400, linkSize) + desc(400, linkSize);
  const bestSize = (lines) => {
    let s = F.head.max;
    for (; s > F.head.min; s -= 2) {
      setFont(ctx, 700, s, HEAD_TRACK);
      if (lines.every((l) => inkWidth(ctx, l) <= maxW) && blockHeight(lines, s) <= room) break;
    }
    return s;
  };
  // A long first name may read better on its own line (altLines, e.g.
  // "Help" / "Maximiliana" / "raise $150"): used only when it is clearly bigger.
  let lines = words.lines;
  let headSize = bestSize(lines);
  if (words.altLines?.length) {
    const alt = bestSize(words.altLines);
    if (alt > headSize * 1.15) {
      lines = words.altLines;
      headSize = alt;
    }
  }

  const boxes = {};
  const put = (name, text, weight, size, baseline, tracking = 0) => {
    setFont(ctx, weight, size, tracking);
    ctx.fillStyle = INK;
    ctx.fillText(text, F.padX, baseline);
    const m = ctx.measureText(text);
    boxes[name] = [
      Math.round(F.padX - (m.actualBoundingBoxLeft || 0)),
      Math.round(baseline - (m.actualBoundingBoxAscent || 0)),
      Math.round(F.padX + Math.max(m.actualBoundingBoxRight || 0, m.width)),
      Math.round(baseline + (m.actualBoundingBoxDescent || 0)),
    ];
  };

  // Lay out bottom up from the panel's bottom margin.
  let y = F.panel - F.bottom - desc(400, linkSize);
  put("link", words.link, 400, linkSize, y);
  y -= cap(400, linkSize) + F.gapDate;
  put("date", words.date, 400, F.date, y);
  y -= cap(400, F.date) + F.gapHead + desc(700, headSize) * 0.4;
  for (let i = lines.length - 1; i >= 0; i--) {
    put(`line${i + 1}`, lines[i], 700, headSize, y, HEAD_TRACK);
    if (i > 0) y -= headSize * F.lead;
  }
  y -= cap(700, headSize) + F.gapKicker;
  put("kicker", words.kicker, 700, F.kicker, y);
  boxes.logo = [F.padX, F.logoTop, F.padX + logoW, logoBottom];
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

  return { boxes, lines, headSize, linkSize, w: F.w, h: F.h, panel: F.panel, padX: F.padX };
}

/** True when every box sits inside the frame with `margin` px to spare and
 *  every text box stays on the yellow panel. */
export function fitsFrame(report, margin = 24) {
  return Object.entries(report.boxes).every(([, [l, t, r, b]]) =>
    l >= margin && t >= margin && r <= report.w - margin && b <= report.panel - margin,
  );
}

/** canvas -> Blob (JPEG by default). */
export function canvasBlob(canvas, type = "image/jpeg", quality = 0.92) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality),
  );
}
