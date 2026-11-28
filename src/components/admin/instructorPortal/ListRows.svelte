<!--
  A short list of plain texts (weekly notes, shoutouts), one box per item.
  Every change reassigns `items` with a new array, so the parent can bind a
  getter and setter pair and only create the list once someone types.
  A line break in a box (Enter, or a pasted list) splits it into boxes.
-->
<script>
  import { tick } from "svelte";
  import { Plus, X } from "@lucide/svelte";
  import Button from "../ui/Button.svelte";
  import { splitLines } from "../../../lib/instructorPortal/editor.js";

  const NOTES_HINT =
    "One point per box. Paste a list and each line becomes its own box. Links: [words](https://...). Bold: **words**.";

  let {
    items = $bindable([]),
    title = "Notes",
    label = "Note",
    addLabel = "Add a note",
    hint = NOTES_HINT,
    placeholder = "",
  } = $props();

  const uid = $props.id();
  const rows = $derived(Array.isArray(items) ? items.map((x) => (typeof x === "string" ? x : "")) : []);
  const word = $derived(label.toLowerCase());

  function rowId(i) {
    return `${uid}-row-${i}`;
  }

  async function focusRow(i, atEnd = true) {
    await tick();
    const el = document.getElementById(rowId(i));
    if (!el) return;
    el.focus();
    if (atEnd && typeof el.value === "string") el.setSelectionRange(el.value.length, el.value.length);
  }

  function onInput(i, event) {
    const value = event.currentTarget.value;
    if (!/[\r\n]/.test(value)) {
      items = rows.map((x, j) => (j === i ? value : x));
      return;
    }
    // Enter at the end of a box leaves an empty last line: that means "a new box".
    const parts = splitLines(value);
    if (/[\r\n]\s*$/.test(value)) parts.push("");
    if (!parts.length) parts.push("");
    // This box keeps its first line. Write it to the field directly: when that
    // equals what the box held before the line break, the state does not change
    // and the field would otherwise keep the stray line break.
    event.currentTarget.value = parts[0];
    items = [...rows.slice(0, i), ...parts, ...rows.slice(i + 1)];
    focusRow(i + parts.length - 1);
  }

  // `rows` is derived from `items`, so read what is needed from it BEFORE
  // assigning: afterwards it already describes the new list.
  function remove(i) {
    const left = rows.length - 1;
    items = rows.filter((_, j) => j !== i);
    if (left > 0) focusRow(Math.min(i, left - 1));
  }

  function add() {
    const at = rows.length;
    items = [...rows, ""];
    focusRow(at);
  }
</script>

<fieldset class="min-w-0">
  <legend class="text-sm font-semibold text-ink">{title}</legend>
  {#if hint}<p class="mt-1 text-xs leading-5 text-ink/50" id="{uid}-hint">{hint}</p>{/if}
  {#if rows.length}
    <ol class="mt-2 space-y-2">
      {#each rows as value, i}
        <li class="flex items-start gap-1.5">
          <label class="sr-only" for={rowId(i)}>{label} {i + 1}</label>
          <textarea
            id={rowId(i)}
            class="textarea row-text min-w-0 flex-1"
            rows="2"
            {placeholder}
            aria-describedby={hint ? `${uid}-hint` : undefined}
            {value}
            oninput={(event) => onInput(i, event)}
          ></textarea>
          <button
            type="button"
            class="grid h-11 w-11 shrink-0 place-items-center rounded-control text-ink/55 transition-colors hover:bg-ink/[0.06] hover:text-ink"
            aria-label="Remove {word} {i + 1}"
            title="Remove {word} {i + 1}"
            onclick={() => remove(i)}
          >
            <X class="h-4 w-4" aria-hidden="true" />
          </button>
        </li>
      {/each}
    </ol>
  {/if}
  <div class="mt-2">
    <Button variant="ghost" size="sm" icon={Plus} class="-ml-2 max-md:min-h-11" onclick={add}>{addLabel}</Button>
  </div>
</fieldset>

<style>
  textarea.row-text {
    field-sizing: content;
    min-height: 2.75rem;
    resize: none;
  }
</style>
