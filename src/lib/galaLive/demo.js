// src/lib/galaLive/demo.js
//
// ?demo=1. A local fake-gift generator that NEVER touches the network, so a
// rehearsal cannot put a single row in the database or read a real donor name.
// Every name in here is invented (05 section 5.9, house rule at the top of 05).
//
// Seeded from ?seed=, so `?demo=script:paddle&seed=7` replays identically.

import { DEMO_NAMES, DEMO_LEVELS } from "./config.js";
import { mulberry32 } from "./vfx/rng.js";

/**
 * @param {{director:object, seed:number, script?:string, goalCents:number,
 *          onTotal?:Function}} opts
 */
export function createDemo({ director, seed, script = "", goalCents, onTotal }) {
  const r = mulberry32((seed | 0) ^ 0xde30);
  let seq = 900000; // far above any real seq, so a demo can never collide
  let total = 0;
  let nextAt = 3;
  let clumpAt = 40;
  let t = 0;

  const gift = (cents) => ({ seq: ++seq, cents, name: DEMO_NAMES[Math.floor(r() * DEMO_NAMES.length)] });

  function push(cents) {
    total += cents;
    director.receiveGift(gift(cents), "live");
    director.reconcile(total);
    onTotal?.(total);
  }

  function burst(n) {
    for (let i = 0; i < n; i++) push(DEMO_LEVELS[Math.floor(r() * 10)]);
  }

  return {
    /** Seed the board so the projector does not open at zero. */
    prime(cents) {
      total += cents;
      director.reconcile(total);
      onTotal?.(total);
    },
    push,
    burst,
    /** Jump to just under goal, so the finale can be rehearsed in one click. */
    jumpToGoal(fraction = 0.95) {
      push(Math.max(1000, Math.round(goalCents * fraction - total)));
    },
    tick(dt) {
      t += dt;
      if (script === "soak") {
        if (t >= nextAt) {
          push(DEMO_LEVELS[Math.floor(r() * DEMO_LEVELS.length)]);
          nextAt = t + 2;
        }
        if (t >= clumpAt) {
          burst(12);
          clumpAt = t + 40;
        }
        return;
      }
      if (script === "script:paddle") {
        // A six minute paddle raise: descending levels, clumps at each call.
        if (t >= nextAt) {
          const stage = Math.min(5, Math.floor(t / 60));
          const level = [500000, 250000, 100000, 50000, 25000, 10000][stage];
          const n = 1 + Math.floor(r() * (2 + stage * 2));
          for (let i = 0; i < n; i++) push(level);
          nextAt = t + 4 + r() * 6;
        }
        return;
      }
      if (t < nextAt) return;
      if (r() < 0.12) {
        burst(6 + Math.floor(r() * 8)); // a paddle-raise clump
        nextAt = t + 9;
      } else {
        push(DEMO_LEVELS[Math.floor(r() * DEMO_LEVELS.length)]);
        nextAt = t + 1.5 + r() * 5;
      }
    },
    get total() {
      return total;
    },
  };
}
