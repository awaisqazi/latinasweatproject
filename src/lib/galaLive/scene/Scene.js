// src/lib/galaLive/scene/Scene.js
//
// The "Constelacion" hero, assembled. One WebGL2 renderer, one scene, one
// camera, one canvas. Everything legible is DOM and lives above this.
//
// Ported from docs/gala-2026/prototypes/live-3d-proto.html, which is the
// reference implementation the organizer approved. Spec: 05 sections 3 and 5.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

import { FX_COUNTS, PALETTE, PROJECTOR } from "../config.js";
import { createStream } from "../vfx/rng.js";
import { buildSlots } from "./xMask.js";
import { createBackground } from "./effects/background.js";
import { createDust } from "./effects/dust.js";
import { createXGlow } from "./effects/xGlow.js";
import { createStars } from "./effects/stars.js";
import { createComets } from "./effects/comets.js";
import { createSparks } from "./effects/sparks.js";
import { createConfetti } from "./effects/confetti.js";
import { createRings } from "./effects/rings.js";

const MAX_PIXELS = 1920 * 1080; // the projector is 1080p: never a Retina 4x buffer
const FOV = 40;
const CAM_Z = 36;

/** True when this browser can run the full path. */
export function hasWebGL2() {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}

/**
 * @param {HTMLElement} host element the canvas is appended to
 * @param {{level:"full"|"lite", seed:number, projector:boolean, lift?:number, maskUrl?:string|null}} opts
 */
export async function buildScene(host, opts) {
  const level = opts.level === "lite" ? "lite" : "full";
  const counts = FX_COUNTS[level];
  const seed = opts.seed | 0;
  const floors = opts.projector ? PROJECTOR.projector : PROJECTOR.laptop;
  const lift = opts.lift ?? floors.lift;

  const slots = await buildSlots({
    url: opts.maskUrl ?? null,
    nBody: counts.body,
    nCore: counts.core,
    nHalo: counts.halo,
    seed,
  });

  // A lost context can never be reused: every build starts from a fresh canvas.
  const canvas = document.createElement("canvas");
  canvas.className = "g26-fx";
  host.appendChild(canvas);

  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, stencil: false, depth: true, powerPreference: "high-performance" });
  if (!gl) {
    canvas.remove();
    throw new Error("WebGL2 unavailable");
  }

  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false, alpha: false, stencil: false, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x080b11, 1);
  renderer.info.autoReset = false; // count draw calls across every composer pass

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.1, 200);
  camera.position.set(0, 0, CAM_Z);

  const C = (hex) => new THREE.Color(hex); // sRGB hex into the linear working space
  const U = {
    uTime: { value: 0 },
    uNow: { value: 0 },
    uPx: { value: 1 },
    uGold: { value: C(PALETTE.gold) },
    uCream: { value: C(PALETTE.cream) },
    uDeep: { value: C(PALETTE.goldDeep) },
  };

  const disposables = [];
  const track = (o) => {
    disposables.push(o);
    return o;
  };
  const stream = createStream(seed);
  const ctx = { THREE, U, track, C, stream };
  const liteScale = level === "lite" ? 0.4 : 1;

  const background = createBackground({ ...ctx, lift });
  scene.add(background.object);

  const xGroup = new THREE.Group();
  scene.add(xGroup);

  const xGlow = createXGlow({ ...ctx, ghost: floors.ghostOutline });
  xGroup.add(xGlow.object);

  const stars = createStars({ ...ctx, slots, ghost: floors.ghostStars });
  xGroup.add(stars.object);

  const dust = createDust({ ...ctx, seed, count: counts.dust });
  dust.setScale(floors.dustScale);
  scene.add(dust.object);

  const comets = createComets({ ...ctx, count: counts.comets, trail: counts.trail });
  scene.add(comets.object);

  const sparks = createSparks({ ...ctx, count: counts.sparks, scale: liteScale });
  scene.add(sparks.object);

  const confetti = createConfetti({ ...ctx, count: counts.confetti, scale: level === "lite" ? 0.3 : 1 });
  scene.add(confetti.object);

  const rings = createRings({ ...ctx, count: counts.rings });
  for (const m of rings.objects) scene.add(m);

  // Post: RenderPass -> (bloom) -> OutputPass. HalfFloat keeps the HDR that the
  // bloom threshold reads. Lite has no bloom, which is the standing proof that
  // bloom is never the only visible form of an effect.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = counts.bloom ? new UnrealBloomPass(new THREE.Vector2(960, 540), 0.85, 0.55, 0.62) : null;
  if (bloom) composer.addPass(bloom);
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  /* ---------------- layout: DOM rects into world units ---------------- */

  const v3 = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let cssW = 1920;
  let cssH = 1080;
  let viewW = 46;
  let viewH = 26;
  let pixelRatio = 1;
  let degrade = 0;
  let lastCalls = 0;

  function screenToWorld(px, py, z = 0) {
    v3.set((px / cssW) * 2 - 1, -((py / cssH) * 2 - 1), 0.5).unproject(camera);
    dir.copy(v3).sub(camera.position).normalize();
    return camera.position.clone().addScaledVector(dir, (z - camera.position.z) / dir.z);
  }

  // Spring target for the X group (05 section 3.3): the scene follows the
  // [data-fx-anchor="x"] box, so a scene switch slides the mark rather than
  // snapping it.
  const anchorTarget = { x: 0, y: 0, scale: 9 };
  let anchorApplied = false;
  let anchorEl = null;

  function readAnchor() {
    if (!anchorEl || !anchorEl.isConnected) anchorEl = document.querySelector('[data-fx-anchor="x"]');
    const el = anchorEl;
    if (!el) {
      // No anchor in this scene's DOM: fall back to the prototype's framing.
      const portrait = cssW < cssH;
      const ax = portrait ? 0.5 : 0.29;
      const ay = portrait ? 0.3 : 0.53;
      anchorTarget.x = (ax - 0.5) * viewW;
      anchorTarget.y = (0.5 - ay) * viewH;
      anchorTarget.scale = Math.min(viewH * 0.37, viewW * 0.22);
      return { u: ax, v: 1 - ay, boxU: [ax - 0.24, ay - 0.3, ax + 0.24, ay + 0.3] };
    }
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const w = (r.width / cssW) * viewW;
    const h = (r.height / cssH) * viewH;
    anchorTarget.x = ((cx / cssW) - 0.5) * viewW;
    anchorTarget.y = (0.5 - cy / cssH) * viewH;
    // X height is 0.85 of the box height (local extent 1.72), capped by width.
    anchorTarget.scale = Math.max(1, Math.min((0.85 * h) / 1.72, (0.92 * w) / 2.0));
    return {
      u: cx / cssW,
      v: 1 - cy / cssH,
      boxU: [r.left / cssW, 1 - r.bottom / cssH, r.right / cssW, 1 - r.top / cssH],
    };
  }

  /** Cheap per-frame pass: follow the anchor box and keep the halo on it. */
  function syncAnchor() {
    const a = readAnchor();
    background.setHalo(a.u, a.v, 3.2);
    // Grow the clip box a little past the X, then stop. Nothing on the right
    // hand panels ever sees halo light, however bright the moment is.
    const padU = 0.055;
    const padV = 0.09;
    background.setHaloBox(a.boxU[0] - padU, a.boxU[1] - padV, a.boxU[2] + padU, a.boxU[3] + padV);
  }

  function resize() {
    anchorEl = null;
    const rect = host.getBoundingClientRect();
    cssW = Math.max(1, Math.round(rect.width || window.innerWidth));
    cssH = Math.max(1, Math.round(rect.height || window.innerHeight));

    let pr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(MAX_PIXELS / (cssW * cssH)));
    pr = Math.max(0.6, pr * (degrade >= 2 ? 0.8 : 1));
    pixelRatio = pr;
    renderer.setPixelRatio(pr);
    renderer.setSize(cssW, cssH, false);
    composer.setPixelRatio(pr);
    composer.setSize(cssW, cssH);
    if (bloom) bloom.setSize(cssW * pr * (degrade >= 1 ? 0.5 : 1), cssH * pr * (degrade >= 1 ? 0.5 : 1));

    camera.aspect = cssW / cssH;
    camera.position.set(0, 0, CAM_Z);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    viewH = 2 * CAM_Z * Math.tan((FOV * Math.PI) / 360);
    viewW = viewH * camera.aspect;

    const bufH = cssH * pr;
    U.uPx.value = bufH / 1080; // point sizes stay resolution independent

    syncAnchor();
    if (!anchorApplied) {
      xGroup.position.set(anchorTarget.x, anchorTarget.y, 0);
      xGroup.scale.setScalar(anchorTarget.scale);
      anchorApplied = true;
    }
    background.setAspect(camera.aspect);

    dust.setLayout({
      volX: viewW * 1.5,
      volY: viewH * 1.5,
      volZ: 34,
      anchorX: xGroup.position.x,
      anchorY: xGroup.position.y,
      bufW: cssW * pr,
      bufH,
    });
    const quiet = [...document.querySelectorAll("[data-fx-quiet]")].slice(0, 4).map((el) => {
      const r = el.getBoundingClientRect();
      return [r.left * pr, (cssH - r.bottom) * pr, r.right * pr, (cssH - r.top) * pr];
    });
    dust.setQuiet(quiet);
  }

  /* ---------------- emitters ---------------- */

  function slotWorld(i) {
    const s = stars.slotLocal(i);
    return xGroup.localToWorld(tmp.set(s.x, s.y, s.z)).clone();
  }
  const blockOffset = (block) => (block === "core" ? slots.nBody : block === "halo" ? slots.nBody + slots.nCore : 0);

  const handle = {
    canvas,
    renderer,
    level,
    slots,
    counts,
    resize,
    screenToWorld,
    slotWorld,
    blockSlotWorld: (i, block) => slotWorld(blockOffset(block) + i),
    view: () => ({ w: viewW, h: viewH }),
    anchor: () => xGroup.position,
    extent: () => xGroup.scale.x,
    drawCalls: () => lastCalls,
    pixelRatio: () => pixelRatio,

    launchComet(from, to, tier) {
      comets.launch(from, to, tier, U.uNow.value);
    },
    emitSparks(at, n, speed) {
      sparks.emit(at, n, speed, U.uNow.value);
    },
    emitConfetti(n, mode, at) {
      confetti.emit(n, mode, at || xGroup.position, U.uNow.value, { w: viewW, h: viewH });
    },
    confettiCapacity: () => confetti.capacity,
    ring(at, radius, life, power) {
      rings.ring(at, radius, life, power, U.uNow.value);
    },
    /** Spread a big burst over eight points along the X, never one hot dot. */
    burstAlongX(n, speed) {
      for (let k = 0; k < 8; k++) {
        sparks.emit(slotWorld(Math.floor(((k + 0.5) / 8) * Math.max(1, slots.nBody - 1))), n / 8, speed, U.uNow.value);
      }
    },
    lightRange(from, to, block, stagger) {
      stars.lightRange(from, to, block, stagger, U.uNow.value);
    },
    unlightTo(count, block) {
      stars.unlightTo(count, block);
    },
    restore(s) {
      stars.restore(s);
    },
    setDegrade(next) {
      degrade = Math.max(0, Math.min(3, next | 0));
      dust.setDrawRange(degrade >= 3 ? 0.5 : 1);
      resize();
    },
    getDegrade: () => degrade,

    /**
     * 05 section 5.5: the page's clock has pulled uNow back by `delta`. Shift
     * every stored spawn time by the same amount so nothing replays.
     */
    rebaseBy(delta) {
      if (!(delta > 0)) return;
      stars.rebase();
      comets.rebase(delta);
      sparks.rebase(delta);
      confetti.rebase(delta);
      rings.rebase(delta);
    },

    /**
     * @param {number} dt clamped seconds
     * @param {{t:number, now:number, heat:number, duck:number, flash:number,
     *          fillY:number, goal01:number, impulseAge:number, progress:number}} s
     */
    frame(dt, s) {
      U.uTime.value = s.t;
      U.uNow.value = s.now;
      syncAnchor();

      // Damped spring onto the anchor (k = 4, about 1.2 s).
      const k = 1 - Math.exp(-dt * 4);
      xGroup.position.x += (anchorTarget.x - xGroup.position.x) * k;
      xGroup.position.y += (anchorTarget.y - xGroup.position.y) * k;
      const sc = xGroup.scale.x + (anchorTarget.scale - xGroup.scale.x) * k;
      xGroup.scale.setScalar(sc);

      xGroup.rotation.y = 0.13 * Math.sin(s.t * 0.21);
      xGroup.rotation.x = 0.045 * Math.sin(s.t * 0.17);
      camera.position.x = 0.9 * Math.sin(s.t * 0.07);
      camera.position.y = 0.5 * Math.sin(s.t * 0.05);
      camera.lookAt(0, 0, 0);

      dust.frame(dt, s);
      xGlow.frame(s);
      stars.frame(s);
      background.frame(s);

      // The exposure governor. Big moments get DARKER around the light, not
      // whiter, and the peak decays exp(-1.6 t): inside 1.5 s it is back to
      // about a tenth, so every DOM plate stays readable (05 section 3.5).
      if (bloom) bloom.strength = Math.min(1.1, 0.8 + 0.25 * s.flash);
      renderer.toneMappingExposure = 1.0 - 0.28 * s.flash;

      lastCalls = renderer.info.render.calls;
      renderer.info.reset();
      composer.render();
    },

    dispose() {
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          /* a disposed-twice geometry is not worth a crash */
        }
      }
      try {
        bloom?.dispose();
        outputPass.dispose();
        composer.dispose();
      } catch {
        /* ignore */
      }
      renderer.dispose();
      renderer.forceContextLoss(); // browsers cap live contexts at about 16
      canvas.remove();
    },
  };

  resize();
  return handle;
}
