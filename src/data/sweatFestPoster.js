// Sweat Fest poster art, composed from the team's official logo lockups: the
// honeydew field with its multicolor checkerboard border, the magenta LSP X,
// and the green distressed SWEAT FEST wordmark. The logos are complete
// artwork on their own, so a poster is the logo on a honeydew ground plus a
// row of boxy fact chips and the ticket line. No arcs, no textPath: straight
// type only.
//
// Shared by SweatFestArtwork.astro (live site) and the social image render
// script (scripts/render-sweatfest-social.mjs) so the flyer only exists in
// one place. The facts match src/data/sweatFest.js; the venue line stays
// "CHICAGO · LOCATION SOON" until the team announces a location.
import { sweatFestPalette as p } from "./sweatFest.js";
import {
  stackedLogoSvg,
  horizontalLogoSvg,
  stackedLogoSize,
  horizontalLogoSize,
  placeLogo,
} from "./sweatFestLogos.js";

// --- Fact chips -----------------------------------------------------------

// The three flyer facts, kept in one place so every composition agrees.
const facts = ["AUGUST 22, 2026", "CHICAGO · LOCATION SOON", "7:00 AM - 9:00 PM"];

// Boxy chip: 4px ink border, pale honeydew fill, small radius, Filson Soft
// bold caps centered inside.
const chip = (x, y, w, h, label, fontSize) =>
  `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${p.paper}" stroke="${p.ink}" stroke-width="4"/>
    <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" font-family="'Filson Soft', Rubik, sans-serif" font-weight="700" font-size="${fontSize}" letter-spacing="0.5" fill="${p.ink}">${label}</text>
  </g>`;

// Row of the three fact chips, centered on `cx`. `widths` sizes each chip to
// its own copy so the long venue line never crowds its border.
const chipRow = (cx, y, widths, gap, h, fontSize) => {
  const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
  let x = cx - total / 2;
  return widths
    .map((w, i) => {
      const box = chip(x, y, w, h, facts[i], fontSize);
      x += w + gap;
      return box;
    })
    .join("");
};

// Ticket line: plain Rubik ink, the URL underlined beneath it.
const ticketLines = (cx, y, size) =>
  `<text x="${cx}" y="${y}" text-anchor="middle" font-family="Rubik, sans-serif" font-size="${size}" font-weight="600" fill="${p.ink}">Tickets available on our website</text>
   <text x="${cx}" y="${y + size * 1.42}" text-anchor="middle" font-family="Rubik, sans-serif" font-size="${size * 0.88}" font-weight="500" fill="${p.ink}" text-decoration="underline">latinasweatproject.com/sweatfest</text>`;

// Solid lockups: their honeydew field matches the poster grounds exactly, so
// they read as transparent here. (The kit's "transparent color" variants are
// light-tint versions for dark grounds; on light paper they wash out.)
const stacked = (x, y, w) => placeLogo(stackedLogoSvg, stackedLogoSize, x, y, w);
const horizontal = (x, y, w) =>
  placeLogo(horizontalLogoSvg, horizontalLogoSize, x, y, w);

// --- Compositions ---------------------------------------------------------

// `logoHref` is unused now that the real lockups are inlined; the signature
// is kept so existing call sites do not have to change.
export function buildPosterSvg(variant, logoHref) {
  if (variant === "portrait") {
    // Stacked logo 640 wide (756.4 tall) from y=40, chips, then the URL.
    return `
<svg viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <rect width="800" height="1000" fill="${p.honeydew}"/>
  ${stacked(80, 40, 640)}
  ${chipRow(400, 828, [200, 287, 222], 16, 62, 17)}
  ${ticketLines(400, 936, 26)}
</svg>`;
  }

  if (variant === "square") {
    // Stacked logo 520 wide (614.6 tall) from y=18, chips, then the URL.
    return `
<svg viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <rect width="800" height="800" fill="${p.honeydew}"/>
  ${stacked(140, 18, 520)}
  ${chipRow(400, 654, [190, 276, 212], 14, 58, 16)}
  <text x="400" y="752" text-anchor="middle" font-family="Rubik, sans-serif" font-size="21" font-weight="600" fill="${p.ink}">Tickets on <tspan text-decoration="underline">latinasweatproject.com/sweatfest</tspan></text>
</svg>`;
  }

  if (variant === "lockup") {
    // Card art: the horizontal lockup alone on its own honeydew, for small
    // renders (like the homepage events carousel) where the full poster's
    // fact chips would shrink past legibility.
    return `
<svg viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <rect width="1600" height="900" fill="${p.honeydew}"/>
  ${horizontal(80, 234, 1440)}
</svg>`;
  }

  // Landscape: horizontal logo 1400 wide (420.3 tall) from y=125.
  return `
<svg viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <rect width="1600" height="900" fill="${p.honeydew}"/>
  ${horizontal(100, 125, 1400)}
  ${chipRow(800, 585, [400, 520, 400], 30, 80, 30)}
  ${ticketLines(800, 728, 30)}
</svg>`;
}
