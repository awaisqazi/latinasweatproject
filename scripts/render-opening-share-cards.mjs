// Link share cards (Open Graph, 1200 x 630) for the homepage, in the look of
// the Mural Park schedule and opening posts (Public Sans, deep green, cream,
// one flat color per class format). Three cards, picked by date in
// src/data/studioOpening.js (homeShareCard):
//   opening-soon.png  until the first class on Mon Nov 16, 2026
//   opening-open.png  opening week
//   home.png          the long-term card after that
//
// Run: node scripts/render-opening-share-cards.mjs
// Renders with Playwright's chrome-headless-shell (never the real Chrome app).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import {
  openingFormats,
  openingFormatColor,
  openingPalette as C,
  openingWeek,
  studioOpening as o,
} from "../src/data/studioOpening.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/images/og");
const FONTS = path.join(ROOT, "public/fonts/public-sans");
const MARK = path.join(ROOT, "marketing/mural-park-opening/photos/lsp-x-mark-black-transparent.png");
const TMP = process.env.TMP_DIR || path.join(os.tmpdir(), "lsp-opening-share-cards");
const PROFILE = path.join(TMP, "prof");
for (const d of [OUT, TMP, PROFILE]) mkdirSync(d, { recursive: true });

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
const url = (p) => pathToFileURL(p).href;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// The real X mark, cropped above its wordmark; a cream copy for the dark cards.
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const top = await sharp(MARK).ensureAlpha().extract({ left: 0, top: 0, width: 1024, height: 875 }).png().toBuffer();
const crop = await sharp(top).trim({ threshold: 1 }).png().toBuffer();
await sharp(crop).toFile(path.join(TMP, "x-black.png"));
{
  const { data: px, info } = await sharp(crop).raw().toBuffer({ resolveWithObject: true });
  const cr = hex2rgb(C.cream);
  for (let i = 0; i < px.length; i += 4) {
    const sat = Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]);
    if (sat < 60) for (let c = 0; c < 3; c++) px[i + c] = cr[c];
  }
  await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(path.join(TMP, "x-cream.png"));
}
const xMeta = await sharp(path.join(TMP, "x-black.png")).metadata();
const XASPECT = xMeta.width / xMeta.height;

const W = 1200, H = 630, M = 60;
const face = (w, st = "normal") =>
  `@font-face{font-family:"PS";src:url("${url(path.join(FONTS, `public-sans-latin-${w}-${st}.woff2`))}") format("woff2");font-weight:${w};font-style:${st}}`;
const baseCss = `${[600, 700, 800, 900].map((w) => face(w)).join("")}${face(700, "italic")}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden}
.page{position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:"PS";-webkit-font-smoothing:antialiased;font-kerning:normal}
.abs{position:absolute;white-space:nowrap}
.label{font-weight:800;text-transform:uppercase;letter-spacing:.16em;line-height:1;font-size:21px}
.head{font-weight:900;letter-spacing:-.045em;line-height:.92}
.sub{font-weight:800;letter-spacing:-.025em;line-height:1}
.word{font-weight:700;font-style:italic;letter-spacing:-.005em;line-height:1;font-size:30px}
.right{font-weight:700;line-height:1;font-size:27px}`;

function footer(dark) {
  const ink = dark ? C.cream : C.ink;
  const xH = 50, xW = Math.round(xH * XASPECT), hair = 524, xTop = 544, mid = xTop + xH / 2;
  return `<div class="abs" style="left:${M}px;top:${hair}px;width:${W - 2 * M}px;height:2px;background:${dark ? C.hair : C.hairLight}"></div>
  <img class="abs" src="${url(path.join(TMP, dark ? "x-cream.png" : "x-black.png"))}" style="left:${M}px;top:${xTop}px;height:${xH}px;width:${xW}px">
  <div class="abs word" style="left:${M + xW + 16}px;top:${mid - 15}px;color:${ink}">Latina Sweat Project</div>
  <div class="abs right" style="right:${M}px;top:${mid - 13.5}px;color:${ink}">latinasweatproject.com</div>`;
}

// The week of classes as the bar mosaic from the cover post.
function mosaic(x, y, colW, gap, barH, barG) {
  let out = "";
  openingWeek.forEach((d, di) => {
    const left = x + di * (colW + gap);
    out += `<div class="abs" style="left:${left}px;top:${y}px;font-size:11.5px;font-weight:800;letter-spacing:.12em;line-height:1;text-transform:uppercase;color:${C.cream}">${d.day}</div>`;
    d.classes.forEach(([, name], i) => {
      out += `<div class="abs" style="left:${left}px;top:${y + 22 + i * (barH + barG)}px;width:${colW}px;height:${barH}px;border-radius:${Math.round(barH * 0.3)}px;background:${openingFormatColor[name]}"></div>`;
    });
  });
  return out;
}

function openingCard(sub) {
  const [a, ...rest] = o.headline.split(" ");
  return `<!doctype html><meta charset="utf-8"><style>${baseCss}</style>
<div class="page" style="background:${C.ground};color:${C.cream}">
  <div class="abs label" style="left:${M}px;top:58px">${esc(o.label.join(" · "))}</div>
  <div class="abs head" style="left:${M - 5}px;top:98px;font-size:138px">${esc(a)}<br>${esc(rest.join(" "))}</div>
  <div class="abs sub" style="left:${M}px;top:392px;font-size:50px">${esc(sub)}</div>
  ${mosaic(846, 112, 36, 7, 15, 4)}
  ${footer(true)}
</div>`;
}

function homeCard() {
  const n = openingFormats.length, gap = 8, bw = (W - 2 * M - (n - 1) * gap) / n;
  const strip = openingFormats
    .map((f, i) => `<div class="abs" style="left:${M + i * (bw + gap)}px;top:438px;width:${bw}px;height:26px;border-radius:8px;background:${f.color}"></div>`)
    .join("");
  return `<!doctype html><meta charset="utf-8"><style>${baseCss}</style>
<div class="page" style="background:${C.cream};color:${C.ink}">
  <div class="abs label" style="left:${M}px;top:58px">LSP at Mural Park · 924 W 19th Place · Pilsen, Chicago</div>
  <div class="abs head" style="left:${M - 4}px;top:104px;font-size:112px">Empowering<br>through movement.</div>
  <div class="abs sub" style="left:${M}px;top:352px;font-size:40px;font-weight:700">Yoga, fitness and community wellness in Pilsen.</div>
  ${strip}
  ${footer(false)}
</div>`;
}

const cards = [
  ["opening-soon", openingCard(o.soon)],
  ["opening-open", openingCard(o.open)],
  ["home", homeCard()],
];
for (const [name, html] of cards) {
  const htmlPath = path.join(TMP, `${name}.html`);
  const raw = path.join(TMP, `${name}.raw.png`);
  writeFileSync(htmlPath, html);
  execFileSync(SHELL, ["--headless", `--user-data-dir=${PROFILE}`, `--window-size=${W},${H}`, "--force-device-scale-factor=1",
    "--hide-scrollbars", "--virtual-time-budget=8000", "--disable-gpu", "--allow-file-access-from-files",
    `--screenshot=${raw}`, url(htmlPath)], { timeout: 90000, stdio: "ignore" });
  const out = path.join(OUT, `${name}.png`);
  await sharp(raw).extract({ left: 0, top: 0, width: W, height: H }).png({ compressionLevel: 9, palette: false }).toFile(out);
  console.log(out);
}
