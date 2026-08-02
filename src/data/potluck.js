// Single source of truth for the /potluck page.
//
// To confirm or move the date: update dateLabel and flip dateConfirmed to
// true. Keep the slug stable when only the date shifts, so everything people
// already signed up to bring carries over. Change the slug only for a brand
// new potluck (old entries stay archived in Supabase under the old slug).

export const potluckEvent = {
  slug: "potluck-2026-08",
  name: "LSP Community Potluck",
  tagline:
    "One table, every flavor. Add what you're bringing, watch the spread come together live, and come hungry. No sign-up sheets, no spreadsheets, just comida y comunidad.",
  dateLabel: "Thursday, August 6, 2026",
  // Flip to true once the board locks the date; until then the page shows a
  // "date being confirmed" note so nobody meal-preps for the wrong night.
  dateConfirmed: false,
  dateNote: "We're finalizing the date, check back before you cook.",
  timeLabel: "Time TBA",
  timeNote: "Exact time coming soon.",
  locationName: "The LSP Studio",
  locationAddress: "949 W 16th St, Chicago, IL 60607",
  contactPath: "/contact",
};

// Categories drive the form, the grouped list, and the balance meter.
// ids must match the potluck_items_category_check constraint in Supabase.
export const potluckCategories = [
  { id: "main", label: "Mains", emoji: "🍲", food: true },
  { id: "side", label: "Sides", emoji: "🥗", food: true },
  { id: "appetizer", label: "Antojitos + apps", emoji: "🥟", food: true },
  { id: "dessert", label: "Desserts", emoji: "🍰", food: true },
  { id: "drink", label: "Drinks", emoji: "🧃", food: true },
  { id: "supplies", label: "Supplies", emoji: "🍽️", food: false },
  { id: "other", label: "Something else", emoji: "✨", food: false },
];

// ids must match the whitelist in potluck_clean_dietary in Supabase.
export const potluckDietaryTags = [
  { id: "vegetarian", label: "Vegetarian", emoji: "🌱" },
  { id: "vegan", label: "Vegan", emoji: "🌿" },
  { id: "gluten-free", label: "Gluten-free", emoji: "🌾" },
  { id: "dairy-free", label: "Dairy-free", emoji: "🥛" },
  { id: "contains-nuts", label: "Contains nuts", emoji: "🥜" },
  { id: "spicy", label: "Spicy", emoji: "🌶️" },
];

// The unglamorous stuff a potluck lives or dies on. A chip disappears once
// somebody adds an item whose name contains one of its match keywords;
// clicking a chip prefills the form. Keywords are matched case-insensitively.
export const potluckStillNeeded = [
  { label: "Plates + napkins", category: "supplies", match: ["plate", "napkin"] },
  { label: "Cups", category: "supplies", match: ["cup"] },
  { label: "Forks + spoons", category: "supplies", match: ["fork", "spoon", "utensil", "cutlery"] },
  { label: "Serving utensils", category: "supplies", match: ["serving", "tongs", "ladle"] },
  { label: "Ice", category: "supplies", match: ["ice"] },
  { label: "Agua fresca", category: "drink", match: ["agua", "horchata", "jamaica", "tamarindo"] },
];
