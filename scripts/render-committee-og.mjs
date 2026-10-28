// /committee share graphics in the "candlelit rose" identity of /graduation (see the header
// comment in src/pages/graduation.astro): soft rose and orchid light, cream, candle-bokeh dot
// rows as the only ornament, no hairlines, no gradient bars, generous radii, soft gold.
// Display type is Fraunces, labels Rubik.
//
// Photo: public/images/graduation/hero.jpg (graduation night 2026, the group holding certificates; 1024x683
// is the largest copy in the repo). The people fill the lower ~60 % of the frame, so every
// layout keeps the whole row in frame and puts ALL text over the ceiling or in the ink bands,
// never on faces.
//
// Output (public/images/committee/):
//   committee-og.jpg      1200x630   og:image
//   committee-square.jpg  1080x1080  IG feed
//   committee-story.jpg   1080x1920  IG story
//
// FONTS: sharp's prebuilt libvips renders SVG text through pango's CoreText backend on macOS,
// so FONTCONFIG_FILE is ignored and only fonts registered with the OS are visible. The script
// downloads the OFL Fraunces + Rubik static TTFs from Google Fonts into scripts/fonts/
// (gitignored) and copies them into ~/Library/Fonts/. A freshly copied font can take a few
// seconds before fontd hands it to a new process; if the first run says a font is missing,
// just run it again.
//
// Usage: node scripts/render-committee-og.mjs
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
const ROOT = "/Users/fezqazi/Documents/Latina Sweat Project Website/latinasweatproject";
const sharp = createRequire(path.join(ROOT, "package.json"))("sharp");
sharp.concurrency(1);

const OUT = path.join(ROOT, "public/images/committee");
await mkdir(OUT, { recursive: true });

// ---------- fonts ----------
const FONT_DIR = path.join(ROOT, "scripts/fonts");
const GS = "https://fonts.gstatic.com/s";
const FONTS = [ // static instances (Google serves whole hundreds only; 600 is the nearest to the page's 650)
  ["Fraunces-600.ttf", `${GS}/fraunces/v38/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58nib1603gg7S2nfgRYIcaRyjDg.ttf`],
  ["Rubik-500.ttf", `${GS}/rubik/v31/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-NYi1UA.ttf`],
  ["Rubik-600.ttf", `${GS}/rubik/v31/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-2Y-1UA.ttf`],
];
await mkdir(FONT_DIR, { recursive: true });
const userFonts = path.join(os.homedir(), "Library/Fonts");
for (const [file, url] of FONTS) {
  const local = path.join(FONT_DIR, file);
  if (!existsSync(local)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`font download failed: ${url} (${res.status})`);
    await writeFile(local, Buffer.from(await res.arrayBuffer()));
  }
  if (!existsSync(path.join(userFonts, file))) await copyFile(local, path.join(userFonts, file));
}

// ---------- palette (graduation.astro / committee.astro tokens) ----------
const INK = "#1e1216", INK_RAISED = "#2b1520", PAPER = "#f6efe3", CARD_INK = "#2a1820",
      GOLD_L = "#f0c57c", ROSE = "#e08cb8", ORCHID = "#b77ad6";
const SERIF = "Fraunces", SANS = "Rubik";

const esc = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'/g, "&#8217;");
const txt = ({ t, x, y, s, c = PAPER, w = 500, f = SANS, anchor = "middle", track = 0, o = 1 }) =>
  `<text x="${x}" y="${y}" font-family="${f}" font-size="${s}" font-weight="${w}" fill="${c}" text-anchor="${anchor}" letter-spacing="${track}" opacity="${o}">${esc(t)}</text>`;

// real rendered width of a text run (trim a lone render); used to size the pills
async function measure(o) {
  const pad = 40, W = Math.ceil(o.s * o.t.length + pad * 2), H = Math.ceil(o.s * 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${txt({ ...o, x: pad, y: o.s * 1.3, anchor: "start", c: "#000" })}</svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  return info.width;
}

// small cream LSP mark: the X goes cream, the inner disc stays open, the sun stays gold
async function creamMark() {
  const { data, info } = await sharp(path.join(ROOT, "scripts/mark_x_only.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cream = [0xf6, 0xef, 0xe3], gold = [0xf0, 0xc5, 0x7c];
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a === 0) continue;
    const lum = (r + g + b) / 3, warm = r - b;
    let rgb, alpha;
    if (warm > 60) { rgb = gold; alpha = a; }                          // sun
    else { rgb = cream; alpha = Math.round(a * Math.max(0, Math.min(1, (235 - lum) / 200))); } // X (white disc drops out)
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = alpha;
  }
  const png = await sharp(data, { raw: info }).png().toBuffer();
  return { href: "data:image/png;base64," + png.toString("base64"), ratio: info.height / info.width };
}
const MARK = await creamMark();
const mark = (x, y, w, o = 0.92) => `<image href="${MARK.href}" x="${x}" y="${y}" width="${w}" height="${w * MARK.ratio}" opacity="${o}"/>`;

// hero crop as a data URI at native resolution (librsvg scales it on the 2x raster)
const HERO = path.join(ROOT, "public/images/graduation/hero.jpg");
async function heroCrop(crop) {
  const buf = await sharp(HERO).extract(crop).modulate({ brightness: 0.98, saturation: 1.0 }).jpeg({ quality: 92 }).toBuffer();
  return "data:image/jpeg;base64," + buf.toString("base64");
}

// candle row: five equal soft-gold dots with a glow (the /committee progress motif)
function candles(cx, cy, r, gap) {
  let s = "";
  for (let i = 0; i < 5; i++) {
    const x = cx + (i - 2) * gap;
    s += `<circle cx="${x}" cy="${cy}" r="${r * 3}" fill="url(#candleGlow)"/>`;
    s += `<circle cx="${x}" cy="${cy}" r="${r}" fill="${GOLD_L}"/>`;
  }
  return s;
}

// cream pill with a centered label; width from the measured text
async function pill({ t, x, y, s, w = 600, track = 0, padX, h, anchor = "middle", c = CARD_INK }) {
  const tw = await measure({ t, s, w, track });
  const pw = tw + padX * 2, px = anchor === "middle" ? x - pw / 2 : x;
  // letter-spacing adds trailing space after the last glyph; nudge left by half of it
  return `<rect x="${px}" y="${y}" width="${pw}" height="${h}" rx="${h / 2}" fill="${PAPER}" opacity="0.96"/>` +
    txt({ t, x: px + pw / 2 + track / 2, y: y + h / 2 + s * 0.36, s, w, track, c });
}

// photo block: hero crop + rose/orchid wash + vignettes. fadeTop/fadeBottom (fractions of the
// block height) mask the photo itself out into the ink background, so there is no seam.
function photoBlock({ href, x, y, w, h, topDark, fadeTop = 0, fadeBottom = 0, id }) {
  const bottomStops = fadeBottom
    ? `<stop offset="${1 - fadeBottom}" stop-color="#fff"/><stop offset="1" stop-color="#000"/>`
    : `<stop offset="1" stop-color="#fff"/>`;
  return `
  <defs>
    <linearGradient id="mg${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${fadeTop ? "#000" : "#fff"}"/><stop offset="${fadeTop}" stop-color="#fff"/>${bottomStops}
    </linearGradient>
    <mask id="m${id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#mg${id})"/></mask>
    <radialGradient id="orchidL${id}" cx="0.08" cy="0.3" r="0.6"><stop offset="0" stop-color="${ORCHID}" stop-opacity="0.26"/><stop offset="1" stop-color="${ORCHID}" stop-opacity="0"/></radialGradient>
    <radialGradient id="roseR${id}" cx="0.95" cy="0.3" r="0.55"><stop offset="0" stop-color="${ROSE}" stop-opacity="0.2"/><stop offset="1" stop-color="${ROSE}" stop-opacity="0"/></radialGradient>
    <linearGradient id="top${id}" x1="0" y1="0" x2="0" y2="1">
      ${topDark.map(([o, a]) => `<stop offset="${o}" stop-color="${INK}" stop-opacity="${a}"/>`).join("")}
    </linearGradient>
    <linearGradient id="bottom${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.86" stop-color="${INK}" stop-opacity="0"/><stop offset="1" stop-color="${INK}" stop-opacity="0.4"/>
    </linearGradient>
    <radialGradient id="sides${id}" cx="0.5" cy="0.62" r="0.75"><stop offset="0.64" stop-color="${INK}" stop-opacity="0"/><stop offset="1" stop-color="${INK}" stop-opacity="0.28"/></radialGradient>
  </defs>
  <g mask="url(#m${id})">
    <image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${ROSE}" opacity="0.12"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#orchidL${id})"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#roseR${id})"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#top${id})"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#bottom${id})"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#sides${id})"/>
  </g>`;
}

function frame(W, H, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="inkBg" x1="0" y1="0" x2="0.12" y2="1"><stop offset="0" stop-color="${INK_RAISED}"/><stop offset="0.5" stop-color="${INK}"/><stop offset="1" stop-color="${INK}"/></linearGradient>
    <radialGradient id="candleGlow"><stop offset="0" stop-color="${GOLD_L}" stop-opacity="0.55"/><stop offset="0.45" stop-color="#d79b47" stop-opacity="0.18"/><stop offset="1" stop-color="#d79b47" stop-opacity="0"/></radialGradient>
    <radialGradient id="roseOrb"><stop offset="0" stop-color="${ROSE}" stop-opacity="0.22"/><stop offset="1" stop-color="${ROSE}" stop-opacity="0"/></radialGradient>
    <radialGradient id="bokeh"><stop offset="0" stop-color="${GOLD_L}" stop-opacity="0.9"/><stop offset="0.55" stop-color="#d79b47" stop-opacity="0.25"/><stop offset="1" stop-color="#d79b47" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#inkBg)"/>
  ${body}</svg>`;
}
const orb = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#roseOrb)"/>`;
const bokeh = (cx, cy, r, o) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#bokeh)" opacity="${o}"/>`;

const EYEBROW = "GET INVOLVED", HEAD = "Join a committee", URL = "latinasweatproject.com/committee";
const LINE = "Tell us where you'd fit. LSP leadership and the Junior Board will place you.";
const LINE2 = ["Tell us where you'd fit.", "LSP leadership and the Junior Board will place you."];
const LINE3 = ["Tell us where you'd fit.", "LSP leadership and the Junior Board", "will place you."];

// ---------- og 1200x630: full-bleed photo, text over the ceiling ----------
// source crop y 72..610 (538 tall = 1024/1200*630); the tallest heads land at ~y 262
const og = frame(1200, 630, `
  ${photoBlock({ id: "o", href: await heroCrop({ left: 0, top: 72, width: 1024, height: 538 }), x: 0, y: 0, w: 1200, h: 630,
    topDark: [[0, 0.9], [0.25, 0.8], [0.37, 0.5], [0.45, 0]] })}
  ${await pill({ t: EYEBROW, x: 600, y: 30, s: 15, w: 600, track: 3.4, padX: 20, h: 34 })}
  ${txt({ t: HEAD, x: 600, y: 140, s: 84, w: 600, f: SERIF, track: -1 })}
  ${candles(600, 169, 4.5, 26)}
  ${txt({ t: LINE, x: 600, y: 213, s: 24, w: 500, c: PAPER, o: 0.94 })}
  ${mark(1122, 31, 44)}
  ${await pill({ t: URL, x: 28, y: 574, s: 18, w: 500, padX: 18, h: 34, anchor: "start" })}
`);

// ---------- square 1080x1080: ink band above, photo in the lower two thirds ----------
// full photo width at 1080 (scale 1.0547), placed at y 372; heads ~y 683, people end ~y 990
const SQ_Y = 372, SQ_H = 720;
const square = frame(1080, 1080, `
  ${orb(140, 120, 360)}${orb(960, 260, 300)}
  ${bokeh(96, 236, 12, 0.35)}${bokeh(984, 120, 14, 0.4)}${bokeh(880, 330, 8, 0.3)}${bokeh(190, 72, 8, 0.3)}
  ${photoBlock({ id: "s", href: await heroCrop({ left: 0, top: 0, width: 1024, height: 683 }), x: 0, y: SQ_Y, w: 1080, h: SQ_H,
    topDark: [[0, 0.75], [0.32, 0.5], [0.41, 0]], fadeTop: 0.3 })}
  ${await pill({ t: EYEBROW, x: 540, y: 128, s: 19, w: 600, track: 4.2, padX: 26, h: 44 })}
  ${txt({ t: HEAD, x: 540, y: 296, s: 112, w: 600, f: SERIF, track: -1.4 })}
  ${candles(540, 342, 6, 34)}
  ${LINE2.map((t, i) => txt({ t, x: 540, y: 414 + i * 46, s: 33, w: 500, o: 0.94 })).join("")}
  ${mark(992, 56, 50)}
  ${await pill({ t: URL, x: 40, y: 1006, s: 22, w: 500, padX: 22, h: 42, anchor: "start" })}
`);

// ---------- story 1080x1920: text in the ink band above, photo in the middle, URL below ----------
// photo 1080x720 at y 900; heads ~y 1211, people end ~y 1517; IG chrome covers ~top 250 / bottom 250
const ST_Y = 900, ST_H = 720;
const story = frame(1080, 1920, `
  ${orb(120, 440, 460)}${orb(980, 820, 380)}${orb(540, 1800, 520)}
  ${bokeh(110, 330, 14, 0.38)}${bokeh(965, 470, 16, 0.4)}${bokeh(880, 250, 9, 0.3)}${bokeh(170, 820, 10, 0.3)}
  ${bokeh(930, 1700, 14, 0.34)}${bokeh(150, 1790, 10, 0.28)}${bokeh(720, 1830, 9, 0.26)}
  ${photoBlock({ id: "t", href: await heroCrop({ left: 0, top: 0, width: 1024, height: 683 }), x: 0, y: ST_Y, w: 1080, h: ST_H,
    topDark: [[0, 0.75], [0.32, 0.5], [0.41, 0]], fadeTop: 0.3, fadeBottom: 0.14 })}
  ${mark(498, 262, 84)}
  ${await pill({ t: EYEBROW, x: 540, y: 372, s: 22, w: 600, track: 4.8, padX: 30, h: 52 })}
  ${txt({ t: "Join a", x: 540, y: 588, s: 150, w: 600, f: SERIF, track: -1.5 })}
  ${txt({ t: "committee", x: 540, y: 742, s: 150, w: 600, f: SERIF, track: -1.5 })}
  ${candles(540, 808, 7, 40)}
  ${LINE3.map((t, i) => txt({ t, x: 540, y: 888 + i * 52, s: 38, w: 500, o: 0.94 })).join("")}
  ${await pill({ t: URL, x: 64, y: 1650, s: 28, w: 500, padX: 28, h: 56, anchor: "start" })}
`);

for (const [svg, w, h, name] of [[og, 1200, 630, "committee-og"], [square, 1080, 1080, "committee-square"], [story, 1080, 1920, "committee-story"]]) {
  const png = await sharp(Buffer.from(svg), { density: 144 }).resize(w, h).png().toBuffer();
  await sharp(png).jpeg({ quality: 88, mozjpeg: true, progressive: true }).toFile(path.join(OUT, `${name}.jpg`));
}

// sanity check: Fraunces must be the face that rendered (CoreText silently falls back)
const probe = t => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="120"><text x="10" y="90" font-family="${t}" font-size="80" font-weight="600">committee</text></svg>`;
const wOf = async f => (await sharp(Buffer.from(probe(f))).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true })).info.width;
const [wf, wx] = [await wOf(SERIF), await wOf("NoSuchFontXYZ")];
if (Math.abs(wf - wx) < 3) console.warn("WARNING: Fraunces did not render (fell back to the default face). Run again in a few seconds.");
console.log("done", OUT);
