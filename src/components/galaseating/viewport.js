// The visible viewport, measured.
//
// iOS Safari has two viewports and they disagree whenever the toolbar collapses
// or the keyboard comes up. Everything in the planner that must stay on screen,
// the gate card, the top bar, the tab bar, is sized against the one the planner
// can actually see, published as CSS variables:
//
//   --m-vh   the visible height in pixels
//   --m-top  how far the visible viewport has been pushed down
//
// Shared by the gate and by the app shell so both behave identically: the owner
// met the app through the gate, and a gate that jumps is a broken app.

/** iPhone, iPad, and iPadOS reporting itself as a Mac with a touch screen. */
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** True where a finger is the pointer, so no keyboard should open unasked. */
export function isCoarsePointer() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window;
}

/**
 * Keep `--m-vh` and `--m-top` on `el` in step with the visible viewport.
 *
 * @param {HTMLElement} el
 * @param {(info: {height:number, offsetTop:number, keyboard:boolean}) => void} [onChange]
 * @returns {() => void} unbind
 */
/** Is this the kind of element that brings a keyboard up with it? */
function isTypingTarget(node) {
  if (!node || node.nodeType !== 1) return false;
  const tag = node.tagName;
  if (tag === "TEXTAREA") return true;
  if (node.isContentEditable) return true;
  if (tag !== "INPUT") return false;
  const type = (node.getAttribute("type") || "text").toLowerCase();
  return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "hidden"].includes(type);
}

export function bindVisualViewport(el, onChange) {
  if (typeof window === "undefined" || !el) return () => {};
  const vv = window.visualViewport;
  const coarse = isCoarsePointer();
  /** The tallest visible viewport seen with nothing focused: the "no keyboard" height. */
  let restingHeight = Math.round(vv?.height || window.innerHeight || 0);

  const sync = () => {
    const height = Math.round(vv?.height || window.innerHeight || 0);
    const offsetTop = Math.round(vv?.offsetTop || 0);
    el.style.setProperty("--m-vh", `${height}px`);
    el.style.setProperty("--m-top", `${offsetTop}px`);

    // Whether the keyboard is up is decided by what is focused, not by
    // measuring: iOS shrinks the layout viewport too in some configurations,
    // so a height comparison alone reports "no keyboard" with a keyboard
    // covering half the screen. The height check stays as a second opinion for
    // hardware-keyboard and split-view cases.
    const typing = coarse && isTypingTarget(document.activeElement);
    if (!typing) restingHeight = Math.max(restingHeight, height);
    const shrunk = restingHeight - height > 140;
    const keyboard = typing || shrunk;

    el.dataset.keyboard = keyboard ? "on" : "off";
    onChange?.({ height, offsetTop, keyboard });
  };

  /** Keep the field being typed in inside its own scroller, never by scrolling the page. */
  const onFocusIn = (event) => {
    sync();
    if (!coarse || !isTypingTarget(event.target)) return;
    setTimeout(() => {
      try {
        event.target.scrollIntoView({ block: "nearest", behavior: "auto" });
      } catch {
        /* detached before the keyboard finished animating: nothing to reveal */
      }
    }, 260);
  };

  // Focus out runs before focus in, so settle on the next tick: moving from one
  // field to the next must not flicker the whole layout back and forth.
  const onFocusOut = () => setTimeout(sync, 0);

  sync();
  window.addEventListener("resize", sync);
  window.addEventListener("orientationchange", sync);
  window.addEventListener("focusin", onFocusIn);
  window.addEventListener("focusout", onFocusOut);
  vv?.addEventListener("resize", sync);
  vv?.addEventListener("scroll", sync);

  return () => {
    window.removeEventListener("resize", sync);
    window.removeEventListener("orientationchange", sync);
    window.removeEventListener("focusin", onFocusIn);
    window.removeEventListener("focusout", onFocusOut);
    vv?.removeEventListener("resize", sync);
    vv?.removeEventListener("scroll", sync);
  };
}

/**
 * Snap a pinched or focus-zoomed page back to scale 1.
 *
 * Belt and braces for the moment the gate hands over to the app: if the page is
 * still magnified, the app would mount into a viewport wider than the screen
 * and every fixed element would sit off to one side. Rewriting the viewport
 * meta with `maximum-scale=1` is the only lever a page has. On iOS that is left
 * in place, where it stops focus auto-zoom and, because iOS ignores it for a
 * planner's own pinch, costs no accessibility. Everywhere else it is restored
 * a moment later, because there it WOULD block pinch zoom.
 */
export function resetPageZoom() {
  if (typeof window === "undefined") return;
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  const scale = window.visualViewport?.scale;
  if (scale != null && Math.abs(scale - 1) < 0.01) return;

  const before = meta.getAttribute("content") || "width=device-width, initial-scale=1";
  meta.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover");
  if (!isIOS()) {
    setTimeout(() => meta.setAttribute("content", before), 400);
  }
}

/** Dismiss the keyboard and undo any page scroll or zoom, in that order. */
export function settleViewport() {
  if (typeof window === "undefined") return;
  try {
    const el = document.activeElement;
    if (el && typeof el.blur === "function") el.blur();
  } catch {
    /* nothing focused, or a cross-origin frame: nothing to dismiss */
  }
  try {
    window.scrollTo(0, 0);
  } catch {
    /* scrolling is already locked, which is the state we wanted anyway */
  }
  resetPageZoom();
}
