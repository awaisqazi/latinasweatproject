<script>
  // Time Clock module shell. The studio iPad kiosk owns the punch data; this
  // view is the remote control for it — timesheets, roster edits, the
  // check-in messages the kiosk shows, and historical CSV import.
  //
  // The roster is loaded once here because every tab needs it (the timesheet
  // drawer, the message targeting select, the import matcher). Each tab loads
  // its own heavier data and follows the same refreshKey contract.
  import { onMount } from "svelte";
  import { CalendarClock, LayoutDashboard, Megaphone, Upload, Users } from "@lucide/svelte";
  import Banner from "../ui/Banner.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import OverviewTab from "./OverviewTab.svelte";
  import TimesheetsTab from "./TimesheetsTab.svelte";
  import RosterTab from "./RosterTab.svelte";
  import MessagesTab from "./MessagesTab.svelte";
  import ImportTab from "./ImportTab.svelte";
  import { EMPLOYEE_COLUMNS } from "../../../lib/dashboard/timeclock";

  export let supabase;
  export let profile = null;
  export let refreshKey = 0;

  const TABS = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "timesheets", label: "Timesheets", icon: CalendarClock },
    { id: "roster", label: "Roster", icon: Users },
    { id: "messages", label: "Messages", icon: Megaphone },
    { id: "import", label: "Import", icon: Upload },
  ];

  let activeTab = "overview";
  let employees = [];
  let isLoading = true;
  let errorMessage = "";
  let lastRefreshKey = refreshKey;
  // Bumped by child mutations so sibling tabs reload their own slices too.
  let localRefreshKey = 0;

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadAll();
  }

  // Both counters only ever increase, so the sum changes exactly when either
  // does — that is all the tabs' refreshKey guards need.
  $: tabRefreshKey = refreshKey + localRefreshKey;

  onMount(loadAll);

  async function loadAll() {
    if (!supabase) return;
    isLoading = true;
    errorMessage = "";

    // Tombstones stay in the table for the kiosk to converge on; the portal
    // never shows them.
    const { data, error } = await supabase
      .from("timeclock_employees")
      .select(EMPLOYEE_COLUMNS)
      .is("deleted_at", null)
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true });

    if (error) errorMessage = error.message;
    else employees = data || [];

    isLoading = false;
  }

  // A child changed something the whole module can see: reload the roster and
  // nudge every tab.
  function handleDataChanged() {
    localRefreshKey += 1;
    loadAll();
  }
</script>

<section class="space-y-4" aria-labelledby="time-clock-title">
  <div class="flex flex-col gap-3 rounded-card border border-ink/8 bg-white p-4 shadow-card md:flex-row md:items-center md:justify-between md:p-5">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">
        Studio check-ins, timesheets, and kiosk messages
      </p>
      <h3 id="time-clock-title" class="mt-1 text-2xl font-bold">Time Clock</h3>
    </div>
    <Tabs
      tabs={TABS}
      bind:active={activeTab}
      variant="segmented"
      label="Time Clock sections"
      hasPanels={false}
    />
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} onRetry={loadAll} />
  {/if}

  {#if activeTab === "overview"}
    <OverviewTab
      {supabase}
      {employees}
      refreshKey={tabRefreshKey}
      rosterLoading={isLoading}
      onChanged={handleDataChanged}
    />
  {:else if activeTab === "timesheets"}
    <TimesheetsTab
      {supabase}
      {employees}
      refreshKey={tabRefreshKey}
      onChanged={handleDataChanged}
    />
  {:else if activeTab === "roster"}
    <RosterTab
      {supabase}
      {employees}
      loading={isLoading}
      onChanged={handleDataChanged}
    />
  {:else if activeTab === "messages"}
    <MessagesTab
      {supabase}
      {profile}
      {employees}
      refreshKey={tabRefreshKey}
      onChanged={handleDataChanged}
    />
  {:else if activeTab === "import"}
    <ImportTab
      {supabase}
      {profile}
      {employees}
      refreshKey={tabRefreshKey}
      onImported={handleDataChanged}
    />
  {/if}
</section>
