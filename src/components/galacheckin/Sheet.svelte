<!--
  The bottom sheet every dialog in the check-in desk stands on.

  Phone first: a navy panel with a gold top rule sliding up over the lobby
  (dark on purpose: a bright sheet in a dim museum lobby blinds the volunteer
  and lights up the guest), 14px top corners, a grab handle, and the primary
  action pinned to the bottom inside the thumb zone. Closing works three ways, because a volunteer is holding a paddle in the
  other hand: the 48px close button, a tap on the scrim, and Escape.
-->
<script>
  import { onMount } from "svelte";
  import { X } from "@lucide/svelte";

  let {
    title = "",
    eyebrow = "",
    onclose = () => {},
    children,
    footer,
    tall = false,
    /** CSS selector inside the sheet to focus on open (a form's first field). */
    initialFocus = "",
  } = $props();

  let panelEl = $state(null);
  let returnFocus = null;

  onMount(() => {
    returnFocus = document.activeElement;
    // Focus the panel itself, not the first control, unless the sheet is a
    // form whose whole job is that field (walk-in: the name).
    const first = initialFocus ? panelEl?.querySelector(initialFocus) : null;
    (first || panelEl)?.focus({ preventScroll: true });
    return () => {
      try { returnFocus?.focus?.({ preventScroll: true }); } catch { /* it went away */ }
    };
  });

  function onkeydown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={onkeydown} />

<div class="sh-scrim" role="presentation" onpointerdown={onclose}></div>
<section
  class="sh"
  class:sh--tall={tall}
  bind:this={panelEl}
  tabindex="-1"
  role="dialog"
  aria-modal="true"
  aria-label={title}
>
  <div class="sh-grab" aria-hidden="true"></div>
  <header class="sh-head">
    <div class="sh-titles">
      {#if eyebrow}<p class="sh-eyebrow">{eyebrow}</p>{/if}
      <h2 class="sh-title">{title}</h2>
    </div>
    <button type="button" class="sh-close" onclick={onclose} aria-label="Close">
      <X size={22} strokeWidth={2} />
    </button>
  </header>

  <div class="sh-body">
    {@render children?.()}
  </div>

  {#if footer}
    <footer class="sh-foot">{@render footer()}</footer>
  {/if}
</section>

<style>
  .sh-scrim {
    position: fixed;
    inset: 0;
    background: rgb(4 8 14 / 0.72);
    z-index: 80;
  }

  .sh {
    position: fixed;
    z-index: 81;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    max-height: min(90dvh, 820px);
    background: var(--g26-navy);
    color: var(--g26-text);
    border-radius: var(--g26-r-sheet) var(--g26-r-sheet) 0 0;
    border-top: 3px solid var(--g26-gold);
    box-shadow: 0 -30px 80px -40px rgb(0 0 0 / 0.95);
    padding-bottom: env(safe-area-inset-bottom, 0);
  }
  .sh--tall {
    min-height: min(72dvh, 640px);
  }
  .sh:focus-visible {
    outline: none;
  }

  .sh-grab {
    width: 40px;
    height: 4px;
    margin: 8px auto 0;
    border-radius: 999px;
    background: rgb(255 248 239 / 0.25);
  }

  .sh-head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px 10px 16px;
    border-bottom: 1px solid var(--g26-line);
  }
  .sh-titles {
    flex: 1;
    min-width: 0;
  }
  .sh-eyebrow {
    margin: 0;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--g26-gold-soft);
  }
  .sh-title {
    margin: 2px 0 0;
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
    font-size: 26px;
    line-height: 1.15;
    color: var(--g26-cream);
    overflow-wrap: anywhere;
  }
  .sh-close {
    flex: none;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    color: var(--g26-cream);
    background: transparent;
    border: 1px solid var(--g26-line-strong);
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }
  .sh-close:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }

  .sh-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 14px 16px 18px;
  }

  .sh-foot {
    display: grid;
    gap: 8px;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
    background: var(--g26-night);
    border-top: 1px solid var(--g26-line-strong);
  }

  /* Wide screens (the laptop at the desk) keep the same components, centred. */
  @media (min-width: 900px) {
    .sh {
      left: 50%;
      bottom: 24px;
      width: min(600px, calc(100vw - 48px));
      transform: translateX(-50%);
      border-radius: var(--g26-r-card);
    }
  }
</style>
