<!--
  One string of portal text: plain words, **emphasis** and [label](url) links,
  parsed by parseInline (which drops any URL safeHref refuses). Never {@html}.
  `words`: search words to mark in yellow (already folded, lowercase).
-->
<script>
  import { parseInline } from "../../lib/instructorPortal/richText.js";
  import { splitMarks } from "./text.js";

  let { text = "", words = [] } = $props();

  const parts = $derived(parseInline(text));
</script>

{#snippet marked(value)}
  {#each splitMarks(value, words) as seg}{#if seg.hit}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}
{/snippet}

{#each parts as part}{#if part.type === "strong"}<strong>{@render marked(part.value)}</strong>{:else if part.type === "link"}{#if part.external}<a class="ip-inl" href={part.href} target="_blank" rel="noopener">{@render marked(part.label)}</a>{:else}<a class="ip-inl" href={part.href}>{@render marked(part.label)}</a>{/if}{:else}{@render marked(part.value)}{/if}{/each}
