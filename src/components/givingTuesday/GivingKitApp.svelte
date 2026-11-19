<script>
  // /givingtuesday/kit/?i=<slug>: an instructor's LSP Giving Tuesday share
  // kit, made for a phone. UNLISTED, noindex.
  //
  // Their short link (/give/<slug>) with Copy, three first-person captions
  // with Copy (and Share where the browser has a share sheet), and two images,
  // 1080x1350 feed and 1080x1920 story, as JPEGs to download or share.
  // Images: for instructors in src/data/givingInstructors.json, the files
  // scripts/render-giving-instructor-kit.mjs pre-renders with their photo,
  // name and why (public/images/givingtuesday/give/<slug>-post.jpg, -story.jpg;
  // `npm run giving:cards`). Anyone approved since that last run, or a file
  // that fails to load: drawn here on a canvas (kitCanvas.js), words only.
  // No slug, or one not on the board: a name picker built from the approved
  // fundraisers the RPC returns.
  // Copy: givingKitCopy in src/data/givingTuesday.js. Identity: design.md
  // "Giving Tuesday".
  import { onMount } from "svelte";
  import {
    givingFacts as facts,
    givingRoutes as routes,
    givingKitCopy as kc,
    givingJoinCopy as jc,
    money,
    fill,
    shortLink,
    cleanSlug,
  } from "../../data/givingTuesday.js";
  import { fetchGivingPublic } from "../../lib/givingTuesday/live.js";
  import instructors from "../../data/givingInstructors.json";
  import { ensureFonts, loadAssets, drawKit, canvasBlob } from "../../lib/givingTuesday/kitCanvas.js";

  let { base = "/" } = $props();

  let status = $state("idle"); // idle | live | down
  let data = $state(null);
  let slug = $state("");
  let mounted = $state(false);
  let copiedKey = $state("");
  let canShare = $state(false);
  let canShareFiles = $state(false);
  // { feed: { url, file } | null, story: ... }
  let images = $state({ feed: null, story: null });
  let imageError = $state(false);
  // Which kind of image is showing: "file" (pre-rendered) or "canvas".
  let imageKind = $state("");
  const listed = new Map(instructors.map((p) => [p.slug, p]));

  const campaign = $derived(data?.campaign ?? null);
  const fundraisers = $derived(
    [...(data?.fundraisers ?? [])].sort((a, b) => String(a.name).localeCompare(String(b.name))),
  );
  const person = $derived(slug ? fundraisers.find((f) => f.slug === slug) ?? null : null);
  const first = $derived(String(person?.name || "").trim().split(/\s+/)[0] || "");
  const goal = $derived(money(person?.goal_cents || campaign?.threshold_cents || facts.thresholdCents));
  const campaignGoal = $derived(money(campaign?.goal_cents ?? facts.goalCents));
  const link = $derived(person ? shortLink(person.slug) : "");
  const linkText = $derived(person ? shortLink(person.slug, { scheme: false }) : "");
  const captions = $derived(person ? kc.captions.map((c) => fill(c, { goal, campaignGoal, link })) : []);
  const prize = $derived(campaign?.prize_label || "");

  // Dev only: carry the mock params onto the /give link so it works locally.
  let devQuery = $state("");
  const pageHref = $derived(person ? `${base}${routes.give.replace(/^\//, "")}/?i=${encodeURIComponent(person.slug)}${devQuery}` : "");

  onMount(() => {
    const q = new URLSearchParams(window.location.search);
    slug = cleanSlug(q.get("i"));
    if (import.meta.env.DEV) {
      q.delete("i");
      const rest = q.toString();
      devQuery = rest ? `&${rest}` : "";
    }
    canShare = typeof navigator.share === "function";
    try {
      const probe = new File([new Blob(["x"], { type: "image/jpeg" })], "x.jpg", { type: "image/jpeg" });
      canShareFiles = !!navigator.canShare?.({ files: [probe] });
    } catch {
      canShareFiles = false;
    }
    mounted = true;
    load();
    return () => revoke();
  });

  async function load() {
    status = "idle";
    try {
      data = await fetchGivingPublic();
      status = "live";
    } catch {
      status = "down";
    }
  }

  function choose(e) {
    const v = cleanSlug(e.currentTarget.value);
    slug = v;
    const u = new URL(window.location.href);
    if (v) u.searchParams.set("i", v);
    else u.searchParams.delete("i");
    history.replaceState(null, "", u);
    if (v) window.scrollTo({ top: 0 });
  }

  function revoke() {
    for (const k of ["feed", "story"]) if (images[k]?.url) URL.revokeObjectURL(images[k].url);
  }

  // Draw both images whenever the person changes.
  let drawn = "";
  $effect(() => {
    const f = person;
    const key = f ? `${f.slug}|${first}|${goal}` : "";
    if (!mounted || key === drawn) return;
    drawn = key;
    revoke();
    images = { feed: null, story: null };
    imageError = false;
    imageKind = "";
    if (!f) return;
    const words = {
      kicker: kc.image.kicker,
      lines: kc.image.lines.map((l) => fill(l, { goal })),
      sign: String(f.name || "").trim(),
      date: kc.image.date,
      link: linkText,
    };
    (async () => {
      // Pre-rendered files first.
      if (listed.has(f.slug)) {
        try {
          const out = {};
          for (const [format, file] of [["feed", "post"], ["story", "story"]]) {
            const res = await fetch(`${base}images/givingtuesday/give/${encodeURIComponent(f.slug)}-${file}.jpg`);
            if (!res.ok || !String(res.headers.get("content-type") || "").startsWith("image/")) throw new Error("no file");
            const blob = await res.blob();
            const name = `lsp-giving-tuesday-${f.slug}-${format}.jpg`;
            out[format] = { url: URL.createObjectURL(blob), file: new File([blob], name, { type: "image/jpeg" }), name };
          }
          if (drawn !== key) {
            URL.revokeObjectURL(out.feed.url);
            URL.revokeObjectURL(out.story.url);
            return;
          }
          imageKind = "file";
          images = out;
          return;
        } catch {
          /* fall back to the canvas */
        }
      }
      try {
        await ensureFonts();
        const assets = await loadAssets(base);
        const out = {};
        for (const format of ["feed", "story"]) {
          const canvas = document.createElement("canvas");
          drawKit(canvas, format, words, assets);
          const blob = await canvasBlob(canvas);
          const name = `lsp-giving-tuesday-${f.slug}-${format}.jpg`;
          out[format] = { url: URL.createObjectURL(blob), file: new File([blob], name, { type: "image/jpeg" }), name };
        }
        if (drawn !== key) {
          URL.revokeObjectURL(out.feed.url);
          URL.revokeObjectURL(out.story.url);
          return;
        }
        imageKind = "canvas";
        images = out;
      } catch {
        if (drawn === key) imageError = true;
      }
    })();
  });

  async function copyText(text, key) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* nothing else to try */
      }
      ta.remove();
    }
    copiedKey = key;
    setTimeout(() => {
      if (copiedKey === key) copiedKey = "";
    }, 2400);
  }
  async function shareText(text) {
    try {
      await navigator.share({ text });
    } catch {
      /* closed the sheet */
    }
  }
  async function shareImage(img) {
    try {
      await navigator.share({ files: [img.file] });
    } catch {
      /* closed the sheet */
    }
  }
</script>

<div class="gk-wrap">
  {#if person}
    <h1 class="gk-h1">{fill(kc.headline, { first })}</h1>

    <!-- ------------------------------ link ------------------------------ -->
    <section class="gk-sec" aria-labelledby="gk-link-h">
      <h2 id="gk-link-h" class="gk-h2">{kc.linkTitle}</h2>
      <p class="gk-link">{linkText.slice(0, linkText.lastIndexOf("/") + 1)}<wbr />{linkText.slice(linkText.lastIndexOf("/") + 1)}</p>
      <p class="gk-note">{kc.linkNote}</p>
      <div class="gk-actions">
        <button type="button" class="gk-btn" onclick={() => copyText(link, "link")}>
          {copiedKey === "link" ? kc.copied : kc.copyLink}
        </button>
        {#if canShare}
          <button type="button" class="gk-btn gk-btn-line" onclick={() => navigator.share({ url: link }).catch(() => {})}>{kc.share}</button>
        {/if}
        <a class="gk-text-link" href={pageHref}>{kc.openPage}</a>
      </div>
      <span class="gk-sr" role="status">{copiedKey === "link" ? kc.copied : ""}</span>
    </section>

    <!-- ---------------------------- captions ---------------------------- -->
    <section class="gk-sec" aria-labelledby="gk-cap-h">
      <h2 id="gk-cap-h" class="gk-h2">{kc.captionsTitle}</h2>
      <ol class="gk-caps">
        {#each captions as c, i}
          <li>
            <p class="gk-cap">{c}</p>
            <div class="gk-actions">
              <button type="button" class="gk-btn" onclick={() => copyText(c, `cap${i}`)}>
                {copiedKey === `cap${i}` ? kc.copied : kc.copy}
              </button>
              {#if canShare}
                <button type="button" class="gk-btn gk-btn-line" onclick={() => shareText(c)}>{kc.share}</button>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
      <span class="gk-sr" role="status">{copiedKey.startsWith("cap") ? kc.copied : ""}</span>
    </section>

    <!-- ----------------------------- images ----------------------------- -->
    <section class="gk-sec" aria-labelledby="gk-img-h">
      <h2 id="gk-img-h" class="gk-h2">{kc.imagesTitle}</h2>
      <p class="gk-note">{kc.imagesNote}</p>
      <div class="gk-imgs">
        {#each [["feed", kc.feedLabel, 1080, 1350], ["story", kc.storyLabel, 1080, 1920]] as [k, label, w, h] (k)}
          {@const img = images[k]}
          <figure class="gk-img">
            <div class="gk-frame" style={`aspect-ratio:${w} / ${h}`}>
              {#if img}
                <img src={img.url} width={w} height={h} alt={fill(imageKind === "file" && listed.get(person.slug)?.avatar ? kc.imageAltPhoto : kc.imageAlt, { name: person.name, goal, link: linkText })} />
              {:else}
                <span class="gk-making" role="status">{imageError ? kc.imageFailed : kc.making}</span>
              {/if}
            </div>
            <figcaption>{label}</figcaption>
            {#if img}
              <div class="gk-actions">
                <a class="gk-btn" href={img.url} download={img.name}>{kc.download}</a>
                {#if canShareFiles}
                  <button type="button" class="gk-btn gk-btn-line" onclick={() => shareImage(img)}>{kc.share}</button>
                {/if}
              </div>
            {/if}
          </figure>
        {/each}
      </div>
    </section>

    <section class="gk-sec gk-facts">
      {#if prize}
        <p>{jc.steps[2]}</p>
        <p>{fill(jc.prize, { prize })}</p>
      {/if}
      <p>{jc.steps[3]}</p>
    </section>

    {#if fundraisers.length > 1}
      <section class="gk-sec">
        <label class="gk-pick-label" for="gk-pick">{kc.notYou}</label>
        <select id="gk-pick" class="gk-select" value={slug} onchange={choose}>
          {#each fundraisers as f (f.slug)}
            <option value={f.slug}>{f.name}</option>
          {/each}
        </select>
      </section>
    {/if}
  {:else}
    <h1 class="gk-h1">{kc.headlineNone}</h1>
    {#if !mounted || status === "idle"}
      <p class="gk-lead" role="status">{kc.loading}</p>
    {:else if status === "down"}
      <p class="gk-lead">{kc.down}</p>
      <button type="button" class="gk-btn gk-top" onclick={load}>{kc.retry}</button>
    {:else if fundraisers.length === 0}
      <p class="gk-lead">{kc.empty}</p>
    {:else}
      {#if slug}<p class="gk-lead">{kc.notFound}</p>{:else}<p class="gk-lead">{kc.pickLead}</p>{/if}
      <label class="gk-pick-label" for="gk-pick">{kc.pickLabel}</label>
      <select id="gk-pick" class="gk-select" value="" onchange={choose}>
        <option value="" disabled>{kc.pickPlaceholder}</option>
        {#each fundraisers as f (f.slug)}
          <option value={f.slug}>{f.name}</option>
        {/each}
      </select>
    {/if}
  {/if}
</div>

<style>
  .gk-wrap { width: 100%; max-width: 1200px; margin: 0 auto; padding: 32px 16px 96px; }
  @media (min-width: 768px) { .gk-wrap { padding: 72px 40px 128px; } }
  .gk-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  .gk-h1 {
    margin: 0;
    font-weight: 700;
    font-size: clamp(2.25rem, 9.6vw, 4.75rem);
    line-height: 1;
    letter-spacing: -0.03em;
    max-width: 16ch;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }
  .gk-lead { margin: 20px 0 0; font-size: clamp(1.25rem, 4vw, 1.625rem); line-height: 1.35; max-width: 36ch; }
  .gk-sec { margin-top: 56px; }
  @media (min-width: 768px) { .gk-sec { margin-top: 80px; } }
  .gk-h2 { margin: 0; font-weight: 700; font-size: clamp(1.75rem, 6.4vw, 2.75rem); line-height: 1.05; letter-spacing: -0.025em; }
  .gk-note { margin: 10px 0 0; font-size: 1.0625rem; line-height: 1.5; max-width: 52ch; }

  /* The link itself, big. */
  .gk-link {
    margin: 14px 0 0;
    font-weight: 700;
    font-size: clamp(1.125rem, 5vw, 2rem);
    line-height: 1.25;
    letter-spacing: -0.01em;
    overflow-wrap: break-word;
  }

  .gk-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-top: 16px; }
  .gk-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 52px;
    min-width: 120px;
    padding: 0 28px;
    border: 2px solid var(--gt-ink);
    border-radius: 8px;
    background: var(--gt-ink);
    color: var(--gt-paper);
    font: inherit;
    font-weight: 700;
    font-size: 1.0625rem;
    text-decoration: none;
    cursor: pointer;
  }
  .gk-btn:hover { background: #000; }
  .gk-btn-line { background: transparent; color: var(--gt-ink); }
  .gk-btn-line:hover { background: var(--gt-mist); }
  .gk-top { margin-top: 20px; }
  .gk-btn:focus-visible,
  .gk-text-link:focus-visible,
  .gk-select:focus-visible { outline: 3px solid var(--gt-ink); outline-offset: 3px; }
  .gk-text-link {
    color: inherit;
    font-weight: 700;
    font-size: 1.0625rem;
    padding: 12px 0;
    text-decoration: underline;
    text-underline-offset: 4px;
    text-decoration-thickness: 2px;
  }

  .gk-caps { list-style: none; margin: 8px 0 0; padding: 0; max-width: 680px; }
  .gk-caps li { margin-top: 32px; }
  .gk-cap { margin: 0; font-size: 1.1875rem; line-height: 1.5; overflow-wrap: anywhere; }

  .gk-imgs { display: grid; gap: 48px; margin-top: 24px; }
  @media (min-width: 768px) { .gk-imgs { grid-template-columns: 1fr 1fr; gap: 40px; max-width: 900px; align-items: start; } }
  .gk-img { margin: 0; }
  .gk-frame { position: relative; width: 100%; max-width: 420px; background: var(--gt-sun); }
  .gk-frame img { display: block; width: 100%; height: 100%; }
  .gk-making { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; text-align: center; font-weight: 700; }
  .gk-img figcaption { margin-top: 10px; font-size: 1rem; color: var(--gt-soft); }

  .gk-facts p { margin: 0 0 0.8em; font-size: 1.0625rem; line-height: 1.5; max-width: 52ch; }

  .gk-pick-label { display: block; margin-top: 28px; font-weight: 700; font-size: 1.125rem; }
  .gk-sec .gk-pick-label { margin-top: 0; }
  .gk-select {
    display: block;
    width: 100%;
    max-width: 420px;
    margin-top: 10px;
    min-height: 56px;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    background: var(--gt-mist);
    color: var(--gt-ink);
    font: inherit;
    font-size: 1.125rem;
  }
</style>
