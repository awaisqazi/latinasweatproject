// L7 foil confetti. One instanced mesh of tumbling quads with a closed-form
// terminal-velocity fall and a specular foil glint that bloom catches. Modes:
// "pop" from a point (T3), "rain" from above the top edge (T4 and finales).

import { CONF_VERT, CONF_FRAG } from "../shaders.js";

const FOIL_HEX = ["#ffbd59", "#fff8ef", "#b9842f", "#f2e4d2", "#ffd98f"];

export function createConfetti({ THREE, U, track, C, count, stream, scale = 1 }) {
  const geometry = track(new THREE.InstancedBufferGeometry());
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const start = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const misc = new Float32Array(count * 4);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    misc[i * 4] = -1e4;
    misc[i * 4 + 1] = 1;
  }
  const attrs = {
    s: new THREE.InstancedBufferAttribute(start, 3),
    v: new THREE.InstancedBufferAttribute(vel, 3),
    m: new THREE.InstancedBufferAttribute(misc, 4),
    c: new THREE.InstancedBufferAttribute(col, 3),
  };
  for (const a of Object.values(attrs)) a.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("iStart", attrs.s);
  geometry.setAttribute("iVel", attrs.v);
  geometry.setAttribute("iMisc", attrs.m);
  geometry.setAttribute("iCol", attrs.c);
  geometry.instanceCount = count;

  const material = track(
    new THREE.ShaderMaterial({
      vertexShader: CONF_VERT,
      fragmentShader: CONF_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      uniforms: { uNow: U.uNow },
    }),
  );

  const object = new THREE.Mesh(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 7;

  const FOIL = FOIL_HEX.map(C);
  let cursor = 0;

  return {
    object,
    material,
    capacity: count,
    /**
     * @param {number} n pieces
     * @param {"pop"|"rain"} mode
     * @param {{x:number,y:number,z:number}|null} at required for "pop"
     * @param {{w:number,h:number}} view world extents of the frustum at z=0
     */
    emit(n, mode, at, now, view) {
      const total = Math.min(count, Math.round(n * scale));
      for (let j = 0; j < total; j++) {
        const i = cursor;
        cursor = (cursor + 1) % count;
        const c = FOIL[(cursor + j) % FOIL.length];
        if (mode === "rain") {
          start[i * 3] = (stream.next(0x61) - 0.5) * view.w * 1.1;
          start[i * 3 + 1] = view.h * 0.5 + 1 + stream.next(0x62) * 6;
          start[i * 3 + 2] = (stream.next(0x63) - 0.5) * 10;
          vel[i * 3] = (stream.next(0x64) - 0.5) * 2;
          vel[i * 3 + 1] = -1 - stream.next(0x65) * 2;
          vel[i * 3 + 2] = 0;
          misc[i * 4] = now + stream.next(0x66) * 2.5;
          misc[i * 4 + 1] = 7 + stream.next(0x67) * 4;
        } else {
          const th = stream.next(0x61) * Math.PI * 2;
          const sp = 5 + stream.next(0x62) * 11;
          start[i * 3] = at.x;
          start[i * 3 + 1] = at.y;
          start[i * 3 + 2] = at.z + 1;
          vel[i * 3] = Math.cos(th) * sp;
          vel[i * 3 + 1] = Math.sin(th) * sp + 5;
          vel[i * 3 + 2] = (stream.next(0x63) - 0.5) * 6;
          misc[i * 4] = now;
          misc[i * 4 + 1] = 3.5 + stream.next(0x67) * 3;
        }
        misc[i * 4 + 2] = stream.next(0x68);
        misc[i * 4 + 3] = 0.3 + stream.next(0x69) * 0.29;
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      for (const a of Object.values(attrs)) a.needsUpdate = true;
    },
    rebase(delta) {
      for (let i = 0; i < count; i++) misc[i * 4] -= delta;
      attrs.m.needsUpdate = true;
    },
  };
}
