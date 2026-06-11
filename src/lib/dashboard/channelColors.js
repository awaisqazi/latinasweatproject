// Shared channel tone maps for the dashboard calendars. The publishing
// calendar's palette is canonical: newsletter is teal and unmatched channels
// fall back to amber, because emerald is reserved for the Published state
// (callers apply their own Published/board overrides before these lookups).

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];

  return tags
    .flatMap((tag) => String(tag).split(","))
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
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
