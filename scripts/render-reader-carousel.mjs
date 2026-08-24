// Instagram carousel (8 slides, 1080x1350) promoting the Chicago Reader's
// feature on the 2026 yoga teacher graduation:
//   "Más allá del estudio" by Leslie Hurtado, Chicago Reader, Aug 21, 2026
//   https://chicagoreader.com/city-life/latina-sweat-project-yoga-teacher-graduation/
//
// Theme: the READER's own identity, not LSP's. Reader yellow (#ffd210, the
// color behind their site prompts) as the ground, black newsprint type, the
// Reader wordmark on every slide, orange (#f79102, their pull-quote color)
// as the single accent, photos in hard black newspaper frames with an
// orange offset, and a "link in bio" tag on every slide.
//
// Every quote and number on these slides is copied from the article. Photos
// are the article's (credit: Estevan Cruz of Latina Sweat Project); the two
// portrait pairings (Margarita, Yesi) are identified via the /graduation
// page's own alt text for the same frames.
//
// Usage:  node scripts/render-reader-carousel.mjs
// Output: output/reader-carousel/0N-*.png (+ .jpg) and caption.txt

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as lsp from "/Users/fezqazi/.claude/skills/lsp-event-graphics/scripts/lsp_graphics.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const photoDir = path.join(root, "marketing/reader-feature/photos");
const logoDir = path.join(root, "marketing/reader-feature/logo");
const outDir = path.join(root, "output/reader-carousel");
mkdirSync(outDir, { recursive: true });
const sharp = lsp.loadSharp();
const { SERIF } = lsp;

const W = 1080;
const H = 1350;
const cx = W / 2;

// Reader palette
const R = {
  yellow: "#ffd210",
  ink: "#111111",
  orange: "#f79102",
  paper: "#fffbea",
};

const COND = "Avenir Next Condensed, Avenir Next, Helvetica Neue, Arial, sans-serif";
const SANS = "Avenir Next, Helvetica Neue, Arial, sans-serif";

const CREDIT = "PHOTO: ESTEVAN CRUZ · LATINA SWEAT PROJECT";
const DATE = "AUGUST 21, 2026";
const TOTAL = 8;
const M = 64; // margin

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const T = (p) => lsp.txt({ anchor: "middle", ...p });

const readerLogo = `data:image/png;base64,${readFileSync(path.join(logoDir, "reader-black.png")).toString("base64")}`;
const LOGO_AR = 848 / 222;

function logo(x, y, w) {
  return `<image href="${readerLogo}" x="${x}" y="${y}" width="${w}" height="${w / LOGO_AR}"/>`;
}

function defs() {
  return `<defs>
    <pattern id="halftone" width="14" height="14" patternUnits="userSpaceOnUse">
      <circle cx="7" cy="7" r="2.1" fill="${R.ink}" opacity="0.10"/>
    </pattern>
  </defs>`;
}

// Yellow ground with a faint halftone band and fine grain.
function ground() {
  return (
    `<rect width="${W}" height="${H}" fill="${R.yellow}"/>` +
    `<rect x="0" y="${H - 230}" width="${W}" height="230" fill="url(#halftone)"/>` +
    lsp.grain(W, H, 160, 0.05)
  );
}

// Masthead strip: Reader wordmark left, date right, heavy black rule.
function masthead() {
  return (
    logo(M, 58, 300) +
    lsp.txt({ text: `CHICAGO READER · ${DATE}`, x: W - M, y: 112, size: 16, color: R.ink, weight: 900, tracking: 3, anchor: "end", family: SANS }) +
    `<rect x="${M}" y="150" width="${W - M * 2}" height="6" fill="${R.ink}"/>`
  );
}

// Bottom strip: link-in-bio tag, page count, photo credit, handle.
function foot(n, total, { credit = CREDIT } = {}) {
  let s = `<rect x="${M}" y="${H - 150}" width="${W - M * 2}" height="3" fill="${R.ink}"/>`;
  const tagW = 392;
  s += `<rect x="${M}" y="${H - 126}" width="${tagW}" height="50" rx="6" fill="${R.ink}"/>`;
  s += lsp.txt({ text: "READ THE STORY · LINK IN BIO", x: M + tagW / 2, y: H - 93, size: 18, color: R.yellow, weight: 900, tracking: 2.5, anchor: "middle", family: SANS });
  s += lsp.txt({ text: `${n} / ${total}`, x: W - M, y: H - 93, size: 22, color: R.ink, weight: 900, tracking: 1, anchor: "end", family: COND });
  s += lsp.txt({ text: credit, x: M, y: H - 48, size: 13, color: R.ink, weight: 800, tracking: 2.2, family: SANS, opacity: 0.7 });
  s += lsp.txt({ text: "@LATINASWEATPROJECT", x: W - M, y: H - 48, size: 13, color: R.ink, weight: 800, tracking: 2.2, anchor: "end", family: SANS, opacity: 0.7 });
  return s;
}

// Photo in a hard black newspaper frame with an orange offset block behind.
let clipN = 0;
async function framed(file, x, y, w, h, { position = "centre", extract = null, border = 10 } = {}) {
  let img = sharp(path.join(photoDir, file));
  if (extract) img = img.extract(extract);
  const buf = await img
    .resize(Math.round(w * 2), Math.round(h * 2), { fit: "cover", position })
    .jpeg({ quality: 90 })
    .toBuffer();
  const href = `data:image/jpeg;base64,${buf.toString("base64")}`;
  const id = `clip${clipN++}`;
  return (
    `<rect x="${x + 14}" y="${y + 16}" width="${w + border * 2}" height="${h + border * 2}" fill="${R.orange}"/>` +
    `<rect x="${x}" y="${y}" width="${w + border * 2}" height="${h + border * 2}" fill="${R.ink}"/>` +
    `<clipPath id="${id}"><rect x="${x + border}" y="${y + border}" width="${w}" height="${h}"/></clipPath>` +
    `<image href="${href}" x="${x + border}" y="${y + border}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
  );
}

async function monarch(file, x, y, w, { rotate = 0, opacity = 1 } = {}) {
  const meta = await sharp(path.join(photoDir, file)).metadata();
  const h = Math.round((w * meta.height) / meta.width);
  const buf = await sharp(path.join(photoDir, file)).resize(Math.round(w * 2)).png().toBuffer();
  const href = `data:image/png;base64,${buf.toString("base64")}`;
  return `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" opacity="${opacity}" transform="rotate(${rotate} ${x + w / 2} ${y + h / 2})"/>`;
}

// Serif-italic quote, left-aligned, word-wrapped. Returns markup + bottom.
function quoteBlock(text, { x, y, size, width, lineH = 1.18, charRatio = 0.44 }) {
  const maxChars = Math.floor(width / (size * charRatio));
  const lines = lsp.wrapLines(text, maxChars);
  let s = "";
  let yy = y;
  for (const line of lines) {
    s += lsp.txt({ text: line, x, y: yy, size, color: R.ink, family: SERIF, italic: true, weight: 400 });
    yy += size * lineH;
  }
  return { s, bottom: yy - size * lineH, lines: lines.length };
}

function attribution(x, y, name, role) {
  let s = lsp.txt({ text: name, x, y, size: 24, color: R.ink, weight: 900, tracking: 2.5, family: SANS });
  if (role) s += lsp.txt({ text: role, x, y: y + 32, size: 16, color: R.orange, weight: 900, tracking: 2.5, family: SANS });
  return s;
}

// Orange open-quote glyph (the Reader's pull-quote color).
function quoteMark(x, y, size = 220) {
  return `<text x="${x}" y="${y}" font-family="${SERIF}" font-style="italic" font-size="${size}" fill="${R.orange}" text-anchor="start">“</text>`;
}

function wrap(body) {
  return lsp.svgRoot(W, H, body, { defsBlock: defs(), superSample: 2 });
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

// 1 · Cover: the Reader wrote about us.
async function slideCover() {
  let s = ground();
  s += lsp.txt({ text: "WE'RE IN THE", x: M, y: 120, size: 54, color: R.ink, weight: 900, tracking: 2, family: COND });
  s += logo(M, 150, W - M * 2);
  s += `<rect x="${M}" y="420" width="${W - M * 2}" height="6" fill="${R.ink}"/>`;
  s += await framed("hug.jpg", M, 452, W - M * 2 - 20, 448, { extract: { left: 330, top: 420, width: 2000, height: 1022 } });
  s += lsp.txt({ text: "GRADUATES EMBRACE AT THE AUG 7 CEREMONY", x: M, y: 952, size: 14, color: R.ink, weight: 800, tracking: 2, family: SANS, opacity: 0.7 });
  s += lsp.txt({ text: "“MÁS ALLÁ DEL ESTUDIO”", x: M, y: 1020, size: 62, color: R.ink, weight: 900, tracking: 0.5, family: COND });
  s += lsp.txt({ text: "THE CHICAGO READER SPENT GRADUATION NIGHT WITH US", x: M, y: 1066, size: 20, color: R.orange, weight: 900, tracking: 2, family: SANS });
  s += lsp.txt({ text: "Story by Leslie Hurtado · 85 new yoga teachers · one Pilsen studio", x: M, y: 1106, size: 22, color: R.ink, weight: 600, family: SANS, opacity: 0.85 });
  s += lsp.txt({ text: "SWIPE  ›", x: W - M, y: 1106, size: 22, color: R.ink, weight: 900, tracking: 4, anchor: "end", family: SANS });
  s += foot(1, TOTAL);
  return wrap(s);
}

// Photo + quote slide: photo top with a who-is-pictured caption, quote
// below in a left-aligned column. Caption identities are USER-CONFIRMED
// only, never inferred (2026-08-24 correction: a frame inferred as
// Margarita was actually Monica Ortiz).
async function slideQuotePhoto({ n, file, position, extract = null, caption, quote, name, role, size, photoH = 440 }) {
  let s = ground();
  s += masthead();
  s += await framed(file, M, 196, W - M * 2 - 20, photoH, { position, extract });
  s += lsp.txt({ text: caption, x: M, y: 196 + photoH + 54, size: 14, color: R.ink, weight: 800, tracking: 2, family: SANS, opacity: 0.7 });
  const qTop = 196 + photoH + 84;
  const q = quoteBlock(quote, { x: M + 96, y: qTop + 78, size, width: W - M * 2 - 96 });
  // Center the quote block in the band between the photo and the footer.
  const blockBottom = q.bottom + 64 + (role ? 32 : 0);
  const dy = Math.max(0, Math.round(((H - 170) - blockBottom) / 2));
  let g = quoteMark(M - 6, qTop + 120, 220) + q.s + attribution(M + 96, q.bottom + 64, name, role);
  s += `<g transform="translate(0 ${dy})">${g}</g>`;
  s += foot(n, TOTAL);
  return wrap(s);
}

// Quote-only slide with a monarch cutout.
async function slideQuoteMonarch({ n, quote, name, role, size, monarchFile, mBox }) {
  let s = ground();
  s += masthead();
  s += await monarch(monarchFile, mBox.x, mBox.y, mBox.w, { rotate: mBox.rotate });
  s += quoteMark(M - 6, mBox.quoteTop + 120, 220);
  const q = quoteBlock(quote, { x: M + 96, y: mBox.quoteTop + 78, size, width: W - M * 2 - 96 });
  s += q.s;
  s += attribution(M + 96, q.bottom + 64, name, role);
  s += foot(n, TOTAL, { credit: "MONARCH PHOTO: ESTEVAN CRUZ · LATINA SWEAT PROJECT" });
  return wrap(s);
}

// 5 · By the numbers (figures exactly as reported in the article).
async function slideNumbers() {
  let s = ground();
  s += masthead();
  s += await framed("xochyl-efren.jpg", M, 196, W - M * 2 - 20, 330, { position: "attention" });
  s += lsp.txt({ text: "PICTURED: XOCHYL PEREZ AND EFREN RAMÍREZ · 2026 YOGA TEACHER TRAINING CLASS", x: M, y: 580, size: 14, color: R.ink, weight: 800, tracking: 2, family: SANS, opacity: 0.7 });
  s += lsp.txt({ text: "WHAT THE READER REPORTED", x: M, y: 650, size: 34, color: R.ink, weight: 900, tracking: 1, family: COND });
  s += `<rect x="${M}" y="668" width="200" height="5" fill="${R.orange}"/>`;

  const rows = [
    ["85", "teachers celebrated from the 2025 and 2026 cohorts"],
    ["$0", "tuition: every graduate trained on a full scholarship"],
    ["~28,000", "class visits, September 2025 through May 2026"],
    ["5,000+", "of those visits were free or discounted"],
    ["~500", "community members served through partnerships, January through May 2026"],
  ];
  let y = 750;
  for (const [num, label] of rows) {
    s += lsp.txt({ text: num, x: 330, y, size: 60, color: R.ink, weight: 900, family: COND, anchor: "end" });
    const lines = lsp.wrapLines(label, 52);
    let ly = y - (lines.length - 1) * 14 - 8;
    for (const line of lines) {
      s += lsp.txt({ text: line, x: 366, y: ly, size: 21, color: R.ink, weight: 600, family: SANS, opacity: 0.88 });
      ly += 27;
    }
    s += `<rect x="${M}" y="${y + 24}" width="${W - M * 2}" height="1.5" fill="${R.ink}" opacity="0.25"/>`;
    y += 92;
  }
  s += foot(5, TOTAL);
  return wrap(s);
}

// 8 · Closing: the next chapter + the ask.
async function slideClosing() {
  let s = ground();
  s += masthead();
  s += await monarch("monarch-side.png", 560, 170, 460, { rotate: 12 });
  s += lsp.txt({ text: "THE NEXT", x: M, y: 330, size: 120, color: R.ink, weight: 900, family: COND });
  s += lsp.txt({ text: "CHAPTER", x: M, y: 440, size: 120, color: R.ink, weight: 900, family: COND });
  s += `<rect x="${M}" y="470" width="260" height="6" fill="${R.orange}"/>`;
  const lines = [
    "LSP leaves the 16th Street studio in mid-September.",
    "Pop-up programming continues through December.",
    "A new Pilsen studio opens in January 2027.",
  ];
  let y = 556;
  for (const line of lines) {
    s += lsp.txt({ text: line, x: M, y, size: 26, color: R.ink, weight: 600, family: SANS, opacity: 0.9 });
    y += 44;
  }
  s += quoteMark(M - 6, 860, 220);
  const q = quoteBlock("Impossible to displace.", { x: M + 96, y: 818, size: 64, width: W - M * 2 - 96 });
  s += q.s;
  s += attribution(M + 96, q.bottom + 56, "MARGARITA QUIÑONES-PEÑA", "TO THE GRADUATES");

  // Big black CTA block
  s += `<rect x="${M}" y="1000" width="${W - M * 2}" height="150" fill="${R.ink}"/>`;
  s += T({ text: "READ THE FULL STORY", x: cx, y: 1062, size: 40, color: R.yellow, weight: 900, tracking: 2, family: COND });
  s += T({ text: "TAP THE LINK IN OUR BIO  ·  CHICAGOREADER.COM", x: cx, y: 1108, size: 18, color: R.paper, weight: 900, tracking: 3, family: SANS, opacity: 0.85 });
  s += foot(8, TOTAL, { credit: "MONARCH PHOTO: ESTEVAN CRUZ · LATINA SWEAT PROJECT" });
  return wrap(s);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const slides = [
  ["01-cover", await slideCover()],
  ["02-never-these-walls", await slideQuotePhoto({
    n: 2, file: "monica-ortiz.jpg", position: "centre", extract: { left: 330, top: 460, width: 1900, height: 909 },
    caption: "PICTURED: MONICA ORTIZ DURING THE CEREMONY",
    quote: "Latina Sweat Project was never these walls. It was never an address. It has always been the people standing in this room.",
    name: "MARGARITA QUIÑONES-PEÑA", role: "FOUNDER", size: 46,
  })],
  ["03-another-piece", await slideQuotePhoto({
    n: 3, file: "hands-on-heart.jpg", position: "attention",
    caption: "PICTURED: GRADUATES AT THE AUG 7 CEREMONY",
    quote: "Every time one of you teaches a class, another piece of this project exists somewhere else. That is the piece that we have built together, impossible to displace.",
    name: "MARGARITA QUIÑONES-PEÑA", role: "TO THE GRADUATES", size: 40, photoH: 400,
  })],
  ["04-daughter-of-immigrants", await slideQuoteMonarch({
    n: 4,
    quote: "This was a part of myself I always denied because it was not available for people like me, as a daughter of immigrants. Like, with what money, with what time? Where would I go if it wasn't for this support?",
    name: "JOCELYN VEGA", role: "YOGA TEACHER TRAINING · CLASS OF 2026", size: 42,
    monarchFile: "monarch-open.png", mBox: { x: 380, y: 176, w: 560, rotate: 8, quoteTop: 640 },
  })],
  ["05-by-the-numbers", await slideNumbers()],
  ["06-we-are-miracles", await slideQuotePhoto({
    n: 6, file: "yesi.jpg", position: "centre", extract: { left: 0, top: 620, width: 1707, height: 1160 },
    caption: "PICTURED: YESI PEYRET SPEAKS AT THE CEREMONY",
    quote: "We are miracles, you know, all of us here. The fact that we are all bringing this gift of yoga to our communities, I see that as something beautiful. Migration is beautiful. Healing is beautiful.",
    name: "YESI PEYRET", role: "YOGA TEACHER TRAINING · CLASS OF 2025", size: 38, photoH: 460,
  })],
  ["07-more-than-fitness", await slideQuotePhoto({
    n: 7, file: "applause.jpg", position: "attention",
    caption: "PICTURED: THE COMMUNITY APPLAUDS THE NEW TEACHERS",
    quote: "Seeing moms and daughters come as well, this is so much more than fitness, it's family. It's about the community and everyone's well-being.",
    name: "JOCELYN VEGA", role: "YOGA TEACHER TRAINING · CLASS OF 2026", size: 44, photoH: 460,
  })],
  ["08-next-chapter", await slideClosing()],
];

const made = [];
for (const [name, markup] of slides) {
  const png = path.join(outDir, `${name}.png`);
  await lsp.renderPNG(sharp, markup, png, { resize: [W, H] });
  await sharp(png).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toFile(path.join(outDir, `${name}.jpg`));
  made.push(name);
}

const caption = `We're in the Chicago Reader. 📰

Leslie Hurtado came to our yoga teacher graduation and wrote "Más allá del estudio": 85 new teachers from the 2025 and 2026 cohorts, every one of them trained on a full scholarship, a room lit by candles and monarchs, and a community that, in Margarita's words, was never these walls and never an address.

Swipe for the quotes that stayed with us, then read the full story at the link in our bio.

Gracias @chicago_reader and Leslie Hurtado for seeing our community. Photos by Estevan Cruz.

#LatinaSweatProject #ChicagoReader #Pilsen #ChicagoYoga #YogaTeacherTraining #Comunidad #MasAllaDelEstudio`;
writeFileSync(path.join(outDir, "caption.txt"), caption);

console.log(JSON.stringify({ outDir, made }, null, 2));
