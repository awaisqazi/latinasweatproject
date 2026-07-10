// Sweat Fest 2026: single source of truth for every Sweat Fest surface
// (homepage teaser, links card, events feature, /sweatfest page, graphics).
//
// Several facts are still being finalized by the team. Every TBD is marked:
//   - venueName is null until the location is announced.
//   - ticketsUrl is null until the Zeffy ticketing form is created. When it
//     goes live, set ticketsUrl and flip ticketsOnSale to true; every CTA on
//     every surface updates automatically.
// Prices, times, and sponsorship facts come from the planning doc; keep exact.

export const sweatFest = {
  slug: "sweat-fest",
  title: "Sweat Fest",
  presentedBy: "Presented by Latina Sweat Project",
  // Kickoff 5K starts the day at 7:00 AM Chicago time.
  startsAtISO: "2026-08-22T07:00:00-05:00",
  dateLabel: "Saturday, August 22, 2026",
  shortDateLabel: "Aug 22",
  timeLabel: "7:00 AM to 9:00 PM",
  dateTimeLabel: "August 22, 2026 · 7:00 AM to 9:00 PM",
  doorsLine: "Kickoff 5K at 7:00 AM · Doors open 8:30 AM · Final set ends 9:00 PM",
  venueName: null, // TBD: location not announced yet
  venueLine: "Location announced soon · Chicago",
  tagline: "Movement Is Ours",
  taglineSub: "A celebration of wellness, cultura, and connection.",
  motto: "Move Together. Celebrate Culture. Build Community.",
  homepageDescription:
    "One full day of movement: a sunrise 5K, classes until sundown, and a party to close the night.",
  pageDescription:
    "Join us for a full day of sweat opportunities, wellbeing practices, local vendors, and food and drink. Come for one session or stay from the first mile to the last set.",
  pagePath: "/sweatfest",
  ticketsOnSale: false,
  ticketsUrl: null, // TBD: Zeffy ticketing form
  ticketsLabel: "Get Tickets",
  statusLabel: "Tickets on sale soon",
  contactEmail: "collab@latinasweatproject.com",
};

// What to expect on the ground. Kept general on purpose: the run, classes,
// wellbeing practices, vendors, and food + drink are confirmed; specific
// vendors and programming are still being booked.
export const sweatFestExpect = [
  {
    title: "Sweat sessions",
    detail: "45-minute classes all day with LSP instructors.",
  },
  {
    title: "Sunrise 5K",
    detail: "Kick off the day together. All paces welcome.",
  },
  {
    title: "Wellbeing practices",
    detail: "Slow down, recover, and reset between sets.",
  },
  {
    title: "Vendor market",
    detail: "Local makers and community organizations.",
  },
  {
    title: "Food + drink",
    detail: "Fuel up and refuel throughout the day.",
  },
  {
    title: "The party",
    detail: "Celebrate with your comunidad until the final set.",
  },
];

// The arc of the day. `accent` keys the sunrise-to-sunset color coding used
// across surfaces: sunrise = gold, ember = midday coral, dusk = night magenta.
export const sweatFestDay = [
  {
    id: "run",
    accent: "sunrise",
    time: "7:00 to 8:30 AM",
    title: "Run",
    detail:
      "Kickoff 5K with all paces welcome. Walk it, jog it, or chase a PR: we start the day together.",
  },
  {
    id: "sweat",
    accent: "ember",
    time: "9:00 AM to 5:00 PM",
    title: "Sweat",
    detail:
      "45-minute classes starting every hour from 9:00 AM to 5:00 PM. Mix, match, and find your favorites.",
  },
  {
    id: "party",
    accent: "dusk",
    time: "6:00 to 9:00 PM",
    title: "Party",
    detail:
      "The fun begins at 6:00 PM. Celebrate the day with your comunidad; the final set ends at 9:00 PM.",
  },
];

export const sweatFestTickets = {
  onSale: false,
  url: null, // TBD: Zeffy ticketing form
  statusLabel: "Tickets on sale soon",
  tiers: [
    {
      id: "all-day",
      name: "All Day",
      price: 60,
      includes: "Run, Sweat, and Party",
      description:
        "The full arc: the sunrise 5K, classes all day, and the party at night.",
      featured: true,
    },
    {
      id: "run",
      name: "Run",
      price: 25,
      includes: "Kickoff 5K",
      description: "The 7:00 AM 5K, all paces welcome.",
      featured: false,
    },
    {
      id: "sweat-party",
      name: "Sweat & Party",
      price: 50,
      includes: "Classes and the party",
      description: "Every class from 9:00 AM on, plus the night celebration.",
      featured: false,
    },
    {
      id: "party",
      name: "Party",
      price: 30,
      includes: "The night celebration",
      description: "Join us from 6:00 PM for the closing celebration.",
      featured: false,
    },
  ],
};

// Sponsorship program. NOTE: the source doc lists Platinum and Gold benefits
// beyond tickets as "other possible benefits", so surfaces should include the
// finePrint caveat wherever benefits are itemized.
export const sweatFestSponsorship = {
  closesLabel: "Sponsorships close August 12, 2026",
  contactEmail: sweatFest.contactEmail,
  intro:
    "Latina Sweat Project builds access to yoga, holistic health, and culturally rooted movement, rooted in the Latina experience and built for all. What began as classes in Little Village has grown into daily programming on Chicago's Southwest Side, a home for healing and leadership development that now reaches more than 5,000 participants every month.",
  fundsHeading: "What your sponsorship funds",
  funds: [
    "Free and low-cost fitness classes",
    "200-hour teacher training scholarships for BIPOC leaders",
    "Mutual aid and community care programs",
    "The Monday Miles run club and free neighborhood events",
    "Pathways from participant to instructor to leader",
  ],
  tiers: [
    {
      id: "platinum",
      name: "Platinum Sponsor",
      amount: 5000,
      tickets: "20 all day tickets",
      benefits: [
        "Five 10-class packs to LSP",
        "Private class with an LSP instructor, on or off site",
        "Logo or name on the flyer",
        "Logo or name on a stage",
        "Shout out on our website",
        "Shout out on socials",
      ],
      featured: true,
    },
    {
      id: "gold",
      name: "Gold Sponsor",
      amount: 2500,
      tickets: "10 all day tickets",
      benefits: [
        "Two 10-class packs to LSP",
        "Private class with an LSP instructor, on or off site",
        "Logo or name on the flyer",
        "Shout out on our website",
        "Shout out on socials",
      ],
      featured: false,
    },
    {
      id: "community",
      name: "Community Sponsor",
      amount: 1000,
      tickets: "5 all day tickets",
      benefits: [
        "Logo or name on the flyer",
        "Shout out on our website",
        "Shout out on socials",
      ],
      featured: false,
    },
  ],
  finePrint:
    "Final benefit packages are being confirmed. Reach out to shape a custom partnership.",
  ctaHeading: "Reserve your partnership",
  ctaBody:
    "Put your brand at the forefront of the attendee experience as a community champion and partner. Secure your tier before sponsorships close August 12, 2026, or reach out to shape a custom partnership.",
};

// Impact figures for the sponsorship case, 2026 so far. Numbers come from the
// planning doc and should stay exact. `to` is the count-up target.
export const sweatFestImpactIntro = {
  eyebrow: "Your impact",
  heading: "What movement builds, 2026 so far",
  body: "Every ticket and sponsorship expands accessible wellness on Chicago's Southwest Side, so more of our comunidad can move, heal, and lead.",
};

export const sweatFestImpact = [
  {
    to: 28000,
    prefix: "~",
    suffix: "",
    useComma: true,
    label: "Class visits delivered",
    short: "~28K class visits",
  },
  {
    to: 5000,
    prefix: "",
    suffix: "+",
    useComma: true,
    label: "Free or discounted classes",
    short: "5,000+ free classes",
  },
  {
    to: 500,
    prefix: "~",
    suffix: "",
    useComma: false,
    label: "Neighbors served with 20 nonprofit partners",
    short: "~500 neighbors served",
  },
  {
    to: 7,
    prefix: "",
    suffix: "x",
    useComma: false,
    label: "Growth in monthly check-ins",
    short: "7x check-in growth",
  },
];

// Sweat Fest visual identity: the day arc, sunrise to last set. Shared by all
// surfaces so the gradient reads identically everywhere.
export const sweatFestColors = {
  sunrise: "#ffbd59", // brand gold: the 7 AM run
  ember: "#ff6b52", // midday heat: the classes
  dusk: "#e94f8a", // sunset into night: the party
};

// Artwork rendered via the lsp-event-graphics pipeline.
export const sweatFestArt = {
  poster: {
    src: "/images/sweatfest/sweatfest-poster.png", // 4:5 portrait
    alt: "Sweat Fest poster: a full day fitness festival by Latina Sweat Project on August 22, 2026",
  },
  square: {
    src: "/images/sweatfest/sweatfest-card-square.png", // 1:1
    alt: "Sweat Fest, presented by Latina Sweat Project, Saturday August 22, 2026",
  },
};
