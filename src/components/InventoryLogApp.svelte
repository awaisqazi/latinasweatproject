<script>
    import { onMount } from "svelte";
    import { supabase, SUPABASE_CONFIG_ERROR } from "../lib/supabaseClient";

    const NAME_STORAGE_KEY = "lsp_inventory_coordinator_name";
    const TURNSTILE_SCRIPT_SRC =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

    // Load / bootstrap state
    let loading = true;
    let loadError = "";

    // Data from the RPC
    let items = []; // [{ id, name, unit, sortOrder, lastQuantity, lastLoggedAt, count }]
    let lastLog = null; // { coordinatorName, createdAt } | null
    let turnstileSiteKey = null;

    // Form state
    let coordinatorName = "";
    let notes = "";

    // Turnstile state
    let turnstileToken = "";
    let turnstileWidgetId = null;
    let turnstileContainer; // bound DOM node
    let turnstileScriptRequested = false;

    // Submit state
    let saving = false;
    let submitError = "";

    // Success state
    let success = false;
    let successName = "";
    let successItems = []; // snapshot: [{ name, unit, quantity, delta }]
    let successLowItems = []; // [{ name, unit, quantity, threshold }]

    // ---- Loading / bootstrap ----------------------------------------------

    async function loadFormData() {
        loading = true;
        loadError = "";
        try {
            if (SUPABASE_CONFIG_ERROR || !supabase) {
                throw new Error(
                    SUPABASE_CONFIG_ERROR || "Inventory is not configured.",
                );
            }

            const { data, error } = await supabase.rpc(
                "get_inventory_form_data",
            );
            if (error) throw error;

            const payload = data || {};
            const rawItems = Array.isArray(payload.items) ? payload.items : [];

            items = rawItems.map((it) => {
                const last =
                    it.lastQuantity === null || it.lastQuantity === undefined
                        ? null
                        : Number(it.lastQuantity);
                return {
                    id: it.id,
                    name: it.name,
                    unit: it.unit,
                    sortOrder: it.sortOrder,
                    lastQuantity: last,
                    lastLoggedAt: it.lastLoggedAt || null,
                    // Initialize to the last count (0 when null).
                    count: last === null ? 0 : last,
                };
            });

            lastLog = payload.lastLog || null;
            turnstileSiteKey = payload.turnstileSiteKey || null;
        } catch (e) {
            console.error("Inventory form load failed:", e);
            loadError =
                "We couldn't load the inventory form. Please try again.";
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        // Prefill the coordinator name from a previous shift.
        try {
            const stored = window.localStorage.getItem(NAME_STORAGE_KEY);
            if (stored) coordinatorName = stored;
        } catch (e) {
            // localStorage may be unavailable (private mode); ignore.
        }

        loadFormData();
    });

    // ---- Turnstile --------------------------------------------------------

    // Render the widget once both the script and the container exist.
    function tryRenderTurnstile(siteKey, container) {
        if (!siteKey || !container) return;
        if (typeof window === "undefined" || !window.turnstile) return;
        if (turnstileWidgetId !== null) return;

        turnstileWidgetId = window.turnstile.render(container, {
            sitekey: siteKey,
            callback: (token) => {
                turnstileToken = token;
            },
            "expired-callback": () => {
                turnstileToken = "";
            },
            "error-callback": () => {
                turnstileToken = "";
            },
        });
    }

    // Load the Turnstile script exactly once, only on this page.
    function ensureTurnstileScript() {
        if (turnstileScriptRequested) return;
        turnstileScriptRequested = true;

        if (typeof window !== "undefined" && window.turnstile) {
            tryRenderTurnstile(turnstileSiteKey, turnstileContainer);
            return;
        }

        const existing = document.querySelector(
            `script[src="${TURNSTILE_SCRIPT_SRC}"]`,
        );
        const onReady = () =>
            tryRenderTurnstile(turnstileSiteKey, turnstileContainer);

        if (existing) {
            existing.addEventListener("load", onReady);
            return;
        }

        const script = document.createElement("script");
        script.src = TURNSTILE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.addEventListener("load", onReady);
        document.head.appendChild(script);
    }

    function resetTurnstile() {
        turnstileToken = "";
        if (
            typeof window !== "undefined" &&
            window.turnstile &&
            turnstileWidgetId !== null
        ) {
            window.turnstile.reset(turnstileWidgetId);
        }
    }

    // Once loaded (form visible) with a sitekey and container, wire up the widget.
    $: if (
        !loading &&
        !success &&
        turnstileSiteKey &&
        turnstileContainer &&
        !turnstileScriptRequested
    ) {
        ensureTurnstileScript();
    }

    // ---- Stepper helpers --------------------------------------------------

    function increment(item) {
        item.count = Math.max(0, Number(item.count) || 0) + 1;
        items = items;
    }

    function decrement(item) {
        item.count = Math.max(0, (Number(item.count) || 0) - 1);
        items = items;
    }

    // Keep the numeric input clamped to a non-negative integer.
    function normalizeCount(item) {
        let n = Math.floor(Number(item.count));
        if (!Number.isFinite(n) || n < 0) n = 0;
        item.count = n;
        items = items;
    }

    // Delta of a count vs its last recorded value (0 baseline when null).
    function deltaOf(count, lastQuantity) {
        const base = lastQuantity === null ? 0 : lastQuantity;
        return (Number(count) || 0) - base;
    }

    function deltaLabel(delta, lastQuantity) {
        if (lastQuantity === null) return "First count";
        if (delta === 0) return "No change";
        return delta > 0 ? `+${delta}` : `${delta}`;
    }

    function deltaClass(delta, lastQuantity) {
        if (lastQuantity === null || delta === 0)
            return "bg-gray-100 text-gray-600";
        return delta > 0
            ? "bg-green-100 text-green-700"
            : "bg-red-100 text-red-700";
    }

    // ---- Context strip ----------------------------------------------------

    function formatLastLogged(iso) {
        if (!iso) return "";
        const then = new Date(iso);
        if (Number.isNaN(then.getTime())) return "";

        const diffMs = Date.now() - then.getTime();
        const diffMin = Math.round(diffMs / 60000);

        if (diffMin < 1) return "just now";
        if (diffMin < 60)
            return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;

        const diffHr = Math.round(diffMin / 60);
        if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;

        const diffDays = Math.round(diffHr / 24);
        if (diffDays < 7)
            return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

        return then.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    }

    function firstNameOf(fullName) {
        const trimmed = (fullName || "").trim();
        if (!trimmed) return "there";
        return trimmed.split(/\s+/)[0];
    }

    // ---- Submit -----------------------------------------------------------

    const ERROR_MESSAGES = {
        invalid_name: "Please enter your first and last name.",
        invalid_notes: "Please shorten your note and try again.",
        invalid_counts:
            "Some counts look off. Please make sure each is a whole number of 0 or more.",
        captcha_missing:
            "Please complete the security check before submitting.",
        captcha_failed:
            "The security check didn't pass. Please try it again.",
    };

    $: canSubmit =
        !!coordinatorName.trim() && !!turnstileToken && !saving && !loading;

    async function handleSubmit() {
        submitError = "";

        if (!coordinatorName.trim()) {
            submitError = ERROR_MESSAGES.invalid_name;
            return;
        }
        if (!turnstileToken) {
            submitError = ERROR_MESSAGES.captcha_missing;
            return;
        }

        // Persist the name for next time.
        try {
            window.localStorage.setItem(
                NAME_STORAGE_KEY,
                coordinatorName.trim(),
            );
        } catch (e) {
            // ignore storage failures
        }

        saving = true;

        // Snapshot for the success screen, taken before any reset.
        const submittedName = coordinatorName.trim();
        const snapshot = items.map((it) => ({
            name: it.name,
            unit: it.unit,
            quantity: Math.max(0, Math.floor(Number(it.count)) || 0),
            delta: deltaOf(it.count, it.lastQuantity),
            lastQuantity: it.lastQuantity,
        }));

        try {
            const { data, error } = await supabase.functions.invoke(
                "inventory-log",
                {
                    body: {
                        coordinatorName: submittedName,
                        notes: notes.trim(),
                        counts: items.map((it) => ({
                            itemId: it.id,
                            quantity: Math.max(
                                0,
                                Math.floor(Number(it.count)) || 0,
                            ),
                        })),
                        turnstileToken,
                    },
                },
            );

            // Non-2xx responses surface as an error (FunctionsHttpError);
            // read the body to get the mapped reason.
            if (error) {
                let reason = "";
                try {
                    const body = await error.context.json();
                    reason = body?.reason || "";
                } catch (parseErr) {
                    reason = "";
                }
                submitError =
                    ERROR_MESSAGES[reason] ||
                    "Something went wrong saving your count. Please try again.";
                resetTurnstile();
                return;
            }

            if (!data?.ok) {
                submitError =
                    ERROR_MESSAGES[data?.reason] ||
                    "Something went wrong saving your count. Please try again.";
                resetTurnstile();
                return;
            }

            // Success.
            successName = firstNameOf(submittedName);
            successItems = snapshot;
            successLowItems = Array.isArray(data.lowItems)
                ? data.lowItems
                : [];
            success = true;
        } catch (e) {
            console.error("Inventory submit failed:", e);
            submitError =
                "Something went wrong saving your count. Please try again.";
            resetTurnstile();
        } finally {
            saving = false;
        }
    }

    // ---- Reset for another count ------------------------------------------

    async function logAnother() {
        // Clear success + form state and re-fetch so the just-logged counts
        // become the new baseline.
        success = false;
        successItems = [];
        successLowItems = [];
        successName = "";
        submitError = "";
        notes = "";

        // Re-render a fresh Turnstile widget on the next load.
        resetTurnstile();
        turnstileWidgetId = null;
        turnstileScriptRequested = false;

        await loadFormData();
    }
</script>

<div class="max-w-2xl mx-auto px-4 py-8">
    {#if loading}
        <!-- Loading state -->
        <div class="text-center py-16">
            <div
                class="animate-spin h-8 w-8 border-4 border-vibrant-pink border-t-transparent rounded-full mx-auto"
            ></div>
            <p class="text-gray-500 mt-4">Loading the inventory form...</p>
        </div>
    {:else if loadError}
        <!-- Load error state -->
        <div
            class="text-center py-12 px-6 bg-red-50 rounded-2xl border border-red-100"
        >
            <p class="text-lg font-medium text-red-700">{loadError}</p>
            <button
                type="button"
                on:click={loadFormData}
                class="mt-5 px-6 py-3 bg-vibrant-pink text-white rounded-lg font-bold hover:bg-accent-gold transition-colors cursor-pointer"
            >
                Try again
            </button>
        </div>
    {:else if success}
        <!-- Success screen -->
        <div class="space-y-6">
            <div
                class="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center"
            >
                <div
                    class="mx-auto w-14 h-14 rounded-full bg-green-100 flex items-center justify-center"
                >
                    <svg
                        class="w-8 h-8 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5 13l4 4L19 7"></path>
                    </svg>
                </div>
                <h2 class="text-2xl font-bold font-rubik text-off-black mt-4">
                    Inventory logged, thank you {successName}!
                </h2>
                <p class="text-gray-500 mt-2">
                    Here's what you recorded for this shift.
                </p>
            </div>

            <!-- Recorded summary -->
            <div
                class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
                <h3
                    class="text-sm font-bold uppercase tracking-wide text-gray-500 px-5 pt-5 pb-2"
                >
                    Recorded counts
                </h3>
                <ul class="divide-y divide-gray-100">
                    {#each successItems as item (item.name)}
                        <li
                            class="flex items-center justify-between gap-3 px-5 py-3"
                        >
                            <div class="min-w-0">
                                <p class="font-medium text-off-black truncate">
                                    {item.name}
                                </p>
                                <p class="text-sm text-gray-500">
                                    {item.quantity}
                                    {item.unit}
                                </p>
                            </div>
                            <span
                                class="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold {deltaClass(
                                    item.delta,
                                    item.lastQuantity,
                                )}"
                            >
                                {deltaLabel(item.delta, item.lastQuantity)}
                            </span>
                        </li>
                    {/each}
                </ul>
            </div>

            <!-- Low items panel -->
            {#if successLowItems.length > 0}
                <div
                    class="bg-amber-50 rounded-2xl border border-amber-200 p-5"
                >
                    <h3 class="font-bold text-amber-900 flex items-center gap-2">
                        <span class="text-lg">⚠️</span> Running low:
                    </h3>
                    <ul class="mt-3 space-y-1.5">
                        {#each successLowItems as low (low.name)}
                            <li class="text-sm text-amber-900">
                                <span class="font-semibold">{low.name}:</span>
                                {low.quantity}
                                {low.unit} left, low threshold {low.threshold}
                            </li>
                        {/each}
                    </ul>
                    <p class="text-sm text-amber-800 mt-3 font-medium">
                        The team has been notified to restock.
                    </p>
                </div>
            {/if}

            <button
                type="button"
                on:click={logAnother}
                class="w-full px-6 py-4 bg-vibrant-pink text-white rounded-lg font-bold hover:bg-accent-gold transition-colors cursor-pointer"
            >
                Log another count
            </button>
        </div>
    {:else}
        <!-- Main form -->
        <div class="space-y-6">
            <!-- Context strip -->
            {#if lastLog}
                <div
                    class="bg-white rounded-xl border border-gray-100 px-4 py-3 text-sm text-gray-600 shadow-sm"
                >
                    <span class="text-gray-500">Last logged by</span>
                    <span class="font-semibold text-off-black"
                        >{lastLog.coordinatorName}</span
                    >,
                    <span>{formatLastLogged(lastLog.createdAt)}</span>
                </div>
            {/if}

            <!-- Coordinator name -->
            <div
                class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
            >
                <label
                    for="coordinator-name"
                    class="block text-sm font-bold text-off-black mb-2"
                >
                    Your name <span class="text-vibrant-pink">*</span>
                </label>
                <input
                    id="coordinator-name"
                    type="text"
                    bind:value={coordinatorName}
                    placeholder="Your first and last name"
                    autocomplete="name"
                    class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-vibrant-pink focus:ring-2 focus:ring-vibrant-pink/30 focus:outline-none text-off-black"
                />
            </div>

            <!-- Item cards -->
            {#if items.length === 0}
                <div
                    class="text-center py-10 px-6 bg-white rounded-2xl border border-gray-100 text-gray-500"
                >
                    <p>No supplies are set up to track yet.</p>
                </div>
            {:else}
                <div class="space-y-4">
                    {#each items as item (item.id)}
                        {@const delta = deltaOf(item.count, item.lastQuantity)}
                        <div
                            class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
                        >
                            <div
                                class="flex items-start justify-between gap-3 mb-4"
                            >
                                <div class="min-w-0">
                                    <h3
                                        class="font-bold text-off-black text-lg leading-tight"
                                    >
                                        {item.name}
                                    </h3>
                                    <p class="text-sm text-gray-500 mt-0.5">
                                        Measured in {item.unit}
                                    </p>
                                    {#if item.lastQuantity === null}
                                        <p
                                            class="text-xs text-vibrant-pink font-medium mt-1"
                                        >
                                            First count for this supply
                                        </p>
                                    {/if}
                                </div>
                                <span
                                    class="flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold {deltaClass(
                                        delta,
                                        item.lastQuantity,
                                    )}"
                                >
                                    {deltaLabel(delta, item.lastQuantity)}
                                </span>
                            </div>

                            <!-- Stepper row -->
                            <div class="flex items-center justify-center gap-3">
                                <button
                                    type="button"
                                    aria-label={`Decrease ${item.name}`}
                                    on:click={() => decrement(item)}
                                    disabled={item.count <= 0}
                                    class="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-gray-100 text-off-black text-2xl font-bold hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    &minus;
                                </button>
                                <input
                                    type="number"
                                    min="0"
                                    inputmode="numeric"
                                    aria-label={`${item.name} count`}
                                    bind:value={item.count}
                                    on:blur={() => normalizeCount(item)}
                                    class="w-24 h-12 text-center text-2xl font-bold rounded-lg border border-gray-300 focus:border-vibrant-pink focus:ring-2 focus:ring-vibrant-pink/30 focus:outline-none text-off-black"
                                />
                                <button
                                    type="button"
                                    aria-label={`Increase ${item.name}`}
                                    on:click={() => increment(item)}
                                    class="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-vibrant-pink text-white text-2xl font-bold hover:bg-accent-gold transition-colors cursor-pointer"
                                >
                                    +
                                </button>
                            </div>
                            <p
                                class="text-center text-xs text-gray-400 mt-3"
                            >
                                {#if item.lastQuantity === null}
                                    No previous count
                                {:else}
                                    Last count: {item.lastQuantity}
                                    {item.unit}
                                {/if}
                            </p>
                        </div>
                    {/each}
                </div>
            {/if}

            <!-- Notes -->
            <div
                class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
            >
                <label
                    for="inventory-notes"
                    class="block text-sm font-bold text-off-black mb-2"
                >
                    Notes <span class="font-normal text-gray-400"
                        >(optional)</span
                    >
                </label>
                <textarea
                    id="inventory-notes"
                    bind:value={notes}
                    rows="3"
                    placeholder="Anything running low, damaged, or restocked?"
                    class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-vibrant-pink focus:ring-2 focus:ring-vibrant-pink/30 focus:outline-none text-off-black resize-y"
                ></textarea>
            </div>

            <!-- Security check -->
            <div
                class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
            >
                <p class="text-sm font-bold text-off-black mb-3">
                    Security check
                </p>
                {#if turnstileSiteKey}
                    <div bind:this={turnstileContainer}></div>
                {:else}
                    <div
                        class="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800"
                    >
                        The security check isn't configured yet, so the form
                        can't be submitted. Please let the team know.
                    </div>
                {/if}
            </div>

            <!-- Submit error -->
            {#if submitError}
                <div
                    class="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700"
                >
                    {submitError}
                </div>
            {/if}

            <!-- Submit -->
            <button
                type="button"
                on:click={handleSubmit}
                disabled={!canSubmit}
                class="w-full px-6 py-4 bg-vibrant-pink text-white rounded-lg font-bold hover:bg-accent-gold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
                {#if saving}
                    <span
                        class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"
                    ></span>
                    Saving...
                {:else}
                    Log inventory
                {/if}
            </button>

            <!-- Small print -->
            <p class="text-xs text-gray-400 text-center px-4">
                Your count replaces the previous one as the latest inventory.
                History is kept for trend tracking.
            </p>
        </div>
    {/if}
</div>
