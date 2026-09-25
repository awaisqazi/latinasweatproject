<script>
  // Gala 2025 archive: Export tab. Every CSV reuses the same builders the
  // future live Report tab will use (src/lib/dashboard/galaMath.js), just
  // with the archive's event slug in the filename. "Download everything"
  // is a portable JSON backup of exactly what this view loaded.
  import { Download, FileJson } from "@lucide/svelte";
  import Panel from "../../ui/Panel.svelte";
  import Button from "../../ui/Button.svelte";
  import {
    buildPledgesCsv,
    buildDonorsCsv,
    buildQuickBooksCsv,
    buildAttendanceCsv,
    DEFAULT_QB_ITEM,
  } from "../../../../lib/dashboard/galaMath.js";
  import { downloadCsv, slugForFilename, dateStamp } from "../../../../lib/dashboard/csv.js";

  let { event = null, guests = [], donations = [] } = $props();

  const eventSlug = $derived(slugForFilename(event?.slug || "gala-2025"));
  const qbClass = $derived(`Fundraising:Gala ${event?.year || 2025}`);

  function filename(suffix, extension = "csv") {
    return `${eventSlug}-${suffix}.${extension}`;
  }

  function exportPledges() {
    const { headers, rows } = buildPledgesCsv(donations, guests);
    downloadCsv(filename("pledges"), headers, rows);
  }

  function exportDonors() {
    const { headers, rows } = buildDonorsCsv(donations, guests);
    downloadCsv(filename("donors"), headers, rows);
  }

  function exportQuickBooks() {
    const { headers, rows } = buildQuickBooksCsv(donations, { qbItem: DEFAULT_QB_ITEM, qbClass });
    downloadCsv(filename("quickbooks"), headers, rows);
  }

  function exportAttendance() {
    const { headers, rows } = buildAttendanceCsv(guests);
    downloadCsv(filename("attendance"), headers, rows);
  }

  // A portable backup: exactly what this view loaded, nothing recomputed.
  function exportEverything() {
    const payload = JSON.stringify({ event, guests, donations }, null, 2);
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${eventSlug}-archive-${dateStamp()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const EXPORTS = $derived([
    {
      key: "pledges",
      title: "Pledges",
      description: "Every gift, one row each: date, kind, paddle, donor, amount, and status.",
      action: exportPledges,
    },
    {
      key: "donors",
      title: "Donors",
      description: "One row per donor with their total given and gift count.",
      action: exportDonors,
    },
    {
      key: "quickbooks",
      title: "QuickBooks",
      description: `Formatted for import: item "${DEFAULT_QB_ITEM}", class "${qbClass}". Voided and hidden rows excluded.`,
      action: exportQuickBooks,
    },
    {
      key: "attendance",
      title: "Attendance",
      description: "Guest list with party size, arrivals and check-in time.",
      action: exportAttendance,
    },
  ]);
</script>

<Panel title="Export Gala 2025 data" id="archive-export">
  <p class="mb-4 text-sm text-ink/65">
    All four CSVs open cleanly in Excel or Google Sheets. Cells are guarded against formula injection,
    so a note or name starting with =, +, - or @ downloads as plain text.
  </p>

  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {#each EXPORTS as item (item.key)}
      <div class="flex items-start justify-between gap-3 rounded-card border border-ink/8 bg-canvas/50 p-4">
        <div class="min-w-0">
          <p class="font-bold text-ink">{item.title}</p>
          <p class="mt-1 text-xs leading-5 text-ink/60">{item.description}</p>
        </div>
        <Button size="sm" icon={Download} onclick={item.action} class="shrink-0">CSV</Button>
      </div>
    {/each}
  </div>

  <div class="mt-3 flex items-start justify-between gap-3 rounded-card border border-dashed border-ink/15 bg-white p-4">
    <div class="min-w-0">
      <p class="font-bold text-ink">Download everything</p>
      <p class="mt-1 text-xs leading-5 text-ink/60">
        A portable JSON backup of the event, guests and donations exactly as this page loaded them.
      </p>
    </div>
    <Button size="sm" icon={FileJson} onclick={exportEverything} class="shrink-0">JSON</Button>
  </div>
</Panel>
