// Pure helpers for giving-signup, kept free of Deno.serve so they unit-test.

// Port of instructorSlug() in src/data/popUpShared.js. Keep identical:
// NFD, strip combining marks U+0300..U+036F, lower-case, trim, runs of
// anything outside [a-z0-9] become "-", then trim leading/trailing "-".
export const instructorSlug = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const COHORTS = ["instructor", "ytt-2026", "both"] as const;
export type Cohort = typeof COHORTS[number];

export type SignupInput = {
  campaign?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  cohort?: unknown;
  why?: unknown;
  showOnBoard?: unknown;
  consentPage?: unknown;
  turnstileToken?: unknown;
};

export type CleanSignup = {
  campaign: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  cohort: Cohort;
  why: string;
  showOnBoard: boolean;
  consentPage: true;
  turnstileToken: string;
  baseSlug: string;
};

export type ValidationResult =
  | { ok: true; value: CleanSignup }
  | { ok: false; reason: string; status: number };

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
// Collapse internal whitespace (including newlines and tabs) to single spaces.
const oneLine = (v: unknown) => str(v).replace(/\s+/g, " ").trim();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateSignup(input: SignupInput): ValidationResult {
  const campaign = str(input.campaign).trim();
  const firstName = oneLine(input.firstName);
  const lastName = oneLine(input.lastName);
  const email = str(input.email).trim().toLowerCase();
  const phone = oneLine(input.phone).slice(0, 30);
  const cohort = str(input.cohort).trim();
  const why = oneLine(input.why);
  const turnstileToken = str(input.turnstileToken).trim();

  if (!campaign || campaign.length > 80) return { ok: false, reason: "not_found", status: 404 };
  if (!firstName || !lastName || firstName.length > 60 || lastName.length > 60) {
    return { ok: false, reason: "invalid_name", status: 400 };
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return { ok: false, reason: "invalid_email", status: 400 };
  }
  if (!(COHORTS as readonly string[]).includes(cohort)) {
    return { ok: false, reason: "invalid_cohort", status: 400 };
  }
  if (why.length > 160) return { ok: false, reason: "invalid_why", status: 400 };
  if (input.consentPage !== true) return { ok: false, reason: "consent_required", status: 400 };
  if (!turnstileToken) return { ok: false, reason: "captcha_missing", status: 400 };

  return {
    ok: true,
    value: {
      campaign,
      firstName,
      lastName,
      email,
      phone,
      cohort: cohort as Cohort,
      why,
      showOnBoard: input.showOnBoard !== false,
      consentPage: true,
      turnstileToken,
      baseSlug: instructorSlug(`${firstName} ${lastName}`) || "fundraiser",
    },
  };
}
