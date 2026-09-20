<!-- One question, two answers. Used where an action is legal but surprising. -->
<script>
  import { getContext } from "svelte";

  const { ui } = getContext("gala-seating");
  const ask = $derived(ui.confirmAsk);
</script>

{#if ask}
  <div class="cf-scrim" role="presentation" onpointerdown={() => ui.closeAsk()}></div>
  <div class="cf gs-sheet" role="alertdialog" aria-modal="true" aria-label={ask.message}>
    <p class="cf-msg">{ask.message}</p>
    <div class="cf-actions">
      <button type="button" class="gs-btn gs-btn--gold" onclick={() => ask.onConfirm?.()}>
        {ask.confirmLabel || "Yes"}
      </button>
      <button type="button" class="gs-btn" onclick={() => ui.closeAsk()}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .cf-scrim {
    position: fixed;
    inset: 0;
    background: rgba(4, 8, 14, 0.6);
    z-index: 84;
  }
  .cf {
    position: fixed;
    z-index: 85;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(420px, calc(100vw - 24px));
    background: var(--gs-cream);
    color: var(--gs-ink);
    border-top: 3px solid var(--gs-gold);
    padding: 20px;
    box-shadow: 0 40px 90px -40px rgba(0, 0, 0, 0.95);
  }
  .cf-msg {
    margin: 0 0 16px;
    font-size: 13.5px;
    line-height: 1.55;
  }
  .cf-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  /* Inside the phone shell, which is the visible viewport. See Sheet.svelte. */
  @media (max-width: 1023px), (pointer: coarse) and (max-height: 599px) {
    .cf-scrim,
    .cf {
      position: absolute;
    }
    .cf {
      width: calc(100% - 24px);
    }
    .cf-msg {
      font-size: 15px;
    }
  }
</style>
