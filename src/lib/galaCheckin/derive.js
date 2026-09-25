// src/lib/galaCheckin/derive.js
//
// Every pure function the check-in desk needs: party grouping, the stats the
// admin board mirrors from SQL, and the search that has to find a guest in a
// dim lobby while they are standing in front of you.
//
// Pure on purpose. No Svelte, no DOM, no network: node can run all of it
// (src/lib/galaCheckin/test/run.mjs).
//
// PRIVACY: this repo is public. Not one real guest name appears here or in the
// tests. The normalizer is shared with the seating planner rather than forked,
// so a name that matches in one tool matches in the other.

import { editDistance, normName } from "../galaSeating/matching.js";

/* ------------------------------------------------------------------ *
 * time
 * ------------------------------------------------------------------ */

/** The venue is in Chicago whatever the phone thinks. "6:42 PM". */
export function clockTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  }).format(d);
}

/* ------------------------------------------------------------------ *
 * parties
 * ------------------------------------------------------------------ */

const bySeatThenName = (a, b) => {
  const sa = a.seat ?? 9999;
  const sb = b.seat ?? 9999;
  if (sa !== sb) return sa - sb;
  return String(a.name || "").localeCompare(String(b.name || ""));
};

/**
 * One card per party (`party_id`), which is what a volunteer is handed: "the
 * Sandoval table", "the couple at 12". A party can hold several PADDLE groups:
 * a sponsor table of ten is one party and ten paddle groups, a couple is one of
 * each. Both facts are on the card, because the paddle rules follow the group
 * and the human conversation follows the party.
 */
export function groupParties(guests) {
  const byId = new Map();

  for (const g of guests) {
    const key = g.party_id || `solo:${g.id}`;
    let p = byId.get(key);
    if (!p) {
      p = {
        id: key,
        label: "",
        table_number: null,
        table_name: "",
        members: [],
        buyer_name: g.buyer_name || "",
      };
      byId.set(key, p);
    }
    p.members.push(g);
    if (p.table_number == null && g.table_number != null) {
      p.table_number = g.table_number;
      p.table_name = g.table_name || "";
    }
    if (!p.label && g.party_label) p.label = g.party_label;
    if (!p.buyer_name && g.buyer_name) p.buyer_name = g.buyer_name;
  }

  const out = [];
  for (const p of byId.values()) {
    p.members.sort(bySeatThenName);
    if (!p.label) p.label = p.buyer_name || p.members[0]?.name || "Party";

    const groups = new Map();
    let arrived = 0;
    let dinner = 0;
    let lateNight = 0;
    let placeholders = 0;
    const meals = new Map();

    for (const m of p.members) {
      if (m.checked_in_at) arrived += 1;
      if (m.has_dinner) dinner += 1;
      else lateNight += 1;
      if (m.placeholder) placeholders += 1;
      if (m.meal) meals.set(m.meal, (meals.get(m.meal) || 0) + 1);
      const gk = m.paddle_group || `g:${m.id}`;
      let grp = groups.get(gk);
      if (!grp) {
        grp = { key: gk, members: [], paddle_number: null, preassigned: false };
        groups.set(gk, grp);
      }
      grp.members.push(m);
      if (m.paddle_number != null) {
        grp.paddle_number = m.paddle_number;
        grp.preassigned = Boolean(m.paddle_preassigned);
      }
    }

    p.total = p.members.length;
    p.arrived = arrived;
    p.allArrived = arrived === p.total;
    p.anyArrived = arrived > 0;
    p.dinner = dinner;
    p.lateNight = lateNight;
    p.placeholders = placeholders;
    p.meals = [...meals.entries()].map(([meal, n]) => ({ meal, n })).sort((a, b) => a.meal.localeCompare(b.meal));
    p.groups = [...groups.values()];
    p.paddleNumbers = p.groups.map((g) => g.paddle_number).filter((n) => n != null).sort((a, b) => a - b);
    // A typed paddle number can only be sent for ONE household at a time: the
    // server answers "mixed-groups" otherwise, so the sheet has to know.
    p.splitAcrossGroups = p.groups.length > 1;
    p.sort_key = normName(`${p.table_number ?? 999} ${p.label}`);
    out.push(p);
  }

  out.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  return out;
}

/* ------------------------------------------------------------------ *
 * stats  (the same numbers as gala_checkin_stats_json, computed locally)
 * ------------------------------------------------------------------ */

export function deriveStats(guests, paddles) {
  const totals = {
    guests: 0,
    checked_in: 0,
    dinner: 0,
    dinner_checked_in: 0,
    late_night: 0,
    late_night_checked_in: 0,
    walkins: 0,
    placeholders_open: 0,
    parties: 0,
    parties_arrived: 0,
  };
  const partyIds = new Set();
  const partiesArrived = new Set();
  const tables = new Map();
  const ticketTypes = new Map();
  const groups = new Map();

  for (const g of guests) {
    const inHouse = Boolean(g.checked_in_at);
    totals.guests += 1;
    if (inHouse) totals.checked_in += 1;
    if (g.has_dinner) {
      totals.dinner += 1;
      if (inHouse) totals.dinner_checked_in += 1;
    } else {
      totals.late_night += 1;
      if (inHouse) totals.late_night_checked_in += 1;
    }
    if (g.source === "walkin") totals.walkins += 1;
    if (g.placeholder && !inHouse) totals.placeholders_open += 1;

    const pid = g.party_id || `solo:${g.id}`;
    partyIds.add(pid);
    if (inHouse) partiesArrived.add(pid);

    const tk = g.table_number ?? null;
    let t = tables.get(tk);
    if (!t) {
      t = { table_number: tk, table_name: g.table_name || "", total: 0, checked_in: 0 };
      tables.set(tk, t);
    }
    t.total += 1;
    if (inHouse) t.checked_in += 1;

    const tt = g.ticket_type || "unknown";
    let ty = ticketTypes.get(tt);
    if (!ty) {
      ty = { ticket_type: tt, total: 0, checked_in: 0 };
      ticketTypes.set(tt, ty);
    }
    ty.total += 1;
    if (inHouse) ty.checked_in += 1;

    const gk = g.paddle_group || `g:${g.id}`;
    let grp = groups.get(gk);
    if (!grp) {
      grp = { arrived: false, hasPaddle: false };
      groups.set(gk, grp);
    }
    if (inHouse) grp.arrived = true;
    if (g.paddle_number != null) grp.hasPaddle = true;
  }

  totals.parties = partyIds.size;
  totals.parties_arrived = partiesArrived.size;

  const pad = { pool: 0, free: 0, held: 0, assigned: 0, void: 0, groups_without_paddle: 0, arrived_without_paddle: 0 };
  for (const p of paddles || []) {
    pad.pool += 1;
    if (p.status === "free") pad.free += 1;
    else if (p.status === "held") pad.held += 1;
    else if (p.status === "assigned") pad.assigned += 1;
    else if (p.status === "void") pad.void += 1;
  }
  for (const grp of groups.values()) {
    if (!grp.hasPaddle) {
      pad.groups_without_paddle += 1;
      if (grp.arrived) pad.arrived_without_paddle += 1;
    }
  }

  return {
    totals,
    by_table: [...tables.values()].sort((a, b) => (a.table_number ?? 1e9) - (b.table_number ?? 1e9)),
    by_ticket_type: [...ticketTypes.values()].sort((a, b) => a.ticket_type.localeCompare(b.ticket_type)),
    paddles: pad,
  };
}

/* ------------------------------------------------------------------ *
 * search
 * ------------------------------------------------------------------ */

// Small, generic and bidirectional. Names of real guests never go in the repo:
// if a volunteer needs a personal alias on the night, it belongs in the door
// note, not here.
const NICKNAME_PAIRS = [
  ["vero", "veronica"], ["yesi", "yesenia"], ["kathy", "katherine"], ["maggie", "margarita"],
  ["gigi", "giselle"], ["jess", "jessica"], ["liz", "lizette"], ["liz", "elizabeth"],
  ["alex", "alejandra"], ["alex", "alejandro"], ["dave", "david"], ["joe", "joseph"],
  ["andy", "andrew"], ["dani", "daniel"], ["dani", "daniela"], ["chris", "christian"],
  ["chris", "cristina"], ["pepe", "jose"], ["paco", "francisco"], ["pancho", "francisco"],
  ["lupe", "guadalupe"], ["chuy", "jesus"], ["nacho", "ignacio"], ["beto", "alberto"],
  ["beto", "roberto"], ["mari", "maria"], ["toni", "antonia"], ["toni", "antonio"],
  ["nando", "fernando"], ["memo", "guillermo"], ["lalo", "eduardo"], ["tere", "teresa"],
];

export const NICKNAMES = (() => {
  const map = new Map();
  const link = (a, b) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a).add(b);
  };
  for (const [short, long] of NICKNAME_PAIRS) {
    link(short, long);
    link(long, short);
  }
  return map;
})();

export function expandNickname(token) {
  const also = NICKNAMES.get(token);
  return also ? [token, ...also] : [token];
}

// "Guest of Maria" is a seat, not a person. Indexing those two words turned a
// "gue" or "of" query into a wall of placeholders in simulation, so they are
// dropped, and suffixes never decide a match.
const STOP_TOKENS = new Set(["guest", "of", "and", "the", "plus", "party", "table", "household"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

function tokenize(value) {
  const n = normName(value);
  if (!n) return [];
  return n.split(" ").filter((t) => t.length > 1 && !STOP_TOKENS.has(t) && !SUFFIXES.has(t));
}

const digitsOf = (value) => String(value || "").replace(/\D+/g, "");

function emailLocals(...emails) {
  const out = [];
  for (const e of emails) {
    const at = String(e || "").toLowerCase().indexOf("@");
    if (at > 0) {
      const local = String(e).toLowerCase().slice(0, at).replace(/\+.*$/, "");
      for (const part of local.split(/[^a-z0-9]+/)) if (part.length > 1) out.push(part);
    }
  }
  return out;
}

/**
 * One entry per guest.
 *   own   name tokens the guest would say about themselves (empty for a
 *         placeholder seat, which has no name yet)
 *   host  everything that reaches them through somebody else: the buyer, the
 *         party label, the words of "Guest of X". A host hit still surfaces the
 *         whole party, it just scores lower than the guest's own name.
 */
export function buildSearchIndex(guests) {
  return guests.map((g) => {
    const ownRaw = g.placeholder ? [] : tokenize(g.name);
    const own = new Set();
    let surname = "";
    ownRaw.forEach((t, i) => {
      for (const v of expandNickname(t)) own.add(v);
      if (i > 0) surname = t;
    });

    const host = new Set();
    for (const t of [
      ...tokenize(g.buyer_name),
      ...tokenize(g.party_label),
      ...(g.placeholder ? tokenize(g.name) : []),
      ...emailLocals(g.email, g.buyer_email),
    ]) {
      for (const v of expandNickname(t)) if (!own.has(v)) host.add(v);
    }

    const phone = digitsOf(g.phone);
    return {
      id: g.id,
      party_id: g.party_id || `solo:${g.id}`,
      own: [...own],
      host: [...host],
      surname,
      phone,
      phone4: phone.slice(-4),
      paddle: g.paddle_number == null ? "" : String(g.paddle_number),
      table: g.table_number == null ? "" : String(g.table_number),
      checkedIn: Boolean(g.checked_in_at),
    };
  });
}

const prefixHit = (tokens, q) => tokens.some((t) => t.startsWith(q));

function fuzzyHit(tokens, q) {
  const max = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
  if (!max) return false;
  return tokens.some((t) => editDistance(t, q, max) <= max);
}

/** Digits on their own mean a paddle, a table, or the end of a phone number. */
function numericMatch(entry, digits) {
  if (digits.length <= 3) {
    if (entry.paddle === digits) return 6;
    if (entry.table === digits) return 3;
    return 0;
  }
  if (digits.length === 4) return entry.phone4 === digits ? 5 : 0;
  return entry.phone && entry.phone.endsWith(digits) ? 5 : 0;
}

/**
 * Token prefix AND: every fragment the volunteer typed has to land somewhere on
 * the row. Two short fragments ("ma go") are the fastest path to one result and
 * are what the placeholder text in the search box asks for.
 *
 * Fuzzy is a SEPARATE pass that only runs when the exact pass found nothing, so
 * a typo never dilutes a good list.
 */
export function matchGuests(query, index, { limit = 60 } = {}) {
  const raw = String(query || "").trim();
  if (!raw) return { hits: [], fuzzy: false, mode: "empty" };

  const tableAsk = /^t(?:able)?\s*(\d{1,3})$/i.exec(raw);
  if (tableAsk) {
    const want = tableAsk[1];
    const hits = index.filter((e) => e.table === want).map((e) => ({ id: e.id, party_id: e.party_id, score: 5 }));
    return { hits: hits.slice(0, limit), fuzzy: false, mode: "table" };
  }

  // A volunteer reading a number off a phone screen types brackets and dashes.
  // Anything with no letters in it is a number question.
  const digits = digitsOf(raw);
  if (digits && /^[\d\s().+/-]+$/.test(raw)) {
    const hits = [];
    for (const e of index) {
      const score = numericMatch(e, digits);
      if (score) hits.push({ id: e.id, party_id: e.party_id, score: score + (e.checkedIn ? 0 : 1) });
    }
    hits.sort((a, b) => b.score - a.score);
    if (hits.length) return { hits: hits.slice(0, limit), fuzzy: false, mode: "number" };
  }

  const terms = normName(raw).split(" ").filter(Boolean);
  if (!terms.length) return { hits: [], fuzzy: false, mode: "empty" };

  const score = (e, hit) => {
    let total = 0;
    for (const q of terms) {
      if (hit(e.own, q)) {
        total += 3;
        if (e.surname && hit([e.surname], q)) total += 1;
      } else if (hit(e.host, q)) {
        total += 1;
      } else {
        return 0;
      }
    }
    return total + (e.checkedIn ? 0 : 1);
  };

  const gather = (hit) => {
    const out = [];
    for (const e of index) {
      const s = score(e, hit);
      if (s) out.push({ id: e.id, party_id: e.party_id, score: s });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  };

  const exact = gather(prefixHit);
  if (exact.length) return { hits: exact.slice(0, limit), fuzzy: false, mode: "name" };

  const near = gather(fuzzyHit);
  return { hits: near.slice(0, limit), fuzzy: near.length > 0, mode: near.length ? "fuzzy" : "none" };
}

/**
 * Search answers with people; the desk works in parties. Keep the order of the
 * best hit, remember which person was actually matched (the sheet puts them
 * first), and never show the same party twice.
 */
export function rankParties(hits, parties) {
  const byParty = new Map(parties.map((p) => [p.id, p]));
  const out = [];
  const seen = new Set();
  for (const h of hits) {
    if (seen.has(h.party_id)) continue;
    const p = byParty.get(h.party_id);
    if (!p) continue;
    seen.add(h.party_id);
    out.push({ party: p, matchedGuestId: h.id, score: h.score });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * shared household paddles  (organizer, Sep 25: couples and families
 * SHARE one paddle; 150 paddles in the box; walk-ins take the next free)
 * ------------------------------------------------------------------ */

const arrivedAt = (g) => {
  const t = Date.parse(g?.checked_in_at || "");
  return Number.isNaN(t) ? Infinity : t;
};
const byArrival = (a, b) => arrivedAt(a) - arrivedAt(b) || String(a.id).localeCompare(String(b.id));

/** "Ana", "Ana and Ben", "Ana and 2 more". Full names: two guests can share a first name. */
export function nameList(rows) {
  const list = (rows || []).map((r) => r.name).filter(Boolean);
  if (list.length <= 2) return list.join(" and ");
  return `${list[0]} and ${list.length - 1} more`;
}

/** Every live guest row keyed by paddle_group. A group can span parties after a merge. */
export function membersByGroup(guests) {
  const out = new Map();
  for (const g of guests || []) {
    if (g.removed_at) continue;
    const key = g.paddle_group || `g:${g.id}`;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(g);
  }
  return out;
}

/**
 * What the door has to know about ONE guest's paddle when it is shared:
 * who else it covers, and whether it has already left the desk in somebody
 * else's hand. The PHYSICAL paddle goes to whoever of the household arrived
 * first, so "holder" is the earliest check-in of the group.
 *
 *   shared    false for a paddle of one (the text is then empty)
 *   others    the other members of the group
 *   holder    earliest checked-in member, or null
 *   withOther the paddle is already out with someone else: do NOT hand over
 *             another one
 *   text      the line the row shows, in words (never colour alone)
 */
export function paddleShare(guest, members) {
  const group = (members || []).filter((m) => !m.removed_at);
  const others = group.filter((m) => m.id !== guest.id);
  const number = guest.paddle_number ?? null;
  if (!others.length) return { shared: false, number, others: [], holder: null, withOther: false, text: "" };

  const holder = group.filter((m) => m.checked_in_at).sort(byArrival)[0] || null;
  const withOther = Boolean(holder && holder.id !== guest.id);
  let text;
  if (number == null) text = `Shares one paddle with ${nameList(others)}`;
  else if (!guest.checked_in_at && withOther) text = `Paddle ${number} · already with ${holder.name}`;
  else if (guest.checked_in_at && !withOther) text = `Has paddle ${number} · shared with ${nameList(others)}`;
  else if (guest.checked_in_at) text = `Paddle ${number} · with ${holder.name}`;
  else text = `Paddle ${number} · shared with ${nameList(others)}`;
  return { shared: true, number, others, holder, withOther, text };
}

/**
 * The arrival card, grouped by paddle. A couple checked in together is ONE
 * block ("Paddle 42 · Ana and Ben"), not two cards with the same number. The
 * second half of a couple arriving later is told the paddle is already with
 * the first ("Paddle 42 · already with Ana"), so nobody hands out a second one.
 *
 * `arrived` are the rows this device just checked in; `groupMembers(key)`
 * returns the store's live rows for that paddle group. Pure and reactive:
 * "earlier" compares check-in times, so a partner who arrives AFTER this card
 * opened never turns it into "already with".
 */
export function arrivalBlocks(arrived, groupMembers = () => null) {
  const byGroup = new Map();
  for (const g of arrived || []) {
    const key = g.paddle_group || `g:${g.id}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(g);
  }
  const out = [];
  for (const [key, guests] of byGroup) {
    const ids = new Set(guests.map((g) => g.id));
    const first = Math.min(...guests.map(arrivedAt));
    const members = groupMembers(key) || guests;
    const mates = members.filter((m) => !ids.has(m.id) && !m.removed_at);
    const holder = mates.filter((m) => m.checked_in_at && arrivedAt(m) < first).sort(byArrival)[0] || null;
    const number = guests.find((g) => g.paddle_number != null)?.paddle_number ?? null;
    out.push({
      key,
      number,
      guests,
      holder,
      handOver: number != null && !holder,
      waiting: mates.filter((m) => !m.checked_in_at),
    });
  }
  return out;
}

/**
 * The party sheet's paddle blocks: one per paddle group, households first,
 * with who has it and who is still expected. Pure, so node can test it.
 */
export function paddleBlocks(party) {
  return (party?.groups || []).map((grp) => {
    const inHouse = grp.members.filter((m) => m.checked_in_at).sort(byArrival);
    return {
      key: grp.key,
      number: grp.paddle_number,
      members: grp.members,
      shared: grp.members.length > 1,
      holder: inHouse[0] || null,
      arrived: inHouse.length,
      waiting: grp.members.filter((m) => !m.checked_in_at),
    };
  });
}

/** How every surface names a Late Night ticket: the doors for it open at 9 PM. */
export const LATE_NIGHT = "Late Night · 9 PM";

/** "Checked in by Maria at 6:41 PM" (Chicago time, whatever the phone says). */
export function checkedInLine(guest) {
  if (!guest?.checked_in_at) return "";
  const who = guest.checked_in_by ? ` by ${guest.checked_in_by}` : "";
  const when = clockTime(guest.checked_in_at);
  return `Checked in${who}${when ? ` at ${when}` : ""}`;
}
