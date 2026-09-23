// src/lib/galaLive/scene/clock.js
//
// One pausable clock for the whole page, with the two-uniform split from
// 05 section 5.5. dt is clamped, so a stall never becomes a time jump or a
// burst of stale effects.
//
//   t    never rebased. Slow periodic motion reads this.
//   now  rebased when the show has been idle long enough, so float32 keeps its
//        millisecond precision across a four hour run.

const MAX_DT = 0.05;

export function createClock() {
  let t = 0;
  let now = 0;
  let last = 0;
  let running = false;

  return {
    get t() {
      return t;
    },
    get now() {
      return now;
    },
    start(perfNow = performance.now()) {
      last = perfNow;
      running = true;
    },
    stop() {
      running = false;
    },
    /** @returns {number} clamped dt in seconds */
    tick(perfNow = performance.now()) {
      if (!running) {
        last = perfNow;
        running = true;
        return 0;
      }
      let dt = (perfNow - last) / 1000;
      last = perfNow;
      if (!(dt > 0)) dt = 0;
      if (dt > MAX_DT) dt = MAX_DT;
      t += dt;
      now += dt;
      return dt;
    },
    /**
     * Pull `now` back to zero. The caller must shift every absolute timestamp
     * it holds by the returned delta.
     * @returns {number} how much `now` moved
     */
    rebase() {
      const delta = now;
      now = 0;
      return delta;
    },
  };
}
