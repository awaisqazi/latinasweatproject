<script>
  // Card surface for a content section. Superset of the legacy marketing
  // Panel (title/id/loading) with actions and footer slots.
  export let title = "";
  export let id = "";
  export let loading = false;
  export let padded = true;
  let className = "";
  export { className as class };
</script>

<section
  class="relative rounded-card border border-ink/8 bg-white shadow-card {padded ? 'p-4 md:p-5' : ''} {className}"
  aria-labelledby={title && id ? id : undefined}
  aria-busy={loading || undefined}
>
  {#if loading}
    <span class="absolute inset-x-0 top-0 h-0.5 overflow-hidden rounded-t-card" aria-hidden="true">
      <span class="skeleton block h-full w-full"></span>
    </span>
  {/if}
  {#if title || $$slots.actions}
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3 {padded ? '' : 'px-4 pt-4 md:px-5 md:pt-5'}">
      {#if title}
        <h3 {id} class="text-lg font-bold text-ink">{title}</h3>
      {/if}
      <div class="flex items-center gap-2">
        {#if loading}
          <span class="text-xs font-semibold text-ink/45" role="status">Refreshing</span>
        {/if}
        <slot name="actions" />
      </div>
    </div>
  {/if}
  <slot />
  {#if $$slots.footer}
    <div class="mt-4 border-t border-ink/8 pt-3 {padded ? '' : 'px-4 pb-4 md:px-5 md:pb-5'}">
      <slot name="footer" />
    </div>
  {/if}
</section>
