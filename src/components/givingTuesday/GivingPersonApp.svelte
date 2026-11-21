<script>
  // /give/<slug>/ (static, give/[slug].astro, for slugs in
  // src/data/givingInstructors.json) or /give/?i=<slug> (give/index.astro; any
  // other /give/<slug> is redirected there by 404.astro): one instructor's LSP
  // Giving Tuesday page. UNLISTED, noindex.
  //
  // Takes the slug from the `slug` prop, else from ?i=, loads giving_public (live.js; dev mock via
  // ?mock=), finds the fundraiser and shows their face, name, why, their own
  // mat unrolling toward $150 (the board's treatment), the amount picker and
  // Give. Give goes to the fundraiser's own Zeffy page when set, else the
  // campaign give_url, else /donate. No slug, an unknown slug, a closed board
  // or a failed load: the campaign fallback. Never blank: SSR renders the
  // fallback, and give/index.astro hides it only while a slug is loading.
  // Copy: givingPersonCopy in src/data/givingTuesday.js. Identity: design.md
  // "Giving Tuesday".
  import { onMount } from "svelte";
  import {
    givingCopy as copy,
    givingFacts as facts,
    givingRoutes as routes,
    givingPersonCopy as pc,
    phase as phaseAt,
    money,
    progress,
    fill,
    prefillsAmount,
    withAmount,
    cleanSlug,
  } from "../../data/givingTuesday.js";
  import { instructorInitials } from "../../data/popUpShared.js";
  import { startPolling, nowOverride } from "../../lib/givingTuesday/live.js";
  import { heroOne, wallImage } from "../../data/givingTuesdayPhotos.js";

  // `slug` is set by the static per-person page /give/<slug>/ (give/[slug].astro);
  // without it the slug comes from ?i= (give/index.astro).
  let { base = "/", slug: pageSlug = "" } = $props();

  const one = wallImage(heroOne.photo, base, { one: true });

  // "idle" until the first answer, then "live" or "down".
  let status = $state("idle");
  let data = $state(null);
  let slug = $state("");
  let mounted = $state(false);
  let now = $state(Date.parse(facts.startsAt));
  let avatarFailed = $state(false);
  let seen = $state(false);

  let pick = $state(String(copy.picker.preset));
  let otherDollars = $state("");

  const campaign = $derived(data?.campaign ?? null);
  const goalCents = $derived(campaign?.goal_cents ?? facts.goalCents);
  const thresholdCents = $derived(campaign?.threshold_cents ?? facts.thresholdCents);
  const campaignUrl = $derived(campaign?.give_url || `${base}${routes.fallbackGive.replace(/^\//, "")}`);
  const ph = $derived(phaseAt(now, campaign?.starts_at ?? facts.startsAt, campaign?.ends_at ?? facts.endsAt, facts.givingDay));
  const phaseCopy = $derived(copy.phases[ph]);

  const person = $derived(
    slug && status === "live" && campaign?.board_open !== false
      ? (data?.fundraisers ?? []).find((f) => f.slug === slug) ?? null
      : null,
  );
  // What to show: "person", "loading" (slug known, no answer yet) or "fallback".
  const view = $derived(person ? "person" : mounted && slug && status === "idle" ? "loading" : "fallback");
  const notFound = $derived(view === "fallback" && !!slug && status === "live");

  const giveUrl = $derived(person?.give_url || campaignUrl);
  const external = $derived(/^https?:/i.test(giveUrl));
  const pickDollars = $derived(
    pick === "other" ? Math.max(0, Math.min(100000, Math.round(Number(otherDollars) || 0))) : Number(pick),
  );
  const prefill = $derived(prefillsAmount(giveUrl));
  const pickedUrl = $derived(withAmount(giveUrl, pickDollars));
  const pickedLabel = $derived(prefill && pickDollars > 0 ? `${copy.giveLabel} ${money(pickDollars * 100)}` : copy.giveLabel);

  const personGoal = $derived(person ? person.goal_cents || thresholdCents : thresholdCents);
  // Ring: hit the $150 drawing mark. Bar and line: hit their own goal
  // (the same thing unless they raised their goal above $150).
  const done = $derived(!!person && (person.reached || person.raised_cents >= personGoal));
  const met = $derived(!!person && (person.raised_cents >= personGoal || (person.reached && personGoal <= thresholdCents)));
  const p = $derived(person ? progress(person.raised_cents, personGoal) : 0);
  const first = $derived(String(person?.name || "").trim().split(/\s+/)[0] || "");
  const avatar = $derived(person?.avatar && !avatarFailed ? `${base}images/popup/instructors/${person.avatar}.webp` : null);

  onMount(() => {
    slug = cleanSlug(pageSlug) || cleanSlug(new URLSearchParams(window.location.search).get("i"));
    mounted = true;
    document.documentElement.classList.remove("gv-wait");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const clock = () => (now = nowOverride() ?? Date.now());
    clock();
    const tick = setInterval(clock, 30000);

    const stop = startPolling({
      intervalMs: facts.pollMs,
      onData: (d) => {
        data = d;
        status = "live";
        // Let the mat paint empty once, then unroll.
        if (!seen) requestAnimationFrame(() => requestAnimationFrame(() => (seen = true)));
        if (reduced) seen = true;
      },
      onError: () => {
        if (status !== "live") status = "down";
      },
    });
    return () => {
      stop();
      clearInterval(tick);
    };
  });
</script>

{#snippet picker()}
  <div class="gv-pick">
    <fieldset class="gv-amounts">
      <legend class="gv-sr">{copy.picker.legend}</legend>
      {#each copy.picker.amounts as a}
        <label class="gv-amt" class:gv-amt-on={pick === String(a)}>
          <input type="radio" name="gv-amount" value={String(a)} bind:group={pick} />
          <span>{money(a * 100)}</span>
        </label>
      {/each}
      <label class="gv-amt" class:gv-amt-on={pick === "other"}>
        <input type="radio" name="gv-amount" value="other" bind:group={pick} />
        <span>{copy.picker.other}</span>
      </label>
    </fieldset>
    {#if pick === "other"}
      <label class="gv-other">
        <span class="gv-sr">{copy.picker.otherLabel}</span>
        <span aria-hidden="true">$</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="number" inputmode="numeric" min="1" step="1" placeholder="Amount" bind:value={otherDollars} autofocus />
      </label>
    {/if}
    <a class="gv-give" href={pickedUrl} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>
      {pickedLabel}{#if person}<span class="gv-sr">{` through ${first}`}</span>{/if}
    </a>
  </div>
{/snippet}

<div class="gv-wrap gv-grid">
  <div class="gv-main">
    {#if view === "person"}
      <div class="gv-face" class:gv-done={done} class:gv-seen={seen} aria-hidden="true">
        {#if avatar}
          <img src={avatar} alt="" width="160" height="160" decoding="async" onerror={() => (avatarFailed = true)} />
        {:else}
          <span class="gv-initials">{instructorInitials(person.name)}</span>
        {/if}
      </div>
      <p class="gv-kicker">{pc.kicker}</p>
      <h1 class="gv-h1">{fill(pc.headline, { name: person.name, goal: money(personGoal) })}</h1>
      {#if person.why}<p class="gv-why">“{person.why}”</p>{/if}

      <div class="gv-progress" class:gv-seen={seen} class:gv-done={met} style={`--p:${p}`}>
        <span class="gv-mat" aria-hidden="true">
          <span class="gv-mat-body"></span>
          <span class="gv-mat-track"><span class="gv-mat-roll"></span></span>
        </span>
        <p class="gv-amt-line">
          {#if met}
            {money(person.raised_cents)} · <strong>{fill(copy.board.reached, { goal: money(personGoal) })}</strong>
          {:else}
            {fill(pc.raisedOf, { raised: money(person.raised_cents), goal: money(personGoal) })}
          {/if}
        </p>
      </div>

      <p class="gv-when"><strong>{phaseCopy.line}</strong> {phaseCopy.note}</p>
      <p class="gv-counts">{fill(pc.counts, { first, campaignGoal: money(goalCents) })}</p>
      {@render picker()}
    {:else if view === "loading"}
      <p class="gv-kicker">{pc.kicker}</p>
      <p class="gv-loading" role="status">&nbsp;</p>
    {:else}
      <div class="gv-ssr">
        <p class="gv-kicker">{pc.kicker}</p>
        <h1 class="gv-h1">{pc.fallbackHeadline}</h1>
        <p class="gv-sub">{copy.sub}</p>
        {#if notFound}<p class="gv-note">{pc.notFound}</p>{/if}
        <p class="gv-when"><strong>{phaseCopy.line}</strong> {phaseCopy.note}</p>
        {@render picker()}
      </div>
    {/if}

    {#if view !== "loading"}
      <p class="gv-all"><a href={`${base}${routes.page.replace(/^\//, "")}/`}>{pc.seeAll}</a></p>
    {/if}
  </div>

  <figure class="gv-photo">
    <img
      src={one.src}
      srcset={one.srcset}
      sizes="(min-width: 1024px) 40vw, 100vw"
      width={heroOne.w}
      height={heroOne.h}
      alt={heroOne.alt}
      decoding="async"
    />
  </figure>
</div>

<div class="gv-wrap gv-close">
  <p>{copy.charity} <span class="gv-nw">{facts.ein}</span></p>
</div>

<style>
  .gv-wrap { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 16px; }
  @media (min-width: 768px) { .gv-wrap { padding: 0 40px; } }
  .gv-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .gv-nw { white-space: nowrap; }

  /* Hidden only while a slug is loading (class set inline in give/index.astro,
     removed on mount or after a few seconds), so the fallback never flashes. */
  :global(html.gv-wait) .gv-ssr,
  :global(html.gv-wait) .gv-all { visibility: hidden; }

  .gv-grid { display: grid; gap: 40px; padding-top: 32px; }
  @media (min-width: 1024px) {
    .gv-grid { grid-template-columns: 7fr 5fr; gap: 72px; padding-top: 72px; align-items: start; }
  }
  .gv-main { min-width: 0; }

  .gv-face {
    position: relative;
    width: 112px;
    height: 112px;
    margin: 0 0 24px 6px;
    border-radius: 50%;
    background: var(--gt-mist);
  }
  @media (min-width: 768px) { .gv-face { width: 144px; height: 144px; } }
  .gv-face img,
  .gv-initials { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .gv-initials { font-weight: 700; font-size: 2rem; }
  /* Reaching $150: the board's yellow ring closes around the face. */
  .gv-face::after {
    content: "";
    position: absolute;
    inset: -7px;
    border-radius: 50%;
    border: 6px solid var(--gt-sun);
    opacity: 0;
    transform: scale(0.8);
  }
  .gv-face.gv-done.gv-seen::after {
    opacity: 1;
    transform: none;
    transition: opacity 0.3s 1.05s, transform 0.5s cubic-bezier(0.3, 1.5, 0.5, 1) 1.05s;
  }

  .gv-kicker { margin: 0 0 10px; font-weight: 700; font-size: clamp(1.125rem, 4vw, 1.375rem); }
  .gv-h1 {
    margin: 0;
    font-weight: 700;
    font-size: clamp(2.25rem, 9.6vw, 4.75rem);
    line-height: 1;
    letter-spacing: -0.03em;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }
  .gv-sub { margin: 16px 0 0; font-size: clamp(1.375rem, 4.4vw, 2rem); line-height: 1.2; }
  .gv-why { margin: 20px 0 0; font-size: clamp(1.25rem, 4.4vw, 1.625rem); line-height: 1.35; max-width: 34ch; }
  .gv-note { margin: 18px 0 0; font-size: 1.0625rem; line-height: 1.5; max-width: 44ch; }
  .gv-loading { min-height: 50vh; margin: 0; }

  /* The instructor's own mat, unrolling toward $150 (the board's treatment). */
  .gv-progress { --mat: #0f766e; margin-top: 32px; }
  .gv-mat {
    position: relative;
    display: block;
    height: 22px;
    max-width: 520px;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1.5px rgba(30, 30, 30, 0.3);
  }
  .gv-mat-body {
    position: absolute;
    inset: 0;
    border-radius: 4px;
    background: var(--mat);
    transform-origin: 0 50%;
    transform: scaleX(0);
  }
  .gv-mat-track { position: absolute; inset: -3px 0; transform: translateX(0); }
  .gv-mat-roll {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -6px;
    width: 12px;
    border-radius: 6px;
    background: var(--mat);
    filter: brightness(0.72);
    opacity: 0;
  }
  .gv-seen .gv-mat-body { transform: scaleX(var(--p)); transition: transform 1s cubic-bezier(0.3, 0.7, 0.3, 1); }
  .gv-seen .gv-mat-track { transform: translateX(calc(var(--p) * 100%)); transition: transform 1s cubic-bezier(0.3, 0.7, 0.3, 1); }
  .gv-seen:not(.gv-done) .gv-mat-roll { opacity: 1; transition: opacity 0.2s; }
  .gv-amt-line { margin: 12px 0 0; font-size: clamp(1.25rem, 4.6vw, 1.625rem); font-variant-numeric: tabular-nums; }
  .gv-amt-line strong { font-weight: 700; }

  .gv-when { margin: 28px 0 0; font-size: 1.0625rem; line-height: 1.5; max-width: 44ch; }
  .gv-when strong { font-weight: 700; }
  .gv-counts { margin: 10px 0 0; font-size: 1.0625rem; line-height: 1.5; max-width: 44ch; }

  /* Amount picker: the /givingtuesday tiles. */
  .gv-pick { margin-top: 28px; }
  .gv-amounts {
    border: 0;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    max-width: 720px;
  }
  @media (min-width: 700px) { .gv-amounts { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
  .gv-amt { position: relative; display: block; cursor: pointer; }
  .gv-amt input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
  .gv-amt span {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 56px;
    border-radius: 8px;
    background: var(--gt-mist);
    font-weight: 700;
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
    transition: background-color 0.15s;
  }
  .gv-amt:hover span { background: #e0dfdb; }
  .gv-amt-on span,
  .gv-amt-on:hover span { background: var(--gt-sun); }
  .gv-amt input:focus-visible + span { outline: 3px solid var(--gt-ink); outline-offset: 3px; }
  .gv-other {
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
  .gv-other:focus-within { outline: 3px solid var(--gt-ink); outline-offset: 3px; }
  .gv-other input { flex: 1; min-width: 0; border: 0; background: transparent; font: inherit; color: inherit; padding: 12px 0; outline: none; }
  .gv-give {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 20px;
    min-height: 64px;
    min-width: 200px;
    padding: 0 44px;
    border-radius: 8px;
    background: var(--gt-ink);
    color: var(--gt-paper);
    font-weight: 700;
    font-size: 1.375rem;
    text-decoration: none;
    transition: background-color 0.15s;
  }
  .gv-give:hover { background: #000; }
  .gv-give:focus-visible,
  .gv-all a:focus-visible { outline: 3px solid var(--gt-ink); outline-offset: 3px; }

  .gv-all { margin: 32px 0 0; font-size: 1.125rem; font-weight: 700; }
  .gv-all a { color: inherit; text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 2px; }

  .gv-photo { margin: 0 -16px; }
  @media (min-width: 768px) { .gv-photo { margin: 0; } }
  .gv-photo img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; }

  .gv-close { padding-top: 40px; padding-bottom: 72px; }
  .gv-close p { margin: 0; font-size: 0.9375rem; color: var(--gt-soft); }

  @media (prefers-reduced-motion: reduce) {
    .gv-amt span,
    .gv-give,
    .gv-mat-body,
    .gv-mat-track,
    .gv-mat-roll,
    .gv-face::after { transition: none !important; }
  }
</style>
