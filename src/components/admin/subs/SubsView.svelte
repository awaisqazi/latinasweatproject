<script>
  import { onMount } from "svelte";
  import {
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Download,
    Hourglass,
    Megaphone,
    Plus,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import SearchInput from "../ui/SearchInput.svelte";
  import Skeleton from "../ui/Skeleton.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import SubRequestDrawer from "./SubRequestDrawer.svelte";

  export let supabase;
  export let profile = null;
  export let refreshKey = 0;

  const DEFAULT_LOCATION = "949 W 16th St, Chicago, IL 60608";
  const requestColumns =
    "id, class_name, date, start_time, duration_minutes, location, notes, requested_by_name, requested_by_email, status, assigned_sub_name, assigned_sub_email, assigned_sub_phone, assigned_at, created_at, sub_volunteers(id, name, email, phone, created_at)";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const STATUS_FILTERS = [
    { id: "all", label: "All" },
    { id: "open", label: "Open" },
    { id: "pending", label: "Pending" },
    { id: "approved", label: "Approved" },
  ];
  const STATUS_TONES = { open: "amber", pending: "blue", approved: "green" };

  let requests = [];
  let isLoading = true;
  let errorMessage = "";
  let currentMonth = getMonthStart(new Date());
  let lastRefreshKey = refreshKey;
  let searchQuery = "";
  let statusFilter = "all";
  let selectedRequest = null;

  // Create request form
  let showCreateForm = false;
  let isCreating = false;
  let createError = "";
  let newClassName = "";
  let newDate = "";
  let newStartTime = "";
  let newDuration = 60;
  let newLocation = DEFAULT_LOCATION;
  let newNotes = "";
  let newRequesterName = "";
  let newRequesterEmail = "";

  // CSV export
  let showExportForm = false;
  let isExporting = false;
  let exportError = "";
  let exportStartDate = "";
  let exportEndDate = "";

  $: monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(currentMonth);

  $: statusCounts = {
    open: requests.filter((request) => request.status === "open").length,
    pending: requests.filter((request) => request.status === "pending").length,
    approved: requests.filter((request) => request.status === "approved").length,
  };

  $: statusTabs = STATUS_FILTERS.map((filter) => ({
    ...filter,
    count: statusCounts[filter.id],
  }));

  $: filteredRequests = requests.filter((request) => {
    if (statusFilter !== "all" && request.status !== statusFilter) return false;

    if (searchQuery.trim().length >= 2) {
      const query = searchQuery.trim().toLowerCase();
      return (
        request.class_name?.toLowerCase().includes(query) ||
        request.requested_by_name?.toLowerCase().includes(query) ||
        request.assigned_sub_name?.toLowerCase().includes(query) ||
        request.location?.toLowerCase().includes(query) ||
        request.date?.includes(query) ||
        (request.sub_volunteers || []).some((volunteer) =>
          volunteer.name?.toLowerCase().includes(query),
        )
      );
    }

    return true;
  });

  $: calendarDays = buildCalendarDays(currentMonth, filteredRequests);
  $: isSearching = searchQuery.trim().length >= 2;

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadRequests();
  }

  onMount(() => {
    const now = new Date();
    exportStartDate = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
    exportEndDate = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    loadRequests();
  });

  function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function monthRange(month) {
    return {
      startKey: toDateKey(new Date(month.getFullYear(), month.getMonth(), 1)),
      endKey: toDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0)),
    };
  }

  async function loadRequests() {
    if (!supabase) return;

    isLoading = true;
    errorMessage = "";

    const { startKey, endKey } = monthRange(currentMonth);
    const { data, error } = await supabase
      .from("sub_requests")
      .select(requestColumns)
      .gte("date", startKey)
      .lte("date", endKey)
      .order("date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      errorMessage = error.message;
    } else {
      requests = (data || []).map((row) => ({
        ...row,
        sub_volunteers: row.sub_volunteers || [],
      }));
    }

    isLoading = false;
  }

  function setMonth(offset) {
    currentMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + offset,
      1,
    );
    loadRequests();
  }

  function goToToday() {
    currentMonth = getMonthStart(new Date());
    loadRequests();
  }

  function buildCalendarDays(month, sourceRequests) {
    const firstDay = getMonthStart(month);
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const dateKey = toDateKey(date);

      return {
        date,
        dateKey,
        dayNumber: date.getDate(),
        isToday: dateKey === toDateKey(new Date()),
        isCurrentMonth:
          date.getMonth() === month.getMonth() &&
          date.getFullYear() === month.getFullYear(),
        items: sourceRequests.filter((request) => request.date === dateKey),
      };
    });
  }

  async function createRequest(event) {
    event?.preventDefault();

    const className = newClassName.trim();
    const requesterName = newRequesterName.trim();
    const requesterEmail = newRequesterEmail.trim();
    if (!className || !newDate || !requesterName || !requesterEmail || isCreating) {
      return;
    }

    isCreating = true;
    createError = "";

    const { data, error } = await supabase
      .from("sub_requests")
      .insert({
        class_name: className,
        date: newDate,
        start_time: newStartTime || null,
        duration_minutes: Number(newDuration) || null,
        location: newLocation.trim() || null,
        notes: newNotes.trim() || null,
        requested_by_name: requesterName,
        requested_by_email: requesterEmail.toLowerCase(),
      })
      .select(requestColumns)
      .single();

    if (error) {
      createError = error.message;
    } else {
      const created = { ...data, sub_volunteers: data.sub_volunteers || [] };
      const { startKey, endKey } = monthRange(currentMonth);

      if (created.date >= startKey && created.date <= endKey) {
        requests = [...requests, created].sort((a, b) =>
          a.date === b.date
            ? (a.created_at || "").localeCompare(b.created_at || "")
            : a.date.localeCompare(b.date),
        );
      }

      newClassName = "";
      newDate = "";
      newStartTime = "";
      newDuration = 60;
      newLocation = DEFAULT_LOCATION;
      newNotes = "";
      newRequesterName = "";
      newRequesterEmail = "";
      showCreateForm = false;
      selectedRequest = created;
    }

    isCreating = false;
  }

  async function exportCSV() {
    if (isExporting) return;

    if (!exportStartDate || !exportEndDate) {
      exportError = "Please select a start and end date.";
      return;
    }
    if (exportStartDate > exportEndDate) {
      exportError = "The start date must be before the end date.";
      return;
    }

    isExporting = true;
    exportError = "";

    const { data, error } = await supabase
      .from("sub_requests")
      .select(requestColumns)
      .gte("date", exportStartDate)
      .lte("date", exportEndDate)
      .order("date", { ascending: true });

    if (error) {
      exportError = error.message;
      isExporting = false;
      return;
    }

    const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      [
        "Class Name",
        "Date",
        "Start Time",
        "Duration (minutes)",
        "Location",
        "Status",
        "Requested By",
        "Requested By Email",
        "Assigned Sub",
        "Assigned Sub Email",
        "Assigned Sub Phone",
        "Volunteers",
      ],
    ];

    (data || []).forEach((request) => {
      rows.push([
        request.class_name,
        request.date,
        request.start_time ? formatStartTime(request.start_time) : "",
        request.duration_minutes ?? "",
        request.location ?? "",
        request.status,
        request.requested_by_name,
        request.requested_by_email,
        request.assigned_sub_name ?? "",
        request.assigned_sub_email ?? "",
        request.assigned_sub_phone ?? "",
        (request.sub_volunteers || [])
          .map((volunteer) => `${volunteer.name} (${volunteer.email})`)
          .join("; "),
      ]);
    });

    const csvContent = rows
      .map((row) => row.map(escapeCell).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sub_requests_${exportStartDate}_to_${exportEndDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showExportForm = false;
    isExporting = false;
  }

  function handleRequestUpdated(updatedRequest) {
    if (!updatedRequest?.id) return;

    requests = requests.map((request) =>
      request.id === updatedRequest.id
        ? { ...request, ...updatedRequest }
        : request,
    );

    if (selectedRequest?.id === updatedRequest.id) {
      selectedRequest = { ...selectedRequest, ...updatedRequest };
    }
  }

  function handleRequestDeleted(deletedId) {
    requests = requests.filter((request) => request.id !== deletedId);
    selectedRequest = null;
  }

  function formatDate(value) {
    if (!value) return "No date";

    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function formatStartTime(value) {
    if (!value) return "";

    const [hours, minutes] = value.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);

    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function getStatusLabel(status) {
    if (status === "approved") return "Sub confirmed";
    if (status === "pending") return "Pending approval";
    return "Needs sub";
  }
</script>

<section class="space-y-4" aria-labelledby="subs-view-title">
  <h3 id="subs-view-title" class="sr-only">Sub Requests</h3>

  <div class="grid gap-3 sm:grid-cols-3">
    <StatCard label="Open this month" value={statusCounts.open} icon={Megaphone} tone="gold" />
    <StatCard label="Pending approval" value={statusCounts.pending} icon={Hourglass} tone="rose" />
    <StatCard label="Approved this month" value={statusCounts.approved} icon={CheckCircle2} tone="teal" />
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} />
  {/if}

  <Panel title="Sub Requests" id="subs-panel-title" loading={isLoading}>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <Button
          iconOnly
          icon={ChevronLeft}
          label="Previous month"
          onclick={() => setMonth(-1)}
        />
        <span class="min-w-36 text-center text-base font-bold">{monthLabel}</span>
        <Button
          iconOnly
          icon={ChevronRight}
          label="Next month"
          onclick={() => setMonth(1)}
        />
        <Button onclick={goToToday}>Today</Button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button
          icon={Download}
          onclick={() => {
            showExportForm = !showExportForm;
            if (showExportForm) showCreateForm = false;
          }}
        >
          Export CSV
        </Button>
        <Button
          variant="primary"
          icon={Plus}
          onclick={() => {
            showCreateForm = !showCreateForm;
            if (showCreateForm) showExportForm = false;
          }}
        >
          New request
        </Button>
      </div>
    </div>

    {#if showExportForm}
      <form
        class="mb-4 rounded-card border border-ink/8 bg-canvas/70 p-4"
        onsubmit={(event) => {
          event.preventDefault();
          exportCSV();
        }}
      >
        <p class="text-sm font-bold">Download a CSV report for any date range</p>
        <div class="mt-3 grid gap-3 sm:grid-cols-[auto_auto_auto]">
          <Field label="Start date" id="subs-export-start">
            <input
              id="subs-export-start"
              type="date"
              class="input"
              bind:value={exportStartDate}
              disabled={isExporting}
            />
          </Field>
          <Field label="End date" id="subs-export-end">
            <input
              id="subs-export-end"
              type="date"
              class="input"
              bind:value={exportEndDate}
              disabled={isExporting}
            />
          </Field>
          <div class="flex items-end">
            <Button type="submit" variant="dark" loading={isExporting}>
              {#if isExporting}Exporting{:else}Download CSV{/if}
            </Button>
          </div>
        </div>
        {#if exportError}
          <Banner tone="error" message={exportError} class="mt-3" />
        {/if}
      </form>
    {/if}

    {#if showCreateForm}
      <form class="mb-4 rounded-card border border-ink/8 bg-canvas/70 p-4" onsubmit={createRequest}>
        <p class="text-sm font-bold">Create a sub request</p>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Class name" id="subs-new-class" required>
            <input
              id="subs-new-class"
              type="text"
              class="input"
              placeholder="e.g., Yoga Flow, Pilates, HIIT"
              bind:value={newClassName}
              disabled={isCreating}
            />
          </Field>
          <Field label="Date" id="subs-new-date" required>
            <input
              id="subs-new-date"
              type="date"
              class="input"
              bind:value={newDate}
              disabled={isCreating}
            />
          </Field>
          <Field label="Class time" id="subs-new-start-time">
            <input
              id="subs-new-start-time"
              type="time"
              class="input"
              bind:value={newStartTime}
              disabled={isCreating}
            />
          </Field>
          <Field label="Instructor name" id="subs-new-requester-name" required>
            <input
              id="subs-new-requester-name"
              type="text"
              class="input"
              placeholder="Who needs the sub?"
              bind:value={newRequesterName}
              disabled={isCreating}
            />
          </Field>
          <Field label="Instructor email" id="subs-new-requester-email" required>
            <input
              id="subs-new-requester-email"
              type="email"
              class="input"
              placeholder="instructor@email.com"
              bind:value={newRequesterEmail}
              disabled={isCreating}
            />
          </Field>
          <Field label="Duration (minutes)" id="subs-new-duration">
            <input
              id="subs-new-duration"
              type="number"
              min="5"
              max="600"
              class="input"
              bind:value={newDuration}
              disabled={isCreating}
            />
          </Field>
          <Field label="Location" id="subs-new-location">
            <input
              id="subs-new-location"
              type="text"
              class="input"
              bind:value={newLocation}
              disabled={isCreating}
            />
          </Field>
          <Field label="Notes" id="subs-new-notes" class="sm:col-span-2">
            <textarea
              id="subs-new-notes"
              rows="2"
              class="textarea"
              placeholder="Class time, format, anything a sub should know"
              bind:value={newNotes}
              disabled={isCreating}
            ></textarea>
          </Field>
        </div>
        <div class="mt-3 flex justify-end">
          <Button
            type="submit"
            variant="dark"
            loading={isCreating}
            disabled={!newClassName.trim() ||
              !newDate ||
              !newRequesterName.trim() ||
              !newRequesterEmail.trim()}
          >
            {#if isCreating}Creating{:else}Create request{/if}
          </Button>
        </div>
        {#if createError}
          <Banner tone="error" message={createError} class="mt-3" />
        {/if}
      </form>
    {/if}

    <div class="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
      <SearchInput
        bind:value={searchQuery}
        placeholder="Search by class, name, date, location"
        label="Search sub requests"
        minChars={2}
        debounce={200}
        class="w-full md:max-w-sm"
      />
      <Tabs
        tabs={statusTabs}
        bind:active={statusFilter}
        variant="segmented"
        label="Filter by status"
        hasPanels={false}
      />
    </div>

    {#if isSearching && !isLoading}
      <p class="mb-3 text-sm text-ink/55">
        Found {filteredRequests.length} result{filteredRequests.length === 1 ? "" : "s"} in {monthLabel}.
      </p>
    {/if}

    {#if isLoading}
      <div class="hidden grid-cols-7 gap-2 md:grid">
        {#each Array(21) as _, index (index)}
          <Skeleton class="min-h-20" />
        {/each}
      </div>
      <div class="space-y-2 md:hidden">
        {#each Array(4) as _, index (index)}
          <Skeleton class="h-20" />
        {/each}
      </div>
    {:else if !filteredRequests.length}
      <EmptyState
        title="No sub requests found"
        message={isSearching || statusFilter !== "all"
          ? "Try a different search term, status filter, or month."
          : "Sub requests for this month will appear here. Create one with New request."}
      />
    {:else}
      <!-- Month grid (desktop and up) -->
      <div class="hidden md:block">
        <div class="overflow-x-auto rounded-card border border-ink/8">
          <div class="grid min-w-[48rem] grid-cols-7 border-b border-ink/8 bg-canvas text-xs font-bold uppercase tracking-[0.12em] text-ink/55">
            {#each weekdays as weekday}
              <div class="border-r border-ink/8 px-3 py-2 last:border-r-0">
                {weekday}
              </div>
            {/each}
          </div>
          <div class="grid min-w-[48rem] grid-cols-7">
            {#each calendarDays as day (day.dateKey)}
              <div
                class="min-h-28 border-r border-t border-ink/8 px-2 py-2 first:border-t-0 last:border-r-0 [&:nth-child(-n+7)]:border-t-0 {day.isCurrentMonth ? 'bg-white' : 'bg-canvas/70 text-ink/35'}"
              >
                <div class="mb-2 flex items-center justify-between gap-2">
                  <span class="inline-flex h-6 min-w-6 items-center justify-center rounded-full text-sm font-bold {day.isToday ? 'bg-ink text-white ring-2 ring-accent/30' : ''}">
                    {day.dayNumber}
                  </span>
                  {#if day.items.length}
                    <span class="text-xs font-bold text-ink/45">{day.items.length}</span>
                  {/if}
                </div>
                <div class="space-y-1.5">
                  {#each day.items as request (request.id)}
                    <button
                      type="button"
                      class="w-full rounded-control border border-ink/8 bg-white px-2 py-1.5 text-left text-xs font-semibold leading-snug shadow-card transition hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1"
                      onclick={() => (selectedRequest = request)}
                    >
                      <Badge tone={STATUS_TONES[request.status] || "amber"} dot size="xs">
                        {getStatusLabel(request.status)}
                      </Badge>
                      <span class="mt-1 line-clamp-2 block">
                        {#if request.start_time}{formatStartTime(request.start_time)} · {/if}{request.class_name}
                      </span>
                    </button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>

      <!-- Agenda list (small screens) -->
      <div class="space-y-2 md:hidden">
        {#each filteredRequests as request (request.id)}
          <button
            type="button"
            class="flex w-full flex-wrap items-center gap-3 rounded-card border border-ink/8 bg-white px-4 py-3 text-left shadow-card transition hover:border-accent/40"
            onclick={() => (selectedRequest = request)}
          >
            <span class="min-w-0 flex-1">
              <span class="block text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
                {formatDate(request.date)}{#if request.start_time}&nbsp;· {formatStartTime(request.start_time)}{/if}
              </span>
              <span class="mt-1 block font-bold leading-snug">{request.class_name}</span>
              <span class="mt-1 block text-sm text-ink/60">
                Requested by {request.requested_by_name}
                {#if request.assigned_sub_name}
                  · Sub: {request.assigned_sub_name}
                {:else if request.sub_volunteers.length}
                  · {request.sub_volunteers.length} volunteer{request.sub_volunteers.length === 1 ? "" : "s"} waiting
                {/if}
              </span>
            </span>
            <Badge tone={STATUS_TONES[request.status] || "amber"}>
              {getStatusLabel(request.status)}
            </Badge>
          </button>
        {/each}
      </div>
    {/if}
  </Panel>
</section>

<SubRequestDrawer
  {supabase}
  request={selectedRequest}
  onClose={() => (selectedRequest = null)}
  onRequestUpdated={handleRequestUpdated}
  onRequestDeleted={handleRequestDeleted}
/>
