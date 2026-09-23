// src/lib/galaLive/scene/watchdog.js
//
// Keeps the canvas alive for four hours without ever taking the page down with
// it. Three detectors, one recovery path (05 section 5.7):
//   1. webglcontextlost
//   2. no frame for five seconds while the tab is visible
//   3. an exception thrown inside scene.frame()
//
// The rAF loop and the director never stop: the total keeps counting and names
// keep appearing while the canvas is being rebuilt.

export function createWatchdog({ onRebuild, onGiveUp, onDegrade, maxLosses = 3, rebuildDelayMs = 1500 }) {
  let losses = 0;
  let rebuilds = 0;
  let degrade = 0;
  let lastFrameAt = performance.now();
  let rebuilding = false;
  let stopped = false;
  let stallTimer = 0;
  let detachCanvas = null;

  // FPS governor: a moving average over 0.5 s windows. Never auto-upgrades
  // during a show.
  let acc = 0;
  let accN = 0;
  let accAt = 0;
  let slowFor = 0;
  let fps = 60;
  let ms = 16.7;

  function trip(reason) {
    if (stopped || rebuilding) return;
    losses++;
    rebuilding = true;
    if (losses > maxLosses) {
      rebuilding = false;
      onGiveUp?.(reason);
      return;
    }
    setTimeout(() => {
      rebuilding = false;
      if (stopped) return;
      rebuilds++;
      lastFrameAt = performance.now();
      onRebuild?.(reason, rebuilds);
    }, rebuildDelayMs);
  }

  stallTimer = setInterval(() => {
    if (stopped || rebuilding) return;
    if (!document.hidden && performance.now() - lastFrameAt > 5000) trip("stall");
  }, 2000);

  return {
    get stats() {
      return { losses, rebuilds, degrade, fps, ms };
    },
    /** Attach to a freshly built canvas. Detaches the previous one. */
    watch(canvas) {
      detachCanvas?.();
      const onLost = (e) => {
        e.preventDefault();
        trip("context-lost");
      };
      canvas.addEventListener("webglcontextlost", onLost);
      detachCanvas = () => canvas.removeEventListener("webglcontextlost", onLost);
      lastFrameAt = performance.now();
    },
    noteFrame() {
      lastFrameAt = performance.now();
    },
    frameThrew() {
      trip("frame-error");
    },
    /**
     * Call once per rAF. Measures REAL elapsed time, not the director's clamped
     * dt: a clamped dt would report 20 fps for a tab that is actually painting
     * once a second, and the operator's HUD has to tell the truth.
     */
    sample(_dt, hasScene) {
      const t = performance.now();
      if (!accAt) accAt = t;
      accN++;
      acc = (t - accAt) / 1000;
      if (acc > 2) {
        // The tab was hidden or the machine slept: that window is not a frame
        // rate measurement, so throw it away rather than degrade on it.
        accAt = t;
        accN = 0;
        return;
      }
      if (acc < 0.5) return;
      ms = (acc / accN) * 1000;
      fps = ms > 0 ? 1000 / ms : 0;
      // Only frame times a quality step could actually fix count toward a
      // degrade. Second-long frames mean the tab is throttled or occluded, and
      // dropping the bloom would not help.
      slowFor = ms > 22 && ms < 200 ? slowFor + acc : 0;
      accAt = t;
      accN = 0;
      if (hasScene && slowFor > 5 && degrade < 4) {
        degrade++;
        slowFor = 0;
        onDegrade?.(degrade);
      }
    },
    setDegrade(n) {
      degrade = Math.max(0, Math.min(4, n | 0));
      onDegrade?.(degrade);
    },
    stop() {
      stopped = true;
      clearInterval(stallTimer);
      detachCanvas?.();
      detachCanvas = null;
    },
  };
}
