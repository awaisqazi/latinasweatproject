// YTT '26 Trio Community Classes: free 45-minute community yoga flows,
// each led by three teachers from our newest Yoga Teacher Training
// cohort, each taking the mat for a 15-minute portion of the sequence.
// Runs Aug 11 through Aug 31, 2026 at LSP Studio in Pilsen.
//
// Single source of truth for every surface that mentions the series
// (homepage, /schedule, /events, /links). Tickets are free General
// Admission on Zeffy with a donation to LSP encouraged. NOTE: the Zeffy
// slug reads "annual-gala-6420" but the live form is confirmed to be the
// "YTT '26 Trio Community Classes" ticketing page (verified 2026-08-10);
// do not "fix" the URL.
export const yttTrio = {
  title: "YTT ’26 Trio Community Classes",
  shortTitle: "Trio Community Classes",
  cohortLabel: "YTT ’26",
  dateRangeLabel: "Aug 11 · Aug 31",
  timeWindowLabel: "Weeknights · 6, 7 & 8 PM",
  venueName: "LSP Studio",
  venueLine: "LSP Studio · 949 W 16th St, Pilsen",
  address: "949 W 16th St, Chicago, IL 60608",
  priceLine: "Free · All levels · Donation to LSP encouraged",
  formatLine: "One 45-minute flow · Three teachers · 15 minutes each",
  description:
    "Come move with us in a class unlike any other at LSP. Our community " +
    "yoga classes are free, open to all levels, and rooted in the belief " +
    "that wellness belongs to everyone. Each 45-minute flow is led by " +
    "three teachers from our newest Yoga Teacher Training cohort, each " +
    "taking the mat for a 15-minute portion of the sequence.",
  supportLine:
    "Your presence, your energy, and your support mean everything as " +
    "these teachers step into their first live class.",
  ticketsUrl: "https://www.zeffy.com/en-US/ticketing/annual-gala-6420",
  ticketsLabel: "Reserve Free Tickets",
};

// The 12 sessions, chronological. `date` is ISO (for next-up highlighting),
// `time` uses an en-dash range to match LSP schedule copy.
export const yttTrioSessions = [
  {
    id: "aug11-6pm",
    date: "2026-08-11",
    day: "Tuesday",
    dayShort: "Tue",
    dateLabel: "August 11",
    dateShort: "Aug 11",
    time: "6:00–6:45 PM",
    timeShort: "6 PM",
    instructors: ["Celina", "Marlene", "Courtney"],
  },
  {
    id: "aug17-6pm",
    date: "2026-08-17",
    day: "Monday",
    dayShort: "Mon",
    dateLabel: "August 17",
    dateShort: "Aug 17",
    time: "6:00–6:45 PM",
    timeShort: "6 PM",
    instructors: ["Benjamin", "Melissa", "Ghazala"],
  },
  {
    id: "aug18-6pm",
    date: "2026-08-18",
    day: "Tuesday",
    dayShort: "Tue",
    dateLabel: "August 18",
    dateShort: "Aug 18",
    time: "6:00–6:45 PM",
    timeShort: "6 PM",
    instructors: ["Sarah", "Xavier", "Jade"],
  },
  {
    id: "aug18-7pm",
    date: "2026-08-18",
    day: "Tuesday",
    dayShort: "Tue",
    dateLabel: "August 18",
    dateShort: "Aug 18",
    time: "7:00–7:45 PM",
    timeShort: "7 PM",
    instructors: ["Marelin", "Viviana", "Fabiola"],
  },
  {
    id: "aug18-8pm",
    date: "2026-08-18",
    day: "Tuesday",
    dayShort: "Tue",
    dateLabel: "August 18",
    dateShort: "Aug 18",
    time: "8:00–8:45 PM",
    timeShort: "8 PM",
    instructors: ["Antonia", "Eliud", "Sara"],
  },
  {
    id: "aug20-6pm",
    date: "2026-08-20",
    day: "Thursday",
    dayShort: "Thu",
    dateLabel: "August 20",
    dateShort: "Aug 20",
    time: "6:00–6:45 PM",
    timeShort: "6 PM",
    instructors: ["Savannah", "Gisella", "Jianna"],
  },
  {
    id: "aug20-7pm",
    date: "2026-08-20",
    day: "Thursday",
    dayShort: "Thu",
    dateLabel: "August 20",
    dateShort: "Aug 20",
    time: "7:00–7:45 PM",
    timeShort: "7 PM",
    instructors: ["Kennia", "Liz", "Benjamin"],
  },
  {
    id: "aug20-8pm",
    date: "2026-08-20",
    day: "Thursday",
    dayShort: "Thu",
    dateLabel: "August 20",
    dateShort: "Aug 20",
    time: "8:00–8:45 PM",
    timeShort: "8 PM",
    instructors: ["Jessica", "Giuliana", "Giselle"],
  },
  {
    id: "aug24-6pm",
    date: "2026-08-24",
    day: "Monday",
    dayShort: "Mon",
    dateLabel: "August 24",
    dateShort: "Aug 24",
    time: "6:00–6:45 PM",
    timeShort: "6 PM",
    instructors: ["Liz", "Rosa", "Ariel"],
  },
  {
    id: "aug25-6pm",
    date: "2026-08-25",
    day: "Tuesday",
    dayShort: "Tue",
    dateLabel: "August 25",
    dateShort: "Aug 25",
    time: "6:00–6:45 PM",
    timeShort: "6 PM",
    instructors: ["Jocelyn", "Kellyn", "Anabel"],
  },
  {
    id: "aug27-6pm",
    date: "2026-08-27",
    day: "Thursday",
    dayShort: "Thu",
    dateLabel: "August 27",
    dateShort: "Aug 27",
    time: "6:00–6:45 PM",
    timeShort: "6 PM",
    instructors: ["Efren", "Xochyl", "Javi"],
  },
  {
    id: "aug31-6pm",
    date: "2026-08-31",
    day: "Monday",
    dayShort: "Mon",
    dateLabel: "August 31",
    dateShort: "Aug 31",
    time: "6:00–6:45 PM",
    timeShort: "6 PM",
    instructors: ["Ixchel", "Jimmy", "Amanda"],
  },
];
