// Single source of truth for LSP Giving Tuesday 2026 (/givingtuesday and the
// unlisted instructor sign-up at /givingtuesday/join).
//
// Campaign plan and copy: Lizett Galan (development lead), Google Doc
// "LSP: Nov 2026", tabs "Giving Tuesday" and "Emails". The appeal below is her
// email copy, trimmed; lines marked NEW are not from her doc and need the
// owner's OK before launch.
//
// Live numbers come from Supabase: rpc("giving_public", { p_campaign: SLUG }).
// Every Zeffy URL (campaign and per instructor) arrives from that RPC; when the
// campaign give_url is null the Give button falls back to /donate (the
// redirect to the main Zeffy form). The facts here are only the fallback the
// page renders before (or without) the RPC.
//
// Copy rules: no em-dashes, English first, never "free class", never call
// Mural Park permanent, no prizes unless the RPC sends prize_label, no tax
// advice, no donor names anywhere.

export const GIVING_SLUG = "giving-tuesday-2026";

export const givingRoutes = {
  page: "/givingtuesday",
  join: "/givingtuesday/join",
  fallbackGive: "/donate",
};

// Static fallbacks, mirrored from the backend contract. The RPC wins.
export const givingFacts = {
  goalCents: 1500000,
  thresholdCents: 15000,
  // Campaign opens Thu Nov 19, 2026 (00:00 Central). Gifts count through
  // 11:59:59 pm Central on Tue Dec 1, 2026.
  startsAt: "2026-11-19T06:00:00Z",
  endsAt: "2026-12-02T05:59:59Z",
  // The Chicago calendar day that is Giving Tuesday.
  givingDay: "2026-12-01",
  hashtag: "#LSPGivingTuesday",
  charityLine: "Latina Sweat Cares is a 501(c)(3) public charity",
  ein: "EIN 99-1616122",
  // Poll cadence for the live total while the tab is visible.
  pollMs: 25000,
};

export const givingCopy = {
  metaTitle: "LSP Giving Tuesday: From One Class to a Movement | The Latina Sweat Project",
  socialTitle: "LSP Giving Tuesday: From one class to a movement",
  metaDescription:
    "LSP Giving Tuesday is Tuesday, Dec 1. Help us reach $15,000 and build what's next for Latina Sweat Project.",
  // Lizett's headline, sentence case.
  headline: "From one class to a movement.",
  sub: "Help us build what's next.",
  giveLabel: "Give",

  // Phase lines (the date line under the headline). {date} is never a clock.
  phases: {
    before: { line: "Giving Tuesday is Tuesday, Dec 1.", note: "Early giving opens Thursday, Nov 19." }, // NEW
    early: { line: "Giving Tuesday is Tuesday, Dec 1.", note: "Early giving is open, and every gift counts toward our goal." }, // NEW
    today: { line: "Today is Giving Tuesday.", note: "Gifts count through 11:59 pm Central tonight." }, // NEW (note)
    after: { line: "Thank you for showing up.", note: "Giving Tuesday is over, and you can still give any time." }, // NEW
  },

  // Thermometer.
  meter: {
    raisedOf: "raised of our {goal} goal", // NEW
    passed: "raised, more than our {goal} goal", // NEW
    firstGift: "Be the first gift.", // NEW
    gifts: (n) => (n === 1 ? "1 gift so far" : `${n.toLocaleString("en-US")} gifts so far`), // NEW
    giftsFinal: (n) => (n === 1 ? "1 gift" : `${n.toLocaleString("en-US")} gifts`),
    unavailable: "Our goal is {goal}.", // NEW: shown when the live total cannot load
    finalLead: "Together we raised", // NEW
    finalOf: "toward our {goal} goal.", // NEW
    finalPassed: "more than our {goal} goal.", // NEW
  },

  // The appeal: Lizett's email copy (emails 1, 2 and 3), lightly trimmed.
  appeal: [
    "What started as a few pop-up yoga classes in Little Village has grown into something much bigger: a movement rooted in wellness, community care, and the belief that everyone deserves access to spaces where they can move, heal, and thrive.",
    "Since 2022, you've helped us grow from one monthly class to daily programming across Southwest Chicago. Together, we've brought wellness into parks, schools, and shelters, supported emerging BIPOC yoga instructors, and created spaces where community comes first.",
    "We've moved from pop-ups to Morgan Street Studio and now to our temporary home at Mural Park. Through every transition, our mission has remained the same.",
  ],
  belief: "We believe wellness should never be a luxury. It should be accessible, welcoming, and rooted in community.",
  supportLead: "Your generosity will help support:",
  supports: [
    "Accessible yoga and fitness programming.",
    "Opportunities for emerging BIPOC yoga instructors.",
    "Community partnerships and restorative wellness programming.",
    "Mutual aid and community-centered initiatives.",
    "The long-term sustainability of Latina Sweat Project.",
  ],
  ask: "Will you make a gift today?",
  share: "Can't give right now? You can still support us by sharing this campaign with your friends, family, and community.",
  shareButton: "Share this page", // NEW
  shareCopied: "Link copied", // NEW
  thanks: "From our very first class to wherever this movement takes us next, thank you for being part of our story.",

  // Instructor board.
  board: {
    title: "Give through an instructor", // NEW
    intro: "Our instructors are each raising $150 or more from friends and family. Give through one of them and your gift counts toward their total and our goal.", // NEW
    summary: (count, reached) =>
      `${count} ${count === 1 ? "instructor is" : "instructors are"} raising` +
      (reached > 0 ? ` · ${reached} reached $150` : ""), // NEW
    reached: "Reached $150", // NEW
    toGo: "{left} to go", // NEW
    give: "Give", // NEW
  },

  // Employer matching: Lizett's email copy.
  match: {
    title: "Can your employer match your gift?",
    body: "Many employers offer matching gift programs that support eligible nonprofit organizations. After making your gift, check with your HR department or employee giving portal to see if your company will match your contribution.",
  },
  // Site fact (/lspgala): "Latina Sweat Cares is a 501(c)(3) public charity", EIN 99-1616122.
  charity: "Donations go to Latina Sweat Cares, a 501(c)(3) public charity.",
};

// /givingtuesday/join copy. All NEW except where noted; facts from the
// campaign plan (raise $150 from friends and family by Dec 1, LSP builds the
// page and sends the link and share graphics, thank-you drawing at $150,
// own gift does not count).
export const givingJoinCopy = {
  metaTitle: "LSP Giving Tuesday: Fundraise With Us | The Latina Sweat Project",
  socialTitle: "LSP Giving Tuesday: fundraise with us",
  metaDescription: "Sign up to raise $150 or more for LSP this Giving Tuesday, Tuesday, Dec 1.",
  headline: "Raise $150 for LSP this Giving Tuesday.",
  lead: "Instructors and our 2026 YTT cohort: here is how it works.",
  steps: [
    "Ask friends and family to give. Your goal is $150 or more by 11:59 pm Central on Tuesday, Dec 1.",
    "We set up your personal giving page and send you your link and share graphics.",
    "Everyone who reaches $150 from other people's gifts is entered in a thank-you drawing.",
    "Your own gift is welcome, but it doesn't count toward the $150.",
  ],
  prize: "The drawing: {prize}.",
  formTitle: "Sign up",
  closedTitle: "Sign-ups are closed.",
  closedBody: "Thank you for wanting to help. You can still give, or share the campaign with your people.",
  cohorts: [
    { value: "instructor", label: "LSP instructor" },
    { value: "ytt-2026", label: "2026 YTT cohort" },
    { value: "both", label: "Both" },
  ],
  whyMax: 160,
  successTitle: "You're in, {first}.",
  successBody: "We'll set up your giving page and send your link and share graphics to {email}.",
  successBack: "See the Giving Tuesday page",
};

// ---------------------------------------------------------------- helpers --

const ms = (t) => (t instanceof Date ? t.getTime() : typeof t === "number" ? t : new Date(t).getTime());

// The America/Chicago calendar date ("YYYY-MM-DD") of an instant.
export function chicagoDate(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms(now)));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Campaign phase at `now`:
//   "before": the campaign has not opened yet
//   "early":  open, and it is not yet Giving Tuesday in Chicago
//   "today":  it is Giving Tuesday in Chicago and gifts still count
//   "after":  past ends_at (thank-you state; giving still works)
export function phase(now, startsAt = givingFacts.startsAt, endsAt = givingFacts.endsAt, givingDay = givingFacts.givingDay) {
  const t = ms(now);
  if (!Number.isFinite(t)) return "early";
  if (Number.isFinite(ms(endsAt)) && t > ms(endsAt)) return "after";
  if (Number.isFinite(ms(startsAt)) && t < ms(startsAt)) return "before";
  return chicagoDate(t) >= givingDay ? "today" : "early";
}

// Cents to "$6,240" (whole dollars; cents shown only when not whole, e.g. "$12.50").
export function money(cents) {
  const n = Math.max(0, Math.round(Number(cents) || 0));
  const whole = n % 100 === 0;
  return (n / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

// Share of a goal, 0..1 (clamped), for bar widths.
export function progress(raisedCents, goalCents) {
  const g = Number(goalCents) || 0;
  if (g <= 0) return 0;
  return Math.min(1, Math.max(0, (Number(raisedCents) || 0) / g));
}

// Fill "{goal}"-style slots.
export function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (values[k] ?? ""));
}
