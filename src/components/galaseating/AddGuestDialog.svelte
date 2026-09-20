<!--
  Add a guest by hand: comps, staff, honorees, and the walk-ins who turn up on
  the night. "Add several" takes one name per line into a single party.

  Everything goes out as guest_put (plus seat) ops in one batch, so it behaves
  the same in the shared plan and offline.
-->
<script>
  import { getContext } from "svelte";
  import { GUEST_TAGS, MEALS, TICKET_TYPES, ticketTypeById } from "../../lib/galaSeating/model.js";

  let { onclose = () => {} } = $props();
  const { store, ui } = getContext("gala-seating");

  const plan = $derived(store.plan);

  let bulk = $state(false);
  let name = $state("");
  let names = $state("");
  let ticketType = $state("comp");
  let meal = $state("");
  let phone = $state("");
  let email = $state("");
  let plannerNote = $state("");
  let tags = $state(/** @type {string[]} */ ([]));
  let partyMode = $state("new");
  let partyQuery = $state("");
  let partyId = $state(/** @type {string|null} */ (null));
  let seatTableId = $state("");
  let error = $state("");

  const ticket = $derived(ticketTypeById(ticketType));

  const parties = $derived.by(() => {
    const q = partyQuery.trim().toLowerCase();
    const map = new Map();
    for (const g of Object.values(plan.guests)) {
      if (!map.has(g.partyId)) map.set(g.partyId, { partyId: g.partyId, label: g.partyLabel, count: 0 });
      map.get(g.partyId).count += 1;
    }
    return [...map.values()]
      .filter((p) => !q || p.label.toLowerCase().includes(q))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 10);
  });

  const chosenParty = $derived(partyId ? parties.find((p) => p.partyId === partyId) || null : null);

  const tablesWithRoom = $derived(
    plan.tables
      .map((t) => ({
        ...t,
        free: t.seats - Object.values(plan.seating).filter((s) => s.tableId === t.id).length,
      }))
      .filter((t) => t.free > 0)
      .sort((a, b) => a.number - b.number),
  );

  function toggleTag(id) {
    tags = tags.includes(id) ? tags.filter((t) => t !== id) : [...tags, id];
  }

  function submit(event) {
    event?.preventDefault?.();
    const list = bulk
      ? names.split(/\r?\n/).map((n) => n.trim()).filter(Boolean)
      : [String(name ?? "").trim()].filter(Boolean);
    if (!list.length) {
      error = bulk ? "Add at least one name, one per line." : "A name is needed.";
      return;
    }
    try {
      const ids = store.addGuests(list, {
        partyId: partyMode === "existing" && chosenParty ? chosenParty.partyId : null,
        partyLabel: partyMode === "existing" && chosenParty ? chosenParty.label : list[0],
        ticketType,
        meal: meal || null,
        phone,
        email,
        plannerNote,
        tags,
        seatAtTableId: seatTableId || null,
      });
      onclose();
      if (ids.length === 1) ui.pickGuest(ids[0]);
    } catch (err) {
      console.error("[gala seating] add guest failed", err);
      error = "That did not go through. Nothing was added.";
    }
  }
</script>

<div class="ag-scrim" role="presentation" onpointerdown={onclose}></div>
<form class="ag gs-sheet" onsubmit={submit} aria-label="Add a guest">
  <div class="ag-head">
    <h2 class="gs-serif">{bulk ? "Add several guests" : "Add a guest"}</h2>
    <button type="button" class="gs-linkbtn" onclick={() => (bulk = !bulk)}>
      {bulk ? "Add one instead" : "Add several"}
    </button>
  </div>

  <div class="ag-body gs-scroll">
    {#if bulk}
      <label class="ag-field">
        <span>Names, one per line</span>
        <textarea
          class="gs-input"
          rows="6"
          placeholder={"Rosa Delgado\nHilario Delgado\nNorma Castañeda"}
          value={names}
          oninput={(e) => (names = e.currentTarget.value)}
        ></textarea>
      </label>
    {:else}
      <label class="ag-field">
        <span>Name</span>
        <input class="gs-input" value={name} oninput={(e) => (name = e.currentTarget.value)} required />
      </label>
    {/if}

    <fieldset class="ag-field ag-fieldset">
      <legend>Party</legend>
      <div class="ag-radios">
        <label><input type="radio" checked={partyMode === "new"} onchange={() => (partyMode = "new")} /> New party</label>
        <label>
          <input type="radio" checked={partyMode === "existing"} onchange={() => (partyMode = "existing")} />
          Join an existing party
        </label>
      </div>
      {#if partyMode === "existing"}
        <input
          class="gs-input"
          placeholder="Search a party"
          value={partyQuery}
          oninput={(e) => (partyQuery = e.currentTarget.value)}
        />
        <div class="ag-parties">
          {#each parties as p (p.partyId)}
            <button
              type="button"
              class="ag-party"
              class:ag-party--on={partyId === p.partyId}
              onclick={() => (partyId = p.partyId)}
            >
              <span>{p.label}</span><small>{p.count}</small>
            </button>
          {/each}
        </div>
      {/if}
    </fieldset>

    <label class="ag-field">
      <span>Ticket type</span>
      <select class="gs-input" value={ticketType} onchange={(e) => (ticketType = e.currentTarget.value)}>
        {#each TICKET_TYPES as t (t.id)}
          <option value={t.id}>{t.label}</option>
        {/each}
      </select>
      <small class="ag-hint">{ticket.hasDinner ? "Includes a dinner seat." : "Late night only, no dinner seat."}</small>
    </label>

    {#if ticket.hasDinner}
      <label class="ag-field">
        <span>Entrée</span>
        <select class="gs-input" value={meal} onchange={(e) => (meal = e.currentTarget.value)}>
          <option value="">Not chosen yet</option>
          {#each MEALS as m (m.id)}
            <option value={m.id}>{m.label}</option>
          {/each}
        </select>
      </label>
    {/if}

    <div class="ag-two">
      <label class="ag-field">
        <span>Phone, optional</span>
        <input class="gs-input" value={phone} oninput={(e) => (phone = e.currentTarget.value)} />
      </label>
      <label class="ag-field">
        <span>Email, optional</span>
        <input class="gs-input" type="email" value={email} oninput={(e) => (email = e.currentTarget.value)} />
      </label>
    </div>

    <div class="ag-field">
      <span>Tags</span>
      <div class="ag-tags">
        {#each GUEST_TAGS as tag (tag.id)}
          <button
            type="button"
            class="ag-tag"
            class:ag-tag--on={tags.includes(tag.id)}
            aria-pressed={tags.includes(tag.id)}
            onclick={() => toggleTag(tag.id)}
          >
            {tag.label}
          </button>
        {/each}
      </div>
    </div>

    <label class="ag-field">
      <span>Planner note</span>
      <textarea
        class="gs-input"
        rows="2"
        value={plannerNote}
        oninput={(e) => (plannerNote = e.currentTarget.value)}
      ></textarea>
    </label>

    <label class="ag-field">
      <span>Seat now at, optional</span>
      <select class="gs-input" value={seatTableId} onchange={(e) => (seatTableId = e.currentTarget.value)}>
        <option value="">Leave unseated</option>
        {#each tablesWithRoom as t (t.id)}
          <option value={t.id}>Table {t.number}{t.name ? ` · ${t.name}` : ""} · {t.free} free</option>
        {/each}
      </select>
    </label>

    {#if error}<p class="ag-error">{error}</p>{/if}
  </div>

  <div class="ag-actions">
    <button type="submit" class="gs-btn gs-btn--gold">{bulk ? "Add them" : "Add guest"}</button>
    <button type="button" class="gs-btn" onclick={onclose}>Cancel</button>
  </div>
</form>

<style>
  .ag-scrim {
    position: fixed;
    inset: 0;
    background: rgba(4, 8, 14, 0.62);
    z-index: 70;
  }
  .ag {
    position: fixed;
    z-index: 71;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(540px, calc(100vw - 24px));
    max-height: min(88dvh, 780px);
    display: flex;
    flex-direction: column;
    background: var(--gs-cream);
    color: var(--gs-ink);
    border-top: 3px solid var(--gs-gold);
    box-shadow: 0 40px 90px -40px rgba(0, 0, 0, 0.95);
  }
  .ag-head {
    flex: 0 0 auto;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 16px 18px 10px;
    border-bottom: 1px solid rgba(23, 32, 44, 0.14);
  }
  .ag-head h2 {
    margin: 0;
    font-size: 21px;
  }
  .ag-body {
    flex: 1 1 auto;
    min-height: 0;
    padding: 14px 18px;
  }
  .ag-field {
    display: block;
    margin-bottom: 12px;
  }
  .ag-field > span,
  .ag-fieldset legend {
    display: block;
    font-size: 11.5px;
    color: #5f6875;
    margin-bottom: 4px;
    padding: 0;
  }
  .ag-fieldset {
    border: 1px solid rgba(23, 32, 44, 0.16);
    padding: 10px;
    margin-inline: 0;
  }
  .ag-radios {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 12.5px;
    margin-bottom: 8px;
  }
  .ag-radios label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .ag-parties {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 6px;
    max-height: 180px;
    overflow-y: auto;
  }
  .ag-party {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 9px;
    min-height: 38px;
    border: 1px solid rgba(23, 32, 44, 0.16);
    border-radius: 2px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
    text-align: left;
  }
  .ag-party--on {
    border-color: var(--gs-gold);
    background: rgba(255, 189, 89, 0.34);
    font-weight: 700;
  }
  .ag-party small {
    color: #78818f;
  }
  .ag-two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .ag-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .ag-tag {
    padding: 6px 9px;
    min-height: 34px;
    border: 1px solid rgba(23, 32, 44, 0.24);
    border-radius: 2px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .ag-tag--on {
    background: rgba(255, 189, 89, 0.36);
    border-color: var(--gs-gold);
    font-weight: 700;
  }
  .ag-hint {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    color: #78818f;
  }
  .ag-error {
    margin: 0 0 8px;
    font-size: 12.5px;
    color: #8c2f22;
  }
  .ag-actions {
    flex: 0 0 auto;
    display: flex;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid rgba(23, 32, 44, 0.14);
    background: #fbf3e6;
  }
  @media (max-width: 600px) {
    .ag-two {
      grid-template-columns: 1fr;
    }
  }

  /* The phone shell is sized to the visible viewport and this dialog lives
     inside it, so it anchors to the shell rather than to the layout viewport
     that Safari keeps changing under it. */
  @media (max-width: 1023px), (pointer: coarse) and (max-height: 599px) {
    .ag-scrim,
    .ag {
      position: absolute;
    }
    .ag {
      left: 0;
      right: 0;
      bottom: 0;
      top: auto;
      transform: none;
      width: auto;
      max-height: 92%;
      border-radius: 6px 6px 0 0;
      padding-bottom: calc(14px + env(safe-area-inset-bottom));
    }
  }
</style>
