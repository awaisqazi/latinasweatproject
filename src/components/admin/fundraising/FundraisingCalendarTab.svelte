<script>
  // Month calendar of every dated commitment the fundraising team is holding:
  // prospect next actions, donor next actions, and outreach campaign
  // deadlines. Free-text application deadlines from prospect research (which
  // can't be charted) are listed below the grid so they aren't lost.
  import { CalendarClock, ChevronLeft, ChevronRight, FileText, Megaphone, Target, UserRound } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";

  export let prospects = [];
  export let donorProfiles = [];
  export let campaigns = [];
  export let teamMembers = [];
  export let onOpenProspect = () => {};
  export let onOpenDonorEmail = () => {};

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const KIND_STYLES = {
    prospect: { tone: "amber", icon: Target, label: "Prospect next action" },
    donor: { tone: "blue", icon: UserRound, label: "Donor next action" },
    campaign: { tone: "green", icon: Megaphone, label: "Outreach deadline" },
  };

  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0-based

  $: membersById = Object.fromEntries(teamMembers.map((member) => [member.id, member]));
  $: entriesByDate = buildEntries(prospects, donorProfiles, campaigns, membersById);
  $: monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(viewYear, viewMonth, 1),
  );
  $: monthCells = buildMonthCells(viewYear, viewMonth);
  $: undatedDeadlines = prospects.filter(
    (prospect) =>
      prospect.deadlines?.trim() &&
      !["Committed", "Declined"].includes(prospect.stage),
  );

  function ownerSuffix(ownerId, members) {
    const member = members[ownerId];
    const name = member?.full_name || member?.email;
    return name ? ` · ${name.split(/\s+/)[0]}` : "";
  }

  function buildEntries(prospectList, profileList, campaignList, members) {
    const byDate = new Map();
    const add = (dateKey, entry) => {
      if (!dateKey) return;
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey).push(entry);
    };

    for (const prospect of prospectList) {
      if (prospect.stage === "Declined") continue;
      add(prospect.next_action_date, {
        kind: "prospect",
        label: prospect.name + ownerSuffix(prospect.owner_id, members),
        detail: prospect.next_action || prospect.stage,
        open: () => onOpenProspect(prospect),
      });
    }
    for (const profile of profileList) {
      add(profile.next_action_date, {
        kind: "donor",
        label: (profile.display_name || profile.email) + ownerSuffix(profile.owner_id, members),
        detail: profile.next_action || "Donor follow-up",
        open: () => onOpenDonorEmail(profile.email),
      });
    }
    for (const campaign of campaignList) {
      if (campaign.status !== "active") continue;
      add(campaign.due_date, {
        kind: "campaign",
        label: campaign.name,
        detail: "Outreach list finish-by date",
        open: null,
      });
    }
    return byDate;
  }

  function dateKeyFor(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function buildMonthCells(year, month) {
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ day, dateKey: dateKeyFor(year, month, day) });
    }
    return cells;
  }

  function shiftMonth(delta) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    viewYear = next.getFullYear();
    viewMonth = next.getMonth();
  }

  function isToday(dateKey) {
    return dateKey === dateKeyFor(today.getFullYear(), today.getMonth(), today.getDate());
  }

  function isPast(dateKey) {
    return dateKey < dateKeyFor(today.getFullYear(), today.getMonth(), today.getDate());
  }
</script>

<Panel title="Fundraising calendar" id="fundraising-calendar-title">
  <p class="mb-4 text-sm leading-6 text-ink/60">
    Prospect next actions, donor follow-ups, and outreach deadlines in one
    place, so nothing slips. Set the dates on each prospect or donor and they
    show up here.
  </p>

  <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <Button size="sm" iconOnly icon={ChevronLeft} label="Previous month" onclick={() => shiftMonth(-1)} />
      <span class="min-w-40 text-center text-sm font-bold text-ink">{monthLabel}</span>
      <Button size="sm" iconOnly icon={ChevronRight} label="Next month" onclick={() => shiftMonth(1)} />
    </div>
    <div class="flex flex-wrap gap-2">
      {#each Object.entries(KIND_STYLES) as [kind, style] (kind)}
        <Badge tone={style.tone} size="xs">{style.label}</Badge>
      {/each}
    </div>
  </div>

  <div class="grid grid-cols-7 gap-1.5" role="grid" aria-label={`Fundraising dates for ${monthLabel}`}>
    {#each WEEKDAYS as weekday (weekday)}
      <p class="pb-1 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-ink/45">
        {weekday}
      </p>
    {/each}
    {#each monthCells as cell, index (index)}
      {#if cell}
        {@const entries = entriesByDate.get(cell.dateKey) || []}
        <div
          class="min-h-20 rounded-control border p-1.5 {isToday(cell.dateKey)
            ? 'border-accent bg-accent/5'
            : 'border-ink/8 bg-white'}"
          role="gridcell"
        >
          <p class="text-right text-[11px] font-bold {isToday(cell.dateKey) ? 'text-accent-strong' : 'text-ink/45'}">
            {cell.day}
          </p>
          <div class="mt-0.5 space-y-1">
            {#each entries as entry, entryIndex (cell.dateKey + entry.kind + entryIndex)}
              {@const style = KIND_STYLES[entry.kind]}
              {#if entry.open}
                <button
                  type="button"
                  class="block w-full truncate rounded border px-1 py-0.5 text-left text-[11px] font-semibold leading-4 transition hover:brightness-95 {isPast(cell.dateKey) ? 'opacity-70' : ''} {entry.kind === 'prospect'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : entry.kind === 'donor'
                      ? 'border-sky-200 bg-sky-50 text-sky-900'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-900'}"
                  title={`${style.label}: ${entry.label} · ${entry.detail}`}
                  onclick={entry.open}
                >
                  {entry.label}
                </button>
              {:else}
                <p
                  class="truncate rounded border border-emerald-200 bg-emerald-50 px-1 py-0.5 text-[11px] font-semibold leading-4 text-emerald-900 {isPast(cell.dateKey) ? 'opacity-70' : ''}"
                  title={`${style.label}: ${entry.label} · ${entry.detail}`}
                >
                  {entry.label}
                </p>
              {/if}
            {/each}
          </div>
        </div>
      {:else}
        <div class="min-h-20 rounded-control border border-transparent" role="gridcell"></div>
      {/if}
    {/each}
  </div>

  {#if undatedDeadlines.length}
    <section class="mt-5 rounded-card border border-ink/8 bg-canvas/50 p-4" aria-labelledby="research-deadlines-title">
      <h4 id="research-deadlines-title" class="flex items-center gap-2 font-bold text-ink">
        <FileText class="h-4 w-4 text-ink/50" aria-hidden="true" />
        Deadlines noted in prospect research
      </h4>
      <p class="mt-1 text-sm leading-6 text-ink/60">
        These live as free text on each prospect. Give a prospect a next action
        date to pin it on the calendar above.
      </p>
      <div class="mt-3 space-y-2">
        {#each undatedDeadlines as prospect (prospect.id)}
          <button
            type="button"
            class="flex w-full flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-3 py-2.5 text-left transition hover:border-accent/40"
            onclick={() => onOpenProspect(prospect)}
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-bold leading-snug text-ink">{prospect.name}</span>
              <span class="mt-0.5 block text-xs leading-5 text-ink/60">{prospect.deadlines}</span>
            </span>
            <Badge tone="neutral" size="xs">{prospect.stage}</Badge>
            {#if prospect.next_action_date}
              <Badge tone="amber" size="xs">
                <CalendarClock class="h-3 w-3" aria-hidden="true" />
                {prospect.next_action_date}
              </Badge>
            {/if}
          </button>
        {/each}
      </div>
    </section>
  {:else if entriesByDate.size === 0}
    <EmptyState
      icon={CalendarClock}
      title="Nothing scheduled yet"
      message="Add next action dates to prospects and donors, or a finish-by date to an outreach campaign, and they'll appear here."
    />
  {/if}
</Panel>
