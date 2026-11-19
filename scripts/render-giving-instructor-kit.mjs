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
// takes a readable quote. No large cutout, or one cut off by its own left
// side: type only, bigger. (The round 320 px avatar is too small for a full
// size post.)
//
// Story: logo and type stay below the top 272 px and above the bottom 300 px
// (Instagram's bars); the photo runs under the bottom bar.
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
    quote: { max: 36, comfort: 33, min: 27, solo: 48, soloMin: 32 }, name: 46, gapName: 24,
    photo: { max: 1.05, min: 0.74 }, faceEdge: 72, minCol: 330,
  },
  story: {
    w: 1080, h: 1920, padX: 88, logoTop: 272, logoH: 136, gapLogo: 64, safeBottom: 1920 - 300,
    kicker: 52, head: { max: 190, min: 110 }, date: 52, link: { max: 44, min: 24 },
    gapKicker: 18, gapHead: 32, gapDate: 12, gapBlocks: 80,
    quote: { max: 44, comfort: 40, min: 33, solo: 58, soloMin: 38 }, name: 56, gapName: 28,
    photo: { max: 1.3, min: 0.95 }, faceEdge: 80, minCol: 380,
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
  return prof.touchLeft ? null : { file: big, prof };
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
      JSON.stringify({ format, slug: p.slug, name: p.name, why: p.why, goal: p.goal_cents, avatar: p.avatar, photo: !!photo }),
      photo ? readFileSync(photo.file) : "",
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
function pageHtml({ F, p, why, photo, photoUri, fit }) {
  const logoW = Math.round(F.logoH * (logoMeta.width / logoMeta.height));
  const goal = money(p.goal_cents);
  const prof = photo ? { left: photo.prof.left, w: photo.prof.w, h: photo.prof.h, y0: photo.prof.y0 } : null;
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
${photo ? `<img class="photo" src="${photoUri}" alt="">` : ""}
<script>
const F = ${JSON.stringify(F)};
const WHY = ${JSON.stringify(why || "")};
const PROF = ${JSON.stringify(prof)};
const FACE = ${JSON.stringify(FACE)}, GAP = ${GAP};
const FIT = ${JSON.stringify(fit)};
const LOGO_BOTTOM = F.logoTop + F.logoH;
const topEl = document.querySelector(".top"), title = document.querySelector(".title"), link = document.querySelector(".link");
const low = document.querySelector(".low"), q = document.querySelector(".quote"), nameEl = document.querySelector(".name");
const img = document.querySelector(".photo");
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
function placeAt(s) {
  const w = PROF.w * s, h = PROF.h * s;
  const off = F.w - F.faceEdge - (FACE.cx + FACE.half) * w;
  return { s, off: Math.round(off), top: Math.round(F.h - h), w: Math.round(w), h: Math.round(h) };
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

function fitWithPhoto(tp) {
  const lowTop = Math.round(topBottom() + F.gapBlocks);
  // Try the quote whole first, then cut, biggest photo first.
  const texts = [[WHY, false], ...quoteCuts().map((t) => [t, true])];
  // A readable quote beats a bigger photo: first look for a fit with the
  // quote at a comfortable size (a smaller photo leaves a wider column),
  // then allow it down to the minimum.
  for (const floor of [F.quote.comfort, F.quote.min])
  for (const [text, cut] of WHY ? texts : [["", false]]) {
    for (let s = F.photo.max; s >= F.photo.min - 1e-9; s -= 0.01) {
      const pl = placeAt(+s.toFixed(3));
      // The top block must clear the photo.
      setPhoto(pl);
      const topLines = [...topEl.querySelectorAll(".kicker, .title span, .date, .link")].flatMap(inkRects);
      if (clearance(pl, topLines) < GAP) continue;
      if (pl.top + FACE.top * pl.h < EDGE_) continue;
      const sizes = WHY ? range(F.quote.max, floor) : [0];
      for (const qs of sizes) {
        // Widest column whose block clears the outline over the rows it covers.
        const start = Math.min(colW, Math.floor(minOutline(pl, lowTop - GAP, lowTop + GAP) - GAP - F.padX));
        let width = 0;
        for (let w = start; w >= F.minCol; w -= 6) {
          setLow(lowTop, w);
          if (q) setQuote(text, qs, cut);
          const bottom = lowBottom();
          if (bottom > F.safeBottom) break;
          if (minOutline(pl, lowTop - GAP, bottom + GAP) - GAP - F.padX >= w) { width = w; break; }
        }
        if (!width) continue;
        if (nameEl && inkW(nameEl) > width) continue;
        if (clearance(pl, allLines()) < GAP) continue;
        return { ...tp, lowTop, width, qSize: qs, quote: text, cut, place: pl };
      }
    }
  }
  return null;
}
const EDGE_ = ${EDGE};
function range(a, b) { const out = []; for (let x = a; x >= b; x--) out.push(x); return out; }

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
    fit = (PROF ? fitWithPhoto(tp) : null) || fitSolo(tp) || { failed: true, ...tp };
  }
  setTop(fit.tSize, fit.lSize);
  if (!fit.failed) {
    setLow(fit.lowTop, fit.width);
    if (q) setQuote(fit.quote, fit.qSize, fit.cut);
    setPhoto(fit.place);
    if (img && !fit.place) img.style.display = "none";
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
  });
});
</script>
</body></html>`;
}

for (const { p, format, out, photo, hash } of jobs) {
  const F = FORMATS[format];
  const why = cardWhy(p.why);
  const htmlPath = path.join(TMP, `${p.slug}-${format}.html`);
  const photoUri = photo ? "data:image/png;base64," + readFileSync(photo.file).toString("base64") : "";

  // Pass 1: fit and place.
  writeFileSync(htmlPath, pageHtml({ F, p, why, photo, photoUri, fit: null }));
  const r1 = dumpReport(F, htmlPath);
  if (!r1.bold || !r1.regular) throw new Error(`${p.slug} ${format}: Rubik did not load`);
  if (r1.fit.failed) throw new Error(`${p.slug} ${format}: the type does not fit`);
  if (photo && !r1.fit.place) console.warn(`  ${p.slug} ${format}: WARNING photo did not fit, type only`);

  // Pass 2: fixed values, re-measured.
  writeFileSync(htmlPath, pageHtml({ F, p, why, photo, photoUri, fit: r1.fit }));
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
      (why ? ` | quote ${f.qSize}px ${f.cut ? "CUT" : "full"} in ${f.width}px` : " | no why") +
      (f.place ? ` | photo scale ${f.place.s} clear ${Math.round(r2.clear)}px` : " | type only"),
  );
}
