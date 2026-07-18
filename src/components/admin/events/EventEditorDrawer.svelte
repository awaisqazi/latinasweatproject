<script>
  import { Trash2, UserPlus } from "@lucide/svelte";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Field from "../ui/Field.svelte";

  export let supabase;
  export let event = null;
  export let isAdmin = false;
  export let onClose = () => {};
  export let onSaved = () => {};
  export let onDeleted = () => {};
  export let onAssignTask = () => {};

  const eventColumns =
    "id, slug, title, image_src, image_frame_class, image_class, date_label, time_label, starts_on, ends_on, location, address, description, registration_link, registration_label, featured, recurring, tags, published, sort_order, created_at, updated_at";

  let drawerOpen = false;
  let isSaving = false;
  let isDeleting = false;
  let confirmingDelete = false;
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

    if (form.starts_on && form.ends_on && form.ends_on < form.starts_on) {
      errorMessage = "The end date can't be before the start date.";
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

    // Use displayedEventId, not the parent `event` prop: after a create the prop
    // still has no id, so subsequent saves must target the row we just created.
    const query = isNew
      ? supabase.from("events").insert(payload)
      : supabase.from("events").update(payload).eq("id", displayedEventId);

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

  function requestDelete() {
    if (!displayedEventId || displayedEventId === "new" || isDeleting) return;
    confirmingDelete = true;
  }

  async function deleteEvent() {
    if (!displayedEventId || displayedEventId === "new" || isDeleting) return;

    isDeleting = true;
    errorMessage = "";

    const { error } = await supabase.from("events").delete().eq("id", displayedEventId);

    if (error) {
      errorMessage = error.message;
      isDeleting = false;
      confirmingDelete = false;
      return;
    }

    isDeleting = false;
    confirmingDelete = false;
    onDeleted(displayedEventId);
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
          <Banner tone="error" message={errorMessage} class="mb-4" />
        {/if}

        {#if successMessage}
          <Banner tone="success" message={successMessage} class="mb-4" />
        {/if}

        {#if !isNew}
          <div class="mb-4">
            <Button
              size="sm"
              icon={UserPlus}
              onclick={() =>
                onAssignTask({
                  sourceModule: "events",
                  sourceLabel: `Event: ${form.title}`,
                  sourceLink: "#events",
                  sourceRef: event?.id ? `open:event:${event.id}` : null,
                  title: `Follow up: ${form.title}`,
                })}
            >
              Assign a task about this
            </Button>
          </div>
        {/if}

        <div class="space-y-4">
          <Field label="Title" id="event-form-title" required>
            <input
              id="event-form-title"
              type="text"
              class="input"
              bind:value={form.title}
              required
            />
          </Field>

          <Field
            label="Slug"
            id="event-form-slug"
            hint="Used as the event's stable ID. Lowercase letters, numbers, dashes."
          >
            <input
              id="event-form-slug"
              type="text"
              class="input"
              bind:value={form.slug}
              placeholder="auto-generated from title"
            />
          </Field>

          <div class="grid gap-3 sm:grid-cols-2">
            <Field label="Date label" id="event-form-date-label">
              <input
                id="event-form-date-label"
                type="text"
                class="input"
                bind:value={form.date_label}
                placeholder="Sunday, June 14"
              />
            </Field>
            <Field label="Time label" id="event-form-time-label">
              <input
                id="event-form-time-label"
                type="text"
                class="input"
                bind:value={form.time_label}
                placeholder="1:00 PM - 4:15 PM"
              />
            </Field>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <Field label="Starts on" id="event-form-starts-on">
              <input
                id="event-form-starts-on"
                type="date"
                class="input"
                bind:value={form.starts_on}
              />
            </Field>
            <Field label="Ends on" id="event-form-ends-on">
              <input
                id="event-form-ends-on"
                type="date"
                class="input"
                bind:value={form.ends_on}
              />
            </Field>
          </div>
          <p class="text-xs text-ink/50">
            The labels are what visitors see; the dates control ordering and expiry.
          </p>

          <div class="grid gap-3 sm:grid-cols-2">
            <Field label="Location" id="event-form-location">
              <input
                id="event-form-location"
                type="text"
                class="input"
                bind:value={form.location}
                placeholder="LSP Studio"
              />
            </Field>
            <Field label="Address" id="event-form-address">
              <input
                id="event-form-address"
                type="text"
                class="input"
                bind:value={form.address}
                placeholder="949 W 16th St, Chicago, IL"
              />
            </Field>
          </div>

          <Field label="Description" id="event-form-description">
            <textarea
              id="event-form-description"
              class="textarea"
              bind:value={form.description}
            ></textarea>
          </Field>

          <Field
            label="Image URL"
            id="event-form-image"
            hint="Upload the image to the site's /public/images folder first, or paste a full URL."
          >
            <input
              id="event-form-image"
              type="text"
              class="input"
              bind:value={form.image_src}
              placeholder="/images/my-event.png"
            />
          </Field>

          <div class="grid gap-3 sm:grid-cols-2">
            <Field label="Registration link" id="event-form-reg-link">
              <input
                id="event-form-reg-link"
                type="text"
                class="input"
                bind:value={form.registration_link}
                placeholder="https://www.zeffy.com/..."
              />
            </Field>
            <Field label="Registration button label" id="event-form-reg-label">
              <input
                id="event-form-reg-label"
                type="text"
                class="input"
                bind:value={form.registration_label}
                placeholder="Save Your Spot"
              />
            </Field>
          </div>

          <Field label="Tags" id="event-form-tags" hint="Comma separated.">
            <input
              id="event-form-tags"
              type="text"
              class="input"
              bind:value={form.tags}
              placeholder="Free, Kids, Wellness"
            />
          </Field>

          <div class="flex flex-wrap gap-4 rounded-control border border-ink/8 bg-canvas px-4 py-3">
            <label class="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" class="h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent" bind:checked={form.published} />
              Published
            </label>
            <label class="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" class="h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent" bind:checked={form.featured} />
              Featured
            </label>
            <label class="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" class="h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent" bind:checked={form.recurring} />
              Recurring
            </label>
            <label class="flex items-center gap-2 text-sm font-bold">
              Sort order
              <input
                type="number"
                class="input"
                style="width: 6rem;"
                bind:value={form.sort_order}
              />
            </label>
          </div>

          {#if !isNew && isAdmin}
            <section class="rounded-control border border-red-200 bg-red-50/50 p-4">
              <h4 class="font-bold text-red-800">Danger zone</h4>
              <Button
                variant="danger"
                icon={Trash2}
                class="mt-3"
                loading={isDeleting}
                onclick={requestDelete}
              >
                Delete event
              </Button>
            </section>
          {/if}
        </div>
      </div>

      <div class="flex gap-2 border-t border-ink/8 p-4">
        <Button variant="secondary" class="flex-1" onclick={requestClose}>
          Close
        </Button>
        <Button variant="primary" type="submit" class="flex-1" loading={isSaving}>
          {isNew ? "Create event" : "Save changes"}
        </Button>
      </div>
    </form>
  {/if}
</SlideOver>

<ConfirmDialog
  open={confirmingDelete}
  title="Delete this event?"
  message={`Delete "${form.title}" from the public events page? This cannot be undone.`}
  confirmLabel="Delete event"
  tone="danger"
  busy={isDeleting}
  onConfirm={deleteEvent}
  onCancel={() => (confirmingDelete = false)}
/>
