// deno test supabase/functions/giving-signup
import { assertEquals } from "jsr:@std/assert@1";
import { instructorSlug, validateSignup } from "./validate.ts";

const base = {
  campaign: "gt-selftest",
  firstName: "  Lucía ",
  lastName: "del Rincón Martínez",
  email: " Lucia@Example.COM ",
  phone: "",
  cohort: "instructor",
  why: "Because\nmovement heals",
  showOnBoard: true,
  consentPage: true,
  turnstileToken: "tok",
};

Deno.test("slug: identical to instructorSlug() in src/data/popUpShared.js", () => {
  assertEquals(instructorSlug("Lucía del Rincón Martínez"), "lucia-del-rincon-martinez");
  assertEquals(instructorSlug("Zoraida Magaña"), "zoraida-magana");
  assertEquals(instructorSlug("Efrén Ramírez Jr."), "efren-ramirez-jr");
  assertEquals(instructorSlug("  Amayrani  Núñez "), "amayrani-nunez");
  assertEquals(instructorSlug("Vero Quiñones"), "vero-quinones");
});

Deno.test("validate: cleans fields and strips newlines from why", () => {
  const r = validateSignup(base);
  if (!r.ok) throw new Error(r.reason);
  assertEquals(r.value.firstName, "Lucía");
  assertEquals(r.value.email, "lucia@example.com");
  assertEquals(r.value.why, "Because movement heals");
  assertEquals(r.value.baseSlug, "lucia-del-rincon-martinez");
  assertEquals(r.value.showOnBoard, true);
});

Deno.test("validate: reasons", () => {
  const reason = (over: Record<string, unknown>) => {
    const r = validateSignup({ ...base, ...over });
    return r.ok ? "ok" : `${r.status}:${r.reason}`;
  };
  assertEquals(reason({ firstName: "" }), "400:invalid_name");
  assertEquals(reason({ lastName: "x".repeat(61) }), "400:invalid_name");
  assertEquals(reason({ email: "nope" }), "400:invalid_email");
  assertEquals(reason({ email: `${"a".repeat(195)}@ex.com` }), "400:invalid_email");
  assertEquals(reason({ cohort: "staff" }), "400:invalid_cohort");
  assertEquals(reason({ why: "y".repeat(161) }), "400:invalid_why");
  assertEquals(reason({ consentPage: false }), "400:consent_required");
  assertEquals(reason({ consentPage: "true" }), "400:consent_required");
  assertEquals(reason({ turnstileToken: "" }), "400:captcha_missing");
  assertEquals(reason({ campaign: "" }), "404:not_found");
  assertEquals(reason({ cohort: "both", phone: "1".repeat(40) }), "ok");
});
