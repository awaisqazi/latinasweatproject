// /givingtuesday (and /givingtuesday/join) link share card, 1200x630, in the
// page's own identity (design.md "Giving Tuesday"): the LSP highlight yellow
// #FFDE59 as a flat panel, one ink #1e1e1e, Rubik in two weights, and a real
// LSP class photograph: the one the page opens on (heroOne in
// src/data/givingTuesdayPhotos.js, a full class in the studio, May 2026, from
// LSP's team Drive picks). No gradients, glows, shadows, chips or rules. Type
// sits on the yellow, never on the photo.
//
// Text, in order, and nothing else: "LSP Giving Tuesday", Lizett's headline
// "From one class to a movement.", the date "Tuesday, Dec 1". The LSP logo
// (public/logo.png) is used whole and unaltered, trimmed of its empty margin.
//
// Rendering: an HTML template rendered by Playwright's separate
// chrome-headless-shell binary (never the Chrome app), at device scale 2, then
// downsampled to a 1200x630 JPEG with sharp. Rubik (latin) is fetched from
// Google Fonts and inlined; a first headless pass checks that it really loaded
// and that every line sits inside the panel with margin to spare (no type may
// run off the frame), and the script fails loudly if not.
//
// Output: public/images/givingtuesday/givingtuesday-og.jpg (1200x630)
//
// Usage: node scripts/render-givingtuesday-og.mjs
import { mkdirSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public/images/givingtuesday");
const OUT = path.join(OUT_DIR, "givingtuesday-og.jpg");
const TMP = process.env.TMP_DIR || path.join(os.tmpdir(), "lsp-givingtuesday-og");
const PROFILE = path.join(TMP, "prof");
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PROFILE, { recursive: true });

const { givingCopy: COPY } = await import(pathToFileURL(path.join(ROOT, "src/data/givingTuesday.js")).href);

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
const SHELL = findHeadlessShell();

// ---------- Rubik: Google Fonts CSS, latin subset only, woff2 inlined ----------
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
async function inlineFonts(query) {
  const res = await fetch(`https://fonts.googleapis.com/css2?${query}&display=block`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Google Fonts CSS ${res.status} for ${query}`);
  const css = await res.text();
  const blocks = css.split(/(?=\/\* )/).filter((b) => b.startsWith("/* latin */"));
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

// ---------- assets ----------
const logoBuf = await sharp(path.join(ROOT, "public/logo.png")).trim({ threshold: 4 }).png().toBuffer();
const logoMeta = await sharp(logoBuf).metadata();
const LOGO_H = 92;
const LOGO_W = Math.round(LOGO_H * (logoMeta.width / logoMeta.height));
const LOGO_URI = "data:image/png;base64," + logoBuf.toString("base64");

// The photo: 660x630 cut from the portrait original, full width, so the papel
// picado, every raised arm and the front row's feet stay in frame.
// PHOTO_TOP = top of the cut as a share of the original's height.
const PHOTO_W = 660;
const PHOTO_SRC = path.join(ROOT, "marketing/giving-tuesday-2026/drive-photos/picks/2026-05_team-bonding-class_01.jpg");
const PHOTO_TOP = 0.29;
const photoMeta = await sharp(PHOTO_SRC).metadata();
const cutH = Math.round((photoMeta.width * 630) / PHOTO_W);
const photoBuf = await sharp(PHOTO_SRC)
  .rotate()
  .extract({
    left: 0,
    top: Math.min(photoMeta.height - cutH, Math.round(photoMeta.height * PHOTO_TOP)),
    width: photoMeta.width,
    height: cutH,
  })
  .resize({ width: PHOTO_W * 2, height: 630 * 2 })
  .jpeg({ quality: 90 })
  .toBuffer();
const PHOTO_URI = "data:image/jpeg;base64," + photoBuf.toString("base64");

const SUN = "#ffde59", INK = "#1e1e1e";
const PANEL_W = 1200 - PHOTO_W;
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:630px;overflow:hidden;background:${SUN}}
body{position:relative;font-family:"Rubik";color:${INK}}
.panel{position:absolute;left:0;top:0;width:${PANEL_W}px;height:630px;background:${SUN};
  display:flex;flex-direction:column;justify-content:space-between;padding:52px 48px 50px 56px}
.logo{display:block;width:${LOGO_W}px;height:${LOGO_H}px}
.kicker{font-weight:700;font-size:28px;line-height:1.2}
.title{margin-top:14px;font-weight:700;font-size:62px;line-height:1.0;letter-spacing:-0.025em}
.date{margin-top:22px;font-weight:400;font-size:30px;line-height:1.2}
.photo{position:absolute;right:0;top:0;width:${PHOTO_W}px;height:630px;object-fit:cover}
</style></head><body>
<div class="panel">
  <img class="logo" src="${LOGO_URI}" width="${LOGO_W}" height="${LOGO_H}" alt="">
  <div class="words">
    <p class="kicker">LSP Giving Tuesday</p>
    <h1 class="title">${esc(COPY.headline)}</h1>
    <p class="date">Tuesday, Dec 1</p>
  </div>
</div>
<img class="photo" src="${PHOTO_URI}" alt="">
<script>
document.fonts.ready.then(() => {
  const ink = (s) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(s)); const r = rg.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  document.body.dataset.report = JSON.stringify({
    bold: document.fonts.check('700 62px "Rubik"', "From"),
    regular: document.fonts.check('400 30px "Rubik"', "Tuesday"),
    loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family + " " + f.weight),
    kicker: ink(".kicker"), title: ink(".title"), date: ink(".date"),
    logo: (() => { const r = document.querySelector(".logo").getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; })(),
  });
});
</script>
</body></html>`;

const htmlPath = path.join(TMP, "givingtuesday-og.html");
writeFileSync(htmlPath, html);
const url = pathToFileURL(htmlPath).href;
const common = [
  "--headless", `--user-data-dir=${PROFILE}`, "--window-size=1200,630", "--hide-scrollbars",
  "--virtual-time-budget=8000", "--disable-gpu", "--allow-file-access-from-files",
];

// Pass 1: fonts loaded, every line inside the yellow panel with a margin.
const dom = execFileSync(SHELL, [...common, "--dump-dom", url], { timeout: 60000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const raw = dom.match(/data-report="([^"]*)"/)?.[1];
if (!raw) throw new Error("render check did not run (no report in DOM)");
const report = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
console.log("render check", JSON.stringify(report));
if (!report.bold || !report.regular || !report.loaded.some((f) => f.startsWith("Rubik"))) throw new Error("Rubik did not load");
for (const key of ["kicker", "title", "date", "logo"]) {
  const [l, t, r, b] = report[key];
  if (l < 40 || r > PANEL_W - 28 || t < 36 || b > 630 - 36) throw new Error(`${key} is too close to an edge: ${[l, t, r, b]}`);
}

// Pass 2: screenshot at 2x, downsample to 1200x630 sRGB JPEG.
const shot = path.join(TMP, "givingtuesday-og@2x.png");
execFileSync(SHELL, [...common, "--force-device-scale-factor=2", `--screenshot=${shot}`, url], { timeout: 60000, stdio: "ignore" });
await sharp(shot)
  .extract({ left: 0, top: 0, width: 2400, height: 1260 })
  .resize(1200, 630, { kernel: "lanczos3" })
  .removeAlpha()
  .toColorspace("srgb")
  .jpeg({ quality: 86, mozjpeg: true, progressive: true, chromaSubsampling: "4:4:4" })
  .toFile(OUT);
const meta = await sharp(OUT).metadata();
const kb = (statSync(OUT).size / 1024).toFixed(0);
console.log(`wrote ${path.relative(ROOT, OUT)} ${meta.width}x${meta.height} ${meta.space} channels=${meta.channels} ${kb} KB`);
