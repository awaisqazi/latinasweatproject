// L1 ambient gold dust. A wrapped volume of rising motes, 1.5% large soft
// bokeh, dimmed inside the DOM's quiet rects so the text zones stay calm, and
// ducked while a T4 card is up. Drift is integrated on the CPU in float64 so a
// heat change never jumps a position (05 section 5.5).

import { DUST_VERT, DUST_FRAG } from "../shaders.js";
import { mulberry32 } from "../../vfx/rng.js";

export function createDust({ THREE, U, track, seed, count }) {
  const geometry = track(new THREE.BufferGeometry());
  const r = mulberry32((seed | 0) ^ 0xd057);
  const pos = new Float32Array(count * 3);
  const sd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = r();
    pos[i * 3 + 1] = r();
    pos[i * 3 + 2] = r();
    sd[i] = r();
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));

  const material = track(
    new THREE.ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: U.uTime,
        uPx: U.uPx,
        uGold: U.uGold,
        uCream: U.uCream,
        uDrift: { value: 0 },
        uDuck: { value: 0 },
        uImpulse: { value: 0 },
        uScale: { value: 1 },
        uVol: { value: new THREE.Vector3(70, 40, 34) },
        uAnchor: { value: new THREE.Vector2() },
        uRes: { value: new THREE.Vector2(1920, 1080) },
        uQuiet: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      },
    }),
  );

  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 0;
  const full = count;

  return {
    object,
    material,
    setLayout({ volX, volY, volZ, anchorX, anchorY, bufW, bufH }) {
      material.uniforms.uVol.value.set(volX, volY, volZ);
      material.uniforms.uAnchor.value.set(anchorX, anchorY);
      material.uniforms.uRes.value.set(bufW, bufH);
    },
    /** Up to four rects in drawing-buffer pixels, y flipped (05 section 3.3). */
    setQuiet(rects) {
      const q = material.uniforms.uQuiet.value;
      for (let i = 0; i < 4; i++) {
        const r0 = rects[i];
        if (r0) q[i].set(r0[0], r0[1], r0[2], r0[3]);
        else q[i].set(0, 0, -1, -1);
      }
    },
    setScale(v) {
      material.uniforms.uScale.value = v;
    },
    /** Halve the draw range: FPS governor step 3. */
    setDrawRange(fraction) {
      geometry.setDrawRange(0, Math.max(200, Math.round(full * fraction)));
    },
    frame(dt, { heat, duck, impulseAge }) {
      material.uniforms.uDrift.value += dt * (0.9 + 2.2 * heat);
      material.uniforms.uDuck.value = duck;
      material.uniforms.uImpulse.value =
        impulseAge > 0 && impulseAge < 3
          ? Math.sin(Math.min(1, impulseAge / 3) * Math.PI) * Math.exp(-impulseAge * 0.9) * 2.2
          : 0;
    },
  };
}
