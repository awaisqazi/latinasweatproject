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
  whiteHorizontalLogoSvg,
  whiteHorizontalLogoSize,
} from "../src/data/sweatFestLogos.js";

// Sweat Fest logo palette (see sweatFestPalette in src/data/sweatFest.js);
// ink stays #1e1e1e to match the original fest frame in the same tray.
const P = {
  honeydew: "#e2ecac",
  paper: "#f4f7dc",
  ink: "#1e1e1e",
  night: "#123f36",
  magenta: "#ee3083",
  rosa: "#f6a9c8",
  naranja: "#f15b27",
  teal: "#00a7ab",
  verde: "#60a444",
};

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
// Pilsen "New chapter" campaign: gold announcement field, ink campaign
// banner. Turns story shares into visible support while LSP secures its
// next home (no sunset until the move lands).
// ---------------------------------------------------------------------------
function buildPilsen({ W, H, win, ratioId }) {
  const cx = W / 2;
  const logo = fileUrl(path.join(root, "public/images/lsp-studio-logo.png"));
  const logoH = Math.min(win.y - 44, 168);
  const logoY = (win.y - logoH) / 2;
  const band = H - (win.y + win.h);
  const bandTop = win.y + win.h;
  const story = ratioId === "story";
  const bannerY = bandTop + band * (story ? 0.36 : 0.38);
  const bannerW = 560;
  const bannerH = 68;
  const banner = `<rect x="${cx - bannerW / 2}" y="${bannerY - bannerH / 2}" width="${bannerW}" height="${bannerH}" rx="18" fill="#1E1E1E"/>
  ${centered(cx, bannerY + 12, "KEEP LSP IN PILSEN 💛", `font-family="Rubik" font-weight="800" font-size="34" fill="#FFFFFF"`)}`;
  const pillY = bandTop + band * (story ? 0.66 : 0.62);
  const pillW = 680;
  const pillH = 54;
  return `
  ${punchedField(W, H, win, 'fill="#FFBD59"')}
  ${windowStroke(win, "#FDF2F2", 6)}
  <image href="${logo}" x="${cx - logoH / 2}" y="${logoY}" width="${logoH}" height="${logoH}"/>
  ${diamond(cx - 330, bannerY, 12, "#1E1E1E")}
  ${diamond(cx + 330, bannerY, 12, "#1E1E1E")}
  ${story ? tilted(cx, bannerY, -2, banner) : banner}
  <rect x="${cx - pillW / 2}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="#FDF2F2"/>
  ${centered(cx, pillY + pillH / 2 + 9, "@latinasweatproject · latinasweatproject.com", `font-family="Rubik" font-weight="800" font-size="25" fill="#1E1E1E"`)}`;
}

// ---------------------------------------------------------------------------
// Sweat Fest: honeydew field, ink checker strips, horizontal lockup.
// Every fest design's info line carries the campaign call to action.
// ---------------------------------------------------------------------------
const CTA = "TICKETS AT LATINASWEATPROJECT.COM/SWEATFEST";
function checkerStrip(W, y, rows, size, color = "#1e1e1e") {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < Math.ceil(W / size); c++) {
      if ((r + c) % 2 === 0) {
        cells.push(
          `<rect x="${c * size}" y="${y + r * size}" width="${size}" height="${size}" fill="${color}"/>`,
        );
      }
    }
  }
  return cells.join("");
}

// The logo border's multicolor tile rhythm run out over a region: every cell
// gets a color, offset three steps per row so the colors interlock like the
// frame of the official mark.
const CHECKER_COLORS = [
  P.magenta,
  P.rosa,
  P.naranja,
  P.teal,
  P.verde,
  P.honeydew,
];
function multiChecker(W, H, size) {
  const cells = [];
  for (let r = 0; r < Math.ceil(H / size); r++) {
    for (let c = 0; c < Math.ceil(W / size); c++) {
      cells.push(
        `<rect x="${c * size}" y="${r * size}" width="${size}" height="${size}"
           fill="${CHECKER_COLORS[(c + r * 3) % CHECKER_COLORS.length]}"/>`,
      );
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
  ${centered(cx, line2Y + 12, `SAT, AUG 22 · ${CTA}`, `font-family="Filson Soft" font-weight="700" font-size="23" letter-spacing="1" fill="#1e1e1e"`)}`;
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
  ${centered(cx, line2Y, CTA, `font-family="Filson Soft" font-weight="700" font-size="25" letter-spacing="1" fill="#1e1e1e"`)}`;
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
// Fest Ticket: the whole export reads as a paper event ticket on a magenta
// field. Header up top, then a perforated stub under the photo declaring
// "ticket secured, meet me there": the campaign frame for ticket holders.
// ---------------------------------------------------------------------------
const BARCODE = [5, 2, 7, 3, 2, 6, 2, 4, 7, 2, 5, 3, 6, 2, 3, 7, 2, 5, 2, 6, 3, 4];

function buildSweatfestTicket({ W, H, win, ratioId }) {
  const cx = W / 2;
  const cardX = 40;
  const cardW = W - 80;
  const cardTop = win.y - 180;
  const cardBot = win.y + win.h + 240;
  const cardR = 26;
  // Ticket paper with the photo window punched out of it (evenodd over both
  // rounded subpaths), so the card never covers the guest photo.
  const card = `<path fill-rule="evenodd" fill="${P.paper}"
    d="${rr(cardX, cardTop, cardW, cardBot - cardTop, cardR)} ${rr(win.x, win.y, win.w, win.h, win.r)}"/>`;
  const perfY = win.y + win.h + 40;
  let barcode = "";
  let bx = cx - 180;
  for (const bw of BARCODE) {
    barcode += `<rect x="${bx}" y="${perfY + 148}" width="${bw}" height="44" fill="${P.ink}"/>`;
    bx += bw + 8;
  }
  const confettiCells =
    ratioId === "story"
      ? confetti([
          [120, cardTop + 40, 16, 20, P.teal],
          [930, cardTop + 52, 18, -18, P.verde],
          [86, H - 120, 18, 25, P.honeydew],
          [980, H - 132, 16, -20, P.naranja],
          [530, H - 90, 14, 12, P.teal],
        ])
      : "";
  return `
  ${punchedField(W, H, win, `fill="${P.magenta}"`)}
  ${card}
  <clipPath id="tixClip"><rect x="${cardX}" y="${cardTop}" width="${cardW}" height="${cardBot - cardTop}" rx="${cardR}"/></clipPath>
  <g clip-path="url(#tixClip)">${checkerStrip(cardW + cardX * 2, cardTop, 1, 20, P.magenta)}</g>
  ${tilted(cx, cardTop + 96, -2, centered(cx, cardTop + 110, "Sweat Fest 2026", `font-family="Hello Baddie" font-size="66" fill="${P.magenta}"`))}
  ${centered(cx, cardTop + 158, "OFFICIAL TICKET HOLDER · ADMIT ONE + FRIENDS", `font-family="Filson Soft" font-weight="700" font-size="21" letter-spacing="2" fill="${P.ink}"`)}
  ${windowStroke(win, P.ink, 5)}
  <line x1="${cardX + 34}" y1="${perfY}" x2="${cardX + cardW - 34}" y2="${perfY}"
    stroke="${P.ink}" stroke-width="4" stroke-dasharray="16 14" opacity="0.5"/>
  <circle cx="${cardX}" cy="${perfY}" r="22" fill="${P.magenta}"/>
  <circle cx="${cardX + cardW}" cy="${perfY}" r="22" fill="${P.magenta}"/>
  ${centered(cx, perfY + 78, "TICKET SECURED", `font-family="Filson Soft" font-weight="800" font-size="40" letter-spacing="3" fill="${P.magenta}"`)}
  ${centered(cx, perfY + 122, `MEET ME THERE · ${CTA}`, `font-family="Filson Soft" font-weight="700" font-size="23" letter-spacing="1" fill="${P.ink}"`)}
  ${barcode}
  ${confettiCells}`;
}

// ---------------------------------------------------------------------------
// Meet Me There: the logo's multicolor checkerboard run out as the whole
// border, with the lockup and the invite on paper chips.
// ---------------------------------------------------------------------------
function buildSweatfestChecker({ W, H, win, ratioId }) {
  const cx = W / 2;
  const logoAspect = horizontalLogoSize.width / horizontalLogoSize.height;
  const topCardY = 36;
  const topCardH = win.y - 24 - topCardY;
  const logoH = Math.min(topCardH - 44, 220);
  const logoW = logoH * logoAspect;
  const logoSvg = horizontalLogoSvg.replace(
    "<svg ",
    `<svg x="${cx - logoW / 2}" y="${topCardY + (topCardH - logoH) / 2}" width="${logoW}" height="${logoH}" `,
  );
  const botCardY = win.y + win.h + 24;
  const botCardH = H - 36 - botCardY;
  const line1Y = botCardY + botCardH * (ratioId === "story" ? 0.46 : 0.48);
  const line2Y = botCardY + botCardH * 0.8;
  return `
  <clipPath id="ckClip">
    <path clip-rule="evenodd" d="M0,0 h${W} v${H} h-${W} z ${rr(win.x, win.y, win.w, win.h, win.r)}"/>
  </clipPath>
  <g clip-path="url(#ckClip)">${multiChecker(W, H, 30)}</g>
  <rect x="60" y="${topCardY}" width="${W - 120}" height="${topCardH}" rx="24" fill="${P.paper}" stroke="${P.ink}" stroke-width="4"/>
  ${logoSvg}
  <rect x="60" y="${botCardY}" width="${W - 120}" height="${botCardH}" rx="24" fill="${P.paper}" stroke="${P.ink}" stroke-width="4"/>
  ${tilted(cx, line1Y, -3, centered(cx, line1Y + 14, "Meet me there!", `font-family="Hello Baddie" font-size="${ratioId === "story" ? 58 : 50}" fill="${P.magenta}"`))}
  ${centered(cx, line2Y, `AUG 22 · ${CTA}`, `font-family="Filson Soft" font-weight="700" font-size="22" letter-spacing="1" fill="${P.ink}"`)}
  ${windowStroke(win, P.paper, 12)}
  ${windowStroke(win, P.ink, 5)}`;
}

// ---------------------------------------------------------------------------
// Sunrise 5K: race-bib framing on fest paper, an orange sun cresting the
// photo window, and a big bib number for the date.
// ---------------------------------------------------------------------------
function buildSweatfest5k({ W, H, win, ratioId }) {
  const cx = W / 2;
  const sunR = Math.min(170, win.y * 0.5);
  // No straight-up ray: it would strike through the header line above.
  const rays = [-150, -120, -60, -30]
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      const x1 = cx + Math.cos(a) * (sunR + 24);
      const y1 = win.y + 30 + Math.sin(a) * (sunR + 24);
      const x2 = cx + Math.cos(a) * (sunR + 62);
      const y2 = win.y + 30 + Math.sin(a) * (sunR + 62);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${P.naranja}" stroke-width="10" stroke-linecap="round"/>`;
    })
    .join("");
  // Bib pins: four corner dots just inside the window stroke.
  const pin = (px, py) =>
    `<circle cx="${px}" cy="${py}" r="13" fill="${P.ink}"/>
     <circle cx="${px}" cy="${py}" r="6" fill="${P.paper}"/>`;
  const inset = 34;
  const band = H - (win.y + win.h);
  const bandTop = win.y + win.h;
  const numberY = bandTop + band * 0.42;
  const lineY = bandTop + band * (ratioId === "story" ? 0.62 : 0.72);
  const storyLine =
    ratioId === "story"
      ? centered(
          cx,
          bandTop + band * 0.82,
          "MEET ME AT THE START LINE",
          `font-family="Filson Soft" font-weight="800" font-size="27" letter-spacing="3" fill="${P.magenta}"`,
        )
      : "";
  const infoLine =
    ratioId === "story" ? `7:00 AM · ${CTA}` : `7 AM · AUG 22 · ${CTA}`;
  return `
  ${punchedField(W, H, win, `fill="${P.paper}"`)}
  <clipPath id="sunClip"><rect x="0" y="0" width="${W}" height="${win.y}"/></clipPath>
  <g clip-path="url(#sunClip)">
    <circle cx="${cx}" cy="${win.y + 30}" r="${sunR}" fill="${P.naranja}"/>
    ${rays}
  </g>
  ${centered(cx, 84, "SWEAT FEST 5K", `font-family="Filson Soft" font-weight="800" font-size="46" letter-spacing="4" fill="${P.ink}"`)}
  ${centered(cx, 128, "SUNRISE RUN · ALL PACES WELCOME", `font-family="Filson Soft" font-weight="700" font-size="23" letter-spacing="2" fill="${P.naranja}"`)}
  ${windowStroke(win, P.ink, 5)}
  ${pin(win.x + inset, win.y + inset)}
  ${pin(win.x + win.w - inset, win.y + inset)}
  ${pin(win.x + inset, win.y + win.h - inset)}
  ${pin(win.x + win.w - inset, win.y + win.h - inset)}
  ${centered(cx, numberY, "BIB Nº 0822", `font-family="Filson Soft" font-weight="800" font-size="${ratioId === "story" ? 88 : 64}" letter-spacing="6" fill="${P.ink}"`)}
  ${centered(cx, lineY, infoLine, `font-family="Filson Soft" font-weight="700" font-size="22" letter-spacing="1" fill="${P.naranja}"`)}
  ${storyLine}`;
}

// ---------------------------------------------------------------------------
// Pachanga: the night set. Deep teal-green field, teal checker strips, the
// white lockup, and a handwritten dance-floor invite.
// ---------------------------------------------------------------------------
function buildSweatfestPachanga({ W, H, win, ratioId }) {
  const cx = W / 2;
  const checker = 24;
  const stripH = checker * 2;
  const logoAspect =
    whiteHorizontalLogoSize.width / whiteHorizontalLogoSize.height;
  const logoH = Math.min(win.y - stripH - 32, 150);
  const logoW = logoH * logoAspect;
  const logoSvg = whiteHorizontalLogoSvg.replace(
    "<svg ",
    `<svg x="${cx - logoW / 2}" y="${stripH + (win.y - stripH - logoH) / 2}" width="${logoW}" height="${logoH}" `,
  );
  const band = H - (win.y + win.h) - stripH;
  const bandTop = win.y + win.h;
  const line1Y = bandTop + band * 0.42;
  const line2Y = bandTop + band * (band > 180 ? 0.72 : 0.8);
  const extras =
    ratioId === "story"
      ? `${sparkle(96, 150, 11, P.rosa, 0.9)}
  ${sparkle(986, 128, 13, P.teal, 0.9)}
  ${sparkle(936, 214, 8, P.honeydew, 0.7)}
  ${confetti([
    [70, 1560, 16, 20, P.magenta],
    [1000, 1590, 14, -25, P.teal],
    [120, 1680, 18, -12, P.naranja],
    [948, 1700, 16, 18, P.verde],
  ])}`
      : "";
  return `
  ${punchedField(W, H, win, `fill="${P.night}"`)}
  ${checkerStrip(W, 0, 2, checker, P.teal)}
  ${checkerStrip(W, H - stripH, 2, checker, P.teal)}
  ${windowStroke(win, P.teal, 5)}
  ${logoSvg}
  ${tilted(cx, line1Y, 2, centered(cx, line1Y + 14, "Meet me at the Pachanga!", `font-family="Hello Baddie" font-size="${ratioId === "story" ? 54 : 46}" fill="${P.rosa}"`))}
  ${centered(cx, line2Y, `SAT, AUG 22 · ${CTA}`, `font-family="Filson Soft" font-weight="700" font-size="21" letter-spacing="1" fill="${P.honeydew}"`)}
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

function buildPilsenStamp({ W, H }) {
  const cx = W / 2;
  const logo = fileUrl(path.join(root, "public/images/lsp-studio-logo.png"));
  const cardW = 520;
  const cardH = 264;
  const cardY = 52;
  const logoH = 104;
  const pillW = 780;
  const pillH = 56;
  const pillY = H - pillH - 40;
  return `
  ${scrimCard(cx - cardW / 2, cardY, cardW, cardH, 26, "#FDF2F2", 0.9)}
  <image href="${logo}" x="${cx - logoH / 2}" y="${cardY + 24}" width="${logoH}" height="${logoH}"/>
  ${diamond(cx - 210, cardY + 168, 10, "#F0A030")}
  ${diamond(cx + 210, cardY + 168, 10, "#F0A030")}
  ${centered(cx, cardY + 180, "KEEP LSP IN PILSEN 💛", `font-family="Rubik" font-weight="800" font-size="32" fill="#1E1E1E"`)}
  ${centered(cx, cardY + 224, "@latinasweatproject", `font-family="Rubik" font-weight="700" font-size="22" fill="#555555"`)}
  ${scrimCard(cx - pillW / 2, pillY, pillW, pillH, pillH / 2, "#1E1E1E", 0.62)}
  ${centered(cx, pillY + pillH / 2 + 8, "Help fund our next home · latinasweatproject.com/donate", `font-family="Rubik" font-weight="700" font-size="24" fill="#FFBD59"`)}`;
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
  const pillW = 850;
  const pillH = 56;
  const pillY = H - pillH - 40;
  return `
  ${scrimCard(cx - cardW / 2, cardY, cardW, cardH, 24, "#e2ecac", 0.85)}
  ${logoSvg}
  ${scrimCard(cx - pillW / 2, pillY, pillW, pillH, pillH / 2, "#1e1e1e", 0.6)}
  ${centered(cx, pillY + pillH / 2 + 8, ratioId === "story" ? `MEET ME THERE · ${CTA}` : `SAT, AUG 22 · ${CTA}`, `font-family="Filson Soft" font-weight="700" font-size="21" letter-spacing="1" fill="#e2ecac"`)}`;
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

function buildSweatfestTicketStamp({ W, H, ratioId }) {
  const cx = W / 2;
  const cardW = 600;
  const cardH = 196;
  const cardY = 52;
  const pillW = 850;
  const pillH = 56;
  const pillY = H - pillH - 40;
  return `
  ${scrimCard(cx - cardW / 2, cardY, cardW, cardH, 22, P.paper, 0.88)}
  ${tilted(cx, cardY + 78, -2, centered(cx, cardY + 92, "Sweat Fest 2026", `font-family="Hello Baddie" font-size="56" fill="${P.magenta}"`))}
  ${centered(cx, cardY + 148, "TICKET SECURED", `font-family="Filson Soft" font-weight="800" font-size="27" letter-spacing="5" fill="${P.ink}"`)}
  <line x1="${cx - 240}" y1="${cardY + cardH - 16}" x2="${cx + 240}" y2="${cardY + cardH - 16}"
    stroke="${P.ink}" stroke-width="3" stroke-dasharray="12 10" opacity="0.5"/>
  ${scrimCard(cx - pillW / 2, pillY, pillW, pillH, pillH / 2, P.ink, 0.6)}
  ${centered(cx, pillY + pillH / 2 + 8, ratioId === "story" ? `MEET ME THERE · ${CTA}` : `SAT, AUG 22 · ${CTA}`, `font-family="Filson Soft" font-weight="700" font-size="21" letter-spacing="1" fill="${P.honeydew}"`)}`;
}

// Rubber "passport control" seal: the photo itself reads as officially
// stamped in. Ring text runs around a double circle; everything sits in the
// upper third so faces (center-to-lower in mirror selfies) stay clear.
function buildSweatfestAdmittedStamp({ W, H, ratioId }) {
  const cx = W / 2;
  const cy = ratioId === "story" ? 320 : 280;
  const r = ratioId === "story" ? 208 : 184;
  const pillW = 850;
  const pillH = 56;
  const pillY = H - pillH - 40;
  // Ring text: an upright top arc and a counter-directed bottom arc (so both
  // read right-side up), baselines placed inside the band between circles.
  const rTop = r - 46;
  const rBot = r - 18;
  return `
  <defs>
    <path id="sealTop" d="M ${cx - rTop} ${cy} a ${rTop} ${rTop} 0 0 1 ${rTop * 2} 0"/>
    <path id="sealBot" d="M ${cx - rBot} ${cy} a ${rBot} ${rBot} 0 0 0 ${rBot * 2} 0"/>
  </defs>
  <g transform="rotate(-12 ${cx} ${cy})" opacity="0.88">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${P.magenta}" stroke-width="10"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 56}" fill="none" stroke="${P.magenta}" stroke-width="4"/>
    <text font-family="Filson Soft" font-weight="800" font-size="32" letter-spacing="5" fill="${P.magenta}">
      <textPath href="#sealTop" startOffset="50%" text-anchor="middle">SWEAT FEST · CHICAGO</textPath>
    </text>
    <text font-family="Filson Soft" font-weight="800" font-size="32" letter-spacing="5" fill="${P.magenta}">
      <textPath href="#sealBot" startOffset="50%" text-anchor="middle">MOVEMENT IS OURS</textPath>
    </text>
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="Filson Soft" font-weight="800" font-size="50" letter-spacing="2" fill="${P.magenta}">ADMITTED</text>
    <text x="${cx}" y="${cy + 46}" text-anchor="middle" font-family="Filson Soft" font-weight="700" font-size="28" letter-spacing="4" fill="${P.magenta}">AUG 22 2026</text>
  </g>
  ${scrimCard(cx - pillW / 2, pillY, pillW, pillH, pillH / 2, P.ink, 0.6)}
  ${centered(cx, pillY + pillH / 2 + 8, ratioId === "story" ? `GET STAMPED · ${CTA}` : `SAT, AUG 22 · ${CTA}`, `font-family="Filson Soft" font-weight="700" font-size="21" letter-spacing="1" fill="${P.honeydew}"`)}`;
}

// Laminated crew pass on a lanyard: straps drop from the top edge to a
// clip, and the pass hangs in the top band with a punched slot.
function buildSweatfestCrewStamp({ W, H, ratioId }) {
  const cx = W / 2;
  const cardW = 470;
  const cardH = 250;
  const cardY = 150;
  const slotW = 96;
  const slotY = cardY + 22;
  return `
  <g opacity="0.92">
    <line x1="${cx - 140}" y1="0" x2="${cx - 10}" y2="${slotY + 9}" stroke="${P.magenta}" stroke-width="24" stroke-linecap="round" opacity="0.9"/>
    <line x1="${cx + 140}" y1="0" x2="${cx + 10}" y2="${slotY + 9}" stroke="${P.magenta}" stroke-width="24" stroke-linecap="round" opacity="0.9"/>
    <rect x="${cx - cardW / 2}" y="${cardY}" width="${cardW}" height="${cardH}" rx="20" fill="${P.paper}" opacity="0.92"/>
    <rect x="${cx - cardW / 2}" y="${cardY}" width="${cardW}" height="${cardH}" rx="20" fill="none" stroke="${P.teal}" stroke-width="5"/>
    <rect x="${cx - slotW / 2}" y="${slotY}" width="${slotW}" height="18" rx="9" fill="${P.ink}" opacity="0.55"/>
    <rect x="${cx - cardW / 2}" y="${cardY + 58}" width="${cardW}" height="54" fill="${P.teal}"/>
    <text x="${cx}" y="${cardY + 96}" text-anchor="middle" font-family="Filson Soft" font-weight="800" font-size="34" letter-spacing="6" fill="${P.paper}">CREW PASS</text>
    ${tilted(cx, cardY + 160, -2, `<text x="${cx}" y="${cardY + 172}" text-anchor="middle" font-family="Hello Baddie" font-size="52" fill="${P.magenta}">Sweat Fest 2026</text>`)}
    <text x="${cx}" y="${cardY + 222}" text-anchor="middle" font-family="Filson Soft" font-weight="700" font-size="24" letter-spacing="2" fill="${P.ink}">BRING A PLUS-ONE · AUG 22</text>
  </g>
  ${scrimCard(cx - 425, H - 96, 850, 56, 28, P.ink, 0.6)}
  ${centered(cx, H - 96 + 36, ratioId === "story" ? `BRING YOUR CREW · ${CTA}` : `SAT, AUG 22 · ${CTA}`, `font-family="Filson Soft" font-weight="700" font-size="21" letter-spacing="1" fill="${P.honeydew}"`)}`;
}

// Instant-photo borders: translucent paper strips around the edge and a
// chunky bottom margin carrying a handwritten caption. The photo stays the
// hero; the border only tints what it covers.
function buildSweatfestPolaroidStamp({ W, H, ratioId }) {
  const cx = W / 2;
  const side = 36;
  const bottomH = ratioId === "story" ? 210 : 190;
  const bottomY = H - bottomH;
  const line1Y = bottomY + bottomH * 0.46;
  const line2Y = bottomY + bottomH * 0.78;
  return `
  <g fill="${P.paper}" opacity="0.9">
    <rect x="0" y="0" width="${W}" height="${side}"/>
    <rect x="0" y="${side}" width="${side}" height="${bottomY - side}"/>
    <rect x="${W - side}" y="${side}" width="${side}" height="${bottomY - side}"/>
    <rect x="0" y="${bottomY}" width="${W}" height="${bottomH}"/>
  </g>
  ${confetti([
    [70, bottomY + 24, 14, 18, P.magenta],
    [W - 88, bottomY + 30, 14, -22, P.teal],
    [W - 150, bottomY + bottomH - 40, 12, 15, P.verde],
    [110, bottomY + bottomH - 44, 12, -12, P.naranja],
  ])}
  ${tilted(cx, line1Y, -2, centered(cx, line1Y + 16, "Sweat Fest · Aug 22", `font-family="Hello Baddie" font-size="60" fill="${P.magenta}"`))}
  ${centered(cx, line2Y, ratioId === "story" ? `MEET ME THERE · ${CTA}` : CTA, `font-family="Filson Soft" font-weight="700" font-size="21" letter-spacing="1" fill="${P.ink}"`)}`;
}

// Multicolor checker running the full edge of the photo, one tile thick,
// with a single info pill: the loudest minimal option.
function buildSweatfestCheckerStamp({ W, H, ratioId }) {
  const cx = W / 2;
  const tile = 26;
  const pillW = 850;
  const pillH = 56;
  const pillY = H - pillH - 44;
  return `
  <clipPath id="edgeClip">
    <path clip-rule="evenodd" d="M0,0 h${W} v${H} h-${W} z M${tile},${tile} h${W - tile * 2} v${H - tile * 2} h-${W - tile * 2} z"/>
  </clipPath>
  <g clip-path="url(#edgeClip)" opacity="0.96">${multiChecker(W, H, tile)}</g>
  ${scrimCard(cx - pillW / 2, pillY, pillW, pillH, pillH / 2, P.ink, 0.6)}
  ${centered(cx, pillY + pillH / 2 + 8, ratioId === "story" ? `MEET ME THERE · ${CTA}` : `SAT, AUG 22 · ${CTA}`, `font-family="Filson Soft" font-weight="700" font-size="21" letter-spacing="1" fill="${P.honeydew}"`)}`;
}

const builders = {
  studio: buildStudio,
  "studio-stamp": buildStudioStamp,
  pilsen: buildPilsen,
  "pilsen-stamp": buildPilsenStamp,
  sweatfest: buildSweatfest,
  "sweatfest-stamp": buildSweatfestStamp,
  "sweatfest-ticket": buildSweatfestTicket,
  "sweatfest-ticket-stamp": buildSweatfestTicketStamp,
  "sweatfest-admitted-stamp": buildSweatfestAdmittedStamp,
  "sweatfest-crew-stamp": buildSweatfestCrewStamp,
  "sweatfest-polaroid-stamp": buildSweatfestPolaroidStamp,
  "sweatfest-checker-stamp": buildSweatfestCheckerStamp,
  "sweatfest-checker": buildSweatfestChecker,
  "sweatfest-5k": buildSweatfest5k,
  "sweatfest-pachanga": buildSweatfestPachanga,
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

// ---------------------------------------------------------------------------
// Sticker tray assets (transparent PNGs the guest can place/resize on-canvas;
// catalog lives in PHOTOBOOTH_STICKERS). The studio X and ring stickers reuse
// existing site PNGs, so only the drawn marks render here.
// ---------------------------------------------------------------------------
const stickerDir = path.join(outDir, "stickers");
mkdirSync(stickerDir, { recursive: true });

// Shared die-cut treatment: white sticker border + soft drop shadow + a
// foil-gold gradient. Chrome headless enforces a minimum window size, so
// small stickers capture at 3x and downscale (a 1:1 240px window renders in
// a larger viewport and screenshots a misaligned crop).
const stickerDefs = `
  <defs>
    <linearGradient id="foil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFD98A"/>
      <stop offset="0.55" stop-color="#FFBD59"/>
      <stop offset="1" stop-color="#F0A030"/>
    </linearGradient>
    <filter id="ds" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#000000" flood-opacity="0.28"/>
    </filter>
  </defs>`;
const dieCut = `stroke="#FFFFFF" stroke-width="14" stroke-linejoin="round" paint-order="stroke" filter="url(#ds)"`;

const sparklePath = (cx, cy, r) =>
  `M ${cx} ${cy - r} L ${cx + r * 0.22} ${cy - r * 0.22} L ${cx + r} ${cy}
   L ${cx + r * 0.22} ${cy + r * 0.22} L ${cx} ${cy + r} L ${cx - r * 0.22} ${cy + r * 0.22}
   L ${cx - r} ${cy} L ${cx - r * 0.22} ${cy - r * 0.22} Z`;

const festH = 240;
const festW = Math.round(
  festH * (horizontalLogoSize.width / horizontalLogoSize.height),
);
const festPad = 18;
const stickers = [
  {
    // The lockup already reads as a card; a white die-cut ring + shadow
    // makes it sit on photos like a real sticker.
    name: "sweatfest",
    w: festW + festPad * 2,
    h: festH + festPad * 2,
    body: `
  <rect x="${festPad - 8}" y="${festPad - 8}" width="${festW + 16}" height="${festH + 16}" rx="14" fill="#FFFFFF" filter="url(#ds)"/>
  ${horizontalLogoSvg.replace(
    "<svg ",
    `<svg x="${festPad}" y="${festPad}" width="${festW}" height="${festH}" `,
  )}`,
  },
  {
    name: "sparkle",
    w: 300,
    h: 300,
    body: `
  <path d="${sparklePath(140, 160, 104)}" fill="url(#foil)" ${dieCut}/>
  <path d="${sparklePath(232, 78, 44)}" fill="url(#foil)" ${dieCut}/>`,
  },
  {
    name: "diamond",
    w: 280,
    h: 280,
    body: `
  <g transform="rotate(45 140 140)">
    <rect x="52" y="52" width="176" height="176" rx="20" fill="url(#foil)" ${dieCut}/>
  </g>
  <path d="M 140 52 L 140 228 M 52 140 L 228 140" stroke="#B9842F" stroke-width="5" opacity="0.55"/>
  <path d="M 96 96 L 184 184 M 184 96 L 96 184" stroke="#FFE9BF" stroke-width="4" opacity="0.7"/>`,
  },
  {
    // Angled ticket stub: the "I bought mine" badge of the campaign.
    name: "fest-ticket",
    w: 480,
    h: 250,
    body: `
  <g transform="rotate(-6 240 125)">
    <rect x="50" y="60" width="380" height="130" rx="16" fill="#ee3083" ${dieCut}/>
    <line x1="340" y1="68" x2="340" y2="182" stroke="#f4f7dc" stroke-width="4" stroke-dasharray="10 9" opacity="0.85"/>
    <text x="195" y="112" text-anchor="middle" font-family="Filson Soft" font-weight="800" font-size="34" letter-spacing="1" fill="#f4f7dc">SWEAT FEST</text>
    <text x="195" y="150" text-anchor="middle" font-family="Filson Soft" font-weight="700" font-size="19" fill="#e2ecac">ADMIT ME + YOU</text>
    <text x="195" y="176" text-anchor="middle" font-family="Filson Soft" font-weight="700" font-size="17" fill="#e2ecac">SAT · AUG 22</text>
    <path d="${sparklePath(385, 125, 30)}" fill="#e2ecac"/>
  </g>`,
  },
  {
    // Speech bubble in the fest's own hand.
    name: "meet-me",
    w: 440,
    h: 260,
    body: `
  <path d="M 60 50 h 320 a 26 26 0 0 1 26 26 v 96 a 26 26 0 0 1 -26 26 h -170 l -52 44 l 8 -44 h -106 a 26 26 0 0 1 -26 -26 v -96 a 26 26 0 0 1 26 -26 z"
    fill="#e2ecac" ${dieCut}/>
  <text x="220" y="136" text-anchor="middle" font-family="Hello Baddie" font-size="58" fill="#ee3083" transform="rotate(-3 220 124)">Meet me</text>
  <text x="220" y="186" text-anchor="middle" font-family="Hello Baddie" font-size="52" fill="#ee3083" transform="rotate(-3 220 174)">there!</text>`,
  },
  {
    // Twelve-point burst: instant "yes I'm going" energy.
    name: "im-in",
    w: 340,
    h: 340,
    body: `
  <path d="${Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12 - Math.PI / 2;
    const r = i % 2 === 0 ? 138 : 104;
    return `${i === 0 ? "M" : "L"} ${170 + Math.cos(a) * r} ${170 + Math.sin(a) * r}`;
  }).join(" ")} Z" fill="#60a444" ${dieCut}/>
  <text x="170" y="188" text-anchor="middle" font-family="Filson Soft" font-weight="800" font-size="60" fill="#f4f7dc" transform="rotate(-8 170 170)">I'M IN!</text>`,
  },
  {
    // Pennant flag flying the date.
    name: "aug-22",
    w: 380,
    h: 300,
    body: `
  <rect x="63" y="40" width="14" height="220" rx="7" fill="#1e1e1e" filter="url(#ds)"/>
  <path d="M 82 52 L 330 96 L 82 168 Z" fill="#00a7ab" ${dieCut}/>
  <text x="170" y="122" text-anchor="middle" font-family="Filson Soft" font-weight="800" font-size="38" fill="#f4f7dc" transform="rotate(6 170 110)">AUG 22</text>`,
  },
  {
    // Mini race bib for 5K runners.
    name: "fest-5k",
    w: 340,
    h: 280,
    body: `
  <rect x="40" y="46" width="260" height="190" rx="18" fill="#FFFFFF" ${dieCut}/>
  <clipPath id="bibClip"><rect x="40" y="46" width="260" height="190" rx="18"/></clipPath>
  <g clip-path="url(#bibClip)"><rect x="40" y="46" width="260" height="52" fill="#f15b27"/></g>
  <text x="170" y="82" text-anchor="middle" font-family="Filson Soft" font-weight="800" font-size="24" letter-spacing="2" fill="#f4f7dc">SUNRISE 5K</text>
  <text x="170" y="192" text-anchor="middle" font-family="Filson Soft" font-weight="800" font-size="84" fill="#1e1e1e">0822</text>
  <circle cx="62" cy="118" r="8" fill="#1e1e1e"/><circle cx="278" cy="118" r="8" fill="#1e1e1e"/>
  <circle cx="62" cy="214" r="8" fill="#1e1e1e"/><circle cx="278" cy="214" r="8" fill="#1e1e1e"/>
  <text x="170" y="222" text-anchor="middle" font-family="Filson Soft" font-weight="700" font-size="17" letter-spacing="1" fill="#f15b27">ALL PACES</text>`,
  },
  {
    // Disco ball for the Pachanga crowd.
    name: "disco",
    w: 300,
    h: 340,
    body: `
  <line x1="150" y1="20" x2="150" y2="70" stroke="#1e1e1e" stroke-width="8" stroke-linecap="round"/>
  <circle cx="150" cy="190" r="112" fill="#00a7ab" ${dieCut}/>
  <clipPath id="ballClip"><circle cx="150" cy="190" r="112"/></clipPath>
  <g clip-path="url(#ballClip)" stroke="#e2ecac" stroke-width="4" opacity="0.75" fill="none">
    <line x1="150" y1="78" x2="150" y2="302"/>
    <ellipse cx="150" cy="190" rx="28" ry="112"/>
    <ellipse cx="150" cy="190" rx="62" ry="112"/>
    <ellipse cx="150" cy="190" rx="96" ry="112"/>
    <line x1="38" y1="118" x2="262" y2="118"/>
    <line x1="38" y1="154" x2="262" y2="154"/>
    <line x1="38" y1="190" x2="262" y2="190"/>
    <line x1="38" y1="226" x2="262" y2="226"/>
    <line x1="38" y1="262" x2="262" y2="262"/>
  </g>
  <path d="${sparklePath(244, 96, 26)}" fill="#f6a9c8"/>
  <path d="${sparklePath(52, 260, 20)}" fill="#f6a9c8"/>`,
  },
  {
    name: "checker",
    w: 400,
    h: 160,
    body: `
  <clipPath id="chip"><rect x="40" y="36" width="320" height="88" rx="18"/></clipPath>
  <rect x="40" y="36" width="320" height="88" rx="18" fill="#e2ecac" ${dieCut}/>
  <g clip-path="url(#chip)">
    ${Array.from({ length: 16 }, (_, i) => {
      const r = Math.floor(i / 8);
      const c = i % 8;
      return (r + c) % 2 === 0
        ? `<rect x="${40 + c * 44}" y="${36 + r * 44}" width="44" height="44" fill="#1e1e1e"/>`
        : "";
    }).join("")}
  </g>`,
  },
];

for (const { name, w, h, body } of stickers) {
  const svg = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${stickerDefs}${body}</svg>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${svg}</body></html>`;
  const htmlPath = path.join(tmpDir, `sticker-${name}.html`);
  const pngPath = path.join(tmpDir, `sticker-${name}.png`);
  writeFileSync(htmlPath, html);
  execFileSync(CHROME, [
    "--headless=new",
    `--screenshot=${pngPath}`,
    `--window-size=${w * 3},${h * 3}`,
    "--default-background-color=00000000",
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
    "--virtual-time-budget=4000",
    "--disable-gpu",
    `file://${htmlPath}`,
  ]);
  await sharp(pngPath)
    .resize(w, h)
    .png({ compressionLevel: 9 })
    .toFile(path.join(stickerDir, `${name}.png`));
  console.log(`rendered sticker ${name}`);
}

rmSync(tmpDir, { recursive: true, force: true });
console.log("wrote", outDir);
