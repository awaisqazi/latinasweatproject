<!--
  What the other desks have been doing, newest first.

  The log the server sends carries guest IDS, never names: names are looked up
  in this device's own list. Rows the volunteer cannot act on (the no-op that
  happens when two devices check the same guest in) are hidden, because the
  server already turned that into a friendly card for whoever tapped.
-->
<script>
  import { getContext } from "svelte";
  import { clockTime } from "../../lib/galaCheckin/derive.js";

  const { store } = getContext("gala-checkin");

  function names(ids) {
    const list = (ids || []).map((id) => store.guestsById[id]?.name).filter(Boolean);
    if (!list.length) return "a guest";
    if (list.length <= 2) return list.join(" and ");
    return `${list[0]} and ${list.length - 1} more`;
  }

  function line(row) {
    const who = row.actor || "Someone";
    const paddle = row.paddle_number == null ? "" : ` · paddle ${row.paddle_number}`;
    switch (row.kind) {
      case "checkin": return `${who} checked in ${names(row.guest_ids)}${paddle}`;
      case "walkin": return `${who} added ${names(row.guest_ids)} at the door${paddle}`;
      case "undo": return `${who} undid the check-in for ${names(row.guest_ids)}`;
      case "paddle_assign": return `${who} gave ${names(row.guest_ids)} paddle ${row.paddle_number}`;
      case "paddle_swap": return row.detail?.from != null
        ? `${who} retired paddle ${row.detail.from} and gave ${names(row.guest_ids)} paddle ${row.paddle_number}`
        : `${who} gave ${names(row.guest_ids)} a new paddle ${row.paddle_number}`;
      case "paddle_release": return `${who} put paddle ${row.paddle_number} back in the box`;
      case "group_set": return row.detail?.outcome === "joined"
        ? `${who} put ${names(row.guest_ids)} on a shared paddle`
        : `${who} gave ${names(row.guest_ids)} a paddle of their own`;
      case "guest_update": return `${who} edited ${names(row.guest_ids)}`;
      case "pool": return `${who} set up the paddle box`;
      case "import": return "The guest list was refreshed";
      default: return `${who} made a change`;
    }
  }

  const rows = $derived([...store.log].filter((l) => l.kind !== "checkin_noop").reverse().slice(0, 40));
  const collisions = $derived(store.log.filter((l) => l.kind === "checkin_noop").length);
</script>

<div class="af">
  {#if collisions > 0}
    <p class="af-note">{collisions} double tap{collisions === 1 ? "" : "s"} caught by the server tonight. No duplicate paddles.</p>
  {/if}
  {#if rows.length === 0}
    <p class="af-empty">Nothing has happened yet.</p>
  {:else}
    <ol class="af-list">
      {#each rows as row (row.id)}
        <li class="af-row">
          <span class="af-time">{clockTime(row.at)}</span>
          <span class="af-text">{line(row)}</span>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .af-note {
    margin: 0 0 10px;
    font-size: 14px;
    font-weight: 700;
    color: var(--g26-ok);
  }
  .af-empty {
    margin: 0;
    font-size: 15px;
    color: var(--g26-dim);
  }
  .af-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
  }
  .af-row {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 10px;
    padding: 11px 0;
    border-bottom: 1px solid var(--g26-line);
    font-size: 15px;
    line-height: 1.45;
  }
  .af-time {
    font-weight: 800;
    font-variant-numeric: tabular-nums lining-nums;
    color: var(--g26-gold-soft);
  }
  .af-text {
    color: var(--g26-text);
    overflow-wrap: anywhere;
  }
</style>
