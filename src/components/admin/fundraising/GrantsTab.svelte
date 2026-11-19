<script>
  // Fundraising > Grants, below its header: the Pipeline sub-tab, which is
  // the prospects and grants board with its CSV export. The prospect drawer
  // stays in FundraisingView. Worksheet is mounted by FundraisingView.
  import { Download } from "@lucide/svelte";
  import Button from "../ui/Button.svelte";
  import ProspectsBoard from "./ProspectsBoard.svelte";
  import { dateStamp, downloadCsv } from "../../../lib/dashboard/csv";

  export let sub = "grants-pipeline";
  export let supabase;
  export let prospects = [];
  export let teamMembers = [];
  export let onSelectProspect = () => {};
  export let onProspectUpdated = () => {};

  $: membersById = Object.fromEntries(teamMembers.map((member) => [member.id, member]));

  function exportProspectsCsv() {
    downloadCsv(
      `lsp-prospects-${dateStamp()}.csv`,
      [
        "Name", "Type", "Stage", "Priority", "Fit", "Owner", "Next action",
        "Next action date", "Last contact", "Website", "Typical grant range",
        "Suggested ask",
      ],
      prospects.map((prospect) => [
        prospect.name,
        prospect.kind || "",
        prospect.stage || "",
        prospect.priority || "",
        prospect.fit_score || "",
        membersById[prospect.owner_id]?.full_name ||
          membersById[prospect.owner_id]?.email || "",
        prospect.next_action || "",
        prospect.next_action_date || "",
        prospect.last_contact_at || "",
        prospect.website || "",
        prospect.typical_grant_range || "",
        prospect.suggested_ask || "",
      ]),
    );
  }
</script>

{#if sub === "grants-pipeline"}
  <div class="flex justify-end">
    <Button
      size="sm"
      icon={Download}
      disabled={!prospects.length}
      title="Download all prospects as a CSV"
      onclick={exportProspectsCsv}
    >
      Export CSV
    </Button>
  </div>
  <ProspectsBoard
    {supabase}
    {prospects}
    {teamMembers}
    onSelect={onSelectProspect}
    {onProspectUpdated}
  />
{/if}
