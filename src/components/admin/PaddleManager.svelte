<script>
    import { db } from "../../lib/galaFirebase";
    import {
        collection,
        doc,
        writeBatch,
        getDoc,
        setDoc,
        deleteDoc,
        updateDoc,
        onSnapshot,
        query,
        orderBy,
    } from "firebase/firestore";
    import { onMount } from "svelte";

    let guests = [];
    let loading = false;
    let error = "";
    let successMessage = "";

    // Multi-select state
    let selectedGuests = new Set();
    let showDeleteModal = false;

    // Edit mode state
    let editingGuest = null; // The paddle number being edited
    let editForm = {
        paddleNumber: "",
        fullName: "",
        email: "",
        phone: "",
        guestCount: 1,
    };
    let editLoading = false;

    // Reactive check for "select all" state
    $: selectAll = guests.length > 0 && selectedGuests.size === guests.length;
    $: hasSelection = selectedGuests.size > 0;

    function toggleSelectAll() {
        if (selectAll) {
            selectedGuests = new Set();
        } else {
            selectedGuests = new Set(guests.map((g) => g.paddleNumber));
        }
    }

    function toggleGuestSelection(paddleNumber) {
        const newSet = new Set(selectedGuests);
        if (newSet.has(paddleNumber)) {
            newSet.delete(paddleNumber);
        } else {
            newSet.add(paddleNumber);
        }
        selectedGuests = newSet;
    }

    async function deleteSelectedGuests() {
        if (selectedGuests.size === 0) return;

        loading = true;
        error = "";
        successMessage = "";
        showDeleteModal = false;

        try {
            const batch = writeBatch(db);
            selectedGuests.forEach((paddleNumber) => {
                const docRef = doc(db, "gala_guests", String(paddleNumber));
                batch.delete(docRef);
            });

            await batch.commit();
            successMessage = `Successfully deleted ${selectedGuests.size} guest(s).`;
            selectedGuests = new Set();
        } catch (err) {
            error = "Failed to delete guests: " + err.message;
        } finally {
            loading = false;
        }
    }

    // Manual Add Form Data
    let newGuest = {
        paddleNumber: "",
        fullName: "",
        email: "",
        phone: "",
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
                // Phone is optional in CSV
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
                        phone: data.Phone || "",
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
                phone: newGuest.phone,
                guestCount: Number(newGuest.guestCount),
                checkedIn: false,
                checkInTime: null,
            });

            successMessage = `Added ${newGuest.fullName} (Paddle #${newGuest.paddleNumber})`;
            newGuest = {
                paddleNumber: "",
                fullName: "",
                email: "",
                phone: "",
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

    // Edit functions
    function startEdit(guest) {
        editingGuest = guest.paddleNumber;
        editForm = {
            paddleNumber: guest.paddleNumber,
            fullName: guest.fullName || "",
            email: guest.email || "",
            phone: guest.phone || "",
            guestCount: guest.guestCount || 1,
        };
    }

    function cancelEdit() {
        editingGuest = null;
        editForm = {
            paddleNumber: "",
            fullName: "",
            email: "",
            phone: "",
            guestCount: 1,
        };
    }

    async function saveEdit() {
        if (!editForm.fullName.trim()) {
            error = "Name is required.";
            return;
        }
        if (!editForm.paddleNumber) {
            error = "Paddle number is required.";
            return;
        }

        editLoading = true;
        error = "";
        successMessage = "";

        try {
            const oldPaddleNumber = editingGuest;
            const newPaddleNumber = Number(editForm.paddleNumber);

            // If paddle number changed, we need to create new doc and delete old
            if (oldPaddleNumber !== newPaddleNumber) {
                // Check if new paddle number already exists
                const newDocRef = doc(
                    db,
                    "gala_guests",
                    String(newPaddleNumber),
                );
                const newDocSnap = await getDoc(newDocRef);

                if (newDocSnap.exists()) {
                    throw new Error(
                        `Paddle #${newPaddleNumber} already exists.`,
                    );
                }

                // Get old doc data to preserve other fields
                const oldDocRef = doc(
                    db,
                    "gala_guests",
                    String(oldPaddleNumber),
                );
                const oldDocSnap = await getDoc(oldDocRef);
                const oldData = oldDocSnap.data();

                // Create new doc with updated data
                await setDoc(newDocRef, {
                    ...oldData,
                    paddleNumber: newPaddleNumber,
                    fullName: editForm.fullName.trim(),
                    email: editForm.email.trim(),
                    phone: editForm.phone.trim(),
                    guestCount: Number(editForm.guestCount),
                });

                // Delete old doc
                await deleteDoc(oldDocRef);

                successMessage = `Updated and moved Paddle #${oldPaddleNumber} → #${newPaddleNumber}`;
            } else {
                // Simple update, paddle number unchanged
                const docRef = doc(db, "gala_guests", String(oldPaddleNumber));
                await updateDoc(docRef, {
                    fullName: editForm.fullName.trim(),
                    email: editForm.email.trim(),
                    phone: editForm.phone.trim(),
                    guestCount: Number(editForm.guestCount),
                });

                successMessage = `Updated Paddle #${oldPaddleNumber}`;
            }

            cancelEdit();
        } catch (err) {
            error = "Failed to save: " + err.message;
        } finally {
            editLoading = false;
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
                    >PaddleNumber, FullName, Email, Phone, GuestCount</code
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
                            for="phone"
                            class="block text-xs font-medium text-gray-500 mb-1"
                            >Phone</label
                        >
                        <input
                            id="phone"
                            type="tel"
                            bind:value={newGuest.phone}
                            class="w-full px-3 py-2 border rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none"
                            placeholder="(555) 123-4567"
                        />
                    </div>
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
        <div
            class="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center"
        >
            <h3 class="font-bold text-[var(--color-off-black)]">
                Current Guest List ({guests.length})
            </h3>
            {#if hasSelection}
                <button
                    on:click={() => (showDeleteModal = true)}
                    class="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600 transition-colors text-sm font-medium"
                >
                    <span>🗑️</span>
                    <span>Delete Selected ({selectedGuests.size})</span>
                </button>
            {/if}
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
                <thead class="bg-gray-50 text-[var(--color-medium-gray)]">
                    <tr>
                        <th class="px-4 py-3 font-medium w-12">
                            <input
                                type="checkbox"
                                checked={selectAll}
                                on:change={toggleSelectAll}
                                disabled={guests.length === 0}
                                class="w-4 h-4 rounded border-gray-300 text-[var(--color-vibrant-pink)] focus:ring-[var(--color-vibrant-pink)] cursor-pointer"
                            />
                        </th>
                        <th class="px-4 py-3 font-medium">Paddle</th>
                        <th class="px-4 py-3 font-medium">Name</th>
                        <th class="px-4 py-3 font-medium">Email</th>
                        <th class="px-4 py-3 font-medium">Phone</th>
                        <th class="px-4 py-3 font-medium">Guests</th>
                        <th class="px-4 py-3 font-medium text-right">Actions</th
                        >
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    {#each guests as guest}
                        {#if editingGuest === guest.paddleNumber}
                            <!-- Edit Mode Row -->
                            <tr class="bg-yellow-50">
                                <td class="px-4 py-3">
                                    <input
                                        type="checkbox"
                                        disabled
                                        class="w-4 h-4 rounded border-gray-300 opacity-50"
                                    />
                                </td>
                                <td class="px-4 py-2">
                                    <input
                                        type="number"
                                        bind:value={editForm.paddleNumber}
                                        class="w-20 px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none font-mono"
                                    />
                                </td>
                                <td class="px-4 py-2">
                                    <input
                                        type="text"
                                        bind:value={editForm.fullName}
                                        class="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none"
                                        placeholder="Full Name"
                                    />
                                </td>
                                <td class="px-4 py-2">
                                    <input
                                        type="email"
                                        bind:value={editForm.email}
                                        class="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none"
                                        placeholder="email@example.com"
                                    />
                                </td>
                                <td class="px-4 py-2">
                                    <input
                                        type="tel"
                                        bind:value={editForm.phone}
                                        class="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none"
                                        placeholder="(555) 123-4567"
                                    />
                                </td>
                                <td class="px-4 py-2">
                                    <input
                                        type="number"
                                        bind:value={editForm.guestCount}
                                        min="1"
                                        class="w-16 px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-[var(--color-vibrant-pink)] outline-none text-center"
                                    />
                                </td>
                                <td class="px-4 py-2 text-right">
                                    <div class="flex gap-2 justify-end">
                                        <button
                                            on:click={saveEdit}
                                            disabled={editLoading}
                                            class="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded hover:bg-green-600 disabled:opacity-50"
                                        >
                                            {editLoading ? "..." : "Save"}
                                        </button>
                                        <button
                                            on:click={cancelEdit}
                                            disabled={editLoading}
                                            class="px-3 py-1 bg-gray-400 text-white text-xs font-bold rounded hover:bg-gray-500 disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {:else}
                            <!-- Display Mode Row -->
                            <tr
                                class="hover:bg-gray-50 {selectedGuests.has(
                                    guest.paddleNumber,
                                )
                                    ? 'bg-pink-50'
                                    : ''}"
                            >
                                <td class="px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedGuests.has(
                                            guest.paddleNumber,
                                        )}
                                        on:change={() =>
                                            toggleGuestSelection(
                                                guest.paddleNumber,
                                            )}
                                        class="w-4 h-4 rounded border-gray-300 text-[var(--color-vibrant-pink)] focus:ring-[var(--color-vibrant-pink)] cursor-pointer"
                                    />
                                </td>
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
                                    >{guest.phone || "-"}</td
                                >
                                <td class="px-4 py-3 text-gray-500"
                                    >{guest.guestCount}</td
                                >
                                <td class="px-4 py-3 text-right">
                                    <div class="flex gap-3 justify-end">
                                        <button
                                            on:click={() => startEdit(guest)}
                                            class="text-blue-500 hover:text-blue-700 font-medium text-xs uppercase tracking-wide"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            on:click={() =>
                                                deleteGuest(guest.paddleNumber)}
                                            class="text-red-500 hover:text-red-700 font-medium text-xs uppercase tracking-wide"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {/if}
                    {/each}
                    {#if guests.length === 0}
                        <tr>
                            <td
                                colspan="8"
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

<!-- Delete Confirmation Modal -->
{#if showDeleteModal}
    <div
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
        <div class="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 class="text-lg font-bold text-[var(--color-off-black)] mb-4">
                Confirm Bulk Delete
            </h3>
            <p class="text-[var(--color-medium-gray)] mb-6">
                Are you sure you want to delete <strong class="text-red-500"
                    >{selectedGuests.size}</strong
                > guest(s)? This action cannot be undone.
            </p>
            <div class="flex gap-3 justify-end">
                <button
                    on:click={() => (showDeleteModal = false)}
                    class="px-4 py-2 border border-gray-300 rounded-md text-[var(--color-medium-gray)] hover:bg-gray-50 transition-colors"
                >
                    Cancel
                </button>
                <button
                    on:click={deleteSelectedGuests}
                    disabled={loading}
                    class="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                    {loading ? "Deleting..." : "Delete"}
                </button>
            </div>
        </div>
    </div>
{/if}
