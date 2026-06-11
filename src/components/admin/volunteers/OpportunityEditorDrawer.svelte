<script>
  import { CircleAlert } from "@lucide/svelte";
  import {
    SHIFT_CATEGORIES,
    composeLocalIso,
    findOperationalOverlaps,
    isOverlapError,
    toDateStr,
    toTimeInput,
  } from "../../../lib/dashboard/volunteersAdmin.js";
  import SlideOver from "../marketing/SlideOver.svelte";

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
          <div class="mb-4 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        {/if}

        <label class="block text-sm font-bold" for="opportunity-title">
          Title
          <input
            id="opportunity-title"
            type="text"
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            placeholder="Community clean-up day"
            bind:value={title}
            disabled={isSaving}
          />
        </label>

        <label class="mt-4 block text-sm font-bold" for="opportunity-description">
          Description
          <textarea
            id="opportunity-description"
            class="mt-2 min-h-24 w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-normal leading-6 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            placeholder="What will volunteers help with?"
            bind:value={description}
            disabled={isSaving}
          ></textarea>
        </label>

        <label class="mt-4 block text-sm font-bold" for="opportunity-category">
          Type
          <select
            id="opportunity-category"
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            bind:value={category}
            disabled={isSaving}
          >
            {#each SHIFT_CATEGORIES as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
          <span class="mt-1 block text-xs font-normal text-gray-500">
            Operational shifts cover studio operations and can never overlap each other.
            Special events and external opportunities can overlap anything.
          </span>
        </label>

        <label class="mt-4 block text-sm font-bold" for="opportunity-location">
          Location
          <input
            id="opportunity-location"
            type="text"
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            placeholder="949 W 16th St, Chicago"
            bind:value={location}
            disabled={isSaving}
          />
        </label>

        <label class="mt-4 block text-sm font-bold" for="opportunity-date">
          Date
          <input
            id="opportunity-date"
            type="date"
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            bind:value={date}
            disabled={isSaving}
          />
        </label>

        <div class="mt-4 grid grid-cols-2 gap-3">
          <label class="block text-sm font-bold" for="opportunity-start">
            Start time
            <input
              id="opportunity-start"
              type="time"
              class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={startTime}
              disabled={isSaving}
            />
          </label>
          <label class="block text-sm font-bold" for="opportunity-end">
            End time
            <input
              id="opportunity-end"
              type="time"
              class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={endTime}
              disabled={isSaving}
            />
          </label>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3">
          <label class="block text-sm font-bold" for="opportunity-vol-cap">
            Volunteer spots
            <input
              id="opportunity-vol-cap"
              type="number"
              min="0"
              class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={volunteerCapacity}
              disabled={isSaving}
            />
          </label>
          <label class="block text-sm font-bold" for="opportunity-lead-cap">
            Lead spots
            <input
              id="opportunity-lead-cap"
              type="number"
              min="0"
              class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
              bind:value={leadCapacity}
              disabled={isSaving}
            />
          </label>
        </div>
      </div>

      <div class="flex gap-3 border-t border-black/10 p-4">
        <button
          type="button"
          class="flex min-h-11 flex-1 items-center justify-center rounded-md border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
          onclick={requestClose}
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="submit"
          class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 py-2.5 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
          disabled={isSaving || !title.trim()}
        >
          {#if isSaving}
            <span class="h-4 w-4 rounded-full border-2 border-[#1E1E1E] border-t-transparent animate-spin" aria-hidden="true"></span>
            Saving
          {:else}
            {editing ? "Save changes" : "Create opportunity"}
          {/if}
        </button>
      </div>
    </form>
  {/if}
</SlideOver>
