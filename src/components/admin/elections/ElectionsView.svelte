<script>
  import { onMount } from "svelte";
  import {
    CalendarClock,
    CircleAlert,
    CircleCheck,
    Search,
    Trash2,
    Vote,
  } from "@lucide/svelte";
  import EmptyState from "../marketing/EmptyState.svelte";
  import Panel from "../marketing/Panel.svelte";
  import SummaryCard from "../marketing/SummaryCard.svelte";
  import { isOperationalAdmin } from "../../../lib/dashboard/roles";

  export let supabase;
  export let profile = null;
  export let refreshKey = 0;

  const POSITIONS = [
    { key: "president", label: "President" },
    { key: "vice_president", label: "Vice President" },
    { key: "treasurer", label: "Treasurer" },
    { key: "secretary", label: "Secretary" },
  ];

  let election = null;
  let votes = [];
  let isLoading = true;
  let errorMessage = "";
  let lastRefreshKey = refreshKey;

  let opensAtInput = "";
  let closesAtInput = "";
  let isSavingSchedule = false;
  let scheduleSaved = false;
  let isSavingOverride = false;

  let voteSearch = "";
  let deleteError = "";
  let confirmDeleteId = "";
  let deletingId = "";

  $: isAdmin = isOperationalAdmin(profile);

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadData();
  }

  $: tallies = POSITIONS.map((position) => {
    const counts = {};
    for (const vote of votes) {
      const choice = (vote[position.key] || "").trim();
      if (!choice) continue;
      counts[choice] = (counts[choice] || 0) + 1;
    }

    const rows = Object.entries(counts)
      .map(([candidate, count]) => ({ candidate, count }))
      .sort((a, b) => b.count - a.count || a.candidate.localeCompare(b.candidate));
    const total = rows.reduce((sum, row) => sum + row.count, 0);

    return { ...position, rows, total };
  });

  $: votingState = getVotingState(election);

  $: matchedVotes = voteSearch.trim()
    ? votes.filter((vote) =>
        (vote.email || "").toLowerCase().includes(voteSearch.trim().toLowerCase()),
      )
    : [];

  onMount(() => {
    loadData();
  });

  async function loadData() {
    if (!supabase) return;

    isLoading = true;
    errorMessage = "";

    const { data: electionData, error: electionError } = await supabase
      .from("elections")
      .select("*")
      .eq("is_current", true)
      .maybeSingle();

    if (electionError) {
      errorMessage = electionError.message;
      isLoading = false;
      return;
    }

    election = electionData || null;
    opensAtInput = toLocalInput(election?.opens_at);
    closesAtInput = toLocalInput(election?.closes_at);

    if (!election) {
      votes = [];
      isLoading = false;
      return;
    }

    const { data: voteData, error: votesError } = await supabase
      .from("election_votes")
      .select("*")
      .eq("election_id", election.id)
      .order("created_at", { ascending: false });

    if (votesError) {
      errorMessage = votesError.message;
    } else {
      votes = voteData || [];
    }

    isLoading = false;
  }

  function getVotingState(record) {
    if (!record) {
      return { open: false, label: "No current election", detail: "" };
    }

    if (record.override === "open") {
      return {
        open: true,
        label: "Open",
        detail: "Manual override is active. Voting stays open until you change it.",
      };
    }

    if (record.override === "closed") {
      return {
        open: false,
        label: "Closed",
        detail: "Manual override is active. Voting stays closed until you change it.",
      };
    }

    if (!record.opens_at || !record.closes_at) {
      return {
        open: false,
        label: "Closed",
        detail: "No schedule is set. Add open and close times or use a manual override.",
      };
    }

    const now = Date.now();
    const opens = new Date(record.opens_at).getTime();
    const closes = new Date(record.closes_at).getTime();

    if (now < opens) {
      return {
        open: false,
        label: "Scheduled",
        detail: `Voting opens ${formatDateTime(record.opens_at)}.`,
      };
    }

    if (now > closes) {
      return {
        open: false,
        label: "Closed",
        detail: `Voting ended ${formatDateTime(record.closes_at)}.`,
      };
    }

    return {
      open: true,
      label: "Open",
      detail: `Voting is open on schedule until ${formatDateTime(record.closes_at)}.`,
    };
  }

  async function setOverride(value) {
    if (!supabase || !election || isSavingOverride) return;

    isSavingOverride = true;
    errorMessage = "";

    const { data, error } = await supabase
      .from("elections")
      .update({ override: value })
      .eq("id", election.id)
      .select("*")
      .single();

    if (error) {
      errorMessage = error.message;
    } else {
      election = data;
    }

    isSavingOverride = false;
  }

  async function saveSchedule(event) {
    event?.preventDefault();
    if (!supabase || !election || isSavingSchedule) return;

    isSavingSchedule = true;
    scheduleSaved = false;
    errorMessage = "";

    const { data, error } = await supabase
      .from("elections")
      .update({
        opens_at: fromLocalInput(opensAtInput),
        closes_at: fromLocalInput(closesAtInput),
      })
      .eq("id", election.id)
      .select("*")
      .single();

    if (error) {
      errorMessage = error.message;
    } else {
      election = data;
      scheduleSaved = true;
      setTimeout(() => (scheduleSaved = false), 3000);
    }

    isSavingSchedule = false;
  }

  async function deleteVote(voteId) {
    if (!supabase || deletingId) return;

    deletingId = voteId;
    deleteError = "";

    const { error } = await supabase
      .from("election_votes")
      .delete()
      .eq("id", voteId);

    if (error) {
      deleteError = error.message;
    } else {
      votes = votes.filter((vote) => vote.id !== voteId);
    }

    confirmDeleteId = "";
    deletingId = "";
  }

  function toLocalInput(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function fromLocalInput(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function formatDateTime(iso) {
    if (!iso) return "not set";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  }
</script>

<section class="space-y-4" aria-labelledby="elections-view-title">
  <h3 id="elections-view-title" class="sr-only">Elections</h3>

  {#if errorMessage}
    <div class="flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{errorMessage}</span>
    </div>
  {/if}

  <div class="grid gap-3 sm:grid-cols-2">
    <SummaryCard label="Total ballots" value={votes.length} icon={Vote} tone="gold" />
    <SummaryCard
      label="Voting status"
      value={votingState.label}
      icon={votingState.open ? CircleCheck : CalendarClock}
      tone={votingState.open ? "teal" : "rose"}
    />
  </div>

  {#if isLoading}
    <div class="flex min-h-48 items-center justify-center rounded-lg border border-black/10 bg-white">
      <div class="flex items-center gap-3 text-sm text-gray-600">
        <span class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin" aria-hidden="true"></span>
        Loading election data
      </div>
    </div>
  {:else if !election}
    <Panel title="Current election" id="elections-current-panel">
      <EmptyState
        title="No current election"
        message="There is no election marked as current. Create one in Supabase, or ask an admin to set one up."
      />
    </Panel>
  {:else}
    <div
      class="flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 text-sm {votingState.open
        ? 'border-teal-200 bg-teal-50 text-teal-900'
        : 'border-amber-200 bg-amber-50 text-amber-900'}"
      role="status"
    >
      <span class="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide {votingState.open ? 'bg-teal-600 text-white' : 'bg-amber-500 text-white'}">
        {votingState.open ? "Voting open" : "Voting closed"}
      </span>
      <span class="font-semibold">{election.name}</span>
      <span class="text-current/80">{votingState.detail}</span>
    </div>

    <Panel title="Voting window" id="elections-window-panel" loading={isSavingOverride || isSavingSchedule}>
      <div class="space-y-4">
        <div>
          <p class="mb-2 text-sm font-semibold text-gray-600">Override</p>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Voting override">
            <button
              type="button"
              class="inline-flex min-h-10 items-center gap-2 rounded-md border px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 {election.override === 'open'
                ? 'border-[#0f766e] bg-[#0f766e] text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-[#0f766e]/50'}"
              onclick={() => setOverride("open")}
              disabled={isSavingOverride}
            >
              Open now
            </button>
            <button
              type="button"
              class="inline-flex min-h-10 items-center gap-2 rounded-md border px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 {election.override === null
                ? 'border-[#ffbd59] bg-[#ffbd59] text-[#1E1E1E]'
                : 'border-gray-200 bg-white text-gray-700 hover:border-[#ffbd59]'}"
              onclick={() => setOverride(null)}
              disabled={isSavingOverride}
            >
              Use schedule
            </button>
            <button
              type="button"
              class="inline-flex min-h-10 items-center gap-2 rounded-md border px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 {election.override === 'closed'
                ? 'border-red-600 bg-red-600 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-red-300'}"
              onclick={() => setOverride("closed")}
              disabled={isSavingOverride}
            >
              Close now
            </button>
          </div>
        </div>

        <form class="rounded-md border border-black/10 bg-gray-50 p-4" onsubmit={saveSchedule}>
          <p class="mb-3 text-sm font-semibold text-gray-600">
            Schedule (used when no override is set)
          </p>
          <div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label class="block text-sm">
              <span class="mb-1 block font-semibold text-gray-700">Opens at</span>
              <input
                type="datetime-local"
                class="min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={opensAtInput}
                disabled={isSavingSchedule}
              />
            </label>
            <label class="block text-sm">
              <span class="mb-1 block font-semibold text-gray-700">Closes at</span>
              <input
                type="datetime-local"
                class="min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={closesAtInput}
                disabled={isSavingSchedule}
              />
            </label>
            <div class="flex items-end">
              <button
                type="submit"
                class="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSavingSchedule}
              >
                {#if isSavingSchedule}
                  <span class="h-4 w-4 rounded-full border-2 border-[#1E1E1E] border-t-transparent animate-spin" aria-hidden="true"></span>
                  Saving
                {:else}
                  Save schedule
                {/if}
              </button>
            </div>
          </div>
          {#if scheduleSaved}
            <p class="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-teal-700">
              <CircleCheck class="h-4 w-4" aria-hidden="true" />
              Schedule saved.
            </p>
          {/if}
        </form>
      </div>
    </Panel>

    <Panel title="Tally by position" id="elections-tally-panel" loading={isLoading}>
      {#if !votes.length}
        <EmptyState
          title="No ballots yet"
          message="Ballots will appear here as soon as the first vote is cast in the current election."
        />
      {:else}
        <p class="mb-4 text-sm text-gray-600">
          {votes.length} ballot{votes.length === 1 ? "" : "s"} cast in {election.name}.
        </p>
        <div class="grid gap-4 lg:grid-cols-2">
          {#each tallies as tally (tally.key)}
            <div class="rounded-md border border-black/10 bg-white p-4">
              <div class="mb-3 flex items-center justify-between gap-2 border-b-2 border-[#ffbd59] pb-2">
                <h4 class="text-sm font-bold uppercase tracking-wide text-gray-800">{tally.label}</h4>
                <span class="text-xs font-semibold text-gray-500">
                  {tally.total} vote{tally.total === 1 ? "" : "s"}
                </span>
              </div>
              {#if tally.rows.length}
                <div class="space-y-2.5">
                  {#each tally.rows as row, index (row.candidate)}
                    {@const percentage = tally.total > 0 ? Math.round((row.count / tally.total) * 1000) / 10 : 0}
                    <div class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                      <span class="truncate text-sm {index === 0 ? 'font-bold' : 'font-medium'} text-gray-800">
                        {row.candidate}
                      </span>
                      <span class="text-xs font-bold text-gray-600">
                        {row.count} · {percentage}%
                      </span>
                      <div class="col-span-2 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          class="h-full rounded-full {index === 0 ? 'bg-[#0f766e]' : 'bg-[#0f766e]/45'}"
                          style="width: {percentage}%"
                        ></div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-sm italic text-gray-500">No selections recorded for this position.</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </Panel>

    {#if isAdmin}
      <Panel title="Remove a ballot" id="elections-delete-panel">
        <p class="mb-3 text-sm text-gray-600">
          Search by voter email to remove a ballot. Removing a ballot lets that
          email vote again. Admins only.
        </p>

        {#if deleteError}
          <div class="mb-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{deleteError}</span>
          </div>
        {/if}

        <div class="relative mb-3 max-w-md">
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            class="min-h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            placeholder="Search by voter email"
            aria-label="Search ballots by voter email"
            bind:value={voteSearch}
          />
        </div>

        {#if voteSearch.trim()}
          {#if matchedVotes.length}
            <ul class="space-y-2">
              {#each matchedVotes as vote (vote.id)}
                <li class="flex flex-wrap items-center gap-3 rounded-md border border-black/10 bg-white px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-bold text-gray-900">{vote.email}</p>
                    <p class="mt-0.5 text-xs text-gray-500">
                      Cast {formatDateTime(vote.created_at)} · Pres: {vote.president || "blank"} ·
                      VP: {vote.vice_president || "blank"} · Treas: {vote.treasurer || "blank"} ·
                      Sec: {vote.secretary || "blank"}
                    </p>
                  </div>
                  {#if confirmDeleteId === vote.id}
                    <div class="flex items-center gap-2">
                      <button
                        type="button"
                        class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-red-600 px-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        onclick={() => deleteVote(vote.id)}
                        disabled={deletingId === vote.id}
                      >
                        {#if deletingId === vote.id}
                          <span class="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true"></span>
                          Deleting
                        {:else}
                          Confirm delete
                        {/if}
                      </button>
                      <button
                        type="button"
                        class="inline-flex min-h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
                        onclick={() => (confirmDeleteId = "")}
                        disabled={deletingId === vote.id}
                      >
                        Cancel
                      </button>
                    </div>
                  {:else}
                    <button
                      type="button"
                      class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-sm font-bold text-red-700 transition hover:bg-red-50"
                      onclick={() => (confirmDeleteId = vote.id)}
                    >
                      <Trash2 class="h-4 w-4" aria-hidden="true" />
                      Delete
                    </button>
                  {/if}
                </li>
              {/each}
            </ul>
          {:else}
            <p class="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
              No ballots match that email.
            </p>
          {/if}
        {/if}
      </Panel>
    {/if}
  {/if}
</section>
