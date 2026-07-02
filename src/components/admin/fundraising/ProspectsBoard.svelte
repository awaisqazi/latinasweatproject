<script>
  // Prospect pipeline: 7-stage kanban with drag-and-drop plus filters. Stage
  // moves use the shared optimistic-lock pattern (eq updated_at) so two people
  // working the pipeline can't silently clobber each other.
  import { CalendarClock, Plus, Search, UserRound } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import {
    PROSPECT_COLUMNS,
    PROSPECT_KINDS,
    PROSPECT_STAGES,
  } from "../../../lib/dashboard/fundraising";

  export let supabase;
  export let prospects = [];
  export let teamMembers = [];
  export let onSelect = () => {};
  export let onProspectUpdated = () => {};

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
  $: prospectsByStage = PROSPECT_STAGES.reduce((groups, stage) => {
    groups[stage] = filteredProspects
      .filter((prospect) => prospect.stage === stage)
      .sort(byPriorityThenFit);
    return groups;
  }, {});
  $: hasFilters =
    Boolean(search.trim()) || fitFilter !== "all" || kindFilter !== "all" || ownerFilter !== "all";

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

    const { data, error } = await supabase
      .from("fundraising_prospects")
      .insert({ name, kind: newKind, source: "manual" })
      .select(PROSPECT_COLUMNS)
      .single();

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

  async function moveProspectToStage(prospect, stage) {
    if (!prospect?.id || prospect.stage === stage || movingIds.has(prospect.id)) return;

    movingIds = new Set(movingIds).add(prospect.id);
    errorMessage = "";
    const previous = prospect;
    onProspectUpdated({ ...prospect, stage });

    let query = supabase
      .from("fundraising_prospects")
      .update({ stage })
      .eq("id", prospect.id);
    if (prospect.updated_at) query = query.eq("updated_at", prospect.updated_at);

    const { data, error } = await query.select(PROSPECT_COLUMNS).maybeSingle();

    if (error) {
      errorMessage = error.message;
      onProspectUpdated(previous);
    } else if (!data) {
      onProspectUpdated(previous);
      errorMessage = `Someone else just updated "${prospect.name}", so the pipeline was refreshed with their change. Try again in a moment.`;
      const { data: fresh } = await supabase
        .from("fundraising_prospects")
        .select(PROSPECT_COLUMNS)
        .eq("id", prospect.id)
        .maybeSingle();
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
    moveProspectToStage(prospect, stage);
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

  function isOverdue(prospect) {
    if (!prospect.next_action_date) return false;
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return prospect.next_action_date < todayKey;
  }
</script>

<Panel title="Prospect pipeline" id="fundraising-prospects-panel">
  <p class="mb-4 text-sm leading-6 text-ink/60">
    Foundations, grants, and major donors, researched and ranked by fit. Click a
    card for the full profile and its tailored engagement plan; drag cards between
    stages as relationships progress.
  </p>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} class="mb-4" />
  {/if}

  <div class="mb-4 grid gap-3 rounded-card border border-ink/8 bg-canvas/70 p-3 sm:grid-cols-2 xl:grid-cols-5">
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

  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
      {filteredProspects.length} of {prospects.length} prospects
      {#if hasFilters}(filtered){/if}
    </p>
    <Button variant="primary" size="sm" icon={Plus} onclick={() => (showCreateForm = !showCreateForm)}>
      New prospect
    </Button>
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

  {#if prospects.length}
    <div class="prospect-kanban-scroll -mx-4 overflow-x-auto px-4 pb-3 md:-mx-6 md:px-6">
      <div class="prospect-kanban-track grid gap-3">
        {#each PROSPECT_STAGES as stage}
          <div
            class="snap-start flex min-h-[24rem] flex-col rounded-card border border-ink/8 bg-canvas p-3 transition {dragOverStage === stage ? 'border-accent bg-accent-soft ring-2 ring-accent/20' : ''}"
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

            <div class="flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
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
  {:else}
    <EmptyState
      title="No prospects yet"
      message="Add a prospect above, or wait for the researched funder list to be loaded."
    />
  {/if}
</Panel>

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
