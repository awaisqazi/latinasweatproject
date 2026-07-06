// Studio status: single source of truth for the site-wide announcement banner
// and the /status page. Update statusUpdates (newest first) as the situation
// changes. Set statusBanner.active to true to show the site-wide bar during
// an active outage.

export const statusBanner = {
  active: false,
  message:
    "Our booking app is having intermittent issues. We're open as usual, and you can check the latest here.",
  linkLabel: "Status & updates",
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
    time: "resolved",
    body: "The booking system issues from earlier this week have been resolved. Online booking and check-in are working normally again. Thanks for your patience. If you ever run into trouble booking, you can check our booking provider's status page below for real-time updates.",
  },
];
