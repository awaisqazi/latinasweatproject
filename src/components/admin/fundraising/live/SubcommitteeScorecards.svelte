<script>
  // Overview: one short block of real numbers per fundraising subcommittee,
  // each opening that subcommittee's own tab. Names and co-leads come from
  // src/data/fundraisingSubcommittees.js; the numbers are picked by id in
  // SubcommitteeKeyNumbers.svelte.
  import Button from "../../ui/Button.svelte";
  import Panel from "../../ui/Panel.svelte";
  import SubcommitteeKeyNumbers from "./SubcommitteeKeyNumbers.svelte";
  import {
    FUNDRAISING_SUBCOMMITTEES,
    coLeadsLabel,
  } from "../../../../data/fundraisingSubcommittees.js";

  export let view = null; // LiveData's view
  export let onOpenTab = () => {};
  export let onOpenProspect = () => {};
</script>

<div class="grid items-start gap-4 lg:grid-cols-2">
  {#each FUNDRAISING_SUBCOMMITTEES as committee (committee.id)}
    <Panel title={committee.name} id={`fundraising-committee-${committee.id}-title`}>
      <p class="-mt-3 mb-4 text-sm text-ink/55">Co-leads: {coLeadsLabel(committee)}</p>
      <SubcommitteeKeyNumbers committeeId={committee.id} {view} variant="compact" {onOpenProspect} />
      <div class="mt-4 flex justify-end">
        <Button size="sm" variant="ghost" onclick={() => onOpenTab(committee.id)}>
          Open {committee.tabLabel || committee.name}
        </Button>
      </div>
    </Panel>
  {/each}
</div>
