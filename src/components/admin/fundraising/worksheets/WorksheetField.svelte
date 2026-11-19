<script>
  // One worksheet input. The value comes from the store (draft, saved value
  // or prefilled default); typing goes back through store.setField, blur
  // flushes the row's save at once.
  export let store = null;
  export let identity = "";
  export let column; // { key, label, type }
  export let value = "";
  export let id = "";
  export let ariaLabel = "";
  export let invalid = "";
  export let rows = 2;
  export let compact = false;

  $: type = column?.type || "text";
  $: numeric = type === "money" || type === "count";
  $: inputMode = type === "money" ? "decimal" : type === "count" ? "numeric" : undefined;
  $: textareaStyle = compact ? "min-height: 2.5rem" : "min-height: 4.5rem";

  function handleInput(event) {
    store?.setField(identity, column.key, event.currentTarget.value);
  }

  function handleFocus() {
    store?.focus(identity, column.key);
  }

  function handleBlur() {
    store?.blur(identity, column.key);
  }
</script>

{#if type === "long"}
  <textarea
    {id}
    class="textarea"
    style={textareaStyle}
    {rows}
    aria-label={ariaLabel || undefined}
    aria-invalid={invalid ? "true" : undefined}
    value={value ?? ""}
    oninput={handleInput}
    onfocus={handleFocus}
    onblur={handleBlur}
  ></textarea>
{:else}
  <input
    {id}
    class="input {numeric ? 'tabular-nums' : ''}"
    type={type === "date" ? "date" : "text"}
    inputmode={inputMode}
    autocomplete="off"
    aria-label={ariaLabel || undefined}
    aria-invalid={invalid ? "true" : undefined}
    value={value ?? ""}
    oninput={handleInput}
    onfocus={handleFocus}
    onblur={handleBlur}
  />
{/if}
{#if invalid}
  <p class="mt-1 text-xs font-medium text-red-700" role="alert">{invalid}</p>
{/if}
