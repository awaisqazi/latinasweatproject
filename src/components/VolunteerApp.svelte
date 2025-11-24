<script>
    import { onMount, tick } from "svelte";
    import { db } from "../lib/firebase";
    import {
        collection,
        onSnapshot,
        doc,
        runTransaction,
    } from "firebase/firestore";
    import { generateShifts } from "../lib/shiftUtils";
    import ShiftCard from "./ShiftCard.svelte";
    import MiniCalendar from "./MiniCalendar.svelte";
    import RegisterModal from "./RegisterModal.svelte";

    let shifts = [];
    let shiftData = {};
    let selectedDate = new Date();

    // --- FIX START ---

    // 1. Generate a standard key (YYYY-MM-DD)
    // We use hyphens because they are standard for IDs, but we won't use the browser to parse them back.
    const getSafeDateKey = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    // 2. PARSER: Manually reconstruct the Local Date from the key
    // This bypasses browser inconsistencies (iPhone vs Android) entirely.
    const parseDateKey = (key) => {
        if (!key) return new Date();
        const [y, m, d] = key.split("-").map(Number);
        return new Date(y, m - 1, d); // Month is 0-indexed in JS constructor
    };

    // --- FIX END ---

    // Week View State
    let currentWeekStart = new Date();
    currentWeekStart.setDate(
        currentWeekStart.getDate() - currentWeekStart.getDay(),
    );
    currentWeekStart.setHours(0, 0, 0, 0);

    // Modal State
    let isModalOpen = false;
    let selectedShift = null;
    let selectedRole = "";
    let isSubmitting = false;

    onMount(() => {
        shifts = generateShifts();
        const unsubscribe = onSnapshot(collection(db, "shifts"), (snapshot) => {
            const data = {};
            snapshot.forEach((doc) => {
                data[doc.id] = doc.data();
            });
            shiftData = data;
        });
        return () => unsubscribe();
    });

    let hideUnavailable = true;

    function isShiftUnavailable(shift) {
        const data = shiftData[shift.id] || { lead: 0, volunteer: 0 };
        const now = new Date();
        const lockTime = new Date(shift.start.getTime() - 24 * 60 * 60 * 1000);
        const isLocked = now >= lockTime || now >= shift.start;

        if (isLocked) return true;
        const isLeadFull = (data.lead || 0) >= 1;
        const isVolunteerFull = (data.volunteer || 0) >= 2;
        return isLeadFull && isVolunteerFull;
    }

    $: shiftsByDate = shifts.reduce((acc, shift) => {
        if (hideUnavailable && isShiftUnavailable(shift)) return acc;
        const dateKey = getSafeDateKey(shift.date);
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(shift);
        return acc;
    }, {});

    // FIX: Use parseDateKey for sorting
    $: sortedDates = Object.keys(shiftsByDate).sort(
        (a, b) => parseDateKey(a) - parseDateKey(b),
    );

    // FIX: Use parseDateKey for filtering
    $: visibleDates = sortedDates.filter((dateKey) => {
        const date = parseDateKey(dateKey);
        const endOfWeek = new Date(currentWeekStart);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        return date >= currentWeekStart && date <= endOfWeek;
    });

    function nextWeek() {
        const next = new Date(currentWeekStart);
        next.setDate(next.getDate() + 7);
        currentWeekStart = next;
    }

    function prevWeek() {
        const prev = new Date(currentWeekStart);
        prev.setDate(prev.getDate() - 7);
        currentWeekStart = prev;
    }

    async function handleDateSelect(event) {
        selectedDate = event.detail;
        const newWeekStart = new Date(selectedDate);
        newWeekStart.setDate(newWeekStart.getDate() - newWeekStart.getDay());
        newWeekStart.setHours(0, 0, 0, 0);
        currentWeekStart = newWeekStart;
        await tick();

        const dateKey = getSafeDateKey(selectedDate);
        const element = document.getElementById(`date-${dateKey}`);
        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    let touchStartX = 0;
    let touchEndX = 0;

    function handleTouchStart(e) {
        touchStartX = e.changedTouches[0].screenX;
    }

    function handleTouchEnd(e) {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }

    function handleSwipe() {
        if (touchEndX < touchStartX - 50) nextWeek();
        if (touchEndX > touchStartX + 50) prevWeek();
    }

    function openModal(event) {
        selectedShift = event.detail.shift;
        selectedRole = event.detail.role;
        isModalOpen = true;
    }

    async function handleRegistration(event) {
        isSubmitting = true;
        const { name, email, phone, shift, role } = event.detail;
        const shiftId = shift.id;
        const shiftRef = doc(db, "shifts", shiftId);
        try {
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(shiftRef);
                let currentData = { lead: 0, volunteer: 0, registrations: [] };
                if (sfDoc.exists()) {
                    currentData = sfDoc.data();
                }
                const capacity = role === "lead" ? 1 : 2;
                const currentCount = currentData[role] || 0;
                if (currentCount >= capacity) {
                    throw "Sorry, this spot was just taken!";
                }
                const newCount = currentCount + 1;
                const newRegistration = {
                    name,
                    email,
                    phone,
                    role,
                    timestamp: new Date().toISOString(),
                };
                transaction.set(shiftRef, {
                    ...currentData,
                    [role]: newCount,
                    registrations: [
                        ...(currentData.registrations || []),
                        newRegistration,
                    ],
                });
            });
            alert("Successfully registered!");
            isModalOpen = false;
        } catch (e) {
            console.error("Transaction failed: ", e);
            alert("Registration failed: " + e);
        } finally {
            isSubmitting = false;
        }
    }
</script>

<div class="max-w-7xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
    <div class="lg:w-1/3 xl:w-1/4">
        <div class="sticky top-24 space-y-6">
            <div class="bg-vibrant-pink rounded-2xl p-6 text-white shadow-xl">
                <h1 class="text-2xl font-bold font-rubik mb-2">
                    Volunteer Schedule
                </h1>
                <p class="opacity-90 text-sm">
                    Select a date to view available shifts and sign up.
                </p>
            </div>

            <MiniCalendar
                {shifts}
                {shiftData}
                {selectedDate}
                on:select={handleDateSelect}
            />

            <div
                class="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
            >
                <label class="flex items-center gap-3 cursor-pointer group">
                    <div class="relative">
                        <input
                            type="checkbox"
                            bind:checked={hideUnavailable}
                            class="sr-only peer"
                        />
                        <div
                            class="w-10 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-vibrant-pink/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-vibrant-pink"
                        ></div>
                    </div>
                    <span
                        class="text-sm font-medium text-gray-700 group-hover:text-gray-900"
                        >Hide Unavailable Shifts</span
                    >
                </label>
            </div>

            <div
                class="bg-blue-50 rounded-xl p-4 text-sm text-blue-800 shadow-sm"
            >
                <p class="font-bold mb-1">ℹ️ Note</p>
                <p>Registration closes 24 hours before each shift starts.</p>
            </div>
        </div>
    </div>

    <div
        class="flex-1 space-y-6"
        on:touchstart={handleTouchStart}
        on:touchend={handleTouchEnd}
    >
        <div
            class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 sticky top-0 z-20"
        >
            <button
                type="button"
                on:click={prevWeek}
                class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors flex items-center gap-2 cursor-pointer"
            >
                &larr; Previous Week
            </button>
            <span class="font-bold text-gray-800 hidden md:block">
                Week of {currentWeekStart.toLocaleDateString()}
            </span>
            <button
                type="button"
                on:click={nextWeek}
                class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors flex items-center gap-2 cursor-pointer"
            >
                Next Week &rarr;
            </button>
        </div>

        {#if visibleDates.length === 0}
            <div
                class="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-100"
            >
                <p class="text-lg">No shifts available for this week.</p>
                <p class="text-sm mt-2">Try navigating to a different week.</p>
            </div>
        {:else}
            {#each visibleDates as dateKey (dateKey)}
                <div id="date-{dateKey}" class="scroll-mt-32">
                    <h3
                        class="text-xl font-bold text-gray-800 mb-4 py-2 border-b border-gray-100"
                    >
                        {parseDateKey(dateKey).toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                        })}
                    </h3>

                    <div class="space-y-3">
                        {#each shiftsByDate[dateKey] as shift (shift.id)}
                            <ShiftCard
                                {shift}
                                taken={shiftData[shift.id] || {
                                    lead: 0,
                                    volunteer: 0,
                                }}
                                on:signup={openModal}
                            />
                        {/each}
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>

<RegisterModal
    isOpen={isModalOpen}
    shift={selectedShift}
    role={selectedRole}
    {isSubmitting}
    on:close={() => (isModalOpen = false)}
    on:submit={handleRegistration}
/>
