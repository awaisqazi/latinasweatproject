<script>
    import { db } from "../../lib/galaFirebase";
    import {
        collection,
        query,
        orderBy,
        onSnapshot,
        doc,
        updateDoc,
        serverTimestamp,
    } from "firebase/firestore";
    import { onMount } from "svelte";

    let guests = [];
    let searchTerm = "";
    let filteredGuests = [];

    // Stats
    $: totalGuests = guests.length; // Total documents (families/groups)
    $: totalGuestsExpected = guests.reduce(
        (sum, g) => sum + (g.guestCount || 1),
        0,
    );
    $: checkedInCount = guests.reduce(
        (sum, g) => sum + (g.checkedInCount || 0),
        0,
    );

    onMount(() => {
        const q = query(collection(db, "gala_guests"), orderBy("paddleNumber"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            guests = snapshot.docs.map((doc) => {
                const data = doc.data();
                // Backward compatibility: if checkedInCount is missing, use checkedIn boolean
                const currentCount =
                    data.checkedInCount !== undefined
                        ? data.checkedInCount
                        : data.checkedIn
                          ? data.guestCount || 1
                          : 0;

                return {
                    id: doc.id,
                    ...data,
                    checkedInCount: currentCount,
                };
            });
        });
        return unsubscribe;
    });

    // Filter Logic
    $: {
        if (!searchTerm) {
            filteredGuests = guests;
        } else {
            const lower = searchTerm.toLowerCase();
            filteredGuests = guests.filter(
                (g) =>
                    (g.fullName && g.fullName.toLowerCase().includes(lower)) ||
                    (g.email && g.email.toLowerCase().includes(lower)) ||
                    String(g.paddleNumber).includes(lower),
            );
        }
    }

    async function updateCheckInCount(guest, change) {
        const current = guest.checkedInCount || 0;
        const max = guest.guestCount || 1;
        const newCount = current + change;

        if (newCount < 0 || newCount > max) return;

        try {
            const guestRef = doc(db, "gala_guests", String(guest.paddleNumber));
            await updateDoc(guestRef, {
                checkedInCount: newCount,
                // Keep legacy field synced for safety, true if ANYONE is checked in
                checkedIn: newCount > 0,
                checkInTime: newCount > 0 ? serverTimestamp() : null,
            });
        } catch (err) {
            console.error("Error updating check-in status:", err);
            alert("Failed to update check-in status. Please try again.");
        }
    }
</script>

<div class="space-y-6">
    <!-- Stats Bar -->
    <div
        class="bg-[var(--color-off-black)] text-white p-4 rounded-lg shadow-md flex justify-between items-center"
    >
        <div>
            <h2 class="text-xl font-bold">Check-In Station</h2>
            <p class="text-sm opacity-80">Manage guest arrivals</p>
        </div>
        <div class="text-right">
            <div class="text-3xl font-bold text-[var(--color-accent-gold)]">
                {checkedInCount}
                <span class="text-lg text-white opacity-60"
                    >/ {totalGuestsExpected}</span
                >
            </div>
            <div class="text-xs uppercase tracking-wider opacity-80">
                Guests Arrived
            </div>
        </div>
    </div>

    <!-- Search -->
    <div class="relative">
        <input
            type="text"
            bind:value={searchTerm}
            placeholder="Search by Name, Email, or Paddle #..."
            class="w-full p-4 pl-12 text-lg border-2 border-gray-200 rounded-lg focus:border-[var(--color-vibrant-pink)] focus:ring-0 outline-none transition-colors shadow-sm"
            autofocus
        />
        <div
            class="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
            </svg>
        </div>
    </div>

    <!-- Results Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each filteredGuests as guest (guest.id)}
            <div
                class="bg-white rounded-lg shadow-sm border border-gray-100 p-5 flex flex-col justify-between transition-all hover:shadow-md {guest.checkedIn
                    ? 'border-l-4 border-l-green-500'
                    : 'border-l-4 border-l-gray-300'}"
            >
                <div class="mb-4">
                    <div class="flex justify-between items-start mb-2">
                        <h3
                            class="text-lg font-bold text-[var(--color-off-black)] leading-tight"
                        >
                            {guest.fullName}
                        </h3>
                        <span
                            class="bg-gray-100 text-[var(--color-off-black)] font-mono font-bold px-2 py-1 rounded text-sm"
                        >
                            #{guest.paddleNumber}
                        </span>
                    </div>

                    <div class="space-y-1 text-sm text-gray-500">
                        {#if guest.email}
                            <p class="truncate" title={guest.email}>
                                {guest.email}
                            </p>
                        {/if}
                        <p>
                            <span class="font-medium text-gray-700"
                                >Guests:</span
                            >
                            {guest.guestCount}
                        </p>
                    </div>
                </div>

                <div class="grid grid-cols-5 gap-2">
                    {#each Array(guest.guestCount) as _, i}
                        <button
                            on:click={() =>
                                updateCheckInCount(
                                    guest,
                                    (guest.checkedInCount || 0) > i ? -1 : 1,
                                )}
                            class="h-10 rounded font-bold text-sm transition-colors shadow-sm flex items-center justify-center
                            {(guest.checkedInCount || 0) > i
                                ? 'bg-green-500 text-white hover:bg-green-600'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 border border-gray-200'}"
                            title={(guest.checkedInCount || 0) > i
                                ? "Click to uncheck"
                                : "Click to check in"}
                        >
                            {i + 1}
                        </button>
                    {/each}
                </div>
                <div class="mt-2 text-center text-xs font-medium text-gray-500">
                    Arrived: <span
                        class={(guest.checkedInCount || 0) === guest.guestCount
                            ? "text-green-600 font-bold"
                            : "text-gray-700"}>{guest.checkedInCount || 0}</span
                    >
                    / {guest.guestCount}
                </div>
            </div>
        {/each}

        {#if filteredGuests.length === 0}
            <div class="col-span-full text-center py-12 text-gray-400">
                <p class="text-lg">No guests found matching "{searchTerm}"</p>
            </div>
        {/if}
    </div>
</div>
