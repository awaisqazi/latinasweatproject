<script>
    import { createEventDispatcher } from "svelte";

    export let requests = [];
    export let selectedDate = new Date();

    const dispatch = createEventDispatcher();

    // Helper: Consistent String comparison
    const toDateStr = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    let currentMonth = new Date(selectedDate);
    currentMonth.setDate(1);

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
    $: firstDayOfWeek = new Date(year, month, 1).getDay();

    // Group requests by date
    $: requestsByDate = requests.reduce((acc, req) => {
        const dateStr = toDateStr(new Date(req.date));
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(req);
        return acc;
    }, {});

    $: calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
        const date = new Date(year, month, i + 1);
        const dateString = toDateStr(date);

        const dayRequests = requestsByDate[dateString] || [];

        // Check for different statuses
        const hasOpen = dayRequests.some((r) => r.status === "open");
        const hasPending = dayRequests.some((r) => r.status === "pending");
        const hasFilled = dayRequests.some((r) => r.status === "approved");

        const hasRequests = dayRequests.length > 0;
        const isSelected = toDateStr(selectedDate) === dateString;
        const isPast = date < new Date().setHours(0, 0, 0, 0);

        return {
            date,
            day: i + 1,
            hasRequests,
            hasOpen,
            hasPending,
            hasFilled,
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
            class="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors cursor-pointer"
        >
            &larr;
        </button>
        <span class="font-bold text-gray-800 font-rubik"
            >{monthName} {year}</span
        >
        <button
            type="button"
            on:click={nextMonth}
            class="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors cursor-pointer"
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
                class="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all duration-200 relative cursor-pointer
                    {day.isSelected
                    ? 'bg-vibrant-pink text-white shadow-md scale-110'
                    : ''}
                    {!day.isSelected && day.hasRequests && !day.isPast
                    ? 'hover:bg-vibrant-pink/10 text-gray-700 font-medium'
                    : ''}
                    {!day.hasRequests || day.isPast ? 'text-gray-300' : ''}"
                on:click={() => selectDate(day.date)}
            >
                {day.day}
                {#if !day.isSelected && !day.isPast && (day.hasOpen || day.hasPending || day.hasFilled)}
                    <div
                        class="absolute bottom-0.5 flex gap-0.5 justify-center"
                    >
                        {#if day.hasOpen}
                            <div
                                class="w-1.5 h-1.5 bg-red-500 rounded-full"
                            ></div>
                        {/if}
                        {#if day.hasPending}
                            <div
                                class="w-1.5 h-1.5 bg-yellow-500 rounded-full"
                            ></div>
                        {/if}
                        {#if day.hasFilled}
                            <div
                                class="w-1.5 h-1.5 bg-green-500 rounded-full"
                            ></div>
                        {/if}
                    </div>
                {/if}
            </button>
        {/each}
    </div>

    <!-- Legend -->
    <div
        class="mt-4 pt-3 border-t border-gray-100 flex flex-wrap justify-center gap-3 text-xs text-gray-600"
    >
        <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 bg-red-500 rounded-full"></div>
            <span>Open</span>
        </div>
        <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <span>Pending</span>
        </div>
        <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>Filled</span>
        </div>
    </div>
</div>
