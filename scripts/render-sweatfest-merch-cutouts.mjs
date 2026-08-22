// Transparent cutouts of the flat-lay garments from the Sweat Fest merch
// shoot. Runs Apple Vision foreground segmentation (scripts/tools/cutout,
// built from scripts/cutout.swift) over the Final/ crops, trims to the garment,
// pads to a 4:5 canvas, and writes:
//   Downloads/[MERCH] Sweat Fest/Final/transparent/<name>.png   (full res)
//   public/images/merch/sweatfest/<name>.webp                  (1200x1500, alpha)
//
//   swiftc -O -o scripts/tools/cutout scripts/cutout.swift
//   node scripts/render-sweatfest-merch-cutouts.mjs
import sharp from "sharp";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

const FINAL = "/Users/fezqazi/Downloads/[MERCH] Sweat Fest/Final";
const OUT = path.join(FINAL, "transparent");
const WEB = "public/images/merch/sweatfest";
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cutout-"));

const GARMENTS = [
  "sweatfest-tee-charcoal-front", "sweatfest-tee-charcoal-back",
  "sweatfest-tee-black-front", "sweatfest-tee-black-back",
  "sweatfest-tee-white-front", "sweatfest-tee-white-back",
  "lsp-tee-light-grey",
  "lsp-crewneck-heather-grey", "lsp-crewneck-forest-green", "lsp-crewneck-brown",
  "lsp-hoodie-heather-grey", "lsp-hoodie-forest-green", "lsp-hoodie-brown",
  "lsp-zip-hoodie-heather-grey", "lsp-zip-hoodie-forest-green",
];

// Light garments cast a soft grey shadow on the studio floor that Vision
// keeps as part of the foreground. Clean it up: inside a band along the
// mask edge, drop pixels that read as dark neutral floor, then open the
// mask slightly to clear fringe and specks. Dark garments (black, charcoal,
// brown, forest green) skip the color test so their own fabric survives.
const LIGHT = new Set([
  "sweatfest-tee-white-front", "sweatfest-tee-white-back",
  "lsp-crewneck-heather-grey", "lsp-hoodie-heather-grey", "lsp-zip-hoodie-heather-grey",
]);
const minFilter = (src, w, h, r) => {
  // Separable min filter (erosion) on a Uint8 mask.
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { const v = src[row + k]; if (v < m) { m = v; if (!m) break; } }
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 255;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { const v = tmp[k * w + x]; if (v < m) { m = v; if (!m) break; } }
      out[y * w + x] = m;
    }
  }
  return out;
};
const maxFilter = (src, w, h, r) => {
  const inv = src.map((v) => 255 - v);
  return minFilter(inv, w, h, r).map((v) => 255 - v);
};
const cleanShadow = async (pngPath, light) => {
  const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = data[i * 4 + 3] > 128 ? 255 : 0;
  if (light) {
    const band = 90; // px at ~3000px wide: how deep the shadow reaches
    const core = minFilter(mask, w, h, band);
    for (let i = 0; i < n; i++) {
      if (!mask[i] || core[i]) continue;
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      // Floor shadow reads ~60-100; shaded fabric folds on these garments stay above ~115.
      if (lum < 112 && sat < 30) mask[i] = 0;
    }
  }
  // Opening: erode then dilate, clears fringe and leftover specks.
  const opened = maxFilter(minFilter(mask, w, h, 4), w, h, 4);
  // Feather the edge by 1px via the alpha channel blur.
  // (sharp may widen a 1-channel raw buffer on output, so read the stride.)
  const { data: alpha, info: ai } = await sharp(Buffer.from(opened), { raw: { width: w, height: h, channels: 1 } })
    .blur(0.8).raw().toBuffer({ resolveWithObject: true });
  const stride = ai.channels;
  const out = Buffer.from(data);
  for (let i = 0; i < n; i++) out[i * 4 + 3] = Math.min(data[i * 4 + 3], alpha[i * stride]);
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toFile(pngPath);
};

// Pad a trimmed cutout to a 4:5 canvas with the garment filling ~86% of
// the width (or height, whichever binds), centered.
const onCanvas = async (buf, W, H) => {
  const m = await sharp(buf).metadata();
  const scale = Math.min((W * 0.86) / m.width, (H * 0.86) / m.height);
  const w = Math.round(m.width * scale), h = Math.round(m.height * scale);
  const inner = await sharp(buf).resize(w, h).png().toBuffer();
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: inner, left: Math.round((W - w) / 2), top: Math.round((H - h) / 2) }]);
};

for (const name of GARMENTS) {
  const raw = path.join(tmp, `${name}.png`);
  execFileSync("scripts/tools/cutout", [path.join(FINAL, `${name}.jpg`), raw]);
  await cleanShadow(raw, LIGHT.has(name));
  // Trim to the alpha bounding box (threshold keeps faint mask fringe out).
  const trimmed = await sharp(raw).trim({ threshold: 12 }).png().toBuffer();
  const m = await sharp(trimmed).metadata();
  // Full-res: 4:5 canvas sized from the trimmed garment.
  const W = Math.round(Math.max(m.width / 0.86, (m.height / 0.86) * 0.8));
  const H = Math.round(W * 1.25);
  await (await onCanvas(trimmed, W, H)).png({ compressionLevel: 9 }).toFile(path.join(OUT, `${name}.png`));
  await (await onCanvas(trimmed, 1200, 1500)).webp({ quality: 82, alphaQuality: 90 }).toFile(path.join(WEB, `${name}.webp`));
  console.log("✓", name, `${m.width}x${m.height}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
