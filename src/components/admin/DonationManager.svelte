<script>
    import { db } from "../../lib/galaFirebase";
    import {
        collection,
        onSnapshot,
        deleteDoc,
        doc,
        orderBy,
        query,
    } from "firebase/firestore";
    import { onMount } from "svelte";

    let donations = [];
    let guests = {}; // Map: paddleNumber -> { fullName, email }
    let searchTerm = "";
    let filteredDonations = [];

    // Delete confirmation modal state
    let showDeleteModal = false;
    let donationToDelete = null;

    // Stats
    $: totalTransactions = filteredDonations.length;
    $: totalAmount = filteredDonations.reduce(
        (sum, d) => sum + (Number(d.amount) || 0),
        0,
    );

    onMount(() => {
        // 1. Listen to Guests for Lookup
        const unsubGuests = onSnapshot(
            collection(db, "gala_guests"),
            (snapshot) => {
                const map = {};
                snapshot.forEach((doc) => {
                    map[doc.id] = doc.data();
                });
                guests = map;
            },
        );

        // 2. Listen to Donations
        const q = query(
            collection(db, "gala_donations"),
            orderBy("timestamp", "desc"),
        );
        const unsubDonations = onSnapshot(q, (snapshot) => {
            donations = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
        });

        return () => {
            unsubGuests();
            unsubDonations();
        };
    });

    // Filter Logic
    $: {
        if (!searchTerm) {
            filteredDonations = donations;
        } else {
            const lower = searchTerm.toLowerCase();
            filteredDonations = donations.filter((d) => {
                // Get resolved name for pledges
                let name = d.donorName || "";
                let email = d.donorEmail || "";
                let phone = "";

                if (d.type === "PLEDGE" && d.paddleNumber) {
                    const guest = guests[String(d.paddleNumber)];
                    if (guest) {
                        name = guest.fullName;
                        email = guest.email;
                        phone = guest.phone || "";
                    }
                }

                return (
                    name.toLowerCase().includes(lower) ||
                    email.toLowerCase().includes(lower) ||
                    phone.toLowerCase().includes(lower) ||
                    String(d.paddleNumber || "").includes(lower) ||
                    String(d.amount).includes(lower)
                );
            });
        }
    }

    // Actions
    function openDeleteModal(donation) {
        donationToDelete = donation;
        showDeleteModal = true;
    }

    function closeDeleteModal() {
        showDeleteModal = false;
        donationToDelete = null;
    }

    async function confirmDelete() {
        if (!donationToDelete) return;

        try {
            await deleteDoc(doc(db, "gala_donations", donationToDelete.id));
            closeDeleteModal();
        } catch (err) {
            console.error(err);
            alert("Failed to delete donation: " + err.message);
            closeDeleteModal();
        }
    }

    function exportCSV() {
        const headers = [
            "Time",
            "Type",
            "Paddle Number",
            "Donor Name",
            "Email",
            "Phone",
            "Amount",
            "Note",
        ];
        const rows = filteredDonations.map((d) => {
            let name = d.donorName || "";
            let email = d.donorEmail || "";
            let phone = "";

            if (d.type === "PLEDGE" && d.paddleNumber) {
                const guest = guests[String(d.paddleNumber)];
                if (guest) {
                    name = guest.fullName;
                    email = guest.email;
                    phone = guest.phone || "";
                }
            }

            const time = d.timestamp
                ? d.timestamp.toDate().toLocaleString()
                : "";

            return [
                `"${time}"`,
                `"${d.type}"`,
                `"${d.paddleNumber || ""}"`,
                `"${name}"`,
                `"${email}"`,
                `"${phone}"`,
                `"${d.amount}"`,
                `"${d.message || ""}"`,
            ].join(",");
        });

        const csvContent = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csvContent], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute(
            "download",
            `gala_donations_${new Date().toISOString().slice(0, 10)}.csv`,
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function getDonorDetails(donation) {
        if (donation.type === "PLEDGE") {
            const guest = guests[String(donation.paddleNumber)];
            return {
                name: guest ? guest.fullName : "Unknown Guest",
                email: guest ? guest.email : "",
                phone: guest ? guest.phone || "" : "",
                paddle: donation.paddleNumber,
            };
        }
        return {
            name: donation.donorName,
            email: donation.donorEmail,
            phone: "",
            paddle: null,
        };
    }
</script>

<div class="space-y-6 relative pb-20">
    <!-- Padding for sticky footer -->
    <!-- Header -->
    <div class="flex justify-between items-center">
        <div>
            <h2 class="text-2xl font-bold text-[var(--color-off-black)]">
                Donation History
            </h2>
            <p class="text-[var(--color-medium-gray)]">
                View and manage all transactions.
            </p>
        </div>
        <button
            on:click={exportCSV}
            class="bg-[var(--color-off-black)] text-white px-4 py-2 rounded-lg font-bold hover:opacity-90 transition-opacity flex items-center"
        >
            <svg
                class="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                ></path></svg
            >
            Export CSV
        </button>
    </div>

    <!-- Search -->
    <div class="relative">
        <input
            type="text"
            bind:value={searchTerm}
            placeholder="Search by Donor, Paddle #, Email, or Phone..."
            class="w-full p-3 pl-10 border border-gray-200 rounded-lg focus:border-[var(--color-vibrant-pink)] focus:ring-0 outline-none"
        />
        <div
            class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
        >
            <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                ><path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                ></path></svg
            >
        </div>
    </div>

    <!-- Table -->
    <div
        class="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden"
    >
        <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
                <thead class="bg-gray-50 text-[var(--color-medium-gray)]">
                    <tr>
                        <th class="px-4 py-3 font-medium">Time</th>
                        <th class="px-4 py-3 font-medium">Type</th>
                        <th class="px-4 py-3 font-medium">Donor Details</th>
                        <th class="px-4 py-3 font-medium">Email</th>
                        <th class="px-4 py-3 font-medium">Phone</th>
                        <th class="px-4 py-3 font-medium text-right">Amount</th>
                        <th class="px-4 py-3 font-medium text-center"
                            >Actions</th
                        >
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    {#each filteredDonations as donation (donation.id)}
                        {@const details = getDonorDetails(donation)}
                        <tr class="hover:bg-gray-50">
                            <td
                                class="px-4 py-3 text-gray-500 whitespace-nowrap"
                            >
                                {donation.timestamp
                                    ? donation.timestamp
                                          .toDate()
                                          .toLocaleTimeString([], {
                                              hour: "2-digit",
                                              minute: "2-digit",
                                          })
                                    : "-"}
                            </td>
                            <td class="px-4 py-3">
                                <span
                                    class="px-2 py-1 rounded text-xs font-bold {donation.type ===
                                    'PLEDGE'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-purple-100 text-purple-800'}"
                                >
                                    {donation.type}
                                </span>
                            </td>
                            <td class="px-4 py-3">
                                <div
                                    class="font-bold text-[var(--color-off-black)]"
                                >
                                    {details.name}
                                </div>
                                {#if details.paddle}
                                    <div
                                        class="text-xs text-gray-400 font-mono"
                                    >
                                        Paddle #{details.paddle}
                                    </div>
                                {/if}
                            </td>
                            <td class="px-4 py-3 text-gray-500"
                                >{details.email || "-"}</td
                            >
                            <td class="px-4 py-3 text-gray-500"
                                >{details.phone || "-"}</td
                            >
                            <td
                                class="px-4 py-3 text-right font-bold text-[var(--color-vibrant-pink)] text-lg"
                            >
                                ${Number(donation.amount).toLocaleString()}
                            </td>
                            <td class="px-4 py-3 text-center">
                                <button
                                    on:click={() => openDeleteModal(donation)}
                                    class="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                                    title="Delete Donation"
                                >
                                    <svg
                                        class="w-5 h-5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        ><path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        ></path></svg
                                    >
                                </button>
                            </td>
                        </tr>
                    {/each}
                    {#if filteredDonations.length === 0}
                        <tr>
                            <td
                                colspan="7"
                                class="px-4 py-8 text-center text-gray-400"
                                >No donations found.</td
                            >
                        </tr>
                    {/if}
                </tbody>
            </table>
        </div>
    </div>

    <!-- Sticky Summary Footer -->
    <div
        class="fixed bottom-8 right-8 bg-[var(--color-off-black)] text-white p-4 rounded-xl shadow-2xl flex items-center space-x-6 z-10 border border-gray-700"
    >
        <div>
            <p class="text-xs text-gray-400 uppercase tracking-wider">
                Transactions
            </p>
            <p class="text-xl font-bold">{totalTransactions}</p>
        </div>
        <div class="h-8 w-px bg-gray-600"></div>
        <div>
            <p class="text-xs text-gray-400 uppercase tracking-wider">
                Total Amount
            </p>
            <p class="text-xl font-bold text-[var(--color-accent-gold)]">
                ${totalAmount.toLocaleString()}
            </p>
        </div>
    </div>

    <!-- Delete Confirmation Modal -->
    {#if showDeleteModal && donationToDelete}
        <div
            class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        >
            <div class="bg-white rounded-xl shadow-2xl p-6 max-w-md mx-4">
                <h3
                    class="text-xl font-bold text-[var(--color-off-black)] mb-4"
                >
                    Confirm Deletion
                </h3>
                <p class="text-gray-600 mb-6">
                    Are you sure you want to delete this donation of
                    <span class="font-bold text-[var(--color-vibrant-pink)]">
                        ${Number(donationToDelete.amount).toLocaleString()}
                    </span>? This cannot be undone.
                </p>
                <div class="flex gap-3 justify-end">
                    <button
                        on:click={closeDeleteModal}
                        class="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        on:click={confirmDelete}
                        class="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors font-bold"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    {/if}
</div>
