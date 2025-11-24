import { Timestamp } from "firebase/firestore";

export const getShiftId = (shift) => {
    // Create a unique ID based on start time and end time
    // Format: YYYY-MM-DD_HHmm-HHmm
    const dateStr = shift.start.toISOString().split('T')[0];
    const startStr = shift.start.getHours().toString().padStart(2, '0') + shift.start.getMinutes().toString().padStart(2, '0');
    const endStr = shift.end.getHours().toString().padStart(2, '0') + shift.end.getMinutes().toString().padStart(2, '0');
    return `${dateStr}_${startStr}-${endStr}`;
};

export const generateShifts = (startDate = new Date()) => {
    const shifts = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    // Calculate end date: End of the NEXT month
    const nextMonth = new Date(current);
    nextMonth.setMonth(nextMonth.getMonth() + 2); // Jump 2 months ahead
    nextMonth.setDate(0); // Go back to last day of previous month (which is end of next month relative to start)
    // Actually, let's be more precise.
    // If today is Nov 23, next month is Dec. End of next month is Dec 31.
    // current.getMonth() + 2 sets it to Jan. setDate(0) sets it to Dec 31. Correct.

    const endDate = nextMonth;

    while (current <= endDate) {
        const dayOfWeek = current.getDay(); // 0 = Sun, 1 = Mon, ...
        const year = current.getFullYear();
        const month = current.getMonth();
        const date = current.getDate();

        const addShift = (startHour, startMinute, endHour, endMinute) => {
            const start = new Date(year, month, date, startHour, startMinute);
            const end = new Date(year, month, date, endHour, endMinute);

            // Skip if shift is in the past (optional, but good for UI)
            // Keeping all generated shifts for now, filtering can happen in UI

            shifts.push({
                id: getShiftId({ start, end }),
                start,
                end,
                date: new Date(year, month, date), // For grouping
            });
        };

        // Sunday: 7am-12pm (Hourly), 5pm-9pm (Hourly)
        if (dayOfWeek === 0) {
            for (let h = 7; h < 12; h++) addShift(h, 0, h + 1, 0);
            for (let h = 17; h < 21; h++) addShift(h, 0, h + 1, 0);
        }

        // Monday: 5:30am-6am, 6am-9am (Hourly), 5pm-9pm (Hourly)
        if (dayOfWeek === 1) {
            addShift(5, 30, 6, 0);
            for (let h = 6; h < 9; h++) addShift(h, 0, h + 1, 0);
            for (let h = 17; h < 21; h++) addShift(h, 0, h + 1, 0);
        }

        // Tuesday: 5:30am-6am, 6am-8am (Hourly)
        if (dayOfWeek === 2) {
            addShift(5, 30, 6, 0);
            for (let h = 6; h < 8; h++) addShift(h, 0, h + 1, 0);
        }

        // Wednesday: 5:30am-6am, 6am-9am (Hourly), 5pm-9pm (Hourly)
        if (dayOfWeek === 3) {
            addShift(5, 30, 6, 0);
            for (let h = 6; h < 9; h++) addShift(h, 0, h + 1, 0);
            for (let h = 17; h < 21; h++) addShift(h, 0, h + 1, 0);
        }

        // Thursday: 5:30am-6am, 6am-9am (Hourly)
        if (dayOfWeek === 4) {
            addShift(5, 30, 6, 0);
            for (let h = 6; h < 9; h++) addShift(h, 0, h + 1, 0);
        }

        // Friday: 5:30am-6am, 6am-9am (Hourly), 5pm-8pm (Hourly)
        if (dayOfWeek === 5) {
            addShift(5, 30, 6, 0);
            for (let h = 6; h < 9; h++) addShift(h, 0, h + 1, 0);
            for (let h = 17; h < 20; h++) addShift(h, 0, h + 1, 0);
        }

        // Saturday: 7am-12pm (Hourly)
        if (dayOfWeek === 6) {
            for (let h = 7; h < 12; h++) addShift(h, 0, h + 1, 0);
        }

        // Next day
        current.setDate(current.getDate() + 1);
    }

    return shifts;
};
