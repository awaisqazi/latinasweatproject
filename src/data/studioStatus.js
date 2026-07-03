// Studio status: single source of truth for the site-wide announcement banner
// and the /status page. Update statusUpdates (newest first) and todaySchedule
// as the situation changes. Set statusBanner.active to false to hide the bar.

export const statusBanner = {
  active: true,
  message:
    "Our booking app has been in and out the past few days. We're open as usual, and today's schedule is here in case the app isn't working for you.",
  linkLabel: "Schedule & updates",
  href: "/status",
};

// Official status page from our booking provider (MarianaTek).
export const providerStatus = {
  label: "MarianaTek status page",
  href: "https://status.marianatek.com/",
};

// Newest first. Add new entries to the top of this array.
export const statusUpdates = [
  {
    date: "July 3, 2026",
    time: "midday",
    body: "The booking system is back up for now, but service has been intermittent over the past few days. We're sharing today's schedule below in case the app isn't working for you, and we'll keep this page updated. For real-time updates straight from our booking provider, see the MarianaTek status page.",
  },
  {
    date: "July 3, 2026",
    time: "morning",
    body: "Our booking system provider is experiencing an outage. We are open and all classes are running as scheduled. Online booking and check-in may be unavailable; more updates will be posted here.",
  },
];

export const todaySchedule = {
  dateLabel: "Friday, July 3",
  note: "Little Village and Gage Park are the two rooms inside our studio.",
  rooms: [
    {
      room: "Little Village Room",
      classes: [
        { time: "12:00pm", name: "Yoga Sculpt", teacher: "Brenda" },
        { time: "5:30pm", name: "Yoga Sculpt", teacher: "Elenor" },
        { time: "6:30pm", name: "MixxedFit", teacher: "Elisa" },
      ],
    },
    {
      room: "Gage Park Room",
      classes: [
        { time: "12:00pm", name: "Power Flow", teacher: "Mateo" },
        { time: "5:30pm", name: "Yoga Flow", teacher: "Dinorah" },
        { time: "6:30pm", name: "Yoga Flow", teacher: "Elenor" },
      ],
    },
  ],
};
