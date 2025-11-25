<script>
    import { onMount, tick } from "svelte";
    import { db } from "../lib/firebase";
    import {
        collection,
        onSnapshot,
        doc,
        runTransaction,
        addDoc,
        deleteDoc,
        setDoc,
        Timestamp,
    } from "firebase/firestore";
    import { generateShifts, getShiftId } from "../lib/shiftUtils";
    import MiniCalendar from "./MiniCalendar.svelte";

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

    // --- Data & State ---
    let shifts = []; // Combined shifts
    let generatedShifts = []; // Base generated shifts
    let customShifts = []; // Fetched custom shifts
    let shiftData = {}; // Registration data
    let loading = true;
    let error = null;
    let selectedDate = new Date();

    // Add Shift Form State
    let addShiftDate = "";
    let addShiftTime = "18:00";
    let addShiftDuration = 60; // minutes
    let addShiftLeadCap = 1;
    let addShiftVolCap = 2;
    let isAddingShift = false;

    // Bulk Upload State
    let csvFile;
    let isUploading = false;

    // Collapsible State
    let expandedShiftIds = new Set();
    let expandedDayKeys = new Set(); // Track expanded days

    // Export State
    let startDate = new Date().toISOString().split("T")[0];
    let endDate = new Date(new Date().setMonth(new Date().getMonth() + 1))
        .toISOString()
        .split("T")[0];

    // Helper: Convert Date -> "YYYY-MM-DD" safely
    const toDateStr = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    // Helper: Get start of week (Sunday)
    const getStartOfWeek = (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        d.setDate(diff);
        return d;
    };

    // Helper: Add days to a Date string
    const addDays = (dateStr, days) => {
        const [y, m, d] = dateStr.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        date.setDate(date.getDate() + days);
        return toDateStr(date);
    };

    // State is tracked by STRINGS to be browser-safe
    let currentWeekStartStr = toDateStr(getStartOfWeek(new Date()));

    onMount(() => {
        try {
            generatedShifts = generateShifts();

            // Subscribe to standard shift data (registrations/cancellations)
            const unsubShifts = onSnapshot(
                collection(db, "shifts"),
                (snapshot) => {
                    const data = {};
                    snapshot.forEach((doc) => {
                        data[doc.id] = doc.data();
                    });
                    shiftData = data;
                    combineShifts();
                },
                (err) => {
                    console.error("Firestore Error (Shifts):", err);
                    error = "Could not load shift data.";
                },
            );

            // Subscribe to custom shifts
            const unsubCustom = onSnapshot(
                collection(db, "custom_shifts"),
                (snapshot) => {
                    const custom = [];
                    snapshot.forEach((doc) => {
                        const d = doc.data();
                        // Convert Timestamp to Date
                        const start = d.start.toDate();
                        const end = d.end.toDate();
                        // Create date object for grouping
                        const date = new Date(start);
                        date.setHours(0, 0, 0, 0);

                        custom.push({
                            id: doc.id,
                            start,
                            end,
                            date,
                            dateStr: toDateStr(date),
                            isCustom: true,
                            leadCapacity: d.leadCapacity,
                            volunteerCapacity: d.volunteerCapacity,
                        });
                    });
                    customShifts = custom;
                    combineShifts();
                    loading = false;
                },
                (err) => {
                    console.error("Firestore Error (Custom):", err);
                    error = "Could not load custom shifts.";
                },
            );

            return () => {
                unsubShifts();
                unsubCustom();
            };
        } catch (e) {
            console.error("App Error:", e);
            error = e.message;
            loading = false;
        }
    });

    function combineShifts() {
        // 1. Filter out cancelled standard shifts
        const activeGenerated = generatedShifts.filter((s) => {
            const data = shiftData[s.id];
            return !data?.cancelled;
        });

        // 2. Combine with custom shifts
        const combined = [...activeGenerated, ...customShifts];

        // 3. Sort by start time
        combined.sort((a, b) => a.start - b.start);

        shifts = combined;
    }

    // --- Actions ---

    async function handleAddShift() {
        if (!addShiftDate || !addShiftTime) {
            alert("Please select date and time.");
            return;
        }

        isAddingShift = true;
        try {
            const [y, m, d] = addShiftDate.split("-").map(Number);
            const [h, min] = addShiftTime.split(":").map(Number);

            const start = new Date(y, m - 1, d, h, min);
            const end = new Date(start.getTime() + addShiftDuration * 60000);

            await addDoc(collection(db, "custom_shifts"), {
                start: Timestamp.fromDate(start),
                end: Timestamp.fromDate(end),
                leadCapacity: addShiftLeadCap,
                volunteerCapacity: addShiftVolCap,
                createdAt: Timestamp.now(),
            });

            alert("Shift added successfully!");
            // Reset form
            addShiftTime = "18:00";
            addShiftDuration = 60;
        } catch (e) {
            console.error("Add shift failed:", e);
            alert("Failed to add shift: " + e.message);
        } finally {
            isAddingShift = false;
        }
    }

    async function handleBulkUpload() {
        if (!csvFile) {
            alert("Please select a CSV file first.");
            return;
        }

        isUploading = true;
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                const lines = text.split("\n");
                let successCount = 0;
                let failCount = 0;

                // Skip header if present (simple check: if first line contains "Date")
                const startIdx = lines[0].toLowerCase().includes("date")
                    ? 1
                    : 0;

                for (let i = startIdx; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    try {
                        // Expected: Date, StartTime, Duration, LeadCapacity, VolunteerCapacity
                        // Example: 2025-11-26, 18:00, 60, 1, 2
                        const [dateStr, timeStr, durStr, leadStr, volStr] = line
                            .split(",")
                            .map((s) => s.trim());

                        if (!dateStr || !timeStr) continue;

                        const [y, m, d] = dateStr.split("-").map(Number);
                        const [h, min] = timeStr.split(":").map(Number);
                        const duration = Number(durStr) || 60;
                        const leadCap = Number(leadStr) || 1;
                        const volCap = Number(volStr) || 2;

                        const start = new Date(y, m - 1, d, h, min);
                        const end = new Date(
                            start.getTime() + duration * 60000,
                        );

                        await addDoc(collection(db, "custom_shifts"), {
                            start: Timestamp.fromDate(start),
                            end: Timestamp.fromDate(end),
                            leadCapacity: leadCap,
                            volunteerCapacity: volCap,
                            createdAt: Timestamp.now(),
                        });
                        successCount++;
                    } catch (err) {
                        console.error(
                            `Failed to parse line ${i + 1}:`,
                            line,
                            err,
                        );
                        failCount++;
                    }
                }
                alert(
                    `Upload complete. Added: ${successCount}, Failed: ${failCount}`,
                );
                csvFile = null; // Reset
            } catch (err) {
                alert("Upload failed: " + err.message);
            } finally {
                isUploading = false;
            }
        };

        reader.readAsText(csvFile);
    }

    async function handleDeleteShift(shift) {
        if (
            !confirm(
                "Are you sure you want to DELETE this shift? This cannot be undone.",
            )
        )
            return;

        try {
            if (shift.isCustom) {
                // Permanently delete custom shift
                await deleteDoc(doc(db, "custom_shifts", shift.id));
            } else {
                // "Cancel" standard shift
                await setDoc(
                    doc(db, "shifts", shift.id),
                    {
                        cancelled: true,
                    },
                    { merge: true },
                );
            }
        } catch (e) {
            console.error("Delete failed:", e);
            alert("Failed to delete shift: " + e.message);
        }
    }

    async function handleRemoveVolunteer(shiftId, index) {
        if (
            !confirm(
                "Are you sure you want to REMOVE this volunteer? This will open up the spot.",
            )
        )
            return;

        const shiftRef = doc(db, "shifts", shiftId);
        try {
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(shiftRef);
                if (!sfDoc.exists()) throw "Shift does not exist!";
                const data = sfDoc.data();
                const registrations = data.registrations || [];

                if (!registrations[index]) throw "Registration not found!";

                // Get role to update counts
                const removedRole = registrations[index].role;

                // Remove the volunteer
                registrations.splice(index, 1);

                // Prepare updates
                const updates = { registrations };

                if (removedRole === "lead") {
                    updates.lead = Math.max(0, (data.lead || 0) - 1);
                } else {
                    // Default to volunteer if role is missing or 'volunteer'
                    updates.volunteer = Math.max(0, (data.volunteer || 0) - 1);
                }

                transaction.update(shiftRef, updates);
            });
        } catch (e) {
            console.error("Remove failed:", e);
            alert("Failed to remove: " + e);
        }
    }

    async function handleUnCheckIn(shiftId, index) {
        if (
            !confirm(
                "Are you sure you want to UN-CHECK IN this volunteer? Their check-in time will be lost.",
            )
        )
            return;

        const shiftRef = doc(db, "shifts", shiftId);
        try {
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(shiftRef);
                if (!sfDoc.exists()) throw "Shift does not exist!";
                const data = sfDoc.data();
                const registrations = data.registrations || [];

                if (!registrations[index]) throw "Registration not found!";

                // Un-check in
                registrations[index].checkedIn = false;
                delete registrations[index].checkInTime;

                transaction.update(shiftRef, { registrations });
            });
        } catch (e) {
            console.error("Un-check in failed:", e);
            alert("Failed to un-check in: " + e);
        }
    }

    function exportCSV() {
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const rows = [
            [
                "Name",
                "Email",
                "Phone",
                "Shift Date",
                "Shift Time",
                "Status",
                "Check-in Time",
            ],
        ];

        shifts.forEach((shift) => {
            if (shift.start >= start && shift.start <= end) {
                const data = shiftData[shift.id] || {};
                const regs = data.registrations || [];

                regs.forEach((reg) => {
                    const shiftDate = shift.start.toLocaleDateString();
                    const shiftTime = `${shift.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${shift.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
                    const status = reg.checkedIn ? "Checked In" : "Registered";
                    const checkInTime = reg.checkInTime
                        ? new Date(reg.checkInTime).toLocaleString()
                        : "";

                    rows.push([
                        `"${reg.name || ""}"`,
                        `"${reg.email || ""}"`,
                        `"${reg.phone || ""}"`,
                        `"${shiftDate}"`,
                        `"${shiftTime}"`,
                        `"${status}"`,
                        `"${checkInTime}"`,
                    ]);
                });
            }
        });

        const csvContent =
            "data:text/csv;charset=utf-8," +
            rows.map((e) => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute(
            "download",
            `volunteer_report_${startDate}_to_${endDate}.csv`,
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- Grouping & Filtering ---
    $: shiftsByDate = shifts.reduce((acc, shift) => {
        const dateKey = shift.dateStr || toDateStr(shift.date);
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(shift);
        return acc;
    }, {});

    $: sortedDates = Object.keys(shiftsByDate).sort();

    // Filter by String Comparison (Week View)
    $: visibleDates = sortedDates.filter((dateKey) => {
        const endOfWeekStr = addDays(currentWeekStartStr, 6);
        return dateKey >= currentWeekStartStr && dateKey <= endOfWeekStr;
    });

    // Auto-expand removed to default to collapsed

    // Display Title
    $: currentWeekDisplay = (() => {
        const [y, m, d] = currentWeekStartStr.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString();
    })();

    function nextWeek() {
        currentWeekStartStr = addDays(currentWeekStartStr, 7);
    }

    function prevWeek() {
        currentWeekStartStr = addDays(currentWeekStartStr, -7);
    }

    async function handleDateSelect(event) {
        const date = event.detail;
        const weekStart = getStartOfWeek(date);
        currentWeekStartStr = toDateStr(weekStart);

        await tick();

        const dateKey = toDateStr(date);
        const element = document.getElementById(`date-${dateKey}`);
        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "start" });
            // Optionally expand the selected day
            if (!expandedDayKeys.has(dateKey)) {
                expandedDayKeys.add(dateKey);
                expandedDayKeys = expandedDayKeys;
            }
        }
    }

    // Toggle Collapsible Shift
    function toggleShift(shiftId) {
        if (expandedShiftIds.has(shiftId)) {
            expandedShiftIds.delete(shiftId);
            expandedShiftIds = new Set(expandedShiftIds);
        } else {
            expandedShiftIds.add(shiftId);
            expandedShiftIds = new Set(expandedShiftIds);
        }
    }

    function toggleDay(dateKey) {
        if (expandedDayKeys.has(dateKey)) {
            expandedDayKeys.delete(dateKey);
        } else {
            expandedDayKeys.add(dateKey);
        }
        expandedDayKeys = expandedDayKeys;
    }

    // Custom Dot Condition: Show dot if ANY registrations exist
    const adminDotCondition = (shift, data) => {
        const regs = data[shift.id]?.registrations || [];
        return regs.length > 0;
    };

    // Custom Clickable Condition: Always clickable
    const adminClickableCondition = (shift, data) => true;
</script>

{#if !isAuthenticated}
    <div
        class="min-h-[60vh] flex flex-col items-center justify-center px-4 py-12"
    >
        <div
            class="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100"
        >
            <h2
                class="text-2xl font-bold text-gray-900 mb-6 text-center font-rubik"
            >
                Admin Login
            </h2>
            <form on:submit|preventDefault={handleLogin} class="space-y-4">
                <div>
                    <label
                        for="password"
                        class="block text-sm font-medium text-gray-700 mb-1"
                        >Password</label
                    >
                    <input
                        type="password"
                        id="password"
                        bind:value={passwordInput}
                        class="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-vibrant-pink focus:border-transparent outline-none transition-all"
                        placeholder="Enter admin password"
                    />
                </div>
                {#if authError}
                    <p class="text-red-600 text-sm">{authError}</p>
                {/if}
                <button
                    type="submit"
                    class="w-full bg-vibrant-pink text-white font-bold py-3 px-4 rounded-lg hover:bg-pink-600 transition-colors shadow-md hover:shadow-lg"
                >
                    Login
                </button>
            </form>
        </div>
    </div>
{:else}
    <div class="max-w-7xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
        <!-- Sidebar -->
        <div class="lg:w-1/3 xl:w-1/4">
            <div class="sticky top-24 space-y-6">
                <div
                    class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
                >
                    <div class="flex justify-between items-start mb-2">
                        <h1 class="text-2xl font-bold font-rubik text-gray-900">
                            Admin Dashboard
                        </h1>
                        <button
                            on:click={() => (isAuthenticated = false)}
                            class="text-xs text-gray-400 hover:text-red-500 underline"
                        >
                            Logout
                        </button>
                    </div>
                    <p class="text-gray-500 text-sm">
                        Manage volunteers and export reports.
                    </p>
                </div>

                <MiniCalendar
                    {shifts}
                    {shiftData}
                    {selectedDate}
                    dotCondition={adminDotCondition}
                    clickableCondition={adminClickableCondition}
                    on:select={handleDateSelect}
                />

                <!-- CSV Export Tool -->
                <div
                    class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-4"
                >
                    <h3
                        class="font-bold text-gray-800 text-sm uppercase tracking-wide"
                    >
                        Export Data
                    </h3>
                    <div class="space-y-3">
                        <div>
                            <label
                                class="block text-xs font-medium text-gray-500 mb-1"
                                >Start Date</label
                            >
                            <input
                                type="date"
                                bind:value={startDate}
                                class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                            />
                        </div>
                        <div>
                            <label
                                class="block text-xs font-medium text-gray-500 mb-1"
                                >End Date</label
                            >
                            <input
                                type="date"
                                bind:value={endDate}
                                class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                            />
                        </div>
                        <button
                            on:click={exportCSV}
                            class="w-full bg-green-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                            <svg
                                class="w-4 h-4"
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
                            Download CSV
                        </button>
                    </div>
                </div>
                <!-- Add Shift Tool -->
                <div
                    class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-4"
                >
                    <h3
                        class="font-bold text-gray-800 text-sm uppercase tracking-wide"
                    >
                        Add Single Shift
                    </h3>
                    <div class="space-y-3">
                        <div>
                            <label
                                class="block text-xs font-medium text-gray-500 mb-1"
                                >Date</label
                            >
                            <input
                                type="date"
                                bind:value={addShiftDate}
                                class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                            />
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >Time</label
                                >
                                <input
                                    type="time"
                                    bind:value={addShiftTime}
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                />
                            </div>
                            <div>
                                <label
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >Duration (m)</label
                                >
                                <input
                                    type="number"
                                    bind:value={addShiftDuration}
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                />
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div>
                                <label
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >Lead Cap</label
                                >
                                <input
                                    type="number"
                                    bind:value={addShiftLeadCap}
                                    min="0"
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                />
                            </div>
                            <div>
                                <label
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >Vol Cap</label
                                >
                                <input
                                    type="number"
                                    bind:value={addShiftVolCap}
                                    min="0"
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                />
                            </div>
                        </div>
                        <button
                            on:click={handleAddShift}
                            disabled={isAddingShift}
                            class="w-full bg-vibrant-pink text-white font-medium py-2 px-4 rounded-lg hover:bg-pink-600 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                        >
                            {isAddingShift ? "Adding..." : "Add Shift"}
                        </button>
                    </div>
                </div>

                <!-- Bulk Upload Tool -->
                <div
                    class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-4"
                >
                    <div class="flex justify-between items-center">
                        <h3
                            class="font-bold text-gray-800 text-sm uppercase tracking-wide"
                        >
                            Bulk Upload
                        </h3>
                        <!-- Help Tooltip -->
                        <div class="group relative flex justify-center">
                            <span
                                class="cursor-help text-gray-400 hover:text-gray-600"
                            >
                                <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    ><path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    ></path></svg
                                >
                            </span>
                            <div
                                class="absolute bottom-full mb-2 hidden w-64 p-2 text-xs text-white bg-gray-800 rounded shadow-lg group-hover:block z-50"
                            >
                                <p class="font-bold mb-1">CSV Format:</p>
                                <p>
                                    Date (YYYY-MM-DD), StartTime (HH:MM),
                                    Duration (min), LeadCap, VolCap
                                </p>
                                <p class="mt-1 text-gray-300">
                                    Example: 2025-11-26, 18:00, 60, 1, 2
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-3">
                        <input
                            type="file"
                            accept=".csv"
                            on:change={(e) => (csvFile = e.target.files[0])}
                            class="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100"
                        />
                        <button
                            on:click={handleBulkUpload}
                            disabled={!csvFile || isUploading}
                            class="w-full bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                        >
                            {isUploading ? "Uploading..." : "Upload CSV"}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Main Content -->
        <div class="flex-1 space-y-6">
            <!-- Week Navigation -->
            <div
                class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 sticky top-0 z-20"
            >
                <button
                    on:click={prevWeek}
                    class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors flex items-center gap-2"
                >
                    &larr; Previous Week
                </button>
                <span class="font-bold text-gray-800 hidden md:block"
                    >Week of {currentWeekDisplay}</span
                >
                <button
                    on:click={nextWeek}
                    class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors flex items-center gap-2"
                >
                    Next Week &rarr;
                </button>
            </div>

            {#if loading}
                <div class="text-center py-12">
                    <div
                        class="animate-spin rounded-full h-12 w-12 border-b-2 border-vibrant-pink mx-auto"
                    ></div>
                    <p class="mt-4 text-gray-500">Loading shifts...</p>
                </div>
            {:else if error}
                <div class="bg-red-50 text-red-700 p-4 rounded-xl">
                    {error}
                </div>
            {:else if visibleDates.length === 0}
                <div
                    class="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-100"
                >
                    <p class="text-lg">No shifts found for this week.</p>
                    <p class="text-sm mt-2">
                        Try navigating to a different week.
                    </p>
                </div>
            {:else}
                {#each visibleDates as dateKey (dateKey)}
                    {@const isDayExpanded = expandedDayKeys.has(dateKey)}
                    {@const dayShifts = shiftsByDate[dateKey] || []}
                    {@const dayStats = dayShifts.reduce(
                        (acc, shift) => {
                            const regs =
                                shiftData[shift.id]?.registrations || [];
                            acc.volunteers += regs.length;
                            acc.leads += regs.filter(
                                (r) => r.role === "lead",
                            ).length;
                            return acc;
                        },
                        { volunteers: 0, leads: 0 },
                    )}
                    <div
                        id="date-{dateKey}"
                        class="scroll-mt-32 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-4"
                    >
                        <!-- Day Header -->
                        <button
                            on:click={() => toggleDay(dateKey)}
                            class="w-full flex justify-between items-center p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                            <div
                                class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
                            >
                                <h3 class="text-lg font-bold text-gray-800">
                                    {(() => {
                                        const [y, m, d] = dateKey
                                            .split("-")
                                            .map(Number);
                                        return new Date(
                                            y,
                                            m - 1,
                                            d,
                                        ).toLocaleDateString("en-US", {
                                            weekday: "long",
                                            month: "long",
                                            day: "numeric",
                                            year: "numeric",
                                        });
                                    })()}
                                </h3>
                                {#if !isDayExpanded}
                                    <div
                                        class="flex items-center gap-3 text-sm text-gray-500"
                                    >
                                        <span
                                            class="bg-gray-200 px-2 py-0.5 rounded-md text-gray-700 font-medium"
                                            >{dayShifts.length} Shifts</span
                                        >
                                        <span class="flex items-center gap-1">
                                            <svg
                                                class="w-4 h-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                                ><path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                                                /></svg
                                            >
                                            {dayStats.volunteers} Vols
                                        </span>
                                        {#if dayStats.leads > 0}
                                            <span
                                                class="flex items-center gap-1 text-purple-600 font-medium"
                                            >
                                                <svg
                                                    class="w-4 h-4"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                    ><path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        stroke-width="2"
                                                        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                                                    /></svg
                                                >
                                                {dayStats.leads} Leads
                                            </span>
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                            <svg
                                class="w-5 h-5 text-gray-500 transform transition-transform duration-200 {isDayExpanded
                                    ? 'rotate-180'
                                    : ''}"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 9l-7 7-7-7"
                                />
                            </svg>
                        </button>

                        {#if isDayExpanded}
                            <div
                                class="p-4 space-y-4 bg-white border-t border-gray-100"
                            >
                                {#each shiftsByDate[dateKey] as shift (shift.id)}
                                    {@const data = shiftData[shift.id] || {
                                        registrations: [],
                                    }}
                                    {@const regs = data.registrations || []}
                                    {@const isExpanded = expandedShiftIds.has(
                                        shift.id,
                                    )}

                                    <div
                                        class="rounded-xl border border-gray-200 overflow-hidden transition-all duration-200 {isExpanded
                                            ? 'ring-2 ring-vibrant-pink/10 border-vibrant-pink/30'
                                            : 'hover:border-gray-300'}"
                                    >
                                        <!-- Header / Summary -->
                                        <div
                                            role="button"
                                            tabindex="0"
                                            on:click={() =>
                                                toggleShift(shift.id)}
                                            on:keydown={(e) =>
                                                e.key === "Enter" &&
                                                toggleShift(shift.id)}
                                            class="w-full text-left p-4 bg-white flex flex-col gap-2 cursor-pointer"
                                        >
                                            <div
                                                class="flex justify-between items-center w-full"
                                            >
                                                <div
                                                    class="flex items-center gap-3"
                                                >
                                                    <p
                                                        class="text-lg font-bold text-gray-900"
                                                    >
                                                        {shift.start.toLocaleTimeString(
                                                            "en-US",
                                                            {
                                                                hour: "numeric",
                                                                minute: "2-digit",
                                                            },
                                                        )} -
                                                        {shift.end.toLocaleTimeString(
                                                            "en-US",
                                                            {
                                                                hour: "numeric",
                                                                minute: "2-digit",
                                                            },
                                                        )}
                                                    </p>
                                                    <span
                                                        class="text-sm text-gray-500"
                                                    >
                                                        ({regs.length} Volunteer{regs.length !==
                                                        1
                                                            ? "s"
                                                            : ""})
                                                    </span>
                                                </div>
                                                <div
                                                    class="flex items-center gap-2"
                                                >
                                                    <button
                                                        on:click|stopPropagation={() =>
                                                            handleDeleteShift(
                                                                shift,
                                                            )}
                                                        class="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                                        title="Delete Shift"
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
                                                    <div
                                                        class="text-gray-400 transform transition-transform duration-200 {isExpanded
                                                            ? 'rotate-180'
                                                            : ''}"
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
                                                                d="M19 9l-7 7-7-7"
                                                            ></path></svg
                                                        >
                                                    </div>
                                                </div>
                                            </div>

                                            <!-- Summary List (Visible when Collapsed) -->
                                            {#if !isExpanded && regs.length > 0}
                                                <div
                                                    class="flex flex-wrap gap-2 mt-1"
                                                >
                                                    {#each regs as reg}
                                                        <span
                                                            class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200"
                                                        >
                                                            {reg.name}
                                                            {#if reg.checkedIn}
                                                                <span
                                                                    class="text-green-600 font-bold ml-1"
                                                                    >✓</span
                                                                >
                                                            {/if}
                                                        </span>
                                                    {/each}
                                                </div>
                                            {:else if !isExpanded && regs.length === 0}
                                                <p
                                                    class="text-xs text-gray-400 italic"
                                                >
                                                    No volunteers registered.
                                                </p>
                                            {/if}
                                        </div>

                                        <!-- Expanded Details (Actions) -->
                                        {#if isExpanded}
                                            <div
                                                class="border-t border-gray-100 bg-gray-50 divide-y divide-gray-100"
                                            >
                                                {#if regs.length === 0}
                                                    <div
                                                        class="p-8 text-center text-gray-400 italic"
                                                    >
                                                        No volunteers
                                                        registered.
                                                    </div>
                                                {:else}
                                                    {#each regs as reg, i}
                                                        <div
                                                            class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white transition-colors"
                                                        >
                                                            <div>
                                                                <div
                                                                    class="flex items-center gap-2"
                                                                >
                                                                    <span
                                                                        class="font-bold text-gray-900"
                                                                        >{reg.name}</span
                                                                    >
                                                                    {#if reg.role === "lead"}
                                                                        <span
                                                                            class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full"
                                                                            >Lead</span
                                                                        >
                                                                    {/if}
                                                                    {#if reg.checkedIn}
                                                                        <span
                                                                            class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1"
                                                                        >
                                                                            ✓
                                                                            Checked
                                                                            In
                                                                        </span>
                                                                    {/if}
                                                                </div>
                                                                <div
                                                                    class="text-sm text-gray-500 mt-1"
                                                                >
                                                                    {reg.email} •
                                                                    {reg.phone}
                                                                </div>
                                                                {#if reg.checkInTime}
                                                                    <div
                                                                        class="text-xs text-gray-400 mt-1"
                                                                    >
                                                                        Checked
                                                                        in: {new Date(
                                                                            reg.checkInTime,
                                                                        ).toLocaleString()}
                                                                    </div>
                                                                {/if}
                                                            </div>

                                                            <div
                                                                class="flex items-center gap-2"
                                                            >
                                                                {#if reg.checkedIn}
                                                                    <button
                                                                        on:click={() =>
                                                                            handleUnCheckIn(
                                                                                shift.id,
                                                                                i,
                                                                            )}
                                                                        class="text-xs text-orange-600 hover:text-orange-800 font-medium px-3 py-1.5 rounded border border-orange-200 hover:bg-orange-50 transition-colors bg-white"
                                                                    >
                                                                        Un-Check
                                                                        In
                                                                    </button>
                                                                {/if}
                                                                <button
                                                                    on:click={() =>
                                                                        handleRemoveVolunteer(
                                                                            shift.id,
                                                                            i,
                                                                        )}
                                                                    class="text-xs text-red-600 hover:text-red-800 font-medium px-3 py-1.5 rounded border border-red-200 hover:bg-red-50 transition-colors bg-white"
                                                                >
                                                                    Remove
                                                                </button>
                                                            </div>
                                                        </div>
                                                    {/each}
                                                {/if}
                                            </div>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>
                {/each}
            {/if}
        </div>
    </div>
{/if}
