// src/lib/galaLive/scene/xMask.js
//
// The X mark as star slots. Local coordinates run x,y in [-1,1].
//
// The approved prototype (docs/gala-2026/prototypes/live-3d-proto.html) draws the
// mark from a signed distance field, and that is what the organizer signed off
// on, so the SDF is the primary source here: no image request, nothing to fail
// at 7 PM. `buildSlots({ url })` can sample a 512 px alpha mask instead when one
// is supplied (05 section 5.2 lists public/images/gala-live/x-mask.png as the
// documented upgrade path); the SDF stays the fallback either way.

import { mulberry32 } from "../vfx/rng.js";

/** Bar angle from vertical, in radians, and bar half width. */
export const XA = 0.7;
export const XHW = 0.23;

function sdBox(px, py, hx, hy) {
  const dx = Math.abs(px) - hx;
  const dy = Math.abs(py) - hy;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
}

/** Signed distance to the LSP X mark. Negative inside. */
export function sdX(px, py) {
  const c = Math.cos(XA);
  const s = Math.sin(XA);
  let d = Math.min(
    sdBox(c * px + s * py, -s * px + c * py, XHW, 1.5),
    sdBox(c * px - s * py, s * px + c * py, XHW, 1.5),
  );
  d = Math.max(d, Math.abs(py) - 0.86); // flat top and bottom, like the logo
  d = Math.max(d, Math.abs(px) - 1.0);
  d = Math.min(d, Math.hypot(Math.abs(px) - 0.4, py) - 0.21); // side lobes
  d = Math.max(d, -(Math.hypot(px, py) - 0.25)); // the eye hole
  return d;
}

/** 0 outside, 1 body, 2 core. The core is the small centre disc. */
export const maskKind = (px, py) => (Math.hypot(px, py) < 0.115 ? 2 : sdX(px, py) < -0.012 ? 1 : 0);

/**
 * Load a square alpha mask and return a `(x,y) -> 0|1|2` sampler in the same
 * local space. Resolves to null when the image cannot be read, so the caller
 * falls back to the SDF.
 * @param {string} url
 * @returns {Promise<((x:number,y:number)=>number)|null>}
 */
async function loadMaskSampler(url) {
  if (!url || typeof document === "undefined") return null;
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const n = 256;
    const cv = document.createElement("canvas");
    cv.width = n;
    cv.height = n;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, n, n);
    const { data } = ctx.getImageData(0, 0, n, n);
    return (px, py) => {
      const ix = Math.round(((px + 1) / 2) * (n - 1));
      const iy = Math.round(((1 - py) / 2) * (n - 1));
      if (ix < 0 || iy < 0 || ix >= n || iy >= n) return 0;
      const a = data[(iy * n + ix) * 4 + 3];
      if (a < 96) return 0;
      return Math.hypot(px, py) < 0.115 ? 2 : 1;
    };
  } catch {
    return null;
  }
}

/**
 * @typedef {{x:number,y:number,z:number,s:number,key:number}} Slot
 * @typedef {{body:Slot[],core:Slot[],halo:Slot[],all:Slot[],nBody:number,nCore:number,nHalo:number}} Slots
 */

/**
 * Sample star slots inside the mark.
 *
 * Body slots are sorted by `y + jitter(0.22)`, which is the whole trick: the X
 * fills bottom to top with a ragged front, so the mark reads as a vessel and
 * doubles as the thermometer (05 section 3.2).
 *
 * @param {{url?:string|null, nBody:number, nCore:number, nHalo:number, seed:number}} opts
 * @returns {Promise<Slots>}
 */
export async function buildSlots({ url = null, nBody, nCore, nHalo, seed }) {
  const sampler = (await loadMaskSampler(url)) || maskKind;
  const r = mulberry32(seed);
  const body = [];
  const core = [];
  const halo = [];

  // Rejection sampling. Bounded so a bad mask can never spin the main thread.
  let guard = 0;
  while ((body.length < nBody || core.length < nCore) && guard < nBody * 400 + 20000) {
    guard++;
    const x = r() * 2 - 1;
    const y = r() * 2 - 1;
    const k = sampler(x, y);
    if (k === 1 && body.length < nBody) body.push({ x, y, z: (r() - 0.5) * 0.12, s: r(), key: y + (r() - 0.5) * 0.22 });
    else if (k === 2 && core.length < nCore) core.push({ x, y, z: 0.02, s: r(), key: 0 });
  }
  // A mask with no centre hole would starve the core loop: fill what is missing
  // on the unit circle so the goal ignition always has something to light.
  while (core.length < nCore) {
    const a = (core.length / nCore) * Math.PI * 2;
    const rad = 0.06 + r() * 0.05;
    core.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad, z: 0.02, s: r(), key: 0 });
  }

  body.sort((a, b) => a.key - b.key); // FILL ORDER: bottom to top, ragged front

  for (let i = 0; i < nHalo; i++) {
    // Stretch ring, filled clockwise from the top.
    const a = Math.PI / 2 - (i / nHalo) * Math.PI * 2;
    const rad = 1.28 + (r() - 0.5) * 0.09;
    halo.push({ x: Math.cos(a) * rad * 1.02, y: Math.sin(a) * rad * 0.98, z: (r() - 0.5) * 0.2, s: r(), key: i });
  }

  return { body, core, halo, all: [...body, ...core, ...halo], nBody: body.length, nCore: core.length, nHalo: halo.length };
}
