<script>
    import { db } from "../../lib/galaFirebase";
    import {
        collection,
        doc,
        writeBatch,
        getDoc,
        setDoc,
        deleteDoc,
        onSnapshot,
        query,
        orderBy,
    } from "firebase/firestore";
    import { onMount } from "svelte";

    let guests = [];
    let loading = false;
    let error = "";
    let successMessage = "";

    // Manual Add Form Data
    let newGuest = {
        paddleNumber: "",
        fullName: "",
        email: "",
        guestCount: 1,
    };

    onMount(() => {
        const q = query(collection(db, "gala_guests"), orderBy("paddleNumber"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            guests = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
        });
        return unsubscribe;
    });

    async function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        loading = true;
        error = "";
        successMessage = "";

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                const lines = text.split("\n");
                const headers = lines[0].split(",").map((h) => h.trim());

                // Validate headers
                const requiredHeaders = [
                    "PaddleNumber",
                    "FullName",
                    "Email",
                    "GuestCount",
                ];
                const missingHeaders = requiredHeaders.filter(
                    (h) => !headers.includes(h),
                );
                if (missingHeaders.length > 0) {
                    throw new Error(
                        `Missing headers: ${missingHeaders.join(", ")}`,
                    );
                }

                const batch = writeBatch(db);
                let count = 0;

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const values = line.split(","); // Simple split, assumes no commas in values for now
                    const data = {};
                    headers.forEach((header, index) => {
                        data[header] = values[index]?.trim();
                    });

                    if (!data.PaddleNumber) continue;

                    const docRef = doc(db, "gala_guests", data.PaddleNumber);
                    batch.set(docRef, {
                        paddleNumber: Number(data.PaddleNumber),
                        fullName: data.FullName,
                        email: data.Email,
                        guestCount: Number(data.GuestCount) || 1,
                        checkedIn: false,
                        checkInTime: null,
                    });
                    count++;
                }

                await batch.commit();
                successMessage = `Successfully uploaded ${count} guests.`;
                event.target.value = ""; // Reset input
            } catch (err) {
                console.error(err);
                error = "Error processing CSV: " + err.message;
            } finally {
                loading = false;
            }
        };
        reader.readAsText(file);
    }

    async function addManualGuest() {
        if (!newGuest.paddleNumber || !newGuest.fullName) {
            error = "Paddle Number and Full Name are required.";
            return;
        }

        loading = true;
        error = "";
        successMessage = "";

        try {
            const docRef = doc(
                db,
                "gala_guests",
                String(newGuest.paddleNumber),
            );
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                throw new Error(
                    `Guest with Paddle #${newGuest.paddleNumber} already exists.`,
                );
            }

            await setDoc(docRef, {
                paddleNumber: Number(newGuest.paddleNumber),
                fullName: newGuest.fullName,
                email: newGuest.email,
                guestCount: Number(newGuest.guestCount),
                checkedIn: false,
                checkInTime: null,
            });

            successMessage = `Added ${newGuest.fullName} (Paddle #${newGuest.paddleNumber})`;
            newGuest = {
                paddleNumber: "",
                fullName: "",
                email: "",
                guestCount: 1,
            };
        } catch (err) {
            error = err.message;
        } finally {
            loading = false;
        }
    }

    async function deleteGuest(paddleNumber) {
        if (
            !confirm(`Are you sure you want to delete Paddle #${paddleNumber}?`)
        )
            return;

        try {
            await deleteDoc(doc(db, "gala_guests", String(paddleNumber)));
        } catch (err) {
            error = "Failed to delete guest: " + err.message;
        }
    }
</script>

<div class="space-y-8">
    <!-- Header -->
    <div>
        <h2 class="text-2xl font-bold text-[var(--color-off-black)]">
            Paddle Management
        </h2>
        <p class="text-[var(--color-medium-gray)]">
            Upload guests via CSV or add them manually.
        </p>
    </div>

    <!-- Messages -->
    {#if error}
        <div
            class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
            role="alert"
        >
            <span class="block sm:inline">{error}</span>
        </div>
    {/if}
    {#if successMessage}
        <div
            class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative"
            role="alert"
        >
            <span class="block sm:inline">{successMessage}</span>
        </div>
    {/if}

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <!-- CSV Upload -->
        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 class="text-lg font-bold text-[var(--color-vibrant-pink)] mb-4">
                Bulk Upload (CSV)
            </h3>
            <p class="text-sm text-gray-500 mb-4">
                Headers required: <code class="bg-gray-100 px-1"
                    >PaddleNumber, FullName, Email, GuestCount</code
                >
            </p>
            <input
                type="file"
                accept=".csv"
                on:change={handleFileUpload}
                disabled={loading}
                class="block w-full text-sm text-gray-500
          file:mr-4 file:py-2 file:px-4
          file:rounded-full file:border-0
          file:text-sm file:font-semibold
          file:bg-[var(--color-light-gray)] file:text-[var(--color-vibrant-pink)]
          hover:file:bg-gray-100
        "
            />
        </div>

        <!-- Manual Add -->
        <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
            <h3 class="text-lg font-bold text-[var(--color-vibrant-pink)] mb-4">
                Add Single Guest
            </h3>
            <form on:submit|preventDefault={addManualGuest} class="space-y-3">
                <div>
                    <label
                        for="paddle-number"
                        class="block text-xs font-medium text-gray-500 mb-1"
                        >Paddle #</label
                    >
                    <input
                        id="paddle-number"
                        type="number"
                        bind:value={newGuest.paddleNumber}
                        class="w-full px-3 py-2 border rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none"
                        required
                    />
                </div>
                <div>
                    <label
                        for="full-name"
                        class="block text-xs font-medium text-gray-500 mb-1"
                        >Full Name</label
                    >
                    <input
                        id="full-name"
                        type="text"
                        bind:value={newGuest.fullName}
                        class="w-full px-3 py-2 border rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none"
                        required
                    />
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label
                            for="email"
                            class="block text-xs font-medium text-gray-500 mb-1"
                            >Email</label
                        >
                        <input
                            id="email"
                            type="email"
                            bind:value={newGuest.email}
                            class="w-full px-3 py-2 border rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none"
                        />
                    </div>
                    <div>
                        <label
                            for="guest-count"
                            class="block text-xs font-medium text-gray-500 mb-1"
                            >Guest Count</label
                        >
                        <input
                            id="guest-count"
                            type="number"
                            bind:value={newGuest.guestCount}
                            min="1"
                            class="w-full px-3 py-2 border rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none"
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={loading}
                    class="w-full bg-[var(--color-off-black)] text-white font-bold py-2 rounded hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                    {loading ? "Adding..." : "Add Guest"}
                </button>
            </form>
        </div>
    </div>

    <!-- Guest List -->
    <div
        class="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden"
    >
        <div class="p-4 border-b border-gray-100 bg-gray-50">
            <h3 class="font-bold text-[var(--color-off-black)]">
                Current Guest List ({guests.length})
            </h3>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
                <thead class="bg-gray-50 text-[var(--color-medium-gray)]">
                    <tr>
                        <th class="px-4 py-3 font-medium">Paddle</th>
                        <th class="px-4 py-3 font-medium">Name</th>
                        <th class="px-4 py-3 font-medium">Email</th>
                        <th class="px-4 py-3 font-medium">Guests</th>
                        <th class="px-4 py-3 font-medium text-right">Actions</th
                        >
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    {#each guests as guest}
                        <tr class="hover:bg-gray-50">
                            <td
                                class="px-4 py-3 font-mono font-bold text-[var(--color-vibrant-pink)]"
                                >{guest.paddleNumber}</td
                            >
                            <td
                                class="px-4 py-3 font-medium text-[var(--color-off-black)]"
                                >{guest.fullName}</td
                            >
                            <td class="px-4 py-3 text-gray-500"
                                >{guest.email || "-"}</td
                            >
                            <td class="px-4 py-3 text-gray-500"
                                >{guest.guestCount}</td
                            >
                            <td class="px-4 py-3 text-right">
                                <button
                                    on:click={() =>
                                        deleteGuest(guest.paddleNumber)}
                                    class="text-red-500 hover:text-red-700 font-medium text-xs uppercase tracking-wide"
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    {/each}
                    {#if guests.length === 0}
                        <tr>
                            <td
                                colspan="6"
                                class="px-4 py-8 text-center text-gray-400"
                                >No guests found. Upload a CSV or add one
                                manually.</td
                            >
                        </tr>
                    {/if}
                </tbody>
            </table>
        </div>
    </div>
</div>
