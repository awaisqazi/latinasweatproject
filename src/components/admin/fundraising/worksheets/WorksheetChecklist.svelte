<script>
  // Checklist with real checkboxes. A tick saves at once (no debounce).
  import WorksheetRowStatus from "./WorksheetRowStatus.svelte";
  import { fieldValue, fixedIdentity } from "../../../../lib/dashboard/fundraisingWorksheets";

  export let part;
  export let records = {};
  export let store = null;
  export let idPrefix = "ws";

  const CHECK = { key: "checked", label: "Ready", type: "checkbox" };

  $: rows = (part?.rows || []).map((rowDef) => {
    const identity = fixedIdentity(part.key, rowDef.key);
    const record = records[identity] || null;
    return {
      rowDef,
      identity,
      record,
      checked: fieldValue(record, rowDef, CHECK) === true,
      inputId: `${idPrefix}-${part.key}-${rowDef.key}`,
    };
  });

  function toggle(identity, event) {
    if (!store) return;
    store.setField(identity, "checked", event.currentTarget.checked);
    store.retry(identity);
  }
</script>

<ul class="rounded-control border border-ink/8">
  {#each rows as row (row.identity)}
    <li class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-ink/8 px-4 py-3 last:border-b-0">
      <label class="flex min-w-0 flex-1 items-start gap-3 text-sm" for={row.inputId}>
        <input
          id={row.inputId}
          type="checkbox"
          class="mt-0.5 h-4 w-4 shrink-0 rounded border-ink/20 text-accent focus:ring-accent"
          checked={row.checked}
          onchange={(event) => toggle(row.identity, event)}
        />
        <span class="text-ink">{row.rowDef.label}</span>
      </label>
      <WorksheetRowStatus {store} record={row.record} class="pl-7 sm:pl-0" />
    </li>
  {/each}
</ul>
