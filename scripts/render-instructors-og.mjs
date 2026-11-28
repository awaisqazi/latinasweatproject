// /instructors link share card (og:image), in the portal's own identity: the studio's binder.
// Natural Sand ground (#f5ede3), one ink (#1e1e1e), Rubik 700/400, the LSP highlight yellow
// (#FFDE59) as a single highlighter stroke behind the title, and the LSP X mark
// (scripts/mark_x_only.png) whole and unaltered.
//
// The card says only what is public: the page's name and the organization. Nothing internal,
// no dates, no names. Everything sits inside the centre 630x630 square, so a square crop
// (Messages, WhatsApp) still reads.
//
// Rendering: an HTML template rendered by Playwright's separate chrome-headless-shell binary
// (never the Chrome app), at device scale 2, then downsampled to 1200x630 JPEG with sharp.
// Rubik (latin subset) is fetched from Google Fonts at run time and inlined; a first headless
// pass checks the font loaded and every line sits inside the centre square with margin, and
// the script fails loudly if not.
//
// Output: public/images/instructors/instructors-og.jpg (1200x630)
//
// Usage: node scripts/render-instructors-og.mjs
import { mkdirSync, writeFileSync, readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public/images/instructors");
const OUT = path.join(OUT_DIR, "instructors-og.jpg");
const TMP = process.env.TMP_DIR || path.join(os.tmpdir(), "lsp-instructors-og");
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
const FONT_CSS = await inlineFonts("family=Rubik:wght@400;700");

// ---------- LSP X mark, embedded whole: no recolour, filter or blend ----------
const MARK_SRC = path.join(ROOT, "scripts/mark_x_only.png");
const MARK_URI = "data:image/png;base64," + readFileSync(MARK_SRC).toString("base64");
const markMeta = await sharp(MARK_SRC).metadata();
const MARK_H = 156;
const MARK_W = +(MARK_H * (markMeta.width / markMeta.height)).toFixed(2);

const SAND = "#f5ede3", INK = "#1e1e1e", HI = "#ffde59";

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:${SAND};color:${INK};font-family:"Rubik";display:flex;align-items:center;justify-content:center}
.col{width:600px;display:flex;flex-direction:column;align-items:center;text-align:center}
.mark{display:block;width:${MARK_W}px;height:${MARK_H}px}
.title{margin-top:30px;font-weight:700;font-size:90px;line-height:1.3;letter-spacing:-0.02em}
.title span{background:${HI};-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:0 .12em;border-radius:3px}
.org{margin-top:22px;font-weight:400;font-size:36px;line-height:1.2}
</style></head><body>
<div class="col">
  <img class="mark" src="${MARK_URI}" width="${MARK_W}" height="${MARK_H}" alt="">
  <h1 class="title"><span>Instructor</span><br><span>portal</span></h1>
  <p class="org">Latina Sweat Project</p>
</div>
<script>
document.fonts.ready.then(() => {
  const ink = (s) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(s)); const r = rg.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  document.body.dataset.report = JSON.stringify({
    loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family + " " + f.weight),
    title: ink(".title"), org: ink(".org"), mark: box(".mark"),
    markNatural: [document.querySelector(".mark").naturalWidth, document.querySelector(".mark").naturalHeight],
  });
});
</script>
</body></html>`;

const htmlPath = path.join(TMP, "instructors-og.html");
writeFileSync(htmlPath, html);
const url = pathToFileURL(htmlPath).href;
const common = [
  "--headless", `--user-data-dir=${PROFILE}`, "--window-size=1200,630", "--hide-scrollbars",
  "--virtual-time-budget=8000", "--disable-gpu", "--allow-file-access-from-files",
];

// Pass 1: fonts really loaded; every line inside the centre 630x630 square with margin.
const dom = execFileSync(SHELL, [...common, "--dump-dom", url], { timeout: 60000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const raw = dom.match(/data-report="([^"]*)"/)?.[1];
if (!raw) throw new Error("render check did not run (no report in DOM)");
const report = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
console.log("render check", JSON.stringify(report));
for (const w of ["Rubik 400", "Rubik 700"]) {
  if (!report.loaded.some((f) => f.startsWith(w))) throw new Error(`${w} did not load`);
}
const SQ = { l: 285, t: 0, r: 915, b: 630 };
for (const key of ["title", "org", "mark"]) {
  const [l, t, r, b] = report[key];
  if (l < SQ.l + 24 || r > SQ.r - 24 || t < SQ.t + 24 || b > SQ.b - 24)
    throw new Error(`${key} is not inside the centre square with margin: ${report[key]}`);
}
{
  const [ml, mt, mr, mb] = report.mark;
  const [nw, nh] = report.markNatural;
  if (Math.abs((mr - ml) / (mb - mt) - nw / nh) > 0.03) throw new Error("mark aspect ratio changed");
}

// Pass 2: screenshot at 2x, downsample to 1200x630 sRGB JPEG.
const shot = path.join(TMP, "instructors-og@2x.png");
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
