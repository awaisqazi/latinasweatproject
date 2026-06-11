<script>
  import { onMount } from "svelte";
  import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    KeyRound,
    Megaphone,
    Plus,
    Search,
    UsersRound,
    Wrench,
  } from "@lucide/svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import Badge from "../ui/Badge.svelte";
  import ShiftEditorDrawer from "./ShiftEditorDrawer.svelte";
  import OpportunityEditorDrawer from "./OpportunityEditorDrawer.svelte";
  import BulkShiftTools from "./BulkShiftTools.svelte";
  import VolunteerLookup from "./VolunteerLookup.svelte";
  import DayRosterView from "./DayRosterView.svelte";
  import ComplianceView from "./ComplianceView.svelte";
  import {
    addDaysStr,
    buildWeekDays,
    categoryLabel,
    composeLocalIso,
    findOperationalOverlaps,
    formatShortDate,
    formatTimeRange,
    getWeekStartStr,
    isOverlapError,
    parseDateStr,
    shiftLabel,
    toDateStr,
  } from "../../../lib/dashboard/volunteersAdmin.js";

  export let supabase;
  export let profile = null;
  export let refreshKey = 0;

  const shiftColumns =
    "id, kind, category, title, description, location, starts_at, ends_at, lead_capacity, volunteer_capacity, cancelled, created_at, updated_at";

  let weekStartStr = getWeekStartStr();
  let weekShifts = [];
  let isLoadingWeek = true;
  let errorMessage = "";

  let opportunities = [];
  let isLoadingOpportunities = true;

  let checkInsToday = 0;

  let selectedShift = null;
  let editingOpportunity = null;

  let showCreateForm = false;
  let newShiftDate = "";
  let newShiftTime = "18:00";
  let newShiftDuration = 60;
  let newShiftLeadCap = 1;
  let newShiftVolCap = 2;
  let isCreatingShift = false;
  let createError = "";

  // Module tabs: search, compliance, and bulk tools are first-class sections
  // instead of being buried behind toggle buttons.
  let activeTab = "schedule";
  let complianceVisited = false;
  $: if (activeTab === "compliance") complianceVisited = true;

  const moduleTabs = [
    { id: "schedule", label: "Schedule", icon: CalendarDays },
    { id: "volunteers", label: "Volunteers", icon: Search },
    { id: "compliance", label: "Compliance", icon: ClipboardCheck },
    { id: "tools", label: "Tools", icon: Wrench },
  ];


  let lastRefreshKey = refreshKey;
  let lastLoadedWeek = "";
  let mounted = false;

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadAll();
  }
  $: if (mounted && weekStartStr && weekStartStr !== lastLoadedWeek && supabase) {
    loadWeek();
  }

  $: weekDays = buildWeekDays(weekShifts, weekStartStr);
  $: activeWeekShifts = weekShifts.filter((shift) => !shift.cancelled);
  $: openSpotsThisWeek = activeWeekShifts.reduce((sum, shift) => {
    return (
      sum +
      Math.max(0, shift.lead_capacity - shift.leadCount) +
      Math.max(0, shift.volunteer_capacity - shift.volunteerCount)
    );
  }, 0);
  $: weekRangeLabel = `${formatShortDate(parseDateStr(weekStartStr))} - ${formatShortDate(parseDateStr(addDaysStr(weekStartStr, 6)))}`;

  onMount(() => {
    mounted = true;
    loadAll();
  });

  function loadAll() {
    lastLoadedWeek = "";
    loadWeek();
    loadOpportunities();
    loadCheckInsToday();
  }

  async function loadWeek() {
    if (!supabase) return;

    const loadingWeek = weekStartStr;
    lastLoadedWeek = loadingWeek;
    isLoadingWeek = true;
    errorMessage = "";

    const rangeStart = parseDateStr(loadingWeek);
    const rangeEnd = parseDateStr(addDaysStr(loadingWeek, 7));

    const { data, error } = await supabase
      .from("volunteer_shifts")
      .select(`${shiftColumns}, registrations:shift_registrations(id, role, checked_in)`)
      .gte("starts_at", rangeStart.toISOString())
      .lt("starts_at", rangeEnd.toISOString())
      .order("starts_at", { ascending: true });

    if (loadingWeek !== weekStartStr) return;

    if (error) {
      errorMessage = error.message;
    } else {
      weekShifts = (data || []).map((shift) => ({
        ...shift,
        leadCount: (shift.registrations || []).filter((reg) => reg.role === "lead").length,
        volunteerCount: (shift.registrations || []).filter((reg) => reg.role === "volunteer").length,
      }));
    }

    isLoadingWeek = false;
  }

  async function loadOpportunities() {
    if (!supabase) return;

    isLoadingOpportunities = true;

    const { data, error } = await supabase
      .from("volunteer_shifts")
      .select(`${shiftColumns}, registrations:shift_registrations(id, role, checked_in)`)
      .eq("kind", "opportunity")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true });

    if (error) {
      errorMessage = error.message;
    } else {
      opportunities = (data || []).map((shift) => ({
        ...shift,
        leadCount: (shift.registrations || []).filter((reg) => reg.role === "lead").length,
        volunteerCount: (shift.registrations || []).filter((reg) => reg.role === "volunteer").length,
      }));
    }

    isLoadingOpportunities = false;
  }

  async function loadCheckInsToday() {
    if (!supabase) return;

    const todayStart = parseDateStr(toDateStr(new Date()));
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const { count, error } = await supabase
      .from("shift_registrations")
      .select("id", { count: "exact", head: true })
      .eq("checked_in", true)
      .gte("check_in_time", todayStart.toISOString())
      .lt("check_in_time", tomorrowStart.toISOString());

    if (!error) {
      checkInsToday = count || 0;
    }
  }

  function handleDataChanged() {
    lastLoadedWeek = "";
    loadWeek();
    loadOpportunities();
    loadCheckInsToday();
  }

  function prevWeek() {
    weekStartStr = addDaysStr(weekStartStr, -7);
  }

  function nextWeek() {
    weekStartStr = addDaysStr(weekStartStr, 7);
  }

  function goToToday() {
    weekStartStr = getWeekStartStr();
  }

  async function createShift(event) {
    event?.preventDefault();
    if (!newShiftDate || !newShiftTime || isCreatingShift) return;

    isCreatingShift = true;
    createError = "";

    const startsAt = composeLocalIso(newShiftDate, newShiftTime);
    const endsAt = new Date(
      new Date(startsAt).getTime() + (Number(newShiftDuration) || 60) * 60000,
    ).toISOString();

    const payload = {
      kind: "custom",
      category: "operational",
      starts_at: startsAt,
      ends_at: endsAt,
      lead_capacity: Math.max(0, Number(newShiftLeadCap) || 0),
      volunteer_capacity: Math.max(0, Number(newShiftVolCap) || 0),
    };

    try {
      const { conflicts } = await findOperationalOverlaps(supabase, [payload]);
      if (conflicts.length) {
        createError = `This shift ${conflicts[0].reason}. Cancel that shift first or pick another time.`;
        isCreatingShift = false;
        return;
      }
    } catch (err) {
      createError = err?.message || "Could not check for overlapping shifts.";
      isCreatingShift = false;
      return;
    }

    const { error } = await supabase.from("volunteer_shifts").insert(payload);

    if (error) {
      createError = isOverlapError(error)
        ? "An operational shift already covers that time. Cancel it first or pick another time."
        : error.message;
    } else {
      showCreateForm = false;
      newShiftDate = "";
      handleDataChanged();
    }

    isCreatingShift = false;
  }

  function handleShiftDeleted(deletedId) {
    weekShifts = weekShifts.filter((shift) => shift.id !== deletedId);
    opportunities = opportunities.filter((shift) => shift.id !== deletedId);
    selectedShift = null;
    handleDataChanged();
  }

  function shiftChipClass(shift) {
    if (shift.cancelled) return "border-red-200 bg-red-50 text-red-700";
    if (shift.kind === "opportunity") return "border-brand/60 bg-brand-soft text-brand-ink";
    const full =
      shift.leadCount >= shift.lead_capacity &&
      shift.volunteerCount >= shift.volunteer_capacity;
    if (full) return "border-ink/10 bg-ink/[0.06] text-ink/45";
    return "border-accent/30 bg-accent-soft text-accent-strong";
  }
</script>

<section class="space-y-4" aria-labelledby="volunteers-view-title">
  <h3 id="volunteers-view-title" class="sr-only">Volunteers</h3>

  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Shifts this week" value={activeWeekShifts.length} icon={CalendarDays} tone="teal" />
    <StatCard label="Open spots this week" value={openSpotsThisWeek} icon={UsersRound} tone="gold" />
    <StatCard label="Check-ins today" value={checkInsToday} icon={ClipboardCheck} tone="teal" />
    <StatCard label="Upcoming opportunities" value={opportunities.length} icon={Megaphone} tone="gold" />
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} />
  {/if}

  <Tabs tabs={moduleTabs} bind:active={activeTab} label="Volunteer sections" />

  <div id="tabpanel-schedule" role="tabpanel" aria-labelledby="tab-schedule" class="space-y-4" class:hidden={activeTab !== "schedule"}>
  <div class="flex flex-wrap items-center gap-2">
    <Button
      variant="primary"
      icon={Plus}
      onclick={() => {
        showCreateForm = !showCreateForm;
        createError = "";
      }}
    >
      New shift
    </Button>
    <Button variant="dark" icon={Megaphone} onclick={() => (editingOpportunity = {})}>
      New opportunity
    </Button>
    <Button icon={KeyRound} href="/checkin">
      Open check-in page
    </Button>
  </div>

  {#if showCreateForm}
    <form class="rounded-card border border-ink/8 bg-white p-4 shadow-card" onsubmit={createShift}>
      <h4 class="font-bold">New custom shift</h4>
      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label class="block text-xs font-bold text-ink/70">
          Date
          <input type="date" class="input mt-1" bind:value={newShiftDate} disabled={isCreatingShift} />
        </label>
        <label class="block text-xs font-bold text-ink/70">
          Start time
          <input type="time" class="input mt-1" bind:value={newShiftTime} disabled={isCreatingShift} />
        </label>
        <label class="block text-xs font-bold text-ink/70">
          Duration (minutes)
          <input type="number" min="15" step="15" class="input mt-1" bind:value={newShiftDuration} disabled={isCreatingShift} />
        </label>
        <label class="block text-xs font-bold text-ink/70">
          Lead spots
          <input type="number" min="0" class="input mt-1" bind:value={newShiftLeadCap} disabled={isCreatingShift} />
        </label>
        <label class="block text-xs font-bold text-ink/70">
          Volunteer spots
          <input type="number" min="0" class="input mt-1" bind:value={newShiftVolCap} disabled={isCreatingShift} />
        </label>
      </div>
      {#if createError}
        <Banner tone="error" message={createError} class="mt-3" />
      {/if}
      <Button
        type="submit"
        variant="dark"
        loading={isCreatingShift}
        disabled={!newShiftDate || !newShiftTime}
        class="mt-3"
      >
        Create shift
      </Button>
    </form>
  {/if}

  <Panel title="Week schedule" id="volunteers-week-title" loading={isLoadingWeek}>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm font-bold text-ink/70">{weekRangeLabel}</p>
      <div class="flex items-center gap-1.5">
        <Button size="sm" iconOnly icon={ChevronLeft} label="Previous week" onclick={prevWeek} />
        <Button size="sm" onclick={goToToday}>Today</Button>
        <Button size="sm" iconOnly icon={ChevronRight} label="Next week" onclick={nextWeek} />
      </div>
    </div>

    {#if !weekShifts.length && !isLoadingWeek}
      <EmptyState
        title="No shifts this week"
        message="There are no volunteer shifts scheduled for this week yet. Use New shift, Bulk tools, or Extend schedule to add some."
      />
    {:else}
      <!-- Desktop: 7-column week grid -->
      <div class="hidden gap-2 lg:grid lg:grid-cols-7">
        {#each weekDays as day (day.dateStr)}
          <div class="flex min-h-48 flex-col rounded-md border border-black/10 bg-canvas/60 p-2 {day.isToday ? 'ring-2 ring-accent/30' : ''}">
            <p class="mb-2 text-center text-xs font-bold {day.isToday ? 'text-accent' : 'text-ink/65'}">
              {day.shortLabel}
            </p>
            <div class="flex-1 space-y-1.5">
              {#each day.shifts as shift (shift.id)}
                <button
                  type="button"
                  class="block w-full rounded border px-1.5 py-1 text-left text-[11px] leading-tight transition hover:shadow-sm {shiftChipClass(shift)}"
                  onclick={() => (selectedShift = shift)}
                >
                  <span class="block font-bold {shift.cancelled ? 'line-through' : ''}">
                    {shift.title || formatTimeRange(shift.starts_at, shift.ends_at)}
                  </span>
                  {#if shift.title}
                    <span class="block">{formatTimeRange(shift.starts_at, shift.ends_at)}</span>
                  {/if}
                  <span class="block">
                    L {shift.leadCount}/{shift.lead_capacity} · V {shift.volunteerCount}/{shift.volunteer_capacity}
                  </span>
                  {#if shift.category && shift.category !== "operational"}
                    <span class="mt-0.5 inline-block rounded-sm bg-black/10 px-1 text-[10px] font-bold uppercase tracking-wide">
                      {categoryLabel(shift.category)}
                    </span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <!-- Mobile: agenda day list -->
      <div class="space-y-3 lg:hidden">
        {#each weekDays as day (day.dateStr)}
          {#if day.shifts.length}
            <div>
              <h4 class="mb-1.5 text-sm font-bold {day.isToday ? 'text-accent' : 'text-ink'}">
                {day.label}{day.isToday ? " · Today" : ""}
              </h4>
              <div class="space-y-1.5">
                {#each day.shifts as shift (shift.id)}
                  <button
                    type="button"
                    class="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition {shiftChipClass(shift)}"
                    onclick={() => (selectedShift = shift)}
                  >
                    <span class="font-bold {shift.cancelled ? 'line-through' : ''}">
                      {shiftLabel(shift)}{shift.title ? ` · ${formatTimeRange(shift.starts_at, shift.ends_at)}` : ""}
                    </span>
                    <span class="text-xs font-bold">
                      L {shift.leadCount}/{shift.lead_capacity} · V {shift.volunteerCount}/{shift.volunteer_capacity}
                    </span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </Panel>

  <Panel title="Upcoming opportunities" id="volunteers-opportunities-title" loading={isLoadingOpportunities}>
    {#if !opportunities.length && !isLoadingOpportunities}
      <EmptyState
        title="No upcoming opportunities"
        message="Create a volunteer opportunity to promote one-off events like clean-up days or race support."
      />
    {:else}
      <div class="space-y-2">
        {#each opportunities as opportunity (opportunity.id)}
          <div
            class="flex flex-wrap items-center justify-between gap-3 rounded-card border border-ink/8 bg-white px-4 py-3 shadow-card transition hover:border-accent/40"
          >
            <button
              type="button"
              class="min-w-0 flex-1 text-left"
              onclick={() => (editingOpportunity = opportunity)}
            >
              <span class="block font-bold leading-snug {opportunity.cancelled ? 'text-ink/35 line-through' : 'text-ink'}">
                {opportunity.title || "Untitled opportunity"}
              </span>
              <span class="mt-1 block text-sm text-ink/60">
                {formatShortDate(opportunity.starts_at)} · {formatTimeRange(opportunity.starts_at, opportunity.ends_at)}{opportunity.location ? ` · ${opportunity.location}` : ""}
              </span>
            </button>
            <span class="flex flex-wrap items-center gap-2">
              {#if opportunity.category}
                <Badge tone="gold">{categoryLabel(opportunity.category)}</Badge>
              {/if}
              <Badge tone="neutral">{opportunity.volunteerCount}/{opportunity.volunteer_capacity} volunteers</Badge>
              {#if opportunity.lead_capacity > 0}
                <Badge tone="neutral">{opportunity.leadCount}/{opportunity.lead_capacity} leads</Badge>
              {/if}
              <Button size="sm" onclick={() => (selectedShift = opportunity)}>Roster</Button>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </Panel>
  </div>

  {#if activeTab === "volunteers"}
    <div id="tabpanel-volunteers" role="tabpanel" aria-labelledby="tab-volunteers" class="space-y-4">
      <DayRosterView {supabase} />
      <VolunteerLookup {supabase} />
    </div>
  {/if}

  {#if complianceVisited}
    <div
      id="tabpanel-compliance"
      role="tabpanel"
      aria-labelledby="tab-compliance"
      class:hidden={activeTab !== "compliance"}
    >
      <ComplianceView {supabase} />
    </div>
  {/if}

  {#if activeTab === "tools"}
    <div id="tabpanel-tools" role="tabpanel" aria-labelledby="tab-tools">
      <BulkShiftTools {supabase} onChanged={handleDataChanged} />
    </div>
  {/if}
</section>

<ShiftEditorDrawer
  {supabase}
  shift={selectedShift}
  onClose={() => (selectedShift = null)}
  onChanged={handleDataChanged}
  onDeleted={handleShiftDeleted}
/>

<OpportunityEditorDrawer
  {supabase}
  opportunity={editingOpportunity}
  onClose={() => (editingOpportunity = null)}
  onSaved={handleDataChanged}
/>
