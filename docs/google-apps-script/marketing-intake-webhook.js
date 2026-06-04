/**
 * Google Apps Script bridge for the LSP Brand & Visibility Intake form.
 *
 * Install on the Google Form:
 * 1. Open the form editor.
 * 2. Extensions -> Apps Script.
 * 3. Paste this file.
 * 4. Set script properties:
 *    - MARKETING_INTAKE_WEBHOOK_URL = https://jcseaxtvsozylsbmykka.functions.supabase.co/marketing-intake
 *    - MARKETING_INTAKE_WEBHOOK_SECRET = optional, if set in the Supabase Edge Function
 *    - MARKETING_INTAKE_SUPABASE_SECRET_KEY = Supabase secret API key, used when no custom secret is set
 * 5. Run installMarketingIntakeTrigger() once and approve permissions.
 */

const QUESTION_MAP = {
  contactName: 'Point of Contact',
  title: 'Name of Event or Initiative',
  targetLiveDate: 'Target Live Date (+7 business days from submission date)',
  messaging: 'Language/Key Messaging about the Event or Initiative',
  logos: 'Logos (Please upload all relevant logo files)',
  workingAssets: 'Working Assets (e.g., Canva links, InDesign files, Google Docs, etc.)',
  instagramTags: 'Instagram Account(s) to Tag (@handle)',
  linkedInTags: 'LinkedIn Account(s) to Tag (@handle)',
  urgency: 'Urgency of Request',
};

function installMarketingIntakeTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  const existing = triggers.some((trigger) => trigger.getHandlerFunction() === 'handleMarketingIntakeSubmit');

  if (!existing) {
    ScriptApp.newTrigger('handleMarketingIntakeSubmit')
      .forForm(FormApp.getActiveForm())
      .onFormSubmit()
      .create();
  }
}

function handleMarketingIntakeSubmit(event) {
  const properties = PropertiesService.getScriptProperties();
  const webhookUrl = properties.getProperty('MARKETING_INTAKE_WEBHOOK_URL');
  const webhookSecret = properties.getProperty('MARKETING_INTAKE_WEBHOOK_SECRET');
  const supabaseSecretKey = properties.getProperty('MARKETING_INTAKE_SUPABASE_SECRET_KEY');

  if (!webhookUrl || (!webhookSecret && !supabaseSecretKey)) {
    throw new Error('Missing webhook URL or authentication property.');
  }

  const response = event.response;
  const answers = {};

  response.getItemResponses().forEach((itemResponse) => {
    const title = itemResponse.getItem().getTitle();
    const answer = itemResponse.getResponse();
    answers[title] = Array.isArray(answer) ? answer.map(stringifyAnswer) : stringifyAnswer(answer);
  });

  const payload = {
    responseId: response.getId(),
    submittedAt: response.getTimestamp().toISOString(),
    respondentEmail: response.getRespondentEmail(),
    contactName: answers[QUESTION_MAP.contactName] || '',
    title: answers[QUESTION_MAP.title] || '',
    targetLiveDate: answers[QUESTION_MAP.targetLiveDate] || '',
    messaging: answers[QUESTION_MAP.messaging] || '',
    logos: normalizeArray(answers[QUESTION_MAP.logos]),
    workingAssets: normalizeArray(answers[QUESTION_MAP.workingAssets]),
    instagramTags: splitHandles(answers[QUESTION_MAP.instagramTags]),
    linkedInTags: splitHandles(answers[QUESTION_MAP.linkedInTags]),
    urgency: Number(answers[QUESTION_MAP.urgency] || 0) || null,
    raw: answers,
  };

  const headers = {};

  if (webhookSecret) {
    headers['X-Marketing-Intake-Secret'] = webhookSecret;
  }

  if (supabaseSecretKey) {
    headers.Authorization = `Bearer ${supabaseSecretKey}`;
    headers.apikey = supabaseSecretKey;
  }

  UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: false,
  });
}

function stringifyAnswer(answer) {
  if (answer === null || answer === undefined) {
    return '';
  }

  if (typeof answer === 'object' && typeof answer.getName === 'function') {
    return answer.getName();
  }

  return String(answer).trim();
}

function normalizeArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function splitHandles(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}
