<!--
  One party, one tappable row.

  The whole party comes up together even when the volunteer only typed one
  name, because that is how people arrive: "we are the Nava table". Status is
  never carried by colour alone: a filled slot also has a check mark, and the
  fraction is spelled out in words underneath.
-->
<script>
  import { getContext } from "svelte";
  import { Check, TriangleAlert, Users } from "@lucide/svelte";
  import { LATE_NIGHT, checkedInLine, paddleBlocks } from "../../lib/galaCheckin/derive.js";
  import PaddleChip from "./PaddleChip.svelte";

  let { party, matchedGuestId = "" } = $props();

  const { store, ui } = getContext("gala-checkin");

  const SLOT_CAP = 8;
  const shown = $derived(party.members.slice(0, SLOT_CAP));
  const overflow = $derived(Math.max(0, party.total - SLOT_CAP));

  const busy = $derived(party.members.some((m) => store.pendingByGuest[m.id]));
  const watcher = $derived.by(() => {
    for (const m of party.members) {
      const p = store.focusByGuest[m.id];
      if (p) return p.n || "Another volunteer";
    }
    return "";
  });
  const needsName = $derived(party.members.some((m) => m.placeholder && !m.checked_in_at));
  const matched = $derived(party.members.find((m) => m.id === matchedGuestId) || null);
  // Households share a paddle: say so on the card, and say who has it once
  // it has left the desk, so the second half of a couple is never handed a
  // second one.
  const shared = $derived(paddleBlocks(party).filter((b) => b.shared));
  const fraction = $derived.by(() => {
    if (party.total === 1) return party.allArrived ? checkedInLine(party.members[0]) : "";
    if (party.allArrived) return "All arrived";
    if (!party.anyArrived) return "";
    const out = shared.find((b) => b.holder && b.number != null);
    return `${party.arrived} of ${party.total} arrived${out ? ` · paddle ${out.number} is with ${out.holder.name}` : ""}`;
  });
</script>

<button
  type="button"
  class="pcard"
  class:pcard--in={party.allArrived}
  class:pcard--flag={needsName}
  onclick={() => ui.openParty(party.id, matchedGuestId || party.members[0]?.id)}
>
  <span class="pcard-main">
    <span class="pcard-top">
      <span class="pcard-name">{matched ? matched.name : party.label}</span>
      {#if party.paddleNumbers.length === 1}
        <PaddleChip number={party.paddleNumbers[0]} pending={busy && party.paddleNumbers.length === 0} />
      {:else if party.paddleNumbers.length > 1}
        <span class="pcard-many"><Users size={14} strokeWidth={2} /> {party.paddleNumbers.length} paddles</span>
      {:else}
        <PaddleChip number={null} pending={busy} />
      {/if}
    </span>

    <span class="pcard-meta">
      {#if matched && matched.name !== party.label}<span class="pcard-party">{party.label}</span>{/if}
      {#if party.table_number != null}<span class="pcard-tag">Table {party.table_number}</span>{/if}
      {#if shared.length}<span class="pcard-tag pcard-tag--gold">Shared paddle</span>{/if}
      {#if party.lateNight > 0}<span class="pcard-tag pcard-tag--late">{LATE_NIGHT}{party.lateNight < party.total ? ` (${party.lateNight})` : ""}</span>{/if}
    </span>

    <span class="pcard-status">
      <span class="pcard-slots" aria-hidden="true">
        {#each shown as m (m.id)}
          <span class="slot" class:slot--in={Boolean(m.checked_in_at)} class:slot--busy={Boolean(store.pendingByGuest[m.id])}>
            {#if m.checked_in_at}<Check size={18} strokeWidth={3} />{/if}
          </span>
        {/each}
        {#if overflow}<span class="slot slot--more">+{overflow}</span>{/if}
      </span>
      {#if fraction}<span class="pcard-frac">{fraction}</span>{/if}
    </span>

    {#if needsName}
      <span class="pcard-alert"><TriangleAlert size={14} strokeWidth={2.2} /> Needs a name at the door</span>
    {/if}
    {#if watcher}
      <span class="pcard-watch">{watcher} is helping this party</span>
    {/if}
  </span>

</button>

<style>
  .pcard {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    min-height: 72px;
    padding: 12px 14px;
    text-align: left;
    color: var(--g26-text);
    background: var(--g26-surface-1);
    border: 0;
    border-bottom: 1px solid var(--g26-line);
    border-left: 4px solid transparent;
    cursor: pointer;
    font-family: var(--g26-sans);
  }
  .pcard:active {
    background: var(--g26-surface-3);
  }
  .pcard:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }
  .pcard--in .pcard-name {
    opacity: 0.72;
  }
  .pcard--flag {
    border-left-color: var(--g26-alert);
  }

  .pcard-main {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .pcard-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .pcard-name {
    font-size: 19px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--g26-cream);
    overflow-wrap: anywhere;
  }
  .pcard-many {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--g26-gold);
    border: 1px solid var(--g26-gold);
    border-radius: var(--g26-r-chip);
    white-space: nowrap;
  }

  .pcard-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .pcard-party {
    font-size: 13px;
    color: var(--g26-dim);
  }
  .pcard-tag {
    padding: 3px 7px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--g26-info);
    border: 1px solid rgb(140 196 236 / 0.45);
    border-radius: var(--g26-r-chip);
    white-space: nowrap;
  }
  .pcard-tag--gold {
    color: var(--g26-gold);
    border-color: rgb(255 189 89 / 0.55);
  }
  .pcard-tag--late {
    font-weight: 800;
  }
  .pcard-tag--quiet {
    color: var(--g26-dim);
    border-color: rgb(255 248 239 / 0.18);
    text-transform: capitalize;
  }

  .pcard-frac {
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-gold-soft);
  }

  .pcard-alert {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--g26-alert);
  }
  .pcard-watch {
    font-size: 12px;
    color: var(--g26-gold-soft);
  }

  .pcard-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }
  .pcard-slots {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .slot {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid rgb(255 248 239 / 0.35);
    border-radius: var(--g26-r-chip);
    color: var(--g26-ink);
    font-size: 11px;
    font-weight: 800;
  }
  .slot--in {
    background: var(--g26-ok);
    border-color: var(--g26-ok);
  }
  .slot--busy {
    border-color: var(--g26-gold);
    border-style: dashed;
  }
  .slot--more {
    color: var(--g26-dim);
  }
</style>
