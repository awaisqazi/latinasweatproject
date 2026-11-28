// Holiday Gift Drive: single source of truth for the /giftdrive page
// (src/pages/giftdrive.astro), the homepage band (GiftDriveHomeBand.astro),
// the /links card (GiftDriveLinksCard.astro) and the share card
// (scripts/render-giftdrive-og.mjs).
//
// Source of every fact: the Community Impact Team's two-page flyer
// "The Latina Sweat Project's Holiday Gift Drive" (Nov 27 2026; both pages
// are on the page whole, public/images/giftdrive/flyer-1.webp and
// flyer-2.webp). The studio address comes from craftDaysPlace in
// src/data/posadaCraftDays.js.
// Do not add details that are not on the flyer: no drop-off hours, no tag
// counts, no "gift bag provided", no perks, no partner links.
//
// All dates are 2026 and Central Standard Time (UTC-6).

export const giftDrive = {
  name: "Holiday Gift Drive",
  team: "Community Impact Team",
  // The drive is on from when the tree went up until the end of Sunday,
  // December 13 (Chicago): gifts are due that day.
  dueDateISO: "2026-12-13",
  dueLabel: "Sunday, December 13",
  dueShort: "Dec 13",
  endsAt: "2026-12-14T00:00:00-06:00",
  maxBudget: 75,
  contactEmail: "communityimpact@latinasweatproject.com",
  pagePath: "giftdrive",
  // All-day calendar entry for December 13 (public/giftdrive/).
  calendarFile: "giftdrive/holiday-gift-drive-2026-12-13.ics",
  // The real tree at the studio (tags redacted), 960x1280: never shown wider
  // than about 480 CSS px, never upscaled, never filtered.
  photo: {
    jpg: "images/giftdrive/tree.jpg",
    webp640: "images/giftdrive/tree-640.webp",
    webp960: "images/giftdrive/tree-960.webp",
    webp320: "images/giftdrive/tree-320.webp",
    width: 960,
    height: 1280,
    alt: "The Holiday Gift Drive tree at LSP, decorated with gold ornaments and paper wish list tags.",
  },
  flyers: [
    {
      webp: "images/giftdrive/flyer-1.webp",
      webp640: "images/giftdrive/flyer-1-640.webp",
      jpg: "images/giftdrive/flyer-1.jpg",
      alt: "Flyer, page 1: The Latina Sweat Project's Holiday Gift Drive, on now until Dec 13. How to donate: stop by LSP, grab an ornament tag off our tree and buy a few items off the list for an individual. The gifts are for individuals at Bethany House and Viator House of Hospitality.",
    },
    {
      webp: "images/giftdrive/flyer-2.webp",
      webp640: "images/giftdrive/flyer-2-640.webp",
      jpg: "images/giftdrive/flyer-2.jpg",
      alt: "Flyer, page 2: each tag is one individual's wish list. Guidelines: sign up on the sheet, a maximum of $75 all together, wrap gifts in a bag, keep to a general holiday theme, turn gifts in by Sunday, December 13, and return your tag if you can't complete it. Questions: communityimpact@latinasweatproject.com.",
    },
  ],
};

// How it works (the page's three steps).
export const giftDriveSteps = [
  {
    title: "Take a tag",
    body: "Stop by LSP and pick an ornament tag off our tree. Each tag is one person's holiday wish list. Sign up on the sheet with your first and last name, phone number and the tag number from the bottom right corner of your tag.",
  },
  {
    title: "Shop the list",
    body: "Buy a few items from the list, up to $75 all together. Team up with someone to complete a gift if that works better for you.",
  },
  {
    title: "Bring it back",
    body: "If you wrap the gifts, use a bag instead of wrapping paper so we can check what's inside. Return everything to LSP by Sunday, December 13.",
  },
];

// The checklist on the page (keys are stored on the device).
export const giftDriveChecklist = [
  { key: "signed", label: "I signed up on the sheet with my name, phone number and tag number" },
  { key: "budget", label: "My gifts come to $75 or less all together" },
  { key: "bag", label: "They are in a bag, not wrapping paper" },
  { key: "theme", label: "Wrapping and gifts keep to a general holiday theme" },
  { key: "return", label: "I'm returning everything to LSP by Sunday, December 13" },
];
export const giftDriveChecklistKey = "lsp-giftdrive-2026-checklist";

// The two houses, the flyer's sentences verbatim.
export const giftDriveHouses = [
  {
    name: "Bethany House of Hospitality",
    line: "offers housing and support services to young immigrant women and their children as they journey to independence.",
  },
  {
    name: "Viator House of Hospitality",
    line: "provides compassionate accompaniment of young male immigrants seeking asylum.",
  },
];

// ------------------------------------------- homepage + /links placements --
// Added Nov 27 2026. The homepage band (GiftDriveHomeBand.astro, between the
// Giving Tuesday and LSP Posadas bands) and the /links card + story bubble
// (GiftDriveLinksCard.astro, between the Giving Tuesday and Posadas cards)
// show until giftDrive.endsAt (the end of Sun Dec 13, Chicago), at build time
// AND in the browser (src/lib/giftDrivePlacement.js), then step back.
// HOW TO TURN THEM OFF BY HAND: set showGiftDriveHomeBand (homepage) and/or
// showGiftDriveLinksCard (/links card and its bubble) to false.
export const showGiftDriveHomeBand = true;
export const showGiftDriveLinksCard = true;

// "open" | "off".
export function giftDrivePhase(now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return t >= Date.parse(giftDrive.endsAt) ? "off" : "open";
}

// The America/Chicago calendar date ("YYYY-MM-DD") of an instant.
function chicagoDate(t) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

// Whole Chicago calendar days from `now` to the due date (0 on the day).
export function giftDriveDaysLeft(now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const a = Date.parse(`${chicagoDate(t)}T00:00:00Z`);
  const b = Date.parse(`${giftDrive.dueDateISO}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

// { en, es, short } where short is true on Dec 12 and Dec 13 (the sentence
// stands alone there, without the "Gifts due" tail). null once it is over.
export function giftDriveCountdown(now = Date.now()) {
  const n = giftDriveDaysLeft(now);
  if (n < 0 || giftDrivePhase(now) === "off") return null;
  if (n === 0) return { en: "Gifts are due today", es: "Los regalos se entregan hoy", short: true };
  if (n === 1) return { en: "Gifts are due tomorrow", es: "Los regalos se entregan mañana", short: true };
  return { en: `${n} days left`, es: `Quedan ${n} días`, short: false };
}

// Placement copy. /links shows every string in EN and ES; proper names stay
// (Holiday Gift Drive, Bethany House of Hospitality, Viator House of
// Hospitality, Mural Park, Community Impact Team).
export const giftDrivePlacementCopy = {
  title: "Holiday Gift Drive",
  lead: "Take an ornament tag off our tree and fill one person's holiday wish list.",
  leadEs:
    "Toma una etiqueta de nuestro árbol y cumple la lista de deseos de una persona para estas fiestas.",
  // No-break spaces keep the date whole when the line wraps.
  due: "Gifts due Sunday, December\u00a013",
  dueEs: "Entrega los regalos antes del domingo 13\u00a0de\u00a0diciembre",
  who: "Every tag is a wish list from someone at Bethany House or Viator House of Hospitality.",
  whoEs:
    "Cada etiqueta es la lista de deseos de una persona de Bethany House o Viator House of Hospitality.",
  cta: "How it works",
  ctaEs: "Cómo participar",
  calendar: "Add December 13 to your calendar",
  calendarEs: "Agenda el 13 de diciembre",
  bubble: "Gift Drive",
  bubbleEs: "Gift Drive",
};
