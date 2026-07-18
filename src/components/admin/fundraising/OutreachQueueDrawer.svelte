<script>
  // "My outreach queue": what a Workspace rollup card opens. Shows just this
  // person's donors for one campaign so they can work the list (set status,
  // jump into a donor) without leaving wherever they are.
  import { CalendarClock, Megaphone, UserRound } from "@lucide/svelte";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import {
    OUTREACH_STATUSES,
    loadMyOutreachQueue,
    updateOutreachItem,
  } from "../../../lib/dashboard/fundraisingCrm";

  export let supabase;
  export let campaignId = "";
  export let profileId = "";
  export let refreshKey = 0;
  export let onOpenDonor = () => {};
  export let onChanged = () => {};
  export let onClose = () => {};

  let displayedCampaignId = "";
  let lastRefreshKey = refreshKey;
  let drawerOpen = false;
  let campaign = null;
  let items = [];
  let isLoading = false;
  let errorMessage = "";
  let busyItemIds = new Set();

  $: if (campaignId && campaignId !== displayedCampaignId) {
    openDrawer(campaignId);
  } else if (!campaignId && drawerOpen) {
    drawerOpen = false;
  }
  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    if (displayedCampaignId) loadQueue(displayedCampaignId);
  }
  $: remaining = items.filter((item) => item.status === "to_contact").length;

  function openDrawer(nextCampaignId) {
    displayedCampaignId = nextCampaignId;
    errorMessage = "";
    drawerOpen = true;
    loadQueue(nextCampaignId);
  }

  function requestClose() {
    drawerOpen = false;
  }

  function handleClosed() {
    drawerOpen = false;
    displayedCampaignId = "";
    campaign = null;
    items = [];
    onClose();
  }

  async function loadQueue(id) {
    isLoading = true;
    campaign = null;
    items = [];

    const [campaignResult, itemsResult] = await Promise.all([
      supabase
        .from("fundraising_outreach_campaigns")
        .select("id,name,description,due_date,status")
        .eq("id", id)
        .maybeSingle(),
      loadMyOutreachQueue(supabase, id, profileId),
    ]);

    if (displayedCampaignId !== id) return;

    if (campaignResult.error) {
      errorMessage = campaignResult.error.message;
    } else {
      campaign = campaignResult.data;
    }
    if (itemsResult.error) {
      errorMessage = errorMessage || itemsResult.error.message;
    } else {
      items = itemsResult.data || [];
    }

    isLoading = false;
  }

  async function handleStatusChange(item, status) {
    busyItemIds = new Set(busyItemIds).add(item.id);
    errorMessage = "";

    const { data, error } = await updateOutreachItem(supabase, item, { status });

    const nextBusy = new Set(busyItemIds);
    nextBusy.delete(item.id);
    busyItemIds = nextBusy;

    if (error) {
      errorMessage = error.message;
      // Re-sync so the select snaps back to what's actually saved.
      await loadQueue(displayedCampaignId);
      return;
    }
    if (!data) {
      errorMessage = "Someone else just updated that donor's row; the list has been refreshed.";
      await loadQueue(displayedCampaignId);
      return;
    }

    items = items.map((existing) => (existing.id === data.id ? data : existing));
    onChanged();
  }

  async function handleOpenDonor(item) {
    const opened = await onOpenDonor(item);
    if (opened === false) {
      errorMessage =
        "That donor couldn't be opened right now. Check your connection and try again.";
    }
  }

  function statusOption(value) {
    return OUTREACH_STATUSES.find((option) => option.value === value) || OUTREACH_STATUSES[0];
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

<SlideOver
  open={drawerOpen}
  title={campaign?.name || "Outreach queue"}
  eyebrow="My outreach queue"
  closeLabel="Close outreach queue"
  onClose={requestClose}
  onClosed={handleClosed}
>
  <div class="space-y-4 px-5 py-5">
    {#if errorMessage}
      <Banner tone="error" message={errorMessage} />
    {/if}

    {#if isLoading}
      <p class="text-sm text-ink/55">Loading your queue…</p>
    {:else}
      <div class="flex flex-wrap gap-2">
        <Badge tone={remaining ? "amber" : "green"}>
          {items.length - remaining} of {items.length} handled
        </Badge>
        {#if campaign?.due_date}
          <Badge tone="neutral">
            <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
            Finish by {formatDate(campaign.due_date)}
          </Badge>
        {/if}
      </div>

      {#if campaign?.description}
        <p class="text-sm leading-6 text-ink/60">{campaign.description}</p>
      {/if}

      {#if items.length}
        <div class="space-y-2">
          {#each items as item (item.id)}
            <article class="rounded-control border border-ink/8 bg-white px-3 py-2.5">
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="min-w-0 flex-1 text-left"
                  onclick={() => handleOpenDonor(item)}
                >
                  <span class="block truncate text-sm font-bold leading-snug text-ink hover:underline">
                    {item.donor_name || item.donor_email}
                  </span>
                  <span class="mt-0.5 block truncate text-xs text-ink/50">{item.donor_email}</span>
                </button>
                <Badge tone={statusOption(item.status).tone} size="xs">
                  {statusOption(item.status).label}
                </Badge>
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <select
                  class="select flex-1"
                  value={item.status}
                  disabled={busyItemIds.has(item.id)}
                  aria-label={`Status for ${item.donor_name || item.donor_email}`}
                  onchange={(event) => handleStatusChange(item, event.currentTarget.value)}
                >
                  {#each OUTREACH_STATUSES as option (option.value)}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
                <Button size="sm" icon={UserRound} onclick={() => handleOpenDonor(item)}>
                  Open donor
                </Button>
              </div>
            </article>
          {/each}
        </div>
        <p class="text-xs leading-5 text-ink/50">
          Opening a donor gives you their history, templates, and contact log.
          Logging a template send moves them to "contacted" automatically.
        </p>
      {:else}
        <EmptyState
          icon={Megaphone}
          title="Nothing assigned to you here"
          message="This campaign has no donors assigned to you right now."
        />
      {/if}
    {/if}

    <Button variant="secondary" class="w-full" onclick={requestClose}>Close</Button>
  </div>
</SlideOver>
