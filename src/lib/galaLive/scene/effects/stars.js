// L3 stars. One Points draw holds three blocks: body slots that fill the X,
// core slots that light only at goal, and halo slots that fill the stretch ring
// between 100% and 150%. Unlit body slots render as faint ghosts.
//
// Lighting is data, not animation: a slot's aLitAt is the uNow at which it was
// earned, so a scene rebuild just writes -100 into every earned slot and the
// picture is back with no replays.

import { STAR_VERT, STAR_FRAG } from "../shaders.js";

const NEVER = 1e9;
const ALREADY = -100;

export function createStars({ THREE, U, track, slots, ghost }) {
  const { all, nBody, nCore, nHalo } = slots;
  const n = all.length;

  const geometry = track(new THREE.BufferGeometry());
  const pos = new Float32Array(n * 3);
  const lit = new Float32Array(n);
  const sd = new Float32Array(n);
  const kind = new Float32Array(n);
  all.forEach((s, i) => {
    pos[i * 3] = s.x;
    pos[i * 3 + 1] = s.y;
    pos[i * 3 + 2] = s.z;
    sd[i] = s.s;
    kind[i] = i < nBody ? 0 : i < nBody + nCore ? 1 : 2;
    lit[i] = NEVER;
  });
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const litAttr = new THREE.BufferAttribute(lit, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aLitAt", litAttr);
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
  geometry.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));

  const material = track(
    new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: U.uTime,
        uNow: U.uNow,
        uPx: U.uPx,
        uGold: U.uGold,
        uCream: U.uCream,
        uGhost: { value: ghost },
        uFlashAll: { value: 0 },
      },
    }),
  );

  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 3;

  const offsetOf = (block) => (block === "core" ? nBody : block === "halo" ? nBody + nCore : 0);

  return {
    object,
    material,
    counts: { body: nBody, core: nCore, halo: nHalo },
    /** Local-space position of slot i in the flat "all" index space. */
    slotLocal: (i) => all[Math.max(0, Math.min(n - 1, i))],
    /** Light slots [from, to) of a block, rippled over `stagger` seconds. */
    lightRange(from, to, block, stagger, now) {
      const off = offsetOf(block);
      const span = Math.max(1, to - from);
      for (let i = from; i < to; i++) {
        const idx = off + i;
        if (idx < 0 || idx >= n) continue;
        lit[idx] = now + ((i - from) / span) * stagger;
      }
      litAttr.needsUpdate = true;
    },
    /** Silent correction: un-light back down to `count` lit slots, newest first. */
    unlightTo(count, block) {
      const off = offsetOf(block);
      const size = block === "core" ? nCore : block === "halo" ? nHalo : nBody;
      for (let i = Math.max(0, count); i < size; i++) lit[off + i] = NEVER;
      litAttr.needsUpdate = true;
    },
    /** After a rebuild: everything already earned is simply lit, no replays. */
    restore({ litBody, litHalo, coreLit }) {
      for (let i = 0; i < n; i++) lit[i] = NEVER;
      for (let i = 0; i < Math.min(litBody, nBody); i++) lit[i] = ALREADY;
      if (coreLit) for (let i = 0; i < nCore; i++) lit[nBody + i] = ALREADY;
      for (let i = 0; i < Math.min(litHalo, nHalo); i++) lit[nBody + nCore + i] = ALREADY;
      litAttr.needsUpdate = true;
    },
    /** uNow rebase: every lit slot loses its birth flash, which is correct. */
    rebase() {
      for (let i = 0; i < n; i++) if (lit[i] < NEVER) lit[i] = ALREADY;
      litAttr.needsUpdate = true;
    },
    setGhost(v) {
      material.uniforms.uGhost.value = v;
    },
    frame({ flash }) {
      material.uniforms.uFlashAll.value = flash;
    },
  };
}
