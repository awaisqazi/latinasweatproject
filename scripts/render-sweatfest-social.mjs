// Render the Sweat Fest social/OG share images from the same SVG
// compositions the site draws live (src/data/sweatFestPoster.js).
//
// The SVG is rendered in headless Chrome with the real webfonts, then
// post-processed with sharp. Chrome (rather than sharp's librsvg) so the
// self-hosted woff2 faces load the same way they do in the browser.
// Fonts: Hello Baddie + Filson Soft woff2 from public/fonts; Rubik TTF is
// looked up in FONT_DIR (defaults to the session scratchpad used when this
// was first run; pass FONT_DIR=/path env to override).
//
// Usage:  node scripts/render-sweatfest-social.mjs
// Output: public/images/sweatfest/sweatfest-social-v4.jpg   (1200x675 OG)
//         public/images/sweatfest/sweatfest-poster-v4.webp  (1080x1350)
//         public/images/sweatfest/sweatfest-card-v4.webp    (1080x1080)

import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildPosterSvg } from "../src/data/sweatFestPoster.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public/images/sweatfest");
const tmpDir = path.join(root, ".sweatfest-render-tmp");
mkdirSync(tmpDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FONT_DIR =
  process.env.FONT_DIR ||
  "/private/tmp/claude-501/-Users-fezqazi-Documents-Latina-Sweat-Project-Website-latinasweatproject/89c8c51f-e0f6-4de7-b080-a73569ab8cd4/scratchpad/renderfonts";

const fontFace = (family, file, format, weight = 400) => `
  @font-face {
    font-family: "${family}";
    src: url("file://${file}") format("${format}");
    font-weight: ${weight};
  }`;

const siteFont = (file) => path.join(root, "public/fonts", file);

const css = `
  ${fontFace("Hello Baddie", siteFont("hello-baddie.woff2"), "woff2")}
  ${fontFace("Filson Soft", siteFont("filson-soft-400.woff2"), "woff2", 400)}
  ${fontFace("Filson Soft", siteFont("filson-soft-500.woff2"), "woff2", 500)}
  ${fontFace("Filson Soft", siteFont("filson-soft-700.woff2"), "woff2", 700)}
  ${fontFace("Filson Soft", siteFont("filson-soft-800.woff2"), "woff2", 800)}
  ${fontFace("Rubik", path.join(FONT_DIR, "Rubik.ttf"), "truetype")}
  html, body { margin: 0; padding: 0; }
  svg { display: block; width: 100vw; height: 100vh; }
`;

const shots = [
  // OG/social card (16:9): capture at 2x-ish then downsize for crispness.
  { variant: "landscape", w: 1600, h: 900 },
  { variant: "portrait", w: 1080, h: 1350 },
  { variant: "square", w: 1080, h: 1080 },
];

for (const { variant, w, h } of shots) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body>${buildPosterSvg(variant)}</body></html>`;
  const htmlPath = path.join(tmpDir, `${variant}.html`);
  const pngPath = path.join(tmpDir, `${variant}.png`);
  writeFileSync(htmlPath, html);
  execFileSync(CHROME, [
    "--headless=new",
    `--screenshot=${pngPath}`,
    `--window-size=${w},${h}`,
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    "--virtual-time-budget=4000",
    "--disable-gpu",
    `file://${htmlPath}`,
  ]);
  console.log(`rendered ${variant} at ${w}x${h}`);
}

await sharp(path.join(tmpDir, "landscape.png"))
  .resize(1200, 675)
  .jpeg({ quality: 88 })
  .toFile(path.join(outDir, "sweatfest-social-v4.jpg"));
await sharp(path.join(tmpDir, "portrait.png"))
  .webp({ quality: 90 })
  .toFile(path.join(outDir, "sweatfest-poster-v4.webp"));
await sharp(path.join(tmpDir, "square.png"))
  .webp({ quality: 90 })
  .toFile(path.join(outDir, "sweatfest-card-v4.webp"));
console.log("wrote", outDir);
