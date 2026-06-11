<script>
    import { onMount } from "svelte";
    import {
        getSupabaseClient,
        SUPABASE_CONFIG_ERROR,
    } from "../lib/supabaseClient";
    import {
        DOW_FULL,
        ROOM_SHORT,
        formatTime12,
        parseDateStr,
        timeToMinutes,
    } from "../lib/dashboard/spacesAdmin.js";

    const supabase = SUPABASE_CONFIG_ERROR ? null : getSupabaseClient();

    let loading = true;
    let loadError = null;
    let formOpen = false;
    let period = null;
    let slots = [];

    // Selected slot keys (room|day|time)
    let selected = new Set();
    let name = "";
    let email = "";
    let notes = "";

    let submitting = false;
    let submitError = null;
    let result = null; // { saved, duplicates } after a successful submit

    onMount(() => {
        if (!supabase) {
            loadError =
                "The form is temporarily unavailable. Please reach out to the team.";
            loading = false;
            return;
        }

        loadForm();
    });

    async function loadForm() {
        loading = true;
        loadError = null;

        const { data, error } = await supabase.rpc("get_open_schedule_form");

        if (error) {
            loadError = "Could not load the form. Please try again.";
            loading = false;
            return;
        }

        formOpen = Boolean(data?.open);
        period = data?.period || null;
        slots = data?.slots || [];
        loading = false;
    }

    function slotKey(slot) {
        return `${slot.room}|${slot.day_of_week}|${slot.start_time}`;
    }

    function toggleSlot(slot) {
        const key = slotKey(slot);
        if (selected.has(key)) {
            selected.delete(key);
        } else {
            selected.add(key);
        }
        selected = new Set(selected);
    }

    function endTime(slot) {
        const end =
            timeToMinutes(slot.start_time) + (slot.duration_minutes || 60);
        const h = Math.floor(end / 60) % 24;
        const m = end % 60;
        return formatTime12(`${h}:${String(m).padStart(2, "0")}`);
    }

    $: days = DOW_FULL.map((label, day) => ({
        label,
        slots: slots
            .filter((s) => Number(s.day_of_week) === day)
            .sort(
                (a, b) =>
                    timeToMinutes(a.start_time) - timeToMinutes(b.start_time) ||
                    String(a.room).localeCompare(String(b.room)),
            ),
    })).filter((d) => d.slots.length > 0);

    $: canSubmit =
        name.trim().length > 0 && email.trim().length > 0 && selected.size > 0;

    $: startsOnDisplay = period?.starts_on
        ? parseDateStr(period.starts_on).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
          })
        : "";

    async function handleSubmit(event) {
        event?.preventDefault();
        if (!canSubmit || submitting) return;

        submitting = true;
        submitError = null;

        const chosen = slots
            .filter((s) => selected.has(slotKey(s)))
            .map((s) => ({
                room: s.room,
                day_of_week: s.day_of_week,
                start_time: s.start_time,
                duration_minutes: s.duration_minutes,
                class_type: s.class_type,
            }));

        const { data, error } = await supabase.rpc("submit_slot_interest", {
            p_period_id: period.id,
            p_name: name.trim(),
            p_email: email.trim(),
            p_notes: notes.trim() || null,
            p_slots: chosen,
        });

        submitting = false;

        if (error) {
            submitError = "Something went wrong. Please try again.";
            return;
        }

        if (data?.ok) {
            result = data;
            return;
        }

        if (data?.reason === "closed") {
            formOpen = false;
            return;
        }

        submitError =
            "We couldn't save your response. Please check your details and try again.";
    }
</script>

<div class="max-w-3xl mx-auto px-4 py-8 space-y-6">
    {#if loadError}
        <div
            class="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-100 text-center"
        >
            <p class="font-bold">Something went wrong</p>
            <p class="text-sm mt-1">{loadError}</p>
            {#if supabase}
                <button
                    onclick={loadForm}
                    class="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-vibrant-pink hover:bg-pink-600 text-white transition-all duration-200 shadow-sm hover:shadow-md"
                >
                    Try again
                </button>
            {/if}
        </div>
    {:else if loading}
        <div class="text-center py-12">
            <div
                class="animate-spin rounded-full h-12 w-12 border-b-2 border-vibrant-pink mx-auto"
            ></div>
            <p class="mt-4 text-gray-500">Loading the schedule...</p>
        </div>
    {:else if result}
        <div
            class="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center"
        >
            <div
                class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
            >
                <svg
                    class="w-6 h-6 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                    ></path></svg
                >
            </div>
            <h2 class="mt-4 text-xl font-bold font-rubik text-gray-900">
                Thanks! We received your interest in {result.saved} slot{result.saved ===
                1
                    ? ""
                    : "s"}.
            </h2>
            {#if result.duplicates > 0}
                <p class="mt-2 text-sm text-gray-500">
                    {result.duplicates}
                    {result.duplicates === 1 ? "was" : "were"} already on file for
                    this email.
                </p>
            {/if}
            <p class="mt-2 text-sm text-gray-500">
                The team will reach out once the schedule is set.
            </p>
        </div>
    {:else if !formOpen}
        <div
            class="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center"
        >
            <h2 class="text-xl font-bold font-rubik text-gray-900">
                Scheduling isn't open right now.
            </h2>
            <p class="mt-2 text-gray-500">
                Check back soon or reach out to the team.
            </p>
        </div>
    {:else}
        <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 class="text-xl font-bold font-rubik text-gray-900">
                {period.title}
            </h2>
            {#if startsOnDisplay}
                <p class="mt-1 text-sm text-gray-500">
                    New schedule starts {startsOnDisplay}.
                </p>
            {/if}
            {#if period.notes}
                <p
                    class="mt-3 text-sm text-gray-700 bg-gray-50 rounded-xl p-3 border border-gray-100"
                >
                    {period.notes}
                </p>
            {/if}
        </div>

        {#if days.length === 0}
            <div
                class="text-center py-12 text-gray-500 bg-white rounded-2xl border border-gray-100"
            >
                <p class="text-lg">
                    No class slots are available yet. Check back soon.
                </p>
            </div>
        {:else}
            <div class="space-y-4">
                {#each days as day (day.label)}
                    <div
                        class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                    >
                        <div class="bg-gray-50 px-5 py-3 border-b border-gray-100">
                            <h3 class="font-bold text-gray-900">{day.label}</h3>
                        </div>
                        <div class="p-4 grid gap-3 sm:grid-cols-2">
                            {#each day.slots as slot (slotKey(slot))}
                                {@const isSelected = selected.has(slotKey(slot))}
                                <button
                                    type="button"
                                    onclick={() => toggleSlot(slot)}
                                    aria-pressed={isSelected}
                                    class="flex items-start gap-3 rounded-xl border p-4 text-left transition-all duration-150 {isSelected
                                        ? 'border-vibrant-pink bg-vibrant-pink/10 ring-2 ring-vibrant-pink/20'
                                        : 'border-gray-200 bg-white hover:border-gray-300'}"
                                >
                                    <span
                                        class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 {isSelected
                                            ? 'border-vibrant-pink bg-vibrant-pink'
                                            : 'border-gray-300 bg-white'}"
                                        aria-hidden="true"
                                    >
                                        {#if isSelected}
                                            <svg
                                                class="w-3.5 h-3.5 text-white"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                                ><path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="3"
                                                    d="M5 13l4 4L19 7"
                                                ></path></svg
                                            >
                                        {/if}
                                    </span>
                                    <span>
                                        <span
                                            class="block text-sm font-bold text-gray-900"
                                        >
                                            {formatTime12(slot.start_time)} - {endTime(
                                                slot,
                                            )}
                                        </span>
                                        {#if slot.class_type}
                                            <span
                                                class="block text-sm text-gray-700 mt-0.5"
                                            >
                                                {slot.class_type}
                                            </span>
                                        {/if}
                                        <span
                                            class="mt-1.5 inline-block rounded-full bg-accent-gold/25 px-2 py-0.5 text-xs font-medium text-gray-800"
                                        >
                                            {ROOM_SHORT[slot.room] || slot.room}
                                        </span>
                                    </span>
                                </button>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>

            <div class="sticky bottom-4 z-10">
                <form
                    class="bg-white rounded-2xl shadow-lg border border-gray-200 p-5 space-y-4"
                    onsubmit={handleSubmit}
                >
                    <p class="text-sm font-bold text-gray-900">
                        {selected.size} slot{selected.size === 1 ? "" : "s"} selected
                    </p>

                    {#if submitError}
                        <div
                            class="bg-red-50 text-red-700 p-3 rounded-xl border border-red-100 text-sm"
                        >
                            {submitError} You can adjust your picks and submit again.
                        </div>
                    {/if}

                    <div class="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label
                                for="interest-name"
                                class="block text-sm font-medium text-gray-700"
                            >
                                Name <span class="text-red-500" aria-hidden="true"
                                    >*</span
                                >
                            </label>
                            <input
                                id="interest-name"
                                type="text"
                                bind:value={name}
                                required
                                disabled={submitting}
                                class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-vibrant-pink focus:outline-none focus:ring-2 focus:ring-vibrant-pink/30"
                            />
                        </div>
                        <div>
                            <label
                                for="interest-email"
                                class="block text-sm font-medium text-gray-700"
                            >
                                Email <span class="text-red-500" aria-hidden="true"
                                    >*</span
                                >
                            </label>
                            <input
                                id="interest-email"
                                type="email"
                                bind:value={email}
                                required
                                disabled={submitting}
                                class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-vibrant-pink focus:outline-none focus:ring-2 focus:ring-vibrant-pink/30"
                            />
                        </div>
                    </div>

                    <div>
                        <label
                            for="interest-notes"
                            class="block text-sm font-medium text-gray-700"
                        >
                            Notes
                        </label>
                        <textarea
                            id="interest-notes"
                            rows="2"
                            bind:value={notes}
                            disabled={submitting}
                            placeholder="Anything we should know?"
                            class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-vibrant-pink focus:outline-none focus:ring-2 focus:ring-vibrant-pink/30"
                        ></textarea>
                    </div>

                    <button
                        type="submit"
                        disabled={!canSubmit || submitting}
                        class="w-full rounded-lg bg-vibrant-pink hover:bg-pink-600 px-4 py-3 text-sm font-bold text-white transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                        {submitting ? "Sending..." : "Submit interest"}
                    </button>
                </form>
            </div>
        {/if}
    {/if}
</div>
