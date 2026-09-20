<!--
  A full-screen phone layer: the guest picker, the table picker, the expanded
  guest record. Anything that deserves the whole screen rather than half of it.

  It covers the tab bar on purpose. A picker is a question, and the answer to
  "how do I get out of this" has to be one obvious control, not four competing
  ones: a 44px Cancel in the header, plus Back. Everything above the body
  scroller is pinned, so a search field stays put when the keyboard opens.
-->
<script>
  import { onMount, tick } from "svelte";

  let { title = "", eyebrow = "", onclose = () => {}, children, sticky, footer } = $props();

  let panelEl = $state(null);
  let returnFocus = null;

  onMount(() => {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    tick().then(() => panelEl?.focus({ preventScroll: true }));
    return () => {
      if (returnFocus && document.contains(returnFocus)) {
        try {
          returnFocus.focus({ preventScroll: true });
        } catch {
          /* the opener went away with the layer: nothing to restore */
        }
      }
    };
  });

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      onclose();
    }
  }
</script>

<section
  class="mf gs-sheet"
  bind:this={panelEl}
  tabindex="-1"
  role="dialog"
  aria-modal="true"
  aria-label={title}
  onkeydown={onKeydown}
>
  <header class="mf-head">
    <div class="mf-titles">
      {#if eyebrow}<p class="mf-eyebrow">{eyebrow}</p>{/if}
      <h2 class="mf-title gs-serif">{title}</h2>
    </div>
    <button type="button" class="mf-cancel" onclick={onclose}>Cancel</button>
  </header>

  {#if sticky}
    <div class="mf-sticky">{@render sticky()}</div>
  {/if}

  <div class="mf-body gs-scroll">
    {@render children?.()}
  </div>

  {#if footer}
    <footer class="mf-foot">{@render footer()}</footer>
  {/if}
</section>

<style>
  /* Inside the shell's viewport box: a flex column with a header that does not
     scroll and exactly one body that does. The header cannot leave the screen
     because nothing above it can move. */
  .mf {
    position: absolute;
    inset: 0;
    z-index: 78;
    display: flex;
    flex-direction: column;
    background: var(--gs-cream);
    color: var(--gs-ink);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
    overscroll-behavior: none;
  }
  .mf-head {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 12px 10px;
    border-bottom: 1px solid rgba(23, 32, 44, 0.16);
    background: #fbf3e6;
  }
  .mf-titles {
    min-width: 0;
  }
  .mf-eyebrow {
    margin: 0 0 3px;
    font-size: 10.5px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #8a6a24;
  }
  .mf-title {
    margin: 0;
    font-size: 20px;
    line-height: 1.2;
    color: var(--gs-ink);
    word-break: break-word;
  }
  .mf-cancel {
    flex: 0 0 auto;
    min-height: 44px;
    min-width: 72px;
    padding: 0 14px;
    border: 1px solid rgba(23, 32, 44, 0.28);
    border-radius: 3px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }
  .mf-sticky {
    flex: 0 0 auto;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(23, 32, 44, 0.12);
    background: var(--gs-cream);
  }
  .mf-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 8px 12px calc(20px + env(safe-area-inset-bottom));
    -webkit-overflow-scrolling: touch;
  }
  .mf-foot {
    flex: 0 0 auto;
    display: flex;
    gap: 8px;
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
    border-top: 1px solid rgba(23, 32, 44, 0.14);
    background: #fbf3e6;
  }
</style>
