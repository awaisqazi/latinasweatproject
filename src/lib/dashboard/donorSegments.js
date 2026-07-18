// Donor segment chips shared by the Donors tab and the outreach "add donors"
// picker. Most segments filter the already-loaded donor summaries client-side;
// campaign-based ones (gala) resolve an email set from donations first.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const DONOR_SEGMENTS = [
  { id: "all", label: "All donors" },
  { id: "mine", label: "Assigned to me" },
  { id: "gala", label: "Gala donors", needsEmailSet: true },
  { id: "top", label: "$500+ lifetime" },
  { id: "repeat", label: "Repeat donors" },
  { id: "recent", label: "Gave in last 90 days" },
  { id: "lapsed", label: "Lapsed 12+ months" },
];

function daysSince(dateKey) {
  if (!dateKey) return Infinity;
  return Math.floor((Date.now() - new Date(`${dateKey}T00:00:00`).getTime()) / MS_PER_DAY);
}

// donor: a fundraising_donor_summary row. context: { profileId, profilesByEmail,
// emailSet } where profilesByEmail maps donor email -> donor profile row and
// emailSet is the resolved set for needsEmailSet segments.
export function donorMatchesSegment(donor, segmentId, context = {}) {
  const gaveSomething = Number(donor.total_given || 0) > 0;

  switch (segmentId) {
    case "mine": {
      const profile = context.profilesByEmail?.[donor.email];
      return Boolean(profile?.owner_id) && profile.owner_id === context.profileId;
    }
    case "gala":
      return Boolean(context.emailSet?.has(donor.email));
    case "top":
      return Number(donor.total_given || 0) >= 500;
    case "repeat":
      return Number(donor.gift_count || 0) >= 2;
    case "recent":
      return gaveSomething && daysSince(donor.last_gift_date) <= 90;
    case "lapsed":
      return gaveSomething && daysSince(donor.last_gift_date) > 365;
    default:
      return true;
  }
}

// Distinct donor emails that ever gave to a gala campaign. Campaign names vary
// ("...Gala...", "Noche Inolvidable..."), so match both. Paged past the
// 1,000-row PostgREST cap and deduped client-side.
export async function loadGalaDonorEmails(supabase) {
  const PAGE = 1000;
  const emails = new Set();

  for (let page = 0; page < 20; page += 1) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("fundraising_donations")
      .select("email")
      .or("campaign_title.ilike.%gala%,campaign_title.ilike.%noche%")
      .not("email", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) return { emails, error };

    for (const row of data || []) {
      const email = String(row.email || "").trim().toLowerCase();
      if (email) emails.add(email);
    }
    if (!data || data.length < PAGE) break;
  }

  return { emails, error: null };
}
