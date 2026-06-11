<script>
  // Label/hint/error wrapper. The control itself stays in the view (with the
  // portal .input/.select/.textarea classes) so bind:value keeps working.
  export let label;
  export let id = "";
  export let hint = "";
  export let error = "";
  export let required = false;
  let className = "";
  export { className as class };
</script>

<div class={className}>
  <label class="block text-sm font-semibold text-ink" for={id || undefined}>
    {label}{#if required}<span class="ml-0.5 text-red-600" aria-hidden="true">*</span>{/if}
  </label>
  <div class="mt-1.5">
    <slot />
  </div>
  {#if error}
    <p class="mt-1.5 text-xs font-medium text-red-700" role="alert">{error}</p>
  {:else if hint}
    <p class="mt-1.5 text-xs text-ink/50">{hint}</p>
  {/if}
</div>
