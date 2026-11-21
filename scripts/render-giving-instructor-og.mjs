// LSP Giving Tuesday: one link share card per instructor, 1200x630, for the
// static page /give/<slug>/ (src/pages/give/[slug].astro). Same identity and
// pipeline as the campaign card (scripts/render-givingtuesday-og.mjs,
// design.md "Giving Tuesday"): flat #FFDE59, one ink #1e1e1e, Rubik 400/700,
// the LSP logo (public/logo.png) whole and unaltered, trimmed of its empty
// margin. No gradients, glows, shadows, chips, rules or frames.
//
// Input: src/data/givingInstructors.json (scripts/sync-giving-instructors.mjs).
// Output: public/images/givingtuesday/give/<slug>-og.jpg (1200x630).
//
// Content, in order, and nothing else: the person's photo, "LSP Giving
// Tuesday", "Help {first}" / "raise {goal}", their why as a quote (their own
// words, verbatim; emoji are left off the card because Rubik has none and the
// card is one ink; a long why is cut at a word boundary and ends with "…"
// inside the quote), "Tuesday, Dec 1". No why: that line is left out and the
// headline gets more room.
//
// Photo: the large transparent head-and-shoulders cutout the pop-up avatars
// are cut from (marketing/popup-week1/instructors/<avatar>.png, 1125x750, the
// same image as public/images/popup/instructors/<avatar>.webp; see
// scripts/render-popup-instructor-avatars.py), standing on the yellow,
// anchored to the bottom edge on the right. Its house framing puts the face
// centred horizontally with the face box at about 22% to 72% of the height;
// the script keeps a generous box around that fully in frame. The cutout's
// row-by-row outline is checked against every measured line of type, so no
// hair or shoulder ever sits under the words; the photo shrinks until it
// clears them. Only the avatar mapped to the slug is used, never a guess. No
// large cutout, one cut off by its own left side, or an avatar on
// ALWAYS_CIRCLE: the 320 px avatar in a 300 px circle on white. No avatar:
// type only.
//
// Rendering: Playwright's separate chrome-headless-shell binary (never the
// Chrome app). Pass 1 (--dump-dom) fits and measures the type with no photo;
// the photo is placed from those boxes; pass 2 (--dump-dom) re-measures the
// final card and fails loudly if any box is outside its area or touches the
// photo; pass 3 screenshots at device scale 2, downsampled to 1200x630 with
// sharp.
//
// Cheap reruns: each card carries a hash of its inputs (name, why, goal,
// photo bytes, logo, this script) in its EXIF; a card whose hash matches is
// skipped. Cards for slugs no longer in the JSON are deleted.
//
// Usage: node scripts/render-giving-instructor-og.mjs [--force]
//   (npm run giving:cards runs the sync first)
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { standingPhoto } from "./giving-standing-photos.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "..");
// CARDS_DATA / CARDS_OUT_DIR: only for trying the layout on test entries.
const DATA = process.env.CARDS_DATA || path.join(ROOT, "src/data/givingInstructors.json");
const OUT_DIR = process.env.CARDS_OUT_DIR || path.join(ROOT, "public/images/givingtuesday/give");
const CUTOUTS = path.join(ROOT, "marketing/popup-week1/instructors");
const AVATARS = path.join(ROOT, "public/images/popup/instructors");
const TMP = process.env.TMP_DIR || path.join(os.tmpdir(), "lsp-giving-instructor-og");
const PROFILE = path.join(TMP, "prof");
const FORCE = process.argv.includes("--force");
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PROFILE, { recursive: true });

const people = JSON.parse(readFileSync(DATA, "utf8"));

// ---------- layout constants (px at 1x) ----------
const W = 1200, H = 630;
const SUN = "#ffde59", INK = "#1e1e1e";
const LEFT = 56, TOP = 52, BOTTOM = 50; // campaign card padding
const COL_W = 520; // type column width when there is a photo
const COL_W_SOLO = 760; // no photo
const GAP = 36; // clear space between any line of type and the photo
const EDGE = 28; // the face box and every line keep this far from the frame
const LOGO_H = 92;
// House framing of the 1125x750 cutouts (render-popup-instructor-avatars.py):
// face centred, face box about 22% to 72% of the height. A generous box:
const FACE = { cx: 0.5, half: 0.16, top: 0.18, bottom: 0.76 };
const FACE_EDGE = 64; // the face box keeps this far from the right edge

// ---------- helpers ----------
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (cents) => {
  const n = Math.max(0, Math.round(Number(cents) || 0));
  return (n / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 });
};
// The why for the card: verbatim, minus emoji (pictographs, skin tones,
// variation selectors, joiners), spaces collapsed.
function cardWhy(why) {
  if (!why) return "";
  return String(why)
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}
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
// Avatars that always use the round photo, even with a usable cutout (same
// list in render-giving-instructor-kit.mjs). Empty: everyone with a photo
// stands (cutouts with straight cut edges are cut at the bottom by
// giving-standing-photos.mjs instead).
const ALWAYS_CIRCLE = new Set([]);
async function photoSource(avatar) {
  if (!avatar) return null;
  // On STANDING (giving-standing-photos.mjs): the prepared cutout and its
  // measured face box.
  const st = await standingPhoto(ROOT, avatar, CUTOUTS);
  if (st) {
    const prof = await rowProfile(st.buf);
    return { kind: "cutout", buf: st.buf, prof, face: st.face };
  }
  const big = path.join(CUTOUTS, `${avatar}.png`);
  if (existsSync(big) && !ALWAYS_CIRCLE.has(avatar)) {
    const prof = await rowProfile(big);
    // A cutout cut off by its own left side would show that straight edge in
    // the middle of the card: use the round avatar instead.
    if (!prof.touchLeft) return { kind: "cutout", buf: readFileSync(big), prof, face: FACE };
  }
  const small = path.join(AVATARS, `${avatar}.webp`);
  if (existsSync(small)) return { kind: "circle", buf: readFileSync(small), file: small };
  return null;
}
const sha = (...parts) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex").slice(0, 24);
};
async function cardHash(file) {
  if (!existsSync(file)) return null;
  const { exif } = await sharp(file).metadata();
  const m = exif?.toString("latin1").match(/lsp-card:([0-9a-f]{24})/);
  return m ? m[1] : null;
}

// ---------- which cards need work ----------
const logoRaw = readFileSync(path.join(ROOT, "public/logo.png"));
const selfSrc = readFileSync(SELF);
const standingSrc = readFileSync(path.join(path.dirname(SELF), "giving-standing-photos.mjs"));
const jobs = [];
const keep = new Set();
for (const p of people) {
  const out = path.join(OUT_DIR, `${p.slug}-og.jpg`);
  keep.add(path.basename(out));
  const photo = await photoSource(p.avatar);
  const hash = sha(
    JSON.stringify({ name: p.name, first: p.first, why: p.why, goal: p.goal_cents, avatar: p.avatar, kind: photo?.kind ?? null }),
    photo ? photo.buf : "",
    logoRaw,
    selfSrc,
    standingSrc,
  );
  if (!FORCE && (await cardHash(out)) === hash) {
    console.log(`  ${p.slug}: unchanged`);
    continue;
  }
  jobs.push({ p, out, photo, hash });
}
for (const f of readdirSync(OUT_DIR)) {
  if (f.endsWith("-og.jpg") && !keep.has(f)) {
    unlinkSync(path.join(OUT_DIR, f));
    console.log(`  deleted ${f} (no longer in givingInstructors.json)`);
  }
}
if (!jobs.length) {
  console.log(`${people.length} cards up to date`);
  process.exit(0);
}

// ---------- shared assets (only when something renders) ----------
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
const LOGO_W = Math.round(LOGO_H * (logoMeta.width / logoMeta.height));
const LOGO_URI = "data:image/png;base64," + logoBuf.toString("base64");

const common = [
  "--headless", `--user-data-dir=${PROFILE}`, `--window-size=${W},${H}`, "--hide-scrollbars",
  "--virtual-time-budget=8000", "--disable-gpu", "--allow-file-access-from-files",
];
function dumpReport(htmlPath) {
  const dom = execFileSync(SHELL, [...common, "--dump-dom", pathToFileURL(htmlPath).href], {
    timeout: 60000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024,
  });
  const raw = dom.match(/data-report="([^"]*)"/)?.[1];
  if (!raw) throw new Error("render check did not run (no report in DOM)");
  return JSON.parse(raw.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
}

// ---------- the page ----------
// `fit` null: the page fits the type itself (pass 1). Otherwise the fitted
// sizes and quote text from pass 1 are fixed, and the photo is drawn.
function pageHtml({ p, why, colW, fit, photoTag }) {
  const goal = money(p.goal_cents);
  const quote = fit ? fit.quote : why;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${SUN}}
body{position:relative;font-family:"Rubik";color:${INK};-webkit-font-smoothing:antialiased}
.logo{position:absolute;left:${LEFT}px;top:${TOP}px;display:block;width:${LOGO_W}px;height:${LOGO_H}px}
.words{position:absolute;left:${LEFT}px;bottom:${BOTTOM}px;width:${colW}px}
.kicker{font-weight:700;font-size:28px;line-height:1.2}
.title{margin-top:12px;font-weight:700;line-height:1.0;letter-spacing:-0.025em}
.title span{display:block;white-space:nowrap}
.quote{margin-top:24px;font-weight:400;line-height:1.3}
.date{margin-top:22px;font-weight:400;font-size:28px;line-height:1.2}
.photo{position:absolute;display:block}
.circle{position:absolute;border-radius:50%;background:#ffffff;overflow:hidden}
.circle img{display:block;width:100%;height:100%}
</style></head><body>
<img class="logo" src="${LOGO_URI}" width="${LOGO_W}" height="${LOGO_H}" alt="">
<div class="words">
  <p class="kicker">LSP Giving Tuesday</p>
  <h1 class="title"></h1>
  ${quote ? `<p class="quote"></p>` : ""}
  <p class="date">Tuesday, Dec 1</p>
</div>
${photoTag || ""}
<script>
const FIRST = ${JSON.stringify(p.first)}, GOAL = ${JSON.stringify(goal)};
const WHY = ${JSON.stringify(quote || "")};
const FIT = ${JSON.stringify(fit)};
const COL = ${colW}, LOGO_BOTTOM = ${TOP + LOGO_H}, ROOM_TOP = ${TOP + LOGO_H + 40}, H = ${H}, BOTTOM = ${BOTTOM};
const words = document.querySelector(".words"), title = document.querySelector(".title"), q = document.querySelector(".quote");
const setTitle = (lines, size) => {
  title.style.fontSize = size + "px";
  title.innerHTML = "";
  for (const l of lines) { const s = document.createElement("span"); s.textContent = l; title.appendChild(s); }
};
const inkW = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return rg.getBoundingClientRect().width; };
const titleFits = () => [...title.children].every((s) => inkW(s) <= COL + 0.5);
const setQuote = (text, size, cut) => {
  if (!q) return;
  q.style.fontSize = size + "px";
  q.textContent = "\\u201C" + text + (cut ? "\\u2026" : "") + "\\u201D";
  // Hang the opening quote mark so the words line up with the lines above.
  const cx = document.createElement("canvas").getContext("2d");
  cx.font = "400 " + size + 'px "Rubik"';
  q.style.textIndent = -cx.measureText("\\u201C").width.toFixed(2) + "px";
};
const quoteLines = () => q ? Math.round(q.getBoundingClientRect().height / (parseFloat(q.style.fontSize) * 1.3)) : 0;
const blockFits = () => words.getBoundingClientRect().top >= ROOM_TOP;

function fitAll() {
  const two = ["Help " + FIRST, "raise " + GOAL], three = ["Help", FIRST, "raise " + GOAL];
  const maxT = q ? 76 : 92;
  let lines = two, tSize = maxT;
  // Headline: as big as fits the column, a long name on its own line.
  const shrink = (ls, min) => { for (let s = maxT; s >= min; s -= 2) { setTitle(ls, s); if (titleFits()) return s; } return 0; };
  tSize = shrink(two, 52);
  if (!tSize) { lines = three; tSize = shrink(three, 40) || 40; setTitle(three, tSize); }
  if (!q) {
    while (!blockFits() && tSize > 40) { tSize -= 2; setTitle(lines, tSize); }
    return { lines, tSize, qSize: 0, quote: "", cut: false };
  }
  // Quote: full words at 27 down to 22 px in at most 4 lines; else cut at a
  // word boundary at 23 px. Then make the whole block fit under the logo.
  for (let maxLines = 4; maxLines >= 2; maxLines--) {
    for (let ts = tSize; ts >= Math.max(40, tSize - 16); ts -= 4) {
      setTitle(lines, ts);
      for (let s = 27; s >= 22; s--) {
        setQuote(WHY, s, false);
        if (quoteLines() <= maxLines && blockFits()) return { lines, tSize: ts, qSize: s, quote: WHY, cut: false };
      }
      const ws = WHY.split(" ");
      for (let k = ws.length - 1; k >= 3; k--) {
        const t = ws.slice(0, k).join(" ").replace(/[,;:\\u2013\\u2014-]+$/, "");
        setQuote(t, 23, true);
        if (quoteLines() <= maxLines && blockFits()) return { lines, tSize: ts, qSize: 23, quote: t, cut: true };
      }
    }
  }
  return { lines, tSize, qSize: 22, quote: WHY, cut: false, failed: true };
}

document.fonts.ready.then(() => {
  const fit = FIT || fitAll();
  // Lay the final values out fresh, exactly as pass 2 does.
  setTitle(fit.lines, fit.tSize);
  if (q) setQuote(fit.quote, fit.qSize, fit.cut);
  const box = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); };
  const ink = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return [...rg.getClientRects()].map((r) => [r.left, r.top, r.right, r.bottom].map(Math.round)); };
  const lines = [];
  for (const el of [document.querySelector(".kicker"), ...title.children, q, document.querySelector(".date")]) if (el) lines.push(...ink(el));
  const photo = document.querySelector(".photo, .circle");
  document.body.dataset.report = JSON.stringify({
    bold: document.fonts.check('700 60px "Rubik"', "Help"),
    regular: document.fonts.check('400 28px "Rubik"', "Tuesday"),
    loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family + " " + f.weight),
    fit, logo: box(document.querySelector(".logo")), words: box(words), lines,
    quoteText: q ? q.textContent : "", indent: q ? q.style.textIndent + " " + q.style.fontSize : "",
    photo: photo ? box(photo) : null,
  });
});
</script>
</body></html>`;
}

// Leftmost opaque x of every row of the cutout (source px), or Infinity.
// (A function declaration, so photoSource can use it above.)
async function rowProfile(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const left = new Float64Array(info.height).fill(Infinity);
  let y0 = info.height;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 24) { left[y] = x; if (y < y0) y0 = y; break; }
    }
  }
  // Opaque pixels on the cutout's own left or right side: a straight cut.
  let touchLeft = false, touchRight = false;
  for (let y = 0; y < info.height; y++) {
    if (data[y * info.width * 4 + 3] > 24) touchLeft = true;
    if (data[(y * info.width + info.width - 1) * 4 + 3] > 24) touchRight = true;
  }
  return { left, w: info.width, h: info.height, y0, touchLeft, touchRight };
}

// Biggest cutout scale whose outline clears every line box (plus the logo)
// by GAP while the face box and head stay in frame. Bottom-anchored.
// face: the house FACE box, or a measured one (giving-standing-photos.mjs),
// whose scale keeps the face the size a house cutout's face is drawn.
function placeCutout(prof, boxes, colRight, face) {
  const FACE = face, SC = face.scale || 1;
  // A measured face may also run the photo past the bottom edge (sink), so a
  // tall photo (lucia-del-rincon-martinez: 800x800, waist up) shows the face
  // as large as everyone else's instead of a small whole figure. House
  // cutouts stand on the bottom edge, as before.
  const sinks = [0];
  if (FACE.custom) for (let k = 10; k <= 240; k += 10) sinks.push(k);
  for (let s = 0.9 * SC; s >= 0.5 * SC; s -= 0.005)
  for (const sink of sinks) {
    const imgTop = H - prof.h * s + sink;
    const headTop = imgTop + prof.y0 * s;
    const faceTop = imgTop + FACE.top * prof.h * s;
    if (FACE.custom && imgTop + FACE.bottom * prof.h * s > H - EDGE) break;
    if (headTop < 36 || faceTop < EDGE) continue;
    const maxOff = W - FACE_EDGE - (FACE.cx + FACE.half) * prof.w * s;
    let minOff = -Infinity;
    for (const [, t, r, b] of boxes) {
      const r0 = Math.max(0, Math.floor((t - GAP - imgTop) / s));
      const r1 = Math.min(prof.h - 1, Math.ceil((b + GAP - imgTop) / s));
      for (let y = r0; y <= r1; y++) if (Number.isFinite(prof.left[y])) minOff = Math.max(minOff, r + GAP - s * prof.left[y]);
    }
    // A straight cut on the cutout's right side must run off the card.
    if (prof.touchRight) minOff = Math.max(minOff, W - prof.w * s);
    if (minOff > maxOff) continue;
    const ideal = (colRight + W) / 2 + 24 - FACE.cx * prof.w * s;
    const off = Math.min(maxOff, Math.max(minOff, ideal));
    return { s, off: Math.round(off), top: Math.round(imgTop), w: Math.round(prof.w * s), h: Math.round(prof.h * s) };
  }
  return null;
}

// Text-photo clearance on the final card, from the row outline.
function clearance(prof, place, boxes) {
  let worst = Infinity;
  for (const [, t, r, b] of boxes) {
    for (let y = Math.max(0, t - GAP); y <= Math.min(H - 1, b + GAP); y++) {
      const sy = Math.round((y - place.top) / place.s);
      if (sy < 0 || sy >= prof.h || !Number.isFinite(prof.left[sy])) continue;
      worst = Math.min(worst, place.off + place.s * prof.left[sy] - r);
    }
  }
  return worst;
}

for (const { p, out, photo, hash } of jobs) {
  const why = cardWhy(p.why);
  const colW = photo ? COL_W : COL_W_SOLO;
  const htmlPath = path.join(TMP, `${p.slug}.html`);

  // Pass 1: fit and measure the type alone.
  writeFileSync(htmlPath, pageHtml({ p, why, colW, fit: null }));
  const r1 = dumpReport(htmlPath);
  if (!r1.bold || !r1.regular || !r1.loaded.some((f) => f.startsWith("Rubik"))) throw new Error(`${p.slug}: Rubik did not load`);
  if (r1.fit.failed) throw new Error(`${p.slug}: the type does not fit the card`);
  const boxes = [...r1.lines, r1.logo];
  const colRight = Math.max(...boxes.map((b) => b[2]));

  // Place the photo.
  let photoTag = "", place = null, prof = null;
  if (photo?.kind === "cutout") {
    prof = photo.prof;
    place = placeCutout(prof, boxes, colRight, photo.face);
    if (!place) throw new Error(`${p.slug}: no photo size clears the type and keeps the face in frame`);
    const uri = "data:image/png;base64," + photo.buf.toString("base64");
    photoTag = `<img class="photo" src="${uri}" alt="" style="left:${place.off}px;top:${place.top}px;width:${place.w}px;height:${place.h}px">`;
  } else if (photo?.kind === "circle") {
    const meta = await sharp(photo.file).metadata();
    const d = Math.min(300, meta.width);
    const cx = Math.round((colRight + W) / 2 + 12);
    if (cx - d / 2 < colRight + GAP) throw new Error(`${p.slug}: the circle photo would touch the type`);
    const uri = `data:image/webp;base64,${readFileSync(photo.file).toString("base64")}`;
    photoTag = `<div class="circle" style="left:${cx - d / 2}px;top:${Math.round((H - d) / 2)}px;width:${d}px;height:${d}px"><img src="${uri}" alt=""></div>`;
  }

  // Pass 2: the final card, re-measured.
  writeFileSync(htmlPath, pageHtml({ p, why, colW, fit: r1.fit, photoTag }));
  const r2 = dumpReport(htmlPath);
  if (!r2.bold || !r2.regular) throw new Error(`${p.slug}: Rubik did not load (pass 2)`);
  if (JSON.stringify(r2.lines) !== JSON.stringify(r1.lines)) throw new Error(`${p.slug}: type moved between passes: ${JSON.stringify(r1.lines)} ${r1.indent} vs ${JSON.stringify(r2.lines)} ${r2.indent}`);
  for (const [i, [l, t, r, b]] of [...r2.lines, r2.logo].entries()) {
    if (l < EDGE || t < EDGE || r > W - EDGE || b > H - EDGE) throw new Error(`${p.slug}: box ${i} too close to an edge: ${[l, t, r, b]}`);
    if (r > LEFT + colW + 1) throw new Error(`${p.slug}: box ${i} runs out of the type column: ${[l, t, r, b]}`);
  }
  const wordsTop = r2.words[1];
  if (wordsTop < r2.logo[3] + 30) throw new Error(`${p.slug}: type crowds the logo (${wordsTop})`);
  if (place) {
    const c = clearance(prof, place, [...r2.lines, r2.logo]);
    if (c < GAP - 1) throw new Error(`${p.slug}: photo comes within ${c}px of the type`);
    const fc = photo.face;
    const faceL = place.off + (fc.cx - fc.half) * place.w, faceR = place.off + (fc.cx + fc.half) * place.w;
    if (faceR > W - FACE_EDGE + 1) throw new Error(`${p.slug}: face box runs off the right edge`);
    if (faceL < EDGE || place.top + fc.top * place.h < EDGE || place.top + fc.bottom * place.h > H - EDGE) throw new Error(`${p.slug}: face box runs off the card`);
    // Stands on the bottom edge; a cut right side runs off the card.
    if (place.top + place.h < H) throw new Error(`${p.slug}: photo floats above the bottom edge`);
    if (prof.touchRight && place.off + place.w < W) throw new Error(`${p.slug}: the photo's cut right side shows on the card`);
  } else if (r2.photo) {
    if (r2.photo[0] < colRight + GAP - 1) throw new Error(`${p.slug}: circle touches the type`);
  }

  // Pass 3: screenshot at 2x, downsample, stamp the input hash.
  const shot = path.join(TMP, `${p.slug}@2x.png`);
  execFileSync(SHELL, [...common, "--force-device-scale-factor=2", `--screenshot=${shot}`, pathToFileURL(htmlPath).href], { timeout: 60000, stdio: "ignore" });
  await sharp(shot)
    .extract({ left: 0, top: 0, width: W * 2, height: H * 2 })
    .resize(W, H, { kernel: "lanczos3" })
    .removeAlpha()
    .toColorspace("srgb")
    .withExif({ IFD0: { ImageDescription: `lsp-card:${hash}` } })
    .jpeg({ quality: 86, mozjpeg: true, progressive: true, chromaSubsampling: "4:4:4" })
    .toFile(out);
  const meta = await sharp(out).metadata();
  const kb = (statSync(out).size / 1024).toFixed(0);
  console.log(
    `  ${p.slug}: wrote ${path.relative(ROOT, out)} ${meta.width}x${meta.height} ${kb} KB` +
      ` | headline ${r1.fit.tSize}px ${JSON.stringify(r1.fit.lines)}` +
      (why ? ` | quote ${r1.fit.qSize}px ${r1.fit.cut ? "CUT" : "full"}: ${r2.quoteText}` : " | no why") +
      (place ? ` | photo scale ${place.s.toFixed(3)} at x ${place.off}` : photo ? " | circle photo" : " | no photo"),
  );
}
