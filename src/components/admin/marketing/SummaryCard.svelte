<script>
  // Compatibility shim over the ui kit StatCard; delete once all views
  // import from ../ui/ directly.
  import StatCard from "../ui/StatCard.svelte";

  export let label;
  export let value = 0;
  export let icon;
  export let tone = "gold";
</script>

<StatCard {label} {value} {icon} {tone} />
