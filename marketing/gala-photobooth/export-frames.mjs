// Annual Gala 2026 photo-booth frames: standalone client PNGs.
//
// For each of the seven gala 2026 frames (src/data/photobooth.js ids that
// scripts/photobooth-gala26.mjs builds), renders a transparent-window overlay
// in four formats with the SAME builder functions the site uses:
//
//   ig-story-1080x1920.png    = the site's story ratio (same window)
//   ig-post-1080x1350.png     = the site's portrait ratio (same window)
//   portrait-2400x3000.png    4:5 hi-res; the post design scaled x2.22 with
//                             the window 160 px in from the sides
//   landscape-3000x2000.png   3:2; photo window left, branding panel right
//                             (stamps: full-bleed, cards scaled)
//
// plus preview-<frame-id>.jpg: the story overlay over a neutral grey
// placeholder (abstract figures only, never a real photo) so the client can
// judge it without a selfie.
//
// Usage (repo root):  node marketing/gala-photobooth/export-frames.mjs [frame-id ...]
// Output:             output/gala-2026/final/photobooth-frames/<frame-id>/
//
// QA printed per file: photo-window alpha (every pixel 1.5 px inside the
// window must be alpha 0; every pixel 1.5 px outside, alpha 255 on bordered
// frames), a faces-clear check on stamps (the middle half of the canvas must
// be fully transparent), and the smallest text in px at a 1080 short side.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PHOTOBOOTH_FRAMES, photoWindow } from "../../src/data/photobooth.js";
import {
  CHROME,
  gala26Builders,
  gala26FontCss,
  gala26Prepare,
  gala26ResetTextLog,
  gala26TextLog,
} from "../../scripts/photobooth-gala26.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "output/gala-2026/final/photobooth-frames");
const sharp = createRequire(import.meta.url)("sharp");

const only = process.argv.slice(2);
const frames = PHOTOBOOTH_FRAMES.filter(
  (f) => gala26Builders[f.id] && (!only.length || only.includes(f.id)),
);
if (!frames.length) throw new Error(`no gala 2026 frames match ${only.join(", ")}`);

const full = (W, H) => ({ x: 0, y: 0, w: W, h: H, r: 0 });
const FORMATS = [
  {
    file: "ig-story-1080x1920.png",
    W: 1080,
    H: 1920,
    win: (f) => photoWindow(f.id, "story"),
  },
  {
    file: "ig-post-1080x1350.png",
    W: 1080,
    H: 1350,
    win: (f) => photoWindow(f.id, "portrait"),
  },
  {
    file: "portrait-2400x3000.png",
    W: 2400,
    H: 3000,
    win: (f) => {
      if (f.fullBleed) return full(2400, 3000);
      const p = photoWindow(f.id, "portrait");
      const k = 2400 / 1080;
      return { x: 160, y: Math.round(p.y * k), w: 2400 - 320, h: Math.round(p.h * k), r: Math.round(p.r * k) };
    },
  },
  {
    file: "landscape-3000x2000.png",
    W: 3000,
    H: 2000,
    win: (f) => {
      if (f.fullBleed) return full(3000, 2000);
      const k = 2000 / 1080;
      const m = Math.round(60 * k);
      const panel = Math.round(0.32 * 3000);
      return { x: m, y: m, w: 3000 - m - panel, h: 2000 - 2 * m, r: Math.round(28 * k) };
    },
  },
];

const css = `${gala26FontCss}
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; width: 100vw; height: 100vh; }`;

const tmp = mkdtempSync(path.join(tmpdir(), "gala26-export-"));
function render(svgBody, W, H, outPng) {
  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${svgBody}</svg>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${svg}</body></html>`;
  const htmlPath = path.join(tmp, "frame.html");
  const shot = path.join(tmp, "frame.png");
  writeFileSync(htmlPath, html);
  execFileSync(
    CHROME,
    [
      "--headless=new",
      `--screenshot=${shot}`,
      `--window-size=${W},${H}`,
      "--default-background-color=00000000",
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      "--virtual-time-budget=4000",
      "--disable-gpu",
      `file://${htmlPath}`,
    ],
    { stdio: "ignore" },
  );
  return sharp(shot).png({ compressionLevel: 9, palette: false }).toFile(outPng);
}

// Signed distance-ish test against the rounded window: is the pixel centre
// at least d px inside (d > 0) or outside (d < 0) the window edge?
function inside(win, X, Y, d) {
  const r = Math.max(0, win.r - d);
  const x0 = win.x + d;
  const y0 = win.y + d;
  const x1 = win.x + win.w - d;
  const y1 = win.y + win.h - d;
  if (X < x0 || X > x1 || Y < y0 || Y > y1) return false;
  const dx = Math.max(x0 + r - X, 0, X - (x1 - r));
  const dy = Math.max(y0 + r - Y, 0, Y - (y1 - r));
  return dx === 0 || dy === 0 || Math.hypot(dx, dy) <= r;
}

async function qa(file, frame, win) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  let leak = 0;
  let hole = 0;
  let midInk = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const a = data[(y * W + x) * 4 + 3];
      const X = x + 0.5;
      const Y = y + 0.5;
      if (frame.fullBleed) {
        if (Y > H * 0.25 && Y < H * 0.75 && a !== 0) midInk += 1;
      } else if (inside(win, X, Y, 1.5)) {
        if (a !== 0) leak += 1;
      } else if (!inside(win, X, Y, -1.5) && a !== 255) {
        hole += 1;
      }
    }
  }
  return { size: `${W}x${H}`, leak, hole, midInk };
}

// Placeholder "photo": neutral grey with two abstract head-and-shoulders
// shapes where selfie faces usually sit (centre to lower centre).
function placeholderSvg(W, H, win) {
  const cx = win.x + win.w / 2;
  const fy = win.y + win.h * 0.56;
  const s = win.w / 960;
  const fig = (x, y, k) => `
    <circle cx="${x}" cy="${y}" r="${92 * k}" fill="#626262"/>
    <path d="M ${x - 210 * k} ${y + 430 * k} C ${x - 200 * k} ${y + 190 * k}, ${x - 110 * k} ${y + 130 * k}, ${x} ${y + 130 * k}
             C ${x + 110 * k} ${y + 130 * k}, ${x + 200 * k} ${y + 190 * k}, ${x + 210 * k} ${y + 430 * k} Z" fill="#626262"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#9c9c9c"/><stop offset="1" stop-color="#737373"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  ${fig(cx - 170 * s, fy, s)}
  ${fig(cx + 180 * s, fy + 40 * s, s * 0.94)}
</svg>`;
}

// Dry run once so every string is measured before real renders.
await gala26Prepare(() => {
  for (const f of frames) for (const fm of FORMATS) gala26Builders[f.id]({ W: fm.W, H: fm.H, win: fm.win(f) });
});

const report = [];
try {
  for (const f of frames) {
    const dir = path.join(OUT, f.id);
    mkdirSync(dir, { recursive: true });
    for (const fm of FORMATS) {
      const win = fm.win(f);
      gala26ResetTextLog();
      const body = gala26Builders[f.id]({ W: fm.W, H: fm.H, win });
      if (body.includes(String.fromCharCode(0x2014))) throw new Error(`${f.id}: em-dash in output`);
      const minText = Math.min(...gala26TextLog().map((t) => t.px1080));
      const out = path.join(dir, fm.file);
      await render(body, fm.W, fm.H, out);
      const q = await qa(out, f, win);
      report.push({ frame: f.id, file: fm.file, win, minText1080: minText, ...q });
      console.log(`${f.id}/${fm.file} ${q.size} leak=${q.leak} hole=${q.hole}${f.fullBleed ? ` midInk=${q.midInk}` : ""} minText=${minText}px@1080`);
    }
    // Preview: story overlay over the placeholder.
    const story = FORMATS[0];
    const win = story.win(f);
    const ph = await sharp(Buffer.from(placeholderSvg(story.W, story.H, f.fullBleed ? full(story.W, story.H) : win)))
      .png()
      .toBuffer();
    await sharp(ph)
      .composite([{ input: path.join(dir, story.file) }])
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 88 })
      .toFile(path.join(dir, `preview-${f.id}.jpg`));
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const bad = report.filter((r) => r.leak || r.hole || r.midInk || r.minText1080 < 24);
// QA log stays next to the script, out of the client folder.
mkdirSync(path.join(HERE, "build"), { recursive: true });
writeFileSync(path.join(HERE, "build/qa-report.json"), JSON.stringify(report, null, 2));
console.log(`wrote ${report.length} PNGs + ${frames.length} previews to ${OUT}`);
if (bad.length) {
  console.error("QA FAILED:", bad.map((r) => `${r.frame}/${r.file}`).join(", "));
  process.exitCode = 1;
}
