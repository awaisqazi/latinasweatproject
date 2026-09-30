// The Collective Finish Line (Oct 5 – 14, 2026) web assets in the Canva
// flyer's torn-paper identity (paper ground, cream sheet with a deckle top
// edge and grey tape, heavy charcoal grotesk, marigold "What to expect" box
// with white pills, taupe LSP tag). NOT gala navy, NOT pop-up terracotta.
//   public/images/finishline/og-finishline.jpg   1200x630 Open Graph card
//   public/images/highlights/hl_finishline.png   420x420 /links highlight bubble
//   public/images/finishline/flyer.jpg           jpg twin of flyer.webp
//
// Facts come from src/data/collectiveFinishLine.js. Rendered with sharp +
// SVG (librsvg resolves macOS system fonts: Avenir Next Heavy for display).
// Drawing helpers come from the lsp-event-graphics skill, same as
// marketing/collective-finish-line/render-cfl-cover.mjs (the Zeffy cover).
//
// Usage (from the repo root): node scripts/render-finishline-og.mjs
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { collectiveFinishLine as cfl } from "../src/data/collectiveFinishLine.js";

const lsp = await import(path.join(process.env.HOME, ".claude/skills/lsp-event-graphics/scripts/lsp_graphics.mjs"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharp = lsp.loadSharp();
const P = cfl.colors;
const FAM = `"Avenir Next", "Helvetica Neue", Arial, sans-serif`;
const T = (p) => lsp.txt({ family: FAM, ...p }).replace(`font-family="${FAM}"`, `font-family='${FAM}'`);

// White LSP X mark for the taupe tag (source is black on transparent).
const alpha = await sharp(lsp.ASSETS.logoMark).ensureAlpha().extractChannel(3).toBuffer();
const whiteMark = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#ffffff" } })
  .joinChannel(alpha).png().toBuffer();
const markPng = await sharp(await sharp(whiteMark).extract({ left: 0, top: 80, width: 1024, height: 800 }).png().toBuffer())
  .trim().resize(160, 160, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const markURI = `data:image/png;base64,${markPng.toString("base64")}`;

async function measure(text, size, weight, tracking = 0) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="${size * 2}">${T({ text, x: 10, y: size * 1.3, size, color: "#000", weight, tracking })}</svg>`;
  const { info } = await sharp(Buffer.from(svg)).flatten({ background: "#fff" }).trim().toBuffer({ resolveWithObject: true });
  return info.width;
}
function tornTop(x0, x1, y, step = 14, amp = 16, seed = 7) {
  let d = `M${x0},${y + 10}`;
  let r = seed;
  for (let x = x0; x <= x1; x += step) {
    r = (r * 9301 + 49297) % 233280;
    d += ` L${x},${(y + (r / 233280) * amp - amp / 4).toFixed(1)}`;
  }
  return d;
}
const sheet = (x, y, w, h, opts) => {
  const d = `${tornTop(x, x + w, y, opts?.step, opts?.amp)} L${x + w},${y + h} L${x},${y + h} Z`;
  return `<path d="${d}" fill="#000" opacity="0.07" transform="translate(5 8)"/>` +
    `<path d="${d}" fill="${P.sheet}"/><path d="${d}" fill="none" stroke="#D9D6CC" stroke-width="2"/>`;
};
const tape = (cx, cy, w, h, rot) =>
  `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${P.tape}" opacity="0.7" transform="rotate(${rot} ${cx} ${cy})"/>`;
const tag = async (x, y, h, size) => {
  const w = Math.round(h * 1.1 + (await measure("The Latina Sweat Project", size, 600)) + h * 0.35);
  return {
    w,
    svg: `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h * 0.12}" fill="${P.taupe}"/>` +
      `<image href="${markURI}" x="${x + h * 0.18}" y="${y + h * 0.13}" width="${h * 0.74}" height="${h * 0.74}"/>` +
      T({ text: "The Latina Sweat Project", x: x + h * 1.1, y: y + h * 0.63, size, color: P.white, weight: 600 }),
  };
};
const pill = (x, y, w, h, lines, size, rot) => {
  const cx = x + w / 2, cy = y + h / 2;
  const lh = size * 1.15;
  const y0 = cy - ((lines.length - 1) * lh) / 2 + size * 0.34;
  return `<g transform="rotate(${rot} ${cx} ${cy})">` +
    `<rect x="${x + 2}" y="${y + 4}" width="${w}" height="${h}" rx="${Math.min(h / 2, 30)}" fill="#000" opacity="0.08"/>` +
    lsp.pill(x, y, w, h, { fill: P.white }).replace(/rx="[^"]*"/, `rx="${Math.min(h / 2, 30)}"`) +
    lines.map((ln, i) => T({ text: ln, x: cx, y: y0 + i * lh, size, color: P.charcoal, weight: 600, anchor: "middle" })).join("") +
    `</g>`;
};

// ---- OG 1200x630 -----------------------------------------------------------
{
  const W = 1200, H = 630;
  let s = `<rect width="${W}" height="${H}" fill="${P.paper}"/>`;
  s += sheet(36, 30, W - 72, H - 60);
  s += tape(70, 42, 170, 40, -35);
  s += tape(W - 60, H - 40, 170, 40, -35);
  const t = await tag(84, 70, 52, 21);
  s += t.svg;
  const HS = 104, hx = 78;
  s += T({ text: "The", x: hx, y: 224, size: HS, color: P.charcoal, weight: 900, tracking: -2 });
  s += T({ text: "Collective", x: hx, y: 322, size: HS, color: P.charcoal, weight: 900, tracking: -2 });
  s += T({ text: "Finish Line", x: hx, y: 420, size: HS, color: P.charcoal, weight: 900, tracking: -2 });
  s += T({ text: "CHICAGO MARATHON WEEK · PILSEN", x: hx + 6, y: 470, size: 20, color: P.charcoal, weight: 600, tracking: 3 });
  // date chips
  let dx = hx + 4;
  for (const d of cfl.datePills) {
    const w = (await measure(d.toUpperCase(), 22, 800, 2)) + 44;
    s += `<rect x="${dx}" y="500" width="${w}" height="46" rx="23" fill="${P.charcoal}"/>`;
    s += T({ text: d.toUpperCase(), x: dx + w / 2, y: 531, size: 22, color: P.sheet, weight: 800, tracking: 2, anchor: "middle" });
    dx += w + 12;
  }
  // marigold box
  const bx = 790, by = 120, bw = 332, bh = 420;
  s += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="20" fill="${P.marigold}"/>`;
  s += T({ text: "WHAT TO EXPECT:", x: bx + bw / 2, y: by + 62, size: 26, color: P.charcoal, weight: 800, tracking: 2, anchor: "middle" });
  s += pill(bx + 56, by + 96, bw - 112, 60, ["Yoga Flow"], 26, -2);
  s += pill(bx + 50, by + 180, bw - 100, 60, ["Community"], 26, 2);
  s += pill(bx + 28, by + 266, bw - 56, 104, ["Motivational talk", "by seasoned runners"], 24, -1.5);
  const markup = lsp.svgRoot(W, H, s, { defsBlock: "" });
  await sharp(Buffer.from(markup)).flatten({ background: P.paper }).jpeg({ quality: 88, mozjpeg: true })
    .toFile(path.join(root, "public/images/finishline/og-finishline.jpg"));
}

// ---- Highlight bubble 420x420 (matches hl_popup.png footprint) -------------
{
  const S = 420;
  let s = `<rect width="${S}" height="${S}" fill="${P.paper}"/>`;
  s += sheet(40, 58, S - 80, S - 96, { step: 12, amp: 12 });
  s += tape(S / 2, 64, 120, 30, -4);
  s += T({ text: "Finish", x: S / 2, y: 196, size: 96, color: P.charcoal, weight: 900, tracking: -2, anchor: "middle" });
  s += T({ text: "Line", x: S / 2, y: 284, size: 96, color: P.charcoal, weight: 900, tracking: -2, anchor: "middle" });
  s += `<rect x="${S / 2 - 100}" y="312" width="200" height="44" rx="22" fill="${P.marigold}"/>`;
  s += T({ text: "OCT 5 – 14", x: S / 2, y: 342, size: 22, color: P.charcoal, weight: 800, tracking: 3, anchor: "middle" });
  const markup = lsp.svgRoot(S, S, s, { defsBlock: "" });
  await sharp(Buffer.from(markup)).png({ compressionLevel: 9 })
    .toFile(path.join(root, "public/images/highlights/hl_finishline.png"));
}

// ---- Flyer jpg twin ----------------------------------------------------------
const flyerWebp = path.join(root, "public", cfl.flyer.webp);
if (existsSync(flyerWebp)) {
  await sharp(flyerWebp).flatten({ background: P.paper }).jpeg({ quality: 84, mozjpeg: true })
    .toFile(path.join(root, "public", cfl.flyer.jpg));
}
console.log("wrote og-finishline.jpg + hl_finishline.png + flyer.jpg");
