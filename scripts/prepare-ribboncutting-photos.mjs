// Web derivatives for /ribboncutting.
//
// Reads the photo list from src/data/ribbonCutting.js (story photos, video
// posters and the hero), takes each edited full-resolution JPEG from
// marketing/ribbon-cutting/photos-edited/<id>.jpg (read only; the hero may
// point anywhere via ribbonCuttingHero.source), and writes:
//   public/images/ribbon-cutting/<id>-<width>.webp   (PHOTO_WIDTHS; the hero gets HERO_WIDTHS)
//   src/data/ribbonCuttingPhotoSizes.json           ({ id: [width, height] } after rotation)
//
// EXIF orientation is applied (sharp .rotate()), colour is converted to sRGB
// with a small sRGB profile attached, and every other piece of metadata (GPS,
// camera, dates) is dropped. Never enlarges. Existing files are skipped unless
// --force is passed, so re-running after a data change only adds what is new.
//
// Usage: nice -n 10 node scripts/prepare-ribboncutting-photos.mjs [--force]
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
sharp.concurrency(2);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = await import(pathToFileURL(path.join(ROOT, "src/data/ribbonCutting.js")).href);
const { ribbonCuttingHero: HERO, ribbonCuttingPhotoIds, PHOTO_WIDTHS, HERO_WIDTHS, PHOTO_DIR } = data;

const SRC_DIR = path.join(ROOT, "marketing/ribbon-cutting/photos-edited");
const OUT_DIR = path.join(ROOT, "public", PHOTO_DIR);
const SIZES = path.join(ROOT, "src/data/ribbonCuttingPhotoSizes.json");
const FORCE = process.argv.includes("--force");
mkdirSync(OUT_DIR, { recursive: true });

const jobs = [
  { id: HERO.id, src: path.join(ROOT, HERO.source), widths: HERO_WIDTHS, quality: 78 },
  ...ribbonCuttingPhotoIds()
    .filter((id) => id !== HERO.id)
    .map((id) => ({ id, src: path.join(SRC_DIR, `${id}.jpg`), widths: PHOTO_WIDTHS, quality: 74 })),
];

const sizes = {};
let wrote = 0;
for (const job of jobs) {
  if (!existsSync(job.src)) throw new Error(`missing source for ${job.id}: ${job.src}`);
  const meta = await sharp(job.src).metadata();
  const swap = (meta.orientation ?? 1) >= 5;
  const W = swap ? meta.height : meta.width;
  const H = swap ? meta.width : meta.height;
  sizes[job.id] = [W, H];
  for (const w of job.widths) {
    const out = path.join(OUT_DIR, `${job.id}-${w}.webp`);
    if (!FORCE && existsSync(out)) continue;
    await sharp(job.src)
      .rotate()
      .resize({ width: Math.min(w, W), withoutEnlargement: true, kernel: "lanczos3" })
      .toColorspace("srgb")
      .withIccProfile("srgb")
      .webp({ quality: job.quality, effort: 5, smartSubsample: true })
      .toFile(out);
    wrote++;
  }
  process.stdout.write(`${job.id} ${W}x${H}\n`);
}

writeFileSync(SIZES, JSON.stringify(sizes, null, 2) + "\n");
const total = readdirSync(OUT_DIR).filter((f) => f.endsWith(".webp")).reduce((n, f) => n + statSync(path.join(OUT_DIR, f)).size, 0);
console.log(`${jobs.length} photos, ${wrote} files written, ${(total / 1048576).toFixed(1)} MB in ${path.relative(ROOT, OUT_DIR)}`);
