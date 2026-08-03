/**
 * LSP Marketing Intake  ->  Admin Dashboard
 *
 * Reference copy of the Apps Script installed on the intake RESPONSE SHEET
 * (not the form): "Intake: LSP Brand & Visibility (Responses)" -> Extensions
 * -> Apps Script (project owned by collab@latinasweatproject.com).
 *
 * Sends every Google Form submission to the LSP admin dashboard's
 * "Google Forms Intake Queue" (public.projects, source = 'google_form')
 * via the submit_project_intake RPC. All answered columns are forwarded
 * generically in p_payload, so ADDING a form question needs no changes here.
 * RENAMING one of the CONFIG.*_FIELD questions DOES require updating the
 * matching string below (namedValues is keyed by exact sheet column header).
 *
 * SETUP: Run createTrigger once (authorize when prompted). That installs the
 * on-form-submit trigger. Then submit a test response to verify.
 *
 * INTAKE_SECRET lives in app_private.settings (key 'intake_secret') in
 * Supabase; it is intentionally redacted in this repo copy.
 */

const CONFIG = {
  SUPABASE_URL: "https://jcseaxtvsozylsbmykka.supabase.co",
  SUPABASE_KEY: "sb_publishable_ByKQH4QqhYhrT7K-gqEhsw_zqdEvkB_",
  INTAKE_SECRET: "REDACTED - see app_private.settings key 'intake_secret'",
  TITLE_FIELD: "Name of Event or Initiative (for follow up)",
  CONTACT_FIELD: "Point of Contact",
  URGENCY_FIELD: "Urgency of Request",
};

function onIntakeFormSubmit(e) {
  const named = (e && e.namedValues) || {};
  sendIntake(named);
}

function sendIntake(named) {
  const first = (key) => {
    const v = named[key];
    return Array.isArray(v) ? String(v[0] || "").trim() : String(v || "").trim();
  };

  const payload = {};
  Object.keys(named).forEach((key) => {
    if (key === "Timestamp") return;
    const value = (Array.isArray(named[key]) ? named[key] : [named[key]])
      .filter((v) => v !== "" && v !== null && v !== undefined)
      .join(", ")
      .trim();
    if (value) payload[key] = value;
  });

  const urgencyRaw = first(CONFIG.URGENCY_FIELD);
  const urgency = urgencyRaw ? parseInt(urgencyRaw, 10) : null;

  let submittedAt = new Date().toISOString();
  const ts = first("Timestamp");
  if (ts) {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) submittedAt = d.toISOString();
  }

  const body = {
    p_secret: CONFIG.INTAKE_SECRET,
    p_title: first(CONFIG.TITLE_FIELD) || "Untitled intake request",
    p_respondent_email: first("Email Address") || first("Email") || null,
    p_contact_name: first(CONFIG.CONTACT_FIELD) || null,
    p_urgency: Number.isFinite(urgency) ? urgency : null,
    p_payload: payload,
    p_submitted_at: submittedAt,
  };

  const res = UrlFetchApp.fetch(
    CONFIG.SUPABASE_URL + "/rest/v1/rpc/submit_project_intake",
    {
      method: "post",
      contentType: "application/json",
      headers: {
        apikey: CONFIG.SUPABASE_KEY,
        Authorization: "Bearer " + CONFIG.SUPABASE_KEY,
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    }
  );

  if (res.getResponseCode() >= 300) {
    throw new Error(
      "Intake sync failed (" + res.getResponseCode() + "): " + res.getContentText()
    );
  }
}

function createTrigger() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "onIntakeFormSubmit") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onIntakeFormSubmit")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onFormSubmit()
    .create();
}
