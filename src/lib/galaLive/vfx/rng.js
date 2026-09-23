// src/lib/galaLive/vfx/rng.js
//
// Deterministic randomness for the live scene. Same idiom as the MIT
// threejs-vfx library in the remotion-ffmpeg skill (core/rng.js): every
// particle attribute is a pure function of (id, seed), so ?demo=1&seed=N
// rehearsals replay identically and a rebuilt scene lands in the same place.
//
// Nothing here reads a clock or Math.random.

/** Classic public-domain PRNG, seeded. Used for build-time loops only. */
export function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @returns {number} [0,1) from an integer id and seed. */
export function hash01(i, seed) {
  let h = (i | 0) * 374761393 + (seed | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/**
 * A counter-backed stream. Emitters pull from this so a given seed plus a given
 * sequence of events always produces the same particles.
 */
export function createStream(seed) {
  let counter = 0;
  return {
    /** @param {number} salt decorrelates concurrent uses inside one emit */
    next: (salt = 0) => hash01(counter++, (seed | 0) ^ (salt | 0)),
    get count() {
      return counter;
    },
  };
}
