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
    accent: "rosa",
    time: "7:00 to 8:30 AM",
    title: "Run",
    detail:
      "Kickoff 5K with all paces welcome. Walk it, jog it, or chase a PR: we start the day together.",
  },
  {
    id: "sweat",
    accent: "cielo",
    time: "9:00 AM to 5:00 PM",
    title: "Sweat",
    detail:
      "45-minute classes starting every hour from 9:00 AM to 5:00 PM. Mix, match, and find your favorites.",
  },
  {
    id: "party",
    accent: "lima",
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

// Sweat Fest '26 visual identity (retro-rainbow, from the 2026 Canva kit):
// '70s rainbow arches over cream, chocolate ink, butter-yellow badges.
// The legacy sunrise/ember/dusk keys stay so every surface keeps working;
// they now point at the kit's butter / orange / bubblegum trio. The phase
// keys (rosa / cielo / lima) color the itinerary cards like the flyer:
// El Run = pink, El Sweat = sky blue, La Pachanga = green.
export const sweatFestColors = {
  sunrise: "#f2cf6b", // butter yellow: badges and CTAs
  ember: "#ef8f3e", // '70s orange: rainbow + accents
  dusk: "#e8749e", // bubblegum pink: rainbow + the Pachanga at night
  rosa: "#ef9db6", // El Run card
  cielo: "#7ec3ed", // El Sweat card
  lima: "#9cc15d", // La Pachanga card
};

// The full retro palette for one-off surfaces (poster art, page backdrops).
export const sweatFestPalette = {
  sky: "#8fd0f4",
  cream: "#f3eee5",
  paper: "#fdf8ec",
  chocolate: "#40291a",
  butter: "#f2cf6b",
  mustard: "#f0aa4a",
  tan: "#b9a794",
  pink: "#ef9db6",
  orange: "#ef8f3e",
  green: "#9cc15d",
  blue: "#7ec3ed",
};

// Public Google Form backing the native, on-theme volunteer application on
// /sweatfest. Keep option strings character-for-character aligned with Google
// Forms: checkbox values are matched by their labels when posted.
export const sweatFestVolunteer = {
  viewUrl:
    "https://docs.google.com/forms/d/e/1FAIpQLSdtghuy_d7HXOpK9SINHCFg_nKg-a6MomOQd1mDe0eaK-iTeQ/viewform",
  postUrl:
    "https://docs.google.com/forms/d/e/1FAIpQLSdtghuy_d7HXOpK9SINHCFg_nKg-a6MomOQd1mDe0eaK-iTeQ/formResponse",
  entries: {
    fullName: "entry.871482363",
    email: "entry.1558654196",
    phone: "entry.1054238402",
    shifts: "entry.2140327823",
    roles: "entry.799969201",
    motivation: "entry.1437478280",
    experience: "entry.930074439",
    accessibility: "entry.1797729039",
    acknowledgement: "entry.699238784",
  },
  shifts: [
    "6:00-8:00 AM (setup + 5K)",
    "8:00-10:00 AM",
    "10:00 AM-12:00 PM",
    "12:00-2:00 PM",
    "2:00-4:00 PM",
    "4:00-6:00 PM",
    "6:00-8:00 PM",
    "8:00-10:00 PM (closing + cleanup)",
  ],
  roles: [
    "Event setup",
    "Check-in + guest welcome",
    "5K/course support",
    "Class + activity support",
    "Vendor + community partner support",
    "Hydration + hospitality",
    "Pachanga support",
    "Cleanup",
    "Wherever needed",
  ],
  acknowledgements: [
    "I understand that this application is not a guarantee of placement.",
    "I agree to attend required pre-event training if selected.",
    "I consent to being contacted by the Latina Sweat Project regarding selection, scheduling, and training.",
  ],
};

// Rainbow-scallop strip, tiled as a CSS background by the `.sf-picado`
// utility (see global.css): a row of little '70s rainbow arches hanging
// from a chocolate rule, replacing the old papel picado bunting. Works over
// any background: cream, sky, or the dark Pachanga band.
const rainbowArch = (cx) =>
  `<circle cx="${cx}" cy="2" r="48" fill="${sweatFestPalette.chocolate}"/>` +
  `<circle cx="${cx}" cy="2" r="44" fill="${sweatFestPalette.green}"/>` +
  `<circle cx="${cx}" cy="2" r="33" fill="${sweatFestPalette.pink}"/>` +
  `<circle cx="${cx}" cy="2" r="22" fill="${sweatFestPalette.orange}"/>` +
  `<circle cx="${cx}" cy="2" r="11" fill="${sweatFestPalette.butter}"/>`;
const rainbowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="208" height="52" viewBox="0 0 208 52"><path d="M0 2h208" stroke="${sweatFestPalette.chocolate}" stroke-width="4"/>${rainbowArch(52)}${rainbowArch(156)}</svg>`;
export const sweatFestRainbowUri = `url("data:image/svg+xml,${encodeURIComponent(rainbowSvg)}")`;
// Legacy alias: older surfaces import the strip under its papel picado name.
export const sweatFestPicadoUri = sweatFestRainbowUri;

// Rendered copies of the retro-rainbow '26 flyer (drawn live on the site by
// SweatFestArtwork.astro from sweatFestPoster.js) for social sharing and OG
// cards. Re-render with scripts/render-sweatfest-social.mjs after art or fact
// changes.
export const sweatFestArt = {
  hero: {
    src: "/images/sweatfest/sweatfest-social-v3.jpg", // 16:9 OG/social card
    width: 1200,
    height: 675,
    alt: "Sweat Fest '26 flyer: a retro rainbow arch over the event facts for August 22, 2026 in Chicago",
  },
  poster: {
    src: "/images/sweatfest/sweatfest-poster-v3.webp", // 4:5 portrait
    width: 1080,
    height: 1350,
    alt: "Sweat Fest '26 flyer: retro rainbow arch, bubble wordmark, and butter-yellow info badges",
  },
  square: {
    src: "/images/sweatfest/sweatfest-card-v3.webp", // 1:1
    width: 1080,
    height: 1080,
    alt: "Sweat Fest '26 flyer: retro rainbow arch, bubble wordmark, and butter-yellow info badges",
  },
};
