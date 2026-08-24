<script>
  // Shift Interest: who wants which teaching shifts next month.
  // Reads shift_interest_submissions (fed by the public /scheduleinterest
  // form); the slot layout comes from src/data/shiftInterest.js so this grid
  // always mirrors what the form offered. Click a slot to see everyone who
  // raised their hand for it.
  import { onMount } from "svelte";
  import { CalendarCheck, Copy, ExternalLink, RefreshCw, Trash2, Users } from "@lucide/svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import {
    shiftInterestMonths,
    activeShiftMonth,
    slotKey,
    formatSlotTime,
    describeSlotKey,
    monthSlotKeys,
    monthRooms,
    monthDays,
  } from "../../../data/shiftInterest.js";

  export let supabase;
  export let dataVersion = 0;

  let monthSlug = activeShiftMonth.slug;
  $: month =
    shiftInterestMonths.find((m) => m.slug === monthSlug) || activeShiftMonth;

  let submissions = [];
  let isLoading = true;
  let errorMessage = "";
  let selectedKey = null;
  let deleting = null; // submission pending delete confirmation
  let isDeleting = false;
  let flash = "";
  let flashTimer = null;

  let lastVersion = dataVersion;
  $: if (dataVersion !== lastVersion) {
    lastVersion = dataVersion;
    load();
  }
  let lastMonth = monthSlug;
  $: if (monthSlug !== lastMonth) {
    lastMonth = monthSlug;
    selectedKey = null;
    load();
  }

  onMount(load);

  async function load() {
    if (!supabase) return;
    isLoading = true;
    errorMessage = "";

    const { data, error } = await supabase
      .from("shift_interest_submissions")
      .select("id, name, email, service_class, slot_keys, notes, created_at, updated_at")
      .eq("month_slug", monthSlug)
      .order("created_at", { ascending: true });

    if (error) {
      errorMessage = error.message;
      isLoading = false;
      return;
    }

    submissions = data || [];
    isLoading = false;
  }

  // slot key -> submissions interested in it. Built reactively (not in a
  // template helper) so the grid re-renders when submissions change.
  $: bySlot = submissions.reduce((acc, s) => {
    for (const key of s.slot_keys || []) {
      (acc[key] ||= []).push(s);
    }
    return acc;
  }, {});

  $: totalPicks = submissions.reduce(
    (sum, s) => sum + (s.slot_keys?.length || 0),
    0,
  );
  $: allKeys = monthSlotKeys(month);
  $: coveredCount = allKeys.filter((k) => (bySlot[k] || []).length > 0).length;
  $: emptyCount = allKeys.length - coveredCount;

  // Per room: the union of that room's times across the week, sorted, so each
  // room renders as one time-rows x day-columns grid. Rooms and days with no
  // shifts this month are dropped entirely.
  $: gridDays = monthDays(month);
  $: roomTimes = monthRooms(month).map((room) => {
    const times = new Set();
    for (const day of gridDays) {
      for (const time of day.slots[room.id] || []) times.add(time);
    }
    return { room, times: [...times].sort() };
  });

  $: selectedPeople = selectedKey ? bySlot[selectedKey] || [] : [];

  function cellClass(count, isSelected) {
    const ring = isSelected ? " ring-2 ring-accent ring-offset-1" : "";
    if (count === 0)
      return "bg-white text-ink/25 hover:bg-ink/[0.04] hover:text-ink/50" + ring;
    if (count === 1) return "bg-accent/15 text-ink hover:bg-accent/25" + ring;
    if (count === 2) return "bg-accent/30 text-ink hover:bg-accent/40" + ring;
    return "bg-accent/50 text-ink hover:bg-accent/60" + ring;
  }

  function showFlash(message) {
    flash = message;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash = ""), 2500);
  }

  async function copyEmails(people) {
    const emails = [...new Set(people.map((p) => p.email))].join(", ");
    try {
      await navigator.clipboard.writeText(emails);
      showFlash(`Copied ${people.length === 1 ? "1 email" : `${new Set(people.map((p) => p.email)).size} emails`}`);
    } catch {
      showFlash("Couldn't copy. Select and copy manually.");
    }
  }

  async function deleteSubmission() {
    if (!deleting) return;
    isDeleting = true;
    const { error } = await supabase
      .from("shift_interest_submissions")
      .delete()
      .eq("id", deleting.id);
    isDeleting = false;

    if (error) {
      errorMessage = error.message;
    } else {
      submissions = submissions.filter((s) => s.id !== deleting.id);
      showFlash(`Removed ${deleting.name}'s response`);
    }
    deleting = null;
  }

  function formatSubmitted(iso) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
</script>

<div class="space-y-4">
  {#if errorMessage}
    <Banner tone="error" message={errorMessage} onRetry={load} />
  {/if}
  {#if flash}
    <Banner tone="success" message={flash} />
  {/if}

  <div class="flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      {#if shiftInterestMonths.length > 1}
        <select
          bind:value={monthSlug}
          class="rounded-control border border-ink/12 bg-white px-3 py-1.5 text-sm font-semibold text-ink"
          aria-label="Month"
        >
          {#each shiftInterestMonths as m (m.slug)}
            <option value={m.slug}>{m.label}</option>
          {/each}
        </select>
      {:else}
        <span class="text-sm font-bold text-ink">{month.label}</span>
      {/if}
      {#if month.open}
        <span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
          Form open
        </span>
      {:else}
        <span class="rounded-full bg-ink/8 px-2.5 py-0.5 text-xs font-bold text-ink/55">
          Form closed
        </span>
      {/if}
    </div>
    <div class="flex items-center gap-2">
      <a
        href="/scheduleinterest"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-1.5 text-sm font-semibold text-ink/65 hover:text-ink"
      >
        <ExternalLink class="h-4 w-4" aria-hidden="true" />
        Open the form
      </a>
      <Button variant="secondary" size="sm" icon={RefreshCw} loading={isLoading} onclick={load}>
        Refresh
      </Button>
    </div>
  </div>

  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Responses" value={submissions.length} icon={Users} tone="teal" loading={isLoading} />
    <StatCard label="Total shift picks" value={totalPicks} icon={CalendarCheck} tone="gold" loading={isLoading} />
    <StatCard label="Slots with interest" value={`${coveredCount}/${allKeys.length}`} tone="neutral" loading={isLoading} />
    <StatCard
      label="Slots with no interest"
      value={emptyCount}
      tone={emptyCount > 0 && !isLoading ? "rose" : "neutral"}
      loading={isLoading}
    />
  </div>

  {#if !isLoading && submissions.length === 0}
    <EmptyState
      title="No responses yet"
      message="Share /scheduleinterest with instructors; their picks will light up this grid as they come in."
    />
  {/if}

  <!-- One grid per room: time rows x day columns. Click a cell for names. -->
  {#each roomTimes as { room, times } (room.id)}
    <section class="rounded-card border border-ink/8 bg-white p-4 shadow-card">
      <h4 class="text-sm font-bold text-ink">{room.name}</h4>
      <div class="thin-scroll mt-3 overflow-x-auto">
        <table class="w-full min-w-[40rem] border-separate" style="border-spacing: 3px;">
          <thead>
            <tr>
              <th class="w-16 text-left text-[10px] font-semibold uppercase tracking-wide text-ink/45"></th>
              {#each gridDays as day (day.id)}
                <th class="pb-1 text-center text-xs font-bold text-ink/65">{day.short}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each times as time (time)}
              <tr>
                <td class="pr-2 text-right text-[11px] font-semibold tabular-nums text-ink/45">
                  {formatSlotTime(time)}
                </td>
                {#each gridDays as day (day.id)}
                  {#if (day.slots[room.id] || []).includes(time)}
                    {@const key = slotKey(day.id, room.id, time)}
                    {@const count = (bySlot[key] || []).length}
                    <td class="p-0">
                      <button
                        type="button"
                        class="flex h-9 w-full items-center justify-center rounded-md border border-ink/8 text-sm font-bold tabular-nums transition {cellClass(count, selectedKey === key)}"
                        title="{describeSlotKey(key, month)}: {count} interested"
                        aria-pressed={selectedKey === key}
                        onclick={() => (selectedKey = selectedKey === key ? null : key)}
                      >
                        {count || ""}
                      </button>
                    </td>
                  {:else}
                    <td class="p-0">
                      <div class="h-9 rounded-md bg-ink/[0.06]" aria-hidden="true"></div>
                    </td>
                  {/if}
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/each}

  <!-- Slot detail: everyone who picked the selected slot -->
  {#if selectedKey}
    <section class="rounded-card border border-accent/40 bg-accent-soft/20 p-4 shadow-card">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h4 class="text-sm font-bold text-ink">
          {describeSlotKey(selectedKey, month)}
          <span class="ml-2 font-semibold text-ink/55">
            {selectedPeople.length} interested
          </span>
        </h4>
        <div class="flex items-center gap-2">
          {#if selectedPeople.length > 0}
            <Button variant="secondary" size="sm" icon={Copy} onclick={() => copyEmails(selectedPeople)}>
              Copy emails
            </Button>
          {/if}
          <Button variant="ghost" size="sm" onclick={() => (selectedKey = null)}>Close</Button>
        </div>
      </div>
      {#if selectedPeople.length === 0}
        <p class="mt-3 text-sm text-ink/55">
          Nobody has picked this shift yet.
        </p>
      {:else}
        <ul class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {#each selectedPeople as person (person.id)}
            <li class="rounded-card border border-ink/8 bg-white px-3.5 py-2.5">
              <div class="flex items-center justify-between gap-2">
                <p class="truncate text-sm font-bold text-ink">{person.name}</p>
                <span class="shrink-0 rounded-full bg-ink/6 px-2 py-0.5 text-[11px] font-bold text-ink/70">
                  SC {person.service_class}
                </span>
              </div>
              <p class="mt-0.5 truncate text-xs text-ink/55">{person.email}</p>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  <!-- Every response, with the full pick list and notes -->
  {#if submissions.length > 0}
    <section class="rounded-card border border-ink/8 bg-white p-4 shadow-card">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h4 class="text-sm font-bold text-ink">All responses</h4>
        <Button variant="secondary" size="sm" icon={Copy} onclick={() => copyEmails(submissions)}>
          Copy all emails
        </Button>
      </div>
      <ul class="mt-3 divide-y divide-ink/6">
        {#each submissions as person (person.id)}
          <li class="py-3">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="text-sm font-bold text-ink">
                  {person.name}
                  <span class="ml-2 rounded-full bg-ink/6 px-2 py-0.5 text-[11px] font-bold text-ink/70">
                    SC {person.service_class}
                  </span>
                </p>
                <p class="mt-0.5 text-xs text-ink/55">
                  {person.email} · {person.slot_keys.length}
                  {person.slot_keys.length === 1 ? "shift" : "shifts"} ·
                  submitted {formatSubmitted(person.updated_at || person.created_at)}
                </p>
              </div>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs font-semibold text-ink/45 transition hover:bg-red-50 hover:text-red-600"
                onclick={() => (deleting = person)}
              >
                <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
                Remove
              </button>
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              {#each [...person.slot_keys].sort() as key (key)}
                <button
                  type="button"
                  class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition {selectedKey === key
                    ? 'bg-accent text-white'
                    : 'bg-ink/[0.05] text-ink/70 hover:bg-accent/20'}"
                  onclick={() => (selectedKey = key)}
                >
                  {describeSlotKey(key, month)}
                </button>
              {/each}
            </div>
            {#if person.notes}
              <p class="mt-2 rounded-card bg-ink/[0.03] px-3 py-2 text-xs text-ink/70">
                {person.notes}
              </p>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<ConfirmDialog
  open={Boolean(deleting)}
  title="Remove this response?"
  message={deleting
    ? `${deleting.name}'s ${month.label} response (${deleting.slot_keys.length} ${deleting.slot_keys.length === 1 ? "shift" : "shifts"}) will be deleted. They can always submit the form again.`
    : ""}
  confirmLabel="Remove"
  tone="danger"
  busy={isDeleting}
  onConfirm={deleteSubmission}
  onCancel={() => (deleting = null)}
/>
