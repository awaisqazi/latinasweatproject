// LSP Annual Gala 2026 · door volunteer one-pager (Letter, portrait, black and white).
//
// Same visual system as marketing/gala-program/modern (Archivo Expanded
// headline band, Space Mono labels, Space Grotesk body), rendered to vector
// PDF by headless Chrome.
//
//   node marketing/gala-checkin-guide/build.mjs
//   -> ~/Downloads/Gala 2026 Print Pack/Volunteer-Checkin-Guide.pdf
//
// The passcode is NEVER printed here: volunteers get it from Fez in person.
// No em-dashes anywhere.

import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import QRCode from "qrcode";

const ROOT = "/Users/fezqazi/Documents/Latina Sweat Project Website/latinasweatproject";
const FONTS = path.join(ROOT, "marketing/gala-program/fonts");
const HERE = path.join(ROOT, "marketing/gala-checkin-guide");
const BUILD = path.join(HERE, "build");
const OUT_DIR = path.join(os.homedir(), "Downloads", "Gala 2026 Print Pack");
const PDF = path.join(OUT_DIR, "Volunteer-Checkin-Guide.pdf");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL_SHOWN = "latinasweatproject.com/gala/volunteer-checkin";
const URL_QR = "https://latinasweatproject.com/gala/volunteer-checkin";

await mkdir(BUILD, { recursive: true });
await mkdir(OUT_DIR, { recursive: true });

const qr = await QRCode.toString(URL_QR, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#FFFFFF" } });

const font = (family, weight, file) =>
  `@font-face{font-family:"${family}";font-weight:${weight};src:url("file://${path.join(FONTS, file).replace(/ /g, "%20")}") format("truetype");}`;

const steps = [
  ["Unlock", "Open the link. Type the passcode and <b>your first name</b>. On your own phone, tick <i>Keep this device unlocked tonight</i>."],
  ["Search", "A few letters of the <b>first or last name</b>. Accents do not matter: <i>gomez</i> finds G&oacute;mez. A table or paddle number works too."],
  ["Open the party", "Tap the card. The big paddle box says who shares it and whether it has already left the desk."],
  ["Check in", "Tap <b>Check in [name]</b>, or <b>Check in party</b> for everyone standing in front of you."],
  ["Hand over", "Read the paddle number on the card <b>out loud</b> and hand over that paddle. Tap <b>Done</b>: the search box is ready for the next guest."],
  ["Already in?", "A row that says <i>Checked in by Maria at 6:41 PM</i> is done. Two phones on the same guest is fine: the app settles it, nobody gets two paddles."],
];

const cases = [
  ["A couple or a family", "<b>One paddle per household.</b> The first to arrive takes it. When the partner comes later the app says <i>Paddle 42 &middot; already with Ana</i>: check them in and hand over nothing. Want their own? <i>Paddle options</i> &rarr; <i>Give Ben a paddle of their own</i>."],
  ["A walk-in", "Bottom left: <b>Walk-in</b>. Name, phone if they offer it, then <b>Check in + next free paddle</b>. Hand over the number the card shows. Joining a party that is here? Open that party &rarr; <i>Add a guest to this party</i>: they share its paddle."],
  ["Late Night guest", "Marked <b>Late Night &middot; 9 PM</b>: a Late Night ticket, no dinner seat. Check them in the same way; they get a paddle too."],
  ["Lost paddle", "Open their party &rarr; <i>Paddle options</i> &rarr; <b>Paddle 42 is lost</b>. That number is retired for the night; hand over the new one on the card. If the old paddle turns up, keep it at the desk."],
  ["The app says offline", "The pill at the top turns <b>Offline</b> and nothing saves. Taps keep retrying for about 30 seconds, then show <b>Not saved, tap to retry</b>: tap it once the signal is back. It never checks anyone in twice. Try switching Wi-Fi off (cellular) or on. Walk-ins need a signal: write the name on the paper list and add them when the pill is back to <b>Live</b>."],
  ["Wrong person?", "Tap <b>Undo</b> on their row. The paddle stays with them; nothing goes back in the box."],
];

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Volunteer Check-In Guide</title><style>
${font("AX", 900, "LSPArchivoExpanded-Black.ttf")}${font("AX", 700, "LSPArchivoExpanded-Bold.ttf")}
${font("SG", 400, "LSPSpaceGrotesk-Regular.ttf")}${font("SG", 500, "LSPSpaceGrotesk-Medium.ttf")}${font("SG", 700, "LSPSpaceGrotesk-Bold.ttf")}
${font("SM", 400, "SpaceMono-Regular.ttf")}${font("SM", 700, "SpaceMono-Bold.ttf")}
@page { size: 8.5in 11in; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "SG", sans-serif; color: #000; width: 8.5in; height: 10.98in; overflow: hidden; display: flex; flex-direction: column; }
.px { padding-left: 0.5in; padding-right: 0.5in; }
.mono { font-family: "SM", monospace; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
.hl { font-family: "AX", sans-serif; font-weight: 900; text-transform: uppercase; line-height: 0.92; letter-spacing: -0.01em; }
.band { background: #000; color: #fff; padding-top: 0.3in; padding-bottom: 0.16in; }
.band .eyebrow { font-size: 7.5pt; letter-spacing: 0.16em; margin-bottom: 10pt; }
.band .hl { font-size: 36pt; }
.band .sub { font-family: "SM"; font-size: 9pt; letter-spacing: 0.08em; margin-top: 9pt; text-transform: uppercase; }
.access { display: flex; align-items: stretch; gap: 16pt; padding-top: 11pt; padding-bottom: 10pt; border-bottom: 3pt solid #000; }
.qr { width: 74pt; height: 74pt; flex: none; }
.qr svg { width: 100%; height: 100%; display: block; }
.access .info { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 7pt; }
.lab { font-size: 7.5pt; letter-spacing: 0.16em; }
.url { font-family: "SM"; font-weight: 700; font-size: 14pt; letter-spacing: 0.01em; }
.pass { display: inline-block; border: 1.5pt solid #000; padding: 4pt 8pt; font-size: 11pt; letter-spacing: 0.12em; }
.note { font-size: 9pt; line-height: 1.35; }
h2 { font-family: "SM"; font-weight: 700; font-size: 8pt; letter-spacing: 0.18em; text-transform: uppercase; padding-top: 9pt; padding-bottom: 5pt; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); column-gap: 12pt; row-gap: 6pt; padding-bottom: 8pt; border-bottom: 0.75pt solid #000; }
.step { border-top: 3pt solid #000; padding-top: 5pt; }
.step .n { font-family: "AX"; font-weight: 900; font-size: 16pt; line-height: 1; }
.step .t { font-family: "SM"; font-weight: 700; font-size: 8pt; letter-spacing: 0.12em; text-transform: uppercase; margin: 3pt 0 2pt; }
.step p { font-size: 8.6pt; line-height: 1.3; }
.cases { display: grid; grid-template-columns: 1fr 1fr; column-gap: 14pt; row-gap: 0; }
.case { padding: 5pt 0 6pt; border-bottom: 0.75pt solid #000; }
.case .t { font-family: "AX"; font-weight: 700; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.01em; margin-bottom: 3pt; }
.case p { font-size: 8.6pt; line-height: 1.3; }
.rules { margin-top: auto; background: #000; color: #fff; display: flex; gap: 18pt; padding-top: 10pt; padding-bottom: 0.32in; }
.rules div { flex: 1; font-size: 8.6pt; line-height: 1.32; }
.rules .mono { display: block; font-size: 7.5pt; letter-spacing: 0.16em; margin-bottom: 3pt; }
b { font-weight: 700; } i { font-style: normal; font-family: "SM"; font-size: 0.92em; }
</style></head><body>
<div class="band px">
  <div class="mono eyebrow">The Latina Sweat Project &middot; Annual Gala 2026 &middot; MCA Chicago &middot; Doors 6 PM</div>
  <div class="hl">Door check-in</div>
  <div class="sub">Volunteer guide &middot; your own phone &middot; one page</div>
</div>
<div class="access px">
  <div class="qr">${qr}</div>
  <div class="info">
    <div class="mono lab">Open on your phone</div>
    <div class="url">${URL_SHOWN}</div>
    <div><span class="mono pass">Passcode: ask Fez</span></div>
    <div class="note">Never written down, never texted. Your first name goes in with it, so the team can see who checked each guest in.</div>
  </div>
</div>
<div class="px"><h2>Six steps</h2></div>
<div class="steps px">
${steps.map(([t, p], i) => `<div class="step"><div class="n">${i + 1}</div><div class="t">${t}</div><p>${p}</p></div>`).join("")}
</div>
<div class="px"><h2>When it is not simple</h2></div>
<div class="cases px">
${cases.map(([t, p]) => `<div class="case"><div class="t">${t}</div><p>${p}</p></div>`).join("")}
</div>
<div class="rules px">
  <div><span class="mono">Never</span>Type, guess or pick a paddle number yourself. The app hands out the next free one; read it off the card.</div>
  <div><span class="mono">Two phones, one guest</span>Fine. The second phone shows who got there first and which paddle they have.</div>
  <div><span class="mono">Stuck</span>Use the paper list at the desk, write down what you did, and find Fez.</div>
</div>
</body></html>`;

const htmlPath = path.join(BUILD, "guide.html");
await writeFile(htmlPath, html);
if (/\u2014/.test(html)) throw new Error("em-dash in the guide copy");
const profile = mkdtempSync(path.join(os.tmpdir(), "lsp-guide-"));
await rm(PDF, { force: true });
try {
  execFileSync(CHROME, [
    "--headless=new", "--disable-gpu", "--no-sandbox", `--user-data-dir=${profile}`,
    "--no-pdf-header-footer", "--virtual-time-budget=8000", `--print-to-pdf=${PDF}`,
    `file://${htmlPath.replace(/ /g, "%20")}`,
  ], { stdio: ["ignore", "pipe", "pipe"], timeout: 45000, killSignal: "SIGKILL" });
} catch (err) {
  if (err.code !== "ETIMEDOUT" && err.signal !== "SIGKILL") throw err;
}
if (!existsSync(PDF)) throw new Error("Chrome did not write the PDF");
console.log("wrote", PDF);
