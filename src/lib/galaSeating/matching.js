// Gala Seating planner · name normalization, sheet parsing and purchaser-to-buyer
// attribution. Ported from marketing/gala-meal-notice/GalaMealFinalNotice.gs, which has
// been run against the real data for weeks; the logic here is deliberately the same,
// with two seating-specific changes:
//
//   1. Late Night Access tickets are KEPT (flagged hasDinner:false) instead of dropped,
//      because the planner still wants to see those people and be warned if one is
//      seated for dinner.
//   2. Attribution capacity counts every ticket a buyer holds, not only dinner tickets,
//      so a late-night guest who filled in the dinner form still gets a name.
//
// PRIVACY: nothing in this file holds data. It only transforms rows handed to it in
// the browser. Pure ES module: no DOM, no Node APIs, no dependencies.

import { TICKET_TYPES } from "./model.js";

/* ------------------------------------------------------------------ *
 * mojibake
 * ------------------------------------------------------------------ */

// The Zeffy export double-encodes accents: the UTF-8 bytes of "ñ" (C3 B1) get read back
// through Mac Roman and arrive as "√±", so "Núñez" reaches us as "N√∫√±ez". Every
// entry below is the Mac Roman reading of a real character's UTF-8 bytes, so the table is
// a mechanical inverse rather than a guess. Longest sequences come first, because the
// three-character punctuation forms start with the same glyph as shorter ones.
const MOJIBAKE_PAIRS = [
  ["‚Ä¢", "•"], ["‚Ä¶", "…"],
  ["‚Äì", "–"], ["‚Äî", "—"],
  ["‚Äò", "‘"], ["‚Äô", "’"],
  ["‚Äù", "”"], ["‚Äú", "“"],
  ["‚Ç¨", "€"],
  ["¬©", "©"], ["¬ª", "»"], ["¬°", "¡"],
  ["¬±", "±"], ["¬´", "«"], ["¬Æ", "®"],
  ["¬ø", "¿"], ["¬™", "ª"], ["¬∑", "·"],
  ["¬∞", "°"], ["¬∫", "º"],
  ["√¢", "â"], ["√£", "ã"], ["√¥", "ô"],
  ["√§", "ä"], ["√¨", "ì"], ["√©", "é"],
  ["√ª", "û"], ["√®", "è"], ["√°", "á"],
  ["√±", "ñ"], ["√´", "ë"], ["√µ", "õ"],
  ["√º", "ü"], ["√Å", "Á"], ["√Æ", "î"],
  ["√É", "Ã"], ["√Ö", "Å"], ["√Ø", "ï"],
  ["√ß", "ç"], ["√á", "Ç"], ["√â", "É"],
  ["√ç", "Í"], ["√ë", "Ñ"], ["√ì", "Ó"],
  ["√ï", "Õ"], ["√ò", "Ø"], ["√ö", "Ú"],
  ["√ø", "ÿ"], ["√ú", "Ü"], ["√π", "ù"],
  ["√†", "à"], ["√•", "å"], ["√™", "ê"],
  ["√∂", "ö"], ["√∏", "ø"], ["√∫", "ú"],
  ["√≠", "í"], ["√≤", "ò"], ["√≥", "ó"],
];

const MOJIBAKE_MAP = new Map(MOJIBAKE_PAIRS);
const MOJIBAKE_RE = new RegExp(
  MOJIBAKE_PAIRS.map(([bad]) => bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "g"
);
// Every sequence begins with one of these three, so a name with no accents costs one test.
const MOJIBAKE_LEAD = /[√‚¬]/;

/**
 * Undo the export's double encoding: "N√∫√±ez" becomes "Núñez".
 * Runs on every cell before anything else looks at it, so names match, sort and print
 * correctly and the CSV opens with the right letters.
 */
export function repairMojibake(value) {
  const s = value == null ? "" : String(value);
  if (!MOJIBAKE_LEAD.test(s)) return s;
  return s.replace(MOJIBAKE_RE, (m) => MOJIBAKE_MAP.get(m) || m);
}

/* ------------------------------------------------------------------ *
 * normalization
 * ------------------------------------------------------------------ */

/** Lowercase, strip accents, drop punctuation, collapse whitespace. */
export function normName(value) {
  let s = repairMojibake(value);
  if (s.normalize) s = s.normalize("NFD");
  s = s.replace(/[̀-ͯ]/g, "");
  s = s.replace(/[‘’ʼ´`']/g, "");
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9\s]+/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function normEmail(value) {
  return (value == null ? "" : String(value)).trim().toLowerCase();
}

export function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(value));
}

/** The comparable part of an email address, e.g. "ana.perez+gala" -> "anaperez". */
export function emailLocalPart(value) {
  const email = normEmail(value);
  const at = email.indexOf("@");
  if (at === -1) return "";
  return email.slice(0, at).replace(/\+.*$/, "").replace(/[^a-z0-9]/g, "");
}

export function emailDomain(value) {
  const email = normEmail(value);
  const at = email.indexOf("@");
  return at === -1 ? "" : email.slice(at + 1);
}

/** Header keys: apostrophe-, case- and punctuation-insensitive. */
export function normHeader(value) {
  return normName(value);
}

/** Every string cell funnels through here, so this is where the export gets repaired. */
export function cleanText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return repairMojibake(value).replace(/\s+/g, " ").trim();
}

export function titleCase(value) {
  const s = cleanText(value);
  if (!s) return "";
  return s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/** "85", 85, 85.0 and " 85.0 " all normalize to "85". */
export function cleanTicketNumber(value) {
  const s = cleanText(value);
  if (!s) return "";
  const m = /^(\d+)\.0+$/.exec(s);
  return m ? m[1] : s;
}

/** Levenshtein distance, bailing out once it exceeds `max`. */
export function editDistance(a, b, max) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = [];
  for (let i = 0; i <= b.length; i++) prev[i] = i;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Drop single letters so "Ana M Perez" still matches "Ana Perez". */
export function nameTokens(normalized) {
  if (!normalized) return [];
  return normalized.split(" ").filter((t) => t.length > 1);
}

/**
 * Tolerant name comparison: exact, token-set (middle names, swapped order),
 * or edit distance <= 2 for names of 6+ characters.
 */
export function namesMatch(rawA, rawB) {
  const a = normName(rawA);
  const b = normName(rawB);
  if (!a || !b) return false;
  if (a === b) return true;

  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (ta.length >= 2 && tb.length >= 2) {
    const small = ta.length <= tb.length ? ta : tb;
    const large = ta.length <= tb.length ? tb : ta;
    const pool = large.slice();
    let allFound = true;
    for (let i = 0; i < small.length; i++) {
      const idx = pool.indexOf(small[i]);
      if (idx === -1) { allFound = false; break; }
      pool.splice(idx, 1);
    }
    if (allFound) return true;
  }

  if (a.length >= 6 && b.length >= 6 && editDistance(a, b, 2) <= 2) return true;
  return false;
}

/** Epoch millis from a Date, a date string, or a blank. */
export function toTime(value) {
  if (!value && value !== 0) return 0;
  if (value instanceof Date) {
    const t = value.getTime();
    return isNaN(t) ? 0 : t;
  }
  const parsed = Date.parse(String(value));
  return isNaN(parsed) ? 0 : parsed;
}

/* ------------------------------------------------------------------ *
 * stable ids
 * ------------------------------------------------------------------ */

/** FNV-1a, 32 bit, base36. Deterministic across runs and platforms. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

/** Two rounds so ids stay distinct at gala scale; same input always gives same id. */
export function stableId(prefix, material) {
  const s = String(material);
  return `${prefix}${fnv1a(s)}${fnv1a(`~${s}~`)}`;
}

/* ------------------------------------------------------------------ *
 * header-tolerant row reading
 * ------------------------------------------------------------------ */

export function buildHeaderIndex(headerRow) {
  const map = {};
  const list = Array.isArray(headerRow) ? headerRow : [];
  for (let i = 0; i < list.length; i++) {
    const key = normHeader(list[i]);
    if (key && !(key in map)) map[key] = i;
  }
  return map;
}

/** Exact normalized key first, then the first header that contains one of `contains`. */
export function findColumn(index, exact = [], contains = []) {
  for (const key of exact) if (key in index) return index[key];
  const keys = Object.keys(index);
  for (const needle of contains) {
    for (const key of keys) if (key.includes(needle)) return index[key];
  }
  return -1;
}

export function cellAt(row, i) {
  if (i < 0 || !row) return "";
  return cleanText(row[i]);
}

export function pick(row, index, key) {
  if (!(key in index)) return "";
  return cleanText(row[index[key]]);
}

function isBlankRow(row) {
  if (!row || !row.length) return true;
  for (const cell of row) {
    if (cell instanceof Date) return false;
    if (cell != null && String(cell).trim() !== "") return false;
  }
  return true;
}

/** Rows may arrive with or without a leading header row full of blanks. */
function dataRowsOf(values) {
  if (!Array.isArray(values) || values.length < 2) return [];
  return values.slice(1);
}

/* ------------------------------------------------------------------ *
 * ticket types
 * ------------------------------------------------------------------ */

/** Raw Zeffy ticket-type text -> a TICKET_TYPES id. */
export function ticketTypeIdFor(raw) {
  const text = cleanText(raw);
  if (!text) return "unknown";
  for (const t of TICKET_TYPES) {
    if (t.match && t.match.test(text)) return t.id;
  }
  return "unknown";
}

export const SPONSOR_TICKET_IDS = TICKET_TYPES.filter((t) => t.sponsor).map((t) => t.id);
export function isSponsorTicketId(id) { return SPONSOR_TICKET_IDS.includes(id); }

const SKIP_STATUS_PATTERN = /refund|cancel|void|chargeback/i;

/* ------------------------------------------------------------------ *
 * parsing
 * ------------------------------------------------------------------ */

/**
 * Zeffy export (one row per ticket) -> ticket objects, in sheet order.
 * Unlike the meal-notice script, late-night tickets are kept and flagged.
 * @returns {{tickets: Array, skipped: number, dataRows: number, nonDinner: number, missingHeaders: string[]}}
 */
export function parseTickets(values) {
  const out = { tickets: [], skipped: 0, dataRows: 0, nonDinner: 0, missingHeaders: [] };
  if (!Array.isArray(values) || values.length < 2) return out;

  const index = buildHeaderIndex(values[0]);
  const cBuyerFirst = findColumn(index, ["buyer first name"], ["buyer first"]);
  const cBuyerLast = findColumn(index, ["buyer last name"], ["buyer last"]);
  const cBuyerEmail = findColumn(index, ["buyer email"], ["buyer email", "purchaser email"]);
  const cGuestFirst = findColumn(index, ["guest first name"], ["guest first"]);
  const cGuestLast = findColumn(index, ["guest last name"], ["guest last"]);
  const cType = findColumn(index, ["ticket type"], ["ticket type", "type"]);
  const cNumber = findColumn(index, ["ticket number"], ["ticket number"]);
  const cStatus = findColumn(index, ["status"], ["status"]);
  const cPref = findColumn(
    index,
    ["do you have a seating preference with another guest or group"],
    ["seating preference", "seating pref", "sit with"]
  );
  const cHeard = findColumn(index, ["how did you hear about lsp"], ["how did you hear"]);
  const cNotes = findColumn(index, ["ticket notes"], ["ticket note"]);

  if (cBuyerEmail < 0) out.missingHeaders.push("Buyer email");
  if (cType < 0) out.missingHeaders.push("Ticket type");

  const rows = dataRowsOf(values);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (isBlankRow(row)) continue;
    out.dataRows++;

    const status = cellAt(row, cStatus);
    if (status && SKIP_STATUS_PATTERN.test(status)) { out.skipped++; continue; }

    const buyerFirst = cellAt(row, cBuyerFirst);
    const buyerLast = cellAt(row, cBuyerLast);
    const buyerName = `${buyerFirst} ${buyerLast}`.trim();
    const buyerEmail = normEmail(cellAt(row, cBuyerEmail));
    const guestName = `${cellAt(row, cGuestFirst)} ${cellAt(row, cGuestLast)}`.trim();
    const ticketType = cellAt(row, cType);
    const typeId = ticketTypeIdFor(ticketType);
    const typeDef = TICKET_TYPES.find((t) => t.id === typeId);

    const buyerKey = looksLikeEmail(buyerEmail)
      ? `email:${buyerEmail}`
      : (normName(buyerName) ? `name:${normName(buyerName)}` : `row:${r + 2}`);

    out.tickets.push({
      rowNumber: r + 2,
      order: r,
      buyerKey,
      buyerEmail,
      buyerName,
      buyerFirst,
      guestName,
      guestNorm: normName(guestName),
      // Zeffy mirrors the buyer name into the guest name on every row, so a guest name
      // that equals the buyer name is NOT evidence of who is actually in that seat.
      guestMirrorsBuyer: !!normName(guestName) && normName(guestName) === normName(buyerName),
      ticketTypeRaw: ticketType,
      ticketTypeId: typeId,
      hasDinner: typeDef ? typeDef.hasDinner !== false : true,
      isSponsorSeat: isSponsorTicketId(typeId),
      ticketNumber: cleanTicketNumber(cellAt(row, cNumber)),
      seatingNote: cellAt(row, cPref),
      heardAbout: cellAt(row, cHeard),
      ticketNote: cellAt(row, cNotes),
      status,
      covered: false,
      coveredBy: null,
    });
    if (!out.tickets[out.tickets.length - 1].hasDinner) out.nonDinner++;
  }

  return out;
}

/**
 * Dinner-form responses -> response objects, deduped by normalized guest name with the
 * latest Timestamp winning. `rawCount` carries the pre-dedupe count.
 */
export function parseResponses(values) {
  const empty = { responses: [], rawCount: 0, duplicatesDropped: 0, missingHeaders: [] };
  if (!Array.isArray(values) || values.length < 2) return empty;

  const index = buildHeaderIndex(values[0]);
  const cTime = findColumn(index, ["timestamp"], ["timestamp", "submitted"]);
  const cGuest = findColumn(index, ["guest name"], ["guest name", "your name", "full name"]);
  const cPurchaser = findColumn(
    index,
    ["purchasers name", "purchaser name", "purchaser s name"],
    ["purchaser", "who bought", "organizer"]
  );
  const cEmail = findColumn(index, ["email address", "email"], ["email"]);
  const cPhone = findColumn(index, ["phone number", "phone"], ["phone"]);
  const cSelection = findColumn(index, ["dinner selection"], ["dinner selection", "entree", "entr e", "meal"]);

  const missingHeaders = [];
  if (cSelection < 0) missingHeaders.push("Dinner selection");
  if (cGuest < 0) missingHeaders.push("Guest Name");

  const all = [];
  const rows = dataRowsOf(values);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (isBlankRow(row)) continue;
    const guestName = cellAt(row, cGuest);
    const selection = cellAt(row, cSelection);
    if (!guestName && !selection) continue;

    all.push({
      rowNumber: r + 2,
      order: r,
      time: toTime(cTime >= 0 && row ? row[cTime] : null),
      guestName,
      guestNorm: normName(guestName),
      purchaserName: cellAt(row, cPurchaser),
      email: normEmail(cellAt(row, cEmail)),
      phone: cellAt(row, cPhone),
      selection,
      used: false,
      attributedTo: null,
      attributedBy: "",
    });
  }

  // Dedupe: same normalized guest name -> latest timestamp (then latest row) wins.
  const byName = new Map();
  const keepBlank = [];
  for (const resp of all) {
    if (!resp.guestNorm) { keepBlank.push(resp); continue; }
    const existing = byName.get(resp.guestNorm);
    if (!existing) { byName.set(resp.guestNorm, resp); continue; }
    const newer = resp.time > existing.time || (resp.time === existing.time && resp.order > existing.order);
    if (newer) byName.set(resp.guestNorm, resp);
  }

  const responses = [...byName.values(), ...keepBlank].sort((a, b) => a.order - b.order);
  return {
    responses,
    rawCount: all.length,
    duplicatesDropped: all.length - responses.length,
    missingHeaders,
  };
}

/**
 * Optional Overrides rows:
 *   Purchaser name (as typed on form) | Buyer email | Skip buyer email | Note
 * Only a cell that STARTS with EXAMPLE is treated as a template row.
 */
export function parseOverrides(values) {
  const result = { byPurchaser: {}, skip: {}, rows: [], ignoredExamples: 0 };
  if (!Array.isArray(values) || values.length < 2) return result;
  const index = buildHeaderIndex(values[0]);

  let iPurchaser = findColumn(index, ["purchaser name as typed on form"], ["purchaser"]);
  let iBuyer = findColumn(index, ["buyer email"], ["buyer email"]);
  let iSkip = findColumn(index, ["skip buyer email"], ["skip"]);
  let iNote = findColumn(index, ["note"], ["note"]);
  if (iPurchaser < 0) iPurchaser = 0;
  if (iBuyer < 0) iBuyer = 1;
  if (iSkip < 0) iSkip = 2;
  if (iNote < 0) iNote = 3;

  for (const row of dataRowsOf(values)) {
    if (isBlankRow(row)) continue;
    const isExample = row.some((cell) => /^\s*EXAMPLE\b/i.test(String(cell == null ? "" : cell)));
    if (isExample) { result.ignoredExamples++; continue; }

    const purchaser = cellAt(row, iPurchaser);
    const buyerEmail = normEmail(cellAt(row, iBuyer));
    const skipEmail = normEmail(cellAt(row, iSkip));
    const note = cellAt(row, iNote);

    if (skipEmail && looksLikeEmail(skipEmail)) {
      result.skip[skipEmail] = note || "Skipped by override";
      result.rows.push({ type: "skip", email: skipEmail, note });
      continue;
    }
    if (purchaser && looksLikeEmail(buyerEmail)) {
      result.byPurchaser[normName(purchaser)] = buyerEmail;
      result.rows.push({ type: "map", purchaser, email: buyerEmail, note });
    }
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * attribution
 * ------------------------------------------------------------------ */

/** Group responses by the normalized purchaser name typed on the form. */
export function buildPurchaserGroups(responses) {
  const order = [];
  const groups = new Map();
  for (const resp of responses) {
    const key = normName(resp.purchaserName);
    if (!groups.has(key)) {
      groups.set(key, { key, purchaserName: resp.purchaserName, responses: [], target: null, reason: "" });
      order.push(key);
    }
    groups.get(key).responses.push(resp);
  }
  return order.map((k) => groups.get(k));
}

function distinctEmailsIn(group) {
  const seen = new Set();
  const list = [];
  for (const r of group.responses) {
    if (r.email && !seen.has(r.email)) { seen.add(r.email); list.push(r.email); }
  }
  return list;
}

/**
 * Decide which buyer (if any) an entire purchaser group belongs to.
 * Priority: override, buyer-name match, group email, email local part, first name.
 * Ambiguity always loses: an unattributed group is reported for human review.
 */
export function attributeGroup(group, buyers, buyersByEmail, overrides) {
  if (!group.key) return { target: null, reason: "blank purchaser name" };

  if (overrides && overrides.byPurchaser[group.key]) {
    const mapped = buyersByEmail[overrides.byPurchaser[group.key]];
    if (mapped) return { target: mapped, reason: "override" };
  }

  const groupEmails = distinctEmailsIn(group);
  const buyerEmailsInGroup = groupEmails.filter((e) => !!buyersByEmail[e]);

  const nameHits = buyers.filter((b) => namesMatch(group.key, b.buyerName));
  if (nameHits.length === 1) return { target: nameHits[0], reason: "purchaser name matches buyer name" };
  if (nameHits.length > 1) {
    const corroborated = nameHits.filter((b) => buyerEmailsInGroup.includes(b.buyerEmail));
    if (corroborated.length === 1) {
      return { target: corroborated[0], reason: "name match confirmed by an email in the group" };
    }
    return { target: null, reason: `ambiguous: name matches ${nameHits.length} buyers` };
  }

  if (buyerEmailsInGroup.length === 1) {
    return { target: buyersByEmail[buyerEmailsInGroup[0]], reason: "every buyer email in the group is the same buyer" };
  }
  if (buyerEmailsInGroup.length > 1) {
    return { target: null, reason: `group contains ${buyerEmailsInGroup.length} different buyer emails` };
  }

  const tokens = group.key.split(" ").filter((t) => t.length >= 3);
  if (tokens.length >= 2) {
    const localHits = buyers.filter((b) => {
      const local = emailLocalPart(b.buyerEmail);
      if (!local) return false;
      return tokens.every((t) => local.includes(t));
    });
    if (localHits.length === 1) return { target: localHits[0], reason: "purchaser name found inside the buyer email" };
    if (localHits.length > 1) return { target: null, reason: `ambiguous: name found in ${localHits.length} buyer emails` };
  }

  if (group.key.split(" ").length === 1) {
    const firstHits = buyers.filter((b) => normName(b.buyerName).split(" ")[0] === group.key);
    if (firstHits.length === 1) return { target: firstHits[0], reason: "single first name matches one buyer" };
    if (firstHits.length > 1) return { target: null, reason: `ambiguous: first name matches ${firstHits.length} buyers` };
  }

  return { target: null, reason: "no match" };
}

/**
 * Full reconciliation. Inputs are never mutated: tickets and responses are cloned first.
 * @returns {{buyers, buyerMap, tickets, responses, groups, unattributedGroups, surplus, stats}}
 */
export function matchSelections(ticketsIn, responsesIn, overridesIn) {
  const overrides = overridesIn || { byPurchaser: {}, skip: {}, rows: [], ignoredExamples: 0 };
  const tickets = (ticketsIn || []).map((t) => ({ ...t, covered: false, coveredBy: null }));
  const responses = (responsesIn || []).map((r) => ({ ...r, used: false, attributedTo: null, attributedBy: "" }));

  const buyerOrder = [];
  const buyerMap = new Map();
  for (const t of tickets) {
    if (!buyerMap.has(t.buyerKey)) {
      buyerMap.set(t.buyerKey, {
        buyerKey: t.buyerKey,
        buyerEmail: t.buyerEmail,
        buyerName: t.buyerName,
        buyerFirst: t.buyerFirst,
        tickets: [],
        attributed: [],
      });
      buyerOrder.push(t.buyerKey);
    }
    buyerMap.get(t.buyerKey).tickets.push(t);
  }
  const buyers = buyerOrder.map((k) => buyerMap.get(k));

  const buyersByEmail = {};
  for (const b of buyers) if (looksLikeEmail(b.buyerEmail)) buyersByEmail[b.buyerEmail] = b;

  const assigned = new Map();
  for (const b of buyers) assigned.set(b.buyerKey, 0);

  const capacityLeft = (key) => {
    const b = buyerMap.get(key);
    return b ? b.tickets.length - (assigned.get(key) || 0) : 0;
  };
  const assign = (resp, key, reason, capped) => {
    if (resp.attributedTo) return false;
    if (capped && capacityLeft(key) <= 0) return false;
    resp.attributedTo = key;
    resp.attributedBy = reason;
    assigned.set(key, (assigned.get(key) || 0) + 1);
    return true;
  };
  /** Guest-name matches first, then oldest first, so the best evidence wins a seat. */
  const preferred = (list, key) => {
    const b = buyerMap.get(key);
    const score = (r) =>
      b && b.tickets.some((t) => !t.guestMirrorsBuyer && namesMatch(r.guestName, t.guestName)) ? 0 : 1;
    return list.slice().sort((x, y) => (score(x) - score(y)) || (x.time - y.time) || (x.order - y.order));
  };

  const groups = buildPurchaserGroups(responses);

  // 1 · Overrides are the human decision, so they are never capacity capped.
  for (const group of groups) {
    if (!group.key) continue;
    const forced = overrides.byPurchaser[group.key];
    if (!forced) continue;
    const forcedBuyer = buyersByEmail[forced];
    if (!forcedBuyer) continue;
    group.target = forcedBuyer.buyerKey;
    group.reason = "override";
    for (const resp of group.responses) assign(resp, forcedBuyer.buyerKey, "override", false);
  }

  // 2 · A response whose guest name is a ticket guest name held by exactly one buyer
  //     belongs to that buyer. Mirrored rows are excluded, because on this export the
  //     guest name is just a copy of the buyer name on every single row.
  const ticketsByGuest = new Map();
  for (const t of tickets) {
    if (!t.guestNorm || t.guestMirrorsBuyer) continue;
    if (!ticketsByGuest.has(t.guestNorm)) ticketsByGuest.set(t.guestNorm, new Set());
    ticketsByGuest.get(t.guestNorm).add(t.buyerKey);
  }
  for (const resp of responses) {
    const owners = resp.guestNorm ? ticketsByGuest.get(resp.guestNorm) : null;
    if (!owners || owners.size !== 1) continue;
    assign(resp, [...owners][0], "guest name matches a ticket guest name", true);
  }

  // 2b · Because every guest-name cell on this export is a copy of the buyer name, rule 2
  //      can never fire on it. The equivalent signal that does survive: a response whose
  //      guest name IS a buyer's name, when exactly one buyer is called that. Buyers
  //      usually fill the form in for themselves, and this keeps their own seat theirs.
  const buyersByNameNorm = new Map();
  for (const b of buyers) {
    const key = normName(b.buyerName);
    if (!key) continue;
    if (!buyersByNameNorm.has(key)) buyersByNameNorm.set(key, []);
    buyersByNameNorm.get(key).push(b);
  }
  for (const resp of responses) {
    if (resp.attributedTo || !resp.guestNorm) continue;
    const exact = buyersByNameNorm.get(resp.guestNorm);
    if (!exact || exact.length !== 1) continue;
    assign(resp, exact[0].buyerKey, "guest name matches the buyer's own name", true);
  }

  // 3 · A response whose own email is a buyer email belongs to that buyer, up to seats.
  const byContactEmail = new Map();
  for (const resp of responses) {
    if (resp.attributedTo || !resp.email) continue;
    const owner = buyersByEmail[resp.email];
    if (!owner) continue;
    if (!byContactEmail.has(owner.buyerKey)) byContactEmail.set(owner.buyerKey, []);
    byContactEmail.get(owner.buyerKey).push(resp);
  }
  for (const [key, list] of byContactEmail) {
    for (const resp of preferred(list, key)) {
      assign(resp, key, "response email matches the buyer email", true);
    }
  }

  // 4 · Whole purchaser groups, for the responses still unattributed.
  for (const group of groups) {
    if (group.target) continue;
    const open = group.responses.filter((r) => !r.attributedTo);
    if (!open.length) continue;

    const decision = attributeGroup(group, buyers, buyersByEmail, overrides);
    group.target = decision.target ? decision.target.buyerKey : null;
    group.reason = decision.reason;
    if (!decision.target) continue;

    const room = capacityLeft(decision.target.buyerKey);
    if (room <= 0) {
      group.target = null;
      group.reason = `matched buyer has no seats left (${buyerMap.get(decision.target.buyerKey).tickets.length} seat(s), ${group.responses.length} selections under this name)`;
      continue;
    }
    for (const resp of preferred(open, decision.target.buyerKey)) {
      assign(resp, decision.target.buyerKey, decision.reason, true);
    }
    if (open.length > room) {
      group.reason = `${decision.reason} (only ${room} of ${open.length} fit that buyer's seats, the rest need an override)`;
    }
  }

  for (const resp of responses) {
    if (resp.attributedTo && buyerMap.has(resp.attributedTo)) {
      buyerMap.get(resp.attributedTo).attributed.push(resp);
    }
  }

  // 5 · Cover each buyer's seats. Regular dinner seats first, then sponsor seats, then
  //     the late-night seats, so a real dinner gap is never hidden by a sponsor block.
  const surplus = [];
  for (const b of buyers) {
    const rank = (t) => (!t.hasDinner ? 2 : t.isSponsorSeat ? 1 : 0);
    const ordered = b.tickets.slice().sort((x, y) => (rank(x) - rank(y)) || (x.order - y.order));
    const pool = b.attributed.slice();

    // Exact guest-name matches first (only meaningful on non-mirrored rows).
    for (const ticket of ordered) {
      if (ticket.covered || !ticket.guestNorm || ticket.guestMirrorsBuyer) continue;
      for (const resp of pool) {
        if (resp.used) continue;
        if (namesMatch(resp.guestName, ticket.guestName)) {
          ticket.covered = true;
          ticket.coveredBy = resp;
          resp.used = true;
          break;
        }
      }
    }
    // Then anything else attributed to this buyer.
    for (const ticket of ordered) {
      if (ticket.covered) continue;
      for (const resp of pool) {
        if (resp.used) continue;
        ticket.covered = true;
        ticket.coveredBy = resp;
        resp.used = true;
        break;
      }
    }
    for (const resp of pool) {
      if (!resp.used) {
        surplus.push({
          purchaserName: resp.purchaserName,
          guestName: resp.guestName,
          entree: resp.selection,
          attributedBuyerKey: b.buyerKey,
        });
      }
    }
  }

  const unattributedGroups = [];
  for (const g of groups) {
    const open = g.responses.filter((r) => !r.attributedTo);
    if (!open.length) continue;
    unattributedGroups.push({
      key: g.key,
      purchaserName: g.purchaserName || "(blank)",
      count: open.length,
      distinctEmails: distinctEmailsIn({ responses: open }).length,
      reason: g.reason || "no match",
    });
  }
  unattributedGroups.sort((a, b) => b.count - a.count);

  const attributedCount = responses.filter((r) => r.attributedTo).length;
  const usedCount = responses.filter((r) => r.used).length;

  return {
    buyers,
    buyerMap,
    tickets,
    responses,
    groups,
    unattributedGroups,
    surplus,
    stats: {
      tickets: tickets.length,
      dinnerTickets: tickets.filter((t) => t.hasDinner).length,
      buyers: buyers.length,
      responses: responses.length,
      attributed: attributedCount,
      unattributed: responses.length - attributedCount,
      seated: usedCount,
      surplus: surplus.length,
    },
  };
}
