<!--
  Two tabs in one drawer: everything the plan is unhappy about, and what the
  other planners have been doing. The activity tab is hidden offline, where
  there is nobody else to hear from.
-->
<script>
  import { getContext } from "svelte";
  import { WARNING_TYPES } from "../../lib/galaSeating/model.js";
  import Sheet from "./Sheet.svelte";

  const { store, ui } = getContext("gala-seating");

  let tab = $state("warnings");
  let showDismissed = $state(false);
  let now = $state(Date.now());

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 20000);
    return () => clearInterval(id);
  });

  const open = $derived(ui.panel === "warnings");
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

  function focusWarning(w) {
    const plan = store.plan;
    const guestId = w.guestIds?.[0];
    const tableId = w.tableIds?.[0] || (guestId ? plan.seating[guestId]?.tableId : null);
    if (guestId && plan.seating[guestId]) ui.findOnFloor(guestId);
    else if (tableId) {
      const t = plan.tables.find((x) => x.id === tableId);
      if (t) ui.centerOn(t.x, t.y);
    }
    if (guestId) ui.openGuest(guestId);
    else if (tableId) ui.openTable(tableId);
  }

  function focusActivity(entry) {
    if (!entry.focus) return;
    if (entry.focus.guestId) {
      ui.openGuest(entry.focus.guestId);
      ui.findOnFloor(entry.focus.guestId);
    } else if (entry.focus.tableId) {
      const t = store.plan.tables.find((x) => x.id === entry.focus.tableId);
      if (t) ui.centerOn(t.x, t.y);
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
    const h = Math.round(m / 60);
    return `${h} h ago`;
  }
</script>

{#if open}
  <Sheet eyebrow="Review" title={tab === "warnings" ? "Warnings" : "Activity"} wide onclose={() => (ui.panel = "none")}>
    {#snippet children()}
      <div class="wp">
        {#if !store.isLocalOnly}
          <div class="wp-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "warnings"}
              class="wp-tab"
              class:wp-tab--on={tab === "warnings"}
              onclick={() => (tab = "warnings")}
            >
              Warnings <span>{warnings.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "activity"}
              class="wp-tab"
              class:wp-tab--on={tab === "activity"}
              onclick={() => (tab = "activity")}
            >
              Activity <span>{store.activity.length}</span>
            </button>
          </div>
        {/if}

        {#if tab === "warnings" || store.isLocalOnly}
          {#if !warnings.length}
            <p class="wp-none">Nothing to flag. Every seat agrees with the notes.</p>
          {/if}
          {#each grouped as bucket (bucket.severity + bucket.type)}
            <section class="wp-group" data-sev={bucket.severity}>
              <h3>
                {WARNING_TYPES[bucket.type] || bucket.type}
                <span class="wp-n">{bucket.items.length}</span>
              </h3>
              <ul>
                {#each bucket.items as w (w.key)}
                  <li>
                    <button type="button" class="wp-msg" onclick={() => focusWarning(w)}>
                      {w.message}
                      {#if w.detail}<small>{w.detail}</small>{/if}
                    </button>
                    <button type="button" class="gs-linkbtn wp-dismiss" onclick={() => store.dismissWarning(w.key)}>
                      Dismiss
                    </button>
                  </li>
                {/each}
              </ul>
            </section>
          {/each}

          {#if dismissed.length}
            <div class="wp-dismissed">
              <button type="button" class="gs-linkbtn" onclick={() => (showDismissed = !showDismissed)}>
                {showDismissed ? "Hide" : "Show"} {dismissed.length} dismissed
              </button>
              {#if showDismissed}
                <ul>
                  {#each dismissed as w (w.key)}
                    <li>
                      <span>{w.message}</span>
                      <button type="button" class="gs-linkbtn" onclick={() => store.restoreWarning(w.key)}>Restore</button>
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
          {/if}
        {:else}
          {#if !store.activity.length}
            <p class="wp-none">Nothing has happened yet in this session.</p>
          {/if}
          <ul class="wp-feed">
            {#each store.activity as entry (entry.id)}
              <li>
                <span class="wp-who" style={`background:${entry.mine ? "#B9842F" : entry.color}`}></span>
                <button type="button" class="wp-act" onclick={() => focusActivity(entry)} disabled={!entry.focus}>
                  {entry.text}
                  <small>
                    {ago(entry.at)}
                    {#if entry.collided}<em class="wp-overlap">overlapped with your change</em>{/if}
                  </small>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/snippet}
  </Sheet>
{/if}

<style>
  .wp-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 14px;
    border-bottom: 1px solid rgba(23, 32, 44, 0.16);
  }
  .wp-tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: 8px 10px;
    font: inherit;
    font-size: 12.5px;
    color: #6a7280;
    cursor: pointer;
  }
  .wp-tab span {
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
    margin-left: 4px;
  }
  .wp-tab--on {
    color: var(--gs-ink);
    border-bottom-color: var(--gs-gold);
    font-weight: 700;
  }
  .wp-none {
    margin: 10px 0;
    font-size: 13px;
    color: #78818f;
    line-height: 1.55;
  }
  .wp-group {
    margin-bottom: 16px;
  }
  .wp-group h3 {
    margin: 0 0 6px;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #8a6a24;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .wp-group[data-sev="error"] h3 {
    color: #8c2f22;
  }
  .wp-n {
    font-variant-numeric: tabular-nums;
  }
  .wp-group ul,
  .wp-feed,
  .wp-dismissed ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .wp-group li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 0 6px 10px;
    border-left: 3px solid var(--gs-warn);
    margin-bottom: 4px;
    background: rgba(226, 163, 60, 0.1);
  }
  .wp-group[data-sev="error"] li {
    border-left-color: var(--gs-error);
    background: rgba(224, 106, 90, 0.1);
  }
  .wp-group[data-sev="info"] li {
    border-left-color: #8794a5;
    background: rgba(135, 148, 165, 0.1);
  }
  .wp-msg {
    flex: 1 1 auto;
    text-align: left;
    background: none;
    border: none;
    padding: 2px 0;
    font: inherit;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--gs-ink);
    cursor: pointer;
  }
  .wp-msg:hover {
    text-decoration: underline;
  }
  .wp-msg small,
  .wp-act small {
    display: block;
    font-size: 11px;
    color: #78818f;
    margin-top: 2px;
  }
  .wp-dismiss {
    flex: 0 0 auto;
    font-size: 11.5px;
    color: #8a5700;
    padding-right: 6px;
  }
  .wp-dismissed {
    margin-top: 18px;
    border-top: 1px solid rgba(23, 32, 44, 0.14);
    padding-top: 10px;
    font-size: 12.5px;
  }
  .wp-dismissed li {
    display: flex;
    gap: 8px;
    justify-content: space-between;
    align-items: baseline;
    padding: 5px 0;
    color: #6a7280;
  }
  .wp-feed li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(23, 32, 44, 0.08);
  }
  .wp-who {
    flex: 0 0 auto;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    margin-top: 5px;
  }
  .wp-act {
    flex: 1 1 auto;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 12.5px;
    line-height: 1.45;
    color: var(--gs-ink);
    cursor: pointer;
  }
  .wp-act:disabled {
    cursor: default;
  }
  .wp-act:hover:not(:disabled) {
    text-decoration: underline;
  }
  .wp-overlap {
    display: inline-block;
    margin-left: 6px;
    font-style: normal;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #8a5700;
    border: 1px solid rgba(185, 132, 47, 0.6);
    background: rgba(255, 189, 89, 0.28);
    border-radius: 2px;
    padding: 1px 4px;
  }
</style>
