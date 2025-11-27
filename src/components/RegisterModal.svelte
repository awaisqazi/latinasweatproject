<script>
    // Force HMR update
    import { createEventDispatcher } from "svelte";
    import { fade, scale } from "svelte/transition";
    import {
        generateGoogleCalendarLink,
        generateICSFile,
    } from "../lib/calendarUtils";

    export let isOpen = false;
    export let shift = null;
    export let role = "";
    export let isSubmitting = false;
    export let success = false;
    export let successTitle = "";
    export let successMessage = "";

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

    function downloadICS() {
        const url = generateICSFile(shift);
        const a = document.createElement("a");
        a.href = url;
        a.download = "volunteer-shift.ics";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
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
            {#if success}
                <!-- Success State -->
                <div class="bg-vibrant-pink p-6 text-white text-center">
                    <div class="mb-4 text-6xl">🎉</div>
                    <h2 class="text-3xl font-bold font-rubik mb-2">
                        {successTitle || "You're Signed Up!"}
                    </h2>
                    <p class="text-white/90">
                        {successMessage ||
                            `Thanks for volunteering, ${name.split(" ")[0]}!`}
                    </p>
                </div>

                <div class="p-6 space-y-6">
                    <div
                        class="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100"
                    >
                        <div class="flex items-start gap-3">
                            <span class="text-xl">📅</span>
                            <div>
                                <p
                                    class="text-xs font-bold text-gray-500 uppercase tracking-wide"
                                >
                                    Date
                                </p>
                                <p class="font-medium text-gray-900">
                                    {shift?.start.toLocaleDateString("en-US", {
                                        weekday: "long",
                                        month: "long",
                                        day: "numeric",
                                    })}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <span class="text-xl">⏰</span>
                            <div>
                                <p
                                    class="text-xs font-bold text-gray-500 uppercase tracking-wide"
                                >
                                    Time
                                </p>
                                <p class="font-medium text-gray-900">
                                    {shift?.start.toLocaleTimeString("en-US", {
                                        hour: "numeric",
                                        minute: "2-digit",
                                    })} -
                                    {shift?.end.toLocaleTimeString("en-US", {
                                        hour: "numeric",
                                        minute: "2-digit",
                                    })}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-start gap-3">
                            <span class="text-xl">📍</span>
                            <div>
                                <p
                                    class="text-xs font-bold text-gray-500 uppercase tracking-wide"
                                >
                                    Location
                                </p>
                                <p class="font-medium text-gray-900">
                                    949 W 16th St, Chicago, IL 60608
                                </p>
                            </div>
                        </div>
                        <a
                            href={generateGoogleCalendarLink(shift)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="flex items-center justify-center gap-3 w-full px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all font-medium text-gray-700 shadow-sm group"
                        >
                            <svg
                                class="w-5 h-5"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                            >
                                <path
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    fill="#4285F4"
                                />
                                <path
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    fill="#34A853"
                                />
                                <path
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    fill="#FBBC05"
                                />
                                <path
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    fill="#EA4335"
                                />
                            </svg>
                            Add to Google Calendar
                        </a>
                        <button
                            on:click={downloadICS}
                            class="flex items-center justify-center gap-3 w-full px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all font-medium text-gray-700 shadow-sm"
                        >
                            <svg
                                class="w-5 h-5 text-gray-900"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                            >
                                <path
                                    d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.5-1.29.05-1.76-.74-3.26-.74-1.56 0-1.98.72-3.29.74-1.35.05-2.39-1.35-3.23-2.55-1.74-2.54-3.03-7.09-1.26-10.16 1.93-3.34 5.28-3.75 7.07-3.72 1.34.02 2.6.91 3.42.91.85 0 2.41-1.12 4.08-0.96 1.4.06 2.66.57 3.43 1.48-3.63 1.92-3.05 6.49.59 8.08-.32.94-.77 1.86-1.5 2.42zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.84 1.53-2.95 1.5-.15-1.15.41-2.35 1.05-3.19z"
                                />
                            </svg>
                            Add to Apple Calendar
                        </button>
                    </div>

                    <button
                        on:click={close}
                        class="w-full px-4 py-2 text-gray-500 hover:text-gray-700 font-medium text-sm transition-colors"
                    >
                        Close
                    </button>
                </div>
            {:else}
                <!-- Header -->
                <div class="bg-vibrant-pink p-6 text-white">
                    <h2 class="text-2xl font-bold font-rubik">
                        Confirm Registration
                    </h2>
                    <p class="text-white/90 mt-1">
                        {role === "lead"
                            ? "Volunteer Lead"
                            : "General Volunteer"} •
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
            {/if}
        </div>
    </div>
{/if}
