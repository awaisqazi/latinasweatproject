<script>
  // "What is happening at the studio right now" — who is on the clock, which
  // punches were never closed out, and whether the iPad itself is still
  // talking to us.
  import { onDestroy, onMount } from "svelte";
  import {
    CalendarClock,
    CircleUser,
    Clock,
    Tablet,
    TriangleAlert,
    UserCheck,
    Users,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import {
    KIOSK_STATUS_COLUMNS,
    MISSED_PUNCH_HOURS,
    PUNCH_COLUMNS,
    SHIFT_ROLE_LABELS,
    addDaysToDate,
    billableHours,
    chicagoDayEndIso,
    chicagoDayStartIso,
    chicagoToday,
    elapsedLabel,
    employeeLabel,
    formatChicagoTimeLabel,
    formatHours,
    isPendingRfid,
    kioskFreshness,
    loggedHours,
    relativeTime,
    startOfWeekDate,
    sumHours,
  } from "../../../lib/dashboard/timeclock";

  export let supabase;
  export let employees = [];
  export let refreshKey = 0;
  export let rosterLoading = false;
  export let onChanged = () => {};

  let openPunches = [];
  let weekPunches = [];
  let kioskDevices = [];
  let isLoading = true;
  let errorMessage = "";
  let lastRefreshKey = refreshKey;

  let forceOutTarget = null;
  let forcingOut = false;

  // "Elapsed" and "last seen" are wall-clock derived, so tick them.
  let nowMs = Date.now();
  let tickTimer = null;

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadAll();
  }

  onMount(() => {
    loadAll();
    tickTimer = setInterval(() => (nowMs = Date.now()), 30000);
  });

  onDestroy(() => {
    if (tickTimer) clearInterval(tickTimer);
  });

  async function loadAll() {
    if (!supabase) return;
    isLoading = true;
    errorMessage = "";

    const today = chicagoToday();
    const weekStart = startOfWeekDate(today);
    const weekStartIso = chicagoDayStartIso(weekStart);
    // The whole studio week (Monday through Sunday), not "up to tonight" —
    // otherwise a shift entered for later in the week is missing from the
    // week's total and the number disagrees with the Timesheets tab.
    const weekEndIso = chicagoDayEndIso(addDaysToDate(weekStart, 6));

    const [openRes, weekRes, kioskRes] = await Promise.all([
      supabase
        .from("timeclock_punches")
        .select(PUNCH_COLUMNS)
        .is("deleted_at", null)
        .is("clock_out_at", null)
        .order("clock_in_at", { ascending: true }),
      supabase
        .from("timeclock_punches")
        .select(PUNCH_COLUMNS)
        .is("deleted_at", null)
        .gte("clock_in_at", weekStartIso)
        .lt("clock_in_at", weekEndIso)
        .order("clock_in_at", { ascending: false }),
      supabase
        .from("timeclock_kiosk_status")
        .select(KIOSK_STATUS_COLUMNS)
        .order("last_seen_at", { ascending: false }),
    ]);

    const firstError = openRes.error || weekRes.error || kioskRes.error;
    if (firstError) errorMessage = firstError.message;

    if (!openRes.error) openPunches = openRes.data || [];
    if (!weekRes.error) weekPunches = weekRes.data || [];
    if (!kioskRes.error) kioskDevices = kioskRes.data || [];

    isLoading = false;
    nowMs = Date.now();
  }

  $: employeeById = Object.fromEntries(
    employees.map((employee) => [employee.id, employee]),
  );

  $: activeCount = employees.filter((employee) => employee.is_active).length;
  $: needsCardCount = employees.filter(
    (employee) => employee.is_active && isPendingRfid(employee.rfid_tag),
  ).length;

  $: weekBillable = sumHours(weekPunches, billableHours);
  $: weekLogged = sumHours(weekPunches, loggedHours);

  // Derived from the ticker so it stays right across studio midnight. The
  // week query now runs to Sunday night, so today needs both bounds.
  $: todayDate = chicagoToday(new Date(nowMs));
  $: todayStartMs = new Date(chicagoDayStartIso(todayDate)).getTime();
  $: todayEndMs = new Date(chicagoDayEndIso(todayDate)).getTime();
  $: punchesToday = weekPunches.filter((punch) => {
    const ms = new Date(punch.clock_in_at).getTime();
    return ms >= todayStartMs && ms < todayEndMs;
  }).length;

  // Everything derived from `nowMs` is computed reactively so the ticker
  // actually moves the numbers.
  $: onSiteRows = openPunches.map((punch) => ({
    punch,
    employee: employeeById[punch.employee_id] || null,
    elapsed: elapsedLabel(punch.clock_in_at, nowMs),
    since: formatChicagoTimeLabel(punch.clock_in_at),
    ageHours: (nowMs - new Date(punch.clock_in_at).getTime()) / 3600000,
  }));

  $: missedRows = onSiteRows.filter((row) => row.ageHours > MISSED_PUNCH_HOURS);
  $: currentRows = onSiteRows.filter((row) => row.ageHours <= MISSED_PUNCH_HOURS);

  $: kioskRows = kioskDevices.map((device) => ({
    device,
    freshness: kioskFreshness(device.last_seen_at, nowMs),
    seen: relativeTime(device.last_seen_at, nowMs),
  }));

  function nameFor(employee) {
    return employee ? employeeLabel(employee) : "Unknown employee";
  }

  async function confirmForceOut() {
    if (!forceOutTarget || forcingOut) return;
    forcingOut = true;
    errorMessage = "";

    // Close the shift at "now" and flag it, so payroll can see the hours were
    // not confirmed by the employee at the kiosk.
    const { error } = await supabase
      .from("timeclock_punches")
      .update({ clock_out_at: new Date().toISOString(), was_forced_out: true })
      .eq("id", forceOutTarget.punch.id);

    forcingOut = false;

    if (error) {
      errorMessage = error.message;
      forceOutTarget = null;
      return;
    }

    forceOutTarget = null;
    await loadAll();
    onChanged();
  }
</script>

<div class="space-y-4">
  {#if errorMessage}
    <Banner tone="error" message={errorMessage} onRetry={loadAll} />
  {/if}

  {#if isLoading}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {#each Array(4) as _, i (i)}
        <SkeletonCard lines={2} />
      {/each}
    </div>
  {:else}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="On site now"
        value={openPunches.length}
        icon={UserCheck}
        tone={openPunches.length ? "teal" : "neutral"}
        hint={missedRows.length
          ? `${missedRows.length} look like missed punches`
          : "Open shifts right now"}
      />
      <StatCard
        label="Billable hours this week"
        value={formatHours(weekBillable) || "0.00"}
        icon={Clock}
        tone="gold"
        hint={`${formatHours(weekLogged) || "0.00"} logged · Monday through Sunday`}
      />
      <StatCard
        label="Punches today"
        value={punchesToday}
        icon={CalendarClock}
        tone="teal"
        hint="Studio time (America/Chicago)"
      />
      <StatCard
        label="Active roster"
        value={activeCount}
        icon={Users}
        tone="neutral"
        loading={rosterLoading}
        hint={needsCardCount ? `${needsCardCount} still need a card` : "All carded"}
      />
    </div>
  {/if}

  <div class="grid gap-4 xl:grid-cols-[3fr_2fr]">
    <Panel title="Currently clocked in" id="time-clock-on-site-title">
      {#if isLoading}
        <SkeletonCard lines={4} />
      {:else if !currentRows.length}
        <EmptyState
          title="Nobody is on the clock"
          message="When someone taps in at the studio iPad they show up here within a few seconds."
          icon={CircleUser}
        />
      {:else}
        <div class="space-y-2">
          {#each currentRows as row (row.punch.id)}
            <div class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3">
              <span class="min-w-0 flex-1">
                <span class="block truncate font-bold leading-snug text-ink">
                  {nameFor(row.employee)}
                </span>
                <span class="mt-0.5 block text-xs font-semibold text-ink/50">
                  Since {row.since}
                  {#if row.employee?.job_title}
                    · {row.employee.job_title}
                  {/if}
                </span>
              </span>
              <Badge tone={row.punch.shift_role === "coordinator" ? "blue" : "teal"} size="xs">
                {SHIFT_ROLE_LABELS[row.punch.shift_role] || "Instructor"}
              </Badge>
              <span class="text-sm font-bold tabular-nums text-ink">{row.elapsed}</span>
            </div>
          {/each}
        </div>
      {/if}
    </Panel>

    <Panel title="Studio iPad" id="time-clock-kiosk-title">
      {#if isLoading}
        <SkeletonCard lines={3} />
      {:else if !kioskRows.length}
        <EmptyState
          title="No kiosk has checked in"
          message="The iPad records a heartbeat every time it syncs. Nothing here yet means it has not synced against this database."
          icon={Tablet}
        />
      {:else}
        <div class="space-y-2">
          {#each kioskRows as row (row.device.id)}
            <div class="rounded-control border border-ink/8 bg-white px-4 py-3">
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-full {row.freshness.dot}"
                  aria-hidden="true"
                ></span>
                <span class="font-bold text-ink">{row.device.id}</span>
                <Badge tone={row.freshness.tone} size="xs">{row.freshness.label}</Badge>
              </div>
              <dl class="mt-2 grid gap-1.5 text-xs text-ink/65 sm:grid-cols-2">
                <div class="flex items-baseline gap-1.5">
                  <dt class="font-semibold uppercase tracking-wide text-ink/45">Last sync</dt>
                  <dd class="font-semibold text-ink/80">{row.seen}</dd>
                </div>
                <div class="flex items-baseline gap-1.5">
                  <dt class="font-semibold uppercase tracking-wide text-ink/45">App</dt>
                  <dd class="font-semibold text-ink/80">{row.device.app_version || "unknown"}</dd>
                </div>
                <div class="flex items-baseline gap-1.5">
                  <dt class="font-semibold uppercase tracking-wide text-ink/45">Waiting to push</dt>
                  <dd class="font-semibold tabular-nums {row.device.pending_push > 0 ? 'text-amber-700' : 'text-ink/80'}">
                    {row.device.pending_push ?? 0}
                  </dd>
                </div>
              </dl>
            </div>
          {/each}
        </div>
        <p class="mt-3 text-xs leading-5 text-ink/45">
          Green means the iPad synced in the last 15 minutes, amber within a
          day, red longer than that. Punches taken while it is offline are
          still safe on the device and arrive when it reconnects.
        </p>
      {/if}
    </Panel>
  </div>

  <Panel title="Missed punches" id="time-clock-missed-title">
    {#if isLoading}
      <SkeletonCard lines={3} />
    {:else if !missedRows.length}
      <EmptyState
        title="No missed punches"
        message={`Shifts still open after ${MISSED_PUNCH_HOURS} hours land here so you can close them out.`}
        icon={TriangleAlert}
      />
    {:else}
      <div class="space-y-2">
        {#each missedRows as row (row.punch.id)}
          <div class="flex flex-wrap items-center gap-3 rounded-control border border-amber-200 bg-amber-50/60 px-4 py-3">
            <span class="min-w-0 flex-1">
              <span class="block truncate font-bold leading-snug text-ink">
                {nameFor(row.employee)}
              </span>
              <span class="mt-0.5 block text-xs font-semibold text-amber-800">
                Open since {row.since} · {row.elapsed} elapsed
              </span>
            </span>
            <Badge tone={row.punch.shift_role === "coordinator" ? "blue" : "teal"} size="xs">
              {SHIFT_ROLE_LABELS[row.punch.shift_role] || "Instructor"}
            </Badge>
            <Button
              size="sm"
              variant="secondary"
              onclick={() => (forceOutTarget = row)}
            >
              Force out
            </Button>
          </div>
        {/each}
      </div>
      <p class="mt-3 text-xs leading-5 text-ink/45">
        Forcing out closes the shift at the current time and marks it, so the
        hours are obviously an estimate. Correct the exact times from the
        Timesheets tab afterwards.
      </p>
    {/if}
  </Panel>
</div>

<ConfirmDialog
  open={Boolean(forceOutTarget)}
  title="Force this shift closed?"
  message={forceOutTarget
    ? `${nameFor(forceOutTarget.employee)} has been clocked in for ${forceOutTarget.elapsed}. This closes the shift at the current time and flags it as forced out. You can fix the exact clock-out from Timesheets.`
    : ""}
  confirmLabel="Force out"
  tone="danger"
  busy={forcingOut}
  onConfirm={confirmForceOut}
  onCancel={() => (forceOutTarget = null)}
/>
