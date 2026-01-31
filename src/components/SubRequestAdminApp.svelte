<script>
    import { onMount, onDestroy } from "svelte";
    import { subsDb } from "../lib/subsFirebase";
    import {
        collection,
        onSnapshot,
        doc,
        addDoc,
        updateDoc,
        deleteDoc,
        Timestamp,
        query,
        where,
        orderBy,
        getDocs,
    } from "firebase/firestore";
    import SubRequestCard from "./SubRequestCard.svelte";
    import CreateSubRequestModal from "./CreateSubRequestModal.svelte";

    // --- Authentication ---
    let isAuthenticated = false;
    let passwordInput = "";
    let authError = "";
    const ADMIN_PASSWORD = "XavierLSP123!";

    function handleLogin() {
        if (passwordInput === ADMIN_PASSWORD) {
            isAuthenticated = true;
            authError = "";
        } else {
            authError = "Incorrect password.";
        }
    }

    // --- Data ---
    let requests = [];
    let loading = true;
    let error = null;

    // --- Search & Filter ---
    let searchQuery = "";
    let statusFilter = "all"; // all, open, pending, approved

    // --- Month Navigation ---
    let viewMonth = new Date().getMonth();
    let viewYear = new Date().getFullYear();
    let currentSubscriptionKey = "";

    $: viewMonthLabel = new Date(viewYear, viewMonth).toLocaleDateString(
        "en-US",
        {
            month: "long",
            year: "numeric",
        },
    );

    function prevMonth() {
        if (viewMonth === 0) {
            viewMonth = 11;
            viewYear -= 1;
        } else {
            viewMonth -= 1;
        }
    }

    function nextMonth() {
        if (viewMonth === 11) {
            viewMonth = 0;
            viewYear += 1;
        } else {
            viewMonth += 1;
        }
    }

    function goToCurrentMonth() {
        const now = new Date();
        viewMonth = now.getMonth();
        viewYear = now.getFullYear();
    }

    // --- Export State ---
    let showExportModal = false;
    let exportStartDate = "";
    let exportEndDate = "";
    let isExporting = false;

    // --- Add Request Modal ---
    let showAddModal = false;
    let isAddingRequest = false;

    // --- Assign Sub Modal ---
    let showAssignModal = false;
    let assignRequest = null;
    let assignName = "";
    let assignEmail = "";
    let assignPhone = "";
    let isAssigning = false;

    // --- Confirm Action Modal ---
    let showConfirmModal = false;
    let confirmAction = null; // 'approve' or 'reject'
    let confirmRequest = null;
    let confirmVolunteer = null;
    let isProcessingAction = false;

    // --- Delete Confirmation Modal ---
    let showDeleteModal = false;
    let deleteRequest = null;
    let isDeleting = false;

    // --- Helpers ---
    const toDateStr = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    onMount(() => {
        if (!isAuthenticated) return;
        // Initial export date setup
        const now = new Date();
        exportStartDate = toDateStr(
            new Date(now.getFullYear(), now.getMonth(), 1),
        );
        exportEndDate = toDateStr(
            new Date(now.getFullYear(), now.getMonth() + 1, 0),
        );
    });

    $: if (isAuthenticated) {
        updateSubscription(viewYear, viewMonth);
    }

    let unsubscribe = null;

    onDestroy(() => {
        if (unsubscribe) unsubscribe();
    });

    function updateSubscription(year, month) {
        const key = `${year}-${month}`;
        if (key === currentSubscriptionKey) return;
        currentSubscriptionKey = key;
        subscribeToRequests(year, month);
    }

    function subscribeToRequests(year, month) {
        if (unsubscribe) unsubscribe();
        loading = true;

        try {
            // Fetch data for the selected month with 1 month buffer on each side
            const startOfWindow = new Date(year, month - 1, 1); // Previous month
            const endOfWindow = new Date(year, month + 2, 0, 23, 59, 59); // End of next month

            const q = query(
                collection(subsDb, "sub_requests"),
                where("date", ">=", Timestamp.fromDate(startOfWindow)),
                where("date", "<=", Timestamp.fromDate(endOfWindow)),
                orderBy("date", "asc"),
            );

            unsubscribe = onSnapshot(
                q,
                (snapshot) => {
                    const data = [];
                    snapshot.forEach((docSnap) => {
                        const d = docSnap.data();
                        data.push({
                            id: docSnap.id,
                            ...d,
                            date: d.date?.toDate
                                ? d.date.toDate()
                                : new Date(d.date),
                            createdAt: d.createdAt?.toDate
                                ? d.createdAt.toDate()
                                : new Date(),
                        });
                    });
                    data.sort((a, b) => a.date - b.date);
                    requests = data;
                    loading = false;
                },
                (err) => {
                    console.error("Firestore error:", err);
                    error = "Could not load sub requests.";
                    loading = false;
                },
            );
        } catch (e) {
            console.error("App Error:", e);
            error = e.message;
            loading = false;
        }
    }

    // --- Export CSV ---
    async function exportCSV() {
        if (!exportStartDate || !exportEndDate) {
            alert("Please select start and end dates.");
            return;
        }

        isExporting = true;
        try {
            const [sy, sm, sd] = exportStartDate.split("-").map(Number);
            const [ey, em, ed] = exportEndDate.split("-").map(Number);
            const startD = new Date(sy, sm - 1, sd);
            const endD = new Date(ey, em - 1, ed, 23, 59, 59);

            const q = query(
                collection(subsDb, "sub_requests"),
                where("date", ">=", Timestamp.fromDate(startD)),
                where("date", "<=", Timestamp.fromDate(endD)),
                orderBy("date", "asc"),
            );

            const snapshot = await getDocs(q);
            const exportData = [];
            snapshot.forEach((docSnap) => {
                const d = docSnap.data();
                exportData.push({
                    id: docSnap.id,
                    ...d,
                    date: d.date?.toDate ? d.date.toDate() : new Date(d.date),
                });
            });

            // Generate CSV
            const rows = [
                [
                    "Class Name",
                    "Date",
                    "Time",
                    "Duration",
                    "Location",
                    "Status",
                    "Requested By",
                    "Assigned Sub",
                    "Volunteers",
                ],
            ];

            exportData.forEach((req) => {
                const dateStr = req.date.toLocaleDateString();
                const timeStr = req.date.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                });
                const requestedBy = req.requestedBy?.name || "";
                const assignedSub = req.assignedSub?.name || "";
                const volunteers = (req.volunteers || [])
                    .map((v) => v.name)
                    .join("; ");

                rows.push([
                    `"${req.className || ""}"`,
                    `"${dateStr}"`,
                    `"${timeStr}"`,
                    `"${req.duration || ""}"`,
                    `"${req.location || ""}"`,
                    `"${req.status || ""}"`,
                    `"${requestedBy}"`,
                    `"${assignedSub}"`,
                    `"${volunteers}"`,
                ]);
            });

            const csvContent =
                "data:text/csv;charset=utf-8," +
                rows.map((e) => e.join(",")).join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute(
                "download",
                `sub_requests_${exportStartDate}_to_${exportEndDate}.csv`,
            );
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showExportModal = false;
        } catch (e) {
            console.error("Export failed:", e);
            alert("Export failed: " + e.message);
        } finally {
            isExporting = false;
        }
    }

    // --- Search & Filter Logic ---
    $: filteredRequests = requests.filter((req) => {
        // Status filter
        if (statusFilter !== "all" && req.status !== statusFilter) {
            return false;
        }

        // Search filter
        if (searchQuery.length >= 2) {
            const query = searchQuery.toLowerCase();
            const matchClass = req.className?.toLowerCase().includes(query);
            const matchInstructor = req.requestedBy?.name
                ?.toLowerCase()
                .includes(query);
            const matchSub = req.assignedSub?.name
                ?.toLowerCase()
                .includes(query);
            const matchVolunteer = req.volunteers?.some((v) =>
                v.name?.toLowerCase().includes(query),
            );
            const matchDate = toDateStr(req.date).includes(query);
            const matchLocation = req.location?.toLowerCase().includes(query);

            return (
                matchClass ||
                matchInstructor ||
                matchSub ||
                matchVolunteer ||
                matchDate ||
                matchLocation
            );
        }

        return true;
    });

    // Group by status for summary
    $: statusCounts = {
        open: requests.filter((r) => r.status === "open").length,
        pending: requests.filter((r) => r.status === "pending").length,
        approved: requests.filter((r) => r.status === "approved").length,
        total: requests.length,
    };

    // --- Actions ---
    // Add Request Success State
    let addSuccess = false;

    async function handleAddRequest(event) {
        isAddingRequest = true;
        const {
            className,
            instructorName,
            instructorEmail,
            date,
            time,
            duration,
            location,
            notes,
        } = event.detail;

        try {
            const [y, m, d] = date.split("-").map(Number);
            const [h, min] = time.split(":").map(Number);
            const dateObj = new Date(y, m - 1, d, h, min);

            await addDoc(collection(subsDb, "sub_requests"), {
                className,
                date: Timestamp.fromDate(dateObj),
                duration,
                location,
                notes,
                requestedBy: {
                    name: instructorName,
                    email: instructorEmail,
                },
                status: "open",
                volunteers: [],
                assignedSub: null,
                createdAt: Timestamp.now(),
            });

            addSuccess = true; // Show success view in modal
        } catch (e) {
            console.error("Add failed:", e);
            alert("Failed to add request: " + e.message);
        } finally {
            isAddingRequest = false;
        }
    }

    function handleCloseAddModal() {
        showAddModal = false;
        addSuccess = false; // Reset success state when closing
    }

    async function handleApprove(event) {
        const request = event.detail;
        if (!request.volunteers || request.volunteers.length === 0) {
            alert("No volunteers to approve.");
            return;
        }

        // Open confirmation modal with volunteer selection
        confirmRequest = request;
        // Default to first volunteer, but allow selection if multiple
        confirmVolunteer = request.volunteers[0];
        confirmAction = "approve";
        showConfirmModal = true;
    }

    async function executeApprove() {
        isProcessingAction = true;
        try {
            await updateDoc(doc(subsDb, "sub_requests", confirmRequest.id), {
                status: "approved",
                assignedSub: {
                    name: confirmVolunteer.name,
                    email: confirmVolunteer.email,
                    phone: confirmVolunteer.phone,
                    assignedAt: new Date().toISOString(),
                },
            });
            showConfirmModal = false;
        } catch (e) {
            console.error("Approve failed:", e);
            alert("Failed to approve: " + e.message);
        } finally {
            isProcessingAction = false;
        }
    }

    async function handleReject(event) {
        const request = event.detail;

        // Open confirmation modal for reject
        confirmRequest = request;
        confirmVolunteer = request.volunteers?.[0] || null;
        confirmAction = "reject";
        showConfirmModal = true;
    }

    async function executeReject() {
        isProcessingAction = true;
        try {
            await updateDoc(doc(subsDb, "sub_requests", confirmRequest.id), {
                status: "open",
                volunteers: [],
            });
            showConfirmModal = false;
        } catch (e) {
            console.error("Reject failed:", e);
            alert("Failed to reject: " + e.message);
        } finally {
            isProcessingAction = false;
        }
    }

    function closeConfirmModal() {
        showConfirmModal = false;
        confirmAction = null;
        confirmRequest = null;
        confirmVolunteer = null;
    }

    function openAssignModal(event) {
        assignRequest = event.detail;
        assignName = "";
        assignEmail = "";
        assignPhone = "";
        showAssignModal = true;
    }

    async function handleAssign() {
        if (!assignName || !assignEmail) {
            alert("Please enter name and email.");
            return;
        }

        isAssigning = true;
        try {
            await updateDoc(doc(subsDb, "sub_requests", assignRequest.id), {
                status: "approved",
                assignedSub: {
                    name: assignName,
                    email: assignEmail,
                    phone: assignPhone,
                    assignedAt: new Date().toISOString(),
                },
            });
            showAssignModal = false;
        } catch (e) {
            console.error("Assign failed:", e);
            alert("Failed to assign: " + e.message);
        } finally {
            isAssigning = false;
        }
    }

    async function handleDelete(event) {
        deleteRequest = event.detail;
        showDeleteModal = true;
    }

    async function executeDelete() {
        isDeleting = true;
        try {
            await deleteDoc(doc(subsDb, "sub_requests", deleteRequest.id));
            showDeleteModal = false;
        } catch (e) {
            console.error("Delete failed:", e);
            alert("Failed to delete: " + e.message);
        } finally {
            isDeleting = false;
        }
    }

    function closeDeleteModal() {
        showDeleteModal = false;
        deleteRequest = null;
    }

    function handleEdit(event) {
        // Simple edit via assign modal for now
        openAssignModal(event);
    }

    function formatDate(date) {
        return date.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }
</script>

{#if !isAuthenticated}
    <!-- Login Screen -->
    <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
            <div class="text-center mb-8">
                <h1 class="text-3xl font-bold text-gray-900 font-rubik">
                    Sub Request Admin
                </h1>
                <p class="text-gray-500 mt-2">
                    Enter password to manage substitute requests
                </p>
            </div>

            <form on:submit|preventDefault={handleLogin}>
                <div class="space-y-4">
                    <div>
                        <label
                            for="password"
                            class="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            bind:value={passwordInput}
                            class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                            placeholder="Enter admin password"
                        />
                    </div>

                    {#if authError}
                        <p class="text-red-600 text-sm">{authError}</p>
                    {/if}

                    <button
                        type="submit"
                        class="w-full py-3 bg-vibrant-pink text-white rounded-lg font-bold hover:bg-accent-gold transition-colors cursor-pointer"
                    >
                        Login
                    </button>
                </div>
            </form>
        </div>
    </div>
{:else}
    <!-- Admin Dashboard -->
    <div class="min-h-screen bg-gray-50">
        <div class="max-w-7xl mx-auto px-4 py-8">
            <!-- Header -->
            <div
                class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8"
            >
                <div>
                    <h1 class="text-3xl font-bold text-gray-900 font-rubik">
                        Sub Request Admin
                    </h1>
                    <p class="text-gray-500">
                        Manage substitute requests and approvals
                    </p>
                </div>
                <div class="flex gap-3">
                    <button
                        on:click={() => (showExportModal = true)}
                        class="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors cursor-pointer flex items-center gap-2"
                    >
                        <svg
                            class="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            ></path>
                        </svg>
                        Export CSV
                    </button>
                    <button
                        on:click={() => (showAddModal = true)}
                        class="px-6 py-3 bg-vibrant-pink text-white rounded-lg font-bold hover:bg-accent-gold transition-colors cursor-pointer"
                    >
                        + New Request
                    </button>
                </div>
            </div>

            <!-- Month Navigation -->
            <div
                class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6"
            >
                <div class="flex items-center justify-between">
                    <button
                        on:click={prevMonth}
                        class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors flex items-center gap-2 cursor-pointer"
                    >
                        ← Previous
                    </button>
                    <div class="text-center">
                        <span class="font-bold text-gray-800 text-lg"
                            >{viewMonthLabel}</span
                        >
                        <button
                            on:click={goToCurrentMonth}
                            class="ml-3 text-sm text-vibrant-pink hover:text-accent-gold cursor-pointer"
                        >
                            Today
                        </button>
                    </div>
                    <button
                        on:click={nextMonth}
                        class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors flex items-center gap-2 cursor-pointer"
                    >
                        Next →
                    </button>
                </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div
                    class="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
                >
                    <p class="text-sm text-gray-500">Total</p>
                    <p class="text-2xl font-bold text-gray-900">
                        {statusCounts.total}
                    </p>
                </div>
                <div
                    class="bg-amber-50 rounded-xl p-4 shadow-sm border border-amber-100"
                >
                    <p class="text-sm text-amber-600">Open</p>
                    <p class="text-2xl font-bold text-amber-800">
                        {statusCounts.open}
                    </p>
                </div>
                <div
                    class="bg-blue-50 rounded-xl p-4 shadow-sm border border-blue-100"
                >
                    <p class="text-sm text-blue-600">Pending</p>
                    <p class="text-2xl font-bold text-blue-800">
                        {statusCounts.pending}
                    </p>
                </div>
                <div
                    class="bg-green-50 rounded-xl p-4 shadow-sm border border-green-100"
                >
                    <p class="text-sm text-green-600">Approved</p>
                    <p class="text-2xl font-bold text-green-800">
                        {statusCounts.approved}
                    </p>
                </div>
            </div>

            <!-- Search & Filter -->
            <div
                class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6"
            >
                <div class="flex flex-col md:flex-row gap-4">
                    <div class="flex-1">
                        <input
                            type="text"
                            bind:value={searchQuery}
                            placeholder="Search by name, class, date, location..."
                            class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                        />
                    </div>
                    <div class="flex gap-2">
                        <button
                            on:click={() => (statusFilter = "all")}
                            class="px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer {statusFilter ===
                            'all'
                                ? 'bg-gray-900 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
                        >
                            All
                        </button>
                        <button
                            on:click={() => (statusFilter = "open")}
                            class="px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer {statusFilter ===
                            'open'
                                ? 'bg-amber-500 text-white'
                                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}"
                        >
                            Open
                        </button>
                        <button
                            on:click={() => (statusFilter = "pending")}
                            class="px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer {statusFilter ===
                            'pending'
                                ? 'bg-blue-500 text-white'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}"
                        >
                            Pending
                        </button>
                        <button
                            on:click={() => (statusFilter = "approved")}
                            class="px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer {statusFilter ===
                            'approved'
                                ? 'bg-green-500 text-white'
                                : 'bg-green-50 text-green-700 hover:bg-green-100'}"
                        >
                            Approved
                        </button>
                    </div>
                </div>
                {#if searchQuery.length >= 2}
                    <p class="text-sm text-gray-500 mt-2">
                        Found {filteredRequests.length} result{filteredRequests.length !==
                        1
                            ? "s"
                            : ""}
                    </p>
                {/if}
            </div>

            <!-- Requests List -->
            {#if loading}
                <div class="text-center py-12">
                    <div
                        class="animate-spin h-8 w-8 border-4 border-vibrant-pink border-t-transparent rounded-full mx-auto"
                    ></div>
                    <p class="text-gray-500 mt-4">Loading...</p>
                </div>
            {:else if error}
                <div
                    class="text-center py-12 text-red-600 bg-red-50 rounded-xl"
                >
                    {error}
                </div>
            {:else if filteredRequests.length === 0}
                <div
                    class="text-center py-12 text-gray-500 bg-white rounded-xl border"
                >
                    <p class="text-lg">No requests found.</p>
                    {#if searchQuery}
                        <p class="text-sm mt-2">Try a different search term.</p>
                    {/if}
                </div>
            {:else}
                <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {#each filteredRequests as request (request.id)}
                        <SubRequestCard
                            {request}
                            isAdmin={true}
                            on:approve={handleApprove}
                            on:reject={handleReject}
                            on:assign={openAssignModal}
                            on:edit={handleEdit}
                            on:delete={handleDelete}
                        />
                    {/each}
                </div>
            {/if}
        </div>
    </div>

    <!-- Assign Sub Modal -->
    {#if showAssignModal && assignRequest}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
                class="absolute inset-0 bg-black/50 backdrop-blur-sm w-full h-full border-0 cursor-default"
                on:click={() => (showAssignModal = false)}
                aria-label="Close"
            ></button>

            <div
                class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
                <div class="bg-vibrant-pink p-6 text-white">
                    <h2 class="text-2xl font-bold font-rubik">
                        Assign Substitute
                    </h2>
                    <p class="text-white/90 mt-1">
                        {assignRequest.className} • {formatDate(
                            assignRequest.date,
                        )}
                    </p>
                </div>

                <form on:submit|preventDefault={handleAssign}>
                    <div class="p-6 space-y-4">
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-700 mb-1"
                            >
                                Substitute Name *
                            </label>
                            <input
                                type="text"
                                bind:value={assignName}
                                class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-700 mb-1"
                            >
                                Email *
                            </label>
                            <input
                                type="email"
                                bind:value={assignEmail}
                                class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label
                                class="block text-sm font-medium text-gray-700 mb-1"
                            >
                                Phone
                            </label>
                            <input
                                type="tel"
                                bind:value={assignPhone}
                                class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                            />
                        </div>
                    </div>
                    <div class="p-6 bg-gray-50 flex gap-3 justify-end">
                        <button
                            type="button"
                            on:click={() => (showAssignModal = false)}
                            class="px-4 py-2 rounded-lg text-gray-600 font-medium hover:bg-gray-100 cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isAssigning ||
                                !assignName ||
                                !assignEmail}
                            class="px-6 py-2 rounded-lg bg-vibrant-pink text-white font-bold hover:bg-accent-gold transition-colors disabled:opacity-50 cursor-pointer"
                        >
                            {isAssigning ? "Assigning..." : "Assign Sub"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    {/if}

    <!-- Create Request Modal -->
    <CreateSubRequestModal
        isOpen={showAddModal}
        isSubmitting={isAddingRequest}
        success={addSuccess}
        on:close={handleCloseAddModal}
        on:submit={handleAddRequest}
    />

    <!-- Confirm Approve/Reject Modal -->
    {#if showConfirmModal && confirmRequest}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
                class="absolute inset-0 bg-black/50 backdrop-blur-sm w-full h-full border-0 cursor-default"
                on:click={closeConfirmModal}
                aria-label="Close"
            ></button>

            <div
                class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
                {#if confirmAction === "approve"}
                    <!-- Approve Confirmation -->
                    <div class="bg-green-600 p-6 text-white">
                        <h2 class="text-2xl font-bold font-rubik">
                            Confirm Approval
                        </h2>
                        <p class="text-white/90 mt-1">
                            {confirmRequest.className}
                        </p>
                    </div>

                    <div class="p-6 space-y-4">
                        <!-- Volunteer Selection (when multiple volunteers) -->
                        {#if confirmRequest.volunteers?.length > 1}
                            <div
                                class="bg-blue-50 rounded-lg p-4 border border-blue-200"
                            >
                                <label
                                    for="volunteerSelect"
                                    class="block text-blue-800 font-medium mb-2"
                                >
                                    Select which volunteer to approve:
                                </label>
                                <select
                                    id="volunteerSelect"
                                    class="w-full px-4 py-3 rounded-lg border border-blue-300 bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                                    bind:value={confirmVolunteer}
                                >
                                    {#each confirmRequest.volunteers as volunteer, index}
                                        <option value={volunteer}>
                                            {volunteer.name} ({volunteer.email})
                                        </option>
                                    {/each}
                                </select>
                                <p class="text-blue-600 text-xs mt-2">
                                    {confirmRequest.volunteers.length} volunteers
                                    waiting for approval
                                </p>
                            </div>
                        {/if}

                        <div
                            class="bg-green-50 rounded-lg p-4 border border-green-100"
                        >
                            <p class="text-green-800 font-medium">
                                {#if confirmRequest.volunteers?.length > 1}
                                    Selected volunteer:
                                {:else}
                                    Approve
                                {/if}
                                <span class="font-bold"
                                    >{confirmVolunteer?.name}</span
                                >
                                {#if confirmRequest.volunteers?.length <= 1}
                                    as the substitute?
                                {/if}
                            </p>
                            {#if confirmVolunteer?.phone}
                                <p class="text-green-700 text-sm mt-1">
                                    📱 Phone: {confirmVolunteer.phone}
                                </p>
                            {/if}
                            {#if confirmVolunteer?.email}
                                <p class="text-green-700 text-sm">
                                    ✉️ Email: {confirmVolunteer.email}
                                </p>
                            {/if}
                        </div>

                        <!-- Reminder Alert -->
                        <div
                            class="bg-amber-50 rounded-lg p-4 border border-amber-200"
                        >
                            <div class="flex items-start gap-3">
                                <span class="text-2xl">📲</span>
                                <div>
                                    <p class="font-bold text-amber-800">
                                        Don't forget!
                                    </p>
                                    <p class="text-amber-700 text-sm mt-1">
                                        Please <strong
                                            >text the substitute</strong
                                        > to remind them they have volunteered for
                                        this shift and confirm they can still make
                                        it.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="p-6 bg-gray-50 flex gap-3 justify-end">
                        <button
                            type="button"
                            on:click={closeConfirmModal}
                            class="px-4 py-2 rounded-lg text-gray-600 font-medium hover:bg-gray-100 cursor-pointer"
                            disabled={isProcessingAction}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            on:click={executeApprove}
                            disabled={isProcessingAction}
                            class="px-6 py-2 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                        >
                            {#if isProcessingAction}
                                <svg
                                    class="animate-spin h-4 w-4"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        class="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        stroke-width="4"
                                        fill="none"
                                    ></circle>
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                </svg>
                                Approving...
                            {:else}
                                ✓ Approve Sub
                            {/if}
                        </button>
                    </div>
                {:else}
                    <!-- Reject Confirmation -->
                    <div class="bg-red-600 p-6 text-white">
                        <h2 class="text-2xl font-bold font-rubik">
                            Confirm Rejection
                        </h2>
                        <p class="text-white/90 mt-1">
                            {confirmRequest.className}
                        </p>
                    </div>

                    <div class="p-6 space-y-4">
                        <div
                            class="bg-red-50 rounded-lg p-4 border border-red-100"
                        >
                            <p class="text-red-800">
                                This will reject all volunteer requests and
                                reopen this sub request for new volunteers.
                            </p>
                            {#if confirmVolunteer}
                                <p class="text-red-700 text-sm mt-2">
                                    <strong>{confirmVolunteer.name}</strong> will
                                    be notified they were not selected.
                                </p>
                            {/if}
                        </div>

                        <div
                            class="bg-amber-50 rounded-lg p-4 border border-amber-200"
                        >
                            <div class="flex items-start gap-3">
                                <span class="text-2xl">💬</span>
                                <div>
                                    <p class="text-amber-700 text-sm">
                                        Consider texting the volunteer to
                                        explain why they weren't selected and
                                        thank them for their willingness to
                                        help.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="p-6 bg-gray-50 flex gap-3 justify-end">
                        <button
                            type="button"
                            on:click={closeConfirmModal}
                            class="px-4 py-2 rounded-lg text-gray-600 font-medium hover:bg-gray-100 cursor-pointer"
                            disabled={isProcessingAction}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            on:click={executeReject}
                            disabled={isProcessingAction}
                            class="px-6 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                        >
                            {#if isProcessingAction}
                                <svg
                                    class="animate-spin h-4 w-4"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        class="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        stroke-width="4"
                                        fill="none"
                                    ></circle>
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                </svg>
                                Rejecting...
                            {:else}
                                ✗ Reject & Reopen
                            {/if}
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    <!-- Delete Confirmation Modal -->
    {#if showDeleteModal && deleteRequest}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
                class="absolute inset-0 bg-black/50 backdrop-blur-sm w-full h-full border-0 cursor-default"
                on:click={closeDeleteModal}
                aria-label="Close"
            ></button>

            <div
                class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
                <div class="bg-red-600 p-6 text-white">
                    <h2 class="text-2xl font-bold font-rubik">
                        Delete Request?
                    </h2>
                    <p class="text-white/90 mt-1">
                        {deleteRequest.className}
                    </p>
                </div>

                <div class="p-6 space-y-4">
                    <div class="bg-red-50 rounded-lg p-4 border border-red-100">
                        <div class="flex items-start gap-3">
                            <span class="text-2xl">⚠️</span>
                            <div>
                                <p class="font-bold text-red-800">
                                    This action cannot be undone!
                                </p>
                                <p class="text-red-700 text-sm mt-1">
                                    The sub request for <strong
                                        >"{deleteRequest.className}"</strong
                                    > will be permanently deleted.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div
                        class="bg-gray-50 rounded-lg p-4 border border-gray-200 text-sm text-gray-600"
                    >
                        <p>
                            <strong>Date:</strong>
                            {deleteRequest.date?.toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                            })}
                        </p>
                        <p>
                            <strong>Requested by:</strong>
                            {deleteRequest.requestedBy?.name || "Unknown"}
                        </p>
                        {#if deleteRequest.assignedSub}
                            <p>
                                <strong>Assigned sub:</strong>
                                {deleteRequest.assignedSub.name}
                            </p>
                        {/if}
                    </div>
                </div>

                <div class="p-6 bg-gray-50 flex gap-3 justify-end">
                    <button
                        type="button"
                        on:click={closeDeleteModal}
                        class="px-4 py-2 rounded-lg text-gray-600 font-medium hover:bg-gray-100 cursor-pointer"
                        disabled={isDeleting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        on:click={executeDelete}
                        disabled={isDeleting}
                        class="px-6 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                    >
                        {#if isDeleting}
                            <svg
                                class="animate-spin h-4 w-4"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    class="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    stroke-width="4"
                                    fill="none"
                                ></circle>
                                <path
                                    class="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                            </svg>
                            Deleting...
                        {:else}
                            🗑️ Delete Permanently
                        {/if}
                    </button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Export CSV Modal -->
    {#if showExportModal}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button
                class="absolute inset-0 bg-black/50 backdrop-blur-sm w-full h-full border-0 cursor-default"
                on:click={() => (showExportModal = false)}
                aria-label="Close export modal"
            ></button>

            <div
                class="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
                <div class="bg-vibrant-pink p-6 text-white">
                    <h2 class="text-2xl font-bold font-rubik">
                        Export Sub Requests
                    </h2>
                    <p class="text-white/90 mt-1">
                        Download a CSV report for any date range
                    </p>
                </div>

                <div class="p-6 space-y-4">
                    <div>
                        <label
                            for="export-start-date"
                            class="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Start Date
                        </label>
                        <input
                            id="export-start-date"
                            type="date"
                            bind:value={exportStartDate}
                            class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                        />
                    </div>
                    <div>
                        <label
                            for="export-end-date"
                            class="block text-sm font-medium text-gray-700 mb-1"
                        >
                            End Date
                        </label>
                        <input
                            id="export-end-date"
                            type="date"
                            bind:value={exportEndDate}
                            class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-vibrant-pink outline-none"
                        />
                    </div>
                </div>

                <div class="p-6 pt-0 flex gap-3 justify-end">
                    <button
                        type="button"
                        on:click={() => (showExportModal = false)}
                        class="px-6 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        on:click={exportCSV}
                        disabled={isExporting}
                        class="px-6 py-2 rounded-lg bg-vibrant-pink text-white font-bold hover:bg-accent-gold transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                    >
                        {#if isExporting}
                            <svg
                                class="animate-spin h-4 w-4"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    class="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    stroke-width="4"
                                    fill="none"
                                ></circle>
                                <path
                                    class="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                            </svg>
                            Exporting...
                        {:else}
                            Download CSV
                        {/if}
                    </button>
                </div>
            </div>
        </div>
    {/if}
{/if}
