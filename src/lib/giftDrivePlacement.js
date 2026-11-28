// Browser side of the Holiday Gift Drive: the /giftdrive page, the homepage
// band (GiftDriveHomeBand.astro) and the /links card (GiftDriveLinksCard.astro).
//
//   - removes anything with data-gd-until once that instant has passed (the
//     homepage band, the /links card and its story bubble), so a build that
//     is days old still steps back on time;
//   - rewrites every [data-gd-countdown] (data-lang="en" | "es") from
//     giftDriveCountdown(): "16 days left", then "Gifts are due tomorrow" on
//     Dec 12 and "Gifts are due today" on Dec 13. When the element carries
//     data-gd-tail, the tail follows the count ("16 days left · Gifts due
//     Sunday, December 13"), dropped on Dec 12 and 13;
//   - flips [data-gd-state="open" | "closed"] blocks once the drive is over
//     (the page's closed state);
//   - re-checks the LSP Posadas band's seam, because removing the gift band
//     puts the Posadas band right under a light section again.
// Dev only (stripped from production by import.meta.env.DEV): ?now=<ISO>
// pretends it is that moment.
import { giftDriveCountdown, giftDrivePhase } from "../data/giftDrive.js";
import { syncPosadaSeam } from "./posadaPlacement.js";

function clock() {
  if (import.meta.env.DEV) {
    const v = new URLSearchParams(window.location.search).get("now");
    const t = v ? Date.parse(v) : NaN;
    if (Number.isFinite(t)) return t;
  }
  return Date.now();
}

export function giftDriveNow() {
  return clock();
}

export function initGiftDrivePlacements() {
  const now = clock();
  let removed = false;
  document.querySelectorAll("[data-gd-until]").forEach((el) => {
    if (now >= Date.parse(el.getAttribute("data-gd-until"))) {
      el.remove();
      removed = true;
    }
  });
  if (removed) syncPosadaSeam();

  const open = giftDrivePhase(now) === "open";
  document.querySelectorAll("[data-gd-state]").forEach((el) => {
    el.hidden = el.getAttribute("data-gd-state") !== (open ? "open" : "closed");
  });

  const c = giftDriveCountdown(now);
  document.querySelectorAll("[data-gd-countdown]").forEach((el) => {
    if (!c) {
      el.hidden = true;
      return;
    }
    const lang = el.getAttribute("data-lang") === "es" ? "es" : "en";
    const tail = el.getAttribute("data-gd-tail");
    // A no-break space before the dot, so it never starts a line.
    el.textContent = tail && !c.short ? `${c[lang]} · ${tail}` : c[lang];
  });
}
