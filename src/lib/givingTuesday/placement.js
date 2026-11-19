// Browser side of the LSP Giving Tuesday placements on the homepage
// (GivingTuesdayHomeBand.astro) and /links (GivingTuesdayLinksCard.astro).
//
// Every placement root carries data-gt-place. The script:
//   1. removes anything with data-gt-until once that instant has passed, and
//      shows the thank-you copy (data-gt-state="thanks") after
//      givingFacts.endsAt, so a stale build still turns itself off;
//   2. writes the day line ("12 days to Giving Tuesday") in Chicago days;
//   3. only when a placement comes within 600 px of the viewport, loads the
//      same transport as /givingtuesday (src/lib/givingTuesday/live.js, a
//      dynamic import, so supabase-js never ships with the first paint) and
//      polls the giving_public RPC while the tab is visible;
//   4. rolls the funded mats out once the floor is 35% in view, once; later
//      rises roll out only the new mats;
//   5. where the placement has a [data-gt-leaders] box (homepage band, /links
//      card), shows the /givingtuesday top five race from the same payload
//      (rules: src/lib/givingTuesday/leaderboard.js). The box stays hidden
//      (no gap) while loading, on RPC failure, after Giving Tuesday, with the
//      board closed, or with fewer than three people who have raised money.
//      Svelte and the component load (dynamic import) only when it shows.
// States: loading and RPC down keep the server-rendered "$15,000 / is our
// goal." with the room's faint outlines (no number that could read as
// "$0 raised"); $0 shows the goal, the mat outlines and "Roll out the
// first mat."; a real total shows the number, "raised of our $15,000 goal"
// and the gift count. The meter's height is reserved in CSS, so nothing
// jumps when the total arrives.
//
// Dev only (stripped from production by import.meta.env.DEV): ?now=<ISO>
// pretends it is that moment; the /givingtuesday mock params (?mock=5&total=6240,
// ?mock=0, ?mock=fail) pass straight through live.js.
import {
  givingFacts,
  givingCopy,
  givingPlacementCopy as pc,
  daysUntil,
  phase,
  money,
  fill,
} from "../../data/givingTuesday.js";
import { topRaisers, campaignGiveUrl } from "./leaderboard.js";

function clock() {
  if (import.meta.env.DEV) {
    const v = new URLSearchParams(window.location.search).get("now");
    const t = v ? Date.parse(v) : NaN;
    if (Number.isFinite(t)) return t;
  }
  return Date.now();
}

const setText = (root, sel, lang, text) => {
  root.querySelectorAll(`${sel}[data-lang="${lang}"]`).forEach((el) => {
    el.textContent = text;
  });
};

function dayLines(now) {
  const ph = phase(now);
  // On the day, the same line as /givingtuesday (one line on a phone).
  if (ph === "today") return { en: givingCopy.floor.endsTonight, es: pc.endsTonightEs };
  const n = daysUntil(now, givingFacts.givingDay);
  if (n >= 1) return { en: givingCopy.floor.daysTo(n), es: pc.daysToEs(n) };
  return null;
}

export function initGivingPlacements() {
  const now = clock();
  document.querySelectorAll("[data-gt-until]").forEach((el) => {
    if (now > Date.parse(el.getAttribute("data-gt-until"))) el.remove();
  });
  const roots = [...document.querySelectorAll("[data-gt-place]")];
  if (!roots.length) return;

  const thanks = now > Date.parse(givingFacts.endsAt);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  roots.forEach((root) => {
    root.dataset.gtPhase = thanks ? "thanks" : "campaign";
    root.querySelectorAll("[data-gt-state]").forEach((el) => {
      el.hidden = el.getAttribute("data-gt-state") !== root.dataset.gtPhase;
    });
    if (thanks) {
      // The meter and floor come back only with a real final total.
      root.querySelectorAll("[data-gt-meter], [data-gt-floor-wrap]").forEach((el) => (el.hidden = true));
    } else {
      const lines = dayLines(now);
      if (lines) {
        setText(root, "[data-gt-day]", "en", lines.en);
        setText(root, "[data-gt-day]", "es", lines.es);
      }
    }
  });

  // Per-root state: the latest payload, whether the floor has been seen, and
  // what each mat currently shows.
  const state = roots.map((root) => ({
    root,
    floor: root.querySelector("[data-gt-floor]"),
    mats: [...root.querySelectorAll("[data-gt-mat]")].map((g) => ({
      body: g.querySelector(".gmf-body"),
      roll: g.querySelector(".gmf-roll"),
      to: 0,
      gen: 0,
    })),
    seen: false,
    total: null,
    leadBox: root.querySelector("[data-gt-leaders]"),
    lead: null, // Promise of the mounted leaderboard
  }));

  // The top five race: mounted on first use, then updated in place.
  function leaders(s, data) {
    const box = s.leadBox;
    if (!box) return;
    const top = !thanks && data?.campaign?.board_open === true ? topRaisers(data.fundraisers) : [];
    if (!top.length) {
      box.hidden = true;
      s.root.removeAttribute("data-gt-leaders-on");
      return;
    }
    const base = import.meta.env.BASE_URL || "/";
    const fallback = campaignGiveUrl(data.campaign, base);
    const hrefFor = (f) => f.give_url || fallback;
    const bilingual = box.hasAttribute("data-gt-bilingual");
    s.lead ??= import("./placementLeaders.svelte.js").then((m) =>
      m.mountLeaders(box.querySelector("[data-gt-leaders-mount]"), {
        base,
        reduced,
        tone: box.getAttribute("data-gt-leaders") || "ink",
        headingId: `${s.root.id || "gt"}-lead-h`,
        es: bilingual ? { leadTitle: pc.leadTitleEs, leadLabel: pc.leadLabelEs } : null,
      }),
    );
    s.lead
      .then((lb) => {
        lb.update(top, hrefFor, Number(data.campaign?.threshold_cents) || 0);
        box.hidden = false;
        s.root.setAttribute("data-gt-leaders-on", "");
      })
      .catch(() => {
        box.hidden = true; // the placement reads well without it
      });
  }

  function roll(s) {
    if (!s.seen || s.total == null) return;
    const funded = s.total / givingCopy.floor.matCents;
    const changed = [];
    s.mats.forEach((m, i) => {
      const to = Math.min(1, Math.max(0, funded - i));
      if (Math.abs(to - m.to) > 1e-6) changed.push([m, to]);
    });
    // One after another from the funded edge, the whole wave in about 2.6 s.
    const step = changed.length > 1 ? Math.min(48, 2600 / changed.length) : 0;
    changed.forEach(([m, to], k) => {
      const gen = (m.gen + 1) % 2;
      [m.body, m.roll].forEach((el) => {
        el.style.setProperty("--from", String(m.to));
        el.style.setProperty("--to", String(to));
        el.style.setProperty("--d", `${reduced ? 0 : Math.round(k * step)}ms`);
        el.classList.remove("g0", "g1");
        el.classList.add(`g${gen}`);
      });
      m.roll.classList.toggle("done", to >= 1);
      if (to <= 0) [m.body, m.roll].forEach((el) => el.classList.remove("g0", "g1"));
      m.to = to;
      m.gen = gen;
    });
  }

  function render(s, data) {
    const { root } = s;
    const goal = Number(data?.campaign?.goal_cents) || givingFacts.goalCents;
    const goalLabel = money(goal);
    const total = Math.max(0, Number(data?.total_cents) || 0);
    const gifts = Math.max(0, Number(data?.gift_count) || 0);
    const over = total >= goal;
    const meter = root.querySelector("[data-gt-meter]");

    if (thanks) {
      if (!(total > 0)) return; // nothing honest to add: the note stays alone
      setText(root, "[data-gt-day]", "en", givingCopy.meter.finalLead);
      setText(root, "[data-gt-day]", "es", pc.finalLeadEs);
      setText(root, "[data-gt-num]", "en", money(total));
      setText(root, "[data-gt-num]", "es", money(total));
      setText(root, "[data-gt-line]", "en", `${givingCopy.meter.giftsFinal(gifts)}, ${fill(over ? givingCopy.meter.finalPassed : givingCopy.meter.finalOf, { goal: goalLabel })}`);
      setText(root, "[data-gt-line]", "es", `${pc.giftsFinalEs(gifts)}, ${fill(over ? pc.finalPassedEs : pc.finalOfEs, { goal: goalLabel })}`);
      if (meter) meter.hidden = false;
      root.querySelectorAll("[data-gt-floor-wrap]").forEach((el) => (el.hidden = false));
    } else if (total > 0) {
      setText(root, "[data-gt-num]", "en", money(total));
      setText(root, "[data-gt-num]", "es", money(total));
      setText(root, "[data-gt-line]", "en", `${fill(over ? givingCopy.meter.passed : givingCopy.meter.raisedOf, { goal: goalLabel })}\n${givingCopy.meter.gifts(gifts)}`);
      setText(root, "[data-gt-line]", "es", `${fill(over ? pc.passedEs : pc.raisedOfEs, { goal: goalLabel })}\n${pc.giftsEs(gifts)}`);
    } else {
      setText(root, "[data-gt-num]", "en", goalLabel);
      setText(root, "[data-gt-num]", "es", goalLabel);
      setText(root, "[data-gt-line]", "en", `${pc.goalIs}\n${givingCopy.floor.first}`);
      setText(root, "[data-gt-line]", "es", `${pc.goalIsEs}\n${pc.firstEs}`);
    }
    // Screen-reader announcement, in the language /links is showing (the
    // homepage has no toggle and stays English).
    const es = !!root.closest(".lang-active-es");
    root.querySelectorAll("[data-gt-sr]").forEach((el) => {
      if (total <= 0) el.textContent = "";
      else
        el.textContent = es
          ? `${money(total)} recaudados de nuestra meta de ${goalLabel}.`
          : `${money(total)} raised of our ${goalLabel} goal.`;
    });
    s.floor?.setAttribute("data-live", "");
    s.total = total;
    roll(s);
    leaders(s, data);
  }

  // Seen: the floor is 35% in view (or no IntersectionObserver).
  const markSeen = (s) => {
    if (s.seen) return;
    s.seen = true;
    roll(s);
  };

  let started = false;
  const start = async () => {
    if (started) return;
    started = true;
    try {
      const { startPolling } = await import("./live.js");
      startPolling({
        intervalMs: givingFacts.pollMs,
        onData: (data) => state.forEach((s) => render(s, data)),
        onError: () => {}, // keep whatever is on screen
      });
    } catch {
      // The static state already reads well.
    }
  };

  if (!("IntersectionObserver" in window)) {
    state.forEach(markSeen);
    start();
    return;
  }
  const near = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        near.disconnect();
        start();
      }
    },
    { rootMargin: "600px 0px" },
  );
  roots.forEach((r) => near.observe(r));

  const seenIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const s = state.find((x) => x.floor === e.target);
        if (s) markSeen(s);
        seenIO.unobserve(e.target);
      });
    },
    { threshold: 0.35 },
  );
  state.forEach((s) => s.floor && seenIO.observe(s.floor));
}
