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
        getDocs,
    } from "firebase/firestore";
    import { generateShifts } from "../lib/shiftUtils";
    import ShiftCard from "./ShiftCard.svelte";
    import MiniCalendar from "./MiniCalendar.svelte";
    import RegisterModal from "./RegisterModal.svelte";
    import {
        getCache,
        setCache,
        getShiftCacheKey,
        invalidateCacheByPrefix,
    } from "../lib/cacheUtils";

    let shifts = [];
    let generatedShifts = [];
    let customShifts = [];
    let shiftData = {};
    let selectedDate = new Date();

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

    let isModalOpen = false;
    let selectedShift = null;
    let selectedRole = "";
    let isSubmitting = false;
    let hideUnavailable = true;
    let registrationSuccess = false;
    let successTitle = "";
    let successMessage = "";

    // Subscription management
    let unsubShifts;
    let unsubCustom;
    let currentSubscriptionKey = "";

    onMount(() => {
        try {
            // Generate shifts for the next 2 months (default)
            generatedShifts = generateShifts();
        } catch (e) {
            console.error("Error initializing shifts:", e);
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
        // Determine window: We need to fetch data for the month(s) that contain the visible week
        const dStart = new Date(weekStart);
        const dEnd = new Date(dStart);
        dEnd.setDate(dEnd.getDate() + 6); // End of the visible week

        // Get the months that the week spans (could be 1 or 2 months)
        const startMonth = dStart.getMonth();
        const endMonth = dEnd.getMonth();
        const startYear = dStart.getFullYear();
        const endYear = dEnd.getFullYear();

        // Fetch from start of first month to end of last month
        const startOfFetch = new Date(startYear, startMonth, 1);
        const endOfFetch = new Date(endYear, endMonth + 1, 0, 23, 59, 59);

        const key = `${startOfFetch.getTime()}-${endOfFetch.getTime()}`;
        if (key === currentSubscriptionKey) return;

        currentSubscriptionKey = key;
        subscribeToData(startOfFetch, endOfFetch);
    }

    function subscribeToData(start, end) {
        if (unsubShifts) unsubShifts();
        if (unsubCustom) unsubCustom();

        const cacheKey = getShiftCacheKey(start, end);
        const cached = getCache(cacheKey);

        // Load cached data immediately (optimistic)
        if (cached) {
            shiftData = cached.data.shiftData || {};
            customShifts = (cached.data.customShifts || []).map((c) => ({
                ...c,
                start: new Date(c.start),
                end: new Date(c.end),
                date: new Date(c.date),
            }));
            combineShifts();

            // If cache is fresh, don't fetch from Firebase
            if (!cached.isStale) {
                return;
            }
        }

        // Fetch fresh data from Firebase
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
                    // Update cache
                    setCache(cacheKey, { shiftData: data, customShifts });
                },
                (err) => {
                    // On Firebase error (quota, network, etc.), keep showing cached data
                    console.error(
                        "Firebase error (shifts) - using cached data:",
                        err,
                    );
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
                        const startTime = d.start.toDate();
                        const endTime = d.end.toDate();
                        const date = new Date(startTime);
                        date.setHours(0, 0, 0, 0);

                        custom.push({
                            id: doc.id,
                            start: startTime,
                            end: endTime,
                            date,
                            dateStr: toDateStr(date),
                            isCustom: true,
                            leadCapacity: d.leadCapacity,
                            volunteerCapacity: d.volunteerCapacity,
                        });
                    });
                    customShifts = custom;
                    combineShifts();
                    // Update cache
                    setCache(cacheKey, { shiftData, customShifts: custom });
                },
                (err) => {
                    // On Firebase error, keep showing cached data
                    console.error(
                        "Firebase error (custom shifts) - using cached data:",
                        err,
                    );
                },
            );
        } catch (e) {
            console.error("Subscription error:", e);
        }
    }

    // Call this after successful registration to invalidate cache
    function invalidateShiftCache() {
        invalidateCacheByPrefix("shifts_");
    }

    function combineShifts() {
        const activeGenerated = generatedShifts.filter((s) => {
            const data = shiftData[s.id];
            return !data?.cancelled;
        });

        const combined = [...activeGenerated, ...customShifts];
        combined.sort((a, b) => a.start - b.start);
        shifts = combined;
    }

    function isShiftUnavailable(shift) {
        const data = shiftData[shift.id] || { lead: 0, volunteer: 0 };
        const now = new Date();
        const lockTime = new Date(shift.start.getTime() - 24 * 60 * 60 * 1000);
        const isLocked =
            now.getTime() >= lockTime.getTime() ||
            now.getTime() >= shift.start.getTime();

        if (isLocked) return true;
        const registrations = data.registrations || [];
        const leadCount = registrations.filter((r) => r.role === "lead").length;
        const volunteerCount = registrations.filter(
            (r) => r.role === "volunteer",
        ).length;

        if (isLocked) return true;

        const leadCap =
            shift.leadCapacity !== undefined ? shift.leadCapacity : 1;
        const volCap =
            shift.volunteerCapacity !== undefined ? shift.volunteerCapacity : 2;

        const isLeadFull = leadCount >= leadCap;
        const isVolunteerFull = volunteerCount >= volCap;
        return isLeadFull && isVolunteerFull;
    }

    // Grouping by Safe String Keys
    $: shiftsByDate = shifts.reduce((acc, shift) => {
        if (hideUnavailable && isShiftUnavailable(shift)) return acc;
        const dateKey = shift.dateStr || toDateStr(shift.date);
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(shift);
        return acc;
    }, {});

    $: sortedDates = Object.keys(shiftsByDate).sort();

    // Filter by String Comparison
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

    function openModal(event) {
        selectedShift = event.detail.shift;
        selectedRole = event.detail.role;
        isModalOpen = true;
        registrationSuccess = false;
    }

    async function handleRegistration(event) {
        isSubmitting = true;
        successTitle = "";
        successMessage = "";
        const { name, email, phone, shift, role } = event.detail;
        const shiftId = shift.id;
        const shiftRef = doc(db, "shifts", shiftId);
        try {
            const result = await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(shiftRef);
                let currentData = sfDoc.exists()
                    ? sfDoc.data()
                    : { lead: 0, volunteer: 0, registrations: [] };

                const registrations = currentData.registrations || [];

                // Duplicate Check
                const normalizedEmail = email.toLowerCase();
                const isDuplicate = registrations.some(
                    (r) => r.email.toLowerCase() === normalizedEmail,
                );

                if (isDuplicate) {
                    return { status: "duplicate" };
                }

                const currentRoleCount = registrations.filter(
                    (r) => r.role === role,
                ).length;

                const capacity =
                    role === "lead"
                        ? shift.leadCapacity !== undefined
                            ? shift.leadCapacity
                            : 1
                        : shift.volunteerCapacity !== undefined
                          ? shift.volunteerCapacity
                          : 2;
                if (currentRoleCount >= capacity)
                    throw "Sorry, this spot was just taken!";

                const newRegistration = {
                    name,
                    email,
                    phone,
                    role,
                    timestamp: new Date().toISOString(),
                };

                transaction.set(shiftRef, {
                    ...currentData,
                    registrations: [...registrations, newRegistration],
                });

                return { status: "success" };
            });

            if (result.status === "duplicate") {
                successTitle = "Already Signed Up!";
                const dateStr = shift.start.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                });
                const timeStr = shift.start.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                });
                successMessage = `It looks like you are already signed up for this shift on ${dateStr} at ${timeStr}! We look forward to seeing you there.`;
                registrationSuccess = true;
            } else if (result.status === "success") {
                invalidateShiftCache();
                registrationSuccess = true;
            }
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

    <div class="flex-1 space-y-6">
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
            <span class="font-bold text-gray-800 hidden md:block"
                >Week of {currentWeekDisplay}</span
            >
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
    success={registrationSuccess}
    {successTitle}
    {successMessage}
    on:close={() => {
        isModalOpen = false;
        registrationSuccess = false;
    }}
    on:submit={handleRegistration}
/>
