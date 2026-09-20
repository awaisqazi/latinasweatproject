// Gala Seating planner · spreadsheet rows -> guests, and a fresh import merged into an
// existing plan without losing a single seat the planner already placed.
//
// Why this is not a straight read of the ticket export: Zeffy copies the BUYER's name
// into the guest-name columns on every row, so a buyer with five tickets shows up as
// five rows of the same name. The rows tell us how many seats a party holds, not who
// sits in them. The names come from the dinner-selection form, matched back to buyers
// with the capacity-aware attribution in matching.js. Whatever is left over is an
// honest "Guest of X (3)" placeholder rather than a guessed name.
//
// Pure ES module: no DOM, no Node APIs, never mutates its inputs.

import { MEALS, emptyPrefs } from "./model.js";
import {
  parseTickets, parseResponses, parseOverrides, matchSelections,
  normName, normEmail, looksLikeEmail, namesMatch, cleanText, stableId, fnv1a,
} from "./matching.js";
import { resolvePreferences } from "./preferences.js";

const SAME_AS_RE = /^\s*(?:same(?:\s+as)?(?:\s+(?:number|no\.?|#)?\s*(?:one|1|first|above))?|as\s+above|see\s+above|ditto)\s*[.!]*\s*$/i;

function mealIdFor(selection) {
  const text = cleanText(selection);
  if (!text) return null;
  for (const m of MEALS) if (m.match && m.match.test(text)) return m.id;
  return null;
}

function uniqueId(base, used) {
  if (!used.has(base)) { used.add(base); return base; }
  let n = 2;
  while (used.has(`${base}d${n}`)) n++;
  const id = `${base}d${n}`;
  used.add(id);
  return id;
}

function blankGuest() {
  return {
    id: "", name: "", partyId: "", partyLabel: "", buyerName: "", buyerEmail: "",
    ticketType: "unknown", ticketNumbers: [], hasDinner: true, meal: null, mealRaw: "",
    phone: "", email: "", seatingNote: "", heardAbout: "", placeholder: false,
    unmatched: false, tags: [], plannerNote: "", prefs: emptyPrefs(), source: "import",
  };
}

/**
 * Build the guest list from the Zeffy ticket export, the dinner-selection responses and
 * an optional overrides sheet. Every argument is an array-of-arrays INCLUDING the header
 * row (SheetJS `sheet_to_json(ws, { header: 1 })`), and any of them may be null.
 *
 * @param {{ticketRows?: Array|null, mealRows?: Array|null, overrideRows?: Array|null}} input
 * @returns {{guests: Array, report: Object}}
 */
export function buildGuestsFromRows({ ticketRows = null, mealRows = null, overrideRows = null } = {}) {
  const notes = [];
  const parsedTickets = parseTickets(ticketRows);
  const parsedResponses = parseResponses(mealRows);
  const overrides = parseOverrides(overrideRows);

  if (!parsedTickets.tickets.length && !parsedResponses.responses.length) {
    return {
      guests: [],
      report: {
        tickets: 0, dinnerTickets: 0, responses: 0, attributed: 0, unattributed: 0,
        placeholders: 0, duplicates: 0,
        notes: ["Nothing to import: neither sheet had a header row plus at least one data row."],
      },
    };
  }
  if (parsedTickets.missingHeaders.length) {
    notes.push(`The ticket sheet is missing the ${parsedTickets.missingHeaders.join(" and ")} column, so parties may be wrong.`);
  }
  if (parsedResponses.missingHeaders.length && mealRows) {
    notes.push(`The dinner sheet is missing the ${parsedResponses.missingHeaders.join(" and ")} column.`);
  }
  if (!parsedTickets.tickets.length) {
    notes.push("No ticket export was provided, so every dinner response is listed as an unmatched guest with no ticket.");
  }
  if (!parsedResponses.responses.length) {
    notes.push("No dinner responses were provided, so every seat past the buyer is an unnamed placeholder.");
  }

  const match = matchSelections(parsedTickets.tickets, parsedResponses.responses, overrides);
  const guests = [];
  const usedIds = new Set();
  let placeholders = 0;

  for (const buyer of match.buyers) {
    const tickets = buyer.tickets.slice().sort((a, b) => a.order - b.order);

    // "Same as number one" on a later row means the note from this buyer's first row.
    const firstNote = (() => {
      for (const t of tickets) {
        const n = cleanText(t.seatingNote);
        if (n && !SAME_AS_RE.test(n)) return n;
      }
      return "";
    })();

    const partyId = looksLikeEmail(buyer.buyerEmail) ? normEmail(buyer.buyerEmail) : `solo:${fnv1a(buyer.buyerKey)}`;
    const partyLabel = buyer.buyerName || buyer.buyerEmail || "Unnamed buyer";
    const idBase = looksLikeEmail(buyer.buyerEmail) ? normEmail(buyer.buyerEmail) : buyer.buyerKey;

    // Does a dinner response already speak for the buyer themself?
    let buyerSeatTaken = tickets.some(
      (t) => t.coveredBy && buyer.buyerName && namesMatch(t.coveredBy.guestName, buyer.buyerName)
    );

    tickets.forEach((ticket, i) => {
      const position = i + 1;
      const rawNote = cleanText(ticket.seatingNote);
      const seatingNote = rawNote && SAME_AS_RE.test(rawNote) ? firstNote : rawNote;

      const g = blankGuest();
      g.partyId = partyId;
      g.partyLabel = partyLabel;
      g.buyerName = buyer.buyerName;
      g.buyerEmail = normEmail(buyer.buyerEmail);
      g.ticketType = ticket.ticketTypeId;
      g.ticketNumbers = ticket.ticketNumber ? [ticket.ticketNumber] : [];
      g.hasDinner = ticket.hasDinner;
      g.seatingNote = seatingNote;
      g.heardAbout = ticket.heardAbout;

      if (ticket.coveredBy) {
        const resp = ticket.coveredBy;
        g.name = resp.guestName || buyer.buyerName || `Guest of ${partyLabel} (${position})`;
        g.meal = mealIdFor(resp.selection);
        g.mealRaw = cleanText(resp.selection);
        g.phone = resp.phone || "";
        g.email = resp.email || "";
        g.id = uniqueId(stableId("g", `${idBase}|${normName(g.name)}`), usedIds);
      } else if (!buyerSeatTaken && buyer.buyerName) {
        // The buyer is a real person in a real seat, so name them rather than hide them
        // behind a placeholder.
        buyerSeatTaken = true;
        g.name = buyer.buyerName;
        g.id = uniqueId(stableId("g", `${idBase}|${normName(buyer.buyerName)}`), usedIds);
      } else {
        g.name = `Guest of ${partyLabel} (${position})`;
        g.placeholder = true;
        g.placeholderIndex = position;
        g.id = uniqueId(stableId("g", `${idBase}#${position}`), usedIds);
        placeholders++;
      }

      guests.push(g);
    });
  }

  // Dinner responses that never landed on a ticket: comps, honorees, staff, late-night
  // guests who filled the form in anyway, and table organizers we could not place.
  for (const resp of match.responses) {
    if (resp.used) continue;
    const purchaserNorm = normName(resp.purchaserName);
    const g = blankGuest();
    g.name = resp.guestName || "Unnamed dinner response";
    g.partyId = purchaserNorm ? `u:${purchaserNorm}` : `u:solo:${fnv1a(normName(g.name))}`;
    g.partyLabel = resp.purchaserName || "No matching ticket";
    g.buyerName = resp.purchaserName || "";
    g.buyerEmail = "";
    g.ticketType = "unknown";
    g.hasDinner = true;
    g.unmatched = true;
    g.meal = mealIdFor(resp.selection);
    g.mealRaw = cleanText(resp.selection);
    g.phone = resp.phone || "";
    g.email = resp.email || "";
    g.id = uniqueId(stableId("g", `u:${purchaserNorm}|${normName(g.name)}`), usedIds);
    guests.push(g);
  }

  // ---- report -------------------------------------------------------------
  const dinnerTickets = parsedTickets.tickets.filter((t) => t.hasDinner).length;
  const lateNight = parsedTickets.tickets.length - dinnerTickets;
  const unmatchedGuests = guests.filter((g) => g.unmatched).length;

  const nameCounts = new Map();
  for (const g of guests) {
    if (g.placeholder) continue;
    const key = normName(g.name);
    if (!key) continue;
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }
  const duplicates = [...nameCounts.values()].filter((n) => n > 1).length;

  if (parsedTickets.tickets.length) {
    notes.push(`${parsedTickets.tickets.length} ticket rows from ${match.buyers.length} buyers, ${dinnerTickets} of them dinner seats.`);
  }
  const mirrored = parsedTickets.tickets.filter((t) => t.guestMirrorsBuyer).length;
  if (mirrored && mirrored === parsedTickets.tickets.length) {
    notes.push("Zeffy copied each buyer's name onto every one of their ticket rows, so the export cannot say who the other guests are. Names come from the dinner form; the rest stay placeholders.");
  }
  if (lateNight) notes.push(`${lateNight} late-night tickets have no dinner seat.`);
  if (parsedResponses.duplicatesDropped) {
    notes.push(`${parsedResponses.duplicatesDropped} duplicate dinner submissions were dropped, keeping the latest per guest.`);
  }
  if (unmatchedGuests) notes.push(`${unmatchedGuests} dinner responses did not match a ticket.`);
  if (placeholders) notes.push(`${placeholders} seats are still unnamed placeholders.`);
  if (duplicates) notes.push(`${duplicates} possible duplicate names.`);
  if (parsedTickets.skipped) notes.push(`${parsedTickets.skipped} ticket rows were skipped as refunded or cancelled.`);
  for (const group of match.unattributedGroups.slice(0, 6)) {
    notes.push(`"${group.purchaserName}" has ${group.count} dinner selections with no ticket match (${group.reason}).`);
  }
  if (match.unattributedGroups.length > 6) {
    notes.push(`...and ${match.unattributedGroups.length - 6} more purchaser names with no ticket match.`);
  }

  return {
    guests: resolvePreferences(guests),
    report: {
      tickets: parsedTickets.tickets.length,
      dinnerTickets,
      lateNightTickets: lateNight,
      buyers: match.buyers.length,
      responses: parsedResponses.rawCount,
      responsesDeduped: parsedResponses.responses.length,
      attributed: match.stats.attributed,
      unattributed: match.stats.unattributed,
      placeholders,
      duplicates,
      unmatchedGuests,
      notes,
    },
  };
}

/* ------------------------------------------------------------------ *
 * merging a fresh import into a live plan
 * ------------------------------------------------------------------ */

// Everything the spreadsheet owns. Anything not listed here belongs to the planner.
const IMPORTED_FIELDS = [
  "partyId", "partyLabel", "buyerName", "buyerEmail", "ticketType", "ticketNumbers",
  "hasDinner", "meal", "mealRaw", "phone", "email", "seatingNote", "heardAbout",
  "placeholder", "placeholderIndex", "unmatched", "prefs",
];

// What a claimed guest keeps from the dinner form, because that is still the only place
// those answers come from. Everything else about them is the planner's decision.
const CLAIM_REFRESHABLE = ["phone", "email"];

function placeholderNumber(guest) {
  if (typeof guest.placeholderIndex === "number") return guest.placeholderIndex;
  const m = /\((\d+)\)\s*$/.exec(guest.name || "");
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/** Imported fields the planner has taken ownership of by editing them in the app. */
function lockedFields(guest) {
  const locked = new Set(Array.isArray(guest.editedFields) ? guest.editedFields.filter((f) => typeof f === "string") : []);
  if (guest.nameEdited) locked.add("name");
  // Picking an entrée by hand owns the text that goes with it.
  if (locked.has("meal")) locked.add("mealRaw");
  return locked;
}

function isEmptyValue(value) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

/**
 * The planner reconciled this person: they were a dinner response with no ticket, and a
 * human gave them a real seat. The spreadsheet still does not know that, so a re-import
 * must not drag them back to "no matching ticket".
 */
function isClaimed(existing, incoming) {
  return !existing.unmatched && incoming.unmatched === true;
}

/**
 * Fold a fresh import into an existing plan. Seats, tags, planner notes and manual name
 * edits survive; nothing is ever deleted behind the planner's back.
 *
 * @param {Object} plan
 * @param {Array} guests fresh guests from buildGuestsFromRows
 * @returns {{plan: Object, summary: {added:number, updated:number, kept:number, missing:Array}}}
 */
export function mergeGuestsIntoPlan(plan, guests) {
  const incoming = (Array.isArray(guests) ? guests : Object.values(guests || {})).filter(Boolean);
  const nextGuests = {};
  for (const [id, g] of Object.entries(plan.guests || {})) nextGuests[id] = { ...g };
  const nextSeating = { ...(plan.seating || {}) };

  const incomingIds = new Set(incoming.map((g) => g.id));
  let added = 0;
  let updated = 0;
  let suppressedPlaceholders = 0;
  const freshlyNamed = [];
  const claimedIds = new Set();

  // One seat per ticket, so the number of incoming guests in a party IS that party's
  // capacity. Used below to stop a deleted placeholder coming back to life.
  const capacity = new Map();
  for (const g of incoming) capacity.set(g.partyId, (capacity.get(g.partyId) || 0) + 1);
  const headcount = (partyId) => {
    let n = 0;
    for (const g of Object.values(nextGuests)) if (g.partyId === partyId) n++;
    return n;
  };

  const updateExisting = (existing, g) => {
    const locked = lockedFields(existing);
    const merged = { ...existing };

    if (isClaimed(existing, g)) {
      // Keep every party and ticket field the planner gave them; take only the answers
      // that still come from the dinner form, and only when the form actually has one.
      for (const key of CLAIM_REFRESHABLE) {
        if (!locked.has(key) && !isEmptyValue(g[key])) merged[key] = g[key];
      }
      if (!locked.has("meal") && g.meal != null) {
        merged.meal = g.meal;
        merged.mealRaw = g.mealRaw;
      }
      merged.unmatched = false;
      merged.placeholder = false;
      claimedIds.add(existing.id);
    } else {
      for (const key of IMPORTED_FIELDS) {
        if (locked.has(key)) continue;
        // An empty sheet cell never erases an entrée the planner already has.
        if ((key === "meal" || key === "mealRaw") && g.meal == null && existing.meal != null) continue;
        if (key in g) merged[key] = g[key];
        else delete merged[key];
      }
      if (!locked.has("name")) merged.name = g.name;
    }

    merged.tags = Array.isArray(existing.tags) ? existing.tags : [];
    merged.plannerNote = existing.plannerNote || "";
    merged.source = existing.source === "manual" ? "manual" : "import";
    if (existing.nameEdited) merged.nameEdited = true;
    if (Array.isArray(existing.editedFields) && existing.editedFields.length) {
      merged.editedFields = [...existing.editedFields];
    }
    return merged;
  };

  // Named guests first, so real names take the seats before any placeholder asks for one.
  const incomingNamed = incoming.filter((g) => !g.placeholder);
  const incomingPlaceholders = incoming.filter((g) => g.placeholder)
    .sort((a, b) =>
      (a.partyId < b.partyId ? -1 : a.partyId > b.partyId ? 1 : 0) ||
      placeholderNumber(a) - placeholderNumber(b) ||
      (a.id < b.id ? -1 : 1));

  for (const g of incomingNamed) {
    const existing = nextGuests[g.id];
    if (!existing) {
      nextGuests[g.id] = { ...g };
      added++;
      if (!g.unmatched) freshlyNamed.push(g);
      continue;
    }
    nextGuests[g.id] = updateExisting(existing, g);
    updated++;
  }

  // A placeholder that has since gained a real name keeps its seat: hand the seat to the
  // new named guest of the same party and retire the placeholder.
  const droppedPlaceholders = Object.values(nextGuests)
    .filter((g) => g.placeholder && g.source !== "manual" && !incomingIds.has(g.id))
    .sort((a, b) => placeholderNumber(a) - placeholderNumber(b));

  const seatedByParty = new Map();
  for (const ph of droppedPlaceholders) {
    if (!nextSeating[ph.id]) continue;
    if (!seatedByParty.has(ph.partyId)) seatedByParty.set(ph.partyId, []);
    seatedByParty.get(ph.partyId).push(ph);
  }

  const migrated = new Set();
  for (const g of freshlyNamed) {
    const queue = seatedByParty.get(g.partyId);
    if (!queue || !queue.length) continue;
    const ph = queue.shift();
    nextSeating[g.id] = { ...nextSeating[ph.id] };
    delete nextSeating[ph.id];
    delete nextGuests[ph.id];
    migrated.add(ph.id);
  }

  // Placeholders last, and only into seats the party actually still has. A placeholder
  // the planner deleted because a real diner claimed that seat must not reappear and give
  // the party an extra head; the highest-numbered ones are the first to be dropped.
  for (const g of incomingPlaceholders) {
    const existing = nextGuests[g.id];
    if (existing) {
      nextGuests[g.id] = updateExisting(existing, g);
      updated++;
      continue;
    }
    const seats = capacity.get(g.partyId) || 0;
    if (headcount(g.partyId) >= seats) { suppressedPlaceholders++; continue; }
    nextGuests[g.id] = { ...g };
    added++;
  }

  // A claimed guest keeps the seating note that came with the ticket, so their
  // preferences are re-read from it. Nobody else's prefs are touched here.
  if (claimedIds.size) {
    for (const g of resolvePreferences(Object.values(nextGuests))) {
      if (claimedIds.has(g.id)) nextGuests[g.id] = { ...nextGuests[g.id], prefs: g.prefs };
    }
  }

  const missing = Object.values(nextGuests).filter(
    (g) => !incomingIds.has(g.id) && g.source !== "manual" && !migrated.has(g.id)
  );
  const kept = Object.values(nextGuests).filter((g) => !incomingIds.has(g.id)).length;

  const now = new Date().toISOString();
  return {
    plan: {
      ...plan,
      meta: { ...(plan.meta || {}), updatedAt: now, importedAt: now },
      guests: nextGuests,
      seating: nextSeating,
    },
    summary: { added, updated, kept, missing, suppressedPlaceholders },
  };
}
