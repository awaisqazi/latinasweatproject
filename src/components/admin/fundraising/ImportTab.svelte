<script>
  // Periodic Zeffy data-dump import. Upload the raw export (.xlsx or .csv);
  // rows already in the database are recognized by content hash and skipped,
  // new rows are added, and every run is recorded below. Re-uploading the
  // same file is always safe.
  import { onMount } from "svelte";
  import { FileSpreadsheet, Upload } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import {
    formatMoney,
    importZeffyRows,
    loadImports,
    parseZeffyRows,
  } from "../../../lib/dashboard/fundraising";

  export let supabase;
  export let profileId = "";
  export let onImported = () => {};

  const SHEET_NAME = "Full Zeffy Campaign Details";

  let fileInput;
  let fileName = "";
  let parsing = false;
  let parsed = null; // { rows, skippedBlank }
  let importing = false;
  let importProgress = 0;
  let importResult = null; // { inserted, skipped }
  let errorMessage = "";
  let imports = [];
  let importsLoading = true;

  $: preview = parsed ? buildPreview(parsed.rows) : null;

  onMount(() => {
    refreshImports();
  });

  async function refreshImports() {
    importsLoading = true;
    const { data, error } = await loadImports(supabase);
    if (!error) imports = data || [];
    importsLoading = false;
  }

  async function handleFileChange(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || parsing || importing) return;

    fileName = file.name;
    parsing = true;
    parsed = null;
    importResult = null;
    errorMessage = "";

    try {
      // SheetJS is heavy, so it loads on demand only in this tab.
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });

      const sheetName = workbook.SheetNames.includes(SHEET_NAME)
        ? SHEET_NAME
        : workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) throw new Error("No readable sheet found in this file.");

      // raw:false formats cells the way Zeffy displays them (matching the
      // hash spec); header:1 gives array-of-arrays with the header row first.
      const sheetRows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: null,
      });

      parsed = await parseZeffyRows(sheetRows);
      if (!parsed.rows.length) {
        errorMessage = "No data rows found in this file.";
        parsed = null;
      }
    } catch (error) {
      errorMessage = error?.message || "This file could not be read.";
      parsed = null;
    }

    parsing = false;
  }

  function buildPreview(rows) {
    const dates = rows.map((row) => row.payment_date).filter(Boolean).sort();
    const campaigns = new Set(rows.map((row) => row.campaign_title).filter(Boolean));
    const emails = new Set(rows.map((row) => row.email).filter(Boolean));
    const total = rows.reduce(
      (sum, row) =>
        row.payment_status === "Succeeded"
          ? sum + Number(row.total_amount || 0) - Number(row.refund_amount || 0)
          : sum,
      0,
    );

    return {
      rowCount: rows.length,
      dateFrom: dates[0] || null,
      dateTo: dates[dates.length - 1] || null,
      campaignCount: campaigns.size,
      donorCount: emails.size,
      total,
    };
  }

  async function runImport() {
    if (!parsed?.rows?.length || importing) return;

    importing = true;
    importProgress = 0;
    errorMessage = "";
    importResult = null;

    const { data: importRecord, error: importError } = await supabase
      .from("fundraising_imports")
      .insert({
        file_name: fileName || "Zeffy export",
        total_rows: parsed.rows.length,
        created_by: profileId || null,
      })
      .select("id")
      .single();

    if (importError) {
      errorMessage = importError.message;
      importing = false;
      return;
    }

    const { inserted, skipped, error } = await importZeffyRows(
      supabase,
      importRecord.id,
      parsed.rows,
      (done, total) => {
        importProgress = Math.round((done / total) * 100);
      },
    );

    if (error) {
      errorMessage = `The import stopped partway: ${error.message}. Rows already imported were kept; re-upload the same file to finish, duplicates are skipped automatically.`;
    }

    await supabase
      .from("fundraising_imports")
      .update({ inserted_rows: inserted, skipped_rows: skipped })
      .eq("id", importRecord.id);

    if (!error) {
      importResult = { inserted, skipped };
      parsed = null;
      fileName = "";
    }

    importing = false;
    refreshImports();
    onImported();
  }

  function formatDate(value) {
    if (!value) return "n/a";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function formatDateTime(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }
</script>

<div class="space-y-4">
  <Panel title="Import a Zeffy export" id="fundraising-import-title">
    <p class="text-sm leading-6 text-ink/60">
      Export the full campaign details from Zeffy (the file with a
      "{SHEET_NAME}" sheet) and upload it here. Anything already in the
      database is skipped automatically, new activity is added, and every
      number in the hub refreshes, so upload as often as you like.
    </p>

    {#if errorMessage}
      <Banner tone="error" message={errorMessage} class="mt-4" />
    {/if}

    {#if importResult}
      <Banner
        tone="success"
        class="mt-4"
        message={`Import complete: ${importResult.inserted.toLocaleString()} new record${importResult.inserted === 1 ? "" : "s"} added, ${importResult.skipped.toLocaleString()} already in the database.`}
      />
    {/if}

    <div class="mt-4">
      <input
        bind:this={fileInput}
        type="file"
        accept=".xlsx,.xls,.csv"
        class="sr-only"
        aria-label="Choose a Zeffy export file"
        onchange={handleFileChange}
      />
      <Button
        variant="primary"
        icon={FileSpreadsheet}
        loading={parsing}
        disabled={importing}
        onclick={() => fileInput?.click()}
      >
        {parsing ? "Reading file" : "Choose Zeffy file"}
      </Button>
    </div>

    {#if parsed && preview}
      <div class="mt-4 rounded-control border border-ink/8 bg-canvas/60 p-4">
        <div class="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{fileName}</Badge>
          <Badge tone="neutral">{preview.rowCount.toLocaleString()} rows</Badge>
          {#if parsed.skippedBlank}
            <Badge tone="neutral" size="xs">{parsed.skippedBlank} blank skipped</Badge>
          {/if}
        </div>
        <dl class="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Date range</dt>
            <dd class="mt-1 font-semibold text-ink">
              {formatDate(preview.dateFrom)} – {formatDate(preview.dateTo)}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Campaigns</dt>
            <dd class="mt-1 font-semibold text-ink">{preview.campaignCount}</dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Unique emails</dt>
            <dd class="mt-1 font-semibold text-ink">{preview.donorCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Succeeded total</dt>
            <dd class="mt-1 font-semibold text-ink">{formatMoney(preview.total)}</dd>
          </div>
        </dl>
        <p class="mt-3 text-xs leading-5 text-ink/55">
          Only rows not already in the database will be added; the exact count
          shows after the import runs.
        </p>
        <Button
          variant="dark"
          icon={Upload}
          class="mt-4"
          loading={importing}
          onclick={runImport}
        >
          {importing ? `Importing ${importProgress}%` : "Import new records"}
        </Button>
      </div>
    {/if}
  </Panel>

  <Panel title="Import history" id="fundraising-import-history-title">
    {#if importsLoading}
      <p class="text-sm text-ink/55">Loading…</p>
    {:else if imports.length}
      <div class="space-y-2">
        {#each imports as run (run.id)}
          <div class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3">
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-bold leading-snug text-ink">
                {run.file_name || "Zeffy export"}
              </span>
              <span class="mt-0.5 block text-xs font-semibold text-ink/50">
                {formatDateTime(run.created_at)}
              </span>
            </span>
            <Badge tone={run.inserted_rows > 0 ? "green" : "neutral"} size="xs">
              +{(run.inserted_rows || 0).toLocaleString()} new
            </Badge>
            <Badge tone="neutral" size="xs">
              {(run.skipped_rows || 0).toLocaleString()} skipped
            </Badge>
          </div>
        {/each}
      </div>
    {:else}
      <EmptyState title="No imports yet" message="Upload the first Zeffy export above." />
    {/if}
  </Panel>
</div>
