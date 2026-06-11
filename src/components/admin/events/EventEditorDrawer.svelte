<script>
  import { CheckCircle2, CircleAlert, Trash2 } from "@lucide/svelte";
  import SlideOver from "../marketing/SlideOver.svelte";

  export let supabase;
  export let event = null;
  export let isAdmin = false;
  export let onClose = () => {};
  export let onSaved = () => {};
  export let onDeleted = () => {};

  const eventColumns =
    "id, slug, title, image_src, image_frame_class, image_class, date_label, time_label, starts_on, ends_on, location, address, description, registration_link, registration_label, featured, recurring, tags, published, sort_order, created_at, updated_at";

  let drawerOpen = false;
  let isSaving = false;
  let isDeleting = false;
  let errorMessage = "";
  let successMessage = "";
  let form = emptyForm();
  let displayedEventId = "";
  let isNew = false;

  $: if (event && (event.id || "new") !== displayedEventId) {
    openDrawer(event);
  }

  function emptyForm() {
    return {
      slug: "",
      title: "",
      image_src: "",
      date_label: "",
      time_label: "",
      starts_on: "",
      ends_on: "",
      location: "",
      address: "",
      description: "",
      registration_link: "",
      registration_label: "",
      featured: false,
      recurring: false,
      tags: "",
      published: true,
      sort_order: 0,
    };
  }

  function openDrawer(nextEvent) {
    isNew = !nextEvent.id;
    displayedEventId = nextEvent.id || "new";
    errorMessage = "";
    successMessage = "";
    form = {
      ...emptyForm(),
      ...Object.fromEntries(
        Object.entries(nextEvent).filter(([, value]) => value !== null),
      ),
      tags: Array.isArray(nextEvent.tags) ? nextEvent.tags.join(", ") : "",
    };
    drawerOpen = true;
  }

  function requestClose() {
    if (isSaving || isDeleting) return;
    drawerOpen = false;
  }

  function handleClose() {
    drawerOpen = false;
    displayedEventId = "";
    onClose();
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function saveEvent(domEvent) {
    domEvent?.preventDefault();
    if (isSaving) return;

    const title = form.title.trim();
    const slug = slugify(form.slug.trim() || title);

    if (!title || !slug) {
      errorMessage = "A title (and slug) are required.";
      return;
    }

    isSaving = true;
    errorMessage = "";
    successMessage = "";

    const payload = {
      slug,
      title,
      image_src: form.image_src.trim() || null,
      date_label: form.date_label.trim() || null,
      time_label: form.time_label.trim() || null,
      starts_on: form.starts_on || null,
      ends_on: form.ends_on || null,
      location: form.location.trim() || null,
      address: form.address.trim() || null,
      description: form.description.trim() || null,
      registration_link: form.registration_link.trim() || null,
      registration_label: form.registration_label.trim() || null,
      featured: Boolean(form.featured),
      recurring: Boolean(form.recurring),
      tags: form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      published: Boolean(form.published),
      sort_order: Number(form.sort_order) || 0,
    };

    const query = isNew
      ? supabase.from("events").insert(payload)
      : supabase.from("events").update(payload).eq("id", event.id);

    const { data, error } = await query.select(eventColumns).single();

    if (error) {
      errorMessage = error.message.includes("duplicate")
        ? `The slug "${slug}" is already in use.`
        : error.message;
      isSaving = false;
      return;
    }

    onSaved(data);
    successMessage = isNew ? "Event created." : "Event saved.";
    isNew = false;
    displayedEventId = data.id;
    isSaving = false;
  }

  async function deleteEvent() {
    if (isNew || !event?.id || isDeleting) return;

    const shouldDelete = window.confirm(
      `Delete "${form.title}" from the public events page? This cannot be undone.`,
    );
    if (!shouldDelete) return;

    isDeleting = true;
    errorMessage = "";

    const { error } = await supabase.from("events").delete().eq("id", event.id);

    if (error) {
      errorMessage = error.message;
      isDeleting = false;
      return;
    }

    isDeleting = false;
    onDeleted(event.id);
    requestClose();
  }
</script>

<SlideOver
  open={drawerOpen}
  title={form.title || "Untitled event"}
  eyebrow={isNew ? "New event" : "Edit event"}
  closeLabel="Close event editor"
  closeDisabled={isSaving || isDeleting}
  onClose={requestClose}
  onClosed={handleClose}
>
  {#if displayedEventId}
    <form class="flex min-h-full flex-col" onsubmit={saveEvent}>
      <div class="flex-1 px-5 py-5">
        {#if errorMessage}
          <div class="mb-4 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        {/if}

        {#if successMessage}
          <div class="mb-4 flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
        {/if}

        <div class="space-y-4">
          <label class="block text-sm font-bold">
            Title
            <input
              type="text"
              class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={form.title}
              required
            />
          </label>

          <label class="block text-sm font-bold">
            Slug
            <input
              type="text"
              class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={form.slug}
              placeholder="auto-generated from title"
            />
            <span class="mt-1 block text-xs font-normal text-gray-500">
              Used as the event's stable ID. Lowercase letters, numbers, dashes.
            </span>
          </label>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block text-sm font-bold">
              Date label
              <input
                type="text"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={form.date_label}
                placeholder="Sunday, June 14"
              />
            </label>
            <label class="block text-sm font-bold">
              Time label
              <input
                type="text"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={form.time_label}
                placeholder="1:00 PM - 4:15 PM"
              />
            </label>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block text-sm font-bold">
              Starts on
              <input
                type="date"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={form.starts_on}
              />
            </label>
            <label class="block text-sm font-bold">
              Ends on
              <input
                type="date"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={form.ends_on}
              />
            </label>
          </div>
          <p class="text-xs text-gray-500">
            The labels are what visitors see; the dates control ordering and expiry.
          </p>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block text-sm font-bold">
              Location
              <input
                type="text"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={form.location}
                placeholder="LSP Studio"
              />
            </label>
            <label class="block text-sm font-bold">
              Address
              <input
                type="text"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={form.address}
                placeholder="949 W 16th St, Chicago, IL"
              />
            </label>
          </div>

          <label class="block text-sm font-bold">
            Description
            <textarea
              class="mt-2 min-h-28 w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-normal leading-6 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={form.description}
            ></textarea>
          </label>

          <label class="block text-sm font-bold">
            Image URL
            <input
              type="text"
              class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={form.image_src}
              placeholder="/images/my-event.png"
            />
            <span class="mt-1 block text-xs font-normal text-gray-500">
              Upload the image to the site's /public/images folder first, or paste a full URL.
            </span>
          </label>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block text-sm font-bold">
              Registration link
              <input
                type="text"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={form.registration_link}
                placeholder="https://www.zeffy.com/..."
              />
            </label>
            <label class="block text-sm font-bold">
              Registration button label
              <input
                type="text"
                class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                bind:value={form.registration_label}
                placeholder="Save Your Spot"
              />
            </label>
          </div>

          <label class="block text-sm font-bold">
            Tags
            <input
              type="text"
              class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={form.tags}
              placeholder="Free, Kids, Wellness"
            />
            <span class="mt-1 block text-xs font-normal text-gray-500">Comma separated.</span>
          </label>

          <div class="flex flex-wrap gap-4 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
            <label class="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" class="h-4 w-4 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]" bind:checked={form.published} />
              Published
            </label>
            <label class="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" class="h-4 w-4 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]" bind:checked={form.featured} />
              Featured
            </label>
            <label class="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" class="h-4 w-4 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]" bind:checked={form.recurring} />
              Recurring
            </label>
            <label class="flex items-center gap-2 text-sm font-bold">
              Sort order
              <input
                type="number"
                class="min-h-9 w-20 rounded-md border border-gray-200 bg-white px-2 text-sm font-normal outline-none transition focus:border-[#0f766e]"
                bind:value={form.sort_order}
              />
            </label>
          </div>

          {#if !isNew && isAdmin}
            <section class="rounded-md border border-red-200 bg-red-50/50 p-4">
              <h4 class="font-bold text-red-800">Danger zone</h4>
              <button
                type="button"
                class="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-red-300 bg-white px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                onclick={deleteEvent}
                disabled={isDeleting}
              >
                {#if isDeleting}
                  <span class="h-4 w-4 rounded-full border-2 border-red-700 border-t-transparent animate-spin" aria-hidden="true"></span>
                  Deleting
                {:else}
                  <Trash2 class="h-4 w-4" aria-hidden="true" />
                  Delete event
                {/if}
              </button>
            </section>
          {/if}
        </div>
      </div>

      <div class="flex gap-2 border-t border-black/10 p-4">
        <button
          type="button"
          class="flex min-h-11 flex-1 items-center justify-center rounded-md border border-black/10 px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
          onclick={requestClose}
        >
          Close
        </button>
        <button
          type="submit"
          class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 py-2.5 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
        >
          {#if isSaving}
            <span class="h-4 w-4 rounded-full border-2 border-[#1E1E1E] border-t-transparent animate-spin" aria-hidden="true"></span>
            Saving
          {:else}
            {isNew ? "Create event" : "Save changes"}
          {/if}
        </button>
      </div>
    </form>
  {/if}
</SlideOver>
