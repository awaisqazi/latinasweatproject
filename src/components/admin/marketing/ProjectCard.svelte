<script>
  export let project;
  export let compact = false;
  export let onSelect = null;
  export let draggable = false;
  export let isMoving = false;
  export let onDragStart = null;
  export let onDragEnd = null;

  let dragStarted = false;

  function formatDate(value) {
    if (!value) return "No date";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function getPriorityClass(priority) {
    if (priority === "P0") return "bg-red-100 text-red-800 border-red-300";
    if (priority === "P1") return "bg-amber-100 text-amber-800 border-amber-300";
    if (priority === "P2") return "bg-teal-100 text-teal-800 border-teal-300";
    return "bg-gray-50 text-gray-600 border-gray-200";
  }

  function getCardPriorityClass(priority) {
    if (priority === "P0") {
      return "border-red-300 bg-red-50 shadow-red-100/70 hover:border-red-400";
    }

    if (priority === "P1") {
      return "border-amber-300 bg-amber-50 shadow-amber-100/70 hover:border-amber-400";
    }

    if (priority === "P2") {
      return "border-teal-200 bg-teal-50 shadow-teal-100/70 hover:border-teal-300";
    }

    return "border-black/10 bg-white";
  }

  function handleSelect() {
    if (dragStarted) return;

    onSelect?.(project);
  }

  function handleKeydown(event) {
    if (!onSelect) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleSelect();
    }
  }

  function handleDragStart(event) {
    if (!draggable || !onDragStart) {
      event.preventDefault();
      return;
    }

    onDragStart(event, project);
    dragStarted = true;
  }

  function handleDragEnd(event) {
    onDragEnd?.(event, project);
    window.setTimeout(() => {
      dragStarted = false;
    }, 0);
  }

  function formatAssignments(assignedTo) {
    if (!Array.isArray(assignedTo) || !assignedTo.length) return "Unassigned";

    return assignedTo
      .map((email) => String(email || "").trim())
      .filter(Boolean)
      .join(", ");
  }
</script>

<article
  class="rounded-md border p-3 shadow-sm {getCardPriorityClass(project.priority)} {onSelect ? 'cursor-pointer transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2' : ''} {draggable ? 'active:cursor-grabbing' : ''} {isMoving ? 'opacity-60' : ''}"
  role={onSelect ? "button" : undefined}
  tabindex={onSelect ? "0" : undefined}
  draggable={draggable}
  aria-busy={isMoving ? "true" : undefined}
  onclick={onSelect ? handleSelect : undefined}
  onkeydown={onSelect ? handleKeydown : undefined}
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
>
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <h4 class="line-clamp-2 font-bold leading-snug">{project.title}</h4>
      <p class="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">
        {project.status}
      </p>
    </div>
    <span
      class="shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold {getPriorityClass(project.priority)}"
    >
      {project.priority || "Unset"}
    </span>
  </div>

  {#if !compact}
    <div class="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
      <span>Deadline: {formatDate(project.deadline)}</span>
      <span>Publish: {formatDate(project.publish_date)}</span>
    </div>
    {#if project.channel_tags?.length}
      <div class="mt-3 flex flex-wrap gap-1.5">
        {#each project.channel_tags as tag}
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
            {tag}
          </span>
        {/each}
      </div>
    {/if}
  {/if}

  {#if compact && onSelect}
    <p class="mt-3 line-clamp-2 text-xs text-gray-600">
      Assigned: {formatAssignments(project.assigned_to)}
    </p>
    <p class="mt-3 text-xs font-bold text-[#0f766e]">View details</p>
  {/if}
</article>
