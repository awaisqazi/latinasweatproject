// 8.5x11 in-studio flyer for the "A New Chapter" announcement: how members
// can support LSP through the Pilsen building ownership change. Echoes the
// IG carousel's identity (gold field, white rounded panels, tagline pill).
// Headline ask: pack Sweat Fest + the Gala. Includes a QR that opens a
// ready-to-send email to the 25th Ward alderman.
//
// Usage:  node marketing/new-chapter/render-flyer.mjs
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
const qrFest = f(path.join(here, "qr-sweatfest.png"));
const qrGala = f(path.join(here, "qr-gala.png"));
const qrEmail = f(path.join(here, "qr-alderman-email.png"));
const qrDonate = f(path.join(here, "qr-donate.png"));

const GOLD = "#FFBD59";
const INK = "#1E1E1E";
const GRAY = "#555555";
const FEST_BG = "#e2ecac";
const FEST_PINK = "#ee3083";
const GALA_BG = "#0A0E16";
const CREAM = "#FFF8EF";

const css = `
  @font-face { font-family: "Rubik"; src: url("${site("tools/renderfonts/Rubik.ttf")}") format("truetype"); }
  @font-face { font-family: "Hello Baddie"; src: url("${site("public/fonts/hello-baddie.woff2")}") format("woff2"); }
  @font-face { font-family: "Filson Soft"; src: url("${site("public/fonts/filson-soft-700.woff2")}") format("woff2"); font-weight: 700; }
  @page { size: 8.5in 11in; margin: 0; }
  html, body { margin: 0; padding: 0; }
  svg { display: block; width: 100vw; height: 100vh; }
`;

// Sweat Fest multicolor checker strip (the identity's border motif).
const FEST_COLORS = ["#ee3083", "#f5843c", "#7ab648", "#f9c8d8", "#2a9d8f"];
const checker = (x, y, w, cell) => {
  const n = Math.floor(w / cell);
  let out = "";
  for (let i = 0; i < n; i++) {
    out += `<rect x="${x + i * cell}" y="${y}" width="${cell}" height="${cell}" fill="${FEST_COLORS[i % FEST_COLORS.length]}"/>`;
  }
  return out;
};

const diamond = (x, y, s) =>
  `<rect x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" fill="${GOLD}" transform="rotate(45 ${x} ${y})"/>`;

const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${GOLD}"/>

  <!-- Panel 1: header -->
  <rect x="46" y="46" width="${W - 92}" height="380" rx="30" fill="#FFFFFF"/>
  <image href="${logo}" x="${cx - 55}" y="64" width="110" height="110"/>
  <text x="${cx}" y="230" text-anchor="middle" font-family="Rubik" font-weight="800" font-size="52" fill="${INK}">A New Chapter for</text>
  <text x="${cx}" y="288" text-anchor="middle" font-family="Rubik" font-weight="800" font-size="52" fill="${INK}">Latina Sweat Project</text>
  <text x="${cx}" y="336" text-anchor="middle" font-family="Rubik" font-weight="500" font-size="25" fill="${GRAY}">Our Pilsen building changed owners in August. Here's how to help us through it.</text>
  <text x="${cx}" y="382" text-anchor="middle" font-family="Rubik" font-weight="500" font-size="20" fill="${GRAY}">Little Village Room: 65 spots to 25 · new $5 no-show and late-cancel fee (within 6 hrs) · Gage Park unchanged</text>

  <!-- Panel 2: the big ask -->
  <rect x="46" y="456" width="${W - 92}" height="620" rx="30" fill="#FFFFFF"/>
  <text x="${cx}" y="520" text-anchor="middle" font-family="Rubik" font-weight="800" font-size="40" fill="${INK}">The biggest way to help: pack these two events</text>
  <text x="${cx}" y="562" text-anchor="middle" font-family="Rubik" font-weight="500" font-size="25" fill="${GRAY}">Big turnout at Sweat Fest and the Gala shows Pilsen, and the 25th Ward, exactly</text>
  <text x="${cx}" y="596" text-anchor="middle" font-family="Rubik" font-weight="500" font-size="25" fill="${GRAY}">how strong this movement is. Every ticket helps fund our next home.</text>

  <!-- Sweat Fest card -->
  <clipPath id="festClip"><rect x="90" y="630" width="525" height="390" rx="18"/></clipPath>
  <rect x="90" y="630" width="525" height="390" rx="18" fill="${FEST_BG}"/>
  <g clip-path="url(#festClip)">
    ${checker(90, 630, 525, 25)}
    ${checker(90, 995, 525, 25)}
  </g>
  <text x="352" y="726" text-anchor="middle" font-family="Hello Baddie" font-size="58" fill="${FEST_PINK}">SWEAT FEST</text>
  <text x="352" y="762" text-anchor="middle" font-family="Filson Soft" font-weight="700" font-size="18" fill="#7ab648">Presented by Latina Sweat Project</text>
  <text x="352" y="806" text-anchor="middle" font-family="Filson Soft" font-weight="700" font-size="22" fill="${INK}">SAT, AUG 22 · 18TH &amp; PEORIA · 7 AM-9 PM</text>
  <rect x="278" y="842" width="148" height="148" rx="8" fill="#FFFFFF" stroke="${INK}" stroke-width="2"/>
  <image href="${qrFest}" x="282" y="846" width="140" height="140"/>
  <rect x="180" y="984" width="344" height="32" rx="16" fill="${FEST_BG}"/>
  <text x="352" y="1006" text-anchor="middle" font-family="Filson Soft" font-weight="700" font-size="18" fill="${INK}">latinasweatproject.com/sweatfest</text>

  <!-- Gala card -->
  <rect x="660" y="630" width="525" height="390" rx="18" fill="${GALA_BG}" stroke="${GOLD}" stroke-width="2"/>
  <text x="922" y="700" text-anchor="middle" font-family="Didot" font-size="17" letter-spacing="4" fill="${CREAM}">THE LATINA SWEAT PROJECT</text>
  ${diamond(742, 746, 10)}
  ${diamond(1102, 746, 10)}
  <text x="922" y="760" text-anchor="middle" font-family="Didot" font-style="italic" font-size="52" fill="${GOLD}">Annual Gala</text>
  <text x="922" y="800" text-anchor="middle" font-family="Didot" font-size="20" fill="${CREAM}">FRI, SEPT 25, 2026 · 6 PM CT</text>
  <text x="922" y="828" text-anchor="middle" font-family="Didot" font-size="20" fill="${CREAM}">MCA CHICAGO · BLACK TIE</text>
  <rect x="848" y="842" width="148" height="148" rx="8" fill="#FFFFFF"/>
  <image href="${qrGala}" x="852" y="846" width="140" height="140"/>
  <text x="922" y="1008" text-anchor="middle" font-family="Didot" font-size="18" fill="${GOLD}">latinasweatproject.com/gala</text>

  <!-- Panel 3: more ways -->
  <rect x="46" y="1096" width="${W - 92}" height="380" rx="30" fill="#FFFFFF"/>
  <text x="90" y="1150" font-family="Rubik" font-weight="800" font-size="34" fill="${INK}">More ways to show up</text>

  ${diamond(104, 1196, 12)}
  <text x="130" y="1204" font-family="Rubik" font-weight="700" font-size="26" fill="${INK}">Email Ald. Byron Sigcho-Lopez (25th Ward)</text>
  <text x="130" y="1236" font-family="Rubik" font-weight="500" font-size="22" fill="${GRAY}">Ask for support securing LSP's next long-term home in Pilsen,</text>
  <text x="130" y="1266" font-family="Rubik" font-weight="500" font-size="22" fill="${GRAY}">and share what LSP means to you. ward25@cityofchicago.org</text>

  ${diamond(104, 1310, 12)}
  <text x="130" y="1318" font-family="Rubik" font-weight="700" font-size="26" fill="${INK}">Keep showing up</text>
  <text x="130" y="1350" font-family="Rubik" font-weight="500" font-size="22" fill="${GRAY}">Every class and every check-in is part of the case we're making.</text>

  ${diamond(104, 1390, 12)}
  <text x="130" y="1398" font-family="Rubik" font-weight="700" font-size="26" fill="${INK}">Share your story, it builds our case</text>
  <text x="130" y="1428" font-family="Rubik" font-weight="500" font-size="22" fill="${GRAY}">Post what LSP means to you and tag @latinasweatproject.</text>
  <text x="130" y="1456" font-family="Rubik" font-weight="500" font-size="22" fill="${GRAY}">LSP frames for your photos: latinasweatproject.com/photobooth</text>

  <rect x="884" y="1144" width="256" height="256" rx="10" fill="#FFFFFF" stroke="${GOLD}" stroke-width="4"/>
  <image href="${qrEmail}" x="892" y="1152" width="240" height="240"/>
  <text x="1012" y="1430" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="19" fill="${INK}">Scan to open a ready-to-send</text>
  <text x="1012" y="1456" text-anchor="middle" font-family="Rubik" font-weight="700" font-size="19" fill="${INK}">email to the alderman</text>

  <!-- Donate bar -->
  <rect x="46" y="1494" width="${W - 92}" height="122" rx="24" fill="${INK}"/>
  <rect x="72" y="1500" width="110" height="110" rx="10" fill="#FFFFFF"/>
  <image href="${qrDonate}" x="77" y="1505" width="100" height="100"/>
  <text x="210" y="1546" font-family="Rubik" font-weight="800" font-size="30" fill="#FFFFFF">Help fund our next home</text>
  <text x="210" y="1586" font-family="Rubik" font-weight="700" font-size="26" fill="${GOLD}">latinasweatproject.com/donate</text>
  <text x="1180" y="1566" text-anchor="end" font-family="Rubik" font-weight="700" font-size="22" fill="${GOLD}">Rooted in Latina leadership.</text>
  <text x="1180" y="1594" text-anchor="end" font-family="Rubik" font-weight="700" font-size="22" fill="${GOLD}">Built for all.</text>

  <text x="${cx}" y="1640" text-anchor="middle" font-family="Rubik" font-weight="600" font-size="20" fill="${INK}">@latinasweatproject · full update at latinasweatproject.com</text>
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
  .toFile(path.join(here, "new-chapter-flyer.png"));

execFileSync(CHROME, [
  "--headless=new",
  `--print-to-pdf=${path.join(here, "new-chapter-flyer.pdf")}`,
  "--no-pdf-header-footer",
  "--virtual-time-budget=6000",
  "--disable-gpu",
  f(htmlPath),
]);
rmSync(htmlPath, { force: true });
rmSync(rawPath, { force: true });
console.log("wrote", path.join(here, "new-chapter-flyer.{png,pdf}"));
