// Single registry of dashboard modules. Keys must match the
// profile_modules.module check constraint in Supabase.

export const MODULES = [
  {
    key: "marketing",
    label: "Marketing",
    description: "Marketing projects, kanban, and publishing calendar.",
  },
  {
    key: "board_projects",
    label: "Board Projects",
    description: "Administrative project tracker with tasks and due dates.",
  },
  {
    key: "volunteers",
    label: "Volunteers",
    description: "Shift schedule, check-ins, and volunteer opportunities.",
  },
  {
    key: "subs",
    label: "Sub Requests",
    description: "Class substitute requests and approvals.",
  },
  {
    key: "events",
    label: "Events",
    description: "Public event listings on latinasweatproject.com.",
  },
  {
    key: "elections",
    label: "Elections",
    description: "Board election tallies and voting controls.",
  },
  {
    key: "gala",
    label: "Gala",
    description: "Gala guests, paddles, and donation tracking.",
  },
  {
    key: "spaces",
    label: "Studio Spaces",
    description: "Class schedule planning, space bookings, and utilization insights.",
  },
  {
    key: "fundraising",
    label: "Fundraising",
    description: "Donation history, donor relationships, and the grant/major-donor pipeline.",
  },
];

export const MODULE_KEYS = MODULES.map((module) => module.key);

export function getModuleLabel(key) {
  return MODULES.find((module) => module.key === key)?.label || key;
}
