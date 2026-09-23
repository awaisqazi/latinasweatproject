// Gala Seating planner · "No ticket on record": what the team decided for a guest who has
// no Zeffy ticket (an unmatched dinner response, a "No matching ticket" row, or a guest
// added by hand with no ticket number).
//
// The decision is written into fields the re-import already protects, so it survives a
// fresh spreadsheet import without any new plumbing:
//   comped      ticketType "comp", hasDinner, unmatched false, editedFields += ticketType, hasDinner
//   paid-other  ticketType "benefactor", same otherwise
//   outreach    tag "outreach" (and the store unseats them); ticket fields untouched
// Every choice also prefixes the planner note with who decided and when, e.g.
// "Comped (Ana, Sep 23). ", which is where the status line reads its attribution from.
//
// Pure ES module: no DOM, no Node APIs, never mutates its inputs.

import { TICKET_RESOLUTIONS } from "./model.js";

export const OUTREACH_TAG = "outreach";

/** The words each resolution puts in front of the planner note. */
const NOTE_PREFIX = {
  comped: "Comped",
  "paid-other": "Paid another way",
  outreach: "Needs outreach",
};

/** The short status shown once a resolution is recorded. */
export const RESOLUTION_STATUS = {
  comped: "Comped",
  "paid-other": "Paid another way",
  outreach: "Needs outreach",
};

export function resolutionById(id) {
  return TICKET_RESOLUTIONS.find((r) => r.id === id) || null;
}

/** True when nothing ties this guest to a Zeffy ticket. */
export function hasNoZeffyTicket(guest) {
  if (!guest || guest.placeholder) return false;
  if (guest.unmatched) return true;
  if (guest.ticketType === "unknown") return true;
  return guest.source === "manual" && !(guest.ticketNumbers || []).length;
}

export function needsOutreach(guest) {
  return Boolean(guest && (guest.tags || []).includes(OUTREACH_TAG));
}

/**
 * The resolution recorded on this guest, read back from its fields, or null.
 * @returns {"comped"|"paid-other"|"outreach"|null}
 */
export function ticketResolutionOf(guest) {
  if (!guest) return null;
  if (needsOutreach(guest)) return "outreach";
  if (guest.ticketType === "comp") return "comped";
  if (guest.ticketType === "benefactor" && (guest.editedFields || []).includes("ticketType")) return "paid-other";
  return null;
}

/**
 * Whether the guest record should carry the "No ticket on record" block or its status line:
 * a guest with no Zeffy ticket, or one whose ticket type was set by this flow (a hand-set
 * ticket type with no ticket number, or one carrying this flow's stamp in the note).
 */
export function showsTicketResolution(guest) {
  if (!guest || guest.placeholder) return false;
  if (hasNoZeffyTicket(guest)) return true;
  if (needsOutreach(guest)) return true;
  const r = ticketResolutionOf(guest);
  if (!r || !(guest.editedFields || []).includes("ticketType")) return false;
  return !(guest.ticketNumbers || []).length || Boolean(resolutionAttribution(guest, r));
}

/** No Zeffy ticket and nobody has decided what to do yet. */
export function needsTicketResolution(guest) {
  return hasNoZeffyTicket(guest) && !ticketResolutionOf(guest);
}

/** "Sep 23", on the gala's clock (America/Chicago), whatever the planner's device says. */
export function chicagoShortDate(when = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" }).format(when);
  } catch {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(when);
  }
}

function cleanEditor(editor) {
  const name = String(editor ?? "").replace(/[()]/g, "").replace(/\s+/g, " ").trim();
  return name || "Planner";
}

function sentence(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/**
 * The guest_patch a resolution writes, plus whether the guest must be unseated.
 * @param {Object} guest
 * @param {"comped"|"paid-other"|"outreach"} resolutionId
 * @param {{editor?: string, when?: Date, note?: string}} [opts]
 * @returns {{patch: Object, unseat: boolean} | null}
 */
export function resolutionPatch(guest, resolutionId, { editor = "", when = new Date(), note = "" } = {}) {
  if (!guest || !NOTE_PREFIX[resolutionId]) return null;
  const stamp = `${NOTE_PREFIX[resolutionId]} (${cleanEditor(editor)}, ${chicagoShortDate(when)}).`;
  const plannerNote = [stamp, sentence(note), String(guest.plannerNote || "").trim()].filter(Boolean).join(" ");
  const tags = Array.isArray(guest.tags) ? guest.tags : [];

  if (resolutionId === "outreach") {
    return {
      patch: { tags: tags.includes(OUTREACH_TAG) ? [...tags] : [...tags, OUTREACH_TAG], plannerNote },
      unseat: true,
    };
  }
  const edited = Array.isArray(guest.editedFields) ? guest.editedFields : [];
  return {
    patch: {
      ticketType: resolutionId === "comped" ? "comp" : "benefactor",
      hasDinner: true,
      unmatched: false,
      tags: tags.filter((t) => t !== OUTREACH_TAG),
      editedFields: [...new Set([...edited, "ticketType", "hasDinner"])],
      plannerNote,
    },
    unseat: false,
  };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * "Ana, Sep 23" from the most recent stamp of this resolution in the planner note, or "".
 */
export function resolutionAttribution(guest, resolutionId) {
  const prefix = NOTE_PREFIX[resolutionId];
  if (!guest || !prefix) return "";
  const m = new RegExp(`(?:^|\\s)${escapeRe(prefix)} \\(([^)]+)\\)\\.`).exec(String(guest.plannerNote || ""));
  return m ? m[1].trim() : "";
}
