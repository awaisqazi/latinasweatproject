// src/lib/galaLive/director.js
//
// The choreographer. Spec: 05 sections 4.3, 4.4, 4.5.
//
// Two rules it exists to keep:
//   1. Every name reaches the screen, within LAG_MAX of arriving.
//   2. Nothing is ever replayed, and nothing is ever dropped.
//
// It imports neither three nor svelte, so it runs under `node --test` with a
// fake clock. `fx` is nullable: every fx call is optional, so the whole show
// (totals, cards, rows, banners, milestones) runs identically with no canvas.
// That is what makes context loss and fx=off safe.

import { QUEUE, MILESTONES, TIMING, COPY, tierOf, tierVisual } from "./config.js";

const noop = () => {};

/**
 * @typedef {Object} Gift
 * @property {number} seq stable identity from the feed
 * @property {number} cents
 * @property {string} name already resolved by the server (or "Anonymous")
 * @property {number} [tier] 1..4 from the server, recomputed if absent
 */

export function createDirector({ ui = {}, fx = null, goalCents = 7_500_000, tierEdges = [25000, 100000, 500000] } = {}) {
  const on = {
    setCard: ui.setCard || noop,
    setRows: ui.setRows || noop,
    setBanner: ui.setBanner || noop,
    setTotals: ui.setTotals || noop,
    setStatus: ui.setStatus || noop,
    // Fired alongside every canvas celebration, so fx=off can answer with
    // canvas-confetti and the two modes stay in step (05 section 5.8).
    celebrate: ui.celebrate || noop,
  };

  let scene = null; // SceneHandle | null

  const S = {
    t: 0, // scene clock seconds, supplied by tick()
    goalCents,
    tierEdges: [...tierEdges],
    hold: false,
    sceneName: "ambient",

    baseCents: 0, // the part of the server total that is not a gift we hold
    giftCents: 0, // sum of every gift we hold
    launchedCents: 0, // gifts whose comet has launched: drives the DOM count-up
    landedCents: 0, // gifts whose comet has landed: drives stars and milestones
    shownCents: 0, // what the DOM currently prints, tweened
    trueCents: 0, // last snapshot total, reconciliation only

    litBody: 0,
    litHalo: 0,
    coreLit: false,
    fill: -1,
    heat: 0,
    duck: 0,
    flash: 0,
    impulseAt: -99,
    goalAt: -99,

    milestonesHit: new Set(),
    card: null,
    banner: null,
    queue: [],
    inFlight: [],
    pending: [], // launched, comet not yet fired (the 0.6 s card-to-comet delay)
    rows: [],
    byId: new Map(), // seq -> { cents, state }
    overflow: 0,
    nextLaunchAt: 0,
    mode: "IDLE",
    cardBusyUntil: 0,
    cardFreeAt: 0,
    bannerUntil: 0,
    maxLagMs: 0,
    cometsSuppressed: false,
    pendingRestore: false,
    lastPrinted: -1,
    rowSeq: 0,
  };

  const slotCounts = () => ({
    body: scene?.slots?.nBody || 1500,
    halo: scene?.slots?.nHalo || 520,
    core: scene?.slots?.nCore || 90,
  });

  const landedTotal = () => Math.max(0, S.baseCents + S.landedCents);
  const launchedTotal = () => Math.max(0, S.baseCents + S.launchedCents);
  const pendingLanding = () => S.inFlight.reduce((s, g) => s + g.cents, 0);
  const projectedDrain = () => S.queue.reduce((s, g) => s + tierVisual(g.tier).gap, 0);

  /* ------------------------------------------------------------------ */
  /* Intake                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * The only entry point for data.
   * @param {Gift} g
   * @param {"live"|"catchup"|"cold"} mode
   *   live    full choreography
   *   catchup a reload found a gift older than 90 s: row and stars, no comet
   *   cold    first ever snapshot: restore the picture, show nothing
   */
  function receiveGift(g, mode = "live") {
    const seq = Number(g.seq);
    const cents = Math.max(0, Math.round(Number(g.cents) || 0));
    if (!Number.isFinite(seq)) return;

    const known = S.byId.get(seq);
    if (known) {
      correct(seq, cents);
      return;
    }

    const tier = Number(g.tier) || tierOf(cents, S.tierEdges);
    const name = String(g.name || COPY.anonymous);
    const entry = { seq, cents, tier, name, state: mode === "live" ? "queued" : "landed" };
    S.byId.set(seq, entry);
    S.giftCents += cents;

    if (mode === "cold") {
      S.launchedCents += cents;
      S.landedCents += cents;
      return;
    }
    if (mode === "catchup") {
      S.launchedCents += cents;
      S.landedCents += cents;
      addRow({ seq, name, cents, tier });
      return;
    }

    S.queue.push({ seq, cents, tier, name, at: S.t });
    if (S.queue.length > 1) {
      // Big gifts jump the line; arrival order is otherwise preserved.
      S.queue.sort((a, b) => (b.tier >= 3) - (a.tier >= 3) || a.at - b.at);
    }
  }

  /** An amount changed on a seq we already hold: silent, no effects. */
  function correct(seq, cents) {
    const e = S.byId.get(seq);
    if (!e || e.cents === cents) return;
    const delta = cents - e.cents;
    S.giftCents += delta;
    if (e.state === "queued") {
      const q = S.queue.find((x) => x.seq === seq);
      if (q) {
        q.cents = cents;
        q.tier = tierOf(cents, S.tierEdges);
      }
    } else {
      if (e.state === "launched" || e.state === "landed") S.launchedCents += delta;
      if (e.state === "landed") S.landedCents += delta;
      const f = S.inFlight.find((x) => x.seq === seq);
      if (f) f.cents = cents;
    }
    e.cents = cents;
  }

  /** The gift is off the screen. Money leaves the total with no effects. */
  function retract(seq) {
    const e = S.byId.get(Number(seq));
    if (!e) return;
    S.giftCents -= e.cents;
    if (e.state === "launched" || e.state === "landed") S.launchedCents -= e.cents;
    if (e.state === "landed") S.landedCents -= e.cents;
    S.byId.delete(Number(seq));
    S.queue = S.queue.filter((x) => x.seq !== Number(seq));
    S.inFlight = S.inFlight.filter((x) => x.seq !== Number(seq));
    S.pending = S.pending.filter((x) => x.seq !== Number(seq));
    const before = S.rows.length;
    S.rows = S.rows.filter((r) => r.seq !== Number(seq));
    if (before !== S.rows.length) on.setRows([...S.rows]);
    if (S.card && S.card.seq === Number(seq)) hideCard();
  }

  /**
   * Every snapshot. The part of the server total that is not one of our gifts
   * (baseline_cents, a manual override) becomes `baseCents`, so a change there
   * tweens the number with no effects, exactly like a correction.
   */
  function reconcile(snapshotTotalCents) {
    const total = Math.max(0, Math.round(Number(snapshotTotalCents) || 0));
    S.trueCents = total;
    // Not clamped: if the server total falls below the gifts we hold (a hidden
    // row, a manual override), baseCents goes negative and the displayed number
    // tweens down to match. The read helpers floor the result at zero.
    S.baseCents = total - S.giftCents;
  }

  /* ------------------------------------------------------------------ */
  /* Launch / land                                                      */
  /* ------------------------------------------------------------------ */

  function tickQueue() {
    const t = S.t;
    if (S.hold || S.sceneName === "blackout") return;

    while (S.queue.length && t >= S.nextLaunchAt) {
      const head = S.queue[0];
      // A T4 gift waits for the hero card, bounded by the lag budget.
      if (head.tier >= 4 && t < S.cardFreeAt && t - head.at < QUEUE.LAG_MAX * 0.8) break;

      const shower = projectedDrain() > QUEUE.LAG_MAX;
      const g = S.queue.shift();
      const tv = tierVisual(g.tier);
      let gap = tv.gap;
      if (shower) {
        gap = g.tier >= 4 ? 2.5 : g.tier >= 3 ? 1.2 : Math.max(QUEUE.GAP_FLOOR, Math.min(0.9, QUEUE.LAG_MAX / (S.queue.length + 1)));
      }
      if (S.queue.length) {
        const oldest = S.queue.reduce((m, q) => Math.min(m, q.at), Infinity);
        if (t - oldest > QUEUE.LAG_MAX * 0.8) gap = QUEUE.GAP_FLOOR; // hard floor
      }
      S.nextLaunchAt = t + gap;
      S.mode = shower ? "SHOWER" : "GIFT";
      launch(g, shower);
    }

    // Overflow guard: above the soft cap, T1 and T2 get rows only.
    if (S.queue.length > QUEUE.SOFT_CAP) S.cometsSuppressed = true;
    else if (S.queue.length < QUEUE.RESUME) S.cometsSuppressed = false;
    S.overflow = S.cometsSuppressed ? S.queue.filter((g) => g.tier < 3).length : 0;

    if (!S.queue.length && !S.inFlight.length && !S.pending.length && t > S.cardBusyUntil && t > S.bannerUntil) {
      S.mode = S.coreLit ? "STRETCH" : "IDLE";
    }
  }

  function launch(g, shower) {
    const e = S.byId.get(g.seq);
    if (e) e.state = "launched";
    S.launchedCents += g.cents;
    S.maxLagMs = Math.max(S.maxLagMs, (S.t - g.at) * 1000);

    const tv = tierVisual(g.tier);
    const hero = !shower || g.tier >= 3;
    if (hero && S.t >= S.cardFreeAt) showCard(g);
    addRow(g); // ALWAYS. This is the no-dropped-names guarantee.

    const suppressed = S.cometsSuppressed && g.tier < 3;
    // 05 section 7.3: the comet leaves 0.6 s after the card, so the name and
    // the light are visibly linked without any moving text.
    const delay = hero && !suppressed ? TIMING.cardToComet : 0;
    const item = { ...g, hero, suppressed, fireAt: S.t + delay, landAt: S.t + delay + tv.flight, fired: false };
    if (suppressed) {
      // No comet: the gift lands the moment it would have.
      item.landAt = S.t + 0.2;
      S.inFlight.push(item);
    } else {
      S.pending.push(item);
    }
    if (S.inFlight.length + S.pending.length > QUEUE.INFLIGHT_MAX * 2) {
      // Never let the pools grow: the oldest simply lands now.
      const old = S.pending.shift();
      if (old) {
        old.landAt = S.t;
        S.inFlight.push(old);
      }
    }
  }

  function fireComet(g) {
    const tv = tierVisual(g.tier);
    if (scene) {
      const from = g.hero ? originFromCard() : originFromBelow();
      const to = aimSlot(g.cents);
      g.to = to;
      scene.launchComet(from, to, tv);
    }
    S.inFlight.push(g);
  }

  function originFromCard() {
    const el = document.querySelector('[data-fx-origin="gift"]');
    if (el && scene) {
      const r = el.getBoundingClientRect();
      if (r.width > 0) return scene.screenToWorld(r.left + r.width * 0.12, r.top + r.height * 0.5, 2);
    }
    return originFromBelow();
  }

  function originFromBelow() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return scene.screenToWorld(w * (0.56 + Math.random() * 0.4), h * 1.05, 2);
  }

  function aimSlot(cents) {
    const { body, halo } = slotCounts();
    const projected = landedTotal() + pendingLanding() + cents;
    if (projected >= S.goalCents) {
      return scene.blockSlotWorld(Math.min(halo - 1, S.litHalo), "halo");
    }
    const target = Math.min(body, Math.floor((body * projected) / S.goalCents));
    return scene.blockSlotWorld(Math.max(0, Math.min(body - 1, target - 1)), "body");
  }

  function land(g) {
    const e = S.byId.get(g.seq);
    if (e) e.state = "landed";
    const before = landedTotal();
    S.landedCents += g.cents;
    const after = landedTotal();

    const tv = tierVisual(g.tier);
    if (scene && g.to) {
      scene.emitSparks(g.to, tv.sparks, 4 + tv.head * 2.5);
      if (tv.ring) scene.ring(g.to, 5 + tv.head * 3, 1.1, 1.5 + tv.head * 0.5);
      if (tv.confetti) scene.emitConfetti(tv.confetti, tv.confettiMode, g.to);
    }
    if (tv.confetti) on.celebrate("gift", g.tier);
    S.heat = Math.min(1, S.heat + 0.12 + tv.head * 0.06);
    if (g.tier >= 4) S.flash = Math.max(S.flash, TIMING.flashCapT4);

    for (const m of MILESTONES) {
      if (before < S.goalCents * m && after >= S.goalCents * m && !S.milestonesHit.has(m)) {
        S.milestonesHit.add(m);
        milestone(m);
      }
    }
  }

  function milestone(m) {
    S.impulseAt = S.t;
    S.flash = TIMING.flashCapMilestone;
    const copy = COPY.milestones[m] || COPY.milestones[1];
    if (m < 1) {
      banner(copy.small, copy.text, TIMING.bannerMilestone);
      if (scene) {
        scene.ring(scene.anchor(), scene.extent() * 2.4, 1.8, 1.6);
        scene.burstAlongX(240, 8);
        scene.emitConfetti(160, "pop", scene.anchor());
      }
      on.celebrate("milestone", m);
      return;
    }
    // The goal finale. 12 s, then STRETCH.
    S.coreLit = true;
    S.goalAt = S.t;
    S.mode = "GOAL";
    if (scene) {
      scene.lightRange(0, slotCounts().core, "core", 1.2);
      for (let k = 0; k < 3; k++) {
        const delay = k * 450;
        setTimeout(() => {
          if (scene) scene.ring(scene.anchor(), scene.extent() * (2.2 + k), 2.2, 1.6);
        }, delay);
      }
      scene.burstAlongX(700, 10);
      const cap = scene.confettiCapacity();
      scene.emitConfetti(cap * 0.9, "rain");
      setTimeout(() => scene && scene.emitConfetti(cap * 0.6, "rain"), 3500);
    }
    on.celebrate("goal", 1);
    banner(copy.small, copy.text, TIMING.bannerGoal);
  }

  /* ------------------------------------------------------------------ */
  /* DOM presenters (through `ui`, never touching the DOM here)         */
  /* ------------------------------------------------------------------ */

  function showCard(g) {
    const tv = tierVisual(g.tier);
    S.card = { seq: g.seq, name: g.name, cents: g.cents, tier: g.tier, eyebrow: tv.eyebrow };
    S.cardBusyUntil = S.t + tv.dwell;
    S.cardFreeAt = S.t + Math.min(QUEUE.CARD_MIN, tv.dwell);
    S.duck = g.tier >= 4 ? 1 : 0;
    on.setCard(S.card);
  }

  function hideCard() {
    if (!S.card) return;
    S.card = null;
    S.duck = 0;
    on.setCard(null);
  }

  function addRow(g) {
    S.rows.unshift({ id: ++S.rowSeq, seq: g.seq, name: g.name, cents: g.cents, tier: g.tier, born: S.t });
    while (S.rows.length > QUEUE.ROLL_MAX) S.rows.pop();
    on.setRows([...S.rows]);
  }

  function banner(small, text, secs) {
    S.banner = { small, text };
    S.bannerUntil = S.t + secs;
    on.setBanner(S.banner);
  }

  /* ------------------------------------------------------------------ */
  /* Frame                                                              */
  /* ------------------------------------------------------------------ */

  function tick(dt, t) {
    S.t = typeof t === "number" ? t : S.t + dt;
    S.heat *= Math.exp(-dt * TIMING.heatDecay);
    S.flash *= Math.exp(-dt * TIMING.flashDecay);
    if (S.flash < 0.002) S.flash = 0;

    tickQueue();

    // Comets that have waited out the card delay.
    for (let i = S.pending.length - 1; i >= 0; i--) {
      if (S.t >= S.pending[i].fireAt) {
        const g = S.pending.splice(i, 1)[0];
        fireComet(g);
      }
    }
    for (let i = S.inFlight.length - 1; i >= 0; i--) {
      if (S.t >= S.inFlight[i].landAt) {
        const g = S.inFlight.splice(i, 1)[0];
        land(g);
      }
    }

    if (S.card && S.t >= S.cardBusyUntil) hideCard();
    if (S.banner && S.t >= S.bannerUntil) {
      S.banner = null;
      on.setBanner(null);
    }
    const kept = S.rows.filter((r) => S.t - r.born < QUEUE.ROLL_LIFE);
    if (kept.length !== S.rows.length) {
      S.rows = kept;
      on.setRows([...S.rows]);
    }

    // Stars follow landedTotal in both directions. Down is always silent.
    const { body, halo, core } = slotCounts();
    const landed = landedTotal();
    // A restore is not a celebration: the stars that were already earned appear
    // at once, and only a gift landing gets the 0.7 s ripple (05 section 4.5).
    const ripple = S.pendingRestore ? 0 : TIMING.starRipple;
    const targetBody = Math.max(0, Math.min(body, Math.floor((body * landed) / S.goalCents)));
    if (targetBody > S.litBody) {
      scene?.lightRange(S.litBody, targetBody, "body", ripple);
      S.litBody = targetBody;
      S.pendingRestore = false;
    } else if (targetBody < S.litBody) {
      scene?.unlightTo(targetBody, "body");
      S.litBody = targetBody;
    }
    const over = Math.max(0, landed - S.goalCents);
    const targetHalo = Math.max(0, Math.min(halo, Math.floor((halo * over) / (S.goalCents * 0.5))));
    if (targetHalo > S.litHalo) {
      scene?.lightRange(S.litHalo, targetHalo, "halo", ripple ? 0.5 : 0);
      S.litHalo = targetHalo;
    } else if (targetHalo < S.litHalo) {
      scene?.unlightTo(targetHalo, "halo");
      S.litHalo = targetHalo;
    }
    if (!S.coreLit && landed >= S.goalCents && S.milestonesHit.has(1)) {
      S.coreLit = true;
      S.goalAt = S.t;
      scene?.lightRange(0, core, "core", 1.2);
    } else if (S.coreLit && landed < S.goalCents) {
      S.coreLit = false;
      scene?.unlightTo(0, "core");
    }

    // The fill front follows the last lit body slot (damped, k = 2).
    const fillTarget = S.litBody > 0 && scene ? scene.slots.body[Math.min(body - 1, S.litBody - 1)].y : -1.0;
    S.fill += (fillTarget - S.fill) * (1 - Math.exp(-dt * TIMING.fillK));

    // The DOM count-up. Lands in step with the comet.
    const target = launchedTotal();
    S.shownCents += (target - S.shownCents) * (1 - Math.exp(-dt * TIMING.countUpK));
    if (Math.abs(target - S.shownCents) < 100) S.shownCents = target;
    const dollars = Math.round(S.shownCents / 100);
    if (dollars !== S.lastPrinted) {
      const settled = Math.abs(target - S.shownCents) < 100;
      const bumped = S.lastPrinted >= 0 && dollars > S.lastPrinted && settled;
      S.lastPrinted = dollars;
      on.setTotals({
        cents: dollars * 100,
        goalCents: S.goalCents,
        pct: S.goalCents > 0 ? (dollars * 100) / S.goalCents : 0,
        bump: bumped,
      });
    }

    on.setStatus({
      mode: S.mode,
      queue: S.queue.length,
      inFlight: S.inFlight.length + S.pending.length,
      drain: projectedDrain(),
      litBody: S.litBody,
      nBody: body,
      litHalo: S.litHalo,
      nHalo: halo,
      coreLit: S.coreLit,
      overflow: S.overflow,
      maxLagMs: S.maxLagMs,
      trueCents: S.trueCents,
      launchedCents: launchedTotal(),
      landedCents: landed,
      hold: S.hold,
    });
  }

  /** What the scene needs each frame. */
  function frameState() {
    return {
      heat: S.heat,
      duck: S.duck,
      flash: S.flash,
      fillY: S.fill,
      goal01: S.coreLit ? Math.min(1, (S.t - S.goalAt) / TIMING.goalRamp) : 0,
      impulseAge: S.t - S.impulseAt,
      progress: S.goalCents > 0 ? Math.min(1, landedTotal() / S.goalCents) : 0,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Operator + lifecycle                                               */
  /* ------------------------------------------------------------------ */

  return {
    receiveGift,
    correct,
    retract,
    reconcile,
    tick,
    frameState,
    /** Attach or detach the canvas. The show does not change either way. */
    setScene(handle) {
      scene = handle || null;
      if (scene) scene.restore({ litBody: S.litBody, litHalo: S.litHalo, coreLit: S.coreLit });
    },
    setSceneName(name) {
      S.sceneName = name;
    },
    setHold(v) {
      S.hold = !!v;
    },
    setGoal(cents) {
      const n = Math.round(Number(cents) || 0);
      if (n > 0) S.goalCents = n;
    },
    setTierEdges(edges) {
      if (Array.isArray(edges) && edges.length) S.tierEdges = [...edges];
    },
    /** One-shot operator cue (10 section 3). */
    cue(c) {
      const type = c && c.type;
      if (type === "supernova") {
        S.flash = Math.max(S.flash, TIMING.flashCapMilestone);
        S.impulseAt = S.t;
        if (scene) {
          scene.burstAlongX(500, 9);
          scene.ring(scene.anchor(), scene.extent() * 2.4, 2.0, 1.6);
          scene.emitConfetti(Math.round(scene.confettiCapacity() * 0.5), "rain");
        }
        on.celebrate("goal", 1);
      } else if (type === "confetti") {
        scene?.emitConfetti(Math.round((scene.confettiCapacity() || 400) * 0.5), "rain");
        on.celebrate("milestone", 0.5);
      } else if (type === "replay_last") {
        const last = S.rows[0];
        if (last) showCard({ seq: last.seq, name: last.name, cents: last.cents, tier: last.tier });
      }
      // reload_page / reload_scene are handled by the page: they are not
      // choreography.
    },
    /** Silently restore after a reload or a rebuild (05 section 4.5). */
    restoreMilestones(list) {
      for (const m of list || []) S.milestonesHit.add(Number(m));
    },
    /** Mark every milestone already passed as hit: no banners on a cold start. */
    sealMilestones() {
      const landed = landedTotal();
      for (const m of MILESTONES) if (landed >= S.goalCents * m) S.milestonesHit.add(m);
      if (S.milestonesHit.has(1) && landed >= S.goalCents) {
        S.coreLit = true;
        S.goalAt = -TIMING.goalRamp * 2;
      }
    },
    /**
     * Restore the picture in one step after a cold start or a reload: the DOM
     * number snaps instead of rolling up from zero, and the next star update
     * lights everything already earned with no ripple.
     */
    snapTotals() {
      S.shownCents = launchedTotal();
      S.lastPrinted = -1;
      S.pendingRestore = true;
    },
    /** Shift every absolute timestamp after a uNow rebase. */
    rebase(delta) {
      if (!(delta > 0)) return;
      S.t -= delta;
      S.nextLaunchAt -= delta;
      S.cardBusyUntil -= delta;
      S.cardFreeAt -= delta;
      S.bannerUntil -= delta;
      S.impulseAt -= delta;
      S.goalAt -= delta;
      for (const g of S.queue) g.at -= delta;
      for (const g of S.inFlight) g.landAt -= delta;
      for (const g of S.pending) {
        g.fireAt -= delta;
        g.landAt -= delta;
      }
      for (const r of S.rows) r.born -= delta;
    },
    /** True when nothing is in flight: the safe moment to rebase. */
    isQuiet: () => !S.queue.length && !S.inFlight.length && !S.pending.length && !S.rows.length && !S.card && !S.banner,
    milestonesHit: () => [...S.milestonesHit],
    getState: () => S,
    knownSeqs: () => [...S.byId.keys()],
  };
}
