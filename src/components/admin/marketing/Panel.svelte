<script>
  export let title;
  export let id;
  export let loading = false;
</script>

<section
  class="rounded-lg border border-black/10 bg-white p-4 shadow-sm md:p-5"
  aria-labelledby={id}
>
  <div class="mb-4 flex items-center justify-between gap-3">
    <h3 {id} class="text-lg font-bold">{title}</h3>
    {#if loading}
      <span class="text-xs font-semibold text-gray-500">Refreshing</span>
    {/if}
  </div>
  <slot />
</section>
