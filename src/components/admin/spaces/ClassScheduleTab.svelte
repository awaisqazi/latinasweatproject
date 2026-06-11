<script>
  import { onMount } from "svelte";
  import { CalendarPlus, ChevronDown, Plus, RotateCcw, Trash2 } from "@lucide/svelte";
  import {
    DOW_FULL,
    DOW_LABELS,
    ROOMS,
    ROOM_SHORT,
    ROOM_TONES,
    formatTime12,
    isConflictError,
    parseDateStr,
    timeToMinutes,
    toDateStr,
  } from "../../../lib/dashboard/spacesAdmin.js";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";

  export let supabase;
  export let dataVersion = 0;
  export let onChanged = () => {};

  // ---- schedule data ----
  let slots = [];
  let slotsLoading = false;
  let loadedOnce = false;
  let loadError = "";
  let actionError = "";
  let busySlotId = "";

  // ---- history reference data (class_history is a static import, so one
  // load per mount is enough; it never changes from inside the portal) ----
  let slotStats = [];
  let slotStatsLoaded = false;
  let classTypeOptions = [];
  let instructorOptions = [];

  let roomFilter = "all";
  let pausedOpen = false;

  const todayStr = toDateStr(new Date());

  let lastVersion = dataVersion;
  $: if (dataVersion !== lastVersion) {
    lastVersion = dataVersion;
    loadSlots();
  }

  onMount(() => {
    loadSlots();
    loadHistory();
  });

  async function loadSlots() {
    if (!supabase) return;
    slotsLoading = true;
    loadError = "";

    const { data, error } = await supabase
      .from("class_schedule_slots")
      .select("*")
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      loadError = error.message;
    } else {
      slots = data || [];
      loadedOnce = true;
    }

    slotsLoading = false;
  }

  async function loadHistory() {
    if (!supabase) return;

    const [slotRes, typeRes, instructorRes] = await Promise.all([
      supabase.from("class_history_slot_stats").select("*"),
      supabase.from("class_history_type_stats").select("class_type"),
      supabase.from("class_history_instructor_stats").select("instructor"),
    ]);

    // Autocomplete and the history assist are nice-to-haves; a load error
    // here just means the drawer skips them rather than blocking scheduling.
    if (!slotRes.error) {
      slotStats = slotRes.data || [];
      slotStatsLoaded = true;
    }
    classTypeOptions = [
      ...new Set((typeRes.data || []).map((r) => r.class_type).filter(Boolean)),
    ];
    instructorOptions = [
      ...new Set((instructorRes.data || []).map((r) => r.instructor).filter(Boolean)),
    ];
  }

  $: filteredSlots =
    roomFilter === "all" ? slots : slots.filter((s) => s.room === roomFilter);
  $: pausedSlots = filteredSlots.filter((s) => !s.active);
  $: slotsByDay = DOW_LABELS.map((_, day) =>
    filteredSlots
      .filter((s) => s.active && s.day_of_week === day)
      .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)),
  );
  $: hasActiveSlots = slotsByDay.some((day) => day.length > 0);

  function formatDateShort(dateStr) {
    if (!dateStr) return "";
    return parseDateStr(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  function windowHint(slot) {
    if (slot.effective_from && slot.effective_from > todayStr) {
      return `Starts ${formatDateShort(slot.effective_from)}`;
    }
    if (slot.effective_until) {
      return `Until ${formatDateShort(slot.effective_until)}`;
    }
    return "";
  }

  const PILL_BASE =
    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors";
  function pillClass(selected) {
    return selected
      ? `${PILL_BASE} border-ink bg-ink text-white`
      : `${PILL_BASE} border-ink/14 bg-white text-ink/70 hover:border-ink/30 hover:text-ink`;
  }

  // ---- slot editor drawer (create + edit) ----
  let drawerOpen = false;
  let drawerShown = false; // keeps content mounted through the close animation
  let editingSlot = null;
  let isSaving = false;
  let isDeleting = false;
  let drawerError = "";
  let confirmingDelete = false;

  let dayDraft = 1;
  let timeDraft = "";
  let durationDraft = 60;
  let classTypeDraft = "";
  let instructorDraft = "";
  let roomDraft = ROOMS[0];
  let effectiveFromDraft = "";
  let effectiveUntilDraft = "";
  let notesDraft = "";
  let activeDraft = true;

  function openCreate() {
    editingSlot = null;
    dayDraft = 1;
    timeDraft = "";
    durationDraft = 60;
    classTypeDraft = "";
    instructorDraft = "";
    roomDraft = roomFilter === "all" ? ROOMS[0] : roomFilter;
    effectiveFromDraft = toDateStr(new Date());
    effectiveUntilDraft = "";
    notesDraft = "";
    activeDraft = true;
    drawerError = "";
    drawerShown = true;
    drawerOpen = true;
  }

  function openEdit(slot) {
    editingSlot = slot;
    dayDraft = slot.day_of_week;
    timeDraft = (slot.start_time || "").slice(0, 5);
    durationDraft = slot.duration_minutes;
    classTypeDraft = slot.class_type || "";
    instructorDraft = slot.instructor || "";
    roomDraft = slot.room;
    effectiveFromDraft = slot.effective_from || toDateStr(new Date());
    effectiveUntilDraft = slot.effective_until || "";
    notesDraft = slot.notes || "";
    activeDraft = !!slot.active;
    drawerError = "";
    drawerShown = true;
    drawerOpen = true;
  }

  function requestCloseDrawer() {
    if (isSaving || isDeleting) return;
    drawerOpen = false;
  }

  function handleDrawerClosed() {
    drawerOpen = false;
    drawerShown = false;
    editingSlot = null;
    confirmingDelete = false;
    drawerError = "";
  }

  // Data-informed scheduling assist: once day + start time + room are chosen,
  // surface what historically happened in that exact slot.
  $: slotHistory = lookupSlotHistory(drawerShown, dayDraft, timeDraft, roomDraft);

  function lookupSlotHistory(shown, day, time, room) {
    if (!shown || !slotStatsLoaded || !time || !room) return null;
    if (day === null || day === undefined || day === "") return null;

    const minutes = timeToMinutes(time);
    const stat = slotStats.find(
      (s) =>
        s.classroom === room &&
        Number(s.day_of_week) === Number(day) &&
        timeToMinutes(s.start_time) === minutes,
    );

    if (!stat) return { message: "No history for this slot." };

    const sessions = Number(stat.sessions || 0);
    const utilization = Math.round(Number(stat.avg_utilization || 0) * 10) / 10;
    const checkedIn = Math.round(Number(stat.avg_checked_in || 0) * 10) / 10;
    return {
      message: `History: ${sessions} session${sessions === 1 ? "" : "s"} at this slot, avg utilization ${utilization}%, avg ${checkedIn} checked in.`,
    };
  }

  async function saveSlot(event) {
    event?.preventDefault();
    if (isSaving || isDeleting) return;

    const classType = classTypeDraft.trim();
    if (!classType) {
      drawerError = "A class type is required.";
      return;
    }
    if (!timeDraft) {
      drawerError = "A start time is required.";
      return;
    }
    const duration = Math.round(Number(durationDraft) || 0);
    if (duration < 15) {
      drawerError = "Duration must be at least 15 minutes.";
      return;
    }
    if (!effectiveFromDraft) {
      drawerError = "An effective-from date is required.";
      return;
    }
    if (effectiveUntilDraft && effectiveUntilDraft < effectiveFromDraft) {
      drawerError = "Effective until must be on or after effective from.";
      return;
    }

    isSaving = true;
    drawerError = "";

    const payload = {
      day_of_week: Number(dayDraft),
      start_time: timeDraft,
      duration_minutes: duration,
      class_type: classType,
      instructor: instructorDraft.trim() || null,
      room: roomDraft,
      active: activeDraft,
      effective_from: effectiveFromDraft,
      effective_until: effectiveUntilDraft || null,
      notes: notesDraft.trim() || null,
    };

    const request = editingSlot
      ? supabase
          .from("class_schedule_slots")
          .update(payload)
          .eq("id", editingSlot.id)
          .select()
          .single()
      : supabase.from("class_schedule_slots").insert(payload).select().single();

    const { error } = await request;

    if (error) {
      drawerError = isConflictError(error)
        ? `Scheduling conflict: ${error.message}`
        : error.message;
      isSaving = false;
      return;
    }

    isSaving = false;
    drawerOpen = false;
    onChanged();
    loadSlots();
  }

  async function deleteSlot() {
    if (!editingSlot?.id || isDeleting) return;

    isDeleting = true;
    drawerError = "";

    const { error } = await supabase
      .from("class_schedule_slots")
      .delete()
      .eq("id", editingSlot.id);

    if (error) {
      drawerError = error.message;
      isDeleting = false;
      confirmingDelete = false;
      return;
    }

    isDeleting = false;
    confirmingDelete = false;
    drawerOpen = false;
    onChanged();
    loadSlots();
  }

  async function restoreSlot(slot) {
    if (busySlotId) return;

    busySlotId = slot.id;
    actionError = "";

    const { error } = await supabase
      .from("class_schedule_slots")
      .update({ active: true })
      .eq("id", slot.id)
      .select()
      .single();

    if (error) {
      actionError = isConflictError(error)
        ? `Cannot restore "${slot.class_type}". Scheduling conflict: ${error.message}`
        : error.message;
    } else {
      onChanged();
      await loadSlots();
    }

    busySlotId = "";
  }
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by room">
      <button
        type="button"
        class={pillClass(roomFilter === "all")}
        aria-pressed={roomFilter === "all"}
        onclick={() => (roomFilter = "all")}
      >
        All
      </button>
      {#each ROOMS as room (room)}
        <button
          type="button"
          class={pillClass(roomFilter === room)}
          aria-pressed={roomFilter === room}
          onclick={() => (roomFilter = room)}
        >
          {ROOM_SHORT[room]}
        </button>
      {/each}
    </div>
    <Button variant="primary" icon={Plus} onclick={openCreate}>New class slot</Button>
  </div>

  {#if actionError}
    <Banner tone="error" message={actionError} onDismiss={() => (actionError = "")} />
  {/if}

  {#if !loadedOnce && loadError}
    <Banner tone="error" message={loadError} onRetry={loadSlots} />
  {:else if !loadedOnce}
    <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      {#each Array(4) as _, i (i)}
        <SkeletonCard lines={4} />
      {/each}
    </div>
  {:else}
    {#if loadError}
      <Banner tone="error" message={loadError} onRetry={loadSlots} />
    {/if}

    <Panel title="Weekly schedule" id="class-schedule-weekly-title" loading={slotsLoading}>
      {#if !hasActiveSlots}
        <EmptyState
          icon={CalendarPlus}
          title="No active classes"
          message={roomFilter === "all"
            ? "Create the first class slot to start building the weekly schedule."
            : `No active classes in ${ROOM_SHORT[roomFilter]}. Switch rooms or add a slot.`}
        >
          <Button slot="actions" variant="primary" icon={Plus} onclick={openCreate}>
            New class slot
          </Button>
        </EmptyState>
      {:else}
        <!-- Desktop: 7-column week grid -->
        <div class="hidden lg:grid lg:grid-cols-7 lg:gap-2">
          {#each DOW_LABELS as label, day (label)}
            <div class="min-w-0">
              <h4 class="text-center text-xs font-semibold uppercase tracking-wide text-ink/55">
                {label}
              </h4>
              <div class="mt-2 space-y-2">
                {#if slotsByDay[day].length}
                  {#each slotsByDay[day] as slot (slot.id)}
                    <button
                      type="button"
                      class="w-full rounded-control border border-ink/10 bg-white p-2.5 text-left shadow-card transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      onclick={() => openEdit(slot)}
                    >
                      <p class="text-xs font-semibold text-ink/65">
                        {formatTime12(slot.start_time)} · {slot.duration_minutes} min
                      </p>
                      <p class="mt-0.5 break-words text-sm font-bold leading-snug text-ink">
                        {slot.class_type}
                      </p>
                      {#if slot.instructor}
                        <p class="mt-0.5 truncate text-xs text-ink/65">{slot.instructor}</p>
                      {:else}
                        <p class="mt-0.5 text-xs italic text-ink/45">Unassigned</p>
                      {/if}
                      <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={ROOM_TONES[slot.room] || "neutral"} size="xs">
                          {ROOM_SHORT[slot.room] || slot.room}
                        </Badge>
                        {#if windowHint(slot)}
                          <span class="text-[11px] text-ink/45">{windowHint(slot)}</span>
                        {/if}
                      </div>
                    </button>
                  {/each}
                {:else}
                  <p class="rounded-control border border-dashed border-ink/10 py-3 text-center text-xs text-ink/35">
                    No classes
                  </p>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <!-- Mobile: stacked day sections, empty days skipped -->
        <div class="space-y-5 lg:hidden">
          {#each DOW_FULL as label, day (label)}
            {#if slotsByDay[day].length}
              <section>
                <h4 class="text-sm font-bold text-ink">{label}</h4>
                <div class="mt-2 space-y-2">
                  {#each slotsByDay[day] as slot (slot.id)}
                    <button
                      type="button"
                      class="w-full rounded-control border border-ink/10 bg-white p-3 text-left shadow-card transition hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      onclick={() => openEdit(slot)}
                    >
                      <div class="flex flex-wrap items-start justify-between gap-2">
                        <div class="min-w-0">
                          <p class="text-xs font-semibold text-ink/65">
                            {formatTime12(slot.start_time)} · {slot.duration_minutes} min
                          </p>
                          <p class="mt-0.5 break-words text-sm font-bold leading-snug text-ink">
                            {slot.class_type}
                          </p>
                          {#if slot.instructor}
                            <p class="mt-0.5 truncate text-xs text-ink/65">{slot.instructor}</p>
                          {:else}
                            <p class="mt-0.5 text-xs italic text-ink/45">Unassigned</p>
                          {/if}
                        </div>
                        <div class="flex shrink-0 flex-col items-end gap-1.5">
                          <Badge tone={ROOM_TONES[slot.room] || "neutral"} size="xs">
                            {ROOM_SHORT[slot.room] || slot.room}
                          </Badge>
                          {#if windowHint(slot)}
                            <span class="text-[11px] text-ink/45">{windowHint(slot)}</span>
                          {/if}
                        </div>
                      </div>
                    </button>
                  {/each}
                </div>
              </section>
            {/if}
          {/each}
        </div>
      {/if}
    </Panel>

    {#if pausedSlots.length}
      <section class="rounded-card border border-ink/8 bg-white shadow-card">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-4 py-3 text-left"
          aria-expanded={pausedOpen}
          onclick={() => (pausedOpen = !pausedOpen)}
        >
          <ChevronDown
            class="h-4 w-4 shrink-0 text-ink/50 transition-transform {pausedOpen ? '' : '-rotate-90'}"
            aria-hidden="true"
          />
          <span class="text-sm font-bold text-ink">Paused slots</span>
          <Badge tone="neutral" size="xs">{pausedSlots.length}</Badge>
        </button>
        {#if pausedOpen}
          <ul class="divide-y divide-ink/8 border-t border-ink/8">
            {#each pausedSlots as slot (slot.id)}
              <li class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-bold text-ink">{slot.class_type}</p>
                  <p class="mt-0.5 text-xs text-ink/65">
                    {DOW_FULL[slot.day_of_week]} · {formatTime12(slot.start_time)} · {slot.duration_minutes} min ·
                    {#if slot.instructor}{slot.instructor}{:else}<span class="italic text-ink/45">Unassigned</span>{/if}
                  </p>
                </div>
                <Badge tone={ROOM_TONES[slot.room] || "neutral"} size="xs">
                  {ROOM_SHORT[slot.room] || slot.room}
                </Badge>
                <div class="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onclick={() => openEdit(slot)}>Edit</Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={RotateCcw}
                    loading={busySlotId === slot.id}
                    onclick={() => restoreSlot(slot)}
                  >
                    Restore
                  </Button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  {/if}
</div>

<SlideOver
  open={drawerOpen}
  title={editingSlot ? "Edit class slot" : "New class slot"}
  eyebrow="Class schedule"
  closeLabel="Close slot editor"
  closeDisabled={isSaving || isDeleting}
  onClose={() => (drawerOpen = false)}
  onClosed={handleDrawerClosed}
>
  {#if drawerShown}
    <form class="flex min-h-full flex-col" onsubmit={saveSlot}>
      <div class="flex-1 space-y-4 px-5 py-5">
        {#if drawerError}
          <Banner tone="error" message={drawerError} />
        {/if}

        <div class="grid grid-cols-2 gap-3">
          <Field label="Day of week" id="slot-day" required>
            <select id="slot-day" class="select" bind:value={dayDraft} disabled={isSaving}>
              {#each DOW_FULL as label, i (label)}
                <option value={i}>{label}</option>
              {/each}
            </select>
          </Field>
          <Field label="Start time" id="slot-start" required>
            <input
              id="slot-start"
              type="time"
              class="input"
              bind:value={timeDraft}
              required
              disabled={isSaving}
            />
          </Field>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <Field label="Duration (minutes)" id="slot-duration" required>
            <input
              id="slot-duration"
              type="number"
              class="input"
              min="15"
              step="15"
              bind:value={durationDraft}
              required
              disabled={isSaving}
            />
          </Field>
          <Field label="Room" id="slot-room" required>
            <select id="slot-room" class="select" bind:value={roomDraft} disabled={isSaving}>
              {#each ROOMS as room (room)}
                <option value={room}>{room}</option>
              {/each}
            </select>
          </Field>
        </div>

        {#if slotHistory}
          <Banner tone="info" message={slotHistory.message} />
        {/if}

        <Field label="Class type" id="slot-class-type" required>
          <input
            id="slot-class-type"
            type="text"
            class="input"
            list="slot-class-type-options"
            placeholder="Class name"
            bind:value={classTypeDraft}
            required
            disabled={isSaving}
          />
          <datalist id="slot-class-type-options">
            {#each classTypeOptions as option (option)}
              <option value={option}></option>
            {/each}
          </datalist>
        </Field>

        <Field
          label="Instructor"
          id="slot-instructor"
          hint="Leave blank to mark the slot unassigned"
        >
          <input
            id="slot-instructor"
            type="text"
            class="input"
            list="slot-instructor-options"
            placeholder="Instructor name"
            bind:value={instructorDraft}
            disabled={isSaving}
          />
          <datalist id="slot-instructor-options">
            {#each instructorOptions as option (option)}
              <option value={option}></option>
            {/each}
          </datalist>
        </Field>

        <div class="grid grid-cols-2 gap-3">
          <Field label="Effective from" id="slot-effective-from" required>
            <input
              id="slot-effective-from"
              type="date"
              class="input"
              bind:value={effectiveFromDraft}
              required
              disabled={isSaving}
            />
          </Field>
          <Field label="Effective until" id="slot-effective-until" hint="Leave blank for ongoing">
            <input
              id="slot-effective-until"
              type="date"
              class="input"
              bind:value={effectiveUntilDraft}
              disabled={isSaving}
            />
          </Field>
        </div>

        <Field label="Notes" id="slot-notes">
          <textarea
            id="slot-notes"
            class="textarea min-h-20"
            placeholder="Anything the front desk should know"
            bind:value={notesDraft}
            disabled={isSaving}
          ></textarea>
        </Field>

        <label class="flex items-start gap-2.5 rounded-control border border-ink/14 bg-white px-3.5 py-3">
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 shrink-0 accent-accent"
            bind:checked={activeDraft}
            disabled={isSaving}
          />
          <span>
            <span class="block text-sm font-semibold text-ink">Active</span>
            <span class="block text-xs text-ink/55">
              Paused slots leave the weekly schedule but keep their history.
            </span>
          </span>
        </label>
      </div>

      <div class="flex items-center justify-between gap-2 border-t border-ink/8 px-5 py-4">
        {#if editingSlot}
          <Button
            variant="danger"
            icon={Trash2}
            disabled={isSaving}
            loading={isDeleting}
            onclick={() => (confirmingDelete = true)}
          >
            Delete
          </Button>
        {:else}
          <Button variant="ghost" disabled={isSaving} onclick={requestCloseDrawer}>
            Cancel
          </Button>
        {/if}
        <Button type="submit" variant="primary" loading={isSaving} disabled={isDeleting}>
          {editingSlot ? "Save changes" : "Create slot"}
        </Button>
      </div>
    </form>
  {/if}
</SlideOver>

<ConfirmDialog
  open={confirmingDelete}
  title="Delete class slot?"
  message="Delete this slot? Past history is unaffected."
  confirmLabel="Delete slot"
  tone="danger"
  busy={isDeleting}
  onConfirm={deleteSlot}
  onCancel={() => (confirmingDelete = false)}
/>
