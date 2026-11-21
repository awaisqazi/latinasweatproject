// Mounts GivingLeaderboard.svelte (the /givingtuesday top five race) inside a
// Giving Tuesday placement: the homepage band and the /links card. Loaded by
// placement.js with a dynamic import, only once the RPC has answered with at
// least three people who have raised money, so neither Svelte nor the
// component is part of either page's first load.
//
// mountLeaders(target, opts) -> { update(leaders, hrefFor, thresholdCents) }
// opts: { base, reduced, tone: "ink" | "light", es (Spanish strings for
// /links, or null), headingId }. The race unrolls once the list is a quarter
// in view.
import { mount } from "svelte";
import GivingLeaderboard from "../../components/givingTuesday/GivingLeaderboard.svelte";

export function mountLeaders(target, { base = "/", reduced = false, tone = "ink", es = null, headingId = "gt-lead-h" } = {}) {
  const props = $state({
    leaders: [],
    hrefFor: (f) => f.give_url || "#",
    thresholdCents: 15000,
    base,
    reduced,
    tone,
    es,
    headingId,
    compact: true,
    seen: reduced,
  });
  mount(GivingLeaderboard, { target, props });

  if (!props.seen) {
    if (!("IntersectionObserver" in window)) props.seen = true;
    else {
      // Cap the ratio to what 80% of the viewport can hold, or a list taller
      // than the screen never fires.
      const h = target.getBoundingClientRect().height;
      const reachable = h > 0 ? (window.innerHeight * 0.8) / h : 1;
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            props.seen = true;
            io.disconnect();
          }
        },
        { threshold: Math.min(0.25, reachable) },
      );
      io.observe(target);
    }
  }

  return {
    update(leaders, hrefFor, thresholdCents) {
      props.leaders = leaders;
      props.hrefFor = hrefFor;
      if (thresholdCents) props.thresholdCents = thresholdCents;
    },
  };
}
