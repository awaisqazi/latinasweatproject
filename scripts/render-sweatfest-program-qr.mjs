// Sweat Fest program QR: a scannable code pointing straight at the day-of
// program (latinasweatproject.com/sweatfest/program), rendered three ways:
//
//   output/sweatfest-program-qr/qr-plain.png            (2048px, ink on white,
//                                                        for print layouts)
//   output/sweatfest-program-qr/program-qr-card.jpg     (1080x1350 feed card)
//   output/sweatfest-program-qr/story/program-qr-card.jpg (1080x1920 story)
//
// The cards carry the official checkerboard identity (honeydew field, tile
// ring, Hello Baddie lettering) so the QR can go up on signage, stories, and
// the printed program without extra design work.
//
// Usage: node scripts/render-sweatfest-program-qr.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { sweatFestPalette as p, sweatFestProgram } from "../src/data/sweatFest.js";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const QRCode = require("qrcode");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "output/sweatfest-program-qr");
const tmpDir = path.join(root, ".sweatfest-render-tmp/program-qr");
mkdirSync(path.join(outDir, "story"), { recursive: true });
mkdirSync(tmpDir, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FONT_DIR = process.env.FONT_DIR || path.join(root, "tools/renderfonts");

const URL_TARGET = sweatFestProgram.canonicalUrl;
const W = 1080;

// --- QR geometry ---------------------------------------------------------------
// Error correction Q keeps the code robust on printed, sun-bleached signage.
const qr = QRCode.create(URL_TARGET, { errorCorrectionLevel: "Q" });
const size = qr.modules.size;
const bit = (r, c) => qr.modules.get(r, c);

// One <path> of all dark modules, drawn in a size x size unit grid.
let qrPath = "";
for (let r = 0; r < size; r++)
  for (let c = 0; c < size; c++)
    if (bit(r, c)) qrPath += `M${c} ${r}h1v1h-1z`;

// QR block at (x, y) sized to `px`, ink modules on a white plate with a
// quiet zone (the white margin QR readers require).
const qrBlock = (x, y, px, plate = true) => {
  const quiet = px / (size + 8); // 4 modules of quiet zone each side
  const scale = (px - quiet * 2) / size;
  return `
    ${plate ? `<rect x="${x}" y="${y}" width="${px}" height="${px}" rx="18" fill="#ffffff" stroke="${p.ink}" stroke-width="4"/>` : ""}
    <g transform="translate(${x + quiet} ${y + quiet}) scale(${scale})">
      <path d="${qrPath}" fill="${p.ink}"/>
    </g>`;
};

// --- Checker ring border (the logo's tile frame) -------------------------------
const tiles = [p.magenta, p.rosa, p.naranja, p.teal, p.verde];
const checkerRing = (h, t) => {
  let s = "";
  const step = t * 2;
  let i = 0;
  for (let x = 0; x < W; x += step, i++)
    for (const [j, y] of [0, h - t].entries())
      s += `<rect x="${x}" y="${y}" width="${step}" height="${t}" fill="${tiles[(i + j * 2) % tiles.length]}"/>`;
  i = 1;
  for (let y = t; y < h - t; y += step, i++)
    for (const [j, x] of [0, W - step].entries())
      s += `<rect x="${x}" y="${y}" width="${step}" height="${step}" fill="${tiles[(i + j * 3) % tiles.length]}"/>`;
  return `<g>${s}</g>`;
};

const sparkle = (cx, cy, r, fill) =>
  `<path d="M ${cx} ${cy - r} L ${cx + r * 0.28} ${cy - r * 0.28} L ${cx + r} ${cy} L ${cx + r * 0.28} ${cy + r * 0.28} L ${cx} ${cy + r} L ${cx - r * 0.28} ${cy + r * 0.28} L ${cx - r} ${cy} L ${cx - r * 0.28} ${cy - r * 0.28} Z" fill="${fill}"/>`;

// --- Card art ------------------------------------------------------------------
const card = (h) => {
  const story = h > 1400;
  let s = `<rect width="${W}" height="${h}" fill="${p.honeydew}"/>`;
  s += checkerRing(h, story ? 56 : 48);

  const cy = h / 2;
  const qrPx = story ? 560 : 520;
  const yTop = story ? cy - 560 : 150;

  s += `<text x="${W / 2}" y="${yTop}" text-anchor="middle" font-family="'Filson Soft', Rubik, sans-serif" font-weight="800" font-size="26" letter-spacing="6" fill="${p.naranja}">SATURDAY, AUGUST 22 · 18TH &amp; PEORIA</text>`;
  s += `<text x="${W / 2}" y="${yTop + 118}" text-anchor="middle" font-family="'Hello Baddie', 'Filson Soft', sans-serif" font-size="118" fill="${p.verde}">SWEAT FEST</text>`;
  s += `<text x="${W / 2}" y="${yTop + 214}" text-anchor="middle" font-family="'Hello Baddie', 'Filson Soft', sans-serif" font-size="86" fill="${p.magenta}">PROGRAM</text>`;

  const qrY = yTop + 268;
  s += qrBlock((W - qrPx) / 2, qrY, qrPx);

  const yScan = qrY + qrPx + 84;
  s += sparkle(W / 2 - 300, yScan - 16, 14, p.magenta);
  s += `<text x="${W / 2}" y="${yScan}" text-anchor="middle" font-family="'Hello Baddie', 'Filson Soft', sans-serif" font-size="58" fill="${p.ink}">SCAN FOR THE PROGRAM</text>`;
  s += sparkle(W / 2 + 300, yScan - 16, 14, p.magenta);
  s += `<text x="${W / 2}" y="${yScan + 56}" text-anchor="middle" font-family="'Filson Soft', Rubik, sans-serif" font-weight="800" font-size="27" fill="${p.ink}">Schedule · Map · Packing list · Getting here</text>`;
  s += `<text x="${W / 2}" y="${yScan + 104}" text-anchor="middle" font-family="Rubik, sans-serif" font-weight="600" font-size="24" fill="${p.ink}" opacity="0.75">latinasweatproject.com/sweatfest/program</text>`;

  return `<svg viewBox="0 0 ${W} ${h}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
};

// --- Render --------------------------------------------------------------------
const fontFace = (family, file, format, weight = 400) => `
  @font-face { font-family: "${family}"; src: url("file://${file}") format("${format}"); font-weight: ${weight}; }`;
const siteFont = (f) => path.join(root, "public/fonts", f);
const css = `
  ${fontFace("Hello Baddie", siteFont("hello-baddie.woff2"), "woff2")}
  ${fontFace("Filson Soft", siteFont("filson-soft-700.woff2"), "woff2", 700)}
  ${fontFace("Filson Soft", siteFont("filson-soft-800.woff2"), "woff2", 800)}
  ${fontFace("Rubik", path.join(FONT_DIR, "Rubik.ttf"), "truetype")}
  html, body { margin: 0; padding: 0; }
  svg { display: block; width: 100vw; height: 100vh; }
`;

// Plain QR for print layouts: ink modules, white ground, generous quiet zone.
await QRCode.toFile(
  path.join(outDir, "qr-plain.png"),
  URL_TARGET,
  {
    errorCorrectionLevel: "Q",
    width: 2048,
    margin: 4,
    color: { dark: p.ink, light: "#ffffff" },
  },
);
console.log("rendered qr-plain.png");

for (const { h, sub } of [
  { h: 1350, sub: "" },
  { h: 1920, sub: "story" },
]) {
  const base = sub ? "story-program-qr-card" : "program-qr-card";
  const htmlPath = path.join(tmpDir, `${base}.html`);
  const pngPath = path.join(tmpDir, `${base}.png`);
  writeFileSync(
    htmlPath,
    `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${card(h)}</body></html>`,
  );
  execFileSync(CHROME, [
    "--headless=new",
    `--screenshot=${pngPath}`,
    `--window-size=${W},${h}`,
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    "--virtual-time-budget=6000",
    "--disable-gpu",
    `file://${htmlPath}`,
  ]);
  await sharp(pngPath)
    .jpeg({ quality: 92 })
    .toFile(path.join(outDir, sub, "program-qr-card.jpg"));
  console.log(`rendered ${sub ? sub + "/" : ""}program-qr-card.jpg`);
}
console.log("wrote", outDir);
