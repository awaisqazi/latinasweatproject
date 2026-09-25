<script>
  // /gala/live. The whole big-screen app: one canvas host, one rAF loop, one
  // feed, one director, and every panel that carries a word or a number.
  //
  // Concept "Constelacion", ported from docs/gala-2026/prototypes/live-3d-proto.html.
  // Spec: docs/gala-2026/05-live-3d-concept.md. Tokens and projector rules:
  // docs/gala-2026/04-theme-design-spec.md sections 2 and 3. Data contract:
  // docs/gala-2026/10-display-rpc-contract.md.
  //
  // Text is DOM, light is WebGL. Nothing legible is ever drawn in the canvas,
  // so the numbers and the names survive a lost GL context.

  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import {
    liveState, totals, heroCard, rollRows, banner,
    feedStatus, fxStatus, showStatus,
  } from "../../../lib/galaLive/stores.js";
  import {
    COPY, DEFAULT_EVENT, DEFAULT_SEED, CLIENT_VERSION, PROJECTOR,
    mergeState, money,
  } from "../../../lib/galaLive/config.js";
  import { createDirector } from "../../../lib/galaLive/director.js";
  import { createGiftFeed, readDisplayKey } from "../../../lib/galaLive/giftFeed.js";
  import { createOperator } from "../../../lib/galaLive/operator.js";
  import { createClock } from "../../../lib/galaLive/scene/clock.js";
  import { createWatchdog } from "../../../lib/galaLive/scene/watchdog.js";
  import { galaTeaser } from "../../../data/galaTeaser.js";

  import GiftCard from "./GiftCard.svelte";
  import RollCall from "./RollCall.svelte";
  import Banner from "./Banner.svelte";
  import XFillFallback from "./XFillFallback.svelte";
  import DonateQr from "./DonateQr.svelte";
  import SponsorStrip from "./SponsorStrip.svelte";
  import CalibrationCard from "./CalibrationCard.svelte";
  import Hud from "./Hud.svelte";
  import ProgramStage from "./ProgramStage.svelte";
  import ProgramMirror from "./ProgramMirror.svelte";
  import FollowStrip from "./FollowStrip.svelte";
  import {
    normalizePos, nextPos, prevPos, patchFor, sceneFor,
  } from "../../../lib/galaLive/program.js";
  import {
    readSeatingPass, createSeatingSource, numbersOnlyBoard, demoBoard,
  } from "../../../lib/galaLive/seatingBoard.js";
  import { createCheckinRemote, newOpId } from "../../../lib/galaCheckin/remote.js";
  import { DEFAULT_SLUG as SEATING_SLUG } from "../../../lib/galaSeating/remote.js";

  /* ---------------- reactive view state ---------------- */
  let hostEl = $state(null);
  let level = $state("full");
  let requested = $state("auto");
  let hasCanvas = $state(false);
  let canvasIn = $state(false);
  let isPhone = $state(false);
  let reduced = $state(false);
  let boost = $state(false);
  let calib = $state(false);
  let safeArea = $state(false);
  let qrSpot = $state(false);
  let hudOn = $state(false);
  let debug = $state(false);
  let demoMode = $state(false);
  let localFlag = $state(false);
  let stale = $state(false);
  let sceneName = $state("ambient");
  let bumping = $state(false);
  let cursorHidden = $state(false);

  /* ---------------- run of show (program segments) ---------------- */
  // localPos: a keyboard step on this laptop, shown at once. It is dropped as
  // soon as the server's program pointer changes (our own write confirmed, or
  // the control phone moved the room), so the server is always the truth.
  let localPos = $state(null); // { seg, step, basis }
  let localNote = $state(""); // brief on-screen note when a step stayed local
  let board = $state(numbersOnlyBoard());
  let momentsArmed = false;

  /* ---------------- derived layout ---------------- */
  const named = $derived($feedStatus.mode === "display" || demoMode);
  const serverPos = $derived(normalizePos($liveState.program));
  const pos = $derived(localPos ? { seg: localPos.seg, step: localPos.step } : serverPos);
  const baseScene = $derived(localPos ? sceneFor(localPos.seg) : sceneName);
  const auctionLive = $derived(baseScene === "auction" && !!$liveState.auction?.title);
  const effScene = $derived(baseScene === "auction" && !auctionLive ? "appeal" : baseScene);
  // The program stage owns the frame in the program and thanks scenes.
  const programOn = $derived(effScene === "program" || effScene === "thanks");
  const layout = $derived(
    effScene === "blackout" ? "dark" : named && (effScene === "appeal" || effScene === "auction") ? "hero" : "center",
  );

  const goalCents = $derived($liveState.goal_cents || 7_500_000);
  const pct = $derived(goalCents > 0 ? Math.min(1, $totals.cents / goalCents) : 0);
  const pctLabel = $derived(goalCents > 0 ? Math.floor(($totals.cents / goalCents) * 100) : 0);
  const goalMet = $derived($totals.cents >= goalCents);
  const totalText = $derived(money($totals.cents));
  // 04 section 3.2: 236u is the design size, 200u once the string passes eight
  // characters. Capped here so the number always fits its plate, whatever the
  // room raises.
  const totalSize = $derived(
    totalText.length <= 6 ? 210 : totalText.length <= 8 ? 200 : totalText.length <= 10 ? 168 : 138,
  );
  // Calm scenes stack an eyebrow, the number and a line of copy in one plate,
  // so the number gives a little room back.
  const centerSize = $derived(Math.round(totalSize * 0.86));
  const goalLine = $derived(COPY.ofGoal.replace("GOAL", money(goalCents)));

  const donateUrl = $derived(String($liveState.config?.donate_url || galaTeaser.ticketsUrl || ""));
  const donateShort = $derived(String($liveState.config?.donate_short || ""));
  const sponsors = $derived(Array.isArray($liveState.config?.sponsors) ? $liveState.config.sponsors : []);
  const programOverrides = $derived($liveState.program?.honoree_overrides || {});
  const levelCents = $derived($liveState.current_level_cents);
  const impactLine = $derived(
    ($liveState.levels || []).find((l) => Number(l?.amount_cents) === Number(levelCents))?.impact_line || "",
  );
  const matchOn = $derived(!!$liveState.match?.active);

  /* ---------------- imperative wiring ---------------- */
  let director = null;
  let feed = null;
  let operator = null;
  let demoGen = null;
  let clock = null;
  let watchdog = null;
  let sc = null;
  let raf = 0;
  let building = false;
  let seed = DEFAULT_SEED;
  let eventSlug = DEFAULT_EVENT;
  let projector = false;
  let liftOverride = null;
  let confettiFn = null;
  let statusAt = 0;
  let pendingStatus = null;
  let wakeLock = null;
  let cursorTimer = 0;

  function hasWebGL2() {
    try {
      return !!document.createElement("canvas").getContext("webgl2");
    } catch {
      return false;
    }
  }

  function rendererString() {
    try {
      const c = document.createElement("canvas").getContext("webgl2");
      const ext = c?.getExtension("WEBGL_debug_renderer_info");
      return ext ? String(c.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    } catch {
      return "";
    }
  }

  /** 05 section 5.5. ?fx wins, then the operator row, then auto-detect. */
  function autoLevel() {
    if (reduced) return "off";
    // Phones and any portrait viewport get the lightweight hero: the phone
    // layout is a scrolling column, and a full-screen WebGL canvas behind it
    // would only cost battery.
    if (window.matchMedia("(max-width: 899px), (orientation: portrait)").matches) return "off";
    if (window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900) return "off";
    if (!hasWebGL2()) return "off";
    const cores = navigator.hardwareConcurrency || 8;
    if (cores <= 4 || /Intel(?!.*Arc)|SwiftShader|llvmpipe/i.test(rendererString())) return "lite";
    return "full";
  }

  function decideLevel(stateFx) {
    if (requested !== "auto") return requested;
    const auto = autoLevel();
    if (stateFx === "off") return "off";
    if (auto === "off") return "off";
    if (stateFx === "lite") return "lite";
    return auto;
  }

  /* ---------------- scene lifecycle ---------------- */

  function teardownScene() {
    if (!sc) return;
    try {
      sc.dispose();
    } catch {
      /* a dead context throws on dispose; the canvas is gone either way */
    }
    sc = null;
    director?.setScene(null);
    hasCanvas = false;
    canvasIn = false;
  }

  async function buildScene() {
    if (building || sc || !hostEl) return;
    if (level === "off" || effScene === "blackout") return;
    building = true;
    try {
      const mod = await import("../../../lib/galaLive/scene/Scene.js");
      const built = await mod.buildScene(hostEl, {
        level: level === "lite" ? "lite" : "full",
        seed,
        projector,
        lift: liftOverride ?? undefined,
      });
      sc = built;
      director.setScene(sc);
      watchdog.watch(sc.canvas);
      hasCanvas = true;
      requestAnimationFrame(() => {
        canvasIn = true; // fade the canvas in over 700 ms, HausDiscoBall contract
      });
    } catch (err) {
      console.warn("[gala/live] scene unavailable, running DOM only", err?.message || err);
      level = "off";
      hasCanvas = false;
    } finally {
      building = false;
    }
  }

  async function rebuildScene() {
    teardownScene();
    await buildScene();
  }

  /* ---------------- celebrations without a canvas ---------------- */

  async function fireConfetti(kind, at = null) {
    if (hasCanvas || reduced) return;
    try {
      if (!confettiFn) confettiFn = (await import("canvas-confetti")).default;
    } catch {
      return;
    }
    const colors = ["#FFBD59", "#FFF1BE", "#FFF8EF", "#B9842F"];
    const origin = at || (isPhone ? { x: 0.5, y: 0.45 } : { x: layout === "hero" ? 0.28 : 0.5, y: 0.45 });
    const n = kind === "goal" ? 200 : kind === "milestone" ? 120 : 55;
    confettiFn({ particleCount: n, spread: kind === "goal" ? 110 : 72, origin, colors, disableForReducedMotion: true, scalar: 1.1 });
    if (kind === "goal") {
      setTimeout(() => confettiFn?.({ particleCount: 160, spread: 130, origin, colors, disableForReducedMotion: true }), 700);
    }
  }

  /* ---------------- run of show ---------------- */

  let writer = null;
  let noteTimer = 0;

  function flashNote(text) {
    localNote = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      localNote = "";
    }, 4000);
  }

  /**
   * Move the room. Shown here at once; written to the display state when this
   * browser holds an admin session (unlock /gala/control once on this laptop
   * with "Remember this device"), so every phone follows. Without a session
   * the step stays on this screen only, flagged LOCAL, until the control
   * phone moves the room.
   */
  async function goTo(target) {
    if (demoMode) {
      localPos = { ...target, basis: "demo" };
      return;
    }
    const basis = String($liveState.program?.updated_at || "");
    localPos = { ...target, basis };
    if (!writer) writer = createCheckinRemote({ event: eventSlug });
    const res = await writer.displaySet(newOpId(), patchFor(target));
    if (res?.ok && res.state) {
      const st = mergeState(res.state);
      liveState.set(st);
      sceneName = st.scene;
      director?.setSceneName(st.scene);
      localFlag = false;
    } else {
      localFlag = true;
      flashNote(
        res?.transient
          ? "Offline · this step shows on this screen only"
          : "Local only · unlock /gala/control on this laptop to move every phone",
      );
    }
  }

  const programNext = () => goTo(nextPos(pos));
  const programPrev = () => goTo(prevPos(pos));
  const programHome = () => goTo({ seg: "seating", step: 0 });

  // A newer server pointer always wins over a local step.
  $effect(() => {
    const u = String($liveState.program?.updated_at || "");
    if (localPos && localPos.basis !== "demo" && u !== localPos.basis) localPos = null;
  });

  /** One-shot light for the program: the kickoff flare and the honoree burst. */
  function programMoment(kind, el) {
    if (!momentsArmed || !el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (sc) {
      try {
        if (kind === "reveal") {
          const at = sc.screenToWorld(cx, cy);
          sc.emitSparks(at, 260, 7);
          sc.ring(at, sc.extent() * 1.3, 1.4, 1.4);
          sc.emitConfetti(Math.round((sc.confettiCapacity() || 400) * 0.35), "pop", at);
        } else if (kind === "kickoff") {
          sc.burstAlongX(320, 8);
          sc.ring(sc.anchor(), sc.extent() * 2.2, 1.8, 1.3);
        }
      } catch {
        /* a lost context mid moment: the DOM animation still plays */
      }
    } else {
      fireConfetti(kind === "reveal" ? "milestone" : "gift", {
        x: cx / Math.max(1, window.innerWidth),
        y: cy / Math.max(1, window.innerHeight),
      });
    }
  }

  /* ---------------- boot ---------------- */

  onMount(() => {
    const Q = new URLSearchParams(window.location.search);
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    debug = Q.get("debug") === "1";
    hudOn = debug;

    const demoParam = Q.get("demo") || "";
    demoMode = demoParam === "1" || demoParam === "soak" || demoParam.startsWith("script");
    const fxParam = Q.get("fx");
    if (fxParam === "off" || fxParam === "lite" || fxParam === "full") requested = fxParam;
    seed = Number(Q.get("seed")) || DEFAULT_SEED;
    projector = Q.get("proj") === "1";
    boost = Q.get("boost") === "1";
    if (projector) liftOverride = PROJECTOR.projector.lift;
    // DEV only: never let a deployed projector be pointed at another slug.
    if (import.meta.env.DEV && Q.get("event")) eventSlug = Q.get("event");

    const mq = window.matchMedia("(max-width: 899px), (orientation: portrait)");
    isPhone = mq.matches;
    const onMq = (e) => {
      isPhone = e.matches;
    };
    mq.addEventListener("change", onMq);

    const demoGoal = demoMode && Number(Q.get("goal")) ? Number(Q.get("goal")) * 100 : 0;
    const startState = mergeState({
      ...($liveState || {}),
      live: demoMode,
      scene: demoMode ? Q.get("scene") || "appeal" : "ambient",
      goal_cents: demoGoal || undefined,
    });
    liveState.set(startState);
    if (demoMode) sceneName = startState.scene;

    clock = createClock();
    director = createDirector({
      goalCents: startState.goal_cents,
      tierEdges: startState.tier_cents,
      ui: {
        setCard: (c) => heroCard.set(c),
        setRows: (r) => rollRows.set(r),
        setBanner: (b) => banner.set(b),
        setTotals: (t) => totals.set(t),
        setStatus: (s) => {
          pendingStatus = s; // flushed at 4 Hz: 60 Hz store writes help nobody
        },
        celebrate: (kind) => fireConfetti(kind),
      },
    });

    watchdog = createWatchdog({
      onRebuild: () => rebuildScene(),
      onGiveUp: () => {
        level = "off";
        teardownScene();
      },
      onDegrade: (n) => {
        if (n >= 4 && level !== "lite") {
          level = "lite";
          rebuildScene();
        } else sc?.setDegrade(n);
      },
    });

    operator = createOperator({
      director,
      actions: {
        setScene: (s) => {
          sceneName = s;
        },
        setHold: () => {},
        setLift: (v) => {
          liftOverride = v;
          rebuildScene();
        },
        setBoost: () => {
          boost = !boost;
        },
        toggleHud: () => {
          hudOn = !hudOn;
        },
        toggleCalibration: () => {
          calib = !calib;
        },
        toggleSafeArea: () => {
          safeArea = !safeArea;
        },
        toggleQrSpotlight: () => {
          qrSpot = !qrSpot;
        },
        fullscreen: () => document.documentElement.requestFullscreen?.().catch(() => {}),
        programNext: () => programNext(),
        programPrev: () => programPrev(),
        programHome: () => programHome(),
        cycleFx: () => {
          requested = requested === "full" ? "lite" : requested === "lite" ? "off" : "full";
          level = decideLevel($liveState.fx_mode);
          if (level === "off") teardownScene();
          else rebuildScene();
        },
        reloadPage: () => window.location.reload(),
        setLocalFlag: (v) => {
          localFlag = v;
        },
        setStale: (v) => {
          stale = v;
        },
      },
    });
    const detachKeys = operator.attach();

    level = decideLevel(startState.fx_mode);

    // Seating names: only with BOTH a display key and the seating passcode in
    // the fragment (#k=...&seat=...). Guests have neither; their phones show the
    // numbers-only map.
    let seatingSrc = null;
    const seatPass = readSeatingPass();
    if (demoMode || (import.meta.env.DEV && Q.get("seatdemo") === "1")) {
      demoBoard().then((b) => {
        board = b;
      });
    } else if (seatPass && readDisplayKey()) {
      seatingSrc = createSeatingSource({
        slug: SEATING_SLUG,
        passcode: seatPass,
        onBoard: (b, reason) => {
          if (b) board = b;
          else console.warn("[gala/live] seating plan not loaded:", reason);
        },
      });
    }
    setTimeout(() => {
      momentsArmed = true;
    }, 2500);

    if (demoMode) {
      feedStatus.set({ ...$feedStatus, mode: "demo", named: true, live: true });
      import("../../../lib/galaLive/demo.js").then(({ createDemo }) => {
        demoGen = createDemo({
          director,
          seed,
          script: demoParam === "1" ? "" : demoParam,
          goalCents: startState.goal_cents,
        });
      });
    } else {
      const key = readDisplayKey();
      feed = createGiftFeed({
        event: eventSlug,
        key,
        director,
        onStatus: (s) => feedStatus.set({ ...$feedStatus, ...s }),
        onState: (payload, io) => {
          const st = mergeState(payload);
          liveState.set(st);
          operator.applyState(st, io);
          const next = decideLevel(st.fx_mode);
          if (next !== level) {
            level = next;
            if (level === "off") teardownScene();
            else rebuildScene();
          }
        },
      });
      feed.start();
    }

    buildScene();

    /* ---------------- the one rAF loop ---------------- */
    clock.start();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      // The stall detector watches THIS loop. It must be fed even with no
      // canvas, or fx=off would look like a dead renderer every five seconds.
      watchdog.noteFrame();
      const dt = clock.tick(now);
      demoGen?.tick(dt);
      director.tick(dt, clock.now);

      // uNow rebase: only when nothing is in flight, so nothing can replay.
      if (clock.now > 600 && director.isQuiet()) {
        const delta = clock.rebase();
        director.rebase(delta);
        sc?.rebaseBy(delta);
      }

      if (sc) {
        try {
          sc.frame(dt, { t: clock.t, now: clock.now, ...director.frameState() });
        } catch (err) {
          console.error("[gala/live] frame error", err);
          teardownScene();
          watchdog.frameThrew();
        }
      }
      watchdog.sample(dt, !!sc);

      const ms = performance.now();
      if (ms - statusAt > 250) {
        statusAt = ms;
        if (pendingStatus) {
          showStatus.set(pendingStatus);
          pendingStatus = null;
        }
        const w = watchdog.stats;
        fxStatus.set({
          level,
          requested,
          fps: w.fps,
          ms: w.ms,
          draws: sc ? sc.drawCalls() : 0,
          degrade: w.degrade,
          rebuilds: w.rebuilds,
          losses: w.losses,
          canvas: !!sc,
          pixelRatio: sc ? sc.pixelRatio() : 1,
        });
      }
    };
    raf = requestAnimationFrame(loop);

    /* ---------------- page lifecycle ---------------- */
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        clock.stop();
      } else {
        clock.start();
        // The stall detector must not count the time the tab spent hidden.
        watchdog.noteFrame();
        if (!raf) raf = requestAnimationFrame(loop);
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => sc?.resize(), 150);
    };
    window.addEventListener("resize", onResize);

    const onMove = () => {
      cursorHidden = false;
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(() => {
        cursorHidden = true;
      }, 3000);
    };
    window.addEventListener("mousemove", onMove);
    onMove();

    const onHide = () => feed?.flush();
    window.addEventListener("pagehide", onHide);

    requestWakeLock();

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeTimer);
      clearTimeout(cursorTimer);
      mq.removeEventListener("change", onMq);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("pagehide", onHide);
      detachKeys();
      seatingSrc?.stop();
      clearTimeout(noteTimer);
      watchdog.stop();
      feed?.stop();
      teardownScene();
      try {
        wakeLock?.release();
      } catch {
        /* fine */
      }
    };
  });

  async function requestWakeLock() {
    try {
      wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      /* not available, or denied: the laptop checklist covers this */
    }
  }

  /* Blackout frees the GPU for whatever else the laptop is playing. */
  $effect(() => {
    if (!director) return;
    const dark = effScene === "blackout";
    if (dark && sc) teardownScene();
    else if (!dark && !sc && level !== "off" && hostEl) buildScene();
  });

  /* A scene change moves every rect the scene reads. */
  $effect(() => {
    void layout;
    void qrSpot;
    void programOn;
    void pos.seg;
    void pos.step;
    if (!sc) return;
    requestAnimationFrame(() => sc?.resize());
    // Again once the outgoing view has faded, so the quiet rects and the X
    // anchor are read from the new view only.
    const t = setTimeout(() => sc?.resize(), 1300);
    return () => clearTimeout(t);
  });

  /* The total's settle bump (04 section 3.5). */
  $effect(() => {
    if (!$totals.bump) return;
    bumping = false;
    requestAnimationFrame(() => {
      bumping = true;
      setTimeout(() => {
        bumping = false;
      }, 520);
    });
  });

  const slotClass = (ch) => (ch === "," ? "c" : ch === "$" ? "s" : ch === "." ? "c" : "d");
</script>

<svelte:head>
  <meta name="robots" content="noindex" />
</svelte:head>

<div
  class="g26 g26-live"
  class:boost
  class:phone={isPhone}
  class:dark={layout === "dark"}
  class:nocursor={cursorHidden && !isPhone}
>
  <!-- z -1: the CSS backdrop. Visible whenever the canvas is absent. -->
  <div class="backdrop" aria-hidden="true"></div>
  <div class="fxhost" class:in={canvasIn} bind:this={hostEl} aria-hidden="true"></div>

  {#if layout === "dark"}
    <div class="blackout" transition:fade={{ duration: 400 }}></div>
  {:else if isPhone}
    <!-- 04 section 3.9: single column, normal scroll, no ticker, no QR. -->
    <main class="ph">
      <header class="ph-lockup">
        <div class="eyebrow">{COPY.org}</div>
        <h1>{COPY.ambientTitle}</h1>
      </header>

      {#if $liveState.live && effScene !== "ambient"}
        <ProgramMirror
          program={$liveState.program}
          scene={effScene}
          {levelCents}
          {impactLine}
          {reduced}
          demo={demoMode}
        />
      {/if}

      <section class="ph-hero">
        <div class="ph-x" data-fx-anchor="x">
          <XFillFallback progress={pct} goalMet={goalMet} reduced={reduced} />
        </div>
        <div class="ph-total">{totalText}</div>
        <div class="ph-goal">{goalLine} · <b>{pctLabel}%</b></div>
      </section>

      {#if donateUrl}
        <a class="ph-give" href={donateUrl} rel="noopener" target="_blank">{COPY.giveNow}</a>
      {/if}

      {#if $liveState.message}<p class="ph-msg">{$liveState.message}</p>{/if}
      {#if !named}<p class="ph-note">{COPY.noNamesNote}</p>{/if}

      {#if sponsors.length}
        <section class="ph-sponsors"><SponsorStrip {sponsors} max={12} /></section>
      {/if}
    </main>
  {:else}
    <!-- The 1920 x 1080 stage. Everything inside is sized in stage units. -->
    <div class="stage">
      <div
        class="frame"
        class:hero={!programOn && layout === "hero"}
        class:center={!programOn && layout === "center"}
        class:program={programOn}
      >
        {#if programOn}
          <ProgramStage
            {pos}
            overrides={programOverrides}
            {board}
            {totalText}
            showTotal={$liveState.live && $totals.cents > 0}
            pct={pct}
            {goalMet}
            {hasCanvas}
            {reduced}
            {sponsors}
            rows={$rollRows}
            overflow={$showStatus.overflow}
            {named}
            banner={$banner}
            onMoment={programMoment}
          />
        {:else}
        {#if layout === "hero"}
          <FollowStrip variant="top" />
        {:else}
          <FollowStrip variant="corner" />
        {/if}
        <header class="hdr">
          <div>{COPY.org}</div>
          {#if layout !== "hero"}<div class="sub">{COPY.eventLine}</div>{/if}
        </header>

        <!-- The X. The scene places and scales the mark to fit this box. -->
        <div class="zone-x" data-fx-anchor="x">
          {#if !hasCanvas}
            <XFillFallback progress={pct} goalMet={goalMet} reduced={reduced} />
          {/if}
        </div>

        {#if layout === "hero"}
          <section class="zone-totals" data-fx-quiet>
            <div class="eyebrow">{auctionLive ? COPY.currentBid : COPY.raisedTonight}</div>
            <div class="total" class:bump={bumping} style={`font-size: calc(var(--u) * ${totalSize})`}>
              {#each totalText.split("") as ch, i (i)}<span class={slotClass(ch)}>{ch}</span>{/each}
            </div>
            <div class="rule"></div>
            <div class="goalline">{goalLine} · <b>{pctLabel}%</b></div>
          </section>

          <section class="zone-level">
            <div class="eyerow">
              <div class="eyebrow">
                {#if auctionLive}{COPY.lot} {$liveState.auction.lot || ""}{:else if levelCents}{COPY.askLevel}{/if}
              </div>
              {#if matchOn && $liveState.match?.label}
                <div class="matchchip">{COPY.matchEyebrow} · {$liveState.match.label}</div>
              {/if}
            </div>
            <div class="levelrow">
              {#if auctionLive}
                <div class="levelnum">{$liveState.auction.title}</div>
                <div class="impact">
                  {$liveState.auction.status === "once"
                    ? COPY.goingOnce
                    : $liveState.auction.status === "twice"
                      ? COPY.goingTwice
                      : $liveState.auction.status === "sold"
                        ? COPY.sold
                        : ""}
                </div>
              {:else if levelCents}
                <div class="levelnum">{money(levelCents)}</div>
                <div class="impact">{impactLine}</div>
              {:else}
                <div class="impact wide">{$liveState.message}</div>
              {/if}
            </div>
          </section>

          <section class="zone-card" data-fx-quiet>
            <GiftCard card={$heroCard} reduced={reduced} />
          </section>

          <section class="zone-roll" data-fx-quiet>
            <RollCall rows={$rollRows} overflow={$showStatus.overflow} reduced={reduced} />
          </section>

          <section class="zone-bottomleft" data-fx-quiet>
            {#if $banner}
              <Banner banner={$banner} reduced={reduced} />
            {:else if donateUrl}
              <DonateQr url={donateUrl} short={donateShort} spotlight={qrSpot} />
            {/if}
          </section>
        {:else}
          <!-- Calm scenes: ambient, program, finale, thanks, and every public
               (unkeyed) view. Simple cards on the same world. -->
          <section class="zone-center" data-fx-quiet>
            {#if $banner}
              <Banner banner={$banner} reduced={reduced} />
            {:else if $heroCard && (effScene === "ambient" || effScene === "program")}
              <GiftCard card={$heroCard} compact reduced={reduced} />
            {:else if effScene === "finale" || effScene === "thanks"}
              <div class="ctext">
                <div class="eyebrow">{effScene === "finale" ? COPY.goalReached : COPY.thanksEyebrow}</div>
                <div class="total big" style={`font-size: calc(var(--u) * ${centerSize})`}>
                  {#each totalText.split("") as ch, i (i)}<span class={slotClass(ch)}>{ch}</span>{/each}
                </div>
                <div class="cthanks">{COPY.thanks}</div>
              </div>
            {:else}
              <div class="ctext">
                <div class="eyebrow">{COPY.ambientTitle}</div>
                {#if $liveState.live && $totals.cents > 0}
                  <div class="total big" style={`font-size: calc(var(--u) * ${centerSize})`}>
                    {#each totalText.split("") as ch, i (i)}<span class={slotClass(ch)}>{ch}</span>{/each}
                  </div>
                  <div class="goalline">{goalLine} · <b>{pctLabel}%</b></div>
                {:else}
                  <div class="cthanks">{COPY.ambientLine}</div>
                {/if}
                {#if $liveState.message}<div class="cmsg">{$liveState.message}</div>{/if}
              </div>
            {/if}
          </section>

          <section class="zone-bottomrow" data-fx-quiet>
            <div class="br-left">
              {#if donateUrl && effScene !== "finale"}
                <DonateQr url={donateUrl} short={donateShort} spotlight={qrSpot} compact={!qrSpot} />
              {/if}
            </div>
            <div class="br-right">
              {#if named && (effScene === "ambient" || effScene === "program")}
                <RollCall rows={$rollRows} overflow={$showStatus.overflow} reduced={reduced} />
              {:else if sponsors.length}
                <SponsorStrip {sponsors} max={5} />
              {:else if !named}
                <div class="brnote">{COPY.noNamesNote}</div>
              {/if}
            </div>
          </section>
        {/if}

        {/if}

        {#if safeArea}<div class="safebox" aria-hidden="true"></div>{/if}
        {#if calib}<CalibrationCard />{/if}
      </div>
    </div>
  {/if}

  {#if localNote && !isPhone}
    <div class="localnote" transition:fade={{ duration: 300 }}>{localNote}</div>
  {/if}

  {#if demoMode}
    <div class="demoflag">{COPY.demoBadge}</div>
    <div class="demobtns">
      <button onclick={() => demoGen?.push(10000)}>+ $100</button>
      <button onclick={() => demoGen?.push(50000)}>+ $500</button>
      <button onclick={() => demoGen?.push(100000)}>+ $1,000</button>
      <button onclick={() => demoGen?.push(500000)}>+ $5,000</button>
      <button onclick={() => demoGen?.burst(12)}>Burst x12</button>
      <button onclick={() => demoGen?.burst(30)}>Burst x30</button>
      <button onclick={() => demoGen?.jumpToGoal(0.95)}>Jump to 95%</button>
      <button onclick={() => sc?.renderer.getContext().getExtension("WEBGL_lose_context")?.loseContext()}>
        Lose context
      </button>
    </div>
  {/if}

  {#if debug}
    {#if hudOn}
      <Hud
        fx={$fxStatus}
        show={$showStatus}
        feed={$feedStatus}
        state={$liveState}
        local={localFlag}
        {stale}
        keyMode={$feedStatus.mode}
      />
    {/if}
  {/if}
</div>

<style>
  /* Layout only. The token block lives on the page, scoped to .g26. */
  .g26-live {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: var(--g26-bg-bot);
    color: var(--g26-text);
    font-family: var(--g26-sans);
  }
  .g26-live.phone {
    position: static;
    overflow: visible;
    min-height: 100vh;
    overflow-x: hidden;
    /* Off the 1920 stage, `u` stops meaning "a projector pixel". Pin it so the
       shared components keep sensible sizes on a phone. */
    --u: 0.62px;
  }
  .nocursor {
    cursor: none;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    background:
      radial-gradient(60vw 60vh at 28% 46%, rgba(255, 189, 89, 0.15), transparent 70%),
      linear-gradient(180deg, var(--g26-bg-top) 0%, var(--g26-bg-mid) 45%, var(--g26-bg-bot) 100%);
  }
  .fxhost {
    position: fixed;
    inset: 0;
    z-index: 0;
    opacity: 0;
    transition: opacity 700ms ease;
  }
  .fxhost.in {
    opacity: 1;
  }
  .blackout {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: #000;
  }

  .stage {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .frame {
    position: relative;
    width: calc(var(--u) * 1920);
    height: calc(var(--u) * 1080);
  }
  .hdr,
  .zone-x,
  .zone-totals,
  .zone-level,
  .zone-card,
  .zone-roll,
  .zone-bottomleft,
  .zone-center,
  .zone-bottomrow,
  .safebox {
    position: absolute;
  }

  /* --- header --- */
  .hdr {
    left: calc(var(--u) * 96);
    right: calc(var(--u) * 96);
    top: calc(var(--u) * 54);
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-weight: 800;
    letter-spacing: 0.42em;
    font-size: calc(var(--u) * 26);
    text-transform: uppercase;
    color: var(--g26-cream);
    text-shadow: 0 calc(var(--u) * 2) calc(var(--u) * 12) rgba(5, 7, 12, 0.85);
  }
  .hdr .sub {
    color: var(--g26-gold);
  }

  /* --- zones: hero (appeal, live auction) --- */
  .frame.hero .zone-x {
    left: calc(var(--u) * 96);
    top: calc(var(--u) * 130);
    width: calc(var(--u) * 880);
    height: calc(var(--u) * 700);
  }
  /* Fixed bands, all with overflow hidden: two panels can never collide, and a
     long donor name or a seven figure total can never push one into another. */
  .frame.hero .zone-totals {
    left: calc(var(--u) * 1000);
    width: calc(var(--u) * 824);
    top: calc(var(--u) * 120);
    height: calc(var(--u) * 336);
    overflow: hidden;
    padding: calc(var(--u) * 12) calc(var(--u) * 24);
    /* Never below 55% ink: the plate is what keeps the number readable at the
       brightest frame of a finale. */
    background: linear-gradient(90deg, rgba(5, 7, 12, 0.82), rgba(5, 7, 12, 0.62));
    border-left: calc(var(--u) * 5) solid var(--g26-gold);
    border-radius: calc(var(--u) * 4);
  }
  .frame.hero .zone-level {
    left: calc(var(--u) * 1000);
    width: calc(var(--u) * 824);
    top: calc(var(--u) * 470);
    height: calc(var(--u) * 158);
    overflow: hidden;
    padding: calc(var(--u) * 10) calc(var(--u) * 24);
    background: rgba(5, 7, 12, 0.7);
    border-radius: calc(var(--u) * 4);
  }
  .frame.hero .zone-card {
    left: calc(var(--u) * 1000);
    width: calc(var(--u) * 824);
    top: calc(var(--u) * 646);
    height: calc(var(--u) * 200);
  }
  .frame.hero .zone-roll {
    left: calc(var(--u) * 1000);
    width: calc(var(--u) * 824);
    top: calc(var(--u) * 864);
    height: calc(var(--u) * 162);
  }
  .frame.hero .zone-bottomleft {
    left: calc(var(--u) * 96);
    width: calc(var(--u) * 880);
    top: calc(var(--u) * 850);
    height: calc(var(--u) * 176);
  }

  /* --- zones: centered (ambient, program, finale, thanks, public) --- */
  .frame.center .zone-x {
    left: calc(var(--u) * 660);
    top: calc(var(--u) * 76);
    width: calc(var(--u) * 600);
    height: calc(var(--u) * 474);
  }
  .frame.center .zone-center {
    left: calc(var(--u) * 260);
    width: calc(var(--u) * 1400);
    top: calc(var(--u) * 566);
    height: calc(var(--u) * 324);
  }
  .frame.center .zone-bottomrow {
    left: calc(var(--u) * 96);
    /* The right 640u belong to the follow-along strip. */
    width: calc(var(--u) * 1080);
    top: calc(var(--u) * 904);
    height: calc(var(--u) * 122);
    display: flex;
    gap: calc(var(--u) * 40);
  }
  .br-left,
  .br-right {
    position: relative;
    flex: 1 1 50%;
  }
  .brnote {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    font-weight: 800;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    font-size: calc(var(--u) * 24);
    color: var(--g26-muted);
  }
  .ctext {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(var(--u) * 4);
    text-align: center;
    background: rgba(5, 7, 12, 0.68);
    border-radius: calc(var(--u) * 6);
    padding: calc(var(--u) * 12) calc(var(--u) * 28);
    overflow: hidden;
  }
  .cthanks {
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: calc(var(--u) * 68);
    line-height: 1.05;
    color: var(--g26-cream);
  }
  .cmsg {
    font-size: calc(var(--u) * 34);
    font-weight: 700;
    color: var(--g26-warm);
  }

  /* --- shared type --- */
  .eyebrow {
    font-weight: 800;
    letter-spacing: 0.42em;
    font-size: calc(var(--u) * 26);
    color: var(--g26-gold);
    text-transform: uppercase;
    line-height: 1.2;
  }
  .total {
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
    line-height: 1.02;
    color: var(--g26-cream);
    white-space: nowrap;
    display: block;
    text-shadow: 0 0 calc(var(--u) * 30) rgba(255, 189, 89, 0.3);
    transform-origin: left center;
  }
  .total.big {
    transform-origin: center;
  }
  /* Didot's figures are proportional, so every glyph gets a fixed slot. */
  .total span {
    display: inline-block;
    text-align: center;
  }
  .total span.d {
    width: 0.56em;
  }
  .total span.c {
    width: 0.27em;
  }
  .total span.s {
    width: 0.52em;
  }
  .total.bump {
    animation: g26bump 0.5s ease-out;
  }
  @keyframes g26bump {
    0% {
      transform: scale(1);
    }
    30% {
      transform: scale(1.035);
      color: var(--g26-gold);
    }
    100% {
      transform: scale(1);
    }
  }
  .rule {
    height: calc(var(--u) * 3);
    margin: calc(var(--u) * 8) 0;
    background: linear-gradient(90deg, var(--g26-gold), rgba(255, 189, 89, 0));
  }
  .goalline {
    font-size: calc(var(--u) * 36);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--g26-warm);
    font-variant-numeric: tabular-nums lining-nums;
  }
  .goalline b {
    color: var(--g26-gold);
  }
  .matchchip {
    margin-bottom: calc(var(--u) * 6);
    display: inline-block;
    font-weight: 800;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    font-size: calc(var(--u) * 24);
    color: var(--g26-ink);
    background: var(--g26-gold);
    padding: calc(var(--u) * 4) calc(var(--u) * 14);
    border-radius: calc(var(--u) * 2);
  }
  .eyerow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: calc(var(--u) * 16);
  }
  .levelrow {
    display: flex;
    align-items: baseline;
    gap: calc(var(--u) * 22);
    min-width: 0;
  }
  .levelnum {
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: calc(var(--u) * 96);
    line-height: 1.04;
    color: var(--g26-cream);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 0 1 auto;
  }
  .impact {
    font-size: calc(var(--u) * 30);
    font-weight: 700;
    color: var(--g26-warm);
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .impact.wide {
    white-space: normal;
    font-size: calc(var(--u) * 34);
  }

  .safebox {
    left: calc(var(--u) * 96);
    top: calc(var(--u) * 54);
    right: calc(var(--u) * 96);
    bottom: calc(var(--u) * 54);
    border: calc(var(--u) * 2) dashed rgba(255, 189, 89, 0.7);
    pointer-events: none;
  }

  .localnote {
    position: fixed;
    left: 12px;
    bottom: 12px;
    z-index: 70;
    font: 700 14px var(--g26-sans);
    color: var(--g26-ink);
    background: var(--g26-alert);
    padding: 6px 12px;
    border-radius: 3px;
  }

  /* --- demo and debug chrome --- */
  .demoflag {
    position: fixed;
    right: 10px;
    bottom: 10px;
    z-index: 70;
    font-weight: 800;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    font-size: 14px;
    color: var(--g26-ink);
    background: var(--g26-gold);
    padding: 5px 12px;
  }
  .demobtns {
    position: fixed;
    left: 10px;
    top: 120px;
    z-index: 70;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .demobtns button {
    font: 600 12px var(--g26-sans);
    background: rgba(5, 7, 12, 0.85);
    color: var(--g26-cream);
    border: 1px solid rgba(255, 189, 89, 0.5);
    padding: 5px 9px;
    cursor: pointer;
    text-align: left;
  }
  .demobtns button:hover {
    background: var(--g26-gold);
    color: var(--g26-ink);
  }

  /* --- phone (04 section 3.9) --- */
  .ph {
    position: relative;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 28px 16px 56px;
    max-width: 560px;
    margin: 0 auto;
  }
  .ph-lockup {
    text-align: center;
  }
  .ph-lockup .eyebrow {
    font-size: 13px;
    letter-spacing: 0.32em;
  }
  .ph-lockup h1 {
    margin: 6px 0 0;
    font-family: var(--g26-serif);
    font-style: italic;
    font-weight: 400;
    font-size: 40px;
    color: var(--g26-cream);
  }
  .ph-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .ph-x {
    position: relative;
    width: min(74vw, 320px);
    aspect-ratio: 1;
  }
  .ph-total {
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: clamp(52px, 16.5vw, 110px);
    line-height: 1.02;
    color: var(--g26-cream);
    font-variant-numeric: tabular-nums lining-nums;
  }
  .ph-goal {
    font-size: 17px;
    font-weight: 700;
    color: var(--g26-warm);
  }
  .ph-goal b {
    color: var(--g26-gold);
  }
  .ph-give {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 56px;
    border: 1px solid var(--g26-gold);
    border-radius: 3px;
    color: var(--g26-gold);
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    text-decoration: none;
    font-size: 15px;
  }
  .ph-msg {
    margin: 0;
    text-align: center;
    font-size: 17px;
    color: var(--g26-warm);
  }
  .ph-note {
    margin: 0;
    text-align: center;
    font-size: 13px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--g26-muted);
  }
  .ph-sponsors {
    position: relative;
    min-height: 160px;
  }
</style>
