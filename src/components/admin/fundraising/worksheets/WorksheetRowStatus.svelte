<script>
  // A row's save state, said plainly: nothing, Saving, Saved, or Could not
  // save with a Retry that keeps the typed text. When someone else changed
  // this row while it was being typed in, autosave pauses and the person
  // chooses whose text stays.
  export let store = null;
  export let record = null;
  let className = "";
  export { className as class };

  $: identity = record?.identity || "";
  $: state = record?.state || "idle";
</script>

<div class="min-h-4 text-xs leading-5 {className}" role="status" aria-live="polite">
  {#if record?.conflict}
    <span class="text-amber-800">Updated by someone else. Your text is kept and not saved yet.</span>
    <button
      type="button"
      class="ml-1 font-semibold text-ink underline underline-offset-2 hover:no-underline"
      onclick={() => store?.retry(identity)}
    >
      Keep mine
    </button>
    <span class="text-ink/40" aria-hidden="true">·</span>
    <button
      type="button"
      class="font-semibold text-ink underline underline-offset-2 hover:no-underline"
      onclick={() => store?.reloadRow(identity)}
    >
      Use theirs
    </button>
  {:else if record?.removing}
    <span class="text-ink/50">Removing</span>
  {:else if state === "saving" || state === "pending"}
    <span class="text-ink/50">Saving</span>
  {:else if state === "saved"}
    <span class="text-ink/50">Saved</span>
  {:else if state === "error"}
    <span class="font-medium text-red-700">Could not save. {record.error}</span>
    <button
      type="button"
      class="ml-1 font-semibold text-red-700 underline underline-offset-2 hover:no-underline"
      onclick={() => store?.retry(identity)}
    >
      Retry
    </button>
  {:else if state === "remove_error"}
    <span class="font-medium text-red-700">Could not remove this row. {record.error}</span>
    <button
      type="button"
      class="ml-1 font-semibold text-red-700 underline underline-offset-2 hover:no-underline"
      onclick={() => store?.removeRow(identity)}
    >
      Retry
    </button>
  {/if}
</div>
