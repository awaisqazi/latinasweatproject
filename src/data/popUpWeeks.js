// Every LSP Pop Up week, in date order, plus the helpers the site surfaces
// use to pick what to show. Each week is { ...copy, locations } (see
// popUpWeek1.js / popUpWeek2.js). To add Week 3: create popUpWeek3.js with
// the same shape and append it here; every surface follows.
//
// Flip rule (build time AND in the browser via PopUpWeekClient):
//   current week = the live week, else the next upcoming week, else null.
//   Compact surfaces (homepage hero pill + A New Chapter band, /pricing,
//   /events, /links card + bubble) show only the current week, so on
//   Mon Oct 12 they flip from Week 1 to Week 2 without a rebuild.
//   /popup and the studio transition section (/schedule, /classes) list
//   every active week (live + upcoming) in order.
//   data-popup-hide-when-past is keyed on the LAST week's end
//   (lastPopUpEndISO).
import { popUpWeek1Full } from "./popUpWeek1.js";
import { popUpWeek2Full } from "./popUpWeek2.js";
import { weekPhase, toMs } from "./popUpShared.js";

export const popUpWeeks = [popUpWeek1Full, popUpWeek2Full];

export const popUpWeekPhase = weekPhase;

// Live + upcoming weeks, in order.
export const activePopUpWeeks = (now = new Date()) => popUpWeeks.filter((w) => weekPhase(w, now) !== "past");

// The live week, else the next upcoming week, else null.
export const currentPopUpWeek = (now = new Date()) =>
  popUpWeeks.find((w) => weekPhase(w, now) === "live") ?? activePopUpWeeks(now)[0] ?? null;

export const lastPopUpWeek = popUpWeeks[popUpWeeks.length - 1];
export const lastPopUpEndISO = popUpWeeks
  .map((w) => w.endsAtISO)
  .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

// "upcoming" | "live" | "past" for the whole pop-up run (first start to
// last end).
export const getPopUpSeriesPhase = (now = new Date()) => {
  const t = toMs(now);
  if (t < Date.parse(popUpWeeks[0].startsAtISO)) return "upcoming";
  if (t <= Date.parse(lastPopUpEndISO)) return "live";
  return "past";
};
export const isPopUpSeriesActive = (now = new Date()) => getPopUpSeriesPhase(now) !== "past";

// Exact Zeffy URL (any week) -> GA4 conversion event (used by /links).
export const popUpTicketEventFor = (url = "") => {
  for (const w of popUpWeeks) {
    const loc = w.locations.find((l) => l.ticketsUrl === url);
    if (loc) return loc.conversionEvent;
  }
  return undefined;
};

// Client flip windows for a list of weeks rendered on one page (build-time
// `weeks`, in order). Week i is shown only while it is the current week:
// it appears once the previous rendered week has ended
// (data-popup-show-after) and disappears once it has ended itself
// (data-popup-hide-after; omitted for the last week when `keepLast`, so a
// record such as the /popup hero stays). `hidden` is the build-time state.
// PopUpWeekClient applies the same rule in the browser.
export const popUpWeekWindow = (weeks, i, { keepLast = false, now = new Date() } = {}) => {
  const showAfter = i > 0 ? weeks[i - 1].endsAtISO : undefined;
  const isLast = i === weeks.length - 1;
  const hideAfter = keepLast && isLast ? undefined : weeks[i].endsAtISO;
  const t = toMs(now);
  const visible =
    (!showAfter || t > Date.parse(showAfter)) && (!hideAfter || t <= Date.parse(hideAfter));
  return {
    "data-popup-show-after": showAfter,
    "data-popup-hide-after": hideAfter,
    hidden: !visible,
  };
};
