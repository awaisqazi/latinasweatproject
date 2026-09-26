// Annual Gala 2026 recap: the thank-you of record and the results snapshot.
//
// Every number here was pulled on 2026-09-26 (the morning after) from three
// sources and frozen as static data, because the live gala tables are purged
// after the event (PII purge, see docs/gala-2026/06 s12) and the Zeffy forms
// close:
//   - the paddle raise: our own night-of tool (`gala_event_donations`,
//     event `gala-2026`, non-voided rows). The tool holds 41 rows; the
//     organizer's ruling on 2026-09-26: only Dave's $5,000 pledge counts,
//     the second $5,000 row is not, so 40 gifts are published. The $500 row
//     recorded without a paddle number stays (the room saw it on the
//     projector total).
//   - the silent auction and Give Tonight: the two Zeffy exports of
//     2026-09-26 (Succeeded payments only; Incomplete checkouts excluded)
//   - tickets and attendance: the Zeffy ticketing export + the check-in tool
// Never put donor, bidder or guest names in this file: results are shown as
// aggregates and levels only. Honorees, featured voices, sponsors, designers
// and auction donors are public (printed in the program / on the projector).

export const galaRecap = {
  eyebrow: "That's a wrap · Annual Gala 2026",
  heading: "Gracias, comunidad",
  dateLine: "Friday, September 25, 2026 · Museum of Contemporary Art Chicago",
  shortDateLine: "September 25, 2026 · MCA Chicago",
  // The thank-you of record. EN paragraphs plus one Spanish line.
  thankYou: [
    "To everyone who filled the MCA on Friday night: thank you. You came in black tie on the same day we taught our last classes at 949 W 16th Street, and you turned a goodbye to our first studio into a celebration of what comes next.",
    "Thank you to our sponsors and partners, to the businesses that donated auction packages, to the designers who walked the fourth floor, to Mariachi Sirenas and DJ Mateo, to our MCs Alo and Cynthia, to our honorees and featured voices, and to the volunteers who ran the door, the paddles, and the room. And to everyone who raised a paddle: in ten minutes you funded scholarships for the next teachers.",
    "What we raised is already at work. It keeps classes accessible and teacher training on full scholarship while we build a permanent home of our own in Pilsen, opening early 2027.",
  ],
  thankYouEs: "Gracias por acompañarnos. Esta comunidad es nuestro hogar.",
  signoff: "Con amor, The Latina Sweat Project",
  photosHeading: "The night in photos",
  photosIntro:
    "Every photo from the official album, in the order the night unfolded: cocktail hour on the terrace, dinner and honors, the galleries after dark, and the fashion show. Tap any photo to view it large, or open the full album on Flickr.",
  // Post-gala ask. The gala give form stays live for stragglers, but the
  // site's ask is now the new-home campaign.
  giveHeading: "The night is over. The work is not.",
  giveBody:
    "Friday was our last day of classes on 16th Street. This fall LSP goes pop-up across the neighborhood while we build a permanent home in Pilsen, opening early 2027. Every gift keeps classes accessible and teacher training tuition-free until we get there.",
  givePath: "/donate",
  giveLabel: "Support the new home",
};

// Money raised on the night itself, by ask. Amounts in dollars.
export const galaResults = {
  asOf: "2026-09-26",
  // Paddle raise, from our tool. 40 gifts between 9:07 and 9:17 PM.
  paddleRaise: {
    total: 13862.5,
    gifts: 40,
    startedAt: "9:07 PM",
    endedAt: "9:17 PM",
    minutes: 10,
    // Levels as called from the stage, highest first, with the impact line
    // the projector showed for each level. `count` = gifts at that level.
    levels: [
      { amount: 5000, count: 1, impact: "One 200-hour teacher-training certification, tuition free" },
      { amount: 1500, count: 1, impact: "One year of membership for an underrepresented student" },
      { amount: 500, count: 9, impact: "One community grief-counseling session led by certified counselors" },
      { amount: 250, count: 2, impact: "One outdoor community event with yoga" },
      { amount: 100, count: 18, impact: "One month of water for the studio" },
      { amount: 62.5, count: 9, impact: "One month of membership for an underrepresented student" },
    ],
  },
  // Silent auction, from the Zeffy export. Winning bids paid by 9 bidders.
  silentAuction: {
    total: 8970,
    packagesOffered: 15,
    packagesClaimed: 12,
    bidders: 9,
  },
  // Give Tonight (scan-to-give on the paddles and program), from Zeffy.
  onlineGifts: {
    total: 2350,
    gifts: 9,
  },
  // Sum of the three asks above: what the room gave on the night.
  raisedOnTheNight: 25182.5,
  // Tickets and sponsorships settled through Zeffy (Succeeded payments in the
  // 2026-09-26 ticketing export: 77 full-evening, 30 late-night, two
  // Community and one Gold sponsorship, plus $2,625 in add-on donations at
  // checkout; the one $200 refund is excluded).
  tickets: {
    fullEvening: 77,
    lateNight: 30,
    sponsorshipsOnForm: 10000,
    addOnDonations: 2625,
    gross: 45950,
  },
  // Grand total the site can verify today: raised on the night + the Zeffy
  // ticketing gross. Sponsorships paid off-platform (Aon, CCLF, Wintrust,
  // Hilario, and any check or invoice) are NOT in here yet; the organizer
  // asked to publish this figure now and update it as the books reconcile.
  // $25,182.50 + $45,950 = $71,132.50. Set to null to hide the line.
  grandTotal: 71132.5,
  grandTotalNote:
    "With tickets and sponsorships paid through our ticketing, as of September 26. Sponsorships paid by check or invoice are still being added.",
  // Attendance from the check-in tool: names on the door list after removals
  // and placeholders.
  guestsOnList: 180,
  tablesSeated: 17,
};

// The silent auction lineup as printed in the program (donor · package).
// `claimed` = a winning bid was paid. No bid amounts and no bidder names.
export const galaAuctionPackages = [
  { donor: "Hebru Brantley", title: "Durag (2023), edition of 165", claimed: true },
  { donor: "Tres Jolie", title: "Sculptra and Dysport treatment package", claimed: true },
  { donor: "Casa Madaii", title: "Omakase dinner for four", claimed: true },
  { donor: "Chef Álvaro Lima", title: "Private chef dinner for six", claimed: true },
  { donor: "Revolution Brewing", title: "Brewery tour for eight and gear", claimed: true },
  { donor: "On Running", title: "Cloudboom Max shoes and sports bra", claimed: true },
  { donor: "Chicago White Sox", title: "Fan gear package", claimed: true },
  { donor: "Mariachi Herencia de México", title: "Four holiday concert tickets", claimed: true },
  { donor: "Lizlates", title: "Private Pilates class for 12", claimed: true },
  { donor: "By Ashley", title: "Fine-line tiny tattoo", claimed: true },
  { donor: "CKN Adore", title: "Soaps and candles gift basket", claimed: true },
  { donor: "Andrea Fuentes", title: "Back facial treatment", claimed: true },
  { donor: "Chitown Par-tee", title: "Two-hour mobile golf simulator", claimed: false },
  { donor: "Jason Phillips (JP)", title: "12 personal training sessions", claimed: false },
  { donor: "Jassiel Serna", title: "Original sculptures", claimed: false },
];

// Tonight's honors, in program order, exactly as shown on the projector
// (source of record: HONORS in src/lib/galaLive/program.js). `photo` is a
// path under public/ when a headshot exists; the other four get a monogram
// tile, as they did on screen.
const HONOREE_IMG = "/images/gala/2026/honorees";
export const galaHonors = [
  {
    title: "Leadership Through Service Honor",
    name: "Awais “Fez” Qazi",
    description: "Recognizing service that strengthens community, builds trust, and helps create meaningful change through consistent action.",
    photo: `${HONOREE_IMG}/awais-qazi.jpg`,
  },
  {
    title: "Leadership in Motion Honor",
    name: "Rut Merida",
    description: "Honoring leadership that turns commitment into action and keeps meaningful change moving forward.",
    photo: `${HONOREE_IMG}/rut-merida.jpg`,
  },
  {
    title: "Community Impact Honor",
    name: "Lucia del Rincón",
    description: "Recognizing leadership that transforms care, collaboration, and community-centered work into meaningful impact.",
    photo: `${HONOREE_IMG}/lucia-del-rincon.jpg`,
  },
  {
    title: "Somos LSP Honor",
    name: "Ruthie Maldonado-Delwiche",
    description: "Recognizing someone who embodies the heart, values, and spirit of Latina Sweat Project through the way they show up for community.",
    photo: `${HONOREE_IMG}/ruthie-maldonado-delwiche.jpg`,
  },
  {
    title: "Community Advocacy Honor",
    name: "Lucia Moya",
    description: "Honoring advocacy that opens doors, amplifies community needs, and helps create meaningful change where it matters most.",
    photo: null,
  },
  {
    title: "Community Leadership Honor",
    name: "Katia Orozco",
    description: "Recognizing leadership rooted in representation, community connection, and building meaningful change for the next generation.",
    photo: null,
  },
  {
    title: "Civic Leadership Award",
    name: "Stacey Berdejo",
    description: "Honoring civic leadership that elevates community voices and helps turn representation into meaningful, lasting change.",
    photo: null,
  },
  {
    title: "Changemaker Award",
    name: "Dave Dyson",
    description: "Recognizing leadership that moves beyond support into action, investment, and meaningful change for the communities and organizations he stands behind.",
    photo: null,
  },
];

export const galaVoices = {
  mcs: ["Alo", "Cynthia"],
  featured: ["Savannah Alvarez", "Yesi Peyret", "Yari Jurado", "Xochyl Perez", "Vanessa Tirado"],
  founderRemarks: "Margarita Quiñones-Peña",
};

// 2026 sponsors, partners and designers. Logos are the white knockout set
// made for the projector (luminance-preserving, for dark plates ONLY: never
// put these on cream). `scale` / `maxH` are the optical-weight corrections
// from src/lib/galaLive/program.js; featured tier renders larger.
const LOGO = "/images/gala/2026/program/logos/white";
export const galaSponsors2026 = {
  featured: [
    { name: "Aon", logo: `${LOGO}/aon.png`, scale: 0.85 },
    { name: "Eclipse Telecom", logo: `${LOGO}/eclipse.png`, scale: 1 },
    { name: "Chubb", logo: `${LOGO}/chubb.png`, scale: 1, maxH: 0.6 },
  ],
  partners: [
    { name: "Chicago Community Loan Fund", logo: `${LOGO}/cclf.png`, scale: 1 },
    { name: "Rep. Edgar Gonzalez Jr.", logo: `${LOGO}/edgar.png`, scale: 1 },
    { name: "Wintrust", logo: `${LOGO}/wintrust.png`, scale: 0.95 },
    { name: "Hilario for School Board President", logo: `${LOGO}/hilario.png`, scale: 0.62 },
  ],
  designers: [
    { name: "We Will Win", logo: `${LOGO}/we-will-win.png`, scale: 0.8 },
    { name: "Gente Fina", logo: `${LOGO}/gente-fina.png`, scale: 1, maxH: 0.55 },
    { name: "Definitive Selection", logo: `${LOGO}/definitive.png`, scale: 0.8 },
    { name: "Sosa", logo: `${LOGO}/sosa.png`, scale: 1 },
    { name: "Fiera", logo: `${LOGO}/fiera.png`, scale: 0.95 },
    { name: "Dennise Designs", logo: `${LOGO}/dennise.png`, scale: 0.75 },
  ],
  entertainment: [
    { name: "Mariachi Sirenas", role: "Cocktail hour", logo: `${LOGO}/sirenas.png`, scale: 0.9 },
    { name: "DJ Mateo", role: "Until midnight", logo: `${LOGO}/djmateo.png`, scale: 1 },
  ],
};

// Photo picks for the /gala recap page, by index into galaPhotoStems (album
// order). Chosen from the contact sheets on 2026-09-26: wide room, venue
// and performance frames; no single guest fills the hero or the OG card.
//   hero: the dinner room at the MCA, lanterns and the podium (album #69).
//         Rendered locally to public/images/gala/2026/recap/ (1600w + a
//         900w portrait crop) and the 1200x630 og-gala-recap.jpg.
//   leads: six per chapter for the editorial mosaic, listed in clock order
//         (the component re-sorts by clock, so `big` must sit on the
//         positions the pattern expects AFTER sorting).
//         `big` tiles span 2x2; portraits span one column, two rows. The
//         patterns ("B s s B s s", "B B P P P P", "P P P P B B") are the ones
//         that tile a 4-column desktop and a 2-column phone grid with no
//         holes, so keep one of them if you swap a photo.
export const galaRecapPhotos = {
  hero: 69,
  leads: {
    cocktails: [
      { i: 341, big: true },
      { i: 361 },
      { i: 363 },
      { i: 373, big: true },
      { i: 403 },
      { i: 420 },
    ],
    dinner: [
      { i: 33, big: true },
      { i: 55 },
      { i: 60 },
      { i: 61, big: true },
      { i: 66 },
      { i: 70 },
    ],
    gallery: [
      { i: 73, big: true },
      { i: 84 },
      { i: 96 },
      { i: 107, big: true },
      { i: 108 },
      { i: 109 },
    ],
    afterdark: [
      { i: 151 },
      { i: 158 },
      { i: 186 },
      { i: 270 },
      { i: 282, big: true },
      { i: 325, big: true },
    ],
  },
};
