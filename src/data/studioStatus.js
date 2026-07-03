// Studio status: single source of truth for the site-wide announcement banner
// and the /status page. Update statusUpdates (newest first) and todaySchedule
// as the situation changes. Set statusBanner.active to false to hide the bar.

export const statusBanner = {
  active: true,
  message:
    "Our booking system is temporarily down, but we're open and classes are running as scheduled.",
  linkLabel: "Today's schedule & updates",
  href: "/status",
};

// Newest first. Add new entries to the top of this array.
export const statusUpdates = [
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
