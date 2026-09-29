// Pop Up Week 1 (Oct 5 to Oct 11, 2026) web assets in the campaign's
// cream / terracotta / ink identity (from the IG graphics; NOT gala navy):
//   public/images/popup/og-popup-week1.jpg   1200x630 Open Graph card
//   public/images/highlights/hl_popup.png     420x420 /links highlight bubble
//
// Facts come from src/data/popUpWeek1.js. Rendered with sharp + SVG
// (librsvg resolves macOS system fonts: Helvetica Neue Bold for display,
// Avenir Next for labels). The LSP X mark is scripts/mark_x_only.png.
//
// Usage: node scripts/render-popup-week1-og.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { popUpWeek1 as w, popUpLocations } from "../src/data/popUpWeek1.js";
import * as lsp from "/Users/fezqazi/.claude/skills/lsp-event-graphics/scripts/lsp_graphics.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharp = lsp.loadSharp();
const esc = lsp.esc;
const c = w.colors;
// Wide bold grotesk like the IG graphics (Helvetica Neue ships with macOS).
const DISPLAY = "Helvetica Neue, Arial, sans-serif";
const SANS = "Avenir Next, Helvetica Neue, Arial, sans-serif";
const markB64 = readFileSync(path.join(root, "scripts/mark_x_only.png")).toString("base64");
const mark = (x, y, width) => {
  const h = Math.round((width * 734) / 863);
  return `<image href="data:image/png;base64,${markB64}" x="${x}" y="${y}" width="${width}" height="${h}"/>`;
};
const t = (text, x, y, size, { fill = c.ink, family = SANS, weight = 700, tracking = 0, anchor = "start" } = {}) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="${tracking}" text-anchor="${anchor}">${esc(text)}</text>`;

// ---- OG 1200x630 -----------------------------------------------------------
const [cad, sanc] = popUpLocations;
const W = 1200, H = 630;
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${c.cream}"/>
  <circle cx="1045" cy="120" r="300" fill="${c.terracotta}"/>
  <circle cx="850" cy="300" r="92" fill="#ffffff"/>
  ${mark(850 - 56, 300 - 48, 112)}
  ${t("THE LATINA SWEAT PROJECT", 72, 92, 22, { fill: c.terracotta, weight: 800, tracking: 4 })}
  ${t("POP UP", 64, 236, 170, { family: DISPLAY, weight: 700, tracking: -2 })}
  ${t("WEEK 1", 64, 382, 170, { family: DISPLAY, weight: 700, tracking: -2 })}
  <rect x="72" y="412" width="300" height="56" rx="28" fill="${c.ink}"/>
  ${t("OCTOBER 5 – 11", 222, 449, 22, { fill: c.cream, weight: 800, tracking: 3, anchor: "middle" })}
  ${t("TWO LOCATIONS IN PILSEN", 72, 520, 16, { fill: c.muted, weight: 700, tracking: 3 })}
  <rect x="72" y="536" width="500" height="64" rx="16" fill="${c.paper}"/>
  ${t("CHICAGO ART DEPT", 96, 576, 22, { weight: 800, tracking: 2 })}
  ${t(cad.shortLabel.replace("Pilsen · ", "").toUpperCase(), 548, 576, 15, { fill: c.terracotta, weight: 800, tracking: 2, anchor: "end" })}
  <rect x="592" y="536" width="536" height="64" rx="16" fill="${c.ink}"/>
  ${t("SANCTUARY HEALTH", 616, 576, 22, { fill: c.cream, weight: 600, tracking: 4, family: "Georgia, serif" })}
  ${t(sanc.shortLabel.replace("Pilsen · ", "").toUpperCase(), 1104, 576, 15, { fill: c.mustard, weight: 800, tracking: 2, anchor: "end" })}
</svg>`;
await sharp(Buffer.from(og)).flatten({ background: c.cream }).jpeg({ quality: 88, mozjpeg: true })
  .toFile(path.join(root, "public/images/popup/og-popup-week1.jpg"));

// ---- Highlight bubble 420x420 (matches hl_grad.png footprint) --------------
const S = 420;
const hl = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" fill="${c.cream}"/>
  <circle cx="${S / 2}" cy="150" r="118" fill="${c.terracotta}"/>
  <circle cx="${S / 2}" cy="150" r="66" fill="#ffffff"/>
  ${mark(S / 2 - 42, 150 - 36, 84)}
  ${t("POP UP", S / 2, 330, 82, { family: DISPLAY, weight: 700, tracking: -2, anchor: "middle" })}
  <rect x="${S / 2 - 88}" y="350" width="176" height="38" rx="19" fill="${c.ink}"/>
  ${t("OCT 5 – 11", S / 2, 376, 18, { fill: c.cream, weight: 800, tracking: 3, anchor: "middle" })}
</svg>`;
await sharp(Buffer.from(hl)).png({ compressionLevel: 9 })
  .toFile(path.join(root, "public/images/highlights/hl_popup.png"));
console.log("wrote og-popup-week1.jpg + hl_popup.png");
