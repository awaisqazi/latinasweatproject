<script>
  // Time-aligned week grid: a time gutter with hour lines, day columns, and
  // items positioned by start time and sized by duration, in side-by-side
  // room lanes, so free gaps in each room are visible at a glance.
  // Items need { key, room, startMinutes, endMinutes }; rendering is the
  // consumer's job via the default slot (let:item).
  import { ROOM_SHORT } from "../../../lib/dashboard/spacesAdmin.js";

  export let days = []; // [{ dateStr, shortLabel, isToday, items: [] }]
  export let rooms = []; // ordered lane list (only rooms with content)
  export let hourHeight = 52; // px per hour

  const LANE_DOTS = {
    "Little Village Room": "bg-accent",
    "Gage Park Room": "bg-brand-strong",
    Cafe: "bg-ink/40",
  };

  $: laneRooms = rooms.length ? rooms : ["Little Village Room"];
  $: laneCount = laneRooms.length;

  $: allItems = days.flatMap((day) => day.items);
  $: axisStartMin = allItems.length
    ? Math.floor(Math.min(...allItems.map((i) => i.startMinutes)) / 60) * 60
    : 8 * 60;
  $: axisEndMin = allItems.length
    ? Math.min(24 * 60, Math.ceil(Math.max(...allItems.map((i) => i.endMinutes)) / 60) * 60)
    : 18 * 60;
  $: hours = Array.from(
    { length: Math.max(1, (axisEndMin - axisStartMin) / 60) },
    (_, i) => axisStartMin + i * 60,
  );
  $: gridHeight = ((axisEndMin - axisStartMin) / 60) * hourHeight;

  function hourLabel(totalMinutes) {
    const h = Math.floor(totalMinutes / 60) % 24;
    const suffix = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12} ${suffix}`;
  }

  function itemTop(item) {
    return ((Math.max(item.startMinutes, axisStartMin) - axisStartMin) / 60) * hourHeight;
  }

  function itemHeight(item) {
    const start = Math.max(item.startMinutes, axisStartMin);
    const end = Math.min(item.endMinutes, axisEndMin);
    return Math.max(26, ((end - start) / 60) * hourHeight - 2);
  }

  function laneIndex(item) {
    const index = laneRooms.indexOf(item.room);
    return index === -1 ? 0 : index;
  }

  $: nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  $: showNowLine = nowMinutes >= axisStartMin && nowMinutes <= axisEndMin;
</script>

{#if laneCount > 1}
  <div class="mb-2 flex flex-wrap items-center gap-3 text-xs font-semibold text-ink/65" aria-hidden="true">
    <span class="text-[10px] uppercase tracking-wide text-ink/45">Lanes per day:</span>
    {#each laneRooms as room (room)}
      <span class="inline-flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full {LANE_DOTS[room] || 'bg-ink/40'}"></span>
        {ROOM_SHORT[room] || room}
      </span>
    {/each}
  </div>
{/if}

<div class="thin-scroll overflow-x-auto">
  <div class="min-w-[64rem]">
    <!-- Day header row -->
    <div class="grid" style="grid-template-columns: 3.5rem repeat(7, minmax(0, 1fr));">
      <div></div>
      {#each days as day (day.dateStr)}
        <div class="px-1 pb-1.5 text-center text-xs font-bold {day.isToday ? 'text-accent' : 'text-ink/65'}">
          {day.shortLabel}{day.isToday ? " · Today" : ""}
        </div>
      {/each}
    </div>

    <!-- Time grid -->
    <div
      class="relative grid rounded-card border border-ink/8 bg-white shadow-card"
      style="grid-template-columns: 3.5rem repeat(7, minmax(0, 1fr)); height: {gridHeight}px;"
    >
      <!-- Gutter -->
      <div class="relative border-r border-ink/8">
        {#each hours as hour, i (hour)}
          <span
            class="absolute right-1.5 -translate-y-1/2 text-[10px] font-semibold tabular-nums text-ink/45"
            style="top: {i * hourHeight}px;"
          >
            {i === 0 ? "" : hourLabel(hour)}
          </span>
        {/each}
      </div>

      {#each days as day (day.dateStr)}
        <div class="relative border-r border-ink/6 last:border-r-0 {day.isToday ? 'bg-accent-soft/30' : ''}">
          <!-- Hour lines -->
          {#each hours as hour, i (hour)}
            {#if i > 0}
              <div class="pointer-events-none absolute inset-x-0 border-t border-ink/6" style="top: {i * hourHeight}px;"></div>
            {/if}
          {/each}

          <!-- Now indicator -->
          {#if day.isToday && showNowLine}
            <div
              class="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-400/80"
              style="top: {((nowMinutes - axisStartMin) / 60) * hourHeight}px;"
              aria-hidden="true"
            ></div>
          {/if}

          <!-- Items, positioned by time in room lanes -->
          {#each day.items as item (item.key)}
            <div
              class="absolute overflow-hidden px-px"
              style="top: {itemTop(item)}px; height: {itemHeight(item)}px; left: {(laneIndex(item) / laneCount) * 100}%; width: {(1 / laneCount) * 100}%;"
            >
              <slot {item} />
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
</div>
