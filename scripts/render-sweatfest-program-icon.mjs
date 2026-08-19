// Sweat Fest program home-screen icon: the checkerboard identity as an app
// tile, used when someone saves /sweatfest/program to their phone's home
// screen (apple-touch-icon + web app manifest icons).
//
// Usage:  node scripts/render-sweatfest-program-icon.mjs
// Output: public/images/sweatfest/program-icon-{180,192,512}.png

import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { sweatFestPalette as p } from "../src/data/sweatFest.js";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public/images/sweatfest");
const tmpDir = path.join(root, ".sweatfest-render-tmp/program-icon");
mkdirSync(tmpDir, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const W = 512;
const tiles = [p.magenta, p.rosa, p.naranja, p.teal, p.verde];
const t = 52; // checker tile size
let checker = "";
let i = 0;
for (let x = 0; x < W; x += t, i++)
  for (const [j, y] of [0, W - t].entries())
    checker += `<rect x="${x}" y="${y}" width="${t}" height="${t}" fill="${tiles[(i + j * 2) % tiles.length]}"/>`;
i = 1;
for (let y = t; y < W - t; y += t, i++)
  for (const [j, x] of [0, W - t].entries())
    checker += `<rect x="${x}" y="${y}" width="${t}" height="${t}" fill="${tiles[(i + j * 3) % tiles.length]}"/>`;

const star = (cx, cy, r, fill) =>
  `<path d="M ${cx} ${cy - r} L ${cx + r * 0.28} ${cy - r * 0.28} L ${cx + r} ${cy} L ${cx + r * 0.28} ${cy + r * 0.28} L ${cx} ${cy + r} L ${cx - r * 0.28} ${cy + r * 0.28} L ${cx - r} ${cy} L ${cx - r * 0.28} ${cy - r * 0.28} Z" fill="${fill}"/>`;

const svg = `<svg viewBox="0 0 ${W} ${W}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${W}" fill="${p.honeydew}"/>
  ${checker}
  ${star(W / 2, 122, 26, p.magenta)}
  <text x="${W / 2}" y="248" text-anchor="middle" font-family="'Hello Baddie', 'Filson Soft', sans-serif" font-size="118" fill="${p.verde}">SWEAT</text>
  <text x="${W / 2}" y="366" text-anchor="middle" font-family="'Hello Baddie', 'Filson Soft', sans-serif" font-size="118" fill="${p.verde}">FEST</text>
  <text x="${W / 2}" y="426" text-anchor="middle" font-family="'Filson Soft', Rubik, sans-serif" font-weight="800" font-size="34" letter-spacing="6" fill="${p.magenta}">PROGRAM</text>
</svg>`;

const fontFace = (family, file, weight = 400) => `
  @font-face { font-family: "${family}"; src: url("file://${path.join(root, "public/fonts", file)}") format("woff2"); font-weight: ${weight}; }`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  ${fontFace("Hello Baddie", "hello-baddie.woff2")}
  ${fontFace("Filson Soft", "filson-soft-800.woff2", 800)}
  html, body { margin: 0; } svg { display: block; width: 100vw; height: 100vh; }
</style></head><body>${svg}</body></html>`;

const htmlPath = path.join(tmpDir, "icon.html");
const pngPath = path.join(tmpDir, "icon.png");
writeFileSync(htmlPath, html);
execFileSync(CHROME, [
  "--headless=new",
  `--screenshot=${pngPath}`,
  `--window-size=${W},${W}`,
  "--force-device-scale-factor=1",
  "--hide-scrollbars",
  "--virtual-time-budget=6000",
  "--disable-gpu",
  `file://${htmlPath}`,
]);

for (const size of [180, 192, 512]) {
  await sharp(pngPath)
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, `program-icon-${size}.png`));
  console.log(`rendered program-icon-${size}.png`);
}
