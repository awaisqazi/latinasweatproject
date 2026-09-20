// Searching, filtering, sorting and sectioning the guest list.
//
// Pure functions, no runes and no DOM, so the phone's Guests tab, its filter
// sheet and its pickers all agree about what "unseated" means without any of
// them owning the definition. The desktop sidebar keeps its own copy; this file
// exists so the phone did not have to grow a third one.
//
// PRIVACY: reads a plan, returns arrays of the same guest objects. Nothing is
// stored, logged or sent.

import { GUEST_TAGS, MEALS, TICKET_TYPES, guestList, ticketTypeById } from "../../lib/galaSeating/model.js";

export const SORTS = [
  { id: "last", label: "Last name A to Z" },
  { id: "first", label: "First name A to Z" },
  { id: "table", label: "By table" },
  { id: "party", label: "By party" },
  { id: "ticket", label: "By ticket type" },
];

export function lastName(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return (parts.length > 1 ? parts[parts.length - 1] : parts[0] || "").toLowerCase();
}

export function firstName(name) {
  return (String(name || "").trim().split(/\s+/)[0] || "").toLowerCase();
}

export function letterOf(value) {
  const ch = String(value || "?")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

/** "table 4", "tbl 4" and "t4" all mean the same thing to a planner. */
export function tableNumberQuery(query) {
  const m = String(query || "").trim().toLowerCase().match(/^(?:table|tbl|t)\s*([0-9]{1,3})$/);
  return m ? Number(m[1]) : null;
}

export function searchGuests(plan, query) {
  const all = guestList(plan);
  const q = String(query || "").trim().toLowerCase();
  if (!q) return all;
  const num = tableNumberQuery(q);
  if (num != null) {
    const t = plan.tables.find((x) => x.number === num);
    if (t) return all.filter((g) => plan.seating[g.id]?.tableId === t.id);
  }
  return all.filter((g) => {
    const s = plan.seating[g.id];
    const t = s ? plan.tables.find((x) => x.id === s.tableId) : null;
    const hay = `${g.name} ${g.partyLabel} ${g.seatingNote} ${g.plannerNote} ${g.buyerName} ${
      t ? `table ${t.number} ${t.name}` : ""
    }`.toLowerCase();
    return hay.includes(q);
  });
}

export function passesFilter(plan, warningsByGuest, g, key) {
  switch (key) {
    case "all":
      return true;
    case "unseated":
      return !plan.seating[g.id] && g.hasDinner !== false;
    case "seated":
      return Boolean(plan.seating[g.id]);
    case "notes":
      return Boolean(g.seatingNote || g.plannerNote);
    case "warnings":
      return (warningsByGuest[g.id] || []).length > 0;
    case "nomeal":
      return g.hasDinner && !g.meal;
    case "latenight":
      return !g.hasDinner;
    case "placeholder":
      return Boolean(g.placeholder);
    case "unmatched":
      return Boolean(g.unmatched);
    case "reconcile":
      return Boolean(g.placeholder || g.unmatched);
    default:
      if (key.startsWith("meal:")) return g.meal === key.slice(5);
      if (key.startsWith("ticket:")) return g.ticketType === key.slice(7);
      if (key.startsWith("tag:")) return (g.tags || []).includes(key.slice(4));
      return true;
  }
}

/** The chips the filter sheet shows, each with how many guests it would leave. */
export function filterChips(plan, warningsByGuest, searched) {
  const all = guestList(plan);
  const base = [
    { key: "notes", label: "Has notes" },
    { key: "warnings", label: "Warnings" },
    { key: "nomeal", label: "No entrée" },
    { key: "latenight", label: "Late night" },
    { key: "placeholder", label: "Unnamed seats" },
    { key: "unmatched", label: "No ticket match" },
    { key: "reconcile", label: "To reconcile" },
  ];
  const meals = MEALS.map((m) => ({ key: `meal:${m.id}`, label: m.short }));
  const tickets = TICKET_TYPES.filter((t) => all.some((g) => g.ticketType === t.id)).map((t) => ({
    key: `ticket:${t.id}`,
    label: t.short,
  }));
  const tags = GUEST_TAGS.filter((t) => all.some((g) => (g.tags || []).includes(t.id))).map((t) => ({
    key: `tag:${t.id}`,
    label: t.label,
  }));
  return [...base, ...meals, ...tickets, ...tags].map((c) => ({
    ...c,
    count: searched.filter((g) => passesFilter(plan, warningsByGuest, g, c.key)).length,
  }));
}

function tableOfGuest(plan, g) {
  const s = plan.seating[g.id];
  return s ? plan.tables.find((t) => t.id === s.tableId) || null : null;
}

export function sortGuests(plan, list, sort) {
  const out = [...list];
  if (sort === "table") {
    out.sort((a, b) => {
      const ta = tableOfGuest(plan, a);
      const tb = tableOfGuest(plan, b);
      if (!ta && !tb) return lastName(a.name).localeCompare(lastName(b.name));
      if (!ta) return 1;
      if (!tb) return -1;
      return ta.number - tb.number || plan.seating[a.id].seat - plan.seating[b.id].seat;
    });
  } else if (sort === "party") {
    out.sort(
      (a, b) => a.partyLabel.localeCompare(b.partyLabel) || lastName(a.name).localeCompare(lastName(b.name)),
    );
  } else if (sort === "ticket") {
    const order = Object.fromEntries(TICKET_TYPES.map((t, i) => [t.id, i]));
    out.sort(
      (a, b) =>
        (order[a.ticketType] ?? 99) - (order[b.ticketType] ?? 99) ||
        lastName(a.name).localeCompare(lastName(b.name)),
    );
  } else if (sort === "first") {
    out.sort((a, b) => firstName(a.name).localeCompare(firstName(b.name)));
  } else {
    out.sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)));
  }
  return out;
}

export function sectionOf(plan, g, sort) {
  if (sort === "table") {
    const t = tableOfGuest(plan, g);
    return t ? (t.name ? `Table ${t.number} · ${t.name}` : `Table ${t.number}`) : "Unseated";
  }
  if (sort === "party") return g.partyLabel;
  if (sort === "ticket") return ticketTypeById(g.ticketType).label;
  return letterOf(sort === "first" ? firstName(g.name) : lastName(g.name));
}

/**
 * Flatten to the rows a template walks once: section headers, guest rows, and
 * the Late Night divider that keeps 9 PM tickets out of the seating backlog.
 */
export function buildRows(plan, list, sort, { lateNight = [], lateOpen = false } = {}) {
  const sorted = sortGuests(plan, list, sort);
  const out = [];
  let current = null;
  for (const g of sorted) {
    const section = sectionOf(plan, g, sort);
    if (section !== current) {
      current = section;
      out.push({ kind: "head", id: `h:${section}`, section });
    }
    out.push({ kind: "row", id: g.id, guest: g });
  }
  if (lateNight.length) {
    out.push({ kind: "late", id: "late-head", count: lateNight.length });
    if (lateOpen) {
      for (const g of [...lateNight].sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)))) {
        out.push({ kind: "row", id: g.id, guest: g });
      }
    }
  }
  return out;
}
