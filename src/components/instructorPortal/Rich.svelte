<!--
  Rich text blocks: p, h (a small heading inside a section), ul, ol.
  Unknown block types are skipped. `level` is the heading tag for "h" blocks,
  so headings stay in order wherever this is used.
-->
<script>
  import Inline from "./Inline.svelte";
  import { arr } from "./text.js";

  let { blocks = [], words = [], level = 4, class: cls = "" } = $props();

  const list = $derived(arr(blocks).filter((b) => typeof b === "object"));
</script>

{#if list.length}
  <div class="ip-rich {cls}">
    {#each list as b}
      {#if b.t === "p" && typeof b.x === "string"}
        <p><Inline text={b.x} {words} /></p>
      {:else if b.t === "h" && typeof b.x === "string"}
        <svelte:element this={"h" + Math.min(6, Math.max(2, level))}><Inline text={b.x} {words} /></svelte:element>
      {:else if b.t === "ul" && arr(b.items).length}
        <ul>
          {#each arr(b.items) as item}<li><Inline text={item} {words} /></li>{/each}
        </ul>
      {:else if b.t === "ol" && arr(b.items).length}
        <ol>
          {#each arr(b.items) as item}<li><Inline text={item} {words} /></li>{/each}
        </ol>
      {/if}
    {/each}
  </div>
{/if}
