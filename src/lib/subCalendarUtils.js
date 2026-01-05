// Calendar utilities for substitute requests
export function generateSubCalendarLink(request) {
    const title = encodeURIComponent(`Sub: ${request.className} - Latina Sweat Project`);
    const details = encodeURIComponent(`Substituting for ${request.requestedBy?.name || 'Instructor'}. ${request.notes || ''}`);
    const location = encodeURIComponent(request.location || "949 W 16th St, Chicago, IL 60608");

    const formatDate = (date) => {
        return date.toISOString().replace(/-|:|\.\d+/g, "");
    };

    const start = formatDate(request.date);
    const endDate = new Date(request.date.getTime() + (request.duration || 60) * 60000);
    const end = formatDate(endDate);

    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=${location}&sf=true&output=xml`;
}

export function generateSubICSFile(request) {
    const title = `Sub: ${request.className} - Latina Sweat Project`;
    const description = `Substituting for ${request.requestedBy?.name || 'Instructor'}. ${request.notes || ''}`;
    const location = request.location || "949 W 16th St, Chicago, IL 60608";

    const formatDate = (date) => {
        return date.toISOString().replace(/-|:|\.\d+/g, "");
    };

    const start = formatDate(request.date);
    const endDate = new Date(request.date.getTime() + (request.duration || 60) * 60000);
    const end = formatDate(endDate);
    const now = formatDate(new Date());

    const icsContent = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Latina Sweat Project//Sub Request//EN",
        "BEGIN:VEVENT",
        `UID:${request.id}@latinasweatproject.org`,
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
