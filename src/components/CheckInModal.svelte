<script>
    import { createEventDispatcher } from "svelte";
    import { fade, scale } from "svelte/transition";

    export let isOpen = false;
    export let volunteerName = "";
    export let shiftDate = "";
    export let shiftTime = "";

    const dispatch = createEventDispatcher();

    function close() {
        dispatch("cancel");
    }

    function confirm() {
        dispatch("confirm");
    }
</script>

{#if isOpen}
    <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        role="dialog"
        aria-modal="true"
    >
        <!-- Backdrop -->
        <div
            class="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"
            transition:fade={{ duration: 200 }}
            on:click={close}
        ></div>

        <!-- Modal Panel -->
        <div
            class="relative w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left shadow-xl transition-all sm:my-8"
            transition:scale={{ duration: 200, start: 0.95 }}
        >
            <div class="text-center">
                <div
                    class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4"
                >
                    <svg
                        class="h-6 w-6 text-green-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                </div>
                <h3 class="text-lg font-semibold leading-6 text-gray-900">
                    Confirm Check-in
                </h3>
                <div class="mt-2">
                    <p class="text-sm text-gray-500">
                        Are you sure you want to check in <span
                            class="font-bold text-gray-800"
                            >{volunteerName}</span
                        >?
                    </p>
                    <div
                        class="mt-4 bg-gray-50 rounded-lg p-3 text-sm text-gray-600"
                    >
                        <p class="font-medium text-gray-900 mb-1">
                            Shift Details:
                        </p>
                        <p>{shiftDate}</p>
                        <p>{shiftTime}</p>
                    </div>
                </div>
            </div>

            <div class="mt-6 flex flex-col sm:flex-row-reverse gap-3">
                <button
                    type="button"
                    class="inline-flex w-full justify-center rounded-lg bg-vibrant-pink px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-pink-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600 sm:w-auto"
                    on:click={confirm}
                >
                    Confirm Check-in
                </button>
                <button
                    type="button"
                    class="inline-flex w-full justify-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:w-auto"
                    on:click={close}
                >
                    Cancel
                </button>
            </div>
        </div>
    </div>
{/if}
