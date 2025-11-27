export function generateGoogleCalendarLink(shift) {
    const title = encodeURIComponent("Volunteer Shift - Latina Sweat Project");
    const details = encodeURIComponent("Thank you for volunteering! Please arrive on time.");
    const location = encodeURIComponent("949 W 16th St, Chicago, IL 60608");

    // Format dates to YYYYMMDDTHHmmSSZ
    const formatDate = (date) => {
        return date.toISOString().replace(/-|:|\.\d+/g, "");
    };

    const start = formatDate(shift.start);
    const end = formatDate(shift.end);

    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}&sf=true&output=xml`;
}

export function generateICSFile(shift) {
    const title = "Volunteer Shift - Latina Sweat Project";
    const description = "Thank you for volunteering! Please arrive on time.";
    const location = "949 W 16th St, Chicago, IL 60608";

    // Format dates to YYYYMMDDTHHmmSSZ
    const formatDate = (date) => {
        return date.toISOString().replace(/-|:|\.\d+/g, "");
    };

    const start = formatDate(shift.start);
    const end = formatDate(shift.end);
    const now = formatDate(new Date());

    const icsContent = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Latina Sweat Project//Volunteer Shift//EN",
        "BEGIN:VEVENT",
        `UID:${shift.id}@latinasweatproject.org`,
        `DTSTAMP:${now}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${title}`,
        `DESCRIPTION:${description}`,
        `LOCATION:${location}`,
        "END:VEVENT",
        "END:VCALENDAR"
    ].join("\r\n");

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    return URL.createObjectURL(blob);
}
