// Instructor headshots for the /sweatfest run-of-show cards.
//
// Reads the team's photo drops from ~/Downloads, crops each to a 480x480
// square with sharp's attention strategy (manual crop windows carried over
// from render-sweatfest-instructors.mjs where attention picks the wrong
// region), and writes web-ready webp files keyed by sweatFestLineup id into
// public/images/sweatfest/instructors/. Also renders a labeled contact
// sheet into output/ for a visual crop check.
//
// Usage: node scripts/prepare-lineup-photos.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PHOTO_DIR = "/Users/fezqazi/Downloads/Instructor Photos and Details";
const outDir = path.join(root, "public/images/sweatfest/instructors");
const qaDir = path.join(root, "output/sweatfest-lineup-photos");
const tmpDir = path.join(root, ".sweatfest-render-tmp/lineup-photos");
mkdirSync(outDir, { recursive: true });
mkdirSync(qaDir, { recursive: true });
mkdirSync(tmpDir, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SIZE = 480;

// id -> source photo + optional manual crop window (fractions of the
// EXIF-rotated source), tuned in the Meet the Instructor carousel session.
const PHOTOS = [
  { id: "jays-power-hour", who: "Julio Peña", photo: "Julio P (LSP).jpg", crop: { left: 0, top: 0.24, width: 1, height: 0.71 } },
  { id: "yoga-party", who: "Josh Young", photo: "Josh Y.jpg" },
  { id: "slow-grow", who: "Greg Buford", photo: "Greg B.jpg" },
  { id: "hiit-pilates", who: "LIZLATES", photo: "Lizlates (LSP).jpg" },
  { id: "yoga-sculpt", who: "Jackie Terrazas", photo: "Jackie T.jpg", crop: { left: 0, top: 0.15, width: 1, height: 0.7985 } },
  { id: "full-body-strength", who: "Brookie Trinity", photo: "Brookie T.jpg" },
  // Wide gong-and-bowls scene: zoom to her upper body so the face reads at
  // avatar size.
  { id: "sound-bath-rhythm", who: "Courtney Olender", photo: "Courtney O.jpg", crop: { left: 0.1, top: 0, width: 0.55, height: 0.72 } },
  { id: "slow-burn", who: "Dr. Alyssa Perez", photo: "Dr. Alyssa P.jpg", crop: { left: 0.2, top: 0.32, width: 0.7, height: 0.67 } },
  { id: "yoga-flow", who: "Gerald Pinckney", photo: "Gerald P (LSP).jpg", crop: { left: 0, top: 0.21, width: 1, height: 0.71 } },
  { id: "yoga-para-todos", who: "Zoraida Magana", photo: "Zoraida M (LSP).jpg", crop: { left: 0.1, top: 0.11, width: 0.74, height: 0.716 } },
  { id: "mixxedfit", who: "Nana Sahagun", photo: "Nana S.jpg", crop: { left: 0, top: 0, width: 1, height: 0.55 } },
  { id: "restorative-sound-bath", who: "Kari Sanchez", photo: "Kari S (LSP).jpg" },
  { id: "banda-sculpt", who: "Veronica Quiñones", photo: "Veronica Q (LSP).jpg", crop: { left: 0, top: 0.22, width: 1, height: 0.71 } },
  // Busy class scene: tighten toward his face on the right.
  { id: "reset-release", who: "Paulo Colby", photo: "Paulo C.jpg", crop: { left: 0.28, top: 0.04, width: 0.55, height: 0.72 } },
  // Full-body dance shots: head-to-hip windows so faces match the other
  // avatars' scale.
  { id: "salsa-self-soul", who: "Maria Luisa Torres", photo: "Maria Luisa T.jpg", crop: { left: 0.15, top: 0, width: 0.7, height: 0.62 } },
  { id: "ring-ready-hiit", who: "Jeff Williams", photo: "Jeff W.jpg", crop: { left: 0.2, top: 0.02, width: 0.6, height: 0.52 } },
  { id: "mat-pilates", who: "Margarita Quiñones", photo: "Margarita Q (LSP).jpg", crop: { left: 0.22, top: 0.04, width: 0.565, height: 0.92 } },
  { id: "wobble-baby-wobble", who: "Krystal Fernandez", photo: "Krystal F (LSP).jpg", crop: { left: 0, top: 0.21, width: 1, height: 0.71 } },
];

async function processOne(t) {
  const src = path.join(PHOTO_DIR, t.photo);
  let img = sharp(src).rotate(); // honor EXIF first
  if (t.crop) {
    // metadata() reports pre-rotation pixels; swap axes when EXIF says the
    // image renders rotated 90/270.
    const meta = await sharp(src).metadata();
    const swapped = (meta.orientation || 1) >= 5;
    const sw = swapped ? meta.height : meta.width;
    const sh = swapped ? meta.width : meta.height;
    img = img.extract({
      left: Math.round(t.crop.left * sw),
      top: Math.round(t.crop.top * sh),
      width: Math.round(t.crop.width * sw),
      height: Math.round(t.crop.height * sh),
    });
  }
  await img
    .resize(SIZE, SIZE, { fit: "cover", position: sharp.strategy.attention })
    .webp({ quality: 80 })
    .toFile(path.join(outDir, `${t.id}.webp`));
  console.log(`wrote ${t.id}.webp (${t.who})`);
}

for (const t of PHOTOS) await processOne(t);

// --- Labeled contact sheet for crop QA ---------------------------------------
const cell = 300;
const label = 44;
const cols = 6;
const rows = Math.ceil(PHOTOS.length / cols);
const W = cols * cell;
const H = rows * (cell + label);
let s = `<rect width="${W}" height="${H}" fill="#f4f7dc"/>`;
PHOTOS.forEach((t, i) => {
  const x = (i % cols) * cell;
  const y = Math.floor(i / cols) * (cell + label);
  const uri = `file://${path.join(outDir, `${t.id}.webp`)}`;
  s += `<image href="${uri}" x="${x + 6}" y="${y + 6}" width="${cell - 12}" height="${cell - 12}"/>`;
  s += `<text x="${x + cell / 2}" y="${y + cell + 24}" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="20" fill="#123f36">${t.who.replace(/&/g, "&amp;")}</text>`;
});
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}svg{display:block}</style></head><body><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${s}</svg></body></html>`;
const htmlPath = path.join(tmpDir, "contact.html");
writeFileSync(htmlPath, html);
execFileSync(CHROME, [
  "--headless=new",
  `--screenshot=${path.join(tmpDir, "contact.png")}`,
  `--window-size=${W},${H}`,
  "--force-device-scale-factor=1",
  "--hide-scrollbars",
  "--virtual-time-budget=8000",
  "--disable-gpu",
  "--allow-file-access-from-files",
  `file://${htmlPath}`,
]);
await sharp(path.join(tmpDir, "contact.png"))
  .jpeg({ quality: 88 })
  .toFile(path.join(qaDir, "contact-sheet.jpg"));
console.log("contact sheet:", path.join(qaDir, "contact-sheet.jpg"));
