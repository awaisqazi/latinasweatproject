<script>
  import { onMount } from "svelte";
  import { Eye, EyeOff, Plus, Sparkles, Ticket } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import StatCard from "../ui/StatCard.svelte";
  import EventEditorDrawer from "./EventEditorDrawer.svelte";
  import { isOperationalAdmin } from "../../../lib/dashboard/roles";

  export let supabase;
  export let profile = null;
  export let refreshKey = 0;
  export let onAssignTask = () => {};

  const eventColumns =
    "id, slug, title, image_src, image_frame_class, image_class, date_label, time_label, starts_on, ends_on, location, address, description, registration_link, registration_label, featured, recurring, tags, published, sort_order, created_at, updated_at";

  let events = [];
  let isLoading = true;
  let errorMessage = "";
  let selectedEvent = null;
  let togglingEventId = "";
  let lastRefreshKey = refreshKey;

  $: isAdmin = isOperationalAdmin(profile);
  $: publishedCount = events.filter((event) => event.published).length;
  $: featuredCount = events.filter((event) => event.featured && event.published).length;
  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadEvents();
  }

  onMount(() => {
    loadEvents();
  });

  async function loadEvents() {
    if (!supabase) return;

    isLoading = true;
    errorMessage = "";

    const { data, error } = await supabase
      .from("events")
      .select(eventColumns)
      .order("sort_order", { ascending: true })
      .order("starts_on", { ascending: true, nullsFirst: false });

    if (error) {
      errorMessage = error.message;
    } else {
      events = data || [];
    }

    isLoading = false;
  }

  function handleSaved(savedEvent) {
    const exists = events.some((event) => event.id === savedEvent.id);

    events = exists
      ? events.map((event) => (event.id === savedEvent.id ? savedEvent : event))
      : [...events, savedEvent];

    if (selectedEvent && (selectedEvent.id === savedEvent.id || !selectedEvent.id)) {
      selectedEvent = savedEvent;
    }
  }

  function handleDeleted(deletedId) {
    events = events.filter((event) => event.id !== deletedId);
    selectedEvent = null;
  }

  async function togglePublished(event) {
    if (togglingEventId) return;

    togglingEventId = event.id;
    errorMessage = "";

    const { data, error } = await supabase
      .from("events")
      .update({ published: !event.published })
      .eq("id", event.id)
      .select(eventColumns)
      .single();

    if (error) {
      errorMessage = error.message;
    } else {
      handleSaved(data);
    }

    togglingEventId = "";
  }

  function formatDateRange(event) {
    if (event.date_label) return event.date_label;
    if (!event.starts_on) return "No date";

    const formatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    });
    const start = formatter.format(new Date(`${event.starts_on}T00:00:00`));

    if (event.ends_on && event.ends_on !== event.starts_on) {
      return `${start} to ${formatter.format(new Date(`${event.ends_on}T00:00:00`))}`;
    }
    return start;
  }
</script>

<section class="space-y-4" aria-labelledby="events-view-title">
  <h3 id="events-view-title" class="sr-only">Events</h3>

  <div class="grid gap-3 sm:grid-cols-3">
    <StatCard label="Total events" value={events.length} icon={Ticket} tone="gold" loading={isLoading} />
    <StatCard label="Published" value={publishedCount} icon={Eye} tone="teal" loading={isLoading} />
    <StatCard label="Featured" value={featuredCount} icon={Sparkles} tone="gold" loading={isLoading} />
  </div>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} />
  {/if}

  <Panel title="Public Events" id="events-panel-title" loading={isLoading}>
    <Button
      slot="actions"
      variant="primary"
      icon={Plus}
      onclick={() => (selectedEvent = { tags: [] })}
    >
      New event
    </Button>

    <p class="mb-4 text-sm text-ink/60">
      Published events appear on
      <a class="font-bold text-accent-strong underline" href="/events" target="_blank" rel="noopener">latinasweatproject.com/events</a>
      within a minute, no deploy needed.
    </p>

    {#if isLoading}
      <div class="space-y-2">
        {#each Array(3) as _, i (i)}
          <SkeletonCard lines={2} />
        {/each}
      </div>
    {:else if !events.length}
      <EmptyState
        title="No events"
        message="Create the first event to publish it on the public events page."
      />
    {:else}
      <div class="space-y-2">
        {#each events as event (event.id)}
          <div class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 {event.published ? '' : 'opacity-70'}">
            <button
              type="button"
              class="min-w-0 flex-1 text-left"
              onclick={() => (selectedEvent = event)}
            >
              <span class="block font-bold leading-snug text-ink">{event.title}</span>
              <span class="mt-1 block text-sm text-ink/60">
                {formatDateRange(event)}
                {#if event.location}
                  · {event.location}
                {/if}
              </span>
              {#if event.tags?.length}
                <span class="mt-1.5 flex flex-wrap gap-1.5">
                  {#each event.tags as tag}
                    <Badge tone="neutral" size="xs">{tag}</Badge>
                  {/each}
                </span>
              {/if}
            </button>

            <div class="flex items-center gap-2">
              {#if event.featured}
                <Badge tone="gold">Featured</Badge>
              {/if}
              {#if event.recurring}
                <Badge tone="teal">Recurring</Badge>
              {/if}
              <Badge tone={event.published ? "green" : "neutral"} dot>
                {event.published ? "Published" : "Draft"}
              </Badge>
              <Button
                size="sm"
                icon={event.published ? EyeOff : Eye}
                loading={togglingEventId === event.id}
                onclick={() => togglePublished(event)}
              >
                {event.published ? "Hide" : "Publish"}
              </Button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Panel>
</section>

<EventEditorDrawer
  {supabase}
  event={selectedEvent}
  {isAdmin}
  onClose={() => (selectedEvent = null)}
  onSaved={handleSaved}
  onDeleted={handleDeleted}
  {onAssignTask}
/>
