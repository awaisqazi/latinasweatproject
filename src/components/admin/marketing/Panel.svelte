<script>
  // Compatibility shim over the ui kit Panel; delete once all views import
  // from ../ui/ directly.
  import UiPanel from "../ui/Panel.svelte";

  export let title;
  export let id;
  export let loading = false;
</script>

<UiPanel {title} {id} {loading}>
  <slot />
</UiPanel>
