import { Timestamp } from "firebase/firestore";

// Helper: Get "YYYY-MM-DD" string in LOCAL time (not UTC)
const toLocalISOString = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export const getShiftId = (shift) => {
    // Generate ID using local time numbers to avoid timezone shifts
    const dateStr = toLocalISOString(shift.start);
    const startH = shift.start.getHours().toString().padStart(2, '0');
    const startM = shift.start.getMinutes().toString().padStart(2, '0');
    const endH = shift.end.getHours().toString().padStart(2, '0');
    const endM = shift.end.getMinutes().toString().padStart(2, '0');

    return `${dateStr}_${startH}${startM}-${endH}${endM}`;
};

export const generateShifts = (startDate = new Date()) => {
    const shifts = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);

    // Calculate end date (end of next month)
    const nextMonth = new Date(current);
    nextMonth.setMonth(nextMonth.getMonth() + 2);
    nextMonth.setDate(0);
    const endDate = nextMonth;

    while (current <= endDate) {
        const dayOfWeek = current.getDay();
        const year = current.getFullYear();
        const month = current.getMonth();
        const date = current.getDate();

        const addShift = (startHour, startMinute, endHour, endMinute) => {
            const start = new Date(year, month, date, startHour, startMinute);
            const end = new Date(year, month, date, endHour, endMinute);

            shifts.push({
                id: getShiftId({ start, end }),
                start,
                end,
                date: new Date(year, month, date),
                // CRITICAL FIX: Add a pre-calculated string for safe matching
                dateStr: toLocalISOString(new Date(year, month, date))
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

        current.setDate(current.getDate() + 1);
    }

    return shifts;
};