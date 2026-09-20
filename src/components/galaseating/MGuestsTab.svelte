<!--
  The Guests tab: the whole screen, one list, one job.

  The header is pinned and holds the four controls a planner reaches for while
  looking somebody up: search, the Unseated / Seated / All segment, sort and
  filters. Sort and filters open as sheets, so the header never grows a second
  row and the list never loses its place.

  The search field is NOT focused when the tab opens. A keyboard that jumps up
  unasked hides half the list and, on iOS, used to zoom the page. It focuses
  only when the planner taps it, or when they arrive from the top bar's search
  icon.
-->
<script>
  import { getContext, onMount } from "svelte";
  import { guestList } from "../../lib/galaSeating/model.js";
  import { buildRows, searchGuests, passesFilter, letterOf, lastName, firstName, SORTS } from "./guestListLogic.js";
  import MGuestRow from "./MGuestRow.svelte";

  let { nav } = $props();
  const { store, ui } = getContext("gala-seating");

  let searchEl = $state(null);
  let bodyEl = $state(null);
  let lateOpen = $state(false);
  let seenTick = 0;

  const plan = $derived(store.plan);
  const all = $derived(guestList(plan));
  const byGuestWarnings = $derived(store.warnings.byGuest || {});
  const query = $derived(ui.listQuery);
  const sort = $derived(ui.listSort);
  const segment = $derived(ui.listSegment);
  const chips = $derived(ui.listChips);

  const searched = $derived(searchGuests(plan, query));

  const segmentCounts = $derived.by(() => ({
    all: searched.length,
    unseated: searched.filter((g) => passesFilter(plan, byGuestWarnings, g, "unseated")).length,
    seated: searched.filter((g) => passesFilter(plan, byGuestWarnings, g, "seated")).length,
  }));

  const matching = $derived.by(() => {
    let list = searched;
    if (segment !== "all") list = list.filter((g) => passesFilter(plan, byGuestWarnings, g, segment));
    for (const key of chips) list = list.filter((g) => passesFilter(plan, byGuestWarnings, g, key));
    return list;
  });

  /** Late Night Access has no dinner seat, so it is a footnote, not a backlog. */
  const lateNight = $derived(
    chips.includes("latenight") ? [] : matching.filter((g) => g.hasDinner === false),
  );
  const visible = $derived(
    chips.includes("latenight") ? matching : matching.filter((g) => g.hasDinner !== false),
  );

  const rows = $derived(buildRows(plan, visible, sort, { lateNight, lateOpen }));

  const letters = $derived.by(() => {
    if (sort !== "last" && sort !== "first") {
      const seen = [];
      for (const r of rows) if (r.kind === "head" && !seen.includes(r.section)) seen.push(r.section);
      return seen.length > 1 && seen.length <= 26 ? seen.map((s) => ({ key: s, label: shortRail(s) })) : [];
    }
    const seen = [];
    for (const r of rows) if (r.kind === "head" && !seen.includes(r.section)) seen.push(r.section);
    return seen.length > 1 ? seen.map((s) => ({ key: s, label: s })) : [];
  });

  function shortRail(section) {
    const m = section.match(/^Table\s+(\d+)/);
    if (m) return m[1];
    return letterOf(section);
  }

  /** The short form: a button in a three-control row has no space for "A to Z". */
  const SHORT_SORT = {
    last: "Last name",
    first: "First name",
    table: "By table",
    party: "By party",
    ticket: "By ticket",
  };
  const sortLabel = $derived(SHORT_SORT[sort] || "Sort");

  // The top bar's search icon bumps this tick. Nothing else focuses the field.
  onMount(() => {
    seenTick = ui.focusSearchTick;
  });

  $effect(() => {
    const tick = ui.focusSearchTick;
    if (tick === seenTick) return;
    seenTick = tick;
    searchEl?.focus();
  });

  function jumpTo(section) {
    const el = bodyEl?.querySelector?.(`[data-section="${CSS.escape(section)}"]`);
    el?.scrollIntoView({ block: "start", behavior: ui.reducedMotion ? "auto" : "smooth" });
  }

  function clearSearch() {
    ui.listQuery = "";
    searchEl?.focus();
  }

  function cancelSearch() {
    ui.listQuery = "";
    searchEl?.blur();
  }

  function onSearchKeydown(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    searchEl?.blur();
  }
</script>

<div class="mgl">
  <div class="mgl-head">
    <div class="mgl-searchrow">
      <div class="mgl-searchwrap">
        <svg class="mgl-searchic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="6.4" />
          <path d="m16 16 4.2 4.2" stroke-linecap="round" />
        </svg>
        <input
          class="mgl-search"
          type="text"
          inputmode="search"
          enterkeyhint="search"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="none"
          spellcheck="false"
          bind:this={searchEl}
          placeholder="Search name, party, table 4"
          value={query}
          oninput={(e) => (ui.listQuery = e.currentTarget.value)}
          onkeydown={onSearchKeydown}
          aria-label="Search guests"
        />
        {#if query}
          <button type="button" class="mgl-clear" onclick={clearSearch} aria-label="Clear the search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="rgba(255,255,255,0.14)" stroke="none" />
              <path d="M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8" stroke-linecap="round" />
            </svg>
          </button>
        {/if}
      </div>
      {#if query}
        <button type="button" class="mgl-cancel" onclick={cancelSearch}>Cancel</button>
      {/if}
    </div>

    <div class="mgl-seg" role="group" aria-label="Which guests to show">
      {#each [{ id: "unseated", label: "Unseated" }, { id: "seated", label: "Seated" }, { id: "all", label: "All" }] as item (item.id)}
        <button
          type="button"
          class="mgl-segbtn"
          class:mgl-segbtn--on={segment === item.id}
          aria-pressed={segment === item.id}
          onclick={() => (ui.listSegment = item.id)}
        >
          {item.label}<span class="mgl-segn">{segmentCounts[item.id]}</span>
        </button>
      {/each}
    </div>

    <div class="mgl-tools">
      <button type="button" class="gs-btn mgl-tool" onclick={() => nav.openLayer({ type: "sort" })}>
        <svg class="gs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M4 7h16M7 12h10M10 17h4" stroke-linecap="round" />
        </svg>
        <span class="mgl-toollbl">{sortLabel}</span>
      </button>
      <button
        type="button"
        class="gs-btn mgl-tool"
        class:gs-btn--on={chips.length > 0}
        onclick={() => nav.openLayer({ type: "filters" })}
      >
        <svg class="gs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M4 6h16l-6 7v5l-4 2v-7z" stroke-linejoin="round" />
        </svg>
        Filters{#if chips.length}<span class="mgl-fn">{chips.length}</span>{/if}
      </button>
      {#if chips.length}
        <button type="button" class="mgl-clearpill" onclick={() => (ui.listChips = [])}>Clear</button>
      {/if}
      <button type="button" class="gs-btn gs-btn--gold mgl-add" onclick={() => nav.openLayer({ type: "addGuest" })}>
        <svg class="gs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke-linecap="round" />
        </svg>
        Add guest
      </button>
    </div>
  </div>

  <div class="mgl-bodywrap">
    <div class="mgl-body gs-scroll" bind:this={bodyEl}>
      {#if !rows.length}
        <p class="mgl-none">No guests match that.</p>
      {/if}
      {#each rows as row (row.id)}
        {#if row.kind === "head"}
          <div class="mgl-sec" data-section={row.section}>{row.section}</div>
        {:else if row.kind === "late"}
          <button type="button" class="mgl-late" aria-expanded={lateOpen} onclick={() => (lateOpen = !lateOpen)}>
            <span>Late night · arrives 9 PM · no dinner seat ({row.count})</span>
            <span class="mgl-latechev">{lateOpen ? "Hide" : "Show"}</span>
          </button>
        {:else}
          <MGuestRow guest={row.guest} onpick={(id) => ui.pickGuest(id)} />
        {/if}
      {/each}
      <div class="mgl-tailpad" aria-hidden="true"></div>
    </div>

    {#if letters.length > 1}
      <nav class="mgl-rail" aria-label="Jump to a section">
        {#each letters as letter (letter.key)}
          <button type="button" onclick={() => jumpTo(letter.key)} aria-label={`Jump to ${letter.key}`}>
            {letter.label}
          </button>
        {/each}
      </nav>
    {/if}
  </div>
</div>

<style>
  .mgl {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #0a111d;
  }
  .mgl-head {
    flex: 0 0 auto;
    padding: 9px 10px 8px;
    border-bottom: 1px solid rgba(228, 201, 138, 0.16);
    background: rgba(9, 15, 26, 0.98);
  }
  .mgl-searchrow {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mgl-searchwrap {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
  }
  .mgl-searchic {
    position: absolute;
    left: 10px;
    width: 18px;
    height: 18px;
    color: #7e8b9b;
    pointer-events: none;
  }
  .mgl-search {
    width: 100%;
    min-height: 46px;
    padding: 10px 40px 10px 34px;
    border-radius: 3px;
    border: 1px solid rgba(228, 201, 138, 0.3);
    background: rgba(255, 255, 255, 0.06);
    color: var(--gs-text);
    font: inherit;
    /* 16px or larger, always: below that iOS Safari zooms the page on focus
       and the controls that close this screen leave the viewport. */
    font-size: 16px;
  }
  .mgl-search::placeholder {
    color: #7e8b9b;
  }
  .mgl-clear {
    position: absolute;
    right: 2px;
    width: 40px;
    height: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #9aa7b6;
    cursor: pointer;
  }
  .mgl-clear svg {
    width: 20px;
    height: 20px;
  }
  .mgl-cancel {
    flex: 0 0 auto;
    min-height: 46px;
    padding: 0 10px;
    background: none;
    border: none;
    color: var(--gs-gold-bright);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }

  .mgl-seg {
    display: flex;
    margin-top: 8px;
    border: 1px solid rgba(228, 201, 138, 0.28);
    border-radius: 3px;
    overflow: hidden;
  }
  .mgl-segbtn {
    flex: 1 1 0;
    min-width: 0;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 6px;
    background: rgba(255, 255, 255, 0.02);
    border: none;
    border-right: 1px solid rgba(228, 201, 138, 0.18);
    color: var(--gs-dim);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .mgl-segbtn:last-child {
    border-right: none;
  }
  .mgl-segbtn--on {
    background: rgba(255, 189, 89, 0.18);
    color: var(--gs-cream);
    font-weight: 700;
  }
  .mgl-segn {
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
  }

  .mgl-tools {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
  }
  .mgl-tool {
    flex: 0 1 auto;
    min-width: 0;
  }
  .mgl-toollbl {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 13ch;
  }
  .mgl-fn {
    margin-left: 5px;
    min-width: 18px;
    height: 18px;
    line-height: 18px;
    border-radius: 9px;
    background: var(--gs-gold-bright);
    color: #17202c;
    font-size: 11px;
    font-weight: 700;
    text-align: center;
  }
  .mgl-clearpill {
    min-height: 44px;
    padding: 0 12px;
    border-radius: 3px;
    border: 1px solid rgba(228, 201, 138, 0.35);
    background: none;
    color: var(--gs-gold-soft);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .mgl-add {
    margin-left: auto;
  }

  .mgl-bodywrap {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
  }
  .mgl-body {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
  }
  .mgl-tailpad {
    height: 24px;
  }
  .mgl-none {
    padding: 28px 14px;
    text-align: center;
    color: #8f9bab;
    font-size: 14px;
  }
  .mgl-sec {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 7px 10px 5px;
    background: rgba(8, 14, 24, 0.98);
    border-bottom: 1px solid rgba(228, 201, 138, 0.18);
    font-family: "Playfair Display", Georgia, serif;
    font-style: italic;
    font-size: 14px;
    color: var(--gs-gold-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mgl-late {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: calc(100% - 16px);
    margin: 14px 8px 6px;
    padding: 12px 10px;
    min-height: 48px;
    border: 1px solid rgba(151, 163, 178, 0.34);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.025);
    color: #9fabba;
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .mgl-latechev {
    flex: 0 0 auto;
    color: var(--gs-gold-soft);
  }

  .mgl-rail {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    padding: 4px 1px;
    background: rgba(255, 255, 255, 0.03);
  }
  .mgl-rail button {
    width: 28px;
    min-height: 0;
    padding: 1px 0;
    background: none;
    border: none;
    color: var(--gs-gold-soft);
    font: inherit;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .mgl-rail button:active {
    color: var(--gs-cream);
    background: rgba(255, 189, 89, 0.2);
  }
</style>
