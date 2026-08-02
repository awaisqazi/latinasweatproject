<script>
  import { onMount } from "svelte";
  import { CalendarClock, Check, Inbox, RotateCcw, X } from "@lucide/svelte";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import { ROOM_SHORT, ROOM_TONES, formatTime12, parseDateStr } from "../../../lib/dashboard/spacesAdmin.js";
  import { formatDayLabel, formatShortDate, formatTimeRange } from "../../../lib/dashboard/volunteersAdmin.js";

  export let supabase;
  export let dataVersion = 0;
  export let onChanged = () => {};

  const STATUS_TONES = { pending: "amber", approved: "green", declined: "red" };
  const STATUS_LABELS = { pending: "Pending", approved: "Approved", declined: "Declined" };

  let requests = [];
  let isLoading = true;
  let errorMessage = "";
  let statusFilter = "pending";

  // request id -> get_event_request_conflicts payload (pending requests only).
  let conflictsById = {};

  // Drawer state
  let selected = null;
  let drawerOpen = false;
  let drawerActive = false;
  let drawerError = "";
  let decisionNote = "";
  let createBookings = true;
  let queueMarketing = true;
  let isDeciding = false;
  let confirmingReopen = false;

  let lastVersion = dataVersion;
  $: if (dataVersion !== lastVersion) {
    lastVersion = dataVersion;
    load();
  }

  onMount(load);

  async function load() {
    if (!supabase) return;
    isLoading = true;
    errorMessage = "";

    const { data, error } = await supabase
      .from("event_requests")
      .select("*, decided_by_profile:profiles!event_requests_decided_by_fkey(full_name, email)")
      .order("submitted_at", { ascending: false });

    if (error) {
      errorMessage = error.message;
      isLoading = false;
      return;
    }

    requests = data || [];
    isLoading = false;
    loadConflicts(requests.filter((r) => r.status === "pending"));
  }

  // Conflict previews load after the list so the queue paints fast.
  async function loadConflicts(pending) {
    const results = await Promise.all(
      pending.map(async (request) => {
        const { data, error } = await supabase.rpc("get_event_request_conflicts", {
          p_request_id: request.id,
        });
        return [request.id, error ? null : data];
      }),
    );

    const next = { ...conflictsById };
    for (const [id, payload] of results) {
      if (payload) next[id] = payload;
    }
    conflictsById = next;
  }

  async function refreshConflicts(id) {
    const { data, error } = await supabase.rpc("get_event_request_conflicts", {
      p_request_id: id,
    });
    if (!error && data) conflictsById = { ...conflictsById, [id]: data };
  }

  $: counts = requests.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    { pending: 0, approved: 0, declined: 0 },
  );

  $: filters = [
    { value: "pending", label: `Pending (${counts.pending})` },
    { value: "approved", label: `Approved (${counts.approved})` },
    { value: "declined", label: `Declined (${counts.declined})` },
    { value: "all", label: "All" },
  ];

  $: visible = statusFilter === "all"
    ? requests
    : requests.filter((r) => r.status === statusFilter);

  function conflictTotal(id) {
    const payload = conflictsById[id];
    if (!payload || !payload.checkable) return null;
    return (payload.rooms || []).reduce(
      (sum, room) => sum + (room.conflicts?.length || 0),
      0,
    );
  }

  function schedulable(request) {
    return Boolean(
      request.event_date &&
        request.start_time &&
        request.end_time &&
        (request.rooms || []).length,
    );
  }

  function dateLabel(request) {
    if (!request.event_date) return "Date TBD";
    return formatShortDate(parseDateStr(request.event_date));
  }

  function timeLabel(request) {
    if (!request.start_time || !request.end_time) return "Time TBD";
    return `${formatTime12(request.start_time)} - ${formatTime12(request.end_time)}`;
  }

  function conflictLine(conflict) {
    const what =
      conflict.type === "class"
        ? `class${conflict.instructor ? ` with ${conflict.instructor}` : ""}`
        : conflict.type === "request"
          ? `pending request${conflict.requested_by ? ` from ${conflict.requested_by}` : ""}`
          : "booking";
    return `${conflict.title} (${what}) · ${formatTimeRange(conflict.starts_at, conflict.ends_at)}`;
  }

  function openRequest(request) {
    selected = request;
    drawerError = "";
    decisionNote = "";
    createBookings = schedulable(request);
    queueMarketing = !request.marketing_project_id;
    confirmingReopen = false;
    drawerActive = true;
    drawerOpen = true;
    if (request.status === "pending") refreshConflicts(request.id);
  }

  function requestCloseDrawer() {
    if (isDeciding) return;
    drawerOpen = false;
  }

  function handleDrawerClosed() {
    drawerOpen = false;
    drawerActive = false;
    selected = null;
  }

  async function decide(action) {
    if (!selected || isDeciding) return;
    isDeciding = true;
    drawerError = "";

    try {
      const { data, error } = await supabase.rpc("decide_event_request", {
        p_id: selected.id,
        p_action: action,
        p_note: String(decisionNote ?? "").trim() || null,
        p_create_bookings: createBookings,
        p_queue_marketing: queueMarketing,
      });
      if (error) throw error;

      if (!data?.ok) {
        drawerError = data?.message || "Could not update this request.";
        if (data?.code === "conflict") await refreshConflicts(selected.id);
        return;
      }

      confirmingReopen = false;
      drawerOpen = false;
      onChanged();
      await load();
    } catch (error) {
      drawerError = error?.message || "Something went wrong. Please try again.";
    } finally {
      isDeciding = false;
    }
  }

  $: selectedConflicts = selected ? conflictsById[selected.id] : null;
  $: selectedConflictTotal = selected ? conflictTotal(selected.id) : null;
  $: deciderName =
    selected?.decided_by_profile?.full_name ||
    selected?.decided_by_profile?.email ||
    "an admin";
</script>

<Panel title="Event requests" id="event-requests-title" loading={isLoading}>
  <div class="mb-4 flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
    {#each filters as filter (filter.value)}
      <button
        type="button"
        class="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors {statusFilter === filter.value
          ? 'border-ink bg-ink text-white'
          : 'border-ink/14 bg-white text-ink/70 hover:border-ink/30 hover:text-ink'}"
        aria-pressed={statusFilter === filter.value}
        onclick={() => (statusFilter = filter.value)}
      >
        {filter.label}
      </button>
    {/each}
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} onRetry={load} class="mb-4" />
  {/if}

  {#if isLoading && !requests.length}
    <div class="grid gap-2 sm:grid-cols-2" aria-hidden="true">
      {#each Array(4) as _, i (i)}
        <SkeletonCard lines={3} />
      {/each}
    </div>
  {:else if !visible.length}
    <EmptyState
      title={statusFilter === "pending" ? "No pending requests" : "Nothing here yet"}
      message="Requests submitted through latinasweatproject.com/eventsrequest land in this queue automatically."
      icon={Inbox}
    />
  {:else}
    <ul class="space-y-2">
      {#each visible as request (request.id)}
        <li>
          <button
            type="button"
            class="flex w-full flex-wrap items-center justify-between gap-3 rounded-md border border-ink/10 bg-white px-4 py-3 text-left shadow-card transition hover:border-accent/40"
            onclick={() => openRequest(request)}
          >
            <span class="min-w-0">
              <span class="block truncate text-sm font-bold text-ink">{request.event_name}</span>
              <span class="mt-0.5 block text-xs text-ink/65">
                {request.board_name} · {dateLabel(request)} · {timeLabel(request)}
              </span>
              <span class="mt-1.5 flex flex-wrap gap-1">
                {#each request.rooms || [] as room (room)}
                  <Badge tone={ROOM_TONES[room] || "neutral"} size="xs">
                    {ROOM_SHORT[room] || room}
                  </Badge>
                {/each}
                {#if request.other_location}
                  <Badge tone="neutral" size="xs">{request.other_location}</Badge>
                {/if}
              </span>
            </span>
            <span class="flex flex-wrap items-center gap-1.5">
              {#if request.status === "pending"}
                {#if !schedulable(request)}
                  <Badge tone="neutral" size="xs">Needs date/time</Badge>
                {:else if conflictTotal(request.id) === null}
                  <Badge tone="neutral" size="xs">Checking…</Badge>
                {:else if conflictTotal(request.id) === 0}
                  <Badge tone="green" size="xs">Rooms clear</Badge>
                {:else}
                  <Badge tone="red" size="xs">
                    {conflictTotal(request.id)} conflict{conflictTotal(request.id) === 1 ? "" : "s"}
                  </Badge>
                {/if}
              {/if}
              {#if request.marketing_project_id}
                <Badge tone="blue" size="xs">Marketing queued</Badge>
              {/if}
              <Badge tone={STATUS_TONES[request.status]} size="xs">
                {STATUS_LABELS[request.status]}
              </Badge>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</Panel>

<SlideOver
  open={drawerOpen}
  title={selected?.event_name || "Event request"}
  eyebrow="Event requests"
  closeLabel="Close request details"
  closeDisabled={isDeciding}
  onClose={requestCloseDrawer}
  onClosed={handleDrawerClosed}
>
  {#if drawerActive && selected}
    <div class="space-y-5 px-5 py-5">
      <div class="flex flex-wrap items-center gap-1.5">
        <Badge tone={STATUS_TONES[selected.status]}>{STATUS_LABELS[selected.status]}</Badge>
        {#if selected.marketing_project_id}
          <Badge tone="blue">Marketing queued</Badge>
        {/if}
        {#if selected.booking_ids?.length}
          <Badge tone="teal">
            {selected.booking_ids.length} room{selected.booking_ids.length === 1 ? "" : "s"} booked
          </Badge>
        {/if}
      </div>

      <dl class="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-ink/50">Requested by</dt>
          <dd class="mt-0.5 font-semibold text-ink">
            {selected.board_name}
            {#if selected.email}
              <a class="block truncate text-xs font-normal text-accent-strong underline" href="mailto:{selected.email}">
                {selected.email}
              </a>
            {/if}
          </dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-ink/50">Submitted</dt>
          <dd class="mt-0.5 text-ink/80">{formatShortDate(selected.submitted_at)}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-ink/50">Event date</dt>
          <dd class="mt-0.5 text-ink/80">
            {selected.event_date ? formatDayLabel(selected.event_date) : "Not provided"}
          </dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-ink/50">Time</dt>
          <dd class="mt-0.5 text-ink/80">{timeLabel(selected)}</dd>
        </div>
        <div>
          <dt class="text-xs font-semibold uppercase tracking-wide text-ink/50">Rooms</dt>
          <dd class="mt-1 flex flex-wrap gap-1">
            {#each selected.rooms || [] as room (room)}
              <Badge tone={ROOM_TONES[room] || "neutral"} size="xs">{ROOM_SHORT[room] || room}</Badge>
            {:else}
              <span class="text-ink/60">None tracked</span>
            {/each}
            {#if selected.other_location}
              <Badge tone="neutral" size="xs">{selected.other_location}</Badge>
            {/if}
          </dd>
        </div>
        {#if selected.setup_cleanup}
          <div>
            <dt class="text-xs font-semibold uppercase tracking-wide text-ink/50">Set-up / clean-up</dt>
            <dd class="mt-0.5 text-ink/80">{selected.setup_cleanup}</dd>
          </div>
        {/if}
      </dl>

      {#if selected.notes}
        <div class="rounded-md border border-ink/10 bg-ink/[0.03] px-3.5 py-3 text-sm text-ink/80">
          {selected.notes}
        </div>
      {/if}

      <!-- Room availability -->
      {#if selected.status === "pending"}
        <section aria-label="Room availability">
          <h4 class="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
            <CalendarClock class="h-4 w-4 text-ink/50" aria-hidden="true" />
            Room availability
          </h4>
          {#if !schedulable(selected)}
            <p class="text-sm text-ink/65">
              {(selected.rooms || []).length
                ? "No date or time was provided, so availability can't be checked."
                : "No tracked room was requested, so there is nothing to conflict with."}
            </p>
          {:else if !selectedConflicts}
            <p class="text-sm text-ink/65">Checking the calendar…</p>
          {:else if !selectedConflicts.checkable}
            <p class="text-sm text-ink/65">{selectedConflicts.reason}</p>
          {:else}
            <ul class="space-y-2">
              {#each selectedConflicts.rooms as roomResult (roomResult.room)}
                <li class="rounded-md border px-3.5 py-2.5 text-sm {roomResult.conflicts.length
                  ? 'border-red-200 bg-red-50'
                  : 'border-green-200 bg-green-50'}"
                >
                  <span class="font-bold {roomResult.conflicts.length ? 'text-red-800' : 'text-green-800'}">
                    {ROOM_SHORT[roomResult.room] || roomResult.room}:
                    {roomResult.conflicts.length
                      ? `${roomResult.conflicts.length} conflict${roomResult.conflicts.length === 1 ? "" : "s"}`
                      : "free at that time"}
                  </span>
                  {#if roomResult.conflicts.length}
                    <ul class="mt-1 space-y-0.5 text-xs text-red-800/90">
                      {#each roomResult.conflicts as conflict, i (i)}
                        <li>{conflictLine(conflict)}</li>
                      {/each}
                    </ul>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}

      {#if drawerError}
        <Banner tone="error" message={drawerError} />
      {/if}

      <!-- Decision controls -->
      {#if selected.status === "pending"}
        <section class="space-y-4 border-t border-ink/10 pt-4" aria-label="Decision">
          <label class="flex items-start gap-2.5 text-sm text-ink/80 {schedulable(selected) ? '' : 'opacity-50'}">
            <input
              type="checkbox"
              class="mt-0.5 h-4 w-4 accent-ink"
              bind:checked={createBookings}
              disabled={!schedulable(selected) || isDeciding}
            />
            <span>
              <span class="font-semibold text-ink">Book the room{(selected.rooms || []).length === 1 ? "" : "s"} on approval</span>
              <span class="block text-xs text-ink/60">
                Creates a Space Calendar booking per requested room. Approval fails if a room is taken, nothing is half-booked.
              </span>
            </span>
          </label>

          <label class="flex items-start gap-2.5 text-sm text-ink/80 {selected.marketing_project_id ? 'opacity-50' : ''}">
            <input
              type="checkbox"
              class="mt-0.5 h-4 w-4 accent-ink"
              bind:checked={queueMarketing}
              disabled={Boolean(selected.marketing_project_id) || isDeciding}
            />
            <span>
              <span class="font-semibold text-ink">Queue for the marketing pipeline</span>
              <span class="block text-xs text-ink/60">
                {selected.marketing_project_id
                  ? "Already queued in the marketing intake."
                  : "Drops the event into Marketing's Google Forms intake queue for promo planning."}
              </span>
            </span>
          </label>

          <Field label="Note (optional)" id="request-decision-note">
            <textarea
              id="request-decision-note"
              class="input"
              rows="2"
              placeholder="Context for the team or the requester"
              bind:value={decisionNote}
              disabled={isDeciding}
            ></textarea>
          </Field>

          <div class="flex flex-wrap gap-2">
            <Button variant="primary" icon={Check} disabled={isDeciding} onclick={() => decide("approve")}>
              {isDeciding ? "Working…" : "Approve request"}
            </Button>
            <Button variant="danger" icon={X} disabled={isDeciding} onclick={() => decide("decline")}>
              Decline
            </Button>
          </div>
        </section>
      {:else}
        <section class="space-y-3 border-t border-ink/10 pt-4" aria-label="Decision">
          <p class="text-sm text-ink/70">
            {STATUS_LABELS[selected.status]} by
            <span class="font-semibold text-ink">{deciderName}</span>
            {#if selected.decided_at}
              on {formatShortDate(selected.decided_at)}{/if}.
            {#if selected.decision_note}
              <span class="mt-1 block rounded-md bg-ink/[0.04] px-3 py-2 text-ink/80">
                "{selected.decision_note}"
              </span>
            {/if}
          </p>
          <Button variant="secondary" icon={RotateCcw} disabled={isDeciding} onclick={() => (confirmingReopen = true)}>
            Reopen request
          </Button>
        </section>
      {/if}
    </div>
  {/if}
</SlideOver>

<ConfirmDialog
  open={confirmingReopen}
  title="Reopen this request?"
  message={selected?.booking_ids?.length
    ? `Reopening moves "${selected.event_name}" back to pending and deletes the ${selected.booking_ids.length} room booking${selected.booking_ids.length === 1 ? "" : "s"} its approval created. Any queued marketing project stays.`
    : `"${selected?.event_name}" moves back to the pending queue for a fresh decision.`}
  confirmLabel="Reopen"
  tone="danger"
  busy={isDeciding}
  onConfirm={() => decide("reopen")}
  onCancel={() => (confirmingReopen = false)}
/>
