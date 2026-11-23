<script>
  // "7 days. 7 memories. 1 community." at the top of the share kit
  // (/givingtuesday/kit/?i=<slug>), Nov 23 to Nov 30, 2026 (Chicago calendar
  // days; on Nov 23 it previews Day 7; gone from Dec 1). One memory prompt a
  // day: pick a day, add a photo and a line if you like, then share or
  // download a story or post drawn here (memoryCanvas.js) and copy the
  // caption. The photo never leaves the phone; the words are kept per day in
  // localStorage. Copy: givingMemoryWeek in src/data/givingTuesday.js.
  //
  // Dev only (import.meta.env.DEV): ?now=YYYY-MM-DD (or an ISO instant) sets
  // the Chicago day, so each date can be checked.
  import { onMount } from "svelte";
  import { givingMemoryWeek as mw, givingKitCopy as kc, fill, chicagoDate, memoryDayParts, memoryWeekShowing } from "../../data/givingTuesday.js";
  import {
    ensureFonts,
    loadLogo,
    decodePhoto,
    drawMemory,
    canvasBlob,
    photoPlacement,
    MEMORY_FORMATS,
    MAX_ZOOM,
  } from "../../lib/givingTuesday/memoryCanvas.js";

  let { person, goal, link, linkText, why = "", base = "/", canShare = false } = $props();

  // ------------------------------------------------------------- the day --
  let today = $state("");
  let showing = $derived(!!today && memoryWeekShowing(today));
  let before = $derived(!!today && today < mw.days[0].date);
  let dayIdx = $state(0);
  const day = $derived(mw.days[dayIdx]);
  const dayParts = $derived(memoryDayParts(day.date));

  onMount(() => {
    let now = Date.now();
    if (import.meta.env.DEV) {
      const v = new URLSearchParams(window.location.search).get("now");
      if (v) {
        const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T18:00:00Z` : v).getTime();
        if (Number.isFinite(t)) now = t;
      }
    }
    today = chicagoDate(now);
    const i = mw.days.findIndex((d) => d.date === today);
    dayIdx = i >= 0 ? i : 0;
    try {
      const probe = new File([new Blob(["x"], { type: "image/jpeg" })], "x.jpg", { type: "image/jpeg" });
      shareFiles = !!navigator.canShare?.({ files: [probe] });
    } catch {
      shareFiles = false;
    }
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(exportTimer);
      if (exported?.url) URL.revokeObjectURL(exported.url);
    };
  });
  let shareFiles = $state(false);
  const canFiles = $derived(shareFiles);

  // ----------------------------------------------------------- the words --
  // Day 1 starts from their sign-up why, whole: when it is longer than the
  // usual limit, that day's limit is its length (it is public in full on
  // their page already).
  const whyText = $derived(String(why || "").trim());
  const MAX = $derived(day.prefillWhy && whyText.length > mw.wordsMax ? whyText.length : mw.wordsMax);
  let memory = $state("");
  const storeKey = (d) => `lsp-gt-memory-${person?.slug || "x"}-${d}`;
  function readStored(d) {
    try {
      return localStorage.getItem(storeKey(d));
    } catch {
      return null;
    }
  }
  // Load the selected day's words (or Day 1's why) when the day or person changes.
  let loadedFor = "";
  $effect(() => {
    const key = `${person?.slug}|${day.date}|${whyText}`;
    if (!showing || key === loadedFor) return;
    loadedFor = key;
    const s = readStored(day.date);
    memory = s !== null ? s.slice(0, MAX) : day.prefillWhy && whyText ? whyText : "";
  });
  function onWords(e) {
    memory = e.currentTarget.value.slice(0, MAX);
    try {
      localStorage.setItem(storeKey(day.date), memory);
    } catch {
      /* private mode: the words just aren't kept */
    }
  }
  const tip = $derived(day.prefillWhy && !whyText && day.tipNoWhy ? day.tipNoWhy : day.tip);

  // ----------------------------------------------------------- the photo --
  let photo = $state.raw(null); // canvas from decodePhoto
  let zoom = $state(1);
  let focus = $state(null); // null = the default crop (memoryCanvas)
  let photoBusy = $state(false);
  let photoError = $state("");
  let fileInput = $state(null);

  async function onFile(e) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    photoError = "";
    photoBusy = true;
    try {
      photo = await decodePhoto(file);
      zoom = 1;
      focus = null;
    } catch {
      photoError = mw.photoFailed;
    } finally {
      photoBusy = false;
    }
  }
  function removePhoto() {
    photo = null;
    zoom = 1;
    focus = null;
    photoError = "";
  }

  // --------------------------------------------------------- the drawing --
  let format = $state("story");
  let canvas = $state(null);
  let report = $state.raw(null);
  let drawFailed = $state(false);
  let assets = null;
  let ready = $state(false);

  const words = $derived({
    kicker: fill(mw.kicker, { n: day.n }),
    prompt: day.prompt,
    memory,
    invite: day.invite,
    name: String(person?.name || "").trim(),
    help: fill(mw.help, { goal }),
    link: linkText,
  });

  $effect(() => {
    if (!showing || ready || drawFailed) return;
    (async () => {
      try {
        await ensureFonts();
        assets = await loadLogo(base);
        ready = true;
      } catch {
        drawFailed = true;
      }
    })();
  });

  // Layout is cached per words + format + photo-or-not, so a drag only repaints.
  let layoutKey = "";
  let layoutCache = null;
  let raf = 0;
  function draw() {
    raf = 0;
    if (!canvas || !assets) return;
    try {
      const hasPhoto = !!photo;
      const key = JSON.stringify([format, words, hasPhoto]);
      const r = drawMemory(canvas, format, words, assets, hasPhoto ? { source: photo, zoom, focus } : null, key === layoutKey ? layoutCache : null);
      layoutKey = key;
      layoutCache = r.layout;
      report = r;
      scheduleExport();
    } catch {
      drawFailed = true;
    }
  }
  $effect(() => {
    // Track everything the image depends on.
    void [canvas, ready, format, words, photo, zoom, focus];
    if (!ready || !canvas) return;
    if (!raf) raf = requestAnimationFrame(draw);
  });

  // The JPEG is made a moment after the last change, so Share can open the
  // sheet straight from the tap (iOS wants the share call inside the gesture).
  let exported = $state.raw(null); // { key, url, file, name }
  let exportTimer = 0;
  let exportSeq = 0;
  const fileName = $derived(`lsp-giving-tuesday-day-${day.n}-${person?.slug || "kit"}-${format}.jpg`);
  function scheduleExport() {
    clearTimeout(exportTimer);
    const seq = ++exportSeq;
    exportTimer = setTimeout(() => makeExport(seq), 350);
  }
  async function makeExport(seq) {
    if (!canvas) return null;
    const name = fileName;
    const blob = await canvasBlob(canvas, "image/jpeg", 0.92);
    if (seq !== exportSeq) return null;
    if (exported?.url) URL.revokeObjectURL(exported.url);
    exported = { seq, url: URL.createObjectURL(blob), file: new File([blob], name, { type: "image/jpeg" }), name };
    return exported;
  }
  // The JPEG for the image as it is now: waits for it when a tap comes
  // before it is ready (or while it is being remade).
  async function current() {
    if (raf) {
      cancelAnimationFrame(raf);
      draw();
    }
    for (let tries = 0; tries < 6; tries++) {
      if (exported && exported.seq === exportSeq) return exported;
      clearTimeout(exportTimer);
      const ex = await makeExport(exportSeq);
      if (ex) return ex;
    }
    return exported;
  }
  async function onShareImage() {
    const ex = await current();
    if (!ex) return;
    try {
      await navigator.share({ files: [ex.file] });
    } catch {
      /* closed the sheet */
    }
  }
  async function onDownload() {
    const ex = await current();
    if (!ex) return;
    const a = document.createElement("a");
    a.href = ex.url;
    a.download = ex.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // --------------------------------------------------- dragging the photo --
  // A transparent layer over the photo window only (touch-action: none), so
  // a drag anywhere else on the preview still scrolls the page.
  const F = $derived(MEMORY_FORMATS[format]);
  const winStyle = $derived.by(() => {
    if (!report?.photoRect || !photo) return "";
    const [l, t, r, b] = report.photoRect;
    return `left:${(l / F.w) * 100}%;top:${(t / F.h) * 100}%;width:${((r - l) / F.w) * 100}%;height:${((b - t) / F.h) * 100}%`;
  });
  let dragging = null;
  function onDown(e) {
    if (!photo || !report?.photoRect) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety */
    }
    dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  function onMove(e) {
    if (!dragging || e.pointerId !== dragging.id || !canvas) return;
    const k = F.w / canvas.getBoundingClientRect().width; // css px -> canvas px
    const dx = (e.clientX - dragging.x) * k;
    const dy = (e.clientY - dragging.y) * k;
    dragging.x = e.clientX;
    dragging.y = e.clientY;
    const p = photoPlacement(photo, report.photoRect, zoom, focus);
    const next = { x: p.focus.x - dx / (p.scale * p.W), y: p.focus.y - dy / (p.scale * p.H) };
    focus = photoPlacement(photo, report.photoRect, zoom, next).focus;
  }
  function onUp(e) {
    if (dragging && e.pointerId === dragging.id) dragging = null;
  }
  // Arrow keys move the photo too (focus the window, then use the arrows).
  function onKey(e) {
    if (!photo || !report?.photoRect) return;
    const step = 0.03;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const f = photoPlacement(photo, report.photoRect, zoom, focus).focus;
    focus = photoPlacement(photo, report.photoRect, zoom, { x: f.x + d[0], y: f.y + d[1] }).focus;
  }

  // ---------------------------------------------------------- the caption --
  // {memory} is their words and a space. When they end without a full stop,
  // one is added in the caption only (the image keeps their words as typed).
  const captionMemory = $derived.by(() => {
    const t = memory.trim();
    if (!t) return "";
    return /[.!?…"”)\]]$|\p{Extended_Pictographic}️?$/u.test(t) ? `${t} ` : `${t}. `;
  });
  const caption = $derived(fill(day.caption, { memory: captionMemory, goal, link }));

  let copied = $state("");
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
    copied = key;
    setTimeout(() => {
      if (copied === key) copied = "";
    }, 2400);
  }
  async function shareText(text) {
    try {
      await navigator.share({ text });
    } catch {
      /* closed the sheet */
    }
  }

  const alt = $derived(
    `${fill(mw.previewAlt, { n: day.n, prompt: day.prompt })}${memory.trim() ? ` “${memory.trim()}”` : ""} ${words.name}. ${words.help}. ${linkText}.`,
  );
</script>

{#if showing && person}
  <section class="mw" aria-labelledby="mw-h">
    <h2 id="mw-h" class="mw-h">{mw.title}</h2>
    <p class="mw-lead">{before ? mw.leadBefore : mw.lead}</p>

    <!-- The week: seven tappable dates. -->
    <div class="mw-week" role="group" aria-label={mw.weekLabel}>
      {#each mw.days as d, i (d.date)}
        {@const p = memoryDayParts(d.date)}
        <button
          type="button"
          class="mw-date"
          class:on={i === dayIdx}
          aria-pressed={i === dayIdx}
          aria-label={`Day ${d.n}, ${p.long}${d.date === today ? `, ${mw.todayMark}` : ""}`}
          onclick={() => (dayIdx = i)}
        >
          <span class="mw-wd">{p.weekday}</span>
          <span class="mw-dn">{p.dayNum}</span>
          <span class="mw-today">{d.date === today ? mw.todayMark : ""}</span>
        </button>
      {/each}
    </div>

    <!-- The day. -->
    <div class="mw-day" aria-live="polite">
      <p class="mw-dayline">{fill(mw.dayLine, { n: day.n, date: dayParts.long })}</p>
      <h3 class="mw-title">{day.title}</h3>
      {#if day.prompt !== day.title}<p class="mw-prompt">{day.prompt}</p>{/if}
      <p class="mw-tip">{tip}</p>
    </div>

    <div class="mw-make">
      <div class="mw-inputs">
        <!-- Photo (optional). -->
        <div class="mw-field">
          <h3 class="mw-step">{mw.photoTitle}</h3>
          <input
            bind:this={fileInput}
            id="mw-file"
            class="mw-file"
            type="file"
            accept="image/*"
            onchange={onFile}
          />
          <label for="mw-file" class="mw-btn" class:mw-btn-line={!!photo}>{photo ? mw.photoChange : mw.photoAdd}</label>
          {#if photo}
            <button type="button" class="mw-text-btn" onclick={removePhoto}>{mw.photoRemove}</button>
          {/if}
          <p class="mw-note">{mw.photoNote}</p>
          {#if photoBusy}<p class="mw-note" role="status">{mw.photoOpening}</p>{/if}
          {#if photoError}<p class="mw-error" role="alert">{photoError}</p>{/if}
          {#if photo}
            <p class="mw-note">{mw.photoAdded}</p>
          {/if}
        </div>

        <!-- Words (optional). -->
        <div class="mw-field">
          <label for="mw-words" class="mw-step">{mw.wordsLabel}</label>
          <p class="mw-note" id="mw-words-note">{mw.wordsNote}</p>
          <textarea
            id="mw-words"
            class="mw-words"
            rows="4"
            maxlength={MAX}
            placeholder={day.placeholder}
            aria-describedby="mw-words-note mw-count"
            value={memory}
            oninput={onWords}
          ></textarea>
          <p class="mw-count" id="mw-count">{fill(mw.wordsCount, { n: memory.length, max: MAX })}</p>
        </div>
      </div>

      <!-- Preview, Story first. -->
      <div class="mw-preview">
        <h3 class="mw-step">{mw.shareTitle}</h3>
        <div class="mw-switch" role="group" aria-label={mw.formatLegend}>
          {#each [["story", mw.storyLabel], ["post", mw.postLabel]] as [k, label] (k)}
            <button type="button" class="mw-seg" class:on={format === k} aria-pressed={format === k} onclick={() => (format = k)}>{label}</button>
          {/each}
        </div>
        <div class="mw-frame" style={`aspect-ratio:${F.w} / ${F.h};--ar:${F.w / F.h}`}>
          {#if drawFailed}
            <span class="mw-making" role="status">{kc.imageFailed}</span>
          {:else}
            <canvas bind:this={canvas} width={F.w} height={F.h} aria-label={alt}>{alt}</canvas>
            {#if !ready}<span class="mw-making" role="status">{kc.making}</span>{/if}
            {#if photo && winStyle}
              <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
              <div
                class="mw-drag"
                style={winStyle}
                role="application"
                tabindex="0"
                aria-label={mw.photoHint}
                onpointerdown={onDown}
                onpointermove={onMove}
                onpointerup={onUp}
                onpointercancel={onUp}
                onkeydown={onKey}
              ></div>
            {/if}
          {/if}
        </div>
        {#if photo && !drawFailed}
          <p class="mw-note">{mw.photoHint}</p>
          <label class="mw-zoom">
            <span>{mw.photoZoom}</span>
            <input type="range" min="1" max={MAX_ZOOM} step="0.01" bind:value={zoom} />
          </label>
        {/if}
        {#if !drawFailed}
          <div class="mw-actions">
            {#if canFiles}
              <button type="button" class="mw-btn" onclick={onShareImage} disabled={!ready}>{kc.share}</button>
              <button type="button" class="mw-btn mw-btn-line" onclick={onDownload} disabled={!ready}>{kc.download}</button>
            {:else}
              <button type="button" class="mw-btn" onclick={onDownload} disabled={!ready}>{kc.download}</button>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Caption. -->
    <div class="mw-cap-wrap">
      <h3 class="mw-step">{mw.captionLabel}</h3>
      <p class="mw-cap">{caption}</p>
      <div class="mw-actions">
        <button type="button" class="mw-btn" onclick={() => copyText(caption, "cap")}>{copied === "cap" ? kc.copied : kc.copy}</button>
        {#if canShare}
          <button type="button" class="mw-btn mw-btn-line" onclick={() => shareText(caption)}>{kc.share}</button>
        {/if}
      </div>
      <p class="mw-note">{mw.copyLinkNote} <span class="mw-linktext">{linkText}</span></p>
      <div class="mw-actions mw-actions-tight">
        <button type="button" class="mw-btn mw-btn-line" onclick={() => copyText(link, "mwlink")}>{copied === "mwlink" ? kc.copied : kc.copyLink}</button>
      </div>
      <span class="mw-sr" role="status">{copied === "cap" || copied === "mwlink" ? kc.copied : ""}</span>
    </div>

    <!-- How to post. -->
    <div class="mw-how">
      <h3 class="mw-h3">{mw.howTitle}</h3>
      <ol>
        {#each mw.how as step}<li>{step}</li>{/each}
      </ol>
    </div>
  </section>
{/if}

<style>
  .mw { margin-top: 40px; }
  @media (min-width: 768px) { .mw { margin-top: 56px; } }
  .mw-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  .mw-h { margin: 0; font-weight: 700; font-size: clamp(1.75rem, 6.4vw, 2.75rem); line-height: 1.05; letter-spacing: -0.025em; max-width: 20ch; text-wrap: balance; }
  .mw-lead { margin: 12px 0 0; font-size: 1.1875rem; line-height: 1.45; max-width: 44ch; }

  /* The week: a plain row of seven dates. */
  .mw-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin-top: 24px; max-width: 560px; }
  .mw-date {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-height: 72px;
    min-width: 44px;
    padding: 8px 0 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--gt-ink);
    font: inherit;
    cursor: pointer;
  }
  .mw-date:hover { background: var(--gt-mist); }
  .mw-date.on { background: var(--gt-ink); color: var(--gt-paper); }
  .mw-wd { font-size: 0.875rem; line-height: 1; }
  .mw-dn { font-weight: 700; font-size: 1.5rem; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .mw-today { font-size: 0.75rem; line-height: 1; min-height: 0.75rem; font-weight: 700; }

  .mw-day { margin-top: 24px; max-width: 44rem; }
  .mw-dayline { margin: 0; font-size: 1.0625rem; color: var(--gt-soft); }
  .mw-title { margin: 6px 0 0; font-weight: 700; font-size: clamp(1.5rem, 5.6vw, 2.25rem); line-height: 1.1; letter-spacing: -0.02em; }
  .mw-prompt { margin: 10px 0 0; font-size: 1.25rem; line-height: 1.4; }
  .mw-tip { margin: 10px 0 0; font-size: 1.0625rem; line-height: 1.5; color: var(--gt-soft); max-width: 52ch; }

  .mw-make { display: grid; gap: 32px; margin-top: 32px; }
  @media (min-width: 900px) { .mw-make { grid-template-columns: minmax(0, 1fr) minmax(0, 400px); gap: 56px; align-items: start; max-width: 960px; } }
  .mw-inputs { display: grid; gap: 32px; align-content: start; }

  .mw-field { min-width: 0; }
  /* The file input stays in the page (and the tab order) but invisible; its
     label is the button. */
  .mw-file { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
  .mw-file:focus-visible + .mw-btn { outline: 3px solid var(--gt-ink); outline-offset: 3px; }
  /* The four numbered steps: plain bold text. */
  .mw-step { display: block; margin: 0 0 12px; font-weight: 700; font-size: 1.25rem; line-height: 1.25; }
  label.mw-step { margin-bottom: 0; }
  .mw-note { margin: 8px 0 0; font-size: 1rem; line-height: 1.5; color: var(--gt-soft); max-width: 52ch; }
  .mw-error { margin: 10px 0 0; font-size: 1rem; line-height: 1.5; font-weight: 700; }
  .mw-words {
    display: block;
    width: 100%;
    max-width: 560px;
    margin-top: 10px;
    padding: 12px 14px;
    border: 2px solid var(--gt-ink);
    border-radius: 8px;
    background: var(--gt-paper);
    color: var(--gt-ink);
    font: inherit;
    font-size: 1.0625rem; /* 17px: no zoom-on-focus in iOS Safari */
    line-height: 1.45;
    resize: vertical;
  }
  .mw-words:focus-visible { outline: 3px solid var(--gt-ink); outline-offset: 3px; }
  .mw-count { margin: 6px 0 0; font-size: 0.875rem; color: var(--gt-soft); font-variant-numeric: tabular-nums; }

  .mw-zoom { display: flex; align-items: center; gap: 12px; margin-top: 12px; max-width: 420px; font-weight: 700; }
  .mw-zoom input { flex: 1; min-height: 44px; accent-color: var(--gt-ink); }
  .mw-zoom input:focus-visible { outline: 3px solid var(--gt-ink); outline-offset: 3px; }

  .mw-preview { min-width: 0; }
  .mw-switch { display: flex; gap: 4px; margin-bottom: 12px; }
  .mw-seg {
    min-height: 44px;
    min-width: 88px;
    padding: 0 18px;
    border: 2px solid var(--gt-ink);
    border-radius: 8px;
    background: transparent;
    color: var(--gt-ink);
    font: inherit;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
  }
  .mw-seg.on { background: var(--gt-ink); color: var(--gt-paper); }
  .mw-frame { position: relative; width: 100%; max-width: 400px; background: var(--gt-sun); }
  /* Phones: the whole card fits on screen while dragging and zooming. */
  @media (max-width: 899px) {
    .mw-frame { width: min(100%, 400px, calc(62vh * var(--ar))); }
    @supports (height: 1svh) { .mw-frame { width: min(100%, 400px, calc(62svh * var(--ar))); } }
  }
  .mw-frame canvas { display: block; width: 100%; height: 100%; }
  .mw-making { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; text-align: center; font-weight: 700; }
  .mw-drag { position: absolute; touch-action: none; cursor: grab; }
  .mw-drag:active { cursor: grabbing; }
  .mw-drag:focus-visible { outline: 3px solid var(--gt-ink); outline-offset: -3px; }

  .mw-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-top: 16px; }
  .mw-actions-tight { margin-top: 10px; }
  .mw-btn {
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
  .mw-btn:hover { background: #000; }
  .mw-btn-line { background: transparent; color: var(--gt-ink); }
  .mw-btn-line:hover { background: var(--gt-mist); }
  .mw-btn:disabled { opacity: 0.5; cursor: default; }
  .mw-btn:focus-visible,
  .mw-seg:focus-visible,
  .mw-date:focus-visible,
  .mw-text-btn:focus-visible { outline: 3px solid var(--gt-ink); outline-offset: 3px; }
  .mw-text-btn {
    margin-left: 12px;
    min-height: 44px;
    padding: 0 4px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 700;
    font-size: 1.0625rem;
    text-decoration: underline;
    text-underline-offset: 4px;
    text-decoration-thickness: 2px;
    cursor: pointer;
  }

  .mw-cap-wrap { margin-top: 40px; max-width: 680px; }
  .mw-h3 { margin: 0; font-weight: 700; font-size: 1.375rem; line-height: 1.2; }
  .mw-cap { margin: 10px 0 0; font-size: 1.125rem; line-height: 1.5; overflow-wrap: anywhere; }
  .mw-linktext { font-weight: 700; color: var(--gt-ink); overflow-wrap: anywhere; }

  .mw-how { margin-top: 40px; max-width: 680px; }
  .mw-how ol { margin: 10px 0 0; padding-left: 1.5em; list-style: decimal; }
  .mw-how li::marker { font-weight: 700; }
  .mw-how li { margin-top: 8px; font-size: 1.0625rem; line-height: 1.5; }
</style>
