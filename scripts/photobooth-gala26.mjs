// Annual Gala 2026 photo-booth frames: the black-and-white modernist identity
// of the printed program, stickers and paddles (marketing/gala-program/modern,
// marketing/gala-stickers, marketing/gala-paddles). Solid black bands, wide
// Archivo Expanded Black caps, Space Mono Bold caps labels, the circle X
// badge breaking a band edge, the MCA facade drawing, and one accent only,
// gold-orange #FFBD59 (the X core, the lit windows, one hairline at most).
//
// Shared by scripts/render-photobooth-frames.mjs (site ratios, /photobooth)
// and marketing/gala-photobooth/export-frames.mjs (client PNGs, incl. the
// 2400x3000 hi-res portrait and the 3000x2000 landscape). Builders take
// { W, H, win } and scale by k = min(W, H) / 1080; a canvas wider than tall
// gets the landscape composition (photo window left, branding panel right).
//
// Needs the local, untracked gala assets: marketing/gala-program/fonts/*.ttf,
// marketing/gala-program/modern/build/x-black.png (run that build first) and
// marketing/gala-paddles/paddle-silhouette.json.
//
// Text widths are measured in Chrome (the engine that renders), so every
// layout that fits or aligns text is exact: call gala26Prepare(run) with a
// dry run of the builders first; it measures any unmeasured strings.
//
// Copy rules: no em-dashes, nothing invented, never "Noche Inolvidable" or
// "unforgettable". Faces stay clear: bands top and bottom (or the side panel
// in landscape); stamps keep to the top corners and the bottom edge.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FONTS = path.join(root, "marketing/gala-program/fonts");
const XDIR = path.join(root, "marketing/gala-program/modern/build");
const PADDLE_JSON = path.join(root, "marketing/gala-paddles/paddle-silhouette.json");
const FONT_FILES = {
  AX: "LSPArchivoExpanded-Black.ttf",
  AC: "LSPArchivoCondensed-Black.ttf",
  SM: "SpaceMono-Bold.ttf",
};
for (const f of [
  ...Object.values(FONT_FILES).map((n) => path.join(FONTS, n)),
  path.join(XDIR, "x-black.png"),
  PADDLE_JSON,
]) {
  if (!existsSync(f)) throw new Error(`gala photobooth asset missing: ${f}`);
}

export const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const fileUrl = (file) => `file://${encodeURI(file)}`;
const INK = "#000000";
const PAPER = "#FFFFFF";
const GOLD = "#FFBD59";
const SCRIM = 0.86; // stamp cards and bars: near-black, the photo still breathes
const FAMILY = {
  AX: "LSP Archivo Expanded",
  AC: "LSP Archivo Condensed",
  SM: "LSP Space Mono",
};
const WEIGHT = { AX: 900, AC: 900, SM: 700 };
const CAP = { AX: 0.686, AC: 0.686, SM: 0.7 }; // OS/2 cap heights, em
const LEAD = 0.96; // headline baseline-to-baseline, em (program + stickers)
const HL = -0.012; // headline tracking, em (program.css)

export const gala26FontCss = Object.entries(FONT_FILES)
  .map(
    ([f, file]) => `
  @font-face {
    font-family: "${FAMILY[f]}";
    src: url("${fileUrl(path.join(FONTS, file))}") format("truetype");
    font-weight: ${WEIGHT[f]};
  }`,
  )
  .join("");

// ---------------------------------------------------------------------------
// Text. em() is the ink-advance width at 1px (trailing tracking excluded);
// unknown strings are recorded and estimated until gala26Prepare measures.
// ---------------------------------------------------------------------------
const METRICS = new Map();
const WANT = new Map();
const mkey = (f, s, ls) => `${f}|${ls}|${s}`;
function em(f, s, ls = 0) {
  const key = mkey(f, s, ls);
  if (METRICS.has(key)) return METRICS.get(key);
  WANT.set(key, { f, s, ls });
  return s.length * ((f === "SM" ? 0.6 : 0.9) + ls);
}
const fit = (s, f, ls, maxW, maxSize) => Math.min(maxSize, maxW / em(f, s, ls));
const base = (cy, f, size) => cy + (CAP[f] * size) / 2; // caps centred on cy
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const n2 = (v) => +v.toFixed(2);

let K = 1;
let TEXTLOG = [];
export const gala26TextLog = () => TEXTLOG.slice();
export const gala26ResetTextLog = () => {
  TEXTLOG = [];
};

function txt(s, { x, y, size, f = "AX", ls = 0, fill = INK, anchor = "start" }) {
  const w = em(f, s, ls) * size;
  const x0 = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  TEXTLOG.push({ s, f, px1080: n2(size / K) });
  return `<text x="${n2(x0)}" y="${n2(y)}" style="font-family:'${FAMILY[f]}';font-weight:${WEIGHT[f]};font-size:${n2(size)}px;letter-spacing:${ls}em" fill="${fill}">${esc(s)}</text>`;
}

function measureNow() {
  const items = [...WANT.values()];
  const dir = mkdtempSync(path.join(tmpdir(), "gala26-measure-"));
  const fams = Object.keys(FAMILY)
    .map((f) => `'${WEIGHT[f]} 100px "${FAMILY[f]}"'`)
    .join(",");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${gala26FontCss}
  span { position: absolute; white-space: pre; font-size: 100px; }</style></head><body>
<script>
const items = ${JSON.stringify(items)};
const fam = ${JSON.stringify(Object.fromEntries(Object.keys(FAMILY).map((f) => [f, [FAMILY[f], WEIGHT[f]]])))};
Promise.all([${fams}].map((q) => document.fonts.load(q))).then(() => {
  const out = {};
  for (const it of items) {
    const sp = document.createElement('span');
    sp.style.fontFamily = '"' + fam[it.f][0] + '"';
    sp.style.fontWeight = fam[it.f][1];
    sp.style.letterSpacing = it.ls + 'em';
    sp.textContent = it.s;
    document.body.appendChild(sp);
    out[it.f + '|' + it.ls + '|' + it.s] = sp.getBoundingClientRect().width / 100 - it.ls;
  }
  const ok = [${fams}].every((q) => document.fonts.check(q));
  const pre = document.createElement('pre');
  pre.id = 'out';
  pre.textContent = JSON.stringify({ ok, out });
  document.body.appendChild(pre);
});
</script></body></html>`;
  const page = path.join(dir, "measure.html");
  writeFileSync(page, html);
  let dom;
  try {
    dom = execFileSync(
      CHROME,
      [
        "--headless=new",
        "--disable-gpu",
        `--user-data-dir=${path.join(dir, "profile")}`,
        "--virtual-time-budget=6000",
        "--dump-dom",
        fileUrl(page),
      ],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 20000, killSignal: "SIGKILL", maxBuffer: 64 << 20 },
    ).toString();
  } catch (err) {
    // Headless Chrome sometimes prints the DOM and then never exits (same
    // workaround as the sticker build): keep what it printed.
    if (err.code !== "ETIMEDOUT" && err.signal !== "SIGKILL") throw err;
    dom = err.stdout ? err.stdout.toString() : "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  if (!m) throw new Error("gala26: text measurement failed");
  const res = JSON.parse(
    m[1]
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&"),
  );
  if (!res.ok) throw new Error("gala26: gala fonts did not load for measuring");
  for (const [key, w] of Object.entries(res.out)) METRICS.set(key, w);
  WANT.clear();
}

// Dry-run the builders (run), measure what they asked for, repeat until the
// layout is stable (a measured width can switch a one-line/two-line choice).
export async function gala26Prepare(run) {
  for (let pass = 0; pass < 4; pass += 1) {
    run();
    if (!WANT.size) {
      gala26ResetTextLog();
      return;
    }
    measureNow();
  }
  throw new Error(`gala26: unmeasured strings: ${[...WANT.keys()].join(", ")}`);
}

// ---------------------------------------------------------------------------
// Shapes.
// ---------------------------------------------------------------------------
const rect = (x, y, w, h, fill, extra = "") =>
  `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" fill="${fill}" ${extra}/>`;
const circ = (cx, cy, r, attrs) =>
  `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}" ${attrs}/>`;
// Clockwise rounded-rect subpath (same as the site renderer's rr()).
const rr = (x, y, w, h, r) =>
  `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} ` +
  `a${r},${r} 0 0 1 -${r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 -${r},-${r} ` +
  `v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},-${r} z`;
const punched = (W, H, win, fill) =>
  `<path fill-rule="evenodd" fill="${fill}" d="M0,0 h${W} v${H} h-${W} z ${rr(win.x, win.y, win.w, win.h, win.r)}"/>`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The whole LSP X (program raster, 900 x 784), never the centre dot alone;
// the black X keeps its gold core.
const X_BLACK = fileUrl(path.join(XDIR, "x-black.png"));
const X_ASPECT = 784 / 900;
const xMark = (cx, cy, w) => {
  const h = w * X_ASPECT;
  return `<image href="${X_BLACK}" x="${n2(cx - w / 2)}" y="${n2(cy - h / 2)}" width="${n2(w)}" height="${n2(h)}"/>`;
};
// Program circle badge: white disc, black hairline ring, black X at 62%.
function badge(cx, cy, d, { ring = 3 * K } = {}) {
  const disc = circ(
    cx,
    cy,
    d / 2 - ring / 2,
    `fill="${PAPER}" ${ring ? `stroke="${INK}" stroke-width="${n2(ring)}"` : ""}`,
  );
  return disc + xMark(cx, cy, d * 0.62);
}

// MCA front facade, flat elevation; geometry copied from
// marketing/gala-stickers/build.mjs (measured from
// public/images/gala/2026/mca-terrace-lake-view.jpg). The museum's own sign
// and logo are not drawn.
const FACADE = {
  W: 1606,
  H: 631,
  towerL: [14, 0, 234, 482],
  capL: [0, 0, 262, 14],
  shoulderL: [248, 125, 349, 357],
  lipL: [248, 119, 357, 10],
  glass: [597, 202, 412, 300],
  bays: 6,
  floors: 3,
  mullion: 12,
  groundFloor: [457, 45],
  plinthL: [
    [14, 482],
    [574, 482],
    [469, 619],
    [14, 619],
  ],
  openingsL: [
    [27, 517, 215, 102],
    [257, 507, 175, 95],
  ],
  reveal: 9,
  stair: { top: 508, bottom: 619, hwTop: 205, hwBottom: 300 },
  ground: [0, 619, 1606, 12],
};
const facadeH = (w) => (w * FACADE.H) / FACADE.W;
const facadeW = (h) => (h * FACADE.W) / FACADE.H;
function facade({ x, y, w, ink = INK, paper = PAPER, win = paper }) {
  const F = FACADE;
  const s = w / F.W;
  const C = F.W;
  const mir = ([rx, ry, rw, rh]) => [C - rx - rw, ry, rw, rh];
  const R = (a, fill) => rect(a[0], a[1], a[2], a[3], fill);
  let g = "";
  for (const key of ["towerL", "capL", "shoulderL", "lipL"]) g += R(F[key], ink) + R(mir(F[key]), ink);
  const pl = (pts) =>
    `<polygon points="${pts.map(([a, b]) => `${a},${b}`).join(" ")}" fill="${ink}"/>`;
  // Keep the paper reveal over the plinth >= 1.2 output px at any size.
  const rv = Math.max(F.reveal, 1.2 / s);
  const plinth = F.plinthL.map(([a, b], i) =>
    i < 2 ? [a - (i === 1 ? rv * (105 / 137) : 0), b + rv] : [a, b],
  );
  g += pl(plinth) + pl(plinth.map(([a, b]) => [C - a, b]));
  for (const o of F.openingsL) g += R(o, paper) + R(mir(o), paper);
  const [gx, gy, gw] = F.glass;
  const m = F.mullion;
  g += R(F.glass, ink);
  const pw = (gw - (F.bays + 1) * m) / F.bays;
  const fh = (F.groundFloor[0] - m - gy - F.floors * m) / F.floors;
  for (let j = 0; j < F.bays; j += 1) {
    const px = gx + m + j * (pw + m);
    for (let i = 0; i < F.floors; i += 1) g += rect(px, gy + m + i * (fh + m), pw, fh, win);
    g += rect(px, F.groundFloor[0], pw, F.groundFloor[1], win);
  }
  // Grand staircase: stepped bands, paper gaps >= 1.2 output px.
  const st = F.stair;
  const span = st.bottom - st.top;
  const n = Math.max(3, Math.min(7, Math.floor((span * 0.4 * s) / 1.2)));
  const p = span / n;
  for (let i = 0; i < n; i += 1) {
    const hw = st.hwTop + (st.hwBottom - st.hwTop) * ((i + 1) / n);
    g += rect(C / 2 - hw, st.top + i * p + 0.4 * p, 2 * hw, 0.6 * p, ink);
  }
  g += R(F.ground, ink);
  return `<g transform="translate(${n2(x)} ${n2(y)}) scale(${s.toFixed(5)})">${g}</g>`;
}

// Night skyline: the white facade with gold-lit glass between outlined tower
// blocks (the sticker sheet's night pill), standing on one ground line.
// Returns { svg, width }; `avail` is the height budget above groundY.
function skyline({ cx, groundY, avail, maxW, groundW }) {
  const TOWERS = [
    // [side, width (x facade w), height (x facade h)], inner first
    [-1, 0.24, 1.25],
    [-1, 0.17, 0.88],
    [1, 0.22, 1.05],
    [1, 0.17, 0.76],
  ];
  const gapF = 0.06;
  const spanF = 1 + 2 * (gapF + 0.24 + gapF + 0.17);
  let fh = avail / 1.25;
  let fw = facadeW(fh);
  if (fw * spanF > maxW) {
    fw = maxW / spanF;
    fh = facadeH(fw);
  }
  const line = 2.4 * K;
  const groundH = 3 * K;
  let svg = "";
  const edge = { "-1": cx - fw / 2, 1: cx + fw / 2 };
  for (const [side, twF, thF] of TOWERS) {
    const tw = twF * fw;
    const th = thF * fh;
    const x = side < 0 ? edge[side] - gapF * fw - tw : edge[side] + gapF * fw;
    edge[side] = side < 0 ? x : x + tw;
    const y = groundY - th;
    svg += `<rect x="${n2(x + line / 2)}" y="${n2(y + line / 2)}" width="${n2(tw - line)}" height="${n2(th - line / 2)}" fill="none" stroke="${PAPER}" stroke-width="${n2(line)}"/>`;
    const floors = Math.max(4, Math.round(th / (15 * K)));
    const step = th / floors;
    for (let i = 1; i < floors; i += 1) svg += rect(x + 6 * K, y + i * step, tw - 12 * K, 1.8 * K, PAPER);
  }
  const width = edge[1] - edge["-1"];
  const gw = Math.max(groundW ?? 0, width + 24 * K);
  svg += rect(cx - gw / 2, groundY, gw, groundH, PAPER);
  svg += facade({ x: cx - fw / 2, y: groundY + groundH - fh, w: fw, ink: PAPER, paper: INK, win: GOLD });
  return { svg, width, fh };
}

// Bid paddle silhouette (marketing/gala-paddles/paddle-silhouette.json,
// inches) with the white numeral, Archivo Condensed Black like the paddles.
const PADDLE = JSON.parse(readFileSync(PADDLE_JSON, "utf8"));
const PADDLE_DIP = 7.0947;
const PADDLE_TOTAL = PADDLE_DIP + 1.9;
const paddleWidth = (height) => (PADDLE.w * height) / PADDLE_TOTAL;
function paddleIcon(cx, top, height, numeral) {
  const kk = height / PADDLE_TOTAL;
  const x0 = cx - (PADDLE.w * kk) / 2;
  const d =
    PADDLE.pts
      .map(([a, b], i) => `${i ? "L" : "M"}${n2(x0 + a * kk)},${n2(top + b * kk)}`)
      .join(" ") + " Z";
  const HW = 0.72;
  const HTOP = 3.2;
  const hw = HW * kk;
  let g = rect(cx - hw / 2, top + HTOP * kk, hw, (PADDLE_TOTAL - HTOP) * kk, INK, `rx="${n2(hw / 2)}"`);
  g += `<path d="${d}" fill="${INK}"/>`;
  const size = fit(numeral, "AC", -0.02, PADDLE.w * kk * 0.62, (PADDLE.h * kk * 0.5) / CAP.AC);
  g += txt(numeral, {
    x: cx,
    y: base(top + 3.35 * kk, "AC", size),
    size,
    f: "AC",
    ls: -0.02,
    fill: PAPER,
    anchor: "middle",
  });
  return g;
}

// Headline block: lines left-aligned at x, first baseline returned by caller
// math; returns svg + geometry.
function headline(lines, { x, capTop, size, fill = PAPER, anchor = "start" }) {
  let svg = "";
  const first = capTop + CAP.AX * size;
  lines.forEach((l, i) => {
    svg += txt(l, { x, y: first + i * LEAD * size, size, f: "AX", ls: HL, fill, anchor });
  });
  const last = first + (lines.length - 1) * LEAD * size;
  const width = Math.max(...lines.map((l) => em("AX", l, HL) * size));
  return { svg, last, width, height: last - capTop };
}
const blockH = (n, size) => CAP.AX * size + (n - 1) * LEAD * size;
const fitLines = (lines, maxW, maxSize) =>
  Math.min(maxSize, ...lines.map((l) => fit(l, "AX", HL, maxW, maxSize)));

// Mono label lines (Space Mono Bold caps, tracked), one shared size.
function monoLines(lines, { x, capTop, size, ls = 0.12, fill = INK, anchor = "start", lead = 1.62 }) {
  let svg = "";
  lines.forEach((l, i) => {
    svg += txt(l, { x, y: capTop + CAP.SM * size + i * lead * size, size, f: "SM", ls, fill, anchor });
  });
  return svg;
}
const monoBlockH = (n, size, lead = 1.62) => CAP.SM * size + (n - 1) * lead * size;
const fitMono = (lines, ls, maxW, maxSize) =>
  Math.min(maxSize, ...lines.map((l) => fit(l, "SM", ls, maxW, maxSize)));

// Content geometry. Portrait-type canvases: a top band (0..win.y) and a foot
// band (window bottom..H), content aligned to the window's edges. Landscape:
// the photo window sits left and the branding moves into a right panel.
function layoutOf(W, H, win) {
  if (W <= H) {
    return { L: false, cx0: win.x, cx1: win.x + win.w };
  }
  const px0 = win.x + win.w;
  return { L: true, px0, bx0: px0 + 24 * K, cx0: px0 + 72 * K, cx1: W - win.x };
}

const EYEBROW = 26; // px at 1080 (Space Mono Bold, 0.16em)
const MIN_MONO = 24;

// ---------------------------------------------------------------------------
// 1 · gala-mca "LSP at the MCA": white frame, black top band with the
// headline and the badge breaking its edge; facade + date strip below.
// ---------------------------------------------------------------------------
function buildGalaMca({ W, H, win }) {
  const lay = layoutOf(W, H, win);
  const cw = lay.cx1 - lay.cx0;
  const date = "FRI · SEPT 25 · 2026";
  let s = punched(W, H, win, PAPER);
  if (!lay.L) {
    const d = clamp(0.37 * win.y, 100 * K, 150 * K);
    const bandB = win.y - 24 * K - d / 2;
    const ebS = EYEBROW * K;
    const ebTop = Math.min(52 * K, bandB * 0.2);
    const zTop = ebTop + CAP.SM * ebS + 26 * K;
    const zBot = bandB - 30 * K;
    const maxW = cw - d - 36 * K;
    const one = ["LSP AT THE MCA"];
    const two = ["LSP AT", "THE MCA"];
    const s1 = fitLines(one, maxW, (zBot - zTop) / CAP.AX);
    const s2 = fitLines(two, maxW, (zBot - zTop) / (CAP.AX + LEAD));
    const [lines, size] = s2 > s1 * 1.25 ? [two, s2] : [one, s1];
    s += rect(0, 0, W, bandB, INK);
    s += txt("ANNUAL GALA 2026", { x: lay.cx0, y: ebTop + CAP.SM * ebS, size: ebS, f: "SM", ls: 0.16, fill: PAPER });
    s += headline(lines, {
      x: lay.cx0,
      capTop: zTop + (zBot - zTop - blockH(lines.length, size)) / 2,
      size,
    }).svg;
    s += badge(lay.cx1 - d / 2, bandB, d);
    // Foot strip: facade left, date right.
    const fy0 = win.y + win.h;
    const fc = (fy0 + H) / 2;
    const fh = Math.min(0.48 * (H - fy0), 124 * K);
    const fw = facadeW(fh);
    const ds = fit(date, "SM", 0.12, cw - fw - 48 * K, 28 * K);
    s += facade({ x: lay.cx0, y: fc - fh / 2, w: fw });
    s += txt(date, { x: lay.cx1, y: base(fc, "SM", ds), size: ds, f: "SM", ls: 0.12, anchor: "end" });
    return s;
  }
  // Landscape panel: band block top right, badge on its edge, facade + date
  // bottom-aligned with the window.
  const ebS = fit("ANNUAL GALA 2026", "SM", 0.16, cw, EYEBROW * K);
  const ebTop = win.y;
  const lines = ["LSP AT", "THE MCA"];
  const size = fitLines(lines, cw, 150 * K);
  const hl = headline(lines, { x: lay.cx0, capTop: ebTop + CAP.SM * ebS + 40 * K, size });
  const d = Math.min(150 * K, 0.34 * cw);
  const bandB = hl.last + 56 * K + d / 2;
  s += rect(lay.bx0, 0, W - lay.bx0, bandB, INK);
  s += txt("ANNUAL GALA 2026", { x: lay.cx0, y: ebTop + CAP.SM * ebS, size: ebS, f: "SM", ls: 0.16, fill: PAPER });
  s += hl.svg;
  s += badge(lay.cx1 - d / 2, bandB, d);
  const ds = fit(date, "SM", 0.12, cw, 28 * K);
  const dBase = win.y + win.h;
  const fw = Math.min(cw, facadeW(0.2 * H));
  const fh = facadeH(fw);
  s += facade({ x: lay.cx0, y: dBase - CAP.SM * ds - 40 * K - fh, w: fw });
  s += txt(date, { x: lay.cx0, y: dBase, size: ds, f: "SM", ls: 0.12 });
  return s;
}

// ---------------------------------------------------------------------------
// 2 · gala-night: black frame, "ANNUAL GALA" with a gold hairline under it,
// the night skyline (gold-lit glass) across the bottom band.
// ---------------------------------------------------------------------------
function buildGalaNight({ W, H, win }) {
  const lay = layoutOf(W, H, win);
  const cw = lay.cx1 - lay.cx0;
  const label = "ONE NIGHT AT THE MCA";
  const ruleH = 3 * K;
  let s = punched(W, H, win, INK);
  if (!lay.L) {
    const eb = "THE LATINA SWEAT PROJECT · 2026";
    const ebS = fit(eb, "SM", 0.16, cw, EYEBROW * K);
    const ebTop = Math.min(52 * K, win.y * 0.24);
    const zTop = ebTop + CAP.SM * ebS + 24 * K;
    const zBot = win.y - 26 * K - ruleH - 18 * K;
    const size = fitLines(["ANNUAL GALA"], cw, (zBot - zTop) / CAP.AX);
    const hl = headline(["ANNUAL GALA"], { x: lay.cx0, capTop: zBot - CAP.AX * size, size });
    s += txt(eb, { x: lay.cx0, y: ebTop + CAP.SM * ebS, size: ebS, f: "SM", ls: 0.16, fill: PAPER });
    s += hl.svg;
    s += rect(lay.cx0, hl.last + 18 * K, hl.width, ruleH, GOLD);
    // Foot: skyline standing on a ground line, label under it.
    const fy0 = win.y + win.h;
    const ls = fit(label, "SM", 0.18, cw, 26 * K);
    const lBase = H - Math.max(40 * K, (H - fy0) * 0.17);
    const groundY = lBase - CAP.SM * ls - 22 * K;
    const sky = skyline({ cx: W / 2, groundY, avail: groundY - (fy0 + 26 * K), maxW: cw, groundW: cw });
    s += sky.svg;
    s += txt(label, { x: W / 2, y: lBase, size: ls, f: "SM", ls: 0.18, fill: PAPER, anchor: "middle" });
    return s;
  }
  const eb = "LATINA SWEAT PROJECT";
  const ebS = fit(eb, "SM", 0.16, cw, EYEBROW * K);
  const lines = ["ANNUAL", "GALA 2026"];
  const size = fitLines(lines, cw, 150 * K);
  const hl = headline(lines, { x: lay.cx0, capTop: win.y + CAP.SM * ebS + 40 * K, size });
  s += txt(eb, { x: lay.cx0, y: win.y + CAP.SM * ebS, size: ebS, f: "SM", ls: 0.16, fill: PAPER });
  s += hl.svg;
  s += rect(lay.cx0, hl.last + 26 * K, hl.width, ruleH, GOLD);
  const ls = fit(label, "SM", 0.18, cw, 26 * K);
  const lBase = win.y + win.h;
  const groundY = lBase - CAP.SM * ls - 26 * K;
  const sky = skyline({ cx: (lay.cx0 + lay.cx1) / 2, groundY, avail: 0.3 * H, maxW: cw, groundW: cw });
  s += sky.svg;
  s += txt(label, { x: (lay.cx0 + lay.cx1) / 2, y: lBase, size: ls, f: "SM", ls: 0.18, fill: PAPER, anchor: "middle" });
  return s;
}

// ---------------------------------------------------------------------------
// 3 · gala-plaque: the ticket plaque. Black band (eyebrow + ANNUAL / GALA
// 2026 + badge breaking the edge), white lower frame with two mono lines,
// photo window inside a 1.2px black keyline like the printed stickers.
// ---------------------------------------------------------------------------
const PLAQUE_KEY_GAP = 12;
function buildGalaPlaque({ W, H, win }) {
  const lay = layoutOf(W, H, win);
  const cw = lay.cx1 - lay.cx0;
  const g = PLAQUE_KEY_GAP * K;
  const kw = 1.2 * K;
  const m1 = "LSP AT THE MCA";
  const m2 = "FRI · SEPT 25 · 2026";
  const lines = ["ANNUAL", "GALA 2026"];
  let s = punched(W, H, win, PAPER);
  // Keyline sits wholly outside the window (the window stays fully clear).
  const ko = g + kw / 2;
  s += `<path d="${rr(win.x - ko, win.y - ko, win.w + 2 * ko, win.h + 2 * ko, win.r + ko)}" fill="none" stroke="${INK}" stroke-width="${n2(kw)}"/>`;
  if (!lay.L) {
    const d = clamp(0.37 * win.y, 100 * K, 150 * K);
    const bandB = win.y - g - 24 * K - d / 2;
    const eb = "THE LATINA SWEAT PROJECT";
    const ebS = fit(eb, "SM", 0.16, cw, EYEBROW * K);
    const ebTop = Math.min(52 * K, bandB * 0.2);
    const zTop = ebTop + CAP.SM * ebS + 26 * K;
    const zBot = bandB - 30 * K;
    const size = fitLines(lines, cw - d - 36 * K, (zBot - zTop) / (CAP.AX + LEAD));
    s += rect(0, 0, W, bandB, INK);
    s += txt(eb, { x: lay.cx0, y: ebTop + CAP.SM * ebS, size: ebS, f: "SM", ls: 0.16, fill: PAPER });
    s += headline(lines, { x: lay.cx0, capTop: zTop + (zBot - zTop - blockH(2, size)) / 2, size }).svg;
    s += badge(lay.cx1 - d / 2, bandB, d);
    const fy0 = win.y + win.h + g;
    const ms = fitMono([m1, m2], 0.12, cw * 0.8, 28 * K);
    const bh = monoBlockH(2, ms);
    s += monoLines([m1, m2], { x: lay.cx0, capTop: (fy0 + H) / 2 - bh / 2, size: ms });
    return s;
  }
  const eb = "LATINA SWEAT PROJECT";
  const ebS = fit(eb, "SM", 0.16, cw, EYEBROW * K);
  const size = fitLines(lines, cw, 150 * K);
  const hl = headline(lines, { x: lay.cx0, capTop: win.y + CAP.SM * ebS + 40 * K, size });
  const d = Math.min(150 * K, 0.34 * cw);
  const bandB = hl.last + 56 * K + d / 2;
  s += rect(lay.bx0, 0, W - lay.bx0, bandB, INK);
  s += txt(eb, { x: lay.cx0, y: win.y + CAP.SM * ebS, size: ebS, f: "SM", ls: 0.16, fill: PAPER });
  s += hl.svg;
  s += badge(lay.cx1 - d / 2, bandB, d);
  const ms = fitMono([m1, m2], 0.12, cw, 28 * K);
  s += monoLines([m1, m2], { x: lay.cx0, capTop: win.y + win.h - monoBlockH(2, ms), size: ms });
  return s;
}

// ---------------------------------------------------------------------------
// 4 · gala-paddle: white frame, mono top line + badge, bid paddle "26"
// beside RAISE YOUR PADDLE along the bottom.
// ---------------------------------------------------------------------------
function buildGalaPaddle({ W, H, win }) {
  const lay = layoutOf(W, H, win);
  const cw = lay.cx1 - lay.cx0;
  const r1 = ["RAISE YOUR", "PADDLE"];
  let s = punched(W, H, win, PAPER);
  if (!lay.L) {
    const top = "ANNUAL GALA 2026 · LSP AT THE MCA";
    const bd = Math.min(96 * K, win.y - 56 * K);
    const tc = win.y / 2;
    const ts = fit(top, "SM", 0.14, cw - bd - 40 * K, 26 * K);
    s += txt(top, { x: lay.cx0, y: base(tc, "SM", ts), size: ts, f: "SM", ls: 0.14 });
    s += badge(lay.cx1 - bd / 2, tc, bd);
    const fy0 = win.y + win.h;
    const fc = (fy0 + H) / 2;
    const iconH = H - fy0 - 72 * K;
    const iconW = paddleWidth(iconH);
    s += paddleIcon(lay.cx0 + iconW / 2, fc - iconH / 2, iconH, "26");
    const tx = lay.cx0 + iconW + 40 * K;
    const size = fitLines(r1, lay.cx1 - tx, Math.min(110 * K, (iconH * 0.8) / (CAP.AX + LEAD)));
    s += headline(r1, { x: tx, capTop: fc - blockH(2, size) / 2, size, fill: INK }).svg;
    return s;
  }
  // Panel: badge, then the two mono lines under it (full size), the paddle
  // and RAISE YOUR PADDLE bottom-aligned with the window.
  const t = ["ANNUAL GALA 2026", "LSP AT THE MCA"];
  const bd = Math.min(130 * K, 0.3 * cw);
  s += badge(lay.cx0 + bd / 2, win.y + bd / 2, bd);
  const ts = fitMono(t, 0.14, cw, 26 * K);
  const tTop = win.y + bd + 36 * K;
  s += monoLines(t, { x: lay.cx0, capTop: tTop, size: ts, ls: 0.14 });
  const tBot = tTop + monoBlockH(2, ts);
  const size = fitLines(r1, cw, 150 * K);
  const hlTop = win.y + win.h - blockH(2, size);
  s += headline(r1, { x: lay.cx0, capTop: hlTop, size, fill: INK }).svg;
  const iconH = Math.min(0.36 * H, hlTop - 48 * K - (tBot + 64 * K));
  s += paddleIcon(lay.cx0 + paddleWidth(iconH) / 2, hlTop - 48 * K - iconH, iconH, "26");
  return s;
}

// ---------------------------------------------------------------------------
// Full-bleed stamps: the photo fills the canvas; near-black translucent cards
// hug the top corners and the bottom edge, faces stay clear.
// ---------------------------------------------------------------------------
const card = (x, y, w, h, r) =>
  `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="${n2(r)}" fill="${INK}" opacity="${SCRIM}"/>`;

// 5 · gala-mca-stamp: top-left plaque card + bottom bar with the facade.
function buildGalaMcaStamp({ W, H }) {
  const m = 44 * K;
  const lines = ["ANNUAL", "GALA 2026"];
  const size = 46 * K;
  const tw = Math.max(...lines.map((l) => em("AX", l, HL))) * size;
  const d = 104 * K;
  const padX = 32 * K;
  const padY = 30 * K;
  const cw = padX + tw + 28 * K + d + 26 * K;
  const ch = padY * 2 + blockH(2, size);
  let s = card(m, m, cw, ch, 16 * K);
  s += headline(lines, { x: m + padX, capTop: m + padY, size }).svg;
  s += badge(m + cw - 26 * K - d / 2, m + ch, d);
  const barH = 124 * K;
  const bc = H - barH / 2;
  s += card(0, H - barH, W, barH, 0);
  const fh = 0.5 * barH;
  const fw = facadeW(fh);
  s += facade({ x: m, y: bc - fh / 2, w: fw, ink: PAPER, paper: INK, win: INK });
  const label = "LSP AT THE MCA · 9.25.26";
  const ls = fit(label, "SM", 0.14, W - 2 * m - fw - 40 * K, 26 * K);
  s += txt(label, { x: W - m, y: base(bc, "SM", ls), size: ls, f: "SM", ls: 0.14, fill: PAPER, anchor: "end" });
  return s;
}

// 6 · gala-night-stamp: the night skyline bar along the bottom + a small
// badge top-right.
function buildGalaNightStamp({ W, H }) {
  const m = 44 * K;
  const d = 112 * K;
  let s = badge(W - m - d / 2, m + d / 2, d);
  const barH = (H / W > 1.5 ? 250 : H / W > 1.1 ? 214 : 190) * K;
  s += card(0, H - barH, W, barH, 0);
  const label = "ONE NIGHT AT THE MCA";
  const ls = fit(label, "SM", 0.18, W - 2 * m, 26 * K);
  const lBase = H - 38 * K;
  const groundY = lBase - CAP.SM * ls - 22 * K;
  const sky = skyline({ cx: W / 2, groundY, avail: groundY - (H - barH + 28 * K), maxW: W - 2 * m, groundW: W - 2 * m });
  s += sky.svg;
  s += txt(label, { x: W / 2, y: lBase, size: ls, f: "SM", ls: 0.18, fill: PAPER, anchor: "middle" });
  return s;
}

// 7 · gala-somos-stamp: SOMOS LSP pill with the X badge top-left, slim
// event bar along the bottom.
function buildGalaSomosStamp({ W, H }) {
  const m = 44 * K;
  let s = somosPill(m, m, 116 * K, { opacity: SCRIM });
  const bh = 72 * K;
  s += card(0, H - bh, W, bh, 0);
  const label = "ANNUAL GALA 2026 · LSP AT THE MCA";
  const ls = fit(label, "SM", 0.14, W - 2 * m, 26 * K);
  s += txt(label, { x: W / 2, y: base(H - bh / 2, "SM", ls), size: ls, f: "SM", ls: 0.14, fill: PAPER, anchor: "middle" });
  return s;
}

// The sticker sheet's SOMOS LSP pill, drawn at (x, y) with height h.
function somosPill(x, y, h, { opacity = 1, extra = "" } = {}) {
  const bd = h - 28 * (h / 116);
  const size = (0.62 * h) / (CAP.AX + LEAD);
  const tw = Math.max(em("AX", "SOMOS", HL), em("AX", "LSP", HL)) * size;
  const w = h * 0.98 + tw + h * 0.42;
  let s = `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" rx="${n2(h / 2)}" fill="${INK}" opacity="${opacity}" ${extra}/>`;
  s += badge(x + h / 2, y + h / 2, bd, { ring: 0 });
  s += headline(["SOMOS", "LSP"], { x: x + h * 0.98, capTop: y + h / 2 - blockH(2, size) / 2, size }).svg;
  return s;
}
const somosPillWidth = (h) =>
  h * 0.98 + Math.max(em("AX", "SOMOS", HL), em("AX", "LSP", HL)) * ((0.62 * h) / (CAP.AX + LEAD)) + h * 0.42;

const withScale = (fn) => (args) => {
  K = Math.min(args.W, args.H) / 1080;
  return fn(args);
};

export const gala26Builders = {
  "gala-mca": withScale(buildGalaMca),
  "gala-night": withScale(buildGalaNight),
  "gala-plaque": withScale(buildGalaPlaque),
  "gala-paddle": withScale(buildGalaPaddle),
  "gala-mca-stamp": withScale(buildGalaMcaStamp),
  "gala-night-stamp": withScale(buildGalaNightStamp),
  "gala-somos-stamp": withScale(buildGalaSomosStamp),
};

// ---------------------------------------------------------------------------
// Sticker tray additions (rendered by the site renderer with its shared
// die-cut defs: `dieCut` is its white border + drop-shadow attribute string).
// ---------------------------------------------------------------------------
export function gala26Stickers(dieCut) {
  K = 1;
  // MCA facade badge (the sticker sheet's facade circle).
  const D = 272;
  const pad = 24;
  const c = pad + D / 2;
  const ringW = 5;
  const rIn = D / 2 - 12;
  const fw = 0.68 * D;
  const fh = facadeH(fw);
  const fy = pad + 0.355 * D;
  const chord = (yy) => 2 * Math.sqrt(Math.max(0, (rIn - ringW) ** 2 - (c - yy) ** 2));
  const cy1 = fy - 0.105 * D;
  const s1 = fit("LSP AT THE MCA", "SM", 0.16, chord(cy1 - 8) * 0.74, 15);
  const cy2 = fy + fh + 0.115 * D;
  const s2 = fit("9.25.26", "AX", 0, chord(cy2 + 10) * 0.56, 0.1 * D);
  const facadeBody = `
  <circle cx="${c}" cy="${c}" r="${D / 2}" fill="${PAPER}" ${dieCut}/>
  ${circ(c, c, rIn, `fill="none" stroke="${INK}" stroke-width="${ringW}"`)}
  ${facade({ x: c - fw / 2, y: fy, w: fw })}
  ${txt("LSP AT THE MCA", { x: c, y: base(cy1, "SM", s1), size: s1, f: "SM", ls: 0.16, anchor: "middle" })}
  ${txt("9.25.26", { x: c, y: base(cy2, "AX", s2), size: s2, f: "AX", anchor: "middle" })}`;
  // SOMOS LSP pill.
  const ph = 112;
  const pw = somosPillWidth(ph);
  const pp = 26;
  const somosBody = somosPill(pp, pp, ph, { extra: dieCut });
  return [
    { name: "gala-facade", w: D + 2 * pad, h: D + 2 * pad, body: facadeBody },
    { name: "gala-somos", w: Math.ceil(pw + 2 * pp), h: ph + 2 * pp, body: somosBody },
  ];
}
