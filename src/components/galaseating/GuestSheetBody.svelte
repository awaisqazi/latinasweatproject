<!--
  Everything known about one guest: what they bought, what they asked for, what
  the planner has decided, and what is currently wrong with their seat.

  The record itself, with no container of its own. The desktop renders it in the
  right-hand drawer; the phone renders it full screen behind the guest card's
  "Details" button. Both surfaces carry the `gs-sheet` class, so the controls in
  here keep their ink-on-cream dressing either way.
-->
<script>
  import { getContext } from "svelte";
  import {
    GUEST_TAGS,
    MEALS,
    TICKET_RESOLUTIONS,
    TICKET_TYPES,
    ticketTypeById,
    tableLabel,
  } from "../../lib/galaSeating/model.js";
  import {
    RESOLUTION_STATUS,
    resolutionAttribution,
    showsTicketResolution,
    ticketResolutionOf,
  } from "../../lib/galaSeating/ticketResolution.js";

  let { guestId = "" } = $props();
  const { store, ui } = getContext("gala-seating");

  const plan = $derived(store.plan);
  const guest = $derived(guestId ? plan.guests[guestId] || null : null);
  const seat = $derived(guest ? plan.seating[guest.id] || null : null);
  const table = $derived(seat ? plan.tables.find((t) => t.id === seat.tableId) || null : null);
  const ticket = $derived(guest ? ticketTypeById(guest.ticketType) : null);
  const warnings = $derived(guest ? store.warnings.byGuest?.[guest.id] || [] : []);
  const party = $derived(guest ? Object.values(plan.guests).filter((g) => g.partyId === guest.partyId) : []);
  const constraints = $derived(guest ? plan.constraints.filter((c) => c.guestIds.includes(guest.id)) : []);

  let confirmRemove = $state(false);
  let seatPickerOpen = $state(false);
  let constraintMode = $state(/** @type {"together"|"apart"|null} */ (null));
  let constraintQuery = $state("");
  let claimOpen = $state(false);
  let claimQuery = $state("");
  let nameOpen = $state(false);
  let nameDraft = $state("");
  let resChoice = $state(/** @type {string|null} */ (null));
  let resNote = $state("");
  let resEditing = $state(false);

  // Reset the transient bits when the sheet moves to another guest.
  $effect(() => {
    void guestId;
    confirmRemove = false;
    seatPickerOpen = false;
    constraintMode = null;
    constraintQuery = "";
    claimOpen = false;
    claimQuery = "";
    nameOpen = false;
    nameDraft = "";
    resChoice = null;
    resNote = "";
    resEditing = false;
  });

  /** "No ticket on record": the decision recorded so far, if any, and who made it. */
  const showResolution = $derived(showsTicketResolution(guest));
  const resolution = $derived(guest ? ticketResolutionOf(guest) : null);
  const resolutionBy = $derived(resolution ? resolutionAttribution(guest, resolution) : "");

  function confirmResolution() {
    if (!guest || !resChoice) return;
    store.resolveNoTicket(guest.id, resChoice, resNote);
    resChoice = null;
    resNote = "";
    resEditing = false;
  }

  /** Normalised name, for the "did they mean this buyer?" suggestion. */
  function normal(v) {
    return String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z ]/g, "")
      .trim();
  }

  function nameOverlap(a, b) {
    const A = new Set(normal(a).split(/\s+/).filter((w) => w.length > 2));
    const B = new Set(normal(b).split(/\s+/).filter((w) => w.length > 2));
    let n = 0;
    for (const w of A) if (B.has(w)) n += 1;
    return n;
  }

  /** Parties that still have an unnamed placeholder seat going spare. */
  const claimParties = $derived.by(() => {
    if (!guest) return [];
    const q = claimQuery.trim().toLowerCase();
    const map = new Map();
    for (const g of Object.values(plan.guests)) {
      if (!g.placeholder) continue;
      if (!map.has(g.partyId)) {
        map.set(g.partyId, {
          partyId: g.partyId,
          label: g.partyLabel,
          buyerName: g.buyerName,
          ticketType: g.ticketType,
          placeholders: [],
        });
      }
      map.get(g.partyId).placeholders.push(g);
    }
    return [...map.values()]
      .map((p) => ({ ...p, score: nameOverlap(p.buyerName || p.label, guest.buyerName || guest.name) }))
      .filter((p) => !q || p.label.toLowerCase().includes(q) || (p.buyerName || "").toLowerCase().includes(q))
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, 12);
  });

  /** Dinner responses with no ticket, for naming this placeholder seat. */
  const claimCandidates = $derived.by(() => {
    if (!guest) return [];
    const q = claimQuery.trim().toLowerCase();
    return Object.values(plan.guests)
      .filter((g) => g.unmatched && g.id !== guest.id)
      .map((g) => ({ guest: g, score: nameOverlap(g.buyerName || g.name, guest.buyerName || guest.partyLabel) }))
      .filter((c) => !q || c.guest.name.toLowerCase().includes(q))
      .sort((a, b) => b.score - a.score || a.guest.name.localeCompare(b.guest.name))
      .slice(0, 12);
  });

  function claim(placeholderId) {
    claimOpen = false;
    claimQuery = "";
    store.claimTicketSeat(guest.id, placeholderId);
  }

  function claimFromPlaceholder(unmatchedId) {
    claimOpen = false;
    claimQuery = "";
    const id = unmatchedId;
    store.claimTicketSeat(id, guest.id);
    ui.openGuest(id);
  }

  function saveName() {
    const clean = String(nameDraft ?? "").trim();
    if (!clean) return;
    store.nameSeat(guest.id, clean);
    nameOpen = false;
    nameDraft = "";
  }

  const canRemove = $derived(Boolean(guest && (guest.source === "manual" || guest.unmatched)));

  /** Resolved seating note: who it points at and where they are now. */
  const prefTargets = $derived.by(() => {
    if (!guest?.prefs) return [];
    const out = [];
    for (const id of guest.prefs.withGuestIds || []) {
      const other = plan.guests[id];
      if (!other) continue;
      const s = plan.seating[id];
      const t = s ? plan.tables.find((x) => x.id === s.tableId) : null;
      out.push({
        id,
        kind: "guest",
        label: other.name,
        status: !s ? "Not seated yet" : t && seat && t.id === seat.tableId ? "Same table" : t ? `Table ${t.number}` : "",
        ok: Boolean(s && seat && s.tableId === seat.tableId),
      });
    }
    for (const pid of guest.prefs.withPartyIds || []) {
      const members = Object.values(plan.guests).filter((g) => g.partyId === pid);
      if (!members.length) continue;
      const here = members.filter((m) => seat && plan.seating[m.id]?.tableId === seat.tableId).length;
      out.push({
        id: pid,
        kind: "party",
        label: members[0].partyLabel,
        status: `${here} of ${members.length} at this table`,
        ok: here > 0,
      });
    }
    for (const groupKey of guest.prefs.groups || []) {
      out.push({ id: groupKey, kind: "group", label: `Group: ${groupKey}`, status: "", ok: true });
    }
    return out;
  });

  const constraintCandidates = $derived.by(() => {
    if (!constraintMode || !guest) return [];
    const q = constraintQuery.trim().toLowerCase();
    return Object.values(plan.guests)
      .filter((g) => g.id !== guest.id && (!q || g.name.toLowerCase().includes(q)))
      .slice(0, 8);
  });

  function setMeal(value) {
    store.updateGuest(guest.id, { meal: value || null });
  }

  function toggleTag(tagId) {
    const tags = new Set(guest.tags || []);
    if (tags.has(tagId)) tags.delete(tagId);
    else tags.add(tagId);
    store.updateGuest(guest.id, { tags: [...tags] });
  }

  function seatAt(tableId) {
    seatPickerOpen = false;
    const res = store.seatGuest(guest.id, tableId, null);
    if (res && res.ok === false) store.pushToast({ kind: "warn", message: "That table is full." });
  }

  function findOnFloor() {
    if (!ui.findOnFloor(guest.id)) {
      store.pushToast({ kind: "info", message: "That guest is not seated yet." });
    }
  }

  function addConstraint(otherId) {
    store.addConstraint(constraintMode, [guest.id, otherId], "");
    constraintMode = null;
    constraintQuery = "";
  }

  function mealColor(id) {
    return (
      {
        "short-rib": "var(--gs-meal-short-rib)",
        whitefish: "var(--gs-meal-whitefish)",
        ravioli: "var(--gs-meal-ravioli)",
      }[id] || "var(--gs-meal-none)"
    );
  }
</script>

{#if guest}
<div class="gsh">
  <!-- where they are -->
  <div class="gsh-seatline">
    {#if table && seat}
      <span class="gsh-seatnow">{tableLabel(table)} · seat {seat.seat + 1}</span>
    {:else}
      <span class="gsh-seatnow gsh-seatnow--none">Not seated</span>
    {/if}
    <div class="gsh-actions">
      <button type="button" class="gs-btn" onclick={() => (seatPickerOpen = !seatPickerOpen)}>Seat at…</button>
      {#if seat}
        <button type="button" class="gs-btn" onclick={findOnFloor}>Find on floor</button>
        <button type="button" class="gs-btn" onclick={() => store.unseatGuest(guest.id)}>Unseat</button>
      {/if}
    </div>
  </div>

  {#if seatPickerOpen}
    <div class="gsh-picker">
      {#each plan.tables as t (t.id)}
        {@const taken = Object.values(plan.seating).filter((s) => s.tableId === t.id).length}
        <button
          type="button"
          class="gsh-pickbtn"
          disabled={taken >= t.seats}
          onclick={() => seatAt(t.id)}
        >
          <span>{t.number}</span>
          <small>{t.seats - taken} free</small>
        </button>
      {/each}
    </div>
  {/if}

  <!-- warnings -->
  {#if warnings.length}
    <div class="gsh-warns">
      {#each warnings as w (w.key)}
        <div class="gsh-warn" data-sev={w.severity}>
          <p>{w.message}</p>
          <button type="button" class="gs-linkbtn" onclick={() => store.dismissWarning(w.key)}>Dismiss</button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- the raw ask -->
  {#if guest.seatingNote}
    <section class="gsh-sec">
      <h3>Seating preference, as written</h3>
      <blockquote class="gsh-quote">{guest.seatingNote}</blockquote>
      {#if prefTargets.length}
        <ul class="gsh-resolved">
          {#each prefTargets as t (t.kind + t.id)}
            <li>
              <span class="gsh-resdot" data-ok={t.ok ? "1" : null}></span>
              {#if t.kind === "guest"}
                <button type="button" class="gs-linkbtn" onclick={() => ui.openGuest(t.id)}>{t.label}</button>
              {:else}
                <span>{t.label}</span>
              {/if}
              {#if t.status}<span class="gsh-resstatus">{t.status}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if guest.prefs?.unresolved?.length}
        <p class="gsh-unresolved">
          Could not match: {guest.prefs.unresolved.join(" · ")}
        </p>
      {/if}
    </section>
  {/if}

  <!-- a late night ticket with a dinner seat needs an upgrade on paper -->
  {#if guest.hasDinner === false}
    <section class="gsh-sec gsh-sec--late">
      <h3>Late Night Access</h3>
      <p class="gsh-reconbody">
        This ticket starts at 9 PM and does not include dinner.
        {#if seat}
          They are sitting at a dinner table, so change the ticket type to clear the warning.
        {/if}
      </p>
      <label class="gsh-field">
        <span>Change ticket type</span>
        <select
          class="gs-input"
          value={guest.ticketType}
          onchange={(e) => {
            const next = ticketTypeById(e.currentTarget.value);
            store.updateGuest(guest.id, { ticketType: next.id, hasDinner: next.hasDinner !== false });
          }}
        >
          {#each TICKET_TYPES as t (t.id)}
            <option value={t.id}>{t.label}</option>
          {/each}
        </select>
      </label>
    </section>
  {/if}

  <!-- reconcile: unmatched diner or unnamed seat -->
  {#if guest.unmatched}
    <section class="gsh-sec gsh-sec--recon">
      <h3>No ticket matched this dinner response</h3>
      <p class="gsh-reconbody">
        They wrote down <strong>{guest.buyerName || "no purchaser"}</strong> as the purchaser. If that
        party has an unnamed seat, claim it: this guest takes the ticket, the party and the seat,
        and the blank row goes away.
      </p>
      {#if claimOpen}
        <input
          class="gs-input"
          placeholder="Search a party with an open seat"
          value={claimQuery}
          oninput={(e) => (claimQuery = e.currentTarget.value)}
        />
        <div class="gsh-cand">
          {#each claimParties as p (p.partyId)}
            <button type="button" class="gsh-candbtn" onclick={() => claim(p.placeholders[0].id)}>
              <span>
                {p.label}
                {#if p.score > 0}<em class="gsh-suggest">likely match</em>{/if}
              </span>
              <small>{ticketTypeById(p.ticketType).short} · {p.placeholders.length} unnamed</small>
            </button>
          {/each}
          {#if !claimParties.length}
            <p class="gsh-reconbody">No party has an unnamed seat left.</p>
          {/if}
        </div>
        <button type="button" class="gs-linkbtn" onclick={() => (claimOpen = false)}>Cancel</button>
      {:else}
        <button type="button" class="gs-btn" onclick={() => (claimOpen = true)}>Claim a ticket seat</button>
      {/if}
    </section>
  {:else if guest.placeholder}
    <section class="gsh-sec gsh-sec--recon">
      <h3>This seat has no name yet</h3>
      <p class="gsh-reconbody">
        {guest.buyerName || guest.partyLabel} bought it without naming the guest. Pick the dinner
        response that belongs here, or just type the name.
      </p>
      {#if nameOpen}
        <input
          class="gs-input"
          placeholder="Guest name"
          value={nameDraft}
          oninput={(e) => (nameDraft = e.currentTarget.value)}
          onkeydown={(e) => {
            if (e.key === "Enter") saveName();
          }}
        />
        <div class="gsh-actions">
          <button type="button" class="gs-btn gs-btn--gold" onclick={saveName}>Save the name</button>
          <button type="button" class="gs-btn" onclick={() => (nameOpen = false)}>Cancel</button>
        </div>
      {:else if claimOpen}
        <input
          class="gs-input"
          placeholder="Search the unmatched dinner responses"
          value={claimQuery}
          oninput={(e) => (claimQuery = e.currentTarget.value)}
        />
        <div class="gsh-cand">
          {#each claimCandidates as c (c.guest.id)}
            <button type="button" class="gsh-candbtn" onclick={() => claimFromPlaceholder(c.guest.id)}>
              <span>
                {c.guest.name}
                {#if c.score > 0}<em class="gsh-suggest">likely match</em>{/if}
              </span>
              <small>said "{c.guest.buyerName || "no purchaser"}"</small>
            </button>
          {/each}
          {#if !claimCandidates.length}
            <p class="gsh-reconbody">No unmatched dinner responses are left.</p>
          {/if}
        </div>
        <button type="button" class="gs-linkbtn" onclick={() => (claimOpen = false)}>Cancel</button>
      {:else}
        <div class="gsh-actions">
          <button type="button" class="gs-btn" onclick={() => (claimOpen = true)}>Name this seat…</button>
          <button
            type="button"
            class="gs-btn"
            onclick={() => {
              nameDraft = "";
              nameOpen = true;
            }}
          >
            Type a name
          </button>
        </div>
      {/if}
    </section>
  {/if}

  <!-- no Zeffy ticket: record what the team decided -->
  {#if showResolution}
    {#if resolution && !resEditing}
      <div class="gsh-resline" data-res={resolution}>
        <span class="gsh-resmark" aria-hidden="true"></span>
        <span class="gsh-restext">
          <strong>{RESOLUTION_STATUS[resolution]}</strong>{#if resolutionBy}<span>{` · ${resolutionBy}`}</span>{/if}
        </span>
        <button
          type="button"
          class="gs-linkbtn"
          onclick={() => {
            resChoice = resolution;
            resEditing = true;
          }}
        >
          Change
        </button>
      </div>
    {:else}
      <section class="gsh-sec gsh-sec--noticket" aria-labelledby={`gsh-nt-${guest.id}`}>
        <h3 id={`gsh-nt-${guest.id}`}>No ticket on record</h3>
        <p class="gsh-reconbody">
          Zeffy has no ticket for this guest. Record what the team decided so everyone sees it.
        </p>
        <div class="gsh-resopts" role="radiogroup" aria-labelledby={`gsh-nt-${guest.id}`}>
          {#each TICKET_RESOLUTIONS as r (r.id)}
            <button
              type="button"
              role="radio"
              class="gsh-resopt"
              class:gsh-resopt--on={resChoice === r.id}
              data-res={r.id}
              aria-checked={resChoice === r.id}
              onclick={() => (resChoice = r.id)}
            >
              <span class="gsh-resradio" aria-hidden="true"></span>
              <span class="gsh-reslabel">
                <strong>{r.label}</strong>
                <small>{r.description}</small>
              </span>
            </button>
          {/each}
        </div>
        <label class="gsh-field gsh-resnote">
          <span>Note (optional)</span>
          <input
            class="gs-input"
            maxlength="200"
            placeholder="Who confirmed it, how it was paid, who is following up"
            value={resNote}
            oninput={(e) => (resNote = e.currentTarget.value)}
            onkeydown={(e) => {
              if (e.key === "Enter" && resChoice) confirmResolution();
            }}
          />
        </label>
        <div class="gsh-actions">
          <button type="button" class="gs-btn gs-btn--gold gsh-resgo" disabled={!resChoice} onclick={confirmResolution}>
            Confirm
          </button>
          {#if resolution}
            <button
              type="button"
              class="gs-btn"
              onclick={() => {
                resEditing = false;
                resChoice = null;
                resNote = "";
              }}
            >
              Cancel
            </button>
          {/if}
        </div>
      </section>
    {/if}
  {/if}

  <!-- editable -->
  <section class="gsh-sec">
    <h3>Planner edits</h3>
    <label class="gsh-field">
      <span>Display name</span>
      <input
        class="gs-input"
        value={guest.name}
        oninput={(e) => store.updateGuest(guest.id, { name: e.currentTarget.value })}
      />
    </label>

    <div class="gsh-field">
      <span>Entrée</span>
      <div class="gsh-meals">
        {#each MEALS as m (m.id)}
          <button
            type="button"
            class="gsh-meal"
            class:gsh-meal--on={guest.meal === m.id}
            onclick={() => setMeal(m.id)}
          >
            <span class="gs-dot" style={`background:${mealColor(m.id)}`}></span>
            {m.short}
          </button>
        {/each}
        <button type="button" class="gsh-meal" class:gsh-meal--on={!guest.meal} onclick={() => setMeal(null)}>
          <span class="gs-dot" style="background:var(--gs-meal-none)"></span>
          None
        </button>
      </div>
      {#if guest.mealRaw}
        <small class="gsh-raw">Submitted as: {guest.mealRaw}</small>
      {/if}
    </div>

    <div class="gsh-field">
      <span>Tags</span>
      <div class="gsh-tags">
        {#each GUEST_TAGS as tag (tag.id)}
          <button
            type="button"
            class="gsh-tag"
            class:gsh-tag--on={(guest.tags || []).includes(tag.id)}
            onclick={() => toggleTag(tag.id)}
            aria-pressed={(guest.tags || []).includes(tag.id)}
          >
            {tag.label}
          </button>
        {/each}
      </div>
    </div>

    <label class="gsh-field">
      <span>Planner note</span>
      <textarea
        class="gs-input"
        rows="2"
        value={guest.plannerNote}
        oninput={(e) => store.updateGuest(guest.id, { plannerNote: e.currentTarget.value })}
      ></textarea>
    </label>
  </section>

  <!-- constraints -->
  <section class="gsh-sec">
    <h3>Keep together, keep apart</h3>
    {#if constraints.length}
      <ul class="gsh-constraints">
        {#each constraints as c (c.id)}
          {@const other = c.guestIds.find((id) => id !== guest.id)}
          <li>
            <span class="gsh-ctype" data-type={c.type}>{c.type === "together" ? "Together" : "Apart"}</span>
            <button type="button" class="gs-linkbtn" onclick={() => ui.openGuest(other)}>
              {plan.guests[other]?.name || "Unknown guest"}
            </button>
            <button type="button" class="gs-linkbtn gsh-remove" onclick={() => store.removeConstraint(c.id)}>
              Remove
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if constraintMode}
      <input
        class="gs-input"
        placeholder={`Search a guest to keep ${constraintMode}`}
        value={constraintQuery}
        oninput={(e) => (constraintQuery = e.currentTarget.value)}
      />
      <div class="gsh-cand">
        {#each constraintCandidates as c (c.id)}
          <button type="button" class="gsh-candbtn" onclick={() => addConstraint(c.id)}>
            {c.name}<small>{c.partyLabel}</small>
          </button>
        {/each}
      </div>
      <button type="button" class="gs-linkbtn" onclick={() => (constraintMode = null)}>Cancel</button>
    {:else}
      <div class="gsh-actions">
        <button type="button" class="gs-btn" onclick={() => (constraintMode = "together")}>Keep together with…</button>
        <button type="button" class="gs-btn" onclick={() => (constraintMode = "apart")}>Keep apart from…</button>
      </div>
    {/if}
  </section>

  <!-- the party -->
  <section class="gsh-sec">
    <h3>Party · {guest.partyLabel}</h3>
    <ul class="gsh-party">
      {#each party as member (member.id)}
        {@const ms = plan.seating[member.id]}
        {@const mt = ms ? plan.tables.find((t) => t.id === ms.tableId) : null}
        <li>
          <button
            type="button"
            class="gsh-partybtn"
            class:gsh-partybtn--me={member.id === guest.id}
            onclick={() => ui.openGuest(member.id)}
          >
            <span>{member.name}</span>
            <small>{mt ? `Table ${mt.number}` : "Unseated"}</small>
          </button>
        </li>
      {/each}
    </ul>
    {#if table}
      <button
        type="button"
        class="gs-btn"
        onclick={() => {
          const res = store.seatParty(guest.partyId, table.id);
          if (res?.missed?.length) {
            store.pushToast({ kind: "warn", message: `${res.missed.length} did not fit at this table.` });
          }
        }}
      >
        Seat the rest of this party here
      </button>
    {/if}
  </section>

  <!-- the record -->
  <section class="gsh-sec">
    <h3>From the ticket and the dinner form</h3>
    <dl class="gsh-dl">
      <dt>Ticket</dt>
      <dd>{ticket?.label}{guest.hasDinner ? "" : " · no dinner seat"}</dd>
      {#if guest.ticketNumbers?.length}
        <dt>Ticket numbers</dt>
        <dd>{guest.ticketNumbers.join(", ")}</dd>
      {/if}
      <dt>Bought by</dt>
      <dd>{guest.buyerName || "Unknown"}{guest.buyerEmail ? ` · ${guest.buyerEmail}` : ""}</dd>
      {#if guest.email}
        <dt>Guest email</dt>
        <dd>{guest.email}</dd>
      {/if}
      {#if guest.phone}
        <dt>Phone</dt>
        <dd>{guest.phone}</dd>
      {/if}
      {#if guest.heardAbout}
        <dt>Heard about LSP</dt>
        <dd>{guest.heardAbout}</dd>
      {/if}
      {#if guest.placeholder}
        <dt>Status</dt>
        <dd>Unnamed seat, waiting on a name</dd>
      {/if}
      {#if guest.unmatched}
        <dt>Status</dt>
        <dd>Dinner response with no matching ticket</dd>
      {/if}
    </dl>
  </section>

  {#if canRemove}
    <section class="gsh-sec">
      {#if confirmRemove}
        <p class="gsh-confirm">Remove {guest.name} from the plan? This cannot be undone from the server history.</p>
        <div class="gsh-actions">
          <button
            type="button"
            class="gs-btn gs-btn--danger"
            onclick={() => {
              store.removeGuest(guest.id);
              ui.closeSheets();
            }}
          >
            Yes, remove
          </button>
          <button type="button" class="gs-btn" onclick={() => (confirmRemove = false)}>Keep</button>
        </div>
      {:else}
        <button type="button" class="gs-btn gs-btn--danger" onclick={() => (confirmRemove = true)}>
          Remove this guest
        </button>
      {/if}
    </section>
  {/if}
</div>
{/if}

<style>
  .gsh-seatline {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(23, 32, 44, 0.12);
  }
  .gsh-seatnow {
    font-size: 14px;
    font-weight: 700;
    color: #6b4a12;
  }
  .gsh-seatnow--none {
    color: #7b8493;
    font-weight: 400;
    font-style: italic;
  }
  .gsh-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .gsh-picker {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(62px, 1fr));
    gap: 6px;
    margin: 10px 0 2px;
  }
  .gsh-pickbtn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 7px 4px;
    min-height: 46px;
    border: 1px solid rgba(23, 32, 44, 0.25);
    border-radius: 3px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    cursor: pointer;
  }
  .gsh-pickbtn span {
    font-size: 16px;
    font-weight: 700;
  }
  .gsh-pickbtn small {
    font-size: 10px;
    opacity: 0.65;
  }
  .gsh-pickbtn:hover:not(:disabled) {
    background: rgba(255, 189, 89, 0.28);
  }
  .gsh-pickbtn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .gsh-warns {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .gsh-warn {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    justify-content: space-between;
    padding: 8px 10px;
    border-left: 3px solid var(--gs-warn);
    background: rgba(226, 163, 60, 0.12);
  }
  .gsh-warn[data-sev="error"] {
    border-left-color: var(--gs-error);
    background: rgba(224, 106, 90, 0.12);
  }
  .gsh-warn p {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
  }
  .gsh-warn :global(.gs-linkbtn) {
    color: #8a5700;
    flex: 0 0 auto;
    font-size: 12px;
  }

  .gsh-sec {
    margin-top: 18px;
  }
  .gsh-sec h3 {
    margin: 0 0 8px;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #8a6a24;
  }
  .gsh-quote {
    margin: 0;
    padding: 10px 12px;
    background: rgba(255, 189, 89, 0.2);
    border-left: 3px solid var(--gs-gold);
    font-size: 13.5px;
    line-height: 1.55;
    font-style: italic;
  }
  .gsh-resolved {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12.5px;
  }
  .gsh-resolved li {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }
  .gsh-resdot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #b9772f;
    flex: 0 0 auto;
  }
  .gsh-resdot[data-ok] {
    background: #3f8c5c;
  }
  .gsh-resolved :global(.gs-linkbtn) {
    color: #7a5312;
  }
  .gsh-resstatus {
    color: #78818f;
    font-size: 11.5px;
  }
  .gsh-unresolved {
    margin: 8px 0 0;
    font-size: 12px;
    color: #8c2f22;
  }

  .gsh-field {
    display: block;
    margin-bottom: 12px;
  }
  .gsh-field > span {
    display: block;
    font-size: 11.5px;
    color: #5f6875;
    margin-bottom: 4px;
  }
  .gsh-meals,
  .gsh-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .gsh-meal,
  .gsh-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
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
  .gsh-meal--on,
  .gsh-tag--on {
    background: rgba(255, 189, 89, 0.36);
    border-color: var(--gs-gold);
    font-weight: 700;
  }
  .gsh-raw {
    display: block;
    margin-top: 5px;
    font-size: 11px;
    color: #78818f;
  }

  .gsh-constraints {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12.5px;
  }
  .gsh-constraints li {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .gsh-ctype {
    font-size: 9.5px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 5px;
    border: 1px solid #3f8c5c;
    color: #2f6b45;
    border-radius: 2px;
  }
  .gsh-ctype[data-type="apart"] {
    border-color: #b0493b;
    color: #8c2f22;
  }
  .gsh-remove {
    margin-left: auto;
    font-size: 11.5px;
  }
  .gsh-cand {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin: 6px 0;
  }
  .gsh-candbtn {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: baseline;
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
  .gsh-candbtn small {
    color: #78818f;
    font-size: 11px;
  }
  .gsh-candbtn:hover {
    background: rgba(255, 189, 89, 0.28);
  }

  .gsh-party {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .gsh-partybtn {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    padding: 7px 8px;
    min-height: 38px;
    background: none;
    border: 1px solid transparent;
    border-radius: 2px;
    color: var(--gs-ink);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
    text-align: left;
  }
  .gsh-partybtn:hover {
    background: rgba(23, 32, 44, 0.06);
  }
  .gsh-partybtn--me {
    border-color: var(--gs-gold);
    background: rgba(255, 189, 89, 0.2);
    font-weight: 700;
  }
  .gsh-partybtn small {
    color: #78818f;
    font-size: 11px;
    flex: 0 0 auto;
  }

  .gsh-dl {
    margin: 0;
    display: grid;
    grid-template-columns: 34% 1fr;
    gap: 5px 10px;
    font-size: 12.5px;
  }
  .gsh-dl dt {
    color: #78818f;
  }
  .gsh-dl dd {
    margin: 0;
    word-break: break-word;
  }
  .gsh-sec--late {
    padding: 12px;
    background: rgba(135, 148, 165, 0.14);
    border: 1px solid rgba(23, 32, 44, 0.18);
  }
  .gsh-sec--recon {
    padding: 12px;
    background: rgba(255, 189, 89, 0.16);
    border: 1px solid rgba(185, 132, 47, 0.45);
  }
  .gsh-reconbody {
    margin: 0 0 10px;
    font-size: 12.5px;
    line-height: 1.5;
    color: #4a525f;
  }
  .gsh-suggest {
    margin-left: 6px;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-style: normal;
    color: #2f6b45;
    border: 1px solid #3f8c5c;
    border-radius: 2px;
    padding: 1px 4px;
  }
  .gsh-sec--noticket {
    padding: 12px;
    background: rgba(226, 163, 60, 0.13);
    border: 1px solid rgba(185, 132, 47, 0.6);
    border-left-width: 4px;
  }
  .gsh-resopts {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
  }
  .gsh-resopt {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 52px;
    padding: 8px 12px;
    border: 1px solid rgba(23, 32, 44, 0.26);
    border-radius: 3px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .gsh-resopt:hover {
    background: rgba(255, 189, 89, 0.22);
  }
  .gsh-resopt--on {
    background: rgba(255, 189, 89, 0.4);
    border-color: var(--gs-gold);
    box-shadow: inset 0 0 0 1px var(--gs-gold);
  }
  .gsh-resradio {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid rgba(23, 32, 44, 0.45);
    background: #fffdf9;
  }
  .gsh-resopt--on .gsh-resradio {
    border-color: #6b4a12;
    background: radial-gradient(circle, #6b4a12 0 4px, #fffdf9 5px);
  }
  .gsh-reslabel {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .gsh-reslabel strong {
    font-size: 14px;
  }
  .gsh-reslabel small {
    font-size: 12px;
    line-height: 1.35;
    color: #5f6875;
  }
  .gsh-resnote {
    margin-bottom: 10px;
  }
  .gsh-resgo {
    min-width: 110px;
  }
  .gsh-resline {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    padding: 8px 10px;
    border: 1px solid rgba(23, 32, 44, 0.16);
    border-left: 3px solid #3f8c5c;
    background: rgba(63, 140, 92, 0.08);
    font-size: 12.5px;
  }
  .gsh-resline[data-res="outreach"] {
    border-left-color: var(--gs-warn);
    background: rgba(226, 163, 60, 0.14);
  }
  .gsh-resmark {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #3f8c5c;
  }
  .gsh-resline[data-res="outreach"] .gsh-resmark {
    background: #b9772f;
  }
  .gsh-restext {
    flex: 1 1 auto;
    min-width: 0;
  }
  .gsh-restext span {
    color: #5f6875;
  }
  .gsh-resline :global(.gs-linkbtn) {
    flex: 0 0 auto;
    color: #7a5312;
    font-size: 12px;
  }
  .gsh-confirm {
    margin: 0 0 8px;
    font-size: 12.5px;
    color: #8c2f22;
  }
</style>

