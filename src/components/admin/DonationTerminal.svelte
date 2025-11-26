<script>
    import { db } from "../../lib/galaFirebase";
    import {
        collection,
        addDoc,
        serverTimestamp,
        query,
        orderBy,
        limit,
        onSnapshot,
        doc,
        getDoc,
    } from "firebase/firestore";
    import { onMount } from "svelte";

    // State
    let activeTab = "pledge"; // 'pledge' or 'external'
    let loading = false;
    let error = "";
    let successMessage = "";
    let showConfirm = false;
    let confirmGuestName = "";

    // Data Models
    let pledgeData = { paddleNumber: "", amount: "" };
    let externalData = {
        donorName: "",
        email: "",
        description: "",
        amount: "",
    };
    let donations = [];

    // Live Feed
    onMount(() => {
        const q = query(
            collection(db, "gala_donations"),
            orderBy("timestamp", "desc"),
            limit(15),
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            donations = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
        });
        return unsubscribe;
    });

    // Handlers
    async function verifyPledge() {
        if (!pledgeData.paddleNumber || !pledgeData.amount) {
            error = "Please enter both Paddle # and Amount.";
            return;
        }

        loading = true;
        error = "";

        try {
            const docRef = doc(
                db,
                "gala_guests",
                String(pledgeData.paddleNumber),
            );
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                confirmGuestName = docSnap.data().fullName;
                showConfirm = true;
            } else {
                error = `Paddle #${pledgeData.paddleNumber} not found.`;
            }
        } catch (err) {
            error = err.message;
        } finally {
            loading = false;
        }
    }

    async function submitPledge() {
        loading = true;
        try {
            await addDoc(collection(db, "gala_donations"), {
                type: "PLEDGE",
                paddleNumber: Number(pledgeData.paddleNumber),
                donorName: confirmGuestName, // Store name for easier display
                amount: Number(pledgeData.amount),
                timestamp: serverTimestamp(),
            });

            showSuccess(
                `Recorded $${pledgeData.amount} pledge from ${confirmGuestName}`,
            );
            pledgeData = { paddleNumber: "", amount: "" };
            showConfirm = false;
        } catch (err) {
            error = err.message;
        } finally {
            loading = false;
        }
    }

    async function submitExternal() {
        if (!externalData.donorName || !externalData.amount) {
            error = "Name and Amount are required.";
            return;
        }

        loading = true;
        error = "";

        try {
            await addDoc(collection(db, "gala_donations"), {
                type: "EXTERNAL",
                donorName: externalData.donorName,
                donorEmail: externalData.email,
                message: externalData.description,
                amount: Number(externalData.amount),
                timestamp: serverTimestamp(),
            });

            showSuccess(
                `Recorded $${externalData.amount} from ${externalData.donorName}`,
            );
            externalData = {
                donorName: "",
                email: "",
                description: "",
                amount: "",
            };
        } catch (err) {
            error = err.message;
        } finally {
            loading = false;
        }
    }

    function showSuccess(msg) {
        successMessage = msg;
        setTimeout(() => (successMessage = ""), 3000);
    }

    function formatTime(timestamp) {
        if (!timestamp) return "";
        return timestamp
            .toDate()
            .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
</script>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full">
    <!-- Left Column: Entry Forms -->
    <div class="lg:col-span-2 space-y-6">
        <div
            class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
        >
            <!-- Tabs -->
            <div class="flex border-b border-gray-100">
                <button
                    class="flex-1 py-4 text-center font-bold transition-colors {activeTab ===
                    'pledge'
                        ? 'bg-[var(--color-vibrant-pink)] text-white'
                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}"
                    on:click={() => (activeTab = "pledge")}
                >
                    Paddle Pledge
                </button>
                <button
                    class="flex-1 py-4 text-center font-bold transition-colors {activeTab ===
                    'external'
                        ? 'bg-[var(--color-vibrant-pink)] text-white'
                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}"
                    on:click={() => (activeTab = "external")}
                >
                    External / Sponsor
                </button>
            </div>

            <div class="p-8">
                {#if error}
                    <div
                        class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6"
                    >
                        {error}
                    </div>
                {/if}

                {#if successMessage}
                    <div
                        class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6 flex items-center"
                    >
                        <svg
                            class="w-5 h-5 mr-2"
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
                        {successMessage}
                    </div>
                {/if}

                {#if activeTab === "pledge"}
                    {#if !showConfirm}
                        <form
                            on:submit|preventDefault={verifyPledge}
                            class="space-y-6"
                        >
                            <div>
                                <label
                                    for="paddle-input"
                                    class="block text-sm font-bold text-gray-700 mb-2"
                                    >Paddle Number</label
                                >
                                <input
                                    id="paddle-input"
                                    type="number"
                                    bind:value={pledgeData.paddleNumber}
                                    class="w-full text-4xl p-4 border-2 border-gray-200 rounded-lg focus:border-[var(--color-vibrant-pink)] focus:ring-0 outline-none font-mono text-center"
                                    placeholder="###"
                                    required
                                    autofocus
                                />
                            </div>
                            <div>
                                <label
                                    for="amount-input"
                                    class="block text-sm font-bold text-gray-700 mb-2"
                                    >Amount ($)</label
                                >
                                <input
                                    id="amount-input"
                                    type="number"
                                    bind:value={pledgeData.amount}
                                    class="w-full text-4xl p-4 border-2 border-gray-200 rounded-lg focus:border-[var(--color-vibrant-pink)] focus:ring-0 outline-none font-mono text-center"
                                    placeholder="0.00"
                                    required
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                class="w-full bg-[var(--color-off-black)] text-white text-xl font-bold py-4 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                                {loading ? "Verifying..." : "Verify Pledge"}
                            </button>
                        </form>
                    {:else}
                        <div class="text-center space-y-6">
                            <div
                                class="bg-yellow-50 border border-yellow-200 p-6 rounded-lg"
                            >
                                <p
                                    class="text-gray-500 uppercase tracking-wide text-sm font-bold mb-2"
                                >
                                    Confirm Pledge
                                </p>
                                <h3
                                    class="text-3xl font-bold text-[var(--color-off-black)] mb-1"
                                >
                                    {confirmGuestName}
                                </h3>
                                <p class="text-xl text-gray-600">
                                    Paddle #{pledgeData.paddleNumber}
                                </p>
                                <div
                                    class="my-4 border-t border-yellow-200 w-1/2 mx-auto"
                                ></div>
                                <p
                                    class="text-4xl font-bold text-[var(--color-vibrant-pink)]"
                                >
                                    ${pledgeData.amount}
                                </p>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <button
                                    on:click={() => (showConfirm = false)}
                                    class="py-3 px-6 rounded-lg border-2 border-gray-300 text-gray-600 font-bold hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    on:click={submitPledge}
                                    disabled={loading}
                                    class="py-3 px-6 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 shadow-lg transform transition hover:-translate-y-0.5"
                                >
                                    {loading ? "Saving..." : "CONFIRM PLEDGE"}
                                </button>
                            </div>
                        </div>
                    {/if}
                {:else}
                    <form
                        on:submit|preventDefault={submitExternal}
                        class="space-y-4"
                    >
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label
                                    for="donor-name"
                                    class="block text-sm font-bold text-gray-700 mb-1"
                                    >Donor Name</label
                                >
                                <input
                                    id="donor-name"
                                    type="text"
                                    bind:value={externalData.donorName}
                                    class="w-full p-3 border border-gray-300 rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label
                                    for="donor-amount"
                                    class="block text-sm font-bold text-gray-700 mb-1"
                                    >Amount ($)</label
                                >
                                <input
                                    id="donor-amount"
                                    type="number"
                                    bind:value={externalData.amount}
                                    class="w-full p-3 border border-gray-300 rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none"
                                    required
                                />
                            </div>
                        </div>
                        <div>
                            <label
                                for="donor-email"
                                class="block text-sm font-bold text-gray-700 mb-1"
                                >Email (Optional)</label
                            >
                            <input
                                id="donor-email"
                                type="email"
                                bind:value={externalData.email}
                                class="w-full p-3 border border-gray-300 rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none"
                            />
                        </div>
                        <div>
                            <label
                                for="donor-desc"
                                class="block text-sm font-bold text-gray-700 mb-1"
                                >Description / Note</label
                            >
                            <textarea
                                id="donor-desc"
                                bind:value={externalData.description}
                                class="w-full p-3 border border-gray-300 rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none"
                                rows="3"
                            ></textarea>
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            class="w-full bg-[var(--color-off-black)] text-white text-lg font-bold py-3 rounded hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                            {loading ? "Saving..." : "Submit Donation"}
                        </button>
                    </form>
                {/if}
            </div>
        </div>
    </div>

    <!-- Right Column: Live Feed -->
    <div
        class="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[600px]"
    >
        <div
            class="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center"
        >
            <h3 class="font-bold text-[var(--color-off-black)]">Live Feed</h3>
            <span
                class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full animate-pulse"
                >● Live</span
            >
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
            {#each donations as donation (donation.id)}
                <div
                    class="p-3 border-l-4 border-[var(--color-vibrant-pink)] bg-gray-50 rounded shadow-sm"
                >
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="font-bold text-[var(--color-off-black)]">
                                {donation.donorName || "Anonymous"}
                            </p>
                            {#if donation.type === "PLEDGE"}
                                <p class="text-xs text-gray-500 font-mono">
                                    Paddle #{donation.paddleNumber}
                                </p>
                            {:else}
                                <p class="text-xs text-gray-500">
                                    {donation.message || "External Donation"}
                                </p>
                            {/if}
                        </div>
                        <div class="text-right">
                            <p class="font-bold text-green-600 text-lg">
                                ${Number(donation.amount).toLocaleString()}
                            </p>
                            <p class="text-xs text-gray-400">
                                {formatTime(donation.timestamp)}
                            </p>
                        </div>
                    </div>
                </div>
            {/each}
            {#if donations.length === 0}
                <div class="text-center py-10 text-gray-400">
                    <p>No donations yet.</p>
                </div>
            {/if}
        </div>
    </div>
</div>
