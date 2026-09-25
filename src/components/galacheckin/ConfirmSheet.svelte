<!--
  One question, two answers. Used where an action is legal but surprising:
  undoing a check-in, retiring a paddle, releasing one back to the box.

  A release also asks for a physical fact ("I am holding paddle 42 in my hand"),
  because the database cannot see the desk.
-->
<script>
  import { getContext } from "svelte";

  const { ui } = getContext("gala-checkin");
  const ask = $derived(ui.ask);

  let ticked = $state(false);
  $effect(() => {
    // Re-arm for every new question.
    void ask;
    ticked = false;
  });

  const blocked = $derived(Boolean(ask?.checkLabel) && !ticked);
</script>

{#if ask}
  <div class="cs-scrim" role="presentation" onpointerdown={() => ui.closeAsk()}></div>
  <div class="cs" class:cs--danger={ask.tone === "danger"} role="alertdialog" aria-modal="true" aria-label={ask.message}>
    <p class="cs-msg">{ask.message}</p>

    {#if ask.checkLabel}
      <label class="cs-check">
        <input type="checkbox" bind:checked={ticked} />
        <span>{ask.checkLabel}</span>
      </label>
    {/if}

    <div class="cs-acts">
      <button
        type="button"
        class="gbtn"
        class:gbtn--gold={ask.tone !== "danger"}
        class:gbtn--alert={ask.tone === "danger"}
        disabled={blocked}
        onclick={() => { const go = ask.onConfirm; ui.closeAsk(); go?.(); }}
      >
        {ask.confirmLabel || "Yes"}
      </button>
      <button type="button" class="gbtn gbtn--quiet" onclick={() => ui.closeAsk()}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .cs-scrim {
    position: fixed;
    inset: 0;
    background: rgb(4 8 14 / 0.75);
    z-index: 94;
  }
  .cs {
    position: fixed;
    z-index: 95;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(440px, calc(100vw - 20px));
    padding: 20px;
    background: var(--g26-navy);
    color: var(--g26-text);
    border: 1px solid var(--g26-line-strong);
    border-top: 4px solid var(--g26-gold);
    border-radius: var(--g26-r-card);
    box-shadow: 0 40px 90px -40px rgb(0 0 0 / 0.95);
  }
  .cs--danger {
    border-top-color: var(--g26-alert);
  }
  .cs-msg {
    margin: 0 0 14px;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.45;
    color: var(--g26-cream);
  }
  .cs-check {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    margin-bottom: 10px;
    padding: 0 10px;
    font-size: 15px;
    font-weight: 700;
    border: 1px solid var(--g26-line-strong);
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }
  .cs-check input {
    flex: none;
    width: 24px;
    height: 24px;
    accent-color: var(--g26-gold);
  }
  .cs-acts {
    display: grid;
    gap: 8px;
  }
</style>
