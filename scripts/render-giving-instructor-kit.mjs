// LSP Giving Tuesday: each instructor's share-kit images, in their own voice,
// for /givingtuesday/kit/?i=<slug> (GivingKitApp.svelte shows and downloads
// them). Same identity and pipeline as their link card
// (scripts/render-giving-instructor-og.mjs): flat #FFDE59, one ink #1e1e1e,
// Rubik 400/700, the LSP logo (public/logo.png) whole, trimmed of its empty
// margin, the instructor's own transparent cutout standing on the yellow. No
// gradients, glows, shadows, chips, rules or frames.
//
// Input: src/data/givingInstructors.json (scripts/sync-giving-instructors.mjs).
// Output: public/images/givingtuesday/give/<slug>-post.jpg (1080x1350, feed)
//         public/images/givingtuesday/give/<slug>-story.jpg (1080x1920, story)
//
// Words, in order, and nothing else: "LSP Giving Tuesday", "Help me" /
// "raise {goal}", "Tuesday, Dec 1", the short link (no https://), then their
// why as a quote (their own words, verbatim; emoji left off as on the card; a
// long one cut at a word with "…" inside the quote) and their full name as the
// signature. No why: the name alone.
//
// Photo: the large cutout the pop-up avatar is cut from
// (marketing/popup-week1/instructors/<avatar>.png, 1125x750), only the one
// mapped to the slug, never a guess. Anchored to the bottom edge, pushed right
// so the face box keeps FACE_EDGE from the right edge. The quote and name sit
// in a column to its left, as wide as the cutout's row-by-row outline allows
// with GAP to spare; the photo shrinks (down to a floor) until the column
// takes a readable quote.
//
// Round photo: a large cutout cut off by its own left side, or an avatar on
// ALWAYS_CIRCLE, is shown as a face-centred circle on white instead, cut
// straight from the large cutout (the same square crop as the pop-up avatar:
// face box from YuNet via facebox.py, 12% margin, nudged down a little) so it
// stays sharp; the 320 px avatar would be soft at this size. The circle sits
// at the right of the lower part, where the full photo would stand, as large
// as the room allows (never larger than its source crop), with the quote and
// name in a column to its left, 40 px clear, the two centred on each other.
// It shrinks (down to circle.min) before the quote is cut. No large cutout:
// type only, bigger.
//
// Story: logo and type stay below the top 272 px and above the bottom 300 px
// (Instagram's bars); the full photo runs under the bottom bar, the circle
// does not (a face under the reply bar would be covered).
//
// Rendering: Playwright's separate chrome-headless-shell (never the Chrome
// app). Pass 1 (--dump-dom) fits the type and places the photo in the page;
// pass 2 (--dump-dom) re-lays the fixed values and must measure the same;
// node re-checks edges and photo clearance; pass 3 screenshots at device
// scale 2, downsampled with sharp.
//
// Cheap reruns: each image carries a hash of its inputs in its EXIF; a match
// is skipped (--force redraws all). Images for slugs no longer listed are
// deleted. --only=a,b renders just those slugs.
//
// Usage: node scripts/render-giving-instructor-kit.mjs [--force] [--only=slug,slug]
//   (npm run giving:cards runs the sync, the link cards and this)
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
const DATA = process.env.CARDS_DATA || path.join(ROOT, "src/data/givingInstructors.json");
const OUT_DIR = process.env.CARDS_OUT_DIR || path.join(ROOT, "public/images/givingtuesday/give");
const CUTOUTS = path.join(ROOT, "marketing/popup-week1/instructors");
const FACEBOX = path.join(ROOT, "marketing/giving-tuesday-2026/email-1/facebox.py");
// Avatars that always use the round photo, even with a usable cutout (same
// list in render-giving-instructor-og.mjs).
const ALWAYS_CIRCLE = new Set([
  "lizett-galan", // the cutout's torso ends in straight vertical cut edges, which look wrong standing on the yellow
]);
const TMP = process.env.TMP_DIR || path.join(os.tmpdir(), "lsp-giving-instructor-kit");
const PROFILE = path.join(TMP, "prof");
const FORCE = process.argv.includes("--force");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PROFILE, { recursive: true });

const people = JSON.parse(readFileSync(DATA, "utf8"));

const SUN = "#ffde59", INK = "#1e1e1e";
const GAP = 40; // clear space between any line of type and the photo
const EDGE = 28; // every line keeps this far from the frame
// House framing of the 1125x750 cutouts: face centred, face box about 22% to
// 72% of the height. A generous box:
const FACE = { cx: 0.5, half: 0.16, top: 0.18, bottom: 0.76 };

// Sizes in px at 1x. safeBottom: no type below this line.
const FORMATS = {
  post: {
    w: 1080, h: 1350, padX: 80, logoTop: 72, logoH: 112, gapLogo: 52, safeBottom: 1350 - 72,
    kicker: 40, head: { max: 148, min: 96 }, date: 40, link: { max: 36, min: 20 },
    gapKicker: 14, gapHead: 26, gapDate: 10, gapBlocks: 64,
    quote: { max: 36, comfort: 33, min: 27, solo: 48, soloMin: 32 }, name: 46, nameMin: 36, gapName: 24,
    photo: { max: 1.05, min: 0.74 }, faceEdge: 72, minCol: 330, maxSink: 240, faceLimit: 1350 - 72, circle: { max: 500, min: 360, underMin: 320 },
  },
  story: {
    w: 1080, h: 1920, padX: 88, logoTop: 272, logoH: 136, gapLogo: 64, safeBottom: 1920 - 300,
    kicker: 52, head: { max: 190, min: 110 }, date: 52, link: { max: 44, min: 24 },
    gapKicker: 18, gapHead: 32, gapDate: 12, gapBlocks: 80,
    quote: { max: 44, comfort: 40, min: 33, solo: 58, soloMin: 38 }, name: 56, nameMin: 44, gapName: 28,
    photo: { max: 1.3, min: 0.95 }, faceEdge: 80, minCol: 380, maxSink: 240, faceLimit: 1920 - 220, circle: { max: 520, min: 380, underMin: 340 },
  },
};

// ---------- helpers ----------
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (cents) => {
  const n = Math.max(0, Math.round(Number(cents) || 0));
  return (n / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 });
};
// Same as the link card: verbatim, minus emoji, spaces collapsed.
function cardWhy(why) {
  if (!why) return "";
  return String(why)
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}
const shortLink = (slug) => `latinasweatproject.com/give/${slug}`;
function findHeadlessShell() {
  if (process.env.CHROME_HEADLESS_SHELL) return process.env.CHROME_HEADLESS_SHELL;
  const base = path.join(os.homedir(), "Library/Caches/ms-playwright");
  const dirs = readdirSync(base).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse();
  for (const d of dirs) {
    const p = path.join(base, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell");
    if (existsSync(p)) return p;
  }
  throw new Error("Playwright chrome-headless-shell not found; run `npx playwright install chromium-headless-shell`");
}
// Leftmost opaque x of every row of the cutout (null when the row is empty).
async function rowProfile(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const left = new Array(info.height).fill(null);
  let y0 = info.height, touchLeft = false;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 24) { left[y] = x; if (y < y0) y0 = y; break; }
    }
    if (data[y * info.width * 4 + 3] > 24) touchLeft = true;
  }
  return { left, w: info.width, h: info.height, y0, touchLeft };
}
async function photoSource(avatar) {
  if (!avatar) return null;
  const big = path.join(CUTOUTS, `${avatar}.png`);
  if (!existsSync(big)) return null;
  const prof = await rowProfile(big);
  // A usable cutout also carries the circle crop, for when no photo size fits.
  const crop = await circleCrop(big);
  if (!prof.touchLeft && !ALWAYS_CIRCLE.has(avatar)) return { kind: "cutout", file: big, prof, crop };
  return { kind: "circle", file: big, crop };
}
// Face-centred square of the cutout, on white, as PNG: the geometry of
// square_crop() in scripts/render-popup-instructor-avatars.py.
async function circleCrop(file) {
  const out = JSON.parse(execFileSync("python3", [FACEBOX, file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60000 }));
  const face = out[file];
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let side, cx, cy;
  if (face) {
    const [fx, fy, fw, fh] = face;
    const m = 0.12 * Math.max(fw, fh), bw = fw + 2 * m, bh = fh + 2 * m;
    side = Math.max(Math.hypot(bw, bh), 2 * Math.hypot(bw / 2, bh / 2 + 0.06 * fh));
    cx = fx + fw / 2;
    cy = fy + fh / 2 + 0.06 * fh;
  } else {
    let x0 = Infinity, x1 = -1, y0 = Infinity;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); }
    }
    side = Math.min(x1 - x0, info.height - y0) * 0.9;
    cx = (x0 + x1) / 2;
    cy = y0 + side / 2;
  }
  const s = Math.round(side), pad = s;
  // Pad first (sharp runs extract before extend within one pipeline).
  const padded = await sharp(file)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const buf = await sharp(padded)
    .extract({ left: Math.round(cx - side / 2) + pad, top: Math.round(cy - side / 2) + pad, width: s, height: s })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
  return { side: s, face: !!face, buf };
}
const sha = (...parts) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex").slice(0, 24);
};
async function imageHash(file) {
  if (!existsSync(file)) return null;
  const { exif } = await sharp(file).metadata();
  const m = exif?.toString("latin1").match(/lsp-kit:([0-9a-f]{24})/);
  return m ? m[1] : null;
}

// ---------- which images need work ----------
const logoRaw = readFileSync(path.join(ROOT, "public/logo.png"));
const selfSrc = readFileSync(SELF);
const jobs = [];
const keep = new Set();
for (const p of people) {
  const photo = await photoSource(p.avatar);
  for (const format of Object.keys(FORMATS)) {
    const out = path.join(OUT_DIR, `${p.slug}-${format}.jpg`);
    keep.add(path.basename(out));
    if (ONLY.length && !ONLY.includes(p.slug)) continue;
    const hash = sha(
      JSON.stringify({ format, slug: p.slug, name: p.name, why: p.why, goal: p.goal_cents, avatar: p.avatar, photo: photo?.kind ?? null }),
      photo ? (photo.kind === "circle" ? photo.crop.buf : readFileSync(photo.file)) : "",
      logoRaw,
      selfSrc,
    );
    if (!FORCE && (await imageHash(out)) === hash) {
      console.log(`  ${p.slug} ${format}: unchanged`);
      continue;
    }
    jobs.push({ p, format, out, photo, hash });
  }
}
if (!ONLY.length) {
  for (const f of readdirSync(OUT_DIR)) {
    if (/-(post|story)\.jpg$/.test(f) && !keep.has(f)) {
      unlinkSync(path.join(OUT_DIR, f));
      console.log(`  deleted ${f} (no longer in givingInstructors.json)`);
    }
  }
}
if (!jobs.length) {
  console.log(`${people.length * 2} kit images up to date`);
  process.exit(0);
}

// ---------- shared assets ----------
const SHELL = findHeadlessShell();
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
async function inlineFonts(query) {
  const res = await fetch(`https://fonts.googleapis.com/css2?${query}&display=block`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Google Fonts CSS ${res.status} for ${query}`);
  const css = await res.text();
  const blocks = css.split(/(?=\/\* )/).filter((b) => b.startsWith("/* latin */") || b.startsWith("/* latin-ext */"));
  if (!blocks.length) throw new Error(`no latin @font-face in Google Fonts CSS for ${query}`);
  const out = [];
  for (const block of blocks) {
    const url = block.match(/url\((https:[^)]+)\)/)?.[1];
    if (!url) throw new Error("font url missing");
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    out.push(block.replace(url, `data:font/woff2;base64,${buf.toString("base64")}`));
  }
  return out.join("\n");
}
const FONT_CSS = await inlineFonts("family=Rubik:wght@400;700");
const logoBuf = await sharp(logoRaw).trim({ threshold: 4 }).png().toBuffer();
const logoMeta = await sharp(logoBuf).metadata();
const LOGO_URI = "data:image/png;base64," + logoBuf.toString("base64");

function common(F) {
  return [
    "--headless", `--user-data-dir=${PROFILE}`, `--window-size=${F.w},${F.h}`, "--hide-scrollbars",
    "--virtual-time-budget=8000", "--disable-gpu", "--allow-file-access-from-files",
  ];
}
function dumpReport(F, htmlPath) {
  const dom = execFileSync(SHELL, [...common(F), "--dump-dom", pathToFileURL(htmlPath).href], {
    timeout: 90000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024,
  });
  const raw = dom.match(/data-report="([^"]*)"/)?.[1];
  if (!raw) throw new Error("render check did not run (no report in DOM)");
  return JSON.parse(raw.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
}

// ---------- the page ----------
// fit null: the page fits the type and places the photo itself (pass 1).
// Otherwise those values are fixed (pass 2 and the screenshot).
function pageHtml({ F, p, why, photo, photoUri, circleUri, fit }) {
  const logoW = Math.round(F.logoH * (logoMeta.width / logoMeta.height));
  const goal = money(p.goal_cents);
  const cutout = photo?.kind === "cutout" ? photo : null;
  const prof = cutout ? { left: cutout.prof.left, w: cutout.prof.w, h: cutout.prof.h, y0: cutout.prof.y0 } : null;
  const circ = photo?.crop ? { max: Math.min(F.circle.max, photo.crop.side), min: F.circle.min } : null;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${F.w}px;height:${F.h}px;overflow:hidden;background:${SUN}}
body{position:relative;font-family:"Rubik";color:${INK};-webkit-font-smoothing:antialiased}
.logo{position:absolute;left:${F.padX}px;top:${F.logoTop}px;display:block;width:${logoW}px;height:${F.logoH}px}
.top{position:absolute;left:${F.padX}px;width:${F.w - 2 * F.padX}px}
.kicker{font-weight:700;font-size:${F.kicker}px;line-height:1.15}
.title{margin-top:${F.gapKicker}px;font-weight:700;line-height:0.98;letter-spacing:-0.025em}
.title span{display:block;white-space:nowrap}
.date{margin-top:${F.gapHead}px;font-weight:400;font-size:${F.date}px;line-height:1.2}
.link{margin-top:${F.gapDate}px;font-weight:400;line-height:1.2;white-space:nowrap}
.low{position:absolute;left:${F.padX}px}
.quote{font-weight:400;line-height:1.3}
.name{white-space:nowrap;font-weight:700;font-size:${F.name}px;line-height:1.15}
.quote + .name{margin-top:${F.gapName}px}
.photo{position:absolute;display:block}
.circle{position:absolute;border-radius:50%;background:#ffffff;overflow:hidden}
.circle img{display:block;width:100%;height:100%}
</style></head><body>
<img class="logo" src="${LOGO_URI}" width="${logoW}" height="${F.logoH}" alt="">
<div class="top">
  <p class="kicker">LSP Giving Tuesday</p>
  <h1 class="title"><span>Help me</span><span>raise ${esc(goal)}</span></h1>
  <p class="date">Tuesday, Dec 1</p>
  <p class="link">${esc(shortLink(p.slug))}</p>
</div>
<div class="low">
  ${why ? `<p class="quote"></p>` : ""}
  <p class="name">${esc(p.name)}</p>
</div>
${cutout ? `<img class="photo" src="${photoUri}" alt="">` : ""}
${circ ? `<div class="circle"><img src="${circleUri}" alt=""></div>` : ""}
<script>
const F = ${JSON.stringify(F)};
const WHY = ${JSON.stringify(why || "")};
const PROF = ${JSON.stringify(prof)};
const CIRC = ${JSON.stringify(circ)};
const FACE = ${JSON.stringify(FACE)}, GAP = ${GAP};
const FIT = ${JSON.stringify(fit)};
const LOGO_BOTTOM = F.logoTop + F.logoH;
const topEl = document.querySelector(".top"), title = document.querySelector(".title"), link = document.querySelector(".link");
const low = document.querySelector(".low"), q = document.querySelector(".quote"), nameEl = document.querySelector(".name");
const img = document.querySelector(".photo"), circEl = document.querySelector(".circle");
const inkRects = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return [...rg.getClientRects()].map((r) => [r.left, r.top, r.right, r.bottom]); };
const inkW = (el) => Math.max(0, ...inkRects(el).map((r) => r[2] - r[0]));
const colW = F.w - 2 * F.padX;

function setTop(tSize, lSize) {
  topEl.style.top = (LOGO_BOTTOM + F.gapLogo) + "px";
  title.style.fontSize = tSize + "px";
  link.style.fontSize = lSize + "px";
}
function setQuote(text, size, cut) {
  if (!q) return;
  q.style.fontSize = size + "px";
  q.textContent = "\\u201C" + text + (cut ? "\\u2026" : "") + "\\u201D";
  const cx = document.createElement("canvas").getContext("2d");
  cx.font = "400 " + size + 'px "Rubik"';
  q.style.textIndent = -cx.measureText("\\u201C").width.toFixed(2) + "px";
}
function setLow(topY, width) { low.style.top = topY + "px"; low.style.width = width + "px"; }
function setPhoto(pl) {
  if (!img || !pl) return;
  Object.assign(img.style, { left: pl.off + "px", top: pl.top + "px", width: pl.w + "px", height: pl.h + "px" });
}
// Lines of type (ink boxes) in the top and low blocks.
function allLines() {
  const out = [];
  for (const el of [...topEl.querySelectorAll(".kicker, .title span, .date, .link"), q, nameEl]) if (el) out.push(...inkRects(el));
  return out;
}
// The photo's left outline at canvas row y (Infinity: no photo on that row).
function outlineX(pl, y) {
  const sy = Math.round((y - pl.top) / pl.s);
  if (sy < 0 || sy >= PROF.h || PROF.left[sy] == null) return Infinity;
  return pl.off + pl.s * PROF.left[sy];
}
// Narrowest outline x over canvas rows [a, b].
function minOutline(pl, a, b) {
  let m = Infinity;
  for (let y = Math.floor(a); y <= Math.ceil(b); y++) m = Math.min(m, outlineX(pl, y));
  return m;
}
// sink: how far the photo's bottom runs past the frame's bottom edge.
function placeAt(s, sink = 0) {
  const w = PROF.w * s, h = PROF.h * s;
  const off = F.w - F.faceEdge - (FACE.cx + FACE.half) * w;
  return { s, off: Math.round(off), top: Math.round(F.h - h + sink), w: Math.round(w), h: Math.round(h) };
}
// Worst clearance between the photo and any line of type.
function clearance(pl, lines) {
  let worst = Infinity;
  for (const [, t, r, b] of lines) worst = Math.min(worst, minOutline(pl, t - GAP, b + GAP) - r);
  return worst;
}

function fitTop() {
  // Headline as big as the width allows, the link as big as fits.
  let t = F.head.max;
  for (; t > F.head.min; t -= 2) { setTop(t, F.link.max); if ([...title.children].every((s) => inkW(s) <= colW)) break; }
  let l = F.link.max;
  for (; l > F.link.min; l -= 1) { setTop(t, l); if (inkW(link) <= colW) break; }
  setTop(t, l);
  return { tSize: t, lSize: l };
}
const topBottom = () => topEl.getBoundingClientRect().bottom;
const lowBottom = () => low.getBoundingClientRect().bottom;
const quoteCuts = () => {
  const ws = WHY.split(" "), out = [];
  for (let k = ws.length - 1; k >= 4; k--) out.push(ws.slice(0, k).join(" ").replace(/[,;:\\u2013\\u2014-]+$/, ""));
  return out;
};

// sinks: [0] first; only when no size fits standing on the bottom edge (a tall
// cutout whose head meets a long link line) is it lowered, by up to
// F.maxSink, the face box staying above F.faceLimit.
// coarse: bigger search steps (the lowered pass, which only runs when the
// standing pass found nothing; keeps the search inside the render timeout).
let nameBlocked = false; // set when the name alone was what did not fit
function fitWithPhoto(tp, sinks, texts, coarse = false, floors = [F.quote.comfort, F.quote.min]) {
  const lowTop = Math.round(topBottom() + F.gapBlocks);
  const nameW = inkW(nameEl);
  const sStep = coarse ? 0.03 : 0.01, wStep = coarse ? 12 : 6, qStep = coarse ? 2 : 1;
  // The whole quote beats a cut one at any readable size: each text is tried
  // at a comfortable size first (a smaller photo leaves a wider column), then
  // down to the minimum, before the next shorter cut is tried.
  for (const [text, cut] of texts)
  for (const floor of floors) {
    for (let s = F.photo.max; s >= F.photo.min - 1e-9; s -= sStep) {
      for (const sink of sinks) {
      const pl = placeAt(+s.toFixed(3), sink);
      if (sink && pl.top + FACE.bottom * pl.h > F.faceLimit) break;
      // The top block must clear the photo.
      setPhoto(pl);
      const topLines = [...topEl.querySelectorAll(".kicker, .title span, .date, .link")].flatMap(inkRects);
      if (clearance(pl, topLines) < GAP) continue;
      if (pl.top + FACE.top * pl.h < EDGE_) continue;
      const sizes = WHY ? range(F.quote.max, floor).filter((x, i, a) => i % qStep === 0 || i === a.length - 1) : [0];
      for (const qs of sizes) {
        // Widest column whose block clears the outline over the rows it covers.
        const start = Math.min(colW, Math.floor(minOutline(pl, lowTop - GAP, lowTop + GAP) - GAP - F.padX));
        if (nameW > start) { nameBlocked = true; break; } // no quote size helps
        let width = 0;
        for (let w = start; w >= F.minCol; w -= wStep) {
          setLow(lowTop, w);
          if (q) setQuote(text, qs, cut);
          const bottom = lowBottom();
          if (bottom > F.safeBottom) break;
          if (minOutline(pl, lowTop - GAP, bottom + GAP) - GAP - F.padX >= w) { width = w; break; }
        }
        if (!width) continue;
        if (nameEl && inkW(nameEl) > width) { nameBlocked = true; continue; }
        if (clearance(pl, allLines()) < GAP) continue;
        return { ...tp, lowTop, width, qSize: qs, quote: text, cut, place: pl };
      }
      }
    }
  }
  return null;
}
const EDGE_ = ${EDGE};
function range(a, b) { const out = []; for (let x = a; x >= b; x--) out.push(x); return out; }

// Round photo: the circle at the right of the lower part, the quote and name
// in the column to its left, the two centred on each other. Same order of
// preference as fitWithPhoto: the whole why at every readable size (a smaller
// circle leaves a wider column) before any cut.
function setCircle(c) {
  if (!circEl || !c) return;
  Object.assign(circEl.style, { left: c.left + "px", top: c.top + "px", width: c.d + "px", height: c.d + "px" });
}
// Worst gap between the circle's box and any line of type beside or near it.
function circleClear(c, lines) {
  let worst = Infinity;
  for (const [l, t, r, b] of lines) {
    if (b + GAP <= c.top || t - GAP >= c.top + c.d) continue;
    worst = Math.min(worst, c.left - r);
  }
  return worst;
}
// under: the name too long for the column goes on its own line under the
// circle and quote, left-aligned, full width (only with a why).
function setNameUnder(off) {
  if (off == null) { nameEl.style.position = ""; nameEl.style.top = ""; nameEl.style.marginTop = ""; return; }
  Object.assign(nameEl.style, { position: "absolute", left: "0px", top: off + "px", marginTop: "0px" });
}
function fitCircle(tp, texts, under = false) {
  const lowTop = Math.round(topBottom() + F.gapBlocks);
  const room = F.safeBottom - lowTop;
  const min = under ? F.circle.underMin : CIRC.min;
  setNameUnder(under ? 0 : null);
  const nameH = under ? Math.ceil(nameEl.getBoundingClientRect().height) : 0;
  // The ink box of a line can poke a pixel or two above its line box.
  const nameGap = Math.max(GAP, F.gapName) + 6;
  if (under && inkW(nameEl) > colW) { setNameUnder(null); return null; }
  for (const [text, cut] of texts)
  for (const floor of [F.quote.comfort, F.quote.min])
  for (let d = Math.min(CIRC.max, room); d >= min; d -= 4) {
    const left = F.w - F.padX - d;
    const width = left - GAP - F.padX;
    if (width < F.minCol) continue;
    for (const qs of WHY ? range(F.quote.max, floor) : [0]) {
      setLow(0, width);
      if (q) setQuote(text, qs, cut);
      if (!under && inkW(nameEl) > width) { nameBlocked = true; break; }
      // Height of what sits beside the circle (the quote alone when under).
      const hb = Math.ceil(under ? q.getBoundingClientRect().height : low.getBoundingClientRect().height);
      const gh = Math.max(hb, d);
      const total = gh + (under ? nameGap + nameH : 0);
      if (total > room) continue;
      // A little air under the top block, the rest below.
      const g0 = Math.round(lowTop + Math.min((room - total) / 2, F.gapBlocks * 0.75));
      const c = { d, left, top: Math.round(g0 + (gh - d) / 2) };
      const bTop = Math.round(g0 + (gh - hb) / 2);
      const under0 = under ? Math.round(g0 + gh + nameGap - bTop) : null;
      setLow(bTop, width);
      setNameUnder(under0);
      setCircle(c);
      if (Math.max(lowBottom(), nameEl.getBoundingClientRect().bottom) > F.safeBottom) continue;
      if (circleClear(c, allLines()) < GAP) continue;
      return { ...tp, lowTop: bTop, width, qSize: qs, quote: text, cut, place: null, circle: c, nameUnder: under0 };
    }
  }
  setNameUnder(null);
  return null;
}

// Order of preference: the whole why before any cut one; for each text the
// name at full size, then smaller (a long name that cannot fit beside the
// photo at full size); for each, the full photo standing on the bottom edge,
// then lowered, then the circle.
function setName(size) { nameEl.style.fontSize = size + "px"; }
function fitPhotoOrCircle(tp) {
  if (!PROF && !CIRC) return null;
  const sinks = [];
  for (let k = 40; k <= F.maxSink; k += 40) sinks.push(k);
  const texts = WHY ? [[WHY, false], ...quoteCuts().map((t) => [t, true])] : [["", false]];
  for (const t of texts) {
    setName(F.name);
    nameBlocked = false;
    let fit = (PROF ? fitWithPhoto(tp, [0], [t]) || fitWithPhoto(tp, sinks, [t], true) : null) || (CIRC ? fitCircle(tp, [t]) : null);
    if (fit) return { ...fit, nSize: F.name };
    if (!nameBlocked) continue;
    // A long name: a smaller name beside the full photo with the quote at a
    // comfortable size; else the circle (name beside it, smaller, or on its
    // own line under it); last, the full photo with the quote down to the minimum.
    const smaller = [];
    for (let ns = F.name - 4; ns >= F.nameMin; ns -= 4) smaller.push(ns);
    for (const ns of smaller) {
      setName(ns);
      if (PROF && (fit = fitWithPhoto(tp, [0, ...sinks], [t], true, [F.quote.comfort]))) return { ...fit, nSize: ns };
    }
    if (CIRC) {
      for (const ns of smaller) {
        setName(ns);
        if ((fit = fitCircle(tp, [t]))) return { ...fit, nSize: ns };
      }
      setName(F.name);
      if (WHY && (fit = fitCircle(tp, [t], true))) return { ...fit, nSize: F.name };
    }
    for (const ns of smaller) {
      setName(ns);
      if (PROF && (fit = fitWithPhoto(tp, [0, ...sinks], [t], true, [F.quote.min]))) return { ...fit, nSize: ns };
    }
    setName(F.name);
  }
  setName(F.name);
  return null;
}

function fitSolo(tp) {
  // Type only: the quote full width and big; the whole stack sits between the
  // logo and the safe bottom, the low block anchored to the bottom.
  const texts = [[WHY, false], ...quoteCuts().map((t) => [t, true])];
  const minTop = Math.round(topBottom() + F.gapBlocks);
  for (const [text, cut] of WHY ? texts : [["", false]]) {
    for (const qs of WHY ? range(F.quote.solo, F.quote.soloMin) : [0]) {
      setLow(0, colW);
      if (q) setQuote(text, qs, cut);
      const hgt = low.getBoundingClientRect().height;
      const lowTop = Math.round(F.safeBottom - hgt);
      if (lowTop < minTop) continue;
      // Not too far down: at most one block gap of extra air.
      const air = lowTop - minTop;
      const y = air > F.gapBlocks ? Math.round(minTop + Math.min(air, F.gapBlocks * 1.5)) : lowTop;
      return { ...tp, lowTop: y, width: colW, qSize: qs, quote: text, cut, place: null };
    }
  }
  return null;
}

document.fonts.ready.then(() => {
  let fit = FIT;
  if (!fit) {
    const tp = fitTop();
    fit = fitPhotoOrCircle(tp) || fitSolo(tp) || { failed: true, ...tp };
  }
  setTop(fit.tSize, fit.lSize);
  setName(fit.nSize || F.name);
  setNameUnder(fit.nameUnder ?? null);
  if (!fit.failed) {
    setLow(fit.lowTop, fit.width);
    if (q) setQuote(fit.quote, fit.qSize, fit.cut);
    setPhoto(fit.place);
    if (img && !fit.place) img.style.display = "none";
    setCircle(fit.circle);
    if (circEl && !fit.circle) circEl.style.display = "none";
  }
  const box = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); };
  document.body.dataset.report = JSON.stringify({
    bold: document.fonts.check('700 60px "Rubik"', "Help"),
    regular: document.fonts.check('400 28px "Rubik"', "Tuesday"),
    fit,
    logo: box(document.querySelector(".logo")),
    lines: allLines().map((r) => r.map(Math.round)),
    quoteText: q ? q.textContent : "",
    clear: fit.place ? clearance(fit.place, allLines()) : null,
    circle: circEl && fit.circle ? box(circEl) : null,
    circleClear: fit.circle ? circleClear(fit.circle, allLines()) : null,
  });
});
</script>
</body></html>`;
}

for (const { p, format, out, photo, hash } of jobs) {
  const F = FORMATS[format];
  const why = cardWhy(p.why);
  const htmlPath = path.join(TMP, `${p.slug}-${format}.html`);
  const photoUri = photo?.kind === "cutout" ? "data:image/png;base64," + readFileSync(photo.file).toString("base64") : "";
  const circleUri = photo ? "data:image/png;base64," + photo.crop.buf.toString("base64") : "";

  // Pass 1: fit and place.
  writeFileSync(htmlPath, pageHtml({ F, p, why, photo, photoUri, circleUri, fit: null }));
  const r1 = dumpReport(F, htmlPath);
  if (!r1.bold || !r1.regular) throw new Error(`${p.slug} ${format}: Rubik did not load`);
  if (r1.fit.failed) throw new Error(`${p.slug} ${format}: the type does not fit`);
  if (photo && !r1.fit.place && !r1.fit.circle) console.warn(`  ${p.slug} ${format}: WARNING photo did not fit, type only`);

  // Pass 2: fixed values, re-measured.
  writeFileSync(htmlPath, pageHtml({ F, p, why, photo, photoUri, circleUri, fit: r1.fit }));
  const r2 = dumpReport(F, htmlPath);
  if (JSON.stringify(r2.lines) !== JSON.stringify(r1.lines)) throw new Error(`${p.slug} ${format}: type moved between passes`);
  for (const [i, [l, t, r, b]] of [...r2.lines, r2.logo].entries()) {
    if (l < EDGE || t < EDGE || r > F.w - EDGE || b > F.h - EDGE) throw new Error(`${p.slug} ${format}: box ${i} too close to an edge: ${[l, t, r, b]}`);
    if (r > F.w - F.padX + 1) throw new Error(`${p.slug} ${format}: box ${i} runs past the margin: ${[l, t, r, b]}`);
    if (t < F.logoTop - 1 || b > F.safeBottom + 1) throw new Error(`${p.slug} ${format}: box ${i} outside the safe area: ${[l, t, r, b]}`);
  }
  if (r1.fit.place) {
    if (r2.clear < GAP - 1) throw new Error(`${p.slug} ${format}: photo comes within ${r2.clear}px of the type`);
    const pl = r1.fit.place;
    const faceL = pl.off + (FACE.cx - FACE.half) * pl.w, faceR = pl.off + (FACE.cx + FACE.half) * pl.w;
    if (faceL < EDGE || faceR > F.w - EDGE) throw new Error(`${p.slug} ${format}: face box runs off the frame`);
  }
  if (r1.fit.circle) {
    const [l, t, r, b] = r2.circle || [];
    if (!r2.circle) throw new Error(`${p.slug} ${format}: circle missing`);
    if (l < EDGE || r > F.w - F.padX + 1) throw new Error(`${p.slug} ${format}: circle outside the margins: ${r2.circle}`);
    if (t < F.logoTop - 1 || b > F.safeBottom + 1) throw new Error(`${p.slug} ${format}: circle outside the safe area: ${r2.circle}`);
    if (r2.circleClear < GAP - 1) throw new Error(`${p.slug} ${format}: circle comes within ${r2.circleClear}px of the type`);
    if (r2.circle[2] - r2.circle[0] > photo.crop.side + 1) throw new Error(`${p.slug} ${format}: circle larger than its source`);
  }

  // Pass 3: screenshot at 2x, downsample, stamp the hash.
  const shot = path.join(TMP, `${p.slug}-${format}@2x.png`);
  execFileSync(SHELL, [...common(F), "--force-device-scale-factor=2", `--screenshot=${shot}`, pathToFileURL(htmlPath).href], { timeout: 90000, stdio: "ignore" });
  await sharp(shot)
    .extract({ left: 0, top: 0, width: F.w * 2, height: F.h * 2 })
    .resize(F.w, F.h, { kernel: "lanczos3" })
    .removeAlpha()
    .toColorspace("srgb")
    .withExif({ IFD0: { ImageDescription: `lsp-kit:${hash}` } })
    .jpeg({ quality: 86, mozjpeg: true, progressive: true, chromaSubsampling: "4:4:4" })
    .toFile(out);
  const kb = (statSync(out).size / 1024).toFixed(0);
  const f = r1.fit;
  console.log(
    `  ${p.slug} ${format}: wrote ${path.relative(ROOT, out)} ${kb} KB | headline ${f.tSize}px link ${f.lSize}px` +
      (f.nSize && f.nSize !== F.name ? ` | name ${f.nSize}px` : "") +
      (why ? ` | quote ${f.qSize}px ${f.cut ? "CUT" : "full"} in ${f.width}px` : " | no why") +
      (f.place ? ` | photo scale ${f.place.s} clear ${Math.round(r2.clear)}px`
        : f.circle ? ` | circle ${f.circle.d}px (source ${photo.crop.side}px${photo.crop.face ? "" : ", no face found"}) clear ${Math.round(r2.circleClear)}px`
        : " | type only"),
  );
}
