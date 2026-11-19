<script>
  // Grant pipeline: the six phases (Prospecting through Received) and
  // Declined set apart. On a tablet or wider it is a kanban with drag and
  // drop and the filters on show. Below that (phones) it is a list grouped by
  // phase, each group collapsible with its count and total, and each grant
  // has a "Move to <next phase>" button and a phase picker; search and
  // filters sit behind one "Filters" control. "Overdue next step" is a quick
  // filter on every size. Moves use
  // the shared optimistic-lock pattern (eq updated_at) so two people working
  // the pipeline can't silently clobber each other. Moving to Committed asks
  // for the amount and date first; moving to Received asks for the date.
  import { onDestroy, onMount } from "svelte";
  import { CalendarClock, ChevronDown, Plus, Search, UserRound } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import GrantStageDialog from "./GrantStageDialog.svelte";
  import {
    GRANT_PHASES,
    PROSPECT_KINDS,
    formatMoney,
    normalizeProspectStage,
    stageMoveNeeds,
    withProspectColumns,
  } from "../../../lib/dashboard/fundraising";
  import { formatCentsWhole, prospectAsk } from "../../../lib/dashboard/fundraisingLive";
  import { chicagoToday } from "../../../lib/dashboard/timeclock";

  export let supabase;
  export let prospects = [];
  export let teamMembers = [];
  export let onSelect = () => {};
  export let onProspectUpdated = () => {};
  // Quick filter, bound so Next up can open the pipeline on overdue grants.
  export let overdueOnly = false;

  const FIT_TONES = { high: "green", medium: "amber", low: "neutral" };
  const KIND_LABELS = Object.fromEntries(
    PROSPECT_KINDS.map((kind) => [kind.value, kind.label]),
  );

  let search = "";
  let fitFilter = "all";
  let kindFilter = "all";
  let ownerFilter = "all";
  let showCreateForm = false;
  let newName = "";
  let newKind = "foundation";
  let isCreating = false;
  let errorMessage = "";
  let draggedProspectId = "";
  let dragOverStage = "";
  let movingIds = new Set();
  let pendingMove = null; // { prospect, stage, mode } while the dialog asks
  const WIDE_QUERY = "(min-width: 768px)";
  let isWide = typeof window !== "undefined" && window.matchMedia ? window.matchMedia(WIDE_QUERY).matches : true;
  let showFilters = false;
  let openGroups = {}; // phase -> true/false once someone taps it
  let mediaQuery = null;
  const today = chicagoToday();
  const CLOSED_STAGES = ["Declined", "Received"];

  onMount(() => {
    if (!window.matchMedia) return;
    mediaQuery = window.matchMedia(WIDE_QUERY);
    isWide = mediaQuery.matches;
    mediaQuery.addEventListener?.("change", handleMedia);
  });

  onDestroy(() => {
    mediaQuery?.removeEventListener?.("change", handleMedia);
  });

  function handleMedia(event) {
    isWide = event.matches;
  }

  $: filteredProspects = prospects.filter((prospect) => {
    const query = search.trim().toLowerCase();
    if (query) {
      const haystack = [
        prospect.name,
        prospect.geography,
        prospect.fit_rationale,
        prospect.key_people,
        ...(prospect.focus_areas || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (fitFilter !== "all" && (prospect.fit_score || "unrated") !== fitFilter) return false;
    if (kindFilter !== "all" && prospect.kind !== kindFilter) return false;
    if (overdueOnly && !isOverdue(prospect, today)) return false;
    if (ownerFilter === "unowned" && prospect.owner_id) return false;
    if (
      ownerFilter !== "all" &&
      ownerFilter !== "unowned" &&
      prospect.owner_id !== ownerFilter
    ) {
      return false;
    }
    return true;
  });
  $: prospectsByStage = [...GRANT_PHASES, "Declined"].reduce((groups, stage) => {
    groups[stage] = filteredProspects
      .filter((prospect) => normalizeProspectStage(prospect.stage) === stage)
      .sort(byPriorityThenFit);
    return groups;
  }, {});
  $: hasFilters =
    Boolean(search.trim()) || fitFilter !== "all" || kindFilter !== "all" || ownerFilter !== "all" || overdueOnly;
  // Filters tucked behind the phone "Filters" control, for its label.
  $: hiddenFilterCount =
    (search.trim() ? 1 : 0) + (fitFilter !== "all" ? 1 : 0) + (kindFilter !== "all" ? 1 : 0) + (ownerFilter !== "all" ? 1 : 0);
  $: overdueCount = prospects.filter((prospect) => isOverdue(prospect, today)).length;
  $: groupTotals = Object.fromEntries(
    [...GRANT_PHASES, "Declined"].map((stage) => [stage, phaseTotal(prospectsByStage[stage] || [], stage)]),
  );

  function byPriorityThenFit(a, b) {
    const priority = (a.priority || "P2").localeCompare(b.priority || "P2");
    if (priority !== 0) return priority;
    const rank = { high: 0, medium: 1, low: 2 };
    return (rank[a.fit_score] ?? 3) - (rank[b.fit_score] ?? 3);
  }

  async function createProspect(event) {
    event?.preventDefault();

    const name = newName.trim();
    if (!name || isCreating) return;

    isCreating = true;
    errorMessage = "";

    const { data, error } = await withProspectColumns((columns) =>
      supabase
        .from("fundraising_prospects")
        .insert({ name, kind: newKind, source: "manual" })
        .select(columns)
        .single(),
    );

    if (error) {
      errorMessage = error.message;
    } else {
      onProspectUpdated(data);
      newName = "";
      showCreateForm = false;
      onSelect(data);
    }

    isCreating = false;
  }

  // Committed and Received ask first; every other move saves at once.
  function requestMove(prospect, stage) {
    if (!prospect?.id || normalizeProspectStage(prospect.stage) === stage || movingIds.has(prospect.id)) return;
    const mode = stageMoveNeeds(prospect.stage, stage);
    if (mode) {
      pendingMove = { prospect, stage, mode };
      return;
    }
    moveProspectToStage(prospect, { stage });
  }

  function confirmPendingMove(updates) {
    const move = pendingMove;
    pendingMove = null;
    if (move) moveProspectToStage(move.prospect, updates);
  }

  async function moveProspectToStage(prospect, updates) {
    if (!prospect?.id || movingIds.has(prospect.id)) return;

    movingIds = new Set(movingIds).add(prospect.id);
    errorMessage = "";
    const previous = prospect;
    onProspectUpdated({ ...prospect, ...updates });

    const { data, error } = await withProspectColumns((columns) => {
      let query = supabase
        .from("fundraising_prospects")
        .update(updates)
        .eq("id", prospect.id);
      if (prospect.updated_at) query = query.eq("updated_at", prospect.updated_at);
      return query.select(columns).maybeSingle();
    });

    if (error) {
      errorMessage = error.message;
      onProspectUpdated(previous);
    } else if (!data) {
      onProspectUpdated(previous);
      errorMessage = `Someone else just updated "${prospect.name}", so the pipeline was refreshed with their change. Try again in a moment.`;
      const { data: fresh } = await withProspectColumns((columns) =>
        supabase
          .from("fundraising_prospects")
          .select(columns)
          .eq("id", prospect.id)
          .maybeSingle(),
      );
      if (fresh) onProspectUpdated(fresh);
    } else {
      onProspectUpdated(data);
    }

    const nextMoving = new Set(movingIds);
    nextMoving.delete(prospect.id);
    movingIds = nextMoving;
  }

  function handleDragStart(event, prospect) {
    if (movingIds.has(prospect.id)) {
      event.preventDefault();
      return;
    }
    draggedProspectId = prospect.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", prospect.id);
  }

  function handleDragEnd() {
    draggedProspectId = "";
    dragOverStage = "";
  }

  function handleStageDragOver(event, stage) {
    if (!draggedProspectId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    dragOverStage = stage;
  }

  function handleStageDragLeave(event, stage) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    if (dragOverStage === stage) dragOverStage = "";
  }

  function handleStageDrop(event, stage) {
    event.preventDefault();

    const prospectId = event.dataTransfer.getData("text/plain") || draggedProspectId;
    const prospect = prospects.find((item) => item.id === prospectId);

    draggedProspectId = "";
    dragOverStage = "";

    if (!prospect) return;
    requestMove(prospect, stage);
  }

  function cardAmount(prospect) {
    if (Number(prospect.committed_amount) > 0) return `Committed ${formatMoney(prospect.committed_amount)}`;
    if (Number(prospect.ask_amount) > 0) return `Ask ${formatMoney(prospect.ask_amount)}`;
    return "";
  }

  function ownerLabel(prospect) {
    const owner = teamMembers.find((member) => member.id === prospect.owner_id);
    return owner?.full_name || owner?.email || "";
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
      new Date(`${value}T00:00:00`),
    );
  }

  // A next step dated before today (Chicago) on a grant still in play.
  function isOverdue(prospect, todayKey = today) {
    if (!prospect.next_action_date) return false;
    if (CLOSED_STAGES.includes(normalizeProspectStage(prospect.stage))) return false;
    return String(prospect.next_action_date).slice(0, 10) < todayKey;
  }

  function nextPhase(stage) {
    const index = GRANT_PHASES.indexOf(normalizeProspectStage(stage));
    if (index < 0 || index >= GRANT_PHASES.length - 1) return "";
    return GRANT_PHASES[index + 1];
  }

  // "4 grants, $120,000 asked" (Committed and Received show what was committed).
  function phaseTotal(rows, stage) {
    const counted = stage === "Committed" || stage === "Received";
    let cents = 0;
    for (const prospect of rows) {
      if (counted && Number(prospect.committed_amount) > 0) cents += Math.round(Number(prospect.committed_amount) * 100);
      else if (!counted) cents += prospectAsk(prospect).cents || 0;
    }
    const parts = [`${rows.length} grant${rows.length === 1 ? "" : "s"}`];
    if (cents) parts.push(`${formatCentsWhole(cents)} ${counted ? "committed" : "asked"}`);
    return parts.join(", ");
  }

  function groupOpen(stage, count, groups, filtersOn) {
    if (stage in groups) return groups[stage];
    if (stage === "Declined") return false;
    return filtersOn ? count > 0 : count > 0 && count <= 12;
  }

  function toggleGroup(stage, isOpen) {
    openGroups = { ...openGroups, [stage]: !isOpen };
  }

  function pickPhase(event, prospect) {
    const stage = event.currentTarget.value;
    // The picker shows the saved phase until the move (or its dialog) lands.
    event.currentTarget.value = normalizeProspectStage(prospect.stage);
    requestMove(prospect, stage);
  }
</script>

<Panel title="Prospect pipeline" id="fundraising-prospects-panel">
  {#if isWide}
    <p class="mb-4 text-sm leading-6 text-ink/60">
      Foundations, grants, and major donors, researched and ranked by fit. Click a
      card for the full profile and its tailored engagement plan; drag cards between
      phases as each grant moves forward. Moving a grant to Committed asks for the
      amount and date.
    </p>
  {:else}
    <p class="-mt-2 mb-3 text-sm leading-6 text-ink/60">
      Tap a grant for its profile. Use Move to send it to the next phase.
    </p>
  {/if}

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} class="mb-4" />
  {/if}

  {#if !isWide}
    <div class="mb-3 flex flex-wrap gap-2">
      <button
        type="button"
        class="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control border px-4 text-sm font-semibold shadow-card transition {showFilters ? 'border-ink/30 bg-ink/[0.04] text-ink' : 'border-ink/14 bg-white text-ink hover:border-ink/30'}"
        aria-expanded={showFilters}
        aria-controls="fundraising-prospect-filters"
        onclick={() => (showFilters = !showFilters)}
      >
        Filters{hiddenFilterCount ? ` (${hiddenFilterCount})` : ""}
      </button>
      <button
        type="button"
        class="inline-flex min-h-11 flex-1 items-center justify-center rounded-control border px-4 text-sm font-semibold shadow-card transition {overdueOnly ? 'border-red-300 bg-red-50 text-red-800' : 'border-ink/14 bg-white text-ink hover:border-ink/30'}"
        aria-pressed={overdueOnly}
        onclick={() => (overdueOnly = !overdueOnly)}
      >
        Overdue next step{overdueCount ? ` (${overdueCount})` : ""}
      </button>
    </div>
  {/if}

  {#if isWide || showFilters}
  <div id="fundraising-prospect-filters" class="mb-4 grid gap-3 rounded-card border border-ink/8 bg-canvas/70 p-3 sm:grid-cols-2 xl:grid-cols-5">
    <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50 sm:col-span-2">
      Search
      <span class="relative mt-2 block">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" aria-hidden="true" />
        <input
          type="search"
          class="input pl-9"
          placeholder="Name, focus area, people, notes"
          bind:value={search}
        />
      </span>
    </label>
    <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
      Fit
      <select class="select mt-2" bind:value={fitFilter}>
        <option value="all">All</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
        <option value="unrated">Unrated</option>
      </select>
    </label>
    <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
      Type
      <select class="select mt-2" bind:value={kindFilter}>
        <option value="all">All</option>
        {#each PROSPECT_KINDS as kind}
          <option value={kind.value}>{kind.label}</option>
        {/each}
      </select>
    </label>
    <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
      Owner
      <select class="select mt-2" bind:value={ownerFilter}>
        <option value="all">All</option>
        <option value="unowned">Unowned</option>
        {#each teamMembers as member}
          <option value={member.id}>{member.full_name || member.email}</option>
        {/each}
      </select>
    </label>
  </div>
  {/if}

  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <p class="text-sm text-ink/60">
      {filteredProspects.length} of {prospects.length} prospects{hasFilters ? ", filtered" : ""}
    </p>
    <div class="flex flex-wrap items-center gap-2">
      {#if isWide}
        <button
          type="button"
          class="inline-flex min-h-9 items-center justify-center rounded-control border px-3 text-sm font-semibold shadow-card transition {overdueOnly ? 'border-red-300 bg-red-50 text-red-800' : 'border-ink/14 bg-white text-ink hover:border-ink/30'}"
          aria-pressed={overdueOnly}
          onclick={() => (overdueOnly = !overdueOnly)}
        >
          Overdue next step{overdueCount ? ` (${overdueCount})` : ""}
        </button>
      {/if}
      {#if hasFilters}
        <button
          type="button"
          class="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-ink/70 hover:bg-ink/[0.06] hover:text-ink md:min-h-9"
          onclick={() => {
            search = "";
            fitFilter = "all";
            kindFilter = "all";
            ownerFilter = "all";
            overdueOnly = false;
          }}
        >
          Clear filters
        </button>
      {/if}
      <button
        type="button"
        class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-transparent bg-brand px-3 text-sm font-semibold text-ink shadow-card transition-colors hover:bg-brand-strong md:min-h-9"
        aria-expanded={showCreateForm}
        onclick={() => (showCreateForm = !showCreateForm)}
      >
        <Plus class="h-4 w-4 shrink-0" aria-hidden="true" />
        New prospect
      </button>
    </div>
  </div>

  {#if showCreateForm}
    <form class="mb-4 rounded-control border border-ink/8 bg-canvas p-4" onsubmit={createProspect}>
      <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="text"
          class="input"
          placeholder="Prospect name (foundation, company, or person)"
          aria-label="Prospect name"
          bind:value={newName}
          disabled={isCreating}
        />
        <select class="select" aria-label="Prospect type" bind:value={newKind} disabled={isCreating}>
          {#each PROSPECT_KINDS as kind}
            <option value={kind.value}>{kind.label}</option>
          {/each}
        </select>
        <Button variant="dark" type="submit" loading={isCreating} disabled={!newName.trim()}>
          Create
        </Button>
      </div>
    </form>
  {/if}

  {#if prospects.length && !isWide}
    <div class="space-y-3">
      {#each [...GRANT_PHASES, "Declined"] as stage (stage)}
        {@const rows = prospectsByStage[stage] || []}
        {@const isOpen = groupOpen(stage, rows.length, openGroups, hasFilters)}
        <section class="rounded-card border border-ink/8 bg-canvas {stage === 'Declined' ? 'mt-6' : ''}" aria-label={`${stage} grants`}>
          <button
            type="button"
            class="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left"
            aria-expanded={isOpen}
            onclick={() => toggleGroup(stage, isOpen)}
          >
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-bold text-ink">{stage === "Declined" ? "Declined, kept on file" : stage}</span>
              <span class="mt-0.5 block text-sm text-ink/60">{groupTotals[stage]}</span>
            </span>
            <ChevronDown class="h-4 w-4 shrink-0 text-ink/40 transition {isOpen ? 'rotate-180' : ''}" aria-hidden="true" />
          </button>
          {#if isOpen}
            <ul class="space-y-2 px-3 pb-3">
              {#each rows as prospect (prospect.id)}
                {@const next = nextPhase(prospect.stage)}
                <li class="rounded-control border border-ink/8 bg-white shadow-card {movingIds.has(prospect.id) ? 'opacity-60' : ''}">
                  <button type="button" class="block min-h-11 w-full px-3 pt-2.5 text-left" onclick={() => onSelect(prospect)}>
                    <span class="flex items-start justify-between gap-2">
                      <span class="min-w-0 font-bold leading-snug text-ink">{prospect.name}</span>
                      {#if cardAmount(prospect)}
                        <span class="shrink-0 text-sm font-semibold tabular-nums text-ink/70">{cardAmount(prospect)}</span>
                      {/if}
                    </span>
                    <span class="mt-1 block text-sm text-ink/60">
                      {[KIND_LABELS[prospect.kind] || prospect.kind, ownerLabel(prospect) || "No owner", prospect.fit_score ? `${prospect.fit_score} fit` : ""].filter(Boolean).join(", ")}
                    </span>
                    {#if prospect.next_action || prospect.next_action_date}
                      <span class="mt-1 block text-sm text-ink/70">
                        {#if prospect.next_action_date}<span class={isOverdue(prospect, today) ? "font-semibold text-red-700" : ""}>{isOverdue(prospect, today) ? "Overdue" : "Next"} {formatDate(prospect.next_action_date)}</span>{prospect.next_action ? ": " : ""}{:else}{"Next: "}{/if}{prospect.next_action || ""}
                      </span>
                    {/if}
                  </button>
                  <div class="flex flex-wrap items-center gap-2 px-3 pb-3 pt-2">
                    {#if next}
                      <button
                        type="button"
                        class="inline-flex min-h-11 flex-1 items-center justify-center rounded-control border border-ink/14 bg-white px-3 text-sm font-semibold text-ink shadow-card hover:border-ink/30 disabled:opacity-55"
                        disabled={movingIds.has(prospect.id)}
                        onclick={() => requestMove(prospect, next)}
                      >
                        Move to {next}
                      </button>
                    {/if}
                    <label class="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink/60">
                      <span class="shrink-0">Phase</span>
                      <select
                        class="select min-h-11 min-w-0 flex-1"
                        aria-label={`Phase for ${prospect.name}`}
                        value={normalizeProspectStage(prospect.stage)}
                        disabled={movingIds.has(prospect.id)}
                        onchange={(event) => pickPhase(event, prospect)}
                      >
                        {#each [...GRANT_PHASES, "Declined"] as option (option)}
                          <option value={option}>{option}</option>
                        {/each}
                      </select>
                    </label>
                  </div>
                </li>
              {:else}
                <li class="rounded-control border border-dashed border-ink/15 bg-white px-3 py-4 text-center text-sm text-ink/50">
                  {hasFilters ? "No grants here match the filters" : stage === "Declined" ? "When a funder says no, move the grant here. It stays on file." : "Empty"}
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
    </div>
  {:else if prospects.length}
    <div class="prospect-kanban-scroll -mx-4 overflow-x-auto px-4 pb-3 md:-mx-6 md:px-6">
      <div class="prospect-kanban-track grid gap-3">
        {#each GRANT_PHASES as stage}
          <div
            class="snap-start flex h-[calc(100dvh-13rem)] min-h-[24rem] max-h-[44rem] flex-col rounded-card border border-ink/8 bg-canvas p-3 transition {dragOverStage === stage ? 'border-accent bg-accent-soft ring-2 ring-accent/20' : ''}"
            role="region"
            aria-label={`${stage} prospects`}
            ondragover={(event) => handleStageDragOver(event, stage)}
            ondragleave={(event) => handleStageDragLeave(event, stage)}
            ondrop={(event) => handleStageDrop(event, stage)}
          >
            <div class="mb-3 flex items-center justify-between gap-2">
              <h4 class="text-sm font-bold text-ink">{stage}</h4>
              <div class="flex items-center gap-2">
                {#if dragOverStage === stage}
                  <Badge tone="teal" variant="solid" size="xs">Drop</Badge>
                {/if}
                <Badge tone="neutral" size="xs" class="bg-white">
                  {prospectsByStage[stage]?.length || 0}
                </Badge>
              </div>
            </div>

            <div class="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
              {#each prospectsByStage[stage] || [] as prospect (prospect.id)}
                <div
                  class="rounded-control border border-ink/8 bg-white shadow-card transition {movingIds.has(prospect.id) ? 'opacity-60' : ''} {draggedProspectId === prospect.id ? 'opacity-50' : ''}"
                  draggable="true"
                  role="button"
                  tabindex="0"
                  ondragstart={(event) => handleDragStart(event, prospect)}
                  ondragend={handleDragEnd}
                  onclick={() => onSelect(prospect)}
                  onkeydown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(prospect);
                    }
                  }}
                >
                  <div class="px-3 py-2.5">
                    <div class="flex items-start justify-between gap-2">
                      <p class="min-w-0 text-sm font-bold leading-snug text-ink">{prospect.name}</p>
                      {#if prospect.fit_score}
                        <Badge tone={FIT_TONES[prospect.fit_score] || "neutral"} size="xs" class="shrink-0">
                          {prospect.fit_score}
                        </Badge>
                      {/if}
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-ink/50">
                      <span>{KIND_LABELS[prospect.kind] || prospect.kind}</span>
                      {#if prospect.priority && prospect.priority !== "P2"}
                        <Badge tone={prospect.priority === "P0" ? "red" : "amber"} size="xs">
                          {prospect.priority}
                        </Badge>
                      {/if}
                      {#if ownerLabel(prospect)}
                        <span class="inline-flex items-center gap-1">
                          <UserRound class="h-3 w-3" aria-hidden="true" />
                          {ownerLabel(prospect)}
                        </span>
                      {/if}
                      {#if cardAmount(prospect)}
                        <span class="tabular-nums text-ink/70">{cardAmount(prospect)}</span>
                      {/if}
                      {#if prospect.next_action_date}
                        <span class="inline-flex items-center gap-1 {isOverdue(prospect) ? 'font-bold text-red-600' : ''}">
                          <CalendarClock class="h-3 w-3" aria-hidden="true" />
                          {formatDate(prospect.next_action_date)}
                        </span>
                      {/if}
                    </div>
                    {#if prospect.next_action}
                      <p class="mt-2 line-clamp-2 text-xs leading-5 text-ink/60">
                        Next: {prospect.next_action}
                      </p>
                    {/if}
                  </div>
                </div>
              {:else}
                <p class="rounded-control border border-dashed border-ink/15 bg-white px-3 py-4 text-center text-xs text-ink/50">
                  Empty
                </p>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <div
      class="mt-3 rounded-card border border-ink/8 bg-canvas p-3 transition {dragOverStage === 'Declined' ? 'border-accent bg-accent-soft ring-2 ring-accent/20' : ''}"
      role="region"
      aria-label="Declined prospects"
      ondragover={(event) => handleStageDragOver(event, "Declined")}
      ondragleave={(event) => handleStageDragLeave(event, "Declined")}
      ondrop={(event) => handleStageDrop(event, "Declined")}
    >
      <div class="flex items-center justify-between gap-2">
        <h4 class="text-sm font-bold text-ink">Declined</h4>
        <Badge tone="neutral" size="xs" class="bg-white">{prospectsByStage.Declined?.length || 0}</Badge>
      </div>
      {#if prospectsByStage.Declined?.length}
        <div class="mt-2 flex flex-wrap gap-2">
          {#each prospectsByStage.Declined as prospect (prospect.id)}
            <button
              type="button"
              class="rounded-control border border-ink/8 bg-white px-3 py-1.5 text-left text-xs font-semibold text-ink/70 transition hover:border-accent/40 {draggedProspectId === prospect.id ? 'opacity-50' : ''}"
              draggable="true"
              ondragstart={(event) => handleDragStart(event, prospect)}
              ondragend={handleDragEnd}
              onclick={() => onSelect(prospect)}
            >
              {prospect.name}
            </button>
          {/each}
        </div>
      {:else}
        <p class="mt-1 text-xs text-ink/50">Drop a card here when a funder says no. It stays on file.</p>
      {/if}
    </div>
  {:else}
    <EmptyState
      title="No prospects yet"
      message="Add a prospect above, or wait for the researched funder list to be loaded."
    />
  {/if}
</Panel>

<GrantStageDialog
  open={Boolean(pendingMove)}
  mode={pendingMove?.mode || "commit"}
  prospect={pendingMove?.prospect || null}
  onConfirm={confirmPendingMove}
  onCancel={() => (pendingMove = null)}
/>

<style>
  .prospect-kanban-scroll {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scroll-padding-inline: 1rem;
    scroll-snap-type: x mandatory;
  }

  .prospect-kanban-track {
    grid-auto-columns: 100%;
    grid-auto-flow: column;
  }

  @media (min-width: 768px) {
    .prospect-kanban-scroll {
      scroll-padding-inline: 1.5rem;
    }

    .prospect-kanban-track {
      grid-auto-columns: calc((100% - 0.75rem) / 2);
    }
  }

  @media (min-width: 1280px) {
    .prospect-kanban-track {
      grid-auto-columns: calc((100% - 1.5rem) / 3);
    }
  }
</style>
