// Fundraising hub data layer: donor/campaign rollups, the prospect pipeline,
// the contact log, and the Zeffy import parser.
//
// IMPORT HASH SPEC v1 (must stay in sync with the initial seed script):
// sha256 hex of pipe-joined [email lowercased, payment_date ISO, payment_time,
// total_amount 2dp, payment_method, payment_status, campaign_title,
// rate_title, ticket_number, item_amount 2dp, fund]; identical tuples get
// '#2', '#3'... suffixes in sheet order. All fields trimmed; missing = ''.

export const PROSPECT_STAGES = [
  "Research",
  "Outreach",
  "In Conversation",
  "Application",
  "Committed",
  "Stewardship",
  "Declined",
];

export const PROSPECT_KINDS = [
  { value: "foundation", label: "Foundation" },
  { value: "corporate", label: "Corporate" },
  { value: "government", label: "Government" },
  { value: "individual", label: "Individual / Major donor" },
  { value: "other", label: "Other" },
];

export const INTERACTION_KINDS = [
  { value: "note", label: "Note" },
  { value: "email", label: "Email" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "event", label: "Event" },
  { value: "ask", label: "Ask made" },
  { value: "thanks", label: "Thank-you sent" },
];

export const PROSPECT_COLUMNS =
  "id,name,kind,stage,fit_score,priority,website,focus_areas,geography,typical_grant_range,annual_giving,application_process,deadlines,contact_info,key_people,recent_relevant_giving,fit_rationale,suggested_ask,research_notes,engagement_plan,owner_id,next_action,next_action_date,last_contact_at,source,created_at,updated_at";

const INTERACTION_COLUMNS =
  "id,prospect_id,donor_email,kind,body,occurred_at,created_by,author_name,created_at";

export function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

// ── Loaders ─────────────────────────────────────────────────────

// PostgREST caps a single response at 1,000 rows, so page through the donor
// list until a short page signals the end.
export async function loadDonorSummaries(supabase) {
  const PAGE = 1000;
  const all = [];

  for (let page = 0; page < 20; page += 1) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("fundraising_donor_summary")
      .select("*")
      .order("total_given", { ascending: false, nullsFirst: false })
      .order("email", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) return { data: all, error };

    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  return { data: all, error: null };
}

export async function loadCampaignSummaries(supabase) {
  return supabase
    .from("fundraising_campaign_summary")
    .select("*")
    .order("total_raised", { ascending: false, nullsFirst: false });
}

// Emails go through ilike for case-insensitive matching, so escape the
// pattern characters ('_' is common in real addresses).
function escapeLikePattern(value) {
  return String(value).replace(/([\\%_])/g, "\\$1");
}

export async function loadDonationsForEmail(supabase, email) {
  return supabase
    .from("fundraising_donations")
    .select(
      "id,payment_date,payment_time,total_amount,refund_amount,payment_status,payment_method,campaign_title,rate_title,fund,note,in_honor_of",
    )
    .ilike("email", escapeLikePattern(email))
    .order("payment_date", { ascending: false });
}

// Every succeeded donation on or after sinceDate (yyyy-mm-dd), paged past
// PostgREST's 1,000-row cap so a busy event month can't be undercounted.
export async function loadDonationsSince(supabase, sinceDate) {
  const PAGE = 1000;
  const all = [];

  for (let page = 0; page < 20; page += 1) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("fundraising_donations")
      .select("id,payment_date,total_amount,refund_amount")
      .eq("payment_status", "Succeeded")
      .gte("payment_date", sinceDate)
      .order("payment_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) return { data: all, error };

    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  return { data: all, error: null };
}

export async function loadProspects(supabase) {
  return supabase
    .from("fundraising_prospects")
    .select(PROSPECT_COLUMNS)
    .order("priority", { ascending: true })
    .order("name", { ascending: true });
}

export async function loadInteractions(supabase, { prospectId, donorEmail } = {}) {
  let query = supabase
    .from("fundraising_interactions")
    .select(INTERACTION_COLUMNS)
    .order("occurred_at", { ascending: false })
    .limit(100);

  if (prospectId) query = query.eq("prospect_id", prospectId);
  if (donorEmail) query = query.ilike("donor_email", escapeLikePattern(donorEmail));

  return query;
}

export async function addInteraction(
  supabase,
  { prospectId, donorEmail, kind, body },
) {
  return supabase
    .from("fundraising_interactions")
    .insert({
      prospect_id: prospectId || null,
      donor_email: donorEmail || null,
      kind: kind || "note",
      body: String(body || "").trim(),
    })
    .select(INTERACTION_COLUMNS)
    .single();
}

export async function loadImports(supabase, limit = 20) {
  return supabase
    .from("fundraising_imports")
    .select("id,file_name,total_rows,inserted_rows,skipped_rows,created_by,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
}

// ── Zeffy export parsing (mirrors the seed script exactly) ──────

function s(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function amt(value) {
  const t = s(value).replace(/\$/g, "").replace(/,/g, "");
  if (t === "") return "";
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const t = s(value);
  if (!t) return "";
  const mdY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (mdY) return `${mdY[3]}-${mdY[1].padStart(2, "0")}-${mdY[2].padStart(2, "0")}`;
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(t);
  if (mdy) return `20${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return t;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Accepts the "Full Zeffy Campaign Details" sheet as an array of arrays
// (header row first). Returns { rows, skippedBlank } where each row is ready
// for insert into fundraising_donations.
export async function parseZeffyRows(sheetRows) {
  if (!sheetRows?.length) return { rows: [], skippedBlank: 0 };

  const headers = sheetRows[0].map((h) => s(h));

  const col = (name, start = 0) => {
    for (let i = start; i < headers.length; i += 1) {
      if (headers[i].startsWith(name)) return i;
    }
    return -1;
  };

  const IX = {
    email: 0,
    pd: col("Payment Date"),
    pt: col("Payment Time"),
    ta: col("Total Amount"),
    pm: col("Payment Method"),
    ps: col("Payment Status"),
    payout: col("Payout Date"),
    ra: col("Refund Amount"),
    disc: col("Discount"),
    fn: col("First Name"),
    ln: col("Last Name"),
    co: col("Company Name"),
    ad: col("Address"),
    ci: col("City"),
    pc: col("Postal Code"),
    st: col("State"),
    cy: col("Country"),
    txn: col("Tax Receipt #"),
    txu: col("Tax Receipt URL"),
    ea: col("Eligible Amount"),
    rt: col("Rate Title"),
    tstat: col("Status", 20),
    ia: col("Item Amount"),
    tn: col("Ticket #"),
    cx: col("Canceled Tickets"),
    occ: col("Occurrence"),
    exp: col("Expiration Date"),
    ct: col("Campaign Title"),
    cl: col("Campaign Link"),
    no: col("Note"),
    ih: col("In Honour/Memory of"),
    ph: col("Phone Number"),
    fu: col("Fund"),
  };

  if (IX.pd === -1 || IX.ct === -1 || IX.ta === -1) {
    throw new Error(
      'This file doesn\'t look like a Zeffy "Full Zeffy Campaign Details" export (missing Payment Date / Total Amount / Campaign Title columns).',
    );
  }

  const known = new Set(Object.values(IX));
  const questionCols = headers
    .map((h, i) => ({ h, i }))
    .filter(
      ({ h, i }) =>
        !known.has(i) &&
        h &&
        h !== "Email" &&
        !h.startsWith("E-ticket") &&
        !h.startsWith("Ticket Scans") &&
        !h.startsWith("Last Scan") &&
        !h.startsWith("Language"),
    );

  const seen = new Map();
  const rows = [];
  let skippedBlank = 0;

  for (let r = 1; r < sheetRows.length; r += 1) {
    const raw = sheetRows[r] || [];
    const at = (i) => (i >= 0 && i < raw.length ? raw[i] : null);

    const email = s(at(IX.email)).toLowerCase();
    const pd = isoDate(at(IX.pd));
    const ct = s(at(IX.ct));
    if (!email && !pd && !ct) {
      skippedBlank += 1;
      continue;
    }

    const keyFields = [
      email, pd, s(at(IX.pt)), amt(at(IX.ta)), s(at(IX.pm)), s(at(IX.ps)),
      ct, s(at(IX.rt)), s(at(IX.tn)), amt(at(IX.ia)), s(at(IX.fu)),
    ];
    let hash = await sha256Hex(keyFields.join("|"));
    const n = (seen.get(hash) || 0) + 1;
    seen.set(hash, n);
    if (n > 1) hash = `${hash}#${n}`;

    const extra = {};
    const extras = [
      ["payout_date", IX.payout], ["discount", IX.disc], ["tax_receipt", IX.txn],
      ["tax_receipt_url", IX.txu], ["ticket_status", IX.tstat],
      ["canceled_tickets", IX.cx], ["occurrence", IX.occ], ["expiration", IX.exp],
    ];
    for (const [label, ix] of extras) {
      const v = s(at(ix));
      if (v) extra[label] = v;
    }
    const answers = {};
    for (const { h, i } of questionCols) {
      const v = s(at(i));
      if (v) answers[h] = v;
    }
    if (Object.keys(answers).length) extra.answers = answers;

    rows.push({
      import_hash: hash,
      email: email || null,
      first_name: s(at(IX.fn)) || null,
      last_name: s(at(IX.ln)) || null,
      company_name: s(at(IX.co)) || null,
      phone: s(at(IX.ph)) || null,
      address: s(at(IX.ad)) || null,
      city: s(at(IX.ci)) || null,
      state: s(at(IX.st)) || null,
      postal_code: s(at(IX.pc)) || null,
      country: s(at(IX.cy)) || null,
      payment_date: /^\d{4}-\d{2}-\d{2}$/.test(pd) ? pd : null,
      payment_time: s(at(IX.pt)) || null,
      total_amount: Number(amt(at(IX.ta)) || 0),
      item_amount: amt(at(IX.ia)) === "" ? null : Number(amt(at(IX.ia))),
      eligible_amount: amt(at(IX.ea)) === "" ? null : Number(amt(at(IX.ea))),
      refund_amount: Number(amt(at(IX.ra)) || 0),
      payment_method: s(at(IX.pm)) || null,
      payment_status: s(at(IX.ps)) || null,
      campaign_title: ct || null,
      campaign_link: s(at(IX.cl)) || null,
      rate_title: s(at(IX.rt)) || null,
      ticket_number: s(at(IX.tn)) || null,
      fund: s(at(IX.fu)) || null,
      note: s(at(IX.no)) || null,
      in_honor_of: s(at(IX.ih)) || null,
      extra: Object.keys(extra).length ? extra : null,
    });
  }

  return { rows, skippedBlank };
}

// Inserts parsed rows, skipping any already in the database (by import_hash).
// Returns { inserted, skipped, error }. On a mid-import error, skipped counts
// only the rows that were actually evaluated before the failure.
export async function importZeffyRows(supabase, importId, rows, onProgress = () => {}) {
  const BATCH = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((row) => ({ ...row, import_id: importId }));
    const { data, error } = await supabase
      .from("fundraising_donations")
      .upsert(batch, { onConflict: "import_hash", ignoreDuplicates: true })
      .select("id");

    if (error) return { inserted, skipped: i - inserted, error };

    inserted += data?.length || 0;
    onProgress(Math.min(i + BATCH, rows.length), rows.length);
  }

  return { inserted, skipped: rows.length - inserted, error: null };
}
