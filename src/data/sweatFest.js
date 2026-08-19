// Sweat Fest 2026: single source of truth for every Sweat Fest surface
// (homepage teaser, links card, events feature, /sweatfest page, graphics).
//
// Several facts are still being finalized by the team. Every TBD is marked:
//   - venueName/venueLine announced 2026-07-27: 18th & Peoria (Pilsen).
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
  venueName: "18th & Peoria", // announced 2026-07-27
  venueLine: "18th & Peoria · Chicago",
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
    detail: "45-minute classes all day on two stages with LSP and guest instructors.",
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
    title: "Pachanga",
    detail: "Dance, connect, and celebrate with your comunidad until the final set.",
  },
];

// The arc of the day. `accent` keys the color coding used across surfaces,
// drawn from the logo tiles: rosa = magenta, cielo = teal, lima = green.
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

// Run of show: the two-stage class schedule, transcribed from the team's
// schedule grid + "Sweat Fest Class Details" doc (2026-08-15). Every class is
// 45 minutes. `stage` is "West" or "East"; `lsp: true` marks LSP instructors,
// guests carry their studio in `affiliation`. `handles` are Instagram.
export const sweatFestLineup = [
  {
    id: "jays-power-hour",
    start: "9:00 AM",
    timeLabel: "9:00 to 9:45 AM",
    stage: "West",
    title: "Jay's Power Hour",
    instructor: "Julio Peña",
    lsp: true,
    affiliation: "LSP",
    handles: ["@jaymerazz"],
    description:
      "A high-intensity workout focused on building muscular strength and endurance. This class utilizes various equipment and bodyweight exercises to challenge your limits and boost your power.",
  },
  {
    id: "yoga-party",
    start: "9:00 AM",
    timeLabel: "9:00 to 9:45 AM",
    stage: "East",
    title: "Yoga Party",
    instructor: "Josh Young",
    lsp: false,
    affiliation: "Studio Three",
    handles: ["@yehme2"],
    description:
      "Yoga Party is an energizing, music-driven vinyasa experience designed to make yoga feel a little less serious and more fun. Expect an accessible, all-levels flow set to a mix of high-energy club music, rap/R&B, and soundscapes, with plenty of room to move, breathe, and get creative.",
  },
  {
    id: "slow-grow",
    start: "10:00 AM",
    timeLabel: "10:00 to 10:45 AM",
    stage: "West",
    title: "Slow + Grow",
    instructor: "Greg Buford",
    lsp: false,
    affiliation: "Train Moment",
    handles: ["@growthwithgreg"],
    description:
      "This class methodically introduces exercises to wake up and develop neuromuscular awareness, followed by higher intensity and compound movements to deliver a great muscular pump.",
  },
  {
    id: "hiit-pilates",
    start: "10:00 AM",
    timeLabel: "10:00 to 10:45 AM",
    stage: "East",
    title: "HIIT Pilates with LIZLATES",
    instructor: "LIZLATES",
    lsp: true,
    affiliation: "LSP",
    handles: ["@lizlates"],
    description:
      "High Intensity Interval Training but make it Pilates with LIZLATES. Classically known as Inferno Hot Pilates, get ready for a full body, low impact workout that uses Pilates Principles. Yes, you'll get a core and booty burn and yes, there will be burpees!",
  },
  {
    id: "yoga-sculpt",
    start: "11:00 AM",
    timeLabel: "11:00 to 11:45 AM",
    stage: "West",
    title: "Yoga Sculpt with Jax",
    instructor: "Jackie Terrazas",
    lsp: false,
    affiliation: "We The People",
    handles: ["@yogawithjax_"],
    description:
      "A high-energy, beginner-friendly Yoga Sculpt class that combines traditional yoga flows, cardio bursts, and strength training. This workout is designed to leave you feeling energized, stronger, and more confident, all while moving to your favorite Latin and Tech House beats!",
  },
  {
    id: "full-body-strength",
    start: "11:00 AM",
    timeLabel: "11:00 to 11:45 AM",
    stage: "East",
    title: "Full Body Strength & Conditioning",
    instructor: "Brookie Trinity",
    lsp: false,
    affiliation: "In The Yards",
    handles: ["@brookietrinity"],
    description:
      "Join Brookie for a bodyweight strength and conditioning class. Class includes bodyweight movements targeting strength, cardiovascular training and mobility.",
  },
  {
    id: "sound-bath-rhythm",
    start: "11:45 AM",
    timeLabel: "11:45 AM to 12:30 PM",
    stage: "East",
    title: "Sound Bath to Find Your Rhythm",
    instructor: "Courtney Olender",
    lsp: false,
    affiliation: "Six and Twelfth Sound",
    handles: ["@courtneythevirgo"],
    description:
      "This sound bath is an invitation to slow down, reconnect with your body, and find balance between movement and rest. Through sound, stillness, and a simple grounding practice, you'll explore nervous system care in a way that feels approachable, restorative, and easy to carry with you beyond the session.",
  },
  {
    id: "slow-burn",
    start: "12:30 PM",
    timeLabel: "12:30 to 1:15 PM",
    stage: "West",
    title: "Slow Burn: A Pilates Flow",
    instructor: "Dr. Alyssa Perez",
    lsp: false,
    affiliation: "Inner Sol Studio Chi",
    handles: ["@innersolstudiochi"],
    description:
      "Don't let the name fool you! This class will challenge you in all the best ways. Experience the Pilates burn through intentional, full body movement that builds deep core strength, improves mobility, and leaves you feeling stronger from the inside out. Expect mindful movement, powerful fundamentals, and a feel good flow that's accessible to all levels.",
  },
  {
    id: "yoga-flow",
    start: "12:30 PM",
    timeLabel: "12:30 to 1:15 PM",
    stage: "East",
    title: "Yoga Flow",
    instructor: "Gerald Pinckney",
    lsp: true,
    affiliation: "LSP",
    handles: ["@pick_a_g"],
    description:
      "A smooth, continuous sequence of yoga postures synchronized with breath. This class is designed to build heat, flexibility, and strength, leaving you feeling centered and energized.",
  },
  {
    id: "yoga-para-todos",
    start: "1:30 PM",
    timeLabel: "1:30 to 2:15 PM",
    stage: "West",
    title: "Yoga para Todos",
    instructor: "Zoraida Magana",
    lsp: true,
    affiliation: "LSP",
    handles: ["@zorita_22"],
    description:
      "Una práctica accesible, sin importar tu experiencia, que te invita a moverte con intención, respirar profundamente y encontrar un momento de conexión contigo mismo. A través de diferentes opciones y variaciones, cada persona podrá practicar de una forma segura, respetando las necesidades de su cuerpo.",
  },
  {
    id: "mixxedfit",
    start: "1:30 PM",
    timeLabel: "1:30 to 2:15 PM",
    stage: "East",
    title: "MixxedFit with IL National Trainer",
    instructor: "Nana Sahagun",
    lsp: false,
    affiliation: "Mi Flow Studio",
    handles: ["@nanasahagun"],
    description:
      "A people-inspired fitness program that combines explosive dance moves with body weight toning. A format that brings the people together through fitness while serving our communities!",
  },
  {
    id: "restorative-sound-bath",
    start: "2:15 PM",
    timeLabel: "2:15 to 3:00 PM",
    stage: "East",
    title: "Restorative Sound Bath",
    instructor: "Kari Sanchez",
    lsp: true,
    affiliation: "LSP",
    handles: ["@karilavegana"],
    description:
      "A 45-minute heart-centered sound bath inviting you to slow down and enjoy the healing vibrations of crystal singing bowls. Come ready to unwind, reconnect with yourself, and return to self-love and presence.",
  },
  {
    id: "banda-sculpt",
    start: "3:00 PM",
    timeLabel: "3:00 to 3:45 PM",
    stage: "West",
    title: "Banda Sculpt",
    instructor: "Veronica Quiñones",
    lsp: true,
    affiliation: "LSP",
    handles: ["@veroq2"],
    description:
      "A dynamic fusion of yoga and strength training, set to the rhythms of banda music. This class tones and sculpts the body while flowing through yoga poses, boosting metabolism and building lean muscle, all with an energy that feels like a celebration.",
  },
  {
    id: "reset-release",
    start: "3:00 PM",
    timeLabel: "3:00 to 3:45 PM",
    stage: "East",
    title: "Reset & Release",
    instructor: "Paulo Colby",
    lsp: false,
    affiliation: "The Practice Club",
    handles: ["@pauloinpractice"],
    description:
      "A guided mobility session to loosen tight joints and release tension built up from a day of standing, dancing, and travel. We'll move through targeted stretches, joint mobilization, and breathwork to help your body recover and feel ready for what's next. All levels welcome, no experience required.",
  },
  {
    id: "salsa-self-soul",
    start: "4:00 PM",
    timeLabel: "4:00 to 4:45 PM",
    stage: "West",
    title: "Salsa, Self & Soul",
    instructor: "Maria Luisa Torres",
    lsp: false,
    affiliation: "",
    handles: ["@marialuisadance"],
    description:
      "What makes you, you? What do you love about yourself? Come connect to your body, confidence, and soul through the power of salsa dancing as we move with intention, reconnect with ourselves, and learn some salsa con sabor. No partner necessary, just bring your authentic self, buenas vibras, and an openness to move, express, and celebrate YOU.",
  },
  {
    id: "ring-ready-hiit",
    start: "4:00 PM",
    timeLabel: "4:00 to 4:45 PM",
    stage: "East",
    title: "Ring Ready HIIT",
    instructor: "Jeff Williams",
    lsp: false,
    affiliation: "Flow Boxing Academy",
    handles: ["@flawless773", "@flow_boxing_academy"],
    description:
      "This action-packed class combines explosive HIIT circuits with boxing basics to deliver a full body workout that challenges both mind and body. Whether you're throwing your first jab or sharpening your skills, you'll leave feeling stronger, faster, and ready for the next round.",
  },
  {
    id: "mat-pilates",
    start: "5:00 PM",
    timeLabel: "5:00 to 5:45 PM",
    stage: "West",
    title: "Mat Pilates",
    instructor: "Margarita Quiñones",
    lsp: true,
    affiliation: "LSP",
    handles: ["@mquino4"],
    description:
      "A core focused workout based on the principles of Joseph Pilates. This class strengthens the abdominal muscles, improves posture, and increases overall body awareness and stability, all performed on a mat.",
  },
  {
    id: "wobble-baby-wobble",
    start: "5:00 PM",
    timeLabel: "5:00 to 5:45 PM",
    stage: "East",
    title: "Wobble Baby Wobble: Balance Flow",
    instructor: "Krystal Fernandez",
    lsp: true,
    affiliation: "LSP",
    handles: ["@yogawitha_k"],
    description:
      "Find focus, centering, and plenty of giggles as we wobble through different poses. We'll flow through balance poses that challenge our bodies until we can't wobble anymore!",
  },
];

// The non-class moments that frame the day: the 5K, doors, and the DJ booth.
// Times come from the same schedule grid. `stage` only where the grid puts
// the set on a specific stage.
export const sweatFestMoments = [
  { timeLabel: "7:00 AM", title: "Kickoff 5K", detail: "All paces welcome." },
  {
    timeLabel: "8:00 to 10:00 AM",
    title: "DJ CamiSoul",
    stage: "West",
    dj: true,
    detail: "Opening set while the 5K wraps and doors open.",
  },
  { timeLabel: "8:30 AM", title: "Doors open", detail: "" },
  {
    timeLabel: "2:15 to 3:00 PM",
    title: "DJ Solita",
    stage: "West",
    dj: true,
    detail: "EDM and tech set.",
  },
  {
    timeLabel: "6:00 to 7:30 PM",
    title: "DJ Boppin",
    dj: true,
    detail: "A mix of music as the Pachanga takes over.",
  },
  {
    timeLabel: "7:30 to 9:00 PM",
    title: "DJ Gonzo",
    dj: true,
    detail: "A mix of music through the final set.",
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

// Sweat Fest visual identity, taken straight from the team's official logo:
// flat solid color blocks on a honeydew field, framed by a multicolor
// checkerboard tile border, with handmade distressed display lettering.
// The legacy sunrise/ember/dusk keys stay so every surface keeps working;
// they now point at magenta / orange / teal. The phase keys (rosa / cielo /
// lima) color the itinerary cards: Run = magenta, Sweat = teal,
// Pachanga = green, matching the wordmark and X mark.
export const sweatFestColors = {
  sunrise: "#ee3083", // brand magenta: the LSP X, primary CTAs
  ember: "#f15b27", // orange checker tile: accents
  dusk: "#00a7ab", // teal checker tile: night shadows and the Pachanga
  rosa: "#ee3083", // Run card
  cielo: "#00a7ab", // Sweat card
  lima: "#60a444", // Pachanga card
};

// The full logo palette for one-off surfaces (poster art, page backdrops).
// Every hex is lifted from src/assets/sweatfest/logo-stacked.svg except the
// ink, the derived deep teal-green used for type on the light grounds.
export const sweatFestPalette = {
  honeydew: "#e2ecac", // the logo's background field
  paper: "#f4f7dc", // paler honeydew for cards and chips
  ink: "#123f36", // derived deep teal-green: all type on light grounds
  magenta: "#ee3083",
  rosa: "#f6a9c8",
  naranja: "#f15b27",
  teal: "#00a7ab",
  verde: "#60a444", // the wordmark letters
};

// Public Google Form backing the native, on-theme volunteer application on
// /sweatfest. Keep option strings character-for-character aligned with Google
// Forms: checkbox values are matched by their labels when posted.
export const sweatFestVolunteer = {
  // Sign-ups closed 2026-08-14. Flip back to true to reopen the form; the
  // Google Form itself stays live at viewUrl/postUrl either way, so close it
  // separately at forms.google.com if it must stop accepting responses too.
  open: false,
  closedMessage:
    "Volunteer sign-ups for Sweat Fest are closed. Thank you to everyone who applied: our team is reviewing applications and will follow up with selected volunteers about shifts and training.",
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

// Checkerboard tile strip, tiled as a CSS background by the `.sf-picado`
// utility (see global.css): the logo's multicolor border rhythm run out flat
// as a section divider. Two rows of 26px squares in a 156x52 tile, the second
// row offset three columns so the colors interlock like the logo frame.
// Works over any background: honeydew, paper, or the dark Pachanga band.
const checkerColors = [
  sweatFestPalette.magenta,
  sweatFestPalette.rosa,
  sweatFestPalette.naranja,
  sweatFestPalette.teal,
  sweatFestPalette.verde,
  sweatFestPalette.honeydew,
];
const checkerRow = (y, offset) =>
  checkerColors
    .map(
      (_, i) =>
        `<rect x="${i * 26}" y="${y}" width="26" height="26" fill="${
          checkerColors[(i + offset) % checkerColors.length]
        }"/>`,
    )
    .join("");
const checkerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="156" height="52" viewBox="0 0 156 52">${checkerRow(0, 0)}${checkerRow(26, 3)}</svg>`;
export const sweatFestCheckerUri = `url("data:image/svg+xml,${encodeURIComponent(checkerSvg)}")`;
// Legacy aliases: older surfaces import the strip under its rainbow and
// papel picado names. Every one of them just tiles whatever ships here.
export const sweatFestRainbowUri = sweatFestCheckerUri;
export const sweatFestPicadoUri = sweatFestCheckerUri;

// Day-of program: the digital version of the printed program carousel
// (schedule summary, festival map, packing list, transportation). Lives at
// /sweatfest/program, the URL every program QR code points to. Facts come
// from the team's program graphics (2026-08-19); keep exact.
export const sweatFestProgram = {
  path: "/sweatfest/program",
  canonicalUrl: "https://latinasweatproject.com/sweatfest/program",
  heading: "Sweat Fest Program",
  intro:
    "Everything you need for the day: the schedule, the festival map, what to bring, and how to get here.",
  // The at-a-glance arc of the day, matching the printed schedule card.
  glance: [
    { time: "7:00 AM", title: "Kickoff 5K" },
    { time: "8:30 AM", title: "Doors open" },
    { time: "9:00 AM to 6:00 PM", title: "Sweat classes" },
    { time: "6:00 to 9:00 PM", title: "Pachanga" },
  ],
  packing: {
    items: [
      "Water bottle",
      "Yoga mat",
      "Beach towel",
      "Sunscreen",
      "Comfortable clothing",
      "Positive energy",
    ],
    // Optional footnote rendered under the checklist when present.
    // "No outside food permitted" was dropped 2026-08-19: not a rule the
    // team is holding firm on.
    note: "",
  },
  // `places` power the Google/Apple Maps destination links on each mode:
  // `q` is the search query both map apps receive.
  transportation: [
    {
      id: "train",
      title: "Train",
      lines: [
        "Pink Line 18th Station (25 minute walk)",
        "or connect to the 18 Bus at the station",
      ],
      places: [
        {
          label: "18th Station (Pink Line)",
          q: "CTA 18th Station, 1710 W 18th St, Chicago, IL",
        },
      ],
    },
    {
      id: "bus",
      title: "Bus",
      lines: [
        "18 Bus runs along 18th St, stops at 18th & Peoria (entrance)",
        "8 Bus runs along Halsted, stops at Halsted & 18th (2 minute walk)",
      ],
      places: [
        {
          label: "18 Bus stop · 18th & Peoria",
          q: "W 18th St & S Peoria St, Chicago, IL",
        },
        {
          label: "8 Bus stop · Halsted & 18th",
          q: "S Halsted St & W 18th St, Chicago, IL",
        },
      ],
    },
    {
      id: "bike",
      title: "Bike",
      lines: [
        "Divvy station at 18th & Halsted (2 minute walk)",
        "Divvy station at 18th & Morgan (2 minute walk)",
      ],
      places: [
        {
          label: "Divvy · 18th & Halsted",
          q: "Divvy Station Halsted St & 18th St, Chicago, IL",
        },
        {
          label: "Divvy · 18th & Morgan",
          q: "Divvy Station Morgan St & 18th St, Chicago, IL",
        },
      ],
    },
    {
      id: "metra",
      title: "Metra",
      lines: [
        "Halsted St Metra Station (BNSF)",
        "Located at 16th & Halsted (5 minute walk)",
      ],
      places: [
        {
          label: "Halsted St Metra Station",
          q: "Halsted Metra Station, W 16th St & S Halsted St, Chicago, IL",
        },
      ],
    },
    {
      id: "parking",
      title: "Parking",
      lines: [
        "Limited free parking at Jungman School (5 minute walk)",
        "Free and metered street parking available in the area",
      ],
      places: [
        {
          label: "Jungman School parking",
          q: "Jungman Elementary School, 1746 S Miller St, Chicago, IL",
        },
      ],
    },
  ],
  // The festival entrance itself, for the "set your destination" card.
  entrancePlace: {
    label: "Festival entrance · 18th & Peoria",
    q: "W 18th St & S Peoria St, Chicago, IL",
  },
  map: {
    closuresHeading: "Street closures · no vehicle access",
    closures: [
      "W 16th St between S Morgan St & S Halsted St",
      "S Peoria St between W 16th St & W 18th St",
    ],
    // Points of interest on the festival footprint. `kind` keys the marker
    // treatment on the interactive map: stage | poi | access.
    pois: [
      {
        id: "west-stage",
        kind: "stage",
        label: "West Stage",
        detail: "Classes and DJ sets on W 16th St toward S Morgan St.",
      },
      {
        id: "east-stage",
        kind: "stage",
        label: "East Stage",
        detail: "Classes and sound baths on W 16th St toward S Halsted St.",
      },
      {
        id: "check-in",
        kind: "access",
        label: "Check-in",
        detail: "Just inside the 18th & Peoria entrance. Start here.",
      },
      {
        id: "entrance",
        kind: "access",
        label: "Entrance + exit",
        detail: "On S Peoria St at W 18th St.",
      },
      {
        id: "info",
        kind: "poi",
        label: "Information",
        detail: "Mid-block on S Peoria St. Questions, lost & found.",
      },
      {
        id: "rest",
        kind: "poi",
        label: "Rest area",
        detail: "Shaded seating on S Peoria St between check-in and info.",
      },
      {
        id: "water-west",
        kind: "poi",
        label: "Water station · west",
        detail: "On W 16th St near the West Stage.",
      },
      {
        id: "water-east",
        kind: "poi",
        label: "Water station · east",
        detail: "On W 16th St near the East Stage.",
      },
      {
        id: "food",
        kind: "poi",
        label: "Food + drinks",
        detail: "On W 16th St west of S Peoria St.",
      },
      {
        id: "vendors",
        kind: "poi",
        label: "Vendors + activations",
        detail: "On W 16th St east of S Peoria St.",
      },
      {
        id: "bathrooms",
        kind: "poi",
        label: "Bathrooms + hand washing",
        detail: "At W 16th St & S Peoria St.",
      },
      {
        id: "first-aid",
        kind: "poi",
        label: "First aid",
        detail: "On W 16th St near the East Stage.",
      },
    ],
  },
};

// Rendered copies of the flyer (drawn live on the site by
// SweatFestArtwork.astro from sweatFestPoster.js) for social sharing and OG
// cards. Re-render with scripts/render-sweatfest-social.mjs after art or fact
// changes.
export const sweatFestArt = {
  hero: {
    src: "/images/sweatfest/sweatfest-social-v4.jpg", // 16:9 OG/social card
    width: 1200,
    height: 675,
    alt: "Sweat Fest flyer: the checkerboard-bordered Sweat Fest logo over the event facts for August 22, 2026 in Chicago",
  },
  poster: {
    src: "/images/sweatfest/sweatfest-poster-v4.webp", // 4:5 portrait
    width: 1080,
    height: 1350,
    alt: "Sweat Fest flyer: the checkerboard-bordered Sweat Fest logo above date, place, and time chips",
  },
  square: {
    src: "/images/sweatfest/sweatfest-card-v4.webp", // 1:1
    width: 1080,
    height: 1080,
    alt: "Sweat Fest flyer: the checkerboard-bordered Sweat Fest logo above date, place, and time chips",
  },
};
