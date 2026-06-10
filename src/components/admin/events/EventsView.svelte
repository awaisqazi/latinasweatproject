<script>
  import { onMount } from "svelte";
  import {
    CircleAlert,
    Eye,
    EyeOff,
    Plus,
    Sparkles,
    Ticket,
  } from "@lucide/svelte";
  import EmptyState from "../marketing/EmptyState.svelte";
  import Panel from "../marketing/Panel.svelte";
  import SummaryCard from "../marketing/SummaryCard.svelte";
  import EventEditorDrawer from "./EventEditorDrawer.svelte";
  import { isOperationalAdmin } from "../../../lib/dashboard/roles";

  export let supabase;
  export let profile = null;
  export let refreshKey = 0;

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
    <SummaryCard label="Total events" value={events.length} icon={Ticket} tone="gold" />
    <SummaryCard label="Published" value={publishedCount} icon={Eye} tone="teal" />
    <SummaryCard label="Featured" value={featuredCount} icon={Sparkles} tone="gold" />
  </div>

  {#if errorMessage}
    <div class="flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{errorMessage}</span>
    </div>
  {/if}

  <Panel title="Public Events" id="events-panel-title" loading={isLoading}>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-gray-600">
        Published events appear on
        <a class="font-bold text-[#0f766e] underline" href="/events" target="_blank" rel="noopener">latinasweatproject.com/events</a>
        within a minute, no deploy needed.
      </p>
      <button
        type="button"
        class="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833]"
        onclick={() => (selectedEvent = { tags: [] })}
      >
        <Plus class="h-4 w-4" aria-hidden="true" />
        New event
      </button>
    </div>

    {#if isLoading}
      <div class="flex min-h-48 items-center justify-center">
        <div class="flex items-center gap-3 text-sm text-gray-600">
          <span class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin" aria-hidden="true"></span>
          Loading events
        </div>
      </div>
    {:else if !events.length}
      <EmptyState
        title="No events"
        message="Create the first event to publish it on the public events page."
      />
    {:else}
      <div class="space-y-2">
        {#each events as event (event.id)}
          <div class="flex flex-wrap items-center gap-3 rounded-md border border-black/10 bg-white px-4 py-3 {event.published ? '' : 'opacity-70'}">
            <button
              type="button"
              class="min-w-0 flex-1 text-left"
              onclick={() => (selectedEvent = event)}
            >
              <span class="block font-bold leading-snug">{event.title}</span>
              <span class="mt-1 block text-sm text-gray-600">
                {formatDateRange(event)}
                {#if event.location}
                  · {event.location}
                {/if}
              </span>
              {#if event.tags?.length}
                <span class="mt-1.5 flex flex-wrap gap-1.5">
                  {#each event.tags as tag}
                    <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600">{tag}</span>
                  {/each}
                </span>
              {/if}
            </button>

            <div class="flex items-center gap-2">
              {#if event.featured}
                <span class="rounded-full bg-[#fff3d8] px-2.5 py-1 text-xs font-bold text-[#8a5700]">Featured</span>
              {/if}
              {#if event.recurring}
                <span class="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">Recurring</span>
              {/if}
              <button
                type="button"
                class="inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 {event.published ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'}"
                onclick={() => togglePublished(event)}
                disabled={togglingEventId === event.id}
              >
                {#if event.published}
                  <Eye class="h-3.5 w-3.5" aria-hidden="true" />
                  Published
                {:else}
                  <EyeOff class="h-3.5 w-3.5" aria-hidden="true" />
                  Hidden
                {/if}
              </button>
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
/>
