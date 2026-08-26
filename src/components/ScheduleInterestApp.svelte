<script>
    import { onMount } from "svelte";
    import { supabase, SUPABASE_CONFIG_ERROR } from "../lib/supabaseClient.js";
    import {
        activeShiftMonth,
        formatSlotTime,
        describeSlotKey,
        groupSlots,
        SERVICE_CLASS_MIN,
        SERVICE_CLASS_MAX,
    } from "../data/shiftInterest.js";

    const month = activeShiftMonth;
    const STORAGE_KEY = "lsp-shift-interest";

    const serviceClasses = Array.from(
        { length: SERVICE_CLASS_MAX - SERVICE_CLASS_MIN + 1 },
        (_, i) => SERVICE_CLASS_MIN + i,
    );

    // Live slot list from Supabase; admins open/fill/add slots in the
    // dashboard, so this is fetched instead of hardcoded.
    let slotRows = [];
    let slotsLoading = true;
    let slotsError = "";

    // Selected slot keys, e.g. "mon-lv-0600". Reassigned on every toggle so
    // legacy-mode reactivity picks it up.
    let selected = [];
    let savedSelection = [];

    let formName = "";
    let formEmail = "";
    let formServiceClass = "";
    let formNotes = "";

    let submitting = false;
    let submitError = "";
    let submitNotice = "";
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

    $: dayGroups = groupSlots(slotRows);
    $: openKeys = new Set(
        slotRows.filter((r) => r.status === "open").map((r) => r.slot_key),
    );

    onMount(() => {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                formName = saved.name || "";
                formEmail = saved.email || "";
                formServiceClass = saved.serviceClass || "";
                if (saved.monthSlug === month.slug && Array.isArray(saved.slots)) {
                    savedSelection = saved.slots;
                }
            }
        } catch {
            // Private mode or corrupt entry: the form just starts blank.
        }
        loadSlots();
    });

    async function loadSlots() {
        if (!supabase) {
            slotsLoading = false;
            slotsError = SUPABASE_CONFIG_ERROR;
            return;
        }
        slotsLoading = true;
        slotsError = "";

        const result = await withTimeout(
            supabase
                .from("shift_interest_slots")
                .select("slot_key, status")
                .eq("month_slug", month.slug),
            10000,
        );

        if (result === RPC_TIMEOUT || result.error) {
            slotsLoading = false;
            slotsError = "The shift list is taking too long to load. Please retry.";
            if (result?.error) {
                console.error("Shift slots load error:", result.error.message);
            }
            return;
        }

        slotRows = result.data || [];
        slotsLoading = false;

        // Restore this browser's earlier picks, dropping anything that has
        // been filled or removed since.
        const open = new Set(
            slotRows.filter((r) => r.status === "open").map((r) => r.slot_key),
        );
        selected = savedSelection.filter((k) => open.has(k));
    }

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
        if (!openKeys.has(key)) return;
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
        submitNotice = "";

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
            if (data?.reason === "slots_unavailable") {
                submitError =
                    "Those shifts were just filled. Refresh your picks and choose from what's still open.";
                loadSlots();
            } else if (data?.reason === "month_full") {
                submitError =
                    "This form isn't accepting more responses. Please reach out to the team directly.";
            } else {
                submitError =
                    "Something in the form looks off. Double-check your email and picks, then try again.";
            }
            return;
        }

        // The RPC drops any pick that got filled between page load and
        // submit; mirror what it actually kept.
        const accepted = Array.isArray(data.accepted) ? data.accepted : selected;
        if (accepted.length < selected.length) {
            submitNotice =
                "Heads up: some of your picks were filled while you were deciding, so they weren't included.";
            selected = accepted;
            loadSlots();
        }

        rememberSubmission();
        submittedCount = accepted.length;
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
    {:else if slotsLoading}
        <div class="space-y-6" aria-hidden="true">
            {#each [0, 1, 2] as i (i)}
                <div class="h-40 animate-pulse rounded-2xl bg-white/70 shadow-sm ring-1 ring-black/5"></div>
            {/each}
        </div>
    {:else if slotsError}
        <div class="rounded-2xl border border-red-200 bg-red-50 p-6 text-center" role="alert">
            <p class="font-body text-sm text-red-700">{slotsError}</p>
            <button
                type="button"
                class="mt-4 rounded-full bg-off-black px-6 py-2.5 font-sans text-sm font-bold text-white transition hover:bg-vibrant-pink"
                on:click={loadSlots}
            >
                Retry
            </button>
        </div>
    {:else if dayGroups.length === 0}
        <div class="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <p class="font-sans font-bold text-amber-800">
                Every {month.label} shift is spoken for.
            </p>
            <p class="mt-2 font-body text-sm text-amber-700">
                Check back soon: new shifts show up here as they open.
            </p>
        </div>
    {:else}
        <!-- Slot picker -->
        <div class="space-y-6">
            {#each dayGroups as group (group.day.id)}
                <section
                    class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6"
                    aria-label="{group.day.label} shifts"
                >
                    <div class="flex items-baseline justify-between gap-3">
                        <h3 class="font-sans text-lg font-extrabold text-off-black">
                            {group.day.label}
                        </h3>
                        {#if daySelectedCount(group.day, selected) > 0}
                            <span
                                class="rounded-full bg-vibrant-pink/10 px-3 py-1 font-sans text-xs font-bold text-vibrant-pink"
                            >
                                {daySelectedCount(group.day, selected)} picked
                            </span>
                        {/if}
                    </div>
                    <div class="mt-4 grid gap-5 {group.rooms.length > 1 ? 'sm:grid-cols-2' : ''}">
                        {#each group.rooms as { room, slots } (room.id)}
                            <div>
                                <p
                                    class="font-sans text-xs font-bold uppercase tracking-wider text-medium-gray"
                                >
                                    {room.name}
                                </p>
                                <div class="mt-2 flex flex-wrap gap-2">
                                    {#each slots as slot (slot.key)}
                                        {#if slot.status === "open"}
                                            {@const isOn = selected.includes(slot.key)}
                                            <button
                                                type="button"
                                                aria-pressed={isOn}
                                                class="min-h-10 rounded-full px-4 py-1.5 font-sans text-sm font-bold transition {isOn
                                                    ? 'bg-vibrant-pink text-white shadow-sm'
                                                    : 'bg-light-gray text-off-black hover:bg-vibrant-pink/15'}"
                                                on:click={() => toggleSlot(slot.key)}
                                            >
                                                {formatSlotTime(slot.time)}
                                            </button>
                                        {:else}
                                            <span
                                                class="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gray-100 px-4 py-1.5 font-sans text-sm font-bold text-gray-400 line-through decoration-gray-300"
                                            >
                                                {formatSlotTime(slot.time)}
                                                <span class="font-sans text-[10px] font-bold uppercase tracking-wide no-underline">
                                                    Filled
                                                </span>
                                            </span>
                                        {/if}
                                    {/each}
                                </div>
                            </div>
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
                            {describeSlotKey(key)}
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
                        {#if submitNotice}
                            <p class="mt-2 font-body text-sm text-emerald-700">
                                {submitNotice}
                            </p>
                        {/if}
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
