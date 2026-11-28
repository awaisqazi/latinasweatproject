<!-- An email address that may wrap before the @ on a narrow screen, never mid-word. -->
<script>
  let { address = "" } = $props();
  const at = $derived(address.indexOf("@"));
</script>

{#if at > 0}{address.slice(0, at)}<wbr />{address.slice(at)}{:else}{address}{/if}
