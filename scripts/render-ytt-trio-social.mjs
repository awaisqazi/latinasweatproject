// Instagram promo suite for the YTT ’26 Trio Community Classes (Aug 11–31,
// 2026): one feed post (1080x1350) + one story (1080x1920) PER SESSION,
// plus a series-overview post + story listing every date.
//
// Identity: "candlelit rose", the Graduation 2026 family (rose-ink ground,
// cream #f6efe3, gold #f0c57c/#d79b47 foil, orchid #e08cb8 candle-bokeh,
// Didot italic serif for names). These classes are the Aug 7 graduates'
// first live classes, so the campaign family resemblance is deliberate.
//
// Facts come from src/data/yttTrio.js (the site's single source of truth).
// The graphics deliberately do NOT map minute ranges to individual names
// (the source doesn't specify teaching order), only "15 MIN x3".
//
// Usage:  node scripts/render-ytt-trio-social.mjs
// Output: output/ytt-trio-social/*.png  (2 per session + 2 overview)

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as lsp from "/Users/fezqazi/.claude/skills/lsp-event-graphics/scripts/lsp_graphics.mjs";
import { yttTrio, yttTrioSessions } from "../src/data/yttTrio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "output/ytt-trio-social");
mkdirSync(outDir, { recursive: true });
const sharp = lsp.loadSharp();
const { SERIF } = lsp;

// Candlelit-rose palette (site Graduation 2026 identity).
const P = {
  roseTop: "#391c2b",
  rose: "#2b1520",
  roseDeep: "#170d12",
  cream: "#f6efe3",
  gold: "#f0c57c",
  goldDeep: "#d79b47",
  orchid: "#e08cb8",
};

// Custom defs: rose-ink bg, rose-gold foil line (same id the lib's rule()
// references), candlelight halo.
function defsRose(haloCy) {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.roseTop}"/>
      <stop offset="0.45" stop-color="${P.rose}"/>
      <stop offset="1" stop-color="${P.roseDeep}"/>
    </linearGradient>
    <linearGradient id="goldLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#6b4a22" stop-opacity="0"/>
      <stop offset="0.25" stop-color="${P.gold}"/>
      <stop offset="0.5" stop-color="#fbeecb"/>
      <stop offset="0.75" stop-color="${P.gold}"/>
      <stop offset="1" stop-color="#6b4a22" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="${haloCy}" r="52%">
      <stop offset="0" stop-color="#f7dcae" stop-opacity="0.36"/>
      <stop offset="0.4" stop-color="${P.goldDeep}" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

function backdropRose(W, H, grainCount) {
  return `<rect width="${W}" height="${H}" fill="url(#bg)"/>`
    + `<rect width="${W}" height="${H}" fill="url(#halo)"/>`
    + lsp.grain(W, H, grainCount, 0.05)
    + `<rect x="0" y="0" width="${W}" height="40" fill="${P.roseDeep}"/>`
    + `<rect x="0" y="40" width="${W}" height="1.2" fill="url(#goldLine)" opacity="0.55"/>`
    + `<rect x="0" y="${H - 41}" width="${W}" height="1.2" fill="url(#goldLine)" opacity="0.55"/>`
    + `<rect x="0" y="${H - 40}" width="${W}" height="40" fill="${P.roseDeep}"/>`;
}

// Candle-bokeh dots (gold + orchid), the graduation-identity signature.
function bokeh(cx, y) {
  const dots = [
    { dx: -88, r: 3.6, c: P.gold, o: 0.5 },
    { dx: -44, r: 7, c: P.gold, o: 0.85 },
    { dx: 0, r: 5, c: P.orchid, o: 0.6 },
    { dx: 44, r: 3.6, c: P.gold, o: 0.42 },
    { dx: 88, r: 5, c: P.orchid, o: 0.45 },
  ];
  return dots
    .map(
      (d) =>
        `<circle cx="${cx + d.dx}" cy="${y}" r="${d.r * 2.4}" fill="${d.c}" opacity="${d.o * 0.22}"/>` +
        `<circle cx="${cx + d.dx}" cy="${y}" r="${d.r}" fill="${d.c}" opacity="${d.o}"/>`,
    )
    .join("");
}

// Three equal "15 MIN" segments: the trio-flow motif (not mapped to names).
function segmentBar(cx, y, segW, segH, gap, fontSize) {
  const total = segW * 3 + gap * 2;
  let x = cx - total / 2;
  let s = "";
  for (let i = 0; i < 3; i += 1) {
    s += `<rect x="${x}" y="${y}" width="${segW}" height="${segH}" rx="8" fill="rgba(246,239,227,0.05)" stroke="${P.gold}" stroke-opacity="0.55" stroke-width="1.6"/>`;
    s += lsp.txt({ text: "15 MIN", x: x + segW / 2, y: y + segH / 2 + fontSize * 0.36, size: fontSize, color: P.gold, weight: 900, anchor: "middle", tracking: 2.5 });
    x += segW + gap;
  }
  return s;
}

const T = (p) => lsp.txt({ anchor: "middle", ...p });

// Gold date banner sized to its text.
function datePill(cx, y, text, size, h) {
  const w = Math.round(text.length * size * 0.6) + 100;
  return (
    lsp.pill(cx - w / 2, y, w, h, { fill: P.gold }) +
    T({ text, x: cx, y: y + h / 2 + size * 0.35, size, color: P.roseDeep, weight: 900, tracking: 1.5 })
  );
}

// ---------------------------------------------------------------------------
// Per-session composition
// ---------------------------------------------------------------------------

function composeSession(sess, W, H, o) {
  const cx = W / 2;
  const dateText = `${sess.day}, ${sess.dateLabel} · ${sess.time}`.toUpperCase();
  let s = backdropRose(W, H, o.grain);
  s += bokeh(cx, o.bokehY);
  s += T({ text: "THE LATINA SWEAT PROJECT", x: cx, y: o.eyebrowY, size: o.eyebrowSize, color: P.cream, weight: 900, tracking: 9, opacity: 0.92 });
  s += T({ text: "Trio Community Class", x: cx, y: o.titleY, size: o.titleSize, color: P.cream, weight: 400, family: SERIF, italic: true });
  s += T({ text: "YTT ’26 · ONE 45-MINUTE FLOW · THREE NEW TEACHERS", x: cx, y: o.sublineY, size: o.sublineSize, color: P.gold, weight: 900, tracking: 2.5, opacity: 0.95 });
  s += segmentBar(cx, o.segY, o.segW, o.segH, 14, o.segFont);
  s += datePill(cx, o.pillY, dateText, o.pillSize, o.pillH);

  s += T({ text: "TAKING THE MAT", x: cx, y: o.matLabelY, size: o.matLabelSize, color: P.gold, weight: 900, tracking: 6, opacity: 0.9 });
  // No separators between the stacked names: a mid-gap diamond collides
  // with the next name's ascenders (l, t) at these sizes.
  sess.instructors.forEach((name, i) => {
    const y = o.namesY + i * o.nameGap;
    s += T({ text: name, x: cx, y, size: o.nameSize, color: P.cream, weight: 400, family: SERIF, italic: true });
  });

  s += lsp.divider(cx, o.dividerY, o.dividerHalf, 0.3);
  s += T({ text: "LSP STUDIO · 949 W 16TH ST · PILSEN", x: cx, y: o.venueY, size: o.venueSize, color: P.gold, weight: 900, tracking: 3.5, opacity: 0.96 });
  s += T({ text: "FREE · ALL LEVELS · DONATION TO LSP ENCOURAGED", x: cx, y: o.freeY, size: o.freeSize, color: P.cream, weight: 700, tracking: 2, opacity: 0.8 });

  s += lsp.rule(cx - o.ctaRuleHalf, o.ctaRuleY, o.ctaRuleHalf * 2, 0.4);
  s += T({ text: o.cta, x: cx, y: o.ctaY, size: o.ctaSize, color: P.gold, weight: 900, tracking: 3 });
  if (o.ctaSub) s += T({ text: o.ctaSub, x: cx, y: o.ctaSubY, size: o.ctaSubSize, color: P.cream, weight: 700, tracking: 2, opacity: 0.55 });

  return lsp.svgRoot(W, H, s, { defsBlock: defsRose(o.haloCy), superSample: 2 });
}

const POST_OPTS = {
  grain: 200, haloCy: "26%", bokehY: 72,
  eyebrowY: 126, eyebrowSize: 24,
  titleY: 246, titleSize: 94,
  sublineY: 306, sublineSize: 19,
  segY: 344, segW: 132, segH: 34, segFont: 14,
  pillY: 424, pillSize: 27, pillH: 62,
  matLabelY: 566, matLabelSize: 17,
  namesY: 648, nameGap: 106, nameSize: 88,
  dividerY: 926, dividerHalf: 74,
  venueY: 982, venueSize: 23,
  freeY: 1026, freeSize: 20,
  ctaRuleHalf: 170, ctaRuleY: 1088,
  ctaY: 1152, ctaSize: 28, cta: "FREE TICKETS AT THE LINK IN BIO",
  ctaSub: "", ctaSubY: 0, ctaSubSize: 0,
};

const STORY_OPTS = {
  grain: 280, haloCy: "28%", bokehY: 286,
  eyebrowY: 338, eyebrowSize: 26,
  titleY: 470, titleSize: 104,
  sublineY: 536, sublineSize: 20,
  segY: 578, segW: 146, segH: 38, segFont: 15,
  pillY: 668, pillSize: 29, pillH: 70,
  matLabelY: 828, matLabelSize: 18,
  namesY: 920, nameGap: 122, nameSize: 100,
  dividerY: 1240, dividerHalf: 80,
  venueY: 1300, venueSize: 25,
  freeY: 1348, freeSize: 21,
  ctaRuleHalf: 180, ctaRuleY: 1420,
  ctaY: 1492, ctaSize: 33, cta: "RESERVE FREE TICKETS",
  ctaSub: "TAP THE LINK STICKER", ctaSubY: 1544, ctaSubSize: 19,
};

// ---------------------------------------------------------------------------
// Series-overview composition (every date)
// ---------------------------------------------------------------------------

function composeOverview(W, H, o) {
  const cx = W / 2;
  let s = backdropRose(W, H, o.grain);
  s += bokeh(cx, o.bokehY);
  s += T({ text: "THE LATINA SWEAT PROJECT", x: cx, y: o.eyebrowY, size: o.eyebrowSize, color: P.cream, weight: 900, tracking: 9, opacity: 0.92 });
  s += T({ text: "Trio Community Classes", x: cx, y: o.titleY, size: o.titleSize, color: P.cream, weight: 400, family: SERIF, italic: true });
  s += T({ text: `YTT ’26 · ${yttTrioSessions.length} FREE CLASSES · ONE 45-MINUTE FLOW, THREE NEW TEACHERS`, x: cx, y: o.sublineY, size: o.sublineSize, color: P.gold, weight: 900, tracking: 2, opacity: 0.95 });

  const left = o.rowLeft;
  const right = W - o.rowLeft;
  yttTrioSessions.forEach((sess, i) => {
    const rowY = o.rowsY + i * o.rowH;
    if (i % 2 === 0) {
      s += `<rect x="${left - 26}" y="${rowY - o.rowH * 0.62}" width="${right - left + 52}" height="${o.rowH - 6}" rx="10" fill="rgba(246,239,227,0.035)"/>`;
    }
    const when = `${sess.dayShort} · ${sess.dateShort} · ${sess.timeShort}`.toUpperCase();
    s += lsp.txt({ text: when, x: left, y: rowY, size: o.whenSize, color: P.gold, weight: 800, tracking: 1.5, opacity: 0.95 });
    s += lsp.txt({ text: sess.instructors.join(" · "), x: right, y: rowY, size: o.nameSize, color: P.cream, weight: 600, anchor: "end", opacity: 0.94 });
  });

  const below = o.rowsY + (yttTrioSessions.length - 1) * o.rowH;
  s += lsp.divider(cx, below + o.divGap, o.dividerHalf, 0.3);
  s += T({ text: "LSP STUDIO · 949 W 16TH ST · PILSEN", x: cx, y: below + o.venueGap, size: o.venueSize, color: P.gold, weight: 900, tracking: 3.5, opacity: 0.96 });
  s += T({ text: "FREE · ALL LEVELS · DONATION TO LSP ENCOURAGED", x: cx, y: below + o.freeGap, size: o.freeSize, color: P.cream, weight: 700, tracking: 2, opacity: 0.8 });
  s += lsp.rule(cx - o.ctaRuleHalf, below + o.ctaRuleGap, o.ctaRuleHalf * 2, 0.4);
  s += T({ text: o.cta, x: cx, y: below + o.ctaGap, size: o.ctaSize, color: P.gold, weight: 900, tracking: 3 });
  if (o.ctaSub) s += T({ text: o.ctaSub, x: cx, y: below + o.ctaSubGap, size: o.ctaSubSize, color: P.cream, weight: 700, tracking: 2, opacity: 0.55 });

  return lsp.svgRoot(W, H, s, { defsBlock: defsRose(o.haloCy), superSample: 2 });
}

const OVERVIEW_POST_OPTS = {
  grain: 200, haloCy: "20%", bokehY: 70,
  eyebrowY: 118, eyebrowSize: 22,
  titleY: 216, titleSize: 76,
  sublineY: 268, sublineSize: 17,
  rowsY: 340, rowH: 55, rowLeft: 108, whenSize: 20, nameSize: 22,
  divGap: 46, dividerHalf: 70,
  venueGap: 96, venueSize: 22,
  freeGap: 138, freeSize: 19,
  ctaRuleHalf: 160, ctaRuleGap: 178,
  ctaGap: 236, ctaSize: 27, cta: "FREE TICKETS AT THE LINK IN BIO",
  ctaSub: "", ctaSubGap: 0, ctaSubSize: 0,
};

const OVERVIEW_STORY_OPTS = {
  grain: 280, haloCy: "22%", bokehY: 282,
  eyebrowY: 330, eyebrowSize: 24,
  titleY: 436, titleSize: 84,
  sublineY: 492, sublineSize: 18,
  rowsY: 576, rowH: 60, rowLeft: 96, whenSize: 21, nameSize: 23,
  divGap: 50, dividerHalf: 76,
  venueGap: 104, venueSize: 23,
  freeGap: 148, freeSize: 20,
  ctaRuleHalf: 170, ctaRuleGap: 194,
  ctaGap: 256, ctaSize: 30, cta: "RESERVE FREE TICKETS",
  ctaSub: "TAP THE LINK STICKER", ctaSubGap: 302, ctaSubSize: 18,
};

// ---------------------------------------------------------------------------
// Render everything
// ---------------------------------------------------------------------------

const made = [];
async function out(markup, w, h, name) {
  const p = path.join(outDir, name);
  await lsp.renderPNG(sharp, markup, p, { resize: [w, h] });
  made.push(name);
}

await out(composeOverview(1080, 1350, OVERVIEW_POST_OPTS), 1080, 1350, "ytt-trio-00-all-dates-post-1080x1350.png");
await out(composeOverview(1080, 1920, OVERVIEW_STORY_OPTS), 1080, 1920, "ytt-trio-00-all-dates-story-1080x1920.png");

for (let i = 0; i < yttTrioSessions.length; i += 1) {
  const sess = yttTrioSessions[i];
  const n = String(i + 1).padStart(2, "0");
  await out(composeSession(sess, 1080, 1350, POST_OPTS), 1080, 1350, `ytt-trio-${n}-${sess.id}-post-1080x1350.png`);
  await out(composeSession(sess, 1080, 1920, STORY_OPTS), 1080, 1920, `ytt-trio-${n}-${sess.id}-story-1080x1920.png`);
}

console.log(JSON.stringify({ outDir, count: made.length, made }, null, 2));
