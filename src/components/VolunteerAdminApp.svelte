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
        query,
        where,
        orderBy,
        documentId,
        getDocs,
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
    let startDate = new Date(new Date().getFullYear(), 0, 1)
        .toISOString()
        .split("T")[0]; // Default to Jan 1st
    let endDate = new Date(new Date().setMonth(new Date().getMonth() + 1))
        .toISOString()
        .split("T")[0];

    // --- Manual Check-In State ---
    let manualShiftDate = "";
    let manualShiftTime = "18:00";
    let manualName = "";
    let manualEmail = "";
    let manualCheckInDate = "";
    let manualCheckInTime = "";
    let isManualCheckingIn = false;

    // --- Edit Check-In State ---
    let editingCheckInKey = null; // "shiftId-index"
    let editCheckInValue = ""; // ISO string for input

    // --- Volunteer Search State ---
    let searchQuery = "";
    let isSearchActive = false;
    let searchResults = []; // Array of {shift, registration, registrationIndex}
    let searchStats = { totalShifts: 0, totalHours: 0, checkedInCount: 0 };

    // --- Bulk Shift Time Deletion State ---
    let bulkDeleteTimeSlot = ""; // Selected time slot (e.g., "08:00-09:00")
    let bulkDeleteDaysOfWeek = []; // No days selected by default - user must choose
    const dayNames = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ];
    let isBulkDeleting = false;
    let bulkDeletePreview = null; // {toDelete: [], conflicts: []}
    let showBulkDeleteReport = false;
    let bulkDeleteReport = { deleted: 0, skipped: 0, conflicts: [] };

    // --- Bulk Recurring Shift Creation State ---
    let recurringStartDate = "";
    let recurringEndDate = "";
    let recurringTime = "18:00";
    let recurringDuration = 60;
    let recurringDaysOfWeek = []; // Which days to create shifts on
    let recurringLeadCap = 1;
    let recurringVolCap = 2;
    let isCreatingRecurring = false;
    let recurringPreview = null; // {dates: [], count: 0}

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

    // Track subscriptions
    let unsubShifts;
    let unsubCustom;
    let currentSubscriptionKey = ""; // "YYYY-MM" to track active window

    onMount(() => {
        try {
            // Generate including past shifts (start of PREVIOUS year for history)
            // We still generate all specific shift slots in memory as it's cheap
            const startOfHistory = new Date(new Date().getFullYear() - 1, 0, 1);
            generatedShifts = generateShifts(startOfHistory, 30); // 30 months (2.5 years)
        } catch (e) {
            console.error("Initialization Error:", e);
            error = e.message;
            loading = false;
        }
    });

    // Reactive subscription based on visible week
    $: {
        if (currentWeekStartStr) {
            updateSubscriptionsForWeek(currentWeekStartStr);
        }
    }

    function updateSubscriptionsForWeek(weekStart) {
        // Determine window: Month of the current view
        // We must ensure we cover the entire visible week.
        // If the week straddles two months, we need to fetch both (or the wider range).

        const dStart = new Date(weekStart);

        // Fetch only the current month (1 month) based on the week start
        const viewStartYear = dStart.getFullYear();
        const viewStartMonth = dStart.getMonth();
        const startOfFetch = new Date(viewStartYear, viewStartMonth, 1);
        const endOfFetch = new Date(
            viewStartYear,
            viewStartMonth + 1,
            0,
            23,
            59,
            59,
        );

        // Create a key based on the fetch range
        const key = `${startOfFetch.getTime()}-${endOfFetch.getTime()}`;
        if (key === currentSubscriptionKey) return;

        currentSubscriptionKey = key;
        subscribeToData(startOfFetch, endOfFetch);
    }

    function subscribeToData(start, end) {
        loading = true;
        // Unsub previous
        if (unsubShifts) unsubShifts();
        if (unsubCustom) unsubCustom();

        try {
            // 1. Subscribe to 'shifts' (Registrations)
            // Query by Document ID range
            // IDs are formatted as "YYYY-MM-DD..."
            const startId = toDateStr(start); // e.g. "2025-01-01"
            // For endId, we want to include the last day.
            // "2025-01-31" should match "2025-01-31_..."
            // So we use end date + 1 day as exclusive upper bound, or just prefix check?
            // "2025-02-01" is safer as upper bound
            const endBoundDate = new Date(end);
            endBoundDate.setDate(endBoundDate.getDate() + 1);
            const endId = toDateStr(endBoundDate);

            // Logic: __name__ >= startIdString AND __name__ < endIdString
            const shiftsQuery = query(
                collection(db, "shifts"),
                where(documentId(), ">=", startId),
                where(documentId(), "<", endId),
            );

            unsubShifts = onSnapshot(
                shiftsQuery,
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

            // 2. Subscribe to 'custom_shifts'
            // Query by 'start' Timestamp
            const customQuery = query(
                collection(db, "custom_shifts"),
                where("start", ">=", Timestamp.fromDate(start)),
                where("start", "<=", Timestamp.fromDate(end)),
            );

            unsubCustom = onSnapshot(
                customQuery,
                (snapshot) => {
                    const custom = [];
                    snapshot.forEach((doc) => {
                        const d = doc.data();
                        const start = d.start.toDate();
                        const end = d.end.toDate();
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
        } catch (e) {
            console.error("Subscription Error:", e);
            error = e.message;
            loading = false;
        }
    }

    // Cleanup on destroy logic if needed, usually Svelte handles it if we returned it from onMount
    // but here we manage it manually.
    import { onDestroy } from "svelte";
    onDestroy(() => {
        if (unsubShifts) unsubShifts();
        if (unsubCustom) unsubCustom();
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

        // DEBUG LOGS
        if (shifts.length > 0) {
            console.log("Combined Shifts Debug:");
            console.log("Total Shifts:", shifts.length);
            console.log("First Shift:", shifts[0].dateStr);
            console.log("Last Shift:", shifts[shifts.length - 1].dateStr);

            // Check November specifically
            const novShifts = shifts.filter((s) =>
                s.dateStr.startsWith("2025-11"),
            );
            console.log("November 2025 Shifts Count:", novShifts.length);

            // Check registrations in November
            const novRegs = novShifts.reduce((count, s) => {
                const data = shiftData[s.id] || {};
                return count + (data.registrations?.length || 0);
            }, 0);
            console.log("Total Registrations in Nov 2025:", novRegs);
        }
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

    // --- Recurring Shift Functions ---
    function previewRecurringShifts() {
        if (
            !recurringStartDate ||
            !recurringEndDate ||
            recurringDaysOfWeek.length === 0
        ) {
            recurringPreview = null;
            return;
        }

        const [sy, sm, sd] = recurringStartDate.split("-").map(Number);
        const [ey, em, ed] = recurringEndDate.split("-").map(Number);
        const startD = new Date(sy, sm - 1, sd);
        const endD = new Date(ey, em - 1, ed);

        if (endD < startD) {
            recurringPreview = null;
            return;
        }

        const dates = [];
        const current = new Date(startD);

        while (current <= endD) {
            if (recurringDaysOfWeek.includes(current.getDay())) {
                dates.push(new Date(current));
            }
            current.setDate(current.getDate() + 1);
        }

        recurringPreview = {
            dates,
            count: dates.length,
            firstDate: dates.length > 0 ? dates[0] : null,
            lastDate: dates.length > 0 ? dates[dates.length - 1] : null,
        };
    }

    async function handleCreateRecurringShifts() {
        if (!recurringPreview || recurringPreview.count === 0) {
            alert(
                "Please configure the recurring shift options and preview first.",
            );
            return;
        }

        const confirmMsg = `This will create ${recurringPreview.count} shifts from ${recurringPreview.firstDate.toLocaleDateString()} to ${recurringPreview.lastDate.toLocaleDateString()}.\n\nProceed?`;
        if (!confirm(confirmMsg)) return;

        isCreatingRecurring = true;
        let successCount = 0;
        let failCount = 0;

        try {
            const [h, min] = recurringTime.split(":").map(Number);

            for (const date of recurringPreview.dates) {
                try {
                    const start = new Date(date);
                    start.setHours(h, min, 0, 0);
                    const end = new Date(
                        start.getTime() + recurringDuration * 60000,
                    );

                    await addDoc(collection(db, "custom_shifts"), {
                        start: Timestamp.fromDate(start),
                        end: Timestamp.fromDate(end),
                        leadCapacity: recurringLeadCap,
                        volunteerCapacity: recurringVolCap,
                        createdAt: Timestamp.now(),
                    });
                    successCount++;
                } catch (err) {
                    console.error("Failed to create shift:", err);
                    failCount++;
                }
            }

            alert(
                `Created ${successCount} shifts successfully!${failCount > 0 ? ` (${failCount} failed)` : ""}`,
            );

            // Reset form
            recurringStartDate = "";
            recurringEndDate = "";
            recurringDaysOfWeek = [];
            recurringPreview = null;
        } catch (e) {
            console.error("Bulk create failed:", e);
            alert("Bulk creation failed: " + e.message);
        } finally {
            isCreatingRecurring = false;
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

    async function exportCSV() {
        // Fetch data specifically for the export range
        const exportStart = startDate; // YYYY-MM-DD
        const exportEnd = endDate; // YYYY-MM-DD

        loading = true;
        try {
            // 1. Fetch Custom Shifts for range
            const [sy, sm, sd] = exportStart.split("-").map(Number);
            const [ey, em, ed] = exportEnd.split("-").map(Number);
            const startD = new Date(sy, sm - 1, sd);
            const endD = new Date(ey, em - 1, ed, 23, 59, 59);

            const customQ = query(
                collection(db, "custom_shifts"),
                where("start", ">=", Timestamp.fromDate(startD)),
                where("start", "<=", Timestamp.fromDate(endD)),
            );
            const customSnap = await getDocs(customQ);
            const customExport = [];
            customSnap.forEach((doc) => {
                const d = doc.data();
                customExport.push({
                    id: doc.id,
                    start: d.start.toDate(),
                    end: d.end.toDate(),
                    data: d, // raw data
                });
            });

            // 2. Fetch Registrations (Shifts) for range
            // Calculate ID range
            const endBoundDate = new Date(endD);
            endBoundDate.setDate(endBoundDate.getDate() + 1);
            const endId = toDateStr(endBoundDate);

            // Allow fetching in chunks if range is huge?
            // For now assume standard usage is reasonable.
            const shiftsQ = query(
                collection(db, "shifts"),
                where(documentId(), ">=", exportStart),
                where(documentId(), "<", endId),
            );
            const shiftsSnap = await getDocs(shiftsQ);
            const shiftsExportData = {};
            shiftsSnap.forEach((doc) => {
                shiftsExportData[doc.id] = doc.data();
            });

            // 3. Merge with Generated Shifts in Memory
            // We reuse 'generatedShifts' which covers 30 months.
            // But we need to filter generatedShifts to the export range

            const shiftsInRange = generatedShifts.filter(
                (s) => s.dateStr >= exportStart && s.dateStr <= exportEnd,
            );

            // 4. Combine
            // Similar to combineShifts but local logic
            const activeGenerated = shiftsInRange.filter((s) => {
                const data = shiftsExportData[s.id];
                return !data?.cancelled;
            });

            // Map custom to common structure
            const customMapped = customExport.map((c) => ({
                id: c.id,
                start: c.start,
                end: c.end,
                dateStr: toDateStr(c.start), // Simplified, might need fix
                isCustom: true,
            }));

            const combinedExport = [...activeGenerated, ...customMapped];
            combinedExport.sort((a, b) => a.start - b.start);

            // 5. Generate CSV
            const rows = [
                [
                    "Name",
                    "Email",
                    "Phone",
                    "Shift Date",
                    "Shift Time",
                    "Shift Duration (Hours)",
                    "Status",
                    "Check-in Time",
                ],
            ];

            combinedExport.forEach((shift) => {
                // Use data from fetches
                // For generated, data is in shiftsExportData[shift.id]
                // For custom, data is in existing custom obj or we need to find it?
                // Custom shifts in fetching also have registrations in them?
                // Wait, custom shifts structure:
                // The 'custom_scripts' doc has 'start', 'end', 'leadCapacity', etc.
                // BUT where are registrations stored?
                // Check handleAddShift for custom creation.
                // Registrations for CUSTOM shifts are stored in... 'shifts' collection?
                // OR inside the custom shift doc?
                // Let's check handleManualEntry:
                // It finds 'targetShiftId' (which is the custom shift ID).
                // Then it writes to `doc(db, "shifts", targetShiftId)`.
                // SO ALL registrations are in 'shifts' collection, keyed by the shift ID (whether generated or custom).
                // AHA!
                // So my fetching of 'shiftsExportData' covers BOTH generated and custom shift registrations.
                // Perfect.

                const data = shiftsExportData[shift.id] || {};
                const regs = data.registrations || [];

                regs.forEach((reg) => {
                    const shiftDate = shift.start.toLocaleDateString();
                    const shiftTime = `${shift.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${shift.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

                    const durationHours = (
                        (shift.end - shift.start) /
                        (1000 * 60 * 60)
                    ).toFixed(2);

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
                        `"${durationHours}"`,
                        `"${status}"`,
                        `"${checkInTime}"`,
                    ]);
                });
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
        } catch (e) {
            console.error("Export failed:", e);
            alert("Export failed: " + e.message);
        } finally {
            loading = false;
        }
    }

    // --- Manual Check-In & Edit Logic ---

    async function handleManualEntry() {
        if (
            !manualShiftDate ||
            !manualShiftTime ||
            !manualName ||
            !manualEmail ||
            !manualCheckInDate ||
            !manualCheckInTime
        ) {
            alert(
                "Please fill in all fields (Shift Date/Time, Name, Email, Check-In Date/Time).",
            );
            return;
        }

        isManualCheckingIn = true;
        try {
            // 1. Determine Target Shift Start
            const [sy, sm, sd] = manualShiftDate.split("-").map(Number);
            const [sh, smin] = manualShiftTime.split(":").map(Number);
            const targetShiftStart = new Date(sy, sm - 1, sd, sh, smin);

            // 2. Prepare Check-In Timestamp
            const [cy, cm, cd] = manualCheckInDate.split("-").map(Number);
            const [ch, cmin] = manualCheckInTime.split(":").map(Number);
            const checkInTimestamp = new Date(
                cy,
                cm - 1,
                cd,
                ch,
                cmin,
            ).toISOString();

            // 3. Find if shift exists (Standard or Custom)
            let targetShiftId = null;
            let isCustom = false;

            // Check generated shifts (in memory)
            // We use fuzzy match on start time (exact minute)
            const existingGenerated = generatedShifts.find(
                (s) => s.start.getTime() === targetShiftStart.getTime(),
            );

            if (existingGenerated) {
                targetShiftId = existingGenerated.id;
            } else {
                // Check existing custom shifts
                const existingCustom = customShifts.find(
                    (s) => s.start.getTime() === targetShiftStart.getTime(),
                );
                if (existingCustom) {
                    targetShiftId = existingCustom.id;
                    isCustom = true;
                }
            }

            // 4. If NO shift found, create a NEW Custom Shift
            if (!targetShiftId) {
                const end = new Date(targetShiftStart.getTime() + 60 * 60000); // Default 1 hr
                const docRef = await addDoc(collection(db, "custom_shifts"), {
                    start: Timestamp.fromDate(targetShiftStart),
                    end: Timestamp.fromDate(end),
                    leadCapacity: 1, // Defaults
                    volunteerCapacity: 10,
                    createdAt: Timestamp.now(),
                });
                targetShiftId = docRef.id;
                isCustom = true;
            }

            // 5. Add Registration (Bypassing limits)
            const shiftRef = doc(db, "shifts", targetShiftId);

            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(shiftRef);
                const data = sfDoc.exists() ? sfDoc.data() : {};
                const registrations = data.registrations || [];

                registrations.push({
                    name: manualName,
                    email: manualEmail,
                    phone: "", // Not provided
                    role: "volunteer", // Default
                    checkedIn: true,
                    checkInTime: checkInTimestamp,
                });

                // Update counts (optional, but good for consistency)
                const volCount = (data.volunteer || 0) + 1;

                transaction.set(
                    shiftRef,
                    {
                        registrations,
                        volunteer: volCount,
                    },
                    { merge: true },
                );
            });

            alert("Manual check-in added successfully!");

            // Clear Form
            manualName = "";
            manualEmail = "";
            // Keep dates for convenience? Or clear? clear is safer.
            manualCheckInDate = "";
            manualCheckInTime = "";
        } catch (e) {
            console.error("Manual Entry Failed:", e);
            alert("Failed to add manual entry: " + e.message);
        } finally {
            isManualCheckingIn = false;
        }
    }

    function startEditingCheckIn(shiftId, index, currentIsoTime) {
        editingCheckInKey = `${shiftId}-${index}`;
        if (currentIsoTime) {
            // Convert ISO to datetime-local format: YYYY-MM-DDTHH:MM
            const d = new Date(currentIsoTime);
            // Accounts for local time zone offset for the input
            const pad = (num) => String(num).padStart(2, "0");
            const localIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            editCheckInValue = localIso;
        } else {
            editCheckInValue = "";
        }
    }

    function cancelEditingCheckIn() {
        editingCheckInKey = null;
        editCheckInValue = "";
    }

    async function saveCheckInTime(shiftId, index) {
        if (!editCheckInValue) return;

        const shiftRef = doc(db, "shifts", shiftId);
        try {
            const newDate = new Date(editCheckInValue);
            const newIso = newDate.toISOString();

            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(shiftRef);
                if (!sfDoc.exists()) throw "Shift not found";

                const data = sfDoc.data();
                const registrations = data.registrations || [];
                if (!registrations[index]) throw "Registration not found";

                registrations[index].checkInTime = newIso;

                transaction.update(shiftRef, { registrations });
            });

            editingCheckInKey = null;
        } catch (e) {
            alert("Failed to update time: " + e);
        }
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

    // --- Volunteer Search Logic ---
    $: {
        if (searchQuery.length >= 2) {
            const query = searchQuery.toLowerCase().trim();
            const results = [];

            shifts.forEach((shift) => {
                const data = shiftData[shift.id] || {};
                const regs = data.registrations || [];

                regs.forEach((reg, index) => {
                    const nameMatch = reg.name?.toLowerCase().includes(query);
                    const emailMatch = reg.email?.toLowerCase().includes(query);

                    if (nameMatch || emailMatch) {
                        results.push({
                            shift,
                            registration: reg,
                            registrationIndex: index,
                        });
                    }
                });
            });

            // Sort results by shift date (newest first)
            results.sort((a, b) => b.shift.start - a.shift.start);
            searchResults = results;

            // Calculate stats
            const hours = results.reduce((sum, r) => {
                const duration =
                    (r.shift.end - r.shift.start) / (1000 * 60 * 60);
                return sum + duration;
            }, 0);
            const checkedIn = results.filter(
                (r) => r.registration.checkedIn,
            ).length;

            searchStats = {
                totalShifts: results.length,
                totalHours: hours.toFixed(1),
                checkedInCount: checkedIn,
            };
            isSearchActive = true;
        } else {
            isSearchActive = false;
            searchResults = [];
            searchStats = { totalShifts: 0, totalHours: 0, checkedInCount: 0 };
        }
    }

    function clearSearch() {
        searchQuery = "";
        isSearchActive = false;
        searchResults = [];
    }

    // --- Bulk Time Slot Deletion ---
    // Helper to format hours to 12-hour AM/PM
    const formatTime12hr = (hours, minutes) => {
        const period = hours >= 12 ? "PM" : "AM";
        const hour12 = hours % 12 || 12;
        const minStr = minutes.toString().padStart(2, "0");
        return `${hour12}:${minStr} ${period}`;
    };

    $: uniqueTimeSlots = (() => {
        const slotsMap = new Map(); // Use map to dedupe by value
        // Include BOTH generated AND custom shifts for dynamic dropdown
        [...generatedShifts, ...customShifts].forEach((shift) => {
            const startH = shift.start.getHours();
            const startM = shift.start.getMinutes();
            const endH = shift.end.getHours();
            const endM = shift.end.getMinutes();

            // Value is 24-hour format for internal matching
            const value = `${startH.toString().padStart(2, "0")}:${startM.toString().padStart(2, "0")}-${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;
            // Label is 12-hour AM/PM format for display
            const label = `${formatTime12hr(startH, startM)} - ${formatTime12hr(endH, endM)}`;

            slotsMap.set(value, { value, label });
        });
        return Array.from(slotsMap.values()).sort((a, b) =>
            a.value.localeCompare(b.value),
        );
    })();

    function previewBulkTimeSlotDeletion() {
        if (!bulkDeleteTimeSlot) {
            bulkDeletePreview = null;
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [startTime, endTime] = bulkDeleteTimeSlot.split("-");
        const [startH, startM] = startTime.split(":").map(Number);
        const [endH, endM] = endTime.split(":").map(Number);

        const toDelete = [];
        const conflicts = [];

        // Check generated shifts
        generatedShifts.forEach((shift) => {
            if (shift.start < today) return; // Skip past shifts

            // Check if day of week is selected
            const dayOfWeek = shift.start.getDay();
            if (!bulkDeleteDaysOfWeek.includes(dayOfWeek)) return;

            const shiftStartH = shift.start.getHours();
            const shiftStartM = shift.start.getMinutes();
            const shiftEndH = shift.end.getHours();
            const shiftEndM = shift.end.getMinutes();

            // Check if time matches
            if (
                shiftStartH === startH &&
                shiftStartM === startM &&
                shiftEndH === endH &&
                shiftEndM === endM
            ) {
                const data = shiftData[shift.id] || {};
                const hasRegistrations = (data.registrations?.length || 0) > 0;
                const isCancelled = data.cancelled === true;

                if (isCancelled) return; // Already cancelled

                if (hasRegistrations) {
                    conflicts.push({
                        shift,
                        registrations: data.registrations,
                    });
                } else {
                    toDelete.push(shift);
                }
            }
        });

        // Also check custom shifts with matching times
        customShifts.forEach((shift) => {
            if (shift.start < today) return;

            // Check if day of week is selected
            const dayOfWeek = shift.start.getDay();
            if (!bulkDeleteDaysOfWeek.includes(dayOfWeek)) return;

            const shiftStartH = shift.start.getHours();
            const shiftStartM = shift.start.getMinutes();
            const shiftEndH = shift.end.getHours();
            const shiftEndM = shift.end.getMinutes();

            if (
                shiftStartH === startH &&
                shiftStartM === startM &&
                shiftEndH === endH &&
                shiftEndM === endM
            ) {
                const data = shiftData[shift.id] || {};
                const hasRegistrations = (data.registrations?.length || 0) > 0;

                if (hasRegistrations) {
                    conflicts.push({
                        shift,
                        registrations: data.registrations,
                    });
                } else {
                    toDelete.push({ ...shift, isCustom: true });
                }
            }
        });

        bulkDeletePreview = { toDelete, conflicts };
    }

    async function handleBulkTimeSlotDeletion() {
        if (!bulkDeletePreview) return;

        const { toDelete, conflicts } = bulkDeletePreview;

        if (toDelete.length === 0 && conflicts.length === 0) {
            alert("No future shifts found matching this time slot.");
            return;
        }

        const confirmMsg =
            `This will delete ${toDelete.length} shift(s).` +
            (conflicts.length > 0
                ? `\n\n${conflicts.length} shift(s) with volunteers will be SKIPPED.`
                : "") +
            `\n\nProceed?`;

        if (!confirm(confirmMsg)) return;

        isBulkDeleting = true;
        let deleted = 0;

        try {
            for (const shift of toDelete) {
                if (shift.isCustom) {
                    await deleteDoc(doc(db, "custom_shifts", shift.id));
                } else {
                    await setDoc(
                        doc(db, "shifts", shift.id),
                        { cancelled: true },
                        { merge: true },
                    );
                }
                deleted++;
            }

            bulkDeleteReport = {
                deleted,
                skipped: conflicts.length,
                conflicts: conflicts.map((c) => ({
                    date: c.shift.start.toLocaleDateString(),
                    time: `${c.shift.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${c.shift.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
                    volunteerCount: c.registrations.length,
                    volunteers: c.registrations.map((r) => r.name || r.email),
                })),
            };

            showBulkDeleteReport = true;
            bulkDeleteTimeSlot = "";
            bulkDeletePreview = null;
        } catch (e) {
            console.error("Bulk deletion failed:", e);
            alert("Bulk deletion failed: " + e.message);
        } finally {
            isBulkDeleting = false;
        }
    }

    function jumpToShift(shift) {
        clearSearch();
        const weekStart = getStartOfWeek(shift.start);
        currentWeekStartStr = toDateStr(weekStart);

        // Expand the day and shift
        const dateKey = shift.dateStr || toDateStr(shift.date);
        expandedDayKeys.add(dateKey);
        expandedDayKeys = expandedDayKeys;
        expandedShiftIds.add(shift.id);
        expandedShiftIds = expandedShiftIds;

        // Scroll to shift after DOM updates
        tick().then(() => {
            const element = document.getElementById(`date-${dateKey}`);
            if (element) {
                element.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        });
    }
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

                <!-- Volunteer Search Tool -->
                <div
                    class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-4"
                >
                    <h3
                        class="font-bold text-gray-800 text-sm uppercase tracking-wide flex items-center gap-2"
                    >
                        <svg
                            class="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            ></path>
                        </svg>
                        Volunteer Search
                    </h3>
                    <div class="space-y-3">
                        <div class="relative">
                            <input
                                type="text"
                                bind:value={searchQuery}
                                placeholder="Search by name or email..."
                                class="w-full px-3 py-2 pr-8 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                            />
                            {#if searchQuery}
                                <button
                                    on:click={clearSearch}
                                    class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    title="Clear search"
                                >
                                    <svg
                                        class="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M6 18L18 6M6 6l12 12"
                                        ></path>
                                    </svg>
                                </button>
                            {/if}
                        </div>

                        {#if isSearchActive}
                            {#if searchResults.length > 0}
                                <div
                                    class="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-3 border border-pink-100"
                                >
                                    <p
                                        class="font-bold text-gray-800 text-sm mb-2"
                                    >
                                        📊 {searchResults.length} shift{searchResults.length !==
                                        1
                                            ? "s"
                                            : ""} found
                                    </p>
                                    <div class="grid grid-cols-2 gap-2 text-xs">
                                        <div
                                            class="flex items-center gap-1 text-gray-600"
                                        >
                                            <svg
                                                class="w-3 h-3"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                                ><path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                                ></path></svg
                                            >
                                            {searchStats.totalHours} hours
                                        </div>
                                        <div
                                            class="flex items-center gap-1 text-green-600"
                                        >
                                            <svg
                                                class="w-3 h-3"
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
                                            {searchStats.checkedInCount}/{searchStats.totalShifts}
                                            checked in
                                        </div>
                                    </div>
                                </div>
                                <button
                                    on:click={clearSearch}
                                    class="w-full text-sm text-gray-600 hover:text-gray-800 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
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
                                            d="M10 19l-7-7m0 0l7-7m-7 7h18"
                                        ></path></svg
                                    >
                                    Back to Weekly View
                                </button>
                            {:else}
                                <div
                                    class="text-center py-3 text-sm text-gray-500"
                                >
                                    <p>
                                        No volunteers found matching "{searchQuery}"
                                    </p>
                                </div>
                            {/if}
                        {:else if searchQuery.length === 1}
                            <p class="text-xs text-gray-400 text-center">
                                Type at least 2 characters to search
                            </p>
                        {/if}
                    </div>
                </div>

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
                        <label class="block">
                            <span
                                class="block text-xs font-medium text-gray-500 mb-1"
                                >Start Date</span
                            >
                            <input
                                type="date"
                                bind:value={startDate}
                                class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                            />
                        </label>
                        <label class="block">
                            <span
                                class="block text-xs font-medium text-gray-500 mb-1"
                                >End Date</span
                            >
                            <input
                                type="date"
                                bind:value={endDate}
                                class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                            />
                        </label>
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
                        <label class="block">
                            <span
                                class="block text-xs font-medium text-gray-500 mb-1"
                                >Date</span
                            >
                            <input
                                type="date"
                                bind:value={addShiftDate}
                                class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                            />
                        </label>
                        <div class="grid grid-cols-2 gap-2">
                            <label class="block">
                                <span
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >Time</span
                                >
                                <input
                                    type="time"
                                    bind:value={addShiftTime}
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                />
                            </label>
                            <label class="block">
                                <span
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >Duration (m)</span
                                >
                                <input
                                    type="number"
                                    bind:value={addShiftDuration}
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                />
                            </label>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <label class="block">
                                <span
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >Lead Cap</span
                                >
                                <input
                                    type="number"
                                    bind:value={addShiftLeadCap}
                                    min="0"
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                />
                            </label>
                            <label class="block">
                                <span
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >Vol Cap</span
                                >
                                <input
                                    type="number"
                                    bind:value={addShiftVolCap}
                                    min="0"
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                />
                            </label>
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

                <!-- Bulk Create Recurring Shifts Tool -->
                <div
                    class="bg-white rounded-xl p-4 shadow-sm border border-green-200 space-y-4"
                >
                    <h3
                        class="font-bold text-gray-800 text-sm uppercase tracking-wide flex items-center gap-2"
                    >
                        <svg
                            class="w-4 h-4 text-green-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        Bulk Create Recurring Shifts
                    </h3>
                    <p class="text-xs text-gray-500">
                        Create shifts at the same time on specific days until an
                        end date.
                    </p>
                    <div class="space-y-3">
                        <div class="grid grid-cols-2 gap-2">
                            <label class="block">
                                <span
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >Start Date</span
                                >
                                <input
                                    type="date"
                                    bind:value={recurringStartDate}
                                    on:change={previewRecurringShifts}
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </label>
                            <label class="block">
                                <span
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >End Date</span
                                >
                                <input
                                    type="date"
                                    bind:value={recurringEndDate}
                                    on:change={previewRecurringShifts}
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </label>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <label class="block">
                                <span
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >Time</span
                                >
                                <input
                                    type="time"
                                    bind:value={recurringTime}
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </label>
                            <label class="block">
                                <span
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >Duration (m)</span
                                >
                                <input
                                    type="number"
                                    bind:value={recurringDuration}
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </label>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <label class="block">
                                <span
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >Lead Cap</span
                                >
                                <input
                                    type="number"
                                    bind:value={recurringLeadCap}
                                    min="0"
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </label>
                            <label class="block">
                                <span
                                    class="block text-xs font-medium text-gray-500 mb-1"
                                    >Vol Cap</span
                                >
                                <input
                                    type="number"
                                    bind:value={recurringVolCap}
                                    min="0"
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                                />
                            </label>
                        </div>

                        <!-- Day of Week Selection -->
                        <div class="space-y-2">
                            <span
                                class="block text-xs font-medium text-gray-500"
                            >
                                Repeat on Days
                            </span>
                            <div class="flex flex-wrap gap-1">
                                {#each dayNames as day, index}
                                    <label class="inline-flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={recurringDaysOfWeek.includes(
                                                index,
                                            )}
                                            on:change={(e) => {
                                                if (e.target.checked) {
                                                    recurringDaysOfWeek = [
                                                        ...recurringDaysOfWeek,
                                                        index,
                                                    ];
                                                } else {
                                                    recurringDaysOfWeek =
                                                        recurringDaysOfWeek.filter(
                                                            (d) => d !== index,
                                                        );
                                                }
                                                previewRecurringShifts();
                                            }}
                                            class="rounded border-gray-300 text-green-600 focus:ring-green-500 h-3 w-3"
                                        />
                                        <span class="ml-1 text-xs text-gray-600"
                                            >{day.slice(0, 3)}</span
                                        >
                                    </label>
                                {/each}
                            </div>
                            <div class="flex gap-2 text-xs">
                                <button
                                    type="button"
                                    on:click={() => {
                                        recurringDaysOfWeek = [
                                            0, 1, 2, 3, 4, 5, 6,
                                        ];
                                        previewRecurringShifts();
                                    }}
                                    class="text-green-600 hover:underline"
                                    >All</button
                                >
                                <button
                                    type="button"
                                    on:click={() => {
                                        recurringDaysOfWeek = [0, 6];
                                        previewRecurringShifts();
                                    }}
                                    class="text-green-600 hover:underline"
                                    >Weekends</button
                                >
                                <button
                                    type="button"
                                    on:click={() => {
                                        recurringDaysOfWeek = [1, 2, 3, 4, 5];
                                        previewRecurringShifts();
                                    }}
                                    class="text-green-600 hover:underline"
                                    >Weekdays</button
                                >
                                <button
                                    type="button"
                                    on:click={() => {
                                        recurringDaysOfWeek = [];
                                        previewRecurringShifts();
                                    }}
                                    class="text-gray-500 hover:underline"
                                    >None</button
                                >
                            </div>
                        </div>

                        {#if recurringPreview && recurringPreview.count > 0}
                            <div
                                class="text-xs space-y-2 p-3 bg-green-50 rounded-lg border border-green-200"
                            >
                                <p class="text-green-700 font-medium">
                                    ✓ {recurringPreview.count} shift(s) will be created
                                </p>
                                <p class="text-gray-600">
                                    From {recurringPreview.firstDate?.toLocaleDateString()}
                                    to {recurringPreview.lastDate?.toLocaleDateString()}
                                </p>
                            </div>
                        {:else if recurringStartDate && recurringEndDate && recurringDaysOfWeek.length === 0}
                            <div
                                class="text-xs p-3 bg-amber-50 rounded-lg border border-amber-200"
                            >
                                <p class="text-amber-700">
                                    ⚠ Select at least one day of the week
                                </p>
                            </div>
                        {/if}

                        <button
                            on:click={handleCreateRecurringShifts}
                            disabled={isCreatingRecurring ||
                                !recurringPreview ||
                                recurringPreview.count === 0}
                            class="w-full bg-green-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                        >
                            {isCreatingRecurring
                                ? "Creating..."
                                : "Create Recurring Shifts"}
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

                <!-- Bulk Time Slot Deletion Tool -->
                <div
                    class="bg-white rounded-xl p-4 shadow-sm border border-red-100 space-y-4"
                >
                    <h3
                        class="font-bold text-gray-800 text-sm uppercase tracking-wide flex items-center gap-2"
                    >
                        <svg
                            class="w-4 h-4 text-red-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                        </svg>
                        Bulk Delete Time Slot
                    </h3>
                    <p class="text-xs text-gray-500">
                        Remove a specific shift time from all future
                        opportunities.
                    </p>
                    <div class="space-y-3">
                        <label class="block">
                            <span
                                class="block text-xs font-medium text-gray-500 mb-1"
                                >Select Time Slot</span
                            >
                            <select
                                bind:value={bulkDeleteTimeSlot}
                                on:change={previewBulkTimeSlotDeletion}
                                class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                            >
                                <option value=""
                                    >-- Select a time slot --</option
                                >
                                {#each uniqueTimeSlots as slot}
                                    <option value={slot.value}
                                        >{slot.label}</option
                                    >
                                {/each}
                            </select>
                        </label>

                        <!-- Day of Week Filter -->
                        <div class="space-y-2">
                            <span
                                class="block text-xs font-medium text-gray-500"
                            >
                                Filter by Day of Week
                            </span>
                            <div class="flex flex-wrap gap-1">
                                {#each dayNames as day, index}
                                    <label class="inline-flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={bulkDeleteDaysOfWeek.includes(
                                                index,
                                            )}
                                            on:change={(e) => {
                                                if (e.target.checked) {
                                                    bulkDeleteDaysOfWeek = [
                                                        ...bulkDeleteDaysOfWeek,
                                                        index,
                                                    ];
                                                } else {
                                                    bulkDeleteDaysOfWeek =
                                                        bulkDeleteDaysOfWeek.filter(
                                                            (d) => d !== index,
                                                        );
                                                }
                                                previewBulkTimeSlotDeletion();
                                            }}
                                            class="rounded border-gray-300 text-red-600 focus:ring-red-500 h-3 w-3"
                                        />
                                        <span class="ml-1 text-xs text-gray-600"
                                            >{day.slice(0, 3)}</span
                                        >
                                    </label>
                                {/each}
                            </div>
                            <div class="flex gap-2 text-xs">
                                <button
                                    type="button"
                                    on:click={() => {
                                        bulkDeleteDaysOfWeek = [
                                            0, 1, 2, 3, 4, 5, 6,
                                        ];
                                        previewBulkTimeSlotDeletion();
                                    }}
                                    class="text-blue-600 hover:underline"
                                    >All</button
                                >
                                <button
                                    type="button"
                                    on:click={() => {
                                        bulkDeleteDaysOfWeek = [0, 6];
                                        previewBulkTimeSlotDeletion();
                                    }}
                                    class="text-blue-600 hover:underline"
                                    >Weekends</button
                                >
                                <button
                                    type="button"
                                    on:click={() => {
                                        bulkDeleteDaysOfWeek = [1, 2, 3, 4, 5];
                                        previewBulkTimeSlotDeletion();
                                    }}
                                    class="text-blue-600 hover:underline"
                                    >Weekdays</button
                                >
                                <button
                                    type="button"
                                    on:click={() => {
                                        bulkDeleteDaysOfWeek = [];
                                        previewBulkTimeSlotDeletion();
                                    }}
                                    class="text-gray-500 hover:underline"
                                    >None</button
                                >
                            </div>
                        </div>

                        {#if bulkDeletePreview}
                            <div
                                class="text-xs space-y-2 p-3 bg-gray-50 rounded-lg"
                            >
                                <p class="text-green-700">
                                    ✓ {bulkDeletePreview.toDelete.length} shift(s)
                                    will be deleted
                                </p>
                                {#if bulkDeletePreview.conflicts.length > 0}
                                    <p class="text-amber-700">
                                        ⚠ {bulkDeletePreview.conflicts.length} shift(s)
                                        will be SKIPPED (have volunteers)
                                    </p>
                                {/if}
                            </div>

                            <button
                                on:click={handleBulkTimeSlotDeletion}
                                disabled={isBulkDeleting ||
                                    bulkDeletePreview.toDelete.length === 0}
                                class="w-full bg-red-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                            >
                                {isBulkDeleting
                                    ? "Deleting..."
                                    : "Delete Shifts"}
                            </button>
                        {/if}
                    </div>
                </div>

                <!-- Manual Check-In Tool -->
                <div
                    class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-4"
                >
                    <h3
                        class="font-bold text-gray-800 text-sm uppercase tracking-wide"
                    >
                        Manual Check-In
                    </h3>
                    <div class="space-y-3">
                        <div class="grid grid-cols-2 gap-2">
                            <label class="block">
                                <span
                                    class="text-xs font-medium text-gray-500 mb-1 block"
                                    >Shift Date</span
                                >
                                <input
                                    type="date"
                                    bind:value={manualShiftDate}
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                />
                            </label>
                            <label class="block">
                                <span
                                    class="text-xs font-medium text-gray-500 mb-1 block"
                                    >Shift Time</span
                                >
                                <input
                                    type="time"
                                    bind:value={manualShiftTime}
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                />
                            </label>
                        </div>
                        <label class="block">
                            <span
                                class="text-xs font-medium text-gray-500 mb-1 block"
                                >Volunteer Name</span
                            >
                            <input
                                type="text"
                                bind:value={manualName}
                                class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                placeholder="Jane Doe"
                            />
                        </label>
                        <label class="block">
                            <span
                                class="text-xs font-medium text-gray-500 mb-1 block"
                                >Email</span
                            >
                            <input
                                type="email"
                                bind:value={manualEmail}
                                class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                placeholder="jane@example.com"
                            />
                        </label>
                        <div class="grid grid-cols-2 gap-2">
                            <label class="block">
                                <span
                                    class="text-xs font-medium text-gray-500 mb-1 block"
                                    >Check-In Date</span
                                >
                                <input
                                    type="date"
                                    bind:value={manualCheckInDate}
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                />
                            </label>
                            <label class="block">
                                <span
                                    class="text-xs font-medium text-gray-500 mb-1 block"
                                    >Check-In Time</span
                                >
                                <input
                                    type="time"
                                    bind:value={manualCheckInTime}
                                    class="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-vibrant-pink outline-none"
                                />
                            </label>
                        </div>

                        <button
                            on:click={handleManualEntry}
                            disabled={isManualCheckingIn}
                            class="w-full bg-indigo-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                        >
                            {isManualCheckingIn
                                ? "Processing..."
                                : "Manually Check In"}
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

            <!-- Search Results View -->
            {#if isSearchActive && searchResults.length > 0}
                <div
                    class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
                >
                    <div
                        class="p-4 bg-gradient-to-r from-pink-50 to-purple-50 border-b border-pink-100"
                    >
                        <h2 class="text-lg font-bold text-gray-800">
                            Search Results for "{searchQuery}"
                        </h2>
                        <p class="text-sm text-gray-600 mt-1">
                            Found {searchStats.totalShifts} shift{searchStats.totalShifts !==
                            1
                                ? "s"
                                : ""} ({searchStats.totalHours} total hours, {searchStats.checkedInCount}
                            checked in)
                        </p>
                    </div>

                    <div class="divide-y divide-gray-100">
                        {#each searchResults as result (result.shift.id + "-" + result.registrationIndex)}
                            {@const shift = result.shift}
                            {@const reg = result.registration}
                            {@const isPast = shift.end < new Date()}
                            {@const isFuture = shift.start > new Date()}

                            <div class="p-4 hover:bg-gray-50 transition-colors">
                                <div
                                    class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                                >
                                    <div class="flex-1">
                                        <div
                                            class="flex items-center gap-2 flex-wrap"
                                        >
                                            <span
                                                class="font-bold text-gray-900"
                                            >
                                                {shift.start.toLocaleDateString(
                                                    "en-US",
                                                    {
                                                        weekday: "short",
                                                        month: "short",
                                                        day: "numeric",
                                                        year: "numeric",
                                                    },
                                                )}
                                            </span>
                                            <span class="text-gray-600">
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
                                            </span>

                                            <!-- Time status badge -->
                                            {#if isPast}
                                                <span
                                                    class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                                                    >Past</span
                                                >
                                            {:else if isFuture}
                                                <span
                                                    class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"
                                                    >Upcoming</span
                                                >
                                            {:else}
                                                <span
                                                    class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full animate-pulse"
                                                    >Now</span
                                                >
                                            {/if}
                                        </div>

                                        <div
                                            class="flex items-center gap-2 mt-2 text-sm"
                                        >
                                            <!-- Role badge -->
                                            {#if reg.role === "lead"}
                                                <span
                                                    class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium"
                                                    >Lead</span
                                                >
                                            {:else}
                                                <span
                                                    class="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full font-medium"
                                                    >Volunteer</span
                                                >
                                            {/if}

                                            <!-- Check-in status -->
                                            {#if reg.checkedIn}
                                                <span
                                                    class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1"
                                                >
                                                    <svg
                                                        class="w-3 h-3"
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
                                                    Checked In
                                                </span>
                                                {#if reg.checkInTime}
                                                    <span
                                                        class="text-xs text-gray-500"
                                                    >
                                                        at {new Date(
                                                            reg.checkInTime,
                                                        ).toLocaleTimeString(
                                                            "en-US",
                                                            {
                                                                hour: "numeric",
                                                                minute: "2-digit",
                                                            },
                                                        )}
                                                    </span>
                                                {/if}
                                            {:else}
                                                <span
                                                    class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full"
                                                    >Registered</span
                                                >
                                            {/if}
                                        </div>

                                        <!-- Volunteer details -->
                                        <div class="text-sm text-gray-600 mt-1">
                                            <span class="font-medium"
                                                >{reg.name}</span
                                            >
                                            {#if reg.email}
                                                <span class="mx-1">•</span>
                                                <span>{reg.email}</span>
                                            {/if}
                                            {#if reg.phone}
                                                <span class="mx-1">•</span>
                                                <span>{reg.phone}</span>
                                            {/if}
                                        </div>
                                    </div>

                                    <div class="flex items-center gap-2">
                                        <button
                                            on:click={() => jumpToShift(shift)}
                                            class="text-xs text-blue-600 hover:text-blue-800 font-medium px-3 py-1.5 rounded border border-blue-200 hover:bg-blue-50 transition-colors bg-white"
                                        >
                                            View in Calendar
                                        </button>
                                        <button
                                            on:click={() =>
                                                handleRemoveVolunteer(
                                                    shift.id,
                                                    result.registrationIndex,
                                                )}
                                            class="text-xs text-red-600 hover:text-red-800 font-medium px-3 py-1.5 rounded border border-red-200 hover:bg-red-50 transition-colors bg-white"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            {:else if isSearchActive && searchResults.length === 0}
                <div
                    class="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center"
                >
                    <svg
                        class="w-16 h-16 mx-auto text-gray-300 mb-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        ></path>
                    </svg>
                    <h3 class="text-lg font-bold text-gray-700">
                        No Results Found
                    </h3>
                    <p class="text-gray-500 mt-2">
                        No volunteers found matching "{searchQuery}"
                    </p>
                    <button
                        on:click={clearSearch}
                        class="mt-4 text-vibrant-pink hover:text-pink-700 font-medium"
                    >
                        Clear Search
                    </button>
                </div>
            {:else if loading}
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
                                                                    {#if editingCheckInKey === `${shift.id}-${i}`}
                                                                        <div
                                                                            class="mt-2 text-xs flex items-center gap-2"
                                                                        >
                                                                            <input
                                                                                type="datetime-local"
                                                                                bind:value={
                                                                                    editCheckInValue
                                                                                }
                                                                                class="border rounded px-2 py-1 text-gray-700"
                                                                            />
                                                                            <button
                                                                                on:click={() =>
                                                                                    saveCheckInTime(
                                                                                        shift.id,
                                                                                        i,
                                                                                    )}
                                                                                class="text-green-600 font-bold hover:underline"
                                                                                >Save</button
                                                                            >
                                                                            <button
                                                                                on:click={cancelEditingCheckIn}
                                                                                class="text-gray-500 hover:underline"
                                                                                >Cancel</button
                                                                            >
                                                                        </div>
                                                                    {:else}
                                                                        <div
                                                                            class="text-xs text-gray-400 mt-1 flex items-center gap-2"
                                                                        >
                                                                            <span
                                                                                >Checked
                                                                                in:
                                                                                {new Date(
                                                                                    reg.checkInTime,
                                                                                ).toLocaleString()}</span
                                                                            >
                                                                            <button
                                                                                on:click={() =>
                                                                                    startEditingCheckIn(
                                                                                        shift.id,
                                                                                        i,
                                                                                        reg.checkInTime,
                                                                                    )}
                                                                                class="text-blue-500 hover:text-blue-700 underline"
                                                                            >
                                                                                Edit
                                                                                Time
                                                                            </button>
                                                                        </div>
                                                                    {/if}
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

    <!-- Bulk Delete Report Modal -->
    {#if showBulkDeleteReport}
        <div
            class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        >
            <div
                class="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-auto p-6 space-y-4"
            >
                <h3 class="font-bold text-lg text-gray-900">
                    Bulk Deletion Complete
                </h3>

                <div class="space-y-2">
                    <p class="text-sm">
                        <span class="text-green-600 font-medium"
                            >✓ {bulkDeleteReport.deleted}</span
                        > shift(s) deleted
                    </p>
                    <p class="text-sm">
                        <span class="text-amber-600 font-medium"
                            >⚠ {bulkDeleteReport.skipped}</span
                        > shift(s) skipped due to conflicts
                    </p>
                </div>

                {#if bulkDeleteReport.conflicts.length > 0}
                    <div class="border-t pt-4">
                        <h4 class="font-medium text-sm text-gray-800 mb-2">
                            Skipped Shifts (Manual Review Needed):
                        </h4>
                        <div class="space-y-2 max-h-60 overflow-auto">
                            {#each bulkDeleteReport.conflicts as conflict}
                                <div
                                    class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs"
                                >
                                    <p class="font-medium text-gray-800">
                                        {conflict.date} • {conflict.time}
                                    </p>
                                    <p class="text-gray-600 mt-1">
                                        {conflict.volunteerCount} volunteer(s): {conflict.volunteers.join(
                                            ", ",
                                        )}
                                    </p>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}

                <button
                    on:click={() => (showBulkDeleteReport = false)}
                    class="w-full bg-gray-800 text-white font-medium py-2 px-4 rounded-lg hover:bg-gray-900 transition-colors text-sm"
                >
                    Close
                </button>
            </div>
        </div>
    {/if}
{/if}
