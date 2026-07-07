export const galaTeaser = {
  slug: "noche-inolvidable-gala",
  // This year's gala has not been named yet; refer to it as the "Annual Gala"
  // for now. `shortTitle` is the gold-foil-highlighted word shown before "Gala"
  // in headings, so swap in the real name here once it's chosen.
  title: "Annual Gala",
  shortTitle: "Annual",
  startsAtISO: "2026-09-25T18:00:00-05:00",
  dateLabel: "Friday, September 25, 2026",
  shortDateLabel: "Sep 25",
  timeLabel: "6:00 PM CT",
  dateTimeLabel: "September 25, 2026 · 6:00 PM CT",
  shortDateTimeLabel: "Sep 25 · 6:00 PM CT",
  venueName: "Museum of Contemporary Art Chicago",
  venueAddress: "220 E Chicago Ave, Chicago, IL",
  venueLine: "Museum of Contemporary Art Chicago · 220 E Chicago Ave",
  attire: "Black tie",
  statusLabel: "Tickets and sponsorships are on sale now",
  pagePath: "/gala",
  saveDatePath: "/gala#save-the-date",
  // Live Zeffy ticketing form (tickets AND sponsorships). CTAs across the site
  // should point here now that sales are open.
  ticketsUrl:
    "https://www.zeffy.com/en-US/ticketing/lsp-museum-of-contemporary-art-chicago-2026-gala",
  ticketsLabel: "Get Tickets",
  // Legacy pre-sales interest list, kept for reference; no live CTA should
  // point here anymore.
  interestUrl: "#gala-interest",
  interestFormUrl:
    "https://www.zeffy.com/en-US/ticketing/noche-inolvidable-gala-interest-list",
  interestLabel: "Join the Interest List",
  homepageDescription:
    "A black-tie evening for art, movement, and community.",
  pageDescription:
    "This next chapter brings our community into one of Chicago's most striking contemporary art spaces.",
  venueDescription:
    "We are gathering our community at MCA Chicago, where contemporary art, flexible event spaces, and the city's downtown energy create a powerful setting for what comes next.",
  missionDescription:
    "The gala supports Latina leadership, wellness access, and culturally rooted care across Chicago.",
};

// Ticket + sponsorship pricing for the live 2026 sale. Facts match the Zeffy
// form and the printed two-pager: early bird July 1-31, regular from August 1,
// Benefactor and all sponsorships close September 15, Supporter sells through
// event day. Keep these exact; they appear on printed material too.
export const galaTickets = {
  ticketsUrl: galaTeaser.ticketsUrl,
  earlyBirdLabel: "Early-bird pricing through July 31",
  regularLabel: "Regular pricing from August 1",
  tiers: [
    {
      id: "benefactor",
      eyebrow: "Benefactor",
      name: "The Full Evening",
      earlyBird: 325,
      regular: 375,
      accessLabel: "From 6 PM",
      description:
        "Cocktail hour with live music, a three-course seated dinner, live bidding, museum garden access, then the full late-night celebration.",
      closesLabel: "Ticket sales close September 15, 2026",
    },
    {
      id: "supporter",
      eyebrow: "Supporter",
      name: "Late Night Access",
      earlyBird: 200,
      regular: 225,
      accessLabel: "From 9 PM",
      description:
        "Step in as the night comes alive: full gallery access, open bar, the awards presentation, the fourth-floor fashion show, and dancing with a live DJ until midnight.",
      closesLabel: "On sale through event day, September 25, 2026",
    },
  ],
  sponsorships: [
    {
      name: "Presenting Sponsor",
      amount: 10000,
      seats: "Table of 20",
      note: "Limited to two partners",
    },
    { name: "Gold Sponsor", amount: 5000, seats: "Table of 10" },
    { name: "Community Sponsor", amount: 2500, seats: "5 tickets" },
  ],
  sponsorshipsCloseLabel: "Sponsorships close September 15, 2026",
};

// The evening, hour by hour, mirroring the printed two-pager's timeline.
// `at` is the stop's position along the 6 PM → midnight track (0..1, i.e.
// hours-after-6pm / 6). `tiers` lists which ticket tiers are in the room.
// Facts match the Zeffy form and the printed flyer; keep them exact.
export const galaEvening = [
  {
    time: "6 PM",
    title: "Cocktail hour",
    detail:
      "Live music as the evening opens. Museum garden open until 9 PM.",
    at: 0,
    tiers: ["benefactor"],
  },
  {
    time: "7 PM",
    title: "Seated dinner",
    detail:
      "Three courses, then live bidding to support the mission.",
    at: 1 / 6,
    tiers: ["benefactor"],
  },
  {
    time: "9 PM",
    title: "Museum after dark",
    detail:
      "Full gallery access and open bar until midnight. Awards presentation.",
    at: 3 / 6,
    tiers: ["benefactor", "supporter"],
  },
  {
    time: "10 PM",
    title: "Fashion show",
    detail: "Fourth floor, 10 to 11 PM, then dancing with a live DJ.",
    at: 4 / 6,
    tiers: ["benefactor", "supporter"],
  },
  {
    time: "12 AM",
    title: "Last dance",
    detail: "The night ends at midnight.",
    at: 1,
    tiers: ["benefactor", "supporter"],
  },
];

export const galaDetails = [
  {
    label: "When",
    value: `${galaTeaser.dateLabel} · ${galaTeaser.timeLabel}`,
  },
  {
    label: "Where",
    value: galaTeaser.venueLine,
  },
  {
    label: "Dress",
    value: galaTeaser.attire,
  },
  {
    label: "Details",
    value: galaTeaser.statusLabel,
  },
];

export const mcaPhotoSlots = [
  {
    id: "atrium",
    label: "Official MCA photo",
    detail: "Atrium / Event space",
    src: "/images/gala/2026/mca-atrium-event-space.jpg",
    alt: "MCA Chicago event space arranged for a formal dinner with white draping, flowers, and gold chairs",
    objectPosition: "50% 56%",
    candidateUrl: "https://media.mcachicago.org/image/LDF45PK6/original.jpg",
  },
  {
    id: "facade",
    label: "Official MCA photo",
    detail: "MCA facade / Chicago Avenue",
    src: "/images/gala/2026/mca-terrace-lake-view.jpg",
    alt: "MCA Chicago facade at dusk with the museum entrance and illuminated MCA signage",
    objectPosition: "50% 50%",
    candidateUrl: "https://media.mcachicago.org/image/LDF46JNU/original.png",
  },
  {
    id: "sculptureGarden",
    label: "Official MCA photo",
    detail: "Sculpture Garden",
    src: "/images/gala/2026/mca-sculpture-garden.jpg",
    alt: "Yellow contemporary sculptures on the MCA Chicago terrace with trees and city buildings behind them",
    objectPosition: "50% 50%",
    candidateUrl: "https://media.mcachicago.org/image/LDF48JZ7/original.jpg",
  },
  {
    id: "exterior",
    label: "Official MCA photo",
    detail: "Outdoor terrace / downtown skyline",
    src: "/images/gala/2026/mca-exterior-downtown.jpg",
    alt: "MCA Chicago exterior courtyard set for an outdoor event beneath downtown high-rises",
    objectPosition: "50% 68%",
    candidateUrl: "https://media.mcachicago.org/image/LDF44EWZ/original.jpg",
  },
];

export const galaPhotos = Object.fromEntries(
  mcaPhotoSlots.map((slot) => [slot.id, slot]),
);

export const mcaSourceLinks = [
  {
    label: "MCA rentals",
    url: "https://mcachicago.org/rentals",
  },
  {
    label: "MCA visit and address",
    url: "https://visit.mcachicago.org/",
  },
  {
    label: "MCA building",
    url: "https://mcachicago.org/about/building",
  },
];

// Impact figures shown on the gala page (and condensed on the homepage) to make
// the fundraising case. Numbers are from the community announcement and should
// stay exact. `to` is the integer the count-up animates to; `short` is the
// condensed homepage label.
export const galaImpactIntro = {
  eyebrow: "Why we gather",
  heading: "The movement your seat fuels",
  body: "What began as a mission to normalize yoga in underserved communities has become a movement. Every ticket, sponsorship, and gift expands accessible wellness across Chicago, so we can reach even more of our comunidad.",
};

export const galaImpact = [
  {
    to: 7,
    prefix: "",
    suffix: "x",
    useComma: false,
    label: "Monthly check-in growth",
    sublabel: "From 460 to nearly 3,500 in our first year",
    short: "7x growth",
  },
  {
    to: 28000,
    prefix: "~",
    suffix: "",
    useComma: true,
    label: "Class visits delivered",
    sublabel: "Movement woven into everyday life",
    short: "~28K class visits",
  },
  {
    to: 5000,
    prefix: "",
    suffix: "+",
    useComma: true,
    label: "Free or discounted classes",
    sublabel: "Funded by our community campaigns",
    short: "5,000+ free classes",
  },
  {
    to: 500,
    prefix: "~",
    suffix: "",
    useComma: false,
    label: "Neighbors served",
    sublabel: "Through 20 nonprofit partnerships",
    short: "~500 neighbors served",
  },
];
