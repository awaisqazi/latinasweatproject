// Pop Up week web assets in the campaign's cream / terracotta / ink
// identity (from the IG graphics; NOT gala navy), one set per week in
// src/data/popUpWeeks.js:
//   public/<week.ogImage>          1200x630 Open Graph card
//                                  (images/popup/og-popup-week1.jpg, -week2.jpg)
//   public/<week.highlightImage>   420x420 /links highlight bubble
//                                  (images/highlights/hl_popup.png, hl_popup2.png)
// Week 1's output is byte-for-byte what the former
// scripts/render-popup-week1-og.mjs wrote (the pill widths only grow for
// longer date labels).
//
// Facts come from the week data files. Rendered with sharp + SVG
// (librsvg resolves macOS system fonts: Helvetica Neue Bold for display,
// Avenir Next for labels). The LSP X mark is scripts/mark_x_only.png.
//
// Usage: node scripts/render-popup-og.mjs            (every week)
//        node scripts/render-popup-og.mjs 2          (one week by number)
//        node scripts/render-popup-og.mjs 2 --out <dir>  (write to <dir>
//        instead of public/, keeping the relative paths; for comparisons)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { popUpWeeks } from "../src/data/popUpWeeks.js";
import * as lsp from "/Users/fezqazi/.claude/skills/lsp-event-graphics/scripts/lsp_graphics.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharp = lsp.loadSharp();
const esc = lsp.esc;
const c = popUpWeeks[0].colors;
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

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outRoot = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(root, "public");
const only = args.filter((a, i) => /^\d+$/.test(a) && args[i - 1] !== "--out").map(Number);
const weeks = only.length ? popUpWeeks.filter((w) => only.includes(w.number)) : popUpWeeks;
if (!weeks.length) throw new Error(`No pop-up week matches ${only.join(", ")}`);
const outFile = (rel) => {
  const f = path.join(outRoot, rel);
  mkdirSync(path.dirname(f), { recursive: true });
  return f;
};

// Pill widths: Week 1's labels set the base size; longer labels grow it.
const W1_PILL = "OCTOBER 5 – 11".length;
const W1_HL_PILL = "OCT 5 – 11".length;

for (const w of weeks) {
const [cad, sanc] = w.locations;
const pill = w.datePill.toUpperCase();
const pillW = 300 + Math.max(0, pill.length - W1_PILL) * 17;
const hlPill = w.dateRangeShort.toUpperCase();
const hlPillW = 176 + Math.max(0, hlPill.length - W1_HL_PILL) * 14;
// ---- OG 1200x630 -----------------------------------------------------------
const W = 1200, H = 630;
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${c.cream}"/>
  <circle cx="1045" cy="120" r="300" fill="${c.terracotta}"/>
  <circle cx="850" cy="300" r="92" fill="#ffffff"/>
  ${mark(850 - 56, 300 - 48, 112)}
  ${t("THE LATINA SWEAT PROJECT", 72, 92, 22, { fill: c.terracotta, weight: 800, tracking: 4 })}
  ${t("POP UP", 64, 236, 170, { family: DISPLAY, weight: 700, tracking: -2 })}
  ${t(`WEEK ${w.number}`, 64, 382, 170, { family: DISPLAY, weight: 700, tracking: -2 })}
  <rect x="72" y="412" width="${pillW}" height="56" rx="28" fill="${c.ink}"/>
  ${t(pill, 72 + pillW / 2, 449, 22, { fill: c.cream, weight: 800, tracking: 3, anchor: "middle" })}
  ${t("TWO LOCATIONS IN PILSEN", 72, 520, 16, { fill: c.muted, weight: 700, tracking: 3 })}
  <rect x="72" y="536" width="500" height="64" rx="16" fill="${c.paper}"/>
  ${t("CHICAGO ART DEPT", 96, 576, 22, { weight: 800, tracking: 2 })}
  ${t(cad.shortLabel.replace("Pilsen · ", "").toUpperCase(), 548, 576, 15, { fill: c.terracotta, weight: 800, tracking: 2, anchor: "end" })}
  <rect x="592" y="536" width="536" height="64" rx="16" fill="${c.ink}"/>
  ${t("SANCTUARY HEALTH", 616, 576, 22, { fill: c.cream, weight: 600, tracking: 4, family: "Georgia, serif" })}
  ${t(sanc.shortLabel.replace("Pilsen · ", "").toUpperCase(), 1104, 576, 15, { fill: c.mustard, weight: 800, tracking: 2, anchor: "end" })}
</svg>`;
await sharp(Buffer.from(og)).flatten({ background: c.cream }).jpeg({ quality: 88, mozjpeg: true })
  .toFile(outFile(w.ogImage));

// ---- Highlight bubble 420x420 (matches hl_grad.png footprint) --------------
const S = 420;
const hl = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" fill="${c.cream}"/>
  <circle cx="${S / 2}" cy="150" r="118" fill="${c.terracotta}"/>
  <circle cx="${S / 2}" cy="150" r="66" fill="#ffffff"/>
  ${mark(S / 2 - 42, 150 - 36, 84)}
  ${t("POP UP", S / 2, 330, 82, { family: DISPLAY, weight: 700, tracking: -2, anchor: "middle" })}
  <rect x="${S / 2 - hlPillW / 2}" y="350" width="${hlPillW}" height="38" rx="19" fill="${c.ink}"/>
  ${t(hlPill, S / 2, 376, 18, { fill: c.cream, weight: 800, tracking: 3, anchor: "middle" })}
</svg>`;
await sharp(Buffer.from(hl)).png({ compressionLevel: 9 })
  .toFile(outFile(w.highlightImage));
console.log(`week ${w.number}: wrote ${w.ogImage} + ${w.highlightImage}`);
}
