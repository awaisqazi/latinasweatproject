// Gala Seating on a phone: which tab is showing, what is stacked on top of it,
// and what the hardware Back button should do about it.
//
// The rule the whole phone UI is built on: every temporary surface is one entry
// on a stack, and one entry on the stack is one entry in session history. So
// Back always closes exactly one thing, and the planner is never further than a
// tap from the plain map.
//
// Session history is driven, not merely observed:
//   - opening a surface  -> pushEntry + history.pushState
//   - closing a surface  -> history.go(-n), and popstate does the state change
// Nothing mutates the stack behind history's back, so no orphan entries are
// left behind and no press of Back ever walks off the page.
//
// Runes only. Created once by GalaSeatingApp for the mobile shell.

/** Tabs, in bar order. */
export const TABS = ["map", "guests", "tables", "alerts"];

/**
 * @typedef {{k:"tab", tab:string}} TabEntry
 * @typedef {{k:"layer", layer:any}} LayerEntry
 * @typedef {{k:"move", guestId:string}} MoveEntry
 */

export function createMobileNav() {
  /** @type {Array<TabEntry|LayerEntry|MoveEntry>} */
  let entries = $state([]);

  let tab = $state("map");
  let layers = $state(/** @type {any[]} */ ([]));
  let moving = $state(/** @type {{guestId:string}|null} */ (null));

  const hasHistory = typeof window !== "undefined" && typeof window.history?.pushState === "function";
  /** Queued work that must run once the browser has finished going back. */
  let afterPop = /** @type {null | (() => void)} */ (null);
  let afterPopTimer = 0;

  /** Recompute the visible state from the entry stack. One source of truth. */
  function apply() {
    let nextTab = "map";
    const nextLayers = [];
    let nextMoving = null;
    for (const e of entries) {
      if (e.k === "tab") nextTab = e.tab;
      else if (e.k === "layer") nextLayers.push(e.layer);
      else if (e.k === "move") nextMoving = { guestId: e.guestId };
    }
    tab = nextTab;
    layers = nextLayers;
    moving = nextMoving;
  }

  function markState() {
    if (!hasHistory) return;
    try {
      history.replaceState({ ...(history.state || {}), gsDepth: entries.length }, "");
    } catch {
      /* history is unavailable (sandboxed iframe): the stack still works, Back just leaves */
    }
  }

  /**
   * Do this once the browser has finished any unwinding already asked for.
   * Pushing a new surface while a `history.go(-n)` is still in flight would
   * have it swept away by the popstate that follows, which is how "I tapped
   * the button and nothing happened" bugs are born.
   */
  function whenSettled(fn) {
    if (afterPop) {
      const prev = afterPop;
      afterPop = () => {
        prev?.();
        fn();
      };
      return;
    }
    fn();
  }

  function pushEntry(entry) {
    entries = [...entries, entry];
    if (hasHistory) {
      try {
        history.pushState({ gsDepth: entries.length }, "");
      } catch {
        /* see markState */
      }
    }
    apply();
  }

  /** Swap the top entry without adding a history step: reopening is not going deeper. */
  function replaceTopEntry(entry) {
    if (!entries.length) {
      pushEntry(entry);
      return;
    }
    entries = [...entries.slice(0, -1), entry];
    markState();
    apply();
  }

  function runAfterPop() {
    const fn = afterPop;
    afterPop = null;
    if (afterPopTimer) {
      clearTimeout(afterPopTimer);
      afterPopTimer = 0;
    }
    fn?.();
  }

  /**
   * Unwind the stack to `depth` and then run `then`. The unwinding is done by
   * the browser so history and the stack can never disagree.
   */
  function unwindTo(depth, then = null) {
    if (afterPop) {
      // Queue behind the unwind already running, and recompute the target then:
      // by that point the stack is a different shape.
      whenSettled(() => unwindTo(depth, then));
      return;
    }
    const target = Math.max(0, Math.min(depth, entries.length));
    const back = entries.length - target;
    if (back <= 0) {
      then?.();
      return;
    }
    if (!hasHistory) {
      entries = entries.slice(0, target);
      apply();
      then?.();
      return;
    }
    // A no-op still marks the unwind as in flight, which is what `whenSettled`
    // reads. Without it a close with no follow-up would look settled and the
    // next open would be pushed under a popstate that is still on its way.
    afterPop = then || (() => {});
    // If the browser never delivers the popstate (a blocked history in some
    // embedded webviews), close anyway rather than stranding the planner.
    if (afterPopTimer) clearTimeout(afterPopTimer);
    afterPopTimer = window.setTimeout(() => {
      afterPopTimer = 0;
      if (entries.length > target) {
        entries = entries.slice(0, target);
        markState();
        apply();
      }
      runAfterPop();
    }, 400);
    history.go(-back);
  }

  function onPopState(event) {
    const target = Number(event.state?.gsDepth ?? 0);
    if (target < entries.length) {
      entries = entries.slice(0, target);
      apply();
    } else if (target > entries.length) {
      // Someone pressed Forward into a surface we no longer hold. Re-anchor
      // rather than guess: the visible state stays the one we can honour.
      markState();
    }
    runAfterPop();
  }

  function start() {
    if (typeof window === "undefined") return () => {};
    markState();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }

  // ---- tabs ---------------------------------------------------------------

  /** Tapping a tab drops everything stacked on top of it. Map is the floor. */
  function selectTab(next) {
    if (!TABS.includes(next)) return;
    if (next === tab && !layers.length && !moving) return;
    unwindTo(0, () => {
      if (next !== "map") pushEntry({ k: "tab", tab: next });
    });
  }

  // ---- layers -------------------------------------------------------------

  const topLayer = () => (layers.length ? layers[layers.length - 1] : null);

  /**
   * Open a surface.
   * @param {any} layer  e.g. { type: "guest", guestId } or { type: "menu" }
   * @param {{replaceSameType?: boolean}} [opts] swap in place when the same kind
   *   of surface is already on top, so tapping through party members or warnings
   *   never stacks a dozen identical sheets on the history.
   */
  function openLayer(layer, opts = {}) {
    whenSettled(() => {
      const top = topLayer();
      if (top && opts.replaceSameType !== false && top.type === layer.type) {
        if (sameLayer(top, layer)) return;
        replaceTopEntry({ k: "layer", layer });
        return;
      }
      pushEntry({ k: "layer", layer });
    });
  }

  function sameLayer(a, b) {
    if (a.type !== b.type) return false;
    return (
      a.guestId === b.guestId &&
      a.tableId === b.tableId &&
      a.seat === b.seat &&
      a.mode === b.mode
    );
  }

  /** Close the top surface. The visible close button, the scrim and Back agree. */
  function closeTop() {
    if (!entries.length) return;
    const last = entries[entries.length - 1];
    if (last.k === "tab") return; // a tab is not a surface; the tab bar switches it
    unwindTo(entries.length - 1);
  }

  /** Close every surface but stay on the tab the planner was on. */
  function closeAllLayers() {
    let depth = entries.length;
    while (depth > 0 && entries[depth - 1].k !== "tab") depth -= 1;
    unwindTo(depth);
  }

  /** Straight back to the plain map, whatever is open. One tap, always. */
  function goHome() {
    unwindTo(0);
  }

  // ---- move mode ----------------------------------------------------------

  /** "Pick on the map": the map takes over, with a banner and a big Cancel. */
  function startMove(guestId) {
    // Drop the sheets first so the map is actually visible underneath.
    unwindTo(0, () => pushEntry({ k: "move", guestId }));
  }

  function cancelMove() {
    if (!moving) return;
    const idx = entries.findIndex((e) => e.k === "move");
    if (idx < 0) return;
    unwindTo(idx);
  }

  return {
    get tab() {
      return tab;
    },
    get layers() {
      return layers;
    },
    get topLayer() {
      return topLayer();
    },
    get moving() {
      return moving;
    },
    get depth() {
      return entries.length;
    },
    TABS,
    start,
    selectTab,
    openLayer,
    closeTop,
    closeAllLayers,
    goHome,
    startMove,
    cancelMove,
  };
}
