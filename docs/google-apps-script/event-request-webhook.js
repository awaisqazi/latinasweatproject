/**
 * LSP Event & Scheduling Requests  ->  Admin Dashboard (Studio Spaces)
 *
 * Reference copy of the Apps Script project "Event Request Webhook"
 * (script.google.com, collab@latinasweatproject.com). The project is
 * STANDALONE, not container-bound (the Forms editor's Apps Script popup
 * would not open in the setup browser), so the form is addressed by id via
 * FormApp.openById and the submit trigger was created with forForm(form).
 *
 * Sends every submission (from the public /eventsrequest page or the raw
 * Google Form) to public.event_requests via the submit_event_request RPC,
 * which feeds the "Event Requests" tab of the Studio Spaces admin module.
 *
 * Robustness notes:
 * - Dedupe key is the Google FormResponse id, so re-running syncAllResponses
 *   is always safe: pending rows are refreshed, decided rows are never
 *   touched (the RPC returns skipped_already_decided).
 * - Question titles are matched after trimming/collapsing whitespace (two of
 *   the live titles contain a trailing space/newline). RENAMING a question in
 *   the form editor requires updating the matching FIELDS constant below;
 *   ADDING questions needs no changes here (answers ride along in p_payload).
 * - Each send retries 3x with backoff. A submission that still fails throws,
 *   so Apps Script's built-in failure notification email fires; run
 *   syncAllResponses afterwards to heal any gap.
 *
 * SETUP (once): paste into the form's Apps Script editor with the real
 * secret, run createTrigger (authorize when prompted), then run
 * syncAllResponses to backfill existing responses.
 *
 * EVENT_REQUEST_SECRET lives in app_private.settings (key
 * 'event_request_secret') in Supabase; intentionally redacted in this copy.
 */

const CONFIG = {
  // The LSP Event & Scheduling Request Form (standalone project, so the
  // form is addressed by id rather than getActiveForm).
  FORM_ID: "10S1u0saGe78lV4Cxwf4CNDJxv25N_39zbF9X4XNArCU",
  SUPABASE_URL: "https://jcseaxtvsozylsbmykka.supabase.co",
  SUPABASE_KEY: "sb_publishable_ByKQH4QqhYhrT7K-gqEhsw_zqdEvkB_",
  EVENT_REQUEST_SECRET: "REDACTED - see app_private.settings key 'event_request_secret'",
};

// Normalized (whitespace-collapsed, trimmed) question titles.
const FIELDS = {
  BOARD_NAME: "Board Name",
  EMAIL: "Email",
  EVENT_NAME: "Event Name",
  EVENT_DATE: "Event Date",
  START_TIME: "Event Start Time",
  END_TIME: "Event End Time",
  SETUP_CLEANUP: "Set-up/Clean-up Times",
  LOCATION: "Event Location",
  NOTES: "Is there anything else we should know?",
};

function onEventRequestSubmit(e) {
  sendEventRequest(e.response);
}

function sendEventRequest(response) {
  const answers = {};
  response.getItemResponses().forEach(function (itemResponse) {
    const title = normalizeTitle(itemResponse.getItem().getTitle());
    const raw = itemResponse.getResponse();
    const value = (Array.isArray(raw) ? raw : [raw])
      .filter(function (v) { return v !== "" && v !== null && v !== undefined; })
      .join(", ")
      .trim();
    if (title && value) answers[title] = value;
  });

  const body = {
    p_secret: CONFIG.EVENT_REQUEST_SECRET,
    p_response_id: response.getId(),
    p_submitted_at: response.getTimestamp().toISOString(),
    p_board_name: answers[FIELDS.BOARD_NAME] || null,
    p_email: answers[FIELDS.EMAIL] || null,
    p_event_name: answers[FIELDS.EVENT_NAME] || null,
    p_event_date: answers[FIELDS.EVENT_DATE] || null, // "YYYY-MM-DD"
    p_start_time: answers[FIELDS.START_TIME] || null, // "HH:MM"
    p_end_time: answers[FIELDS.END_TIME] || null,
    p_setup_cleanup: answers[FIELDS.SETUP_CLEANUP] || null,
    p_location: answers[FIELDS.LOCATION] || null,
    p_notes: answers[FIELDS.NOTES] || null,
    p_payload: answers,
  };

  const result = fetchWithRetry(
    CONFIG.SUPABASE_URL + "/rest/v1/rpc/submit_event_request",
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
  Logger.log("Sent %s: %s", response.getId(), result);
  return result;
}

function fetchWithRetry(url, options) {
  const delaysMs = [0, 2000, 4000];
  let lastError = "";

  for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
    if (delaysMs[attempt]) Utilities.sleep(delaysMs[attempt]);

    let res;
    try {
      res = UrlFetchApp.fetch(url, options);
    } catch (err) {
      lastError = String(err);
      continue;
    }

    const code = res.getResponseCode();
    if (code < 300) return res.getContentText();

    lastError = "HTTP " + code + ": " + res.getContentText();
    // 4xx (bad secret, malformed payload) will not heal on retry.
    if (code >= 400 && code < 500) break;
  }

  throw new Error("Event request sync failed after retries. " + lastError);
}

// Backfill/repair: pushes every stored response through the same pipeline.
// Safe to run anytime; the RPC dedupes on the response id.
function syncAllResponses() {
  const responses = FormApp.openById(CONFIG.FORM_ID).getResponses();
  let sent = 0;
  const failures = [];

  responses.forEach(function (response) {
    try {
      sendEventRequest(response);
      sent += 1;
    } catch (err) {
      failures.push(response.getId() + ": " + err);
    }
  });

  Logger.log("Synced %s of %s responses.", sent, responses.length);
  if (failures.length) {
    throw new Error("Some responses failed to sync:\n" + failures.join("\n"));
  }
}

function createTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "onEventRequestSubmit") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onEventRequestSubmit")
    .forForm(FormApp.openById(CONFIG.FORM_ID))
    .onFormSubmit()
    .create();
  Logger.log("Trigger installed.");
}

function normalizeTitle(title) {
  return String(title || "").replace(/\s+/g, " ").trim();
}
