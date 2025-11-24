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
    let shiftData = {}; // Map of shiftId -> { lead: count, volunteer: count }
    let selectedDate = new Date();

    // Week View State
    let currentWeekStart = new Date();
    // Initialize to Sunday of current week
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
        // 1. Generate Shifts
        shifts = generateShifts();

        // 2. Subscribe to Firestore
        const unsubscribe = onSnapshot(collection(db, "shifts"), (snapshot) => {
            const data = {};
            snapshot.forEach((doc) => {
                data[doc.id] = doc.data();
            });
            shiftData = data;
        });

        return () => unsubscribe();
    });

    // Filter State
    let hideUnavailable = true;

    // Helper to check if a shift is unavailable
    function isShiftUnavailable(shift) {
        const data = shiftData[shift.id] || { lead: 0, volunteer: 0 };

        // Check lock
        const now = new Date();
        const lockTime = new Date(shift.start.getTime() - 24 * 60 * 60 * 1000);
        const isLocked = now >= lockTime || now >= shift.start;

        if (isLocked) return true;

        // Check capacity
        const isLeadFull = (data.lead || 0) >= 1;
        const isVolunteerFull = (data.volunteer || 0) >= 2;

        return isLeadFull && isVolunteerFull;
    }

    // Group shifts by date (filtered)
    $: shiftsByDate = shifts.reduce((acc, shift) => {
        if (hideUnavailable && isShiftUnavailable(shift)) return acc;

        const dateKey = `${shift.date.getFullYear()}/${shift.date.getMonth() + 1}/${shift.date.getDate()}`;
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(shift);
        return acc;
    }, {});

    $: sortedDates = Object.keys(shiftsByDate).sort(
        (a, b) => new Date(a) - new Date(b),
    );

    // Week View Logic
    $: visibleDates = sortedDates.filter((dateKey) => {
        const date = new Date(dateKey);
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
        // Update current week to match selected date
        const newWeekStart = new Date(selectedDate);
        newWeekStart.setDate(newWeekStart.getDate() - newWeekStart.getDay());
        newWeekStart.setHours(0, 0, 0, 0);
        currentWeekStart = newWeekStart;

        // Wait for DOM to update
        await tick();

        const dateKey = `${selectedDate.getFullYear()}/${selectedDate.getMonth() + 1}/${selectedDate.getDate()}`;
        const element = document.getElementById(`date-${dateKey}`);
        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    // Swipe Logic
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

                // Check capacity again inside transaction
                const capacity = role === "lead" ? 1 : 2;
                const currentCount = currentData[role] || 0;

                if (currentCount >= capacity) {
                    throw "Sorry, this spot was just taken!";
                }

                // Update count and add registration
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
    <!-- Sidebar (Calendar) -->
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

            <!-- Note Section (Cleaned up) -->
            <div
                class="bg-blue-50 rounded-xl p-4 text-sm text-blue-800 shadow-sm"
            >
                <p class="font-bold mb-1">ℹ️ Note</p>
                <p>Registration closes 24 hours before each shift starts.</p>
            </div>
        </div>
    </div>

    <!-- Main Content (Shifts List) -->
    <div
        class="flex-1 space-y-6"
        on:touchstart={handleTouchStart}
        on:touchend={handleTouchEnd}
    >
        <!-- Week Navigation -->
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
                        {new Date(dateKey).toLocaleDateString("en-US", {
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
