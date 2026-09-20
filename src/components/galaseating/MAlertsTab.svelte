<!--
  The Alerts tab: everything the plan is unhappy about, and what the other
  planners have been doing about it.

  Each warning gets the two things a planner wants: take me there, or stop
  telling me. Activity is hidden when there is nobody else in the room.
-->
<script>
  import { getContext } from "svelte";
  import { WARNING_TYPES } from "../../lib/galaSeating/model.js";

  let { nav, onshow = () => {} } = $props();
  const { store, ui } = getContext("gala-seating");

  let tab = $state("warnings");
  let showDismissed = $state(false);
  let now = $state(Date.now());

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 20000);
    return () => clearInterval(id);
  });

  const warnings = $derived(store.warnings.all || []);
  const dismissed = $derived(store.dismissedWarnings || []);

  const grouped = $derived.by(() => {
    const order = { error: 0, warn: 1, info: 2 };
    const buckets = new Map();
    for (const w of [...warnings].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))) {
      const key = `${w.severity}|${w.type}`;
      if (!buckets.has(key)) buckets.set(key, { severity: w.severity, type: w.type, items: [] });
      buckets.get(key).items.push(w);
    }
    return [...buckets.values()];
  });

  function showWarning(w) {
    const plan = store.plan;
    const guestId = w.guestIds?.[0];
    const tableId = w.tableIds?.[0] || (guestId ? plan.seating[guestId]?.tableId : null);
    if (guestId && plan.seating[guestId]) {
      onshow(guestId);
      return;
    }
    if (guestId) {
      ui.openGuest(guestId);
      return;
    }
    if (tableId) ui.openTable(tableId);
  }

  function showActivity(entry) {
    if (!entry.focus) return;
    if (entry.focus.guestId) {
      if (store.plan.seating[entry.focus.guestId]) onshow(entry.focus.guestId);
      else ui.openGuest(entry.focus.guestId);
    } else if (entry.focus.tableId) {
      ui.openTable(entry.focus.tableId);
    }
  }

  function ago(at) {
    const ms = now - new Date(at).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "just now";
    const s = Math.round(ms / 1000);
    if (s < 60) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    return `${Math.round(m / 60)} h ago`;
  }
</script>

<div class="mal">
  <div class="mal-head">
    {#if !store.isLocalOnly}
      <div class="mal-seg" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "warnings"}
          class="mal-segbtn"
          class:mal-segbtn--on={tab === "warnings"}
          onclick={() => (tab = "warnings")}
        >
          Warnings<span class="mal-segn">{warnings.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "activity"}
          class="mal-segbtn"
          class:mal-segbtn--on={tab === "activity"}
          onclick={() => (tab = "activity")}
        >
          Activity<span class="mal-segn">{store.activity.length}</span>
        </button>
      </div>
    {:else}
      <p class="mal-lead">
        {warnings.length === 0
          ? "Nothing to flag."
          : `${warnings.length} ${warnings.length === 1 ? "thing" : "things"} to look at.`}
      </p>
    {/if}
  </div>

  <div class="mal-body gs-scroll">
    {#if tab === "warnings" || store.isLocalOnly}
      {#if !warnings.length}
        <p class="mal-none">Nothing to flag. Every seat agrees with the notes.</p>
      {/if}
      {#each grouped as bucket (bucket.severity + bucket.type)}
        <section class="mal-group" data-sev={bucket.severity}>
          <h3>
            {WARNING_TYPES[bucket.type] || bucket.type}
            <span>{bucket.items.length}</span>
          </h3>
          <ul>
            {#each bucket.items as w (w.key)}
              <li>
                <p class="mal-msg">
                  {w.message}
                  {#if w.detail}<small>{w.detail}</small>{/if}
                </p>
                <div class="mal-acts">
                  <button type="button" class="mal-act mal-act--gold" onclick={() => showWarning(w)}>Show</button>
                  <button type="button" class="mal-act" onclick={() => store.dismissWarning(w.key)}>Dismiss</button>
                </div>
              </li>
            {/each}
          </ul>
        </section>
      {/each}

      {#if dismissed.length}
        <div class="mal-dismissed">
          <button type="button" class="mal-act" onclick={() => (showDismissed = !showDismissed)}>
            {showDismissed ? "Hide" : "Show"} {dismissed.length} dismissed
          </button>
          {#if showDismissed}
            <ul>
              {#each dismissed as w (w.key)}
                <li>
                  <span>{w.message}</span>
                  <button type="button" class="mal-act" onclick={() => store.restoreWarning(w.key)}>Restore</button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    {:else}
      {#if !store.activity.length}
        <p class="mal-none">Nothing has happened yet in this session.</p>
      {/if}
      <ul class="mal-feed">
        {#each store.activity as entry (entry.id)}
          <li>
            <span class="mal-who" style={`background:${entry.mine ? "#B9842F" : entry.color}`}></span>
            <button type="button" class="mal-actrow" onclick={() => showActivity(entry)} disabled={!entry.focus}>
              {entry.text}
              <small>
                {ago(entry.at)}
                {#if entry.collided}<em>overlapped with your change</em>{/if}
              </small>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="mal-tailpad" aria-hidden="true"></div>
  </div>
</div>

<style>
  .mal {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: #0a111d;
  }
  .mal-head {
    flex: 0 0 auto;
    padding: 9px 10px;
    border-bottom: 1px solid rgba(228, 201, 138, 0.16);
    background: rgba(9, 15, 26, 0.98);
  }
  .mal-lead {
    margin: 0;
    font-size: 13px;
    color: var(--gs-dim);
  }
  .mal-seg {
    display: flex;
    border: 1px solid rgba(228, 201, 138, 0.28);
    border-radius: 3px;
    overflow: hidden;
  }
  .mal-segbtn {
    flex: 1 1 0;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.02);
    border: none;
    border-right: 1px solid rgba(228, 201, 138, 0.18);
    color: var(--gs-dim);
    font: inherit;
    font-size: 13.5px;
    cursor: pointer;
  }
  .mal-segbtn:last-child {
    border-right: none;
  }
  .mal-segbtn--on {
    background: rgba(255, 189, 89, 0.18);
    color: var(--gs-cream);
    font-weight: 700;
  }
  .mal-segn {
    font-size: 11.5px;
    opacity: 0.8;
    font-variant-numeric: tabular-nums;
  }

  .mal-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 10px 12px;
  }
  .mal-tailpad {
    height: 20px;
  }
  .mal-none {
    padding: 26px 4px;
    text-align: center;
    color: #8f9bab;
    font-size: 14px;
    line-height: 1.55;
  }
  .mal-group {
    margin-bottom: 18px;
  }
  .mal-group h3 {
    margin: 0 0 7px;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--gs-gold-soft);
  }
  .mal-group[data-sev="error"] h3 {
    color: #ffb4a6;
  }
  .mal-group ul,
  .mal-feed,
  .mal-dismissed ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .mal-group li {
    padding: 10px 11px;
    margin-bottom: 8px;
    border-left: 3px solid var(--gs-warn);
    background: rgba(226, 163, 60, 0.1);
  }
  .mal-group[data-sev="error"] li {
    border-left-color: var(--gs-error);
    background: rgba(224, 106, 90, 0.11);
  }
  .mal-group[data-sev="info"] li {
    border-left-color: #8794a5;
    background: rgba(135, 148, 165, 0.1);
  }
  .mal-msg {
    margin: 0 0 8px;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--gs-text);
  }
  .mal-msg small {
    display: block;
    margin-top: 3px;
    font-size: 12px;
    color: #98a4b3;
  }
  .mal-acts {
    display: flex;
    gap: 8px;
  }
  .mal-act {
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid rgba(228, 201, 138, 0.35);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--gs-text);
    font: inherit;
    font-size: 13.5px;
    cursor: pointer;
  }
  .mal-act:active {
    background: rgba(255, 189, 89, 0.24);
  }
  .mal-act--gold {
    background: var(--gs-gold-bright);
    border-color: var(--gs-gold-bright);
    color: #17202c;
    font-weight: 700;
  }
  .mal-dismissed {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(228, 201, 138, 0.16);
  }
  .mal-dismissed li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 0;
    font-size: 13px;
    color: #98a4b3;
  }
  .mal-feed li {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 9px 0;
    border-bottom: 1px solid rgba(228, 201, 138, 0.1);
  }
  .mal-who {
    flex: 0 0 auto;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-top: 6px;
  }
  .mal-actrow {
    flex: 1 1 auto;
    min-height: 44px;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--gs-text);
    cursor: pointer;
  }
  .mal-actrow:disabled {
    cursor: default;
  }
  .mal-actrow small {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    color: #98a4b3;
  }
  .mal-actrow em {
    display: inline-block;
    margin-left: 6px;
    font-style: normal;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--gs-gold-soft);
    border: 1px solid rgba(228, 201, 138, 0.5);
    border-radius: 2px;
    padding: 1px 4px;
  }
</style>
