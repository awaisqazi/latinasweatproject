<script>
  // Volunteer-facing gala invite kit: fill in two names, copy the finished
  // email (text + hosted images) in one click, paste into any email app.
  // No login, no tracking. The canonical editable copy of this template lives
  // in the admin dashboard's Fundraising → Templates tab; if the team changes
  // it there, mirror the change here.
  const SUBJECT =
    "Your invitation: The Latina Sweat Project Annual Gala · September 25";

  const BODY = `Dear [First Name],

It is my privilege to invite you to The Latina Sweat Project's Annual Gala, held this year at one of our city's great cultural landmarks: the Museum of Contemporary Art Chicago. For one night, this extraordinary space is ours, and we would be honored to have you in the room.

Friday, September 25, 2026 · six o'clock in the evening until midnight
Museum of Contemporary Art Chicago · 220 East Chicago Avenue · Black tie

The evening begins with cocktails and live music as the galleries glow around us, followed by a seated three-course dinner and a live auction in support of our mission. From nine o'clock the museum is ours after dark: open galleries and an open bar until midnight, an awards presentation honoring the leaders who carry this work forward, a fourth-floor fashion show, and dancing with a live DJ to close the night.

Your support is part of how we got here. [Add a personal line about their giving or connection to LSP.] Every seat and every sponsorship funds accessible wellness across Chicago, along with the 200-hour teacher training scholarships that turn our own participants into certified instructors and community leaders.

Seats are limited and sponsorships close on September 15. Reserve your evening at latinasweatproject.com/gala. I would be honored to welcome you to the museum this fall, and prouder still to have you standing beside us as we build what comes next.

Con luz y amor,
[Your Name]
The Latina Sweat Project

P.S. Your formal invitation and an overview of the evening are below.`;

  const IMAGES = [
    {
      src: "/images/gala/gala-2026-invite-letter.png",
      alt: "Formal invitation letter to The Latina Sweat Project Annual Gala",
      label: "Formal invitation",
    },
    {
      src: "/images/gala/gala-2026-evening-overview.png",
      alt: "Overview of the gala evening: timeline from cocktail hour to last dance",
      label: "Evening overview",
    },
  ];

  import { onMount } from "svelte";

  const PERSONAL_LINE_PLACEHOLDER =
    "[Add a personal line about their giving or connection to LSP.]";
  // The sender's name is the one thing that stays constant across invites,
  // so remember it on this device. Guest name and personal line reset per
  // invite on purpose.
  const SENDER_STORAGE_KEY = "lsp-gala-invite-sender";

  let guestName = "";
  let senderName = "";
  let personalLine = "";
  // Reactive statements run before onMount, so gate persistence until the
  // stored value has been loaded or the initial empty value would erase it.
  let senderLoaded = false;

  onMount(() => {
    try {
      senderName = localStorage.getItem(SENDER_STORAGE_KEY) || "";
    } catch {
      // Private browsing can block storage; the field just starts empty.
    }
    senderLoaded = true;
  });

  $: if (senderLoaded) persistSenderName(senderName);

  function persistSenderName(value) {
    try {
      if (value.trim()) {
        localStorage.setItem(SENDER_STORAGE_KEY, value.trim());
      } else {
        localStorage.removeItem(SENDER_STORAGE_KEY);
      }
    } catch {
      // Storage unavailable; nothing to persist.
    }
  }
  let copied = "";
  let copiedTimer;
  let copyError = "";

  $: mergedSubject = fillTemplate(SUBJECT, guestName, senderName, personalLine);
  $: mergedBody = fillTemplate(BODY, guestName, senderName, personalLine);
  $: bodySegments = mergedBody
    .split(/(\[[^\][]+\])/g)
    .map((part) => ({ text: part, isPlaceholder: /^\[[^\][]+\]$/.test(part) }));
  $: remaining = [
    ...new Set(`${mergedSubject}\n${mergedBody}`.match(/\[[^\][]+\]/g) || []),
  ];

  function fillTemplate(text, guest, sender, personal) {
    let out = text;
    if (guest.trim()) out = out.replaceAll("[First Name]", guest.trim());
    if (sender.trim()) out = out.replaceAll("[Your Name]", sender.trim());
    if (personal.trim()) {
      out = out.replaceAll(PERSONAL_LINE_PLACEHOLDER, personal.trim());
    }
    return out;
  }

  function markCopied(key) {
    copied = key;
    copyError = "";
    window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => (copied = ""), 2000);
  }

  function failCopy() {
    copyError =
      "Copying isn't available in this browser. Select the text manually, or try Chrome or Safari.";
  }

  async function copySubject() {
    try {
      await navigator.clipboard.writeText(mergedSubject);
      markCopied("subject");
    } catch {
      failCopy();
    }
  }

  async function copyBodyText() {
    try {
      await navigator.clipboard.writeText(mergedBody);
      markCopied("body");
    } catch {
      failCopy();
    }
  }

  // Photos are copied as real (email-sized) pictures. Gmail's compose window
  // refuses to display images hosted on outside sites, so linking to the
  // hosted files is out; and full-resolution pastes upload so slowly that a
  // quick send can corrupt the draft. Scaling to ~900px keeps the upload
  // near-instant, which closes that gap.
  const MAX_COPY_WIDTH = 900;

  // Downscale an image to email size and return both a PNG blob and data URI.
  async function renderEmailImage(src) {
    const el = new window.Image();
    el.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      el.onload = resolve;
      el.onerror = () => reject(new Error("load"));
      el.src = src;
    });

    const scale = Math.min(1, MAX_COPY_WIDTH / el.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(el.naturalWidth * scale);
    canvas.height = Math.round(el.naturalHeight * scale);
    canvas.getContext("2d").drawImage(el, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("encode");
    return { blob, dataUri: canvas.toDataURL("image/png"), width: canvas.width };
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // One-click whole email: merged text plus both photos embedded directly in
  // the copied content (no reference back to the website, so desktop Gmail's
  // compose window can show them; nothing external to load on mobile either).
  async function copyEverything() {
    copyError = "";
    try {
      const rendered = [];
      for (const image of IMAGES) {
        rendered.push({ image, ...(await renderEmailImage(image.src)) });
      }
      const html =
        `<div>${escapeHtml(mergedBody).replace(/\n/g, "<br>")}</div>` +
        rendered
          .map(
            ({ image, dataUri, width }) =>
              `<br><img src="${dataUri}" alt="${image.alt}" width="${Math.min(560, width)}" style="max-width:100%;height:auto;">`,
          )
          .join("");
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([mergedBody], { type: "text/plain" }),
        }),
      ]);
      markCopied("everything");
    } catch {
      copyError =
        "Couldn't copy everything at once in this browser. Use the buttons below to copy the text and each photo separately.";
    }
  }

  async function copyPhoto(image, key) {
    copyError = "";
    try {
      const { blob } = await renderEmailImage(image.src);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      markCopied(key);
    } catch {
      copyError =
        "Couldn't copy that photo here. Open it full size (click the preview) and copy it from there instead.";
    }
  }
</script>

<section class="mx-auto w-full max-w-3xl px-4 pb-16">
  <div class="rounded-2xl border border-[#ffbd59]/25 bg-[#16213a] p-5 shadow-xl sm:p-7">
    <h2 class="text-lg font-bold text-[#ffbd59]">1 · Make it personal</h2>
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <label class="block">
        <span class="text-xs font-bold uppercase tracking-[0.14em] text-white/60">
          Guest's first name
        </span>
        <input
          type="text"
          class="mt-1.5 w-full rounded-lg border border-white/15 bg-[#101a2c] px-3 py-2.5 text-white placeholder-white/30 focus:border-[#ffbd59] focus:outline-none"
          placeholder="e.g. Maria"
          bind:value={guestName}
        />
      </label>
      <label class="block">
        <span class="text-xs font-bold uppercase tracking-[0.14em] text-white/60">
          Your name (how you sign it)
        </span>
        <input
          type="text"
          class="mt-1.5 w-full rounded-lg border border-white/15 bg-[#101a2c] px-3 py-2.5 text-white placeholder-white/30 focus:border-[#ffbd59] focus:outline-none"
          placeholder="e.g. Ana Lopez"
          bind:value={senderName}
        />
      </label>
      <label class="block sm:col-span-2">
        <span class="text-xs font-bold uppercase tracking-[0.14em] text-white/60">
          A personal line about them (goes right into the letter)
        </span>
        <textarea
          rows="2"
          class="mt-1.5 w-full rounded-lg border border-white/15 bg-[#101a2c] px-3 py-2.5 text-white placeholder-white/30 focus:border-[#ffbd59] focus:outline-none"
          placeholder="e.g. Your support of our teacher training scholarships last year helped four new instructors graduate."
          bind:value={personalLine}
        ></textarea>
      </label>
    </div>

    {#if remaining.length}
      <p class="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-amber-300">
        Still needs a human touch:
        {#each remaining as token (token)}
          <span class="rounded bg-amber-300/15 px-1.5 py-0.5">{token}</span>
        {/each}
      </p>
    {/if}

    <h2 class="mt-7 text-lg font-bold text-[#ffbd59]">2 · Copy it</h2>
    <button
      type="button"
      class="mt-3 w-full rounded-lg bg-[#ffbd59] px-3 py-3 text-sm font-bold text-[#101a2c] transition hover:brightness-105"
      onclick={copyEverything}
    >
      {copied === "everything" ? "Copied ✓" : "Copy email + both photos"}
    </button>
    <p class="mt-2 text-xs leading-5 text-white/50">
      One paste drops the whole invitation into your email: words and photos
      together. Or copy the pieces separately below.
    </p>
    <div class="mt-3 grid gap-2 sm:grid-cols-2">
      <button
        type="button"
        class="rounded-lg border border-white/20 px-3 py-2.5 text-sm font-bold text-white transition hover:border-[#ffbd59] hover:text-[#ffbd59]"
        onclick={copySubject}
      >
        {copied === "subject" ? "Copied ✓" : "Copy subject line"}
      </button>
      <button
        type="button"
        class="rounded-lg bg-[#ffbd59] px-3 py-2.5 text-sm font-bold text-[#101a2c] transition hover:brightness-105"
        onclick={copyBodyText}
      >
        {copied === "body" ? "Copied ✓" : "Copy email text"}
      </button>
    </div>

    <h2 class="mt-7 text-lg font-bold text-[#ffbd59]">3 · Copy each photo</h2>
    <p class="mt-2 text-sm leading-6 text-white/70">
      Paste the email text first, click at the very end of it (after the
      P.S.), then copy and paste each photo below, one at a time.
    </p>
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      {#each IMAGES as image, index (image.src)}
        <figure class="rounded-lg border border-white/10 bg-[#101a2c] p-3">
          <a href={image.src} target="_blank" rel="noreferrer">
            <img
              src={image.src}
              alt={image.alt}
              class="w-full rounded-lg border border-white/10"
              loading="lazy"
            />
          </a>
          <figcaption class="mt-2 text-center text-xs text-white/50">{image.label}</figcaption>
          <button
            type="button"
            class="mt-2 w-full rounded-lg border border-white/20 px-3 py-2.5 text-sm font-bold text-white transition hover:border-[#ffbd59] hover:text-[#ffbd59]"
            onclick={() => copyPhoto(image, `photo-${index}`)}
          >
            {copied === `photo-${index}` ? "Copied ✓" : `Copy ${image.label.toLowerCase()}`}
          </button>
        </figure>
      {/each}
    </div>
    {#if copyError}
      <p class="mt-2 text-sm font-semibold text-red-300">{copyError}</p>
    {/if}
    <p class="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2.5 text-xs leading-5 text-amber-200">
      Before you hit send: give the draft a few seconds until both photos are
      fully visible. Your email app is attaching them in the background, and
      sending too fast can cut them off.
    </p>

    <h2 class="mt-7 text-lg font-bold text-[#ffbd59]">Preview</h2>
    <div class="mt-3 rounded-lg border border-white/10 bg-[#101a2c] px-4 py-3">
      <p class="text-xs font-bold uppercase tracking-[0.14em] text-white/50">Subject</p>
      <p class="mt-1 text-sm font-semibold text-white">{mergedSubject}</p>
    </div>
    <div class="mt-2 rounded-lg border border-white/10 bg-[#101a2c] px-4 py-3">
      <p class="whitespace-pre-wrap text-sm leading-6 text-white/85">{#each bodySegments as segment}{#if segment.isPlaceholder}<mark class="rounded bg-amber-300/20 px-1 py-0.5 font-semibold text-amber-200">{segment.text}</mark>{:else}{segment.text}{/if}{/each}</p>
      <p class="mt-3 border-t border-white/10 pt-3 text-xs text-white/50">
        + the two photos from step 3, pasted underneath.
      </p>
    </div>
  </div>
</section>
