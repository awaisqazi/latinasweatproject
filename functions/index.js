/**
 * Firebase Cloud Functions for Volunteer App Aggregation
 * 
 * These functions maintain a `monthly_availability` collection that aggregates
 * shift availability data, reducing calendar load reads from ~100 to 1.
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore();

// Helper: Extract month key from shift ID (e.g., "2026-02-01_0530-0600" -> "2026-02")
function getMonthKey(shiftId) {
    const datePart = shiftId.split("_")[0]; // "2026-02-01"
    return datePart.substring(0, 7); // "2026-02"
}

// Helper: Extract date from shift ID
function getDateFromShiftId(shiftId) {
    return shiftId.split("_")[0]; // "2026-02-01"
}

// Helper: Format time from shift ID (e.g., "0530-0600" -> "05:30 AM - 06:00 AM")
function formatTimeFromShiftId(shiftId) {
    const timePart = shiftId.split("_")[1]; // "0530-0600"
    if (!timePart) return null;

    const [start, end] = timePart.split("-");

    function formatTime(timeStr) {
        const hours = parseInt(timeStr.substring(0, 2));
        const mins = timeStr.substring(2, 4);
        const period = hours >= 12 ? "PM" : "AM";
        const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
        return `${String(displayHours).padStart(2, "0")}:${mins} ${period}`;
    }

    return `${formatTime(start)} - ${formatTime(end)}`;
}

// Helper: Calculate availability for a shift
function calculateShiftAvailability(shiftData, shiftId) {
    const leadCapacity = shiftData?.leadCapacity ?? 0;
    const volunteerCapacity = shiftData?.volunteerCapacity ?? 2;
    const leads = shiftData?.leads || [];
    const volunteers = shiftData?.volunteers || [];
    const cancelled = shiftData?.cancelled || false;

    const leadsFilled = leads.length;
    const volunteersFilled = volunteers.length;
    const leadAvailable = Math.max(0, leadCapacity - leadsFilled);
    const volunteerAvailable = Math.max(0, volunteerCapacity - volunteersFilled);

    return {
        id: shiftId,
        time: formatTimeFromShiftId(shiftId),
        leadSlots: leadCapacity,
        leadFilled: leadsFilled,
        volunteerSlots: volunteerCapacity,
        volunteerFilled: volunteersFilled,
        hasAvailability: !cancelled && (leadAvailable > 0 || volunteerAvailable > 0),
        cancelled: cancelled
    };
}

/**
 * Trigger: Update monthly aggregation when a shift document changes
 */
export const onShiftUpdate = onDocumentWritten(
    {
        document: "shifts/{shiftId}",
        region: "us-central1"
    },
    async (event) => {
        const shiftId = event.params.shiftId;
        const monthKey = getMonthKey(shiftId);
        const dateKey = getDateFromShiftId(shiftId);

        const afterData = event.data?.after?.data();
        const beforeData = event.data?.before?.data();

        // If document was deleted, we need to remove it from aggregation
        const isDeleted = !afterData && beforeData;

        const monthRef = db.collection("monthly_availability").doc(monthKey);

        try {
            await db.runTransaction(async (transaction) => {
                const monthDoc = await transaction.get(monthRef);
                const monthData = monthDoc.exists ? monthDoc.data() : { days: {} };

                if (!monthData.days) {
                    monthData.days = {};
                }

                if (!monthData.days[dateKey]) {
                    monthData.days[dateKey] = { shifts: [], totalAvailable: 0, allFull: true };
                }

                const dayData = monthData.days[dateKey];

                // Remove old shift entry if exists
                dayData.shifts = dayData.shifts.filter(s => s.id !== shiftId);

                // Add updated shift if not deleted
                if (!isDeleted && afterData) {
                    const shiftAvailability = calculateShiftAvailability(afterData, shiftId);
                    dayData.shifts.push(shiftAvailability);
                }

                // Sort shifts by time
                dayData.shifts.sort((a, b) => {
                    if (!a.time || !b.time) return 0;
                    return a.time.localeCompare(b.time);
                });

                // Recalculate day totals
                dayData.totalAvailable = dayData.shifts.filter(s => s.hasAvailability && !s.cancelled).length;
                dayData.allFull = dayData.shifts.length > 0 && dayData.totalAvailable === 0;

                monthData.days[dateKey] = dayData;
                monthData.lastUpdated = FieldValue.serverTimestamp();

                transaction.set(monthRef, monthData, { merge: true });
            });

            console.log(`Updated monthly_availability/${monthKey} for shift ${shiftId}`);
        } catch (error) {
            console.error("Error updating monthly availability:", error);
            throw error;
        }
    }
);

/**
 * Trigger: Update monthly aggregation when a custom shift changes
 */
export const onCustomShiftUpdate = onDocumentWritten(
    {
        document: "custom_shifts/{shiftId}",
        region: "us-central1"
    },
    async (event) => {
        const shiftId = event.params.shiftId;
        const afterData = event.data?.after?.data();
        const beforeData = event.data?.before?.data();

        // Get date from the shift data (custom shifts have a 'start' timestamp)
        const shiftData = afterData || beforeData;
        if (!shiftData?.start) {
            console.log("Custom shift has no start date, skipping");
            return;
        }

        const startDate = shiftData.start.toDate ? shiftData.start.toDate() : new Date(shiftData.start);
        const dateKey = startDate.toISOString().split("T")[0]; // "2026-02-01"
        const monthKey = dateKey.substring(0, 7); // "2026-02"

        const isDeleted = !afterData && beforeData;

        const monthRef = db.collection("monthly_availability").doc(monthKey);

        try {
            await db.runTransaction(async (transaction) => {
                const monthDoc = await transaction.get(monthRef);
                const monthData = monthDoc.exists ? monthDoc.data() : { days: {} };

                if (!monthData.days) {
                    monthData.days = {};
                }

                if (!monthData.days[dateKey]) {
                    monthData.days[dateKey] = { shifts: [], totalAvailable: 0, allFull: true };
                }

                const dayData = monthData.days[dateKey];

                // Remove old custom shift entry if exists
                dayData.shifts = dayData.shifts.filter(s => s.id !== `custom_${shiftId}`);

                // Add updated custom shift if not deleted
                if (!isDeleted && afterData) {
                    const leadCapacity = afterData.leadCapacity ?? 0;
                    const volunteerCapacity = afterData.volunteerCapacity ?? 2;
                    const leads = afterData.leads || [];
                    const volunteers = afterData.volunteers || [];
                    const cancelled = afterData.cancelled || false;

                    // Format time from timestamps
                    const endDate = afterData.end?.toDate ? afterData.end.toDate() : new Date(afterData.end);
                    const formatTime = (date) => {
                        const hours = date.getHours();
                        const mins = String(date.getMinutes()).padStart(2, "0");
                        const period = hours >= 12 ? "PM" : "AM";
                        const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
                        return `${String(displayHours).padStart(2, "0")}:${mins} ${period}`;
                    };

                    dayData.shifts.push({
                        id: `custom_${shiftId}`,
                        time: `${formatTime(startDate)} - ${formatTime(endDate)}`,
                        leadSlots: leadCapacity,
                        leadFilled: leads.length,
                        volunteerSlots: volunteerCapacity,
                        volunteerFilled: volunteers.length,
                        hasAvailability: !cancelled && (leadCapacity - leads.length > 0 || volunteerCapacity - volunteers.length > 0),
                        cancelled: cancelled,
                        isCustom: true
                    });
                }

                // Sort shifts by time
                dayData.shifts.sort((a, b) => {
                    if (!a.time || !b.time) return 0;
                    return a.time.localeCompare(b.time);
                });

                // Recalculate day totals
                dayData.totalAvailable = dayData.shifts.filter(s => s.hasAvailability && !s.cancelled).length;
                dayData.allFull = dayData.shifts.length > 0 && dayData.totalAvailable === 0;

                monthData.days[dateKey] = dayData;
                monthData.lastUpdated = FieldValue.serverTimestamp();

                transaction.set(monthRef, monthData, { merge: true });
            });

            console.log(`Updated monthly_availability/${monthKey} for custom shift ${shiftId}`);
        } catch (error) {
            console.error("Error updating monthly availability for custom shift:", error);
            throw error;
        }
    }
);

/**
 * Callable function to rebuild all monthly availability aggregations
 * Call this once to initialize the aggregation from existing data
 */
export const rebuildMonthlyAvailability = onCall(
    { region: "us-central1" },
    async (request) => {
        console.log("Starting rebuild of monthly availability...");

        try {
            // Get all shifts
            const shiftsSnapshot = await db.collection("shifts").get();
            const customShiftsSnapshot = await db.collection("custom_shifts").get();

            // Group by month
            const monthlyData = {};

            // Process regular shifts
            shiftsSnapshot.forEach((doc) => {
                const shiftId = doc.id;
                const shiftData = doc.data();
                const monthKey = getMonthKey(shiftId);
                const dateKey = getDateFromShiftId(shiftId);

                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { days: {} };
                }
                if (!monthlyData[monthKey].days[dateKey]) {
                    monthlyData[monthKey].days[dateKey] = { shifts: [], totalAvailable: 0, allFull: true };
                }

                const shiftAvailability = calculateShiftAvailability(shiftData, shiftId);
                monthlyData[monthKey].days[dateKey].shifts.push(shiftAvailability);
            });

            // Process custom shifts
            customShiftsSnapshot.forEach((doc) => {
                const shiftId = doc.id;
                const shiftData = doc.data();

                if (!shiftData.start) return;

                const startDate = shiftData.start.toDate ? shiftData.start.toDate() : new Date(shiftData.start);
                const dateKey = startDate.toISOString().split("T")[0];
                const monthKey = dateKey.substring(0, 7);

                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { days: {} };
                }
                if (!monthlyData[monthKey].days[dateKey]) {
                    monthlyData[monthKey].days[dateKey] = { shifts: [], totalAvailable: 0, allFull: true };
                }

                const leadCapacity = shiftData.leadCapacity ?? 0;
                const volunteerCapacity = shiftData.volunteerCapacity ?? 2;
                const leads = shiftData.leads || [];
                const volunteers = shiftData.volunteers || [];
                const cancelled = shiftData.cancelled || false;

                const endDate = shiftData.end?.toDate ? shiftData.end.toDate() : new Date(shiftData.end);
                const formatTime = (date) => {
                    const hours = date.getHours();
                    const mins = String(date.getMinutes()).padStart(2, "0");
                    const period = hours >= 12 ? "PM" : "AM";
                    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
                    return `${String(displayHours).padStart(2, "0")}:${mins} ${period}`;
                };

                monthlyData[monthKey].days[dateKey].shifts.push({
                    id: `custom_${shiftId}`,
                    time: `${formatTime(startDate)} - ${formatTime(endDate)}`,
                    leadSlots: leadCapacity,
                    leadFilled: leads.length,
                    volunteerSlots: volunteerCapacity,
                    volunteerFilled: volunteers.length,
                    hasAvailability: !cancelled && (leadCapacity - leads.length > 0 || volunteerCapacity - volunteers.length > 0),
                    cancelled: cancelled,
                    isCustom: true
                });
            });

            // Calculate totals and write to Firestore
            const batch = db.batch();

            for (const [monthKey, data] of Object.entries(monthlyData)) {
                for (const [dateKey, dayData] of Object.entries(data.days)) {
                    // Sort shifts by time
                    dayData.shifts.sort((a, b) => {
                        if (!a.time || !b.time) return 0;
                        return a.time.localeCompare(b.time);
                    });

                    // Calculate totals
                    dayData.totalAvailable = dayData.shifts.filter(s => s.hasAvailability && !s.cancelled).length;
                    dayData.allFull = dayData.shifts.length > 0 && dayData.totalAvailable === 0;
                }

                data.lastUpdated = FieldValue.serverTimestamp();

                const monthRef = db.collection("monthly_availability").doc(monthKey);
                batch.set(monthRef, data);
            }

            await batch.commit();

            const monthCount = Object.keys(monthlyData).length;
            console.log(`Rebuilt ${monthCount} month(s) of availability data`);

            return {
                success: true,
                monthsProcessed: monthCount,
                months: Object.keys(monthlyData)
            };
        } catch (error) {
            console.error("Error rebuilding monthly availability:", error);
            throw new HttpsError("internal", "Failed to rebuild monthly availability: " + error.message);
        }
    }
);
