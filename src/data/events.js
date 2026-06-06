// src/data/events.js

export const allEvents = [
  {
    slug: "world-cup-watch-party",
    title: "LSP World Cup Watch Party",
    imageSrc: "/images/world-cup-watch-party.png",
    imageFrameClass: "aspect-[4/5]",
    imageClass: "h-full w-full object-contain",
    date: "June 11 - July 4",
    time: "Starts at 1:00 PM on June 11",
    location: "LSP Studio",
    address: "949 W 16th St, Chicago, IL",
    description: "Join us for a fun watch party where futbol, community, and wellness come together with a live DJ, games, soccer-themed face painting, cotton candy, popcorn, and aguas frescas. Your registration helps us keep creating safe, supportive spaces for our community to move, recharge, and grow together.",
    registrationLink: "https://www.zeffy.com/en-US/ticketing/lsp-world-cup-watch-party",
    registrationLabel: "Save Your Spot",
    conversionEvent: "event_registration_start",
    conversionProvider: "zeffy",
    conversionBookingPath: "world_cup_ticketing",
    featured: true,
    tags: ["Watch Party", "$10", "Community"]
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
