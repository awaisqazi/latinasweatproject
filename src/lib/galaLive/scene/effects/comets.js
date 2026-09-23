// L5 comets. Each gift is one comet: the head and the whole trail are the same
// Points, and each trail point replays the bezier 0 to 0.42 s late, so the tail
// pours into the X after the head lands. Ring buffer, zero allocation per gift.

import { COMET_VERT, COMET_FRAG } from "../shaders.js";

export function createComets({ THREE, U, track, count, trail, stream }) {
  const n = count * trail;
  const geometry = track(new THREE.BufferGeometry());
  const p0 = new Float32Array(n * 3);
  const p1 = new Float32Array(n * 3);
  const p2 = new Float32Array(n * 3);
  const t = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    t[i * 4] = -1e4;
    t[i * 4 + 1] = 1;
  }
  const attrs = {
    p0: new THREE.BufferAttribute(p0, 3),
    p1: new THREE.BufferAttribute(p1, 3),
    p2: new THREE.BufferAttribute(p2, 3),
    t: new THREE.BufferAttribute(t, 4),
  };
  for (const a of Object.values(attrs)) a.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", attrs.p0);
  geometry.setAttribute("aP1", attrs.p1);
  geometry.setAttribute("aP2", attrs.p2);
  geometry.setAttribute("aT", attrs.t);

  const material = track(
    new THREE.ShaderMaterial({
      vertexShader: COMET_VERT,
      fragmentShader: COMET_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uNow: U.uNow, uPx: U.uPx, uGold: U.uGold, uCream: U.uCream },
    }),
  );

  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 5;

  let cursor = 0;
  const mid = new THREE.Vector3();

  return {
    object,
    material,
    /**
     * @param {THREE.Vector3} from launch point, usually the hero card's left edge
     * @param {THREE.Vector3} to the star slot this gift lights
     */
    launch(from, to, { flight, head }, now) {
      const base = cursor * trail;
      cursor = (cursor + 1) % count;
      mid.copy(from).lerp(to, 0.5);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const bend = (stream.next(0xc0) - 0.5) * 16 + 5;
      mid.x += (-dy / len) * bend;
      mid.y += (dx / len) * bend + 3;
      mid.z = 6 + stream.next(0xc1) * 6; // arcs toward the camera, for depth
      for (let k = 0; k < trail; k++) {
        const i = base + k;
        p0[i * 3] = from.x;
        p0[i * 3 + 1] = from.y;
        p0[i * 3 + 2] = from.z;
        p1[i * 3] = mid.x;
        p1[i * 3 + 1] = mid.y;
        p1[i * 3 + 2] = mid.z;
        p2[i * 3] = to.x;
        p2[i * 3 + 1] = to.y;
        p2[i * 3 + 2] = to.z;
        t[i * 4] = now;
        t[i * 4 + 1] = flight;
        t[i * 4 + 2] = trail > 1 ? k / (trail - 1) : 0;
        t[i * 4 + 3] = head;
      }
      for (const a of Object.values(attrs)) a.needsUpdate = true;
    },
    /** uNow rebase: shift every live start time by the same amount. */
    rebase(delta) {
      for (let i = 0; i < n; i++) t[i * 4] -= delta;
      attrs.t.needsUpdate = true;
    },
  };
}
