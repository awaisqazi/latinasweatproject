<script>
  import Badge from "../ui/Badge.svelte";

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

  function getPriorityTone(priority) {
    if (priority === "P0") return "red";
    if (priority === "P1") return "amber";
    return "neutral";
  }

  function getCardPriorityClass(priority) {
    if (priority === "P0") {
      return "border-red-300 bg-red-50/70 hover:border-red-400";
    }

    if (priority === "P1") {
      return "border-amber-300 bg-amber-50/70 hover:border-amber-400";
    }

    return "border-ink/8 bg-white hover:border-ink/20";
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
  class="rounded-card border p-3 shadow-card {getCardPriorityClass(project.priority)} {onSelect ? 'cursor-pointer transition hover:shadow-pop focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2' : ''} {draggable ? 'active:cursor-grabbing' : ''} {isMoving ? 'opacity-60' : ''}"
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
      <h4 class="line-clamp-2 font-bold leading-snug text-ink">{project.title}</h4>
      <p class="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-ink/50">
        {project.status}
      </p>
    </div>
    <Badge tone={getPriorityTone(project.priority)} size="xs" class="shrink-0">
      {project.priority || "Unset"}
    </Badge>
  </div>

  {#if !compact}
    <div class="mt-3 grid gap-2 text-sm text-ink/60 sm:grid-cols-2">
      <span>Deadline: {formatDate(project.deadline)}</span>
      <span>Publish: {formatDate(project.publish_date)}</span>
    </div>
    {#if project.channel_tags?.length}
      <div class="mt-3 flex flex-wrap gap-1.5">
        {#each project.channel_tags as tag}
          <Badge tone="neutral" size="xs">{tag}</Badge>
        {/each}
      </div>
    {/if}
  {/if}

  {#if compact && onSelect}
    <p class="mt-3 line-clamp-2 text-xs text-ink/60">
      Assigned: {formatAssignments(project.assigned_to)}
    </p>
    <p class="mt-3 text-xs font-bold text-accent-strong">View details</p>
  {/if}
</article>
