<script>
  import {
    SHIFT_CATEGORIES,
    composeLocalIso,
    findOperationalOverlaps,
    isOverlapError,
    toDateStr,
    toTimeInput,
  } from "../../../lib/dashboard/volunteersAdmin.js";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import Field from "../ui/Field.svelte";

  export let supabase;
  // null = closed; {} = create new; volunteer_shifts row = edit existing.
  export let opportunity = null;
  export let onClose = () => {};
  export let onSaved = () => {};

  const shiftColumns =
    "id, kind, category, title, description, location, starts_at, ends_at, lead_capacity, volunteer_capacity, cancelled, created_at, updated_at";

  let editing = null;
  let openToken = null;
  let drawerOpen = false;
  let isSaving = false;
  let errorMessage = "";

  let title = "";
  let description = "";
  let location = "";
  let date = "";
  let startTime = "09:00";
  let endTime = "11:00";
  let volunteerCapacity = 5;
  let leadCapacity = 0;
  let category = "special_event";

  $: if (opportunity && opportunity !== openToken) {
    openDrawer(opportunity);
  }

  function openDrawer(next) {
    openToken = next;
    editing = next?.id ? next : null;
    errorMessage = "";

    if (editing) {
      title = editing.title || "";
      description = editing.description || "";
      location = editing.location || "";
      const start = new Date(editing.starts_at);
      date = toDateStr(start);
      startTime = toTimeInput(editing.starts_at);
      endTime = toTimeInput(editing.ends_at);
      volunteerCapacity = editing.volunteer_capacity;
      leadCapacity = editing.lead_capacity;
      category = editing.category || "special_event";
    } else {
      title = "";
      description = "";
      location = "";
      date = toDateStr(new Date());
      startTime = "09:00";
      endTime = "11:00";
      volunteerCapacity = 5;
      leadCapacity = 0;
      category = "special_event";
    }

    drawerOpen = true;
  }

  function requestClose() {
    if (isSaving) return;
    drawerOpen = false;
  }

  function handleClose() {
    drawerOpen = false;
    openToken = null;
    editing = null;
    onClose();
  }

  async function save(event) {
    event?.preventDefault();
    if (isSaving) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      errorMessage = "A title is required.";
      return;
    }
    if (!date || !startTime || !endTime) {
      errorMessage = "Date, start time, and end time are required.";
      return;
    }

    const startsAt = composeLocalIso(date, startTime);
    const endsAt = composeLocalIso(date, endTime);
    if (new Date(endsAt) <= new Date(startsAt)) {
      errorMessage = "End time must be after the start time.";
      return;
    }

    isSaving = true;
    errorMessage = "";

    const payload = {
      kind: "opportunity",
      category,
      title: trimmedTitle,
      description: description.trim() || null,
      location: location.trim() || null,
      starts_at: startsAt,
      ends_at: endsAt,
      volunteer_capacity: Math.max(0, Number(volunteerCapacity) || 0),
      lead_capacity: Math.max(0, Number(leadCapacity) || 0),
    };

    if (category === "operational") {
      try {
        const { conflicts } = await findOperationalOverlaps(supabase, [payload], {
          excludeId: editing?.id || null,
        });
        if (conflicts.length) {
          errorMessage = `This opportunity ${conflicts[0].reason}. Operational shifts cannot overlap; pick another time or use the Special event / External category.`;
          isSaving = false;
          return;
        }
      } catch (err) {
        errorMessage = err?.message || "Could not check for overlapping shifts.";
        isSaving = false;
        return;
      }
    }

    const request = editing
      ? supabase
          .from("volunteer_shifts")
          .update(payload)
          .eq("id", editing.id)
          .select(shiftColumns)
          .single()
      : supabase
          .from("volunteer_shifts")
          .insert(payload)
          .select(shiftColumns)
          .single();

    const { data, error } = await request;

    if (error) {
      errorMessage = isOverlapError(error)
        ? "An operational shift already covers that time. Pick another time or use the Special event / External category."
        : error.message;
      isSaving = false;
      return;
    }

    isSaving = false;
    onSaved(data);
    requestClose();
  }
</script>

<SlideOver
  open={drawerOpen}
  title={editing ? "Edit opportunity" : "New opportunity"}
  eyebrow="Volunteer opportunity"
  closeLabel="Close opportunity editor"
  closeDisabled={isSaving}
  width="min(100vw, 30rem)"
  onClose={requestClose}
  onClosed={handleClose}
>
  {#if opportunity}
    <form class="flex min-h-full flex-col" onsubmit={save}>
      <div class="flex-1 px-5 py-5">
        {#if errorMessage}
          <Banner tone="error" message={errorMessage} class="mb-4" />
        {/if}

        <Field label="Title" id="opportunity-title">
          <input
            id="opportunity-title"
            type="text"
            class="input"
            placeholder="Community clean-up day"
            bind:value={title}
            disabled={isSaving}
          />
        </Field>

        <Field label="Description" id="opportunity-description" class="mt-4">
          <textarea
            id="opportunity-description"
            class="textarea"
            placeholder="What will volunteers help with?"
            bind:value={description}
            disabled={isSaving}
          ></textarea>
        </Field>

        <Field
          label="Type"
          id="opportunity-category"
          class="mt-4"
          hint="Operational shifts cover studio operations and can never overlap each other. Special events and external opportunities can overlap anything."
        >
          <select
            id="opportunity-category"
            class="select"
            bind:value={category}
            disabled={isSaving}
          >
            {#each SHIFT_CATEGORIES as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </Field>

        <Field label="Location" id="opportunity-location" class="mt-4">
          <input
            id="opportunity-location"
            type="text"
            class="input"
            placeholder="949 W 16th St, Chicago"
            bind:value={location}
            disabled={isSaving}
          />
        </Field>

        <Field label="Date" id="opportunity-date" class="mt-4">
          <input
            id="opportunity-date"
            type="date"
            class="input"
            bind:value={date}
            disabled={isSaving}
          />
        </Field>

        <div class="mt-4 grid grid-cols-2 gap-3">
          <Field label="Start time" id="opportunity-start">
            <input
              id="opportunity-start"
              type="time"
              class="input"
              bind:value={startTime}
              disabled={isSaving}
            />
          </Field>
          <Field label="End time" id="opportunity-end">
            <input
              id="opportunity-end"
              type="time"
              class="input"
              bind:value={endTime}
              disabled={isSaving}
            />
          </Field>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3">
          <Field label="Volunteer spots" id="opportunity-vol-cap">
            <input
              id="opportunity-vol-cap"
              type="number"
              min="0"
              class="input"
              bind:value={volunteerCapacity}
              disabled={isSaving}
            />
          </Field>
          <Field label="Lead spots" id="opportunity-lead-cap">
            <input
              id="opportunity-lead-cap"
              type="number"
              min="0"
              class="input"
              bind:value={leadCapacity}
              disabled={isSaving}
            />
          </Field>
        </div>
      </div>

      <div class="flex gap-3 border-t border-ink/8 p-4">
        <Button
          variant="secondary"
          class="min-h-11 flex-1"
          onclick={requestClose}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          class="min-h-11 flex-1"
          loading={isSaving}
          disabled={!title.trim()}
        >
          {isSaving ? "Saving" : editing ? "Save changes" : "Create opportunity"}
        </Button>
      </div>
    </form>
  {/if}
</SlideOver>
