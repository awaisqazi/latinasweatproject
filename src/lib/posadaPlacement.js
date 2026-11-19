// Browser side of the LSP Posadas / Posada Craft Days placements on the
// homepage (PosadaHomeBand.astro) and /links (PosadaLinksCard.astro).
//
//   - removes anything with data-pc-until once that instant has passed
//     (the end of Sat Dec 19, Chicago), and the raffle note
//     (data-pc-raffle-ends) once the raffle is over;
//   - switches every root (data-pc-place) from "volunteer" to
//     "save-the-date" once the last craft day has ended (data-pc-state);
//   - keeps the calendar row honest: days that are over are crossed off, the
//     next craft day gets the yellow note, and the line under it names it
//     ("Next craft day: Tuesday 11/24, 4:30 to 8:30 pm"; "Craft day today:"
//     on the day itself), rolling forward as days pass;
//   - draws the red pen circle around the 19 once, when it scrolls into view.
// A build that is days old still reads right. Dev only (stripped from
// production by import.meta.env.DEV): ?now=<ISO> pretends it is that moment.
import {
  craftDaysEs,
  craftHours,
  posadaPlacementCopy as pc,
  posadaPlacementPhase,
  nextCraftDay,
} from "../data/posadaCraftDays.js";

function clock() {
  if (import.meta.env.DEV) {
    const v = new URLSearchParams(window.location.search).get("now");
    const t = v ? Date.parse(v) : NaN;
    if (Number.isFinite(t)) return t;
  }
  return Date.now();
}

const chicagoDate = (t) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(t));

export function initPosadaPlacements() {
  const now = clock();
  document.querySelectorAll("[data-pc-until]").forEach((el) => {
    if (now >= Date.parse(el.getAttribute("data-pc-until"))) el.remove();
  });
  document.querySelectorAll("[data-pc-raffle-ends]").forEach((el) => {
    if (now >= Date.parse(el.getAttribute("data-pc-raffle-ends"))) el.remove();
  });
  const roots = [...document.querySelectorAll("[data-pc-place]")];
  if (!roots.length) return;

  const ph = posadaPlacementPhase(now);
  const next = nextCraftDay(now);
  const today = next && chicagoDate(now) === next.date;

  roots.forEach((root) => {
    root.dataset.pcPhase = ph;
    // Homepage: a ruled seam when the band follows another light section
    // (the Giving Tuesday band above has stepped back).
    if (root.classList.contains("pcb")) {
      let prev = root.previousElementSibling;
      while (prev && /^(SCRIPT|STYLE|LINK)$/.test(prev.tagName)) prev = prev.previousElementSibling;
      root.toggleAttribute("data-pc-seam", !!prev && !prev.hasAttribute("data-gt-place"));
    }
    root.querySelectorAll("[data-pc-state]").forEach((el) => {
      el.hidden = el.getAttribute("data-pc-state") !== ph;
    });
    root.querySelectorAll("[data-pc-cell]").forEach((cell) => {
      const end = Date.parse(cell.getAttribute("data-pc-end"));
      const past = now >= end;
      const isNext = !!next && cell.getAttribute("data-pc-end") === next.end;
      if (past) cell.setAttribute("data-state", "past");
      else if (isNext) cell.setAttribute("data-state", "next");
      else cell.removeAttribute("data-state");
    });
    if (next) {
      // The hours never break across lines.
      const nb = (s) => s.replace(/ /g, "\u00a0");
      const en = `${today ? pc.today : pc.next} ${next.label}, ${nb(craftHours)}`;
      const es = `${today ? pc.todayEs : pc.nextEs} ${craftDaysEs[next.key].long}, ${nb(pc.hoursEs)}`;
      root.querySelectorAll('[data-pc-next][data-lang="en"]').forEach((el) => (el.textContent = en));
      root.querySelectorAll('[data-pc-next][data-lang="es"]').forEach((el) => (el.textContent = es));
    }
  });

  // The pen circle: armed (hidden) now, drawn once when 60% in view.
  const rings = [...document.querySelectorAll("[data-pc-ring]")];
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!rings.length || reduced || !("IntersectionObserver" in window)) return;
  roots.forEach((r) => r.setAttribute("data-pc-armed", ""));
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.parentElement
          ?.querySelectorAll("[data-pc-ring]")
          .forEach((ring) => ring.classList.add("is-drawn"));
        io.unobserve(e.target);
      });
    },
    { threshold: 0.6 },
  );
  // Observe the numeral that holds the rings.
  new Set(rings.map((r) => r.parentElement)).forEach((el) => el && io.observe(el));
}

