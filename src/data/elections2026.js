// 2026 Junior Board Elections: single source of truth for the public
// /elections page and the ElectionBallot component.
//
// Facts confirmed so far:
//   - Four roles, nine candidates total (names below are the official
//     spellings; do not "fix" accents or nicknames).
//   - Speeches stream live on YouTube; the same video ID serves the live
//     broadcast and the on-demand replay afterward.
//
// Deliberately NOT in this file:
//   - Voting dates. The voting window is controlled live from the admin
//     dashboard and read at runtime through the get_voting_status RPC, so
//     nothing here should ever hardcode an open or close time.
//   - Candidate bios and photos. None have been submitted yet, so every
//     candidate carries explicit null placeholders and the page renders
//     name-forward cards instead of the photo + bio card used in 2025.

export const election2026 = {
  name: "2026 Junior Board Elections",
  shortName: "Junior Board Elections",
  year: 2026,
  pagePath: "/elections",
  // Badge copy for the hero. Dates come from LSP, never from this file.
  scheduleNote: "Voting dates announced by LSP",
  tagline: "Get to know the leaders stepping up to serve our comunidad.",
  contactEmail: "collab@latinasweatproject.com",
};

// Candidate speeches livestream. Both URLs point at the same YouTube video:
// `watchUrl` for the "open in YouTube" link, `embedUrl` for the iframe.
export const electionLivestream = {
  watchUrl: "https://youtube.com/live/3EGEl5JyjUM",
  embedUrl: "https://www.youtube.com/embed/3EGEl5JyjUM",
  title: "LSP Junior Board Candidate Speeches",
};

// Who the ballot is for. The RPC decides what actually counts; this list is
// the public-facing explanation only.
export const electionEligibility = [
  "LSP Instructors",
  "Yoga Teacher Training (YTT) Students",
  "Current Board Members",
];

// Roles in the order they appear BOTH on the page and on the ballot, matching
// the 2025 election: secretary, treasurer, vice-president, president. The ids
// are the 2025 convention and are the keys the cast_vote RPC expects.
//
// Every candidate carries three placeholders:
//   bio        : null until candidate statements are collected.
//   image      : null until headshots are collected (filename only, resolved
//                against `${base}images/election/` by the page).
//   speechClip : null until the edited per-candidate speech clips are ready.
//                Drop the clip in here (an embeddable URL, e.g. a YouTube
//                /embed/ID link) and the ballot's acknowledgment row will
//                render that candidate's video inline. No other change needed.
export const electionRoles = [
  {
    title: "Secretary",
    id: "secretary",
    responsibilities:
      "Maintains clear communication on behalf of the Junior Board and documents key ideas, initiatives, and commitments. Represents the board in external storytelling, capturing and sharing narratives of impact, community wins, and program milestones. Acts as a liaison between the Junior Board and the broader Latina Sweat community, ensuring messaging is consistent and rooted in the mission.",
    candidates: [
      { name: "Gisela Mitchell", bio: null, image: null, speechClip: null },
      { name: "Marlene Garcia", bio: null, image: null, speechClip: null },
    ],
  },
  {
    title: "Treasurer",
    id: "treasurer",
    responsibilities:
      "Provides stewardship and awareness around fundraising initiatives, sponsorship opportunities, and community giving that support Latina Sweat Project programming. Serves as a public-facing representative when discussing financial impact, donor engagement, or fundraising campaigns. Mentors peers in understanding the financial sustainability of community wellness work and communicates this effectively in external settings.",
    candidates: [
      { name: "Fabiola Saldaña", bio: null, image: null, speechClip: null },
      { name: "Roberto Espino", bio: null, image: null, speechClip: null },
      { name: "Kellyn Mitchell", bio: null, image: null, speechClip: null },
    ],
  },
  {
    title: "Vice President",
    id: "vice-president",
    responsibilities:
      "Supports the President in representing the Junior Board and steps in as needed during public or media engagements. Helps mentor fellow board members, strengthen communication within the cohort, and guide collaborative projects. Works closely with the President to uplift the stories, impact, and mission of the Latina Sweat Project across community spaces.",
    candidates: [
      { name: "Savannah Alvarez", bio: null, image: null, speechClip: null },
      { name: "Xavier Perez", bio: null, image: null, speechClip: null },
    ],
  },
  {
    title: "President",
    id: "president",
    responsibilities:
      "Serves as the primary representative of the Junior Board and a public-facing ambassador for the Latina Sweat Project. Leads the board's vision, mentors peers in leadership development, and represents the cohort in media, press, and community engagements. Partners with the Executive Director to ensure the Junior Board's voice reflects community needs and the mission of expanding wellness access.",
    candidates: [
      { name: "Celina Huerta", bio: null, image: null, speechClip: null },
      { name: "Xochyl Perez", bio: null, image: null, speechClip: null },
    ],
  },
];

// Ballot section order, kept identical to the page section order above.
export const electionBallotOrder = electionRoles.map((role) => role.id);

// Total candidates across every role. Powers the ballot's
// "N of 9 speeches acknowledged" progress note.
export const electionCandidateCount = electionRoles.reduce(
  (total, role) => total + role.candidates.length,
  0,
);

// Stable key for a candidate, used for acknowledgment checkboxes. Namespaced
// by role so two candidates could share a name without colliding.
export function candidateKey(roleId, candidateName) {
  return `${roleId}::${candidateName}`;
}

// Two-letter monogram for the placeholder avatar on name-forward cards.
export function candidateInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
