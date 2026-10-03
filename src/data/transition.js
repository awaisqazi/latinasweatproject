// Studio transition: single source of truth for the paused-studio state.
//
// Context (Oct 2, 2026): LSP is in the process of being displaced from
// 949 W 16th St (the studio has not closed). All
// programming at the 16th Street studio is paused and recurring memberships
// were cancelled at renewal, so the embedded MarianaTek schedule / buy
// widgets have nothing to book. While programming is paused, the widget
// surfaces show <StudioTransitionSection /> instead: a short transition
// message, the donation ask, and the current pop-up classes (reused from
// popUpWeek1.js and collectiveFinishLine.js, never duplicated here).
//
// THE TOGGLE: flip showMarianaSchedule to true when the new studio opens
// and classes are back on MarianaTek. That one line restores, exactly as
// before:
//   /schedule  policy strip (incl. cancel-membership card), Pop Up band,
//              trouble-viewing link, MarianaTek schedule widget, app banner
//   /classes   Pop Up band, trouble-viewing link, MarianaTek widget
//   /pricing   "Buy passes or memberships" hero CTA, all six price cards
//              (drop-in, 5/10-class packs, monthly, 6-month, new member
//              week; replaced by studioTransition.pricingPaused),
//              cancellation policy, trouble-viewing link, MarianaTek buy
//              widget
//   Layout     the MarianaTek loader on /schedule, /classes, /pricing
// /account and /register keep their MarianaTek widgets either way (members
// may still need their account), and their loader always runs.
//
// Copy rules: no em dashes; never "free classes"; do not promise a new
// address. "Opening early 2027" is reused verbatim from existing site copy
// (homepage A New Chapter, /popup, /about).

export const showMarianaSchedule = false;

export const studioTransition = {
  eyebrow: "A new chapter · Un nuevo capítulo",
  heading: "Our studio is paused. Our community keeps moving.",
  body: [
    "All programming at our 16th Street studio is paused, so online class booking is closed for now. Recurring memberships will not renew, and there are no further charges.",
    "We are building toward our next home in Pilsen, opening early 2027. Until then, pop-up classes keep us moving together around the neighborhood.",
  ],
  questionsLead: "Questions about your membership? Email",
  questionsEmail: "membership@latinasweatproject.com",

  donate: {
    eyebrow: "Help build our next home",
    headline: "Every gift moves us closer to home.",
    body:
      "Your support keeps classes accessible while we build a permanent " +
      "home of our own in Pilsen.",
    ctaLabel: "Support the new home",
    ctaNote: "Opens our donation form on Zeffy",
    // Site path relative to BASE_URL: /donate redirects to the general
    // Zeffy donation form, same as every other donate link on the site.
    path: "donate",
  },

  // /pricing: replaces the price cards while showMarianaSchedule is false.
  // Every card was a MarianaTek product (drop-in, class packs, monthly,
  // 6-month, new member week); the membership contracts were deactivated
  // Oct 2, 2026, and with no studio classes on MarianaTek, class credits
  // have nothing to book. Pop-ups are reserved per class on Zeffy.
  pricingPaused: {
    eyebrow: "Studio pricing is paused",
    body:
      "While programming at our studio is paused, studio class packs, drop-ins, and " +
      "memberships are not available for purchase. Pop-up classes are " +
      "reserved one class at a time, with pricing shown for each class below.",
  },

  popups: {
    eyebrow: "Pop-up classes",
    heading: "Where to move with us",
    body:
      "This fall, LSP is popping up across the neighborhood: classes and " +
      "community programming around Pilsen. Reserve your spot for each " +
      "class below.",
    // Shown once every dated pop-up has wrapped (and as the closing line
    // while they are live), so the section never reads as an empty box.
    moreLine: "More pop-ups are on the way. Follow",
    moreLineTail: "on Instagram for new dates and locations.",
    pastBody:
      "This fall, LSP is popping up across the neighborhood: classes and " +
      "community programming around Pilsen.",
    instagramHandle: "@latinasweatproject",
    instagramUrl: "https://www.instagram.com/latinasweatproject/",
  },
};
