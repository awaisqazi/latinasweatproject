<script>
  // /givingtuesday body. Server-rendered with the static fallback (goal and
  // Give button, no live number), then hydrated: computes the phase from
  // Chicago time, polls giving_public every 25 s while the tab is visible,
  // animates the total, and shows the instructor board when it is open and
  // non-empty. Copy and facts: src/data/givingTuesday.js. Identity: design.md
  // "Giving Tuesday".
  import { onMount } from "svelte";
  import { Tween } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import {
    givingCopy as copy,
    givingFacts as facts,
    givingRoutes as routes,
    phase as phaseAt,
    money,
    progress,
    fill,
  } from "../../data/givingTuesday.js";
  import { instructorInitials } from "../../data/popUpShared.js";
  import { startPolling, nowOverride } from "../../lib/givingTuesday/live.js";

  let { base = "/" } = $props();

  // "idle" until the first answer, then "live" or "down" (no number invented).
  let status = $state("idle");
  let data = $state(null);
  // SSR renders the "early" phase (most of the campaign); the browser corrects it.
  let now = $state(Date.parse(facts.startsAt));
  let reduced = $state(false);
  let failedAvatars = $state({});
  let shareNote = $state("");

  const total = new Tween(0, { duration: 1100, easing: cubicOut });
  const fillTween = new Tween(0, { duration: 1100, easing: cubicOut });

  const campaign = $derived(data?.campaign ?? null);
  const goalCents = $derived(campaign?.goal_cents ?? facts.goalCents);
  const thresholdCents = $derived(campaign?.threshold_cents ?? facts.thresholdCents);
  const giveUrl = $derived(campaign?.give_url || `${base}${routes.fallbackGive.replace(/^\//, "")}`);
  const ph = $derived(
    phaseAt(now, campaign?.starts_at ?? facts.startsAt, campaign?.ends_at ?? facts.endsAt, facts.givingDay),
  );
  const phaseCopy = $derived(copy.phases[ph]);
  const totalCents = $derived(data?.total_cents ?? 0);
  const giftCount = $derived(data?.gift_count ?? 0);
  const over = $derived(totalCents >= goalCents);
  const goalLabel = $derived(money(goalCents));
  const fundraisers = $derived(
    [...(data?.fundraisers ?? [])].sort(
      (a, b) => (b.raised_cents || 0) - (a.raised_cents || 0) || String(a.name).localeCompare(String(b.name)),
    ),
  );
  const showBoard = $derived(status === "live" && campaign?.board_open === true && fundraisers.length > 0);
  const external = $derived(/^https?:/i.test(giveUrl));

  $effect(() => {
    const opts = reduced ? { duration: 0 } : undefined;
    total.set(totalCents, opts);
    fillTween.set(progress(totalCents, goalCents), opts);
  });

  onMount(() => {
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
  <div class="gt-wrap">
    <h1 id="gt-title" class="gt-h1">{copy.headline}</h1>
    <p class="gt-sub">{copy.sub}</p>
    <p class="gt-when">
      <strong>{phaseCopy.line}</strong>
      <span>{phaseCopy.note}</span>
    </p>
    <a class="gt-give" href={giveUrl} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>
      {copy.giveLabel}
    </a>
  </div>
</section>

<figure class="gt-photo gt-photo-class">
  <img
    src={`${base}images/givingtuesday/class-1400.webp`}
    srcset={`${base}images/givingtuesday/class-800.webp 800w, ${base}images/givingtuesday/class-1400.webp 1400w, ${base}images/givingtuesday/class-2200.webp 2200w`}
    sizes="100vw"
    width="2200"
    height="1650"
    alt="A full LSP class resting on their mats, with an instructor leading from the front of the room."
    fetchpriority="high"
    decoding="async"
  />
</figure>

<!-- ============================ THE METER ============================== -->
<section class="gt-meter" aria-labelledby="gt-meter-h">
  <div class="gt-wrap gt-meter-grid">
    {#if status === "live"}<p class="gt-sr" aria-live="polite">{money(totalCents)} raised of {goalLabel}</p>{/if}
    {#if status === "live" && ph === "after"}
      <h2 id="gt-meter-h" class="gt-meter-lead">{copy.meter.finalLead}</h2>
      <p class="gt-number">{money(total.current)}</p>
      <p class="gt-meter-line">{copy.meter.giftsFinal(giftCount)}, {fill(over ? copy.meter.finalPassed : copy.meter.finalOf, { goal: goalLabel })}</p>
      <div class="gt-bar" aria-hidden="true"><span style={`transform:scaleX(${fillTween.current})`}></span></div>
    {:else if status === "live" && totalCents > 0}
      <h2 id="gt-meter-h" class="gt-sr">Raised so far</h2>
      <p class="gt-number">{money(total.current)}</p>
      <p class="gt-meter-line">{fill(over ? copy.meter.passed : copy.meter.raisedOf, { goal: goalLabel })}</p>
      <div
        class="gt-bar"
        role="progressbar"
        aria-label="Progress toward the goal"
        aria-valuemin="0"
        aria-valuemax={goalCents / 100}
        aria-valuenow={Math.min(totalCents, goalCents) / 100}
      ><span style={`transform:scaleX(${fillTween.current})`}></span></div>
      <p class="gt-meter-foot">{copy.meter.gifts(giftCount)}</p>
    {:else}
      <h2 id="gt-meter-h" class="gt-number gt-number-goal">
        <span class="gt-number-pre">{ph === "after" ? "Our goal was" : "Help us raise"}</span>
        {goalLabel}
      </h2>
      {#if status === "live" && ph !== "before"}
        <div class="gt-bar" aria-hidden="true"><span style="transform:scaleX(0)"></span></div>
        <p class="gt-meter-foot gt-meter-ends"><span>$0 raised so far</span><span>{goalLabel}</span></p>
        <p class="gt-meter-line">{copy.meter.firstGift}</p>
      {/if}
    {/if}
    <a class="gt-give gt-give-meter" href={giveUrl} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>
      {copy.giveLabel}
    </a>
  </div>
</section>

<!-- ============================ THE APPEAL ============================= -->
<section class="gt-appeal" aria-labelledby="gt-appeal-h">
  <div class="gt-wrap gt-appeal-grid">
    <h2 id="gt-appeal-h" class="gt-belief">{copy.belief}</h2>
    <div class="gt-prose">
      {#each copy.appeal as p}
        <p>{p}</p>
      {/each}
      <p class="gt-support-lead">{copy.supportLead}</p>
      <ul class="gt-supports">
        {#each copy.supports as s}
          <li>{s}</li>
        {/each}
      </ul>
    </div>
  </div>
  <figure class="gt-wrap gt-photo gt-photo-group">
    <img
      src={`${base}images/ribbon-cutting/DSC09794-1600.webp`}
      srcset={`${base}images/ribbon-cutting/DSC09794-640.webp 640w, ${base}images/ribbon-cutting/DSC09794-1080.webp 1080w, ${base}images/ribbon-cutting/DSC09794-1600.webp 1600w`}
      sizes="(min-width: 1280px) 1200px, 100vw"
      width="1600"
      height="900"
      alt="The LSP community together at Mural Park, gathered behind lit LSP letters."
      loading="lazy"
      decoding="async"
    />
  </figure>
  <div class="gt-wrap gt-ask">
    <p class="gt-ask-h">{copy.ask}</p>
    <a class="gt-give" href={giveUrl} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>
      {copy.giveLabel}
    </a>
  </div>
</section>

<!-- ======================== INSTRUCTOR BOARD =========================== -->
{#if showBoard}
  <section class="gt-board" aria-labelledby="gt-board-h">
    <div class="gt-wrap">
      <h2 id="gt-board-h" class="gt-h2">{copy.board.title}</h2>
      <p class="gt-board-intro">{copy.board.intro}</p>
      <p class="gt-board-sum">{copy.board.summary(data.fundraiser_count ?? fundraisers.length, data.reached_count ?? 0)}</p>
      <ol class="gt-list" class:gt-list-two={fundraisers.length > 6}>
        {#each fundraisers as f (f.slug)}
          {@const src = avatarSrc(f)}
          {@const goal = f.goal_cents || thresholdCents}
          {@const done = f.reached || f.raised_cents >= goal}
          {@const href = personGive(f)}
          <li>
            <a class="gt-row" {href} target={/^https?:/i.test(href) ? "_blank" : undefined} rel={/^https?:/i.test(href) ? "noopener" : undefined}>
              <span class="gt-avatar" aria-hidden="true">
                {#if src && !failedAvatars[f.slug]}
                  <img
                    {src}
                    alt=""
                    width="64"
                    height="64"
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
                <span class="gt-row-bar" aria-hidden="true"><span style={`width:${progress(f.raised_cents, goal) * 100}%`}></span></span>
                <span class="gt-row-amt">
                  {#if done}
                    {money(f.raised_cents)} · {copy.board.reached}
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
  .gt-give:focus-visible,
  .gt-share:focus-visible,
  .gt-row:focus-visible {
    outline: 3px solid var(--gt-ink);
    outline-offset: 3px;
  }

  /* ---- hero ---- */
  .gt-hero { padding: 40px 0 32px; }
  .gt-h1 {
    font-weight: 700;
    font-size: clamp(2.75rem, 11vw, 7rem);
    line-height: 0.98;
    letter-spacing: -0.03em;
    max-width: 11ch;
    margin: 0;
    text-wrap: balance;
  }
  .gt-sub {
    margin: 16px 0 0;
    font-size: clamp(1.375rem, 4.4vw, 2.25rem);
    line-height: 1.2;
    letter-spacing: -0.01em;
  }
  .gt-when {
    margin: 28px 0 24px;
    font-size: 1.0625rem;
    line-height: 1.45;
    max-width: 40ch;
  }
  .gt-when strong { display: block; font-weight: 700; }
  @media (min-width: 768px) {
    .gt-hero { padding: 72px 0 48px; }
  }
  @media (min-width: 1100px) {
    .gt-h1 { max-width: none; }
  }

  /* ---- photos ---- */
  .gt-photo { margin: 0; }
  .gt-photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .gt-photo-class { aspect-ratio: 4 / 3; overflow: hidden; }
  @media (min-width: 768px) {
    .gt-photo-class { aspect-ratio: 16 / 8; }
    .gt-photo-class img { object-position: 50% 62%; }
  }
  @media (min-width: 1280px) {
    .gt-photo-class { aspect-ratio: 16 / 7; }
  }
  .gt-photo-group { margin: 56px auto 0; }
  .gt-photo-group img { aspect-ratio: 16 / 9; border-radius: 4px; }
  @media (max-width: 767px) {
    .gt-photo-group { padding: 0; }
    .gt-photo-group img { border-radius: 0; aspect-ratio: 4 / 3; object-position: 50% 45%; }
  }

  /* ---- meter: the one designed element ---- */
  .gt-meter {
    background: var(--gt-sun);
    color: var(--gt-ink);
    padding: 44px 0 48px;
  }
  @media (min-width: 768px) { .gt-meter { padding: 72px 0 76px; } }
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
  .gt-bar {
    margin-top: 28px;
    height: 18px;
    border-radius: 3px;
    background: var(--gt-track);
    overflow: hidden;
  }
  @media (min-width: 768px) { .gt-bar { height: 24px; } }
  .gt-bar span {
    display: block;
    height: 100%;
    background: var(--gt-ink);
    transform-origin: 0 50%;
  }
  .gt-meter-foot {
    margin: 12px 0 0;
    font-size: 1.0625rem;
  }
  .gt-meter-ends { display: flex; justify-content: space-between; gap: 16px; }
  .gt-give-meter { margin-top: 32px; justify-self: start; }
  .gt-meter-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "sr" "lead" "num" "line" "bar" "foot" "give";
  }
  .gt-meter-grid > .gt-sr { grid-area: sr; }
  .gt-meter-lead { grid-area: lead; }
  .gt-number { grid-area: num; }
  .gt-meter-line { grid-area: line; }
  .gt-bar { grid-area: bar; }
  .gt-meter-foot { grid-area: foot; }
  .gt-give-meter { grid-area: give; }
  @media (min-width: 900px) {
    .gt-meter-grid {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: "sr sr" "lead lead" "num give" "line give" "bar bar" "foot foot";
      column-gap: 48px;
    }
    .gt-give-meter { margin-top: 0; align-self: end; justify-self: end; }
  }

  /* ---- appeal ---- */
  .gt-appeal { padding: 64px 0 72px; }
  @media (min-width: 768px) { .gt-appeal { padding: 104px 0 104px; } }
  .gt-appeal-grid { display: grid; gap: 28px; }
  @media (min-width: 1024px) {
    .gt-appeal-grid { grid-template-columns: 5fr 7fr; gap: 72px; align-items: start; }
  }
  .gt-belief {
    margin: 0;
    font-weight: 700;
    font-size: clamp(1.75rem, 6vw, 2.375rem);
    line-height: 1.12;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }
  .gt-prose { max-width: 62ch; font-size: 1.125rem; line-height: 1.6; }
  @media (min-width: 768px) { .gt-prose { font-size: 1.1875rem; } }
  .gt-prose p { margin: 0 0 1.1em; }
  .gt-support-lead { font-weight: 700; margin-bottom: 0.5em !important; }
  .gt-supports { list-style: disc; margin: 0; padding: 0 0 0 1.15em; }
  .gt-supports li { margin: 0 0 0.45em; padding-left: 0.2em; }
  .gt-supports li::marker { color: var(--gt-ink); }
  .gt-ask { margin-top: 48px; display: flex; flex-wrap: wrap; align-items: center; gap: 20px 32px; }
  .gt-ask-h {
    margin: 0;
    font-weight: 700;
    font-size: clamp(1.75rem, 6vw, 2.75rem);
    line-height: 1.12;
    letter-spacing: -0.02em;
  }

  /* ---- board ---- */
  .gt-board { padding: 8px 0 72px; }
  @media (min-width: 768px) { .gt-board { padding: 16px 0 104px; } }
  .gt-h2 {
    margin: 0;
    font-weight: 700;
    font-size: clamp(2rem, 7.4vw, 3.5rem);
    line-height: 1.05;
    letter-spacing: -0.025em;
  }
  .gt-board-intro { margin: 16px 0 0; max-width: 56ch; font-size: 1.125rem; line-height: 1.55; }
  .gt-board-sum { margin: 10px 0 0; font-size: 1.0625rem; color: var(--gt-soft); }
  .gt-list { list-style: none; margin: 36px 0 0; padding: 0; max-width: 720px; }
  @media (min-width: 1024px) {
    .gt-list-two { columns: 2; column-gap: 72px; max-width: none; }
    .gt-list-two li { break-inside: avoid; }
  }
  .gt-row {
    display: grid;
    grid-template-columns: 56px 1fr auto;
    align-items: start;
    column-gap: 16px;
    padding: 14px 0;
    min-height: 72px;
    color: inherit;
    text-decoration: none;
  }
  @media (min-width: 768px) {
    .gt-row { grid-template-columns: 64px 1fr auto; column-gap: 20px; padding: 16px 0; }
  }
  .gt-avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--gt-mist);
    display: grid;
    place-items: center;
    flex: none;
  }
  @media (min-width: 768px) { .gt-avatar { width: 64px; height: 64px; } }
  .gt-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .gt-initials { font-weight: 700; font-size: 1.125rem; letter-spacing: 0.02em; }
  .gt-row-main { display: flex; flex-direction: column; min-width: 0; }
  .gt-row-name {
    font-weight: 700;
    font-size: 1.1875rem;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .gt-row-why { margin-top: 2px; font-size: 0.9375rem; line-height: 1.35; color: var(--gt-soft); }
  .gt-row-bar {
    display: block;
    margin-top: 8px;
    height: 6px;
    border-radius: 3px;
    background: var(--gt-mist);
    overflow: hidden;
    max-width: 280px;
  }
  .gt-row-bar span { display: block; height: 100%; background: var(--gt-ink); border-radius: 3px; }
  .gt-row-amt { margin-top: 6px; font-size: 0.9375rem; font-variant-numeric: tabular-nums; }
  .gt-row-give {
    align-self: center;
    font-weight: 700;
    font-size: 1rem;
    padding: 12px 0 12px 8px;
    text-decoration: underline;
    text-underline-offset: 4px;
    text-decoration-thickness: 2px;
  }
  .gt-row:hover .gt-row-name { text-decoration: underline; text-underline-offset: 4px; }

  /* ---- matching, sharing, close ---- */
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
  .gt-more .gt-share:focus-visible { outline-color: var(--gt-paper); }
  .gt-share-note { display: inline-block; margin-left: 14px; font-size: 1rem; }
  .gt-tag { margin-top: 20px !important; font-weight: 700; }
  .gt-close { margin-top: 56px; }
  .gt-thanks { font-weight: 700; font-size: clamp(1.25rem, 4.2vw, 1.625rem) !important; line-height: 1.35 !important; max-width: 40ch !important; }
  .gt-charity { font-size: 0.9375rem !important; opacity: 0.8; }

  @media (prefers-reduced-motion: reduce) {
    .gt-give { transition: none; }
  }
</style>
