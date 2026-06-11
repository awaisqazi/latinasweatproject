<script>
  import { onMount } from "svelte";
  import {
    CalendarDays,
    CalendarRange,
    ChartColumn,
    ClipboardList,
    DoorOpen,
    GraduationCap,
  } from "@lucide/svelte";
  import StatCard from "../ui/StatCard.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import SpaceCalendarTab from "./SpaceCalendarTab.svelte";
  import ClassScheduleTab from "./ClassScheduleTab.svelte";
  import PlanningTab from "./PlanningTab.svelte";
  import InsightsTab from "./InsightsTab.svelte";

  export let supabase;
  export let profile = null;
  export let refreshKey = 0;

  let activeTab = "calendar";
  let scheduleVisited = false;
  let planningVisited = false;
  let insightsVisited = false;
  $: if (activeTab === "schedule") scheduleVisited = true;
  $: if (activeTab === "planning") planningVisited = true;
  $: if (activeTab === "insights") insightsVisited = true;

  const moduleTabs = [
    { id: "calendar", label: "Space Calendar", icon: CalendarRange },
    { id: "schedule", label: "Class Schedule", icon: GraduationCap },
    { id: "planning", label: "Planning", icon: ClipboardList },
    { id: "insights", label: "Insights", icon: ChartColumn },
  ];

  let activeSlots = 0;
  let bookingsThisWeek = 0;
  let avgUtilization = null;
  let statsLoading = true;
  // Bumped by tabs whenever they change data, so the stat cards stay honest.
  let dataVersion = 0;

  let lastRefreshKey = refreshKey;
  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    dataVersion += 1;
    loadStats();
  }

  onMount(loadStats);

  async function loadStats() {
    if (!supabase) return;
    statsLoading = true;

    const weekAhead = new Date();
    weekAhead.setDate(weekAhead.getDate() + 7);

    const [slotsRes, bookingsRes, utilRes] = await Promise.all([
      supabase
        .from("class_schedule_slots")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      supabase
        .from("space_bookings")
        .select("id", { count: "exact", head: true })
        .gte("ends_at", new Date().toISOString())
        .lte("starts_at", weekAhead.toISOString()),
      supabase.from("class_history_type_stats").select("sessions, avg_utilization"),
    ]);

    activeSlots = slotsRes.count || 0;
    bookingsThisWeek = bookingsRes.count || 0;

    const rows = utilRes.data || [];
    const totalSessions = rows.reduce((sum, r) => sum + Number(r.sessions || 0), 0);
    avgUtilization = totalSessions
      ? Math.round(
          (rows.reduce(
            (sum, r) => sum + Number(r.avg_utilization || 0) * Number(r.sessions || 0),
            0,
          ) /
            totalSessions) *
            10,
        ) / 10
      : null;

    statsLoading = false;
  }

  function handleDataChanged() {
    dataVersion += 1;
    loadStats();
  }
</script>

<section class="space-y-4" aria-labelledby="spaces-view-title">
  <h3 id="spaces-view-title" class="sr-only">Studio Spaces</h3>

  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Active class slots" value={activeSlots} icon={GraduationCap} tone="teal" loading={statsLoading} />
    <StatCard label="Bookings next 7 days" value={bookingsThisWeek} icon={CalendarDays} tone="gold" loading={statsLoading} />
    <StatCard label="Rooms" value={2} hint="Little Village · Gage Park" icon={DoorOpen} tone="neutral" />
    <StatCard
      label="Historic utilization"
      value={avgUtilization === null ? "–" : `${avgUtilization}%`}
      icon={ChartColumn}
      tone="rose"
      hint="All imported sessions"
      loading={statsLoading}
    />
  </div>

  <Tabs tabs={moduleTabs} bind:active={activeTab} label="Studio space sections" />

  <div
    id="tabpanel-calendar"
    role="tabpanel"
    aria-labelledby="tab-calendar"
    class:hidden={activeTab !== "calendar"}
  >
    <SpaceCalendarTab {supabase} {dataVersion} onChanged={handleDataChanged} />
  </div>

  {#if scheduleVisited}
    <div
      id="tabpanel-schedule"
      role="tabpanel"
      aria-labelledby="tab-schedule"
      class:hidden={activeTab !== "schedule"}
    >
      <ClassScheduleTab {supabase} {dataVersion} onChanged={handleDataChanged} />
    </div>
  {/if}

  {#if planningVisited}
    <div
      id="tabpanel-planning"
      role="tabpanel"
      aria-labelledby="tab-planning"
      class:hidden={activeTab !== "planning"}
    >
      <PlanningTab {supabase} {dataVersion} onChanged={handleDataChanged} />
    </div>
  {/if}

  {#if insightsVisited}
    <div
      id="tabpanel-insights"
      role="tabpanel"
      aria-labelledby="tab-insights"
      class:hidden={activeTab !== "insights"}
    >
      <InsightsTab {supabase} />
    </div>
  {/if}
</section>
