<script>
    // Force HMR update
    import { createEventDispatcher } from "svelte";
    import { fade, scale } from "svelte/transition";

    export let isOpen = false;
    export let shift = null;
    export let role = "";
    export let isSubmitting = false;

    const dispatch = createEventDispatcher();

    let name = "";
    let email = "";
    let phone = "";

    function close() {
        dispatch("close");
        // Reset form
        name = "";
        email = "";
        phone = "";
    }

    function submit() {
        if (!name || !email || !phone) return;
        dispatch("submit", { name, email, phone, shift, role });
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
            on:keydown={(e) => e.key === "Escape" && close()}
            aria-label="Close modal"
        ></button>

        <!-- Modal -->
        <div
            class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden pointer-events-auto"
            transition:scale={{ duration: 200, start: 0.95 }}
            role="dialog"
            aria-modal="true"
        >
            <!-- Header -->
            <div class="bg-vibrant-pink p-6 text-white">
                <h2 class="text-2xl font-bold font-rubik">
                    Confirm Registration
                </h2>
                <p class="text-white/90 mt-1">
                    {role === "lead" ? "Volunteer Lead" : "General Volunteer"} •
                    {shift?.start.toLocaleDateString()}
                </p>
            </div>

            <!-- Form -->
            <form on:submit|preventDefault={submit}>
                <!-- Body -->
                <div class="p-6 space-y-4">
                    <div>
                        <label
                            for="name"
                            class="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Full Name
                        </label>
                        <input
                            id="name"
                            name="name"
                            type="text"
                            bind:value={name}
                            placeholder="Jane Doe"
                            autocomplete="name"
                            class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none transition-all"
                            required
                        />
                    </div>

                    <div>
                        <label
                            for="email"
                            class="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Email Address
                        </label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            bind:value={email}
                            placeholder="jane@example.com"
                            autocomplete="email"
                            class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none transition-all"
                            required
                        />
                    </div>

                    <div>
                        <label
                            for="phone"
                            class="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Phone Number
                        </label>
                        <input
                            id="phone"
                            name="phone"
                            type="tel"
                            bind:value={phone}
                            placeholder="(555) 123-4567"
                            autocomplete="tel"
                            class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none transition-all"
                            required
                        />
                    </div>
                </div>

                <!-- Footer -->
                <div class="p-6 bg-gray-50 flex gap-3 justify-end">
                    <button
                        type="button"
                        on:click={close}
                        class="px-4 py-2 rounded-lg text-gray-600 font-medium hover:bg-gray-100 transition-colors"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting || !name || !email || !phone}
                        class="px-6 py-2 rounded-lg bg-vibrant-pink text-white font-bold shadow-lg hover:bg-accent-gold hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                            Processing...
                        {:else}
                            Confirm Sign Up
                        {/if}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
