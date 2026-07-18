// Donor relationship layer: per-donor CRM profiles (relationship owner +
// outreach fields), shared outreach campaigns/call lists, and the editable
// template library. Sits alongside fundraising.js, which owns donations,
// rollups, prospects, and the interaction log.

export const CONTACT_METHODS = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone call" },
  { value: "text", label: "Text message" },
  { value: "in_person", label: "In person" },
  { value: "social", label: "Social media" },
];

export const CAPACITY_ESTIMATES = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "major", label: "Major donor potential" },
];

export const OUTREACH_STATUSES = [
  { value: "to_contact", label: "To contact", tone: "neutral" },
  { value: "contacted", label: "Contacted", tone: "blue" },
  { value: "no_response", label: "No response", tone: "amber" },
  { value: "attending", label: "Attending", tone: "green" },
  { value: "declined", label: "Declined", tone: "red" },
];

// Statuses that still count as "waiting on us" for rollup progress.
export const OUTREACH_OPEN_STATUS = "to_contact";

export const DONOR_PROFILE_COLUMNS =
  "email,display_name,owner_id,next_action,next_action_date,preferred_contact_method,areas_of_interest,capacity_estimate,warm_intro_source,board_connection,created_at,updated_at";

const CAMPAIGN_COLUMNS =
  "id,name,description,due_date,status,created_by,created_at,updated_at";

const ITEM_COLUMNS =
  "id,campaign_id,donor_email,donor_name,assignee_id,status,status_changed_at,created_at,updated_at";

const TEMPLATE_COLUMNS =
  "id,category,title,kind,subject,body,sort_order,image_urls,updated_by,created_at,updated_at";

// Preset choices for "Assign a task about this donor". Each preset pre-fills
// the task with instructions that lead the assignee to the matching template
// (with its mail merge and inline images) in the donor drawer.
export const DONOR_TASK_PRESETS = [
  {
    id: "gala_invite",
    label: "Send the 2026 gala invite",
    templateTitle: "Gala 2026 formal invite",
    title: (donorLabel) => `Send gala invite to ${donorLabel}`,
    note: (donorLabel) =>
      `Formally invite ${donorLabel} to the Annual Gala (Sept 25 at the MCA).\n\n` +
      'From your Workspace card, hit "View full details" to open the donor, then under "Send with a template" choose "Gala 2026 formal invite". Copy the merged subject and email, copy the two images under it (the formal invitation and the evening overview) into the email, and send from your own inbox. Then hit "Log as sent" so the contact log and outreach lists update.',
  },
  {
    id: "gala_sponsor",
    label: "Gala sponsorship ask",
    templateTitle: null,
    title: (donorLabel) => `Gala sponsorship conversation with ${donorLabel}`,
    note: () =>
      'Reach out about sponsoring the Annual Gala (tiers from $2,500 to $25,000; sponsorships close September 15). The "Gala sponsorship packages" reference in the Templates tab has the tier details, and the sponsorship one-pager image is at /images/gala/gala-2026-sponsorship.png for attaching.',
  },
  {
    id: "thank_you",
    label: "Send a thank-you",
    templateTitle: "Donation thank-you",
    title: (donorLabel) => `Thank ${donorLabel} for their support`,
    note: () =>
      'Open the donor from your Workspace card and use the "Donation thank-you" template under "Send with a template". Personalize the impact line, send it from your inbox, and log it as sent.',
  },
];

export function normalizeDonorEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Page a select past PostgREST's 1,000-row cap; the donor base is already
// past it, so any per-donor table can grow past it too.
async function loadAllPages(buildQuery) {
  const PAGE = 1000;
  const all = [];

  for (let page = 0; page < 20; page += 1) {
    const from = page * PAGE;
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);

    if (error) return { data: all, error };

    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  return { data: all, error: null };
}

// ── Donor profiles ──────────────────────────────────────────────

export async function loadDonorProfiles(supabase) {
  return loadAllPages(() =>
    supabase
      .from("fundraising_donor_profiles")
      .select(DONOR_PROFILE_COLUMNS)
      .order("email", { ascending: true }),
  );
}

export async function loadDonorProfile(supabase, email) {
  return supabase
    .from("fundraising_donor_profiles")
    .select(DONOR_PROFILE_COLUMNS)
    .eq("email", normalizeDonorEmail(email))
    .maybeSingle();
}

// First write for a donor creates the profile row; later writes update it.
// Updates carry an optimistic lock on updated_at: 0 rows back means someone
// else saved first, so the caller should refetch and re-apply.
export async function upsertDonorProfile(
  supabase,
  { email, displayName, expectedUpdatedAt, ...fields },
) {
  const normalized = normalizeDonorEmail(email);
  if (!normalized) return { data: null, error: new Error("Donor email is required.") };

  const row = {
    display_name: displayName ?? null,
    owner_id: fields.ownerId ?? null,
    next_action: fields.nextAction?.trim() || null,
    next_action_date: fields.nextActionDate || null,
    preferred_contact_method: fields.preferredContactMethod || null,
    areas_of_interest: fields.areasOfInterest?.trim() || null,
    capacity_estimate: fields.capacityEstimate || null,
    warm_intro_source: fields.warmIntroSource?.trim() || null,
    board_connection: fields.boardConnection?.trim() || null,
  };

  if (expectedUpdatedAt) {
    return supabase
      .from("fundraising_donor_profiles")
      .update(row)
      .eq("email", normalized)
      .eq("updated_at", expectedUpdatedAt)
      .select(DONOR_PROFILE_COLUMNS)
      .maybeSingle();
  }

  return supabase
    .from("fundraising_donor_profiles")
    .insert({ email: normalized, ...row })
    .select(DONOR_PROFILE_COLUMNS)
    .single();
}

// ── Outreach campaigns ──────────────────────────────────────────

export async function loadOutreachCampaigns(supabase) {
  return supabase
    .from("fundraising_outreach_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
}

export async function createOutreachCampaign(supabase, { name, description, dueDate }) {
  return supabase
    .from("fundraising_outreach_campaigns")
    .insert({
      name: String(name || "").trim(),
      description: description?.trim() || null,
      due_date: dueDate || null,
    })
    .select(CAMPAIGN_COLUMNS)
    .single();
}

export async function updateOutreachCampaign(supabase, campaign, updates) {
  let query = supabase
    .from("fundraising_outreach_campaigns")
    .update(updates)
    .eq("id", campaign.id);
  if (campaign.updated_at) query = query.eq("updated_at", campaign.updated_at);
  return query.select(CAMPAIGN_COLUMNS).maybeSingle();
}

// ── Outreach items ──────────────────────────────────────────────

export async function loadOutreachItems(supabase, campaignId) {
  return loadAllPages(() =>
    supabase
      .from("fundraising_outreach_items")
      .select(ITEM_COLUMNS)
      .eq("campaign_id", campaignId)
      .order("donor_name", { ascending: true, nullsFirst: false })
      .order("donor_email", { ascending: true }),
  );
}

// All my open queue entries for one campaign (the workspace rollup card view).
export async function loadMyOutreachQueue(supabase, campaignId, profileId) {
  return supabase
    .from("fundraising_outreach_items")
    .select(ITEM_COLUMNS)
    .eq("campaign_id", campaignId)
    .eq("assignee_id", profileId)
    .order("status", { ascending: true })
    .order("donor_name", { ascending: true, nullsFirst: false });
}

// Bulk add donors to a campaign; duplicates (same campaign + email) are
// silently skipped so re-adding a segment is safe. donors: [{email, name}].
export async function addOutreachItems(supabase, campaignId, donors, assigneeId = null) {
  const rows = donors
    .map((donor) => ({
      campaign_id: campaignId,
      donor_email: normalizeDonorEmail(donor.email),
      donor_name: donor.name?.trim() || null,
      assignee_id: assigneeId,
    }))
    .filter((row) => row.donor_email);

  if (!rows.length) return { data: [], error: null };

  return supabase
    .from("fundraising_outreach_items")
    .upsert(rows, { onConflict: "campaign_id,donor_email", ignoreDuplicates: true })
    .select(ITEM_COLUMNS);
}

export async function updateOutreachItem(supabase, item, updates) {
  let query = supabase
    .from("fundraising_outreach_items")
    .update(updates)
    .eq("id", item.id);
  if (item.updated_at) query = query.eq("updated_at", item.updated_at);
  return query.select(ITEM_COLUMNS).maybeSingle();
}

export async function assignOutreachItems(supabase, itemIds, assigneeId) {
  return supabase
    .from("fundraising_outreach_items")
    .update({ assignee_id: assigneeId })
    .in("id", itemIds)
    .select(ITEM_COLUMNS);
}

export async function removeOutreachItem(supabase, itemId) {
  return supabase.from("fundraising_outreach_items").delete().eq("id", itemId);
}

// ── Template library ────────────────────────────────────────────

export async function loadTemplates(supabase) {
  return supabase
    .from("fundraising_templates")
    .select(TEMPLATE_COLUMNS)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
}

export async function createTemplate(
  supabase,
  { category, title, kind, subject, body, imageUrls },
) {
  return supabase
    .from("fundraising_templates")
    .insert({
      category: String(category || "").trim(),
      title: String(title || "").trim(),
      kind: kind === "reference" ? "reference" : "email",
      subject: subject?.trim() || null,
      body: String(body || "").trim(),
      image_urls: normalizeImageUrls(imageUrls),
    })
    .select(TEMPLATE_COLUMNS)
    .single();
}

// Accepts an array or newline/comma separated text; keeps only non-empty
// entries so the editor can use a plain textarea.
export function normalizeImageUrls(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  return list.map((url) => String(url || "").trim()).filter(Boolean);
}

export async function updateTemplate(supabase, template, updates) {
  let query = supabase
    .from("fundraising_templates")
    .update(updates)
    .eq("id", template.id);
  if (template.updated_at) query = query.eq("updated_at", template.updated_at);
  return query.select(TEMPLATE_COLUMNS).maybeSingle();
}

export async function deleteTemplate(supabase, templateId) {
  return supabase.from("fundraising_templates").delete().eq("id", templateId);
}

// ── Mail merge ──────────────────────────────────────────────────
// Templates use square-bracket placeholders ([First Name], [Your Name]...).
// fillTemplate replaces the ones we can resolve from the donor + sender and
// leaves the rest intact so the writer can see what still needs a human.

const PLACEHOLDER_ALIASES = {
  "first name": "firstName",
  "donor name": "donorName",
  name: "donorName",
  "your name": "senderName",
  "organization/company name": "companyName",
  "organization name": "companyName",
  "company name": "companyName",
};

export function fillTemplate(text, values = {}) {
  if (!text) return "";

  return text.replace(/\[([^\][]+)\]/g, (match, rawToken) => {
    const key = PLACEHOLDER_ALIASES[rawToken.trim().toLowerCase()];
    const value = key ? values[key] : null;
    return value ? String(value).trim() : match;
  });
}

// Placeholders still unresolved after a merge, for the "needs attention" hint.
export function listPlaceholders(text) {
  const found = new Set();
  for (const match of String(text || "").matchAll(/\[([^\][]+)\]/g)) {
    found.add(match[0]);
  }
  return Array.from(found);
}

// Build merge values from a donor summary/profile + the current user.
export function mergeValuesForDonor(donor, currentUserName) {
  const donorName =
    donor?.donor_name || donor?.display_name || donor?.company_name || donor?.email || "";
  return {
    donorName,
    firstName: donorName.split(/\s+/)[0] || "",
    companyName: donor?.company_name || "",
    senderName: currentUserName || "",
  };
}
