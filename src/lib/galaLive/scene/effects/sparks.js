// L6 sparks. An analytic drag burst at each landing, written into a ring
// buffer. Peak HDR is 2.8 and the burst is spread over eight points along the X
// for anything big, so a finale never becomes one white-hot dot (05 s3.5).

import { SPARK_VERT, SPARK_FRAG } from "../shaders.js";

export function createSparks({ THREE, U, track, count, stream, scale = 1 }) {
  const geometry = track(new THREE.BufferGeometry());
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const misc = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    misc[i * 3] = -1e4;
    misc[i * 3 + 1] = 1;
  }
  const attrs = {
    p: new THREE.BufferAttribute(pos, 3),
    v: new THREE.BufferAttribute(vel, 3),
    m: new THREE.BufferAttribute(misc, 3),
  };
  for (const a of Object.values(attrs)) a.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", attrs.p);
  geometry.setAttribute("aVel", attrs.v);
  geometry.setAttribute("aMisc", attrs.m);

  const material = track(
    new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uNow: U.uNow, uPx: U.uPx, uGold: U.uGold, uCream: U.uCream, uDeep: U.uDeep },
    }),
  );

  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 6;

  let cursor = 0;

  return {
    object,
    material,
    emit(at, n, speed, now) {
      const total = Math.min(count, Math.round(n * scale));
      for (let j = 0; j < total; j++) {
        const i = cursor;
        cursor = (cursor + 1) % count;
        const th = stream.next(0x51) * Math.PI * 2;
        const ph = Math.acos(2 * stream.next(0x52) - 1);
        const sp = speed * (0.35 + stream.next(0x53));
        pos[i * 3] = at.x;
        pos[i * 3 + 1] = at.y;
        pos[i * 3 + 2] = at.z;
        vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
        vel[i * 3 + 1] = Math.cos(ph) * sp;
        vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp * 0.5;
        misc[i * 3] = now;
        misc[i * 3 + 1] = 0.7 + stream.next(0x54) * 1.3;
        misc[i * 3 + 2] = stream.next(0x55);
      }
      for (const a of Object.values(attrs)) a.needsUpdate = true;
    },
    rebase(delta) {
      for (let i = 0; i < count; i++) misc[i * 3] -= delta;
      attrs.m.needsUpdate = true;
    },
  };
}
