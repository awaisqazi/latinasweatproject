<script>
    import { onMount } from "svelte";
    import { supabase, SUPABASE_CONFIG_ERROR } from "../lib/supabaseClient.js";
    import {
        activeShiftMonth,
        slotKey,
        formatSlotTime,
        describeSlotKey,
        monthSlotKeys,
        monthRooms,
        monthDays,
        SERVICE_CLASS_MIN,
        SERVICE_CLASS_MAX,
    } from "../data/shiftInterest.js";

    const month = activeShiftMonth;
    // Only rooms and days that actually offer shifts this month.
    const rooms = monthRooms(month);
    const days = monthDays(month);
    const STORAGE_KEY = "lsp-shift-interest";
    const validKeys = new Set(monthSlotKeys(month));

    const serviceClasses = Array.from(
        { length: SERVICE_CLASS_MAX - SERVICE_CLASS_MIN + 1 },
        (_, i) => SERVICE_CLASS_MIN + i,
    );

    // Selected slot keys, e.g. "mon-lv-0600". Reassigned on every toggle so
    // legacy-mode reactivity picks it up.
    let selected = [];

    let formName = "";
    let formEmail = "";
    let formServiceClass = "";
    let formNotes = "";

    let submitting = false;
    let submitError = "";
    let submitted = false;
    let submittedCount = 0;
    let wasUpdate = false;

    let detailsSection;

    const RPC_TIMEOUT = { __timedOut: true };
    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((resolve) => setTimeout(() => resolve(RPC_TIMEOUT), ms)),
        ]);
    }

    onMount(() => {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            formName = saved.name || "";
            formEmail = saved.email || "";
            formServiceClass = saved.serviceClass || "";
            if (saved.monthSlug === month.slug && Array.isArray(saved.slots)) {
                selected = saved.slots.filter((k) => validKeys.has(k));
            }
        } catch {
            // Private mode or corrupt entry: the form just starts blank.
        }
    });

    function rememberSubmission() {
        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    name: formName,
                    email: formEmail,
                    serviceClass: formServiceClass,
                    monthSlug: month.slug,
                    slots: selected,
                }),
            );
        } catch {
            // Fine to skip; resubmitting with the same email still updates.
        }
    }

    function toggleSlot(key) {
        submitted = false;
        selected = selected.includes(key)
            ? selected.filter((k) => k !== key)
            : [...selected, key];
    }

    function clearSelection() {
        selected = [];
        submitted = false;
    }

    // Takes the selection as an argument so template calls re-run when it
    // changes (legacy mode doesn't track state read inside helpers).
    function daySelectedCount(day, sel) {
        const prefix = `${day.id}-`;
        return sel.filter((k) => k.startsWith(prefix)).length;
    }

    $: emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formEmail.trim());
    $: serviceClassValid =
        formServiceClass !== "" &&
        Number(formServiceClass) >= SERVICE_CLASS_MIN &&
        Number(formServiceClass) <= SERVICE_CLASS_MAX;
    $: canSubmit =
        selected.length > 0 &&
        formName.trim().length > 0 &&
        emailValid &&
        serviceClassValid &&
        !submitting;

    async function submit() {
        if (!canSubmit) return;
        if (!supabase) {
            submitError = SUPABASE_CONFIG_ERROR;
            return;
        }

        submitting = true;
        submitError = "";

        const result = await withTimeout(
            supabase.rpc("submit_shift_interest", {
                p_month_slug: month.slug,
                p_name: formName.trim(),
                p_email: formEmail.trim(),
                p_service_class: Number(formServiceClass),
                p_slot_keys: selected,
                p_notes: formNotes.trim() || null,
            }),
            12000,
        );

        submitting = false;

        if (result === RPC_TIMEOUT) {
            submitError =
                "That took too long to send. Please check your connection and try again.";
            return;
        }
        if (result.error) {
            console.error("Shift interest submit error:", result.error.message);
            submitError = "We couldn't save your response. Please try again.";
            return;
        }
        const data = result.data;
        if (!data?.ok) {
            submitError =
                data?.reason === "month_full"
                    ? "This form isn't accepting more responses. Please reach out to the team directly."
                    : "Something in the form looks off. Double-check your email and picks, then try again.";
            return;
        }

        rememberSubmission();
        submittedCount = selected.length;
        wasUpdate = data.result === "updated";
        submitted = true;
        submitError = "";
    }

    function scrollToDetails() {
        detailsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
</script>

<div class="space-y-8">
    {#if !month.open}
        <div class="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <p class="font-sans font-bold text-amber-800">
                The {month.label} shift interest form is closed.
            </p>
            <p class="mt-2 font-body text-sm text-amber-700">
                Keep an eye on the team group chat for next month's form.
            </p>
        </div>
    {:else}
        <!-- Slot picker -->
        <div class="space-y-6">
            {#each days as day (day.id)}
                <section
                    class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6"
                    aria-label="{day.label} shifts"
                >
                    <div class="flex items-baseline justify-between gap-3">
                        <h3 class="font-sans text-lg font-extrabold text-off-black">
                            {day.label}
                        </h3>
                        {#if daySelectedCount(day, selected) > 0}
                            <span
                                class="rounded-full bg-vibrant-pink/10 px-3 py-1 font-sans text-xs font-bold text-vibrant-pink"
                            >
                                {daySelectedCount(day, selected)} picked
                            </span>
                        {/if}
                    </div>
                    <div class="mt-4 grid gap-5 {rooms.length > 1 ? 'sm:grid-cols-2' : ''}">
                        {#each rooms as room (room.id)}
                            {#if (day.slots[room.id] || []).length}
                            <div>
                                <p
                                    class="font-sans text-xs font-bold uppercase tracking-wider text-medium-gray"
                                >
                                    {room.name}
                                </p>
                                <div class="mt-2 flex flex-wrap gap-2">
                                    {#each day.slots[room.id] || [] as time (time)}
                                        {@const key = slotKey(day.id, room.id, time)}
                                        {@const isOn = selected.includes(key)}
                                        <button
                                            type="button"
                                            aria-pressed={isOn}
                                            class="min-h-10 rounded-full px-4 py-1.5 font-sans text-sm font-bold transition {isOn
                                                ? 'bg-vibrant-pink text-white shadow-sm'
                                                : 'bg-light-gray text-off-black hover:bg-vibrant-pink/15'}"
                                            on:click={() => toggleSlot(key)}
                                        >
                                            {formatSlotTime(time)}
                                        </button>
                                    {/each}
                                </div>
                            </div>
                            {/if}
                        {/each}
                    </div>
                </section>
            {/each}
        </div>

        <!-- Sticky selection bar -->
        {#if selected.length > 0 && !submitted}
            <div class="sticky bottom-4 z-10">
                <div
                    class="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-full bg-off-black px-5 py-3 text-white shadow-lg"
                >
                    <p class="font-sans text-sm font-bold">
                        {selected.length}
                        {selected.length === 1 ? "shift" : "shifts"} selected
                    </p>
                    <div class="flex items-center gap-2">
                        <button
                            type="button"
                            class="rounded-full px-3 py-1.5 font-sans text-xs font-bold text-white/70 transition hover:text-white"
                            on:click={clearSelection}
                        >
                            Clear
                        </button>
                        <button
                            type="button"
                            class="rounded-full bg-vibrant-pink px-4 py-1.5 font-sans text-sm font-bold text-white transition hover:bg-pink-600"
                            on:click={scrollToDetails}
                        >
                            Continue
                        </button>
                    </div>
                </div>
            </div>
        {/if}

        <!-- Details + submit -->
        <section
            bind:this={detailsSection}
            class="scroll-mt-28 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8"
            aria-label="Your details"
        >
            <h3 class="font-sans text-xl font-extrabold text-off-black">
                Your details
            </h3>

            {#if selected.length > 0}
                <div class="mt-4 flex flex-wrap gap-2">
                    {#each [...selected].sort() as key (key)}
                        <button
                            type="button"
                            class="group inline-flex items-center gap-1.5 rounded-full bg-vibrant-pink/10 px-3 py-1 font-sans text-xs font-bold text-vibrant-pink transition hover:bg-vibrant-pink/20"
                            title="Remove this shift"
                            on:click={() => toggleSlot(key)}
                        >
                            {describeSlotKey(key, month)}
                            <span aria-hidden="true" class="text-vibrant-pink/60 group-hover:text-vibrant-pink">✕</span>
                        </button>
                    {/each}
                </div>
            {:else}
                <p class="mt-3 font-body text-sm text-medium-gray">
                    Pick at least one shift above, then fill this out.
                </p>
            {/if}

            <form class="mt-6 grid gap-5 sm:grid-cols-2" on:submit|preventDefault={submit}>
                <label class="block">
                    <span class="font-sans text-sm font-bold text-off-black">Name</span>
                    <input
                        type="text"
                        bind:value={formName}
                        required
                        maxlength="80"
                        autocomplete="name"
                        placeholder="Your name"
                        class="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-2.5 font-body text-off-black focus:border-vibrant-pink focus:outline-none focus:ring-2 focus:ring-vibrant-pink/30"
                    />
                </label>
                <label class="block">
                    <span class="font-sans text-sm font-bold text-off-black">Email</span>
                    <input
                        type="email"
                        bind:value={formEmail}
                        required
                        maxlength="160"
                        autocomplete="email"
                        placeholder="you@email.com"
                        class="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-2.5 font-body text-off-black focus:border-vibrant-pink focus:outline-none focus:ring-2 focus:ring-vibrant-pink/30"
                    />
                </label>
                <label class="block">
                    <span class="font-sans text-sm font-bold text-off-black">
                        What service class are you on?
                    </span>
                    <select
                        bind:value={formServiceClass}
                        required
                        class="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-body text-off-black focus:border-vibrant-pink focus:outline-none focus:ring-2 focus:ring-vibrant-pink/30"
                    >
                        <option value="" disabled>Select 1 to 25</option>
                        {#each serviceClasses as n (n)}
                            <option value={String(n)}>{n}</option>
                        {/each}
                    </select>
                </label>
                <label class="block sm:col-span-2">
                    <span class="font-sans text-sm font-bold text-off-black">
                        Anything else? <span class="font-normal text-medium-gray">(optional)</span>
                    </span>
                    <textarea
                        bind:value={formNotes}
                        rows="3"
                        maxlength="500"
                        placeholder="Preferences, constraints, or notes for the scheduling team"
                        class="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-2.5 font-body text-off-black focus:border-vibrant-pink focus:outline-none focus:ring-2 focus:ring-vibrant-pink/30"
                    ></textarea>
                </label>

                {#if submitError}
                    <p
                        class="rounded-xl bg-red-50 px-4 py-3 font-body text-sm text-red-700 sm:col-span-2"
                        role="alert"
                    >
                        {submitError}
                    </p>
                {/if}

                {#if submitted}
                    <div
                        class="rounded-xl bg-emerald-50 px-4 py-4 sm:col-span-2"
                        role="status"
                    >
                        <p class="font-sans font-bold text-emerald-800">
                            {wasUpdate ? "Response updated!" : "Got it, gracias!"}
                        </p>
                        <p class="mt-1 font-body text-sm text-emerald-700">
                            We saved your interest in {submittedCount}
                            {submittedCount === 1 ? "shift" : "shifts"} for
                            {month.label}. Change your mind? Adjust your picks
                            and submit again with the same email, it replaces
                            your earlier response.
                        </p>
                    </div>
                {:else}
                    <div class="sm:col-span-2">
                        <button
                            type="submit"
                            disabled={!canSubmit}
                            class="w-full rounded-full bg-off-black px-8 py-3.5 font-sans text-sm font-bold text-white transition enabled:hover:bg-vibrant-pink disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                        >
                            {submitting
                                ? "Sending..."
                                : `Submit ${selected.length || ""} ${selected.length === 1 ? "shift" : "shifts"}`}
                        </button>
                        <p class="mt-3 font-body text-xs text-gray-500">
                            Already submitted? Sending again with the same email
                            updates your earlier response.
                        </p>
                    </div>
                {/if}
            </form>
        </section>
    {/if}
</div>
