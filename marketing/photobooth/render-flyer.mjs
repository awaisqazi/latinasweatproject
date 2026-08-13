// 8.5x11 print flyer for the selfie-mirror photo booth (QR + steps + real
// frame previews + die-cut stickers). Studio daytime look. Outputs a 300dpi
// PNG and a Letter-size print PDF next to this script.
//
// Usage:  node marketing/photobooth/render-flyer.mjs
// Re-run after the frame lineup changes (frames render via
// scripts/render-photobooth-frames.mjs; catalog in src/data/photobooth.js).
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const require = createRequire(import.meta.url);
const sharp = require(path.join(root, "node_modules/sharp"));

const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = 1275,
  H = 1650; // 8.5x11 at 150dpi, captured at 2x = 300dpi
const cx = W / 2;

const f = (p) => `file://${encodeURI(p)}`;
const site = (p) => f(path.join(root, p));
const logo = site("public/images/lsp-studio-logo.png");
const qr = f(path.join(here, "photobooth-qr.png"));
const frame = (id) => site(`public/images/photobooth/frame-${id}-story.png`);
const sticker = (n) => site(`public/images/photobooth/stickers/${n}.png`);

const css = `
  @font-face { font-family: "Rubik"; src: url("${site("tools/renderfonts/Rubik.ttf")}") format("truetype"); }
  @page { size: 8.5in 11in; margin: 0; }
  html, body { margin: 0; padding: 0; }
  svg { display: block; width: 100vw; height: 100vh; }
`;

// Mini frame preview: soft photo-ish gradient behind the transparent window,
// then the real story overlay on top.
const mini = (id, x, y, w, tilt) => {
  const h = (w * 1920) / 1080;
  return `
  <g transform="rotate(${tilt} ${x + w / 2} ${y + h / 2})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="url(#photoish)"/>
    <image href="${frame(id)}" x="${x}" y="${y}" width="${w}" height="${h}"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="none" stroke="#1E1E1E" stroke-opacity="0.12" stroke-width="2"/>
  </g>`;
};

const step = (y, n, text) => `
  <circle cx="620" cy="${y - 10}" r="23" fill="#ffbd59"/>
  <text x="620" y="${y - 1}" text-anchor="middle" font-family="Rubik" font-weight="800" font-size="26" fill="#1E1E1E">${n}</text>
  <text x="660" y="${y}" font-family="Rubik" font-weight="500" font-size="28" fill="#1E1E1E">${text}</text>`;

const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="photoish" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c9b8d8"/>
      <stop offset="0.5" stop-color="#e8c9a0"/>
      <stop offset="1" stop-color="#b8d8cf"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#FDF2F2"/>
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" fill="none" stroke="#ffbd59" stroke-width="5" rx="22"/>

  <image href="${logo}" x="${cx - 74}" y="66" width="148" height="148"/>
  <rect x="${cx - 150}" y="238" width="300" height="46" rx="23" fill="#ffbd59"/>
  <text x="${cx}" y="269" text-anchor="middle" font-family="Rubik" font-weight="800" font-size="23" letter-spacing="3" fill="#1E1E1E">STRIKE A POSE</text>

  <text x="${cx}" y="366" text-anchor="middle" font-family="Rubik" font-weight="800" font-size="64" fill="#1E1E1E">Mirror selfie?</text>
  <text x="${cx}" y="442" text-anchor="middle" font-family="Rubik" font-weight="800" font-size="64" fill="#1E1E1E">Make it LSP official.</text>

  ${mini("studio", 214, 500, 240, -3)}
  ${mini("sweatfest", 518, 492, 240, 0)}
  ${mini("gala", 822, 500, 240, 3)}

  <image href="${sticker("sparkle")}" x="128" y="486" width="120" height="120" transform="rotate(-12 188 546)"/>
  <image href="${sticker("checker")}" x="96" y="826" width="170" height="68" transform="rotate(-8 181 860)"/>
  <image href="${sticker("diamond")}" x="1042" y="512" width="104" height="104" transform="rotate(14 1094 564)"/>
  <image href="${sticker("sweatfest")}" x="1000" y="812" width="190" height="57" transform="rotate(9 1095 840)"/>
  <text x="180" y="700" font-family="Rubik" font-size="56" transform="rotate(-10 180 700)">🔥</text>
  <text x="1082" y="712" font-family="Rubik" font-size="56" transform="rotate(12 1082 712)">💛</text>

  <text x="${cx}" y="988" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="28" fill="#555555">Frames for every day, Sweat Fest &amp; the Gala · your words · stickers</text>

  <rect x="90" y="1030" width="1095" height="380" rx="26" fill="#FFFFFF" stroke="#1E1E1E" stroke-width="3"/>
  <image href="${qr}" x="150" y="1058" width="280" height="280"/>
  <rect x="150" y="1058" width="280" height="280" fill="none" stroke="#ffbd59" stroke-width="4" rx="6"/>
  ${step(1112, "1", "Scan the code")}
  ${step(1178, "2", "Pick your mirror selfie")}
  ${step(1244, "3", "Frame it · stickers · your words")}
  ${step(1310, "4", "Post it and tag us")}
  <line x1="150" y1="1352" x2="1125" y2="1352" stroke="#1E1E1E" stroke-opacity="0.12" stroke-width="2"/>
  <text x="${cx}" y="1387" text-anchor="middle" font-family="Rubik" font-weight="500" font-size="25" fill="#555555">Prefer a link? <tspan font-weight="800" fill="#1E1E1E">latinasweatproject.com/photobooth</tspan></text>

  <rect x="${cx - 320}" y="1448" width="640" height="58" rx="29" fill="#1E1E1E"/>
  <text x="${cx}" y="1486" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="27" fill="#FFFFFF">@latinasweatproject · latinasweatproject.com</text>

  <text x="${cx}" y="1568" text-anchor="middle" font-family="Rubik" font-weight="500" font-size="23" fill="#555555">Your photo never leaves your phone. Frames on us.</text>
</svg>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${svg}</body></html>`;
const htmlPath = path.join(here, ".flyer-tmp.html");
const rawPath = path.join(here, ".flyer-raw.png");
writeFileSync(htmlPath, html);

execFileSync(CHROME, [
  "--headless=new",
  `--screenshot=${rawPath}`,
  `--window-size=${W},${H}`,
  "--force-device-scale-factor=2",
  "--hide-scrollbars",
  "--virtual-time-budget=6000",
  "--disable-gpu",
  f(htmlPath),
]);
await sharp(rawPath)
  .png({ compressionLevel: 9 })
  .toFile(path.join(here, "photobooth-flyer.png"));

execFileSync(CHROME, [
  "--headless=new",
  `--print-to-pdf=${path.join(here, "photobooth-flyer.pdf")}`,
  "--no-pdf-header-footer",
  "--virtual-time-budget=6000",
  "--disable-gpu",
  f(htmlPath),
]);
rmSync(htmlPath, { force: true });
rmSync(rawPath, { force: true });
console.log("wrote", path.join(here, "photobooth-flyer.{png,pdf}"));
