<script>
    import { createEventDispatcher } from "svelte";
    import { fade, scale } from "svelte/transition";

    export let isOpen = false;
    export let isSubmitting = false;

    const dispatch = createEventDispatcher();

    let className = "";
    let instructorName = "";
    let instructorEmail = "";
    let date = "";
    let time = "09:00";
    let duration = 60;
    let location = "949 W 16th St, Chicago, IL 60608";
    let notes = "";

    function close() {
        dispatch("close");
    }

    function submit() {
        if (!className || !instructorName || !date || !time) {
            alert(
                "Please fill in required fields (Class Name, Your Name, Date, Time).",
            );
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
        date = "";
        time = "09:00";
        duration = 60;
        location = "949 W 16th St, Chicago, IL 60608";
        notes = "";
    }

    // Reset form when modal opens
    $: if (isOpen) {
        // Keep form values if re-opening (for error cases)
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
            <form on:submit|preventDefault={submit}>
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
                            <input
                                id="date"
                                type="date"
                                bind:value={date}
                                class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                required
                            />
                        </div>

                        <div>
                            <label
                                for="time"
                                class="block text-sm font-medium text-gray-700 mb-1"
                            >
                                Time *
                            </label>
                            <input
                                id="time"
                                type="time"
                                bind:value={time}
                                class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                required
                            />
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
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting ||
                            !className ||
                            !instructorName ||
                            !date ||
                            !time}
                        class="px-6 py-2 rounded-lg bg-vibrant-pink text-white font-bold shadow-lg hover:bg-accent-gold hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
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
                            Submit Request
                        {/if}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
