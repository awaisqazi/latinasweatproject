<script>
  // Compatibility shim over the ui kit EmptyState; delete once all views
  // import from ../ui/ directly.
  import UiEmptyState from "../ui/EmptyState.svelte";

  export let title;
  export let message;
</script>

<UiEmptyState {title} {message} />
