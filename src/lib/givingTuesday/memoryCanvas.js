// "7 days. 7 memories. 1 community." images for the LSP Giving Tuesday kit
// (GivingMemoryWeek.svelte), drawn IN THE BROWSER on a canvas: a 1080x1920
// story and a 1080x1350 post per day, with the instructor's own words and
// photo when they add them. Nothing is uploaded: the photo is decoded here,
// drawn here and exported here.
//
// Identity: the kit images (kitCanvas.js, design.md "Giving Tuesday"): flat
// LSP yellow #FFDE59, one ink #1e1e1e, Rubik 400 and 700, the LSP logo whole
// (only its empty transparent margin trimmed), type only on the yellow. The
// photo sits in its own plain rectangle, full width at the bottom like the kit
// images, and type never touches it. No chips, rules, shadows or gradients.
//
// Four states, one family (logo, "LSP Giving Tuesday · Day N", then the
// words, then the invite line and the signature: name, "Help me raise $X",
// the short link):
//   a  no photo, no words   the prompt is the headline, as big as it fits
//   b  words only           the prompt small (400), their words large (700)
//   c  photo only           the prompt as the headline above the photo
//   d  photo and words      the prompt small, their words, then the photo
// Without a photo the signature sits on the bottom margin and the headline
// takes the room between; with a photo the type stacks from the logo down and
// the photo takes everything under it (never less than photoMin).
//
// Every line is measured: headlines and words shrink and wrap at spaces until
// they fit, the name, kicker and link shrink to the width. drawMemory()
// returns the ink boxes and the photo rect; checkMemory() proves nothing is
// outside the safe area, overlapping, or on the photo. The story keeps every
// ink box out of Instagram's top 250 px and bottom 300 px.
//
// Framework-free (only kitCanvas.js, itself import-free), so a headless
// harness can load it.

import { SUN, INK, ensureFonts, canvasBlob } from "./kitCanvas.js";

export { SUN, INK, ensureFonts, canvasBlob };

const FAMILY = '"Rubik", sans-serif';
const TRACK = -0.02; // big 700 lines, as kitCanvas's headline

// [max, min] pairs are font sizes in px. Readability floor at 1080 wide:
// nothing under 30 px on the story or 28 px on the post.
export const MEMORY_FORMATS = {
  story: {
    w: 1080, h: 1920, padX: 88, floor: 30,
    safeTop: 250, safeBottom: 1620, // ink only between these
    top: 280, bottom: 1580, // logo top / last ink line bottom (no photo)
    logoH: 124, gapLogo: 60,
    kicker: [46, 30], gapKicker: 40,
    promptHero: { a: [230, 56] }, heroLead: 1.02, heroLines: {},
    promptSmall: [54, 34], promptLead: 1.18, gapPrompt: 40,
    memoryHero: { b: [200, 34] }, memoryLead: 1.1,
    gapHero: 72,
    invite: [40, 30], inviteLead: 1.3, gapInvite: 52,
    name: [56, 30], gapName: 22, help: [42, 30], gapHelp: 16, link: [42, 30],
    // With a photo the photo leads: the type is compact and the photo takes
    // everything under it (photoTarget is what the type is sized for,
    // photoMin the least it may get).
    tight: {
      logoH: 92, gapLogo: 32, kicker: [34, 30], gapKicker: 24,
      promptHero: { c: [72, 40] }, heroLines: { c: 2 },
      promptSmall: [32, 30], gapPrompt: 20,
      memoryHero: { d: [60, 30] },
      gapHero: 36, invite: [30, 30], gapInvite: 26, name: [40, 30], gapName: 10, help: [30, 30], gapHelp: 8, link: [30, 30],
      photoPad: 40, photoTarget: { c: 1040, d: 860 }, photoMin: { c: 1000, d: 700 },
    },
  },
  post: {
    w: 1080, h: 1350, padX: 80, floor: 28,
    safeTop: 0, safeBottom: 1350,
    top: 64, bottom: 1282,
    logoH: 96, gapLogo: 40,
    kicker: [36, 28], gapKicker: 28,
    promptHero: { a: [170, 44] }, heroLead: 1.02, heroLines: {},
    promptSmall: [40, 30], promptLead: 1.18, gapPrompt: 30,
    memoryHero: { b: [150, 30] }, memoryLead: 1.1,
    gapHero: 44,
    invite: [31, 28], inviteLead: 1.3, gapInvite: 34,
    name: [42, 28], gapName: 16, help: [31, 28], gapHelp: 12, link: [31, 28],
    tight: {
      logoH: 64, gapLogo: 24, kicker: [28, 28], gapKicker: 18,
      promptHero: { c: [56, 34] }, heroLines: { c: 2 },
      promptSmall: [28, 28], gapPrompt: 16,
      memoryHero: { d: [44, 28] },
      gapHero: 26, invite: [28, 28], gapInvite: 20, name: [34, 28], gapName: 8, help: [28, 28], gapHelp: 6, link: [28, 28],
      photoPad: 30, photoTarget: { c: 760, d: 620 }, photoMin: { c: 720, d: 520 },
    },
  },
};

// Default crop: a photo taller than its window is anchored toward the top
// (faces sit in the upper part of portrait photos); otherwise centred.
export const TALL_FOCUS_Y = 0.35;
export const MAX_SOURCE_PX = 2400;
export const MAX_ZOOM = 3;

// ------------------------------------------------------------ assets ------

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

let logoPromise = null;
/** The LSP logo and its trim box, loaded once per page. */
export function loadLogo(base = "/") {
  if (!logoPromise) {
    logoPromise = loadImage(`${base}logo.png`)
      .then((logo) => ({ logo, logoBox: trimBox(logo) }))
      .catch((err) => {
        logoPromise = null;
        throw err;
      });
  }
  return logoPromise;
}

/**
 * A picked file -> a canvas no larger than MAX_SOURCE_PX on its long side.
 * Decoded through an <img>, so the browser applies EXIF orientation (as the
 * photobooth does). Rejects when the browser cannot decode it (HEIC on most
 * desktop browsers).
 */
export async function decodePhoto(file, maxSide = MAX_SOURCE_PX) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    if (typeof img.decode === "function") {
      try {
        await img.decode();
      } catch {
        /* onload already fired; draw anyway */
      }
    }
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) throw new Error("empty image");
    const s = Math.min(1, maxSide / Math.max(w0, h0));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w0 * s));
    c.height = Math.max(1, Math.round(h0 * s));
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = "high";
    x.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ------------------------------------------------------------ type --------

function setFont(ctx, weight, size, track = 0) {
  ctx.font = `${weight} ${size}px ${FAMILY}`;
  if ("letterSpacing" in ctx) ctx.letterSpacing = track ? `${(track * size).toFixed(2)}px` : "0px";
}
function inkWidth(ctx, text) {
  const m = ctx.measureText(text);
  const ink = (m.actualBoundingBoxLeft || 0) + (m.actualBoundingBoxRight || 0);
  return Math.max(m.width, ink);
}

function metrics(ctx) {
  const memo = new Map();
  const get = (weight, size) => {
    const k = `${weight}|${size}`;
    if (!memo.has(k)) {
      setFont(ctx, weight, size);
      const cap = ctx.measureText("H").actualBoundingBoxAscent || size * 0.7;
      const desc = ctx.measureText("gjpy,").actualBoundingBoxDescent || size * 0.22;
      memo.set(k, { cap, desc });
    }
    return memo.get(k);
  };
  return get;
}

// Greedy wrap at spaces; explicit line breaks are kept (runs of them count
// as one). Returns null when a single word is wider than maxW (unless force,
// which then breaks that word by characters as a last resort).
function wrap(ctx, text, maxW, force = false) {
  const out = [];
  for (const para of String(text).split(/\n+/)) {
    const words = para.split(/ +/).filter((w) => w.length);
    if (!words.length) continue;
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (inkWidth(ctx, next) <= maxW) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      if (inkWidth(ctx, word) <= maxW) {
        line = word;
        continue;
      }
      if (!force) return null;
      let part = "";
      for (const ch of Array.from(word)) {
        if (part && inkWidth(ctx, part + ch) > maxW) {
          out.push(part);
          part = ch;
        } else part += ch;
      }
      line = part;
    }
    if (line) out.push(line);
  }
  return out;
}

/** Biggest size in [max..min] whose wrapped lines fit maxW and maxH. */
function fitBlock(ctx, m, { text, weight, sizes: [max, min], lead, track = 0, maxW, maxH = Infinity, maxLines = Infinity, step = 2 }) {
  const height = (n, s) => m(weight, s).cap + (n - 1) * s * lead + m(weight, s).desc;
  for (let s = max; s >= min; s -= step) {
    setFont(ctx, weight, s, track);
    const lines = wrap(ctx, text, maxW);
    if (!lines || lines.length > maxLines) continue;
    const h = height(lines.length, s);
    if (h <= maxH) return { size: s, lines, h, weight, lead, track, over: false };
  }
  setFont(ctx, weight, min, track);
  const lines = wrap(ctx, text, maxW, true);
  return { size: min, lines, h: height(lines.length, min), weight, lead, track, over: true };
}

/** One line, shrunk until it fits maxW. */
function fitLine(ctx, m, { text, weight, sizes: [max, min], maxW, track = 0 }) {
  let s = max;
  for (; s > min; s -= 1) {
    setFont(ctx, weight, s, track);
    if (inkWidth(ctx, text) <= maxW) break;
  }
  setFont(ctx, weight, s, track);
  return { size: s, lines: [text], h: m(weight, s).cap + m(weight, s).desc, weight, lead: 1, track, over: inkWidth(ctx, text) > maxW };
}

// Their words with curly quotes, unless they typed their own.
// Set inline, not hung: a hung mark at these sizes would sit in the margin.
function quoted(text) {
  const t = String(text).trim();
  if (/^["“].*["”]$/s.test(t)) return { body: t, hang: "" };
  return { body: `“${t}”`, hang: "" };
}

export function memoryState(words, hasPhoto) {
  const has = !!String(words?.memory || "").trim();
  return hasPhoto ? (has ? "d" : "c") : has ? "b" : "a";
}

// ------------------------------------------------------------ layout ------

/**
 * Lay the type out (no painting). words: { kicker, prompt, memory, invite,
 * name, help, link }. Returns { state, blocks: [{ name, block, top, x }],
 * photoRect | null, over }.
 */
export function layoutMemory(ctx, format, words, hasPhoto, logoAspect = 1) {
  const F0 = MEMORY_FORMATS[format];
  if (!F0) throw new Error(`unknown format ${format}`);
  const F = hasPhoto ? { ...F0, ...F0.tight } : F0;
  const m = metrics(ctx);
  const maxW = F.w - F.padX * 2;
  const state = memoryState(words, hasPhoto);
  const memory = String(words.memory || "").trim();
  const q = memory ? quoted(memory) : null;

  // The signature block (invite, name, help, link): fixed sizes, shrunk only
  // to fit the width.
  const invite = fitBlock(ctx, m, { text: words.invite, weight: 400, sizes: F.invite, lead: F.inviteLead, maxW, maxLines: 2, step: 1 });
  const name = fitLine(ctx, m, { text: words.name, weight: 700, sizes: F.name, maxW });
  const help = fitLine(ctx, m, { text: words.help, weight: 400, sizes: F.help, maxW });
  const link = fitLine(ctx, m, { text: words.link, weight: 400, sizes: F.link, maxW });
  const signH = invite.h + F.gapInvite + name.h + F.gapName + help.h + F.gapHelp + link.h;

  const kicker = fitLine(ctx, m, { text: words.kicker, weight: 700, sizes: F.kicker, maxW });
  const kickerTop = F.top + F.logoH + F.gapLogo;
  let heroTop = kickerTop + kicker.h + F.gapKicker;

  let small = null;
  if (memory) {
    small = fitBlock(ctx, m, { text: words.prompt, weight: 400, sizes: F.promptSmall, lead: F.promptLead, maxW, maxLines: 3 });
    heroTop += small.h + F.gapPrompt;
  }

  // Room for the hero (the prompt, or their words).
  const heroOpts = (sizes, room) =>
    memory
      ? { text: q.body, weight: 700, sizes, lead: F.memoryLead, track: TRACK, maxW, maxH: room }
      : { text: words.prompt, weight: 700, sizes, lead: F.heroLead, track: TRACK, maxW, maxH: room, maxLines: F.heroLines[state] || Infinity };
  const heroSizes = memory ? F.memoryHero[state] : F.promptHero[state];

  let hero;
  let photoRect = null;
  if (!hasPhoto) {
    const signTop = F.bottom - signH;
    hero = fitBlock(ctx, m, heroOpts(heroSizes, signTop - F.gapHero - heroTop));
  } else {
    const roomFor = (photoH) => F.h - photoH - F.photoPad - signH - F.gapHero - heroTop;
    hero = fitBlock(ctx, m, heroOpts(heroSizes, roomFor(F.photoTarget[state])));
    if (hero.over) hero = fitBlock(ctx, m, heroOpts(heroSizes, roomFor(F.photoMin[state])));
  }

  const blocks = [];
  blocks.push({ name: "kicker", block: kicker, top: kickerTop });
  let y = kickerTop + kicker.h + F.gapKicker;
  if (small) {
    blocks.push({ name: "prompt", block: small, top: y });
    y += small.h + F.gapPrompt;
  }
  blocks.push({ name: memory ? "memory" : "prompt", block: hero, top: y, hang: q?.hang || "" });
  y += hero.h + F.gapHero;

  let signTop = hasPhoto ? y : F.bottom - signH;
  blocks.push({ name: "invite", block: invite, top: signTop });
  signTop += invite.h + F.gapInvite;
  blocks.push({ name: "name", block: name, top: signTop });
  signTop += name.h + F.gapName;
  blocks.push({ name: "help", block: help, top: signTop });
  signTop += help.h + F.gapHelp;
  blocks.push({ name: "link", block: link, top: signTop });
  signTop += link.h;

  if (hasPhoto) {
    const top = Math.round(signTop + F.photoPad);
    photoRect = [0, top, F.w, F.h];
  }
  const over = blocks.some((b) => b.block.over) || (photoRect && F.h - photoRect[1] < F.photoMin[state]);
  return { state, blocks, photoRect, over, format, F, logoW: Math.round(F.logoH * logoAspect) };
}

// ------------------------------------------------------------ photo -------

/** Where the photo's source rect falls for a window, zoom and focus. */
// focus null = the default crop (TALL_FOCUS_Y for a photo taller than the
// window, else centred).
export function photoPlacement(photo, rect, zoom = 1, focus = null) {
  const [l, t, r, b] = rect;
  const pw = r - l, ph = b - t;
  const W = photo.width || photo.naturalWidth, H = photo.height || photo.naturalHeight;
  const z = Math.min(MAX_ZOOM, Math.max(1, zoom || 1));
  const scale = Math.max(pw / W, ph / H) * z;
  const vw = pw / scale, vh = ph / scale;
  const fy = focus?.y ?? (H / W > ph / pw ? TALL_FOCUS_Y : 0.5);
  const cx = Math.min(W - vw / 2, Math.max(vw / 2, (focus?.x ?? 0.5) * W));
  const cy = Math.min(H - vh / 2, Math.max(vh / 2, fy * H));
  return { sx: cx - vw / 2, sy: cy - vh / 2, sw: vw, sh: vh, scale, focus: { x: cx / W, y: cy / H }, W, H };
}

// ------------------------------------------------------------ draw --------

/**
 * Draw one image.
 *   canvas  a <canvas> (resized here)
 *   format  "story" | "post"
 *   words   { kicker, prompt, memory, invite, name, help, link }
 *   assets  from loadLogo()
 *   photo   { source: canvas from decodePhoto(), zoom, focus } or null
 * Returns { boxes: { name: [l, t, r, b] }, photoRect: [l, t, r, b] | null,
 *   photoScale, focus, state, over, w, h, safeTop, safeBottom, padX }.
 */
export function drawMemory(canvas, format, words, assets, photo = null, cached = null) {
  const F = MEMORY_FORMATS[format];
  if (canvas.width !== F.w) canvas.width = F.w;
  if (canvas.height !== F.h) canvas.height = F.h;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  const { logo, logoBox: lb } = assets;
  const L = cached || layoutMemory(ctx, format, words, !!photo?.source, lb.sw / lb.sh);
  const m = metrics(ctx);

  ctx.fillStyle = SUN;
  ctx.fillRect(0, 0, F.w, F.h);

  const boxes = {};
  let photoScale = 0;
  let focus = null;
  if (photo?.source && L.photoRect) {
    const [l, t, r, b] = L.photoRect;
    const p = photoPlacement(photo.source, L.photoRect, photo.zoom, photo.focus);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(photo.source, p.sx, p.sy, p.sw, p.sh, l, t, r - l, b - t);
    photoScale = p.scale;
    focus = p.focus;
  }

  ctx.drawImage(logo, lb.sx, lb.sy, lb.sw, lb.sh, F.padX, F.top, L.logoW, L.F.logoH);
  boxes.logo = [F.padX, F.top, F.padX + L.logoW, F.top + L.F.logoH];

  ctx.fillStyle = INK;
  for (const { name, block, top, hang } of L.blocks) {
    const { weight, size, lines, lead, track } = block;
    setFont(ctx, weight, size, track);
    let base = top + m(weight, size).cap;
    lines.forEach((line, i) => {
      ctx.fillText(line, F.padX, base);
      const mm = ctx.measureText(line);
      let left = F.padX - (mm.actualBoundingBoxLeft || 0);
      if (i === 0 && hang) {
        const hw = ctx.measureText(hang).width;
        ctx.fillText(hang, F.padX - hw, base);
        left = Math.min(left, F.padX - hw);
      }
      boxes[`${name}${lines.length > 1 ? i + 1 : ""}`] = [
        Math.floor(left),
        Math.floor(base - Math.max(mm.actualBoundingBoxAscent || 0, 0)),
        Math.ceil(F.padX + Math.max(mm.actualBoundingBoxRight || 0, mm.width)),
        Math.ceil(base + (mm.actualBoundingBoxDescent || 0)),
      ];
      base += size * lead;
    });
  }
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

  return {
    boxes,
    photoRect: L.photoRect,
    photoScale,
    focus,
    state: L.state,
    over: L.over,
    w: F.w,
    h: F.h,
    safeTop: F.safeTop,
    safeBottom: F.safeBottom,
    padX: F.padX,
    layout: L,
  };
}

/**
 * Problems with a drawn image ([] when clean): an ink box outside the frame
 * margin or the story safe zones, two ink boxes overlapping, an ink box on
 * the photo, a fit that needed its last resort, or a photo below its minimum.
 */
export function checkMemory(report, margin = 40) {
  const out = [];
  const entries = Object.entries(report.boxes);
  const top = Math.max(margin, report.safeTop);
  const bottom = Math.min(report.h - margin, report.safeBottom);
  for (const [k, [l, t, r, b]] of entries) {
    if (l < margin || r > report.w - margin) out.push(`${k} outside x margin (${l}..${r})`);
    if (t < top || b > bottom) out.push(`${k} outside safe y (${t}..${b}, allowed ${top}..${bottom})`);
    if (report.photoRect) {
      const [pl, pt, pr, pb] = report.photoRect;
      if (r > pl && l < pr && b > pt - 24 && t < pb) out.push(`${k} on or within 24 px of the photo`);
    }
  }
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [ka, a] = entries[i];
      const [kb, b] = entries[j];
      if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) out.push(`${ka} overlaps ${kb}`);
    }
  }
  if (report.over) out.push("a fit hit its last resort (shrunk to min or photo below min)");
  return [...new Set(out)];
}
