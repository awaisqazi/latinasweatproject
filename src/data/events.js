// src/data/events.js

export const allEvents = [
  {
    slug: "pride-in-the-park",
    title: "Pride in the Park",
    imageSrc: "/images/pride-in-the-park.png",
    imageFrameClass: "aspect-[4/5]",
    imageClass: "h-full w-full object-contain",
    date: "Sunday, June 14",
    time: "1:00 to 3:00 PM",
    location: "12th St Beach",
    address: "Near Museum Campus, Chicago",
    description: "Pride In The Park brings our Latina Sweat Cares community together for movement, joy, and visibility. Celebrate with a lizlates Pilates class and a Dance Fitness class outdoors by the lake. Free event, all are welcome. BYOM: bring your own mat.",
    registrationLink: "https://www.zeffy.com/en-US/ticketing/pride-in-the-park-2",
    registrationLabel: "RSVP Free",
    conversionEvent: "event_registration_start",
    conversionProvider: "zeffy",
    conversionBookingPath: "pride_in_the_park_ticketing",
    featured: true,
    tags: ["Free", "Outdoors", "Pride"]
  },
  {
    slug: "dia-del-nino-kids-day",
    title: "Kids Day at LSP",
    imageSrc: "/images/dia-del-nino-kids-day-en.png",
    imageFrameClass: "aspect-[4/5]",
    imageClass: "h-full w-full object-contain",
    date: "Sunday, June 14",
    time: "1:00 PM - 4:15 PM",
    location: "LSP Studio",
    address: "949 W 16th St, Chicago, IL",
    description: "Celebrate Kids Day at LSP with four free movement, play, and wellness classes grouped by age. Each registration includes a free yoga class and goody bag.",
    registrationLink: "https://www.zeffy.com/en-US/ticketing/lsp-dia-del-nino-kids-day",
    featured: true,
    tags: ["Free", "Kids", "Wellness"]
  },
  {
    slug: "monday-miles",
    title: "Monday Miles — Community Run & Walk",
    imageSrc: "/images/monday-miles-runner.png",
    date: "Every Monday",
    time: "6:30 PM",
    location: "LSP Studio Cafe",
    address: "Pilsen, Chicago, IL",
    description: "Mondays just got better! Meet in the cafe, warm up together, and head out. Walk 1 mile or jog/run 2 — you set the pace. All levels welcome. Movement is medicine, and it's better in community.",
    registrationLink: "/schedule",
    featured: true,
    recurring: true,
    tags: ["Free", "All Levels", "Weekly"]
  },
];
