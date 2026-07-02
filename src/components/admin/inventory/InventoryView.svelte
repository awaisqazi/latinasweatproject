<script>
  import { onMount } from "svelte";
  import {
    AlertTriangle,
    Boxes,
    ClipboardList,
    Package,
    Plus,
    TrendingDown,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import { getSetting } from "../../../lib/dashboard/appSettings";
  import InventoryTrendChart from "./InventoryTrendChart.svelte";

  export let supabase;
  export let profile = null;
  export let refreshKey = 0;

  const MS_PER_DAY = 86400000;
  const CONSUMPTION_WINDOW_DAYS = 30;

  // Fixed 8-color palette, assigned to items by index.
  const PALETTE = [
    "#d946ef", // fuchsia-500
    "#0891b2", // cyan-600
    "#2563eb", // blue-600
    "#6366f1", // indigo-500
    "#ef4444", // red-500
    "#0d9488", // teal-600
    "#f59e0b", // amber-500
    "#64748b", // slate-500
  ];

  const RANGE_TABS = [
    { id: "1w", label: "1W" },
    { id: "30d", label: "30D" },
    { id: "3m", label: "3M" },
    { id: "12m", label: "12M" },
  ];
  const RANGE_DAYS = { "1w": 7, "30d": 30, "3m": 92, "12m": 366 };

  // ---- Loaded state ------------------------------------------------------
  let items = []; // all items, any active state, sorted by sort_order
  let logs = []; // last 366 days, newest first, with nested line items
  let alertRecipients = []; // resolved profile rows for the "alerts go to" note
  let isLoading = true;
  let errorMessage = "";
  let lastRefreshKey = refreshKey;

  // ---- UI state ----------------------------------------------------------
  let chartRange = "30d";
  // Set of itemIds whose lines are hidden in the chart (empty = all shown).
  let hiddenItemIds = new Set();
  let historyLimit = 20;

  // Manage-items form
  let showAddForm = false;
  let addName = "";
  let addUnit = "";
  let addThreshold = 0;
  let addSort = 0;
  let addSaving = false;
  let addError = "";

  // Per-row edit drafts, keyed by item id. Built from `items` on load.
  let itemDrafts = {};
  let rowSavingId = "";
  let rowError = "";

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadAll();
  }

  onMount(loadAll);

  async function loadAll() {
    if (!supabase) return;
    isLoading = true;
    errorMessage = "";

    const sinceIso = new Date(Date.now() - 366 * MS_PER_DAY).toISOString();

    const [itemsRes, logsRes, settingRes] = await Promise.all([
      supabase
        .from("inventory_items")
        .select("id, name, unit, low_threshold, sort_order, active, created_at, updated_at")
        .order("sort_order", { ascending: true }),
      supabase
        .from("inventory_logs")
        .select(
          "id, coordinator_name, notes, source, created_at, inventory_log_items(item_id, quantity, previous_quantity)",
        )
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false }),
      getSetting(supabase, "inventory_alert_recipients"),
    ]);

    const firstError = itemsRes.error || logsRes.error || settingRes.error;
    if (firstError) errorMessage = firstError.message;

    if (!itemsRes.error) {
      items = itemsRes.data || [];
      itemDrafts = buildDrafts(items);
    }
    if (!logsRes.error) logs = logsRes.data || [];

    // Resolve alert recipient profile ids -> names.
    const ids = Array.isArray(settingRes.value) ? settingRes.value : [];
    if (ids.length) {
      const profRes = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      alertRecipients = profRes.error ? [] : profRes.data || [];
    } else {
      alertRecipients = [];
    }

    isLoading = false;
  }

  function buildDrafts(list) {
    const drafts = {};
    for (const item of list) {
      drafts[item.id] = {
        name: item.name ?? "",
        unit: item.unit ?? "",
        low_threshold: item.low_threshold ?? 0,
        sort_order: item.sort_order ?? 0,
      };
    }
    return drafts;
  }

  // ---- Derived: per-item log history (chronological, oldest first) -------
  // logsByItem[itemId] = [{ t (ms), qty, prev, logId }] ascending by time.
  $: logsByItem = buildLogsByItem(logs);

  function buildLogsByItem(allLogs) {
    const map = {};
    // allLogs is newest-first; iterate to collect, then sort ascending.
    for (const log of allLogs) {
      const t = new Date(log.created_at).getTime();
      const lineItems = log.inventory_log_items || [];
      for (const li of lineItems) {
        if (!map[li.item_id]) map[li.item_id] = [];
        map[li.item_id].push({
          t,
          qty: Number(li.quantity),
          prev: li.previous_quantity == null ? null : Number(li.previous_quantity),
          logId: log.id,
        });
      }
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.t - b.t);
    }
    return map;
  }

  // ---- Current-stock rows (active items) ---------------------------------
  $: activeItems = items.filter((item) => item.active);

  function latestEntry(history) {
    if (!history || !history.length) return null;
    return history[history.length - 1];
  }

  // Average daily consumption over the consumption window. Only DECREASES
  // between consecutive logs count (increases are restocks). Returns null
  // when there's no consumption data to base an estimate on.
  function avgDailyConsumption(history, nowMs) {
    if (!history || history.length < 2) return null;
    const windowStart = nowMs - CONSUMPTION_WINDOW_DAYS * MS_PER_DAY;
    const inWindow = history.filter((entry) => entry.t >= windowStart);
    if (inWindow.length < 2) return null;

    let consumed = 0;
    for (let i = 1; i < inWindow.length; i += 1) {
      const drop = inWindow[i - 1].qty - inWindow[i].qty;
      if (drop > 0) consumed += drop; // decrease only; ignore restocks
    }
    if (consumed <= 0) return null;

    const spanMs = inWindow[inWindow.length - 1].t - inWindow[0].t;
    const spanDays = spanMs / MS_PER_DAY;
    if (spanDays <= 0) return null; // guard divide-by-zero / single instant

    return consumed / spanDays;
  }

  // Estimated days of stock left. Returns { days, tone } or null.
  function daysLeft(history, currentQty, nowMs) {
    const rate = avgDailyConsumption(history, nowMs);
    if (rate == null || rate <= 0) return null;
    return currentQty / rate;
  }

  function statusFor(latest, threshold) {
    if (!latest) return { label: "No data", tone: "neutral" };
    if (latest.qty <= threshold) return { label: "Low", tone: "red" };
    return { label: "OK", tone: "green" };
  }

  // Build stock rows reactively. Everything is derived here (not read inside
  // a template-called helper) so legacy reactivity tracks it.
  $: nowMs = Date.now();
  $: stockRows = activeItems.map((item) => {
    const history = logsByItem[item.id] || [];
    const latest = latestEntry(history);
    const qty = latest ? latest.qty : null;
    const status = statusFor(latest, item.low_threshold ?? 0);
    const change =
      latest && latest.prev != null ? latest.qty - latest.prev : null;
    const est = qty == null ? null : daysLeft(history, qty, nowMs);
    return {
      id: item.id,
      name: item.name,
      unit: item.unit || "",
      threshold: item.low_threshold ?? 0,
      qty,
      status,
      change,
      est,
      lastT: latest ? latest.t : null,
    };
  });

  $: lowCount = stockRows.filter(
    (row) => row.qty != null && row.qty <= row.threshold,
  ).length;
  $: activeCount = activeItems.length;

  $: lastLog = logs.length ? logs[0] : null;
  $: logsLast30 = logs.filter(
    (log) => new Date(log.created_at).getTime() >= nowMs - 30 * MS_PER_DAY,
  ).length;

  // ---- Chart series ------------------------------------------------------
  // Color per item is fixed by its index in the full items list.
  $: colorByItemId = buildColorMap(items);

  function buildColorMap(list) {
    const map = {};
    list.forEach((item, i) => {
      map[item.id] = PALETTE[i % PALETTE.length];
    });
    return map;
  }

  // Chart items = items that have any log history (so the chip list is
  // meaningful), ordered like the items list.
  $: chartableItems = items.filter((item) => (logsByItem[item.id] || []).length);

  $: rangeStartMs = nowMs - RANGE_DAYS[chartRange] * MS_PER_DAY;
  $: rangeEndMs = nowMs;

  // Referenced directly so toggling re-computes; Set identity changes on toggle.
  $: chartSeries = buildChartSeries(
    chartableItems,
    logsByItem,
    colorByItemId,
    hiddenItemIds,
    rangeStartMs,
    rangeEndMs,
  );

  function buildChartSeries(list, byItem, colors, hidden, startMs, endMs) {
    const out = [];
    for (const item of list) {
      if (hidden.has(item.id)) continue;
      const history = byItem[item.id] || [];
      // Points within range, plus one carry-in point at rangeStart so the
      // line doesn't appear to begin mid-plot.
      const inRange = history.filter((e) => e.t >= startMs && e.t <= endMs);
      const before = history.filter((e) => e.t < startMs);
      const points = [];
      if (before.length) {
        points.push({ t: startMs, qty: before[before.length - 1].qty });
      }
      for (const e of inRange) points.push({ t: e.t, qty: e.qty });
      if (!points.length) continue; // no data in range for this item
      out.push({
        itemId: item.id,
        name: item.name,
        color: colors[item.id],
        threshold: item.low_threshold ?? 0,
        points,
      });
    }
    return out;
  }

  function toggleItem(itemId) {
    const next = new Set(hiddenItemIds);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    hiddenItemIds = next; // reassign for reactivity
  }

  // ---- History rows ------------------------------------------------------
  $: itemNameById = buildNameMap(items);

  function buildNameMap(list) {
    const map = {};
    for (const item of list) map[item.id] = item.name;
    return map;
  }

  $: visibleLogs = logs.slice(0, historyLimit);

  function chipDelta(line) {
    if (line.previous_quantity == null) return "";
    const delta = Number(line.quantity) - Number(line.previous_quantity);
    if (delta === 0) return " (0)";
    return delta > 0 ? ` (+${delta})` : ` (${delta})`;
  }

  // ---- Formatting helpers (pure; args passed at call site) ---------------
  function relativeTime(ms) {
    if (ms == null) return "Never";
    const diff = Date.now() - ms;
    if (diff < 60000) return "just now";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }

  function absoluteTime(ms) {
    if (ms == null) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  }

  function formatDaysLeft(est) {
    if (est == null) return "n/a";
    if (est < 1) return "<1 day";
    const rounded = Math.round(est);
    return `${rounded} day${rounded === 1 ? "" : "s"}`;
  }

  function changeLabel(change) {
    if (change == null) return "";
    if (change === 0) return "no change";
    return change > 0 ? `+${change}` : `${change}`;
  }

  // ---- Manage items: save / add / toggle ---------------------------------
  async function saveRow(itemId) {
    const draft = itemDrafts[itemId];
    if (!draft) return;
    rowError = "";
    const name = (draft.name || "").trim();
    if (!name) {
      rowError = "Name is required.";
      return;
    }
    const threshold = Math.max(0, parseInt(draft.low_threshold, 10) || 0);
    const sort = parseInt(draft.sort_order, 10) || 0;

    rowSavingId = itemId;
    const { error } = await supabase
      .from("inventory_items")
      .update({
        name,
        unit: (draft.unit || "").trim() || null,
        low_threshold: threshold,
        sort_order: sort,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId);
    rowSavingId = "";

    if (error) {
      rowError = error.message;
      return;
    }
    await loadAll();
  }

  async function toggleActive(item) {
    rowError = "";
    rowSavingId = item.id;
    const { error } = await supabase
      .from("inventory_items")
      .update({ active: !item.active, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    rowSavingId = "";
    if (error) {
      rowError = error.message;
      return;
    }
    await loadAll();
  }

  async function addItem() {
    addError = "";
    const name = addName.trim();
    if (!name) {
      addError = "Name is required.";
      return;
    }
    const threshold = Math.max(0, parseInt(addThreshold, 10) || 0);
    const sort = parseInt(addSort, 10) || 0;

    addSaving = true;
    const { error } = await supabase.from("inventory_items").insert({
      name,
      unit: addUnit.trim() || null,
      low_threshold: threshold,
      sort_order: sort,
      active: true,
    });
    addSaving = false;

    if (error) {
      addError = error.message;
      return;
    }
    addName = "";
    addUnit = "";
    addThreshold = 0;
    addSort = 0;
    showAddForm = false;
    await loadAll();
  }

  $: alertNames = alertRecipients
    .map((p) => p.full_name || p.email)
    .filter(Boolean)
    .join(", ");
</script>

<section class="space-y-4" aria-labelledby="inventory-title">
  <div class="flex flex-col gap-3 rounded-card border border-ink/8 bg-white p-4 shadow-card md:flex-row md:items-center md:justify-between md:p-5">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">
        End-of-shift supply counts, stock levels, and consumption trends
      </p>
      <h3 id="inventory-title" class="mt-1 text-2xl font-bold">Inventory</h3>
    </div>
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} onRetry={loadAll} />
  {/if}

  <!-- 1. Stat cards -->
  {#if isLoading}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {#each Array(4) as _, i (i)}
        <SkeletonCard lines={2} />
      {/each}
    </div>
  {:else}
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Items running low"
        value={lowCount}
        icon={AlertTriangle}
        tone={lowCount > 0 ? "rose" : "teal"}
        hint={lowCount === 0 ? "All stocked" : "At or below threshold"}
      />
      <StatCard label="Active items" value={activeCount} icon={Boxes} tone="neutral" />
      <StatCard
        label="Last log"
        value={lastLog ? relativeTime(new Date(lastLog.created_at).getTime()) : "None"}
        hint={lastLog ? lastLog.coordinator_name || "" : "No counts submitted"}
        icon={ClipboardList}
        tone="gold"
      />
      <StatCard label="Logs, last 30 days" value={logsLast30} icon={ClipboardList} tone="teal" />
    </div>
  {/if}

  <!-- 2. Current stock -->
  <Panel title="Current stock" id="inventory-stock-title">
    {#if isLoading}
      <SkeletonCard lines={4} />
    {:else if !stockRows.length}
      <EmptyState
        title="No active items yet"
        message="Add supply items below so coordinators can log counts."
        icon={Package}
      />
    {:else}
      <div class="thin-scroll overflow-x-auto">
        <table class="w-full text-left text-sm" style="min-width:720px">
          <thead>
            <tr class="border-b border-ink/10 bg-canvas/70">
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Item</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">On hand</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Low at</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Status</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Last change</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Est. days left</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Updated</th>
            </tr>
          </thead>
          <tbody>
            {#each stockRows as row (row.id)}
              {@const restock = row.est != null && row.est <= 3}
              <tr class="border-b border-ink/6 last:border-b-0">
                <td class="px-3 py-3 align-middle font-semibold text-ink">{row.name}</td>
                <td class="px-3 py-3 align-middle tabular-nums text-ink/85">
                  {#if row.qty == null}
                    <span class="text-ink/40">–</span>
                  {:else}
                    {row.qty}{#if row.unit}<span class="text-ink/45"> {row.unit}</span>{/if}
                  {/if}
                </td>
                <td class="px-3 py-3 align-middle tabular-nums text-ink/60">{row.threshold}</td>
                <td class="px-3 py-3 align-middle">
                  <Badge tone={row.status.tone} size="xs" dot>{row.status.label}</Badge>
                </td>
                <td class="px-3 py-3 align-middle tabular-nums">
                  {#if row.change == null}
                    <span class="text-ink/40">–</span>
                  {:else if row.change === 0}
                    <span class="text-ink/50">no change</span>
                  {:else if row.change < 0}
                    <span class="font-semibold text-red-600">{changeLabel(row.change)}</span>
                  {:else}
                    <span class="font-semibold text-green-700">{changeLabel(row.change)}</span>
                  {/if}
                </td>
                <!-- Killer feature: estimated days left, made prominent. -->
                <td class="px-3 py-3 align-middle">
                  {#if row.est == null}
                    <span class="text-xs text-ink/40">n/a</span>
                  {:else if restock}
                    <span class="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                      <TrendingDown class="h-3.5 w-3.5" aria-hidden="true" />
                      Restock now · {formatDaysLeft(row.est)}
                    </span>
                  {:else}
                    <span class="text-sm font-bold tabular-nums text-ink">{formatDaysLeft(row.est)}</span>
                  {/if}
                </td>
                <td class="px-3 py-3 align-middle text-xs text-ink/55">
                  {row.lastT == null ? "Never" : relativeTime(row.lastT)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-ink/45">
        Estimated days left uses average daily use over the last {CONSUMPTION_WINDOW_DAYS} days, counting only decreases between logs. Restocks do not shorten the estimate.
      </p>
    {/if}
  </Panel>

  <!-- 3. Trend chart -->
  <Panel title="Consumption trend" id="inventory-trend-title">
    <div slot="actions">
      <Tabs
        tabs={RANGE_TABS}
        bind:active={chartRange}
        variant="segmented"
        label="Trend date range"
        hasPanels={false}
      />
    </div>

    {#if isLoading}
      <SkeletonCard lines={5} />
    {:else if !chartableItems.length}
      <EmptyState
        title="No logs yet"
        message="Once coordinators submit end-of-shift counts, trends show up here."
        icon={TrendingDown}
      />
    {:else}
      <!-- Item filter chips: one per chartable item, carrying its line color. -->
      <div class="mb-4 flex flex-wrap gap-2">
        {#each chartableItems as item (item.id)}
          {@const on = !hiddenItemIds.has(item.id)}
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors {on ? 'border-ink/15 bg-white text-ink shadow-card' : 'border-ink/10 bg-ink/[0.03] text-ink/40'}"
            aria-pressed={on}
            onclick={() => toggleItem(item.id)}
          >
            <span
              class="h-2.5 w-2.5 rounded-full"
              style="background-color: {colorByItemId[item.id]}; opacity: {on ? 1 : 0.35}"
              aria-hidden="true"
            ></span>
            {item.name}
          </button>
        {/each}
      </div>

      {#if chartSeries.length}
        <InventoryTrendChart
          series={chartSeries}
          rangeStart={rangeStartMs}
          rangeEnd={rangeEndMs}
          rangeId={chartRange}
        />
      {:else}
        <EmptyState
          title="Nothing to chart"
          message="No logs in this range, or all items are toggled off. Widen the range or turn an item back on."
          icon={TrendingDown}
        />
      {/if}
    {/if}
  </Panel>

  <!-- 4. History -->
  <Panel title="Recent submissions" id="inventory-history-title">
    {#if isLoading}
      <SkeletonCard lines={4} />
    {:else if !logs.length}
      <EmptyState title="No submissions yet" message="End-of-shift counts will appear here." icon={ClipboardList} />
    {:else}
      <div class="space-y-2">
        {#each visibleLogs as log (log.id)}
          {@const logMs = new Date(log.created_at).getTime()}
          <div class="rounded-control border border-ink/8 bg-white px-4 py-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-bold text-ink">{log.coordinator_name || "Unknown"}</span>
              <Badge tone={log.source === "admin" ? "blue" : "neutral"} size="xs">
                {log.source === "admin" ? "Admin" : "Form"}
              </Badge>
              <span class="text-xs text-ink/50" title={absoluteTime(logMs)}>
                {relativeTime(logMs)} · {absoluteTime(logMs)}
              </span>
            </div>
            {#if log.notes}
              <p class="mt-1.5 text-sm text-ink/70">{log.notes}</p>
            {/if}
            {#if log.inventory_log_items && log.inventory_log_items.length}
              <div class="mt-2 flex flex-wrap gap-1.5">
                {#each log.inventory_log_items as line (line.item_id)}
                  <span class="inline-flex items-center gap-1 rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs text-ink/75">
                    <span class="font-semibold text-ink">{itemNameById[line.item_id] || "Item"}</span>
                    <span class="tabular-nums">{line.quantity}</span>
                    {#if line.previous_quantity != null && Number(line.quantity) !== Number(line.previous_quantity)}
                      <span class="tabular-nums {Number(line.quantity) < Number(line.previous_quantity) ? 'text-red-600' : 'text-green-700'}">{chipDelta(line)}</span>
                    {/if}
                  </span>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
      {#if logs.length > historyLimit}
        <div class="mt-3 flex justify-center">
          <Button variant="secondary" size="sm" onclick={() => (historyLimit += 20)}>
            Show more ({logs.length - historyLimit} more)
          </Button>
        </div>
      {/if}
    {/if}
  </Panel>

  <!-- 5. Manage items -->
  <Panel title="Manage items" id="inventory-manage-title">
    <div slot="actions">
      <Button variant="primary" size="sm" icon={Plus} onclick={() => (showAddForm = !showAddForm)}>
        Add item
      </Button>
    </div>

    {#if rowError}
      <Banner tone="error" message={rowError} class="mb-3" onDismiss={() => (rowError = "")} />
    {/if}

    {#if showAddForm}
      <form
        class="mb-4 grid gap-3 rounded-control border border-ink/10 bg-canvas/50 p-4 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto]"
        onsubmit={(e) => {
          e.preventDefault();
          addItem();
        }}
      >
        <Field label="Name" id="add-name" required>
          <input id="add-name" class="input" bind:value={addName} placeholder="Toilet paper" />
        </Field>
        <Field label="Unit" id="add-unit">
          <input id="add-unit" class="input" bind:value={addUnit} placeholder="rolls" />
        </Field>
        <Field label="Low at" id="add-threshold">
          <input id="add-threshold" type="number" min="0" class="input" bind:value={addThreshold} />
        </Field>
        <Field label="Sort" id="add-sort">
          <input id="add-sort" type="number" class="input" bind:value={addSort} />
        </Field>
        <div class="flex items-end">
          <Button type="submit" variant="primary" loading={addSaving}>Save</Button>
        </div>
        {#if addError}
          <p class="text-xs font-medium text-red-700 sm:col-span-2 xl:col-span-5" role="alert">{addError}</p>
        {/if}
      </form>
    {/if}

    {#if isLoading}
      <SkeletonCard lines={5} />
    {:else if !items.length}
      <EmptyState title="No items" message="Add your first supply item to get started." icon={Package} />
    {:else}
      <div class="thin-scroll overflow-x-auto">
        <table class="w-full text-left text-sm" style="min-width:760px">
          <thead>
            <tr class="border-b border-ink/10 bg-canvas/70">
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Name</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Unit</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Low at</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Sort</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Active</th>
              <th scope="col" class="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Save</th>
            </tr>
          </thead>
          <tbody>
            {#each items as item (item.id)}
              <tr class="border-b border-ink/6 last:border-b-0 {item.active ? '' : 'opacity-60'}">
                <td class="px-3 py-2.5 align-middle">
                  <input class="input h-9" bind:value={itemDrafts[item.id].name} aria-label="Name for {item.name}" />
                </td>
                <td class="px-3 py-2.5 align-middle">
                  <input class="input h-9 w-24" bind:value={itemDrafts[item.id].unit} aria-label="Unit for {item.name}" />
                </td>
                <td class="px-3 py-2.5 align-middle">
                  <input type="number" min="0" class="input h-9 w-20" bind:value={itemDrafts[item.id].low_threshold} aria-label="Low threshold for {item.name}" />
                </td>
                <td class="px-3 py-2.5 align-middle">
                  <input type="number" class="input h-9 w-20" bind:value={itemDrafts[item.id].sort_order} aria-label="Sort order for {item.name}" />
                </td>
                <td class="px-3 py-2.5 align-middle">
                  <button
                    type="button"
                    class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-colors {item.active ? 'bg-green-50 text-green-800' : 'bg-ink/[0.06] text-ink/60'}"
                    aria-pressed={item.active}
                    disabled={rowSavingId === item.id}
                    onclick={() => toggleActive(item)}
                  >
                    <span class="h-1.5 w-1.5 rounded-full {item.active ? 'bg-green-600' : 'bg-ink/40'}" aria-hidden="true"></span>
                    {item.active ? "Active" : "Hidden"}
                  </button>
                </td>
                <td class="px-3 py-2.5 align-middle text-right">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={rowSavingId === item.id}
                    onclick={() => saveRow(item.id)}
                  >
                    Save
                  </Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-ink/45">
        Deactivating an item hides it from the public form but keeps its history. Items are never deleted.
      </p>
    {/if}
  </Panel>

  <!-- 6. Alerts note -->
  {#if !isLoading}
    <p class="px-1 text-xs text-ink/50">
      {#if alertNames}
        Low-stock alerts go to: {alertNames}.
      {:else}
        No low-stock alert recipients are set. A superuser can add them from settings.
      {/if}
    </p>
  {/if}
</section>
