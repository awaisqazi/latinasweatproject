<script>
  // /givingtuesday body. Server-rendered with the static fallback (goal, empty
  // room, Give buttons, no live number), then hydrated: computes the phase from
  // Chicago time, polls giving_public every 25 s while the tab is visible, and
  // rolls out the mats. Copy and facts: src/data/givingTuesday.js. Identity:
  // design.md "Giving Tuesday".
  //
  // Sections: hero (one class photo, the wall of 2026 LSP photos grows out of
  // it; pure CSS, runs without JS) -> the floor (150 mats, $100 each) with the
  // amount picker -> "How we got here", a dated timeline 2022 to now whose
  // line draws down to "What's next" (the ask) -> instructor board -> the ink
  // close. Photos: src/data/givingTuesdayPhotos.js.
  import { onMount, tick } from "svelte";
  import { Tween } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import {
    givingCopy as copy,
    givingFacts as facts,
    phase as phaseAt,
    money,
    progress,
    fill,
    daysUntil,
    matWords,
    prefillsAmount,
    withAmount,
  } from "../../data/givingTuesday.js";
  import { instructorInitials } from "../../data/popUpShared.js";
  import { startPolling, nowOverride } from "../../lib/givingTuesday/live.js";
  import { heroOne, wallPhotos, storyPhotos, wallImage, storyImage } from "../../data/givingTuesdayPhotos.js";
  import MatFloor from "./MatFloor.svelte";
  import GivingLeaderboard from "./GivingLeaderboard.svelte";
  import { rankFundraisers, topRaisers, campaignGiveUrl, BOARD_MATS } from "../../lib/givingTuesday/leaderboard.js";

  let { base = "/" } = $props();

  // ---------------------------------------------------------------- photos --
  // Hero wall: "one" is the class the wall grows from; the list, positions
  // and sources (all 2026) live in src/data/givingTuesdayPhotos.js.
  const WALL = wallPhotos;
  const one = wallImage(heroOne.photo, base, { one: true });
  const story = Object.fromEntries(Object.entries(storyPhotos).map(([k, p]) => [k, { ...p, ...storyImage(p.photo, base) }]));
  // Offsets toward the one photo, in tile units, and a delay that grows with
  // distance (a little uneven, like people arriving).
  function wallVars(t, i) {
    const out = [];
    const jitter = [0, 40, 15, 55, 25, 5, 50, 30, 10, 45, 20, 35, 60, 0][i % 14];
    if (t.n) {
      const [c, r] = t.n;
      const dx = 3 - (c - 0.5), dy = 3 - (r - 0.5);
      out.push(`--cn:${c}`, `--rn:${r}`, `--dxn:${dx}`, `--dyn:${dy}`, `--dln:${Math.round(420 + Math.hypot(dx, dy) * 260 + jitter)}ms`);
    }
    const [c, r] = t.w;
    const dx = 3 - (c - 0.5) + 1, dy = 2 - (r - 0.5);
    out.push(`--cw:${c}`, `--rw:${r}`, `--dxw:${dx}`, `--dyw:${dy}`, `--dlw:${Math.round(420 + Math.hypot(dx, dy * 1.2) * 230 + jitter)}ms`);
    return out.join(";");
  }

  // ------------------------------------------------------------------ state --
  // "idle" until the first answer, then "live" or "down" (no number invented).
  let status = $state("idle");
  let data = $state(null);
  // SSR renders the "early" phase (most of the campaign); the browser corrects it.
  let now = $state(Date.parse(facts.startsAt));
  let mounted = $state(false);
  let reduced = $state(false);
  let failedAvatars = $state({});
  let shareNote = $state("");
  // The floor shows nothing until it is on screen, then the live total.
  let floorSeen = $state(false);
  let boardSeen = $state(false);
  let storySeen = $state(false);
  let floorEl = $state(null);
  let boardEl = $state(null);
  let classesEl = $state(null);

  // Amount picker: a preset in dollars, or "other".
  let pick = $state(String(copy.picker.preset));
  let otherDollars = $state("");

  const total = new Tween(0, { duration: 1100, easing: cubicOut });

  const campaign = $derived(data?.campaign ?? null);
  const goalCents = $derived(campaign?.goal_cents ?? facts.goalCents);
  const thresholdCents = $derived(campaign?.threshold_cents ?? facts.thresholdCents);
  const giveUrl = $derived(campaignGiveUrl(campaign, base));
  const ph = $derived(
    phaseAt(now, campaign?.starts_at ?? facts.startsAt, campaign?.ends_at ?? facts.endsAt, facts.givingDay),
  );
  const phaseCopy = $derived(copy.phases[ph]);
  const totalCents = $derived(data?.total_cents ?? 0);
  const giftCount = $derived(data?.gift_count ?? 0);
  const over = $derived(totalCents >= goalCents);
  const goalLabel = $derived(money(goalCents));
  const live = $derived(status === "live");
  // Board order (shared with the homepage band, src/lib/givingTuesday/
  // leaderboard.js): amount raised, most first; then first name; then full
  // name (localeCompare, sensitivity "base"). The top five race shows only
  // when at least three people have raised money.
  const fundraisers = $derived(rankFundraisers(data?.fundraisers));
  const leaders = $derived(topRaisers(fundraisers));
  const showBoard = $derived(live && campaign?.board_open === true && fundraisers.length > 0);
  const external = $derived(/^https?:/i.test(giveUrl));

  // Picked amount in dollars (0 when "other" is empty or not a number).
  const pickDollars = $derived(
    pick === "other" ? Math.max(0, Math.min(100000, Math.round(Number(otherDollars) || 0))) : Number(pick),
  );
  const prefill = $derived(prefillsAmount(giveUrl));
  const pickedUrl = $derived(withAmount(giveUrl, pickDollars));
  const pickedLabel = $derived(prefill && pickDollars > 0 ? `${copy.giveLabel} ${money(pickDollars * 100)}` : copy.giveLabel);
  const previewLine = $derived(
    pickDollars > 0
      ? fill(copy.picker.preview, { amount: money(pickDollars * 100), mats: matWords((pickDollars * 100) / copy.floor.matCents) })
      : copy.picker.previewNone,
  );

  const matsGoal = $derived(Math.ceil(goalCents / copy.floor.matCents));
  const matsFunded = $derived(totalCents / copy.floor.matCents);
  const floorText = $derived(
    live
      ? `A studio floor of ${matsGoal} mats. ${matsFunded > 0 ? matWords(matsFunded).replace(/ mats?$/, "") : "None"} ${matsFunded > 0 && matsFunded <= 1 ? "is" : "are"} rolled out. ${copy.floor.key}`
      : `A studio floor of ${matsGoal} mats. ${copy.floor.key}`,
  );

  const days = $derived(daysUntil(now, facts.givingDay));
  const dayLine = $derived(
    !mounted ? "" : ph === "today" ? copy.floor.endsTonight : ph === "after" ? "" : days >= 1 ? copy.floor.daysTo(days) : "",
  );

  $effect(() => {
    total.set(totalCents, reduced ? { duration: 0 } : undefined);
  });

  function watch(el, onSeen, threshold = 0.3) {
    if (!el) return () => {};
    if (!("IntersectionObserver" in window)) {
      onSeen();
      return () => {};
    }
    // A section taller than the viewport can never show the full ratio, so cap
    // it to what 80% of the viewport can hold or the observer never fires.
    const h = el.getBoundingClientRect().height;
    const reachable = h > 0 ? (window.innerHeight * 0.8) / h : 1;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onSeen();
          io.disconnect();
        }
      },
      { threshold: Math.min(threshold, reachable) },
    );
    io.observe(el);
    return () => io.disconnect();
  }
  $effect(() => watch(floorEl, () => (floorSeen = true), 0.35));
  $effect(() => watch(boardEl, () => (boardSeen = true), 0.15));
  // The board renders only once data arrives, after the browser has given up
  // on a #gt-board-h hash (the homepage band links there): scroll to it once.
  let boardHashDone = false;
  $effect(() => {
    if (!showBoard || boardHashDone || window.location.hash !== "#gt-board-h") return;
    boardHashDone = true;
    tick().then(() => document.getElementById("gt-board-h")?.scrollIntoView({ block: "start" }));
  });
  $effect(() => watch(classesEl, () => (storySeen = true), 0.5));

  // Timeline: one line runs from 2022 down to "What's next" and draws as the
  // page scrolls (time moving forward). --end is the distance to the last
  // chapter's dot; tlP (0..1) is how far the reading line, 62% down the
  // viewport, has travelled along it. No JS or reduced motion: drawn in full.
  let tlEl = $state(null);
  let tlP = $state(1);
  let tlEnd = $state(0);
  let tlTops = $state([]);
  $effect(() => {
    const el = tlEl;
    if (!el || !mounted || reduced) {
      tlP = 1;
      return;
    }
    // Plain locals inside the effect (state is only written, never read
    // here, so the effect does not re-run on its own writes).
    let end = 0;
    const measure = () => {
      const tops = [...el.querySelectorAll(".gt-ch")].map((li) => li.offsetTop);
      end = tops.at(-1) || el.offsetHeight;
      tlTops = tops;
      tlEnd = end;
    };
    // Scroll events already arrive once per frame; one rect read each.
    // Captured on document so it works whichever element scrolls the page.
    const update = () => {
      const y = window.innerHeight * 0.62 - el.getBoundingClientRect().top;
      tlP = Math.max(0, Math.min(1, end ? y / end : 1));
    };
    measure();
    update();
    const ro = new ResizeObserver(() => {
      measure();
      update();
    });
    ro.observe(el);
    const opts = { passive: true, capture: true };
    document.addEventListener("scroll", update, opts);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      document.removeEventListener("scroll", update, opts);
      window.removeEventListener("resize", update);
    };
  });
  const lit = (i) => tlP >= 1 || !tlEnd || tlP * tlEnd >= (tlTops[i] ?? 0) - 2;

  onMount(() => {
    mounted = true;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced = mq.matches;
    const onMq = () => (reduced = mq.matches);
    mq.addEventListener?.("change", onMq);

    const clock = () => (now = nowOverride() ?? Date.now());
    clock();
    const tick = setInterval(clock, 30000);

    const stop = startPolling({
      intervalMs: facts.pollMs,
      onData: (d) => {
        data = d;
        status = "live";
      },
      onError: () => {
        if (status !== "live") status = "down";
      },
    });
    return () => {
      stop();
      clearInterval(tick);
      mq.removeEventListener?.("change", onMq);
    };
  });

  function avatarSrc(f) {
    return f.avatar ? `${base}images/popup/instructors/${f.avatar}-160.webp` : null;
  }
  function personGive(f) {
    return f.give_url || giveUrl;
  }
  function firstName(name) {
    return String(name || "").trim().split(/\s+/)[0] || "";
  }
  const ext = (href) => /^https?:/i.test(href);

  async function share() {
    const url = window.location.origin + window.location.pathname;
    try {
      if (navigator.share) {
        await navigator.share({ title: copy.socialTitle, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      shareNote = copy.shareCopied;
      setTimeout(() => (shareNote = ""), 2600);
    } catch {
      /* the person closed the share sheet */
    }
  }
</script>

<!-- ============================== HERO ================================ -->
<section class="gt-hero" aria-labelledby="gt-title">
  <h1 id="gt-title" class="gt-h1">
    <span class="gt-l1">From one class</span>
    <span class="gt-l2-clip"><span class="gt-l2">to a movement.</span></span>
  </h1>
  <div class="gt-hero-side">
    <p class="gt-sub">{copy.sub}</p>
    <p class="gt-when">
      <strong>{phaseCopy.line}</strong>
      <span>{phaseCopy.note}</span>
    </p>
    <a class="gt-give" href={giveUrl} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>
      {copy.giveLabel}
    </a>
  </div>

  <div class="gt-wall">
    <figure class="gt-tile gt-one">
      <img
        src={one.src}
        srcset={one.srcset}
        sizes="(min-width: 768px) 33vw, 50vw"
        width={heroOne.w}
        height={heroOne.h}
        alt={heroOne.alt}
        fetchpriority="high"
        decoding="async"
      />
    </figure>
    {#each WALL as t, i (t.id)}
      {@const im = wallImage(t.photo, base)}
      <figure class="gt-tile gt-many" class:gt-wide-only={!t.n} style={wallVars(t, i)}>
        <img
          src={im.src}
          srcset={im.srcset}
          sizes="(min-width: 768px) 17vw, 25vw"
          width="360"
          height="270"
          alt={t.alt}
          decoding="async"
        />
      </figure>
    {/each}
  </div>
</section>

<!-- ======================== INSTRUCTOR BOARD =========================== -->
{#if showBoard}
  <section class="gt-board" aria-labelledby="gt-board-h" bind:this={boardEl} class:gt-seen={boardSeen || reduced}>
    <div class="gt-wrap">
      <h2 id="gt-board-h" class="gt-h2">{copy.board.title}</h2>
      <p class="gt-board-intro">{copy.board.intro}</p>
      <p class="gt-board-sum">{copy.board.summary(data.fundraiser_count ?? fundraisers.length, data.reached_count ?? 0)}</p>
      {#if leaders.length}
        <div class="gt-lead">
          <GivingLeaderboard {leaders} hrefFor={personGive} {base} {thresholdCents} seen={boardSeen} {reduced} />
        </div>
        <h3 class="gt-all-h">{copy.board.allTitle}</h3>
      {/if}
      <ol class="gt-list" class:gt-list-two={fundraisers.length > 6}>
        {#each fundraisers as f, i (f.slug)}
          {@const src = avatarSrc(f)}
          {@const goal = f.goal_cents || thresholdCents}
          {@const done = f.reached || f.raised_cents >= goal}
          {@const p = progress(f.raised_cents, goal)}
          {@const href = personGive(f)}
          {@const c = BOARD_MATS[i % BOARD_MATS.length]}
          <li style={`--p:${p};--i:${Math.min(i, 16)};--mat:${c}`} class:gt-done={done}>
            <a class="gt-row" {href} target={ext(href) ? "_blank" : undefined} rel={ext(href) ? "noopener" : undefined}>
              <span class="gt-avatar" aria-hidden="true">
                {#if src && !failedAvatars[f.slug]}
                  <img
                    {src}
                    alt=""
                    width="80"
                    height="80"
                    loading="lazy"
                    decoding="async"
                    onerror={() => (failedAvatars = { ...failedAvatars, [f.slug]: true })}
                  />
                {:else}
                  <span class="gt-initials">{instructorInitials(f.name)}</span>
                {/if}
              </span>
              <span class="gt-row-main">
                <span class="gt-row-name">{f.name}</span>
                {#if f.why}<span class="gt-row-why">{f.why}</span>{/if}
                <span class="gt-rowmat" aria-hidden="true">
                  <span class="gt-rowmat-body"></span>
                  <span class="gt-rowmat-track"><span class="gt-rowmat-roll"></span></span>
                </span>
                <span class="gt-row-amt">
                  {#if done}
                    {money(f.raised_cents)} · <strong>{copy.board.reached}</strong>
                  {:else}
                    {money(f.raised_cents)} of {money(goal)}
                  {/if}
                </span>
              </span>
              <span class="gt-row-give">{copy.board.give}<span class="gt-sr"> through {firstName(f.name)}</span></span>
            </a>
          </li>
        {/each}
      </ol>
    </div>
  </section>
{/if}

<!-- ============================ THE FLOOR ============================== -->
<section class="gt-floor" aria-labelledby="gt-floor-h">
  <div class="gt-wrap">
    {#if live}<p class="gt-sr" aria-live="polite">{money(totalCents)} raised of {goalLabel}</p>{/if}
    <p class="gt-day" aria-hidden={dayLine ? undefined : "true"}>{dayLine || " "}</p>

    <div class="gt-meter-head">
      {#if live && ph === "after"}
        <h2 id="gt-floor-h" class="gt-meter-lead">{copy.meter.finalLead}</h2>
        <p class="gt-number">{money(total.current)}</p>
        <p class="gt-meter-line">{copy.meter.giftsFinal(giftCount)}, {fill(over ? copy.meter.finalPassed : copy.meter.finalOf, { goal: goalLabel })}</p>
      {:else if live && totalCents > 0}
        <h2 id="gt-floor-h" class="gt-sr">Raised so far</h2>
        <p class="gt-number">{money(total.current)}</p>
        <p class="gt-meter-line">
          {fill(over ? copy.meter.passed : copy.meter.raisedOf, { goal: goalLabel })}
          <span class="gt-gifts">{copy.meter.gifts(giftCount)}</span>
        </p>
      {:else}
        <h2 id="gt-floor-h" class="gt-number gt-number-goal">
          <span class="gt-number-pre">{ph === "after" ? "Our goal was" : "Help us raise"}</span>
          {goalLabel}
        </h2>
        {#if live && ph !== "before"}
          <p class="gt-meter-line">{copy.floor.first}</p>
        {/if}
      {/if}
    </div>
  </div>

  <div class="gt-wrap gt-room" bind:this={floorEl}>
    <p class="gt-sr">{floorText}</p>
    <MatFloor
      shownCents={floorSeen ? totalCents : 0}
      {goalCents}
      matCents={copy.floor.matCents}
      ghostCents={floorSeen ? pickDollars * 100 : 0}
      {live}
      {reduced}
    />
    <p class="gt-key">{copy.floor.key}</p>
  </div>

  <!-- --------------------------- pick your mat --------------------------- -->
  <div class="gt-wrap gt-pick">
    <h2 class="gt-pick-h">{copy.picker.title}</h2>
    <fieldset class="gt-amounts">
      <legend class="gt-sr">{copy.picker.legend}</legend>
      {#each copy.picker.amounts as a}
        <label class="gt-amt" class:gt-amt-on={pick === String(a)}>
          <input type="radio" name="gt-amount" value={String(a)} bind:group={pick} />
          <span>{money(a * 100)}</span>
        </label>
      {/each}
      <label class="gt-amt" class:gt-amt-on={pick === "other"}>
        <input type="radio" name="gt-amount" value="other" bind:group={pick} />
        <span>{copy.picker.other}</span>
      </label>
    </fieldset>
    {#if pick === "other"}
      <label class="gt-other">
        <span class="gt-sr">{copy.picker.otherLabel}</span>
        <span class="gt-other-sign" aria-hidden="true">$</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="number"
          inputmode="numeric"
          min="1"
          step="1"
          placeholder="Amount"
          bind:value={otherDollars}
          autofocus
        />
      </label>
    {/if}
    <p class="gt-preview" aria-live="polite">{live ? previewLine : ""}</p>
    <a class="gt-give gt-give-big" href={pickedUrl} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>
      {pickedLabel}
    </a>
  </div>
</section>

<!-- ===================== THE STORY: A DATED TIMELINE ===================== -->
<!-- 2022 to now, then "What's next" (the ask). One line ties the chapters and
     draws down as you scroll; the year is the anchor of each chapter. 2026 is
     the biggest and the only year with photographs (all from 2026 galleries). -->
<section class="gt-story" aria-labelledby="gt-story-h">
  <div class="gt-wrap">
    <h2 id="gt-story-h" class="gt-tl-h">{copy.story.title}</h2>

    <div class="gt-tl" bind:this={tlEl} style={`--p:${tlP};${tlEnd ? `--end:${tlEnd}px` : ""}`}>
      <span class="gt-tl-line" aria-hidden="true"><span class="gt-tl-fill"></span></span>
      <ol class="gt-tl-list">
        <!-- 2022 -->
        <li class="gt-ch gt-ch-early" class:gt-lit={lit(0)}>
          <h3 class="gt-year">2022</h3>
          <div class="gt-ch-body">
            <p class="gt-big">{copy.story.startedLead}</p>
            <p class="gt-rest">{copy.story.startedRest}</p>
          </div>
        </li>

        <!-- 2023, 2024 -->
        {#each copy.story.years as y, i (y.year)}
          <li class="gt-ch gt-ch-early gt-ch-short" class:gt-lit={lit(i + 1)}>
            <h3 class="gt-year">{y.year}</h3>
            <ul class="gt-ch-body gt-facts">
              {#each y.facts as f}<li>{f}</li>{/each}
            </ul>
          </li>
        {/each}

        <!-- 2025 -->
        <li class="gt-ch gt-ch-early" class:gt-lit={lit(3)}>
          <h3 class="gt-year">2025</h3>
          <div class="gt-ch-body">
            <p class="gt-mid">{copy.story.grew}</p>
            <figure class="gt-classes" bind:this={classesEl} class:gt-seen={storySeen || reduced}>
              <figcaption>{copy.story.classesTitle}</figcaption>
              <ol aria-label={`${copy.story.classesTitle}: ${copy.story.classes.map((c) => `${c.month} ${c.n}`).join(", ")}`}>
                {#each copy.story.classes as c, i}
                  <li style={`--h:${c.n / 240};--i:${i}`}>
                    <span class="gt-col" aria-hidden="true"><span></span></span>
                    <span class="gt-col-n" aria-hidden="true">{c.n}</span>
                    <span class="gt-col-m" aria-hidden="true">{c.month}</span>
                  </li>
                {/each}
              </ol>
            </figure>
            <ul class="gt-facts gt-facts-sm">
              {#each copy.story.y2025 as f}<li>{f}</li>{/each}
            </ul>
            <figure class="gt-mo-photo gt-early-photo">
              <img
                src={story.tt2025.src}
                srcset={story.tt2025.srcset}
                sizes="(min-width: 1024px) 420px, calc(100vw - 62px)"
                width={story.tt2025.w}
                height={story.tt2025.h}
                alt={story.tt2025.alt}
                loading="lazy"
                decoding="async"
              />
              <figcaption>{copy.story.captions.tt2025}</figcaption>
            </figure>
          </div>
        </li>

        <!-- 2026: now -->
        <li class="gt-ch gt-ch-now" class:gt-lit={lit(4)}>
          <h3 class="gt-year gt-year-now">2026</h3>

          {#each [["grad", "grad"], ["sweatfest", "sweatfest"], ["gala", "gala"], ["fall", "ddlm"]] as [m, ph] (m)}
            {@const mo = copy.story.moments[m]}
            {@const p = story[ph]}
            <div class="gt-mo">
              <div class="gt-mo-text">
                <h4 class="gt-mo-when">{mo.when}</h4>
                <p class="gt-mo-line">{mo.line}</p>
              </div>
              <figure class="gt-mo-photo">
                <img
                  src={p.src}
                  srcset={p.srcset}
                  sizes="(min-width: 1024px) 680px, calc(100vw - 62px)"
                  width={p.w}
                  height={p.h}
                  alt={p.alt}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption>{copy.story.captions[ph]}</figcaption>
              </figure>
            </div>
          {/each}

          <div class="gt-mo gt-mo-moved">
            <div class="gt-mo-text">
              <h4 class="gt-mo-when">{copy.story.moments.moved.when}</h4>
              <p class="gt-mo-line">{copy.story.moments.moved.line}</p>
            </div>
            <figure class="gt-mo-photo gt-mo-photo-wide">
              <img
                src={story.ribbon.src}
                srcset={story.ribbon.srcset}
                sizes="(min-width: 1280px) 1100px, calc(100vw - 62px)"
                width={story.ribbon.w}
                height={story.ribbon.h}
                alt={story.ribbon.alt}
                loading="lazy"
                decoding="async"
              />
              <figcaption>{copy.story.captions.ribbon}</figcaption>
            </figure>
            <div class="gt-moved">
              <p class="gt-moved-lead">{copy.story.movedLead}</p>
              <ol class="gt-path">
                {#each copy.story.moved as step}
                  <li>{step}</li>
                {/each}
              </ol>
              <p class="gt-moved-rest">{copy.story.movedRest}</p>
            </div>
          </div>
        </li>

        <!-- What's next: where the line ends, and the ask -->
        <li class="gt-ch gt-ch-next" class:gt-lit={lit(5)}>
          <h3 class="gt-year gt-year-next">{copy.story.nextTitle}</h3>
          <p class="gt-next-when">{copy.story.nextWhen}</p>
          <p class="gt-mid gt-together">{copy.story.together}</p>
          <div class="gt-belief-block">
            <p class="gt-belief">{copy.belief}</p>
          </div>
          <div class="gt-support-text">
            <p class="gt-support-lead">{copy.supportLead}</p>
            <ul class="gt-supports">
              {#each copy.supports as s}
                <li>{s}</li>
              {/each}
            </ul>
          </div>
          <div class="gt-ask">
            <p class="gt-ask-h">{copy.ask}</p>
            <a class="gt-give gt-give-big" href={pickedUrl} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>
              {pickedLabel}
            </a>
          </div>
        </li>
      </ol>
    </div>
  </div>
</section>

<!-- ===================== MATCHING, SHARING, THANKS ===================== -->
<section class="gt-more" aria-labelledby="gt-match-h">
  <div class="gt-wrap gt-more-grid">
    <div>
      <h2 id="gt-match-h" class="gt-h3">{copy.match.title}</h2>
      <p>{copy.match.body}</p>
    </div>
    <div>
      <p class="gt-share-copy">{copy.share}</p>
      <button type="button" class="gt-share" onclick={share}>{copy.shareButton}</button>
      <span class="gt-share-note" role="status">{shareNote}</span>
      <p class="gt-tag">{facts.hashtag}</p>
    </div>
  </div>
  <div class="gt-wrap gt-last">
    <p class="gt-last-h">{copy.headline}<br />{copy.sub}</p>
    <a class="gt-give gt-give-sun" href={pickedUrl} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>
      {pickedLabel}
    </a>
  </div>
  <div class="gt-wrap gt-close">
    <p class="gt-thanks">{copy.thanks}</p>
    <p class="gt-charity">{copy.charity} <span class="nw">{facts.ein}</span></p>
  </div>
</section>

<style>
  /* Tokens live on .gt-page in the .astro file. */
  .gt-wrap {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 16px;
  }
  @media (min-width: 768px) {
    .gt-wrap { padding: 0 40px; }
  }
  .gt-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .nw { white-space: nowrap; }
  figure { margin: 0; }
  img { display: block; }

  /* ---- buttons ---- */
  .gt-give {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 56px;
    min-width: 168px;
    padding: 0 36px;
    border-radius: 8px;
    background: var(--gt-ink);
    color: var(--gt-paper);
    font-weight: 700;
    font-size: 1.25rem;
    text-decoration: none;
    transition: background-color 0.15s;
  }
  .gt-give:hover { background: #000; }
  .gt-give-big { min-height: 64px; font-size: 1.375rem; padding: 0 44px; }
  .gt-give-sun { background: var(--gt-sun); color: var(--gt-ink); min-height: 64px; font-size: 1.375rem; padding: 0 44px; }
  .gt-give-sun:hover { background: #ffe680; }
  .gt-give:focus-visible,
  .gt-share:focus-visible,
  .gt-row:focus-visible {
    outline: 3px solid var(--gt-ink);
    outline-offset: 3px;
  }
  .gt-more .gt-give:focus-visible,
  .gt-more .gt-share:focus-visible { outline-color: var(--gt-paper); }

  /* ================================ HERO ================================ */
  /* Phones: headline, the wall, then the sub and Give. Wide: headline left,
     sub and Give right, the wall across the full width below. */
  .gt-hero {
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
    padding: 28px 16px 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "title" "wall" "side";
  }
  .gt-h1 { grid-area: title; }
  .gt-hero-side { grid-area: side; padding-top: 24px; }
  .gt-h1 {
    margin: 0;
    font-weight: 700;
    font-size: clamp(2.5rem, 11.6vw, 7.5rem);
    line-height: 0.95;
    letter-spacing: -0.035em;
  }
  .gt-l1, .gt-l2-clip { display: block; }
  /* The second half arrives once the wall has grown: it slides up out of its own line. */
  .gt-l2-clip { overflow: hidden; padding-bottom: 0.08em; margin-bottom: -0.08em; }
  .gt-l2 {
    display: block;
    animation: gt-line 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 1.55s both;
  }
  @keyframes gt-line {
    from { transform: translateY(105%); }
    to { transform: none; }
  }
  .gt-sub {
    margin: 0;
    font-size: clamp(1.375rem, 4.4vw, 2rem);
    line-height: 1.2;
    letter-spacing: -0.01em;
  }
  .gt-when {
    margin: 12px 0 20px;
    font-size: 1.0625rem;
    line-height: 1.45;
    max-width: 40ch;
  }
  .gt-when strong { display: block; font-weight: 700; }
  @media (min-width: 768px) {
    .gt-hero { padding: 40px 40px 0; }
  }
  @media (min-width: 1100px) {
    .gt-hero {
      grid-template-columns: minmax(0, 1fr) 340px;
      grid-template-areas: "title side" "wall wall";
      column-gap: 48px;
      align-items: end;
    }
    .gt-hero-side { padding: 0 0 6px; }
  }

  /* The wall: one class photo, and everything that grew out of it. */
  .gt-wall {
    --gap: 4px;
    grid-area: wall;
    margin: 24px -16px 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: auto;
    gap: var(--gap);
  }
  @media (min-width: 768px) {
    .gt-wall {
      --gap: 6px;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      margin: 36px 0 0;
    }
  }
  .gt-tile { aspect-ratio: 4 / 3; overflow: hidden; background: var(--gt-sand); }
  .gt-tile img { width: 100%; height: 100%; object-fit: cover; }
  .gt-one {
    grid-column: 2 / span 2;
    grid-row: 2 / span 2;
    aspect-ratio: auto;
    position: relative;
    z-index: 2;
  }
  .gt-one img { position: absolute; inset: 0; }
  .gt-many {
    grid-column: var(--cn);
    grid-row: var(--rn);
    animation: gt-grow-n 0.95s cubic-bezier(0.2, 0.75, 0.25, 1) var(--dln) both;
  }
  .gt-wide-only { display: none; }
  @keyframes gt-grow-n {
    from { opacity: 0; transform: translate(calc(var(--dxn) * 100%), calc(var(--dyn) * 100%)) scale(0.4); }
    35% { opacity: 1; }
    to { opacity: 1; transform: none; }
  }
  @keyframes gt-grow-w {
    from { opacity: 0; transform: translate(calc(var(--dxw) * 100%), calc(var(--dyw) * 100%)) scale(0.4); }
    35% { opacity: 1; }
    to { opacity: 1; transform: none; }
  }
  @media (min-width: 768px) {
    .gt-one { grid-column: 3 / span 2; grid-row: 1 / span 2; }
    .gt-many {
      grid-column: var(--cw);
      grid-row: var(--rw);
      animation-name: gt-grow-w;
      animation-delay: var(--dlw);
    }
    .gt-wide-only { display: block; }
  }

  /* =============================== FLOOR ================================ */
  .gt-floor { padding: 48px 0 56px; }
  @media (min-width: 768px) { .gt-floor { padding: 88px 0 88px; } }
  .gt-day { margin: 0 0 10px; font-size: 1.0625rem; font-weight: 700; }
  .gt-number {
    margin: 0;
    font-weight: 700;
    font-size: clamp(4.25rem, 21vw, 11rem);
    line-height: 0.92;
    letter-spacing: -0.04em;
    font-variant-numeric: tabular-nums;
  }
  .gt-number-goal { font-size: clamp(3.25rem, 16vw, 9rem); }
  .gt-number-pre {
    display: block;
    font-size: clamp(1.375rem, 5vw, 2.25rem);
    letter-spacing: -0.01em;
    line-height: 1.2;
    margin-bottom: 6px;
  }
  .gt-meter-lead {
    margin: 0 0 6px;
    font-weight: 400;
    font-size: clamp(1.375rem, 5vw, 2.25rem);
    line-height: 1.2;
  }
  .gt-meter-line {
    margin: 14px 0 0;
    font-size: clamp(1.25rem, 4.6vw, 2rem);
    line-height: 1.25;
  }
  .gt-gifts { display: block; margin-top: 6px; font-size: 1.0625rem; }
  @media (min-width: 900px) {
    .gt-gifts { display: inline; margin: 0 0 0 18px; font-size: inherit; }
    .gt-gifts::before { content: "· "; }
  }
  .gt-room { margin-top: 28px; }
  @media (min-width: 768px) { .gt-room { margin-top: 44px; } }
  .gt-key { margin: 14px 0 0; font-size: 1.0625rem; font-weight: 700; }

  /* ---- pick your mat ---- */
  .gt-pick { margin-top: 40px; }
  @media (min-width: 768px) { .gt-pick { margin-top: 56px; } }
  .gt-pick-h {
    margin: 0 0 18px;
    font-weight: 700;
    font-size: clamp(2rem, 7.4vw, 3.5rem);
    line-height: 1.05;
    letter-spacing: -0.025em;
  }
  .gt-amounts {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    max-width: 720px;
  }
  @media (min-width: 700px) { .gt-amounts { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
  .gt-amt { position: relative; display: block; cursor: pointer; }
  .gt-amt input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
  .gt-amt span {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 56px;
    border-radius: 8px;
    background: var(--gt-mist);
    font-weight: 700;
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
    transition: background-color 0.15s, color 0.15s;
  }
  .gt-amt:hover span { background: #e0dfdb; }
  .gt-amt-on span,
  .gt-amt-on:hover span { background: var(--gt-sun); }
  .gt-amt input:focus-visible + span { outline: 3px solid var(--gt-ink); outline-offset: 3px; }
  .gt-other {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    max-width: 280px;
    min-height: 56px;
    padding: 0 16px;
    border-radius: 8px;
    background: var(--gt-mist);
    font-size: 1.375rem;
    font-weight: 700;
  }
  .gt-other:focus-within { outline: 3px solid var(--gt-ink); outline-offset: 3px; }
  .gt-other input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    font: inherit;
    color: inherit;
    padding: 12px 0;
    outline: none;
  }
  .gt-preview { margin: 18px 0 22px; min-height: 1.4em; font-size: clamp(1.125rem, 4vw, 1.5rem); line-height: 1.3; }

  /* ============================== TIMELINE ============================== */
  /* The year anchors each chapter; one line on the left ties them together
     and draws as you scroll (--p), ending at "What's next". Phones: line at
     6 px inside the gutter, chapters indented 30 px. 768 px+: indented 72 px. */
  .gt-story { padding: 40px 0 96px; }
  @media (min-width: 768px) { .gt-story { padding: 72px 0 128px; } }
  .gt-tl-h {
    margin: 0 0 48px;
    font-weight: 700;
    font-size: clamp(2.25rem, 9vw, 4.5rem);
    line-height: 1;
    letter-spacing: -0.03em;
  }
  @media (min-width: 768px) { .gt-tl-h { margin-bottom: 80px; } }
  .gt-tl { position: relative; }
  .gt-tl-line {
    position: absolute;
    left: 5px;
    top: 6px;
    width: 2px;
    height: var(--end, calc(100% - 6px));
    background: var(--gt-track);
  }
  .gt-tl-fill {
    position: absolute;
    inset: 0;
    background: var(--gt-ink);
    transform-origin: 50% 0;
    transform: scaleY(var(--p, 1));
  }
  .gt-tl-list { list-style: none; margin: 0; padding: 0; }
  .gt-ch { position: relative; padding: 0 0 80px 30px; }
  @media (min-width: 768px) { .gt-ch { padding: 0 0 128px 72px; } }
  /* The chapter's dot on the line: open until the line reaches it. */
  .gt-ch::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-sizing: border-box;
    border: 2px solid var(--gt-ink);
    background: var(--gt-paper);
    transition: background-color 0.2s;
  }
  .gt-ch.gt-lit::before { background: var(--gt-ink); }
  .gt-ch-next::before { left: -4px; width: 20px; height: 20px; top: -4px; }
  .gt-ch-next.gt-lit::before { background: var(--gt-sun); border-width: 3px; }

  .gt-year {
    margin: -0.06em 0 0;
    font-weight: 700;
    font-size: clamp(3.75rem, 17vw, 8.5rem);
    line-height: 0.82;
    letter-spacing: -0.045em;
    font-variant-numeric: tabular-nums;
  }
  .gt-year-now { font-size: clamp(6rem, 31vw, 17rem); letter-spacing: -0.05em; }
  .gt-year-next { font-size: clamp(3rem, 12.5vw, 8.5rem); }
  .gt-ch-body { margin-top: 24px; }
  @media (min-width: 1024px) {
    .gt-ch-early { display: grid; grid-template-columns: 4fr 8fr; gap: 48px; align-items: start; }
    .gt-ch-early .gt-ch-body { margin-top: 0; }
  }
  .gt-ch-short { padding-bottom: 64px; }
  @media (min-width: 768px) { .gt-ch-short { padding-bottom: 96px; } }

  .gt-big {
    margin: 0;
    font-weight: 700;
    font-size: clamp(2rem, 8vw, 4.25rem);
    line-height: 1;
    letter-spacing: -0.03em;
    max-width: 16ch;
    text-wrap: balance;
  }
  .gt-rest, .gt-moved-rest {
    margin: 20px 0 0;
    font-size: clamp(1.1875rem, 4.2vw, 1.625rem);
    line-height: 1.35;
    max-width: 36ch;
  }
  .gt-mid {
    margin: 0;
    font-weight: 700;
    font-size: clamp(1.625rem, 6.4vw, 3rem);
    line-height: 1.08;
    letter-spacing: -0.025em;
    max-width: 22ch;
    text-wrap: balance;
  }
  .gt-facts { list-style: none; padding: 0; }
  .gt-facts li {
    font-weight: 700;
    font-size: clamp(1.5rem, 5.8vw, 2.5rem);
    line-height: 1.12;
    letter-spacing: -0.02em;
  }
  .gt-facts li + li { margin-top: 0.3em; }
  .gt-facts-sm { margin: 36px 0 0; }
  .gt-facts-sm li { font-weight: 400; font-size: clamp(1.1875rem, 4.4vw, 1.625rem); line-height: 1.35; letter-spacing: 0; max-width: 34ch; }

  /* 2025 classes a month: each column grows to its number. */
  .gt-classes { margin-top: 36px; }
  .gt-classes figcaption { font-size: 1.0625rem; font-weight: 700; margin-bottom: 14px; }
  .gt-classes ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    height: 200px;
    align-items: end;
    max-width: 420px;
  }
  .gt-classes li { display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
  .gt-col { position: relative; display: block; flex: 1; }
  .gt-col span {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: calc(var(--h) * 100%);
    background: var(--gt-ink);
    border-radius: 3px 3px 0 0;
    transform-origin: 50% 100%;
    transform: scaleY(0);
    transition: transform 1.1s cubic-bezier(0.2, 0.75, 0.25, 1) calc(var(--i) * 220ms);
  }
  .gt-classes li:last-child .gt-col span { background: var(--gt-clay); }
  .gt-seen .gt-col span { transform: none; }
  .gt-col-n { font-weight: 700; font-size: 1.5rem; margin-top: 8px; font-variant-numeric: tabular-nums; }
  .gt-col-m { font-size: 1rem; }

  /* 2026: month by month, each with a photograph. */
  .gt-ch-now { padding-bottom: 96px; }
  @media (min-width: 768px) { .gt-ch-now { padding-bottom: 144px; } }
  .gt-mo { margin-top: 48px; }
  .gt-mo:first-of-type { margin-top: 36px; }
  @media (min-width: 768px) { .gt-mo { margin-top: 88px; } .gt-mo:first-of-type { margin-top: 56px; } }
  @media (min-width: 1024px) {
    .gt-mo { display: grid; grid-template-columns: 4fr 8fr; gap: 48px; align-items: start; }
    .gt-mo-moved { grid-template-columns: 4fr 8fr; }
    .gt-mo-moved .gt-moved { grid-column: 1 / -1; }
  }
  .gt-mo-when {
    margin: 0;
    font-weight: 700;
    font-size: clamp(1.75rem, 7vw, 3rem);
    line-height: 1;
    letter-spacing: -0.03em;
  }
  .gt-mo-line {
    margin: 10px 0 0;
    font-size: clamp(1.1875rem, 4.2vw, 1.5rem);
    line-height: 1.35;
    max-width: 30ch;
  }
  .gt-mo-photo { margin-top: 18px; }
  @media (min-width: 1024px) { .gt-mo-photo { margin-top: 0; } }
  .gt-mo-photo img { width: 100%; height: auto; aspect-ratio: 3 / 2; object-fit: cover; }
  .gt-mo-photo-wide img { aspect-ratio: 16 / 9; }
  /* The one earlier-year photo: smaller than any 2026 photo. */
  .gt-early-photo { margin-top: 32px; max-width: 420px; }
  .gt-early-photo img { aspect-ratio: 3 / 2; object-position: 50% 85%; }
  .gt-mo-photo figcaption { margin-top: 8px; font-size: 0.9375rem; color: var(--gt-soft); }

  .gt-moved { margin-top: 40px; }
  @media (min-width: 768px) { .gt-moved { margin-top: 64px; } }
  .gt-moved-lead { margin: 0 0 8px; font-size: clamp(1.25rem, 4.6vw, 2rem); }
  .gt-path { list-style: none; margin: 0; padding: 0; }
  .gt-path li {
    font-weight: 700;
    font-size: clamp(2rem, 8.4vw, 5.5rem);
    line-height: 1;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }
  .gt-path li + li { margin-top: 0.18em; }
  .gt-path li:nth-child(1) { opacity: 0.4; }
  .gt-path li:nth-child(2) { opacity: 0.65; }

  /* What's next: the line ends here, at the ask. */
  .gt-ch-next { padding-bottom: 0; }
  .gt-next-when { margin: 14px 0 0; font-size: clamp(1.1875rem, 4.4vw, 1.625rem); font-weight: 700; }
  .gt-together { margin-top: 40px; font-weight: 400; max-width: 26ch; }
  @media (min-width: 768px) { .gt-together { margin-top: 64px; } }
  .gt-belief-block { margin: 40px 0 0; padding: 36px 20px; background: var(--gt-sun); }
  @media (min-width: 768px) { .gt-belief-block { margin-top: 64px; padding: 64px 56px; } }
  .gt-belief {
    margin: 0;
    font-weight: 700;
    font-size: clamp(2rem, 8vw, 5rem);
    line-height: 1.02;
    letter-spacing: -0.03em;
    max-width: 18ch;
    text-wrap: balance;
  }
  .gt-support-text { margin-top: 48px; }
  @media (min-width: 768px) { .gt-support-text { margin-top: 72px; } }
  .gt-support-lead { margin: 0 0 14px; font-size: clamp(1.25rem, 4.6vw, 2rem); }
  .gt-supports { list-style: none; margin: 0; padding: 0; }
  .gt-supports li {
    font-weight: 700;
    font-size: clamp(1.375rem, 5.2vw, 2.375rem);
    line-height: 1.12;
    letter-spacing: -0.02em;
    padding: 0.3em 0;
  }
  .gt-ask { margin-top: 40px; display: flex; flex-wrap: wrap; align-items: center; gap: 20px 32px; }
  @media (min-width: 768px) { .gt-ask { margin-top: 64px; } }
  .gt-ask-h {
    margin: 0;
    font-weight: 700;
    font-size: clamp(1.875rem, 7vw, 3.5rem);
    line-height: 1.08;
    letter-spacing: -0.025em;
  }

  /* =============================== BOARD ================================ */
  .gt-board { padding: 72px 0 80px; background: var(--gt-sand); }
  @media (min-width: 768px) { .gt-board { padding: 104px 0 112px; } }
  .gt-h2 {
    margin: 0;
    font-weight: 700;
    font-size: clamp(2rem, 7.4vw, 3.5rem);
    line-height: 1.05;
    letter-spacing: -0.025em;
  }
  /* The homepage band and /links card link here (#gt-board-h): clear the
     fixed header and the countdown band. */
  #gt-board-h { scroll-margin-top: 120px; }
  .gt-board-intro { margin: 16px 0 0; max-width: 56ch; font-size: 1.125rem; line-height: 1.55; }
  .gt-board-sum { margin: 10px 0 0; font-size: 1.0625rem; color: var(--gt-soft); }
  .gt-list { list-style: none; margin: 36px 0 0; padding: 0; max-width: 760px; }
  /* The top five race (GivingLeaderboard.svelte), then a plain heading over
     the full list so the two read as two things. */
  .gt-lead { margin-top: 44px; }
  @media (min-width: 768px) { .gt-lead { margin-top: 64px; } }
  .gt-all-h {
    margin: 64px 0 0;
    font-weight: 700;
    font-size: clamp(1.375rem, 5vw, 2rem);
    line-height: 1.15;
    letter-spacing: -0.015em;
  }
  @media (min-width: 768px) { .gt-all-h { margin-top: 88px; } }
  .gt-all-h + .gt-list { margin-top: 12px; }
  @media (min-width: 1024px) {
    .gt-list-two { columns: 2; column-gap: 72px; max-width: none; }
    .gt-list-two li { break-inside: avoid; }
  }
  .gt-row {
    display: grid;
    grid-template-columns: 64px 1fr auto;
    align-items: center;
    column-gap: 16px;
    padding: 14px 0;
    min-height: 88px;
    color: inherit;
    text-decoration: none;
  }
  @media (min-width: 768px) {
    .gt-row { grid-template-columns: 80px 1fr auto; column-gap: 20px; padding: 16px 0; }
  }
  .gt-avatar {
    position: relative;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--gt-mist);
    display: grid;
    place-items: center;
  }
  @media (min-width: 768px) { .gt-avatar { width: 80px; height: 80px; } }
  .gt-avatar img,
  .gt-initials { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .gt-initials { display: grid; place-items: center; font-weight: 700; font-size: 1.25rem; }
  /* Reaching $150: a yellow ring closes around the face once the mat is fully out. */
  .gt-avatar::after {
    content: "";
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    border: 5px solid var(--gt-sun);
    opacity: 0;
    transform: scale(0.8);
  }
  .gt-seen .gt-done .gt-avatar::after {
    opacity: 1;
    transform: none;
    transition: opacity 0.3s, transform 0.5s cubic-bezier(0.3, 1.5, 0.5, 1);
    transition-delay: calc(var(--i) * 90ms + 1.05s);
  }
  .gt-row-main { display: flex; flex-direction: column; min-width: 0; }
  .gt-row-name { font-weight: 700; font-size: 1.1875rem; line-height: 1.25; overflow-wrap: anywhere; }
  .gt-row-why { margin-top: 2px; font-size: 0.9375rem; line-height: 1.35; color: var(--gt-soft); }

  /* The instructor's own mat, unrolling toward $150. */
  .gt-rowmat {
    position: relative;
    display: block;
    margin-top: 10px;
    height: 14px;
    max-width: 300px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1.5px rgba(30, 30, 30, 0.3);
  }
  .gt-rowmat-body {
    position: absolute;
    inset: 0;
    border-radius: 3px;
    background: var(--mat);
    transform-origin: 0 50%;
    transform: scaleX(0);
  }
  .gt-rowmat-track { position: absolute; inset: -2px 0; transform: translateX(0); }
  .gt-rowmat-roll {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -4px;
    width: 8px;
    border-radius: 4px;
    background: var(--mat);
    filter: brightness(0.72);
    opacity: 0;
  }
  .gt-seen .gt-rowmat-body {
    transform: scaleX(var(--p));
    transition: transform 1s cubic-bezier(0.3, 0.7, 0.3, 1) calc(var(--i) * 90ms);
  }
  .gt-seen .gt-rowmat-track {
    transform: translateX(calc(var(--p) * 100%));
    transition: transform 1s cubic-bezier(0.3, 0.7, 0.3, 1) calc(var(--i) * 90ms);
  }
  .gt-seen li:not(.gt-done) .gt-rowmat-roll { opacity: 1; transition: opacity 0.2s calc(var(--i) * 90ms); }
  .gt-row-amt { margin-top: 6px; font-size: 0.9375rem; font-variant-numeric: tabular-nums; }
  .gt-row-amt strong { font-weight: 700; }
  .gt-row-give {
    font-weight: 700;
    font-size: 1rem;
    padding: 12px 0 12px 8px;
    text-decoration: underline;
    text-underline-offset: 4px;
    text-decoration-thickness: 2px;
  }
  .gt-row:hover .gt-row-name { text-decoration: underline; text-underline-offset: 4px; }

  /* =============================== CLOSE ================================ */
  .gt-more { background: var(--gt-ink); color: var(--gt-paper); padding: 64px 0 56px; }
  @media (min-width: 768px) { .gt-more { padding: 96px 0 72px; } }
  .gt-more-grid { display: grid; gap: 40px; }
  @media (min-width: 900px) { .gt-more-grid { grid-template-columns: 1fr 1fr; gap: 72px; } }
  .gt-more p { margin: 0 0 1em; font-size: 1.0625rem; line-height: 1.6; max-width: 52ch; }
  .gt-h3 { margin: 0 0 14px; font-weight: 700; font-size: clamp(1.5rem, 5vw, 2rem); line-height: 1.15; letter-spacing: -0.015em; }
  .gt-share-copy { font-weight: 700; font-size: 1.25rem !important; line-height: 1.4 !important; }
  .gt-share {
    min-height: 52px;
    padding: 0 28px;
    border-radius: 8px;
    border: 2px solid var(--gt-paper);
    background: transparent;
    color: var(--gt-paper);
    font: inherit;
    font-weight: 700;
    font-size: 1.0625rem;
    cursor: pointer;
  }
  .gt-share-note { display: inline-block; margin-left: 14px; font-size: 1rem; }
  .gt-tag { margin-top: 20px !important; font-weight: 700; }
  .gt-last { margin-top: 72px; display: grid; gap: 28px; justify-items: start; }
  @media (min-width: 768px) { .gt-last { margin-top: 104px; } }
  .gt-last-h {
    margin: 0 !important;
    max-width: none !important;
    font-weight: 700;
    font-size: clamp(2.25rem, 9vw, 5.5rem) !important;
    line-height: 1 !important;
    letter-spacing: -0.035em;
  }
  .gt-close { margin-top: 72px; }
  .gt-thanks { font-weight: 700; font-size: clamp(1.25rem, 4.2vw, 1.625rem) !important; line-height: 1.35 !important; max-width: 40ch !important; }
  .gt-charity { font-size: 0.9375rem !important; opacity: 0.8; }

  /* ========================== REDUCED MOTION ============================ */
  @media (prefers-reduced-motion: reduce) {
    .gt-give, .gt-amt span { transition: none; }
    .gt-l2, .gt-many { animation: none; }
    .gt-col span,
    .gt-ch::before,
    .gt-rowmat-body,
    .gt-rowmat-track,
    .gt-rowmat-roll,
    .gt-avatar::after { transition: none !important; }
  }
</style>
