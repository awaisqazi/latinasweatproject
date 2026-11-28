// /giftdrive link share card (og:image), in the page's own identity: the tree at the studio
// and the flyer's paper. Flyer cream ground, evergreen ink, and nothing else.
//
// Layout: the left 300px column is a plain rectangular crop of the tree photo
// (public/images/giftdrive/tree.jpg, 960x1280), full card height and flush to the edges.
// The centre column (inside x 300-900, so a centre-square crop still reads) holds
// "Holiday / Gift Drive" in Fraunces 560, "Take a tag. Fill a wish list." in Rubik 700, and
// the due date and place in Rubik 500. The right column holds the LSP X mark
// (scripts/mark_x_only.png), whole and unaltered (black on transparent, so it needs this
// light ground). No rules, no decoration.
//
// The due date comes from src/data/giftDrive.js and the place name from craftDaysPlace in
// src/data/posadaCraftDays.js, so after a change just re-run this script.
//
// Rendering: an HTML template rendered by Playwright's separate chrome-headless-shell binary
// (never the Chrome app), at device scale 2, then downsampled to 1200x630 JPEG with sharp.
// Fraunces and Rubik (latin subset) are fetched from Google Fonts at run time and inlined as
// data URIs; a first headless pass checks that both faces loaded and that every line sits
// inside its column with margin, and the script fails loudly if not.
//
// Output: public/images/giftdrive/giftdrive-og.jpg (1200x630)
//
// Usage: node scripts/render-giftdrive-og.mjs
import { mkdirSync, writeFileSync, readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public/images/giftdrive");
const OUT = path.join(OUT_DIR, "giftdrive-og.jpg");
const TMP = process.env.TMP_DIR || path.join(os.tmpdir(), "lsp-giftdrive-og");
const PROFILE = path.join(TMP, "prof");
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PROFILE, { recursive: true });

const { giftDrive } = await import(pathToFileURL(path.join(ROOT, "src/data/giftDrive.js")).href);
const { craftDaysPlace } = await import(pathToFileURL(path.join(ROOT, "src/data/posadaCraftDays.js")).href);

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

// ---------- fonts: Google Fonts CSS, latin subset only, woff2 inlined ----------
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
const FONT_CSS = [
  await inlineFonts("family=Fraunces:opsz,wght@9..144,560"),
  await inlineFonts("family=Rubik:wght@500;700"),
].join("\n");

// ---------- LSP X mark, embedded whole: no recolour, filter or blend ----------
const MARK_SRC = path.join(ROOT, "scripts/mark_x_only.png");
const MARK_URI = "data:image/png;base64," + readFileSync(MARK_SRC).toString("base64");
const markMeta = await sharp(MARK_SRC).metadata();
const MARK_H = 150;
const MARK_W = +(MARK_H * (markMeta.width / markMeta.height)).toFixed(2);

// ---------- the tree: a plain rectangular crop, never upscaled ----------
// The 300x630 slot at device scale 2 needs 600x1260 source pixels: x 160-760 keeps the
// tree centred, y 10-1270 is nearly the full height. Encoded at its own pixels (no resize).
const PHOTO = path.join(ROOT, "public", giftDrive.photo.jpg);
const CROP = { left: 158, top: 10, width: 600, height: 1260 };
const TREE_URI =
  "data:image/jpeg;base64," +
  (await sharp(PHOTO).extract(CROP).jpeg({ quality: 92 }).toBuffer()).toString("base64");

// ---------- copy, from the data files ----------
const CREAM = "#fef8e6", EVER = "#123d2f";
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const dueLine = `Gifts due ${giftDrive.dueLabel}`;
const placeLine = `LSP at ${craftDaysPlace.name}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{position:relative;background:${CREAM};color:${EVER};font-family:"Rubik"}
.tree{position:absolute;left:0;top:0;width:300px;height:630px;display:block}
.col{position:absolute;left:300px;top:0;width:600px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.mark{position:absolute;display:block;left:${1050 - MARK_W / 2}px;top:${315 - MARK_H / 2}px;width:${MARK_W}px;height:${MARK_H}px}
.title{font-family:"Fraunces";font-weight:560;font-variation-settings:"opsz" 144;font-size:102px;line-height:.98;letter-spacing:-.01em;white-space:nowrap}
.title span{display:block}
.tag{margin-top:34px;font-weight:700;font-size:36px;line-height:1.15;white-space:nowrap}
.due{margin-top:22px;font-weight:500;font-size:27px;line-height:1.25;white-space:nowrap}
.place{margin-top:4px;font-weight:500;font-size:27px;line-height:1.25;white-space:nowrap;color:rgba(18,61,47,.78)}
</style></head><body>
<img class="tree" src="${TREE_URI}" width="300" height="630" alt="">
<img class="mark" src="${MARK_URI}" width="${MARK_W}" height="${MARK_H}" alt="">
<div class="col">
  <h1 class="title"><span>Holiday</span><span>Gift Drive</span></h1>
  <p class="tag">Take a tag. Fill a wish list.</p>
  <p class="due">${esc(dueLine)}</p>
  <p class="place">${esc(placeLine)}</p>
</div>
<script>
document.fonts.ready.then(() => {
  const ink = (s) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(s)); const r = rg.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  document.body.dataset.report = JSON.stringify({
    fraunces: document.fonts.check('560 102px "Fraunces"', "Holiday"),
    loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family + " " + f.weight),
    title: ink(".title"), tag: ink(".tag"), due: ink(".due"), place: ink(".place"), mark: box(".mark"), tree: box(".tree"),
    markNatural: [document.querySelector(".mark").naturalWidth, document.querySelector(".mark").naturalHeight],
  });
});
</script>
</body></html>`;

const htmlPath = path.join(TMP, "giftdrive-og.html");
writeFileSync(htmlPath, html);
const url = pathToFileURL(htmlPath).href;
const common = [
  "--headless", `--user-data-dir=${PROFILE}`, "--window-size=1200,630", "--hide-scrollbars",
  "--virtual-time-budget=8000", "--disable-gpu", "--allow-file-access-from-files",
];

// Pass 1: fonts really loaded; every line inside the centre 600x600 with margin.
const dom = execFileSync(SHELL, [...common, "--dump-dom", url], { timeout: 60000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const raw = dom.match(/data-report="([^"]*)"/)?.[1];
if (!raw) throw new Error("render check did not run (no report in DOM)");
const report = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
console.log("render check", JSON.stringify(report));
if (!report.fraunces || !report.loaded.some((f) => f.startsWith("Fraunces"))) throw new Error("Fraunces did not load");
if (!report.loaded.some((f) => f.startsWith("Rubik 700"))) throw new Error("Rubik 700 did not load");
if (!report.loaded.some((f) => f.startsWith("Rubik 500"))) throw new Error("Rubik 500 did not load");
const SQ = { l: 300, t: 15, r: 900, b: 615 };
for (const key of ["title", "tag", "due", "place"]) {
  const [l, t, r, b] = report[key];
  if (l < SQ.l + 24 || r > SQ.r - 24 || t < SQ.t + 14 || b > SQ.b - 14)
    throw new Error(`${key} is not inside the centre column with margin: ${report[key]}`);
}
{
  const [l, t, r, b] = report.mark;
  if (l < 900 + 24 || r > 1200 - 24 || t < 8 || b > 622) throw new Error(`mark is not inside the right column: ${report.mark}`);
  const [nw, nh] = report.markNatural;
  if (Math.abs((r - l) / (b - t) - nw / nh) > 0.03) throw new Error("mark aspect ratio changed");
}
{
  const [l, t, r, b] = report.tree;
  if (l !== 0 || t !== 0 || r !== 300 || b !== 630) throw new Error(`tree is not flush to the left column: ${report.tree}`);
}

// Pass 2: screenshot at 2x, downsample to 1200x630 sRGB JPEG.
const shot = path.join(TMP, "giftdrive-og@2x.png");
execFileSync(SHELL, [...common, "--force-device-scale-factor=2", `--screenshot=${shot}`, url], { timeout: 60000, stdio: "ignore" });
await sharp(shot)
  .extract({ left: 0, top: 0, width: 2400, height: 1260 })
  .resize(1200, 630, { kernel: "lanczos3" })
  .removeAlpha()
  .toColorspace("srgb")
  .jpeg({ quality: 88, mozjpeg: true, progressive: true, chromaSubsampling: "4:4:4" })
  .toFile(OUT);
const meta = await sharp(OUT).metadata();
const kb = (statSync(OUT).size / 1024).toFixed(0);
console.log(`wrote ${path.relative(ROOT, OUT)} ${meta.width}x${meta.height} ${meta.space} channels=${meta.channels} ${kb} KB`);
