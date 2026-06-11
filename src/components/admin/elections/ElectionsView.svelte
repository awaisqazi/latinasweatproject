<script>
  import { onMount } from "svelte";
  import { CalendarClock, CircleCheck, Trash2, Vote } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import SearchInput from "../ui/SearchInput.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import StatCard from "../ui/StatCard.svelte";
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

  $: confirmingVote = votes.find((vote) => vote.id === confirmDeleteId) || null;

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
    <Banner tone="error" message={errorMessage} />
  {/if}

  <div class="grid gap-3 sm:grid-cols-2">
    <StatCard label="Total ballots" value={votes.length} icon={Vote} tone="gold" loading={isLoading} />
    <StatCard
      label="Voting status"
      value={votingState.label}
      icon={votingState.open ? CircleCheck : CalendarClock}
      tone={votingState.open ? "teal" : "rose"}
      loading={isLoading}
    />
  </div>

  {#if isLoading}
    <div class="space-y-4">
      <SkeletonCard lines={3} />
      <SkeletonCard lines={4} />
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
      class="flex flex-wrap items-center gap-3 rounded-control border px-4 py-3 text-sm {votingState.open
        ? 'border-accent/30 bg-accent-soft text-accent-strong'
        : 'border-amber-200 bg-amber-50 text-amber-900'}"
      role="status"
    >
      <Badge tone={votingState.open ? "teal" : "amber"} variant="solid" class="uppercase tracking-wide">
        {votingState.open ? "Voting open" : "Voting closed"}
      </Badge>
      <span class="font-semibold">{election.name}</span>
      <span class="text-current/80">{votingState.detail}</span>
    </div>

    <Panel title="Voting window" id="elections-window-panel" loading={isSavingOverride || isSavingSchedule}>
      <div class="space-y-4">
        <div>
          <p class="mb-2 text-sm font-semibold text-ink/60">Override</p>
          <div class="flex flex-wrap gap-2" role="group" aria-label="Voting override">
            <button
              type="button"
              class="inline-flex min-h-10 items-center gap-2 rounded-control border px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 {election.override === 'open'
                ? 'border-accent bg-accent text-white'
                : 'border-ink/14 bg-white text-ink/70 hover:border-accent/50'}"
              onclick={() => setOverride("open")}
              disabled={isSavingOverride}
            >
              Open now
            </button>
            <button
              type="button"
              class="inline-flex min-h-10 items-center gap-2 rounded-control border px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 {election.override === null
                ? 'border-brand bg-brand text-ink'
                : 'border-ink/14 bg-white text-ink/70 hover:border-brand'}"
              onclick={() => setOverride(null)}
              disabled={isSavingOverride}
            >
              Use schedule
            </button>
            <button
              type="button"
              class="inline-flex min-h-10 items-center gap-2 rounded-control border px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 {election.override === 'closed'
                ? 'border-red-600 bg-red-600 text-white'
                : 'border-ink/14 bg-white text-ink/70 hover:border-red-300'}"
              onclick={() => setOverride("closed")}
              disabled={isSavingOverride}
            >
              Close now
            </button>
          </div>
        </div>

        <form class="rounded-control border border-ink/8 bg-canvas p-4" onsubmit={saveSchedule}>
          <p class="mb-3 text-sm font-semibold text-ink/60">
            Schedule (used when no override is set)
          </p>
          <div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field label="Opens at" id="election-opens-at">
              <input
                id="election-opens-at"
                type="datetime-local"
                class="input"
                bind:value={opensAtInput}
                disabled={isSavingSchedule}
              />
            </Field>
            <Field label="Closes at" id="election-closes-at">
              <input
                id="election-closes-at"
                type="datetime-local"
                class="input"
                bind:value={closesAtInput}
                disabled={isSavingSchedule}
              />
            </Field>
            <div class="flex items-end">
              <Button variant="primary" type="submit" loading={isSavingSchedule}>
                Save schedule
              </Button>
            </div>
          </div>
          {#if scheduleSaved}
            <Banner tone="success" message="Schedule saved." class="mt-3" />
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
        <p class="mb-4 text-sm text-ink/60">
          {votes.length} ballot{votes.length === 1 ? "" : "s"} cast in {election.name}.
        </p>
        <div class="grid gap-4 lg:grid-cols-2">
          {#each tallies as tally (tally.key)}
            <div class="rounded-control border border-ink/8 bg-white p-4">
              <div class="mb-3 flex items-center justify-between gap-2 border-b-2 border-brand pb-2">
                <h4 class="text-sm font-bold uppercase tracking-wide text-ink">{tally.label}</h4>
                <span class="text-xs font-semibold text-ink/50">
                  {tally.total} vote{tally.total === 1 ? "" : "s"}
                </span>
              </div>
              {#if tally.rows.length}
                <div class="space-y-2.5">
                  {#each tally.rows as row, index (row.candidate)}
                    {@const percentage = tally.total > 0 ? Math.round((row.count / tally.total) * 1000) / 10 : 0}
                    <div class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                      <span class="truncate text-sm {index === 0 ? 'font-bold' : 'font-medium'} text-ink">
                        {row.candidate}
                      </span>
                      <span class="text-xs font-bold text-ink/60">
                        {row.count} · {percentage}%
                      </span>
                      <div class="col-span-2 h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                        <div
                          class="h-full rounded-full {index === 0 ? 'bg-accent' : 'bg-accent/45'}"
                          style="width: {percentage}%"
                        ></div>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="text-sm italic text-ink/50">No selections recorded for this position.</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </Panel>

    {#if isAdmin}
      <Panel title="Remove a ballot" id="elections-delete-panel">
        <p class="mb-3 text-sm text-ink/60">
          Search by voter email to remove a ballot. Removing a ballot lets that
          email vote again. Admins only.
        </p>

        {#if deleteError}
          <Banner tone="error" message={deleteError} class="mb-3" />
        {/if}

        <SearchInput
          bind:value={voteSearch}
          placeholder="Search by voter email"
          label="Search ballots by voter email"
          class="mb-3 max-w-md"
        />

        {#if voteSearch.trim()}
          {#if matchedVotes.length}
            <ul class="space-y-2">
              {#each matchedVotes as vote (vote.id)}
                <li class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-bold text-ink">{vote.email}</p>
                    <p class="mt-0.5 text-xs text-ink/50">
                      Cast {formatDateTime(vote.created_at)} · Pres: {vote.president || "blank"} ·
                      VP: {vote.vice_president || "blank"} · Treas: {vote.treasurer || "blank"} ·
                      Sec: {vote.secretary || "blank"}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={Trash2}
                    loading={deletingId === vote.id}
                    onclick={() => (confirmDeleteId = vote.id)}
                  >
                    Delete
                  </Button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="rounded-control border border-dashed border-ink/15 bg-canvas/60 px-4 py-6 text-center text-sm text-ink/55">
              No ballots match that email.
            </p>
          {/if}
        {/if}
      </Panel>

      <ConfirmDialog
        open={Boolean(confirmDeleteId)}
        title="Remove this ballot?"
        message={`Remove the ballot cast by ${confirmingVote?.email || "this voter"}? That email will be able to vote again. This cannot be undone.`}
        confirmLabel="Delete ballot"
        tone="danger"
        busy={Boolean(deletingId)}
        onConfirm={() => deleteVote(confirmDeleteId)}
        onCancel={() => (confirmDeleteId = "")}
      />
    {/if}
  {/if}
</section>
