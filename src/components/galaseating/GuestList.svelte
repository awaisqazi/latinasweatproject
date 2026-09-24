<!--
  The guest list. Always available: a side panel on desktop, a slide-over drawer
  from the left on phones.

  Alphabetical by last name out of the box, because that is how a planner looks
  somebody up. Sticky section headers, an A to Z rail on touch, and a search box
  that also understands "table 4" and "t4".

  Tapping a name selects the guest, opens their details and locates them on the
  floor. Rows are pointer-event drag sources: a long press on touch, a small move
  with a mouse, so the list still scrolls normally.
-->
<script>
  import { getContext } from "svelte";
  import { MEALS, TICKET_TYPES, GUEST_TAGS, guestList, ticketTypeById } from "../../lib/galaSeating/model.js";
  import { needsOutreach, needsTicketResolution } from "../../lib/galaSeating/ticketResolution.js";
  import GuestRow from "./GuestRow.svelte";
  import DragLayer from "./DragLayer.svelte";
  import ClaimGroupDialog from "./ClaimGroupDialog.svelte";
  import AddGuestDialog from "./AddGuestDialog.svelte";

  let { mode = "sidebar" } = $props();
  const { store, ui } = getContext("gala-seating");

  let showFilters = $state(false);
  let claimGroupId = $state(/** @type {string|null} */ (null));
  let addOpen = $state(false);
  let lateOpen = $state(false);
  let bodyEl = $state(null);
  let searchEl = $state(null);

  const plan = $derived(store.plan);
  const query = $derived(ui.listQuery);
  const filter = $derived(ui.listFilter);
  const sort = $derived(ui.listSort);
  const all = $derived(guestList(plan));
  const byGuestWarnings = $derived(store.warnings.byGuest || {});

  const SORTS = [
    { id: "last", label: "Last name A to Z" },
    { id: "first", label: "First name A to Z" },
    { id: "table", label: "By table" },
    { id: "party", label: "By party" },
    { id: "ticket", label: "By ticket type" },
  ];

  function lastName(name) {
    const parts = String(name || "").trim().split(/\s+/);
    return (parts.length > 1 ? parts[parts.length - 1] : parts[0] || "").toLowerCase();
  }

  function firstName(name) {
    return (String(name || "").trim().split(/\s+/)[0] || "").toLowerCase();
  }

  function letterOf(value) {
    const ch = String(value || "?")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .charAt(0)
      .toUpperCase();
    return /[A-Z]/.test(ch) ? ch : "#";
  }

  /** "table 4", "tbl 4" and "t4" all mean the same thing to a planner. */
  const tableQuery = $derived.by(() => {
    const m = query.trim().toLowerCase().match(/^(?:table|tbl|t)\s*([0-9]{1,3})$/);
    return m ? Number(m[1]) : null;
  });

  const searched = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    if (tableQuery != null) {
      const t = plan.tables.find((x) => x.number === tableQuery);
      if (t) return all.filter((g) => plan.seating[g.id]?.tableId === t.id);
    }
    return all.filter((g) => {
      const s = plan.seating[g.id];
      const t = s ? plan.tables.find((x) => x.id === s.tableId) : null;
      const hay = `${g.name} ${g.partyLabel} ${g.seatingNote} ${g.plannerNote} ${g.buyerName} ${
        t ? `table ${t.number} ${t.name}` : ""
      }`.toLowerCase();
      return hay.includes(q);
    });
  });

  function passes(g, key) {
    switch (key) {
      case "all":
        return true;
      case "unseated":
        return !plan.seating[g.id];
      case "seated":
        return Boolean(plan.seating[g.id]);
      case "notes":
        return Boolean(g.seatingNote || g.plannerNote);
      case "warnings":
        return (byGuestWarnings[g.id] || []).length > 0;
      case "nomeal":
        return g.hasDinner && !g.meal;
      case "latenight":
        return !g.hasDinner;
      case "placeholder":
        return Boolean(g.placeholder);
      case "unmatched":
        return Boolean(g.unmatched);
      case "reconcile":
        return Boolean(g.placeholder || g.unmatched);
      case "noticket":
        return needsTicketResolution(g);
      case "outreach":
        return needsOutreach(g);
      default:
        if (key.startsWith("meal:")) return g.meal === key.slice(5);
        if (key.startsWith("ticket:")) return g.ticketType === key.slice(7);
        if (key.startsWith("tag:")) return (g.tags || []).includes(key.slice(4));
        return true;
    }
  }

  const chips = $derived.by(() => {
    const base = [
      { key: "all", label: "All" },
      { key: "unseated", label: "Unseated" },
      { key: "seated", label: "Seated" },
      { key: "notes", label: "Has notes" },
      { key: "warnings", label: "Warnings" },
      { key: "nomeal", label: "No meal" },
      { key: "latenight", label: "Late night" },
      { key: "placeholder", label: "Unnamed seats" },
      { key: "unmatched", label: "No ticket match" },
      { key: "reconcile", label: "To reconcile" },
      { key: "noticket", label: "No ticket to resolve" },
      { key: "outreach", label: "Needs outreach" },
    ];
    const meals = MEALS.map((m) => ({ key: `meal:${m.id}`, label: m.short }));
    const tickets = TICKET_TYPES.filter((t) => all.some((g) => g.ticketType === t.id)).map((t) => ({
      key: `ticket:${t.id}`,
      label: t.short,
    }));
    const tags = GUEST_TAGS.filter((t) => t.id !== "outreach" && all.some((g) => (g.tags || []).includes(t.id))).map((t) => ({
      key: `tag:${t.id}`,
      label: t.label,
    }));
    return [...base, ...meals, ...tickets, ...tags].map((c) => ({
      ...c,
      count: searched.filter((g) => passes(g, c.key)).length,
    }));
  });

  const matching = $derived(filter === "all" ? searched : searched.filter((g) => passes(g, filter)));
  /**
   * Late Night Access tickets have no dinner seat, so they sit in their own
   * collapsed section at the bottom instead of looking like a backlog.
   */
  const lateNight = $derived(filter === "latenight" ? [] : matching.filter((g) => g.hasDinner === false));
  const visible = $derived(filter === "latenight" ? matching : matching.filter((g) => g.hasDinner !== false));

  /** Section headers and rows, flattened into one list the template walks once. */
  const rows = $derived.by(() => {
    const list = [...visible];
    const tableOf = (g) => {
      const s = plan.seating[g.id];
      return s ? plan.tables.find((t) => t.id === s.tableId) || null : null;
    };

    if (sort === "table") {
      list.sort((a, b) => {
        const ta = tableOf(a);
        const tb = tableOf(b);
        if (!ta && !tb) return lastName(a.name).localeCompare(lastName(b.name));
        if (!ta) return 1;
        if (!tb) return -1;
        return ta.number - tb.number || plan.seating[a.id].seat - plan.seating[b.id].seat;
      });
    } else if (sort === "party") {
      list.sort(
        (a, b) => a.partyLabel.localeCompare(b.partyLabel) || lastName(a.name).localeCompare(lastName(b.name)),
      );
    } else if (sort === "ticket") {
      const order = Object.fromEntries(TICKET_TYPES.map((t, i) => [t.id, i]));
      list.sort(
        (a, b) =>
          (order[a.ticketType] ?? 99) - (order[b.ticketType] ?? 99) ||
          lastName(a.name).localeCompare(lastName(b.name)),
      );
    } else if (sort === "first") {
      list.sort((a, b) => firstName(a.name).localeCompare(firstName(b.name)));
    } else {
      list.sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)));
    }

    const sectionOf = (g) => {
      if (sort === "table") {
        const t = tableOf(g);
        if (t) return t.name ? `Table ${t.number} · ${t.name}` : `Table ${t.number}`;
        return g.hasDinner === false ? "Late night · 9 PM · no dinner seat" : "Unseated";
      }
      if (sort === "party") return g.partyLabel;
      if (sort === "ticket") return ticketTypeById(g.ticketType).label;
      return letterOf(sort === "first" ? firstName(g.name) : lastName(g.name));
    };

    const out = [];
    let current = null;
    for (const g of list) {
      const section = sectionOf(g);
      if (section !== current) {
        current = section;
        out.push({ kind: "head", id: `h:${section}`, section, partyId: sort === "party" ? g.partyId : null });
      }
      out.push({ kind: "row", id: g.id, guest: g });
    }
    if (lateNight.length) {
      out.push({ kind: "late", id: "late-head", count: lateNight.length });
      if (lateOpen) {
        for (const g of [...lateNight].sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)))) {
          out.push({ kind: "row", id: g.id, guest: g });
        }
      }
    }
    return out;
  });

  function partyMeta(partyId) {
    const members = all.filter((g) => g.partyId === partyId);
    return {
      size: members.length,
      seated: members.filter((g) => plan.seating[g.id]).length,
      // A whole group of dinner responses typed under one organiser's name.
      unmatchedGroup: members.length > 0 && members.every((g) => g.unmatched),
    };
  }

  const letters = $derived.by(() => {
    if (sort !== "last" && sort !== "first") return [];
    const seen = [];
    for (const r of rows) if (r.kind === "head" && !seen.includes(r.section)) seen.push(r.section);
    return seen;
  });

  function jumpTo(section) {
    const el = bodyEl?.querySelector?.(`[data-section="${CSS.escape(section)}"]`);
    el?.scrollIntoView({ block: "start", behavior: ui.reducedMotion ? "auto" : "smooth" });
  }

  function onSearchKeydown(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const first = rows.find((r) => r.kind === "row");
    if (first) ui.pickGuest(first.guest.id);
  }

  function startPartyDrag(event, partyId) {
    const unseated = all.filter((g) => g.partyId === partyId && !plan.seating[g.id]);
    if (!unseated.length) return;
    const label = all.find((g) => g.partyId === partyId)?.partyLabel || "Party";
    ui.beginPointerDrag(event, { kind: "party", partyId, label, count: unseated.length });
  }

  function onRowKeynav(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const list = [...(bodyEl?.querySelectorAll?.("[data-guest-row]") || [])];
    const here = list.indexOf(event.currentTarget);
    const next = Math.min(list.length - 1, Math.max(0, here + (event.key === "ArrowDown" ? 1 : -1)));
    list[next]?.focus();
  }

  // "/" on desktop, and opening the drawer, both land the cursor in search.
  $effect(() => {
    if (ui.focusSearchTick > 0) searchEl?.focus();
  });
</script>

<div class="gl" class:gl--drawer={mode === "drawer"} data-guest-list="true">
  <div class="gl-head">
    <div class="gl-searchrow">
      <input
        class="gl-search"
        type="search"
        bind:this={searchEl}
        placeholder="Search name, party, note, table 4"
        value={query}
        oninput={(e) => (ui.listQuery = e.currentTarget.value)}
        onkeydown={onSearchKeydown}
        aria-label="Search guests"
      />
      {#if mode === "drawer"}
        <button type="button" class="gs-btn" onclick={() => (ui.listOpen = false)} aria-label="Close the guest list">
          Close
        </button>
      {/if}
    </div>

    <div class="gl-toprow">
      <button type="button" class="gs-btn gs-btn--gold gl-add" onclick={() => (addOpen = true)}>
        <svg class="gs-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke-linecap="round" />
        </svg>
        Add guest
      </button>
      <label class="gl-sort">
        <span class="gl-sortlbl">Sort</span>
        <select value={sort} onchange={(e) => (ui.listSort = e.currentTarget.value)} aria-label="Sort the guest list">
          {#each SORTS as s (s.id)}
            <option value={s.id}>{s.label}</option>
          {/each}
        </select>
      </label>
      <button
        type="button"
        class="gs-btn"
        class:gs-btn--on={showFilters || filter !== "all"}
        onclick={() => (showFilters = !showFilters)}
        aria-expanded={showFilters}
      >
        Filter
      </button>
    </div>

    {#if showFilters}
      <div class="gl-chips">
        {#each chips as chip (chip.key)}
          <button
            type="button"
            class="gl-chip"
            class:gl-chip--on={filter === chip.key}
            onclick={() => (ui.listFilter = chip.key)}
            disabled={chip.count === 0 && filter !== chip.key}
          >
            {chip.label}<span class="gl-chipn">{chip.count}</span>
          </button>
        {/each}
      </div>
    {/if}

    <p class="gl-summary">
      {visible.length} of {all.length} guests
      {#if filter !== "all"}
        <button type="button" class="gs-linkbtn" onclick={() => (ui.listFilter = "all")}>clear filter</button>
      {/if}
    </p>
  </div>

  <div class="gl-bodywrap">
    <div class="gl-body gs-scroll" bind:this={bodyEl}>
      {#if !rows.length}
        <p class="gl-none">No guests match that.</p>
      {/if}
      {#each rows as row (row.id)}
        {#if row.kind === "head"}
          {@const meta = row.partyId ? partyMeta(row.partyId) : null}
          <div
            class="gl-sec"
            class:gl-sec--party={Boolean(row.partyId)}
            data-section={row.section}
            role={row.partyId ? "button" : undefined}
            tabindex={row.partyId ? 0 : undefined}
            onpointerdown={row.partyId ? (e) => startPartyDrag(e, row.partyId) : undefined}
            title={row.partyId ? "Drag the party onto a table to seat everyone" : undefined}
          >
            <span class="gl-secname">{row.section}</span>
            {#if meta}
              <span class="gl-secmeta">{meta.seated} of {meta.size} seated</span>
            {/if}
          </div>
          {#if meta?.unmatchedGroup}
            <button type="button" class="gl-assign" onclick={() => (claimGroupId = row.partyId)}>
              Assign this group to a buyer's seats
            </button>
          {/if}
        {:else if row.kind === "late"}
          <button
            type="button"
            class="gl-late"
            aria-expanded={lateOpen}
            onclick={() => (lateOpen = !lateOpen)}
          >
            <span>Late night · arrives 9 PM · no dinner seat ({row.count})</span>
            <span class="gl-latechev">{lateOpen ? "Hide" : "Show"}</span>
          </button>
        {:else}
          <GuestRow guest={row.guest} onkeynav={onRowKeynav} />
        {/if}
      {/each}
    </div>

    {#if letters.length > 1 && ui.isTouch}
      <nav class="gl-rail" aria-label="Jump to a letter">
        {#each letters as letter (letter)}
          <button type="button" onclick={() => jumpTo(letter)}>{letter}</button>
        {/each}
      </nav>
    {/if}
  </div>
</div>

<DragLayer />

{#if claimGroupId}
  <ClaimGroupDialog partyId={claimGroupId} onclose={() => (claimGroupId = null)} />
{/if}
{#if addOpen}
  <AddGuestDialog onclose={() => (addOpen = false)} />
{/if}

<style>
  .gl {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    background: rgba(8, 14, 24, 0.92);
  }
  .gl--drawer {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: min(88vw, 390px);
    z-index: 60;
    border-right: 1px solid var(--gs-line-strong);
    box-shadow: 30px 0 70px -40px rgba(0, 0, 0, 0.95);
    background: rgba(9, 15, 26, 0.98);
  }

  .gl-head {
    flex: 0 0 auto;
    padding: 10px 12px 8px;
    border-bottom: 1px solid rgba(228, 201, 138, 0.14);
  }
  .gl-searchrow {
    display: flex;
    gap: 6px;
  }
  .gl-search {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 40px;
    padding: 8px 10px;
    border-radius: 3px;
    border: 1px solid rgba(228, 201, 138, 0.28);
    background: rgba(255, 255, 255, 0.05);
    color: var(--gs-text);
    font: inherit;
    font-size: 13px;
  }
  .gl-search::placeholder {
    color: #7e8b9b;
  }
  .gl-toprow {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 7px;
  }
  .gl-add {
    flex: 0 0 auto;
  }
  .gl-sort {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: var(--gs-dim);
  }
  .gl-sortlbl {
    flex: 0 0 auto;
  }
  .gl-sort select {
    flex: 1 1 auto;
    min-width: 0;
    background: rgba(255, 255, 255, 0.05);
    color: var(--gs-text);
    border: 1px solid rgba(228, 201, 138, 0.26);
    border-radius: 2px;
    padding: 6px;
    font: inherit;
    font-size: 12px;
  }
  .gl-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 8px;
  }
  .gl-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 8px;
    min-height: 32px;
    border-radius: 2px;
    border: 1px solid rgba(228, 201, 138, 0.26);
    background: rgba(255, 255, 255, 0.03);
    color: var(--gs-dim);
    font: inherit;
    font-size: 11.5px;
    cursor: pointer;
  }
  .gl-chip--on {
    border-color: var(--gs-gold-bright);
    background: rgba(255, 189, 89, 0.16);
    color: var(--gs-cream);
  }
  .gl-chip:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .gl-chipn {
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }
  .gl-summary {
    margin: 8px 0 0;
    font-size: 11.5px;
    color: #8f9bab;
    display: flex;
    gap: 8px;
    align-items: baseline;
  }

  .gl-bodywrap {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
  }
  .gl-body {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0 6px 20px;
    touch-action: pan-y;
  }
  .gl-none {
    padding: 22px 12px;
    text-align: center;
    color: #8f9bab;
  }
  .gl-sec {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 8px 4px;
    background: rgba(8, 14, 24, 0.97);
    border-bottom: 1px solid rgba(228, 201, 138, 0.16);
  }
  .gl-sec--party {
    cursor: grab;
    touch-action: pan-y;
  }
  .gl-secname {
    font-family: "Playfair Display", Georgia, serif;
    font-style: italic;
    font-size: 13.5px;
    color: var(--gs-gold-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gl-secmeta {
    flex: 0 0 auto;
    font-size: 10.5px;
    color: #8f9bab;
  }
  .gl-assign {
    display: block;
    width: calc(100% - 8px);
    margin: 4px 4px 2px;
    padding: 8px 9px;
    border: 1px dashed rgba(255, 189, 89, 0.55);
    border-radius: 2px;
    background: rgba(255, 189, 89, 0.1);
    color: var(--gs-gold-soft);
    font: inherit;
    font-size: 11.5px;
    text-align: left;
    cursor: pointer;
  }
  .gl-assign:hover {
    background: rgba(255, 189, 89, 0.2);
    color: var(--gs-cream);
  }

  .gl-late {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: calc(100% - 8px);
    margin: 12px 4px 4px;
    padding: 9px 10px;
    border: 1px solid rgba(151, 163, 178, 0.32);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.025);
    color: #9fabba;
    font: inherit;
    font-size: 11.5px;
    text-align: left;
    cursor: pointer;
  }
  .gl-late:hover {
    border-color: rgba(228, 201, 138, 0.4);
    color: var(--gs-cream);
  }
  .gl-latechev {
    flex: 0 0 auto;
    color: var(--gs-gold-soft);
  }

  .gl-rail {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    padding: 4px 2px;
    background: rgba(255, 255, 255, 0.02);
  }
  .gl-rail button {
    width: 24px;
    min-height: 0;
    padding: 1px 0;
    background: none;
    border: none;
    color: var(--gs-gold-soft);
    font: inherit;
    font-size: 10px;
    cursor: pointer;
  }
  .gl-rail button:active {
    color: var(--gs-cream);
  }
</style>
