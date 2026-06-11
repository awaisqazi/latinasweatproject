<script>
  export let title;
  export let id = "";
  export let eyebrow = "";
  export let description = "";
</script>

<div class="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
  <div class="min-w-0">
    {#if eyebrow}
      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
    {/if}
    <h3 id={id || undefined} class="mt-0.5 text-lg font-bold leading-tight text-ink">{title}</h3>
    {#if description}
      <p class="mt-1 max-w-xl text-sm leading-6 text-ink/60">{description}</p>
    {/if}
  </div>
  {#if $$slots.actions}
    <div class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  {/if}
</div>
