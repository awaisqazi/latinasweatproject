<script>
  import { onDestroy } from "svelte";
  import { Search, X } from "@lucide/svelte";

  export let value = "";
  export let placeholder = "Search";
  export let label = "Search";
  export let debounce = 250;
  export let onSearch = null; // fires debounced with the trimmed query ("" when below minChars)
  export let minChars = 0;
  export let loading = false;
  let className = "";
  export { className as class };

  let timer = null;

  function handleInput(event) {
    value = event.currentTarget.value;
    if (!onSearch) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const query = value.trim();
      onSearch(query.length >= minChars ? query : "");
    }, debounce);
  }

  function clear() {
    value = "";
    if (timer) clearTimeout(timer);
    if (onSearch) onSearch("");
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

<div class="relative {className}">
  <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" aria-hidden="true" />
  <input
    type="search"
    class="input pl-9 {value ? 'pr-9' : ''} [&::-webkit-search-cancel-button]:hidden"
    {placeholder}
    aria-label={label}
    {value}
    oninput={handleInput}
  />
  {#if loading}
    <span class="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true"></span>
  {:else if value}
    <button
      type="button"
      class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink/40 transition hover:text-ink"
      aria-label="Clear search"
      onclick={clear}
    >
      <X class="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  {/if}
</div>
