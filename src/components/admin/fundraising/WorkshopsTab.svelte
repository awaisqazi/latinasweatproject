<script>
  // Fundraising > Fundraising Workshops (the Membership Upskilling
  // subcommittee), below its header: People fundraising, the members raising
  // money on their own Giving Tuesday pages. Approvals and pages are managed
  // in Fundraising Events > Giving Tuesday. Trainings are planned and their
  // attendance recorded in the Worksheet, which FundraisingView mounts.
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import { formatCentsWhole } from "../../../lib/dashboard/fundraisingLive";

  export let sub = "upskilling-people";
  export let view = null; // LiveData's view
  export let onOpenGivingTuesday = () => {};
  export let onOpenWorksheet = () => {};

  $: campaignTitle = view?.givingCampaignTitle || "Giving Tuesday";
  $: approvedIds = new Set(
    (view?.givingFundraisers || []).filter((row) => row.status === "approved").map((row) => row.id),
  );
  $: fundraisers = (view?.givingTotals || [])
    .filter((row) => row.status === "approved" || approvedIds.has(row.fundraiser_id))
    .slice()
    .sort((a, b) => Number(b.raised_cents || 0) - Number(a.raised_cents || 0));
</script>

{#if sub === "upskilling-people"}
  <Panel title="People fundraising" id="fundraising-people-title">
    <svelte:fragment slot="actions">
      <Button size="sm" onclick={onOpenGivingTuesday}>Open Giving Tuesday</Button>
    </svelte:fragment>
    <p class="-mt-2 mb-4 text-sm text-ink/60">
      Approved members raising money on their own {campaignTitle} pages, most raised first. Sign-ups, approvals and pages are managed in Fundraising Events, under Giving Tuesday.
    </p>

    {#if view?.givingError}
      <p class="text-sm text-ink/60">Could not load the Giving Tuesday fundraisers.</p>
    {:else if fundraisers.length}
      <div class="overflow-x-auto">
        <table class="w-full min-w-[18rem] text-sm">
          <caption class="sr-only">Approved peer fundraisers</caption>
          <thead>
            <tr class="text-left text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
              <th scope="col" class="pb-1.5 pr-3 font-bold">Fundraiser</th>
              <th scope="col" class="pb-1.5 pl-2 text-right font-bold">Gifts</th>
              <th scope="col" class="pb-1.5 pl-2 text-right font-bold">Raised</th>
            </tr>
          </thead>
          <tbody>
            {#each fundraisers as row (row.fundraiser_id)}
              <tr class="border-t border-ink/8">
                <th scope="row" class="py-1.5 pr-3 text-left font-semibold text-ink">{row.display_name || row.email || "Unnamed fundraiser"}</th>
                <td class="py-1.5 pl-2 text-right tabular-nums text-ink/80">{Number(row.gift_count || 0).toLocaleString()}</td>
                <td class="py-1.5 pl-2 text-right tabular-nums text-ink">{formatCentsWhole(row.raised_cents)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <EmptyState title="No approved fundraisers yet" message="Members appear here once their Giving Tuesday sign-up is approved." />
    {/if}
  </Panel>

  <Panel title="Trainings" id="fundraising-trainings-title">
    <p class="text-sm text-ink/70">
      Training attendance is recorded in the Worksheet. The dashboard does not track it anywhere else, so it is not counted on this page.
    </p>
    <div class="mt-3">
      <Button size="sm" onclick={onOpenWorksheet}>Open the Worksheet</Button>
    </div>
  </Panel>
{/if}
