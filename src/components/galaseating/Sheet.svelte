<!--
  Cream stationery panel: a side drawer on desktop, a bottom sheet on phones.
  Used for the guest sheet, the table sheet and the warnings panel.
-->
<script>
  import { onMount } from "svelte";

  let { title = "", eyebrow = "", onclose = () => {}, wide = false, children, footer } = $props();

  let panelEl = $state(null);

  onMount(() => {
    panelEl?.focus();
  });

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onclose();
    }
  }
</script>

<div class="sh-scrim" role="presentation" onpointerdown={onclose}></div>
<section
  class="sh gs-sheet"
  class:sh--wide={wide}
  bind:this={panelEl}
  tabindex="-1"
  role="dialog"
  aria-modal="false"
  aria-label={title}
  onkeydown={onKeydown}
>
  <header class="sh-head">
    <div class="sh-titles">
      {#if eyebrow}<p class="sh-eyebrow">{eyebrow}</p>{/if}
      <h2 class="sh-title gs-serif">{title}</h2>
    </div>
    <button type="button" class="sh-close" onclick={onclose} aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
      </svg>
    </button>
  </header>

  <div class="sh-body gs-scroll">
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
    background: rgba(4, 8, 14, 0.5);
    z-index: 50;
  }
  .sh {
    position: fixed;
    z-index: 51;
    display: flex;
    flex-direction: column;
    background: var(--gs-cream);
    color: var(--gs-ink);
    box-shadow: -24px 0 70px -40px rgba(0, 0, 0, 0.95);
  }
  @media (min-width: 1024px) {
    .sh {
      top: 0;
      right: 0;
      bottom: 0;
      width: 400px;
      border-left: 3px solid var(--gs-gold);
    }
    .sh--wide {
      width: 460px;
    }
  }
  /* On a phone this rides inside the app shell, which is sized to the VISIBLE
     viewport. `position: fixed` would size it to the layout viewport instead,
     and with Safari's toolbar collapsed or the keyboard up that is a taller
     box, which is exactly how a header ends up above the top of the screen. */
  @media (max-width: 1023px), (pointer: coarse) and (max-height: 599px) {
    .sh-scrim {
      position: absolute;
      bottom: calc(56px + env(safe-area-inset-bottom));
    }
    .sh {
      position: absolute;
      left: 0;
      right: 0;
      bottom: calc(56px + env(safe-area-inset-bottom));
      max-height: calc(100% - 56px - env(safe-area-inset-bottom) - 8px);
      border-top: 3px solid var(--gs-gold);
      border-radius: 6px 6px 0 0;
      padding-bottom: env(safe-area-inset-bottom);
    }
    .sh-close {
      width: 44px;
      height: 44px;
    }
  }
  .sh-head {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 14px 10px;
    border-bottom: 1px solid rgba(23, 32, 44, 0.14);
  }
  .sh-titles {
    min-width: 0;
  }
  .sh-eyebrow {
    margin: 0 0 3px;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #8a6a24;
  }
  .sh-title {
    margin: 0;
    font-size: 21px;
    line-height: 1.2;
    color: var(--gs-ink);
    word-break: break-word;
  }
  .sh-close {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid rgba(23, 32, 44, 0.2);
    border-radius: 3px;
    color: var(--gs-ink);
    cursor: pointer;
  }
  .sh-close:hover {
    background: rgba(23, 32, 44, 0.06);
  }
  .sh-close svg {
    width: 17px;
    height: 17px;
  }
  .sh-body {
    flex: 1 1 auto;
    min-height: 0;
    padding: 12px 14px 20px;
  }
  .sh-foot {
    flex: 0 0 auto;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    padding: 10px 14px;
    border-top: 1px solid rgba(23, 32, 44, 0.14);
    background: #fbf3e6;
  }
</style>
