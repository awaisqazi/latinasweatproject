// Single source of truth for the /friendsgiving page (LSP team Friendsgiving
// potluck, "what are you bringing" board). The link lives in the Partiful
// invite; RSVPs happen there, so this page has no RSVP or guest list.
//
// Backend: reuses the /potluck tables and RPCs in Supabase
// (supabase/migrations/20260802120000_potluck_page.sql). Entries are keyed by
// `slug`, so this board is simply its own slug. Keep the slug stable if the
// date or time moves, so everything people already signed up to bring
// carries over. A brand new event gets a new slug (old entries stay archived
// under the old one).
//
// The page deliberately states NO location: no address, venue, map, or venue
// facts (heating, fridge, storage). The owner asked for that.

export const friendsgivingEvent = {
  slug: "friendsgiving-2026-11",
  name: "LSP Team Bonding: Friendsgiving",
  // Shown above the menu on the dark ground.
  kicker: "LSP Team Bonding",
  dateLabel: "Sunday, November 22",
  timeLabel: "11:30 am to 5:30 pm",
  instruction:
    "Bring a dish, side or dessert to share, and add it to the menu so nobody doubles up.",
  partifulUrl: "https://partiful.com/e/DFSgX9nrLBkAXk1iv9SC",
};

// Courses, in menu order. ids must match potluck_items_category_check in
// Supabase (main, side, appetizer, dessert, drink, supplies, other).
// `food: true` courses take part in the repeat-dish warning; supplies and
// "something else" never warn. `alwaysShow: false` hides a course on the menu
// until something is in it.
export const friendsgivingCourses = [
  { id: "main", label: "Mains", food: true, alwaysShow: true },
  { id: "side", label: "Sides", food: true, alwaysShow: true },
  { id: "appetizer", label: "Starters", food: true, alwaysShow: true },
  { id: "dessert", label: "Desserts", food: true, alwaysShow: true },
  { id: "drink", label: "Drinks", food: true, alwaysShow: true },
  { id: "supplies", label: "Supplies", food: false, alwaysShow: true },
  { id: "other", label: "Something else", food: false, alwaysShow: false },
];

// ids must match the whitelist in potluck_clean_dietary in Supabase.
export const friendsgivingDietaryTags = [
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "gluten-free", label: "Gluten-free" },
  { id: "dairy-free", label: "Dairy-free" },
  { id: "contains-nuts", label: "Contains nuts" },
  { id: "spicy", label: "Spicy" },
];

// Ideas nobody has claimed, listed under their course on the menu. An idea
// disappears once anything on the menu matches one of its keywords; tapping
// it prefills the form. Each keyword is a phrase: every word in it must
// appear in the dish name as a whole word (after the same normalizing the
// repeat check uses). Words of 4+ letters also match as a word prefix
// ("napkin" matches "napkins"); shorter words must match exactly, so "ice"
// is never claimed by "rice", "iced" or "juice", and "cup" not by "cupcakes".
export const friendsgivingIdeas = [
  { label: "Turkey", category: "main", keywords: ["turkey"] },
  { label: "Ham", category: "main", keywords: ["ham"] },
  { label: "Stuffing", category: "side", keywords: ["stuffing", "dressing"] },
  { label: "Mashed potatoes", category: "side", keywords: ["mashed potato", "potato mash"] },
  { label: "Mac and cheese", category: "side", keywords: ["mac cheese", "macaroni"] },
  { label: "Green beans", category: "side", keywords: ["green bean"] },
  { label: "Cranberry sauce", category: "side", keywords: ["cranberry"] },
  { label: "Gravy", category: "side", keywords: ["gravy"] },
  { label: "Rolls", category: "side", keywords: ["roll", "biscuit", "bread", "cornbread"] },
  { label: "Salad", category: "appetizer", keywords: ["salad"] },
  { label: "Pumpkin pie", category: "dessert", keywords: ["pumpkin pie"] },
  { label: "Pecan pie", category: "dessert", keywords: ["pecan pie"] },
  { label: "Apple pie", category: "dessert", keywords: ["apple pie"] },
  { label: "Sparkling cider", category: "drink", keywords: ["cider"] },
  { label: "Coffee", category: "drink", keywords: ["coffee"] },
  { label: "Plates and napkins", category: "supplies", keywords: ["plate", "napkin"] },
  { label: "Cups", category: "supplies", keywords: ["cup"] },
  { label: "Forks and spoons", category: "supplies", keywords: ["fork", "spoon", "utensil", "cutlery", "silverware"] },
  { label: "Ice", category: "supplies", keywords: ["ice"] },
];

// ---------------------------------------------------------------------------
// Repeat-dish matching. Pure functions: everything comes in as arguments
// (Svelte legacy mode does not track state read inside helpers, so the
// component's `$:` statements pass state in explicitly).

const FILLER = new Set([
  "and", "with", "the", "a", "an", "of", "my", "homemade", "de", "con", "y",
]);

// Crude singular: potatoes -> potato, rolls -> roll, pies -> pie. Words that
// end in -ss, -us or -is (glass, hummus) are left alone. Both sides of every comparison go through the same function, so
// being crude is fine as long as it is consistent.
function singular(word) {
  if (word.length <= 3) return word;
  if (/(ss|us|is)$/.test(word)) return word;
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

export function dishTokens(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .map(singular);
}

export function dishesMatch(a, b) {
  const ta = Array.isArray(a) ? a : dishTokens(a);
  const tb = Array.isArray(b) ? b : dishTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const sa = new Set(ta);
  const sb = new Set(tb);
  if (ta.join(" ") === tb.join(" ")) return true;
  const [small, big] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  if ([...small].every((t) => big.has(t))) return true;
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared += 1;
  const union = new Set([...sa, ...sb]).size;
  return shared / union >= 0.5;
}

// Items already on the menu that look like the dish being typed. Returns []
// when the chosen course is exempt (supplies, something else) or the query
// is too short to judge. Only food-course items are compared.
export function findRepeats(query, category, items, editingId, courses) {
  const foodIds = new Set(courses.filter((c) => c.food).map((c) => c.id));
  if (category && !foodIds.has(category)) return [];
  const tokens = dishTokens(query);
  if (tokens.join("").length < 3) return [];
  return items.filter(
    (i) =>
      i.id !== editingId &&
      foodIds.has(i.category) &&
      dishesMatch(tokens, dishTokens(i.item_name)),
  );
}

function keywordHits(keyword, itemTokens) {
  const kws = dishTokens(keyword);
  if (kws.length === 0) return false;
  return kws.every((k) =>
    itemTokens.some((t) => t === k || (k.length >= 4 && t.startsWith(k))),
  );
}

export function ideaClaimed(idea, items) {
  return items.some((i) => {
    const tokens = dishTokens(i.item_name);
    return idea.keywords.some((kw) => keywordHits(kw, tokens));
  });
}

export function openIdeas(ideas, items) {
  return ideas.filter((idea) => !ideaClaimed(idea, items));
}
