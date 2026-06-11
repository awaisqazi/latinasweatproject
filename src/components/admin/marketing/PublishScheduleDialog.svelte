<script>
  import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    X,
  } from "@lucide/svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import Field from "../ui/Field.svelte";
  import SlideOver from "./SlideOver.svelte";

  export let open = false;
  export let project = null;
  export let projects = [];
  export let initialDate = "";
  export let isSaving = false;
  export let errorMessage = "";
  export let onCancel = () => {};
  export let onConfirm = () => {};

  let displayedProject = null;
  let selectedDate = "";
  let currentMonth = getMonthStart(new Date());
  let activeProjectId = "";
  let drawerOpen = false;

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const publishingStatuses = ["Ready to Publish", "Published"];

  $: currentProject = project || displayedProject;
  $: scheduledProjects = projects
    .filter((item) => item?.id !== currentProject?.id)
    .filter((item) => publishingStatuses.includes(item.status))
    .filter((item) => Boolean(item.publish_date));
  $: calendarDays = buildCalendarDays(currentMonth, scheduledProjects);
  $: monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(currentMonth);

  $: if (open && project?.id && project.id !== activeProjectId) {
    prepareDialog(project);
  }

  $: if (open && currentProject && !drawerOpen) {
    drawerOpen = true;
  }

  $: if (!open && drawerOpen) {
    drawerOpen = false;
  }

  function prepareDialog(nextProject) {
    displayedProject = nextProject;
    activeProjectId = nextProject.id;
    selectedDate = initialDate || nextProject.publish_date || toDateKey(new Date());
    currentMonth = getMonthStart(new Date(`${selectedDate}T00:00:00`));
  }

  function requestClose() {
    if (isSaving) return;

    onCancel();
  }

  function clearDialogState() {
    activeProjectId = "";
    displayedProject = null;
    drawerOpen = false;
  }

  function setMonth(offset) {
    currentMonth = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + offset,
      1,
    );
  }

  function selectDate(dateKey) {
    selectedDate = dateKey;
  }

  function setSelectedDate(value) {
    selectedDate = value;

    if (value) {
      currentMonth = getMonthStart(new Date(`${value}T00:00:00`));
    }
  }

  function confirmDate(event) {
    event.preventDefault();

    if (!selectedDate || isSaving) return;
    onConfirm(selectedDate);
  }

  function buildCalendarDays(month, sourceProjects) {
    const firstDay = getMonthStart(month);
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const dateKey = toDateKey(date);

      return {
        dateKey,
        dayNumber: date.getDate(),
        isCurrentMonth:
          date.getMonth() === month.getMonth() &&
          date.getFullYear() === month.getFullYear(),
        isToday: dateKey === toDateKey(new Date()),
        isSelected: dateKey === selectedDate,
        projects: sourceProjects.filter((item) => item.publish_date === dateKey),
      };
    });
  }

  function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function getEventClass(project) {
    if (project.status === "Published") {
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    }

    return "border-amber-200 bg-amber-50 text-amber-800";
  }
</script>

<SlideOver
  open={drawerOpen}
  showHeader={false}
  width="min(100vw, 42rem)"
  closeDisabled={isSaving}
  onClose={requestClose}
  onClosed={clearDialogState}
>
  {#if currentProject}
    <form
      class="flex min-h-full flex-col bg-white"
      onsubmit={confirmDate}
    >
      <div class="border-b border-ink/8 bg-ink px-5 py-5 text-white">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              Schedule publish
            </p>
            <h3 class="mt-2 text-xl font-bold leading-tight">{currentProject.title}</h3>
          </div>
          <button
            type="button"
            class="rounded-control p-2 text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close publish scheduler"
            onclick={requestClose}
            disabled={isSaving}
          >
            <X class="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-5">
        <div class="grid gap-4">
          <section class="rounded-card border border-ink/8 bg-canvas p-4">
            <Field label="Publish date" id={`publish-date-${currentProject.id}`}>
              <input
                id={`publish-date-${currentProject.id}`}
                type="date"
                class="input"
                bind:value={selectedDate}
                onchange={(event) => setSelectedDate(event.currentTarget.value)}
                required
              />
            </Field>

            <div class="mt-4 flex items-center gap-2 text-sm text-ink/70">
              <CalendarDays class="h-4 w-4 text-accent" aria-hidden="true" />
              <span>{scheduledProjects.length} scheduled item{scheduledProjects.length === 1 ? "" : "s"}</span>
            </div>

            {#if errorMessage}
              <Banner tone="error" message={errorMessage} class="mt-4" />
            {/if}
          </section>

          <section class="rounded-card border border-ink/8 bg-white">
            <div class="flex items-center justify-between gap-3 border-b border-ink/8 px-3 py-3">
              <Button
                iconOnly
                icon={ChevronLeft}
                size="sm"
                label="Previous schedule month"
                onclick={() => setMonth(-1)}
              />
              <h4 class="font-bold text-ink">{monthLabel}</h4>
              <Button
                iconOnly
                icon={ChevronRight}
                size="sm"
                label="Next schedule month"
                onclick={() => setMonth(1)}
              />
            </div>

            <div class="grid grid-cols-7 border-b border-ink/8 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-ink/50">
              {#each weekdays as weekday}
                <div class="px-2 py-2">{weekday}</div>
              {/each}
            </div>

            <div class="grid grid-cols-7">
              {#each calendarDays as day}
                <button
                  type="button"
                  class="min-h-20 border-r border-t border-ink/8 px-1.5 py-2 text-left transition last:border-r-0 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-inset sm:min-h-24 sm:px-2 {day.isCurrentMonth ? 'bg-white' : 'bg-canvas text-ink/40'} {day.isSelected ? 'bg-brand-soft ring-2 ring-brand ring-inset' : 'hover:bg-canvas'}"
                  onclick={() => selectDate(day.dateKey)}
                >
                  <span class="inline-flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-bold {day.isToday ? 'bg-ink text-white' : ''}">
                    {day.dayNumber}
                  </span>

                  <span class="mt-1 block space-y-1">
                    {#each day.projects.slice(0, 2) as item}
                      <span class="block truncate rounded border px-1.5 py-1 text-[0.68rem] font-bold {getEventClass(item)}">
                        {item.title}
                      </span>
                    {/each}
                    {#if day.projects.length > 2}
                      <span class="block text-[0.68rem] font-bold text-ink/50">
                        +{day.projects.length - 2} more
                      </span>
                    {/if}
                  </span>
                </button>
              {/each}
            </div>
          </section>
        </div>
      </div>

      <div class="flex flex-col-reverse gap-2 border-t border-ink/8 bg-white px-5 py-4 sm:flex-row sm:justify-end">
        <Button onclick={requestClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!selectedDate || isSaving}
          loading={isSaving}
        >
          {isSaving ? "Scheduling" : "Schedule"}
        </Button>
      </div>
    </form>
  {/if}
</SlideOver>
