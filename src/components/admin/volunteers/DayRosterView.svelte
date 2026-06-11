<script>
  import { onMount } from "svelte";
  import { Check, ChevronLeft, ChevronRight, Pencil, Undo2 } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import {
    addDaysStr,
    formatDayLabel,
    formatTimeRange,
    fromDateTimeLocalInput,
    parseDateStr,
    toDateStr,
    toDateTimeLocalInput,
  } from "../../../lib/dashboard/volunteersAdmin.js";

  // Day-by-day registration history (the legacy volunteeradmin workflow):
  // pick any date, see everyone who signed up, fix check-in punches in place.
  export let supabase;

  let dateStr = toDateStr(new Date());
  let groups = []; // [{ shift, registrations: [] }]
  let isLoading = true;
  let errorMessage = "";
  let busyRegistrationId = "";
  let editingTimeId = "";
  let editingTimeValue = "";
  let pendingUncheck = null;
  let loadedFor = "";

  const REG_COLUMNS =
    "id, shift_id, name, email, phone, role, checked_in, check_in_time, created_at";

  $: if (dateStr && dateStr !== loadedFor) {
    loadDay(dateStr);
  }
  $: dayLabel = formatDayLabel(dateStr);
  $: totals = groups.reduce(
    (sum, group) => {
      sum.registered += group.registrations.length;
      sum.checkedIn += group.registrations.filter((r) => r.checked_in).length;
      return sum;
    },
    { registered: 0, checkedIn: 0 },
  );

  onMount(() => {
    loadDay(dateStr);
  });

  async function loadDay(target) {
    loadedFor = target;
    isLoading = true;
    errorMessage = "";

    const dayStart = parseDateStr(target);
    const dayEnd = parseDateStr(target);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const { data, error } = await supabase
      .from("volunteer_shifts")
      .select(
        `id, kind, category, title, starts_at, ends_at, cancelled, lead_capacity, volunteer_capacity, registrations:shift_registrations(${REG_COLUMNS})`,
      )
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString())
      .order("starts_at", { ascending: true });

    if (target !== loadedFor) return;

    if (error) {
      errorMessage = error.message;
      groups = [];
    } else {
      groups = (data || []).map((shift) => ({
        shift,
        registrations: (shift.registrations || []).sort((a, b) =>
          (a.name || "").localeCompare(b.name || ""),
        ),
      }));
    }

    isLoading = false;
  }

  function shiftDay(days) {
    dateStr = addDaysStr(dateStr, days);
  }

  function updateLocal(updated) {
    groups = groups.map((group) => ({
      ...group,
      registrations: group.registrations.map((reg) =>
        reg.id === updated.id ? updated : reg,
      ),
    }));
  }

  async function setCheckIn(registration, checkedIn) {
    if (busyRegistrationId) return;

    pendingUncheck = null;
    busyRegistrationId = registration.id;
    errorMessage = "";

    const { data, error } = await supabase
      .from("shift_registrations")
      .update({
        checked_in: checkedIn,
        check_in_time: checkedIn ? new Date().toISOString() : null,
      })
      .eq("id", registration.id)
      .select(REG_COLUMNS)
      .single();

    if (error) {
      errorMessage = error.message;
    } else {
      updateLocal(data);
    }

    busyRegistrationId = "";
  }

  function startEditingTime(registration) {
    editingTimeId = registration.id;
    editingTimeValue = toDateTimeLocalInput(
      registration.check_in_time || new Date().toISOString(),
    );
  }

  async function saveCheckInTime(registration) {
    const iso = fromDateTimeLocalInput(editingTimeValue);
    if (!iso || busyRegistrationId) return;

    busyRegistrationId = registration.id;
    errorMessage = "";

    const { data, error } = await supabase
      .from("shift_registrations")
      .update({ checked_in: true, check_in_time: iso })
      .eq("id", registration.id)
      .select(REG_COLUMNS)
      .single();

    if (error) {
      errorMessage = error.message;
    } else {
      updateLocal(data);
      editingTimeId = "";
    }

    busyRegistrationId = "";
  }

  function formatPunch(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
</script>

<Panel title="Registrations by date" id="day-roster-title" loading={isLoading}>
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <Button size="sm" iconOnly icon={ChevronLeft} label="Previous day" onclick={() => shiftDay(-1)} />
      <input
        type="date"
        class="input w-40"
        aria-label="Roster date"
        bind:value={dateStr}
      />
      <Button size="sm" iconOnly icon={ChevronRight} label="Next day" onclick={() => shiftDay(1)} />
      <Button size="sm" onclick={() => (dateStr = toDateStr(new Date()))}>Today</Button>
    </div>
    <p class="text-sm font-semibold text-ink/60" aria-live="polite">
      {dayLabel} · {totals.checkedIn}/{totals.registered} checked in
    </p>
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} class="mb-4" />
  {/if}

  {#if isLoading && !groups.length}
    <div class="space-y-2">
      <SkeletonCard lines={3} />
      <SkeletonCard lines={3} />
    </div>
  {:else if !groups.length}
    <EmptyState
      title="No shifts on this date"
      message="There are no volunteer shifts scheduled for {dayLabel}."
    />
  {:else}
    <div class="space-y-3">
      {#each groups as group (group.shift.id)}
        <section class="rounded-card border border-ink/8 bg-white shadow-card">
          <header class="flex flex-wrap items-center justify-between gap-2 border-b border-ink/8 bg-canvas/60 px-4 py-2.5">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-bold text-ink">
                {group.shift.title || formatTimeRange(group.shift.starts_at, group.shift.ends_at)}
              </p>
              {#if group.shift.title}
                <span class="text-xs text-ink/55">{formatTimeRange(group.shift.starts_at, group.shift.ends_at)}</span>
              {/if}
              {#if group.shift.cancelled}
                <Badge tone="red" size="xs">Cancelled</Badge>
              {/if}
              {#if group.shift.kind === "opportunity"}
                <Badge tone="gold" size="xs">Opportunity</Badge>
              {/if}
            </div>
            <span class="text-xs font-semibold tabular-nums text-ink/50">
              {group.registrations.filter((r) => r.checked_in).length}/{group.registrations.length} checked in
            </span>
          </header>

          {#if !group.registrations.length}
            <p class="px-4 py-4 text-sm italic text-ink/40">No one signed up for this shift.</p>
          {:else}
            <ul class="divide-y divide-ink/6">
              {#each group.registrations as reg (reg.id)}
                <li class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-semibold text-ink">{reg.name}</p>
                      <Badge tone={reg.role === "lead" ? "teal" : "neutral"} size="xs">
                        {reg.role === "lead" ? "Lead" : "Volunteer"}
                      </Badge>
                    </div>
                    <p class="break-all text-xs text-ink/55">
                      {reg.email}{reg.phone ? ` · ${reg.phone}` : ""}
                    </p>
                    {#if reg.checked_in && reg.check_in_time && editingTimeId !== reg.id}
                      <p class="mt-0.5 text-xs font-medium text-green-800">
                        Checked in {formatPunch(reg.check_in_time)}
                      </p>
                    {/if}
                  </div>

                  <div class="flex flex-wrap items-center gap-1.5">
                    {#if editingTimeId === reg.id}
                      <input
                        type="datetime-local"
                        class="input w-52"
                        aria-label="Check-in time for {reg.name}"
                        bind:value={editingTimeValue}
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        loading={busyRegistrationId === reg.id}
                        onclick={() => saveCheckInTime(reg)}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onclick={() => (editingTimeId = "")}>Cancel</Button>
                    {:else if reg.checked_in}
                      <Badge tone="green" dot>Checked in</Badge>
                      <Button
                        size="sm"
                        icon={Pencil}
                        onclick={() => startEditingTime(reg)}
                      >
                        Edit time
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={Undo2}
                        loading={busyRegistrationId === reg.id}
                        onclick={() => (pendingUncheck = reg)}
                      >
                        Un-check in
                      </Button>
                    {:else}
                      <Button
                        size="sm"
                        variant="primary"
                        icon={Check}
                        loading={busyRegistrationId === reg.id}
                        onclick={() => setCheckIn(reg, true)}
                      >
                        Check in
                      </Button>
                      <Button size="sm" icon={Pencil} onclick={() => startEditingTime(reg)}>
                        Set time
                      </Button>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
    </div>
  {/if}
</Panel>

<ConfirmDialog
  open={!!pendingUncheck}
  title="Un-check in {pendingUncheck?.name || 'this volunteer'}?"
  message="Their check-in time will be cleared. Use this if someone was checked in by accident."
  confirmLabel="Un-check in"
  tone="danger"
  busy={!!busyRegistrationId}
  onConfirm={() => setCheckIn(pendingUncheck, false)}
  onCancel={() => (pendingUncheck = null)}
/>
