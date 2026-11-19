<script>
  // Question and answer rows: the question as a label, one long answer.
  // Side by side from md up, stacked on a phone.
  import WorksheetField from "./WorksheetField.svelte";
  import WorksheetRowStatus from "./WorksheetRowStatus.svelte";
  import {
    editableColumns,
    fieldValue,
    fixedIdentity,
    rowLabel,
  } from "../../../../lib/dashboard/fundraisingWorksheets";

  export let part;
  export let records = {};
  export let store = null;
  export let idPrefix = "ws";

  $: headerLabels = (part?.columns || []).map((column) => column.label);
  $: rows = (part?.rows || []).map((rowDef) => {
    const identity = fixedIdentity(part.key, rowDef.key);
    const record = records[identity] || null;
    const column = editableColumns(part, rowDef)[0];
    return {
      rowDef,
      identity,
      record,
      column,
      label: rowLabel(part, rowDef),
      value: column ? fieldValue(record, rowDef, column) : "",
      invalid: column ? record?.invalid?.[column.key] || "" : "",
      inputId: `${idPrefix}-${part.key}-${rowDef.key}`,
    };
  });
</script>

<div class="rounded-control border border-ink/8">
  <div class="hidden grid-cols-[2fr_3fr] gap-4 border-b border-ink/10 bg-canvas/70 px-4 py-3 md:grid" aria-hidden="true">
    <span class="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">{headerLabels[0] || ""}</span>
    <span class="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">{headerLabels[1] || ""}</span>
  </div>
  {#each rows as row (row.identity)}
    <div class="grid gap-2 border-b border-ink/8 px-4 py-3 last:border-b-0 md:grid-cols-[2fr_3fr] md:gap-4">
      <label class="text-sm font-semibold leading-6 text-ink" for={row.inputId}>{row.label}</label>
      <div>
        {#if row.column}
          <WorksheetField
            {store}
            identity={row.identity}
            column={row.column}
            value={row.value}
            id={row.inputId}
            invalid={row.invalid}
          />
        {/if}
        <WorksheetRowStatus {store} record={row.record} class="mt-1" />
      </div>
    </div>
  {/each}
</div>
