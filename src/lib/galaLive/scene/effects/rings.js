// L4 shockwave rings. Four pooled quads. Thin on purpose (0.035 of the radius):
// the fat soft skirt is what washed the prototype's first goal finale to white.

import { RING_VERT, RING_FRAG } from "../shaders.js";

export function createRings({ THREE, U, track, count }) {
  const geometry = track(new THREE.PlaneGeometry(1, 1));
  const meshes = [];
  for (let i = 0; i < count; i++) {
    const material = track(
      new THREE.ShaderMaterial({
        vertexShader: RING_VERT,
        fragmentShader: RING_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uNow: U.uNow, uGold: U.uGold, uCream: U.uCream, uStart: { value: -1e4 }, uLife: { value: 1 }, uPower: { value: 1 } },
      }),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    meshes.push(mesh);
  }

  let cursor = 0;
  return {
    objects: meshes,
    ring(at, radius, life, power, now) {
      const m = meshes[cursor];
      cursor = (cursor + 1) % count;
      m.position.set(at.x, at.y, 0.5);
      m.scale.setScalar(radius * 2);
      m.material.uniforms.uStart.value = now;
      m.material.uniforms.uLife.value = life;
      m.material.uniforms.uPower.value = power;
    },
    rebase(delta) {
      for (const m of meshes) m.material.uniforms.uStart.value -= delta;
    },
  };
}
