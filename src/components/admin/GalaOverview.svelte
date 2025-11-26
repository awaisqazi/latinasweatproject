<script>
    import { db } from "../../lib/galaFirebase";
    import { collection, onSnapshot, query, where } from "firebase/firestore";
    import { onMount } from "svelte";

    let totalRaised = 0;
    let attendanceCount = 0;
    const GOAL = 300000;

    onMount(() => {
        // Listen to Donations
        const donationsUnsub = onSnapshot(
            collection(db, "gala_donations"),
            (snapshot) => {
                let sum = 0;
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    if (data.amount) sum += Number(data.amount);
                });
                totalRaised = sum;
            },
        );

        // Listen to Guests (Attendance)
        const guestsUnsub = onSnapshot(
            collection(db, "gala_guests"),
            (snapshot) => {
                let count = 0;
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    // Handle backward compatibility
                    const current =
                        data.checkedInCount !== undefined
                            ? data.checkedInCount
                            : data.checkedIn
                              ? data.guestCount || 1
                              : 0;
                    count += current;
                });
                attendanceCount = count;
            },
        );

        return () => {
            donationsUnsub();
            guestsUnsub();
        };
    });

    $: progressPercentage = Math.min((totalRaised / GOAL) * 100, 100);
</script>

<div class="space-y-8">
    <!-- Header -->
    <div>
        <h2 class="text-2xl font-bold text-[var(--color-off-black)]">
            Event Overview
        </h2>
        <p class="text-[var(--color-medium-gray)]">
            Real-time metrics for the Gala.
        </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Total Raised Card -->
        <div
            class="bg-white p-8 rounded-xl shadow-sm border border-gray-100 lg:col-span-2 flex flex-col justify-center relative overflow-hidden"
        >
            <div class="absolute top-0 right-0 p-4 opacity-5">
                <svg class="w-32 h-32" fill="currentColor" viewBox="0 0 20 20"
                    ><path
                        fill-rule="evenodd"
                        d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z"
                        clip-rule="evenodd"
                    ></path></svg
                >
            </div>
            <h3
                class="text-gray-500 font-bold uppercase tracking-wider text-sm mb-2"
            >
                Total Raised
            </h3>
            <p class="text-6xl font-bold text-[var(--color-vibrant-pink)] mb-4">
                ${totalRaised.toLocaleString()}
            </p>

            <!-- Progress Bar -->
            <div class="w-full bg-gray-100 rounded-full h-4 mb-2">
                <div
                    class="bg-[var(--color-vibrant-pink)] h-4 rounded-full transition-all duration-1000 ease-out"
                    style="width: {progressPercentage}%"
                ></div>
            </div>
            <div class="flex justify-between text-sm text-gray-500 font-medium">
                <span>$0</span>
                <span>Goal: ${GOAL.toLocaleString()}</span>
            </div>
        </div>

        <!-- Attendance Card -->
        <div
            class="bg-white p-8 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center"
        >
            <h3
                class="text-gray-500 font-bold uppercase tracking-wider text-sm mb-2"
            >
                Guests Checked In
            </h3>
            <div class="flex items-baseline">
                <p class="text-5xl font-bold text-[var(--color-off-black)]">
                    {attendanceCount}
                </p>
                <span class="ml-2 text-gray-400">guests</span>
            </div>
            <div
                class="mt-4 text-sm text-green-600 font-medium flex items-center"
            >
                <span
                    class="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"
                ></span>
                Live Count
            </div>
        </div>
    </div>
</div>
