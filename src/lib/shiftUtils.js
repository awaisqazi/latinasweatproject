import { Timestamp } from "firebase/firestore";

// SAFARI FIX: Generate Local YYYY-MM-DD string manually
// toISOString() converts to UTC, which can shift the date by one day.
const toLocalISOString = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export const getShiftId = (shift) => {
    // Create ID based on LOCAL time
    const dateStr = toLocalISOString(shift.start);
    const startH = shift.start.getHours().toString().padStart(2, '0');
    const startM = shift.start.getMinutes().toString().padStart(2, '0');
    const endH = shift.end.getHours().toString().padStart(2, '0');
    const endM = shift.end.getMinutes().toString().padStart(2, '0');

    return `${dateStr}_${startH}${startM}-${endH}${endM}`;
};

export const generateShifts = (startDate = new Date(), months = 2) => {
    const shifts = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    const endDate = new Date(current);
    endDate.setMonth(endDate.getMonth() + months);
    endDate.setDate(0);

    while (current <= endDate) {
        const dayOfWeek = current.getDay();
        const year = current.getFullYear();
        const month = current.getMonth();
        const date = current.getDate();

        const addShift = (startHour, startMinute, endHour, endMinute) => {
            // Use integer constructor for 100% safe Date creation
            const start = new Date(year, month, date, startHour, startMinute);
            const end = new Date(year, month, date, endHour, endMinute);
            // Create a clean date object for the shift property
            const shiftDate = new Date(year, month, date);

            shifts.push({
                id: getShiftId({ start, end }),
                start,
                end,
                date: shiftDate,
                // Add string for safe comparison in Svelte
                dateStr: toLocalISOString(shiftDate)
            });
        };

        // Sunday
        if (dayOfWeek === 0) {
            for (let h = 7; h < 12; h++) addShift(h, 0, h + 1, 0);
            for (let h = 17; h < 21; h++) addShift(h, 0, h + 1, 0);
        }
        // Monday
        if (dayOfWeek === 1) {
            addShift(5, 30, 6, 0);
            for (let h = 6; h < 9; h++) addShift(h, 0, h + 1, 0);
            for (let h = 17; h < 21; h++) addShift(h, 0, h + 1, 0);
        }
        // Tuesday
        if (dayOfWeek === 2) {
            addShift(5, 30, 6, 0);
            for (let h = 6; h < 8; h++) addShift(h, 0, h + 1, 0);
        }
        // Wednesday
        if (dayOfWeek === 3) {
            addShift(5, 30, 6, 0);
            for (let h = 6; h < 9; h++) addShift(h, 0, h + 1, 0);
            for (let h = 17; h < 21; h++) addShift(h, 0, h + 1, 0);
        }
        // Thursday
        if (dayOfWeek === 4) {
            addShift(5, 30, 6, 0);
            for (let h = 6; h < 9; h++) addShift(h, 0, h + 1, 0);
        }
        // Friday
        if (dayOfWeek === 5) {
            addShift(5, 30, 6, 0);
            for (let h = 6; h < 9; h++) addShift(h, 0, h + 1, 0);
            for (let h = 17; h < 20; h++) addShift(h, 0, h + 1, 0);
        }
        // Saturday
        if (dayOfWeek === 6) {
            for (let h = 7; h < 12; h++) addShift(h, 0, h + 1, 0);
        }

        current.setDate(current.getDate() + 1);
    }

    return shifts;
};