// Render the photo-booth frame overlays for /photobooth. Each PNG is a full
// canvas with a transparent photo window (geometry from src/data/photobooth.js,
// punched with an even-odd fill path) so the client app can composite the
// guest's photo underneath entirely on-device.
//
// Usage:  node scripts/render-photobooth-frames.mjs
// Output: public/images/photobooth/frame-{design}-{ratio}.png
//
// Chrome renders the SVG (for woff2 brand fonts); --default-background-color
// keeps the screenshot's alpha channel. Didot resolves from macOS system
// fonts, matching the gala "dramatic dark" look.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  PHOTOBOOTH_RATIOS,
  PHOTOBOOTH_FRAMES,
  photoWindow,
} from "../src/data/photobooth.js";
import {
  horizontalLogoSvg,
  horizontalLogoSize,
} from "../src/data/sweatFestLogos.js";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public/images/photobooth");
const tmpDir = path.join(root, ".photobooth-render-tmp");
mkdirSync(tmpDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const fileUrl = (file) => `file://${encodeURI(file)}`;
const siteFont = (file) => path.join(root, "public/fonts", file);
const fontFace = (family, file, format, weight = 400) => `
  @font-face {
    font-family: "${family}";
    src: url("${fileUrl(file)}") format("${format}");
    font-weight: ${weight};
  }`;

const css = `
  ${fontFace("Hello Baddie", siteFont("hello-baddie.woff2"), "woff2")}
  ${fontFace("Filson Soft", siteFont("filson-soft-400.woff2"), "woff2", 400)}
  ${fontFace("Filson Soft", siteFont("filson-soft-700.woff2"), "woff2", 700)}
  ${fontFace("Filson Soft", siteFont("filson-soft-800.woff2"), "woff2", 800)}
  ${fontFace("Rubik", path.join(root, "tools/renderfonts/Rubik.ttf"), "truetype")}
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; width: 100vw; height: 100vh; }
`;

// Clockwise rounded-rect subpath; combined with the outer canvas rect under
// fill-rule="evenodd" it punches the transparent photo window.
const rr = (x, y, w, h, r) =>
  `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} ` +
  `a${r},${r} 0 0 1 -${r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 -${r},-${r} ` +
  `v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},-${r} z`;

const punchedField = (W, H, win, fillAttr) =>
  `<path fill-rule="evenodd" ${fillAttr}
     d="M0,0 h${W} v${H} h-${W} z ${rr(win.x, win.y, win.w, win.h, win.r)}"/>`;

const windowStroke = (win, color, width) =>
  `<rect x="${win.x}" y="${win.y}" width="${win.w}" height="${win.h}"
     rx="${win.r}" fill="none" stroke="${color}" stroke-width="${width}"/>`;

const diamond = (cx, cy, s, fill) =>
  `<rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}"
     fill="${fill}" transform="rotate(45 ${cx} ${cy})"/>`;

const centered = (cx, y, text, attrs) =>
  `<text x="${cx}" y="${y}" text-anchor="middle" ${attrs}>${text}</text>`;

const tilted = (cx, cy, angle, inner) =>
  `<g transform="rotate(${angle} ${cx} ${cy})">${inner}</g>`;

// Four-point "champagne" sparkle.
const sparkle = (cx, cy, r, fill, opacity = 1) =>
  `<path d="M ${cx} ${cy - r} L ${cx + r * 0.22} ${cy - r * 0.22} L ${cx + r} ${cy}
     L ${cx + r * 0.22} ${cy + r * 0.22} L ${cx} ${cy + r} L ${cx - r * 0.22} ${cy + r * 0.22}
     L ${cx - r} ${cy} L ${cx - r * 0.22} ${cy - r * 0.22} Z" fill="${fill}" opacity="${opacity}"/>`;

// Fixed-position confetti squares: [x, y, size, rotation, color]
const confetti = (cells) =>
  cells
    .map(
      ([x, y, s, rot, c]) =>
        `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${c}"
       transform="rotate(${rot} ${x + s / 2} ${y + s / 2})"/>`,
    )
    .join("");

// ---------------------------------------------------------------------------
// Studio classic: cream field, gold window, ringed logo up top, CTA pill.
// ---------------------------------------------------------------------------
function buildStudio({ W, H, win, ratioId }) {
  const cx = W / 2;
  // Truly transparent studio mark (logo2.png carries an opaque white field).
  const logo = fileUrl(path.join(root, "public/images/lsp-studio-logo.png"));
  const logoH = Math.min(win.y - 44, 168);
  const logoY = (win.y - logoH) / 2;
  const band = H - (win.y + win.h);
  const bandTop = win.y + win.h;
  let bottom;
  if (ratioId === "story") {
    // Stories are personal: the guest speaks in first person, sticker-style.
    const bannerY = bandTop + band * 0.36;
    const bannerW = 790;
    const bannerH = 66;
    const pillY = bandTop + band * 0.66;
    const pillW = 680;
    const pillH = 54;
    bottom = `
  ${diamond(cx - 448, bannerY, 12, "#ffbd59")}
  ${diamond(cx + 448, bannerY, 12, "#ffbd59")}
  ${tilted(
    cx,
    bannerY,
    -3,
    `<rect x="${cx - bannerW / 2}" y="${bannerY - bannerH / 2}" width="${bannerW}" height="${bannerH}" rx="18" fill="#1E1E1E"/>
  ${centered(cx, bannerY + 11, "I JUST FINISHED CLASS AT LSP", `font-family="Rubik" font-weight="800" font-size="32" fill="#FFFFFF"`)}`,
  )}
  <rect x="${cx - pillW / 2}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="#ffbd59"/>
  ${centered(cx, pillY + pillH / 2 + 9, "@latinasweatproject · latinasweatproject.com", `font-family="Rubik" font-weight="800" font-size="26" fill="#1E1E1E"`)}`;
  } else {
    // Feed formats live on the profile grid: keep the timeless brand line.
    const line1Y = bandTop + band * 0.38;
    const pillY = bandTop + band * 0.6;
    const pillW = 660;
    const pillH = 56;
    bottom = `
  ${diamond(cx - 428, line1Y - 9, 13, "#ffbd59")}
  ${diamond(cx + 428, line1Y - 9, 13, "#ffbd59")}
  ${centered(cx, line1Y, "MOVEMENT, CULTURE &amp; COMUNIDAD · PILSEN, CHICAGO", `font-family="Rubik" font-weight="700" font-size="25" letter-spacing="1.5" fill="#1E1E1E"`)}
  <rect x="${cx - pillW / 2}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="#ffbd59"/>
  ${centered(cx, pillY + pillH / 2 + 9, "@latinasweatproject · latinasweatproject.com", `font-family="Rubik" font-weight="800" font-size="25" fill="#1E1E1E"`)}`;
  }
  return `
  ${punchedField(W, H, win, 'fill="#FDF2F2"')}
  ${windowStroke(win, "#ffbd59", 6)}
  <image href="${logo}" x="${cx - logoH / 2}" y="${logoY}" width="${logoH}" height="${logoH}"/>
  ${bottom}`;
}

// ---------------------------------------------------------------------------
// Sweat Fest: honeydew field, ink checker strips, horizontal lockup.
// ---------------------------------------------------------------------------
function checkerStrip(W, y, rows, size) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < Math.ceil(W / size); c++) {
      if ((r + c) % 2 === 0) {
        cells.push(
          `<rect x="${c * size}" y="${y + r * size}" width="${size}" height="${size}" fill="#1e1e1e"/>`,
        );
      }
    }
  }
  return cells.join("");
}

function buildSweatfest({ W, H, win, ratioId }) {
  const cx = W / 2;
  const checker = 24;
  const stripH = checker * 2;
  const logoAspect = horizontalLogoSize.width / horizontalLogoSize.height;
  const logoH = Math.min(win.y - stripH - 36, 220);
  const logoW = logoH * logoAspect;
  const logoY = stripH + (win.y - stripH - logoH) / 2;
  const logoSvg = horizontalLogoSvg.replace(
    "<svg ",
    `<svg x="${cx - logoW / 2}" y="${logoY}" width="${logoW}" height="${logoH}" `,
  );
  const band = H - (win.y + win.h) - stripH;
  const bandTop = win.y + win.h;
  const line1Y = bandTop + band * 0.42;
  const line2Y = bandTop + band * (band > 180 ? 0.68 : 0.78);
  let text;
  let extras = "";
  if (ratioId === "story") {
    // Personal invite in the fest's own hand, with confetti in the margins
    // (the logo owns the top band's center, so cells hug the sides).
    text = `
  ${tilted(cx, line1Y, -3, centered(cx, line1Y + 16, "Join me at Sweat Fest!", `font-family="Hello Baddie" font-size="58" fill="#ee3083"`))}
  ${centered(cx, line2Y + 12, "SAT, AUG 22, 2026 · CHICAGO · @latinasweatproject", `font-family="Filson Soft" font-weight="700" font-size="24" letter-spacing="1" fill="#1e1e1e"`)}`;
    extras = confetti([
      [80, 120, 20, 15, "#ee3083"],
      [124, 232, 14, -20, "#00a7ab"],
      [62, 300, 16, 30, "#f15b27"],
      [948, 110, 18, -15, "#60a444"],
      [988, 222, 14, 25, "#f6a9c8"],
      [930, 302, 20, -30, "#00a7ab"],
      [90, bandTop + 36, 16, 20, "#f15b27"],
      [140, bandTop + 122, 20, -15, "#ee3083"],
      [920, bandTop + 32, 18, -25, "#60a444"],
      [962, bandTop + 126, 14, 15, "#00a7ab"],
    ]);
  } else {
    text = `
  ${centered(cx, line1Y, "SAT, AUGUST 22, 2026 · CHICAGO", `font-family="Filson Soft" font-weight="800" font-size="34" letter-spacing="2" fill="#ee3083"`)}
  ${centered(cx, line2Y, "@latinasweatproject · latinasweatproject.com", `font-family="Filson Soft" font-weight="700" font-size="26" letter-spacing="1" fill="#1e1e1e"`)}`;
  }
  return `
  ${punchedField(W, H, win, 'fill="#e2ecac"')}
  ${checkerStrip(W, 0, 2, checker)}
  ${checkerStrip(W, H - stripH, 2, checker)}
  ${windowStroke(win, "#1e1e1e", 5)}
  ${logoSvg}
  ${text}
  ${extras}`;
}

// ---------------------------------------------------------------------------
// Annual Gala: dramatic dark gradient, gold hairlines, Didot.
// ---------------------------------------------------------------------------
function buildGala({ W, H, win, ratioId }) {
  const cx = W / 2;
  const band = H - (win.y + win.h);
  const bandTop = win.y + win.h;
  const line1Y = bandTop + band * 0.42;
  const line2Y = bandTop + band * (band > 220 ? 0.62 : 0.72);
  let bottomText;
  let extras = "";
  if (ratioId === "story") {
    // A personal invitation with the ask attached: attendees do the selling.
    bottomText = `
  ${sparkle(cx - 310, line1Y - 14, 15, "#FFBD59")}
  ${sparkle(cx + 310, line1Y - 14, 15, "#FFBD59")}
  ${centered(cx, line1Y, "Meet me at the Gala", `font-family="Didot" font-style="italic" font-size="44" fill="#FFBD59"`)}
  ${centered(cx, bandTop + band * 0.66, "Support LSP's mission · Sept 25 · MCA Chicago", `font-family="Didot" font-size="24" letter-spacing="2" fill="#FFF8EF"`)}
  ${centered(cx, bandTop + band * 0.82, "tickets at latinasweatproject.com/gala", `font-family="Didot" font-size="23" letter-spacing="2" fill="#F2E4D2" opacity="0.9"`)}`;
    extras = `
  ${sparkle(84, 140, 10, "#FFBD59", 0.9)}
  ${sparkle(1000, 118, 12, "#FFBD59", 0.9)}
  ${sparkle(952, 208, 7, "#FFBD59", 0.7)}
  ${sparkle(120, 1876, 8, "#FFBD59", 0.7)}
  ${sparkle(962, 1868, 10, "#FFBD59", 0.9)}`;
  } else {
    bottomText = `
  ${centered(cx, line1Y, "SEPT 25, 2026 · MCA CHICAGO", `font-family="Didot" font-size="30" letter-spacing="4" fill="#FFBD59"`)}
  ${centered(cx, line2Y, "@latinasweatproject", `font-family="Didot" font-size="26" letter-spacing="3" fill="#FFF8EF"`)}`;
  }
  const titleY = win.y * 0.47;
  const nameY = win.y * 0.78;
  return `
  <defs>
    <linearGradient id="galaBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#080B11"/>
      <stop offset="0.5" stop-color="#121C2A"/>
      <stop offset="1" stop-color="#03050A"/>
    </linearGradient>
  </defs>
  ${punchedField(W, H, win, 'fill="url(#galaBg)"')}
  <rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="#FFBD59" stroke-width="2" opacity="0.8"/>
  <rect x="32" y="32" width="${W - 64}" height="${H - 64}" fill="none" stroke="#FFBD59" stroke-width="1" opacity="0.45"/>
  ${windowStroke(win, "#FFBD59", 3)}
  ${centered(cx, titleY, "THE LATINA SWEAT PROJECT", `font-family="Didot" font-size="26" letter-spacing="7" fill="#FFF8EF"`)}
  ${diamond(cx - 268, nameY - 14, 11, "#FFBD59")}
  ${diamond(cx + 268, nameY - 14, 11, "#FFBD59")}
  ${centered(cx, nameY, "Annual Gala 2026", `font-family="Didot" font-style="italic" font-size="52" fill="#FFBD59"`)}
  ${bottomText}
  ${extras}`;
}

// ---------------------------------------------------------------------------
// Full-bleed "stamp" overlays: the photo fills the canvas; branding sits on
// translucent scrim cards. Faces in mirror selfies sit center-to-lower, so
// the logo card stays in the top band and the info pill hugs the very
// bottom edge.
// ---------------------------------------------------------------------------
const scrimCard = (x, y, w, h, r, fill, opacity, stroke = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"
     fill="${fill}" opacity="${opacity}" ${stroke}/>`;

function buildStudioStamp({ W, H, ratioId }) {
  const cx = W / 2;
  const logo = fileUrl(path.join(root, "public/images/lsp-studio-logo.png"));
  const cardW = 430;
  const cardH = 208;
  const cardY = 52;
  const logoH = 118;
  const pillW = 640;
  const pillH = 56;
  const pillY = H - pillH - 40;
  return `
  ${scrimCard(cx - cardW / 2, cardY, cardW, cardH, 26, "#FFF8EF", 0.82)}
  <image href="${logo}" x="${cx - logoH / 2}" y="${cardY + 22}" width="${logoH}" height="${logoH}"/>
  ${centered(cx, cardY + cardH - 32, "@latinasweatproject", `font-family="Rubik" font-weight="800" font-size="28" fill="#1E1E1E"`)}
  ${scrimCard(cx - pillW / 2, pillY, pillW, pillH, pillH / 2, "#1E1E1E", 0.55)}
  ${centered(cx, pillY + pillH / 2 + 8, ratioId === "story" ? "COME SWEAT WITH ME · LATINASWEATPROJECT.COM" : "latinasweatproject.com · Pilsen, Chicago", `font-family="Rubik" font-weight="700" font-size="24" fill="#FFFFFF"`)}`;
}

function buildSweatfestStamp({ W, H, ratioId }) {
  const cx = W / 2;
  const logoAspect = horizontalLogoSize.width / horizontalLogoSize.height;
  const logoH = 170;
  const logoW = logoH * logoAspect;
  const cardW = logoW + 56;
  const cardH = logoH + 44;
  const cardY = 52;
  const logoSvg = horizontalLogoSvg.replace(
    "<svg ",
    `<svg x="${cx - logoW / 2}" y="${cardY + 22}" width="${logoW}" height="${logoH}" `,
  );
  const pillW = 760;
  const pillH = 56;
  const pillY = H - pillH - 40;
  return `
  ${scrimCard(cx - cardW / 2, cardY, cardW, cardH, 24, "#e2ecac", 0.85)}
  ${logoSvg}
  ${scrimCard(cx - pillW / 2, pillY, pillW, pillH, pillH / 2, "#1e1e1e", 0.6)}
  ${centered(cx, pillY + pillH / 2 + 8, ratioId === "story" ? "COME FIND ME AT SWEAT FEST · SAT, AUG 22" : "SAT, AUG 22, 2026 · CHICAGO · @latinasweatproject", `font-family="Filson Soft" font-weight="700" font-size="25" letter-spacing="1" fill="#e2ecac"`)}`;
}

function buildGalaStamp({ W, H, ratioId }) {
  const cx = W / 2;
  const cardW = 560;
  const cardH = 170;
  const cardY = 52;
  const pillW = 720;
  const pillH = 56;
  const pillY = H - pillH - 40;
  return `
  ${scrimCard(cx - cardW / 2, cardY, cardW, cardH, 18, "#05070C", 0.6, 'stroke="#FFBD59" stroke-width="1.5"')}
  ${centered(cx, cardY + 64, "THE LATINA SWEAT PROJECT", `font-family="Didot" font-size="24" letter-spacing="6" fill="#FFF8EF"`)}
  ${diamond(cx - 218, cardY + 116, 9, "#FFBD59")}
  ${diamond(cx + 218, cardY + 116, 9, "#FFBD59")}
  ${centered(cx, cardY + 128, "Annual Gala 2026", `font-family="Didot" font-style="italic" font-size="46" fill="#FFBD59"`)}
  ${scrimCard(cx - pillW / 2, pillY, pillW, pillH, pillH / 2, "#05070C", 0.55)}
  ${centered(cx, pillY + pillH / 2 + 8, ratioId === "story" ? "Meet me at the Gala · tickets at latinasweatproject.com/gala" : "SEPT 25, 2026 · MCA CHICAGO · @latinasweatproject", `font-family="Didot" font-size="24" letter-spacing="2" fill="#FFBD59"`)}`;
}

const builders = {
  studio: buildStudio,
  "studio-stamp": buildStudioStamp,
  sweatfest: buildSweatfest,
  "sweatfest-stamp": buildSweatfestStamp,
  gala: buildGala,
  "gala-stamp": buildGalaStamp,
};

for (const frame of PHOTOBOOTH_FRAMES) {
  const build = builders[frame.id];
  if (!build) throw new Error(`No builder for frame "${frame.id}"`);
  for (const ratio of PHOTOBOOTH_RATIOS) {
    const { width: W, height: H } = ratio;
    const win = photoWindow(frame.id, ratio.id);
    const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${build({ W, H, win, ratioId: ratio.id })}</svg>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${svg}</body></html>`;
    const name = `frame-${frame.id}-${ratio.id}`;
    const htmlPath = path.join(tmpDir, `${name}.html`);
    const pngPath = path.join(tmpDir, `${name}.png`);
    writeFileSync(htmlPath, html);
    execFileSync(CHROME, [
      "--headless=new",
      `--screenshot=${pngPath}`,
      `--window-size=${W},${H}`,
      "--default-background-color=00000000",
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      "--virtual-time-budget=4000",
      "--disable-gpu",
      `file://${htmlPath}`,
    ]);
    await sharp(pngPath)
      .png({ compressionLevel: 9, palette: false })
      .toFile(path.join(outDir, `${name}.png`));
    console.log(`rendered ${name} (${W}x${H})`);
  }
}

rmSync(tmpDir, { recursive: true, force: true });
console.log("wrote", outDir);
