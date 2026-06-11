<script>
  import { Inbox } from "@lucide/svelte";

  export let title;
  export let message = "";
  export let icon = Inbox;
</script>

<div class="rounded-card border border-dashed border-ink/15 bg-canvas/60 px-4 py-10 text-center">
  <span class="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-card">
    <svelte:component this={icon} class="h-5 w-5 text-ink/40" aria-hidden="true" />
  </span>
  <h4 class="mt-3 font-bold text-ink">{title}</h4>
  {#if message}
    <p class="mx-auto mt-1 max-w-md text-sm leading-6 text-ink/55">{message}</p>
  {/if}
  {#if $$slots.actions}
    <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
      <slot name="actions" />
    </div>
  {/if}
</div>
