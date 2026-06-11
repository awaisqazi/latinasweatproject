<script>
  import { onMount } from "svelte";
  import { Check, ChevronDown, Copy, Megaphone, Trash2 } from "@lucide/svelte";
  import {
    DOW_FULL,
    ROOMS,
    ROOM_SHORT,
    ROOM_TONES,
    formatTime12,
    parseDateStr,
    timeToMinutes,
    toDateStr,
  } from "../../../lib/dashboard/spacesAdmin.js";
  import { formatShortDate } from "../../../lib/dashboard/volunteersAdmin.js";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";

  export let supabase;
  export let dataVersion = 0;
  export let onChanged = () => {};

  // ---- periods ----
  let periods = [];
  let countsByPeriod = {};
  let periodsLoading = false;
  let loadedOnce = false;
  let loadError = "";
  let actionError = "";
  let successMessage = "";
  let busyPeriodId = "";

  // ---- shared reference data ----
  // Active slots back the Assign buttons; slot stats are static history, so
  // one load per mount is enough.
  let slots = [];
  let slotStats = [];

  // ---- interest review ----
  let expandedPeriodId = "";
  let interestRows = [];
  let interestLoading = false;
  let interestError = "";

  let copiedPeriodId = "";
  let copyTimer = null;

  let lastVersion = dataVersion;
  $: if (dataVersion !== lastVersion) {
    lastVersion = dataVersion;
    refresh();
  }

  onMount(() => {
    refresh();
    loadSlotStats();
    return () => clearTimeout(copyTimer);
  });

  function refresh() {
    loadPeriods();
    loadSlots();
    if (expandedPeriodId) loadInterest(expandedPeriodId);
  }

  async function loadPeriods() {
    if (!supabase) return;
    periodsLoading = true;
    loadError = "";

    const [periodsRes, countsRes] = await Promise.all([
      supabase
        .from("schedule_periods")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("slot_interest").select("period_id"),
    ]);

    if (periodsRes.error) {
      loadError = periodsRes.error.message;
    } else {
      periods = periodsRes.data || [];
      loadedOnce = true;
    }

    if (!countsRes.error) {
      const counts = {};
      for (const row of countsRes.data || []) {
        counts[row.period_id] = (counts[row.period_id] || 0) + 1;
      }
      countsByPeriod = counts;
    }

    periodsLoading = false;
  }

  async function loadSlots() {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("class_schedule_slots")
      .select("*")
      .eq("active", true);

    // Assignment is the only consumer; a load error here just leaves the
    // Assign buttons disabled rather than blocking review.
    if (!error) slots = data || [];
  }

  async function loadSlotStats() {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("class_history_slot_stats")
      .select("*");

    // Historical context is a nice-to-have; skip the badges on error.
    if (!error) slotStats = data || [];
  }

  function toggleExpand(periodId) {
    if (expandedPeriodId === periodId) {
      expandedPeriodId = "";
      interestRows = [];
      interestError = "";
      return;
    }
    expandedPeriodId = periodId;
    loadInterest(periodId);
  }

  async function loadInterest(periodId) {
    interestLoading = true;
    interestError = "";
    interestRows = [];

    const { data, error } = await supabase
      .from("slot_interest")
      .select("*")
      .eq("period_id", periodId)
      .order("created_at", { ascending: true });

    // The admin collapsed or switched periods mid-flight; drop the response.
    if (expandedPeriodId !== periodId) return;

    if (error) {
      interestError = error.message;
    } else {
      interestRows = data || [];
    }
    interestLoading = false;
  }

  // ---- grouped review (room/day/time) ----
  $: expandedPeriod = periods.find((p) => p.id === expandedPeriodId) || null;
  $: reviewGroups = buildGroups(interestRows, slots, slotStats, expandedPeriod);

  function buildGroups(rows, activeSlots, stats, period) {
    if (!period) return [];

    const map = new Map();
    for (const row of rows || []) {
      const key = `${row.room}|${row.day_of_week}|${(row.start_time || "").slice(0, 5)}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          room: row.room,
          day: Number(row.day_of_week),
          time: row.start_time,
          responses: [],
        });
      }
      map.get(key).responses.push(row);
    }

    const groups = [...map.values()];
    for (const group of groups) {
      group.classType =
        group.responses.find((r) => r.class_type)?.class_type || "";
      group.slot = findSlotFor(group, activeSlots, period);
      group.hist = findStatFor(group, stats);
    }

    const roomIndex = (room) => {
      const i = ROOMS.indexOf(room);
      return i === -1 ? ROOMS.length : i;
    };
    return groups.sort(
      (a, b) =>
        roomIndex(a.room) - roomIndex(b.room) ||
        a.day - b.day ||
        timeToMinutes(a.time) - timeToMinutes(b.time),
    );
  }

  function findSlotFor(group, activeSlots, period) {
    return (
      (activeSlots || []).find(
        (s) =>
          s.room === group.room &&
          Number(s.day_of_week) === group.day &&
          timeToMinutes(s.start_time) === timeToMinutes(group.time) &&
          (!s.effective_from || s.effective_from <= period.starts_on) &&
          (!s.effective_until || s.effective_until >= period.starts_on),
      ) || null
    );
  }

  function findStatFor(group, stats) {
    return (
      (stats || []).find(
        (s) =>
          s.classroom === group.room &&
          Number(s.day_of_week) === group.day &&
          timeToMinutes(s.start_time) === timeToMinutes(group.time),
      ) || null
    );
  }

  function histTone(stat) {
    const util = Number(stat?.avg_utilization || 0);
    if (util >= 40) return "green";
    if (util >= 20) return "amber";
    return "red";
  }

  function isAssigned(slot, response) {
    return Boolean(
      slot?.instructor &&
        slot.instructor.trim().toLowerCase() ===
          (response.instructor_name || "").trim().toLowerCase(),
    );
  }

  // ---- period actions ----
  let confirmingClosePeriod = null;
  let confirmingDeletePeriod = null;
  let isClosing = false;
  let isDeleting = false;

  async function copyFormLink(period) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/teach`);
      copiedPeriodId = period.id;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copiedPeriodId = ""), 2000);
    } catch {
      actionError = "Could not copy the link. The form lives at /teach.";
    }
  }

  async function setStatus(period, status) {
    if (busyPeriodId) return;
    busyPeriodId = period.id;
    actionError = "";
    successMessage = "";

    const { error } = await supabase
      .from("schedule_periods")
      .update({ status })
      .eq("id", period.id)
      .select()
      .single();

    if (error) {
      actionError = error.message;
    } else {
      onChanged();
      await loadPeriods();
    }
    busyPeriodId = "";
  }

  async function confirmClose() {
    if (!confirmingClosePeriod || isClosing) return;
    isClosing = true;
    await setStatus(confirmingClosePeriod, "closed");
    isClosing = false;
    confirmingClosePeriod = null;
  }

  async function deletePeriod() {
    if (!confirmingDeletePeriod || isDeleting) return;
    isDeleting = true;
    actionError = "";
    successMessage = "";

    const { error } = await supabase
      .from("schedule_periods")
      .delete()
      .eq("id", confirmingDeletePeriod.id);

    if (error) {
      actionError = error.message;
      isDeleting = false;
      confirmingDeletePeriod = null;
      return;
    }

    if (expandedPeriodId === confirmingDeletePeriod.id) {
      expandedPeriodId = "";
      interestRows = [];
    }
    isDeleting = false;
    confirmingDeletePeriod = null;
    onChanged();
    loadPeriods();
  }

  // ---- assignment ----
  let pendingAssign = null; // { group, response, slot }
  let isAssigning = false;

  function requestAssign(group, response) {
    if (!group.slot) return;
    successMessage = "";
    pendingAssign = { group, response, slot: group.slot };
  }

  async function confirmAssign() {
    if (!pendingAssign || isAssigning) return;
    const { group, response, slot } = pendingAssign;
    isAssigning = true;
    actionError = "";

    const { data, error } = await supabase
      .from("class_schedule_slots")
      .update({ instructor: response.instructor_name })
      .eq("id", slot.id)
      .select()
      .single();

    isAssigning = false;
    pendingAssign = null;

    if (error) {
      actionError = error.message;
      return;
    }

    // Refresh the local copy so the "Assigned" badges recompute.
    slots = slots.map((s) => (s.id === slot.id ? data : s));
    successMessage = `Assigned ${response.instructor_name} to ${group.classType || slot.class_type || "this class"} on ${DOW_FULL[group.day]} at ${formatTime12(group.time)}.`;
    onChanged();
  }

  // ---- open interest form drawer ----
  let drawerOpen = false;
  let drawerShown = false; // keeps content mounted through the close animation
  let isSaving = false;
  let drawerError = "";

  let titleDraft = "";
  let startsOnDraft = "";
  let notesDraft = "";

  function firstOfNextMonth() {
    const now = new Date();
    return toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  }

  function openCreate() {
    titleDraft = "";
    startsOnDraft = firstOfNextMonth();
    notesDraft = "";
    drawerError = "";
    drawerShown = true;
    drawerOpen = true;
  }

  function requestCloseDrawer() {
    if (isSaving) return;
    drawerOpen = false;
  }

  function handleDrawerClosed() {
    drawerOpen = false;
    drawerShown = false;
    drawerError = "";
  }

  async function savePeriod(event) {
    event?.preventDefault();
    if (isSaving) return;

    const title = titleDraft.trim();
    if (!title) {
      drawerError = "A title is required.";
      return;
    }
    if (!startsOnDraft) {
      drawerError = "A start date is required.";
      return;
    }

    isSaving = true;
    drawerError = "";

    const { error } = await supabase
      .from("schedule_periods")
      .insert({
        title,
        starts_on: startsOnDraft,
        notes: notesDraft.trim() || null,
      })
      .select()
      .single();

    if (error) {
      drawerError = error.message;
      isSaving = false;
      return;
    }

    isSaving = false;
    drawerOpen = false;
    onChanged();
    loadPeriods();
  }
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <p class="text-sm text-ink/65">
      Collect instructor interest for the next schedule period, then assign
      teachers to slots.
    </p>
    <Button variant="primary" icon={Megaphone} onclick={openCreate}>
      Open interest form
    </Button>
  </div>

  {#if actionError}
    <Banner tone="error" message={actionError} onDismiss={() => (actionError = "")} />
  {/if}
  {#if successMessage}
    <Banner tone="success" message={successMessage} onDismiss={() => (successMessage = "")} />
  {/if}

  {#if !loadedOnce && loadError}
    <Banner tone="error" message={loadError} onRetry={loadPeriods} />
  {:else if !loadedOnce}
    <div class="space-y-3">
      {#each Array(3) as _, i (i)}
        <SkeletonCard lines={3} />
      {/each}
    </div>
  {:else}
    {#if loadError}
      <Banner tone="error" message={loadError} onRetry={loadPeriods} />
    {/if}

    {#if !periods.length}
      <EmptyState
        icon={Megaphone}
        title="No schedule periods"
        message="Open an interest form to start collecting instructor availability for the next period."
      >
        <Button slot="actions" variant="primary" icon={Megaphone} onclick={openCreate}>
          Open interest form
        </Button>
      </EmptyState>
    {:else}
      <div class="space-y-3" aria-busy={periodsLoading || undefined}>
        {#each periods as period (period.id)}
          {@const expanded = expandedPeriodId === period.id}
          {@const responseCount = countsByPeriod[period.id] || 0}
          <section class="rounded-card border border-ink/8 bg-white shadow-card">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-expanded={expanded}
                onclick={() => toggleExpand(period.id)}
              >
                <ChevronDown
                  class="h-4 w-4 shrink-0 text-ink/50 transition-transform {expanded ? '' : '-rotate-90'}"
                  aria-hidden="true"
                />
                <span class="min-w-0">
                  <span class="block truncate text-sm font-bold text-ink">{period.title}</span>
                  <span class="mt-0.5 block text-xs text-ink/65">
                    Starts {formatShortDate(parseDateStr(period.starts_on))} ·
                    {responseCount} response{responseCount === 1 ? "" : "s"}
                  </span>
                </span>
              </button>
              {#if period.status === "collecting"}
                <Badge tone="green" dot size="xs">Collecting responses</Badge>
              {:else}
                <Badge tone="neutral" size="xs">Closed</Badge>
              {/if}
              <div class="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={copiedPeriodId === period.id ? Check : Copy}
                  onclick={() => copyFormLink(period)}
                >
                  {copiedPeriodId === period.id ? "Copied" : "Copy form link"}
                </Button>
                {#if period.status === "collecting"}
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busyPeriodId === period.id}
                    onclick={() => (confirmingClosePeriod = period)}
                  >
                    Close
                  </Button>
                {:else}
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busyPeriodId === period.id}
                    onclick={() => setStatus(period, "collecting")}
                  >
                    Reopen
                  </Button>
                {/if}
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  iconOnly
                  label="Delete period"
                  onclick={() => (confirmingDeletePeriod = period)}
                />
              </div>
            </div>

            {#if expanded}
              <div class="border-t border-ink/8 px-4 py-4">
                {#if interestError}
                  <Banner
                    tone="error"
                    message={interestError}
                    onRetry={() => loadInterest(period.id)}
                  />
                {:else if interestLoading}
                  <SkeletonCard lines={3} />
                {:else if !reviewGroups.length}
                  <EmptyState
                    title="No responses yet"
                    message="Share the form link with instructors to start collecting interest."
                  />
                {:else}
                  <div class="space-y-5">
                    {#each reviewGroups as group (group.key)}
                      <section>
                        <div class="flex flex-wrap items-center gap-2">
                          <h4 class="text-sm font-bold text-ink">
                            {DOW_FULL[group.day]} {formatTime12(group.time)}
                          </h4>
                          <Badge tone={ROOM_TONES[group.room] || "neutral"} size="xs">
                            {ROOM_SHORT[group.room] || group.room}
                          </Badge>
                          {#if group.classType}
                            <span class="text-xs text-ink/65">{group.classType}</span>
                          {/if}
                          <Badge tone="gold" size="xs">
                            {group.responses.length} interested
                          </Badge>
                          {#if group.hist}
                            <Badge tone={histTone(group.hist)} size="xs">
                              hist: avg {group.hist.avg_utilization}% util
                            </Badge>
                          {/if}
                        </div>
                        <ul class="mt-2 divide-y divide-ink/8 rounded-control border border-ink/10">
                          {#each group.responses as response (response.id)}
                            {@const assigned = isAssigned(group.slot, response)}
                            <li class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
                              <div class="min-w-0 flex-1">
                                <p class="text-sm font-bold text-ink">
                                  {response.instructor_name}
                                </p>
                                <p class="mt-0.5 truncate text-xs text-ink/65">
                                  {response.instructor_email}
                                </p>
                                {#if response.notes}
                                  <p class="mt-1 text-xs text-ink/65">{response.notes}</p>
                                {/if}
                                <p class="mt-1 text-[11px] text-ink/45">
                                  Submitted {formatShortDate(response.created_at)}
                                </p>
                              </div>
                              {#if assigned}
                                <Badge tone="green" dot size="xs">Assigned</Badge>
                              {:else if group.slot}
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onclick={() => requestAssign(group, response)}
                                >
                                  Assign
                                </Button>
                              {:else}
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled
                                  title="No active slot at this time for this period"
                                >
                                  Assign
                                </Button>
                              {/if}
                            </li>
                          {/each}
                        </ul>
                      </section>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </section>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<SlideOver
  open={drawerOpen}
  title="Open interest form"
  eyebrow="Planning"
  closeLabel="Close interest form editor"
  closeDisabled={isSaving}
  onClose={() => (drawerOpen = false)}
  onClosed={handleDrawerClosed}
>
  {#if drawerShown}
    <form class="flex min-h-full flex-col" onsubmit={savePeriod}>
      <div class="flex-1 space-y-4 px-5 py-5">
        {#if drawerError}
          <Banner tone="error" message={drawerError} />
        {/if}

        <Field label="Title" id="period-title" required>
          <input
            id="period-title"
            type="text"
            class="input"
            placeholder="July 2026 schedule"
            bind:value={titleDraft}
            required
            disabled={isSaving}
          />
        </Field>

        <Field label="Starts on" id="period-starts-on" required>
          <input
            id="period-starts-on"
            type="date"
            class="input"
            bind:value={startsOnDraft}
            required
            disabled={isSaving}
          />
        </Field>

        <Field
          label="Notes"
          id="period-notes"
          hint="Shown to instructors on the public form"
        >
          <textarea
            id="period-notes"
            class="textarea min-h-24"
            placeholder="Deadlines, pay updates, anything instructors should know"
            bind:value={notesDraft}
            disabled={isSaving}
          ></textarea>
        </Field>
      </div>

      <div class="flex items-center justify-between gap-2 border-t border-ink/8 px-5 py-4">
        <Button variant="ghost" disabled={isSaving} onclick={requestCloseDrawer}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={isSaving}>Open form</Button>
      </div>
    </form>
  {/if}
</SlideOver>

<ConfirmDialog
  open={!!confirmingClosePeriod}
  title="Close interest form?"
  message="Instructors will no longer be able to submit interest."
  confirmLabel="Close form"
  tone="primary"
  busy={isClosing}
  onConfirm={confirmClose}
  onCancel={() => (confirmingClosePeriod = null)}
/>

<ConfirmDialog
  open={!!confirmingDeletePeriod}
  title="Delete schedule period?"
  message={confirmingDeletePeriod
    ? `Delete "${confirmingDeletePeriod.title}"? All interest responses for this period are deleted with it.`
    : ""}
  confirmLabel="Delete period"
  tone="danger"
  busy={isDeleting}
  onConfirm={deletePeriod}
  onCancel={() => (confirmingDeletePeriod = null)}
/>

<ConfirmDialog
  open={!!pendingAssign}
  title="Assign instructor?"
  message={pendingAssign
    ? `Assign ${pendingAssign.response.instructor_name} to ${pendingAssign.group.classType || pendingAssign.slot.class_type || "this class"} on ${DOW_FULL[pendingAssign.group.day]} at ${formatTime12(pendingAssign.group.time)}?`
    : ""}
  confirmLabel="Assign"
  tone="primary"
  busy={isAssigning}
  onConfirm={confirmAssign}
  onCancel={() => (pendingAssign = null)}
/>
