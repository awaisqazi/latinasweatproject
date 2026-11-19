// The fundraising board's four subcommittees and their co-leads. Edit names
// here; the live Overview scorecards read this list in order.
//
// `id` is fixed: it picks which numbers each scorecard shows
// (src/components/admin/fundraising/live/SubcommitteeScorecards.svelte).

export const FUNDRAISING_SUBCOMMITTEES = [
  { id: "events", name: "Fundraising Events", coLeads: ["Dinorah", "Lucia"] },
  { id: "grants", name: "Grant Research and Identification", coLeads: ["Fez", "Noe"] },
  { id: "donors", name: "Existing Donor Engagement", coLeads: ["Rut", "Margarita"] },
  { id: "upskilling", name: "Membership Upskilling", coLeads: ["Yesi", "Yari"] },
];

export function coLeadsLabel(subcommittee) {
  const names = (subcommittee?.coLeads || []).filter(Boolean);
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
