<script>
  import { onMount } from "svelte";
  import {
    CalendarCheck,
    CalendarRange,
    ChevronLeft,
    ChevronRight,
    Plus,
    Trash2,
  } from "@lucide/svelte";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import {
    BOOKING_KINDS,
    KIND_TONES,
    ROOMS,
    ROOM_SHORT,
    ROOM_TONES,
    addDaysStr,
    formatTime12,
    isConflictError,
    parseDateStr,
    slotOccurrencesForWeek,
    timeToMinutes,
    toDateStr,
  } from "../../../lib/dashboard/spacesAdmin.js";
  import {
    composeLocalIso,
    formatShortDate,
    formatTimeRange,
    getWeekStartStr,
    toDateTimeLocalInput,
  } from "../../../lib/dashboard/volunteersAdmin.js";

  export let supabase;
  export let dataVersion = 0;
  export let onChanged = () => {};

  // Room tone -> subtle left border for read-only class chips.
  const ROOM_BORDERS = {
    "Little Village Room": "border-l-accent",
    "Gage Park Room": "border-l-brand-strong",
    Cafe: "border-l-ink/30",
  };

  const FILTERS = [
    { value: "all", label: "All rooms" },
    ...ROOMS.map((room) => ({ value: room, label: ROOM_SHORT[room] })),
  ];

  let weekStartStr = getWeekStartStr();
  let roomFilter = "all";

  let slots = [];
  let bookings = [];
  let events = [];
  let isLoadingSlots = true;
  let isLoadingBookings = true;
  let errorMessage = "";

  // ----- load orchestration ------------------------------------------------
  let mounted = false;
  let lastLoadedWeek = "";
  let lastVersion = dataVersion;

  $: if (dataVersion !== lastVersion) {
    lastVersion = dataVersion;
    loadAll();
  }
  $: if (mounted && supabase && weekStartStr !== lastLoadedWeek) {
    loadBookings();
  }

  onMount(() => {
    mounted = true;
    loadAll();
  });

  function loadAll() {
    loadSlots();
    loadBookings();
    loadEvents();
  }

  async function loadSlots() {
    if (!supabase) return;
    isLoadingSlots = true;

    const { data, error } = await supabase.from("class_schedule_slots").select("*");

    if (error) {
      errorMessage = error.message;
    } else {
      slots = data || [];
    }

    isLoadingSlots = false;
  }

  async function loadBookings() {
    if (!supabase) return;

    const loadingWeek = weekStartStr;
    lastLoadedWeek = loadingWeek;
    isLoadingBookings = true;
    errorMessage = "";

    const weekStartIso = parseDateStr(loadingWeek).toISOString();
    const weekEndIso = parseDateStr(addDaysStr(loadingWeek, 7)).toISOString();

    const { data, error } = await supabase
      .from("space_bookings")
      .select("*")
      .gte("ends_at", weekStartIso)
      .lte("starts_at", weekEndIso)
      .order("starts_at", { ascending: true });

    // A newer week was requested while this one was in flight.
    if (loadingWeek !== weekStartStr) return;

    if (error) {
      errorMessage = error.message;
    } else {
      bookings = data || [];
    }

    isLoadingBookings = false;
  }

  // Linking a booking to an event is optional, so a failure here stays quiet.
  async function loadEvents() {
    if (!supabase) return;

    const { data } = await supabase
      .from("events")
      .select("id, title, starts_at")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(50);

    events = data || [];
  }

  // ----- week building -------------------------------------------------------
  function minutesToTime12(totalMinutes) {
    const mins = ((totalMinutes % 1440) + 1440) % 1440;
    return formatTime12(`${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`);
  }

  function kindLabel(kind) {
    return BOOKING_KINDS.find((k) => k.value === kind)?.label || "Booking";
  }

  function buildDays(allSlots, weekBookings, startStr, filter) {
    const todayStr = toDateStr(new Date());
    const now = Date.now();

    const days = [];
    for (let i = 0; i < 7; i += 1) {
      const dateStr = addDaysStr(startStr, i);
      const date = parseDateStr(dateStr);
      days.push({
        dateStr,
        shortLabel: date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
        label: date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        }),
        isToday: dateStr === todayStr,
        items: [],
      });
    }
    const byDate = new Map(days.map((day) => [day.dateStr, day]));

    for (const occ of slotOccurrencesForWeek(allSlots, startStr)) {
      if (filter !== "all" && occ.slot.room !== filter) continue;
      const day = byDate.get(occ.dateStr);
      if (!day) continue;
      day.items.push({
        key: `class-${occ.slot.id}-${occ.dateStr}`,
        type: "class",
        startMinutes: occ.startMinutes,
        timeLabel: `${formatTime12(occ.slot.start_time)} - ${minutesToTime12(occ.endMinutes)}`,
        slot: occ.slot,
      });
    }

    for (const booking of weekBookings || []) {
      if (filter !== "all" && booking.space !== filter) continue;
      const starts = new Date(booking.starts_at);
      const day = byDate.get(toDateStr(starts));
      if (!day) continue;
      day.items.push({
        key: `booking-${booking.id}`,
        type: "booking",
        startMinutes: starts.getHours() * 60 + starts.getMinutes(),
        timeLabel: formatTimeRange(booking.starts_at, booking.ends_at),
        isPast: new Date(booking.ends_at).getTime() < now,
        booking,
      });
    }

    for (const day of days) {
      day.items.sort((a, b) => a.startMinutes - b.startMinutes);
    }

    return days;
  }

  $: weekDays = buildDays(slots, bookings, weekStartStr, roomFilter);
  $: weekHasItems = weekDays.some((day) => day.items.length);
  $: isLoading = isLoadingSlots || isLoadingBookings;
  $: weekRangeLabel = `${formatShortDate(parseDateStr(weekStartStr))} - ${formatShortDate(parseDateStr(addDaysStr(weekStartStr, 6)))}`;

  function prevWeek() {
    weekStartStr = addDaysStr(weekStartStr, -7);
  }

  function nextWeek() {
    weekStartStr = addDaysStr(weekStartStr, 7);
  }

  function goToToday() {
    weekStartStr = getWeekStartStr();
  }

  // ----- booking drawer ------------------------------------------------------
  let drawerOpen = false;
  let drawerActive = false; // keeps content mounted through the close animation
  let editingBooking = null; // null while creating a new booking

  let draftTitle = "";
  let draftKind = BOOKING_KINDS[0].value;
  let draftSpace = ROOMS[0];
  let draftDate = "";
  let draftStart = "09:00";
  let draftEnd = "10:00";
  let draftEventId = "";
  let draftNotes = "";

  let isSaving = false;
  let isDeleting = false;
  let isChecking = false;
  let drawerError = "";
  let conflicts = [];
  let checkMessage = "";
  let confirmingDelete = false;

  $: timeError =
    draftStart && draftEnd && timeToMinutes(draftEnd) <= timeToMinutes(draftStart)
      ? "End time must be after the start time (overnight bookings are not supported)."
      : "";

  function defaultDateForNew() {
    const todayStr = toDateStr(new Date());
    return todayStr >= weekStartStr && todayStr <= addDaysStr(weekStartStr, 6)
      ? todayStr
      : weekStartStr;
  }

  function resetDrawerMessages() {
    drawerError = "";
    conflicts = [];
    checkMessage = "";
    confirmingDelete = false;
  }

  function openNewBooking() {
    editingBooking = null;
    draftTitle = "";
    draftKind = BOOKING_KINDS[0].value;
    draftSpace = ROOMS[0];
    draftDate = defaultDateForNew();
    draftStart = "09:00";
    draftEnd = "10:00";
    draftEventId = "";
    draftNotes = "";
    resetDrawerMessages();
    drawerActive = true;
    drawerOpen = true;
  }

  function openEditBooking(booking) {
    editingBooking = booking;
    draftTitle = booking.title || "";
    draftKind = booking.kind || BOOKING_KINDS[0].value;
    draftSpace = booking.space || ROOMS[0];
    const startsLocal = toDateTimeLocalInput(booking.starts_at);
    draftDate = startsLocal.slice(0, 10);
    draftStart = startsLocal.slice(11, 16);
    draftEnd = toDateTimeLocalInput(booking.ends_at).slice(11, 16);
    draftEventId = booking.event_id || "";
    draftNotes = booking.notes || "";
    resetDrawerMessages();
    drawerActive = true;
    drawerOpen = true;
  }

  function requestCloseDrawer() {
    if (isSaving || isDeleting) return;
    drawerOpen = false;
  }

  function handleDrawerClosed() {
    drawerOpen = false;
    drawerActive = false;
    editingBooking = null;
    resetDrawerMessages();
  }

  // A check result only describes the times it was run against.
  function clearCheckState() {
    conflicts = [];
    checkMessage = "";
  }

  function conflictLine(conflict) {
    const what =
      conflict.type === "class"
        ? `class${conflict.instructor ? ` with ${conflict.instructor}` : ""}`
        : kindLabel(conflict.kind).toLowerCase();
    return `${conflict.title} (${what}) · ${formatShortDate(conflict.starts_at)} · ${formatTimeRange(conflict.starts_at, conflict.ends_at)}`;
  }

  // Shared preflight: returns true only when the slot is clear.
  async function runConflictCheck() {
    clearCheckState();
    drawerError = "";

    if (!draftDate || !draftStart || !draftEnd || timeError) {
      drawerError = timeError || "Pick a date, start time, and end time first.";
      return false;
    }

    isChecking = true;

    const { data, error } = await supabase.rpc("get_space_conflicts", {
      p_space: draftSpace,
      p_starts_at: composeLocalIso(draftDate, draftStart),
      p_ends_at: composeLocalIso(draftDate, draftEnd),
      p_exclude_booking: editingBooking?.id || null,
    });

    isChecking = false;

    if (error) {
      drawerError = error.message;
      return false;
    }

    conflicts = Array.isArray(data) ? data : [];
    if (conflicts.length) return false;

    checkMessage = `${ROOM_SHORT[draftSpace]} is free ${formatTime12(draftStart)} - ${formatTime12(draftEnd)} that day.`;
    return true;
  }

  async function saveBooking(event) {
    event?.preventDefault();
    if (isSaving) return;

    drawerError = "";

    if (!draftTitle.trim()) {
      drawerError = "Give the booking a title.";
      return;
    }
    if (!draftDate || !draftStart || !draftEnd || timeError) {
      drawerError = timeError || "Pick a date, start time, and end time.";
      return;
    }

    isSaving = true;

    const clear = await runConflictCheck();
    if (!clear) {
      isSaving = false;
      return;
    }

    const payload = {
      title: draftTitle.trim(),
      kind: draftKind,
      space: draftSpace,
      starts_at: composeLocalIso(draftDate, draftStart),
      ends_at: composeLocalIso(draftDate, draftEnd),
      event_id: draftEventId || null,
      notes: draftNotes.trim() || null,
    };

    const query = editingBooking?.id
      ? supabase.from("space_bookings").update(payload).eq("id", editingBooking.id)
      : supabase.from("space_bookings").insert(payload);
    const { error } = await query.select().single();

    if (error) {
      // The DB trigger message names the conflicting class or booking.
      drawerError = isConflictError(error)
        ? `That time is already taken: ${error.message}`
        : error.message;
      isSaving = false;
      return;
    }

    isSaving = false;
    drawerOpen = false;
    onChanged();
    loadBookings();
  }

  async function deleteBooking() {
    if (!editingBooking?.id || isDeleting) return;

    isDeleting = true;
    drawerError = "";

    const { error } = await supabase
      .from("space_bookings")
      .delete()
      .eq("id", editingBooking.id);

    isDeleting = false;
    confirmingDelete = false;

    if (error) {
      drawerError = error.message;
      return;
    }

    drawerOpen = false;
    onChanged();
    loadBookings();
  }
</script>

<Panel title="Space calendar" id="space-calendar-title" loading={isLoading}>
  <svelte:fragment slot="actions">
    <Button variant="primary" icon={Plus} onclick={openNewBooking}>New booking</Button>
  </svelte:fragment>

  <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
    <p class="text-sm font-bold text-ink/70">{weekRangeLabel}</p>
    <div class="flex items-center gap-1.5">
      <Button size="sm" iconOnly icon={ChevronLeft} label="Previous week" onclick={prevWeek} />
      <Button size="sm" onclick={goToToday}>Today</Button>
      <Button size="sm" iconOnly icon={ChevronRight} label="Next week" onclick={nextWeek} />
    </div>
  </div>

  <div class="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by room">
    {#each FILTERS as filter (filter.value)}
      <button
        type="button"
        class="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors {roomFilter === filter.value
          ? 'border-ink bg-ink text-white'
          : 'border-ink/14 bg-white text-ink/70 hover:border-ink/30 hover:text-ink'}"
        aria-pressed={roomFilter === filter.value}
        onclick={() => (roomFilter = filter.value)}
      >
        {filter.label}
      </button>
    {/each}
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} onRetry={loadAll} class="mb-4" />
  {/if}

  {#if isLoading && !weekHasItems}
    <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-7" aria-hidden="true">
      {#each Array(7) as _, i (i)}
        <SkeletonCard lines={3} />
      {/each}
    </div>
  {:else if !weekHasItems}
    <EmptyState
      title={roomFilter === "all"
        ? "Nothing scheduled this week"
        : `Nothing in ${ROOM_SHORT[roomFilter]} this week`}
      message="No classes or bookings fall in this week. Book a space to hold a room for an event or training."
      icon={CalendarRange}
    >
      <svelte:fragment slot="actions">
        <Button variant="primary" icon={Plus} onclick={openNewBooking}>New booking</Button>
      </svelte:fragment>
    </EmptyState>
  {:else}
    <!-- Desktop: 7-column week grid -->
    <div class="hidden gap-2 lg:grid lg:grid-cols-7">
      {#each weekDays as day (day.dateStr)}
        <div
          class="flex min-h-48 flex-col rounded-md border border-black/10 bg-canvas/60 p-2 {day.isToday ? 'ring-2 ring-accent/30' : ''}"
        >
          <p class="mb-2 text-center text-xs font-bold {day.isToday ? 'text-accent' : 'text-ink/65'}">
            {day.shortLabel}
          </p>
          <div class="flex-1 space-y-1.5">
            {#each day.items as item (item.key)}
              {#if item.type === "class"}
                <div
                  class="rounded border border-ink/8 border-l-4 {ROOM_BORDERS[item.slot.room] || 'border-l-ink/30'} bg-white px-1.5 py-1 text-[11px] leading-tight"
                >
                  <span class="block font-bold text-ink">{item.timeLabel}</span>
                  <span class="block text-ink/75">{item.slot.class_type}</span>
                  {#if item.slot.instructor}
                    <span class="block text-ink/65">{item.slot.instructor}</span>
                  {/if}
                  <span class="mt-1 block">
                    <Badge tone={ROOM_TONES[item.slot.room] || "neutral"} size="xs">
                      {ROOM_SHORT[item.slot.room] || item.slot.room}
                    </Badge>
                  </span>
                </div>
              {:else}
                <button
                  type="button"
                  class="block w-full rounded border border-ink/10 bg-white px-1.5 py-1 text-left text-[11px] leading-tight shadow-card transition hover:border-accent/40 hover:shadow-sm {item.isPast ? 'opacity-55' : ''}"
                  onclick={() => openEditBooking(item.booking)}
                >
                  <span class="flex flex-wrap gap-1">
                    <Badge tone={KIND_TONES[item.booking.kind] || "neutral"} size="xs">
                      {kindLabel(item.booking.kind)}
                    </Badge>
                    <Badge tone={ROOM_TONES[item.booking.space] || "neutral"} size="xs">
                      {ROOM_SHORT[item.booking.space] || item.booking.space}
                    </Badge>
                  </span>
                  <span class="mt-1 block font-bold text-ink">{item.booking.title}</span>
                  <span class="block text-ink/70">{item.timeLabel}</span>
                </button>
              {/if}
            {/each}
          </div>
        </div>
      {/each}
    </div>

    <!-- Mobile: stacked day cards -->
    <div class="space-y-3 lg:hidden">
      {#each weekDays as day (day.dateStr)}
        {#if day.items.length}
          <div>
            <h4 class="mb-1.5 text-sm font-bold {day.isToday ? 'text-accent' : 'text-ink'}">
              {day.label}{day.isToday ? " · Today" : ""}
            </h4>
            <div class="space-y-1.5">
              {#each day.items as item (item.key)}
                {#if item.type === "class"}
                  <div
                    class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink/8 border-l-4 {ROOM_BORDERS[item.slot.room] || 'border-l-ink/30'} bg-white px-3 py-2 text-sm"
                  >
                    <span class="min-w-0">
                      <span class="block font-bold text-ink">
                        {item.slot.class_type}{item.slot.instructor ? ` · ${item.slot.instructor}` : ""}
                      </span>
                      <span class="block text-xs text-ink/65">{item.timeLabel}</span>
                    </span>
                    <Badge tone={ROOM_TONES[item.slot.room] || "neutral"} size="xs">
                      {ROOM_SHORT[item.slot.room] || item.slot.room}
                    </Badge>
                  </div>
                {:else}
                  <button
                    type="button"
                    class="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border border-ink/10 bg-white px-3 py-2 text-left text-sm shadow-card transition hover:border-accent/40 {item.isPast ? 'opacity-55' : ''}"
                    onclick={() => openEditBooking(item.booking)}
                  >
                    <span class="min-w-0">
                      <span class="block font-bold text-ink">{item.booking.title}</span>
                      <span class="block text-xs text-ink/65">{item.timeLabel}</span>
                    </span>
                    <span class="flex flex-wrap gap-1">
                      <Badge tone={KIND_TONES[item.booking.kind] || "neutral"} size="xs">
                        {kindLabel(item.booking.kind)}
                      </Badge>
                      <Badge tone={ROOM_TONES[item.booking.space] || "neutral"} size="xs">
                        {ROOM_SHORT[item.booking.space] || item.booking.space}
                      </Badge>
                    </span>
                  </button>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</Panel>

<SlideOver
  open={drawerOpen}
  title={editingBooking ? "Edit booking" : "New booking"}
  eyebrow="Studio spaces"
  closeLabel="Close booking editor"
  closeDisabled={isSaving || isDeleting}
  onClose={requestCloseDrawer}
  onClosed={handleDrawerClosed}
>
  {#if drawerActive}
    <form class="px-5 py-5" onsubmit={saveBooking}>
      <Field label="Title" id="booking-title" required>
        <input
          id="booking-title"
          type="text"
          class="input"
          placeholder="Community CPR training"
          bind:value={draftTitle}
          disabled={isSaving || isDeleting}
        />
      </Field>

      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Kind" id="booking-kind">
          <select
            id="booking-kind"
            class="select"
            bind:value={draftKind}
            disabled={isSaving || isDeleting}
          >
            {#each BOOKING_KINDS as kind (kind.value)}
              <option value={kind.value}>{kind.label}</option>
            {/each}
          </select>
        </Field>

        <Field label="Space" id="booking-space">
          <select
            id="booking-space"
            class="select"
            bind:value={draftSpace}
            disabled={isSaving || isDeleting}
            onchange={clearCheckState}
          >
            {#each ROOMS as room (room)}
              <option value={room}>{ROOM_SHORT[room]}</option>
            {/each}
          </select>
        </Field>
      </div>

      <div class="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Date" id="booking-date" required>
          <input
            id="booking-date"
            type="date"
            class="input"
            bind:value={draftDate}
            disabled={isSaving || isDeleting}
            onchange={clearCheckState}
          />
        </Field>

        <Field label="Start time" id="booking-start" required>
          <input
            id="booking-start"
            type="time"
            class="input"
            bind:value={draftStart}
            disabled={isSaving || isDeleting}
            onchange={clearCheckState}
          />
        </Field>

        <Field label="End time" id="booking-end" required error={timeError}>
          <input
            id="booking-end"
            type="time"
            class="input"
            bind:value={draftEnd}
            disabled={isSaving || isDeleting}
            onchange={clearCheckState}
          />
        </Field>
      </div>

      <Field
        label="Link to event"
        id="booking-event"
        hint="Optional. Ties this room hold to a published event."
        class="mt-4"
      >
        <select
          id="booking-event"
          class="select"
          bind:value={draftEventId}
          disabled={isSaving || isDeleting}
        >
          <option value="">None</option>
          {#each events as event (event.id)}
            <option value={event.id}>{event.title} · {formatShortDate(event.starts_at)}</option>
          {/each}
        </select>
      </Field>

      <Field label="Notes" id="booking-notes" class="mt-4">
        <textarea
          id="booking-notes"
          class="textarea min-h-20"
          placeholder="Setup needs, contact person, anything the team should know."
          bind:value={draftNotes}
          disabled={isSaving || isDeleting}
        ></textarea>
      </Field>

      <div class="mt-4">
        <Button
          variant="secondary"
          size="sm"
          icon={CalendarCheck}
          loading={isChecking}
          disabled={isSaving || isDeleting || !draftDate || !draftStart || !draftEnd || !!timeError}
          onclick={runConflictCheck}
        >
          Check availability
        </Button>
      </div>

      {#if drawerError}
        <Banner tone="error" message={drawerError} class="mt-4" />
      {/if}

      {#if conflicts.length}
        <Banner tone="warning" class="mt-4">
          <p class="font-semibold">
            This time overlaps {conflicts.length === 1 ? "an existing reservation" : `${conflicts.length} existing reservations`} in {ROOM_SHORT[draftSpace]}:
          </p>
          <ul class="mt-1.5 list-disc space-y-1 pl-4">
            {#each conflicts as conflict, i (i)}
              <li>{conflictLine(conflict)}</li>
            {/each}
          </ul>
          <p class="mt-1.5">Pick another time or room, then save again.</p>
        </Banner>
      {:else if checkMessage}
        <Banner tone="success" message={checkMessage} class="mt-4" />
      {/if}

      <div class="mt-5 flex flex-wrap items-center gap-2 border-t border-ink/8 pt-4">
        <Button type="submit" variant="primary" loading={isSaving} disabled={isDeleting}>
          {editingBooking ? "Save changes" : "Create booking"}
        </Button>
        <Button variant="ghost" onclick={requestCloseDrawer} disabled={isSaving || isDeleting}>
          Cancel
        </Button>
        {#if editingBooking}
          <Button
            variant="danger"
            class="ml-auto"
            icon={Trash2}
            loading={isDeleting}
            disabled={isSaving}
            onclick={() => (confirmingDelete = true)}
          >
            Delete
          </Button>
        {/if}
      </div>
    </form>
  {/if}
</SlideOver>

<ConfirmDialog
  open={confirmingDelete}
  title="Delete booking?"
  message={editingBooking
    ? `Delete "${editingBooking.title}" (${formatShortDate(editingBooking.starts_at)} · ${formatTimeRange(editingBooking.starts_at, editingBooking.ends_at)})? The room becomes available again. This cannot be undone.`
    : ""}
  confirmLabel="Delete booking"
  tone="danger"
  busy={isDeleting}
  onConfirm={deleteBooking}
  onCancel={() => (confirmingDelete = false)}
/>
