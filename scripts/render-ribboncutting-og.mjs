// /ribboncutting link share card (og:image), 1200x630, in the page's identity:
// the Mural Park opening campaign (Warm White #f3eeea, black Fraunces with the
// key word in Fraunces Bold on the #FFDE59 highlight, Rubik sub in Gray
// #4e4f50), the LSP X mark (scripts/mark_x_only.png, whole and unaltered) as a
// crest, and the hero photo from src/data/ribbonCutting.js as a full-width band
// along the bottom. Headline and sub come from the same data file, so after a
// copy or hero change just re-run this script.
//
// Layout rule: the mark, headline and sub sit inside the centre 600 px so the
// square crop that small previews use still reads; the photo band runs edge to
// edge and its crop keeps every face of the group whole.
//
// Rendering: an HTML template rendered by Playwright's separate
// chrome-headless-shell binary (never the Chrome app) at device scale 2, then
// downsampled to 1200x630 JPEG with sharp. Fraunces and Rubik (latin subset)
// are fetched from Google Fonts at run time and inlined; a first headless pass
// checks the faces loaded and the type fits, and the script fails loudly if not.
//
// Output: public/images/ribbon-cutting/ribboncutting-og.jpg
// Usage:  node scripts/render-ribboncutting-og.mjs
import { mkdirSync, writeFileSync, readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = await import(pathToFileURL(path.join(ROOT, "src/data/ribbonCutting.js")).href);
const { ribbonCutting: RC, ribbonCuttingHero: HERO, PHOTO_DIR } = data;
const OUT_DIR = path.join(ROOT, "public", PHOTO_DIR);
const OUT = path.join(OUT_DIR, "ribboncutting-og.jpg");
const TMP = process.env.TMP_DIR || path.join(os.tmpdir(), "lsp-ribboncutting-og");
const PROFILE = path.join(TMP, "prof");
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PROFILE, { recursive: true });

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

// ---------- fonts ----------
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
async function inlineFonts(query) {
  const res = await fetch(`https://fonts.googleapis.com/css2?${query}&display=block`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Google Fonts CSS ${res.status} for ${query}`);
  const css = await res.text();
  const blocks = css.split(/(?=\/\* )/).filter((b) => b.startsWith("/* latin */"));
  if (!blocks.length) throw new Error(`no latin @font-face for ${query}`);
  const out = [];
  for (const block of blocks) {
    const url = block.match(/url\((https:[^)]+)\)/)?.[1];
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    out.push(block.replace(url, `data:font/woff2;base64,${buf.toString("base64")}`));
  }
  return out.join("\n");
}
const FONT_CSS = [
  await inlineFonts("family=Fraunces:opsz,wght@9..144,400;9..144,700"),
  await inlineFonts("family=Rubik:wght@400"),
].join("\n");

// ---------- assets ----------
const MARK_SRC = path.join(ROOT, "scripts/mark_x_only.png");
const MARK_URI = "data:image/png;base64," + readFileSync(MARK_SRC).toString("base64");
const markMeta = await sharp(MARK_SRC).metadata();
const MARK_H = 46;
const MARK_W = +(MARK_H * (markMeta.width / markMeta.height)).toFixed(2);

// Photo band: a crop of the hero source, 1200 x BAND_H at the card. BAND_X0
// and BAND_W (fractions of the source width) choose the columns: the cut frame
// has a man half out of its right edge, so the crop stops before him. BAND_TOP
// (fraction of the source height) is the first row; the band's height follows
// from its aspect. The checks below fail the run if the crop would leave the
// source, so nothing new is cut by the card's own edge.
const BAND_Y = 262;
const BAND_H = 630 - BAND_Y;
const BAND_X0 = 0;
const BAND_W = 0.895;
const BAND_TOP = 0;
const src = await sharp(path.join(ROOT, HERO.source)).rotate().toBuffer({ resolveWithObject: true });
const SW = src.info.width, SH = src.info.height;
const cropW = Math.round(SW * BAND_W);
const cropH = Math.round((cropW * BAND_H) / 1200);
const cropL = Math.round(SW * BAND_X0), cropT = Math.round(SH * BAND_TOP);
if (cropL + cropW > SW || cropT + cropH > SH) throw new Error("band crop leaves the source frame");
const bandBuf = await sharp(src.data)
  .extract({ left: cropL, top: cropT, width: cropW, height: cropH })
  .resize(2400, BAND_H * 2)
  .jpeg({ quality: 92 })
  .toBuffer();
const BAND_URI = "data:image/jpeg;base64," + bandBuf.toString("base64");

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const [h1, h2] = RC.headline;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:630px;overflow:hidden;background:#f3eeea}
.top{position:absolute;left:0;right:0;top:0;height:${BAND_Y}px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:6px}
.mark{display:block;width:${MARK_W}px;height:${MARK_H}px}
.h{margin-top:16px;font-family:"Fraunces";font-weight:400;font-size:66px;line-height:1;letter-spacing:-0.01em;color:#000;white-space:nowrap;font-variation-settings:"opsz" 144}
.hi{display:inline-block;margin-left:0.12em;padding:0.02em 0.14em 0.1em 0.08em;border-radius:0.2em;background:#ffde59;font-weight:700}
.sub{margin-top:14px;font-family:"Rubik";font-weight:400;font-size:27px;line-height:1.2;color:#4e4f50;white-space:nowrap}
.band{position:absolute;left:0;top:${BAND_Y}px;width:1200px;height:${BAND_H}px;background:url(${BAND_URI}) center top/1200px ${BAND_H}px no-repeat}
</style></head><body>
<div class="top">
  <img class="mark" src="${MARK_URI}" alt="">
  <p class="h">${esc(h1)}<span class="hi">${esc(h2)}</span></p>
  <p class="sub">${esc(RC.sub)}</p>
</div>
<div class="band"></div>
<script>
document.fonts.ready.then(() => {
  const ink = (s) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(s)); const r = rg.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  document.body.dataset.report = JSON.stringify({
    fraunces: document.fonts.check('700 66px "Fraunces"', "ribbon"),
    rubik: document.fonts.check('27px "Rubik"', "Our"),
    h: ink(".h"), sub: ink(".sub"), mark: ink(".top"),
  });
});
</script>
</body></html>`;

const htmlPath = path.join(TMP, "ribboncutting-og.html");
writeFileSync(htmlPath, html);
const url = pathToFileURL(htmlPath).href;
const common = ["--headless", `--user-data-dir=${PROFILE}`, "--window-size=1200,630", "--hide-scrollbars", "--virtual-time-budget=8000", "--disable-gpu", "--allow-file-access-from-files"];

const dom = execFileSync(SHELL, [...common, "--dump-dom", url], { timeout: 60000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
const raw = dom.match(/data-report="([^"]*)"/)?.[1];
if (!raw) throw new Error("render check did not run");
const report = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
console.log("render check", JSON.stringify(report));
if (!report.fraunces || !report.rubik) throw new Error("fonts did not load");
for (const k of ["h", "sub"]) {
  const [l, , r] = report[k];
  if (l < 310 || r > 890) throw new Error(`${k} leaves the centre 600 px (${l}..${r})`);
}
if (report.sub[3] > BAND_Y - 12) throw new Error("sub runs into the photo band");

const shot = path.join(TMP, "ribboncutting-og@2x.png");
execFileSync(SHELL, [...common, "--force-device-scale-factor=2", `--screenshot=${shot}`, url], { timeout: 60000, stdio: "ignore" });
await sharp(shot)
  .extract({ left: 0, top: 0, width: 2400, height: 1260 })
  .resize(1200, 630, { kernel: "lanczos3" })
  .removeAlpha()
  .toColorspace("srgb")
  .jpeg({ quality: 86, mozjpeg: true, progressive: true, chromaSubsampling: "4:4:4" })
  .toFile(OUT);
const meta = await sharp(OUT).metadata();
console.log(`wrote ${path.relative(ROOT, OUT)} ${meta.width}x${meta.height} ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
