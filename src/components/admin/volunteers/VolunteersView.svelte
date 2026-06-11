<script>
  import { onMount } from "svelte";
  import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    ClipboardCheck,
    Copy,
    KeyRound,
    Megaphone,
    Plus,
    Search,
    UsersRound,
    Wrench,
  } from "@lucide/svelte";
  import EmptyState from "../marketing/EmptyState.svelte";
  import Panel from "../marketing/Panel.svelte";
  import SummaryCard from "../marketing/SummaryCard.svelte";
  import ShiftEditorDrawer from "./ShiftEditorDrawer.svelte";
  import OpportunityEditorDrawer from "./OpportunityEditorDrawer.svelte";
  import BulkShiftTools from "./BulkShiftTools.svelte";
  import VolunteerLookup from "./VolunteerLookup.svelte";
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

  let showBulkTools = false;
  let showLookup = false;

  let kioskCode = "";
  let kioskError = "";
  let isLoadingKiosk = false;
  let showKiosk = false;
  let kioskCopied = false;

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
  $: kioskUrl = kioskCode
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/checkin?code=${kioskCode}`
    : "";

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

  async function loadKioskCode() {
    if (showKiosk) {
      showKiosk = false;
      return;
    }

    showKiosk = true;
    if (kioskCode || isLoadingKiosk) return;

    isLoadingKiosk = true;
    kioskError = "";

    const { data, error } = await supabase.rpc("get_volunteer_check_in_code");

    if (error) {
      kioskError = error.message;
    } else {
      kioskCode = data || "";
    }

    isLoadingKiosk = false;
  }

  async function copyKioskUrl() {
    try {
      await navigator.clipboard.writeText(kioskUrl);
      kioskCopied = true;
      window.setTimeout(() => (kioskCopied = false), 2000);
    } catch {
      kioskError = "Could not copy the link, copy it manually instead.";
    }
  }

  function handleShiftDeleted(deletedId) {
    weekShifts = weekShifts.filter((shift) => shift.id !== deletedId);
    opportunities = opportunities.filter((shift) => shift.id !== deletedId);
    selectedShift = null;
    handleDataChanged();
  }

  function shiftChipClass(shift) {
    if (shift.cancelled) return "border-red-200 bg-red-50 text-red-700";
    if (shift.kind === "opportunity") return "border-[#ffbd59]/60 bg-[#fff3d8] text-[#8a5700]";
    const full =
      shift.leadCount >= shift.lead_capacity &&
      shift.volunteerCount >= shift.volunteer_capacity;
    if (full) return "border-gray-200 bg-gray-100 text-gray-500";
    return "border-teal-200 bg-teal-50 text-teal-900";
  }
</script>

<section class="space-y-4" aria-labelledby="volunteers-view-title">
  <h3 id="volunteers-view-title" class="sr-only">Volunteers</h3>

  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <SummaryCard label="Shifts this week" value={activeWeekShifts.length} icon={CalendarDays} tone="teal" />
    <SummaryCard label="Open spots this week" value={openSpotsThisWeek} icon={UsersRound} tone="gold" />
    <SummaryCard label="Check-ins today" value={checkInsToday} icon={ClipboardCheck} tone="teal" />
    <SummaryCard label="Upcoming opportunities" value={opportunities.length} icon={Megaphone} tone="gold" />
  </div>

  {#if errorMessage}
    <div class="flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{errorMessage}</span>
    </div>
  {/if}

  <div class="flex flex-wrap items-center gap-2">
    <button
      type="button"
      class="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833]"
      onclick={() => {
        showCreateForm = !showCreateForm;
        createError = "";
      }}
    >
      <Plus class="h-4 w-4" aria-hidden="true" />
      New shift
    </button>
    <button
      type="button"
      class="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#1E1E1E] px-4 text-sm font-bold text-white transition hover:bg-black"
      onclick={() => (editingOpportunity = {})}
    >
      <Megaphone class="h-4 w-4" aria-hidden="true" />
      New opportunity
    </button>
    <button
      type="button"
      class="inline-flex min-h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-bold text-gray-700 transition hover:bg-gray-100 {showBulkTools ? 'border-[#0f766e] text-[#0f766e]' : ''}"
      aria-pressed={showBulkTools}
      onclick={() => (showBulkTools = !showBulkTools)}
    >
      <Wrench class="h-4 w-4" aria-hidden="true" />
      Bulk tools
    </button>
    <button
      type="button"
      class="inline-flex min-h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-bold text-gray-700 transition hover:bg-gray-100 {showLookup ? 'border-[#0f766e] text-[#0f766e]' : ''}"
      aria-pressed={showLookup}
      onclick={() => (showLookup = !showLookup)}
    >
      <Search class="h-4 w-4" aria-hidden="true" />
      Volunteer lookup
    </button>
    <button
      type="button"
      class="inline-flex min-h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-bold text-gray-700 transition hover:bg-gray-100 {showKiosk ? 'border-[#0f766e] text-[#0f766e]' : ''}"
      aria-pressed={showKiosk}
      onclick={loadKioskCode}
    >
      <KeyRound class="h-4 w-4" aria-hidden="true" />
      Check-in kiosk code
    </button>
  </div>

  {#if showKiosk}
    <div class="rounded-md border border-black/10 bg-white p-4 shadow-sm">
      {#if isLoadingKiosk}
        <div class="flex items-center gap-3 text-sm text-gray-600">
          <span class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin" aria-hidden="true"></span>
          Loading kiosk code
        </div>
      {:else if kioskError}
        <div class="flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{kioskError}</span>
        </div>
      {:else if kioskCode}
        <p class="text-sm font-bold">Check-in kiosk</p>
        <p class="mt-1 text-sm text-gray-600">
          Open this link on the front-desk device. Anyone with the link can check volunteers in, so keep it internal.
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <code class="rounded-md bg-gray-100 px-3 py-2 text-sm font-bold">{kioskCode}</code>
          <code class="break-all rounded-md bg-gray-100 px-3 py-2 text-sm">{kioskUrl}</code>
          <button
            type="button"
            class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-xs font-bold text-gray-700 transition hover:bg-gray-100"
            onclick={copyKioskUrl}
          >
            <Copy class="h-3.5 w-3.5" aria-hidden="true" />
            {kioskCopied ? "Copied" : "Copy link"}
          </button>
        </div>
      {/if}
    </div>
  {/if}

  {#if showCreateForm}
    <form class="rounded-md border border-black/10 bg-white p-4 shadow-sm" onsubmit={createShift}>
      <h4 class="font-bold">New custom shift</h4>
      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label class="block text-xs font-bold text-gray-700">
          Date
          <input type="date" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={newShiftDate} disabled={isCreatingShift} />
        </label>
        <label class="block text-xs font-bold text-gray-700">
          Start time
          <input type="time" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={newShiftTime} disabled={isCreatingShift} />
        </label>
        <label class="block text-xs font-bold text-gray-700">
          Duration (minutes)
          <input type="number" min="15" step="15" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={newShiftDuration} disabled={isCreatingShift} />
        </label>
        <label class="block text-xs font-bold text-gray-700">
          Lead spots
          <input type="number" min="0" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={newShiftLeadCap} disabled={isCreatingShift} />
        </label>
        <label class="block text-xs font-bold text-gray-700">
          Volunteer spots
          <input type="number" min="0" class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20" bind:value={newShiftVolCap} disabled={isCreatingShift} />
        </label>
      </div>
      {#if createError}
        <div class="mt-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{createError}</span>
        </div>
      {/if}
      <button
        type="submit"
        class="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#1E1E1E] px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isCreatingShift || !newShiftDate || !newShiftTime}
      >
        {#if isCreatingShift}
          <span class="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true"></span>
          Creating
        {:else}
          Create shift
        {/if}
      </button>
    </form>
  {/if}

  {#if showBulkTools}
    <BulkShiftTools {supabase} onChanged={handleDataChanged} />
  {/if}

  {#if showLookup}
    <VolunteerLookup {supabase} />
  {/if}

  <Panel title="Week schedule" id="volunteers-week-title" loading={isLoadingWeek}>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm font-bold text-gray-700">{weekRangeLabel}</p>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="inline-flex min-h-9 items-center rounded-md border border-gray-300 bg-white px-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-100"
          aria-label="Previous week"
          onclick={prevWeek}
        >
          <ChevronLeft class="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="inline-flex min-h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm font-bold text-gray-700 transition hover:bg-gray-100"
          onclick={goToToday}
        >
          Today
        </button>
        <button
          type="button"
          class="inline-flex min-h-9 items-center rounded-md border border-gray-300 bg-white px-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-100"
          aria-label="Next week"
          onclick={nextWeek}
        >
          <ChevronRight class="h-4 w-4" aria-hidden="true" />
        </button>
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
          <div class="flex min-h-48 flex-col rounded-md border border-black/10 bg-gray-50 p-2 {day.isToday ? 'ring-2 ring-[#0f766e]/30' : ''}">
            <p class="mb-2 text-center text-xs font-bold {day.isToday ? 'text-[#0f766e]' : 'text-gray-600'}">
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
              <h4 class="mb-1.5 text-sm font-bold {day.isToday ? 'text-[#0f766e]' : 'text-gray-800'}">
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
          <button
            type="button"
            class="flex w-full flex-wrap items-center justify-between gap-3 rounded-md border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#0f766e]/40 hover:shadow-sm"
            onclick={() => (editingOpportunity = opportunity)}
          >
            <span class="min-w-0">
              <span class="block font-bold leading-snug {opportunity.cancelled ? 'text-gray-400 line-through' : ''}">
                {opportunity.title || "Untitled opportunity"}
              </span>
              <span class="mt-1 block text-sm text-gray-600">
                {formatShortDate(opportunity.starts_at)} · {formatTimeRange(opportunity.starts_at, opportunity.ends_at)}{opportunity.location ? ` · ${opportunity.location}` : ""}
              </span>
            </span>
            <span class="flex flex-wrap items-center gap-2">
              {#if opportunity.category}
                <span class="rounded-full border border-[#ffbd59]/60 bg-[#fff3d8] px-2.5 py-1 text-xs font-bold text-[#8a5700]">
                  {categoryLabel(opportunity.category)}
                </span>
              {/if}
              <span class="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700">
                {opportunity.volunteerCount}/{opportunity.volunteer_capacity} volunteers
              </span>
              {#if opportunity.lead_capacity > 0}
                <span class="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700">
                  {opportunity.leadCount}/{opportunity.lead_capacity} leads
                </span>
              {/if}
              <span
                role="button"
                tabindex="0"
                class="rounded-md border border-[#0f766e]/40 bg-teal-50 px-2.5 py-1 text-xs font-bold text-[#0f766e] transition hover:bg-teal-100"
                onclick={(event) => {
                  event.stopPropagation();
                  selectedShift = opportunity;
                }}
                onkeydown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    selectedShift = opportunity;
                  }
                }}
              >
                Roster
              </span>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </Panel>
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
