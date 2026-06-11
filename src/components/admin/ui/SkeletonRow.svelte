<script>
  import Skeleton from "./Skeleton.svelte";

  export let columns = 4;
</script>

<div class="flex items-center gap-4 border-b border-ink/8 px-4 py-3.5" aria-hidden="true">
  {#each Array(columns) as _, i (i)}
    <Skeleton variant="text" class={i === 0 ? "w-1/4 min-w-24" : "w-1/6 min-w-14"} />
  {/each}
</div>
