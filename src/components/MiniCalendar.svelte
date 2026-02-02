<script>
    import { createEventDispatcher } from "svelte";

    export let shiftData = {};
    export let shifts = [];
    export let selectedDate = new Date();
    export let dotCondition = null;
    export let clickableCondition = null;
    // New: Pre-aggregated availability data from monthly_availability collection
    export let availabilityData = null;

    const dispatch = createEventDispatcher();

    // Helper: Consistent String comparison
    const toDateStr = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    function isShiftAvailable(shift) {
        const data = shiftData[shift.id] || { lead: 0, volunteer: 0 };
        const now = new Date();
        const lockTime = new Date(shift.start.getTime() - 24 * 60 * 60 * 1000);
        const isLocked = now >= lockTime || now >= shift.start;

        if (isLocked) return false;
        return !((data.lead || 0) >= 1 && (data.volunteer || 0) >= 2);
    }

    let currentMonth = new Date(selectedDate);
    currentMonth.setDate(1);

    function nextMonth() {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        currentMonth = new Date(currentMonth);
        dispatch("monthChange", currentMonth);
    }

    function prevMonth() {
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        currentMonth = new Date(currentMonth);
        dispatch("monthChange", currentMonth);
    }

    $: year = currentMonth.getFullYear();
    $: month = currentMonth.getMonth();
    $: monthName = currentMonth.toLocaleString("default", { month: "long" });
    $: daysInMonth = new Date(year, month + 1, 0).getDate();
    $: firstDayOfWeek = new Date(year, month, 1).getDay();

    $: calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
        const date = new Date(year, month, i + 1);
        const dateString = toDateStr(date);
        const isPast = date < new Date().setHours(0, 0, 0, 0);
        const isSelected = toDateStr(selectedDate) === dateString;

        // If we have aggregation data, use it for faster rendering
        if (
            availabilityData &&
            availabilityData.days &&
            availabilityData.days[dateString]
        ) {
            const dayInfo = availabilityData.days[dateString];
            const hasAvailableShifts = dayInfo.totalAvailable > 0;

            // Check lock time (24 hours before first shift)
            const now = new Date();
            const tomorrow = new Date(date);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const isLocked = now >= tomorrow;

            return {
                date,
                day: i + 1,
                isClickable: hasAvailableShifts && !isPast && !isLocked,
                showDot: hasAvailableShifts && !isPast && !isLocked,
                isSelected,
                isPast,
            };
        }

        // Fallback to traditional shift-based calculation
        const dayShifts = shifts.filter(
            (s) => (s.dateStr || toDateStr(s.date)) === dateString,
        );

        const isClickable = dayShifts.some((s) =>
            clickableCondition
                ? clickableCondition(s, shiftData)
                : isShiftAvailable(s),
        );

        const showDot = dayShifts.some((s) =>
            dotCondition ? dotCondition(s, shiftData) : isShiftAvailable(s),
        );

        return {
            date,
            day: i + 1,
            isClickable,
            showDot,
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
        {!day.isSelected && day.isClickable && !day.isPast
                    ? 'hover:bg-vibrant-pink/10 text-gray-700 font-medium'
                    : ''}
        {!day.isClickable || day.isPast ? 'text-gray-300 cursor-default' : ''}"
                disabled={!day.isClickable || day.isPast}
                on:click={() => selectDate(day.date)}
            >
                {day.day}
                {#if day.showDot && !day.isSelected && !day.isPast}
                    <div
                        class="absolute bottom-1 w-1 h-1 bg-vibrant-pink rounded-full"
                    ></div>
                {/if}
            </button>
        {/each}
    </div>
</div>
