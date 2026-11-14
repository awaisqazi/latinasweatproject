// /friendsgiving link share card (og:image) in the page's own "menu card" identity: the
// oxblood firefly night of the Partiful invite (#1c0606 glowing to #430707 at the edges), one
// cream paper card, watercolor autumn leaves, "Friendsgiving" in Pinyon Script (bronze #5b4a1f).
// The leaf shapes, gradients and watercolor filter are the same ones FriendsgivingApp.svelte
// draws on the page; here the leaves are bigger and tumble around the card, and the fireflies
// are softer, larger bokeh.
//
// Crest: the LSP X mark (scripts/mark_x_only.png, whole and unaltered) at the top of the paper.
// Text, in order, and nothing else: kicker ("LSP Team Bonding"), "Friendsgiving", "What are
// you bringing?", the date. Kicker and date come from src/data/friendsgiving.js, so after a date
// change just re-run this script. No location of any kind, by the owner's request.
//
// Layout rule: the paper card and all four text lines sit inside the centre 600x600, so the
// square crop WhatsApp and small previews use still reads; fireflies and loose leaves fill the
// wings. Every leaf stays fully inside the frame.
//
// Rendering: an HTML template rendered by Playwright's separate chrome-headless-shell binary
// (never the Chrome app), at device scale 2, then downsampled to 1200x630 JPEG with sharp.
// Pinyon Script and Fraunces (latin subset) are fetched from Google Fonts at run time and inlined
// as data URIs, so the page needs no network; a first headless pass checks that both faces
// really loaded and that the title fits the card, and the script fails loudly if not.
//
// Output: public/images/friendsgiving/friendsgiving-og.jpg (1200x630)
//
// Usage: node scripts/render-friendsgiving-og.mjs
import { mkdirSync, writeFileSync, readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public/images/friendsgiving");
const OUT = path.join(OUT_DIR, "friendsgiving-og.jpg");
const TMP = process.env.TMP_DIR || path.join(os.tmpdir(), "lsp-friendsgiving-og");
const PROFILE = path.join(TMP, "prof");
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(PROFILE, { recursive: true });

const { friendsgivingEvent: EVENT } = await import(
  pathToFileURL(path.join(ROOT, "src/data/friendsgiving.js")).href
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
  await inlineFonts("family=Pinyon+Script"),
  await inlineFonts("family=Fraunces:ital,opsz,wght@0,9..144,400..600;1,9..144,400..600"),
].join("\n");

// ---------- LSP X mark: scripts/mark_x_only.png (863x734, transparent), embedded whole ----------
// Used exactly as drawn (black X, gold sun, open centre): no recolour, filter or blend. Its
// height is the clear-space unit: nothing comes within half of it.
const MARK_SRC = path.join(ROOT, "scripts/mark_x_only.png");
const MARK_URI = "data:image/png;base64," + readFileSync(MARK_SRC).toString("base64");
const markMeta = await sharp(MARK_SRC).metadata();
const MARK_H = 60;
const MARK_W = +(MARK_H * (markMeta.width / markMeta.height)).toFixed(2);

// ---------- palette ----------
const NIGHT = "#1c0606", EMBER = "#430707", PAPER = "#f4ede2", INK = "#2a1a12",
      BRONZE = "#5b4a1f", FIREFLY = "#f7d774";

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ---------- fireflies: seeded, so every run is identical ----------
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(1122);
const CARD = { x: 320, y: 46, w: 560, h: 538 };
const flies = [];
for (let tries = 0; flies.length < 46 && tries < 4000; tries++) {
  const big = flies.length < 14; // first ones are the large soft bokeh
  const s = big ? 34 + rnd() * 56 : 5 + rnd() * 16;
  const x = rnd() * 1200, y = rnd() * 630;
  // keep them off the paper (a few may graze its edge), never cut by the frame awkwardly
  const pad = big ? -s * 0.35 : 4;
  const onCard = x > CARD.x - pad && x < CARD.x + CARD.w + pad && y > CARD.y - pad && y < CARD.y + CARD.h + pad;
  if (onCard) continue;
  if (x < s / 2 + 2 || x > 1200 - s / 2 - 2 || y < s / 2 + 2 || y > 630 - s / 2 - 2) continue;
  if (flies.some((f) => Math.hypot(f.x - x, f.y - y) < (f.s + s) * 0.55)) continue;
  flies.push({
    x, y, s,
    blur: big ? 5 + rnd() * 9 : rnd() < 0.5 ? 0.6 : 1.6 + rnd() * 2,
    o: big ? 0.3 + rnd() * 0.28 : 0.6 + rnd() * 0.4,
  });
}
const fireflyHTML = flies
  .map((f) => `<i style="left:${(f.x - f.s / 2).toFixed(1)}px;top:${(f.y - f.s / 2).toFixed(1)}px;width:${f.s.toFixed(1)}px;height:${f.s.toFixed(1)}px;filter:blur(${f.blur.toFixed(1)}px);opacity:${f.o.toFixed(2)}"></i>`)
  .join("");

// ---------- leaves: same art as FriendsgivingApp.svelte ----------
const DEFS = `<svg width="0" height="0" style="position:absolute"><defs>
  <filter id="fg-wc" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="n" />
    <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d" />
    <feGaussianBlur in="d" stdDeviation="0.45" result="b" />
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="grain" />
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.55 1.12" result="g2" />
    <feComposite in="b" in2="g2" operator="in" />
  </filter>
  <radialGradient id="fg-g-orange" cx="40%" cy="38%" r="70%"><stop offset="0" stop-color="#f0a24a" /><stop offset="0.55" stop-color="#d8601f" /><stop offset="1" stop-color="#a83e14" /></radialGradient>
  <radialGradient id="fg-g-red" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="#cf5a37" /><stop offset="0.6" stop-color="#a3301c" /><stop offset="1" stop-color="#6e1c10" /></radialGradient>
  <radialGradient id="fg-g-gold" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#f6cf6a" /><stop offset="0.55" stop-color="#e0a030" /><stop offset="1" stop-color="#b77418" /></radialGradient>
  <radialGradient id="fg-g-olive" cx="40%" cy="40%" r="70%"><stop offset="0" stop-color="#b9b25a" /><stop offset="0.6" stop-color="#8b8a2f" /><stop offset="1" stop-color="#5d5c1c" /></radialGradient>
  <symbol id="fg-maple" viewBox="0 0 100 100">
    <path d="M50 78 L36 83 L38 74 L19 70 L26 62 L7 48 L18 45 L13 31 L28 37 L30 25 L40 33 L41 13 L50 3 L59 13 L60 33 L70 25 L72 37 L87 31 L82 45 L93 48 L74 62 L81 70 L62 74 L64 83 Z" stroke-linejoin="round" />
    <path d="M50 78 L52 97" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
    <path d="M50 78 L50 14 M50 60 L22 44 M50 60 L78 44 M50 70 L28 66 M50 70 L72 66" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.45" />
  </symbol>
  <symbol id="fg-oak" viewBox="0 0 100 50">
    <path d="M4 25 C 20 4, 58 0, 96 25 C 58 50, 20 46, 4 25 Z" />
    <path d="M0 25 L 90 25 M30 25 L44 13 M30 25 L44 37 M52 25 L66 14 M52 25 L66 36" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.45" />
  </symbol>
</defs></svg>`;
const VEIN = { orange: "#7a2c0c", red: "#5a140a", gold: "#8a5410", olive: "#4a4912" };
// shape, color, center x, center y, width, rotation (deg), extra class
function leaf(shape, color, cx, cy, w, rot, cls = "") {
  const h = shape === "maple" ? w : w / 2;
  const vb = shape === "maple" ? "0 0 100 100" : "0 0 100 50";
  return `<svg class="leaf ${cls}" viewBox="${vb}" style="left:${cx - w / 2}px;top:${cy - h / 2}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg)"><g filter="url(#fg-wc)" fill="url(#fg-g-${color})" color="${VEIN[color]}"><use href="#fg-${shape}" /></g></svg>`;
}
// Loose leaves on the night, tumbling around the card (all fully inside the 1200x630 frame).
const LOOSE = [
  leaf("maple", "gold", 175, 132, 118, 22),
  leaf("oak", "red", 232, 300, 128, 38),
  leaf("maple", "orange", 344, 550, 116, -16, "over"),
  leaf("oak", "olive", 92, 470, 96, -28),
  leaf("maple", "red", 856, 74, 108, 16, "over"),
  leaf("oak", "orange", 1072, 150, 92, -40),
  leaf("maple", "gold", 1035, 330, 104, 32),
  leaf("oak", "olive", 858, 546, 120, -24, "over"),
  leaf("maple", "orange", 1118, 520, 70, 8),
  leaf("oak", "gold", 60, 250, 70, 62),
].join("");
// Small leaves on the paper around the title (multiply, like the page masthead).
const ON_PAPER = [
  leaf("maple", "orange", 66, 66, 64, -24, "ink"),
].join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_CSS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1200px;height:630px;overflow:hidden}
body{position:relative;background-color:${NIGHT};
  background-image:radial-gradient(60% 75% at 50% 50%, rgba(90,22,14,0.35), transparent 70%),
    linear-gradient(90deg, ${EMBER} 0%, ${NIGHT} 30%, ${NIGHT} 70%, ${EMBER} 100%);}
.flies{position:absolute;inset:0}
/* fine grain dithers the dark gradient so the JPEG does not band */
.grain{position:absolute;inset:0;opacity:0.5;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.9 0 0 0 0 0.6 0 0 0 0 0.4 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")}
.flies i{position:absolute;border-radius:50%;
  background:radial-gradient(circle, #fff4cc 0%, ${FIREFLY} 34%, rgba(247,215,116,0.35) 55%, rgba(247,215,116,0) 72%)}
.leaf{position:absolute;overflow:visible}
.card{position:absolute;left:${CARD.x}px;top:${CARD.y}px;width:${CARD.w}px;height:${CARD.h}px;border-radius:4px;
  background-color:${PAPER};
  background-image:radial-gradient(120% 80% at 50% 0%, rgba(255,252,244,0.75), transparent 60%),
    radial-gradient(140% 120% at 50% 50%, transparent 60%, rgba(120,82,40,0.16) 100%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.25 0 0 0 0 0.15 0 0 0 0.09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)'/%3E%3C/svg%3E");
  box-shadow:0 1px 0 rgba(255,255,255,0.4) inset, 0 30px 70px -14px rgba(0,0,0,0.85), 0 0 120px -10px rgba(247,215,116,0.16);
  display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:18px;text-align:center;color:${INK}}
.card .leaf.ink{mix-blend-mode:multiply}
.mark{display:block;width:${MARK_W}px;height:${MARK_H}px;flex:none}
.kicker{margin-top:${MARK_H / 2 + 2}px;font-family:"Fraunces";font-weight:560;font-size:19px;letter-spacing:0.3em;text-transform:uppercase;color:${BRONZE};padding-left:0.3em}
.title{position:relative;margin-top:26px;font-family:"Pinyon Script";font-weight:400;font-size:94px;line-height:1.1;color:${BRONZE};white-space:nowrap;-webkit-text-stroke:1.1px ${BRONZE}}
.ask{margin-top:44px;font-family:"Fraunces";font-style:italic;font-weight:500;font-size:47px;line-height:1.1;font-variation-settings:"opsz" 72}
.date{margin-top:26px;font-family:"Fraunces";font-weight:400;font-size:31px;line-height:1.2;color:rgba(42,26,18,0.82);font-variation-settings:"opsz" 36}
.over{z-index:3}
</style></head><body>
${DEFS}
<div class="grain"></div>
<div class="flies">${fireflyHTML}</div>
${LOOSE}
<div class="card">
  ${ON_PAPER}
  <img class="mark" src="${MARK_URI}" width="${MARK_W}" height="${MARK_H}" alt="">
  <p class="kicker">${esc(EVENT.kicker)}</p>
  <h1 class="title">Friendsgiving</h1>
  <p class="ask">What are you bringing?</p>
  <p class="date">${esc(EVENT.dateLabel)}</p>
</div>
<script>
document.fonts.ready.then(() => {
  const card = document.querySelector(".card").getBoundingClientRect();
  const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
  // Range width of the actual glyphs (swashes included), not the block box.
  const ink = (s) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(s)); const r = rg.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; };
  document.body.dataset.report = JSON.stringify({
    pinyon: document.fonts.check('94px "Pinyon Script"', "Friendsgiving"),
    fraunces: document.fonts.check('italic 47px "Fraunces"', "What"),
    loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family + " " + f.style),
    card: [Math.round(card.left), Math.round(card.top), Math.round(card.right), Math.round(card.bottom)],
    title: ink(".title"), ask: ink(".ask"), date: box(".date"), kicker: ink(".kicker"),
    kickerBox: box(".kicker"), mark: box(".mark"),
    markNatural: [document.querySelector(".mark").naturalWidth, document.querySelector(".mark").naturalHeight],
    leaves: [...document.querySelectorAll(".leaf")].map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }),
  });
});
</script>
</body></html>`;

const htmlPath = path.join(TMP, "friendsgiving-og.html");
writeFileSync(htmlPath, html);
const url = pathToFileURL(htmlPath).href;
const common = [
  "--headless", `--user-data-dir=${PROFILE}`, "--window-size=1200,630", "--hide-scrollbars",
  "--virtual-time-budget=8000", "--disable-gpu", "--allow-file-access-from-files",
];

// Pass 1: confirm the fonts really loaded and the type sits inside the card.
const dom = execFileSync(SHELL, [...common, "--dump-dom", url], { timeout: 60000, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const raw = dom.match(/data-report="([^"]*)"/)?.[1];
if (!raw) throw new Error("render check did not run (no report in DOM)");
const report = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
console.log("render check", JSON.stringify(report));
if (!report.pinyon || !report.loaded.some((f) => f.startsWith("Pinyon Script"))) throw new Error("Pinyon Script did not load; title would be a fallback face");
if (!report.fraunces || !report.loaded.some((f) => f.startsWith("Fraunces italic"))) throw new Error("Fraunces italic did not load");
const [cl, , cr] = report.card;
for (const key of ["title", "ask", "kicker"]) {
  const [l, r] = report[key];
  if (l < cl + 14 || r > cr - 14) throw new Error(`${key} runs too close to the card edge: ${l}..${r} in card ${cl}..${cr}`);
}
if (report.date[3] > report.card[3] - 30) throw new Error("date sits too low on the card");
if (cl < 300 || cr > 900) throw new Error("card is outside the centre 600px square");
// Mark: aspect kept, and clear space of half its height to the card edge, the kicker and every leaf.
{
  const [ml, mt, mr, mb] = report.mark, clear = (mb - mt) / 2;
  const [nw, nh] = report.markNatural;
  if (Math.abs((mr - ml) / (mb - mt) - nw / nh) > 0.03) throw new Error("mark aspect ratio changed");
  if (mt - report.card[1] < clear || ml - report.card[0] < clear || report.card[2] - mr < clear) throw new Error("mark too close to the card edge");
  if (report.kickerBox[1] - mb < clear - 2) throw new Error("kicker too close to the mark");
  for (const [l, t, r, b] of report.leaves) {
    const dx = Math.max(l - mr, ml - r, 0), dy = Math.max(t - mb, mt - b, 0);
    if (Math.hypot(dx, dy) < clear) throw new Error(`a leaf crowds the mark: ${[l, t, r, b]}`);
  }
}

// Pass 2: screenshot at 2x, downsample to 1200x630 sRGB JPEG.
const shot = path.join(TMP, "friendsgiving-og@2x.png");
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
