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
  statusLabel: "Tickets and sponsorships coming soon",
  pagePath: "/gala",
  saveDatePath: "/gala#save-the-date",
  // On-page anchor used by the hero "Save the Date" button to scroll to the
  // closing invitation. The closing CTA links out to the live Zeffy form.
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
  body: "What began as a mission to normalize yoga in underserved communities has become a movement. Every ticket, sponsorship, and gift expands free and discounted access, so we can reach even more of our comunidad.",
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
