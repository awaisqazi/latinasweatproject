// Crop the Sweat Fest merch-drop photoshoot (Downloads/[MERCH] Sweat Fest)
// into product shots. Writes full-res 4:5 JPGs to the shoot's Final/ folder
// and web-sized WebPs to public/images/merch/sweatfest/.
//
//   node scripts/render-sweatfest-merch-photos.mjs
import sharp from "sharp";
import fs from "fs";
import path from "path";

const SRC = "/Users/fezqazi/Downloads/[MERCH] Sweat Fest";
const FINAL = path.join(SRC, "Final");
const WEB = "public/images/merch/sweatfest";
fs.mkdirSync(FINAL, { recursive: true });
fs.mkdirSync(WEB, { recursive: true });

// Source frames are 4160x6240 portrait. Crop boxes are 4:5, expressed as
// [width, height, left, top] in source pixels.
const BOX = {
  tee: [3800, 4750, 180, 1300], // flat-lay tee: garment spans ~28-90% of height
  crew: [4160, 5200, 0, 1040], // crewnecks run wider than tees
  hoodie: [4160, 5200, 0, 736], // hood reaches ~15% from the top
  tote: [3800, 4750, 180, 1100],
  hat: [4160, 5200, 0, 936], // hat + face + hands, mural behind
};

const SHOTS = [
  ["DSCF4960", "sweatfest-tee-charcoal-front", "tee"],
  ["DSCF4967", "sweatfest-tee-charcoal-back", "tee"],
  ["DSCF4968", "sweatfest-tee-black-front", "tee"],
  ["DSCF4973", "sweatfest-tee-black-back", "tee"],
  ["DSCF4985", "sweatfest-tee-white-front", "tee"],
  ["DSCF4987", "sweatfest-tee-white-back", "tee"],
  ["DSCF4975", "lsp-tee-light-grey", "tee"],
  ["DSCF4976", "lsp-crewneck-heather-grey", "crew"],
  ["DSCF4989", "lsp-crewneck-forest-green", "crew"],
  ["DSCF4992", "lsp-crewneck-brown", "crew"],
  ["DSCF4982", "lsp-hoodie-heather-grey", "hoodie"],
  ["DSCF4979", "lsp-hoodie-forest-green", "hoodie"],
  ["DSCF4994", "lsp-hoodie-brown", "hoodie"],
  ["DSCF4962", "lsp-zip-hoodie-heather-grey", "hoodie"],
  ["DSCF4996", "lsp-zip-hoodie-forest-green", "hoodie"],
  ["DSCF5003", "lsp-tote-logo", "tote"],
  ["DSCF5007", "lsp-tote-wordmark", "tote"],
  ["DSCF5014", "lsp-tote-logo-wordmark", "tote"],
  ["DSCF5016", "lsp-bucket-hat-tan-1", "hat"],
  ["DSCF5018", "lsp-bucket-hat-tan-2", "hat"],
  ["DSCF5020", "lsp-bucket-hat-camel-1", "hat"],
  ["DSCF5022", "lsp-bucket-hat-camel-2", "hat"],
  ["DSCF5037", "lsp-bucket-hat-black-1", "hat"],
  ["DSCF5041", "lsp-bucket-hat-black-2", "hat"],
  ["DSCF5044", "lsp-bucket-hat-mustard-1", "hat"],
  ["DSCF5047", "lsp-bucket-hat-mustard-2", "hat"],
];

for (const [frame, name, kind] of SHOTS) {
  const [width, height, left, top] = BOX[kind];
  const base = sharp(path.join(SRC, `${frame}.jpg`))
    .rotate()
    .extract({ left, top, width, height });
  // Full-res edit for the Final folder (print/social-ready).
  await base
    .clone()
    .resize({ width: 3000 })
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toFile(path.join(FINAL, `${name}.jpg`));
  // Web size for product cards.
  await base
    .clone()
    .resize({ width: 1200 })
    .sharpen({ sigma: 0.6 })
    .webp({ quality: 80 })
    .toFile(path.join(WEB, `${name}.webp`));
  console.log("✓", name);
}
