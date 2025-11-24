<script>
    import { createEventDispatcher } from "svelte";

    export let shiftData = {}; // Map of shiftId -> { lead: count, volunteer: count }
    export let shifts = []; // All generated shifts
    export let selectedDate = new Date();

    const dispatch = createEventDispatcher();

    // Helper to check if a shift is available
    function isShiftAvailable(shift) {
        const data = shiftData[shift.id] || { lead: 0, volunteer: 0 };

        // Check lock
        const now = new Date();
        const lockTime = new Date(shift.start.getTime() - 24 * 60 * 60 * 1000);
        const isLocked = now >= lockTime || now >= shift.start;

        if (isLocked) return false;

        // Check capacity
        const isLeadFull = (data.lead || 0) >= 1;
        const isVolunteerFull = (data.volunteer || 0) >= 2;

        return !isLeadFull || !isVolunteerFull;
    }

    // Calendar logic
    let currentMonth = new Date(selectedDate);
    currentMonth.setDate(1); // Start of month

    function nextMonth() {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        currentMonth = new Date(currentMonth);
    }

    function prevMonth() {
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        currentMonth = new Date(currentMonth);
    }

    $: year = currentMonth.getFullYear();
    $: month = currentMonth.getMonth();
    $: monthName = currentMonth.toLocaleString("default", { month: "long" });

    $: daysInMonth = new Date(year, month + 1, 0).getDate();
    $: firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun

    $: calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
        const date = new Date(year, month, i + 1);
        const dateString = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

        // Find shifts for this day
        const dayShifts = shifts.filter(
            (s) =>
                `${s.date.getFullYear()}/${s.date.getMonth() + 1}/${s.date.getDate()}` ===
                dateString,
        );

        // Check if ANY shift is available
        const hasAvailableShifts = dayShifts.some((s) => isShiftAvailable(s));

        const isSelected =
            `${selectedDate.getFullYear()}/${selectedDate.getMonth() + 1}/${selectedDate.getDate()}` ===
            dateString;
        const isPast = date < new Date().setHours(0, 0, 0, 0);

        // Only show "hasShifts" if there are actually available shifts
        return {
            date,
            day: i + 1,
            hasShifts: hasAvailableShifts,
            isSelected,
            isPast,
        };
    });

    function selectDate(date) {
        dispatch("select", date);
    }
</script>

<div class="bg-white rounded-xl shadow-lg p-4 border border-gray-100">
    <div class="flex justify-between items-center mb-4">
        <button
            type="button"
            on:click={prevMonth}
            class="p-1 hover:bg-gray-100 rounded-full text-gray-600"
        >
            &larr;
        </button>
        <span class="font-bold text-gray-800 font-rubik"
            >{monthName} {year}</span
        >
        <button
            type="button"
            on:click={nextMonth}
            class="p-1 hover:bg-gray-100 rounded-full text-gray-600"
        >
            &rarr;
        </button>
    </div>

    <div class="grid grid-cols-7 gap-1 text-center text-xs text-gray-400 mb-2">
        <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span
            >Th</span
        ><span>Fr</span><span>Sa</span>
    </div>

    <div class="grid grid-cols-7 gap-1">
        {#each Array(firstDayOfWeek) as _}
            <div></div>
        {/each}
        {#each calendarDays as day}
            <button
                type="button"
                class="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all duration-200 relative
        {day.isSelected ? 'bg-vibrant-pink text-white shadow-md scale-110' : ''}
        {!day.isSelected && day.hasShifts && !day.isPast
                    ? 'hover:bg-vibrant-pink/10 text-gray-700 font-medium'
                    : ''}
        {!day.hasShifts || day.isPast ? 'text-gray-300 cursor-default' : ''}"
                disabled={!day.hasShifts || day.isPast}
                on:click={() => selectDate(day.date)}
            >
                {day.day}
                {#if day.hasShifts && !day.isSelected && !day.isPast}
                    <div
                        class="absolute bottom-1 w-1 h-1 bg-vibrant-pink rounded-full"
                    ></div>
                {/if}
            </button>
        {/each}
    </div>
</div>
