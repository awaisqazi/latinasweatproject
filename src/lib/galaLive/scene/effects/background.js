// L0 background. A full-screen quad: navy gradient, warm halo behind the X,
// faint nebula, dither to kill 8-bit banding. Carries no information, so the
// design still works if a projector crushes it to black (05 section 3.6).

import { BG_VERT, BG_FRAG } from "../shaders.js";
import { PALETTE } from "../../config.js";

export function createBackground({ THREE, U, track, C, lift }) {
  const material = track(
    new THREE.ShaderMaterial({
      vertexShader: BG_VERT,
      fragmentShader: BG_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: U.uTime,
        uGold: U.uGold,
        uAspect: { value: 16 / 9 },
        uLift: { value: lift },
        uProgress: { value: 0 },
        uFlash: { value: 0 },
        uHaloR: { value: 3.2 },
        uHalo: { value: new THREE.Vector2(0.29, 0.47) },
        uHaloBox: { value: new THREE.Vector4(-1, -1, 2, 2) },
        uTop: { value: C(PALETTE.bgTop) },
        uMid: { value: C(PALETTE.bgMid) },
        uBot: { value: C(PALETTE.bgBot) },
      },
    }),
  );

  const object = new THREE.Mesh(track(new THREE.PlaneGeometry(2, 2)), material);
  object.frustumCulled = false;
  object.renderOrder = -10;

  return {
    object,
    material,
    /** Halo centre in uv space, and how tight it is. A wider halo never reaches
     *  the total panel: the falloff is set from the X box, not the viewport. */
    setHalo(u, v, tightness) {
      material.uniforms.uHalo.value.set(u, v);
      material.uniforms.uHaloR.value = tightness;
    },
    /** Hard bounds in uv. The halo is zero outside them, whatever the moment. */
    setHaloBox(minU, minV, maxU, maxV) {
      material.uniforms.uHaloBox.value.set(minU, minV, maxU, maxV);
    },
    setAspect(a) {
      material.uniforms.uAspect.value = a;
    },
    setLift(v) {
      material.uniforms.uLift.value = v;
    },
    frame({ progress, flash }) {
      material.uniforms.uProgress.value = progress;
      material.uniforms.uFlash.value = flash * 0.5;
    },
  };
}
