<script>
    import { onMount } from "svelte";
    import { db } from "../lib/firebase";
    import {
        collection,
        onSnapshot,
        doc,
        runTransaction,
    } from "firebase/firestore";
    import { generateShifts } from "../lib/shiftUtils";

    let shifts = [];
    let shiftData = {};
    let loading = true;
    let error = null;

    onMount(() => {
        try {
            // 1. Generate Shifts safely
            shifts = generateShifts();

            // 2. Subscribe to Firestore with ERROR HANDLING
            const unsubscribe = onSnapshot(
                collection(db, "shifts"),
                (snapshot) => {
                    const data = {};
                    snapshot.forEach((doc) => {
                        data[doc.id] = doc.data();
                    });
                    shiftData = data;
                    loading = false;
                },
                (err) => {
                    console.error("Firestore Error:", err);
                    error = "Could not load data. Please refresh.";
                    loading = false;
                },
            );

            return () => unsubscribe();
        } catch (e) {
            console.error("Critical App Error:", e);
            error = "App failed to load: " + e.message;
            loading = false;
        }
    });

    // Helper to safely check if a shift is today or future
    const isUpcoming = (shift) => {
        if (!shift || !shift.date) return false;
        try {
            const shiftTime = shift.date.getTime();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return shiftTime >= today.getTime();
        } catch (e) {
            return false;
        }
    };

    $: upcomingShifts = shifts
        .filter(isUpcoming)
        .map((shift) => {
            const data = shiftData[shift.id] || { registrations: [] };
            return {
                ...shift,
                registrations: data.registrations || [],
            };
        })
        .filter((shift) => shift.registrations.length > 0)
        .sort((a, b) => a.start - b.start);

    async function handleCheckIn(shiftId, registrationIndex) {
        // if (!confirm("Confirm check-in for this volunteer?")) return;
        const shiftRef = doc(db, "shifts", shiftId);

        try {
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(shiftRef);
                if (!sfDoc.exists()) throw "Shift does not exist!";

                const data = sfDoc.data();
                const registrations = data.registrations || [];

                if (!registrations[registrationIndex])
                    throw "Registration not found!";

                registrations[registrationIndex].checkedIn = true;
                registrations[registrationIndex].checkInTime =
                    new Date().toISOString();

                transaction.update(shiftRef, { registrations });
            });
            alert("Check-in successful!");
        } catch (e) {
            console.error("Check-in failed: ", e);
            alert("Check-in failed: " + e);
        }
    }
</script>

<div class="max-w-4xl mx-auto p-4 space-y-8">
    <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h1 class="text-3xl font-bold font-rubik text-gray-900 mb-2">
            Volunteer Check-in
        </h1>
        <p class="text-gray-600">Manage check-ins for upcoming shifts.</p>
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
    {:else if upcomingShifts.length === 0}
        <div
            class="text-center py-12 bg-white rounded-xl border border-gray-100"
        >
            <p class="text-xl text-gray-600">
                No upcoming shifts with registrations found.
            </p>
        </div>
    {:else}
        <div class="space-y-6">
            {#each upcomingShifts as shift}
                <div
                    class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
                >
                    <div
                        class="bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center flex-wrap gap-4"
                    >
                        <div>
                            <h3 class="text-lg font-bold text-gray-900">
                                {shift.date.toLocaleDateString("en-US", {
                                    weekday: "long",
                                    month: "long",
                                    day: "numeric",
                                })}
                            </h3>
                            <p class="text-gray-600">
                                {shift.start.toLocaleTimeString("en-US", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                })} -
                                {shift.end.toLocaleTimeString("en-US", {
                                    hour: "numeric",
                                    minute: "2-digit",
                                })}
                            </p>
                        </div>
                        <div
                            class="text-sm font-medium px-3 py-1 bg-white rounded-full border border-gray-200 text-gray-600"
                        >
                            {shift.registrations.length} Volunteer{shift
                                .registrations.length !== 1
                                ? "s"
                                : ""}
                        </div>
                    </div>

                    <div class="divide-y divide-gray-100">
                        {#each shift.registrations as reg, i}
                            <div
                                class="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                            >
                                <div class="flex-1">
                                    <div class="flex items-center gap-2 mb-1">
                                        <h4 class="font-bold text-gray-900">
                                            {reg.name}
                                        </h4>
                                        <span
                                            class="text-xs px-2 py-0.5 rounded-full font-medium {reg.role ===
                                            'lead'
                                                ? 'bg-purple-100 text-purple-700'
                                                : 'bg-pink-100 text-pink-700'}"
                                        >
                                            {reg.role === "lead"
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
                                        <div class="flex flex-col items-end">
                                            <span
                                                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-100 text-green-700 font-bold text-sm"
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
                                                class="text-xs text-gray-400 mt-1"
                                            >
                                                {#if reg.checkInTime}
                                                    {(() => {
                                                        try {
                                                            return new Date(
                                                                reg.checkInTime,
                                                            ).toLocaleTimeString(
                                                                [],
                                                                {
                                                                    hour: "2-digit",
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
                                                handleCheckIn(shift.id, i)}
                                            class="px-6 py-2 rounded-lg bg-vibrant-pink hover:bg-pink-600 text-white font-bold text-sm transition-colors shadow-md hover:shadow-lg focus:ring-4 focus:ring-pink-200"
                                        >
                                            Check In
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>
