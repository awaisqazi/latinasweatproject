// LSP Posadas (named "Una Posada, Un Hogar" Nov 23 to 25 2026): Zeffy event banner (1200x1200 square).
//
// Identity = the team's own LSP Posadas save-the-date (public/images/posada/lsp-posadas-save-the-date.jpg):
// warm white paper, charcoal ink, one pen red (the circle round the 19), Mynerve for the hand
// lettering, Rubik for anything read fast. The LSP X mark is used whole (scripts/mark_x_only.png).
// The only art is a plain rectangular crop of the save-the-date's watercolor strip (pinata, house,
// tree), laid along the bottom edge; its top edge is masked into the paper so no hard cut shows.
//
// Rendering: HTML rendered by Playwright's separate chrome-headless-shell (never the Chrome app),
// at device scale 2, downsampled with sharp. A first --dump-dom pass checks fonts loaded and that
// every text line sits inside the frame with margin; the script fails loudly if not.
//
// Output: marketing/una-posada/zeffy-banner-1200.jpg (+ .png)
// Usage:  node marketing/una-posada/render-banner.mjs
import { mkdirSync, writeFileSync, readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "zeffy-banner-1200.jpg");
const OUT_PNG = path.join(HERE, "zeffy-banner-1200.png");
const TMP = process.env.TMP_DIR || path.join(os.tmpdir(), "lsp-una-posada-banner");
const PROFILE = path.join(TMP, "prof");
mkdirSync(PROFILE, { recursive: true });

function findHeadlessShell() {
  if (process.env.CHROME_HEADLESS_SHELL) return process.env.CHROME_HEADLESS_SHELL;
  const base = path.join(os.homedir(), "Library/Caches/ms-playwright");
  const dirs = readdirSync(base).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse();
  for (const d of dirs) {
    const p = path.join(base, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell");
    if (existsSync(p)) return p;
  }
  throw new Error("Playwright chrome-headless-shell not found");
}
const SHELL = findHeadlessShell();

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
const FONT_CSS = [await inlineFonts("family=Mynerve"), await inlineFonts("family=Rubik:wght@500;700;800")].join("\n");

// LSP X mark, whole
const MARK_SRC = path.join(ROOT, "scripts/mark_x_only.png");
const MARK_URI = "data:image/png;base64," + readFileSync(MARK_SRC).toString("base64");
const markMeta = await sharp(MARK_SRC).metadata();
const MARK_H = 104;
const MARK_W = +(MARK_H * (markMeta.width / markMeta.height)).toFixed(2);

// Watercolor strip: plain rectangular crop of the save-the-date (1080x1334), below "LSP Posadas".
const ART = path.join(ROOT, "public/images/posada/lsp-posadas-save-the-date.jpg");
const STRIP_TOP = 1068;
const strip = await sharp(ART).extract({ left: 0, top: STRIP_TOP, width: 1080, height: 1334 - STRIP_TOP }).resize(2400).jpeg({ quality: 92 }).toBuffer();
const STRIP_URI = "data:image/jpeg;base64," + strip.toString("base64");
const STRIP_H = Math.round(1200 * (1334 - STRIP_TOP) / 1080);

const PAPER = "#f9f7f4", INK = "#2b2d36", RED = "#d8382e";

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:1200px;overflow:hidden}
body{position:relative;background:${PAPER};color:${INK};font-family:"Rubik"}
.strip{position:absolute;left:0;bottom:0;width:1200px;height:${STRIP_H}px;display:block;
  -webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 64px);mask-image:linear-gradient(to bottom,transparent 0,#000 64px)}
.col{position:absolute;left:0;right:0;top:0;height:${1200 - STRIP_H + 20}px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.mark{display:block;width:${MARK_W}px;height:${MARK_H}px}
.title{margin-top:30px;font-family:"Mynerve";font-weight:400;font-size:168px;line-height:1;white-space:nowrap}
.title span{display:block}
.sub{margin-top:40px;font-weight:700;font-size:40px;line-height:1.15;white-space:nowrap}
.date{margin-top:40px;font-weight:800;font-size:58px;line-height:1.1;white-space:nowrap;letter-spacing:-.005em}
.num{position:relative;display:inline-block;margin-left:.22em}
.ring{position:absolute;overflow:visible;pointer-events:none;left:-22px;top:-20px;width:calc(100% + 44px);height:calc(100% + 40px);transform:rotate(-4deg)}
.ring path{fill:none;stroke:${RED};stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.time{margin-top:16px;font-weight:500;font-size:40px;line-height:1.2;white-space:nowrap}
.tix{margin-top:12px;font-weight:500;font-size:34px;line-height:1.2;white-space:nowrap;color:rgba(43,45,54,.8)}
</style></head><body>
<img class="strip" src="${STRIP_URI}" alt="">
<div class="col">
  <img class="mark" src="${MARK_URI}" width="${MARK_W}" height="${MARK_H}" alt="">
  <h1 class="title"><span>LSP Posadas</span></h1>
  <p class="sub">LSP Grand Opening &amp; Community Fundraiser</p>
  <p class="date">Saturday, December <span class="num">19<svg class="ring" viewBox="0 0 100 60" preserveAspectRatio="none"><path d="M78 6 C58 -1 18 2 7 20 C-3 38 18 57 52 56 C86 55 101 40 95 22 C90 9 68 3 46 5"/><path d="M84 10 C64 2 22 5 10 23 C2 40 24 54 55 53 C84 52 98 37 92 21"/></svg></span></p>
  <p class="time">6 to 9 pm · Mural Park</p>
  <p class="tix">Free tickets · $10 suggested donation</p>
</div>
<script>
document.fonts.ready.then(() => {
  const ink = (s) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(s)); const r = rg.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  document.body.dataset.report = JSON.stringify({
    mynerve: document.fonts.check('142px "Mynerve"', "Posada"),
    loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family + " " + f.weight),
    mark: box(".mark"), title: ink(".title"), sub: ink(".sub"), date: ink(".date"), ring: box(".ring"), time: ink(".time"), tix: ink(".tix"), strip: box(".strip"),
  });
});
</script>
</body></html>`;

const htmlPath = path.join(TMP, "banner.html");
writeFileSync(htmlPath, html);
const url = pathToFileURL(htmlPath).href;
const common = ["--headless", `--user-data-dir=${PROFILE}`, "--window-size=1200,1200", "--hide-scrollbars", "--virtual-time-budget=8000", "--disable-gpu", "--allow-file-access-from-files"];

const dom = execFileSync(SHELL, [...common, "--dump-dom", url], { timeout: 60000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const raw = dom.match(/data-report="([^"]*)"/)?.[1];
if (!raw) throw new Error("render check did not run");
const report = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
console.log("render check", JSON.stringify(report));
if (!report.mynerve || !report.loaded.some((f) => f.startsWith("Mynerve"))) throw new Error("Mynerve did not load");
if (!report.loaded.some((f) => f.startsWith("Rubik 800"))) throw new Error("Rubik 800 did not load");
const stripTop = report.strip[1];
for (const key of ["mark", "title", "sub", "date", "ring", "time", "tix"]) {
  const [l, t, r, b] = report[key];
  if (l < 60 || r > 1140 || t < 50) throw new Error(`${key} too close to the frame edge: ${report[key]}`);
  if (key !== "mark" && b > stripTop + 30) throw new Error(`${key} runs into the art strip: ${report[key]} vs strip top ${stripTop}`);
}

const shot = path.join(TMP, "banner@2x.png");
execFileSync(SHELL, [...common, "--force-device-scale-factor=2", `--screenshot=${shot}`, url], { timeout: 60000, stdio: "ignore" });
const base = sharp(shot).extract({ left: 0, top: 0, width: 2400, height: 2400 }).resize(1200, 1200, { kernel: "lanczos3" }).removeAlpha().toColorspace("srgb");
await base.clone().jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" }).toFile(OUT);
await base.clone().png({ compressionLevel: 9 }).toFile(OUT_PNG);
console.log(`wrote ${path.relative(ROOT, OUT)} ${(statSync(OUT).size / 1024).toFixed(0)} KB, ${path.relative(ROOT, OUT_PNG)} ${(statSync(OUT_PNG).size / 1024).toFixed(0)} KB`);
