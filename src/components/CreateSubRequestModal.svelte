<script>
    import { createEventDispatcher, onMount } from "svelte";
    import { fade, scale } from "svelte/transition";

    export let isOpen = false;
    export let isSubmitting = false;
    export let success = false; // New: shows success view when true

    const dispatch = createEventDispatcher();

    // Mobile detection
    let isMobile = false;
    onMount(() => {
        // Check if mobile device based on screen width or touch capability
        isMobile =
            window.matchMedia("(max-width: 768px)").matches ||
            "ontouchstart" in window ||
            navigator.maxTouchPoints > 0;
    });

    let className = "";
    let instructorName = "";
    let instructorEmail = "";
    let dateInput = ""; // User-entered date (flexible format)
    let timeInput = ""; // User-entered time (flexible format)
    let duration = 60;
    let location = "949 W 16th St, Chicago, IL 60608";
    let notes = "";

    // Confirmation step state
    let showConfirmation = false;

    function close() {
        showConfirmation = false;
        dispatch("close");
    }

    // Helper to check if form is valid
    $: isFormValid =
        className.trim() !== "" &&
        instructorName.trim() !== "" &&
        dateInput.trim() !== "" &&
        timeInput.trim() !== "";

    // Parse user-entered date to YYYY-MM-DD format
    function parseDateInput(input) {
        if (!input) return "";
        const cleaned = input.trim();

        // Already in YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
            return cleaned;
        }

        // Handle MM/DD/YYYY or MM-DD-YYYY prefix or suffix
        // Also handle 2-digit years
        const match = cleaned.match(
            /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/,
        );
        if (match) {
            const month = match[1].padStart(2, "0");
            const day = match[2].padStart(2, "0");
            let year = match[3];

            if (year.length === 2) {
                // If 2 digits, assume 20xx
                year = "20" + year;
            }

            // Basic bounds check
            const m = parseInt(month);
            const d = parseInt(day);
            const y = parseInt(year);
            if (m > 0 && m <= 12 && d > 0 && d <= 31 && y > 2000) {
                return `${year}-${month}-${day}`;
            }
        }

        return cleaned; // Fallback
    }

    // Parse user-entered time to HH:MM format
    function parseTimeInput(input) {
        if (!input) return "";
        const cleaned = input.trim().toUpperCase();

        // Already in HH:MM format (24h)
        if (/^\d{1,2}:\d{2}$/.test(cleaned)) {
            const [h, m] = cleaned.split(":");
            return `${h.padStart(2, "0")}:${m}`;
        }

        // 12h format with AM/PM: 10:00 AM, 10:00AM, 10 AM
        const match12 = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
        if (match12) {
            let hours = parseInt(match12[1]);
            const mins = match12[2] || "00";
            const period = match12[3].toUpperCase();

            if (period === "PM" && hours !== 12) hours += 12;
            if (period === "AM" && hours === 12) hours = 0;

            return `${String(hours).padStart(2, "0")}:${mins}`;
        }

        return cleaned;
    }

    function goToConfirmation() {
        if (!isFormValid) {
            alert(
                "Please fill in required fields (Class Name, Your Name, Date, Time).",
            );
            return;
        }
        showConfirmation = true;
    }

    function goBackToForm() {
        showConfirmation = false;
    }

    function confirmSubmit() {
        const date = parseDateInput(dateInput);
        const time = parseTimeInput(timeInput);

        // Final validation check for valid formats
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            alert(
                "Please enter a valid date format (MM/DD/YYYY or YYYY-MM-DD).",
            );
            return;
        }
        if (!/^\d{2}:\d{2}$/.test(time)) {
            alert("Please enter a valid time (e.g. 9:00 AM or 14:30).");
            return;
        }

        dispatch("submit", {
            className,
            instructorName,
            instructorEmail,
            date,
            time,
            duration,
            location,
            notes,
        });
    }

    function resetForm() {
        className = "";
        instructorName = "";
        instructorEmail = "";
        dateInput = "";
        timeInput = "";
        duration = 60;
        location = "949 W 16th St, Chicago, IL 60608";
        notes = "";
        showConfirmation = false;
    }

    // Format date for display in confirmation
    function formatDisplayDate(input) {
        const dateStr = parseDateInput(input);
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return input;
        const [y, m, d] = dateStr.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
        });
    }

    // Format time for display in confirmation
    function formatDisplayTime(input) {
        const timeStr = parseTimeInput(input);
        if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) return input;
        const [h, m] = timeStr.split(":").map(Number);
        const tempDate = new Date();
        tempDate.setHours(h, m);
        return tempDate.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
        });
    }

    // Reset confirmation state when modal opens
    $: if (isOpen) {
        // Keep form values if re-opening (for error cases)
    } else {
        showConfirmation = false;
    }
</script>

{#if isOpen}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        transition:fade={{ duration: 200 }}
    >
        <!-- Backdrop -->
        <button
            type="button"
            class="absolute inset-0 bg-black/50 backdrop-blur-sm w-full h-full border-0 cursor-default"
            on:click={close}
            aria-label="Close modal"
        ></button>

        <!-- Modal -->
        <div
            class="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden pointer-events-auto max-h-[90vh] overflow-y-auto"
            transition:scale={{ duration: 200, start: 0.95 }}
            role="dialog"
            aria-modal="true"
        >
            {#if success}
                <!-- SUCCESS VIEW -->
                <div class="bg-vibrant-pink p-6 text-white">
                    <div class="flex items-center gap-3">
                        <div class="bg-white/20 rounded-full p-2">
                            <svg
                                class="w-8 h-8 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M5 13l4 4L19 7"
                                ></path>
                            </svg>
                        </div>
                        <div>
                            <h2 class="text-2xl font-bold font-rubik">
                                Request Submitted!
                            </h2>
                            <p class="text-white/90 mt-1">
                                Your substitute request has been created
                            </p>
                        </div>
                    </div>
                </div>

                <div class="p-6 space-y-4">
                    <div
                        class="bg-green-50 rounded-xl p-4 border border-green-200"
                    >
                        <div class="flex items-start gap-3">
                            <span class="text-2xl">✅</span>
                            <div>
                                <p class="font-bold text-green-800">Success!</p>
                                <p class="text-green-700 text-sm mt-1">
                                    Your request for <strong>{className}</strong
                                    > has been posted. Instructors will be able to
                                    see it and volunteer to cover the class.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div
                        class="bg-blue-50 rounded-lg p-4 border border-blue-200"
                    >
                        <div class="flex items-start gap-3">
                            <span class="text-xl">ℹ️</span>
                            <div>
                                <p class="text-blue-800 text-sm">
                                    <strong>What's next?</strong> You'll be notified
                                    when someone volunteers. Check back on the substitute
                                    requests page to see updates.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="p-6 bg-gray-50 flex justify-end">
                    <button
                        type="button"
                        on:click={close}
                        class="px-6 py-2 rounded-lg bg-vibrant-pink text-white font-bold shadow-lg hover:bg-accent-gold hover:shadow-xl transition-all cursor-pointer"
                    >
                        Done
                    </button>
                </div>
            {:else if !showConfirmation}
                <!-- FORM VIEW -->
                <!-- Header -->
                <div class="bg-vibrant-pink p-6 text-white">
                    <h2 class="text-2xl font-bold font-rubik">
                        Request a Substitute
                    </h2>
                    <p class="text-white/90 mt-1">
                        Fill out the details for the class you need covered
                    </p>
                </div>

                <!-- Form -->
                <form on:submit|preventDefault={goToConfirmation}>
                    <div class="p-6 space-y-4">
                        <div class="grid gap-4 sm:grid-cols-2">
                            <div class="sm:col-span-2">
                                <label
                                    for="className"
                                    class="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Class Name *
                                </label>
                                <input
                                    id="className"
                                    type="text"
                                    bind:value={className}
                                    class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                    placeholder="e.g., Yoga Flow, Pilates, HIIT"
                                    required
                                />
                            </div>

                            <div>
                                <label
                                    for="instructorName"
                                    class="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Your Name *
                                </label>
                                <input
                                    id="instructorName"
                                    type="text"
                                    bind:value={instructorName}
                                    class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                    placeholder="Who needs the sub?"
                                    required
                                />
                            </div>

                            <div>
                                <label
                                    for="instructorEmail"
                                    class="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Your Email
                                </label>
                                <input
                                    id="instructorEmail"
                                    type="email"
                                    bind:value={instructorEmail}
                                    class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                    placeholder="instructor@email.com"
                                />
                            </div>

                            <div>
                                <label
                                    for="date"
                                    class="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Date *
                                </label>
                                {#if isMobile}
                                    <input
                                        id="date"
                                        type="date"
                                        value={dateInput}
                                        on:change={(e) =>
                                            (dateInput = e.currentTarget.value)}
                                        class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                        required
                                    />
                                {:else}
                                    <input
                                        id="date"
                                        type="text"
                                        bind:value={dateInput}
                                        placeholder="MM/DD/YYYY"
                                        class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                        required
                                    />
                                {/if}
                            </div>

                            <div>
                                <label
                                    for="time"
                                    class="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Time *
                                </label>
                                {#if isMobile}
                                    <input
                                        id="time"
                                        type="time"
                                        value={timeInput}
                                        on:change={(e) =>
                                            (timeInput = e.currentTarget.value)}
                                        class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                        required
                                    />
                                {:else}
                                    <input
                                        id="time"
                                        type="text"
                                        bind:value={timeInput}
                                        placeholder="e.g. 9:00 AM"
                                        class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                        required
                                    />
                                {/if}
                            </div>

                            <div>
                                <label
                                    for="duration"
                                    class="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Duration (minutes)
                                </label>
                                <input
                                    id="duration"
                                    type="number"
                                    bind:value={duration}
                                    class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                    min="15"
                                    max="180"
                                />
                            </div>

                            <div>
                                <label
                                    for="location"
                                    class="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Location
                                </label>
                                <input
                                    id="location"
                                    type="text"
                                    bind:value={location}
                                    class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                />
                            </div>

                            <div class="sm:col-span-2">
                                <label
                                    for="notes"
                                    class="block text-sm font-medium text-gray-700 mb-1"
                                >
                                    Notes (optional)
                                </label>
                                <textarea
                                    id="notes"
                                    bind:value={notes}
                                    rows="2"
                                    class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                    placeholder="Any additional details..."
                                ></textarea>
                            </div>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="p-6 bg-gray-50 flex gap-3 justify-end">
                        <button
                            type="button"
                            on:click={close}
                            class="px-4 py-2 rounded-lg text-gray-600 font-medium hover:bg-gray-100 transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!isFormValid}
                            class="px-6 py-2 rounded-lg bg-vibrant-pink text-white font-bold shadow-lg hover:bg-accent-gold hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                        >
                            Review Request →
                        </button>
                    </div>
                </form>
            {:else}
                <!-- CONFIRMATION VIEW -->
                <!-- Header -->
                <div class="bg-green-600 p-6 text-white">
                    <h2 class="text-2xl font-bold font-rubik">
                        Confirm Your Request
                    </h2>
                    <p class="text-white/90 mt-1">
                        Please review the details before submitting
                    </p>
                </div>

                <!-- Summary -->
                <div class="p-6 space-y-4">
                    <div class="bg-gray-50 rounded-xl p-4 space-y-3">
                        <div class="flex items-start gap-3">
                            <div
                                class="bg-vibrant-pink/10 rounded-full p-2 flex-shrink-0"
                            >
                                <svg
                                    class="w-5 h-5 text-vibrant-pink"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                    ></path>
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm text-gray-500">Class Name</p>
                                <p class="font-bold text-gray-900">
                                    {className}
                                </p>
                            </div>
                        </div>

                        <div class="flex items-start gap-3">
                            <div
                                class="bg-vibrant-pink/10 rounded-full p-2 flex-shrink-0"
                            >
                                <svg
                                    class="w-5 h-5 text-vibrant-pink"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                    ></path>
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm text-gray-500">
                                    Requested By
                                </p>
                                <p class="font-bold text-gray-900">
                                    {instructorName}
                                </p>
                                {#if instructorEmail}
                                    <p class="text-sm text-gray-600">
                                        {instructorEmail}
                                    </p>
                                {/if}
                            </div>
                        </div>

                        <div class="flex items-start gap-3">
                            <div
                                class="bg-vibrant-pink/10 rounded-full p-2 flex-shrink-0"
                            >
                                <svg
                                    class="w-5 h-5 text-vibrant-pink"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    ></path>
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm text-gray-500">Date & Time</p>
                                <p class="font-bold text-gray-900">
                                    {formatDisplayDate(dateInput)}
                                </p>
                                <p class="text-sm text-gray-600">
                                    {formatDisplayTime(timeInput)} • {duration} minutes
                                </p>
                            </div>
                        </div>

                        <div class="flex items-start gap-3">
                            <div
                                class="bg-vibrant-pink/10 rounded-full p-2 flex-shrink-0"
                            >
                                <svg
                                    class="w-5 h-5 text-vibrant-pink"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                    ></path>
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                    ></path>
                                </svg>
                            </div>
                            <div>
                                <p class="text-sm text-gray-500">Location</p>
                                <p class="font-bold text-gray-900">
                                    {location || "Not specified"}
                                </p>
                            </div>
                        </div>

                        {#if notes}
                            <div class="flex items-start gap-3">
                                <div
                                    class="bg-vibrant-pink/10 rounded-full p-2 flex-shrink-0"
                                >
                                    <svg
                                        class="w-5 h-5 text-vibrant-pink"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        ></path>
                                    </svg>
                                </div>
                                <div>
                                    <p class="text-sm text-gray-500">Notes</p>
                                    <p class="text-gray-700">{notes}</p>
                                </div>
                            </div>
                        {/if}
                    </div>

                    <!-- Info Alert -->
                    <div
                        class="bg-blue-50 rounded-lg p-4 border border-blue-200"
                    >
                        <div class="flex items-start gap-3">
                            <span class="text-xl">ℹ️</span>
                            <div>
                                <p class="text-blue-800 text-sm">
                                    Once submitted, instructors will be able to
                                    see this request and volunteer to cover the
                                    class.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div class="p-6 bg-gray-50 flex gap-3 justify-between">
                    <button
                        type="button"
                        on:click={goBackToForm}
                        class="px-4 py-2 rounded-lg text-gray-600 font-medium hover:bg-gray-100 transition-colors cursor-pointer flex items-center gap-2"
                        disabled={isSubmitting}
                    >
                        ← Edit Details
                    </button>
                    <button
                        type="button"
                        on:click={confirmSubmit}
                        disabled={isSubmitting}
                        class="px-6 py-2 rounded-lg bg-green-600 text-white font-bold shadow-lg hover:bg-green-700 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                    >
                        {#if isSubmitting}
                            <svg
                                class="animate-spin h-4 w-4 text-white"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    class="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    stroke-width="4"
                                ></circle>
                                <path
                                    class="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                            </svg>
                            Submitting...
                        {:else}
                            ✓ Confirm & Submit
                        {/if}
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}
