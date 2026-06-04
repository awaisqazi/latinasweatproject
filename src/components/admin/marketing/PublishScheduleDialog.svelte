<script>
  import { tick } from "svelte";
  import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    X,
  } from "@lucide/svelte";

  export let open = false;
  export let project = null;
  export let projects = [];
  export let initialDate = "";
  export let isSaving = false;
  export let errorMessage = "";
  export let onCancel = () => {};
  export let onConfirm = () => {};

  let scheduleDialog;
  let displayedProject = null;
  let selectedDate = "";
  let currentMonth = getMonthStart(new Date());
  let activeProjectId = "";
  let isVisible = false;
  let isClosing = false;
  let wasOpen = false;

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const publishingStatuses = ["Ready to Publish", "Published"];
  const ANIMATION_MS = 190;

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

  $: if (open !== wasOpen) {
    wasOpen = open;

    if (open) {
      openDialog();
    } else if (scheduleDialog?.open) {
      closeDialogWithAnimation();
    } else {
      clearDialogState();
    }
  }

  async function prepareDialog(nextProject) {
    displayedProject = nextProject;
    activeProjectId = nextProject.id;
    selectedDate = initialDate || nextProject.publish_date || toDateKey(new Date());
    currentMonth = getMonthStart(new Date(`${selectedDate}T00:00:00`));
    await tick();
  }

  async function openDialog() {
    isClosing = false;
    isVisible = false;
    await tick();

    if (scheduleDialog && !scheduleDialog.open) {
      scheduleDialog.showModal();
    }

    window.requestAnimationFrame(() => {
      isVisible = true;
    });
  }

  function requestClose() {
    if (isSaving) return;

    onCancel();
  }

  function closeDialogWithAnimation() {
    if (isClosing) return;

    isClosing = true;
    isVisible = false;
    window.setTimeout(() => {
      scheduleDialog?.close();
    }, ANIMATION_MS);
  }

  function handleDialogClose() {
    if (open) {
      onCancel();
    } else {
      clearDialogState();
    }
  }

  function handleDialogClick(event) {
    if (event.target === scheduleDialog) {
      requestClose();
    }
  }

  function clearDialogState() {
    activeProjectId = "";
    displayedProject = null;
    isVisible = false;
    isClosing = false;
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

<dialog
  bind:this={scheduleDialog}
  class="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-[min(100vw,42rem)] rounded-none border-0 bg-transparent p-0 text-[#1E1E1E] backdrop:bg-black/35"
  onclick={handleDialogClick}
  onclose={handleDialogClose}
>
  {#if currentProject}
    <form
      class="flex h-full flex-col bg-white shadow-2xl transition-transform duration-200 ease-out {isVisible && !isClosing ? 'translate-x-0' : 'translate-x-full'}"
      onsubmit={confirmDate}
    >
      <div class="border-b border-black/10 bg-[#1E1E1E] px-5 py-5 text-white">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#ffbd59]">
              Schedule publish
            </p>
            <h3 class="mt-2 text-xl font-bold leading-tight">{currentProject.title}</h3>
          </div>
          <button
            type="button"
            class="rounded-md p-2 text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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
          <section class="rounded-md border border-black/10 bg-gray-50 p-4">
            <label class="block text-sm font-bold" for={`publish-date-${currentProject.id}`}>
              Publish date
              <input
                id={`publish-date-${currentProject.id}`}
                type="date"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={selectedDate}
                onchange={(event) => setSelectedDate(event.currentTarget.value)}
                required
              />
            </label>

            <div class="mt-4 flex items-center gap-2 text-sm text-gray-700">
              <CalendarDays class="h-4 w-4 text-[#0f766e]" aria-hidden="true" />
              <span>{scheduledProjects.length} scheduled item{scheduledProjects.length === 1 ? "" : "s"}</span>
            </div>

            {#if errorMessage}
              <div class="mt-4 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            {/if}
          </section>

          <section class="rounded-md border border-black/10 bg-white">
            <div class="flex items-center justify-between gap-3 border-b border-black/10 px-3 py-3">
              <button
                type="button"
                class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 transition hover:border-[#0f766e]/30 hover:text-[#0f766e]"
                aria-label="Previous schedule month"
                onclick={() => setMonth(-1)}
              >
                <ChevronLeft class="h-4 w-4" aria-hidden="true" />
              </button>
              <h4 class="font-bold">{monthLabel}</h4>
              <button
                type="button"
                class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 transition hover:border-[#0f766e]/30 hover:text-[#0f766e]"
                aria-label="Next schedule month"
                onclick={() => setMonth(1)}
              >
                <ChevronRight class="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div class="grid grid-cols-7 border-b border-gray-200 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-gray-500">
              {#each weekdays as weekday}
                <div class="px-2 py-2">{weekday}</div>
              {/each}
            </div>

            <div class="grid grid-cols-7">
              {#each calendarDays as day}
                <button
                  type="button"
                  class="min-h-20 border-r border-t border-gray-200 px-1.5 py-2 text-left transition last:border-r-0 focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-inset sm:min-h-24 sm:px-2 {day.isCurrentMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'} {day.isSelected ? 'bg-[#fff3d8] ring-2 ring-[#ffbd59] ring-inset' : 'hover:bg-gray-50'}"
                  onclick={() => selectDate(day.dateKey)}
                >
                  <span class="inline-flex h-6 min-w-6 items-center justify-center rounded-full text-xs font-bold {day.isToday ? 'bg-[#1E1E1E] text-white' : ''}">
                    {day.dayNumber}
                  </span>

                  <span class="mt-1 block space-y-1">
                    {#each day.projects.slice(0, 2) as item}
                      <span class="block truncate rounded border px-1.5 py-1 text-[0.68rem] font-bold {getEventClass(item)}">
                        {item.title}
                      </span>
                    {/each}
                    {#if day.projects.length > 2}
                      <span class="block text-[0.68rem] font-bold text-gray-500">
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

      <div class="flex flex-col-reverse gap-2 border-t border-black/10 bg-white px-5 py-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          class="inline-flex min-h-10 items-center justify-center rounded-md border border-black/10 px-4 text-sm font-bold transition hover:border-gray-400"
          onclick={requestClose}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="submit"
          class="inline-flex min-h-10 items-center justify-center rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!selectedDate || isSaving}
        >
          {isSaving ? "Scheduling" : "Schedule"}
        </button>
      </div>
    </form>
  {/if}
</dialog>
