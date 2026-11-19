<script>
  // One subcommittee's getting-started worksheet as a live form.
  //   <SubcommitteeWorksheet {supabase} {profile} subcommitteeId="events" cycle="2027" />
  // Self-contained: loads its rows, autosaves each row, follows other
  // people's edits over realtime, and starts over when subcommitteeId or
  // cycle changes. Definitions: src/data/fundraisingWorksheets.js. Logic and
  // every database call: src/lib/dashboard/fundraisingWorksheets.js.
  import { onDestroy, onMount } from "svelte";
  import Banner from "../../ui/Banner.svelte";
  import EmptyState from "../../ui/EmptyState.svelte";
  import Panel from "../../ui/Panel.svelte";
  import SkeletonCard from "../../ui/SkeletonCard.svelte";
  import WorksheetChecklist from "./WorksheetChecklist.svelte";
  import WorksheetField from "./WorksheetField.svelte";
  import WorksheetHowTo from "./WorksheetHowTo.svelte";
  import WorksheetQa from "./WorksheetQa.svelte";
  import WorksheetReference from "./WorksheetReference.svelte";
  import WorksheetRowStatus from "./WorksheetRowStatus.svelte";
  import WorksheetTable from "./WorksheetTable.svelte";
  import {
    HEADER_PART,
    SHARE_NOTE,
    WORKSHEET_CYCLE,
    getWorksheet,
  } from "../../../../data/fundraisingWorksheets.js";
  import {
    FUNDRAISING_SUBCOMMITTEES,
    coLeadsLabel,
  } from "../../../../data/fundraisingSubcommittees.js";
  import {
    createWorksheetStore,
    editableColumns,
    fieldValue,
    fixedIdentity,
    progressLabel,
    sectionProgress,
    worksheetProgress,
  } from "../../../../lib/dashboard/fundraisingWorksheets";

  export let supabase;
  export let profile = null;
  export let subcommitteeId = "events";
  export let cycle = WORKSHEET_CYCLE;

  let store = null;
  let storeState = { status: "loading", message: "", forbidden: false, records: {} };
  let unsubscribeState = () => {};
  let activeKey = "";
  let mounted = false;

  $: worksheet = getWorksheet(subcommitteeId);
  $: committee = FUNDRAISING_SUBCOMMITTEES.find((row) => row.id === subcommitteeId) || null;
  $: coLeads = committee ? coLeadsLabel(committee) : "";
  $: idPrefix = `ws-${subcommitteeId}-${cycle}`;

  // Start over whenever the worksheet, cycle or client changes.
  $: nextKey = `${subcommitteeId}|${cycle}|${supabase ? "db" : "none"}|${profile?.id || ""}`;
  $: if (mounted && nextKey !== activeKey) start(nextKey, subcommitteeId, cycle, supabase, profile?.id || null);

  $: records = storeState.records || {};
  $: sections = worksheet?.sections || [];
  $: sectionProgressList = sections.map((section) => sectionProgress(section, records));
  $: overall = worksheetProgress(worksheet, records);

  $: headerRows = HEADER_PART.rows.map((rowDef) => {
    const identity = fixedIdentity(HEADER_PART.key, rowDef.key);
    const record = records[identity] || null;
    const column = editableColumns(HEADER_PART, rowDef)[0];
    return {
      rowDef,
      identity,
      record,
      column,
      label: rowDef.cells.label,
      value: fieldValue(record, rowDef, column),
      inputId: `${idPrefix}-header-${rowDef.key}`,
    };
  });

  function start(key, sub, cyc, client, profileId) {
    activeKey = key;
    teardown();
    const ws = getWorksheet(sub);
    if (!ws || !client) {
      storeState = { status: ws ? "loading" : "unknown", message: "", forbidden: false, records: {} };
      return;
    }
    store = createWorksheetStore({ supabase: client, worksheet: ws, subcommitteeId: sub, cycle: cyc, profileId });
    unsubscribeState = store.subscribe((next) => {
      storeState = next;
    });
    store.load();
  }

  function teardown() {
    unsubscribeState();
    unsubscribeState = () => {};
    store?.destroy();
    store = null;
  }

  function reload() {
    store?.load();
  }

  function handleBeforeUnload(event) {
    if (!store) return;
    store.flushAll();
    if (store.hasUnsaved()) {
      event.preventDefault();
      event.returnValue = "";
    }
  }

  function handleVisibility() {
    if (document.visibilityState === "hidden") store?.flushAll();
  }

  onMount(() => {
    mounted = true;
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibility);
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
    }
    teardown();
  });
</script>

<div class="space-y-4">
  {#if storeState.status === "unknown"}
    <EmptyState title="No worksheet" message={`There is no worksheet for "${subcommitteeId}".`} />
  {:else if storeState.status === "loading"}
    <SkeletonCard lines={3} />
    <SkeletonCard lines={4} />
  {:else if storeState.status === "missing"}
    <EmptyState
      title="Worksheets are not set up yet"
      message="The worksheet table is not in the database yet. Check back once it is set up."
    />
  {:else if storeState.status === "error"}
    <Banner tone="error" message={`Could not load the worksheet. ${storeState.message}`} onRetry={reload} />
  {:else}
    {#if storeState.forbidden}
      <Banner tone="info" message="Your account cannot edit worksheets. Ask an admin to add the Fundraising module to your account." />
    {/if}

    <Panel title={worksheet.title} id={`${idPrefix}-title`}>
      <svelte:fragment slot="actions">
        <span class="text-sm font-semibold tabular-nums text-ink/60">{progressLabel(overall)}</span>
      </svelte:fragment>

      <p class="-mt-2 text-sm leading-6 text-ink/75">
        {#if coLeads}<span class="font-semibold text-ink">Co-leads: {coLeads}.</span>{" "}{/if}{worksheet.charge}
      </p>

      <div class="mt-4 grid gap-4 sm:grid-cols-[3fr_1fr]">
        {#each headerRows as row (row.identity)}
          <div>
            <label class="block text-sm font-semibold text-ink" for={row.inputId}>{row.label}</label>
            <div class="mt-1.5">
              <WorksheetField
                {store}
                identity={row.identity}
                column={row.column}
                value={row.value}
                id={row.inputId}
                compact
                rows={1}
              />
            </div>
            <WorksheetRowStatus {store} record={row.record} class="mt-1" />
          </div>
        {/each}
      </div>

      <div class="mt-4">
        <WorksheetHowTo />
      </div>
    </Panel>

    {#each sections as section, s (section.key)}
      <Panel title={section.title} id={`${idPrefix}-${section.key}-title`}>
        <svelte:fragment slot="actions">
          {#if sectionProgressList[s]?.total}
            <span class="text-sm font-semibold tabular-nums text-ink/60">{progressLabel(sectionProgressList[s])}</span>
          {/if}
        </svelte:fragment>

        {#if section.share}
          <Banner tone="info" message={SHARE_NOTE} class="mb-4" />
        {/if}

        <div class="space-y-4">
          {#each section.parts as part, p (part.key || `${section.key}-${p}`)}
            {#if part.kind === "text"}
              <p class="text-sm leading-6 text-ink/75">
                {#if part.lead}<span class="font-bold text-ink">{part.lead}</span>{#if part.text}{" "}{/if}{/if}{part.text}
              </p>
            {:else if part.kind === "qa"}
              <WorksheetQa {part} {records} {store} {idPrefix} />
            {:else if part.kind === "table"}
              <div>
                <WorksheetTable {part} {records} {store} {idPrefix} />
              </div>
            {:else if part.kind === "checklist"}
              <WorksheetChecklist {part} {records} {store} {idPrefix} />
            {:else if part.kind === "reference"}
              <WorksheetReference {part} />
            {/if}
          {/each}
        </div>
      </Panel>
    {/each}
  {/if}
</div>
