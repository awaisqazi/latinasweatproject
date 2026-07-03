<script>
  import { tick } from "svelte";
  import Button from "./Button.svelte";

  // Small centered confirm dialog (native <dialog>), replacing
  // window.confirm. Intentionally simpler than SlideOver: no animation
  // choreography to get wrong.
  export let open = false;
  export let title;
  export let message = "";
  export let confirmLabel = "Confirm";
  export let cancelLabel = "Cancel";
  export let tone = "danger"; // danger | primary
  export let busy = false;
  export let onConfirm = () => {};
  export let onCancel = () => {};

  let dialog;

  $: if (dialog?.isConnected) {
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open && !busy) {
      dialog.close();
    }
  }

  function syncOnMountOpen(node) {
    dialog = node;
    tick().then(() => {
      if (open && node.isConnected && !node.open) node.showModal();
    });

    return {
      destroy() {
        if (dialog === node) dialog = null;
      },
    };
  }

  function handleCancelEvent(event) {
    event.preventDefault();
    if (!busy) onCancel();
  }

  function handleBackdropClick(event) {
    if (event.target === dialog && !busy) onCancel();
  }
</script>

{#if open}
  <dialog
    use:syncOnMountOpen
    class="m-auto w-[min(92vw,26rem)] rounded-card border border-ink/10 bg-white p-0 text-ink shadow-pop backdrop:bg-ink/35"
    oncancel={handleCancelEvent}
    onclick={handleBackdropClick}
  >
    <div class="p-5">
      <h3 class="text-lg font-bold leading-tight">{title}</h3>
      <div class="mt-2 text-sm leading-6 text-ink/65">
        {#if message}{message}{:else}<slot />{/if}
      </div>
    </div>
    <div class="flex justify-end gap-2 border-t border-ink/8 px-5 py-3.5">
      <Button variant="ghost" disabled={busy} onclick={onCancel}>{cancelLabel}</Button>
      <Button
        variant={tone === "danger" ? "danger" : "primary"}
        loading={busy}
        onclick={onConfirm}
      >
        {confirmLabel}
      </Button>
    </div>
  </dialog>
{/if}
