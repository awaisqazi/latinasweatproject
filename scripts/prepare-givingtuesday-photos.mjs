// Web derivatives for /givingtuesday. Source photos are LSP's own, already
// published on the site; nobody in them is named or captioned.
//
// Newest first (owner's note, Nov 17 2026): every photo on the hero wall and
// in the 2026 chapters of the timeline is from a 2026 gallery on the site.
// The page's photo list lives in src/data/givingTuesdayPhotos.js; this script
// only makes the LOCAL crops it points at. Sweat Fest 2026 and the colour
// Gala 2026 photos are served from the Flickr CDN, exactly as /sweatfest and
// /gala serve them, so they have no crops here.
//
//   Hero wall: 4:3 crops as public/images/givingtuesday/wall/<name>-{360,720}.webp
//   Timeline:  full frame as public/images/givingtuesday/story/<name>-{800,big}.webp
//              (big = 1400 wide, or the source width when smaller)
//
//   public/images/story.jpeg -> givingtuesday/class-{800,1400,2200}.webp is the
//   pre-redesign hero, unused by the page, kept so old links work.
//
// The join page uses the graduation cohort photo (public/images/graduation/
// hero.jpg) as it is.
//
// Usage: node scripts/prepare-givingtuesday-photos.mjs
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMG = path.join(ROOT, "public/images");
const OUT = path.join(IMG, "givingtuesday");
// LSP's team Drive picks (marketing/giving-tuesday-2026/drive-photos/, see
// picks.json there for each photo's folder, date and dateSource).
const DRIVE = path.join(ROOT, "marketing/giving-tuesday-2026/drive-photos/picks");
mkdirSync(path.join(OUT, "wall"), { recursive: true });
mkdirSync(path.join(OUT, "story"), { recursive: true });

const rel = (f) => path.relative(ROOT, f);

// The old hero derivatives.
const CLASS = path.join(IMG, "story.jpeg");
for (const w of [800, 1400, 2200]) {
  const file = path.join(OUT, `class-${w}.webp`);
  await sharp(CLASS).rotate().resize({ width: w }).webp({ quality: w > 1400 ? 74 : 78 }).toFile(file);
  console.log("wrote", rel(file));
}

// The hero's ONE photo, 4:3 at 480 and 960, cut from a portrait original:
// [name, file, top of the 4:3 band as a share of the height].
// Team bonding class, May 2026 (Drive folder "[PHOTO] Team Bonding May 26'").
const BANDS = [
  ["one", "2026-05_team-bonding-class_01.jpg", 0.42, [480, 960]],
  ["tb-class", "2026-05_team-bonding-class_02.jpg", 0.36, [360, 720]],
];
for (const [name, file, top, widths] of BANDS) {
  const src = path.join(DRIVE, file);
  const m = await sharp(src).metadata();
  const h = Math.round((m.width * 3) / 4);
  const t = Math.min(m.height - h, Math.round(m.height * top));
  for (const w of widths) {
    const out = path.join(OUT, "wall", `${name}-${w}.webp`);
    await sharp(src)
      .rotate()
      .extract({ left: 0, top: t, width: m.width, height: h })
      .resize({ width: w, height: Math.round((w * 3) / 4) })
      .webp({ quality: name === "one" ? 76 : 72 })
      .toFile(out);
    console.log("wrote", rel(out));
  }
}

// Hero wall, 4:3. [name, source under public/images, crop position]
// Events and dates: see src/data/givingTuesdayPhotos.js.
const WALL = [
  // Ribbon cutting at Mural Park, Nov 15 2026
  ["rc-crowd", "ribbon-cutting/IMG_5915-1600.webp", "south"],
  ["rc-everyone", "ribbon-cutting/DSC09794-1600.webp", "centre"],
  ["rc-friends", "ribbon-cutting/DSC09791-1600.webp", "centre"],
  // YTT graduation, Aug 7 2026
  ["grad-selfie", "graduation/g14.jpg", "centre"],
  // Día de los Muertos at La Villita Park, Oct 31 2026
  ["ddlm-catrinas", "ddlm/recap/hero-2400.webp", "centre"],
  ["ddlm-tent", "ddlm/recap/story/55623849576-1600.webp", "centre"],
  ["ddlm-mariachi", "ddlm/recap/story/55622849482-1600.webp", "centre"],
];
for (const [name, src, position] of WALL) {
  for (const w of [360, 720]) {
    const file = path.join(OUT, "wall", `${name}-${w}.webp`);
    await sharp(path.join(IMG, src))
      .rotate()
      .resize({ width: w, height: Math.round((w * 3) / 4), fit: "cover", position })
      .webp({ quality: 72 })
      .toFile(file);
    console.log("wrote", rel(file));
  }
}

// Timeline, full frame.
const STORY = [
  ["grad-cohort", "graduation/g15.jpg"], // YTT graduation, Aug 7 2026
  ["ddlm-class", "ddlm/recap/story/55624065799-1600.webp"], // Día de los Muertos, Oct 31 2026
  ["armsup", "ribbon-cutting/cut-04-arms-up-2400.webp"], // ribbon cutting, Nov 15 2026
  ["tt-2025", "../../marketing/giving-tuesday-2026/drive-photos/picks/2025_lsp-tt_01.jpg"], // teacher training 2025 (Drive folder "[VIDEO] 2025 LSP TT")
];
for (const [name, src] of STORY) {
  for (const [suffix, w] of [["800", 800], ["big", 1400]]) {
    const file = path.join(OUT, "story", `${name}-${suffix}.webp`);
    const info = await sharp(path.join(IMG, src))
      .rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: 74 })
      .toFile(file);
    console.log("wrote", rel(file), `${info.width}x${info.height}`);
  }
}
