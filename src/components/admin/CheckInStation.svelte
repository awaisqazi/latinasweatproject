<script>
    import { db } from "../../lib/galaFirebase";
    import {
        collection,
        query,
        orderBy,
        onSnapshot,
        doc,
        updateDoc,
        setDoc,
        getDoc,
        serverTimestamp,
    } from "firebase/firestore";
    import { onMount } from "svelte";

    let guests = [];
    let searchTerm = "";
    let filteredGuests = [];

    // Missing Details Modal State
    let showMissingDetailsModal = false;
    let pendingCheckInGuest = null;
    let pendingCheckInChange = 0;
    let missingDetailsForm = { email: "", phone: "" };
    let missingDetailsLoading = false;

    // Split Paddle Modal State
    let showSplitModal = false;
    let splitGuest = null;
    let splitForm = {
        keepCount: 1,
        newName: "",
        newGuestCount: 1,
        newEmail: "",
        newPhone: "",
    };
    let splitLoading = false;

    // Success Message State
    let successMessage = "";
    let successDetails = null; // For split confirmation details

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

    // Check if guest is missing required details
    function isMissingDetails(guest) {
        return !guest.email || !guest.phone;
    }

    // Intercept check-in to validate details first
    function tryCheckIn(guest, change) {
        // Only validate when checking IN (not when checking out)
        if (change > 0 && isMissingDetails(guest)) {
            pendingCheckInGuest = guest;
            pendingCheckInChange = change;
            missingDetailsForm = {
                email: guest.email || "",
                phone: guest.phone || "",
            };
            showMissingDetailsModal = true;
            return;
        }
        performCheckIn(guest, change);
    }

    async function performCheckIn(guest, change) {
        const current = guest.checkedInCount || 0;
        const max = guest.guestCount || 1;
        const newCount = current + change;

        if (newCount < 0 || newCount > max) return;

        try {
            const guestRef = doc(db, "gala_guests", String(guest.paddleNumber));
            await updateDoc(guestRef, {
                checkedInCount: newCount,
                checkedIn: newCount > 0,
                checkInTime: newCount > 0 ? serverTimestamp() : null,
            });

            // Show success message for check-in (not check-out)
            if (change > 0) {
                successMessage = `✅ ${guest.fullName} checked in! (Paddle #${guest.paddleNumber})`;
                setTimeout(() => (successMessage = ""), 3000);
            }
        } catch (err) {
            console.error("Error updating check-in status:", err);
            alert("Failed to update check-in status. Please try again.");
        }
    }

    async function submitMissingDetails() {
        if (!missingDetailsForm.email || !missingDetailsForm.phone) {
            alert("Please fill in both email and phone number.");
            return;
        }

        missingDetailsLoading = true;
        try {
            const guestRef = doc(
                db,
                "gala_guests",
                String(pendingCheckInGuest.paddleNumber),
            );
            await updateDoc(guestRef, {
                email: missingDetailsForm.email,
                phone: missingDetailsForm.phone,
            });

            // Now complete the check-in
            await performCheckIn(pendingCheckInGuest, pendingCheckInChange);

            showMissingDetailsModal = false;
            pendingCheckInGuest = null;
            pendingCheckInChange = 0;
        } catch (err) {
            console.error("Error updating guest details:", err);
            alert("Failed to update guest details. Please try again.");
        } finally {
            missingDetailsLoading = false;
        }
    }

    // Split Paddle Functions
    function openSplitModal(guest) {
        splitGuest = guest;
        const currentCheckedIn = guest.checkedInCount || 0;
        const remaining = (guest.guestCount || 1) - currentCheckedIn;

        splitForm = {
            keepCount: currentCheckedIn > 0 ? currentCheckedIn : 1,
            newName: "",
            newGuestCount: remaining > 0 ? remaining : 1,
            newEmail: "",
            newPhone: "",
        };
        showSplitModal = true;
    }

    function getNextPaddleNumber() {
        let maxPaddle = 0;
        guests.forEach((g) => {
            const num = Number(g.paddleNumber);
            if (!isNaN(num) && num > maxPaddle) maxPaddle = num;
        });
        return maxPaddle + 1;
    }

    async function executeSplit() {
        if (!splitForm.newName.trim()) {
            alert("Please enter a name for the new paddle.");
            return;
        }
        if (splitForm.keepCount < 1 || splitForm.newGuestCount < 1) {
            alert("Both paddles must have at least 1 guest.");
            return;
        }
        if (
            splitForm.keepCount + splitForm.newGuestCount >
            splitGuest.guestCount
        ) {
            alert("Total guests cannot exceed the original count.");
            return;
        }

        splitLoading = true;
        try {
            const newPaddleNumber = getNextPaddleNumber();

            // Update original guest's count
            const originalRef = doc(
                db,
                "gala_guests",
                String(splitGuest.paddleNumber),
            );
            await updateDoc(originalRef, {
                guestCount: splitForm.keepCount,
                // Adjust checkedInCount if it exceeds new guestCount
                checkedInCount: Math.min(
                    splitGuest.checkedInCount || 0,
                    splitForm.keepCount,
                ),
            });

            // Create new guest paddle
            const newRef = doc(db, "gala_guests", String(newPaddleNumber));
            await setDoc(newRef, {
                paddleNumber: newPaddleNumber,
                fullName: splitForm.newName.trim(),
                email: splitForm.newEmail.trim() || "",
                phone: splitForm.newPhone.trim() || "",
                guestCount: splitForm.newGuestCount,
                checkedInCount: 0,
                checkedIn: false,
                checkInTime: null,
                needsDetails: !splitForm.newEmail || !splitForm.newPhone,
            });

            // Store split details for confirmation
            successDetails = {
                originalPaddle: splitGuest.paddleNumber,
                originalName: splitGuest.fullName,
                originalCount: splitForm.keepCount,
                newPaddle: newPaddleNumber,
                newName: splitForm.newName.trim(),
                newCount: splitForm.newGuestCount,
            };
            successMessage = "✂️ Paddle Split Successful!";

            showSplitModal = false;
            splitGuest = null;
        } catch (err) {
            console.error("Error splitting paddle:", err);
            alert("Failed to split paddle. Please try again.");
        } finally {
            splitLoading = false;
        }
    }
</script>

<!-- Success Message Popup -->
{#if successMessage}
    <div class="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
        <div
            class="bg-green-600 text-white p-4 rounded-xl shadow-2xl text-center min-w-80"
        >
            <p class="font-bold text-lg">{successMessage}</p>
            {#if successDetails}
                <div class="mt-3 text-sm bg-green-700 rounded-lg p-3 text-left">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <p class="font-bold text-green-200">
                                Original Paddle
                            </p>
                            <p>
                                #{successDetails.originalPaddle} - {successDetails.originalName}
                            </p>
                            <p class="text-green-200">
                                {successDetails.originalCount} guest(s)
                            </p>
                        </div>
                        <div>
                            <p class="font-bold text-green-200">New Paddle</p>
                            <p>
                                #{successDetails.newPaddle} - {successDetails.newName}
                            </p>
                            <p class="text-green-200">
                                {successDetails.newCount} guest(s)
                            </p>
                        </div>
                    </div>
                </div>
                <button
                    on:click={() => {
                        successMessage = "";
                        successDetails = null;
                    }}
                    class="mt-3 px-4 py-2 bg-white text-green-600 font-bold rounded-lg hover:bg-green-100 transition-colors"
                >
                    Got it!
                </button>
            {/if}
        </div>
    </div>
{/if}

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
                        {:else}
                            <p class="text-amber-600 text-xs">
                                ⚠️ Missing email
                            </p>
                        {/if}
                        {#if !guest.phone}
                            <p class="text-amber-600 text-xs">
                                ⚠️ Missing phone
                            </p>
                        {/if}
                        <p>
                            <span class="font-medium text-gray-700"
                                >Guests:</span
                            >
                            {guest.guestCount}
                        </p>
                    </div>
                    {#if guest.guestCount > 1}
                        <button
                            on:click={() => openSplitModal(guest)}
                            class="mt-2 px-3 py-1.5 text-xs bg-pink-100 text-[var(--color-vibrant-pink)] border border-pink-200 rounded-lg hover:bg-pink-200 font-medium transition-colors flex items-center gap-1"
                        >
                            <span>✂️</span> Split Paddle
                        </button>
                    {/if}
                </div>

                <div class="grid grid-cols-5 gap-2">
                    {#each Array(guest.guestCount) as _, i}
                        <button
                            on:click={() =>
                                tryCheckIn(
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

<!-- Missing Details Modal -->
{#if showMissingDetailsModal && pendingCheckInGuest}
    <div
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    >
        <div class="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <h3 class="text-xl font-bold text-[var(--color-off-black)] mb-2">
                Complete Guest Details
            </h3>
            <p class="text-sm text-gray-500 mb-6">
                Please fill in the missing information for <strong
                    >{pendingCheckInGuest.fullName}</strong
                > before checking in.
            </p>

            <form
                on:submit|preventDefault={submitMissingDetails}
                class="space-y-4"
            >
                <div>
                    <label
                        for="missing-email"
                        class="block text-sm font-medium text-gray-700 mb-1"
                        >Email</label
                    >
                    <input
                        id="missing-email"
                        type="email"
                        bind:value={missingDetailsForm.email}
                        class="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[var(--color-vibrant-pink)] outline-none"
                        placeholder="guest@email.com"
                        required
                    />
                </div>
                <div>
                    <label
                        for="missing-phone"
                        class="block text-sm font-medium text-gray-700 mb-1"
                        >Phone</label
                    >
                    <input
                        id="missing-phone"
                        type="tel"
                        bind:value={missingDetailsForm.phone}
                        class="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[var(--color-vibrant-pink)] outline-none"
                        placeholder="(555) 123-4567"
                        required
                    />
                </div>

                <div class="flex gap-3 pt-4">
                    <button
                        type="button"
                        on:click={() => {
                            showMissingDetailsModal = false;
                            pendingCheckInGuest = null;
                        }}
                        class="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={missingDetailsLoading}
                        class="flex-1 px-4 py-3 bg-[var(--color-vibrant-pink)] text-white font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {missingDetailsLoading
                            ? "Saving..."
                            : "Save & Check In"}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- Split Paddle Modal -->
{#if showSplitModal && splitGuest}
    <div
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    >
        <div
            class="bg-white rounded-xl shadow-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
        >
            <h3 class="text-xl font-bold text-[var(--color-off-black)] mb-2">
                ✂️ Split Paddle #{splitGuest.paddleNumber}
            </h3>
            <p class="text-sm text-gray-500 mb-6">
                Create a new paddle for some guests from <strong
                    >{splitGuest.fullName}</strong
                >'s group ({splitGuest.guestCount} guests total).
            </p>

            <form on:submit|preventDefault={executeSplit} class="space-y-5">
                <!-- Original Paddle Section -->
                <div class="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 class="font-bold text-gray-700 mb-3">
                        Original Paddle #{splitGuest.paddleNumber}
                    </h4>
                    <div>
                        <label
                            for="keep-count"
                            class="block text-sm font-medium text-gray-600 mb-1"
                            >Keep how many guests?</label
                        >
                        <input
                            id="keep-count"
                            type="number"
                            bind:value={splitForm.keepCount}
                            min="1"
                            max={splitGuest.guestCount - 1}
                            class="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[var(--color-vibrant-pink)] outline-none"
                            required
                        />
                    </div>
                </div>

                <!-- New Paddle Section -->
                <div class="bg-pink-50 p-4 rounded-lg border border-pink-200">
                    <h4 class="font-bold text-[var(--color-vibrant-pink)] mb-3">
                        New Paddle #{getNextPaddleNumber()}
                    </h4>
                    <div class="space-y-3">
                        <div>
                            <label
                                for="new-name"
                                class="block text-sm font-medium text-gray-600 mb-1"
                                >Name for New Paddle *</label
                            >
                            <input
                                id="new-name"
                                type="text"
                                bind:value={splitForm.newName}
                                class="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[var(--color-vibrant-pink)] outline-none"
                                placeholder="Guest Name"
                                required
                            />
                        </div>
                        <div>
                            <label
                                for="new-count"
                                class="block text-sm font-medium text-gray-600 mb-1"
                                >Number of Guests *</label
                            >
                            <input
                                id="new-count"
                                type="number"
                                bind:value={splitForm.newGuestCount}
                                min="1"
                                max={splitGuest.guestCount -
                                    splitForm.keepCount}
                                class="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[var(--color-vibrant-pink)] outline-none"
                                required
                            />
                        </div>
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label
                                    for="new-email"
                                    class="block text-sm font-medium text-gray-600 mb-1"
                                    >Email (optional)</label
                                >
                                <input
                                    id="new-email"
                                    type="email"
                                    bind:value={splitForm.newEmail}
                                    class="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[var(--color-vibrant-pink)] outline-none"
                                    placeholder="email@example.com"
                                />
                            </div>
                            <div>
                                <label
                                    for="new-phone"
                                    class="block text-sm font-medium text-gray-600 mb-1"
                                    >Phone (optional)</label
                                >
                                <input
                                    id="new-phone"
                                    type="tel"
                                    bind:value={splitForm.newPhone}
                                    class="w-full p-3 border-2 border-gray-200 rounded-lg focus:border-[var(--color-vibrant-pink)] outline-none"
                                    placeholder="(555) 123-4567"
                                />
                            </div>
                        </div>
                        <p class="text-xs text-gray-500 italic">
                            If email/phone are left empty, the guest will be
                            prompted to provide them at check-in.
                        </p>
                    </div>
                </div>

                <div class="flex gap-3 pt-2">
                    <button
                        type="button"
                        on:click={() => {
                            showSplitModal = false;
                            splitGuest = null;
                        }}
                        class="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={splitLoading}
                        class="flex-1 px-4 py-3 bg-[var(--color-vibrant-pink)] text-white font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {splitLoading ? "Creating..." : "Create New Paddle"}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
