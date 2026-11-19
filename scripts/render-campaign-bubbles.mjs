// /links story-highlight covers for the Nov 2026 campaign cards (420x420):
//   hl_posadas.jpg       a plain crop of the circled 19 from the team's save-the-date
//   hl_givingtuesday.png the Giving Tuesday studio floor: yellow room, sideways mats in
//                        the MatFloor colours, a few rows rolled out (no new illustration)
// Usage: node scripts/render-campaign-bubbles.mjs
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(repo, "public/images/highlights");
// Posadas: a plain crop of the circled 19 from the team's save-the-date.
await sharp(`${repo}/public/images/posada/lsp-posadas-save-the-date.jpg`)
  .extract({ left: 276, top: 520, width: 404, height: 404 })
  .resize(420, 420)
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(`${out}/hl_posadas.jpg`);
// Giving Tuesday: the campaign's yellow studio floor, mats drawn exactly as
// on the floor (sideways mats, the same colours), a few rows rolled out.
const C = ["#1e1e1e","#0f766e","#c7602d","#d9467a","#0369a1","#1e1e1e","#6d4aa8","#0f766e"];
const R = ["#000000","#0a524d","#97461f","#a8305b","#024a72","#000000","#4f3480","#0a524d"];
function colorOf(i){let x=(i+11)*2654435761;x=(x^(x>>>13))>>>0;return x%C.length;}
let mats = "";
const cols = 4, rows = 9, w = 78, h = 26, gx = 10, gy = 14, aisle = 18;
const totalW = cols*w + (cols-1)*gx + aisle;
const x0 = (420-totalW)/2, totalH = rows*h + (rows-1)*gy, y0 = (420-totalH)/2;
const funded = 22.5;
for (let i=0;i<cols*rows;i++){
  const c=i%cols, r=Math.floor(i/cols);
  const x = x0 + c*(w+gx) + (c>=2?aisle:0), y = y0 + r*(h+gy);
  const f = Math.max(0, Math.min(1, funded - i));
  const k = colorOf(i);
  mats += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="none" stroke="rgba(30,30,30,0.34)" stroke-width="2.5"/>`;
  if (f>0) mats += `<rect x="${x}" y="${y}" width="${w*f}" height="${h}" rx="5" fill="${C[k]}"/>`;
  if (f>0 && f<1) mats += `<rect x="${x+w*f-7}" y="${y-4}" width="14" height="${h+8}" rx="7" fill="${R[k]}"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420"><rect width="420" height="420" fill="#ffde59"/>${mats}</svg>`;
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(`${out}/hl_givingtuesday.png`);
console.log("ok");
