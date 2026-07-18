<script>
  // Shared outreach call lists ("Gala 2026 invites"): build a list from donor
  // segments, split it across teammates, and track each donor through
  // to contact → contacted → attending/declined. Assignees get one rolling
  // Workspace card per campaign (DB trigger), not one card per donor.
  import { onMount } from "svelte";
  import {
    Archive,
    ArchiveRestore,
    CalendarClock,
    Download,
    ExternalLink,
    Megaphone,
    Plus,
    Search,
    Trash2,
    UserRound,
    UsersRound,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import AddDonorsDrawer from "./AddDonorsDrawer.svelte";
  import {
    OUTREACH_STATUSES,
    assignOutreachItems,
    createOutreachCampaign,
    loadOutreachCampaigns,
    loadOutreachItems,
    removeOutreachItem,
    updateOutreachCampaign,
    updateOutreachItem,
  } from "../../../lib/dashboard/fundraisingCrm";
  import { dateStamp, downloadCsv, slugForFilename } from "../../../lib/dashboard/csv";

  export let supabase;
  export let profile = null;
  export let teamMembers = [];
  export let donorSummaries = [];
  export let donorProfiles = [];
  export let refreshKey = 0;
  export let onOpenDonor = () => {};
  export let onWorkspaceChanged = () => {};

  const CAMPAIGN_CONFLICT_MESSAGE =
    "Someone else just updated this campaign; the latest version has been loaded.";

  let campaigns = [];
  let campaignsLoading = true;
  let selectedCampaignId = "";
  let items = [];
  let itemsLoading = false;
  let errorMessage = "";
  let lastRefreshKey = refreshKey;

  let creatingCampaign = false;
  let newCampaignName = "";
  let newCampaignDescription = "";
  let newCampaignDueDate = "";
  let savingCampaign = false;

  let addDonorsOpen = false;
  let itemSearch = "";
  let statusFilter = "all";
  let assigneeFilter = "all";
  let bulkAssigneeId = "";
  let selectedItemIds = new Set();
  let busyItemIds = new Set();
  let bulkAssigning = false;

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    reloadCampaigns();
    if (selectedCampaignId) reloadItems(selectedCampaignId);
  }

  $: selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId) || null;
  $: campaignArchived = selectedCampaign?.status === "archived";
  $: activeCampaigns = campaigns.filter((campaign) => campaign.status === "active");
  $: archivedCampaigns = campaigns.filter((campaign) => campaign.status === "archived");
  $: existingEmails = new Set(items.map((item) => item.donor_email));
  $: statusCounts = countByStatus(items);
  $: filteredItems = filterItems(items, itemSearch, statusFilter, assigneeFilter);
  $: assigneeSummary = summarizeAssignees(items, teamMembers);
  $: allFilteredSelected =
    filteredItems.length > 0 && filteredItems.every((item) => selectedItemIds.has(item.id));

  onMount(() => {
    reloadCampaigns();
  });

  async function reloadCampaigns() {
    campaignsLoading = true;
    const { data, error } = await loadOutreachCampaigns(supabase);
    if (error) {
      errorMessage = error.message;
    } else {
      campaigns = data || [];
      if (selectedCampaignId && !campaigns.some((c) => c.id === selectedCampaignId)) {
        selectedCampaignId = "";
        items = [];
      }
    }
    campaignsLoading = false;
  }

  async function reloadItems(campaignId) {
    itemsLoading = true;
    const { data, error } = await loadOutreachItems(supabase, campaignId);
    if (selectedCampaignId !== campaignId) return;
    if (error) {
      errorMessage = error.message;
    } else {
      items = data || [];
      selectedItemIds = new Set(
        [...selectedItemIds].filter((id) => items.some((item) => item.id === id)),
      );
    }
    itemsLoading = false;
  }

  function openCampaign(campaign) {
    selectedCampaignId = campaign.id;
    itemSearch = "";
    statusFilter = "all";
    assigneeFilter = "all";
    selectedItemIds = new Set();
    errorMessage = "";
    reloadItems(campaign.id);
  }

  async function handleCreateCampaign(event) {
    event.preventDefault();
    if (savingCampaign) return;
    if (!newCampaignName.trim()) {
      errorMessage = "Give the campaign a name first.";
      return;
    }

    savingCampaign = true;
    errorMessage = "";

    const { data, error } = await createOutreachCampaign(supabase, {
      name: newCampaignName,
      description: newCampaignDescription,
      dueDate: newCampaignDueDate,
    });

    savingCampaign = false;

    if (error) {
      errorMessage = error.message;
      return;
    }

    campaigns = [data, ...campaigns];
    creatingCampaign = false;
    newCampaignName = "";
    newCampaignDescription = "";
    newCampaignDueDate = "";
    openCampaign(data);
  }

  async function setCampaignStatus(campaign, status) {
    errorMessage = "";
    const { data, error } = await updateOutreachCampaign(supabase, campaign, { status });

    if (error) {
      errorMessage = error.message;
      return;
    }
    if (!data) {
      errorMessage = CAMPAIGN_CONFLICT_MESSAGE;
      await reloadCampaigns();
      return;
    }

    campaigns = campaigns.map((c) => (c.id === data.id ? data : c));
    onWorkspaceChanged();
  }

  function countByStatus(list) {
    const counts = {};
    for (const option of OUTREACH_STATUSES) counts[option.value] = 0;
    for (const item of list) counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }

  function filterItems(list, search, status, assignee) {
    const query = search.trim().toLowerCase();
    let result = list;

    if (status !== "all") result = result.filter((item) => item.status === status);
    if (assignee === "unassigned") {
      result = result.filter((item) => !item.assignee_id);
    } else if (assignee !== "all") {
      result = result.filter((item) => item.assignee_id === assignee);
    }
    if (query) {
      result = result.filter((item) =>
        [item.donor_name, item.donor_email]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      );
    }
    return result;
  }

  function summarizeAssignees(list, members) {
    const byId = new Map();
    for (const item of list) {
      const key = item.assignee_id || "unassigned";
      if (!byId.has(key)) byId.set(key, { total: 0, remaining: 0 });
      const entry = byId.get(key);
      entry.total += 1;
      if (item.status === "to_contact") entry.remaining += 1;
    }

    return [...byId.entries()].map(([id, counts]) => {
      const member = members.find((person) => person.id === id);
      return {
        id,
        label:
          id === "unassigned"
            ? "Unassigned"
            : member?.full_name || member?.email || "Former teammate",
        ...counts,
      };
    });
  }

  function toggleItemSelected(itemId) {
    const next = new Set(selectedItemIds);
    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    selectedItemIds = next;
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      selectedItemIds = new Set();
    } else {
      selectedItemIds = new Set(filteredItems.map((item) => item.id));
    }
  }

  async function handleBulkAssign() {
    if (!selectedItemIds.size || bulkAssigning) return;

    bulkAssigning = true;
    errorMessage = "";

    const { data, error } = await assignOutreachItems(
      supabase,
      [...selectedItemIds],
      bulkAssigneeId || null,
    );

    bulkAssigning = false;

    if (error) {
      errorMessage = error.message;
      return;
    }

    mergeItems(data);
    selectedItemIds = new Set();
    onWorkspaceChanged();
  }

  async function handleItemUpdate(item, updates) {
    busyItemIds = new Set(busyItemIds).add(item.id);
    errorMessage = "";

    const { data, error } = await updateOutreachItem(supabase, item, updates);

    const nextBusy = new Set(busyItemIds);
    nextBusy.delete(item.id);
    busyItemIds = nextBusy;

    if (error) {
      errorMessage = error.message;
      // Re-sync so the row's selects snap back to what's actually saved.
      await reloadItems(selectedCampaignId);
      return;
    }
    if (!data) {
      errorMessage = "Someone else just updated that donor's row; the list has been refreshed.";
      await reloadItems(selectedCampaignId);
      return;
    }

    mergeItems([data]);
    onWorkspaceChanged();
  }

  async function handleRemoveItem(item) {
    busyItemIds = new Set(busyItemIds).add(item.id);
    errorMessage = "";

    const { error } = await removeOutreachItem(supabase, item.id);

    const nextBusy = new Set(busyItemIds);
    nextBusy.delete(item.id);
    busyItemIds = nextBusy;

    if (error) {
      errorMessage = error.message;
      return;
    }

    items = items.filter((existing) => existing.id !== item.id);
    onWorkspaceChanged();
  }

  function mergeItems(updated) {
    const byId = new Map(updated.map((item) => [item.id, item]));
    items = items.map((item) => byId.get(item.id) || item);
  }

  function handleDonorsAdded(added) {
    items = [...items, ...added].sort((a, b) =>
      (a.donor_name || a.donor_email).localeCompare(b.donor_name || b.donor_email),
    );
    onWorkspaceChanged();
  }

  function openDonorFromItem(item) {
    const summary = donorSummaries.find((donor) => donor.email === item.donor_email);
    onOpenDonor(
      summary || { email: item.donor_email, donor_name: item.donor_name },
    );
  }

  function statusOption(value) {
    return OUTREACH_STATUSES.find((option) => option.value === value) || OUTREACH_STATUSES[0];
  }

  function assigneeLabel(assigneeId) {
    if (!assigneeId) return "";
    const member = teamMembers.find((person) => person.id === assigneeId);
    return member?.full_name || member?.email || "Former teammate";
  }

  // Exports whatever the filters currently show; clear them for the full list.
  function exportItemsCsv() {
    downloadCsv(
      `lsp-outreach-${slugForFilename(selectedCampaign?.name)}-${dateStamp()}.csv`,
      ["Donor", "Email", "Status", "Assigned to", "Status changed", "Added"],
      filteredItems.map((item) => [
        item.donor_name || "",
        item.donor_email,
        statusOption(item.status).label,
        assigneeLabel(item.assignee_id),
        item.status_changed_at || "",
        item.created_at || "",
      ]),
    );
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }
</script>

{#if errorMessage}
  <Banner tone="error" message={errorMessage} />
{/if}

{#if !selectedCampaign}
  <Panel title="Outreach campaigns" id="fundraising-outreach-title" loading={campaignsLoading}>
    <p class="mb-4 text-sm leading-6 text-ink/60">
      Build a call list from donor segments, split it across the team, and
      watch progress in one place. Assignees see their queue in their
      Workspace automatically.
    </p>

    {#if creatingCampaign}
      <form class="mb-5 space-y-3 rounded-card border border-ink/10 bg-canvas/50 p-4" onsubmit={handleCreateCampaign}>
        <Field label="Campaign name" id="outreach-name" required>
          <input
            id="outreach-name"
            type="text"
            class="input"
            placeholder="e.g. Gala 2026 invites"
            required
            bind:value={newCampaignName}
          />
        </Field>
        <Field label="What's the goal?" id="outreach-description">
          <textarea
            id="outreach-description"
            class="textarea"
            rows="2"
            placeholder="Optional context for the team"
            bind:value={newCampaignDescription}
          ></textarea>
        </Field>
        <Field label="Finish by" id="outreach-due">
          <input id="outreach-due" type="date" class="input" bind:value={newCampaignDueDate} />
        </Field>
        <div class="grid grid-cols-2 gap-2">
          <Button variant="secondary" class="w-full" onclick={() => (creatingCampaign = false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" class="w-full" loading={savingCampaign}>
            Create campaign
          </Button>
        </div>
      </form>
    {:else}
      <Button variant="primary" icon={Plus} class="mb-5" onclick={() => (creatingCampaign = true)}>
        New campaign
      </Button>
    {/if}

    {#if activeCampaigns.length}
      <div class="space-y-2">
        {#each activeCampaigns as campaign (campaign.id)}
          <button
            type="button"
            class="flex w-full flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40 hover:shadow-card"
            onclick={() => openCampaign(campaign)}
          >
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-ink" aria-hidden="true">
              <Megaphone class="h-4.5 w-4.5" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-bold leading-snug text-ink">{campaign.name}</span>
              {#if campaign.description}
                <span class="mt-0.5 block truncate text-xs text-ink/55">{campaign.description}</span>
              {/if}
            </span>
            {#if campaign.due_date}
              <Badge tone="neutral" size="xs">
                <CalendarClock class="h-3 w-3" aria-hidden="true" />
                {formatDate(campaign.due_date)}
              </Badge>
            {/if}
          </button>
        {/each}
      </div>
    {:else if !creatingCampaign}
      <EmptyState
        icon={Megaphone}
        title="No active campaigns"
        message="Create one to start assigning donor outreach, e.g. Gala 2026 invites."
      />
    {/if}

    {#if archivedCampaigns.length}
      <details class="mt-5">
        <summary class="cursor-pointer text-sm font-bold text-ink/60">
          Archived ({archivedCampaigns.length})
        </summary>
        <div class="mt-2 space-y-2">
          {#each archivedCampaigns as campaign (campaign.id)}
            <div class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-canvas/50 px-4 py-3">
              <span class="min-w-0 flex-1 truncate font-semibold text-ink/60">{campaign.name}</span>
              <Button size="sm" icon={ExternalLink} onclick={() => openCampaign(campaign)}>
                View
              </Button>
              <Button
                size="sm"
                icon={ArchiveRestore}
                onclick={() => setCampaignStatus(campaign, "active")}
              >
                Reactivate
              </Button>
            </div>
          {/each}
        </div>
      </details>
    {/if}
  </Panel>
{:else}
  <Panel id="fundraising-outreach-campaign-title" padded={true}>
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <button
          type="button"
          class="text-xs font-bold uppercase tracking-[0.12em] text-accent-strong hover:underline"
          onclick={() => (selectedCampaignId = "")}
        >
          ← All campaigns
        </button>
        <h4 class="mt-1 truncate text-xl font-bold text-ink" id="fundraising-outreach-campaign-title">
          {selectedCampaign.name}
        </h4>
        {#if selectedCampaign.description}
          <p class="mt-1 text-sm leading-6 text-ink/60">{selectedCampaign.description}</p>
        {/if}
        <div class="mt-2 flex flex-wrap gap-2">
          {#if selectedCampaign.status === "archived"}
            <Badge tone="neutral">Archived</Badge>
          {/if}
          {#if selectedCampaign.due_date}
            <Badge tone="neutral">
              <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
              Finish by {formatDate(selectedCampaign.due_date)}
            </Badge>
          {/if}
          {#each OUTREACH_STATUSES as option (option.value)}
            {#if statusCounts[option.value]}
              <Badge tone={option.tone} size="xs">
                {statusCounts[option.value]} {option.label.toLowerCase()}
              </Badge>
            {/if}
          {/each}
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <Button
          icon={Download}
          disabled={!filteredItems.length}
          title="Download the current list (with filters applied) as a CSV"
          onclick={exportItemsCsv}
        >
          Export CSV
        </Button>
        {#if campaignArchived}
          <Button
            icon={ArchiveRestore}
            onclick={() => setCampaignStatus(selectedCampaign, "active")}
          >
            Reactivate
          </Button>
        {:else}
          <Button variant="primary" icon={UsersRound} onclick={() => (addDonorsOpen = true)}>
            Add donors
          </Button>
          <Button
            icon={Archive}
            title="Archive this campaign"
            onclick={() => setCampaignStatus(selectedCampaign, "archived")}
          >
            Archive
          </Button>
        {/if}
      </div>
    </div>

    {#if campaignArchived}
      <p class="mb-4 rounded-control border border-ink/10 bg-canvas/60 px-3 py-2.5 text-sm font-semibold text-ink/60">
        This campaign is archived: assignments here no longer reach anyone's
        Workspace. Reactivate it to keep working the list.
      </p>
    {/if}

    {#if assigneeSummary.length}
      <div class="mb-4 flex flex-wrap gap-2">
        {#each assigneeSummary as entry (entry.id)}
          <span class="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-canvas/60 px-3 py-1 text-xs font-semibold text-ink/70">
            <UserRound class="h-3.5 w-3.5 text-ink/40" aria-hidden="true" />
            {entry.label}: {entry.total - entry.remaining}/{entry.total} handled
          </span>
        {/each}
      </div>
    {/if}

    <div class="mb-3 grid gap-3 rounded-card border border-ink/8 bg-canvas/70 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <label class="relative block sm:col-span-2 lg:col-span-1">
        <span class="sr-only">Search donors in this campaign</span>
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" aria-hidden="true" />
        <input type="search" class="input pl-9" placeholder="Search name or email" bind:value={itemSearch} />
      </label>
      <label>
        <span class="sr-only">Filter by status</span>
        <select class="select" bind:value={statusFilter} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {#each OUTREACH_STATUSES as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
      <label>
        <span class="sr-only">Filter by assignee</span>
        <select class="select" bind:value={assigneeFilter} aria-label="Filter by assignee">
          <option value="all">Everyone</option>
          <option value="unassigned">Unassigned</option>
          {#each teamMembers as member (member.id)}
            <option value={member.id}>{member.full_name || member.email}</option>
          {/each}
        </select>
      </label>
      <div class="flex items-center gap-2">
        <select
          class="select"
          bind:value={bulkAssigneeId}
          aria-label="Assign selected donors to"
          disabled={campaignArchived}
        >
          <option value="">Assign selected to…</option>
          {#each teamMembers as member (member.id)}
            <option value={member.id}>
              {member.full_name || member.email}{member.id === profile?.id ? " (me)" : ""}
            </option>
          {/each}
        </select>
        <Button
          size="sm"
          variant="primary"
          loading={bulkAssigning}
          disabled={campaignArchived || !selectedItemIds.size || !bulkAssigneeId}
          onclick={handleBulkAssign}
        >
          Assign {selectedItemIds.size || ""}
        </Button>
      </div>
    </div>

    {#if itemsLoading}
      <p class="py-6 text-center text-sm text-ink/55">Loading the list…</p>
    {:else if filteredItems.length}
      <label class="mb-2 flex items-center gap-2 px-1 text-xs font-semibold text-ink/55">
        <input
          type="checkbox"
          class="checkbox"
          checked={allFilteredSelected}
          onchange={toggleSelectAllFiltered}
        />
        Select all {filteredItems.length} shown
      </label>

      <div class="space-y-2">
        {#each filteredItems as item (item.id)}
          <article class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-3 py-2.5">
            <input
              type="checkbox"
              class="checkbox"
              checked={selectedItemIds.has(item.id)}
              onchange={() => toggleItemSelected(item.id)}
              aria-label={`Select ${item.donor_name || item.donor_email}`}
            />
            <button
              type="button"
              class="min-w-0 flex-1 text-left"
              onclick={() => openDonorFromItem(item)}
            >
              <span class="block truncate text-sm font-bold leading-snug text-ink hover:underline">
                {item.donor_name || item.donor_email}
              </span>
              <span class="mt-0.5 block truncate text-xs text-ink/50">{item.donor_email}</span>
            </button>

            <Badge tone={statusOption(item.status).tone} size="xs">
              {statusOption(item.status).label}
            </Badge>

            <select
              class="select w-36"
              value={item.status}
              disabled={busyItemIds.has(item.id)}
              aria-label={`Status for ${item.donor_name || item.donor_email}`}
              onchange={(event) => handleItemUpdate(item, { status: event.currentTarget.value })}
            >
              {#each OUTREACH_STATUSES as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>

            <select
              class="select w-40"
              value={item.assignee_id || ""}
              disabled={busyItemIds.has(item.id) || campaignArchived}
              aria-label={`Assignee for ${item.donor_name || item.donor_email}`}
              onchange={(event) =>
                handleItemUpdate(item, { assignee_id: event.currentTarget.value || null })}
            >
              <option value="">Unassigned</option>
              {#each teamMembers as member (member.id)}
                <option value={member.id}>{member.full_name || member.email}</option>
              {/each}
            </select>

            <Button
              size="sm"
              iconOnly
              icon={Trash2}
              label={`Remove ${item.donor_name || item.donor_email} from this campaign`}
              loading={busyItemIds.has(item.id)}
              onclick={() => handleRemoveItem(item)}
            />
          </article>
        {/each}
      </div>
    {:else if items.length}
      <EmptyState title="No matches" message="Try different filters or a different search." />
    {:else}
      <EmptyState
        icon={UsersRound}
        title="No donors on this list yet"
        message={'Use "Add donors" to pull in a segment, e.g. everyone who gave to a past gala.'}
      />
    {/if}
  </Panel>
{/if}

<AddDonorsDrawer
  {supabase}
  open={addDonorsOpen}
  campaign={selectedCampaign}
  {donorSummaries}
  {donorProfiles}
  {teamMembers}
  profileId={profile?.id || ""}
  {existingEmails}
  onClose={() => (addDonorsOpen = false)}
  onAdded={handleDonorsAdded}
/>
