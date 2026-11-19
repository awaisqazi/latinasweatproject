<script>
  // A worksheet grid: prefilled rows from the definition, then rows people
  // added (with Remove). A real table on wide screens; below the breakpoint
  // each row stacks into labelled fields so a phone never scrolls sideways.
  // Tables with five or more columns stack below lg, the rest below md.
  import { Plus, Trash2 } from "@lucide/svelte";
  import Button from "../../ui/Button.svelte";
  import WorksheetField from "./WorksheetField.svelte";
  import WorksheetRowStatus from "./WorksheetRowStatus.svelte";
  import {
    ADDED_ROW_DEF,
    addedRecords,
    editableColumns,
    fieldValue,
    fixedIdentity,
    isLabelCell,
  } from "../../../../lib/dashboard/fundraisingWorksheets";

  export let part;
  export let records = {};
  export let store = null;
  export let idPrefix = "ws";

  $: columns = part?.columns || [];
  $: wide = columns.length >= 5;
  $: tableWrapClass = wide ? "hidden lg:block" : "hidden md:block";
  $: cardsClass = wide ? "space-y-3 lg:hidden" : "space-y-3 md:hidden";

  $: rows = [
    ...(part?.rows || []).map((rowDef) => ({
      rowDef,
      identity: fixedIdentity(part.key, rowDef.key),
      added: false,
      slug: rowDef.key,
    })),
    ...(part?.canAdd ? addedRecords(records, part.key) : []).map((record) => ({
      rowDef: ADDED_ROW_DEF,
      identity: record.identity,
      added: true,
      slug: record.id,
    })),
  ].map((row, index) => {
    const record = records[row.identity] || null;
    const editable = editableColumns(part, row.rowDef);
    const byKey = Object.fromEntries(editable.map((column) => [column.key, column]));
    return {
      ...row,
      index,
      record,
      cells: columns.map((column) => {
        const field = byKey[column.key];
        return {
          column,
          field,
          fixedText: isLabelCell(column, row.rowDef) ? String(row.rowDef.cells[column.key]) : "",
          value: field ? fieldValue(record, row.rowDef, field) : "",
          invalid: field ? record?.invalid?.[column.key] || "" : "",
        };
      }),
    };
  });

  function rowTitle(row) {
    const fixed = row.cells.find((cell) => cell.fixedText);
    return fixed ? fixed.fixedText : `Row ${row.index + 1}`;
  }

  function addRow() {
    store?.addRow(part.key);
  }
</script>

<div class={tableWrapClass}>
  <div class="thin-scroll overflow-x-auto rounded-control border border-ink/8">
    <table class="w-full text-left text-sm">
      <thead>
        <tr class="border-b border-ink/10 bg-canvas/70">
          {#each columns as column (column.key)}
            <th scope="col" class="px-3 py-3 align-bottom text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">
              {column.label}
            </th>
          {/each}
          <th scope="col" class="w-28 px-3 py-3"><span class="sr-only">Save status</span></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.identity)}
          <tr class="border-b border-ink/8 align-top last:border-b-0">
            {#each row.cells as cell (cell.column.key)}
              {#if cell.fixedText}
                <th scope="row" class="px-3 py-3 text-sm font-semibold leading-5 text-ink">{cell.fixedText}</th>
              {:else}
                <td class="px-2 py-2 {cell.field?.type === 'long' ? 'min-w-48' : 'min-w-28'}">
                  {#if cell.field}
                    <WorksheetField
                      {store}
                      identity={row.identity}
                      column={cell.field}
                      value={cell.value}
                      id={`${idPrefix}-${part.key}-${row.slug}-${cell.column.key}`}
                      ariaLabel={`${cell.column.label}, ${rowTitle(row)}`}
                      invalid={cell.invalid}
                      compact
                      rows={1}
                    />
                  {/if}
                </td>
              {/if}
            {/each}
            <td class="px-3 py-2">
              <div class="flex items-start justify-end gap-1">
                <WorksheetRowStatus {store} record={row.record} class="min-w-0 flex-1 pt-2.5 text-right" />
                {#if row.added}
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={Trash2}
                    label={`Remove ${rowTitle(row)}`}
                    disabled={row.record?.removing}
                    onclick={() => store?.removeRow(row.identity)}
                  />
                {/if}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<div class={cardsClass}>
  {#each rows as row (row.identity)}
    <div class="rounded-control border border-ink/8 p-3">
      <div class="mb-2 flex items-start justify-between gap-2">
        <h5 class="text-sm font-semibold leading-6 text-ink">{rowTitle(row)}</h5>
        {#if row.added}
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={Trash2}
            label={`Remove ${rowTitle(row)}`}
            disabled={row.record?.removing}
            onclick={() => store?.removeRow(row.identity)}
          />
        {/if}
      </div>
      <div class="space-y-3">
        {#each row.cells as cell (cell.column.key)}
          {#if cell.field}
            {@const inputId = `${idPrefix}-${part.key}-${row.slug}-${cell.column.key}-m`}
            <div>
              <label class="block text-xs font-semibold text-ink/70" for={inputId}>{cell.column.label}</label>
              <div class="mt-1">
                <WorksheetField
                  {store}
                  identity={row.identity}
                  column={cell.field}
                  value={cell.value}
                  id={inputId}
                  invalid={cell.invalid}
                />
              </div>
            </div>
          {/if}
        {/each}
      </div>
      <WorksheetRowStatus {store} record={row.record} class="mt-2" />
    </div>
  {/each}
</div>

{#if part?.canAdd}
  <div class="mt-3">
    <Button size="sm" icon={Plus} onclick={addRow}>Add row</Button>
  </div>
{/if}
