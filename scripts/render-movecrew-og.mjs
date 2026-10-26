// /movecrew share graphics in the "moving day" identity (see render-pause-movingday.mjs):
// kraft paper, packing tape, rubber stamp, Mural Park photos taped down like prints on a box.
//
// Step 1 (optional): export the page-hero photos from the raw Mural Park downloads
//   (muralpark.com Squarespace images, fetched with ?format=2500w) into public/images/movecrew/:
//     muralpark-1.jpg  exterior (building + skyline)          1200x900
//     muralpark-2.jpg  interior (loft with calavera murals)   1200x900
//     muralpark-3.jpg  interior (sunlit lounge, mural at back) 1200x900
//   Runs only when MURALPARK_SRC (or the default scratch dir) exists; otherwise the existing
//   hero files are reused as-is.
// Step 2: render movecrew-og.jpg (1200x630), movecrew-square.jpg (1080x1080),
//   movecrew-story.jpg (1080x1920) from those hero files.
//
// Usage: node scripts/render-movecrew-og.mjs [path/to/raw/muralpark-photos]
import { mkdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const ROOT = "/Users/fezqazi/Documents/Latina Sweat Project Website/latinasweatproject";
const sharp = createRequire(path.join(ROOT, "package.json"))("sharp");
sharp.concurrency(1);

const OUT = path.join(ROOT, "public/images/movecrew");
await mkdir(OUT, { recursive: true });

const KRAFT = "#C79A66", KRAFT_D = "#B0824E", INK = "#3A2817", CREAM = "#FFF6E6",
      LABEL = "#FFFDF6", STAMP = "#C0392B", TAPE = "#EDE0C4";
const SANS = "Avenir Next Condensed, Avenir Next, Helvetica Neue, sans-serif";

// ---------- step 1: hero exports ----------
const RAW = process.argv[2] || process.env.MURALPARK_SRC ||
  "/private/tmp/claude-501/-Users-fezqazi-Documents-Latina-Sweat-Project-Website-latinasweatproject/a80088a6-550b-4f5b-b4ee-c4f38e1c29c6/scratchpad/muralpark-photos";
// extract regions are in the 2500x1667 source pixels, already 4:3
const HEROES = [
  { out: "muralpark-1.jpg", src: "Mural_Park_Exterior.jpg",         crop: { left: 80,  top: 167, width: 2000, height: 1500 } },
  { out: "muralpark-2.jpg", src: "MuralPark_20190104_03.jpg",       crop: { left: 139, top: 0,   width: 2222, height: 1667 } },
  { out: "muralpark-3.jpg", src: "MuralPark_20190104_01_grass.jpg", crop: { left: 100, top: 0,   width: 2222, height: 1667 } },
];
if (existsSync(RAW)) {
  for (const h of HEROES) {
    await sharp(path.join(RAW, h.src)).extract(h.crop)
      .resize(1200, 900, { fit: "cover" })
      .jpeg({ quality: 82, mozjpeg: true, progressive: true })
      .toFile(path.join(OUT, h.out));
  }
  console.log("heroes exported from", RAW);
}
for (const h of HEROES) if (!existsSync(path.join(OUT, h.out))) throw new Error(`missing ${h.out}; pass the raw photo dir`);

// ---------- step 2: share graphics ----------
const MARK = "data:image/png;base64," + readFileSync(path.join(ROOT, "scripts/mark_x_only.png")).toString("base64");
const esc = t => t.replace(/&/g,"&amp;").replace(/</g,"&lt;");
const txt = ({t,x,y,s,c=INK,w=700,f=SANS,anchor="middle",track=0,o=1}) =>
  `<text x="${x}" y="${y}" font-family="${f}" font-size="${s}" font-weight="${w}" fill="${c}" text-anchor="${anchor}" letter-spacing="${track}" opacity="${o}">${esc(t)}</text>`;

function tape(x,y,w,h,rot){ // packing tape strip (same as the pause set)
  return `<g transform="rotate(${rot} ${x+w/2} ${y+h/2})">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${TAPE}" opacity="0.72"/>
    <rect x="${x}" y="${y}" width="${w}" height="3" fill="#FFFFFF" opacity="0.5"/>
    <rect x="${x}" y="${y+h-3}" width="${w}" height="3" fill="${KRAFT_D}" opacity="0.45"/>
    <line x1="${x}" y1="${y+h*0.4}" x2="${x+w}" y2="${y+h*0.4}" stroke="${KRAFT_D}" stroke-width="1" opacity="0.18"/>
  </g>`;
}
function stamp(cx,cy,w,h,rot,lines,size,col=STAMP){ // rubber stamp, rounded border
  const inner = lines.map((L,i)=>txt({t:L,x:0,y:(i-(lines.length-1)/2)*size*1.16+size*0.36,s:size,c:col,w:800,track:3})).join("");
  return `<g transform="translate(${cx} ${cy}) rotate(${rot})" opacity="0.9">
    <rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="12" fill="none" stroke="${col}" stroke-width="5"/>
    <rect x="${-w/2+8}" y="${-h/2+8}" width="${w-16}" height="${h-16}" rx="8" fill="none" stroke="${col}" stroke-width="1.6" opacity="0.6"/>
    ${inner}</g>`;
}

// photo data URIs, cover-cropped to the print's exact aspect at ~1.6x placed size
const photoCache = new Map();
async function photo(file, w, h){
  const pw = Math.round(w*1.6), ph = Math.round(h*1.6), key = `${file}${pw}x${ph}`;
  if (!photoCache.has(key)) {
    const buf = await sharp(await readFile(path.join(OUT, file))).resize(pw, ph, { fit: "cover" }).jpeg({ quality: 84 }).toBuffer();
    photoCache.set(key, "data:image/jpeg;base64," + buf.toString("base64"));
  }
  return photoCache.get(key);
}

let uid = 0;
// a print: white-bordered photo, soft shadow, rotated, taped at the given corners
async function print({file,cx,cy,w,h,rot,border,tapes=[]}){
  const id = `ph${uid++}`, href = await photo(file, w, h);
  const W2 = w/2 + border, H2 = h/2 + border;
  const tl = Math.max(70, w*0.3), th = Math.max(26, w*0.075);
  const T = { // corner tapes sit diagonally across the corner, half on the print, half on the kraft
    tl: [-W2 - tl*0.32, -H2 - th*0.1, -38], tr: [W2 - tl*0.68, -H2 - th*0.1, 38],
    bl: [-W2 - tl*0.32, H2 - th*0.9, 38],   br: [W2 - tl*0.68, H2 - th*0.9, -38],
    tc: [-tl/2, -H2 - th*0.55, -2],          bc: [-tl/2, H2 - th*0.45, 3],
  };
  return `<g transform="translate(${cx} ${cy}) rotate(${rot})">
    <rect x="${-W2+6}" y="${-H2+10}" width="${W2*2}" height="${H2*2}" fill="${INK}" opacity="0.42" filter="url(#soft)"/>
    <rect x="${-W2}" y="${-H2}" width="${W2*2}" height="${H2*2}" fill="${LABEL}"/>
    <clipPath id="${id}"><rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}"/></clipPath>
    <image clip-path="url(#${id})" href="${href}" x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
    <rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" fill="none" stroke="${INK}" stroke-width="1" opacity="0.15"/>
    ${tapes.map(k=>tape(T[k][0], T[k][1], tl, th, T[k][2])).join("")}
  </g>`;
}

function sticker(x,y,r,rot=-8){ // LSP mark on a cream round sticker (as in the pause set)
  return `<g transform="rotate(${rot} ${x} ${y})">
    <circle cx="${x+2}" cy="${y+4}" r="${r}" fill="${INK}" opacity="0.2"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="${CREAM}" stroke="${INK}" stroke-width="${Math.max(2,r*0.06)}"/>
    <image href="${MARK}" x="${x-r*0.62}" y="${y-r*0.53}" width="${r*1.24}" height="${r*1.06}"/>
  </g>`;
}

function urlLabel({x,y,s,anchor="start",rot=-1.5}){ // small shipping label with the URL
  const t = "latinasweatproject.com/movecrew", tw = s*0.56*t.length, pad = s*0.6, h = s*1.9;
  const lx = anchor==="middle" ? x - tw/2 - pad : x;
  return `<g transform="rotate(${rot} ${lx + tw/2 + pad} ${y + h/2})">
    <rect x="${lx+4}" y="${y+5}" width="${tw+pad*2}" height="${h}" rx="4" fill="${INK}" opacity="0.18"/>
    <rect x="${lx}" y="${y}" width="${tw+pad*2}" height="${h}" rx="4" fill="${LABEL}" stroke="${INK}" stroke-width="2.5"/>
    ${txt({t,x:lx+pad+tw/2,y:y+h*0.66,s,w:700,anchor:"middle"})}
  </g>`;
}

async function compose(W,H,L){
  let s = `<rect width="${W}" height="${H}" fill="${KRAFT}"/>
  <rect width="${W}" height="${H}" filter="url(#paper)" opacity="0.35"/>`;
  for (const t of L.bgTapes||[]) s += tape(...t);
  for (const p of L.prints) s += await print(p);
  s += stamp(...L.stamp);
  s += sticker(L.logo.x, L.logo.y, L.logo.r);
  s += txt({t:"THE LATINA SWEAT PROJECT", x:L.eyebrow.x, y:L.eyebrow.y, s:L.eyebrow.s, w:800, track:L.eyebrow.s*0.3, anchor:L.eyebrow.anchor, o:0.85});
  s += `<g transform="rotate(${L.head.rot} ${L.head.x} ${L.head.y})">` +
    L.head.lines.map((t,i)=>txt({t, x:L.head.x, y:L.head.y + i*L.head.s*L.head.lh, s:L.head.s, w:800, track:1.5, anchor:L.head.anchor})).join("") + `</g>`;
  s += L.sub.lines.map((t,i)=>txt({t, x:L.sub.x, y:L.sub.y + i*L.sub.s*1.3, s:L.sub.s, w:i===L.sub.lines.length-1?700:500, anchor:L.sub.anchor})).join("");
  s += urlLabel(L.url);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.28  0 0 0 0 0.19  0 0 0 0 0.10  0 0 0 0.5 0"/></filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
  </defs>${s}</svg>`;
}

const SUB = ["Our next chapter starts this week.", "Pick an hour, Oct 26 to 30."];
const EXT = "muralpark-1.jpg", INT = "muralpark-2.jpg", LOUNGE = "muralpark-3.jpg";

// Note: librsvg (sharp) does not see the Condensed face inside the system .ttc, so this stack
// renders as Avenir Next Heavy, exactly like the pause set. Layouts are sized for that face.
const og = await compose(1200, 630, {
  logo: { x: 92, y: 74, r: 34 },
  eyebrow: { x: 142, y: 82, s: 21, anchor: "start" },
  head: { lines: ["HELP LSP", "MOVE INTO", "MURAL PARK"], x: 58, y: 192, s: 74, lh: 0.97, anchor: "start", rot: 0 },
  sub: { lines: SUB, x: 61, y: 416, s: 27, anchor: "start" },
  url: { x: 58, y: 486, s: 22 },
  prints: [
    { file: LOUNGE, cx: 755, cy: 490, w: 236, h: 177, rot: -6, border: 10, tapes: ["bl"] },
    { file: EXT,    cx: 900, cy: 205, w: 384, h: 288, rot: 3,  border: 13, tapes: ["tl", "tr"] },
    { file: INT,    cx: 1020, cy: 470, w: 280, h: 210, rot: -3, border: 11, tapes: ["br"] },
  ],
  stamp: [562, 160, 196, 66, -8, ["THIS WEEK"], 32],
});
const square = await compose(1080, 1080, {
  logo: { x: 96, y: 92, r: 38 },
  eyebrow: { x: 150, y: 101, s: 23, anchor: "start" },
  head: { lines: ["HELP LSP", "MOVE INTO", "MURAL PARK"], x: 62, y: 236, s: 100, lh: 0.97, anchor: "start", rot: 0 },
  sub: { lines: SUB, x: 65, y: 918, s: 32, anchor: "start" },
  url: { x: 62, y: 975, s: 26 },
  prints: [ // exterior drawn last so the skyline stays visible
    { file: LOUNGE, cx: 235, cy: 715, w: 330, h: 248, rot: -5, border: 13, tapes: ["tl"] },
    { file: INT,    cx: 865, cy: 720, w: 320, h: 240, rot: -3, border: 13, tapes: ["tr", "br"] },
    { file: EXT,    cx: 560, cy: 650, w: 420, h: 315, rot: 3,  border: 15, tapes: ["tc"] },
  ],
  stamp: [800, 205, 236, 80, -7, ["THIS WEEK"], 38],
});
const story = await compose(1080, 1920, {
  logo: { x: 540, y: 300, r: 46 },
  eyebrow: { x: 540, y: 392, s: 26, anchor: "middle" },
  head: { lines: ["HELP LSP", "MOVE INTO", "MURAL PARK"], x: 540, y: 520, s: 128, lh: 0.95, anchor: "middle", rot: -2 },
  sub: { lines: SUB, x: 540, y: 1508, s: 36, anchor: "middle" },
  url: { x: 540, y: 1570, s: 26, anchor: "middle" },
  prints: [
    { file: LOUNGE, cx: 290, cy: 1300, w: 330, h: 248, rot: -6, border: 14, tapes: ["bl"] },
    { file: EXT,    cx: 560, cy: 1150, w: 500, h: 375, rot: 3, border: 17, tapes: ["tl", "tr"] },
    { file: INT,    cx: 800, cy: 1310, w: 330, h: 248, rot: -3, border: 14, tapes: ["br"] },
  ],
  stamp: [540, 850, 300, 86, -4, ["THIS WEEK"], 42],
});

for (const [svg, w, h, name] of [[og,1200,630,"movecrew-og"],[square,1080,1080,"movecrew-square"],[story,1080,1920,"movecrew-story"]]) {
  const png = await sharp(Buffer.from(svg), { density: 144 }).resize(w, h).png().toBuffer();
  await sharp(png).jpeg({ quality: 88, mozjpeg: true, progressive: true }).toFile(path.join(OUT, `${name}.jpg`));
}
console.log("done");
