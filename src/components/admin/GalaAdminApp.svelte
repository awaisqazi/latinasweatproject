<script>
    import { onMount } from "svelte";
    import { auth, db } from "../../lib/galaFirebase";
    import {
        signInWithEmailAndPassword,
        onAuthStateChanged,
        signOut,
    } from "firebase/auth";
    import {
        collection,
        query,
        orderBy,
        onSnapshot,
        doc,
        updateDoc,
        addDoc,
        serverTimestamp,
    } from "firebase/firestore";

    let user = null;
    let email = "";
    let password = "";
    let error = "";
    let loading = false;

    let activeTab = "guests"; // 'guests' or 'donations'

    // Guest Data
    let guests = [];
    let filteredGuests = [];
    let searchTerm = "";

    // Donation Data
    let donations = [];
    let totalRaised = 0;

    onMount(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
            user = currentUser;
            if (user) {
                subscribeToGuests();
                subscribeToDonations();
            }
        });

        return () => {
            unsubscribeAuth();
        };
    });

    function subscribeToGuests() {
        const q = query(collection(db, "guests"), orderBy("lastName"));
        onSnapshot(q, (snapshot) => {
            guests = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            filterGuests();
        });
    }

    function subscribeToDonations() {
        const q = query(
            collection(db, "donations"),
            orderBy("createdAt", "desc"),
        );
        onSnapshot(q, (snapshot) => {
            donations = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            totalRaised = donations.reduce(
                (sum, d) => sum + (Number(d.amount) || 0),
                0,
            );
        });
    }

    async function handleLogin() {
        loading = true;
        error = "";
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    async function handleLogout() {
        await signOut(auth);
    }

    function filterGuests() {
        if (!searchTerm) {
            filteredGuests = guests;
        } else {
            const lower = searchTerm.toLowerCase();
            filteredGuests = guests.filter(
                (g) =>
                    (g.firstName &&
                        g.firstName.toLowerCase().includes(lower)) ||
                    (g.lastName && g.lastName.toLowerCase().includes(lower)) ||
                    (g.email && g.email.toLowerCase().includes(lower)),
            );
        }
    }

    $: searchTerm, filterGuests();

    async function toggleCheckIn(guest) {
        const guestRef = doc(db, "guests", guest.id);
        await updateDoc(guestRef, {
            checkedIn: !guest.checkedIn,
            checkInTime: !guest.checkedIn ? serverTimestamp() : null,
        });
    }

    async function updatePaddleNumber(guest, newNumber) {
        const guestRef = doc(db, "guests", guest.id);
        await updateDoc(guestRef, {
            paddleNumber: newNumber,
        });
    }
</script>

<div
    class="bg-[var(--color-light-gray)] min-h-[600px] rounded-xl shadow-lg p-6"
>
    {#if !user}
        <div class="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md mt-10">
            <h2
                class="text-2xl font-bold text-[var(--color-off-black)] mb-6 text-center"
            >
                Admin Login
            </h2>
            {#if error}
                <div
                    class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
                >
                    {error}
                </div>
            {/if}
            <form on:submit|preventDefault={handleLogin} class="space-y-4">
                <div>
                    <label
                        class="block text-sm font-medium text-[var(--color-medium-gray)] mb-1"
                        >Email</label
                    >
                    <input
                        type="email"
                        bind:value={email}
                        class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[var(--color-vibrant-pink)] focus:border-transparent outline-none"
                        required
                    />
                </div>
                <div>
                    <label
                        class="block text-sm font-medium text-[var(--color-medium-gray)] mb-1"
                        >Password</label
                    >
                    <input
                        type="password"
                        bind:value={password}
                        class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[var(--color-vibrant-pink)] focus:border-transparent outline-none"
                        required
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    class="w-full bg-[var(--color-vibrant-pink)] text-white font-bold py-2 px-4 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                    {loading ? "Logging in..." : "Login"}
                </button>
            </form>
        </div>
    {:else}
        <div class="flex justify-between items-center mb-8">
            <div class="flex space-x-4">
                <button
                    class="px-6 py-2 rounded-full font-semibold transition-colors {activeTab ===
                    'guests'
                        ? 'bg-[var(--color-vibrant-pink)] text-white'
                        : 'bg-white text-[var(--color-medium-gray)] hover:bg-gray-100'}"
                    on:click={() => (activeTab = "guests")}
                >
                    Guest Check-in
                </button>
                <button
                    class="px-6 py-2 rounded-full font-semibold transition-colors {activeTab ===
                    'donations'
                        ? 'bg-[var(--color-vibrant-pink)] text-white'
                        : 'bg-white text-[var(--color-medium-gray)] hover:bg-gray-100'}"
                    on:click={() => (activeTab = "donations")}
                >
                    Live Donations
                </button>
            </div>
            <button
                on:click={handleLogout}
                class="text-[var(--color-medium-gray)] hover:text-[var(--color-off-black)] underline"
            >
                Logout
            </button>
        </div>

        {#if activeTab === "guests"}
            <div class="bg-white rounded-lg shadow p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold text-[var(--color-off-black)]">
                        Guest List ({guests.length})
                    </h3>
                    <input
                        type="text"
                        placeholder="Search guests..."
                        bind:value={searchTerm}
                        class="px-4 py-2 border border-gray-300 rounded-md w-64 focus:ring-2 focus:ring-[var(--color-vibrant-pink)] outline-none"
                    />
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="border-b border-gray-200">
                                <th
                                    class="py-3 px-4 font-semibold text-[var(--color-medium-gray)]"
                                    >Name</th
                                >
                                <th
                                    class="py-3 px-4 font-semibold text-[var(--color-medium-gray)]"
                                    >Email</th
                                >
                                <th
                                    class="py-3 px-4 font-semibold text-[var(--color-medium-gray)]"
                                    >Paddle #</th
                                >
                                <th
                                    class="py-3 px-4 font-semibold text-[var(--color-medium-gray)]"
                                    >Status</th
                                >
                                <th
                                    class="py-3 px-4 font-semibold text-[var(--color-medium-gray)]"
                                    >Action</th
                                >
                            </tr>
                        </thead>
                        <tbody>
                            {#each filteredGuests as guest (guest.id)}
                                <tr
                                    class="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                                >
                                    <td
                                        class="py-3 px-4 text-[var(--color-off-black)]"
                                        >{guest.firstName} {guest.lastName}</td
                                    >
                                    <td class="py-3 px-4 text-gray-500"
                                        >{guest.email}</td
                                    >
                                    <td class="py-3 px-4">
                                        <input
                                            type="text"
                                            value={guest.paddleNumber || ""}
                                            on:change={(e) =>
                                                updatePaddleNumber(
                                                    guest,
                                                    e.target.value,
                                                )}
                                            class="w-20 px-2 py-1 border border-gray-300 rounded focus:border-[var(--color-accent-gold)] outline-none text-center font-mono"
                                            placeholder="---"
                                        />
                                    </td>
                                    <td class="py-3 px-4">
                                        {#if guest.checkedIn}
                                            <span
                                                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                                            >
                                                Checked In
                                            </span>
                                        {:else}
                                            <span
                                                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                                            >
                                                Pending
                                            </span>
                                        {/if}
                                    </td>
                                    <td class="py-3 px-4">
                                        <button
                                            on:click={() =>
                                                toggleCheckIn(guest)}
                                            class="text-sm font-medium underline transition-colors {guest.checkedIn
                                                ? 'text-red-600 hover:text-red-800'
                                                : 'text-[var(--color-vibrant-pink)] hover:text-[#9a8673]'}"
                                        >
                                            {guest.checkedIn
                                                ? "Undo Check-in"
                                                : "Check In"}
                                        </button>
                                    </td>
                                </tr>
                            {/each}
                            {#if filteredGuests.length === 0}
                                <tr>
                                    <td
                                        colspan="5"
                                        class="py-8 text-center text-gray-500"
                                        >No guests found.</td
                                    >
                                </tr>
                            {/if}
                        </tbody>
                    </table>
                </div>
            </div>
        {:else if activeTab === "donations"}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <!-- Total Raised Card -->
                <div
                    class="bg-[var(--color-off-black)] text-white rounded-lg p-6 shadow-lg md:col-span-3 lg:col-span-1"
                >
                    <h3 class="text-lg font-medium opacity-80 mb-2">
                        Total Raised
                    </h3>
                    <p
                        class="text-4xl font-bold text-[var(--color-accent-gold)]"
                    >
                        ${totalRaised.toLocaleString()}
                    </p>
                    <div class="mt-4 text-sm opacity-60">
                        {donations.length} donations received
                    </div>
                </div>

                <!-- Recent Donations List -->
                <div
                    class="bg-white rounded-lg shadow p-6 md:col-span-3 lg:col-span-2"
                >
                    <h3
                        class="text-xl font-bold text-[var(--color-off-black)] mb-4"
                    >
                        Recent Donations
                    </h3>
                    <div class="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                        {#each donations as donation (donation.id)}
                            <div
                                class="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-100"
                            >
                                <div>
                                    <p
                                        class="font-bold text-[var(--color-off-black)]"
                                    >
                                        {donation.donorName || "Anonymous"}
                                    </p>
                                    <p class="text-sm text-gray-500">
                                        {donation.message || "No message"}
                                    </p>
                                </div>
                                <div class="text-right">
                                    <p
                                        class="text-xl font-bold text-[var(--color-vibrant-pink)]"
                                    >
                                        ${Number(
                                            donation.amount,
                                        ).toLocaleString()}
                                    </p>
                                    <p class="text-xs text-gray-400">
                                        {donation.createdAt?.toDate
                                            ? donation.createdAt
                                                  .toDate()
                                                  .toLocaleTimeString()
                                            : "Just now"}
                                    </p>
                                </div>
                            </div>
                        {/each}
                        {#if donations.length === 0}
                            <p class="text-center text-gray-500 py-8">
                                No donations yet.
                            </p>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}
    {/if}
</div>
