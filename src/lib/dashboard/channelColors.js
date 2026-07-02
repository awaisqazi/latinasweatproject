// Shared channel tone maps for the dashboard calendars. The marketing
// calendar's palette is canonical: every named channel gets its own hue so a
// multi-channel post can render as a split chip (one segment per channel).
// Emerald is reserved for the Published state and sky/violet for project
// stages, so channels avoid those hues.

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];

  return tags
    .flatMap((tag) => String(tag).split(","))
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

// Order matters: segments render in this order so split chips are stable.
const CHANNEL_PALETTE = [
  { key: "instagram", label: "Instagram", aliases: ["instagram", "ig"], seg: "bg-fuchsia-200", dot: "bg-fuchsia-500" },
  { key: "tiktok", label: "TikTok", aliases: ["tiktok"], seg: "bg-cyan-200", dot: "bg-cyan-500" },
  { key: "linkedin", label: "LinkedIn", aliases: ["linkedin"], seg: "bg-blue-200", dot: "bg-blue-500" },
  { key: "facebook", label: "Facebook", aliases: ["facebook", "fb"], seg: "bg-indigo-200", dot: "bg-indigo-500" },
  { key: "youtube", label: "YouTube", aliases: ["youtube", "yt"], seg: "bg-red-200", dot: "bg-red-500" },
  { key: "newsletter", label: "Newsletter", aliases: ["newsletter", "email"], seg: "bg-teal-200", dot: "bg-teal-500" },
  { key: "website", label: "Website", aliases: ["website", "web", "blog"], seg: "bg-slate-200", dot: "bg-slate-500" },
];

export const OTHER_CHANNEL = {
  key: "other",
  label: "Other",
  seg: "bg-amber-200",
  dot: "bg-amber-500",
};

function matchChannel(tag) {
  return CHANNEL_PALETTE.find((channel) =>
    channel.aliases.some(
      (alias) => tag === alias || (alias.length > 3 && tag.includes(alias)),
    ),
  );
}

// One segment per distinct channel, in palette order, so "IG + TikTok" always
// splits fuchsia | cyan. Unknown or missing channels collapse into one
// "Other" segment.
export function getChannelSegments(tags) {
  const normalized = normalizeTags(tags);
  const matchedKeys = new Set();
  let hasOther = normalized.length === 0;

  for (const tag of normalized) {
    const channel = matchChannel(tag);
    if (channel) {
      matchedKeys.add(channel.key);
    } else {
      hasOther = true;
    }
  }

  const segments = CHANNEL_PALETTE.filter((channel) => matchedKeys.has(channel.key));
  if (hasOther) segments.push(OTHER_CHANNEL);

  return segments;
}

export function getChannelChipClass(tags) {
  const joinedTags = normalizeTags(tags).join(" ");

  if (joinedTags.includes("linkedin")) {
    return "border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-300 hover:bg-blue-100";
  }

  if (joinedTags.includes("website")) {
    return "border-gray-200 bg-gray-100 text-gray-800 hover:border-gray-300 hover:bg-gray-200";
  }

  if (joinedTags.includes("ig") || joinedTags.includes("instagram") || joinedTags.includes("tiktok")) {
    return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 hover:border-fuchsia-300 hover:bg-fuchsia-100";
  }

  if (joinedTags.includes("newsletter")) {
    return "border-teal-200 bg-teal-50 text-teal-800 hover:border-teal-300 hover:bg-teal-100";
  }

  return "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100";
}

export function getChannelDotClass(tags) {
  const joinedTags = normalizeTags(tags).join(" ");

  if (joinedTags.includes("linkedin")) return "bg-blue-500";
  if (joinedTags.includes("website")) return "bg-gray-500";
  if (joinedTags.includes("ig") || joinedTags.includes("instagram") || joinedTags.includes("tiktok")) {
    return "bg-fuchsia-500";
  }
  if (joinedTags.includes("newsletter")) return "bg-teal-500";
  return "bg-amber-500";
}
