// Web derivatives for /givingtuesday. Source photos are LSP's own, already on
// the site; nobody in them is named or captioned.
//
//   public/images/story.jpeg (3500x2625, a full class on the mats, as on /about)
//     -> public/images/givingtuesday/class-{800,1400,2200}.webp
//
// The ribbon cutting group photo (public/images/ribbon-cutting/DSC09794-*.webp)
// and the graduation cohort photo (public/images/graduation/hero.jpg) are used
// as they are.
//
// Usage: node scripts/prepare-givingtuesday-photos.mjs
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/images/givingtuesday");
mkdirSync(OUT, { recursive: true });

const SRC = path.join(ROOT, "public/images/story.jpeg");
for (const w of [800, 1400, 2200]) {
  const file = path.join(OUT, `class-${w}.webp`);
  await sharp(SRC).rotate().resize({ width: w }).webp({ quality: w > 1400 ? 74 : 78 }).toFile(file);
  console.log("wrote", path.relative(ROOT, file));
}
