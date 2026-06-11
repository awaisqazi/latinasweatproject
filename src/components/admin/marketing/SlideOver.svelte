<script>
  import { tick, onDestroy } from "svelte";
  import { X } from "@lucide/svelte";

  export let open = false;
  export let title = "";
  export let eyebrow = "";
  export let closeLabel = "Close panel";
  export let width = "min(100vw, 32rem)";
  export let showHeader = true;
  export let closeDisabled = false;
  export let onClose = () => {};
  export let onClosed = () => {};

  const titleId = `slide-over-${Math.random().toString(36).slice(2)}`;

  // The close handshake normally rides the panel's transform transition, but
  // transitions can be skipped entirely (backgrounded tab, close before first
  // paint, interrupted animation), so every close also arms a watchdog.
  const CLOSE_FALLBACK_MS = 320;

  let dialog;
  let panel;
  let rendered = false;
  let visible = false;
  let closing = false;
  let notifyOnClose = false;
  let previousActive = null;
  let previousBodyOverflow = "";
  let scrollLocked = false;
  let closeWatchdog = null;
  // Generation token: every open/close intent bumps it so callbacks queued by
  // a superseded cycle (tick, rAF, watchdog) become no-ops.
  let sequence = 0;
  let prevOpen = open;


  // Edge detector first in source order: an open false->true while a close
  // animation is in flight means "reopen", not "stay closed". A level check
  // would also cancel internal closes (ESC/backdrop), where open stays true
  // until the consumer reacts to onClose.
  $: if (open !== prevOpen) {
    prevOpen = open;
    if (open && rendered && closing) {
      cancelClose();
    }
  }

  $: if (open && !rendered) {
    openPanel();
  }

  $: if (!open && rendered && !closing && !closeDisabled) {
    requestClose(false);
  }

  async function openPanel() {
    const token = ++sequence;
    clearTimeout(closeWatchdog);
    const wasRendered = rendered;
    rendered = true;
    visible = false;
    closing = false;
    notifyOnClose = false;
    if (!wasRendered) {
      previousActive = document.activeElement;
    }
    lockBodyScroll();

    await tick();
    if (token !== sequence || !rendered) return;

    if (dialog && !dialog.open) {
      dialog.showModal();
    }

    // Commit the off-screen starting styles with a forced reflow, then flip
    // to visible synchronously. The slide-in transition still runs, but
    // correctness never depends on requestAnimationFrame, which can starve
    // for seconds in throttled or backgrounded tabs and previously left the
    // drawer mounted yet permanently invisible.
    panel?.getBoundingClientRect();
    visible = true;
    panel?.focus({ preventScroll: true });
  }

  // A newer open intent arrived mid-close: reverse the animation in place.
  // If the dialog already closed natively (its close event dispatches async,
  // so flags can lag), run a full reopen instead of just flipping flags.
  function cancelClose() {
    if (!dialog?.open) {
      openPanel();
      return;
    }
    sequence += 1;
    clearTimeout(closeWatchdog);
    closing = false;
    notifyOnClose = false;
    visible = true;
    panel?.focus({ preventScroll: true });
  }

  function requestClose(shouldNotify = true) {
    if (!rendered || closing || closeDisabled) return;

    const token = ++sequence;
    notifyOnClose = shouldNotify;
    closing = true;
    const wasVisible = visible;
    visible = false;

    // Notify at close START, not after the animation: the consumer flips its
    // open flag right away, so a click on another record during the animation
    // becomes a clean false->true edge that cancelClose() turns into a reopen
    // instead of being wiped by a late onClosed.
    if (shouldNotify) {
      onClose();
    }

    // No transition will run if the panel never became visible, motion is
    // reduced, or the tab is hidden: finish synchronously.
    if (!panel || !wasVisible || prefersReducedMotion() || document.hidden) {
      finishClose();
      return;
    }

    closeWatchdog = setTimeout(() => {
      if (token === sequence && closing) {
        finishClose();
      }
    }, CLOSE_FALLBACK_MS);
  }

  function finishClose() {
    clearTimeout(closeWatchdog);
    if (!rendered) return;
    if (dialog?.open) {
      dialog.close();
    }
    // Settle synchronously rather than waiting for the dialog's close event,
    // which is queued as a task and can be withheld for a long time in hidden
    // or throttled tabs. handleNativeClose is idempotent, so the eventual
    // native event is a harmless no-op.
    handleNativeClose();
  }

  function handlePanelTransitionEnd(event) {
    if (!closing || event.target !== panel || event.propertyName !== "transform") {
      return;
    }

    finishClose();
  }

  function handleNativeClose() {
    if (!rendered) return;
    clearTimeout(closeWatchdog);
    // onClose already fired at close start, so the consumer has had every
    // chance to drop `open`. A still-true `open` here can only be a newer
    // open intent: reopen silently and skip onClosed so the consumer's close
    // handler never wipes the new record.
    const reopenSilently = open;
    rendered = false;
    visible = false;
    closing = false;
    unlockBodyScroll();
    notifyOnClose = false;

    if (reopenSilently) {
      openPanel();
      return;
    }

    if (previousActive instanceof HTMLElement) {
      previousActive.focus({ preventScroll: true });
    }

    onClosed();
  }

  function handleBackdropClick(event) {
    if (event.target === dialog) {
      requestClose(true);
    }
  }

  function handleCancel(event) {
    event.preventDefault();
    requestClose(true);
  }

  function lockBodyScroll() {
    if (scrollLocked) return;
    scrollLocked = true;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }

  function unlockBodyScroll() {
    if (!scrollLocked) return;
    scrollLocked = false;
    document.body.style.overflow = previousBodyOverflow;
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }

  onDestroy(() => {
    sequence += 1;
    clearTimeout(closeWatchdog);
    unlockBodyScroll();
  });
</script>

{#if rendered}
  <dialog
    bind:this={dialog}
    class="slide-over-dialog {visible ? 'is-visible' : ''} fixed inset-y-0 right-0 left-auto z-[70] m-0 h-dvh max-h-dvh w-[var(--slide-over-width)] max-w-none rounded-none border-0 bg-transparent p-0 text-[#1E1E1E]"
    style={`--slide-over-width: ${width};`}
    data-state={closing ? "closing" : visible ? "open" : "opening"}
    aria-labelledby={showHeader && title ? titleId : undefined}
    onclick={handleBackdropClick}
    oncancel={handleCancel}
    onclose={handleNativeClose}
  >
    <section
      bind:this={panel}
      class="slide-over-panel flex h-full flex-col bg-white shadow-2xl outline-none"
      tabindex="-1"
      ontransitionend={handlePanelTransitionEnd}
      ontransitioncancel={handlePanelTransitionEnd}
    >
      {#if showHeader}
        <header class="border-b border-black/10 bg-[#1E1E1E] px-5 py-5 text-white">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              {#if eyebrow}
                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#ffbd59]">
                  {eyebrow}
                </p>
              {/if}
              {#if title}
                <h3 id={titleId} class="mt-2 text-xl font-bold leading-tight">
                  {title}
                </h3>
              {/if}
            </div>
            <button
              type="button"
              class="rounded-md p-2 text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#ffbd59] disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={closeLabel}
              onclick={() => requestClose(true)}
              disabled={closeDisabled}
            >
              <X class="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>
      {/if}

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <slot />
      </div>
    </section>
  </dialog>
{/if}

<style>
  .slide-over-dialog::backdrop {
    background-color: rgb(0 0 0 / 0);
    transition: background-color 210ms ease;
  }

  .slide-over-dialog.is-visible::backdrop {
    background-color: rgb(0 0 0 / 0.35);
  }

  .slide-over-panel {
    backface-visibility: hidden;
    contain: layout paint;
    transform: translate3d(100%, 0, 0);
    transition: transform 210ms cubic-bezier(0.2, 0.8, 0.2, 1);
    will-change: transform;
  }

  .slide-over-dialog.is-visible .slide-over-panel {
    transform: translate3d(0, 0, 0);
  }

  @media (prefers-reduced-motion: reduce) {
    .slide-over-dialog::backdrop,
    .slide-over-panel {
      transition-duration: 1ms;
    }
  }
</style>
