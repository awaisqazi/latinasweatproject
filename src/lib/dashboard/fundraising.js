// Fundraising hub data layer: donor/campaign rollups, the prospect pipeline,
// the contact log, and the Zeffy import parser.
//
// IMPORT HASH SPEC v1 (must stay in sync with the initial seed script):
// sha256 hex of pipe-joined [email lowercased, payment_date ISO, payment_time,
// total_amount 2dp, payment_method, payment_status, campaign_title,
// rate_title, ticket_number, item_amount 2dp, fund]; identical tuples get
// '#2', '#3'... suffixes in sheet order. All fields trimmed; missing = ''.

// Grant phases, in order, then Declined as the closed-out state. Contract:
// docs/fundraising-live (grant phases). A grant counts toward the
// fundraising totals once it is Committed or Received with a committed
// amount, in the calendar year of committed_on.
export const PROSPECT_STAGES = [
  "Prospecting",
  "Viable",
  "Drafted",
  "Submitted",
  "Committed",
  "Received",
  "Declined",
];
export const GRANT_PHASES = PROSPECT_STAGES.filter((stage) => stage !== "Declined");
export const COUNTED_STAGES = ["Committed", "Received"];

// Rows written before the relabel (the database renames them, but a row
// read before that lands must not vanish from the board).
const LEGACY_STAGES = {
  Research: "Prospecting",
  Outreach: "Viable",
  "In Conversation": "Viable",
  Application: "Drafted",
  Stewardship: "Received",
};

export function normalizeProspectStage(stage) {
  const value = String(stage || "").trim();
  if (PROSPECT_STAGES.includes(value)) return value;
  return LEGACY_STAGES[value] || "Prospecting";
}

// What a move to `stage` must ask for before saving: "commit" (amount and
// date), "receive" (date only) or "" (save straight away).
export function stageMoveNeeds(fromStage, toStage) {
  if (normalizeProspectStage(fromStage) === toStage) return "";
  if (toStage === "Committed") return "commit";
  if (toStage === "Received") return "receive";
  return "";
}

// "$12,500", "12500", "12,500.50" -> 12500.5 (dollars). "" -> null (clear).
// Anything else -> undefined, so the caller can say the amount is not valid.
export function parseMoneyInput(text) {
  const cleaned = String(text ?? "").replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return undefined;
  return Number(cleaned);
}

export function moneyInputValue(dollars) {
  if (dollars === null || dollars === undefined || dollars === "") return "";
  const n = Number(dollars);
  return Number.isFinite(n) ? String(n) : "";
}

// Whether a prospect's committed amount counts in the totals, and for which
// calendar year (null when it does not count).
export function grantCountedYear(prospect) {
  if (!COUNTED_STAGES.includes(normalizeProspectStage(prospect?.stage))) return null;
  const amount = Number(prospect?.committed_amount);
  if (!(amount > 0)) return null;
  const match = /^(\d{4})-/.exec(String(prospect?.committed_on || ""));
  return match ? Number(match[1]) : null;
}

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

// PROSPECT_COLUMNS is the original column list, kept as it was so other
// modules (Workspace) work before and after the grant columns land. The
// prospect board and drawer read PROSPECT_FULL_COLUMNS through
// withProspectColumns(), which falls back to the original list when the
// grant columns are not there yet.
export const PROSPECT_COLUMNS =
  "id,name,kind,stage,fit_score,priority,website,focus_areas,geography,typical_grant_range,annual_giving,application_process,deadlines,contact_info,key_people,recent_relevant_giving,fit_rationale,suggested_ask,research_notes,engagement_plan,owner_id,next_action,next_action_date,last_contact_at,source,created_at,updated_at";

export const PROSPECT_GRANT_COLUMNS = "ask_amount,committed_amount,committed_on,received_on";
export const PROSPECT_FULL_COLUMNS = `${PROSPECT_COLUMNS},${PROSPECT_GRANT_COLUMNS}`;

let grantColumnsMissing = false;

export function isMissingColumnError(error) {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /column .* does not exist|could not find the .* column/i.test(String(error.message || ""));
}

// True once the database answered without the grant columns (this page load).
export function prospectGrantColumnsMissing() {
  return grantColumnsMissing;
}

// run(columns) builds and awaits one query. Retried once with the original
// columns when the grant columns are missing; the failed attempt changed
// nothing, since PostgREST rejects the whole statement.
export async function withProspectColumns(run) {
  if (grantColumnsMissing) return run(PROSPECT_COLUMNS);
  const result = await run(PROSPECT_FULL_COLUMNS);
  if (result?.error && isMissingColumnError(result.error)) {
    grantColumnsMissing = true;
    return run(PROSPECT_COLUMNS);
  }
  return result;
}

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

// Every donation read goes through fundraising_donations_all, the Zeffy
// mirror for the whole history (records start 2025-07-18), with a `source`
// column and text ids. The legacy fundraising_donations table is only the
// target of the old import helpers below, which the UI no longer offers.
export const DONATIONS_READ_VIEW = "fundraising_donations_all";

// build(fromBuilder) returns the query; resolves to { data, error, ... }.
export function readDonations(supabase, build) {
  return build(supabase.from(DONATIONS_READ_VIEW));
}

export async function loadDonationsForEmail(supabase, email) {
  return readDonations(supabase, (from) =>
    from
    .select(
      "id,payment_date,payment_time,total_amount,refund_amount,payment_status,payment_method,campaign_title,rate_title,fund,note,in_honor_of",
    )
    .ilike("email", escapeLikePattern(email))
    .order("payment_date", { ascending: false }),
  );
}

// Every succeeded donation on or after sinceDate (yyyy-mm-dd), paged past
// PostgREST's 1,000-row cap so a busy event month can't be undercounted.
export async function loadDonationsSince(supabase, sinceDate) {
  const PAGE = 1000;
  const all = [];

  for (let page = 0; page < 20; page += 1) {
    const from = page * PAGE;
    const { data, error } = await readDonations(supabase, (query) =>
      query
        .select("id,payment_date,total_amount,refund_amount")
        .eq("payment_status", "Succeeded")
        .gte("payment_date", sinceDate)
        .order("payment_date", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1),
    );

    if (error) return { data: all, error };

    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  return { data: all, error: null };
}

export async function loadProspects(supabase) {
  return withProspectColumns((columns) =>
    supabase
      .from("fundraising_prospects")
      .select(columns)
      .order("priority", { ascending: true })
      .order("name", { ascending: true }),
  );
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
