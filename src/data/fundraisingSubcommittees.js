// The fundraising board's four subcommittees and their co-leads. Edit names
// here; the Fundraising tabs and the Overview scorecards read this list in
// order.
//
// `id` is fixed: it picks which numbers each tab and scorecard shows
// (src/components/admin/fundraising/live/SubcommitteeKeyNumbers.svelte) and
// which worksheet the board fills in. `tabLabel` is the top-level tab in the
// Fundraising module; `shortLabel` fits a button. `measure` says how the
// subcommittee sizes its plan: in dollars, or (Membership Upskilling) in
// people.

export const FUNDRAISING_SUBCOMMITTEES = [
  {
    id: "donors",
    name: "Existing Donor Engagement",
    tabLabel: "Donor Engagement",
    shortLabel: "Donors",
    measure: "dollars",
    coLeads: ["Rut", "Margarita"],
  },
  {
    id: "grants",
    name: "Grant Research and Identification",
    tabLabel: "Grants",
    shortLabel: "Grants",
    measure: "dollars",
    coLeads: ["Fez", "Noe"],
  },
  {
    id: "events",
    name: "Fundraising Events",
    tabLabel: "Fundraising Events",
    shortLabel: "Events",
    measure: "dollars",
    coLeads: ["Dinorah", "Lucia"],
  },
  {
    id: "upskilling",
    name: "Membership Upskilling",
    tabLabel: "Fundraising Workshops",
    shortLabel: "Workshops",
    measure: "people",
    coLeads: ["Yesi", "Yari"],
  },
];

export function subcommitteeById(id) {
  return FUNDRAISING_SUBCOMMITTEES.find((subcommittee) => subcommittee.id === id) || null;
}

export function coLeadsLabel(subcommittee) {
  const names = (subcommittee?.coLeads || []).filter(Boolean);
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
