<script>
  import { tick } from "svelte";
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

  let dialog;
  let panel;
  let rendered = false;
  let visible = false;
  let closing = false;
  let notifyOnClose = false;
  let previousActive = null;
  let previousBodyOverflow = "";

  $: if (open && !rendered) {
    openPanel();
  }

  $: if (!open && rendered && !closing && !closeDisabled) {
    requestClose(false);
  }

  async function openPanel() {
    rendered = true;
    visible = false;
    closing = false;
    notifyOnClose = false;
    previousActive = document.activeElement;
    lockBodyScroll();

    await tick();

    if (dialog && !dialog.open) {
      dialog.showModal();
    }

    window.requestAnimationFrame(() => {
      visible = true;
      panel?.focus({ preventScroll: true });
    });
  }

  function requestClose(shouldNotify = true) {
    if (!rendered || closing || closeDisabled) return;

    notifyOnClose = shouldNotify;
    closing = true;
    visible = false;

    if (!panel || prefersReducedMotion()) {
      finishClose();
    }
  }

  function finishClose() {
    if (!rendered) return;
    dialog?.close();
  }

  function handlePanelTransitionEnd(event) {
    if (!closing || event.target !== panel || event.propertyName !== "transform") {
      return;
    }

    finishClose();
  }

  function handleNativeClose() {
    rendered = false;
    visible = false;
    closing = false;
    unlockBodyScroll();

    if (previousActive instanceof HTMLElement) {
      previousActive.focus({ preventScroll: true });
    }

    const shouldNotify = notifyOnClose;
    notifyOnClose = false;

    onClosed();

    if (shouldNotify) {
      onClose();
    }
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
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }

  function unlockBodyScroll() {
    document.body.style.overflow = previousBodyOverflow;
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }
</script>

{#if rendered}
  <dialog
    bind:this={dialog}
    class="slide-over-dialog {visible ? 'is-visible' : ''} fixed inset-y-0 right-0 left-auto z-[70] m-0 h-dvh max-h-dvh w-[var(--slide-over-width)] max-w-none rounded-none border-0 bg-transparent p-0 text-[#1E1E1E]"
    style={`--slide-over-width: ${width};`}
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
