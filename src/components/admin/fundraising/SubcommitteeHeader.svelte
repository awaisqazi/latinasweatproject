<script>
  // Opens each subcommittee tab: its name and co-leads from
  // src/data/fundraisingSubcommittees.js, its key numbers with room to
  // read them, and the row of sub-tabs.
  import Tabs from "../ui/Tabs.svelte";
  import SubcommitteeKeyNumbers from "./live/SubcommitteeKeyNumbers.svelte";
  import { coLeadsLabel, subcommitteeById } from "../../../data/fundraisingSubcommittees.js";

  export let committeeId = "";
  export let view = null; // LiveData's view
  export let subTabs = []; // [{ id, label, count? }]
  export let active = "";
  export let onChange = () => {};
  export let onOpenProspect = () => {};

  $: committee = subcommitteeById(committeeId);
</script>

{#if committee}
  <div class="rounded-card border border-ink/8 bg-white p-4 shadow-card md:p-5">
    <h3 id={`fundraising-${committee.id}-tab-title`} class="text-xl font-bold text-ink">{committee.name}</h3>
    <p class="mt-1 text-sm text-ink/55">Co-leads: {coLeadsLabel(committee)}</p>

    <div class="mt-4">
      <SubcommitteeKeyNumbers committeeId={committee.id} {view} variant="full" {onOpenProspect} />
    </div>

    <div class="mt-5">
      <Tabs
        tabs={subTabs}
        {active}
        {onChange}
        variant="underline"
        label={`${committee.tabLabel || committee.name} sections`}
        hasPanels={false}
      />
    </div>
  </div>
{/if}
