// Gala Seating planner · turn the free-text "Do you have a seating preference with
// another guest or group?" answer into structured `guest.prefs`.
//
// Real answers look like: "State Representative Ana Ruiz, Jr." ·
// "no preference but seat with the Acme people." · "YTT '26 cohort people" ·
// "seat with tickets Luisa Ortega purchased." · "Ideally, Bea, Liz, Vero, Maggie".
// Anything the resolver cannot pin down lands in `prefs.unresolved` so a human reads it,
// which is always better than a confident wrong link.
//
// Pure ES module: no DOM, no Node APIs, never mutates its inputs.

import { emptyPrefs } from "./model.js";
import { normName, namesMatch, emailDomain, cleanText } from "./matching.js";

/* ------------------------------------------------------------------ *
 * vocabulary
 * ------------------------------------------------------------------ */

const YTT_RE = /\bytt\b|teacher\s*training|\bcohort\b|\btt\s*'?\d{2}\b/i;

const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com",
  "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "comcast.net",
  "sbcglobal.net", "att.net", "verizon.net", "protonmail.com", "proton.me", "mail.com",
  "gmx.com", "zoho.com", "yopmail.com", "example.com",
]);

// Second-level labels that are never the organization itself.
const DOMAIN_NOISE = new Set(["com", "org", "net", "edu", "gov", "co", "us", "io", "info", "biz"]);

const HEARD_STOPWORDS = new Set([
  "the", "and", "from", "with", "for", "was", "were", "have", "has", "had", "this", "that",
  "they", "them", "their", "there", "here", "about", "been", "being", "into", "onto", "over",
  "our", "out", "you", "your", "his", "her", "him", "she", "hers", "who", "whom", "what",
  "when", "where", "how", "why", "not", "but", "all", "any", "one", "two", "some", "more",
  "most", "other", "another", "just", "like", "know", "knew", "told", "heard", "hear",
  "through", "thru", "via", "word", "mouth", "friend", "friends", "family", "member",
  "members", "sister", "brother", "cousin", "coworker", "colleague", "work", "works",
  "working", "email", "newsletter", "instagram", "facebook", "twitter", "tiktok", "social",
  "media", "online", "internet", "google", "search", "website", "site", "post", "posts",
  "story", "stories", "reel", "reels", "event", "events", "class", "classes", "studio",
  "yoga", "gala", "lsp", "latina", "sweat", "project", "invite", "invited", "invitation",
  "ticket", "tickets", "board", "staff", "team", "teacher", "instructor", "community",
  "attended", "attend", "went", "past", "year", "years", "since", "new", "long", "time",
  "times", "many", "very", "much", "also", "both", "well", "back", "first", "last", "next",
]);

const TITLE_RE = new RegExp(
  "\\b(state\\s+representative|representative|rep|senator|sen|state\\s+senator|alderman|alderwoman|alderperson|alder|commissioner|councilman|councilwoman|councilmember|mayor|judge|governor|congressman|congresswoman|congressmember|doctor|dr|prof|professor|honorable|hon|mr|mrs|ms|miss|mx)\\.?\\s+",
  "gi"
);
const SUFFIX_RE = /,?\s*\b(jr|sr|ii|iii|iv|phd|ph\.?d|m\.?d|md|esq|dds|rn|cpa|mba)\b\.?/gi;

const TICKETS_PURCHASED_RE =
  /\btickets?\b\s*(?:that\s+|which\s+|were\s+)?([^,;|]+?)\s+(?:purchased|bought|paid\s+for|got|ordered)\b/i;

const FILLER_PATTERNS = [
  /\bno\s+(?:seating\s+)?(?:preference|pref|preferences)\b/gi,
  /\bnot?\s*\/?\s*a\b/gi,
  /\bnone\b/gi,
  /\bsame\s+as\s+(?:number\s+)?(?:one|1|above|the\s+first|first)\b/gi,
  /\bsee\s+above\b/gi,
  /\bas\s+above\b/gi,
  /\bi\s*(?:would|'d|d)\b/gi,
  /\bwe\s*(?:would|'d|d)\b/gi,
  /\b(?:would\s+)?like\s+to\b/gi,
  /\bwould\s+like\b/gi,
  /\bprefer(?:ably)?\b/gi,
  /\bideally\b/gi,
  /\bplease\b/gi,
  /\bkindly\b/gi,
  /\bif\s+possible\b/gi,
  /\bhopefully\b/gi,
  /\bmaybe\b/gi,
  /\bpossibly\b/gi,
  /\bseat(?:ed|ing)?\b/gi,
  /\bsit(?:ting)?\b/gi,
  /\bplace(?:d)?\b/gi,
  /\bput\b/gi,
  /\bme\b/gi,
  /\bus\b/gi,
  /\bmy\b/gi,
  /\bour\b/gi,
  /\bthe\b/gi,
  /\bany\b/gi,
  /\ball\b/gi,
  /\bsome\b/gi,
  /\bother(?:s)?\b/gi,
  /\bpeople\b/gi,
  /\bpeers?\b/gi,
  /\bfolks\b/gi,
  /\bperson\b/gi,
  /\bguests?\b/gi,
  /\bcrew\b/gi,
  /\bgang\b/gi,
  /\bbuddies\b/gi,
  /\bgroup(?:s)?\b/gi,
  /\btables?\b/gi,
  /\bbut\b/gi,
  /\bor\b/gi,
  /\bat\b/gi,
  /\bto\b/gi,
  /\bof\b/gi,
  /\bis\b/gi,
  /\bare\b/gi,
];

// Common nickname <-> given-name pairs, expanded both ways at build time.
const NICKNAME_PAIRS = [
  ["liz", "elizabeth"], ["lizzy", "elizabeth"], ["beth", "elizabeth"], ["eli", "elizabeth"],
  ["vero", "veronica"], ["gigi", "giselle"], ["gigi", "gisselle"], ["gigi", "gisele"],
  ["jess", "jessica"], ["jessie", "jessica"], ["maggie", "margarita"], ["maggie", "margaret"],
  ["marge", "margarita"], ["rita", "margarita"], ["alex", "alejandra"], ["alex", "alejandro"],
  ["alex", "alexandra"], ["alex", "alexander"], ["alex", "alexis"], ["ale", "alejandra"],
  ["ale", "alejandro"], ["gaby", "gabriela"], ["gabby", "gabriela"], ["gaby", "gabriella"],
  ["mari", "maria"], ["mari", "mariana"], ["mari", "marisol"], ["lupe", "guadalupe"],
  ["paco", "francisco"], ["pancho", "francisco"], ["fran", "francisca"], ["fran", "francisco"],
  ["chuy", "jesus"], ["pepe", "jose"], ["joe", "jose"], ["joe", "joseph"], ["nacho", "ignacio"],
  ["memo", "guillermo"], ["toni", "antonia"], ["tony", "antonio"], ["tona", "antonia"],
  ["sandy", "sandra"], ["vicky", "victoria"], ["vicki", "victoria"], ["angie", "angelica"],
  ["angie", "angela"], ["rosie", "rosa"], ["rosy", "rosa"], ["lucy", "lucia"],
  ["kathy", "katherine"], ["kate", "katherine"], ["katie", "katherine"], ["cathy", "catherine"],
  ["steve", "steven"], ["steve", "stephen"], ["mike", "michael"], ["mikey", "michael"],
  ["chris", "christopher"], ["chris", "christina"], ["chris", "cristina"], ["cris", "cristina"],
  ["nick", "nicolas"], ["nick", "nicholas"], ["nicki", "nicole"], ["dani", "daniela"],
  ["dani", "daniel"], ["dani", "danielle"], ["danny", "daniel"], ["bea", "beatriz"],
  ["rick", "ricardo"], ["rick", "richard"], ["rob", "roberto"], ["rob", "robert"],
  ["bobby", "roberto"], ["dave", "david"], ["jenny", "jennifer"], ["jen", "jennifer"],
  ["sam", "samantha"], ["sam", "samuel"], ["ben", "benjamin"], ["matt", "matthew"],
  ["pat", "patricia"], ["pat", "patrick"], ["patty", "patricia"], ["sue", "susana"],
  ["sue", "susan"], ["susy", "susana"], ["deb", "deborah"], ["cindy", "cynthia"],
  ["becky", "rebecca"], ["kim", "kimberly"], ["caro", "carolina"], ["caro", "carolyn"],
  ["vale", "valeria"], ["fer", "fernanda"], ["fer", "fernando"], ["isa", "isabel"],
  ["isa", "isabella"], ["nat", "natalia"], ["nat", "natalie"], ["vivi", "viviana"],
  ["evy", "evelyn"], ["eve", "evelyn"], ["bren", "brenda"], ["yaz", "yazmin"],
  ["jazz", "jazmin"], ["xochy", "xochitl"], ["xochyl", "xochitl"], ["lety", "leticia"],
  ["chelo", "consuelo"], ["mony", "monica"], ["moni", "monica"], ["gio", "giovanni"],
  ["gio", "giovanna"], ["andy", "andrea"], ["andy", "andres"], ["lalo", "eduardo"],
  ["ed", "eduardo"], ["eddie", "eduardo"], ["will", "william"], ["billy", "william"],
  ["jim", "james"], ["jimmy", "james"], ["tom", "thomas"], ["tommy", "thomas"],
  ["brad", "bradley"], ["greg", "gregory"], ["jeff", "jeffrey"], ["ken", "kenneth"],
  ["larry", "lawrence"], ["ted", "theodore"], ["tim", "timothy"], ["dom", "dominic"],
  ["nando", "fernando"], ["mel", "melissa"], ["liss", "melissa"], ["steph", "stephanie"],
  ["val", "valerie"], ["val", "valeria"], ["abby", "abigail"], ["adri", "adriana"],
  ["clau", "claudia"], ["lore", "lorena"], ["noe", "noemi"], ["pao", "paola"],
  ["pri", "priscila"], ["yola", "yolanda"], ["zuly", "zulema"],
];

const NICKNAMES = (() => {
  const map = new Map();
  const add = (a, b) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a).add(b);
  };
  for (const [nick, given] of NICKNAME_PAIRS) { add(nick, given); add(given, nick); }
  return map;
})();

function expandFirstName(token) {
  const set = new Set([token]);
  for (const alt of NICKNAMES.get(token) || []) set.add(alt);
  return set;
}

/* ------------------------------------------------------------------ *
 * text helpers
 * ------------------------------------------------------------------ */

function stripEmoji(s) {
  // No \p{Extended_Pictographic} so this stays safe on older engines.
  return s
    .replace(/[←-⯿☀-➿︀-️‍]/g, " ")
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, " ")
    .replace(/\s*:\s*[dDpP)(]\s*/g, " ");
}

export function stripTitles(s) {
  return s.replace(SUFFIX_RE, " ").replace(TITLE_RE, " ").replace(/\s+/g, " ").trim();
}

const SPLIT_RE = /\s*(?:,|;|\||&|\+|\/|\band\b|\by\b|\bwith\b|\bnear\b|\bnext\s+to\b|\bplus\b|\balongside\b|\bbeside\b)\s*/gi;

export function splitFragments(note) {
  const cleaned = stripTitles(stripEmoji(cleanText(note)))
    // "N/A" must not be split into "N" and "A" by the slash.
    .replace(/\bn\s*[/.]\s*a\b/gi, " ")
    .replace(/\bnot\s+applicable\b/gi, " ")
    .replace(/^[\s.\-–—]*$/, "")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(SPLIT_RE)
    .map((f) => f.replace(/^[\s.!?:-]+|[\s.!?:-]+$/g, "").trim())
    .filter(Boolean);
}

function stripFiller(fragment) {
  let s = ` ${fragment} `;
  for (const re of FILLER_PATTERNS) s = s.replace(re, " ");
  s = s.replace(/[^\p{L}\p{N}\s'.-]+/gu, " ");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Is an unmatched fragment worth putting in front of a human, or is it just prose?
 *
 * People write "Please seat us with Rosalinda Teran's group, we are coming together." The
 * name resolves; "we are coming together" is conversation, and flagging it trains the
 * planner to ignore the warnings. The test is orthographic rather than a word list: a
 * fragment is worth flagging when it still holds a capitalized word that is not just the
 * capital at the start of the sentence. Notes written in all lower case therefore never
 * get suppressed to nothing - see the fallback in resolvePreferences.
 */
function looksLikeAReference(fragment, noteFirstWord) {
  for (const rawToken of String(fragment).split(/\s+/)) {
    const token = rawToken.replace(/[^\p{L}\p{N}'’-]/gu, "");
    if (token.length < 2) continue;
    if (!/^\p{Lu}/u.test(token)) continue;
    if (normName(token) === noteFirstWord) continue;
    return true;
  }
  return false;
}

function firstToken(name) {
  const n = normName(name);
  return n ? n.split(" ")[0] : "";
}

/* ------------------------------------------------------------------ *
 * groups
 * ------------------------------------------------------------------ */

export function groupLabel(key) {
  if (key === "ytt26") return "the YTT '26 cohort";
  return `the ${key.charAt(0).toUpperCase()}${key.slice(1)} group`;
}

function wordRe(word) {
  return new RegExp(`(?:^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`, "i");
}

/**
 * Everyone who belongs to a group key: whoever asked for it explicitly, plus - for an
 * organization key like "acme" - anyone whose note, "how did you hear", buyer email
 * domain or party label mentions it.
 * @returns {Array} guests, in input order
 */
export function groupMembers(guests, groupKey) {
  const key = String(groupKey || "").toLowerCase();
  if (!key) return [];
  const list = Array.isArray(guests) ? guests : Object.values(guests || {});
  const re = key === "ytt26" ? YTT_RE : wordRe(key);
  return list.filter((g) => {
    if (!g) return false;
    if (g.prefs && Array.isArray(g.prefs.groups) && g.prefs.groups.includes(key)) return true;
    const hay = `${g.seatingNote || ""} ${g.heardAbout || ""} ${g.partyLabel || ""} ${emailDomain(g.buyerEmail)}`;
    return re.test(hay);
  });
}

/* ------------------------------------------------------------------ *
 * the resolver
 * ------------------------------------------------------------------ */

function buildIndex(guests) {
  const real = guests.filter((g) => !g.placeholder);
  const byFirst = new Map();
  for (const g of real) {
    const f = firstToken(g.name);
    if (!f) continue;
    if (!byFirst.has(f)) byFirst.set(f, []);
    byFirst.get(f).push(g);
  }

  // Party -> label / buyer name, for "sit with the X table" and "tickets X purchased".
  const parties = new Map();
  for (const g of guests) {
    if (!g.partyId) continue;
    if (!parties.has(g.partyId)) {
      parties.set(g.partyId, {
        id: g.partyId,
        label: g.partyLabel || g.buyerName || "",
        buyerName: g.buyerName || "",
        ticketed: false,
      });
    }
    if (!g.unmatched) parties.get(g.partyId).ticketed = true;
  }

  // Organization vocabulary: email domains carry the strongest signal, "how did you
  // hear about LSP" answers are accepted only when at least two guests share the word.
  const domainWords = new Set();
  for (const g of guests) {
    for (const email of [g.buyerEmail, g.email]) {
      const dom = emailDomain(email);
      if (!dom || FREEMAIL.has(dom)) continue;
      for (const part of dom.split(".")) {
        if (part.length >= 3 && !DOMAIN_NOISE.has(part)) domainWords.add(part);
      }
    }
  }
  const heardCount = new Map();
  for (const g of guests) {
    const words = new Set(normName(g.heardAbout).split(" ").filter((w) => w.length >= 3 && !HEARD_STOPWORDS.has(w)));
    for (const w of words) heardCount.set(w, (heardCount.get(w) || 0) + 1);
  }
  const nameWords = new Set();
  for (const g of real) for (const t of normName(g.name).split(" ")) if (t) nameWords.add(t);
  for (const g of guests) for (const t of normName(g.buyerName).split(" ")) if (t) nameWords.add(t);

  const isOrgWord = (word) => {
    if (!word || word.length < 3) return false;
    if (domainWords.has(word)) return true;
    return (heardCount.get(word) || 0) >= 2 && !nameWords.has(word);
  };

  return { real, byFirst, parties, isOrgWord };
}

/**
 * A name typed on the dinner form can create a second, ticketless "party" of unmatched
 * responses under the same organizer name. When both match, the party that actually holds
 * tickets is the one the planner means.
 */
function pickParty(hits) {
  if (hits.length === 1) return hits[0];
  const ticketed = hits.filter((p) => p.ticketed);
  return ticketed.length === 1 ? ticketed[0] : null;
}

function resolveName(fragment, ctx, self) {
  const tokens = normName(fragment).split(" ").filter(Boolean);
  if (!tokens.length) return null;

  if (tokens.length >= 2) {
    const guestHits = ctx.real.filter((g) => g.id !== self.id && namesMatch(fragment, g.name));
    if (guestHits.length) return { guestIds: guestHits.map((g) => g.id) };
    const party = pickParty([...ctx.parties.values()].filter((p) => p.buyerName && namesMatch(fragment, p.buyerName)));
    return party ? { partyIds: [party.id] } : null;
  }

  // One word: resolve only when it is unambiguous, nicknames included.
  const wanted = expandFirstName(tokens[0]);
  const hits = [];
  const seen = new Set();
  for (const w of wanted) {
    for (const g of ctx.byFirst.get(w) || []) {
      if (g.id === self.id || seen.has(g.id)) continue;
      seen.add(g.id);
      hits.push(g);
    }
  }
  if (hits.length === 1) return { guestIds: [hits[0].id] };
  return null;
}

function resolveTicketsPurchased(fragment, ctx, self) {
  const m = TICKETS_PURCHASED_RE.exec(fragment);
  if (!m) return null;
  const who = stripTitles(m[1] || "").trim();
  if (!who) return null;
  const party = pickParty([...ctx.parties.values()].filter(
    (p) => (p.buyerName && namesMatch(who, p.buyerName)) || (p.label && namesMatch(who, p.label))
  ));
  if (party) return { partyIds: [party.id] };
  // Fall back to a guest whose party we can borrow.
  const guestHits = ctx.real.filter((g) => namesMatch(who, g.name));
  if (guestHits.length === 1 && guestHits[0].partyId) return { partyIds: [guestHits[0].partyId] };
  return null;
}

/**
 * Fill in `prefs` for every guest. Returns new guest objects; inputs are untouched.
 * @param {Array|Object} guests
 * @returns {Array} guests with prefs
 */
export function resolvePreferences(guests) {
  const list = (Array.isArray(guests) ? guests : Object.values(guests || {})).filter(Boolean);
  const ctx = buildIndex(list);

  return list.map((guest) => {
    const prefs = emptyPrefs();
    const note = cleanText(guest.seatingNote);
    const withGuestIds = new Set();
    const withPartyIds = new Set();
    const groups = new Set();
    const pending = [];
    let hits = 0;
    const noteFirstWord = normName(note).split(" ")[0] || "";

    for (const fragment of splitFragments(note)) {
      if (YTT_RE.test(fragment)) { groups.add("ytt26"); hits++; continue; }

      const purchased = resolveTicketsPurchased(fragment, ctx, guest);
      if (purchased) {
        for (const id of purchased.partyIds || []) withPartyIds.add(id);
        hits++;
        continue;
      }

      const cleaned = stripFiller(fragment);
      if (!cleaned) continue; // pure filler, e.g. "no preference"

      const words = normName(cleaned).split(" ").filter(Boolean);
      const orgWord = words.find((w) => ctx.isOrgWord(w));
      const looksLikeAName = words.length >= 2
        ? ctx.real.some((g) => namesMatch(cleaned, g.name)) ||
          [...ctx.parties.values()].some((p) => p.buyerName && namesMatch(cleaned, p.buyerName))
        : (ctx.byFirst.has(words[0]) || [...expandFirstName(words[0])].some((w) => ctx.byFirst.has(w)));
      if (orgWord && !looksLikeAName) { groups.add(orgWord); hits++; continue; }

      const named = resolveName(cleaned, ctx, guest);
      if (named) {
        for (const id of named.guestIds || []) withGuestIds.add(id);
        for (const id of named.partyIds || []) withPartyIds.add(id);
        hits++;
        continue;
      }

      if (orgWord) { groups.add(orgWord); hits++; continue; }
      pending.push(fragment);
    }

    let unresolved = pending.filter((f) => looksLikeAReference(f, noteFirstWord));
    // Never let a note vanish in silence: if nothing resolved and nothing survived the
    // prose filter, put the whole note in front of the planner once.
    if (!unresolved.length && !hits && pending.length) unresolved = [note];

    withGuestIds.delete(guest.id);
    withPartyIds.delete(guest.partyId);

    prefs.withGuestIds = [...withGuestIds].sort();
    prefs.withPartyIds = [...withPartyIds].sort();
    prefs.groups = [...groups].sort();
    prefs.unresolved = unresolved;
    if (!note || (!hits && !unresolved.length)) prefs.status = "none";
    else if (hits && unresolved.length) prefs.status = "partial";
    else if (hits) prefs.status = "resolved";
    else prefs.status = "unresolved";

    return { ...guest, prefs };
  });
}
