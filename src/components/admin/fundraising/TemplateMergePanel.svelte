<script>
  // "Send with a template": pick an email template, see it filled in with this
  // donor's details, copy it or open the mail app, then log it as sent so the
  // contact history stays honest. Rendered inside DonorDrawer (and anywhere
  // else a donor + template list are on hand).
  import { Check, Copy, ExternalLink, Image, Mail, Send } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Button from "../ui/Button.svelte";
  import {
    fillTemplate,
    listPlaceholders,
    mergeValuesForDonor,
  } from "../../../lib/dashboard/fundraisingCrm";

  export let donor = null;
  export let templates = [];
  export let currentUserName = "";
  export let logging = false;
  // Called with { template, subject, body } when the user logs the send.
  export let onLogSend = () => {};

  let selectedTemplateId = "";
  let copied = "";
  let copiedTimer;
  let copyErrorMessage = "";

  // Roughly where common mail apps start truncating mailto bodies.
  const MAILTO_SAFE_LENGTH = 1800;

  $: emailTemplates = templates.filter((template) => template.kind === "email");
  $: selectedTemplate =
    emailTemplates.find((template) => template.id === selectedTemplateId) || null;
  $: mergeValues = mergeValuesForDonor(donor, currentUserName);
  $: mergedSubject = selectedTemplate
    ? fillTemplate(selectedTemplate.subject || "", mergeValues)
    : "";
  $: mergedBody = selectedTemplate ? fillTemplate(selectedTemplate.body, mergeValues) : "";
  $: unresolved = listPlaceholders(`${mergedSubject}\n${mergedBody}`);
  $: mailtoHref = buildMailto(donor?.email, mergedSubject, mergedBody);
  $: mailtoMayTruncate = mailtoHref.length > MAILTO_SAFE_LENGTH;
  $: attachedImages = selectedTemplate?.image_urls || [];

  function buildMailto(email, subject, body) {
    if (!email) return "";
    const params = new URLSearchParams();
    if (subject) params.set("subject", subject);
    if (body) params.set("body", body);
    const query = params.toString().replace(/\+/g, "%20");
    return `mailto:${email}${query ? `?${query}` : ""}`;
  }

  async function copyText(label, text) {
    try {
      await navigator.clipboard.writeText(text);
      copied = label;
      copyErrorMessage = "";
      window.clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => (copied = ""), 2000);
    } catch {
      copyErrorMessage =
        "Copying isn't available in this browser. Select the text above manually.";
    }
  }

  function handleLogSend() {
    if (!selectedTemplate) return;
    onLogSend({
      template: selectedTemplate,
      subject: mergedSubject,
      body: mergedBody,
    });
  }

  // Images are embedded into the copied content itself (email-sized, ~900px).
  // Hosted-image references LOOK right but desktop Gmail's compose window
  // refuses to load pictures from outside sites, leaving an empty alt-text
  // box (live-tested 2026-07-22); embedded images render in the draft on
  // both desktop and mobile. Downscaling keeps the paste light so Gmail's
  // background attach finishes fast.
  const MAX_COPY_WIDTH = 900;

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

  // One-click whole email: merged body plus every template image embedded.
  async function copyBodyWithImages() {
    copyErrorMessage = "";
    try {
      const rendered = [];
      for (const url of attachedImages) {
        rendered.push({ url, ...(await renderEmailImage(url)) });
      }
      const html =
        `<div>${escapeHtml(mergedBody).replace(/\n/g, "<br>")}</div>` +
        rendered
          .map(
            ({ url, dataUri, width }) =>
              `<br><img src="${dataUri}" alt="${imageLabel(url)}" width="${Math.min(560, width)}" style="max-width:100%;height:auto;">`,
          )
          .join("");
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([mergedBody], { type: "text/plain" }),
        }),
      ]);
      copied = "body-images";
      window.clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => (copied = ""), 2000);
    } catch {
      copyErrorMessage =
        "Couldn't copy everything at once here. Copy the body and each image separately below.";
    }
  }

  async function copyPhoto(url, copiedKey) {
    copyErrorMessage = "";
    try {
      const { blob } = await renderEmailImage(url);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      copied = copiedKey;
      window.clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => (copied = ""), 2000);
    } catch {
      copyErrorMessage =
        "Couldn't copy that image here. Open it full size and copy it from there instead.";
    }
  }

  function imageLabel(url) {
    const file = String(url).split("/").pop() || "image";
    return file
      .replace(/\.(png|jpe?g|webp|gif)$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
  }
</script>

<section class="rounded-control border border-ink/8 bg-white p-4" aria-labelledby="template-merge-title">
  <h4 id="template-merge-title" class="font-bold text-ink">Send with a template</h4>

  {#if emailTemplates.length}
    <label class="mt-3 block">
      <span class="sr-only">Choose a template</span>
      <select class="select" bind:value={selectedTemplateId}>
        <option value="">Choose a template…</option>
        {#each emailTemplates as template (template.id)}
          <option value={template.id}>{template.category} · {template.title}</option>
        {/each}
      </select>
    </label>

    {#if selectedTemplate}
      {#if unresolved.length}
        <p class="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-amber-800">
          Still needs a human:
          {#each unresolved as token (token)}
            <Badge tone="amber" size="xs">{token}</Badge>
          {/each}
        </p>
      {/if}

      {#if mergedSubject}
        <div class="mt-3 rounded-control border border-ink/8 bg-canvas/60 px-3 py-2.5">
          <p class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Subject</p>
          <p class="mt-1 text-sm font-semibold text-ink">{mergedSubject}</p>
        </div>
      {/if}

      <div class="mt-2 max-h-64 overflow-y-auto rounded-control border border-ink/8 bg-canvas/40 px-3 py-2.5">
        <p class="whitespace-pre-wrap text-sm leading-6 text-ink/80">{mergedBody}</p>
      </div>

      {#if attachedImages.length}
        <Button
          size="sm"
          variant="primary"
          icon={copied === "body-images" ? Check : Copy}
          class="mt-3 w-full"
          onclick={copyBodyWithImages}
        >
          {copied === "body-images" ? "Copied" : "Copy body + images"}
        </Button>
      {/if}

      <div class="mt-2 grid grid-cols-2 gap-2">
        {#if mergedSubject}
          <Button
            size="sm"
            icon={copied === "subject" ? Check : Copy}
            class="w-full"
            onclick={() => copyText("subject", mergedSubject)}
          >
            {copied === "subject" ? "Copied" : "Copy subject"}
          </Button>
        {/if}
        <Button
          size="sm"
          icon={copied === "body" ? Check : Copy}
          class="w-full {mergedSubject ? '' : 'col-span-2'}"
          onclick={() => copyText("body", mergedBody)}
        >
          {copied === "body" ? "Copied" : "Copy body"}
        </Button>
        {#if mailtoHref}
          <Button size="sm" icon={Mail} href={mailtoHref} class="w-full">
            Open in email app
          </Button>
        {/if}
        <Button
          size="sm"
          variant="primary"
          icon={Send}
          class="w-full {mailtoHref ? '' : 'col-span-2'}"
          loading={logging}
          onclick={handleLogSend}
        >
          Log as sent
        </Button>
      </div>
      {#if attachedImages.length}
        <div class="mt-3 space-y-2">
          <p class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
            <Image class="h-3.5 w-3.5" aria-hidden="true" />
            Or paste each one separately
          </p>
          {#each attachedImages as url, index (url)}
            <div class="rounded-control border border-ink/8 bg-canvas/40 p-2">
              <img
                src={url}
                alt={imageLabel(url)}
                class="max-h-56 w-full rounded object-contain"
              />
              <div class="mt-2 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  icon={copied === `image-${index}` ? Check : Copy}
                  class="w-full"
                  onclick={() => copyPhoto(url, `image-${index}`)}
                >
                  {copied === `image-${index}` ? "Copied" : "Copy image"}
                </Button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-control border border-ink/14 px-3 text-sm font-bold text-ink transition hover:border-accent/40 hover:text-accent-strong"
                >
                  <ExternalLink class="h-4 w-4" aria-hidden="true" />
                  Open full size
                </a>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if attachedImages.length}
        <p class="mt-2 text-xs leading-5 text-ink/50">
          "Copy body + images" drops the whole email (words and pictures) in
          one paste. After pasting, give the draft a few seconds until the
          pictures are fully visible before you send; your email app attaches
          them in the background.
        </p>
      {/if}
      {#if copyErrorMessage}
        <p class="mt-2 text-xs font-semibold leading-5 text-red-700">{copyErrorMessage}</p>
      {/if}
      {#if mailtoMayTruncate}
        <p class="mt-2 text-xs leading-5 text-amber-800">
          Long template: some email apps cut off the pasted text when opening
          from a link. If the draft looks short, use "Copy body" instead.
        </p>
      {/if}
      <p class="mt-2 text-xs leading-5 text-ink/50">
        "Log as sent" adds an email entry to the contact log (and updates any
        outreach lists this donor is on) without sending anything itself.
      </p>
    {/if}
  {:else}
    <p class="mt-2 text-sm leading-6 text-ink/55">
      No email templates in the library yet. Add one in the Templates tab.
    </p>
  {/if}
</section>
