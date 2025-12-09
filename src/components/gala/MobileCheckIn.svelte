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
        serverTimestamp,
        limit,
        getDocs,
    } from "firebase/firestore";
    import { onMount } from "svelte";

    // State
    let view = "search"; // 'search' | 'add-guest'
    let guests = [];
    let searchTerm = "";
    let filteredGuests = [];

    // Add Guest Form
    let newGuest = {
        paddleNumber: "",
        fullName: "",
        email: "",
        phone: "",
        guestCount: 1,
    };
    let loading = false;
    let successMessage = "";

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
    let successDetails = null; // For split confirmation details

    onMount(() => {
        const q = query(collection(db, "gala_guests"), orderBy("paddleNumber"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            guests = snapshot.docs.map((doc) => {
                const data = doc.data();
                // Backward compatibility for checkedInCount
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
                    (g.phone && g.phone.toLowerCase().includes(lower)) ||
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
            console.error(err);
            alert("Failed to update check-in status");
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

    // Walk-In Logic
    async function switchToAdd() {
        view = "add-guest";
        loading = true;
        try {
            // Find next paddle number
            // Since we have the full list in memory (guests is sorted by paddleNumber), we can just check the last one
            // But to be safe/robust against gaps or non-numeric IDs, let's just find the max numeric ID
            let maxPaddle = 0;
            guests.forEach((g) => {
                const num = Number(g.paddleNumber);
                if (!isNaN(num) && num > maxPaddle) maxPaddle = num;
            });
            newGuest.paddleNumber = maxPaddle + 1;
        } catch (err) {
            console.error(err);
        } finally {
            loading = false;
        }
    }

    async function registerWalkIn() {
        if (!newGuest.fullName || !newGuest.email || !newGuest.phone) return;

        loading = true;
        try {
            const docRef = doc(
                db,
                "gala_guests",
                String(newGuest.paddleNumber),
            );
            await setDoc(docRef, {
                paddleNumber: Number(newGuest.paddleNumber),
                fullName: newGuest.fullName,
                email: newGuest.email,
                phone: newGuest.phone,
                guestCount: Number(newGuest.guestCount),
                checkedInCount: Number(newGuest.guestCount), // Auto check-in all
                checkedIn: true,
                checkInTime: serverTimestamp(),
            });

            successMessage = `Paddle #${newGuest.paddleNumber} Assigned!`;
            setTimeout(() => (successMessage = ""), 3000);

            // Reset and switch back
            newGuest = {
                paddleNumber: "",
                fullName: "",
                email: "",
                phone: "",
                guestCount: 1,
            };
            view = "search";
            searchTerm = ""; // Clear search to show recent additions potentially, or just reset
        } catch (err) {
            alert("Error registering guest: " + err.message);
        } finally {
            loading = false;
        }
    }
</script>

<div class="min-h-screen bg-gray-50 pb-24">
    {#if successMessage}
        <div
            class="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-[90%] max-w-md"
        >
            <div
                class="bg-green-600 text-white p-4 rounded-xl shadow-2xl text-center"
            >
                <p class="font-bold text-lg">{successMessage}</p>
                {#if successDetails}
                    <div
                        class="mt-3 text-sm bg-green-700 rounded-lg p-3 text-left"
                    >
                        <div class="space-y-2">
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
                                <p class="font-bold text-green-200">
                                    New Paddle
                                </p>
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
                        class="mt-3 px-6 py-3 bg-white text-green-600 font-bold rounded-xl hover:bg-green-100 transition-colors text-lg w-full"
                    >
                        Got it!
                    </button>
                {/if}
            </div>
        </div>
    {/if}

    {#if view === "search"}
        <!-- Search View -->
        <div
            class="sticky top-0 bg-white border-b border-gray-200 z-10 shadow-sm"
        >
            <div class="max-w-7xl mx-auto p-4 md:p-6">
                <div
                    class="flex flex-col md:flex-row md:items-center gap-4 md:gap-8"
                >
                    <h1
                        class="text-xl md:text-2xl font-bold text-[var(--color-off-black)] whitespace-nowrap"
                    >
                        Gala Check-In
                    </h1>
                    <div
                        class="flex flex-col md:flex-row gap-3 w-full md:flex-1"
                    >
                        <input
                            type="text"
                            bind:value={searchTerm}
                            placeholder="Search Guest..."
                            class="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-[var(--color-vibrant-pink)] focus:ring-0 outline-none bg-gray-50"
                        />
                        <button
                            on:click={switchToAdd}
                            class="w-full md:w-auto bg-[var(--color-off-black)] text-white font-bold px-6 py-4 rounded-xl shadow-sm hover:opacity-90 transition-opacity flex items-center justify-center whitespace-nowrap"
                        >
                            <span class="text-xl mr-2">+</span> Add Walk-In
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="max-w-7xl mx-auto p-4 md:p-6">
            <div
                class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
            >
                {#each filteredGuests as guest (guest.id)}
                    <div
                        class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between h-full hover:shadow-md transition-shadow"
                    >
                        <div class="flex justify-between items-start mb-4">
                            <div class="overflow-hidden">
                                <h3
                                    class="text-xl font-bold text-[var(--color-off-black)] truncate"
                                    title={guest.fullName}
                                >
                                    {guest.fullName}
                                </h3>
                                {#if guest.email}
                                    <p
                                        class="text-sm text-gray-500 truncate"
                                        title={guest.email}
                                    >
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
                            </div>
                            <span
                                class="bg-gray-100 text-[var(--color-off-black)] font-mono font-bold text-lg px-3 py-1 rounded-lg ml-2 flex-shrink-0"
                            >
                                #{guest.paddleNumber}
                            </span>
                        </div>

                        {#if guest.guestCount > 1}
                            <button
                                on:click={() => openSplitModal(guest)}
                                class="px-4 py-2 text-sm bg-pink-100 text-[var(--color-vibrant-pink)] border border-pink-200 rounded-xl hover:bg-pink-200 font-medium transition-colors flex items-center gap-2 mb-3"
                            >
                                <span>✂️</span> Split Paddle
                            </button>
                        {/if}

                        <!-- Check-In Slots -->
                        <div class="space-y-2 mt-auto">
                            <div class="grid grid-cols-5 gap-2">
                                {#each Array(guest.guestCount || 1) as _, i}
                                    <button
                                        on:click={() =>
                                            tryCheckIn(
                                                guest,
                                                (guest.checkedInCount || 0) > i
                                                    ? -1
                                                    : 1,
                                            )}
                                        class="h-12 rounded-lg font-bold text-lg transition-all shadow-sm flex items-center justify-center border
                  {(guest.checkedInCount || 0) > i
                                            ? 'bg-green-500 text-white border-green-600 hover:bg-green-600'
                                            : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300 hover:bg-gray-50'}"
                                        title={(guest.checkedInCount || 0) > i
                                            ? "Click to uncheck"
                                            : "Click to check in"}
                                    >
                                        {i + 1}
                                    </button>
                                {/each}
                            </div>
                            <p
                                class="text-center text-xs font-medium text-gray-400 uppercase tracking-wider"
                            >
                                Tap slots to check in
                            </p>
                        </div>
                    </div>
                {/each}
            </div>

            {#if filteredGuests.length === 0}
                <div class="text-center py-20 text-gray-400">
                    <p class="text-xl">
                        No guests found matching "{searchTerm}"
                    </p>
                </div>
            {/if}
        </div>
    {:else}
        <!-- Add Guest View -->
        <div
            class="min-h-screen bg-white md:bg-gray-50 md:p-8 flex items-center justify-center"
        >
            <div
                class="w-full max-w-lg bg-white md:rounded-2xl md:shadow-xl md:border md:border-gray-100 overflow-hidden"
            >
                <div class="p-4 md:p-8">
                    <div class="flex items-center mb-8">
                        <button
                            on:click={() => (view = "search")}
                            class="mr-4 text-gray-500 p-2 hover:bg-gray-100 rounded-full transition-colors"
                        >
                            <svg
                                class="w-6 h-6"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                ><path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                                ></path></svg
                            >
                        </button>
                        <h2
                            class="text-2xl font-bold text-[var(--color-off-black)]"
                        >
                            Add Walk-In Guest
                        </h2>
                    </div>

                    <form
                        on:submit|preventDefault={registerWalkIn}
                        class="space-y-6"
                    >
                        <div
                            class="bg-gray-50 p-6 rounded-xl border border-gray-100 text-center"
                        >
                            <p
                                class="text-sm text-gray-500 uppercase tracking-wider font-bold mb-1"
                            >
                                Assigning Paddle
                            </p>
                            <p
                                class="text-5xl font-mono font-bold text-[var(--color-vibrant-pink)]"
                            >
                                #{newGuest.paddleNumber}
                            </p>
                        </div>

                        <div>
                            <label
                                for="name"
                                class="block text-sm font-bold text-gray-700 mb-2"
                                >Full Name</label
                            >
                            <input
                                id="name"
                                type="text"
                                bind:value={newGuest.fullName}
                                class="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-[var(--color-vibrant-pink)] focus:ring-0 outline-none"
                                placeholder="Jane Doe"
                                required
                            />
                        </div>

                        <div>
                            <label
                                for="email"
                                class="block text-sm font-bold text-gray-700 mb-2"
                                >Email</label
                            >
                            <input
                                id="email"
                                type="email"
                                bind:value={newGuest.email}
                                class="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-[var(--color-vibrant-pink)] focus:ring-0 outline-none"
                                placeholder="jane@example.com"
                                required
                            />
                        </div>

                        <div>
                            <label
                                for="phone"
                                class="block text-sm font-bold text-gray-700 mb-2"
                                >Phone</label
                            >
                            <input
                                id="phone"
                                type="tel"
                                bind:value={newGuest.phone}
                                class="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-[var(--color-vibrant-pink)] focus:ring-0 outline-none"
                                placeholder="(555) 123-4567"
                                required
                            />
                        </div>

                        <div>
                            <label
                                for="count"
                                class="block text-sm font-bold text-gray-700 mb-2"
                                >Guest Count</label
                            >
                            <input
                                id="count"
                                type="number"
                                bind:value={newGuest.guestCount}
                                min="1"
                                class="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-[var(--color-vibrant-pink)] focus:ring-0 outline-none"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            class="w-full bg-[var(--color-off-black)] text-white text-xl font-bold py-5 rounded-xl shadow-lg hover:opacity-90 transition-opacity mt-8"
                        >
                            {loading ? "Registering..." : "Register & Check In"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    {/if}
</div>

<!-- Missing Details Modal -->
{#if showMissingDetailsModal && pendingCheckInGuest}
    <div
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    >
        <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
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
                        for="mobile-missing-email"
                        class="block text-sm font-medium text-gray-700 mb-1"
                        >Email</label
                    >
                    <input
                        id="mobile-missing-email"
                        type="email"
                        bind:value={missingDetailsForm.email}
                        class="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-[var(--color-vibrant-pink)] outline-none"
                        placeholder="guest@email.com"
                        required
                    />
                </div>
                <div>
                    <label
                        for="mobile-missing-phone"
                        class="block text-sm font-medium text-gray-700 mb-1"
                        >Phone</label
                    >
                    <input
                        id="mobile-missing-phone"
                        type="tel"
                        bind:value={missingDetailsForm.phone}
                        class="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-[var(--color-vibrant-pink)] outline-none"
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
                        class="flex-1 px-4 py-4 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-lg"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={missingDetailsLoading}
                        class="flex-1 px-4 py-4 bg-[var(--color-vibrant-pink)] text-white font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-lg"
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
            class="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
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
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <h4 class="font-bold text-gray-700 mb-3">
                        Original Paddle #{splitGuest.paddleNumber}
                    </h4>
                    <div>
                        <label
                            for="mobile-keep-count"
                            class="block text-sm font-medium text-gray-600 mb-1"
                            >Keep how many guests?</label
                        >
                        <input
                            id="mobile-keep-count"
                            type="number"
                            bind:value={splitForm.keepCount}
                            min="1"
                            max={splitGuest.guestCount - 1}
                            class="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-[var(--color-vibrant-pink)] outline-none"
                            required
                        />
                    </div>
                </div>

                <!-- New Paddle Section -->
                <div class="bg-pink-50 p-4 rounded-xl border border-pink-200">
                    <h4 class="font-bold text-[var(--color-vibrant-pink)] mb-3">
                        New Paddle #{getNextPaddleNumber()}
                    </h4>
                    <div class="space-y-3">
                        <div>
                            <label
                                for="mobile-new-name"
                                class="block text-sm font-medium text-gray-600 mb-1"
                                >Name for New Paddle *</label
                            >
                            <input
                                id="mobile-new-name"
                                type="text"
                                bind:value={splitForm.newName}
                                class="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-[var(--color-vibrant-pink)] outline-none"
                                placeholder="Guest Name"
                                required
                            />
                        </div>
                        <div>
                            <label
                                for="mobile-new-count"
                                class="block text-sm font-medium text-gray-600 mb-1"
                                >Number of Guests *</label
                            >
                            <input
                                id="mobile-new-count"
                                type="number"
                                bind:value={splitForm.newGuestCount}
                                min="1"
                                max={splitGuest.guestCount -
                                    splitForm.keepCount}
                                class="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-[var(--color-vibrant-pink)] outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label
                                for="mobile-new-email"
                                class="block text-sm font-medium text-gray-600 mb-1"
                                >Email (optional)</label
                            >
                            <input
                                id="mobile-new-email"
                                type="email"
                                bind:value={splitForm.newEmail}
                                class="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-[var(--color-vibrant-pink)] outline-none"
                                placeholder="email@example.com"
                            />
                        </div>
                        <div>
                            <label
                                for="mobile-new-phone"
                                class="block text-sm font-medium text-gray-600 mb-1"
                                >Phone (optional)</label
                            >
                            <input
                                id="mobile-new-phone"
                                type="tel"
                                bind:value={splitForm.newPhone}
                                class="w-full p-4 text-lg border-2 border-gray-200 rounded-xl focus:border-[var(--color-vibrant-pink)] outline-none"
                                placeholder="(555) 123-4567"
                            />
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
                        class="flex-1 px-4 py-4 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors text-lg"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={splitLoading}
                        class="flex-1 px-4 py-4 bg-[var(--color-vibrant-pink)] text-white font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 text-lg"
                    >
                        {splitLoading ? "Creating..." : "Create Paddle"}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}
