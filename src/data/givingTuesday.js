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
  // Instructor short links: /give/<slug> is redirected by 404.astro to the
  // static page /give/?i=<slug>. The share kit lives at /givingtuesday/kit/?i=<slug>.
  give: "/give",
  kit: "/givingtuesday/kit",
  shortHost: "latinasweatproject.com",
};

// The public short link for a fundraiser slug, with and without the scheme.
export function shortLink(slug, { scheme = true } = {}) {
  const s = String(slug || "").trim().toLowerCase();
  const path = `${givingRoutes.shortHost}${givingRoutes.give}/${s}`;
  return scheme ? `https://${path}` : path;
}
// Fundraiser slugs are lowercase a-z, 0-9 and hyphens (instructorSlug()).
export function cleanSlug(v) {
  const s = String(v || "").trim().toLowerCase().replace(/\/+$/, "");
  return /^[a-z0-9][a-z0-9-]{0,80}$/.test(s) ? s : "";
}

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

  // The studio floor (the thermometer drawn as a room of mats). One mat is
  // $100 of the goal, so $15,000 is 150 mats.
  floor: {
    matCents: 10000,
    key: "Each mat is $100 toward our goal.", // NEW (owner's brief)
    first: "Roll out the first mat.", // NEW (owner's brief)
    // Day line above the number (browser only, Chicago calendar days).
    daysTo: (n) => (n === 1 ? "Tomorrow is Giving Tuesday." : `${n} days to Giving Tuesday`), // "Tomorrow is Giving Tuesday": Lizett's email 2 subject
    endsTonight: "Ends tonight at 11:59 pm Central.", // NEW (owner's brief)
  },

  // The amount picker under the floor.
  picker: {
    title: "Pick your mat.", // NEW (owner's brief)
    legend: "Choose an amount", // NEW
    amounts: [25, 50, 100, 150, 250],
    preset: 100,
    other: "Other", // NEW
    otherLabel: "Other amount in dollars", // NEW
    // "{amount} rolls out {mats}." The mats wording comes from matWords().
    preview: "{amount} rolls out {mats}.", // NEW
    previewNone: "Choose an amount to see it on the floor.", // NEW
  },

  // The story as a dated timeline, 2022 to now, ending at the ask. Lizett's
  // words (emails 1 to 3) cut and ordered, never rewritten; every other line
  // is marked NEW and states only a date, place or number the site already
  // publishes (source beside it). Years without a dated photo carry none.
  story: {
    title: "How we got here", // NEW
    startedLead: "What started as a few pop-\u2060up yoga classes in Little Village", // word joiner: never break pop-up
    startedRest:
      "has grown into something much bigger: a movement rooted in wellness, community care, and the belief that everyone deserves access to spaces where they can move, heal, and thrive.",
    grew: "Since 2022, you've helped us grow from one monthly class to daily programming across Southwest Chicago.",
    // Year of the first chapter: src/pages/about.astro:716 "Founded in 2022,
    // Latina Sweat began as small pop-up yoga classes in Little Village".
    // 2023 and 2024: src/pages/impact.astro "Previous Years" (2023 Impact,
    // lines 358 and 365; 2024 Impact, lines 325, 332 and 336), the site's own
    // labels in sentence case.
    years: [
      { year: "2023", facts: ["1,000+ attendees", "750 yoga mats donated"] }, // NEW (site facts)
      { year: "2024", facts: ["2,000+ attendees", "$27,000 donated to nonprofits", "200 yoga mats donated"] }, // NEW (site facts)
    ],
    // 2025: src/pages/impact.astro:19 (classes), :51 (the studio, "Opened the
    // first yoga nonprofit studio in Pilsen ... our home until fall 2026"),
    // :59 (45 instructors). The studio is always "Morgan Street Studio".
    classesTitle: "Classes a month in 2025", // NEW label for the site fact
    classes: [
      { month: "Jan", n: 25 },
      { month: "May", n: 55 },
      { month: "Sep", n: 100 },
      { month: "Dec", n: 240 },
    ],
    y2025: [
      "We opened Morgan Street Studio, the first yoga nonprofit studio in Pilsen.", // NEW (impact.astro:51)
      "We certified 45 new yoga instructors from the Southwest Side and surrounding communities.", // NEW (impact.astro:59)
    ],
    // 2026, month by month. Dates and places: graduation.astro:8,55,230,288;
    // sweatFest.js:15,21; galaRecap2026.js:21,23; about.astro:676-677 and
    // popUpWeek1.js:60 (pop-ups from Oct 5); ddlmRecap2026.js:52;
    // ribbonCutting.js:1-2 and about.astro:677-678 (ribbon cutting Nov 15,
    // classes from Nov 16).
    moments: {
      grad: { when: "August 7", line: "Our 2025 and 2026 teacher training cohorts graduated. Nearly 100 teachers strong." }, // NEW
      sweatfest: { when: "August 22", line: "Sweat Fest at 18th & Peoria." }, // NEW
      gala: { when: "September 25", line: "Our Annual Gala at the Museum of Contemporary Art Chicago." }, // NEW
      fall: {
        when: "October",
        line: "We went pop-\u2060up around the neighborhood, and celebrated D\u00eda de los Muertos at La Villita Park.", // NEW
      },
      moved: { when: "November 15", line: "We cut the ribbon at Mural Park, and classes began there the next day." }, // NEW
    },
    // Captions: event, place and month only.
    captions: {
      grad: "Teacher training graduation, August 2026.", // NEW
      sweatfest: "Sweat Fest, August 2026.", // NEW
      gala: "The Annual Gala, September 2026.", // NEW
      ddlm: "D\u00eda de los Muertos at La Villita Park, October 2026.", // NEW
      ribbon: "The ribbon cutting at Mural Park, November 2026.", // NEW
      tt2025: "Teacher training, 2025.", // NEW (Drive folder "[VIDEO] 2025 LSP TT")
    },
    movedLead: "We've moved from",
    moved: ["pop-\u2060ups", "to Morgan Street Studio", "and now to our temporary home at Mural Park."],
    movedRest: "Through every transition, our mission has remained the same.",
    nextTitle: "What's next", // NEW
    nextWhen: "Giving Tuesday, December 1", // NEW
    together:
      "Together, we've brought wellness into parks, schools, and shelters, supported emerging BIPOC yoga instructors, and created spaces where community comes first.",
    constant: "Our community is why Latina Sweat Project exists, grows, and keeps showing up.",
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

// /give/?i=<slug> (short link /give/<slug>): one instructor's giving page.
// UNLISTED, noindex. All lines NEW unless noted. {name} is the full name as
// the board shows it; {first} the first word of it; {goal} their threshold.
export const givingPersonCopy = {
  metaTitle: "LSP Giving Tuesday: Give Through an Instructor | The Latina Sweat Project",
  socialTitle: "LSP Giving Tuesday: give through an LSP instructor",
  metaDescription: "LSP Giving Tuesday is Tuesday, Dec 1. Give through an LSP instructor and help us build what's next.",
  kicker: "LSP Giving Tuesday",
  headline: "Help {name} raise {goal}.",
  counts: "Your gift counts toward {first}'s total and our {campaignGoal} goal.",
  raisedOf: "{raised} of {goal}",
  // Fallback (no slug, unknown slug, board closed, or the RPC is down).
  fallbackHeadline: "Give to LSP Giving Tuesday.",
  notFound: "We couldn't find that giving page, and you can still give to the campaign.",
  seeAll: "See the Giving Tuesday page", // same words as givingJoinCopy.successBack
  // Static per-person page /give/<slug>/ (give/[slug].astro): its own title,
  // description and share card (scripts/render-giving-instructor-og.mjs).
  // {why} is their own words, verbatim. All NEW.
  personTitle: "Help {name} raise {goal} | LSP Giving Tuesday",
  personDescription: "LSP Giving Tuesday: \u201C{why}\u201D Help {first} raise {goal} by Tuesday, Dec 1.",
  personDescriptionNoWhy: "LSP Giving Tuesday: help {name} raise {goal} by Tuesday, Dec 1.",
  personCardAlt: "LSP Giving Tuesday. Help {first} raise {goal}. Tuesday, Dec 1.",
};

// /givingtuesday/kit/?i=<slug>: an instructor's share kit (link, captions,
// images drawn in the browser). UNLISTED, noindex. All lines NEW. Every
// caption leads with "LSP Giving Tuesday". {link} is the short link,
// {goal} the instructor's threshold, {campaignGoal} the campaign goal.
export const givingKitCopy = {
  metaTitle: "LSP Giving Tuesday: Your Share Kit | The Latina Sweat Project",
  socialTitle: "LSP Giving Tuesday: your share kit",
  metaDescription: "Your LSP Giving Tuesday link, captions and images.",
  headline: "{first}, here is your share kit.",
  headlineNone: "Your LSP Giving Tuesday share kit.",
  pickLead: "Choose your name to get your link, captions and images.",
  pickLabel: "Your name",
  pickPlaceholder: "Choose your name",
  notFound: "We couldn't find that name. Please choose it from the list.",
  empty: "Your kit will be ready once we set up your giving page. We'll send you the link.",
  down: "We couldn't load the list right now. Please try again in a minute.",
  loading: "Loading your kit.",
  retry: "Try again",
  imageFailed: "We couldn't make this image. Please reload the page.",
  notYou: "Not you? Choose another name",

  linkTitle: "Your link",
  linkNote: "Share it anywhere. It opens your giving page.",
  copyLink: "Copy link",
  copy: "Copy",
  copied: "Copied",
  share: "Share",
  openPage: "Open your page",

  captionsTitle: "Captions",
  // First person, in the instructor's voice, ready to paste.
  captions: [
    "LSP Giving Tuesday is Tuesday, Dec 1, and I'm fundraising for Latina Sweat Project. My goal is {goal}. Will you give through my page? {link} #LSPGivingTuesday",
    "LSP Giving Tuesday: every gift to my page helps Latina Sweat Project build what's next and counts toward our {campaignGoal} goal. Help me raise {goal}. {link} #LSPGivingTuesday",
    "LSP Giving Tuesday: what started as a few pop-up yoga classes in Little Village has grown into something much bigger. Help me reach {goal} by Tuesday, Dec 1. {link} #LSPGivingTuesday", // first clause: Lizett's appeal
  ],

  imagesTitle: "Images",
  imagesNote: "Made for you, with your name and your words. Download them, or share them straight to your stories.",
  feedLabel: "Feed post, 1080 x 1350",
  storyLabel: "Story, 1080 x 1920",
  download: "Download",
  making: "Making your image.",
  // Pre-rendered per instructor by scripts/render-giving-instructor-kit.mjs
  // (public/images/givingtuesday/give/<slug>-post.jpg and -story.jpg). Their
  // words live in that script; the canvas fallback below says the same.
  imageAlt: "LSP Giving Tuesday graphic: Help me raise {goal}. Tuesday, Dec 1. {link}. Signed {name}.",
  imageAltPhoto: "LSP Giving Tuesday graphic with a photo of {name}: Help me raise {goal}. Tuesday, Dec 1. {link}.",

  // Canvas fallback (kitCanvas.js), for anyone approved since the last
  // `npm run giving:cards`: words only, plus the logo and the class photo.
  image: {
    kicker: "LSP Giving Tuesday",
    lines: ["Help me", "raise {goal}"],
    date: "Tuesday, Dec 1",
  },
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

// Whole Chicago calendar days from `now` to `day` ("YYYY-MM-DD"); 0 on the day.
export function daysUntil(now, day = givingFacts.givingDay) {
  const [y1, m1, d1] = chicagoDate(now).split("-").map(Number);
  const [y2, m2, d2] = String(day).split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// A number of mats in words: 0.25 -> "a quarter of a mat", 1 -> "one mat",
// 2.5 -> "two and a half mats", 3.7 -> "3.7 mats".
const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
export function matWords(mats) {
  const m = Math.round(Number(mats) * 100) / 100;
  if (!(m > 0)) return "";
  const whole = Math.floor(m);
  const frac = Math.round((m - whole) * 100) / 100;
  const fracWord = { 0.25: "a quarter", 0.5: "a half", 0.75: "three quarters" }[frac];
  if (whole === 0 && fracWord) return `${fracWord === "a half" ? "half" : fracWord} of a mat`.replace("half of a mat", "half a mat");
  if (whole > 0 && whole <= 10 && frac === 0) return `${WORDS[whole]} ${whole === 1 ? "mat" : "mats"}`;
  if (whole > 0 && whole <= 10 && fracWord) return `${WORDS[whole]} and ${fracWord} mats`;
  const n = m.toLocaleString("en-US", { maximumFractionDigits: 1 });
  return `${n} ${n === "1" ? "mat" : "mats"}`;
}

// Zeffy opens its donation form with the amount filled in when the URL carries
// ?amount=<dollars>&donate=true. That holds for the campaign's peer-to-peer
// page (checked by hand, Nov 17 2026) and for each instructor's own
// /fundraising/<slug> page (checked Nov 19 2026: the form shows "$ 150" and
// the receipt line names $150). Any other URL (the /donate fallback) is
// returned unchanged, so a button only names an amount when prefillsAmount()
// is true.
export function prefillsAmount(url) {
  try {
    const u = new URL(url);
    return /(^|\.)zeffy\.com$/i.test(u.hostname) && /\/(peer-to-peer|fundraising)\//.test(u.pathname);
  } catch {
    return false;
  }
}
export function withAmount(url, dollars) {
  const d = Math.round(Number(dollars));
  if (!prefillsAmount(url) || !(d > 0)) return url;
  const u = new URL(url);
  u.searchParams.set("amount", String(d));
  u.searchParams.set("donate", "true");
  return u.toString();
}

// Fill "{goal}"-style slots.
export function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (values[k] ?? ""));
}

// ------------------------------------------- homepage + /links placements --
// Added Nov 19 2026. The homepage band (GivingTuesdayHomeBand.astro, right
// under "Our new home") and the /links card + story bubble
// (GivingTuesdayLinksCard.astro, the first card) show the live total from the
// same giving_public RPC as /givingtuesday, the days left, and a small studio
// floor of mats. They turn themselves off, at build time AND in the browser:
//   until givingFacts.endsAt (11:59 pm Central, Tue Dec 1)   the campaign
//   from then until givingPlacementsUntil (end of Thu Dec 3)  a short thank you
//   after that                                                nothing
// HOW TO TURN THEM OFF BY HAND: set showGivingHomeBand (homepage) and/or
// showGivingLinksCard (/links card and its bubble) to false. To end them on
// another day, change givingPlacementsUntil.
export const showGivingHomeBand = true;
export const showGivingLinksCard = true;
export const givingPlacementsUntil = "2026-12-04T05:59:59Z";

// Site-wide countdown band at the very top of every page that renders the
// shared Header (src/components/GivingTuesdayHeaderBand.astro). It counts to
// the start of givingFacts.givingDay in Chicago, reads "LSP Giving Tuesday is
// today" on the day, and is gone once givingFacts.endsAt passes (build time
// and in the browser). It never shows while the studio outage banner
// (src/data/studioStatus.js) is on. HOW TO TURN IT OFF BY HAND: set this to
// false.
export const showGivingHeaderBand = true;

// "campaign" | "thanks" | "off" (the toggles are applied by the components).
export function givingPlacementPhase(now = Date.now()) {
  const t = ms(now);
  if (t > ms(givingPlacementsUntil)) return "off";
  if (t > ms(givingFacts.endsAt)) return "thanks";
  return "campaign";
}

// Words used only by the placements (English from givingCopy where it
// exists; the Spanish is for the /links toggle). All NEW unless noted.
export const givingPlacementCopy = {
  kicker: "LSP Giving Tuesday",
  headlineEs: "De una clase a un movimiento.",
  subEs: "Ayúdanos a construir lo que sigue.",
  cta: "Pick your mat", // givingCopy.picker.title, without the period
  ctaEs: "Elige tu tapete",
  thanksCta: "See the Giving Tuesday page", // givingPersonCopy.seeAll
  thanksCtaEs: "Ve la página de Giving Tuesday",
  dateLine: "Tuesday, Dec 1", // the share card's date line
  dateLineEs: "Martes 1 de diciembre",
  daysToEs: (n) => (n === 1 ? "Mañana es Giving Tuesday." : `Faltan ${n} días para Giving Tuesday`),
  endsTonightEs: "Termina hoy a las 11:59 pm, hora de Chicago.",
  raisedOfEs: "recaudados de nuestra meta de {goal}",
  passedEs: "recaudados, más que nuestra meta de {goal}",
  giftsEs: (n) => (n === 1 ? "1 donación hasta ahora" : `${n.toLocaleString("en-US")} donaciones hasta ahora`),
  goalIs: "is our goal.",
  goalIsEs: "es nuestra meta.",
  firstEs: "Extiende el primer tapete.",
  keyEs: "Cada tapete es $100 para nuestra meta.",
  thanksHead: "Thank you for showing up.", // givingCopy.phases.after.line
  thanksHeadEs: "Gracias por estar con nosotros.",
  thanksNote: "Giving Tuesday is over, and you can still give any time.", // givingCopy.phases.after.note
  thanksNoteEs: "Giving Tuesday terminó, y puedes donar cuando quieras.",
  finalLeadEs: "Juntos recaudamos",
  finalOfEs: "para nuestra meta de {goal}.",
  finalPassedEs: "más que nuestra meta de {goal}.",
  giftsFinalEs: (n) => (n === 1 ? "1 donación" : `${n.toLocaleString("en-US")} donaciones`),
  bubble: "Giving Tuesday",
};
