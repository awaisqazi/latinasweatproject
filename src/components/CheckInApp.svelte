<script>
    import { onMount, onDestroy, tick } from "svelte";
    import { db } from "../lib/firebase";
    import {
        collection,
        onSnapshot,
        doc,
        runTransaction,
        query,
        where,
        documentId,
        Timestamp,
    } from "firebase/firestore";
    import { generateShifts } from "../lib/shiftUtils";
    import MiniCalendar from "./MiniCalendar.svelte";
    import CheckInModal from "./CheckInModal.svelte";

    let shifts = [];
    let generatedShifts = [];
    let customShifts = [];
    let shiftData = {};
    let loading = true;
    let error = null;
    let selectedDate = new Date();

    // Collapsible State
    let expandedShiftIds = new Set();
    let hideInactive = true;

    // Modal State
    let showModal = false;
    let selectedVolunteer = null;
    let selectedShift = null;
    let selectedIndex = -1;

    // Helper: Convert Date -> "YYYY-MM-DD" safely
    const toDateStr = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    // Helper: Get start of week (Sunday)
    const getStartOfWeek = (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        d.setDate(diff);
        return d;
    };

    // Helper: Add days to a Date string
    const addDays = (dateStr, days) => {
        const [y, m, d] = dateStr.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        date.setDate(date.getDate() + days);
        return toDateStr(date);
    };

    // State is tracked by STRINGS to be browser-safe
    let currentWeekStartStr = toDateStr(getStartOfWeek(new Date()));

    // Subscription management
    let unsubShifts;
    let unsubCustom;
    let currentSubscriptionKey = "";

    onMount(() => {
        try {
            generatedShifts = generateShifts();
        } catch (e) {
            console.error("Critical App Error:", e);
            error = "App failed to load: " + e.message;
            loading = false;
        }
    });

    onDestroy(() => {
        if (unsubShifts) unsubShifts();
        if (unsubCustom) unsubCustom();
    });

    // Reactive subscription based on visible week
    $: {
        if (currentWeekStartStr) {
            updateSubscriptionsForWeek(currentWeekStartStr);
        }
    }

    function updateSubscriptionsForWeek(weekStart) {
        const dStart = new Date(weekStart);
        const dEnd = new Date(dStart);
        dEnd.setDate(dEnd.getDate() + 6);

        const viewStartYear = dStart.getFullYear();
        const viewStartMonth = dStart.getMonth();
        const startOfFetch = new Date(viewStartYear, viewStartMonth, 1);

        const viewEndYear = dEnd.getFullYear();
        const viewEndMonth = dEnd.getMonth();
        const endOfFetch = new Date(
            viewEndYear,
            viewEndMonth + 1,
            0,
            23,
            59,
            59,
        );

        const key = `${startOfFetch.getTime()}-${endOfFetch.getTime()}`;
        if (key === currentSubscriptionKey) return;

        currentSubscriptionKey = key;
        subscribeToData(startOfFetch, endOfFetch);
    }

    function subscribeToData(start, end) {
        loading = true;
        if (unsubShifts) unsubShifts();
        if (unsubCustom) unsubCustom();

        try {
            const startId = toDateStr(start);
            const endBoundDate = new Date(end);
            endBoundDate.setDate(endBoundDate.getDate() + 1);
            const endId = toDateStr(endBoundDate);

            const shiftsQuery = query(
                collection(db, "shifts"),
                where(documentId(), ">=", startId),
                where(documentId(), "<", endId),
            );

            unsubShifts = onSnapshot(
                shiftsQuery,
                (snapshot) => {
                    const data = {};
                    snapshot.forEach((doc) => {
                        data[doc.id] = doc.data();
                    });
                    shiftData = data;
                    combineShifts();
                },
                (err) => {
                    console.error("Firestore Error:", err);
                    error = "Could not load data. Please refresh.";
                    loading = false;
                },
            );

            const customQuery = query(
                collection(db, "custom_shifts"),
                where("start", ">=", Timestamp.fromDate(start)),
                where("start", "<=", Timestamp.fromDate(end)),
            );

            unsubCustom = onSnapshot(
                customQuery,
                (snapshot) => {
                    const custom = [];
                    snapshot.forEach((doc) => {
                        const d = doc.data();
                        const start = d.start.toDate();
                        const end = d.end.toDate();
                        const date = new Date(start);
                        date.setHours(0, 0, 0, 0);

                        custom.push({
                            id: doc.id,
                            start,
                            end,
                            date,
                            dateStr: toDateStr(date),
                            isCustom: true,
                            leadCapacity: d.leadCapacity,
                            volunteerCapacity: d.volunteerCapacity,
                        });
                    });
                    customShifts = custom;
                    combineShifts();
                },
                (err) => {
                    console.error("Firestore Error (Custom):", err);
                },
            );
        } catch (e) {
            console.error("Critical App Error:", e);
            error = "App failed to load: " + e.message;
            loading = false;
        }
    }

    function combineShifts() {
        const activeGenerated = generatedShifts.filter((s) => {
            const data = shiftData[s.id];
            return !data?.cancelled;
        });

        const combined = [...activeGenerated, ...customShifts];
        combined.sort((a, b) => a.start - b.start);
        shifts = combined;
        loading = false;
    }

    // Grouping by Safe String Keys
    $: shiftsByDate = shifts.reduce((acc, shift) => {
        const data = shiftData[shift.id] || { registrations: [] };
        const registrations = data.registrations || [];
        const isEnded = isShiftEnded(shift);

        // Filter Logic
        if (hideInactive) {
            if (isEnded || registrations.length === 0) {
                return acc;
            }
        }

        const dateKey = shift.dateStr || toDateStr(shift.date);
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(shift);
        return acc;
    }, {});

    $: sortedDates = Object.keys(shiftsByDate).sort();

    // Filter by String Comparison (Week View)
    $: visibleDates = sortedDates.filter((dateKey) => {
        const endOfWeekStr = addDays(currentWeekStartStr, 6);
        return dateKey >= currentWeekStartStr && dateKey <= endOfWeekStr;
    });

    // Display Title
    $: currentWeekDisplay = (() => {
        const [y, m, d] = currentWeekStartStr.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString();
    })();

    function nextWeek() {
        currentWeekStartStr = addDays(currentWeekStartStr, 7);
    }

    function prevWeek() {
        currentWeekStartStr = addDays(currentWeekStartStr, -7);
    }

    async function handleDateSelect(event) {
        const date = event.detail;
        const weekStart = getStartOfWeek(date);
        currentWeekStartStr = toDateStr(weekStart);

        await tick();

        const dateKey = toDateStr(date);
        const element = document.getElementById(`date-${dateKey}`);
        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    // Toggle Collapsible
    function toggleShift(shiftId) {
        if (expandedShiftIds.has(shiftId)) {
            expandedShiftIds.delete(shiftId);
            expandedShiftIds = new Set(expandedShiftIds); // Trigger reactivity
        } else {
            expandedShiftIds.add(shiftId);
            expandedShiftIds = new Set(expandedShiftIds);
        }
    }

    // Check if shift is ended
    function isShiftEnded(shift) {
        return new Date() > shift.end;
    }

    // Custom Dot Condition for CheckInApp: Only show dots if there are registrations
    const checkInDotCondition = (shift, data) => {
        const regs = data[shift.id]?.registrations || [];
        return regs.length > 0;
    };

    // Custom Clickable Condition: Always clickable if shift exists (so users can see empty shifts)
    const checkInClickableCondition = (shift, data) => true;

    function handleCheckInClick(shift, volunteer, index) {
        selectedShift = shift;
        selectedVolunteer = volunteer;
        selectedIndex = index;
        showModal = true;
    }

    async function confirmCheckIn() {
        if (!selectedShift || selectedIndex === -1) return;

        const shiftId = selectedShift.id;
        const shiftRef = doc(db, "shifts", shiftId);

        try {
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(shiftRef);
                if (!sfDoc.exists()) throw "Shift does not exist!";

                const data = sfDoc.data();
                const registrations = data.registrations || [];

                if (!registrations[selectedIndex])
                    throw "Registration not found!";

                registrations[selectedIndex].checkedIn = true;
                registrations[selectedIndex].checkInTime =
                    new Date().toISOString();

                transaction.update(shiftRef, { registrations });
            });
            showModal = false;
        } catch (e) {
            console.error("Check-in failed: ", e);
            alert("Check-in failed: " + e);
        }
    }
</script>

<div class="max-w-7xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
    <!-- Sidebar -->
    <div class="lg:w-1/3 xl:w-1/4">
        <div class="sticky top-24 space-y-6">
            <div
                class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
            >
                <h1 class="text-2xl font-bold font-rubik text-gray-900 mb-2">
                    Volunteer Check-in
                </h1>
                <p class="text-gray-500 text-sm">
                    Manage volunteer attendance for upcoming shifts.
                </p>
            </div>

            <MiniCalendar
                {shifts}
                {shiftData}
                {selectedDate}
                dotCondition={checkInDotCondition}
                clickableCondition={checkInClickableCondition}
                on:select={handleDateSelect}
            />

            <!-- Filter Toggle -->
            <div
                class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between"
            >
                <span class="text-sm font-medium text-gray-700"
                    >Hide Inactive</span
                >
                <button
                    class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-vibrant-pink focus:ring-offset-2 {hideInactive
                        ? 'bg-vibrant-pink'
                        : 'bg-gray-200'}"
                    on:click={() => (hideInactive = !hideInactive)}
                    role="switch"
                    aria-checked={hideInactive}
                >
                    <span class="sr-only">Hide inactive shifts</span>
                    <span
                        class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {hideInactive
                            ? 'translate-x-6'
                            : 'translate-x-1'}"
                    ></span>
                </button>
            </div>

            <div
                class="bg-blue-50 rounded-xl p-4 text-sm text-blue-800 shadow-sm"
            >
                <p class="font-bold mb-1">ℹ️ Note</p>
                <p>Check-in is disabled after the shift ends.</p>
            </div>
        </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 space-y-6">
        <!-- Week Navigation -->
        <div
            class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 sticky top-0 z-20"
        >
            <button
                on:click={prevWeek}
                class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors flex items-center gap-2"
            >
                &larr; Previous Week
            </button>
            <span class="font-bold text-gray-800 hidden md:block"
                >Week of {currentWeekDisplay}</span
            >
            <button
                on:click={nextWeek}
                class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors flex items-center gap-2"
            >
                Next Week &rarr;
            </button>
        </div>

        {#if error}
            <div
                class="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 text-center"
            >
                <p class="font-bold">Something went wrong</p>
                <p class="text-sm">{error}</p>
            </div>
        {:else if loading}
            <div class="text-center py-12">
                <div
                    class="animate-spin rounded-full h-12 w-12 border-b-2 border-vibrant-pink mx-auto"
                ></div>
                <p class="mt-4 text-gray-500">Loading shifts...</p>
            </div>
        {:else if visibleDates.length === 0}
            <div
                class="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-100"
            >
                <p class="text-lg">
                    {hideInactive
                        ? "No shifts to check in to for this week."
                        : "No shifts found for this week."}
                </p>
                <p class="text-sm mt-2">Try navigating to a different week.</p>
            </div>
        {:else}
            {#each visibleDates as dateKey (dateKey)}
                <div id="date-{dateKey}" class="scroll-mt-32">
                    <h3
                        class="text-xl font-bold text-gray-800 mb-4 py-2 border-b border-gray-100"
                    >
                        {(() => {
                            const [y, m, d] = dateKey.split("-").map(Number);
                            return new Date(y, m - 1, d).toLocaleDateString(
                                "en-US",
                                {
                                    weekday: "long",
                                    month: "long",
                                    day: "numeric",
                                },
                            );
                        })()}
                    </h3>
                    <div class="space-y-4">
                        {#each shiftsByDate[dateKey] as shift (shift.id)}
                            {@const data = shiftData[shift.id] || {
                                registrations: [],
                            }}
                            {@const registrations = data.registrations || []}
                            {@const isEnded = isShiftEnded(shift)}
                            {@const isExpanded = expandedShiftIds.has(shift.id)}

                            <div
                                class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200 {isExpanded
                                    ? 'ring-2 ring-vibrant-pink/10'
                                    : ''}"
                            >
                                <!-- Header (Click to Toggle) -->
                                <button
                                    on:click={() => toggleShift(shift.id)}
                                    class="w-full text-left bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center gap-4 hover:bg-gray-100 transition-colors"
                                >
                                    <div>
                                        <div class="flex items-center gap-3">
                                            <p
                                                class="text-lg font-bold text-gray-900"
                                            >
                                                {shift.start.toLocaleTimeString(
                                                    "en-US",
                                                    {
                                                        hour: "numeric",
                                                        minute: "2-digit",
                                                    },
                                                )} -
                                                {shift.end.toLocaleTimeString(
                                                    "en-US",
                                                    {
                                                        hour: "numeric",
                                                        minute: "2-digit",
                                                    },
                                                )}
                                            </p>
                                            {#if isEnded}
                                                <span
                                                    class="px-2 py-0.5 rounded text-xs font-bold bg-gray-200 text-gray-600"
                                                    >Ended</span
                                                >
                                            {/if}
                                        </div>
                                        <p class="text-sm text-gray-500 mt-1">
                                            {registrations.length} Volunteer{registrations.length !==
                                            1
                                                ? "s"
                                                : ""}
                                        </p>
                                    </div>
                                    <div
                                        class="text-gray-400 transform transition-transform duration-200 {isExpanded
                                            ? 'rotate-180'
                                            : ''}"
                                    >
                                        <svg
                                            class="w-5 h-5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            ><path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M19 9l-7 7-7-7"
                                            ></path></svg
                                        >
                                    </div>
                                </button>

                                <!-- Body (Collapsible) -->
                                {#if isExpanded}
                                    <div class="divide-y divide-gray-100">
                                        {#if registrations.length === 0}
                                            <div
                                                class="p-8 text-center text-gray-400 italic"
                                            >
                                                No volunteers registered for
                                                this shift.
                                            </div>
                                        {:else}
                                            {#each registrations as reg, i}
                                                <div
                                                    class="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                                                >
                                                    <div class="flex-1">
                                                        <div
                                                            class="flex items-center gap-2 mb-1"
                                                        >
                                                            <h4
                                                                class="font-bold text-gray-900"
                                                            >
                                                                {reg.name}
                                                            </h4>
                                                            <span
                                                                class="text-xs px-2 py-0.5 rounded-full font-medium {reg.role ===
                                                                'lead'
                                                                    ? 'bg-purple-100 text-purple-700'
                                                                    : 'bg-pink-100 text-pink-700'}"
                                                            >
                                                                {reg.role ===
                                                                "lead"
                                                                    ? "Lead"
                                                                    : "Volunteer"}
                                                            </span>
                                                        </div>
                                                        <div
                                                            class="text-sm text-gray-500 space-y-0.5"
                                                        >
                                                            <p>{reg.email}</p>
                                                            <p>{reg.phone}</p>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        {#if reg.checkedIn}
                                                            <div
                                                                class="text-right"
                                                            >
                                                                <span
                                                                    class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
                                                                >
                                                                    <svg
                                                                        class="w-4 h-4"
                                                                        fill="none"
                                                                        stroke="currentColor"
                                                                        viewBox="0 0 24 24"
                                                                        ><path
                                                                            stroke-linecap="round"
                                                                            stroke-linejoin="round"
                                                                            stroke-width="2"
                                                                            d="M5 13l4 4L19 7"

                                                                        ></path></svg
                                                                    >
                                                                    Checked In
                                                                </span>
                                                                <span
                                                                    class="text-xs text-gray-400 mt-1 block"
                                                                >
                                                                    {#if reg.checkInTime}
                                                                        {(() => {
                                                                            try {
                                                                                return new Date(
                                                                                    reg.checkInTime,
                                                                                ).toLocaleString(
                                                                                    "en-US",
                                                                                    {
                                                                                        month: "short",
                                                                                        day: "numeric",
                                                                                        hour: "numeric",
                                                                                        minute: "2-digit",
                                                                                    },
                                                                                );
                                                                            } catch (e) {
                                                                                return "";
                                                                            }
                                                                        })()}
                                                                    {/if}
                                                                </span>
                                                            </div>
                                                        {:else}
                                                            <button
                                                                on:click={() =>
                                                                    handleCheckInClick(
                                                                        shift,
                                                                        reg,
                                                                        i,
                                                                    )}
                                                                disabled={isEnded}
                                                                class="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed {isEnded
                                                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                                                                    : 'bg-vibrant-pink hover:bg-pink-600 text-white hover:shadow-lg focus:ring-pink-200'}"
                                                            >
                                                                {isEnded
                                                                    ? "Ended"
                                                                    : "Check In"}
                                                            </button>
                                                        {/if}
                                                    </div>
                                                </div>
                                            {/each}
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>

<CheckInModal
    isOpen={showModal}
    volunteerName={selectedVolunteer ? selectedVolunteer.name : ""}
    shiftDate={selectedShift
        ? selectedShift.start.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
          })
        : ""}
    shiftTime={selectedShift
        ? `${selectedShift.start.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
          })} - ${selectedShift.end.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
          })}`
        : ""}
    on:confirm={confirmCheckIn}
    on:cancel={() => (showModal = false)}
/>
