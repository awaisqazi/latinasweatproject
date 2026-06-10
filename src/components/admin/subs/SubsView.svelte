<script>
  import { onMount } from "svelte";
  import {
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    Download,
    Hourglass,
    Megaphone,
    Plus,
  } from "@lucide/svelte";
  import EmptyState from "../marketing/EmptyState.svelte";
  import Panel from "../marketing/Panel.svelte";
  import SummaryCard from "../marketing/SummaryCard.svelte";
  import SubRequestDrawer from "./SubRequestDrawer.svelte";

  export let supabase;
  export let profile = null;
  export let refreshKey = 0;

  const DEFAULT_LOCATION = "949 W 16th St, Chicago, IL 60608";
  const requestColumns =
    "id, class_name, date, duration_minutes, location, notes, requested_by_name, requested_by_email, status, assigned_sub_name, assigned_sub_email, assigned_sub_phone, assigned_at, created_at, sub_volunteers(id, name, email, phone, created_at)";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const STATUS_FILTERS = [
    { id: "all", label: "All" },
    { id: "open", label: "Open" },
    { id: "pending", label: "Pending" },
    { id: "approved", label: "Approved" },
  ];

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

  function getStatusBadgeClass(status) {
    if (status === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status === "pending") return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  function getStatusChipClass(status) {
    if (status === "approved") {
      return "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100";
    }
    if (status === "pending") {
      return "border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-300 hover:bg-blue-100";
    }
    return "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100";
  }

  function getStatusDotClass(status) {
    if (status === "approved") return "bg-emerald-500";
    if (status === "pending") return "bg-blue-500";
    return "bg-amber-500";
  }

  function getStatusLabel(status) {
    if (status === "approved") return "Sub confirmed";
    if (status === "pending") return "Pending approval";
    return "Needs sub";
  }

  function getFilterChipClass(filterId) {
    if (statusFilter !== filterId) {
      return "bg-gray-50 text-gray-600 hover:bg-gray-100";
    }
    if (filterId === "open") return "bg-amber-500 text-white";
    if (filterId === "pending") return "bg-blue-500 text-white";
    if (filterId === "approved") return "bg-emerald-600 text-white";
    return "bg-[#1E1E1E] text-white";
  }
</script>

<section class="space-y-4" aria-labelledby="subs-view-title">
  <h3 id="subs-view-title" class="sr-only">Sub Requests</h3>

  <div class="grid gap-3 sm:grid-cols-3">
    <SummaryCard label="Open this month" value={statusCounts.open} icon={Megaphone} tone="gold" />
    <SummaryCard label="Pending approval" value={statusCounts.pending} icon={Hourglass} tone="rose" />
    <SummaryCard label="Approved this month" value={statusCounts.approved} icon={CheckCircle2} tone="teal" />
  </div>

  {#if errorMessage}
    <div class="flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{errorMessage}</span>
    </div>
  {/if}

  <Panel title="Sub Requests" id="subs-panel-title" loading={isLoading}>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex min-h-10 items-center justify-center rounded-md border border-black/10 bg-white p-2 shadow-sm transition hover:border-[#0f766e]/30 hover:text-[#0f766e]"
          aria-label="Previous month"
          onclick={() => setMonth(-1)}
        >
          <ChevronLeft class="h-5 w-5" aria-hidden="true" />
        </button>
        <span class="min-w-36 text-center text-base font-bold">{monthLabel}</span>
        <button
          type="button"
          class="inline-flex min-h-10 items-center justify-center rounded-md border border-black/10 bg-white p-2 shadow-sm transition hover:border-[#0f766e]/30 hover:text-[#0f766e]"
          aria-label="Next month"
          onclick={() => setMonth(1)}
        >
          <ChevronRight class="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="min-h-10 rounded-md border border-black/10 bg-white px-3 text-sm font-bold shadow-sm transition hover:border-[#0f766e]/30 hover:text-[#0f766e]"
          onclick={goToToday}
        >
          Today
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-bold shadow-sm transition hover:border-[#0f766e]/30 hover:text-[#0f766e]"
          onclick={() => {
            showExportForm = !showExportForm;
            if (showExportForm) showCreateForm = false;
          }}
        >
          <Download class="h-4 w-4" aria-hidden="true" />
          Export CSV
        </button>
        <button
          type="button"
          class="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833]"
          onclick={() => {
            showCreateForm = !showCreateForm;
            if (showCreateForm) showExportForm = false;
          }}
        >
          <Plus class="h-4 w-4" aria-hidden="true" />
          New request
        </button>
      </div>
    </div>

    {#if showExportForm}
      <form
        class="mb-4 rounded-md border border-black/10 bg-gray-50 p-4"
        onsubmit={(event) => {
          event.preventDefault();
          exportCSV();
        }}
      >
        <p class="text-sm font-bold">Download a CSV report for any date range</p>
        <div class="mt-3 grid gap-3 sm:grid-cols-[auto_auto_auto]">
          <label class="block text-sm font-semibold text-gray-700" for="subs-export-start">
            Start date
            <input
              id="subs-export-start"
              type="date"
              class="mt-1 block min-h-10 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={exportStartDate}
              disabled={isExporting}
            />
          </label>
          <label class="block text-sm font-semibold text-gray-700" for="subs-export-end">
            End date
            <input
              id="subs-export-end"
              type="date"
              class="mt-1 block min-h-10 rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={exportEndDate}
              disabled={isExporting}
            />
          </label>
          <div class="flex items-end">
            <button
              type="submit"
              class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#1E1E1E] px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isExporting}
            >
              {#if isExporting}
                <span class="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true"></span>
                Exporting
              {:else}
                Download CSV
              {/if}
            </button>
          </div>
        </div>
        {#if exportError}
          <div class="mt-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{exportError}</span>
          </div>
        {/if}
      </form>
    {/if}

    {#if showCreateForm}
      <form class="mb-4 rounded-md border border-black/10 bg-gray-50 p-4" onsubmit={createRequest}>
        <p class="text-sm font-bold">Create a sub request</p>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <label class="block text-sm font-semibold text-gray-700" for="subs-new-class">
            Class name *
            <input
              id="subs-new-class"
              type="text"
              class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              placeholder="e.g., Yoga Flow, Pilates, HIIT"
              bind:value={newClassName}
              disabled={isCreating}
            />
          </label>
          <label class="block text-sm font-semibold text-gray-700" for="subs-new-date">
            Date *
            <input
              id="subs-new-date"
              type="date"
              class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={newDate}
              disabled={isCreating}
            />
          </label>
          <label class="block text-sm font-semibold text-gray-700" for="subs-new-requester-name">
            Instructor name *
            <input
              id="subs-new-requester-name"
              type="text"
              class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              placeholder="Who needs the sub?"
              bind:value={newRequesterName}
              disabled={isCreating}
            />
          </label>
          <label class="block text-sm font-semibold text-gray-700" for="subs-new-requester-email">
            Instructor email *
            <input
              id="subs-new-requester-email"
              type="email"
              class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              placeholder="instructor@email.com"
              bind:value={newRequesterEmail}
              disabled={isCreating}
            />
          </label>
          <label class="block text-sm font-semibold text-gray-700" for="subs-new-duration">
            Duration (minutes)
            <input
              id="subs-new-duration"
              type="number"
              min="5"
              max="600"
              class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={newDuration}
              disabled={isCreating}
            />
          </label>
          <label class="block text-sm font-semibold text-gray-700" for="subs-new-location">
            Location
            <input
              id="subs-new-location"
              type="text"
              class="mt-1 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={newLocation}
              disabled={isCreating}
            />
          </label>
          <label class="block text-sm font-semibold text-gray-700 sm:col-span-2" for="subs-new-notes">
            Notes
            <textarea
              id="subs-new-notes"
              rows="2"
              class="mt-1 w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              placeholder="Class time, format, anything a sub should know"
              bind:value={newNotes}
              disabled={isCreating}
            ></textarea>
          </label>
        </div>
        <div class="mt-3 flex justify-end">
          <button
            type="submit"
            class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#1E1E1E] px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isCreating ||
              !newClassName.trim() ||
              !newDate ||
              !newRequesterName.trim() ||
              !newRequesterEmail.trim()}
          >
            {#if isCreating}
              <span class="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true"></span>
              Creating
            {:else}
              Create request
            {/if}
          </button>
        </div>
        {#if createError}
          <div class="mt-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{createError}</span>
          </div>
        {/if}
      </form>
    {/if}

    <div class="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
      <input
        type="search"
        class="min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20 md:max-w-sm"
        placeholder="Search by class, name, date, location"
        aria-label="Search sub requests"
        bind:value={searchQuery}
      />
      <div class="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {#each STATUS_FILTERS as filter (filter.id)}
          <button
            type="button"
            class="min-h-9 rounded-md px-3 text-sm font-bold transition {getFilterChipClass(filter.id)}"
            aria-pressed={statusFilter === filter.id}
            onclick={() => (statusFilter = filter.id)}
          >
            {filter.label}
          </button>
        {/each}
      </div>
    </div>

    {#if isSearching && !isLoading}
      <p class="mb-3 text-sm text-gray-500">
        Found {filteredRequests.length} result{filteredRequests.length === 1 ? "" : "s"} in {monthLabel}.
      </p>
    {/if}

    {#if isLoading}
      <div class="flex min-h-48 items-center justify-center">
        <div class="flex items-center gap-3 text-sm text-gray-600">
          <span class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin" aria-hidden="true"></span>
          Loading sub requests
        </div>
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
        <div class="overflow-x-auto rounded-md border border-gray-200">
          <div class="grid min-w-[48rem] grid-cols-7 border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
            {#each weekdays as weekday}
              <div class="border-r border-gray-200 px-3 py-2 last:border-r-0">
                {weekday}
              </div>
            {/each}
          </div>
          <div class="grid min-w-[48rem] grid-cols-7">
            {#each calendarDays as day (day.dateKey)}
              <div
                class="min-h-28 border-r border-t border-gray-200 px-2 py-2 first:border-t-0 last:border-r-0 [&:nth-child(-n+7)]:border-t-0 {day.isCurrentMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'}"
              >
                <div class="mb-2 flex items-center justify-between gap-2">
                  <span class="inline-flex h-6 min-w-6 items-center justify-center rounded-full text-sm font-bold {day.isToday ? 'bg-[#1E1E1E] text-white' : ''}">
                    {day.dayNumber}
                  </span>
                  {#if day.items.length}
                    <span class="text-xs font-bold text-gray-500">{day.items.length}</span>
                  {/if}
                </div>
                <div class="space-y-1.5">
                  {#each day.items as request (request.id)}
                    <button
                      type="button"
                      class="w-full rounded-md border px-2 py-1.5 text-left text-xs font-semibold leading-snug transition focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-1 {getStatusChipClass(request.status)}"
                      onclick={() => (selectedRequest = request)}
                    >
                      <span class="mb-1 flex items-center gap-1.5">
                        <span class="h-2 w-2 shrink-0 rounded-full {getStatusDotClass(request.status)}"></span>
                        <span class="truncate">{getStatusLabel(request.status)}</span>
                      </span>
                      <span class="line-clamp-2">{request.class_name}</span>
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
            class="flex w-full flex-wrap items-center gap-3 rounded-md border border-black/10 bg-white px-4 py-3 text-left transition hover:border-[#0f766e]/40 hover:shadow-sm"
            onclick={() => (selectedRequest = request)}
          >
            <span class="min-w-0 flex-1">
              <span class="block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                {formatDate(request.date)}
              </span>
              <span class="mt-1 block font-bold leading-snug">{request.class_name}</span>
              <span class="mt-1 block text-sm text-gray-600">
                Requested by {request.requested_by_name}
                {#if request.assigned_sub_name}
                  · Sub: {request.assigned_sub_name}
                {:else if request.sub_volunteers.length}
                  · {request.sub_volunteers.length} volunteer{request.sub_volunteers.length === 1 ? "" : "s"} waiting
                {/if}
              </span>
            </span>
            <span class="rounded-full border px-2.5 py-1 text-xs font-bold {getStatusBadgeClass(request.status)}">
              {getStatusLabel(request.status)}
            </span>
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
