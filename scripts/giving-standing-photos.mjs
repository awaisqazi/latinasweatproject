// LSP Giving Tuesday: the standing photo for instructors whose pop-up cutout
// (marketing/popup-week1/instructors/<avatar>.png) cannot stand on the yellow
// as it is. Shared by render-giving-instructor-og.mjs (link card) and
// render-giving-instructor-kit.mjs (share kit).
//
// Everyone with a photo stands. A cutout whose sides end in straight cut
// edges (the edge of the original photo) would show those edges floating on
// the yellow, so it is cut off straight at the bottom, at the first row where
// a side turns into a straight cut or meets the cutout's left side. That
// bottom edge then sits on the frame's bottom edge, the only place a straight
// cut can go without showing. A cut on the cutout's RIGHT side may stay: both
// renderers keep that side running off the frame's right edge (checked
// loudly). Nothing is added, extended, mirrored or swapped: the pixels above
// the cut are the cutout's own.
//
// file: a larger cutout of the SAME photo (lucia-del-rincon-martinez: her
// pop-up cutout is 300x300; kit-photos/<avatar>.png is the 800x800 original
// it was downscaled from, registered to it at exactly 8/3 scale, cut out with
// scripts/tools/cutout plus the small cutout's matte; see kit-photos/).
//
// face: these photos are framed differently from the house 1125x750 cutouts
// (portrait 750x1125, or cropped), so their face box is measured with YuNet
// (marketing/giving-tuesday-2026/email-1/facebox.py) instead of assumed.
// It only measures where the face is; it never decides who anyone is.
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

// cropBottom: keep rows [0, cropBottom) of the source (source px).
export const STANDING = {
  // Both arms end in straight vertical cut edges from row 560 down.
  "alondra-alcazar": { cropBottom: 560 },
  // Both sides of the torso end in straight vertical cut edges from row 478 down.
  "lizett-galan": { cropBottom: 478 },
  // Portrait cutouts whose shoulders run into the photo's left side (and
  // right side, which runs off the frame): cut at the first such row.
  "courtney-luedke": { cropBottom: 941 },
  "dinorah-zubieta": { cropBottom: 1004 },
  "karina-melendez": { cropBottom: 847 },
  "yaritza-jurado": { cropBottom: 839 },
  // Portrait cutout that never touches its left side (the shoulder runs off
  // the right side, which runs off the frame): no cut, measured face box only.
  "korey-martinez": {},
  // Portrait cutout that touches neither side: no cut, measured face box only.
  "nhi-le": {},
  // Pop-up cutout too small (300x300): the 800x800 original of the same photo.
  "lucia-del-rincon-martinez": { file: "marketing/giving-tuesday-2026/kit-photos/lucia-del-rincon-martinez.png" },
};

// Generous box around the YuNet face box, as fractions of the source, in the
// same shape as the house FACE constant: about the same margins the house
// box leaves around a measured face (a quarter of the face width each side,
// 7% of its height above, 14% below).
// scale: the house cutouts' faces measure about REF_FACE_W px wide (YuNet,
// gigi-torres 240); a photo whose face is smaller or larger in its own pixels
// is drawn at a proportionally larger or smaller scale, so faces match.
const REF_FACE_W = 240;
function faceFractions([fx, fy, fw, fh], w, h) {
  return {
    scale: REF_FACE_W / fw,
    cx: (fx + fw / 2) / w,
    half: (fw / 2 + 0.25 * fw) / w,
    top: (fy - 0.07 * fh) / h,
    bottom: (fy + fh + 0.14 * fh) / h,
    custom: true,
  };
}

// Leftmost opaque x of every row (null when empty), plus edge contacts.
export async function rowProfileOf(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const left = new Array(info.height).fill(null);
  let y0 = info.height, touchLeft = false, touchRight = false;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 24) { left[y] = x; if (y < y0) y0 = y; break; }
    }
    if (data[y * info.width * 4 + 3] > 24) touchLeft = true;
    if (data[(y * info.width + info.width - 1) * 4 + 3] > 24) touchRight = true;
  }
  return { left, w: info.width, h: info.height, y0, touchLeft, touchRight };
}

// The standing photo for an avatar on STANDING: { buf (PNG), face, prof }.
// null when the avatar is not on the list.
export async function standingPhoto(root, avatar, cutoutsDir) {
  const spec = STANDING[avatar];
  if (!spec) return null;
  const src = spec.file ? path.join(root, spec.file) : path.join(cutoutsDir, `${avatar}.png`);
  if (!existsSync(src)) throw new Error(`${avatar}: standing photo ${src} missing`);
  const meta = await sharp(src).metadata();
  const h = spec.cropBottom ?? meta.height;
  const buf = spec.cropBottom
    ? await sharp(src).extract({ left: 0, top: 0, width: meta.width, height: h }).png().toBuffer()
    : readFileSync(src);
  const prof = await rowProfileOf(buf);
  // Loud: no straight cut may be left on the left side.
  if (prof.touchLeft) throw new Error(`${avatar}: standing photo still touches its own left side`);
  const facebox = path.join(root, "marketing/giving-tuesday-2026/email-1/facebox.py");
  const out = JSON.parse(execFileSync("python3", [facebox, src], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60000 }));
  const fb = out[src];
  if (!fb) throw new Error(`${avatar}: no face found in ${src}`);
  if (fb[1] + fb[3] > h) throw new Error(`${avatar}: the crop cuts into the face`);
  return { buf, face: faceFractions(fb, meta.width, h), prof, src };
}
