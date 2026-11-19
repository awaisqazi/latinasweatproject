// /posada link share card (og:image), in the page's own identity: the team's save-the-date
// graphic. Warm white paper, charcoal ink, one pen red (the circle), and nothing else.
//
// Layout is the calendar row from the post (X | 19 | X), hand-ruled in ink: the centre cell
// (inside the middle 600x600, so a square crop still reads) holds "Posada Craft Days" in
// Mynerve (the page's display hand), "Volunteer with LSP" with the red pen circle, the five
// dates and the hours in Rubik. The left cell holds the team's save-the-date graphic
// (public/images/posada/lsp-posadas-save-the-date.jpg) whole, laid on at a slight angle; the
// right cell holds the LSP X mark (scripts/mark_x_only.png), whole and unaltered.
//
// Dates, hours and the place come from src/data/posadaCraftDays.js, so after a change just
// re-run this script.
//
// Rendering: an HTML template rendered by Playwright's separate chrome-headless-shell binary
// (never the Chrome app), at device scale 2, then downsampled to 1200x630 JPEG with sharp.
// Mynerve and Rubik (latin subset) are fetched from Google Fonts at run time and inlined as
// data URIs; a first headless pass checks that both faces loaded and that every line sits
// inside the centre square with margin, and the script fails loudly if not.
//
// Output: public/images/posada/posada-og.jpg (1200x630)
//
// Usage: node scripts/render-posada-og.mjs
import { mkdirSync, writeFileSync, readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public/images/posada");
const OUT = path.join(OUT_DIR, "posada-og.jpg");
const TMP = process.env.TMP_DIR || path.join(os.tmpdir(), "lsp-posada-og");
const PROFILE = path.join(TMP, "prof");
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PROFILE, { recursive: true });

const { craftDays, craftHours, craftDaysPlace, posadaEvent } = await import(
  pathToFileURL(path.join(ROOT, "src/data/posadaCraftDays.js")).href
);

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
  await inlineFonts("family=Mynerve"),
  await inlineFonts("family=Rubik:wght@500;700;800"),
].join("\n");

// ---------- LSP X mark, embedded whole: no recolour, filter or blend ----------
const MARK_SRC = path.join(ROOT, "scripts/mark_x_only.png");
const MARK_URI = "data:image/png;base64," + readFileSync(MARK_SRC).toString("base64");
const markMeta = await sharp(MARK_SRC).metadata();
const MARK_H = 150;
const MARK_W = +(MARK_H * (markMeta.width / markMeta.height)).toFixed(2);

// ---------- wings: plain rectangular crops of the save-the-date (1080x1334) ----------
const ART = path.join(ROOT, "public", posadaEvent.art);
async function crop(left, top, width, height, outW) {
  const buf = await sharp(ART).extract({ left, top, width, height }).resize(outW * 2).jpeg({ quality: 90 }).toBuffer();
  return "data:image/jpeg;base64," + buf.toString("base64");
}
// The whole graphic, no crop: 1080x1334 shown 236 wide.
const ART_W = 236, ART_H = Math.round(236 * 1334 / 1080);
const ART_URI = "data:image/jpeg;base64," + (await sharp(ART).resize(ART_W * 2).jpeg({ quality: 90 }).toBuffer()).toString("base64");

// ---------- copy, from the data file ----------
const PAPER = "#fbf8f2", INK = "#2b2d36", RED = "#d8382e";
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
// "Nov 24 · 25 · Dec 3 · 10 · 17": the month only where it changes.
let lastMon = "";
const datesLine = craftDays
  .map((d) => {
    const s = d.monthShort !== lastMon ? `${d.monthShort} ${d.dayNum}` : `${d.dayNum}`;
    lastMon = d.monthShort;
    return s;
  })
  .join(" · ");
const hoursLine = `${craftHours} · ${craftDaysPlace.name}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{position:relative;background:${PAPER};color:${INK};font-family:"Rubik"}
.print{position:absolute;display:block;background:#fff;
  box-shadow:0 1px 2px rgba(43,45,54,.16),0 12px 26px -16px rgba(43,45,54,.45)}
.print img{display:block}
.left{left:${150 - ART_W / 2}px;top:${312 - ART_H / 2}px;transform:rotate(-3deg)}
.rule{position:absolute;background:${INK};border-radius:2px}
.rule.h{height:4px}.rule.v{width:4px}
.col{position:absolute;left:300px;top:0;width:600px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding-top:14px}
.mark{position:absolute;display:block;left:${1050 - MARK_W / 2}px;top:${312 - MARK_H / 2}px;width:${MARK_W}px;height:${MARK_H}px}
.title{margin-top:0;font-family:"Mynerve";font-weight:400;font-size:106px;line-height:.98;white-space:nowrap}
.title span{display:block}
.vol{margin-top:30px;font-weight:700;font-size:34px;line-height:1.1}
.dates{margin-top:26px;font-weight:800;font-size:34px;line-height:1.1;letter-spacing:-.005em;white-space:nowrap}
.hours{margin-top:10px;font-weight:500;font-size:25px;line-height:1.2;color:rgba(43,45,54,.82);white-space:nowrap}
.ring{position:absolute;overflow:visible;pointer-events:none}
.ring path{fill:none;stroke:${RED};stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.vol{position:relative}
</style></head><body>
<i class="rule h" style="left:-10px;right:-10px;top:58px;transform:rotate(-0.35deg)"></i>
<i class="rule h" style="left:-10px;right:-10px;top:566px;transform:rotate(0.3deg)"></i>
<i class="rule v" style="top:-10px;bottom:-10px;left:298px;transform:rotate(0.45deg)"></i>
<i class="rule v" style="top:-10px;bottom:-10px;left:902px;transform:rotate(-0.4deg)"></i>
<div class="print left"><img src="${ART_URI}" width="${ART_W}" height="${ART_H}" alt=""></div>
<img class="mark" src="${MARK_URI}" width="${MARK_W}" height="${MARK_H}" alt="">
<div class="col">
  <h1 class="title"><span>Posada</span><span>Craft Days</span></h1>
  <p class="vol">Volunteer with LSP<svg class="ring" viewBox="0 0 130 44" preserveAspectRatio="none" style="left:-40px;top:-15px;width:calc(100% + 80px);height:calc(100% + 30px);transform:rotate(-1.5deg)"><path d="M110 8 C84 1 30 2 12 14 C-2 24 14 41 62 41 C104 41 128 31 122 18 C117 8 88 4 62 5"/></svg></p>
  <p class="dates">${esc(datesLine)}</p>
  <p class="hours">${esc(hoursLine)}</p>
</div>
<script>
document.fonts.ready.then(() => {
  const ink = (s) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(s)); const r = rg.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  document.body.dataset.report = JSON.stringify({
    mynerve: document.fonts.check('112px "Mynerve"', "Posada"),
    rubik: document.fonts.check('800 34px "Rubik"', "Nov"),
    loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family + " " + f.weight),
    title: ink(".title"), vol: box(".vol svg"), dates: ink(".dates"), hours: ink(".hours"), mark: box(".mark"),
    markNatural: [document.querySelector(".mark").naturalWidth, document.querySelector(".mark").naturalHeight],
    left: box(".left"),
  });
});
</script>
</body></html>`;

const htmlPath = path.join(TMP, "posada-og.html");
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
if (!report.mynerve || !report.loaded.some((f) => f.startsWith("Mynerve"))) throw new Error("Mynerve did not load");
if (!report.loaded.some((f) => f.startsWith("Rubik 800"))) throw new Error("Rubik 800 did not load");
const SQ = { l: 300, t: 15, r: 900, b: 615 };
for (const key of ["title", "vol", "dates", "hours"]) {
  const [l, t, r, b] = report[key];
  if (l < SQ.l + 20 || r > SQ.r - 20 || t < SQ.t + 14 || b > SQ.b - 14)
    throw new Error(`${key} is not inside the centre square with margin: ${report[key]}`);
}
for (const key of ["left", "mark"]) {
  const [l, t, r, b] = report[key];
  if (l < 8 || t < 8 || r > 1192 || b > 622) throw new Error(`${key} crop runs off the frame: ${report[key]}`);
}
{
  const [ml, mt, mr, mb] = report.mark;
  const [nw, nh] = report.markNatural;
  if (Math.abs((mr - ml) / (mb - mt) - nw / nh) > 0.03) throw new Error("mark aspect ratio changed");
}

// Pass 2: screenshot at 2x, downsample to 1200x630 sRGB JPEG.
const shot = path.join(TMP, "posada-og@2x.png");
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
