<script>
    import { createEventDispatcher, onDestroy } from "svelte";

    export let shift;
    export let taken = { lead: 0, volunteer: 0 }; // From Firestore

    const dispatch = createEventDispatcher();

    // Capacity
    const LEAD_CAPACITY = 1;
    const VOLUNTEER_CAPACITY = 2;

    // Time formatting
    const formatTime = (date) => {
        return date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
        });
    };

    // Lock logic: 24h before start OR in the past
    let now = new Date();

    // Update 'now' every minute to keep UI fresh
    const interval = setInterval(() => {
        now = new Date();
    }, 60000);

    onDestroy(() => clearInterval(interval));

    $: lockTime = new Date(shift.start.getTime() - 24 * 60 * 60 * 1000);
    $: isPast = now >= shift.start;
    $: isLocked = now >= lockTime || isPast;

    $: isLeadFull = taken.lead >= LEAD_CAPACITY;
    $: isVolunteerFull = taken.volunteer >= VOLUNTEER_CAPACITY;

    function handleSignup(role) {
        if (isLocked) return;
        if (role === "lead" && isLeadFull) return;
        if (role === "volunteer" && isVolunteerFull) return;

        dispatch("signup", { shift, role });
    }
</script>

<div
    class="bg-white/80 backdrop-blur-md border border-white/20 rounded-xl p-4 shadow-lg hover:shadow-xl transition-all duration-300 flex flex-col md:flex-row justify-between items-center gap-4 group"
>
    <div class="flex flex-col">
        <span class="text-lg font-bold text-gray-800 font-rubik">
            {formatTime(shift.start)} - {formatTime(shift.end)}
        </span>
        {#if isLocked}
            <span class="text-xs text-red-500 font-medium mt-1"
                >Registration Closed</span
            >
        {:else}
            <span class="text-xs text-gray-500 mt-1">
                {LEAD_CAPACITY - taken.lead} Lead left • {VOLUNTEER_CAPACITY -
                    taken.volunteer} Vol. left
            </span>
        {/if}
    </div>

    <div class="flex gap-3 w-full md:w-auto">
        <!-- Lead Button -->
        <button
            class="flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 border
      {isLocked || isLeadFull
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                : 'bg-off-black text-white border-off-black hover:bg-medium-gray hover:border-medium-gray hover:shadow-md'}"
            disabled={isLocked || isLeadFull}
            on:click={() => handleSignup("lead")}
        >
            {#if isLeadFull}
                Lead Full
            {:else}
                Lead
            {/if}
        </button>

        <!-- Volunteer Button -->
        <button
            class="flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 border
      {isLocked || isVolunteerFull
                ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                : 'bg-vibrant-pink text-white border-vibrant-pink hover:bg-accent-gold hover:border-accent-gold hover:shadow-md'}"
            disabled={isLocked || isVolunteerFull}
            on:click={() => handleSignup("volunteer")}
        >
            {#if isVolunteerFull}
                Vol. Full
            {:else}
                Volunteer
            {/if}
        </button>
    </div>
</div>
