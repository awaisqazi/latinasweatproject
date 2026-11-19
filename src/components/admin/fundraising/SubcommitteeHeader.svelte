<script>
  // Opens each subcommittee tab, the same way for all four:
  //   1. name and co-leads (src/data/fundraisingSubcommittees.js)
  //   2. at most three key numbers, the rest behind "More numbers"
  //   3. Next up: this subcommittee's lines from fundraising_attention
  //   4. This month's update (fundraising_updates)
  //   5. the row of sub-tabs
  import KeyNumbers from "./subcommittee/KeyNumbers.svelte";
  import MonthlyUpdate from "./subcommittee/MonthlyUpdate.svelte";
  import NextUp from "./subcommittee/NextUp.svelte";
  import SubTabs from "./subcommittee/SubTabs.svelte";
  import { coLeadsLabel, subcommitteeById } from "../../../data/fundraisingSubcommittees.js";

  export let supabase;
  export let committeeId = "";
  export let view = null; // LiveData's view
  export let followUps = null; // FollowUpData's followUps
  export let teamMembers = [];
  export let campaignSummaries = [];
  export let last30Donations = [];
  export let subTabs = []; // [{ id, label, count? }]
  export let active = "";
  export let onChange = () => {};
  export let onOpenProspect = () => {};
  export let onOpenTarget = () => {}; // (tabId, subTabId, { prospectId?, overdueOnly? })

  let update;

  $: committee = subcommitteeById(committeeId);

  function openLine(line) {
    if (line.kind === "update_missing") {
      update?.focus?.();
      return;
    }
    if (line.kind === "grant_deadline_group") {
      onOpenTarget("grants", "grants-pipeline", { overdueOnly: true });
      return;
    }
    const target = line.target || {};
    const tab = target.tab || committeeId;
    const sub = target.subtab ? (target.subtab.startsWith(`${tab}-`) ? target.subtab : `${tab}-${target.subtab}`) : "";
    onOpenTarget(tab, sub, { prospectId: target.id || "" });
  }

  function openChild(line) {
    onOpenTarget("grants", "grants-pipeline", { prospectId: line.target?.id || "" });
  }
</script>

{#if committee}
  <div class="space-y-4">
    <div class="rounded-card border border-ink/8 bg-white p-4 shadow-card md:p-5">
      <h3 id={`fundraising-${committee.id}-tab-title`} class="text-xl font-bold text-ink">{committee.name}</h3>
      <p class="mt-1 text-sm text-ink/55">Co-leads: {coLeadsLabel(committee)}</p>

      <div class="mt-3">
        <KeyNumbers
          committeeId={committee.id}
          {view}
          thanks={followUps?.thanks || null}
          {campaignSummaries}
          {last30Donations}
          onOpenSub={(id) => onChange(id)}
          {onOpenProspect}
        />
      </div>
    </div>

    <NextUp
      committeeId={committee.id}
      attention={followUps?.attention || null}
      onOpenLine={openLine}
      onOpenChild={openChild}
    />

    {#key committee.id}
      <MonthlyUpdate
        bind:this={update}
        {supabase}
        committeeId={committee.id}
        {teamMembers}
        onSaved={() => followUps?.actions?.reloadAttention?.()}
      />
    {/key}

    <div class="rounded-card border border-ink/8 bg-white px-4 shadow-card md:px-5">
      <SubTabs
        tabs={subTabs}
        {active}
        {onChange}
        label={`${committee.tabLabel || committee.name} sections`}
      />
    </div>
  </div>
{/if}
