<!--
  The party sheet, which is where the evening is won or lost.

  Households SHARE a paddle (organizer, Sep 25: couples and families share,
  150 paddles in the box, walk-ins take the next free one). So this sheet
  leads with the paddle: one big block per shared paddle that says who it
  covers and whether it has already left the desk ("With Sofía since 6:41 PM").
  Checking in the second half of a couple later says "Paddle 42 · already with
  Sofía" and hands out nothing new; the server guarantees the same, whatever
  the other phones are doing (scripts/gala-checkin-concurrency-test.mjs, K-P).

  Split, share and lost paddle are first class again, under "Paddle options".
  A door volunteer can NEVER type a paddle number: every number comes from the
  server as "next free". Only an admin session sees the typed-number path.

  If another phone checks somebody in while this sheet is open, the row flips
  within a few seconds, a line says who did it, and the buttons pause for a
  moment so a thumb already on its way does not land on a different guest.
-->
<script>
  import { getContext, untrack } from "svelte";
  import { PackageX, Scissors, UserPlus, Users } from "@lucide/svelte";
  import { LATE_NIGHT, clockTime, nameList, paddleBlocks, paddleShare } from "../../lib/galaCheckin/derive.js";
  import Sheet from "./Sheet.svelte";
  import GuestRow from "./GuestRow.svelte";
  import PaddleChip from "./PaddleChip.svelte";

  const { store, ui } = getContext("gala-checkin");

  const party = $derived(store.parties.find((p) => p.id === ui.openPartyId) || null);
  const waiting = $derived(party ? party.members.filter((m) => !m.checked_in_at) : []);
  const focus = $derived(
    party
      ? party.members.find((m) => m.id === ui.focusGuestId && !m.checked_in_at) || waiting[0] || party.members[0]
      : null,
  );
  const focusShare = $derived(focus ? paddleShare(focus, store.groupMembers(focus.paddle_group)) : null);
  const busy = $derived(party ? party.members.some((m) => store.pendingByGuest[m.id]) : false);
  const blocks = $derived(party ? paddleBlocks(party).filter((b) => b.shared) : []);
  const isAdmin = $derived(store.me?.role === "admin");
  const allLate = $derived(party ? party.lateNight === party.total : false);
  const watcher = $derived.by(() => {
    if (!party) return "";
    for (const m of party.members) {
      const p = store.focusByGuest[m.id];
      if (p) return p.n || "Another volunteer";
    }
    return "";
  });

  // Members of a small party who hold a paddle of their own: candidates for
  // "share X's paddle". Sponsor tables (5+) are one paddle per person on
  // purpose, so they get no merge buttons.
  const mergeable = $derived.by(() => {
    if (!party || party.total > 4 || party.groups.length < 2) return [];
    const out = [];
    for (const m of party.members) {
      for (const g of party.groups) {
        if (g.key === m.paddle_group || g.paddle_number == null) continue;
        out.push({ joiner: m, target: g.members[0], number: g.paddle_number, names: nameList(g.members) });
      }
    }
    return out;
  });

  // ---- another phone changed this party while it is open ---------------------
  let seenParty = "";
  let seen = new Map();
  let myUndos = new Set();
  let flash = $state({});
  let banner = $state("");
  let settling = $state(false);
  let settleTimer = null;

  $effect(() => {
    if (!party) {
      seenParty = "";
      return;
    }
    const members = party.members;
    if (seenParty !== party.id) {
      seenParty = party.id;
      seen = new Map(members.map((m) => [m.id, m.checked_in_at]));
      flash = {};
      banner = "";
      return;
    }
    const lines = [];
    const lit = {};
    for (const m of members) {
      const prev = seen.get(m.id);
      if (!prev && m.checked_in_at && !store.mine.has(m.id)) {
        const share = paddleShare(m, store.groupMembers(m.paddle_group));
        const pad = m.paddle_number == null ? "" : ` · paddle ${m.paddle_number}${share.withOther ? ` is with ${share.holder.name}` : ""}`;
        lines.push(`${m.checked_in_by || "Another volunteer"} just checked in ${m.name} on another phone${pad}.`);
        lit[m.id] = true;
      } else if (prev && !m.checked_in_at && !myUndos.has(m.id)) {
        lines.push(`${m.name}'s check-in was undone on another phone.`);
      }
      seen.set(m.id, m.checked_in_at);
    }
    if (lines.length) {
      banner = lines.join(" ");
      flash = { ...untrack(() => flash), ...lit };
      settling = true;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => (settling = false), 1200);
    }
  });

  const DIALOG = new Set([
    "paddle-taken", "paddle-void", "unknown-paddle", "group-has-paddle",
    "pool-empty", "mixed-groups", "needs-connection",
  ]);

  async function checkIn(ids, choice = "auto") {
    if (!ids.length || settling) return;
    const opts = choice === "auto" ? { assign_paddle: true } : { paddle: choice };
    const res = await store.checkIn(ids, opts);
    if (res.ok) {
      ui.afterCheckIn(res);
      return res;
    }
    refused(res, ids, typeof choice === "number" ? choice : null);
    return res;
  }

  function refused(res, ids, typedNumber) {
    // busy: another op is in flight for this guest. transient: the row and the
    // banner already say "Not saved, tap to retry" with the same op id.
    if (res.reason === "busy" || res.transient) return;
    if (DIALOG.has(res.reason)) {
      ui.openConflict({
        res,
        typed: typedNumber,
        canType: isAdmin,
        onAuto: () => { ui.closeConflict(); checkIn(ids, "auto"); },
        onTyped: (n) => { ui.closeConflict(); checkIn(ids, n); },
        onNone: () => { ui.closeConflict(); checkIn(ids, "none"); },
        onKeep: () => { ui.closeConflict(); checkIn(ids, "auto"); },
        onSwap: (n) => { ui.closeConflict(); store.paddleSwap(ids[0], n, "void"); },
      });
      return;
    }
    const TEXT = {
      "unknown-guest": "This guest was removed. Refreshing the list.",
      "group-checked-in": `${res.held_by || "Someone"} is checked in with this paddle. Undo their check-in first, or ask the lead.`,
      "paddle-has-donations": "This paddle has gifts recorded. It cannot go back in the box.",
      "would-orphan-paddle": "That would leave a paddle with nobody on it. Return the paddle to the box first.",
      forbidden: "Ask the lead: this needs an admin device.",
    };
    if (TEXT[res.reason]) {
      store.push({ kind: "error", text: TEXT[res.reason] });
      if (res.reason === "unknown-guest") void store.pull();
      return;
    }
    if (res.reason === "no-paddle" || res.reason === "same-paddle" || res.reason === "nothing-to-change") {
      store.push({ kind: "info", text: "Nothing to change." });
      return;
    }
    console.warn("[check-in] unexpected refusal", res.reason, res);
    store.push({ kind: "error", text: "Something went wrong, try again." });
  }

  // ---- typed number: ADMIN sessions only -------------------------------------
  let typing = $state(false);
  let typed = $state("");
  let typedFor = $state([]);

  function submitTyped(event) {
    event?.preventDefault();
    const n = Number(typed);
    if (!isAdmin || !Number.isInteger(n) || n < 1 || n > 9999) return;
    typing = false;
    checkIn(typedFor, n);
  }

  // ---- undo, split, share, lost --------------------------------------------------
  function askUndo(guest) {
    const n = guest.paddle_number;
    ui.confirm({
      message: n == null
        ? `Undo check-in for ${guest.name}?`
        : `Undo check-in for ${guest.name}? Paddle ${n} stays with them; nothing goes back in the box.`,
      confirmLabel: "Undo check-in",
      tone: "danger",
      onConfirm: async () => {
        myUndos.add(guest.id);
        const res = await store.undo(guest.id);
        if (!res.ok) refused(res, [guest.id], null);
      },
    });
  }

  function askSplit(guest) {
    ui.confirm({
      message: `Give ${guest.name} a paddle of their own? They stop sharing and get the next free number.`,
      confirmLabel: "Give their own paddle",
      onConfirm: async () => {
        const res = await store.groupSet([guest.id], null);
        if (!res.ok) return refused(res, [guest.id], null);
        const got = await store.paddleAssign(guest.id, null);
        if (!got.ok) return refused(got, [guest.id], null);
        ui.showPaddle({
          number: got.paddle_number,
          eyebrow: "Own paddle",
          title: guest.name,
          line: guest.checked_in_at ? `Hand ${guest.name} paddle ${got.paddle_number} now.` : `Paddle ${got.paddle_number} is theirs when they arrive.`,
        });
      },
    });
  }

  function askShare({ joiner, target, number, names }) {
    if (joiner.checked_in_at && joiner.paddle_number != null) {
      store.push({ kind: "error", text: `${joiner.name} is already in with paddle ${joiner.paddle_number}. Undo their check-in first, then share.` });
      return;
    }
    const own = joiner.paddle_number;
    ui.confirm({
      message: own == null
        ? `${joiner.name} shares paddle ${number} with ${names}?`
        : `${joiner.name} shares paddle ${number} with ${names}? Paddle ${own} goes back in the box.`,
      confirmLabel: `Share paddle ${number}`,
      checkLabel: own == null ? "" : `Paddle ${own} is in the box or in my hand`,
      onConfirm: async () => {
        if (own != null) {
          const rel = await store.paddleRelease(own, false);
          if (!rel.ok) return refused(rel, [joiner.id], null);
        }
        const res = await store.groupSet([joiner.id], target.id);
        if (!res.ok) return refused(res, [joiner.id], null);
        store.push({ kind: "info", text: `${joiner.name} now shares paddle ${number}.` });
      },
    });
  }

  function askLost(block) {
    const guest = block.members[0];
    ui.confirm({
      message: `Paddle ${block.number} is lost? It is retired for the night and ${nameList(block.members)} get${block.members.length > 1 ? "" : "s"} the next free paddle.`,
      confirmLabel: "Retire it, give the next free one",
      tone: "danger",
      checkLabel: "I have looked, the paddle is not at the desk",
      onConfirm: async () => {
        const res = await store.paddleSwap(guest.id, null, "void");
        if (!res.ok) return refused(res, [guest.id], null);
        ui.showPaddle({
          number: res.paddle_number,
          eyebrow: `Replaces paddle ${block.number}`,
          title: nameList(block.members),
          line: `Hand over paddle ${res.paddle_number}. Paddle ${block.number} is retired.`,
        });
      },
    });
  }

  const lostTargets = $derived(party ? party.groups.filter((g) => g.paddle_number != null).map((g) => ({ number: g.paddle_number, members: g.members })) : []);
  const joinTarget = $derived(party ? party.groups.find((g) => g.paddle_number != null)?.members[0] || party.members[0] : null);

  function done() {
    ui.closeParty();
    ui.nextGuest();
  }
</script>

{#if party}
  <Sheet
    eyebrow={party.table_number != null ? `Table ${party.table_number}` : allLate ? LATE_NIGHT : "No table"}
    title={party.label}
    onclose={() => ui.closeParty()}
    tall
  >
    {#if banner}
      <p class="ps-banner" role="status">{banner}</p>
    {/if}
    {#if watcher}
      <p class="ps-watch">{watcher} has this party open on another phone</p>
    {/if}

    {#each blocks as b (b.key)}
      <div class="ps-paddle">
        <PaddleChip number={b.number} pending={busy && b.number == null} size="lg" />
        <div class="ps-paddle-info">
          <p class="ps-paddle-who"><Users size={16} strokeWidth={2.2} /> Shared by {nameList(b.members)}</p>
          {#if b.holder}
            <p class="ps-paddle-state ps-paddle-state--out">
              With {b.holder.name} since {clockTime(b.holder.checked_in_at)}
            </p>
            {#if b.waiting.length}
              <p class="ps-paddle-hint">{nameList(b.waiting)}: check in, no new paddle</p>
            {/if}
          {:else if b.number != null}
            <p class="ps-paddle-state">Not handed out yet. Give it to whoever arrives first.</p>
          {:else}
            <p class="ps-paddle-state">No paddle yet. The first check-in gets the next free one.</p>
          {/if}
        </div>
      </div>
    {/each}

    <p class="ps-count">
      {party.arrived} of {party.total} arrived{party.lateNight && !allLate ? ` · ${party.lateNight} ${LATE_NIGHT}` : ""}
    </p>

    <div class="ps-rows">
      {#each party.members as m (m.id)}
        <GuestRow guest={m} justNow={Boolean(flash[m.id])} onCheckIn={(g) => checkIn([g.id], "auto")} onUndo={askUndo} />
      {/each}
    </div>

    <section class="ps-opts" aria-label="Paddle options">
      <h3 class="ps-opts-title">Paddle options</h3>
      <button
        type="button"
        class="ps-link"
        onclick={() => ui.openWalkIn(party.table_number ?? null, party.label, joinTarget)}
      >
        <UserPlus size={18} strokeWidth={2} /> Add a guest to this party
      </button>
      {#each blocks as b (`s-${b.key}`)}
        {#each b.members as m (`split-${m.id}`)}
          <button type="button" class="ps-link" onclick={() => askSplit(m)}>
            <Scissors size={18} strokeWidth={2} /> Give {m.name} a paddle of their own
          </button>
        {/each}
      {/each}
      {#each mergeable as x (`j-${x.joiner.id}-${x.target.id}`)}
        <button type="button" class="ps-link" onclick={() => askShare(x)}>
          <Users size={18} strokeWidth={2} /> {x.joiner.name} shares paddle {x.number}
        </button>
      {/each}
      {#each lostTargets as t (`lost-${t.number}`)}
        <button type="button" class="ps-link ps-link--alert" onclick={() => askLost(t)}>
          <PackageX size={18} strokeWidth={2} /> Paddle {t.number} is lost
        </button>
      {/each}
    </section>

    {#snippet footer()}
      {#if typing && isAdmin}
        <form class="ps-entry" onsubmit={submitTyped}>
          <label class="glabel" for="ps-num">Admin: paddle number in your hand</label>
          <div class="ps-entry-row">
            <input id="ps-num" class="ginput ginput--num" type="text" inputmode="numeric" pattern="[0-9]*"
              autocomplete="off" maxlength="4" enterkeyhint="done" bind:value={typed} />
            <button type="submit" class="gbtn gbtn--gold" disabled={!/^[0-9]{1,4}$/.test(typed)}>Check in</button>
          </div>
          <button type="button" class="gbtn gbtn--quiet" onclick={() => (typing = false)}>Cancel</button>
        </form>
      {:else if waiting.length === 0}
        <p class="ps-done">Everyone in this party is checked in.</p>
        <button type="button" class="gbtn gbtn--gold" onclick={done}>Done, next guest</button>
      {:else}
        <p class="ps-next" class:ps-next--out={focusShare?.withOther}>
          {#if focus.paddle_number == null}
            {focusShare?.shared ? "Their household gets the next free paddle" : "Gets the next free paddle"}
          {:else if focusShare?.withOther}
            No new paddle: {focus.paddle_number} is already with {focusShare.holder.name}
          {:else}
            Hand over paddle {focus.paddle_number}{focusShare?.shared ? `, shared with ${nameList(focusShare.others)}` : ""}
          {/if}
        </p>
        <button type="button" class="gbtn gbtn--gold gbtn--lg" disabled={busy || settling} onclick={() => checkIn([focus.id], "auto")}>
          {focus.placeholder ? "Check in without a name" : `Check in ${focus.name}`}
        </button>
        {#if waiting.length > 1}
          <button type="button" class="gbtn" disabled={busy || settling} onclick={() => checkIn(waiting.map((m) => m.id), "auto")}>
            Check in party ({waiting.length})
          </button>
        {/if}
        {#if isAdmin && focus.paddle_number == null}
          <button type="button" class="gbtn gbtn--quiet" onclick={() => { typedFor = [focus.id]; typed = ""; typing = true; }}>
            Admin: type the number
          </button>
        {/if}
      {/if}
    {/snippet}
  </Sheet>
{/if}

<style>
  .ps-banner {
    margin: 0 0 12px;
    padding: 10px 12px;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.4;
    color: var(--g26-cream);
    background: rgb(95 212 184 / 0.12);
    border: 1px solid rgb(95 212 184 / 0.55);
    border-left-width: 4px;
    border-radius: var(--g26-r-chip);
  }
  .ps-watch {
    margin: 0 0 10px;
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-gold-soft);
  }

  .ps-paddle {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 10px;
    padding: 12px;
    background: var(--g26-navy-2);
    border: 1px solid var(--g26-line-strong);
    border-radius: var(--g26-r-card);
  }
  .ps-paddle-info {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .ps-paddle-who {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 0;
    font-size: 15px;
    font-weight: 800;
    line-height: 1.3;
    color: var(--g26-cream);
  }
  .ps-paddle-who :global(svg) {
    flex: none;
    margin-top: 1px;
    color: var(--g26-gold);
  }
  .ps-paddle-state {
    margin: 0;
    font-size: 14px;
    line-height: 1.35;
    color: var(--g26-dim);
  }
  .ps-paddle-state--out {
    font-weight: 800;
    color: var(--g26-ok);
  }
  .ps-paddle-hint {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-gold);
  }

  .ps-count {
    margin: 4px 0 0;
    padding-bottom: 6px;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--g26-gold-soft);
    border-bottom: 1px solid var(--g26-line);
  }

  .ps-opts {
    display: grid;
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid var(--g26-line-strong);
  }
  .ps-opts-title {
    margin: 0 0 2px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--g26-gold-soft);
  }
  .ps-link {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 0 4px;
    font-family: var(--g26-sans);
    font-size: 15px;
    font-weight: 700;
    text-align: left;
    color: var(--g26-gold);
    background: none;
    border: 0;
    border-bottom: 1px solid var(--g26-line);
    cursor: pointer;
  }
  .ps-link:last-child {
    border-bottom: 0;
  }
  .ps-link--alert {
    color: var(--g26-alert);
  }
  .ps-link:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }

  .ps-next {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.35;
    color: var(--g26-gold-soft);
  }
  .ps-next--out {
    color: var(--g26-gold);
  }
  .ps-done {
    margin: 0;
    padding: 4px 0;
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    color: var(--g26-ok);
  }

  .ps-entry {
    display: grid;
    gap: 8px;
  }
  .ps-entry-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
  }
</style>
