// Sweat Fest 2026: single source of truth for every Sweat Fest surface
// (homepage teaser, links card, events feature, /sweatfest page, graphics).
//
// Several facts are still being finalized by the team. Every TBD is marked:
//   - venueName is null until the location is announced.
//   - Tickets went live on Zeffy 2026-07-12 (ticketsOnSale: true); every CTA
//     on every surface reads from ticketsUrl.
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
    "Start with a sunrise 5K, move through classes and wellbeing experiences, then close the night at the Pachanga.",
  pageDescription:
    "Chicago, this is our first-ever all-day movement festival: a sunrise 5K, sweat sessions, wellbeing experiences, local vendors, food, and a closing Pachanga.",
  pagePath: "/sweatfest",
  calendarPath: "/sweat-fest-2026.ics",
  ticketsOnSale: true,
  ticketsUrl:
    "https://www.zeffy.com/en-US/ticketing/sweat-fest-2026-movement-is-ours",
  ticketsLabel: "Get Tickets",
  statusLabel: "Tickets on sale now",
  contactEmail: "rut@latinasweatproject.com",
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
    title: "The Pachanga",
    detail: "Dance, connect, and celebrate with your comunidad until the final set.",
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
    title: "Pachanga",
    detail:
      "The Pachanga begins at 6:00 PM. Dance and celebrate with your comunidad; the final set ends at 9:00 PM.",
  },
];

export const sweatFestTickets = {
  // Derive launch state from the top-level event record so one future edit
  // activates every ticket surface consistently.
  onSale: sweatFest.ticketsOnSale,
  url: sweatFest.ticketsUrl,
  statusLabel: sweatFest.statusLabel,
  tiers: [
    {
      id: "all-day",
      name: "All Day",
      price: 60,
      includes: "Run, Sweat, and Pachanga",
      description:
        "The full arc: the sunrise 5K, classes all day, and the Pachanga at night.",
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
      name: "Sweat & Pachanga",
      price: 50,
      includes: "Classes and the Pachanga",
      description: "Every class from 9:00 AM on, plus the night celebration.",
      featured: false,
    },
    {
      id: "party",
      name: "Pachanga",
      price: 30,
      includes: "The night celebration",
      description: "Join us from 6:00 PM for the closing celebration.",
      featured: false,
    },
  ],
};

// Sponsorship program. The three benefit packages retain their original order
// while moving to the 2026 tier names and prices: the former Platinum package
// is now Sponsoring Partner, former Gold is now Platinum, and former Community
// is now Gold. Surfaces should include the finePrint caveat wherever benefits
// are itemized.
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
      id: "sponsoring-partner",
      name: "Sponsoring Partner",
      amount: 10000,
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
      id: "platinum",
      name: "Platinum Sponsor",
      amount: 5000,
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
      id: "gold",
      name: "Gold Sponsor",
      amount: 2500,
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
  dusk: "#e94f8a", // sunset into night: the Pachanga
};

// Papel picado bunting, tiled as a CSS background by the `.sf-picado`
// utility (see global.css). Each flag is a single evenodd path so the
// diamond cutouts are true holes and the strip works over any background:
// cream, white, or the dark Pachanga band. One flag per arc color.
const picadoFlag = (color) =>
  `<path fill="${color}" fill-rule="evenodd" d="M0 0h60v34l-7.5 8-7.5-8-7.5 8-7.5-8-7.5 8-7.5-8-7.5 8-7.5-8zM30 10l8 9-8 9-8-9zM12 14l4 4-4 4-4-4zM48 14l4 4-4 4-4-4z"/>`;
const picadoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="216" height="52" viewBox="0 0 216 52"><path d="M0 3h216" stroke="rgba(30,30,30,0.45)" stroke-width="1.5"/><g transform="translate(6 3)">${picadoFlag(sweatFestColors.sunrise)}</g><g transform="translate(78 3)">${picadoFlag(sweatFestColors.ember)}</g><g transform="translate(150 3)">${picadoFlag(sweatFestColors.dusk)}</g></svg>`;
export const sweatFestPicadoUri = `url("data:image/svg+xml,${encodeURIComponent(picadoSvg)}")`;

// Campaign artwork contains no generated lettering or logo. The exact LSP
// mark and all event copy are layered in HTML by SweatFestArtwork.astro.
export const sweatFestArt = {
  hero: {
    src: "/images/sweatfest/sweatfest-hero-v2.webp", // 16:9 landscape
    width: 1600,
    height: 900,
    alt: "Editorial illustration of a multigenerational Chicago community running, stretching, and dancing together at Sweat Fest",
  },
  poster: {
    src: "/images/sweatfest/sweatfest-poster-v2.webp", // 4:5 portrait
    width: 1080,
    height: 1350,
    alt: "Editorial illustration of a joyful, inclusive Chicago movement festival with runners, fitness, and yoga",
  },
  square: {
    src: "/images/sweatfest/sweatfest-card-v2.webp", // 1:1
    width: 1080,
    height: 1080,
    alt: "Editorial illustration of a joyful, inclusive Chicago movement festival from sunrise to celebration",
  },
};
