// L2 the X glow plane. One SDF gives all four reads at once: a ghost outline
// that is always visible (the X is always a promise), molten gold below the
// fill front, a cream meniscus at the front, and the core disc that lights only
// at 100%. Never isolate the core: it is drawn by uGoal alone.

import { XG_VERT, XG_FRAG } from "../shaders.js";

export function createXGlow({ THREE, U, track, ghost }) {
  const material = track(
    new THREE.ShaderMaterial({
      vertexShader: XG_VERT,
      fragmentShader: XG_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: U.uTime,
        uGold: U.uGold,
        uDeep: U.uDeep,
        uCream: U.uCream,
        uFillY: { value: -1 },
        uGoal: { value: 0 },
        uFlash: { value: 0 },
        uGhost: { value: ghost },
      },
    }),
  );

  const object = new THREE.Mesh(track(new THREE.PlaneGeometry(2, 2)), material);
  object.renderOrder = 1;
  // Plane vertices are +-1 and the shader multiplies by 1.55, so scaling the
  // mesh by 1.55 keeps its units equal to the star slots' local units.
  object.scale.setScalar(1.55);

  return {
    object,
    material,
    setGhost(v) {
      material.uniforms.uGhost.value = v;
    },
    frame({ fillY, goal01, flash }) {
      material.uniforms.uFillY.value = fillY;
      material.uniforms.uGoal.value = goal01;
      material.uniforms.uFlash.value = flash;
    },
  };
}
