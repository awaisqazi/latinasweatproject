<!--
  The phone's bottom sheet: cream stationery sliding up over the navy room.

  Every sheet in the planner closes four ways, and all four are always reachable:
  the 44px close button in the corner, a downward swipe on the grab handle, a
  tap on the dimmed map above it, and the Back button. Closing is delegated
  upward so Back and the close button run the same code path.

  Snap points are given as numbers: 0 to 1 means a fraction of the visible
  viewport, anything larger is a pixel height. Heights are measured against
  `100dvh` and the live visual viewport, so an open keyboard shrinks the sheet
  instead of pushing its buttons off the screen.

  In landscape the sheet becomes a right-hand panel: a bottom sheet on a 390px
  tall screen would leave no room for the map it is describing.
-->
<script>
  import { onMount, tick } from "svelte";

  let {
    title = "",
    eyebrow = "",
    snaps = [0.62, 0.94],
    initialSnap = 0,
    onclose = () => {},
    children,
    footer,
    /** Rendered under the title line, inside the sticky header. */
    subhead,
    labelledBy = "",
    /**
     * Tells the shell how much of the floor this sheet is standing on, so the
     * camera can aim at the part of the room that is still visible.
     */
    onmeasure = () => {},
  } = $props();

  let panelEl = $state(null);
  let snap = $state(Math.min(initialSnap, Math.max(0, snaps.length - 1)));
  let dragY = $state(0);
  let dragging = $state(false);
  let viewport = $state({ h: 800, w: 400 });
  let returnFocus = null;

  const landscape = $derived(viewport.w > viewport.h && viewport.h < 560);

  const heightPx = $derived.by(() => {
    const value = snaps[Math.min(snap, snaps.length - 1)] ?? 0.62;
    // Leave the tab bar its 56px (plus the home indicator) at the bottom and a
    // sliver of map at the top, so the sheet never looks like the whole screen.
    const available = Math.max(200, viewport.h - 64 - 8);
    const raw = value <= 1 ? viewport.h * value : value;
    return Math.round(Math.min(available, Math.max(180, raw)));
  });

  $effect(() => {
    const h = heightPx;
    const side = landscape;
    onmeasure(side ? { right: Math.min(460, Math.round(viewport.w * 0.56)), bottom: 0 } : { bottom: h, right: 0 });
  });

  function measure() {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    viewport = {
      h: Math.round(vv?.height || window.innerHeight || 800),
      w: Math.round(vv?.width || window.innerWidth || 400),
    };
  }

  onMount(() => {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    tick().then(() => panelEl?.focus({ preventScroll: true }));
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      // Give the keyboard focus back to whatever opened this sheet.
      if (returnFocus && document.contains(returnFocus)) {
        try {
          returnFocus.focus({ preventScroll: true });
        } catch {
          /* the opener went away with the sheet: nothing to restore */
        }
      }
    };
  });

  // ---- grab handle --------------------------------------------------------
  let grabStart = null;

  function onGrabDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    grabStart = { y: event.clientY, snap };
    dragging = true;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* capture is a nicety: the window listeners below still finish the drag */
    }
  }

  function onGrabMove(event) {
    if (!grabStart) return;
    const dy = event.clientY - grabStart.y;
    // Resist upward drags past the tallest snap so it feels like a limit.
    dragY = dy < 0 && snap >= snaps.length - 1 ? dy / 3 : dy;
  }

  function onGrabUp() {
    if (!grabStart) return;
    const dy = dragY;
    grabStart = null;
    dragging = false;
    dragY = 0;
    if (dy > 90) {
      if (snap > 0) snap -= 1;
      else onclose();
      return;
    }
    if (dy < -60 && snap < snaps.length - 1) snap += 1;
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      onclose();
      return;
    }
    if (event.key !== "Tab") return;
    // Keep the keyboard inside the sheet: it is the only thing on screen.
    const focusables = [
      ...(panelEl?.querySelectorAll(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) || []),
    ].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<!-- Closes on click, not pointerdown: closing on the way down would let the
     matching click land on whatever is underneath the sheet. -->
<div class="ms-scrim" role="presentation" onclick={onclose}></div>

<section
  class="ms gs-sheet"
  class:ms--dragging={dragging}
  class:ms--landscape={landscape}
  bind:this={panelEl}
  tabindex="-1"
  role="dialog"
  aria-modal="true"
  aria-label={labelledBy ? undefined : title}
  aria-labelledby={labelledBy || undefined}
  onkeydown={onKeydown}
  style={`--ms-h:${heightPx}px; --ms-drag:${dragging ? dragY : 0}px;`}
>
  <div
    class="ms-grab"
    role="presentation"
    onpointerdown={onGrabDown}
    onpointermove={onGrabMove}
    onpointerup={onGrabUp}
    onpointercancel={onGrabUp}
  >
    <span class="ms-grabbar" aria-hidden="true"></span>
  </div>

  <header class="ms-head">
    <div class="ms-titles">
      {#if eyebrow}<p class="ms-eyebrow">{eyebrow}</p>{/if}
      <h2 class="ms-title gs-serif">{title}</h2>
      {#if subhead}<div class="ms-sub">{@render subhead()}</div>{/if}
    </div>
    <button type="button" class="ms-close" onclick={onclose} aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
      </svg>
    </button>
  </header>

  <div class="ms-body gs-scroll">
    {@render children?.()}
  </div>

  {#if footer}
    <footer class="ms-foot">{@render footer()}</footer>
  {/if}
</section>

<style>
  /* Positioned inside the shell's viewport box, never against the layout
     viewport: on iOS Safari those are different boxes whenever the toolbar
     collapses or the keyboard is up, and the difference is exactly how a sheet
     ends up with its header above the top of the screen. */
  /*
   * Sheets stop at the top of the tab bar. The bar is how a planner gets back
   * to the map, so nothing is ever allowed to sit on it, dim it, or swallow a
   * tap meant for it. The height is the bar's own: 56px plus the home
   * indicator.
   */
  .ms-scrim {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: calc(56px + env(safe-area-inset-bottom));
    z-index: 70;
    background: rgba(4, 8, 14, 0.58);
  }
  .ms {
    position: absolute;
    z-index: 71;
    left: 0;
    right: 0;
    bottom: calc(56px + env(safe-area-inset-bottom));
    height: var(--ms-h, 60dvh);
    max-height: calc(100% - 56px - env(safe-area-inset-bottom) - 8px);
    display: flex;
    flex-direction: column;
    background: var(--gs-cream);
    color: var(--gs-ink);
    border-top: 3px solid var(--gs-gold);
    box-shadow: 0 -24px 70px -30px rgba(0, 0, 0, 0.95);
    transform: translateY(var(--ms-drag, 0px));
    transition: height 0.24s ease, transform 0.24s ease;
    overscroll-behavior: contain;
  }
  .ms--dragging {
    transition: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .ms {
      transition: none;
    }
  }
  /* Landscape phone: a bottom sheet would bury the map, so dock to the right. */
  .ms--landscape {
    left: auto;
    top: 0;
    bottom: 0 !important;
    width: min(56vw, 460px);
    height: 100%;
    max-height: 100%;
    border-top: 0;
    border-left: 3px solid var(--gs-gold);
    padding-right: env(safe-area-inset-right);
    transform: none;
  }

  .ms-grab {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 22px;
    touch-action: none;
    cursor: grab;
  }
  .ms--landscape .ms-grab {
    display: none;
  }
  .ms-grabbar {
    width: 44px;
    height: 4px;
    border-radius: 2px;
    background: rgba(23, 32, 44, 0.28);
  }

  .ms-head {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 2px 12px 10px;
    border-bottom: 1px solid rgba(23, 32, 44, 0.14);
  }
  .ms--landscape .ms-head {
    padding-top: 12px;
  }
  .ms-titles {
    min-width: 0;
    flex: 1 1 auto;
  }
  .ms-eyebrow {
    margin: 0 0 3px;
    font-size: 10.5px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #8a6a24;
  }
  .ms-title {
    margin: 0;
    font-size: 21px;
    line-height: 1.2;
    color: var(--gs-ink);
    word-break: break-word;
  }
  .ms-sub {
    margin-top: 5px;
    font-size: 13px;
    color: #5f6875;
  }
  .ms-close {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #fffdf9;
    border: 1px solid rgba(23, 32, 44, 0.24);
    border-radius: 3px;
    color: var(--gs-ink);
    cursor: pointer;
  }
  .ms-close svg {
    width: 20px;
    height: 20px;
  }
  .ms-body {
    flex: 1 1 auto;
    min-height: 0;
    padding: 12px 12px 18px;
    -webkit-overflow-scrolling: touch;
  }
  @media (orientation: landscape) and (max-height: 559px) {
    .ms-scrim {
      bottom: 0;
      left: calc(72px + env(safe-area-inset-left));
    }
  }
  .ms-foot {
    flex: 0 0 auto;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding: 10px 12px;
    border-top: 1px solid rgba(23, 32, 44, 0.14);
    background: #fbf3e6;
  }
  .ms--landscape .ms-foot {
    padding-bottom: 10px;
  }
</style>
