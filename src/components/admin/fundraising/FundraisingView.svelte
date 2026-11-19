<script context="module">
  // The last sub-tab opened under each top-level tab, for this browser
  // session (and across leaving and coming back to Fundraising).
  const SUB_TAB_STORAGE_KEY = "lsp-fundraising-subtabs";
  const memory = { subTabs: null };
</script>

<script>
  import { onMount } from "svelte";
  import {
    CalendarDays,
    GraduationCap,
    LayoutDashboard,
    Target,
    UsersRound,
  } from "@lucide/svelte";
  import Banner from "../ui/Banner.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import DonorDrawer from "./DonorDrawer.svelte";
  import DonorEngagementTab from "./DonorEngagementTab.svelte";
  import EventsTab from "./EventsTab.svelte";
  import FundraisingLiveOverview from "./FundraisingLiveOverview.svelte";
  import GrantsTab from "./GrantsTab.svelte";
  import LiveData from "./live/LiveData.svelte";
  import FollowUpData from "./subcommittee/FollowUpData.svelte";
  import ProspectDrawer from "./ProspectDrawer.svelte";
  import SubcommitteeHeader from "./SubcommitteeHeader.svelte";
  import WorkshopsTab from "./WorkshopsTab.svelte";
  import SubcommitteeWorksheet from "./worksheets/SubcommitteeWorksheet.svelte";
  import {
    loadCampaignSummaries,
    loadDonationsSince,
    loadDonorSummaries,
    loadProspects,
  } from "../../../lib/dashboard/fundraising";
  import {
    loadPendingFundraiserCount,
    resolveGivingCampaignSlug,
  } from "../../../lib/dashboard/givingAdmin";
  import {
    loadDonorProfiles,
    loadOutreachCampaigns,
    loadTemplates,
  } from "../../../lib/dashboard/fundraisingCrm";
  import { subcommitteeById } from "../../../data/fundraisingSubcommittees.js";

  export let supabase;
  export let profile = null;
  export let teamMembers = [];
  export let refreshKey = 0;
  export let onAssignTask = () => {};
  export let onWorkspaceChanged = () => {};

  const WORKSHEET_CYCLE = "2027";
  const TOP_TAB_ICONS = {
    donors: UsersRound,
    grants: Target,
    events: CalendarDays,
    upskilling: GraduationCap,
  };
  const TABS = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    ...["donors", "grants", "events", "upskilling"].map((id) => ({
      id,
      label: subcommitteeById(id)?.tabLabel || id,
      icon: TOP_TAB_ICONS[id],
    })),
  ];
  // Sub-tab ids carry their top tab's id so no two tab buttons share a DOM id.
  const SUB_TABS = {
    donors: [
      { id: "donors-thanks", label: "Thank-yous" },
      { id: "donors-list", label: "Donors" },
      { id: "donors-lapsed", label: "Lapsed" },
      { id: "donors-outreach", label: "Outreach" },
      { id: "donors-templates", label: "Templates" },
      { id: "donors-worksheet", label: "Worksheet" },
    ],
    grants: [
      { id: "grants-pipeline", label: "Pipeline" },
      { id: "grants-worksheet", label: "Worksheet" },
    ],
    events: [
      { id: "events-campaigns", label: "Campaigns" },
      { id: "events-giving", label: "Giving Tuesday" },
      { id: "events-calendar", label: "Calendar" },
      { id: "events-worksheet", label: "Worksheet" },
    ],
    upskilling: [
      { id: "upskilling-people", label: "People fundraising" },
      { id: "upskilling-worksheet", label: "Worksheet" },
    ],
  };
  const DEFAULT_SUB_TABS = Object.fromEntries(
    Object.entries(SUB_TABS).map(([top, tabs]) => [top, tabs[0].id]),
  );

  let activeTab = "overview";
  let subTabs = memory.subTabs || readStoredSubTabs();
  let donorSummaries = [];
  let campaignSummaries = [];
  let prospects = [];
  let last30Donations = [];
  let donorProfiles = [];
  let templates = [];
  let outreachCampaigns = [];
  let isLoading = true;
  let hasLoaded = false;
  let errorMessage = "";
  let lastRefreshKey = refreshKey;
  let selectedDonor = null;
  let selectedProspectId = "";
  let givingPendingCount = 0;
  let liveView = null;
  let followUps = null;
  // Grants > Pipeline "Overdue next step" quick filter; Next up turns it on.
  let grantsOverdueOnly = false;
  // Donor list filters live here so they survive sub-tab switches.
  let donorSearch = "";
  let donorSort = "total";
  let donorSegment = "all";
  let donorPage = 0;
  let galaEmails = null;

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadAll();
  }

  // Pending Giving Tuesday sign-ups badge both the Fundraising Events tab and
  // its Giving Tuesday sub-tab.
  $: tabsWithCounts = TABS.map((tab) =>
    tab.id === "events" ? { ...tab, count: givingPendingCount || undefined } : tab,
  );
  $: activeSubTabs = (SUB_TABS[activeTab] || []).map((tab) =>
    tab.id === "events-giving" ? { ...tab, count: givingPendingCount || undefined } : tab,
  );
  $: activeSub = subTabs[activeTab] || DEFAULT_SUB_TABS[activeTab] || "";
  $: isSubcommitteeTab = Boolean(SUB_TABS[activeTab]);
  $: onWorksheet = activeSub === `${activeTab}-worksheet`;
  $: selectedProspect =
    prospects.find((prospect) => prospect.id === selectedProspectId) || null;

  onMount(() => {
    loadAll();
  });

  function readStoredSubTabs() {
    const result = { ...DEFAULT_SUB_TABS };
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(SUB_TAB_STORAGE_KEY) || "{}");
      for (const [top, tabs] of Object.entries(SUB_TABS)) {
        if (tabs.some((tab) => tab.id === stored?.[top])) result[top] = stored[top];
      }
    } catch {
      // Private windows and blocked storage just start on the first sub-tab.
    }
    return result;
  }

  function setSubTab(top, id) {
    if (!SUB_TABS[top]?.some((tab) => tab.id === id)) return;
    subTabs = { ...subTabs, [top]: id };
    memory.subTabs = subTabs;
    try {
      window.sessionStorage.setItem(SUB_TAB_STORAGE_KEY, JSON.stringify(subTabs));
    } catch {
      // Remembered for this visit only.
    }
  }

  // Sub-tab ids are "<tab>-<subtab>" ("donors-thanks"); the short form the
  // attention targets use ("thanks") is accepted too.
  function resolveSubTab(top, sub) {
    const value = String(sub || "").trim();
    if (!value || !SUB_TABS[top]) return "";
    const id = value.startsWith(`${top}-`) ? value : `${top}-${value}`;
    return SUB_TABS[top].some((tab) => tab.id === id) ? id : "";
  }

  function openTab(top, sub = "") {
    if (!TABS.some((tab) => tab.id === top)) return;
    const id = resolveSubTab(top, sub);
    if (id) setSubTab(top, id);
    activeTab = top;
  }

  // From a subcommittee's Next up: open the tab and sub-tab, then the grant
  // or the overdue filter when the line asks for one.
  function openTarget(top, sub = "", options = {}) {
    if (options.overdueOnly) grantsOverdueOnly = true;
    openTab(top, sub);
    if (options.prospectId) selectedProspectId = options.prospectId;
  }

  async function loadAll() {
    if (!supabase) return;

    isLoading = true;
    errorMessage = "";

    const [
      donorsResult,
      campaignsResult,
      prospectsResult,
      recentResult,
      profilesResult,
      templatesResult,
      outreachResult,
      givingPendingResult,
    ] = await Promise.all([
      loadDonorSummaries(supabase),
      loadCampaignSummaries(supabase),
      loadProspects(supabase),
      loadDonationsSince(supabase, daysAgoDateKey(30)),
      loadDonorProfiles(supabase),
      loadTemplates(supabase),
      loadOutreachCampaigns(supabase),
      loadPendingFundraiserCount(supabase, resolveGivingCampaignSlug()),
    ]);

    const firstError =
      donorsResult.error ||
      campaignsResult.error ||
      prospectsResult.error ||
      recentResult.error ||
      profilesResult.error ||
      templatesResult.error ||
      outreachResult.error;
    if (firstError) errorMessage = firstError.message;

    if (!donorsResult.error) donorSummaries = donorsResult.data || [];
    if (!campaignsResult.error) campaignSummaries = campaignsResult.data || [];
    if (!prospectsResult.error) prospects = prospectsResult.data || [];
    if (!recentResult.error) last30Donations = recentResult.data || [];
    if (!profilesResult.error) donorProfiles = profilesResult.data || [];
    if (!templatesResult.error) templates = templatesResult.data || [];
    if (!outreachResult.error) outreachCampaigns = outreachResult.data || [];
    // A failed count only hides the badge; the tab itself reports its errors.
    if (!givingPendingResult.error) givingPendingCount = givingPendingResult.count;

    isLoading = false;
    hasLoaded = true;
  }

  async function reloadTemplates() {
    const { data, error } = await loadTemplates(supabase);
    if (!error) templates = data || [];
  }

  function daysAgoDateKey(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function openDonorByEmail(email) {
    const key = String(email || "").trim().toLowerCase();
    if (!key) return;
    selectedDonor =
      donorSummaries.find((donor) => String(donor.email || "").toLowerCase() === key) || { email: key };
  }

  function handleProspectUpdated(updated) {
    if (!updated?.id) return;
    let found = false;
    prospects = prospects.map((prospect) => {
      if (prospect.id !== updated.id) return prospect;
      found = true;
      return { ...prospect, ...updated };
    });
    if (!found) prospects = [updated, ...prospects];
    onWorkspaceChanged();
  }

  function handleProspectDeleted(deletedId) {
    prospects = prospects.filter((prospect) => prospect.id !== deletedId);
    if (selectedProspectId === deletedId) selectedProspectId = "";
    onWorkspaceChanged();
  }

  function handleDonorProfileSaved(saved) {
    let found = false;
    donorProfiles = donorProfiles.map((donorProfile) => {
      if (donorProfile.email !== saved.email) return donorProfile;
      found = true;
      return saved;
    });
    if (!found) donorProfiles = [saved, ...donorProfiles];
  }
</script>

<LiveData
  {supabase}
  {profile}
  {prospects}
  {donorProfiles}
  {outreachCampaigns}
  {refreshKey}
  bind:view={liveView}
/>

<FollowUpData {supabase} {refreshKey} bind:followUps />

<section class="space-y-4" aria-labelledby="fundraising-title">
  <div class="flex flex-col gap-3 rounded-card border border-ink/8 bg-white p-4 shadow-card md:flex-row md:items-center md:justify-between md:p-5">
    <div class="shrink-0">
      <h3 id="fundraising-title" class="text-2xl font-bold">Fundraising</h3>
      <p class="mt-0.5 text-sm text-ink/55">Donations, donors, and grant prospects in one place</p>
    </div>
    <div class="min-w-0">
      <Tabs tabs={tabsWithCounts} bind:active={activeTab} variant="segmented" label="Fundraising sections" hasPanels={false} />
    </div>
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} />
  {/if}

  {#if isSubcommitteeTab}
    <SubcommitteeHeader
      {supabase}
      committeeId={activeTab}
      view={liveView}
      {followUps}
      {teamMembers}
      {campaignSummaries}
      {last30Donations}
      subTabs={activeSubTabs}
      active={activeSub}
      onChange={(id) => setSubTab(activeTab, id)}
      onOpenProspect={(prospectId) => (selectedProspectId = prospectId)}
      onOpenTarget={openTarget}
    />
  {/if}

  {#if isSubcommitteeTab && onWorksheet}
    {#key activeTab}
      <SubcommitteeWorksheet {supabase} {profile} subcommitteeId={activeTab} cycle={WORKSHEET_CYCLE} />
    {/key}
  {:else if isLoading && !hasLoaded}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {#each Array(4) as _, i (i)}
        <SkeletonCard lines={2} />
      {/each}
    </div>
  {:else if activeTab === "overview"}
    <FundraisingLiveOverview
      {supabase}
      view={liveView}
      onOpenDonorEmail={openDonorByEmail}
      onOpenProspect={(prospectId) => (selectedProspectId = prospectId)}
      onOpenTab={(id, subId) => openTab(id, subId)}
      onOpenWorksheet={(id) => openTab(id, `${id}-worksheet`)}
    />
  {:else if activeTab === "donors"}
    <DonorEngagementTab
      sub={activeSub}
      {supabase}
      {profile}
      {teamMembers}
      {refreshKey}
      view={liveView}
      {followUps}
      {donorSummaries}
      {donorProfiles}
      {templates}
      bind:donorSearch
      bind:donorSort
      bind:donorSegment
      bind:donorPage
      bind:galaEmails
      onOpenDonor={(donor) => (selectedDonor = donor)}
      onOpenDonorEmail={openDonorByEmail}
      onTemplatesChanged={reloadTemplates}
      {onWorkspaceChanged}
    />
  {:else if activeTab === "grants"}
    <GrantsTab
      sub={activeSub}
      {supabase}
      {prospects}
      {teamMembers}
      onSelectProspect={(prospect) => (selectedProspectId = prospect.id)}
      onProspectUpdated={handleProspectUpdated}
      bind:overdueOnly={grantsOverdueOnly}
    />
  {:else if activeTab === "events"}
    <EventsTab
      sub={activeSub}
      {supabase}
      {profile}
      {teamMembers}
      {refreshKey}
      view={liveView}
      {campaignSummaries}
      {prospects}
      {donorProfiles}
      {outreachCampaigns}
      onPendingCount={(count) => (givingPendingCount = count)}
      onOpenProspect={(prospectId) => (selectedProspectId = prospectId)}
      onOpenDonorEmail={openDonorByEmail}
    />
  {:else if activeTab === "upskilling"}
    <WorkshopsTab
      sub={activeSub}
      view={liveView}
      onOpenGivingTuesday={() => openTab("events", "events-giving")}
      onOpenWorksheet={() => openTab("upskilling", "upskilling-worksheet")}
    />
  {/if}
</section>

<DonorDrawer
  {supabase}
  donor={selectedDonor}
  {teamMembers}
  {templates}
  currentUserId={profile?.id || ""}
  currentUserName={profile?.full_name || profile?.email || ""}
  {onAssignTask}
  onProfileSaved={handleDonorProfileSaved}
  {onWorkspaceChanged}
  onClose={() => (selectedDonor = null)}
/>

<ProspectDrawer
  {supabase}
  prospect={selectedProspect}
  {teamMembers}
  currentUserRole={profile?.role || "member"}
  {onAssignTask}
  onClose={() => (selectedProspectId = "")}
  onProspectUpdated={handleProspectUpdated}
  onProspectDeleted={handleProspectDeleted}
/>
