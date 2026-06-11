<script>
  import Skeleton from "./Skeleton.svelte";

  export let lines = 3;
  let className = "";
  export { className as class };
</script>

<div
  class="rounded-card border border-ink/8 bg-white p-4 shadow-card {className}"
  aria-hidden="true"
>
  <Skeleton variant="text" class="w-2/5" />
  {#each Array(Math.max(0, lines - 1)) as _, i (i)}
    <Skeleton variant="text" class="mt-3 {i % 2 ? 'w-3/5' : 'w-4/5'}" />
  {/each}
</div>
