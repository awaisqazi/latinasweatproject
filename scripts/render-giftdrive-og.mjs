// /giftdrive link share card (og:image), in the look of the team's flyer: its cream paper
// #fef9e6 and ink #040501, its own title lockup, the hand-lettered "On now until Dec 13"
// over the flyer's row of round dots, and its gifts drawing. Nothing new is drawn.
//
// Layout: the left column (x 56-604) holds the lockup (public/images/giftdrive/lockup.svg,
// the vector trace of the flyer's lettering, made by scripts/render-giftdrive-art.py),
// "On now until Dec 13" in Shantell Sans 500 with the dots under it, "Take a tag. Fill a
// wish list." in DM Sans 700 and the due date and place in DM Sans 500. The middle holds
// the flyer's gifts drawing (gifts-2x.webp, 290px wide, centred between the text and the
// mark). The right column holds the LSP X mark (scripts/mark_x_only.png), whole and unaltered, where it has always
// been (black on transparent, so it needs this light ground).
//
// The due date comes from src/data/giftDrive.js and the place name from craftDaysPlace in
// src/data/posadaCraftDays.js, so after a change just re-run this script.
//
// Rendering: an HTML template rendered by Playwright's separate chrome-headless-shell binary
// (never the Chrome app), at device scale 2, then downsampled to 1200x630 JPEG with sharp.
// DM Sans and Shantell Sans (latin subset) are fetched from Google Fonts at run time and
// inlined as data URIs; a first headless pass checks that the faces loaded and that every
// line and image sits inside the frame with margin, and the script fails loudly if not.
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
  await inlineFonts("family=DM+Sans:opsz,wght@9..40,500;9..40,700"),
  await inlineFonts("family=Shantell+Sans:wght@500"),
].join("\n");

// ---------- LSP X mark, embedded whole: no recolour, filter or blend ----------
const MARK_SRC = path.join(ROOT, "scripts/mark_x_only.png");
const MARK_URI = "data:image/png;base64," + readFileSync(MARK_SRC).toString("base64");
const markMeta = await sharp(MARK_SRC).metadata();
const MARK_H = 150;
const MARK_W = +(MARK_H * (markMeta.width / markMeta.height)).toFixed(2);

// ---------- the flyer's own art ----------
const ART = path.join(ROOT, "public/images/giftdrive");
const LOCKUP_URI = "data:image/svg+xml;base64," + readFileSync(path.join(ART, "lockup.svg")).toString("base64");
const GIFTS_URI = "data:image/webp;base64," + readFileSync(path.join(ART, "gifts-2x.webp")).toString("base64");

// ---------- copy, from the data files ----------
const PAPER = "#fef9e6", INK = "#040501";
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const dueLine = `Gifts due ${giftDrive.dueLabel}`;
const placeLine = `LSP at ${craftDaysPlace.name}`;
const LOCK_W = 548, LOCK_H = +(LOCK_W * 326 / 616).toFixed(2);
const GIFTS_W = 290, GIFTS_H = +(GIFTS_W * 290 / 498).toFixed(2);

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{position:relative;background:${PAPER};color:${INK};font-family:"DM Sans"}
.col{position:absolute;left:56px;top:0;width:${LOCK_W}px;height:630px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.lockup{display:block;width:${LOCK_W}px;height:${LOCK_H}px}
.onnow{margin-top:14px;font-family:"Shantell Sans";font-weight:500;font-size:40px;line-height:1.15;white-space:nowrap}
.dots{width:330px;height:7px;margin-top:10px;background:radial-gradient(circle, ${INK} 2.7px, transparent 3.2px) 0 50% / 10.5px 7px space no-repeat}
.tag{margin-top:28px;font-weight:700;font-size:34px;line-height:1.15;white-space:nowrap}
.due{margin-top:14px;font-weight:500;font-size:25px;line-height:1.25;white-space:nowrap}
.place{margin-top:2px;font-weight:500;font-size:25px;line-height:1.25;white-space:nowrap;color:rgba(4,5,1,.74)}
.gifts{position:absolute;display:block;left:${(604 + 1050 - MARK_W / 2) / 2 - GIFTS_W / 2}px;top:${315 - GIFTS_H / 2}px;width:${GIFTS_W}px;height:${GIFTS_H}px}
.mark{position:absolute;display:block;left:${1050 - MARK_W / 2}px;top:${315 - MARK_H / 2}px;width:${MARK_W}px;height:${MARK_H}px}
</style></head><body>
<img class="gifts" src="${GIFTS_URI}" width="${GIFTS_W}" height="${GIFTS_H}" alt="">
<img class="mark" src="${MARK_URI}" width="${MARK_W}" height="${MARK_H}" alt="">
<div class="col">
  <img class="lockup" src="${LOCKUP_URI}" width="${LOCK_W}" height="${LOCK_H}" alt="">
  <p class="onnow">On now until Dec 13</p>
  <div class="dots"></div>
  <p class="tag">Take a tag. Fill a wish list.</p>
  <p class="due">${esc(dueLine)}</p>
  <p class="place">${esc(placeLine)}</p>
</div>
<script>
document.fonts.ready.then(() => {
  const ink = (s) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(s)); const r = rg.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  document.body.dataset.report = JSON.stringify({
    hand: document.fonts.check('500 40px "Shantell Sans"', "On now"),
    loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family + " " + f.weight),
    lockup: box(".lockup"), onnow: ink(".onnow"), tag: ink(".tag"), due: ink(".due"), place: ink(".place"),
    gifts: box(".gifts"), mark: box(".mark"),
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
if (!report.hand || !report.loaded.some((f) => f.startsWith("Shantell Sans"))) throw new Error("Shantell Sans did not load");
if (!report.loaded.some((f) => f.startsWith("DM Sans 700"))) throw new Error("DM Sans 700 did not load");
if (!report.loaded.some((f) => f.startsWith("DM Sans 500"))) throw new Error("DM Sans 500 did not load");
const inside = (key, [l, t, r, b], L, T, R, B) => {
  if (l < L || t < T || r > R || b > B) throw new Error(`${key} is outside its area with margin: ${[l, t, r, b]}`);
};
for (const key of ["lockup", "onnow", "tag", "due", "place"]) inside(key, report[key], 40, 32, 620, 598);
inside("gifts", report.gifts, 620, 32, 1050 - MARK_W / 2 - 20, 598);
{
  const [l, t, r, b] = report.mark;
  if (l < 900 + 24 || r > 1200 - 24 || t < 8 || b > 622) throw new Error(`mark is not inside the right column: ${report.mark}`);
  const [nw, nh] = report.markNatural;
  if (Math.abs((r - l) / (b - t) - nw / nh) > 0.03) throw new Error("mark aspect ratio changed");
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
