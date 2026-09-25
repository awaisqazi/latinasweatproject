<script>
  // Gala 2025 archive: module root for this folder. Loads the frozen 2025
  // tables through the adapter (src/lib/dashboard/gala.js) and tabs between
  // the five read-only views below. Renders zero mutating controls and
  // never imports supabase-js directly: it only uses the `supabase` client
  // handed to it, exactly the way it is handed to every other admin module.
  //
  // NOT wired into any route or into GalaView.svelte yet (ticket ADM-03
  // mounts it). Drop-in usage once that ticket lands:
  //
  //   import ArchiveView from "./archive/ArchiveView.svelte";
  //   <ArchiveView {supabase} {profile} eventSlug="gala-2025" {refreshKey} />
  import { untrack } from "svelte";
  import { LayoutDashboard, HeartHandshake, UsersRound, ChartLine, Download, Lock } from "@lucide/svelte";
  import Tabs from "../../ui/Tabs.svelte";
  import Banner from "../../ui/Banner.svelte";
  import Badge from "../../ui/Badge.svelte";
  import EmptyState from "../../ui/EmptyState.svelte";
  import SkeletonCard from "../../ui/SkeletonCard.svelte";
  import ArchiveOverview from "./ArchiveOverview.svelte";
  import ArchiveDonors from "./ArchiveDonors.svelte";
  import ArchiveGuests from "./ArchiveGuests.svelte";
  import ArchiveTimeline from "./ArchiveTimeline.svelte";
  import ArchiveExport from "./ArchiveExport.svelte";
  import { loadArchive } from "../../../../lib/dashboard/gala.js";
  import { groupDonors } from "../../../../lib/dashboard/galaMath.js";

  let { supabase, profile = null, eventSlug = "gala-2025", refreshKey = 0 } = $props();

  let loading = $state(true);
  let errorMessage = $state("");
  let event = $state(null);
  let guests = $state.raw([]);
  let donations = $state.raw([]);
  let activeTab = $state("overview");

  const hasData = $derived(guests.length > 0 || donations.length > 0);
  const donorCount = $derived(hasData ? groupDonors(donations, guests).length : 0);

  const TABS = $derived([
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "donors", label: "Donors", icon: HeartHandshake, count: donorCount || undefined },
    { id: "guests", label: "Guests & paddles", icon: UsersRound, count: guests.length || undefined },
    { id: "timeline", label: "Timeline", icon: ChartLine },
    { id: "export", label: "Export", icon: Download },
  ]);

  async function load() {
    if (!supabase) {
      errorMessage = "Supabase is not configured for this dashboard.";
      loading = false;
      return;
    }
    loading = true;
    errorMessage = "";
    const { data, error } = await loadArchive(supabase, eventSlug);
    if (error) {
      errorMessage = error.message || "Could not load the Gala 2025 archive.";
      loading = false;
      return;
    }
    event = data.event;
    guests = data.guests;
    donations = data.donations;
    loading = false;
  }

  // Reload whenever the caller changes events or bumps the shell's refresh
  // counter (section 2 rule 3 of the plan). `load` itself never reads
  // `eventSlug`/`refreshKey` back, so there is nothing to untrack there, but
  // wrapping the call keeps the pattern consistent with the rest of the
  // module.
  $effect(() => {
    eventSlug;
    refreshKey;
    untrack(() => {
      load();
    });
  });
</script>

<section class="space-y-4" aria-labelledby="gala-archive-title">
  <div class="flex flex-col gap-3 rounded-card border border-ink/8 bg-white p-4 shadow-card md:flex-row md:items-center md:justify-between md:p-5">
    <div>
      <p class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">
        Past gala, read-only
      </p>
      <h3 id="gala-archive-title" class="mt-1 flex items-center gap-2 text-2xl font-bold">
        {event?.name || "Gala 2025"}
        <Badge tone="neutral" size="sm">
          <Lock class="h-3 w-3" aria-hidden="true" />
          Read-only archive
        </Badge>
      </h3>
    </div>
    <Tabs tabs={TABS} bind:active={activeTab} variant="segmented" label="Gala 2025 archive sections" hasPanels={false} />
  </div>

  <Banner tone="info" message="Gala 2025 is archived. Everything here is read-only." />

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} onRetry={load} />
  {:else if loading}
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {#each Array(4) as _, i (i)}
        <SkeletonCard lines={3} />
      {/each}
    </div>
  {:else if !hasData}
    <EmptyState
      title="No archived data yet"
      message="The Gala 2025 tables have no guests or donations to show. If this is unexpected, confirm the gala module grant and try again."
    />
  {:else if activeTab === "overview"}
    <ArchiveOverview {event} {guests} {donations} />
  {:else if activeTab === "donors"}
    <ArchiveDonors {guests} {donations} />
  {:else if activeTab === "guests"}
    <ArchiveGuests {guests} {donations} />
  {:else if activeTab === "timeline"}
    <ArchiveTimeline {donations} />
  {:else if activeTab === "export"}
    <ArchiveExport {event} {guests} {donations} />
  {/if}
</section>
